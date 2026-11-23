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
	if res.LockReasons["badge"] != "dynamic" || res.DynamicExprs["badge"]["fg"] != "statusColor(isDark)" {
		t.Fatalf("expected dynamic expression capture on badge.fg, got reason=%q exprs=%v", res.LockReasons["badge"], res.DynamicExprs["badge"])
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

func TestBlockLevelSyncDisableDoesNotLockFile(t *testing.T) {
	src := strings.Replace(sampleThemeAndLayoutGo, "Main: lipgloss.NewStyle()", "// @tui:sync-disable\n\t\tMain: lipgloss.NewStyle()", 1)
	res := ParseGoSource(src)
	if res.SyncDisabled {
		t.Fatalf("expected block-level @tui:sync-disable NOT to set file-level SyncDisabled")
	}
	if res.LockReasons["main"] != "sync-disabled" {
		t.Fatalf("expected main lockReason=sync-disabled, got %q", res.LockReasons["main"])
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

	// Explicitly override dynamic badge.fg with static token
	doc.OverriddenProps = map[string][]string{"badge": {"fg"}}
	overrideRes := SyncGoSource(sampleThemeAndLayoutGo, doc)
	if strings.Contains(overrideRes.UpdatedGo, "Foreground(statusColor(isDark))") {
		t.Fatalf("expected OverriddenProps to replace dynamic Foreground on badge")
	}
}

func TestComputeGoDiff(t *testing.T) {
	after := strings.ReplaceAll(sampleThemeAndLayoutGo, `WindowTitle = "Demo App"`, `WindowTitle = "Updated App"`)
	diff := ComputeGoDiff(sampleThemeAndLayoutGo, after)
	if diff.Added == 0 || diff.Removed == 0 {
		t.Fatalf("expected non-zero line diff counts, got +%d -%d", diff.Added, diff.Removed)
	}
	foundViewDelta := false
	foundLockedBucket := false
	for _, d := range diff.Deltas {
		if d.Category == "View" && d.Bucket == "view_flags" && strings.Contains(d.Detail, "Updated App") {
			foundViewDelta = true
		}
		if d.Bucket == "locked_untouched" {
			foundLockedBucket = true
		}
	}
	if !foundViewDelta {
		t.Fatalf("expected View AST delta with view_flags bucket, got %+v", diff.Deltas)
	}
	if !foundLockedBucket {
		t.Fatalf("expected locked_untouched bucket entries, got %+v", diff.Deltas)
	}
}

func TestHiddenBorderAndStrikethroughRoundTrip(t *testing.T) {
	src := `package ui
import "charm.land/lipgloss/v2"
var Sidebar = lipgloss.NewStyle().Border(lipgloss.HiddenBorder()).BorderLeft(false).Strikethrough(true)
`
	parsed := ParseGoSource(src)
	style := parsed.Styles["sidebar"]
	if parsed.Error != "" || style.Border != "hidden" || !style.Strikethrough ||
		style.BorderEdges == nil || style.BorderEdges[3] || len(parsed.LockedProps["sidebar"]) != 0 {
		t.Fatalf("unexpected imported sidebar: %+v (locks %v, error %s)", style, parsed.LockedProps["sidebar"], parsed.Error)
	}

	doc := IRDoc{Styles: map[string]IRStyle{"sidebar": style}}
	synced := SyncGoSource(src, doc)
	reparsed := ParseGoSource(synced.UpdatedGo)
	got := reparsed.Styles["sidebar"]
	if synced.Error != "" || reparsed.Error != "" || got.Border != "hidden" || !got.Strikethrough ||
		got.BorderEdges == nil || *got.BorderEdges != *style.BorderEdges {
		t.Fatalf("style changed after sync: %+v (sync %s, parse %s)", got, synced.Error, reparsed.Error)
	}

	style.Border = "none"
	style.Strikethrough = false
	doc.Styles["sidebar"] = style
	cleared := SyncGoSource(synced.UpdatedGo, doc)
	if cleared.Error != "" || strings.Contains(cleared.UpdatedGo, "HiddenBorder()") || strings.Contains(cleared.UpdatedGo, "Strikethrough(") {
		t.Fatalf("could not clear styles: %+v", cleared)
	}

	dynamic := strings.Replace(src, "Strikethrough(true)", "Strikethrough(isDone())", 1)
	preserved := SyncGoSource(dynamic, doc)
	if preserved.Error != "" || !strings.Contains(preserved.UpdatedGo, "Strikethrough(isDone())") ||
		!strings.Contains(strings.Join(preserved.LockedProps["sidebar"], ","), "strikethrough") {
		t.Fatalf("dynamic strikethrough was not preserved: %+v", preserved)
	}
}

func TestTextInputSettingsRoundTrip(t *testing.T) {
	const src = `package ui
import "charm.land/bubbles/v2/textinput"
func buildWidgets() {
	// @tui:id=search
	searchModel := textinput.New()
	searchModel.Prompt = "> "
	searchModel.Placeholder = "Search"
	searchModel.Focus()
}
func RenderApp(w, h int, st Theme) string {
	// @tui:id=search
	search := st.Panel.Width(w).Height(h).Render("")
	return search
}`
	limit, blank := 3, ""
	data := &IRWidgetData{InputPrompt: &blank, InputPlaceholder: &blank, InputEchoMode: "password", InputCharLimit: &limit}
	doc := IRDoc{Root: IRNode{ID: "search", Kind: "Box", ContentType: "bubble:textinput", WidgetData: data}}

	updated := SyncGoSource(src, doc)
	if updated.Error != "" {
		t.Fatal(updated.Error)
	}
	parsed := ParseGoSource(updated.UpdatedGo)
	if parsed.Error != "" || parsed.Root == nil || parsed.Root.WidgetData == nil {
		t.Fatalf("text input missing after import: %+v", parsed)
	}
	got := parsed.Root.WidgetData
	if got.InputEchoMode != "password" || got.InputCharLimit == nil || *got.InputCharLimit != limit ||
		got.InputPrompt == nil || *got.InputPrompt != "" || got.InputPlaceholder == nil || *got.InputPlaceholder != "" {
		t.Fatalf("settings changed on import: %+v", got)
	}
	limit = 0
	data.InputEchoMode = "none"
	again := SyncGoSource(updated.UpdatedGo, doc)
	if again.Error != "" || strings.Count(again.UpdatedGo, ".EchoMode =") != 1 ||
		!strings.Contains(again.UpdatedGo, "textinput.EchoNone") || !strings.Contains(again.UpdatedGo, ".CharLimit = 0") {
		t.Fatalf("settings did not update in place: %+v", again)
	}
	dynamic := strings.ReplaceAll(strings.ReplaceAll(again.UpdatedGo, "textinput.EchoNone", "userEcho()"), ".CharLimit = 0", ".CharLimit = userLimit()")
	preserved := SyncGoSource(dynamic, doc)
	if preserved.Error != "" || !strings.Contains(preserved.UpdatedGo, ".EchoMode = userEcho()") ||
		!strings.Contains(preserved.UpdatedGo, ".CharLimit = userLimit()") {
		t.Fatalf("dynamic text input settings were overwritten: %+v", preserved)
	}
}

func TestIndexedStyleColorsRoundTrip(t *testing.T) {
	const src = `package ui
import "charm.land/lipgloss/v2"
var Label = lipgloss.NewStyle().Border(lipgloss.NormalBorder()).BorderForeground(lipgloss.Color("0")).Foreground(lipgloss.Color("196")).Background(lipgloss.Color("255"))
`
	parsed := ParseGoSource(src)
	style := parsed.Styles["label"]
	if parsed.Error != "" || style.Fg != "196" || style.Bg != "255" || style.BorderColor != "0" || len(parsed.LockedProps["label"]) != 0 {
		t.Fatalf("unexpected indexed style: %+v (locks %v, error %s)", style, parsed.LockedProps, parsed.Error)
	}
	style.Fg = "15"
	doc := IRDoc{Styles: map[string]IRStyle{"label": style}}
	updated := SyncGoSource(src, doc)
	again := ParseGoSource(updated.UpdatedGo)
	if updated.Error != "" || again.Error != "" || again.Styles["label"].Fg != "15" || again.Styles["label"].Bg != "255" || again.Styles["label"].BorderColor != "0" || len(updated.LockedProps["label"]) != 0 {
		t.Fatalf("indexed style changed on sync: %+v", updated)
	}
	for _, arg := range []string{`"256"`, "lookupIndex()"} {
		expr := "lipgloss.Color(" + arg + ")"
		updated := SyncGoSource(strings.Replace(src, `lipgloss.Color("196")`, expr, 1), doc)
		if !strings.Contains(updated.UpdatedGo, "Foreground("+expr+")") || len(updated.LockedProps["label"]) != 1 {
			t.Fatalf("unexpected edit of unsupported color: %+v", updated)
		}
	}
}

func TestHuhNoteRoundTrip(t *testing.T) {
	const src = `package ui
import "charm.land/huh/v2"
func buildWidgets() {
	// @tui:id=formPane
	formPaneModel := huh.NewForm(huh.NewGroup(huh.NewInput().Title("Name"), huh.NewNote().Title("Before continuing").Description("First line\nSecond line"), huh.NewConfirm().Title("Proceed?")))
	_ = formPaneModel
}
func RenderApp(w, h int, st Theme) string {
	// @tui:id=formPane
	formPane := st.Main.Width(w).Height(h).Render("")
	return formPane
}`
	parsed := ParseGoSource(src)
	if parsed.Root == nil || parsed.Root.WidgetData == nil || len(parsed.Root.WidgetData.HuhFields) != 3 {
		t.Fatalf("missing form: %+v", parsed)
	}
	fields := parsed.Root.WidgetData.HuhFields
	if fields[0].Kind != "input" || fields[1].Kind != "note" || fields[1].Label != "Before continuing" || fields[1].Description != "First line\nSecond line" || fields[2].Kind != "confirm" {
		t.Fatalf("incorrect field data: %+v", fields)
	}
	fields[1].Description = "Check the \"Name\" field."
	updated := SyncGoSource(src, IRDoc{Root: *parsed.Root})
	again := ParseGoSource(updated.UpdatedGo)
	if updated.Error != "" || again.Root == nil || again.Root.WidgetData == nil || len(again.Root.WidgetData.HuhFields) != 3 || again.Root.WidgetData.HuhFields[1].Description != fields[1].Description {
		t.Fatalf("note changed on sync: %+v", updated)
	}
}
