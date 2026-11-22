import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckCircle2,
  Code2,
  GitBranch,
  Sparkles,
  X,
} from "lucide-react";
import { AuthModal, type LocalUser } from "./AuthModal";
import { CharmGlossaryModal } from "./CharmGlossaryModal";
import { CommandPaletteModal } from "./components/CommandPaletteModal";
import { LensRightRail } from "./components/LensRightRail";
import { LensTopBar } from "./components/LensTopBar";
import { ScenePickerModal } from "./components/ScenePickerModal";
import { btnStyle, CHARM_TOKENS, studioStyles } from "./components/studioStyles";
import { DesktopCompanionModal } from "./DesktopCompanionModal";
import { applyInlineGoExpression, isEditableGoExpressionLine, resolveLinkedCodeSlice } from "./goInlineSync";
import { GuideFaqModal } from "./GuideFaqModal";
import { ImportModal } from "./ImportModal";
import { LayersPanel } from "./LayersPanel";
import { ProjectsModal } from "./ProjectsModal";
import {
  deleteCloudProject,
  deleteLocalProject,
  fetchPublicCloudProject,
  listCloudProjects,
  listLocalProjects,
  saveLocalProject,
  upsertCloudProject,
  type StudioProject,
} from "./projectsStore";
import { SettingsModal } from "./SettingsModal";
import { MATRIX_PRESETS, StudioProvider, useStudioStore } from "./store/studioStore";
import { supabase } from "./supabaseClient";
import { TerminalViewport } from "./TerminalViewport";
import { TooltipProvider } from "./Tooltip";
import type { ColorProfile, MatrixFitStatus } from "./types";
import { WidgetPickerModal } from "./WidgetPickerModal";

const COACH_KEY = "charmstudio:coachDismissed:v1";

export default function App() {
  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}

function StudioShell() {
  const {
    activeLens,
    setActiveLens,
    workspaceMode,
    templateId,
    setTemplateId,
    paletteId,
    setPaletteId,
    ir,
    commitIr,
    replaceIrWithoutHistory,
    undo,
    redo,
    renderTick,
    bumpTick,
    layersOpen,
    setLayersOpen,
    setRightTab,
    appMode,
    tooltipsEnabled,
    setTooltipsEnabled,
    fontFamily,
    setFontFamily,
    customThemes,
    addCustomTheme,
    clearCustomThemes,
    palette,
    allPalettes,
    selectPalette,
    viewMode,
    setViewMode,
    matrixDense,
    setMatrixDense,
    cols,
    setCols,
    rows,
    setRows,
    colorProfile,
    setColorProfile,
    showOverlay,
    setShowOverlay,
    selectedId,
    setSelectedId,
    selectedNode,
    singleTel,
    setSingleTel,
    onboarding,
    setOnboarding,
    markStep,
    activeSpotlight,
    addBox,
    addPreset,
    split,
    moveSiblingNode,
    dropNode,
    renameNode,
    duplicateNode,
    unwrapNode,
    deleteNode,
    toggleOverlay,
    setOverlayAnchor,
    addOverlay,
    removeOverlay,
    goModuleName,
    activeProperty,
    setActiveProperty,
    lastKeyPulse,
    matrixFitStatus,
    updateSelectedStyle,
    updateNode,
    loadTemplate,
    previewMode,
    setPreviewMode,
    ptyStatus,
    desktopConnected,
  } = useStudioStore();

  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importInitialTab, setImportInitialTab] = useState<"upload" | "github">("upload");
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [scenesOpen, setScenesOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [hybridEditLine, setHybridEditLine] = useState<{ lineNo: number; value: string } | null>(null);
  const [hybridPulseLive, setHybridPulseLive] = useState(false);

  const [coachDismissed, setCoachDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COACH_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [authError, setAuthError] = useState<string | null>(null);
  const [localUser, setLocalUser] = useState<LocalUser | null>(() => {
    try {
      return JSON.parse(localStorage.getItem("charmstudio:localUser") || "null");
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<User | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem("charmstudio:ghToken");
    } catch {
      return null;
    }
  });
  const [postLoginBanner, setPostLoginBanner] = useState(false);

  const [localProjects, setLocalProjects] = useState<StudioProject[]>(() => listLocalProjects());
  const [cloudProjects, setCloudProjects] = useState<StudioProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);

  const inspectorScrollRef = useRef<HTMLDivElement>(null);
  const snapshotActionRef = useRef<(() => void) | null>(null);

  const allProjects = useMemo(() => {
    const cloudIds = new Set(cloudProjects.map((p) => p.id));
    return [...cloudProjects, ...localProjects.filter((p) => !cloudIds.has(p.id))];
  }, [cloudProjects, localProjects]);

  const userLabel = useMemo(() => {
    if (user) {
      return `@${(user.user_metadata?.user_name as string | undefined) || user.email || "GitHub"}`;
    }
    if (localUser) return `@${localUser.username}`;
    return null;
  }, [user, localUser]);

  useEffect(() => {
    if (!lastKeyPulse || activeLens !== "hybrid") return;
    const t0 = setTimeout(() => setHybridPulseLive(true), 0);
    const t1 = setTimeout(() => setHybridPulseLive(false), 1500);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [lastKeyPulse, activeLens]);

  const linkedGoSlice = useMemo(
    () =>
      activeLens === "hybrid"
        ? resolveLinkedCodeSlice(ir, selectedNode, activeProperty, goModuleName, lastKeyPulse, hybridPulseLive)
        : null,
    [activeLens, ir, selectedNode, activeProperty, goModuleName, lastKeyPulse, hybridPulseLive]
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setGlossaryOpen(false);
        setGuideOpen(false);
        setSettingsOpen(false);
        setWidgetPickerOpen(false);
        setImportOpen(false);
        setProjectsOpen(false);
        setAuthOpen(false);
        setDesktopOpen(false);
        setScenesOpen(false);
        setCommandPaletteOpen(false);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Supabase Auth & OAuth callback lifecycle
  useEffect(() => {
    const qErr = new URLSearchParams(window.location.search).get("error_description");
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hErr = hashParams.get("error_description");
    if (qErr || hErr) {
      setAuthError(qErr || hErr);
    }
    if (!supabase) return;

    const captureToken = (token?: string | null) => {
      if (!token) return;
      setGithubToken(token);
      try {
        sessionStorage.setItem("charmstudio:ghToken", token);
      } catch {}
    };

    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const providerTokenFromHash = hashParams.get("provider_token");

    (async () => {
      if (accessToken && refreshToken) {
        captureToken(providerTokenFromHash);
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setAuthError(`Session error: ${error.message}`);
        } else if (data.session?.user) {
          captureToken(data.session.provider_token);
          setUser(data.session.user);
          setPostLoginBanner(true);
          listCloudProjects(data.session.user.id).then(setCloudProjects).catch(console.error);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          return;
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) setAuthError(`Auth error: ${error.message}`);
      captureToken(data.session?.provider_token);
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) listCloudProjects(u.id).then(setCloudProjects).catch(console.error);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((ev, session) => {
      captureToken(session?.provider_token);
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        if (ev === "SIGNED_IN") setPostLoginBanner(true);
        listCloudProjects(u.id).then(setCloudProjects).catch(console.error);
      } else {
        setCloudProjects([]);
        setPostLoginBanner(false);
        setGithubToken(null);
        try {
          sessionStorage.removeItem("charmstudio:ghToken");
        } catch {}
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load shared ?p=<id> cloud project
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("p");
    if (!pid) return;
    fetchPublicCloudProject(pid).then((proj) => {
      if (!proj) return;
      replaceIrWithoutHistory(proj.ir, {
        paletteId: proj.paletteId,
        templateId: proj.templateId,
      });
    });
  }, [replaceIrWithoutHistory]);

  // Auto-save active project
  useEffect(() => {
    if (!activeProjectId) return;
    const active = allProjects.find((p) => p.id === activeProjectId);
    if (!active) return;

    const updated: StudioProject = {
      ...active,
      ir,
      paletteId,
      templateId,
      updatedAt: new Date().toISOString(),
    };

    if (active.source === "local") {
      setLocalProjects(saveLocalProject(updated));
      return;
    }
    if (active.source === "cloud" && user) {
      const timer = setTimeout(() => {
        upsertCloudProject(user.id, updated)
          .then((saved) => setCloudProjects((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]))
          .catch(console.error);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [ir, paletteId, templateId, activeProjectId, user, allProjects]);

  const selectedTel = singleTel.find((t) => t.id === selectedId) ?? null;
  const primaryOverlay = ir.overlays[0] ?? null;

  const dismissCoach = () => {
    setCoachDismissed(true);
    try {
      localStorage.setItem(COACH_KEY, "1");
    } catch {}
  };

  const terminalOverlayMode: "none" | "padding-band" | "full-box-model" =
    activeLens === "visual"
      ? "none"
      : activeLens === "hybrid"
      ? "padding-band"
      : showOverlay
      ? "full-box-model"
      : "none";

  return (
    <TooltipProvider enabled={tooltipsEnabled}>
      <div style={studioStyles.shell}>
        {/* ZONE 1: 56px Three-Zone Progressive Disclosure Top Bar */}
        <LensTopBar
          projectsCount={allProjects.length}
          userLabel={userLabel}
          onOpenScenes={() => setScenesOpen(true)}
          onOpenImport={() => {
            setImportInitialTab(user ? "github" : "upload");
            setImportOpen(true);
          }}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenDesktop={() => setDesktopOpen(true)}
          onOpenProjects={() => setProjectsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenGlossary={() => setGlossaryOpen(true)}
          onOpenGuide={() => setGuideOpen(true)}
          onOpenAuth={() => setAuthOpen(true)}
          onSnapshotPng={
            previewMode === "wasm" && !(activeLens === "code" && viewMode === "matrix")
              ? () => snapshotActionRef.current?.()
              : undefined
          }
        />

        {/* Auth Error or Post-Login Sync Notice */}
        {authError && (
          <div
            style={{
              padding: "8px 18px",
              background: "rgba(244, 63, 94, 0.14)",
              borderBottom: "1px solid rgba(244, 63, 94, 0.45)",
              color: "#fda4af",
              fontSize: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <span><b>Auth Error:</b> {authError}</span>
            <button
              onClick={() => setAuthError(null)}
              style={{ background: "none", border: "none", color: "inherit", padding: 2, display: "inline-flex" }}
              aria-label="Dismiss auth error"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {user && postLoginBanner && (
          <div
            style={{
              padding: "8px 18px",
              background: CHARM_TOKENS.bgSurface,
              borderBottom: `1px solid ${CHARM_TOKENS.mintBorder}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            <div style={{ fontSize: 12, color: CHARM_TOKENS.text, display: "flex", alignItems: "center", gap: 8 }}>
              <CheckCircle2 size={14} style={{ color: CHARM_TOKENS.mint }} />
              <span>
                Connected as <b>@{(user.user_metadata?.user_name as string | undefined) || user.email}</b> · Cloud sync and GitHub repository import unlocked
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button
                onClick={() => {
                  setImportInitialTab("github");
                  setImportOpen(true);
                  setPostLoginBanner(false);
                }}
                style={{
                  ...studioStyles.secondaryBtn,
                  borderColor: CHARM_TOKENS.mintBorder,
                  color: CHARM_TOKENS.mint,
                }}
              >
                <GitBranch size={12} />
                <span>Browse GitHub Repos</span>
              </button>
              <button
                onClick={() => setPostLoginBanner(false)}
                style={{ background: "none", border: "none", color: CHARM_TOKENS.textMuted, padding: 4, display: "inline-flex" }}
                aria-label="Dismiss login banner"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* ZONE 2: Left Outline Rail + Center Hero Terminal Stage + Morphing Right Rail */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
          <LayersPanel
            doc={ir}
            selectedId={selectedId}
            open={layersOpen}
            workspaceMode={workspaceMode}
            spotlightAdd={activeSpotlight === "add-component"}
            onToggleOpen={() => setLayersOpen((v) => !v)}
            onSelect={setSelectedId}
            onAddBox={() => addBox(selectedId)}
            onOpenWidgetPicker={() => setWidgetPickerOpen(true)}
            onSplit={(kind) => split(selectedId, kind)}
            onMove={(dir) => moveSiblingNode(dir, selectedId)}
            onDropNode={dropNode}
            onRenameNode={renameNode}
            onDuplicateNode={() => duplicateNode(selectedId)}
            onUnwrapContainer={() => unwrapNode(selectedId)}
            onDelete={() => deleteNode(selectedId)}
            onToggleOverlay={toggleOverlay}
            onAddOverlay={addOverlay}
            onRemoveOverlay={removeOverlay}
            onCycleOverlayAnchor={setOverlayAnchor}
          />

          {/* CENTER HERO TERMINAL STAGE */}
          <main
            style={{
              flex: 1,
              minWidth: 0,
              overflow: "auto",
              background: "var(--cs-stage-bg)",
              padding: "20px 24px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
            }}
          >
            {/* Compact Stage Toolbar — Visible in Code Lens */}
            {activeLens === "code" && (
              <div
                style={{
                  width: "min(920px, 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 12,
                  background: CHARM_TOKENS.bgSurface,
                  border: `1px solid ${CHARM_TOKENS.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <div
                    style={{
                      display: "inline-flex",
                      background: "var(--cs-input)",
                      border: `1px solid ${CHARM_TOKENS.border}`,
                      borderRadius: 8,
                      padding: 2,
                    }}
                  >
                    <button
                      onClick={() => setViewMode("single")}
                      style={stageToggleBtn(viewMode === "single")}
                    >
                      Single
                    </button>
                    <button
                      onClick={() => setViewMode("matrix")}
                      style={stageToggleBtn(viewMode === "matrix")}
                    >
                      Matrix (3×)
                    </button>
                  </div>

                  {viewMode === "matrix" ? (
                    <button
                      onClick={() => setMatrixDense((v) => !v)}
                      style={btnStyle(matrixDense)}
                    >
                      Dense
                    </button>
                  ) : (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: CHARM_TOKENS.textMuted }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span>Cols</span>
                        <input
                          type="number"
                          min={30}
                          max={140}
                          value={cols}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n)) setCols(Math.max(30, Math.min(140, Math.round(n))));
                          }}
                          className="cs-mono"
                          style={compactNumInput}
                        />
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span>Rows</span>
                        <input
                          type="number"
                          min={10}
                          max={45}
                          value={rows}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n)) setRows(Math.max(10, Math.min(45, Math.round(n))));
                          }}
                          className="cs-mono"
                          style={compactNumInput}
                        />
                      </label>
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <select
                    aria-label="Terminal theme"
                    value={paletteId}
                    onChange={(e) => selectPalette(e.target.value)}
                    style={compactSelect}
                  >
                    {allPalettes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Color profile"
                    value={colorProfile}
                    onChange={(e) => setColorProfile(e.target.value as ColorProfile)}
                    style={compactSelect}
                  >
                    <option value="truecolor">TrueColor</option>
                    <option value="ansi256">ANSI 256</option>
                    <option value="ansi16">ANSI 16</option>
                    <option value="ascii">ASCII</option>
                  </select>

                  <button onClick={() => setShowOverlay((v) => !v)} style={btnStyle(showOverlay)}>
                    DevTools
                  </button>

                  {primaryOverlay && (
                    <button
                      onClick={() => toggleOverlay(primaryOverlay.node.id)}
                      style={btnStyle(primaryOverlay.visible)}
                    >
                      Overlay
                    </button>
                  )}

                  <div
                    style={{
                      display: "inline-flex",
                      background: "var(--cs-input)",
                      border: `1px solid ${CHARM_TOKENS.border}`,
                      borderRadius: 8,
                      padding: 2,
                    }}
                  >
                    <button
                      onClick={() => setPreviewMode("wasm")}
                      style={stageToggleBtn(previewMode === "wasm")}
                    >
                      WASM
                    </button>
                    <button
                      onClick={() => {
                        if (desktopConnected) {
                          setPreviewMode("pty");
                        } else {
                          setDesktopOpen(true);
                        }
                      }}
                      title={desktopConnected ? "Switch to Native PTY runner" : "Connect Wails Desktop Companion for Native PTY"}
                      style={stageToggleBtn(previewMode === "pty")}
                    >
                      Native PTY
                    </button>
                  </div>

                  <MatrixFitPill
                    status={matrixFitStatus}
                    onSelectOverflow={(nodeId) => setSelectedId(nodeId)}
                  />
                </div>
              </div>
            )}

            {/* Multi-Size Fit Pill in Hybrid Lens */}
            {activeLens === "hybrid" && (
              <div style={{ width: "min(760px, 100%)", display: "flex", justifyContent: "flex-end" }}>
                <MatrixFitPill
                  status={matrixFitStatus}
                  onSelectOverflow={(nodeId) => setSelectedId(nodeId)}
                />
              </div>
            )}

            {/* Centered Hero Terminal Viewport(s) */}
            {activeLens === "code" && viewMode === "matrix" ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: 18,
                  alignItems: "flex-start",
                  width: "100%",
                }}
              >
                {MATRIX_PRESETS.map((vp) => (
                  <TerminalViewport
                    key={vp.title}
                    title={vp.title}
                    doc={ir}
                    renderTick={renderTick}
                    cols={vp.cols}
                    rows={vp.rows}
                    fontSize={matrixDense ? 9.5 : 11}
                    fontFamily={fontFamily}
                    palette={palette}
                    colorProfile={colorProfile}
                    showOverlay={showOverlay}
                    overlayMode={showOverlay ? "full-box-model" : "none"}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onInteract={bumpTick}
                  />
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: "100%" }}>
                <TerminalViewport
                  title={previewMode === "pty" ? "Native PTY Viewport" : "Interactive Preview"}
                  mode={previewMode}
                  ptyStatus={ptyStatus}
                  doc={ir}
                  renderTick={renderTick}
                  cols={cols}
                  rows={rows}
                  fontSize={14}
                  fontFamily={fontFamily}
                  palette={palette}
                  colorProfile={colorProfile}
                  showOverlay={terminalOverlayMode !== "none"}
                  overlayMode={terminalOverlayMode}
                  showQuickBar={activeLens !== "visual"}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onInteract={bumpTick}
                  onResize={(c, r) => {
                    setCols(c);
                    setRows(r);
                  }}
                  onTelemetry={setSingleTel}
                  onQuickSplit={(id, kind) => split(id, kind)}
                  onQuickWidgetPicker={(id) => {
                    setSelectedId(id);
                    setWidgetPickerOpen(true);
                  }}
                  onQuickClone={(id) => duplicateNode(id)}
                  onQuickDelete={(id) => deleteNode(id)}
                  onQuickInlineEdit={(id, nextContent) => {
                    updateNode(id, (n) => ({ ...n, content: nextContent }));
                    markStep("styledOrInteracted");
                  }}
                  onRequestInspectData={() => {
                    if (activeLens === "visual") setActiveLens("hybrid");
                    setRightTab("inspector");
                    setTimeout(() => inspectorScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 40);
                  }}
                  snapshotActionRef={snapshotActionRef}
                />

                {selectedTel?.overflowMsg && (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#fda4af",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <AlertTriangle size={13} />
                    <span>{selectedTel.overflowMsg}</span>
                  </div>
                )}

                {activeLens !== "visual" && selectedTel && (
                  <div
                    className="cs-mono"
                    style={{
                      fontSize: 11.5,
                      color: CHARM_TOKENS.textMuted,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    #{selectedTel.id} · outer {selectedTel.margin.w}×{selectedTel.margin.h} · content {selectedTel.content.w}×{selectedTel.content.h}
                  </div>
                )}
              </div>
            )}

            {/* LENS 1 (Visual): Dismissible Mint Coach Mark */}
            {activeLens === "visual" && !coachDismissed && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 14px",
                  borderRadius: 12,
                  background: CHARM_TOKENS.mintBg,
                  border: `1px solid ${CHARM_TOKENS.mintBorder}`,
                  color: CHARM_TOKENS.mint,
                  fontSize: 12.5,
                  fontWeight: 600,
                  maxWidth: "min(620px, 100%)",
                }}
              >
                <Sparkles size={14} style={{ flexShrink: 0 }} />
                <span>Drag any edge or click a pane. Switch to Hybrid to see the live Go.</span>
                <button
                  onClick={() => setActiveLens("hybrid")}
                  style={{
                    border: `1px solid ${CHARM_TOKENS.mintBorder}`,
                    background: "transparent",
                    color: CHARM_TOKENS.mint,
                    borderRadius: 7,
                    padding: "4px 9px",
                    fontSize: 11.5,
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>Hybrid</span>
                  <ArrowRight size={12} />
                </button>
                <button
                  onClick={dismissCoach}
                  aria-label="Dismiss hint"
                  title="Dismiss"
                  style={{
                    background: "none",
                    border: "none",
                    color: CHARM_TOKENS.mint,
                    padding: 3,
                    display: "inline-flex",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}

            {/* LENS 2 (Hybrid): Real Code-Span Linked Go Card directly beneath the terminal */}
            {activeLens === "hybrid" && linkedGoSlice && (
              <section
                aria-label="Linked Go code preview"
                style={{
                  ...studioStyles.codeCard,
                  width: "min(760px, 100%)",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                    padding: "9px 14px",
                    background: CHARM_TOKENS.bgSurface,
                    borderBottom: `1px solid ${CHARM_TOKENS.border}`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flexWrap: "wrap" }}>
                    <Code2 size={14} style={{ color: CHARM_TOKENS.lilac, flexShrink: 0 }} />
                    <span className="cs-mono" style={{ fontSize: 12, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
                      {linkedGoSlice.file === "theme_gen.go" || linkedGoSlice.file === "layout_gen.go"
                        ? `ui/${linkedGoSlice.file}`
                        : linkedGoSlice.file}
                    </span>
                    <span className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.textMuted }}>
                      L{linkedGoSlice.startLine}–L{linkedGoSlice.endLine}
                    </span>
                    {selectedNode?.style && (
                      <span className="cs-mono" style={{ fontSize: 11.5, color: CHARM_TOKENS.lilac }}>
                        · {selectedNode.style}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: CHARM_TOKENS.textDim }}>
                      · Click a property line to edit Go
                    </span>
                  </div>

                  <button
                    onClick={() => setActiveLens("code")}
                    style={{
                      ...studioStyles.secondaryBtn,
                      padding: "4px 9px",
                      fontSize: 11.5,
                    }}
                  >
                    <span>Open Full Code</span>
                    <ArrowRight size={12} />
                  </button>
                </div>

                <div
                  style={{
                    overflowX: "auto",
                    background: CHARM_TOKENS.bgCode,
                  }}
                >
                  <pre
                    className="cs-mono"
                    style={{
                      margin: 0,
                      padding: "10px 0",
                      minWidth: "max-content",
                      width: "100%",
                      fontSize: 12,
                      lineHeight: 1.55,
                      color: CHARM_TOKENS.text,
                    }}
                  >
                    {linkedGoSlice.lines.map((item) => {
                      const editable = isEditableGoExpressionLine(item.text);
                      const isEditing = hybridEditLine?.lineNo === item.lineNo;
                      return (
                        <div
                          key={item.lineNo}
                          onClick={() => {
                            if (editable && !isEditing) {
                              setHybridEditLine({ lineNo: item.lineNo, value: item.text.trim() });
                            }
                          }}
                          title={editable ? "Click to edit Go expression directly" : undefined}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            minWidth: "100%",
                            paddingRight: 18,
                            whiteSpace: "pre",
                            background: item.isHighlighted ? "rgba(255, 94, 174, 0.16)" : "transparent",
                            color: item.isHighlighted ? CHARM_TOKENS.textHeading : CHARM_TOKENS.text,
                            cursor: editable ? "pointer" : "default",
                          }}
                        >
                          <span
                            style={{
                              position: "sticky",
                              left: 0,
                              zIndex: 2,
                              width: 44,
                              flexShrink: 0,
                              color: CHARM_TOKENS.textDim,
                              background: "var(--cs-bg-code)",
                              borderLeft: item.isHighlighted ? `3px solid ${CHARM_TOKENS.pink}` : "3px solid transparent",
                              borderRight: "1px solid var(--cs-border-subtle)",
                              userSelect: "none",
                              textAlign: "right",
                              paddingLeft: 6,
                              paddingRight: 8,
                              marginRight: 10,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {item.lineNo}
                          </span>
                          {isEditing ? (
                            <input
                              autoFocus
                              value={hybridEditLine.value}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setHybridEditLine({ lineNo: item.lineNo, value: e.target.value })}
                              onBlur={() => setHybridEditLine(null)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  applyInlineGoExpression(hybridEditLine.value, {
                                    doc: ir,
                                    targetNode: selectedNode,
                                    updateSelectedStyle,
                                    updateNode,
                                    setActiveProperty,
                                  });
                                  setHybridEditLine(null);
                                } else if (e.key === "Escape") {
                                  setHybridEditLine(null);
                                }
                              }}
                              style={{
                                minWidth: 260,
                                flex: 1,
                                background: "#150f1d",
                                color: "#f4eaff",
                                border: `1px solid ${CHARM_TOKENS.pink}`,
                                borderRadius: 4,
                                padding: "1px 6px",
                                fontFamily: "var(--cs-font-mono)",
                                fontSize: 12,
                                outline: "none",
                              }}
                            />
                          ) : (
                            <span>{item.text || " "}</span>
                          )}
                        </div>
                      );
                    })}
                  </pre>
                </div>
              </section>
            )}
          </main>

          {/* Morphing Right Rail (Floating Visual Card / Hybrid Box-Model / Code File Tree) */}
          <LensRightRail inspectorScrollRef={inspectorScrollRef} />
        </div>

        {/* Modals */}
        <ScenePickerModal open={scenesOpen} onClose={() => setScenesOpen(false)} />

        <CommandPaletteModal
          open={commandPaletteOpen}
          onClose={() => setCommandPaletteOpen(false)}
          onOpenScenes={() => setScenesOpen(true)}
          onOpenImport={() => {
            setImportInitialTab(user ? "github" : "upload");
            setImportOpen(true);
          }}
          onOpenDesktop={() => setDesktopOpen(true)}
          onOpenProjects={() => setProjectsOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        <AuthModal
          open={authOpen}
          onClose={() => setAuthOpen(false)}
          user={user}
          localUser={localUser}
          onLocalSignIn={(username) => {
            const next = { username };
            setLocalUser(next);
            try {
              localStorage.setItem("charmstudio:localUser", JSON.stringify(next));
            } catch {}
          }}
          onLocalSignOut={() => {
            setLocalUser(null);
            try {
              localStorage.removeItem("charmstudio:localUser");
            } catch {}
          }}
          onOpenProjects={() => setProjectsOpen(true)}
          onOpenGitHubImport={() => {
            setImportInitialTab("github");
            setImportOpen(true);
          }}
        />

        <ProjectsModal
          open={projectsOpen}
          onClose={() => setProjectsOpen(false)}
          user={user}
          projects={allProjects}
          activeProjectId={activeProjectId}
          busy={projectBusy}
          onSaveNew={async (name) => {
            setProjectBusy(true);
            try {
              const fresh: StudioProject = {
                id: crypto.randomUUID(),
                name,
                schemaVersion: 1,
                templateId,
                paletteId,
                ir,
                isPublic: false,
                updatedAt: new Date().toISOString(),
                source: user ? "cloud" : "local",
              };
              if (user) {
                const saved = await upsertCloudProject(user.id, fresh);
                setCloudProjects((prev) => [saved, ...prev]);
                setActiveProjectId(saved.id);
              } else {
                setLocalProjects(saveLocalProject(fresh));
                setActiveProjectId(fresh.id);
              }
            } finally {
              setProjectBusy(false);
            }
          }}
          onSaveOverwrite={async () => {
            const active = allProjects.find((p) => p.id === activeProjectId);
            if (!active) return;
            setProjectBusy(true);
            try {
              const updated: StudioProject = {
                ...active,
                ir,
                paletteId,
                templateId,
                updatedAt: new Date().toISOString(),
              };
              if (user && active.source === "cloud") {
                const saved = await upsertCloudProject(user.id, updated);
                setCloudProjects((prev) => [saved, ...prev.filter((p) => p.id !== saved.id)]);
              } else {
                setLocalProjects(saveLocalProject(updated));
              }
            } finally {
              setProjectBusy(false);
            }
          }}
          onLoadProject={(proj) => {
            commitIr(proj.ir);
            setPaletteId(proj.paletteId);
            setTemplateId(proj.templateId);
            setActiveProjectId(proj.id);
            setSelectedId(proj.ir.root.id);
          }}
          onTogglePublic={async (proj) => {
            if (!user) return;
            const saved = await upsertCloudProject(user.id, { ...proj, isPublic: !proj.isPublic });
            setCloudProjects((prev) => prev.map((p) => (p.id === saved.id ? saved : p)));
          }}
          onDeleteProject={async (proj) => {
            if (proj.source === "cloud" && user) {
              await deleteCloudProject(proj.id);
              setCloudProjects((prev) => prev.filter((p) => p.id !== proj.id));
            } else {
              setLocalProjects(deleteLocalProject(proj.id));
            }
            if (activeProjectId === proj.id) setActiveProjectId(null);
          }}
        />

        <ImportModal
          open={importOpen}
          initialTab={importInitialTab}
          currentDoc={ir}
          user={user}
          githubToken={githubToken}
          onClose={() => setImportOpen(false)}
          onOpenAuth={() => setAuthOpen(true)}
          onImportIR={(nextDoc, selectNodeId) => {
            commitIr(nextDoc);
            setSelectedId(selectNodeId);
          }}
        />

        <WidgetPickerModal
          open={widgetPickerOpen}
          targetLabel={selectedId}
          onClose={() => setWidgetPickerOpen(false)}
          onSelectPreset={(preset) => addPreset(preset, selectedId)}
        />

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          fontFamily={fontFamily}
          onChangeFont={setFontFamily}
          customThemes={customThemes}
          onAddTheme={addCustomTheme}
          onClearCustomThemes={clearCustomThemes}
          onRestoreChecklist={() => setOnboarding((prev) => ({ ...prev, dismissed: false }))}
          tooltipsEnabled={tooltipsEnabled}
          onToggleTooltips={() => setTooltipsEnabled((v) => !v)}
          doc={ir}
        />

        <GuideFaqModal
          open={guideOpen}
          checklistDismissed={onboarding.dismissed}
          onClose={() => setGuideOpen(false)}
          onRestoreChecklist={() => setOnboarding((prev) => ({ ...prev, dismissed: false }))}
          onOpenWidgetPicker={() => setWidgetPickerOpen(true)}
          onOpenGitHubImport={() => {
            setImportInitialTab("github");
            setImportOpen(true);
          }}
          onOpenProjects={() => setProjectsOpen(true)}
        />

        <CharmGlossaryModal
          open={glossaryOpen}
          appMode={appMode}
          onClose={() => setGlossaryOpen(false)}
          onOpenWidgetPicker={() => setWidgetPickerOpen(true)}
          onLoadTemplate={loadTemplate}
        />

        <DesktopCompanionModal
          open={desktopOpen}
          onClose={() => setDesktopOpen(false)}
        />
      </div>
    </TooltipProvider>
  );
}

const stageToggleBtn = (active: boolean): React.CSSProperties => ({
  border: "none",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11.5,
  fontWeight: active ? 700 : 600,
  background: active ? CHARM_TOKENS.pinkBg : "transparent",
  color: active ? CHARM_TOKENS.pinkSoft : CHARM_TOKENS.textMuted,
});

const compactNumInput: React.CSSProperties = {
  width: 54,
  padding: "4px 6px",
  borderRadius: 6,
  background: "var(--cs-input)",
  border: `1px solid ${CHARM_TOKENS.border}`,
  color: CHARM_TOKENS.textHeading,
  fontSize: 12,
  textAlign: "center",
};

const compactSelect: React.CSSProperties = {
  background: "var(--cs-input)",
  color: CHARM_TOKENS.text,
  border: `1px solid ${CHARM_TOKENS.border}`,
  borderRadius: 7,
  padding: "4px 8px",
  fontSize: 11.5,
  fontWeight: 600,
};

function MatrixFitPill({
  status,
  onSelectOverflow,
}: {
  status: MatrixFitStatus;
  onSelectOverflow: (nodeId: string) => void;
}) {
  if (status.allFit || status.failingPresets.length === 0) {
    return (
      <span
        className="cs-mono"
        title="Checked live across 58×18, 80×24, and 116×30 terminal sizes"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "4px 10px",
          borderRadius: 999,
          background: CHARM_TOKENS.mintBg,
          border: `1px solid ${CHARM_TOKENS.mintBorder}`,
          color: CHARM_TOKENS.mint,
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: "nowrap",
        }}
      >
        <Check size={12} />
        <span>All 3 sizes fit (58×18 · 80×24 · 116×30)</span>
      </span>
    );
  }

  const first = status.failingPresets[0];
  const shortLabel = first.title.split(" ")[0] || first.title;
  const targetNode = first.nodeIds[0];

  return (
    <button
      onClick={() => {
        if (targetNode) onSelectOverflow(targetNode);
      }}
      title={`Click to select overflowing pane #${targetNode} (${first.nodeIds.map((id) => `#${id}`).join(", ")})`}
      className="cs-mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 999,
        background: "rgba(255, 211, 122, 0.14)",
        border: "1px solid rgba(255, 211, 122, 0.45)",
        color: CHARM_TOKENS.gold,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      <AlertTriangle size={12} />
      <span>
        Overflow on {shortLabel} ({first.cols}×{first.rows})
      </span>
    </button>
  );
}
