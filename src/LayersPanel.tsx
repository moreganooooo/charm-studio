import { useState } from "react";
import { PanelLeftIcon } from "./icons";
import { HelpDot, Tooltip } from "./Tooltip";
import type { IRDoc, IRNode, OverlayAnchor, WorkspaceMode } from "./types";

interface Props {
  doc: IRDoc;
  selectedId: string;
  open: boolean;
  workspaceMode: WorkspaceMode;
  spotlightAdd?: boolean;
  onToggleOpen: () => void;
  onSelect: (id: string) => void;
  onAddBox: () => void;
  onOpenWidgetPicker: () => void;
  onSplit: (kind: "JoinHorizontal" | "JoinVertical") => void;
  onMove: (dir: -1 | 1) => void;
  onDropNode: (dragId: string, targetId: string, position: "before" | "inside" | "after") => void;
  onRenameNode: (oldId: string, nextId: string) => void;
  onDuplicateNode: () => void;
  onUnwrapContainer: () => void;
  onDelete: () => void;
  onToggleOverlay: (overlayId: string) => void;
  onAddOverlay: () => void;
  onRemoveOverlay: (overlayId: string) => void;
  onCycleOverlayAnchor: (overlayId: string, anchor: OverlayAnchor) => void;
}

const ANCHOR_ORDER: OverlayAnchor[] = ["center", "top-right", "bottom-bar", "bottom-right"];
const ANCHOR_LABELS: Record<OverlayAnchor, string> = {
  center: "Center",
  "top-right": "Top-Right",
  "bottom-bar": "Bottom Bar",
  "bottom-right": "Bottom-Right",
};

export function LayersPanel({
  doc,
  selectedId,
  open,
  workspaceMode,
  spotlightAdd,
  onToggleOpen,
  onSelect,
  onAddBox,
  onOpenWidgetPicker,
  onSplit,
  onMove,
  onDelete,
  onDropNode,
  onRenameNode,
  onDuplicateNode,
  onUnwrapContainer,
  onToggleOverlay,
  onAddOverlay,
  onRemoveOverlay,
  onCycleOverlayAnchor,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: "before" | "inside" | "after" } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  if (!open) {
    return (
      <aside style={{ borderRight: "1px solid var(--cs-border)", background: "var(--cs-panel)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12 }}>
        <button onClick={onToggleOpen} title="Expand Layout Tree" style={iconBtn}><PanelLeftIcon collapsed={true} /></button>
        <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", marginTop: 18, fontSize: 11, color: "var(--cs-text-dim)", letterSpacing: 1.6, textTransform: "uppercase" }}>
          Layout Tree
        </span>
      </aside>
    );
  }

  const isRoot = selectedId === doc.root.id;
  const isOverlay = doc.overlays.some((o) => o.node.id === selectedId);

  const findSelectedKind = (n: IRNode): IRNode["kind"] | null => {
    if (n.id === selectedId) return n.kind;
    for (const ch of n.children ?? []) {
      const hit = findSelectedKind(ch);
      if (hit) return hit;
    }
    return null;
  };
  const selectedKind = findSelectedKind(doc.root);
  const isContainerSelected = selectedKind === "JoinHorizontal" || selectedKind === "JoinVertical";

  const commitRename = () => {
    if (editingId && draftName.trim()) {
      onRenameNode(editingId, draftName.trim());
    }
    setEditingId(null);
  };

  const renderNode = (node: IRNode, depth: number) => {
    const active = selectedId === node.id;
    const isBox = node.kind === "Box";
    const isNodeRoot = node.id === doc.root.id;
    const badge =
      node.kind === "JoinHorizontal" ? (workspaceMode === "studio" ? "Row" : "H-Row") :
      node.kind === "JoinVertical" ? (workspaceMode === "studio" ? "Stack" : "V-Stack") :
      node.contentType?.startsWith("bubble:") ? node.contentType.replace("bubble:", "") :
      node.contentType === "glamour:markdown" ? "glamour" :
      node.contentType ?? "text";
    const bp = node.width?.collapseBelow ?? 0;

    const isDropBefore = dropTarget?.id === node.id && dropTarget.pos === "before";
    const isDropAfter = dropTarget?.id === node.id && dropTarget.pos === "after";
    const isDropInside = dropTarget?.id === node.id && dropTarget.pos === "inside";

    return (
      <div key={node.id} style={{ position: "relative" }}>
        {isDropBefore && (
          <div style={{ height: 2, background: "var(--cs-pink)", margin: `0 10px 0 ${12 + depth * 14}px`, borderRadius: 2 }} />
        )}

        <div
          draggable={!isNodeRoot && editingId !== node.id}
          onDragStart={(e) => {
            if (isNodeRoot) return;
            setDragId(node.id);
            e.dataTransfer.setData("text/plain", node.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragEnd={() => {
            setDragId(null);
            setDropTarget(null);
          }}
          onDragOver={(e) => {
            if (!dragId || dragId === node.id) return;
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            const relY = (e.clientY - rect.top) / Math.max(1, rect.height);
            let pos: "before" | "inside" | "after" = relY < 0.35 ? "before" : "after";
            if (!isBox && relY >= 0.25 && relY <= 0.75) pos = "inside";
            if (isNodeRoot) pos = "inside";
            setDropTarget({ id: node.id, pos });
          }}
          onDragLeave={() => {
            if (dropTarget?.id === node.id) setDropTarget(null);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const dragged = dragId || e.dataTransfer.getData("text/plain");
            const pos = dropTarget?.pos ?? (isBox ? "after" : "inside");
            setDragId(null);
            setDropTarget(null);
            if (dragged && dragged !== node.id) {
              onDropNode(dragged, node.id, pos);
            }
          }}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: `7px 10px 7px ${10 + depth * 14}px`,
            borderLeft: active ? "2px solid var(--cs-pink)" : "2px solid transparent",
            background: isDropInside
              ? "var(--cs-mint-bg)"
              : active
              ? "var(--cs-pink-bg)"
              : "transparent",
            outline: isDropInside ? "1px dashed var(--cs-mint)" : "none",
            opacity: dragId === node.id ? 0.45 : 1,
          }}
        >
          {!isNodeRoot && (
            <span
              title="Drag to reorder or drop inside a Row/Stack"
              style={{ cursor: "grab", fontSize: 10, color: "var(--cs-text-dim)", userSelect: "none", lineHeight: 1 }}
            >
              ⋮⋮
            </span>
          )}

          <span style={{ fontSize: 12, color: isBox ? "var(--cs-mint)" : "var(--cs-lavender)" }}>
            {isBox ? "□" : "⬚"}
          </span>

          {editingId === node.id ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setEditingId(null);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                background: "var(--cs-input)",
                color: "var(--cs-text-strong)",
                border: "1px solid var(--cs-pink)",
                borderRadius: 4,
                padding: "2px 5px",
                fontSize: 12,
              }}
            />
          ) : (
            <button
              onClick={() => onSelect(node.id)}
              onDoubleClick={() => {
                setEditingId(node.id);
                setDraftName(node.id);
              }}
              title="Click to select • Double-click to rename • Drag ⋮⋮ to reorder"
              style={{
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                background: "none",
                border: "none",
                padding: 0,
                textAlign: "left",
                cursor: "pointer",
                fontSize: 12.5,
                color: active ? "var(--cs-text-strong)" : "var(--cs-text-muted)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {node.id}
            </button>
          )}

          {bp > 0 && workspaceMode === "pro" && (
            <Tooltip
              title="Responsive Breakpoint"
              content={`Auto-hides this pane whenever the terminal width drops below ${bp} columns.`}
            >
              <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(251, 191, 36, 0.14)", color: "#d97706" }}>
                &lt;{bp}
              </span>
            </Tooltip>
          )}

          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "var(--cs-input)", color: "var(--cs-text-dim)", border: "1px solid var(--cs-border)" }}>
            {badge}
          </span>
        </div>

        {isDropAfter && (
          <div style={{ height: 2, background: "var(--cs-pink)", margin: `0 10px 0 ${12 + depth * 14}px`, borderRadius: 2 }} />
        )}

        {node.children?.map((ch) => renderNode(ch, depth + 1))}
      </div>
    );
  };

  return (
    <aside style={{ borderRight: "1px solid var(--cs-border)", background: "var(--cs-panel)", display: "flex", flexDirection: "column", position: "sticky", top: 0, maxHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", height: 49, borderBottom: "1px solid var(--cs-border)" }}>
        <div
          style={{
            flex: 1,
            height: "100%",
            padding: "0 14px",
            fontWeight: 700,
            fontSize: 13.5,
            background: "var(--cs-card)",
            color: "var(--cs-pink)",
            borderBottom: "2px solid var(--cs-pink)",
            display: "flex",
            alignItems: "center",
          }}
        >
          Layout Tree
          <HelpDot
            title="Layout Tree (Drag & Drop)"
            content="Drag ⋮⋮ handles to reorder or move panes inside Row/Stack containers. Double-click any name to rename it for Go codegen."
            placement="bottom"
          />
        </div>
        <Tooltip content="Collapse Layout Tree panel" placement="bottom">
          <button onClick={onToggleOpen} style={{ ...iconBtn, marginRight: 10, marginLeft: 8, display: "inline-flex", alignItems: "center" }}>
            <PanelLeftIcon collapsed={false} />
          </button>
        </Tooltip>
      </div>

      <div style={{ padding: "8px 14px 10px", fontSize: 11.5, color: "var(--cs-text-dim)", lineHeight: 1.4, borderBottom: "1px solid var(--cs-border)" }}>
        Drag <b style={{ color: "var(--cs-text-muted)" }}>⋮⋮</b> to reorder • Double-click name to rename
      </div>

      <div style={{ padding: "10px 12px 12px", borderBottom: "1px solid var(--cs-border)", display: "flex", flexDirection: "column", gap: 6 }}>
        <Tooltip
          title="Visual Component Picker"
          content="Browse pre-styled Lip Gloss, Bubbles, Huh, Glamour, Gum, and Wish widgets and drop them straight into your layout."
          style={{ width: "100%" }}
        >
          <button
            onClick={onOpenWidgetPicker}
            className={spotlightAdd ? "charm-spotlight" : undefined}
            style={{
              ...actBtn,
              width: "100%",
              background: "var(--cs-pink-bg)",
              color: "var(--cs-pink-soft)",
              border: "1px solid var(--cs-pink-border)",
              fontWeight: 700,
              padding: "7px 8px",
            }}
          >
            ✦ + Add Charm Component
          </button>
        </Tooltip>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          <Tooltip title="Add Plain Box" content="Insert a simple box next to the selected item." style={{ width: "100%" }}>
            <button onClick={onAddBox} style={{ ...actBtn, width: "100%" }}>+ Box</button>
          </Tooltip>
          <Tooltip title="Split Side-by-Side" content="Place the selected pane in a horizontal Row with a new pane beside it." style={{ width: "100%" }}>
            <button onClick={() => onSplit("JoinHorizontal")} disabled={isOverlay} style={{ ...actBtn, width: "100%" }}>⬌ Split R</button>
          </Tooltip>
          <Tooltip title="Split Stacked" content="Place the selected pane in a vertical Stack with a new pane below it." style={{ width: "100%" }}>
            <button onClick={() => onSplit("JoinVertical")} disabled={isOverlay} style={{ ...actBtn, width: "100%" }}>⬍ Split B</button>
          </Tooltip>
          <Tooltip title="Move Earlier" content="Move this item up/left inside its container." style={{ width: "100%" }}>
            <button onClick={() => onMove(-1)} disabled={isRoot || isOverlay} style={{ ...actBtn, width: "100%" }}>↑ Up</button>
          </Tooltip>
          <Tooltip title="Duplicate" content="Clone the selected box or container right beside it." style={{ width: "100%" }}>
            <button onClick={onDuplicateNode} disabled={isRoot || isOverlay} style={{ ...actBtn, width: "100%" }}>❐ Clone</button>
          </Tooltip>
          <Tooltip title="Delete Node" content="Remove the selected box or container." style={{ width: "100%" }}>
            <button onClick={onDelete} disabled={isRoot || isOverlay} style={{ ...actBtn, width: "100%", color: isRoot || isOverlay ? "var(--cs-text-dim)" : "#e11d48" }}>🗑 Del</button>
          </Tooltip>
        </div>

        {isContainerSelected && !isRoot && (
          <button
            onClick={onUnwrapContainer}
            style={{ ...actBtn, width: "100%", fontSize: 11, color: "var(--cs-lavender-text)" }}
          >
            ⊟ Unwrap Container (Promote Children)
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingTop: 6, paddingBottom: 14 }}>
        {renderNode(doc.root, 0)}

        <div style={{ marginTop: 18, borderTop: "1px solid var(--cs-border)", paddingTop: 14 }}>
          <div style={{ padding: "0 12px 6px", fontSize: 12.5, fontWeight: 700, color: "var(--cs-text-heading)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
            <span style={{ display: "inline-flex", alignItems: "center" }}>
              Floating Overlays
              <HelpDot
                title="Floating Layers (Lip Gloss v2)"
                content="Popups, toasts, and command bars anchored above your main TUI using lipgloss.NewLayer."
              />
            </span>
            <button
              onClick={onAddOverlay}
              title="Add a floating popup, toast, or bar overlay"
              style={{
                background: "var(--cs-btn-bg)",
                border: "1px solid var(--cs-btn-border)",
                borderRadius: 5,
                padding: "2px 7px",
                fontSize: 11,
                fontWeight: 600,
                color: "var(--cs-lavender-text)",
                cursor: "pointer",
              }}
            >
              + Layer
            </button>
          </div>

          {doc.overlays.length === 0 ? (
            <div style={{ padding: "4px 14px", fontSize: 11.5, color: "var(--cs-text-dim)" }}>
              No overlays yet — click + Layer for modals or toasts.
            </div>
          ) : (
            doc.overlays.map((ov) => {
              const active = selectedId === ov.node.id;
              const curAnchor = ov.anchor ?? "center";
              const nextAnchor = ANCHOR_ORDER[(ANCHOR_ORDER.indexOf(curAnchor) + 1) % ANCHOR_ORDER.length];
              return (
                <div
                  key={ov.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    padding: "5px 10px 5px 12px",
                    background: active ? "var(--cs-pink-bg)" : "transparent",
                    borderLeft: active ? "2px solid var(--cs-pink)" : "2px solid transparent",
                  }}
                >
                  <button
                    onClick={() => onSelect(ov.node.id)}
                    style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left", background: "none", border: "none", color: active ? "var(--cs-text-strong)" : "var(--cs-text-muted)", cursor: "pointer", fontSize: 12, padding: 2 }}
                  >
                    ◇ {ov.node.id}
                  </button>
                  <button
                    onClick={() => onCycleOverlayAnchor(ov.id, nextAnchor)}
                    title="Click to cycle floating anchor position (Center / Top-Right / Bottom Bar / Bottom-Right)"
                    style={{
                      background: "var(--cs-input)",
                      border: "1px solid var(--cs-border)",
                      borderRadius: 4,
                      color: "var(--cs-text-dim)",
                      fontSize: 10,
                      padding: "1px 5px",
                      cursor: "pointer",
                    }}
                  >
                    {ANCHOR_LABELS[curAnchor]}
                  </button>
                  <Tooltip content={ov.visible ? "Hide overlay preview" : "Show overlay preview"}>
                    <button
                      onClick={() => onToggleOverlay(ov.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, opacity: ov.visible ? 1 : 0.45, padding: "0 2px" }}
                    >
                      {ov.visible ? "👁" : "👁‍🗨"}
                    </button>
                  </Tooltip>
                  {doc.overlays.length > 1 && (
                    <button
                      onClick={() => onRemoveOverlay(ov.id)}
                      title="Delete overlay"
                      style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer", fontSize: 11, padding: "0 3px" }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </aside>
  );
}

const iconBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)", color: "var(--cs-lavender-text)", border: "1px solid var(--cs-btn-border)",
  borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12,
};

const actBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)", color: "var(--cs-btn-text)", border: "1px solid var(--cs-btn-border)",
  borderRadius: 6, padding: "6px 4px", cursor: "pointer", fontSize: 11.5, textAlign: "center",
};
