import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  generateGoMod,
  generateGumShell,
  generateLayoutGo,
  generateMainGo,
  generateReadmeMd,
  generateStylesGo,
  generateVhsTape,
  sanitizeModulePath,
} from "./codegen";
import { GearIcon, PanelRightIcon } from "./icons";
import { LayersPanel } from "./LayersPanel";
import { OnboardingChecklist, type OnboardingProgress, type SpotlightKey } from "./OnboardingChecklist";
import type { User } from "@supabase/supabase-js";
import { AuthModal, type LocalUser } from "./AuthModal";
import { CharmGlossaryModal } from "./CharmGlossaryModal";
import { GuideFaqModal } from "./GuideFaqModal";
import { ImportModal } from "./ImportModal";
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
import { supabase } from "./supabaseClient";
import { SettingsModal, type ThemePreset } from "./SettingsModal";
import { STYLE_PRESETS } from "./stylePresets";
import { clearDraft, decodeShareHash, encodeShareHash, loadDraft, saveDraft } from "./persistence";
import { TEMPLATES } from "./templates";
import { TerminalViewport } from "./TerminalViewport";
import { HelpDot, Tooltip, TooltipProvider } from "./Tooltip";
import {
  addBoxToTarget,
  addBoxWithPreset,
  addOverlayToDoc,
  deleteNodeFromDoc,
  duplicateNodeInDoc,
  forkStyleForNode,
  moveNodeDrop,
  moveSibling,
  pruneUnusedStyles,
  removeOverlayFromDoc,
  renameNodeInDoc,
  splitNode,
  unwrapContainer,
} from "./treeOps";
import { WidgetDataEditor } from "./WidgetDataEditor";
import { WidgetPickerModal } from "./WidgetPickerModal";
import {
  defaultWidgetData,
  findNode,
  updateNodeInDoc,
  type ColorProfile,
  type ContentType,
  type IRDoc,
  type IRStyle,
  type OverlayAnchor,
  type TelemetryNode,
  type WorkspaceMode,
} from "./types";
import { buildZipBlob, triggerDownloadBlob } from "./zipExport";

const PALETTES: ThemePreset[] = [
  {
    id: "tokyo-dark", label: "Tokyo Night (Dark)", darkBG: true, background: "#1a1b26", foreground: "#c0caf5",
    tokens: { accent: "#7aa2f7", borderIdle: "#414868", textMain: "#c0caf5", modalGlow: "#bb9af7", surface: "#1f2335" },
  },
  {
    id: "catppuccin", label: "Catppuccin Mocha", darkBG: true, background: "#1e1e2e", foreground: "#cdd6f4",
    tokens: { accent: "#cba6f7", borderIdle: "#585b70", textMain: "#cdd6f4", modalGlow: "#f5c2e7", surface: "#313244" },
  },
  {
    id: "dracula", label: "Dracula", darkBG: true, background: "#282a36", foreground: "#f8f8f2",
    tokens: { accent: "#ff79c6", borderIdle: "#6272a4", textMain: "#f8f8f2", modalGlow: "#bd93f9", surface: "#44475a" },
  },
  {
    id: "nord", label: "Nord", darkBG: true, background: "#2e3440", foreground: "#d8dee9",
    tokens: { accent: "#88c0d0", borderIdle: "#4c566a", textMain: "#eceff4", modalGlow: "#b48ead", surface: "#3b4252" },
  },
  {
    id: "gruvbox", label: "Gruvbox Dark", darkBG: true, background: "#282828", foreground: "#ebdbb2",
    tokens: { accent: "#fabd2f", borderIdle: "#665c54", textMain: "#ebdbb2", modalGlow: "#fe8019", surface: "#3c3836" },
  },
  {
    id: "tokyo-light", label: "Tokyo Day (Light)", darkBG: false, background: "#e1e2e7", foreground: "#3760bf",
    tokens: { accent: "#2e7de9", borderIdle: "#9aa5ce", textMain: "#3760bf", modalGlow: "#9854f1", surface: "#d5d6db" },
  },
];

const MATRIX_PRESETS = [
  { title: "Compact (Split Pane)", cols: 58,  rows: 18 },
  { title: "Standard (80×24)",     cols: 80,  rows: 24 },
  { title: "Wide (Full Screen)",   cols: 116, rows: 30 },
] as const;

const QUAD_LABELS = ["Top", "Right", "Bottom", "Left"] as const;

type CodeFileTab = "main" | "styles" | "layout" | "gomod" | "vhs" | "gum" | "readme" | "json";

const CODE_FILE_INFO: Record<CodeFileTab, string> = {
  main:   "Complete runnable Bubble Tea v2 (or Wish SSH) entry point wired with real Bubbles/Huh models and Tab focus.",
  styles: "Your lipgloss.Style definitions and adaptive LightDark color tokens. Drop into ui/styles.go.",
  layout: "Responsive RenderApp() layout helper joining panes, handling breakpoints, and placing anchored overlays.",
  gomod:  "Ready-to-tidy Go module manifest declaring exact charm.land/v2 & Charmbracelet dependencies.",
  vhs:    "charmbracelet/vhs tape script to record a terminal GIF/screenshot of your TUI layout.",
  gum:    "charmbracelet/gum shell script mirroring your prompts, confirmations, and styled blocks.",
  readme: "Step-by-step quick-start README for running or recording your exported Go project.",
  json:   "Portable JSON Layout IR spec representing the current tree, widget data, styles, and tokens.",
};

function applyPaletteTokens(doc: IRDoc, preset: ThemePreset): IRDoc {
  const next = structuredClone(doc);
  const mode = preset.darkBG ? "dark" : "light";
  for (const [k, hex] of Object.entries(preset.tokens)) {
    if (next.tokens[k]) next.tokens[k][mode] = hex;
  }
  return next;
}

export default function App() {
  const initialDraft = useMemo(() => loadDraft(), []);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => {
    try {
      return localStorage.getItem("charmstudio:workspaceMode:v1") === "pro" ? "pro" : "studio";
    } catch {
      return "studio";
    }
  });
  const [showAdvancedStyle, setShowAdvancedStyle] = useState(false);

  const [templateId, setTemplateId] = useState(initialDraft?.templateId ?? TEMPLATES[0].id);
  const [paletteId, setPaletteId] = useState(initialDraft?.paletteId ?? "tokyo-dark");
  const [ir, setIrRaw] = useState<IRDoc>(() => initialDraft?.ir ?? structuredClone(TEMPLATES[0].doc));
  const [past, setPast] = useState<IRDoc[]>([]);
  const [future, setFuture] = useState<IRDoc[]>([]);

  const [renderTick, setRenderTick] = useState(0);
  const [layersOpen, setLayersOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [appMode, setAppMode] = useState<"dark" | "light">(() => {
    try {
      return localStorage.getItem("charmstudio:appMode:v1") === "light" ? "light" : "dark";
    } catch {
      return "dark";
    }
  });
  const [tooltipsEnabled, setTooltipsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("charmstudio:tooltips:v1") !== "false";
    } catch {
      return true;
    }
  });
  const [goModuleName, setGoModuleName] = useState<string>(() => {
    try {
      return localStorage.getItem("charmstudio:goModule:v1") || "github.com/charm-user/my-tui";
    } catch {
      return "github.com/charm-user/my-tui";
    }
  });

  const [importInitialTab, setImportInitialTab] = useState<"upload" | "github">("upload");
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [localUser, setLocalUser] = useState<LocalUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("charmstudio:localUser") || "null"); } catch { return null; }
  });
  const [user, setUser] = useState<User | null>(null);
  const [githubToken, setGithubToken] = useState<string | null>(() => {
    try { return sessionStorage.getItem("charmstudio:ghToken"); } catch { return null; }
  });
  const [postLoginBanner, setPostLoginBanner] = useState(false);
  const [onboarding, setOnboarding] = useState<OnboardingProgress>(() => {
    try {
      const raw = localStorage.getItem("charmstudio:onboarding:v1");
      if (raw) return JSON.parse(raw) as OnboardingProgress;
    } catch {}
    return {
      dismissed: false,
      steps: {
        templateOrImport: false,
        addedComponent: false,
        styledOrInteracted: false,
        exportedCode: false,
      },
    };
  });
  const [activeSpotlight, setActiveSpotlight] = useState<SpotlightKey>(null);

  useEffect(() => {
    try { localStorage.setItem("charmstudio:onboarding:v1", JSON.stringify(onboarding)); } catch {}
  }, [onboarding]);

  useEffect(() => {
    try { localStorage.setItem("charmstudio:workspaceMode:v1", workspaceMode); } catch {}
  }, [workspaceMode]);

  useEffect(() => {
    try { localStorage.setItem("charmstudio:goModule:v1", goModuleName); } catch {}
  }, [goModuleName]);

  useEffect(() => {
    document.documentElement.dataset.theme = appMode;
    try { localStorage.setItem("charmstudio:appMode:v1", appMode); } catch {}
  }, [appMode]);

  useEffect(() => {
    try { localStorage.setItem("charmstudio:tooltips:v1", String(tooltipsEnabled)); } catch {}
  }, [tooltipsEnabled]);

  const markStep = useCallback((step: keyof OnboardingProgress["steps"]) => {
    setOnboarding((prev) => (prev.steps[step] ? prev : { ...prev, steps: { ...prev.steps, [step]: true } }));
  }, []);

  const [localProjects, setLocalProjects] = useState<StudioProject[]>(() => listLocalProjects());
  const [cloudProjects, setCloudProjects] = useState<StudioProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);

  const allProjects = useMemo(() => {
    const cloudIds = new Set(cloudProjects.map((p) => p.id));
    return [...cloudProjects, ...localProjects.filter((p) => !cloudIds.has(p.id))];
  }, [cloudProjects, localProjects]);

  const [fontFamily, setFontFamily] = useState(`"JetBrains Mono", "SF Mono", Menlo, Monaco, ui-monospace, monospace`);
  const [customThemes, setCustomThemes] = useState<ThemePreset[]>(() => {
    try { return JSON.parse(localStorage.getItem("charmstudio:customThemes") || "[]"); } catch { return []; }
  });
  const allPalettes = useMemo(() => [...PALETTES, ...customThemes], [customThemes]);

  const [viewMode, setViewMode] = useState<"single" | "matrix">(() => (workspaceMode === "pro" ? "matrix" : "single"));
  const [matrixDense, setMatrixDense] = useState(false);
  const [cols, setCols] = useState(82);
  const [rows, setRows] = useState(24);
  const [colorProfile, setColorProfile] = useState<ColorProfile>("truecolor");
  const [showOverlay, setShowOverlay] = useState<boolean>(() => workspaceMode === "pro");

  const [selectedId, setSelectedId] = useState<string>(TEMPLATES[0].defaultSelectedId);
  const [renameDraft, setRenameDraft] = useState<string>(TEMPLATES[0].defaultSelectedId);
  const [singleTel, setSingleTel] = useState<TelemetryNode[]>([]);

  const [rightTab, setRightTab] = useState<"inspector" | "code">("inspector");
  const [codeFile, setCodeFile] = useState<CodeFileTab>("main");
  const [copied, setCopied] = useState(false);
  const [runCmdCopied, setRunCmdCopied] = useState(false);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [sharedCopied, setSharedCopied] = useState(false);
  const [newTokenName, setNewTokenName] = useState("");
  const [pruneNote, setPruneNote] = useState<string | null>(null);

  const inspectorScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRenameDraft(selectedId);
  }, [selectedId]);

  const switchWorkspaceMode = (mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    if (mode === "studio") {
      setViewMode("single");
      setShowOverlay(false);
      if (codeFile === "json") setCodeFile("main");
    } else {
      setShowOverlay(true);
    }
  };

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
      try { sessionStorage.setItem("charmstudio:ghToken", token); } catch {}
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
        try { sessionStorage.removeItem("charmstudio:ghToken"); } catch {}
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("p");
    if (!pid) return;
    fetchPublicCloudProject(pid).then((proj) => {
      if (!proj) return;
      setIrRaw(proj.ir);
      setPaletteId(proj.paletteId);
      setTemplateId(proj.templateId);
      setPast([]);
      setFuture([]);
    });
  }, []);

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
  }, [ir, paletteId, templateId, activeProjectId, user]);

  useEffect(() => {
    if (!window.location.hash.startsWith("#s=")) return;
    decodeShareHash(window.location.hash).then((decoded) => {
      if (!decoded) return;
      setIrRaw(decoded.ir);
      setPaletteId(decoded.paletteId);
      setTemplateId(decoded.templateId);
      setPast([]);
      setFuture([]);
    });
  }, []);

  useEffect(() => {
    saveDraft({ ir, paletteId, templateId });
  }, [ir, paletteId, templateId]);

  const commitIr = useCallback((updater: IRDoc | ((prev: IRDoc) => IRDoc)) => {
    setIrRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next === prev) return prev;
      setPast((p) => [...p.slice(-49), prev]);
      setFuture([]);
      return next;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setIrRaw((cur) => {
        setFuture((f) => [cur, ...f]);
        return prev;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setIrRaw((cur) => {
        setPast((p) => [...p, cur]);
        return next;
      });
      return f.slice(1);
    });
  }, []);

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

  const palette = useMemo(
    () => allPalettes.find((p) => p.id === paletteId) ?? allPalettes[0],
    [allPalettes, paletteId]
  );

  const selectedNode = useMemo(() => findNode(ir, selectedId), [ir, selectedId]);
  const selectedOverlay = useMemo(
    () => ir.overlays.find((o) => o.node.id === selectedId) ?? null,
    [ir.overlays, selectedId]
  );
  const selectedStyle: IRStyle | null = selectedNode?.style ? ir.styles[selectedNode.style] ?? null : null;
  const selectedTel = singleTel.find((t) => t.id === selectedId) ?? null;
  const showModal = ir.overlays[0]?.visible ?? false;
  const tokenKeys = Object.keys(ir.tokens);
  const styleKeys = Object.keys(ir.styles);
  const isProUI = workspaceMode === "pro" || showAdvancedStyle;

  const generatedOutput = useMemo(() => {
    if (codeFile === "main") return generateMainGo(ir, goModuleName);
    if (codeFile === "styles") return generateStylesGo(ir);
    if (codeFile === "layout") return generateLayoutGo(ir);
    if (codeFile === "gomod") return generateGoMod(ir, goModuleName);
    if (codeFile === "vhs") return generateVhsTape(ir, palette.label);
    if (codeFile === "gum") return generateGumShell(ir);
    if (codeFile === "readme") return generateReadmeMd(ir, goModuleName);
    return JSON.stringify(ir, null, 2);
  }, [ir, codeFile, palette.label, goModuleName]);

  const updateSelectedStyle = (patch: Partial<IRStyle>) => {
    if (!selectedNode?.style) return;
    const styleKey = selectedNode.style;
    commitIr((prev) => ({
      ...prev,
      styles: { ...prev.styles, [styleKey]: { ...prev.styles[styleKey], ...patch } },
    }));
    markStep("styledOrInteracted");
  };

  const updateQuad = (field: "padding" | "margin", idx: number, val: number) => {
    if (!selectedStyle) return;
    const next: [number, number, number, number] = [...selectedStyle[field]];
    next[idx] = Math.max(0, val || 0);
    updateSelectedStyle({ [field]: next });
  };

  const toggleBorderEdge = (idx: number) => {
    if (!selectedStyle) return;
    const cur = selectedStyle.borderEdges ?? [true, true, true, true];
    const next: [boolean, boolean, boolean, boolean] = [...cur];
    next[idx] = !next[idx];
    updateSelectedStyle({ borderEdges: next });
  };

  const toggleOverlay = (overlayId: string) => {
    commitIr((prev) => ({
      ...prev,
      overlays: prev.overlays.map((o) => (o.id === overlayId ? { ...o, visible: !o.visible } : o)),
    }));
    markStep("styledOrInteracted");
  };

  const setOverlayAnchor = (overlayId: string, anchor: OverlayAnchor) => {
    commitIr((prev) => ({
      ...prev,
      overlays: prev.overlays.map((o) => (o.id === overlayId ? { ...o, anchor } : o)),
    }));
    markStep("styledOrInteracted");
  };

  const handleRenameNode = (oldId: string, desiredId: string) => {
    const { doc: next, renamedId } = renameNodeInDoc(ir, oldId, desiredId);
    if (renamedId === oldId) return;
    commitIr(next);
    if (selectedId === oldId) setSelectedId(renamedId);
    setRenameDraft(renamedId);
  };

  const loadTemplate = (id: string) => {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    commitIr(applyPaletteTokens(tpl.doc, palette));
    setSelectedId(tpl.defaultSelectedId);
    markStep("templateOrImport");
  };

  const resetToTemplate = () => {
    clearDraft();
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    loadTemplate(templateId);
  };

  const shareLink = async () => {
    const encoded = await encodeShareHash({ ir, paletteId, templateId });
    const url = `${window.location.origin}${window.location.pathname}#s=${encoded}`;
    window.history.replaceState(null, "", `#s=${encoded}`);
    await navigator.clipboard.writeText(url);
    setSharedCopied(true);
    setTimeout(() => setSharedCopied(false), 1800);
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(generatedOutput);
    setCopied(true);
    markStep("exportedCode");
    setTimeout(() => setCopied(false), 1500);
  };

  const downloadProjectZip = () => {
    const modPath = sanitizeModulePath(goModuleName);
    const slug = (modPath.split("/").pop() || "charm-app").replace(/[^a-zA-Z0-9._-]/g, "-");
    const entries = [
      { path: `${slug}/go.mod`, content: generateGoMod(ir, modPath) },
      { path: `${slug}/main.go`, content: generateMainGo(ir, modPath) },
      { path: `${slug}/ui/styles.go`, content: generateStylesGo(ir) },
      { path: `${slug}/ui/layout.go`, content: generateLayoutGo(ir) },
      { path: `${slug}/demo.tape`, content: generateVhsTape(ir, palette.label) },
      { path: `${slug}/gum.sh`, content: generateGumShell(ir) },
      { path: `${slug}/README.md`, content: generateReadmeMd(ir, modPath) },
      { path: `${slug}/ir.json`, content: JSON.stringify(ir, null, 2) },
    ];
    const blob = buildZipBlob(entries);
    triggerDownloadBlob(blob, `${slug}.zip`);
    markStep("exportedCode");
    setZipStatus(`✓ Downloaded ${slug}.zip`);
    setTimeout(() => setZipStatus(null), 2600);
  };

  const copyRunCommand = async () => {
    const modPath = sanitizeModulePath(goModuleName);
    const slug = (modPath.split("/").pop() || "charm-app").replace(/[^a-zA-Z0-9._-]/g, "-");
    const cmd = `unzip ~/Downloads/${slug}.zip && cd ${slug} && go mod tidy && go run .`;
    await navigator.clipboard.writeText(cmd);
    setRunCmdCopied(true);
    markStep("exportedCode");
    setTimeout(() => setRunCmdCopied(false), 1800);
  };

  const bumpTick = () => {
    setRenderTick((t) => t + 1);
    markStep("styledOrInteracted");
  };

  const hasWidgetDataUI =
    selectedNode?.contentType === "bubble:list" ||
    selectedNode?.contentType === "bubble:table" ||
    selectedNode?.contentType === "bubble:textinput" ||
    selectedNode?.contentType === "bubble:viewport" ||
    selectedNode?.contentType === "huh:form";

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
        {/* Top-Right Utility Navigation: Charm Glossary, Guide & FAQ, Settings, Theme Toggle, Account */}
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
              <span style={{ color: "var(--cs-mint)", fontWeight: 800 }}>◈</span>
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
              <span style={{ color: "var(--cs-lavender)", fontWeight: 800 }}>?</span>
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
              <GearIcon />
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
              <span>{appMode === "dark" ? "☀" : "🌙"}</span>
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
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600,
                background: user || localUser ? "var(--cs-mint-bg)" : "var(--cs-pink-bg)",
                color: user || localUser ? "var(--cs-mint)" : "var(--cs-pink-soft)",
                border: `1px solid ${user || localUser ? "var(--cs-mint-border)" : "var(--cs-pink-border)"}`,
              }}
            >
              {user?.user_metadata?.avatar_url ? (
                <img src={user.user_metadata.avatar_url as string} alt="" style={{ width: 16, height: 16, borderRadius: "50%" }} />
              ) : (
                <span>{user || localUser ? "●" : "👤"}</span>
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
            <button onClick={() => setAuthError(null)} style={{ background: "none", border: "none", color: "#e11d48", cursor: "pointer" }}>✕</button>
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
          {/* LEFT: Aligned flush with Layout Tree's 14px left edge */}
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

            <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 14 }}>
              <span className="charm-sparkle-a" style={{ fontSize: 24, color: "var(--cs-pink)" }}>✦</span>
              <span className="charm-sparkle-b" style={{ fontSize: 15, color: "var(--cs-mint)", marginTop: -22 }}>✧</span>
            </div>
          </div>

          {/* RIGHT: Stretches across to the right margin */}
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
          onAddBox={() => {
            const { doc: next, newId } = addBoxToTarget(ir, selectedId);
            commitIr(next);
            setSelectedId(newId);
            markStep("addedComponent");
          }}
          onOpenWidgetPicker={() => setWidgetPickerOpen(true)}
          onSplit={(kind) => {
            const { doc: next, newId } = splitNode(ir, selectedId, kind);
            commitIr(next);
            setSelectedId(newId);
            markStep("addedComponent");
          }}
          onMove={(dir) => commitIr((prev) => moveSibling(prev, selectedId, dir))}
          onDropNode={(dragId, targetId, position) => commitIr((prev) => moveNodeDrop(prev, dragId, targetId, position))}
          onRenameNode={handleRenameNode}
          onDuplicateNode={() => {
            const { doc: next, newId } = duplicateNodeInDoc(ir, selectedId);
            commitIr(next);
            setSelectedId(newId);
          }}
          onUnwrapContainer={() => {
            const { doc: next, nextSelected } = unwrapContainer(ir, selectedId);
            commitIr(next);
            setSelectedId(nextSelected);
          }}
          onDelete={() => {
            const { doc: next, nextSelected } = deleteNodeFromDoc(ir, selectedId);
            commitIr(next);
            setSelectedId(nextSelected);
          }}
          onToggleOverlay={toggleOverlay}
          onAddOverlay={() => {
            const { doc: next, nodeId } = addOverlayToDoc(ir);
            commitIr(next);
            setSelectedId(nodeId);
            markStep("addedComponent");
          }}
          onRemoveOverlay={(overlayId) => {
            const { doc: next, nextSelected } = removeOverlayFromDoc(ir, overlayId);
            commitIr(next);
            setSelectedId(nextSelected);
          }}
          onCycleOverlayAnchor={setOverlayAnchor}
        />

        {/* CENTER: Terminal Stage */}
        <div style={{ padding: "0 24px 22px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto", minWidth: 0 }}>
          {/* Row 1: Aligned Header Strip matching Layout Tree & Inspector */}
          <div
            style={{
              margin: "0 -24px",
              padding: "0 24px 0 0",
              minHeight: 49,
              borderBottom: "1px solid var(--cs-border)",
              background: "var(--cs-panel)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "stretch",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            <Tooltip
              title="Starter Templates"
              content="Switch between pre-built Charmbracelet layouts (dashboards, Huh forms, Glamour docs, Gum scripts, Wish SSH apps)."
              placement="bottom"
            >
              <label
                className={activeSpotlight === "template-import" ? "charm-spotlight" : undefined}
                style={{ ...inlineLbl, gap: 10, height: "100%", padding: activeSpotlight === "template-import" ? "0 4px 0 0" : 0 }}
              >
                <span
                  style={{
                    height: "100%",
                    minHeight: 48,
                    padding: "0 16px",
                    fontWeight: 700,
                    fontSize: 13.5,
                    background: "var(--cs-card)",
                    color: "var(--cs-pink)",
                    borderBottom: "2px solid var(--cs-pink)",
                    borderRight: "1px solid var(--cs-border)",
                    display: "inline-flex",
                    alignItems: "center",
                  }}
                >
                  Template
                </span>
                <select
                  value={templateId}
                  onChange={(e) => loadTemplate(e.target.value)}
                  style={{ ...inputStyle, width: "auto", padding: "6px 10px", fontWeight: 600 }}
                >
                  {TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </label>
            </Tooltip>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "6px 0" }}>
              <Tooltip
                title="Add Charm Component"
                content="Open a visual menu of Lip Gloss, Bubbles, Huh, Glamour, Gum, and Wish widgets to drop straight into your app."
                placement="bottom"
              >
                <button
                  onClick={() => setWidgetPickerOpen(true)}
                  className={activeSpotlight === "add-component" ? "charm-spotlight" : undefined}
                  style={{
                    ...btnStyle(widgetPickerOpen),
                    background: "var(--cs-pink-bg)",
                    borderColor: "var(--cs-pink-border)",
                    color: "var(--cs-pink-soft)",
                    fontWeight: 700,
                  }}
                >
                  ✦ + Add Component
                </button>
              </Tooltip>
              <Tooltip
                title="Saved Projects"
                content="Save snapshots locally or sync projects to your cloud account so you can reopen and share them anytime."
                placement="bottom"
              >
                <button onClick={() => setProjectsOpen(true)} style={btnStyle(projectsOpen)}>
                  📁 {user ? `@${(user?.user_metadata?.user_name as string | undefined) ?? "Account"}` : "Projects"} ({allProjects.length})
                </button>
              </Tooltip>
              <Tooltip
                title="Import Go / GitHub Repos"
                content="Upload local .go or .json files, or browse your GitHub repositories to pull existing Lip Gloss styles into Charm Studio."
                placement="bottom"
              >
                <button
                  onClick={() => {
                    setImportInitialTab(user ? "github" : "upload");
                    setImportOpen(true);
                  }}
                  className={activeSpotlight === "template-import" ? "charm-spotlight" : undefined}
                  style={btnStyle(importOpen)}
                >
                  📥 Import / GitHub
                </button>
              </Tooltip>
              <Tooltip content="Undo last layout or style change (Cmd/Ctrl + Z)" placement="bottom">
                <button onClick={undo} disabled={past.length === 0} style={btnStyle(false)}>↶ Undo</button>
              </Tooltip>
              <Tooltip content="Redo undone change (Cmd/Ctrl + Shift + Z)" placement="bottom">
                <button onClick={redo} disabled={future.length === 0} style={btnStyle(false)}>↷ Redo</button>
              </Tooltip>
              <Tooltip
                title="Shareable Layout URL"
                content="Compresses your entire layout into the URL hash and copies a link anyone can open."
                placement="bottom"
              >
                <button onClick={shareLink} style={btnStyle(sharedCopied)}>
                  {sharedCopied ? "✓ Link Copied!" : "🔗 Share Link"}
                </button>
              </Tooltip>
              <Tooltip content="Discard edits and restore the current template's default layout" placement="bottom">
                <button onClick={resetToTemplate} style={btnStyle(false)}>
                  Reset
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Row 2: Dual-Audience Studio / Pro Mode Bar + Viewport Simulation */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 14px", background: "var(--cs-panel)", border: "1px solid var(--cs-border)", borderRadius: 10 }}>
            <Tooltip
              title="Workspace Mode: Studio vs Pro"
              content="Studio keeps one calm interactive terminal with quick style presets. Pro unlocks 3× responsive Matrix, DevTools geometry boxes, custom $Tokens, partial borders & ir.json."
              placement="bottom"
            >
              <div style={{ display: "inline-flex", background: "var(--cs-input)", borderRadius: 7, padding: 3, border: "1px solid var(--cs-border)" }}>
                <button onClick={() => switchWorkspaceMode("studio")} style={segBtn(workspaceMode === "studio")}>
                  ✦ Studio
                </button>
                <button onClick={() => switchWorkspaceMode("pro")} style={segBtn(workspaceMode === "pro")}>
                  ⌘ Pro
                </button>
              </div>
            </Tooltip>

            {workspaceMode === "studio" ? (
              <div style={{ display: "inline-flex", background: "var(--cs-input)", borderRadius: 7, padding: 3, border: "1px solid var(--cs-border)" }}>
                {MATRIX_PRESETS.map((p) => {
                  const active = cols === p.cols && rows === p.rows;
                  return (
                    <button
                      key={p.title}
                      onClick={() => { setViewMode("single"); setCols(p.cols); setRows(p.rows); }}
                      style={segBtn(active)}
                    >
                      {p.title.split(" ")[0]} ({p.cols}×{p.rows})
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ display: "inline-flex", background: "var(--cs-input)", borderRadius: 7, padding: 3, border: "1px solid var(--cs-border)" }}>
                <Tooltip
                  title="Single Viewport"
                  content="Focus on one large interactive terminal with sliders and a corner drag handle to test custom column/row sizes."
                  placement="bottom"
                >
                  <button onClick={() => setViewMode("single")} style={segBtn(viewMode === "single")}>
                    Single Viewport
                  </button>
                </Tooltip>
                <Tooltip
                  title="Responsive Matrix (3× Sizes)"
                  content="Preview Compact (58×18), Standard (80×24), and Wide (116×30) terminals side-by-side to catch clipping bugs early."
                  placement="bottom"
                >
                  <button onClick={() => setViewMode("matrix")} style={segBtn(viewMode === "matrix")}>
                    Matrix (3× Sizes)
                  </button>
                </Tooltip>
              </div>
            )}

            <Tooltip
              title="Terminal Theme"
              content="Simulates light or dark terminal backgrounds, updates LightDark tokens automatically, or lets you upload/build your own theme."
              placement="bottom"
            >
              <label style={inlineLbl}>
                <span>Theme:</span>
                <select
                  value={paletteId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (nextId === "__custom__") {
                      setSettingsOpen(true);
                      return;
                    }
                    setPaletteId(nextId);
                    const preset = allPalettes.find((p) => p.id === nextId);
                    if (preset) commitIr((prev) => applyPaletteTokens(prev, preset));
                  }}
                  style={{ ...inputStyle, width: "auto", padding: "5px 9px" }}
                >
                  {allPalettes.map((p) => (
                    <option key={p.id} value={p.id}>{p.label}</option>
                  ))}
                  <option value="__custom__">✦ Choose your own (Upload / Custom)…</option>
                </select>
              </label>
            </Tooltip>

            {workspaceMode === "pro" && (
              <>
                <Tooltip
                  title="Color Profile Simulator"
                  content="Tests how your app degrades on limited terminals (256 colors, 16 colors, or plain ASCII) using charmbracelet/colorprofile."
                  placement="bottom"
                >
                  <label style={inlineLbl}>
                    <span>Profile:</span>
                    <select
                      value={colorProfile}
                      onChange={(e) => setColorProfile(e.target.value as ColorProfile)}
                      style={{ ...inputStyle, width: "auto", padding: "5px 9px" }}
                    >
                      <option value="truecolor">TrueColor (24-bit)</option>
                      <option value="ansi256">ANSI 256</option>
                      <option value="ansi16">ANSI 16</option>
                      <option value="ascii">ASCII (No Color)</option>
                    </select>
                  </label>
                </Tooltip>

                {viewMode === "matrix" && (
                  <Tooltip content="Shrink font size slightly so all 3 terminal sizes fit comfortably in view" placement="bottom">
                    <button onClick={() => setMatrixDense((v) => !v)} style={btnStyle(matrixDense)}>
                      {matrixDense ? "Zoom: Compact" : "Zoom: Normal"}
                    </button>
                  </Tooltip>
                )}
              </>
            )}

            {ir.overlays[0] && (
              <Tooltip
                title="Floating Overlay Layer"
                content="Show or hide your floating popup/toast layer over the main terminal layout."
                placement="bottom"
              >
                <button onClick={() => toggleOverlay(ir.overlays[0].id)} style={btnStyle(showModal)}>
                  Overlay: {showModal ? "ON" : "OFF"}
                </button>
              </Tooltip>
            )}

            {workspaceMode === "pro" && (
              <Tooltip
                title="Box-Model DevTools"
                content="Highlights Margin (orange), Padding (green), and Content (blue) cell boundaries directly on the selected pane."
                placement="bottom"
              >
                <button onClick={() => setShowOverlay((v) => !v)} style={btnStyle(showOverlay)}>
                  DevTools: {showOverlay ? "ON" : "OFF"}
                </button>
              </Tooltip>
            )}

            <button
              onClick={() => setTooltipsEnabled((v) => !v)}
              title={tooltipsEnabled ? "Turn off beginner hover tooltips and ? icons" : "Turn hover tooltips back on"}
              style={btnStyle(tooltipsEnabled)}
            >
              Tips: {tooltipsEnabled ? "ON" : "OFF"}
            </button>
          </div>

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
                <b style={{ color: "var(--cs-mint)" }}>
                  ✓ Connected as @{(user.user_metadata?.user_name as string | undefined) || user.email}
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
                  }}
                >
                  Browse My GitHub Repos →
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
                <button onClick={() => setPostLoginBanner(false)} style={btnStyle(false)} title="Dismiss banner">
                  ✕
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
                onResize={(c, r) => { setCols(c); setRows(r); }}
                onTelemetry={setSingleTel}
                onQuickSplit={(id, kind) => {
                  const { doc: next, newId } = splitNode(ir, id, kind);
                  commitIr(next);
                  setSelectedId(newId);
                  markStep("addedComponent");
                }}
                onQuickWidgetPicker={(id) => {
                  setSelectedId(id);
                  setWidgetPickerOpen(true);
                }}
                onQuickClone={(id) => {
                  const { doc: next, newId } = duplicateNodeInDoc(ir, id);
                  commitIr(next);
                  setSelectedId(newId);
                }}
                onQuickDelete={(id) => {
                  const { doc: next, nextSelected } = deleteNodeFromDoc(ir, id);
                  commitIr(next);
                  setSelectedId(nextSelected);
                }}
                onQuickInlineEdit={(id, nextContent) => {
                  commitIr((prev) => updateNodeInDoc(prev, id, (n) => ({ ...n, content: nextContent })));
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
                    {selectedTel.overflowMsg && <span style={{ color: "#e11d48", marginLeft: 10 }}>⚠ {selectedTel.overflowMsg}</span>}
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

        {/* RIGHT: Collapsible Inspector + Codegen */}
        {!inspectorOpen ? (
          <aside style={{ borderLeft: "1px solid var(--cs-border)", background: "var(--cs-panel)", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12 }}>
            <button onClick={() => setInspectorOpen(true)} title="Expand Inspector" style={{ ...miniBtn, display: "inline-flex", alignItems: "center" }}><PanelRightIcon collapsed={true} /></button>
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
                    flex: 1, height: "100%", padding: 0, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
                    background: rightTab === t ? "var(--cs-card)" : "transparent",
                    color: rightTab === t ? "var(--cs-pink)" : "var(--cs-text-dim)",
                    borderBottom: rightTab === t ? "2px solid var(--cs-pink)" : "2px solid transparent",
                  }}
                >
                  {t === "inspector" ? "Inspector" : "Go Code"}
                </button>
              ))}
              <button onClick={() => setInspectorOpen(false)} title="Collapse Inspector" style={{ ...miniBtn, marginRight: 10, display: "inline-flex", alignItems: "center" }}><PanelRightIcon collapsed={false} /></button>
            </div>

            {rightTab === "inspector" ? (
              <div ref={inspectorScrollRef} style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, fontSize: 13 }}>
                {/* Rename Node Header */}
                {selectedNode && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px", borderRadius: 9, background: "var(--cs-card-alt)", border: "1px solid var(--cs-border)" }}>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--cs-text-dim)" }}>ID:</span>
                    <input
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameNode(selectedNode.id, renameDraft);
                      }}
                      style={{ ...inputStyle, padding: "4px 7px", fontFamily: "ui-monospace, monospace", fontSize: 12 }}
                    />
                    <button
                      onClick={() => handleRenameNode(selectedNode.id, renameDraft)}
                      disabled={renameDraft.trim() === selectedNode.id || !renameDraft.trim()}
                      style={miniBtn}
                    >
                      Rename
                    </button>
                  </div>
                )}

                {selectedNode && selectedNode.kind !== "Box" && (
                  <Section
                    title="Container Layout"
                    badge={selectedNode.id}
                    subtitle={`Controls how panes align inside ${selectedNode.kind === "JoinHorizontal" ? "this horizontal Row" : "this vertical Stack"}.`}
                  >
                    <label style={labelCol}>
                      <span style={{ display: "inline-flex", alignItems: "center" }}>
                        Join Alignment
                        <HelpDot
                          title="Join Alignment"
                          content="Controls whether smaller panes align to the Start (top/left), Center, or End (bottom/right) of this container."
                        />
                      </span>
                      <select
                        value={selectedNode.joinAlign ?? "start"}
                        onChange={(e) =>
                          commitIr((prev) =>
                            updateNodeInDoc(prev, selectedNode.id, (n) => ({
                              ...n,
                              joinAlign: e.target.value as "start" | "center" | "end",
                            }))
                          )
                        }
                        style={inputStyle}
                      >
                        <option value="start">{selectedNode.kind === "JoinHorizontal" ? "Top (Start)" : "Left (Start)"}</option>
                        <option value="center">Center</option>
                        <option value="end">{selectedNode.kind === "JoinHorizontal" ? "Bottom (End)" : "Right (End)"}</option>
                      </select>
                    </label>

                    {selectedNode.id !== ir.root.id && isProUI && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                        <label style={labelCol}>
                          <span>Width Mode</span>
                          <select
                            value={selectedNode.width?.mode ?? "fill"}
                            onChange={(e) =>
                              commitIr((prev) =>
                                updateNodeInDoc(prev, selectedNode.id, (n) => ({
                                  ...n,
                                  width: { ...n.width, mode: e.target.value as "fixed" | "fill" | "fit", value: n.width?.value ?? 26, weight: n.width?.weight ?? 1 },
                                }))
                              )
                            }
                            style={inputStyle}
                          >
                            <option value="fill">Fill (stretch)</option>
                            <option value="fixed">Fixed cols</option>
                          </select>
                        </label>
                        <label style={labelCol}>
                          <span>Collapse Below (cols)</span>
                          <input
                            type="number" min={0} max={140}
                            value={selectedNode.width?.collapseBelow ?? 0}
                            onChange={(e) =>
                              commitIr((prev) =>
                                updateNodeInDoc(prev, selectedNode.id, (n) => ({
                                  ...n,
                                  width: { ...(n.width ?? { mode: "fill" }), collapseBelow: Math.max(0, +e.target.value) },
                                }))
                              )
                            }
                            style={inputStyle}
                          />
                        </label>
                      </div>
                    )}
                  </Section>
                )}

                {selectedNode && selectedNode.kind === "Box" && selectedStyle && (
                  <>
                    <Section
                      title="Component & Sizing"
                      badge={`#${selectedNode.id}`}
                      subtitle="Swap widget types, resize rules, or overlay anchoring."
                    >
                      <label style={{ ...labelCol, marginBottom: 10 }}>
                        <span style={{ display: "inline-flex", alignItems: "center" }}>
                          Component Type
                          <HelpDot
                            title="Component Type"
                            content="Swaps what renders inside this box: plain text, interactive Bubbles/Huh widgets, Glamour Markdown, Gum prompt, or Wish SSH banner."
                          />
                        </span>
                        <select
                          value={selectedNode.contentType ?? "text"}
                          onChange={(e) => {
                            const nextCt = e.target.value as ContentType;
                            const nextWD = defaultWidgetData(nextCt);
                            commitIr((prev) =>
                              updateNodeInDoc(prev, selectedNode.id, (n) => ({
                                ...n,
                                contentType: nextCt,
                                widgetData: Object.keys(nextWD).length > 0 ? nextWD : n.widgetData,
                              }))
                            );
                          }}
                          style={inputStyle}
                        >
                          <optgroup label="Lip Gloss">
                            <option value="text">Plain Text (editable below)</option>
                          </optgroup>
                          <optgroup label="Bubbles (bubbles/v2)">
                            <option value="bubble:list">Bubbles: List (interactive ↑/↓, /)</option>
                            <option value="bubble:table">Bubbles: Table (interactive ↑/↓, j/k)</option>
                            <option value="bubble:viewport">Bubbles: Viewport (scrollable ↑/↓)</option>
                            <option value="bubble:textinput">Bubbles: TextInput (type live!)</option>
                          </optgroup>
                          <optgroup label="Huh (charmbracelet/huh)">
                            <option value="huh:form">Huh: Interactive Form (Tab, type, ←/→)</option>
                          </optgroup>
                          <optgroup label="Glamour &amp; Glow">
                            <option value="glamour:markdown">Glamour: Styled Markdown (↑/↓ scroll)</option>
                          </optgroup>
                          <optgroup label="Gum (charmbracelet/gum)">
                            <option value="gum:choose">Gum: Choose &amp; Filter (↑/↓, Space, type)</option>
                            <option value="gum:confirm">Gum: Confirm Prompt (←/→, y/n)</option>
                          </optgroup>
                          <optgroup label="Wish (charmbracelet/wish)">
                            <option value="wish:ssh">Wish: SSH Session Header (r to cycle)</option>
                          </optgroup>
                        </select>
                      </label>

                      {selectedOverlay && (
                        <label style={{ ...labelCol, marginBottom: 10 }}>
                          <span>Floating Layer Position</span>
                          <select
                            value={selectedOverlay.anchor ?? "center"}
                            onChange={(e) => setOverlayAnchor(selectedOverlay.id, e.target.value as OverlayAnchor)}
                            style={inputStyle}
                          >
                            <option value="center">Center Modal</option>
                            <option value="top-right">Top-Right Toast</option>
                            <option value="bottom-bar">Bottom Command Bar</option>
                            <option value="bottom-right">Bottom-Right Notification</option>
                          </select>
                        </label>
                      )}

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={labelCol}>
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            {workspaceMode === "studio" ? "Width Behavior" : "Width Mode"}
                            <HelpDot
                              title="Width Mode"
                              content="Fixed sets exact terminal columns; Fill stretches to share remaining space; Fit hugs the content."
                            />
                          </span>
                          <select
                            value={selectedNode.width?.mode ?? "fill"}
                            onChange={(e) =>
                              commitIr((prev) =>
                                updateNodeInDoc(prev, selectedNode.id, (n) => ({
                                  ...n,
                                  width: { ...n.width, mode: e.target.value as "fixed" | "fill" | "fit", value: n.width?.value ?? 26, weight: n.width?.weight ?? 1 },
                                }))
                              )
                            }
                            style={inputStyle}
                          >
                            <option value="fixed">Fixed cols</option>
                            <option value="fill">Stretch (Fill)</option>
                            <option value="fit">Hug content (Fit)</option>
                          </select>
                        </label>

                        {selectedNode.width?.mode === "fixed" ? (
                          <label style={labelCol}>
                            <span>Width (Cols)</span>
                            <input
                              type="number" min={4} max={120}
                              value={selectedNode.width.value ?? 26}
                              onChange={(e) =>
                                commitIr((prev) =>
                                  updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, width: { ...n.width!, value: +e.target.value } }))
                                )
                              }
                              style={inputStyle}
                            />
                          </label>
                        ) : isProUI ? (
                          <label style={labelCol}>
                            <span style={{ display: "inline-flex", alignItems: "center" }}>
                              Width Weight
                              <HelpDot title="Width Weight" content="Weight 2 gets twice as much extra width as weight 1." />
                            </span>
                            <input
                              type="number" min={1} max={10}
                              value={selectedNode.width?.weight ?? 1}
                              onChange={(e) =>
                                commitIr((prev) =>
                                  updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, width: { ...(n.width ?? { mode: "fill" }), weight: Math.max(1, +e.target.value) } }))
                                )
                              }
                              style={inputStyle}
                            />
                          </label>
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6, fontSize: 11.5, color: "var(--cs-text-dim)" }}>
                            Auto-fills row
                          </div>
                        )}

                        <label style={labelCol}>
                          <span>{workspaceMode === "studio" ? "Height Behavior" : "Height Mode"}</span>
                          <select
                            value={selectedNode.height?.mode ?? "fill"}
                            onChange={(e) =>
                              commitIr((prev) =>
                                updateNodeInDoc(prev, selectedNode.id, (n) => ({
                                  ...n,
                                  height: { ...n.height, mode: e.target.value as "fixed" | "fill" | "fit", value: n.height?.value ?? 3, weight: n.height?.weight ?? 1 },
                                }))
                              )
                            }
                            style={inputStyle}
                          >
                            <option value="fill">Stretch (Fill)</option>
                            <option value="fixed">Fixed rows</option>
                            <option value="fit">Hug content (Fit)</option>
                          </select>
                        </label>

                        {selectedNode.height?.mode === "fixed" ? (
                          <label style={labelCol}>
                            <span>Height (Rows)</span>
                            <input
                              type="number" min={1} max={40}
                              value={selectedNode.height.value ?? 3}
                              onChange={(e) =>
                                commitIr((prev) =>
                                  updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, height: { ...n.height!, value: +e.target.value } }))
                                )
                              }
                              style={inputStyle}
                            />
                          </label>
                        ) : isProUI ? (
                          <label style={labelCol}>
                            <span>Height Weight</span>
                            <input
                              type="number" min={1} max={10}
                              value={selectedNode.height?.weight ?? 1}
                              onChange={(e) =>
                                commitIr((prev) =>
                                  updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, height: { ...(n.height ?? { mode: "fill" }), weight: Math.max(1, +e.target.value) } }))
                                )
                              }
                              style={inputStyle}
                            />
                          </label>
                        ) : (
                          <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6, fontSize: 11.5, color: "var(--cs-text-dim)" }}>
                            Auto-fills column
                          </div>
                        )}
                      </div>

                      {isProUI && (
                        <label style={{ ...labelCol, marginTop: 12 }}>
                          <span style={{ display: "inline-flex", alignItems: "center" }}>
                            Responsive Breakpoint — Collapse Below (cols)
                            <HelpDot
                              title="Responsive Collapse"
                              content="Automatically hides this pane when the terminal is narrower than N columns (0 = always shown)."
                            />
                          </span>
                          <input
                            type="number" min={0} max={140}
                            value={selectedNode.width?.collapseBelow ?? 0}
                            onChange={(e) =>
                              commitIr((prev) =>
                                updateNodeInDoc(prev, selectedNode.id, (n) => ({
                                  ...n,
                                  width: { ...(n.width ?? { mode: "fill" }), collapseBelow: Math.max(0, +e.target.value) },
                                }))
                              )
                            }
                            style={inputStyle}
                          />
                        </label>
                      )}
                    </Section>

                    {/* Structured Widget Data Editor */}
                    {hasWidgetDataUI && (
                      <Section
                        title="Widget Data & Fields"
                        badge={selectedNode.contentType?.replace("bubble:", "")}
                        subtitle="Customize items, table columns/rows, or form fields—updates preview & generated main.go."
                      >
                        <WidgetDataEditor
                          node={selectedNode}
                          onChangeWidgetData={(widgetData) => {
                            commitIr((prev) => updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, widgetData })));
                            markStep("styledOrInteracted");
                          }}
                          onChangeContent={(content) => {
                            commitIr((prev) => updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, content })));
                            markStep("styledOrInteracted");
                          }}
                        />
                      </Section>
                    )}

                    {/* Style Section with 1-Click Style Presets */}
                    <Section
                      title="Look & Style"
                      badge={selectedNode.style}
                      subtitle="Apply a 1-click preset or customize borders, colors & spacing."
                      action={
                        isProUI ? (
                          <Tooltip
                            title="Fork Style"
                            content="Clones the current style into a brand-new named style for just this box."
                          >
                            <button onClick={() => commitIr((prev) => forkStyleForNode(prev, selectedNode.id))} style={miniBtn}>
                              Fork Style
                            </button>
                          </Tooltip>
                        ) : undefined
                      }
                    >
                      <div style={{ marginBottom: 12 }}>
                        <div style={microTag}>1-CLICK STYLE PRESETS</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                          {STYLE_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              onClick={() => updateSelectedStyle(preset.patch)}
                              title={preset.description}
                              style={{
                                ...miniBtn,
                                padding: "6px 4px",
                                textAlign: "center",
                                fontWeight: 600,
                                fontSize: 11,
                              }}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                        {isProUI && (
                          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
                            <label style={{ ...labelCol, flex: 1 }}>
                              <span>Assigned Style</span>
                              <select
                                value={selectedNode.style ?? ""}
                                onChange={(e) =>
                                  commitIr((prev) => updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, style: e.target.value })))
                                }
                                style={inputStyle}
                              >
                                {styleKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                              </select>
                            </label>
                            <button
                              onClick={() => {
                                const { doc: pruned, removedCount } = pruneUnusedStyles(ir);
                                if (removedCount > 0) commitIr(pruned);
                                setPruneNote(removedCount > 0 ? `Cleaned ${removedCount}` : "None unused");
                                setTimeout(() => setPruneNote(null), 1800);
                              }}
                              title="Remove unused styles from styles.go"
                              style={{ ...miniBtn, padding: "6px 8px" }}
                            >
                              {pruneNote || "Prune"}
                            </button>
                          </div>
                        )}

                        <label style={labelCol}>
                          Border Shape
                          <select
                            value={selectedStyle.border}
                            onChange={(e) => updateSelectedStyle({ border: e.target.value as IRStyle["border"] })}
                            style={inputStyle}
                          >
                            <option value="rounded">RoundedBorder (╭─╮)</option>
                            <option value="normal">NormalBorder (┌─┐)</option>
                            <option value="thick">ThickBorder (┏━┓)</option>
                            <option value="double">DoubleBorder (╔═╗)</option>
                            <option value="none">None</option>
                          </select>
                        </label>

                        {isProUI && selectedStyle.border !== "none" && (
                          <div>
                            <div style={microTag}>VISIBLE BORDER EDGES</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                              {QUAD_LABELS.map((lbl, i) => {
                                const active = (selectedStyle.borderEdges ?? [true, true, true, true])[i];
                                return (
                                  <button key={lbl} onClick={() => toggleBorderEdge(i)} style={btnStyle(active)}>
                                    {lbl}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          <label style={labelCol}>
                            <span>Border</span>
                            <select value={selectedStyle.borderColor || ""} onChange={(e) => updateSelectedStyle({ borderColor: e.target.value })} style={inputStyle}>
                              <option value="">Default</option>
                              {tokenKeys.map((k) => <option key={k} value={`$${k}`}>${k}</option>)}
                            </select>
                          </label>
                          <label style={labelCol}>
                            <span>Text</span>
                            <select value={selectedStyle.fg || ""} onChange={(e) => updateSelectedStyle({ fg: e.target.value })} style={inputStyle}>
                              <option value="">Default</option>
                              {tokenKeys.map((k) => <option key={k} value={`$${k}`}>${k}</option>)}
                            </select>
                          </label>
                          <label style={labelCol}>
                            <span>Fill (Bg)</span>
                            <select value={selectedStyle.bg || ""} onChange={(e) => updateSelectedStyle({ bg: e.target.value })} style={inputStyle}>
                              <option value="">None</option>
                              {tokenKeys.map((k) => <option key={k} value={`$${k}`}>${k}</option>)}
                            </select>
                          </label>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <label style={labelCol}>
                            Align H
                            <select value={selectedStyle.alignH ?? "left"} onChange={(e) => updateSelectedStyle({ alignH: e.target.value as IRStyle["alignH"] })} style={inputStyle}>
                              <option value="left">Left</option>
                              <option value="center">Center</option>
                              <option value="right">Right</option>
                            </select>
                          </label>
                          <label style={labelCol}>
                            Align V
                            <select value={selectedStyle.alignV ?? "top"} onChange={(e) => updateSelectedStyle({ alignV: e.target.value as IRStyle["alignV"] })} style={inputStyle}>
                              <option value="top">Top</option>
                              <option value="center">Center</option>
                              <option value="bottom">Bottom</option>
                            </select>
                          </label>
                        </div>

                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", paddingTop: 4 }}>
                          <label style={checkLbl}><input type="checkbox" checked={selectedStyle.bold} onChange={(e) => updateSelectedStyle({ bold: e.target.checked })} style={chkAcc} /> Bold</label>
                          <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.italic} onChange={(e) => updateSelectedStyle({ italic: e.target.checked })} style={chkAcc} /> Italic</label>
                          <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.faint} onChange={(e) => updateSelectedStyle({ faint: e.target.checked })} style={chkAcc} /> Faint</label>
                          <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.underline} onChange={(e) => updateSelectedStyle({ underline: e.target.checked })} style={chkAcc} /> Underline</label>
                          <label style={checkLbl}><input type="checkbox" checked={!!selectedStyle.truncate} onChange={(e) => updateSelectedStyle({ truncate: e.target.checked })} style={chkAcc} /> Truncate (…)</label>
                        </div>
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <div style={{ ...microTag, display: "flex", alignItems: "center", gap: 6 }}>
                          {isProUI && <span style={dot("#4ade80")} />} INNER PADDING
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                          {QUAD_LABELS.map((lbl, i) => (
                            <label key={lbl} style={labelCol}>
                              <span style={{ fontSize: 10.5, color: "var(--cs-text-dim)" }}>{lbl}</span>
                              <input type="number" min={0} max={10} value={selectedStyle.padding[i]} onChange={(e) => updateQuad("padding", i, +e.target.value)} style={inputStyle} />
                            </label>
                          ))}
                        </div>
                      </div>

                      {isProUI && (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ ...microTag, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={dot("#fb923c")} /> OUTER MARGIN
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                            {QUAD_LABELS.map((lbl, i) => (
                              <label key={lbl} style={labelCol}>
                                <span style={{ fontSize: 10.5, color: "var(--cs-text-dim)" }}>{lbl}</span>
                                <input type="number" min={0} max={10} value={selectedStyle.margin[i]} onChange={(e) => updateQuad("margin", i, +e.target.value)} style={inputStyle} />
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {workspaceMode === "studio" && (
                        <button
                          onClick={() => setShowAdvancedStyle((v) => !v)}
                          style={{
                            marginTop: 12,
                            width: "100%",
                            background: "transparent",
                            border: "1px dashed var(--cs-border-strong)",
                            borderRadius: 6,
                            padding: "5px 8px",
                            fontSize: 11.5,
                            color: "var(--cs-lavender-text)",
                            cursor: "pointer",
                          }}
                        >
                          {showAdvancedStyle ? "Hide Advanced Pro Controls ▴" : "Show Pro Breakpoints, Borders & Tokens ▾"}
                        </button>
                      )}
                    </Section>

                    {(!selectedNode.contentType ||
                      selectedNode.contentType === "text" ||
                      selectedNode.contentType === "glamour:markdown" ||
                      selectedNode.contentType === "gum:choose" ||
                      selectedNode.contentType === "gum:confirm" ||
                      selectedNode.contentType === "wish:ssh") && (
                      <Section
                        title={
                          selectedNode.contentType === "glamour:markdown"
                            ? "Markdown Source (Glamour)"
                            : selectedNode.contentType === "gum:choose"
                            ? "Gum Choose Options"
                            : selectedNode.contentType === "gum:confirm"
                            ? "Gum Confirm Prompt"
                            : selectedNode.contentType === "wish:ssh"
                            ? "Wish SSH Address"
                            : "Pane Text Content"
                        }
                        subtitle={
                          selectedNode.contentType === "glamour:markdown"
                            ? "Write Markdown (#, ##, lists, > quote, ```go```). Or double-click directly on canvas!"
                            : selectedNode.contentType === "gum:choose"
                            ? "First line starting with # sets the header; each line below is a selectable option."
                            : selectedNode.contentType === "gum:confirm"
                            ? "Question displayed above the Yes / No confirmation buttons."
                            : selectedNode.contentType === "wish:ssh"
                            ? "SSH command / host displayed in the Wish session banner."
                            : "Or double-click any text pane directly on the terminal stage to edit!"
                        }
                      >
                        <textarea
                          rows={selectedNode.contentType === "glamour:markdown" || selectedNode.contentType === "gum:choose" ? 6 : 4}
                          value={selectedNode.content ?? ""}
                          onChange={(e) => {
                            commitIr((prev) => updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, content: e.target.value })));
                            markStep("styledOrInteracted");
                          }}
                          style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
                        />
                      </Section>
                    )}
                  </>
                )}

                {isProUI && (
                  <Section
                    title="Adaptive Tokens"
                    badge="LightDark"
                    subtitle="Manage Light & Dark hex color pairs emitted via lipgloss.LightDark(hasDarkBG)."
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {Object.entries(ir.tokens).map(([name, pair]) => (
                        <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                          <code style={{ fontSize: 12.5, color: "var(--cs-text-heading)" }}>${name}</code>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--cs-text-muted)" }}>
                              ☀
                              <input
                                type="color" value={pair.light}
                                onChange={(e) => commitIr((p) => ({ ...p, tokens: { ...p.tokens, [name]: { ...pair, light: e.target.value } } }))}
                                style={{ width: 26, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                              />
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "var(--cs-text-muted)" }}>
                              🌙
                              <input
                                type="color" value={pair.dark}
                                onChange={(e) => commitIr((p) => ({ ...p, tokens: { ...p.tokens, [name]: { ...pair, dark: e.target.value } } }))}
                                style={{ width: 26, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                              />
                            </label>
                          </div>
                        </div>
                      ))}

                      <div style={{ display: "flex", gap: 6, marginTop: 4, paddingTop: 8, borderTop: "1px solid var(--cs-border)" }}>
                        <input
                          value={newTokenName}
                          onChange={(e) => setNewTokenName(e.target.value)}
                          placeholder="New token name (e.g. warn)"
                          style={{ ...inputStyle, fontSize: 11.5 }}
                        />
                        <button
                          onClick={() => {
                            const key = newTokenName.trim().replace(/[^a-zA-Z0-9_]/g, "");
                            if (!key || ir.tokens[key]) return;
                            commitIr((p) => ({
                              ...p,
                              tokens: { ...p.tokens, [key]: { light: "#d97706", dark: "#fbbf24" } },
                            }));
                            setNewTokenName("");
                          }}
                          style={{ ...miniBtn, whiteSpace: "nowrap" }}
                        >
                          + Add Token
                        </button>
                      </div>
                    </div>
                  </Section>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                {/* Export ZIP & Module Config Header */}
                <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--cs-border)", display: "flex", flexDirection: "column", gap: 8, background: "var(--cs-card-alt)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "var(--cs-text-dim)", whiteSpace: "nowrap" }}>Module:</span>
                    <input
                      value={goModuleName}
                      onChange={(e) => setGoModuleName(e.target.value)}
                      placeholder="github.com/you/my-tui"
                      style={{ ...inputStyle, padding: "4px 8px", fontSize: 11.5, fontFamily: "ui-monospace, monospace" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <button
                      onClick={downloadProjectZip}
                      style={{
                        flex: 1,
                        background: "var(--cs-pink-bg)",
                        color: "var(--cs-pink-soft)",
                        border: "1px solid var(--cs-pink-border)",
                        borderRadius: 7,
                        padding: "7px 10px",
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {zipStatus || "⬇ Download Runnable Go Project (.zip)"}
                    </button>
                    <button
                      onClick={copyRunCommand}
                      title="Copy unzip + go mod tidy + go run . command"
                      style={btnStyle(runCmdCopied)}
                    >
                      {runCmdCopied ? "✓ Cmd Copied" : "Copy Run Cmd"}
                    </button>
                  </div>
                </div>

                {/* File Tabs */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "10px 14px", borderBottom: "1px solid var(--cs-border)", flexWrap: "wrap" }}>
                  <button onClick={() => setCodeFile("main")} style={pillStyle(codeFile === "main")}>main.go</button>
                  <button onClick={() => setCodeFile("styles")} style={pillStyle(codeFile === "styles")}>styles.go</button>
                  <button onClick={() => setCodeFile("layout")} style={pillStyle(codeFile === "layout")}>layout.go</button>
                  <button onClick={() => setCodeFile("gomod")} style={pillStyle(codeFile === "gomod")}>go.mod</button>
                  <button onClick={() => setCodeFile("vhs")} style={pillStyle(codeFile === "vhs")}>demo.tape</button>
                  <button onClick={() => setCodeFile("gum")} style={pillStyle(codeFile === "gum")}>gum.sh</button>
                  <button onClick={() => setCodeFile("readme")} style={pillStyle(codeFile === "readme")}>README.md</button>
                  {workspaceMode === "pro" && (
                    <button onClick={() => setCodeFile("json")} style={pillStyle(codeFile === "json")}>ir.json</button>
                  )}
                  <button onClick={copyOutput} style={{ ...btnStyle(copied), marginLeft: "auto" }}>
                    {copied ? "✓ Copied" : "Copy File"}
                  </button>
                </div>

                <div style={{ padding: "8px 16px", fontSize: 11.5, color: "var(--cs-text-muted)", borderBottom: "1px solid var(--cs-border)", background: "var(--cs-nav-bg)", lineHeight: 1.45 }}>
                  {CODE_FILE_INFO[codeFile]}
                </div>
                <pre style={{ margin: 0, padding: 16, overflow: "auto", flex: 1, fontSize: 12, lineHeight: 1.55, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--cs-text)" }}>
                  <code>{generatedOutput}</code>
                </pre>
              </div>
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
          try { localStorage.setItem("charmstudio:localUser", JSON.stringify(next)); } catch {}
        }}
        onLocalSignOut={() => {
          setLocalUser(null);
          try { localStorage.removeItem("charmstudio:localUser"); } catch {}
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
        user={user}
        githubToken={githubToken}
        onClose={() => setImportOpen(false)}
        onOpenAuth={() => {
          setImportOpen(false);
          setAuthOpen(true);
        }}
        onImportIR={(doc, selectId) => {
          commitIr(doc);
          setSelectedId(selectId);
          markStep("templateOrImport");
        }}
      />

      <WidgetPickerModal
        open={widgetPickerOpen}
        targetLabel={selectedId}
        onClose={() => setWidgetPickerOpen(false)}
        onSelectPreset={(preset) => {
          const { doc: next, newId } = addBoxWithPreset(ir, selectedId, preset);
          commitIr(next);
          setSelectedId(newId);
          markStep("addedComponent");
        }}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        fontFamily={fontFamily}
        onChangeFont={setFontFamily}
        customThemes={customThemes}
        onAddTheme={(theme) => {
          const next = [...customThemes, theme];
          setCustomThemes(next);
          try { localStorage.setItem("charmstudio:customThemes", JSON.stringify(next)); } catch {}
          setPaletteId(theme.id);
          commitIr((prev) => applyPaletteTokens(prev, theme));
        }}
        onClearCustomThemes={() => {
          setCustomThemes([]);
          try { localStorage.removeItem("charmstudio:customThemes"); } catch {}
          setPaletteId(PALETTES[0].id);
          commitIr((prev) => applyPaletteTokens(prev, PALETTES[0]));
        }}
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

function Section({ title, badge, subtitle, action, children }: { title: string; badge?: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--cs-border)", borderRadius: 10, padding: 16, background: "var(--cs-card-alt)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: subtitle ? 6 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "var(--cs-text-heading)", letterSpacing: -0.1 }}>
            {title}
          </h3>
          {badge && (
            <code style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, background: "var(--cs-input)", color: "var(--cs-mint)", border: "1px solid var(--cs-border-subtle)" }}>
              {badge}
            </code>
          )}
        </div>
        {action}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)", marginBottom: 14, lineHeight: 1.45 }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}

const inlineCode: React.CSSProperties = {
  fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
  fontSize: "0.9em",
  padding: "1px 6px",
  borderRadius: 5,
  background: "var(--cs-code-bg)",
  color: "var(--cs-text-heading)",
  border: "1px solid var(--cs-code-border)",
};
const microTag: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, color: "var(--cs-text-dim)", marginBottom: 6 };
const chkAcc: React.CSSProperties = { accentColor: "var(--cs-pink)" };
const dot = (bg: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: 2, background: bg, display: "inline-block" });
const inlineLbl: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--cs-text-muted)" };
const miniBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)", color: "var(--cs-text-heading)", border: "1px solid var(--cs-btn-border)",
  borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer",
};
const checkLbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--cs-text-body)", cursor: "pointer" };
const labelCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "var(--cs-text-body)" };
const inputStyle: React.CSSProperties = { background: "var(--cs-input)", color: "var(--cs-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 6, padding: "6px 8px", fontSize: 12, width: "100%" };
const segBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--cs-pink-bg)" : "transparent",
  color: active ? "var(--cs-pink-soft)" : "var(--cs-text-muted)",
  border: active ? "1px solid var(--cs-pink-border)" : "1px solid transparent",
  borderRadius: 5, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer",
});
const btnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--cs-pink-bg)" : "var(--cs-btn-bg)",
  color: active ? "var(--cs-pink-soft)" : "var(--cs-btn-text)",
  border: `1px solid ${active ? "var(--cs-pink)" : "var(--cs-btn-border)"}`,
  borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer",
});
const pillStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--cs-pink-bg)" : "transparent",
  color: active ? "var(--cs-pink)" : "var(--cs-text-muted)",
  border: `1px solid ${active ? "var(--cs-pink)" : "var(--cs-border-subtle)"}`,
  borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer",
});
