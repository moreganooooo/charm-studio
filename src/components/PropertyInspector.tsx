import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Moon, Sun } from "lucide-react";
import { useStudioStore } from "../store/studioStore";
import { STYLE_PRESETS } from "../stylePresets";
import { HelpDot, Tooltip } from "../Tooltip";
import { defaultWidgetData, type ContentType, type IRStyle, type OverlayAnchor } from "../types";
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
    workspaceMode,
    showAdvancedStyle,
    setShowAdvancedStyle,
    renameNode,
    updateNode,
    updateSelectedStyle,
    updateQuad,
    toggleBorderEdge,
    setOverlayAnchor,
    forkStyle,
    pruneStyles,
    addToken,
    updateToken,
    markStep,
  } = useStudioStore();

  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  const [renameDraft, setRenameDraft] = useState(selectedId);
  const [newTokenName, setNewTokenName] = useState("");
  const [pruneNote, setPruneNote] = useState<string | null>(null);

  if (prevSelectedId !== selectedId) {
    setPrevSelectedId(selectedId);
    setRenameDraft(selectedId);
  }

  const tokenKeys = Object.keys(ir.tokens);
  const styleKeys = Object.keys(ir.styles);
  const isProUI = workspaceMode === "pro" || showAdvancedStyle;

  const hasWidgetDataUI =
    selectedNode?.contentType === "bubble:list" ||
    selectedNode?.contentType === "bubble:table" ||
    selectedNode?.contentType === "bubble:textinput" ||
    selectedNode?.contentType === "bubble:viewport" ||
    selectedNode?.contentType === "huh:form";

  const commitRename = () => {
    if (!selectedNode) return;
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
            onChange={(e) => setRenameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
            }}
            style={{ ...inputStyle, padding: "4px 7px", fontFamily: "ui-monospace, monospace", fontSize: 12 }}
          />
          <button
            onClick={commitRename}
            disabled={renameDraft.trim() === selectedNode.id || !renameDraft.trim()}
            style={miniBtn}
          >
            Rename
          </button>
        </div>
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
              <label style={labelCol}>
                <span style={{ display: "inline-flex", alignItems: "center" }}>
                  {workspaceMode === "studio" ? "Width Behavior" : "Width Mode"}
                  <HelpDot
                    title="Width Mode"
                    content="Fixed sets exact terminal columns; Fill stretches to share remaining space; Fit hugs the content."
                  />
                </span>
                <select
                  value={selectedNode.width?.mode ?? "fill"}
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
                <label style={labelCol}>
                  <span>Width (Cols)</span>
                  <input
                    type="number"
                    min={4}
                    max={120}
                    value={selectedNode.width.value ?? 26}
                    onChange={(e) =>
                      updateNode(selectedNode.id, (n) => ({ ...n, width: { ...n.width!, value: +e.target.value } }))
                    }
                    style={inputStyle}
                  />
                </label>
              ) : isProUI ? (
                <label style={labelCol}>
                  <span style={{ display: "inline-flex", alignItems: "center" }}>
                    Width Weight
                    <HelpDot title="Width Weight" content="Weight 2 gets twice as much extra width as weight 1." />
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={10}
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

              <label style={labelCol}>
                <span>{workspaceMode === "studio" ? "Height Behavior" : "Height Mode"}</span>
                <select
                  value={selectedNode.height?.mode ?? "fill"}
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
                <label style={labelCol}>
                  <span>Height (Rows)</span>
                  <input
                    type="number"
                    min={1}
                    max={40}
                    value={selectedNode.height.value ?? 3}
                    onChange={(e) =>
                      updateNode(selectedNode.id, (n) => ({ ...n, height: { ...n.height!, value: +e.target.value } }))
                    }
                    style={inputStyle}
                  />
                </label>
              ) : isProUI ? (
                <label style={labelCol}>
                  <span>Height Weight</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
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
            <div style={{ marginBottom: 12 }}>
              <div style={microTag}>1-CLICK STYLE PRESETS</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => updateSelectedStyle(preset.patch)}
                    title={preset.description}
                    style={{
                      ...miniBtn,
                      padding: "6px 4px",
                      textAlign: "center",
                      fontWeight: 600,
                      fontSize: 11,
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

              <label style={labelCol}>
                Border Shape
                <select
                  value={selectedStyle.border}
                  onChange={(e) => updateSelectedStyle({ border: e.target.value as IRStyle["border"] })}
                  style={inputStyle}
                >
                  <option value="rounded">RoundedBorder (╭─╮)</option>
                  <option value="normal">NormalBorder (┌─┐)</option>
                  <option value="thick">ThickBorder (┏━┓)</option>
                  <option value="double">DoubleBorder (╔═╗)</option>
                  <option value="none">None</option>
                </select>
              </label>

              {isProUI && selectedStyle.border !== "none" && (
                <div>
                  <div style={microTag}>VISIBLE BORDER EDGES</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                    {QUAD_LABELS.map((lbl, i) => {
                      const active = (selectedStyle.borderEdges ?? [true, true, true, true])[i];
                      return (
                        <button key={lbl} onClick={() => toggleBorderEdge(i)} style={btnStyle(active)}>
                          {lbl}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <label style={labelCol}>
                  <span>Border</span>
                  <select value={selectedStyle.borderColor || ""} onChange={(e) => updateSelectedStyle({ borderColor: e.target.value })} style={inputStyle}>
                    <option value="">Default</option>
                    {tokenKeys.map((k) => (
                      <option key={k} value={`$${k}`}>
                        ${k}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={labelCol}>
                  <span>Text</span>
                  <select value={selectedStyle.fg || ""} onChange={(e) => updateSelectedStyle({ fg: e.target.value })} style={inputStyle}>
                    <option value="">Default</option>
                    {tokenKeys.map((k) => (
                      <option key={k} value={`$${k}`}>
                        ${k}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={labelCol}>
                  <span>Fill (Bg)</span>
                  <select value={selectedStyle.bg || ""} onChange={(e) => updateSelectedStyle({ bg: e.target.value })} style={inputStyle}>
                    <option value="">None</option>
                    {tokenKeys.map((k) => (
                      <option key={k} value={`$${k}`}>
                        ${k}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <label style={labelCol}>
                  Align H
                  <select value={selectedStyle.alignH ?? "left"} onChange={(e) => updateSelectedStyle({ alignH: e.target.value as IRStyle["alignH"] })} style={inputStyle}>
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label style={labelCol}>
                  Align V
                  <select value={selectedStyle.alignV ?? "top"} onChange={(e) => updateSelectedStyle({ alignV: e.target.value as IRStyle["alignV"] })} style={inputStyle}>
                    <option value="top">Top</option>
                    <option value="center">Center</option>
                    <option value="bottom">Bottom</option>
                  </select>
                </label>
              </div>

              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
                <label style={checkLbl}><input type="checkbox" checked={selectedStyle.bold} onChange={(e) => updateSelectedStyle({ bold: e.target.checked })} style={chkAcc} /> Bold</label>
                <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.italic} onChange={(e) => updateSelectedStyle({ italic: e.target.checked })} style={chkAcc} /> Italic</label>
                <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.faint} onChange={(e) => updateSelectedStyle({ faint: e.target.checked })} style={chkAcc} /> Faint</label>
                <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.underline} onChange={(e) => updateSelectedStyle({ underline: e.target.checked })} style={chkAcc} /> Underline</label>
                <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.truncate} onChange={(e) => updateSelectedStyle({ truncate: e.target.checked })} style={chkAcc} /> Truncate (…)</label>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ ...microTag, display: "flex", alignItems: "center", gap: 6 }}>
                {isProUI && <span style={dot("#4ade80")} />} INNER PADDING
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                {QUAD_LABELS.map((lbl, i) => (
                  <label key={lbl} style={labelCol}>
                    <span style={{ fontSize: 10.5, color: "var(--cs-text-dim)" }}>{lbl}</span>
                    <input type="number" min={0} max={10} value={selectedStyle.padding[i]} onChange={(e) => updateQuad("padding", i, +e.target.value)} style={inputStyle} />
                  </label>
                ))}
              </div>
            </div>

            {isProUI && (
              <div style={{ marginTop: 12 }}>
                <div style={{ ...microTag, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={dot("#fb923c")} /> OUTER MARGIN
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {QUAD_LABELS.map((lbl, i) => (
                    <label key={lbl} style={labelCol}>
                      <span style={{ fontSize: 10.5, color: "var(--cs-text-dim)" }}>{lbl}</span>
                      <input type="number" min={0} max={10} value={selectedStyle.margin[i]} onChange={(e) => updateQuad("margin", i, +e.target.value)} style={inputStyle} />
                    </label>
                  ))}
                </div>
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
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--cs-text-muted)" }}>
                    <Sun size={12} />
                    <input
                      type="color"
                      value={pair.light}
                      onChange={(e) => updateToken(name, "light", e.target.value)}
                      style={{ width: 26, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--cs-text-muted)" }}>
                    <Moon size={12} />
                    <input
                      type="color"
                      value={pair.dark}
                      onChange={(e) => updateToken(name, "dark", e.target.value)}
                      style={{ width: 26, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                    />
                  </label>
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

function Section({
  title,
  badge,
  subtitle,
  action,
  children,
}: {
  title: string;
  badge?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div style={{ border: "1px solid var(--cs-border)", borderRadius: 10, padding: 16, background: "var(--cs-card-alt)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: subtitle ? 6 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "var(--cs-text-heading)", letterSpacing: -0.1 }}>
            {title}
          </h3>
          {badge && (
            <code style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, background: "var(--cs-input)", color: "var(--cs-mint)", border: "1px solid var(--cs-border-subtle)" }}>
              {badge}
            </code>
          )}
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
