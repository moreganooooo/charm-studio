import { useState, type ReactNode } from "react";
import { Braces, Check, Download, MessageSquare, Palette, RotateCcw, Type, Upload, X } from "lucide-react";
import type { TermPalette } from "./TerminalViewport";
import type { IRDoc } from "./types";

export interface ThemePreset extends TermPalette {
  tokens: { accent: string; borderIdle: string; textMain: string; modalGlow: string; surface: string };
}

interface Props {
  open: boolean;
  onClose: () => void;
  fontFamily: string;
  onChangeFont: (font: string) => void;
  customThemes: ThemePreset[];
  onAddTheme: (theme: ThemePreset) => void;
  onClearCustomThemes: () => void;
  onRestoreChecklist?: () => void;
  tooltipsEnabled?: boolean;
  onToggleTooltips?: () => void;
  doc: IRDoc;
}

type SettingsTab = "themes" | "json" | "font" | "backup";

const FONT_PRESETS = [
  { label: "JetBrains Mono (Default)", value: `"JetBrains Mono", "SF Mono", Menlo, Monaco, ui-monospace, monospace` },
  { label: "SF Mono / Menlo",          value: `"SF Mono", Menlo, Monaco, ui-monospace, monospace` },
  { label: "Fira Code",                value: `"Fira Code", "JetBrains Mono", ui-monospace, monospace` },
  { label: "Cascadia Code",            value: `"Cascadia Code", "JetBrains Mono", ui-monospace, monospace` },
  { label: "Iosevka",                  value: `Iosevka, "JetBrains Mono", ui-monospace, monospace` },
];

const EXAMPLE_THEME_JSON = `{
  "name": "Rosé Pine",
  "darkBG": true,
  "background": "#191724",
  "foreground": "#e0def4",
  "tokens": {
    "accent": "#ebbcba",
    "borderIdle": "#403d52",
    "textMain": "#e0def4",
    "modalGlow": "#c4a7e7",
    "surface": "#26233a"
  }
}`;

function parseUploadedTheme(rawText: string): ThemePreset {
  const data = JSON.parse(rawText) as Record<string, any>;
  const name = String(data.name || data.label || "Custom Theme");
  const bg = String(data.background || data.bg || "#191724");
  const fg = String(data.foreground || data.fg || "#e0def4");
  const darkBG = typeof data.darkBG === "boolean" ? data.darkBG : !bg.toLowerCase().startsWith("#f") && !bg.toLowerCase().startsWith("#e");
  const t = (data.tokens ?? {}) as Record<string, string>;

  const accent = t.accent || data.accent || data.purple || data.magenta || data.blue || "#ff75b5";
  const borderIdle = t.borderIdle || data.brightBlack || data.selectionBackground || "#4c4566";
  const textMain = t.textMain || fg;
  const modalGlow = t.modalGlow || data.cyan || data.brightPurple || accent;
  const surface = t.surface || data.black || bg;

  return {
    id: `custom-${Date.now()}`,
    label: `${name} (Custom)`,
    darkBG,
    background: bg,
    foreground: fg,
    tokens: { accent, borderIdle, textMain, modalGlow, surface },
  };
}

export function SettingsModal({
  open,
  onClose,
  fontFamily,
  onChangeFont,
  customThemes,
  onAddTheme,
  onClearCustomThemes,
  onRestoreChecklist,
  tooltipsEnabled = true,
  onToggleTooltips,
  doc,
}: Props) {
  const [section, setSection] = useState<SettingsTab>("themes");
  const [name, setName] = useState("My Custom Theme");
  const [darkBG, setDarkBG] = useState(true);
  const [bg, setBg] = useState("#191724");
  const [fg, setFg] = useState("#e0def4");
  const [accent, setAccent] = useState("#ebbcba");
  const [borderIdle, setBorderIdle] = useState("#524f67");
  const [jsonPaste, setJsonPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [customFontInput, setCustomFontInput] = useState("");

  if (!open) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseUploadedTheme(text);
      onAddTheme(parsed);
      setError(null);
      setSavedNote(`Added and applied "${parsed.label}"`);
    } catch (err) {
      setError(`Invalid theme JSON: ${(err as Error).message}`);
    }
  };

  const handlePasteImport = () => {
    try {
      const parsed = parseUploadedTheme(jsonPaste);
      onAddTheme(parsed);
      setError(null);
      setJsonPaste("");
      setSavedNote(`Added and applied "${parsed.label}"`);
    } catch (err) {
      setError(`Could not parse JSON: ${(err as Error).message}`);
    }
  };

  const handleCreateQuick = () => {
    const label = `${name.trim() || "Custom"} (Custom)`;
    onAddTheme({
      id: `custom-${Date.now()}`,
      label,
      darkBG,
      background: bg,
      foreground: fg,
      tokens: {
        accent,
        borderIdle,
        textMain: fg,
        modalGlow: accent,
        surface: bg,
      },
    });
    setError(null);
    setSavedNote(`Created and applied "${label}"`);
  };

  const downloadIR = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "charm-studio-layout.ir.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const navItems: { id: SettingsTab; label: string; icon: ReactNode; desc: string }[] = [
    { id: "themes", label: "Theme Builder", icon: <Palette size={14} />, desc: "Custom palette & token preview" },
    { id: "json",   label: "Import Theme JSON", icon: <Braces size={14} />, desc: "Upload or paste terminal themes" },
    { id: "font",   label: "Terminal Font", icon: <Type size={14} />, desc: "Preview monospace typography" },
    { id: "backup", label: "Backup & Workspace", icon: <Download size={14} />, desc: "Download IR spec, tips & tooltips" },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 115,
        background: "var(--cs-backdrop)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 20px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(940px, 95vw)",
          height: "min(84vh, 760px)",
          background: "var(--cs-surface)",
          border: "1px solid var(--cs-border-strong)",
          borderRadius: 16,
          boxShadow: "var(--cs-shadow)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Page Header */}
        <div
          style={{
            padding: "18px 24px",
            borderBottom: "1px solid var(--cs-border)",
            background: "var(--cs-pill-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--cs-text-strong)" }}>
              Studio Settings &amp; Custom Themes
            </h2>
            <div style={{ fontSize: 12.5, color: "var(--cs-text-muted)", marginTop: 3 }}>
              Customize terminal palettes, monospace preview fonts, workspace tooltips, and project backups.
            </div>
          </div>
          <button onClick={onClose} style={{ ...closeBtn, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <X size={14} />
            <span>Close</span>
          </button>
        </div>

        {/* 2-Column Page Body */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "235px 1fr", minHeight: 0 }}>
          {/* Sidebar */}
          <nav
            style={{
              borderRight: "1px solid var(--cs-border)",
              background: "var(--cs-nav-bg)",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {navItems.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setSection(item.id);
                    setError(null);
                  }}
                  style={{
                    textAlign: "left",
                    padding: "11px 12px",
                    borderRadius: 10,
                    cursor: "pointer",
                    background: active ? "var(--cs-pink-bg)" : "transparent",
                    border: `1px solid ${active ? "var(--cs-pink-border)" : "transparent"}`,
                    color: active ? "var(--cs-text-strong)" : "var(--cs-text-muted)",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <div style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: active ? "var(--cs-pink)" : "var(--cs-text-dim)", display: "inline-flex", alignItems: "center" }}>{item.icon}</span>
                    {item.label}
                  </div>
                  <div style={{ fontSize: 11, color: active ? "var(--cs-text-body)" : "var(--cs-text-dim)", paddingLeft: 22 }}>
                    {item.desc}
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Content */}
          <div style={{ padding: "24px 28px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
            {error && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "rgba(244, 63, 94, 0.14)", border: "1px solid rgba(244, 63, 94, 0.45)", color: "#e11d48", fontSize: 12.5 }}>
                {error}
              </div>
            )}
            {savedNote && (
              <div style={{ padding: "10px 14px", borderRadius: 8, background: "var(--cs-mint-bg)", border: "1px solid var(--cs-mint-border)", color: "var(--cs-mint)", fontSize: 12.5, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Check size={14} /> {savedNote}</span>
                <button onClick={() => setSavedNote(null)} style={{ background: "none", border: "none", color: "var(--cs-mint)", cursor: "pointer", display: "inline-flex", alignItems: "center" }} aria-label="Dismiss"><X size={14} /></button>
              </div>
            )}

            {section === "themes" && (
              <>
                <div style={card}>
                  <h3 style={h3}>Create Custom Terminal Theme</h3>
                  <p style={{ margin: "0 0 14px", fontSize: 12, color: "var(--cs-text-muted)", lineHeight: 1.5 }}>
                    Custom themes update the terminal canvas colors and automatically sync your <code style={codeChip}>$accent</code>, <code style={codeChip}>$borderIdle</code>, and <code style={codeChip}>$textMain</code> LightDark tokens.
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end", marginBottom: 14 }}>
                    <label style={lbl}>
                      Theme Name
                      <input value={name} onChange={(e) => setName(e.target.value)} style={inp} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, paddingBottom: 6, cursor: "pointer", color: "var(--cs-text-body)" }}>
                      <input type="checkbox" checked={darkBG} onChange={(e) => setDarkBG(e.target.checked)} style={{ accentColor: "var(--cs-pink)" }} />
                      Dark Background
                    </label>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                    {[
                      ["Terminal Bg", bg, setBg],
                      ["Text Fg", fg, setFg],
                      ["Accent", accent, setAccent],
                      ["Border", borderIdle, setBorderIdle],
                    ].map(([label, val, setter]) => (
                      <label key={label as string} style={lbl}>
                        {label as string}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--cs-input)", border: "1px solid var(--cs-btn-border)", borderRadius: 6, padding: "4px 6px" }}>
                          <input type="color" value={val as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} style={{ width: 26, height: 22, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
                          <code style={{ fontSize: 11, color: "var(--cs-lavender-text)" }}>{val as string}</code>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Live Preview Box */}
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 10,
                      background: bg,
                      border: `1px solid ${borderIdle}`,
                      fontFamily,
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ border: `1px solid ${accent}`, borderRadius: 6, padding: "8px 12px" }}>
                      <div style={{ color: accent, fontWeight: 700, fontSize: 12.5 }}>╭─ {name || "Custom Theme"} Preview</div>
                      <div style={{ color: fg, fontSize: 12, marginTop: 4 }}>
                        Lip Gloss borders, padding, and adaptive tokens preview live here.
                      </div>
                    </div>
                  </div>

                  <button onClick={handleCreateQuick} style={primaryBtn}>+ Add &amp; Apply Custom Theme</button>
                </div>

                {customThemes.length > 0 && (
                  <div style={card}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <h3 style={{ ...h3, margin: 0 }}>Saved Custom Themes ({customThemes.length})</h3>
                      <button onClick={onClearCustomThemes} style={{ ...btn, color: "#e11d48" }}>
                        Clear All Custom Themes
                      </button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {customThemes.map((t) => (
                        <div key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: "var(--cs-input)", border: "1px solid var(--cs-border-subtle)", fontSize: 12, color: "var(--cs-text)" }}>
                          <span style={{ width: 12, height: 12, borderRadius: 3, background: t.background, border: `2px solid ${t.tokens.accent}` }} />
                          <span>{t.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {section === "json" && (
              <div style={card}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <h3 style={{ ...h3, margin: 0 }}>Upload or Paste Terminal Theme JSON</h3>
                  <label style={{ ...btn, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <Upload size={13} />
                    <span>Upload .json</span>
                    <input type="file" accept=".json,application/json" onChange={handleFileUpload} style={{ display: "none" }} />
                  </label>
                </div>
                <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--cs-text-muted)", lineHeight: 1.5 }}>
                  Accepts Charm Studio JSON or standard terminal theme files containing <code style={codeChip}>background</code>, <code style={codeChip}>foreground</code>, and <code style={codeChip}>accent</code> / <code style={codeChip}>purple</code>.
                </p>
                <textarea
                  rows={10}
                  placeholder={EXAMPLE_THEME_JSON}
                  value={jsonPaste}
                  onChange={(e) => setJsonPaste(e.target.value)}
                  style={{ ...inp, fontFamily: "ui-monospace, monospace", resize: "vertical", marginBottom: 12 }}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button onClick={handlePasteImport} disabled={!jsonPaste.trim()} style={primaryBtn}>
                    Import &amp; Apply JSON
                  </button>
                  <button onClick={() => setJsonPaste(EXAMPLE_THEME_JSON)} style={btn}>
                    Load Rosé Pine Example
                  </button>
                </div>
              </div>
            )}

            {section === "font" && (
              <div style={card}>
                <h3 style={h3}>Preview Terminal Font</h3>
                <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--cs-text-muted)", lineHeight: 1.5 }}>
                  Switch the monospace font used inside the WASM terminal canvases (does not affect generated Go code).
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
                  <label style={lbl}>
                    Font Preset
                    <select value={fontFamily} onChange={(e) => onChangeFont(e.target.value)} style={inp}>
                      {FONT_PRESETS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
                    </select>
                  </label>
                  <label style={lbl}>
                    Or Custom Local Font Name
                    <div style={{ display: "flex", gap: 6 }}>
                      <input placeholder="e.g. Berkeley Mono" value={customFontInput} onChange={(e) => setCustomFontInput(e.target.value)} style={inp} />
                      <button
                        onClick={() => customFontInput.trim() && onChangeFont(`"${customFontInput.trim()}", ui-monospace, monospace`)}
                        style={btn}
                      >
                        Apply
                      </button>
                    </div>
                  </label>
                </div>

                <div style={{ padding: 14, borderRadius: 10, background: "var(--cs-input)", border: "1px solid var(--cs-border-subtle)", fontFamily, fontSize: 13, lineHeight: 1.6, color: "var(--cs-text)" }}>
                  <div>╭──────────────────────────────────────────╮</div>
                  <div>│  0123456789  Il1O0  =&gt;  !=  ::  ╭─╮  │</div>
                  <div>│  charmbracelet/lipgloss + bubbles/v2     │</div>
                  <div>╰──────────────────────────────────────────╯</div>
                </div>
              </div>
            )}

            {section === "backup" && (
              <>
                <div style={card}>
                  <h3 style={h3}>Hover Tooltips &amp; Workspace Hints</h3>
                  <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--cs-text-muted)", lineHeight: 1.5 }}>
                    Toggle beginner tooltips and <code style={codeChip}>?</code> helper badges across the studio workspace. Turn them off once you already know your way around.
                  </p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {onToggleTooltips && (
                      <button
                        onClick={onToggleTooltips}
                        style={{ ...(tooltipsEnabled ? primaryBtn : btn), display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <MessageSquare size={14} />
                        <span>{tooltipsEnabled ? "Hover Tooltips: ON (Click to disable)" : "Hover Tooltips: OFF (Click to enable)"}</span>
                      </button>
                    )}
                    {onRestoreChecklist && (
                      <button
                        onClick={() => {
                          onRestoreChecklist();
                          onClose();
                        }}
                        style={{ ...btn, display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        <RotateCcw size={13} />
                        <span>Restore Quick-Start Checklist</span>
                      </button>
                    )}
                  </div>
                </div>

                <div style={card}>
                  <h3 style={h3}>Export Portable Layout IR Spec</h3>
                  <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--cs-text-muted)", lineHeight: 1.5 }}>
                    Download your entire layout tree, Lip Gloss styles, adaptive tokens, and overlays as an <code style={codeChip}>ir.json</code> file you can re-import anytime via <b>Import / GitHub</b>.
                  </p>
                  <button onClick={downloadIR} style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Download size={14} />
                    <span>Download charm-studio-layout.ir.json</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "var(--cs-card)", border: "1px solid var(--cs-border-subtle)", borderRadius: 11, padding: 18 };
const h3: React.CSSProperties = { margin: "0 0 10px", fontSize: 15, fontWeight: 700, color: "var(--cs-text-heading)" };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--cs-text-body)" };
const inp: React.CSSProperties = { background: "var(--cs-input)", color: "var(--cs-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 6, padding: "7px 9px", fontSize: 12.5, width: "100%" };
const btn: React.CSSProperties = { background: "var(--cs-btn-bg)", color: "var(--cs-btn-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 7, padding: "7px 11px", fontSize: 12, cursor: "pointer" };
const closeBtn: React.CSSProperties = { background: "var(--cs-btn-bg)", color: "var(--cs-btn-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { background: "var(--cs-pink-bg)", color: "var(--cs-pink-soft)", border: "1px solid var(--cs-pink)", borderRadius: 7, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" };
const codeChip: React.CSSProperties = {
  fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
  fontSize: "0.9em",
  padding: "1px 6px",
  borderRadius: 5,
  background: "var(--cs-code-bg)",
  color: "var(--cs-text-heading)",
  border: "1px solid var(--cs-code-border)",
};
