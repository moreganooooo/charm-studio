import { useState } from "react";
import {
  ArrowRight,
  Check,
  Copy,
  FolderGit2,
  GitBranch,
  GitMerge,
  Laptop,
  Server,
  Terminal,
} from "lucide-react";
import { useRouter } from "../router";
import "./SecondaryPages.css";
import { SiteNavBar } from "./SiteNavBar";
import { CHARM_TOKENS, studioStyles } from "./studioStyles";

interface WalkthroughStep {
  id: number;
  title: string;
  tag: string;
  summary: string;
  command: string;
  detail: string;
}

const WORKTREE_STEPS: WalkthroughStep[] = [
  {
    id: 1,
    title: "1. Isolate Structural Edits in git worktree",
    tag: "charmstudio/wt-*",
    summary:
      "When an AI coding agent needs to refactor Update() wiring or swap a static pane for a multi-step Huh form, Charm Studio spins up a dedicated git worktree branch so your working tree stays clean.",
    command: "git worktree add ../repo-wt-huh -b charmstudio/wt-huh-form",
    detail:
      "MCP exposes charmstudio://layout/ir, charmstudio://selection, and charmstudio://rules/charm-v2 so the agent reads exact node IDs and v2 migration rules before editing.",
  },
  {
    id: 2,
    title: "2. Stream Incremental go build + xpty to xterm.js",
    tag: "charmbracelet/x/vt",
    summary:
      "The Wails v3 companion watches the worktree directory, runs incremental go build on save, and launches the compiled binary inside charmbracelet/x/vt + xpty.",
    command: "cd desktop && go mod tidy && go run . --headless",
    detail:
      "Raw ANSI frames, mouse hit events, and terminal resize signals stream directly to xterm.js in Studio over :43120 so you test the real compiled Go binary side-by-side.",
  },
  {
    id: 3,
    title: "3. Inspect Semantic AST Diff & Merge",
    tag: "compute_go_diff",
    summary:
      "Before merging back, inspect AST-level deltas across styles, tokens, and Bubble Tea Update/View functions via dave/dst—then merge or discard cleanly in one click.",
    command: "charmstudio-desktop --mcp-stdio",
    detail:
      "If the structural branch looks right in Native PTY, merge into your base branch; otherwise discard the worktree with zero leftover diffs.",
  },
];

const CLI_SNIPPETS = [
  {
    id: "headless",
    title: "Run Local Desktop Bridge & MCP Server (:43120 / :43121)",
    code: "cd desktop && go mod tidy && go run . --headless",
    note: "Starts the HTTP bridge on 127.0.0.1:43120 and Streamable HTTP/SSE MCP server on 127.0.0.1:43121.",
  },
  {
    id: "stdio",
    title: "Stdio MCP Server Entrypoint",
    code: "charmstudio-desktop --mcp-stdio",
    note: "For coding agents or editors that launch MCP servers over stdin/stdout.",
  },
  {
    id: "build",
    title: "Build Native Wails v3 Desktop App (Go 1.26+)",
    code: "task build",
    note: "Compiles the native Wails v3 desktop binary embedding the React frontend and native astsync service.",
  },
];

const AGENT_CONFIGS = [
  {
    id: "claude",
    name: "Claude Code CLI",
    path: "Terminal command",
    code: "claude mcp add --transport http charmstudio http://127.0.0.1:43121/mcp",
  },
  {
    id: "cursor",
    name: "Cursor",
    path: ".cursor/mcp.json",
    code: `{
  "mcpServers": {
    "charmstudio": {
      "url": "http://127.0.0.1:43121/mcp"
    }
  }
}`,
  },
  {
    id: "codex",
    name: "OpenAI Codex CLI",
    path: "~/.codex/config.toml",
    code: `[mcp_servers.charmstudio]
url = "http://127.0.0.1:43121/mcp"`,
  },
];

export function DesktopPage() {
  const { navigate } = useRouter();
  const [activeStep, setActiveStep] = useState(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copyText = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1800);
    } catch {
      // Ignore clipboard failures
    }
  };

  const step = WORKTREE_STEPS.find((s) => s.id === activeStep) ?? WORKTREE_STEPS[0];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: CHARM_TOKENS.bgGround,
        color: CHARM_TOKENS.text,
        fontFamily: CHARM_TOKENS.fontUi,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SiteNavBar />

      <main
        style={{
          flex: 1,
          width: "min(1200px, 100%)",
          margin: "0 auto",
          padding: "36px 24px 64px",
          display: "flex",
          flexDirection: "column",
          gap: 36,
        }}
      >
        {/* Hero */}
        <section style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
          <div>
            <div className="cs-mono" style={{ fontSize: 11, fontWeight: 700, color: CHARM_TOKENS.lilac, letterSpacing: "0.06em" }}>
              WAILS V3 DESKTOP COMPANION · NATIVE PTY &amp; MCP
            </div>
            <h1 style={{ margin: "6px 0 8px", fontSize: "clamp(1.75rem, 3vw, 2.5rem)", fontWeight: 800, letterSpacing: "-0.025em", color: CHARM_TOKENS.textHeading }}>
              Connect your real Go binary &amp; coding agents
            </h1>
            <p style={{ margin: 0, fontSize: 14.5, color: CHARM_TOKENS.textMuted, maxWidth: 660, lineHeight: 1.6 }}>
              Start in the browser with zero setup via <code className="cs-mono">WasmTransport</code>, then pair with the Go 1.26+ Wails v3 companion (<code className="cs-mono">WailsTransport</code>) when you want native incremental builds, real PTY streaming, and MCP context for Claude Code, Cursor, or Codex.
            </p>
          </div>

          <button onClick={() => navigate("/studio")} style={studioStyles.primaryCta}>
            <span>Open Studio</span>
            <ArrowRight size={14} />
          </button>
        </section>

        {/* Transport Comparison */}
        <section
          className="transport-comparison"
          aria-label="PreviewTransport comparison"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))",
            gap: 18,
          }}
        >
          <div className="transport-card transport-browser"
            style={{
              borderRadius: 16,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div className="transport-heading">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
                <Terminal size={17} style={{ color: CHARM_TOKENS.mint }} />
                <span>Browser Sandbox (WasmTransport)</span>
              </span>
              <span className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.mintText }}>Default</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: CHARM_TOKENS.textMuted }}>
              Runs compiled Go (<code className="cs-mono">studio.wasm</code>) directly inside your browser with zero install.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: CHARM_TOKENS.textBody }}>
              <li>Instant <code className="cs-mono">lipgloss/v2</code> + <code className="cs-mono">bubbles/v2</code> rendering</li>
              <li>Exact <code className="cs-mono">compositor.Hit(col, row)</code> mouse selection</li>
              <li>In-browser <code className="cs-mono">dave/dst</code> Go AST import &amp; surgical patching</li>
              <li>Shareable <code className="cs-mono">#s=</code> links &amp; runnable multi-file <code className="cs-mono">.zip</code> export</li>
            </ul>
          </div>

          <div className="transport-card transport-native"
            style={{
              borderRadius: 16,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div className="transport-heading">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
                <Laptop size={17} style={{ color: CHARM_TOKENS.pink }} />
                <span>Desktop Companion (WailsTransport)</span>
              </span>
              <span className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.pinkSoft }}>Go 1.26+</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: CHARM_TOKENS.textMuted }}>
              Bridges local filesystem repos over <code className="cs-mono">:43120</code> or native Wails v3 webview bindings.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: CHARM_TOKENS.textBody }}>
              <li>Watches repo changes, runs <code className="cs-mono">go build</code>, streams <code className="cs-mono">xpty</code> to <code className="cs-mono">xterm.js</code></li>
              <li>Embedded MCP server (<code className="cs-mono">:43121</code>) with Charm v2 rules &amp; active node context</li>
              <li>Isolated <code className="cs-mono">git worktree</code> prompt branches with live AST diff preview</li>
              <li>One-click merge or discard once verified in the live PTY</li>
            </ul>
          </div>
        </section>

        {/* Copyable CLI Commands */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: CHARM_TOKENS.textHeading }}>
            Local Companion Quickstart Commands
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 14 }}>
            {CLI_SNIPPETS.map((item) => (
              <div
                key={item.id}
                style={{
                  background: CHARM_TOKENS.bgSurface,
                  border: `1px solid ${CHARM_TOKENS.border}`,
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>{item.title}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 8,
                    background: CHARM_TOKENS.bgCode,
                    border: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                  }}
                >
                  <code className="cs-mono" style={{ fontSize: 11.5, color: CHARM_TOKENS.mintText, overflowX: "auto" }}>
                    {item.code}
                  </code>
                  <button
                    onClick={() => void copyText(item.id, item.code)}
                    style={{ ...studioStyles.secondaryBtn, padding: "4px 8px", fontSize: 11 }}
                  >
                    {copiedKey === item.id ? <Check size={12} style={{ color: CHARM_TOKENS.mint }} /> : <Copy size={12} />}
                    <span>{copiedKey === item.id ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: CHARM_TOKENS.textMuted }}>{item.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Interactive 3-Step Agent + Worktree Workflow */}
        <section
          style={{
            background: CHARM_TOKENS.bgSurface,
            border: `1px solid ${CHARM_TOKENS.border}`,
            borderRadius: 16,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <FolderGit2 size={17} style={{ color: CHARM_TOKENS.pink }} />
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: CHARM_TOKENS.textHeading }}>
                Worktree-Isolated Agent Workflow
              </h2>
            </div>
            <span className="cs-mono" style={{ fontSize: 11.5, color: CHARM_TOKENS.textMuted }}>
              Select a step to inspect MCP &amp; PTY behavior
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {WORKTREE_STEPS.map((s) => {
              const active = s.id === activeStep;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveStep(s.id)}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: active ? CHARM_TOKENS.pinkBg : "var(--cs-input)",
                    border: `1px solid ${active ? CHARM_TOKENS.pink : CHARM_TOKENS.borderSubtle}`,
                    color: active ? CHARM_TOKENS.textHeading : CHARM_TOKENS.textMuted,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 700 }}>{s.title}</span>
                  <code className="cs-mono" style={{ fontSize: 11, color: active ? CHARM_TOKENS.pinkSoft : CHARM_TOKENS.textDim }}>
                    {s.tag}
                  </code>
                </button>
              );
            })}
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 12,
              background: CHARM_TOKENS.bgCode,
              border: `1px solid ${CHARM_TOKENS.border}`,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
              {step.id === 1 ? <GitBranch size={15} style={{ color: CHARM_TOKENS.pink }} /> : step.id === 2 ? <Server size={15} style={{ color: CHARM_TOKENS.mint }} /> : <GitMerge size={15} style={{ color: CHARM_TOKENS.lilac }} />}
              <span>{step.title}</span>
            </div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: CHARM_TOKENS.textBody }}>{step.summary}</p>
            <pre className="cs-mono" style={{ margin: 0, padding: "8px 10px", borderRadius: 8, background: "var(--cs-input)", border: `1px solid ${CHARM_TOKENS.borderSubtle}`, fontSize: 12, color: CHARM_TOKENS.mintText, overflowX: "auto" }}>
              {step.command}
            </pre>
            <div style={{ fontSize: 12.5, color: CHARM_TOKENS.textMuted, lineHeight: 1.5 }}>{step.detail}</div>
          </div>
        </section>

        {/* MCP Client Snippets */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: CHARM_TOKENS.textHeading }}>
            MCP Client Setup (Claude Code · Cursor · Codex)
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 14 }}>
            {AGENT_CONFIGS.map((cfg) => (
              <div
                key={cfg.id}
                style={{
                  background: CHARM_TOKENS.bgSurface,
                  border: `1px solid ${CHARM_TOKENS.border}`,
                  borderRadius: 12,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 14px",
                    borderBottom: `1px solid ${CHARM_TOKENS.border}`,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>{cfg.name}</div>
                    <div className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.textDim }}>{cfg.path}</div>
                  </div>
                  <button
                    onClick={() => void copyText(cfg.id, cfg.code)}
                    style={{ ...studioStyles.secondaryBtn, padding: "4px 8px", fontSize: 11 }}
                  >
                    {copiedKey === cfg.id ? <Check size={12} style={{ color: CHARM_TOKENS.mint }} /> : <Copy size={12} />}
                    <span>{copiedKey === cfg.id ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre
                  className="cs-mono"
                  style={{
                    margin: 0,
                    padding: 14,
                    fontSize: 11.5,
                    lineHeight: 1.55,
                    background: CHARM_TOKENS.bgCode,
                    color: CHARM_TOKENS.text,
                    overflowX: "auto",
                    flex: 1,
                  }}
                >
                  {cfg.code}
                </pre>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
