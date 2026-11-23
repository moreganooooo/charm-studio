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
			"services": {
				Border:      "normal",
				BorderColor: "$accent",
				Fg:          "#c0caf5",
				Padding:     [4]int{1, 4, 1, 4},
			},
		},
		Root: astsync.IRNode{
			ID:   "shell",
			Kind: "JoinHorizontal",
			Children: []astsync.IRNode{
				{
					ID:          "sidebar",
					Kind:        "Box",
					Style:       "sidebar",
					ContentType: "bubble:list",
					Width:       astsync.IRSize{Mode: "fixed", Value: 28},
					Content:     "Navigation",
				},
				{
					ID:          "services",
					Kind:        "Box",
					Style:       "services",
					ContentType: "text",
					Width:       astsync.IRSize{Mode: "fill", Weight: 1},
					Content:     "api-gateway-cluster-status-primary",
				},
			},
		},
	}
}

func TestMCPInitializeResourcesAndBuilderVerbs(t *testing.T) {
	srv := NewServer(sampleDoc())
	srv.UpdateContext(sampleDoc(), "services", "/tmp/project", "/tmp/wt", "charmstudio/form-upgrade")

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
	if !strings.Contains(string(selBytes), `"selectedId": "services"`) && !strings.Contains(string(selBytes), `\"selectedId\": \"services\"`) {
		t.Fatalf("expected services selection in resource payload, got: %s", string(selBytes))
	}

	rulesBytes, _ := srv.HandleMessage([]byte(`{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"charmstudio://rules/charm-v2"}}`))
	if !strings.Contains(string(rulesBytes), "charm.land/bubbletea/v2") {
		t.Fatalf("expected v2 rules in resource payload, got: %s", string(rulesBytes))
	}

	// 3. List tools returns the 4 builder verbs
	listBytes, _ := srv.HandleMessage([]byte(`{"jsonrpc":"2.0","id":4,"method":"tools/list"}`))
	for _, verb := range []string{"inspect_layout", "propose_padding_fix", "validate_all_sizes", "explain_overflow"} {
		if !strings.Contains(string(listBytes), verb) {
			t.Fatalf("expected tool verb %q in tools/list, got: %s", verb, string(listBytes))
		}
	}

	// 4. Call inspect_layout
	inspectReq, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      5,
		"method":  "tools/call",
		"params": map[string]any{
			"name":      "inspect_layout",
			"arguments": map[string]any{"nodeId": "services", "cols": 80, "rows": 24},
		},
	})
	inspectBytes, _ := srv.HandleMessage(inspectReq)
	if !strings.Contains(string(inspectBytes), `"targetId": "services"`) && !strings.Contains(string(inspectBytes), `\"targetId\": \"services\"`) {
		t.Fatalf("expected inspect_layout response for services, got: %s", string(inspectBytes))
	}

	// 5. Call validate_all_sizes
	validateReq, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      6,
		"method":  "tools/call",
		"params": map[string]any{
			"name":      "validate_all_sizes",
			"arguments": map[string]any{},
		},
	})
	validateBytes, _ := srv.HandleMessage(validateReq)
	if !strings.Contains(string(validateBytes), "Compact") {
		t.Fatalf("expected validate_all_sizes results, got: %s", string(validateBytes))
	}

	// 6. Call explain_overflow at 58x18
	explainReq, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      7,
		"method":  "tools/call",
		"params": map[string]any{
			"name":      "explain_overflow",
			"arguments": map[string]any{"nodeId": "services", "cols": 58, "rows": 18},
		},
	})
	explainBytes, _ := srv.HandleMessage(explainReq)
	if !strings.Contains(string(explainBytes), "58 x 18") {
		t.Fatalf("expected overflow explanation at 58 x 18, got: %s", string(explainBytes))
	}

	// 7. Call propose_padding_fix with apply=true
	var updated bool
	srv.SetOnIRUpdate(func(_ astsync.IRDoc) {
		updated = true
	})
	proposeReq, _ := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      8,
		"method":  "tools/call",
		"params": map[string]any{
			"name":      "propose_padding_fix",
			"arguments": map[string]any{"nodeId": "services", "cols": 58, "rows": 18, "apply": true},
		},
	})
	proposeBytes, _ := srv.HandleMessage(proposeReq)
	if !strings.Contains(string(proposeBytes), "proposedPadding") || !updated {
		t.Fatalf("expected padding fix proposal and IR update callback, got: %s", string(proposeBytes))
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
