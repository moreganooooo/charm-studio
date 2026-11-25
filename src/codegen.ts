import { isAnsiIndex, swatchColor } from "./ansiColor";
import { defaultWidgetData, sanitizeGoId, type IRDoc, type IRNode, type IRStyle, type SyncPropertyKind } from "./types";

export type GeneratedGoFile = "theme_gen.go" | "layout_gen.go" | "model.go" | "update.go" | "view.go";

export interface CodeSpan {
  file: GeneratedGoFile;
  startLine: number;
  endLine: number;
  highlightLine?: number;
  property?: SyncPropertyKind;
}

export type CodeSpanMap = Record<string, CodeSpan[]>;

function pushSpan(map: CodeSpanMap, key: string, span: CodeSpan) {
  if (!key) return;
  if (!map[key]) map[key] = [];
  map[key].push(span);
}

function collectNodesByStyle(doc: IRDoc): Map<string, string[]> {
  const byStyle = new Map<string, string[]>();
  const add = (n: IRNode) => {
    if (n.style) {
      const list = byStyle.get(n.style) ?? [];
      list.push(n.id);
      byStyle.set(n.style, list);
    }
    n.children?.forEach(add);
  };
  add(doc.root);
  doc.overlays.forEach((o) => add(o.node));
  return byStyle;
}

function toPascal(id: string): string {
  const safe = sanitizeGoId(id, "item");
  return safe.charAt(0).toUpperCase() + safe.slice(1);
}

function toCamel(id: string): string {
  return sanitizeGoId(id, "item");
}

function formatQuad(method: string, q: [number, number, number, number]): string | null {
  const [t, r, b, l] = q;
  if (t === 0 && r === 0 && b === 0 && l === 0) return null;
  if (t === r && r === b && b === l) return `.${method}(${t})`;
  if (t === b && r === l) return `.${method}(${t}, ${r})`;
  return `.${method}(${t}, ${r}, ${b}, ${l})`;
}

function borderExpr(st: IRStyle): string | null {
  switch (st.border) {
    case "rounded": return ".Border(lipgloss.RoundedBorder())";
    case "normal":  return ".Border(lipgloss.NormalBorder())";
    case "thick":   return ".Border(lipgloss.ThickBorder())";
    case "hidden":  return ".Border(lipgloss.HiddenBorder())";
    case "double":  return ".Border(lipgloss.DoubleBorder())";
    case "custom": {
      const cb = st.customBorder ?? {
        top: "-",
        bottom: "-",
        left: "|",
        right: "|",
        topLeft: "+",
        topRight: "+",
        bottomLeft: "+",
        bottomRight: "+",
      };
      return `.Border(lipgloss.Border{Top: ${JSON.stringify(cb.top)}, Bottom: ${JSON.stringify(cb.bottom)}, Left: ${JSON.stringify(cb.left)}, Right: ${JSON.stringify(cb.right)}, TopLeft: ${JSON.stringify(cb.topLeft)}, TopRight: ${JSON.stringify(cb.topRight)}, BottomLeft: ${JSON.stringify(cb.bottomLeft)}, BottomRight: ${JSON.stringify(cb.bottomRight)}})`;
    }
    default:        return null;
  }
}

function colorExpr(val: string | undefined, tokenNames: Set<string>): string | null {
  if (!val) return null;
  if (val.startsWith("$")) {
    const name = val.slice(1);
    if (tokenNames.has(name)) return toCamel(name);
  }
  return `lipgloss.Color(${JSON.stringify(val)})`;
}

function resolveDocColorHex(doc: IRDoc, ref: string | undefined, fallback: string): string {
  if (!ref) return fallback;
  if (ref.startsWith("$")) {
    const pair = doc.tokens[ref.slice(1)];
    if (pair) return pair.dark || pair.light || fallback;
    return fallback;
  }
  return ref;
}

function isTokenRef(ref: string | undefined): boolean {
  return Boolean(ref && ref.startsWith("$"));
}

function goTokenColorExpr(doc: IRDoc, ref: string | undefined, fallback: string, isDarkExpr = "isDark"): string {
  if (isTokenRef(ref)) {
    return `ui.ResolveTokenColor(${isDarkExpr}, ${JSON.stringify(ref)}, ${JSON.stringify(fallback)})`;
  }
  return JSON.stringify(resolveDocColorHex(doc, ref, fallback));
}

function hexToColorRGBAExpr(hex: string): string | null {
  const normalized = isAnsiIndex(hex.trim()) ? swatchColor(hex.trim()) : hex;
  const m = normalized.trim().match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const h = m[1];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `color.RGBA{R: ${r}, G: ${g}, B: ${b}, A: 255}`;
}

function lipPos(v: string | undefined, kind: "h" | "v"): string {
  if (kind === "h") {
    if (v === "center") return "lipgloss.Center";
    if (v === "right" || v === "end") return "lipgloss.Right";
    return "lipgloss.Left";
  }
  if (v === "center") return "lipgloss.Center";
  if (v === "bottom" || v === "end") return "lipgloss.Bottom";
  return "lipgloss.Top";
}

function collectOrderedLeafBoxes(doc: IRDoc): { rootLeaves: IRNode[]; activeOverlays: IRDoc["overlays"] } {
  const rootLeaves: IRNode[] = [];
  const walk = (n: IRNode) => {
    if (n.kind === "Box") {
      rootLeaves.push(n);
    }
    n.children?.forEach(walk);
  };
  walk(doc.root);
  const activeOverlays = doc.overlays.filter((o) => o.visible);
  return { rootLeaves, activeOverlays };
}

export function generateStylesGo(doc: IRDoc): string {
  const tokenEntries = Object.entries(doc.tokens);
  const tokenNames = new Set(Object.keys(doc.tokens));
  const styleEntries = Object.entries(doc.styles);

  const structFields = styleEntries
    .map(([name]) => `\t${toPascal(name)} lipgloss.Style // @tui:style=${name}`)
    .join("\n");

  const usedColors = new Set(styleEntries.flatMap(([, style]) =>
    [style.fg, style.bg, borderExpr(style) ? style.borderColor : undefined]
  ));
  const tokenDecls = tokenEntries.map(([name, pair]) => {
    const variable = toCamel(name);
    const declaration = `\t// @tui:token=${name}\n\t${variable} := ld(lipgloss.Color(${JSON.stringify(pair.light)}), lipgloss.Color(${JSON.stringify(pair.dark)}))`;
    return usedColors.has(`$${name}`) ? declaration : `${declaration}\n\t_ = ${variable}`;
  }).join("\n");

  const styleInits = styleEntries
    .map(([name, st]) => {
      const chains: string[] = [];
      const b = borderExpr(st);
      if (b) {
        chains.push(b);
        if (st.borderEdges && st.borderEdges.some((e) => !e)) {
          const [t, r, bo, l] = st.borderEdges;
          chains.push(`.BorderTop(${t})`, `.BorderRight(${r})`, `.BorderBottom(${bo})`, `.BorderLeft(${l})`);
        }
      }
      const bc = colorExpr(st.borderColor, tokenNames);
      if (bc && b) chains.push(`.BorderForeground(${bc})`);
      const fg = colorExpr(st.fg, tokenNames);
      if (fg) chains.push(`.Foreground(${fg})`);
      const bg = colorExpr(st.bg, tokenNames);
      if (bg) chains.push(`.Background(${bg})`);
      const pad = formatQuad("Padding", st.padding);
      if (pad) chains.push(pad);
      const mar = formatQuad("Margin", st.margin);
      if (mar) chains.push(mar);
      if (st.maxWidth && st.maxWidth > 0) chains.push(`.MaxWidth(${st.maxWidth})`);
      if (st.maxHeight && st.maxHeight > 0) chains.push(`.MaxHeight(${st.maxHeight})`);
      if (st.bold) chains.push(".Bold(true)");
      if (st.italic) chains.push(".Italic(true)");
      if (st.faint) chains.push(".Faint(true)");
      if (st.underline) chains.push(".Underline(true)");
      if (st.strikethrough) chains.push(".Strikethrough(true)");
      if (st.alignH && st.alignH !== "left") chains.push(`.AlignHorizontal(${lipPos(st.alignH, "h")})`);
      if (st.alignV && st.alignV !== "top") chains.push(`.AlignVertical(${lipPos(st.alignV, "v")})`);

      if (chains.length === 0) {
        return `\t\t// @tui:style=${name}\n\t\t${toPascal(name)}: lipgloss.NewStyle(),`;
      }
      return `\t\t// @tui:style=${name}\n\t\t${toPascal(name)}: lipgloss.NewStyle().\n\t\t\t${chains.map((c) => c.slice(1)).join(".\n\t\t\t")},`;
    })
    .join("\n");

  const tokenSwitchCases = tokenEntries
    .map(([name, pair]) => `\tcase ${JSON.stringify(name)}:\n\t\tif isDark {\n\t\t\treturn ${JSON.stringify(pair.dark || pair.light)}\n\t\t}\n\t\treturn ${JSON.stringify(pair.light || pair.dark)}`)
    .join("\n");

  const stringsImport = tokenEntries.length > 0 ? `\nimport (\n\t"strings"\n\n\t"charm.land/lipgloss/v2"\n)` : `\nimport "charm.land/lipgloss/v2"`;

  return `package ui
${stringsImport}

type Theme struct {
${structFields}
}

func NewTheme(isDark bool) Theme {
${tokenEntries.length ? "\tld := lipgloss.LightDark(isDark)\n" : ""}
${tokenDecls}

\treturn Theme{
${styleInits}
\t}
}

func DefaultStyles(isDark bool) Theme {
\treturn NewTheme(isDark)
}

func ResolveTokenColor(isDark bool, ref, fallback string) string {
${tokenEntries.length ? `\tname := strings.TrimPrefix(ref, "$")\n\tswitch name {\n${tokenSwitchCases}\n\t}\n` : `\t_, _, _ = isDark, ref, fallback\n`}
\treturn fallback
}
`;
}

export function generateLayoutGo(doc: IRDoc): string {
  const leafParams: string[] = [];
  let usesTruncate = false;

  const collectLeaves = (n: IRNode) => {
    if (n.kind === "Box") {
      leafParams.push(`${toCamel(n.id)}Content string`);
      if (n.style && doc.styles[n.style]?.truncate) usesTruncate = true;
    }
    n.children?.forEach(collectLeaves);
  };
  collectLeaves(doc.root);

  const lines: string[] = [];
  let varSeq = 0;
  const freshVar = (prefix: string) => `${toCamel(prefix)}${varSeq++ === 0 ? "" : varSeq}`;

  function emitNode(node: IRNode, wExpr: string, hExpr: string, indent: string): string {
    if (node.kind === "Box") {
      const v = freshVar(node.id);
      const stRef = node.style ? `st.${toPascal(node.style)}` : "lipgloss.NewStyle()";
      const stObj = node.style ? doc.styles[node.style] : undefined;
      const modifiers: string[] = [];
      if (node.width?.mode !== "fit") {
        modifiers.push(`Width(max(0, ${wExpr}-${stRef}.GetHorizontalMargins()))`);
      }
      if (node.height?.mode !== "fit") {
        modifiers.push(`Height(max(0, ${hExpr}-${stRef}.GetVerticalMargins()))`);
      }
      const chain = modifiers.length > 0 ? `.${modifiers.join(".")}` : "";
      let contentArg = `${toCamel(node.id)}Content`;
      if (stObj?.truncate) {
        contentArg = `truncate(${contentArg}, max(1, ${wExpr}-${stRef}.GetHorizontalFrameSize()))`;
      }
      lines.push(`${indent}// @tui:id=${node.id}`);
      if (stObj?.placeH || stObj?.placeV) {
        lines.push(`${indent}${v}Inner := ${stRef}${chain}.Render(${contentArg})`);
        lines.push(
          `${indent}${v} := lipgloss.Place(max(1, ${wExpr}-${stRef}.GetHorizontalMargins()), max(1, ${hExpr}-${stRef}.GetVerticalMargins()), ${lipPos(stObj.placeH, "h")}, ${lipPos(stObj.placeV, "v")}, ${v}Inner)`
        );
      } else {
        lines.push(`${indent}${v} := ${stRef}${chain}.Render(${contentArg})`);
      }
      return v;
    }

    const isH = node.kind === "JoinHorizontal";
    const children = node.children ?? [];
    const collapsible = children.filter((c) => (c.width?.collapseBelow ?? 0) > 0);
    const outVar = freshVar(node.id);

    const emitBranch = (activeChildren: IRNode[], brIndent: string, targetVar: string) => {
      const fixedNodes = activeChildren.filter((c) => (isH ? c.width?.mode : c.height?.mode) === "fixed");
      const fillNodes = activeChildren.filter((c) => (isH ? c.width?.mode : c.height?.mode) !== "fixed");
      const fixedSum = fixedNodes.reduce((acc, c) => acc + ((isH ? c.width?.value : c.height?.value) ?? 0), 0);
      const weightSum = fillNodes.reduce((acc, c) => acc + ((isH ? c.width?.weight : c.height?.weight) ?? 1), 0);

      const remVar = freshVar(isH ? "remW" : "remH");
      if (fillNodes.length > 0) {
        lines.push(`${brIndent}${remVar} := max(0, ${isH ? wExpr : hExpr}${fixedSum > 0 ? `-${fixedSum}` : ""})`);
      }

      const childVars = activeChildren.map((ch) => {
        const dim = isH ? ch.width : ch.height;
        let cw = wExpr;
        let chH = hExpr;
        if (dim?.mode === "fixed") {
          if (isH) cw = `${dim.value ?? 0}`;
          else chH = `${dim.value ?? 0}`;
        } else {
          const wt = dim?.weight ?? 1;
          const expr = weightSum === wt ? remVar : `(${remVar} * ${wt}) / ${Math.max(1, weightSum)}`;
          if (isH) cw = expr;
          else chH = expr;
        }
        return emitNode(ch, cw, chH, brIndent);
      });

      const pos = lipPos(node.joinAlign, isH ? "v" : "h");
      const joinFn = isH ? `lipgloss.JoinHorizontal(${pos}` : `lipgloss.JoinVertical(${pos}`;
      lines.push(`${brIndent}${targetVar} = ${joinFn}, ${childVars.join(", ")})`);
    };

    lines.push(`${indent}// @tui:id=${node.id}`);
    if (collapsible.length > 0) {
      const bp = collapsible[0].width!.collapseBelow!;
      const nonCollapsed = children.filter((c) => !collapsible.includes(c));
      lines.push(`${indent}var ${outVar} string`);
      lines.push(`${indent}if ${wExpr} < ${bp} {`);
      emitBranch(nonCollapsed, indent + "\t", outVar);
      lines.push(`${indent}} else {`);
      emitBranch(children, indent + "\t", outVar);
      lines.push(`${indent}}`);
      return outVar;
    }

    lines.push(`${indent}var ${outVar} string`);
    emitBranch(children, indent, outVar);
    return outVar;
  }

  const rootVar = emitNode(doc.root, "w", "h", "\t");
  const activeOverlays = doc.overlays.filter((o) => o.visible);

  if (activeOverlays.length > 0) {
    const ovParams = activeOverlays.map((o) => `${toCamel(o.node.id)}Content string`);
    leafParams.push(...ovParams);
    const harmonicaOvParams = activeOverlays
      .filter((o) => Boolean(o.harmonica?.enabled))
      .map((o) => `${toCamel(o.node.id)}OvYOffset int`);
    leafParams.push(...harmonicaOvParams);
    lines.push("");
    lines.push(`\tlayers := []*lipgloss.Layer{lipgloss.NewLayer(${rootVar}).X(0).Y(0).Z(0).ID(${JSON.stringify(doc.root.id)})}`);
    for (const ov of activeOverlays) {
      const ow = ov.node.width?.value ?? 44;
      const oh = ov.node.height?.value ?? 9;
      const anchor = ov.anchor ?? "center";
      const stRef = ov.node.style ? `st.${toPascal(ov.node.style)}` : "lipgloss.NewStyle()";
      const ovStyle = ov.node.style ? doc.styles[ov.node.style] : undefined;
      const ovVar = freshVar(ov.node.id);
      if (ovStyle?.truncate) usesTruncate = true;

      let wCode = `${ow}`;
      let xExpr = `max(0, (w-${ow})/2)`;
      let yExpr = `max(0, (h-${oh})/2)`;
      if (anchor === "top-right") {
        xExpr = `max(0, w-${ow}-1)`;
        yExpr = `1`;
      } else if (anchor === "bottom-right") {
        xExpr = `max(0, w-${ow}-1)`;
        yExpr = `max(0, h-${oh}-1)`;
      } else if (anchor === "bottom-bar") {
        wCode = `max(20, w-4)`;
        xExpr = `max(0, (w-${wCode})/2)`;
        yExpr = `max(0, h-${oh}-1)`;
      } else if (anchor === "place") {
        if (ov.placeX !== undefined || ov.placeY !== undefined) {
          xExpr = `max(0, min(w-${ow}, ${ov.placeX ?? 4}))`;
          yExpr = `max(0, min(h-${oh}, ${ov.placeY ?? 2}))`;
        } else {
          xExpr = ov.placeH === "right" ? `max(0, w-${ow})` : ov.placeH === "left" ? `0` : `max(0, (w-${ow})/2)`;
          yExpr = ov.placeV === "bottom" ? `max(0, h-${oh})` : ov.placeV === "top" ? `0` : `max(0, (h-${oh})/2)`;
        }
      }

      const finalYExpr = ov.harmonica?.enabled
        ? `(${yExpr}) + ${toCamel(ov.node.id)}OvYOffset`
        : yExpr;

      let ovContentArg = `${toCamel(ov.node.id)}Content`;
      if (ovStyle?.truncate) {
        ovContentArg = `truncate(${ovContentArg}, max(1, ${wCode}-${stRef}.GetHorizontalFrameSize()))`;
      }

      lines.push(`\t// @tui:id=${ov.node.id}`);
      if (ov.harmonica?.enabled) {
        lines.push(`\t// Harmonica spring animation: frequency=${ov.harmonica.frequency.toFixed(1)}, damping=${ov.harmonica.damping.toFixed(2)}`);
      }
      if (ovStyle?.placeH || ovStyle?.placeV) {
        lines.push(`\t${ovVar}Inner := ${stRef}.Width(${wCode} - ${stRef}.GetHorizontalMargins()).Height(${oh} - ${stRef}.GetVerticalMargins()).Render(${ovContentArg})`);
        lines.push(`\t${ovVar} := lipgloss.Place(max(1, ${wCode}-${stRef}.GetHorizontalMargins()), max(1, ${oh}-${stRef}.GetVerticalMargins()), ${lipPos(ovStyle.placeH, "h")}, ${lipPos(ovStyle.placeV, "v")}, ${ovVar}Inner)`);
      } else {
        lines.push(`\t${ovVar} := ${stRef}.Width(${wCode} - ${stRef}.GetHorizontalMargins()).Height(${oh} - ${stRef}.GetVerticalMargins()).Render(${ovContentArg})`);
      }
      lines.push(`\tlayers = append(layers, lipgloss.NewLayer(${ovVar}).X(${xExpr}).Y(${finalYExpr}).Z(${ov.z}).ID(${JSON.stringify(ov.node.id)}))`);
    }
    lines.push(`\tcanvas := lipgloss.NewCanvas(w, h)`);
    lines.push(`\tcanvas.Compose(lipgloss.NewCompositor(layers...))`);
    lines.push(`\treturn canvas.Render()`);
  } else {
    lines.push(`\treturn ${rootVar}`);
  }

  const imports = usesTruncate
    ? `import (\n\t"strings"\n\n\t"charm.land/lipgloss/v2"\n)`
    : `import "charm.land/lipgloss/v2"`;

  const truncateHelper = usesTruncate
    ? `\nfunc truncate(s string, maxW int) string {\n\tlines := strings.Split(s, "\\n")\n\tfor i, l := range lines {\n\t\tr := []rune(l)\n\t\tif maxW > 1 && len(r) > maxW {\n\t\t\tlines[i] = string(r[:maxW-1]) + "…"\n\t\t}\n\t}\n\treturn strings.Join(lines, "\\n")\n}\n`
    : "";

  return `package ui

${imports}

func RenderApp(w, h int, st Theme, ${leafParams.join(", ")}) string {
${lines.join("\n")}
}
${truncateHelper}`;
}

export function sanitizeModulePath(raw: string): string {
  const trimmed = raw.trim().replace(/[^a-zA-Z0-9._\-/]/g, "");
  return trimmed || "github.com/charm-user/my-tui";
}

function inspectDocCapabilities(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui") {
  const moduleName = sanitizeModulePath(rawModuleName);
  const { rootLeaves, activeOverlays } = collectOrderedLeafBoxes(doc);
  const allBoxes = [...rootLeaves, ...activeOverlays.map((o) => o.node)];

  const usedTypes = new Set<string>();
  for (const n of allBoxes) {
    if (n.contentType) usedTypes.add(n.contentType);
  }

  const usesList = usedTypes.has("bubble:list");
  const usesTable = usedTypes.has("bubble:table");
  const usesViewport = usedTypes.has("bubble:viewport");
  const usesInput = usedTypes.has("bubble:textinput");
  const usesTextarea = usedTypes.has("bubble:textarea");
  const usesProgress = usedTypes.has("bubble:progress");
  const usesSpinner = usedTypes.has("bubble:spinner");
  const usesFilepicker = usedTypes.has("bubble:filepicker");
  const usesPaginator = usedTypes.has("bubble:paginator");
  const usesHelp = usedTypes.has("bubble:help");
  const usesTimer = usedTypes.has("bubble:timer");
  const usesStopwatch = usedTypes.has("bubble:stopwatch");
  const usesDivider = usedTypes.has("lipgloss:divider");
  const usesGlamour = usedTypes.has("glamour:markdown");
  const usesHuh = usedTypes.has("huh:form");
  const usesWish = usedTypes.has("wish:ssh");
  const usesUv = usedTypes.has("uv:screen");
  const usesCellbuf = usedTypes.has("cellbuf:canvas");
  const usesHarmonica =
    allBoxes.some((b) => b.contentType === "bubble:progress" && (b.widgetData?.harmonica?.enabled ?? true)) ||
    doc.overlays.some((o) => o.visible && o.harmonica?.enabled);

  const interactiveWidgets = allBoxes.filter((n) =>
    n.contentType === "bubble:list" ||
    n.contentType === "bubble:table" ||
    n.contentType === "bubble:viewport" ||
    n.contentType === "bubble:textinput" ||
    n.contentType === "bubble:textarea" ||
    n.contentType === "bubble:filepicker" ||
    n.contentType === "bubble:paginator" ||
    n.contentType === "bubble:timer" ||
    n.contentType === "bubble:stopwatch" ||
    n.contentType === "huh:form"
  );

  return {
    moduleName,
    rootLeaves,
    activeOverlays,
    allBoxes,
    usesList,
    usesTable,
    usesViewport,
    usesInput,
    usesTextarea,
    usesProgress,
    usesSpinner,
    usesFilepicker,
    usesPaginator,
    usesHelp,
    usesTimer,
    usesStopwatch,
    usesDivider,
    usesGlamour,
    usesHuh,
    usesWish,
    usesUv,
    usesCellbuf,
    usesHarmonica,
    interactiveWidgets,
  };
}

export function generateThemeGenGoWithSpans(doc: IRDoc): { code: string; spans: CodeSpanMap } {
  const code = `// Code generated by Charm Studio (theme_gen.go)\n\n${generateStylesGo(doc)}`;
  const lines = code.split("\n");
  const spans: CodeSpanMap = {};
  const nodesByStyle = collectNodesByStyle(doc);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const m = /^\/\/\s*@tui:style=([a-zA-Z0-9_-]+)/.exec(trimmed);
    if (!m) continue;
    const styleName = m[1];
    const startLine = i + 1;
    let endLine = startLine;
    let paddingLine: number | undefined;
    let borderLine: number | undefined;
    let colorsLine: number | undefined;

    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      const lineNo = j + 1;
      if (l.includes("Padding(") && paddingLine === undefined) paddingLine = lineNo;
      if (l.includes("Border(") && borderLine === undefined) borderLine = lineNo;
      if (
        (l.includes("BorderForeground(") || l.includes("Foreground(") || l.includes("Background(")) &&
        colorsLine === undefined
      ) {
        colorsLine = lineNo;
      }
      if (l.trimEnd().endsWith(",")) {
        endLine = lineNo;
        break;
      }
      if (l.trim() === "}") {
        endLine = Math.max(startLine, lineNo - 1);
        break;
      }
    }

    const targets = new Set<string>([styleName, ...(nodesByStyle.get(styleName) ?? [])]);
    for (const key of targets) {
      pushSpan(spans, key, { file: "theme_gen.go", startLine, endLine, highlightLine: startLine + 1 });
      if (paddingLine !== undefined) {
        pushSpan(spans, key, { file: "theme_gen.go", startLine, endLine, highlightLine: paddingLine, property: "padding" });
        pushSpan(spans, key, { file: "theme_gen.go", startLine, endLine, highlightLine: paddingLine, property: "padding-v" });
        pushSpan(spans, key, { file: "theme_gen.go", startLine, endLine, highlightLine: paddingLine, property: "padding-h" });
      }
      if (borderLine !== undefined) {
        pushSpan(spans, key, { file: "theme_gen.go", startLine, endLine, highlightLine: borderLine, property: "border" });
      }
      if (colorsLine !== undefined) {
        pushSpan(spans, key, { file: "theme_gen.go", startLine, endLine, highlightLine: colorsLine, property: "colors" });
      }
    }
  }

  return { code, spans };
}

export function generateThemeGenGo(doc: IRDoc): string {
  return generateThemeGenGoWithSpans(doc).code;
}

export function generateLayoutGenGoWithSpans(doc: IRDoc): { code: string; spans: CodeSpanMap } {
  const code = `// Code generated by Charm Studio (layout_gen.go)\n\n${generateLayoutGo(doc)}`;
  const lines = code.split("\n");
  const spans: CodeSpanMap = {};

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const m = /^\/\/\s*@tui:id=([a-zA-Z0-9_-]+)/.exec(trimmed);
    if (!m) continue;
    const nodeId = m[1];
    const startLine = i + 1;
    let endLine = startLine;
    let highlightLine = startLine + 1;

    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      const lineNo = j + 1;
      const t = l.trim();
      if (j > i + 1 && (t.startsWith("// @tui:id=") || t === "}")) {
        break;
      }
      endLine = lineNo;
      if (t.includes(".Render(") || t.includes("lipgloss.JoinHorizontal") || t.includes("lipgloss.JoinVertical")) {
        highlightLine = lineNo;
        if (t.includes(".Render(")) {
          // For overlays, include the following layers = append(...) line if present
          if (lines[j + 1]?.includes("layers = append(")) {
            endLine = lineNo + 1;
          }
          break;
        }
      }
    }

    pushSpan(spans, nodeId, {
      file: "layout_gen.go",
      startLine,
      endLine: Math.max(startLine, endLine),
      highlightLine: Math.min(Math.max(startLine, endLine), highlightLine),
      property: "size",
    });
  }

  return { code, spans };
}

export function generateLayoutGenGo(doc: IRDoc): string {
  return generateLayoutGenGoWithSpans(doc).code;
}

export function generateFixturesPreviewGo(doc: IRDoc): string {
  const { allBoxes, usesList, usesTable } = inspectDocCapabilities(doc);

  const imports: string[] = [];
  if (usesList) imports.push(`"charm.land/bubbles/v2/list"`);
  if (usesTable) imports.push(`"charm.land/bubbles/v2/table"`);

  const initLines: string[] = [];
  for (const node of allBoxes) {
    const pascalBase = toPascal(node.id);
    const ct = node.contentType ?? "text";
    const wd = node.widgetData ?? defaultWidgetData(ct);

    if (ct === "bubble:list") {
      const items = wd.listItems?.length ? wd.listItems : defaultWidgetData("bubble:list").listItems!;
      initLines.push(
        `\tpreview${pascalBase}Items = func() []list.Item {`,
        `\t\treturn []list.Item{`,
        ...items.map((it) => `\t\t\tlistItem{title: ${JSON.stringify(it.title)}, desc: ${JSON.stringify(it.desc)}},`),
        `\t\t}`,
        `\t}`
      );
    } else if (ct === "bubble:table") {
      const cols = wd.tableColumns?.length ? wd.tableColumns : defaultWidgetData("bubble:table").tableColumns!;
      const rows = wd.tableRows ?? defaultWidgetData("bubble:table").tableRows!;
      initLines.push(
        `\tpreview${pascalBase}Rows = func() []table.Row {`,
        `\t\treturn []table.Row{`,
        ...rows.map((r) => `\t\t\t{${cols.map((_, i) => JSON.stringify(r[i] ?? "")).join(", ")}},`),
        `\t\t}`,
        `\t}`
      );
    } else if (ct === "bubble:viewport") {
      const vpText = (node.content ?? "").trim() || "Scrollable viewport content...";
      initLines.push(
        `\tpreview${pascalBase}Content = func() string {`,
        `\t\treturn ${JSON.stringify(vpText)}`,
        `\t}`
      );
    } else if (ct === "huh:form") {
      const fields = wd.huhFields?.length ? wd.huhFields : defaultWidgetData("huh:form").huhFields!;
      let selectIdx = 0;
      for (const f of fields) {
        if (f.kind !== "select" && f.kind !== "multiselect") continue;
        const suffix = selectIdx === 0 ? "Options" : `Select${selectIdx + 1}Options`;
        selectIdx++;
        const opts = f.options?.length ? f.options : ["Option A", "Option B"];
        initLines.push(
          `\tpreview${pascalBase}${suffix} = func() []string {`,
          `\t\treturn []string{${opts.map((o) => JSON.stringify(o)).join(", ")}}`,
          `\t}`
        );
      }
    }
  }

  const importBlock = imports.length > 0
    ? `\nimport (\n${imports.map((s) => `\t${s}`).join("\n")}\n)\n`
    : "\n";

  const initBody = initLines.length > 0
    ? `func init() {\n${initLines.join("\n")}\n}\n`
    : `func init() {}\n`;

  return `//go:build preview

// Code generated by Charm Studio (fixtures_preview_gen.go)
// Run with: go run -tags preview .

package main
${importBlock}${initBody}`;
}

function mapSpinnerTypeExpr(t?: string): string {
  switch (t) {
    case "line": return "spinner.Line";
    case "mini-dot": return "spinner.MiniDot";
    case "jump": return "spinner.Jump";
    case "pulse": return "spinner.Pulse";
    case "points": return "spinner.Points";
    case "globe": return "spinner.Globe";
    case "moon": return "spinner.Moon";
    case "monkey": return "spinner.Monkey";
    default: return "spinner.Dot";
  }
}

function mapHuhThemeFunc(theme?: string): string {
  switch (theme) {
    case "dracula": return "huh.ThemeDracula";
    case "catppuccin": return "huh.ThemeCatppuccin";
    case "base16": return "huh.ThemeBase16";
    default: return "huh.ThemeCharm";
  }
}

function huhValidationSnippet(f: { validation?: string; validationParam?: string; errorMessage?: string }): string {
  const rule = f.validation ?? "none";
  if (rule === "none") return "";
  const errMsg = JSON.stringify(f.errorMessage || "Invalid input");
  if (rule === "required") {
    return `.Validate(func(s string) error { if strings.TrimSpace(s) == "" { return fmt.Errorf(%s) }; return nil })`.replace("%s", errMsg);
  }
  if (rule === "minLength") {
    const minLen = Math.max(1, parseInt(f.validationParam || "3", 10) || 3);
    return `.Validate(func(s string) error { if len(strings.TrimSpace(s)) < ${minLen} { return fmt.Errorf(${errMsg}) }; return nil })`;
  }
  if (rule === "email") {
    return `.Validate(func(s string) error { if !strings.Contains(s, "@") { return fmt.Errorf(${errMsg}) }; return nil })`;
  }
  if (rule === "regex") {
    const pat = JSON.stringify(f.validationParam || ".+");
    return `.Validate(func(s string) error { matched, err := regexp.MatchString(${pat}, s); if err != nil || !matched { return fmt.Errorf(${errMsg}) }; return nil })`;
  }
  return "";
}

export function generateModelGoWithSpans(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): { code: string; spans: CodeSpanMap } {
  const {
    moduleName,
    activeOverlays,
    allBoxes,
    usesList,
    usesTable,
    usesViewport,
    usesInput,
    usesTextarea,
    usesProgress,
    usesSpinner,
    usesFilepicker,
    usesPaginator,
    usesHelp,
    usesTimer,
    usesStopwatch,
    usesHuh,
    usesWish,
    usesHarmonica,
    interactiveWidgets,
  } = inspectDocCapabilities(doc, rawModuleName);

  const hasHuhRegex = allBoxes.some(
    (b) => b.contentType === "huh:form" && (b.widgetData?.huhFields ?? []).some((f) => f.validation === "regex")
  );
  const hasHuhStringValidation = allBoxes.some(
    (b) =>
      b.contentType === "huh:form" &&
      (b.widgetData?.huhFields ?? []).some(
        (f) => f.validation === "required" || f.validation === "minLength" || f.validation === "email"
      )
  );
  const hasHuhMinSelect = allBoxes.some(
    (b) =>
      b.contentType === "huh:form" &&
      (b.widgetData?.huhFields ?? []).some((f) => f.kind === "multiselect" && (f.minSelect ?? 0) > 0)
  );
  const hasHuhValidation = hasHuhRegex || hasHuhStringValidation || hasHuhMinSelect;

  const stdImports: string[] = [];
  if (hasHuhValidation) stdImports.push(`"fmt"`);
  if (hasHuhRegex) stdImports.push(`"regexp"`);
  if (hasHuhStringValidation) stdImports.push(`"strings"`);
  if (usesTimer || usesStopwatch || usesHarmonica) stdImports.push(`"time"`);

  const imports: string[] = [];
  if (usesHelp) imports.push(`"charm.land/bubbles/v2/help"`, `"charm.land/bubbles/v2/key"`);
  if (usesList) imports.push(`"charm.land/bubbles/v2/list"`);
  if (usesPaginator) imports.push(`"charm.land/bubbles/v2/paginator"`);
  if (usesProgress) imports.push(`"charm.land/bubbles/v2/progress"`);
  if (usesSpinner) imports.push(`"charm.land/bubbles/v2/spinner"`);
  if (usesStopwatch) imports.push(`"charm.land/bubbles/v2/stopwatch"`);
  if (usesTable) imports.push(`"charm.land/bubbles/v2/table"`);
  if (usesTextarea) imports.push(`"charm.land/bubbles/v2/textarea"`);
  if (usesInput) imports.push(`"charm.land/bubbles/v2/textinput"`);
  if (usesTimer) imports.push(`"charm.land/bubbles/v2/timer"`);
  if (usesViewport) imports.push(`"charm.land/bubbles/v2/viewport"`);
  if (usesFilepicker) imports.push(`"charm.land/bubbles/v2/filepicker"`);
  imports.push(`tea "charm.land/bubbletea/v2"`);
  if (usesHuh) imports.push(`"charm.land/huh/v2"`);
  if (usesTable || usesSpinner) imports.push(`"charm.land/lipgloss/v2"`);
  if (usesHarmonica) imports.push(`"github.com/charmbracelet/harmonica"`);
  imports.push(`${JSON.stringify(`${moduleName}/ui`)}`);

  const fieldDecls: string[] = [
    `\twidth, height int`,
    `\tisDark        bool`,
    `\ttheme         ui.Theme`,
  ];
  if (interactiveWidgets.length > 1) {
    fieldDecls.push(`\tfocusIdx      int`);
  }

  const fixtureHookVars: string[] = [];
  const initLines: string[] = [];
  const initCmds: string[] = [];
  if (!usesWish) initCmds.push("tea.RequestBackgroundColor");
  if (usesHarmonica) initCmds.push("tickHarmonica()");

  const listItemType = usesList
    ? `\ntype listItem struct{ title, desc string }\nfunc (i listItem) Title() string       { return i.title }\nfunc (i listItem) Description() string { return i.desc }\nfunc (i listItem) FilterValue() string { return i.title }\n`
    : "";

  const helpKeyMapHelper = usesHelp
    ? `\ntype studioHelpMap struct {\n\tbindings []key.Binding\n}\nfunc (k studioHelpMap) ShortHelp() []key.Binding { return k.bindings }\nfunc (k studioHelpMap) FullHelp() [][]key.Binding { return [][]key.Binding{k.bindings} }\n`
    : "";

  let hasHuhSelect = false;

  for (const node of allBoxes) {
    const varBase = toCamel(node.id);
    const pascalBase = toPascal(node.id);
    const ct = node.contentType ?? "text";
    const wd = node.widgetData ?? defaultWidgetData(ct);

    if (ct === "bubble:list") {
      fieldDecls.push(`\t${varBase} list.Model // @tui:id=${node.id}`);
      fixtureHookVars.push(`\tpreview${pascalBase}Items = func() []list.Item { return nil }`);
      const title = wd.listTitle || "Items";
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Del := list.NewDefaultDelegate()`,
      );
      if (wd.listDelegateMode === "compact") {
        initLines.push(`\t${varBase}Del.ShowDescription = false`);
      }
      initLines.push(
        `\t${varBase}Model := list.New(preview${pascalBase}Items(), ${varBase}Del, 28, 16)`,
        `\t${varBase}Model.Title = ${JSON.stringify(title)}`,
        `\t${varBase}Model.SetShowPagination(${wd.listShowPagination ?? true})`,
        `\t${varBase}Model.SetShowStatusBar(${wd.listShowStatusBar ?? true})`
      );
    } else if (ct === "bubble:table") {
      fieldDecls.push(`\t${varBase} table.Model // @tui:id=${node.id}`);
      fixtureHookVars.push(`\tpreview${pascalBase}Rows = func() []table.Row { return nil }`);
      const cols = wd.tableColumns?.length ? wd.tableColumns : defaultWidgetData("bubble:table").tableColumns!;
      const headerFgExpr = wd.tableHeaderFg ? goTokenColorExpr(doc, wd.tableHeaderFg, "", "true") : "";
      const headerBgExpr = wd.tableHeaderBg ? goTokenColorExpr(doc, wd.tableHeaderBg, "", "true") : "";
      const selFgExpr = goTokenColorExpr(doc, wd.tableSelectedFg || "$textMain", "#ffffff", "true");
      const selBgExpr = goTokenColorExpr(doc, wd.tableSelectedBg || "$accent", "#ff5eae", "true");
      let headerChain = `${varBase}Styles.Header`;
      if (wd.tableBorderStyle === "none") {
        headerChain += `.BorderBottom(false)`;
      } else {
        const bExpr =
          wd.tableBorderStyle === "rounded"
            ? "lipgloss.RoundedBorder()"
            : wd.tableBorderStyle === "thick"
            ? "lipgloss.ThickBorder()"
            : "lipgloss.NormalBorder()";
        headerChain += `.BorderStyle(${bExpr})`;
      }
      if (headerFgExpr) headerChain += `.Foreground(lipgloss.Color(${headerFgExpr}))`;
      if (headerBgExpr) headerChain += `.Background(lipgloss.Color(${headerBgExpr}))`;
      headerChain += `.Bold(true)`;

      let selChain = `${varBase}Styles.Selected`;
      if (selFgExpr) selChain += `.Foreground(lipgloss.Color(${selFgExpr}))`;
      if (selBgExpr) selChain += `.Background(lipgloss.Color(${selBgExpr}))`;
      selChain += `.Bold(true)`;

      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Cols := []table.Column{`,
        ...cols.map((c) => `\t\t{Title: ${JSON.stringify(c.title)}, Width: ${c.width}},`),
        `\t}`,
        `\t${varBase}Model := table.New(table.WithColumns(${varBase}Cols), table.WithRows(preview${pascalBase}Rows()), table.WithFocused(true), table.WithHeight(10))`,
        `\t${varBase}Styles := table.DefaultStyles()`,
        `\t${varBase}Styles.Header = ${headerChain}`,
        `\t${varBase}Styles.Selected = ${selChain}`,
        `\t${varBase}Model.SetStyles(${varBase}Styles)`
      );
    } else if (ct === "bubble:viewport") {
      fieldDecls.push(`\t${varBase} viewport.Model // @tui:id=${node.id}`);
      fixtureHookVars.push(`\tpreview${pascalBase}Content = func() string { return "" }`);
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := viewport.New(viewport.WithWidth(60), viewport.WithHeight(16))`,
        `\t${varBase}Model.SetContent(preview${pascalBase}Content())`
      );
    } else if (ct === "bubble:textinput") {
      fieldDecls.push(`\t${varBase} textinput.Model // @tui:id=${node.id}`);
      const placeholder = wd.inputPlaceholder ?? defaultWidgetData("bubble:textinput").inputPlaceholder!;
      const echo = wd.inputEchoMode === "password" ? "EchoPassword" : wd.inputEchoMode === "none" ? "EchoNone" : "EchoNormal";
      const prompt = wd.inputPrompt ?? "> ";
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := textinput.New()`,
        `\t${varBase}Model.Prompt = ${JSON.stringify(prompt)}`,
        `\t${varBase}Model.Placeholder = ${JSON.stringify(placeholder)}`,
        `\t${varBase}Model.EchoMode = textinput.${echo}`,
        `\t${varBase}Model.CharLimit = ${wd.inputCharLimit ?? 0}`,
        `\t${varBase}Model.Focus()`
      );
    } else if (ct === "bubble:textarea") {
      fieldDecls.push(`\t${varBase} textarea.Model // @tui:id=${node.id}`);
      const placeholder = wd.textareaPlaceholder ?? "Write notes...";
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := textarea.New()`,
        `\t${varBase}Model.Placeholder = ${JSON.stringify(placeholder)}`,
        `\t${varBase}Model.ShowLineNumbers = ${wd.textareaShowLineNumbers ?? true}`,
        `\t${varBase}Model.CharLimit = ${wd.textareaCharLimit ?? 500}`,
        `\t${varBase}Model.SetWidth(54)`,
        `\t${varBase}Model.SetHeight(6)`,
        `\t${varBase}Model.Focus()`
      );
    } else if (ct === "bubble:progress") {
      fieldDecls.push(`\t${varBase} progress.Model // @tui:id=${node.id}`);
      fieldDecls.push(`\t${varBase}Percent float64`);
      const useHarm = wd.harmonica?.enabled ?? true;
      if (useHarm) {
        fieldDecls.push(
          `\t${varBase}Target float64`,
          `\t${varBase}Spring harmonica.Spring`,
          `\t${varBase}Vel float64`
        );
      }
      const opts: string[] = [];
      if (wd.progressMode === "solid") {
        opts.push(`progress.WithSolidFill(${goTokenColorExpr(doc, wd.progressStartColor, "#ff5eae", "true")})`);
      } else {
        opts.push(
          `progress.WithGradient(${goTokenColorExpr(doc, wd.progressStartColor, "#ff5eae", "true")}, ${goTokenColorExpr(doc, wd.progressEndColor, "#6dffc2", "true")})`
        );
      }
      if (wd.progressShowPercent === false) {
        opts.push(`progress.WithoutPercentage()`);
      }
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := progress.New(${opts.join(", ")})`
      );
      if (useHarm) {
        initLines.push(
          `\t${varBase}SpringVal := harmonica.NewSpring(harmonica.FPS(60), ${wd.harmonica?.frequency ?? 6.0}, ${wd.harmonica?.damping ?? 0.7})`
        );
      }
    } else if (ct === "bubble:spinner") {
      fieldDecls.push(`\t${varBase} spinner.Model // @tui:id=${node.id}`);
      const spinExpr = goTokenColorExpr(doc, wd.spinnerColor || "$accent", "#ff5eae", "true");
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := spinner.New()`,
        `\t${varBase}Model.Spinner = ${mapSpinnerTypeExpr(wd.spinnerType)}`,
        `\t${varBase}Model.Style = lipgloss.NewStyle().Foreground(lipgloss.Color(${spinExpr}))`
      );
      initCmds.push(`m.${varBase}.Tick`);
    } else if (ct === "bubble:filepicker") {
      fieldDecls.push(`\t${varBase} filepicker.Model // @tui:id=${node.id}`);
      const allowed = wd.fpAllowedExts ?? [".go", ".md", ".json"];
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := filepicker.New()`,
        `\t${varBase}Model.AllowedTypes = []string{${allowed.map((e) => JSON.stringify(e)).join(", ")}}`,
        `\t${varBase}Model.ShowPermissions = ${wd.fpShowPermissions ?? true}`,
        `\t${varBase}Model.ShowSize = ${wd.fpShowSize ?? true}`,
        `\t${varBase}Model.CurrentDirectory = ${JSON.stringify(wd.fpCurrentDir || ".")}`
      );
      initCmds.push(`m.${varBase}.Init()`);
    } else if (ct === "bubble:paginator") {
      fieldDecls.push(`\t${varBase} paginator.Model // @tui:id=${node.id}`);
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := paginator.New()`,
        `\t${varBase}Model.Type = ${wd.paginatorType === "arabic" ? "paginator.Arabic" : "paginator.Dots"}`,
        `\t${varBase}Model.PerPage = ${wd.paginatorPerPage ?? 10}`,
        `\t${varBase}Model.TotalPages = ${wd.paginatorTotalPages ?? 5}`,
        `\t${varBase}Model.Page = ${Math.max(0, (wd.paginatorPage ?? 1) - 1)}`
      );
    } else if (ct === "bubble:help") {
      fieldDecls.push(`\t${varBase} help.Model // @tui:id=${node.id}`);
      fieldDecls.push(`\t${varBase}Keys studioHelpMap`);
      const bindings = wd.helpBindings?.length ? wd.helpBindings : defaultWidgetData("bubble:help").helpBindings!;
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := help.New()`,
        `\t${varBase}Model.ShowAll = ${wd.helpShowAll ?? false}`,
        `\t${varBase}KeysMap := studioHelpMap{bindings: []key.Binding{`,
        ...bindings.map((b) => `\t\tkey.NewBinding(key.WithKeys(${JSON.stringify(b.key)}), key.WithHelp(${JSON.stringify(b.key)}, ${JSON.stringify(b.desc)})),`),
        `\t}}`
      );
    } else if (ct === "bubble:timer") {
      fieldDecls.push(`\t${varBase} timer.Model // @tui:id=${node.id}`);
      const dur = Math.max(1, wd.timerDurationSec ?? 90);
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := timer.NewWithInterval(${dur}*time.Second, time.Second)`
      );
      if (wd.timerAutoStart !== false) initCmds.push(`m.${varBase}.Init()`);
    } else if (ct === "bubble:stopwatch") {
      fieldDecls.push(`\t${varBase} stopwatch.Model // @tui:id=${node.id}`);
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := stopwatch.NewWithInterval(100 * time.Millisecond)`
      );
      if (wd.timerAutoStart !== false) initCmds.push(`m.${varBase}.Init()`);
    } else if (ct === "huh:form") {
      fieldDecls.push(`\t${varBase} *huh.Form // @tui:id=${node.id}`);
      const fields = wd.huhFields?.length ? wd.huhFields : defaultWidgetData("huh:form").huhFields!;
      let selectIdx = 0;
      const groupsMap = new Map<number, string[]>();
      for (const f of fields) {
        const gIdx = Math.max(0, f.group ?? 0);
        const bucket = groupsMap.get(gIdx) ?? [];
        if (f.kind === "select") {
          hasHuhSelect = true;
          const suffix = selectIdx === 0 ? "Options" : `Select${selectIdx + 1}Options`;
          selectIdx++;
          fixtureHookVars.push(`\tpreview${pascalBase}${suffix} = func() []string { return nil }`);
          const filt = f.filterable ? `.Filtering(true)` : "";
          bucket.push(`\t\t\thuh.NewSelect[string]().Title(${JSON.stringify(f.label)}).Options(toHuhOptions(preview${pascalBase}${suffix}())...)${filt},`);
        } else if (f.kind === "multiselect") {
          hasHuhSelect = true;
          const suffix = selectIdx === 0 ? "Options" : `Select${selectIdx + 1}Options`;
          selectIdx++;
          fixtureHookVars.push(`\tpreview${pascalBase}${suffix} = func() []string { return nil }`);
          const limit = f.maxSelect ? `.Limit(${f.maxSelect})` : "";
          const minMsg = JSON.stringify(f.errorMessage || `Select at least ${f.minSelect}`);
          const minVal = f.minSelect && f.minSelect > 0
            ? `.Validate(func(vals []string) error { if len(vals) < ${f.minSelect} { return fmt.Errorf(${minMsg}) }; return nil })`
            : "";
          bucket.push(`\t\t\thuh.NewMultiSelect[string]().Title(${JSON.stringify(f.label)}).Options(toHuhOptions(preview${pascalBase}${suffix}())...)${limit}${minVal},`);
        } else if (f.kind === "text") {
          const ch = f.charLimit ? `.CharLimit(${f.charLimit})` : "";
          const ln = f.lineLimit ? `.Lines(${f.lineLimit})` : "";
          bucket.push(`\t\t\thuh.NewText().Title(${JSON.stringify(f.label)}).Placeholder(${JSON.stringify(f.placeholder || "")})${ch}${ln},`);
        } else if (f.kind === "note") {
          bucket.push(`\t\t\thuh.NewNote().Title(${JSON.stringify(f.label)}).Description(${JSON.stringify(f.description ?? "")}),`);
        } else if (f.kind === "confirm") {
          bucket.push(`\t\t\thuh.NewConfirm().Title(${JSON.stringify(f.label)}),`);
        } else {
          const val = huhValidationSnippet(f);
          bucket.push(`\t\t\thuh.NewInput().Title(${JSON.stringify(f.label)}).Placeholder(${JSON.stringify(f.placeholder || "")})${val},`);
        }
        groupsMap.set(gIdx, bucket);
      }
      const sortedGroupKeys = [...groupsMap.keys()].sort((a, b) => a - b);
      const groupBlocks: string[] = [];
      for (const gk of sortedGroupKeys) {
        const gName = wd.huhGroupNames?.[gk];
        if (gName) {
          groupBlocks.push(`\t\thuh.NewGroup( // ${gName}`, ...(groupsMap.get(gk) ?? []), `\t\t),`);
        } else {
          groupBlocks.push(`\t\thuh.NewGroup(`, ...(groupsMap.get(gk) ?? []), `\t\t),`);
        }
      }
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Form := huh.NewForm(`,
        ...groupBlocks,
        `\t).WithTheme(huh.ThemeFunc(${mapHuhThemeFunc(wd.huhTheme)}))`
      );
      initCmds.push(`m.${varBase}.Init()`);
    }
  }

  for (const ov of activeOverlays) {
    if (!ov.harmonica?.enabled) continue;
    const ovVar = `${toCamel(ov.node.id)}Ov`;
    fieldDecls.push(
      `\t${ovVar}Spring harmonica.Spring`,
      `\t${ovVar}Offset float64`,
      `\t${ovVar}Vel    float64`
    );
    initLines.push(
      `\t${ovVar}SpringVal := harmonica.NewSpring(harmonica.FPS(60), ${ov.harmonica.frequency ?? 6.0}, ${ov.harmonica.damping ?? 0.72})`
    );
  }

  const huhOptionsHelper = hasHuhSelect
    ? `\nfunc toHuhOptions(vals []string) []huh.Option[string] {\n\tif len(vals) == 0 {\n\t\treturn []huh.Option[string]{huh.NewOption("Default", "default")}\n\t}\n\tout := make([]huh.Option[string], 0, len(vals))\n\tfor _, v := range vals {\n\t\tout = append(out, huh.NewOption(v, v))\n\t}\n\treturn out\n}\n`
    : "";

  const harmonicaHelper = usesHarmonica
    ? `\ntype harmonicaTickMsg time.Time\n\nfunc tickHarmonica() tea.Cmd {\n\treturn tea.Tick(time.Second/60, func(t time.Time) tea.Msg {\n\t\treturn harmonicaTickMsg(t)\n\t})\n}\n`
    : "";

  const fixtureHookBlock = fixtureHookVars.length > 0
    ? `\n// Overridden by fixtures_preview_gen.go when built with -tags preview\nvar (\n${fixtureHookVars.join("\n")}\n)\n`
    : "";

  const modelStructInitPairs: string[] = [];
  for (const n of allBoxes) {
    const varBase = toCamel(n.id);
    const ct = n.contentType ?? "text";
    const wd = n.widgetData ?? defaultWidgetData(ct);
    if (ct === "huh:form") {
      modelStructInitPairs.push(`\t\t${varBase}: ${varBase}Form,`);
    } else if (ct === "bubble:progress") {
      const targetNum = Math.max(0, Math.min(100, wd.progressPercent ?? 68)) / 100;
      const useHarm = wd.harmonica?.enabled ?? true;
      const startNum = useHarm ? Math.max(0, targetNum - 0.25) : targetNum;
      modelStructInitPairs.push(`\t\t${varBase}: ${varBase}Model,`, `\t\t${varBase}Percent: ${startNum.toFixed(2)},`);
      if (useHarm) {
        modelStructInitPairs.push(
          `\t\t${varBase}Target: ${targetNum.toFixed(2)},`,
          `\t\t${varBase}Spring: ${varBase}SpringVal,`
        );
      }
    } else if (ct === "bubble:help") {
      modelStructInitPairs.push(`\t\t${varBase}: ${varBase}Model,`, `\t\t${varBase}Keys: ${varBase}KeysMap,`);
    } else if (
      [
        "bubble:list",
        "bubble:table",
        "bubble:viewport",
        "bubble:textinput",
        "bubble:textarea",
        "bubble:spinner",
        "bubble:filepicker",
        "bubble:paginator",
        "bubble:timer",
        "bubble:stopwatch",
      ].includes(ct)
    ) {
      modelStructInitPairs.push(`\t\t${varBase}: ${varBase}Model,`);
    }
  }
  for (const ov of activeOverlays) {
    if (!ov.harmonica?.enabled) continue;
    const ovVar = `${toCamel(ov.node.id)}Ov`;
    modelStructInitPairs.push(
      `\t\t${ovVar}Spring: ${ovVar}SpringVal,`,
      `\t\t${ovVar}Offset: 12.0,`
    );
  }

  const initReturn = initCmds.length === 0
    ? "return nil"
    : initCmds.length === 1
    ? `return ${initCmds[0]}`
    : `return tea.Batch(${initCmds.join(", ")})`;

  const importBlock = stdImports.length > 0
    ? `${stdImports.map((s) => `\t${s}`).join("\n")}\n\n${imports.map((s) => `\t${s}`).join("\n")}`
    : imports.map((s) => `\t${s}`).join("\n");

  const code = `package main

import (
${importBlock}
)
${harmonicaHelper}${listItemType}${helpKeyMapHelper}${huhOptionsHelper}${fixtureHookBlock}
type model struct {
${fieldDecls.join("\n")}
}

func newModel(theme ui.Theme) model {
${initLines.join("\n")}
\treturn model{
\t\tisDark: true,
\t\ttheme:  theme,
${modelStructInitPairs.join("\n")}
\t}
}

func (m model) Init() tea.Cmd {
\t${initReturn}
}
`;

  const lines = code.split("\n");
  const spans: CodeSpanMap = {};
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const m = /^\/\/\s*@tui:id=([a-zA-Z0-9_-]+)/.exec(t);
    if (!m) continue;
    const nodeId = m[1];
    const startLine = i + 1;
    let endLine = startLine;
    for (let j = i + 1; j < lines.length; j++) {
      const jt = lines[j].trim();
      if (jt.startsWith("// @tui:id=") || jt.startsWith("return model{")) {
        break;
      }
      endLine = j + 1;
    }
    pushSpan(spans, nodeId, {
      file: "model.go",
      startLine,
      endLine,
      highlightLine: Math.min(endLine, startLine + 1),
      property: "widget",
    });
  }

  return { code, spans };
}

export function generateModelGo(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): string {
  return generateModelGoWithSpans(doc, rawModuleName).code;
}

export function generateUpdateGoWithSpans(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): { code: string; spans: CodeSpanMap } {
  const {
    moduleName,
    activeOverlays,
    allBoxes,
    usesHuh,
    usesWish,
    usesHelp,
    usesHarmonica,
    interactiveWidgets,
  } = inspectDocCapabilities(doc, rawModuleName);

  const stdImports: string[] = [];
  if (usesHarmonica) stdImports.push(`"math"`);

  const imports: string[] = [`tea "charm.land/bubbletea/v2"`];
  if (usesHuh) imports.push(`"charm.land/huh/v2"`);
  if (!usesWish) imports.push(`${JSON.stringify(`${moduleName}/ui`)}`);

  const bgWidgetUpdates: string[] = [];
  let updateUsesLipgloss = false;
  let updateUsesTable = false;
  let updateUsesProgress = false;
  for (const node of allBoxes) {
    const varBase = toCamel(node.id);
    const ct = node.contentType ?? "text";
    const wd = node.widgetData ?? defaultWidgetData(ct);
    if (ct === "bubble:spinner" && isTokenRef(wd.spinnerColor || "$accent")) {
      updateUsesLipgloss = true;
      bgWidgetUpdates.push(`\t\tm.${varBase}.Style = lipgloss.NewStyle().Foreground(lipgloss.Color(${goTokenColorExpr(doc, wd.spinnerColor || "$accent", "#ff5eae", "m.isDark")}))`);
    } else if (ct === "bubble:table" && (isTokenRef(wd.tableHeaderFg) || isTokenRef(wd.tableHeaderBg) || isTokenRef(wd.tableSelectedFg || "$textMain") || isTokenRef(wd.tableSelectedBg || "$accent"))) {
      updateUsesLipgloss = true;
      updateUsesTable = true;
      const bExpr = wd.tableBorderStyle === "rounded" ? "lipgloss.RoundedBorder()" : wd.tableBorderStyle === "thick" ? "lipgloss.ThickBorder()" : "lipgloss.NormalBorder()";
      let hChain = `${varBase}St.Header`;
      hChain += wd.tableBorderStyle === "none" ? `.BorderBottom(false)` : `.BorderStyle(${bExpr})`;
      if (wd.tableHeaderFg) hChain += `.Foreground(lipgloss.Color(${goTokenColorExpr(doc, wd.tableHeaderFg, "", "m.isDark")}))`;
      if (wd.tableHeaderBg) hChain += `.Background(lipgloss.Color(${goTokenColorExpr(doc, wd.tableHeaderBg, "", "m.isDark")}))`;
      hChain += `.Bold(true)`;
      const sChain = `${varBase}St.Selected.Foreground(lipgloss.Color(${goTokenColorExpr(doc, wd.tableSelectedFg || "$textMain", "#ffffff", "m.isDark")})).Background(lipgloss.Color(${goTokenColorExpr(doc, wd.tableSelectedBg || "$accent", "#ff5eae", "m.isDark")})).Bold(true)`;
      bgWidgetUpdates.push(
        `\t\t${varBase}St := table.DefaultStyles()`,
        `\t\t${varBase}St.Header = ${hChain}`,
        `\t\t${varBase}St.Selected = ${sChain}`,
        `\t\tm.${varBase}.SetStyles(${varBase}St)`
      );
    } else if (ct === "bubble:progress" && (isTokenRef(wd.progressStartColor) || isTokenRef(wd.progressEndColor))) {
      updateUsesProgress = true;
      const opts: string[] = [];
      if (wd.progressMode === "solid") {
        opts.push(`progress.WithSolidFill(${goTokenColorExpr(doc, wd.progressStartColor, "#ff5eae", "m.isDark")})`);
      } else {
        opts.push(`progress.WithGradient(${goTokenColorExpr(doc, wd.progressStartColor, "#ff5eae", "m.isDark")}, ${goTokenColorExpr(doc, wd.progressEndColor, "#6dffc2", "m.isDark")})`);
      }
      if (wd.progressShowPercent === false) opts.push(`progress.WithoutPercentage()`);
      bgWidgetUpdates.push(
        `\t\t${varBase}PrevW := m.${varBase}.Width()`,
        `\t\tm.${varBase} = progress.New(${opts.join(", ")})`,
        `\t\tif ${varBase}PrevW > 0 { m.${varBase}.SetWidth(${varBase}PrevW) }`
      );
    }
  }
  if (!usesWish) {
    if (updateUsesProgress) imports.push(`"charm.land/bubbles/v2/progress"`);
    if (updateUsesTable) imports.push(`"charm.land/bubbles/v2/table"`);
    if (updateUsesLipgloss) imports.push(`"charm.land/lipgloss/v2"`);
  }

  const resizeLines: string[] = [];
  for (const node of allBoxes) {
    const varBase = toCamel(node.id);
    const ct = node.contentType ?? "text";
    if (ct === "bubble:list") {
      resizeLines.push(`\t\tm.${varBase}.SetSize(max(16, msg.Width/3), max(6, msg.Height-4))`);
    } else if (ct === "bubble:table") {
      resizeLines.push(`\t\tm.${varBase}.SetWidth(max(16, msg.Width-6))`);
      resizeLines.push(`\t\tm.${varBase}.SetHeight(max(4, msg.Height-6))`);
    } else if (ct === "bubble:viewport") {
      resizeLines.push(
        `\t\tm.${varBase}.SetWidth(max(12, msg.Width-6))`,
        `\t\tm.${varBase}.SetHeight(max(4, msg.Height-6))`
      );
    } else if (ct === "bubble:textinput") {
      resizeLines.push(`\t\tm.${varBase}.SetWidth(max(10, msg.Width-8))`);
    } else if (ct === "bubble:textarea") {
      resizeLines.push(`\t\tm.${varBase}.SetWidth(max(12, msg.Width-8))`);
      resizeLines.push(`\t\tm.${varBase}.SetHeight(max(4, msg.Height/3))`);
    } else if (ct === "bubble:progress") {
      resizeLines.push(`\t\tm.${varBase}.SetWidth(max(12, msg.Width-8))`);
    } else if (ct === "bubble:filepicker") {
      resizeLines.push(`\t\tm.${varBase}.SetHeight(max(4, msg.Height-6))`);
    } else if (ct === "bubble:help") {
      resizeLines.push(`\t\tm.${varBase}.SetWidth(max(16, msg.Width-4))`);
    } else if (ct === "huh:form") {
      resizeLines.push(`\t\tm.${varBase}.WithWidth(max(20, msg.Width-6))`);
      resizeLines.push(`\t\tm.${varBase}.WithHeight(max(6, msg.Height-4))`);
    }
  }

  const keyCases: string[] = [];
  if (usesHelp) {
    const firstHelp = allBoxes.find((b) => b.contentType === "bubble:help");
    if (firstHelp) {
      const varBase = toCamel(firstHelp.id);
      keyCases.push(`\t\tcase "?":\n\t\t\tm.${varBase}.ShowAll = !m.${varBase}.ShowAll`);
    }
  }

  const updateRoutes: string[] = [];
  interactiveWidgets.forEach((node, idx) => {
    const varBase = toCamel(node.id);
    const ct = node.contentType!;
    const guard = interactiveWidgets.length > 1 ? `if m.focusIdx == ${idx} {\n\t\t` : "";
    const endGuard = interactiveWidgets.length > 1 ? "\n\t}" : "";
    if (ct === "huh:form") {
      updateRoutes.push(
        `// @tui:id=${node.id}\n\t${guard}if f, cmd := m.${varBase}.Update(msg); f != nil {\n\t\t\tif form, ok := f.(*huh.Form); ok {\n\t\t\t\tm.${varBase} = form\n\t\t\t}\n\t\t\tcmds = append(cmds, cmd)\n\t\t}${endGuard}`
      );
    } else if (ct === "bubble:timer" || ct === "bubble:stopwatch") {
      updateRoutes.push(`// @tui:id=${node.id}\n\tvar ${varBase}Cmd tea.Cmd\n\tm.${varBase}, ${varBase}Cmd = m.${varBase}.Update(msg)\n\tcmds = append(cmds, ${varBase}Cmd)`);
    } else {
      updateRoutes.push(`// @tui:id=${node.id}\n\t${guard}var ${varBase}Cmd tea.Cmd\n\t\tm.${varBase}, ${varBase}Cmd = m.${varBase}.Update(msg)\n\t\tcmds = append(cmds, ${varBase}Cmd)${endGuard}`);
    }
  });

  // Ensure animated spinners update regardless of focus
  for (const node of allBoxes) {
    if (node.contentType !== "bubble:spinner") continue;
    const varBase = toCamel(node.id);
    updateRoutes.push(`// @tui:id=${node.id}\n\tvar ${varBase}Cmd tea.Cmd\n\tm.${varBase}, ${varBase}Cmd = m.${varBase}.Update(msg)\n\tcmds = append(cmds, ${varBase}Cmd)`);
  }

  const harmonicaSteps: string[] = [];
  if (usesHarmonica) {
    for (const node of allBoxes) {
      if (node.contentType !== "bubble:progress" || !(node.widgetData?.harmonica?.enabled ?? true)) continue;
      const varBase = toCamel(node.id);
      harmonicaSteps.push(
        `\t\tm.${varBase}Percent, m.${varBase}Vel = m.${varBase}Spring.Update(m.${varBase}Percent, m.${varBase}Vel, m.${varBase}Target)`,
        `\t\tif math.Abs(m.${varBase}Target-m.${varBase}Percent) > 0.001 || math.Abs(m.${varBase}Vel) > 0.001 {`,
        `\t\t\tanimating = true`,
        `\t\t}`
      );
    }
    for (const ov of activeOverlays) {
      if (!ov.harmonica?.enabled) continue;
      const ovVar = `${toCamel(ov.node.id)}Ov`;
      harmonicaSteps.push(
        `\t\tm.${ovVar}Offset, m.${ovVar}Vel = m.${ovVar}Spring.Update(m.${ovVar}Offset, m.${ovVar}Vel, 0)`,
        `\t\tif math.Abs(m.${ovVar}Offset) > 0.05 || math.Abs(m.${ovVar}Vel) > 0.05 {`,
        `\t\t\tanimating = true`,
        `\t\t}`
      );
    }
  }
  const harmonicaCase = usesHarmonica
    ? `\n\tcase harmonicaTickMsg:\n\t\tanimating := false\n${harmonicaSteps.join("\n")}\n\t\tif animating {\n\t\t\tcmds = append(cmds, tickHarmonica())\n\t\t}`
    : "";

  const focusTabCase = interactiveWidgets.length > 1
    ? `\t\tcase "tab":\n\t\t\tm.focusIdx = (m.focusIdx + 1) % ${interactiveWidgets.length}\n\t\tcase "shift+tab":\n\t\t\tm.focusIdx = (m.focusIdx + ${interactiveWidgets.length - 1}) % ${interactiveWidgets.length}\n`
    : "";

  const importBlock = stdImports.length > 0
    ? `${stdImports.map((s) => `\t${s}`).join("\n")}\n\n${imports.map((s) => `\t${s}`).join("\n")}`
    : imports.map((s) => `\t${s}`).join("\n");

  const bgColorCase = !usesWish
    ? `\n\tcase tea.BackgroundColorMsg:\n\t\tm.isDark = msg.IsDark()\n\t\tm.theme = ui.NewTheme(m.isDark)${bgWidgetUpdates.length > 0 ? "\n" + bgWidgetUpdates.join("\n") : ""}`
    : "";

  const code = `package main

import (
${importBlock}
)

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
\tvar cmds []tea.Cmd
\tswitch msg := msg.(type) {
\tcase tea.WindowSizeMsg:
\t\tm.width, m.height = msg.Width, msg.Height
${resizeLines.join("\n")}${bgColorCase}${harmonicaCase}
\tcase tea.KeyPressMsg:
\t\tswitch msg.String() {
\t\tcase "ctrl+c":
\t\t\treturn m, tea.Quit
${keyCases.join("\n")}${focusTabCase}\t\t}
\t}
${updateRoutes.length > 0 ? updateRoutes.map((r) => `\t${r}`).join("\n") + "\n" : ""}\treturn m, tea.Batch(cmds...)
}
`;

  const lines = code.split("\n");
  const spans: CodeSpanMap = {};
  let keyCaseStart = 1;
  let keyCaseEnd = 1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("case tea.KeyPressMsg:")) {
      keyCaseStart = i + 1;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "}") {
          keyCaseEnd = j + 1;
          break;
        }
      }
      break;
    }
  }
  pushSpan(spans, "keybinding", {
    file: "update.go",
    startLine: keyCaseStart,
    endLine: keyCaseEnd,
    highlightLine: keyCaseStart,
    property: "keybinding",
  });

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const m = /^\/\/\s*@tui:id=([a-zA-Z0-9_-]+)/.exec(t);
    if (!m) continue;
    const nodeId = m[1];
    const startLine = i + 1;
    let endLine = startLine;
    let highlightLine = startLine + 1;
    for (let j = i + 1; j < lines.length; j++) {
      const jt = lines[j].trim();
      if (jt.startsWith("// @tui:id=") || jt.startsWith("return m,")) {
        break;
      }
      if (jt.includes(".Update(msg)")) {
        highlightLine = j + 1;
      }
      endLine = j + 1;
    }
    pushSpan(spans, nodeId, {
      file: "update.go",
      startLine,
      endLine,
      highlightLine,
      property: "keybinding",
    });
  }

  return { code, spans };
}

export function generateUpdateGo(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): string {
  return generateUpdateGoWithSpans(doc, rawModuleName).code;
}

export function generateViewGoWithSpans(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): { code: string; spans: CodeSpanMap } {
  const { moduleName, activeOverlays, allBoxes, usesGlamour, usesDivider, usesUv, usesCellbuf } =
    inspectDocCapabilities(doc, rawModuleName);

  const harmonicaOverlays = activeOverlays.filter((o) => Boolean(o.harmonica?.enabled));
  let usesColorPkg = false;
  let usesHexHelper = false;
  let usesStrconv = false;
  const uvHelpers: string[] = [];
  const cellbufHelpers: string[] = [];

  const colorExprForCanvas = (ref: string | undefined, fallback: string): string | null => {
    if (!ref && !fallback) return null;
    if (isTokenRef(ref)) {
      usesColorPkg = true;
      usesHexHelper = true;
      usesStrconv = true;
      return `hexToColorRGBA(ui.ResolveTokenColor(isDark, ${JSON.stringify(ref)}, ${JSON.stringify(fallback)}))`;
    }
    const lit = hexToColorRGBAExpr(resolveDocColorHex(doc, ref, fallback));
    if (lit) {
      usesColorPkg = true;
      return lit;
    }
    return null;
  };

  const viewArgs: string[] = [];
  let firstTextInputId: string | null = null;
  for (const node of allBoxes) {
    const varBase = toCamel(node.id);
    const pascalBase = toPascal(node.id);
    const ct = node.contentType ?? "text";
    const wd = node.widgetData ?? defaultWidgetData(ct);
    if (ct === "bubble:textinput" && !firstTextInputId) {
      firstTextInputId = varBase;
    }
    if (
      ct === "bubble:list" ||
      ct === "bubble:table" ||
      ct === "bubble:viewport" ||
      ct === "bubble:textinput" ||
      ct === "bubble:textarea" ||
      ct === "bubble:spinner" ||
      ct === "bubble:filepicker" ||
      ct === "bubble:paginator" ||
      ct === "bubble:timer" ||
      ct === "bubble:stopwatch" ||
      ct === "huh:form"
    ) {
      viewArgs.push(`m.${varBase}.View()`);
    } else if (ct === "bubble:progress") {
      viewArgs.push(`m.${varBase}.ViewAs(m.${varBase}Percent)`);
    } else if (ct === "bubble:help") {
      viewArgs.push(`m.${varBase}.View(m.${varBase}Keys)`);
    } else if (ct === "glamour:markdown") {
      const theme = wd.glamourTheme ?? "dark";
      viewArgs.push(`renderMarkdown(${JSON.stringify(node.content ?? "# Hello Glamour")}, ${JSON.stringify(theme)})`);
    } else if (ct === "lipgloss:divider") {
      viewArgs.push(`renderDivider(${JSON.stringify(wd.dividerOrientation ?? "horizontal")}, ${JSON.stringify(wd.dividerChar ?? "─")}, ${JSON.stringify(wd.dividerLabel ?? node.content ?? "")})`);
    } else if (ct === "uv:screen") {
      const fnName = `renderUvScreen${pascalBase}`;
      const wArg = node.width?.mode === "fixed" ? `${Math.max(8, node.width.value ?? 36)}` : `max(8, m.width-4)`;
      const hArg = node.height?.mode === "fixed" ? `${Math.max(3, node.height.value ?? 8)}` : `max(3, m.height-4)`;
      const hasTokenColors = (wd.uvCommands ?? []).some((c) => isTokenRef(c.fg) || isTokenRef(c.bg));
      viewArgs.push(hasTokenColors ? `${fnName}(${wArg}, ${hArg}, m.isDark)` : `${fnName}(${wArg}, ${hArg})`);
      const body: string[] = [
        `\tbuf := uv.NewScreenBuffer(w, h)`,
      ];
      for (const cmd of wd.uvCommands ?? []) {
        const fgRgba = colorExprForCanvas(cmd.fg, "");
        const bgRgba = colorExprForCanvas(cmd.bg, "");
        const styleParts: string[] = [];
        if (fgRgba) styleParts.push(`Fg: ${fgRgba}`);
        if (bgRgba) styleParts.push(`Bg: ${bgRgba}`);
        if (cmd.bold) styleParts.push(`Attrs: uv.AttrBold`);
        const styleExpr = styleParts.length > 0 ? `uv.Style{${styleParts.join(", ")}}` : `uv.Style{}`;

        if (cmd.op === "fillRect") {
          const glyph = Array.from(cmd.text || " ")[0] || " ";
          const rw = Math.max(1, cmd.w ?? 6);
          const rh = Math.max(1, cmd.h ?? 3);
          body.push(
            `\tfor y := max(0, ${cmd.y}); y < min(h, ${cmd.y + rh}); y++ {`,
            `\t\tfor x := max(0, ${cmd.x}); x < min(w, ${cmd.x + rw}); x++ {`,
            `\t\t\tbuf.SetCell(x, y, &uv.Cell{Content: ${JSON.stringify(glyph)}, Width: 1, Style: ${styleExpr}})`,
            `\t\t}`,
            `\t}`
          );
        } else if (cmd.op === "drawText") {
          const textVal = cmd.text || "";
          body.push(
            `\tif ${cmd.y} >= 0 && ${cmd.y} < h {`,
            `\t\tfor i, r := range []rune(${JSON.stringify(textVal)}) {`,
            `\t\t\tx := ${cmd.x} + i`,
            `\t\t\tif x >= 0 && x < w {`,
            `\t\t\t\tbuf.SetCell(x, ${cmd.y}, &uv.Cell{Content: string(r), Width: 1, Style: ${styleExpr}})`,
            `\t\t\t}`,
            `\t\t}`,
            `\t}`
          );
        } else if (cmd.op === "setCell") {
          const glyph = Array.from(cmd.text || "✦")[0] || "✦";
          body.push(
            `\tif ${cmd.x} >= 0 && ${cmd.x} < w && ${cmd.y} >= 0 && ${cmd.y} < h {`,
            `\t\tbuf.SetCell(${cmd.x}, ${cmd.y}, &uv.Cell{Content: ${JSON.stringify(glyph)}, Width: 1, Style: ${styleExpr}})`,
            `\t}`
          );
        }
      }
      if (wd.uvShowCursor !== false) {
        const cx = Math.max(0, wd.uvCursorX ?? 14);
        const cy = Math.max(0, wd.uvCursorY ?? 4);
        body.push(
          `\tcx, cy := min(w-1, ${cx}), min(h-1, ${cy})`,
          `\tif cur := buf.CellAt(cx, cy); cur != nil {`,
          `\t\tcpy := *cur`,
          `\t\tcpy.Style.Attrs |= uv.AttrReverse`,
          `\t\tbuf.SetCell(cx, cy, &cpy)`,
          `\t} else {`,
          `\t\tbuf.SetCell(cx, cy, &uv.Cell{Content: " ", Width: 1, Style: uv.Style{Attrs: uv.AttrReverse}})`,
          `\t}`
        );
      }
      body.push(`\treturn strings.TrimRight(buf.Render(), "\\n")`);
      const sig = hasTokenColors ? `(w, h int, isDark bool)` : `(w, h int)`;
      uvHelpers.push(`func ${fnName}${sig} string {\n${body.join("\n")}\n}`);
    } else if (ct === "cellbuf:canvas") {
      const fnName = `renderCellbufCanvas${pascalBase}`;
      const wArg = node.width?.mode === "fixed" ? `${Math.max(8, node.width.value ?? 36)}` : `max(8, m.width-4)`;
      const hArg = node.height?.mode === "fixed" ? `${Math.max(3, node.height.value ?? 8)}` : `max(3, m.height-4)`;
      const hasTokenColors = (wd.cellbufLayers ?? []).some((l) => isTokenRef(l.fg) || isTokenRef(l.bg));
      viewArgs.push(hasTokenColors ? `${fnName}(${wArg}, ${hArg}, m.isDark)` : `${fnName}(${wArg}, ${hArg})`);
      const body: string[] = [
        `\tbuf := cellbuf.NewBuffer(w, h)`,
      ];
      for (const layer of wd.cellbufLayers ?? []) {
        const defaultFg =
          layer.shape === "checker"
            ? "#414868"
            : layer.shape === "box"
            ? "#b9a2ff"
            : layer.shape === "line"
            ? "#ff5eae"
            : "#6dffc2";
        const fgRgba = colorExprForCanvas(layer.fg, defaultFg);
        const bgRgba = colorExprForCanvas(layer.bg, "");
        const styleParts: string[] = [];
        if (fgRgba) styleParts.push(`Fg: ${fgRgba}`);
        if (bgRgba) styleParts.push(`Bg: ${bgRgba}`);
        const styleExpr = styleParts.length > 0 ? `cellbuf.Style{${styleParts.join(", ")}}` : `cellbuf.Style{}`;

        if (layer.shape === "checker") {
          const ch = Array.from(layer.borderChar || "░")[0] || "░";
          const codePt = ch.codePointAt(0) ?? 0x2591;
          body.push(
            `\tfor y := max(0, ${layer.y}); y < min(h, ${layer.y + layer.h}); y++ {`,
            `\t\tfor x := max(0, ${layer.x}); x < min(w, ${layer.x + layer.w}); x++ {`,
            `\t\t\tif (x+y)%2 == 0 {`,
            `\t\t\t\tbuf.SetCell(x, y, &cellbuf.Cell{Rune: rune(${codePt}), Width: 1, Style: ${styleExpr}})`,
            `\t\t\t}`,
            `\t\t}`,
            `\t}`
          );
        } else if (layer.shape === "box") {
          const x0 = layer.x;
          const y0 = layer.y;
          const x1 = layer.x + Math.max(2, layer.w) - 1;
          const y1 = layer.y + Math.max(2, layer.h) - 1;
          const borderCh = Array.from(layer.borderChar || "─")[0] || "─";
          const borderCp = borderCh.codePointAt(0) ?? 0x2500;
          body.push(
            `\tfor y := max(0, ${y0}); y <= min(h-1, ${y1}); y++ {`,
            `\t\tfor x := max(0, ${x0}); x <= min(w-1, ${x1}); x++ {`,
            `\t\t\tch := ' '`,
            `\t\t\tswitch {`,
            `\t\t\tcase x == ${x0} && y == ${y0}:`,
            `\t\t\t\tch = '╭'`,
            `\t\t\tcase x == ${x1} && y == ${y0}:`,
            `\t\t\t\tch = '╮'`,
            `\t\t\tcase x == ${x0} && y == ${y1}:`,
            `\t\t\t\tch = '╰'`,
            `\t\t\tcase x == ${x1} && y == ${y1}:`,
            `\t\t\t\tch = '╯'`,
            `\t\t\tcase y == ${y0} || y == ${y1}:`,
            `\t\t\t\tch = rune(${borderCp})`,
            `\t\t\tcase x == ${x0} || x == ${x1}:`,
            `\t\t\t\tch = '│'`,
            `\t\t\t}`,
            `\t\t\tbuf.SetCell(x, y, &cellbuf.Cell{Rune: ch, Width: 1, Style: ${styleExpr}})`,
            `\t\t}`,
            `\t}`
          );
        } else if (layer.shape === "line") {
          const ch = Array.from(layer.borderChar || "─")[0] || "─";
          const cp = ch.codePointAt(0) ?? 0x2500;
          body.push(
            `\tif ${layer.y} >= 0 && ${layer.y} < h {`,
            `\t\tfor x := max(0, ${layer.x}); x < min(w, ${layer.x + layer.w}); x++ {`,
            `\t\t\tbuf.SetCell(x, ${layer.y}, &cellbuf.Cell{Rune: rune(${cp}), Width: 1, Style: ${styleExpr}})`,
            `\t\t}`,
            `\t}`
          );
        } else if (layer.shape === "text") {
          const txt = layer.text || "";
          body.push(
            `\tif ${layer.y} >= 0 && ${layer.y} < h {`,
            `\t\tfor i, r := range []rune(${JSON.stringify(txt)}) {`,
            `\t\t\tx := ${layer.x} + i`,
            `\t\t\tif x >= 0 && x < w {`,
            `\t\t\t\tbuf.SetCell(x, ${layer.y}, &cellbuf.Cell{Rune: r, Width: 1, Style: ${styleExpr}})`,
            `\t\t\t}`,
            `\t\t}`,
            `\t}`
          );
        }
      }
      body.push(`\treturn strings.TrimRight(cellbuf.Render(buf), "\\n")`);
      const sig = hasTokenColors ? `(w, h int, isDark bool)` : `(w, h int)`;
      cellbufHelpers.push(`func ${fnName}${sig} string {\n${body.join("\n")}\n}`);
    } else {
      viewArgs.push(JSON.stringify(node.content ?? node.id));
    }
  }

  for (const ov of harmonicaOverlays) {
    const ovVar = `${toCamel(ov.node.id)}Ov`;
    viewArgs.push(`int(math.Round(m.${ovVar}Offset))`);
  }

  const stdImports: string[] = [];
  if (usesColorPkg) stdImports.push(`"image/color"`);
  if (harmonicaOverlays.length > 0) stdImports.push(`"math"`);
  if (usesStrconv) stdImports.push(`"strconv"`);
  if (usesGlamour || usesDivider || usesUv || usesCellbuf) stdImports.push(`"strings"`);

  const thirdImports: string[] = [`tea "charm.land/bubbletea/v2"`];
  if (usesGlamour) thirdImports.push(`"charm.land/glamour/v2"`);
  if (usesUv) thirdImports.push(`uv "github.com/charmbracelet/ultraviolet"`);
  if (usesCellbuf) thirdImports.push(`"github.com/charmbracelet/x/cellbuf"`);
  thirdImports.push(`${JSON.stringify(`${moduleName}/ui`)}`);

  const altScreen = doc.view?.altScreen ?? true;
  const mouseMode = doc.view?.mouseMode ?? "cell";
  const mouseModeExpr =
    mouseMode === "all"
      ? "tea.MouseModeAllMotion"
      : mouseMode === "none"
      ? "tea.MouseModeNone"
      : "tea.MouseModeCellMotion";

  const cursorMode = doc.view?.cursorMode ?? (firstTextInputId ? "auto" : "none");
  let cursorExpr = "nil";
  if (cursorMode === "manual") {
    cursorExpr = `tea.NewCursor(${Math.max(0, doc.view?.cursorX ?? 0)}, ${Math.max(0, doc.view?.cursorY ?? 0)})`;
  } else if (cursorMode === "auto" && firstTextInputId) {
    cursorExpr = `m.${firstTextInputId}.Cursor()`;
  }

  const viewPropLines: string[] = [
    `\tv.AltScreen = ${altScreen}`,
    `\tv.MouseMode = ${mouseModeExpr}`,
    `\tv.Cursor = ${cursorExpr}`,
  ];
  if (doc.view?.windowTitle?.trim()) {
    viewPropLines.push(`\tv.WindowTitle = ${JSON.stringify(doc.view.windowTitle.trim())}`);
  }
  if (doc.view?.reportFocus) {
    viewPropLines.push(`\tv.ReportFocus = true`);
  }
  if (doc.view?.disableBracketedPasteMode) {
    viewPropLines.push(`\tv.DisableBracketedPasteMode = true`);
  }

  const helpers: string[] = [];
  if (usesGlamour) {
    helpers.push(`func renderMarkdown(md, theme string) string {\n\tr, err := glamour.NewTermRenderer(glamour.WithStandardStyle(theme), glamour.WithWordWrap(72))\n\tif err != nil {\n\t\treturn md\n\t}\n\tout, err := r.Render(md)\n\tif err != nil {\n\t\treturn md\n\t}\n\treturn strings.TrimSpace(out)\n}`);
  }
  if (usesDivider) {
    helpers.push(`func renderDivider(orientation, ch, label string) string {\n\tif ch == "" {\n\t\tch = "─"\n\t}\n\tif orientation == "vertical" {\n\t\treturn strings.Repeat(ch+"\\n", 4)\n\t}\n\trule := strings.Repeat(ch, 16)\n\tif label != "" {\n\t\treturn "─── " + label + " " + rule\n\t}\n\treturn strings.Repeat(ch, 32)\n}`);
  }
  if (usesHexHelper) {
    helpers.push(
      `func hexToColorRGBA(hex string) color.Color {\n\th := strings.TrimSpace(hex)\n\tif idx, err := strconv.Atoi(h); err == nil && idx >= 0 && idx <= 255 {\n\t\tif idx < 16 {\n\t\t\tbasic := [16][3]uint8{{0, 0, 0}, {128, 0, 0}, {0, 128, 0}, {128, 128, 0}, {0, 0, 128}, {128, 0, 128}, {0, 128, 128}, {192, 192, 192}, {128, 128, 128}, {255, 0, 0}, {0, 255, 0}, {255, 255, 0}, {0, 0, 255}, {255, 0, 255}, {0, 255, 255}, {255, 255, 255}}\n\t\t\tc := basic[idx]\n\t\t\treturn color.RGBA{R: c[0], G: c[1], B: c[2], A: 255}\n\t\t}\n\t\tif idx >= 232 {\n\t\t\tg := uint8(8 + 10*(idx-232))\n\t\t\treturn color.RGBA{R: g, G: g, B: g, A: 255}\n\t\t}\n\t\tcube := idx - 16\n\t\tlevels := [6]uint8{0, 95, 135, 175, 215, 255}\n\t\treturn color.RGBA{R: levels[cube/36], G: levels[(cube/6)%6], B: levels[cube%6], A: 255}\n\t}\n\th = strings.TrimPrefix(h, "#")\n\tif len(h) != 6 {\n\t\treturn color.RGBA{R: 255, G: 255, B: 255, A: 255}\n\t}\n\tr, _ := strconv.ParseUint(h[0:2], 16, 8)\n\tg, _ := strconv.ParseUint(h[2:4], 16, 8)\n\tb, _ := strconv.ParseUint(h[4:6], 16, 8)\n\treturn color.RGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: 255}\n}`
    );
  }
  helpers.push(...uvHelpers, ...cellbufHelpers);

  const importBlock = stdImports.length > 0
    ? `${stdImports.map((s) => `\t${s}`).join("\n")}\n\n${thirdImports.map((s) => `\t${s}`).join("\n")}`
    : thirdImports.map((s) => `\t${s}`).join("\n");

  const code = `package main

import (
${importBlock}
)

func (m model) View() tea.View {
\t// @tui:view-props
\tv := tea.NewView(ui.RenderApp(m.width, m.height, m.theme, ${viewArgs.join(", ")}))
${viewPropLines.join("\n")}
\treturn v
}
${helpers.length > 0 ? "\n" + helpers.join("\n\n") + "\n" : ""}`;

  const lines = code.split("\n");
  const spans: CodeSpanMap = {};
  const startIdx = lines.findIndex((l) => l.includes("func (m model) View()"));
  if (startIdx >= 0) {
    let endIdx = startIdx;
    for (let j = startIdx + 1; j < lines.length; j++) {
      endIdx = j;
      if (lines[j].trim() === "}") break;
    }
    const span: CodeSpan = {
      file: "view.go",
      startLine: startIdx + 1,
      endLine: endIdx + 1,
      highlightLine: startIdx + 3,
    };
    pushSpan(spans, "view", span);
    pushSpan(spans, doc.root.id, span);
  }

  return { code, spans };
}

export function generateViewGo(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): string {
  return generateViewGoWithSpans(doc, rawModuleName).code;
}

export function generateEntryMainGo(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): string {
  const { moduleName, usesWish } = inspectDocCapabilities(doc, rawModuleName);

  if (usesWish) {
    return `package main

import (
\t"context"
\t"errors"
\t"log"
\t"net"
\t"os"
\t"os/signal"
\t"syscall"
\t"time"

\ttea "charm.land/bubbletea/v2"
\t"charm.land/wish/v2"
\t"charm.land/wish/v2/bubbletea"
\t"charm.land/wish/v2/logging"
\t"github.com/charmbracelet/ssh"
\t${JSON.stringify(`${moduleName}/ui`)}
)

func teaHandler(s ssh.Session) (tea.Model, []tea.ProgramOption) {
\tpty, _, _ := s.Pty()
\tm := newModel(ui.NewTheme(true))
\tm.width = pty.Window.Width
\tm.height = pty.Window.Height
\treturn m, bubbletea.MakeOptions(s)
}

func main() {
\ts, err := wish.NewServer(
\t\twish.WithAddress(net.JoinHostPort("0.0.0.0", "2323")),
\t\twish.WithHostKeyPath(".ssh/id_ed25519"),
\t\twish.WithMiddleware(
\t\t\tbubbletea.Middleware(teaHandler),
\t\t\tlogging.Middleware(),
\t\t),
\t)
\tif err != nil {
\t\tlog.Fatal(err)
\t}

\tdone := make(chan os.Signal, 1)
\tsignal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
\tgo func() {
\t\tif err := s.ListenAndServe(); err != nil && !errors.Is(err, wish.ErrServerClosed) {
\t\t\tlog.Fatal(err)
\t\t}
\t}()
\t<-done
\tctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
\tdefer cancel()
\t_ = s.Shutdown(ctx)
}
`;
  }

  return `package main

import (
\t"log"

\ttea "charm.land/bubbletea/v2"
\t${JSON.stringify(`${moduleName}/ui`)}
)

func main() {
\tm := newModel(ui.NewTheme(true))
\tif _, err := tea.NewProgram(m).Run(); err != nil {
\t\tlog.Fatal(err)
\t}
}
`;
}

export function generateMainGo(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): string {
  return generateEntryMainGo(doc, rawModuleName);
}

export function generateGoMod(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): string {
  const { moduleName, allBoxes, usesGlamour, usesHuh, usesWish, usesHarmonica, usesUv, usesCellbuf } =
    inspectDocCapabilities(doc, rawModuleName);

  const usedTypes = new Set(allBoxes.map((b) => b.contentType ?? "text"));
  const usesBubbles = [...usedTypes].some((t) => t.startsWith("bubble:"));

  const reqs = [
    `\tcharm.land/bubbletea/v2 v2.1.2`,
    `\tcharm.land/lipgloss/v2 v2.1.1`,
  ];
  if (usesBubbles) reqs.push(`\tcharm.land/bubbles/v2 v2.2.1`);
  if (usesHuh) reqs.push(`\tcharm.land/huh/v2 v2.0.3`);
  if (usesWish) {
    reqs.push(`\tcharm.land/wish/v2 v2.0.5`);
    reqs.push(`\tgithub.com/charmbracelet/ssh v0.0.0-20250128164007-98fd5ae11894`);
  }
  if (usesGlamour) reqs.push(`\tcharm.land/glamour/v2 v2.0.1`);
  if (usesHarmonica) reqs.push(`\tgithub.com/charmbracelet/harmonica v0.2.0`);
  if (usesUv) reqs.push(`\tgithub.com/charmbracelet/ultraviolet v0.0.0-20261008173134-6b8d4baf91b4`);
  if (usesCellbuf) reqs.push(`\tgithub.com/charmbracelet/x/cellbuf v0.0.13`);

  return `module ${moduleName}

go 1.26

require (
${reqs.join("\n")}
)
`;
}

export function generateReadmeMd(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): string {
  const { moduleName, usesWish } = inspectDocCapabilities(doc, rawModuleName);

  return `# ${moduleName.split("/").pop() || "Charm App"}

Generated visually with Charm Studio.

## Quick Start

\`\`\`bash
go mod tidy
go run -tags preview .   # run with Studio sample preview fixtures
# or: go run .           # run with clean production model
\`\`\`

${usesWish ? `## Connect via SSH (Wish)

Once running, connect in another terminal:

\`\`\`bash
ssh localhost -p 2323
\`\`\`

` : ""}## Record Demo GIF (Optional)

If you have \`vhs\` installed:

\`\`\`bash
vhs demo.tape
\`\`\`
`;
}

export function generateVhsTape(doc: IRDoc, themeName: string): string {
  const { allBoxes: nodes } = inspectDocCapabilities(doc);

  const hasInput = nodes.some((n) => n.contentType === "bubble:textinput" || n.contentType === "huh:form");
  const hasListOrTable = nodes.some(
    (n) =>
      n.contentType === "bubble:list" ||
      n.contentType === "bubble:table" ||
      n.contentType === "gum:choose" ||
      n.contentType === "glamour:markdown"
  );

  const steps: string[] = [
    `# Generated by Charm Studio for github.com/charmbracelet/vhs`,
    `Output demo.gif`,
    ``,
    `Set Shell "bash"`,
    `Set FontFamily "JetBrains Mono"`,
    `Set FontSize 14`,
    `Set Width 1200`,
    `Set Height 680`,
    `Set Theme ${JSON.stringify(themeName)}`,
    ``,
    `Type "go run ."`,
    `Enter`,
    `Sleep 1s`,
  ];

  if (hasInput) {
    steps.push(`Type "charm-studio"`, `Sleep 400ms`, `Tab`, `Sleep 300ms`);
  }
  if (hasListOrTable) {
    steps.push(`Down 2`, `Sleep 350ms`, `Up 1`, `Sleep 350ms`);
  }
  steps.push(`Screenshot preview.png`, `Sleep 500ms`, `Type "q"`);
  return steps.join("\n") + "\n";
}

export function generateGumShell(doc: IRDoc): string {
  const accent = doc.tokens.accent?.dark ?? "#7aa2f7";
  const glow = doc.tokens.modalGlow?.dark ?? "#bb9af7";
  const { allBoxes: boxes } = inspectDocCapabilities(doc);

  const lines: string[] = [
    `#!/usr/bin/env bash`,
    `# Generated by Charm Studio for github.com/charmbracelet/gum`,
    `set -euo pipefail`,
    ``,
    `ACCENT="${accent}"`,
    `GLOW="${glow}"`,
    ``,
  ];

  for (const box of boxes) {
    if (box.contentType === "gum:choose") {
      const raw = (box.content ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
      const header = raw[0]?.startsWith("#") ? raw[0].replace(/^#+\s*/, "") : "Choose targets:";
      const items = (raw[0]?.startsWith("#") ? raw.slice(1) : raw).length > 0
        ? (raw[0]?.startsWith("#") ? raw.slice(1) : raw)
        : ["service-a", "service-b", "service-c"];
      lines.push(
        `TARGETS=$(gum choose --no-limit --header=${JSON.stringify(header)} \\`,
        `  --cursor.foreground="$GLOW" --selected.foreground="$ACCENT" \\`,
        `  ${items.map((i) => JSON.stringify(i)).join(" ")})`,
        ``
      );
    } else if (box.contentType === "gum:confirm") {
      const prompt = (box.content ?? "").trim() || "Proceed with action?";
      lines.push(
        `if gum confirm ${JSON.stringify(prompt)} --selected.background="$ACCENT"; then`,
        `  gum spin --spinner dot --title "Running task..." -- sleep 1`,
        `fi`,
        ``
      );
    } else if (box.contentType === "glamour:markdown") {
      lines.push(
        `gum format << 'EOF'`,
        (box.content ?? "# Hello from Gum").trim(),
        `EOF`,
        ``
      );
    } else if (box.contentType === "text" || !box.contentType) {
      const text = (box.content ?? box.id).split("\n")[0];
      lines.push(
        `gum style --border rounded --border-foreground "$ACCENT" --padding "0 2" ${JSON.stringify(text)}`,
        ``
      );
    }
  }

  return lines.join("\n");
}
