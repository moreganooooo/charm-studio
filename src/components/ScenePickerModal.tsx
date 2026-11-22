import { Check, Layers, RotateCcw, X } from "lucide-react";
import { useStudioStore } from "../store/studioStore";
import { TEMPLATES } from "../templates";
import { CHARM_TOKENS, studioStyles } from "./studioStyles";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ScenePickerModal({ open, onClose }: Props) {
  const { templateId, loadTemplate, resetToTemplate } = useStudioStore();

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 120,
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
          width: "min(680px, 100%)",
          maxHeight: "86vh",
          overflowY: "auto",
          background: CHARM_TOKENS.bgSurface,
          border: `1px solid ${CHARM_TOKENS.borderStrong}`,
          borderRadius: 16,
          padding: 22,
          boxShadow: "var(--cs-shadow)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: CHARM_TOKENS.textHeading }}>Starter Scenes</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12.5, color: CHARM_TOKENS.textMuted }}>
              Switch starter Charmbracelet app layouts. Changing scenes can be undone anytime with Undo.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ ...studioStyles.secondaryBtn, padding: "6px 8px" }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
          {TEMPLATES.map((tpl) => {
            const active = tpl.id === templateId;
            const styleCount = Object.keys(tpl.doc.styles).length;
            const overlayCount = tpl.doc.overlays.length;
            return (
              <button
                key={tpl.id}
                onClick={() => {
                  loadTemplate(tpl.id);
                  onClose();
                }}
                style={{
                  textAlign: "left",
                  padding: 14,
                  borderRadius: 12,
                  background: active ? CHARM_TOKENS.pinkBg : CHARM_TOKENS.bgGround,
                  border: `1px solid ${active ? CHARM_TOKENS.pink : CHARM_TOKENS.border}`,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  color: CHARM_TOKENS.text,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
                    {tpl.label}
                  </span>
                  {active && <Check size={14} style={{ color: CHARM_TOKENS.pink, flexShrink: 0 }} />}
                </div>
                <div style={{ fontSize: 11.5, color: CHARM_TOKENS.textMuted, display: "flex", alignItems: "center", gap: 6 }}>
                  <Layers size={12} style={{ color: CHARM_TOKENS.lilac }} />
                  <span>{styleCount} styles</span>
                  <span aria-hidden="true">·</span>
                  <span>{overlayCount} overlay{overlayCount === 1 ? "" : "s"}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${CHARM_TOKENS.border}`, paddingTop: 12 }}>
          <button
            onClick={() => {
              resetToTemplate();
              onClose();
            }}
            style={studioStyles.secondaryBtn}
          >
            <RotateCcw size={13} />
            <span>Reset Current Scene</span>
          </button>
          <button onClick={onClose} style={studioStyles.secondaryBtn}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
