import type { ContentType, IRDoc, IRNode, IRStyle, TokenPair } from "./types";

export interface ExtractedGoSummary {
  styles: Record<string, IRStyle>;
  tokens: Record<string, TokenPair>;
  detectedBubbles: ContentType[];
  styleNames: string[];
  colorCount: number;
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

export function extractFromGoSource(combinedGo: string): ExtractedGoSummary {
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
    const hexMatch = arg.match(/#(#[0-9a-fA-F]{6}|[0-9a-fA-F]{6})/);
    if (hexMatch) {
      const hex = hexMatch[0].startsWith("#") ? hexMatch[0] : `#${hexMatch[0]}`;
      // Register or reuse a token for this hex
      const existing = Object.entries(tokens).find(([, p]) => p.dark.toLowerCase() === hex.toLowerCase());
      if (existing) return `$${existing[0]}`;
      const k = `tone${Object.keys(tokens).length + 1}`;
      tokens[k] = { light: hex, dark: hex };
      return `$${k}`;
    }
    const ident = arg.trim().split(".").pop() ?? "";
    if (namedColorRefs[ident]) return namedColorRefs[ident];
    return "";
  };

  // 4. Parse named lipgloss.NewStyle() chains
  const styles: Record<string, IRStyle> = {};
  const styleStartRe = /(?:var\s+)?(\w+)\s*(?::?=|:)\s*(?:[a-zA-Z_]\w*\.)?NewStyle\(\)/g;

  for (const m of combinedGo.matchAll(styleStartRe)) {
    const rawName = m[1];
    const styleName = rawName.charAt(0).toLowerCase() + rawName.slice(1);
    const startPos = (m.index ?? 0) + m[0].length;

    // Grab the chained methods until a blank line, newline not preceded by '.', or comma/closing brace
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
    else if (/DoubleBorder\(\)/.test(chain)) st.border = "double";
    else if (/NormalBorder\(\)/.test(chain)) st.border = "normal";

    const edges = st.borderEdges!;
    if (/\.BorderTop\(false\)/.test(chain)) edges[0] = false;
    if (/\.BorderRight\(false\)/.test(chain)) edges[1] = false;
    if (/\.BorderBottom\(false\)/.test(chain)) edges[2] = false;
    if (/\.BorderLeft\(false\)/.test(chain)) edges[3] = false;

    const callRe = /\.(\w+)\(/g;
    for (const cm of chain.matchAll(callRe)) {
      const method = cm[1];
      const args = extractBalancedArgs(chain, (cm.index ?? 0) + method.length + 1);

      if (method === "Padding") st.padding = expandQuad(parseNums(args));
      else if (method === "PaddingHorizontal") {
        const v = parseNums(args)[0] ?? 0;
        st.padding[1] = v; st.padding[3] = v;
      } else if (method === "PaddingVertical") {
        const v = parseNums(args)[0] ?? 0;
        st.padding[0] = v; st.padding[2] = v;
      } else if (method === "PaddingTop") st.padding[0] = parseNums(args)[0] ?? 0;
      else if (method === "PaddingRight") st.padding[1] = parseNums(args)[0] ?? 0;
      else if (method === "PaddingBottom") st.padding[2] = parseNums(args)[0] ?? 0;
      else if (method === "PaddingLeft") st.padding[3] = parseNums(args)[0] ?? 0;
      else if (method === "Margin") st.margin = expandQuad(parseNums(args));
      else if (method === "MarginTop") st.margin[0] = parseNums(args)[0] ?? 0;
      else if (method === "MarginRight") st.margin[1] = parseNums(args)[0] ?? 0;
      else if (method === "MarginBottom") st.margin[2] = parseNums(args)[0] ?? 0;
      else if (method === "MarginLeft") st.margin[3] = parseNums(args)[0] ?? 0;
      else if (method === "Bold") st.bold = /true/.test(args);
      else if (method === "Italic") st.italic = /true/.test(args);
      else if (method === "Faint") st.faint = /true/.test(args);
      else if (method === "Underline") st.underline = /true/.test(args);
      else if (method === "BorderForeground") st.borderColor = resolveColorArg(args) || "$accent";
      else if (method === "Foreground") st.fg = resolveColorArg(args) || "$textMain";
      else if (method === "Background") st.bg = resolveColorArg(args);
      else if (method === "AlignHorizontal" || method === "Align") {
        if (/Center/.test(args)) st.alignH = "center";
        else if (/Right/.test(args)) st.alignH = "right";
      }
    }

    if (st.border !== "none" && !st.borderColor) st.borderColor = "$borderIdle";
    styles[styleName] = st;
  }

  // Fallback style if file only had colors and no NewStyle() chains
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

  return {
    styles,
    tokens,
    detectedBubbles,
    styleNames: Object.keys(styles),
    colorCount: allHexes.length,
  };
}

export function buildIRFromExtracted(summary: ExtractedGoSummary, sourceLabel: string): { doc: IRDoc; firstNodeId: string } {
  const names = summary.styleNames.slice(0, 6);
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
          style: names[0],
          contentType: "text",
          width: { mode: "fixed", value: 44 },
          height: { mode: "fixed", value: 8 },
          content: `Imported from ${sourceLabel}\n\nFound ${names.length} styles & ${summary.colorCount} colors`,
        },
      },
    ],
  };

  return { doc, firstNodeId: panes[0]?.id ?? "shell" };
}
