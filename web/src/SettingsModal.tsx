import { useState } from "react";
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
  doc: IRDoc;
}

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
  doc,
}: Props) {
  const [name, setName] = useState("My Custom Theme");
  const [darkBG, setDarkBG] = useState(true);
  const [bg, setBg] = useState("#191724");
  const [fg, setFg] = useState("#e0def4");
  const [accent, setAccent] = useState("#ebbcba");
  const [borderIdle, setBorderIdle] = useState("#524f67");
  const [jsonPaste, setJsonPaste] = useState("");
  const [error, setError] = useState<string | null>(null);
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
      onClose();
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
      onClose();
    } catch (err) {
      setError(`Could not parse JSON: ${(err as Error).message}`);
    }
  };

  const handleCreateQuick = () => {
    onAddTheme({
      id: `custom-${Date.now()}`,
      label: `${name.trim() || "Custom"} (Custom)`,
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
    onClose();
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

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(8, 7, 14, 0.72)",
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
          width: "min(620px, 100%)",
          maxHeight: "88vh",
          overflowY: "auto",
          background: "#13111d",
          border: "1px solid #382f57",
          borderRadius: 14,
          padding: 22,
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.65)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "#f5d0fe" }}>Studio Settings &amp; Custom Themes</h2>
            <div style={{ fontSize: 12, color: "#8b82ad", marginTop: 2 }}>
              Upload terminal color schemes, customize fonts, or export your project IR.
            </div>
          </div>
          <button onClick={onClose} style={btn}>✕</button>
        </div>

        {error && (
          <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(244, 63, 94, 0.16)", border: "1px solid rgba(244, 63, 94, 0.45)", color: "#fda4af", fontSize: 12 }}>
            {error}
          </div>
        )}

        {/* 1. Quick Custom Theme Builder */}
        <div style={card}>
          <h3 style={h3}>Create Custom Theme</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
            <label style={lbl}>
              Theme Name
              <input value={name} onChange={(e) => setName(e.target.value)} style={inp} />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, paddingBottom: 6, cursor: "pointer" }}>
              <input type="checkbox" checked={darkBG} onChange={(e) => setDarkBG(e.target.checked)} style={{ accentColor: "#ff75b5" }} />
              Dark Background
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
            {[
              ["Terminal Bg", bg, setBg],
              ["Text Fg", fg, setFg],
              ["Accent", accent, setAccent],
              ["Border", borderIdle, setBorderIdle],
            ].map(([label, val, setter]) => (
              <label key={label as string} style={lbl}>
                {label as string}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="color" value={val as string} onChange={(e) => (setter as (v: string) => void)(e.target.value)} style={{ width: 28, height: 26, border: "none", background: "none", cursor: "pointer", padding: 0 }} />
                  <code style={{ fontSize: 11, color: "#a59ec9" }}>{val as string}</code>
                </div>
              </label>
            ))}
          </div>
          <button onClick={handleCreateQuick} style={primaryBtn}>+ Add &amp; Apply Custom Theme</button>
        </div>

        {/* 2. Upload / Paste Theme JSON */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <h3 style={{ ...h3, margin: 0 }}>Upload or Paste Theme JSON</h3>
            <label style={{ ...btn, cursor: "pointer", display: "inline-block" }}>
              📁 Upload .json
              <input type="file" accept=".json,application/json" onChange={handleFileUpload} style={{ display: "none" }} />
            </label>
          </div>
          <div style={{ fontSize: 11.5, color: "#8b82ad", marginBottom: 8 }}>
            Accepts Charm Studio themes or standard terminal JSON (<code style={{ color: "#c4b5fd" }}>background</code>, <code style={{ color: "#c4b5fd" }}>foreground</code>, <code style={{ color: "#c4b5fd" }}>accent</code>/<code style={{ color: "#c4b5fd" }}>purple</code>).
          </div>
          <textarea
            rows={5}
            placeholder={EXAMPLE_THEME_JSON}
            value={jsonPaste}
            onChange={(e) => setJsonPaste(e.target.value)}
            style={{ ...inp, fontFamily: "ui-monospace, monospace", resize: "vertical", marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={handlePasteImport} disabled={!jsonPaste.trim()} style={btn}>Import Pasted JSON</button>
            <button onClick={() => setJsonPaste(EXAMPLE_THEME_JSON)} style={btn}>Load Rosé Pine Example</button>
            {customThemes.length > 0 && (
              <button onClick={onClearCustomThemes} style={{ ...btn, marginLeft: "auto", color: "#fda4af" }}>
                Clear Custom ({customThemes.length})
              </button>
            )}
          </div>
        </div>

        {/* 3. Terminal Font */}
        <div style={card}>
          <h3 style={h3}>Preview Terminal Font</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
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
        </div>

        {/* 4. Export IR */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 4 }}>
          <span style={{ fontSize: 12, color: "#8b82ad" }}>Want a local backup of your current layout?</span>
          <button onClick={downloadIR} style={btn}>⬇ Download ir.json</button>
        </div>
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#181526", border: "1px solid #2b2442", borderRadius: 10, padding: 14 };
const h3: React.CSSProperties = { margin: "0 0 10px", fontSize: 13.5, fontWeight: 700, color: "#f5d0fe" };
const lbl: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "#d8cff5" };
const inp: React.CSSProperties = { background: "#0c0b12", color: "#ede9fe", border: "1px solid #322b4d", borderRadius: 6, padding: "6px 8px", fontSize: 12, width: "100%" };
const btn: React.CSSProperties = { background: "#1b1729", color: "#ddd6fe", border: "1px solid #322b4d", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { background: "rgba(255, 117, 181, 0.20)", color: "#ff99c8", border: "1px solid #ff75b5", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
