package mcp

import (
	"fmt"
	"strings"
)

type CharmV2Rule struct {
	ID       string `json:"id"`
	Category string `json:"category"`
	Title    string `json:"title"`
	AvoidV1  string `json:"avoidV1"`
	UseV2    string `json:"useV2"`
	Notes    string `json:"notes"`
}

func AllCharmV2Rules() []CharmV2Rule {
	return []CharmV2Rule{
		{
			ID:       "v2-imports",
			Category: "imports",
			Title:    "Use charm.land/*/v2 canonical vanity import paths",
			AvoidV1:  `"github.com/charmbracelet/bubbletea"`,
			UseV2:    `tea "charm.land/bubbletea/v2"`,
			Notes:    "Also use charm.land/lipgloss/v2, charm.land/bubbles/v2/*, charm.land/huh/v2, and charm.land/glamour/v2.",
		},
		{
			ID:       "v2-view-struct",
			Category: "view",
			Title:    "Return tea.View from View() instead of string and program options",
			AvoidV1:  "func (m model) View() string { ... } // with tea.WithAltScreen()",
			UseV2:    "func (m model) View() tea.View { v := tea.NewView(content); v.AltScreen = true; v.MouseMode = tea.MouseModeCellMotion; return v }",
			Notes:    "Configure AltScreen, MouseMode, WindowTitle, ReportFocus, DisableBracketedPasteMode, and Cursor directly on tea.View.",
		},
		{
			ID:       "v2-keypress-msg",
			Category: "messages",
			Title:    "Handle tea.KeyPressMsg instead of tea.KeyMsg",
			AvoidV1:  "case tea.KeyMsg:",
			UseV2:    `case tea.KeyPressMsg: switch msg.String() { case "tab": ... case "shift+tab": ... }`,
			Notes:    "In Bubble Tea v2, key press events are tea.KeyPressMsg; release events are tea.KeyReleaseMsg.",
		},
		{
			ID:       "v2-background-polarity",
			Category: "colors",
			Title:    "Query terminal polarity via tea.RequestBackgroundColor and lipgloss.LightDark",
			AvoidV1:  `lipgloss.AdaptiveColor{Light: "#2e7de9", Dark: "#7aa2f7"}`,
			UseV2:    `ld := lipgloss.LightDark(hasDarkBG); ld(lipgloss.Color("#2e7de9"), lipgloss.Color("#7aa2f7"))`,
			Notes:    "Emit tea.RequestBackgroundColor from Init() and handle tea.BackgroundColorMsg{}.IsDark() in Update().",
		},
		{
			ID:       "v2-bubbles-sizing",
			Category: "bubbles",
			Title:    "Use SetWidth/SetHeight and functional options on Bubbles v2 widgets",
			AvoidV1:  "vp := viewport.New(w, h); vp.Width = w",
			UseV2:    "vp := viewport.New(viewport.WithWidth(w), viewport.WithHeight(h)); vp.SetWidth(w); vp.SetHeight(h)",
			Notes:    "textinput v2 uses SetVirtualCursor(true) and m.input.Cursor() or v.Cursor for terminal cursor positioning.",
		},
		{
			ID:       "v2-studio-annotations",
			Category: "annotations",
			Title:    "Preserve Charm Studio // @tui:* AST sync annotations",
			AvoidV1:  "Untagged inline style literals inside View()",
			UseV2:    "// @tui:id=<nodeID>, // @tui:style=<styleKey>, // @tui:token=<tokenKey>, // @tui:block-disable",
			Notes:    "Charm Studio's dave/dst engine uses these comments to surgically patch styles and widget options without touching Update() logic.",
		},
	}
}

func FilterCharmV2Rules(category string) []CharmV2Rule {
	cat := strings.TrimSpace(strings.ToLower(category))
	all := AllCharmV2Rules()
	if cat == "" || cat == "all" {
		return all
	}
	var out []CharmV2Rule
	for _, r := range all {
		if strings.EqualFold(r.Category, cat) {
			out = append(out, r)
		}
	}
	return out
}

func RenderRulesMarkdown() string {
	var b strings.Builder
	b.WriteString("# Charmbracelet v2 API & Codegen Rules (Charm Studio)\n\n")
	b.WriteString("Always target Go 1.26+ and Charmbracelet v2 APIs when creating or editing TUI files:\n\n")
	for _, r := range AllCharmV2Rules() {
		fmt.Fprintf(&b, "## %s (`%s`)\n", r.Title, r.Category)
		fmt.Fprintf(&b, "- **Avoid (v1):** `%s`\n", r.AvoidV1)
		fmt.Fprintf(&b, "- **Use (v2):** `%s`\n", r.UseV2)
		fmt.Fprintf(&b, "- **Notes:** %s\n\n", r.Notes)
	}
	return b.String()
}
