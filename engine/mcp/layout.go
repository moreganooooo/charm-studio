package mcp

import (
	"fmt"
	"strings"

	"charm.land/lipgloss/v2"

	"charmstudio/engine/astsync"
)

type SizeSpec struct {
	Title string `json:"title,omitempty"`
	Cols  int    `json:"cols"`
	Rows  int    `json:"rows"`
}

type Rect struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

type NodeTelemetry struct {
	ID          string `json:"id"`
	Kind        string `json:"kind"`
	Style       string `json:"style,omitempty"`
	ContentType string `json:"contentType,omitempty"`
	Margin      Rect   `json:"margin"`
	Border      Rect   `json:"border"`
	Padding     Rect   `json:"padding"`
	Content     Rect   `json:"content"`
	AllocatedW  int    `json:"allocatedW"`
	AllocatedH  int    `json:"allocatedH"`
	ActualW     int    `json:"actualW"`
	ActualH     int    `json:"actualH"`
	OverflowX   bool   `json:"overflowX"`
	OverflowY   bool   `json:"overflowY"`
}

type OverflowDiagnosis struct {
	NodeID          string   `json:"nodeId"`
	NodeLabel       string   `json:"nodeLabel"`
	StyleName       string   `json:"styleName,omitempty"`
	PresetTitle     string   `json:"presetTitle"`
	Cols            int      `json:"cols"`
	Rows            int      `json:"rows"`
	AllocatedW      int      `json:"allocatedW"`
	AllocatedH      int      `json:"allocatedH"`
	ActualW         int      `json:"actualW"`
	ActualH         int      `json:"actualH"`
	DeltaW          int      `json:"deltaW"`
	DeltaH          int      `json:"deltaH"`
	DeltaSummary    string   `json:"deltaSummary"`
	Headline        string   `json:"headline"`
	FailingProperty string   `json:"failingProperty"`
	CauseRule       string   `json:"causeRule"`
	GoFile          string   `json:"goFile"`
	GoSymbol        string   `json:"goSymbol"`
	Locked          bool     `json:"locked"`
	LockReason      string   `json:"lockReason,omitempty"`
	Suggestions     []string `json:"suggestions,omitempty"`
	CopyText        string   `json:"copyText"`
}

type LayoutEvaluation struct {
	Cols      int                 `json:"cols"`
	Rows      int                 `json:"rows"`
	Nodes     []NodeTelemetry     `json:"nodes"`
	Diagnoses []OverflowDiagnosis `json:"diagnoses"`
}

func DefaultMatrixSizes() []SizeSpec {
	return []SizeSpec{
		{Title: "Compact (Split Pane)", Cols: 58, Rows: 18},
		{Title: "Standard (80×24)", Cols: 80, Rows: 24},
		{Title: "Wide (Full Screen)", Cols: 116, Rows: 30},
	}
}

func toLipPos(align string, def lipgloss.Position) lipgloss.Position {
	switch align {
	case "left", "top", "start":
		return lipgloss.Left
	case "center":
		return lipgloss.Center
	case "right", "bottom", "end":
		return lipgloss.Right
	default:
		return def
	}
}

func buildLayoutStyles(doc astsync.IRDoc) map[string]lipgloss.Style {
	out := make(map[string]lipgloss.Style, len(doc.Styles))
	for name, spec := range doc.Styles {
		s := lipgloss.NewStyle().
			Padding(spec.Padding[0], spec.Padding[1], spec.Padding[2], spec.Padding[3]).
			Margin(spec.Margin[0], spec.Margin[1], spec.Margin[2], spec.Margin[3]).
			Bold(spec.Bold).
			Italic(spec.Italic).
			Faint(spec.Faint).
			Underline(spec.Underline).
			Strikethrough(spec.Strikethrough)

		switch spec.Border {
		case "rounded":
			s = s.Border(lipgloss.RoundedBorder())
		case "normal":
			s = s.Border(lipgloss.NormalBorder())
		case "thick":
			s = s.Border(lipgloss.ThickBorder())
		case "double":
			s = s.Border(lipgloss.DoubleBorder())
		case "hidden":
			s = s.Border(lipgloss.HiddenBorder())
		}

		if spec.Border != "" && spec.Border != "none" && spec.BorderEdges != nil {
			s = s.BorderTop(spec.BorderEdges[0]).
				BorderRight(spec.BorderEdges[1]).
				BorderBottom(spec.BorderEdges[2]).
				BorderLeft(spec.BorderEdges[3])
		}

		if spec.AlignH != "" {
			s = s.AlignHorizontal(toLipPos(spec.AlignH, lipgloss.Left))
		}
		if spec.AlignV != "" {
			s = s.AlignVertical(toLipPos(spec.AlignV, lipgloss.Top))
		}
		out[name] = s
	}
	return out
}

func insetRect(r Rect, t, ri, b, l int) Rect {
	return Rect{
		X: r.X + l,
		Y: r.Y + t,
		W: max(0, r.W-l-ri),
		H: max(0, r.H-t-b),
	}
}

func truncateText(text string, maxW, maxH int) string {
	lines := strings.Split(text, "\n")
	if maxH > 0 && len(lines) > maxH {
		lines = lines[:maxH]
	}
	for i, line := range lines {
		runes := []rune(line)
		if maxW > 1 && len(runes) > maxW {
			lines[i] = string(runes[:maxW-1]) + "…"
		} else if maxW == 1 && len(runes) > 1 {
			lines[i] = string(runes[:1])
		}
	}
	return strings.Join(lines, "\n")
}

func sampleNodeText(node astsync.IRNode, spec astsync.IRStyle, innerW, innerH int) string {
	body := node.Content
	switch node.ContentType {
	case "bubble:list":
		if node.WidgetData != nil && len(node.WidgetData.ListItems) > 0 {
			lines := make([]string, 0, len(node.WidgetData.ListItems)+1)
			if node.WidgetData.ListTitle != "" {
				lines = append(lines, node.WidgetData.ListTitle)
			}
			for _, item := range node.WidgetData.ListItems {
				lines = append(lines, item.Title)
			}
			body = strings.Join(lines, "\n")
		} else if body == "" {
			body = "Navigation\nOverview\nDeployments\nLive Logs"
		}
	case "bubble:table":
		if node.WidgetData != nil && len(node.WidgetData.TableColumns) > 0 {
			headers := make([]string, 0, len(node.WidgetData.TableColumns))
			for _, col := range node.WidgetData.TableColumns {
				headers = append(headers, fmt.Sprintf("%-*s", max(3, col.Width), col.Title))
			}
			lines := []string{strings.Join(headers, " ")}
			for _, row := range node.WidgetData.TableRows {
				lines = append(lines, strings.Join(row, " "))
			}
			body = strings.Join(lines, "\n")
		} else if body == "" {
			body = "Service       Status    CPU   Mem\napi-gateway   Running   12%   184Mi"
		}
	case "bubble:viewport":
		if body == "" {
			body = "[18:01:02] INFO Booting viewport\n[18:01:03] INFO Press up/down to scroll"
		}
	case "bubble:textinput":
		prompt, placeholder := node.WidgetData.TextInputLabels()
		body = prompt + placeholder
	case "huh:form":
		if node.WidgetData != nil && len(node.WidgetData.HuhFields) > 0 {
			lines := make([]string, 0, len(node.WidgetData.HuhFields)*2)
			for _, f := range node.WidgetData.HuhFields {
				lines = append(lines, f.Label)
			}
			body = strings.Join(lines, "\n")
		} else if body == "" {
			body = "Service Name\nEnvironment\nEnable Auto-Scaling?"
		}
	}

	if spec.Truncate {
		return truncateText(body, innerW, innerH)
	}
	return body
}

func evalLayoutNode(
	node astsync.IRNode,
	x, y, availW, availH, viewW int,
	doc astsync.IRDoc,
	styles map[string]lipgloss.Style,
	tel *[]NodeTelemetry,
) string {
	switch node.Kind {
	case "JoinHorizontal":
		var visible []astsync.IRNode
		fixedTotal, weightTotal := 0, 0
		for _, ch := range node.Children {
			if ch.Width.CollapseBelow > 0 && viewW < ch.Width.CollapseBelow {
				continue
			}
			visible = append(visible, ch)
			if ch.Width.Mode == "fixed" {
				fixedTotal += ch.Width.Value
			} else {
				w := ch.Width.Weight
				if w <= 0 {
					w = 1
				}
				weightTotal += w
			}
		}
		remW := max(0, availW-fixedTotal)
		curX := x
		parts := make([]string, 0, len(visible))
		for _, ch := range visible {
			cw := ch.Width.Value
			if ch.Width.Mode != "fixed" {
				w := ch.Width.Weight
				if w <= 0 {
					w = 1
				}
				cw = (remW * w) / max(1, weightTotal)
			}
			out := evalLayoutNode(ch, curX, y, cw, availH, viewW, doc, styles, tel)
			actualW, _ := lipgloss.Size(out)
			curX += actualW
			parts = append(parts, out)
		}
		return lipgloss.JoinHorizontal(toLipPos(node.JoinAlign, lipgloss.Top), parts...)

	case "JoinVertical":
		var visible []astsync.IRNode
		fixedTotal, weightTotal := 0, 0
		for _, ch := range node.Children {
			if ch.Width.CollapseBelow > 0 && viewW < ch.Width.CollapseBelow {
				continue
			}
			visible = append(visible, ch)
			if ch.Height.Mode == "fixed" {
				fixedTotal += ch.Height.Value
			} else {
				w := ch.Height.Weight
				if w <= 0 {
					w = 1
				}
				weightTotal += w
			}
		}
		remH := max(0, availH-fixedTotal)
		curY := y
		parts := make([]string, 0, len(visible))
		for _, ch := range visible {
			chH := ch.Height.Value
			if ch.Height.Mode != "fixed" {
				w := ch.Height.Weight
				if w <= 0 {
					w = 1
				}
				chH = (remH * w) / max(1, weightTotal)
			}
			out := evalLayoutNode(ch, x, curY, availW, chH, viewW, doc, styles, tel)
			_, actualH := lipgloss.Size(out)
			curY += actualH
			parts = append(parts, out)
		}
		return lipgloss.JoinVertical(toLipPos(node.JoinAlign, lipgloss.Left), parts...)

	default:
		s := styles[node.Style]
		spec := doc.Styles[node.Style]

		targetW := max(0, availW-s.GetHorizontalMargins())
		targetH := max(0, availH-s.GetVerticalMargins())
		if node.Width.Mode == "fixed" && node.Width.Value > 0 {
			targetW = max(0, node.Width.Value-s.GetHorizontalMargins())
		} else if node.Width.Mode != "fit" {
			s = s.Width(targetW)
		}
		if node.Width.Mode == "fixed" {
			s = s.Width(targetW)
		}
		if node.Height.Mode == "fixed" && node.Height.Value > 0 {
			targetH = max(0, node.Height.Value-s.GetVerticalMargins())
			s = s.Height(targetH)
		} else if node.Height.Mode != "fit" {
			s = s.Height(targetH)
		}

		innerW := max(1, targetW-s.GetHorizontalPadding()-s.GetHorizontalBorderSize())
		innerH := max(1, targetH-s.GetVerticalPadding()-s.GetVerticalBorderSize())
		body := sampleNodeText(node, spec, innerW, innerH)
		rendered := s.Render(body)
		actualW, actualH := lipgloss.Size(rendered)

		mRect := Rect{X: x, Y: y, W: actualW, H: actualH}
		bRect := insetRect(mRect, s.GetMarginTop(), s.GetMarginRight(), s.GetMarginBottom(), s.GetMarginLeft())
		pRect := insetRect(bRect, s.GetBorderTopSize(), s.GetBorderRightSize(), s.GetBorderBottomSize(), s.GetBorderLeftSize())
		cRect := insetRect(pRect, s.GetPaddingTop(), s.GetPaddingRight(), s.GetPaddingBottom(), s.GetPaddingLeft())

		overX := actualW > availW
		overY := actualH > availH

		*tel = append(*tel, NodeTelemetry{
			ID:          node.ID,
			Kind:        node.Kind,
			Style:       node.Style,
			ContentType: node.ContentType,
			Margin:      mRect,
			Border:      bRect,
			Padding:     pRect,
			Content:     cRect,
			AllocatedW:  availW,
			AllocatedH:  availH,
			ActualW:     actualW,
			ActualH:     actualH,
			OverflowX:   overX,
			OverflowY:   overY,
		})
		return rendered
	}
}

func friendlyLabel(node *astsync.IRNode, fallbackID string) string {
	if node != nil && node.Content != "" {
		firstLine := strings.TrimSpace(strings.Split(node.Content, "\n")[0])
		if len(firstLine) > 0 && len([]rune(firstLine)) <= 24 {
			return firstLine
		}
	}
	return fallbackID
}

func findIRNode(root astsync.IRNode, overlays []astsync.IROverlay, id string) *astsync.IRNode {
	if node, _ := findNodeWithPath(root, id, nil); node != nil {
		return node
	}
	for _, ov := range overlays {
		if node, _ := findNodeWithPath(ov.Node, id, nil); node != nil {
			return node
		}
	}
	return nil
}

func hasPropLock(props []string, target string) bool {
	for _, p := range props {
		if p == "*" || p == target {
			return true
		}
	}
	return false
}

func evaluateLayout(doc astsync.IRDoc, cols, rows int, presetTitle string) LayoutEvaluation {
	if cols < 10 {
		cols = 10
	}
	if rows < 5 {
		rows = 5
	}
	if presetTitle == "" {
		presetTitle = fmt.Sprintf("%d×%d", cols, rows)
	}
	styles := buildLayoutStyles(doc)
	var tel []NodeTelemetry
	_ = evalLayoutNode(doc.Root, 0, 0, cols, rows, cols, doc, styles, &tel)

	diagnoses := make([]OverflowDiagnosis, 0)
	for _, t := range tel {
		if !t.OverflowX && !t.OverflowY {
			continue
		}
		node := findIRNode(doc.Root, doc.Overlays, t.ID)
		label := friendlyLabel(node, t.ID)
		spec, hasStyle := doc.Styles[t.Style]

		deltaW := max(0, t.ActualW-t.AllocatedW)
		deltaH := max(0, t.ActualH-t.AllocatedH)

		padV := spec.Padding[0] + spec.Padding[2]
		padH := spec.Padding[1] + spec.Padding[3]

		nodeKey := "node:" + t.ID
		nodeLocks := doc.LockedProps[nodeKey]
		styleLocks := doc.LockedProps[t.Style]
		nodeLocked := doc.LockReasons[nodeKey] == "sync-disabled" || hasPropLock(nodeLocks, "*")
		styleLocked := t.Style != "" && (doc.LockReasons[t.Style] == "sync-disabled" || hasPropLock(styleLocks, "*"))
		widthLocked := nodeLocked || hasPropLock(nodeLocks, "width")
		paddingLocked := styleLocked || hasPropLock(styleLocks, "padding")

		failingProp := "width"
		causeRule := fmt.Sprintf("Content exceeds %d×%d allocated cells", t.AllocatedW, t.AllocatedH)
		if deltaW > 0 {
			if node != nil && node.Width.Mode == "fixed" && node.Width.Value > t.AllocatedW {
				failingProp = "width"
				causeRule = fmt.Sprintf("Fixed Width(%d) exceeds %d allocated cols", node.Width.Value, t.AllocatedW)
			} else if padH > 0 && (node == nil || node.Width.Mode != "fixed" || padH >= deltaW) {
				failingProp = "padding"
				causeRule = fmt.Sprintf("Horizontal Padding(%d, %d) (%d cols) exceeds %d-col cell budget", spec.Padding[0], spec.Padding[1], padH, t.AllocatedW)
			} else {
				failingProp = "width"
				causeRule = fmt.Sprintf("Rendered width (%d cols) exceeds %d allocated cols", t.ActualW, t.AllocatedW)
			}
		} else if deltaH > 0 {
			if padV > 0 && (node == nil || node.Height.Mode != "fixed" || padV >= deltaH) {
				failingProp = "padding"
				causeRule = fmt.Sprintf("Vertical Padding(%d, %d) (%d rows) exceeds %d-row cell budget", spec.Padding[0], spec.Padding[1], padV, t.AllocatedH)
			} else {
				failingProp = "width"
				causeRule = fmt.Sprintf("Rendered height (%d rows) exceeds %d allocated rows", t.ActualH, t.AllocatedH)
			}
		}

		var deltaParts []string
		if deltaW > 0 {
			unit := "cols"
			if deltaW == 1 {
				unit = "col"
			}
			deltaParts = append(deltaParts, fmt.Sprintf("+%d %s", deltaW, unit))
		}
		if deltaH > 0 {
			unit := "rows"
			if deltaH == 1 {
				unit = "row"
			}
			deltaParts = append(deltaParts, fmt.Sprintf("+%d %s", deltaH, unit))
		}
		deltaSummary := strings.Join(deltaParts, " · ")

		var suggestions []string
		if hasStyle && !paddingLocked && ((deltaW > 0 && padH > 0) || (deltaH > 0 && padV > 0)) {
			nextV := spec.Padding[0]
			if deltaH > 0 {
				nextV = max(0, spec.Padding[0]-1)
			}
			nextH := spec.Padding[1]
			if deltaW > 0 {
				nextH = max(0, spec.Padding[1]-1)
			}
			suggestions = append(suggestions, fmt.Sprintf("Reduce Padding to (%d, %d)", nextV, nextH))
		}
		if hasStyle && !spec.Truncate && !styleLocked {
			suggestions = append(suggestions, "Enable Truncate on style "+t.Style)
		}
		if node != nil && !widthLocked && node.Width.CollapseBelow < 70 && t.ID != doc.Root.ID {
			suggestions = append(suggestions, "Set CollapseBelow(70) to hide narrow sidebar panes below 70 cols")
		}
		if node != nil && !widthLocked && node.Width.Mode == "fixed" && t.ID != doc.Root.ID {
			suggestions = append(suggestions, "Switch Width from fixed to fill so container shares remaining columns")
		}

		goFile := "ui/layout_gen.go"
		goSymbol := t.ID
		if failingProp == "padding" {
			goFile = "ui/theme_gen.go"
			if t.Style != "" {
				goSymbol = t.Style
			}
		}

		locked := paddingLocked
		lockReason := ""
		if failingProp == "width" {
			locked = widthLocked
			lockReason = doc.LockReasons[nodeKey]
		} else if t.Style != "" {
			lockReason = doc.LockReasons[t.Style]
		}

		headline := fmt.Sprintf("%s overflows at %d x %d", label, cols, rows)
		copyLines := []string{
			headline,
			fmt.Sprintf("Dimensions: actual %d×%d vs allocated %d×%d (%s)", t.ActualW, t.ActualH, t.AllocatedW, t.AllocatedH, deltaSummary),
			"Cause: " + causeRule,
		}
		if len(suggestions) > 0 {
			copyLines = append(copyLines, "Suggestion: "+suggestions[0])
		}

		diagnoses = append(diagnoses, OverflowDiagnosis{
			NodeID:          t.ID,
			NodeLabel:       label,
			StyleName:       t.Style,
			PresetTitle:     presetTitle,
			Cols:            cols,
			Rows:            rows,
			AllocatedW:      t.AllocatedW,
			AllocatedH:      t.AllocatedH,
			ActualW:         t.ActualW,
			ActualH:         t.ActualH,
			DeltaW:          deltaW,
			DeltaH:          deltaH,
			DeltaSummary:    deltaSummary,
			Headline:        headline,
			FailingProperty: failingProp,
			CauseRule:       causeRule,
			GoFile:          goFile,
			GoSymbol:        goSymbol,
			Locked:          locked,
			LockReason:      lockReason,
			Suggestions:     suggestions,
			CopyText:        strings.Join(copyLines, "\n"),
		})
	}

	return LayoutEvaluation{
		Cols:      cols,
		Rows:      rows,
		Nodes:     tel,
		Diagnoses: diagnoses,
	}
}
