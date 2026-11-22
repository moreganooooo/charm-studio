//go:build !js

package worktree

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"charmstudio/engine/astsync"
)

type Session struct {
	ID          string `json:"id"`
	RepoRoot    string `json:"repoRoot"`
	WorktreeDir string `json:"worktreeDir"`
	Branch      string `json:"branch"`
	BaseBranch  string `json:"baseBranch"`
	Prompt      string `json:"prompt"`
	CreatedAt   string `json:"createdAt"`
}

type FileDiff struct {
	Path     string             `json:"path"`
	Status   string             `json:"status"`
	Deltas   []astsync.AstDelta `json:"deltas,omitempty"`
	Lines    []astsync.DiffLine `json:"lines,omitempty"`
	Added    int                `json:"added"`
	Removed  int                `json:"removed"`
	RawPatch string             `json:"rawPatch,omitempty"`
}

type DiffResult struct {
	Session Session    `json:"session"`
	Files   []FileDiff `json:"files"`
	Summary string     `json:"summary"`
	Clean   bool       `json:"clean"`
}

type Manager struct {
	mu sync.Mutex
}

func NewManager() *Manager {
	return &Manager{}
}

var slugRe = regexp.MustCompile(`[^a-z0-9]+`)

func slugifyPrompt(prompt string) string {
	s := strings.ToLower(strings.TrimSpace(prompt))
	s = slugRe.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-")
	if len(s) > 28 {
		s = strings.Trim(s[:28], "-")
	}
	if s == "" {
		s = "structural-edit"
	}
	return s
}

func runGit(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	trimmed := strings.TrimSpace(string(out))
	if err != nil {
		if trimmed != "" {
			return trimmed, fmt.Errorf("git %s: %s (%w)", strings.Join(args, " "), trimmed, err)
		}
		return "", fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}
	return trimmed, nil
}

func resolveRepoDirs(ctx context.Context, dir string) (repoRoot string, gitCommonDir string, err error) {
	if strings.TrimSpace(dir) == "" {
		return "", "", errors.New("repository directory is required")
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return "", "", err
	}
	repoRoot, err = runGit(ctx, absDir, "rev-parse", "--show-toplevel")
	if err != nil {
		return "", "", fmt.Errorf("not a git repository: %w", err)
	}
	common, err := runGit(ctx, repoRoot, "rev-parse", "--git-common-dir")
	if err != nil {
		return "", "", err
	}
	if !filepath.IsAbs(common) {
		common = filepath.Join(repoRoot, common)
	}
	return repoRoot, filepath.Clean(common), nil
}

func sessionsFilePath(gitCommonDir string) string {
	return filepath.Join(gitCommonDir, "charmstudio-sessions.json")
}

func (m *Manager) loadSessionsLocked(gitCommonDir string) ([]Session, error) {
	p := sessionsFilePath(gitCommonDir)
	b, err := os.ReadFile(p)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var raw []Session
	if err := json.Unmarshal(b, &raw); err != nil {
		return nil, err
	}
	var active []Session
	for _, s := range raw {
		if _, statErr := os.Stat(s.WorktreeDir); statErr == nil {
			active = append(active, s)
		}
	}
	return active, nil
}

func (m *Manager) saveSessionsLocked(gitCommonDir string, sessions []Session) error {
	p := sessionsFilePath(gitCommonDir)
	b, err := json.MarshalIndent(sessions, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, b, 0o644)
}

func (m *Manager) findSessionLocked(ctx context.Context, sessionID string) (Session, string, error) {
	// Session IDs can carry repo context or be scanned from recent known files;
	// here callers pass sessionID after listing or creating, and we also store a global index in os.TempDir.
	idxPath := globalSessionIndexPath()
	b, err := os.ReadFile(idxPath)
	if err == nil {
		var index map[string]Session
		if json.Unmarshal(b, &index) == nil {
			if s, ok := index[sessionID]; ok {
				_, common, rErr := resolveRepoDirs(ctx, s.RepoRoot)
				if rErr == nil {
					return s, common, nil
				}
				return s, "", nil
			}
		}
	}
	return Session{}, "", fmt.Errorf("worktree session not found: %s", sessionID)
}

func globalSessionIndexPath() string {
	return filepath.Join(os.TempDir(), "charmstudio-worktree-index.json")
}

func recordGlobalSession(s Session, remove bool) {
	p := globalSessionIndexPath()
	index := map[string]Session{}
	if b, err := os.ReadFile(p); err == nil {
		_ = json.Unmarshal(b, &index)
	}
	if remove {
		delete(index, s.ID)
	} else {
		index[s.ID] = s
	}
	if b, err := json.MarshalIndent(index, "", "  "); err == nil {
		_ = os.WriteFile(p, b, 0o644)
	}
}

func (m *Manager) CreateSession(ctx context.Context, repoDir, prompt, baseBranch string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	repoRoot, commonDir, err := resolveRepoDirs(ctx, repoDir)
	if err != nil {
		return nil, err
	}

	if strings.TrimSpace(baseBranch) == "" {
		b, err := runGit(ctx, repoRoot, "rev-parse", "--abbrev-ref", "HEAD")
		if err != nil || b == "HEAD" {
			baseBranch = "HEAD"
		} else {
			baseBranch = b
		}
	}

	ts := time.Now().UTC().Format("20060102-150405")
	slug := slugifyPrompt(prompt)
	id := fmt.Sprintf("%s-%s", slug, ts)
	branch := fmt.Sprintf("charmstudio/%s", id)
	wtDir := filepath.Join(commonDir, "charmstudio-worktrees", id)

	if err := os.MkdirAll(filepath.Dir(wtDir), 0o755); err != nil {
		return nil, err
	}
	if _, err := runGit(ctx, repoRoot, "worktree", "add", "-b", branch, wtDir, baseBranch); err != nil {
		return nil, err
	}

	sess := Session{
		ID:          id,
		RepoRoot:    repoRoot,
		WorktreeDir: wtDir,
		Branch:      branch,
		BaseBranch:  baseBranch,
		Prompt:      strings.TrimSpace(prompt),
		CreatedAt:   time.Now().UTC().Format(time.RFC3339),
	}

	existing, _ := m.loadSessionsLocked(commonDir)
	existing = append(existing, sess)
	if err := m.saveSessionsLocked(commonDir, existing); err != nil {
		return nil, err
	}
	recordGlobalSession(sess, false)
	return &sess, nil
}

func (m *Manager) ListSessions(ctx context.Context, repoDir string) ([]Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	_, commonDir, err := resolveRepoDirs(ctx, repoDir)
	if err != nil {
		return nil, err
	}
	sessions, err := m.loadSessionsLocked(commonDir)
	if err != nil {
		return nil, err
	}
	_ = m.saveSessionsLocked(commonDir, sessions)
	if sessions == nil {
		sessions = []Session{}
	}
	return sessions, nil
}

func (m *Manager) GetSession(ctx context.Context, sessionID string) (*Session, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	sess, _, err := m.findSessionLocked(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	return &sess, nil
}

func (m *Manager) GetDiff(ctx context.Context, sessionID string) (*DiffResult, error) {
	m.mu.Lock()
	sess, _, err := m.findSessionLocked(ctx, sessionID)
	m.mu.Unlock()
	if err != nil {
		return nil, err
	}

	res := &DiffResult{Session: sess, Clean: true}

	// Compare worktree working tree against baseBranch (includes both committed on branch and uncommitted edits).
	baseRef := sess.BaseBranch
	if baseRef == "" {
		baseRef = "HEAD"
	}

	nameStatus, _ := runGit(ctx, sess.WorktreeDir, "diff", "--name-status", baseRef)
	untrackedRaw, _ := runGit(ctx, sess.WorktreeDir, "ls-files", "--others", "--exclude-standard")

	seen := map[string]bool{}
	var entries []struct {
		status string
		path   string
	}
	for _, line := range strings.Split(nameStatus, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) < 2 {
			continue
		}
		p := parts[len(parts)-1]
		seen[p] = true
		entries = append(entries, struct {
			status string
			path   string
		}{status: parts[0], path: p})
	}
	for _, line := range strings.Split(untrackedRaw, "\n") {
		p := strings.TrimSpace(line)
		if p == "" || seen[p] {
			continue
		}
		entries = append(entries, struct {
			status string
			path   string
		}{status: "A", path: p})
	}

	for _, ent := range entries {
		res.Clean = false
		var beforeStr, afterStr string
		if !strings.HasPrefix(ent.status, "A") {
			beforeStr, _ = runGit(ctx, sess.WorktreeDir, "show", fmt.Sprintf("%s:%s", baseRef, ent.path))
		}
		if !strings.HasPrefix(ent.status, "D") {
			if b, err := os.ReadFile(filepath.Join(sess.WorktreeDir, ent.path)); err == nil {
				afterStr = string(b)
			}
		}

		fd := FileDiff{
			Path:   ent.path,
			Status: ent.status,
		}
		if strings.HasSuffix(ent.path, ".go") {
			diff := astsync.ComputeGoDiff(beforeStr, afterStr)
			fd.Deltas = diff.Deltas
			fd.Lines = diff.Lines
			fd.Added = diff.Added
			fd.Removed = diff.Removed
		} else {
			patch, _ := runGit(ctx, sess.WorktreeDir, "diff", baseRef, "--", ent.path)
			fd.RawPatch = patch
			for _, ln := range strings.Split(patch, "\n") {
				if strings.HasPrefix(ln, "+") && !strings.HasPrefix(ln, "+++") {
					fd.Added++
				} else if strings.HasPrefix(ln, "-") && !strings.HasPrefix(ln, "---") {
					fd.Removed++
				}
			}
		}
		res.Files = append(res.Files, fd)
	}

	if res.Clean {
		res.Summary = "No changes in worktree yet."
	} else {
		totalAdd, totalDel := 0, 0
		for _, f := range res.Files {
			totalAdd += f.Added
			totalDel += f.Removed
		}
		res.Summary = fmt.Sprintf("%d file(s) changed (+%d / -%d)", len(res.Files), totalAdd, totalDel)
	}
	return res, nil
}

func (m *Manager) MergeSession(ctx context.Context, sessionID, commitMessage string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	sess, commonDir, err := m.findSessionLocked(ctx, sessionID)
	if err != nil {
		return err
	}

	// Auto-commit any dirty edits in the worktree before merging.
	status, _ := runGit(ctx, sess.WorktreeDir, "status", "--porcelain")
	if strings.TrimSpace(status) != "" {
		if _, err := runGit(ctx, sess.WorktreeDir, "add", "-A"); err != nil {
			return err
		}
		msg := strings.TrimSpace(commitMessage)
		if msg == "" {
			if sess.Prompt != "" {
				msg = "charmstudio: " + sess.Prompt
			} else {
				msg = "charmstudio: merge worktree " + sess.ID
			}
		}
		if _, err := runGit(ctx, sess.WorktreeDir, "commit", "-m", msg); err != nil {
			return err
		}
	}

	if sess.BaseBranch != "" && sess.BaseBranch != "HEAD" {
		_, _ = runGit(ctx, sess.RepoRoot, "checkout", sess.BaseBranch)
	}
	if _, err := runGit(ctx, sess.RepoRoot, "merge", "--no-ff", sess.Branch, "-m", fmt.Sprintf("Merge %s", sess.Branch)); err != nil {
		return err
	}

	return m.cleanupSessionLocked(ctx, sess, commonDir, false)
}

func (m *Manager) DiscardSession(ctx context.Context, sessionID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	sess, commonDir, err := m.findSessionLocked(ctx, sessionID)
	if err != nil {
		return err
	}
	return m.cleanupSessionLocked(ctx, sess, commonDir, true)
}

func (m *Manager) cleanupSessionLocked(ctx context.Context, sess Session, commonDir string, forceBranchDelete bool) error {
	if _, err := runGit(ctx, sess.RepoRoot, "worktree", "remove", "--force", sess.WorktreeDir); err != nil {
		return err
	}
	delFlag := "-d"
	if forceBranchDelete {
		delFlag = "-D"
	}
	_, _ = runGit(ctx, sess.RepoRoot, "branch", delFlag, sess.Branch)

	if commonDir != "" {
		sessions, _ := m.loadSessionsLocked(commonDir)
		var next []Session
		for _, item := range sessions {
			if item.ID != sess.ID {
				next = append(next, item)
			}
		}
		_ = m.saveSessionsLocked(commonDir, next)
	}
	recordGlobalSession(sess, true)
	return nil
}
