package astsync

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/parser"
	"go/token"
	"sort"
	"strings"

	"github.com/dave/dst"
	"github.com/dave/dst/decorator"
)

func collectDeclsMap(src string) (funcs map[string]string, types map[string]string, err error) {
	funcs = map[string]string{}
	types = map[string]string{}
	fset := token.NewFileSet()
	f, err := decorator.ParseFile(fset, "diff.go", src, parser.ParseComments)
	if err != nil {
		return funcs, types, err
	}
	for _, decl := range f.Decls {
		switch d := decl.(type) {
		case *dst.FuncDecl:
			if d.Name == nil {
				continue
			}
			key := d.Name.Name
			if d.Recv != nil && len(d.Recv.List) > 0 {
				var recvBuf bytes.Buffer
				_ = decorator.Fprint(&recvBuf, &dst.File{
					Name: dst.NewIdent("p"),
					Decls: []dst.Decl{
						&dst.FuncDecl{
							Name: d.Name,
							Recv: d.Recv,
							Type: &dst.FuncType{},
						},
					},
				})
				_ = recvBuf
				key = fmt.Sprintf("(%s).%s", exprQuickText(d.Recv.List[0].Type), d.Name.Name)
			}
			var buf bytes.Buffer
			if err := decorator.Fprint(&buf, &dst.File{Name: dst.NewIdent("p"), Decls: []dst.Decl{d}}); err == nil {
				funcs[key] = buf.String()
			}
		case *dst.GenDecl:
			if d.Tok == token.TYPE {
				for _, spec := range d.Specs {
					if ts, ok := spec.(*dst.TypeSpec); ok && ts.Name != nil {
						var buf bytes.Buffer
						gd := &dst.GenDecl{Tok: token.TYPE, Specs: []dst.Spec{ts}}
						if err := decorator.Fprint(&buf, &dst.File{Name: dst.NewIdent("p"), Decls: []dst.Decl{gd}}); err == nil {
							types[ts.Name.Name] = buf.String()
						}
					}
				}
			}
		}
	}
	return funcs, types, nil
}

func flattenIRNodes(root *IRNode, overlays []IROverlay) map[string]IRNode {
	m := map[string]IRNode{}
	var walk func(n IRNode)
	walk = func(n IRNode) {
		if n.ID != "" {
			m[n.ID] = n
		}
		for _, ch := range n.Children {
			walk(ch)
		}
	}
	if root != nil {
		walk(*root)
	}
	for _, ov := range overlays {
		walk(ov.Node)
	}
	return m
}

func summarizeIRStyleDiff(a, b IRStyle) []string {
	var changes []string
	if a.Border != b.Border {
		changes = append(changes, fmt.Sprintf("border: %s -> %s", a.Border, b.Border))
	}
	if !equalBorderEdges(a.BorderEdges, b.BorderEdges) {
		changes = append(changes, "borderEdges updated")
	}
	if !equalCustomBorder(a.CustomBorder, b.CustomBorder) {
		changes = append(changes, "customBorder updated")
	}
	if a.BorderColor != b.BorderColor {
		changes = append(changes, fmt.Sprintf("borderColor: %s -> %s", a.BorderColor, b.BorderColor))
	}
	if a.Fg != b.Fg {
		changes = append(changes, fmt.Sprintf("fg: %s -> %s", a.Fg, b.Fg))
	}
	if a.Bg != b.Bg {
		changes = append(changes, fmt.Sprintf("bg: %s -> %s", a.Bg, b.Bg))
	}
	if a.Bold != b.Bold {
		changes = append(changes, fmt.Sprintf("bold: %v", b.Bold))
	}
	if a.Italic != b.Italic {
		changes = append(changes, fmt.Sprintf("italic: %v", b.Italic))
	}
	if a.Faint != b.Faint {
		changes = append(changes, fmt.Sprintf("faint: %v", b.Faint))
	}
	if a.Underline != b.Underline {
		changes = append(changes, fmt.Sprintf("underline: %v", b.Underline))
	}
	if a.Strikethrough != b.Strikethrough {
		changes = append(changes, fmt.Sprintf("strikethrough: %v", b.Strikethrough))
	}
	if a.Truncate != b.Truncate {
		changes = append(changes, fmt.Sprintf("truncate: %v", b.Truncate))
	}
	if a.MaxWidth != b.MaxWidth {
		changes = append(changes, fmt.Sprintf("maxWidth: %d", b.MaxWidth))
	}
	if a.MaxHeight != b.MaxHeight {
		changes = append(changes, fmt.Sprintf("maxHeight: %d", b.MaxHeight))
	}
	if a.Padding != b.Padding {
		changes = append(changes, fmt.Sprintf("padding: %v", b.Padding))
	}
	if a.Margin != b.Margin {
		changes = append(changes, fmt.Sprintf("margin: %v", b.Margin))
	}
	if a.AlignH != b.AlignH || a.AlignV != b.AlignV {
		changes = append(changes, fmt.Sprintf("align: %s/%s", b.AlignH, b.AlignV))
	}
	if a.PlaceH != b.PlaceH || a.PlaceV != b.PlaceV {
		changes = append(changes, fmt.Sprintf("place: %s/%s", b.PlaceH, b.PlaceV))
	}
	return changes
}

func equalBorderEdges(a, b *[4]bool) bool {
	ea := [4]bool{true, true, true, true}
	eb := [4]bool{true, true, true, true}
	if a != nil {
		ea = *a
	}
	if b != nil {
		eb = *b
	}
	return ea == eb
}

func equalCustomBorder(a, b *IRCustomBorder) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func equalIntPtr(a, b *int) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func computeLineDiff(beforeText, afterText string) ([]DiffLine, int, int) {
	a := strings.Split(beforeText, "\n")
	b := strings.Split(afterText, "\n")
	m, n := len(a), len(b)

	if m*n > 250000 {
		var out []DiffLine
		added, removed := 0, 0
		maxLen := max(m, n)
		for i := 0; i < maxLen; i++ {
			var as, bs string
			hasA, hasB := i < m, i < n
			if hasA {
				as = a[i]
			}
			if hasB {
				bs = b[i]
			}
			if hasA && hasB && as == bs {
				out = append(out, DiffLine{Type: "ctx", OldLine: i + 1, NewLine: i + 1, Text: bs})
			} else {
				if hasA {
					out = append(out, DiffLine{Type: "del", OldLine: i + 1, Text: as})
					removed++
				}
				if hasB {
					out = append(out, DiffLine{Type: "add", NewLine: i + 1, Text: bs})
					added++
				}
			}
		}
		return out, added, removed
	}

	dp := make([][]int, m+1)
	for i := range dp {
		dp[i] = make([]int, n+1)
	}
	for i := m - 1; i >= 0; i-- {
		for j := n - 1; j >= 0; j-- {
			if a[i] == b[j] {
				dp[i][j] = 1 + dp[i+1][j+1]
			} else if dp[i+1][j] >= dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}

	var lines []DiffLine
	added, removed := 0, 0
	i, j := 0, 0
	for i < m && j < n {
		if a[i] == b[j] {
			lines = append(lines, DiffLine{Type: "ctx", OldLine: i + 1, NewLine: j + 1, Text: a[i]})
			i++
			j++
		} else if dp[i+1][j] >= dp[i][j+1] {
			lines = append(lines, DiffLine{Type: "del", OldLine: i + 1, Text: a[i]})
			removed++
			i++
		} else {
			lines = append(lines, DiffLine{Type: "add", NewLine: j + 1, Text: b[j]})
			added++
			j++
		}
	}
	for i < m {
		lines = append(lines, DiffLine{Type: "del", OldLine: i + 1, Text: a[i]})
		removed++
		i++
	}
	for j < n {
		lines = append(lines, DiffLine{Type: "add", NewLine: j + 1, Text: b[j]})
		added++
		j++
	}
	return lines, added, removed
}

// ComputeGoDiff performs structural Go AST diffing via dave/dst plus LCS line diffs.
func ComputeGoDiff(beforeGo, afterGo string) GoDiffResult {
	var res GoDiffResult
	lines, added, removed := computeLineDiff(beforeGo, afterGo)
	res.Lines = lines
	res.Added = added
	res.Removed = removed

	beforeParsed := ParseGoSource(beforeGo)
	afterParsed := ParseGoSource(afterGo)
	if beforeParsed.Error != "" || afterParsed.Error != "" {
		// Still return line diff for non-Go files (go.mod, README.md, demo.tape, etc.)
		if beforeParsed.Error != "" {
			res.Error = beforeParsed.Error
		} else {
			res.Error = afterParsed.Error
		}
		return res
	}

	var deltas []AstDelta

	// 1. Layout nodes
	prevNodes := flattenIRNodes(beforeParsed.Root, beforeParsed.Overlays)
	currNodes := flattenIRNodes(afterParsed.Root, afterParsed.Overlays)
	nodeIDs := make([]string, 0, len(currNodes))
	for id := range currNodes {
		nodeIDs = append(nodeIDs, id)
	}
	sort.Strings(nodeIDs)
	for _, id := range nodeIDs {
		node := currNodes[id]
		old, exists := prevNodes[id]
		if !exists {
			deltas = append(deltas, AstDelta{
				Kind:     "added",
				Category: "Node",
				Bucket:   "layout_overlays",
				Symbol:   "#" + id,
				Detail:   fmt.Sprintf("%s (%s)", node.Kind, node.ContentType),
			})
		} else {
			var diffs []string
			if old.Kind != node.Kind {
				diffs = append(diffs, fmt.Sprintf("kind %s -> %s", old.Kind, node.Kind))
			}
			if old.Style != node.Style {
				diffs = append(diffs, fmt.Sprintf("style %s -> %s", old.Style, node.Style))
			}
			if old.Width != node.Width || old.Height != node.Height {
				diffs = append(diffs, "size/breakpoint updated")
			}
			if old.Content != node.Content {
				diffs = append(diffs, "content updated")
			}
			if len(diffs) > 0 {
				deltas = append(deltas, AstDelta{
					Kind:     "modified",
					Category: "Node",
					Bucket:   "layout_overlays",
					Symbol:   "#" + id,
					Detail:   strings.Join(diffs, ", "),
				})
			}
		}
	}
	prevNodeIDs := make([]string, 0, len(prevNodes))
	for id := range prevNodes {
		prevNodeIDs = append(prevNodeIDs, id)
	}
	sort.Strings(prevNodeIDs)
	for _, id := range prevNodeIDs {
		if _, exists := currNodes[id]; !exists {
			deltas = append(deltas, AstDelta{
				Kind:     "removed",
				Category: "Node",
				Bucket:   "layout_overlays",
				Symbol:   "#" + id,
				Detail:   prevNodes[id].Kind,
			})
		}
	}

	// 2. Styles
	styleNames := make([]string, 0, len(afterParsed.Styles))
	for k := range afterParsed.Styles {
		styleNames = append(styleNames, k)
	}
	sort.Strings(styleNames)
	for _, name := range styleNames {
		st := afterParsed.Styles[name]
		oldSt, ok := beforeParsed.Styles[name]
		if !ok {
			deltas = append(deltas, AstDelta{
				Kind:     "added",
				Category: "Style",
				Bucket:   "styles_tokens",
				Symbol:   name,
				Detail:   fmt.Sprintf("border=%s", st.Border),
			})
		} else if changes := summarizeIRStyleDiff(oldSt, st); len(changes) > 0 {
			deltas = append(deltas, AstDelta{
				Kind:     "modified",
				Category: "Style",
				Bucket:   "styles_tokens",
				Symbol:   name,
				Detail:   strings.Join(changes, ", "),
			})
		}
	}
	prevStyleNames := make([]string, 0, len(beforeParsed.Styles))
	for k := range beforeParsed.Styles {
		prevStyleNames = append(prevStyleNames, k)
	}
	sort.Strings(prevStyleNames)
	for _, name := range prevStyleNames {
		if _, ok := afterParsed.Styles[name]; !ok {
			deltas = append(deltas, AstDelta{
				Kind:     "removed",
				Category: "Style",
				Bucket:   "styles_tokens",
				Symbol:   name,
				Detail:   "style removed",
			})
		}
	}

	// 3. Tokens
	tokenNames := make([]string, 0, len(afterParsed.Tokens))
	for k := range afterParsed.Tokens {
		tokenNames = append(tokenNames, k)
	}
	sort.Strings(tokenNames)
	for _, name := range tokenNames {
		pair := afterParsed.Tokens[name]
		oldPair, ok := beforeParsed.Tokens[name]
		if !ok {
			deltas = append(deltas, AstDelta{
				Kind:     "added",
				Category: "Token",
				Bucket:   "styles_tokens",
				Symbol:   "$" + name,
				Detail:   fmt.Sprintf("%s / %s", pair.Light, pair.Dark),
			})
		} else if oldPair != pair {
			deltas = append(deltas, AstDelta{
				Kind:     "modified",
				Category: "Token",
				Bucket:   "styles_tokens",
				Symbol:   "$" + name,
				Detail:   fmt.Sprintf("%s/%s -> %s/%s", oldPair.Light, oldPair.Dark, pair.Light, pair.Dark),
			})
		}
	}

	// 3b. Overlays
	prevOverlays := make(map[string]IROverlay, len(beforeParsed.Overlays))
	for _, ov := range beforeParsed.Overlays {
		prevOverlays[ov.ID] = ov
	}
	currOverlayIDs := make(map[string]bool, len(afterParsed.Overlays))
	for _, ov := range afterParsed.Overlays {
		currOverlayIDs[ov.ID] = true
		oldOv, ok := prevOverlays[ov.ID]
		if !ok {
			deltas = append(deltas, AstDelta{
				Kind:     "added",
				Category: "Overlay",
				Bucket:   "layout_overlays",
				Symbol:   ov.ID,
				Detail:   fmt.Sprintf("anchor=%s, z=%d", ov.Anchor, ov.Z),
			})
		} else if oldOv.Visible != ov.Visible || oldOv.Anchor != ov.Anchor || oldOv.Z != ov.Z || !equalIntPtr(oldOv.PlaceX, ov.PlaceX) || !equalIntPtr(oldOv.PlaceY, ov.PlaceY) {
			deltas = append(deltas, AstDelta{
				Kind:     "modified",
				Category: "Overlay",
				Bucket:   "layout_overlays",
				Symbol:   ov.ID,
				Detail:   fmt.Sprintf("visible=%v, anchor=%s, z=%d", ov.Visible, ov.Anchor, ov.Z),
			})
		}
	}
	for _, ov := range beforeParsed.Overlays {
		if !currOverlayIDs[ov.ID] {
			deltas = append(deltas, AstDelta{
				Kind:     "removed",
				Category: "Overlay",
				Bucket:   "layout_overlays",
				Symbol:   ov.ID,
				Detail:   "overlay removed",
			})
		}
	}

	// 4. tea.View flags
	if beforeParsed.View != nil || afterParsed.View != nil {
		pv := ViewConfig{AltScreen: true, MouseMode: "cell"}
		if beforeParsed.View != nil {
			pv = *beforeParsed.View
		}
		cv := pv
		if afterParsed.View != nil {
			cv = *afterParsed.View
		}
		var vDiffs []string
		if pv.AltScreen != cv.AltScreen {
			vDiffs = append(vDiffs, fmt.Sprintf("AltScreen=%v", cv.AltScreen))
		}
		if pv.MouseMode != cv.MouseMode {
			vDiffs = append(vDiffs, fmt.Sprintf("MouseMode=%s", cv.MouseMode))
		}
		if pv.WindowTitle != cv.WindowTitle {
			vDiffs = append(vDiffs, fmt.Sprintf("WindowTitle=%q", cv.WindowTitle))
		}
		if pv.ReportFocus != cv.ReportFocus {
			vDiffs = append(vDiffs, fmt.Sprintf("ReportFocus=%v", cv.ReportFocus))
		}
		if pv.DisableBracketedPasteMode != cv.DisableBracketedPasteMode {
			vDiffs = append(vDiffs, fmt.Sprintf("DisableBracketedPasteMode=%v", cv.DisableBracketedPasteMode))
		}
		if pv.CursorMode != cv.CursorMode || pv.CursorX != cv.CursorX || pv.CursorY != cv.CursorY {
			vDiffs = append(vDiffs, fmt.Sprintf("Cursor=%s(%d,%d)", cv.CursorMode, cv.CursorX, cv.CursorY))
		}
		if len(vDiffs) > 0 {
			deltas = append(deltas, AstDelta{
				Kind:     "modified",
				Category: "View",
				Bucket:   "view_flags",
				Symbol:   "tea.View",
				Detail:   strings.Join(vDiffs, ", "),
			})
		}
	}

	// 5. Structural Types & Functions + Hand-Owned Untouched
	bFuncs, bTypes, bErr := collectDeclsMap(beforeGo)
	aFuncs, aTypes, aErr := collectDeclsMap(afterGo)
	if bErr == nil && aErr == nil {
		typeNames := make([]string, 0, len(aTypes))
		for k := range aTypes {
			typeNames = append(typeNames, k)
		}
		sort.Strings(typeNames)
		for _, tn := range typeNames {
			if _, ok := bTypes[tn]; !ok {
				deltas = append(deltas, AstDelta{Kind: "added", Category: "Type", Bucket: "layout_overlays", Symbol: tn, Detail: "type added"})
			} else if bTypes[tn] != aTypes[tn] {
				deltas = append(deltas, AstDelta{Kind: "modified", Category: "Type", Bucket: "layout_overlays", Symbol: tn, Detail: "struct/type fields updated"})
			}
		}
		for tn := range bTypes {
			if _, ok := aTypes[tn]; !ok {
				deltas = append(deltas, AstDelta{Kind: "removed", Category: "Type", Bucket: "layout_overlays", Symbol: tn, Detail: "type removed"})
			}
		}

		funcNames := make([]string, 0, len(aFuncs))
		for k := range aFuncs {
			funcNames = append(funcNames, k)
		}
		sort.Strings(funcNames)
		for _, fn := range funcNames {
			if _, ok := bFuncs[fn]; !ok {
				deltas = append(deltas, AstDelta{Kind: "added", Category: "Func", Bucket: "layout_overlays", Symbol: fn, Detail: "function added"})
			} else if bFuncs[fn] != aFuncs[fn] {
				deltas = append(deltas, AstDelta{Kind: "modified", Category: "Func", Bucket: "layout_overlays", Symbol: fn, Detail: "implementation updated"})
			} else if !strings.HasSuffix(fn, ".NewTheme") && !strings.HasSuffix(fn, ".RenderApp") && fn != "NewTheme" && fn != "RenderApp" && fn != "ld" && fn != "lightDark" {
				deltas = append(deltas, AstDelta{Kind: "untouched", Category: "Func", Bucket: "locked_untouched", Symbol: fn, Detail: "hand-owned logic untouched"})
			}
		}
		for fn := range bFuncs {
			if _, ok := aFuncs[fn]; !ok {
				deltas = append(deltas, AstDelta{Kind: "removed", Category: "Func", Bucket: "layout_overlays", Symbol: fn, Detail: "function removed"})
			}
		}
	}

	// 6. @tui:sync-disable locks & dynamic Go expressions preserved
	if len(afterParsed.LockReasons) > 0 {
		lockSyms := make([]string, 0, len(afterParsed.LockReasons))
		for sym := range afterParsed.LockReasons {
			lockSyms = append(lockSyms, sym)
		}
		sort.Strings(lockSyms)
		for _, sym := range lockSyms {
			reason := afterParsed.LockReasons[sym]
			detail := "Dynamic Go expression preserved"
			if reason == "sync-disabled" {
				detail = "Locked · // @tui:sync-disable"
			} else if exprMap, ok := afterParsed.DynamicExprs[sym]; ok && len(exprMap) > 0 {
				var exprParts []string
				for pk, ev := range exprMap {
					exprParts = append(exprParts, fmt.Sprintf("%s=%s", pk, ev))
				}
				sort.Strings(exprParts)
				detail = "Dynamic Go: " + strings.Join(exprParts, ", ")
			}
			deltas = append(deltas, AstDelta{
				Kind:     "locked",
				Category: "Lock",
				Bucket:   "locked_untouched",
				Symbol:   sym,
				Detail:   detail,
			})
		}
	}

	res.Deltas = deltas
	return res
}

// ComputeGoDiffJSON is a convenience wrapper for WASM callers.
func ComputeGoDiffJSON(beforeGo, afterGo string) string {
	b, _ := json.Marshal(ComputeGoDiff(beforeGo, afterGo))
	return string(b)
}
