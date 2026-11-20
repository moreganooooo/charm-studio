import { findNode, type IRDoc, type IRNode, type IRStyle } from "./types";

function collectAllIds(doc: IRDoc): Set<string> {
  const ids = new Set<string>();
  const walk = (n: IRNode) => {
    ids.add(n.id);
    n.children?.forEach(walk);
  };
  walk(doc.root);
  doc.overlays.forEach((o) => walk(o.node));
  return ids;
}

function uniqueId(doc: IRDoc, base: string): string {
  const ids = collectAllIds(doc);
  let i = 1;
  while (ids.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

function uniqueStyleName(doc: IRDoc, base: string): string {
  let i = 1;
  while (doc.styles[`${base}${i}`]) i++;
  return `${base}${i}`;
}

function makeFreshBox(doc: IRDoc): { node: IRNode; styleName: string; style: IRStyle } {
  const id = uniqueId(doc, "pane");
  const styleName = uniqueStyleName(doc, "paneStyle");
  const style: IRStyle = {
    border: "rounded",
    borderEdges: [true, true, true, true],
    borderColor: doc.tokens.borderIdle ? "$borderIdle" : Object.keys(doc.tokens)[0] ? `$${Object.keys(doc.tokens)[0]}` : "",
    fg: doc.tokens.textMain ? "$textMain" : "",
    padding: [1, 2, 1, 2],
    margin: [0, 0, 0, 0],
    bold: false,
  };
  const node: IRNode = {
    id,
    kind: "Box",
    style: styleName,
    contentType: "text",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fill", weight: 1 },
    content: `New ${id}\nEdit me in Inspector`,
  };
  return { node, styleName, style };
}

function findParentOf(root: IRNode, targetId: string): IRNode | null {
  for (const ch of root.children ?? []) {
    if (ch.id === targetId) return root;
    const deeper = findParentOf(ch, targetId);
    if (deeper) return deeper;
  }
  return null;
}

export function addBoxToTarget(doc: IRDoc, targetId: string): { doc: IRDoc; newId: string } {
  const next = structuredClone(doc);
  const { node: fresh, styleName, style } = makeFreshBox(next);
  next.styles[styleName] = style;

  const target = findNode(next, targetId);
  if (target && target.kind !== "Box") {
    target.children = [...(target.children ?? []), fresh];
    return { doc: next, newId: fresh.id };
  }

  const parent = findParentOf(next.root, targetId);
  if (parent && parent.children) {
    const idx = parent.children.findIndex((c) => c.id === targetId);
    parent.children.splice(idx + 1, 0, fresh);
    return { doc: next, newId: fresh.id };
  }

  next.root.children = [...(next.root.children ?? []), fresh];
  return { doc: next, newId: fresh.id };
}

export function splitNode(
  doc: IRDoc,
  targetId: string,
  kind: "JoinHorizontal" | "JoinVertical"
): { doc: IRDoc; newId: string } {
  const next = structuredClone(doc);
  const { node: fresh, styleName, style } = makeFreshBox(next);
  next.styles[styleName] = style;

  const splitId = uniqueId(next, kind === "JoinHorizontal" ? "row" : "col");

  const wrap = (n: IRNode): IRNode => {
    if (n.id === targetId) {
      const preservedW = n.width ? { ...n.width } : { mode: "fill" as const, weight: 1 };
      const preservedH = n.height ? { ...n.height } : { mode: "fill" as const, weight: 1 };
      const innerFirst: IRNode = {
        ...n,
        width: { mode: "fill", weight: 1 },
        height: { mode: "fill", weight: 1 },
      };
      return {
        id: splitId,
        kind,
        width: preservedW,
        height: preservedH,
        children: [innerFirst, fresh],
      };
    }
    if (n.children) {
      return { ...n, children: n.children.map(wrap) };
    }
    return n;
  };

  next.root = wrap(next.root);
  return { doc: next, newId: fresh.id };
}

export function moveSibling(doc: IRDoc, targetId: string, dir: -1 | 1): IRDoc {
  if (doc.root.id === targetId) return doc;
  const next = structuredClone(doc);
  const parent = findParentOf(next.root, targetId);
  if (!parent?.children) return doc;
  const idx = parent.children.findIndex((c) => c.id === targetId);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= parent.children.length) return doc;
  [parent.children[idx], parent.children[swapIdx]] = [parent.children[swapIdx], parent.children[idx]];
  return next;
}

export function deleteNodeFromDoc(doc: IRDoc, targetId: string): { doc: IRDoc; nextSelected: string } {
  if (doc.root.id === targetId) return { doc, nextSelected: doc.root.id };
  const next = structuredClone(doc);
  const parent = findParentOf(next.root, targetId);
  if (!parent?.children) return { doc, nextSelected: doc.root.id };
  parent.children = parent.children.filter((c) => c.id !== targetId);
  return { doc: next, nextSelected: parent.children[0]?.id ?? parent.id };
}

export function forkStyleForNode(doc: IRDoc, nodeId: string): IRDoc {
  const next = structuredClone(doc);
  const node = findNode(next, nodeId);
  if (!node || !node.style || !next.styles[node.style]) return doc;
  const newStyleName = uniqueStyleName(next, `${node.id}Style`);
  next.styles[newStyleName] = structuredClone(next.styles[node.style]);
  node.style = newStyleName;
  return next;
}
