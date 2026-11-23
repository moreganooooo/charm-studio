import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Code2, Lock, Moon, RotateCcw, Sun, Unlock } from "lucide-react";
import { useStudioStore } from "../store/studioStore";
import { STYLE_PRESETS } from "../stylePresets";
import { HelpDot, Tooltip } from "../Tooltip";
import { defaultWidgetData, type ContentType, type IRStyle, type MouseMode, type OverlayAnchor, type ViewCursorMode } from "../types";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import { WidgetDataEditor } from "../WidgetDataEditor";
import {
  btnStyle,
  checkLbl,
  chkAcc,
  dot,
  inputStyle,
  labelCol,
  microTag,
  miniBtn,
} from "./studioStyles";

const QUAD_LABELS = ["Top", "Right", "Bottom", "Left"] as const;

interface Props {
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function PropertyInspector({ scrollRef }: Props) {
  const {
    ir,
    selectedId,
    selectedNode,
    selectedOverlay,
    selectedStyle,
    effectivePalette,
    workspaceMode,
    showAdvancedStyle,
    setShowAdvancedStyle,
    renameNode,
    updateNode,
    updateView,
    updateSelectedStyle,
    reenableSync,
    toggleOverrideDynamicProp,
    openCodeForSelection,
    updateQuad,
    toggleBorderEdge,
    setOverlayAnchor,
    forkStyle,
    pruneStyles,
    addToken,
    updateToken,
    markStep,
    inspectorFocusRequest,
    clearInspectorFocusRequest,
  } = useStudioStore();

  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  const [renameDraft, setRenameDraft] = useState(selectedId);
  const [newTokenName, setNewTokenName] = useState("");
  const [pruneNote, setPruneNote] = useState<string | null>(null);
  const [focusBurstProp, setFocusBurstProp] = useState<"width" | "padding" | null>(null);

  const widthModeRef = useRef<HTMLSelectElement>(null);
  const widthValueRef = useRef<HTMLInputElement>(null);
  const paddingRightRef = useRef<HTMLInputElement>(null);
  const paddingSectionRef = useRef<HTMLDivElement>(null);

  if (prevSelectedId !== selectedId) {
    setPrevSelectedId(selectedId);
    setRenameDraft(selectedId);
  }

  useEffect(() => {
    if (!inspectorFocusRequest) return;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const targetProp = inspectorFocusRequest.property;
    const t = setTimeout(() => {
      if (targetProp === "width") {
        const el =
          widthValueRef.current && !widthValueRef.current.disabled
            ? widthValueRef.current
            : widthModeRef.current;
        el?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "center" });
        el?.focus();
      } else {
        paddingSectionRef.current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "center",
        });
        paddingRightRef.current?.focus();
      }
      setFocusBurstProp(targetProp);
      clearInspectorFocusRequest();
    }, 30);
    const tEnd = setTimeout(() => setFocusBurstProp(null), 260);
    return () => {
      clearTimeout(t);
      clearTimeout(tEnd);
    };
  }, [inspectorFocusRequest, clearInspectorFocusRequest]);

  const tokenKeys = Object.keys(ir.tokens);
  const styleKeys = Object.keys(ir.styles);
  const isProUI = workspaceMode === "pro" || showAdvancedStyle;

  const styleKey = selectedNode?.style ?? "";
  const nodeKey = selectedNode ? `node:${selectedNode.id}` : "";
  const fileSyncDisabled = Boolean(ir.importedGo?.fileSyncDisabled);
  const nodeSyncDisabled = Boolean(nodeKey && ir.lockReasons?.[nodeKey] === "sync-disabled");
  const styleSyncDisabled = Boolean(styleKey && ir.lockReasons?.[styleKey] === "sync-disabled");
  const anySyncDisabled = fileSyncDisabled || nodeSyncDisabled || styleSyncDisabled;
  const syncDisableTarget = fileSyncDisabled ? "*" : nodeSyncDisabled ? nodeKey : styleSyncDisabled ? styleKey : "";

  const styleLocks = styleKey ? ir.lockedProps?.[styleKey] ?? [] : [];
  const nodeLocks = nodeKey ? ir.lockedProps?.[nodeKey] ?? [] : [];
  const styleDynamicExprs = styleKey ? ir.dynamicExprs?.[styleKey] ?? {} : {};
  const nodeDynamicExprs = nodeKey ? ir.dynamicExprs?.[nodeKey] ?? {} : {};
  const styleOverridden = styleKey ? ir.overriddenProps?.[styleKey] ?? [] : [];
  const nodeOverridden = nodeKey ? ir.overriddenProps?.[nodeKey] ?? [] : [];

  const isAllStyleLocked = fileSyncDisabled || nodeSyncDisabled || styleSyncDisabled || styleLocks.includes("*");
  const isAllNodeLocked = fileSyncDisabled || nodeSyncDisabled || nodeLocks.includes("*");
  const isPropLocked = (prop: string) => isAllStyleLocked || styleLocks.includes(prop);
  const isNodePropLocked = (prop: string) => isAllNodeLocked || nodeLocks.includes(prop);

  const hasWidgetDataUI =
    selectedNode?.contentType === "bubble:list" ||
    selectedNode?.contentType === "bubble:table" ||
    selectedNode?.contentType === "bubble:textinput" ||
    selectedNode?.contentType === "bubble:viewport" ||
    selectedNode?.contentType === "huh:form";

  const commitRename = () => {
    if (!selectedNode || fileSyncDisabled || nodeSyncDisabled) return;
    const renamed = renameNode(selectedNode.id, renameDraft);
    setRenameDraft(renamed);
  };

  return (
    <div ref={scrollRef} style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, fontSize: 13 }}>
      {/* Rename Node Header */}
      {selectedNode && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9, background: "var(--cs-card-alt)", border: "1px solid var(--cs-border)" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--cs-text-dim)" }}>ID:</span>
          <input
            value={renameDraft}
            disabled={fileSyncDisabled || nodeSyncDisabled}
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
            }}
            style={{ ...inputStyle, padding: "4px 7px", fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          />
          <button
            onClick={commitRename}
            disabled={fileSyncDisabled || nodeSyncDisabled || renameDraft.trim() === selectedNode.id || !renameDraft.trim()}
            style={miniBtn}
          >
            Rename
          </button>
        </div>
      )}

      {/* // @tui:sync-disable Lock Card */}
      {anySyncDisabled && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 9,
            background: "rgba(245, 158, 11, 0.09)",
            border: "1px solid rgba(245, 158, 11, 0.38)",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>
              <Lock size={13} />
              <span>Locked · // @tui:sync-disable</span>
            </span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--cs-text-muted)", lineHeight: 1.45 }}>
            {fileSyncDisabled
              ? "This imported file has a top-of-file // @tui:sync-disable marker. Canvas writes are locked to prevent silent overwrites."
              : `This ${nodeSyncDisabled ? "layout block" : "style symbol"} carries // @tui:sync-disable in Go source and stays untouched during sync.`}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => reenableSync(syncDisableTarget)}
              style={{
                ...miniBtn,
                padding: "5px 10px",
                fontSize: 11.5,
                fontWeight: 600,
                color: "#fbbf24",
                borderColor: "rgba(245, 158, 11, 0.45)",
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Unlock size={12} />
              <span>Re-enable Sync</span>
            </button>
            <button
              onClick={() => openCodeForSelection(ir.importedGo ? "raw" : "theme_gen")}
              style={{
                ...miniBtn,
                padding: "5px 10px",
                fontSize: 11.5,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <Code2 size={12} />
              <span>View Raw Go</span>
            </button>
          </div>
        </div>
      )}

      {/* Declarative Bubble Tea v2 tea.View Controls when Root is Selected */}
      {selectedNode && selectedNode.id === ir.root.id && (
        <Section
          title="Declarative tea.View"
          badge="bubbletea/v2"
          subtitle="Terminal session & input flags emitted directly on the returned tea.View struct in view.go."
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={labelCol}>
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                Window Title
                <HelpDot
                  title="tea.View.WindowTitle"
                  content="Sets the host terminal tab/window title declaratively via v.WindowTitle."
                />
              </span>
              <input
                value={ir.view?.windowTitle ?? ""}
                placeholder="Charm Studio TUI"
                onChange={(e) => updateView({ windowTitle: e.target.value })}
                style={inputStyle}
              />
            </label>

            <label style={labelCol}>
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                Mouse Mode
                <HelpDot
                  title="tea.View.MouseMode"
                  content="Replaces v1 tea.WithMouseCellMotion() / WithMouseAllMotion() startup flags with declarative v.MouseMode."
                />
              </span>
              <select
                value={ir.view?.mouseMode ?? "cell"}
                onChange={(e) => updateView({ mouseMode: e.target.value as MouseMode })}
                style={inputStyle}
              >
                <option value="cell">MouseModeCellMotion (Clicks &amp; Scroll)</option>
                <option value="all">MouseModeAllMotion (Hover &amp; Drag)</option>
                <option value="none">MouseModeNone (Keyboard Only)</option>
              </select>
            </label>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 10 }}>
            <label style={checkLbl}>
              <input
                type="checkbox"
                checked={ir.view?.altScreen ?? true}
                onChange={(e) => updateView({ altScreen: e.target.checked })}
                style={chkAcc}
              />
              AltScreen
            </label>
            <label style={checkLbl}>
              <input
                type="checkbox"
                checked={!!ir.view?.reportFocus}
                onChange={(e) => updateView({ reportFocus: e.target.checked })}
                style={chkAcc}
              />
              ReportFocus
            </label>
            <label style={checkLbl}>
              <input
                type="checkbox"
                checked={!!ir.view?.disableBracketedPasteMode}
                onChange={(e) => updateView({ disableBracketedPasteMode: e.target.checked })}
                style={chkAcc}
              />
              DisableBracketedPasteMode
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: (ir.view?.cursorMode ?? "auto") === "manual" ? "1.4fr 0.8fr 0.8fr" : "1fr", gap: 10, marginTop: 10 }}>
            <label style={labelCol}>
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                Cursor Mode
                <HelpDot
                  title="tea.View.Cursor"
                  content="Bubble Tea v2 emits v.Cursor (*tea.Cursor): auto binds to the first textinput.Model.Cursor(), manual emits tea.NewCursor(x, y), and none emits nil."
                />
              </span>
              <select
                value={ir.view?.cursorMode ?? "auto"}
                onChange={(e) => updateView({ cursorMode: e.target.value as ViewCursorMode })}
                style={inputStyle}
              >
                <option value="auto">Auto (Focused TextInput)</option>
                <option value="manual">Manual (tea.NewCursor)</option>
                <option value="none">None (nil / Hidden)</option>
              </select>
            </label>
            {(ir.view?.cursorMode ?? "auto") === "manual" && (
              <>
                <label style={labelCol}>
                  <span>Cursor X</span>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={ir.view?.cursorX ?? 0}
                    onChange={(e) => updateView({ cursorX: Math.max(0, +e.target.value) })}
                    style={inputStyle}
                  />
                </label>
                <label style={labelCol}>
                  <span>Cursor Y</span>
                  <input
                    type="number"
                    min={0}
                    max={80}
                    value={ir.view?.cursorY ?? 0}
                    onChange={(e) => updateView({ cursorY: Math.max(0, +e.target.value) })}
                    style={inputStyle}
                  />
                </label>
              </>
            )}
          </div>
        </Section>
      )}

      {selectedNode && selectedNode.kind !== "Box" && (
        <Section
          title="Container Layout"
          badge={selectedNode.id}
          subtitle={`Controls how panes align inside ${selectedNode.kind === "JoinHorizontal" ? "this horizontal Row" : "this vertical Stack"}.`}
        >
          <label style={labelCol}>
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              Join Alignment
              <HelpDot
                title="Join Alignment"
                content="Controls whether smaller panes align to the Start (top/left), Center, or End (bottom/right) of this container."
              />
            </span>
            <select
              value={selectedNode.joinAlign ?? "start"}
              disabled={fileSyncDisabled || nodeSyncDisabled}
              onChange={(e) =>
                updateNode(selectedNode.id, (n) => ({
                  ...n,
                  joinAlign: e.target.value as "start" | "center" | "end",
                }))
              }
              style={inputStyle}
            >
              <option value="start">{selectedNode.kind === "JoinHorizontal" ? "Top (Start)" : "Left (Start)"}</option>
              <option value="center">Center</option>
              <option value="end">{selectedNode.kind === "JoinHorizontal" ? "Bottom (End)" : "Right (End)"}</option>
            </select>
          </label>

          {selectedNode.id !== ir.root.id && isProUI && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label style={labelCol}>
                <span>Width Mode</span>
                <select
                  value={selectedNode.width?.mode ?? "fill"}
                  disabled={isNodePropLocked("width")}
                  onChange={(e) =>
                    updateNode(selectedNode.id, (n) => ({
                      ...n,
                      width: { ...n.width, mode: e.target.value as "fixed" | "fill" | "fit", value: n.width?.value ?? 26, weight: n.width?.weight ?? 1 },
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="fill">Fill (stretch)</option>
                  <option value="fixed">Fixed cols</option>
                </select>
              </label>
              <label style={labelCol}>
                <span>Collapse Below (cols)</span>
                <input
                  type="number"
                  min={0}
                  max={140}
                  disabled={fileSyncDisabled || nodeSyncDisabled}
                  value={selectedNode.width?.collapseBelow ?? 0}
                  onChange={(e) =>
                    updateNode(selectedNode.id, (n) => ({
                      ...n,
                      width: { ...(n.width ?? { mode: "fill" }), collapseBelow: Math.max(0, +e.target.value) },
                    }))
                  }
                  style={inputStyle}
                />
              </label>
            </div>
          )}
        </Section>
      )}

      {selectedNode && selectedNode.kind === "Box" && selectedStyle && (
        <>
          <Section
            title="Component & Sizing"
            badge={`#${selectedNode.id}`}
            subtitle="Swap widget types, resize rules, or overlay anchoring."
          >
            <label style={{ ...labelCol, marginBottom: 10 }}>
              <span style={{ display: "inline-flex", alignItems: "center" }}>
                Component Type
                <HelpDot
                  title="Component Type"
                  content="Swaps what renders inside this box: plain text, interactive Bubbles/Huh widgets, Glamour Markdown, Gum prompt, or Wish SSH banner."
                />
              </span>
              <select
                value={selectedNode.contentType ?? "text"}
                disabled={fileSyncDisabled || nodeSyncDisabled}
                onChange={(e) => {
                  const nextCt = e.target.value as ContentType;
                  const nextWD = defaultWidgetData(nextCt);
                  updateNode(selectedNode.id, (n) => ({
                    ...n,
                    contentType: nextCt,
                    widgetData: Object.keys(nextWD).length > 0 ? nextWD : n.widgetData,
                  }));
                }}
                style={inputStyle}
              >
                <optgroup label="Lip Gloss">
                  <option value="text">Plain Text (editable below)</option>
                </optgroup>
                <optgroup label="Bubbles (bubbles/v2)">
                  <option value="bubble:list">Bubbles: List (interactive ↑/↓, /)</option>
                  <option value="bubble:table">Bubbles: Table (interactive ↑/↓, j/k)</option>
                  <option value="bubble:viewport">Bubbles: Viewport (scrollable ↑/↓)</option>
                  <option value="bubble:textinput">Bubbles: TextInput (type live!)</option>
                </optgroup>
                <optgroup label="Huh (charmbracelet/huh)">
                  <option value="huh:form">Huh: Interactive Form (Tab, type, ←/→)</option>
                </optgroup>
                <optgroup label="Glamour &amp; Glow">
                  <option value="glamour:markdown">Glamour: Styled Markdown (↑/↓ scroll)</option>
                </optgroup>
                <optgroup label="Gum (charmbracelet/gum)">
                  <option value="gum:choose">Gum: Choose &amp; Filter (↑/↓, Space, type)</option>
                  <option value="gum:confirm">Gum: Confirm Prompt (←/→, y/n)</option>
                </optgroup>
                <optgroup label="Wish (charmbracelet/wish)">
                  <option value="wish:ssh">Wish: SSH Session Header (r to cycle)</option>
                </optgroup>
              </select>
            </label>

            {selectedOverlay && (
              <label style={{ ...labelCol, marginBottom: 10 }}>
                <span>Floating Layer Position</span>
                <select
                  value={selectedOverlay.anchor ?? "center"}
                  onChange={(e) => setOverlayAnchor(selectedOverlay.id, e.target.value as OverlayAnchor)}
                  style={inputStyle}
                >
                  <option value="center">Center Modal</option>
                  <option value="top-right">Top-Right Toast</option>
                  <option value="bottom-bar">Bottom Command Bar</option>
                  <option value="bottom-right">Bottom-Right Notification</option>
                </select>
              </label>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <label style={{ ...labelCol, opacity: isNodePropLocked("width") ? 0.65 : 1 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  {workspaceMode === "studio" ? "Width Behavior" : "Width Mode"}
                  {isNodePropLocked("width") && <Lock size={10} color="#fbbf24" />}
                  <HelpDot
                    title="Width Mode"
                    content="Fixed sets exact terminal columns; Fill stretches to share remaining space; Fit hugs the content."
                  />
                </span>
                <select
                  ref={widthModeRef}
                  className={focusBurstProp === "width" && selectedNode.width?.mode !== "fixed" ? "cs-focus-burst" : undefined}
                  value={selectedNode.width?.mode ?? "fill"}
                  disabled={isNodePropLocked("width")}
                  onChange={(e) =>
                    updateNode(selectedNode.id, (n) => ({
                      ...n,
                      width: { ...n.width, mode: e.target.value as "fixed" | "fill" | "fit", value: n.width?.value ?? 26, weight: n.width?.weight ?? 1 },
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="fixed">Fixed cols</option>
                  <option value="fill">Stretch (Fill)</option>
                  <option value="fit">Hug content (Fit)</option>
                </select>
              </label>

              {selectedNode.width?.mode === "fixed" ? (
                <label style={{ ...labelCol, opacity: isNodePropLocked("width") ? 0.65 : 1 }}>
                  <FieldLockLabel text="Width (Cols)" locked={isNodePropLocked("width")} />
                  <input
                    ref={widthValueRef}
                    className={focusBurstProp === "width" ? "cs-focus-burst" : undefined}
                    type="number"
                    min={4}
                    max={120}
                    disabled={isNodePropLocked("width")}
                    value={selectedNode.width.value ?? 26}
                    onChange={(e) =>
                      updateNode(selectedNode.id, (n) => ({ ...n, width: { ...n.width!, value: +e.target.value } }))
                    }
                    style={inputStyle}
                  />
                </label>
              ) : isProUI ? (
                <label style={{ ...labelCol, opacity: isNodePropLocked("width") ? 0.65 : 1 }}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    Width Weight
                    <HelpDot title="Width Weight" content="Weight 2 gets twice as much extra width as weight 1." />
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    disabled={isNodePropLocked("width")}
                    value={selectedNode.width?.weight ?? 1}
                    onChange={(e) =>
                      updateNode(selectedNode.id, (n) => ({ ...n, width: { ...(n.width ?? { mode: "fill" }), weight: Math.max(1, +e.target.value) } }))
                    }
                    style={inputStyle}
                  />
                </label>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6, fontSize: 11.5, color: "var(--cs-text-dim)" }}>
                  Auto-fills row
                </div>
              )}

              <label style={{ ...labelCol, opacity: isNodePropLocked("height") ? 0.65 : 1 }}>
                <FieldLockLabel text={workspaceMode === "studio" ? "Height Behavior" : "Height Mode"} locked={isNodePropLocked("height")} />
                <select
                  value={selectedNode.height?.mode ?? "fill"}
                  disabled={isNodePropLocked("height")}
                  onChange={(e) =>
                    updateNode(selectedNode.id, (n) => ({
                      ...n,
                      height: { ...n.height, mode: e.target.value as "fixed" | "fill" | "fit", value: n.height?.value ?? 3, weight: n.height?.weight ?? 1 },
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="fill">Stretch (Fill)</option>
                  <option value="fixed">Fixed rows</option>
                  <option value="fit">Hug content (Fit)</option>
                </select>
              </label>

              {selectedNode.height?.mode === "fixed" ? (
                <label style={{ ...labelCol, opacity: isNodePropLocked("height") ? 0.65 : 1 }}>
                  <FieldLockLabel text="Height (Rows)" locked={isNodePropLocked("height")} />
                  <input
                    type="number"
                    min={1}
                    max={40}
                    disabled={isNodePropLocked("height")}
                    value={selectedNode.height.value ?? 3}
                    onChange={(e) =>
                      updateNode(selectedNode.id, (n) => ({ ...n, height: { ...n.height!, value: +e.target.value } }))
                    }
                    style={inputStyle}
                  />
                </label>
              ) : isProUI ? (
                <label style={{ ...labelCol, opacity: isNodePropLocked("height") ? 0.65 : 1 }}>
                  <span>Height Weight</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    disabled={isNodePropLocked("height")}
                    value={selectedNode.height?.weight ?? 1}
                    onChange={(e) =>
                      updateNode(selectedNode.id, (n) => ({ ...n, height: { ...(n.height ?? { mode: "fill" }), weight: Math.max(1, +e.target.value) } }))
                    }
                    style={inputStyle}
                  />
                </label>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6, fontSize: 11.5, color: "var(--cs-text-dim)" }}>
                  Auto-fills column
                </div>
              )}
            </div>

            {nodeDynamicExprs.width && (
              <DynamicGoFieldNotice
                label="Width"
                expr={nodeDynamicExprs.width}
                isLocked={!nodeOverridden.includes("width") && nodeLocks.includes("width")}
                onToggleOverride={(overrideStatic) => toggleOverrideDynamicProp(nodeKey, "width", overrideStatic)}
              />
            )}
            {nodeDynamicExprs.height && (
              <DynamicGoFieldNotice
                label="Height"
                expr={nodeDynamicExprs.height}
                isLocked={!nodeOverridden.includes("height") && nodeLocks.includes("height")}
                onToggleOverride={(overrideStatic) => toggleOverrideDynamicProp(nodeKey, "height", overrideStatic)}
              />
            )}

            {isProUI && (
              <label style={{ ...labelCol, marginTop: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  Responsive Breakpoint — Collapse Below (cols)
                  <HelpDot
                    title="Responsive Collapse"
                    content="Automatically hides this pane when the terminal is narrower than N columns (0 = always shown)."
                  />
                </span>
                <input
                  type="number"
                  min={0}
                  max={140}
                  disabled={fileSyncDisabled || nodeSyncDisabled}
                  value={selectedNode.width?.collapseBelow ?? 0}
                  onChange={(e) =>
                    updateNode(selectedNode.id, (n) => ({
                      ...n,
                      width: { ...(n.width ?? { mode: "fill" }), collapseBelow: Math.max(0, +e.target.value) },
                    }))
                  }
                  style={inputStyle}
                />
              </label>
            )}
          </Section>

          {hasWidgetDataUI && (
            <Section
              title="Widget Data & Fields"
              badge={selectedNode.contentType?.replace("bubble:", "")}
              subtitle="Customize items, table columns/rows, or form fields—updates preview & generated Go code."
            >
              <WidgetDataEditor
                node={selectedNode}
                onChangeWidgetData={(widgetData) => {
                  updateNode(selectedNode.id, (n) => ({ ...n, widgetData }));
                  markStep("styledOrInteracted");
                }}
                onChangeContent={(content) => {
                  updateNode(selectedNode.id, (n) => ({ ...n, content }));
                  markStep("styledOrInteracted");
                }}
              />
            </Section>
          )}

          {/* Style Section */}
          <Section
            title="Look & Style"
            badge={selectedNode.style}
            extraBadge={
              styleLocks.length > 0 && !anySyncDisabled ? (
                <span
                  title="Dynamic Go expression(s) detected in imported source"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#fbbf24",
                  }}
                >
                  <Lock size={10} />
                  <span>Dynamic Go</span>
                </span>
              ) : undefined
            }
            subtitle="Apply a 1-click preset or customize borders, colors & spacing."
            action={
              isProUI ? (
                <Tooltip title="Fork Style" content="Clones the current style into a brand-new named style for just this box.">
                  <button onClick={() => forkStyle(selectedNode.id)} style={miniBtn}>
                    Fork Style
                  </button>
                </Tooltip>
              ) : undefined
            }
          >
            {styleLocks.length > 0 && !anySyncDisabled && selectedNode.style && (
              <div
                style={{
                  marginBottom: 12,
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "rgba(245, 158, 11, 0.08)",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: "#fbbf24" }}>
                    <Lock size={12} />
                    <span>
                      {styleLocks.includes("*")
                        ? "Dynamic Go style — all fields locked"
                        : `Dynamic Go locked: ${styleLocks.join(", ")}`}
                    </span>
                  </span>
                  <button
                    onClick={() => openCodeForSelection(ir.importedGo ? "raw" : "theme_gen")}
                    style={{
                      ...miniBtn,
                      padding: "3px 8px",
                      fontSize: 11,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Code2 size={11} />
                    <span>View Raw Go</span>
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--cs-text-muted)", lineHeight: 1.4 }}>
                  Computed Go expressions are read-only by default. Override individual fields below to emit a static literal instead.
                </div>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={microTag}>1-CLICK STYLE PRESETS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    disabled={isAllStyleLocked}
                    onClick={() => updateSelectedStyle(preset.patch)}
                    title={isAllStyleLocked ? "Locked by // @tui:sync-disable or Dynamic Go" : preset.description}
                    style={{
                      ...miniBtn,
                      padding: "6px 4px",
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: 11,
                      opacity: isAllStyleLocked ? 0.5 : 1,
                      cursor: isAllStyleLocked ? "not-allowed" : "pointer",
                    }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              {isProUI && (
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                  <label style={{ ...labelCol, flex: 1 }}>
                    <span>Assigned Style</span>
                    <select
                      value={selectedNode.style ?? ""}
                      disabled={fileSyncDisabled || nodeSyncDisabled}
                      onChange={(e) => updateNode(selectedNode.id, (n) => ({ ...n, style: e.target.value }))}
                      style={inputStyle}
                    >
                      {styleKeys.map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => {
                      const removedCount = pruneStyles();
                      setPruneNote(removedCount > 0 ? `Cleaned ${removedCount}` : "None unused");
                      setTimeout(() => setPruneNote(null), 1800);
                    }}
                    title="Remove unused styles from theme_gen.go"
                    style={{ ...miniBtn, padding: "6px 8px" }}
                  >
                    {pruneNote || "Prune"}
                  </button>
                </div>
              )}

              <div>
                <label style={{ ...labelCol, opacity: isPropLocked("border") ? 0.65 : 1 }}>
                  <FieldLockLabel text="Border Shape" locked={isPropLocked("border")} />
                  <select
                    value={selectedStyle.border}
                    disabled={isPropLocked("border")}
                    onChange={(e) => updateSelectedStyle({ border: e.target.value as IRStyle["border"] })}
                    style={inputStyle}
                  >
                    <option value="rounded">RoundedBorder (╭─╮)</option>
                    <option value="normal">NormalBorder (┌─┐)</option>
                    <option value="thick">ThickBorder (┏━┓)</option>
                    <option value="double">DoubleBorder (╔═╗)</option>
                    <option value="hidden">Hidden (reserves border space)</option>
                    <option value="none">None</option>
                  </select>
                </label>
                {styleDynamicExprs.border && styleKey && (
                  <DynamicGoFieldNotice
                    label="Border"
                    expr={styleDynamicExprs.border}
                    isLocked={!styleOverridden.includes("border") && styleLocks.includes("border")}
                    onToggleOverride={(overrideStatic) => toggleOverrideDynamicProp(styleKey, "border", overrideStatic)}
                  />
                )}
              </div>

              {isProUI && selectedStyle.border !== "none" && (
                <div style={{ opacity: isPropLocked("border") ? 0.65 : 1 }}>
                  <div style={{ ...microTag, display: "flex", alignItems: "center", gap: 4 }}>
                    <span>VISIBLE BORDER EDGES</span>
                    {isPropLocked("border") && <Lock size={10} color="#fbbf24" />}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                    {QUAD_LABELS.map((lbl, i) => {
                      const active = (selectedStyle.borderEdges ?? [true, true, true, true])[i];
                      return (
                        <button key={lbl} disabled={isPropLocked("border")} onClick={() => toggleBorderEdge(i)} style={btnStyle(active)}>
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 6 }}>
                {(["borderColor", "fg", "bg"] as const).map((prop) => {
                  const label = prop === "fg" ? "Text" : prop === "bg" ? "Fill" : "Border";
                  const value = selectedStyle[prop] || "";
                  const token = value.startsWith("$") ? ir.tokens[value.slice(1)] : undefined;
                  const hex = token ? token[effectivePalette.darkBG ? "dark" : "light"] : value;
                  const locked = isPropLocked(prop);
                  return (
                    <Fragment key={prop}>
                      <FieldLockLabel text={label} locked={locked} />
                      <select aria-label={`${label} color`} value={value} disabled={locked}
                        onChange={(e) => updateSelectedStyle({ [prop]: e.target.value })} style={inputStyle}>
                        <option value="">{prop === "bg" ? "None" : "Default"}</option>
                        {value && !token && <option value={value}>{value}</option>}
                        {tokenKeys.map((key) => <option key={key} value={`$${key}`}>${key}</option>)}
                      </select>
                      <ColorSwatchPicker label={label} value={hex} disabled={locked}
                        onChange={(color) => updateSelectedStyle({ [prop]: color })} />
                    </Fragment>
                  );
                })}
              </div>

              {(["borderColor", "fg", "bg"] as const).map((colorProp) =>
                styleDynamicExprs[colorProp] && styleKey ? (
                  <DynamicGoFieldNotice
                    key={colorProp}
                    label={colorProp === "borderColor" ? "Border Color" : colorProp === "fg" ? "Foreground" : "Background"}
                    expr={styleDynamicExprs[colorProp]}
                    isLocked={!styleOverridden.includes(colorProp) && styleLocks.includes(colorProp)}
                    onToggleOverride={(overrideStatic) => toggleOverrideDynamicProp(styleKey, colorProp, overrideStatic)}
                  />
                ) : null
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={{ ...labelCol, opacity: isPropLocked("alignH") ? 0.65 : 1 }}>
                  <FieldLockLabel text="Align H" locked={isPropLocked("alignH")} />
                  <select value={selectedStyle.alignH ?? "left"} disabled={isPropLocked("alignH")} onChange={(e) => updateSelectedStyle({ alignH: e.target.value as IRStyle["alignH"] })} style={inputStyle}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label style={{ ...labelCol, opacity: isPropLocked("alignV") ? 0.65 : 1 }}>
                  <FieldLockLabel text="Align V" locked={isPropLocked("alignV")} />
                  <select value={selectedStyle.alignV ?? "top"} disabled={isPropLocked("alignV")} onChange={(e) => updateSelectedStyle({ alignV: e.target.value as IRStyle["alignV"] })} style={inputStyle}>
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
              </div>

              {(["alignH", "alignV"] as const).map((alignProp) =>
                styleDynamicExprs[alignProp] && styleKey ? (
                  <DynamicGoFieldNotice
                    key={alignProp}
                    label={alignProp === "alignH" ? "AlignHorizontal" : "AlignVertical"}
                    expr={styleDynamicExprs[alignProp]}
                    isLocked={!styleOverridden.includes(alignProp) && styleLocks.includes(alignProp)}
                    onToggleOverride={(overrideStatic) => toggleOverrideDynamicProp(styleKey, alignProp, overrideStatic)}
                  />
                ) : null
              )}

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
                <label style={{ ...checkLbl, opacity: isPropLocked("bold") ? 0.65 : 1 }}><input type="checkbox" disabled={isPropLocked("bold")} checked={selectedStyle.bold} onChange={(e) => updateSelectedStyle({ bold: e.target.checked })} style={chkAcc} /> Bold{isPropLocked("bold") && <Lock size={10} color="#fbbf24" />}</label>
                <label style={{ ...checkLbl, opacity: isPropLocked("italic") ? 0.65 : 1 }}><input type="checkbox" disabled={isPropLocked("italic")} checked={!!selectedStyle.italic} onChange={(e) => updateSelectedStyle({ italic: e.target.checked })} style={chkAcc} /> Italic{isPropLocked("italic") && <Lock size={10} color="#fbbf24" />}</label>
                <label style={{ ...checkLbl, opacity: isPropLocked("faint") ? 0.65 : 1 }}><input type="checkbox" disabled={isPropLocked("faint")} checked={!!selectedStyle.faint} onChange={(e) => updateSelectedStyle({ faint: e.target.checked })} style={chkAcc} /> Faint{isPropLocked("faint") && <Lock size={10} color="#fbbf24" />}</label>
                <label style={{ ...checkLbl, opacity: isPropLocked("underline") ? 0.65 : 1 }}><input type="checkbox" disabled={isPropLocked("underline")} checked={!!selectedStyle.underline} onChange={(e) => updateSelectedStyle({ underline: e.target.checked })} style={chkAcc} /> Underline{isPropLocked("underline") && <Lock size={10} color="#fbbf24" />}</label>
                <label style={{ ...checkLbl, opacity: isPropLocked("strikethrough") ? 0.65 : 1 }}><input type="checkbox" disabled={isPropLocked("strikethrough")} checked={!!selectedStyle.strikethrough} onChange={(e) => updateSelectedStyle({ strikethrough: e.target.checked })} style={chkAcc} /> Strikethrough{isPropLocked("strikethrough") && <Lock size={10} color="#fbbf24" />}</label>
                <label style={{ ...checkLbl, opacity: isAllStyleLocked ? 0.65 : 1 }}><input type="checkbox" disabled={isAllStyleLocked} checked={!!selectedStyle.truncate} onChange={(e) => updateSelectedStyle({ truncate: e.target.checked })} style={chkAcc} /> Truncate (…)</label>
              </div>
            </div>

            <div
              ref={paddingSectionRef}
              className={focusBurstProp === "padding" ? "cs-focus-burst" : undefined}
              style={{ marginTop: 14, opacity: isPropLocked("padding") ? 0.65 : 1, borderRadius: 8, padding: focusBurstProp === "padding" ? 4 : 0 }}
            >
              <div style={{ ...microTag, display: "flex", alignItems: "center", gap: 6 }}>
                {isProUI && <span style={dot("#4ade80")} />} INNER PADDING
                {isPropLocked("padding") && <Lock size={10} color="#fbbf24" />}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {QUAD_LABELS.map((lbl, i) => (
                  <label key={lbl} style={labelCol}>
                    <span style={{ fontSize: 10.5, color: "var(--cs-text-dim)" }}>{lbl}</span>
                    <input
                      ref={i === 1 ? paddingRightRef : undefined}
                      type="number"
                      min={0}
                      max={10}
                      disabled={isPropLocked("padding")}
                      value={selectedStyle.padding[i]}
                      onChange={(e) => updateQuad("padding", i, +e.target.value)}
                      style={inputStyle}
                    />
                  </label>
                ))}
              </div>
              {styleDynamicExprs.padding && styleKey && (
                <DynamicGoFieldNotice
                  label="Padding"
                  expr={styleDynamicExprs.padding}
                  isLocked={!styleOverridden.includes("padding") && styleLocks.includes("padding")}
                  onToggleOverride={(overrideStatic) => toggleOverrideDynamicProp(styleKey, "padding", overrideStatic)}
                />
              )}
            </div>

            {isProUI && (
              <div style={{ marginTop: 12, opacity: isPropLocked("margin") ? 0.65 : 1 }}>
                <div style={{ ...microTag, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={dot("#fb923c")} /> OUTER MARGIN
                  {isPropLocked("margin") && <Lock size={10} color="#fbbf24" />}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {QUAD_LABELS.map((lbl, i) => (
                    <label key={lbl} style={labelCol}>
                      <span style={{ fontSize: 10.5, color: "var(--cs-text-dim)" }}>{lbl}</span>
                      <input type="number" min={0} max={10} disabled={isPropLocked("margin")} value={selectedStyle.margin[i]} onChange={(e) => updateQuad("margin", i, +e.target.value)} style={inputStyle} />
                    </label>
                  ))}
                </div>
                {styleDynamicExprs.margin && styleKey && (
                  <DynamicGoFieldNotice
                    label="Margin"
                    expr={styleDynamicExprs.margin}
                    isLocked={!styleOverridden.includes("margin") && styleLocks.includes("margin")}
                    onToggleOverride={(overrideStatic) => toggleOverrideDynamicProp(styleKey, "margin", overrideStatic)}
                  />
                )}
              </div>
            )}

            {workspaceMode === "studio" && (
              <button
                onClick={() => setShowAdvancedStyle((v) => !v)}
                style={{
                  marginTop: 12,
                  width: "100%",
                  background: "transparent",
                  border: "1px dashed var(--cs-border-strong)",
                  borderRadius: 6,
                  padding: "5px 8px",
                  fontSize: 11.5,
                  color: "var(--cs-lavender-text)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <span>{showAdvancedStyle ? "Hide Advanced Pro Controls" : "Show Pro Breakpoints, Borders & Tokens"}</span>
                {showAdvancedStyle ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            )}
          </Section>

          {(!selectedNode.contentType ||
            selectedNode.contentType === "text" ||
            selectedNode.contentType === "glamour:markdown" ||
            selectedNode.contentType === "gum:choose" ||
            selectedNode.contentType === "gum:confirm" ||
            selectedNode.contentType === "wish:ssh") && (
            <Section
              title={
                selectedNode.contentType === "glamour:markdown"
                  ? "Markdown Source (Glamour)"
                  : selectedNode.contentType === "gum:choose"
                  ? "Gum Choose Options"
                  : selectedNode.contentType === "gum:confirm"
                  ? "Gum Confirm Prompt"
                  : selectedNode.contentType === "wish:ssh"
                  ? "Wish SSH Address"
                  : "Pane Text Content"
              }
              subtitle={
                selectedNode.contentType === "glamour:markdown"
                  ? "Write Markdown (#, ##, lists, > quote, ```go```). Or double-click directly on canvas!"
                  : selectedNode.contentType === "gum:choose"
                  ? "First line starting with # sets the header; each line below is a selectable option."
                  : selectedNode.contentType === "gum:confirm"
                  ? "Question displayed above the Yes / No confirmation buttons."
                  : selectedNode.contentType === "wish:ssh"
                  ? "SSH command / host displayed in the Wish session banner."
                  : "Or double-click any text pane directly on the terminal stage to edit!"
              }
            >
              <textarea
                rows={selectedNode.contentType === "glamour:markdown" || selectedNode.contentType === "gum:choose" ? 6 : 4}
                disabled={fileSyncDisabled || nodeSyncDisabled}
                value={selectedNode.content ?? ""}
                onChange={(e) => {
                  updateNode(selectedNode.id, (n) => ({ ...n, content: e.target.value }));
                  markStep("styledOrInteracted");
                }}
                style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
              />
            </Section>
          )}
        </>
      )}

      {isProUI && (
        <Section
          title="Adaptive Tokens"
          badge="LightDark"
          subtitle="Manage Light & Dark hex color pairs emitted via lipgloss.LightDark(hasDarkBG)."
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(ir.tokens).map(([name, pair]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <code style={{ fontSize: 12.5, color: "var(--cs-text-heading)" }}>${name}</code>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {(["light", "dark"] as const).map((mode) => (
                    <span key={mode} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {mode === "light" ? <Sun size={12} aria-hidden="true" /> : <Moon size={12} aria-hidden="true" />}
                      <ColorSwatchPicker label={`$${name} · ${mode}`} value={pair[mode]} disabled={fileSyncDisabled}
                        onChange={(hex) => updateToken(name, mode, hex)} />
                    </span>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ display: "flex", gap: 6, marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--cs-border)" }}>
              <input
                value={newTokenName}
                onChange={(e) => setNewTokenName(e.target.value)}
                placeholder="New token name (e.g. warn)"
                style={{ ...inputStyle, fontSize: 11.5 }}
              />
              <button
                onClick={() => {
                  if (addToken(newTokenName)) setNewTokenName("");
                }}
                style={{ ...miniBtn, whiteSpace: "nowrap" }}
              >
                + Add Token
              </button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

function DynamicGoFieldNotice({
  label,
  expr,
  isLocked,
  onToggleOverride,
}: {
  label: string;
  expr: string;
  isLocked: boolean;
  onToggleOverride: (overrideStatic: boolean) => void;
}) {
  return (
    <div
      style={{
        marginTop: 6,
        padding: "6px 8px",
        borderRadius: 7,
        background: isLocked ? "rgba(245, 158, 11, 0.08)" : "var(--cs-input)",
        border: `1px solid ${isLocked ? "rgba(245, 158, 11, 0.35)" : "var(--cs-border)"}`,
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: isLocked ? "#fbbf24" : "var(--cs-text-muted)" }}>
          {isLocked ? `Dynamic Go · ${label}` : `Overridden · ${label}`}
        </span>
        <button
          onClick={() => onToggleOverride(isLocked)}
          style={{
            ...miniBtn,
            padding: "2px 7px",
            fontSize: 10.5,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            color: isLocked ? "var(--cs-text-heading)" : "#fbbf24",
            whiteSpace: "nowrap",
          }}
        >
          {isLocked ? <Unlock size={10} /> : <RotateCcw size={10} />}
          <span>{isLocked ? "Override with Static Value" : "Restore Dynamic Go"}</span>
        </button>
      </div>
      <code
        style={{
          fontSize: 11,
          fontFamily: "ui-monospace, monospace",
          color: "var(--cs-text-heading)",
          background: "var(--cs-bg-code)",
          padding: "3px 6px",
          borderRadius: 4,
          border: "1px solid var(--cs-border-subtle)",
          overflowX: "auto",
          whiteSpace: "pre",
          display: "block",
        }}
      >
        {expr}
      </code>
    </div>
  );
}

function FieldLockLabel({ text, locked }: { text: string; locked: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span>{text}</span>
      {locked && <Lock size={10} color="#fbbf24" />}
    </span>
  );
}

function Section({
  title,
  badge,
  extraBadge,
  subtitle,
  action,
  children,
}: {
  title: string;
  badge?: string;
  extraBadge?: ReactNode;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ border: "1px solid var(--cs-border)", borderRadius: 10, padding: 16, background: "var(--cs-card-alt)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: subtitle ? 6 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "var(--cs-text-heading)", letterSpacing: -0.1 }}>
            {title}
          </h3>
          {badge && (
            <code style={{ fontSize: 11, color: "var(--cs-mint)", fontFamily: "ui-monospace, monospace" }}>
              {badge}
            </code>
          )}
          {extraBadge}
        </div>
        {action}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)", marginBottom: 14, lineHeight: 1.45 }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}
