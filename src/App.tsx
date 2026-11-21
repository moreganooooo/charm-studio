import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  GitBranch,
  HelpCircle,
  Moon,
  Settings,
  Sun,
  User as UserIcon,
  X,
} from "lucide-react";
import { AuthModal, type LocalUser } from "./AuthModal";
import { CharmGlossaryModal } from "./CharmGlossaryModal";
import { CanvasToolbar } from "./components/CanvasToolbar";
import { CodePreviewDrawer } from "./components/CodePreviewDrawer";
import { PropertyInspector } from "./components/PropertyInspector";
import { btnStyle, dot, inlineCode, miniBtn } from "./components/studioStyles";
import { GuideFaqModal } from "./GuideFaqModal";
import { PanelRightIcon } from "./icons";
import { ImportModal } from "./ImportModal";
import { LayersPanel } from "./LayersPanel";
import { OnboardingChecklist } from "./OnboardingChecklist";
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
import { Tooltip, TooltipProvider } from "./Tooltip";
import { WidgetPickerModal } from "./WidgetPickerModal";

export default function App() {
  return (
    <StudioProvider>
      <StudioShell />
    </StudioProvider>
  );
}

function StudioShell() {
  const {
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
    inspectorOpen,
    setInspectorOpen,
    rightTab,
    setRightTab,
    appMode,
    setAppMode,
    tooltipsEnabled,
    setTooltipsEnabled,
    fontFamily,
    setFontFamily,
    customThemes,
    addCustomTheme,
    clearCustomThemes,
    palette,
    viewMode,
    matrixDense,
    cols,
    setCols,
    rows,
    setRows,
    colorProfile,
    showOverlay,
    selectedId,
    setSelectedId,
    singleTel,
    setSingleTel,
    onboarding,
    setOnboarding,
    markStep,
    activeSpotlight,
    setActiveSpotlight,
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
    updateNode,
    loadTemplate,
  } = useStudioStore();

  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importInitialTab, setImportInitialTab] = useState<"upload" | "github">("upload");
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
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

  const allProjects = useMemo(() => {
    const cloudIds = new Set(cloudProjects.map((p) => p.id));
    return [...cloudProjects, ...localProjects.filter((p) => !cloudIds.has(p.id))];
  }, [cloudProjects, localProjects]);

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

  return (
    <TooltipProvider enabled={tooltipsEnabled}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "var(--cs-bg)", color: "var(--cs-text)" }}>
        {/* FULL-WIDTH SPARKLING CHARM HERO */}
        <header
          style={{
            position: "relative",
            padding: "12px 20px 24px 14px",
            borderBottom: "1px solid var(--cs-border)",
            background: "var(--cs-hero-bg)",
          }}
        >
          {/* Top-Right Utility Navigation */}
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <Tooltip
              title="Charm Glossary"
              content="Explore every Charmbracelet library & CLI tool (Lip Gloss, Bubbles, Bubble Tea, Huh, Glamour, Gum, Wish, VHS) with pros, cons, and promo previews."
              placement="bottom"
            >
              <button
                onClick={() => setGlossaryOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: glossaryOpen ? "var(--cs-mint-bg)" : "var(--cs-btn-bg)",
                  color: glossaryOpen ? "var(--cs-mint)" : "var(--cs-btn-text)",
                  border: `1px solid ${glossaryOpen ? "var(--cs-mint-border)" : "var(--cs-btn-border)"}`,
                }}
              >
                <BookOpen size={13} style={{ color: "var(--cs-mint)" }} />
                <span>Charm Glossary</span>
              </button>
            </Tooltip>

            <Tooltip
              title="Guide, Help & FAQ"
              content="Open plain-English walkthroughs, Charm library guides, GitHub sync instructions, and beginner FAQs."
              placement="bottom"
            >
              <button
                onClick={() => setGuideOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: guideOpen ? "var(--cs-code-bg)" : "var(--cs-btn-bg)",
                  color: guideOpen ? "var(--cs-text-heading)" : "var(--cs-btn-text)",
                  border: `1px solid ${guideOpen ? "var(--cs-lavender)" : "var(--cs-btn-border)"}`,
                }}
              >
                <HelpCircle size={13} style={{ color: "var(--cs-lavender)" }} />
                <span>Guide &amp; FAQ</span>
              </button>
            </Tooltip>

            <Tooltip
              title="Studio Settings"
              content="Create or upload terminal color themes, switch preview fonts, toggle hover tooltips, or download your ir.json backup."
              placement="bottom"
            >
              <button
                onClick={() => setSettingsOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: settingsOpen ? "var(--cs-pink-bg)" : "var(--cs-btn-bg)",
                  color: settingsOpen ? "var(--cs-pink-soft)" : "var(--cs-btn-text)",
                  border: `1px solid ${settingsOpen ? "var(--cs-pink)" : "var(--cs-btn-border)"}`,
                }}
              >
                <Settings size={13} />
                <span>Settings</span>
              </button>
            </Tooltip>

            <Tooltip
              title="Studio Appearance"
              content="Switch the entire Charm Studio site between Dark Mode and Charm.land-inspired Light Mode."
              placement="bottom"
            >
              <button
                onClick={() => setAppMode((m) => (m === "dark" ? "light" : "dark"))}
                title={appMode === "dark" ? "Switch to Charm.land Light Mode" : "Switch to Studio Dark Mode"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "5px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: "var(--cs-btn-bg)",
                  color: "var(--cs-btn-text)",
                  border: "1px solid var(--cs-btn-border)",
                }}
              >
                {appMode === "dark" ? <Sun size={13} /> : <Moon size={13} />}
                <span>{appMode === "dark" ? "Light" : "Dark"}</span>
              </button>
            </Tooltip>

            <Tooltip
              title="GitHub & Cloud Account"
              content={
                user
                  ? "Signed in! Your saved projects sync to the cloud and your GitHub repos appear in Import / GitHub."
                  : "Sign in with GitHub to sync projects across devices and browse your GitHub repositories directly in Import."
              }
              placement="bottom"
            >
              <button
                onClick={() => setAuthOpen(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "5px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: user || localUser ? "var(--cs-mint-bg)" : "var(--cs-pink-bg)",
                  color: user || localUser ? "var(--cs-mint)" : "var(--cs-pink-soft)",
                  border: `1px solid ${user || localUser ? "var(--cs-mint-border)" : "var(--cs-pink-border)"}`,
                }}
              >
                {user?.user_metadata?.avatar_url ? (
                  <img src={user.user_metadata.avatar_url as string} alt="" style={{ width: 16, height: 16, borderRadius: "50%" }} />
                ) : user || localUser ? (
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: "currentColor" }} />
                ) : (
                  <UserIcon size={13} />
                )}
                <span>
                  {user
                    ? `Signed in: @${(user.user_metadata?.user_name as string | undefined) || user.email}`
                    : localUser
                    ? `Local: @${localUser.username}`
                    : "Sign In"}
                </span>
              </button>
            </Tooltip>
          </div>

          {authError && (
            <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(244, 63, 94, 0.14)", border: "1px solid rgba(244, 63, 94, 0.45)", color: "#e11d48", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span><b>Auth Error:</b> {authError}</span>
              <button onClick={() => setAuthError(null)} style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer", display: "inline-flex", alignItems: "center" }} aria-label="Dismiss"><X size={14} /></button>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "max-content minmax(320px, 1fr)",
              gap: 28,
              alignItems: "center",
            }}
          >
            {/* LEFT: Wordmark */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 10 }}>
                <h1
                  className="charm-wordmark"
                  style={{
                    margin: 0,
                    fontSize: "clamp(48px, 5vw, 72px)",
                    fontWeight: 800,
                    lineHeight: 0.94,
                    letterSpacing: -1.5,
                    textTransform: "uppercase",
                    fontFamily: `"Bricolage Grotesque", system-ui, sans-serif`,
                  }}
                >
                  CHARM STUDIO
                </h1>

                <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8 }}>
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      width: "100%",
                      padding: "7px 16px",
                      borderRadius: 999,
                      fontSize: "clamp(11.5px, 0.95vw, 13.5px)",
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      whiteSpace: "nowrap",
                      fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
                      color: "var(--cs-text-strong)",
                      background: "var(--cs-pill-bg)",
                      border: "1px solid var(--cs-pink-border)",
                    }}
                  >
                    <Tooltip title="Lip Gloss" content="CSS-like terminal styling: borders, padding, margins, alignment, and adaptive light/dark colors." placement="bottom">
                      <span style={{ cursor: "help" }}>Lip Gloss</span>
                    </Tooltip>
                    <span style={{ opacity: 0.55 }}>•</span>
                    <Tooltip title="Bubbles" content="Interactive terminal UI widgets: searchable Lists, Tables, scrollable Viewports, and Text Inputs." placement="bottom">
                      <span style={{ cursor: "help" }}>Bubbles</span>
                    </Tooltip>
                    <span style={{ opacity: 0.55 }}>•</span>
                    <Tooltip title="Huh" content="Interactive CLI forms, multi-field surveys, selects, and confirmation prompts." placement="bottom">
                      <span style={{ cursor: "help" }}>Huh</span>
                    </Tooltip>
                    <span style={{ opacity: 0.55 }}>•</span>
                    <Tooltip title="Glamour & Glow" content="Renders styled Markdown (headings, lists, code blocks, quotes) right inside a terminal pane." placement="bottom">
                      <span style={{ cursor: "help" }}>Glamour</span>
                    </Tooltip>
                    <span style={{ opacity: 0.55 }}>•</span>
                    <Tooltip title="Gum" content="Pre-styled shell script prompts & filters—auto-generates a ready-to-run gum.sh script." placement="bottom">
                      <span style={{ cursor: "help" }}>Gum</span>
                    </Tooltip>
                    <span style={{ opacity: 0.55 }}>•</span>
                    <Tooltip title="Wish" content="Serve your Go Bubble Tea app over SSH! Add a Wish header to generate SSH server code in main.go." placement="bottom">
                      <span style={{ cursor: "help" }}>Wish</span>
                    </Tooltip>
                  </span>
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "var(--cs-lavender-text)",
                      letterSpacing: 0.3,
                      textAlign: "center",
                    }}
                  >
                    Live Go TUI Layout Sandbox &amp; Code Generator
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 14 }}>
                <svg className="charm-sparkle-a" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" style={{ color: "var(--cs-pink)" }} aria-hidden="true">
                  <path d="M12 1L14.6 9.4L23 12L14.6 14.6L12 23L9.4 14.6L1 12L9.4 9.4L12 1Z" />
                </svg>
                <svg className="charm-sparkle-b" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ color: "var(--cs-mint)", marginTop: -22 }} aria-hidden="true">
                  <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
                </svg>
              </div>
            </div>

            {/* RIGHT: Description */}
            <div
              style={{
                padding: "18px 24px",
                borderRadius: 12,
                background: "var(--cs-hero-card)",
                border: "1px solid var(--cs-border-subtle)",
                borderLeft: "3px solid var(--cs-pink)",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.12)",
              }}
            >
              <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.62, color: "var(--cs-text-body)" }}>
                Stop guessing terminal cell math in the dark. Tweak borders, padding, and breakpoints
                in real compiled Go—then poke straight into live Bubbles, stress-test three terminal
                sizes at once, and walk away with runnable <code style={inlineCode}>main.go</code> and{" "}
                <code style={inlineCode}>ui/*.go</code> without the compile-resize-sigh loop.
              </p>
            </div>
          </div>
        </header>

        {/* 3-COLUMN STUDIO WORKSPACE BELOW */}
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: `${layersOpen ? "258px" : "40px"} 1fr ${inspectorOpen ? "394px" : "40px"}`,
            minWidth: 0,
          }}
        >
          {/* LEFT: Layout Tree */}
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

          {/* CENTER: Terminal Stage */}
          <div style={{ padding: "0 24px 22px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto", minWidth: 0 }}>
            <CanvasToolbar
              userLabel={user ? `@${(user.user_metadata?.user_name as string | undefined) ?? "Account"}` : null}
              projectsCount={allProjects.length}
              widgetPickerOpen={widgetPickerOpen}
              projectsOpen={projectsOpen}
              importOpen={importOpen}
              onOpenWidgetPicker={() => setWidgetPickerOpen(true)}
              onOpenProjects={() => setProjectsOpen(true)}
              onOpenImport={() => {
                setImportInitialTab(user ? "github" : "upload");
                setImportOpen(true);
              }}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenCodeExport={() => {
                setInspectorOpen(true);
                setRightTab("code");
                markStep("exportedCode");
              }}
            />

            {/* Post-Login Clarity & Next-Step Banner */}
            {user && postLoginBanner && (
              <div
                style={{
                  padding: "12px 16px",
                  background: "var(--cs-pill-bg)",
                  border: "1px solid var(--cs-mint-border)",
                  borderRadius: 10,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--cs-text-body)" }}>
                  <b style={{ color: "var(--cs-mint)", display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle2 size={14} />
                    <span>Connected as @{(user.user_metadata?.user_name as string | undefined) || user.email}</span>
                  </b>
                  <span style={{ color: "var(--cs-lavender-text)" }}>
                    {" "}— GitHub sign-in enables <b>Cloud Project Sync</b> across devices and lets you pull Go code straight from your <b>GitHub repositories</b>.
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => {
                      setImportInitialTab("github");
                      setImportOpen(true);
                      setPostLoginBanner(false);
                    }}
                    style={{
                      ...btnStyle(true),
                      background: "var(--cs-mint-bg)",
                      borderColor: "var(--cs-mint-border)",
                      color: "var(--cs-mint)",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <GitBranch size={13} />
                    <span>Browse My GitHub Repos</span>
                    <ArrowRight size={13} />
                  </button>
                  <button
                    onClick={() => {
                      setProjectsOpen(true);
                      setPostLoginBanner(false);
                    }}
                    style={btnStyle(false)}
                  >
                    Open Saved Projects ({allProjects.length})
                  </button>
                  <button onClick={() => setPostLoginBanner(false)} style={{ ...btnStyle(false), display: "inline-flex", alignItems: "center", justifyContent: "center" }} title="Dismiss banner" aria-label="Dismiss banner">
                    <X size={13} />
                  </button>
                </div>
              </div>
            )}

            {/* First-Run Quick-Start Checklist */}
            <OnboardingChecklist
              progress={onboarding}
              activeSpotlight={activeSpotlight}
              onSpotlight={setActiveSpotlight}
              onTriggerStep={(step) => {
                if (step === "templateOrImport") {
                  setImportInitialTab("github");
                  setImportOpen(true);
                } else if (step === "addedComponent") {
                  setWidgetPickerOpen(true);
                } else if (step === "styledOrInteracted") {
                  setInspectorOpen(true);
                  setRightTab("inspector");
                  setActiveSpotlight("terminal-inspector");
                } else if (step === "exportedCode") {
                  setInspectorOpen(true);
                  setRightTab("code");
                  markStep("exportedCode");
                }
              }}
              onDismiss={() => {
                setActiveSpotlight(null);
                setOnboarding((prev) => ({ ...prev, dismissed: true }));
              }}
            />

            {/* Canvas Hint + DevTools Legend Bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: 12.5, color: "var(--cs-text-muted)", paddingTop: 2 }}>
              <span>
                <b style={{ color: "var(--cs-text-strong)" }}>Click</b> a pane to select • <b style={{ color: "var(--cs-text-strong)" }}>Double-click</b> to edit text • <b style={{ color: "var(--cs-text-strong)" }}>Tab / ↑↓</b> to test live widgets
                {viewMode === "matrix" && <span style={{ color: "var(--cs-text-dim)" }}> • Narrow panes collapse items tagged &lt;cols</span>}
                {onboarding.dismissed && (
                  <button
                    onClick={() => setOnboarding((prev) => ({ ...prev, dismissed: false }))}
                    style={{ marginLeft: 10, background: "none", border: "none", color: "var(--cs-pink-soft)", cursor: "pointer", fontSize: 12, textDecoration: "underline", padding: 0 }}
                  >
                    Show Quick-Start Checklist
                  </button>
                )}
              </span>
              {showOverlay && (
                <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5 }}>
                  <Tooltip title="Margin" content="Outer blank terminal cells outside the border that push neighboring panes away.">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "help" }}><span style={dot("#fb923c")} /> Margin</span>
                  </Tooltip>
                  <Tooltip title="Padding" content="Inner blank terminal cells between the border and the text/widget inside.">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "help" }}><span style={dot("#4ade80")} /> Padding</span>
                  </Tooltip>
                  <Tooltip title="Content" content="The actual area occupied by your widget or text inside padding.">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "help" }}><span style={dot("#60a5fa")} /> Content</span>
                  </Tooltip>
                </span>
              )}
            </div>

            {viewMode === "single" && (
              <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13, color: "var(--cs-text-muted)", flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Cols <b style={{ color: "var(--cs-text-strong)", fontVariantNumeric: "tabular-nums" }}>{cols}</b>
                  <input type="range" min={30} max={140} value={cols} onChange={(e) => setCols(+e.target.value)} style={{ accentColor: "var(--cs-pink)" }} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  Rows <b style={{ color: "var(--cs-text-strong)", fontVariantNumeric: "tabular-nums" }}>{rows}</b>
                  <input type="range" min={10} max={45} value={rows} onChange={(e) => setRows(+e.target.value)} style={{ accentColor: "var(--cs-pink)" }} />
                </label>
                <span style={{ fontSize: 11.5, color: "var(--cs-text-dim)" }}>
                  (Or drag the <code style={inlineCode}>⌟</code> corner handle)
                </span>
              </div>
            )}

            {viewMode === "single" ? (
              <div
                className={activeSpotlight === "terminal-inspector" ? "charm-spotlight" : undefined}
                style={{ borderRadius: 12, border: "1px solid transparent", padding: activeSpotlight === "terminal-inspector" ? 4 : 0 }}
              >
                <TerminalViewport
                  title="Interactive Viewport"
                  doc={ir}
                  renderTick={renderTick}
                  cols={cols}
                  rows={rows}
                  fontSize={14}
                  fontFamily={fontFamily}
                  palette={palette}
                  colorProfile={colorProfile}
                  showOverlay={showOverlay}
                  showQuickBar={true}
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
                    setInspectorOpen(true);
                    setRightTab("inspector");
                    setTimeout(() => inspectorScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 40);
                  }}
                />
                <div style={{ marginTop: 12, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "var(--cs-text-muted)", fontVariantNumeric: "tabular-nums" }}>
                  {selectedTel ? (
                    <span>
                      Selected <b style={{ color: "var(--cs-text-strong)" }}>#{selectedTel.id}</b> • total box {selectedTel.margin.w}×{selectedTel.margin.h} • inner content {selectedTel.content.w}×{selectedTel.content.h}
                      {selectedTel.overflowMsg && (
                        <span style={{ color: "#e11d48", marginLeft: 10, display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <AlertTriangle size={12} />
                          <span>{selectedTel.overflowMsg}</span>
                        </span>
                      )}
                    </span>
                  ) : (
                    <span>Node <b>#{selectedId}</b> is currently hidden/collapsed at {cols} cols.</span>
                  )}
                </div>
              </div>
            ) : (
              <div
                className={activeSpotlight === "terminal-inspector" ? "charm-spotlight" : undefined}
                style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start", borderRadius: 12, border: "1px solid transparent", padding: activeSpotlight === "terminal-inspector" ? 6 : 0 }}
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
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    onInteract={bumpTick}
                  />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Collapsible Inspector + Codegen Drawer */}
          {!inspectorOpen ? (
            <aside style={{ borderLeft: "1px solid var(--cs-border)", background: "var(--cs-panel)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12 }}>
              <button onClick={() => setInspectorOpen(true)} title="Expand Inspector" style={{ ...miniBtn, display: "inline-flex", alignItems: "center" }}>
                <PanelRightIcon collapsed={true} />
              </button>
              <span style={{ writingMode: "vertical-rl", marginTop: 18, fontSize: 11, color: "var(--cs-text-dim)", letterSpacing: 1.6, textTransform: "uppercase" }}>
                Inspector
              </span>
            </aside>
          ) : (
            <aside
              className={activeSpotlight === "terminal-inspector" && rightTab === "inspector" ? "charm-spotlight" : undefined}
              style={{ borderLeft: "1px solid var(--cs-border)", background: "var(--cs-panel)", display: "flex", flexDirection: "column", position: "sticky", top: 0, maxHeight: "100vh" }}
            >
              <div style={{ display: "flex", alignItems: "center", height: 49, borderBottom: "1px solid var(--cs-border)" }}>
                {(["inspector", "code"] as const).map((t) => (
                  <button
                    key={t}
                    className={t === "code" && activeSpotlight === "code-tab" ? "charm-spotlight" : undefined}
                    onClick={() => {
                      setRightTab(t);
                      if (t === "code") markStep("exportedCode");
                    }}
                    style={{
                      flex: 1,
                      height: "100%",
                      padding: 0,
                      border: "none",
                      cursor: "pointer",
                      fontWeight: 700,
                      fontSize: 13.5,
                      background: rightTab === t ? "var(--cs-card)" : "transparent",
                      color: rightTab === t ? "var(--cs-pink)" : "var(--cs-text-dim)",
                      borderBottom: rightTab === t ? "2px solid var(--cs-pink)" : "2px solid transparent",
                    }}
                  >
                    {t === "inspector" ? "Inspector" : "Go Code"}
                  </button>
                ))}
                <button onClick={() => setInspectorOpen(false)} title="Collapse Inspector" style={{ ...miniBtn, marginRight: 10, display: "inline-flex", alignItems: "center" }}>
                  <PanelRightIcon collapsed={false} />
                </button>
              </div>

              {rightTab === "inspector" ? (
                <PropertyInspector scrollRef={inspectorScrollRef} />
              ) : (
                <CodePreviewDrawer />
              )}
            </aside>
          )}
        </div>

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
          initialTab={importTab}
          currentDoc={doc}
          user={user}
          githubToken={githubToken}
          onClose={() => setImportOpen(false)}
          onOpenAuth={() => setAuthOpen(true)}
          onImportIR={handleImportIR}
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
      </div>
    </TooltipProvider>
  );
}
