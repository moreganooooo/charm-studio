import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  Cloud,
  Folder,
  Link2,
  Moon,
  Palette,
  Search,
  Sparkles,
  Sun,
} from "lucide-react";
import { encodeShareHash } from "../persistence";
import { listLocalProjects, listPublicCloudProjects, type StudioProject } from "../projectsStore";
import { buildHref, useRouter } from "../router";
import { applyPaletteTokens, useStudioStore } from "../store/studioStore";
import { TEMPLATES, type StudioTemplate } from "../templates";
import { TerminalViewport } from "../TerminalViewport";
import { SiteNavBar } from "./SiteNavBar";
import { CHARM_TOKENS, pillStyle, studioStyles } from "./studioStyles";

type GalleryCategory = "All" | "Dashboards" | "Forms & Prompts" | "Docs & Logs" | "SSH & Wish";

const TEMPLATE_META: Record<
  string,
  { category: Exclude<GalleryCategory, "All">; description: string; tags: string[] }
> = {
  "infra-dashboard": {
    category: "Dashboards",
    description: "Collapsible navigation list beside an interactive Bubbles v2 data table and status bar.",
    tags: ["bubble:list", "bubble:table", "collapseBelow"],
  },
  "log-viewer": {
    category: "Docs & Logs",
    description: "Live text-input filter bar stacked above a scrollable viewport log stream and footer.",
    tags: ["bubble:textinput", "bubble:viewport"],
  },
  "lazygit-kanban": {
    category: "Dashboards",
    description: "Classic 3-pane split with stacked files/branches on the left and full-height diff viewer.",
    tags: ["JoinHorizontal", "JoinVertical", "bubble:viewport"],
  },
  "wizard-card": {
    category: "Forms & Prompts",
    description: "CLI welcome shell with hero banner, progress list, and interactive prompt box.",
    tags: ["bubble:list", "bubble:textinput"],
  },
  "glow-reader": {
    category: "Docs & Logs",
    description: "Markdown file navigator paired with live Glamour syntax-styled terminal rendering.",
    tags: ["glamour:markdown", "bubble:list"],
  },
  "huh-onboarding": {
    category: "Forms & Prompts",
    description: "Interactive Huh v2 multi-field onboarding form coupled with a live summary pane.",
    tags: ["huh:form", "LightDark", "tea.View"],
  },
  "gum-pipeline": {
    category: "Forms & Prompts",
    description: "Visual Choose & Confirm prompt chain that exports a ready-to-run gum.sh shell script.",
    tags: ["gum:choose", "gum:confirm", "gum.sh"],
  },
  "wish-ssh-portal": {
    category: "SSH & Wish",
    description: "Hosted SSH TUI portal with session banner, repo browser, and runnable Wish server export.",
    tags: ["wish:ssh", "glamour:markdown"],
  },
};

const CATEGORIES: GalleryCategory[] = ["All", "Dashboards", "Forms & Prompts", "Docs & Logs", "SSH & Wish"];

export function GalleryPage() {
  const { navigate, markVisited } = useRouter();
  const {
    allPalettes,
    paletteId,
    selectPalette,
    loadTemplate,
    commitIr,
    setSelectedId,
    setTemplateId,
    setPaletteId,
    fontFamily,
  } = useStudioStore();

  const [category, setCategory] = useState<GalleryCategory>("All");
  const [query, setQuery] = useState("");
  const [polarityFilter, setPolarityFilter] = useState<"all" | "dark" | "light">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previewTick, setPreviewTick] = useState(0);

  const [localProjects] = useState<StudioProject[]>(() => listLocalProjects());
  const [publicCloudProjects, setPublicCloudProjects] = useState<StudioProject[]>([]);
  const [cloudLoaded, setCloudLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void listPublicCloudProjects(12).then((list) => {
      if (active) {
        setPublicCloudProjects(list);
        setCloudLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const activePalette = useMemo(
    () => allPalettes.find((p) => p.id === paletteId) ?? allPalettes[0],
    [allPalettes, paletteId]
  );

  const visiblePalettes = useMemo(() => {
    if (polarityFilter === "all") return allPalettes;
    return allPalettes.filter((p) => (polarityFilter === "dark" ? p.darkBG : !p.darkBG));
  }, [allPalettes, polarityFilter]);

  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return TEMPLATES.filter((t) => {
      const meta = TEMPLATE_META[t.id];
      if (category !== "All" && meta?.category !== category) return false;
      if (!q) return true;
      return (
        t.label.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (meta?.description ?? "").toLowerCase().includes(q) ||
        (meta?.tags ?? []).some((tag) => tag.toLowerCase().includes(q))
      );
    });
  }, [category, query]);

  const handleRemixTemplate = (tpl: StudioTemplate) => {
    loadTemplate(tpl.id);
    markVisited();
    navigate("/studio");
  };

  const handleShareTemplate = async (tpl: StudioTemplate) => {
    const styledDoc = applyPaletteTokens(tpl.doc, activePalette);
    const encoded = await encodeShareHash({
      ir: styledDoc,
      paletteId: activePalette.id,
      templateId: tpl.id,
    });
    const url = `${window.location.origin}${buildHref("/studio")}#s=${encodeURIComponent(encoded)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(tpl.id);
      setTimeout(() => setCopiedId((cur) => (cur === tpl.id ? null : cur)), 1800);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  };

  const handleOpenSavedProject = (proj: StudioProject) => {
    commitIr(proj.ir);
    setPaletteId(proj.paletteId);
    setTemplateId(proj.templateId);
    setSelectedId(proj.ir.root.id);
    markVisited();
    navigate("/studio");
  };

  const communityAndLocal = useMemo(() => {
    const seen = new Set<string>();
    const combined: StudioProject[] = [];
    for (const p of [...publicCloudProjects, ...localProjects]) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      combined.push(p);
    }
    return combined;
  }, [publicCloudProjects, localProjects]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: CHARM_TOKENS.bgGround,
        color: CHARM_TOKENS.text,
        fontFamily: CHARM_TOKENS.fontUi,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <SiteNavBar />

      <main
        style={{
          flex: 1,
          width: "min(1260px, 100%)",
          margin: "0 auto",
          padding: "32px 24px 64px",
          display: "flex",
          flexDirection: "column",
          gap: 32,
        }}
      >
        {/* Header */}
        <section style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 18, flexWrap: "wrap" }}>
          <div>
            <div className="cs-mono" style={{ fontSize: 11, fontWeight: 700, color: CHARM_TOKENS.mint, letterSpacing: "0.06em" }}>
              SCENES &amp; THEME GALLERY
            </div>
            <h1 style={{ margin: "6px 0 8px", fontSize: "clamp(1.7rem, 2.8vw, 2.35rem)", fontWeight: 800, letterSpacing: "-0.025em", color: CHARM_TOKENS.textHeading }}>
              Live Go WASM Scenes &amp; Adaptive Palettes
            </h1>
            <p style={{ margin: 0, fontSize: 14.5, color: CHARM_TOKENS.textMuted, maxWidth: 640, lineHeight: 1.55 }}>
              Preview every template rendered by compiled <code className="cs-mono">lipgloss/v2</code> &amp;{" "}
              <code className="cs-mono">bubbles/v2</code>, swap adaptive Light/Dark palettes live, or remix any layout straight into Studio.
            </p>
          </div>

          <div style={{ position: "relative", width: "min(300px, 100%)" }}>
            <Search size={14} style={{ position: "absolute", left: 11, top: 11, color: CHARM_TOKENS.textDim }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter scenes or packages…"
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                borderRadius: 9,
                background: CHARM_TOKENS.bgSurface,
                border: `1px solid ${CHARM_TOKENS.border}`,
                color: CHARM_TOKENS.text,
                fontSize: 13,
              }}
            />
          </div>
        </section>

        {/* Theme & Polarity Strip */}
        <section
          aria-label="Theme and polarity preview strip"
          style={{
            background: CHARM_TOKENS.bgSurface,
            border: `1px solid ${CHARM_TOKENS.border}`,
            borderRadius: 14,
            padding: 16,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
              <Palette size={15} style={{ color: CHARM_TOKENS.pink }} />
              <span>Preview Theme &amp; Polarity</span>
              <span className="cs-mono" style={{ fontSize: 11.5, color: CHARM_TOKENS.textMuted, fontWeight: 500 }}>
                ({activePalette.label})
              </span>
            </div>

            <div
              style={{
                display: "inline-flex",
                background: "var(--cs-input)",
                border: `1px solid ${CHARM_TOKENS.border}`,
                borderRadius: 8,
                padding: 2,
                gap: 2,
              }}
            >
              {(["all", "dark", "light"] as const).map((mode) => {
                const active = polarityFilter === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setPolarityFilter(mode)}
                    style={{
                      border: "none",
                      borderRadius: 6,
                      padding: "4px 10px",
                      fontSize: 11.5,
                      fontWeight: active ? 700 : 600,
                      background: active ? CHARM_TOKENS.pinkBg : "transparent",
                      color: active ? CHARM_TOKENS.pinkSoft : CHARM_TOKENS.textMuted,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    {mode === "dark" && <Moon size={12} />}
                    {mode === "light" && <Sun size={12} />}
                    <span style={{ textTransform: "capitalize" }}>{mode}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {visiblePalettes.map((pal) => {
              const active = pal.id === activePalette.id;
              return (
                <button
                  key={pal.id}
                  onClick={() => selectPalette(pal.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "7px 11px",
                    borderRadius: 9,
                    background: active ? CHARM_TOKENS.pinkBg : "var(--cs-input)",
                    border: `1px solid ${active ? CHARM_TOKENS.pink : CHARM_TOKENS.borderSubtle}`,
                    color: active ? CHARM_TOKENS.textHeading : CHARM_TOKENS.textBody,
                    fontSize: 12,
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: pal.background, border: "1px solid rgba(255,255,255,0.2)" }} />
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: pal.tokens.accent }} />
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: pal.tokens.modalGlow }} />
                  </span>
                  <span>{pal.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Category Filters */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {CATEGORIES.map((cat) => (
            <button key={cat} onClick={() => setCategory(cat)} style={pillStyle(category === cat)}>
              {cat}
            </button>
          ))}
        </div>

        {/* Templates Showcase Grid */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: 20,
          }}
        >
          {filteredTemplates.map((tpl) => {
            const meta = TEMPLATE_META[tpl.id];
            const previewDoc = applyPaletteTokens(tpl.doc, activePalette);
            const isCopied = copiedId === tpl.id;
            return (
              <article
                key={tpl.id}
                style={{
                  background: CHARM_TOKENS.bgSurface,
                  border: `1px solid ${CHARM_TOKENS.border}`,
                  borderRadius: 16,
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
                      {tpl.label}
                    </h2>
                    <p style={{ margin: "4px 0 0", fontSize: 12.5, lineHeight: 1.45, color: CHARM_TOKENS.textMuted }}>
                      {meta?.description}
                    </p>
                  </div>
                  {meta && (
                    <span
                      className="cs-mono"
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: CHARM_TOKENS.bgCode,
                        color: CHARM_TOKENS.lilac,
                        border: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {meta.category}
                    </span>
                  )}
                </div>

                {/* Live Go WASM Mini Terminal Preview */}
                <div style={{ display: "flex", justifyContent: "center", overflowX: "auto", padding: "4px 0" }}>
                  <TerminalViewport
                    title={tpl.id}
                    doc={previewDoc}
                    renderTick={previewTick}
                    cols={52}
                    rows={12}
                    fontSize={9.5}
                    fontFamily={fontFamily}
                    palette={activePalette}
                    colorProfile="truecolor"
                    showOverlay={false}
                    overlayMode="none"
                    selectedId={tpl.defaultSelectedId}
                    onSelect={() => {}}
                    onInteract={() => setPreviewTick((n) => n + 1)}
                  />
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(meta?.tags ?? []).map((tag) => (
                    <code
                      key={tag}
                      className="cs-mono"
                      style={{
                        fontSize: 10.5,
                        padding: "2px 7px",
                        borderRadius: 5,
                        background: "var(--cs-input)",
                        color: CHARM_TOKENS.mint,
                        border: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                      }}
                    >
                      {tag}
                    </code>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: "auto", paddingTop: 4 }}>
                  <button
                    onClick={() => void handleShareTemplate(tpl)}
                    style={studioStyles.secondaryBtn}
                  >
                    {isCopied ? <Check size={13} style={{ color: CHARM_TOKENS.mint }} /> : <Link2 size={13} />}
                    <span>{isCopied ? "Link Copied" : "Share Link"}</span>
                  </button>

                  <button
                    onClick={() => handleRemixTemplate(tpl)}
                    style={studioStyles.primaryCta}
                  >
                    <span>Remix in Studio</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </article>
            );
          })}
        </section>

        {/* Community & Cloud Projects Shelf */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Cloud size={17} style={{ color: CHARM_TOKENS.lilac }} />
              <h2 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: CHARM_TOKENS.textHeading }}>
                Community &amp; Saved Projects
              </h2>
            </div>
            <span style={{ fontSize: 12, color: CHARM_TOKENS.textDim }}>
              {cloudLoaded && publicCloudProjects.length > 0
                ? `${publicCloudProjects.length} public cloud project(s) · ${localProjects.length} local`
                : `${localProjects.length} locally saved snapshot(s)`}
            </span>
          </div>

          {communityAndLocal.length === 0 ? (
            <div
              style={{
                padding: 20,
                borderRadius: 14,
                background: CHARM_TOKENS.bgSurface,
                border: `1px solid ${CHARM_TOKENS.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Sparkles size={16} style={{ color: CHARM_TOKENS.mint }} />
                <span style={{ fontSize: 13.5, color: CHARM_TOKENS.textMuted }}>
                  No saved or public cloud snapshots yet. Open any scene in Studio and save via More → Saved Projects.
                </span>
              </div>
              <button onClick={() => navigate("/studio")} style={studioStyles.secondaryBtn}>
                <span>Open Studio</span>
                <ArrowRight size={13} />
              </button>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: 14,
              }}
            >
              {communityAndLocal.map((proj) => (
                <div
                  key={proj.id}
                  style={{
                    padding: 16,
                    borderRadius: 14,
                    background: CHARM_TOKENS.bgSurface,
                    border: `1px solid ${CHARM_TOKENS.border}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14.5, fontWeight: 700, color: CHARM_TOKENS.textHeading }}>
                      {proj.name}
                    </span>
                    <span
                      className="cs-mono"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 10.5,
                        padding: "2px 7px",
                        borderRadius: 6,
                        background: proj.source === "cloud" ? CHARM_TOKENS.mintBg : "var(--cs-input)",
                        color: proj.source === "cloud" ? CHARM_TOKENS.mint : CHARM_TOKENS.textMuted,
                      }}
                    >
                      {proj.source === "cloud" ? <Cloud size={11} /> : <Folder size={11} />}
                      <span>{proj.source === "cloud" ? "Public Cloud" : "Local"}</span>
                    </span>
                  </div>

                  <div className="cs-mono" style={{ fontSize: 11.5, color: CHARM_TOKENS.textDim }}>
                    {proj.templateId} · {proj.paletteId}
                  </div>

                  <button
                    onClick={() => handleOpenSavedProject(proj)}
                    style={{ ...studioStyles.secondaryBtn, alignSelf: "flex-start", marginTop: "auto" }}
                  >
                    <span>Open in Studio</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
