import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, ChevronDown, ChevronRight, Compass, GitBranch, HelpCircle, Plus, RotateCcw, Sparkles, X } from "lucide-react";

type GuideSection = "start" | "libraries" | "github" | "faq";

interface Props {
  open: boolean;
  initialSection?: GuideSection;
  checklistDismissed: boolean;
  onClose: () => void;
  onRestoreChecklist: () => void;
  onOpenWidgetPicker: () => void;
  onOpenGitHubImport: () => void;
  onOpenProjects: () => void;
}

const LIBRARIES: {
  name: string;
  color: string;
  tagline: string;
  desc: string;
  example: string;
}[] = [
  {
    name: "Lip Gloss",
    color: "var(--cs-pink)",
    tagline: "Styling, Borders, Padding & Layout Joins",
    desc: "Think of Lip Gloss like CSS Flexbox for the terminal. Every box in Charm Studio uses real Lip Gloss rules for rounded/double borders, padding, margins, alignment, and JoinHorizontal/JoinVertical splits.",
    example: "Sidebar cards, headers, status footers, floating modal overlays",
  },
  {
    name: "Bubbles",
    color: "var(--cs-mint)",
    tagline: "Interactive Lists, Tables, Viewports & Text Inputs",
    desc: "Ready-to-use interactive UI widgets from charmbracelet/bubbles. Click any Bubbles pane inside the terminal preview and type or press ↑/↓, j/k, or / to drive real Go widget state.",
    example: "Searchable file lists, data tables, scrollable docs, prompt inputs",
  },
  {
    name: "Huh",
    color: "var(--cs-lavender)",
    tagline: "Interactive CLI Forms, Selects & Prompts",
    desc: "Build friendly terminal forms with inputs, selects, and Yes/No confirmations. Click a Huh pane in the preview and press Tab, ←/→, or Enter to test the flow live.",
    example: "Project scaffolding wizards, settings forms, onboarding prompts",
  },
  {
    name: "Glamour & Glow",
    color: "var(--cs-pink-soft)",
    tagline: "Rich Styled Markdown Rendering",
    desc: "Renders headings, bullet lists, blockquotes, and code blocks with terminal syntax colors right inside a pane. Edit the Markdown source directly in the Inspector.",
    example: "In-app docs, README viewers, release notes, AI response panes",
  },
  {
    name: "Gum",
    color: "#d97706",
    tagline: "Glamorous Shell Scripts & Quick Prompts",
    desc: "Preview Choose filters and Confirm dialogs visually, then grab an instant gum.sh shell script from the Go Code tab for Bash/Zsh automation.",
    example: "Deployment scripts, CLI menus, interactive confirmation steps",
  },
  {
    name: "Wish & VHS",
    color: "#2563eb",
    tagline: "SSH TUI Apps & Terminal Demo Recordings",
    desc: "Add Wish SSH session headers to generate a runnable Wish SSH server in main.go, or copy a demo.tape script for VHS to record crisp terminal GIFs.",
    example: "Hosted SSH portfolios, self-recording README demos",
  },
];

const FAQ_ITEMS: { q: string; a: string; category: string }[] = [
  {
    category: "Basics",
    q: "What is Charm Studio, and is the terminal preview fake?",
    a: "It's real compiled Go running inside your browser via WebAssembly (studio.wasm). Borders, wrapping, padding, margins, and interactive Bubbles keystrokes are calculated by real Go Lip Gloss & Bubbles code—not CSS approximations.",
  },
  {
    category: "Editing",
    q: "How do I add, reorder, or customize widgets without writing Go code?",
    a: "Click + Add Component in the toolbar or Layout Tree, drag handles in the tree to reorder/reparent panes, double-click text panes directly on the terminal to edit inline, or select any Bubbles List, Table, TextInput, or Huh Form to edit its rows and columns visually in the Inspector.",
  },
  {
    category: "Workspace",
    q: "What is the difference between Studio and Pro mode?",
    a: "Studio mode starts with one spacious interactive terminal, clean borders, and 1-click Style Presets. Pro mode unlocks the 3× responsive Matrix, Margin/Padding DevTools overlays, custom $Token creation, partial border edge toggles, and raw ir.json inspection.",
  },
  {
    category: "GitHub & Sync",
    q: "I signed in with GitHub and came right back to this page—what does logging in actually do?",
    a: "GitHub Sign-In unlocks two things: (1) Cloud Project Sync inside Projects so your designs save across browsers and can be shared via public links, and (2) automatic access to your GitHub repositories inside Import / GitHub → 2. GitHub Repos so you can scan and pull existing .go Lip Gloss styles into the sandbox.",
  },
  {
    category: "Layout & Sizing",
    q: "What is the difference between Fixed, Fill, Fit, and Width Weight?",
    a: "Fixed sets an exact number of terminal columns/rows (e.g. a 28-col sidebar). Fit shrinks tightly around the box's text. Fill stretches to claim remaining space—and Width Weight acts like CSS flex-grow (e.g. weight 2 gets twice as much extra width as weight 1).",
  },
  {
    category: "Layout & Sizing",
    q: "What does Responsive Breakpoint — Collapse Below (<cols) mean?",
    a: "Terminal windows get resized all the time! Setting Collapse Below to 70 tells RenderApp() in layout.go to automatically hide that pane when the terminal is narrower than 70 columns (you can watch this happen live in Pro Mode → Matrix 3× Sizes).",
  },
  {
    category: "Styling",
    q: "What is Fork Style, and what are Adaptive Tokens ($accent)?",
    a: "Multiple boxes can share one Lip Gloss style name (like 'card'). Clicking Fork Style creates a brand-new copy for just the selected box so tweaking it won't change siblings. Adaptive Tokens ($accent, $borderIdle, etc.) store both a Light and Dark hex color using lipgloss.LightDark so your TUI looks great on both light and dark terminals.",
  },
  {
    category: "Scope & Code",
    q: "What parts of a Go TUI does Charm Studio manage vs. my own Go code?",
    a: "Charm Studio is a layout, Lip Gloss v2 style, Bubbles/Huh composition, and terminal-constraint workbench. Generated theme/layout files and //go:build preview fixtures stay separate from your hand-written Update(tea.Msg) state machines, tea.Cmd I/O, keybindings, and business logic. Any declaration marked // @tui:sync-disable or dynamic Go expression is preserved read-only.",
  },
  {
    category: "Exporting",
    q: "How do I run the exported Go code on my own machine?",
    a: "Open the Go Code tab on the right, set your module path (e.g. github.com/you/my-tui), and click Download Runnable Go Project (.zip). Unzip the folder and run `go mod tidy && go run .` — main.go already wires your Bubbles, Huh forms, Wish SSH server, and layouts cleanly.",
  },
];

export function GuideFaqModal({
  open,
  initialSection = "start",
  checklistDismissed,
  onClose,
  onRestoreChecklist,
  onOpenWidgetPicker,
  onOpenGitHubImport,
  onOpenProjects,
}: Props) {
  const [section, setSection] = useState<GuideSection>(initialSection);
  const [faqQuery, setFaqQuery] = useState("");
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  const filteredFaq = useMemo(() => {
    const q = faqQuery.trim().toLowerCase();
    if (!q) return FAQ_ITEMS;
    return FAQ_ITEMS.filter(
      (item) =>
        item.q.toLowerCase().includes(q) ||
        item.a.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
    );
  }, [faqQuery]);

  if (!open) return null;

  const navItems: { id: GuideSection; label: string; icon: ReactNode; desc: string }[] = [
    { id: "start", label: "Getting Started", icon: <Compass size={14} />, desc: "How the studio works & shortcuts" },
    { id: "libraries", label: "Charm Libraries", icon: <BookOpen size={14} />, desc: "Lip Gloss, Bubbles, Huh & more" },
    { id: "github", label: "GitHub & Cloud Sync", icon: <GitBranch size={14} />, desc: "Import repos & save to cloud" },
    { id: "faq", label: "FAQ & Glossary", icon: <HelpCircle size={14} />, desc: "Common questions & terms" },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 115,
        background: "var(--cs-backdrop)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1040px, 95vw)",
          height: "min(86vh, 820px)",
          background: "var(--cs-surface)",
          border: "1px solid var(--cs-border-strong)",
          borderRadius: 16,
          boxShadow: "var(--cs-shadow)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Page Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--cs-border)",
            background: "var(--cs-pill-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Sparkles size={18} style={{ color: "var(--cs-pink)" }} />
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--cs-text-strong)" }}>
                <span className="cs-wordmark-ink">Charm Studio</span> Guide, Help &amp; FAQ
              </h2>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--cs-text-muted)", marginTop: 3 }}>
              Plain-English walkthroughs for designing, testing, and exporting Go terminal apps.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {checklistDismissed && (
              <button
                onClick={() => {
                  onRestoreChecklist();
                  onClose();
                }}
                style={{ ...accentBtn, display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <RotateCcw size={13} />
                <span>Show Quick-Start Checklist</span>
              </button>
            )}
            <button onClick={onClose} style={{ ...closeBtn, display: "inline-flex", alignItems: "center", gap: 5 }}>
              <X size={14} />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* 2-Column Page Body */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "240px 1fr", minHeight: 0 }}>
          {/* Left Nav */}
          <nav
            style={{
              borderRight: "1px solid var(--cs-border)",
              background: "var(--cs-nav-bg)",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {navItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  style={{
                    textAlign: "left",
                    padding: "11px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: active ? "var(--cs-pink-bg)" : "transparent",
                    border: `1px solid ${active ? "var(--cs-pink-border)" : "transparent"}`,
                    color: active ? "var(--cs-text-strong)" : "var(--cs-text-muted)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: active ? "var(--cs-pink)" : "var(--cs-text-dim)", display: "inline-flex", alignItems: "center" }}>{item.icon}</span>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 11, color: active ? "var(--cs-text-body)" : "var(--cs-text-dim)", paddingLeft: 22 }}>
                    {item.desc}
                  </div>
                </button>
              );
            })}

            <div style={{ marginTop: "auto", padding: 12, borderRadius: 10, background: "var(--cs-card)", border: "1px solid var(--cs-border)", fontSize: 11.5, color: "var(--cs-text-muted)", lineHeight: 1.5 }}>
              <b style={{ color: "var(--cs-mint)" }}>Tip:</b> Hover over any button, badge, or <span style={helpBadge}>?</span> icon in the workspace for instant plain-English tooltips.
            </div>
          </nav>

          {/* Right Content Pane */}
          <div style={{ padding: "24px 28px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
            {section === "start" && (
              <>
                <div>
                  <h3 style={secTitle}>How Charm Studio Works</h3>
                  <p style={para}>
                    Charm Studio is a TUI layout, Lip Gloss v2 style, Bubbles/Huh composition, and terminal-constraint workbench backed by real compiled Go (<code style={codeChip}>lipgloss/v2</code> + <code style={codeChip}>bubbles/v2</code>) in the browser—leaving your state transitions, <code style={codeChip}>tea.Cmd</code> async I/O, keybindings, and domain logic safely in Go.
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
                  {[
                  {
                      step: "01",
                      title: "Pick a Template or Import",
                      body: "Start from a ready-made layout in the Template dropdown, or pull .go files from GitHub via Import / GitHub.",
                    },
                    {
                      step: "02",
                      title: "Build in the Layout Tree",
                      body: "Click + Add Component to drop in Charm widgets visually, or use Split R / Split B to arrange rows and stacks.",
                    },
                    {
                      step: "03",
                      title: "Poke & Inspect Live",
                      body: "Click directly inside a terminal pane to focus it and type or press ↑/↓. Tweak borders, padding, and breakpoints on the right.",
                    },
                    {
                      step: "04",
                      title: "Walk Away with Go Code",
                      body: "Switch the right sidebar to Go Code to copy idiomatic styles.go, layout.go, runnable main.go, VHS tapes, or Gum scripts.",
                    },
                  ].map((card) => (
                    <div key={card.step} style={infoCard}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--cs-mint)", letterSpacing: 1 }}>
                        STEP {card.step}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--cs-text-strong)", margin: "4px 0 6px" }}>
                        {card.title}
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--cs-text-muted)", lineHeight: 1.5 }}>{card.body}</div>
                    </div>
                  ))}
                </div>

                <div style={infoCard}>
                  <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "var(--cs-text-heading)" }}>Keyboard Shortcuts &amp; Live Terminal Controls</h4>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 10, fontSize: 12.5, color: "var(--cs-text-body)" }}>
                    <div><code style={codeChip}>Cmd/Ctrl + Z</code> — Undo layout/style edit</div>
                    <div><code style={codeChip}>Cmd/Ctrl + Shift + Z</code> — Redo edit</div>
                    <div><code style={codeChip}>↑ / ↓</code> or <code style={codeChip}>j / k</code> — Drive Lists, Tables, Viewports</div>
                    <div><code style={codeChip}>Tab</code> / <code style={codeChip}>← / →</code> — Navigate Huh forms &amp; Confirm prompts</div>
                    <div><code style={codeChip}>/</code> — Filter inside Bubbles Lists</div>
                    <div><code style={codeChip}>⌟ Corner Grip</code> — Drag in Single Viewport to resize</div>
                  </div>
                </div>
              </>
            )}

            {section === "libraries" && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <h3 style={secTitle}>Charmbracelet Ecosystem in Charm Studio</h3>
                    <p style={{ ...para, marginBottom: 0 }}>
                      Each library in the hero pill adds real capabilities to your terminal layout. Add any of them visually without touching code.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenWidgetPicker();
                    }}
                    style={{ ...accentBtn, display: "inline-flex", alignItems: "center", gap: 6 }}
                  >
                    <Plus size={14} />
                    <span>Open Component Picker</span>
                    <ArrowRight size={13} />
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                  {LIBRARIES.map((lib) => (
                    <div key={lib.name} style={{ ...infoCard, borderTop: `2px solid ${lib.color}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontSize: 15, fontWeight: 800, color: lib.color }}>{lib.name}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--cs-text-strong)", marginTop: 3 }}>
                        {lib.tagline}
                      </div>
                      <p style={{ fontSize: 12, color: "var(--cs-text-muted)", lineHeight: 1.5, margin: "8px 0" }}>
                        {lib.desc}
                      </p>
                      <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)" }}>
                        <b style={{ color: "var(--cs-lavender-text)" }}>Best for:</b> {lib.example}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {section === "github" && (
              <>
                <div>
                  <h3 style={secTitle}>Understanding GitHub Sign-In, Repos &amp; Cloud Sync</h3>
                  <p style={para}>
                    Logging in with GitHub returns you right back to your active workspace so you never lose unsaved edits. Here is how your GitHub account connects with both Studio features:
                  </p>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div style={infoCard}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--cs-mint)", marginBottom: 6 }}>
                      1. Pull Code From Your GitHub Repos
                    </div>
                    <p style={{ fontSize: 12.5, color: "var(--cs-text-body)", lineHeight: 1.55, margin: "0 0 12px" }}>
                      Open <b>Import / GitHub → 2. GitHub Repos</b>. When signed in with GitHub, your repositories load automatically so you can pick a repo, scan its <code style={codeChip}>.go</code> files, and import Lip Gloss styles &amp; tokens straight onto the canvas.
                    </p>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenGitHubImport();
                      }}
                      style={{ ...tealBtn, display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                      <span>Browse My GitHub Repos</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>

                  <div style={infoCard}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--cs-pink-soft)", marginBottom: 6 }}>
                      2. Save &amp; Share Projects in the Cloud
                    </div>
                    <p style={{ fontSize: 12.5, color: "var(--cs-text-body)", lineHeight: 1.55, margin: "0 0 12px" }}>
                      Open <b>Projects</b> to save named snapshots of your layouts. Signed-in accounts sync projects to the cloud across devices and let you toggle a public shareable link.
                    </p>
                    <button
                      onClick={() => {
                        onClose();
                        onOpenProjects();
                      }}
                      style={{ ...accentBtn, display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                      <span>Open Saved Projects</span>
                      <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {section === "faq" && (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <h3 style={secTitle}>Frequently Asked Questions</h3>
                    <p style={{ ...para, marginBottom: 0 }}>Click any question to expand the answer, or search keywords below.</p>
                  </div>
                  <input
                    value={faqQuery}
                    onChange={(e) => setFaqQuery(e.target.value)}
                    placeholder="Search FAQ (e.g. GitHub, Fork, Bubbles, cols)..."
                    style={{
                      width: "min(290px, 100%)",
                      background: "var(--cs-input)",
                      color: "var(--cs-text)",
                      border: "1px solid var(--cs-btn-border)",
                      borderRadius: 8,
                      padding: "8px 11px",
                      fontSize: 12.5,
                    }}
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {filteredFaq.map((item, idx) => {
                    const isOpen = openFaqIdx === idx || faqQuery.trim().length > 0;
                    return (
                      <div
                        key={item.q}
                        style={{
                          background: "var(--cs-card)",
                          border: `1px solid ${isOpen ? "var(--cs-border-strong)" : "var(--cs-border-subtle)"}`,
                          borderRadius: 10,
                          overflow: "hidden",
                        }}
                      >
                        <button
                          onClick={() => setOpenFaqIdx(isOpen && !faqQuery.trim() ? null : idx)}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "12px 14px",
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            color: "var(--cs-text-strong)",
                            fontSize: 13.5,
                            fontWeight: 600,
                          }}
                        >
                          <span style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--cs-mint)" }}>
                              {item.category}
                            </span>
                            <span aria-hidden="true" style={{ color: "var(--cs-text-dim)" }}>·</span>
                            <span>{item.q}</span>
                          </span>
                          <span style={{ color: "var(--cs-text-muted)", display: "inline-flex", alignItems: "center" }}>
                            {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          </span>
                        </button>
                        {isOpen && (
                          <div style={{ padding: "0 14px 14px", fontSize: 12.5, lineHeight: 1.6, color: "var(--cs-text-body)", borderTop: "1px solid var(--cs-border)", paddingTop: 10 }}>
                            {item.a}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {filteredFaq.length === 0 && (
                    <div style={{ padding: 20, textAlign: "center", color: "var(--cs-text-dim)", fontSize: 13 }}>
                      No FAQ entries matched “{faqQuery}”.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const secTitle: React.CSSProperties = { margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: "var(--cs-text-heading)" };
const para: React.CSSProperties = { margin: "0 0 14px", fontSize: 13, lineHeight: 1.6, color: "var(--cs-text-muted)" };
const infoCard: React.CSSProperties = { background: "var(--cs-card)", border: "1px solid var(--cs-border-subtle)", borderRadius: 11, padding: 16 };
const codeChip: React.CSSProperties = {
  fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
  fontSize: "0.9em",
  padding: "1px 6px",
  borderRadius: 5,
  background: "var(--cs-code-bg)",
  color: "var(--cs-text-heading)",
  border: "1px solid var(--cs-code-border)",
};
const helpBadge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 14,
  height: 14,
  borderRadius: "50%",
  fontSize: 9.5,
  fontWeight: 700,
  color: "var(--cs-text-muted)",
  background: "var(--cs-code-bg)",
  border: "1px solid var(--cs-code-border)",
};
const closeBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)",
  color: "var(--cs-btn-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
};
const accentBtn: React.CSSProperties = {
  background: "var(--cs-pink-bg)",
  color: "var(--cs-pink-soft)",
  border: "1px solid var(--cs-pink-border)",
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
};
const tealBtn: React.CSSProperties = {
  background: "var(--cs-mint-bg)",
  color: "var(--cs-mint)",
  border: "1px solid var(--cs-mint-border)",
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 12.5,
  fontWeight: 700,
  cursor: "pointer",
};
