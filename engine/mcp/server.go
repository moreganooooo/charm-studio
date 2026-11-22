package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"charmstudio/engine/astsync"
)

const ProtocolVersion = "2024-11-05"

type ContextPayload struct {
	IR             astsync.IRDoc      `json:"ir"`
	SelectedID     string             `json:"selectedId"`
	SelectedNode   *astsync.IRNode    `json:"selectedNode,omitempty"`
	SelectedStyle  *astsync.IRStyle   `json:"selectedStyle,omitempty"`
	NodePath       []string           `json:"nodePath,omitempty"`
	ProjectDir     string             `json:"projectDir,omitempty"`
	WorktreeDir    string             `json:"worktreeDir,omitempty"`
	WorktreeBranch string             `json:"worktreeBranch,omitempty"`
}

type Server struct {
	mu             sync.RWMutex
	ir             astsync.IRDoc
	selectedID     string
	projectDir     string
	worktreeDir    string
	worktreeBranch string
	onIRUpdate     func(astsync.IRDoc)
}

func NewServer(initial astsync.IRDoc) *Server {
	if initial.Tokens == nil {
		initial.Tokens = map[string]astsync.TokenPair{}
	}
	if initial.Styles == nil {
		initial.Styles = map[string]astsync.IRStyle{}
	}
	return &Server{
		ir:         initial,
		selectedID: initial.Root.ID,
	}
}

func (s *Server) SetOnIRUpdate(fn func(astsync.IRDoc)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onIRUpdate = fn
}

func (s *Server) UpdateContext(doc astsync.IRDoc, selectedID, projectDir, worktreeDir, worktreeBranch string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if doc.Tokens == nil {
		doc.Tokens = map[string]astsync.TokenPair{}
	}
	if doc.Styles == nil {
		doc.Styles = map[string]astsync.IRStyle{}
	}
	s.ir = doc
	if selectedID != "" {
		s.selectedID = selectedID
	}
	if projectDir != "" {
		s.projectDir = projectDir
	}
	s.worktreeDir = worktreeDir
	s.worktreeBranch = worktreeBranch
}

func (s *Server) SetActiveWorktree(worktreeDir, worktreeBranch string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.worktreeDir = worktreeDir
	s.worktreeBranch = worktreeBranch
}

func findNodeWithPath(cur astsync.IRNode, targetID string, trail []string) (*astsync.IRNode, []string) {
	nextTrail := append(append([]string(nil), trail...), cur.ID)
	if cur.ID == targetID {
		cp := cur
		return &cp, nextTrail
	}
	for _, ch := range cur.Children {
		if found, p := findNodeWithPath(ch, targetID, nextTrail); found != nil {
			return found, p
		}
	}
	return nil, nil
}

func (s *Server) ContextSnapshot() ContextPayload {
	s.mu.RLock()
	defer s.mu.RUnlock()

	selID := s.selectedID
	if selID == "" {
		selID = s.ir.Root.ID
	}
	node, path := findNodeWithPath(s.ir.Root, selID, nil)
	if node == nil {
		for _, ov := range s.ir.Overlays {
			if found, p := findNodeWithPath(ov.Node, selID, []string{"overlay:" + ov.ID}); found != nil {
				node = found
				path = p
				break
			}
		}
	}
	var stPtr *astsync.IRStyle
	if node != nil && node.Style != "" {
		if st, ok := s.ir.Styles[node.Style]; ok {
			stCopy := st
			stPtr = &stCopy
		}
	}

	return ContextPayload{
		IR:             s.ir,
		SelectedID:     selID,
		SelectedNode:   node,
		SelectedStyle:  stPtr,
		NodePath:       path,
		ProjectDir:     s.projectDir,
		WorktreeDir:    s.worktreeDir,
		WorktreeBranch: s.worktreeBranch,
	}
}

func (s *Server) ResourceURIs() []string {
	return []string{
		"charmstudio://layout/ir",
		"charmstudio://selection",
		"charmstudio://theme/tokens",
		"charmstudio://rules/charm-v2",
	}
}

func (s *Server) ToolNames() []string {
	return []string{
		"get_layout_context",
		"inspect_node",
		"list_migration_rules",
		"parse_go_source",
		"patch_go_source",
		"compute_go_diff",
		"update_layout_ir",
	}
}

// --- JSON-RPC 2.0 Types ---

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type rpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

type toolResult struct {
	Content []toolContent `json:"content"`
	IsError bool          `json:"isError,omitempty"`
}

type toolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

func textToolOK(val any) toolResult {
	switch v := val.(type) {
	case string:
		return toolResult{Content: []toolContent{{Type: "text", Text: v}}}
	default:
		b, _ := json.MarshalIndent(v, "", "  ")
		return toolResult{Content: []toolContent{{Type: "text", Text: string(b)}}}
	}
}

func textToolErr(msg string) toolResult {
	return toolResult{
		IsError: true,
		Content: []toolContent{{Type: "text", Text: msg}},
	}
}

// HandleMessage processes a single MCP JSON-RPC 2.0 message.
// Returns (responseBytes, shouldSend). Notifications return (_, false).
func (s *Server) HandleMessage(raw []byte) ([]byte, bool) {
	var req rpcRequest
	if err := json.Unmarshal(raw, &req); err != nil {
		resp := rpcResponse{
			JSONRPC: "2.0",
			Error:   &rpcError{Code: -32700, Message: "parse error: " + err.Error()},
		}
		b, _ := json.Marshal(resp)
		return b, true
	}

	// JSON-RPC notifications have no ID (or null) and expect no response.
	if len(req.ID) == 0 || string(req.ID) == "null" {
		if strings.HasPrefix(req.Method, "notifications/") {
			return nil, false
		}
	}

	reply := func(res any) ([]byte, bool) {
		b, _ := json.Marshal(rpcResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  res,
		})
		return b, true
	}
	replyErr := func(code int, msg string) ([]byte, bool) {
		b, _ := json.Marshal(rpcResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &rpcError{Code: code, Message: msg},
		})
		return b, true
	}

	switch req.Method {
	case "initialize":
		return reply(map[string]any{
			"protocolVersion": ProtocolVersion,
			"capabilities": map[string]any{
				"resources": map[string]any{"subscribe": false, "listChanged": true},
				"tools":     map[string]any{"listChanged": false},
			},
			"serverInfo": map[string]any{
				"name":    "charmstudio-mcp",
				"version": "0.1.0",
			},
		})

	case "ping":
		return reply(map[string]any{})

	case "resources/list":
		return reply(map[string]any{
			"resources": []map[string]any{
				{
					"uri":         "charmstudio://layout/ir",
					"name":        "Active Layout Tree IR",
					"description": "Complete Charm Studio IRDoc JSON (root tree, overlays, view config, styles, tokens).",
					"mimeType":    "application/json",
				},
				{
					"uri":         "charmstudio://selection",
					"name":        "Selected @tui:id Node",
					"description": "Currently selected // @tui:id=... node, path, resolved IRStyle, and active worktree path.",
					"mimeType":    "application/json",
				},
				{
					"uri":         "charmstudio://theme/tokens",
					"name":        "Theme & Color Tokens",
					"description": "Light/Dark Lip Gloss v2 color tokens and style map for Theme / NewTheme(isDark).",
					"mimeType":    "application/json",
				},
				{
					"uri":         "charmstudio://rules/charm-v2",
					"name":        "Charmbracelet v2 Migration Rules",
					"description": "Canonical charm.land/*/v2 API, tea.View, KeyPressMsg, LightDark, and @tui annotation rules.",
					"mimeType":    "text/markdown",
				},
			},
		})

	case "resources/read":
		var params struct {
			URI string `json:"uri"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return replyErr(-32602, "invalid params: "+err.Error())
		}
		snap := s.ContextSnapshot()
		switch params.URI {
		case "charmstudio://layout/ir":
			b, _ := json.MarshalIndent(snap.IR, "", "  ")
			return reply(map[string]any{
				"contents": []map[string]any{{
					"uri":      params.URI,
					"mimeType": "application/json",
					"text":     string(b),
				}},
			})
		case "charmstudio://selection":
			b, _ := json.MarshalIndent(map[string]any{
				"selectedId":     snap.SelectedID,
				"nodePath":       snap.NodePath,
				"selectedNode":   snap.SelectedNode,
				"selectedStyle":  snap.SelectedStyle,
				"projectDir":     snap.ProjectDir,
				"worktreeDir":    snap.WorktreeDir,
				"worktreeBranch": snap.WorktreeBranch,
			}, "", "  ")
			return reply(map[string]any{
				"contents": []map[string]any{{
					"uri":      params.URI,
					"mimeType": "application/json",
					"text":     string(b),
				}},
			})
		case "charmstudio://theme/tokens":
			b, _ := json.MarshalIndent(map[string]any{
				"tokens": snap.IR.Tokens,
				"styles": snap.IR.Styles,
			}, "", "  ")
			return reply(map[string]any{
				"contents": []map[string]any{{
					"uri":      params.URI,
					"mimeType": "application/json",
					"text":     string(b),
				}},
			})
		case "charmstudio://rules/charm-v2":
			return reply(map[string]any{
				"contents": []map[string]any{{
					"uri":      params.URI,
					"mimeType": "text/markdown",
					"text":     RenderRulesMarkdown(),
				}},
			})
		default:
			return replyErr(-32002, "unknown resource URI: "+params.URI)
		}

	case "tools/list":
		return reply(map[string]any{
			"tools": s.toolSchemas(),
		})

	case "tools/call":
		var params struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil {
			return replyErr(-32602, "invalid tool call params: "+err.Error())
		}
		return reply(s.callTool(params.Name, params.Arguments))

	default:
		return replyErr(-32601, "method not found: "+req.Method)
	}
}

func (s *Server) toolSchemas() []map[string]any {
	return []map[string]any{
		{
			"name":        "get_layout_context",
			"description": "Returns the active Charm Studio layout tree IR JSON, selected // @tui:id=... node, Theme tokens, and active project/worktree directory.",
			"inputSchema": map[string]any{"type": "object", "properties": map[string]any{}},
		},
		{
			"name":        "inspect_node",
			"description": "Inspect a node by its // @tui:id=<id> identifier, returning its layout properties, children, path, and resolved style.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"nodeId": map[string]any{"type": "string", "description": "Target @tui:id node identifier (defaults to current selection)."},
				},
			},
		},
		{
			"name":        "list_migration_rules",
			"description": "List embedded Charmbracelet v2 API migration rules (imports, view, messages, colors, bubbles, annotations).",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"category": map[string]any{"type": "string", "description": "Optional filter category (imports, view, messages, colors, bubbles, annotations, all)."},
				},
			},
		},
		{
			"name":        "parse_go_source",
			"description": "Parse Go source code using engine/astsync (dave/dst) to extract Lip Gloss v2 styles, tokens, tea.View, Bubbles/Huh widgets, and layout tree.",
			"inputSchema": map[string]any{
				"type":     "object",
				"required": []string{"goSource"},
				"properties": map[string]any{
					"goSource": map[string]any{"type": "string"},
				},
			},
		},
		{
			"name":        "patch_go_source",
			"description": "Safely patch existing Go source (or a file inside the active worktree/project) with the active Studio IR using dave/dst while preserving comments and @tui:block-disable locks.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"existingGo": map[string]any{"type": "string", "description": "Raw Go source to patch (optional if relativePath is given)."},
					"relativePath": map[string]any{"type": "string", "description": "Optional path relative to active worktree or project directory to read & write back cleanly."},
					"writeFile": map[string]any{"type": "boolean", "description": "When true with relativePath, persists updated Go back to disk inside the active worktree/project."},
				},
			},
		},
		{
			"name":        "compute_go_diff",
			"description": "Compute a structural dave/dst Go AST delta + unified line diff between two versions of a Go file.",
			"inputSchema": map[string]any{
				"type":     "object",
				"required": []string{"beforeGo", "afterGo"},
				"properties": map[string]any{
					"beforeGo": map[string]any{"type": "string"},
					"afterGo":  map[string]any{"type": "string"},
				},
			},
		},
		{
			"name":        "update_layout_ir",
			"description": "Push an updated IRDoc JSON back into the running Charm Studio session.",
			"inputSchema": map[string]any{
				"type":     "object",
				"required": []string{"ir"},
				"properties": map[string]any{
					"ir": map[string]any{"type": "object"},
				},
			},
		},
	}
}

func (s *Server) resolveSafeProjectFile(rel string) (string, error) {
	snap := s.ContextSnapshot()
	base := snap.WorktreeDir
	if base == "" {
		base = snap.ProjectDir
	}
	if base == "" {
		return "", errors.New("no active project or worktree directory configured in Charm Studio")
	}
	cleanBase, err := filepath.Abs(base)
	if err != nil {
		return "", err
	}
	target := filepath.Clean(filepath.Join(cleanBase, rel))
	relCheck, err := filepath.Rel(cleanBase, target)
	if err != nil || strings.HasPrefix(relCheck, "..") || filepath.IsAbs(relCheck) {
		return "", errors.New("path escapes active project/worktree root")
	}
	return target, nil
}

func (s *Server) callTool(name string, rawArgs json.RawMessage) toolResult {
	switch name {
	case "get_layout_context":
		return textToolOK(s.ContextSnapshot())

	case "inspect_node":
		var args struct {
			NodeID string `json:"nodeId"`
		}
		_ = json.Unmarshal(rawArgs, &args)
		snap := s.ContextSnapshot()
		targetID := strings.TrimSpace(args.NodeID)
		if targetID == "" {
			targetID = snap.SelectedID
		}
		node, path := findNodeWithPath(snap.IR.Root, targetID, nil)
		if node == nil {
			for _, ov := range snap.IR.Overlays {
				if found, p := findNodeWithPath(ov.Node, targetID, []string{"overlay:" + ov.ID}); found != nil {
					node = found
					path = p
					break
				}
			}
		}
		if node == nil {
			return textToolErr("node not found: " + targetID)
		}
		var stPtr *astsync.IRStyle
		if node.Style != "" {
			if st, ok := snap.IR.Styles[node.Style]; ok {
				stCopy := st
				stPtr = &stCopy
			}
		}
		return textToolOK(map[string]any{
			"nodeId": targetID,
			"path":   path,
			"node":   node,
			"style":  stPtr,
		})

	case "list_migration_rules":
		var args struct {
			Category string `json:"category"`
		}
		_ = json.Unmarshal(rawArgs, &args)
		return textToolOK(FilterCharmV2Rules(args.Category))

	case "parse_go_source":
		var args struct {
			GoSource string `json:"goSource"`
		}
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return textToolErr("invalid arguments: " + err.Error())
		}
		return textToolOK(astsync.ParseGoSource(args.GoSource))

	case "patch_go_source":
		var args struct {
			ExistingGo   string `json:"existingGo"`
			RelativePath string `json:"relativePath"`
			WriteFile    bool   `json:"writeFile"`
		}
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return textToolErr("invalid arguments: " + err.Error())
		}
		src := args.ExistingGo
		var diskPath string
		if strings.TrimSpace(args.RelativePath) != "" {
			resolved, err := s.resolveSafeProjectFile(args.RelativePath)
			if err != nil {
				return textToolErr(err.Error())
			}
			diskPath = resolved
			if src == "" {
				b, err := os.ReadFile(diskPath)
				if err != nil {
					return textToolErr("failed reading file: " + err.Error())
				}
				src = string(b)
			}
		}
		if strings.TrimSpace(src) == "" {
			return textToolErr("provide existingGo or relativePath")
		}
		snap := s.ContextSnapshot()
		res := astsync.SyncGoSource(src, snap.IR)
		if res.Error != "" {
			return textToolErr(res.Error)
		}
		if args.WriteFile && diskPath != "" && !res.SyncDisabled {
			if err := os.WriteFile(diskPath, []byte(res.UpdatedGo), 0o644); err != nil {
				return textToolErr("patched AST but failed to write file: " + err.Error())
			}
		}
		return textToolOK(res)

	case "compute_go_diff":
		var args struct {
			BeforeGo string `json:"beforeGo"`
			AfterGo  string `json:"afterGo"`
		}
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return textToolErr("invalid arguments: " + err.Error())
		}
		return textToolOK(astsync.ComputeGoDiff(args.BeforeGo, args.AfterGo))

	case "update_layout_ir":
		var args struct {
			IR astsync.IRDoc `json:"ir"`
		}
		if err := json.Unmarshal(rawArgs, &args); err != nil {
			return textToolErr("invalid IRDoc payload: " + err.Error())
		}
		if args.IR.Root.ID == "" {
			return textToolErr("ir.root.id is required")
		}
		s.mu.Lock()
		if args.IR.Tokens == nil {
			args.IR.Tokens = map[string]astsync.TokenPair{}
		}
		if args.IR.Styles == nil {
			args.IR.Styles = map[string]astsync.IRStyle{}
		}
		s.ir = args.IR
		cb := s.onIRUpdate
		s.mu.Unlock()
		if cb != nil {
			cb(args.IR)
		}
		return textToolOK(map[string]any{"ok": true, "rootId": args.IR.Root.ID})

	default:
		return textToolErr("unknown tool: " + name)
	}
}

// ServeStdio runs line-delimited JSON-RPC 2.0 MCP transport over stdio.
func (s *Server) ServeStdio(ctx context.Context, r io.Reader, w io.Writer) error {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 8*1024*1024)
	var writeMu sync.Mutex
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		respBytes, send := s.HandleMessage([]byte(line))
		if !send {
			continue
		}
		writeMu.Lock()
		_, err := fmt.Fprintf(w, "%s\n", respBytes)
		writeMu.Unlock()
		if err != nil {
			return err
		}
	}
	return scanner.Err()
}

// Handler returns an HTTP handler exposing Streamable HTTP (/mcp), SSE (/sse), and /health.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	withCORS := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Accept")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next(w, r)
		}
	}

	mux.HandleFunc("/health", withCORS(func(w http.ResponseWriter, _ *http.Request) {
		snap := s.ContextSnapshot()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"ok":          true,
			"server":      "charmstudio-mcp",
			"selectedId":  snap.SelectedID,
			"projectDir":  snap.ProjectDir,
			"worktreeDir": snap.WorktreeDir,
		})
	}))

	mux.HandleFunc("/mcp", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		body, err := io.ReadAll(io.LimitReader(r.Body, 8*1024*1024))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		respBytes, send := s.HandleMessage(body)
		if !send {
			w.WriteHeader(http.StatusAccepted)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(respBytes)
	}))

	mux.HandleFunc("/sse", withCORS(func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		_, _ = fmt.Fprintf(w, "event: endpoint\ndata: /mcp\n\n")
		flusher.Flush()
		<-r.Context().Done()
	}))

	return mux
}
