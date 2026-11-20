import { useMemo, useState } from "react";
import { generateLayoutGo, generateMainGo, generateStylesGo } from "./codegen";
import { LayersPanel } from "./LayersPanel";
import { TEMPLATES } from "./templates";
import { TerminalViewport, type TermPalette } from "./TerminalViewport";
import {
  addBoxToTarget,
  deleteNodeFromDoc,
  forkStyleForNode,
  moveSibling,
  splitNode,
} from "./treeOps";
import {
  findNode,
  updateNodeInDoc,
  type ColorProfile,
  type ContentType,
  type IRDoc,
  type IRStyle,
  type TelemetryNode,
} from "./types";

interface ThemePreset extends TermPalette {
  tokens: { accent: string; borderIdle: string; textMain: string; modalGlow: string; surface: string };
}

const PALETTES: ThemePreset[] = [
  {
    id: "tokyo-dark", label: "Tokyo Night (Dark)", darkBG: true, background: "#1a1b26", foreground: "#c0caf5",
    tokens: { accent: "#7aa2f7", borderIdle: "#414868", textMain: "#c0caf5", modalGlow: "#bb9af7", surface: "#1f2335" },
  },
  {
    id: "catppuccin", label: "Catppuccin Mocha", darkBG: true, background: "#1e1e2e", foreground: "#cdd6f4",
    tokens: { accent: "#cba6f7", borderIdle: "#585b70", textMain: "#cdd6f4", modalGlow: "#f5c2e7", surface: "#313244" },
  },
  {
    id: "dracula", label: "Dracula", darkBG: true, background: "#282a36", foreground: "#f8f8f2",
    tokens: { accent: "#ff79c6", borderIdle: "#6272a4", textMain: "#f8f8f2", modalGlow: "#bd93f9", surface: "#44475a" },
  },
  {
    id: "nord", label: "Nord", darkBG: true, background: "#2e3440", foreground: "#d8dee9",
    tokens: { accent: "#88c0d0", borderIdle: "#4c566a", textMain: "#eceff4", modalGlow: "#b48ead", surface: "#3b4252" },
  },
  {
    id: "gruvbox", label: "Gruvbox Dark", darkBG: true, background: "#282828", foreground: "#ebdbb2",
    tokens: { accent: "#fabd2f", borderIdle: "#665c54", textMain: "#ebdbb2", modalGlow: "#fe8019", surface: "#3c3836" },
  },
  {
    id: "tokyo-light", label: "Tokyo Day (Light)", darkBG: false, background: "#e1e2e7", foreground: "#3760bf",
    tokens: { accent: "#2e7de9", borderIdle: "#9aa5ce", textMain: "#3760bf", modalGlow: "#9854f1", surface: "#d5d6db" },
  },
];

const MATRIX_PRESETS = [
  { title: "Compact (Split Pane)", cols: 58,  rows: 18 },
  { title: "Standard (80×24)",     cols: 80,  rows: 24 },
  { title: "Wide (Full Screen)",   cols: 116, rows: 30 },
] as const;

const QUAD_LABELS = ["Top", "Right", "Bottom", "Left"] as const;

function applyPaletteTokens(doc: IRDoc, preset: ThemePreset): IRDoc {
  const next = structuredClone(doc);
  const mode = preset.darkBG ? "dark" : "light";
  for (const [k, hex] of Object.entries(preset.tokens)) {
    if (next.tokens[k]) next.tokens[k][mode] = hex;
  }
  return next;
}

export default function App() {
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [ir, setIr] = useState<IRDoc>(() => structuredClone(TEMPLATES[0].doc));
  const [renderTick, setRenderTick] = useState(0);
  const [layersOpen, setLayersOpen] = useState(true);
  const [viewMode, setViewMode] = useState<"single" | "matrix">("matrix");
  const [cols, setCols] = useState(86);
  const [rows, setRows] = useState(24);
  const [paletteId, setPaletteId] = useState("tokyo-dark");
  const [colorProfile, setColorProfile] = useState<ColorProfile>("truecolor");
  const [showOverlay, setShowOverlay] = useState(true);

  const [selectedId, setSelectedId] = useState<string>(TEMPLATES[0].defaultSelectedId);
  const [singleTel, setSingleTel] = useState<TelemetryNode[]>([]);

  const [rightTab, setRightTab] = useState<"inspector" | "code">("inspector");
  const [codeFile, setCodeFile] = useState<"styles" | "layout" | "main">("styles");
  const [copied, setCopied] = useState(false);

  const palette = useMemo(
    () => PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0],
    [paletteId]
  );

  const selectedNode = useMemo(() => findNode(ir, selectedId), [ir, selectedId]);
  const selectedStyle: IRStyle | null = selectedNode?.style ? ir.styles[selectedNode.style] ?? null : null;
  const selectedTel = singleTel.find((t) => t.id === selectedId) ?? null;
  const showModal = ir.overlays[0]?.visible ?? false;
  const tokenKeys = Object.keys(ir.tokens);
  const styleKeys = Object.keys(ir.styles);

  const generatedGo = useMemo(() => {
    if (codeFile === "styles") return generateStylesGo(ir);
    if (codeFile === "layout") return generateLayoutGo(ir);
    return generateMainGo(ir);
  }, [ir, codeFile]);

  const updateSelectedStyle = (patch: Partial<IRStyle>) => {
    if (!selectedNode?.style) return;
    const styleKey = selectedNode.style;
    setIr((prev) => ({
      ...prev,
      styles: { ...prev.styles, [styleKey]: { ...prev.styles[styleKey], ...patch } },
    }));
  };

  const updateQuad = (field: "padding" | "margin", idx: number, val: number) => {
    if (!selectedStyle) return;
    const next: [number, number, number, number] = [...selectedStyle[field]];
    next[idx] = Math.max(0, val || 0);
    updateSelectedStyle({ [field]: next });
  };

  const toggleBorderEdge = (idx: number) => {
    if (!selectedStyle) return;
    const cur = selectedStyle.borderEdges ?? [true, true, true, true];
    const next: [boolean, boolean, boolean, boolean] = [...cur];
    next[idx] = !next[idx];
    updateSelectedStyle({ borderEdges: next });
  };

  const toggleOverlay = (overlayId: string) => {
    setIr((prev) => ({
      ...prev,
      overlays: prev.overlays.map((o) => (o.id === overlayId ? { ...o, visible: !o.visible } : o)),
    }));
  };

  const loadTemplate = (id: string) => {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    setIr(applyPaletteTokens(tpl.doc, palette));
    setSelectedId(tpl.defaultSelectedId);
  };

  const copyGo = async () => {
    await navigator.clipboard.writeText(generatedGo);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const bumpTick = () => setRenderTick((t) => t + 1);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${layersOpen ? "230px" : "38px"} 1fr 350px`,
        minHeight: "100vh",
        background: "#0b0d13",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* LEFT: Layers Tree */}
      <LayersPanel
        doc={ir}
        selectedId={selectedId}
        open={layersOpen}
        onToggleOpen={() => setLayersOpen((v) => !v)}
        onSelect={setSelectedId}
        onAddBox={() => {
          const { doc: next, newId } = addBoxToTarget(ir, selectedId);
          setIr(next);
          setSelectedId(newId);
        }}
        onSplit={(kind) => {
          const { doc: next, newId } = splitNode(ir, selectedId, kind);
          setIr(next);
          setSelectedId(newId);
        }}
        onMove={(dir) => setIr((prev) => moveSibling(prev, selectedId, dir))}
        onDelete={() => {
          const { doc: next, nextSelected } = deleteNodeFromDoc(ir, selectedId);
          setIr(next);
          setSelectedId(nextSelected);
        }}
        onToggleOverlay={toggleOverlay}
      />

      {/* CENTER: Terminal Stage */}
      <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14, overflow: "auto", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>
              Charm Studio <span style={{ color: "#7aa2f7", fontWeight: 500, fontSize: 12 }}>v2</span>
            </h2>
            <select
              value={templateId}
              onChange={(e) => loadTemplate(e.target.value)}
              style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontWeight: 600 }}
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>Template: {t.label}</option>
              ))}
            </select>
            <div style={{ display: "inline-flex", background: "#141824", borderRadius: 7, padding: 3, border: "1px solid #262b3d" }}>
              <button onClick={() => setViewMode("single")} style={segBtn(viewMode === "single")}>Single</button>
              <button onClick={() => setViewMode("matrix")} style={segBtn(viewMode === "matrix")}>Matrix (3×)</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={paletteId}
              onChange={(e) => {
                const nextId = e.target.value;
                setPaletteId(nextId);
                const preset = PALETTES.find((p) => p.id === nextId);
                if (preset) setIr((prev) => applyPaletteTokens(prev, preset));
              }}
              style={{ ...inputStyle, width: "auto", padding: "5px 8px" }}
            >
              {PALETTES.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>

            <select
              title="Color Profile Downsampling"
              value={colorProfile}
              onChange={(e) => setColorProfile(e.target.value as ColorProfile)}
              style={{ ...inputStyle, width: "auto", padding: "5px 8px" }}
            >
              <option value="truecolor">TrueColor</option>
              <option value="ansi256">ANSI 256</option>
              <option value="ansi16">ANSI 16</option>
              <option value="ascii">ASCII</option>
            </select>

            {ir.overlays[0] && (
              <button onClick={() => toggleOverlay(ir.overlays[0].id)} style={btnStyle(showModal)}>
                Modal: {showModal ? "ON" : "OFF"}
              </button>
            )}
            <button onClick={() => setShowOverlay((v) => !v)} style={btnStyle(showOverlay)}>
              DevTools: {showOverlay ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        {viewMode === "single" && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, color: "#94a3b8", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Cols <b>{cols}</b>
              <input type="range" min={35} max={130} value={cols} onChange={(e) => setCols(+e.target.value)} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              Rows <b>{rows}</b>
              <input type="range" min={12} max={40} value={rows} onChange={(e) => setRows(+e.target.value)} />
            </label>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>
              Click terminal & press ↑/↓/j/k to drive Bubbles
            </span>
          </div>
        )}

        {viewMode === "single" ? (
          <div>
            <TerminalViewport
              title="Interactive Viewport"
              doc={ir}
              renderTick={renderTick}
              cols={cols}
              rows={rows}
              fontSize={14}
              palette={palette}
              colorProfile={colorProfile}
              showOverlay={showOverlay}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onInteract={bumpTick}
              onTelemetry={setSingleTel}
            />
            <div style={{ marginTop: 10, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#94a3b8" }}>
              {selectedTel ? (
                <span>
                  Selected <b style={{ color: "#e2e8f0" }}>#{selectedTel.id}</b> • total {selectedTel.margin.w}×{selectedTel.margin.h} • content {selectedTel.content.w}×{selectedTel.content.h}
                  {selectedTel.overflowMsg && <span style={{ color: "#fca5a5", marginLeft: 10 }}>⚠ {selectedTel.overflowMsg}</span>}
                </span>
              ) : (
                <span>Node <b>#{selectedId}</b> selected.</span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
            {MATRIX_PRESETS.map((vp) => (
              <TerminalViewport
                key={vp.title}
                title={vp.title}
                doc={ir}
                renderTick={renderTick}
                cols={vp.cols}
                rows={vp.rows}
                fontSize={11}
                palette={palette}
                colorProfile={colorProfile}
                showOverlay={showOverlay}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onInteract={bumpTick}
              />
            ))}
          </div>
        )}
      </div>

      {/* RIGHT: Inspector + Codegen */}
      <aside style={{ borderLeft: "1px solid #1e2436", background: "#111520", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0 }}>
        <div style={{ display: "flex", borderBottom: "1px solid #1e2436" }}>
          {(["inspector", "code"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setRightTab(t)}
              style={{
                flex: 1, padding: "12px 0", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                background: rightTab === t ? "#171c2b" : "transparent",
                color: rightTab === t ? "#7aa2f7" : "#64748b",
                borderBottom: rightTab === t ? "2px solid #7aa2f7" : "2px solid transparent",
              }}
            >
              {t === "inspector" ? "Inspector" : "Go Code (v2)"}
            </button>
          ))}
        </div>

        {rightTab === "inspector" ? (
          <div style={{ padding: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14, fontSize: 13 }}>
            {selectedNode && selectedNode.kind !== "Box" && (
              <Section title={`Container: ${selectedNode.id}`}>
                <label style={labelCol}>
                  Join Alignment ({selectedNode.kind})
                  <select
                    value={selectedNode.joinAlign ?? "start"}
                    onChange={(e) =>
                      setIr((prev) =>
                        updateNodeInDoc(prev, selectedNode.id, (n) => ({
                          ...n,
                          joinAlign: e.target.value as "start" | "center" | "end",
                        }))
                      )
                    }
                    style={inputStyle}
                  >
                    <option value="start">{selectedNode.kind === "JoinHorizontal" ? "Top (Start)" : "Left (Start)"}</option>
                    <option value="center">Center</option>
                    <option value="end">{selectedNode.kind === "JoinHorizontal" ? "Bottom (End)" : "Right (End)"}</option>
                  </select>
                </label>

                {selectedNode.id !== ir.root.id && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                    <label style={labelCol}>
                      Width Mode
                      <select
                        value={selectedNode.width?.mode ?? "fill"}
                        onChange={(e) =>
                          setIr((prev) =>
                            updateNodeInDoc(prev, selectedNode.id, (n) => ({
                              ...n,
                              width: { ...n.width, mode: e.target.value as "fixed" | "fill" | "fit", value: n.width?.value ?? 26, weight: n.width?.weight ?? 1 },
                            }))
                          )
                        }
                        style={inputStyle}
                      >
                        <option value="fill">Fill (flex)</option>
                        <option value="fixed">Fixed cols</option>
                      </select>
                    </label>
                    <label style={labelCol}>
                      Collapse Below
                      <input
                        type="number" min={0} max={140}
                        value={selectedNode.width?.collapseBelow ?? 0}
                        onChange={(e) =>
                          setIr((prev) =>
                            updateNodeInDoc(prev, selectedNode.id, (n) => ({
                              ...n,
                              width: { ...(n.width ?? { mode: "fill" }), collapseBelow: Math.max(0, +e.target.value) },
                            }))
                          )
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
                <Section title={`Node #${selectedNode.id}`}>
                  <label style={{ ...labelCol, marginBottom: 8 }}>
                    Component Type
                    <select
                      value={selectedNode.contentType ?? "text"}
                      onChange={(e) =>
                        setIr((prev) =>
                          updateNodeInDoc(prev, selectedNode.id, (n) => ({
                            ...n,
                            contentType: e.target.value as ContentType,
                          }))
                        )
                      }
                      style={inputStyle}
                    >
                      <option value="text">Plain Text</option>
                      <option value="bubble:list">Bubbles v2: List (↑/↓, /)</option>
                      <option value="bubble:table">Bubbles v2: Table (↑/↓, j/k)</option>
                      <option value="bubble:viewport">Bubbles v2: Viewport (↑/↓, PgUp/Dn)</option>
                      <option value="bubble:textinput">Bubbles v2: TextInput (Type!)</option>
                    </select>
                  </label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <label style={labelCol}>
                      Width Mode
                      <select
                        value={selectedNode.width?.mode ?? "fill"}
                        onChange={(e) =>
                          setIr((prev) =>
                            updateNodeInDoc(prev, selectedNode.id, (n) => ({
                              ...n,
                              width: { ...n.width, mode: e.target.value as "fixed" | "fill" | "fit", value: n.width?.value ?? 26, weight: n.width?.weight ?? 1 },
                            }))
                          )
                        }
                        style={inputStyle}
                      >
                        <option value="fixed">Fixed cols</option>
                        <option value="fill">Fill (flex)</option>
                        <option value="fit">Fit content</option>
                      </select>
                    </label>

                    {selectedNode.width?.mode === "fixed" ? (
                      <label style={labelCol}>
                        Fixed Cols
                        <input
                          type="number" min={4} max={120}
                          value={selectedNode.width.value ?? 26}
                          onChange={(e) =>
                            setIr((prev) =>
                              updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, width: { ...n.width!, value: +e.target.value } }))
                            )
                          }
                          style={inputStyle}
                        />
                      </label>
                    ) : (
                      <label style={labelCol}>
                        Width Weight
                        <input
                          type="number" min={1} max={10}
                          value={selectedNode.width?.weight ?? 1}
                          onChange={(e) =>
                            setIr((prev) =>
                              updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, width: { ...(n.width ?? { mode: "fill" }), weight: Math.max(1, +e.target.value) } }))
                            )
                          }
                          style={inputStyle}
                        />
                      </label>
                    )}

                    <label style={labelCol}>
                      Height Mode
                      <select
                        value={selectedNode.height?.mode ?? "fill"}
                        onChange={(e) =>
                          setIr((prev) =>
                            updateNodeInDoc(prev, selectedNode.id, (n) => ({
                              ...n,
                              height: { ...n.height, mode: e.target.value as "fixed" | "fill" | "fit", value: n.height?.value ?? 3, weight: n.height?.weight ?? 1 },
                            }))
                          )
                        }
                        style={inputStyle}
                      >
                        <option value="fill">Fill (flex)</option>
                        <option value="fixed">Fixed rows</option>
                        <option value="fit">Fit content</option>
                      </select>
                    </label>

                    {selectedNode.height?.mode === "fixed" ? (
                      <label style={labelCol}>
                        Fixed Rows
                        <input
                          type="number" min={1} max={40}
                          value={selectedNode.height.value ?? 3}
                          onChange={(e) =>
                            setIr((prev) =>
                              updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, height: { ...n.height!, value: +e.target.value } }))
                            )
                          }
                          style={inputStyle}
                        />
                      </label>
                    ) : (
                      <label style={labelCol}>
                        Height Weight
                        <input
                          type="number" min={1} max={10}
                          value={selectedNode.height?.weight ?? 1}
                          onChange={(e) =>
                            setIr((prev) =>
                              updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, height: { ...(n.height ?? { mode: "fill" }), weight: Math.max(1, +e.target.value) } }))
                            )
                          }
                          style={inputStyle}
                        />
                      </label>
                    )}
                  </div>

                  <label style={{ ...labelCol, marginTop: 8 }}>
                    Collapse Below (cols, 0 = never)
                    <input
                      type="number" min={0} max={140}
                      value={selectedNode.width?.collapseBelow ?? 0}
                      onChange={(e) =>
                        setIr((prev) =>
                          updateNodeInDoc(prev, selectedNode.id, (n) => ({
                            ...n,
                            width: { ...(n.width ?? { mode: "fill" }), collapseBelow: Math.max(0, +e.target.value) },
                          }))
                        )
                      }
                      style={inputStyle}
                    />
                  </label>
                </Section>

                <Section
                  title={`Style: ${selectedNode.style}`}
                  action={
                    <button onClick={() => setIr((prev) => forkStyleForNode(prev, selectedNode.id))} style={miniBtn} title="Duplicate style so edits only affect this box">
                      Fork Style
                    </button>
                  }
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                    <label style={labelCol}>
                      Assigned Style
                      <select
                        value={selectedNode.style ?? ""}
                        onChange={(e) =>
                          setIr((prev) => updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, style: e.target.value })))
                        }
                        style={inputStyle}
                      >
                        {styleKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </label>

                    <label style={labelCol}>
                      Border
                      <select
                        value={selectedStyle.border}
                        onChange={(e) => updateSelectedStyle({ border: e.target.value as IRStyle["border"] })}
                        style={inputStyle}
                      >
                        <option value="rounded">RoundedBorder</option>
                        <option value="normal">NormalBorder</option>
                        <option value="thick">ThickBorder</option>
                        <option value="double">DoubleBorder</option>
                        <option value="none">None</option>
                      </select>
                    </label>

                    {selectedStyle.border !== "none" && (
                      <div>
                        <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 4 }}>BORDER EDGES</div>
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

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      <label style={labelCol}>
                        Border
                        <select value={selectedStyle.borderColor || ""} onChange={(e) => updateSelectedStyle({ borderColor: e.target.value })} style={inputStyle}>
                          <option value="">Default</option>
                          {tokenKeys.map((k) => <option key={k} value={`$${k}`}>${k}</option>)}
                        </select>
                      </label>
                      <label style={labelCol}>
                        Text (Fg)
                        <select value={selectedStyle.fg || ""} onChange={(e) => updateSelectedStyle({ fg: e.target.value })} style={inputStyle}>
                          <option value="">Default</option>
                          {tokenKeys.map((k) => <option key={k} value={`$${k}`}>${k}</option>)}
                        </select>
                      </label>
                      <label style={labelCol}>
                        Fill (Bg)
                        <select value={selectedStyle.bg || ""} onChange={(e) => updateSelectedStyle({ bg: e.target.value })} style={inputStyle}>
                          <option value="">None</option>
                          {tokenKeys.map((k) => <option key={k} value={`$${k}`}>${k}</option>)}
                        </select>
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 2 }}>
                      <label style={checkLbl}><input type="checkbox" checked={selectedStyle.bold} onChange={(e) => updateSelectedStyle({ bold: e.target.checked })} /> Bold</label>
                      <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.italic} onChange={(e) => updateSelectedStyle({ italic: e.target.checked })} /> Italic</label>
                      <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.faint} onChange={(e) => updateSelectedStyle({ faint: e.target.checked })} /> Faint</label>
                      <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.underline} onChange={(e) => updateSelectedStyle({ underline: e.target.checked })} /> Underline</label>
                      <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.truncate} onChange={(e) => updateSelectedStyle({ truncate: e.target.checked })} /> Truncate</label>
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 4 }}>PADDING (cells)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                      {QUAD_LABELS.map((lbl, i) => (
                        <label key={lbl} style={labelCol}>
                          <span style={{ fontSize: 10 }}>{lbl}</span>
                          <input type="number" min={0} max={10} value={selectedStyle.padding[i]} onChange={(e) => updateQuad("padding", i, +e.target.value)} style={inputStyle} />
                        </label>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 4 }}>MARGIN (cells)</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                      {QUAD_LABELS.map((lbl, i) => (
                        <label key={lbl} style={labelCol}>
                          <span style={{ fontSize: 10 }}>{lbl}</span>
                          <input type="number" min={0} max={10} value={selectedStyle.margin[i]} onChange={(e) => updateQuad("margin", i, +e.target.value)} style={inputStyle} />
                        </label>
                      ))}
                    </div>
                  </div>
                </Section>

                {(!selectedNode.contentType || selectedNode.contentType === "text") && (
                  <Section title="Mock Content">
                    <textarea
                      rows={4}
                      value={selectedNode.content ?? ""}
                      onChange={(e) =>
                        setIr((prev) => updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, content: e.target.value })))
                      }
                      style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
                    />
                  </Section>
                )}
              </>
            )}

            <Section title="Adaptive Tokens (LightDark)">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {Object.entries(ir.tokens).map(([name, pair]) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <code style={{ fontSize: 12, color: "#cbd5e1" }}>${name}</code>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                        ☀
                        <input
                          type="color" value={pair.light}
                          onChange={(e) => setIr((p) => ({ ...p, tokens: { ...p.tokens, [name]: { ...pair, light: e.target.value } } }))}
                          style={{ width: 26, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                        />
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                        🌙
                        <input
                          type="color" value={pair.dark}
                          onChange={(e) => setIr((p) => ({ ...p, tokens: { ...p.tokens, [name]: { ...pair, dark: e.target.value } } }))}
                          style={{ width: 26, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", borderBottom: "1px solid #1e2436" }}>
              <button onClick={() => setCodeFile("styles")} style={pillStyle(codeFile === "styles")}>styles.go</button>
              <button onClick={() => setCodeFile("layout")} style={pillStyle(codeFile === "layout")}>layout.go</button>
              <button onClick={() => setCodeFile("main")} style={pillStyle(codeFile === "main")}>main.go</button>
              <button onClick={copyGo} style={{ ...btnStyle(copied), marginLeft: "auto" }}>
                {copied ? "✓ Copied" : "Copy Go"}
              </button>
            </div>
            <pre style={{ margin: 0, padding: 14, overflow: "auto", flex: 1, fontSize: 12, lineHeight: 1.5, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#c0caf5" }}>
              <code>{generatedGo}</code>
            </pre>
          </div>
        )}
      </aside>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #1e2436", borderRadius: 8, padding: 12, background: "#151a28" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: "#94a3b8" }}>
          {title}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  background: "#1e293b", color: "#93c5fd", border: "1px solid #334155",
  borderRadius: 5, padding: "2px 7px", fontSize: 11, cursor: "pointer",
};
const checkLbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#cbd5e1", cursor: "pointer" };
const labelCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#cbd5e1" };
const inputStyle: React.CSSProperties = { background: "#0b0d13", color: "#e2e8f0", border: "1px solid #2b334a", borderRadius: 5, padding: "5px 7px", fontSize: 12, width: "100%" };
const segBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "#273459" : "transparent",
  color: active ? "#93c5fd" : "#94a3b8",
  border: "none", borderRadius: 5, padding: "4px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer",
});
const btnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "#273459" : "#181d2c",
  color: active ? "#93c5fd" : "#cbd5e1",
  border: `1px solid ${active ? "#3b82f6" : "#2b334a"}`,
  borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer",
});
const pillStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "#1e293b" : "transparent",
  color: active ? "#7aa2f7" : "#94a3b8",
  border: `1px solid ${active ? "#7aa2f7" : "#262b3d"}`,
  borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer",
});
