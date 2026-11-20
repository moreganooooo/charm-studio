import type { IRStyle } from "./types";

export interface StylePreset {
  id: string;
  label: string;
  description: string;
  patch: Partial<IRStyle>;
}

export const STYLE_PRESETS: StylePreset[] = [
  {
    id: "accent-card",
    label: "Accent Card",
    description: "Rounded border highlighted in accent color with comfortable padding.",
    patch: {
      border: "rounded",
      borderEdges: [true, true, true, true],
      borderColor: "$accent",
      fg: "$textMain",
      bg: "",
      padding: [1, 2, 1, 2],
      bold: false,
      alignH: "left",
      alignV: "top",
    },
  },
  {
    id: "elevated-surface",
    label: "Filled Surface",
    description: "Shaded background panel with glow border for hero cards & modals.",
    patch: {
      border: "rounded",
      borderEdges: [true, true, true, true],
      borderColor: "$modalGlow",
      fg: "$textMain",
      bg: "$surface",
      padding: [1, 2, 1, 2],
      bold: false,
      alignH: "left",
      alignV: "top",
    },
  },
  {
    id: "muted-sidebar",
    label: "Subtle Pane",
    description: "Thin neutral frame ideal for sidebars, navigation lists, and logs.",
    patch: {
      border: "normal",
      borderEdges: [true, true, true, true],
      borderColor: "$borderIdle",
      fg: "$textMain",
      bg: "",
      padding: [0, 1, 0, 1],
      bold: false,
      alignH: "left",
      alignV: "top",
    },
  },
  {
    id: "header-rule",
    label: "Header Divider",
    description: "Bottom-only border line with bold accent typography.",
    patch: {
      border: "normal",
      borderEdges: [false, false, true, false],
      borderColor: "$accent",
      fg: "$accent",
      bg: "",
      padding: [0, 1, 0, 1],
      bold: true,
      truncate: true,
    },
  },
  {
    id: "status-strip",
    label: "Status Bar",
    description: "Borderless single-line bar with truncation for footer key hints.",
    patch: {
      border: "none",
      borderEdges: [true, true, true, true],
      borderColor: "",
      fg: "$accent",
      bg: "$surface",
      padding: [0, 1, 0, 1],
      bold: true,
      truncate: true,
    },
  },
  {
    id: "double-dialog",
    label: "Dialog Frame",
    description: "Double-line modal border with centered alignment.",
    patch: {
      border: "double",
      borderEdges: [true, true, true, true],
      borderColor: "$modalGlow",
      fg: "$textMain",
      bg: "$surface",
      padding: [1, 2, 1, 2],
      bold: true,
      alignH: "center",
      alignV: "center",
    },
  },
];
