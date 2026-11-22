import {
  Check,
  Download,
  GitBranch,
  Link2,
  Moon,
  Plus,
  Redo2,
  Server,
  Sparkles,
  Sun,
  Terminal,
  Undo2,
  Folder,
} from "lucide-react";
import { MATRIX_PRESETS, useStudioStore } from "../store/studioStore";
import { TEMPLATES } from "../templates";
import { Tooltip } from "../Tooltip";
import type { ColorProfile } from "../types";
import { btnStyle, inlineLbl, inputStyle, segBtn } from "./studioStyles";

interface Props {
  userLabel: string | null;
  projectsCount: number;
  widgetPickerOpen: boolean;
  projectsOpen: boolean;
  importOpen: boolean;
  desktopOpen: boolean;
  onOpenWidgetPicker: () => void;
  onOpenProjects: () => void;
  onOpenImport: () => void;
  onOpenSettings: () => void;
  onOpenCodeExport: () => void;
  onOpenDesktopCompanion: () => void;
}

export function CanvasToolbar({
  userLabel,
  projectsCount,
  widgetPickerOpen,
  projectsOpen,
  importOpen,
  desktopOpen,
  onOpenWidgetPicker,
  onOpenProjects,
  onOpenImport,
  onOpenSettings,
  onOpenCodeExport,
  onOpenDesktopCompanion,
}: Props) {
  const {
    workspaceMode,
    switchWorkspaceMode,
    templateId,
    loadTemplate,
    resetToTemplate,
    past,
    future,
    undo,
    redo,
    shareLink,
    sharedCopied,
    activeSpotlight,
    cols,
    rows,
    setCols,
    setRows,
    viewMode,
    setViewMode,
    paletteId,
    allPalettes,
    selectPalette,
    appMode,
    setAppMode,
    colorProfile,
    setColorProfile,
    matrixDense,
    setMatrixDense,
    ir,
    toggleOverlay,
    showOverlay,
    setShowOverlay,
    tooltipsEnabled,
    setTooltipsEnabled,
    desktopConnected,
    previewMode,
    setPreviewMode,
  } = useStudioStore();

  const showModal = ir.overlays[0]?.visible ?? false;

  return (
    <>
      {/* Row 1: Aligned Header Strip matching Layout Tree & Inspector */}
      <div
        style={{
          margin: "0 -24px",
          padding: "0 24px 0 0",
          minHeight: 49,
          borderBottom: "1px solid var(--cs-border)",
          background: "var(--cs-panel)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "stretch",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <Tooltip
          title="Starter Templates"
          content="Switch between pre-built Charmbracelet layouts (dashboards, Huh forms, Glamour docs, Gum scripts, Wish SSH apps)."
          placement="bottom"
        >
          <label
            className={activeSpotlight === "template-import" ? "charm-spotlight" : undefined}
            style={{ ...inlineLbl, gap: 10, height: "100%", padding: activeSpotlight === "template-import" ? "0 4px 0 0" : 0 }}
          >
            <span
              style={{
                height: "100%",
                minHeight: 48,
                padding: "0 16px",
                fontWeight: 700,
                fontSize: 13.5,
                background: "var(--cs-card)",
                color: "var(--cs-pink)",
                borderBottom: "2px solid var(--cs-pink)",
                borderRight: "1px solid var(--cs-border)",
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              Template
            </span>
            <select
              value={templateId}
              onChange={(e) => loadTemplate(e.target.value)}
              style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontWeight: 600 }}
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </Tooltip>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "6px 0" }}>
          <Tooltip
            title="Add Charm Component"
            content="Open a visual menu of Lip Gloss, Bubbles, Huh, Glamour, Gum, and Wish widgets to drop straight into your app."
            placement="bottom"
          >
            <button
              onClick={onOpenWidgetPicker}
              className={activeSpotlight === "add-component" ? "charm-spotlight" : undefined}
              style={{
                ...btnStyle(widgetPickerOpen),
                background: "var(--cs-pink-bg)",
                borderColor: "var(--cs-pink-border)",
                color: "var(--cs-pink-soft)",
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Plus size={13} />
              <span>Add Component</span>
            </button>
          </Tooltip>
          <Tooltip
            title="Saved Projects"
            content="Save snapshots locally or sync projects to your cloud account so you can reopen and share them anytime."
            placement="bottom"
          >
            <button onClick={onOpenProjects} style={{ ...btnStyle(projectsOpen), display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Folder size={13} />
              <span>
                {userLabel ?? "Projects"} ({projectsCount})
              </span>
            </button>
          </Tooltip>
          <Tooltip
            title="Import Go / GitHub Repos"
            content="Upload local .go or .json files, or browse your GitHub repositories to pull existing Lip Gloss styles into Charm Studio."
            placement="bottom"
          >
            <button
              onClick={onOpenImport}
              className={activeSpotlight === "template-import" ? "charm-spotlight" : undefined}
              style={{ ...btnStyle(importOpen), display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <GitBranch size={13} />
              <span>Import / GitHub</span>
            </button>
          </Tooltip>
          <Tooltip
            title="Export Go Code"
            content="Open the multi-file Go code drawer (theme_gen.go, layout_gen.go, model.go, update.go, view.go) and download a runnable ZIP."
            placement="bottom"
          >
            <button
              onClick={onOpenCodeExport}
              style={{ ...btnStyle(false), display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <Download size={13} />
              <span>Export Go</span>
            </button>
          </Tooltip>
          <Tooltip
            title="Wails v3 Desktop Companion · PTY & MCP"
            content="Connect to the native Go host for live go build + xpty streaming, MCP agent endpoints, and git worktree prompt isolation."
            placement="bottom"
          >
            <button
              onClick={onOpenDesktopCompanion}
              style={{
                ...btnStyle(desktopOpen),
                borderColor: desktopConnected ? "var(--cs-mint-border)" : desktopOpen ? "var(--cs-pink)" : "var(--cs-btn-border)",
                color: desktopConnected ? "var(--cs-mint)" : desktopOpen ? "var(--cs-pink-soft)" : "var(--cs-btn-text)",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Server size={13} />
              <span>{desktopConnected ? "Desktop · Live" : "Desktop / MCP"}</span>
            </button>
          </Tooltip>
          <Tooltip content="Undo last layout or style change (Cmd/Ctrl + Z)" placement="bottom">
            <button onClick={undo} disabled={past.length === 0} style={{ ...btnStyle(false), display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Undo2 size={13} />
              <span>Undo</span>
            </button>
          </Tooltip>
          <Tooltip content="Redo undone change (Cmd/Ctrl + Shift + Z)" placement="bottom">
            <button onClick={redo} disabled={future.length === 0} style={{ ...btnStyle(false), display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Redo2 size={13} />
              <span>Redo</span>
            </button>
          </Tooltip>
          <Tooltip
            title="Shareable Layout URL"
            content="Compresses your entire layout into the URL hash and copies a link anyone can open."
            placement="bottom"
          >
            <button onClick={shareLink} style={{ ...btnStyle(sharedCopied), display: "inline-flex", alignItems: "center", gap: 5 }}>
              {sharedCopied ? <Check size={13} /> : <Link2 size={13} />}
              <span>{sharedCopied ? "Link Copied!" : "Share Link"}</span>
            </button>
          </Tooltip>
          <Tooltip content="Discard edits and restore the current template's default layout" placement="bottom">
            <button onClick={resetToTemplate} style={btnStyle(false)}>
              Reset
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Row 2: Dual-Audience Studio / Pro Mode Bar + Viewport Simulation */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", padding: "10px 14px", background: "var(--cs-panel)", border: "1px solid var(--cs-border)", borderRadius: 10 }}>
        <Tooltip
          title="Workspace Mode: Studio vs Pro"
          content="Studio keeps one calm interactive terminal with quick style presets. Pro unlocks 3× responsive Matrix, DevTools geometry boxes, custom $Tokens, partial borders & ir.json."
          placement="bottom"
        >
          <div style={{ display: "inline-flex", background: "var(--cs-input)", borderRadius: 7, padding: 3, border: "1px solid var(--cs-border)" }}>
            <button onClick={() => switchWorkspaceMode("studio")} style={{ ...segBtn(workspaceMode === "studio"), display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Sparkles size={12} />
              <span>Studio</span>
            </button>
            <button onClick={() => switchWorkspaceMode("pro")} style={{ ...segBtn(workspaceMode === "pro"), display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Terminal size={12} />
              <span>Pro</span>
            </button>
          </div>
        </Tooltip>

        {(desktopConnected || previewMode === "pty") && (
          <Tooltip
            title="Preview Engine: WASM vs Native PTY"
            content="Switch between browser Go WASM layout sandbox and real compiled Go binary execution over xpty."
            placement="bottom"
          >
            <div style={{ display: "inline-flex", background: "var(--cs-input)", borderRadius: 7, padding: 3, border: "1px solid var(--cs-border)" }}>
              <button onClick={() => setPreviewMode("wasm")} style={segBtn(previewMode === "wasm")}>
                WASM
              </button>
              <button
                onClick={() => {
                  setViewMode("single");
                  setPreviewMode("pty");
                }}
                style={segBtn(previewMode === "pty")}
              >
                Native PTY
              </button>
            </div>
          </Tooltip>
        )}

        {/* Viewport Presets (always visible in Studio, and paired with Matrix toggle in Pro) */}
        <div style={{ display: "inline-flex", background: "var(--cs-input)", borderRadius: 7, padding: 3, border: "1px solid var(--cs-border)" }}>
          {workspaceMode === "pro" && (
            <Tooltip
              title="Responsive Matrix (3× Sizes)"
              content="Preview Compact (58×18), Standard (80×24), and Wide (116×30) terminals side-by-side to catch clipping bugs early."
              placement="bottom"
            >
              <button onClick={() => setViewMode("matrix")} style={segBtn(viewMode === "matrix")}>
                Matrix (3×)
              </button>
            </Tooltip>
          )}
          {MATRIX_PRESETS.map((p) => {
            const active = viewMode === "single" && cols === p.cols && rows === p.rows;
            return (
              <button
                key={p.title}
                onClick={() => {
                  setViewMode("single");
                  setCols(p.cols);
                  setRows(p.rows);
                }}
                style={segBtn(active)}
              >
                {p.title.split(" ")[0]} ({p.cols}×{p.rows})
              </button>
            );
          })}
        </div>

        {/* Light / Dark Polarity Toggle */}
        <Tooltip
          title="Studio Polarity (Light / Dark)"
          content="Switch the workspace polarity between Dark Mode and Charm.land-inspired Light Mode."
          placement="bottom"
        >
          <button
            onClick={() => setAppMode((m) => (m === "dark" ? "light" : "dark"))}
            style={{ ...btnStyle(false), display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            {appMode === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            <span>{appMode === "dark" ? "Light UI" : "Dark UI"}</span>
          </button>
        </Tooltip>

        {/* Terminal Theme Palette Selector */}
        <Tooltip
          title="Terminal Theme"
          content="Simulates light or dark terminal backgrounds, updates LightDark tokens automatically, or lets you upload/build your own theme."
          placement="bottom"
        >
          <label style={inlineLbl}>
            <span>Theme:</span>
            <select
              value={paletteId}
              onChange={(e) => {
                const nextId = e.target.value;
                if (nextId === "__custom__") {
                  onOpenSettings();
                  return;
                }
                selectPalette(nextId);
              }}
              style={{ ...inputStyle, width: "auto", padding: "5px 9px" }}
            >
              {allPalettes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="__custom__">Choose your own (Upload / Custom)…</option>
            </select>
          </label>
        </Tooltip>

        {/* Color Profile Simulator */}
        <Tooltip
          title="Color Profile Simulator"
          content="Tests how your app degrades on limited terminals (256 colors, 16 colors, or plain ASCII) using charmbracelet/colorprofile."
          placement="bottom"
        >
          <label style={inlineLbl}>
            <span>Profile:</span>
            <select
              value={colorProfile}
              onChange={(e) => setColorProfile(e.target.value as ColorProfile)}
              style={{ ...inputStyle, width: "auto", padding: "5px 9px" }}
            >
              <option value="truecolor">TrueColor (24-bit)</option>
              <option value="ansi256">ANSI 256</option>
              <option value="ansi16">ANSI 16</option>
              <option value="ascii">ASCII (No Color)</option>
            </select>
          </label>
        </Tooltip>

        {workspaceMode === "pro" && viewMode === "matrix" && (
          <Tooltip content="Shrink font size slightly so all 3 terminal sizes fit comfortably in view" placement="bottom">
            <button onClick={() => setMatrixDense((v) => !v)} style={btnStyle(matrixDense)}>
              {matrixDense ? "Zoom: Compact" : "Zoom: Normal"}
            </button>
          </Tooltip>
        )}

        {ir.overlays[0] && (
          <Tooltip
            title="Floating Overlay Layer"
            content="Show or hide your floating popup/toast layer over the main terminal layout."
            placement="bottom"
          >
            <button onClick={() => toggleOverlay(ir.overlays[0].id)} style={btnStyle(showModal)}>
              Overlay: {showModal ? "ON" : "OFF"}
            </button>
          </Tooltip>
        )}

        {workspaceMode === "pro" && (
          <Tooltip
            title="Box-Model DevTools"
            content="Highlights Margin (orange), Padding (green), and Content (blue) cell boundaries directly on the selected pane."
            placement="bottom"
          >
            <button onClick={() => setShowOverlay((v) => !v)} style={btnStyle(showOverlay)}>
              DevTools: {showOverlay ? "ON" : "OFF"}
            </button>
          </Tooltip>
        )}

        <button
          onClick={() => setTooltipsEnabled((v) => !v)}
          title={tooltipsEnabled ? "Turn off beginner hover tooltips and ? icons" : "Turn hover tooltips back on"}
          style={btnStyle(tooltipsEnabled)}
        >
          Tips: {tooltipsEnabled ? "ON" : "OFF"}
        </button>
      </div>
    </>
  );
}
