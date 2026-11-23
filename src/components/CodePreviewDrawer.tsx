import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, Check, ChevronDown, Code2, Copy, Download, GitCompare, Keyboard } from "lucide-react";
import { computeAstDeltas, computeGoAstDiff, groupDeltasIntoBuckets } from "../astDiff";
import {
  generateEntryMainGo,
  generateFixturesPreviewGo,
  generateGoMod,
  generateGumShell,
  generateLayoutGenGo,
  generateLayoutGenGoWithSpans,
  generateModelGo,
  generateModelGoWithSpans,
  generateReadmeMd,
  generateThemeGenGo,
  generateThemeGenGoWithSpans,
  generateUpdateGo,
  generateUpdateGoWithSpans,
  generateVhsTape,
  generateViewGo,
  generateViewGoWithSpans,
  sanitizeModulePath,
  type CodeSpanMap,
} from "../codegen";
import { applyInlineGoExpression, isEditableGoExpressionLine } from "../goInlineSync";
import { formatOverflowCopyText } from "../overflowDiagnostics";
import { applyPaletteTokens, useStudioStore } from "../store/studioStore";
import { TEMPLATES } from "../templates";
import type { IRDoc, OverflowDiagnosis } from "../types";
import { buildZipBlob, triggerDownloadBlob } from "../zipExport";
import { btnStyle, CHARM_TOKENS, inputStyle, pillStyle, segBtn } from "./studioStyles";

export type CodeFileTab =
  | "theme_gen"
  | "layout_gen"
  | "model"
  | "update"
  | "view"
  | "raw"
  | "fixtures_preview"
  | "main"
  | "gomod"
  | "vhs"
  | "gum"
  | "readme"
  | "json";

const CODE_FILE_INFO: Record<CodeFileTab, string> = {
  theme_gen: "ui/theme_gen.go — Generated Theme struct, NewTheme(isDark) & LightDark adaptive tokens (Studio-owned unless // @tui:sync-disable).",
  layout_gen: "ui/layout_gen.go — Generated responsive RenderApp() tree & NewLayer overlay compositor (Studio-owned unless // @tui:sync-disable).",
  model: "model.go — Hand-owned Bubble Tea v2 model struct & Init(). State transitions and custom fields are preserved.",
  update: "update.go — Hand-owned Update(tea.Msg), tea.Cmd handlers & keybindings. Custom Elm logic stays untouched.",
  view: "view.go — Declarative tea.View wrapper calling ui.RenderApp(...) with AltScreen, MouseMode & WindowTitle.",
  raw: "Imported Raw Go — Original imported Go source (read-only reference showing // @tui:sync-disable & Dynamic Go expressions).",
  fixtures_preview: "fixtures_preview_gen.go — Build-tagged (//go:build preview) sample data harness isolated from production builds.",
  main: "main.go — Runnable Bubble Tea v2 (or Wish SSH) program entrypoint.",
  gomod: "go.mod — Module manifest declaring exact charm.land/v2 & Charmbracelet dependencies.",
  vhs: "demo.tape — charmbracelet/vhs tape script to record a terminal GIF/screenshot.",
  gum: "gum.sh — charmbracelet/gum shell script mirroring prompts, choices, and styled cards.",
  readme: "README.md — Step-by-step quick-start instructions for running your exported Go project.",
  json: "ir.json — Portable Layout IR JSON representing the full tree, widget data, styles & tokens.",
};

const CODE_OWNERSHIP_LABEL: Record<CodeFileTab, string> = {
  theme_gen: "Generated",
  layout_gen: "Generated",
  fixtures_preview: "Preview-Only",
  model: "Hand-Owned Logic",
  update: "Hand-Owned Logic",
  view: "App Entry",
  main: "App Entry",
  raw: "Imported Reference",
  gomod: "Manifest",
  vhs: "Tape Script",
  gum: "Shell Script",
  readme: "Docs",
  json: "IR Schema",
};

const CORE_GO_TABS: { id: CodeFileTab; label: string }[] = [
  { id: "theme_gen", label: "theme_gen.go" },
  { id: "layout_gen", label: "layout_gen.go" },
  { id: "model", label: "model.go" },
  { id: "update", label: "update.go" },
  { id: "view", label: "view.go" },
];

const MORE_FILE_TABS: { id: CodeFileTab; label: string }[] = [
  { id: "fixtures_preview", label: "fixtures_preview_gen.go" },
  { id: "main", label: "main.go" },
  { id: "gomod", label: "go.mod" },
  { id: "vhs", label: "demo.tape" },
  { id: "gum", label: "gum.sh" },
  { id: "readme", label: "README.md" },
  { id: "json", label: "ir.json" },
];

function renderFileForDoc(
  doc: IRDoc,
  tab: CodeFileTab,
  goModuleName: string,
  paletteLabel: string
): { code: string; spans: CodeSpanMap } {
  switch (tab) {
    case "theme_gen":
      return generateThemeGenGoWithSpans(doc);
    case "layout_gen":
      return generateLayoutGenGoWithSpans(doc);
    case "model":
      return generateModelGoWithSpans(doc, goModuleName);
    case "update":
      return generateUpdateGoWithSpans(doc, goModuleName);
    case "view":
      return generateViewGoWithSpans(doc, goModuleName);
    case "raw":
      return { code: doc.importedGo?.source || "// No imported Go file in current document.", spans: {} };
    case "fixtures_preview":
      return { code: generateFixturesPreviewGo(doc), spans: {} };
    case "main":
      return { code: generateEntryMainGo(doc, goModuleName), spans: {} };
    case "gomod":
      return { code: generateGoMod(doc, goModuleName), spans: {} };
    case "vhs":
      return { code: generateVhsTape(doc, paletteLabel), spans: {} };
    case "gum":
      return { code: generateGumShell(doc), spans: {} };
    case "readme":
      return { code: generateReadmeMd(doc, goModuleName), spans: {} };
    case "json":
      return { code: JSON.stringify(doc, null, 2), spans: {} };
  }
}

interface CodePreviewDrawerProps {
  highlightNodeId?: string;
  highlightStyleName?: string;
}

export function CodePreviewDrawer({ highlightNodeId, highlightStyleName }: CodePreviewDrawerProps = {}) {
  const {
    ir,
    past,
    templateId,
    palette,
    goModuleName,
    setGoModuleName,
    markStep,
    selectedNode,
    activeProperty,
    setActiveProperty,
    updateSelectedStyle,
    updateNode,
    lastKeyPulse,
    activeLens,
    codeDrawerRequest,
    setCodeDrawerRequest,
    activeOverflowDiagnoses,
    jumpToOverflowDiagnostic,
  } = useStudioStore();

  const [codeFile, setCodeFile] = useState<CodeFileTab>("theme_gen");
  const [drawerMode, setDrawerMode] = useState<"source" | "diff">("source");
  const [diffBase, setDiffBase] = useState<"previous" | "template">("previous");
  const [copied, setCopied] = useState(false);
  const [diagCopied, setDiagCopied] = useState(false);
  const [runCmdCopied, setRunCmdCopied] = useState(false);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<{ lineNo: number; value: string } | null>(null);
  const [pulseActive, setPulseActive] = useState(false);
  const [moreFilesOpen, setMoreFilesOpen] = useState(false);
  const [anchoredDiagnosis, setAnchoredDiagnosis] = useState<OverflowDiagnosis | null>(null);
  const moreFilesRef = useRef<HTMLDivElement>(null);
  const anchoredLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreFilesOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (moreFilesRef.current && !moreFilesRef.current.contains(e.target as Node)) {
        setMoreFilesOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [moreFilesOpen]);

  useEffect(() => {
    if (!codeDrawerRequest) return;
    const req = codeDrawerRequest;
    const t = setTimeout(() => {
      const nextTab = req.tab === "raw" && !ir.importedGo ? "theme_gen" : req.tab;
      setCodeFile(nextTab);
      setDrawerMode("source");
      if (req.diagnosis) {
        setAnchoredDiagnosis(req.diagnosis);
      }
      setCodeDrawerRequest(null);
    }, 0);
    return () => clearTimeout(t);
  }, [codeDrawerRequest, ir.importedGo, setCodeDrawerRequest]);

  useEffect(() => {
    if (!lastKeyPulse || activeLens !== "code") return;
    const t0 = setTimeout(() => {
      setCodeFile("update");
      setDrawerMode("source");
      setPulseActive(true);
    }, 0);
    const t1 = setTimeout(() => {
      setPulseActive(false);
    }, 1500);
    return () => {
      clearTimeout(t0);
      clearTimeout(t1);
    };
  }, [lastKeyPulse, activeLens]);

  const activeTab: CodeFileTab = codeFile === "raw" && !ir.importedGo ? "theme_gen" : codeFile;
  const activeMoreTab = MORE_FILE_TABS.find((t) => t.id === activeTab) ?? null;

  const liveMatchedDiagnosis = useMemo(() => {
    const targetNodeId = highlightNodeId || selectedNode?.id || "";
    const exactLive = activeOverflowDiagnoses.find(
      (d) => d.nodeId === targetNodeId && d.goFile === activeTab
    );
    if (exactLive) return exactLive;
    const anyLiveForNode = activeOverflowDiagnoses.find((d) => d.nodeId === targetNodeId);
    if (anyLiveForNode && (activeTab === "layout_gen" || activeTab === "theme_gen")) {
      return anyLiveForNode;
    }
    if (
      anchoredDiagnosis &&
      anchoredDiagnosis.nodeId === targetNodeId &&
      anchoredDiagnosis.goFile === activeTab &&
      activeOverflowDiagnoses.some((d) => d.nodeId === anchoredDiagnosis.nodeId)
    ) {
      return anchoredDiagnosis;
    }
    return null;
  }, [highlightNodeId, selectedNode?.id, activeOverflowDiagnoses, activeTab, anchoredDiagnosis]);

  useEffect(() => {
    if (!liveMatchedDiagnosis && !codeDrawerRequest) return;
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(() => {
      anchoredLineRef.current?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "center",
      });
    }, 45);
    return () => clearTimeout(t);
  }, [liveMatchedDiagnosis, codeDrawerRequest, activeTab]);

  const generatedResult = useMemo(
    () => renderFileForDoc(ir, activeTab, goModuleName, palette.label),
    [ir, activeTab, goModuleName, palette.label]
  );
  const generatedOutput = generatedResult.code;
  const generatedSpans = generatedResult.spans;

  const baselineDoc = useMemo(() => {
    if (diffBase === "previous" && past.length > 0) {
      return past[past.length - 1];
    }
    const tpl = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
    return applyPaletteTokens(tpl.doc, palette);
  }, [diffBase, past, templateId, palette]);

  const isGoTab =
    activeTab === "theme_gen" ||
    activeTab === "layout_gen" ||
    activeTab === "model" ||
    activeTab === "update" ||
    activeTab === "view" ||
    activeTab === "fixtures_preview" ||
    activeTab === "main";

  const goDiffResult = useMemo(() => {
    if (drawerMode !== "diff") {
      return {
        deltas: computeAstDeltas(baselineDoc, ir),
        lines: [],
        engine: "ir-fallback" as const,
      };
    }
    const beforeOutput = renderFileForDoc(baselineDoc, activeTab, goModuleName, palette.label).code;
    return computeGoAstDiff(beforeOutput, generatedOutput, baselineDoc, ir, isGoTab);
  }, [drawerMode, baselineDoc, ir, activeTab, goModuleName, palette.label, generatedOutput, isGoTab]);

  const astDeltas = goDiffResult.deltas;
  const diffLines = goDiffResult.lines;
  const bucketGroups = useMemo(() => groupDeltasIntoBuckets(ir, astDeltas), [ir, astDeltas]);

  const changedLineStats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const l of diffLines) {
      if (l.type === "add") added++;
      else if (l.type === "del") removed++;
    }
    return { added, removed };
  }, [diffLines]);

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
      { path: `${slug}/main.go`, content: generateEntryMainGo(ir, modPath) },
      { path: `${slug}/model.go`, content: generateModelGo(ir, modPath) },
      { path: `${slug}/update.go`, content: generateUpdateGo(ir, modPath) },
      { path: `${slug}/view.go`, content: generateViewGo(ir, modPath) },
      { path: `${slug}/fixtures_preview_gen.go`, content: generateFixturesPreviewGo(ir) },
      { path: `${slug}/ui/theme_gen.go`, content: generateThemeGenGo(ir) },
      { path: `${slug}/ui/layout_gen.go`, content: generateLayoutGenGo(ir) },
      { path: `${slug}/demo.tape`, content: generateVhsTape(ir, palette.label) },
      { path: `${slug}/gum.sh`, content: generateGumShell(ir) },
      { path: `${slug}/README.md`, content: generateReadmeMd(ir, modPath) },
      { path: `${slug}/ir.json`, content: JSON.stringify(ir, null, 2) },
    ];
    const blob = buildZipBlob(entries);
    triggerDownloadBlob(blob, `${slug}.zip`);
    markStep("exportedCode");
    setZipStatus(`Downloaded ${slug}.zip`);
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

  return (
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
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            {zipStatus ? <Check size={13} /> : <Download size={13} />}
            <span>{zipStatus || "Download Runnable Go Project (.zip)"}</span>
          </button>
          <button
            onClick={copyRunCommand}
            title="Copy unzip + go mod tidy + go run . command"
            style={{ ...btnStyle(runCmdCopied), display: "inline-flex", alignItems: "center", gap: 5 }}
          >
            {runCmdCopied ? <Check size={12} /> : <Copy size={12} />}
            <span>{runCmdCopied ? "Cmd Copied" : "Copy Run Cmd"}</span>
          </button>
        </div>

        {/* Source vs Live AST Diff Mode Switcher */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, paddingTop: 2, flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: "var(--cs-input)", borderRadius: 7, padding: 2, border: "1px solid var(--cs-border)" }}>
            <button
              onClick={() => setDrawerMode("source")}
              style={{ ...segBtn(drawerMode === "source"), padding: "4px 9px", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <Code2 size={12} />
              <span>Code</span>
            </button>
            <button
              onClick={() => setDrawerMode("diff")}
              style={{ ...segBtn(drawerMode === "diff"), padding: "4px 9px", fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 5 }}
            >
              <GitCompare size={12} />
              <span>Live AST Diff</span>
              {astDeltas.length > 0 && (
                <span style={{ fontSize: 10, padding: "0 5px", borderRadius: 999, background: "var(--cs-mint-bg)", color: "var(--cs-mint)", border: "1px solid var(--cs-mint-border)" }}>
                  {astDeltas.length}
                </span>
              )}
            </button>
          </div>

          {drawerMode === "diff" && (
            <select
              value={diffBase}
              onChange={(e) => setDiffBase(e.target.value as "previous" | "template")}
              style={{ ...inputStyle, width: "auto", padding: "3px 7px", fontSize: 11 }}
              title="Diff comparison baseline"
            >
              <option value="previous" disabled={past.length === 0}>
                {past.length > 0 ? "vs. Previous Edit" : "vs. Previous Edit (none)"}
              </option>
              <option value="template">vs. Template Baseline</option>
            </select>
          )}

          <button onClick={copyOutput} style={{ ...btnStyle(copied), marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? "Copied" : "Copy File"}</span>
          </button>
        </div>
      </div>

      {/* Single-Row Core Go Tab Strip + More Files Selector */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 12px",
          borderBottom: "1px solid var(--cs-border)",
          background: "var(--cs-bg-surface)",
          position: "relative",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            flex: 1,
            minWidth: 0,
            overflowX: "auto",
            flexWrap: "nowrap",
            scrollbarWidth: "none",
          }}
        >
          {[...CORE_GO_TABS, ...(ir.importedGo ? [{ id: "raw" as CodeFileTab, label: ir.importedGo.label.split("/").pop() || "imported.go" }] : [])].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setCodeFile(t.id);
                setMoreFilesOpen(false);
              }}
              style={{
                ...pillStyle(activeTab === t.id),
                padding: "3px 8px",
                fontSize: 11,
                fontWeight: activeTab === t.id ? 700 : 500,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div ref={moreFilesRef} style={{ position: "relative", flexShrink: 0 }}>
          <button
            onClick={() => setMoreFilesOpen((v) => !v)}
            aria-expanded={moreFilesOpen}
            style={{
              ...pillStyle(Boolean(activeMoreTab)),
              padding: "3px 8px",
              fontSize: 11,
              fontWeight: activeMoreTab ? 700 : 600,
              whiteSpace: "nowrap",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span>{activeMoreTab ? activeMoreTab.label : "More files"}</span>
            <ChevronDown size={11} />
          </button>

          {moreFilesOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + 6px)",
                width: 210,
                zIndex: 80,
                background: CHARM_TOKENS.bgSurface,
                border: `1px solid ${CHARM_TOKENS.borderStrong}`,
                borderRadius: 10,
                padding: 5,
                boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06), var(--cs-shadow)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              {MORE_FILE_TABS.map((t) => {
                const selected = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setCodeFile(t.id);
                      setMoreFilesOpen(false);
                    }}
                    className="cs-mono"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      width: "100%",
                      textAlign: "left",
                      padding: "6px 9px",
                      borderRadius: 7,
                      border: "none",
                      background: selected ? CHARM_TOKENS.pinkBg : "transparent",
                      color: selected ? CHARM_TOKENS.pinkSoft : CHARM_TOKENS.text,
                      fontSize: 11.5,
                      fontWeight: selected ? 700 : 500,
                    }}
                  >
                    <span>{t.label}</span>
                    {selected && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "8px 16px", fontSize: 11.5, color: "var(--cs-text-muted)", borderBottom: "1px solid var(--cs-border)", background: "var(--cs-nav-bg)", lineHeight: 1.45, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <span>
          <strong style={{ color: "var(--cs-text-heading)", fontWeight: 700 }}>{CODE_OWNERSHIP_LABEL[activeTab]}</strong>
          {" · "}
          {CODE_FILE_INFO[activeTab]}
        </span>
        {pulseActive && activeTab === "update" && lastKeyPulse && (
          <span
            className="cs-mono"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              color: CHARM_TOKENS.mint,
              fontSize: 11,
              fontWeight: 700,
              whiteSpace: "nowrap",
            }}
          >
            <Keyboard size={11} />
            <span>Live KeyPressMsg · update.go ({lastKeyPulse.key})</span>
          </span>
        )}
      </div>

      {drawerMode === "source" ? (
        <div
          style={{
            flex: 1,
            overflowX: "auto",
            overflowY: "auto",
            background: "var(--cs-bg-code)",
          }}
        >
          <pre
            style={{
              margin: 0,
              padding: "12px 0",
              minWidth: "max-content",
              width: "100%",
              fontSize: 11.5,
              lineHeight: 1.55,
              fontFamily: "var(--cs-font-mono)",
              color: "var(--cs-text)",
            }}
          >
            {(() => {
              const targetKey = pulseActive && lastKeyPulse ? lastKeyPulse.nodeId : highlightNodeId || selectedNode?.id || "";
              const spansForTarget = [
                ...(generatedSpans[targetKey] ?? []),
                ...(highlightStyleName && highlightStyleName !== targetKey ? generatedSpans[highlightStyleName] ?? [] : []),
                ...(pulseActive && activeTab === "update" ? generatedSpans.keybinding ?? [] : []),
              ];
              const desiredProp = liveMatchedDiagnosis
                ? liveMatchedDiagnosis.failingProperty === "padding"
                  ? "padding"
                  : "size"
                : activeProperty;
              const activeSpan =
                spansForTarget.find((s) => (pulseActive ? s.property === "keybinding" : s.property === desiredProp)) ??
                spansForTarget.find((s) => s.property === activeProperty) ??
                spansForTarget[0] ??
                null;

              const linesArr = generatedOutput.split("\n");
              let anchorLineNo = activeSpan?.highlightLine ?? activeSpan?.startLine ?? null;
              if (liveMatchedDiagnosis && activeSpan) {
                for (let ln = activeSpan.startLine; ln <= activeSpan.endLine; ln++) {
                  const candidate = linesArr[ln - 1] ?? "";
                  if (
                    liveMatchedDiagnosis.failingProperty === "padding" &&
                    candidate.includes("Padding(")
                  ) {
                    anchorLineNo = ln;
                    break;
                  }
                  if (
                    liveMatchedDiagnosis.failingProperty === "width" &&
                    (candidate.includes("Width(") || candidate.includes(".Render("))
                  ) {
                    anchorLineNo = ln;
                    break;
                  }
                }
              }

              return linesArr.map((line, idx) => {
                const lineNo = idx + 1;
                const inSpan = Boolean(activeSpan && lineNo >= activeSpan.startLine && lineNo <= activeSpan.endLine);
                const isPulseHit = pulseActive && activeTab === "update" && inSpan;
                const isDiagAnchor = Boolean(liveMatchedDiagnosis && anchorLineNo === lineNo);
                const isHighlightLine = Boolean(activeSpan?.highlightLine === lineNo) || isDiagAnchor;
                const matchStyle = Boolean(highlightStyleName && line.toLowerCase().includes(highlightStyleName.toLowerCase()));
                const matchNode = Boolean(highlightNodeId && line.includes(highlightNodeId));
                const matchDirective = activeTab === "raw" && /@tui:(?:sync-disable|block-disable)/.test(line);
                const highlighted = ((inSpan || matchStyle || matchNode) && isGoTab) || (activeTab === "raw" && (matchStyle || matchNode || matchDirective));
                const editable = isGoTab && isEditableGoExpressionLine(line);
                const isEditingThis = editingLine?.lineNo === lineNo;

                const renderedLine = isDiagAnchor
                  ? renderHighlightedFragment(
                      line,
                      liveMatchedDiagnosis!.failingProperty === "padding"
                        ? /Padding\([^)]*\)/
                        : /Width\([^)]*\)/
                    )
                  : line;

                return (
                  <div key={idx} ref={isDiagAnchor ? anchoredLineRef : undefined}>
                    <div
                      onClick={() => {
                        if (editable && !isEditingThis) {
                          setEditingLine({ lineNo, value: line.trim() });
                        }
                      }}
                      title={editable ? "Click to edit Go expression directly" : undefined}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        minWidth: "100%",
                        paddingRight: 18,
                        background: isPulseHit
                          ? "rgba(109, 255, 194, 0.16)"
                          : isDiagAnchor
                          ? "rgba(255, 211, 122, 0.14)"
                          : isHighlightLine
                          ? "rgba(255, 94, 174, 0.2)"
                          : highlighted
                          ? "rgba(255, 94, 174, 0.1)"
                          : "transparent",
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
                          color: isDiagAnchor ? CHARM_TOKENS.gold : "var(--cs-text-dim)",
                          background: "var(--cs-bg-code)",
                          borderLeft: isPulseHit
                            ? "3px solid #6dffc2"
                            : isDiagAnchor
                            ? `3px solid ${CHARM_TOKENS.gold}`
                            : isHighlightLine || highlighted
                            ? "3px solid var(--cs-pink)"
                            : "3px solid transparent",
                          borderRight: "1px solid var(--cs-border-subtle)",
                          userSelect: "none",
                          textAlign: "right",
                          paddingLeft: 6,
                          paddingRight: 8,
                          marginRight: 10,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {lineNo}
                      </span>
                      {isEditingThis ? (
                        <input
                          autoFocus
                          value={editingLine.value}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setEditingLine({ lineNo, value: e.target.value })}
                          onBlur={() => setEditingLine(null)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              applyInlineGoExpression(editingLine.value, {
                                doc: ir,
                                targetNode: selectedNode,
                                updateSelectedStyle,
                                updateNode,
                                setActiveProperty,
                              });
                              setEditingLine(null);
                            } else if (e.key === "Escape") {
                              setEditingLine(null);
                            }
                          }}
                          style={{
                            minWidth: 260,
                            flex: 1,
                            background: "#150f1d",
                            color: "#f4eaff",
                            border: "1px solid #ff5eae",
                            borderRadius: 4,
                            padding: "1px 6px",
                            fontFamily: "var(--cs-font-mono)",
                            fontSize: 11.5,
                            outline: "none",
                          }}
                        />
                      ) : (
                        <span style={{ whiteSpace: "pre" }}>{renderedLine}</span>
                      )}
                    </div>

                    {/* Anchored Marginal Overflow Diagnostic Note */}
                    {isDiagAnchor && liveMatchedDiagnosis && (
                      <div
                        role="note"
                        aria-label={`Overflow diagnostic for ${liveMatchedDiagnosis.nodeLabel}`}
                        style={{
                          margin: "4px 12px 6px 54px",
                          padding: "8px 10px",
                          borderRadius: 8,
                          background: "var(--cs-bg-surface)",
                          border: "1px solid rgba(255, 211, 122, 0.45)",
                          fontFamily: "var(--cs-font-ui)",
                          whiteSpace: "normal",
                          maxWidth: 304,
                          display: "flex",
                          flexDirection: "column",
                          gap: 6,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: CHARM_TOKENS.gold }}>
                            <AlertTriangle size={12} />
                            <span>{liveMatchedDiagnosis.headline}</span>
                          </span>
                        </div>
                        <div className="cs-mono" style={{ fontSize: 10.5, color: CHARM_TOKENS.text, lineHeight: 1.4, fontVariantNumeric: "tabular-nums" }}>
                          {liveMatchedDiagnosis.causeRule}
                        </div>
                        <div className="cs-mono" style={{ fontSize: 10.5, color: CHARM_TOKENS.textMuted, fontVariantNumeric: "tabular-nums" }}>
                          {liveMatchedDiagnosis.dimensionsText}
                        </div>
                        {liveMatchedDiagnosis.suggestion && (
                          <div style={{ fontSize: 10.5, color: CHARM_TOKENS.mint }}>
                            Suggestion: {liveMatchedDiagnosis.suggestion}
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", paddingTop: 2 }}>
                          <button
                            type="button"
                            onClick={async () => {
                              await navigator.clipboard.writeText(formatOverflowCopyText(liveMatchedDiagnosis));
                              setDiagCopied(true);
                              setTimeout(() => setDiagCopied(false), 1600);
                            }}
                            style={{ ...btnStyle(diagCopied), padding: "3px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            {diagCopied ? <Check size={11} /> : <Copy size={11} />}
                            <span>{diagCopied ? "Copied" : "Copy"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              jumpToOverflowDiagnostic(liveMatchedDiagnosis, {
                                destinationLens: "hybrid",
                                focusProperty: liveMatchedDiagnosis.failingProperty,
                              })
                            }
                            style={{
                              ...btnStyle(false),
                              padding: "3px 8px",
                              fontSize: 11,
                              borderColor: CHARM_TOKENS.mintBorder,
                              color: CHARM_TOKENS.mint,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span>Fix in Hybrid</span>
                            <ArrowRight size={11} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()}
          </pre>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {/* Grouped 4-Bucket Structural AST Delta Summary */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--cs-border)", background: "var(--cs-card)", maxHeight: 205, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "var(--cs-text-dim)", marginBottom: 8 }}>
              <span>AST &amp; IR DELTA BUCKETS</span>
              <span style={{ fontFamily: "ui-monospace, monospace", fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: "#22c55e" }}>+{changedLineStats.added}</span>{" "}
                <span style={{ color: "#ef4444" }}>-{changedLineStats.removed}</span>
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bucketGroups.map((bucket) => (
                <div key={bucket.id} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 10.5, fontWeight: 700, color: bucket.id === "locked_untouched" ? "#fbbf24" : "var(--cs-text-heading)", borderBottom: "1px solid var(--cs-border-subtle)", paddingBottom: 2 }}>
                    <span>{bucket.label}</span>
                    <span className="cs-mono" style={{ color: "var(--cs-text-dim)", fontVariantNumeric: "tabular-nums" }}>
                      {bucket.items.length}
                    </span>
                  </div>
                  {bucket.items.length === 0 ? (
                    <div style={{ fontSize: 11, color: "var(--cs-text-dim)" }}>No pending changes vs. baseline</div>
                  ) : (
                    bucket.items.map((d, idx) => {
                      const tagLabel =
                        d.kind === "added"
                          ? "+ADD"
                          : d.kind === "removed"
                          ? "-DEL"
                          : d.kind === "locked"
                          ? "LOCKED"
                          : d.kind === "untouched"
                          ? "UNTOUCHED"
                          : "~MOD";
                      const tagColors =
                        d.kind === "added"
                          ? { bg: "rgba(34, 197, 94, 0.14)", fg: "#22c55e" }
                          : d.kind === "removed"
                          ? { bg: "rgba(239, 68, 68, 0.14)", fg: "#ef4444" }
                          : d.kind === "locked"
                          ? { bg: "rgba(245, 158, 11, 0.14)", fg: "#fbbf24" }
                          : d.kind === "untouched"
                          ? { bg: "var(--cs-mint-bg)", fg: "var(--cs-mint)" }
                          : { bg: "rgba(234, 179, 8, 0.14)", fg: "#eab308" };
                      return (
                        <div key={`${bucket.id}-${d.category}-${d.symbol}-${idx}`} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11 }}>
                          <span
                            style={{
                              fontFamily: "ui-monospace, monospace",
                              fontWeight: 700,
                              fontSize: 9.5,
                              padding: "0 5px",
                              borderRadius: 4,
                              background: tagColors.bg,
                              color: tagColors.fg,
                              flexShrink: 0,
                            }}
                          >
                            {tagLabel}
                          </span>
                          <code style={{ color: "var(--cs-text-heading)", fontWeight: 600, flexShrink: 0 }}>{d.symbol}</code>
                          <span style={{ color: "var(--cs-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.detail}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Line-by-line Code Diff */}
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", background: "var(--cs-bg-code)" }}>
            <pre
              style={{
                margin: 0,
                padding: "8px 0",
                minWidth: "max-content",
                width: "100%",
                fontFamily: "var(--cs-font-mono)",
                fontSize: 11.5,
                lineHeight: 1.55,
              }}
            >
              {diffLines.map((line, idx) => {
                const bg =
                  line.type === "add"
                    ? "rgba(34, 197, 94, 0.12)"
                    : line.type === "del"
                    ? "rgba(239, 68, 68, 0.12)"
                    : "transparent";
                const markerColor =
                  line.type === "add" ? "#22c55e" : line.type === "del" ? "#ef4444" : "var(--cs-text-dim)";
                return (
                  <div key={idx} style={{ display: "flex", minWidth: "100%", background: bg, paddingRight: 16 }}>
                    <span
                      style={{
                        position: "sticky",
                        left: 0,
                        zIndex: 2,
                        display: "inline-flex",
                        flexShrink: 0,
                        background: "var(--cs-bg-code)",
                        borderRight: "1px solid var(--cs-border-subtle)",
                        marginRight: 8,
                        paddingLeft: 8,
                      }}
                    >
                      <span style={{ width: 28, color: "var(--cs-text-dim)", userSelect: "none", textAlign: "right", paddingRight: 6 }}>
                        {line.oldLine ?? ""}
                      </span>
                      <span style={{ width: 28, color: "var(--cs-text-dim)", userSelect: "none", textAlign: "right", paddingRight: 6 }}>
                        {line.newLine ?? ""}
                      </span>
                      <span style={{ width: 14, color: markerColor, fontWeight: 700, userSelect: "none" }}>
                        {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                      </span>
                    </span>
                    <span style={{ whiteSpace: "pre", color: "var(--cs-text)" }}>{line.text}</span>
                  </div>
                );
              })}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function renderHighlightedFragment(line: string, pattern: RegExp): ReactNode {
  const m = pattern.exec(line);
  if (!m || m.index === undefined) return line;
  const start = m.index;
  const end = start + m[0].length;
  return (
    <>
      {line.slice(0, start)}
      <mark
        style={{
          background: "rgba(255, 211, 122, 0.28)",
          color: "var(--cs-text-heading)",
          borderRadius: 4,
          padding: "0 3px",
          borderBottom: "1.5px solid var(--cs-gold)",
        }}
      >
        {m[0]}
      </mark>
      {line.slice(end)}
    </>
  );
}
