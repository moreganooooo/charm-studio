import type React from "react";

export const CHARM_TOKENS = {
  bgGround: "var(--cs-bg-ground)",
  bgSurface: "var(--cs-bg-surface)",
  bgCode: "var(--cs-bg-code)",
  border: "var(--cs-border)",
  borderStrong: "var(--cs-border-strong)",
  borderSubtle: "var(--cs-border-subtle)",
  text: "var(--cs-text)",
  textHeading: "var(--cs-text-heading)",
  textBody: "var(--cs-text-body)",
  textMuted: "var(--cs-text-muted)",
  textDim: "var(--cs-text-dim)",
  pink: "var(--cs-pink)",
  pinkSoft: "var(--cs-pink-soft)",
  pinkBg: "var(--cs-pink-bg)",
  pinkBorder: "var(--cs-pink-border)",
  pinkBand: "var(--cs-pink-band)",
  lilac: "var(--cs-lilac)",
  mint: "var(--cs-mint)",
  mintBg: "var(--cs-mint-bg)",
  mintBorder: "var(--cs-mint-border)",
  gold: "var(--cs-gold)",
  fontUi: "var(--cs-font-ui)",
  fontMono: "var(--cs-font-mono)",
} as const;

export const studioStyles: Record<string, React.CSSProperties> = {
  shell: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100%",
    overflow: "hidden",
    background: CHARM_TOKENS.bgGround,
    color: CHARM_TOKENS.text,
    fontFamily: CHARM_TOKENS.fontUi,
  },
  topBar: {
    height: 56,
    flexShrink: 0,
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 16,
    padding: "0 18px",
    background: "var(--cs-nav-bg)",
    borderBottom: `1px solid ${CHARM_TOKENS.border}`,
  },
  lensPillGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: 4,
    borderRadius: 999,
    background: CHARM_TOKENS.bgSurface,
    border: `1px solid ${CHARM_TOKENS.border}`,
  },
  primaryCta: {
    background: "var(--cs-primary-fill, var(--cs-pink))",
    color: "#150f1d",
    border: "1px solid transparent",
    borderRadius: 8,
    padding: "7px 14px",
    fontSize: 12.5,
    fontWeight: 700,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  secondaryBtn: {
    background: "var(--cs-btn-bg)",
    color: "var(--cs-btn-text)",
    border: "1px solid var(--cs-btn-border)",
    borderRadius: 8,
    padding: "6px 11px",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  },
  leftRail: {
    width: 260,
    flexShrink: 0,
    background: CHARM_TOKENS.bgGround,
    borderRight: `1px solid ${CHARM_TOKENS.border}`,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  floatingCard: {
    width: 400,
    maxWidth: "100%",
    borderRadius: 16,
    background: CHARM_TOKENS.bgSurface,
    border: `1px solid ${CHARM_TOKENS.border}`,
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06), var(--cs-shadow)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  dockedRightRail: {
    background: CHARM_TOKENS.bgGround,
    borderLeft: `1px solid ${CHARM_TOKENS.border}`,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
  },
  codeCard: {
    background: CHARM_TOKENS.bgCode,
    border: `1px solid ${CHARM_TOKENS.border}`,
    borderRadius: 16,
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 12px 30px rgba(0, 0, 0, 0.28)",
    overflow: "hidden",
  },
  stepBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    background: "var(--cs-btn-bg)",
    color: "var(--cs-text-strong)",
    border: "1px solid var(--cs-btn-border)",
    fontSize: 14,
    fontWeight: 700,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
  },
};

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
