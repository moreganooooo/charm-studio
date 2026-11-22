import { useMemo, useState } from "react";
import { Check, Code2, Copy, Download, GitCompare } from "lucide-react";
import { computeAstDeltas, computeGoAstDiff } from "../astDiff";
import {
  generateEntryMainGo,
  generateFixturesPreviewGo,
  generateGoMod,
  generateGumShell,
  generateLayoutGenGo,
  generateModelGo,
  generateReadmeMd,
  generateThemeGenGo,
  generateUpdateGo,
  generateVhsTape,
  generateViewGo,
  sanitizeModulePath,
} from "../codegen";
import { applyPaletteTokens, useStudioStore } from "../store/studioStore";
import { TEMPLATES } from "../templates";
import type { IRDoc } from "../types";
import { buildZipBlob, triggerDownloadBlob } from "../zipExport";
import { btnStyle, inputStyle, pillStyle, segBtn } from "./studioStyles";

export type CodeFileTab =
  | "theme_gen"
  | "layout_gen"
  | "model"
  | "update"
  | "view"
  | "fixtures_preview"
  | "main"
  | "gomod"
  | "vhs"
  | "gum"
  | "readme"
  | "json";

const CODE_FILE_INFO: Record<CodeFileTab, string> = {
  theme_gen: "ui/theme_gen.go — Lip Gloss v2 Theme struct, NewTheme(isDark) & LightDark adaptive color tokens.",
  layout_gen: "ui/layout_gen.go — Responsive RenderApp() layout tree & NewLayer overlay compositor.",
  model: "model.go — Bubble Tea v2 model struct, Bubbles/Huh initialization & Init() commands.",
  update: "update.go — WindowSizeMsg resizing, BackgroundColorMsg theming, Tab focus & widget routing.",
  view: "view.go — View() returning declarative tea.View with ui.RenderApp(...), AltScreen, MouseMode & WindowTitle.",
  fixtures_preview: "fixtures_preview_gen.go — Build-tagged (//go:build preview) sample data harness keeping production models clean.",
  main: "main.go — Runnable Bubble Tea v2 (or Wish SSH) program entrypoint.",
  gomod: "go.mod — Module manifest declaring exact charm.land/v2 & Charmbracelet dependencies.",
  vhs: "demo.tape — charmbracelet/vhs tape script to record a terminal GIF/screenshot.",
  gum: "gum.sh — charmbracelet/gum shell script mirroring prompts, choices, and styled cards.",
  readme: "README.md — Step-by-step quick-start instructions for running your exported Go project.",
  json: "ir.json — Portable Layout IR JSON representing the full tree, widget data, styles & tokens.",
};

const CODE_TABS: { id: CodeFileTab; label: string; proOnly?: boolean }[] = [
  { id: "theme_gen", label: "theme_gen.go" },
  { id: "layout_gen", label: "layout_gen.go" },
  { id: "model", label: "model.go" },
  { id: "update", label: "update.go" },
  { id: "view", label: "view.go" },
  { id: "fixtures_preview", label: "fixtures_preview_gen.go" },
  { id: "main", label: "main.go" },
  { id: "gomod", label: "go.mod" },
  { id: "vhs", label: "demo.tape" },
  { id: "gum", label: "gum.sh" },
  { id: "readme", label: "README.md" },
  { id: "json", label: "ir.json", proOnly: true },
];

function renderFileForDoc(doc: IRDoc, tab: CodeFileTab, goModuleName: string, paletteLabel: string): string {
  switch (tab) {
    case "theme_gen":
      return generateThemeGenGo(doc);
    case "layout_gen":
      return generateLayoutGenGo(doc);
    case "model":
      return generateModelGo(doc, goModuleName);
    case "update":
      return generateUpdateGo(doc, goModuleName);
    case "view":
      return generateViewGo(doc, goModuleName);
    case "fixtures_preview":
      return generateFixturesPreviewGo(doc);
    case "main":
      return generateEntryMainGo(doc, goModuleName);
    case "gomod":
      return generateGoMod(doc, goModuleName);
    case "vhs":
      return generateVhsTape(doc, paletteLabel);
    case "gum":
      return generateGumShell(doc);
    case "readme":
      return generateReadmeMd(doc, goModuleName);
    case "json":
      return JSON.stringify(doc, null, 2);
  }
}

export function CodePreviewDrawer() {
  const {
    ir,
    past,
    templateId,
    palette,
    workspaceMode,
    goModuleName,
    setGoModuleName,
    markStep,
  } = useStudioStore();

  const [codeFile, setCodeFile] = useState<CodeFileTab>("model");
  const [drawerMode, setDrawerMode] = useState<"source" | "diff">("source");
  const [diffBase, setDiffBase] = useState<"previous" | "template">("previous");
  const [copied, setCopied] = useState(false);
  const [runCmdCopied, setRunCmdCopied] = useState(false);
  const [zipStatus, setZipStatus] = useState<string | null>(null);

  const activeTab: CodeFileTab = workspaceMode === "studio" && codeFile === "json" ? "model" : codeFile;

  const generatedOutput = useMemo(
    () => renderFileForDoc(ir, activeTab, goModuleName, palette.label),
    [ir, activeTab, goModuleName, palette.label]
  );

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
    const beforeOutput = renderFileForDoc(baselineDoc, activeTab, goModuleName, palette.label);
    return computeGoAstDiff(beforeOutput, generatedOutput, baselineDoc, ir, isGoTab);
  }, [drawerMode, baselineDoc, ir, activeTab, goModuleName, palette.label, generatedOutput, isGoTab]);

  const astDeltas = goDiffResult.deltas;
  const diffLines = goDiffResult.lines;

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
        </div>
      </div>

      {/* Multi-Tab File Bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "10px 14px", borderBottom: "1px solid var(--cs-border)", flexWrap: "wrap" }}>
        {CODE_TABS.filter((t) => !t.proOnly || workspaceMode === "pro").map((t) => (
          <button key={t.id} onClick={() => setCodeFile(t.id)} style={pillStyle(activeTab === t.id)}>
            {t.label}
          </button>
        ))}
        <button onClick={copyOutput} style={{ ...btnStyle(copied), marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? "Copied" : "Copy File"}</span>
        </button>
      </div>

      <div style={{ padding: "8px 16px", fontSize: 11.5, color: "var(--cs-text-muted)", borderBottom: "1px solid var(--cs-border)", background: "var(--cs-nav-bg)", lineHeight: 1.45 }}>
        {CODE_FILE_INFO[activeTab]}
      </div>

      {drawerMode === "source" ? (
        <pre style={{ margin: 0, padding: 16, overflow: "auto", flex: 1, fontSize: 12, lineHeight: 1.55, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: "var(--cs-text)" }}>
          <code>{generatedOutput}</code>
        </pre>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
          {/* Structural AST Delta Summary */}
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--cs-border)", background: "var(--cs-card)", maxHeight: 150, overflowY: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11, fontWeight: 700, color: "var(--cs-text-dim)", marginBottom: 6 }}>
              <span>AST &amp; IR DELTA SUMMARY</span>
              <span style={{ fontFamily: "ui-monospace, monospace" }}>
                <span style={{ color: "#22c55e" }}>+{changedLineStats.added}</span>{" "}
                <span style={{ color: "#ef4444" }}>-{changedLineStats.removed}</span>
              </span>
            </div>
            {astDeltas.length === 0 ? (
              <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)" }}>
                No structural AST changes compared to the selected baseline. Make an edit on the stage or inspector to see live AST diffs.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {astDeltas.map((d, idx) => (
                  <div key={`${d.category}-${d.symbol}-${idx}`} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11.5 }}>
                    <span
                      style={{
                        fontFamily: "ui-monospace, monospace",
                        fontWeight: 700,
                        fontSize: 10,
                        padding: "0 5px",
                        borderRadius: 4,
                        background:
                          d.kind === "added"
                            ? "rgba(34, 197, 94, 0.16)"
                            : d.kind === "removed"
                            ? "rgba(239, 68, 68, 0.16)"
                            : "rgba(234, 179, 8, 0.16)",
                        color: d.kind === "added" ? "#22c55e" : d.kind === "removed" ? "#ef4444" : "#eab308",
                      }}
                    >
                      {d.kind === "added" ? "+ADD" : d.kind === "removed" ? "-DEL" : "~MOD"}
                    </span>
                    <span style={{ color: "var(--cs-text-dim)", fontSize: 10.5 }}>{d.category}</span>
                    <code style={{ color: "var(--cs-text-heading)", fontWeight: 600 }}>{d.symbol}</code>
                    <span style={{ color: "var(--cs-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.detail}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Line-by-line Code Diff */}
          <div style={{ flex: 1, overflow: "auto", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11.5, lineHeight: 1.55 }}>
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
                <div key={idx} style={{ display: "flex", background: bg, padding: "0 12px" }}>
                  <span style={{ width: 32, flexShrink: 0, color: "var(--cs-text-dim)", userSelect: "none", textAlign: "right", paddingRight: 8 }}>
                    {line.oldLine ?? ""}
                  </span>
                  <span style={{ width: 32, flexShrink: 0, color: "var(--cs-text-dim)", userSelect: "none", textAlign: "right", paddingRight: 8 }}>
                    {line.newLine ?? ""}
                  </span>
                  <span style={{ width: 14, flexShrink: 0, color: markerColor, fontWeight: 700, userSelect: "none" }}>
                    {line.type === "add" ? "+" : line.type === "del" ? "-" : " "}
                  </span>
                  <span style={{ whiteSpace: "pre", color: "var(--cs-text)" }}>{line.text}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
