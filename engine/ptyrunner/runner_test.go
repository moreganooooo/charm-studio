//go:build !js

package ptyrunner

import (
	"strings"
	"testing"
)

func TestShouldTriggerRebuild(t *testing.T) {
	if !ShouldTriggerRebuild("ui/layout_gen.go") {
		t.Fatal("expected .go file to trigger rebuild")
	}
	if !ShouldTriggerRebuild("go.mod") {
		t.Fatal("expected go.mod to trigger rebuild")
	}
	if ShouldTriggerRebuild("ui/layout_test.go") {
		t.Fatal("expected _test.go file not to trigger rebuild")
	}
	if ShouldTriggerRebuild("README.md") {
		t.Fatal("expected README.md not to trigger rebuild")
	}
}

func TestFormatMouseSGRAndEmulator(t *testing.T) {
	press := string(FormatMouseSGR(4, 2, 0, "press"))
	if press != "\x1b[<0;5;3M" {
		t.Fatalf("unexpected SGR press sequence: %q", press)
	}
	release := string(FormatMouseSGR(4, 2, 0, "release"))
	if release != "\x1b[<0;5;3m" {
		t.Fatalf("unexpected SGR release sequence: %q", release)
	}

	r := NewRunner(nil, nil)
	_, _ = r.emu.Write([]byte("Hello VT"))
	out := r.ScreenANSI()
	if !strings.Contains(out, "Hello VT") {
		t.Fatalf("expected SafeEmulator screen to contain Hello VT, got %q", out)
	}
}
