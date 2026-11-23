export interface WidgetPickerCategoryStrings {
  All: string;
  Layout: string;
  Text: string;
  Input: string;
  Data: string;
  Feedback: string;
  Containers: string;
}

export interface WidgetPickerStrings {
  dialogLabel: string;
  title: string;
  subtitlePrefix: string;
  subtitleSuffix: string;
  targetPrefix: string;
  closeLabel: string;
  searchPlaceholder: string;
  searchAriaLabel: string;
  clearSearchLabel: string;
  categoriesLabel: string;
  categories: WidgetPickerCategoryStrings;
  insertActionLabel: string;
  keyboardHint: string;
  emptyTitle: string;
  emptySubtitle: string;
  clearFiltersLabel: string;
  previewLoadingLabel: string;
  previewErrorLabel: string;
  resultsSummary: (visible: number, total: number) => string;
  cardAriaLabel: (title: string, groupLabel: string, category: string, packageName: string) => string;
}

export const WIDGET_PICKER_STRINGS: WidgetPickerStrings = {
  dialogLabel: "Browse widgets",
  title: "Browse widgets",
  subtitlePrefix: "Insert into or beside",
  subtitleSuffix: "using live workspace styles.",
  targetPrefix: "#",
  closeLabel: "Close widget picker",
  searchPlaceholder: "Search widgets or packages",
  searchAriaLabel: "Search widgets or packages",
  clearSearchLabel: "Clear search",
  categoriesLabel: "Widget categories",
  categories: {
    All: "All",
    Layout: "Layout",
    Text: "Text",
    Input: "Input",
    Data: "Data",
    Feedback: "Feedback",
    Containers: "Containers",
  },
  insertActionLabel: "Insert",
  keyboardHint: "Arrow keys navigate grid · Enter inserts · Esc closes",
  emptyTitle: "No widgets match your filter",
  emptySubtitle: "Try searching a different widget name, category, or Go package path.",
  clearFiltersLabel: "Clear filters",
  previewLoadingLabel: "Rendering preview",
  previewErrorLabel: "Preview unavailable",
  resultsSummary: (visible, total) =>
    visible === total
      ? `${total} widgets available`
      : `Showing ${visible} of ${total} widgets`,
  cardAriaLabel: (title, groupLabel, category, packageName) =>
    `${title}, ${category} widget from ${groupLabel} (${packageName})`,
};
