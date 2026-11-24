import { defaultWidgetData, findNode, sanitizeGoId, type IRDoc, type IRNode, type IRStyle } from "./types";
import type { WidgetPreset } from "./widgetPresets";

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

export function uniqueId(doc: IRDoc, base: string): string {
  const ids = collectAllIds(doc);
  if (!ids.has(base)) return base;
  let i = 1;
  while (ids.has(`${base}${i}`)) i++;
  return `${base}${i}`;
}

export function uniqueStyleName(doc: IRDoc, base: string): string {
  let i = 1;
  while (doc.styles[`${base}${i}`]) i++;
  return `${base}${i}`;
}

function makeFreshBox(doc: IRDoc, preset?: WidgetPreset): { node: IRNode; styleName: string; style: IRStyle } {
  const baseId = preset?.baseId ?? "pane";
  const id = uniqueId(doc, `${baseId}1`.replace(/1$/, "") === baseId ? baseId : baseId);
  const styleName = uniqueStyleName(doc, `${baseId}Style`);
  const fallbackBorder = doc.tokens.borderIdle ? "$borderIdle" : Object.keys(doc.tokens)[0] ? `$${Object.keys(doc.tokens)[0]}` : "";
  const style: IRStyle = {
    border: "rounded",
    borderEdges: [true, true, true, true],
    borderColor: fallbackBorder,
    fg: doc.tokens.textMain ? "$textMain" : "",
    padding: [1, 2, 1, 2],
    margin: [0, 0, 0, 0],
    bold: false,
    ...(preset?.stylePatch ?? {}),
  };
  if (style.borderColor && style.borderColor.startsWith("$") && !doc.tokens[style.borderColor.slice(1)]) {
    style.borderColor = fallbackBorder;
  }
  if (style.bg && style.bg.startsWith("$") && !doc.tokens[style.bg.slice(1)]) {
    delete style.bg;
  }

  const ct = preset?.contentType ?? "text";
  const widgetData = defaultWidgetData(ct);
  const hasWidgetData = Object.keys(widgetData).length > 0;

  const node: IRNode = {
    id,
    kind: "Box",
    style: styleName,
    contentType: ct,
    width: preset ? { ...preset.width } : { mode: "fill", weight: 1 },
    height: preset ? { ...preset.height } : { mode: "fill", weight: 1 },
    content: preset ? preset.content : `New ${id}\nDouble-click to edit text`,
    ...(hasWidgetData ? { widgetData } : {}),
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

export function isDescendant(root: IRNode, ancestorId: string, candidateId: string): boolean {
  if (ancestorId === candidateId) return true;
  const walkSearch = (n: IRNode): boolean => {
    if (n.id === candidateId) return true;
    return (n.children ?? []).some(walkSearch);
  };
  const findAncestor = (n: IRNode): IRNode | null => {
    if (n.id === ancestorId) return n;
    for (const ch of n.children ?? []) {
      const hit = findAncestor(ch);
      if (hit) return hit;
    }
    return null;
  };
  const anc = findAncestor(root);
  return anc ? walkSearch(anc) : false;
}

export function addBoxWithPreset(
  doc: IRDoc,
  targetId: string,
  preset?: WidgetPreset
): { doc: IRDoc; newId: string } {
  const next = structuredClone(doc);

  if (preset?.insertKind === "overlay" && preset.overlayConfig) {
    let i = 1;
    while (next.overlays.some((o) => o.id === `overlay${i}`)) i++;
    const overlayId = `overlay${i}`;
    const nodeId = uniqueId(next, preset.overlayConfig.baseId);
    const styleName = uniqueStyleName(next, `${preset.overlayConfig.baseId}Style`);
    const fallbackBorder = doc.tokens.modalGlow
      ? "$modalGlow"
      : doc.tokens.accent
      ? "$accent"
      : doc.tokens.borderIdle
      ? "$borderIdle"
      : "";
    const style: IRStyle = {
      border: "rounded",
      borderEdges: [true, true, true, true],
      borderColor: fallbackBorder,
      fg: doc.tokens.textMain ? "$textMain" : "",
      bg: doc.tokens.surface ? "$surface" : undefined,
      padding: [1, 2, 1, 2],
      margin: [0, 0, 0, 0],
      bold: true,
      ...preset.stylePatch,
    };
    if (style.borderColor && style.borderColor.startsWith("$") && !next.tokens[style.borderColor.slice(1)]) {
      style.borderColor = fallbackBorder;
    }
    if (style.bg && style.bg.startsWith("$") && !next.tokens[style.bg.slice(1)]) {
      delete style.bg;
    }
    next.styles[styleName] = style;
    const overlayWidgetData = defaultWidgetData(preset.contentType);
    next.overlays.push({
      id: overlayId,
      visible: true,
      z: 10 + next.overlays.length * 5,
      anchor: preset.overlayConfig.anchor,
      node: {
        id: nodeId,
        kind: "Box",
        style: styleName,
        contentType: preset.contentType,
        width: { mode: "fixed", value: preset.overlayConfig.width },
        height: { mode: "fixed", value: preset.overlayConfig.height },
        content: preset.overlayConfig.content,
        ...(Object.keys(overlayWidgetData).length > 0 ? { widgetData: overlayWidgetData } : {}),
      },
    });
    return { doc: next, newId: nodeId };
  }

  let fresh: IRNode;
  if (preset?.insertKind === "container" && preset.containerKind) {
    const containerId = uniqueId(next, preset.baseId);
    const firstBox = makeFreshBox(next, {
      ...preset,
      baseId: preset.containerKind === "JoinHorizontal" ? "leftPane" : "topPane",
      content: preset.containerKind === "JoinHorizontal" ? "Pane A" : "Top Pane",
    });
    next.styles[firstBox.styleName] = firstBox.style;
    firstBox.node.id = uniqueId(next, preset.containerKind === "JoinHorizontal" ? "leftPane" : "topPane");

    // Reserve first ID on a temporary node lookup so the second sibling doesn't collide
    const secondCandidateBase = preset.containerKind === "JoinHorizontal" ? "rightPane" : "bottomPane";
    const usedIds = collectAllIds(next);
    usedIds.add(containerId);
    usedIds.add(firstBox.node.id);
    let secondId = secondCandidateBase;
    let suffix = 1;
    while (usedIds.has(secondId)) {
      secondId = `${secondCandidateBase}${suffix++}`;
    }

    const secondBox = makeFreshBox(next, {
      ...preset,
      baseId: secondCandidateBase,
      content: preset.containerKind === "JoinHorizontal" ? "Pane B" : "Bottom Pane",
    });
    next.styles[secondBox.styleName] = secondBox.style;
    secondBox.node.id = secondId;

    fresh = {
      id: containerId,
      kind: preset.containerKind,
      width: { mode: "fill", weight: 1 },
      height: { mode: "fill", weight: 1 },
      children: [firstBox.node, secondBox.node],
    };
  } else {
    const box = makeFreshBox(next, preset);
    next.styles[box.styleName] = box.style;
    fresh = box.node;
  }

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

export function addBoxToTarget(doc: IRDoc, targetId: string): { doc: IRDoc; newId: string } {
  return addBoxWithPreset(doc, targetId);
}

export function splitNode(
  doc: IRDoc,
  targetId: string,
  kind: "JoinHorizontal" | "JoinVertical"
): { doc: IRDoc; newId: string } {
  const next = structuredClone(doc);
  const { node: fresh, styleName, style } = makeFreshBox(next);
  next.styles[styleName] = style;

  const splitId = uniqueId(next, kind === "JoinHorizontal" ? "row" : "stack");

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

export function moveNodeDrop(
  doc: IRDoc,
  dragId: string,
  targetId: string,
  position: "before" | "inside" | "after"
): IRDoc {
  if (dragId === targetId) return doc;
  if (doc.root.id === dragId) return doc;
  if (isDescendant(doc.root, dragId, targetId)) return doc;
  if (targetId === doc.root.id && position !== "inside") return doc;

  const next = structuredClone(doc);

  let removed: IRNode | null = null;
  const detach = (n: IRNode): boolean => {
    if (!n.children) return false;
    const idx = n.children.findIndex((c) => c.id === dragId);
    if (idx >= 0) {
      removed = n.children.splice(idx, 1)[0];
      return true;
    }
    return n.children.some(detach);
  };
  detach(next.root);
  if (!removed) return doc;

  if (position === "inside") {
    const dest = findNode(next, targetId);
    if (!dest || dest.kind === "Box") return doc;
    dest.children = [...(dest.children ?? []), removed];
    return next;
  }

  const destParent = findParentOf(next.root, targetId);
  if (!destParent?.children) return doc;
  const targetIdx = destParent.children.findIndex((c) => c.id === targetId);
  if (targetIdx < 0) return doc;
  const insertAt = position === "before" ? targetIdx : targetIdx + 1;
  destParent.children.splice(insertAt, 0, removed);
  return next;
}

export function renameNodeInDoc(
  doc: IRDoc,
  oldId: string,
  desiredId: string
): { doc: IRDoc; renamedId: string } {
  const sanitized = sanitizeGoId(desiredId, oldId);
  if (!sanitized || sanitized === oldId) return { doc, renamedId: oldId };

  const next = structuredClone(doc);
  const existing = collectAllIds(next);
  existing.delete(oldId);

  let finalId = sanitized;
  let i = 2;
  while (existing.has(finalId)) {
    finalId = `${sanitized}${i++}`;
  }

  const walk = (n: IRNode): IRNode => {
    const updated = n.id === oldId ? { ...n, id: finalId } : n;
    if (updated.children) updated.children = updated.children.map(walk);
    return updated;
  };
  next.root = walk(next.root);
  next.overlays = next.overlays.map((ov) => ({ ...ov, node: walk(ov.node) }));
  return { doc: next, renamedId: finalId };
}

export function duplicateNodeInDoc(doc: IRDoc, targetId: string): { doc: IRDoc; newId: string } {
  if (doc.root.id === targetId) return { doc, newId: targetId };
  const next = structuredClone(doc);
  const parent = findParentOf(next.root, targetId);
  if (!parent?.children) return { doc, newId: targetId };

  const idx = parent.children.findIndex((c) => c.id === targetId);
  if (idx < 0) return { doc, newId: targetId };

  const cloneSubtree = (node: IRNode): IRNode => {
    const cloned = structuredClone(node);
    const idBase = `${node.id}Copy`;
    cloned.id = uniqueId(next, idBase);
    // Reserve ID by temporary mutation order
    if (cloned.children) {
      cloned.children = cloned.children.map(cloneSubtree);
    }
    return cloned;
  };

  // Recursive clone with tracking set so nested IDs don't collide
  const usedIds = collectAllIds(next);
  const reserveUniqueId = (base: string): string => {
    let candidate = base;
    let i = 2;
    while (usedIds.has(candidate)) {
      candidate = `${base}${i++}`;
    }
    usedIds.add(candidate);
    return candidate;
  };

  const deepCloneUnique = (node: IRNode): IRNode => {
    const cloned = structuredClone(node);
    cloned.id = reserveUniqueId(`${node.id}Copy`);
    if (cloned.children) {
      cloned.children = cloned.children.map(deepCloneUnique);
    }
    return cloned;
  };

  void cloneSubtree;
  const copy = deepCloneUnique(parent.children[idx]);
  parent.children.splice(idx + 1, 0, copy);
  return { doc: next, newId: copy.id };
}

export function wrapNodeInContainer(
  doc: IRDoc,
  targetId: string,
  kind: "JoinHorizontal" | "JoinVertical"
): { doc: IRDoc; newId: string } {
  const next = structuredClone(doc);
  const containerId = uniqueId(next, kind === "JoinHorizontal" ? "row" : "stack");

  const wrap = (n: IRNode): IRNode => {
    if (n.id === targetId) {
      const preservedW = n.width ? { ...n.width } : { mode: "fill" as const, weight: 1 };
      const preservedH = n.height ? { ...n.height } : { mode: "fill" as const, weight: 1 };
      return {
        id: containerId,
        kind,
        width: preservedW,
        height: preservedH,
        children: [{ ...n, width: { mode: "fill", weight: 1 }, height: { mode: "fill", weight: 1 } }],
      };
    }
    if (n.children) return { ...n, children: n.children.map(wrap) };
    return n;
  };
  next.root = wrap(next.root);
  return { doc: next, newId: containerId };
}

export function unwrapContainer(doc: IRDoc, targetId: string): { doc: IRDoc; nextSelected: string } {
  if (doc.root.id === targetId) return { doc, nextSelected: targetId };
  const next = structuredClone(doc);
  const parent = findParentOf(next.root, targetId);
  if (!parent?.children) return { doc, nextSelected: targetId };
  const idx = parent.children.findIndex((c) => c.id === targetId);
  if (idx < 0) return { doc, nextSelected: targetId };
  const target = parent.children[idx];
  if (target.kind === "Box") return { doc, nextSelected: targetId };
  const promoted = target.children ?? [];
  parent.children.splice(idx, 1, ...promoted);
  return { doc: next, nextSelected: promoted[0]?.id ?? parent.id };
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

export function pruneUnusedStyles(doc: IRDoc): { doc: IRDoc; removedCount: number } {
  const next = structuredClone(doc);
  const used = new Set<string>();
  const walk = (n: IRNode) => {
    if (n.style) used.add(n.style);
    n.children?.forEach(walk);
  };
  walk(next.root);
  next.overlays.forEach((o) => walk(o.node));

  let removedCount = 0;
  for (const key of Object.keys(next.styles)) {
    if (!used.has(key)) {
      delete next.styles[key];
      removedCount++;
    }
  }
  return { doc: next, removedCount };
}

export function addOverlayToDoc(doc: IRDoc): { doc: IRDoc; overlayId: string; nodeId: string } {
  const next = structuredClone(doc);
  let i = 1;
  while (next.overlays.some((o) => o.id === `overlay${i}`)) i++;
  const overlayId = `overlay${i}`;
  const nodeId = uniqueId(next, `floatingCard`);
  const styleName = uniqueStyleName(next, `overlayStyle`);

  next.styles[styleName] = {
    border: "rounded",
    borderEdges: [true, true, true, true],
    borderColor: "$modalGlow",
    fg: "$textMain",
    bg: "$surface",
    padding: [0, 2, 0, 2],
    margin: [0, 0, 0, 0],
    bold: true,
    alignH: "center",
    alignV: "center",
  };

  next.overlays.push({
    id: overlayId,
    visible: true,
    z: 10 + next.overlays.length * 5,
    anchor: "top-right",
    node: {
      id: nodeId,
      kind: "Box",
      style: styleName,
      contentType: "text",
      width: { mode: "fixed", value: 30 },
      height: { mode: "fixed", value: 4 },
      content: "✓ Toast Notification\nSaved cleanly",
    },
  });

  return { doc: next, overlayId, nodeId };
}

export function removeOverlayFromDoc(doc: IRDoc, overlayId: string): { doc: IRDoc; nextSelected: string } {
  const next = structuredClone(doc);
  next.overlays = next.overlays.filter((o) => o.id !== overlayId);
  return { doc: next, nextSelected: next.root.id };
}
