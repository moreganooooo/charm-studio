package astsync

import (
	"strings"
	"testing"
)

const sampleThemeAndLayoutGo = `package ui

import (
	"charm.land/bubbles/v2/list"
	"charm.land/bubbles/v2/table"
	tea "charm.land/bubbletea/v2"
	"charm.land/huh/v2"
	"charm.land/lipgloss/v2"
)

type Theme struct {
	Sidebar lipgloss.Style // @tui:style=sidebar
	Main    lipgloss.Style // @tui:style=main
	Badge   lipgloss.Style // @tui:style=badge
}

func NewTheme(isDark bool) Theme {
	ld := lipgloss.LightDark(isDark)
	// @tui:token=accent
	accent := ld(lipgloss.Color("#2e7de9"), lipgloss.Color("#7aa2f7"))
	// @tui:token=textMain
	textMain := ld(lipgloss.Color("#3760bf"), lipgloss.Color("#c0caf5"))

	return Theme{
		Sidebar: lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(accent).
			Foreground(textMain).
			Padding(1, 2, 1, 2),
		Main: lipgloss.NewStyle().
			Border(lipgloss.NormalBorder()).
			Foreground(textMain).
			Padding(0, 1, 0, 1),
		Badge: lipgloss.NewStyle().
			Foreground(statusColor(isDark)).
			Bold(true),
	}
}

func RenderApp(w, h int, st Theme) string {
	// @tui:id=sidebar
	sidebar := st.Sidebar.Width(max(0, 28-st.Sidebar.GetHorizontalMargins())).Height(max(0, h)).Render("")
	// @tui:id=mainPane
	mainPane := st.Main.Width(max(0, w-28)).Height(max(0, h)).Render("Hello")

	var body string
	if w < 70 {
		// @tui:id=body
		body = lipgloss.JoinHorizontal(lipgloss.Top, mainPane)
	} else {
		// @tui:id=body
		body = lipgloss.JoinHorizontal(lipgloss.Top, sidebar, mainPane)
	}
	// @tui:id=helpModal
	helpModal := st.Sidebar.Width(44).Height(8).Render("Modal")
	layers := []*lipgloss.Layer{
		lipgloss.NewLayer(body).X(0).Y(0).Z(0).ID("body"),
	}
	layers = append(layers, lipgloss.NewLayer(helpModal).X(max(0, (w-44)/2)).Y(max(0, (h-8)/2)).Z(10).ID("helpModal"))
	_ = layers
	return body
}

func buildWidgets() {
	// @tui:id=sidebar
	sidebarCols := []table.Column{{Title: "Name", Width: 12}}
	_ = sidebarCols
	// @tui:id=sidebar
	sidebarItems := []list.Item{{title: "Overview", desc: "Health"}}
	_ = list.New(sidebarItems, list.NewDefaultDelegate(), 20, 10)
	// @tui:id=formPane
	formPaneModel := huh.NewForm(huh.NewGroup(
		huh.NewInput().Title("Service").Placeholder("api"),
	))
	_ = formPaneModel
}

func sampleView() tea.View {
	var v tea.View
	v.AltScreen = true
	v.MouseMode = tea.MouseModeCellMotion
	v.WindowTitle = "Demo App"
	v.Cursor = tea.NewCursor(4, 2)
	return v
}
`

func TestParseGoSourceLayoutAndLocks(t *testing.T) {
	res := ParseGoSource(sampleThemeAndLayoutGo)
	if res.Error != "" {
		t.Fatalf("unexpected parse error: %s", res.Error)
	}
	if res.View == nil || !res.View.AltScreen || res.View.CursorMode != "manual" || res.View.CursorX != 4 || res.View.CursorY != 2 {
		t.Fatalf("unexpected view config: %+v", res.View)
	}
	if locks := res.LockedProps["badge"]; len(locks) != 1 || locks[0] != "fg" {
		t.Fatalf("expected dynamic fg lock on badge, got %v", locks)
	}
	if res.Root == nil || res.Root.ID != "body" || len(res.Root.Children) != 2 {
		t.Fatalf("expected body root with 2 children, got %+v", res.Root)
	}
	if res.Root.Children[0].Width.CollapseBelow != 70 {
		t.Fatalf("expected sidebar collapseBelow=70, got %d", res.Root.Children[0].Width.CollapseBelow)
	}
	if len(res.Overlays) != 1 || res.Overlays[0].ID != "helpModal" {
		t.Fatalf("expected helpModal overlay, got %+v", res.Overlays)
	}
}

func TestSyncGoSourcePreservesDynamicAndPatchesWidgets(t *testing.T) {
	doc := IRDoc{
		Tokens: map[string]TokenPair{
			"accent":   {Light: "#111111", Dark: "#eeeeee"},
			"textMain": {Light: "#222222", Dark: "#dddddd"},
		},
		Styles: map[string]IRStyle{
			"sidebar": {
				Border:      "thick",
				BorderEdges: &[4]bool{true, true, true, true},
				BorderColor: "$accent",
				Fg:          "$textMain",
				Padding:     [4]int{2, 3, 2, 3},
			},
			"badge": {
				Border: "none",
				Fg:     "$accent",
				Bold:   false,
			},
		},
		View: &ViewConfig{
			AltScreen:   false,
			MouseMode:   "all",
			WindowTitle: "Patched App",
			CursorMode:  "manual",
			CursorX:     10,
			CursorY:     5,
		},
		Root: IRNode{
			ID:   "body",
			Kind: "JoinHorizontal",
			Children: []IRNode{
				{
					ID:          "formPane",
					Kind:        "Box",
					ContentType: "huh:form",
					WidgetData: &IRWidgetData{
						HuhFields: []IRHuhField{
							{ID: "env", Kind: "select", Label: "Environment", Options: []string{"Prod", "Dev"}},
						},
					},
				},
			},
		},
	}

	syncRes := SyncGoSource(sampleThemeAndLayoutGo, doc)
	if syncRes.Error != "" {
		t.Fatalf("unexpected sync error: %s", syncRes.Error)
	}
	if !strings.Contains(syncRes.UpdatedGo, "lipgloss.ThickBorder()") {
		t.Fatalf("expected sidebar border patched to ThickBorder")
	}
	if !strings.Contains(syncRes.UpdatedGo, "Foreground(statusColor(isDark))") {
		t.Fatalf("expected dynamic Foreground on badge to be preserved")
	}
	if !strings.Contains(syncRes.UpdatedGo, "tea.NewCursor(10, 5)") {
		t.Fatalf("expected tea.View.Cursor patched to tea.NewCursor(10, 5)")
	}
	if !strings.Contains(syncRes.UpdatedGo, `huh.NewSelect[string]().Title("Environment")`) {
		t.Fatalf("expected huh form patched")
	}
	if locks := syncRes.LockedProps["badge"]; len(locks) != 1 || locks[0] != "fg" {
		t.Fatalf("expected lockedProps badge=[fg], got %v", syncRes.LockedProps)
	}
}

func TestComputeGoDiff(t *testing.T) {
	after := strings.ReplaceAll(sampleThemeAndLayoutGo, `WindowTitle = "Demo App"`, `WindowTitle = "Updated App"`)
	diff := ComputeGoDiff(sampleThemeAndLayoutGo, after)
	if diff.Added == 0 || diff.Removed == 0 {
		t.Fatalf("expected non-zero line diff counts, got +%d -%d", diff.Added, diff.Removed)
	}
	foundViewDelta := false
	for _, d := range diff.Deltas {
		if d.Category == "View" && strings.Contains(d.Detail, "Updated App") {
			foundViewDelta = true
		}
	}
	if !foundViewDelta {
		t.Fatalf("expected View AST delta, got %+v", diff.Deltas)
	}
}
