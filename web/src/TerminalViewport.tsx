import { useEffect, useRef, useState } from "react";
import { dispatchKey, ensureEngineReady, renderFrame } from "./wasmEngine";
import type { ColorProfile, IRDoc, Rect, TelemetryNode } from "./types";

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
  selectedId: string;
  onSelect: (id: string) => void;
  onInteract: () => void;
  onResize?: (cols: number, rows: number) => void;
  onTelemetry?: (tel: TelemetryNode[]) => void;
}

const FONT_STACK = `"JetBrains Mono", "SF Mono", Menlo, Monaco, ui-monospace, monospace`;

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
  selectedId,
  onSelect,
  onInteract,
  onResize,
  onTelemetry,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryNode[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [cellSize, setCellSize] = useState({ w: fontSize * 0.6, h: fontSize * 1.38 });

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
    return (
      [...telemetry].reverse().find(
        (n) => cx >= n.margin.x && cx < n.margin.x + n.margin.w && cy >= n.margin.y && cy < n.margin.y + n.margin.h
      ) ?? null
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const handled = dispatchKey(selectedId, e.key);
    if (handled) {
      e.preventDefault();
      onInteract();
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
        border: `1px solid ${focused ? "#ff75b5" : "#2a2440"}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "#12101c",
        boxShadow: focused
          ? "0 0 0 2px rgba(255, 117, 181, 0.22), 0 16px 40px rgba(0,0,0,0.5)"
          : "0 14px 36px rgba(0,0,0,0.45)",
        outline: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderBottom: "1px solid #26213a", fontSize: 12, gap: 8, background: "#171424" }}>
        <span style={{ fontWeight: 600, color: "#ede9fe" }}>
          {title} <span style={{ color: "#7e769e", fontWeight: 400 }}>{cols}×{rows}</span>
          {focused && <span style={{ color: "#ff75b5", marginLeft: 8, fontSize: 11 }}>⌨ Keys → #{selectedId}</span>}
        </span>
        {overflows.length > 0 ? (
          <span
            title={overflows.map((o) => `#${o.id}: ${o.overflowMsg ?? "overflow"}`).join("\n")}
            onClick={() => onSelect(overflows[0].id)}
            style={{ cursor: "pointer", color: "#fda4af", background: "rgba(244, 63, 94, 0.16)", border: "1px solid rgba(244, 63, 94, 0.45)", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}
          >
            ⚠ Overflow: {overflows.map((o) => `#${o.id}`).join(", ")}
          </span>
        ) : (
          <span style={{ color: "#5eead4", background: "rgba(94, 234, 212, 0.10)", border: "1px solid rgba(94, 234, 212, 0.30)", borderRadius: 999, padding: "1px 8px", fontSize: 11 }}>
            ✓ Clean
          </span>
        )}
      </div>

      <div style={{ position: "relative", padding: 6, background: palette.background }}>
        {!ready && (
          <div style={{ padding: 24, fontSize: 12, color: "#a59ec9", fontFamily: "ui-monospace, monospace" }}>
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
        </svg>

        {onResize && (
          <div
            onPointerDown={startCornerResize}
            title="Drag to resize terminal cols × rows"
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
        )}
      </div>
    </div>
  );
}
