import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { OnboardingProgress, SpotlightKey } from "../OnboardingChecklist";
import { clearDraft, decodeShareHash, encodeShareHash, loadDraft, saveDraft } from "../persistence";
import type { ThemePreset } from "../SettingsModal";
import { TEMPLATES } from "../templates";
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
} from "../treeOps";
import { buildOverflowDiagnoses } from "../overflowDiagnostics";
import {
  findNode,
  updateNodeInDoc,
  type ColorProfile,
  type IRDoc,
  type IRNode,
  type IROverlay,
  type IRStyle,
  type IRViewConfig,
  type KeyPulse,
  type MatrixFitStatus,
  type OverflowDiagnosis,
  type OverlayAnchor,
  type StudioLens,
  type SyncPropertyKind,
  type TelemetryNode,
  type WorkspaceMode,
} from "../types";
import type { WidgetPreset } from "../widgetPresets";
import type { McpServerStatus, PtyStatus, WorktreeSession } from "../previewTransport";
import { isWailsRuntimeAvailable } from "../previewTransport";
import { ensureEngineReady, renderFrame, setActiveTransport, wailsTransport } from "../wasmEngine";

export const PALETTES: ThemePreset[] = [
  {
    id: "charm-aubergine",
    label: "Charm Aubergine (Default)",
    darkBG: true,
    background: "#20162d",
    foreground: "#f4eaff",
    tokens: {
      accent: "#ff5eae",
      borderIdle: "#b9a2ff",
      textMain: "#f4eaff",
      modalGlow: "#6dffc2",
      surface: "#150f1d",
    },
  },
  {
    id: "tokyo-dark",
    label: "Tokyo Night (Dark)",
    darkBG: true,
    background: "#1a1b26",
    foreground: "#c0caf5",
    tokens: { accent: "#7aa2f7", borderIdle: "#414868", textMain: "#c0caf5", modalGlow: "#bb9af7", surface: "#1f2335" },
  },
  {
    id: "catppuccin",
    label: "Catppuccin Mocha",
    darkBG: true,
    background: "#1e1e2e",
    foreground: "#cdd6f4",
    tokens: { accent: "#cba6f7", borderIdle: "#585b70", textMain: "#cdd6f4", modalGlow: "#f5c2e7", surface: "#313244" },
  },
  {
    id: "dracula",
    label: "Dracula",
    darkBG: true,
    background: "#282a36",
    foreground: "#f8f8f2",
    tokens: { accent: "#ff79c6", borderIdle: "#6272a4", textMain: "#f8f8f2", modalGlow: "#bd93f9", surface: "#44475a" },
  },
  {
    id: "nord",
    label: "Nord",
    darkBG: true,
    background: "#2e3440",
    foreground: "#d8dee9",
    tokens: { accent: "#88c0d0", borderIdle: "#4c566a", textMain: "#eceff4", modalGlow: "#b48ead", surface: "#3b4252" },
  },
  {
    id: "gruvbox",
    label: "Gruvbox Dark",
    darkBG: true,
    background: "#282828",
    foreground: "#ebdbb2",
    tokens: { accent: "#fabd2f", borderIdle: "#665c54", textMain: "#ebdbb2", modalGlow: "#fe8019", surface: "#3c3836" },
  },
  {
    id: "tokyo-light",
    label: "Tokyo Day (Light)",
    darkBG: false,
    background: "#e1e2e7",
    foreground: "#3760bf",
    tokens: { accent: "#2e7de9", borderIdle: "#9aa5ce", textMain: "#3760bf", modalGlow: "#9854f1", surface: "#d5d6db" },
  },
];

export const MATRIX_PRESETS = [
  { title: "Compact (Split Pane)", cols: 58, rows: 18 },
  { title: "Standard (80×24)", cols: 80, rows: 24 },
  { title: "Wide (Full Screen)", cols: 116, rows: 30 },
] as const;

export function applyPaletteTokens(doc: IRDoc, preset: ThemePreset): IRDoc {
  const next = structuredClone(doc);
  const mode = preset.darkBG ? "dark" : "light";
  for (const [k, hex] of Object.entries(preset.tokens)) {
    if (next.tokens[k]) next.tokens[k][mode] = hex;
  }
  return next;
}

export interface StudioStoreValue {
  // Workspace & Appearance
  activeLens: StudioLens;
  setActiveLens: (lens: StudioLens) => void;
  workspaceMode: WorkspaceMode;
  switchWorkspaceMode: (mode: WorkspaceMode) => void;
  showAdvancedStyle: boolean;
  setShowAdvancedStyle: (v: boolean | ((prev: boolean) => boolean)) => void;
  appMode: "dark" | "light";
  setAppMode: (m: "dark" | "light" | ((prev: "dark" | "light") => "dark" | "light")) => void;
  tooltipsEnabled: boolean;
  setTooltipsEnabled: (v: boolean | ((prev: boolean) => boolean)) => void;
  goModuleName: string;
  setGoModuleName: (name: string) => void;

  // Panels
  layersOpen: boolean;
  setLayersOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  inspectorOpen: boolean;
  setInspectorOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  rightTab: "inspector" | "code";
  setRightTab: (tab: "inspector" | "code") => void;

  // Document & Undo/Redo Command Stack
  templateId: string;
  setTemplateId: (id: string) => void;
  paletteId: string;
  setPaletteId: (id: string) => void;
  ir: IRDoc;
  past: IRDoc[];
  future: IRDoc[];
  commitIr: (updater: IRDoc | ((prev: IRDoc) => IRDoc)) => void;
  replaceIrWithoutHistory: (doc: IRDoc, opts?: { templateId?: string; paletteId?: string; selectId?: string }) => void;
  undo: () => void;
  redo: () => void;

  // Selection, Sync Telemetry & Fit Status
  selectedId: string;
  setSelectedId: (id: string) => void;
  selectedNode: IRNode | null;
  selectedOverlay: IRDoc["overlays"][number] | null;
  selectedStyle: IRStyle | null;
  singleTel: TelemetryNode[];
  setSingleTel: (tel: TelemetryNode[]) => void;
  hoveredProperty: SyncPropertyKind | null;
  setHoveredProperty: (p: SyncPropertyKind | null) => void;
  activeProperty: SyncPropertyKind;
  setActiveProperty: (p: SyncPropertyKind) => void;
  lastKeyPulse: KeyPulse | null;
  triggerKeyPulse: (nodeId: string, key: string) => void;
  matrixFitStatus: MatrixFitStatus;
  singleDiagnoses: OverflowDiagnosis[];
  activeOverflowDiagnoses: OverflowDiagnosis[];
  inspectorFocusRequest: { nodeId: string; property: "width" | "padding"; ts: number } | null;
  clearInspectorFocusRequest: () => void;
  visualDiagnosticPopover: { nodeId: string; cols: number; rows: number } | null;
  setVisualDiagnosticPopover: (v: { nodeId: string; cols: number; rows: number } | null) => void;
  visualDebugRect: boolean;
  setVisualDebugRect: (v: boolean | ((prev: boolean) => boolean)) => void;
  liveAnnouncement: string;
  announce: (msg: string) => void;
  jumpToOverflowDiagnostic: (
    diag: OverflowDiagnosis,
    opts?: {
      destinationLens?: StudioLens;
      focusProperty?: "width" | "padding";
      openVisualPopover?: boolean;
    }
  ) => void;

  // Viewport Settings
  viewMode: "single" | "matrix";
  setViewMode: (v: "single" | "matrix") => void;
  matrixDense: boolean;
  setMatrixDense: (v: boolean | ((prev: boolean) => boolean)) => void;
  cols: number;
  setCols: (c: number) => void;
  rows: number;
  setRows: (r: number) => void;
  colorProfile: ColorProfile;
  setColorProfile: (p: ColorProfile) => void;
  polarityOverride: "auto" | "dark" | "light";
  setPolarityOverride: (p: "auto" | "dark" | "light") => void;
  showOverlay: boolean;
  setShowOverlay: (v: boolean | ((prev: boolean) => boolean)) => void;
  fontFamily: string;
  setFontFamily: (f: string) => void;
  customThemes: ThemePreset[];
  allPalettes: ThemePreset[];
  palette: ThemePreset;
  effectivePalette: ThemePreset;
  selectPalette: (id: string) => void;
  addCustomTheme: (theme: ThemePreset) => void;
  clearCustomThemes: () => void;
  renderTick: number;
  bumpTick: () => void;
  codeDrawerRequest: {
    tab: "theme_gen" | "layout_gen" | "model" | "update" | "view" | "fixtures_preview" | "raw";
    nodeId?: string;
    property?: "width" | "padding";
    diagnosis?: OverflowDiagnosis;
    ts: number;
  } | null;
  setCodeDrawerRequest: (
    req: {
      tab: "theme_gen" | "layout_gen" | "model" | "update" | "view" | "fixtures_preview" | "raw";
      nodeId?: string;
      property?: "width" | "padding";
      diagnosis?: OverflowDiagnosis;
      ts: number;
    } | null
  ) => void;
  openCodeForSelection: (tab?: "theme_gen" | "layout_gen" | "model" | "update" | "view" | "fixtures_preview" | "raw") => void;

  // Onboarding
  onboarding: OnboardingProgress;
  setOnboarding: (updater: OnboardingProgress | ((prev: OnboardingProgress) => OnboardingProgress)) => void;
  markStep: (step: keyof OnboardingProgress["steps"]) => void;
  activeSpotlight: SpotlightKey;
  setActiveSpotlight: (k: SpotlightKey) => void;

  // Tree & Style Mutations (centralizing treeOps.ts)
  addBox: (targetId?: string) => string;
  addPreset: (preset: WidgetPreset, targetId?: string) => string;
  split: (targetId: string, kind: "JoinHorizontal" | "JoinVertical") => string;
  moveSiblingNode: (dir: -1 | 1, targetId?: string) => void;
  dropNode: (dragId: string, targetId: string, position: "before" | "inside" | "after") => void;
  renameNode: (oldId: string, desiredId: string) => string;
  duplicateNode: (targetId?: string) => string;
  unwrapNode: (targetId?: string) => string;
  deleteNode: (targetId?: string) => string;
  forkStyle: (nodeId?: string) => void;
  pruneStyles: () => number;
  toggleOverlay: (overlayId: string) => void;
  setOverlayAnchor: (overlayId: string, anchor: OverlayAnchor) => void;
  updateOverlay: (overlayId: string, patch: Partial<IROverlay>) => void;
  addOverlay: () => string;
  removeOverlay: (overlayId: string) => void;
  updateNode: (nodeId: string, updater: (n: IRNode) => IRNode) => void;
  updateView: (patch: Partial<IRViewConfig>) => void;
  updateSelectedStyle: (patch: Partial<IRStyle>) => void;
  unlockStyleProp: (styleName: string, prop?: string) => void;
  reenableSync: (symbolKey: string) => void;
  toggleOverrideDynamicProp: (key: string, prop: string, overrideStatic: boolean) => void;
  updateQuad: (field: "padding" | "margin", idx: number, val: number) => void;
  toggleBorderEdge: (idx: number) => void;
  addToken: (name: string) => boolean;
  updateToken: (name: string, mode: "light" | "dark", hex: string) => void;

  // Templates & Sharing
  loadTemplate: (id: string) => void;
  resetToTemplate: () => void;
  shareLink: () => Promise<void>;
  sharedCopied: boolean;

  // Desktop Companion, Native PTY, MCP & Worktree Isolation
  previewMode: "wasm" | "pty";
  setPreviewMode: (mode: "wasm" | "pty") => void;
  desktopConnected: boolean;
  desktopBridgeUrl: string;
  setDesktopBridgeUrl: (url: string) => void;
  refreshDesktopConnection: () => Promise<boolean>;
  projectDir: string;
  setProjectDir: (dir: string) => void;
  ptyStatus: PtyStatus | null;
  startPtyRunner: (dir?: string) => Promise<void>;
  stopPtyRunner: () => Promise<void>;
  mcpStatus: McpServerStatus | null;
  refreshMcpStatus: () => Promise<void>;
  worktrees: WorktreeSession[];
  activeWorktreeId: string | null;
  setActiveWorktreeId: (id: string | null) => void;
  refreshWorktrees: (dir?: string) => Promise<void>;
}

const StudioStoreContext = createContext<StudioStoreValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
  const initialDraft = useMemo(() => loadDraft(), []);

  const [activeLens, setActiveLensState] = useState<StudioLens>(() => {
    try {
      const saved = localStorage.getItem("charmstudio:activeLens:v1");
      if (saved === "visual" || saved === "hybrid" || saved === "code") return saved;
    } catch {}
    return "visual";
  });

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => (activeLens === "code" ? "pro" : "studio"));
  const [showAdvancedStyle, setShowAdvancedStyle] = useState(false);

  const [templateId, setTemplateId] = useState(initialDraft?.templateId ?? TEMPLATES[0].id);
  const [paletteId, setPaletteId] = useState(initialDraft?.paletteId ?? "charm-aubergine");
  const [ir, setIrRaw] = useState<IRDoc>(() => {
    if (initialDraft?.ir) return initialDraft.ir;
    return applyPaletteTokens(TEMPLATES[0].doc, PALETTES[0]);
  });
  const [past, setPast] = useState<IRDoc[]>([]);
  const [future, setFuture] = useState<IRDoc[]>([]);

  const [renderTick, setRenderTick] = useState(0);
  const [layersOpen, setLayersOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [rightTab, setRightTab] = useState<"inspector" | "code">(() => (activeLens === "code" ? "code" : "inspector"));

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

  const [fontFamily, setFontFamily] = useState(`"JetBrains Mono", "SF Mono", Menlo, monospace`);
  const [customThemes, setCustomThemes] = useState<ThemePreset[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("charmstudio:customThemes") || "[]");
    } catch {
      return [];
    }
  });
  const allPalettes = useMemo(() => [...PALETTES, ...customThemes], [customThemes]);

  const [viewMode, setViewMode] = useState<"single" | "matrix">("single");
  const [matrixDense, setMatrixDense] = useState(false);
  const [cols, setCols] = useState(82);
  const [rows, setRows] = useState(24);
  const [colorProfile, setColorProfile] = useState<ColorProfile>("truecolor");
  const [polarityOverride, setPolarityOverride] = useState<"auto" | "dark" | "light">("auto");
  const [showOverlay, setShowOverlay] = useState<boolean>(() => activeLens !== "visual");
  const [codeDrawerRequest, setCodeDrawerRequest] = useState<{
    tab: "theme_gen" | "layout_gen" | "model" | "update" | "view" | "fixtures_preview" | "raw";
    nodeId?: string;
    property?: "width" | "padding";
    diagnosis?: OverflowDiagnosis;
    ts: number;
  } | null>(null);

  const [selectedId, setSelectedId] = useState<string>(TEMPLATES[0].defaultSelectedId);
  const [singleTel, setSingleTel] = useState<TelemetryNode[]>([]);
  const [hoveredProperty, setHoveredProperty] = useState<SyncPropertyKind | null>(null);
  const [activeProperty, setActiveProperty] = useState<SyncPropertyKind>("padding");
  const [lastKeyPulse, setLastKeyPulse] = useState<KeyPulse | null>(null);
  const [matrixFitStatus, setMatrixFitStatus] = useState<MatrixFitStatus>({
    allFit: true,
    failingPresets: [],
    diagnoses: [],
  });
  const [inspectorFocusRequest, setInspectorFocusRequest] = useState<{
    nodeId: string;
    property: "width" | "padding";
    ts: number;
  } | null>(null);
  const [visualDiagnosticPopover, setVisualDiagnosticPopover] = useState<{
    nodeId: string;
    cols: number;
    rows: number;
  } | null>(null);
  const [visualDebugRect, setVisualDebugRect] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const [sharedCopied, setSharedCopied] = useState(false);

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

  // Desktop Companion, Native PTY, MCP & Worktrees
  const [previewMode, setPreviewMode] = useState<"wasm" | "pty">("wasm");
  const [desktopConnected, setDesktopConnected] = useState<boolean>(() => isWailsRuntimeAvailable());
  const [desktopBridgeUrl, setDesktopBridgeUrlState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("charmstudio:bridgeUrl:v1") || "http://127.0.0.1:43120";
      wailsTransport.setBridgeUrl(saved);
      return saved;
    } catch {
      return "http://127.0.0.1:43120";
    }
  });
  const [projectDir, setProjectDirState] = useState<string>(() => {
    try {
      return localStorage.getItem("charmstudio:projectDir:v1") || "";
    } catch {
      return "";
    }
  });
  const [ptyStatus, setPtyStatus] = useState<PtyStatus | null>(null);
  const [mcpStatus, setMcpStatus] = useState<McpServerStatus | null>(null);
  const [worktrees, setWorktrees] = useState<WorktreeSession[]>([]);
  const [activeWorktreeId, setActiveWorktreeId] = useState<string | null>(null);

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

  const palette = useMemo(
    () => allPalettes.find((p) => p.id === paletteId) ?? allPalettes[0],
    [allPalettes, paletteId]
  );

  const effectivePalette = useMemo<ThemePreset>(() => {
    if (polarityOverride === "auto") return palette;
    const isDark = polarityOverride === "dark";
    if (isDark === palette.darkBG) return palette;
    return {
      ...palette,
      darkBG: isDark,
      background: isDark ? "#20162d" : "#e1e2e7",
      foreground: isDark ? "#f4eaff" : "#3760bf",
    };
  }, [palette, polarityOverride]);

  const paletteDarkBg = effectivePalette.darkBG;

  // Off-screen 3-size matrix fit check (debounced 150ms after engine ready)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    ensureEngineReady().then(() => {
      if (cancelled) return;
      timer = setTimeout(() => {
        if (cancelled) return;
        const failingPresets: MatrixFitStatus["failingPresets"] = [];
        const allDiagnoses: OverflowDiagnosis[] = [];
        for (const preset of MATRIX_PRESETS) {
          const frame = renderFrame(ir, preset.cols, preset.rows, paletteDarkBg, colorProfile);
          if (frame.error) continue;
          const presetDiagnoses = buildOverflowDiagnoses(ir, frame.telemetry ?? [], {
            cols: preset.cols,
            rows: preset.rows,
            presetTitle: preset.title,
          });
          if (presetDiagnoses.length > 0) {
            failingPresets.push({
              title: preset.title,
              cols: preset.cols,
              rows: preset.rows,
              nodeIds: presetDiagnoses.map((d) => d.nodeId),
              diagnoses: presetDiagnoses,
            });
            allDiagnoses.push(...presetDiagnoses);
          }
        }
        // Re-render active single viewport dimensions so WASM hitTest compositor stays synced
        renderFrame(ir, cols, rows, paletteDarkBg, colorProfile);
        if (!cancelled) {
          setMatrixFitStatus({
            allFit: failingPresets.length === 0,
            failingPresets,
            diagnoses: allDiagnoses,
          });
        }
      }, 150);
    });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [ir, paletteDarkBg, colorProfile, cols, rows]);

  const singleDiagnoses = useMemo(
    () => buildOverflowDiagnoses(ir, singleTel, { cols, rows, presetTitle: `${cols}×${rows}` }),
    [ir, singleTel, cols, rows]
  );

  const activeOverflowDiagnoses = useMemo(() => {
    if (singleDiagnoses.length > 0) return singleDiagnoses;
    return matrixFitStatus.failingPresets[0]?.diagnoses ?? [];
  }, [singleDiagnoses, matrixFitStatus]);

  const setDesktopBridgeUrl = useCallback((url: string) => {
    const clean = url.trim() || "http://127.0.0.1:43120";
    setDesktopBridgeUrlState(clean);
    wailsTransport.setBridgeUrl(clean);
    try { localStorage.setItem("charmstudio:bridgeUrl:v1", clean); } catch {}
  }, []);

  const setProjectDir = useCallback((dir: string) => {
    setProjectDirState(dir);
    try { localStorage.setItem("charmstudio:projectDir:v1", dir); } catch {}
  }, []);

  const refreshMcpStatus = useCallback(async () => {
    try {
      const st = await wailsTransport.getMcpStatus();
      setMcpStatus(st);
    } catch {
      // ignore when disconnected
    }
  }, []);

  const refreshWorktrees = useCallback(async (dirOverride?: string) => {
    const target = (dirOverride ?? projectDir).trim();
    if (!target) {
      setWorktrees([]);
      return;
    }
    try {
      const list = await wailsTransport.listWorktrees(target);
      setWorktrees(list ?? []);
    } catch {
      // ignore if directory is not a git repo yet
    }
  }, [projectDir]);

  const refreshDesktopConnection = useCallback(async () => {
    const ok = await wailsTransport.checkConnection();
    setDesktopConnected(ok);
    setActiveTransport(ok || previewMode === "pty" ? "wails" : "wasm");
    if (ok) {
      await wailsTransport.init();
      try {
        const [st, mcpSt] = await Promise.all([
          wailsTransport.getPtyStatus(),
          wailsTransport.getMcpStatus(),
        ]);
        setPtyStatus(st);
        setMcpStatus(mcpSt);
      } catch {
        // ignore transient errors
      }
      await refreshWorktrees();
    }
    return ok;
  }, [previewMode, refreshWorktrees]);

  useEffect(() => {
    setActiveTransport(desktopConnected || previewMode === "pty" ? "wails" : "wasm");
  }, [desktopConnected, previewMode]);

  useEffect(() => {
    let active = true;
    wailsTransport.checkConnection().then((ok) => {
      if (!active) return;
      setDesktopConnected(ok);
      if (ok) {
        wailsTransport.init().then(() => {
          wailsTransport.getPtyStatus().then((st) => active && setPtyStatus(st)).catch(() => {});
          wailsTransport.getMcpStatus().then((st) => active && setMcpStatus(st)).catch(() => {});
        });
      }
    });

    const unsubStatus = wailsTransport.onPtyStatus((st) => {
      if (active) setPtyStatus(st);
    });
    const unsubIr = wailsTransport.onMcpIrUpdated((rawJson) => {
      if (!active) return;
      try {
        const parsed = JSON.parse(rawJson) as IRDoc;
        if (parsed && parsed.root && parsed.styles) {
          setIrRaw(parsed);
        }
      } catch {
        // ignore invalid MCP IR push
      }
    });
    return () => {
      active = false;
      unsubStatus();
      unsubIr();
    };
  }, []);

  useEffect(() => {
    if (!desktopConnected) return;
    const timer = setTimeout(() => {
      wailsTransport.updateMcpContext(ir, selectedId, projectDir).then(() => {
        refreshMcpStatus();
      }).catch(() => {});
    }, 280);
    return () => clearTimeout(timer);
  }, [desktopConnected, ir, selectedId, projectDir, refreshMcpStatus]);

  const startPtyRunner = useCallback(async (dirOverride?: string) => {
    const targetDir = (dirOverride ?? projectDir).trim();
    if (!targetDir) throw new Error("Enter a local Go project directory first");
    if (dirOverride) setProjectDir(dirOverride);
    await wailsTransport.init();
    const st = await wailsTransport.startPty(targetDir, cols, rows);
    setPtyStatus(st);
    setDesktopConnected(true);
    setPreviewMode("pty");
  }, [projectDir, cols, rows, setProjectDir]);

  const stopPtyRunner = useCallback(async () => {
    await wailsTransport.stopPty();
    const st = await wailsTransport.getPtyStatus().catch(() => null);
    if (st) setPtyStatus(st);
  }, []);

  const markStep = useCallback((step: keyof OnboardingProgress["steps"]) => {
    setOnboarding((prev) => (prev.steps[step] ? prev : { ...prev, steps: { ...prev.steps, [step]: true } }));
  }, []);

  const commitIr = useCallback((updater: IRDoc | ((prev: IRDoc) => IRDoc)) => {
    setIrRaw((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (next === prev) return prev;
      setPast((p) => [...p.slice(-49), prev]);
      setFuture([]);
      return next;
    });
  }, []);

  const replaceIrWithoutHistory = useCallback(
    (doc: IRDoc, opts?: { templateId?: string; paletteId?: string; selectId?: string }) => {
      setIrRaw(doc);
      if (opts?.templateId) setTemplateId(opts.templateId);
      if (opts?.paletteId) setPaletteId(opts.paletteId);
      if (opts?.selectId) setSelectedId(opts.selectId);
      setPast([]);
      setFuture([]);
    },
    []
  );

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

  const setActiveLens = useCallback((lens: StudioLens) => {
    setActiveLensState(lens);
    try { localStorage.setItem("charmstudio:activeLens:v1", lens); } catch {}
    if (lens === "visual") {
      setShowOverlay(false);
      setViewMode("single");
      setWorkspaceMode("studio");
    } else if (lens === "hybrid") {
      setShowOverlay(true);
      setViewMode("single");
      setWorkspaceMode("studio");
    } else {
      setShowOverlay(true);
      setRightTab("code");
      setWorkspaceMode("pro");
    }
  }, []);

  const switchWorkspaceMode = useCallback((mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    if (mode === "studio") {
      setViewMode("single");
      setShowOverlay(false);
    } else {
      setShowOverlay(true);
    }
  }, []);

  const openCodeForSelection = useCallback(
    (tab?: "theme_gen" | "layout_gen" | "model" | "update" | "view" | "fixtures_preview" | "raw") => {
      const targetTab = tab ?? (ir.importedGo ? "raw" : "theme_gen");
      setCodeDrawerRequest({ tab: targetTab, nodeId: selectedId, ts: Date.now() });
      setActiveLens("code");
    },
    [ir.importedGo, selectedId, setActiveLens]
  );

  const clearInspectorFocusRequest = useCallback(() => {
    setInspectorFocusRequest(null);
  }, []);

  const announce = useCallback((msg: string) => {
    setLiveAnnouncement(msg);
  }, []);

  const jumpToOverflowDiagnostic = useCallback(
    (
      diag: OverflowDiagnosis,
      opts?: {
        destinationLens?: StudioLens;
        focusProperty?: "width" | "padding";
        openVisualPopover?: boolean;
      }
    ) => {
      // 1. Selection first (never mutates undo history or unrelated scroll)
      setSelectedId(diag.nodeId);
      // 2. Size second (snap terminal to failing dimensions)
      setCols(diag.cols);
      setRows(diag.rows);

      const prop = opts?.focusProperty ?? diag.failingProperty;
      setActiveProperty(prop === "padding" ? "padding-h" : "size");

      const targetLens = opts?.destinationLens ?? activeLens;
      if (opts?.destinationLens && opts.destinationLens !== activeLens) {
        setActiveLens(opts.destinationLens);
      }

      if (targetLens === "visual") {
        if (opts?.openVisualPopover !== false) {
          setVisualDiagnosticPopover({ nodeId: diag.nodeId, cols: diag.cols, rows: diag.rows });
          setVisualDebugRect(true);
        }
        setLiveAnnouncement(
          `Selected ${diag.nodeLabel} at ${diag.cols} by ${diag.rows}. ${diag.headline}. Inline diagnostic opened.`
        );
      } else if (targetLens === "hybrid") {
        setVisualDiagnosticPopover(null);
        setInspectorFocusRequest({ nodeId: diag.nodeId, property: prop, ts: Date.now() });
        setLiveAnnouncement(
          `Selected ${diag.nodeLabel} at ${diag.cols} by ${diag.rows} in Hybrid. Focused ${prop} control.`
        );
      } else {
        setVisualDiagnosticPopover(null);
        const tab = prop === "padding" ? "theme_gen" : "layout_gen";
        setCodeDrawerRequest({
          tab,
          nodeId: diag.nodeId,
          property: prop,
          diagnosis: diag,
          ts: Date.now(),
        });
        setLiveAnnouncement(
          `Selected ${diag.nodeLabel} at ${diag.cols} by ${diag.rows} in Code. Anchored to ui/${tab}.go.`
        );
      }
    },
    [activeLens, setActiveLens]
  );

  const selectedNode = useMemo(() => findNode(ir, selectedId), [ir, selectedId]);
  const selectedOverlay = useMemo(
    () => ir.overlays.find((o) => o.node.id === selectedId) ?? null,
    [ir.overlays, selectedId]
  );
  const selectedStyle: IRStyle | null = selectedNode?.style ? ir.styles[selectedNode.style] ?? null : null;

  const bumpTick = useCallback(() => {
    setRenderTick((t) => t + 1);
    markStep("styledOrInteracted");
  }, [markStep]);

  const triggerKeyPulse = useCallback((nodeId: string, key: string) => {
    setLastKeyPulse({ nodeId, key, ts: Date.now() });
    setActiveProperty("keybinding");
  }, []);

  const selectPalette = useCallback(
    (nextId: string) => {
      setPaletteId(nextId);
      const preset = allPalettes.find((p) => p.id === nextId);
      if (preset) commitIr((prev) => applyPaletteTokens(prev, preset));
    },
    [allPalettes, commitIr]
  );

  const addCustomTheme = useCallback(
    (theme: ThemePreset) => {
      setCustomThemes((prev) => {
        const next = [...prev, theme];
        try { localStorage.setItem("charmstudio:customThemes", JSON.stringify(next)); } catch {}
        return next;
      });
      setPaletteId(theme.id);
      commitIr((prev) => applyPaletteTokens(prev, theme));
    },
    [commitIr]
  );

  const clearCustomThemes = useCallback(() => {
    setCustomThemes([]);
    try { localStorage.removeItem("charmstudio:customThemes"); } catch {}
    setPaletteId(PALETTES[0].id);
    commitIr((prev) => applyPaletteTokens(prev, PALETTES[0]));
  }, [commitIr]);

  // Tree & Style Mutations
  const addBox = useCallback(
    (targetId = selectedId) => {
      const { doc: next, newId } = addBoxToTarget(ir, targetId);
      commitIr(next);
      setSelectedId(newId);
      markStep("addedComponent");
      return newId;
    },
    [ir, selectedId, commitIr, markStep]
  );

  const addPreset = useCallback(
    (preset: WidgetPreset, targetId = selectedId) => {
      const { doc: next, newId } = addBoxWithPreset(ir, targetId, preset);
      commitIr(next);
      setSelectedId(newId);
      markStep("addedComponent");
      return newId;
    },
    [ir, selectedId, commitIr, markStep]
  );

  const split = useCallback(
    (targetId: string, kind: "JoinHorizontal" | "JoinVertical") => {
      const { doc: next, newId } = splitNode(ir, targetId, kind);
      commitIr(next);
      setSelectedId(newId);
      markStep("addedComponent");
      return newId;
    },
    [ir, commitIr, markStep]
  );

  const moveSiblingNode = useCallback(
    (dir: -1 | 1, targetId = selectedId) => {
      commitIr((prev) => moveSibling(prev, targetId, dir));
    },
    [selectedId, commitIr]
  );

  const dropNode = useCallback(
    (dragId: string, targetId: string, position: "before" | "inside" | "after") => {
      commitIr((prev) => moveNodeDrop(prev, dragId, targetId, position));
    },
    [commitIr]
  );

  const renameNode = useCallback(
    (oldId: string, desiredId: string) => {
      const { doc: next, renamedId } = renameNodeInDoc(ir, oldId, desiredId);
      if (renamedId === oldId) return oldId;
      commitIr(next);
      if (selectedId === oldId) setSelectedId(renamedId);
      return renamedId;
    },
    [ir, selectedId, commitIr]
  );

  const duplicateNode = useCallback(
    (targetId = selectedId) => {
      const { doc: next, newId } = duplicateNodeInDoc(ir, targetId);
      commitIr(next);
      setSelectedId(newId);
      return newId;
    },
    [ir, selectedId, commitIr]
  );

  const unwrapNode = useCallback(
    (targetId = selectedId) => {
      const { doc: next, nextSelected } = unwrapContainer(ir, targetId);
      commitIr(next);
      setSelectedId(nextSelected);
      return nextSelected;
    },
    [ir, selectedId, commitIr]
  );

  const deleteNode = useCallback(
    (targetId = selectedId) => {
      const { doc: next, nextSelected } = deleteNodeFromDoc(ir, targetId);
      commitIr(next);
      setSelectedId(nextSelected);
      return nextSelected;
    },
    [ir, selectedId, commitIr]
  );

  const forkStyle = useCallback(
    (nodeId = selectedId) => {
      commitIr((prev) => forkStyleForNode(prev, nodeId));
    },
    [selectedId, commitIr]
  );

  const pruneStyles = useCallback(() => {
    const { doc: pruned, removedCount } = pruneUnusedStyles(ir);
    if (removedCount > 0) commitIr(pruned);
    return removedCount;
  }, [ir, commitIr]);

  const toggleOverlay = useCallback(
    (overlayId: string) => {
      commitIr((prev) => ({
        ...prev,
        overlays: prev.overlays.map((o) => (o.id === overlayId ? { ...o, visible: !o.visible } : o)),
      }));
      markStep("styledOrInteracted");
    },
    [commitIr, markStep]
  );

  const setOverlayAnchor = useCallback(
    (overlayId: string, anchor: OverlayAnchor) => {
      commitIr((prev) => ({
        ...prev,
        overlays: prev.overlays.map((o) => (o.id === overlayId ? { ...o, anchor } : o)),
      }));
      markStep("styledOrInteracted");
    },
    [commitIr, markStep]
  );

  const updateOverlay = useCallback(
    (overlayId: string, patch: Partial<IROverlay>) => {
      commitIr((prev) => ({
        ...prev,
        overlays: prev.overlays.map((o) => (o.id === overlayId ? { ...o, ...patch } : o)),
      }));
      markStep("styledOrInteracted");
    },
    [commitIr, markStep]
  );

  const addOverlay = useCallback(() => {
    const { doc: next, nodeId } = addOverlayToDoc(ir);
    commitIr(next);
    setSelectedId(nodeId);
    markStep("addedComponent");
    return nodeId;
  }, [ir, commitIr, markStep]);

  const removeOverlay = useCallback(
    (overlayId: string) => {
      const { doc: next, nextSelected } = removeOverlayFromDoc(ir, overlayId);
      commitIr(next);
      setSelectedId(nextSelected);
    },
    [ir, commitIr]
  );

  const updateNode = useCallback(
    (nodeId: string, updater: (n: IRNode) => IRNode) => {
      commitIr((prev) => {
        const nodeKey = `node:${nodeId}`;
        if (prev.lockReasons?.[nodeKey] === "sync-disabled") return prev;
        const lockedNodeProps = prev.lockedProps?.[nodeKey] ?? [];
        if (lockedNodeProps.includes("*")) return prev;
        const prevNode = findNode(prev, nodeId);
        return updateNodeInDoc(prev, nodeId, (n) => {
          const updated = updater(n);
          if (!prevNode || lockedNodeProps.length === 0) return updated;
          return {
            ...updated,
            width: lockedNodeProps.includes("width") ? prevNode.width : updated.width,
            height: lockedNodeProps.includes("height") ? prevNode.height : updated.height,
          };
        });
      });
    },
    [commitIr]
  );

  const updateView = useCallback(
    (patch: Partial<IRViewConfig>) => {
      commitIr((prev) => ({
        ...prev,
        view: {
          altScreen: true,
          mouseMode: "cell",
          ...(prev.view ?? {}),
          ...patch,
        },
      }));
      markStep("styledOrInteracted");
    },
    [commitIr, markStep]
  );

  const updateSelectedStyle = useCallback(
    (patch: Partial<IRStyle>) => {
      if (!selectedNode?.style) return;
      if (patch.padding !== undefined || patch.margin !== undefined) {
        setActiveProperty("padding");
      } else if (patch.border !== undefined || patch.borderEdges !== undefined) {
        setActiveProperty("border");
      } else if (patch.fg !== undefined || patch.bg !== undefined || patch.borderColor !== undefined) {
        setActiveProperty("colors");
      }
      const styleKey = selectedNode.style;
      commitIr((prev) => {
        const locks = prev.lockedProps?.[styleKey] ?? [];
        if (locks.includes("*")) return prev;
        const filteredPatch: Partial<IRStyle> = {};
        for (const [k, v] of Object.entries(patch) as [keyof IRStyle, IRStyle[keyof IRStyle]][]) {
          const lockKey = k === "borderEdges" ? "border" : k;
          if (!locks.includes(lockKey as string)) {
            (filteredPatch as Record<string, unknown>)[k] = v;
          }
        }
        if (Object.keys(filteredPatch).length === 0) return prev;
        return {
          ...prev,
          styles: { ...prev.styles, [styleKey]: { ...prev.styles[styleKey], ...filteredPatch } },
        };
      });
      markStep("styledOrInteracted");
    },
    [selectedNode, commitIr, markStep]
  );

  const unlockStyleProp = useCallback(
    (styleName: string, prop?: string) => {
      commitIr((prev) => {
        if (!prev.lockedProps?.[styleName]) return prev;
        const nextLocks = { ...prev.lockedProps };
        if (!prop || prop === "*") {
          delete nextLocks[styleName];
        } else {
          const remaining = nextLocks[styleName].filter((p) => p !== prop && p !== "*");
          if (remaining.length > 0) nextLocks[styleName] = remaining;
          else delete nextLocks[styleName];
        }
        const nextReasons = prev.lockReasons ? { ...prev.lockReasons } : undefined;
        if (nextReasons && !nextLocks[styleName]) {
          delete nextReasons[styleName];
        }
        return {
          ...prev,
          lockedProps: Object.keys(nextLocks).length > 0 ? nextLocks : undefined,
          lockReasons: nextReasons && Object.keys(nextReasons).length > 0 ? nextReasons : undefined,
        };
      });
    },
    [commitIr]
  );

  const reenableSync = useCallback(
    (symbolKey: string) => {
      commitIr((prev) => {
        const nextLocks = { ...(prev.lockedProps ?? {}) };
        const nextReasons = { ...(prev.lockReasons ?? {}) };
        let nextImported = prev.importedGo ? { ...prev.importedGo } : undefined;

        if (symbolKey === "*") {
          if (nextImported) {
            nextImported.fileSyncDisabled = false;
            nextImported.source = nextImported.source.replace(/^\s*\/\/\s*@tui:(?:sync-disable|block-disable)\b.*\n?/gm, "");
          }
        } else {
          delete nextLocks[symbolKey];
          delete nextReasons[symbolKey];
          if (nextImported?.source) {
            const rawSym = symbolKey.startsWith("node:") ? symbolKey.slice(5) : symbolKey;
            const esc = rawSym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const symRe = new RegExp(
              `(//\\s*@tui:(?:sync-disable|block-disable)\\b[^\\n]*\\n(?:\\s*//[^\\n]*\\n)*)(?=[^\\n]*\\b${esc}\\b)`,
              "gi"
            );
            nextImported.source = nextImported.source.replace(symRe, "");
          }
        }

        return {
          ...prev,
          lockedProps: Object.keys(nextLocks).length > 0 ? nextLocks : undefined,
          lockReasons: Object.keys(nextReasons).length > 0 ? nextReasons : undefined,
          importedGo: nextImported,
        };
      });
    },
    [commitIr]
  );

  const toggleOverrideDynamicProp = useCallback(
    (key: string, prop: string, overrideStatic: boolean) => {
      commitIr((prev) => {
        const nextLocks = { ...(prev.lockedProps ?? {}) };
        const nextOverridden = { ...(prev.overriddenProps ?? {}) };
        const nextReasons = { ...(prev.lockReasons ?? {}) };

        if (overrideStatic) {
          const remaining = (nextLocks[key] ?? []).filter((p) => p !== prop);
          if (remaining.length > 0) nextLocks[key] = remaining;
          else delete nextLocks[key];

          const curOv = nextOverridden[key] ?? [];
          if (!curOv.includes(prop)) nextOverridden[key] = [...curOv, prop];
        } else {
          const curLocks = nextLocks[key] ?? [];
          if (!curLocks.includes(prop)) nextLocks[key] = [...curLocks, prop];

          const remainingOv = (nextOverridden[key] ?? []).filter((p) => p !== prop);
          if (remainingOv.length > 0) nextOverridden[key] = remainingOv;
          else delete nextOverridden[key];

          if (!nextReasons[key]) nextReasons[key] = "dynamic";
        }

        return {
          ...prev,
          lockedProps: Object.keys(nextLocks).length > 0 ? nextLocks : undefined,
          overriddenProps: Object.keys(nextOverridden).length > 0 ? nextOverridden : undefined,
          lockReasons: Object.keys(nextReasons).length > 0 ? nextReasons : undefined,
        };
      });
    },
    [commitIr]
  );

  const updateQuad = useCallback(
    (field: "padding" | "margin", idx: number, val: number) => {
      if (!selectedStyle) return;
      setActiveProperty("padding");
      const next: [number, number, number, number] = [...selectedStyle[field]];
      next[idx] = Math.max(0, val || 0);
      updateSelectedStyle({ [field]: next });
    },
    [selectedStyle, updateSelectedStyle]
  );

  const toggleBorderEdge = useCallback(
    (idx: number) => {
      if (!selectedStyle) return;
      setActiveProperty("border");
      const cur = selectedStyle.borderEdges ?? [true, true, true, true];
      const next: [boolean, boolean, boolean, boolean] = [...cur];
      next[idx] = !next[idx];
      updateSelectedStyle({ borderEdges: next });
    },
    [selectedStyle, updateSelectedStyle]
  );

  const addToken = useCallback(
    (rawName: string) => {
      const key = rawName.trim().replace(/[^a-zA-Z0-9_]/g, "");
      if (!key || ir.tokens[key]) return false;
      commitIr((p) => ({
        ...p,
        tokens: { ...p.tokens, [key]: { light: "#d97706", dark: "#fbbf24" } },
      }));
      return true;
    },
    [ir.tokens, commitIr]
  );

  const updateToken = useCallback(
    (name: string, mode: "light" | "dark", hex: string) => {
      setActiveProperty("colors");
      commitIr((p) => {
        const pair = p.tokens[name];
        if (!pair) return p;
        return {
          ...p,
          tokens: { ...p.tokens, [name]: { ...pair, [mode]: hex } },
        };
      });
    },
    [commitIr]
  );

  const loadTemplate = useCallback(
    (id: string) => {
      const tpl = TEMPLATES.find((t) => t.id === id);
      if (!tpl) return;
      setTemplateId(id);
      commitIr(applyPaletteTokens(tpl.doc, palette));
      setSelectedId(tpl.defaultSelectedId);
      markStep("templateOrImport");
    },
    [palette, commitIr, markStep]
  );

  const resetToTemplate = useCallback(() => {
    clearDraft();
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    loadTemplate(templateId);
  }, [templateId, loadTemplate]);

  const shareLink = useCallback(async () => {
    const encoded = await encodeShareHash({ ir, paletteId, templateId });
    const url = `${window.location.origin}${window.location.pathname}#s=${encoded}`;
    window.history.replaceState(null, "", `#s=${encoded}`);
    await navigator.clipboard.writeText(url);
    setSharedCopied(true);
    setTimeout(() => setSharedCopied(false), 1800);
  }, [ir, paletteId, templateId]);

  const value: StudioStoreValue = {
    activeLens,
    setActiveLens,
    workspaceMode,
    switchWorkspaceMode,
    showAdvancedStyle,
    setShowAdvancedStyle,
    appMode,
    setAppMode,
    tooltipsEnabled,
    setTooltipsEnabled,
    goModuleName,
    setGoModuleName,
    layersOpen,
    setLayersOpen,
    inspectorOpen,
    setInspectorOpen,
    rightTab,
    setRightTab,
    templateId,
    setTemplateId,
    paletteId,
    setPaletteId,
    ir,
    past,
    future,
    commitIr,
    replaceIrWithoutHistory,
    undo,
    redo,
    selectedId,
    setSelectedId,
    selectedNode,
    selectedOverlay,
    selectedStyle,
    singleTel,
    setSingleTel,
    hoveredProperty,
    setHoveredProperty,
    activeProperty,
    setActiveProperty,
    lastKeyPulse,
    triggerKeyPulse,
    matrixFitStatus,
    singleDiagnoses,
    activeOverflowDiagnoses,
    inspectorFocusRequest,
    clearInspectorFocusRequest,
    visualDiagnosticPopover,
    setVisualDiagnosticPopover,
    visualDebugRect,
    setVisualDebugRect,
    liveAnnouncement,
    announce,
    jumpToOverflowDiagnostic,
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
    polarityOverride,
    setPolarityOverride,
    showOverlay,
    setShowOverlay,
    fontFamily,
    setFontFamily,
    customThemes,
    allPalettes,
    palette,
    effectivePalette,
    selectPalette,
    addCustomTheme,
    clearCustomThemes,
    renderTick,
    bumpTick,
    codeDrawerRequest,
    setCodeDrawerRequest,
    openCodeForSelection,
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
    forkStyle,
    pruneStyles,
    toggleOverlay,
    setOverlayAnchor,
    updateOverlay,
    addOverlay,
    removeOverlay,
    updateNode,
    updateView,
    updateSelectedStyle,
    unlockStyleProp,
    reenableSync,
    toggleOverrideDynamicProp,
    updateQuad,
    toggleBorderEdge,
    addToken,
    updateToken,
    loadTemplate,
    resetToTemplate,
    shareLink,
    sharedCopied,
    previewMode,
    setPreviewMode,
    desktopConnected,
    desktopBridgeUrl,
    setDesktopBridgeUrl,
    refreshDesktopConnection,
    projectDir,
    setProjectDir,
    ptyStatus,
    startPtyRunner,
    stopPtyRunner,
    mcpStatus,
    refreshMcpStatus,
    worktrees,
    activeWorktreeId,
    setActiveWorktreeId,
    refreshWorktrees,
  };

  return createElement(StudioStoreContext.Provider, { value }, children);
}

export function useStudioStore(): StudioStoreValue {
  const ctx = useContext(StudioStoreContext);
  if (!ctx) throw new Error("useStudioStore must be used inside StudioProvider");
  return ctx;
}
