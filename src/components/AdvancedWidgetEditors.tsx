import { Pause, Play, RotateCcw, X } from "lucide-react";
import { controlClockWidget, getClockWidgetRunning } from "../charmWidgets";
import { useStudioStore } from "../store/studioStore";
import { ColorSwatchPicker } from "./ColorSwatchPicker";
import {
  defaultWidgetData,
  type GlamourThemeName,
  type IRCellbufLayer,
  type IRNode,
  type IRUvCommand,
  type IRWidgetData,
  type SpinnerPresetType,
} from "../types";

interface Props {
  node: IRNode;
  onChangeWidgetData: (data: IRWidgetData) => void;
  onChangeContent: (content: string) => void;
}

export function AdvancedWidgetEditors({ node, onChangeWidgetData, onChangeContent }: Props) {
  const { bumpTick, ir, palette } = useStudioStore();
  const ct = node.contentType ?? "text";
  const swatchHex = (val?: string) => {
    if (!val) return "";
    if (val.startsWith("$")) {
      const pair = ir.tokens[val.slice(1)];
      return pair ? (palette.darkBG ? pair.dark : pair.light) : "";
    }
    return val;
  };

  if (ct === "lipgloss:divider") {
    const data = node.widgetData ?? defaultWidgetData("lipgloss:divider");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 72px", gap: 8 }}>
          <label style={labelCol}>
            <span>Orientation</span>
            <select
              value={data.dividerOrientation ?? "horizontal"}
              onChange={(e) => onChangeWidgetData({ ...data, dividerOrientation: e.target.value as "horizontal" | "vertical" })}
              style={inputStyle}
            >
              <option value="horizontal">Horizontal Rule</option>
              <option value="vertical">Vertical Divider</option>
            </select>
          </label>
          <label style={labelCol}>
            <span>Glyph</span>
            <input
              value={data.dividerChar ?? "─"}
              maxLength={2}
              onChange={(e) => onChangeWidgetData({ ...data, dividerChar: e.target.value || "─" })}
              className="cs-mono"
              style={{ ...inputStyle, textAlign: "center" }}
            />
          </label>
        </div>
        <label style={labelCol}>
          <span>Centered Label (Optional)</span>
          <input
            value={data.dividerLabel ?? ""}
            placeholder="SECTION"
            onChange={(e) => onChangeWidgetData({ ...data, dividerLabel: e.target.value })}
            style={inputStyle}
          />
        </label>
      </div>
    );
  }

  if (ct === "bubble:textarea") {
    const data = node.widgetData ?? defaultWidgetData("bubble:textarea");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={labelCol}>
          <span>Placeholder</span>
          <input
            value={data.textareaPlaceholder ?? "Write release notes..."}
            onChange={(e) => onChangeWidgetData({ ...data, textareaPlaceholder: e.target.value })}
            style={inputStyle}
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={labelCol}>
            <span>Cursor Style</span>
            <select
              value={data.textareaCursorStyle ?? "block"}
              onChange={(e) => onChangeWidgetData({ ...data, textareaCursorStyle: e.target.value as IRWidgetData["textareaCursorStyle"] })}
              style={inputStyle}
            >
              <option value="block">Block</option>
              <option value="underline">Underline</option>
              <option value="bar">Bar</option>
            </select>
          </label>
          <label style={labelCol}>
            <span>Char Limit</span>
            <input
              type="number"
              min={0}
              max={10000}
              placeholder="0 (Unlimited)"
              value={data.textareaCharLimit || ""}
              onChange={(e) => onChangeWidgetData({ ...data, textareaCharLimit: Math.max(0, Math.trunc(+e.target.value || 0)) })}
              style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <label style={checkLbl}>
            <input
              type="checkbox"
              checked={data.textareaShowLineNumbers ?? true}
              onChange={(e) => onChangeWidgetData({ ...data, textareaShowLineNumbers: e.target.checked })}
            />
            Line Numbers
          </label>
          <label style={checkLbl}>
            <input
              type="checkbox"
              checked={data.textareaSoftWrap ?? true}
              onChange={(e) => onChangeWidgetData({ ...data, textareaSoftWrap: e.target.checked })}
            />
            Soft Wrap
          </label>
        </div>
        <label style={labelCol}>
          <span>Initial Content</span>
          <textarea
            rows={3}
            value={node.content ?? ""}
            onChange={(e) => onChangeContent(e.target.value)}
            style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
          />
        </label>
      </div>
    );
  }

  if (ct === "bubble:progress") {
    const data = node.widgetData ?? defaultWidgetData("bubble:progress");
    const pct = data.progressPercent ?? 68;
    const spring = data.harmonica ?? { enabled: true, frequency: 6.0, damping: 0.7 };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={labelCol}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Target Completion</span>
            <span className="cs-mono" style={{ fontVariantNumeric: "tabular-nums", color: "var(--cs-mint)" }}>{pct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => onChangeWidgetData({ ...data, progressPercent: +e.target.value })}
          />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={labelCol}>
            <span>Fill Style</span>
            <select
              value={data.progressMode ?? "gradient"}
              onChange={(e) => onChangeWidgetData({ ...data, progressMode: e.target.value as "solid" | "gradient" })}
              style={inputStyle}
            >
              <option value="gradient">Color Gradient</option>
              <option value="solid">Solid Fill</option>
            </select>
          </label>
          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6 }}>
            <label style={checkLbl}>
              <input
                type="checkbox"
                checked={data.progressShowPercent ?? true}
                onChange={(e) => onChangeWidgetData({ ...data, progressShowPercent: e.target.checked })}
              />
              Show %
            </label>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={labelCol}>
            <span>Start Color</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, alignItems: "center" }}>
              <input
                value={data.progressStartColor ?? "#ff5eae"}
                onChange={(e) => onChangeWidgetData({ ...data, progressStartColor: e.target.value })}
                className="cs-mono"
                style={inputStyle}
              />
              <ColorSwatchPicker
                allowAnsi
                label="Progress Start"
                value={swatchHex(data.progressStartColor ?? "#ff5eae")}
                onChange={(c) => onChangeWidgetData({ ...data, progressStartColor: c })}
              />
            </div>
          </label>
          <label style={labelCol}>
            <span>End Color</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, alignItems: "center" }}>
              <input
                value={data.progressEndColor ?? "#6dffc2"}
                onChange={(e) => onChangeWidgetData({ ...data, progressEndColor: e.target.value })}
                className="cs-mono"
                style={inputStyle}
              />
              <ColorSwatchPicker
                allowAnsi
                label="Progress End"
                value={swatchHex(data.progressEndColor ?? "#6dffc2")}
                onChange={(c) => onChangeWidgetData({ ...data, progressEndColor: c })}
              />
            </div>
          </label>
        </div>

        <div style={{ borderTop: "1px solid var(--cs-border)", paddingTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={checkLbl}>
            <input
              type="checkbox"
              checked={spring.enabled}
              onChange={(e) => onChangeWidgetData({ ...data, harmonica: { ...spring, enabled: e.target.checked } })}
            />
            Harmonica Spring Animation
          </label>
          {spring.enabled && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={labelCol}>
                <span>Frequency</span>
                <input
                  type="number"
                  min={0.5}
                  max={30}
                  step={0.5}
                  value={spring.frequency}
                  onChange={(e) => onChangeWidgetData({ ...data, harmonica: { ...spring, frequency: Math.max(0.5, +e.target.value || 6.0) } })}
                  style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
                />
              </label>
              <label style={labelCol}>
                <span>Damping</span>
                <input
                  type="number"
                  min={0.05}
                  max={2}
                  step={0.05}
                  value={spring.damping}
                  onChange={(e) => onChangeWidgetData({ ...data, harmonica: { ...spring, damping: Math.max(0.05, +e.target.value || 0.7) } })}
                  style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
                />
              </label>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (ct === "bubble:spinner") {
    const data = node.widgetData ?? defaultWidgetData("bubble:spinner");
    const presets: SpinnerPresetType[] = ["line", "dot", "mini-dot", "jump", "pulse", "points", "globe", "moon", "monkey"];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={labelCol}>
          <span>Spinner Animation</span>
          <select
            value={data.spinnerType ?? "dot"}
            onChange={(e) => onChangeWidgetData({ ...data, spinnerType: e.target.value as SpinnerPresetType })}
            style={inputStyle}
          >
            {presets.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 124px", gap: 8 }}>
          <label style={labelCol}>
            <span>Status Label</span>
            <input
              value={data.spinnerLabel ?? "Building WASM bundle..."}
              onChange={(e) => onChangeWidgetData({ ...data, spinnerLabel: e.target.value })}
              style={inputStyle}
            />
          </label>
          <label style={labelCol}>
            <span>Color</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, alignItems: "center" }}>
              <input
                value={data.spinnerColor ?? "$accent"}
                onChange={(e) => onChangeWidgetData({ ...data, spinnerColor: e.target.value })}
                className="cs-mono"
                style={inputStyle}
              />
              <ColorSwatchPicker
                allowAnsi
                label="Spinner"
                value={swatchHex(data.spinnerColor ?? "$accent")}
                onChange={(c) => onChangeWidgetData({ ...data, spinnerColor: c })}
              />
            </div>
          </label>
        </div>
      </div>
    );
  }

  if (ct === "bubble:filepicker") {
    const data = node.widgetData ?? defaultWidgetData("bubble:filepicker");
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={labelCol}>
          <span>Current Directory</span>
          <input
            value={data.fpCurrentDir ?? "/workspace/charm-app"}
            onChange={(e) => onChangeWidgetData({ ...data, fpCurrentDir: e.target.value })}
            className="cs-mono"
            style={inputStyle}
          />
        </label>
        <label style={labelCol}>
          <span>Allowed Extensions (comma-separated)</span>
          <input
            value={(data.fpAllowedExts ?? []).join(", ")}
            placeholder=".go, .md, .json (empty = all)"
            onChange={(e) => {
              const exts = e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
              onChangeWidgetData({ ...data, fpAllowedExts: exts });
            }}
            className="cs-mono"
            style={inputStyle}
          />
        </label>
        <div style={{ display: "flex", gap: 14 }}>
          <label style={checkLbl}>
            <input
              type="checkbox"
              checked={data.fpShowPermissions ?? true}
              onChange={(e) => onChangeWidgetData({ ...data, fpShowPermissions: e.target.checked })}
            />
            Show Permissions
          </label>
          <label style={checkLbl}>
            <input
              type="checkbox"
              checked={data.fpShowSize ?? true}
              onChange={(e) => onChangeWidgetData({ ...data, fpShowSize: e.target.checked })}
            />
            Show Size
          </label>
        </div>
      </div>
    );
  }

  if (ct === "bubble:paginator") {
    const data = node.widgetData ?? defaultWidgetData("bubble:paginator");
    return (
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label style={labelCol}>
          <span>Display Type</span>
          <select
            value={data.paginatorType ?? "dots"}
            onChange={(e) => onChangeWidgetData({ ...data, paginatorType: e.target.value as "dots" | "arabic" })}
            style={inputStyle}
          >
            <option value="dots">Dots (● ○ ○)</option>
            <option value="arabic">Arabic (1/5)</option>
          </select>
        </label>
        <label style={labelCol}>
          <span>Total Pages</span>
          <input
            type="number"
            min={1}
            max={99}
            value={data.paginatorTotalPages ?? 5}
            onChange={(e) => onChangeWidgetData({ ...data, paginatorTotalPages: Math.max(1, +e.target.value || 1) })}
            style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
          />
        </label>
        <label style={labelCol}>
          <span>Active Page</span>
          <input
            type="number"
            min={1}
            max={data.paginatorTotalPages ?? 5}
            value={data.paginatorPage ?? 1}
            onChange={(e) => onChangeWidgetData({ ...data, paginatorPage: Math.max(1, Math.min(data.paginatorTotalPages ?? 5, +e.target.value || 1)) })}
            style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
          />
        </label>
        <label style={labelCol}>
          <span>Per Page</span>
          <input
            type="number"
            min={1}
            max={100}
            value={data.paginatorPerPage ?? 10}
            onChange={(e) => onChangeWidgetData({ ...data, paginatorPerPage: Math.max(1, +e.target.value || 10) })}
            style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
          />
        </label>
      </div>
    );
  }

  if (ct === "bubble:help") {
    const data = node.widgetData ?? defaultWidgetData("bubble:help");
    const bindings = data.helpBindings ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <label style={checkLbl}>
          <input
            type="checkbox"
            checked={Boolean(data.helpShowAll)}
            onChange={(e) => onChangeWidgetData({ ...data, helpShowAll: e.target.checked })}
          />
          Expanded Multi-Column Full Help (ShowAll)
        </label>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--cs-text-muted)" }}>Key Bindings ({bindings.length})</span>
          <button
            type="button"
            style={miniAddBtn}
            onClick={() => onChangeWidgetData({ ...data, helpBindings: [...bindings, { key: "k", desc: "action" }] })}
          >
            + Add Key
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 190, overflowY: "auto" }}>
          {bindings.map((b, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "82px 1fr auto", gap: 5, alignItems: "center" }}>
              <input
                value={b.key}
                onChange={(e) => onChangeWidgetData({ ...data, helpBindings: bindings.map((it, i) => (i === idx ? { ...it, key: e.target.value } : it)) })}
                className="cs-mono"
                placeholder="key"
                style={inputStyle}
              />
              <input
                value={b.desc}
                onChange={(e) => onChangeWidgetData({ ...data, helpBindings: bindings.map((it, i) => (i === idx ? { ...it, desc: e.target.value } : it)) })}
                placeholder="description"
                style={inputStyle}
              />
              <button
                type="button"
                onClick={() => onChangeWidgetData({ ...data, helpBindings: bindings.filter((_, i) => i !== idx) })}
                style={delBtn}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (ct === "bubble:timer" || ct === "bubble:stopwatch") {
    const data = node.widgetData ?? defaultWidgetData(ct);
    const dur = data.timerDurationSec ?? 90;
    const running = getClockWidgetRunning(node.id, ct);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: ct === "bubble:timer" ? "1fr 1fr" : "1fr", gap: 8 }}>
          {ct === "bubble:timer" && (
            <label style={labelCol}>
              <span>Countdown (sec)</span>
              <input
                type="number"
                min={1}
                max={86400}
                value={dur}
                onChange={(e) => onChangeWidgetData({ ...data, timerDurationSec: Math.max(1, +e.target.value || 1) })}
                style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
              />
            </label>
          )}
          <label style={labelCol}>
            <span>Time Format</span>
            <select
              value={data.timerFormat ?? "mm:ss"}
              onChange={(e) => onChangeWidgetData({ ...data, timerFormat: e.target.value as IRWidgetData["timerFormat"] })}
              style={inputStyle}
            >
              <option value="mm:ss">mm:ss</option>
              <option value="hh:mm:ss">hh:mm:ss</option>
              <option value="ss.ms">ss.ms</option>
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              controlClockWidget(node.id, ct, "toggle", dur);
              bumpTick();
            }}
            style={miniAddBtn}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              {running ? <Pause size={11} /> : <Play size={11} />}
              {running ? "Pause" : "Start"}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              controlClockWidget(node.id, ct, "reset", dur);
              bumpTick();
            }}
            style={miniBtn}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <RotateCcw size={11} />
              Reset
            </span>
          </button>
          <label style={checkLbl}>
            <input
              type="checkbox"
              checked={data.timerAutoStart ?? true}
              onChange={(e) => onChangeWidgetData({ ...data, timerAutoStart: e.target.checked })}
            />
            Auto-Start
          </label>
        </div>
      </div>
    );
  }

  if (ct === "glamour:markdown") {
    const data = node.widgetData ?? defaultWidgetData("glamour:markdown");
    const themes: GlamourThemeName[] = ["dark", "light", "dracula", "tokyo-night", "pink"];
    return (
      <label style={labelCol}>
        <span>Glamour Render Theme</span>
        <select
          value={data.glamourTheme ?? "dark"}
          onChange={(e) => onChangeWidgetData({ ...data, glamourTheme: e.target.value as GlamourThemeName })}
          style={inputStyle}
        >
          {themes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>
    );
  }

  if (ct === "uv:screen") {
    const data = node.widgetData ?? defaultWidgetData("uv:screen");
    const cmds = data.uvCommands ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "end" }}>
          <label style={labelCol}>
            <span>Cursor X</span>
            <input
              type="number"
              min={0}
              max={140}
              value={data.uvCursorX ?? 2}
              onChange={(e) => onChangeWidgetData({ ...data, uvCursorX: Math.max(0, +e.target.value || 0) })}
              style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
            />
          </label>
          <label style={labelCol}>
            <span>Cursor Y</span>
            <input
              type="number"
              min={0}
              max={50}
              value={data.uvCursorY ?? 4}
              onChange={(e) => onChangeWidgetData({ ...data, uvCursorY: Math.max(0, +e.target.value || 0) })}
              style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
            />
          </label>
          <label style={{ ...checkLbl, paddingBottom: 6 }}>
            <input
              type="checkbox"
              checked={data.uvShowCursor ?? true}
              onChange={(e) => onChangeWidgetData({ ...data, uvShowCursor: e.target.checked })}
            />
            Cursor
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--cs-text-muted)" }}>Screen Commands ({cmds.length})</span>
          <button
            type="button"
            style={miniAddBtn}
            onClick={() => {
              const next: IRUvCommand = {
                id: `uv${cmds.length + 1}`,
                op: "drawText",
                x: 2,
                y: Math.min(8, cmds.length + 1),
                text: "uv.Cell text",
                fg: "$accent",
              };
              onChangeWidgetData({ ...data, uvCommands: [...cmds, next] });
            }}
          >
            + Draw Op
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 240, overflowY: "auto" }}>
          {cmds.map((cmd, idx) => (
            <div key={cmd.id + idx} style={{ padding: 6, borderRadius: 6, background: "var(--cs-panel)", border: "1px solid var(--cs-border)", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 48px 48px auto", gap: 4 }}>
                <select
                  value={cmd.op}
                  onChange={(e) => onChangeWidgetData({ ...data, uvCommands: cmds.map((c, i) => (i === idx ? { ...c, op: e.target.value as IRUvCommand["op"] } : c)) })}
                  style={inputStyle}
                >
                  <option value="drawText">drawText</option>
                  <option value="fillRect">fillRect</option>
                  <option value="setCell">setCell</option>
                </select>
                <input
                  type="number"
                  value={cmd.x}
                  onChange={(e) => onChangeWidgetData({ ...data, uvCommands: cmds.map((c, i) => (i === idx ? { ...c, x: +e.target.value || 0 } : c)) })}
                  style={inputStyle}
                  title="X"
                />
                <input
                  type="number"
                  value={cmd.y}
                  onChange={(e) => onChangeWidgetData({ ...data, uvCommands: cmds.map((c, i) => (i === idx ? { ...c, y: +e.target.value || 0 } : c)) })}
                  style={inputStyle}
                  title="Y"
                />
                <button
                  type="button"
                  onClick={() => onChangeWidgetData({ ...data, uvCommands: cmds.filter((_, i) => i !== idx) })}
                  style={delBtn}
                >
                  <X size={12} />
                </button>
              </div>
              {cmd.op === "fillRect" && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                  <input
                    type="number"
                    min={1}
                    value={cmd.w ?? 6}
                    onChange={(e) => onChangeWidgetData({ ...data, uvCommands: cmds.map((c, i) => (i === idx ? { ...c, w: Math.max(1, +e.target.value || 1) } : c)) })}
                    style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
                    title="Rect Width"
                    placeholder="W"
                  />
                  <input
                    type="number"
                    min={1}
                    value={cmd.h ?? 3}
                    onChange={(e) => onChangeWidgetData({ ...data, uvCommands: cmds.map((c, i) => (i === idx ? { ...c, h: Math.max(1, +e.target.value || 1) } : c)) })}
                    style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
                    title="Rect Height"
                    placeholder="H"
                  />
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
                <input
                  value={cmd.text ?? ""}
                  placeholder="glyphs / text"
                  onChange={(e) => onChangeWidgetData({ ...data, uvCommands: cmds.map((c, i) => (i === idx ? { ...c, text: e.target.value } : c)) })}
                  className="cs-mono"
                  style={inputStyle}
                />
                <label style={checkLbl}>
                  <input
                    type="checkbox"
                    checked={Boolean(cmd.bold)}
                    onChange={(e) => onChangeWidgetData({ ...data, uvCommands: cmds.map((c, i) => (i === idx ? { ...c, bold: e.target.checked } : c)) })}
                  />
                  Bold
                </label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 3, alignItems: "center" }}>
                  <input
                    value={cmd.fg ?? ""}
                    placeholder="fg color"
                    onChange={(e) => onChangeWidgetData({ ...data, uvCommands: cmds.map((c, i) => (i === idx ? { ...c, fg: e.target.value } : c)) })}
                    className="cs-mono"
                    style={inputStyle}
                  />
                  <ColorSwatchPicker
                    allowAnsi
                    label={`Op ${idx + 1} Fg`}
                    value={swatchHex(cmd.fg)}
                    onChange={(c) => onChangeWidgetData({ ...data, uvCommands: cmds.map((it, i) => (i === idx ? { ...it, fg: c } : it)) })}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 3, alignItems: "center" }}>
                  <input
                    value={cmd.bg ?? ""}
                    placeholder="bg color"
                    onChange={(e) => onChangeWidgetData({ ...data, uvCommands: cmds.map((c, i) => (i === idx ? { ...c, bg: e.target.value } : c)) })}
                    className="cs-mono"
                    style={inputStyle}
                  />
                  <ColorSwatchPicker
                    allowAnsi
                    label={`Op ${idx + 1} Bg`}
                    value={swatchHex(cmd.bg)}
                    onChange={(c) => onChangeWidgetData({ ...data, uvCommands: cmds.map((it, i) => (i === idx ? { ...it, bg: c } : it)) })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (ct === "cellbuf:canvas") {
    const data = node.widgetData ?? defaultWidgetData("cellbuf:canvas");
    const layers = data.cellbufLayers ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--cs-text-muted)" }}>Cellbuf Layers ({layers.length})</span>
          <button
            type="button"
            style={miniAddBtn}
            onClick={() => {
              const next: IRCellbufLayer = {
                id: `layer${layers.length + 1}`,
                name: `Layer ${layers.length + 1}`,
                shape: "box",
                x: 2 + layers.length * 2,
                y: 1 + layers.length,
                w: 14,
                h: 4,
                text: `Box ${layers.length + 1}`,
                fg: "$accent",
              };
              onChangeWidgetData({ ...data, cellbufLayers: [...layers, next] });
            }}
          >
            + Add Shape
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
          {layers.map((layer, idx) => (
            <div key={layer.id + idx} style={{ padding: 6, borderRadius: 6, background: "var(--cs-panel)", border: "1px solid var(--cs-border)", display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 90px auto", gap: 4 }}>
                <input
                  value={layer.name}
                  onChange={(e) => onChangeWidgetData({ ...data, cellbufLayers: layers.map((l, i) => (i === idx ? { ...l, name: e.target.value } : l)) })}
                  style={inputStyle}
                />
                <select
                  value={layer.shape}
                  onChange={(e) => onChangeWidgetData({ ...data, cellbufLayers: layers.map((l, i) => (i === idx ? { ...l, shape: e.target.value as IRCellbufLayer["shape"] } : l)) })}
                  style={inputStyle}
                >
                  <option value="box">box</option>
                  <option value="line">line</option>
                  <option value="text">text</option>
                  <option value="checker">checker</option>
                </select>
                <button
                  type="button"
                  onClick={() => onChangeWidgetData({ ...data, cellbufLayers: layers.filter((_, i) => i !== idx) })}
                  style={delBtn}
                >
                  <X size={12} />
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                {(["x", "y", "w", "h"] as const).map((k) => (
                  <input
                    key={k}
                    type="number"
                    value={layer[k]}
                    onChange={(e) => onChangeWidgetData({ ...data, cellbufLayers: layers.map((l, i) => (i === idx ? { ...l, [k]: Math.max(0, +e.target.value || 0) } : l)) })}
                    title={k.toUpperCase()}
                    style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
                  />
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 56px", gap: 4 }}>
                <input
                  value={layer.text ?? ""}
                  placeholder="label / text"
                  onChange={(e) => onChangeWidgetData({ ...data, cellbufLayers: layers.map((l, i) => (i === idx ? { ...l, text: e.target.value } : l)) })}
                  style={inputStyle}
                />
                <input
                  value={layer.borderChar ?? ""}
                  maxLength={2}
                  placeholder="─"
                  title="Border / Fill Glyph"
                  onChange={(e) => onChangeWidgetData({ ...data, cellbufLayers: layers.map((l, i) => (i === idx ? { ...l, borderChar: e.target.value } : l)) })}
                  className="cs-mono"
                  style={{ ...inputStyle, textAlign: "center" }}
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 3, alignItems: "center" }}>
                  <input
                    value={layer.fg ?? ""}
                    placeholder="fg color"
                    onChange={(e) => onChangeWidgetData({ ...data, cellbufLayers: layers.map((l, i) => (i === idx ? { ...l, fg: e.target.value } : l)) })}
                    className="cs-mono"
                    style={inputStyle}
                  />
                  <ColorSwatchPicker
                    allowAnsi
                    label={`${layer.name} Fg`}
                    value={swatchHex(layer.fg)}
                    onChange={(c) => onChangeWidgetData({ ...data, cellbufLayers: layers.map((l, i) => (i === idx ? { ...l, fg: c } : l)) })}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 3, alignItems: "center" }}>
                  <input
                    value={layer.bg ?? ""}
                    placeholder="bg color"
                    onChange={(e) => onChangeWidgetData({ ...data, cellbufLayers: layers.map((l, i) => (i === idx ? { ...l, bg: e.target.value } : l)) })}
                    className="cs-mono"
                    style={inputStyle}
                  />
                  <ColorSwatchPicker
                    allowAnsi
                    label={`${layer.name} Bg`}
                    value={swatchHex(layer.bg)}
                    onChange={(c) => onChangeWidgetData({ ...data, cellbufLayers: layers.map((l, i) => (i === idx ? { ...l, bg: c } : l)) })}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

const labelCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: 12,
  color: "var(--cs-text-body)",
};

const checkLbl: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12,
  color: "var(--cs-text-body)",
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "var(--cs-input)",
  color: "var(--cs-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 6,
  padding: "5px 8px",
  fontSize: 12,
  width: "100%",
};

const miniAddBtn: React.CSSProperties = {
  background: "var(--cs-pink-bg)",
  color: "var(--cs-pink-soft)",
  border: "1px solid var(--cs-pink-border)",
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
};

const miniBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)",
  color: "var(--cs-btn-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

const delBtn: React.CSSProperties = {
  background: "transparent",
  color: "#e11d48",
  border: "1px solid var(--cs-border)",
  borderRadius: 5,
  padding: "3px 7px",
  fontSize: 11,
  cursor: "pointer",
};
