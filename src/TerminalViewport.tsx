import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Columns2, Copy, Keyboard, Pencil, Plus, Rows2, Trash2 } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { findNode, listVisibleFocusBoxes, type ColorProfile, type IRDoc, type Rect, type TelemetryNode } from "./types";
import { dispatchKey, ensureEngineReady, hitTestCell, renderFrame } from "./wasmEngine";

export interface TermPalette {
  id: string;
  label: string;
  darkBG: boolean;
  background: string;
  foreground: string;
}

interface Props {
  title: string;
  doc: IRDoc;
  renderTick: number;
  cols: number;
  rows: number;
  fontSize?: number;
  fontFamily?: string;
  palette: TermPalette;
  colorProfile: ColorProfile;
  showOverlay: boolean;
  showQuickBar?: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onInteract: () => void;
  onResize?: (cols: number, rows: number) => void;
  onTelemetry?: (tel: TelemetryNode[]) => void;
  onQuickSplit?: (id: string, kind: "JoinHorizontal" | "JoinVertical") => void;
  onQuickWidgetPicker?: (id: string) => void;
  onQuickClone?: (id: string) => void;
  onQuickDelete?: (id: string) => void;
  onQuickInlineEdit?: (id: string, nextContent: string) => void;
  onRequestInspectData?: (id: string) => void;
}

const FONT_STACK = `"JetBrains Mono", "SF Mono", Menlo, Monaco, ui-monospace, monospace`;

const INLINE_EDITABLE_TYPES = new Set([
  "text",
  "glamour:markdown",
  "gum:choose",
  "gum:confirm",
  "wish:ssh",
  "bubble:viewport",
]);

export function TerminalViewport({
  title,
  doc,
  renderTick,
  cols,
  rows,
  fontSize = 14,
  fontFamily = FONT_STACK,
  palette,
  colorProfile,
  showOverlay,
  showQuickBar = false,
  selectedId,
  onSelect,
  onInteract,
  onResize,
  onTelemetry,
  onQuickSplit,
  onQuickWidgetPicker,
  onQuickClone,
  onQuickDelete,
  onQuickInlineEdit,
  onRequestInspectData,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryNode[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [cellSize, setCellSize] = useState({ w: fontSize * 0.6, h: fontSize * 1.38 });
  const [inlineEdit, setInlineEdit] = useState<{ id: string; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    ensureEngineReady().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!ready || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.font = `${fontSize}px ${fontFamily}`;
    const cw = Math.ceil(ctx.measureText("M").width * 10) / 10;
    const ch = Math.ceil(fontSize * 1.38);
    setCellSize({ w: cw, h: ch });

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.ceil(cols * cw);
    const cssH = Math.ceil(rows * ch);
    canvas.width = Math.ceil(cssW * dpr);
    canvas.height = Math.ceil(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const frame = renderFrame(doc, cols, rows, palette.darkBG, colorProfile);
    if (frame.error) {
      console.error("WASM render error:", frame.error);
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.textBaseline = "middle";

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = frame.cells[r * cols + c];
        if (!cell) continue;
        if (cell.w === 0 && !cell.c) continue;

        const px = c * cw;
        const py = r * ch;
        const attrs = cell.a ?? 0;
        const isBold = (attrs & 1) !== 0;
        const isItalic = (attrs & 2) !== 0;
        const isReverse = (attrs & 4) !== 0;
        const isFaint = (attrs & 8) !== 0;
        const isUnderline = (attrs & 16) !== 0;

        let fg = cell.f || palette.foreground;
        let bg = cell.b || "";
        if (isReverse) {
          const oldFg = fg;
          fg = bg || palette.background;
          bg = oldFg;
        }

        if (bg) {
          ctx.fillStyle = bg;
          ctx.fillRect(px, py, cw * (cell.w && cell.w > 1 ? cell.w : 1) + 0.5, ch + 0.5);
        }

        if (cell.c && cell.c !== " ") {
          ctx.globalAlpha = isFaint ? 0.55 : 1;
          ctx.fillStyle = fg;
          ctx.font = `${isItalic ? "italic " : ""}${isBold ? "700 " : "400 "}${fontSize}px ${fontFamily}`;
          ctx.fillText(cell.c, px, py + ch * 0.52);
          ctx.globalAlpha = 1;
        }

        if (isUnderline) {
          ctx.fillStyle = fg;
          ctx.fillRect(px, py + ch - 2, cw, 1);
        }
      }
    }

    setTelemetry(frame.telemetry ?? []);
    onTelemetry?.(frame.telemetry ?? []);
  }, [ready, doc, renderTick, cols, rows, fontSize, fontFamily, palette, colorProfile]);

  const hitTest = (e: React.MouseEvent<SVGSVGElement>): TelemetryNode | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = Math.floor((e.clientX - rect.left) / cellSize.w);
    const cy = Math.floor((e.clientY - rect.top) / cellSize.h);

    const wasmHit = hitTestCell(cx, cy);
    if (wasmHit) {
      const matched = telemetry.find((n) => n.id === wasmHit.id);
      if (matched) return matched;
      return {
        id: wasmHit.id,
        kind: "Box",
        style: "",
        margin: wasmHit.bounds,
        border: wasmHit.bounds,
        padding: wasmHit.bounds,
        content: wasmHit.bounds,
        overflowX: false,
        overflowY: false,
      };
    }

    return (
      [...telemetry].reverse().find(
        (n) => cx >= n.margin.x && cx < n.margin.x + n.margin.w && cy >= n.margin.y && cy < n.margin.y + n.margin.h
      ) ?? null
    );
  };

  const openInlineEditForNode = (id: string) => {
    const node = findNode(doc, id);
    if (!node || node.kind !== "Box") return;
    const ct = node.contentType ?? "text";
    if (!INLINE_EDITABLE_TYPES.has(ct)) {
      onRequestInspectData?.(id);
      return;
    }
    setInlineEdit({ id, text: node.content ?? "" });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (inlineEdit) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const handled = dispatchKey(selectedId, e.key, e.shiftKey);
    if (handled) {
      e.preventDefault();
      onInteract();
      return;
    }
    if (e.key === "Tab") {
      const order = listVisibleFocusBoxes(doc, cols);
      if (order.length > 1) {
        e.preventDefault();
        const curIdx = Math.max(0, order.findIndex((n) => n.id === selectedId));
        const nextIdx = e.shiftKey
          ? (curIdx + order.length - 1) % order.length
          : (curIdx + 1) % order.length;
        onSelect(order[nextIdx].id);
      }
    }
  };

  const startCornerResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onResize) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startCols = cols;
    const startRows = rows;
    const cw = cellSize.w;
    const ch = cellSize.h;

    const onMove = (ev: PointerEvent) => {
      const nextCols = Math.max(30, Math.min(140, startCols + Math.round((ev.clientX - startX) / cw)));
      const nextRows = Math.max(10, Math.min(45, startRows + Math.round((ev.clientY - startY) / ch)));
      onResize(nextCols, nextRows);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const boxRect = (r: Rect) => ({
    x: r.x * cellSize.w,
    y: r.y * cellSize.h,
    width: Math.max(0, r.w * cellSize.w),
    height: Math.max(0, r.h * cellSize.h),
  });

  const hoveredTel = telemetry.find((t) => t.id === hoveredId) ?? null;
  const selectedTel = telemetry.find((t) => t.id === selectedId) ?? null;
  const overflows = telemetry.filter((t) => t.overflowX || t.overflowY);
  const selectedNode = findNode(doc, selectedId);
  const canMutateSelected = selectedNode && selectedId !== doc.root.id && !doc.overlays.some((o) => o.node.id === selectedId);

  const canvasPixelW = Math.ceil(cols * cellSize.w);
  const quickBarLeft = selectedTel
    ? Math.max(6, Math.min(canvasPixelW - 310, selectedTel.margin.x * cellSize.w + 6))
    : 6;
  const quickBarTop = selectedTel
    ? selectedTel.margin.y <= 1
      ? Math.max(6, selectedTel.margin.y * cellSize.h + 8)
      : Math.max(6, selectedTel.margin.y * cellSize.h - 28)
    : 6;

  return (
    <div
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={handleKeyDown}
      style={{
        position: "relative",
        display: "inline-flex",
        flexDirection: "column",
        border: `1px solid ${focused ? "var(--cs-pink)" : "var(--cs-border-strong)"}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--cs-panel)",
        boxShadow: focused
          ? "0 0 0 2px var(--cs-pink-bg), var(--cs-shadow)"
          : "0 14px 36px rgba(0,0,0,0.22)",
        outline: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderBottom: "1px solid var(--cs-border)", fontSize: 12, gap: 8, background: "var(--cs-card-alt)" }}>
        <span style={{ fontWeight: 600, color: "var(--cs-text-strong)", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span>{title}</span>
          <span style={{ color: "var(--cs-text-dim)", fontWeight: 400 }}>{cols}×{rows}</span>
          {focused && (
            <Tooltip title="Live Terminal Focus" content="Keystrokes go straight to the active pane. Press Tab to jump between panes.">
              <span style={{ color: "var(--cs-pink)", marginLeft: 4, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Keyboard size={12} />
                <span>Keys → #{selectedId}</span>
              </span>
            </Tooltip>
          )}
        </span>
        {overflows.length > 0 ? (
          <Tooltip
            title="Layout Overflow Detected"
            content={`${overflows.map((o) => `#${o.id}: ${o.overflowMsg ?? "exceeds terminal bounds"}`).join(" • ")} Click to select and adjust Width or Collapse Below.`}
          >
            <span
              onClick={() => onSelect(overflows[0].id)}
              style={{ cursor: "pointer", color: "#e11d48", background: "rgba(244, 63, 94, 0.14)", border: "1px solid rgba(244, 63, 94, 0.45)", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
            >
              <AlertTriangle size={11} />
              <span>Overflow: {overflows.map((o) => `#${o.id}`).join(", ")}</span>
            </span>
          </Tooltip>
        ) : (
          <Tooltip content="Every pane fits cleanly inside this terminal size with zero clipping.">
            <span style={{ color: "var(--cs-mint)", background: "var(--cs-mint-bg)", border: "1px solid var(--cs-mint-border)", borderRadius: 999, padding: "1px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Check size={11} />
              <span>Clean</span>
            </span>
          </Tooltip>
        )}
      </div>

      <div style={{ position: "relative", padding: 6, background: palette.background }}>
        {!ready && (
          <div style={{ padding: 24, fontSize: 12, color: "var(--cs-text-muted)", fontFamily: "ui-monospace, monospace" }}>
            Booting Go Lip Gloss engine...
          </div>
        )}
        <canvas ref={canvasRef} style={{ display: ready ? "block" : "none" }} />
        <svg
          onMouseMove={(e) => setHoveredId(hitTest(e)?.id ?? null)}
          onMouseLeave={() => setHoveredId(null)}
          onClick={(e) => {
            e.currentTarget.closest<HTMLElement>("[tabindex]")?.focus();
            const hit = hitTest(e);
            if (hit) onSelect(hit.id);
          }}
          onDoubleClick={(e) => {
            const hit = hitTest(e);
            if (hit) {
              onSelect(hit.id);
              openInlineEditForNode(hit.id);
            }
          }}
          style={{ position: "absolute", inset: 6, width: "calc(100% - 12px)", height: "calc(100% - 12px)", cursor: "pointer" }}
        >
          {showOverlay && hoveredTel && hoveredTel.id !== selectedId && (
            <rect {...boxRect(hoveredTel.margin)} fill="rgba(196, 181, 253, 0.09)" stroke="#c4b5fd" strokeDasharray="4 3" />
          )}
          {showOverlay && selectedTel && (
            <>
              <rect {...boxRect(selectedTel.margin)}  fill="rgba(251, 146, 60, 0.16)" stroke="#fb923c" strokeWidth={1.5} />
              <rect {...boxRect(selectedTel.padding)} fill="rgba(74, 222, 128, 0.14)" stroke="#4ade80" strokeDasharray="3 2" />
              <rect {...boxRect(selectedTel.content)} fill="rgba(96, 165, 250, 0.18)" stroke="#60a5fa" />
            </>
          )}
          {!showOverlay && hoveredTel && hoveredTel.id !== selectedId && (
            <rect {...boxRect(hoveredTel.border)} fill="transparent" stroke="rgba(255, 117, 181, 0.45)" strokeDasharray="3 3" />
          )}
        </svg>

        {/* Floating On-Canvas Quick-Action Bar */}
        {showQuickBar && ready && selectedTel && selectedNode?.kind === "Box" && !inlineEdit && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: quickBarLeft,
              top: quickBarTop,
              zIndex: 20,
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "3px 6px",
              borderRadius: 7,
              background: "var(--cs-surface)",
              border: "1px solid var(--cs-pink-border)",
              boxShadow: "var(--cs-shadow)",
              fontSize: 11,
              whiteSpace: "nowrap",
              transition: "opacity 150ms ease, transform 150ms ease",
            }}
          >
            <span style={{ fontWeight: 700, color: "var(--cs-pink)", padding: "0 4px", fontFamily: "ui-monospace, monospace" }}>
              #{selectedId}
            </span>
            {onQuickSplit && canMutateSelected && (
              <>
                <button onClick={() => onQuickSplit(selectedId, "JoinHorizontal")} title="Split Right (Row)" style={qBtn}>
                  <Columns2 size={11} />
                  <span>Split R</span>
                </button>
                <button onClick={() => onQuickSplit(selectedId, "JoinVertical")} title="Split Below (Stack)" style={qBtn}>
                  <Rows2 size={11} />
                  <span>Split B</span>
                </button>
              </>
            )}
            {onQuickWidgetPicker && (
              <button onClick={() => onQuickWidgetPicker(selectedId)} title="Insert Charm component beside this pane" style={qBtn}>
                <Plus size={11} />
                <span>Widget</span>
              </button>
            )}
            <button onClick={() => openInlineEditForNode(selectedId)} title="Edit pane text / data" style={qBtn}>
              <Pencil size={11} />
              <span>Edit</span>
            </button>
            {onQuickClone && canMutateSelected && (
              <button onClick={() => onQuickClone(selectedId)} title="Duplicate pane" style={qBtn}>
                <Copy size={11} />
              </button>
            )}
            {onQuickDelete && canMutateSelected && (
              <button onClick={() => onQuickDelete(selectedId)} title="Delete pane" style={{ ...qBtn, color: "#e11d48" }}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}

        {/* Double-Click Inline Quick-Edit Popover */}
        {inlineEdit && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 30,
              width: "min(380px, 92%)",
              background: "var(--cs-surface)",
              border: "1px solid var(--cs-pink)",
              borderRadius: 10,
              padding: 12,
              boxShadow: "var(--cs-shadow)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, color: "var(--cs-text-heading)" }}>
              <span>Quick Edit #{inlineEdit.id}</span>
              <span style={{ fontSize: 10.5, color: "var(--cs-text-dim)" }}>Cmd/Ctrl + Enter to apply</span>
            </div>
            <textarea
              autoFocus
              rows={5}
              value={inlineEdit.text}
              onChange={(e) => setInlineEdit({ ...inlineEdit, text: e.target.value })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  onQuickInlineEdit?.(inlineEdit.id, inlineEdit.text);
                  setInlineEdit(null);
                } else if (e.key === "Escape") {
                  setInlineEdit(null);
                }
              }}
              style={{
                width: "100%",
                background: "var(--cs-input)",
                color: "var(--cs-text)",
                border: "1px solid var(--cs-btn-border)",
                borderRadius: 6,
                padding: 8,
                fontSize: 12,
                fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button onClick={() => setInlineEdit(null)} style={qBtn}>Cancel</button>
              <button
                onClick={() => {
                  onQuickInlineEdit?.(inlineEdit.id, inlineEdit.text);
                  setInlineEdit(null);
                }}
                style={{
                  ...qBtn,
                  background: "var(--cs-pink-bg)",
                  borderColor: "var(--cs-pink-border)",
                  color: "var(--cs-pink-soft)",
                  fontWeight: 700,
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

        {onResize && (
          <Tooltip title="Resize Terminal" content="Drag this corner handle to test how your layout adapts to different terminal widths and heights.">
            <div
              onPointerDown={startCornerResize}
              style={{
                position: "absolute",
                right: 2,
                bottom: 2,
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "nwse-resize",
                color: "#ff75b5",
                fontSize: 13,
                userSelect: "none",
                opacity: 0.9,
              }}
            >
              ⌟
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

const qBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)",
  color: "var(--cs-btn-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 5,
  padding: "2px 6px",
  fontSize: 10.5,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
};
