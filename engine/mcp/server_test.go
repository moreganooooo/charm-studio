package mcp

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"charmstudio/engine/astsync"
)

func sampleDoc() astsync.IRDoc {
	return astsync.IRDoc{
		Tokens: map[string]astsync.TokenPair{
			"accent": {Light: "#2e7de9", Dark: "#7aa2f7"},
		},
		Styles: map[string]astsync.IRStyle{
			"sidebar": {
				Border:      "rounded",
				BorderColor: "$accent",
				Fg:          "#c0caf5",
				Padding:     [4]int{1, 2, 1, 2},
			},
		},
		Root: astsync.IRNode{
			ID:   "shell",
			Kind: "JoinHorizontal",
			Children: []astsync.IRNode{
				{ID: "sidebar", Kind: "Box", Style: "sidebar", ContentType: "bubble:list"},
				{ID: "main", Kind: "Box", Style: "sidebar", ContentType: "text"},
			},
		},
	}
}

func TestMCPInitializeResourcesAndTools(t *testing.T) {
	srv := NewServer(sampleDoc())
	srv.UpdateContext(sampleDoc(), "sidebar", "/tmp/project", "/tmp/wt", "charmstudio/form-upgrade")

	// 1. Initialize
	initBytes, send := srv.HandleMessage([]byte(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`))
	if !send {
		t.Fatal("expected initialize response")
	}
	var initResp struct {
		Result struct {
			ProtocolVersion string `json:"protocolVersion"`
			ServerInfo      struct {
				Name string `json:"name"`
			} `json:"serverInfo"`
		} `json:"result"`
	}
	if err := json.Unmarshal(initBytes, &initResp); err != nil {
		t.Fatalf("unmarshal init: %v", err)
	}
	if initResp.Result.ServerInfo.Name != "charmstudio-mcp" {
		t.Fatalf("unexpected server name: %s", initResp.Result.ServerInfo.Name)
	}

	// 2. Read selection & charm-v2 rules resources
	selBytes, _ := srv.HandleMessage([]byte(`{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"charmstudio://selection"}}`))
	if !strings.Contains(string(selBytes), `"selectedId": "sidebar"`) && !strings.Contains(string(selBytes), `\"selectedId\": \"sidebar\"`) {
		t.Fatalf("expected sidebar selection in resource payload, got: %s", string(selBytes))
	}

	rulesBytes, _ := srv.HandleMessage([]byte(`{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"charmstudio://rules/charm-v2"}}`))
	if !strings.Contains(string(rulesBytes), "charm.land/bubbletea/v2") {
		t.Fatalf("expected v2 rules in resource payload, got: %s", string(rulesBytes))
	}

	// 3. Call patch_go_source tool
	patchReq := map[string]any{
		"jsonrpc": "2.0",
		"id":      4,
		"method":  "tools/call",
		"params": map[string]any{
			"name": "patch_go_source",
			"arguments": map[string]any{
				"existingGo": `package ui

import "charm.land/lipgloss/v2"

var Sidebar = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).Padding(0)
`,
			},
		},
	}
	rawReq, _ := json.Marshal(patchReq)
	patchBytes, _ := srv.HandleMessage(rawReq)
	if !strings.Contains(string(patchBytes), "RoundedBorder") {
		t.Fatalf("expected RoundedBorder patched into Go source, got: %s", string(patchBytes))
	}
}

func TestMCPHTTPHandler(t *testing.T) {
	srv := NewServer(sampleDoc())
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	resp, err := http.Post(ts.URL+"/mcp", "application/json", bytes.NewBufferString(`{"jsonrpc":"2.0","id":9,"method":"tools/list"}`))
	if err != nil {
		t.Fatalf("POST /mcp failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", resp.StatusCode)
	}
}
