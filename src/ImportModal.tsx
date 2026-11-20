import { useState } from "react";
import { buildIRFromExtracted, extractFromGoSource, type ExtractedGoSummary } from "./goImporter";
import type { IRDoc } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onImportIR: (doc: IRDoc, selectId: string) => void;
}

const SAMPLE_GO = `package ui

import "charm.land/lipgloss/v2"

var (
	accentColor = lipgloss.AdaptiveColor{Light: "#d946ef", Dark: "#ff75b5"}
	mutedBorder = lipgloss.AdaptiveColor{Light: "#94a3b8", Dark: "#4c4566"}

	SidebarStyle = lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(accentColor).
		Padding(1, 2).
		MarginRight(1)

	MainCardStyle = lipgloss.NewStyle().
		Border(lipgloss.NormalBorder()).
		BorderForeground(mutedBorder).
		Padding(1, 2)

	StatusBarStyle = lipgloss.NewStyle().
		Foreground(accentColor).
		Bold(true).
		Padding(0, 1)
)`;

function parseGitHubInput(raw: string): { owner: string; repo: string; branch?: string; filePath?: string } | null {
  const s = raw.trim().replace(/\.git$/, "");
  const blobMatch = s.match(/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)/);
  if (blobMatch) {
    return { owner: blobMatch[1], repo: blobMatch[2], branch: blobMatch[3], filePath: blobMatch[4] };
  }
  const repoMatch = s.match(/(?:github\.com\/)?([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/);
  if (repoMatch) {
    return { owner: repoMatch[1], repo: repoMatch[2] };
  }
  return null;
}

export function ImportModal({ open, onClose, onImportIR }: Props) {
  const [tab, setTab] = useState<"upload" | "github">("upload");
  const [goText, setGoText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("pasted.go");
  const [summary, setSummary] = useState<ExtractedGoSummary | null>(null);

  // GitHub state
  const [repoInput, setRepoInput] = useState("dlvhdr/gh-dash");
  const [ghFiles, setGhFiles] = useState<string[]>([]);
  const [selectedGhFiles, setSelectedGhFiles] = useState<string[]>([]);
  const [ghMeta, setGhMeta] = useState<{ owner: string; repo: string; branch: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const analyzeGo = (text: string, label: string) => {
    setError(null);
    setSourceLabel(label);
    setSummary(extractFromGoSource(text));
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    try {
      const first = files[0];
      if (files.length === 1 && first.name.endsWith(".json")) {
        const parsed = JSON.parse(await first.text()) as IRDoc;
        if (!parsed.root || !parsed.styles) throw new Error("Not a valid Charm Studio ir.json file");
        onImportIR(parsed, parsed.root.id);
        onClose();
        return;
      }

      const contents = await Promise.all(Array.from(files).map((f) => f.text()));
      const combined = contents.join("\n\n");
      setGoText(combined);
      analyzeGo(combined, Array.from(files).map((f) => f.name).join(", "));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const fetchGitHubRepo = async () => {
    const parsed = parseGitHubInput(repoInput);
    if (!parsed) {
      setError("Enter a valid GitHub repo like owner/repo or https://github.com/owner/repo");
      return;
    }
    setLoading(true);
    setError(null);
    setSummary(null);
    try {
      if (parsed.filePath && parsed.branch) {
        const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}/${parsed.filePath}`;
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(`Could not fetch file (${res.status})`);
        const text = await res.text();
        setGhMeta({ owner: parsed.owner, repo: parsed.repo, branch: parsed.branch });
        setGhFiles([parsed.filePath]);
        setSelectedGhFiles([parsed.filePath]);
        analyzeGo(text, `${parsed.owner}/${parsed.repo}/${parsed.filePath}`);
        return;
      }

      const repoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
      if (!repoRes.ok) {
        throw new Error(repoRes.status === 403 ? "GitHub API rate limit reached—upload or paste .go files in the Upload tab instead!" : `GitHub repo not found (${repoRes.status})`);
      }
      const repoData = (await repoRes.json()) as { default_branch: string };
      const branch = repoData.default_branch || "main";

      const treeRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`);
      if (!treeRes.ok) throw new Error(`Could not read repo tree (${treeRes.status})`);
      const treeData = (await treeRes.json()) as { tree: { path: string; type: string }[] };

      const goCandidates = treeData.tree
        .filter((item) => item.type === "blob" && item.path.endsWith(".go") && !item.path.endsWith("_test.go"))
        .map((item) => item.path)
        .sort((a, b) => {
          const score = (p: string) => (/style|theme|color/i.test(p) ? 0 : /ui|tui|view|model/i.test(p) ? 1 : 2);
          return score(a) - score(b);
        })
        .slice(0, 24);

      if (goCandidates.length === 0) throw new Error("No .go files found in this repository.");

      setGhMeta({ owner: parsed.owner, repo: parsed.repo, branch });
      setGhFiles(goCandidates);
      setSelectedGhFiles(goCandidates.slice(0, 4));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const scanSelectedGitHubFiles = async () => {
    if (!ghMeta || selectedGhFiles.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const texts = await Promise.all(
        selectedGhFiles.slice(0, 8).map(async (path) => {
          const res = await fetch(`https://raw.githubusercontent.com/${ghMeta.owner}/${ghMeta.repo}/${ghMeta.branch}/${path}`);
          return res.ok ? await res.text() : "";
        })
      );
      analyzeGo(texts.join("\n\n"), `${ghMeta.owner}/${ghMeta.repo}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const applyImported = () => {
    if (!summary) return;
    const { doc, firstNodeId } = buildIRFromExtracted(summary, sourceLabel);
    onImportIR(doc, firstNodeId);
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(8, 7, 14, 0.74)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(680px, 100%)", maxHeight: "88vh", overflowY: "auto",
          background: "#13111d", border: "1px solid #382f57", borderRadius: 14,
          padding: 22, boxShadow: "0 24px 60px rgba(0,0,0,0.65)",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "#f5d0fe" }}>Import Go Project or GitHub Repo</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#8b82ad", lineHeight: 1.45 }}>
              Extract <code style={{ color: "#5eead4" }}>lipgloss.NewStyle()</code> chains, adaptive colors, and Bubbles imports directly in your browser.
            </p>
          </div>
          <button onClick={onClose} style={btn}>✕</button>
        </div>

        {/* Source Tabs */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTab("upload")} style={tabBtn(tab === "upload")}>1. Upload / Paste Files</button>
          <button onClick={() => setTab("github")} style={tabBtn(tab === "github")}>2. Connect Public GitHub Repo</button>
        </div>

        {error && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(244, 63, 94, 0.16)", border: "1px solid rgba(244, 63, 94, 0.45)", color: "#fda4af", fontSize: 12 }}>
            {error}
          </div>
        )}

        {tab === "upload" ? (
          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
              <label style={{ ...primaryBtn, cursor: "pointer", display: "inline-block" }}>
                📁 Choose .go or .ir.json Files
                <input type="file" multiple accept=".go,.json" onChange={(e) => handleFiles(e.target.files)} style={{ display: "none" }} />
              </label>
              <button
                onClick={() => {
                  setGoText(SAMPLE_GO);
                  analyzeGo(SAMPLE_GO, "sample_styles.go");
                }}
                style={btn}
              >
                ✨ Load Sample styles.go
              </button>
            </div>

            <textarea
              rows={7}
              placeholder="Or paste your Go styles.go / theme.go code here..."
              value={goText}
              onChange={(e) => setGoText(e.target.value)}
              style={{ ...inp, fontFamily: "ui-monospace, monospace", resize: "vertical", marginBottom: 10 }}
            />
            <button onClick={() => analyzeGo(goText, "pasted.go")} disabled={!goText.trim()} style={btn}>
              Scan Pasted Go Code
            </button>
          </div>
        ) : (
          <div style={card}>
            <div style={{ fontSize: 12, color: "#a59ec9", marginBottom: 8 }}>
              Paste a public GitHub repo (<code style={{ color: "#c4b5fd" }}>owner/repo</code>) or a direct link to a <code style={{ color: "#c4b5fd" }}>styles.go</code> file:
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="e.g. dlvhdr/gh-dash or charmbracelet/soft-serve"
                style={inp}
              />
              <button onClick={fetchGitHubRepo} disabled={loading} style={primaryBtn}>
                {loading ? "Fetching..." : "Fetch Repo"}
              </button>
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {["dlvhdr/gh-dash", "charmbracelet/soft-serve", "charmbracelet/glow"].map((sample) => (
                <button key={sample} onClick={() => setRepoInput(sample)} style={{ ...btn, fontSize: 11, padding: "3px 8px" }}>
                  {sample}
                </button>
              ))}
            </div>

            {ghFiles.length > 0 && (
              <div style={{ borderTop: "1px solid #2b2442", paddingTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#e9d5ff", marginBottom: 6 }}>
                  Select Go files to scan ({selectedGhFiles.length} selected, prioritized by style/theme):
                </div>
                <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {ghFiles.map((path) => {
                    const checked = selectedGhFiles.includes(path);
                    return (
                      <label key={path} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#c8c1e3", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setSelectedGhFiles((prev) => (checked ? prev.filter((p) => p !== path) : [...prev, path]))
                          }
                          style={{ accentColor: "#ff75b5" }}
                        />
                        <code>{path}</code>
                      </label>
                    );
                  })}
                </div>
                <button onClick={scanSelectedGitHubFiles} disabled={loading || selectedGhFiles.length === 0} style={primaryBtn}>
                  {loading ? "Scanning..." : "Scan Selected Files"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Extraction Preview */}
        {summary && (
          <div style={{ ...card, borderColor: "#5eead4" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <b style={{ color: "#5eead4", fontSize: 13 }}>✓ Ready to Import ({sourceLabel})</b>
              <span style={{ fontSize: 11.5, color: "#a59ec9" }}>
                {summary.styleNames.length} styles • {Object.keys(summary.tokens).length} color tokens
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {summary.styleNames.map((n) => (
                <code key={n} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 999, background: "#0c0b12", color: "#f5d0fe", border: "1px solid #322b4d" }}>
                  {n}
                </code>
              ))}
              {summary.detectedBubbles.map((b) => (
                <code key={b} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 999, background: "rgba(94, 234, 212, 0.12)", color: "#5eead4", border: "1px solid rgba(94, 234, 212, 0.35)" }}>
                  {b}
                </code>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "#8b82ad" }}>
                Imports static styles &amp; colors into the canvas (Undoable with Cmd+Z).
              </span>
              <button onClick={applyImported} style={primaryBtn}>Load Into Studio →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = { background: "#181526", border: "1px solid #2b2442", borderRadius: 10, padding: 14 };
const inp: React.CSSProperties = { background: "#0c0b12", color: "#ede9fe", border: "1px solid #322b4d", borderRadius: 6, padding: "6px 8px", fontSize: 12, width: "100%" };
const btn: React.CSSProperties = { background: "#1b1729", color: "#ddd6fe", border: "1px solid #322b4d", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { background: "rgba(255, 117, 181, 0.20)", color: "#ff99c8", border: "1px solid #ff75b5", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const tabBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "rgba(255, 117, 181, 0.18)" : "#181526",
  color: active ? "#ff99c8" : "#a59ec9",
  border: `1px solid ${active ? "#ff75b5" : "#2b2442"}`,
  borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
});
