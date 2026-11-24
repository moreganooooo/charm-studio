import { defaultWidgetData, type ContentType, type GlamourThemeName, type HuhThemeName, type IRDoc, type IRHuhField, type IRNode, type TokenPair } from "./types";
import {
  controlClockWidget,
  dispatchExtraWidgetKey,
  getClockWidgetRunning,
  getOverlayHarmonicaOffset,
  hasAnimatedWidgets,
  renderBubbleClock,
  renderBubbleFilePicker,
  renderBubbleHelp,
  renderBubblePaginator,
  renderBubbleProgress,
  renderBubbleSpinner,
  renderBubbleTextArea,
  renderCellbufCanvas,
  renderLipglossDivider,
  renderUvScreen,
  resolveColorRef,
  stepWidgetAnimations,
} from "./charmWidgetsExtra";

export {
  controlClockWidget,
  getClockWidgetRunning,
  getOverlayHarmonicaOffset,
  hasAnimatedWidgets,
  stepWidgetAnimations,
};

export const CHARM_WIDGET_TYPES = new Set<ContentType>([
  "lipgloss:divider",
  "bubble:textarea",
  "bubble:progress",
  "bubble:spinner",
  "bubble:filepicker",
  "bubble:paginator",
  "bubble:help",
  "bubble:timer",
  "bubble:stopwatch",
  "huh:form",
  "glamour:markdown",
  "gum:choose",
  "gum:confirm",
  "wish:ssh",
  "uv:screen",
  "cellbuf:canvas",
]);

export function isCustomHydratedWidget(node: IRNode): boolean {
  const ct = node.contentType;
  if (!ct || ct === "bubble:textinput") return false;
  if (CHARM_WIDGET_TYPES.has(ct)) return true;
  if (ct === "bubble:viewport" && Boolean((node.content ?? "").trim())) return true;
  if (ct.startsWith("bubble:") && Boolean(node.widgetData)) return true;
  return false;
}

export function isCharmWidget(ct?: ContentType): boolean {
  return Boolean(ct && CHARM_WIDGET_TYPES.has(ct));
}

// --- ANSI SGR helpers (consumed natively by studio.wasm Lip Gloss v2 + colorprofile) ---

const RESET = "\x1b[0m";

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function fg(hex: string, text: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return text;
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}${RESET}`;
}

function fgBg(fgHex: string, bgHex: string, text: string, isBold = false): string {
  const f = hexToRgb(fgHex);
  const b = hexToRgb(bgHex);
  const parts: string[] = [];
  if (isBold) parts.push("1");
  if (f) parts.push(`38;2;${f[0]};${f[1]};${f[2]}`);
  if (b) parts.push(`48;2;${b[0]};${b[1]};${b[2]}`);
  if (parts.length === 0) return text;
  return `\x1b[${parts.join(";")}m${text}${RESET}`;
}

function bold(text: string): string {
  return `\x1b[1m${text}${RESET}`;
}

function italic(text: string): string {
  return `\x1b[3m${text}${RESET}`;
}

function faint(text: string): string {
  return `\x1b[2m${text}${RESET}`;
}

function underline(text: string): string {
  return `\x1b[4m${text}${RESET}`;
}

const ANSI_RE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function visibleLen(s: string): number {
  return Array.from(stripAnsi(s)).length;
}

function padRightVisible(s: string, targetW: number): string {
  const len = visibleLen(s);
  if (len >= targetW) return s;
  return s + " ".repeat(targetW - len);
}

function clipVisible(s: string, maxW: number): string {
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

function wrapPlainText(text: string, maxW: number): string[] {
  if (maxW <= 1) return [text.slice(0, Math.max(1, maxW))];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) {
      cur = Array.from(w).length > maxW ? Array.from(w).slice(0, maxW - 1).join("") + "…" : w;
    } else if (Array.from(cur).length + 1 + Array.from(w).length <= maxW) {
      cur += " " + w;
    } else {
      lines.push(cur);
      cur = Array.from(w).length > maxW ? Array.from(w).slice(0, maxW - 1).join("") + "…" : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function resolveToken(tokens: Record<string, TokenPair>, name: string, darkBG: boolean, fallback: string): string {
  const pair = tokens[name];
  if (!pair) return fallback;
  return (darkBG ? pair.dark : pair.light) || fallback;
}

// --- Interactive Widget State ---

interface HuhState {
  focusIdx: number;
  groupIdx: number;
  inputs: Record<string, string>;
  texts: Record<string, string[]>;
  selects: Record<string, number>;
  selectFilters: Record<string, string>;
  selectFiltering: Record<string, boolean>;
  multiSelects: Record<string, Set<number>>;
  confirms: Record<string, boolean>;
  errors: Record<string, string | null>;
  submitted: boolean;
}

interface GlamourState {
  scroll: number;
}

interface GumChooseState {
  cursor: number;
  selected: Set<number>;
  filter: string;
}

interface GumConfirmState {
  affirmative: boolean;
  confirmed: boolean | null;
}

interface WishState {
  sessionIdx: number;
}

interface CustomListState {
  cursor: number;
  filtering: boolean;
  filter: string;
}

interface CustomTableState {
  cursor: number;
}

const huhStates = new Map<string, HuhState>();
const glamourStates = new Map<string, GlamourState>();
const gumChooseStates = new Map<string, GumChooseState>();
const gumConfirmStates = new Map<string, GumConfirmState>();
const wishStates = new Map<string, WishState>();
const customListStates = new Map<string, CustomListState>();
const customTableStates = new Map<string, CustomTableState>();
const viewportStates = new Map<string, GlamourState>();

const huhFieldsRegistry = new Map<string, IRHuhField[]>();
const gumFilteredCache = new Map<string, number[]>();
const listFilteredCache = new Map<string, number[]>();
const tableRowCountCache = new Map<string, number>();

const DEFAULT_MARKDOWN = `# Charmbracelet Ecosystem

Welcome to **Glamour** — stylesheet-based Markdown rendering for your terminal.

## Supported Libraries

- **Lip Gloss**: Declarative CSS-like terminal styling
- **Bubbles**: Reusable TUI components (\`list\`, \`table\`, \`viewport\`)
- **Huh**: Interactive forms, selects & confirmations
- **Gum**: Glamorous shell prompts & filters
- **Wish**: SSH apps & Soft Serve portals

> "Make the command line glamorous." — Charm

\`\`\`go
renderer, _ := glamour.NewTermRenderer(
    glamour.WithAutoStyle(),
    glamour.WithWordWrap(72),
)
out, _ := renderer.Render(markdown)
\`\`\`

Press \`↑\`/\`↓\` or \`j\`/\`k\` to scroll this Glamour document.`;

const DEFAULT_GUM_OPTIONS = [
  "deploy-api-gateway",
  "migrate-postgres-v16",
  "rotate-ssh-host-keys",
  "publish-wasm-bundle",
  "prune-edge-cache",
  "sync-charm-tokens",
];

const WISH_SESSIONS = [
  { user: "morgan", ip: "10.42.0.18", client: "OpenSSH_9.8", key: "SHA256:xK9vP2mR8qL4zT1w", uptime: "04m 19s", active: 3 },
  { user: "ci-bot", ip: "172.16.4.91", client: "Wish_v1.4.0", key: "SHA256:aB7nQ5tW2yH6cM9p", uptime: "18m 02s", active: 5 },
  { user: "guest", ip: "192.168.1.44", client: "Ghostty_1.1", key: "SHA256:zR3dJ8kN4vF1sL7x", uptime: "00m 42s", active: 2 },
];

function validateHuhField(field: IRHuhField, value: string, multiCount?: number): string | null {
  if (field.kind === "multiselect") {
    const count = multiCount ?? 0;
    if (field.minSelect && count < field.minSelect) {
      return field.errorMessage || `Select at least ${field.minSelect}`;
    }
    if (field.maxSelect && count > field.maxSelect) {
      return field.errorMessage || `Select at most ${field.maxSelect}`;
    }
    return null;
  }
  const rule = field.validation ?? "none";
  if (rule === "none") return null;
  const trimmed = value.trim();
  if (rule === "required" && !trimmed) {
    return field.errorMessage || `${field.label} is required`;
  }
  if (rule === "minLength") {
    const min = Math.max(1, parseInt(field.validationParam || "3", 10) || 3);
    if (trimmed.length < min) {
      return field.errorMessage || `Must be at least ${min} chars`;
    }
  }
  if (rule === "email" && (!trimmed.includes("@") || !trimmed.includes("."))) {
    return field.errorMessage || "Enter a valid email address";
  }
  if (rule === "regex" && field.validationParam) {
    try {
      const re = new RegExp(field.validationParam);
      if (!re.test(trimmed)) return field.errorMessage || "Invalid format";
    } catch {
      // ignore invalid regex while typing
    }
  }
  return null;
}

function getHuhState(id: string, fields: IRHuhField[]): HuhState {
  let s = huhStates.get(id);
  if (!s) {
    const inputs: Record<string, string> = {};
    const texts: Record<string, string[]> = {};
    const selects: Record<string, number> = {};
    const multiSelects: Record<string, Set<number>> = {};
    const confirms: Record<string, boolean> = {};
    fields.forEach((f) => {
      if (f.kind === "input") inputs[f.id] = f.placeholder ?? "charm-cli-app";
      else if (f.kind === "text") texts[f.id] = [f.placeholder ?? ""];
      else if (f.kind === "select") selects[f.id] = 0;
      else if (f.kind === "multiselect") multiSelects[f.id] = new Set([0]);
      else if (f.kind === "confirm") confirms[f.id] = true;
    });
    s = {
      focusIdx: 0,
      groupIdx: 0,
      inputs,
      texts,
      selects,
      selectFilters: {},
      selectFiltering: {},
      multiSelects,
      confirms,
      errors: {},
      submitted: false,
    };
    huhStates.set(id, s);
  }
  fields.forEach((f) => {
    if (f.kind === "input" && s!.inputs[f.id] === undefined) s!.inputs[f.id] = f.placeholder ?? "";
    if (f.kind === "text" && s!.texts[f.id] === undefined) s!.texts[f.id] = [f.placeholder ?? ""];
    if (f.kind === "select" && s!.selects[f.id] === undefined) s!.selects[f.id] = 0;
    if (f.kind === "multiselect" && s!.multiSelects[f.id] === undefined) s!.multiSelects[f.id] = new Set([0]);
    if (f.kind === "confirm" && s!.confirms[f.id] === undefined) s!.confirms[f.id] = true;
  });
  const maxGroup = Math.max(0, ...fields.map((f) => f.group ?? 0));
  if (s.groupIdx > maxGroup) s.groupIdx = 0;
  const visibleEditable = fields.filter((f) => f.kind !== "note" && (f.group ?? 0) === s!.groupIdx);
  s.focusIdx = Math.min(s.focusIdx, Math.max(0, visibleEditable.length - 1));
  return s;
}

function getGlamourState(id: string): GlamourState {
  let s = glamourStates.get(id);
  if (!s) {
    s = { scroll: 0 };
    glamourStates.set(id, s);
  }
  return s;
}

function getViewportState(id: string): GlamourState {
  let s = viewportStates.get(id);
  if (!s) {
    s = { scroll: 0 };
    viewportStates.set(id, s);
  }
  return s;
}

function getCustomListState(id: string): CustomListState {
  let s = customListStates.get(id);
  if (!s) {
    s = { cursor: 0, filtering: false, filter: "" };
    customListStates.set(id, s);
  }
  return s;
}

function getCustomTableState(id: string): CustomTableState {
  let s = customTableStates.get(id);
  if (!s) {
    s = { cursor: 0 };
    customTableStates.set(id, s);
  }
  return s;
}

function getGumChooseState(id: string): GumChooseState {
  let s = gumChooseStates.get(id);
  if (!s) {
    s = { cursor: 0, selected: new Set([0, 3]), filter: "" };
    gumChooseStates.set(id, s);
  }
  return s;
}

function getGumConfirmState(id: string): GumConfirmState {
  let s = gumConfirmStates.get(id);
  if (!s) {
    s = { affirmative: true, confirmed: null };
    gumConfirmStates.set(id, s);
  }
  return s;
}

function getWishState(id: string): WishState {
  let s = wishStates.get(id);
  if (!s) {
    s = { sessionIdx: 0 };
    wishStates.set(id, s);
  }
  return s;
}

function parseGumChooseContent(raw: string | undefined): { prompt: string; items: string[] } {
  const lines = (raw ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return { prompt: "Choose targets to deploy:", items: DEFAULT_GUM_OPTIONS };
  }
  if (lines[0].startsWith("#")) {
    return {
      prompt: lines[0].replace(/^#+\s*/, ""),
      items: lines.slice(1).length > 0 ? lines.slice(1) : DEFAULT_GUM_OPTIONS,
    };
  }
  return { prompt: "Choose targets:", items: lines };
}

export function dispatchCharmWidgetKey(nodeId: string, key: string, ct?: ContentType): boolean {
  if (!ct || ct === "bubble:textinput") return false;
  if (dispatchExtraWidgetKey(nodeId, key, ct)) return true;

  if (ct === "bubble:list") {
    const s = getCustomListState(nodeId);
    if (s.filtering) {
      if (key === "Escape" || key === "Enter") {
        s.filtering = false;
        return true;
      }
      if (key === "Backspace") {
        s.filter = s.filter.slice(0, -1);
        s.cursor = 0;
        return true;
      }
      if (key.length === 1 && s.filter.length < 24) {
        s.filter += key;
        s.cursor = 0;
        return true;
      }
    }
    if (key === "/") {
      s.filtering = true;
      return true;
    }
    if (key === "Escape" && s.filter) {
      s.filter = "";
      s.cursor = 0;
      return true;
    }
    const maxLen = Math.max(1, (listFilteredCache.get(nodeId) ?? [0]).length);
    if (key === "ArrowDown" || key === "j") {
      s.cursor = Math.min(maxLen - 1, s.cursor + 1);
      return true;
    }
    if (key === "ArrowUp" || key === "k") {
      s.cursor = Math.max(0, s.cursor - 1);
      return true;
    }
    return false;
  }

  if (ct === "bubble:table") {
    const s = getCustomTableState(nodeId);
    const maxLen = Math.max(1, tableRowCountCache.get(nodeId) ?? 1);
    if (key === "ArrowDown" || key === "j") {
      s.cursor = Math.min(maxLen - 1, s.cursor + 1);
      return true;
    }
    if (key === "ArrowUp" || key === "k") {
      s.cursor = Math.max(0, s.cursor - 1);
      return true;
    }
    if (key === "PageDown") {
      s.cursor = Math.min(maxLen - 1, s.cursor + 4);
      return true;
    }
    if (key === "PageUp") {
      s.cursor = Math.max(0, s.cursor - 4);
      return true;
    }
    return false;
  }

  if (ct === "bubble:viewport") {
    const s = getViewportState(nodeId);
    if (key === "ArrowDown" || key === "j") {
      s.scroll += 1;
      return true;
    }
    if (key === "ArrowUp" || key === "k") {
      s.scroll = Math.max(0, s.scroll - 1);
      return true;
    }
    if (key === "PageDown") {
      s.scroll += 5;
      return true;
    }
    if (key === "PageUp") {
      s.scroll = Math.max(0, s.scroll - 5);
      return true;
    }
    return false;
  }

  if (ct === "huh:form") {
    const allFields = huhFieldsRegistry.get(nodeId) ?? defaultWidgetData("huh:form").huhFields ?? [];
    const maxGroup = Math.max(0, ...allFields.map((f) => f.group ?? 0));
    const s = getHuhState(nodeId, allFields);
    const fields = allFields.filter((f) => f.kind !== "note" && (f.group ?? 0) === s.groupIdx);

    if (key === "[" && s.groupIdx > 0) {
      s.groupIdx--;
      s.focusIdx = 0;
      return true;
    }
    if (key === "]" && s.groupIdx < maxGroup) {
      s.groupIdx++;
      s.focusIdx = 0;
      return true;
    }
    if (fields.length === 0) {
      if (key !== "Enter") return false;
      if (s.groupIdx < maxGroup) {
        s.groupIdx++;
        s.focusIdx = 0;
      } else {
        s.submitted = true;
      }
      return true;
    }

    const active = fields[s.focusIdx];
    if (active && active.kind === "select" && s.selectFiltering[active.id]) {
      if (key === "Escape" || key === "Enter") {
        s.selectFiltering[active.id] = false;
        return true;
      }
      if (key === "Backspace") {
        s.selectFilters[active.id] = (s.selectFilters[active.id] ?? "").slice(0, -1);
        return true;
      }
      if (key.length === 1) {
        s.selectFilters[active.id] = (s.selectFilters[active.id] ?? "") + key;
        return true;
      }
    }

    if (key === "Tab") {
      if (s.focusIdx < fields.length - 1) {
        s.focusIdx++;
      } else if (s.groupIdx < maxGroup) {
        s.groupIdx++;
        s.focusIdx = 0;
      } else {
        s.groupIdx = 0;
        s.focusIdx = 0;
      }
      return true;
    }
    if (key === "Shift+Tab") {
      if (s.focusIdx > 0) {
        s.focusIdx--;
      } else if (s.groupIdx > 0) {
        s.groupIdx--;
        const prevFields = allFields.filter((f) => f.kind !== "note" && (f.group ?? 0) === s.groupIdx);
        s.focusIdx = Math.max(0, prevFields.length - 1);
      }
      return true;
    }

    if (!active) return false;
    if (active.kind === "input") {
      if (key === "ArrowDown") {
        s.focusIdx = (s.focusIdx + 1) % fields.length;
        return true;
      }
      if (key === "ArrowUp") {
        s.focusIdx = (s.focusIdx + fields.length - 1) % fields.length;
        return true;
      }
      if (key === "Backspace") {
        s.inputs[active.id] = (s.inputs[active.id] ?? "").slice(0, -1);
        s.errors[active.id] = validateHuhField(active, s.inputs[active.id]);
        s.submitted = false;
        return true;
      }
      if (key === "Enter") {
        const err = validateHuhField(active, s.inputs[active.id] ?? "");
        s.errors[active.id] = err;
        if (err) return true;
        if (s.focusIdx < fields.length - 1) s.focusIdx++;
        else if (s.groupIdx < maxGroup) { s.groupIdx++; s.focusIdx = 0; }
        else s.submitted = true;
        return true;
      }
      const limit = active.charLimit && active.charLimit > 0 ? active.charLimit : 40;
      if (key.length === 1 && (s.inputs[active.id] ?? "").length < limit) {
        s.inputs[active.id] = (s.inputs[active.id] ?? "") + key;
        s.errors[active.id] = validateHuhField(active, s.inputs[active.id]);
        s.submitted = false;
        return true;
      }
    } else if (active.kind === "text") {
      const lines = s.texts[active.id] ?? [""];
      const maxLines = active.lineLimit && active.lineLimit > 0 ? active.lineLimit : 6;
      if (key === "Backspace") {
        const last = lines[lines.length - 1];
        if (last.length > 0) lines[lines.length - 1] = last.slice(0, -1);
        else if (lines.length > 1) lines.pop();
        s.texts[active.id] = lines;
        s.errors[active.id] = validateHuhField(active, lines.join("\n"));
        s.submitted = false;
        return true;
      }
      if (key === "Enter") {
        if (lines.length < maxLines) {
          lines.push("");
          s.texts[active.id] = lines;
        } else {
          if (s.focusIdx < fields.length - 1) s.focusIdx++;
          else if (s.groupIdx < maxGroup) { s.groupIdx++; s.focusIdx = 0; }
          else s.submitted = true;
        }
        return true;
      }
      if (key.length === 1) {
        lines[lines.length - 1] = lines[lines.length - 1] + key;
        s.texts[active.id] = lines;
        s.errors[active.id] = validateHuhField(active, lines.join("\n"));
        s.submitted = false;
        return true;
      }
    } else if (active.kind === "select") {
      const opts = active.options?.length ? active.options : ["Option A", "Option B"];
      const q = (s.selectFilters[active.id] ?? "").trim().toLowerCase();
      const filteredOpts = opts.map((o, i) => ({ o, i })).filter((x) => !q || x.o.toLowerCase().includes(q));
      const cur = s.selects[active.id] ?? 0;
      if (key === "/" && active.filterable !== false) {
        s.selectFiltering[active.id] = true;
        return true;
      }
      if (key === "ArrowRight" || key === " " || key === "l" || key === "ArrowDown") {
        if (filteredOpts.length > 0) {
          const pos = Math.max(0, filteredOpts.findIndex((x) => x.i === cur));
          s.selects[active.id] = filteredOpts[(pos + 1) % filteredOpts.length].i;
        }
        s.submitted = false;
        return true;
      }
      if (key === "ArrowLeft" || key === "h" || key === "ArrowUp") {
        if (filteredOpts.length > 0) {
          const pos = Math.max(0, filteredOpts.findIndex((x) => x.i === cur));
          s.selects[active.id] = filteredOpts[(pos + filteredOpts.length - 1) % filteredOpts.length].i;
        }
        s.submitted = false;
        return true;
      }
      if (key === "Enter") {
        if (s.focusIdx < fields.length - 1) s.focusIdx++;
        else if (s.groupIdx < maxGroup) { s.groupIdx++; s.focusIdx = 0; }
        else s.submitted = true;
        return true;
      }
    } else if (active.kind === "multiselect") {
      const opts = active.options?.length ? active.options : ["Option A", "Option B"];
      const curSet = s.multiSelects[active.id] ?? new Set<number>();
      const curIdx = s.selects[active.id] ?? 0;
      if (key === "ArrowDown" || key === "j" || key === "ArrowRight") {
        s.selects[active.id] = (curIdx + 1) % opts.length;
        return true;
      }
      if (key === "ArrowUp" || key === "k" || key === "ArrowLeft") {
        s.selects[active.id] = (curIdx + opts.length - 1) % opts.length;
        return true;
      }
      if (key === " ") {
        if (curSet.has(curIdx)) curSet.delete(curIdx);
        else if (!active.maxSelect || curSet.size < active.maxSelect) curSet.add(curIdx);
        s.multiSelects[active.id] = curSet;
        s.errors[active.id] = validateHuhField(active, "", curSet.size);
        s.submitted = false;
        return true;
      }
      if (key === "Enter") {
        const err = validateHuhField(active, "", curSet.size);
        s.errors[active.id] = err;
        if (err) return true;
        if (s.focusIdx < fields.length - 1) s.focusIdx++;
        else if (s.groupIdx < maxGroup) { s.groupIdx++; s.focusIdx = 0; }
        else s.submitted = true;
        return true;
      }
    } else if (active.kind === "confirm") {
      if (key === "ArrowLeft" || key === "ArrowRight" || key === " ") {
        s.confirms[active.id] = !s.confirms[active.id];
        s.submitted = false;
        return true;
      }
      if (key === "y" || key === "Y") {
        s.confirms[active.id] = true;
        s.submitted = false;
        return true;
      }
      if (key === "n" || key === "N") {
        s.confirms[active.id] = false;
        s.submitted = false;
        return true;
      }
      if (key === "Enter") {
        if (s.focusIdx < fields.length - 1) s.focusIdx++;
        else if (s.groupIdx < maxGroup) { s.groupIdx++; s.focusIdx = 0; }
        else s.submitted = true;
        return true;
      }
    }
    return false;
  }

  if (ct === "glamour:markdown") {
    const s = getGlamourState(nodeId);
    if (key === "ArrowDown" || key === "j") {
      s.scroll += 1;
      return true;
    }
    if (key === "ArrowUp" || key === "k") {
      s.scroll = Math.max(0, s.scroll - 1);
      return true;
    }
    if (key === "PageDown") {
      s.scroll += 5;
      return true;
    }
    if (key === "PageUp") {
      s.scroll = Math.max(0, s.scroll - 5);
      return true;
    }
    return false;
  }

  if (ct === "gum:choose") {
    const s = getGumChooseState(nodeId);
    if (key === "ArrowDown" || key === "j") {
      s.cursor += 1;
      return true;
    }
    if (key === "ArrowUp" || key === "k") {
      s.cursor = Math.max(0, s.cursor - 1);
      return true;
    }
    if (key === " " || key === "Enter") {
      const list = gumFilteredCache.get(nodeId) ?? [0];
      const realIdx = list[Math.min(s.cursor, Math.max(0, list.length - 1))];
      if (realIdx !== undefined) {
        if (s.selected.has(realIdx)) s.selected.delete(realIdx);
        else s.selected.add(realIdx);
      }
      return true;
    }
    if (key === "Backspace") {
      s.filter = s.filter.slice(0, -1);
      s.cursor = 0;
      return true;
    }
    if (key.length === 1 && /[a-zA-Z0-9\-_.]/.test(key) && s.filter.length < 20) {
      s.filter += key;
      s.cursor = 0;
      return true;
    }
    if (key === "Escape") {
      s.filter = "";
      s.cursor = 0;
      return true;
    }
    return false;
  }

  if (ct === "gum:confirm") {
    const s = getGumConfirmState(nodeId);
    if (key === "ArrowLeft" || key === "ArrowRight" || key === "Tab" || key === "h" || key === "l") {
      s.affirmative = !s.affirmative;
      s.confirmed = null;
      return true;
    }
    if (key === "y" || key === "Y") {
      s.affirmative = true;
      s.confirmed = true;
      return true;
    }
    if (key === "n" || key === "N") {
      s.affirmative = false;
      s.confirmed = false;
      return true;
    }
    if (key === "Enter" || key === " ") {
      s.confirmed = s.affirmative;
      return true;
    }
    return false;
  }

  if (ct === "wish:ssh") {
    const s = getWishState(nodeId);
    if (key === "r" || key === "Enter" || key === " " || key === "ArrowRight" || key === "ArrowLeft") {
      s.sessionIdx = (s.sessionIdx + 1) % WISH_SESSIONS.length;
      return true;
    }
    return false;
  }

  return false;
}

// --- Renderers ---

function renderCustomList(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const s = getCustomListState(node.id);
  const data = node.widgetData ?? defaultWidgetData("bubble:list");
  const title = data.listTitle || node.content?.split("\n")[0] || "Navigation";
  const items = data.listItems?.length ? data.listItems : defaultWidgetData("bubble:list").listItems!;
  const showStatusBar = data.listShowStatusBar ?? true;
  const showPagination = data.listShowPagination ?? true;
  const delegateMode = data.listDelegateMode ?? "default";

  const accent = resolveToken(doc.tokens, "accent", darkBG, darkBG ? "#7aa2f7" : "#2e7de9");
  const glow = resolveToken(doc.tokens, "modalGlow", darkBG, darkBG ? "#bb9af7" : "#9854f1");
  const muted = resolveToken(doc.tokens, "borderIdle", darkBG, darkBG ? "#414868" : "#9aa5ce");
  const textMain = resolveToken(doc.tokens, "textMain", darkBG, darkBG ? "#c0caf5" : "#3760bf");
  const onAccent = darkBG ? "#11111b" : "#ffffff";

  const q = s.filter.trim().toLowerCase();
  const filtered = items
    .map((item, idx) => ({ item, idx }))
    .filter((entry) => !q || entry.item.title.toLowerCase().includes(q) || entry.item.desc.toLowerCase().includes(q));
  listFilteredCache.set(node.id, filtered.map((f) => f.idx));
  if (s.cursor >= filtered.length) s.cursor = Math.max(0, filtered.length - 1);

  const w = Math.max(10, innerW);
  const lines: string[] = [];

  if (s.filtering) {
    lines.push(fg(glow, "/ ") + fg(textMain, s.filter) + fg(accent, "█"));
  } else {
    lines.push(
      fgBg(onAccent, accent, ` ${title} `, true) +
        (q ? " " + fg(glow, `[${q}]`) : "")
    );
  }
  if (showStatusBar && innerH >= 5) {
    lines.push(faint(fg(muted, `${filtered.length} ${filtered.length === 1 ? "item" : "items"}`)));
  } else {
    lines.push("");
  }

  const headerLines = lines.length;
  const footerReserve = showPagination && innerH >= 6 ? 1 : 0;
  const perItemLines = delegateMode === "compact" ? 1 : 2;
  const rowsBudget = Math.max(1, Math.floor((innerH - headerLines - footerReserve) / perItemLines));
  const start = Math.max(0, s.cursor - rowsBudget + 1);
  const slice = filtered.slice(start, start + rowsBudget);

  if (slice.length === 0) {
    lines.push(faint(fg(muted, "  No matching items")));
  } else {
    slice.forEach(({ item }, relPos) => {
      const active = start + relPos === s.cursor;
      const bar = delegateMode === "accent"
        ? active ? fg(accent, "▌ ") : fg(muted, "· ")
        : active ? fg(glow, "┃ ") : "  ";
      lines.push(bar + (active ? bold(fg(accent, item.title)) : fg(textMain, item.title)));
      if (delegateMode !== "compact" && lines.length < innerH - footerReserve) {
        lines.push((active ? fg(glow, "┃ ") : "  ") + faint(fg(muted, item.desc)));
      }
    });
  }

  if (showPagination && innerH >= 6) {
    const pageCount = Math.max(1, Math.ceil(filtered.length / rowsBudget));
    const curPage = Math.min(pageCount - 1, Math.floor(s.cursor / rowsBudget));
    const dots = Array.from({ length: pageCount }, (_, i) => (i === curPage ? fg(accent, "•") : fg(muted, "◦"))).join(" ");
    lines.push(dots);
  }

  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, w)).join("\n");
}

function renderCustomTable(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const s = getCustomTableState(node.id);
  const data = node.widgetData ?? defaultWidgetData("bubble:table");
  const cols = data.tableColumns?.length ? data.tableColumns : defaultWidgetData("bubble:table").tableColumns!;
  const rows = data.tableRows ?? defaultWidgetData("bubble:table").tableRows!;
  tableRowCountCache.set(node.id, Math.max(1, rows.length));
  if (s.cursor >= rows.length) s.cursor = Math.max(0, rows.length - 1);

  const accent = resolveToken(doc.tokens, "accent", darkBG, darkBG ? "#7aa2f7" : "#2e7de9");
  const muted = resolveToken(doc.tokens, "borderIdle", darkBG, darkBG ? "#414868" : "#9aa5ce");
  const textMain = resolveToken(doc.tokens, "textMain", darkBG, darkBG ? "#c0caf5" : "#3760bf");
  const onAccent = darkBG ? "#11111b" : "#ffffff";

  const headerFg = resolveColorRef(doc.tokens, data.tableHeaderFg, darkBG, textMain);
  const headerBg = data.tableHeaderBg ? resolveColorRef(doc.tokens, data.tableHeaderBg, darkBG, "") : "";
  const selFg = resolveColorRef(doc.tokens, data.tableSelectedFg, darkBG, onAccent);
  const selBg = resolveColorRef(doc.tokens, data.tableSelectedBg, darkBG, accent);
  const bStyle = data.tableBorderStyle ?? "normal";
  const divChar = bStyle === "thick" ? "━" : bStyle === "rounded" ? "┄" : "─";

  const w = Math.max(12, innerW);
  const formatCell = (val: string, width: number) => {
    const trimmed = Array.from(val).slice(0, Math.max(2, width - 1)).join("");
    return padRightVisible(trimmed, width);
  };

  const lines: string[] = [];
  const headerStr = cols.map((c) => formatCell(c.title, c.width)).join(" ");
  lines.push(headerBg ? fgBg(headerFg, headerBg, clipVisible(headerStr, w), true) : bold(fg(headerFg, headerStr)));
  if (bStyle !== "none") {
    lines.push(fg(muted, divChar.repeat(Math.min(w, Math.max(8, visibleLen(headerStr))))));
  }

  const bodyBudget = Math.max(1, innerH - lines.length);
  const start = Math.max(0, s.cursor - bodyBudget + 1);
  const slice = rows.slice(start, start + bodyBudget);

  if (rows.length === 0) {
    lines.push(faint(fg(muted, "(empty table — add rows in Inspector)")));
  } else {
    slice.forEach((row, relPos) => {
      const active = start + relPos === s.cursor;
      const lineTxt = cols.map((c, ci) => formatCell(row[ci] ?? "", c.width)).join(" ");
      const clipped = clipVisible(padRightVisible(lineTxt, Math.min(w, visibleLen(headerStr))), w);
      lines.push(active ? fgBg(selFg, selBg, clipped, true) : fg(textMain, clipped));
    });
  }

  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, w)).join("\n");
}

function renderCustomViewport(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const s = getViewportState(node.id);
  const textMain = resolveToken(doc.tokens, "textMain", darkBG, darkBG ? "#c0caf5" : "#3760bf");
  const raw = (node.content ?? "").trim() || "Scrollable viewport content...";
  const w = Math.max(10, innerW);
  const wrapped: string[] = [];
  for (const rawLine of raw.split("\n")) {
    if (!rawLine.trim()) {
      wrapped.push("");
    } else {
      for (const wl of wrapPlainText(rawLine, w)) {
        wrapped.push(fg(textMain, wl));
      }
    }
  }
  const maxScroll = Math.max(0, wrapped.length - innerH);
  if (s.scroll > maxScroll) s.scroll = maxScroll;
  return wrapped.slice(s.scroll, s.scroll + Math.max(1, innerH)).map((l) => clipVisible(l, w)).join("\n");
}

const HUH_THEME_PALETTES: Record<HuhThemeName, { accent: string; glow: string; muted: string; text: string; surface: string; err: string; ok: string }> = {
  charm: { accent: "#ff5eae", glow: "#6dffc2", muted: "#7c6f9f", text: "#f4eaff", surface: "#241934", err: "#fb7185", ok: "#4ade80" },
  dracula: { accent: "#ff79c6", glow: "#bd93f9", muted: "#6272a4", text: "#f8f8f2", surface: "#44475a", err: "#ff5555", ok: "#50fa7b" },
  catppuccin: { accent: "#cba6f7", glow: "#f5c2e7", muted: "#6c7086", text: "#cdd6f4", surface: "#313244", err: "#f38ba8", ok: "#a6e3a1" },
  base16: { accent: "#7aa2f7", glow: "#bb9af7", muted: "#565f89", text: "#c0caf5", surface: "#1f2335", err: "#f7768e", ok: "#9ece6a" },
};

function renderHuhForm(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const fields = node.widgetData?.huhFields?.length
    ? node.widgetData.huhFields
    : defaultWidgetData("huh:form").huhFields!;
  huhFieldsRegistry.set(node.id, fields);

  const s = getHuhState(node.id, fields);
  const themeName = node.widgetData?.huhTheme ?? "charm";
  const pal = HUH_THEME_PALETTES[themeName] ?? HUH_THEME_PALETTES.charm;
  const accent = themeName === "charm" ? resolveToken(doc.tokens, "accent", darkBG, pal.accent) : pal.accent;
  const glow = themeName === "charm" ? resolveToken(doc.tokens, "modalGlow", darkBG, pal.glow) : pal.glow;
  const muted = pal.muted;
  const textMain = darkBG ? pal.text : resolveToken(doc.tokens, "textMain", darkBG, "#3760bf");
  const surface = darkBG ? pal.surface : resolveToken(doc.tokens, "surface", darkBG, "#d5d6db");
  const onAccent = darkBG ? "#11111b" : "#ffffff";

  const maxGroup = Math.max(0, ...fields.map((f) => f.group ?? 0));
  const groupNames = node.widgetData?.huhGroupNames ?? [];
  const groupFields = fields.filter((f) => (f.group ?? 0) === s.groupIdx);
  const activeField = groupFields.filter((f) => f.kind !== "note")[s.focusIdx];

  const lines: string[] = [];
  const w = Math.max(12, innerW);

  if (maxGroup > 0) {
    const stepLabel = groupNames[s.groupIdx] || `Step ${s.groupIdx + 1}`;
    lines.push(
      fgBg(onAccent, accent, ` ${stepLabel} `, true) +
        " " +
        faint(fg(muted, `Group ${s.groupIdx + 1}/${maxGroup + 1} · [/] switch`))
    );
    lines.push("");
  }

  const bar = (active: boolean, hasErr: boolean) =>
    hasErr ? fg(pal.err, "┃ ") : active ? fg(accent, "┃ ") : fg(muted, "│ ");

  let activeEnd = lines.length;
  groupFields.forEach((field, idx) => {
    const active = field === activeField;
    const err = s.errors[field.id] ?? null;
    lines.push(bar(active, Boolean(err)) + bold(fg(err ? pal.err : active ? accent : textMain, field.label)));
    if (field.kind === "input") {
      const val = s.inputs[field.id] ?? "";
      const cur = active ? fg(glow, "█") : "";
      lines.push(
        bar(active, Boolean(err)) +
          fg(muted, "> ") +
          (val ? fg(textMain, val) : faint(fg(muted, field.placeholder || ""))) +
          cur
      );
    } else if (field.kind === "text") {
      const tLines = s.texts[field.id] ?? [field.placeholder || ""];
      tLines.forEach((tl, ti) => {
        const cur = active && ti === tLines.length - 1 ? fg(glow, "█") : "";
        lines.push(bar(active, Boolean(err)) + fg(textMain, tl || faint(fg(muted, field.placeholder || ""))) + cur);
      });
    } else if (field.kind === "select") {
      const opts = field.options?.length ? field.options : ["Option A", "Option B"];
      const q = (s.selectFilters[field.id] ?? "").trim().toLowerCase();
      if (s.selectFiltering[field.id]) {
        lines.push(bar(active, false) + fg(glow, "/ ") + fg(textMain, s.selectFilters[field.id] ?? "") + fg(accent, "█"));
      } else if (q) {
        lines.push(bar(active, false) + faint(fg(muted, `filter: ${q}`)));
      }
      const filteredOpts = opts.map((o, i) => ({ o, i })).filter((x) => !q || x.o.toLowerCase().includes(q));
      const selIdx = (s.selects[field.id] ?? 0) % opts.length;
      if (innerH >= 10 && groupFields.length <= 3) {
        filteredOpts.slice(0, 5).forEach(({ o, i }) => {
          const isCur = i === selIdx;
          const prefix = isCur ? fg(glow, "❯ ") : "  ";
          const lbl = isCur ? bold(fg(accent, o)) : fg(textMain, o);
          lines.push(bar(active, false) + prefix + lbl);
        });
      } else {
        lines.push(bar(active, false) + fg(glow, "◀ ") + bold(fg(accent, opts[selIdx])) + fg(glow, " ▶"));
      }
    } else if (field.kind === "multiselect") {
      const opts = field.options?.length ? field.options : ["Option A", "Option B"];
      const curSet = s.multiSelects[field.id] ?? new Set<number>();
      const curIdx = (s.selects[field.id] ?? 0) % opts.length;
      opts.slice(0, 5).forEach((opt, oi) => {
        const isCur = active && oi === curIdx;
        const checked = curSet.has(oi);
        const box = checked ? fg(pal.ok, "[✓] ") : fg(muted, "[ ] ");
        lines.push(bar(active, Boolean(err)) + (isCur ? fg(glow, "❯ ") : "  ") + box + (isCur ? bold(fg(accent, opt)) : fg(textMain, opt)));
      });
    } else if (field.kind === "note") {
      if (field.description) {
        for (const paragraph of field.description.split("\n")) {
          for (const line of wrapPlainText(paragraph, w - 2)) lines.push(bar(false, false) + fg(textMain, line));
        }
      }
    } else {
      const yes = s.confirms[field.id] ?? true;
      const yesBtn = yes ? fgBg(onAccent, accent, "  Yes  ", true) : fgBg(textMain, surface, "  Yes  ", false);
      const noBtn = !yes ? fgBg(onAccent, glow, "  No  ", true) : fgBg(textMain, surface, "  No  ", false);
      lines.push(bar(active, false) + yesBtn + "  " + noBtn);
    }
    if (err) {
      lines.push(bar(active, true) + fg(pal.err, `✕ ${err}`));
    }
    if (active) activeEnd = lines.length;
    if (idx < groupFields.length - 1) lines.push("");
  });

  if (s.submitted) {
    lines.push("");
    lines.push(fg(pal.ok, bold(`✓ Submitted Huh form (${themeName})`)));
  } else if (innerH >= 11) {
    lines.push("");
    lines.push(faint(fg(muted, "tab focus · ←/→/space choose · / filter · enter next")));
  }

  const height = Math.max(1, innerH);
  const start = Math.max(0, (s.submitted ? lines.length : activeEnd) - height);
  return lines.slice(start, start + height).map((l) => clipVisible(l, w)).join("\n");
}

const GLAMOUR_THEMES: Record<GlamourThemeName, { h1Fg: string; h1Bg: string; h2: string; h3: string; accent: string; codeFg: string; codeBg: string; kw: string; str: string; cmt: string; text: string; muted: string }> = {
  dark: { h1Fg: "#11111b", h1Bg: "#7aa2f7", h2: "#bb9af7", h3: "#7dcfff", accent: "#7aa2f7", codeFg: "#c0caf5", codeBg: "#1f2335", kw: "#bb9af7", str: "#9ece6a", cmt: "#565f89", text: "#c0caf5", muted: "#6c7086" },
  light: { h1Fg: "#ffffff", h1Bg: "#2e7de9", h2: "#9854f1", h3: "#007197", accent: "#2e7de9", codeFg: "#3760bf", codeBg: "#d5d6db", kw: "#9854f1", str: "#587539", cmt: "#848cb5", text: "#3760bf", muted: "#6172b0" },
  dracula: { h1Fg: "#282a36", h1Bg: "#ff79c6", h2: "#bd93f9", h3: "#8be9fd", accent: "#ff79c6", codeFg: "#f8f8f2", codeBg: "#44475a", kw: "#ff79c6", str: "#f1fa8c", cmt: "#6272a4", text: "#f8f8f2", muted: "#6272a4" },
  "tokyo-night": { h1Fg: "#1a1b26", h1Bg: "#7aa2f7", h2: "#bb9af7", h3: "#7dcfff", accent: "#7dcfff", codeFg: "#a9b1d6", codeBg: "#24283b", kw: "#bb9af7", str: "#9ece6a", cmt: "#565f89", text: "#c0caf5", muted: "#565f89" },
  pink: { h1Fg: "#150f1d", h1Bg: "#ff5eae", h2: "#6dffc2", h3: "#b9a2ff", accent: "#ff5eae", codeFg: "#f4eaff", codeBg: "#241934", kw: "#ff5eae", str: "#6dffc2", cmt: "#8d79b3", text: "#f4eaff", muted: "#9e8ec0" },
};

function highlightCodeLine(line: string, gt: (typeof GLAMOUR_THEMES)[GlamourThemeName]): string {
  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("#")) {
    return fg(gt.cmt, line);
  }
  const tokens = line.split(/(\s+|"[^"]*"|'[^']*'|\b(?:func|package|import|return|type|struct|if|else|for|range|var|const|err|nil|true|false|let|const|export|from)\b|\b\d+\b)/g);
  return tokens
    .map((tok) => {
      if (!tok) return "";
      if ((tok.startsWith('"') && tok.endsWith('"')) || (tok.startsWith("'") && tok.endsWith("'"))) return fg(gt.str, tok);
      if (/^(?:func|package|import|return|type|struct|if|else|for|range|var|const|err|nil|true|false|let|export|from)$/.test(tok)) return bold(fg(gt.kw, tok));
      if (/^\d+$/.test(tok)) return fg(gt.h3, tok);
      return fg(gt.codeFg, tok);
    })
    .join("");
}

function renderInlineMarkdown(line: string, accent: string, glow: string, textMain: string, surface: string): string {
  let out = line;
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => `${underline(fg(accent, label))} ${faint(`(${url})`)}`);
  out = out.replace(/`([^`]+)`/g, (_m, code) => fgBg(glow, surface, ` ${code} `));
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, b) => bold(fg(textMain, b)));
  out = out.replace(/\*([^*]+)\*/g, (_m, it) => italic(fg(textMain, it)));
  return out;
}

function renderGlamourMarkdown(node: IRNode, _doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const s = getGlamourState(node.id);
  const themeKey: GlamourThemeName = node.widgetData?.glamourTheme ?? (darkBG ? "dark" : "light");
  const gt = GLAMOUR_THEMES[themeKey] ?? GLAMOUR_THEMES.dark;

  const src = (node.content ?? "").trim() ? node.content! : DEFAULT_MARKDOWN;
  const w = Math.max(10, innerW);
  const rawLines = src.split("\n");
  const rendered: string[] = [];
  let inCode = false;

  for (let i = 0; i < rawLines.length; i++) {
    const trimmed = rawLines[i].trimEnd();
    if (trimmed.startsWith("```")) {
      inCode = !inCode;
      if (inCode) {
        const lang = trimmed.slice(3).trim();
        rendered.push(fg(gt.muted, `╭─ ${lang || "code"} ${"─".repeat(Math.max(0, w - (lang ? lang.length + 5 : 9)))}`));
      } else {
        rendered.push(fg(gt.muted, `╰${"─".repeat(Math.max(0, w - 2))}`));
      }
      continue;
    }

    if (inCode) {
      rendered.push(highlightCodeLine("  " + trimmed, gt));
      continue;
    }

    // Markdown table block
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableRows: string[][] = [];
      let j = i;
      while (j < rawLines.length && rawLines[j].trim().startsWith("|")) {
        const cells = rawLines[j].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        tableRows.push(cells);
        j++;
      }
      i = j - 1;
      const colCount = Math.max(...tableRows.map((r) => r.length));
      const colWidths = Array.from({ length: colCount }, (_, ci) =>
        Math.min(18, Math.max(4, ...tableRows.map((r) => Array.from(r[ci] ?? "").length)))
      );
      tableRows.forEach((r, ri) => {
        const isSep = r.every((c) => /^[-:]+$/.test(c));
        if (isSep) {
          rendered.push(fg(gt.muted, colWidths.map((cw) => "─".repeat(cw)).join("─┼─")));
        } else {
          const lineStr = colWidths.map((cw, ci) => padRightVisible((r[ci] ?? "").slice(0, cw), cw)).join(fg(gt.muted, " │ "));
          rendered.push(ri === 0 ? bold(fg(gt.h2, lineStr)) : fg(gt.text, lineStr));
        }
      });
      continue;
    }

    if (trimmed.startsWith("# ")) {
      const title = trimmed.slice(2).trim();
      rendered.push(fgBg(gt.h1Fg, gt.h1Bg, ` ${title} `, true));
      rendered.push("");
      continue;
    }
    if (trimmed.startsWith("## ")) {
      const h2 = trimmed.slice(3).trim();
      rendered.push(bold(fg(gt.h2, `## ${h2}`)));
      continue;
    }
    if (trimmed.startsWith("### ")) {
      const h3 = trimmed.slice(4).trim();
      rendered.push(bold(fg(gt.h3, `### ${h3}`)));
      continue;
    }
    if (trimmed.startsWith("> ")) {
      const quote = trimmed.slice(2).trim();
      for (const wl of wrapPlainText(quote, Math.max(6, w - 3))) {
        rendered.push(fg(gt.accent, "┃ ") + italic(fg(gt.muted, wl)));
      }
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const item = trimmed.replace(/^[-*]\s+/, "");
      const wrapped = wrapPlainText(item, Math.max(6, w - 3));
      wrapped.forEach((wl, idx) => {
        const styled = renderInlineMarkdown(wl, gt.accent, gt.h2, gt.text, gt.codeBg);
        rendered.push((idx === 0 ? fg(gt.accent, "• ") : "  ") + styled);
      });
      continue;
    }
    if (trimmed === "") {
      rendered.push("");
      continue;
    }

    for (const wl of wrapPlainText(trimmed, w)) {
      rendered.push(renderInlineMarkdown(wl, gt.accent, gt.h2, gt.text, gt.codeBg));
    }
  }

  const maxScroll = Math.max(0, rendered.length - innerH);
  if (s.scroll > maxScroll) s.scroll = maxScroll;
  const visible = rendered.slice(s.scroll, s.scroll + Math.max(1, innerH));
  return visible.map((l) => clipVisible(l, w)).join("\n");
}

function renderGumChoose(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const s = getGumChooseState(node.id);
  const accent = resolveToken(doc.tokens, "accent", darkBG, darkBG ? "#7aa2f7" : "#2e7de9");
  const glow = resolveToken(doc.tokens, "modalGlow", darkBG, darkBG ? "#bb9af7" : "#9854f1");
  const muted = resolveToken(doc.tokens, "borderIdle", darkBG, darkBG ? "#414868" : "#9aa5ce");
  const textMain = resolveToken(doc.tokens, "textMain", darkBG, darkBG ? "#c0caf5" : "#3760bf");

  const { prompt, items } = parseGumChooseContent(node.content);
  const q = s.filter.toLowerCase();
  const filteredIndices = items
    .map((label, idx) => ({ label, idx }))
    .filter((entry) => !q || entry.label.toLowerCase().includes(q))
    .map((entry) => entry.idx);

  gumFilteredCache.set(node.id, filteredIndices);
  if (s.cursor >= filteredIndices.length) s.cursor = Math.max(0, filteredIndices.length - 1);

  const w = Math.max(10, innerW);
  const lines: string[] = [];
  lines.push(bold(fg(accent, prompt)) + " " + faint(fg(muted, `(${s.selected.size}/${items.length})`)));
  lines.push(fg(glow, "> ") + (s.filter ? fg(textMain, s.filter) : faint(fg(muted, "type to filter..."))));

  const listBudget = Math.max(1, innerH - 3);
  const start = Math.max(0, s.cursor - listBudget + 1);
  const slice = filteredIndices.slice(start, start + listBudget);

  if (slice.length === 0) {
    lines.push(faint(fg(muted, "  (no matches)")));
  } else {
    slice.forEach((realIdx, relPos) => {
      const isCur = start + relPos === s.cursor;
      const isSel = s.selected.has(realIdx);
      const pointer = isCur ? fg(glow, "❯ ") : "  ";
      const box = isSel ? fg("#4ade80", "[✓] ") : fg(muted, "[ ] ");
      const lbl = isCur ? bold(fg(accent, items[realIdx])) : fg(textMain, items[realIdx]);
      lines.push(pointer + box + lbl);
    });
  }

  if (lines.length < innerH) {
    lines.push(faint(fg(muted, "↑/↓ move • space select • esc clear")));
  }

  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, w)).join("\n");
}

function renderGumConfirm(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const s = getGumConfirmState(node.id);
  const accent = resolveToken(doc.tokens, "accent", darkBG, darkBG ? "#7aa2f7" : "#2e7de9");
  const glow = resolveToken(doc.tokens, "modalGlow", darkBG, darkBG ? "#bb9af7" : "#9854f1");
  const muted = resolveToken(doc.tokens, "borderIdle", darkBG, darkBG ? "#414868" : "#9aa5ce");
  const textMain = resolveToken(doc.tokens, "textMain", darkBG, darkBG ? "#c0caf5" : "#3760bf");
  const surface = resolveToken(doc.tokens, "surface", darkBG, darkBG ? "#1f2335" : "#d5d6db");
  const onAccent = darkBG ? "#11111b" : "#ffffff";

  const prompt = (node.content ?? "").trim() || "Deploy release v2.4.0 to production?";
  const w = Math.max(12, innerW);
  const lines: string[] = [];

  for (const wl of wrapPlainText(prompt, w)) {
    lines.push(bold(fg(textMain, wl)));
  }
  lines.push("");

  const yesBtn = s.affirmative
    ? fgBg(onAccent, accent, "  Yes  ", true)
    : fgBg(textMain, surface, "  Yes  ", false);
  const noBtn = !s.affirmative
    ? fgBg(onAccent, glow, "  No  ", true)
    : fgBg(textMain, surface, "  No  ", false);

  lines.push(yesBtn + "   " + noBtn);

  if (s.confirmed !== null) {
    lines.push("");
    lines.push(
      s.confirmed
        ? fg("#4ade80", bold("✓ Confirmed (exit 0)"))
        : fg("#fb7185", bold("✕ Cancelled (exit 1)"))
    );
  } else if (innerH >= 5) {
    lines.push("");
    lines.push(faint(fg(muted, "←/→ toggle • y/n or enter confirm")));
  }

  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, w)).join("\n");
}

function renderWishBanner(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean, cols: number, rows: number): string {
  const s = getWishState(node.id);
  const sess = WISH_SESSIONS[s.sessionIdx % WISH_SESSIONS.length];
  const accent = resolveToken(doc.tokens, "accent", darkBG, darkBG ? "#7aa2f7" : "#2e7de9");
  const glow = resolveToken(doc.tokens, "modalGlow", darkBG, darkBG ? "#bb9af7" : "#9854f1");
  const muted = resolveToken(doc.tokens, "borderIdle", darkBG, darkBG ? "#414868" : "#9aa5ce");
  const textMain = resolveToken(doc.tokens, "textMain", darkBG, darkBG ? "#c0caf5" : "#3760bf");

  const host = (node.content ?? "").trim() || "ssh charm.studio -p 2323";
  const w = Math.max(12, innerW);
  const lines: string[] = [];

  lines.push(
    fg(glow, "✦ WISH SSH ") +
      bold(fg(accent, host)) +
      (w >= 48 ? fg(muted, `  •  PTY ${cols}×${rows}`) : "")
  );
  if (innerH >= 2) {
    lines.push(
      fg("#4ade80", "● ") +
        fg(textMain, `${sess.user}@${sess.ip}`) +
        fg(muted, ` (${sess.client})`) +
        (w >= 54 ? fg(muted, ` • ${sess.key} • ${sess.active} active`) : "")
    );
  }
  if (innerH >= 3) {
    lines.push(faint(fg(muted, `Uptime ${sess.uptime} • Press [r] to cycle simulated SSH session`)));
  }

  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, w)).join("\n");
}

export function renderCharmWidgetContent(
  node: IRNode,
  doc: IRDoc,
  innerW: number,
  innerH: number,
  darkBG: boolean,
  cols: number,
  rows: number
): string {
  switch (node.contentType) {
    case "lipgloss:divider":
      return renderLipglossDivider(node, doc, innerW, innerH, darkBG);
    case "bubble:list":
      return renderCustomList(node, doc, innerW, innerH, darkBG);
    case "bubble:table":
      return renderCustomTable(node, doc, innerW, innerH, darkBG);
    case "bubble:viewport":
      return renderCustomViewport(node, doc, innerW, innerH, darkBG);
    case "bubble:textarea":
      return renderBubbleTextArea(node, doc, innerW, innerH, darkBG);
    case "bubble:progress":
      return renderBubbleProgress(node, doc, innerW, innerH, darkBG);
    case "bubble:spinner":
      return renderBubbleSpinner(node, doc, innerW, innerH, darkBG);
    case "bubble:filepicker":
      return renderBubbleFilePicker(node, doc, innerW, innerH, darkBG);
    case "bubble:paginator":
      return renderBubblePaginator(node, doc, innerW, innerH, darkBG);
    case "bubble:help":
      return renderBubbleHelp(node, doc, innerW, innerH, darkBG);
    case "bubble:timer":
      return renderBubbleClock(node, doc, innerW, innerH, darkBG, false);
    case "bubble:stopwatch":
      return renderBubbleClock(node, doc, innerW, innerH, darkBG, true);
    case "huh:form":
      return renderHuhForm(node, doc, innerW, innerH, darkBG);
    case "glamour:markdown":
      return renderGlamourMarkdown(node, doc, innerW, innerH, darkBG);
    case "gum:choose":
      return renderGumChoose(node, doc, innerW, innerH, darkBG);
    case "gum:confirm":
      return renderGumConfirm(node, doc, innerW, innerH, darkBG);
    case "wish:ssh":
      return renderWishBanner(node, doc, innerW, innerH, darkBG, cols, rows);
    case "uv:screen":
      return renderUvScreen(node, doc, innerW, innerH);
    case "cellbuf:canvas":
      return renderCellbufCanvas(node, doc, innerW, innerH);
    default:
      return node.content ?? "";
  }
}
