import { useMemo, useState } from "react";

interface GlossaryEntry {
  id: string;
  name: string;
  pkg: string;
  repoUrl: string;
  category: "Layout & Styling" | "Interactive Widgets" | "Markdown & CLI" | "SSH & Recording";
  tagline: string;
  promoImg: string;
  promoImgLight?: string;
  accentColor: string;
  description: string;
  pros: string[];
  cons: string[];
  studioRole: string;
  tryTemplateId?: string;
}

const ENTRIES: GlossaryEntry[] = [
  {
    id: "lipgloss",
    name: "Lip Gloss",
    pkg: "charm.land/lipgloss/v2",
    repoUrl: "https://github.com/charmbracelet/lipgloss",
    category: "Layout & Styling",
    tagline: "Declarative terminal styling, borders, padding & layout joins",
    promoImg: "https://github.com/user-attachments/assets/92560e60-d70e-4ce0-b39e-a60bb933356b",
    accentColor: "var(--cs-pink)",
    description:
      "Style definitions for nice terminal layouts. Lip Gloss works like CSS Flexbox for the command line—controlling colors, rounded/double borders, padding, margins, text alignment, adaptive light/dark tokens, and JoinHorizontal / JoinVertical box composition.",
    pros: [
      "Eliminates raw ANSI escape codes completely",
      "Built-in LightDark adaptive color support",
      "Composited floating overlays via lipgloss.NewLayer (v2)",
    ],
    cons: [
      "Handles presentation & layout only—pair with Bubble Tea for state/events",
      "Fixed terminal cell math still needs careful breakpoint testing (solved here!)",
    ],
    studioRole: "Powers every box, border, adaptive token, Matrix breakpoint check, and generated styles.go / layout.go.",
  },
  {
    id: "bubbles",
    name: "Bubbles",
    pkg: "charm.land/bubbles/v2",
    repoUrl: "https://github.com/charmbracelet/bubbles",
    category: "Interactive Widgets",
    tagline: "Battle-tested interactive TUI widgets for Bubble Tea",
    promoImg: "https://stuff.charm.sh/bubbles-examples/textinput.gif",
    accentColor: "var(--cs-mint)",
    description:
      "A rich collection of reusable UI primitives built on The Elm Architecture—including filterable Lists, Data Tables, scrollable Viewports, Text Inputs, Spinners, Paginators, and File Pickers.",
    pros: [
      "Saves weeks of custom keyboard & scrolling boilerplate",
      "Production-proven UX (vim j/k navigation, / filtering, cursor blinking)",
      "Fits cleanly inside Lip Gloss containers",
    ],
    cons: [
      "Requires Bubble Tea event/Update message wiring in Go",
      "Deeply custom visual overrides require editing component keymaps/styles",
    ],
    studioRole: "Run live inside WASM viewports! Click any List, Table, Viewport, or TextInput pane and type or press ↑/↓, j/k, or /.",
  },
  {
    id: "bubbletea",
    name: "Bubble Tea",
    pkg: "charm.land/bubbletea/v2",
    repoUrl: "https://github.com/charmbracelet/bubbletea",
    category: "Interactive Widgets",
    tagline: "Stateful Go TUI framework based on The Elm Architecture",
    promoImg: "https://stuff.charm.sh/bubbletea/bubbletea-example.gif",
    accentColor: "var(--cs-lavender)",
    description:
      "The core Go runtime that powers interactive Charm apps. You define a Model struct, an Init command, an Update(msg) loop that handles keystrokes and WindowSizeMsg, and a View() string renderer.",
    pros: [
      "Clean, predictable Model → Update → View architecture",
      "Handles alt-screen, mouse events, resize messages & concurrency cleanly",
      "Huge ecosystem of first-party & community components",
    ],
    cons: [
      "Elm-style message passing has a small learning curve for imperative devs",
      "Overkill if you only need a single one-off shell prompt (use Huh or Gum instead)",
    ],
    studioRole: "Automatically wired into Go Code → main.go with WindowSizeMsg responsive handling.",
  },
  {
    id: "huh",
    name: "Huh",
    pkg: "charm.land/huh/v2",
    repoUrl: "https://github.com/charmbracelet/huh",
    category: "Interactive Widgets",
    tagline: "Interactive terminal forms, selects, multi-selects & prompts",
    promoImg: "https://stuff.charm.sh/huh/glenn.png",
    accentColor: "var(--cs-lavender-text)",
    description:
      "Build friendly multi-step CLI forms, text fields, dropdown selects, multi-select checklists, and confirmations—with validation and screen-reader accessibility built in.",
    pros: [
      "Much faster to write forms than assembling raw Bubbles manually",
      "Works standalone OR embedded directly inside a Bubble Tea / Lip Gloss pane",
      "Built-in validation and accessible mode",
    ],
    cons: [
      "Opinionated form layout (less suited for free-form dashboards or tables)",
      "For quick non-Go Bash scripts, Gum is simpler",
    ],
    studioRole: "Available as a live Huh Form widget in + Add Component and the 'Huh Interactive Form' template.",
    tryTemplateId: "huh-wizard",
  },
  {
    id: "glamour",
    name: "Glamour",
    pkg: "github.com/charmbracelet/glamour",
    repoUrl: "https://github.com/charmbracelet/glamour",
    category: "Markdown & CLI",
    tagline: "Stylesheet-based Markdown rendering for terminal apps",
    promoImg: "https://github.com/charmbracelet/glamour/raw/master/examples/helloworld/helloworld.png",
    accentColor: "var(--cs-pink-soft)",
    description:
      "Takes raw Markdown (headings, bullet lists, blockquotes, tables, fenced code blocks) and renders syntax-highlighted ANSI terminal output using customizable JSON stylesheets (also powers Charm's Glow CLI).",
    pros: [
      "Zero manual ANSI styling for documentation, changelogs, or LLM output",
      "Auto-wraps paragraphs nicely to any container width",
      "Includes built-in light, dark, Dracula, Pink, and notty themes",
    ],
    cons: [
      "Read-only display—combine with Bubbles Viewport for long scrollable docs",
      "Adds extra binary size/dependencies for very minimal CLIs",
    ],
    studioRole: "Drop in a Glamour Markdown pane, edit live Markdown in the Inspector, and export wired glamour rendering in main.go.",
    tryTemplateId: "glamour-reader",
  },
  {
    id: "gum",
    name: "Gum",
    pkg: "github.com/charmbracelet/gum",
    repoUrl: "https://github.com/charmbracelet/gum",
    category: "Markdown & CLI",
    tagline: "Glamorous shell scripts without writing any Go code",
    promoImg: "https://stuff.charm.sh/gum/gum.png",
    accentColor: "#d97706",
    description:
      "A standalone CLI binary bringing Lip Gloss styling and interactive Choose, Confirm, Input, Filter, and Spin prompts straight to Bash, Zsh, Fish, or CI/CD scripts.",
    pros: [
      "Zero Go compilation needed—drop `gum choose` or `gum style` right into scripts",
      "Instant interactive UX for developer setup & deploy workflows",
      "Pipes cleanly with standard Unix stdout/exit codes",
    ],
    cons: [
      "Not suited for persistent split-pane full-screen TUI dashboards",
      "Requires users to have the `gum` binary installed",
    ],
    studioRole: "Add interactive Gum Choose & Confirm widgets and export a ready-to-run gum.sh script under Go Code.",
    tryTemplateId: "gum-toolbox",
  },
  {
    id: "wish",
    name: "Wish",
    pkg: "github.com/charmbracelet/wish",
    repoUrl: "https://github.com/charmbracelet/wish",
    category: "SSH & Recording",
    tagline: "Serve Bubble Tea & Lip Gloss apps over SSH",
    promoImg: "https://stuff.charm.sh/wish/wish-header.png",
    accentColor: "#2563eb",
    description:
      "An SSH server framework & middleware toolkit in Go. Turn any Bubble Tea + Lip Gloss layout into an app anyone can visit instantly via `ssh your-host.example` with automatic per-user PTY sizing and color profile detection.",
    pros: [
      "Users run your TUI instantly over SSH—no local install required",
      "Automatically negotiates client terminal dimensions & color profiles",
      "Composable middleware for logging, auth, and Bubble Tea sessions",
    ],
    cons: [
      "Requires hosting an always-on server / open SSH port",
      "Higher-latency connections need lean re-renders and ANSI-aware layouts",
    ],
    studioRole: "Include a Wish SSH Session Header to test adaptive profiles and export a runnable Wish SSH server in main.go.",
    tryTemplateId: "wish-ssh-portal",
  },
  {
    id: "vhs",
    name: "VHS",
    pkg: "github.com/charmbracelet/vhs",
    repoUrl: "https://github.com/charmbracelet/vhs",
    category: "SSH & Recording",
    tagline: "Scripted terminal GIF & video recordings as code",
    promoImg: "https://user-images.githubusercontent.com/42545625/198402537-12ca2f6c-0779-4eb8-a67c-8db9cb3df13c.png",
    promoImgLight: "https://user-images.githubusercontent.com/42545625/198402542-a305f669-a05a-4d91-b18b-ca76e72b655a.png",
    accentColor: "#059669",
    description:
      "Write `.tape` files describing terminal dimensions, themes, typing speed, and keystrokes—and VHS renders crisp, reproducible GIF, MP4, or PNG demos for documentation and golden-file integration tests.",
    pros: [
      "Version-controlled terminal demos (no shaky screen recordings)",
      "Matches exact cols/rows/theme from your design",
      "Doubles as automated visual regression / integration testing",
    ],
    cons: [
      "Requires `ttyd` & `ffmpeg` installed when recording locally",
      "CLI recording tool—not a runtime UI widget",
    ],
    studioRole: "Automatically generates a ready-to-record demo.tape matching your exact terminal theme & dimensions in Go Code.",
  },
];

const CATEGORIES = [
  "All",
  "Layout & Styling",
  "Interactive Widgets",
  "Markdown & CLI",
  "SSH & Recording",
] as const;

interface Props {
  open: boolean;
  appMode: "dark" | "light";
  onClose: () => void;
  onOpenWidgetPicker: () => void;
  onLoadTemplate: (templateId: string) => void;
}

function PromoImage({
  src,
  alt,
  accent,
}: {
  src: string;
  alt: string;
  accent: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        style={{
          height: 120,
          borderRadius: 9,
          background: "var(--cs-input)",
          border: "1px dashed var(--cs-border-strong)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: accent,
          fontWeight: 700,
          fontSize: 13,
          fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
        }}
      >
        charmbracelet/{alt.toLowerCase().replace(/\s+/g, "")}
      </div>
    );
  }

  return (
    <div
      style={{
        height: 132,
        borderRadius: 9,
        overflow: "hidden",
        background: "var(--cs-input)",
        border: "1px solid var(--cs-border-subtle)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img
        src={src}
        alt={`${alt} official Charmbracelet promo`}
        onError={() => setFailed(true)}
        loading="lazy"
        style={{
          maxWidth: "100%",
          maxHeight: "100%",
          objectFit: "contain",
          display: "block",
        }}
      />
    </div>
  );
}

export function CharmGlossaryModal({
  open,
  appMode,
  onClose,
  onOpenWidgetPicker,
  onLoadTemplate,
}: Props) {
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ENTRIES.filter((e) => {
      if (cat !== "All" && e.category !== cat) return false;
      if (!q) return true;
      return (
        e.name.toLowerCase().includes(q) ||
        e.tagline.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        e.pkg.toLowerCase().includes(q)
      );
    });
  }, [cat, query]);

  if (!open) return null;

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
          width: "min(1100px, 95vw)",
          height: "min(86vh, 840px)",
          background: "var(--cs-surface)",
          border: "1px solid var(--cs-border-strong)",
          borderRadius: 16,
          boxShadow: "var(--cs-shadow)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--cs-border)",
            background: "var(--cs-pill-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, color: "var(--cs-pink)" }}>◈</span>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--cs-text-strong)" }}>
                Charmbracelet Ecosystem Glossary
              </h2>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--cs-text-muted)", marginTop: 3 }}>
              Compare every Charm library &amp; CLI tool supported in Charm Studio—pros, cons, Studio usage, and official repos.
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => {
                onClose();
                onOpenWidgetPicker();
              }}
              style={{
                background: "var(--cs-pink-bg)",
                color: "var(--cs-pink)",
                border: "1px solid var(--cs-pink-border)",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✦ + Add Component
            </button>
            <button
              onClick={onClose}
              style={{
                background: "var(--cs-btn-bg)",
                color: "var(--cs-btn-text)",
                border: "1px solid var(--cs-btn-border)",
                borderRadius: 8,
                padding: "6px 12px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div
          style={{
            padding: "12px 24px",
            borderBottom: "1px solid var(--cs-border)",
            background: "var(--cs-panel)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {CATEGORIES.map((c) => {
              const active = cat === c;
              return (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  style={{
                    padding: "5px 11px",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: active ? "var(--cs-pink-bg)" : "var(--cs-card)",
                    color: active ? "var(--cs-pink)" : "var(--cs-text-muted)",
                    border: `1px solid ${active ? "var(--cs-pink)" : "var(--cs-border-subtle)"}`,
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter libraries (e.g. ssh, markdown, forms)..."
            style={{
              width: "min(270px, 100%)",
              background: "var(--cs-input)",
              color: "var(--cs-text)",
              border: "1px solid var(--cs-btn-border)",
              borderRadius: 8,
              padding: "7px 10px",
              fontSize: 12.5,
            }}
          />
        </div>

        {/* Cards Grid */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 24px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(460px, 1fr))",
            gap: 16,
            alignContent: "start",
          }}
        >
          {filtered.map((item) => {
            const imgSrc = appMode === "light" && item.promoImgLight ? item.promoImgLight : item.promoImg;
            return (
              <article
                key={item.id}
                style={{
                  background: "var(--cs-card)",
                  border: "1px solid var(--cs-border-subtle)",
                  borderTop: `3px solid ${item.accentColor}`,
                  borderRadius: 12,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "var(--cs-text-strong)" }}>
                        {item.name}
                      </h3>
                      <span
                        style={{
                          fontSize: 10.5,
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: 999,
                          background: "var(--cs-input)",
                          color: "var(--cs-text-muted)",
                          border: "1px solid var(--cs-border-subtle)",
                        }}
                      >
                        {item.category}
                      </span>
                    </div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: item.accentColor, marginTop: 2 }}>
                      {item.tagline}
                    </div>
                  </div>
                  <code
                    style={{
                      fontSize: 11,
                      padding: "3px 8px",
                      borderRadius: 6,
                      background: "var(--cs-code-bg)",
                      color: "var(--cs-lavender-text)",
                      border: "1px solid var(--cs-code-border)",
                      fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
                    }}
                  >
                    {item.pkg}
                  </code>
                </div>

                <PromoImage src={imgSrc} alt={item.name} accent={item.accentColor} />

                <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "var(--cs-text-body)" }}>
                  {item.description}
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div
                    style={{
                      background: "var(--cs-card-alt)",
                      border: "1px solid var(--cs-mint-border)",
                      borderRadius: 8,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--cs-mint)", marginBottom: 6, letterSpacing: 0.4 }}>
                      ✓ PROS
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, lineHeight: 1.5, color: "var(--cs-text-body)" }}>
                      {item.pros.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>

                  <div
                    style={{
                      background: "var(--cs-card-alt)",
                      border: "1px solid var(--cs-pink-border)",
                      borderRadius: 8,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: "var(--cs-pink)", marginBottom: 6, letterSpacing: 0.4 }}>
                      △ TRADE-OFFS
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11.5, lineHeight: 1.5, color: "var(--cs-text-body)" }}>
                      {item.cons.map((c) => (
                        <li key={c}>{c}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 11.5,
                    color: "var(--cs-text-muted)",
                    background: "var(--cs-input)",
                    border: "1px solid var(--cs-border-subtle)",
                    borderRadius: 7,
                    padding: "8px 10px",
                    lineHeight: 1.45,
                  }}
                >
                  <b style={{ color: "var(--cs-text-heading)" }}>In Charm Studio:</b> {item.studioRole}
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: "auto", paddingTop: 2 }}>
                  <a
                    href={item.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--cs-lavender)",
                      textDecoration: "none",
                      padding: "5px 10px",
                      borderRadius: 7,
                      background: "var(--cs-code-bg)",
                      border: "1px solid var(--cs-code-border)",
                    }}
                  >
                    GitHub: charmbracelet/{item.id} ↗
                  </a>

                  {item.tryTemplateId && (
                    <button
                      onClick={() => {
                        onLoadTemplate(item.tryTemplateId!);
                        onClose();
                      }}
                      style={{
                        background: "var(--cs-btn-bg)",
                        color: "var(--cs-btn-text)",
                        border: "1px solid var(--cs-btn-border)",
                        borderRadius: 7,
                        padding: "5px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Load {item.name} Template →
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>

        {/* Footer attribution */}
        <div
          style={{
            padding: "10px 24px",
            borderTop: "1px solid var(--cs-border)",
            background: "var(--cs-panel)",
            fontSize: 11.5,
            color: "var(--cs-text-dim)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span>
            Official library artwork &amp; source repositories ©{" "}
            <a href="https://charm.land" target="_blank" rel="noopener noreferrer" style={{ color: "var(--cs-pink)" }}>
              Charmbracelet
            </a>{" "}
            (MIT License).
          </span>
          <span>Showing {filtered.length} of {ENTRIES.length} Charm tools</span>
        </div>
      </div>
    </div>
  );
}
