import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import type { TermPalette } from "../TerminalViewport";
import type { ColorProfile } from "../types";
import { WIDGET_PICKER_STRINGS } from "../widgetPickerStrings";
import { DEFAULT_WIDGET_PICKER_THEME, type WidgetPickerTheme } from "../widgetPickerTheme";
import { WIDGET_CATEGORIES, WIDGET_PRESETS, type WidgetCategory, type WidgetPreset } from "../widgetPresets";
import { WidgetPreviewCanvas } from "./WidgetPreviewCanvas";
import "./WidgetPicker.css";

export interface WidgetPickerProps {
  open: boolean;
  targetLabel: string;
  palette: TermPalette;
  colorProfile: ColorProfile;
  fontFamily?: string;
  theme?: WidgetPickerTheme;
  onClose: () => void;
  onSelectPreset: (preset: WidgetPreset) => void;
}

type CategoryFilter = "All" | WidgetCategory;

const FILTER_OPTIONS: CategoryFilter[] = ["All", ...WIDGET_CATEGORIES];

function measureGridColumns(cards: Array<HTMLButtonElement | null>, count: number): number {
  if (count <= 1) return 1;
  const firstTop = cards[0]?.offsetTop;
  if (firstTop === undefined) return 1;
  let cols = 0;
  for (let i = 0; i < count; i++) {
    const el = cards[i];
    if (!el) break;
    if (Math.abs(el.offsetTop - firstTop) <= 4) {
      cols++;
    } else {
      break;
    }
  }
  return Math.max(1, cols);
}

export function WidgetPicker({
  open,
  targetLabel,
  palette,
  colorProfile,
  fontFamily,
  theme = DEFAULT_WIDGET_PICKER_THEME,
  onClose,
  onSelectPreset,
}: WidgetPickerProps) {
  const strings = useMemo(
    () => ({
      ...WIDGET_PICKER_STRINGS,
      ...(theme.strings ?? {}),
      categories: {
        ...WIDGET_PICKER_STRINGS.categories,
        ...(theme.strings?.categories ?? {}),
      },
    }),
    [theme.strings]
  );

  const [activeCategory, setActiveCategory] = useState<CategoryFilter>("All");
  const [query, setQuery] = useState("");
  const [activeCardIndex, setActiveCardIndex] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WIDGET_PRESETS.filter((preset) => {
      if (activeCategory !== "All" && preset.category !== activeCategory) return false;
      if (!q) return true;
      const groupLabel = theme.picker.group.labels[preset.groupKey] ?? preset.groupKey;
      return (
        preset.title.toLowerCase().includes(q) ||
        preset.subtitle.toLowerCase().includes(q) ||
        preset.category.toLowerCase().includes(q) ||
        preset.packageName.toLowerCase().includes(q) ||
        groupLabel.toLowerCase().includes(q) ||
        preset.keysHint.toLowerCase().includes(q)
      );
    });
  }, [activeCategory, query, theme.picker.group.labels]);

  const clampedCardIndex = filtered.length > 0 ? Math.min(activeCardIndex, filtered.length - 1) : 0;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      if (previousFocusRef.current && previousFocusRef.current.isConnected) {
        previousFocusRef.current.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  const handleClose = () => {
    setActiveCardIndex(0);
    onClose();
  };

  const handleInsert = (preset: WidgetPreset) => {
    setActiveCardIndex(0);
    onSelectPreset(preset);
    onClose();
  };

  const handleDialogKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
      return;
    }

    if (e.key === "Tab" && dialogRef.current) {
      const focusables = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), [tabindex="0"]'
        )
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && filtered.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      setActiveCardIndex(0);
      cardRefs.current[0]?.focus();
      return;
    }
    if (e.key === "Enter" && filtered.length > 0) {
      e.preventDefault();
      e.stopPropagation();
      if (filtered.length === 1) {
        handleInsert(filtered[0]);
      } else {
        setActiveCardIndex(0);
        cardRefs.current[0]?.focus();
      }
    }
  };

  const handleTabKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | null = null;
    if (e.key === "ArrowRight") {
      nextIndex = (index + 1) % FILTER_OPTIONS.length;
    } else if (e.key === "ArrowLeft") {
      nextIndex = (index - 1 + FILTER_OPTIONS.length) % FILTER_OPTIONS.length;
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = FILTER_OPTIONS.length - 1;
    } else if (e.key === "ArrowDown" && filtered.length > 0) {
      e.preventDefault();
      setActiveCardIndex(0);
      cardRefs.current[0]?.focus();
      return;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      const nextCategory = FILTER_OPTIONS[nextIndex];
      setActiveCategory(nextCategory);
      setActiveCardIndex(0);
      tabRefs.current[nextIndex]?.focus();
    }
  };

  const handleCardKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const count = filtered.length;
    if (count === 0) return;

    const cols = measureGridColumns(cardRefs.current, count);
    let nextIndex: number | null = null;

    if (e.key === "ArrowRight") {
      nextIndex = Math.min(count - 1, index + 1);
    } else if (e.key === "ArrowLeft") {
      nextIndex = Math.max(0, index - 1);
    } else if (e.key === "ArrowDown") {
      nextIndex = index + cols < count ? index + cols : index;
    } else if (e.key === "ArrowUp") {
      if (index - cols >= 0) {
        nextIndex = index - cols;
      } else {
        e.preventDefault();
        e.stopPropagation();
        searchInputRef.current?.focus();
        return;
      }
    } else if (e.key === "Home") {
      nextIndex = 0;
    } else if (e.key === "End") {
      nextIndex = count - 1;
    }

    if (nextIndex !== null) {
      e.preventDefault();
      e.stopPropagation();
      setActiveCardIndex(nextIndex);
      cardRefs.current[nextIndex]?.focus();
    }
  };

  const resetFilters = () => {
    setQuery("");
    setActiveCategory("All");
    setActiveCardIndex(0);
    searchInputRef.current?.focus();
  };

  return (
    <div className="widget-picker-backdrop" onClick={handleClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="widget-picker-heading"
        className="widget-picker-dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="widget-picker-header">
          <div className="widget-picker-header-main">
            {theme.slots.illustration !== null && (
              <div className="widget-picker-illustration">
                {theme.slots.illustration}
              </div>
            )}
            <div>
              <h2 id="widget-picker-heading" className="widget-picker-title">
                {strings.title}
              </h2>
              <p className="widget-picker-subtitle">
                {strings.subtitlePrefix}{" "}
                <code className="widget-picker-target cs-mono">
                  {strings.targetPrefix}
                  {targetLabel}
                </code>{" "}
                {strings.subtitleSuffix}
              </p>
            </div>
          </div>

          <button
            type="button"
            className="widget-picker-close"
            onClick={handleClose}
            aria-label={strings.closeLabel}
          >
            <X size={16} />
          </button>
        </div>

        <div className="widget-picker-toolbar">
          <div className="widget-picker-search-wrap">
            <Search size={15} className="widget-picker-search-icon" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveCardIndex(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder={strings.searchPlaceholder}
              aria-label={strings.searchAriaLabel}
              className="widget-picker-search"
            />
            {query.length > 0 && (
              <button
                type="button"
                className="widget-picker-clear-btn"
                aria-label={strings.clearSearchLabel}
                onClick={() => {
                  setQuery("");
                  setActiveCardIndex(0);
                  searchInputRef.current?.focus();
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div
            role="tablist"
            aria-label={strings.categoriesLabel}
            className="widget-picker-tabs"
          >
            {FILTER_OPTIONS.map((category, idx) => {
              const selected = activeCategory === category;
              return (
                <button
                  key={category}
                  ref={(el) => {
                    tabRefs.current[idx] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  className="widget-picker-tab"
                  onClick={() => {
                    setActiveCategory(category);
                    setActiveCardIndex(0);
                  }}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                >
                  {strings.categories[category]}
                </button>
              );
            })}
          </div>
        </div>

        <div className="cs-sr-only" role="status" aria-live="polite">
          {strings.resultsSummary(filtered.length, WIDGET_PRESETS.length)}
        </div>

        {filtered.length === 0 ? (
          <div className="widget-picker-empty">
            <div className="widget-picker-empty-title">{strings.emptyTitle}</div>
            <div className="widget-picker-empty-subtitle">{strings.emptySubtitle}</div>
            <button
              type="button"
              className="widget-picker-reset-btn"
              onClick={resetFilters}
            >
              {strings.clearFiltersLabel}
            </button>
          </div>
        ) : (
          <div className="widget-picker-grid" role="region" aria-label={strings.dialogLabel}>
            {filtered.map((preset, idx) => {
              const groupLabel = theme.picker.group.labels[preset.groupKey] ?? preset.groupKey;
              const groupAccent = theme.picker.group.accents[preset.groupKey] ?? "var(--cs-text-muted)";
              const categoryLabel = strings.categories[preset.category];
              return (
                <button
                  key={preset.id}
                  ref={(el) => {
                    cardRefs.current[idx] = el;
                  }}
                  type="button"
                  tabIndex={idx === clampedCardIndex ? 0 : -1}
                  aria-label={strings.cardAriaLabel(
                    preset.title,
                    groupLabel,
                    categoryLabel,
                    preset.packageName
                  )}
                  className="widget-picker-card"
                  onClick={() => handleInsert(preset)}
                  onFocus={() => setActiveCardIndex(idx)}
                  onKeyDown={(e) => handleCardKeyDown(e, idx)}
                >
                  <div
                    className="widget-picker-preview"
                    style={{
                      borderRadius: theme.picker.preview.borderRadius,
                      borderColor: theme.picker.preview.borderColor,
                      background: theme.picker.preview.surfaceFallback,
                    }}
                  >
                    <WidgetPreviewCanvas
                      preset={preset}
                      palette={palette}
                      colorProfile={colorProfile}
                      fontFamily={fontFamily}
                      loadingLabel={strings.previewLoadingLabel}
                      errorLabel={strings.previewErrorLabel}
                    />
                  </div>

                  <div className="widget-picker-card-body">
                    <div className="widget-picker-card-title-row">
                      <span className="widget-picker-card-title">{preset.title}</span>
                      <span className="widget-picker-card-category">{categoryLabel}</span>
                    </div>

                    <div className="widget-picker-card-desc">{preset.subtitle}</div>

                    <div className="widget-picker-group">
                      <span
                        className="widget-picker-group-label"
                        style={{ color: groupAccent }}
                      >
                        {groupLabel}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="widget-picker-group-package cs-mono">
                        {preset.packageName}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="widget-picker-footer">
          <span className="cs-mono">
            {strings.resultsSummary(filtered.length, WIDGET_PRESETS.length)}
          </span>
          <span>{strings.keyboardHint}</span>
        </div>
      </div>
    </div>
  );
}
