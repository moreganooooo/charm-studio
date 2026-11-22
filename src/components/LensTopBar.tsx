import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  Command,
  Download,
  Folder,
  GitBranch,
  HelpCircle,
  Layers,
  Link2,
  Moon,
  Redo2,
  Server,
  Settings,
  Sun,
  Undo2,
  User as UserIcon,
} from "lucide-react";
import { useStudioStore } from "../store/studioStore";
import type { StudioLens } from "../types";
import { CHARM_TOKENS, studioStyles } from "./studioStyles";

interface Props {
  projectsCount: number;
  userLabel: string | null;
  onOpenScenes: () => void;
  onOpenImport: () => void;
  onOpenCommandPalette: () => void;
  onOpenDesktop: () => void;
  onOpenProjects: () => void;
  onOpenSettings: () => void;
  onOpenGlossary: () => void;
  onOpenGuide: () => void;
  onOpenAuth: () => void;
  onSnapshotPng?: () => void;
}

const LENSES: { id: StudioLens; label: string }[] = [
  { id: "visual", label: "Visual" },
  { id: "hybrid", label: "Hybrid" },
  { id: "code", label: "Code" },
];

export function LensTopBar({
  projectsCount,
  userLabel,
  onOpenScenes,
  onOpenImport,
  onOpenCommandPalette,
  onOpenDesktop,
  onOpenProjects,
  onOpenSettings,
  onOpenGlossary,
  onOpenGuide,
  onOpenAuth,
  onSnapshotPng,
}: Props) {
  const {
    activeLens,
    setActiveLens,
    past,
    future,
    undo,
    redo,
    shareLink,
    sharedCopied,
    appMode,
    setAppMode,
    desktopConnected,
    markStep,
    setRightTab,
  } = useStudioStore();

  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [moreOpen]);

  const handleExportGo = () => {
    setActiveLens("code");
    setRightTab("code");
    markStep("exportedCode");
  };

  return (
    <header style={studioStyles.topBar}>
      {/* LEFT ZONE: Brand + Scenes + Undo/Redo */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: CHARM_TOKENS.pink }} aria-hidden="true">
            <path d="M12 1L14.8 9.2L23 12L14.8 14.8L12 23L9.2 14.8L1 12L9.2 9.2L12 1Z" />
          </svg>
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: CHARM_TOKENS.textHeading,
            }}
          >
            Charm Studio
          </span>
        </div>

        <button onClick={onOpenScenes} style={studioStyles.secondaryBtn} title="Browse starter layouts and scenes">
          <Layers size={13} style={{ color: CHARM_TOKENS.lilac }} />
          <span>Scenes</span>
        </button>

        <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <button
            onClick={undo}
            disabled={past.length === 0}
            title="Undo (Cmd/Ctrl + Z)"
            aria-label="Undo"
            style={{
              ...studioStyles.secondaryBtn,
              padding: "6px 8px",
              opacity: past.length === 0 ? 0.45 : 1,
            }}
          >
            <Undo2 size={13} />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            title="Redo (Cmd/Ctrl + Shift + Z)"
            aria-label="Redo"
            style={{
              ...studioStyles.secondaryBtn,
              padding: "6px 8px",
              opacity: future.length === 0 ? 0.45 : 1,
            }}
          >
            <Redo2 size={13} />
          </button>
        </div>
      </div>

      {/* CENTER ZONE: Three-Lens Pill Switcher */}
      <nav aria-label="Studio workspace lens" style={studioStyles.lensPillGroup}>
        {LENSES.map((lens) => {
          const active = activeLens === lens.id;
          return (
            <button
              key={lens.id}
              onClick={() => setActiveLens(lens.id)}
              style={{
                border: "none",
                borderRadius: 999,
                padding: "6px 15px",
                fontSize: 12.5,
                fontWeight: active ? 700 : 600,
                background: active ? "var(--cs-pink)" : "transparent",
                color: active ? "#150f1d" : CHARM_TOKENS.textMuted,
                whiteSpace: "nowrap",
                transition: "background 150ms ease, color 150ms ease",
              }}
            >
              {lens.label}
            </button>
          );
        })}
      </nav>

      {/* RIGHT ZONE: Progressive Disclosure Controls + Primary Export Go CTA */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, minWidth: 0 }}>
        {(activeLens === "hybrid" || activeLens === "code") && (
          <button onClick={onOpenImport} style={studioStyles.secondaryBtn}>
            <GitBranch size={13} />
            <span>Import Go</span>
          </button>
        )}

        {activeLens === "code" && (
          <button
            onClick={onOpenDesktop}
            style={{
              ...studioStyles.secondaryBtn,
              borderColor: desktopConnected ? CHARM_TOKENS.mintBorder : "var(--cs-btn-border)",
              color: desktopConnected ? CHARM_TOKENS.mint : "var(--cs-btn-text)",
            }}
          >
            <Server size={13} />
            <span>{desktopConnected ? "Desktop · Live" : "Desktop · PTY"}</span>
          </button>
        )}

        {(activeLens === "hybrid" || activeLens === "code") && (
          <button
            onClick={onOpenCommandPalette}
            title="Command Palette (Cmd/Ctrl + K)"
            style={{ ...studioStyles.secondaryBtn, padding: "6px 9px" }}
          >
            <Command size={12} />
            <span className="cs-mono" style={{ fontSize: 11 }}>⌘K</span>
          </button>
        )}

        {activeLens === "code" && (
          <button onClick={() => void shareLink()} style={studioStyles.secondaryBtn}>
            {sharedCopied ? <Check size={13} style={{ color: CHARM_TOKENS.mint }} /> : <Link2 size={13} />}
            <span>{sharedCopied ? "Copied" : "Share"}</span>
          </button>
        )}

        {/* More Dropdown Menu */}
        <div ref={moreRef} style={{ position: "relative" }}>
          <button
            onClick={() => setMoreOpen((v) => !v)}
            style={studioStyles.secondaryBtn}
            aria-expanded={moreOpen}
          >
            <span>More</span>
            <ChevronDown size={13} />
          </button>

          {moreOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 6px)",
                width: 230,
                zIndex: 90,
                background: CHARM_TOKENS.bgSurface,
                border: `1px solid ${CHARM_TOKENS.borderStrong}`,
                borderRadius: 12,
                padding: 6,
                boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06), var(--cs-shadow)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {onSnapshotPng && (
                <MenuItem
                  icon={<Camera size={13} style={{ color: CHARM_TOKENS.pink }} />}
                  label="Snapshot PNG (Aubergine Card)"
                  onClick={() => {
                    setMoreOpen(false);
                    onSnapshotPng();
                  }}
                />
              )}
              <MenuItem
                icon={<GitBranch size={13} />}
                label="Import Go / GitHub"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenImport();
                }}
              />
              <MenuItem
                icon={<Folder size={13} />}
                label={`Saved Projects (${projectsCount})`}
                onClick={() => {
                  setMoreOpen(false);
                  onOpenProjects();
                }}
              />
              <MenuItem
                icon={<Server size={13} />}
                label={desktopConnected ? "Desktop · PTY & MCP (Live)" : "Desktop · PTY & MCP"}
                onClick={() => {
                  setMoreOpen(false);
                  onOpenDesktop();
                }}
              />
              <MenuItem
                icon={<Command size={13} />}
                label="Command Palette (⌘K)"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenCommandPalette();
                }}
              />
              <div style={{ height: 1, background: CHARM_TOKENS.border, margin: "4px 6px" }} />
              <MenuItem
                icon={<BookOpen size={13} style={{ color: CHARM_TOKENS.mint }} />}
                label="Charm Glossary"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenGlossary();
                }}
              />
              <MenuItem
                icon={<HelpCircle size={13} style={{ color: CHARM_TOKENS.lilac }} />}
                label="Guide & FAQ"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenGuide();
                }}
              />
              <MenuItem
                icon={<Settings size={13} />}
                label="Studio Settings"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenSettings();
                }}
              />
              <MenuItem
                icon={appMode === "dark" ? <Sun size={13} /> : <Moon size={13} />}
                label={appMode === "dark" ? "Switch to Light UI" : "Switch to Dark Aubergine"}
                onClick={() => {
                  setAppMode((m) => (m === "dark" ? "light" : "dark"));
                  setMoreOpen(false);
                }}
              />
              <div style={{ height: 1, background: CHARM_TOKENS.border, margin: "4px 6px" }} />
              <MenuItem
                icon={<UserIcon size={13} />}
                label={userLabel ?? "Sign In / Cloud Sync"}
                onClick={() => {
                  setMoreOpen(false);
                  onOpenAuth();
                }}
              />
            </div>
          )}
        </div>

        <button onClick={handleExportGo} style={studioStyles.primaryCta}>
          <Download size={13} />
          <span>Export Go</span>
        </button>
      </div>
    </header>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        width: "100%",
        textAlign: "left",
        padding: "7px 10px",
        borderRadius: 8,
        border: "none",
        background: "transparent",
        color: CHARM_TOKENS.text,
        fontSize: 12.5,
        fontWeight: 500,
      }}
    >
      <span style={{ color: CHARM_TOKENS.textMuted, display: "inline-flex", flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </button>
  );
}
