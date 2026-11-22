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

function borderExpr(border: IRStyle["border"]): string | null {
  switch (border) {
    case "rounded": return ".Border(lipgloss.RoundedBorder())";
    case "normal":  return ".Border(lipgloss.NormalBorder())";
    case "thick":   return ".Border(lipgloss.ThickBorder())";
    case "double":  return ".Border(lipgloss.DoubleBorder())";
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

  const tokenDecls = tokenEntries
    .map(([name, pair]) =>
      `\t// @tui:token=${name}\n\t${toCamel(name)} := ld(lipgloss.Color(${JSON.stringify(pair.light)}), lipgloss.Color(${JSON.stringify(pair.dark)}))`
    )
    .join("\n");

  const styleInits = styleEntries
    .map(([name, st]) => {
      const chains: string[] = [];
      const b = borderExpr(st.border);
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
      if (st.bold) chains.push(".Bold(true)");
      if (st.italic) chains.push(".Italic(true)");
      if (st.faint) chains.push(".Faint(true)");
      if (st.underline) chains.push(".Underline(true)");
      if (st.alignH && st.alignH !== "left") chains.push(`.AlignHorizontal(${lipPos(st.alignH, "h")})`);
      if (st.alignV && st.alignV !== "top") chains.push(`.AlignVertical(${lipPos(st.alignV, "v")})`);

      if (chains.length === 0) {
        return `\t\t// @tui:style=${name}\n\t\t${toPascal(name)}: lipgloss.NewStyle(),`;
      }
      return `\t\t// @tui:style=${name}\n\t\t${toPascal(name)}: lipgloss.NewStyle().\n\t\t\t${chains.map((c) => c.slice(1)).join(".\n\t\t\t")},`;
    })
    .join("\n");

  return `package ui

import "charm.land/lipgloss/v2"

type Theme struct {
${structFields}
}

func NewTheme(isDark bool) Theme {
\tld := lipgloss.LightDark(isDark)

${tokenDecls}

\treturn Theme{
${styleInits}
\t}
}

func DefaultStyles(isDark bool) Theme {
\treturn NewTheme(isDark)
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
      lines.push(`${indent}${v} := ${stRef}${chain}.Render(${contentArg})`);
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
    lines.push("");
    lines.push(`\tlayers := []*lipgloss.Layer{lipgloss.NewLayer(${rootVar}).X(0).Y(0).Z(0).ID(${JSON.stringify(doc.root.id)})}`);
    for (const ov of activeOverlays) {
      const ow = ov.node.width?.value ?? 44;
      const oh = ov.node.height?.value ?? 9;
      const anchor = ov.anchor ?? "center";
      const stRef = ov.node.style ? `st.${toPascal(ov.node.style)}` : "lipgloss.NewStyle()";
      const ovVar = freshVar(ov.node.id);

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
      }

      lines.push(`\t// @tui:id=${ov.node.id}`);
      lines.push(`\t${ovVar} := ${stRef}.Width(${wCode} - ${stRef}.GetHorizontalMargins()).Height(${oh} - ${stRef}.GetVerticalMargins()).Render(${toCamel(ov.node.id)}Content)`);
      lines.push(`\tlayers = append(layers, lipgloss.NewLayer(${ovVar}).X(${xExpr}).Y(${yExpr}).Z(${ov.z}).ID(${JSON.stringify(ov.node.id)}))`);
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
  const usesGlamour = usedTypes.has("glamour:markdown");
  const usesHuh = usedTypes.has("huh:form");
  const usesWish = usedTypes.has("wish:ssh");

  const interactiveWidgets = allBoxes.filter((n) =>
    n.contentType === "bubble:list" ||
    n.contentType === "bubble:table" ||
    n.contentType === "bubble:viewport" ||
    n.contentType === "bubble:textinput" ||
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
    usesGlamour,
    usesHuh,
    usesWish,
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
    } else if (ct === "bubble:textinput") {
      const placeholder = wd.inputPlaceholder ?? "Type a command...";
      initLines.push(
        `\tpreview${pascalBase}Placeholder = func() string {`,
        `\t\treturn ${JSON.stringify(placeholder)}`,
        `\t}`
      );
    } else if (ct === "huh:form") {
      const fields = wd.huhFields?.length ? wd.huhFields : defaultWidgetData("huh:form").huhFields!;
      let selectIdx = 0;
      for (const f of fields) {
        if (f.kind !== "select") continue;
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

export function generateModelGoWithSpans(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): { code: string; spans: CodeSpanMap } {
  const {
    moduleName,
    allBoxes,
    usesList,
    usesTable,
    usesViewport,
    usesInput,
    usesHuh,
    usesWish,
    interactiveWidgets,
  } = inspectDocCapabilities(doc, rawModuleName);

  const imports: string[] = [];
  if (usesList) imports.push(`"charm.land/bubbles/v2/list"`);
  if (usesTable) imports.push(`"charm.land/bubbles/v2/table"`);
  if (usesInput) imports.push(`"charm.land/bubbles/v2/textinput"`);
  if (usesViewport) imports.push(`"charm.land/bubbles/v2/viewport"`);
  imports.push(`tea "charm.land/bubbletea/v2"`);
  if (usesHuh) imports.push(`"charm.land/huh/v2"`);
  imports.push(`${JSON.stringify(`${moduleName}/ui`)}`);

  const fieldDecls: string[] = [
    `\twidth, height int`,
    `\ttheme         ui.Theme`,
  ];
  if (interactiveWidgets.length > 1) {
    fieldDecls.push(`\tfocusIdx      int`);
  }

  const fixtureHookVars: string[] = [];
  const initLines: string[] = [];
  const initCmds: string[] = [];
  if (!usesWish) initCmds.push("tea.RequestBackgroundColor");

  const listItemType = usesList
    ? `\ntype listItem struct{ title, desc string }\nfunc (i listItem) Title() string       { return i.title }\nfunc (i listItem) Description() string { return i.desc }\nfunc (i listItem) FilterValue() string { return i.title }\n`
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
        `\t${varBase}Model := list.New(preview${pascalBase}Items(), list.NewDefaultDelegate(), 28, 16)`,
        `\t${varBase}Model.Title = ${JSON.stringify(title)}`
      );
    } else if (ct === "bubble:table") {
      fieldDecls.push(`\t${varBase} table.Model // @tui:id=${node.id}`);
      fixtureHookVars.push(`\tpreview${pascalBase}Rows = func() []table.Row { return nil }`);
      const cols = wd.tableColumns?.length ? wd.tableColumns : defaultWidgetData("bubble:table").tableColumns!;
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Cols := []table.Column{`,
        ...cols.map((c) => `\t\t{Title: ${JSON.stringify(c.title)}, Width: ${c.width}},`),
        `\t}`,
        `\t${varBase}Model := table.New(table.WithColumns(${varBase}Cols), table.WithRows(preview${pascalBase}Rows()), table.WithFocused(true), table.WithHeight(10))`
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
      fixtureHookVars.push(`\tpreview${pascalBase}Placeholder = func() string { return "" }`);
      const prompt = wd.inputPrompt ?? "> ";
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Model := textinput.New()`,
        `\t${varBase}Model.Prompt = ${JSON.stringify(prompt)}`,
        `\t${varBase}Model.Placeholder = preview${pascalBase}Placeholder()`,
        `\t${varBase}Model.Focus()`
      );
    } else if (ct === "huh:form") {
      fieldDecls.push(`\t${varBase} *huh.Form // @tui:id=${node.id}`);
      const fields = wd.huhFields?.length ? wd.huhFields : defaultWidgetData("huh:form").huhFields!;
      let selectIdx = 0;
      const huhFieldSnippets = fields.map((f) => {
        if (f.kind === "select") {
          hasHuhSelect = true;
          const suffix = selectIdx === 0 ? "Options" : `Select${selectIdx + 1}Options`;
          selectIdx++;
          fixtureHookVars.push(`\tpreview${pascalBase}${suffix} = func() []string { return nil }`);
          return `\t\t\thuh.NewSelect[string]().Title(${JSON.stringify(f.label)}).Options(toHuhOptions(preview${pascalBase}${suffix}())...),`;
        }
        if (f.kind === "confirm") {
          return `\t\t\thuh.NewConfirm().Title(${JSON.stringify(f.label)}),`;
        }
        return `\t\t\thuh.NewInput().Title(${JSON.stringify(f.label)}).Placeholder(${JSON.stringify(f.placeholder || "")}),`;
      });
      initLines.push(
        `\t// @tui:id=${node.id}`,
        `\t${varBase}Form := huh.NewForm(`,
        `\t\thuh.NewGroup(`,
        ...huhFieldSnippets,
        `\t\t),`,
        `\t).WithTheme(huh.ThemeFunc(huh.ThemeCharm))`
      );
      initCmds.push(`m.${varBase}.Init()`);
    }
  }

  const huhOptionsHelper = hasHuhSelect
    ? `\nfunc toHuhOptions(vals []string) []huh.Option[string] {\n\tif len(vals) == 0 {\n\t\treturn []huh.Option[string]{huh.NewOption("Default", "default")}\n\t}\n\tout := make([]huh.Option[string], 0, len(vals))\n\tfor _, v := range vals {\n\t\tout = append(out, huh.NewOption(v, v))\n\t}\n\treturn out\n}\n`
    : "";

  const fixtureHookBlock = fixtureHookVars.length > 0
    ? `\n// Overridden by fixtures_preview_gen.go when built with -tags preview\nvar (\n${fixtureHookVars.join("\n")}\n)\n`
    : "";

  const modelStructInitPairs = allBoxes
    .filter((n) => ["bubble:list", "bubble:table", "bubble:viewport", "bubble:textinput", "huh:form"].includes(n.contentType ?? ""))
    .map((n) => {
      const varBase = toCamel(n.id);
      const suffix = n.contentType === "huh:form" ? "Form" : "Model";
      return `\t\t${varBase}: ${varBase}${suffix},`;
    });

  const initReturn = initCmds.length === 0
    ? "return nil"
    : initCmds.length === 1
    ? `return ${initCmds[0]}`
    : `return tea.Batch(${initCmds.join(", ")})`;

  const code = `package main

import (
${imports.map((s) => `\t${s}`).join("\n")}
)
${listItemType}${huhOptionsHelper}${fixtureHookBlock}
type model struct {
${fieldDecls.join("\n")}
}

func newModel(theme ui.Theme) model {
${initLines.join("\n")}
\treturn model{
\t\ttheme: theme,
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
    allBoxes,
    usesHuh,
    usesWish,
    interactiveWidgets,
  } = inspectDocCapabilities(doc, rawModuleName);

  const imports: string[] = [`tea "charm.land/bubbletea/v2"`];
  if (usesHuh) imports.push(`"charm.land/huh/v2"`);
  if (!usesWish) imports.push(`${JSON.stringify(`${moduleName}/ui`)}`);

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
    } else if (ct === "huh:form") {
      resizeLines.push(`\t\tm.${varBase}.WithWidth(max(20, msg.Width-6))`);
      resizeLines.push(`\t\tm.${varBase}.WithHeight(max(6, msg.Height-4))`);
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
    } else {
      updateRoutes.push(`// @tui:id=${node.id}\n\t${guard}var cmd tea.Cmd\n\t\tm.${varBase}, cmd = m.${varBase}.Update(msg)\n\t\tcmds = append(cmds, cmd)${endGuard}`);
    }
  });

  const focusTabCase = interactiveWidgets.length > 1
    ? `\t\tcase "tab":\n\t\t\tm.focusIdx = (m.focusIdx + 1) % ${interactiveWidgets.length}\n\t\tcase "shift+tab":\n\t\t\tm.focusIdx = (m.focusIdx + ${interactiveWidgets.length - 1}) % ${interactiveWidgets.length}\n`
    : "";

  const code = `package main

import (
${imports.map((s) => `\t${s}`).join("\n")}
)

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
\tvar cmds []tea.Cmd
\tswitch msg := msg.(type) {
\tcase tea.WindowSizeMsg:
\t\tm.width, m.height = msg.Width, msg.Height
${resizeLines.join("\n")}${!usesWish ? `\n\tcase tea.BackgroundColorMsg:\n\t\tm.theme = ui.NewTheme(msg.IsDark())` : ""}
\tcase tea.KeyPressMsg:
\t\tswitch msg.String() {
\t\tcase "ctrl+c":
\t\t\treturn m, tea.Quit
${focusTabCase}\t\t}
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
  const { moduleName, allBoxes, usesGlamour } = inspectDocCapabilities(doc, rawModuleName);

  const stdImports = usesGlamour ? [`"strings"`] : [];
  const thirdImports: string[] = [`tea "charm.land/bubbletea/v2"`];
  if (usesGlamour) thirdImports.push(`"charm.land/glamour/v2"`);
  thirdImports.push(`${JSON.stringify(`${moduleName}/ui`)}`);

  const viewArgs: string[] = [];
  let firstTextInputId: string | null = null;
  for (const node of allBoxes) {
    const varBase = toCamel(node.id);
    const ct = node.contentType ?? "text";
    if (ct === "bubble:textinput" && !firstTextInputId) {
      firstTextInputId = varBase;
    }
    if (
      ct === "bubble:list" ||
      ct === "bubble:table" ||
      ct === "bubble:viewport" ||
      ct === "bubble:textinput" ||
      ct === "huh:form"
    ) {
      viewArgs.push(`m.${varBase}.View()`);
    } else if (ct === "glamour:markdown") {
      viewArgs.push(`renderMarkdown(${JSON.stringify(node.content ?? "# Hello Glamour")})`);
    } else {
      viewArgs.push(JSON.stringify(node.content ?? node.id));
    }
  }

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

  const glamourHelper = usesGlamour
    ? `\nfunc renderMarkdown(md string) string {\n\tr, err := glamour.NewTermRenderer(glamour.WithAutoStyle(), glamour.WithWordWrap(72))\n\tif err != nil {\n\t\treturn md\n\t}\n\tout, err := r.Render(md)\n\tif err != nil {\n\t\treturn md\n\t}\n\treturn strings.TrimSpace(out)\n}\n`
    : "";

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
${glamourHelper}`;

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
  const moduleName = sanitizeModulePath(rawModuleName);
  const { rootLeaves, activeOverlays } = collectOrderedLeafBoxes(doc);
  const allBoxes = [...rootLeaves, ...activeOverlays.map((o) => o.node)];

  const usedTypes = new Set(allBoxes.map((b) => b.contentType ?? "text"));
  const usesBubbles = [...usedTypes].some((t) => t.startsWith("bubble:"));
  const usesGlamour = usedTypes.has("glamour:markdown");
  const usesHuh = usedTypes.has("huh:form");
  const usesWish = usedTypes.has("wish:ssh");

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

  return `module ${moduleName}

go 1.26

require (
${reqs.join("\n")}
)
`;
}

export function generateReadmeMd(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): string {
  const moduleName = sanitizeModulePath(rawModuleName);
  const { rootLeaves } = collectOrderedLeafBoxes(doc);
  const usesWish = rootLeaves.some((b) => b.contentType === "wish:ssh");

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
  const nodes: IRNode[] = [];
  const walk = (n: IRNode) => {
    if (n.kind === "Box") nodes.push(n);
    n.children?.forEach(walk);
  };
  walk(doc.root);

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
  const boxes: IRNode[] = [];
  const walk = (n: IRNode) => {
    if (n.kind === "Box") boxes.push(n);
    n.children?.forEach(walk);
  };
  walk(doc.root);

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
