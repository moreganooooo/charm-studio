import { defaultWidgetData, sanitizeGoId, type IRDoc, type IRNode, type IRStyle } from "./types";

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

      lines.push(`\t${ovVar} := ${stRef}.Width(${wCode} - ${stRef}.GetHorizontalMargins()).Height(${oh} - ${stRef}.GetVerticalMargins()).Render(${toCamel(ov.node.id)}Content)`);
      lines.push(`\tlayers = append(layers, lipgloss.NewLayer(${ovVar}).X(${xExpr}).Y(${yExpr}).Z(${ov.z}))`);
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

func RenderApp(w, h int, st Styles, ${leafParams.join(", ")}) string {
${lines.join("\n")}
}
${truncateHelper}`;
}

export function sanitizeModulePath(raw: string): string {
  const trimmed = raw.trim().replace(/[^a-zA-Z0-9._\-/]/g, "");
  return trimmed || "github.com/charm-user/my-tui";
}

export function generateMainGo(doc: IRDoc, rawModuleName = "github.com/charm-user/my-tui"): string {
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

  // Build imports cleanly
  const stdImports: string[] = [];
  if (usesWish) {
    stdImports.push(`"context"`, `"errors"`, `"log"`, `"net"`, `"os"`, `"os/signal"`);
  } else {
    stdImports.push(`"log"`);
  }
  if (usesGlamour) stdImports.push(`"strings"`);
  if (usesWish) stdImports.push(`"syscall"`, `"time"`);

  const thirdImports: string[] = [];
  if (usesList) thirdImports.push(`"charm.land/bubbles/v2/list"`);
  if (usesTable) thirdImports.push(`"charm.land/bubbles/v2/table"`);
  if (usesInput) thirdImports.push(`"charm.land/bubbles/v2/textinput"`);
  if (usesViewport) thirdImports.push(`"charm.land/bubbles/v2/viewport"`);
  thirdImports.push(`tea "charm.land/bubbletea/v2"`);
  if (usesGlamour) thirdImports.push(`"github.com/charmbracelet/glamour"`);
  if (usesHuh) thirdImports.push(`"github.com/charmbracelet/huh"`);
  if (usesWish) {
    thirdImports.push(
      `"github.com/charmbracelet/wish"`,
      `"github.com/charmbracelet/wish/bubbletea"`,
      `"github.com/charmbracelet/wish/logging"`
    );
  }
  thirdImports.push(`${JSON.stringify(`${moduleName}/ui`)}`);

  const fieldDecls: string[] = [
    `\twidth, height int`,
    `\tstyles        ui.Styles`,
  ];
  if (interactiveWidgets.length > 1) {
    fieldDecls.push(`\tfocusIdx      int`);
  }

  const initLines: string[] = [];
  const resizeLines: string[] = [];
  const updateRoutes: string[] = [];
  const viewArgs: string[] = [];
  const initCmds: string[] = [];

  if (!usesWish) initCmds.push("tea.RequestBackgroundColor");

  // Helper struct when bubble:list is present
  const listItemType = usesList
    ? `\ntype listItem struct{ title, desc string }\nfunc (i listItem) Title() string       { return i.title }\nfunc (i listItem) Description() string { return i.desc }\nfunc (i listItem) FilterValue() string { return i.title }\n`
    : "";

  for (const node of allBoxes) {
    const varBase = toCamel(node.id);
    const ct = node.contentType ?? "text";
    const wd = node.widgetData ?? defaultWidgetData(ct);

    if (ct === "bubble:list") {
      fieldDecls.push(`\t${varBase} list.Model`);
      const items = wd.listItems?.length ? wd.listItems : defaultWidgetData("bubble:list").listItems!;
      const title = wd.listTitle || "Items";
      initLines.push(
        `\t${varBase}Items := []list.Item{`,
        ...items.map((it) => `\t\tlistItem{title: ${JSON.stringify(it.title)}, desc: ${JSON.stringify(it.desc)}},`),
        `\t}`,
        `\t${varBase}Model := list.New(${varBase}Items, list.NewDefaultDelegate(), 28, 16)`,
        `\t${varBase}Model.Title = ${JSON.stringify(title)}`
      );
      resizeLines.push(`\t\tm.${varBase}.SetSize(max(16, msg.Width/3), max(6, msg.Height-4))`);
      viewArgs.push(`m.${varBase}.View()`);
    } else if (ct === "bubble:table") {
      fieldDecls.push(`\t${varBase} table.Model`);
      const cols = wd.tableColumns?.length ? wd.tableColumns : defaultWidgetData("bubble:table").tableColumns!;
      const rows = wd.tableRows ?? defaultWidgetData("bubble:table").tableRows!;
      initLines.push(
        `\t${varBase}Cols := []table.Column{`,
        ...cols.map((c) => `\t\t{Title: ${JSON.stringify(c.title)}, Width: ${c.width}},`),
        `\t}`,
        `\t${varBase}Rows := []table.Row{`,
        ...rows.map((r) => `\t\t{${cols.map((_, i) => JSON.stringify(r[i] ?? "")).join(", ")}},`),
        `\t}`,
        `\t${varBase}Model := table.New(table.WithColumns(${varBase}Cols), table.WithRows(${varBase}Rows), table.WithFocused(true), table.WithHeight(10))`
      );
      resizeLines.push(`\t\tm.${varBase}.SetHeight(max(4, msg.Height-6))`);
      viewArgs.push(`m.${varBase}.View()`);
    } else if (ct === "bubble:viewport") {
      fieldDecls.push(`\t${varBase} viewport.Model`);
      const vpText = (node.content ?? "").trim() || "Scrollable viewport content...";
      initLines.push(
        `\t${varBase}Model := viewport.New(viewport.WithWidth(60), viewport.WithHeight(16))`,
        `\t${varBase}Model.SetContent(${JSON.stringify(vpText)})`
      );
      resizeLines.push(
        `\t\tm.${varBase}.SetWidth(max(12, msg.Width-6))`,
        `\t\tm.${varBase}.SetHeight(max(4, msg.Height-6))`
      );
      viewArgs.push(`m.${varBase}.View()`);
    } else if (ct === "bubble:textinput") {
      fieldDecls.push(`\t${varBase} textinput.Model`);
      const prompt = wd.inputPrompt ?? "> ";
      const placeholder = wd.inputPlaceholder ?? "Type a command...";
      initLines.push(
        `\t${varBase}Model := textinput.New()`,
        `\t${varBase}Model.Prompt = ${JSON.stringify(prompt)}`,
        `\t${varBase}Model.Placeholder = ${JSON.stringify(placeholder)}`,
        `\t${varBase}Model.Focus()`
      );
      resizeLines.push(`\t\tm.${varBase}.SetWidth(max(10, msg.Width-8))`);
      viewArgs.push(`m.${varBase}.View()`);
    } else if (ct === "huh:form") {
      fieldDecls.push(`\t${varBase} *huh.Form`);
      const fields = wd.huhFields?.length ? wd.huhFields : defaultWidgetData("huh:form").huhFields!;
      const huhFieldSnippets = fields.map((f) => {
        if (f.kind === "select") {
          const opts = f.options?.length ? f.options : ["Option A", "Option B"];
          const optCalls = opts.map((o) => `huh.NewOption(${JSON.stringify(o)}, ${JSON.stringify(o)})`).join(", ");
          return `\t\t\thuh.NewSelect[string]().Title(${JSON.stringify(f.label)}).Options(${optCalls}),`;
        }
        if (f.kind === "confirm") {
          return `\t\t\thuh.NewConfirm().Title(${JSON.stringify(f.label)}),`;
        }
        return `\t\t\thuh.NewInput().Title(${JSON.stringify(f.label)}).Placeholder(${JSON.stringify(f.placeholder || "")}),`;
      });
      initLines.push(
        `\t${varBase}Form := huh.NewForm(`,
        `\t\thuh.NewGroup(`,
        ...huhFieldSnippets,
        `\t\t),`,
        `\t)`
      );
      initCmds.push(`m.${varBase}.Init()`);
      viewArgs.push(`m.${varBase}.View()`);
    } else if (ct === "glamour:markdown") {
      viewArgs.push(`renderMarkdown(${JSON.stringify(node.content ?? "# Hello Glamour")})`);
    } else {
      viewArgs.push(JSON.stringify((node.content ?? node.id).split("\n")[0]));
    }
  }

  // Build Update() widget delegation
  interactiveWidgets.forEach((node, idx) => {
    const varBase = toCamel(node.id);
    const ct = node.contentType!;
    const guard = interactiveWidgets.length > 1 ? `if m.focusIdx == ${idx} {\n\t\t` : "\t";
    const endGuard = interactiveWidgets.length > 1 ? "\n\t}" : "";
    if (ct === "huh:form") {
      updateRoutes.push(
        `${guard}if f, cmd := m.${varBase}.Update(msg); f != nil {\n\t\t\tif form, ok := f.(*huh.Form); ok {\n\t\t\t\tm.${varBase} = form\n\t\t\t}\n\t\t\tcmds = append(cmds, cmd)\n\t\t}${endGuard}`
      );
    } else {
      updateRoutes.push(`${guard}var cmd tea.Cmd\n\t\tm.${varBase}, cmd = m.${varBase}.Update(msg)\n\t\tcmds = append(cmds, cmd)${endGuard}`);
    }
  });

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

  const focusTabCase = interactiveWidgets.length > 1
    ? `\t\tcase "tab":\n\t\t\tm.focusIdx = (m.focusIdx + 1) % ${interactiveWidgets.length}\n\t\tcase "shift+tab":\n\t\t\tm.focusIdx = (m.focusIdx + ${interactiveWidgets.length - 1}) % ${interactiveWidgets.length}\n`
    : "";

  const updateBody = `\tvar cmds []tea.Cmd
\tswitch msg := msg.(type) {
\tcase tea.WindowSizeMsg:
\t\tm.width, m.height = msg.Width, msg.Height
${resizeLines.join("\n")}${!usesWish ? `\n\tcase tea.BackgroundColorMsg:\n\t\tm.styles = ui.NewStyles(msg.IsDark())` : ""}
\tcase tea.KeyPressMsg:
\t\tswitch msg.String() {
\t\tcase "ctrl+c":
\t\t\treturn m, tea.Quit
${focusTabCase}\t\t}
\t}
${updateRoutes.length > 0 ? updateRoutes.map((r) => `\t${r}`).join("\n") + "\n" : ""}\treturn m, tea.Batch(cmds...)`;

  const glamourHelper = usesGlamour
    ? `\nfunc renderMarkdown(md string) string {\n\tr, err := glamour.NewTermRenderer(glamour.WithAutoStyle(), glamour.WithWordWrap(72))\n\tif err != nil {\n\t\treturn md\n\t}\n\tout, err := r.Render(md)\n\tif err != nil {\n\t\treturn md\n\t}\n\treturn strings.TrimSpace(out)\n}\n`
    : "";

  const newModelFn = `func newModel(styles ui.Styles) model {
${initLines.join("\n")}
\treturn model{
\t\tstyles: styles,
${modelStructInitPairs.join("\n")}
\t}
}`;

  const runtimeMain = usesWish
    ? `func teaHandler(s wish.Session) (tea.Model, []tea.ProgramOption) {
\tpty, _, _ := s.Pty()
\tm := newModel(ui.NewStyles(true))
\tm.width = pty.Window.Width
\tm.height = pty.Window.Height
\treturn m, []tea.ProgramOption{tea.WithAltScreen()}
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
}`
    : `func main() {
\tm := newModel(ui.NewStyles(true))
\tif _, err := tea.NewProgram(m).Run(); err != nil {
\t\tlog.Fatal(err)
\t}
}`;

  return `package main

import (
${stdImports.map((s) => `\t${s}`).join("\n")}

${thirdImports.map((s) => `\t${s}`).join("\n")}
)
${listItemType}
type model struct {
${fieldDecls.join("\n")}
}

${newModelFn}

func (m model) Init() tea.Cmd {
\t${initReturn}
}

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
${updateBody}
}

func (m model) View() tea.View {
\tv := tea.NewView(ui.RenderApp(m.width, m.height, m.styles, ${viewArgs.join(", ")}))
\tv.AltScreen = true
\treturn v
}

${runtimeMain}
${glamourHelper}`;
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
  if (usesGlamour) reqs.push(`\tgithub.com/charmbracelet/glamour v0.8.0`);
  if (usesHuh) reqs.push(`\tgithub.com/charmbracelet/huh v0.6.0`);
  if (usesWish) reqs.push(`\tgithub.com/charmbracelet/wish v1.4.0`);

  return `module ${moduleName}

go 1.24

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
go run .
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
