import { ArrowRight, CheckCircle2, Circle, Sparkles } from "lucide-react";

export type SpotlightKey = "template-import" | "add-component" | "terminal-inspector" | "code-tab" | null;

export interface OnboardingProgress {
  dismissed: boolean;
  steps: {
    templateOrImport: boolean;
    addedComponent: boolean;
    styledOrInteracted: boolean;
    exportedCode: boolean;
  };
}

interface Props {
  progress: OnboardingProgress;
  activeSpotlight: SpotlightKey;
  onSpotlight: (key: SpotlightKey) => void;
  onTriggerStep: (step: keyof OnboardingProgress["steps"]) => void;
  onDismiss: () => void;
}

const STEP_ITEMS: {
  key: keyof OnboardingProgress["steps"];
  spotlight: Exclude<SpotlightKey, null>;
  title: string;
  tip: string;
  cta: string;
}[] = [
  {
    key: "templateOrImport",
    spotlight: "template-import",
    title: "1. Pick a Template or Import GitHub",
    tip: "Start from a Charmbracelet preset or pull .go styles from your GitHub repos.",
    cta: "Import / GitHub",
  },
  {
    key: "addedComponent",
    spotlight: "add-component",
    title: "2. Add a Charm Component",
    tip: "Insert Lip Gloss, Bubbles, Huh, Glamour, Gum, or Wish widgets visually.",
    cta: "Add Component",
  },
  {
    key: "styledOrInteracted",
    spotlight: "terminal-inspector",
    title: "3. Click Terminal & Edit Styles",
    tip: "Click any pane to type/scroll live, or tweak borders, padding & tokens on the right.",
    cta: "Spotlight Terminal",
  },
  {
    key: "exportedCode",
    spotlight: "code-tab",
    title: "4. Export Go, VHS & Gum Code",
    tip: "Grab clean styles.go, layout.go, main.go, demo.tape, or gum.sh anytime.",
    cta: "Open Go Code",
  },
];

export function OnboardingChecklist({
  progress,
  activeSpotlight,
  onSpotlight,
  onTriggerStep,
  onDismiss,
}: Props) {
  if (progress.dismissed) return null;

  const doneCount = Object.values(progress.steps).filter(Boolean).length;

  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: 12,
        background: "var(--cs-pill-bg), var(--cs-surface)",
        border: "1px solid var(--cs-border-strong)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: "var(--cs-text-strong)", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={14} style={{ color: "var(--cs-pink)" }} />
            <span>Quick-Start Checklist</span>
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "2px 9px",
              borderRadius: 999,
              background: doneCount === 4 ? "rgba(74, 222, 128, 0.16)" : "var(--cs-mint-bg)",
              color: doneCount === 4 ? "#16a34a" : "var(--cs-mint)",
              border: `1px solid ${doneCount === 4 ? "rgba(74, 222, 128, 0.4)" : "var(--cs-mint-border)"}`,
            }}
          >
            {doneCount}/4 complete
          </span>
          <span style={{ fontSize: 12, color: "var(--cs-text-muted)" }}>
            Hover a step to spotlight it in the workspace, or click to jump right in.
          </span>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: "var(--cs-btn-bg)",
            border: "1px solid var(--cs-btn-border)",
            borderRadius: 6,
            color: "var(--cs-text-muted)",
            padding: "4px 9px",
            fontSize: 11.5,
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))",
          gap: 10,
        }}
      >
        {STEP_ITEMS.map((item) => {
          const done = progress.steps[item.key];
          const isLit = activeSpotlight === item.spotlight;
          return (
            <button
              key={item.key}
              onMouseEnter={() => onSpotlight(item.spotlight)}
              onMouseLeave={() => onSpotlight(null)}
              onClick={() => onTriggerStep(item.key)}
              style={{
                textAlign: "left",
                display: "flex",
                flexDirection: "column",
                gap: 5,
                padding: "10px 12px",
                borderRadius: 9,
                cursor: "pointer",
                background: done ? "var(--cs-mint-bg)" : isLit ? "var(--cs-pink-bg)" : "var(--cs-card)",
                border: `1px solid ${done ? "var(--cs-mint-border)" : isLit ? "var(--cs-pink)" : "var(--cs-border-subtle)"}`,
                color: "var(--cs-text)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 700, color: done ? "var(--cs-mint)" : "var(--cs-text-heading)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {done ? <CheckCircle2 size={14} style={{ flexShrink: 0 }} /> : <Circle size={14} style={{ flexShrink: 0, opacity: 0.65 }} />}
                  <span>{item.title}</span>
                </span>
              </div>
              <div style={{ fontSize: 11.5, color: "var(--cs-text-muted)", lineHeight: 1.4 }}>{item.tip}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: done ? "var(--cs-mint)" : "var(--cs-pink-soft)", marginTop: "auto", paddingTop: 2, display: "inline-flex", alignItems: "center", gap: 4 }}>
                {done ? (
                  <>
                    <span>Completed</span>
                    <CheckCircle2 size={12} />
                  </>
                ) : (
                  <>
                    <span>{item.cta}</span>
                    <ArrowRight size={12} />
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
