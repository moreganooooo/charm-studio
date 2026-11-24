import type { ReactNode } from "react";
import type { WidgetPickerStrings } from "./widgetPickerStrings";
import type { WidgetGroupKey } from "./widgetPresets";

export interface PickerGroupPresentation {
  labels: Record<WidgetGroupKey, string>;
  accents: Record<WidgetGroupKey, string>;
}

export interface PickerPreviewPresentation {
  cols: number;
  rows: number;
  fontSize: number;
  borderRadius: number;
  borderColor: string;
  surfaceFallback: string;
}

export interface WidgetPickerSlots {
  /**
   * Nullable identity illustration slot anchored beside the header title.
   * Renders nothing gracefully when null so structure stays neutral-first.
   */
  illustration: ReactNode | null;
}

export interface WidgetPickerTheme {
  slots: WidgetPickerSlots;
  picker: {
    group: PickerGroupPresentation;
    preview: PickerPreviewPresentation;
  };
  strings?: Partial<WidgetPickerStrings>;
}

export const DEFAULT_WIDGET_PICKER_THEME: WidgetPickerTheme = {
  slots: {
    illustration: null,
  },
  picker: {
    group: {
      labels: {
        layout: "Lip Gloss Layout",
        lipgloss: "Lip Gloss",
        bubbles: "Bubbles",
        huh: "Huh",
        glamour: "Glamour",
        gum: "Gum",
        wish: "Wish",
        overlay: "Overlay Layer",
        harmonica: "Harmonica",
        ultraviolet: "Ultraviolet",
        cellbuf: "Cellbuf",
      },
      accents: {
        layout: "var(--cs-mint)",
        lipgloss: "var(--cs-pink)",
        bubbles: "var(--cs-mint)",
        huh: "var(--cs-lavender)",
        glamour: "var(--cs-pink-soft)",
        gum: "var(--cs-gold)",
        wish: "var(--cs-lilac-text)",
        overlay: "var(--cs-lavender-text)",
        harmonica: "var(--cs-pink)",
        ultraviolet: "var(--cs-lavender)",
        cellbuf: "var(--cs-gold)",
      },
    },
    preview: {
      cols: 34,
      rows: 7,
      fontSize: 8.5,
      borderRadius: 6,
      borderColor: "var(--cs-border)",
      surfaceFallback: "var(--cs-input)",
    },
  },
};
