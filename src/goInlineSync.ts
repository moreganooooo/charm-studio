import {
  generateLayoutGenGoWithSpans,
  generateModelGoWithSpans,
  generateThemeGenGoWithSpans,
  generateUpdateGoWithSpans,
  type CodeSpan,
  type CodeSpanMap,
  type GeneratedGoFile,
} from "./codegen";
import type {
  IRDoc,
  IRNode,
  IRStyle,
  KeyPulse,
  SyncPropertyKind,
} from "./types";
import { parseGoWithDst } from "./wasmEngine";

export interface LinkedGoSlice {
  file: GeneratedGoFile;
  startLine: number;
  endLine: number;
  highlightLine?: number;
  lines: { lineNo: number; text: string; isHighlighted: boolean }[];
}

function pickBestSpan(
  spans: CodeSpanMap,
  nodeId: string,
  styleName: string | undefined,
  preferredProperty: SyncPropertyKind
): CodeSpan | null {
  const candidates = [
    ...(spans[nodeId] ?? []),
    ...(styleName && styleName !== nodeId ? spans[styleName] ?? [] : []),
    ...(preferredProperty === "keybinding" ? spans.keybinding ?? [] : []),
  ];
  if (candidates.length === 0) return null;

  const exact = candidates.find((s) => s.property === preferredProperty);
  if (exact) return exact;

  if (preferredProperty === "padding-v" || preferredProperty === "padding-h") {
    const pad = candidates.find((s) => s.property === "padding");
    if (pad) return pad;
  }

  return candidates[0];
}

export function resolveLinkedCodeSlice(
  doc: IRDoc,
  selectedNode: IRNode | null,
  activeProperty: SyncPropertyKind,
  goModuleName: string,
  lastKeyPulse: KeyPulse | null = null,
  isPulseLive = false
): LinkedGoSlice {
  const nodeId = selectedNode?.id ?? doc.root.id;
  const styleName = selectedNode?.style;
  const recentPulse = isPulseLive && lastKeyPulse ? lastKeyPulse : null;

  const effectiveProp: SyncPropertyKind = recentPulse
    ? "keybinding"
    : activeProperty;

  const targetNodeId = recentPulse?.nodeId || nodeId;

  const themeRes = generateThemeGenGoWithSpans(doc);
  const layoutRes = generateLayoutGenGoWithSpans(doc);
  const modelRes = generateModelGoWithSpans(doc, goModuleName);
  const updateRes = generateUpdateGoWithSpans(doc, goModuleName);

  const byFile: Record<GeneratedGoFile, { code: string; spans: CodeSpanMap }> = {
    "theme_gen.go": themeRes,
    "layout_gen.go": layoutRes,
    "model.go": modelRes,
    "update.go": updateRes,
    "view.go": { code: "", spans: {} },
  };

  let fileOrder: GeneratedGoFile[] = ["theme_gen.go", "layout_gen.go", "model.go", "update.go"];
  if (effectiveProp === "size") {
    fileOrder = ["layout_gen.go", "theme_gen.go", "model.go", "update.go"];
  } else if (effectiveProp === "widget") {
    fileOrder = ["model.go", "layout_gen.go", "theme_gen.go", "update.go"];
  } else if (effectiveProp === "keybinding") {
    fileOrder = ["update.go", "model.go", "layout_gen.go", "theme_gen.go"];
  }

  for (const file of fileOrder) {
    const res = byFile[file];
    const span = pickBestSpan(res.spans, targetNodeId, styleName, effectiveProp);
    if (span) {
      const allLines = res.code.split("\n");
      const start = Math.max(1, span.startLine);
      const end = Math.min(allLines.length, Math.max(start, span.endLine));
      const sliceLines = allLines.slice(start - 1, end).map((text, idx) => {
        const lineNo = start + idx;
        return {
          lineNo,
          text,
          isHighlighted: span.highlightLine === lineNo,
        };
      });
      return {
        file,
        startLine: start,
        endLine: end,
        highlightLine: span.highlightLine,
        lines: sliceLines,
      };
    }
  }

  const fallbackLines = layoutRes.code.split("\n").slice(0, 8);
  return {
    file: "layout_gen.go",
    startLine: 1,
    endLine: fallbackLines.length,
    highlightLine: 1,
    lines: fallbackLines.map((text, idx) => ({
      lineNo: idx + 1,
      text,
      isHighlighted: false,
    })),
  };
}

export function isEditableGoExpressionLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith("//")) return false;
  return (
    /(?:^|\.)Padding\s*\(/.test(t) ||
    /(?:^|\.)Margin\s*\(/.test(t) ||
    /(?:^|\.)Border\s*\(/.test(t) ||
    /(?:^|\.)BorderForeground\s*\(/.test(t) ||
    /(?:^|\.)Foreground\s*\(/.test(t) ||
    /(?:^|\.)Background\s*\(/.test(t) ||
    /(?:^|\.)Width\s*\(/.test(t) ||
    /(?:^|\.)Height\s*\(/.test(t)
  );
}

function parseQuadNums(rawArgs: string): [number, number, number, number] | null {
  const nums = rawArgs
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  if (nums.length === 1) {
    const v = Math.round(nums[0]);
    return [v, v, v, v];
  }
  if (nums.length === 2) {
    const v = Math.round(nums[0]);
    const h = Math.round(nums[1]);
    return [v, h, v, h];
  }
  if (nums.length === 4) {
    return [
      Math.round(nums[0]),
      Math.round(nums[1]),
      Math.round(nums[2]),
      Math.round(nums[3]),
    ];
  }
  return null;
}

export function applyInlineGoExpression(
  editedLine: string,
  opts: {
    doc: IRDoc;
    targetNode: IRNode | null;
    updateSelectedStyle: (patch: Partial<IRStyle>) => void;
    updateNode: (nodeId: string, updater: (n: IRNode) => IRNode) => void;
    setActiveProperty: (p: SyncPropertyKind) => void;
  }
): boolean {
  const text = editedLine.trim();
  if (!text) return false;
  let applied = false;

  // Attempt Go DST AST parse if WASM DST engine is available
  if (opts.targetNode?.style) {
    const probe = `package ui\nimport "charm.land/lipgloss/v2"\nfunc _probe() lipgloss.Style { return lipgloss.NewStyle().${text.replace(/^\.+/, "").replace(/,+$/, "")} }\n`;
    const dstParsed = parseGoWithDst(probe);
    const dstStyle = dstParsed?.styles?._probe ?? dstParsed?.styles?.probe;
    if (dstStyle) {
      const patch: Partial<IRStyle> = {};
      if (text.includes("Padding(")) patch.padding = dstStyle.padding;
      if (text.includes("Margin(")) patch.margin = dstStyle.margin;
      if (text.includes("Border(")) patch.border = dstStyle.border;
      if (Object.keys(patch).length > 0) {
        opts.updateSelectedStyle(patch);
        applied = true;
      }
    }
  }

  // Padding(v, h) or Padding(t, r, b, l) or Padding(n)
  const padMatch = /Padding\(([^)]*)\)/.exec(text);
  if (padMatch && opts.targetNode?.style) {
    const quad = parseQuadNums(padMatch[1]);
    if (quad) {
      opts.updateSelectedStyle({ padding: quad });
      opts.setActiveProperty("padding");
      applied = true;
    }
  }

  // Margin(v, h) or Margin(t, r, b, l) or Margin(n)
  const marMatch = /Margin\(([^)]*)\)/.exec(text);
  if (marMatch && opts.targetNode?.style) {
    const quad = parseQuadNums(marMatch[1]);
    if (quad) {
      opts.updateSelectedStyle({ margin: quad });
      opts.setActiveProperty("padding");
      applied = true;
    }
  }

  // Border(lipgloss.RoundedBorder() | NormalBorder() | ThickBorder() | DoubleBorder() | HiddenBorder())
  const borderMatch = /Border\(([^)]*\(\)?)\)/.exec(text);
  if (borderMatch && opts.targetNode?.style) {
    const expr = borderMatch[1].toLowerCase();
    let nextBorder: IRStyle["border"] | null = null;
    if (expr.includes("rounded")) nextBorder = "rounded";
    else if (expr.includes("normal")) nextBorder = "normal";
    else if (expr.includes("thick")) nextBorder = "thick";
    else if (expr.includes("double")) nextBorder = "double";
    else if (expr.includes("hidden")) nextBorder = "hidden";
    else if (expr.includes("none")) nextBorder = "none";
    if (nextBorder) {
      opts.updateSelectedStyle({ border: nextBorder });
      opts.setActiveProperty("border");
      applied = true;
    }
  }

  // Hex colors or $token names in BorderForeground / Foreground / Background
  const hexMatch = /"(#[0-9a-fA-F]{3,8})"/.exec(text);
  if (hexMatch && opts.targetNode?.style) {
    const hex = hexMatch[1];
    if (text.includes("BorderForeground(")) {
      opts.updateSelectedStyle({ borderColor: hex });
      opts.setActiveProperty("colors");
      applied = true;
    } else if (text.includes("Foreground(")) {
      opts.updateSelectedStyle({ fg: hex });
      opts.setActiveProperty("colors");
      applied = true;
    } else if (text.includes("Background(")) {
      opts.updateSelectedStyle({ bg: hex });
      opts.setActiveProperty("colors");
      applied = true;
    }
  }

  // Width(n) / Height(n)
  if (opts.targetNode) {
    const wMatch = /Width\(\s*(\d+)\s*\)/.exec(text);
    if (wMatch) {
      const nextW = Math.max(4, Math.min(140, Number(wMatch[1])));
      if (Number.isFinite(nextW)) {
        opts.updateNode(opts.targetNode.id, (n) => ({
          ...n,
          width: { ...(n.width ?? { mode: "fixed" }), mode: "fixed", value: nextW },
        }));
        opts.setActiveProperty("size");
        applied = true;
      }
    }
    const hMatch = /Height\(\s*(\d+)\s*\)/.exec(text);
    if (hMatch) {
      const nextH = Math.max(1, Math.min(45, Number(hMatch[1])));
      if (Number.isFinite(nextH)) {
        opts.updateNode(opts.targetNode.id, (n) => ({
          ...n,
          height: { ...(n.height ?? { mode: "fixed" }), mode: "fixed", value: nextH },
        }));
        opts.setActiveProperty("size");
        applied = true;
      }
    }
  }

  return applied;
}
