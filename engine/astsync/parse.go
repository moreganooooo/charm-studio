package astsync

import (
	"bytes"
	"fmt"
	"go/parser"
	"go/token"
	"sort"
	"strconv"
	"strings"

	"github.com/dave/dst"
	"github.com/dave/dst/decorator"
)

func hasDirective(decs dst.Decorations, directive string) bool {
	for _, d := range decs {
		if strings.Contains(d, directive) {
			return true
		}
	}
	return false
}

func hasSyncDisableDirective(decs dst.Decorations) bool {
	return hasDirective(decs, "@tui:sync-disable") || hasDirective(decs, "@tui:block-disable")
}

func extractAnnotation(decs dst.Decorations, prefix string) string {
	for _, d := range decs {
		idx := strings.Index(d, prefix)
		if idx < 0 {
			continue
		}
		rest := strings.TrimSpace(d[idx+len(prefix):])
		// Stop at whitespace or end of line
		fields := strings.Fields(rest)
		if len(fields) > 0 {
			return strings.TrimSpace(fields[0])
		}
	}
	return ""
}

func fileHasSyncDisable(f *dst.File, rawSrc string) bool {
	for _, line := range strings.Split(rawSrc, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, "@tui:sync-disable") {
			if strings.HasPrefix(trimmed, "//") || strings.HasPrefix(trimmed, "/*") || strings.HasPrefix(trimmed, "package ") {
				return true
			}
		}
		if strings.HasPrefix(trimmed, "package ") {
			break
		}
	}
	return hasDirective(f.Decs.Start, "@tui:sync-disable") || hasDirective(f.Decs.End, "@tui:sync-disable")
}

func rawExprText(e dst.Expr) string {
	if e == nil {
		return ""
	}
	var buf bytes.Buffer
	decl := &dst.GenDecl{
		Tok: token.VAR,
		Specs: []dst.Spec{
			&dst.ValueSpec{
				Names:  []*dst.Ident{dst.NewIdent("_")},
				Values: []dst.Expr{dst.Clone(e).(dst.Expr)},
			},
		},
	}
	if err := decorator.Fprint(&buf, &dst.File{Name: dst.NewIdent("p"), Decls: []dst.Decl{decl}}); err == nil {
		txt := strings.TrimSpace(buf.String())
		if idx := strings.Index(txt, "var _ = "); idx >= 0 {
			return strings.TrimSpace(txt[idx+len("var _ = "):])
		}
	}
	return exprQuickText(e)
}

func formatCallDynamicExpr(selName string, args []dst.Expr) string {
	parts := make([]string, 0, len(args))
	for _, a := range args {
		if t := rawExprText(a); t != "" {
			parts = append(parts, t)
		}
	}
	if len(parts) == 0 {
		return selName + "()"
	}
	return selName + "(" + strings.Join(parts, ", ") + ")"
}

func unquoteLit(expr dst.Expr) (string, bool) {
	bl, ok := expr.(*dst.BasicLit)
	if !ok || bl.Kind != token.STRING {
		return "", false
	}
	s, err := strconv.Unquote(bl.Value)
	if err != nil {
		return strings.Trim(bl.Value, `"`), true
	}
	return s, true
}

func intLitVal(expr dst.Expr) (int, bool) {
	bl, ok := expr.(*dst.BasicLit)
	if !ok || bl.Kind != token.INT {
		return 0, false
	}
	v, err := strconv.Atoi(bl.Value)
	return v, err == nil
}

func boolIdentVal(expr dst.Expr) (bool, bool) {
	id, ok := expr.(*dst.Ident)
	if !ok {
		return false, false
	}
	if id.Name == "true" {
		return true, true
	}
	if id.Name == "false" {
		return false, true
	}
	return false, false
}

func strLit(s string) *dst.BasicLit {
	return &dst.BasicLit{Kind: token.STRING, Value: strconv.Quote(s)}
}

func intLit(n int) *dst.BasicLit {
	return &dst.BasicLit{Kind: token.INT, Value: strconv.Itoa(n)}
}

func boolIdent(b bool) *dst.Ident {
	if b {
		return dst.NewIdent("true")
	}
	return dst.NewIdent("false")
}

func lowerFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToLower(s[:1]) + s[1:]
}

func upperFirst(s string) string {
	if s == "" {
		return s
	}
	return strings.ToUpper(s[:1]) + s[1:]
}

func appendUniqueStr(slice []string, item string) []string {
	for _, s := range slice {
		if s == item {
			return slice
		}
	}
	return append(slice, item)
}

func extractHexFromColorExpr(e dst.Expr) (string, bool) {
	if s, ok := unquoteLit(e); ok && strings.HasPrefix(s, "#") {
		return s, true
	}
	if call, ok := e.(*dst.CallExpr); ok {
		if sel, ok := call.Fun.(*dst.SelectorExpr); ok && sel.Sel.Name == "Color" && len(call.Args) == 1 {
			if s, ok := unquoteLit(call.Args[0]); ok && strings.HasPrefix(s, "#") {
				return s, true
			}
		}
	}
	return "", false
}

func parseTokenExpr(e dst.Expr) (TokenPair, bool) {
	// AdaptiveColor{Light: "#...", Dark: "#..."}
	if comp, ok := e.(*dst.CompositeLit); ok {
		var l, d string
		for _, elt := range comp.Elts {
			kv, ok := elt.(*dst.KeyValueExpr)
			if !ok {
				continue
			}
			kIdent, ok := kv.Key.(*dst.Ident)
			if !ok {
				continue
			}
			valStr, ok := unquoteLit(kv.Value)
			if !ok {
				continue
			}
			if kIdent.Name == "Light" {
				l = valStr
			} else if kIdent.Name == "Dark" {
				d = valStr
			}
		}
		if l != "" && d != "" {
			return TokenPair{Light: l, Dark: d}, true
		}
	}
	// lipgloss.Color("#...") or ld(...) or lightDark(...)
	if call, ok := e.(*dst.CallExpr); ok {
		if len(call.Args) == 2 {
			l, lOk := extractHexFromColorExpr(call.Args[0])
			d, dOk := extractHexFromColorExpr(call.Args[1])
			if lOk && dOk {
				return TokenPair{Light: l, Dark: d}, true
			}
		}
		if hex, ok := extractHexFromColorExpr(call); ok {
			return TokenPair{Light: hex, Dark: hex}, true
		}
	}
	return TokenPair{}, false
}

func readQuadArgs(args []dst.Expr) ([4]int, bool) {
	var nums []int
	for _, a := range args {
		if v, ok := intLitVal(a); ok {
			nums = append(nums, max(0, v))
		} else {
			return [4]int{0, 0, 0, 0}, false
		}
	}
	switch len(nums) {
	case 1:
		return [4]int{nums[0], nums[0], nums[0], nums[0]}, true
	case 2:
		return [4]int{nums[0], nums[1], nums[0], nums[1]}, true
	case 3:
		return [4]int{nums[0], nums[1], nums[2], nums[1]}, true
	case 4:
		return [4]int{nums[0], nums[1], nums[2], nums[3]}, true
	default:
		return [4]int{0, 0, 0, 0}, false
	}
}

func parseLipAlign(expr dst.Expr) (string, bool) {
	sel, ok := expr.(*dst.SelectorExpr)
	if !ok {
		return "", false
	}
	switch sel.Sel.Name {
	case "Left":
		return "left", true
	case "Center":
		return "center", true
	case "Right":
		return "right", true
	case "Top":
		return "top", true
	case "Bottom":
		return "bottom", true
	default:
		return "", false
	}
}

func parseStyleChainWithLocks(e dst.Expr, resolveArg func(dst.Expr) (string, bool)) (IRStyle, []string, map[string]string, bool) {
	var calls []*dst.CallExpr
	cur := e
	isNewStyle := false
	for {
		call, ok := cur.(*dst.CallExpr)
		if !ok {
			break
		}
		calls = append(calls, call)
		sel, ok := call.Fun.(*dst.SelectorExpr)
		if !ok {
			break
		}
		if sel.Sel.Name == "NewStyle" {
			isNewStyle = true
			break
		}
		cur = sel.X
	}
	if !isNewStyle {
		return IRStyle{}, nil, nil, false
	}

	st := IRStyle{
		Border:      "none",
		BorderEdges: &[4]bool{true, true, true, true},
		Fg:          "$textMain",
		Padding:     [4]int{0, 1, 0, 1},
		Margin:      [4]int{0, 0, 0, 0},
	}
	var locked []string
	dynExprs := map[string]string{}
	recordDyn := func(prop, raw string) {
		locked = appendUniqueStr(locked, prop)
		if raw != "" {
			if prev, exists := dynExprs[prop]; exists && !strings.Contains(prev, raw) {
				dynExprs[prop] = prev + " · " + raw
			} else {
				dynExprs[prop] = raw
			}
		}
	}

	// Walk root -> outer calls
	for i := len(calls) - 1; i >= 0; i-- {
		call := calls[i]
		sel, ok := call.Fun.(*dst.SelectorExpr)
		if !ok {
			continue
		}
		switch sel.Sel.Name {
		case "NewStyle":
			// root
		case "Border":
			matched := false
			if len(call.Args) >= 1 {
				if bCall, ok := call.Args[0].(*dst.CallExpr); ok {
					if bSel, ok := bCall.Fun.(*dst.SelectorExpr); ok {
						switch bSel.Sel.Name {
						case "RoundedBorder":
							st.Border = "rounded"
							matched = true
						case "ThickBorder":
							st.Border = "thick"
							matched = true
						case "DoubleBorder":
							st.Border = "double"
							matched = true
						case "NormalBorder":
							st.Border = "normal"
							matched = true
						}
					}
				}
			}
			if !matched {
				recordDyn("border", formatCallDynamicExpr("Border", call.Args))
			}
		case "BorderTop", "BorderRight", "BorderBottom", "BorderLeft":
			if len(call.Args) == 1 {
				if b, ok := boolIdentVal(call.Args[0]); ok {
					switch sel.Sel.Name {
					case "BorderTop":
						st.BorderEdges[0] = b
					case "BorderRight":
						st.BorderEdges[1] = b
					case "BorderBottom":
						st.BorderEdges[2] = b
					case "BorderLeft":
						st.BorderEdges[3] = b
					}
				} else {
					recordDyn("border", formatCallDynamicExpr(sel.Sel.Name, call.Args))
				}
			}
		case "Padding":
			if q, ok := readQuadArgs(call.Args); ok {
				st.Padding = q
			} else {
				recordDyn("padding", formatCallDynamicExpr("Padding", call.Args))
			}
		case "PaddingHorizontal":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Padding[1], st.Padding[3] = max(0, v), max(0, v)
				} else {
					recordDyn("padding", formatCallDynamicExpr("PaddingHorizontal", call.Args))
				}
			}
		case "PaddingVertical":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Padding[0], st.Padding[2] = max(0, v), max(0, v)
				} else {
					recordDyn("padding", formatCallDynamicExpr("PaddingVertical", call.Args))
				}
			}
		case "PaddingTop":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Padding[0] = max(0, v)
				} else {
					recordDyn("padding", formatCallDynamicExpr("PaddingTop", call.Args))
				}
			}
		case "PaddingRight":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Padding[1] = max(0, v)
				} else {
					recordDyn("padding", formatCallDynamicExpr("PaddingRight", call.Args))
				}
			}
		case "PaddingBottom":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Padding[2] = max(0, v)
				} else {
					recordDyn("padding", formatCallDynamicExpr("PaddingBottom", call.Args))
				}
			}
		case "PaddingLeft":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Padding[3] = max(0, v)
				} else {
					recordDyn("padding", formatCallDynamicExpr("PaddingLeft", call.Args))
				}
			}
		case "Margin":
			if q, ok := readQuadArgs(call.Args); ok {
				st.Margin = q
			} else {
				recordDyn("margin", formatCallDynamicExpr("Margin", call.Args))
			}
		case "MarginTop":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Margin[0] = max(0, v)
				} else {
					recordDyn("margin", formatCallDynamicExpr("MarginTop", call.Args))
				}
			}
		case "MarginRight":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Margin[1] = max(0, v)
				} else {
					recordDyn("margin", formatCallDynamicExpr("MarginRight", call.Args))
				}
			}
		case "MarginBottom":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Margin[2] = max(0, v)
				} else {
					recordDyn("margin", formatCallDynamicExpr("MarginBottom", call.Args))
				}
			}
		case "MarginLeft":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					st.Margin[3] = max(0, v)
				} else {
					recordDyn("margin", formatCallDynamicExpr("MarginLeft", call.Args))
				}
			}
		case "Bold":
			if len(call.Args) == 1 {
				if b, ok := boolIdentVal(call.Args[0]); ok {
					st.Bold = b
				} else {
					recordDyn("bold", rawExprText(call.Args[0]))
				}
			}
		case "Italic":
			if len(call.Args) == 1 {
				if b, ok := boolIdentVal(call.Args[0]); ok {
					st.Italic = b
				} else {
					recordDyn("italic", rawExprText(call.Args[0]))
				}
			}
		case "Faint":
			if len(call.Args) == 1 {
				if b, ok := boolIdentVal(call.Args[0]); ok {
					st.Faint = b
				} else {
					recordDyn("faint", rawExprText(call.Args[0]))
				}
			}
		case "Underline":
			if len(call.Args) == 1 {
				if b, ok := boolIdentVal(call.Args[0]); ok {
					st.Underline = b
				} else {
					recordDyn("underline", rawExprText(call.Args[0]))
				}
			}
		case "BorderForeground":
			if len(call.Args) == 1 {
				if ref, ok := resolveArg(call.Args[0]); ok {
					st.BorderColor = ref
				} else {
					recordDyn("borderColor", rawExprText(call.Args[0]))
				}
			}
		case "Foreground":
			if len(call.Args) == 1 {
				if ref, ok := resolveArg(call.Args[0]); ok {
					st.Fg = ref
				} else {
					recordDyn("fg", rawExprText(call.Args[0]))
				}
			}
		case "Background":
			if len(call.Args) == 1 {
				if ref, ok := resolveArg(call.Args[0]); ok {
					st.Bg = ref
				} else {
					recordDyn("bg", rawExprText(call.Args[0]))
				}
			}
		case "AlignHorizontal", "Align":
			if len(call.Args) == 1 {
				if pos, ok := parseLipAlign(call.Args[0]); ok {
					if pos == "top" || pos == "bottom" {
						st.AlignV = pos
					} else {
						st.AlignH = pos
					}
				} else {
					recordDyn("alignH", rawExprText(call.Args[0]))
				}
			}
		case "AlignVertical":
			if len(call.Args) == 1 {
				if pos, ok := parseLipAlign(call.Args[0]); ok {
					if pos == "left" || pos == "right" {
						st.AlignV = "top"
					} else {
						st.AlignV = pos
					}
				} else {
					recordDyn("alignV", rawExprText(call.Args[0]))
				}
			}
		}
	}
	if st.Border != "none" && st.BorderColor == "" {
		st.BorderColor = "$borderIdle"
	}
	return st, locked, dynExprs, true
}

func parseStyleChain(e dst.Expr, resolveArg func(dst.Expr) (string, bool)) (IRStyle, bool) {
	st, _, _, ok := parseStyleChainWithLocks(e, resolveArg)
	return st, ok
}

func ParseGoSource(src string) GoParseResult {
	var out GoParseResult
	fset := token.NewFileSet()
	f, err := decorator.ParseFile(fset, "input.go", src, parser.ParseComments)
	if err != nil {
		out.Error = err.Error()
		return out
	}

	out.SyncDisabled = fileHasSyncDisable(f, src)
	out.Tokens = map[string]TokenPair{
		"accent":     {Light: "#2e7de9", Dark: "#7aa2f7"},
		"borderIdle": {Light: "#9aa5ce", Dark: "#414868"},
		"textMain":   {Light: "#3760bf", Dark: "#c0caf5"},
		"surface":    {Light: "#d5d6db", Dark: "#1f2335"},
	}
	out.Styles = map[string]IRStyle{}
	out.LockedProps = map[string][]string{}
	out.LockReasons = map[string]string{}
	out.DynamicExprs = map[string]map[string]string{}
	namedRefs := map[string]string{}
	hexSet := map[string]bool{}
	lockedSet := map[string]bool{}

	// Detect imports
	bubbleSet := map[string]bool{}
	for _, imp := range f.Imports {
		p, ok := unquoteLit(imp.Path)
		if !ok {
			continue
		}
		switch {
		case strings.Contains(p, "bubbles") && strings.HasSuffix(p, "/list"):
			bubbleSet["bubble:list"] = true
		case strings.Contains(p, "bubbles") && strings.HasSuffix(p, "/table"):
			bubbleSet["bubble:table"] = true
		case strings.Contains(p, "bubbles") && strings.HasSuffix(p, "/viewport"):
			bubbleSet["bubble:viewport"] = true
		case strings.Contains(p, "bubbles") && strings.HasSuffix(p, "/textinput"):
			bubbleSet["bubble:textinput"] = true
		case strings.Contains(p, "charmbracelet/huh") || strings.Contains(p, "charm.land/huh"):
			bubbleSet["huh:form"] = true
		case strings.Contains(p, "charmbracelet/glamour") || strings.Contains(p, "charm.land/glamour"):
			bubbleSet["glamour:markdown"] = true
		case strings.Contains(p, "charmbracelet/wish") || strings.Contains(p, "charm.land/wish"):
			bubbleSet["wish:ssh"] = true
		}
	}
	for k := range bubbleSet {
		out.DetectedBubbles = append(out.DetectedBubbles, k)
	}
	sort.Strings(out.DetectedBubbles)

	resolveArg := func(e dst.Expr) (string, bool) {
		switch v := e.(type) {
		case *dst.BasicLit:
			if s, ok := unquoteLit(v); ok && strings.HasPrefix(s, "#") {
				hexSet[strings.ToLower(s)] = true
				for tk, pair := range out.Tokens {
					if strings.EqualFold(pair.Dark, s) || strings.EqualFold(pair.Light, s) {
						return "$" + tk, true
					}
				}
				tk := fmt.Sprintf("tone%d", len(out.Tokens)+1)
				out.Tokens[tk] = TokenPair{Light: s, Dark: s}
				return "$" + tk, true
			}
		case *dst.CallExpr:
			if sel, ok := v.Fun.(*dst.SelectorExpr); ok && sel.Sel.Name == "Color" && len(v.Args) == 1 {
				if s, ok := unquoteLit(v.Args[0]); ok && strings.HasPrefix(s, "#") {
					hexSet[strings.ToLower(s)] = true
					for tk, pair := range out.Tokens {
						if strings.EqualFold(pair.Dark, s) || strings.EqualFold(pair.Light, s) {
							return "$" + tk, true
						}
					}
					tk := fmt.Sprintf("tone%d", len(out.Tokens)+1)
					out.Tokens[tk] = TokenPair{Light: s, Dark: s}
					return "$" + tk, true
				}
			}
			// ld(...) or lightDark(...)
			if len(v.Args) == 2 {
				lHex, lOk := extractHexFromColorExpr(v.Args[0])
				dHex, dOk := extractHexFromColorExpr(v.Args[1])
				if lOk && dOk {
					hexSet[strings.ToLower(lHex)] = true
					hexSet[strings.ToLower(dHex)] = true
					for tk, pair := range out.Tokens {
						if strings.EqualFold(pair.Light, lHex) && strings.EqualFold(pair.Dark, dHex) {
							return "$" + tk, true
						}
					}
					tk := fmt.Sprintf("tone%d", len(out.Tokens)+1)
					out.Tokens[tk] = TokenPair{Light: lHex, Dark: dHex}
					return "$" + tk, true
				}
			}
		case *dst.Ident:
			if ref, ok := namedRefs[v.Name]; ok {
				return ref, true
			}
			// Also check lowerFirst token names directly
			if _, ok := out.Tokens[v.Name]; ok {
				return "$" + v.Name, true
			}
		case *dst.SelectorExpr:
			if ref, ok := namedRefs[v.Sel.Name]; ok {
				return ref, true
			}
		}
		return "", false
	}

	viewCfg := ViewConfig{MouseMode: "none"}
	foundView := false

	// Track Theme/Styles struct fields tagged with // @tui:style=<name>
	styleAlias := map[string]string{}
	dst.Inspect(f, func(n dst.Node) bool {
		if ts, ok := n.(*dst.TypeSpec); ok && (ts.Name.Name == "Theme" || ts.Name.Name == "Styles") {
			if stType, ok := ts.Type.(*dst.StructType); ok && stType.Fields != nil {
				for _, fld := range stType.Fields.List {
					tag := extractAnnotation(fld.Decs.End, "@tui:style=")
					if tag == "" {
						tag = extractAnnotation(fld.Decs.Start, "@tui:style=")
					}
					if tag != "" {
						for _, nm := range fld.Names {
							styleAlias[nm.Name] = tag
						}
					}
				}
			}
		}
		return true
	})

	resolveStyleKey := func(rawName string, decs dst.Decorations) string {
		key := lowerFirst(rawName)
		if alias, ok := styleAlias[rawName]; ok {
			key = alias
		}
		if tag := extractAnnotation(decs, "@tui:style="); tag != "" {
			key = tag
		}
		return key
	}

	recordStyle := func(rawName string, expr dst.Expr, decs dst.Decorations, endDecs dst.Decorations) {
		key := resolveStyleKey(rawName, decs)
		if tag := extractAnnotation(endDecs, "@tui:style="); tag != "" {
			key = tag
		}
		syncDisabled := hasSyncDisableDirective(decs) || hasSyncDisableDirective(endDecs)
		if st, locks, dynMap, ok := parseStyleChainWithLocks(expr, resolveArg); ok {
			out.Styles[key] = st
			out.StyleNames = appendUniqueStr(out.StyleNames, key)
			if syncDisabled {
				lockedSet[key] = true
				out.LockedProps[key] = []string{"*"}
				out.LockReasons[key] = "sync-disabled"
				return
			}
			if len(locks) > 0 {
				out.LockedProps[key] = locks
				out.LockReasons[key] = "dynamic"
				if len(dynMap) > 0 {
					out.DynamicExprs[key] = dynMap
				}
				lockedSet[key] = true
			}
		} else if syncDisabled {
			lockedSet[key] = true
			out.LockedProps[key] = []string{"*"}
			out.LockReasons[key] = "sync-disabled"
		} else if isLikelyStyleExpr(rawName, expr) {
			lockedSet[key] = true
			out.LockedProps[key] = []string{"*"}
			out.LockReasons[key] = "dynamic"
			if raw := rawExprText(expr); raw != "" {
				out.DynamicExprs[key] = map[string]string{"*": raw}
			}
		}
	}

	dst.Inspect(f, func(n dst.Node) bool {
		switch node := n.(type) {
		case *dst.ValueSpec:
			for i, nameIdent := range node.Names {
				if i >= len(node.Values) {
					continue
				}
				val := node.Values[i]
				if hasSyncDisableDirective(node.Decs.Start) || hasSyncDisableDirective(node.Decs.End) {
					key := resolveStyleKey(nameIdent.Name, node.Decs.Start)
					if st, _, _, ok := parseStyleChainWithLocks(val, resolveArg); ok {
						out.Styles[key] = st
						out.StyleNames = appendUniqueStr(out.StyleNames, key)
					}
					lockedSet[key] = true
					out.LockedProps[key] = []string{"*"}
					out.LockReasons[key] = "sync-disabled"
					continue
				}
				if pair, ok := parseTokenExpr(val); ok {
					key := lowerFirst(nameIdent.Name)
					if tag := extractAnnotation(node.Decs.Start, "@tui:token="); tag != "" {
						key = tag
					}
					out.Tokens[key] = pair
					namedRefs[nameIdent.Name] = "$" + key
					hexSet[strings.ToLower(pair.Light)] = true
					hexSet[strings.ToLower(pair.Dark)] = true
				} else {
					recordStyle(nameIdent.Name, val, node.Decs.Start, node.Decs.End)
				}
			}
		case *dst.AssignStmt:
			for i, lhs := range node.Lhs {
				if i >= len(node.Rhs) {
					continue
				}
				rhs := node.Rhs[i]
				if ident, ok := lhs.(*dst.Ident); ok {
					if hasSyncDisableDirective(node.Decs.Start) || hasSyncDisableDirective(node.Decs.End) {
						key := resolveStyleKey(ident.Name, node.Decs.Start)
						if st, _, _, ok := parseStyleChainWithLocks(rhs, resolveArg); ok {
							out.Styles[key] = st
							out.StyleNames = appendUniqueStr(out.StyleNames, key)
						}
						lockedSet[key] = true
						out.LockedProps[key] = []string{"*"}
						out.LockReasons[key] = "sync-disabled"
						continue
					}
					if pair, ok := parseTokenExpr(rhs); ok {
						key := lowerFirst(ident.Name)
						if tag := extractAnnotation(node.Decs.Start, "@tui:token="); tag != "" {
							key = tag
						}
						out.Tokens[key] = pair
						namedRefs[ident.Name] = "$" + key
						hexSet[strings.ToLower(pair.Light)] = true
						hexSet[strings.ToLower(pair.Dark)] = true
					} else {
						recordStyle(ident.Name, rhs, node.Decs.Start, node.Decs.End)
					}
				}
				// Detect v.AltScreen / v.WindowTitle / v.MouseMode / v.Cursor
				if sel, ok := lhs.(*dst.SelectorExpr); ok {
					switch sel.Sel.Name {
					case "AltScreen":
						if b, ok := boolIdentVal(rhs); ok {
							viewCfg.AltScreen = b
							foundView = true
						}
					case "ReportFocus":
						if b, ok := boolIdentVal(rhs); ok {
							viewCfg.ReportFocus = b
							foundView = true
						}
					case "DisableBracketedPasteMode":
						if b, ok := boolIdentVal(rhs); ok {
							viewCfg.DisableBracketedPasteMode = b
							foundView = true
						}
					case "WindowTitle":
						if s, ok := unquoteLit(rhs); ok {
							viewCfg.WindowTitle = s
							foundView = true
						}
					case "MouseMode":
						if mSel, ok := rhs.(*dst.SelectorExpr); ok {
							foundView = true
							switch mSel.Sel.Name {
							case "MouseModeCellMotion":
								viewCfg.MouseMode = "cell"
							case "MouseModeAllMotion":
								viewCfg.MouseMode = "all"
							default:
								viewCfg.MouseMode = "none"
							}
						}
					case "Cursor":
						foundView = true
						if id, ok := rhs.(*dst.Ident); ok && id.Name == "nil" {
							viewCfg.CursorMode = "none"
						} else if call, ok := rhs.(*dst.CallExpr); ok {
							if cSel, ok := call.Fun.(*dst.SelectorExpr); ok {
								if cSel.Sel.Name == "NewCursor" && len(call.Args) == 2 {
									viewCfg.CursorMode = "manual"
									if x, ok := intLitVal(call.Args[0]); ok {
										viewCfg.CursorX = x
									}
									if y, ok := intLitVal(call.Args[1]); ok {
										viewCfg.CursorY = y
									}
								} else if cSel.Sel.Name == "Cursor" {
									viewCfg.CursorMode = "auto"
								}
							}
						}
					}
				}
			}
		case *dst.KeyValueExpr:
			if ident, ok := node.Key.(*dst.Ident); ok {
				recordStyle(ident.Name, node.Value, node.Decs.Start, node.Decs.End)
			}
		}
		return true
	})

	if foundView {
		out.View = &viewCfg
	}

	// Parse Go-to-IR layout tree, overlays, Bubbles/Huh widgets, and node-level dynamic expressions
	widgets := extractWidgetConfigs(f)
	rootNode, overlays, nodeDynExprs, nodeSyncDisabled := extractLayoutTreeWithMeta(f, widgets, out.StyleNames)
	if rootNode != nil {
		out.Root = rootNode
	}
	if len(overlays) > 0 {
		out.Overlays = overlays
	}
	for nodeKey, dynMap := range nodeDynExprs {
		out.DynamicExprs[nodeKey] = dynMap
		var dynProps []string
		for pk := range dynMap {
			dynProps = append(dynProps, pk)
		}
		sort.Strings(dynProps)
		out.LockedProps[nodeKey] = dynProps
		if _, exists := out.LockReasons[nodeKey]; !exists {
			out.LockReasons[nodeKey] = "dynamic"
		}
		lockedSet[nodeKey] = true
	}
	for nodeKey := range nodeSyncDisabled {
		lockedSet[nodeKey] = true
		out.LockedProps[nodeKey] = []string{"*"}
		out.LockReasons[nodeKey] = "sync-disabled"
	}

	// Record hand-owned functions (Init, Update, tea.Cmd helpers) so callers know what stays untouched
	untouchedSet := map[string]bool{}
	for _, decl := range f.Decls {
		fd, ok := decl.(*dst.FuncDecl)
		if !ok || fd.Name == nil {
			continue
		}
		nm := fd.Name.Name
		if nm == "NewTheme" || nm == "RenderApp" || nm == "ld" || nm == "lightDark" {
			continue
		}
		untouchedSet[nm] = true
	}
	for nm := range untouchedSet {
		out.UntouchedSymbols = append(out.UntouchedSymbols, nm)
	}
	sort.Strings(out.UntouchedSymbols)

	if len(out.Styles) == 0 {
		out.Styles["importedBox"] = IRStyle{
			Border:      "rounded",
			BorderEdges: &[4]bool{true, true, true, true},
			BorderColor: "$accent",
			Fg:          "$textMain",
			Padding:     [4]int{1, 2, 1, 2},
		}
		out.StyleNames = []string{"importedBox"}
	}
	for k := range lockedSet {
		out.LockedSymbols = append(out.LockedSymbols, k)
	}
	sort.Strings(out.LockedSymbols)
	if len(out.LockedProps) == 0 {
		out.LockedProps = nil
	}
	if len(out.LockReasons) == 0 {
		out.LockReasons = nil
	}
	if len(out.DynamicExprs) == 0 {
		out.DynamicExprs = nil
	}
	out.ColorCount = len(hexSet)
	return out
}

func isLikelyStyleExpr(name string, expr dst.Expr) bool {
	if expr == nil {
		return false
	}
	if strings.HasSuffix(strings.ToLower(name), "style") {
		if _, ok := expr.(*dst.CompositeLit); ok {
			return false
		}
		if _, ok := expr.(*dst.CallExpr); ok {
			return true
		}
	}
	return false
}

// --- Widget & Layout Tree Extraction ---

type parsedWidgetInfo struct {
	id          string
	contentType string
	content     string
	widgetData  IRWidgetData
}

func extractWidgetConfigs(f *dst.File) map[string]*parsedWidgetInfo {
	out := map[string]*parsedWidgetInfo{}
	varToID := map[string]string{}
	listItemsVars := map[string][]IRListItem{}
	tableColsVars := map[string][]IRTableColumn{}
	tableRowsVars := map[string][][]string{}

	ensureWidget := func(id, ct string) *parsedWidgetInfo {
		if w, ok := out[id]; ok {
			if w.contentType == "" {
				w.contentType = ct
			}
			return w
		}
		w := &parsedWidgetInfo{id: id, contentType: ct}
		out[id] = w
		return w
	}

	guessID := func(varName string, decs dst.Decorations) string {
		if id := extractAnnotation(decs, "@tui:id="); id != "" {
			return id
		}
		if id, ok := varToID[varName]; ok {
			return id
		}
		for _, suffix := range []string{"Model", "Form", "Cols", "Rows", "Items"} {
			if strings.HasSuffix(varName, suffix) && len(varName) > len(suffix) {
				return strings.TrimSuffix(varName, suffix)
			}
		}
		return varName
	}

	// Pass 1: collect @tui:id annotations on struct fields & statements, plus slice literals
	dst.Inspect(f, func(n dst.Node) bool {
		switch node := n.(type) {
		case *dst.Field:
			id := extractAnnotation(node.Decs.End, "@tui:id=")
			if id == "" {
				id = extractAnnotation(node.Decs.Start, "@tui:id=")
			}
			if id != "" {
				for _, nm := range node.Names {
					varToID[nm.Name] = id
				}
			}
		case *dst.AssignStmt:
			tagID := extractAnnotation(node.Decs.Start, "@tui:id=")
			for i, lhs := range node.Lhs {
				if i >= len(node.Rhs) {
					continue
				}
				idIdent, ok := lhs.(*dst.Ident)
				if !ok {
					continue
				}
				if tagID != "" {
					varToID[idIdent.Name] = tagID
				}
				if comp, ok := node.Rhs[i].(*dst.CompositeLit); ok {
					if items, ok := parseListItemsLit(comp); ok {
						listItemsVars[idIdent.Name] = items
					} else if cols, ok := parseTableColsLit(comp); ok {
						tableColsVars[idIdent.Name] = cols
					} else if rows, ok := parseTableRowsLit(comp); ok {
						tableRowsVars[idIdent.Name] = rows
					}
				}
			}
		}
		return true
	})

	// Pass 2: collect widget constructors & option mutations
	currentTagID := ""
	dst.Inspect(f, func(n dst.Node) bool {
		switch node := n.(type) {
		case *dst.AssignStmt:
			if id := extractAnnotation(node.Decs.Start, "@tui:id="); id != "" {
				currentTagID = id
			}
			for i, lhs := range node.Lhs {
				if i >= len(node.Rhs) {
					continue
				}
				rhs := node.Rhs[i]
				if ident, ok := lhs.(*dst.Ident); ok {
					wid := guessID(ident.Name, node.Decs.Start)
					if currentTagID != "" && extractAnnotation(node.Decs.Start, "@tui:id=") != "" {
						wid = currentTagID
					}
					switch {
					case isPkgCall(rhs, "list", "New"):
						w := ensureWidget(wid, "bubble:list")
						varToID[ident.Name] = wid
						if call, ok := rhs.(*dst.CallExpr); ok && len(call.Args) >= 1 {
							if argID, ok := call.Args[0].(*dst.Ident); ok {
								if items, ok := listItemsVars[argID.Name]; ok {
									w.widgetData.ListItems = items
								}
							} else if comp, ok := call.Args[0].(*dst.CompositeLit); ok {
								if items, ok := parseListItemsLit(comp); ok {
									w.widgetData.ListItems = items
								}
							}
						}
					case isPkgCall(rhs, "table", "New"):
						w := ensureWidget(wid, "bubble:table")
						varToID[ident.Name] = wid
						if call, ok := rhs.(*dst.CallExpr); ok {
							parseTableNewArgs(call.Args, w, tableColsVars, tableRowsVars)
						}
					case isPkgCall(rhs, "viewport", "New"):
						ensureWidget(wid, "bubble:viewport")
						varToID[ident.Name] = wid
					case isPkgCall(rhs, "textinput", "New"):
						ensureWidget(wid, "bubble:textinput")
						varToID[ident.Name] = wid
					case hasChainCall(rhs, "huh", "NewForm"):
						w := ensureWidget(wid, "huh:form")
						varToID[ident.Name] = wid
						w.widgetData.HuhFields = parseHuhFormExpr(rhs)
					}
				}
				// Field assignments like sidebarModel.Title = "..." or searchBarModel.Prompt = "..."
				if sel, ok := lhs.(*dst.SelectorExpr); ok {
					if recv, ok := sel.X.(*dst.Ident); ok {
						wid := guessID(recv.Name, nil)
						if w, ok := out[wid]; ok {
							if s, ok := unquoteLit(rhs); ok {
								switch sel.Sel.Name {
								case "Title":
									w.widgetData.ListTitle = s
								case "Prompt":
									w.widgetData.InputPrompt = s
								case "Placeholder":
									w.widgetData.InputPlaceholder = s
								}
							}
						}
					}
				}
			}
		case *dst.ExprStmt:
			if call, ok := node.X.(*dst.CallExpr); ok {
				if sel, ok := call.Fun.(*dst.SelectorExpr); ok {
					if recv, ok := sel.X.(*dst.Ident); ok {
						wid := guessID(recv.Name, nil)
						if w, ok := out[wid]; ok {
							switch sel.Sel.Name {
							case "SetContent":
								if len(call.Args) == 1 {
									if s, ok := unquoteLit(call.Args[0]); ok {
										w.content = s
									}
								}
							case "SetColumns":
								if len(call.Args) == 1 {
									if cols, ok := resolveTableColsArg(call.Args[0], tableColsVars); ok {
										w.widgetData.TableColumns = cols
									}
								}
							case "SetRows":
								if len(call.Args) == 1 {
									if rows, ok := resolveTableRowsArg(call.Args[0], tableRowsVars); ok {
										w.widgetData.TableRows = rows
									}
								}
							case "SetItems":
								if len(call.Args) == 1 {
									if items, ok := resolveListItemsArg(call.Args[0], listItemsVars); ok {
										w.widgetData.ListItems = items
									}
								}
							}
						}
					}
				}
			}
		}
		return true
	})

	return out
}

func isPkgCall(e dst.Expr, pkg, fn string) bool {
	call, ok := e.(*dst.CallExpr)
	if !ok {
		return false
	}
	sel, ok := call.Fun.(*dst.SelectorExpr)
	if !ok {
		return false
	}
	id, ok := sel.X.(*dst.Ident)
	return ok && id.Name == pkg && sel.Sel.Name == fn
}

func hasChainCall(e dst.Expr, pkg, fn string) bool {
	cur := e
	for {
		call, ok := cur.(*dst.CallExpr)
		if !ok {
			return false
		}
		sel, ok := call.Fun.(*dst.SelectorExpr)
		if !ok {
			return false
		}
		if id, ok := sel.X.(*dst.Ident); ok && id.Name == pkg && sel.Sel.Name == fn {
			return true
		}
		cur = sel.X
	}
}

func parseListItemsLit(comp *dst.CompositeLit) ([]IRListItem, bool) {
	var items []IRListItem
	for _, elt := range comp.Elts {
		itemLit, ok := elt.(*dst.CompositeLit)
		if !ok {
			continue
		}
		var it IRListItem
		for idx, fld := range itemLit.Elts {
			if kv, ok := fld.(*dst.KeyValueExpr); ok {
				if k, ok := kv.Key.(*dst.Ident); ok {
					if v, ok := unquoteLit(kv.Value); ok {
						if k.Name == "title" || k.Name == "Title" {
							it.Title = v
						} else if k.Name == "desc" || k.Name == "Desc" || k.Name == "description" {
							it.Desc = v
						}
					}
				}
			} else if v, ok := unquoteLit(fld); ok {
				if idx == 0 {
					it.Title = v
				} else if idx == 1 {
					it.Desc = v
				}
			}
		}
		if it.Title != "" || it.Desc != "" {
			items = append(items, it)
		}
	}
	return items, len(items) > 0
}

func resolveListItemsArg(arg dst.Expr, vars map[string][]IRListItem) ([]IRListItem, bool) {
	if id, ok := arg.(*dst.Ident); ok {
		items, ok := vars[id.Name]
		return items, ok
	}
	if comp, ok := arg.(*dst.CompositeLit); ok {
		return parseListItemsLit(comp)
	}
	return nil, false
}

func parseTableColsLit(comp *dst.CompositeLit) ([]IRTableColumn, bool) {
	var cols []IRTableColumn
	for _, elt := range comp.Elts {
		colLit, ok := elt.(*dst.CompositeLit)
		if !ok {
			continue
		}
		var col IRTableColumn
		for _, fld := range colLit.Elts {
			kv, ok := fld.(*dst.KeyValueExpr)
			if !ok {
				continue
			}
			k, ok := kv.Key.(*dst.Ident)
			if !ok {
				continue
			}
			if k.Name == "Title" {
				if s, ok := unquoteLit(kv.Value); ok {
					col.Title = s
				}
			} else if k.Name == "Width" {
				if w, ok := intLitVal(kv.Value); ok {
					col.Width = w
				}
			}
		}
		if col.Title != "" {
			if col.Width <= 0 {
				col.Width = 12
			}
			cols = append(cols, col)
		}
	}
	return cols, len(cols) > 0
}

func parseTableRowsLit(comp *dst.CompositeLit) ([][]string, bool) {
	var rows [][]string
	for _, elt := range comp.Elts {
		rowLit, ok := elt.(*dst.CompositeLit)
		if !ok {
			continue
		}
		var row []string
		for _, cell := range rowLit.Elts {
			if s, ok := unquoteLit(cell); ok {
				row = append(row, s)
			}
		}
		if len(row) > 0 {
			rows = append(rows, row)
		}
	}
	return rows, len(rows) > 0
}

func resolveTableColsArg(arg dst.Expr, vars map[string][]IRTableColumn) ([]IRTableColumn, bool) {
	if id, ok := arg.(*dst.Ident); ok {
		cols, ok := vars[id.Name]
		return cols, ok
	}
	if comp, ok := arg.(*dst.CompositeLit); ok {
		return parseTableColsLit(comp)
	}
	return nil, false
}

func resolveTableRowsArg(arg dst.Expr, vars map[string][][]string) ([][]string, bool) {
	if id, ok := arg.(*dst.Ident); ok {
		rows, ok := vars[id.Name]
		return rows, ok
	}
	if comp, ok := arg.(*dst.CompositeLit); ok {
		return parseTableRowsLit(comp)
	}
	return nil, false
}

func parseTableNewArgs(args []dst.Expr, w *parsedWidgetInfo, colsVars map[string][]IRTableColumn, rowsVars map[string][][]string) {
	for _, arg := range args {
		call, ok := arg.(*dst.CallExpr)
		if !ok || len(call.Args) < 1 {
			continue
		}
		sel, ok := call.Fun.(*dst.SelectorExpr)
		if !ok {
			continue
		}
		switch sel.Sel.Name {
		case "WithColumns":
			if cols, ok := resolveTableColsArg(call.Args[0], colsVars); ok {
				w.widgetData.TableColumns = cols
			}
		case "WithRows":
			if rows, ok := resolveTableRowsArg(call.Args[0], rowsVars); ok {
				w.widgetData.TableRows = rows
			}
		}
	}
}

func parseHuhFormExpr(e dst.Expr) []IRHuhField {
	var fields []IRHuhField
	cur := e
	var formCall *dst.CallExpr
	for {
		call, ok := cur.(*dst.CallExpr)
		if !ok {
			break
		}
		sel, ok := call.Fun.(*dst.SelectorExpr)
		if !ok {
			break
		}
		if sel.Sel.Name == "NewForm" {
			formCall = call
			break
		}
		cur = sel.X
	}
	if formCall == nil {
		return fields
	}
	for _, groupArg := range formCall.Args {
		gCall, ok := groupArg.(*dst.CallExpr)
		if !ok {
			continue
		}
		for idx, fieldExpr := range gCall.Args {
			f := parseHuhFieldChain(fieldExpr, idx)
			if f.Kind != "" {
				fields = append(fields, f)
			}
		}
	}
	return fields
}

func parseHuhFieldChain(e dst.Expr, idx int) IRHuhField {
	var calls []*dst.CallExpr
	cur := e
	for {
		call, ok := cur.(*dst.CallExpr)
		if !ok {
			break
		}
		calls = append(calls, call)
		sel, ok := call.Fun.(*dst.SelectorExpr)
		if !ok {
			break
		}
		cur = sel.X
	}
	var out IRHuhField
	for i := len(calls) - 1; i >= 0; i-- {
		call := calls[i]
		name := ""
		switch fn := call.Fun.(type) {
		case *dst.SelectorExpr:
			name = fn.Sel.Name
		case *dst.IndexExpr:
			if sel, ok := fn.X.(*dst.SelectorExpr); ok {
				name = sel.Sel.Name
			}
		case *dst.IndexListExpr:
			if sel, ok := fn.X.(*dst.SelectorExpr); ok {
				name = sel.Sel.Name
			}
		}
		switch name {
		case "NewInput":
			out.Kind = "input"
		case "NewSelect":
			out.Kind = "select"
		case "NewConfirm":
			out.Kind = "confirm"
		case "Title":
			if len(call.Args) >= 1 {
				if s, ok := unquoteLit(call.Args[0]); ok {
					out.Label = s
				}
			}
		case "Placeholder":
			if len(call.Args) >= 1 {
				if s, ok := unquoteLit(call.Args[0]); ok {
					out.Placeholder = s
				}
			}
		case "Options":
			for _, optArg := range call.Args {
				if oCall, ok := optArg.(*dst.CallExpr); ok && len(oCall.Args) >= 1 {
					if s, ok := unquoteLit(oCall.Args[0]); ok {
						out.Options = append(out.Options, s)
					}
				}
			}
		}
	}
	if out.Kind != "" {
		base := lowerFirst(strings.ReplaceAll(out.Label, " ", ""))
		if base == "" {
			base = fmt.Sprintf("field%d", idx+1)
		}
		out.ID = base
	}
	return out
}

func extractLayoutTree(f *dst.File, widgets map[string]*parsedWidgetInfo, styleNames []string) (*IRNode, []IROverlay) {
	root, overlays, _, _ := extractLayoutTreeWithMeta(f, widgets, styleNames)
	return root, overlays
}

func extractLayoutTreeWithMeta(f *dst.File, widgets map[string]*parsedWidgetInfo, styleNames []string) (*IRNode, []IROverlay, map[string]map[string]string, map[string]bool) {
	nodeDynExprs := map[string]map[string]string{}
	nodeSyncDisabled := map[string]bool{}
	var targetFunc *dst.FuncDecl
	for _, decl := range f.Decls {
		fd, ok := decl.(*dst.FuncDecl)
		if !ok || fd.Body == nil {
			continue
		}
		if fd.Name.Name == "RenderApp" {
			targetFunc = fd
			break
		}
		if fd.Name.Name == "View" && targetFunc == nil {
			targetFunc = fd
		}
	}
	if targetFunc == nil {
		return nil, nil, nodeDynExprs, nodeSyncDisabled
	}

	varNodes := map[string]IRNode{}
	overlayNodes := []IROverlay{}
	var rootVar string

	attachWidget := func(n *IRNode) {
		if w, ok := widgets[n.ID]; ok {
			n.ContentType = w.contentType
			if w.content != "" {
				n.Content = w.content
			}
			if w.widgetData.ListTitle != "" || len(w.widgetData.ListItems) > 0 ||
				len(w.widgetData.TableColumns) > 0 || len(w.widgetData.TableRows) > 0 ||
				w.widgetData.InputPrompt != "" || w.widgetData.InputPlaceholder != "" ||
				len(w.widgetData.HuhFields) > 0 {
				wd := w.widgetData
				n.WidgetData = &wd
			}
		} else if n.ContentType == "" {
			n.ContentType = "text"
		}
	}

	parseStmtList := func(stmts []dst.Stmt) {}
	parseStmtList = func(stmts []dst.Stmt) {
		for _, stmt := range stmts {
			switch s := stmt.(type) {
			case *dst.AssignStmt:
				tagID := extractAnnotation(s.Decs.Start, "@tui:id=")
				isDisabled := hasSyncDisableDirective(s.Decs.Start) || hasSyncDisableDirective(s.Decs.End)
				for i, lhs := range s.Lhs {
					if i >= len(s.Rhs) {
						continue
					}
					rhs := s.Rhs[i]
					ident, ok := lhs.(*dst.Ident)
					if !ok {
						continue
					}
					nodeID := tagID
					if nodeID == "" {
						nodeID = ident.Name
					}
					if isDisabled {
						nodeSyncDisabled["node:"+nodeID] = true
					}
					if n, ok := parseJoinExpr(nodeID, rhs, varNodes); ok {
						varNodes[ident.Name] = n
						rootVar = ident.Name
					} else if n, wDyn, hDyn, ok := parseBoxRenderExprWithMeta(nodeID, rhs, styleNames); ok {
						attachWidget(&n)
						varNodes[ident.Name] = n
						rootVar = ident.Name
						if wDyn != "" || hDyn != "" {
							dm := map[string]string{}
							if wDyn != "" {
								dm["width"] = wDyn
							}
							if hDyn != "" {
								dm["height"] = hDyn
							}
							nodeDynExprs["node:"+n.ID] = dm
						}
					}
				}
			case *dst.IfStmt:
				// Detect collapseBelow pattern: if w < N { ... } else { ... }
				bp := parseCollapseBreakpoint(s.Cond)
				var elseVars []string
				var ifNodes map[string]IRNode
				if s.Body != nil {
					before := map[string]IRNode{}
					for k, v := range varNodes {
						before[k] = v
					}
					parseStmtList(s.Body.List)
					ifNodes = map[string]IRNode{}
					for k, v := range varNodes {
						if _, existed := before[k]; !existed || len(v.Children) != len(before[k].Children) {
							ifNodes[k] = v
						}
					}
				}
				if s.Else != nil {
					if blk, ok := s.Else.(*dst.BlockStmt); ok {
						for _, es := range blk.List {
							if as, ok := es.(*dst.AssignStmt); ok && len(as.Lhs) == 1 {
								if id, ok := as.Lhs[0].(*dst.Ident); ok {
									elseVars = append(elseVars, id.Name)
								}
							}
						}
						parseStmtList(blk.List)
					}
				}
				if bp > 0 {
					for _, vn := range elseVars {
						if elseNode, ok := varNodes[vn]; ok {
							if ifNode, ok := ifNodes[vn]; ok {
								ifSet := map[string]bool{}
								for _, c := range ifNode.Children {
									ifSet[c.ID] = true
								}
								for idx := range elseNode.Children {
									if !ifSet[elseNode.Children[idx].ID] {
										elseNode.Children[idx].Width.CollapseBelow = bp
									}
								}
								varNodes[vn] = elseNode
							}
						}
					}
				}
			case *dst.ExprStmt:
				// layers = append(layers, lipgloss.NewLayer(ovVar).X(...).Y(...).Z(...).ID("..."))
				if call, ok := s.X.(*dst.CallExpr); ok {
					if id, ok := call.Fun.(*dst.Ident); ok && id.Name == "append" && len(call.Args) >= 2 {
						if ov, ok := parseLayerOverlayExpr(call.Args[1], varNodes); ok {
							overlayNodes = append(overlayNodes, ov)
						}
					}
				}
			case *dst.ReturnStmt:
				if len(s.Results) == 1 {
					if id, ok := s.Results[0].(*dst.Ident); ok {
						if _, ok := varNodes[id.Name]; ok {
							rootVar = id.Name
						}
					}
				}
			}
		}
	}

	parseStmtList(targetFunc.Body.List)

	// Also handle AssignStmt with append(layers, ...)
	dst.Inspect(targetFunc.Body, func(n dst.Node) bool {
		if as, ok := n.(*dst.AssignStmt); ok {
			for _, rhs := range as.Rhs {
				if call, ok := rhs.(*dst.CallExpr); ok {
					if id, ok := call.Fun.(*dst.Ident); ok && id.Name == "append" && len(call.Args) >= 2 {
						if ov, ok := parseLayerOverlayExpr(call.Args[1], varNodes); ok {
							overlayNodes = append(overlayNodes, ov)
						}
					}
				}
			}
		}
		return true
	})

	if rootVar == "" {
		return nil, overlayNodes, nodeDynExprs, nodeSyncDisabled
	}
	rootNode, ok := varNodes[rootVar]
	if !ok {
		return nil, overlayNodes, nodeDynExprs, nodeSyncDisabled
	}
	// Remove overlay leaf nodes from being accidentally selected as root if only overlays existed
	return &rootNode, overlayNodes, nodeDynExprs, nodeSyncDisabled
}

func parseCollapseBreakpoint(cond dst.Expr) int {
	bin, ok := cond.(*dst.BinaryExpr)
	if !ok || bin.Op != token.LSS {
		return 0
	}
	if v, ok := intLitVal(bin.Y); ok {
		return v
	}
	return 0
}

func parseJoinExpr(nodeID string, e dst.Expr, varNodes map[string]IRNode) (IRNode, bool) {
	call, ok := e.(*dst.CallExpr)
	if !ok || len(call.Args) < 2 {
		return IRNode{}, false
	}
	sel, ok := call.Fun.(*dst.SelectorExpr)
	if !ok {
		return IRNode{}, false
	}
	kind := ""
	switch sel.Sel.Name {
	case "JoinHorizontal":
		kind = "JoinHorizontal"
	case "JoinVertical":
		kind = "JoinVertical"
	default:
		return IRNode{}, false
	}

	align := "start"
	if pos, ok := parseLipAlign(call.Args[0]); ok {
		switch pos {
		case "center":
			align = "center"
		case "right", "bottom":
			align = "end"
		default:
			align = "start"
		}
	}

	var children []IRNode
	for _, arg := range call.Args[1:] {
		if id, ok := arg.(*dst.Ident); ok {
			if child, exists := varNodes[id.Name]; exists {
				children = append(children, child)
			}
		}
	}
	return IRNode{
		ID:        nodeID,
		Kind:      kind,
		JoinAlign: align,
		Height:    IRSize{Mode: "fill", Weight: 1},
		Children:  children,
	}, true
}

func parseBoxRenderExprWithMeta(nodeID string, e dst.Expr, _ []string) (IRNode, string, string, bool) {
	call, ok := e.(*dst.CallExpr)
	if !ok {
		return IRNode{}, "", "", false
	}
	sel, ok := call.Fun.(*dst.SelectorExpr)
	if !ok || sel.Sel.Name != "Render" {
		return IRNode{}, "", "", false
	}

	node := IRNode{
		ID:     nodeID,
		Kind:   "Box",
		Width:  IRSize{Mode: "fit"},
		Height: IRSize{Mode: "fit"},
	}
	if len(call.Args) == 1 {
		if s, ok := unquoteLit(call.Args[0]); ok {
			node.Content = s
		} else if id, ok := call.Args[0].(*dst.Ident); ok {
			if strings.HasSuffix(id.Name, "Content") {
				base := strings.TrimSuffix(id.Name, "Content")
				if node.ID == "" {
					node.ID = base
				}
			}
		}
	}

	var wDyn, hDyn string
	cur := sel.X
	for {
		switch c := cur.(type) {
		case *dst.CallExpr:
			cSel, ok := c.Fun.(*dst.SelectorExpr)
			if !ok {
				return node, wDyn, hDyn, true
			}
			switch cSel.Sel.Name {
			case "Width":
				if len(c.Args) == 1 {
					node.Width, wDyn = parseDimensionExprWithMeta(c.Args[0])
				}
			case "Height":
				if len(c.Args) == 1 {
					node.Height, hDyn = parseDimensionExprWithMeta(c.Args[0])
				}
			}
			cur = cSel.X
		case *dst.SelectorExpr:
			// e.g. st.Sidebar
			node.Style = lowerFirst(c.Sel.Name)
			return node, wDyn, hDyn, true
		default:
			return node, wDyn, hDyn, true
		}
	}
}

func isStandardFillIdent(name string) bool {
	return name == "w" || name == "h" || name == "remW" || name == "remH" || name == "width" || name == "height"
}

func parseDimensionExprWithMeta(e dst.Expr) (IRSize, string) {
	if v, ok := intLitVal(e); ok {
		return IRSize{Mode: "fixed", Value: v}, ""
	}
	if id, ok := e.(*dst.Ident); ok {
		if isStandardFillIdent(id.Name) {
			return IRSize{Mode: "fill", Weight: 1}, ""
		}
		return IRSize{Mode: "fill", Weight: 1}, rawExprText(e)
	}
	if call, ok := e.(*dst.CallExpr); ok {
		if id, ok := call.Fun.(*dst.Ident); ok && id.Name == "max" && len(call.Args) == 2 {
			if z, ok := intLitVal(call.Args[0]); ok && z == 0 {
				return parseDimensionExprWithMeta(call.Args[1])
			}
			sz, _ := parseDimensionExprWithMeta(call.Args[1])
			return sz, rawExprText(e)
		}
		return IRSize{Mode: "fill", Weight: 1}, rawExprText(e)
	}
	if bin, ok := e.(*dst.BinaryExpr); ok {
		if bin.Op == token.SUB {
			if v, ok := intLitVal(bin.X); ok {
				return IRSize{Mode: "fixed", Value: v}, ""
			}
			// Detect standard max(0, w - 28) or max(0, expr - st.X.GetHorizontalMargins())
			if xID, ok := bin.X.(*dst.Ident); ok && isStandardFillIdent(xID.Name) {
				return IRSize{Mode: "fill", Weight: 1}, ""
			}
			if _, isCall := bin.Y.(*dst.CallExpr); isCall {
				// e.g. (remW*2)/3 - st.Main.GetHorizontalMargins()
				return parseDimensionExprWithMeta(bin.X)
			}
			return IRSize{Mode: "fill", Weight: 1}, rawExprText(e)
		}
		// Detect weight: (remW * 2) / 3
		if bin.Op == token.QUO {
			if par, ok := bin.X.(*dst.ParenExpr); ok {
				if mul, ok := par.X.(*dst.BinaryExpr); ok && mul.Op == token.MUL {
					if wt, ok := intLitVal(mul.Y); ok {
						return IRSize{Mode: "fill", Weight: wt}, ""
					}
				}
			}
			return IRSize{Mode: "fill", Weight: 1}, rawExprText(e)
		}
	}
	return IRSize{Mode: "fill", Weight: 1}, rawExprText(e)
}

func parseDimensionExpr(e dst.Expr) IRSize {
	sz, _ := parseDimensionExprWithMeta(e)
	return sz
}

func parseLayerOverlayExpr(e dst.Expr, varNodes map[string]IRNode) (IROverlay, bool) {
	var ovNode IRNode
	var hasLayer bool
	z := 10
	id := ""
	anchor := "center"
	var xExprStr, yExprStr string

	cur := e
	for {
		call, ok := cur.(*dst.CallExpr)
		if !ok {
			break
		}
		sel, ok := call.Fun.(*dst.SelectorExpr)
		if !ok {
			break
		}
		switch sel.Sel.Name {
		case "NewLayer":
			hasLayer = true
			if len(call.Args) == 1 {
				if vId, ok := call.Args[0].(*dst.Ident); ok {
					if n, exists := varNodes[vId.Name]; exists {
						ovNode = n
					}
				}
			}
		case "ID":
			if len(call.Args) == 1 {
				if s, ok := unquoteLit(call.Args[0]); ok {
					id = s
				}
			}
		case "Z":
			if len(call.Args) == 1 {
				if v, ok := intLitVal(call.Args[0]); ok {
					z = v
				}
			}
		case "X":
			if len(call.Args) == 1 {
				xExprStr = exprQuickText(call.Args[0])
			}
		case "Y":
			if len(call.Args) == 1 {
				yExprStr = exprQuickText(call.Args[0])
			}
		}
		cur = sel.X
	}
	if !hasLayer {
		return IROverlay{}, false
	}
	if id != "" && ovNode.ID == "" {
		ovNode.ID = id
	}
	if strings.Contains(xExprStr, "-1") && yExprStr == "1" {
		anchor = "top-right"
	} else if strings.Contains(xExprStr, "-1") && strings.Contains(yExprStr, "h-") {
		anchor = "bottom-right"
	} else if strings.Contains(yExprStr, "h-") && ovNode.Width.Mode == "fill" {
		anchor = "bottom-bar"
	}
	ovID := id
	if ovID == "" {
		ovID = "overlay"
	}
	return IROverlay{
		ID:      ovID,
		Visible: true,
		Z:       z,
		Anchor:  anchor,
		Node:    ovNode,
	}, true
}

func exprQuickText(e dst.Expr) string {
	switch v := e.(type) {
	case *dst.BasicLit:
		return v.Value
	case *dst.Ident:
		return v.Name
	case *dst.BinaryExpr:
		return exprQuickText(v.X) + v.Op.String() + exprQuickText(v.Y)
	case *dst.CallExpr:
		if id, ok := v.Fun.(*dst.Ident); ok && len(v.Args) > 1 {
			return id.Name + "(" + exprQuickText(v.Args[1]) + ")"
		}
	}
	return ""
}
