export interface TokenPair {
  light: string;
  dark: string;
}

export interface IRStyle {
  border: "rounded" | "normal" | "thick" | "double" | "none";
  borderColor: string;
  fg: string;
  bg?: string;
  padding: [number, number, number, number];
  margin: [number, number, number, number];
  bold: boolean;
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
  | "bubble:textinput";

export interface IRNode {
  id: string;
  kind: "JoinHorizontal" | "JoinVertical" | "Box";
  style?: string;
  contentType?: ContentType;
  width?: IRSize;
  height?: IRSize;
  content?: string;
  children?: IRNode[];
}

export interface IROverlay {
  id: string;
  visible: boolean;
  z: number;
  node: IRNode;
}

export interface IRDoc {
  tokens: Record<string, TokenPair>;
  styles: Record<string, IRStyle>;
  root: IRNode;
  overlays: IROverlay[];
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
  overflowX: boolean;
  overflowY: boolean;
}

export function listEditableNodes(doc: IRDoc): IRNode[] {
  const out: IRNode[] = [];
  const walk = (n: IRNode) => {
    if (n.kind === "Box") out.push(n);
    n.children?.forEach(walk);
  };
  walk(doc.root);
  doc.overlays.forEach((ov) => walk(ov.node));
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
