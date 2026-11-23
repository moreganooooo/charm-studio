package astsync

import (
	"bytes"
	"encoding/json"
	"go/parser"
	"go/token"
	"sort"
	"strings"

	"github.com/dave/dst"
	"github.com/dave/dst/decorator"
	"github.com/dave/dst/dstutil"
)

func textInputSetting(data *IRWidgetData, field string) dst.Expr {
	switch field {
	case "CharLimit":
		if data.InputCharLimit != nil {
			return intLit(max(0, *data.InputCharLimit))
		}
	case "EchoMode":
		constants := map[string]string{"normal": "EchoNormal", "password": "EchoPassword", "none": "EchoNone"}
		if name, ok := constants[data.InputEchoMode]; ok {
			return &dst.SelectorExpr{X: dst.NewIdent("textinput"), Sel: dst.NewIdent(name)}
		}
	}
	return nil
}

// Older generated constructors do not assign EchoMode or CharLimit. Insert only
// settings the IR supplies, leaving existing (including dynamic) assignments in place.
func insertMissingTextInputSettings(c *dstutil.Cursor, recv string, data *IRWidgetData) bool {
	block, ok := c.Parent().(*dst.BlockStmt)
	if !ok || c.Index() < 0 {
		return false
	}
	assigned := map[string]bool{}
	for _, stmt := range block.List[c.Index()+1:] {
		as, ok := stmt.(*dst.AssignStmt)
		if !ok {
			continue
		}
		for _, lhs := range as.Lhs {
			if sel, ok := lhs.(*dst.SelectorExpr); ok {
				if id, ok := sel.X.(*dst.Ident); ok && id.Name == recv {
					assigned[sel.Sel.Name] = true
				}
			}
		}
	}
	added := false
	for _, field := range []string{"CharLimit", "EchoMode"} {
		if val := textInputSetting(data, field); val != nil && !assigned[field] {
			c.InsertAfter(&dst.AssignStmt{
				Lhs: []dst.Expr{&dst.SelectorExpr{X: dst.NewIdent(recv), Sel: dst.NewIdent(field)}},
				Tok: token.ASSIGN,
				Rhs: []dst.Expr{val},
			})
			added = true
		}
	}
	return added
}

func buildStyleExpr(spec IRStyle, tokens map[string]TokenPair, ldFuncName string, tokenVarNames map[string]string, existingExpr dst.Expr, overridden []string) (dst.Expr, []string) {
	if ldFuncName == "" {
		ldFuncName = "ld"
	}
	overriddenSet := map[string]bool{}
	for _, p := range overridden {
		overriddenSet[p] = true
	}

	// Preserve any dynamic Go argument expressions from an existing chain so partial locks are lossless
	preservedDynamic := map[string]dst.Expr{}
	preservedDynamicCalls := map[string]*dst.CallExpr{}
	if existingExpr != nil {
		cur := existingExpr
		for {
			call, ok := cur.(*dst.CallExpr)
			if !ok {
				break
			}
			sel, ok := call.Fun.(*dst.SelectorExpr)
			if !ok {
				break
			}
			if len(call.Args) == 1 {
				switch sel.Sel.Name {
				case "Foreground":
					if !overriddenSet["fg"] {
						if _, ok := extractHexFromColorExpr(call.Args[0]); !ok && !isKnownColorTokenExpr(call.Args[0], tokenVarNames) {
							preservedDynamic["Foreground"] = dst.Clone(call.Args[0]).(dst.Expr)
						}
					}
				case "Background":
					if !overriddenSet["bg"] {
						if _, ok := extractHexFromColorExpr(call.Args[0]); !ok && !isKnownColorTokenExpr(call.Args[0], tokenVarNames) {
							preservedDynamic["Background"] = dst.Clone(call.Args[0]).(dst.Expr)
						}
					}
				case "BorderForeground":
					if !overriddenSet["borderColor"] {
						if _, ok := extractHexFromColorExpr(call.Args[0]); !ok && !isKnownColorTokenExpr(call.Args[0], tokenVarNames) {
							preservedDynamic["BorderForeground"] = dst.Clone(call.Args[0]).(dst.Expr)
						}
					}
				case "Bold", "Italic", "Faint", "Underline", "Strikethrough":
					if !overriddenSet[lowerFirst(sel.Sel.Name)] {
						if _, ok := boolIdentVal(call.Args[0]); !ok {
							preservedDynamic[sel.Sel.Name] = dst.Clone(call.Args[0]).(dst.Expr)
						}
					}
				case "Border":
					if !overriddenSet["border"] {
						isStd := false
						if bCall, ok := call.Args[0].(*dst.CallExpr); ok {
							if bSel, ok := bCall.Fun.(*dst.SelectorExpr); ok {
								switch bSel.Sel.Name {
								case "RoundedBorder", "ThickBorder", "DoubleBorder", "NormalBorder", "HiddenBorder":
									isStd = true
								}
							}
						}
						if !isStd {
							preservedDynamic["Border"] = dst.Clone(call.Args[0]).(dst.Expr)
						}
					}
				case "AlignHorizontal", "Align":
					if !overriddenSet["alignH"] {
						if _, ok := parseLipAlign(call.Args[0]); !ok {
							preservedDynamic["AlignHorizontal"] = dst.Clone(call.Args[0]).(dst.Expr)
						}
					}
				case "AlignVertical":
					if !overriddenSet["alignV"] {
						if _, ok := parseLipAlign(call.Args[0]); !ok {
							preservedDynamic["AlignVertical"] = dst.Clone(call.Args[0]).(dst.Expr)
						}
					}
				}
			}
			if strings.HasPrefix(sel.Sel.Name, "Padding") && !overriddenSet["padding"] {
				isLit := false
				if sel.Sel.Name == "Padding" {
					_, isLit = readQuadArgs(call.Args)
				} else if len(call.Args) == 1 {
					_, isLit = intLitVal(call.Args[0])
				}
				if !isLit {
					preservedDynamicCalls["padding"] = dst.Clone(call).(*dst.CallExpr)
				}
			}
			if strings.HasPrefix(sel.Sel.Name, "Margin") && !overriddenSet["margin"] {
				isLit := false
				if sel.Sel.Name == "Margin" {
					_, isLit = readQuadArgs(call.Args)
				} else if len(call.Args) == 1 {
					_, isLit = intLitVal(call.Args[0])
				}
				if !isLit {
					preservedDynamicCalls["margin"] = dst.Clone(call).(*dst.CallExpr)
				}
			}
			cur = sel.X
		}
	}

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
			tokName := strings.TrimPrefix(ref, "$")
			if varName, ok := tokenVarNames[tokName]; ok && varName != "" {
				return dst.NewIdent(varName)
			}
			if pair, ok := tokens[tokName]; ok {
				return &dst.CallExpr{
					Fun: dst.NewIdent(ldFuncName),
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

	var lockedProps []string

	if dyn, ok := preservedDynamic["Border"]; ok {
		chain("Border", dyn)
		lockedProps = appendUniqueStr(lockedProps, "border")
	} else if spec.Border != "" && spec.Border != "none" {
		bFn := "NormalBorder"
		switch spec.Border {
		case "rounded":
			bFn = "RoundedBorder"
		case "thick":
			bFn = "ThickBorder"
		case "hidden":
			bFn = "HiddenBorder"
		case "double":
			bFn = "DoubleBorder"
		}
		chain("Border", &dst.CallExpr{Fun: &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent(bFn)}})
		if spec.BorderEdges != nil {
			if !spec.BorderEdges[0] || !spec.BorderEdges[1] || !spec.BorderEdges[2] || !spec.BorderEdges[3] {
				chain("BorderTop", boolIdent(spec.BorderEdges[0]))
				chain("BorderRight", boolIdent(spec.BorderEdges[1]))
				chain("BorderBottom", boolIdent(spec.BorderEdges[2]))
				chain("BorderLeft", boolIdent(spec.BorderEdges[3]))
			}
		}
		if dyn, ok := preservedDynamic["BorderForeground"]; ok {
			chain("BorderForeground", dyn)
			lockedProps = appendUniqueStr(lockedProps, "borderColor")
		} else if spec.BorderColor != "" {
			chain("BorderForeground", colorExpr(spec.BorderColor))
		}
	}

	if dyn, ok := preservedDynamic["Foreground"]; ok {
		chain("Foreground", dyn)
		lockedProps = appendUniqueStr(lockedProps, "fg")
	} else if spec.Fg != "" {
		chain("Foreground", colorExpr(spec.Fg))
	}

	if dyn, ok := preservedDynamic["Background"]; ok {
		chain("Background", dyn)
		lockedProps = appendUniqueStr(lockedProps, "bg")
	} else if spec.Bg != "" {
		chain("Background", colorExpr(spec.Bg))
	}

	if dynCall, ok := preservedDynamicCalls["padding"]; ok {
		if sel, ok := dynCall.Fun.(*dst.SelectorExpr); ok {
			chain(sel.Sel.Name, dynCall.Args...)
			lockedProps = appendUniqueStr(lockedProps, "padding")
		}
	} else if spec.Padding != [4]int{0, 0, 0, 0} {
		chain("Padding", intLit(spec.Padding[0]), intLit(spec.Padding[1]), intLit(spec.Padding[2]), intLit(spec.Padding[3]))
	}
	if dynCall, ok := preservedDynamicCalls["margin"]; ok {
		if sel, ok := dynCall.Fun.(*dst.SelectorExpr); ok {
			chain(sel.Sel.Name, dynCall.Args...)
			lockedProps = appendUniqueStr(lockedProps, "margin")
		}
	} else if spec.Margin != [4]int{0, 0, 0, 0} {
		chain("Margin", intLit(spec.Margin[0]), intLit(spec.Margin[1]), intLit(spec.Margin[2]), intLit(spec.Margin[3]))
	}

	if dyn, ok := preservedDynamic["Bold"]; ok {
		chain("Bold", dyn)
		lockedProps = appendUniqueStr(lockedProps, "bold")
	} else if spec.Bold {
		chain("Bold", boolIdent(true))
	}
	if dyn, ok := preservedDynamic["Italic"]; ok {
		chain("Italic", dyn)
		lockedProps = appendUniqueStr(lockedProps, "italic")
	} else if spec.Italic {
		chain("Italic", boolIdent(true))
	}
	if dyn, ok := preservedDynamic["Faint"]; ok {
		chain("Faint", dyn)
		lockedProps = appendUniqueStr(lockedProps, "faint")
	} else if spec.Faint {
		chain("Faint", boolIdent(true))
	}
	if dyn, ok := preservedDynamic["Underline"]; ok {
		chain("Underline", dyn)
		lockedProps = appendUniqueStr(lockedProps, "underline")
	} else if spec.Underline {
		chain("Underline", boolIdent(true))
	}

	if dyn, ok := preservedDynamic["Strikethrough"]; ok {
		chain("Strikethrough", dyn)
		lockedProps = appendUniqueStr(lockedProps, "strikethrough")
	} else if spec.Strikethrough {
		chain("Strikethrough", boolIdent(true))
	}

	if dyn, ok := preservedDynamic["AlignHorizontal"]; ok {
		chain("AlignHorizontal", dyn)
		lockedProps = appendUniqueStr(lockedProps, "alignH")
	} else if spec.AlignH != "" && spec.AlignH != "left" {
		pos := "Left"
		if spec.AlignH == "center" {
			pos = "Center"
		} else if spec.AlignH == "right" {
			pos = "Right"
		}
		chain("AlignHorizontal", &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent(pos)})
	}
	if dyn, ok := preservedDynamic["AlignVertical"]; ok {
		chain("AlignVertical", dyn)
		lockedProps = appendUniqueStr(lockedProps, "alignV")
	} else if spec.AlignV != "" && spec.AlignV != "top" {
		pos := "Top"
		if spec.AlignV == "center" {
			pos = "Center"
		} else if spec.AlignV == "bottom" {
			pos = "Bottom"
		}
		chain("AlignVertical", &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent(pos)})
	}

	return expr, lockedProps
}

func isKnownColorTokenExpr(e dst.Expr, tokenVarNames map[string]string) bool {
	if id, ok := e.(*dst.Ident); ok {
		for _, v := range tokenVarNames {
			if v == id.Name {
				return true
			}
		}
	}
	if call, ok := e.(*dst.CallExpr); ok && len(call.Args) == 2 {
		_, lOk := extractHexFromColorExpr(call.Args[0])
		_, dOk := extractHexFromColorExpr(call.Args[1])
		return lOk && dOk
	}
	return false
}

func collectNodesMap(doc IRDoc) (map[string]IRNode, string) {
	nodes := map[string]IRNode{}
	firstTextInput := ""
	var walk func(IRNode)
	walk = func(n IRNode) {
		nodes[n.ID] = n
		nodes[lowerFirst(n.ID)] = n
		if n.ContentType == "bubble:textinput" && firstTextInput == "" {
			firstTextInput = lowerFirst(n.ID)
		}
		for _, ch := range n.Children {
			walk(ch)
		}
	}
	walk(doc.Root)
	for _, ov := range doc.Overlays {
		walk(ov.Node)
	}
	return nodes, firstTextInput
}

func buildHuhGroupExpr(fields []IRHuhField) *dst.CallExpr {
	args := make([]dst.Expr, 0, len(fields))
	for _, f := range fields {
		var base *dst.CallExpr
		switch f.Kind {
		case "select":
			optExprs := make([]dst.Expr, 0, max(1, len(f.Options)))
			opts := f.Options
			if len(opts) == 0 {
				opts = []string{"Option A", "Option B"}
			}
			for _, o := range opts {
				optExprs = append(optExprs, &dst.CallExpr{
					Fun:  &dst.SelectorExpr{X: dst.NewIdent("huh"), Sel: dst.NewIdent("NewOption")},
					Args: []dst.Expr{strLit(o), strLit(o)},
				})
			}
			base = &dst.CallExpr{
				Fun: &dst.IndexExpr{
					X:     &dst.SelectorExpr{X: dst.NewIdent("huh"), Sel: dst.NewIdent("NewSelect")},
					Index: dst.NewIdent("string"),
				},
			}
			base = &dst.CallExpr{
				Fun:  &dst.SelectorExpr{X: base, Sel: dst.NewIdent("Title")},
				Args: []dst.Expr{strLit(f.Label)},
			}
			base = &dst.CallExpr{
				Fun:  &dst.SelectorExpr{X: base, Sel: dst.NewIdent("Options")},
				Args: optExprs,
			}
		case "confirm":
			base = &dst.CallExpr{
				Fun: &dst.SelectorExpr{X: dst.NewIdent("huh"), Sel: dst.NewIdent("NewConfirm")},
			}
			base = &dst.CallExpr{
				Fun:  &dst.SelectorExpr{X: base, Sel: dst.NewIdent("Title")},
				Args: []dst.Expr{strLit(f.Label)},
			}
		default:
			base = &dst.CallExpr{
				Fun: &dst.SelectorExpr{X: dst.NewIdent("huh"), Sel: dst.NewIdent("NewInput")},
			}
			base = &dst.CallExpr{
				Fun:  &dst.SelectorExpr{X: base, Sel: dst.NewIdent("Title")},
				Args: []dst.Expr{strLit(f.Label)},
			}
			base = &dst.CallExpr{
				Fun:  &dst.SelectorExpr{X: base, Sel: dst.NewIdent("Placeholder")},
				Args: []dst.Expr{strLit(f.Placeholder)},
			}
		}
		args = append(args, base)
	}
	return &dst.CallExpr{
		Fun:  &dst.SelectorExpr{X: dst.NewIdent("huh"), Sel: dst.NewIdent("NewGroup")},
		Args: args,
	}
}

func patchHuhFormExpr(e dst.Expr, fields []IRHuhField) bool {
	if len(fields) == 0 {
		return false
	}
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
		if sel.Sel.Name == "NewForm" {
			call.Args = []dst.Expr{buildHuhGroupExpr(fields)}
			return true
		}
		cur = sel.X
	}
}

func buildTableColsLit(cols []IRTableColumn) *dst.CompositeLit {
	elts := make([]dst.Expr, 0, len(cols))
	for _, c := range cols {
		elts = append(elts, &dst.CompositeLit{
			Elts: []dst.Expr{
				&dst.KeyValueExpr{Key: dst.NewIdent("Title"), Value: strLit(c.Title)},
				&dst.KeyValueExpr{Key: dst.NewIdent("Width"), Value: intLit(c.Width)},
			},
		})
	}
	return &dst.CompositeLit{
		Type: &dst.ArrayType{Elt: &dst.SelectorExpr{X: dst.NewIdent("table"), Sel: dst.NewIdent("Column")}},
		Elts: elts,
	}
}

func buildTableRowsLit(rows [][]string, colCount int) *dst.CompositeLit {
	elts := make([]dst.Expr, 0, len(rows))
	for _, r := range rows {
		cells := make([]dst.Expr, 0, max(len(r), colCount))
		n := max(len(r), colCount)
		for i := 0; i < n; i++ {
			val := ""
			if i < len(r) {
				val = r[i]
			}
			cells = append(cells, strLit(val))
		}
		elts = append(elts, &dst.CompositeLit{Elts: cells})
	}
	return &dst.CompositeLit{
		Type: &dst.ArrayType{Elt: &dst.SelectorExpr{X: dst.NewIdent("table"), Sel: dst.NewIdent("Row")}},
		Elts: elts,
	}
}

func buildListItemsLit(items []IRListItem) *dst.CompositeLit {
	elts := make([]dst.Expr, 0, len(items))
	for _, it := range items {
		elts = append(elts, &dst.CompositeLit{
			Elts: []dst.Expr{
				&dst.KeyValueExpr{Key: dst.NewIdent("title"), Value: strLit(it.Title)},
				&dst.KeyValueExpr{Key: dst.NewIdent("desc"), Value: strLit(it.Desc)},
			},
		})
	}
	return &dst.CompositeLit{
		Type: &dst.ArrayType{Elt: &dst.SelectorExpr{X: dst.NewIdent("list"), Sel: dst.NewIdent("Item")}},
		Elts: elts,
	}
}

// SyncGoSource surgically updates styles, tokens, tea.View fields (including v.Cursor),
// huh.NewForm groups, and Bubbles options using dave/dst while preserving comments and escape hatches.
func SyncGoSource(existingGo string, doc IRDoc) GoSyncResult {
	var out GoSyncResult
	fset := token.NewFileSet()
	f, err := decorator.ParseFile(fset, "sync.go", existingGo, parser.ParseComments)
	if err != nil {
		out.Error = err.Error()
		return out
	}

	if fileHasSyncDisable(f, existingGo) {
		out.UpdatedGo = existingGo
		out.SyncDisabled = true
		return out
	}

	// Detect LightDark helper name used in file (prefer "ld" matching codegen.ts)
	ldFuncName := "ld"
	if strings.Contains(existingGo, "lightDark(") && !strings.Contains(existingGo, "ld(") {
		ldFuncName = "lightDark"
	}

	// Collect token variable names in scope
	tokenVarNames := map[string]string{}
	dst.Inspect(f, func(n dst.Node) bool {
		switch node := n.(type) {
		case *dst.ValueSpec:
			for i, nm := range node.Names {
				if i < len(node.Values) {
					if _, ok := parseTokenExpr(node.Values[i]); ok {
						tokKey := lowerFirst(nm.Name)
						if tag := extractAnnotation(node.Decs.Start, "@tui:token="); tag != "" {
							tokKey = tag
						}
						tokenVarNames[tokKey] = nm.Name
					}
				}
			}
		case *dst.AssignStmt:
			for i, lhs := range node.Lhs {
				if i >= len(node.Rhs) {
					continue
				}
				if id, ok := lhs.(*dst.Ident); ok {
					if _, ok := parseTokenExpr(node.Rhs[i]); ok {
						tokKey := lowerFirst(id.Name)
						if tag := extractAnnotation(node.Decs.Start, "@tui:token="); tag != "" {
							tokKey = tag
						}
						tokenVarNames[tokKey] = id.Name
					}
				}
			}
		}
		return true
	})

	patched := map[string]bool{}
	locked := map[string]bool{}
	lockedProps := map[string][]string{}
	lockReasons := map[string]string{}

	getOverridden := func(styleKey string) []string {
		if doc.OverriddenProps == nil {
			return nil
		}
		if o, ok := doc.OverriddenProps[styleKey]; ok {
			return o
		}
		if o, ok := doc.OverriddenProps[lowerFirst(styleKey)]; ok {
			return o
		}
		return nil
	}

	lookupStyle := func(goName string) (IRStyle, string, bool) {
		if st, ok := doc.Styles[goName]; ok {
			return st, goName, true
		}
		lf := lowerFirst(goName)
		if st, ok := doc.Styles[lf]; ok {
			return st, lf, true
		}
		return IRStyle{}, "", false
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

	nodesByID, firstTextInput := collectNodesMap(doc)
	resolveWidgetNode := func(varOrTag string) (IRNode, bool) {
		if n, ok := nodesByID[varOrTag]; ok {
			return n, true
		}
		for _, suffix := range []string{"Model", "Form", "Cols", "Rows", "Items"} {
			if strings.HasSuffix(varOrTag, suffix) && len(varOrTag) > len(suffix) {
				trimmed := strings.TrimSuffix(varOrTag, suffix)
				if n, ok := nodesByID[trimmed]; ok {
					return n, true
				}
			}
		}
		return IRNode{}, false
	}

	activeBlockID := ""

	dstutil.Apply(f, func(c *dstutil.Cursor) bool {
		switch node := c.Node().(type) {
		case *dst.ValueSpec:
			if hasSyncDisableDirective(node.Decs.Start) || hasSyncDisableDirective(node.Decs.End) {
				for _, n := range node.Names {
					key := lowerFirst(n.Name)
					locked[key] = true
					lockedProps[key] = []string{"*"}
					lockReasons[key] = "sync-disabled"
				}
				return false
			}
			for i, nameIdent := range node.Names {
				if i >= len(node.Values) {
					continue
				}
				if pair, ok := lookupToken(nameIdent.Name); ok {
					if patchTokenExpr(node.Values[i], pair) {
						patched[nameIdent.Name] = true
					}
				} else if st, styleKey, ok := lookupStyle(nameIdent.Name); ok {
					if _, isStyle := parseStyleChain(node.Values[i], func(dst.Expr) (string, bool) { return "", false }); isStyle {
						newExpr, propLocks := buildStyleExpr(st, doc.Tokens, ldFuncName, tokenVarNames, node.Values[i], getOverridden(styleKey))
						node.Values[i] = newExpr
						patched[nameIdent.Name] = true
						if len(propLocks) > 0 {
							lockedProps[styleKey] = propLocks
							lockReasons[styleKey] = "dynamic"
							locked[styleKey] = true
						}
					} else {
						locked[styleKey] = true
						lockedProps[styleKey] = []string{"*"}
						lockReasons[styleKey] = "dynamic"
					}
				}
			}

		case *dst.AssignStmt:
			if hasSyncDisableDirective(node.Decs.Start) || hasSyncDisableDirective(node.Decs.End) {
				for _, lhs := range node.Lhs {
					if id, ok := lhs.(*dst.Ident); ok {
						key := lowerFirst(id.Name)
						locked[key] = true
						lockedProps[key] = []string{"*"}
						lockReasons[key] = "sync-disabled"
					}
				}
				return false
			}
			if tagID := extractAnnotation(node.Decs.Start, "@tui:id="); tagID != "" {
				activeBlockID = tagID
			}
			for i, lhs := range node.Lhs {
				if i >= len(node.Rhs) {
					continue
				}
				rhs := node.Rhs[i]
				if ident, ok := lhs.(*dst.Ident); ok {
					if pair, ok := lookupToken(ident.Name); ok {
						if patchTokenExpr(rhs, pair) {
							patched[ident.Name] = true
						}
					} else if st, styleKey, ok := lookupStyle(ident.Name); ok {
						if _, isStyle := parseStyleChain(rhs, func(dst.Expr) (string, bool) { return "", false }); isStyle {
							newExpr, propLocks := buildStyleExpr(st, doc.Tokens, ldFuncName, tokenVarNames, rhs, getOverridden(styleKey))
							node.Rhs[i] = newExpr
							patched[ident.Name] = true
							if len(propLocks) > 0 {
								lockedProps[styleKey] = propLocks
								lockReasons[styleKey] = "dynamic"
								locked[styleKey] = true
							}
						} else {
							locked[styleKey] = true
							lockedProps[styleKey] = []string{"*"}
							lockReasons[styleKey] = "dynamic"
						}
					} else {
						// Patch Bubbles / Huh constructors & slice literals
						targetKey := ident.Name
						if activeBlockID != "" {
							targetKey = activeBlockID
						}
						if wn, ok := resolveWidgetNode(targetKey); ok && wn.WidgetData != nil {
							wd := wn.WidgetData
							if strings.HasSuffix(ident.Name, "Cols") && len(wd.TableColumns) > 0 {
								node.Rhs[i] = buildTableColsLit(wd.TableColumns)
								patched[ident.Name] = true
							} else if strings.HasSuffix(ident.Name, "Rows") && len(wd.TableRows) > 0 {
								node.Rhs[i] = buildTableRowsLit(wd.TableRows, len(wd.TableColumns))
								patched[ident.Name] = true
							} else if strings.HasSuffix(ident.Name, "Items") && len(wd.ListItems) > 0 {
								node.Rhs[i] = buildListItemsLit(wd.ListItems)
								patched[ident.Name] = true
							} else if hasChainCall(rhs, "huh", "NewForm") && len(wd.HuhFields) > 0 {
								if patchHuhFormExpr(rhs, wd.HuhFields) {
									patched[wn.ID+".huhForm"] = true
								}
							} else if isPkgCall(rhs, "textinput", "New") && wn.ContentType == "bubble:textinput" {
								if insertMissingTextInputSettings(c, ident.Name, wd) {
									patched[wn.ID+".textinput"] = true
								}
							} else if isPkgCall(rhs, "table", "New") {
								if patchTableNewCall(rhs, wd) {
									patched[wn.ID+".table"] = true
								}
							}
						}
					}
				}

				// Widget field assignments (e.g. sidebarModel.Title = "...", searchBarModel.Prompt = "...")
				if sel, ok := lhs.(*dst.SelectorExpr); ok {
					if recv, ok := sel.X.(*dst.Ident); ok {
						if wn, ok := resolveWidgetNode(recv.Name); ok && wn.WidgetData != nil {
							switch sel.Sel.Name {
							case "Title":
								if wn.WidgetData.ListTitle != "" {
									node.Rhs[i] = strLit(wn.WidgetData.ListTitle)
									patched[wn.ID+".Title"] = true
								}
							case "EchoMode", "CharLimit":
								field := sel.Sel.Name
								_, literalLimit := intLitVal(rhs)
								if wn.ContentType == "bubble:textinput" && ((field == "EchoMode" && inputEchoMode(rhs) != "") || (field == "CharLimit" && literalLimit)) {
									if value := textInputSetting(wn.WidgetData, field); value != nil {
										node.Rhs[i] = value
										patched[wn.ID+"."+field] = true
									}
								}
							case "Prompt":
								if wn.WidgetData.InputPrompt != nil {
									node.Rhs[i] = strLit(*wn.WidgetData.InputPrompt)
									patched[wn.ID+".Prompt"] = true
								}
							case "Placeholder":
								if wn.WidgetData.InputPlaceholder != nil {
									node.Rhs[i] = strLit(*wn.WidgetData.InputPlaceholder)
									patched[wn.ID+".Placeholder"] = true
								}
							}
						}
					}

					// Surgical tea.View field updates (v.AltScreen, v.MouseMode, v.WindowTitle, v.Cursor, etc.)
					if doc.View != nil {
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
						case "Cursor":
							cursorExpr := buildCursorExpr(doc.View, firstTextInput)
							if cursorExpr != nil {
								node.Rhs[i] = cursorExpr
								patched["tea.View.Cursor"] = true
							}
						}
					}
				}
			}

		case *dst.ExprStmt:
			if call, ok := node.X.(*dst.CallExpr); ok {
				if sel, ok := call.Fun.(*dst.SelectorExpr); ok {
					if recv, ok := sel.X.(*dst.Ident); ok {
						if wn, ok := resolveWidgetNode(recv.Name); ok {
							switch sel.Sel.Name {
							case "SetContent":
								if wn.Content != "" && len(call.Args) == 1 {
									call.Args[0] = strLit(wn.Content)
									patched[wn.ID+".SetContent"] = true
								}
							case "SetColumns":
								if wn.WidgetData != nil && len(wn.WidgetData.TableColumns) > 0 && len(call.Args) == 1 {
									call.Args[0] = buildTableColsLit(wn.WidgetData.TableColumns)
									patched[wn.ID+".SetColumns"] = true
								}
							case "SetRows":
								if wn.WidgetData != nil && len(wn.WidgetData.TableRows) > 0 && len(call.Args) == 1 {
									call.Args[0] = buildTableRowsLit(wn.WidgetData.TableRows, len(wn.WidgetData.TableColumns))
									patched[wn.ID+".SetRows"] = true
								}
							case "SetItems":
								if wn.WidgetData != nil && len(wn.WidgetData.ListItems) > 0 && len(call.Args) == 1 {
									call.Args[0] = buildListItemsLit(wn.WidgetData.ListItems)
									patched[wn.ID+".SetItems"] = true
								}
							}
						}
					}
				}
			}

		case *dst.KeyValueExpr:
			if ident, ok := node.Key.(*dst.Ident); ok {
				if hasSyncDisableDirective(node.Decs.Start) || hasSyncDisableDirective(node.Decs.End) {
					key := lowerFirst(ident.Name)
					locked[key] = true
					lockedProps[key] = []string{"*"}
					lockReasons[key] = "sync-disabled"
					return false
				}
				if st, styleKey, ok := lookupStyle(ident.Name); ok {
					if _, isStyle := parseStyleChain(node.Value, func(dst.Expr) (string, bool) { return "", false }); isStyle {
						newExpr, propLocks := buildStyleExpr(st, doc.Tokens, ldFuncName, tokenVarNames, node.Value, getOverridden(styleKey))
						node.Value = newExpr
						patched[ident.Name] = true
						if len(propLocks) > 0 {
							lockedProps[styleKey] = propLocks
							lockReasons[styleKey] = "dynamic"
							locked[styleKey] = true
						}
					}
				}
			}
		}
		return true
	}, nil)

	var buf bytes.Buffer
	if err := decorator.Fprint(&buf, f); err != nil {
		out.Error = err.Error()
		return out
	}

	out.UpdatedGo = buf.String()
	for k := range patched {
		out.PatchedSymbols = append(out.PatchedSymbols, k)
	}
	sort.Strings(out.PatchedSymbols)
	for k := range locked {
		out.LockedSymbols = append(out.LockedSymbols, k)
	}
	sort.Strings(out.LockedSymbols)
	if len(lockedProps) > 0 {
		out.LockedProps = lockedProps
	}
	if len(lockReasons) > 0 {
		out.LockReasons = lockReasons
	}
	return out
}

func patchTokenExpr(expr dst.Expr, pair TokenPair) bool {
	if comp, isComp := expr.(*dst.CompositeLit); isComp {
		changed := false
		for _, elt := range comp.Elts {
			if kv, ok := elt.(*dst.KeyValueExpr); ok {
				if kIdent, ok := kv.Key.(*dst.Ident); ok {
					if kIdent.Name == "Light" {
						kv.Value = strLit(pair.Light)
						changed = true
					} else if kIdent.Name == "Dark" {
						kv.Value = strLit(pair.Dark)
						changed = true
					}
				}
			}
		}
		return changed
	}
	if call, isCall := expr.(*dst.CallExpr); isCall && len(call.Args) == 2 {
		_, lOk := extractHexFromColorExpr(call.Args[0])
		_, dOk := extractHexFromColorExpr(call.Args[1])
		if lOk && dOk {
			call.Args[0] = &dst.CallExpr{Fun: &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent("Color")}, Args: []dst.Expr{strLit(pair.Light)}}
			call.Args[1] = &dst.CallExpr{Fun: &dst.SelectorExpr{X: dst.NewIdent("lipgloss"), Sel: dst.NewIdent("Color")}, Args: []dst.Expr{strLit(pair.Dark)}}
			return true
		}
	}
	return false
}

func patchTableNewCall(expr dst.Expr, wd *IRWidgetData) bool {
	call, ok := expr.(*dst.CallExpr)
	if !ok || wd == nil {
		return false
	}
	changed := false
	for _, arg := range call.Args {
		optCall, ok := arg.(*dst.CallExpr)
		if !ok || len(optCall.Args) != 1 {
			continue
		}
		sel, ok := optCall.Fun.(*dst.SelectorExpr)
		if !ok {
			continue
		}
		if sel.Sel.Name == "WithColumns" && len(wd.TableColumns) > 0 {
			if _, isComp := optCall.Args[0].(*dst.CompositeLit); isComp {
				optCall.Args[0] = buildTableColsLit(wd.TableColumns)
				changed = true
			}
		} else if sel.Sel.Name == "WithRows" && len(wd.TableRows) > 0 {
			if _, isComp := optCall.Args[0].(*dst.CompositeLit); isComp {
				optCall.Args[0] = buildTableRowsLit(wd.TableRows, len(wd.TableColumns))
				changed = true
			}
		}
	}
	return changed
}

func buildCursorExpr(v *ViewConfig, firstTextInput string) dst.Expr {
	if v == nil {
		return nil
	}
	mode := v.CursorMode
	if mode == "" {
		if firstTextInput != "" {
			mode = "auto"
		} else {
			mode = "none"
		}
	}
	switch mode {
	case "manual":
		return &dst.CallExpr{
			Fun:  &dst.SelectorExpr{X: dst.NewIdent("tea"), Sel: dst.NewIdent("NewCursor")},
			Args: []dst.Expr{intLit(max(0, v.CursorX)), intLit(max(0, v.CursorY))},
		}
	case "auto":
		if firstTextInput != "" {
			return &dst.CallExpr{
				Fun: &dst.SelectorExpr{
					X:   &dst.SelectorExpr{X: dst.NewIdent("m"), Sel: dst.NewIdent(firstTextInput)},
					Sel: dst.NewIdent("Cursor"),
				},
			}
		}
		return dst.NewIdent("nil")
	default:
		return dst.NewIdent("nil")
	}
}

// ParseGoSourceJSON is a convenience helper for WASM and CLI callers.
func ParseGoSourceJSON(src string) string {
	b, _ := json.Marshal(ParseGoSource(src))
	return string(b)
}

// SyncGoSourceJSON is a convenience helper for WASM and CLI callers.
func SyncGoSourceJSON(existingGo, irJSON string) string {
	var out GoSyncResult
	var doc IRDoc
	if err := json.Unmarshal([]byte(irJSON), &doc); err != nil {
		out.Error = err.Error()
		b, _ := json.Marshal(out)
		return string(b)
	}
	res := SyncGoSource(existingGo, doc)
	b, _ := json.Marshal(res)
	return string(b)
}
