import { useMemo, useState } from "react";
import { Command, Eye, Code2, Layers, Download, Folder, GitBranch, Moon, Server, Settings, Sun, X } from "lucide-react";
import { useStudioStore } from "../store/studioStore";
import { TEMPLATES } from "../templates";
import { getFriendlyNodeName, listEditableNodes } from "../types";
import { CHARM_TOKENS } from "./studioStyles";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenImport: () => void;
  onOpenDesktop: () => void;
  onOpenProjects: () => void;
  onOpenSettings: () => void;
  onOpenScenes: () => void;
}

interface PaletteAction {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPaletteModal({
  open,
  onClose,
  onOpenImport,
  onOpenDesktop,
  onOpenProjects,
  onOpenSettings,
  onOpenScenes,
}: Props) {
  const {
    ir,
    activeLens,
    setActiveLens,
    setSelectedId,
    loadTemplate,
    appMode,
    setAppMode,
    shareLink,
  } = useStudioStore();

  const [query, setQuery] = useState("");

  const actions = useMemo<PaletteAction[]>(() => {
    const items: PaletteAction[] = [
      {
        id: "lens-visual",
        group: "Switch Lens",
        label: "Visual Lens (WYSIWYG Hero)",
        hint: activeLens === "visual" ? "Active" : "Switch",
        icon: <Eye size={14} style={{ color: CHARM_TOKENS.pink }} />,
        run: () => setActiveLens("visual"),
      },
      {
        id: "lens-hybrid",
        group: "Switch Lens",
        label: "Hybrid Lens (Box-Model + Linked Go)",
        hint: activeLens === "hybrid" ? "Active" : "Switch",
        icon: <Layers size={14} style={{ color: CHARM_TOKENS.lilac }} />,
        run: () => setActiveLens("hybrid"),
      },
      {
        id: "lens-code",
        group: "Switch Lens",
        label: "Code Lens (Multi-File Go + Matrix)",
        hint: activeLens === "code" ? "Active" : "Switch",
        icon: <Code2 size={14} style={{ color: CHARM_TOKENS.mint }} />,
        run: () => setActiveLens("code"),
      },
      {
        id: "act-scenes",
        group: "Actions",
        label: "Browse Starter Scenes",
        icon: <Layers size={14} />,
        run: onOpenScenes,
      },
      {
        id: "act-import",
        group: "Actions",
        label: "Import Go Source or GitHub Repo",
        icon: <GitBranch size={14} />,
        run: onOpenImport,
      },
      {
        id: "act-desktop",
        group: "Actions",
        label: "Desktop Companion · Native PTY & MCP",
        icon: <Server size={14} />,
        run: onOpenDesktop,
      },
      {
        id: "act-projects",
        group: "Actions",
        label: "Open Saved Projects",
        icon: <Folder size={14} />,
        run: onOpenProjects,
      },
      {
        id: "act-settings",
        group: "Actions",
        label: "Studio Settings & Custom Themes",
        icon: <Settings size={14} />,
        run: onOpenSettings,
      },
      {
        id: "act-export",
        group: "Actions",
        label: "Open Go Code Export Rail",
        icon: <Download size={14} />,
        run: () => setActiveLens("code"),
      },
      {
        id: "act-share",
        group: "Actions",
        label: "Copy Shareable URL",
        icon: <Command size={14} />,
        run: () => {
          void shareLink();
        },
      },
      {
        id: "act-theme",
        group: "Actions",
        label: appMode === "dark" ? "Switch Studio to Light Theme" : "Switch Studio to Dark Aubergine",
        icon: appMode === "dark" ? <Sun size={14} /> : <Moon size={14} />,
        run: () => setAppMode((m) => (m === "dark" ? "light" : "dark")),
      },
    ];

    for (const node of listEditableNodes(ir)) {
      items.push({
        id: `node-${node.id}`,
        group: "Select Node",
        label: `${getFriendlyNodeName(node)} (#${node.id})`,
        hint: node.kind,
        icon: <Layers size={13} style={{ color: CHARM_TOKENS.lilac }} />,
        run: () => setSelectedId(node.id),
      });
    }

    for (const tpl of TEMPLATES) {
      items.push({
        id: `tpl-${tpl.id}`,
        group: "Load Scene",
        label: tpl.label,
        icon: <Layers size={13} />,
        run: () => loadTemplate(tpl.id),
      });
    }

    return items;
  }, [
    activeLens,
    appMode,
    ir,
    loadTemplate,
    onOpenDesktop,
    onOpenImport,
    onOpenProjects,
    onOpenScenes,
    onOpenSettings,
    setActiveLens,
    setAppMode,
    setSelectedId,
    shareLink,
  ]);

  if (!open) return null;

  const q = query.trim().toLowerCase();
  const filtered = q
    ? actions.filter((a) => a.label.toLowerCase().includes(q) || a.group.toLowerCase().includes(q))
    : actions.slice(0, 14);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 130,
        background: "var(--cs-backdrop)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        paddingTop: "10vh",
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(540px, 100%)",
          background: CHARM_TOKENS.bgSurface,
          border: `1px solid ${CHARM_TOKENS.borderStrong}`,
          borderRadius: 16,
          boxShadow: "var(--cs-shadow)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            borderBottom: `1px solid ${CHARM_TOKENS.border}`,
          }}
        >
          <Command size={15} style={{ color: CHARM_TOKENS.pink, flexShrink: 0 }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to lens, pane, scene, or action..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: CHARM_TOKENS.textHeading,
              fontSize: 13.5,
              outline: "none",
            }}
          />
          <button
            onClick={onClose}
            aria-label="Close command palette"
            style={{
              background: "transparent",
              border: "none",
              color: CHARM_TOKENS.textMuted,
              padding: 4,
              display: "inline-flex",
            }}
          >
            <X size={15} />
          </button>
        </div>

        <div style={{ maxHeight: 360, overflowY: "auto", padding: 8, display: "flex", flexDirection: "column", gap: 3 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 18, textAlign: "center", fontSize: 12.5, color: CHARM_TOKENS.textMuted }}>
              No matching commands.
            </div>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  item.run();
                  onClose();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 10px",
                  borderRadius: 9,
                  background: "transparent",
                  border: "1px solid transparent",
                  color: CHARM_TOKENS.text,
                  fontSize: 13,
                }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                  {item.icon}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.label}
                  </span>
                </span>
                <span style={{ fontSize: 11, color: CHARM_TOKENS.textDim, whiteSpace: "nowrap" }}>
                  {item.hint || item.group}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
