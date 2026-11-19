import type { IRDoc, IRNode, IRStyle } from "./types";

function toPascal(id: string): string {
  return id
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^[a-z]/, (c) => c.toUpperCase());
}

function toCamel(id: string): string {
  const p = toPascal(id);
  return p.charAt(0).toLowerCase() + p.slice(1);
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

export function generateStylesGo(doc: IRDoc): string {
  const tokenEntries = Object.entries(doc.tokens);
  const tokenNames = new Set(Object.keys(doc.tokens));
  const styleEntries = Object.entries(doc.styles);

  const structFields = styleEntries
    .map(([name]) => `\t${toPascal(name)} lipgloss.Style`)
    .join("\n");

  const tokenDecls = tokenEntries
    .map(([name, pair]) =>
      `\t${toCamel(name)} := ld(lipgloss.Color(${JSON.stringify(pair.light)}), lipgloss.Color(${JSON.stringify(pair.dark)}))`
    )
    .join("\n");

  const styleInits = styleEntries
    .map(([name, st]) => {
      const chains: string[] = [];
      const b = borderExpr(st.border);
      if (b) chains.push(b);
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

      if (chains.length === 0) {
        return `\t\t${toPascal(name)}: lipgloss.NewStyle(),`;
      }
      return `\t\t${toPascal(name)}: lipgloss.NewStyle().\n\t\t\t${chains.map((c) => c.slice(1)).join(".\n\t\t\t")},`;
    })
    .join("\n");

  return `package ui

import "charm.land/lipgloss/v2"

type Styles struct {
${structFields}
}

func NewStyles(hasDarkBG bool) Styles {
\tld := lipgloss.LightDark(hasDarkBG)

${tokenDecls}

\treturn Styles{
${styleInits}
\t}
}
`;
}

export function generateLayoutGo(doc: IRDoc): string {
  const leafParams: string[] = [];
  const collectLeaves = (n: IRNode) => {
    if (n.kind === "Box") leafParams.push(`${toCamel(n.id)}Content string`);
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
      const modifiers: string[] = [];
      if (node.width?.mode !== "fit") {
        modifiers.push(`Width(max(0, ${wExpr}-${stRef}.GetHorizontalMargins()))`);
      }
      if (node.height?.mode !== "fit") {
        modifiers.push(`Height(max(0, ${hExpr}-${stRef}.GetVerticalMargins()))`);
      }
      const chain = modifiers.length > 0 ? `.${modifiers.join(".")}` : "";
      lines.push(`${indent}${v} := ${stRef}${chain}.Render(${toCamel(node.id)}Content)`);
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

      const joinFn = isH ? "lipgloss.JoinHorizontal(lipgloss.Top" : "lipgloss.JoinVertical(lipgloss.Left";
      lines.push(`${brIndent}${targetVar} = ${joinFn}, ${childVars.join(", ")})`);
    };

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
    lines.push(`\tlayers := []*lipgloss.Layer{lipgloss.NewLayer(${rootVar}).X(0).Y(0).Z(0)}`);
    for (const ov of activeOverlays) {
      const ow = ov.node.width?.value ?? 44;
      const oh = ov.node.height?.value ?? 9;
      const stRef = ov.node.style ? `st.${toPascal(ov.node.style)}` : "lipgloss.NewStyle()";
      const ovVar = freshVar(ov.node.id);
      lines.push(`\t${ovVar} := ${stRef}.Width(${ow} - ${stRef}.GetHorizontalMargins()).Height(${oh} - ${stRef}.GetVerticalMargins()).Render(${toCamel(ov.node.id)}Content)`);
      lines.push(`\tlayers = append(layers, lipgloss.NewLayer(${ovVar}).X(max(0, (w-${ow})/2)).Y(max(0, (h-${oh})/2)).Z(${ov.z}))`);
    }
    lines.push(`\tcanvas := lipgloss.NewCanvas(w, h)`);
    lines.push(`\tcanvas.Compose(lipgloss.NewCompositor(layers...))`);
    lines.push(`\treturn canvas.Render()`);
  } else {
    lines.push(`\treturn ${rootVar}`);
  }

  return `package ui

import "charm.land/lipgloss/v2"

func RenderApp(w, h int, st Styles, ${leafParams.join(", ")}) string {
${lines.join("\n")}
}
`;
}
