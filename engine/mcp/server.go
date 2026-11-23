package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
		"inspect_layout",
		"propose_padding_fix",
		"validate_all_sizes",
		"explain_overflow",
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
			var lockReason string
			var dynExprs map[string]string
			if snap.SelectedNode != nil && snap.SelectedNode.Style != "" {
				lockReason = snap.IR.LockReasons[snap.SelectedNode.Style]
				dynExprs = snap.IR.DynamicExprs[snap.SelectedNode.Style]
			}
			b, _ := json.MarshalIndent(map[string]any{
				"selectedId":     snap.SelectedID,
				"nodePath":       snap.NodePath,
				"selectedNode":   snap.SelectedNode,
				"selectedStyle":  snap.SelectedStyle,
				"lockReason":     lockReason,
				"dynamicExprs":   dynExprs,
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
			"name":        "inspect_layout",
			"description": "Inspect the active Studio layout tree, selection, resolved styles, sync locks, and computed cell bounds at a terminal size.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"nodeId": map[string]any{"type": "string", "description": "Optional @tui:id node identifier to focus (defaults to active selection)."},
					"cols":   map[string]any{"type": "integer", "description": "Terminal columns to inspect (defaults to 80)."},
					"rows":   map[string]any{"type": "integer", "description": "Terminal rows to inspect (defaults to 24)."},
				},
			},
		},
		{
			"name":        "propose_padding_fix",
			"description": "Propose a minimal Lip Gloss padding adjustment to relieve pane overflow while respecting @tui:sync-disable and dynamic expression locks.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"nodeId": map[string]any{"type": "string", "description": "Target @tui:id node identifier (defaults to first overflowing pane or selection)."},
					"cols":   map[string]any{"type": "integer", "description": "Failing terminal columns (defaults to 58)."},
					"rows":   map[string]any{"type": "integer", "description": "Failing terminal rows (defaults to 18)."},
					"apply":  map[string]any{"type": "boolean", "description": "When true, applies the proposed padding update into the running Charm Studio layout."},
				},
			},
		},
		{
			"name":        "validate_all_sizes",
			"description": "Validate the active layout across responsive terminal size presets (Compact 58x18, Standard 80x24, Wide 116x30, or custom sizes).",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"sizes": map[string]any{
						"type":        "array",
						"description": "Optional custom terminal sizes ({ title, cols, rows }). Defaults to Compact, Standard, and Wide presets.",
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"title": map[string]any{"type": "string"},
								"cols":  map[string]any{"type": "integer"},
								"rows":  map[string]any{"type": "integer"},
							},
						},
					},
				},
			},
		},
		{
			"name":        "explain_overflow",
			"description": "Explain why a pane overflows at a given terminal size, returning exact cell deltas, blocking rule or content extent, lock state, and fix suggestions.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"nodeId": map[string]any{"type": "string", "description": "Target @tui:id node identifier (defaults to first overflowing pane or selection)."},
					"cols":   map[string]any{"type": "integer", "description": "Terminal columns to diagnose (defaults to 58)."},
					"rows":   map[string]any{"type": "integer", "description": "Terminal rows to diagnose (defaults to 18)."},
				},
			},
		},
	}
}

func (s *Server) callTool(name string, rawArgs json.RawMessage) toolResult {
	switch name {
	case "inspect_layout":
		var args struct {
			NodeID string `json:"nodeId"`
			Cols   int    `json:"cols"`
			Rows   int    `json:"rows"`
		}
		_ = json.Unmarshal(rawArgs, &args)
		cols := args.Cols
		if cols <= 0 {
			cols = 80
		}
		rows := args.Rows
		if rows <= 0 {
			rows = 24
		}

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

		eval := evaluateLayout(snap.IR, cols, rows, "")
		var stPtr *astsync.IRStyle
		var styleLocks []string
		var styleReason string
		var styleDyn map[string]string
		if node.Style != "" {
			if st, ok := snap.IR.Styles[node.Style]; ok {
				stCopy := st
				stPtr = &stCopy
			}
			styleLocks = snap.IR.LockedProps[node.Style]
			styleReason = snap.IR.LockReasons[node.Style]
			styleDyn = snap.IR.DynamicExprs[node.Style]
		}

		var nodeBounds *NodeTelemetry
		for i := range eval.Nodes {
			if eval.Nodes[i].ID == targetID {
				cp := eval.Nodes[i]
				nodeBounds = &cp
				break
			}
		}

		return textToolOK(map[string]any{
			"cols":           eval.Cols,
			"rows":           eval.Rows,
			"selectedId":     snap.SelectedID,
			"targetId":       targetID,
			"nodePath":       path,
			"targetNode":     node,
			"bounds":         nodeBounds,
			"style":          stPtr,
			"lockedProps":    styleLocks,
			"lockReason":     styleReason,
			"dynamicExprs":   styleDyn,
			"nodeLocks":      snap.IR.LockedProps["node:"+targetID],
			"nodeDynamic":    snap.IR.DynamicExprs["node:"+targetID],
			"nodes":          eval.Nodes,
			"overflowCount":  len(eval.Diagnoses),
			"projectDir":     snap.ProjectDir,
			"worktreeDir":    snap.WorktreeDir,
			"worktreeBranch": snap.WorktreeBranch,
		})

	case "propose_padding_fix":
		var args struct {
			NodeID string `json:"nodeId"`
			Cols   int    `json:"cols"`
			Rows   int    `json:"rows"`
			Apply  bool   `json:"apply"`
		}
		_ = json.Unmarshal(rawArgs, &args)
		cols := args.Cols
		if cols <= 0 {
			cols = 58
		}
		rows := args.Rows
		if rows <= 0 {
			rows = 18
		}

		snap := s.ContextSnapshot()
		beforeEval := evaluateLayout(snap.IR, cols, rows, "")
		targetID := strings.TrimSpace(args.NodeID)
		if targetID == "" {
			if len(beforeEval.Diagnoses) > 0 {
				targetID = beforeEval.Diagnoses[0].NodeID
			} else {
				targetID = snap.SelectedID
			}
		}

		node := findIRNode(snap.IR.Root, snap.IR.Overlays, targetID)
		if node == nil {
			return textToolErr("node not found: " + targetID)
		}
		if node.Style == "" {
			return textToolErr("target node has no assigned style: " + targetID)
		}
		styleSpec, ok := snap.IR.Styles[node.Style]
		if !ok {
			return textToolErr("style not found on document: " + node.Style)
		}

		styleLocks := snap.IR.LockedProps[node.Style]
		lockReason := snap.IR.LockReasons[node.Style]
		paddingLocked := lockReason == "sync-disabled" || hasPropLock(styleLocks, "*") || hasPropLock(styleLocks, "padding")

		var targetDiag *OverflowDiagnosis
		for i := range beforeEval.Diagnoses {
			if beforeEval.Diagnoses[i].NodeID == targetID {
				cp := beforeEval.Diagnoses[i]
				targetDiag = &cp
				break
			}
		}

		beforePad := styleSpec.Padding
		proposedPad := beforePad
		if targetDiag != nil {
			if targetDiag.DeltaW > 0 {
				trimH := max(1, (targetDiag.DeltaW+1)/2)
				proposedPad[1] = max(0, beforePad[1]-trimH)
				proposedPad[3] = max(0, beforePad[3]-trimH)
			}
			if targetDiag.DeltaH > 0 {
				trimV := max(1, (targetDiag.DeltaH+1)/2)
				proposedPad[0] = max(0, beforePad[0]-trimV)
				proposedPad[2] = max(0, beforePad[2]-trimV)
			}
		} else {
			if proposedPad[1] > 0 || proposedPad[3] > 0 {
				proposedPad[1] = max(0, proposedPad[1]-1)
				proposedPad[3] = max(0, proposedPad[3]-1)
			} else if proposedPad[0] > 0 || proposedPad[2] > 0 {
				proposedPad[0] = max(0, proposedPad[0]-1)
				proposedPad[2] = max(0, proposedPad[2]-1)
			}
		}

		changed := proposedPad != beforePad
		candidateDoc := snap.IR
		candidateStyles := make(map[string]astsync.IRStyle, len(snap.IR.Styles))
		for k, v := range snap.IR.Styles {
			candidateStyles[k] = v
		}
		updatedStyle := styleSpec
		updatedStyle.Padding = proposedPad
		candidateStyles[node.Style] = updatedStyle
		candidateDoc.Styles = candidateStyles

		afterEval := evaluateLayout(candidateDoc, cols, rows, "")
		stillOverflows := false
		for _, d := range afterEval.Diagnoses {
			if d.NodeID == targetID {
				stillOverflows = true
				break
			}
		}

		applied := false
		if args.Apply && changed && !paddingLocked {
			s.mu.Lock()
			nextStyles := make(map[string]astsync.IRStyle, len(s.ir.Styles))
			for k, v := range s.ir.Styles {
				nextStyles[k] = v
			}
			if cur, exists := nextStyles[node.Style]; exists {
				cur.Padding = proposedPad
				nextStyles[node.Style] = cur
			}
			s.ir.Styles = nextStyles
			updatedDoc := s.ir
			cb := s.onIRUpdate
			s.mu.Unlock()
			applied = true
			if cb != nil {
				cb(updatedDoc)
			}
		}

		goSnippet := fmt.Sprintf("Padding(%d, %d, %d, %d)", proposedPad[0], proposedPad[1], proposedPad[2], proposedPad[3])
		summary := fmt.Sprintf("Propose updating %s (%s) from Padding(%d, %d, %d, %d) to %s at %d×%d", node.ID, node.Style, beforePad[0], beforePad[1], beforePad[2], beforePad[3], goSnippet, cols, rows)
		if !changed {
			summary = fmt.Sprintf("Padding on %s (%s) is already minimal (%d, %d, %d, %d)", node.ID, node.Style, beforePad[0], beforePad[1], beforePad[2], beforePad[3])
		} else if paddingLocked {
			summary = fmt.Sprintf("Padding on %s (%s) is locked (%s); inspect // @tui:sync-disable before modifying %s", node.ID, node.Style, lockReason, goSnippet)
		}

		return textToolOK(map[string]any{
			"nodeId":          node.ID,
			"styleName":       node.Style,
			"cols":            cols,
			"rows":            rows,
			"beforePadding":   beforePad,
			"proposedPadding": proposedPad,
			"changed":         changed,
			"locked":          paddingLocked,
			"lockReason":      lockReason,
			"overflowsBefore": targetDiag != nil,
			"overflowsAfter":  stillOverflows,
			"resolved":        targetDiag != nil && !stillOverflows,
			"applied":         applied,
			"goSnippet":       goSnippet,
			"summary":         summary,
		})

	case "validate_all_sizes":
		var args struct {
			Sizes []SizeSpec `json:"sizes"`
		}
		_ = json.Unmarshal(rawArgs, &args)
		sizes := args.Sizes
		if len(sizes) == 0 {
			sizes = DefaultMatrixSizes()
		}

		snap := s.ContextSnapshot()
		type presetResult struct {
			Title         string              `json:"title"`
			Cols          int                 `json:"cols"`
			Rows          int                 `json:"rows"`
			Fits          bool                `json:"fits"`
			OverflowCount int                 `json:"overflowCount"`
			Diagnoses     []OverflowDiagnosis `json:"diagnoses,omitempty"`
		}
		results := make([]presetResult, 0, len(sizes))
		failingCount := 0
		for _, sz := range sizes {
			title := strings.TrimSpace(sz.Title)
			if title == "" {
				title = fmt.Sprintf("%d×%d", sz.Cols, sz.Rows)
			}
			eval := evaluateLayout(snap.IR, sz.Cols, sz.Rows, title)
			fits := len(eval.Diagnoses) == 0
			if !fits {
				failingCount++
			}
			results = append(results, presetResult{
				Title:         title,
				Cols:          eval.Cols,
				Rows:          eval.Rows,
				Fits:          fits,
				OverflowCount: len(eval.Diagnoses),
				Diagnoses:     eval.Diagnoses,
			})
		}

		return textToolOK(map[string]any{
			"allFit":       failingCount == 0,
			"checkedCount": len(results),
			"failingCount": failingCount,
			"results":      results,
		})

	case "explain_overflow":
		var args struct {
			NodeID string `json:"nodeId"`
			Cols   int    `json:"cols"`
			Rows   int    `json:"rows"`
		}
		_ = json.Unmarshal(rawArgs, &args)
		cols := args.Cols
		if cols <= 0 {
			cols = 58
		}
		rows := args.Rows
		if rows <= 0 {
			rows = 18
		}

		snap := s.ContextSnapshot()
		eval := evaluateLayout(snap.IR, cols, rows, "")
		targetID := strings.TrimSpace(args.NodeID)
		if targetID == "" {
			if len(eval.Diagnoses) > 0 {
				targetID = eval.Diagnoses[0].NodeID
			} else {
				targetID = snap.SelectedID
			}
		} else if findIRNode(snap.IR.Root, snap.IR.Overlays, targetID) == nil {
			return textToolErr("node not found: " + targetID)
		}

		for _, diag := range eval.Diagnoses {
			if diag.NodeID == targetID {
				return textToolOK(map[string]any{
					"overflows":       true,
					"nodeId":          diag.NodeID,
					"nodeLabel":       diag.NodeLabel,
					"styleName":       diag.StyleName,
					"cols":            diag.Cols,
					"rows":            diag.Rows,
					"headline":        diag.Headline,
					"copyText":        diag.CopyText,
					"allocatedW":      diag.AllocatedW,
					"allocatedH":      diag.AllocatedH,
					"actualW":         diag.ActualW,
					"actualH":         diag.ActualH,
					"deltaW":          diag.DeltaW,
					"deltaH":          diag.DeltaH,
					"deltaSummary":    diag.DeltaSummary,
					"failingProperty": diag.FailingProperty,
					"causeRule":       diag.CauseRule,
					"goFile":          diag.GoFile,
					"goSymbol":        diag.GoSymbol,
					"locked":          diag.Locked,
					"lockReason":      diag.LockReason,
					"fixes":           diag.Suggestions,
				})
			}
		}

		var bounds *NodeTelemetry
		for i := range eval.Nodes {
			if eval.Nodes[i].ID == targetID {
				cp := eval.Nodes[i]
				bounds = &cp
				break
			}
		}
		return textToolOK(map[string]any{
			"overflows": false,
			"nodeId":    targetID,
			"cols":      eval.Cols,
			"rows":      eval.Rows,
			"summary":   fmt.Sprintf("%s fits cleanly within %d x %d", targetID, eval.Cols, eval.Rows),
			"bounds":    bounds,
		})

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
