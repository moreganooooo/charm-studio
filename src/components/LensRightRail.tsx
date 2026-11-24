import { swatchColor } from "../ansiColor";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Code2, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { useStudioStore } from "../store/studioStore";
import {
  defaultWidgetData,
  getCharmGoTypeLabel,
  getFriendlyNodeName,
  type ContentType,
  type IRStyle,
} from "../types";
import { CodePreviewDrawer } from "./CodePreviewDrawer";
import { PropertyInspector } from "./PropertyInspector";
import { CHARM_TOKENS, studioStyles } from "./studioStyles";

interface Props {
  inspectorScrollRef?: React.RefObject<HTMLDivElement | null>;
}

const WIDGET_OPTIONS: { value: ContentType; label: string }[] = [
  { value: "text", label: "Plain Text" },
  { value: "lipgloss:divider", label: "Divider / Rule" },
  { value: "bubble:list", label: "Navigation List" },
  { value: "bubble:table", label: "Data Table" },
  { value: "bubble:viewport", label: "Scrollable Log" },
  { value: "bubble:textinput", label: "Text Input" },
  { value: "bubble:textarea", label: "Text Area" },
  { value: "bubble:progress", label: "Progress Bar" },
  { value: "bubble:spinner", label: "Spinner" },
  { value: "bubble:filepicker", label: "File Picker" },
  { value: "bubble:paginator", label: "Paginator" },
  { value: "bubble:help", label: "Help Keymap" },
  { value: "bubble:timer", label: "Timer" },
  { value: "bubble:stopwatch", label: "Stopwatch" },
  { value: "huh:form", label: "Interactive Form" },
  { value: "glamour:markdown", label: "Markdown" },
  { value: "gum:choose", label: "Gum Choose" },
  { value: "gum:confirm", label: "Gum Confirm" },
  { value: "wish:ssh", label: "Wish SSH" },
  { value: "uv:screen", label: "Ultraviolet Screen" },
  { value: "cellbuf:canvas", label: "Cellbuf 2D Buffer" },
];

const VISUAL_BORDERS: { id: IRStyle["border"]; label: string; glyph: string }[] = [
  { id: "rounded", label: "Rounded", glyph: "╭─╮" },
  { id: "normal", label: "Clean", glyph: "┌─┐" },
  { id: "thick", label: "Bold", glyph: "┏━┓" },
  { id: "double", label: "Double", glyph: "╔═╗" },
  { id: "hidden", label: "Hidden", glyph: "···" },
  { id: "custom", label: "Custom", glyph: "+─+" },
  { id: "none", label: "None", glyph: "   " },
];

const CHARM_SWATCHES: { label: string; token: string; hex: string }[] = [
  { label: "Pink", token: "$accent", hex: "#ff5eae" },
  { label: "Lilac", token: "$borderIdle", hex: "#b9a2ff" },
  { label: "Mint", token: "$modalGlow", hex: "#6dffc2" },
  { label: "Gold", token: "#ffd37a", hex: "#ffd37a" },
];

function resolveColorHex(val: string | undefined, tokens: Record<string, { light: string; dark: string }>): string {
  if (!val) return "#ff5eae";
  if (val.startsWith("$")) {
    const key = val.slice(1);
    return tokens[key]?.dark || "#ff5eae";
  }
  return swatchColor(val);
}

export function LensRightRail({ inspectorScrollRef }: Props) {
  const {
    ir,
    activeLens,
    setActiveLens,
    selectedId,
    selectedNode,
    selectedStyle,
    hoveredProperty,
    setHoveredProperty,
    setActiveProperty,
    updateNode,
    updateSelectedStyle,
    updateToken,
    inspectorFocusRequest,
    clearInspectorFocusRequest,
  } = useStudioStore();

  const [hybridTab, setHybridTab] = useState<"inspector" | "full">("inspector");
  const [showGoHovered, setShowGoHovered] = useState(false);
  const [paddingBurst, setPaddingBurst] = useState(false);
  const paddingStepperRef = useRef<HTMLDivElement>(null);
  const paddingDecBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (activeLens !== "hybrid" || !inspectorFocusRequest) return;
    if (inspectorFocusRequest.property === "width") {
      if (hybridTab !== "full") {
        const t = setTimeout(() => setHybridTab("full"), 0);
        return () => clearTimeout(t);
      }
      return;
    }
    if (inspectorFocusRequest.property === "padding" && hybridTab === "inspector") {
      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const t = setTimeout(() => {
        paddingStepperRef.current?.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "nearest",
        });
        paddingDecBtnRef.current?.focus();
        setPaddingBurst(true);
        clearInspectorFocusRequest();
      }, 24);
      const tEnd = setTimeout(() => setPaddingBurst(false), 260);
      return () => {
        clearTimeout(t);
        clearTimeout(tEnd);
      };
    }
  }, [activeLens, inspectorFocusRequest, hybridTab, clearInspectorFocusRequest]);

  const padV = selectedStyle?.padding[0] ?? 0;
  const padH = selectedStyle?.padding[1] ?? 0;
  const currentBorder = selectedStyle?.border ?? "rounded";
  const activeColorRef = selectedStyle
    ? selectedStyle.border === "none"
      ? selectedStyle.fg
      : selectedStyle.borderColor || selectedStyle.fg
    : "";
  const currentAccentHex = resolveColorHex(activeColorRef, ir.tokens);

  const setSymmetricPadding = (axis: "v" | "h", nextVal: number) => {
    if (!selectedStyle) return;
    const clamped = Math.max(0, Math.min(8, nextVal));
    const cur = selectedStyle.padding;
    const next: [number, number, number, number] =
      axis === "v"
        ? [clamped, cur[1], clamped, cur[3]]
        : [cur[0], clamped, cur[2], clamped];
    setActiveProperty(axis === "v" ? "padding-v" : "padding-h");
    updateSelectedStyle({ padding: next });
  };

  const applyWidgetType = (nextType: ContentType) => {
    if (!selectedNode || selectedNode.kind !== "Box") return;
    setActiveProperty("widget");
    updateNode(selectedNode.id, (n) => {
      const seeded = defaultWidgetData(nextType);
      const keepExisting = n.contentType === nextType ? (n.widgetData ?? {}) : {};
      const merged = { ...seeded, ...keepExisting };
      return {
        ...n,
        contentType: nextType,
        widgetData: Object.keys(merged).length > 0 ? merged : undefined,
      };
    });
  };

  const applySwatch = (sw: { token: string; hex: string }) => {
    if (!selectedStyle) return;
    setActiveProperty("colors");
    if (sw.token.startsWith("$")) {
      const key = sw.token.slice(1);
      if (ir.tokens[key]) {
        updateToken(key, "dark", sw.hex);
      }
      if (selectedStyle.border === "none") {
        updateSelectedStyle({ fg: sw.token });
      } else {
        updateSelectedStyle({ borderColor: sw.token });
      }
      return;
    }
    if (selectedStyle.border === "none") {
      updateSelectedStyle({ fg: sw.hex });
    } else {
      updateSelectedStyle({ borderColor: sw.hex });
    }
  };

  // --- LENS 1: VISUAL (Floating Contextual Card + 40px "Show the Go" Edge Tab) ---
  if (activeLens === "visual") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          flexShrink: 0,
          gap: 16,
          padding: "20px 0 20px 8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <div style={studioStyles.floatingCard}>
            {/* Friendly Card Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: CHARM_TOKENS.textMuted }}>
                  Selected block
                </div>
                <h2
                  style={{
                    margin: "2px 0 0",
                    fontSize: 18,
                    fontWeight: 700,
                    color: CHARM_TOKENS.textHeading,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {getFriendlyNodeName(selectedNode)}
                </h2>
              </div>

              {selectedNode?.kind === "Box" && (
                <select
                  aria-label="Change widget"
                  value={selectedNode.contentType ?? "text"}
                  onChange={(e) => applyWidgetType(e.target.value as ContentType)}
                  style={{
                    background: "var(--cs-input)",
                    color: CHARM_TOKENS.text,
                    border: `1px solid ${CHARM_TOKENS.border}`,
                    borderRadius: 8,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {WIDGET_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {selectedStyle ? (
              <>
                {/* Breathing Room (Padding) */}
                <div
                  onMouseEnter={() => setHoveredProperty("padding")}
                  onMouseLeave={() => setHoveredProperty(null)}
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
                    Breathing room
                  </div>

                  <StepperRow
                    label="Top & Bottom"
                    value={padV}
                    onDec={() => setSymmetricPadding("v", padV - 1)}
                    onInc={() => setSymmetricPadding("v", padV + 1)}
                    onHover={(h) => setHoveredProperty(h ? "padding-v" : "padding")}
                  />
                  <StepperRow
                    label="Left & Right"
                    value={padH}
                    onDec={() => setSymmetricPadding("h", padH - 1)}
                    onInc={() => setSymmetricPadding("h", padH + 1)}
                    onHover={(h) => setHoveredProperty(h ? "padding-h" : "padding")}
                  />
                </div>

                {/* Border Shape */}
                <div
                  onMouseEnter={() => setHoveredProperty("border")}
                  onMouseLeave={() => setHoveredProperty(null)}
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
                    Border
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                    {VISUAL_BORDERS.map((b) => {
                      const active = currentBorder === b.id;
                      return (
                        <button
                          key={b.id}
                          onClick={() => {
                            setActiveProperty("border");
                            updateSelectedStyle({ border: b.id });
                          }}
                          style={{
                            padding: "8px 6px",
                            borderRadius: 10,
                            border: `1px solid ${active ? CHARM_TOKENS.pink : CHARM_TOKENS.border}`,
                            background: active ? CHARM_TOKENS.pinkBg : "var(--cs-input)",
                            color: active ? CHARM_TOKENS.textHeading : CHARM_TOKENS.textMuted,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11.5,
                            fontWeight: 600,
                          }}
                        >
                          <span className="cs-mono" style={{ fontSize: 12, color: active ? CHARM_TOKENS.pink : CHARM_TOKENS.lilac }}>
                            {b.glyph}
                          </span>
                          <span>{b.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Accent Swatches */}
                <div
                  onMouseEnter={() => setHoveredProperty("colors")}
                  onMouseLeave={() => setHoveredProperty(null)}
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
                    Accent
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    {(() => {
                      const displayedTokens = new Set([
                        ...CHARM_SWATCHES.filter((s) => s.token.startsWith("$")).map((s) => s.token),
                        ...Object.keys(ir.tokens)
                          .filter((k) => !["accent", "borderIdle", "modalGlow"].includes(k))
                          .slice(0, 3)
                          .map((k) => `$${k}`),
                      ]);
                      const matchesDisplayedToken = displayedTokens.has(activeColorRef);

                      return (
                        <>
                          {CHARM_SWATCHES.map((sw) => {
                            const active = matchesDisplayedToken
                              ? activeColorRef === sw.token
                              : activeColorRef.toLowerCase() === sw.hex || currentAccentHex.toLowerCase() === sw.hex;
                            return (
                              <button
                                key={sw.label}
                                onClick={() => applySwatch(sw)}
                                title={sw.label}
                                aria-label={`Accent ${sw.label}`}
                                style={{
                                  width: 30,
                                  height: 30,
                                  borderRadius: "50%",
                                  background: sw.hex,
                                  border: active ? "1px solid rgba(255, 255, 255, 0.9)" : `2px solid ${CHARM_TOKENS.borderStrong}`,
                                  outline: active ? "2px solid #ffffff" : "none",
                                  outlineOffset: active ? 2 : 0,
                                  padding: 0,
                                  transition: "outline-color 120ms ease, transform 120ms ease",
                                }}
                              />
                            );
                          })}
                          {Object.entries(ir.tokens)
                            .filter(([k]) => !["accent", "borderIdle", "modalGlow"].includes(k))
                            .slice(0, 3)
                            .map(([k, pair]) => {
                              const tokenRef = `$${k}`;
                              const active = activeColorRef === tokenRef;
                              return (
                                <button
                                  key={k}
                                  onClick={() => applySwatch({ token: tokenRef, hex: pair.dark })}
                                  title={`${k} (${pair.dark})`}
                                  aria-label={`Token ${k}`}
                                  style={{
                                    width: 30,
                                    height: 30,
                                    borderRadius: "50%",
                                    background: pair.dark,
                                    border: active ? "1px solid rgba(255, 255, 255, 0.9)" : `2px solid ${CHARM_TOKENS.borderStrong}`,
                                    outline: active ? "2px solid #ffffff" : "none",
                                    outlineOffset: active ? 2 : 0,
                                    padding: 0,
                                    transition: "outline-color 120ms ease, transform 120ms ease",
                                  }}
                                />
                              );
                            })}
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Live Mint Bridge Callout */}
                <button
                  onClick={() => setActiveLens("hybrid")}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 12,
                    background: CHARM_TOKENS.mintBg,
                    border: `1px solid ${CHARM_TOKENS.mintBorder}`,
                    color: CHARM_TOKENS.mint,
                    fontSize: 12,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    lineHeight: 1.4,
                  }}
                >
                  <span>
                    Go updated to <code className="cs-mono">Padding({padV}, {padH})</code>. Switch to Hybrid to see it.
                  </span>
                  <ArrowRight size={14} style={{ flexShrink: 0 }} />
                </button>
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: CHARM_TOKENS.textMuted, lineHeight: 1.5 }}>
                This is a layout container ({selectedNode?.children?.length ?? 0} blocks). Pick one of its inner panes in the outline or click inside the terminal to adjust padding, border, and accent colors.
              </div>
            )}
          </div>
        </div>

        {/* 40px Collapsed Edge Tab: "Show the Go" */}
        <button
          onClick={() => setActiveLens("hybrid")}
          onMouseEnter={() => setShowGoHovered(true)}
          onMouseLeave={() => setShowGoHovered(false)}
          title="Switch to Hybrid lens to inspect Lip Gloss v2 Go bindings"
          style={{
            width: 40,
            flexShrink: 0,
            background: showGoHovered ? "rgba(185, 162, 255, 0.14)" : CHARM_TOKENS.bgSurface,
            border: "none",
            borderLeft: `1px solid ${showGoHovered ? CHARM_TOKENS.lilac : CHARM_TOKENS.border}`,
            borderTop: `1px solid ${showGoHovered ? CHARM_TOKENS.lilac : CHARM_TOKENS.border}`,
            borderBottom: `1px solid ${showGoHovered ? CHARM_TOKENS.lilac : CHARM_TOKENS.border}`,
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
            boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
            color: CHARM_TOKENS.text,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            padding: "14px 0",
            transition: "background 150ms ease, border-color 150ms ease",
          }}
        >
          <span
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              color: showGoHovered ? CHARM_TOKENS.textHeading : CHARM_TOKENS.lilac,
              whiteSpace: "nowrap",
              transition: "color 150ms ease",
            }}
          >
            Show the Go
          </span>
          <Code2
            size={14}
            style={{
              color: showGoHovered ? CHARM_TOKENS.pink : CHARM_TOKENS.lilac,
              transform: "rotate(180deg)",
              transition: "color 150ms ease",
            }}
          />
        </button>
      </div>
    );
  }

  // --- LENS 2: HYBRID (340px Docked Paired Inspector + Interactive TUI Box-Model Diagram) ---
  if (activeLens === "hybrid") {
    return (
      <aside style={{ ...studioStyles.dockedRightRail, width: 340 }}>
        {/* Header with #id, Go Type & Inspector / Full Props Toggle */}
        <div
          style={{
            padding: "12px 14px",
            borderBottom: `1px solid ${CHARM_TOKENS.border}`,
            background: CHARM_TOKENS.bgSurface,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: CHARM_TOKENS.textHeading, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                #{selectedId}
              </div>
              <div className="cs-mono" style={{ fontSize: 11.5, color: CHARM_TOKENS.lilac }}>
                {getCharmGoTypeLabel(selectedNode)}
              </div>
            </div>

            <div
              style={{
                display: "inline-flex",
                background: "var(--cs-input)",
                borderRadius: 8,
                padding: 3,
                border: `1px solid ${CHARM_TOKENS.border}`,
              }}
            >
              <button
                onClick={() => setHybridTab("inspector")}
                style={{
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 9px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: hybridTab === "inspector" ? CHARM_TOKENS.pinkBg : "transparent",
                  color: hybridTab === "inspector" ? CHARM_TOKENS.pinkSoft : CHARM_TOKENS.textMuted,
                }}
              >
                Inspector
              </button>
              <button
                onClick={() => setHybridTab("full")}
                style={{
                  border: "none",
                  borderRadius: 6,
                  padding: "4px 9px",
                  fontSize: 11.5,
                  fontWeight: 600,
                  background: hybridTab === "full" ? CHARM_TOKENS.pinkBg : "transparent",
                  color: hybridTab === "full" ? CHARM_TOKENS.pinkSoft : CHARM_TOKENS.textMuted,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <SlidersHorizontal size={11} />
                <span>Full Props</span>
              </button>
            </div>
          </div>
        </div>

        {hybridTab === "full" ? (
          <PropertyInspector scrollRef={inspectorScrollRef} />
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
            {selectedStyle ? (
              <>
                {/* Interactive TUI Box-Model Diagram */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ fontWeight: 700, color: CHARM_TOKENS.textHeading }}>Box model</span>
                    <span className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.lilac }}>
                      Margin({selectedStyle.margin[0]}, {selectedStyle.margin[1]})
                    </span>
                  </div>

                  {/* Outer Margin Frame */}
                  <div
                    style={{
                      borderRadius: 12,
                      border: `1px dashed ${CHARM_TOKENS.borderStrong}`,
                      background: CHARM_TOKENS.bgCode,
                      padding: 12,
                    }}
                  >
                    {/* Border + Interactive 4-Side Padding Band with 22px 46px Gutters */}
                    <div
                      style={{
                        position: "relative",
                        borderRadius: currentBorder === "rounded" ? 10 : 4,
                        border:
                          currentBorder === "none"
                            ? `1px dotted ${CHARM_TOKENS.border}`
                            : `${currentBorder === "thick" ? 2 : 1}px solid ${CHARM_TOKENS.pink}`,
                        background: CHARM_TOKENS.pinkBg,
                        padding: "22px 46px",
                        minHeight: 118,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {/* Top Padding Zone */}
                      <div
                        onMouseEnter={() => setHoveredProperty("padding-v")}
                        onMouseLeave={() => setHoveredProperty(null)}
                        style={{
                          position: "absolute",
                          top: 3,
                          left: 46,
                          right: 46,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 5,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: hoveredProperty === "padding-v" ? "rgba(255, 94, 174, 0.24)" : "transparent",
                          transition: "background 120ms ease",
                        }}
                      >
                        <button onClick={() => setSymmetricPadding("v", padV - 1)} style={miniStep} aria-label="Decrease top/bottom padding">
                          -
                        </button>
                        <span className="cs-mono" style={{ fontSize: 10.5, color: CHARM_TOKENS.textHeading, minWidth: 46, textAlign: "center" }}>
                          top: {padV}
                        </span>
                        <button onClick={() => setSymmetricPadding("v", padV + 1)} style={miniStep} aria-label="Increase top/bottom padding">
                          +
                        </button>
                      </div>

                      {/* Left Padding Gutter (46px wide) */}
                      <div
                        onMouseEnter={() => setHoveredProperty("padding-h")}
                        onMouseLeave={() => setHoveredProperty(null)}
                        style={{
                          position: "absolute",
                          left: 4,
                          top: 22,
                          bottom: 22,
                          width: 38,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                          borderRadius: 6,
                          background: hoveredProperty === "padding-h" ? "rgba(255, 94, 174, 0.24)" : "transparent",
                          transition: "background 120ms ease",
                        }}
                      >
                        <button onClick={() => setSymmetricPadding("h", padH + 1)} style={miniStep} aria-label="Increase left/right padding">+</button>
                        <span
                          className="cs-mono"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: CHARM_TOKENS.textHeading,
                            background: "var(--cs-bg-code)",
                            border: `1px solid ${CHARM_TOKENS.pinkBorder}`,
                            borderRadius: 999,
                            padding: "1px 5px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          L: {padH}
                        </span>
                        <button onClick={() => setSymmetricPadding("h", padH - 1)} style={miniStep} aria-label="Decrease left/right padding">-</button>
                      </div>

                      {/* Inner Content Box */}
                      <div
                        style={{
                          width: "100%",
                          padding: "12px 10px",
                          borderRadius: 6,
                          background: CHARM_TOKENS.bgSurface,
                          border: `1px solid ${CHARM_TOKENS.border}`,
                          textAlign: "center",
                          fontSize: 11.5,
                          color: CHARM_TOKENS.text,
                          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.05)",
                        }}
                      >
                        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {getFriendlyNodeName(selectedNode)}
                        </div>
                        <div className="cs-mono" style={{ fontSize: 10.5, color: CHARM_TOKENS.lilac, marginTop: 2 }}>
                          Padding({padV}, {padH})
                        </div>
                      </div>

                      {/* Right Padding Gutter (46px wide) */}
                      <div
                        onMouseEnter={() => setHoveredProperty("padding-h")}
                        onMouseLeave={() => setHoveredProperty(null)}
                        style={{
                          position: "absolute",
                          right: 4,
                          top: 22,
                          bottom: 22,
                          width: 38,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 3,
                          borderRadius: 6,
                          background: hoveredProperty === "padding-h" ? "rgba(255, 94, 174, 0.24)" : "transparent",
                          transition: "background 120ms ease",
                        }}
                      >
                        <button onClick={() => setSymmetricPadding("h", padH + 1)} style={miniStep} aria-label="Increase right padding">+</button>
                        <span
                          className="cs-mono"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: CHARM_TOKENS.textHeading,
                            background: "var(--cs-bg-code)",
                            border: `1px solid ${CHARM_TOKENS.pinkBorder}`,
                            borderRadius: 999,
                            padding: "1px 5px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          R: {padH}
                        </span>
                        <button onClick={() => setSymmetricPadding("h", padH - 1)} style={miniStep} aria-label="Decrease right padding">-</button>
                      </div>

                      {/* Bottom Padding Zone */}
                      <div
                        onMouseEnter={() => setHoveredProperty("padding-v")}
                        onMouseLeave={() => setHoveredProperty(null)}
                        style={{
                          position: "absolute",
                          bottom: 3,
                          left: 46,
                          right: 46,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 5,
                          padding: "2px 6px",
                          borderRadius: 6,
                          background: hoveredProperty === "padding-v" ? "rgba(255, 94, 174, 0.24)" : "transparent",
                          transition: "background 120ms ease",
                        }}
                      >
                        <button onClick={() => setSymmetricPadding("v", padV - 1)} style={miniStep} aria-label="Decrease bottom padding">-</button>
                        <span className="cs-mono" style={{ fontSize: 10.5, color: CHARM_TOKENS.textHeading, minWidth: 46, textAlign: "center" }}>
                          btm: {padV}
                        </span>
                        <button onClick={() => setSymmetricPadding("v", padV + 1)} style={miniStep} aria-label="Increase bottom padding">+</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Paired Vocabulary Controls */}
                <div
                  ref={paddingStepperRef}
                  onMouseEnter={() => setHoveredProperty("padding")}
                  onMouseLeave={() => setHoveredProperty(null)}
                  style={{ display: "flex", flexDirection: "column", gap: 10 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>Breathing room</span>
                    <span className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.lilac }}>lipgloss.Padding</span>
                  </div>
                  <StepperRow
                    label="Top & Bottom"
                    value={padV}
                    onDec={() => setSymmetricPadding("v", padV - 1)}
                    onInc={() => setSymmetricPadding("v", padV + 1)}
                    onHover={(h) => setHoveredProperty(h ? "padding-v" : "padding")}
                  />
                  <StepperRow
                    label="Left & Right"
                    value={padH}
                    burst={paddingBurst}
                    decBtnRef={paddingDecBtnRef}
                    onDec={() => setSymmetricPadding("h", padH - 1)}
                    onInc={() => setSymmetricPadding("h", padH + 1)}
                    onHover={(h) => setHoveredProperty(h ? "padding-h" : "padding")}
                  />
                </div>

                <div
                  onMouseEnter={() => setHoveredProperty("border")}
                  onMouseLeave={() => setHoveredProperty(null)}
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>Border</span>
                    <span className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.lilac }}>lipgloss.Border</span>
                  </div>
                  <select
                    value={currentBorder}
                    onChange={(e) => {
                      setActiveProperty("border");
                      updateSelectedStyle({ border: e.target.value as IRStyle["border"] });
                    }}
                    style={{
                      background: "var(--cs-input)",
                      color: CHARM_TOKENS.text,
                      border: `1px solid ${CHARM_TOKENS.border}`,
                      borderRadius: 8,
                      padding: "7px 10px",
                      fontSize: 12.5,
                    }}
                  >
                    <option value="rounded">Rounded (lipgloss.RoundedBorder())</option>
                    <option value="normal">Normal (lipgloss.NormalBorder())</option>
                    <option value="thick">Thick (lipgloss.ThickBorder())</option>
                    <option value="double">Double (lipgloss.DoubleBorder())</option>
                    <option value="hidden">Hidden (reserves border space)</option>
                    <option value="custom">Custom (lipgloss.Border{"{...}"})</option>
                    <option value="none">None</option>
                  </select>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>Text &amp; Border Color</span>
                    <span className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.lilac }}>lipgloss.LightDark</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {CHARM_SWATCHES.map((sw) => {
                      const active = activeColorRef === sw.token || activeColorRef.toLowerCase() === sw.hex;
                      return (
                        <button
                          key={sw.label}
                          onClick={() => applySwatch(sw)}
                          style={{
                            padding: "5px 10px",
                            borderRadius: 8,
                            border: `1px solid ${active ? CHARM_TOKENS.pink : CHARM_TOKENS.border}`,
                            background: active ? CHARM_TOKENS.pinkBg : "var(--cs-input)",
                            color: CHARM_TOKENS.text,
                            fontSize: 11.5,
                            fontWeight: 600,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: sw.hex }} />
                          <span>{sw.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  onClick={() => setHybridTab("full")}
                  style={{ ...studioStyles.secondaryBtn, justifyContent: "center" }}
                >
                  <SlidersHorizontal size={13} />
                  <span>Edit Widget Data, Margin &amp; Breakpoints</span>
                </button>
              </>
            ) : (
              <PropertyInspector scrollRef={inspectorScrollRef} />
            )}
          </div>
        )}
      </aside>
    );
  }

  // --- LENS 3: CODE (380px Multi-File Go Rail + Pinned Bottom Spacing Stepper) ---
  return (
    <aside style={{ ...studioStyles.dockedRightRail, width: 380, background: CHARM_TOKENS.bgCode }}>
      <CodePreviewDrawer highlightNodeId={selectedId} highlightStyleName={selectedNode?.style} />

      {/* Pinned Bottom Quick-Tweak Spacing Stepper */}
      {selectedStyle && (
        <div
          style={{
            padding: "10px 14px",
            borderTop: `1px solid ${CHARM_TOKENS.border}`,
            background: CHARM_TOKENS.bgSurface,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: CHARM_TOKENS.textHeading, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              #{selectedId}
            </div>
            <div className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.lilac }}>
              Padding({padV}, {padH})
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              onMouseEnter={() => setHoveredProperty("padding-v")}
              onMouseLeave={() => setHoveredProperty(null)}
              style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
            >
              <span className="cs-mono" style={{ fontSize: 10.5, color: CHARM_TOKENS.textMuted }}>V</span>
              <button onClick={() => setSymmetricPadding("v", padV - 1)} style={miniStep} aria-label="Decrease vertical padding">-</button>
              <span className="cs-mono" style={{ fontSize: 11.5, minWidth: 16, textAlign: "center" }}>{padV}</span>
              <button onClick={() => setSymmetricPadding("v", padV + 1)} style={miniStep} aria-label="Increase vertical padding">+</button>
            </div>
            <div
              onMouseEnter={() => setHoveredProperty("padding-h")}
              onMouseLeave={() => setHoveredProperty(null)}
              style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
            >
              <span className="cs-mono" style={{ fontSize: 10.5, color: CHARM_TOKENS.textMuted }}>H</span>
              <button onClick={() => setSymmetricPadding("h", padH - 1)} style={miniStep} aria-label="Decrease horizontal padding">-</button>
              <span className="cs-mono" style={{ fontSize: 11.5, minWidth: 16, textAlign: "center" }}>{padH}</span>
              <button onClick={() => setSymmetricPadding("h", padH + 1)} style={miniStep} aria-label="Increase horizontal padding">+</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function StepperRow({
  label,
  value,
  burst = false,
  decBtnRef,
  onDec,
  onInc,
  onHover,
}: {
  label: string;
  value: number;
  burst?: boolean;
  decBtnRef?: React.RefObject<HTMLButtonElement | null>;
  onDec: () => void;
  onInc: () => void;
  onHover?: (hovered: boolean) => void;
}) {
  return (
    <div
      className={burst ? "cs-focus-burst" : undefined}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 10px",
        borderRadius: 10,
        background: "var(--cs-input)",
        border: `1px solid ${burst ? CHARM_TOKENS.mint : CHARM_TOKENS.border}`,
      }}
    >
      <span style={{ fontSize: 12.5, color: CHARM_TOKENS.text }}>{label}</span>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <button ref={decBtnRef} onClick={onDec} style={studioStyles.stepBtn} aria-label={`Decrease ${label}`}>
          <Minus size={12} />
        </button>
        <span className="cs-mono" style={{ minWidth: 20, textAlign: "center", fontSize: 13, fontWeight: 700, color: CHARM_TOKENS.textHeading, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        <button onClick={onInc} style={studioStyles.stepBtn} aria-label={`Increase ${label}`}>
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}

const miniStep: React.CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 6,
  border: "1px solid var(--cs-btn-border)",
  background: "var(--cs-btn-bg)",
  color: "var(--cs-text-heading)",
  fontSize: 12,
  fontWeight: 700,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
