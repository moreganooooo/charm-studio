import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, FolderUp, Sparkle } from "lucide-react";
import { fetchGitHubRepoToIR } from "../githubImportHelper";
import { buildIRFromExtracted, extractFromGoSourceAsync } from "../goImporter";
import { RouteLink, useRouter } from "../router";
import { PALETTES, useStudioStore } from "../store/studioStore";
import { TEMPLATES } from "../templates";
import { TerminalViewport } from "../TerminalViewport";
import { findNode, type IRDoc, type StudioLens } from "../types";
import { SiteNavBar } from "./SiteNavBar";
import { CHARM_TOKENS } from "./studioStyles";
import "./HomeLauncher.css";

interface StarterSceneCard {
  templateId: string;
  title: string;
}

const STARTER_SCENES: StarterSceneCard[] = [
  { templateId: "infra-dashboard", title: "Infra Dashboard" },
  { templateId: "lazygit-kanban", title: "3-Pane Git" },
  { templateId: "huh-onboarding", title: "Huh Form" },
  { templateId: "glow-reader", title: "Glow Docs" },
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

  const stageRef = useRef<HTMLDivElement>(null);
  const [previewCols, setPreviewCols] = useState(58);

  // Size the live cell grid to its column without scaling the canvas or its hit targets.
  useEffect(() => {
    const stage = stageRef.current;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!stage || !ctx) return;
    const observer = new ResizeObserver(([entry]) => {
      ctx.font = `10px ${fontFamily}`;
      const cellWidth = Math.ceil(ctx.measureText("M").width * 10) / 10;
      const frameChrome = 14; // Two 6px insets and two 1px borders.
      setPreviewCols(Math.max(1, Math.min(84, Math.floor((entry.contentRect.width - frameChrome) / cellWidth))));
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [fontFamily]);

  // Fast-track import input
  const [importInput, setImportInput] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

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
    const status = findNode(cloned, "statusBar");
    if (status && previewCols < 70) status.content = "Click a pane · ↑/↓ or j/k to navigate";
    return cloned;
  }, [spacingPreset, previewCols]);

  const handleOpenTemplate = (templateId: string) => {
    loadTemplate(templateId);
    markVisited();
    navigate("/studio");
  };

  const handleFastImport = async () => {
    if (importBusy) return;
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
    if (importBusy || !files?.length) return;
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

  const currentGoArgs = SPACING_PRESETS[spacingPreset].goArgs;

  return (
    <div
      className="launcher"
      style={{
        minHeight: "100vh",
        position: "relative",
        overflowX: "hidden",
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
          justifyContent: "center",
          gap: "clamp(44px, 7.5vh, 88px)",
        }}
      >
        {/* HERO SPLIT STAGE */}
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
            gap: "clamp(28px, 4vw, 54px)",
            alignItems: "center",
          }}
        >
          {/* LEFT COLUMN: Stacked Display Title + Subtitle + CTAs + Glowing Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 480 }}>
            <h1 className="launcher-wordmark"
              style={{
                margin: 0,
                fontSize: "clamp(3.65rem, 7vw, 5.65rem)",
                fontWeight: 800,
                lineHeight: 0.98,
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
                className="launcher-cta launcher-open"
                onClick={() => navigate("/studio")}
              >
                <span>Open Studio</span>
                <ArrowUpRight size={16} strokeWidth={2.4} />
              </button>

              <RouteLink to="/desktop" className="launcher-cta launcher-companion">
                Desktop Companion
              </RouteLink>
            </div>

            {/* Sleek Glowing Import Input Bar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4 }}>
              <form
                className="launcher-import"
                aria-label="Import into Studio"
                aria-busy={importBusy}
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleFastImport();
                }}
                data-drag-active={dragActive}
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
              >
                <input
                  value={importInput}
                  onChange={(e) => {
                    setImportInput(e.target.value);
                    setImportError(null);
                  }}
                  readOnly={importBusy}
                  placeholder="GitHub URL or drop a file"
                  aria-label="GitHub repository URL or Go source code"
                  aria-describedby={importError ? "launcher-import-error" : undefined}
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

                <label className="launcher-file-picker" title="Choose Go files or an ir.json file">
                  <FolderUp size={16} aria-hidden="true" />
                  <input
                    type="file"
                    multiple
                    accept=".go,.json"
                    aria-label="Choose Go files or an ir.json file"
                    disabled={importBusy}
                    onChange={(event) => {
                      void handleFiles(event.currentTarget.files);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>

                <button
                  type="submit"
                  className="launcher-submit"
                  disabled={importBusy}
                  aria-label="Import and open in Studio"
                  title="Import into Studio"
                >
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </form>
              <div className="launcher-import-status" role="status">
                {importBusy ? "Importing into Studio…" : ""}
              </div>
              {importError && (
                <div id="launcher-import-error" className="launcher-import-error" role="alert">
                  {importError}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Live WASM terminal, floating lens controls and Go snippet */}
          <div className="launcher-stage" ref={stageRef}>
            <Sparkle className="launcher-glint launcher-glint-mint" size={13} aria-hidden="true" />
            <Sparkle className="launcher-glint launcher-glint-pink" size={9} aria-hidden="true" />

            {/* Real Go WASM Terminal Frame */}
            <div className="launcher-terminal">
              <TerminalViewport
                title=""
                chrome="minimal"
                pageKeyboardNavigation
                headerRightSlot={
                  <div
                    role="group"
                    aria-label="Preview padding"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 3,
                      padding: 2,
                      borderRadius: 7,
                      background: CHARM_TOKENS.bgCode,
                      border: `1px solid ${CHARM_TOKENS.borderSubtle}`,
                    }}
                  >
                    <span className="cs-mono" style={{ fontSize: 11, color: CHARM_TOKENS.textMuted, padding: "0 4px" }}>
                      Pad
                    </span>
                    {([1, 2, 3] as const).map((lvl) => {
                      const active = spacingPreset === lvl;
                      return (
                        <button
                          key={lvl}
                          onClick={() => setSpacingPreset(lvl)}
                          aria-pressed={active}
                          className="launcher-preset cs-mono"
                          aria-label={`Preset ${lvl}: Padding(${SPACING_PRESETS[lvl].goArgs})`}
                          title={`Padding(${SPACING_PRESETS[lvl].goArgs})`}
                          style={{
                            border: "none",
                            borderRadius: 5,
                            padding: "2px 7px",
                            fontSize: 12,
                            fontWeight: 700,
                            background: active ? CHARM_TOKENS.mintBg : "transparent",
                            color: active ? CHARM_TOKENS.textHeading : CHARM_TOKENS.textMuted,
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
                cols={previewCols}
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

              <div className="launcher-lenses" role="group" aria-label="Preview lens mode">
                {(["visual", "hybrid", "code"] as StudioLens[]).map((lens) => {
                  const active = previewLens === lens;
                  return (
                    <button
                      key={lens}
                      onClick={() => setPreviewLens(lens)}
                      aria-pressed={active}
                      style={{
                        border: "none",
                        borderRadius: 999,
                        padding: "7px clamp(12px, 1.2vw, 20px)",
                        fontSize: 12.5,
                        fontWeight: active ? 700 : 600,
                        textTransform: "capitalize",
                        background: active
                          ? "linear-gradient(105deg, #ff79bc, #e3b1da 46%, #75f3c6)"
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
            </div>

            <div className="launcher-snippet">
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
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 248px), 1fr))",
              gap: 18,
            }}
          >
            {STARTER_SCENES.map((scene) => {
              const tpl = TEMPLATES.find((t) => t.id === scene.templateId) ?? TEMPLATES[0];
              return (
                <button
                  key={scene.templateId}
                  onClick={() => handleOpenTemplate(scene.templateId)}
                  className="launcher-scene"
                >
                  <span className="launcher-scene-title">
                    {scene.title}
                  </span>

                  {/* Real Go WASM Miniature Preview */}
                  <div className="launcher-miniature" inert aria-hidden="true">
                    <TerminalViewport
                      title=""
                      chrome="minimal"
                      doc={tpl.doc}
                      renderTick={0}
                      cols={76}
                      rows={14}
                      fontSize={4.5}
                      fontFamily={fontFamily}
                      palette={showcasePalette}
                      colorProfile="truecolor"
                      showOverlay={false}
                      overlayMode="none"
                      selectedId=""
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
