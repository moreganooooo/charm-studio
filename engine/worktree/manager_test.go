//go:build !js

package worktree

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestWorktreeLifecycle(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git binary not installed")
	}

	ctx := context.Background()
	repoDir := t.TempDir()

	if _, err := runGit(ctx, repoDir, "init", "-b", "main"); err != nil {
		// Fallback for older git without -b
		if _, err := runGit(ctx, repoDir, "init"); err != nil {
			t.Fatalf("git init failed: %v", err)
		}
	}
	_, _ = runGit(ctx, repoDir, "config", "user.name", "Charm Studio Test")
	_, _ = runGit(ctx, repoDir, "config", "user.email", "test@charmstudio.local")

	mainGo := filepath.Join(repoDir, "main.go")
	if err := os.WriteFile(mainGo, []byte("package main\n\nfunc main() {}\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := runGit(ctx, repoDir, "add", "main.go"); err != nil {
		t.Fatal(err)
	}
	if _, err := runGit(ctx, repoDir, "commit", "-m", "initial"); err != nil {
		t.Fatal(err)
	}

	mgr := NewManager()
	sess, err := mgr.CreateSession(ctx, repoDir, "convert sidebar into huh form", "")
	if err != nil {
		t.Fatalf("CreateSession failed: %v", err)
	}

	wtMain := filepath.Join(sess.WorktreeDir, "main.go")
	if err := os.WriteFile(wtMain, []byte("package main\n\nfunc helper() {}\nfunc main() { helper() }\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	diff, err := mgr.GetDiff(ctx, sess.ID)
	if err != nil {
		t.Fatalf("GetDiff failed: %v", err)
	}
	if diff.Clean || len(diff.Files) != 1 {
		t.Fatalf("expected 1 modified file, got %+v", diff)
	}

	if err := mgr.MergeSession(ctx, sess.ID, "add helper"); err != nil {
		t.Fatalf("MergeSession failed: %v", err)
	}

	sessions, err := mgr.ListSessions(ctx, repoDir)
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 0 {
		t.Fatalf("expected 0 remaining worktrees after merge, got %d", len(sessions))
	}
}
