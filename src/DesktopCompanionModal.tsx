import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  FolderGit2,
  GitBranch,
  GitMerge,
  Play,
  RefreshCw,
  Server,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import { isWailsRuntimeAvailable, type WorktreeDiffResult } from "./previewTransport";
import { useStudioStore } from "./store/studioStore";
import { wailsTransport } from "./wasmEngine";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STARTER_PROMPTS = [
  "Convert the static sidebar into a multi-step Huh form with validation",
  "Wire Tab / Shift+Tab focus cycling between panes with active border tokens",
  "Add responsive CollapseBelow breakpoints so narrow terminals stack cleanly",
];

export function DesktopCompanionModal({ open, onClose }: Props) {
  const {
    cols,
    rows,
    selectedId,
    previewMode,
    setPreviewMode,
    desktopConnected,
    desktopBridgeUrl,
    setDesktopBridgeUrl,
    refreshDesktopConnection,
    projectDir,
    setProjectDir,
    ptyStatus,
    startPtyRunner,
    stopPtyRunner,
    mcpStatus,
    refreshMcpStatus,
    worktrees,
    activeWorktreeId,
    setActiveWorktreeId,
    refreshWorktrees,
  } = useStudioStore();

  const [tab, setTab] = useState<"pty" | "mcp" | "worktrees">("pty");
  const [bridgeDraft, setBridgeDraft] = useState(desktopBridgeUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [promptText, setPromptText] = useState("");
  const [diffResult, setDiffResult] = useState<WorktreeDiffResult | null>(null);

  useEffect(() => {
    if (!open) return;
    void refreshDesktopConnection();
  }, [open, refreshDesktopConnection]);

  if (!open) return null;

  const isWebview = isWailsRuntimeAvailable();

  const copyText = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((cur) => (cur === key ? null : cur)), 1800);
    } catch {
      // ignore clipboard failures in restricted frames
    }
  };

  const handleTestConnection = async () => {
    setBusy(true);
    setError(null);
    try {
      setDesktopBridgeUrl(bridgeDraft);
      const ok = await refreshDesktopConnection();
      if (!ok) {
        setError(`Could not reach Wails companion at ${bridgeDraft}. Start it with: cd desktop && go run . --headless`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleStartPty = async () => {
    setBusy(true);
    setError(null);
    try {
      await startPtyRunner(projectDir);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleStopPty = async () => {
    setBusy(true);
    setError(null);
    try {
      await stopPtyRunner();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateWorktree = async () => {
    const dir = projectDir.trim();
    const prompt = promptText.trim();
    if (!dir) {
      setError("Set a local Git + Go project directory first.");
      return;
    }
    if (!prompt) {
      setError("Describe the structural prompt for the isolated worktree branch.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const sess = await wailsTransport.createWorktree(dir, prompt);
      setPromptText("");
      setActiveWorktreeId(sess.id);
      const st = await wailsTransport.activateWorktreeInPty(sess.id, cols, rows);
      if (st.error) setError(st.error);
      setPreviewMode("pty");
      await Promise.all([refreshWorktrees(dir), refreshMcpStatus()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleActivateWorktree = async (sessionId: string) => {
    setBusy(true);
    setError(null);
    try {
      setActiveWorktreeId(sessionId);
      const st = await wailsTransport.activateWorktreeInPty(sessionId, cols, rows);
      if (st.error) setError(st.error);
      setPreviewMode("pty");
      await Promise.all([refreshWorktrees(), refreshMcpStatus()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleInspectDiff = async (sessionId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await wailsTransport.getWorktreeDiff(sessionId);
      setDiffResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleMergeWorktree = async (sessionId: string) => {
    setBusy(true);
    setError(null);
    try {
      await wailsTransport.mergeWorktree(sessionId);
      if (activeWorktreeId === sessionId) setActiveWorktreeId(null);
      if (diffResult?.session.id === sessionId) setDiffResult(null);
      await Promise.all([refreshWorktrees(), refreshMcpStatus()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardWorktree = async (sessionId: string) => {
    setBusy(true);
    setError(null);
    try {
      await wailsTransport.discardWorktree(sessionId);
      if (activeWorktreeId === sessionId) setActiveWorktreeId(null);
      if (diffResult?.session.id === sessionId) setDiffResult(null);
      await Promise.all([refreshWorktrees(), refreshMcpStatus()]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const httpUrl = mcpStatus?.httpUrl || "http://127.0.0.1:43121/mcp";
  const sseUrl = mcpStatus?.sseUrl || "http://127.0.0.1:43121/sse";
  const stdioCmd = mcpStatus?.stdioCommand || "charmstudio-desktop --mcp-stdio";

  const claudeCmd = `claude mcp add --transport http charmstudio ${httpUrl}`;
  const cursorConfig = JSON.stringify(
    {
      mcpServers: {
        charmstudio: {
          url: httpUrl,
        },
      },
    },
    null,
    2
  );
  const codexSnippet = `[mcp_servers.charmstudio]\nurl = "${httpUrl}"`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 110,
        background: "var(--cs-backdrop)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(840px, 100%)",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--cs-surface)",
          border: "1px solid var(--cs-border-strong)",
          borderRadius: 14,
          padding: 22,
          boxShadow: "var(--cs-shadow)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 18, color: "var(--cs-text-heading)" }}>
                Wails v3 Desktop Companion · Native PTY &amp; MCP
              </h2>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: desktopConnected ? "var(--cs-mint)" : "var(--cs-text-dim)",
                }}
              >
                {desktopConnected
                  ? isWebview
                    ? "Connected (Wails WebView)"
                    : "Connected (Local Bridge)"
                  : "Disconnected (Browser WASM Mode)"}
              </span>
            </div>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--cs-text-dim)", lineHeight: 1.45 }}>
              Run your real Go binary inside <code style={codeTag}>charmbracelet/x/vt</code>, expose live layout &amp;
              Charm v2 rules over MCP, and isolate structural edits in <code style={codeTag}>git worktree</code> branches.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ ...btn, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setTab("pty")} style={tabBtn(tab === "pty")}>
            <Terminal size={13} />
            <span>1. Native PTY Runner</span>
          </button>
          <button onClick={() => setTab("mcp")} style={tabBtn(tab === "mcp")}>
            <Server size={13} />
            <span>2. MCP Server (&ldquo;Vibe Coding&rdquo;)</span>
          </button>
          <button onClick={() => setTab("worktrees")} style={tabBtn(tab === "worktrees")}>
            <FolderGit2 size={13} />
            <span>3. Worktree Prompts ({worktrees.length})</span>
          </button>
        </div>

        {error && (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              background: "rgba(244, 63, 94, 0.14)",
              border: "1px solid rgba(244, 63, 94, 0.45)",
              color: "#fda4af",
              fontSize: 12,
              lineHeight: 1.45,
            }}
          >
            {error}
          </div>
        )}

        {/* TAB 1: NATIVE PTY RUNNER */}
        {tab === "pty" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={card}>
              <div style={sectionHeader}>Desktop Host Connection</div>
              {!isWebview && (
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input
                    value={bridgeDraft}
                    onChange={(e) => setBridgeDraft(e.target.value)}
                    placeholder="http://127.0.0.1:43120"
                    style={{ ...inp, fontFamily: "ui-monospace, monospace" }}
                  />
                  <button
                    onClick={handleTestConnection}
                    disabled={busy}
                    style={{ ...btn, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <RefreshCw size={12} />
                    <span>{busy ? "Checking..." : "Connect"}</span>
                  </button>
                </div>
              )}

              {!desktopConnected && (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "var(--cs-panel)",
                    border: "1px solid var(--cs-border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    fontSize: 12,
                    color: "var(--cs-text-body)",
                  }}
                >
                  <div>
                    Start the Go 1.26+ companion locally to unlock native <code style={codeTag}>go build</code> +{" "}
                    <code style={codeTag}>xpty</code> streaming, MCP HTTP/SSE, and Git worktrees:
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <code style={{ ...codeTag, flex: 1, padding: "6px 8px" }}>
                      cd desktop &amp;&amp; go run . --headless
                    </code>
                    <button
                      onClick={() => copyText("headless", "cd desktop && go run . --headless")}
                      style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 4 }}
                    >
                      {copiedKey === "headless" ? <Check size={12} /> : <Copy size={12} />}
                      <span>{copiedKey === "headless" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              )}

              {desktopConnected && (
                <div style={{ fontSize: 12, color: "var(--cs-text-muted)" }}>
                  Native Go <code style={codeTag}>astsync</code> AST parsing &amp; patching is active for{" "}
                  <code style={codeTag}>Import / Patch Go</code>.
                </div>
              )}
            </div>

            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
                <div style={sectionHeader}>Live Project Directory &amp; Viewport Runner</div>
                <div style={{ display: "inline-flex", background: "var(--cs-input)", borderRadius: 6, padding: 2, border: "1px solid var(--cs-border)" }}>
                  <button onClick={() => setPreviewMode("wasm")} style={segBtn(previewMode === "wasm")}>
                    WASM Sandbox
                  </button>
                  <button
                    onClick={() => setPreviewMode("pty")}
                    disabled={!desktopConnected}
                    style={segBtn(previewMode === "pty")}
                  >
                    Native PTY (xterm.js)
                  </button>
                </div>
              </div>

              <label style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: "var(--cs-text-muted)", marginBottom: 10 }}>
                <span>Local Go TUI Project Path (must contain go.mod / main.go)</span>
                <input
                  value={projectDir}
                  onChange={(e) => setProjectDir(e.target.value)}
                  placeholder="/Users/you/projects/my-bubbletea-app"
                  style={{ ...inp, fontFamily: "ui-monospace, monospace" }}
                />
              </label>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: "var(--cs-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  State:{" "}
                  <b style={{ color: ptyStatus?.state === "error" ? "#fb7185" : "var(--cs-text-heading)" }}>
                    {ptyStatus?.state ?? "idle"}
                  </b>
                  {" · "}
                  Viewport {cols}×{rows}
                  {ptyStatus?.lastBuildMs ? ` · Last build ${ptyStatus.lastBuildMs} ms` : ""}
                  {ptyStatus?.pid ? ` · PID ${ptyStatus.pid}` : ""}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {ptyStatus?.state === "running" || ptyStatus?.state === "building" ? (
                    <button
                      onClick={handleStopPty}
                      disabled={busy || !desktopConnected}
                      style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 5 }}
                    >
                      <Square size={12} />
                      <span>Stop PTY</span>
                    </button>
                  ) : null}
                  <button
                    onClick={handleStartPty}
                    disabled={busy || !desktopConnected || !projectDir.trim()}
                    style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: 5 }}
                  >
                    <Play size={12} />
                    <span>{ptyStatus?.state === "running" ? "Rebuild & Restart PTY" : "Start Live PTY"}</span>
                  </button>
                </div>
              </div>

              {ptyStatus?.state === "error" && ptyStatus.error && (
                <pre
                  style={{
                    margin: "10px 0 0",
                    padding: "8px 10px",
                    borderRadius: 6,
                    background: "rgba(244, 63, 94, 0.12)",
                    border: "1px solid rgba(244, 63, 94, 0.35)",
                    color: "#fda4af",
                    fontSize: 11.5,
                    fontFamily: "ui-monospace, monospace",
                    maxHeight: 150,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {ptyStatus.error}
                </pre>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: MCP SERVER */}
        {tab === "mcp" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={sectionHeader}>Embedded MCP Context Endpoints</div>
                <span style={{ fontSize: 11.5, color: mcpStatus?.running ? "var(--cs-mint)" : "var(--cs-text-dim)" }}>
                  {mcpStatus?.running ? "Listening" : "Offline until companion starts"}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px 10px", fontSize: 12, alignItems: "center" }}>
                <span style={{ color: "var(--cs-text-dim)" }}>Streamable HTTP</span>
                <code style={codeTag}>{httpUrl}</code>
                <span style={{ color: "var(--cs-text-dim)" }}>SSE Stream</span>
                <code style={codeTag}>{sseUrl}</code>
                <span style={{ color: "var(--cs-text-dim)" }}>Stdio Binary</span>
                <code style={codeTag}>{stdioCmd}</code>
                <span style={{ color: "var(--cs-text-dim)" }}>Synced Selection</span>
                <span style={{ color: "var(--cs-text-heading)", fontFamily: "ui-monospace, monospace" }}>
                  #{mcpStatus?.selectedId || selectedId} · {mcpStatus?.activeDir || projectDir || "(in-memory IR only)"}
                </span>
              </div>
            </div>

            <div style={card}>
              <div style={sectionHeader}>Connect Coding Agents (Claude Code · Cursor · Codex)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={snippetBox}>
                  <div style={snippetHdr}>
                    <span>Claude Code CLI</span>
                    <button onClick={() => copyText("claude", claudeCmd)} style={miniCopyBtn}>
                      {copiedKey === "claude" ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedKey === "claude" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <pre style={snippetPre}>{claudeCmd}</pre>
                </div>

                <div style={snippetBox}>
                  <div style={snippetHdr}>
                    <span>Cursor (.cursor/mcp.json)</span>
                    <button onClick={() => copyText("cursor", cursorConfig)} style={miniCopyBtn}>
                      {copiedKey === "cursor" ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedKey === "cursor" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <pre style={snippetPre}>{cursorConfig}</pre>
                </div>

                <div style={snippetBox}>
                  <div style={snippetHdr}>
                    <span>OpenAI Codex CLI (~/.codex/config.toml)</span>
                    <button onClick={() => copyText("codex", codexSnippet)} style={miniCopyBtn}>
                      {copiedKey === "codex" ? <Check size={11} /> : <Copy size={11} />}
                      <span>{copiedKey === "codex" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <pre style={snippetPre}>{codexSnippet}</pre>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={card}>
                <div style={sectionHeader}>MCP Resources</div>
                <ul style={plainList}>
                  {(mcpStatus?.resourceUris ?? [
                    "charmstudio://layout/ir",
                    "charmstudio://selection",
                    "charmstudio://theme/tokens",
                    "charmstudio://rules/charm-v2",
                  ]).map((uri) => (
                    <li key={uri}>
                      <code style={codeTag}>{uri}</code>
                    </li>
                  ))}
                </ul>
              </div>
              <div style={card}>
                <div style={sectionHeader}>MCP Tools</div>
                <ul style={plainList}>
                  {(mcpStatus?.toolNames ?? [
                    "get_layout_context",
                    "inspect_node",
                    "list_migration_rules",
                    "parse_go_source",
                    "patch_go_source",
                    "compute_go_diff",
                    "update_layout_ir",
                  ]).map((tool) => (
                    <li key={tool}>
                      <code style={codeTag}>{tool}</code>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: GIT WORKTREE ISOLATION */}
        {tab === "worktrees" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={card}>
              <div style={sectionHeader}>Spin Up Isolated Worktree Branch for Structural Prompt</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {STARTER_PROMPTS.map((sp) => (
                  <button
                    key={sp}
                    onClick={() => setPromptText(sp)}
                    style={{ ...btn, fontSize: 11, padding: "4px 8px" }}
                  >
                    {sp}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Describe a structural change (e.g. convert this static sidebar into a multi-step Huh form)..."
                style={{ ...inp, resize: "vertical", marginBottom: 10 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: "var(--cs-text-dim)" }}>
                  Base repo: <code style={codeTag}>{projectDir || "(set project directory in Tab 1)"}</code>
                </span>
                <button
                  onClick={handleCreateWorktree}
                  disabled={busy || !desktopConnected || !projectDir.trim() || !promptText.trim()}
                  style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  <GitBranch size={13} />
                  <span>Create Worktree &amp; Point Live PTY</span>
                </button>
              </div>
            </div>

            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={sectionHeader}>Active Worktree Sessions</div>
                <button
                  onClick={() => refreshWorktrees()}
                  disabled={!desktopConnected || busy}
                  style={{ ...btn, padding: "3px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <RefreshCw size={11} />
                  <span>Refresh</span>
                </button>
              </div>

              {worktrees.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--cs-text-dim)" }}>
                  No active Charm Studio worktrees for this repository. Create one above to test structural agent edits safely.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {worktrees.map((wt) => {
                    const isActive = wt.activeInPty || activeWorktreeId === wt.id;
                    return (
                      <div
                        key={wt.id}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 8,
                          background: "var(--cs-panel)",
                          border: `1px solid ${isActive ? "var(--cs-mint-border)" : "var(--cs-border)"}`,
                          display: "flex",
                          flexDirection: "column",
                          gap: 8,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <code style={codeTag}>{wt.branch}</code>
                              <span style={{ fontSize: 11, color: "var(--cs-text-dim)" }}>
                                base: {wt.baseBranch}
                                {isActive ? " · Active in PTY" : ""}
                              </span>
                            </div>
                            <div style={{ fontSize: 12, color: "var(--cs-text-body)", marginTop: 4 }}>{wt.prompt}</div>
                            <div style={{ fontSize: 11, color: "var(--cs-text-dim)", fontFamily: "ui-monospace, monospace", marginTop: 2 }}>
                              {wt.worktreeDir}
                            </div>
                          </div>

                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <button
                              onClick={() => handleActivateWorktree(wt.id)}
                              disabled={busy}
                              style={{ ...btn, padding: "4px 8px", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4 }}
                            >
                              <Play size={11} />
                              <span>Run in PTY</span>
                            </button>
                            <button
                              onClick={() => handleInspectDiff(wt.id)}
                              disabled={busy}
                              style={{ ...btn, padding: "4px 8px", fontSize: 11.5 }}
                            >
                              Inspect Diff
                            </button>
                            <button
                              onClick={() => handleMergeWorktree(wt.id)}
                              disabled={busy}
                              style={{
                                ...btn,
                                padding: "4px 8px",
                                fontSize: 11.5,
                                color: "var(--cs-mint)",
                                borderColor: "var(--cs-mint-border)",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <GitMerge size={11} />
                              <span>Merge</span>
                            </button>
                            <button
                              onClick={() => handleDiscardWorktree(wt.id)}
                              disabled={busy}
                              style={{
                                ...btn,
                                padding: "4px 8px",
                                fontSize: 11.5,
                                color: "#fb7185",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                              }}
                            >
                              <Trash2 size={11} />
                              <span>Discard</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {diffResult && (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={sectionHeader}>
                    Worktree Diff · {diffResult.session.branch} ({diffResult.summary})
                  </div>
                  <button onClick={() => setDiffResult(null)} style={{ ...btn, padding: "2px 8px", fontSize: 11 }}>
                    Close Diff
                  </button>
                </div>
                {diffResult.clean ? (
                  <div style={{ fontSize: 12, color: "var(--cs-text-dim)" }}>
                    Working tree has no uncommitted or unmerged changes yet. Run your coding agent against{" "}
                    <code style={codeTag}>{diffResult.session.worktreeDir}</code>.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {diffResult.files.map((f) => (
                      <div
                        key={f.path}
                        style={{
                          border: "1px solid var(--cs-border)",
                          borderRadius: 8,
                          padding: 10,
                          background: "var(--cs-panel)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                          <code style={{ color: "var(--cs-text-heading)", fontWeight: 600 }}>
                            [{f.status}] {f.path}
                          </code>
                          <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--cs-text-dim)" }}>
                            +{f.added} / -{f.removed}
                          </span>
                        </div>
                        {f.deltas && f.deltas.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 6, fontSize: 11.5 }}>
                            {f.deltas.map((d, idx) => (
                              <div key={idx} style={{ color: "var(--cs-text-body)" }}>
                                <span style={{ color: d.kind === "added" ? "var(--cs-mint)" : d.kind === "removed" ? "#fb7185" : "var(--cs-pink-soft)", fontWeight: 600 }}>
                                  {d.kind}
                                </span>{" "}
                                {d.category} <code style={codeTag}>{d.symbol}</code> — {d.detail}
                              </div>
                            ))}
                          </div>
                        )}
                        {f.lines && f.lines.length > 0 && (
                          <pre
                            style={{
                              margin: 0,
                              padding: 8,
                              borderRadius: 6,
                              background: "var(--cs-input)",
                              fontSize: 11,
                              fontFamily: "ui-monospace, monospace",
                              maxHeight: 200,
                              overflow: "auto",
                            }}
                          >
                            {f.lines
                              .slice(0, 120)
                              .map((l) => `${l.type === "add" ? "+" : l.type === "del" ? "-" : " "} ${l.text}`)
                              .join("\n")}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  background: "var(--cs-card)",
  border: "1px solid var(--cs-border-subtle)",
  borderRadius: 10,
  padding: 14,
};

const sectionHeader: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--cs-text-heading)",
  marginBottom: 8,
};

const inp: React.CSSProperties = {
  background: "var(--cs-input)",
  color: "var(--cs-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
  width: "100%",
};

const btn: React.CSSProperties = {
  background: "var(--cs-btn-bg)",
  color: "var(--cs-btn-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  background: "var(--cs-pink-bg)",
  color: "var(--cs-pink-soft)",
  border: "1px solid var(--cs-pink)",
  borderRadius: 6,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--cs-pink-bg)" : "var(--cs-card)",
  color: active ? "var(--cs-pink-soft)" : "var(--cs-text-muted)",
  border: `1px solid ${active ? "var(--cs-pink)" : "var(--cs-border-subtle)"}`,
  borderRadius: 7,
  padding: "6px 12px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
});

const segBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--cs-pink-bg)" : "transparent",
  color: active ? "var(--cs-pink-soft)" : "var(--cs-text-muted)",
  border: active ? "1px solid var(--cs-pink-border)" : "1px solid transparent",
  borderRadius: 5,
  padding: "4px 10px",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
});

const codeTag: React.CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: 11.5,
  padding: "1px 6px",
  borderRadius: 5,
  background: "var(--cs-input)",
  color: "var(--cs-text-heading)",
  border: "1px solid var(--cs-border)",
};

const snippetBox: React.CSSProperties = {
  border: "1px solid var(--cs-border)",
  borderRadius: 8,
  background: "var(--cs-panel)",
  overflow: "hidden",
};

const snippetHdr: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 10px",
  borderBottom: "1px solid var(--cs-border)",
  fontSize: 11.5,
  fontWeight: 600,
  color: "var(--cs-text-body)",
};

const snippetPre: React.CSSProperties = {
  margin: 0,
  padding: "8px 10px",
  fontSize: 11.5,
  fontFamily: "ui-monospace, monospace",
  color: "var(--cs-text-heading)",
  overflowX: "auto",
};

const miniCopyBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)",
  color: "var(--cs-btn-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 5,
  padding: "2px 7px",
  fontSize: 11,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
};

const plainList: React.CSSProperties = {
  margin: 0,
  padding: 0,
  listStyle: "none",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};
