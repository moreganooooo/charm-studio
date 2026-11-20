import type { ColorProfile, IRDoc, TelemetryNode } from "./types";

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

export function ensureEngineReady(): Promise<void> {
  if (!bootPromise) {
    bootPromise = (async () => {
      if (!window.renderStudio) {
        const go = new window.Go();
        const result = await WebAssembly.instantiateStreaming(fetch("/studio.wasm"), go.importObject);
        go.run(result.instance);
      }
    })();
  }
  return bootPromise;
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
  const raw = window.renderStudio(JSON.stringify(doc), cols, rows, darkBG, colorProfile);
  return JSON.parse(raw) as StudioFrame;
}

export function dispatchKey(nodeId: string, key: string): boolean {
  if (!window.dispatchStudioKey) return false;
  return window.dispatchStudioKey(nodeId, key);
}
