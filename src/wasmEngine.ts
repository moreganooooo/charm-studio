import { dispatchCharmWidgetKey, isCustomHydratedWidget, renderCharmWidgetContent } from "./charmWidgets";
import type { ColorProfile, IRDoc, IRNode, Rect, TelemetryNode } from "./types";

declare global {
  interface Window {
    Go: new () => { importObject: WebAssembly.Imports; run: (inst: WebAssembly.Instance) => void };
    renderStudio?: (irJson: string, cols: number, rows: number, hasDarkBG: boolean, colorProfile: string) => string;
    dispatchStudioKey?: (nodeId: string, key: string) => boolean;
    hitTestStudio?: (col: number, row: number) => string | null;
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

export interface HitTestResult {
  id: string;
  bounds: Rect;
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
      const cacheKey = `${cols}x${rows}:${n.id}`; const size = telMap?.get(n.id) ?? boxSizeCache.get(cacheKey) ?? { w: n.width?.mode === "fixed" ? Math.max(8, (n.width.value ?? 30) - 4) : Math.max(20, Math.floor(cols / 2) - 4), h: n.height?.mode === "fixed" ? Math.max(2, (n.height.value ?? 6) - 2) : Math.max(6, rows - 6), }; n.content = renderCharmWidgetContent(n, next, size.w, size.h, darkBG, cols, rows); // Force WASM to render the hydrated ANSI string directly when custom data is active if (n.contentType?.startsWith("bubble:")) { n.contentType = "text"; } } n.children?.forEach(walk); }; walk(next.root); next.overlays.forEach((o) => walk(o.node)); return next; }  export function renderFrame( doc: IRDoc, cols: number, rows: number, darkBG: boolean, colorProfile: ColorProfile = "truecolor" ): StudioFrame { if (!window.renderStudio) { return { cells: [], telemetry: [], error: "WASM engine not ready" }; }  // Single-pass render preserves all Z-indexed layers in Go's lastCompositor for hitTestStudio const runPass = (targetDoc: IRDoc): StudioFrame => { const raw = window.renderStudio!(JSON.stringify(targetDoc), cols, rows, darkBG, colorProfile); return JSON.parse(raw) as StudioFrame; };  if (!hasCustomHydratedWidgets(doc)) { return runPass(doc); }  const firstDoc = hydrateWidgetsForWasm(doc, cols, rows, darkBG); const firstFrame = runPass(firstDoc); if (firstFrame.error) return firstFrame;  const telMap = new Map<string, { w: number; h: number }>(); let needsRefit = false; for (const t of firstFrame.telemetry ?? []) { const w = Math.max(4, t.content.w); const h = Math.max(1, t.content.h); telMap.set(t.id, { w, h }); const cacheKey = `${cols}x${rows}:${t.id}`;
    const prev = boxSizeCache.get(cacheKey);
    if (!prev || prev.w !== w || prev.h !== h) {
      boxSizeCache.set(cacheKey, { w, h });
      needsRefit = true;
    }
  }

  if (!needsRefit) return firstFrame;

  const fittedDoc = hydrateWidgetsForWasm(doc, cols, rows, darkBG, telMap);
  return runPass(fittedDoc);
}

export function dispatchKey(nodeId: string, key: string, shiftKey = false): boolean {
  const normalizedKey = shiftKey && key === "Tab" ? "Shift+Tab" : key;
  if (dispatchCharmWidgetKey(nodeId, normalizedKey)) return true;
  if (!window.dispatchStudioKey) return false;
  return window.dispatchStudioKey(nodeId, normalizedKey);
}

export function hitTestCell(col: number, row: number): HitTestResult | null {
  if (!window.hitTestStudio) return null;
  const raw = window.hitTestStudio(col, row);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HitTestResult;
  } catch {
    return null;
  }
}
