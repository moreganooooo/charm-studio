import { readGoAnsiColor } from "./ansiColor";
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
    /(?:^|\.)MaxWidth\s*\(/.test(t) ||
    /(?:^|\.)MaxHeight\s*\(/.test(t) ||
    /(?:^|\.)Border\s*\(/.test(t) ||
    /(?:^|\.)Border(?:Top|Right|Bottom|Left)\s*\(/.test(t) ||
    /(?:^|\.)BorderForeground\s*\(/.test(t) ||
    /(?:^|\.)Foreground\s*\(/.test(t) ||
    /(?:^|\.)Background\s*\(/.test(t) ||
    /(?:^|\.)(?:Bold|Italic|Faint|Underline|Strikethrough)\s*\(/.test(t) ||
    /(?:^|\.)Align(?:Horizontal|Vertical)?\s*\(/.test(t) ||
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
      if (text.includes("MaxWidth(")) patch.maxWidth = dstStyle.maxWidth;
      if (text.includes("MaxHeight(")) patch.maxHeight = dstStyle.maxHeight;
      if (text.includes("Border(")) {
        patch.border = dstStyle.border;
        if (dstStyle.customBorder) patch.customBorder = dstStyle.customBorder;
      }
      if (/Border(?:Top|Right|Bottom|Left)\(/.test(text) && dstStyle.borderEdges) {
        patch.borderEdges = dstStyle.borderEdges;
      }
      if (text.includes("Bold(")) patch.bold = dstStyle.bold;
      if (text.includes("Italic(")) patch.italic = dstStyle.italic;
      if (text.includes("Faint(")) patch.faint = dstStyle.faint;
      if (text.includes("Underline(")) patch.underline = dstStyle.underline;
      if (text.includes("Strikethrough(")) patch.strikethrough = dstStyle.strikethrough;
      if (text.includes("AlignHorizontal(") || text.includes("Align(")) patch.alignH = dstStyle.alignH;
      if (text.includes("AlignVertical(")) patch.alignV = dstStyle.alignV;
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

  // MaxWidth(n) / MaxHeight(n)
  if (opts.targetNode?.style) {
    const mwMatch = /MaxWidth\(\s*(\d+)\s*\)/.exec(text);
    if (mwMatch) {
      opts.updateSelectedStyle({ maxWidth: Math.max(0, Math.round(Number(mwMatch[1]))) });
      opts.setActiveProperty("size");
      applied = true;
    }
    const mhMatch = /MaxHeight\(\s*(\d+)\s*\)/.exec(text);
    if (mhMatch) {
      opts.updateSelectedStyle({ maxHeight: Math.max(0, Math.round(Number(mhMatch[1]))) });
      opts.setActiveProperty("size");
      applied = true;
    }
  }

  // Typography toggles
  if (opts.targetNode?.style) {
    const typoPatch: Partial<IRStyle> = {};
    for (const m of text.matchAll(/\b(Bold|Italic|Faint|Underline|Strikethrough)\(\s*(true|false)\s*\)/g)) {
      const k = m[1].toLowerCase() as "bold" | "italic" | "faint" | "underline" | "strikethrough";
      typoPatch[k] = m[2] === "true";
    }
    if (Object.keys(typoPatch).length > 0) {
      opts.updateSelectedStyle(typoPatch);
      applied = true;
    }
  }

  // Alignment
  if (opts.targetNode?.style) {
    const alignPatch: Partial<IRStyle> = {};
    const ahMatch = /AlignHorizontal\(\s*lipgloss\.(Left|Center|Right)\s*\)/.exec(text);
    if (ahMatch) alignPatch.alignH = ahMatch[1].toLowerCase() as IRStyle["alignH"];
    const avMatch = /AlignVertical\(\s*lipgloss\.(Top|Center|Bottom)\s*\)/.exec(text);
    if (avMatch) alignPatch.alignV = avMatch[1].toLowerCase() as IRStyle["alignV"];
    if (Object.keys(alignPatch).length > 0) {
      opts.updateSelectedStyle(alignPatch);
      applied = true;
    }
  }

  // Border(lipgloss.RoundedBorder() | ... | lipgloss.Border{...}) and per-side BorderTop/Right/Bottom/Left
  const borderMatch = /Border\(([^)]*(?:\([^)]*\)|\{[^}]*\})?)\)/.exec(text);
  if (borderMatch && opts.targetNode?.style) {
    const rawBorder = borderMatch[1];
    const expr = rawBorder.toLowerCase();
    let nextBorder: IRStyle["border"] | null = null;
    if (expr.includes("lipgloss.border{")) {
      nextBorder = "custom";
    } else if (expr.includes("rounded")) nextBorder = "rounded";
    else if (expr.includes("normal")) nextBorder = "normal";
    else if (expr.includes("thick")) nextBorder = "thick";
    else if (expr.includes("double")) nextBorder = "double";
    else if (expr.includes("hidden")) nextBorder = "hidden";
    else if (expr.includes("none")) nextBorder = "none";
    if (nextBorder) {
      if (nextBorder === "custom") {
        const pick = (field: string, fb: string) =>
          new RegExp(`${field}\\s*:\\s*"([^"]*)"`).exec(rawBorder)?.[1] ?? fb;
        opts.updateSelectedStyle({
          border: "custom",
          customBorder: {
            top: pick("Top", "-"),
            bottom: pick("Bottom", "-"),
            left: pick("Left", "|"),
            right: pick("Right", "|"),
            topLeft: pick("TopLeft", "+"),
            topRight: pick("TopRight", "+"),
            bottomLeft: pick("BottomLeft", "+"),
            bottomRight: pick("BottomRight", "+"),
          },
        });
      } else {
        opts.updateSelectedStyle({ border: nextBorder });
      }
      opts.setActiveProperty("border");
      applied = true;
    }
  }
  if (opts.targetNode?.style && /Border(?:Top|Right|Bottom|Left)\(\s*(true|false)\s*\)/.test(text)) {
    const curStyle = opts.doc.styles[opts.targetNode.style];
    const edges: [boolean, boolean, boolean, boolean] = curStyle?.borderEdges
      ? [...curStyle.borderEdges]
      : [true, true, true, true];
    const sideIdx: Record<string, 0 | 1 | 2 | 3> = { Top: 0, Right: 1, Bottom: 2, Left: 3 };
    for (const m of text.matchAll(/Border(Top|Right|Bottom|Left)\(\s*(true|false)\s*\)/g)) {
      edges[sideIdx[m[1]]] = m[2] === "true";
    }
    opts.updateSelectedStyle({ borderEdges: edges });
    opts.setActiveProperty("border");
    applied = true;
  }

  // Literal hex or indexed colors in a Lip Gloss style call.
  if (opts.targetNode?.style) {
    const colorCalls = /\b(BorderForeground|Foreground|Background)\(\s*((?:(?:lipgloss|compat)\.)?Color\(\s*"(?:\d+|#[\da-fA-F]{3,8})"\s*\)|"#[\da-fA-F]{3,8}")\s*\)/g;
    const patch: Partial<IRStyle> = {};
    for (const [, method, args] of text.matchAll(colorCalls)) {
      const color = readGoAnsiColor(args) ?? /"(#[\da-fA-F]{3,8})"/.exec(args)?.[1];
      if (color !== undefined) {
        const prop = method === "Foreground" ? "fg" : method === "Background" ? "bg" : "borderColor";
        patch[prop] = color;
      }
    }
    if (Object.keys(patch).length > 0) {
      opts.updateSelectedStyle(patch);
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
