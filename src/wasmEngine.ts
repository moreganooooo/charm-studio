import {
  WailsTransport,
  WasmTransport,
  isWailsRuntimeAvailable,
  type CellDTO,
  type GoDiffDeltaDTO,
  type GoDiffLineDTO,
  type GoDiffResponse,
  type GoParseResponse,
  type GoSyncResponse,
  type HitTestResult,
  type PreviewKeyOptions,
  type PreviewMouseEvent,
  type PreviewTransport,
  type StudioFrame,
} from "./previewTransport";
import type { ColorProfile, IRDoc } from "./types";

export type {
  CellDTO,
  GoDiffDeltaDTO,
  GoDiffLineDTO,
  GoDiffResponse,
  GoParseResponse,
  GoSyncResponse,
  HitTestResult,
  PreviewKeyOptions,
  PreviewMouseEvent,
  PreviewTransport,
  StudioFrame,
};

export const wasmTransport = new WasmTransport();
export const wailsTransport = new WailsTransport(wasmTransport);

let activeTransport: PreviewTransport = isWailsRuntimeAvailable() ? wailsTransport : wasmTransport;

export function getActiveTransport(): PreviewTransport {
  return activeTransport;
}

export function setActiveTransport(mode: "wasm" | "wails"): PreviewTransport {
  activeTransport = mode === "wails" ? wailsTransport : wasmTransport;
  return activeTransport;
}

export function ensureEngineReady(): Promise<void> {
  return wasmTransport.init();
}

export function renderFrame(
  doc: IRDoc,
  cols: number,
  rows: number,
  darkBG: boolean,
  colorProfile: ColorProfile = "truecolor"
): StudioFrame {
  return wasmTransport.render(doc, cols, rows, darkBG, colorProfile);
}

export function dispatchKey(nodeId: string, key: string, shiftKey = false): boolean {
  return wasmTransport.sendKey(nodeId, key, { shiftKey });
}

export function hitTestCell(col: number, row: number): HitTestResult | null {
  return wasmTransport.sendMouse(col, row);
}

export function parseGoWithDst(goSrc: string): GoParseResponse | null {
  return wasmTransport.parseGo(goSrc);
}

export function syncGoWithDst(existingGo: string, doc: IRDoc): GoSyncResponse {
  return wasmTransport.patchGo(existingGo, doc);
}

export function computeGoDiffWithDst(beforeGo: string, afterGo: string): GoDiffResponse | null {
  return wasmTransport.computeDiff(beforeGo, afterGo);
}

export async function parseGoWithTransport(goSrc: string): Promise<GoParseResponse | null> {
  if (activeTransport.mode === "wails") {
    return await wailsTransport.parseGo(goSrc);
  }
  return wasmTransport.parseGo(goSrc);
}

export async function syncGoWithTransport(existingGo: string, doc: IRDoc): Promise<GoSyncResponse> {
  if (activeTransport.mode === "wails") {
    return await wailsTransport.patchGo(existingGo, doc);
  }
  return wasmTransport.patchGo(existingGo, doc);
}

export async function computeGoDiffWithTransport(beforeGo: string, afterGo: string): Promise<GoDiffResponse | null> {
  if (activeTransport.mode === "wails") {
    return await wailsTransport.computeDiff(beforeGo, afterGo);
  }
  return wasmTransport.computeDiff(beforeGo, afterGo);
}
