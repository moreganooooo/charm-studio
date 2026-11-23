import { useEffect, useRef, useState } from "react";
import type { TermPalette } from "../TerminalViewport";
import type { ColorProfile } from "../types";
import type { StudioFrame } from "../previewTransport";
import { ensureEngineReady, renderFrame } from "../wasmEngine";
import type { WidgetPreset } from "../widgetPresets";

const FONT_STACK = `"JetBrains Mono", "SF Mono", Menlo, monospace`;

const previewFrameCache = new Map<string, StudioFrame>();

function buildCacheKey(
  preset: WidgetPreset,
  palette: TermPalette,
  colorProfile: ColorProfile
): string {
  return [
    preset.id,
    palette.id,
    palette.darkBG ? "dark" : "light",
    palette.background,
    palette.foreground,
    colorProfile,
  ].join(":");
}

interface Props {
  preset: WidgetPreset;
  palette: TermPalette;
  colorProfile: ColorProfile;
  fontFamily?: string;
  fontSize?: number;
  loadingLabel: string;
  errorLabel: string;
}

export function WidgetPreviewCanvas({
  preset,
  palette,
  colorProfile,
  fontFamily = FONT_STACK,
  fontSize = 10,
  loadingLabel,
  errorLabel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engineReady, setEngineReady] = useState(
    () => typeof window !== "undefined" && Boolean(window.renderStudio)
  );

  useEffect(() => {
    if (engineReady) return;
    let cancelled = false;
    ensureEngineReady().then(() => {
      if (!cancelled) setEngineReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [engineReady]);

  useEffect(() => {
    if (!engineReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const cols = preset.previewCols;
    const rows = preset.previewRows;
    const cacheKey = buildCacheKey(preset, palette, colorProfile);
    let frame = previewFrameCache.get(cacheKey);
    if (!frame) {
      const miniDoc = preset.buildPreviewDoc({
        id: palette.id,
        darkBG: palette.darkBG,
        background: palette.background,
        foreground: palette.foreground,
      });
      frame = renderFrame(miniDoc, cols, rows, palette.darkBG, colorProfile);
      if (!frame.error) {
        if (previewFrameCache.size > 120) {
          previewFrameCache.clear();
        }
        previewFrameCache.set(cacheKey, frame);
      }
    }

    ctx.font = `${fontSize}px ${fontFamily}`;
    const cw = Math.ceil(ctx.measureText("M").width * 10) / 10;
    const ch = Math.ceil(fontSize * 1.38);

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = Math.ceil(cols * cw);
    const cssH = Math.ceil(rows * ch);
    canvas.width = Math.ceil(cssW * dpr);
    canvas.height = Math.ceil(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, cssW, cssH);

    if (frame.error) {
      ctx.fillStyle = palette.foreground;
      ctx.globalAlpha = 0.72;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `11px ${fontFamily}`;
      ctx.fillText(errorLabel, cssW / 2, cssH / 2);
      ctx.globalAlpha = 1;
      return;
    }

    ctx.textAlign = "left";
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
  }, [engineReady, preset, palette, colorProfile, fontFamily, fontSize, errorLabel]);

  return (
    <div
      className="widget-picker-preview-stage"
      style={{ background: palette.background }}
      inert
      aria-hidden="true"
    >
      {!engineReady ? (
        <div
          className="widget-picker-preview-skeleton cs-mono"
          style={{ color: palette.foreground }}
        >
          {loadingLabel}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="widget-picker-preview-canvas"
          aria-hidden="true"
        />
      )}
    </div>
  );
}
