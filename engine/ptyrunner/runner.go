//go:build !js

package ptyrunner

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/x/vt"
	"github.com/charmbracelet/x/xpty"
	"github.com/fsnotify/fsnotify"
)

type Status struct {
	State       string `json:"state"` // "idle", "building", "running", "error", "stopped"
	Dir         string `json:"dir"`
	Cols        int    `json:"cols"`
	Rows        int    `json:"rows"`
	PID         int    `json:"pid,omitempty"`
	LastBuildMs int64  `json:"lastBuildMs,omitempty"`
	Error       string `json:"error,omitempty"`
	UpdatedAt   string `json:"updatedAt"`
}

type Runner struct {
	mu       sync.Mutex
	dir      string
	cols     int
	rows     int
	status   Status
	pty      xpty.Pty
	cmd      *exec.Cmd
	emu      *vt.SafeEmulator
	watcher  *fsnotify.Watcher
	cancel   context.CancelFunc
	onOutput func(chunk []byte)
	onStatus func(Status)
	ringBuf  []byte
}

const maxRingBufferBytes = 64 * 1024

func NewRunner(onOutput func([]byte), onStatus func(Status)) *Runner {
	return &Runner{
		cols:     82,
		rows:     24,
		emu:      vt.NewSafeEmulator(82, 24),
		onOutput: onOutput,
		onStatus: onStatus,
		status: Status{
			State:     "idle",
			Cols:      82,
			Rows:      24,
			UpdatedAt: time.Now().UTC().Format(time.RFC3339),
		},
	}
}

func (r *Runner) Status() Status {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.status
}

func (r *Runner) BufferSnapshot() string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if len(r.ringBuf) > 0 {
		return string(r.ringBuf)
	}
	if r.emu != nil {
		return r.emu.Render()
	}
	return ""
}

func (r *Runner) ScreenANSI() string {
	r.mu.Lock()
	emu := r.emu
	r.mu.Unlock()
	if emu == nil {
		return ""
	}
	return emu.Render()
}

func (r *Runner) emitStatusLocked(state string, buildMs int64, pid int, errMsg string) {
	r.status = Status{
		State:       state,
		Dir:         r.dir,
		Cols:        r.cols,
		Rows:        r.rows,
		PID:         pid,
		LastBuildMs: buildMs,
		Error:       errMsg,
		UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
	}
	st := r.status
	cb := r.onStatus
	if cb != nil {
		go cb(st)
	}
}

func (r *Runner) Start(dir string, cols, rows int) (Status, error) {
	absDir, err := filepath.Abs(strings.TrimSpace(dir))
	if err != nil {
		return r.Status(), err
	}
	info, err := os.Stat(absDir)
	if err != nil || !info.IsDir() {
		return r.Status(), fmt.Errorf("project directory does not exist: %s", absDir)
	}

	if err := r.Stop(); err != nil {
		return r.Status(), err
	}

	if cols < 20 {
		cols = 80
	}
	if rows < 6 {
		rows = 24
	}

	ctx, cancel := context.WithCancel(context.Background())

	r.mu.Lock()
	r.dir = absDir
	r.cols = cols
	r.rows = rows
	r.ringBuf = nil
	r.emu = vt.NewSafeEmulator(cols, rows)
	r.cancel = cancel
	r.emitStatusLocked("building", 0, 0, "")
	r.mu.Unlock()

	if err := r.startWatcher(ctx, absDir); err != nil {
		// Non-fatal: still run initial build even if watcher fails
		_ = err
	}

	go r.rebuildAndRun(ctx, absDir)
	return r.Status(), nil
}

func (r *Runner) Stop() error {
	r.mu.Lock()
	cancel := r.cancel
	r.cancel = nil
	watcher := r.watcher
	r.watcher = nil
	r.stopProcessLocked()
	r.emitStatusLocked("stopped", 0, 0, "")
	r.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if watcher != nil {
		_ = watcher.Close()
	}
	return nil
}

func (r *Runner) stopProcessLocked() {
	if r.cmd != nil && r.cmd.Process != nil {
		_ = r.cmd.Process.Kill()
	}
	if r.pty != nil {
		_ = r.pty.Close()
	}
	r.cmd = nil
	r.pty = nil
}

func (r *Runner) Resize(cols, rows int) error {
	if cols < 10 || rows < 4 {
		return nil
	}
	r.mu.Lock()
	r.cols = cols
	r.rows = rows
	pty := r.pty
	emu := r.emu
	r.status.Cols = cols
	r.status.Rows = rows
	r.mu.Unlock()

	if emu != nil {
		emu.Resize(cols, rows)
	}
	if pty != nil {
		return pty.Resize(cols, rows)
	}
	return nil
}

func (r *Runner) WriteInput(data []byte) error {
	if len(data) == 0 {
		return nil
	}
	r.mu.Lock()
	pty := r.pty
	r.mu.Unlock()
	if pty == nil {
		return errors.New("PTY process is not running")
	}
	_, err := pty.Write(data)
	return err
}

func FormatMouseSGR(col, row, button int, action string) []byte {
	c := max(1, col+1)
	rw := max(1, row+1)
	b := max(0, button)
	switch action {
	case "release":
		return []byte(fmt.Sprintf("\x1b[<%d;%d;%dm", b, c, rw))
	case "move":
		return []byte(fmt.Sprintf("\x1b[<%d;%d;%dM", b+32, c, rw))
	case "wheel":
		// button 64 = wheel up, 65 = wheel down
		return []byte(fmt.Sprintf("\x1b[<%d;%d;%dM", b, c, rw))
	default:
		return []byte(fmt.Sprintf("\x1b[<%d;%d;%dM", b, c, rw))
	}
}

func (r *Runner) SendMouse(col, row, button int, action string) error {
	return r.WriteInput(FormatMouseSGR(col, row, button, action))
}

func ShouldTriggerRebuild(path string) bool {
	base := filepath.Base(path)
	if base == "go.mod" || base == "go.sum" {
		return true
	}
	if strings.HasSuffix(base, ".go") && !strings.HasSuffix(base, "_test.go") {
		return true
	}
	return false
}

func isIgnoredWatchDir(name string) bool {
	return name == ".git" || name == "vendor" || name == "node_modules" || name == ".charmstudio" || strings.HasPrefix(name, ".")
}

func (r *Runner) startWatcher(ctx context.Context, root string) error {
	w, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	addRecursive := func(start string) {
		_ = filepath.WalkDir(start, func(p string, d os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			if d.IsDir() {
				if p != root && isIgnoredWatchDir(d.Name()) {
					return filepath.SkipDir
				}
				_ = w.Add(p)
			}
			return nil
		})
	}
	addRecursive(root)

	r.mu.Lock()
	r.watcher = w
	r.mu.Unlock()

	go func() {
		defer w.Close()
		var timer *time.Timer
		var triggerC <-chan time.Time
		for {
			select {
			case <-ctx.Done():
				if timer != nil {
					timer.Stop()
				}
				return
			case ev, ok := <-w.Events:
				if !ok {
					return
				}
				if ev.Has(fsnotify.Create) {
					if fi, err := os.Stat(ev.Name); err == nil && fi.IsDir() && !isIgnoredWatchDir(filepath.Base(ev.Name)) {
						addRecursive(ev.Name)
					}
				}
				if !ShouldTriggerRebuild(ev.Name) {
					continue
				}
				if timer != nil {
					timer.Stop()
				}
				timer = time.NewTimer(220 * time.Millisecond)
				triggerC = timer.C
			case <-triggerC:
				triggerC = nil
				go r.rebuildAndRun(ctx, root)
			case _, ok := <-w.Errors:
				if !ok {
					return
				}
			}
		}
	}()

	return nil
}

func tempBinaryPath(dir string) string {
	sum := sha1.Sum([]byte(dir))
	return filepath.Join(os.TempDir(), "charmstudio-preview-"+hex.EncodeToString(sum[:8]))
}

func (r *Runner) rebuildAndRun(ctx context.Context, dir string) {
	if ctx.Err() != nil {
		return
	}

	r.mu.Lock()
	if r.dir != dir {
		r.mu.Unlock()
		return
	}
	r.emitStatusLocked("building", 0, 0, "")
	cols := r.cols
	rows := r.rows
	r.mu.Unlock()

	binPath := tempBinaryPath(dir)
	buildStart := time.Now()
	buildCmd := exec.CommandContext(ctx, "go", "build", "-o", binPath, ".")
	buildCmd.Dir = dir
	buildOut, buildErr := buildCmd.CombinedOutput()
	buildMs := time.Since(buildStart).Milliseconds()

	if ctx.Err() != nil {
		return
	}
	if buildErr != nil {
		r.mu.Lock()
		r.stopProcessLocked()
		r.emitStatusLocked("error", buildMs, 0, strings.TrimSpace(string(buildOut)))
		r.mu.Unlock()
		return
	}

	pty, err := xpty.NewPty(cols, rows)
	if err != nil {
		r.mu.Lock()
		r.emitStatusLocked("error", buildMs, 0, "failed creating PTY: "+err.Error())
		r.mu.Unlock()
		return
	}

	cmd := exec.CommandContext(ctx, binPath)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "TERM=xterm-256color", "COLORTERM=truecolor")
	if err := pty.Start(cmd); err != nil {
		_ = pty.Close()
		r.mu.Lock()
		r.emitStatusLocked("error", buildMs, 0, "failed starting binary in PTY: "+err.Error())
		r.mu.Unlock()
		return
	}

	pid := 0
	if cmd.Process != nil {
		pid = cmd.Process.Pid
	}

	r.mu.Lock()
	if r.dir != dir || ctx.Err() != nil {
		r.mu.Unlock()
		_ = pty.Close()
		return
	}
	r.stopProcessLocked()
	r.pty = pty
	r.cmd = cmd
	r.ringBuf = nil
	r.emu = vt.NewSafeEmulator(cols, rows)
	emu := r.emu
	r.emitStatusLocked("running", buildMs, pid, "")
	r.mu.Unlock()

	// Forward emulator terminal query replies (e.g., OSC 11 background color queries) back to PTY.
	go func() {
		replyBuf := make([]byte, 1024)
		for {
			n, err := emu.Read(replyBuf)
			if n > 0 {
				_, _ = pty.Write(replyBuf[:n])
			}
			if err != nil {
				return
			}
		}
	}()

	// Stream raw ANSI output from PTY to both frontend xterm.js and SafeEmulator.
	go func() {
		buf := make([]byte, 8192)
		for {
			n, readErr := pty.Read(buf)
			if n > 0 {
				chunk := append([]byte(nil), buf[:n]...)
				_, _ = emu.Write(chunk)

				r.mu.Lock()
				r.ringBuf = append(r.ringBuf, chunk...)
				if len(r.ringBuf) > maxRingBufferBytes {
					r.ringBuf = r.ringBuf[len(r.ringBuf)-maxRingBufferBytes:]
				}
				cb := r.onOutput
				r.mu.Unlock()

				if cb != nil {
					cb(chunk)
				}
			}
			if readErr != nil {
				if !errors.Is(readErr, io.EOF) {
					_ = readErr
				}
				break
			}
		}
		_ = cmd.Wait()
	}()
}
