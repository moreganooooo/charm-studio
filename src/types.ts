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
export type OverlayAnchor = "center" | "top-right" | "bottom-bar" | "bottom-right";
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

export interface IRStyle {
  border: "rounded" | "normal" | "thick" | "double" | "hidden" | "none";
  borderEdges?: [boolean, boolean, boolean, boolean];
  borderColor: string;
  fg: string;
  bg?: string;
  padding: [number, number, number, number];
  margin: [number, number, number, number];
  bold: boolean;
  italic?: boolean;
  faint?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  alignH?: "left" | "center" | "right";
  alignV?: "top" | "center" | "bottom";
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
  | "bubble:list"
  | "bubble:table"
  | "bubble:viewport"
  | "bubble:textinput"
  | "huh:form"
  | "glamour:markdown"
  | "gum:choose"
  | "gum:confirm"
  | "wish:ssh";

export interface IRListItem {
  title: string;
  desc: string;
}

export interface IRTableColumn {
  title: string;
  width: number;
}

export interface IRHuhField {
  id: string;
  kind: "input" | "select" | "confirm";
  label: string;
  placeholder?: string;
  options?: string[];
}

export interface IRWidgetData {
  listTitle?: string;
  listItems?: IRListItem[];
  tableColumns?: IRTableColumn[];
  tableRows?: string[][];
  inputPrompt?: string;
  inputPlaceholder?: string;
  huhFields?: IRHuhField[];
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
    case "bubble:list":
      return {
        listTitle: "Navigation",
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
    case "huh:form":
      return {
        huhFields: [
          { id: "projectName", kind: "input", label: "Project Name", placeholder: "charm-cli-app" },
          { id: "stack", kind: "select", label: "Charm Stack", options: ["Lip Gloss + Bubbles", "Huh Forms", "Glamour + Glow", "Wish SSH TUI"] },
          { id: "enableSSH", kind: "confirm", label: "Serve via Wish SSH?" },
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
    case "bubble:list":
      return node.widgetData?.listTitle || "Navigation list";
    case "bubble:table":
      return "Services table";
    case "bubble:viewport":
      return "Scrollable view";
    case "bubble:textinput":
      return "Text input";
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
    case "bubble:list":
      return "list.Model";
    case "bubble:table":
      return "table.Model";
    case "bubble:viewport":
      return "viewport.Model";
    case "bubble:textinput":
      return "textinput.Model";
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
    default:
      return "lipgloss.Style";
  }
}
