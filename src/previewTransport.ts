import { Call, Events } from "@wailsio/runtime";
import { dispatchCharmWidgetKey, isCustomHydratedWidget, renderCharmWidgetContent } from "./charmWidgets";
import type { AstDelta, DiffLine } from "./astDiff";
import type { ColorProfile, ContentType, IRDoc, IRNode, IROverlay, IRStyle, Rect, TelemetryNode, TokenPair } from "./types";

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

  private hasCustomHydratedWidgets(doc: IRDoc): boolean {
    let found = false;
    const walk = (n: IRNode) => {
      if (n.contentType && isCustomHydratedWidget(n)) {
        this.hydratedTypes.set(n.id, n.contentType);
        found = true;
      } else {
        this.hydratedTypes.delete(n.id);
      }
      n.children?.forEach(walk);
    };
    walk(doc.root);
    doc.overlays.forEach((o) => walk(o.node));
    return found;
  }

  private hydrateWidgetsForWasm(
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
        const size = telMap?.get(n.id) ?? this.boxSizeCache.get(cacheKey) ?? {
          w: n.width?.mode === "fixed" ? Math.max(8, (n.width.value ?? 30) - 4) : Math.max(20, Math.floor(cols / 2) - 4),
          h: n.height?.mode === "fixed" ? Math.max(2, (n.height.value ?? 6) - 2) : Math.max(6, rows - 6),
        };
        n.content = renderCharmWidgetContent(n, next, size.w, size.h, darkBG, cols, rows);
        if (n.contentType?.startsWith("bubble:") || n.contentType === "huh:form") {
          n.contentType = "text";
        }
      }
      n.children?.forEach(walk);
    };
    walk(next.root);
    next.overlays.forEach((o) => walk(o.node));
    return next;
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

    const runPass = (targetDoc: IRDoc): StudioFrame => {
      const raw = window.renderStudio!(JSON.stringify(targetDoc), cols, rows, darkBG, colorProfile);
      return JSON.parse(raw) as StudioFrame;
    };

    if (!this.hasCustomHydratedWidgets(doc)) {
      return runPass(doc);
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

    if (!needsRefit) return firstFrame;

    const fittedDoc = this.hydrateWidgetsForWasm(doc, cols, rows, darkBG, telMap);
    return runPass(fittedDoc);
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
