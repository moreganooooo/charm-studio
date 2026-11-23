import { defaultWidgetData, type ContentType, type IRDoc, type IRHuhField, type IRNode, type TokenPair } from "./types";

export const CHARM_WIDGET_TYPES = new Set<ContentType>([
  "huh:form",
  "glamour:markdown",
  "gum:choose",
  "gum:confirm",
  "wish:ssh",
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
  inputs: Record<string, string>;
  selects: Record<string, number>;
  confirms: Record<string, boolean>;
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

function getHuhState(id: string, fields: IRHuhField[]): HuhState {
  let s = huhStates.get(id);
  if (!s) {
    const inputs: Record<string, string> = {};
    const selects: Record<string, number> = {};
    const confirms: Record<string, boolean> = {};
    fields.forEach((f) => {
      if (f.kind === "input") inputs[f.id] = f.placeholder ?? "charm-cli-app";
      else if (f.kind === "select") selects[f.id] = 0;
      else confirms[f.id] = true;
    });
    s = { focusIdx: 0, inputs, selects, confirms, submitted: false };
    huhStates.set(id, s);
  }
  // Ensure new fields have defaults if added dynamically in Inspector
  fields.forEach((f) => {
    if (f.kind === "input" && s!.inputs[f.id] === undefined) s!.inputs[f.id] = f.placeholder ?? "";
    if (f.kind === "select" && s!.selects[f.id] === undefined) s!.selects[f.id] = 0;
    if (f.kind === "confirm" && s!.confirms[f.id] === undefined) s!.confirms[f.id] = true;
  });
  if (s.focusIdx >= fields.length) s.focusIdx = Math.max(0, fields.length - 1);
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
    const fields = huhFieldsRegistry.get(nodeId) ?? defaultWidgetData("huh:form").huhFields ?? [];
    if (fields.length === 0) return false;
    const s = getHuhState(nodeId, fields);
    if (key === "Tab" || key === "ArrowDown") {
      s.focusIdx = (s.focusIdx + 1) % fields.length;
      return true;
    }
    if (key === "ArrowUp") {
      s.focusIdx = (s.focusIdx + fields.length - 1) % fields.length;
      return true;
    }
    const active = fields[s.focusIdx];
    if (!active) return false;
    if (active.kind === "input") {
      if (key === "Backspace") {
        s.inputs[active.id] = (s.inputs[active.id] ?? "").slice(0, -1);
        s.submitted = false;
        return true;
      }
      if (key === "Enter") {
        if (s.focusIdx < fields.length - 1) s.focusIdx++;
        else s.submitted = true;
        return true;
      }
      if (key.length === 1 && (s.inputs[active.id] ?? "").length < 32) {
        s.inputs[active.id] = (s.inputs[active.id] ?? "") + key;
        s.submitted = false;
        return true;
      }
    } else if (active.kind === "select") {
      const opts = active.options?.length ? active.options : ["Option A", "Option B"];
      const cur = s.selects[active.id] ?? 0;
      if (key === "ArrowRight" || key === " " || key === "l") {
        s.selects[active.id] = (cur + 1) % opts.length;
        s.submitted = false;
        return true;
      }
      if (key === "ArrowLeft" || key === "h") {
        s.selects[active.id] = (cur + opts.length - 1) % opts.length;
        s.submitted = false;
        return true;
      }
      if (key === "Enter") {
        if (s.focusIdx < fields.length - 1) s.focusIdx++;
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
  lines.push("");

  const rowsBudget = Math.max(1, Math.floor((innerH - 2) / 2));
  const start = Math.max(0, s.cursor - rowsBudget + 1);
  const slice = filtered.slice(start, start + rowsBudget);

  if (slice.length === 0) {
    lines.push(faint(fg(muted, "  No matching items")));
  } else {
    slice.forEach(({ item }, relPos) => {
      const active = start + relPos === s.cursor;
      const bar = active ? fg(glow, "┃ ") : "  ";
      lines.push(bar + (active ? bold(fg(accent, item.title)) : fg(textMain, item.title)));
      if (lines.length < innerH) {
        lines.push((active ? fg(glow, "┃ ") : "  ") + faint(fg(muted, item.desc)));
      }
    });
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

  const w = Math.max(12, innerW);
  const formatCell = (val: string, width: number) => {
    const trimmed = Array.from(val).slice(0, Math.max(2, width - 1)).join("");
    return padRightVisible(trimmed, width);
  };

  const lines: string[] = [];
  const headerStr = cols.map((c) => formatCell(c.title, c.width)).join(" ");
  lines.push(bold(fg(textMain, headerStr)));
  lines.push(fg(muted, "─".repeat(Math.min(w, Math.max(8, visibleLen(headerStr))))));

  const bodyBudget = Math.max(1, innerH - 2);
  const start = Math.max(0, s.cursor - bodyBudget + 1);
  const slice = rows.slice(start, start + bodyBudget);

  if (rows.length === 0) {
    lines.push(faint(fg(muted, "(empty table — add rows in Inspector)")));
  } else {
    slice.forEach((row, relPos) => {
      const active = start + relPos === s.cursor;
      const lineTxt = cols.map((c, ci) => formatCell(row[ci] ?? "", c.width)).join(" ");
      const clipped = clipVisible(padRightVisible(lineTxt, Math.min(w, visibleLen(headerStr))), w);
      lines.push(active ? fgBg(onAccent, accent, clipped, true) : fg(textMain, clipped));
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

function renderHuhForm(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const fields = node.widgetData?.huhFields?.length
    ? node.widgetData.huhFields
    : defaultWidgetData("huh:form").huhFields!;
  huhFieldsRegistry.set(node.id, fields);

  const s = getHuhState(node.id, fields);
  const accent = resolveToken(doc.tokens, "accent", darkBG, darkBG ? "#7aa2f7" : "#2e7de9");
  const glow = resolveToken(doc.tokens, "modalGlow", darkBG, darkBG ? "#bb9af7" : "#9854f1");
  const muted = resolveToken(doc.tokens, "borderIdle", darkBG, darkBG ? "#414868" : "#9aa5ce");
  const textMain = resolveToken(doc.tokens, "textMain", darkBG, darkBG ? "#c0caf5" : "#3760bf");
  const surface = resolveToken(doc.tokens, "surface", darkBG, darkBG ? "#1f2335" : "#d5d6db");
  const onAccent = darkBG ? "#11111b" : "#ffffff";

  const lines: string[] = [];
  const w = Math.max(12, innerW);

  const bar = (active: boolean) => (active ? fg(accent, "┃ ") : fg(muted, "│ "));

  fields.forEach((field, idx) => {
    const active = s.focusIdx === idx;
    lines.push(bar(active) + bold(fg(active ? accent : textMain, field.label)));
    if (field.kind === "input") {
      const val = s.inputs[field.id] ?? "";
      const cur = active ? fg(glow, "█") : "";
      lines.push(bar(active) + fg(muted, "> ") + (val ? fg(textMain, val) : faint(fg(muted, field.placeholder || ""))) + cur);
    } else if (field.kind === "select") {
      const opts = field.options?.length ? field.options : ["Option A", "Option B"];
      const selIdx = (s.selects[field.id] ?? 0) % opts.length;
      if (innerH >= 12 && fields.length <= 3) {
        opts.forEach((opt, oi) => {
          const isCur = oi === selIdx;
          const prefix = isCur ? fg(glow, "❯ ") : "  ";
          const lbl = isCur ? bold(fg(accent, opt)) : fg(textMain, opt);
          lines.push(bar(active) + prefix + lbl);
        });
      } else {
        lines.push(bar(active) + fg(glow, "◀ ") + bold(fg(accent, opts[selIdx])) + fg(glow, " ▶"));
      }
    } else {
      const yes = s.confirms[field.id] ?? true;
      const yesBtn = yes ? fgBg(onAccent, accent, "  Yes  ", true) : fgBg(textMain, surface, "  Yes  ", false);
      const noBtn = !yes ? fgBg(onAccent, glow, "  No  ", true) : fgBg(textMain, surface, "  No  ", false);
      lines.push(bar(active) + yesBtn + "  " + noBtn);
    }
    if (idx < fields.length - 1) lines.push("");
  });

  if (s.submitted) {
    lines.push("");
    lines.push(fg("#4ade80", bold("✓ Submitted Huh form values")));
  } else if (innerH >= 11) {
    lines.push("");
    lines.push(faint(fg(muted, "tab/↑↓ focus • ←/→ choose • enter submit")));
  }

  return lines.slice(0, Math.max(1, innerH)).map((l) => clipVisible(l, w)).join("\n");
}

function renderInlineMarkdown(line: string, accent: string, glow: string, textMain: string, surface: string): string {
  let out = line;
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => `${underline(fg(accent, label))} ${faint(`(${url})`)}`);
  out = out.replace(/`([^`]+)`/g, (_m, code) => fgBg(glow, surface, ` ${code} `));
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, b) => bold(fg(textMain, b)));
  out = out.replace(/\*([^*]+)\*/g, (_m, it) => italic(fg(textMain, it)));
  return out;
}

function renderGlamourMarkdown(node: IRNode, doc: IRDoc, innerW: number, innerH: number, darkBG: boolean): string {
  const s = getGlamourState(node.id);
  const accent = resolveToken(doc.tokens, "accent", darkBG, darkBG ? "#7aa2f7" : "#2e7de9");
  const glow = resolveToken(doc.tokens, "modalGlow", darkBG, darkBG ? "#bb9af7" : "#9854f1");
  const muted = resolveToken(doc.tokens, "borderIdle", darkBG, darkBG ? "#414868" : "#9aa5ce");
  const textMain = resolveToken(doc.tokens, "textMain", darkBG, darkBG ? "#c0caf5" : "#3760bf");
  const surface = resolveToken(doc.tokens, "surface", darkBG, darkBG ? "#1f2335" : "#d5d6db");
  const onAccent = darkBG ? "#11111b" : "#ffffff";

  const src = (node.content ?? "").trim() ? node.content! : DEFAULT_MARKDOWN;
  const w = Math.max(10, innerW);
  const rawLines = src.split("\n");
  const rendered: string[] = [];
  let inCode = false;

  for (const raw of rawLines) {
    const trimmed = raw.trimEnd();
    if (trimmed.startsWith("```")) {
      inCode = !inCode;
      if (inCode) {
        const lang = trimmed.slice(3).trim();
        rendered.push(fg(muted, `╭─ ${lang || "code"} ${"─".repeat(Math.max(0, w - (lang ? lang.length + 5 : 9)))}`));
      } else {
        rendered.push(fg(muted, `╰${"─".repeat(Math.max(0, w - 2))}`));
      }
      continue;
    }

    if (inCode) {
      const codeTxt = padRightVisible("  " + trimmed, Math.max(4, w - 1));
      rendered.push(fgBg(glow, surface, clipVisible(codeTxt, w)));
      continue;
    }

    if (trimmed.startsWith("# ")) {
      const title = trimmed.slice(2).trim();
      rendered.push(fgBg(onAccent, accent, ` ${title} `, true));
      rendered.push("");
      continue;
    }
    if (trimmed.startsWith("## ")) {
      const h2 = trimmed.slice(3).trim();
      rendered.push(bold(fg(glow, `## ${h2}`)));
      continue;
    }
    if (trimmed.startsWith("### ")) {
      const h3 = trimmed.slice(4).trim();
      rendered.push(bold(fg(accent, `### ${h3}`)));
      continue;
    }
    if (trimmed.startsWith("> ")) {
      const quote = trimmed.slice(2).trim();
      for (const wl of wrapPlainText(quote, Math.max(6, w - 3))) {
        rendered.push(fg(accent, "┃ ") + italic(fg(muted, wl)));
      }
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const item = trimmed.replace(/^[-*]\s+/, "");
      const wrapped = wrapPlainText(item, Math.max(6, w - 3));
      wrapped.forEach((wl, idx) => {
        const styled = renderInlineMarkdown(wl, accent, glow, textMain, surface);
        rendered.push((idx === 0 ? fg(accent, "• ") : "  ") + styled);
      });
      continue;
    }
    if (trimmed === "") {
      rendered.push("");
      continue;
    }

    for (const wl of wrapPlainText(trimmed, w)) {
      rendered.push(renderInlineMarkdown(wl, accent, glow, textMain, surface));
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
    case "bubble:list":
      return renderCustomList(node, doc, innerW, innerH, darkBG);
    case "bubble:table":
      return renderCustomTable(node, doc, innerW, innerH, darkBG);
    case "bubble:viewport":
      return renderCustomViewport(node, doc, innerW, innerH, darkBG);
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
    default:
      return node.content ?? "";
  }
}
