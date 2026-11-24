import { Call, Events } from "@wailsio/runtime";
import {
  dispatchCharmWidgetKey,
  getOverlayHarmonicaOffset,
  isCustomHydratedWidget,
  renderCharmWidgetContent,
} from "./charmWidgets";
import { clipVisible, fg, padRightVisible, resolveColorRef, visibleLen } from "./charmWidgetsExtra";
import type { AstDelta, DiffLine } from "./astDiff";
import type { ColorProfile, ContentType, IRCustomBorder, IRDoc, IRNode, IROverlay, IRStyle, Rect, TelemetryNode, TokenPair } from "./types";

declare global {
  interface Window {
    Go: new () => { importObject: WebAssembly.Imports; run: (inst: WebAssembly.Instance) => void };
    renderStudio?: (irJson: string, cols: number, rows: number, hasDarkBG: boolean, colorProfile: string) => string;
    dispatchStudioKey?: (nodeId: string, key: string) => boolean;
    hitTestStudio?: (col: number, row: number) => string | null;
    parseGoSource?: (goSrc: string) => string;
    syncGoSource?: (existingGo: string, irJson: string) => string;
    computeGoDiff?: (beforeGo: string, afterGo: string) => string;
    _wails?: unknown;
    wails?: unknown;
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

export interface GoParseResponse {
  styles?: Record<string, IRStyle>;
  tokens?: Record<string, TokenPair>;
  view?: IRDoc["view"];
  root?: IRNode;
  overlays?: IROverlay[];
  detectedBubbles?: ContentType[];
  styleNames?: string[];
  colorCount?: number;
  syncDisabled?: boolean;
  lockedSymbols?: string[];
  lockedProps?: Record<string, string[]>;
  lockReasons?: Record<string, "sync-disabled" | "dynamic">;
  dynamicExprs?: Record<string, Record<string, string>>;
  untouchedSymbols?: string[];
  error?: string;
}

export interface GoSyncResponse {
  updatedGo: string;
  patchedSymbols?: string[];
  lockedSymbols?: string[];
  lockedProps?: Record<string, string[]>;
  lockReasons?: Record<string, "sync-disabled" | "dynamic">;
  syncDisabled?: boolean;
  error?: string;
}

export interface GoDiffDeltaDTO {
  kind: "added" | "removed" | "modified" | "untouched" | "locked";
  category: "Node" | "Style" | "Token" | "Overlay" | "View" | "Func" | "Type" | "Lock";
  bucket?: "styles_tokens" | "layout_overlays" | "view_flags" | "locked_untouched";
  symbol: string;
  detail: string;
}

export interface GoDiffLineDTO {
  type: "ctx" | "add" | "del";
  oldLine?: number;
  newLine?: number;
  text: string;
}

export interface GoDiffResponse {
  deltas?: GoDiffDeltaDTO[];
  lines?: GoDiffLineDTO[];
  added?: number;
  removed?: number;
  error?: string;
}

export interface PreviewMouseEvent {
  button?: number;
  action?: "press" | "release" | "move" | "wheel";
  deltaY?: number;
}

export interface PreviewKeyOptions {
  shiftKey?: boolean;
  rawSeq?: string;
}

export interface PreviewTransport {
  readonly mode: "wasm" | "wails";
  init(): Promise<void>;
  render(doc: IRDoc, cols: number, rows: number, darkBG: boolean, colorProfile: ColorProfile): StudioFrame | Promise<StudioFrame>;
  sendKey(targetId: string, key: string, opts?: PreviewKeyOptions): boolean | Promise<boolean>;
  sendMouse(col: number, row: number, event?: PreviewMouseEvent): HitTestResult | null | Promise<HitTestResult | null>;
  resize(cols: number, rows: number): void | Promise<void>;
  setPolarity(darkBG: boolean): void;
  setColorProfile(profile: ColorProfile): void;
  parseGo(goSrc: string): GoParseResponse | null | Promise<GoParseResponse | null>;
  patchGo(existingGo: string, doc: IRDoc): GoSyncResponse | Promise<GoSyncResponse>;
  computeDiff(beforeGo: string, afterGo: string): GoDiffResponse | null | Promise<GoDiffResponse | null>;
}

export interface PtyStatus {
  state: "idle" | "building" | "running" | "error" | "stopped";
  dir: string;
  cols: number;
  rows: number;
  pid?: number;
  lastBuildMs?: number;
  error?: string;
  updatedAt: string;
}

export interface McpServerStatus {
  running: boolean;
  httpUrl: string;
  sseUrl: string;
  stdioCommand: string;
  activeDir: string;
  selectedId: string;
  resourceUris: string[];
  toolNames: string[];
}

export interface WorktreeSession {
  id: string;
  repoRoot: string;
  worktreeDir: string;
  branch: string;
  baseBranch: string;
  prompt: string;
  createdAt: string;
  activeInPty?: boolean;
}

export interface WorktreeFileDiff {
  path: string;
  status: string;
  deltas?: AstDelta[];
  lines?: DiffLine[];
  added: number;
  removed: number;
  rawPatch?: string;
}

export interface WorktreeDiffResult {
  session: WorktreeSession;
  files: WorktreeFileDiff[];
  summary: string;
  clean: boolean;
}

export function keyEventToVtSequence(key: string, opts?: PreviewKeyOptions): string {
  if (opts?.rawSeq !== undefined) return opts.rawSeq;
  if (opts?.shiftKey && key === "Tab") return "\x1b[Z";
  switch (key) {
    case "Enter":
      return "\r";
    case "Backspace":
      return "\x7f";
    case "Tab":
      return "\t";
    case "Escape":
      return "\x1b";
    case "ArrowUp":
      return "\x1b[A";
    case "ArrowDown":
      return "\x1b[B";
    case "ArrowRight":
      return "\x1b[C";
    case "ArrowLeft":
      return "\x1b[D";
    case "Home":
      return "\x1b[H";
    case "End":
      return "\x1b[F";
    case "PageUp":
      return "\x1b[5~";
    case "PageDown":
      return "\x1b[6~";
    case "Delete":
      return "\x1b[3~";
    default:
      return key.length === 1 ? key : "";
  }
}

export class WasmTransport implements PreviewTransport {
  readonly mode = "wasm" as const;
  private bootPromise: Promise<void> | null = null;
  private boxSizeCache = new Map<string, { w: number; h: number }>();
  private darkBG = true;
  private colorProfile: ColorProfile = "truecolor";
  private lastCols = 80;
  private lastRows = 24;

  init(): Promise<void> {
    if (!this.bootPromise) {
      this.bootPromise = (async () => {
        if (!window.renderStudio) {
          const go = new window.Go();
          const result = await WebAssembly.instantiateStreaming(
            fetch(`${import.meta.env.BASE_URL}studio.wasm`),
            go.importObject
          );
          go.run(result.instance);
        }
      })();
    }
    return this.bootPromise;
  }

  private hydratedTypes = new Map<string, ContentType>();

  private styleNeedsPreTransform(st?: IRStyle): boolean {
    if (!st) return false;
    return Boolean(
      st.border === "custom" ||
      (st.maxWidth && st.maxWidth > 0) ||
      (st.maxHeight && st.maxHeight > 0) ||
      st.placeH ||
      st.placeV
    );
  }

  private hasCustomHydratedWidgets(doc: IRDoc): boolean {
    let found = false;
    const walk = (n: IRNode) => {
      if (n.contentType && isCustomHydratedWidget(n)) {
        this.hydratedTypes.set(n.id, n.contentType);
        found = true;
      } else {
        this.hydratedTypes.delete(n.id);
      }
      if (n.style && this.styleNeedsPreTransform(doc.styles[n.style])) {
        found = true;
      }
      n.children?.forEach(walk);
    };
    walk(doc.root);
    doc.overlays.forEach((o) => {
      walk(o.node);
      if (o.visible && (o.anchor === "place" || o.harmonica?.enabled)) found = true;
    });
    return found;
  }

  private renderCustomBorderBox(
    content: string,
    st: IRStyle,
    tokens: Record<string, TokenPair>,
    darkBG: boolean,
    boxW: number,
    boxH: number
  ): string {
    const b: IRCustomBorder = st.customBorder ?? {
      top: "─",
      bottom: "─",
      left: "│",
      right: "│",
      topLeft: "┌",
      topRight: "┐",
      bottomLeft: "└",
      bottomRight: "┘",
    };
    const [eTop, eRight, eBottom, eLeft] = st.borderEdges ?? [true, true, true, true];
    const [pTop, pRight, pBottom, pLeft] = st.padding ?? [0, 0, 0, 0];
    const borderHex = resolveColorRef(tokens, st.borderColor, darkBG, darkBG ? "#b9a2ff" : "#5b37f0");
    const paint = (s: string) => (borderHex ? fg(borderHex, s) : s);

    const rawLines = (content || "").split("\n");
    const maxLineW = rawLines.reduce((m, l) => Math.max(m, visibleLen(l)), 0);
    const borderW = (eLeft ? 1 : 0) + (eRight ? 1 : 0);
    const borderH = (eTop ? 1 : 0) + (eBottom ? 1 : 0);

    const totalW = Math.max(borderW + pLeft + pRight + 1, boxW || maxLineW + pLeft + pRight + borderW);
    const innerContentW = Math.max(1, totalW - borderW - pLeft - pRight);
    const innerContentH = Math.max(1, boxH ? boxH - borderH - pTop - pBottom : rawLines.length);

    const out: string[] = [];
    const topBarChar = Array.from(b.top || "─")[0] ?? "─";
    const botBarChar = Array.from(b.bottom || "─")[0] ?? "─";
    const leftBarChar = Array.from(b.left || "│")[0] ?? "│";
    const rightBarChar = Array.from(b.right || "│")[0] ?? "│";

    if (eTop) {
      const tl = eLeft ? (b.topLeft || "+") : "";
      const tr = eRight ? (b.topRight || "+") : "";
      const span = Math.max(0, totalW - Array.from(tl).length - Array.from(tr).length);
      out.push(paint(`${tl}${topBarChar.repeat(span)}${tr}`));
    }

    const paddedBody: string[] = [];
    for (let i = 0; i < pTop; i++) paddedBody.push(" ".repeat(innerContentW));
    const clipped = rawLines.slice(0, innerContentH).map((l) => {
      const line = clipVisible(l, innerContentW);
      if (st.alignH === "center") {
        const pad = Math.max(0, innerContentW - visibleLen(line));
        const left = Math.floor(pad / 2);
        return " ".repeat(left) + line + " ".repeat(pad - left);
      }
      if (st.alignH === "right") {
        const pad = Math.max(0, innerContentW - visibleLen(line));
        return " ".repeat(pad) + line;
      }
      return padRightVisible(line, innerContentW);
    });
    while (clipped.length < innerContentH) clipped.push(" ".repeat(innerContentW));
    paddedBody.push(...clipped);
    for (let i = 0; i < pBottom; i++) paddedBody.push(" ".repeat(innerContentW));

    const lEdge = eLeft ? paint(leftBarChar) : "";
    const rEdge = eRight ? paint(rightBarChar) : "";
    for (const row of paddedBody) {
      out.push(`${lEdge}${" ".repeat(pLeft)}${row}${" ".repeat(pRight)}${rEdge}`);
    }

    if (eBottom) {
      const bl = eLeft ? (b.bottomLeft || "+") : "";
      const br = eRight ? (b.bottomRight || "+") : "";
      const span = Math.max(0, totalW - Array.from(bl).length - Array.from(br).length);
      out.push(paint(`${bl}${botBarChar.repeat(span)}${br}`));
    }

    return out.join("\n");
  }

  private applyPlaceAndMaxBounds(
    raw: string,
    st: IRStyle | undefined,
    boxW: number,
    boxH: number
  ): string {
    if (!st) return raw;
    const [pTop, pRight, pBottom, pLeft] = st.padding ?? [0, 0, 0, 0];
    const hasB = st.border !== "none" && st.border !== "custom";
    const [eTop, eRight, eBottom, eLeft] = st.borderEdges ?? [true, true, true, true];
    const frameW = pLeft + pRight + (hasB && eLeft ? 1 : 0) + (hasB && eRight ? 1 : 0);
    const frameH = pTop + pBottom + (hasB && eTop ? 1 : 0) + (hasB && eBottom ? 1 : 0);

    let maxW = boxW;
    if (st.maxWidth && st.maxWidth > 0) {
      maxW = Math.min(maxW || st.maxWidth, Math.max(1, st.maxWidth - frameW));
    }
    let maxH = boxH;
    if (st.maxHeight && st.maxHeight > 0) {
      maxH = Math.min(maxH || st.maxHeight, Math.max(1, st.maxHeight - frameH));
    }

    let lines = raw.split("\n");
    if (st.maxHeight && st.maxHeight > 0 && lines.length > maxH) {
      lines = lines.slice(0, maxH);
    }
    if (st.maxWidth && st.maxWidth > 0) {
      lines = lines.map((l) => (visibleLen(l) > maxW ? clipVisible(l, maxW) : l));
    }

    if ((st.placeH || st.placeV) && boxW > 0 && boxH > 0) {
      const targetW = Math.max(1, maxW);
      const targetH = Math.max(1, maxH);
      lines = lines.map((l) => {
        const vLen = visibleLen(l);
        if (vLen >= targetW) return clipVisible(l, targetW);
        if (st.placeH === "center") {
          const left = Math.floor((targetW - vLen) / 2);
          return " ".repeat(left) + l + " ".repeat(targetW - vLen - left);
        }
        if (st.placeH === "right") {
          return " ".repeat(targetW - vLen) + l;
        }
        return l;
      });
      if (lines.length < targetH && st.placeV) {
        const extra = targetH - lines.length;
        const topBlank = st.placeV === "top" ? 0 : st.placeV === "center" ? Math.floor(extra / 2) : extra;
        const bottomBlank = Math.max(0, extra - topBlank);
        lines = [
          ...Array.from({ length: topBlank }, () => ""),
          ...lines,
          ...Array.from({ length: bottomBlank }, () => ""),
        ];
      }
    }

    return lines.join("\n");
  }

  private hydrateWidgetsForWasm(
    doc: IRDoc,
    cols: number,
    rows: number,
    darkBG: boolean,
    telMap?: Map<string, { w: number; h: number }>
  ): IRDoc {
    const next = structuredClone(doc);
    const customBorderCloned = new Set<string>();

    const walk = (n: IRNode) => {
      const origStyle = n.style ? doc.styles[n.style] : undefined;
      const cacheKey = `${cols}x${rows}:${n.id}`;
      const fallbackW = n.width?.mode === "fixed" ? Math.max(8, (n.width.value ?? 30) - 2) : Math.max(20, Math.floor(cols / 2) - 4);
      const fallbackH = n.height?.mode === "fixed" ? Math.max(2, (n.height.value ?? 6) - 2) : Math.max(6, rows - 6);
      const telSize = telMap?.get(n.id) ?? this.boxSizeCache.get(cacheKey);
      let effW = telSize?.w ?? fallbackW;
      let effH = telSize?.h ?? fallbackH;

      if (origStyle?.maxWidth && origStyle.maxWidth > 0) {
        if (n.width?.mode === "fixed") {
          n.width = { ...n.width, value: Math.min(n.width.value ?? origStyle.maxWidth, origStyle.maxWidth) };
        }
        effW = Math.min(effW, Math.max(4, origStyle.maxWidth - 2));
      }
      if (origStyle?.maxHeight && origStyle.maxHeight > 0) {
        if (n.height?.mode === "fixed") {
          n.height = { ...n.height, value: Math.min(n.height.value ?? origStyle.maxHeight, origStyle.maxHeight) };
        }
        effH = Math.min(effH, Math.max(1, origStyle.maxHeight - 2));
      }

      if (isCustomHydratedWidget(n)) {
        n.content = renderCharmWidgetContent(n, next, effW, effH, darkBG, cols, rows);
        if (n.contentType?.startsWith("bubble:") || n.contentType === "huh:form") {
          n.contentType = "text";
        }
      }

      if (origStyle) {
        n.content = this.applyPlaceAndMaxBounds(n.content ?? "", origStyle, effW, effH);
        if (origStyle.border === "custom" && n.style) {
          const outerW = telSize
            ? telSize.w + (origStyle.padding?.[1] ?? 0) + (origStyle.padding?.[3] ?? 0) + ((origStyle.borderEdges?.[1] ?? true) ? 1 : 0) + ((origStyle.borderEdges?.[3] ?? true) ? 1 : 0)
            : (n.width?.mode === "fixed" ? (n.width.value ?? 30) : effW + 2);
          const outerH = telSize
            ? telSize.h + (origStyle.padding?.[0] ?? 0) + (origStyle.padding?.[2] ?? 0) + ((origStyle.borderEdges?.[0] ?? true) ? 1 : 0) + ((origStyle.borderEdges?.[2] ?? true) ? 1 : 0)
            : (n.height?.mode === "fixed" ? (n.height.value ?? 6) : effH + 2);
          n.content = this.renderCustomBorderBox(n.content, origStyle, next.tokens, darkBG, outerW, outerH);
          customBorderCloned.add(n.style);
        }
      }

      n.children?.forEach(walk);
    };

    walk(next.root);
    next.overlays.forEach((o) => walk(o.node));

    for (const styleKey of customBorderCloned) {
      if (next.styles[styleKey]) {
        next.styles[styleKey] = {
          ...next.styles[styleKey],
          border: "none",
          padding: [0, 0, 0, 0],
        };
      }
    }

    return next;
  }

  private compositeCustomOverlays(
    doc: IRDoc,
    hydratedDoc: IRDoc,
    baseFrame: StudioFrame,
    cols: number,
    rows: number,
    runPass: (d: IRDoc, w?: number, h?: number) => StudioFrame
  ): StudioFrame {
    const customOverlays = hydratedDoc.overlays.filter(
      (o) => o.visible && (o.anchor === "place" || Boolean(o.harmonica?.enabled))
    );
    if (customOverlays.length === 0) return baseFrame;

    const cells = [...baseFrame.cells];
    const telemetry = [...baseFrame.telemetry];
    const origMap = new Map(doc.overlays.map((o) => [o.id, o]));

    for (const ov of customOverlays) {
      const origOv = origMap.get(ov.id) ?? ov;
      let ovW = Math.max(10, origOv.node.width?.value ?? 44);
      const ovH = Math.max(3, origOv.node.height?.value ?? 9);
      const anchor = origOv.anchor ?? "center";

      let ox = Math.max(0, Math.floor((cols - ovW) / 2));
      let oy = Math.max(0, Math.floor((rows - ovH) / 2));
      if (anchor === "top-right") {
        ox = Math.max(0, cols - ovW - 1);
        oy = 1;
      } else if (anchor === "bottom-right") {
        ox = Math.max(0, cols - ovW - 1);
        oy = Math.max(0, rows - ovH - 1);
      } else if (anchor === "bottom-bar") {
        ovW = Math.max(20, cols - 4);
        ox = Math.max(0, Math.floor((cols - ovW) / 2));
        oy = Math.max(0, rows - ovH - 1);
      } else if (anchor === "place") {
        if (typeof origOv.placeX === "number") {
          ox = origOv.placeX;
        } else if (origOv.placeH === "right") {
          ox = Math.max(0, cols - ovW);
        } else if (origOv.placeH === "center") {
          ox = Math.max(0, Math.floor((cols - ovW) / 2));
        } else {
          ox = 0;
        }
        if (typeof origOv.placeY === "number") {
          oy = origOv.placeY;
        } else if (origOv.placeV === "bottom") {
          oy = Math.max(0, rows - ovH);
        } else if (origOv.placeV === "center") {
          oy = Math.max(0, Math.floor((rows - ovH) / 2));
        } else {
          oy = 0;
        }
      }

      if (origOv.harmonica?.enabled) {
        const dy = getOverlayHarmonicaOffset(origOv.id, origOv.visible, true);
        oy += dy;
      }

      const ovDoc: IRDoc = {
        tokens: hydratedDoc.tokens,
        styles: hydratedDoc.styles,
        root: {
          ...ov.node,
          width: { mode: "fixed", value: ovW },
          height: { mode: "fixed", value: ovH },
        },
        overlays: [],
      };
      const ovFrame = runPass(ovDoc, ovW, ovH);
      if (ovFrame.error) continue;

      for (let r = 0; r < ovH; r++) {
        const dstY = oy + r;
        if (dstY < 0 || dstY >= rows) continue;
        for (let c = 0; c < ovW; c++) {
          const dstX = ox + c;
          if (dstX < 0 || dstX >= cols) continue;
          const srcCell = ovFrame.cells[r * ovW + c];
          if (!srcCell) continue;
          if (!srcCell.c && !srcCell.b && !srcCell.f) continue;
          cells[dstY * cols + dstX] = srcCell;
        }
      }

      const ovTel = ovFrame.telemetry.find((t) => t.id === ov.node.id);
      if (ovTel) {
        const shiftRect = (rect: Rect): Rect => ({ ...rect, x: rect.x + ox, y: rect.y + oy });
        telemetry.push({
          ...ovTel,
          margin: shiftRect(ovTel.margin),
          border: shiftRect(ovTel.border),
          padding: shiftRect(ovTel.padding),
          content: shiftRect(ovTel.content),
        });
      }
    }

    return { cells, telemetry };
  }

  render(
    doc: IRDoc,
    cols: number,
    rows: number,
    darkBG: boolean,
    colorProfile: ColorProfile = this.colorProfile
  ): StudioFrame {
    this.lastCols = cols;
    this.lastRows = rows;
    this.darkBG = darkBG;
    this.colorProfile = colorProfile;

    if (!window.renderStudio) {
      return { cells: [], telemetry: [], error: "WASM engine not ready" };
    }

    const runPass = (targetDoc: IRDoc, passCols = cols, passRows = rows): StudioFrame => {
      const stripped: IRDoc = {
        ...targetDoc,
        overlays: targetDoc.overlays.map((o) =>
          o.visible && (o.anchor === "place" || Boolean(o.harmonica?.enabled))
            ? { ...o, visible: false }
            : o
        ),
      };
      const raw = window.renderStudio!(JSON.stringify(stripped), passCols, passRows, darkBG, colorProfile);
      return JSON.parse(raw) as StudioFrame;
    };

    if (!this.hasCustomHydratedWidgets(doc)) {
      const frame = runPass(doc);
      if (frame.error) return frame;
      return this.compositeCustomOverlays(doc, doc, frame, cols, rows, runPass);
    }

    const firstDoc = this.hydrateWidgetsForWasm(doc, cols, rows, darkBG);
    const firstFrame = runPass(firstDoc);
    if (firstFrame.error) return firstFrame;

    const telMap = new Map<string, { w: number; h: number }>();
    let needsRefit = false;
    for (const t of firstFrame.telemetry ?? []) {
      const w = Math.max(4, t.content.w);
      const h = Math.max(1, t.content.h);
      telMap.set(t.id, { w, h });
      const cacheKey = `${cols}x${rows}:${t.id}`;
      const prev = this.boxSizeCache.get(cacheKey);
      if (!prev || prev.w !== w || prev.h !== h) {
        this.boxSizeCache.set(cacheKey, { w, h });
        needsRefit = true;
      }
    }

    const finalDoc = needsRefit ? this.hydrateWidgetsForWasm(doc, cols, rows, darkBG, telMap) : firstDoc;
    const finalFrame = needsRefit ? runPass(finalDoc) : firstFrame;
    if (finalFrame.error) return finalFrame;
    return this.compositeCustomOverlays(doc, finalDoc, finalFrame, cols, rows, runPass);
  }

  sendKey(targetId: string, key: string, opts?: PreviewKeyOptions): boolean {
    const normalizedKey = opts?.shiftKey && key === "Tab" ? "Shift+Tab" : key;
    if (dispatchCharmWidgetKey(targetId, normalizedKey, this.hydratedTypes.get(targetId))) return true;
    if (!window.dispatchStudioKey) return false;
    return window.dispatchStudioKey(targetId, normalizedKey);
  }

  sendMouse(col: number, row: number): HitTestResult | null {
    if (!window.hitTestStudio) return null;
    const raw = window.hitTestStudio(col, row);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as HitTestResult;
    } catch {
      return null;
    }
  }

  resize(cols: number, rows: number): void {
    this.lastCols = cols;
    this.lastRows = rows;
  }

  setPolarity(darkBG: boolean): void {
    this.darkBG = darkBG;
  }

  setColorProfile(profile: ColorProfile): void {
    this.colorProfile = profile;
  }

  getViewportState() {
    return { cols: this.lastCols, rows: this.lastRows, darkBG: this.darkBG, colorProfile: this.colorProfile };
  }

  parseGo(goSrc: string): GoParseResponse | null {
    if (!window.parseGoSource) return null;
    try {
      return JSON.parse(window.parseGoSource(goSrc)) as GoParseResponse;
    } catch {
      return null;
    }
  }

  patchGo(existingGo: string, doc: IRDoc): GoSyncResponse {
    if (!window.syncGoSource) {
      return { updatedGo: existingGo, error: "WASM DST sync engine not loaded yet" };
    }
    try {
      return JSON.parse(window.syncGoSource(existingGo, JSON.stringify(doc))) as GoSyncResponse;
    } catch (err) {
      return { updatedGo: existingGo, error: (err as Error).message };
    }
  }

  computeDiff(beforeGo: string, afterGo: string): GoDiffResponse | null {
    if (!window.computeGoDiff) return null;
    try {
      return JSON.parse(window.computeGoDiff(beforeGo, afterGo)) as GoDiffResponse;
    } catch {
      return null;
    }
  }
}

export function isWailsRuntimeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window._wails || window.wails);
}

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:43120";

export class WailsTransport implements PreviewTransport {
  readonly mode = "wails" as const;
  private wasmFallback: WasmTransport;
  private bridgeUrl = DEFAULT_BRIDGE_URL;
  private ws: WebSocket | null = null;
  private outputListeners = new Set<(chunk: string) => void>();
  private statusListeners = new Set<(status: PtyStatus) => void>();
  private irListeners = new Set<(irJson: string) => void>();
  private darkBG = true;
  private colorProfile: ColorProfile = "truecolor";
  private wailsUnsubscribes: Array<() => void> = [];
  private wsConnected = false;

  constructor(wasmFallback: WasmTransport, bridgeUrl = DEFAULT_BRIDGE_URL) {
    this.wasmFallback = wasmFallback;
    this.bridgeUrl = bridgeUrl.replace(/\/$/, "");
  }

  getBridgeUrl(): string {
    return this.bridgeUrl;
  }

  setBridgeUrl(url: string): void {
    const clean = url.trim().replace(/\/$/, "") || DEFAULT_BRIDGE_URL;
    if (clean === this.bridgeUrl) return;
    this.bridgeUrl = clean;
    this.disconnectBridgeSocket();
  }

  isWebview(): boolean {
    return isWailsRuntimeAvailable();
  }

  private async invoke<T>(method: string, ...args: unknown[]): Promise<T> {
    if (isWailsRuntimeAvailable()) {
      return (await Call.ByName(`main.StudioService.${method}`, ...args)) as T;
    }
    const res = await fetch(`${this.bridgeUrl}/api/rpc/${encodeURIComponent(method)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ args }),
    });
    if (!res.ok) {
      const msg = await res.text().catch(() => res.statusText);
      throw new Error(msg || `Desktop bridge returned ${res.status}`);
    }
    const payload = (await res.json()) as { result?: T; error?: string };
    if (payload.error) throw new Error(payload.error);
    return payload.result as T;
  }

  async checkConnection(): Promise<boolean> {
    if (isWailsRuntimeAvailable()) return true;
    try {
      const res = await fetch(`${this.bridgeUrl}/api/health`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async init(): Promise<void> {
    await this.wasmFallback.init();
    if (isWailsRuntimeAvailable()) {
      if (this.wailsUnsubscribes.length === 0) {
        this.wailsUnsubscribes.push(
          Events.On("pty:output", (ev) => {
            const data = typeof ev.data === "string" ? ev.data : String(ev.data ?? "");
            if (data) this.outputListeners.forEach((cb) => cb(data));
          }),
          Events.On("pty:status", (ev) => {
            if (ev.data && typeof ev.data === "object") {
              this.statusListeners.forEach((cb) => cb(ev.data as PtyStatus));
            }
          }),
          Events.On("mcp:ir_updated", (ev) => {
            const raw = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data ?? {});
            if (raw) this.irListeners.forEach((cb) => cb(raw));
          })
        );
      }
      return;
    }
    this.ensureBridgeSocket();
  }

  private ensureBridgeSocket(): void {
    if (typeof window === "undefined" || this.ws || isWailsRuntimeAvailable()) return;
    try {
      const wsUrl = this.bridgeUrl.replace(/^http/, "ws") + "/api/events";
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        this.wsConnected = true;
      };
      ws.onmessage = (msg) => {
        try {
          const ev = JSON.parse(String(msg.data)) as { event: string; data: unknown };
          if (ev.event === "pty:output" && typeof ev.data === "string") {
            this.outputListeners.forEach((cb) => cb(ev.data as string));
          } else if (ev.event === "pty:status" && ev.data && typeof ev.data === "object") {
            this.statusListeners.forEach((cb) => cb(ev.data as PtyStatus));
          } else if (ev.event === "mcp:ir_updated") {
            const raw = typeof ev.data === "string" ? ev.data : JSON.stringify(ev.data ?? {});
            this.irListeners.forEach((cb) => cb(raw));
          }
        } catch {
          // ignore malformed event frames
        }
      };
      ws.onclose = () => {
        this.wsConnected = false;
        this.ws = null;
      };
      ws.onerror = () => {
        this.wsConnected = false;
      };
      this.ws = ws;
    } catch {
      this.wsConnected = false;
    }
  }

  disconnectBridgeSocket(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.wsConnected = false;
  }

  isSocketConnected(): boolean {
    return this.wsConnected || isWailsRuntimeAvailable();
  }

  onPtyOutput(cb: (chunk: string) => void): () => void {
    this.ensureBridgeSocket();
    this.outputListeners.add(cb);
    return () => {
      this.outputListeners.delete(cb);
    };
  }

  onPtyStatus(cb: (status: PtyStatus) => void): () => void {
    this.ensureBridgeSocket();
    this.statusListeners.add(cb);
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  onMcpIrUpdated(cb: (irJson: string) => void): () => void {
    this.ensureBridgeSocket();
    this.irListeners.add(cb);
    return () => {
      this.irListeners.delete(cb);
    };
  }

  render(
    doc: IRDoc,
    cols: number,
    rows: number,
    darkBG: boolean,
    colorProfile: ColorProfile = this.colorProfile
  ): StudioFrame {
    this.darkBG = darkBG;
    this.colorProfile = colorProfile;
    return this.wasmFallback.render(doc, cols, rows, darkBG, colorProfile);
  }

  async sendKey(targetId: string, key: string, opts?: PreviewKeyOptions): Promise<boolean> {
    const seq = keyEventToVtSequence(key, opts);
    if (!seq) return false;
    try {
      await this.invoke<void>("SendPTYInput", seq);
      return true;
    } catch {
      return this.wasmFallback.sendKey(targetId, key, opts);
    }
  }

  async sendMouse(col: number, row: number, event?: PreviewMouseEvent): Promise<HitTestResult | null> {
    try {
      await this.invoke<void>(
        "SendPTYMouse",
        col,
        row,
        event?.button ?? 0,
        event?.action ?? "press"
      );
      return null;
    } catch {
      return this.wasmFallback.sendMouse(col, row);
    }
  }

  async resize(cols: number, rows: number): Promise<void> {
    this.wasmFallback.resize(cols, rows);
    try {
      await this.invoke<void>("ResizePTY", cols, rows);
    } catch {
      // ignore if PTY not running
    }
  }

  setPolarity(darkBG: boolean): void {
    this.darkBG = darkBG;
    this.wasmFallback.setPolarity(darkBG);
  }

  setColorProfile(profile: ColorProfile): void {
    this.colorProfile = profile;
    this.wasmFallback.setColorProfile(profile);
  }

  getPolarityState(): { darkBG: boolean; colorProfile: ColorProfile } {
    return { darkBG: this.darkBG, colorProfile: this.colorProfile };
  }

  async parseGo(goSrc: string): Promise<GoParseResponse | null> {
    try {
      return await this.invoke<GoParseResponse>("ParseGoSource", goSrc);
    } catch {
      return this.wasmFallback.parseGo(goSrc);
    }
  }

  async patchGo(existingGo: string, doc: IRDoc): Promise<GoSyncResponse> {
    try {
      return await this.invoke<GoSyncResponse>("SyncGoSource", existingGo, JSON.stringify(doc));
    } catch {
      return this.wasmFallback.patchGo(existingGo, doc);
    }
  }

  async computeDiff(beforeGo: string, afterGo: string): Promise<GoDiffResponse | null> {
    try {
      return await this.invoke<GoDiffResponse>("ComputeGoDiff", beforeGo, afterGo);
    } catch {
      return this.wasmFallback.computeDiff(beforeGo, afterGo);
    }
  }

  // --- Desktop PTY, MCP & Worktree Service RPCs ---

  async startPty(dir: string, cols: number, rows: number): Promise<PtyStatus> {
    return await this.invoke<PtyStatus>("StartPTY", dir, cols, rows);
  }

  async stopPty(): Promise<void> {
    await this.invoke<void>("StopPTY");
  }

  async getPtyStatus(): Promise<PtyStatus> {
    return await this.invoke<PtyStatus>("GetPTYStatus");
  }

  async getPtyBuffer(): Promise<string> {
    return await this.invoke<string>("GetPTYBuffer");
  }

  async updateMcpContext(doc: IRDoc, selectedId: string, projectDir: string): Promise<void> {
    await this.invoke<void>("UpdateMCPContext", JSON.stringify(doc), selectedId, projectDir);
  }

  async getMcpStatus(): Promise<McpServerStatus> {
    return await this.invoke<McpServerStatus>("GetMCPStatus");
  }

  async createWorktree(repoDir: string, prompt: string, baseBranch = ""): Promise<WorktreeSession> {
    return await this.invoke<WorktreeSession>("CreateWorktree", repoDir, prompt, baseBranch);
  }

  async listWorktrees(repoDir: string): Promise<WorktreeSession[]> {
    return await this.invoke<WorktreeSession[]>("ListWorktrees", repoDir);
  }

  async getWorktreeDiff(sessionId: string): Promise<WorktreeDiffResult> {
    return await this.invoke<WorktreeDiffResult>("GetWorktreeDiff", sessionId);
  }

  async mergeWorktree(sessionId: string, commitMessage = ""): Promise<void> {
    await this.invoke<void>("MergeWorktree", sessionId, commitMessage);
  }

  async discardWorktree(sessionId: string): Promise<void> {
    await this.invoke<void>("DiscardWorktree", sessionId);
  }

  async activateWorktreeInPty(sessionId: string, cols: number, rows: number): Promise<PtyStatus> {
    return await this.invoke<PtyStatus>("ActivateWorktreeInPTY", sessionId, cols, rows);
  }
}
