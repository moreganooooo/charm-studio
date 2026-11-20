import { PanelLeftIcon } from "./icons";
import type { IRDoc, IRNode } from "./types";

interface Props {
  doc: IRDoc;
  selectedId: string;
  open: boolean;
  onToggleOpen: () => void;
  onSelect: (id: string) => void;
  onAddBox: () => void;
  onSplit: (kind: "JoinHorizontal" | "JoinVertical") => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onToggleOverlay: (overlayId: string) => void;
}

export function LayersPanel({
  doc,
  selectedId,
  open,
  onToggleOpen,
  onSelect,
  onAddBox,
  onSplit,
  onMove,
  onDelete,
  onToggleOverlay,
}: Props) {
  if (!open) {
    return (
      <aside style={{ borderRight: "1px solid #26213a", background: "#12101c", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14 }}>
        <button onClick={onToggleOpen} title="Expand Layout Tree" style={iconBtn}><PanelLeftIcon collapsed={true} /></button>
        <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", marginTop: 18, fontSize: 11, color: "#7e769e", letterSpacing: 1.6, textTransform: "uppercase" }}>
          Layout Tree
        </span>
      </aside>
    );
  }

  const isRoot = selectedId === doc.root.id;
  const isOverlay = doc.overlays.some((o) => o.node.id === selectedId);

  const renderNode = (node: IRNode, depth: number) => {
    const active = selectedId === node.id;
    const isBox = node.kind === "Box";
    const badge =
      node.kind === "JoinHorizontal" ? "H-Row" :
      node.kind === "JoinVertical" ? "V-Stack" :
      node.contentType?.startsWith("bubble:") ? node.contentType.replace("bubble:", "") : "text";
    const bp = node.width?.collapseBelow ?? 0;

    return (
      <div key={node.id}>
        <button
          onClick={() => onSelect(node.id)}
          title={
            node.kind === "JoinHorizontal"
              ? "Horizontal container (lipgloss.JoinHorizontal)"
              : node.kind === "JoinVertical"
              ? "Vertical container (lipgloss.JoinVertical)"
              : `Box #${node.id} (${badge})`
          }
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: `8px 12px 8px ${12 + depth * 14}px`,
            border: "none",
            borderLeft: active ? "2px solid #ff75b5" : "2px solid transparent",
            background: active ? "rgba(255, 117, 181, 0.11)" : "transparent",
            color: active ? "#fdf4ff" : "#a59ec9",
            cursor: "pointer",
            fontSize: 12.5,
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 12, color: isBox ? "#5eead4" : "#c084fc" }}>
            {isBox ? "□" : "⬚"}
          </span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: active ? 600 : 400 }}>
            {node.id}
          </span>
          {bp > 0 && (
            <span title={`Auto-collapses when terminal width < ${bp} cols`} style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "rgba(251, 191, 36, 0.12)", color: "#fcd34d" }}>
              &lt;{bp}
            </span>
          )}
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#0c0b12", color: "#8b82ad", border: "1px solid #221d33" }}>
            {badge}
          </span>
        </button>
        {node.children?.map((ch) => renderNode(ch, depth + 1))}
      </div>
    );
  };

  return (
    <aside style={{ borderRight: "1px solid #26213a", background: "#12101c", display: "flex", flexDirection: "column", position: "sticky", top: 0, maxHeight: "100vh" }}>
      <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #26213a" }}>
        <div
          style={{
            flex: 1,
            padding: "14px 14px",
            fontWeight: 700,
            fontSize: 13.5,
            background: "#181526",
            color: "#ff75b5",
            borderBottom: "2px solid #ff75b5",
          }}
        >
          Layout Tree
        </div>
        <button onClick={onToggleOpen} title="Collapse Layout Tree" style={{ ...iconBtn, marginRight: 10, marginLeft: 8, display: "inline-flex", alignItems: "center" }}>
          <PanelLeftIcon collapsed={false} />
        </button>
      </div>
      <div style={{ padding: "10px 14px 12px", fontSize: 11.5, color: "#8b82ad", lineHeight: 1.45, borderBottom: "1px solid #26213a" }}>
        Select a container (<span style={{ color: "#c084fc" }}>⬚</span>) or pane (<span style={{ color: "#5eead4" }}>□</span>) to edit, split, or reorder.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, padding: 12, borderBottom: "1px solid #26213a" }}>
        <button onClick={onAddBox} title="Add a new Box into the selected container or beside the selected box" style={actBtn}>+ Box</button>
        <button onClick={() => onSplit("JoinHorizontal")} disabled={isOverlay} title="Wrap selected item in a side-by-side JoinHorizontal row" style={actBtn}>⬌ Split H</button>
        <button onClick={() => onSplit("JoinVertical")} disabled={isOverlay} title="Wrap selected item in a top-to-bottom JoinVertical stack" style={actBtn}>⬍ Split V</button>
        <button onClick={() => onMove(-1)} disabled={isRoot || isOverlay} title="Move selected item earlier in its container" style={actBtn}>↑ Up</button>
        <button onClick={() => onMove(1)} disabled={isRoot || isOverlay} title="Move selected item later in its container" style={actBtn}>↓ Down</button>
        <button onClick={onDelete} disabled={isRoot || isOverlay} title="Remove selected item from layout" style={{ ...actBtn, color: isRoot || isOverlay ? "#4c4566" : "#fb7185" }}>🗑 Del</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingTop: 6, paddingBottom: 14 }}>
        {renderNode(doc.root, 0)}

        {doc.overlays.length > 0 && (
          <div style={{ marginTop: 18, borderTop: "1px solid #26213a", paddingTop: 14 }}>
            <div style={{ padding: "0 14px 4px", fontSize: 12.5, fontWeight: 700, color: "#e9d5ff" }}>
              Floating Overlays
            </div>
            <div style={{ padding: "0 14px 10px", fontSize: 11.5, color: "#8b82ad", lineHeight: 1.45 }}>
              Composited above the UI via <code style={{ color: "#c4b5fd" }}>NewLayer</code>. Click 👁 to preview.
            </div>
            {doc.overlays.map((ov) => {
              const active = selectedId === ov.node.id;
              return (
                <div
                  key={ov.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "6px 12px 6px 14px",
                    background: active ? "rgba(255, 117, 181, 0.11)" : "transparent",
                    borderLeft: active ? "2px solid #ff75b5" : "2px solid transparent",
                  }}
                >
                  <button
                    onClick={() => onSelect(ov.node.id)}
                    style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: active ? "#fdf4ff" : "#a59ec9", cursor: "pointer", fontSize: 12.5, padding: 2 }}
                  >
                    ◇ {ov.node.id} <span style={{ fontSize: 10.5, color: "#7e769e" }}>z:{ov.z}</span>
                  </button>
                  <button
                    onClick={() => onToggleOverlay(ov.id)}
                    title={ov.visible ? "Hide floating modal" : "Show floating modal"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, opacity: ov.visible ? 1 : 0.45 }}
                  >
                    {ov.visible ? "👁" : "👁‍🗨"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

const iconBtn: React.CSSProperties = {
  background: "#1c182b", color: "#c4b5fd", border: "1px solid #322b4d",
  borderRadius: 6, padding: "3px 8px", cursor: "pointer", fontSize: 12,
};

const actBtn: React.CSSProperties = {
  background: "#1c182b", color: "#e9d5ff", border: "1px solid #322b4d",
  borderRadius: 6, padding: "6px 4px", cursor: "pointer", fontSize: 11.5, textAlign: "center",
};
