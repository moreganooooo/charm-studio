import { defaultWidgetData, type ContentType, type IRDoc, type IRSize, type IRStyle, type OverlayAnchor, type TokenPair } from "./types";

export type WidgetCategory = "Layout" | "Text" | "Input" | "Data" | "Feedback" | "Containers";

export type WidgetGroupKey =
  | "layout"
  | "lipgloss"
  | "bubbles"
  | "huh"
  | "glamour"
  | "gum"
  | "wish"
  | "overlay";

export type WidgetInsertKind = "box" | "container" | "overlay";

export interface PreviewPaletteSeed {
  id: string;
  darkBG: boolean;
  background: string;
  foreground: string;
}

export interface WidgetPreset {
  id: string;
  category: WidgetCategory;
  groupKey: WidgetGroupKey;
  packageName: string;
  title: string;
  subtitle: string;
  contentType: ContentType;
  baseId: string;
  insertKind: WidgetInsertKind;
  containerKind?: "JoinHorizontal" | "JoinVertical";
  overlayConfig?: {
    anchor: OverlayAnchor;
    width: number;
    height: number;
    content: string;
    baseId: string;
    borderColor?: string;
  };
  keysHint: string;
  width: IRSize;
  height: IRSize;
  content: string;
  stylePatch: Partial<IRStyle>;
  previewCols: number;
  previewRows: number;
  buildPreviewDoc: (palette: PreviewPaletteSeed) => IRDoc;
}

export const WIDGET_CATEGORIES: WidgetCategory[] = [
  "Layout",
  "Text",
  "Input",
  "Data",
  "Feedback",
  "Containers",
];

function previewTokens(palette: PreviewPaletteSeed): Record<string, TokenPair> {
  const fg = palette.foreground || (palette.darkBG ? "#c0caf5" : "#2d2240");
  const bg = palette.background || (palette.darkBG ? "#1f2335" : "#f5f1fc");
  return {
    accent: { light: "#5b37f0", dark: "#ff5eae" },
    borderIdle: { light: "#8d79b3", dark: "#565f89" },
    textMain: { light: fg, dark: fg },
    textMuted: { light: "#6c5a85", dark: "#9aa5ce" },
    modalGlow: { light: "#5b37f0", dark: "#b9a2ff" },
    surface: { light: bg, dark: bg },
    success: { light: "#0d9668", dark: "#6dffc2" },
  };
}

function singleBoxPreviewDoc(
  presetId: string,
  contentType: ContentType,
  content: string,
  stylePatch: Partial<IRStyle>,
  palette: PreviewPaletteSeed,
  overrides?: {
    width?: IRSize;
    height?: IRSize;
  }
): IRDoc {
  const widgetData = defaultWidgetData(contentType);
  const style: IRStyle = {
    border: "rounded",
    borderEdges: [true, true, true, true],
    borderColor: "$borderIdle",
    fg: "$textMain",
    padding: [0, 1, 0, 1],
    margin: [0, 0, 0, 0],
    bold: false,
    ...stylePatch,
  };
  return {
    tokens: previewTokens(palette),
    styles: { previewStyle: style },
    root: {
      id: `preview_root_${presetId}`,
      kind: "JoinVertical",
      children: [
        {
          id: `preview_${presetId}`,
          kind: "Box",
          style: "previewStyle",
          contentType,
          width: overrides?.width ?? { mode: "fill", weight: 1 },
          height: overrides?.height ?? { mode: "fill", weight: 1 },
          content,
          ...(Object.keys(widgetData).length > 0 ? { widgetData } : {}),
        },
      ],
    },
    overlays: [],
  };
}

export const WIDGET_PRESETS: WidgetPreset[] = [
  {
    id: "lipgloss-box",
    category: "Layout",
    groupKey: "lipgloss",
    packageName: "charm.land/lipgloss/v2",
    title: "Styled Box",
    subtitle: "Flexible border, padding, margin, and adaptive color text container.",
    contentType: "text",
    baseId: "pane",
    insertKind: "box",
    keysHint: "Inspector props",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fill", weight: 1 },
    content: "New Lip Gloss Box\nEdit text & borders in Inspector →",
    stylePatch: { border: "rounded", borderColor: "$borderIdle", padding: [1, 2, 1, 2] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) =>
      singleBoxPreviewDoc(
        "lipgloss-box",
        "text",
        "Styled Content\nBorder · Padding · Tokens",
        { border: "rounded", borderColor: "$accent", padding: [1, 2, 1, 2], alignH: "center", alignV: "center" },
        palette
      ),
  },
  {
    id: "lipgloss-banner",
    category: "Layout",
    groupKey: "lipgloss",
    packageName: "charm.land/lipgloss/v2",
    title: "Header / Status Bar",
    subtitle: "Compact fixed-height header strip or bottom keybinding bar.",
    contentType: "text",
    baseId: "statusBar",
    insertKind: "box",
    keysHint: "Fixed height",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fixed", value: 2 },
    content: "✦ CHARM APP  •  ↑/↓ navigate  •  q quit",
    stylePatch: {
      border: "normal",
      borderEdges: [true, false, false, false],
      borderColor: "$borderIdle",
      fg: "$accent",
      padding: [0, 1, 0, 1],
      bold: true,
      truncate: true,
    },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) => ({
      tokens: previewTokens(palette),
      styles: {
        topBody: {
          border: "rounded",
          borderEdges: [true, true, true, true],
          borderColor: "$borderIdle",
          fg: "$textMuted",
          padding: [0, 1, 0, 1],
          margin: [0, 0, 0, 0],
          bold: false,
          alignV: "center",
        },
        bar: {
          border: "normal",
          borderEdges: [true, false, false, false],
          borderColor: "$accent",
          fg: "$accent",
          padding: [0, 1, 0, 1],
          margin: [0, 0, 0, 0],
          bold: true,
          truncate: true,
        },
      },
      root: {
        id: "preview_root_lipgloss-banner",
        kind: "JoinVertical",
        children: [
          {
            id: "preview_body_banner",
            kind: "Box",
            style: "topBody",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fill", weight: 1 },
            content: "Workspace content area",
          },
          {
            id: "preview_lipgloss-banner",
            kind: "Box",
            style: "bar",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 2 },
            content: "READY • ↑/↓ move • q quit",
          },
        ],
      },
      overlays: [],
    }),
  },
  {
    id: "container-row",
    category: "Containers",
    groupKey: "layout",
    packageName: "charm.land/lipgloss/v2#JoinHorizontal",
    title: "Horizontal Row",
    subtitle: "Side-by-side split container with two balanced child panes.",
    contentType: "text",
    baseId: "row",
    insertKind: "container",
    containerKind: "JoinHorizontal",
    keysHint: "2 child panes",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fill", weight: 1 },
    content: "",
    stylePatch: { border: "rounded", borderColor: "$borderIdle", padding: [0, 1, 0, 1] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) => ({
      tokens: previewTokens(palette),
      styles: {
        leftCol: {
          border: "rounded",
          borderEdges: [true, true, true, true],
          borderColor: "$accent",
          fg: "$textMain",
          padding: [1, 1, 1, 1],
          margin: [0, 1, 0, 0],
          bold: false,
          alignH: "center",
          alignV: "center",
        },
        rightCol: {
          border: "rounded",
          borderEdges: [true, true, true, true],
          borderColor: "$borderIdle",
          fg: "$textMuted",
          padding: [1, 1, 1, 1],
          margin: [0, 0, 0, 0],
          bold: false,
          alignH: "center",
          alignV: "center",
        },
      },
      root: {
        id: "preview_container-row",
        kind: "JoinHorizontal",
        children: [
          {
            id: "preview_row_left",
            kind: "Box",
            style: "leftCol",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fill", weight: 1 },
            content: "Pane A",
          },
          {
            id: "preview_row_right",
            kind: "Box",
            style: "rightCol",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fill", weight: 1 },
            content: "Pane B",
          },
        ],
      },
      overlays: [],
    }),
  },
  {
    id: "container-stack",
    category: "Containers",
    groupKey: "layout",
    packageName: "charm.land/lipgloss/v2#JoinVertical",
    title: "Vertical Stack",
    subtitle: "Top-to-bottom layout container with two stacked child panes.",
    contentType: "text",
    baseId: "stack",
    insertKind: "container",
    containerKind: "JoinVertical",
    keysHint: "2 child panes",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fill", weight: 1 },
    content: "",
    stylePatch: { border: "rounded", borderColor: "$borderIdle", padding: [0, 1, 0, 1] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) => ({
      tokens: previewTokens(palette),
      styles: {
        topPane: {
          border: "rounded",
          borderEdges: [true, true, true, true],
          borderColor: "$accent",
          fg: "$textMain",
          padding: [0, 1, 0, 1],
          margin: [0, 0, 0, 0],
          bold: false,
          alignH: "center",
          alignV: "center",
        },
        bottomPane: {
          border: "rounded",
          borderEdges: [true, true, true, true],
          borderColor: "$borderIdle",
          fg: "$textMuted",
          padding: [0, 1, 0, 1],
          margin: [0, 0, 0, 0],
          bold: false,
          alignH: "center",
          alignV: "center",
        },
      },
      root: {
        id: "preview_container-stack",
        kind: "JoinVertical",
        children: [
          {
            id: "preview_stack_top",
            kind: "Box",
            style: "topPane",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fill", weight: 1 },
            content: "Top Pane",
          },
          {
            id: "preview_stack_bottom",
            kind: "Box",
            style: "bottomPane",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fill", weight: 1 },
            content: "Bottom Pane",
          },
        ],
      },
      overlays: [],
    }),
  },
  {
    id: "bubbles-list",
    category: "Data",
    groupKey: "bubbles",
    packageName: "charm.land/bubbles/v2/list",
    title: "Bubbles List",
    subtitle: "Interactive filterable navigation list (bubbles/v2/list).",
    contentType: "bubble:list",
    baseId: "navList",
    insertKind: "box",
    keysHint: "↑/↓  / filter",
    width: { mode: "fixed", value: 28, collapseBelow: 70 },
    height: { mode: "fill", weight: 1 },
    content: "Navigation",
    stylePatch: { border: "rounded", borderColor: "$accent", padding: [0, 1, 0, 1] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) =>
      singleBoxPreviewDoc(
        "bubbles-list",
        "bubble:list",
        "Navigation",
        { border: "rounded", borderColor: "$accent", padding: [0, 1, 0, 1] },
        palette
      ),
  },
  {
    id: "bubbles-table",
    category: "Data",
    groupKey: "bubbles",
    packageName: "charm.land/bubbles/v2/table",
    title: "Bubbles Table",
    subtitle: "Selectable multi-column data table (bubbles/v2/table).",
    contentType: "bubble:table",
    baseId: "dataTable",
    insertKind: "box",
    keysHint: "↑/↓  j/k",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fill", weight: 1 },
    content: "Services",
    stylePatch: { border: "normal", borderColor: "$borderIdle", padding: [1, 2, 1, 2] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) =>
      singleBoxPreviewDoc(
        "bubbles-table",
        "bubble:table",
        "Services",
        { border: "normal", borderColor: "$borderIdle", padding: [0, 1, 0, 1] },
        palette
      ),
  },
  {
    id: "bubbles-viewport",
    category: "Data",
    groupKey: "bubbles",
    packageName: "charm.land/bubbles/v2/viewport",
    title: "Bubbles Viewport",
    subtitle: "Scrollable log stream or diff viewer (bubbles/v2/viewport).",
    contentType: "bubble:viewport",
    baseId: "logView",
    insertKind: "box",
    keysHint: "↑/↓  PgUp/Dn",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fill", weight: 1 },
    content: "",
    stylePatch: { border: "rounded", borderColor: "$borderIdle", padding: [0, 1, 0, 1] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) =>
      singleBoxPreviewDoc(
        "bubbles-viewport",
        "bubble:viewport",
        "",
        { border: "rounded", borderColor: "$borderIdle", padding: [0, 1, 0, 1] },
        palette
      ),
  },
  {
    id: "bubbles-textinput",
    category: "Input",
    groupKey: "bubbles",
    packageName: "charm.land/bubbles/v2/textinput",
    title: "Bubbles TextInput",
    subtitle: "Live single-line command/search input (bubbles/v2/textinput).",
    contentType: "bubble:textinput",
    baseId: "searchInput",
    insertKind: "box",
    keysHint: "Type live",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fixed", value: 3 },
    content: "",
    stylePatch: { border: "rounded", borderColor: "$accent", padding: [0, 1, 0, 1] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) => ({
      tokens: previewTokens(palette),
      styles: {
        inputStyle: {
          border: "rounded",
          borderEdges: [true, true, true, true],
          borderColor: "$accent",
          fg: "$textMain",
          padding: [0, 1, 0, 1],
          margin: [1, 0, 0, 0],
          bold: false,
        },
      },
      root: {
        id: "preview_root_bubbles-textinput",
        kind: "JoinVertical",
        children: [
          {
            id: "preview_bubbles-textinput",
            kind: "Box",
            style: "inputStyle",
            contentType: "bubble:textinput",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 3 },
            content: "",
            widgetData: defaultWidgetData("bubble:textinput"),
          },
        ],
      },
      overlays: [],
    }),
  },
  {
    id: "huh-form",
    category: "Input",
    groupKey: "huh",
    packageName: "charm.land/huh/v2",
    title: "Huh Interactive Form",
    subtitle: "Multi-field CLI form: Input, Stack Select & Yes/No Confirm.",
    contentType: "huh:form",
    baseId: "huhForm",
    insertKind: "box",
    keysHint: "Tab  ←/→  Enter",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fill", weight: 1 },
    content: "",
    stylePatch: { border: "rounded", borderColor: "$accent", padding: [1, 2, 1, 2] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) =>
      singleBoxPreviewDoc(
        "huh-form",
        "huh:form",
        "",
        { border: "rounded", borderColor: "$accent", padding: [0, 1, 0, 1] },
        palette
      ),
  },
  {
    id: "glamour-markdown",
    category: "Text",
    groupKey: "glamour",
    packageName: "github.com/charmbracelet/glamour",
    title: "Glamour Markdown",
    subtitle: "Styled Markdown headings, code blocks & quotes inside any pane.",
    contentType: "glamour:markdown",
    baseId: "markdownDoc",
    insertKind: "box",
    keysHint: "↑/↓  Edit MD",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fill", weight: 1 },
    content: "# Release Notes\n\nStyled with **Glamour**.\n\n- Responsive word wrap\n- Adaptive theme tokens\n\n```go\nfmt.Println(\"Ready\")\n```",
    stylePatch: { border: "rounded", borderColor: "$accent", padding: [1, 2, 1, 2] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) =>
      singleBoxPreviewDoc(
        "glamour-markdown",
        "glamour:markdown",
        "# Release Notes\n\n- Word wrap\n- Theme tokens",
        { border: "rounded", borderColor: "$accent", padding: [0, 1, 0, 1] },
        palette
      ),
  },
  {
    id: "gum-choose",
    category: "Input",
    groupKey: "gum",
    packageName: "github.com/charmbracelet/gum/choose",
    title: "Gum Choose & Filter",
    subtitle: "Interactive multi-select checklist with live fuzzy search.",
    contentType: "gum:choose",
    baseId: "gumChoose",
    insertKind: "box",
    keysHint: "↑/↓  Space  Type",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fill", weight: 1 },
    content: "# Pick items to run\nbuild-wasm\nrun-tests\ndeploy-edge\nsync-tokens",
    stylePatch: { border: "rounded", borderColor: "$accent", padding: [1, 2, 1, 2] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) =>
      singleBoxPreviewDoc(
        "gum-choose",
        "gum:choose",
        "# Pick tasks\nbuild-wasm\nrun-tests\ndeploy-edge",
        { border: "rounded", borderColor: "$accent", padding: [0, 1, 0, 1] },
        palette
      ),
  },
  {
    id: "gum-confirm",
    category: "Feedback",
    groupKey: "gum",
    packageName: "github.com/charmbracelet/gum/confirm",
    title: "Gum Confirm Prompt",
    subtitle: "Interactive Yes / No confirmation dialog exported to gum.sh.",
    contentType: "gum:confirm",
    baseId: "gumConfirm",
    insertKind: "box",
    keysHint: "←/→  y/n  Enter",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fixed", value: 7 },
    content: "Deploy updated TUI release?",
    stylePatch: { border: "rounded", borderColor: "$modalGlow", bg: "$surface", padding: [1, 2, 1, 2] },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) =>
      singleBoxPreviewDoc(
        "gum-confirm",
        "gum:confirm",
        "Deploy updated release?",
        { border: "rounded", borderColor: "$modalGlow", bg: "$surface", padding: [0, 1, 0, 1] },
        palette
      ),
  },
  {
    id: "feedback-toast",
    category: "Feedback",
    groupKey: "overlay",
    packageName: "charm.land/lipgloss/v2#Canvas",
    title: "Toast Notice Overlay",
    subtitle: "Floating bottom-right status notification on the overlay layer.",
    contentType: "text",
    baseId: "toastNotice",
    insertKind: "overlay",
    overlayConfig: {
      anchor: "bottom-right",
      width: 28,
      height: 4,
      content: "✓ Saved\nChanges synced",
      baseId: "toastNotice",
      borderColor: "$modalGlow",
    },
    keysHint: "Overlay layer",
    width: { mode: "fixed", value: 28 },
    height: { mode: "fixed", value: 4 },
    content: "✓ Saved\nChanges synced",
    stylePatch: {
      border: "rounded",
      borderColor: "$modalGlow",
      bg: "$surface",
      fg: "$textMain",
      padding: [0, 2, 0, 2],
      bold: true,
    },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) => ({
      tokens: previewTokens(palette),
      styles: {
        backdrop: {
          border: "normal",
          borderEdges: [true, true, true, true],
          borderColor: "$borderIdle",
          fg: "$textMuted",
          padding: [0, 1, 0, 1],
          margin: [0, 0, 0, 0],
          bold: false,
        },
        toast: {
          border: "rounded",
          borderEdges: [true, true, true, true],
          borderColor: "$success",
          fg: "$textMain",
          bg: "$surface",
          padding: [0, 1, 0, 1],
          margin: [0, 0, 0, 0],
          bold: true,
        },
      },
      root: {
        id: "preview_root_feedback-toast",
        kind: "JoinVertical",
        children: [
          {
            id: "preview_bg_toast",
            kind: "Box",
            style: "backdrop",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fill", weight: 1 },
            content: "Main canvas",
          },
        ],
      },
      overlays: [
        {
          id: "preview_ov_toast",
          visible: true,
          z: 10,
          anchor: "bottom-right",
          node: {
            id: "preview_feedback-toast",
            kind: "Box",
            style: "toast",
            contentType: "text",
            width: { mode: "fixed", value: 22 },
            height: { mode: "fixed", value: 3 },
            content: "✓ Sync complete",
          },
        },
      ],
    }),
  },
  {
    id: "feedback-dialog",
    category: "Feedback",
    groupKey: "overlay",
    packageName: "charm.land/lipgloss/v2#Canvas",
    title: "Modal Dialog Overlay",
    subtitle: "Centered floating dialog overlay above the active layout.",
    contentType: "text",
    baseId: "dialogModal",
    insertKind: "overlay",
    overlayConfig: {
      anchor: "center",
      width: 38,
      height: 7,
      content: "Confirm Action\nPress Enter to apply or Esc to cancel",
      baseId: "dialogModal",
      borderColor: "$modalGlow",
    },
    keysHint: "Centered overlay",
    width: { mode: "fixed", value: 38 },
    height: { mode: "fixed", value: 7 },
    content: "Confirm Action\nPress Enter to apply or Esc to cancel",
    stylePatch: {
      border: "double",
      borderColor: "$modalGlow",
      bg: "$surface",
      fg: "$textMain",
      padding: [1, 2, 1, 2],
      bold: true,
      alignH: "center",
      alignV: "center",
    },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) => ({
      tokens: previewTokens(palette),
      styles: {
        backdrop: {
          border: "normal",
          borderEdges: [true, true, true, true],
          borderColor: "$borderIdle",
          fg: "$textMuted",
          padding: [0, 1, 0, 1],
          margin: [0, 0, 0, 0],
          bold: false,
        },
        modal: {
          border: "double",
          borderEdges: [true, true, true, true],
          borderColor: "$modalGlow",
          fg: "$textMain",
          bg: "$surface",
          padding: [0, 1, 0, 1],
          margin: [0, 0, 0, 0],
          bold: true,
          alignH: "center",
          alignV: "center",
        },
      },
      root: {
        id: "preview_root_feedback-dialog",
        kind: "JoinVertical",
        children: [
          {
            id: "preview_bg_dialog",
            kind: "Box",
            style: "backdrop",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fill", weight: 1 },
            content: "Background layout",
          },
        ],
      },
      overlays: [
        {
          id: "preview_ov_dialog",
          visible: true,
          z: 12,
          anchor: "center",
          node: {
            id: "preview_feedback-dialog",
            kind: "Box",
            style: "modal",
            contentType: "text",
            width: { mode: "fixed", value: 24 },
            height: { mode: "fixed", value: 5 },
            content: "Confirm Action\n[Enter]   [Esc]",
          },
        },
      ],
    }),
  },
  {
    id: "wish-ssh",
    category: "Text",
    groupKey: "wish",
    packageName: "charm.land/wish/v2",
    title: "Wish SSH Banner",
    subtitle: "SSH PTY session bar and wires server entrypoint to wish.NewServer().",
    contentType: "wish:ssh",
    baseId: "wishBanner",
    insertKind: "box",
    keysHint: "Press r to cycle",
    width: { mode: "fill", weight: 1 },
    height: { mode: "fixed", value: 4 },
    content: "ssh git.charm.land -p 2323",
    stylePatch: {
      border: "normal",
      borderEdges: [false, false, true, false],
      borderColor: "$modalGlow",
      bg: "$surface",
      padding: [0, 2, 0, 2],
    },
    previewCols: 34,
    previewRows: 7,
    buildPreviewDoc: (palette) => ({
      tokens: previewTokens(palette),
      styles: {
        sshStyle: {
          border: "normal",
          borderEdges: [false, false, true, false],
          borderColor: "$modalGlow",
          fg: "$textMain",
          bg: "$surface",
          padding: [0, 1, 0, 1],
          margin: [1, 0, 0, 0],
          bold: false,
        },
      },
      root: {
        id: "preview_root_wish-ssh",
        kind: "JoinVertical",
        children: [
          {
            id: "preview_wish-ssh",
            kind: "Box",
            style: "sshStyle",
            contentType: "wish:ssh",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 4 },
            content: "ssh tui.example.dev -p 2323",
          },
        ],
      },
      overlays: [],
    }),
  },
];
