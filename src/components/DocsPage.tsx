import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Copy, Search } from "lucide-react";
import { useRouter } from "../router";
import "./SecondaryPages.css";
import { SiteNavBar } from "./SiteNavBar";
import { CHARM_TOKENS, studioStyles } from "./studioStyles";

interface DocSection {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  bullets: string[];
  codeTitle?: string;
  code?: string;
}

const DOC_SECTIONS: DocSection[] = [
  {
    id: "charm-v2",
    title: "Charm v2 Primitives & Imports",
    kicker: "MODULE PATHS & RUNTIME",
    summary:
      "Charm Studio targets Go 1.26+ and Charm v2 module paths exclusively so exported Go projects compile cleanly with current Bubble Tea, Lip Gloss, Bubbles, and Huh releases.",
    bullets: [
      "Import charm.land/bubbletea/v2, charm.land/lipgloss/v2, charm.land/bubbles/v2, and charm.land/huh/v2.",
      "Model.Init() issues tea.RequestBackgroundColor so adaptive themes detect terminal polarity automatically.",
      "Update(msg tea.Msg) handles tea.WindowSizeMsg, tea.BackgroundColorMsg, and tea.KeyPressMsg (replaces v1 tea.KeyMsg).",
      "View() returns a tea.View struct configuring AltScreen, MouseMode, WindowTitle, ReportFocus, and DisableBracketedPasteMode.",
      "Sizing setters on Bubbles v2 widgets use SetWidth(w) and SetHeight(h) instead of v1 exported fields.",
    ],
    codeTitle: "update.go / view.go",
    code: `func (m model) View() tea.View {
	v := tea.NewView(ui.RenderApp(m.theme, m.width, m.height))
	v.AltScreen = true
	v.MouseMode = tea.MouseModeCellMotion
	v.WindowTitle = "Charm Studio App"
	return v
}`,
  },
  {
    id: "codegen-layout",
    title: "Modular Multi-File Go Codegen",
    kicker: "GENERATED ARCHITECTURE",
    summary:
      "Exports avoid monolithic single-file Go dumps. Theme tokens, declarative layout joins, Elm architecture wiring, and preview fixtures live in dedicated files you can edit safely.",
    bullets: [
      "ui/theme_gen.go — Adaptive lipgloss.LightDark(hasDarkBG) color resolvers and named Lip Gloss styles.",
      "ui/layout_gen.go — Responsive JoinHorizontal / JoinVertical composition with CollapseBelow breakpoints.",
      "model.go, update.go, view.go, main.go — Idiomatic Bubble Tea v2 entrypoint and key/resize dispatch.",
      "fixtures_preview_gen.go — Tagged //go:build charmstudio_preview for sandbox preview data without polluting production builds.",
      "demo.tape & gum.sh — Ready-to-run VHS terminal recording tape and Gum shell prompt pipeline.",
    ],
    codeTitle: "ui/theme_gen.go",
    code: `func NewTheme(hasDarkBG bool) Theme {
	ld := lipgloss.LightDark(hasDarkBG)
	accent := ld(lipgloss.Color("#2e7de9"), lipgloss.Color("#ff5eae"))
	return Theme{
		Sidebar: lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(accent).
			Padding(0, 1),
	}
}`,
  },
  {
    id: "dst-sync",
    title: "3-Tier dave/dst Round-Trip Sync",
    kicker: "LOSSLESS AST PATCHING",
    summary:
      "Using dave/dst inside studio.wasm and the native desktop host, Charm Studio parses and surgically updates Go AST nodes while preserving comments, formatting, and custom Update() logic.",
    bullets: [
      "Tier 1 (// @tui:id=<nodeId>): Links a Go style declaration or layout call directly to its visual pane on the canvas.",
      "Tier 2 (// @tui:sync-lock or // @tui:sync-lock=Padding,Border): Freezes an entire style or specific properties from studio overwrites.",
      "Tier 3 (// @tui:sync-disable): Instructs Charm Studio to skip modifying the file completely during round-trip patching.",
    ],
    codeTitle: "ui/theme_gen.go (with @tui directives)",
    code: `// @tui:id=sidebar
// @tui:sync-lock=Margin
SidebarStyle := lipgloss.NewStyle().
	Border(lipgloss.RoundedBorder()).
	Padding(0, 1).
	MarginRight(1)`,
  },
  {
    id: "sizing-breakpoints",
    title: "Sizing Modes & Matrix Breakpoints",
    kicker: "RESPONSIVE TERMINAL CELL MATH",
    summary:
      "Every terminal cell counts. Charm Studio pairs Fixed, Fit, and weighted Fill sizing with live 3-size Matrix overflow checks (58×18, 80×24, 116×30).",
    bullets: [
      "Fixed: Reserves an exact number of columns or rows (e.g. a 30-col navigation rail or 1-row status footer).",
      "Fit: Shrinks tightly around inner widget content.",
      "Fill (Weight): Flex-distributes remaining cells cleanly across sibling panes.",
      "Collapse Below (<cols): Automatically hides secondary panes in ui/layout_gen.go below a column threshold.",
    ],
  },
];

const V1_SNIPPET = `// Charm v1 (Deprecated)
import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

var accent = lipgloss.AdaptiveColor{Light: "#2e7de9", Dark: "#ff5eae"}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if msg.String() == "q" { return m, tea.Quit }
	}
	return m, nil
}

func (m model) View() string {
	return ui.RenderApp(m.width, m.height)
}`;

const V2_SNIPPET = `// Charm v2 (Charm Studio Standard)
import (
	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

func (m model) Init() tea.Cmd { return tea.RequestBackgroundColor }

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.BackgroundColorMsg:
		m.theme = ui.NewTheme(msg.IsDark())
	case tea.KeyPressMsg:
		if msg.String() == "q" { return m, tea.Quit }
	}
	return m, nil
}

func (m model) View() tea.View {
	v := tea.NewView(ui.RenderApp(m.theme, m.width, m.height))
	v.AltScreen = true
	return v
}`;

const ECOSYSTEM_REF = [
  { name: "Lip Gloss v2", pkg: "charm.land/lipgloss/v2", role: "Borders, padding, margins, LightDark tokens, JoinHorizontal/JoinVertical, NewLayer overlays." },
  { name: "Bubbles v2", pkg: "charm.land/bubbles/v2", role: "Stateful List, Table, Viewport, TextInput, and Paginator widgets interactive inside WASM." },
  { name: "Bubble Tea v2", pkg: "charm.land/bubbletea/v2", role: "Model/Update/View runtime with tea.KeyPressMsg, tea.View, and BackgroundColorMsg." },
  { name: "Huh v2", pkg: "charm.land/huh/v2", role: "Interactive terminal forms, selects, and confirmations embeddable inside TUI panes." },
  { name: "Glamour", pkg: "github.com/charmbracelet/glamour", role: "Stylesheet-driven Markdown rendering for docs, READMEs, and AI output." },
  { name: "Gum", pkg: "github.com/charmbracelet/gum", role: "Shell-script Choose & Confirm prompts exported as runnable gum.sh." },
  { name: "Wish & VHS", pkg: "github.com/charmbracelet/wish", role: "Hosted SSH TUI middleware (main.go) and reproducible .tape terminal recordings." },
];

export function DocsPage() {
  const { navigate } = useRouter();
  const [contentsOpen, setContentsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("");
  const article = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [snippetMode, setSnippetMode] = useState<"v2" | "v1">("v2");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DOC_SECTIONS;
    return DOC_SECTIONS.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.bullets.some((b) => b.toLowerCase().includes(q)) ||
        (s.code ?? "").toLowerCase().includes(q)
    );
  }, [query]);

  const filteredEcosystem = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ECOSYSTEM_REF;
    return ECOSYSTEM_REF.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.pkg.toLowerCase().includes(q) ||
        item.role.toLowerCase().includes(q)
    );
  }, [query]);

  useEffect(() => {
    const sections = Array.from(article.current?.querySelectorAll("section[id]") ?? []);
    let frame = 0;
    const update = () => {
      const readingLine = (document.querySelector(".site-nav")?.getBoundingClientRect().bottom ?? 0) + 32;
      let current = sections[0];
      for (const section of sections) {
        if (section.getBoundingClientRect().top > readingLine) break;
        current = section;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1) {
        current = sections[sections.length - 1];
      }
      setActiveSection(current?.id ?? "");
      frame = 0;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [filteredSections, contentsOpen]);

  return (
    <div className="secondary-page">
      <SiteNavBar />

      <main className="secondary-content docs-layout">
        <header className="secondary-header">
          <div>
            <div className="cs-mono secondary-kicker">
              <span className="cs-wordmark-ink">CHARM STUDIO</span> REFERENCE
            </div>
            <h1>
              Charm v2 Codegen, Sync &amp; Layout Guide
            </h1>
            <p>
              Everything you need to export idiomatic <code className="cs-mono">charm.land/*/v2</code> Go applications and keep hand-written Go files synced with <code className="cs-mono">dave/dst</code>.
            </p>
          </div>
        </header>

        <aside className="docs-contents"
          style={{
            background: CHARM_TOKENS.bgSurface,
            border: `1px solid ${CHARM_TOKENS.border}`,
            borderRadius: 14,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <button type="button" className="docs-contents-toggle" aria-expanded={contentsOpen}
            aria-controls="docs-contents-panel" onClick={() => setContentsOpen(!contentsOpen)}>
            <BookOpen size={14} /> On this page <ChevronDown size={14} />
          </button>
          <div id="docs-contents-panel" className="docs-contents-panel" data-open={contentsOpen}>
            <div className="docs-contents-title">
              <BookOpen size={14} style={{ color: CHARM_TOKENS.pink }} />
              <span>Documentation</span>
            </div>

            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: 9, color: CHARM_TOKENS.textDim }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search docs"
                placeholder="Search docs…"
                style={{
                  width: "100%",
                  padding: "6px 8px 6px 28px",
                  borderRadius: 7,
                  background: "var(--cs-input)",
                  border: `1px solid ${CHARM_TOKENS.border}`,
                  color: CHARM_TOKENS.text,
                  fontSize: 12,
                }}
              />
            </div>

            <nav aria-label="Docs sections" style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[...filteredSections, { id: "v1-vs-v2", title: "v1 vs. v2 Migration" },
                { id: "ecosystem", title: "Charm Ecosystem" }].map((section) => (
                <a key={section.id} href={`#${section.id}`}
                  aria-current={activeSection === section.id ? "location" : undefined}
                  onClick={() => setContentsOpen(false)}>
                  {section.title}
                </a>
              ))}
            </nav>

            <button onClick={() => navigate("/studio")} style={{ ...studioStyles.primaryCta, justifyContent: "center", marginTop: 4 }}>
              <span>Open Studio</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </aside>

        {/* Main Content Column */}
        <div ref={article} style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
          {filteredSections.map((sec) => (
            <section
              key={sec.id}
              id={sec.id}
              className="secondary-card"
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div>
                <div className="cs-mono" style={{ fontSize: 10.5, fontWeight: 700, color: CHARM_TOKENS.lilac, letterSpacing: "0.06em" }}>
                  {sec.kicker}
                </div>
                <h2 style={{ margin: "4px 0 6px", fontSize: 18, fontWeight: 800, color: CHARM_TOKENS.textHeading }}>
                  {sec.title}
                </h2>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: CHARM_TOKENS.textMuted }}>
                  {sec.summary}
                </p>
              </div>

              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.65, color: CHARM_TOKENS.textBody }}>
                {sec.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>

              {sec.code && (
                <div
                  style={{
                    borderRadius: 10,
                    background: CHARM_TOKENS.bgCode,
                    border: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "6px 12px",
                      borderBottom: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                    }}
                  >
                    <span className="cs-mono" style={{ fontSize: 11.5, color: CHARM_TOKENS.textMuted }}>
                      {sec.codeTitle}
                    </span>
                    <button
                      onClick={() => void copyText(sec.id, sec.code!)}
                      style={{ ...studioStyles.secondaryBtn, padding: "3px 8px", fontSize: 11 }}
                    >
                      {copiedId === sec.id ? <Check size={12} style={{ color: CHARM_TOKENS.mint }} /> : <Copy size={12} />}
                      <span>{copiedId === sec.id ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <pre className="cs-mono" style={{ margin: 0, padding: 12, fontSize: 12, lineHeight: 1.55, color: CHARM_TOKENS.text, overflowX: "auto" }}>
                    {sec.code}
                  </pre>
                </div>
              )}
            </section>
          ))}

          {/* Interactive v1 vs v2 Comparison Switcher */}
          <section
            id="v1-vs-v2"
            className="secondary-card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div className="cs-mono" style={{ fontSize: 10.5, fontWeight: 700, color: CHARM_TOKENS.pinkSoft, letterSpacing: "0.06em" }}>
                  INTERACTIVE MIGRATION GUIDE
                </div>
                <h2 style={{ margin: "4px 0 0", fontSize: 18, fontWeight: 800, color: CHARM_TOKENS.textHeading }}>
                  v1 (Deprecated) vs. v2 (Charm Studio)
                </h2>
              </div>

              <div
                style={{
                  display: "inline-flex",
                  background: "var(--cs-input)",
                  border: `1px solid ${CHARM_TOKENS.border}`,
                  borderRadius: 8,
                  padding: 3,
                  gap: 3,
                }}
              >
                <button
                  onClick={() => setSnippetMode("v2")}
                  style={{
                    border: "none",
                    borderRadius: 6,
                    padding: "5px 11px",
                    fontSize: 12,
                    fontWeight: 700,
                    background: snippetMode === "v2" ? CHARM_TOKENS.mintBg : "transparent",
                    color: snippetMode === "v2" ? CHARM_TOKENS.mintText : CHARM_TOKENS.textMuted,
                  }}
                >
                  v2 (Charm Studio)
                </button>
                <button
                  onClick={() => setSnippetMode("v1")}
                  style={{
                    border: "none",
                    borderRadius: 6,
                    padding: "5px 11px",
                    fontSize: 12,
                    fontWeight: 700,
                    background: snippetMode === "v1" ? CHARM_TOKENS.pinkBg : "transparent",
                    color: snippetMode === "v1" ? CHARM_TOKENS.pinkSoft : CHARM_TOKENS.textMuted,
                  }}
                >
                  v1 (Deprecated)
                </button>
              </div>
            </div>

            <div className="secondary-preview">
              <div
                style={{
                  borderRadius: 10,
                  background: CHARM_TOKENS.bgCode,
                  border: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "7px 12px",
                    borderBottom: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                  }}
                >
                  <span className="cs-mono" style={{ fontSize: 11.5, color: snippetMode === "v2" ? CHARM_TOKENS.mintText : CHARM_TOKENS.pinkSoft }}>
                    {snippetMode === "v2" ? "charm.land/*/v2 · View() tea.View · LightDark" : "github.com/charmbracelet/* · View() string · KeyMsg"}
                  </span>
                  <button
                    onClick={() => void copyText("v1v2", snippetMode === "v2" ? V2_SNIPPET : V1_SNIPPET)}
                    style={{ ...studioStyles.secondaryBtn, padding: "3px 8px", fontSize: 11 }}
                  >
                    {copiedId === "v1v2" ? <Check size={12} style={{ color: CHARM_TOKENS.mint }} /> : <Copy size={12} />}
                    <span>{copiedId === "v1v2" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="cs-mono" style={{ margin: 0, padding: 14, fontSize: 12, lineHeight: 1.55, color: CHARM_TOKENS.text, overflowX: "auto" }}>
                  {snippetMode === "v2" ? V2_SNIPPET : V1_SNIPPET}
                </pre>
              </div>
            </div>
          </section>

          {/* Charm Ecosystem Quick Reference */}
          <section
            id="ecosystem"
            className="secondary-card"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: CHARM_TOKENS.textHeading }}>
              Charmbracelet Libraries in Studio
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 12 }}>
              {filteredEcosystem.map((item) => (
                <div
                  key={item.name}
                  style={{
                    padding: 12,
                    borderRadius: 10,
                    background: "var(--cs-input)",
                    border: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 5,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>{item.name}</div>
                  <code className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.lilac }}>{item.pkg}</code>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: CHARM_TOKENS.textMuted }}>{item.role}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
