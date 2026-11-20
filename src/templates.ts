import type { IRDoc } from "./types";

export interface StudioTemplate {
  id: string;
  label: string;
  defaultSelectedId: string;
  doc: IRDoc;
}

export const TEMPLATES: StudioTemplate[] = [
  {
    id: "infra-dashboard",
    label: "Infra Dashboard (List + Table)",
    defaultSelectedId: "mainPane",
    doc: {
      tokens: {
        accent:     { light: "#2e7de9", dark: "#7aa2f7" },
        borderIdle: { light: "#9aa5ce", dark: "#414868" },
        textMain:   { light: "#3760bf", dark: "#c0caf5" },
        modalGlow:  { light: "#9854f1", dark: "#bb9af7" },
        surface:    { light: "#d5d6db", dark: "#1f2335" },
      },
      styles: {
        sidebar: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$accent", fg: "$textMain",
          padding: [0, 1, 0, 1], margin: [0, 1, 0, 0], bold: false,
        },
        main: {
          border: "normal", borderEdges: [true, true, true, true], borderColor: "$borderIdle", fg: "$textMain",
          padding: [1, 2, 1, 2], margin: [0, 0, 0, 0], bold: false,
        },
        status: {
          border: "none", borderEdges: [true, true, true, true], borderColor: "", fg: "$accent",
          padding: [0, 1, 0, 1], margin: [0, 0, 0, 0], bold: true, truncate: true,
        },
        modal: {
          border: "double", borderEdges: [true, true, true, true], borderColor: "$modalGlow", fg: "$textMain", bg: "$surface",
          padding: [1, 2, 1, 2], margin: [0, 0, 0, 0], bold: true, alignH: "center", alignV: "center",
        },
      },
      root: {
        id: "shell",
        kind: "JoinVertical",
        children: [
          {
            id: "body",
            kind: "JoinHorizontal",
            height: { mode: "fill", weight: 1 },
            children: [
              {
                id: "sidebar",
                kind: "Box",
                style: "sidebar",
                contentType: "bubble:list",
                width: { mode: "fixed", value: 30, collapseBelow: 70 },
                height: { mode: "fill", weight: 1 },
                content: "Navigation",
              },
              {
                id: "mainPane",
                kind: "Box",
                style: "main",
                contentType: "bubble:table",
                width: { mode: "fill", weight: 1 },
                height: { mode: "fill", weight: 1 },
                content: "Main workspace",
              },
            ],
          },
          {
            id: "statusBar",
            kind: "Box",
            style: "status",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 1 },
            content: "Click a pane & press ↑/↓/j/k to drive Bubbles v2 • /: filter list",
          },
        ],
      },
      overlays: [
        {
          id: "helpModal",
          visible: false,
          z: 10,
          node: {
            id: "modalCard",
            kind: "Box",
            style: "modal",
            contentType: "text",
            width: { mode: "fixed", value: 44 },
            height: { mode: "fixed", value: 9 },
            content: "Keyboard Shortcuts (v2 Layer)\n\n↑/↓  Scroll active Bubble\n/    Filter list items",
          },
        },
      ],
    },
  },
  {
    id: "log-viewer",
    label: "Log Stream + Search Input",
    defaultSelectedId: "searchBar",
    doc: {
      tokens: {
        accent:     { light: "#2e7de9", dark: "#7aa2f7" },
        borderIdle: { light: "#9aa5ce", dark: "#414868" },
        textMain:   { light: "#3760bf", dark: "#c0caf5" },
        modalGlow:  { light: "#9854f1", dark: "#bb9af7" },
        surface:    { light: "#d5d6db", dark: "#1f2335" },
      },
      styles: {
        searchStyle: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$accent", fg: "$textMain",
          padding: [0, 1, 0, 1], margin: [0, 0, 0, 0], bold: false,
        },
        logsStyle: {
          border: "normal", borderEdges: [false, false, false, true], borderColor: "$borderIdle", fg: "$textMain",
          padding: [0, 1, 0, 2], margin: [0, 0, 0, 0], bold: false,
        },
        footerStyle: {
          border: "normal", borderEdges: [true, false, false, false], borderColor: "$borderIdle", fg: "$accent",
          padding: [0, 1, 0, 1], margin: [0, 0, 0, 0], bold: true, truncate: true,
        },
        modal: {
          border: "double", borderEdges: [true, true, true, true], borderColor: "$modalGlow", fg: "$textMain", bg: "$surface",
          padding: [1, 2, 1, 2], margin: [0, 0, 0, 0], bold: true, alignH: "center", alignV: "center",
        },
      },
      root: {
        id: "shell",
        kind: "JoinVertical",
        children: [
          {
            id: "searchBar",
            kind: "Box",
            style: "searchStyle",
            contentType: "bubble:textinput",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 3 },
            content: "",
          },
          {
            id: "logPane",
            kind: "Box",
            style: "logsStyle",
            contentType: "bubble:viewport",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fill", weight: 1 },
            content: "",
          },
          {
            id: "statusBar",
            kind: "Box",
            style: "footerStyle",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 2 },
            content: "STREAM: prod-us-east-1 • ↑/↓ scroll logs • click Search bar to type",
          },
        ],
      },
      overlays: [
        {
          id: "helpModal",
          visible: false,
          z: 10,
          node: {
            id: "modalCard",
            kind: "Box",
            style: "modal",
            contentType: "text",
            width: { mode: "fixed", value: 44 },
            height: { mode: "fixed", value: 8 },
            content: "Log Filter Tips\n\nClick top input & type\nClick log pane & press ↑/↓",
          },
        },
      ],
    },
  },
  {
    id: "lazygit-kanban",
    label: "3-Pane Git / Kanban Split",
    defaultSelectedId: "diffPane",
    doc: {
      tokens: {
        accent:     { light: "#2e7de9", dark: "#7aa2f7" },
        borderIdle: { light: "#9aa5ce", dark: "#414868" },
        textMain:   { light: "#3760bf", dark: "#c0caf5" },
        modalGlow:  { light: "#9854f1", dark: "#bb9af7" },
        surface:    { light: "#d5d6db", dark: "#1f2335" },
      },
      styles: {
        headerBar: {
          border: "normal", borderEdges: [false, false, true, false], borderColor: "$accent", fg: "$accent",
          padding: [0, 1, 0, 1], margin: [0, 0, 0, 0], bold: true, truncate: true,
        },
        leftCol: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$borderIdle", fg: "$textMain",
          padding: [0, 1, 0, 1], margin: [0, 0, 0, 0], bold: false,
        },
        activeCol: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$accent", fg: "$textMain",
          padding: [0, 1, 0, 1], margin: [0, 0, 0, 0], bold: false,
        },
        modal: {
          border: "double", borderEdges: [true, true, true, true], borderColor: "$modalGlow", fg: "$textMain", bg: "$surface",
          padding: [1, 2, 1, 2], margin: [0, 0, 0, 0], bold: true, alignH: "center", alignV: "center",
        },
      },
      root: {
        id: "shell",
        kind: "JoinVertical",
        children: [
          {
            id: "topHeader",
            kind: "Box",
            style: "headerBar",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 2 },
            content: "charm-studio (main)  •  3 files changed",
          },
          {
            id: "columns",
            kind: "JoinHorizontal",
            height: { mode: "fill", weight: 1 },
            children: [
              {
                id: "leftStack",
                kind: "JoinVertical",
                width: { mode: "fill", weight: 1, collapseBelow: 72 },
                children: [
                  {
                    id: "filesBox",
                    kind: "Box",
                    style: "leftCol",
                    contentType: "text",
                    width: { mode: "fill", weight: 1 },
                    height: { mode: "fill", weight: 1 },
                    content: "Files\nM engine/main.go\nM web/App.tsx\nA web/Layers.tsx",
                  },
                  {
                    id: "branchesBox",
                    kind: "Box",
                    style: "leftCol",
                    contentType: "text",
                    width: { mode: "fill", weight: 1 },
                    height: { mode: "fill", weight: 1 },
                    content: "Branches\n* main\n  feat/wasm-v2\n  fix/overflow",
                  },
                ],
              },
              {
                id: "diffPane",
                kind: "Box",
                style: "activeCol",
                contentType: "bubble:viewport",
                width: { mode: "fill", weight: 2 },
                height: { mode: "fill", weight: 1 },
                content: "+ func NewStyles(hasDarkBG bool) Styles {\n+   ld := lipgloss.LightDark(hasDarkBG)\n+   return Styles{...}\n+ }\n\nScrollable diff / preview pane!\nShrink below 72 cols to collapse left stack.",
              },
            ],
          },
        ],
      },
      overlays: [
        {
          id: "helpModal",
          visible: false,
          z: 10,
          node: {
            id: "modalCard",
            kind: "Box",
            style: "modal",
            contentType: "text",
            width: { mode: "fixed", value: 40 },
            height: { mode: "fixed", value: 8 },
            content: "Git Keybindings\n\nspace  Stage file\nc      Commit",
          },
        },
      ],
    },
  },
  {
    id: "wizard-card",
    label: "CLI Wizard / Welcome Shell",
    defaultSelectedId: "heroBanner",
    doc: {
      tokens: {
        accent:     { light: "#2e7de9", dark: "#7aa2f7" },
        borderIdle: { light: "#9aa5ce", dark: "#414868" },
        textMain:   { light: "#3760bf", dark: "#c0caf5" },
        modalGlow:  { light: "#9854f1", dark: "#bb9af7" },
        surface:    { light: "#d5d6db", dark: "#1f2335" },
      },
      styles: {
        hero: {
          border: "thick", borderEdges: [true, true, true, true], borderColor: "$accent", fg: "$textMain", bg: "$surface",
          padding: [1, 2, 1, 2], margin: [1, 2, 0, 2], bold: true, alignH: "center", alignV: "center",
        },
        card: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$borderIdle", fg: "$textMain",
          padding: [1, 2, 1, 2], margin: [1, 1, 0, 2], bold: false,
        },
        cardRight: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$modalGlow", fg: "$textMain",
          padding: [1, 2, 1, 2], margin: [1, 2, 0, 0], bold: false,
        },
        hints: {
          border: "none", borderEdges: [true, true, true, true], borderColor: "", fg: "$accent",
          padding: [0, 2, 0, 2], margin: [0, 0, 0, 0], bold: false, alignH: "center", truncate: true,
        },
      },
      root: {
        id: "shell",
        kind: "JoinVertical",
        children: [
          {
            id: "heroBanner",
            kind: "Box",
            style: "hero",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 7 },
            content: "✦ CHARM CLI SCAFFOLDER ✦\nInteractive Bubble Tea v2 Setup",
          },
          {
            id: "cardsRow",
            kind: "JoinHorizontal",
            height: { mode: "fill", weight: 1 },
            children: [
              {
                id: "leftSteps",
                kind: "Box",
                style: "card",
                contentType: "text",
                width: { mode: "fill", weight: 1, collapseBelow: 68 },
                height: { mode: "fill", weight: 1 },
                content: "Steps\n1. Choose Theme\n2. Pick Layout\n3. Export Go",
              },
              {
                id: "promptInput",
                kind: "Box",
                style: "cardRight",
                contentType: "bubble:textinput",
                width: { mode: "fill", weight: 2 },
                height: { mode: "fill", weight: 1 },
                content: "",
              },
            ],
          },
          {
            id: "footer",
            kind: "Box",
            style: "hints",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 2 },
            content: "enter: confirm • esc: back • ?: help",
          },
        ],
      },
      overlays: [
        {
          id: "helpModal",
          visible: false,
          z: 10,
          node: {
            id: "modalCard",
            kind: "Box",
            style: "hero",
            contentType: "text",
            width: { mode: "fixed", value: 42 },
            height: { mode: "fixed", value: 7 },
            content: "Wizard Help\nPress Enter to continue",
          },
        },
      ],
    },
  },
];
