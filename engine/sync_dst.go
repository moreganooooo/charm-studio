//go:build js && wasm

package main

import (
    "bytes"
    "encoding/json"
    "fmt"
    "go/parser"
    "go/token"
    "strconv"
    "strings"
    "syscall/js"

    "github.com/dave/dst"
    "github.com/dave/dst/decorator"
    "github.com/dave/dst/dstutil"
)

type ViewConfig struct {
    AltScreen                 bool   `json:"altScreen"`
    MouseMode                 string `json:"mouseMode"`
    WindowTitle               string `json:"windowTitle"`
    ReportFocus               bool   `json:"reportFocus"`
    DisableBracketedPasteMode bool   `json:"disableBracketedPasteMode"`
}

type SyncIRDoc struct {
    Tokens   map[string]TokenPair `json:"tokens"`
    Styles   map[string]IRStyle   `json:"styles"`
    View     *ViewConfig          `json:"view,omitempty"`
    Root     IRNode               `json:"root"`
    Overlays []IROverlay          `json:"overlays"`
}

type GoParseResult struct {
    Styles          map[string]IRStyle   `json:"styles"`
    Tokens          map[string]TokenPair `json:"tokens"`
    View            *ViewConfig          `json:"view,omitempty"`
    DetectedBubbles []string             `json:"detectedBubbles"`
    StyleNames      []string             `json:"styleNames"`
    ColorCount      int                  `json:"colorCount"`
    SyncDisabled    bool                 `json:"syncDisabled"`
    LockedSymbols   []string             `json:"lockedSymbols"`
    Error           string               `json:"error,omitempty"`
}

type GoSyncResult struct {
    UpdatedGo      string   `json:"updatedGo"`
    PatchedSymbols []string `json:"patchedSymbols"`
    LockedSymbols  []string `json:"lockedSymbols"`
    SyncDisabled   bool     `json:"syncDisabled"`
    Error          string   `json:"error,omitempty"`
}

func hasDirective(decs dst.Decorations, directive string) bool {
    for _, d := range decs {
        if strings.Contains(d, directive) {
            return true
        }
    }
    return false
}

func fileHasSyncDisable(f *dst.File, rawSrc string) bool {
    if strings.Contains(rawSrc, "// @tui:sync-disable") || strings.Contains(rawSrc, "//@tui:sync-disable") {
        return true
    }
    return hasDirective(f.Decs.Start, "@tui:sync-disable") || hasDirective(f.Decs.End, "@tui:sync-disable")
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

func parseGoSource(_ js.Value, args []js.Value) any {
    var out GoParseResult
    if len(args) < 1 {
        out.Error = "expected go source string"
        b, _ := json.Marshal(out)
        return string(b)
    }
    src := args[0].String()
    fset := token.NewFileSet()
    f, err := decorator.ParseFile(fset, "input.go", src, parser.ParseComments)
    if err != nil {
        out.Error = err.Error()
        b, _ := json.Marshal(out)
        return string(b)
    }

    out.SyncDisabled = fileHasSyncDisable(f, src)
    out.Tokens = map[string]TokenPair{
        "accent":     {Light: "#2e7de9", Dark: "#7aa2f7"},
        "borderIdle": {Light: "#9aa5ce", Dark: "#414868"},
        "textMain":   {Light: "#3760bf", Dark: "#c0caf5"},
        "surface":    {Light: "#d5d6db", Dark: "#1f2335"},
    }
    out.Styles = map[string]IRStyle{}
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
        case strings.Contains(p, "charmbracelet/glamour"):
            bubbleSet["glamour:markdown"] = true
        case strings.Contains(p, "charmbracelet/wish"):
            bubbleSet["wish:ssh"] = true
        }
    }
    for k := range bubbleSet {
        out.DetectedBubbles = append(out.DetectedBubbles, k)
    }

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
            // lightDark(lipgloss.Color("#l"), lipgloss.Color("#d"))
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
        case *dst.SelectorExpr:
            if ref, ok := namedRefs[v.Sel.Name]; ok {
                return ref, true
            }
        }
        return "", false
    }

    viewCfg := ViewConfig{MouseMode: "none"}
    foundView := false

    dst.Inspect(f, func(n dst.Node) bool {
        switch node := n.(type) {
        case *dst.ValueSpec:
            for i, nameIdent := range node.Names {
                if i >= len(node.Values) {
                    continue
                }
                val := node.Values[i]
                if hasDirective(node.Decs.Start, "@tui:block-disable") {
                    lockedSet[lowerFirst(nameIdent.Name)] = true
                    continue
                }
                if pair, ok := parseTokenExpr(val); ok {
                    key := lowerFirst(nameIdent.Name)
                    out.Tokens[key] = pair
                    namedRefs[nameIdent.Name] = "$" + key
                    hexSet[strings.ToLower(pair.Light)] = true
                    hexSet[strings.ToLower(pair.Dark)] = true
                } else if st, ok := parseStyleChain(val, resolveArg); ok {
                    key := lowerFirst(nameIdent.Name)
                    out.Styles[key] = st
                    out.StyleNames = append(out.StyleNames, key)
                }
            }
        case *dst.AssignStmt:
            for i, lhs := range node.Lhs {
                if i >= len(node.Rhs) {
                    continue
                }
                rhs := node.Rhs[i]
                if ident, ok := lhs.(*dst.Ident); ok {
                    if hasDirective(node.Decs.Start, "@tui:block-disable") {
                        lockedSet[lowerFirst(ident.Name)] = true
                        continue
                    }
                    if pair, ok := parseTokenExpr(rhs); ok {
                        key := lowerFirst(ident.Name)
                        out.Tokens[key] = pair
                        namedRefs[ident.Name] = "$" + key
                        hexSet[strings.ToLower(pair.Light)] = true
                        hexSet[strings.ToLower(pair.Dark)] = true
                    } else if st, ok := parseStyleChain(rhs, resolveArg); ok {
                        key := lowerFirst(ident.Name)
                        out.Styles[key] = st
                        out.StyleNames = append(out.StyleNames, key)
                    }
                }
                // Detect v.AltScreen = true / v.WindowTitle = "..." / v.MouseMode = tea.MouseModeCellMotion
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
                    }
                }
            }
        case *dst.KeyValueExpr:
            if ident, ok := node.Key.(*dst.Ident); ok {
                if st, ok := parseStyleChain(node.Value, resolveArg); ok {
                    key := lowerFirst(ident.Name)
                    out.Styles[key] = st
                    out.StyleNames = append(out.StyleNames, key)
                }
            }
        }
        return true
    })

    if foundView {
        out.View = &viewCfg
    }
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
    out.ColorCount = len(hexSet)

    b, _ := json.Marshal(out)
    return string(b)
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
    // lipgloss.Color("#...") or lightDark(...)
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

func parseStyleChain(e dst.Expr, resolveArg func(dst.Expr) (string, bool)) (IRStyle, bool) {
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
        return IRStyle{}, false
    }

    st := IRStyle{
        Border:      "none",
        BorderEdges: &[4]bool{true, true, true, true},
        Fg:          "$textMain",
        Padding:     [4]int{0, 1, 0, 1},
        Margin:      [4]int{0, 0, 0, 0},
    }

    // Walk root -> outer calls
    for i := len(calls) - 1; i >= 0; i-- {
        call := calls[i]
        sel, ok := call.Fun.(*dst.SelectorExpr)
        if !ok {
            continue
        }
        switch sel.Sel.Name {
        case "Border":
            if len(call.Args) >= 1 {
                if bCall, ok := call.Args[0].(*dst.CallExpr); ok {
                    if bSel, ok := bCall.Fun.(*dst.SelectorExpr); ok {
                        switch bSel.Sel.Name {
                        case "RoundedBorder":
                            st.Border = "rounded"
                        case "ThickBorder":
                            st.Border = "thick"
                        case "DoubleBorder":
                            st.Border = "double"
                        case "NormalBorder":
                            st.Border = "normal"
                        }
                    }
                }
            }
        case "BorderTop":
            if len(call.Args) == 1 {
                if b, ok := boolIdentVal(call.Args[0]); ok {
                    st.BorderEdges[0] = b
                }
            }
        case "BorderRight":
            if len(call.Args) == 1 {
                if b, ok := boolIdentVal(call.Args[0]); ok {
                    st.BorderEdges[1] = b
                }
            }
        case "BorderBottom":
            if len(call.Args) == 1 {
                if b, ok := boolIdentVal(call.Args[0]); ok {
                    st.BorderEdges[2] = b
                }
            }
        case "BorderLeft":
            if len(call.Args) == 1 {
                if b, ok := boolIdentVal(call.Args[0]); ok {
                    st.BorderEdges[3] = b
                }
            }
        case "Padding":
            st.Padding = readQuadArgs(call.Args)
        case "PaddingHorizontal":
            if len(call.Args) == 1 {
                if v, ok := intLitVal(call.Args[0]); ok {
                    st.Padding[1], st.Padding[3] = v, v
                }
            }
        case "PaddingVertical":
            if len(call.Args) == 1 {
                if v, ok := intLitVal(call.Args[0]); ok {
                    st.Padding[0], st.Padding[2] = v, v
                }
            }
        case "Margin":
            st.Margin = readQuadArgs(call.Args)
        case "MarginTop":
            if len(call.Args) == 1 {
                if v, ok := intLitVal(call.Args[0]); ok {
                    st.Margin[0] = v
                }
            }
        case "MarginRight":
            if len(call.Args) == 1 {
                if v, ok := intLitVal(call.Args[0]); ok {
                    st.Margin[1] = v
                }
            }
        case "MarginBottom":
            if len(call.Args) == 1 {
                if v, ok := intLitVal(call.Args[0]); ok {
                    st.Margin[2] = v
                }
            }
        case "MarginLeft":
            if len(call.Args) == 1 {
                if v, ok := intLitVal(call.Args[0]); ok {
                    st.Margin[3] = v
                }
            }
        case "Bold":
            if len(call.Args) == 1 {
                if b, ok := boolIdentVal(call.Args[0]); ok {
                    st.Bold = b
                }
            }
        case "Italic":
            if len(call.Args) == 1 {
                if b, ok := boolIdentVal(call.Args[0]); ok {
                    st.Italic = b
                }
            }
        case "Faint":
            if len(call.Args) == 1 {
                if b, ok := boolIdentVal(call.Args[0]); ok {
                    st.Faint = b
                }
            }
        case "Underline":
            if len(call.Args) == 1 {
                if b, ok := boolIdentVal(call.Args[0]); ok {
                    st.Underline = b
                }
            }
        case "BorderForeground":
            if len(call.Args) == 1 {
                if ref, ok := resolveArg(call.Args[0]); ok {
                    st.BorderColor = ref
                }
            }
        case "Foreground":
            if len(call.Args) == 1 {
                if ref, ok := resolveArg(call.Args[0]); ok {
                    st.Fg = ref
                }
            }
        case "Background":
            if len(call.Args) == 1 {
                if ref, ok := resolveArg(call.Args[0]); ok {
                    st.Bg = ref
                }
            }
        }
    }
    if st.Border != "none" && st.BorderColor == "" {
        st.BorderColor = "$borderIdle"
    }
    return st, true
}

func readQuadArgs(args []dst.Expr) [4]int {
    var nums []int
    for _, a := range args {
        if v, ok := intLitVal(a); ok {
            nums = append(nums, max(0, v))
        }
    }
    switch len(nums) {
    case 1:
        return [4]int{nums[0], nums[0], nums[0], nums[0]}
    case 2:
        return [4]int{nums[0], nums[1], nums[0], nums[1]}
    case 3:
        return [4]int{nums[0], nums[1], nums[2], nums[1]}
    case 4:
        return [4]int{nums[0], nums[1], nums[2], nums[3]}
    default:
        return [4]int{0, 0, 0, 0}
    }
}

func buildStyleExpr(spec IRStyle, tokens map[string]TokenPair) dst.Expr {
    var expr dst.Expr = &dst.CallExpr{
        Fun: &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent("NewStyle")},
    }
    chain := func(method string, args ...dst.Expr) {
        expr = &dst.CallExpr{
            Fun:  &dst.SelectorExpr{X: expr, Sel: dst.NewIdent(method)},
            Args: args,
        }
    }
    colorExpr := func(ref string) dst.Expr {
        if strings.HasPrefix(ref, "$") {
            if pair, ok := tokens[strings.TrimPrefix(ref, "$")]; ok {
                return &dst.CallExpr{
                    Fun: dst.NewIdent("lightDark"),
                    Args: []dst.Expr{
                        &dst.CallExpr{Fun: &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent("Color")}, Args: []dst.Expr{strLit(pair.Light)}},
                        &dst.CallExpr{Fun: &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent("Color")}, Args: []dst.Expr{strLit(pair.Dark)}},
                    },
                }
            }
        }
        return &dst.CallExpr{
            Fun:  &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent("Color")},
            Args: []dst.Expr{strLit(ref)},
        }
    }

    if spec.Border != "" && spec.Border != "none" {
        bFn := "NormalBorder"
        switch spec.Border {
        case "rounded":
            bFn = "RoundedBorder"
        case "thick":
            bFn = "ThickBorder"
        case "double":
            bFn = "DoubleBorder"
        }
        chain("Border", &dst.CallExpr{Fun: &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent(bFn)}})
        if spec.BorderEdges != nil {
            if !spec.BorderEdges[0] {
                chain("BorderTop", boolIdent(false))
            }
            if !spec.BorderEdges[1] {
                chain("BorderRight", boolIdent(false))
            }
            if !spec.BorderEdges[2] {
                chain("BorderBottom", boolIdent(false))
            }
            if !spec.BorderEdges[3] {
                chain("BorderLeft", boolIdent(false))
            }
        }
        if spec.BorderColor != "" {
            chain("BorderForeground", colorExpr(spec.BorderColor))
        }
    }
    if spec.Fg != "" {
        chain("Foreground", colorExpr(spec.Fg))
    }
    if spec.Bg != "" {
        chain("Background", colorExpr(spec.Bg))
    }
    if spec.Padding != [4]int{0, 0, 0, 0} {
        chain("Padding", intLit(spec.Padding[0]), intLit(spec.Padding[1]), intLit(spec.Padding[2]), intLit(spec.Padding[3]))
    }
    if spec.Margin != [4]int{0, 0, 0, 0} {
        chain("Margin", intLit(spec.Margin[0]), intLit(spec.Margin[1]), intLit(spec.Margin[2]), intLit(spec.Margin[3]))
    }
    if spec.Bold {
        chain("Bold", boolIdent(true))
    }
    if spec.Italic {
        chain("Italic", boolIdent(true))
    }
    if spec.Faint {
        chain("Faint", boolIdent(true))
    }
    if spec.Underline {
        chain("Underline", boolIdent(true))
    }
    return expr
}

// syncGoSource surgically updates styles, tokens, and tea.View fields using dave/dst
// while preserving developer comments, formatting, and @tui:sync-disable escape hatches.
func syncGoSource(_ js.Value, args []js.Value) any {
    var out GoSyncResult
    if len(args) < 2 {
        out.Error = "expected (existingGo, irJSON)"
        b, _ := json.Marshal(out)
        return string(b)
    }
    existingGo := args[0].String()
    irJSON := args[1].String()

    var doc SyncIRDoc
    if err := json.Unmarshal([]byte(irJSON), &doc); err != nil {
        out.Error = err.Error()
        b, _ := json.Marshal(out)
        return string(b)
    }

    fset := token.NewFileSet()
    f, err := decorator.ParseFile(fset, "sync.go", existingGo, parser.ParseComments)
    if err != nil {
        out.Error = err.Error()
        b, _ := json.Marshal(out)
        return string(b)
    }

    if fileHasSyncDisable(f, existingGo) {
        out.UpdatedGo = existingGo
        out.SyncDisabled = true
        b, _ := json.Marshal(out)
        return string(b)
    }

    patched := map[string]bool{}
    locked := map[string]bool{}

    lookupStyle := func(goName string) (IRStyle, bool) {
        if st, ok := doc.Styles[goName]; ok {
            return st, true
        }
        if st, ok := doc.Styles[lowerFirst(goName)]; ok {
            return st, true
        }
        return IRStyle{}, false
    }

    lookupToken := func(goName string) (TokenPair, bool) {
        if p, ok := doc.Tokens[goName]; ok {
            return p, true
        }
        if p, ok := doc.Tokens[lowerFirst(goName)]; ok {
            return p, true
        }
        return TokenPair{}, false
    }

    dstutil.Apply(f, func(c *dstutil.Cursor) bool {
        switch node := c.Node().(type) {
        case *dst.ValueSpec:
            if hasDirective(node.Decs.Start, "@tui:block-disable") || hasDirective(node.Decs.Start, "@tui:sync-disable") {
                for _, n := range node.Names {
                    locked[n.Name] = true
                }
                return false
            }
            for i, nameIdent := range node.Names {
                if i >= len(node.Values) {
                    continue
                }
                if pair, ok := lookupToken(nameIdent.Name); ok {
                    if comp, isComp := node.Values[i].(*dst.CompositeLit); isComp {
                        for _, elt := range comp.Elts {
                            if kv, ok := elt.(*dst.KeyValueExpr); ok {
                                if kIdent, ok := kv.Key.(*dst.Ident); ok {
                                    if kIdent.Name == "Light" {
                                        kv.Value = strLit(pair.Light)
                                    } else if kIdent.Name == "Dark" {
                                        kv.Value = strLit(pair.Dark)
                                    }
                                }
                            }
                        }
                        patched[nameIdent.Name] = true
                    }
                } else if st, ok := lookupStyle(nameIdent.Name); ok {
                    if _, isStyle := parseStyleChain(node.Values[i], func(dst.Expr) (string, bool) { return "", false }); isStyle {
                        node.Values[i] = buildStyleExpr(st, doc.Tokens)
                        patched[nameIdent.Name] = true
                    } else {
                        // Dynamic expression (e.g., helper call) -> lock rather than overwrite
                        locked[nameIdent.Name] = true
                    }
                }
            }

        case *dst.AssignStmt:
            if hasDirective(node.Decs.Start, "@tui:block-disable") || hasDirective(node.Decs.Start, "@tui:sync-disable") {
                for _, lhs := range node.Lhs {
                    if id, ok := lhs.(*dst.Ident); ok {
                        locked[id.Name] = true
                    }
                }
                return false
            }
            for i, lhs := range node.Lhs {
                if i >= len(node.Rhs) {
                    continue
                }
                if ident, ok := lhs.(*dst.Ident); ok {
                    if st, ok := lookupStyle(ident.Name); ok {
                        if _, isStyle := parseStyleChain(node.Rhs[i], func(dst.Expr) (string, bool) { return "", false }); isStyle {
                            node.Rhs[i] = buildStyleExpr(st, doc.Tokens)
                            patched[ident.Name] = true
                        } else {
                            locked[ident.Name] = true
                        }
                    }
                }
                // Surgical tea.View field updates (v.AltScreen, v.MouseMode, v.WindowTitle, etc.)
                if sel, ok := lhs.(*dst.SelectorExpr); ok && doc.View != nil {
                    switch sel.Sel.Name {
                    case "AltScreen":
                        node.Rhs[i] = boolIdent(doc.View.AltScreen)
                        patched["tea.View.AltScreen"] = true
                    case "ReportFocus":
                        node.Rhs[i] = boolIdent(doc.View.ReportFocus)
                        patched["tea.View.ReportFocus"] = true
                    case "DisableBracketedPasteMode":
                        node.Rhs[i] = boolIdent(doc.View.DisableBracketedPasteMode)
                        patched["tea.View.DisableBracketedPasteMode"] = true
                    case "WindowTitle":
                        node.Rhs[i] = strLit(doc.View.WindowTitle)
                        patched["tea.View.WindowTitle"] = true
                    case "MouseMode":
                        modeConst := "MouseModeNone"
                        if doc.View.MouseMode == "cell" {
                            modeConst = "MouseModeCellMotion"
                        } else if doc.View.MouseMode == "all" {
                            modeConst = "MouseModeAllMotion"
                        }
                        node.Rhs[i] = &dst.SelectorExpr{X: dst.NewIdent("tea"), Sel: dst.NewIdent(modeConst)}
                        patched["tea.View.MouseMode"] = true
                    }
                }
            }

        case *dst.KeyValueExpr:
            if ident, ok := node.Key.(*dst.Ident); ok {
                if st, ok := lookupStyle(ident.Name); ok {
                    if _, isStyle := parseStyleChain(node.Value, func(dst.Expr) (string, bool) { return "", false }); isStyle {
                        node.Value = buildStyleExpr(st, doc.Tokens)
                        patched[ident.Name] = true
                    }
                }
            }
        }
        return true
    }, nil)

    var buf bytes.Buffer
    if err := decorator.Fprint(&buf, f); err != nil {
        out.Error = err.Error()
        b, _ := json.Marshal(out)
        return string(b)
    }

    out.UpdatedGo = buf.String()
    for k := range patched {
        out.PatchedSymbols = append(out.PatchedSymbols, k)
    }
    for k := range locked {
        out.LockedSymbols = append(out.LockedSymbols, k)
    }
    b, _ := json.Marshal(out)
    return string(b)
}
