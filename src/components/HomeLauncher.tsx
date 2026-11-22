import { useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, FolderUp } from "lucide-react";
import { fetchGitHubRepoToIR } from "../githubImportHelper";
import { buildIRFromExtracted, extractFromGoSourceAsync } from "../goImporter";
import { RouteLink, useRouter } from "../router";
import { PALETTES, useStudioStore } from "../store/studioStore";
import { TEMPLATES } from "../templates";
import { TerminalViewport } from "../TerminalViewport";
import type { IRDoc, StudioLens } from "../types";
import { SiteNavBar } from "./SiteNavBar";
import { CHARM_TOKENS } from "./studioStyles";

interface StarterSceneCard {
  templateId: string;
  title: string;
  selectedId: string;
}

const STARTER_SCENES: StarterSceneCard[] = [
  { templateId: "infra-dashboard", title: "Infra Dashboard", selectedId: "mainPane" },
  { templateId: "lazygit-kanban", title: "3-Pane Git", selectedId: "diffPane" },
  { templateId: "huh-onboarding", title: "Huh Form", selectedId: "huhFormPane" },
  { templateId: "glow-reader", title: "Glow Docs", selectedId: "markdownPane" },
];

const SPACING_PRESETS: Record<1 | 2 | 3, { pad: [number, number, number, number]; goArgs: string }> = {
  1: { pad: [0, 1, 0, 1], goArgs: "0, 1" },
  2: { pad: [1, 2, 1, 2], goArgs: "1, 2" },
  3: { pad: [2, 4, 2, 4], goArgs: "2, 4" },
};

export function HomeLauncher() {
  const { navigate, markVisited } = useRouter();
  const { loadTemplate, commitIr, setSelectedId, setTemplateId, fontFamily, appMode } = useStudioStore();

  // Hero showcase interactive state
  const [previewLens, setPreviewLens] = useState<StudioLens>("hybrid");
  const [spacingPreset, setSpacingPreset] = useState<1 | 2 | 3>(2);
  const [previewSelectedId, setPreviewSelectedId] = useState("mainPane");
  const [previewTick, setPreviewTick] = useState(0);

  // Fast-track import input
  const [importInput, setImportInput] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Bottom card hover state
  const [hoveredSceneId, setHoveredSceneId] = useState<string | null>(null);

  const showcasePalette = useMemo(() => {
    if (appMode === "light") {
      return PALETTES.find((p) => p.id === "tokyo-light") ?? PALETTES[0];
    }
    return PALETTES[0];
  }, [appMode]);

  const showcaseDoc = useMemo<IRDoc>(() => {
    const baseTemplate = TEMPLATES.find((t) => t.id === "infra-dashboard") ?? TEMPLATES[0];
    const cloned = structuredClone(baseTemplate.doc);
    const pad = SPACING_PRESETS[spacingPreset].pad;
    if (cloned.styles.main) cloned.styles.main.padding = pad;
    if (cloned.styles.sidebar) {
      cloned.styles.sidebar.padding = [pad[0], Math.max(1, pad[1] - 1), pad[2], Math.max(1, pad[3] - 1)];
    }
    return cloned;
  }, [spacingPreset]);

  const handleOpenTemplate = (templateId: string) => {
    loadTemplate(templateId);
    markVisited();
    navigate("/studio");
  };

  const handleFastImport = async () => {
    const raw = importInput.trim();
    if (!raw) {
      setImportError("Paste a GitHub repo URL (e.g. dlvhdr/gh-dash), Go code, or drop a styles.go file.");
      return;
    }
    setImportError(null);
    setImportBusy(true);
    try {
      const looksLikeGoCode = /\b(package\s+\w+|lipgloss\.|func\s+)/.test(raw);
      if (looksLikeGoCode) {
        const summary = await extractFromGoSourceAsync(raw);
        const { doc, firstNodeId } = buildIRFromExtracted(summary, "pasted.go");
        commitIr(doc);
        setSelectedId(firstNodeId);
        setTemplateId("custom-import");
      } else {
        const { doc, firstNodeId } = await fetchGitHubRepoToIR(raw);
        commitIr(doc);
        setSelectedId(firstNodeId);
        setTemplateId("custom-import");
      }
      markVisited();
      navigate("/studio");
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImportError(null);
    setImportBusy(true);
    try {
      const first = files[0];
      if (files.length === 1 && first.name.endsWith(".json")) {
        const parsed = JSON.parse(await first.text()) as IRDoc;
        if (!parsed.root || !parsed.styles) {
          throw new Error("File is not a valid Charm Studio ir.json document.");
        }
        commitIr(parsed);
        setSelectedId(parsed.root.id);
        markVisited();
        navigate("/studio");
        return;
      }
      const contents = await Promise.all(Array.from(files).map((f) => f.text()));
      const summary = await extractFromGoSourceAsync(contents.join("\n\n"));
      const { doc, firstNodeId } = buildIRFromExtracted(summary, first.name);
      commitIr(doc);
      setSelectedId(firstNodeId);
      setTemplateId("custom-import");
      markVisited();
      navigate("/studio");
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImportBusy(false);
    }
  };

  const isDark = appMode === "dark";
  const currentGoArgs = SPACING_PRESETS[spacingPreset].goArgs;

  return (
    <div
      style={{
        minHeight: "100vh",
        position: "relative",
        overflowX: "hidden",
        background: isDark
          ? "radial-gradient(ellipse 46% 52% at 24% 52%, rgba(255, 94, 174, 0.14) 0%, rgba(21, 15, 29, 0) 70%), radial-gradient(ellipse 42% 48% at 72% 40%, rgba(185, 162, 255, 0.12) 0%, rgba(21, 15, 29, 0) 72%), #140d1c"
          : CHARM_TOKENS.bgGround,
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
          width: "min(1240px, 100%)",
          margin: "0 auto",
          padding: "clamp(28px, 4.5vh, 52px) clamp(20px, 4vw, 44px) 44px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: "clamp(32px, 4.5vh, 52px)",
        }}
      >
        {/* HERO SPLIT STAGE */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
            gap: "clamp(28px, 4vw, 54px)",
            alignItems: "center",
          }}
        >
          {/* LEFT COLUMN: Stacked Display Title + Subtitle + CTAs + Glowing Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 480 }}>
            <h1
              style={{
                margin: 0,
                fontSize: "clamp(3.15rem, 5.4vw, 4.65rem)",
                fontWeight: 800,
                lineHeight: 0.96,
                letterSpacing: "-0.038em",
                color: CHARM_TOKENS.textHeading,
              }}
            >
              Charm
              <br />
              Studio
            </h1>

            <p
              style={{
                margin: 0,
                fontSize: "clamp(1rem, 1.35vw, 1.18rem)",
                lineHeight: 1.48,
                color: CHARM_TOKENS.textMuted,
                maxWidth: 360,
              }}
            >
              An integrated creative terminal
              <br />
              for developers.
            </p>

            {/* Primary & Secondary CTAs */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", paddingTop: 2 }}>
              <button
                onClick={() => navigate("/studio")}
                style={{
                  background: "linear-gradient(135deg, #ff5eae 0%, #ff82c3 100%)",
                  color: "#150f1d",
                  border: "1px solid rgba(255, 168, 214, 0.65)",
                  borderRadius: 11,
                  padding: "11px 20px",
                  fontSize: 14,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  boxShadow: "0 10px 28px rgba(255, 94, 174, 0.36)",
                }}
              >
                <span>Open Studio</span>
                <ArrowUpRight size={16} strokeWidth={2.4} />
              </button>

              <RouteLink
                to="/desktop"
                style={{
                  textDecoration: "none",
                  background: isDark ? "rgba(32, 22, 45, 0.72)" : CHARM_TOKENS.bgSurface,
                  color: CHARM_TOKENS.textHeading,
                  border: `1px solid ${isDark ? "rgba(185, 162, 255, 0.36)" : CHARM_TOKENS.borderStrong}`,
                  borderRadius: 11,
                  padding: "11px 18px",
                  fontSize: 14,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
                }}
              >
                Desktop Companion
              </RouteLink>
            </div>

            {/* Sleek Glowing Import Input Bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  void handleFiles(e.dataTransfer.files);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 8px 5px 15px",
                  borderRadius: 13,
                  background: isDark ? "rgba(21, 14, 30, 0.9)" : CHARM_TOKENS.bgSurface,
                  border: `1.5px solid ${
                    dragActive
                      ? CHARM_TOKENS.mint
                      : isDark
                      ? "rgba(255, 94, 174, 0.65)"
                      : CHARM_TOKENS.pink
                  }`,
                  boxShadow: dragActive
                    ? "0 0 28px rgba(109, 255, 194, 0.28)"
                    : "0 0 28px rgba(255, 94, 174, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
                }}
              >
                <input
                  value={importInput}
                  onChange={(e) => setImportInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleFastImport();
                  }}
                  placeholder="Paste GitHub repo URL or drop styles.go..."
                  aria-label="Paste GitHub repo URL or drop styles.go"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: CHARM_TOKENS.textHeading,
                    fontSize: 13.5,
                    padding: "7px 0",
                  }}
                />

                <label
                  title="Choose .go or ir.json file"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    color: CHARM_TOKENS.textMuted,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <FolderUp size={15} />
                  <input
                    type="file"
                    multiple
                    accept=".go,.json"
                    onChange={(e) => void handleFiles(e.target.files)}
                    style={{ display: "none" }}
                  />
                </label>

                <button
                  onClick={() => void handleFastImport()}
                  disabled={importBusy}
                  aria-label="Import and open in Studio"
                  title="Import into Studio"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 32,
                    height: 32,
                    borderRadius: 9,
                    border: "none",
                    background: importInput.trim() ? CHARM_TOKENS.pinkBg : "transparent",
                    color: importInput.trim() ? CHARM_TOKENS.pinkSoft : CHARM_TOKENS.textHeading,
                    flexShrink: 0,
                  }}
                >
                  <ArrowRight size={16} />
                </button>
              </div>

              {importError && (
                <div style={{ fontSize: 12, color: "#fda4af", paddingLeft: 4 }}>
                  {importError}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Layered Live WASM Terminal + Floating Lens Pill + Overlapping Go Snippet */}
          <div
            style={{
              position: "relative",
              padding: "16px 8px 66px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            {/* Faint Terminal Grid Backdrop */}
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: -12,
                backgroundImage: isDark
                  ? "linear-gradient(to right, rgba(185, 162, 255, 0.055) 1px, transparent 1px), linear-gradient(to bottom, rgba(185, 162, 255, 0.055) 1px, transparent 1px)"
                  : "linear-gradient(to right, rgba(109, 74, 255, 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(109, 74, 255, 0.06) 1px, transparent 1px)",
                backgroundSize: "24px 24px",
                maskImage: "radial-gradient(ellipse 85% 80% at 52% 48%, #000 45%, transparent 100%)",
                WebkitMaskImage: "radial-gradient(ellipse 85% 80% at 52% 48%, #000 45%, transparent 100%)",
                pointerEvents: "none",
              }}
            />

            {/* Crisp Minimal Sparkle Accents */}
            <span aria-hidden="true" className="cs-mono" style={{ position: "absolute", left: 4, top: 28, fontSize: 14, color: CHARM_TOKENS.mint, opacity: 0.8 }}>+</span>
            <span aria-hidden="true" className="cs-mono" style={{ position: "absolute", right: 12, bottom: 94, fontSize: 13, color: CHARM_TOKENS.pink, opacity: 0.75 }}>+</span>

            {/* Real Go WASM Terminal Frame */}
            <div
              style={{
                position: "relative",
                maxWidth: "100%",
                zIndex: 2,
                filter: "drop-shadow(0 26px 48px rgba(0, 0, 0, 0.55))",
              }}
            >
              <TerminalViewport
                title=""
                chrome="minimal"
                headerRightSlot={
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: 2,
                      borderRadius: 7,
                      background: "rgba(15, 10, 22, 0.75)",
                      border: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                    }}
                  >
                    <span className="cs-mono" style={{ fontSize: 10, color: CHARM_TOKENS.textDim, padding: "0 4px" }}>
                      Pad
                    </span>
                    {([1, 2, 3] as const).map((lvl) => {
                      const active = spacingPreset === lvl;
                      return (
                        <button
                          key={lvl}
                          onClick={() => setSpacingPreset(lvl)}
                          className="cs-mono"
                          title={`Padding(${SPACING_PRESETS[lvl].goArgs})`}
                          style={{
                            border: "none",
                            borderRadius: 5,
                            padding: "2px 7px",
                            fontSize: 10.5,
                            fontWeight: 700,
                            background: active ? CHARM_TOKENS.mintBg : "transparent",
                            color: active ? CHARM_TOKENS.mint : CHARM_TOKENS.textMuted,
                          }}
                        >
                          {lvl}
                        </button>
                      );
                    })}
                  </div>
                }
                doc={showcaseDoc}
                renderTick={previewTick}
                cols={58}
                rows={16}
                fontSize={10}
                fontFamily={fontFamily}
                palette={showcasePalette}
                colorProfile="truecolor"
                showOverlay={previewLens !== "visual"}
                overlayMode={
                  previewLens === "visual"
                    ? "none"
                    : previewLens === "hybrid"
                    ? "padding-band"
                    : "full-box-model"
                }
                selectedId={previewSelectedId}
                onSelect={setPreviewSelectedId}
                onInteract={() => setPreviewTick((t) => t + 1)}
              />
            </div>

            {/* Floating Center Visual / Hybrid / Code Pill */}
            <div
              role="group"
              aria-label="Preview lens mode"
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                bottom: 108,
                zIndex: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: 4,
                borderRadius: 999,
                background: isDark ? "rgba(21, 14, 32, 0.9)" : "rgba(255, 255, 255, 0.92)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(109, 255, 194, 0.45)",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.55), 0 0 20px rgba(109, 255, 194, 0.18)",
              }}
            >
              {(["visual", "hybrid", "code"] as StudioLens[]).map((lens) => {
                const active = previewLens === lens;
                return (
                  <button
                    key={lens}
                    onClick={() => setPreviewLens(lens)}
                    style={{
                      border: "none",
                      borderRadius: 999,
                      padding: "6px 15px",
                      fontSize: 12.5,
                      fontWeight: active ? 700 : 600,
                      textTransform: "capitalize",
                      background: active
                        ? "linear-gradient(135deg, #6dffc2 0%, #52ebcc 100%)"
                        : "transparent",
                      color: active ? "#0e1714" : CHARM_TOKENS.text,
                      boxShadow: active ? "0 0 14px rgba(109, 255, 194, 0.35)" : "none",
                      transition: "all 140ms ease",
                    }}
                  >
                    {lens}
                  </button>
                );
              })}
            </div>

            {/* Overlapping Bottom-Right Go Code Snippet Card */}
            <div
              style={{
                position: "absolute",
                right: 14,
                bottom: 0,
                zIndex: 7,
                width: "min(335px, 88%)",
                borderRadius: 13,
                background: isDark ? "rgba(17, 12, 26, 0.94)" : CHARM_TOKENS.bgSurface,
                backdropFilter: "blur(14px)",
                border: `1px solid ${isDark ? "rgba(185, 162, 255, 0.32)" : CHARM_TOKENS.borderStrong}`,
                boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 22px 48px rgba(0, 0, 0, 0.65)",
                padding: "13px 16px",
              }}
            >
              <pre
                className="cs-mono"
                style={{
                  margin: 0,
                  fontSize: 12.5,
                  lineHeight: 1.65,
                  color: CHARM_TOKENS.text,
                  whiteSpace: "pre",
                  overflowX: "auto",
                }}
              >
                <span style={{ color: CHARM_TOKENS.pinkSoft }}>{"// ui/theme_gen.go\n"}</span>
                <span>{"s := lipgloss."}</span>
                <span style={{ color: CHARM_TOKENS.lilac }}>{"NewStyle"}</span>
                <span>{"().\n    "}</span>
                <span
                  style={{
                    display: "inline-block",
                    padding: "0px 6px",
                    borderRadius: 5,
                    background:
                      previewLens === "visual"
                        ? CHARM_TOKENS.mintBg
                        : "linear-gradient(135deg, #6dffc2 0%, #52ebcc 100%)",
                    color: previewLens === "visual" ? CHARM_TOKENS.mint : "#0e1714",
                    fontWeight: 700,
                    boxShadow:
                      previewLens === "visual" ? "none" : "0 0 14px rgba(109, 255, 194, 0.35)",
                  }}
                >
                  {`Padding(${currentGoArgs})`}
                </span>
              </pre>
            </div>
          </div>
        </section>

        {/* BOTTOM 4 STARTER SCENE CARDS (Real Live Go WASM Miniatures) */}
        <section aria-label="Starter scenes" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(235px, 1fr))",
              gap: 18,
            }}
          >
            {STARTER_SCENES.map((scene) => {
              const tpl = TEMPLATES.find((t) => t.id === scene.templateId) ?? TEMPLATES[0];
              const isHovered = hoveredSceneId === scene.templateId;
              return (
                <button
                  key={scene.templateId}
                  onClick={() => handleOpenTemplate(scene.templateId)}
                  onMouseEnter={() => setHoveredSceneId(scene.templateId)}
                  onMouseLeave={() => setHoveredSceneId(null)}
                  style={{
                    textAlign: "center",
                    background: isDark
                      ? "linear-gradient(180deg, rgba(35, 24, 52, 0.72) 0%, rgba(19, 13, 28, 0.92) 100%)"
                      : CHARM_TOKENS.bgSurface,
                    border: `1px solid ${
                      isHovered
                        ? CHARM_TOKENS.pinkBorder
                        : isDark
                        ? "rgba(185, 162, 255, 0.2)"
                        : CHARM_TOKENS.border
                    }`,
                    borderRadius: 16,
                    padding: "14px 14px 16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                    boxShadow: isHovered
                      ? "0 16px 34px rgba(0, 0, 0, 0.45), 0 0 20px rgba(255, 94, 174, 0.16)"
                      : "inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 10px 26px rgba(0, 0, 0, 0.28)",
                    transform: isHovered ? "translateY(-3px)" : "translateY(0)",
                    transition: "transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease",
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: isHovered ? CHARM_TOKENS.textHeading : CHARM_TOKENS.text,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {scene.title}
                  </span>

                  {/* Real Go WASM Miniature Preview */}
                  <div
                    style={{
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                      overflow: "hidden",
                      pointerEvents: "none",
                      borderRadius: 10,
                    }}
                  >
                    <TerminalViewport
                      title=""
                      chrome="minimal"
                      doc={tpl.doc}
                      renderTick={0}
                      cols={44}
                      rows={10}
                      fontSize={6.5}
                      fontFamily={fontFamily}
                      palette={showcasePalette}
                      colorProfile="truecolor"
                      showOverlay={false}
                      overlayMode="none"
                      selectedId={scene.selectedId}
                      onSelect={() => {}}
                      onInteract={() => {}}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 2 }}>
            <RouteLink
              to="/gallery"
              style={{
                textDecoration: "none",
                fontSize: 12.5,
                fontWeight: 600,
                color: CHARM_TOKENS.textMuted,
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span>Explore all 8 scenes &amp; themes</span>
              <ArrowRight size={13} />
            </RouteLink>
          </div>
        </section>
      </main>
    </div>
  );
}
