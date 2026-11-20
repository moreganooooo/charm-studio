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
      <aside style={{ borderRight: "1px solid #1e2436", background: "#111520", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 10 }}>
        <button onClick={onToggleOpen} title="Expand Layers Tree" style={iconBtn}>»</button>
        <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", marginTop: 16, fontSize: 11, color: "#64748b", letterSpacing: 1.5, textTransform: "uppercase" }}>
          Layers
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
      node.kind === "JoinHorizontal" ? "H" :
      node.kind === "JoinVertical" ? "V" :
      node.contentType?.startsWith("bubble:") ? node.contentType.replace("bubble:", "") : "box";

    return (
      <div key={node.id}>
        <button
          onClick={() => onSelect(node.id)}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: `6px 8px 6px ${10 + depth * 14}px`,
            border: "none",
            borderLeft: active ? "2px solid #7aa2f7" : "2px solid transparent",
            background: active ? "#1b2338" : "transparent",
            color: active ? "#e2e8f0" : "#94a3b8",
            cursor: "pointer",
            fontSize: 12,
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: 11, color: isBox ? "#60a5fa" : "#c084fc" }}>
            {isBox ? "□" : "⬚"}
          </span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: active ? 600 : 400 }}>
            {node.id}
          </span>
          <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4, background: "#0b0d13", color: "#64748b" }}>
            {badge}
          </span>
        </button>
        {node.children?.map((ch) => renderNode(ch, depth + 1))}
      </div>
    );
  };

  return (
    <aside style={{ borderRight: "1px solid #1e2436", background: "#111520", display: "flex", flexDirection: "column", height: "100vh", position: "sticky", top: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 10px 8px 12px", borderBottom: "1px solid #1e2436" }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.7, color: "#94a3b8" }}>
          Layers
        </span>
        <button onClick={onToggleOpen} title="Collapse Layers Tree" style={iconBtn}>«</button>
      </div>

      {/* Tree Action Bar */}
      <div style={{ display: "flex", gap: 4, padding: "8px 8px", borderBottom: "1px solid #1e2436", flexWrap: "wrap" }}>
        <button onClick={onAddBox} title="Add Box" style={actBtn}>+ Box</button>
        <button onClick={() => onSplit("JoinHorizontal")} disabled={isOverlay} title="Split Horizontal" style={actBtn}>⬌ Split H</button>
        <button onClick={() => onSplit("JoinVertical")} disabled={isOverlay} title="Split Vertical" style={actBtn}>⬍ Split V</button>
        <button onClick={() => onMove(-1)} disabled={isRoot || isOverlay} title="Move Up/Left" style={actBtn}>↑</button>
        <button onClick={() => onMove(1)} disabled={isRoot || isOverlay} title="Move Down/Right" style={actBtn}>↓</button>
        <button onClick={onDelete} disabled={isRoot || isOverlay} title="Delete Selected" style={{ ...actBtn, color: isRoot || isOverlay ? "#475569" : "#f87171", marginLeft: "auto" }}>✕</button>
      </div>

      {/* Node Hierarchy */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 4 }}>
        {renderNode(doc.root, 0)}

        {doc.overlays.length > 0 && (
          <div style={{ marginTop: 12, borderTop: "1px solid #1e2436", paddingTop: 8 }}>
            <div style={{ padding: "0 12px 6px", fontSize: 10, fontWeight: 700, letterSpacing: 0.7, color: "#64748b", textTransform: "uppercase" }}>
              v2 Layer Overlays
            </div>
            {doc.overlays.map((ov) => {
              const active = selectedId === ov.node.id;
              return (
                <div
                  key={ov.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "4px 8px 4px 12px",
                    background: active ? "#1b2338" : "transparent",
                    borderLeft: active ? "2px solid #bb9af7" : "2px solid transparent",
                  }}
                >
                  <button
                    onClick={() => onSelect(ov.node.id)}
                    style={{ flex: 1, textAlign: "left", background: "none", border: "none", color: active ? "#e2e8f0" : "#94a3b8", cursor: "pointer", fontSize: 12, padding: 2 }}
                  >
                    ◇ {ov.node.id} <span style={{ fontSize: 10, color: "#64748b" }}>z:{ov.z}</span>
                  </button>
                  <button
                    onClick={() => onToggleOverlay(ov.id)}
                    title={ov.visible ? "Hide Overlay" : "Show Overlay"}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, opacity: ov.visible ? 1 : 0.4 }}
                  >
                    👁
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
  background: "#181d2c", color: "#94a3b8", border: "1px solid #2b334a",
  borderRadius: 5, padding: "2px 7px", cursor: "pointer", fontSize: 12,
};

const actBtn: React.CSSProperties = {
  background: "#181d2c", color: "#cbd5e1", border: "1px solid #2b334a",
  borderRadius: 5, padding: "3px 6px", cursor: "pointer", fontSize: 11,
};
