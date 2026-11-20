import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { WIDGET_PRESETS, type WidgetPreset } from "./widgetPresets";

interface Props {
  open: boolean;
  targetLabel: string;
  onClose: () => void;
  onSelectPreset: (preset: WidgetPreset) => void;
}

const LIBRARIES: ("All" | WidgetPreset["library"])[] = [
  "All",
  "Lip Gloss",
  "Bubbles",
  "Huh",
  "Glamour & Glow",
  "Gum",
  "Wish",
];

const LIB_COLORS: Record<WidgetPreset["library"], string> = {
  "Lip Gloss": "var(--cs-pink)",
  Bubbles: "var(--cs-mint)",
  Huh: "var(--cs-lavender)",
  "Glamour & Glow": "var(--cs-pink-soft)",
  Gum: "#d97706",
  Wish: "#2563eb",
};

export function WidgetPickerModal({ open, targetLabel, onClose, onSelectPreset }: Props) {
  const [activeLib, setActiveLib] = useState<"All" | WidgetPreset["library"]>("All");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WIDGET_PRESETS.filter((p) => {
      if (activeLib !== "All" && p.library !== activeLib) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.subtitle.toLowerCase().includes(q) ||
        p.library.toLowerCase().includes(q)
      );
    });
  }, [activeLib, query]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 105,
        background: "var(--cs-backdrop)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(820px, 100%)",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--cs-surface)",
          border: "1px solid var(--cs-border-strong)",
          borderRadius: 14,
          padding: 22,
          boxShadow: "var(--cs-shadow)",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "var(--cs-text-heading)" }}>Add Charmbracelet Component</h2>
            <div style={{ fontSize: 12, color: "var(--cs-text-dim)", marginTop: 3 }}>
              Pick a pre-styled widget to insert near{" "}
              <code style={{ color: "var(--cs-mint)", background: "var(--cs-input)", padding: "1px 6px", borderRadius: 4, border: "1px solid var(--cs-border)" }}>
                #{targetLabel}
              </code>{" "}
              — no Go code edits required.
            </div>
          </div>
          <button onClick={onClose} style={{ ...closeBtn, display: "inline-flex", alignItems: "center", justifyContent: "center" }} aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter components (e.g. form, markdown, table, ssh)..."
            style={{
              flex: "1 1 220px",
              background: "var(--cs-input)",
              color: "var(--cs-text)",
              border: "1px solid var(--cs-btn-border)",
              borderRadius: 7,
              padding: "7px 10px",
              fontSize: 12.5,
            }}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {LIBRARIES.map((lib) => {
              const active = activeLib === lib;
              return (
                <button
                  key={lib}
                  onClick={() => setActiveLib(lib)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 999,
                    fontSize: 11.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    background: active ? "var(--cs-pink-bg)" : "var(--cs-card)",
                    color: active ? "var(--cs-pink-soft)" : "var(--cs-text-muted)",
                    border: `1px solid ${active ? "var(--cs-pink)" : "var(--cs-border-subtle)"}`,
                  }}
                >
                  {lib}
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            overflowY: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(235px, 1fr))",
            gap: 12,
            paddingRight: 2,
          }}
        >
          {filtered.map((preset) => {
            const libColor = LIB_COLORS[preset.library];
            return (
              <button
                key={preset.id}
                onClick={() => {
                  onSelectPreset(preset);
                  onClose();
                }}
                style={{
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 12,
                  borderRadius: 10,
                  background: "var(--cs-card)",
                  border: "1px solid var(--cs-border-subtle)",
                  cursor: "pointer",
                  color: "var(--cs-text)",
                  transition: "border-color 0.15s ease, transform 0.1s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = libColor;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--cs-border-subtle)";
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      fontSize: 10.5,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 999,
                      color: libColor,
                      background: "var(--cs-input)",
                      border: "1px solid var(--cs-border-subtle)",
                    }}
                  >
                    {preset.library}
                  </span>
                  <span style={{ fontSize: 10.5, color: "var(--cs-text-dim)", fontFamily: "ui-monospace, monospace" }}>
                    {preset.keysHint}
                  </span>
                </div>

                <pre
                  style={{
                    margin: 0,
                    padding: "8px 10px",
                    borderRadius: 7,
                    background: "var(--cs-input)",
                    border: "1px solid var(--cs-border)",
                    fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
                    fontSize: 11,
                    lineHeight: 1.35,
                    color: "var(--cs-text-body)",
                    minHeight: 54,
                    display: "flex",
                    alignItems: "center",
                    overflow: "hidden",
                  }}
                >
                  {preset.preview}
                </pre>

                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--cs-text-strong)" }}>+ {preset.title}</div>
                  <div style={{ fontSize: 11.5, color: "var(--cs-text-muted)", lineHeight: 1.4, marginTop: 2 }}>
                    {preset.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const closeBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)",
  color: "var(--cs-btn-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 6,
  padding: "5px 9px",
  fontSize: 12,
  cursor: "pointer",
};
