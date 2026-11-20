import { X } from "lucide-react";
import { defaultWidgetData, type IRHuhField, type IRNode, type IRWidgetData } from "./types";

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
            value={data.inputPlaceholder ?? "Type a command..."}
            onChange={(e) => onChangeWidgetData({ ...data, inputPlaceholder: e.target.value })}
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

    const addField = (kind: IRHuhField["kind"]) => {
      const idx = fields.length + 1;
      const fresh: IRHuhField =
        kind === "select"
          ? { id: `field${idx}`, kind, label: `Option ${idx}`, options: ["Choice A", "Choice B", "Choice C"] }
          : kind === "confirm"
          ? { id: `confirm${idx}`, kind, label: "Proceed with setup?" }
          : { id: `input${idx}`, kind, label: `Field ${idx}`, placeholder: "value..." };
      onChangeWidgetData({ ...data, huhFields: [...fields, fresh] });
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button onClick={() => addField("input")} style={miniAddBtn}>+ Text Input</button>
          <button onClick={() => addField("select")} style={miniAddBtn}>+ Select List</button>
          <button onClick={() => addField("confirm")} style={miniAddBtn}>+ Confirm Yes/No</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 230, overflowY: "auto" }}>
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
                <button
                  disabled={fields.length <= 1}
                  onClick={() => onChangeWidgetData({ ...data, huhFields: fields.filter((_, i) => i !== idx) })}
                  style={{ ...delBtn, opacity: fields.length <= 1 ? 0.35 : 1 }}
                >
                  <X size={12} />
                </button>
              </div>

              <input
                value={field.label}
                onChange={(e) => {
                  const next = fields.map((f, i) => (i === idx ? { ...f, label: e.target.value } : f));
                  onChangeWidgetData({ ...data, huhFields: next });
                }}
                placeholder="Field label"
                style={inputStyle}
              />

              {field.kind === "input" && (
                <input
                  value={field.placeholder ?? ""}
                  onChange={(e) => {
                    const next = fields.map((f, i) => (i === idx ? { ...f, placeholder: e.target.value } : f));
                    onChangeWidgetData({ ...data, huhFields: next });
                  }}
                  placeholder="Default / placeholder text"
                  style={inputStyle}
                />
              )}

              {field.kind === "select" && (
                <input
                  value={(field.options ?? []).join(", ")}
                  onChange={(e) => {
                    const opts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                    const next = fields.map((f, i) => (i === idx ? { ...f, options: opts.length ? opts : ["Option A"] } : f));
                    onChangeWidgetData({ ...data, huhFields: next });
                  }}
                  placeholder="Comma-separated choices (e.g. Fast, Balanced, Strict)"
                  style={inputStyle}
                />
              )}
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
