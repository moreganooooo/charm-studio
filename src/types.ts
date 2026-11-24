export interface TokenPair {
  light: string;
  dark: string;
}

export type ColorProfile = "truecolor" | "ansi256" | "ansi16" | "ascii";
export type WorkspaceMode = "studio" | "pro";
export type StudioLens = "visual" | "hybrid" | "code";
export type SyncPropertyKind =
  | "padding"
  | "padding-v"
  | "padding-h"
  | "border"
  | "colors"
  | "size"
  | "widget"
  | "keybinding";

export interface KeyPulse {
  nodeId: string;
  key: string;
  ts: number;
}

export interface OverflowDiagnosis {
  nodeId: string;
  nodeLabel: string;
  styleName?: string;
  presetTitle: string;
  cols: number;
  rows: number;
  actualW: number;
  actualH: number;
  allocatedW: number;
  allocatedH: number;
  deltaW: number;
  deltaH: number;
  headline: string;
  displayHeadline: string;
  dimensionsText: string;
  deltaSummary: string;
  failingProperty: "width" | "padding";
  causeRule: string;
  goFile: "layout_gen" | "theme_gen";
  goSymbol: string;
  suggestion?: string;
  canEnableTruncate: boolean;
  canCollapseBelow: boolean;
  canSwitchToFill: boolean;
  canReducePadding: boolean;
}

export interface MatrixFitFailure {
  title: string;
  cols: number;
  rows: number;
  nodeIds: string[];
  diagnoses: OverflowDiagnosis[];
}

export interface MatrixFitStatus {
  allFit: boolean;
  failingPresets: MatrixFitFailure[];
  diagnoses: OverflowDiagnosis[];
}
export type OverlayAnchor = "center" | "top-right" | "bottom-bar" | "bottom-right" | "place";
export type MouseMode = "none" | "cell" | "all";

export type ViewCursorMode = "auto" | "none" | "manual";

export interface IRViewConfig {
  altScreen?: boolean;
  mouseMode?: MouseMode;
  windowTitle?: string;
  reportFocus?: boolean;
  disableBracketedPasteMode?: boolean;
  cursorMode?: ViewCursorMode;
  cursorX?: number;
  cursorY?: number;
}

export interface IRCustomBorder {
  top: string;
  bottom: string;
  left: string;
  right: string;
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
}

export interface IRStyle {
  border: "rounded" | "normal" | "thick" | "double" | "hidden" | "custom" | "none";
  borderEdges?: [boolean, boolean, boolean, boolean];
  customBorder?: IRCustomBorder;
  borderColor: string;
  fg: string;
  bg?: string;
  padding: [number, number, number, number];
  margin: [number, number, number, number];
  maxWidth?: number;
  maxHeight?: number;
  bold: boolean;
  italic?: boolean;
  faint?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  alignH?: "left" | "center" | "right";
  alignV?: "top" | "center" | "bottom";
  placeH?: "left" | "center" | "right";
  placeV?: "top" | "center" | "bottom";
  truncate?: boolean;
}

export interface IRSize {
  mode: "fixed" | "fill" | "fit";
  value?: number;
  weight?: number;
  collapseBelow?: number;
}

export type ContentType =
  | "text"
  | "lipgloss:divider"
  | "bubble:list"
  | "bubble:table"
  | "bubble:viewport"
  | "bubble:textinput"
  | "bubble:textarea"
  | "bubble:progress"
  | "bubble:spinner"
  | "bubble:filepicker"
  | "bubble:paginator"
  | "bubble:help"
  | "bubble:timer"
  | "bubble:stopwatch"
  | "huh:form"
  | "glamour:markdown"
  | "gum:choose"
  | "gum:confirm"
  | "wish:ssh"
  | "uv:screen"
  | "cellbuf:canvas";

export interface IRListItem {
  title: string;
  desc: string;
}

export interface IRTableColumn {
  title: string;
  width: number;
}

export type HuhValidationRule = "none" | "required" | "minLength" | "email" | "regex";

export interface IRHuhField {
  id: string;
  kind: "input" | "text" | "select" | "multiselect" | "confirm" | "note";
  description?: string;
  label: string;
  placeholder?: string;
  options?: string[];
  validation?: HuhValidationRule;
  validationParam?: string;
  errorMessage?: string;
  charLimit?: number;
  lineLimit?: number;
  filterable?: boolean;
  minSelect?: number;
  maxSelect?: number;
  group?: number;
}

export type SpinnerPresetType =
  | "line"
  | "dot"
  | "mini-dot"
  | "jump"
  | "pulse"
  | "points"
  | "globe"
  | "moon"
  | "monkey";

export type GlamourThemeName = "dark" | "light" | "dracula" | "tokyo-night" | "pink";
export type HuhThemeName = "charm" | "dracula" | "catppuccin" | "base16";

export interface IRHelpBinding {
  key: string;
  desc: string;
}

export interface IRUvCommand {
  id: string;
  op: "setCell" | "drawText" | "fillRect";
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
}

export interface IRCellbufLayer {
  id: string;
  name: string;
  shape: "box" | "line" | "text" | "checker";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fg?: string;
  bg?: string;
  borderChar?: string;
}

export interface IRHarmonicaConfig {
  enabled: boolean;
  frequency: number;
  damping: number;
}

export interface IRWidgetData {
  // List
  listTitle?: string;
  listItems?: IRListItem[];
  listShowPagination?: boolean;
  listShowStatusBar?: boolean;
  listDelegateMode?: "default" | "compact" | "accent";
  // Table
  tableColumns?: IRTableColumn[];
  tableRows?: string[][];
  tableHeaderFg?: string;
  tableHeaderBg?: string;
  tableSelectedFg?: string;
  tableSelectedBg?: string;
  tableBorderStyle?: "normal" | "rounded" | "thick" | "none";
  // TextInput
  inputPrompt?: string;
  inputPlaceholder?: string;
  inputEchoMode?: "normal" | "password" | "none";
  inputCharLimit?: number;
  // TextArea
  textareaPlaceholder?: string;
  textareaShowLineNumbers?: boolean;
  textareaSoftWrap?: boolean;
  textareaCharLimit?: number;
  textareaCursorStyle?: "block" | "underline" | "bar";
  // Progress & Harmonica
  progressPercent?: number;
  progressMode?: "solid" | "gradient";
  progressStartColor?: string;
  progressEndColor?: string;
  progressShowPercent?: boolean;
  harmonica?: IRHarmonicaConfig;
  // Spinner
  spinnerType?: SpinnerPresetType;
  spinnerLabel?: string;
  spinnerColor?: string;
  // FilePicker
  fpCurrentDir?: string;
  fpAllowedExts?: string[];
  fpShowPermissions?: boolean;
  fpShowSize?: boolean;
  // Paginator
  paginatorType?: "dots" | "arabic";
  paginatorPage?: number;
  paginatorTotalPages?: number;
  paginatorPerPage?: number;
  // Help
  helpShowAll?: boolean;
  helpBindings?: IRHelpBinding[];
  // Timer & Stopwatch
  timerDurationSec?: number;
  timerFormat?: "mm:ss" | "hh:mm:ss" | "ss.ms";
  timerAutoStart?: boolean;
  // Huh Form
  huhFields?: IRHuhField[];
  huhTheme?: HuhThemeName;
  huhGroupNames?: string[];
  // Glamour Markdown
  glamourTheme?: GlamourThemeName;
  // Lip Gloss Divider
  dividerOrientation?: "horizontal" | "vertical";
  dividerChar?: string;
  dividerLabel?: string;
  // Ultraviolet Screen Primitives
  uvCommands?: IRUvCommand[];
  uvCursorX?: number;
  uvCursorY?: number;
  uvShowCursor?: boolean;
  // x/cellbuf 2D Cell Buffer
  cellbufLayers?: IRCellbufLayer[];
}

export interface IRNode {
  id: string;
  kind: "JoinHorizontal" | "JoinVertical" | "Box";
  style?: string;
  contentType?: ContentType;
  joinAlign?: "start" | "center" | "end";
  width?: IRSize;
  height?: IRSize;
  content?: string;
  widgetData?: IRWidgetData;
  children?: IRNode[];
}

export interface IROverlay {
  id: string;
  visible: boolean;
  z: number;
  anchor?: OverlayAnchor;
  placeX?: number;
  placeY?: number;
  placeH?: "left" | "center" | "right";
  placeV?: "top" | "center" | "bottom";
  harmonica?: IRHarmonicaConfig;
  node: IRNode;
}

export interface IRDoc {
  tokens: Record<string, TokenPair>;
  styles: Record<string, IRStyle>;
  root: IRNode;
  overlays: IROverlay[];
  view?: IRViewConfig;
  lockedProps?: Record<string, string[]>;
  lockReasons?: Record<string, "sync-disabled" | "dynamic">;
  dynamicExprs?: Record<string, Record<string, string>>;
  overriddenProps?: Record<string, string[]>;
  importedGo?: {
    label: string;
    source: string;
    fileSyncDisabled?: boolean;
  };
  untouchedHandOwned?: string[];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TelemetryNode {
  id: string;
  kind: string;
  style: string;
  margin: Rect;
  border: Rect;
  padding: Rect;
  content: Rect;
  allocatedW?: number;
  allocatedH?: number;
  actualW?: number;
  actualH?: number;
  overflowX: boolean;
  overflowY: boolean;
  overflowMsg?: string;
}

export function sanitizeGoId(raw: string, fallback = "pane"): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9_]+(.)/g, (_, c: string) => c.toUpperCase())
    .replace(/[^a-zA-Z0-9_]/g, "");
  if (!cleaned) return fallback;
  const normalized = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return /^[0-9]/.test(normalized) ? `p${normalized}` : normalized;
}

export function defaultWidgetData(ct?: ContentType): IRWidgetData {
  switch (ct) {
    case "lipgloss:divider":
      return {
        dividerOrientation: "horizontal",
        dividerChar: "─",
        dividerLabel: "Section",
      };
    case "bubble:list":
      return {
        listTitle: "Navigation",
        listShowPagination: true,
        listShowStatusBar: true,
        listDelegateMode: "default",
        listItems: [
          { title: "Overview", desc: "Cluster health & metrics" },
          { title: "Deployments", desc: "14 active workloads" },
          { title: "Live Logs", desc: "Streaming stdout/stderr" },
          { title: "Ingresses", desc: "TLS & routing rules" },
          { title: "Secrets", desc: "Encrypted vault keys" },
        ],
      };
    case "bubble:table":
      return {
        tableHeaderFg: "$textMain",
        tableHeaderBg: "",
        tableSelectedFg: "#11111b",
        tableSelectedBg: "$accent",
        tableBorderStyle: "normal",
        tableColumns: [
          { title: "Service", width: 14 },
          { title: "Status", width: 10 },
          { title: "CPU", width: 6 },
          { title: "Mem", width: 7 },
        ],
        tableRows: [
          ["api-gateway", "Running", "12%", "184Mi"],
          ["auth-worker", "Running", "4%", "92Mi"],
          ["billing-cron", "Idle", "0%", "48Mi"],
          ["edge-proxy", "Running", "28%", "310Mi"],
          ["indexer-v2", "Syncing", "64%", "740Mi"],
          ["notify-bus", "Degraded", "41%", "256Mi"],
        ],
      };
    case "bubble:textinput":
      return {
        inputPrompt: "> ",
        inputPlaceholder: "Filter services or type a command...",
      };
    case "bubble:textarea":
      return {
        textareaPlaceholder: "Write notes, SQL, or commit message...",
        textareaShowLineNumbers: true,
        textareaSoftWrap: true,
        textareaCharLimit: 500,
        textareaCursorStyle: "block",
      };
    case "bubble:progress":
      return {
        progressPercent: 68,
        progressMode: "gradient",
        progressStartColor: "#ff5eae",
        progressEndColor: "#6dffc2",
        progressShowPercent: true,
        harmonica: { enabled: true, frequency: 6.0, damping: 0.7 },
      };
    case "bubble:spinner":
      return {
        spinnerType: "dot",
        spinnerLabel: "Syncing cluster state...",
        spinnerColor: "$accent",
      };
    case "bubble:filepicker":
      return {
        fpCurrentDir: "/workspace/charm-app",
        fpAllowedExts: [".go", ".md", ".json"],
        fpShowPermissions: true,
        fpShowSize: true,
      };
    case "bubble:paginator":
      return {
        paginatorType: "dots",
        paginatorPage: 1,
        paginatorTotalPages: 5,
        paginatorPerPage: 10,
      };
    case "bubble:help":
      return {
        helpShowAll: false,
        helpBindings: [
          { key: "↑/k", desc: "up" },
          { key: "↓/j", desc: "down" },
          { key: "/", desc: "filter" },
          { key: "enter", desc: "select" },
          { key: "?", desc: "toggle help" },
          { key: "q", desc: "quit" },
        ],
      };
    case "bubble:timer":
      return {
        timerDurationSec: 90,
        timerFormat: "mm:ss",
        timerAutoStart: true,
      };
    case "bubble:stopwatch":
      return {
        timerDurationSec: 0,
        timerFormat: "ss.ms",
        timerAutoStart: true,
      };
    case "huh:form":
      return {
        huhTheme: "charm",
        huhGroupNames: ["Project Setup", "Options"],
        huhFields: [
          {
            id: "projectName",
            kind: "input",
            label: "Project Name",
            placeholder: "charm-cli-app",
            validation: "required",
            errorMessage: "Project name is required",
            group: 0,
          },
          {
            id: "stack",
            kind: "select",
            label: "Charm Stack",
            options: ["Lip Gloss + Bubbles", "Huh Forms", "Glamour + Glow", "Wish SSH TUI"],
            filterable: true,
            group: 0,
          },
          {
            id: "features",
            kind: "multiselect",
            label: "Included Modules",
            options: ["Harmonica Springs", "Glamour Docs", "Wish SSH", "VHS Demo"],
            minSelect: 1,
            maxSelect: 3,
            group: 1,
          },
          { id: "enableSSH", kind: "confirm", label: "Serve via Wish SSH?", group: 1 },
        ],
      };
    case "glamour:markdown":
      return {
        glamourTheme: "dark",
      };
    case "uv:screen":
      return {
        uvCursorX: 14,
        uvCursorY: 4,
        uvShowCursor: true,
        uvCommands: [
          { id: "bg", op: "fillRect", x: 1, y: 1, w: 28, h: 6, text: "·", fg: "#565f89", bg: "#1a1b26" },
          { id: "title", op: "drawText", x: 3, y: 2, text: "ULTRAVIOLET CELL SCREEN", fg: "#6dffc2", bold: true },
          { id: "sub", op: "drawText", x: 3, y: 4, text: "Cursor @ (14, 4)", fg: "#ff5eae" },
          { id: "mark", op: "setCell", x: 26, y: 2, text: "✦", fg: "#ffd37a", bold: true },
        ],
      };
    case "cellbuf:canvas":
      return {
        cellbufLayers: [
          { id: "grid", name: "Backdrop Grid", shape: "checker", x: 0, y: 0, w: 30, h: 7, fg: "#414868", borderChar: "░" },
          { id: "frame", name: "Window Layer", shape: "box", x: 2, y: 1, w: 24, h: 5, fg: "#b9a2ff", bg: "#1f2335", borderChar: "─" },
          { id: "rule", name: "Divider Line", shape: "line", x: 3, y: 3, w: 22, h: 1, fg: "#ff5eae", borderChar: "━" },
          { id: "lbl", name: "Title Overlay", shape: "text", x: 4, y: 2, w: 20, h: 1, text: "x/cellbuf 2D Buffer", fg: "#6dffc2" },
        ],
      };
    default:
      return {};
  }
}

export function listEditableNodes(doc: IRDoc): IRNode[] {
  const out: IRNode[] = [];
  const walk = (n: IRNode) => {
    out.push(n);
    n.children?.forEach(walk);
  };
  walk(doc.root);
  doc.overlays.forEach((ov) => walk(ov.node));
  return out;
}

export function listVisibleFocusBoxes(doc: IRDoc, cols: number): IRNode[] {
  const out: IRNode[] = [];
  const walk = (n: IRNode) => {
    if ((n.width?.collapseBelow ?? 0) > 0 && cols < (n.width?.collapseBelow ?? 0)) {
      return;
    }
    if (n.kind === "Box") {
      out.push(n);
      return;
    }
    n.children?.forEach(walk);
  };
  walk(doc.root);
  doc.overlays.filter((o) => o.visible).forEach((o) => out.push(o.node));
  return out;
}

export function findNode(doc: IRDoc, id: string): IRNode | null {
  const walk = (n: IRNode): IRNode | null => {
    if (n.id === id) return n;
    for (const ch of n.children ?? []) {
      const hit = walk(ch);
      if (hit) return hit;
    }
    return null;
  };
  const inRoot = walk(doc.root);
  if (inRoot) return inRoot;
  for (const ov of doc.overlays) {
    const hit = walk(ov.node);
    if (hit) return hit;
  }
  return null;
}

export function updateNodeInDoc(doc: IRDoc, id: string, updater: (n: IRNode) => IRNode): IRDoc {
  const next = structuredClone(doc);
  const walk = (n: IRNode): IRNode => {
    const updated = n.id === id ? updater(n) : n;
    if (updated.children) {
      updated.children = updated.children.map(walk);
    }
    return updated;
  };
  next.root = walk(next.root);
  next.overlays = next.overlays.map((ov) => ({ ...ov, node: walk(ov.node) }));
  return next;
}

export function getFriendlyNodeName(node: IRNode | null | undefined): string {
  if (!node) return "Pane";
  if (node.kind === "JoinHorizontal") return node.id === "body" ? "Workspace Row" : "Row";
  if (node.kind === "JoinVertical") return node.id === "shell" ? "App Frame" : "Stack";

  const idLower = node.id.toLowerCase();
  if (idLower.includes("sidebar") || idLower.includes("nav")) return "Navigation";
  if (idLower === "mainpane" || idLower === "main") return "Services";
  if (idLower.includes("status") || idLower.includes("footer")) return "Status bar";
  if (idLower.includes("search")) return "Search input";
  if (idLower.includes("logs") || idLower.includes("stream")) return "Live logs";
  if (idLower.includes("modal")) return "Help modal";

  switch (node.contentType) {
    case "lipgloss:divider":
      return "Divider";
    case "bubble:list":
      return node.widgetData?.listTitle || "Navigation list";
    case "bubble:table":
      return "Services table";
    case "bubble:viewport":
      return "Scrollable view";
    case "bubble:textinput":
      return "Text input";
    case "bubble:textarea":
      return "Text area";
    case "bubble:progress":
      return "Progress bar";
    case "bubble:spinner":
      return "Spinner";
    case "bubble:filepicker":
      return "File picker";
    case "bubble:paginator":
      return "Paginator";
    case "bubble:help":
      return "Help legend";
    case "bubble:timer":
      return "Countdown timer";
    case "bubble:stopwatch":
      return "Stopwatch";
    case "huh:form":
      return "Interactive form";
    case "glamour:markdown":
      return "Markdown doc";
    case "gum:choose":
      return "Choice prompt";
    case "gum:confirm":
      return "Confirm prompt";
    case "wish:ssh":
      return "SSH server card";
    case "uv:screen":
      return "Ultraviolet screen";
    case "cellbuf:canvas":
      return "Cellbuf 2D buffer";
    default: {
      const spaced = node.id
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/[_-]+/g, " ")
        .trim();
      return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Text block";
    }
  }
}

export function getCharmGoTypeLabel(node: IRNode | null | undefined): string {
  if (!node) return "lipgloss.Style";
  if (node.kind === "JoinHorizontal") return "JoinHorizontal";
  if (node.kind === "JoinVertical") return "JoinVertical";
  switch (node.contentType) {
    case "lipgloss:divider":
      return "lipgloss.Divider";
    case "bubble:list":
      return "list.Model";
    case "bubble:table":
      return "table.Model";
    case "bubble:viewport":
      return "viewport.Model";
    case "bubble:textinput":
      return "textinput.Model";
    case "bubble:textarea":
      return "textarea.Model";
    case "bubble:progress":
      return "progress.Model";
    case "bubble:spinner":
      return "spinner.Model";
    case "bubble:filepicker":
      return "filepicker.Model";
    case "bubble:paginator":
      return "paginator.Model";
    case "bubble:help":
      return "help.Model";
    case "bubble:timer":
      return "timer.Model";
    case "bubble:stopwatch":
      return "stopwatch.Model";
    case "huh:form":
      return "huh.Form";
    case "glamour:markdown":
      return "glamour.TermRenderer";
    case "gum:choose":
      return "gum choose";
    case "gum:confirm":
      return "gum confirm";
    case "wish:ssh":
      return "wish.Server";
    case "uv:screen":
      return "uv.Screen";
    case "cellbuf:canvas":
      return "cellbuf.Buffer";
    default:
      return "lipgloss.Style";
  }
}
