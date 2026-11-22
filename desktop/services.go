package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"charmstudio/engine/astsync"
	"charmstudio/engine/mcp"
	"charmstudio/engine/ptyrunner"
	"charmstudio/engine/worktree"
)

type EventEmitter func(name string, data any)

type MCPStatusDTO struct {
	Running      bool     `json:"running"`
	HTTPUrl      string   `json:"httpUrl"`
	SSEUrl       string   `json:"sseUrl"`
	StdioCommand string   `json:"stdioCommand"`
	ActiveDir    string   `json:"activeDir"`
	SelectedID   string   `json:"selectedId"`
	ResourceURIs []string `json:"resourceUris"`
	ToolNames    []string `json:"toolNames"`
}

type StudioService struct {
	mu              sync.RWMutex
	emit            EventEmitter
	mcpSrv          *mcp.Server
	pty             *ptyrunner.Runner
	wt              *worktree.Manager
	mcpHTTPUrl      string
	mcpSSEUrl       string
	activeWorktree  *worktree.Session
	activeProject   string
}

func NewStudioService(mcpSrv *mcp.Server, emit EventEmitter, mcpAddr string) *StudioService {
	svc := &StudioService{
		emit:       emit,
		mcpSrv:     mcpSrv,
		wt:         worktree.NewManager(),
		mcpHTTPUrl: "http://" + mcpAddr + "/mcp",
		mcpSSEUrl:  "http://" + mcpAddr + "/sse",
	}

	svc.pty = ptyrunner.NewRunner(
		func(chunk []byte) {
			svc.emitEvent("pty:output", string(chunk))
		},
		func(st ptyrunner.Status) {
			svc.emitEvent("pty:status", st)
		},
	)

	mcpSrv.SetOnIRUpdate(func(doc astsync.IRDoc) {
		b, err := json.Marshal(doc)
		if err == nil {
			svc.emitEvent("mcp:ir_updated", string(b))
		}
	})

	return svc
}

func (s *StudioService) SetEmitter(emit EventEmitter) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.emit = emit
}

func (s *StudioService) emitEvent(name string, data any) {
	s.mu.RLock()
	fn := s.emit
	s.mu.RUnlock()
	if fn != nil {
		fn(name, data)
	}
}

func (s *StudioService) Shutdown() {
	if s.pty != nil {
		_ = s.pty.Stop()
	}
}

// --- Native AST Sync & Diff ---

func (s *StudioService) ParseGoSource(src string) astsync.GoParseResult {
	return astsync.ParseGoSource(src)
}

func (s *StudioService) SyncGoSource(existingGo, irJSON string) astsync.GoSyncResult {
	var out astsync.GoSyncResult
	var doc astsync.IRDoc
	if err := json.Unmarshal([]byte(irJSON), &doc); err != nil {
		out.Error = err.Error()
		return out
	}
	return astsync.SyncGoSource(existingGo, doc)
}

func (s *StudioService) ComputeGoDiff(beforeGo, afterGo string) astsync.GoDiffResult {
	return astsync.ComputeGoDiff(beforeGo, afterGo)
}

// --- Native PTY Runner ---

func (s *StudioService) StartPTY(dir string, cols, rows int) (ptyrunner.Status, error) {
	cleanDir := strings.TrimSpace(dir)
	if cleanDir == "" {
		return s.pty.Status(), errors.New("project directory is required")
	}
	s.mu.Lock()
	s.activeProject = cleanDir
	s.activeWorktree = nil
	s.mu.Unlock()

	snap := s.mcpSrv.ContextSnapshot()
	s.mcpSrv.UpdateContext(snap.IR, snap.SelectedID, cleanDir, "", "")
	return s.pty.Start(cleanDir, cols, rows)
}

func (s *StudioService) StopPTY() error {
	return s.pty.Stop()
}

func (s *StudioService) SendPTYInput(data string) error {
	return s.pty.WriteInput([]byte(data))
}

func (s *StudioService) SendPTYMouse(col, row, button int, action string) error {
	return s.pty.SendMouse(col, row, button, action)
}

func (s *StudioService) ResizePTY(cols, rows int) error {
	return s.pty.Resize(cols, rows)
}

func (s *StudioService) GetPTYStatus() ptyrunner.Status {
	return s.pty.Status()
}

func (s *StudioService) GetPTYBuffer() string {
	return s.pty.BufferSnapshot()
}

// --- MCP Context & Status ---

func (s *StudioService) UpdateMCPContext(irJSON, selectedID, projectDir string) error {
	var doc astsync.IRDoc
	if strings.TrimSpace(irJSON) != "" {
		if err := json.Unmarshal([]byte(irJSON), &doc); err != nil {
			return err
		}
	}
	s.mu.Lock()
	if projectDir != "" {
		s.activeProject = projectDir
	}
	wtDir, wtBranch := "", ""
	if s.activeWorktree != nil {
		wtDir = s.activeWorktree.WorktreeDir
		wtBranch = s.activeWorktree.Branch
	}
	proj := s.activeProject
	s.mu.Unlock()

	s.mcpSrv.UpdateContext(doc, selectedID, proj, wtDir, wtBranch)
	return nil
}

func (s *StudioService) GetMCPStatus() MCPStatusDTO {
	snap := s.mcpSrv.ContextSnapshot()
	activeDir := snap.WorktreeDir
	if activeDir == "" {
		activeDir = snap.ProjectDir
	}
	exePath, err := os.Executable()
	if err != nil {
		exePath = "charmstudio-desktop"
	}
	return MCPStatusDTO{
		Running:      true,
		HTTPUrl:      s.mcpHTTPUrl,
		SSEUrl:       s.mcpSSEUrl,
		StdioCommand: exePath + " --mcp-stdio",
		ActiveDir:    activeDir,
		SelectedID:   snap.SelectedID,
		ResourceURIs: s.mcpSrv.ResourceURIs(),
		ToolNames:    s.mcpSrv.ToolNames(),
	}
}

// --- Isolated git worktree Sessions ---

func (s *StudioService) CreateWorktree(repoDir, prompt, baseBranch string) (*worktree.Session, error) {
	sess, err := s.wt.CreateSession(context.Background(), repoDir, prompt, baseBranch)
	if err != nil {
		return nil, err
	}

	// Write a brief prompt/rules handoff note inside .git/charmstudio-prompt.txt?
	// Keep the worktree working tree clean from untracked noise, and point MCP + PTY at it!
	s.mu.Lock()
	s.activeProject = sess.RepoRoot
	s.activeWorktree = sess
	s.mu.Unlock()

	snap := s.mcpSrv.ContextSnapshot()
	s.mcpSrv.UpdateContext(snap.IR, snap.SelectedID, sess.RepoRoot, sess.WorktreeDir, sess.Branch)
	return sess, nil
}

func (s *StudioService) ListWorktrees(repoDir string) ([]worktree.Session, error) {
	return s.wt.ListSessions(context.Background(), repoDir)
}

func (s *StudioService) GetWorktreeDiff(sessionID string) (*worktree.DiffResult, error) {
	return s.wt.GetDiff(context.Background(), sessionID)
}

func (s *StudioService) ActivateWorktreeInPTY(sessionID string, cols, rows int) (ptyrunner.Status, error) {
	sess, err := s.wt.GetSession(context.Background(), sessionID)
	if err != nil {
		return s.pty.Status(), err
	}
	s.mu.Lock()
	s.activeProject = sess.RepoRoot
	s.activeWorktree = sess
	s.mu.Unlock()

	snap := s.mcpSrv.ContextSnapshot()
	s.mcpSrv.UpdateContext(snap.IR, snap.SelectedID, sess.RepoRoot, sess.WorktreeDir, sess.Branch)
	return s.pty.Start(sess.WorktreeDir, cols, rows)
}

func (s *StudioService) MergeWorktree(sessionID, commitMessage string) error {
	sess, err := s.wt.GetSession(context.Background(), sessionID)
	if err != nil {
		return err
	}
	// Stop PTY if it was executing inside the worktree about to be removed.
	curStatus := s.pty.Status()
	if filepath.Clean(curStatus.Dir) == filepath.Clean(sess.WorktreeDir) {
		_ = s.pty.Stop()
	}

	if err := s.wt.MergeSession(context.Background(), sessionID, commitMessage); err != nil {
		return err
	}

	s.mu.Lock()
	if s.activeWorktree != nil && s.activeWorktree.ID == sessionID {
		s.activeWorktree = nil
	}
	s.mu.Unlock()

	snap := s.mcpSrv.ContextSnapshot()
	s.mcpSrv.UpdateContext(snap.IR, snap.SelectedID, sess.RepoRoot, "", "")

	// Restart PTY against merged repoRoot so user sees the merged binary live!
	if curStatus.State == "running" || curStatus.State == "building" {
		_, _ = s.pty.Start(sess.RepoRoot, curStatus.Cols, curStatus.Rows)
	}
	return nil
}

func (s *StudioService) DiscardWorktree(sessionID string) error {
	sess, err := s.wt.GetSession(context.Background(), sessionID)
	if err != nil {
		return err
	}
	curStatus := s.pty.Status()
	if filepath.Clean(curStatus.Dir) == filepath.Clean(sess.WorktreeDir) {
		_ = s.pty.Stop()
	}

	if err := s.wt.DiscardSession(context.Background(), sessionID); err != nil {
		return err
	}

	s.mu.Lock()
	if s.activeWorktree != nil && s.activeWorktree.ID == sessionID {
		s.activeWorktree = nil
	}
	s.mu.Unlock()

	snap := s.mcpSrv.ContextSnapshot()
	s.mcpSrv.UpdateContext(snap.IR, snap.SelectedID, sess.RepoRoot, "", "")

	if curStatus.State == "running" || curStatus.State == "building" {
		_, _ = s.pty.Start(sess.RepoRoot, curStatus.Cols, curStatus.Rows)
	}
	return nil
}
