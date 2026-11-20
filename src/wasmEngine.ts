import { dispatchCharmWidgetKey, isCustomHydratedWidget, renderCharmWidgetContent } from "./charmWidgets";
import type { ColorProfile, IRDoc, IRNode, IROverlay, TelemetryNode } from "./types";

declare global {
  interface Window {
    Go: new () => { importObject: WebAssembly.Imports; run: (inst: WebAssembly.Instance) => void };
    renderStudio?: (irJson: string, cols: number, rows: number, hasDarkBG: boolean, colorProfile: string) => string;
    dispatchStudioKey?: (nodeId: string, key: string) => boolean;
  }
}

export interface CellDTO {
  c?: string;
  f?: string;
  b?: string;
  a?: number;
  w?: number;
}

export interface StudioFrame {
  cells: CellDTO[];
  telemetry: TelemetryNode[];
  error?: string;
}

let bootPromise: Promise<void> | null = null;
const boxSizeCache = new Map<string, { w: number; h: number }>();

export function ensureEngineReady(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      if (!window.renderStudio) {
        const go = new window.Go();
        const result = await WebAssembly.instantiateStreaming(fetch(`${import.meta.env.BASE_URL}studio.wasm`), go.importObject);
        go.run(result.instance);
      }
    })();
  }
  return bootPromise;
}

function hasCustomHydratedWidgets(doc: IRDoc): boolean {
  let found = false;
  const walk = (n: IRNode) => {
    if (isCustomHydratedWidget(n)) found = true;
    n.children?.forEach(walk);
  };
  walk(doc.root);
  doc.overlays.forEach((o) => walk(o.node));
  return found;
}

function hydrateWidgetsForWasm(
  doc: IRDoc,
  cols: number,
  rows: number,
  darkBG: boolean,
  telMap?: Map<string, { w: number; h: number }>
): IRDoc {
  const next = structuredClone(doc);
  const walk = (n: IRNode) => {
    if (isCustomHydratedWidget(n)) {
      const cacheKey = `${cols}x${rows}:${n.id}`;
      const size = telMap?.get(n.id) ?? boxSizeCache.get(cacheKey) ?? {
        w: n.width?.mode === "fixed" ? Math.max(8, (n.width.value ?? 30) - 4) : Math.max(20, Math.floor(cols / 2) - 4),
        h: n.height?.mode === "fixed" ? Math.max(2, (n.height.value ?? 6) - 2) : Math.max(6, rows - 6),
      };
      n.content = renderCharmWidgetContent(n, next, size.w, size.h, darkBG, cols, rows);
      // Force WASM to render the hydrated ANSI string directly when custom data is active
      if (n.contentType?.startsWith("bubble:")) {
        n.contentType = "text";
      }
    }
    n.children?.forEach(walk);
  };
  walk(next.root);
  next.overlays.forEach((o) => walk(o.node));
  return next;
}

function computeAnchoredOrigin(ov: IROverlay, cols: number, rows: number): { ox: number; oy: number; ow: number; oh: number } {
  const rawW = ov.node.width?.value ?? 44;
  const rawH = ov.node.height?.value ?? 8;
  const anchor = ov.anchor ?? "center";

  if (anchor === "top-right") {
    const ow = Math.min(cols, Math.max(16, rawW));
    const oh = Math.min(rows, Math.max(3, rawH));
    return { ox: Math.max(0, cols - ow - 1), oy: 1, ow, oh };
  }
  if (anchor === "bottom-right") {
    const ow = Math.min(cols, Math.max(16, rawW));
    const oh = Math.min(rows, Math.max(3, rawH));
    return { ox: Math.max(0, cols - ow - 1), oy: Math.max(0, rows - oh - 1), ow, oh };
  }
  if (anchor === "bottom-bar") {
    const ow = Math.min(cols, Math.max(20, cols - 4));
    const oh = Math.min(rows, Math.max(3, Math.min(6, rawH)));
    return { ox: Math.max(0, Math.floor((cols - ow) / 2)), oy: Math.max(0, rows - oh - 1), ow, oh };
  }
  const ow = Math.min(cols, Math.max(12, rawW));
  const oh = Math.min(rows, Math.max(3, rawH));
  return { ox: Math.max(0, Math.floor((cols - ow) / 2)), oy: Math.max(0, Math.floor((rows - oh) / 2)), ow, oh };
}

function compositeAnchoredOverlays(
  baseFrame: StudioFrame,
  hydratedDoc: IRDoc,
  anchoredOverlays: IROverlay[],
  cols: number,
  rows: number,
  darkBG: boolean,
  colorProfile: ColorProfile
): StudioFrame {
  if (anchoredOverlays.length === 0 || !window.renderStudio) return baseFrame;

  const sorted = [...anchoredOverlays].sort((a, b) => a.z - b.z);
  const cells = [...baseFrame.cells];
  const telemetry = [...baseFrame.telemetry];

  for (const ov of sorted) {
    const { ox, oy, ow, oh } = computeAnchoredOrigin(ov, cols, rows);
    const subDoc: IRDoc = {
      tokens: hydratedDoc.tokens,
      styles: hydratedDoc.styles,
      root: {
        ...ov.node,
        width: { mode: "fixed", value: ow },
        height: { mode: "fixed", value: oh },
      },
      overlays: [],
    };
    const raw = window.renderStudio(JSON.stringify(subDoc), ow, oh, darkBG, colorProfile);
    const subFrame = JSON.parse(raw) as StudioFrame;
    if (subFrame.error) continue;

    for (let r = 0; r < oh; r++) {
      const dstY = oy + r;
      if (dstY < 0 || dstY >= rows) continue;
      for (let c = 0; c < ow; c++) {
        const dstX = ox + c;
        if (dstX < 0 || dstX >= cols) continue;
        const srcCell = subFrame.cells[r * ow + c];
        if (!srcCell) continue;
        // Overlay cell fills onto compositor canvas
        cells[dstY * cols + dstX] = srcCell;
      }
    }

    for (const t of subFrame.telemetry ?? []) {
      const shift = (rect: { x: number; y: number; w: number; h: number }) => ({
        x: rect.x + ox,
        y: rect.y + oy,
        w: rect.w,
        h: rect.h,
      });
      telemetry.push({
        ...t,
        margin: shift(t.margin),
        border: shift(t.border),
        padding: shift(t.padding),
        content: shift(t.content),
      });
    }
  }

  return { cells, telemetry };
}

export function renderFrame(
  doc: IRDoc,
  cols: number,
  rows: number,
  darkBG: boolean,
  colorProfile: ColorProfile = "truecolor"
): StudioFrame {
  if (!window.renderStudio) {
    return { cells: [], telemetry: [], error: "WASM engine not ready" };
  }

  const runWithHydration = (hydratedDoc: IRDoc): StudioFrame => {
    const centerOverlays = hydratedDoc.overlays.filter((o) => !o.anchor || o.anchor === "center");
    const anchoredOverlays = hydratedDoc.overlays.filter((o) => o.visible && o.anchor && o.anchor !== "center");
    const mainDoc = anchoredOverlays.length > 0 ? { ...hydratedDoc, overlays: centerOverlays } : hydratedDoc;
    const raw = window.renderStudio!(JSON.stringify(mainDoc), cols, rows, darkBG, colorProfile);
    const baseFrame = JSON.parse(raw) as StudioFrame;
    if (baseFrame.error) return baseFrame;
    return compositeAnchoredOverlays(baseFrame, hydratedDoc, anchoredOverlays, cols, rows, darkBG, colorProfile);
  };

  if (!hasCustomHydratedWidgets(doc)) {
    return runWithHydration(doc);
  }

  const firstDoc = hydrateWidgetsForWasm(doc, cols, rows, darkBG);
  const firstFrame = runWithHydration(firstDoc);
  if (firstFrame.error) return firstFrame;

  const telMap = new Map<string, { w: number; h: number }>();
  let needsRefit = false;
  for (const t of firstFrame.telemetry ?? []) {
    const w = Math.max(4, t.content.w);
    const h = Math.max(1, t.content.h);
    telMap.set(t.id, { w, h });
    const cacheKey = `${cols}x${rows}:${t.id}`;
    const prev = boxSizeCache.get(cacheKey);
    if (!prev || prev.w !== w || prev.h !== h) {
      boxSizeCache.set(cacheKey, { w, h });
      needsRefit = true;
    }
  }

  if (!needsRefit) return firstFrame;

  const fittedDoc = hydrateWidgetsForWasm(doc, cols, rows, darkBG, telMap);
  return runWithHydration(fittedDoc);
}

export function dispatchKey(nodeId: string, key: string): boolean {
  if (dispatchCharmWidgetKey(nodeId, key)) return true;
  if (!window.dispatchStudioKey) return false;
  return window.dispatchStudioKey(nodeId, key);
}
