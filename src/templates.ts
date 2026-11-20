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
  {
    id: "glow-reader",
    label: "Glow Docs Reader (List + Glamour)",
    defaultSelectedId: "markdownPane",
    doc: {
      tokens: {
        accent:     { light: "#2e7de9", dark: "#7aa2f7" },
        borderIdle: { light: "#9aa5ce", dark: "#414868" },
        textMain:   { light: "#3760bf", dark: "#c0caf5" },
        modalGlow:  { light: "#9854f1", dark: "#bb9af7" },
        surface:    { light: "#d5d6db", dark: "#1f2335" },
      },
      styles: {
        fileTree: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$borderIdle", fg: "$textMain",
          padding: [0, 1, 0, 1], margin: [0, 1, 0, 0], bold: false,
        },
        reader: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$accent", fg: "$textMain",
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
            id: "workspace",
            kind: "JoinHorizontal",
            height: { mode: "fill", weight: 1 },
            children: [
              {
                id: "docsSidebar",
                kind: "Box",
                style: "fileTree",
                contentType: "bubble:list",
                width: { mode: "fixed", value: 28, collapseBelow: 72 },
                height: { mode: "fill", weight: 1 },
                content: "README.md",
              },
              {
                id: "markdownPane",
                kind: "Box",
                style: "reader",
                contentType: "glamour:markdown",
                width: { mode: "fill", weight: 1 },
                height: { mode: "fill", weight: 1 },
                content: "# Glow Markdown Reader\n\nRender **Glamour** terminal docs inside responsive **Lip Gloss** frames.\n\n## Highlights\n\n- Adaptive `LightDark` theme tokens\n- Automatic word wrap per viewport width\n- Scroll smoothly with `↑`/`↓` or `j`/`k`\n\n> Built for READMEs, changelogs, and SSH docs portals.\n\n```go\nout, _ := glamour.Render(md, \"dark\")\n```",
              },
            ],
          },
          {
            id: "glowFooter",
            kind: "Box",
            style: "status",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 1 },
            content: "GLOW + GLAMOUR • ↑/↓ scroll Markdown • edit source in Inspector",
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
            content: "Glow Reader Shortcuts\n\n↑/↓ or j/k  Scroll markdown\n/           Filter docs list",
          },
        },
      ],
    },
  },
  {
    id: "huh-onboarding",
    label: "Huh Interactive Form + Summary",
    defaultSelectedId: "huhFormPane",
    doc: {
      tokens: {
        accent:     { light: "#2e7de9", dark: "#7aa2f7" },
        borderIdle: { light: "#9aa5ce", dark: "#414868" },
        textMain:   { light: "#3760bf", dark: "#c0caf5" },
        modalGlow:  { light: "#9854f1", dark: "#bb9af7" },
        surface:    { light: "#d5d6db", dark: "#1f2335" },
      },
      styles: {
        formCard: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$accent", fg: "$textMain",
          padding: [1, 2, 1, 2], margin: [0, 1, 0, 0], bold: false,
        },
        summaryCard: {
          border: "normal", borderEdges: [true, true, true, true], borderColor: "$modalGlow", fg: "$textMain", bg: "$surface",
          padding: [1, 2, 1, 2], margin: [0, 0, 0, 0], bold: false,
        },
        hintBar: {
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
            id: "formRow",
            kind: "JoinHorizontal",
            height: { mode: "fill", weight: 1 },
            children: [
              {
                id: "huhFormPane",
                kind: "Box",
                style: "formCard",
                contentType: "huh:form",
                width: { mode: "fill", weight: 2 },
                height: { mode: "fill", weight: 1 },
                content: "",
              },
              {
                id: "notesPane",
                kind: "Box",
                style: "summaryCard",
                contentType: "glamour:markdown",
                width: { mode: "fill", weight: 1, collapseBelow: 74 },
                height: { mode: "fill", weight: 1 },
                content: "## Huh Form Spec\n\n- **Input**: Project slug\n- **Select**: Stack preset\n- **Confirm**: Wish SSH\n\n> Click form & press `Tab`, type, or `←`/`→`!",
              },
            ],
          },
          {
            id: "statusBar",
            kind: "Box",
            style: "hintBar",
            contentType: "text",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 1 },
            content: "HUH v0.6 • Click form to type • Tab/↑↓ switch fields • Enter submit",
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
            content: "Huh Form Controls\n\nTab / ↑↓   Next/prev field\n← / →      Cycle options",
          },
        },
      ],
    },
  },
  {
    id: "gum-pipeline",
    label: "Gum Shell Prompts (Choose + Confirm)",
    defaultSelectedId: "gumChoosePane",
    doc: {
      tokens: {
        accent:     { light: "#2e7de9", dark: "#7aa2f7" },
        borderIdle: { light: "#9aa5ce", dark: "#414868" },
        textMain:   { light: "#3760bf", dark: "#c0caf5" },
        modalGlow:  { light: "#9854f1", dark: "#bb9af7" },
        surface:    { light: "#d5d6db", dark: "#1f2335" },
      },
      styles: {
        chooseBox: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$accent", fg: "$textMain",
          padding: [1, 2, 1, 2], margin: [0, 0, 1, 0], bold: false,
        },
        confirmBox: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$modalGlow", fg: "$textMain", bg: "$surface",
          padding: [1, 2, 1, 2], margin: [0, 0, 0, 0], bold: false,
        },
        logBox: {
          border: "normal", borderEdges: [false, false, false, true], borderColor: "$borderIdle", fg: "$textMain",
          padding: [1, 2, 1, 2], margin: [0, 0, 0, 1], bold: false,
        },
        modal: {
          border: "double", borderEdges: [true, true, true, true], borderColor: "$modalGlow", fg: "$textMain", bg: "$surface",
          padding: [1, 2, 1, 2], margin: [0, 0, 0, 0], bold: true, alignH: "center", alignV: "center",
        },
      },
      root: {
        id: "shell",
        kind: "JoinHorizontal",
        children: [
          {
            id: "promptStack",
            kind: "JoinVertical",
            width: { mode: "fill", weight: 2 },
            children: [
              {
                id: "gumChoosePane",
                kind: "Box",
                style: "chooseBox",
                contentType: "gum:choose",
                width: { mode: "fill", weight: 1 },
                height: { mode: "fill", weight: 1 },
                content: "# Choose deployment targets\nedge-gateway-us\nauth-token-worker\nwasm-studio-cdn\nbilling-cron-job\nmetrics-collector",
              },
              {
                id: "gumConfirmPane",
                kind: "Box",
                style: "confirmBox",
                contentType: "gum:confirm",
                width: { mode: "fill", weight: 1 },
                height: { mode: "fixed", value: 8 },
                content: "Run rolling deploy across selected services?",
              },
            ],
          },
          {
            id: "gumOutputPane",
            kind: "Box",
            style: "logBox",
            contentType: "bubble:viewport",
            width: { mode: "fill", weight: 1, collapseBelow: 74 },
            height: { mode: "fill", weight: 1 },
            content: "",
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
            content: "Gum CLI Export\n\nOpen Go Code -> gum.sh\nfor copyable shell scripts!",
          },
        },
      ],
    },
  },
  {
    id: "wish-ssh-portal",
    label: "Wish SSH TUI / Soft Serve Portal",
    defaultSelectedId: "wishBanner",
    doc: {
      tokens: {
        accent:     { light: "#2e7de9", dark: "#7aa2f7" },
        borderIdle: { light: "#9aa5ce", dark: "#414868" },
        textMain:   { light: "#3760bf", dark: "#c0caf5" },
        modalGlow:  { light: "#9854f1", dark: "#bb9af7" },
        surface:    { light: "#d5d6db", dark: "#1f2335" },
      },
      styles: {
        sshBar: {
          border: "normal", borderEdges: [false, false, true, false], borderColor: "$modalGlow", fg: "$textMain", bg: "$surface",
          padding: [0, 2, 0, 2], margin: [0, 0, 0, 0], bold: false,
        },
        repoList: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$borderIdle", fg: "$textMain",
          padding: [0, 1, 0, 1], margin: [1, 1, 0, 0], bold: false,
        },
        repoReadme: {
          border: "rounded", borderEdges: [true, true, true, true], borderColor: "$accent", fg: "$textMain",
          padding: [1, 2, 1, 2], margin: [1, 0, 0, 0], bold: false,
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
            id: "wishBanner",
            kind: "Box",
            style: "sshBar",
            contentType: "wish:ssh",
            width: { mode: "fill", weight: 1 },
            height: { mode: "fixed", value: 4 },
            content: "ssh git.charm.land -p 2323",
          },
          {
            id: "portalBody",
            kind: "JoinHorizontal",
            height: { mode: "fill", weight: 1 },
            children: [
              {
                id: "repoNav",
                kind: "Box",
                style: "repoList",
                contentType: "bubble:list",
                width: { mode: "fixed", value: 28, collapseBelow: 72 },
                height: { mode: "fill", weight: 1 },
                content: "Repositories",
              },
              {
                id: "readmePreview",
                kind: "Box",
                style: "repoReadme",
                contentType: "glamour:markdown",
                width: { mode: "fill", weight: 1 },
                height: { mode: "fill", weight: 1 },
                content: "# Soft Serve SSH Portal\n\nServed over **Wish** with per-session **Bubble Tea** PTY sizing.\n\n- Automatic color downsampling (`TrueColor` -> `ANSI256`)\n- Live `WindowSizeMsg` responsive collapse\n\n```bash\nssh git.charm.land -p 2323\n```",
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
            width: { mode: "fixed", value: 44 },
            height: { mode: "fixed", value: 8 },
            content: "Wish SSH Middleware\n\nExport main.go for a ready\nwish.NewServer(:2323) app!",
          },
        },
      ],
    },
  },
];
