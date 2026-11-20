import type React from "react";

export const inlineCode: React.CSSProperties = {
  fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
  fontSize: "0.9em",
  padding: "1px 6px",
  borderRadius: 5,
  background: "var(--cs-code-bg)",
  color: "var(--cs-text-heading)",
  border: "1px solid var(--cs-code-border)",
};

export const microTag: React.CSSProperties = {
  fontSize: 10.5,
  fontWeight: 700,
  letterSpacing: 0.7,
  color: "var(--cs-text-dim)",
  marginBottom: 6,
};

export const chkAcc: React.CSSProperties = { accentColor: "var(--cs-pink)" };

export const dot = (bg: string): React.CSSProperties => ({
  width: 8,
  height: 8,
  borderRadius: 2,
  background: bg,
  display: "inline-block",
});

export const inlineLbl: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  color: "var(--cs-text-muted)",
};

export const miniBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)",
  color: "var(--cs-text-heading)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 6,
  padding: "3px 8px",
  fontSize: 11,
  cursor: "pointer",
};

export const checkLbl: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  fontSize: 12,
  color: "var(--cs-text-body)",
  cursor: "pointer",
};

export const labelCol: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  fontSize: 12,
  color: "var(--cs-text-body)",
};

export const inputStyle: React.CSSProperties = {
  background: "var(--cs-input)",
  color: "var(--cs-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 12,
  width: "100%",
};

export const segBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--cs-pink-bg)" : "transparent",
  color: active ? "var(--cs-pink-soft)" : "var(--cs-text-muted)",
  border: active ? "1px solid var(--cs-pink-border)" : "1px solid transparent",
  borderRadius: 5,
  padding: "5px 11px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
});

export const btnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--cs-pink-bg)" : "var(--cs-btn-bg)",
  color: active ? "var(--cs-pink-soft)" : "var(--cs-btn-text)",
  border: `1px solid ${active ? "var(--cs-pink)" : "var(--cs-btn-border)"}`,
  borderRadius: 6,
  padding: "5px 10px",
  fontSize: 12,
  cursor: "pointer",
});

export const pillStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--cs-pink-bg)" : "transparent",
  color: active ? "var(--cs-pink)" : "var(--cs-text-muted)",
  border: `1px solid ${active ? "var(--cs-pink)" : "var(--cs-border-subtle)"}`,
  borderRadius: 999,
  padding: "3px 10px",
  fontSize: 12,
  cursor: "pointer",
});
