//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"image/color"
	"strings"
	"syscall/js"

	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/table"
	"charm.land/bubbles/v2/textinput"
	"charm.land/bubbles/v2/viewport"
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// --- Layout IR ---

type IRDoc struct {
	Tokens   map[string]TokenPair `json:"tokens"`
	Styles   map[string]IRStyle   `json:"styles"`
	Root     IRNode               `json:"root"`
	Overlays []IROverlay          `json:"overlays"`
}

type TokenPair struct {
	Light string `json:"light"`
	Dark  string `json:"dark"`
}

type IRStyle struct {
	Border      string `json:"border"`
	BorderColor string `json:"borderColor"`
	Fg          string `json:"fg"`
	Bg          string `json:"bg"`
	Padding     [4]int `json:"padding"`
	Margin      [4]int `json:"margin"`
	Bold        bool   `json:"bold"`
}

type IRSize struct {
	Mode          string `json:"mode"`
	Value         int    `json:"value"`
	Weight        int    `json:"weight"`
	CollapseBelow int    `json:"collapseBelow"`
}

type IRNode struct {
	ID          string   `json:"id"`
	Kind        string   `json:"kind"`
	Style       string   `json:"style"`
	ContentType string   `json:"contentType"`
	Width       IRSize   `json:"width"`
	Height      IRSize   `json:"height"`
	Content     string   `json:"content"`
	Children    []IRNode `json:"children"`
}

type IROverlay struct {
	ID      string `json:"id"`
	Visible bool   `json:"visible"`
	Z       int    `json:"z"`
	Node    IRNode `json:"node"`
}

// --- Frame & Telemetry Output ---

type Rect struct {
	X int `json:"x"`
	Y int `json:"y"`
	W int `json:"w"`
	H int `json:"h"`
}

type TelemetryNode struct {
	ID        string `json:"id"`
	Kind      string `json:"kind"`
	Style     string `json:"style"`
	Margin    Rect   `json:"margin"`
	Border    Rect   `json:"border"`
	Padding   Rect   `json:"padding"`
	Content   Rect   `json:"content"`
	OverflowX bool   `json:"overflowX"`
	OverflowY bool   `json:"overflowY"`
}

type CellDTO struct {
	C string `json:"c,omitempty"` // grapheme
	F string `json:"f,omitempty"` // fg hex
	B string `json:"b,omitempty"` // bg hex
	A uint8  `json:"a,omitempty"` // bit 0: bold, bit 1: italic, bit 2: reverse, bit 3: faint
	W int    `json:"w,omitempty"` // display cell width (0 = continuation cell)
}

type RenderResult struct {
	Cells     []CellDTO       `json:"cells"`
	Telemetry []TelemetryNode `json:"telemetry"`
	Error     string          `json:"error,omitempty"`
}

// --- Stateful Bubbles Registry ---

type listItem struct {
	title, desc string
}

func (i listItem) Title() string       { return i.title }
func (i listItem) Description() string { return i.desc }
func (i listItem) FilterValue() string { return i.title }

type bubbleEntry struct {
	kind  string
	list  list.Model
	table table.Model
	vp    viewport.Model
	input textinput.Model
}

var bubblesStore = map[string]*bubbleEntry{}

func getOrCreateBubble(id, kind, fallbackText string, w, h int, hasDarkBG bool, tokens map[string]TokenPair) *bubbleEntry {
	entry, ok := bubblesStore[id]
	if !ok || entry.kind != kind {
		entry = &bubbleEntry{kind: kind}
		switch kind {
		case "bubble:list":
			items := []list.Item{
				listItem{"Overview", "Cluster health & metrics"},
				listItem{"Deployments", "14 active workloads"},
				listItem{"Live Logs", "Streaming stdout/stderr"},
				listItem{"Ingresses", "TLS & routing rules"},
				listItem{"Secrets", "Encrypted vault keys"},
				listItem{"Settings", "Theme & keybindings"},
			}
			del := list.NewDefaultDelegate()
			l := list.New(items, del, max(10, w), max(5, h))
			l.Title = "Navigation"
			l.SetShowHelp(false)
			l.SetShowStatusBar(false)
			entry.list = l

		case "bubble:table":
			cols := []table.Column{
				{Title: "Service", Width: 13},
				{Title: "Status", Width: 9},
				{Title: "CPU", Width: 5},
				{Title: "Mem", Width: 6},
			}
			rows := []table.Row{
				{"api-gateway", "Running", "12%", "184Mi"},
				{"auth-worker", "Running", "4%", "92Mi"},
				{"billing-cron", "Idle", "0%", "48Mi"},
				{"edge-proxy", "Running", "28%", "310Mi"},
				{"indexer-v2", "Syncing", "64%", "740Mi"},
				{"metrics-sink", "Running", "9%", "128Mi"},
				{"notify-bus", "Degraded", "41%", "256Mi"},
				{"search-node", "Running", "19%", "512Mi"},
				{"wasm-runner", "Running", "7%", "64Mi"},
			}
			entry.table = table.New(
				table.WithColumns(cols),
				table.WithRows(rows),
				table.WithFocused(true),
				table.WithHeight(max(4, h)),
				table.WithWidth(max(12, w)),
			)

		case "bubble:viewport":
			vp := viewport.New(viewport.WithWidth(max(10, w)), viewport.WithHeight(max(3, h)))
			vp.SoftWrap = true
			sample := fallbackText
			if strings.Count(sample, "\n") < 4 {
				sample = strings.Join([]string{
					"[18:01:02] INFO  Booting charmstudio WASM evaluator...",
					"[18:01:02] INFO  Lip Gloss v2 Canvas initialized",
					"[18:01:03] DEBUG Resolving adaptive LightDark tokens",
					"[18:01:03] INFO  Direct cell-grid HiDPI renderer active",
					"[18:01:04] WARN  Narrow pane (<70 cols) collapses sidebar",
					"[18:01:05] INFO  Press ↑/↓ or j/k to scroll this viewport",
					"[18:01:06] DEBUG Frame telemetry emitted cleanly",
					"[18:01:07] INFO  Ready for interactive key events",
					"[18:01:08] INFO  Line 9 — keep scrolling!",
					"[18:01:09] INFO  Line 10 — soft wrap active",
					"[18:01:10] INFO  Line 11 — zero layout drift",
					"[18:01:11] INFO  Line 12 — end of sample log stream",
				}, "\n")
			}
			vp.SetContent(sample)
			entry.vp = vp

		case "bubble:textinput":
			ti := textinput.New()
			ti.Placeholder = "Filter services or type a command..."
			ti.SetVirtualCursor(true)
			ti.Focus()
			ti.SetWidth(max(6, w-3))
			entry.input = ti
		}
		bubblesStore[id] = entry
	}

	ld := lipgloss.LightDark(hasDarkBG)
	switch entry.kind {
	case "bubble:list":
		del := list.NewDefaultDelegate()
		del.Styles = list.NewDefaultItemStyles(hasDarkBG)
		entry.list.SetDelegate(del)
		entry.list.Styles = list.DefaultStyles(hasDarkBG)
		entry.list.SetSize(max(10, w), max(4, h))
	case "bubble:table":
		accentHex := resolveColor("$accent", tokens, hasDarkBG)
		if accentHex == "" || accentHex == "$accent" {
			accentHex = "#7aa2f7"
		}
		borderHex := resolveColor("$borderIdle", tokens, hasDarkBG)
		if borderHex == "" || borderHex == "$borderIdle" {
			borderHex = "#414868"
		}
		ts := table.DefaultStyles()
		ts.Header = ts.Header.
			BorderStyle(lipgloss.NormalBorder()).
			BorderForeground(lipgloss.Color(borderHex)).
			BorderBottom(true).
			Bold(true)
		ts.Selected = ts.Selected.
			Foreground(ld(lipgloss.Color("#ffffff"), lipgloss.Color("#11111b"))).
			Background(lipgloss.Color(accentHex)).
			Bold(true)
		entry.table.SetStyles(ts)
		entry.table.SetWidth(max(12, w))
		entry.table.SetHeight(max(4, h))
	case "bubble:viewport":
		entry.vp.SetWidth(max(10, w))
		entry.vp.SetHeight(max(3, h))
	case "bubble:textinput":
		entry.input.SetStyles(textinput.DefaultStyles(hasDarkBG))
		entry.input.SetWidth(max(6, w-3))
	}

	return entry
}

func renderNodeContent(node IRNode, innerW, innerH int, hasDarkBG bool, tokens map[string]TokenPair) string {
	if strings.HasPrefix(node.ContentType, "bubble:") {
		b := getOrCreateBubble(node.ID, node.ContentType, node.Content, innerW, innerH, hasDarkBG, tokens)
		switch b.kind {
		case "bubble:list":
			return b.list.View()
		case "bubble:table":
			return b.table.View()
		case "bubble:viewport":
			return b.vp.View()
		case "bubble:textinput":
			return b.input.View()
		}
	}
	return node.Content
}

func toKeyPressMsg(key string) (tea.KeyPressMsg, bool) {
	switch key {
	case "ArrowUp":
		return tea.KeyPressMsg{Code: tea.KeyUp}, true
	case "ArrowDown":
		return tea.KeyPressMsg{Code: tea.KeyDown}, true
	case "ArrowLeft":
		return tea.KeyPressMsg{Code: tea.KeyLeft}, true
	case "ArrowRight":
		return tea.KeyPressMsg{Code: tea.KeyRight}, true
	case "PageUp":
		return tea.KeyPressMsg{Code: tea.KeyPgUp}, true
	case "PageDown":
		return tea.KeyPressMsg{Code: tea.KeyPgDown}, true
	case "Enter":
		return tea.KeyPressMsg{Code: tea.KeyEnter}, true
	case "Backspace":
		return tea.KeyPressMsg{Code: tea.KeyBackspace}, true
	case "Escape":
		return tea.KeyPressMsg{Code: tea.KeyEscape}, true
	case " ":
		return tea.KeyPressMsg{Code: tea.KeySpace, Text: " "}, true
	default:
		runes := []rune(key)
		if len(runes) == 1 {
			return tea.KeyPressMsg{Code: runes[0], Text: key}, true
		}
		return tea.KeyPressMsg{}, false
	}
}

func dispatchStudioKey(_ js.Value, args []js.Value) any {
	if len(args) < 2 {
		return false
	}
	nodeID := args[0].String()
	keyStr := args[1].String()

	entry, ok := bubblesStore[nodeID]
	if !ok {
		return false
	}
	msg, valid := toKeyPressMsg(keyStr)
	if !valid {
		return false
	}

	switch entry.kind {
	case "bubble:list":
		entry.list, _ = entry.list.Update(msg)
	case "bubble:table":
		entry.table, _ = entry.table.Update(msg)
	case "bubble:viewport":
		entry.vp, _ = entry.vp.Update(msg)
	case "bubble:textinput":
		entry.input, _ = entry.input.Update(msg)
	}
	return true
}

// --- Evaluator ---

func resolveColor(ref string, tokens map[string]TokenPair, hasDarkBG bool) string {
	if strings.HasPrefix(ref, "$") {
		if pair, ok := tokens[strings.TrimPrefix(ref, "$")]; ok {
			if hasDarkBG {
				return pair.Dark
			}
			return pair.Light
		}
	}
	return ref
}

func colorToHex(c color.Color) string {
	if c == nil {
		return ""
	}
	r, g, b, a := c.RGBA()
	if a == 0 {
		return ""
	}
	return fmt.Sprintf("#%02x%02x%02x", r>>8, g>>8, b>>8)
}

func buildStyles(doc IRDoc, hasDarkBG bool) map[string]lipgloss.Style {
	out := make(map[string]lipgloss.Style, len(doc.Styles))
	ld := lipgloss.LightDark(hasDarkBG)

	for name, spec := range doc.Styles {
		s := lipgloss.NewStyle().
			Padding(spec.Padding[0], spec.Padding[1], spec.Padding[2], spec.Padding[3]).
			Margin(spec.Margin[0], spec.Margin[1], spec.Margin[2], spec.Margin[3]).
			Bold(spec.Bold)

		switch spec.Border {
		case "rounded":
			s = s.Border(lipgloss.RoundedBorder())
		case "normal":
			s = s.Border(lipgloss.NormalBorder())
		case "thick":
			s = s.Border(lipgloss.ThickBorder())
		case "double":
			s = s.Border(lipgloss.DoubleBorder())
		}

		if spec.BorderColor != "" {
			if strings.HasPrefix(spec.BorderColor, "$") {
				if p, ok := doc.Tokens[strings.TrimPrefix(spec.BorderColor, "$")]; ok {
					s = s.BorderForeground(ld(lipgloss.Color(p.Light), lipgloss.Color(p.Dark)))
				}
			} else {
				s = s.BorderForeground(lipgloss.Color(spec.BorderColor))
			}
		}
		if spec.Fg != "" {
			s = s.Foreground(lipgloss.Color(resolveColor(spec.Fg, doc.Tokens, hasDarkBG)))
		}
		if spec.Bg != "" {
			s = s.Background(lipgloss.Color(resolveColor(spec.Bg, doc.Tokens, hasDarkBG)))
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

func evalNode(node IRNode, x, y, availW, availH, viewW int, hasDarkBG bool, tokens map[string]TokenPair, styles map[string]lipgloss.Style, tel *[]TelemetryNode) string {
	switch node.Kind {
	case "JoinHorizontal":
		var visible []IRNode
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
			out := evalNode(ch, curX, y, cw, availH, viewW, hasDarkBG, tokens, styles, tel)
			actualW, _ := lipgloss.Size(out)
			curX += actualW
			parts = append(parts, out)
		}
		return lipgloss.JoinHorizontal(lipgloss.Top, parts...)

	case "JoinVertical":
		var visible []IRNode
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
			out := evalNode(ch, x, curY, availW, chH, viewW, hasDarkBG, tokens, styles, tel)
			_, actualH := lipgloss.Size(out)
			curY += actualH
			parts = append(parts, out)
		}
		return lipgloss.JoinVertical(lipgloss.Left, parts...)

	default:
		s := styles[node.Style]

		targetW := max(0, availW-s.GetHorizontalMargins())
		targetH := max(0, availH-s.GetVerticalMargins())
		if node.Width.Mode != "fit" {
			s = s.Width(targetW)
		}
		if node.Height.Mode != "fit" {
			s = s.Height(targetH)
		}

		innerW := max(1, targetW-s.GetHorizontalPadding()-s.GetHorizontalBorderSize())
		innerH := max(1, targetH-s.GetVerticalPadding()-s.GetVerticalBorderSize())
		bodyStr := renderNodeContent(node, innerW, innerH, hasDarkBG, tokens)

		rendered := s.Render(bodyStr)
		actualW, actualH := lipgloss.Size(rendered)

		mRect := Rect{X: x, Y: y, W: actualW, H: actualH}
		bRect := insetRect(mRect, s.GetMarginTop(), s.GetMarginRight(), s.GetMarginBottom(), s.GetMarginLeft())
		pRect := insetRect(bRect, s.GetBorderTopSize(), s.GetBorderRightSize(), s.GetBorderBottomSize(), s.GetBorderLeftSize())
		cRect := insetRect(pRect, s.GetPaddingTop(), s.GetPaddingRight(), s.GetPaddingBottom(), s.GetPaddingLeft())

		*tel = append(*tel, TelemetryNode{
			ID:        node.ID,
			Kind:      node.Kind,
			Style:     node.Style,
			Margin:    mRect,
			Border:    bRect,
			Padding:   pRect,
			Content:   cRect,
			OverflowX: actualW > availW,
			OverflowY: actualH > availH,
		})
		return rendered
	}
}

func renderStudio(_ js.Value, args []js.Value) any {
	var res RenderResult
	if len(args) < 4 {
		res.Error = "expected (irJSON, cols, rows, hasDarkBG)"
		b, _ := json.Marshal(res)
		return string(b)
	}

	irJSON := args[0].String()
	cols := max(10, args[1].Int())
	rows := max(5, args[2].Int())
	hasDarkBG := args[3].Bool()

	var doc IRDoc
	if err := json.Unmarshal([]byte(irJSON), &doc); err != nil {
		res.Error = err.Error()
		b, _ := json.Marshal(res)
		return string(b)
	}

	styles := buildStyles(doc, hasDarkBG)
	var tel []TelemetryNode

	rootRendered := evalNode(doc.Root, 0, 0, cols, rows, cols, hasDarkBG, doc.Tokens, styles, &tel)
	layers := []*lipgloss.Layer{
		lipgloss.NewLayer(rootRendered).X(0).Y(0).Z(0).ID(doc.Root.ID),
	}

	for _, ov := range doc.Overlays {
		if !ov.Visible {
			continue
		}
		ovW := ov.Node.Width.Value
		if ovW <= 0 {
			ovW = 44
		}
		ovH := ov.Node.Height.Value
		if ovH <= 0 {
			ovH = 9
		}
		ox := max(0, (cols-ovW)/2)
		oy := max(0, (rows-ovH)/2)
		ovStr := evalNode(ov.Node, ox, oy, ovW, ovH, cols, hasDarkBG, doc.Tokens, styles, &tel)
		layers = append(layers, lipgloss.NewLayer(ovStr).X(ox).Y(oy).Z(ov.Z).ID(ov.ID))
	}

	canvas := lipgloss.NewCanvas(cols, rows)
	comp := lipgloss.NewCompositor(layers...)
	canvas.Compose(comp)

	// Extract exact resolved cell grid directly from Lip Gloss v2 Canvas
	cells := make([]CellDTO, cols*rows)
	for row := 0; row < rows; row++ {
		for col := 0; col < cols; col++ {
			c := canvas.CellAt(col, row)
			if c == nil {
				continue
			}
			var at uint8
			if c.Style.Attrs&1 != 0 { // AttrBold
				at |= 1
			}
			if c.Style.Attrs&4 != 0 { // AttrItalic
				at |= 2
			}
			if c.Style.Attrs&32 != 0 { // AttrReverse
				at |= 4
			}
			if c.Style.Attrs&2 != 0 { // AttrFaint
				at |= 8
			}
			cells[row*cols+col] = CellDTO{
				C: c.Content,
				F: colorToHex(c.Style.Fg),
				B: colorToHex(c.Style.Bg),
				A: at,
				W: c.Width,
			}
		}
	}

	res.Cells = cells
	res.Telemetry = tel

	b, _ := json.Marshal(res)
	return string(b)
}

func main() {
	js.Global().Set("renderStudio", js.FuncOf(renderStudio))
	js.Global().Set("dispatchStudioKey", js.FuncOf(dispatchStudioKey))
	select {}
}
