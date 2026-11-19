import { useMemo, useState } from "react";
import { generateLayoutGo, generateStylesGo } from "./codegen";
import { TerminalViewport, type TermPalette } from "./TerminalViewport";
import {
  findNode,
  listEditableNodes,
  updateNodeInDoc,
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

const DEFAULT_IR: IRDoc = {
  tokens: {
    accent:     { light: "#2e7de9", dark: "#7aa2f7" },
    borderIdle: { light: "#9aa5ce", dark: "#414868" },
    textMain:   { light: "#3760bf", dark: "#c0caf5" },
    modalGlow:  { light: "#9854f1", dark: "#bb9af7" },
    surface:    { light: "#e9e9ec", dark: "#1f2335" },
  },
  styles: {
    sidebar: {
      border: "rounded", borderColor: "$accent", fg: "$textMain",
      padding: [0, 1, 0, 1], margin: [0, 1, 0, 0], bold: false,
    },
    main: {
      border: "normal", borderColor: "$borderIdle", fg: "$textMain",
      padding: [1, 2, 1, 2], margin: [0, 0, 0, 0], bold: false,
    },
    status: {
      border: "none", borderColor: "", fg: "$accent",
      padding: [0, 1, 0, 1], margin: [0, 0, 0, 0], bold: true,
    },
    modal: {
      border: "double", borderColor: "$modalGlow", fg: "$textMain", bg: "$surface",
      padding: [1, 2, 1, 2], margin: [0, 0, 0, 0], bold: true,
    },
  },
  root: {
    id: "shell",
    kind: "JoinVertical",
    children: [
      {
        id: "body",
        kind: "JoinHorizontal",
        height: { mode: "fill", weight: 1 },
        children: [
          {
            id: "sidebar",
            kind: "Box",
            style: "sidebar",
            contentType: "bubble:list",
            width: { mode: "fixed", value: 30, collapseBelow: 70 },
            height: { mode: "fill", weight: 1 },
            content: "Navigation\n──────────\n› Overview",
          },
          {
            id: "mainPane",
            kind: "Box",
            style: "main",
            contentType: "bubble:table",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fill", weight: 1 },
            content: "Main workspace content",
          },
        ],
      },
      {
        id: "statusBar",
        kind: "Box",
        style: "status",
        contentType: "text",
        width: { mode: "fill", weight: 1 },
        height: { mode: "fixed", value: 1 },
        content: "Click a pane & press ↑/↓/j/k to drive real Bubbles v2 • /: filter list",
      },
    ],
  },
  overlays: [
    {
      id: "helpModal",
      visible: false,
      z: 10,
      node: {
        id: "modalCard",
        kind: "Box",
        style: "modal",
        contentType: "text",
        width: { mode: "fixed", value: 44 },
        height: { mode: "fixed", value: 9 },
        content: "Keyboard Shortcuts (v2 Layer)\n\n  ↑/↓    Scroll active Bubble\n  /      Filter list items",
      },
    },
  ],
};

const QUAD_LABELS = ["Top", "Right", "Bottom", "Left"] as const;

export default function App() {
  const [ir, setIr] = useState<IRDoc>(DEFAULT_IR);
  const [renderTick, setRenderTick] = useState(0);
  const [viewMode, setViewMode] = useState<"single" | "matrix">("matrix");
  const [cols, setCols] = useState(86);
  const [rows, setRows] = useState(24);
  const [paletteId, setPaletteId] = useState("tokyo-dark");
  const [showOverlay, setShowOverlay] = useState(true);

  const [selectedId, setSelectedId] = useState<string>("mainPane");
  const [singleTel, setSingleTel] = useState<TelemetryNode[]>([]);

  const [rightTab, setRightTab] = useState<"inspector" | "code">("inspector");
  const [codeFile, setCodeFile] = useState<"styles" | "layout">("styles");
  const [copied, setCopied] = useState(false);

  const palette = useMemo(
    () => PALETTES.find((p) => p.id === paletteId) ?? PALETTES[0],
    [paletteId]
  );

  const editableNodes = useMemo(() => listEditableNodes(ir), [ir]);
  const selectedNode = useMemo(() => findNode(ir, selectedId), [ir, selectedId]);
  const selectedStyle: IRStyle | null = selectedNode?.style ? ir.styles[selectedNode.style] ?? null : null;
  const selectedTel = singleTel.find((t) => t.id === selectedId) ?? null;
  const showModal = ir.overlays[0]?.visible ?? false;

  const generatedGo = useMemo(
    () => (codeFile === "styles" ? generateStylesGo(ir) : generateLayoutGo(ir)),
    [ir, codeFile]
  );

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

  const toggleModal = () => {
    setIr((prev) => {
      const next = structuredClone(prev);
      next.overlays[0].visible = !next.overlays[0].visible;
      return next;
    });
  };

  const copyGo = async () => {
    await navigator.clipboard.writeText(generatedGo);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const bumpTick = () => setRenderTick((t) => t + 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 370px", minHeight: "100vh", background: "#0b0d13", color: "#e2e8f0", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14, overflow: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>
              Charm Studio <span style={{ color: "#7aa2f7", fontWeight: 500, fontSize: 13 }}>Lip Gloss + Bubbles v2</span>
            </h2>
            <div style={{ display: "inline-flex", background: "#141824", borderRadius: 7, padding: 3, border: "1px solid #262b3d" }}>
              <button onClick={() => setViewMode("single")} style={segBtn(viewMode === "single")}>Single</button>
              <button onClick={() => setViewMode("matrix")} style={segBtn(viewMode === "matrix")}>Matrix (3×)</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <select
              value={paletteId}
              onChange={(e) => {
                const nextId = e.target.value;
                setPaletteId(nextId);
                const preset = PALETTES.find((p) => p.id === nextId);
                if (preset) {
                  setIr((prev) => {
                    const next = structuredClone(prev);
                    const mode = preset.darkBG ? "dark" : "light";
                    for (const [k, hex] of Object.entries(preset.tokens)) {
                      if (next.tokens[k]) next.tokens[k][mode] = hex;
                    }
                    return next;
                  });
                }
              }}
              style={{ ...inputStyle, width: "auto", padding: "5px 9px" }}
            >
              {PALETTES.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <button onClick={toggleModal} style={btnStyle(showModal)}>
              Layer Modal: {showModal ? "ON" : "OFF"}
            </button>
            <button onClick={() => setShowOverlay((v) => !v)} style={btnStyle(showOverlay)}>
              DevTools: {showOverlay ? "ON" : "OFF"}
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 13, color: "#94a3b8", flexWrap: "wrap" }}>
          {viewMode === "single" && (
            <>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Cols <b>{cols}</b>
                <input type="range" min={35} max={130} value={cols} onChange={(e) => setCols(+e.target.value)} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                Rows <b>{rows}</b>
                <input type="range" min={12} max={40} value={rows} onChange={(e) => setRows(+e.target.value)} />
              </label>
            </>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>Nodes:</span>
            {editableNodes.map((n) => (
              <button key={n.id} onClick={() => setSelectedId(n.id)} style={pillStyle(selectedId === n.id)}>
                #{n.id}
              </button>
            ))}
          </div>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b" }}>
            Click terminal & press ↑/↓/j/k to drive Bubbles
          </span>
        </div>

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
                </span>
              ) : (
                <span>Node <b>#{selectedId}</b> is hidden/collapsed at {cols} cols.</span>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, alignItems: "flex-start" }}>
            {MATRIX_PRESETS.map((vp) => (
              <TerminalViewport
                key={vp.title}
                title={vp.title}
                doc={ir}
                renderTick={renderTick}
                cols={vp.cols}
                rows={vp.rows}
                fontSize={11.5}
                palette={palette}
                showOverlay={showOverlay}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onInteract={bumpTick}
              />
            ))}
          </div>
        )}
      </div>

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
          <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, fontSize: 13 }}>
            {selectedNode && selectedStyle ? (
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
                        Flex Weight
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

                <Section title={`Style: ${selectedNode.style}`}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
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
                    <label style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 6 }}>
                      <input type="checkbox" checked={selectedStyle.bold} onChange={(e) => updateSelectedStyle({ bold: e.target.checked })} />
                      Bold
                    </label>
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
              </>
            ) : (
              <div style={{ color: "#64748b" }}>Select a pane to inspect.</div>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderBottom: "1px solid #1e2436" }}>
              <button onClick={() => setCodeFile("styles")} style={pillStyle(codeFile === "styles")}>styles.go</button>
              <button onClick={() => setCodeFile("layout")} style={pillStyle(codeFile === "layout")}>layout.go</button>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #1e2436", borderRadius: 8, padding: 12, background: "#151a28" }}>
      <div style={{ fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: "#94a3b8", marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

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
