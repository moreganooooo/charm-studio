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
import {
  findNode,
  updateNodeInDoc,
  type ColorProfile,
  type IRDoc,
  type IRNode,
  type IRStyle,
  type IRViewConfig,
  type OverlayAnchor,
  type TelemetryNode,
  type WorkspaceMode,
} from "../types";
import type { WidgetPreset } from "../widgetPresets";

export const PALETTES: ThemePreset[] = [
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

  // Selection & Telemetry
  selectedId: string;
  setSelectedId: (id: string) => void;
  selectedNode: IRNode | null;
  selectedOverlay: IRDoc["overlays"][number] | null;
  selectedStyle: IRStyle | null;
  singleTel: TelemetryNode[];
  setSingleTel: (tel: TelemetryNode[]) => void;

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
  showOverlay: boolean;
  setShowOverlay: (v: boolean | ((prev: boolean) => boolean)) => void;
  fontFamily: string;
  setFontFamily: (f: string) => void;
  customThemes: ThemePreset[];
  allPalettes: ThemePreset[];
  palette: ThemePreset;
  selectPalette: (id: string) => void;
  addCustomTheme: (theme: ThemePreset) => void;
  clearCustomThemes: () => void;
  renderTick: number;
  bumpTick: () => void;

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
  addOverlay: () => string;
  removeOverlay: (overlayId: string) => void;
  updateNode: (nodeId: string, updater: (n: IRNode) => IRNode) => void;
  updateView: (patch: Partial<IRViewConfig>) => void;
  updateSelectedStyle: (patch: Partial<IRStyle>) => void;
  updateQuad: (field: "padding" | "margin", idx: number, val: number) => void;
  toggleBorderEdge: (idx: number) => void;
  addToken: (name: string) => boolean;
  updateToken: (name: string, mode: "light" | "dark", hex: string) => void;

  // Templates & Sharing
  loadTemplate: (id: string) => void;
  resetToTemplate: () => void;
  shareLink: () => Promise<void>;
  sharedCopied: boolean;
}

const StudioStoreContext = createContext<StudioStoreValue | null>(null);

export function StudioProvider({ children }: { children: ReactNode }) {
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
  const [rightTab, setRightTab] = useState<"inspector" | "code">("inspector");

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

  const [fontFamily, setFontFamily] = useState(`"JetBrains Mono", "SF Mono", Menlo, Monaco, ui-monospace, monospace`);
  const [customThemes, setCustomThemes] = useState<ThemePreset[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("charmstudio:customThemes") || "[]");
    } catch {
      return [];
    }
  });
  const allPalettes = useMemo(() => [...PALETTES, ...customThemes], [customThemes]);

  const [viewMode, setViewMode] = useState<"single" | "matrix">(() => (workspaceMode === "pro" ? "matrix" : "single"));
  const [matrixDense, setMatrixDense] = useState(false);
  const [cols, setCols] = useState(82);
  const [rows, setRows] = useState(24);
  const [colorProfile, setColorProfile] = useState<ColorProfile>("truecolor");
  const [showOverlay, setShowOverlay] = useState<boolean>(() => workspaceMode === "pro");

  const [selectedId, setSelectedId] = useState<string>(TEMPLATES[0].defaultSelectedId);
  const [singleTel, setSingleTel] = useState<TelemetryNode[]>([]);
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

  const switchWorkspaceMode = useCallback((mode: WorkspaceMode) => {
    setWorkspaceMode(mode);
    if (mode === "studio") {
      setViewMode("single");
      setShowOverlay(false);
    } else {
      setShowOverlay(true);
    }
  }, []);

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

  const bumpTick = useCallback(() => {
    setRenderTick((t) => t + 1);
    markStep("styledOrInteracted");
  }, [markStep]);

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
      commitIr((prev) => updateNodeInDoc(prev, nodeId, updater));
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
      const styleKey = selectedNode.style;
      commitIr((prev) => ({
        ...prev,
        styles: { ...prev.styles, [styleKey]: { ...prev.styles[styleKey], ...patch } },
      }));
      markStep("styledOrInteracted");
    },
    [selectedNode, commitIr, markStep]
  );

  const updateQuad = useCallback(
    (field: "padding" | "margin", idx: number, val: number) => {
      if (!selectedStyle) return;
      const next: [number, number, number, number] = [...selectedStyle[field]];
      next[idx] = Math.max(0, val || 0);
      updateSelectedStyle({ [field]: next });
    },
    [selectedStyle, updateSelectedStyle]
  );

  const toggleBorderEdge = useCallback(
    (idx: number) => {
      if (!selectedStyle) return;
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
    fontFamily,
    setFontFamily,
    customThemes,
    allPalettes,
    palette,
    selectPalette,
    addCustomTheme,
    clearCustomThemes,
    renderTick,
    bumpTick,
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
    addOverlay,
    removeOverlay,
    updateNode,
    updateView,
    updateSelectedStyle,
    updateQuad,
    toggleBorderEdge,
    addToken,
    updateToken,
    loadTemplate,
    resetToTemplate,
    shareLink,
    sharedCopied,
  };

  return createElement(StudioStoreContext.Provider, { value }, children);
}

export function useStudioStore(): StudioStoreValue {
  const ctx = useContext(StudioStoreContext);
  if (!ctx) throw new Error("useStudioStore must be used inside StudioProvider");
  return ctx;
}
