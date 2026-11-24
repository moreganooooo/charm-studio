import { X } from "lucide-react";
import { AdvancedWidgetEditors } from "./components/AdvancedWidgetEditors";
import { defaultWidgetData, type HuhThemeName, type HuhValidationRule, type IRHuhField, type IRNode, type IRWidgetData } from "./types";

interface Props {
  node: IRNode;
  onChangeWidgetData: (data: IRWidgetData) => void;
  onChangeContent: (content: string) => void;
}

export function WidgetDataEditor({ node, onChangeWidgetData, onChangeContent }: Props) {
  const ct = node.contentType ?? "text";

  if (ct === "bubble:list") {
    const data = node.widgetData ?? defaultWidgetData("bubble:list");
    const items = data.listItems ?? [];
    const title = data.listTitle ?? "Navigation";

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={labelCol}>
          <span>List Header Title</span>
          <input
            value={title}
            onChange={(e) => onChangeWidgetData({ ...data, listTitle: e.target.value, listItems: items })}
            placeholder="Navigation"
            style={inputStyle}
          />
        </label>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center" }}>
          <label style={labelCol}>
            <span>Delegate Style</span>
            <select
              value={data.listDelegateMode ?? "default"}
              onChange={(e) => onChangeWidgetData({ ...data, listDelegateMode: e.target.value as IRWidgetData["listDelegateMode"] })}
              style={inputStyle}
            >
              <option value="default">Default (2-line)</option>
              <option value="compact">Compact (1-line)</option>
              <option value="accent">Accent Highlight</option>
            </select>
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, paddingTop: 16 }}>
            <input
              type="checkbox"
              checked={data.listShowPagination ?? true}
              onChange={(e) => onChangeWidgetData({ ...data, listShowPagination: e.target.checked })}
            />
            Pages
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, paddingTop: 16 }}>
            <input
              type="checkbox"
              checked={data.listShowStatusBar ?? true}
              onChange={(e) => onChangeWidgetData({ ...data, listShowStatusBar: e.target.checked })}
            />
            Status
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--cs-text-muted)" }}>
            List Rows ({items.length})
          </span>
          <button
            onClick={() =>
              onChangeWidgetData({
                ...data,
                listTitle: title,
                listItems: [...items, { title: `Item ${items.length + 1}`, desc: "Row description" }],
              })
            }
            style={miniAddBtn}
          >
            + Add Row
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {items.map((item, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr auto",
                gap: 5,
                alignItems: "center",
                padding: 6,
                borderRadius: 6,
                background: "var(--cs-panel)",
                border: "1px solid var(--cs-border)",
              }}
            >
              <input
                value={item.title}
                onChange={(e) => {
                  const next = items.map((it, i) => (i === idx ? { ...it, title: e.target.value } : it));
                  onChangeWidgetData({ ...data, listTitle: title, listItems: next });
                }}
                placeholder="Title"
                style={inputStyle}
              />
              <input
                value={item.desc}
                onChange={(e) => {
                  const next = items.map((it, i) => (i === idx ? { ...it, desc: e.target.value } : it));
                  onChangeWidgetData({ ...data, listTitle: title, listItems: next });
                }}
                placeholder="Description"
                style={inputStyle}
              />
              <button
                onClick={() => {
                  const next = items.filter((_, i) => i !== idx);
                  onChangeWidgetData({ ...data, listTitle: title, listItems: next });
                }}
                title="Remove row"
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

  if (ct === "bubble:table") {
    const data = node.widgetData ?? defaultWidgetData("bubble:table");
    const cols = data.tableColumns ?? [];
    const rows = data.tableRows ?? [];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <label style={labelCol}>
            <span>Table Border</span>
            <select
              value={data.tableBorderStyle ?? "normal"}
              onChange={(e) => onChangeWidgetData({ ...data, tableBorderStyle: e.target.value as IRWidgetData["tableBorderStyle"] })}
              style={inputStyle}
            >
              <option value="normal">Normal</option>
              <option value="rounded">Rounded</option>
              <option value="thick">Thick</option>
              <option value="none">None</option>
            </select>
          </label>
          <label style={labelCol}>
            <span>Header Accent</span>
            <input
              value={data.tableHeaderFg ?? "$accent"}
              onChange={(e) => onChangeWidgetData({ ...data, tableHeaderFg: e.target.value })}
              className="cs-mono"
              style={inputStyle}
            />
          </label>
          <label style={labelCol}>
            <span>Selected Bg</span>
            <input
              value={data.tableSelectedBg ?? "$accent"}
              onChange={(e) => onChangeWidgetData({ ...data, tableSelectedBg: e.target.value })}
              className="cs-mono"
              style={inputStyle}
            />
          </label>
          <label style={labelCol}>
            <span>Selected Text</span>
            <input
              value={data.tableSelectedFg ?? "#150f1d"}
              onChange={(e) => onChangeWidgetData({ ...data, tableSelectedFg: e.target.value })}
              className="cs-mono"
              style={inputStyle}
            />
          </label>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--cs-text-muted)" }}>
              Columns ({cols.length})
            </span>
            <button
              onClick={() => {
                const nextCols = [...cols, { title: `Col${cols.length + 1}`, width: 10 }];
                const nextRows = rows.map((r) => [...r, "—"]);
                onChangeWidgetData({ ...data, tableColumns: nextCols, tableRows: nextRows });
              }}
              style={miniAddBtn}
            >
              + Add Column
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {cols.map((col, ci) => (
              <div key={ci} style={{ display: "grid", gridTemplateColumns: "1fr 64px auto", gap: 5, alignItems: "center" }}>
                <input
                  value={col.title}
                  onChange={(e) => {
                    const nextCols = cols.map((c, i) => (i === ci ? { ...c, title: e.target.value } : c));
                    onChangeWidgetData({ ...data, tableColumns: nextCols, tableRows: rows });
                  }}
                  placeholder="Header"
                  style={inputStyle}
                />
                <input
                  type="number"
                  min={3}
                  max={40}
                  value={col.width}
                  onChange={(e) => {
                    const w = Math.max(3, +e.target.value || 8);
                    const nextCols = cols.map((c, i) => (i === ci ? { ...c, width: w } : c));
                    onChangeWidgetData({ ...data, tableColumns: nextCols, tableRows: rows });
                  }}
                  title="Column width (chars)"
                  style={inputStyle}
                />
                <button
                  disabled={cols.length <= 1}
                  onClick={() => {
                    const nextCols = cols.filter((_, i) => i !== ci);
                    const nextRows = rows.map((r) => r.filter((_, i) => i !== ci));
                    onChangeWidgetData({ ...data, tableColumns: nextCols, tableRows: nextRows });
                  }}
                  style={{ ...delBtn, opacity: cols.length <= 1 ? 0.35 : 1 }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--cs-text-muted)" }}>
              Data Rows ({rows.length})
            </span>
            <button
              onClick={() => {
                const blank = cols.map((_, ci) => (ci === 0 ? `row-${rows.length + 1}` : "—"));
                onChangeWidgetData({ ...data, tableColumns: cols, tableRows: [...rows, blank] });
              }}
              style={miniAddBtn}
            >
              + Add Row
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 200, overflowY: "auto" }}>
            {rows.map((row, ri) => (
              <div
                key={ri}
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols.length}, minmax(48px, 1fr)) auto`,
                  gap: 4,
                  alignItems: "center",
                }}
              >
                {cols.map((_, ci) => (
                  <input
                    key={ci}
                    value={row[ci] ?? ""}
                    onChange={(e) => {
                      const nextRows = rows.map((r, rIdx) => {
                        if (rIdx !== ri) return r;
                        const copy = [...r];
                        copy[ci] = e.target.value;
                        return copy;
                      });
                      onChangeWidgetData({ ...data, tableColumns: cols, tableRows: nextRows });
                    }}
                    style={{ ...inputStyle, padding: "4px 6px", fontSize: 11.5 }}
                  />
                ))}
                <button
                  onClick={() => {
                    const nextRows = rows.filter((_, rIdx) => rIdx !== ri);
                    onChangeWidgetData({ ...data, tableColumns: cols, tableRows: nextRows });
                  }}
                  style={delBtn}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (ct === "bubble:textinput") {
    const data = node.widgetData ?? defaultWidgetData("bubble:textinput");
    return (
      <div style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 8 }}>
        <label style={labelCol}>
          <span>Prompt</span>
          <input
            value={data.inputPrompt ?? "> "}
            onChange={(e) => onChangeWidgetData({ ...data, inputPrompt: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={labelCol}>
          <span>Placeholder</span>
          <input
            value={data.inputPlaceholder ?? defaultWidgetData("bubble:textinput").inputPlaceholder}
            onChange={(e) => onChangeWidgetData({ ...data, inputPlaceholder: e.target.value })}
            style={inputStyle}
          />
        </label>
        <label style={labelCol}>
          <span>Echo mode</span>
          <select
            value={data.inputEchoMode ?? "normal"}
            onChange={(e) => onChangeWidgetData({ ...data, inputEchoMode: e.target.value as IRWidgetData["inputEchoMode"] })}
            style={inputStyle}
          >
            <option value="normal">Normal</option>
            <option value="password">Password (masked)</option>
            <option value="none">None (hidden)</option>
          </select>
        </label>
        <label style={labelCol}>
          <span>Character limit</span>
          <input
            type="number"
            min={0}
            step={1}
            max={2147483647}
            value={data.inputCharLimit || ""}
            placeholder="Unlimited"
            onChange={(e) => {
              const limit = e.currentTarget.valueAsNumber;
              onChangeWidgetData({ ...data, inputCharLimit: Number.isFinite(limit) ? Math.max(0, Math.min(2147483647, Math.trunc(limit))) : 0 });
            }}
            style={inputStyle}
          />
        </label>
      </div>
    );
  }

  if (ct === "bubble:viewport") {
    return (
      <label style={labelCol}>
        <span>Viewport Body / Logs</span>
        <textarea
          rows={5}
          value={node.content ?? ""}
          placeholder="[18:01:02] INFO Server booted..."
          onChange={(e) => onChangeContent(e.target.value)}
          style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
        />
      </label>
    );
  }

  if (ct === "huh:form") {
    const data = node.widgetData ?? defaultWidgetData("huh:form");
    const fields = data.huhFields ?? [];
    const groupNames = data.huhGroupNames ?? ["Step 1"];
    const themes: HuhThemeName[] = ["charm", "dracula", "catppuccin", "base16"];

    const addField = (kind: IRHuhField["kind"]) => {
      let idx = fields.length + 1;
      const prefix = kind === "select" ? "field" : kind;
      while (fields.some((f) => f.id === `${prefix}${idx}`)) idx++;
      const fresh: IRHuhField =
        kind === "select"
          ? { id: `field${idx}`, kind, label: `Option ${idx}`, options: ["Choice A", "Choice B", "Choice C"], filterable: true, group: 0 }
          : kind === "multiselect"
          ? { id: `multi${idx}`, kind, label: `Features ${idx}`, options: ["Auth", "Metrics", "TLS", "Tracing"], minSelect: 1, maxSelect: 3, group: 0 }
          : kind === "text"
          ? { id: `text${idx}`, kind, label: `Notes ${idx}`, placeholder: "Write multi-line details...", lineLimit: 4, charLimit: 240, group: 0 }
          : kind === "note"
          ? { id: `note${idx}`, kind, label: "Note", description: "", group: 0 }
          : kind === "confirm"
          ? { id: `confirm${idx}`, kind, label: "Proceed with setup?", group: 0 }
          : { id: `input${idx}`, kind, label: `Field ${idx}`, placeholder: "value...", validation: "none", group: 0 };
      onChangeWidgetData({ ...data, huhFields: [...fields, fresh] });
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={labelCol}>
            <span>Huh Theme</span>
            <select
              value={data.huhTheme ?? "charm"}
              onChange={(e) => onChangeWidgetData({ ...data, huhTheme: e.target.value as HuhThemeName })}
              style={inputStyle}
            >
              {themes.map((t) => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </label>
          <label style={labelCol}>
            <span>Wizard Steps (comma)</span>
            <input
              value={groupNames.join(", ")}
              onChange={(e) => {
                const nextGroups = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                onChangeWidgetData({ ...data, huhGroupNames: nextGroups.length ? nextGroups : ["Step 1"] });
              }}
              placeholder="Step 1, Step 2"
              style={inputStyle}
            />
          </label>
        </div>

        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          <button onClick={() => addField("input")} style={miniAddBtn}>+ Input</button>
          <button onClick={() => addField("text")} style={miniAddBtn}>+ Text Area</button>
          <button onClick={() => addField("select")} style={miniAddBtn}>+ Select</button>
          <button onClick={() => addField("multiselect")} style={miniAddBtn}>+ MultiSelect</button>
          <button onClick={() => addField("note")} style={miniAddBtn}>+ Note</button>
          <button onClick={() => addField("confirm")} style={miniAddBtn}>+ Confirm</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 280, overflowY: "auto" }}>
          {fields.map((field, idx) => (
            <div
              key={field.id + idx}
              style={{
                padding: 8,
                borderRadius: 7,
                background: "var(--cs-panel)",
                border: "1px solid var(--cs-border)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontSize: 10.5, fontWeight: 700, color: "var(--cs-lavender-text)", textTransform: "uppercase" }}>
                  {field.kind}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <select
                    value={field.group ?? 0}
                    aria-label="Field step group"
                    onChange={(e) => {
                      const next = fields.map((f, i) => (i === idx ? { ...f, group: +e.target.value || 0 } : f));
                      onChangeWidgetData({ ...data, huhFields: next });
                    }}
                    style={{ ...inputStyle, padding: "2px 4px", fontSize: 10.5, width: "auto" }}
                  >
                    {groupNames.map((gn, gi) => (
                      <option key={gi} value={gi}>{gn}</option>
                    ))}
                  </select>
                  <button
                    disabled={fields.length <= 1}
                    onClick={() => onChangeWidgetData({ ...data, huhFields: fields.filter((_, i) => i !== idx) })}
                    style={{ ...delBtn, opacity: fields.length <= 1 ? 0.35 : 1 }}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>

              <input
                value={field.label}
                onChange={(e) => {
                  const next = fields.map((f, i) => (i === idx ? { ...f, label: e.target.value } : f));
                  onChangeWidgetData({ ...data, huhFields: next });
                }}
                aria-label={field.kind === "note" ? "Note title" : "Field label"}
                placeholder="Field label"
                style={inputStyle}
              />

              {field.kind === "note" && (
                <>
                  <textarea aria-label="Note description" placeholder="Note description" rows={3}
                    value={field.description ?? ""} style={inputStyle}
                    onChange={(e) => onChangeWidgetData({ ...data, huhFields: fields.map((f, i) =>
                      i === idx ? { ...f, description: e.target.value } : f) })} />
                  <div style={{ display: "flex", gap: 6 }}>
                    {([-1, 1] as const).map((offset) => (
                      <button key={offset} type="button" disabled={!fields[idx + offset]} style={miniAddBtn}
                        onClick={() => {
                          const next = [...fields];
                          [next[idx], next[idx + offset]] = [next[idx + offset], next[idx]];
                          onChangeWidgetData({ ...data, huhFields: next });
                        }}>
                        {offset < 0 ? "Move note up" : "Move note down"}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {(field.kind === "input" || field.kind === "text") && (
                <>
                  <input
                    value={field.placeholder ?? ""}
                    onChange={(e) => {
                      const next = fields.map((f, i) => (i === idx ? { ...f, placeholder: e.target.value } : f));
                      onChangeWidgetData({ ...data, huhFields: next });
                    }}
                    placeholder="Default / placeholder text"
                    style={inputStyle}
                  />
                  {field.kind === "input" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                      <select
                        value={field.validation ?? "none"}
                        onChange={(e) => {
                          const next = fields.map((f, i) => (i === idx ? { ...f, validation: e.target.value as HuhValidationRule } : f));
                          onChangeWidgetData({ ...data, huhFields: next });
                        }}
                        style={inputStyle}
                      >
                        <option value="none">No Validation</option>
                        <option value="required">Required</option>
                        <option value="minLength">Min Length</option>
                        <option value="email">Valid Email</option>
                        <option value="regex">Regex Match</option>
                      </select>
                      {(field.validation === "minLength" || field.validation === "regex") ? (
                        <input
                          value={field.validationParam ?? ""}
                          placeholder={field.validation === "minLength" ? "min chars (e.g. 3)" : "pattern (e.g. ^[a-z]+$)"}
                          onChange={(e) => {
                            const next = fields.map((f, i) => (i === idx ? { ...f, validationParam: e.target.value } : f));
                            onChangeWidgetData({ ...data, huhFields: next });
                          }}
                          style={inputStyle}
                        />
                      ) : (
                        <input
                          value={field.errorMessage ?? ""}
                          placeholder="Error message"
                          onChange={(e) => {
                            const next = fields.map((f, i) => (i === idx ? { ...f, errorMessage: e.target.value } : f));
                            onChangeWidgetData({ ...data, huhFields: next });
                          }}
                          style={inputStyle}
                        />
                      )}
                    </div>
                  )}
                  {field.kind === "text" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                      <label style={labelCol}>
                        <span style={{ fontSize: 10.5 }}>Line Limit</span>
                        <input
                          type="number"
                          min={1}
                          max={40}
                          value={field.lineLimit ?? 4}
                          onChange={(e) => {
                            const next = fields.map((f, i) => (i === idx ? { ...f, lineLimit: Math.max(1, +e.target.value || 4) } : f));
                            onChangeWidgetData({ ...data, huhFields: next });
                          }}
                          style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
                        />
                      </label>
                      <label style={labelCol}>
                        <span style={{ fontSize: 10.5 }}>Char Limit</span>
                        <input
                          type="number"
                          min={0}
                          max={2000}
                          value={field.charLimit ?? 240}
                          onChange={(e) => {
                            const next = fields.map((f, i) => (i === idx ? { ...f, charLimit: Math.max(0, +e.target.value || 0) } : f));
                            onChangeWidgetData({ ...data, huhFields: next });
                          }}
                          style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}

              {(field.kind === "select" || field.kind === "multiselect") && (
                <>
                  <input
                    value={(field.options ?? []).join(", ")}
                    onChange={(e) => {
                      const opts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                      const next = fields.map((f, i) => (i === idx ? { ...f, options: opts.length ? opts : ["Option A"] } : f));
                      onChangeWidgetData({ ...data, huhFields: next });
                    }}
                    placeholder="Comma-separated choices"
                    style={inputStyle}
                  />
                  {field.kind === "select" ? (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(field.filterable)}
                        onChange={(e) => {
                          const next = fields.map((f, i) => (i === idx ? { ...f, filterable: e.target.checked } : f));
                          onChangeWidgetData({ ...data, huhFields: next });
                        }}
                      />
                      Filterable (/)
                    </label>
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5 }}>
                      <label style={labelCol}>
                        <span style={{ fontSize: 10.5 }}>Min Select</span>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={field.minSelect ?? 0}
                          onChange={(e) => {
                            const next = fields.map((f, i) => (i === idx ? { ...f, minSelect: Math.max(0, +e.target.value || 0) } : f));
                            onChangeWidgetData({ ...data, huhFields: next });
                          }}
                          style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
                        />
                      </label>
                      <label style={labelCol}>
                        <span style={{ fontSize: 10.5 }}>Max Select</span>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={field.maxSelect ?? 3}
                          onChange={(e) => {
                            const next = fields.map((f, i) => (i === idx ? { ...f, maxSelect: Math.max(0, +e.target.value || 0) } : f));
                            onChangeWidgetData({ ...data, huhFields: next });
                          }}
                          style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
                        />
                      </label>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <AdvancedWidgetEditors node={node} onChangeWidgetData={onChangeWidgetData} onChangeContent={onChangeContent} />;
}

const labelCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: 12,
  color: "var(--cs-text-body)",
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

const delBtn: React.CSSProperties = {
  background: "transparent",
  color: "#e11d48",
  border: "1px solid var(--cs-border)",
  borderRadius: 5,
  padding: "3px 7px",
  fontSize: 11,
  cursor: "pointer",
};
