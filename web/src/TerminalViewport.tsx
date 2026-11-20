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
  palette: TermPalette;
  colorProfile: ColorProfile;
  showOverlay: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
  onInteract: () => void;
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
  palette,
  colorProfile,
  showOverlay,
  selectedId,
  onSelect,
  onInteract,
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

    ctx.font = `${fontSize}px ${FONT_STACK}`;
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
          ctx.font = `${isItalic ? "italic " : ""}${isBold ? "700 " : "400 "}${fontSize}px ${FONT_STACK}`;
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
  }, [ready, doc, renderTick, cols, rows, fontSize, palette, colorProfile]);

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
        display: "inline-flex",
        flexDirection: "column",
        border: `1px solid ${focused ? "#7aa2f7" : "#262b3d"}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "#111520",
        boxShadow: focused ? "0 0 0 2px rgba(122, 162, 247, 0.25), 0 14px 36px rgba(0,0,0,0.45)" : "0 14px 36px rgba(0,0,0,0.4)",
        outline: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderBottom: "1px solid #1e2436", fontSize: 12, gap: 8 }}>
        <span style={{ fontWeight: 600, color: "#cbd5e1" }}>
          {title} <span style={{ color: "#64748b", fontWeight: 400 }}>{cols}×{rows}</span>
          {focused && <span style={{ color: "#7aa2f7", marginLeft: 8, fontSize: 11 }}>⌨ Keys → #{selectedId}</span>}
        </span>
        {overflows.length > 0 ? (
          <span
            title={overflows.map((o) => `#${o.id}: ${o.overflowMsg ?? "overflow"}`).join("\n")}
            onClick={() => onSelect(overflows[0].id)}
            style={{ cursor: "pointer", color: "#fca5a5", background: "rgba(239, 68, 68, 0.16)", border: "1px solid rgba(239, 68, 68, 0.4)", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 600 }}
          >
            ⚠ Overflow: {overflows.map((o) => `#${o.id}`).join(", ")}
          </span>
        ) : (
          <span style={{ color: "#86efac", background: "rgba(34, 197, 94, 0.12)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: 999, padding: "1px 8px", fontSize: 11 }}>
            ✓ Clean
          </span>
        )}
      </div>

      <div style={{ position: "relative", padding: 6, background: palette.background }}>
        {!ready && (
          <div style={{ padding: 24, fontSize: 12, color: "#94a3b8", fontFamily: "ui-monospace, monospace" }}>
            Booting Go Lip Gloss WASM...
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
            <rect {...boxRect(hoveredTel.margin)} fill="rgba(148, 163, 184, 0.10)" stroke="#94a3b8" strokeDasharray="4 3" />
          )}
          {showOverlay && selectedTel && (
            <>
              <rect {...boxRect(selectedTel.margin)}  fill="rgba(251, 146, 60, 0.16)" stroke="#fb923c" strokeWidth={1.5} />
              <rect {...boxRect(selectedTel.padding)} fill="rgba(74, 222, 128, 0.14)" stroke="#4ade80" strokeDasharray="3 2" />
              <rect {...boxRect(selectedTel.content)} fill="rgba(96, 165, 250, 0.18)" stroke="#60a5fa" />
            </>
          )}
        </svg>
      </div>
    </div>
  );
}
