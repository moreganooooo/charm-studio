import type { IRDoc, IRNode, IRStyle } from "./types";

export interface AstDelta {
  kind: "added" | "removed" | "modified";
  category: "Node" | "Style" | "Token" | "Overlay" | "View";
  symbol: string;
  detail: string;
}

export interface DiffLine {
  type: "ctx" | "add" | "del";
  oldLine?: number;
  newLine?: number;
  text: string;
}

function flattenNodes(doc: IRDoc): Map<string, IRNode> {
  const map = new Map<string, IRNode>();
  const walk = (n: IRNode) => {
    map.set(n.id, n);
    n.children?.forEach(walk);
  };
  walk(doc.root);
  doc.overlays.forEach((o) => walk(o.node));
  return map;
}

function describeSize(n: IRNode): string {
  const w = n.width?.mode === "fixed" ? `${n.width.value ?? 0}c` : n.width?.mode ?? "fill";
  const h = n.height?.mode === "fixed" ? `${n.height.value ?? 0}r` : n.height?.mode ?? "fill";
  return `${w}×${h}`;
}

function summarizeStyleDiff(a: IRStyle, b: IRStyle): string[] {
  const changes: string[] = [];
  if (a.border !== b.border) changes.push(`border: ${a.border} → ${b.border}`);
  if (a.borderColor !== b.borderColor) changes.push(`borderColor: ${a.borderColor || "none"} → ${b.borderColor || "none"}`);
  if (a.fg !== b.fg) changes.push(`fg: ${a.fg || "default"} → ${b.fg || "default"}`);
  if ((a.bg ?? "") !== (b.bg ?? "")) changes.push(`bg: ${a.bg || "none"} → ${b.bg || "none"}`);
  if (a.bold !== b.bold) changes.push(`bold: ${b.bold}`);
  if (!!a.italic !== !!b.italic) changes.push(`italic: ${!!b.italic}`);
  if (JSON.stringify(a.padding) !== JSON.stringify(b.padding)) changes.push(`padding: [${b.padding.join(",")}]`);
  if (JSON.stringify(a.margin) !== JSON.stringify(b.margin)) changes.push(`margin: [${b.margin.join(",")}]`);
  if ((a.alignH ?? "left") !== (b.alignH ?? "left") || (a.alignV ?? "top") !== (b.alignV ?? "top")) {
    changes.push(`align: ${b.alignH ?? "left"}/${b.alignV ?? "top"}`);
  }
  return changes;
}

export function computeAstDeltas(prevDoc: IRDoc, currDoc: IRDoc): AstDelta[] {
  const deltas: AstDelta[] = [];

  const prevNodes = flattenNodes(prevDoc);
  const currNodes = flattenNodes(currDoc);

  for (const [id, node] of currNodes) {
    const old = prevNodes.get(id);
    if (!old) {
      deltas.push({
        kind: "added",
        category: "Node",
        symbol: `#${id}`,
        detail: `${node.kind} (${node.contentType ?? "container"}, ${describeSize(node)})`,
      });
    } else {
      const diffs: string[] = [];
      if (old.kind !== node.kind) diffs.push(`kind ${old.kind} → ${node.kind}`);
      if ((old.contentType ?? "text") !== (node.contentType ?? "text")) {
        diffs.push(`widget ${old.contentType ?? "text"} → ${node.contentType ?? "text"}`);
      }
      if ((old.style ?? "") !== (node.style ?? "")) diffs.push(`style ${old.style ?? "none"} → ${node.style ?? "none"}`);
      if (describeSize(old) !== describeSize(node)) diffs.push(`size ${describeSize(old)} → ${describeSize(node)}`);
      if ((old.width?.collapseBelow ?? 0) !== (node.width?.collapseBelow ?? 0)) {
        diffs.push(`collapseBelow → ${node.width?.collapseBelow ?? 0}`);
      }
      if ((old.content ?? "") !== (node.content ?? "")) diffs.push("content updated");
      if (JSON.stringify(old.widgetData ?? {}) !== JSON.stringify(node.widgetData ?? {})) diffs.push("widgetData updated");
      if (JSON.stringify((old.children ?? []).map((c) => c.id)) !== JSON.stringify((node.children ?? []).map((c) => c.id))) {
        diffs.push("children reordered/updated");
      }
      if (diffs.length > 0) {
        deltas.push({
          kind: "modified",
          category: "Node",
          symbol: `#${id}`,
          detail: diffs.join(" • "),
        });
      }
    }
  }

  for (const [id, node] of prevNodes) {
    if (!currNodes.has(id)) {
      deltas.push({
        kind: "removed",
        category: "Node",
        symbol: `#${id}`,
        detail: `${node.kind} (${node.contentType ?? "container"})`,
      });
    }
  }

  for (const [name, st] of Object.entries(currDoc.styles)) {
    const oldSt = prevDoc.styles[name];
    if (!oldSt) {
      deltas.push({ kind: "added", category: "Style", symbol: name, detail: `border=${st.border}` });
    } else {
      const changes = summarizeStyleDiff(oldSt, st);
      if (changes.length > 0) {
        deltas.push({ kind: "modified", category: "Style", symbol: name, detail: changes.join(", ") });
      }
    }
  }

  for (const name of Object.keys(prevDoc.styles)) {
    if (!currDoc.styles[name]) {
      deltas.push({ kind: "removed", category: "Style", symbol: name, detail: "style pruned/removed" });
    }
  }

  for (const [name, pair] of Object.entries(currDoc.tokens)) {
    const oldPair = prevDoc.tokens[name];
    if (!oldPair) {
      deltas.push({ kind: "added", category: "Token", symbol: `$${name}`, detail: `${pair.light} / ${pair.dark}` });
    } else if (oldPair.light !== pair.light || oldPair.dark !== pair.dark) {
      deltas.push({
        kind: "modified",
        category: "Token",
        symbol: `$${name}`,
        detail: `${oldPair.light}/${oldPair.dark} → ${pair.light}/${pair.dark}`,
      });
    }
  }

  for (const ov of currDoc.overlays) {
    const oldOv = prevDoc.overlays.find((o) => o.id === ov.id);
    if (!oldOv) {
      deltas.push({ kind: "added", category: "Overlay", symbol: ov.id, detail: `anchor=${ov.anchor ?? "center"}` });
    } else if (oldOv.visible !== ov.visible || oldOv.anchor !== ov.anchor) {
      deltas.push({
        kind: "modified",
        category: "Overlay",
        symbol: ov.id,
        detail: `visible=${ov.visible}, anchor=${ov.anchor ?? "center"}`,
      });
    }
  }

  const pv = prevDoc.view ?? {
    altScreen: true,
    mouseMode: "cell",
    windowTitle: "Charm Studio App",
    reportFocus: false,
    disableBracketedPasteMode: false,
  };
  const cv = currDoc.view ?? pv;
  const viewDiffs: string[] = [];
  if (pv.altScreen !== cv.altScreen) viewDiffs.push(`AltScreen=${cv.altScreen}`);
  if (pv.mouseMode !== cv.mouseMode) viewDiffs.push(`MouseMode=${cv.mouseMode}`);
  if (pv.windowTitle !== cv.windowTitle) viewDiffs.push(`WindowTitle=${JSON.stringify(cv.windowTitle)}`);
  if (pv.reportFocus !== cv.reportFocus) viewDiffs.push(`ReportFocus=${cv.reportFocus}`);
  if (pv.disableBracketedPasteMode !== cv.disableBracketedPasteMode) {
    viewDiffs.push(`DisableBracketedPasteMode=${cv.disableBracketedPasteMode}`);
  }
  if (viewDiffs.length > 0) {
    deltas.push({
      kind: "modified",
      category: "View",
      symbol: "tea.View",
      detail: viewDiffs.join(", "),
    });
  }

  return deltas;
}

export function computeUnifiedDiff(beforeText: string, afterText: string): DiffLine[] {
  const a = beforeText.split("\n");
  const b = afterText.split("\n");

  if (a.length * b.length > 250000) {
    const out: DiffLine[] = [];
    const maxLen = Math.max(a.length, b.length);
    for (let i = 0; i < maxLen; i++) {
      if (a[i] === b[i]) {
        out.push({ type: "ctx", oldLine: i + 1, newLine: i + 1, text: b[i] ?? "" });
      } else {
        if (i < a.length) out.push({ type: "del", oldLine: i + 1, text: a[i] });
        if (i < b.length) out.push({ type: "add", newLine: i + 1, text: b[i] });
      }
    }
    return out;
  }

  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1];
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      lines.push({ type: "ctx", oldLine: i + 1, newLine: j + 1, text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ type: "del", oldLine: i + 1, text: a[i] });
      i++;
    } else {
      lines.push({ type: "add", newLine: j + 1, text: b[j] });
      j++;
    }
  }
  while (i < m) {
    lines.push({ type: "del", oldLine: i + 1, text: a[i] });
    i++;
  }
  while (j < n) {
    lines.push({ type: "add", newLine: j + 1, text: b[j] });
    j++;
  }

  return lines;
}
