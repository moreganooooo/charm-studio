import { useCallback, useEffect, useMemo, useState } from "react";
import { generateLayoutGo, generateMainGo, generateStylesGo } from "./codegen";
import { GearIcon, PanelRightIcon } from "./icons";
import { LayersPanel } from "./LayersPanel";
import type { User } from "@supabase/supabase-js";
import { AuthModal, type LocalUser } from "./AuthModal";
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
import { clearDraft, decodeShareHash, encodeShareHash, loadDraft, saveDraft } from "./persistence";
import { TEMPLATES } from "./templates";
import { TerminalViewport } from "./TerminalViewport";
import {
  addBoxToTarget,
  deleteNodeFromDoc,
  forkStyleForNode,
  moveSibling,
  splitNode,
} from "./treeOps";
import {
  findNode,
  updateNodeInDoc,
  type ColorProfile,
  type ContentType,
  type IRDoc,
  type IRStyle,
  type TelemetryNode,
} from "./types";

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

const CODE_FILE_INFO = {
  styles: "Your lipgloss.Style definitions and adaptive LightDark color tokens. Drop into ui/styles.go.",
  layout: "Responsive RenderApp() layout helper using JoinHorizontal/JoinVertical, margins, and breakpoints.",
  main:   "Complete runnable Bubble Tea v2 starter wired to WindowSizeMsg & BackgroundColorMsg.",
  json:   "Portable JSON Layout IR spec representing the current tree, styles, and tokens.",
} as const;

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

  const [templateId, setTemplateId] = useState(initialDraft?.templateId ?? TEMPLATES[0].id);
  const [paletteId, setPaletteId] = useState(initialDraft?.paletteId ?? "tokyo-dark");
  const [ir, setIrRaw] = useState<IRDoc>(() => initialDraft?.ir ?? structuredClone(TEMPLATES[0].doc));
  const [past, setPast] = useState<IRDoc[]>([]);
  const [future, setFuture] = useState<IRDoc[]>([]);

  const [renderTick, setRenderTick] = useState(0);
  const [layersOpen, setLayersOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [localUser, setLocalUser] = useState<LocalUser | null>(() => {
    try { return JSON.parse(localStorage.getItem("charmstudio:localUser") || "null"); } catch { return null; }
  });
  const [user, setUser] = useState<User | null>(null);
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
  const [viewMode, setViewMode] = useState<"single" | "matrix">("matrix");
  const [matrixDense, setMatrixDense] = useState(false);
  const [cols, setCols] = useState(86);
  const [rows, setRows] = useState(24);
  const [colorProfile, setColorProfile] = useState<ColorProfile>("truecolor");
  const [showOverlay, setShowOverlay] = useState(true);

  const [selectedId, setSelectedId] = useState<string>(TEMPLATES[0].defaultSelectedId);
  const [singleTel, setSingleTel] = useState<TelemetryNode[]>([]);

  const [rightTab, setRightTab] = useState<"inspector" | "code">("inspector");
  const [codeFile, setCodeFile] = useState<"styles" | "layout" | "main" | "json">("styles");
  const [copied, setCopied] = useState(false);
  const [sharedCopied, setSharedCopied] = useState(false);

  useEffect(() => {
    const qErr = new URLSearchParams(window.location.search).get("error_description");
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const hErr = hashParams.get("error_description");
    if (qErr || hErr) {
      setAuthError(qErr || hErr);
    }
    if (!supabase) return;

    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    (async () => {
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          setAuthError(`Session error: ${error.message}`);
        } else if (data.session?.user) {
          setUser(data.session.user);
          listCloudProjects(data.session.user.id).then(setCloudProjects).catch(console.error);
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          return;
        }
      }

      const { data, error } = await supabase.auth.getSession();
      if (error) setAuthError(`Auth error: ${error.message}`);
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) listCloudProjects(u.id).then(setCloudProjects).catch(console.error);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) listCloudProjects(u.id).then(setCloudProjects).catch(console.error);
      else setCloudProjects([]);
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
    [paletteId]
  );

  const selectedNode = useMemo(() => findNode(ir, selectedId), [ir, selectedId]);
  const selectedStyle: IRStyle | null = selectedNode?.style ? ir.styles[selectedNode.style] ?? null : null;
  const selectedTel = singleTel.find((t) => t.id === selectedId) ?? null;
  const showModal = ir.overlays[0]?.visible ?? false;
  const tokenKeys = Object.keys(ir.tokens);
  const styleKeys = Object.keys(ir.styles);

  const generatedOutput = useMemo(() => {
    if (codeFile === "styles") return generateStylesGo(ir);
    if (codeFile === "layout") return generateLayoutGo(ir);
    if (codeFile === "main") return generateMainGo(ir);
    return JSON.stringify(ir, null, 2);
  }, [ir, codeFile]);

  const updateSelectedStyle = (patch: Partial<IRStyle>) => {
    if (!selectedNode?.style) return;
    const styleKey = selectedNode.style;
    commitIr((prev) => ({
      ...prev,
      styles: { ...prev.styles, [styleKey]: { ...prev.styles[styleKey], ...patch } },
    }));
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
  };

  const loadTemplate = (id: string) => {
    const tpl = TEMPLATES.find((t) => t.id === id);
    if (!tpl) return;
    setTemplateId(id);
    commitIr(applyPaletteTokens(tpl.doc, palette));
    setSelectedId(tpl.defaultSelectedId);
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
    setTimeout(() => setCopied(false), 1500);
  };

  const bumpTick = () => setRenderTick((t) => t + 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0c0b12", color: "#ede9fe" }}>
      {/* FULL-WIDTH SPARKLING CHARM HERO */}
      <header
        style={{
          position: "relative",
          padding: "12px 20px 24px 14px",
          borderBottom: "1px solid #26213a",
          background:
            "radial-gradient(ellipse 50% 140% at 18% 0%, rgba(255, 117, 181, 0.20) 0%, rgba(192, 132, 252, 0.10) 45%, rgba(12, 11, 18, 0) 80%), radial-gradient(ellipse 45% 120% at 88% 100%, rgba(94, 234, 212, 0.09) 0%, rgba(12, 11, 18, 0) 75%), #0f0d18",
        }}
      >
        {/* Top-Right Account / Login Pill */}
        <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => setAuthOpen(true)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 7,
              padding: "5px 12px", borderRadius: 999, cursor: "pointer", fontSize: 12, fontWeight: 600,
              background: user || localUser ? "rgba(94, 234, 212, 0.12)" : "rgba(255, 117, 181, 0.16)",
              color: user || localUser ? "#5eead4" : "#ff99c8",
              border: `1px solid ${user || localUser ? "rgba(94, 234, 212, 0.4)" : "rgba(255, 117, 181, 0.45)"}`,
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
        </div>

        {authError && (
          <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(244, 63, 94, 0.16)", border: "1px solid rgba(244, 63, 94, 0.45)", color: "#fda4af", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span><b>Auth Error:</b> {authError}</span>
            <button onClick={() => setAuthError(null)} style={{ background: "none", border: "none", color: "#fda4af", cursor: "pointer" }}>✕</button>
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
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
              <span className="charm-sparkle-a" style={{ fontSize: 24, color: "#ff75b5" }}>✦</span>
              <span className="charm-sparkle-b" style={{ fontSize: 15, color: "#5eead4", marginTop: -22 }}>✧</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "5px 15px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
                  color: "#fdf4ff",
                  background: "linear-gradient(90deg, rgba(255,117,181,0.20), rgba(192,132,252,0.20), rgba(94,234,212,0.16))",
                  border: "1px solid rgba(244, 114, 182, 0.45)",
                }}
              >
                Lip Gloss + Bubbles
              </span>
              <span style={{ fontSize: 15.5, fontWeight: 600, color: "#e9d5ff", letterSpacing: 0.1 }}>
                Live Go TUI Layout Sandbox &amp; Code Generator
              </span>
            </div>
          </div>

          {/* RIGHT: Stretches across to the right margin */}
          <div
            style={{
              padding: "18px 24px",
              borderRadius: 12,
              background: "rgba(23, 20, 36, 0.76)",
              border: "1px solid #2d2645",
              borderLeft: "3px solid #ff75b5",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
            }}
          >
            <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.62, color: "#dad4f5" }}>
              Stop guessing terminal cell math in the dark. Tweak borders, padding, and breakpoints
              in real compiled Go—then poke straight into live Bubbles, stress-test three terminal
              sizes at once, and walk away with clean <code style={inlineCode}>styles.go</code> and{" "}
              <code style={inlineCode}>layout.go</code> without the compile-resize-sigh loop.
            </p>
          </div>
        </div>
      </header>

      {/* 3-COLUMN STUDIO WORKSPACE BELOW */}
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `${layersOpen ? "252px" : "40px"} 1fr ${inspectorOpen ? "378px" : "40px"}`,
          minWidth: 0,
        }}
      >
        {/* LEFT: Layout Tree */}
        <LayersPanel
          doc={ir}
          selectedId={selectedId}
          open={layersOpen}
          onToggleOpen={() => setLayersOpen((v) => !v)}
          onSelect={setSelectedId}
          onAddBox={() => {
            const { doc: next, newId } = addBoxToTarget(ir, selectedId);
            commitIr(next);
            setSelectedId(newId);
          }}
          onSplit={(kind) => {
            const { doc: next, newId } = splitNode(ir, selectedId, kind);
            commitIr(next);
            setSelectedId(newId);
          }}
          onMove={(dir) => commitIr((prev) => moveSibling(prev, selectedId, dir))}
          onDelete={() => {
            const { doc: next, nextSelected } = deleteNodeFromDoc(ir, selectedId);
            commitIr(next);
            setSelectedId(nextSelected);
          }}
          onToggleOverlay={toggleOverlay}
        />

        {/* CENTER: Terminal Stage */}
        <div style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16, overflow: "auto", minWidth: 0 }}>
          {/* Row 1: Template & Project Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <label style={{ ...inlineLbl, gap: 10 }}>
              <span
                style={{
                  padding: "7px 14px",
                  fontWeight: 700,
                  fontSize: 13.5,
                  background: "#181526",
                  color: "#ff75b5",
                  borderBottom: "2px solid #ff75b5",
                  borderRadius: "6px 6px 0 0",
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

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => setProjectsOpen(true)} style={btnStyle(projectsOpen)} title="Saved projects &amp; GitHub cloud sync">
                📁 {user ? `@${(user?.user_metadata?.user_name as string | undefined) ?? "Account"}` : "Projects"} ({allProjects.length})
              </button>
              <button onClick={() => setImportOpen(true)} style={btnStyle(importOpen)} title="Upload .go/.json files or pull styles from a public GitHub repo">📥 Import / GitHub</button>
              <button onClick={undo} disabled={past.length === 0} title="Undo (Cmd+Z)" style={btnStyle(false)}>↶ Undo</button>
              <button onClick={redo} disabled={future.length === 0} title="Redo (Cmd+Shift+Z)" style={btnStyle(false)}>↷ Redo</button>
              <button onClick={shareLink} style={btnStyle(sharedCopied)} title="Compress layout into a shareable URL link">
                {sharedCopied ? "✓ Link Copied!" : "🔗 Share Link"}
              </button>
              <button onClick={resetToTemplate} style={btnStyle(false)} title="Reset edits back to template default">
                Reset
              </button>
              <button onClick={() => setSettingsOpen(true)} style={{ ...btnStyle(settingsOpen), display: "inline-flex", alignItems: "center", gap: 5 }} title="Upload custom themes, change fonts, or export IR">
                <GearIcon /> Settings
              </button>
              <button onClick={() => setShowGuide((v) => !v)} style={btnStyle(showGuide)}>
                ? Guide
              </button>
            </div>
          </div>

          {/* Row 2: Terminal Environment Simulation Controls */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", padding: "10px 14px", background: "#12101c", border: "1px solid #26213a", borderRadius: 10 }}>
            <div style={{ display: "inline-flex", background: "#0c0b12", borderRadius: 7, padding: 3, border: "1px solid #26213a" }}>
              <button onClick={() => setViewMode("single")} style={segBtn(viewMode === "single")} title="Inspect one resizable terminal with a drag handle">
                Single Viewport
              </button>
              <button onClick={() => setViewMode("matrix")} style={segBtn(viewMode === "matrix")} title="Test Compact, Standard, and Wide breakpoints side-by-side">
                Matrix (3× Sizes)
              </button>
            </div>

            <label style={inlineLbl} title="Simulate terminal theme & sync adaptive LightDark tokens">
              <span>Theme:</span>
              <select
                value={paletteId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setPaletteId(nextId);
                  const preset = allPalettes.find((p) => p.id === nextId);
                  if (preset) commitIr((prev) => applyPaletteTokens(prev, preset));
                }}
                style={{ ...inputStyle, width: "auto", padding: "5px 9px" }}
              >
                {allPalettes.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>

            <label style={inlineLbl} title="Simulate terminal color capabilities via charmbracelet/colorprofile">
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

            {viewMode === "matrix" && (
              <button onClick={() => setMatrixDense((v) => !v)} style={btnStyle(matrixDense)} title="Shrink preview font size so all 3 terminals fit together">
                {matrixDense ? "Zoom: Compact" : "Zoom: Normal"}
              </button>
            )}

            {ir.overlays[0] && (
              <button onClick={() => toggleOverlay(ir.overlays[0].id)} style={btnStyle(showModal)} title="Toggle floating Lip Gloss v2 modal layer">
                Modal Layer: {showModal ? "ON" : "OFF"}
              </button>
            )}

            <button onClick={() => setShowOverlay((v) => !v)} style={btnStyle(showOverlay)} title="Toggle box-model DevTools highlight overlays">
              DevTools: {showOverlay ? "ON" : "OFF"}
            </button>
          </div>

          {/* Optional Quick Guide Banner */}
          {showGuide && (
            <div style={{ padding: "14px 16px", background: "#181429", border: "1px solid #c084fc", borderRadius: 10, fontSize: 12.5, lineHeight: 1.6, color: "#e9d5ff", display: "flex", justifyContent: "space-between", gap: 14 }}>
              <div>
                <b style={{ color: "#ff75b5", fontSize: 13 }}>How Charm Studio Works (real Go WASM — not a CSS mockup):</b>
                <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  <li><b>Click any pane</b> inside a terminal (or in the left <b>Layout Tree</b>) to select it and inspect its Lip Gloss box model.</li>
                  <li><b>Drive live Bubbles:</b> While a terminal is focused (pink outline), press <code style={inlineCode}>↑/↓</code>, <code style={inlineCode}>j/k</code>, <code style={inlineCode}>/</code>, or type into inputs to interact with real Go <code style={inlineCode}>bubbles/v2</code> state.</li>
                  <li><b>Test responsiveness:</b> Watch <b>Matrix (3×)</b> catch overflows (or auto-collapse panes marked <code style={inlineCode}>&lt;70</code>), or switch to <b>Single</b> and drag the <code style={inlineCode}>⌟</code> corner grip.</li>
                  <li><b>Export idiomatic Go:</b> Open the <b>Go Code</b> tab on the right to copy clean <code style={inlineCode}>styles.go</code>, <code style={inlineCode}>layout.go</code>, and runnable <code style={inlineCode}>main.go</code>.</li>
                </ol>
              </div>
              <button onClick={() => setShowGuide(false)} style={{ ...btnStyle(false), alignSelf: "flex-start" }}>✕</button>
            </div>
          )}

          {/* Canvas Hint + DevTools Legend Bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, fontSize: 12.5, color: "#a59ec9", paddingTop: 2 }}>
            <span>
              💡 <b style={{ color: "#ede9fe" }}>Click</b> a pane to inspect • <b style={{ color: "#ede9fe" }}>Type / ↑↓</b> to drive live Bubbles
              {viewMode === "matrix" && <span style={{ color: "#7e769e" }}> • Narrow panes collapse items tagged &lt;cols</span>}
            </span>
            {showOverlay && (
              <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11.5 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={dot("#fb923c")} /> Margin</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={dot("#4ade80")} /> Padding</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={dot("#60a5fa")} /> Content</span>
              </span>
            )}
          </div>

          {viewMode === "single" && (
            <div style={{ display: "flex", gap: 16, alignItems: "center", fontSize: 13, color: "#a59ec9", flexWrap: "wrap" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Cols <b style={{ color: "#fdf4ff" }}>{cols}</b>
                <input type="range" min={30} max={140} value={cols} onChange={(e) => setCols(+e.target.value)} style={{ accentColor: "#ff75b5" }} />
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                Rows <b style={{ color: "#fdf4ff" }}>{rows}</b>
                <input type="range" min={10} max={45} value={rows} onChange={(e) => setRows(+e.target.value)} style={{ accentColor: "#ff75b5" }} />
              </label>
              <span style={{ fontSize: 11.5, color: "#7e769e" }}>
                (Or drag the <code style={inlineCode}>⌟</code> bottom-right corner handle directly)
              </span>
            </div>
          )}

          {viewMode === "single" ? (
            <div>
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
                selectedId={selectedId}
                onSelect={setSelectedId}
                onInteract={bumpTick}
                onResize={(c, r) => { setCols(c); setRows(r); }}
                onTelemetry={setSingleTel}
              />
              <div style={{ marginTop: 12, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#a59ec9" }}>
                {selectedTel ? (
                  <span>
                    Selected <b style={{ color: "#fdf4ff" }}>#{selectedTel.id}</b> • total box {selectedTel.margin.w}×{selectedTel.margin.h} • inner content {selectedTel.content.w}×{selectedTel.content.h}
                    {selectedTel.overflowMsg && <span style={{ color: "#fda4af", marginLeft: 10 }}>⚠ {selectedTel.overflowMsg}</span>}
                  </span>
                ) : (
                  <span>Node <b>#{selectedId}</b> is currently hidden/collapsed at {cols} cols.</span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
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
          <aside style={{ borderLeft: "1px solid #26213a", background: "#12101c", display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14 }}>
            <button onClick={() => setInspectorOpen(true)} title="Expand Inspector" style={{ ...miniBtn, display: "inline-flex", alignItems: "center" }}><PanelRightIcon collapsed={true} /></button>
            <span style={{ writingMode: "vertical-rl", marginTop: 18, fontSize: 11, color: "#7e769e", letterSpacing: 1.6, textTransform: "uppercase" }}>
              Inspector
            </span>
          </aside>
        ) : (
          <aside style={{ borderLeft: "1px solid #26213a", background: "#12101c", display: "flex", flexDirection: "column", position: "sticky", top: 0, maxHeight: "100vh" }}>
            <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid #26213a" }}>
              {(["inspector", "code"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRightTab(t)}
                  style={{
                    flex: 1, padding: "14px 0", border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13.5,
                    background: rightTab === t ? "#181526" : "transparent",
                    color: rightTab === t ? "#ff75b5" : "#8b82ad",
                    borderBottom: rightTab === t ? "2px solid #ff75b5" : "2px solid transparent",
                  }}
                >
                  {t === "inspector" ? "Inspector" : "Go Code"}
                </button>
              ))}
              <button onClick={() => setInspectorOpen(false)} title="Collapse Inspector" style={{ ...miniBtn, marginRight: 10, display: "inline-flex", alignItems: "center" }}><PanelRightIcon collapsed={false} /></button>
            </div>

            {rightTab === "inspector" ? (
              <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18, fontSize: 13 }}>
                {selectedNode && selectedNode.kind !== "Box" && (
                  <Section
                    title="Container Layout"
                    badge={selectedNode.id}
                    subtitle={`Controls how child panes align inside ${selectedNode.kind}.`}
                  >
                    <label style={labelCol}>
                      Join Alignment
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

                    {selectedNode.id !== ir.root.id && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                        <label style={labelCol}>
                          Width Mode
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
                            <option value="fill">Fill (flex)</option>
                            <option value="fixed">Fixed cols</option>
                          </select>
                        </label>
                        <label style={labelCol}>
                          Collapse Below (cols)
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
                      title="Layout & Sizing"
                      badge={`#${selectedNode.id}`}
                      subtitle="Choose whether this pane renders a live Bubble widget or text, and how it resizes."
                    >
                      <label style={{ ...labelCol, marginBottom: 10 }}>
                        Component Type
                        <select
                          value={selectedNode.contentType ?? "text"}
                          onChange={(e) =>
                            commitIr((prev) =>
                              updateNodeInDoc(prev, selectedNode.id, (n) => ({
                                ...n,
                                contentType: e.target.value as ContentType,
                              }))
                            )
                          }
                          style={inputStyle}
                        >
                          <option value="text">Plain Text (editable below)</option>
                          <option value="bubble:list">Bubbles: List (interactive ↑/↓, /)</option>
                          <option value="bubble:table">Bubbles: Table (interactive ↑/↓, j/k)</option>
                          <option value="bubble:viewport">Bubbles: Viewport (scrollable ↑/↓)</option>
                          <option value="bubble:textinput">Bubbles: TextInput (type live!)</option>
                        </select>
                      </label>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        <label style={labelCol}>
                          Width Mode
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
                            <option value="fill">Fill (proportional)</option>
                            <option value="fit">Fit content</option>
                          </select>
                        </label>

                        {selectedNode.width?.mode === "fixed" ? (
                          <label style={labelCol}>
                            Fixed Cols
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
                        ) : (
                          <label style={labelCol}>
                            Width Weight
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
                        )}

                        <label style={labelCol}>
                          Height Mode
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
                            <option value="fill">Fill (proportional)</option>
                            <option value="fixed">Fixed rows</option>
                            <option value="fit">Fit content</option>
                          </select>
                        </label>

                        {selectedNode.height?.mode === "fixed" ? (
                          <label style={labelCol}>
                            Fixed Rows
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
                        ) : (
                          <label style={labelCol}>
                            Height Weight
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
                        )}
                      </div>

                      <label style={{ ...labelCol, marginTop: 12 }}>
                        Responsive Breakpoint — Collapse Below (cols)
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
                        <span style={hintTxt}>Hides this pane automatically when terminal width drops below N cols (0 = always visible).</span>
                      </label>
                    </Section>

                    <Section
                      title="Lip Gloss Style"
                      badge={selectedNode.style}
                      subtitle="Styles can be shared across boxes. Click Fork Style to customize this box alone."
                      action={
                        <button onClick={() => commitIr((prev) => forkStyleForNode(prev, selectedNode.id))} style={miniBtn} title="Create a new independent copy of this style">
                          Fork Style
                        </button>
                      }
                    >
                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                        <label style={labelCol}>
                          Assigned Style
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

                        {selectedStyle.border !== "none" && (
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
                            Border Color
                            <select value={selectedStyle.borderColor || ""} onChange={(e) => updateSelectedStyle({ borderColor: e.target.value })} style={inputStyle}>
                              <option value="">Default</option>
                              {tokenKeys.map((k) => <option key={k} value={`$${k}`}>${k}</option>)}
                            </select>
                          </label>
                          <label style={labelCol}>
                            Text (Fg)
                            <select value={selectedStyle.fg || ""} onChange={(e) => updateSelectedStyle({ fg: e.target.value })} style={inputStyle}>
                              <option value="">Default</option>
                              {tokenKeys.map((k) => <option key={k} value={`$${k}`}>${k}</option>)}
                            </select>
                          </label>
                          <label style={labelCol}>
                            Fill (Bg)
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
                          <label style={checkLbl} title="Clip long lines with '…' instead of wrapping onto multiple rows"><input type="checkbox" checked={!!selectedStyle.truncate} onChange={(e) => updateSelectedStyle({ truncate: e.target.checked })} style={chkAcc} /> Truncate (…)</label>
                        </div>
                      </div>

                      <div style={{ marginTop: 14 }}>
                        <div style={{ ...microTag, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={dot("#4ade80")} /> PADDING (INNER CELLS)
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                          {QUAD_LABELS.map((lbl, i) => (
                            <label key={lbl} style={labelCol}>
                              <span style={{ fontSize: 10.5, color: "#8b82ad" }}>{lbl}</span>
                              <input type="number" min={0} max={10} value={selectedStyle.padding[i]} onChange={(e) => updateQuad("padding", i, +e.target.value)} style={inputStyle} />
                            </label>
                          ))}
                        </div>
                      </div>

                      <div style={{ marginTop: 12 }}>
                        <div style={{ ...microTag, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={dot("#fb923c")} /> MARGIN (OUTER CELLS)
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                          {QUAD_LABELS.map((lbl, i) => (
                            <label key={lbl} style={labelCol}>
                              <span style={{ fontSize: 10.5, color: "#8b82ad" }}>{lbl}</span>
                              <input type="number" min={0} max={10} value={selectedStyle.margin[i]} onChange={(e) => updateQuad("margin", i, +e.target.value)} style={inputStyle} />
                            </label>
                          ))}
                        </div>
                      </div>
                    </Section>

                    {(!selectedNode.contentType || selectedNode.contentType === "text") && (
                      <Section
                        title="Mock Content"
                        subtitle="Preview text rendered inside this box (passed into RenderApp in Go)."
                      >
                        <textarea
                          rows={4}
                          value={selectedNode.content ?? ""}
                          onChange={(e) =>
                            commitIr((prev) => updateNodeInDoc(prev, selectedNode.id, (n) => ({ ...n, content: e.target.value })))
                          }
                          style={{ ...inputStyle, fontFamily: "ui-monospace, monospace", resize: "vertical" }}
                        />
                      </Section>
                    )}
                  </>
                )}

                <Section
                  title="Adaptive Tokens"
                  badge="LightDark"
                  subtitle="Pairs a ☀ Light and 🌙 Dark hex color via lipgloss.LightDark(hasDarkBG)."
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {Object.entries(ir.tokens).map(([name, pair]) => (
                      <div key={name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <code style={{ fontSize: 12.5, color: "#e9d5ff" }}>${name}</code>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#a59ec9" }}>
                            ☀
                            <input
                              type="color" value={pair.light}
                              onChange={(e) => commitIr((p) => ({ ...p, tokens: { ...p.tokens, [name]: { ...pair, light: e.target.value } } }))}
                              style={{ width: 26, height: 22, padding: 0, border: "none", background: "transparent", cursor: "pointer" }}
                            />
                          </label>
                          <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#a59ec9" }}>
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
                  </div>
                </Section>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "12px 14px", borderBottom: "1px solid #26213a", flexWrap: "wrap" }}>
                  <button onClick={() => setCodeFile("styles")} style={pillStyle(codeFile === "styles")}>styles.go</button>
                  <button onClick={() => setCodeFile("layout")} style={pillStyle(codeFile === "layout")}>layout.go</button>
                  <button onClick={() => setCodeFile("main")} style={pillStyle(codeFile === "main")}>main.go</button>
                  <button onClick={() => setCodeFile("json")} style={pillStyle(codeFile === "json")}>ir.json</button>
                  <button onClick={copyOutput} style={{ ...btnStyle(copied), marginLeft: "auto" }}>
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
                <div style={{ padding: "10px 16px", fontSize: 11.5, color: "#b4add4", borderBottom: "1px solid #26213a", background: "#0e0c16", lineHeight: 1.5 }}>
                  {CODE_FILE_INFO[codeFile]}
                </div>
                <pre style={{ margin: 0, padding: 16, overflow: "auto", flex: 1, fontSize: 12, lineHeight: 1.55, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "#e9d5ff" }}>
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
        onClose={() => setImportOpen(false)}
        onImportIR={(doc, selectId) => {
          commitIr(doc);
          setSelectedId(selectId);
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
        doc={ir}
      />
    </div>
  );
}

function Section({ title, badge, subtitle, action, children }: { title: string; badge?: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid #26213a", borderRadius: 10, padding: 16, background: "#171424" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: subtitle ? 6 : 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <h3 style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#f5d0fe", letterSpacing: -0.1 }}>
            {title}
          </h3>
          {badge && (
            <code style={{ fontSize: 11, padding: "1px 7px", borderRadius: 999, background: "#0c0b12", color: "#5eead4", border: "1px solid #2a2440" }}>
              {badge}
            </code>
          )}
        </div>
        {action}
      </div>
      {subtitle && (
        <div style={{ fontSize: 11.5, color: "#8b82ad", marginBottom: 14, lineHeight: 1.45 }}>
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
  background: "rgba(192, 132, 252, 0.13)",
  color: "#f5d0fe",
  border: "1px solid rgba(192, 132, 252, 0.25)",
};
const microTag: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, color: "#8b82ad", marginBottom: 6 };
const chkAcc: React.CSSProperties = { accentColor: "#ff75b5" };
const dot = (bg: string): React.CSSProperties => ({ width: 8, height: 8, borderRadius: 2, background: bg, display: "inline-block" });
const hintTxt: React.CSSProperties = { fontSize: 11, color: "#8b82ad", lineHeight: 1.4, marginTop: 2 };
const inlineLbl: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a59ec9" };
const miniBtn: React.CSSProperties = {
  background: "#231d36", color: "#f5d0fe", border: "1px solid #3c3259",
  borderRadius: 6, padding: "3px 8px", fontSize: 11, cursor: "pointer",
};
const checkLbl: React.CSSProperties = { display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#e9d5ff", cursor: "pointer" };
const labelCol: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 5, fontSize: 12, color: "#d8cff5" };
const inputStyle: React.CSSProperties = { background: "#0c0b12", color: "#ede9fe", border: "1px solid #322b4d", borderRadius: 6, padding: "6px 8px", fontSize: 12, width: "100%" };
const segBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(255, 117, 181, 0.20)" : "transparent",
  color: active ? "#ff99c8" : "#a59ec9",
  border: active ? "1px solid rgba(255, 117, 181, 0.45)" : "1px solid transparent",
  borderRadius: 5, padding: "5px 11px", fontSize: 12, fontWeight: 600, cursor: "pointer",
});
const btnStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(255, 117, 181, 0.18)" : "#1b1729",
  color: active ? "#ff99c8" : "#ddd6fe",
  border: `1px solid ${active ? "#ff75b5" : "#322b4d"}`,
  borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer",
});
const pillStyle = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(255, 117, 181, 0.16)" : "transparent",
  color: active ? "#ff75b5" : "#a59ec9",
  border: `1px solid ${active ? "#ff75b5" : "#2b2542"}`,
  borderRadius: 999, padding: "3px 10px", fontSize: 12, cursor: "pointer",
});
