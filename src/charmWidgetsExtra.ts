import { isAnsiIndex, swatchColor } from "./ansiColor";
import {
  defaultWidgetData,
  type ContentType,
  type IRDoc,
  type IRNode,
  type SpinnerPresetType,
  type TokenPair,
} from "./types";

export const RESET = "\x1b[0m";

export function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = isAnsiIndex(hex.trim()) ? swatchColor(hex.trim()) : hex;
  const m = normalized.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function colorSgrParam(color: string, isBg: boolean): string | null {
  const trimmed = color.trim();
  if (isAnsiIndex(trimmed)) {
    return `${isBg ? 48 : 38};5;${Number(trimmed)}`;
  }
  const rgb = hexToRgb(trimmed);
  if (!rgb) return null;
  return `${isBg ? 48 : 38};2;${rgb[0]};${rgb[1]};${rgb[2]}`;
}

export function fg(hex: string, text: string): string {
  const p = colorSgrParam(hex, false);
  if (!p) return text;
  return `\x1b[${p}m${text}${RESET}`;
}

export function fgBg(fgHex: string, bgHex: string, text: string, isBold = false): string {
  const f = colorSgrParam(fgHex, false);
  const b = colorSgrParam(bgHex, true);
  const parts: string[] = [];
  if (isBold) parts.push("1");
  if (f) parts.push(f);
  if (b) parts.push(b);
  if (parts.length === 0) return text;
  return `\x1b[${parts.join(";")}m${text}${RESET}`;
}

export function bold(text: string): string {
  return `\x1b[1m${text}${RESET}`;
}

export function italic(text: string): string {
  return `\x1b[3m${text}${RESET}`;
}

export function faint(text: string): string {
  return `\x1b[2m${text}${RESET}`;
}

export function underline(text: string): string {
  return `\x1b[4m${text}${RESET}`;
}

export function reverse(text: string): string {
  return `\x1b[7m${text}${RESET}`;
}

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export function visibleLen(s: string): number {
  return Array.from(stripAnsi(s)).length;
}

export function padRightVisible(s: string, targetW: number): string {
  const len = visibleLen(s);
  if (len >= targetW) return s;
  return s + " ".repeat(targetW - len);
}

export function clipVisible(s: string, maxW: number): string {
  if (maxW <= 0) return "";
  if (visibleLen(s) <= maxW) return s;
  let out = "";
  let vis = 0;
  let i = 0;
  let sawAnsi = false;
  while (i < s.length && vis < Math.max(0, maxW - 1)) {
    if (s[i] === "\x1b" && s[i + 1] === "[") {
      const end = s.indexOf("m", i);
      if (end !== -1) {
        out += s.slice(i, end + 1);
        sawAnsi = true;
        i = end + 1;
        continue;
      }
    }
    const cp = s.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    out += ch;
    vis++;
    i += ch.length;
  }
  if (maxW > 1) out += "…";
  if (sawAnsi) out += RESET;
  return out;
}

export function resolveColorRef(
  tokens: Record<string, TokenPair>,
  ref: string | undefined,
  darkBG: boolean,
  fallback: string
): string {
  if (!ref) return fallback;
  if (ref.startsWith("$")) {
    const pair = tokens[ref.slice(1)];
    if (pair) return (darkBG ? pair.dark : pair.light) || fallback;
    return fallback;
  }
  return ref;
}

// --- Spinner Frames ---

export const SPINNER_FRAMES: Record<SpinnerPresetType, { frames: string[]; fpsMs: number }> = {
  line: { frames: ["|", "/", "-", "\\"], fpsMs: 100 },
  dot: { frames: ["⣾ ", "⣽ ", "⣻ ", "⢿ ", "⡿ ", "⣟ ", "⣯ ", "⣷ "], fpsMs: 100 },
  "mini-dot": { frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"], fpsMs: 83 },
  jump: { frames: ["⢄", "⢂", "⢁", "⡁", "⡈", "⡐", "⡠"], fpsMs: 100 },
  pulse: { frames: ["█", "▓", "▒", "░"], fpsMs: 125 },
  points: { frames: ["∙∙∙", "●∙∙", "∙●∙", "∙∙●"], fpsMs: 140 },
  globe: { frames: ["🌍", "🌎", "🌏"], fpsMs: 250 },
  moon: { frames: ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"], fpsMs: 150 },
  monkey: { frames: ["🙈", "🙉", "🙊"], fpsMs: 250 },
};

// --- Stateful Runtime Maps ---

interface TextAreaState {
  lines: string[];
  row: number;
  col: number;
  scroll: number;
  seededFrom?: string;
  dirty?: boolean;
}

interface ProgressSpringState {
  pos: number;
  vel: number;
  target: number;
}

interface SpinnerState {
  frame: number;
  elapsedMs: number;
  paused?: boolean;
}

interface FilePickerEntry {
  name: string;
  isDir: boolean;
  size: string;
  perms: string;
}

interface FilePickerState {
  cwd: string;
  cursor: number;
  selectedFile: string | null;
  seededRoot?: string;
}

interface PaginatorState {
  page: number;
  seededPage?: number;
}

interface HelpState {
  showAll: boolean;
  seeded?: boolean;
}

interface ClockState {
  running: boolean;
  ms: number;
  seededSec?: number;
}

interface UvCursorState {
  x: number;
  y: number;
  seededKey?: string;
}

interface OverlaySpringState {
  offset: number;
  vel: number;
  wasVisible: boolean;
}

const textAreaStates = new Map<string, TextAreaState>();
const progressSpringStates = new Map<string, ProgressSpringState>();
const progressOverrideStates = new Map<string, { pct: number; seededPct: number }>();
const spinnerStates = new Map<string, SpinnerState>();
const filePickerStates = new Map<string, FilePickerState>();
const paginatorStates = new Map<string, PaginatorState>();
const helpStates = new Map<string, HelpState>();
const timerStates = new Map<string, ClockState>();
const stopwatchStates = new Map<string, ClockState>();
const uvCursorStates = new Map<string, UvCursorState>();
const overlaySpringStates = new Map<string, OverlaySpringState>();

const fpEntriesCache = new Map<string, FilePickerEntry[]>();
const paginatorTotalCache = new Map<string, number>();
const textareaLimitCache = new Map<string, number>();
const progressPercentCache = new Map<string, number>();

const VIRTUAL_FS: Record<string, FilePickerEntry[]> = {
  "/workspace/charm-app": [
    { name: "ui", isDir: true, size: "4.0K", perms: "drwxr-xr-x" },
    { name: "cmd", isDir: true, size: "4.0K", perms: "drwxr-xr-x" },
    { name: "main.go", isDir: false, size: "1.4K", perms: "-rw-r--r--" },
    { name: "model.go", isDir: false, size: "3.8K", perms: "-rw-r--r--" },
    { name: "update.go", isDir: false, size: "2.9K", perms: "-rw-r--r--" },
    { name: "view.go", isDir: false, size: "1.9K", perms: "-rw-r--r--" },
    { name: "go.mod", isDir: false, size: "412B", perms: "-rw-r--r--" },
    { name: "README.md", isDir: false, size: "2.1K", perms: "-rw-r--r--" },
    { name: "config.json", isDir: false, size: "680B", perms: "-rw-r--r--" },
  ],
  "/workspace/charm-app/ui": [
    { name: "..", isDir: true, size: "4.0K", perms: "drwxr-xr-x" },
    { name: "theme_gen.go", isDir: false, size: "4.6K", perms: "-rw-r--r--" },
    { name: "layout_gen.go", isDir: false, size: "5.2K", perms: "-rw-r--r--" },
    { name: "tokens.json", isDir: false, size: "910B", perms: "-rw-r--r--" },
  ],
  "/workspace/charm-app/cmd": [
    { name: "..", isDir: true, size: "4.0K", perms: "drwxr-xr-x" },
    { name: "serve.go", isDir: false, size: "2.4K", perms: "-rw-r--r--" },
    { name: "export.go", isDir: false, size: "1.7K", perms: "-rw-r--r--" },
  ],
};

function normalizeFpDir(raw: string): string {
  const trimmed = (raw || "").trim() || "/workspace/charm-app";
  if (trimmed === "/") return "/";
  return trimmed.replace(/\/+$/, "");
}

function getVirtualEntries(cwd: string, seededRoot: string): FilePickerEntry[] {
  if (VIRTUAL_FS[cwd]) return VIRTUAL_FS[cwd];
  const out: FilePickerEntry[] = [];
  if (cwd !== seededRoot && cwd !== "/") {
    out.push({ name: "..", isDir: true, size: "4.0K", perms: "drwxr-xr-x" });
  }
  out.push(
    { name: "src", isDir: true, size: "4.0K", perms: "drwxr-xr-x" },
    { name: "main.go", isDir: false, size: "1.4K", perms: "-rw-r--r--" },
    { name: "README.md", isDir: false, size: "2.1K", perms: "-rw-r--r--" },
    { name: "config.json", isDir: false, size: "680B", perms: "-rw-r--r--" }
  );
  return out;
}

function getTextAreaState(id: string, initial: string): TextAreaState {
  let s = textAreaStates.get(id);
  if (!s) {
    const lines = initial ? initial.split("\n") : [""];
    s = { lines, row: lines.length - 1, col: lines[lines.length - 1].length, scroll: 0, seededFrom: initial, dirty: false };
    textAreaStates.set(id, s);
  }
  return s;
}

function getFilePickerState(id: string, defaultDir: string): FilePickerState {
  const norm = normalizeFpDir(defaultDir);
  let s = filePickerStates.get(id);
  if (!s || s.seededRoot !== norm) {
    s = {
      cwd: norm,
      cursor: 0,
      selectedFile: null,
      seededRoot: norm,
    };
    filePickerStates.set(id, s);
  }
  return s;
}

function getPaginatorState(id: string, page: number): PaginatorState {
  let s = paginatorStates.get(id);
  if (!s || s.seededPage !== page) {
    s = { page: Math.max(0, page - 1), seededPage: page };
    paginatorStates.set(id, s);
  }
  return s;
}

function getHelpState(id: string, showAll: boolean): HelpState {
  let s = helpStates.get(id);
  if (!s || s.seeded !== showAll) {
    s = { showAll, seeded: showAll };
    helpStates.set(id, s);
  }
  return s;
}

function getTimerState(id: string, durationSec: number, autoStart: boolean): ClockState {
  let s = timerStates.get(id);
  if (!s || s.seededSec !== durationSec) {
    s = { running: autoStart, ms: Math.max(1, durationSec) * 1000, seededSec: durationSec };
    timerStates.set(id, s);
  }
  return s;
}

function getStopwatchState(id: string, autoStart: boolean): ClockState {
  let s = stopwatchStates.get(id);
  if (!s) {
    s = { running: autoStart, ms: 0 };
    stopwatchStates.set(id, s);
  }
  return s;
}

export function controlClockWidget(nodeId: string, ct: ContentType, action: "toggle" | "reset", durationSec = 90): void {
  if (ct === "bubble:timer") {
    const s = getTimerState(nodeId, durationSec, true);
    if (action === "toggle") s.running = !s.running;
    else s.ms = Math.max(1, durationSec) * 1000;
  } else if (ct === "bubble:stopwatch") {
    const s = getStopwatchState(nodeId, true);
    if (action === "toggle") s.running = !s.running;
    else s.ms = 0;
  }
}

export function getClockWidgetRunning(nodeId: string, ct: ContentType): boolean {
  if (ct === "bubble:timer") return timerStates.get(nodeId)?.running ?? true;
  if (ct === "bubble:stopwatch") return stopwatchStates.get(nodeId)?.running ?? true;
  return false;
}

// --- Harmonica Spring Stepper ---

function stepSpring(pos: number, vel: number, target: number, freq: number, damping: number, dtSec: number): [number, number] {
  const omega = Math.max(0.5, freq);
  const zeta = Math.max(0.05, damping);
  const dt = Math.min(0.05, Math.max(0.004, dtSec));
  const f = 1 + 2 * dt * zeta * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const detInv = 1 / (f + hhoo);
  const detX = f * pos + dt * vel + hhoo * target;
  const detV = vel + hoo * (target - pos);
  const nextPos = detX * detInv;
  const nextVel = detV * detInv;
  if (Math.abs(nextPos - target) < 0.05 && Math.abs(nextVel) < 0.05) {
    return [target, 0];
  }
  return [nextPos, nextVel];
}

export function getOverlayHarmonicaOffset(overlayId: string, visible: boolean, enabled: boolean): number {
  if (!enabled) {
    overlaySpringStates.delete(overlayId);
    return 0;
  }
  let s = overlaySpringStates.get(overlayId);
  if (!s) {
    s = { offset: visible ? 10 : 0, vel: 0, wasVisible: visible };
    overlaySpringStates.set(overlayId, s);
  }
  if (visible && !s.wasVisible) {
    s.offset = 12;
    s.vel = 0;
  }
  s.wasVisible = visible;
  return visible ? Math.round(s.offset) : 0;
}

function getEffectiveProgressPercent(node: IRNode): number {
  const seeded = Math.max(0, Math.min(100, node.widgetData?.progressPercent ?? 68));
  const ov = progressOverrideStates.get(node.id);
  if (ov && ov.seededPct === seeded) return ov.pct;
  return seeded;
}

export function hasAnimatedWidgets(doc: IRDoc): boolean {
  let active = false;
  const visit = (n: IRNode) => {
    const ct = n.contentType;
    if (ct === "bubble:spinner") {
      if (!spinnerStates.get(n.id)?.paused) active = true;
    } else if (ct === "bubble:timer") {
      const s = timerStates.get(n.id);
      const running = s ? s.running && s.ms > 0 : (n.widgetData?.timerAutoStart ?? true);
      if (running) active = true;
    } else if (ct === "bubble:stopwatch") {
      const s = stopwatchStates.get(n.id);
      const running = s ? s.running : (n.widgetData?.timerAutoStart ?? true);
      if (running) active = true;
    } else if (ct === "bubble:progress" && n.widgetData?.harmonica?.enabled) {
      const st = progressSpringStates.get(n.id);
      const target = getEffectiveProgressPercent(n);
      if (!st || Math.abs(st.pos - target) > 0.1 || Math.abs(st.vel) > 0.1) {
        active = true;
      }
    }
    n.children?.forEach(visit);
  };
  visit(doc.root);
  for (const ov of doc.overlays) {
    if (ov.visible) {
      visit(ov.node);
      if (ov.harmonica?.enabled) {
        const st = overlaySpringStates.get(ov.id);
        if (!st || Math.abs(st.offset) > 0.1 || Math.abs(st.vel) > 0.1) {
          active = true;
        }
      }
    }
  }
  return active;
}

export function stepWidgetAnimations(doc: IRDoc, dtMs: number): boolean {
  let changed = false;
  const visit = (n: IRNode) => {
    const ct = n.contentType;
    if (ct === "bubble:spinner") {
      const preset = n.widgetData?.spinnerType ?? "dot";
      const cfg = SPINNER_FRAMES[preset] ?? SPINNER_FRAMES.dot;
      let s = spinnerStates.get(n.id);
      if (!s) {
        s = { frame: 0, elapsedMs: 0 };
        spinnerStates.set(n.id, s);
      }
      if (!s.paused) {
        s.elapsedMs += dtMs;
        if (s.elapsedMs >= cfg.fpsMs) {
          s.frame = (s.frame + Math.floor(s.elapsedMs / cfg.fpsMs)) % cfg.frames.length;
          s.elapsedMs = s.elapsedMs % cfg.fpsMs;
          changed = true;
        }
      }
    } else if (ct === "bubble:timer") {
      const s = getTimerState(n.id, n.widgetData?.timerDurationSec ?? 90, n.widgetData?.timerAutoStart ?? true);
      if (s.running && s.ms > 0) {
        s.ms = Math.max(0, s.ms - dtMs);
        if (s.ms === 0) s.running = false;
        changed = true;
      }
    } else if (ct === "bubble:stopwatch") {
      const s = getStopwatchState(n.id, n.widgetData?.timerAutoStart ?? true);
      if (s.running) {
        s.ms += dtMs;
        changed = true;
      }
    } else if (ct === "bubble:progress" && n.widgetData?.harmonica?.enabled) {
      const target = getEffectiveProgressPercent(n);
      let s = progressSpringStates.get(n.id);
      if (!s) {
        s = { pos: Math.max(0, target - 28), vel: 0, target };
        progressSpringStates.set(n.id, s);
      }
      if (s.target !== target) s.target = target;
      if (Math.abs(s.pos - target) > 0.05 || Math.abs(s.vel) > 0.05) {
        const [np, nv] = stepSpring(
          s.pos,
          s.vel,
          target,
          n.widgetData.harmonica.frequency ?? 6.0,
          n.widgetData.harmonica.damping ?? 0.7,
          dtMs / 1000
        );
        s.pos = np;
        s.vel = nv;
        changed = true;
      }
    }
    n.children?.forEach(visit);
  };
  visit(doc.root);
  for (const ov of doc.overlays) {
    if (ov.visible) {
      visit(ov.node);
      if (ov.harmonica?.enabled) {
        let s = overlaySpringStates.get(ov.id);
        if (!s) {
          s = { offset: 12, vel: 0, wasVisible: true };
          overlaySpringStates.set(ov.id, s);
        }
        if (Math.abs(s.offset) > 0.05 || Math.abs(s.vel) > 0.05) {
          const [np, nv] = stepSpring(
            s.offset,
            s.vel,
            0,
            ov.harmonica.frequency ?? 6.0,
            ov.harmonica.damping ?? 0.72,
            dtMs / 1000
          );
          s.offset = np;
          s.vel = nv;
          changed = true;
        }
      }
    }
  }
  return changed;
}

// --- Extra Key Dispatch ---

export function dispatchExtraWidgetKey(nodeId: string, key: string, ct?: ContentType): boolean {
  if (ct === "bubble:textarea") {
    const s = getTextAreaState(nodeId, "");
    if (key === "ArrowUp") {
      s.row = Math.max(0, s.row - 1);
      s.col = Math.min(s.col, s.lines[s.row].length);
      return true;
    }
    if (key === "ArrowDown") {
      s.row = Math.min(s.lines.length - 1, s.row + 1);
      s.col = Math.min(s.col, s.lines[s.row].length);
      return true;
    }
    if (key === "ArrowLeft") {
      if (s.col > 0) s.col--;
      else if (s.row > 0) {
        s.row--;
        s.col = s.lines[s.row].length;
      }
      return true;
    }
    if (key === "ArrowRight") {
      if (s.col < s.lines[s.row].length) s.col++;
      else if (s.row < s.lines.length - 1) {
        s.row++;
        s.col = 0;
      }
      return true;
    }
    const limit = textareaLimitCache.get(nodeId) ?? 500;
    if (key === "Enter") {
      if (limit > 0 && s.lines.join("\n").length >= limit) return true;
      const line = s.lines[s.row];
      const before = line.slice(0, s.col);
      const after = line.slice(s.col);
      s.lines[s.row] = before;
      s.lines.splice(s.row + 1, 0, after);
      s.row++;
      s.col = 0;
      s.dirty = true;
      return true;
    }
    if (key === "Backspace") {
      if (s.col > 0) {
        const line = s.lines[s.row];
        s.lines[s.row] = line.slice(0, s.col - 1) + line.slice(s.col);
        s.col--;
        s.dirty = true;
      } else if (s.row > 0) {
        const prevLen = s.lines[s.row - 1].length;
        s.lines[s.row - 1] += s.lines[s.row];
        s.lines.splice(s.row, 1);
        s.row--;
        s.col = prevLen;
        s.dirty = true;
      }
      return true;
    }
    if (key.length === 1) {
      if (limit > 0 && s.lines.join("\n").length >= limit) return true;
      const line = s.lines[s.row];
      s.lines[s.row] = line.slice(0, s.col) + key + line.slice(s.col);
      s.col++;
      s.dirty = true;
      return true;
    }
    return false;
  }

  if (ct === "bubble:progress") {
    const seededPct = progressPercentCache.get(nodeId) ?? 68;
    const prev = progressOverrideStates.get(nodeId);
    const cur = prev && prev.seededPct === seededPct ? prev.pct : seededPct;
    let delta = 0;
    if (key === "ArrowRight" || key === "l" || key === "+" || key === "=") delta = 5;
    else if (key === "ArrowLeft" || key === "h" || key === "-" || key === "_") delta = -5;
    if (delta === 0) return false;
    const nextPct = Math.max(0, Math.min(100, cur + delta));
    progressOverrideStates.set(nodeId, { pct: nextPct, seededPct });
    const sp = progressSpringStates.get(nodeId);
    if (sp) sp.target = nextPct;
    return true;
  }

  if (ct === "bubble:spinner") {
    if (key === " " || key === "Enter") {
      let s = spinnerStates.get(nodeId);
      if (!s) {
        s = { frame: 0, elapsedMs: 0, paused: false };
        spinnerStates.set(nodeId, s);
      }
      s.paused = !s.paused;
      return true;
    }
    return false;
  }

  if (ct === "bubble:filepicker") {
    const s = getFilePickerState(nodeId, "/workspace/charm-app");
    const root = s.seededRoot ?? "/workspace/charm-app";
    const entries = fpEntriesCache.get(nodeId) ?? getVirtualEntries(s.cwd, root);
    if (key === "ArrowDown" || key === "j") {
      s.cursor = Math.min(Math.max(0, entries.length - 1), s.cursor + 1);
      return true;
    }
    if (key === "ArrowUp" || key === "k") {
      s.cursor = Math.max(0, s.cursor - 1);
      return true;
    }
    if (key === "Enter" || key === "ArrowRight" || key === "l") {
      const entry = entries[s.cursor];
      if (!entry) return true;
      if (entry.isDir) {
        if (entry.name === "..") {
          const parent = s.cwd.split("/").slice(0, -1).join("/") || "/";
          s.cwd = parent.length >= root.length ? parent : root;
        } else {
          s.cwd = s.cwd === "/" ? `/${entry.name}` : `${s.cwd}/${entry.name}`;
        }
        s.cursor = 0;
      } else {
        s.selectedFile = s.cwd === "/" ? `/${entry.name}` : `${s.cwd}/${entry.name}`;
      }
      return true;
    }
    if (key === "Backspace" || key === "ArrowLeft" || key === "h") {
      if (s.cwd !== root) {
        const parent = s.cwd.split("/").slice(0, -1).join("/") || "/";
        s.cwd = parent.length >= root.length ? parent : root;
        s.cursor = 0;
        return true;
      }
    }
    return false;
  }

  if (ct === "bubble:paginator") {
    const s = getPaginatorState(nodeId, 1);
    const total = Math.max(1, paginatorTotalCache.get(nodeId) ?? 5);
    if (key === "ArrowRight" || key === "l" || key === " ") {
      s.page = (s.page + 1) % total;
      return true;
    }
    if (key === "ArrowLeft" || key === "h") {
      s.page = (s.page + total - 1) % total;
      return true;
    }
    return false;
  }

  if (ct === "bubble:help") {
    const s = getHelpState(nodeId, false);
    if (key === "?" || key === "Enter" || key === " ") {
      s.showAll = !s.showAll;
      return true;
    }
    return false;
  }

  if (ct === "bubble:timer") {
    const s = getTimerState(nodeId, 90, true);
    if (key === " " || key === "Enter") {
      s.running = !s.running;
      return true;
    }
    if (key === "r" || key === "R") {
      s.ms = Math.max(1, s.seededSec ?? 90) * 1000;
      return true;
    }
    return false;
  }

  if (ct === "bubble:stopwatch") {
    const s = getStopwatchState(nodeId, true);
    if (key === " " || key === "Enter") {
      s.running = !s.running;
      return true;
    }
    if (key === "r" || key === "R") {
      s.ms = 0;
      return true;
    }
    return false;
  }

  if (ct === "uv:screen") {
    let s = uvCursorStates.get(nodeId);
    if (!s) {
      s = { x: 14, y: 4 };
      uvCursorStates.set(nodeId, s);
    }
    if (key === "ArrowRight" || key === "l") { s.x++; return true; }
    if (key === "ArrowLeft" || key === "h") { s.x = Math.max(0, s.x - 1); return true; }
    if (key === "ArrowDown" || key === "j") { s.y++; return true; }
    if (key === "ArrowUp" || key === "k") { s.y = Math.max(0, s.y - 1); return true; }
    return false;
  }

  return false;
}

// --- Extra Widget Renderers ---

export function renderLipglossDivider(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const wd = node.widgetData ?? defaultWidgetData("lipgloss:divider");
  const orient = wd.dividerOrientation ?? "horizontal";
  const ch = (wd.dividerChar || (orient === "vertical" ? "│" : "─")).slice(0, 1) || "─";
  const label = (wd.dividerLabel ?? "").trim();
  const muted = resolveColorRef(doc.tokens, "$borderIdle", darkBG, "#565f89");
  const accent = resolveColorRef(doc.tokens, "$accent", darkBG, "#ff5eae");
  const w = Math.max(4, innerW);
  const h = Math.max(1, innerH);

  if (orient === "vertical") {
    return Array.from({ length: h }, () => fg(muted, ch)).join("\n");
  }
  if (!label) {
    return fg(muted, ch.repeat(w));
  }
  const tag = ` ${label} `;
  const rem = Math.max(2, w - Array.from(tag).length);
  const leftLen = Math.floor(rem / 2);
  const rightLen = rem - leftLen;
  return fg(muted, ch.repeat(leftLen)) + bold(fg(accent, tag)) + fg(muted, ch.repeat(rightLen));
}

export function renderBubbleTextArea(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const wd = node.widgetData ?? defaultWidgetData("bubble:textarea");
  const initial = node.content ?? "";
  const s = getTextAreaState(node.id, initial);
  if (!s.dirty && s.seededFrom !== initial) {
    s.lines = initial ? initial.split("\n") : [""];
    s.row = s.lines.length - 1;
    s.col = s.lines[s.row].length;
    s.scroll = 0;
    s.seededFrom = initial;
  }

  const accent = resolveColorRef(doc.tokens, "$accent", darkBG, "#ff5eae");
  const glow = resolveColorRef(doc.tokens, "$modalGlow", darkBG, "#6dffc2");
  const muted = resolveColorRef(doc.tokens, "$borderIdle", darkBG, "#565f89");
  const textMain = resolveColorRef(doc.tokens, "$textMain", darkBG, "#f4eaff");

  const showNums = wd.textareaShowLineNumbers ?? true;
  const softWrap = wd.textareaSoftWrap ?? true;
  const cursorStyle = wd.textareaCursorStyle ?? "block";
  const limit = wd.textareaCharLimit ?? 500;
  textareaLimitCache.set(node.id, limit);

  const w = Math.max(12, innerW);
  const h = Math.max(2, innerH);
  const gutterW = showNums ? 4 : 0;
  const textW = Math.max(4, w - gutterW);

  const isEmpty = s.lines.length === 1 && s.lines[0] === "";
  interface VisualRow {
    li: number;
    segIdx: number;
    chars: string[];
    cursorCol: number | null;
  }
  const visualRows: VisualRow[] = [];
  let cursorVisRow = 0;

  if (isEmpty) {
    visualRows.push({ li: 0, segIdx: 0, chars: [], cursorCol: 0 });
    cursorVisRow = 0;
  } else {
    for (let li = 0; li < s.lines.length; li++) {
      const lineChars = Array.from(s.lines[li]);
      const isActive = li === s.row;
      const clampedCol = isActive ? Math.max(0, Math.min(lineChars.length, s.col)) : -1;

      if (softWrap) {
        const segCount = Math.max(1, Math.ceil(lineChars.length / textW));
        for (let seg = 0; seg < segCount; seg++) {
          const start = seg * textW;
          const slice = lineChars.slice(start, start + textW);
          let cursorCol: number | null = null;
          if (isActive && clampedCol >= start && (clampedCol < start + textW || seg === segCount - 1)) {
            if (clampedCol - start < textW) {
              cursorCol = clampedCol - start;
              cursorVisRow = visualRows.length;
            }
          }
          visualRows.push({ li, segIdx: seg, chars: slice, cursorCol });
        }
        if (isActive && clampedCol === lineChars.length && lineChars.length > 0 && lineChars.length % textW === 0) {
          cursorVisRow = visualRows.length;
          visualRows.push({ li, segIdx: segCount, chars: [], cursorCol: 0 });
        }
      } else {
        let start = 0;
        if (isActive && clampedCol >= textW) {
          start = clampedCol - textW + 1;
        }
        const slice = lineChars.slice(start, start + textW);
        const cursorCol = isActive ? clampedCol - start : null;
        if (isActive) cursorVisRow = visualRows.length;
        visualRows.push({ li, segIdx: 0, chars: slice, cursorCol });
      }
    }
  }

  const bodyBudget = Math.max(1, h - 1);
  if (cursorVisRow < s.scroll) s.scroll = cursorVisRow;
  if (cursorVisRow >= s.scroll + bodyBudget) s.scroll = Math.max(0, cursorVisRow - bodyBudget + 1);
  if (s.scroll > Math.max(0, visualRows.length - bodyBudget)) {
    s.scroll = Math.max(0, visualRows.length - bodyBudget);
  }

  const linesOut: string[] = [];
  for (let i = 0; i < bodyBudget; i++) {
    const vr = visualRows[s.scroll + i];
    if (!vr) {
      linesOut.push(showNums ? fg(muted, " ~  ") : "");
      continue;
    }
    const gutter = showNums
      ? vr.segIdx === 0
        ? fg(vr.li === s.row ? accent : muted, `${String(vr.li + 1).padStart(2, " ")}│ `)
        : fg(vr.li === s.row ? accent : muted, "  │ ")
      : "";

    if (isEmpty && vr.li === 0) {
      const ph = wd.textareaPlaceholder || "Write multi-line text...";
      const curGlyph = cursorStyle === "bar" ? fg(glow, "▏") : cursorStyle === "underline" ? underline(fg(glow, ph[0] || " ")) : reverse(fg(glow, ph[0] || " "));
      linesOut.push(gutter + curGlyph + faint(fg(muted, ph.slice(1, textW))));
      continue;
    }
    if (vr.cursorCol !== null) {
      const before = vr.chars.slice(0, vr.cursorCol).join("");
      const at = vr.chars[vr.cursorCol] ?? " ";
      const after = vr.chars.slice(vr.cursorCol + 1).join("");
      const curGlyph =
        cursorStyle === "bar"
          ? fg(glow, "▏") + fg(textMain, at === " " ? "" : at)
          : cursorStyle === "underline"
          ? underline(bold(fg(glow, at)))
          : reverse(fg(glow, at));
      linesOut.push(gutter + clipVisible(fg(textMain, before) + curGlyph + fg(textMain, after), textW));
    } else {
      linesOut.push(gutter + clipVisible(fg(textMain, vr.chars.join("")), textW));
    }
  }

  const totalChars = s.lines.join("\n").length;
  const limitLabel = limit > 0 ? `${totalChars}/${limit}` : `${totalChars}`;
  linesOut.push(faint(fg(muted, `Ln ${s.row + 1}, Col ${s.col + 1} · ${limitLabel} chars`)));
  return linesOut.slice(0, h).map((l) => clipVisible(l, w)).join("\n");
}

export function renderBubbleProgress(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const wd = node.widgetData ?? defaultWidgetData("bubble:progress");
  const seeded = Math.max(0, Math.min(100, wd.progressPercent ?? 68));
  progressPercentCache.set(node.id, seeded);
  const ov = progressOverrideStates.get(node.id);
  if (ov && ov.seededPct !== seeded) {
    progressOverrideStates.delete(node.id);
  }
  const target = getEffectiveProgressPercent(node);
  let displayPct = target;
  if (wd.harmonica?.enabled) {
    const s = progressSpringStates.get(node.id);
    if (s) displayPct = Math.max(0, Math.min(100, s.pos));
  }

  const startColor = resolveColorRef(doc.tokens, wd.progressStartColor || "$accent", darkBG, "#ff5eae");
  const endColor = resolveColorRef(doc.tokens, wd.progressEndColor || "$modalGlow", darkBG, "#6dffc2");
  const muted = resolveColorRef(doc.tokens, "$borderIdle", darkBG, "#414868");
  const textMain = resolveColorRef(doc.tokens, "$textMain", darkBG, "#f4eaff");
  const showPct = wd.progressShowPercent ?? true;
  const isGradient = (wd.progressMode ?? "gradient") === "gradient";

  const w = Math.max(10, innerW);
  const pctLabel = showPct ? ` ${String(Math.round(displayPct)).padStart(3, " ")}%` : "";
  const barW = Math.max(6, w - pctLabel.length);
  const filled = Math.round((displayPct / 100) * barW);

  const c1 = hexToRgb(startColor) ?? [255, 94, 174];
  const c2 = hexToRgb(endColor) ?? [109, 255, 194];
  let bar = "";
  for (let i = 0; i < barW; i++) {
    if (i < filled) {
      if (isGradient && barW > 1) {
        const t = i / (barW - 1);
        const col = rgbToHex(c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t);
        bar += fg(col, "█");
      } else {
        bar += fg(startColor, "█");
      }
    } else {
      bar += fg(muted, "░");
    }
  }

  const lines = [bar + (showPct ? bold(fg(textMain, pctLabel)) : "")];
  if (innerH >= 2 && wd.harmonica?.enabled) {
    lines.push(faint(fg(muted, `harmonica spring · freq ${wd.harmonica.frequency.toFixed(1)} · damp ${wd.harmonica.damping.toFixed(2)} · ←/→ adjust`)));
  }
  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, w)).join("\n");
}

export function renderBubbleSpinner(node: IRNode, doc: IRDoc, innerW: number, _innerH: number, darkBG: boolean): string {
  const wd = node.widgetData ?? defaultWidgetData("bubble:spinner");
  const preset = wd.spinnerType ?? "dot";
  const cfg = SPINNER_FRAMES[preset] ?? SPINNER_FRAMES.dot;
  const s = spinnerStates.get(node.id);
  const frameIdx = (s?.frame ?? 0) % cfg.frames.length;
  const spinColor = resolveColorRef(doc.tokens, wd.spinnerColor || "$accent", darkBG, "#ff5eae");
  const muted = resolveColorRef(doc.tokens, "$borderIdle", darkBG, "#565f89");
  const textMain = resolveColorRef(doc.tokens, "$textMain", darkBG, "#f4eaff");
  const glyph = bold(fg(spinColor, cfg.frames[frameIdx]));
  const label = wd.spinnerLabel ?? "Loading...";
  const suffix = s?.paused ? ` ${faint(fg(muted, "(paused)"))}` : "";
  return clipVisible(`${glyph} ${fg(textMain, label)}${suffix}`, Math.max(6, innerW));
}

export function renderBubbleFilePicker(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const wd = node.widgetData ?? defaultWidgetData("bubble:filepicker");
  const s = getFilePickerState(node.id, wd.fpCurrentDir || "/workspace/charm-app");
  const root = s.seededRoot ?? "/workspace/charm-app";
  const allEntries = getVirtualEntries(s.cwd, root);
  const exts = (wd.fpAllowedExts ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean);
  const entries = allEntries.filter(
    (e) => e.isDir || exts.length === 0 || exts.some((ext) => e.name.toLowerCase().endsWith(ext))
  );
  fpEntriesCache.set(node.id, entries);
  if (s.cursor >= entries.length) s.cursor = Math.max(0, entries.length - 1);

  const accent = resolveColorRef(doc.tokens, "$accent", darkBG, "#ff5eae");
  const glow = resolveColorRef(doc.tokens, "$modalGlow", darkBG, "#6dffc2");
  const muted = resolveColorRef(doc.tokens, "$borderIdle", darkBG, "#565f89");
  const textMain = resolveColorRef(doc.tokens, "$textMain", darkBG, "#f4eaff");

  const w = Math.max(14, innerW);
  const h = Math.max(3, innerH);
  const lines: string[] = [bold(fg(accent, s.cwd)) + (exts.length ? faint(fg(muted, ` [${exts.join(",")}]`)) : "")];

  const listBudget = Math.max(1, h - 2);
  const start = Math.max(0, s.cursor - listBudget + 1);
  for (const [relIdx, entry] of entries.slice(start, start + listBudget).entries()) {
    const active = start + relIdx === s.cursor;
    const pointer = active ? fg(glow, "> ") : "  ";
    const perms = wd.fpShowPermissions !== false ? faint(fg(muted, entry.perms + " ")) : "";
    const size = wd.fpShowSize !== false ? faint(fg(muted, entry.size.padStart(5, " ") + " ")) : "";
    const nameStr = entry.isDir
      ? bold(fg(accent, `${entry.name}/`))
      : active
      ? bold(fg(glow, entry.name))
      : fg(textMain, entry.name);
    lines.push(pointer + perms + size + nameStr);
  }
  lines.push(
    s.selectedFile
      ? fg(glow, `Selected: ${s.selectedFile}`)
      : faint(fg(muted, "↑/↓ move · enter open/pick · backspace up"))
  );
  return lines.slice(0, h).map((l) => clipVisible(l, w)).join("\n");
}

export function renderBubblePaginator(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const wd = node.widgetData ?? defaultWidgetData("bubble:paginator");
  const total = Math.max(1, wd.paginatorTotalPages ?? 5);
  const s = getPaginatorState(node.id, wd.paginatorPage ?? 1);
  if (s.page >= total) s.page = total - 1;
  paginatorTotalCache.set(node.id, total);

  const accent = resolveColorRef(doc.tokens, "$accent", darkBG, "#ff5eae");
  const muted = resolveColorRef(doc.tokens, "$borderIdle", darkBG, "#565f89");
  const textMain = resolveColorRef(doc.tokens, "$textMain", darkBG, "#f4eaff");

  const indicator =
    (wd.paginatorType ?? "dots") === "arabic"
      ? bold(fg(accent, `${s.page + 1}`)) + fg(muted, `/${total}`)
      : Array.from({ length: total }, (_, i) => (i === s.page ? fg(accent, "●") : fg(muted, "○"))).join(" ");

  const lines = [indicator];
  if (innerH >= 2) {
    lines.push(faint(fg(textMain, `←/→ page (${s.page + 1} of ${total})`)));
  }
  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, Math.max(6, innerW))).join("\n");
}

export function renderBubbleHelp(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const wd = node.widgetData ?? defaultWidgetData("bubble:help");
  const bindings = wd.helpBindings?.length ? wd.helpBindings : defaultWidgetData("bubble:help").helpBindings!;
  const s = getHelpState(node.id, wd.helpShowAll ?? false);
  const accent = resolveColorRef(doc.tokens, "$accent", darkBG, "#ff5eae");
  const muted = resolveColorRef(doc.tokens, "$borderIdle", darkBG, "#565f89");
  const textMain = resolveColorRef(doc.tokens, "$textMain", darkBG, "#f4eaff");
  const w = Math.max(12, innerW);

  if (!s.showAll || innerH < 2) {
    const shortStr = bindings
      .slice(0, 5)
      .map((b) => `${bold(fg(textMain, b.key))} ${faint(fg(muted, b.desc))}`)
      .join(fg(muted, " • "));
    return clipVisible(shortStr, w);
  }

  const cols = Math.max(1, Math.min(3, Math.floor(w / 18)));
  const perCol = Math.ceil(bindings.length / cols);
  const lines: string[] = [];
  for (let r = 0; r < perCol; r++) {
    const rowParts: string[] = [];
    for (let c = 0; c < cols; c++) {
      const b = bindings[c * perCol + r];
      if (!b) continue;
      rowParts.push(padRightVisible(`${bold(fg(accent, b.key))} ${fg(muted, b.desc)}`, Math.floor(w / cols)));
    }
    lines.push(rowParts.join(" "));
  }
  if (lines.length < innerH) {
    lines.push(faint(fg(muted, "Press ? to toggle short/full help")));
  }
  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, w)).join("\n");
}

function formatClockMs(ms: number, fmt: "mm:ss" | "hh:mm:ss" | "ss.ms"): string {
  const totalSec = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  if (fmt === "hh:mm:ss") {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  if (fmt === "ss.ms") {
    return `${String(totalSec).padStart(2, "0")}.${tenths}s`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function renderBubbleClock(
  node: IRNode,
  doc: IRDoc,
  innerW: number,
  innerH: number,
  darkBG: boolean,
  isStopwatch: boolean
): string {
  const wd = node.widgetData ?? defaultWidgetData(isStopwatch ? "bubble:stopwatch" : "bubble:timer");
  const fmt = wd.timerFormat ?? (isStopwatch ? "ss.ms" : "mm:ss");
  const s = isStopwatch
    ? getStopwatchState(node.id, wd.timerAutoStart ?? true)
    : getTimerState(node.id, wd.timerDurationSec ?? 90, wd.timerAutoStart ?? true);

  const accent = resolveColorRef(doc.tokens, "$accent", darkBG, "#ff5eae");
  const glow = resolveColorRef(doc.tokens, "$modalGlow", darkBG, "#6dffc2");
  const muted = resolveColorRef(doc.tokens, "$borderIdle", darkBG, "#565f89");

  const label = isStopwatch ? "STOPWATCH" : "TIMER";
  const status = s.running ? fg(glow, "● RUN") : fg(muted, "❚❚ PAUSED");
  const clockStr = bold(fg(accent, formatClockMs(s.ms, fmt)));
  const lines = [`${clockStr}  ${status}`];
  if (innerH >= 2) {
    lines.push(faint(fg(muted, `${label} · space start/pause · r reset`)));
  }
  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, Math.max(8, innerW))).join("\n");
}

interface GridCell {
  ch: string;
  fg: string;
  bg: string;
  bold: boolean;
  reverse?: boolean;
}

function flushGridToAnsi(grid: GridCell[][]): string {
  return grid
    .map((row) =>
      row
        .map((cell) => {
          if (cell.reverse) return reverse(fg(cell.fg || "#ffffff", cell.ch || " "));
          if (cell.bg && cell.fg) return fgBg(cell.fg, cell.bg, cell.ch || " ", cell.bold);
          if (cell.bg) return fgBg("#f4eaff", cell.bg, cell.ch || " ", cell.bold);
          if (cell.fg) return cell.bold ? bold(fg(cell.fg, cell.ch || " ")) : fg(cell.fg, cell.ch || " ");
          return cell.bold ? bold(cell.ch || " ") : cell.ch || " ";
        })
        .join("")
    )
    .join("\n");
}

export function renderUvScreen(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG = true): string {
  const wd = node.widgetData ?? defaultWidgetData("uv:screen");
  const w = Math.max(8, innerW);
  const h = Math.max(3, innerH);
  const grid: GridCell[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ch: " ", fg: "", bg: "", bold: false }))
  );

  for (const cmd of wd.uvCommands ?? []) {
    const cmdFg = cmd.fg ? resolveColorRef(doc.tokens, cmd.fg, darkBG, "") : "";
    const cmdBg = cmd.bg ? resolveColorRef(doc.tokens, cmd.bg, darkBG, "") : "";
    if (cmd.op === "fillRect") {
      const rw = Math.max(1, cmd.w ?? 6);
      const rh = Math.max(1, cmd.h ?? 3);
      const glyph = Array.from(cmd.text || " ")[0] || " ";
      for (let y = cmd.y; y < Math.min(h, cmd.y + rh); y++) {
        if (y < 0) continue;
        for (let x = cmd.x; x < Math.min(w, cmd.x + rw); x++) {
          if (x < 0) continue;
          grid[y][x] = { ch: glyph, fg: cmdFg, bg: cmdBg, bold: Boolean(cmd.bold) };
        }
      }
    } else if (cmd.op === "drawText") {
      const chars = Array.from(cmd.text || "");
      if (cmd.y >= 0 && cmd.y < h) {
        chars.forEach((ch, idx) => {
          const x = cmd.x + idx;
          if (x >= 0 && x < w) {
            grid[cmd.y][x] = { ch, fg: cmdFg, bg: cmdBg || grid[cmd.y][x].bg, bold: Boolean(cmd.bold) };
          }
        });
      }
    } else if (cmd.op === "setCell") {
      if (cmd.y >= 0 && cmd.y < h && cmd.x >= 0 && cmd.x < w) {
        grid[cmd.y][cmd.x] = {
          ch: Array.from(cmd.text || "✦")[0] || "✦",
          fg: cmdFg,
          bg: cmdBg || grid[cmd.y][cmd.x].bg,
          bold: Boolean(cmd.bold),
        };
      }
    }
  }

  if (wd.uvShowCursor !== false) {
    const seedKey = `${wd.uvCursorX ?? 0}:${wd.uvCursorY ?? 0}`;
    let cs = uvCursorStates.get(node.id);
    if (!cs || cs.seededKey !== seedKey) {
      cs = { x: wd.uvCursorX ?? 14, y: wd.uvCursorY ?? 4, seededKey: seedKey };
      uvCursorStates.set(node.id, cs);
    }
    const cx = Math.max(0, Math.min(w - 1, cs.x));
    const cy = Math.max(0, Math.min(h - 1, cs.y));
    grid[cy][cx] = { ...grid[cy][cx], reverse: true };
  }

  return flushGridToAnsi(grid);
}

export function renderCellbufCanvas(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG = true): string {
  const wd = node.widgetData ?? defaultWidgetData("cellbuf:canvas");
  const w = Math.max(8, innerW);
  const h = Math.max(3, innerH);
  const grid: GridCell[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ch: " ", fg: "", bg: "", bold: false }))
  );

  for (const layer of wd.cellbufLayers ?? []) {
    const fgChecker = resolveColorRef(doc.tokens, layer.fg || "#414868", darkBG, "#414868");
    const fgBox = resolveColorRef(doc.tokens, layer.fg || "#b9a2ff", darkBG, "#b9a2ff");
    const fgLine = resolveColorRef(doc.tokens, layer.fg || "#ff5eae", darkBG, "#ff5eae");
    const fgText = resolveColorRef(doc.tokens, layer.fg || "#6dffc2", darkBG, "#6dffc2");
    const layerBg = layer.bg ? resolveColorRef(doc.tokens, layer.bg, darkBG, "") : "";
    if (layer.shape === "checker") {
      const ch = Array.from(layer.borderChar || "░")[0] || "░";
      for (let y = Math.max(0, layer.y); y < Math.min(h, layer.y + layer.h); y++) {
        for (let x = Math.max(0, layer.x); x < Math.min(w, layer.x + layer.w); x++) {
          if ((x + y) % 2 === 0) {
            grid[y][x] = { ch, fg: fgChecker, bg: layerBg, bold: false };
          }
        }
      }
    } else if (layer.shape === "box") {
      const x0 = layer.x;
      const y0 = layer.y;
      const x1 = layer.x + Math.max(2, layer.w) - 1;
      const y1 = layer.y + Math.max(2, layer.h) - 1;
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) {
          let ch = " ";
          if (x === x0 && y === y0) ch = "╭";
          else if (x === x1 && y === y0) ch = "╮";
          else if (x === x0 && y === y1) ch = "╰";
          else if (x === x1 && y === y1) ch = "╯";
          else if (y === y0 || y === y1) ch = Array.from(layer.borderChar || "─")[0] || "─";
          else if (x === x0 || x === x1) ch = "│";
          grid[y][x] = { ch, fg: fgBox, bg: layerBg, bold: false };
        }
      }
    } else if (layer.shape === "line") {
      const ch = Array.from(layer.borderChar || "─")[0] || "─";
      if (layer.y >= 0 && layer.y < h) {
        for (let x = Math.max(0, layer.x); x < Math.min(w, layer.x + layer.w); x++) {
          grid[layer.y][x] = { ch, fg: fgLine, bg: layerBg || grid[layer.y][x].bg, bold: false };
        }
      }
    } else if (layer.shape === "text") {
      if (layer.y >= 0 && layer.y < h) {
        Array.from(layer.text || "").forEach((ch, idx) => {
          const x = layer.x + idx;
          if (x >= 0 && x < w) {
            grid[layer.y][x] = { ch, fg: fgText, bg: layerBg || grid[layer.y][x].bg, bold: true };
          }
        });
      }
    }
  }

  return flushGridToAnsi(grid);
}
