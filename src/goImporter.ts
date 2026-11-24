import { readGoAnsiColor } from "./ansiColor";
import type { ContentType, IRDoc, IRNode, IROverlay, IRStyle, MouseMode, TokenPair, ViewCursorMode } from "./types";
import { parseGoWithDst, parseGoWithTransport } from "./wasmEngine";

export interface ExtractedGoSummary {
  styles: Record<string, IRStyle>;
  tokens: Record<string, TokenPair>;
  view?: IRDoc["view"];
  root?: IRNode;
  overlays?: IROverlay[];
  detectedBubbles: ContentType[];
  styleNames: string[];
  colorCount: number;
  syncDisabled?: boolean;
  lockedSymbols?: string[];
  lockedProps?: Record<string, string[]>;
  lockReasons?: Record<string, "sync-disabled" | "dynamic">;
  dynamicExprs?: Record<string, Record<string, string>>;
  untouchedSymbols?: string[];
  rawGoSource?: string;
  engineUsed?: "dave/dst" | "regex-fallback";
}

function parseNums(argStr: string): number[] {
  return (argStr.match(/-?\d+/g) ?? []).map((n) => Math.max(0, parseInt(n, 10)));
}

function expandQuad(nums: number[]): [number, number, number, number] {
  if (nums.length === 1) return [nums[0], nums[0], nums[0], nums[0]];
  if (nums.length === 2) return [nums[0], nums[1], nums[0], nums[1]];
  if (nums.length === 3) return [nums[0], nums[1], nums[2], nums[1]];
  if (nums.length >= 4) return [nums[0], nums[1], nums[2], nums[3]];
  return [0, 0, 0, 0];
}

function extractBalancedArgs(src: string, openParenIdx: number): string {
  let depth = 0;
  let i = openParenIdx;
  let out = "";
  let inStr: string | null = null;
  while (i < src.length) {
    const ch = src[i];
    if (inStr) {
      out += ch;
      if (ch === "\\" && i + 1 < src.length) {
        out += src[++i];
      } else if (ch === inStr) {
        inStr = null;
      }
    } else {
      if (ch === `"` || ch === "`") inStr = ch;
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) return out.slice(1);
      }
      out += ch;
    }
    i++;
  }
  return out;
}

function addLockedProp(map: Record<string, string[]>, styleName: string, prop: string) {
  const existing = map[styleName] ?? [];
  if (!existing.includes(prop)) {
    map[styleName] = [...existing, prop];
  }
}

function hasSyncDisableDirective(text: string): boolean {
  return /\/\/\s*@tui:(?:sync-disable|block-disable)\b/.test(text);
}

export function isFileLevelSyncDisable(src: string): boolean {
  const lines = src.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) {
      if (hasSyncDisableDirective(trimmed)) return true;
      continue;
    }
    if (/^package\s+\w+/.test(trimmed)) {
      return hasSyncDisableDirective(trimmed);
    }
    break;
  }
  return false;
}

interface GoSyncMetadata {
  fileSyncDisabled: boolean;
  lockedSymbols: string[];
  lockedProps: Record<string, string[]>;
  lockReasons: Record<string, "sync-disabled" | "dynamic">;
  dynamicExprs: Record<string, Record<string, string>>;
  untouchedSymbols: string[];
}

function extractUntouchedFunctions(src: string): string[] {
  const generatedFuncs = new Set(["NewTheme", "RenderApp", "ld", "lightDark"]);
  const out: string[] = [];
  const fnRe = /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)/gm;
  for (const m of src.matchAll(fnRe)) {
    const name = m[1];
    if (generatedFuncs.has(name) || name.startsWith("_")) continue;
    const params = m[2].trim();
    const label = name === "Update" && params.includes("tea.Msg")
      ? "Update(tea.Msg)"
      : `${name}()`;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

function isSimpleColorExpr(args: string): boolean {
  const trimmed = args.trim();
  if (readGoAnsiColor(trimmed) !== undefined) return true;
  if (/^"#[0-9a-fA-F]{3,8}"$/.test(trimmed)) return true;
  if (/^(?:lipgloss\.|compat\.)?Color\(\s*"#[0-9a-fA-F]{3,8}"\s*\)$/.test(trimmed)) return true;
  if (/^(?:lipgloss\.|compat\.)?AdaptiveColor\s*\{/.test(trimmed)) return true;
  if (/^(?:ld|lightDark)\(/.test(trimmed)) return true;
  if (/^[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)?$/.test(trimmed)) return true;
  return false;
}

function extractGoSyncMetadata(src: string): GoSyncMetadata {
  const fileSyncDisabled = isFileLevelSyncDisable(src);
  const lockedProps: Record<string, string[]> = {};
  const lockReasons: Record<string, "sync-disabled" | "dynamic"> = {};
  const dynamicExprs: Record<string, Record<string, string>> = {};
  const lockedSymbolsSet = new Set<string>();

  const recordDynamic = (key: string, prop: string, expr: string) => {
    addLockedProp(lockedProps, key, prop);
    if (!lockReasons[key]) lockReasons[key] = "dynamic";
    if (!dynamicExprs[key]) dynamicExprs[key] = {};
    dynamicExprs[key][prop] = expr.trim();
    lockedSymbolsSet.add(key);
  };

  // Scan named styles & struct/map keys with NewStyle()
  const styleStartRe = /(?:(?:var\s+)?(\w+)\s*(?::?=|:))\s*(?:[a-zA-Z_]\w*\.)?NewStyle\(\)/g;
  for (const m of src.matchAll(styleStartRe)) {
    const rawName = m[1];
    const styleName = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    const matchIdx = m.index ?? 0;
    const lineStart = src.lastIndexOf("\n", matchIdx) + 1;
    const lineEndIdx = src.indexOf("\n", matchIdx);
    const currentLine = src.slice(lineStart, lineEndIdx >= 0 ? lineEndIdx : src.length);
    const preContext = src.slice(Math.max(0, lineStart - 180), lineStart);
    const preLines = preContext.split("\n").slice(-3).join("\n");

    if (hasSyncDisableDirective(preLines) || hasSyncDisableDirective(currentLine)) {
      lockedSymbolsSet.add(styleName);
      addLockedProp(lockedProps, styleName, "*");
      lockReasons[styleName] = "sync-disabled";
      continue;
    }

    const startPos = matchIdx + m[0].length;
    const rest = src.slice(startPos, startPos + 1400);
    const chainLines: string[] = [];
    for (const line of rest.split("\n")) {
      const trimmed = line.trim();
      if (chainLines.length > 0 && !trimmed.startsWith(".") && !chainLines[chainLines.length - 1].endsWith(".")) {
        break;
      }
      chainLines.push(trimmed);
      if (trimmed.endsWith(",") || trimmed.endsWith("}")) break;
    }
    const chain = chainLines.join(" ");

    const callRe = /\.\s*(\w+)\(/g;
    for (const cm of chain.matchAll(callRe)) {
      const method = cm[1];
      const args = extractBalancedArgs(chain, (cm.index ?? 0) + cm[0].length - 1).trim();
      if (!args && (method === "Border" || method.startsWith("Padding") || method.startsWith("Margin"))) continue;

      if (method === "Border") {
        if (!/(?:Rounded|Thick|Double|Normal|Hidden)Border\(\)|lipgloss\.Border\s*\{/.test(args)) {
          recordDynamic(styleName, "border", args);
        }
      } else if (method === "BorderTop" || method === "BorderRight" || method === "BorderBottom" || method === "BorderLeft") {
        if (args !== "true" && args !== "false") recordDynamic(styleName, "border", args);
      } else if (method === "Padding") {
        if (!/^-?\d+(?:\s*,\s*-?\d+){0,3}$/.test(args)) recordDynamic(styleName, "padding", args);
      } else if (method === "PaddingHorizontal" || method === "PaddingVertical" || method === "PaddingTop" || method === "PaddingRight" || method === "PaddingBottom" || method === "PaddingLeft") {
        if (!/^-?\d+$/.test(args)) recordDynamic(styleName, "padding", args);
      } else if (method === "Margin") {
        if (!/^-?\d+(?:\s*,\s*-?\d+){0,3}$/.test(args)) recordDynamic(styleName, "margin", args);
      } else if (method === "MarginTop" || method === "MarginRight" || method === "MarginBottom" || method === "MarginLeft") {
        if (!/^-?\d+$/.test(args)) recordDynamic(styleName, "margin", args);
      } else if (method === "Bold" || method === "Italic" || method === "Faint" || method === "Underline" || method === "Strikethrough") {
        if (args !== "true" && args !== "false") recordDynamic(styleName, method.toLowerCase(), args);
      } else if (method === "BorderForeground" && args && !isSimpleColorExpr(args)) {
        recordDynamic(styleName, "borderColor", args);
      } else if (method === "Foreground" && args && !isSimpleColorExpr(args)) {
        recordDynamic(styleName, "fg", args);
      } else if (method === "Background" && args && !isSimpleColorExpr(args)) {
        recordDynamic(styleName, "bg", args);
      } else if ((method === "AlignHorizontal" || method === "Align") && args && !/lipgloss\.(?:Left|Center|Right)/.test(args)) {
        recordDynamic(styleName, "alignH", args);
      } else if (method === "AlignVertical" && args && !/lipgloss\.(?:Top|Center|Bottom)/.test(args)) {
        recordDynamic(styleName, "alignV", args);
      } else if (method === "MaxWidth" && args && !/^-?\d+$/.test(args)) {
        recordDynamic(styleName, "maxWidth", args);
      } else if (method === "MaxHeight" && args && !/^-?\d+$/.test(args)) {
        recordDynamic(styleName, "maxHeight", args);
      } else if (method === "PlaceHorizontal" && args && !/lipgloss\.(?:Left|Center|Right)/.test(args)) {
        recordDynamic(styleName, "placeH", args);
      } else if (method === "PlaceVertical" && args && !/lipgloss\.(?:Top|Center|Bottom)/.test(args)) {
        recordDynamic(styleName, "placeV", args);
      }
    }
  }

  // Scan // @tui:id=<nodeId> layout annotations for block-level @tui:sync-disable and dynamic Width/Height
  const idCommentRe = /\/\/\s*@tui:id=([a-zA-Z0-9_-]+)/g;
  for (const m of src.matchAll(idCommentRe)) {
    const nodeId = m[1];
    const nodeKey = `node:${nodeId}`;
    const idx = m.index ?? 0;
    const windowBefore = src.slice(Math.max(0, idx - 140), idx);
    const windowAfter = src.slice(idx, Math.min(src.length, idx + 420));
    const snippetLines = windowAfter.split("\n").slice(0, 8).join("\n");
    const adjacentHeader = windowBefore.split("\n").slice(-2).join("\n") + "\n" + snippetLines.split("\n").slice(0, 3).join("\n");

    if (hasSyncDisableDirective(adjacentHeader)) {
      lockedSymbolsSet.add(nodeKey);
      addLockedProp(lockedProps, nodeKey, "*");
      lockReasons[nodeKey] = "sync-disabled";
      continue;
    }

    for (const dimMatch of snippetLines.matchAll(/\.(Width|Height)\(/g)) {
      const dimProp = dimMatch[1].toLowerCase();
      const dimArgs = extractBalancedArgs(snippetLines, (dimMatch.index ?? 0) + dimMatch[1].length + 1).trim();
      if (dimArgs && !/^\d+$/.test(dimArgs)) {
        recordDynamic(nodeKey, dimProp, dimArgs);
      }
    }
  }

  return {
    fileSyncDisabled,
    lockedSymbols: [...lockedSymbolsSet],
    lockedProps,
    lockReasons,
    dynamicExprs,
    untouchedSymbols: extractUntouchedFunctions(src),
  };
}

function mergeSyncMetadata(summary: ExtractedGoSummary, combinedGo: string, hasNativeReasons: boolean): ExtractedGoSummary {
  const meta = extractGoSyncMetadata(combinedGo);

  const mergedLockedProps: Record<string, string[]> = { ...(summary.lockedProps ?? {}) };
  for (const [k, props] of Object.entries(meta.lockedProps)) {
    for (const p of props) addLockedProp(mergedLockedProps, k, p);
  }

  const mergedLockReasons: Record<string, "sync-disabled" | "dynamic"> = {
    ...meta.lockReasons,
    ...(summary.lockReasons ?? {}),
  };

  const mergedDynamicExprs: Record<string, Record<string, string>> = { ...meta.dynamicExprs };
  for (const [k, exprMap] of Object.entries(summary.dynamicExprs ?? {})) {
    mergedDynamicExprs[k] = { ...(mergedDynamicExprs[k] ?? {}), ...exprMap };
  }

  const lockedSymbolsSet = new Set<string>([
    ...(summary.lockedSymbols ?? []),
    ...meta.lockedSymbols,
  ]);

  const untouchedSymbols = summary.untouchedSymbols && summary.untouchedSymbols.length > 0
    ? summary.untouchedSymbols
    : meta.untouchedSymbols;

  return {
    ...summary,
    syncDisabled: hasNativeReasons ? Boolean(summary.syncDisabled) : meta.fileSyncDisabled,
    lockedSymbols: [...lockedSymbolsSet],
    lockedProps: Object.keys(mergedLockedProps).length > 0 ? mergedLockedProps : undefined,
    lockReasons: Object.keys(mergedLockReasons).length > 0 ? mergedLockReasons : undefined,
    dynamicExprs: Object.keys(mergedDynamicExprs).length > 0 ? mergedDynamicExprs : undefined,
    untouchedSymbols: untouchedSymbols.length > 0 ? untouchedSymbols : undefined,
    rawGoSource: combinedGo,
  };
}

function buildSummaryFromDstParsed(dstParsed: ReturnType<typeof parseGoWithDst>, combinedGo: string): ExtractedGoSummary | null {
  if (!dstParsed || dstParsed.error || !dstParsed.styles) return null;
  const styles = dstParsed.styles;
  const base: ExtractedGoSummary = {
    styles,
    tokens: dstParsed.tokens ?? {},
    view: dstParsed.view,
    root: dstParsed.root,
    overlays: dstParsed.overlays,
    detectedBubbles: dstParsed.detectedBubbles ?? [],
    styleNames: dstParsed.styleNames ?? Object.keys(styles),
    colorCount: Number(dstParsed.colorCount ?? 0),
    syncDisabled: Boolean(dstParsed.syncDisabled),
    lockedSymbols: dstParsed.lockedSymbols ?? [],
    lockedProps: dstParsed.lockedProps,
    lockReasons: dstParsed.lockReasons,
    dynamicExprs: dstParsed.dynamicExprs,
    untouchedSymbols: dstParsed.untouchedSymbols,
    engineUsed: "dave/dst",
  };
  return mergeSyncMetadata(base, combinedGo, Boolean(dstParsed.lockReasons));
}

export async function extractFromGoSourceAsync(combinedGo: string): Promise<ExtractedGoSummary> {
  const dstParsed = await parseGoWithTransport(combinedGo);
  const fromDst = buildSummaryFromDstParsed(dstParsed, combinedGo);
  if (fromDst) return fromDst;
  return extractFromGoSource(combinedGo);
}

export function extractFromGoSource(combinedGo: string): ExtractedGoSummary {
  const fromDst = buildSummaryFromDstParsed(parseGoWithDst(combinedGo), combinedGo);
  if (fromDst) return fromDst;

  const tokens: Record<string, TokenPair> = {
    accent:     { light: "#2e7de9", dark: "#7aa2f7" },
    borderIdle: { light: "#9aa5ce", dark: "#414868" },
    textMain:   { light: "#3760bf", dark: "#c0caf5" },
    surface:    { light: "#d5d6db", dark: "#1f2335" },
  };

  // 1. Collect AdaptiveColor{Light: "#...", Dark: "#..."} pairs
  const adaptiveRe = /(\w+)?\s*(?::?=|:)?\s*(?:lipgloss\.|compat\.)?AdaptiveColor\s*\{\s*Light\s*:\s*"(#[0-9a-fA-F]{6})"\s*,\s*Dark\s*:\s*"(#[0-9a-fA-F]{6})"/g;
  const namedColorRefs: Record<string, string> = {};
  let tokenIdx = 1;

  for (const m of combinedGo.matchAll(adaptiveRe)) {
    const rawName = m[1] || `color${tokenIdx++}`;
    const key = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    tokens[key] = { light: m[2], dark: m[3] };
    namedColorRefs[rawName] = `$${key}`;
  }

  // 1b. Collect ld(lipgloss.Color("#light"), lipgloss.Color("#dark")) pairs
  const ldTokenRe = /(\w+)\s*(?::?=|:)\s*(?:ld|lightDark)\(\s*(?:lipgloss\.Color\()?"(#[0-9a-fA-F]{6})"\)?\s*,\s*(?:lipgloss\.Color\()?"(#[0-9a-fA-F]{6})"\)?\s*\)/g;
  for (const m of combinedGo.matchAll(ldTokenRe)) {
    const rawName = m[1];
    const key = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    tokens[key] = { light: m[2], dark: m[3] };
    namedColorRefs[rawName] = `$${key}`;
  }

  // 2. Collect standalone lipgloss.Color("#xxxxxx") assignments
  const colorVarRe = /(\w+)\s*(?::?=|:)\s*lipgloss\.Color\(\s*"(#[0-9a-fA-F]{6})"\s*\)/g;
  for (const m of combinedGo.matchAll(colorVarRe)) {
    const rawName = m[1];
    const hex = m[2];
    const key = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    if (!tokens[key]) {
      tokens[key] = { light: hex, dark: hex };
    }
    namedColorRefs[rawName] = `$${key}`;
  }

  // 3. Collect bare hex strings as fallback tokens if few named tokens found
  const allHexes = [...new Set(combinedGo.match(/#[0-9a-fA-F]{6}\b/g) ?? [])];
  if (Object.keys(namedColorRefs).length === 0 && allHexes.length > 0) {
    if (allHexes[0]) tokens.accent = { light: allHexes[0], dark: allHexes[0] };
    if (allHexes[1]) tokens.borderIdle = { light: allHexes[1], dark: allHexes[1] };
    if (allHexes[2]) tokens.textMain = { light: allHexes[2], dark: allHexes[2] };
  }

  const resolveColorArg = (arg: string): string => {
    const index = readGoAnsiColor(arg);
    if (index !== undefined) return index;
    const twoHex = [...arg.matchAll(/#[0-9a-fA-F]{6}/g)].map((h) => h[0]);
    if (twoHex.length === 2) {
      const [lHex, dHex] = twoHex;
      const existing = Object.entries(tokens).find(
        ([, p]) => p.light.toLowerCase() === lHex.toLowerCase() && p.dark.toLowerCase() === dHex.toLowerCase()
      );
      if (existing) return `$${existing[0]}`;
      const k = `tone${Object.keys(tokens).length + 1}`;
      tokens[k] = { light: lHex, dark: dHex };
      return `$${k}`;
    }
    const hexMatch = arg.match(/#(#[0-9a-fA-F]{6}|[0-9a-fA-F]{6})/);
    if (hexMatch) {
      const hex = hexMatch[0].startsWith("#") ? hexMatch[0] : `#${hexMatch[0]}`;
      const existing = Object.entries(tokens).find(([, p]) => p.dark.toLowerCase() === hex.toLowerCase());
      if (existing) return `$${existing[0]}`;
      const k = `tone${Object.keys(tokens).length + 1}`;
      tokens[k] = { light: hex, dark: hex };
      return `$${k}`;
    }
    const ident = arg.trim().split(".").pop() ?? "";
    if (namedColorRefs[ident]) return namedColorRefs[ident];
    if (tokens[ident]) return `$${ident}`;
    return "";
  };

  // 4. Parse named lipgloss.NewStyle() chains + Dynamic Go property locks
  const styles: Record<string, IRStyle> = {};
  const lockedProps: Record<string, string[]> = {};
  const lockedSymbolsSet = new Set<string>();
  const styleStartRe = /(?:var\s+)?(\w+)\s*(?::?=|:)\s*(?:[a-zA-Z_]\w*\.)?NewStyle\(\)/g;

  for (const m of combinedGo.matchAll(styleStartRe)) {
    const rawName = m[1];
    const styleName = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    const matchIdx = m.index ?? 0;

    // Check preceding comment lines for // @tui:sync-disable or // @tui:block-disable
    const preContext = combinedGo.slice(Math.max(0, matchIdx - 140), matchIdx);
    const preLines = preContext.split("\n").slice(-3).join("\n");
    if (hasSyncDisableDirective(preLines)) {
      lockedSymbolsSet.add(styleName);
      addLockedProp(lockedProps, styleName, "*");
      styles[styleName] = {
        border: "rounded",
        borderEdges: [true, true, true, true],
        borderColor: "$borderIdle",
        fg: "$textMain",
        padding: [0, 1, 0, 1],
        margin: [0, 0, 0, 0],
        bold: false,
      };
      continue;
    }

    const startPos = matchIdx + m[0].length;
    const rest = combinedGo.slice(startPos, startPos + 1400);
    const chainLines: string[] = [];
    for (const line of rest.split("\n")) {
      const trimmed = line.trim();
      if (chainLines.length > 0 && !trimmed.startsWith(".") && !chainLines[chainLines.length - 1].endsWith(".")) {
        break;
      }
      chainLines.push(trimmed);
      if (trimmed.endsWith(",") || trimmed.endsWith("}")) break;
    }
    const chain = chainLines.join(" ");

    const st: IRStyle = {
      border: "none",
      borderEdges: [true, true, true, true],
      borderColor: "",
      fg: "$textMain",
      padding: [0, 1, 0, 1],
      margin: [0, 0, 0, 0],
      bold: false,
    };

    if (/RoundedBorder\(\)/.test(chain)) st.border = "rounded";
    else if (/ThickBorder\(\)/.test(chain)) st.border = "thick";
    else if (/HiddenBorder\(\)/.test(chain)) st.border = "hidden";
    else if (/DoubleBorder\(\)/.test(chain)) st.border = "double";
    else if (/NormalBorder\(\)/.test(chain)) st.border = "normal";
    else if (/lipgloss\.Border\s*\{/.test(chain)) st.border = "custom";

    const callRe = /\.\s*(\w+)\(/g;
    for (const cm of chain.matchAll(callRe)) {
      const method = cm[1];
      const args = extractBalancedArgs(chain, (cm.index ?? 0) + cm[0].length - 1);
      const trimmedArgs = args.trim();

      if (method === "Border") {
        const customMatch = trimmedArgs.match(/lipgloss\.Border\s*\{([\s\S]*)\}/);
        if (customMatch) {
          const body = customMatch[1];
          const pick = (field: string, fb: string) => {
            const fm = body.match(new RegExp(`\\b${field}\\s*:\\s*"([^"]*)"`));
            return fm ? fm[1] : fb;
          };
          st.border = "custom";
          st.customBorder = {
            top: pick("Top", "-"),
            bottom: pick("Bottom", "-"),
            left: pick("Left", "|"),
            right: pick("Right", "|"),
            topLeft: pick("TopLeft", "+"),
            topRight: pick("TopRight", "+"),
            bottomLeft: pick("BottomLeft", "+"),
            bottomRight: pick("BottomRight", "+"),
          };
        } else if (!/(?:Rounded|Thick|Double|Normal|Hidden)Border\(\)/.test(trimmedArgs)) {
          addLockedProp(lockedProps, styleName, "border");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "BorderTop" || method === "BorderRight" || method === "BorderBottom" || method === "BorderLeft") {
        if (trimmedArgs === "true" || trimmedArgs === "false") {
          const val = trimmedArgs === "true";
          const idx = method === "BorderTop" ? 0 : method === "BorderRight" ? 1 : method === "BorderBottom" ? 2 : 3;
          st.borderEdges![idx] = val;
        } else {
          addLockedProp(lockedProps, styleName, "border");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "Padding") {
        const nums = parseNums(args);
        if (nums.length > 0 && /^[\d,\s-]+$/.test(trimmedArgs)) st.padding = expandQuad(nums);
        else {
          addLockedProp(lockedProps, styleName, "padding");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "PaddingHorizontal") {
        if (/^\d+$/.test(trimmedArgs)) {
          const v = parseNums(args)[0] ?? 0;
          st.padding[1] = v; st.padding[3] = v;
        } else {
          addLockedProp(lockedProps, styleName, "padding");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "PaddingVertical") {
        if (/^\d+$/.test(trimmedArgs)) {
          const v = parseNums(args)[0] ?? 0;
          st.padding[0] = v; st.padding[2] = v;
        } else {
          addLockedProp(lockedProps, styleName, "padding");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "PaddingTop" || method === "PaddingRight" || method === "PaddingBottom" || method === "PaddingLeft") {
        if (/^\d+$/.test(trimmedArgs)) {
          const idx = method === "PaddingTop" ? 0 : method === "PaddingRight" ? 1 : method === "PaddingBottom" ? 2 : 3;
          st.padding[idx] = parseNums(args)[0] ?? 0;
        } else {
          addLockedProp(lockedProps, styleName, "padding");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "Margin") {
        const nums = parseNums(args);
        if (nums.length > 0 && /^[\d,\s-]+$/.test(trimmedArgs)) st.margin = expandQuad(nums);
        else {
          addLockedProp(lockedProps, styleName, "margin");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "MarginTop" || method === "MarginRight" || method === "MarginBottom" || method === "MarginLeft") {
        if (/^\d+$/.test(trimmedArgs)) {
          const idx = method === "MarginTop" ? 0 : method === "MarginRight" ? 1 : method === "MarginBottom" ? 2 : 3;
          st.margin[idx] = parseNums(args)[0] ?? 0;
        } else {
          addLockedProp(lockedProps, styleName, "margin");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "Bold" || method === "Italic" || method === "Faint" || method === "Underline" || method === "Strikethrough") {
        const propKey = method.toLowerCase() as "bold" | "italic" | "faint" | "underline" | "strikethrough";
        if (trimmedArgs === "true" || trimmedArgs === "false") {
          st[propKey] = trimmedArgs === "true";
        } else {
          addLockedProp(lockedProps, styleName, propKey);
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "BorderForeground") {
        const resolved = resolveColorArg(args);
        if (resolved) st.borderColor = resolved;
        else if (trimmedArgs) {
          addLockedProp(lockedProps, styleName, "borderColor");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "Foreground") {
        const resolved = resolveColorArg(args);
        if (resolved) st.fg = resolved;
        else if (trimmedArgs) {
          addLockedProp(lockedProps, styleName, "fg");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "Background") {
        const resolved = resolveColorArg(args);
        if (resolved) st.bg = resolved;
        else if (trimmedArgs) {
          addLockedProp(lockedProps, styleName, "bg");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "AlignHorizontal" || method === "Align") {
        const alignParts = args.split(",").map((p) => p.trim());
        const hPart = alignParts[0] ?? args;
        if (/lipgloss\.Center/.test(hPart)) st.alignH = "center";
        else if (/lipgloss\.Right/.test(hPart)) st.alignH = "right";
        else if (/lipgloss\.Left/.test(hPart)) st.alignH = "left";
        else if (trimmedArgs) {
          addLockedProp(lockedProps, styleName, "alignH");
          lockedSymbolsSet.add(styleName);
        }
        if (method === "Align" && alignParts.length >= 2) {
          const vPart = alignParts[1];
          if (/lipgloss\.Center/.test(vPart)) st.alignV = "center";
          else if (/lipgloss\.Bottom/.test(vPart)) st.alignV = "bottom";
          else if (/lipgloss\.Top/.test(vPart)) st.alignV = "top";
          else if (vPart) {
            addLockedProp(lockedProps, styleName, "alignV");
            lockedSymbolsSet.add(styleName);
          }
        }
      } else if (method === "AlignVertical") {
        if (/lipgloss\.Center/.test(args)) st.alignV = "center";
        else if (/lipgloss\.Bottom/.test(args)) st.alignV = "bottom";
        else if (/lipgloss\.Top/.test(args)) st.alignV = "top";
        else if (trimmedArgs) {
          addLockedProp(lockedProps, styleName, "alignV");
          lockedSymbolsSet.add(styleName);
        }
      } else if (method === "PlaceHorizontal") {
        if (/lipgloss\.Center/.test(args)) st.placeH = "center";
        else if (/lipgloss\.Right/.test(args)) st.placeH = "right";
        else if (/lipgloss\.Left/.test(args)) st.placeH = "left";
      } else if (method === "PlaceVertical") {
        if (/lipgloss\.Center/.test(args)) st.placeV = "center";
        else if (/lipgloss\.Bottom/.test(args)) st.placeV = "bottom";
        else if (/lipgloss\.Top/.test(args)) st.placeV = "top";
      } else if (method === "MaxWidth") {
        if (/^\d+$/.test(trimmedArgs)) st.maxWidth = parseNums(args)[0] ?? 0;
      } else if (method === "MaxHeight") {
        if (/^\d+$/.test(trimmedArgs)) st.maxHeight = parseNums(args)[0] ?? 0;
      }
    }

    if (st.border !== "none" && !st.borderColor) st.borderColor = "$borderIdle";
    styles[styleName] = st;
  }

  // 5. Parse tea.View flags in fallback mode
  let foundView = false;
  const viewCfg: NonNullable<IRDoc["view"]> = { mouseMode: "none" };
  const altMatch = combinedGo.match(/\bv\.AltScreen\s*=\s*(true|false)/);
  if (altMatch) { viewCfg.altScreen = altMatch[1] === "true"; foundView = true; }
  const rfMatch = combinedGo.match(/\bv\.ReportFocus\s*=\s*(true|false)/);
  if (rfMatch) { viewCfg.reportFocus = rfMatch[1] === "true"; foundView = true; }
  const bpMatch = combinedGo.match(/\bv\.DisableBracketedPasteMode\s*=\s*(true|false)/);
  if (bpMatch) { viewCfg.disableBracketedPasteMode = bpMatch[1] === "true"; foundView = true; }
  const wtMatch = combinedGo.match(/\bv\.WindowTitle\s*=\s*"([^"]*)"/);
  if (wtMatch) { viewCfg.windowTitle = wtMatch[1]; foundView = true; }
  const mmMatch = combinedGo.match(/\bv\.MouseMode\s*=\s*tea\.(MouseMode\w+)/);
  if (mmMatch) {
    foundView = true;
    const modeMap: Record<string, MouseMode> = {
      MouseModeCellMotion: "cell",
      MouseModeAllMotion: "all",
      MouseModeNone: "none",
    };
    viewCfg.mouseMode = modeMap[mmMatch[1]] ?? "none";
  }
  const cursorMatch = combinedGo.match(/\bv\.Cursor\s*=\s*([^\n]+)/);
  if (cursorMatch) {
    foundView = true;
    const rhs = cursorMatch[1].trim();
    if (rhs === "nil") {
      viewCfg.cursorMode = "none";
    } else {
      const manualMatch = rhs.match(/tea\.NewCursor\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
      if (manualMatch) {
        viewCfg.cursorMode = "manual";
        viewCfg.cursorX = parseInt(manualMatch[1], 10);
        viewCfg.cursorY = parseInt(manualMatch[2], 10);
      } else if (/\.Cursor\(\)/.test(rhs)) {
        viewCfg.cursorMode = "auto" as ViewCursorMode;
      }
    }
  }

  const styleNames = Object.keys(styles);
  if (styleNames.length === 0) {
    styles.importedBox = {
      border: "rounded",
      borderEdges: [true, true, true, true],
      borderColor: "$accent",
      fg: "$textMain",
      padding: [1, 2, 1, 2],
      margin: [0, 0, 0, 0],
      bold: false,
    };
  }

  const detectedBubbles: ContentType[] = [];
  if (/bubbles(?:\/v2)?\/list/.test(combinedGo)) detectedBubbles.push("bubble:list");
  if (/bubbles(?:\/v2)?\/table/.test(combinedGo)) detectedBubbles.push("bubble:table");
  if (/bubbles(?:\/v2)?\/viewport/.test(combinedGo)) detectedBubbles.push("bubble:viewport");
  if (/bubbles(?:\/v2)?\/textinput/.test(combinedGo)) detectedBubbles.push("bubble:textinput");
  if (/bubbles(?:\/v2)?\/textarea/.test(combinedGo)) detectedBubbles.push("bubble:textarea");
  if (/bubbles(?:\/v2)?\/progress/.test(combinedGo)) detectedBubbles.push("bubble:progress");
  if (/bubbles(?:\/v2)?\/spinner/.test(combinedGo)) detectedBubbles.push("bubble:spinner");
  if (/bubbles(?:\/v2)?\/filepicker/.test(combinedGo)) detectedBubbles.push("bubble:filepicker");
  if (/bubbles(?:\/v2)?\/paginator/.test(combinedGo)) detectedBubbles.push("bubble:paginator");
  if (/bubbles(?:\/v2)?\/help/.test(combinedGo)) detectedBubbles.push("bubble:help");
  if (/bubbles(?:\/v2)?\/timer/.test(combinedGo)) detectedBubbles.push("bubble:timer");
  if (/bubbles(?:\/v2)?\/stopwatch/.test(combinedGo)) detectedBubbles.push("bubble:stopwatch");
  if (/charmbracelet\/huh|charm\.land\/huh/.test(combinedGo)) detectedBubbles.push("huh:form");
  if (/charmbracelet\/glamour|charm\.land\/glamour/.test(combinedGo)) detectedBubbles.push("glamour:markdown");
  if (/charmbracelet\/wish|charm\.land\/wish/.test(combinedGo)) detectedBubbles.push("wish:ssh");
  if (/charmbracelet\/ultraviolet/.test(combinedGo)) detectedBubbles.push("uv:screen");
  if (/charmbracelet\/x\/cellbuf/.test(combinedGo)) detectedBubbles.push("cellbuf:canvas");

  return mergeSyncMetadata(
    {
      styles,
      tokens,
      view: foundView ? viewCfg : undefined,
      detectedBubbles,
      styleNames: Object.keys(styles),
      colorCount: allHexes.length,
      syncDisabled: isFileLevelSyncDisable(combinedGo),
      lockedSymbols: [...lockedSymbolsSet],
      lockedProps: Object.keys(lockedProps).length > 0 ? lockedProps : undefined,
      engineUsed: "regex-fallback",
    },
    combinedGo,
    false
  );
}

function findFirstBoxId(node: IRNode): string | null {
  if (node.kind === "Box") return node.id;
  for (const ch of node.children ?? []) {
    const hit = findFirstBoxId(ch);
    if (hit) return hit;
  }
  return null;
}

export function buildIRFromExtracted(summary: ExtractedGoSummary, sourceLabel: string): { doc: IRDoc; firstNodeId: string } {
  const names = summary.styleNames.slice(0, 6);
  const firstStyle = names[0] || Object.keys(summary.styles)[0] || "importedBox";

  if (summary.root && summary.root.id) {
    const overlays: IROverlay[] =
      summary.overlays && summary.overlays.length > 0
        ? summary.overlays
        : [
            {
              id: "helpModal",
              visible: false,
              z: 10,
              node: {
                id: "modalCard",
                kind: "Box",
                style: firstStyle,
                contentType: "text",
                width: { mode: "fixed", value: 44 },
                height: { mode: "fixed", value: 8 },
                content: `Imported from ${sourceLabel}\n\nFound ${summary.styleNames.length} styles & ${summary.colorCount} colors`,
              },
            },
          ];

    const doc: IRDoc = {
      tokens: summary.tokens,
      styles: summary.styles,
      view: summary.view,
      root: summary.root,
      overlays,
      ...(summary.lockedProps && Object.keys(summary.lockedProps).length > 0 ? { lockedProps: summary.lockedProps } : {}),
      ...(summary.lockReasons && Object.keys(summary.lockReasons).length > 0 ? { lockReasons: summary.lockReasons } : {}),
      ...(summary.dynamicExprs && Object.keys(summary.dynamicExprs).length > 0 ? { dynamicExprs: summary.dynamicExprs } : {}),
      ...(summary.untouchedSymbols && summary.untouchedSymbols.length > 0 ? { untouchedHandOwned: summary.untouchedSymbols } : {}),
      ...(summary.rawGoSource
        ? {
            importedGo: {
              label: sourceLabel,
              source: summary.rawGoSource,
              fileSyncDisabled: Boolean(summary.syncDisabled),
            },
          }
        : {}),
    };
    return {
      doc,
      firstNodeId: findFirstBoxId(summary.root) ?? summary.root.id,
    };
  }

  const panes: IRNode[] = names.map((styleName, idx) => {
    const bubble = summary.detectedBubbles[idx];
    const isSidebar = /side|nav|menu|list/i.test(styleName) || (idx === 0 && names.length > 1);
    const isStatus = /status|foot|hint|help/i.test(styleName);

    return {
      id: styleName,
      kind: "Box",
      style: styleName,
      contentType: bubble ?? "text",
      width: isSidebar && !isStatus ? { mode: "fixed", value: 28, collapseBelow: 70 } : { mode: "fill", weight: 1 },
      height: isStatus ? { mode: "fixed", value: 2 } : { mode: "fill", weight: 1 },
      content: `${styleName}\nImported from ${sourceLabel}`,
    };
  });

  const statusIdx = panes.findIndex((p) => /status|foot|hint|help/i.test(p.id));
  const statusPane = statusIdx >= 0 && panes.length > 1 ? panes.splice(statusIdx, 1)[0] : null;

  const bodyNode: IRNode =
    panes.length === 1
      ? panes[0]
      : {
          id: "body",
          kind: "JoinHorizontal",
          height: { mode: "fill", weight: 1 },
          children: panes,
        };

  const rootChildren: IRNode[] = [bodyNode];
  if (statusPane) rootChildren.push(statusPane);

  const doc: IRDoc = {
    tokens: summary.tokens,
    styles: summary.styles,
    view: summary.view,
    root: {
      id: "shell",
      kind: "JoinVertical",
      children: rootChildren,
    },
    overlays: [
      {
        id: "helpModal",
        visible: false,
        z: 10,
        node: {
          id: "modalCard",
          kind: "Box",
          style: firstStyle,
          contentType: "text",
          width: { mode: "fixed", value: 44 },
          height: { mode: "fixed", value: 8 },
          content: `Imported from ${sourceLabel}\n\nFound ${names.length} styles & ${summary.colorCount} colors`,
        },
      },
    ],
    ...(summary.lockedProps && Object.keys(summary.lockedProps).length > 0 ? { lockedProps: summary.lockedProps } : {}),
    ...(summary.lockReasons && Object.keys(summary.lockReasons).length > 0 ? { lockReasons: summary.lockReasons } : {}),
    ...(summary.dynamicExprs && Object.keys(summary.dynamicExprs).length > 0 ? { dynamicExprs: summary.dynamicExprs } : {}),
    ...(summary.untouchedSymbols && summary.untouchedSymbols.length > 0 ? { untouchedHandOwned: summary.untouchedSymbols } : {}),
    ...(summary.rawGoSource
      ? {
          importedGo: {
            label: sourceLabel,
            source: summary.rawGoSource,
            fileSyncDisabled: Boolean(summary.syncDisabled),
          },
        }
      : {}),
  };

  return { doc, firstNodeId: panes[0]?.id ?? "shell" };
}
