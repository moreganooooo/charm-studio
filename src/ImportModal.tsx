import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { buildIRFromExtracted, extractFromGoSource, type ExtractedGoSummary } from "./goImporter";
import type { IRDoc } from "./types";

interface Props {
  open: boolean;
  initialTab?: "upload" | "github";
  user: User | null;
  githubToken: string | null;
  onClose: () => void;
  onOpenAuth: () => void;
  onImportIR: (doc: IRDoc, selectId: string) => void;
}

interface GitHubRepoItem {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  private: boolean;
  default_branch: string;
  updated_at: string;
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

export function ImportModal({
  open,
  initialTab = "upload",
  user,
  githubToken,
  onClose,
  onOpenAuth,
  onImportIR,
}: Props) {
  const [tab, setTab] = useState<"upload" | "github">(initialTab);
  const [goText, setGoText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("pasted.go");
  const [summary, setSummary] = useState<ExtractedGoSummary | null>(null);

  // User's GitHub repos
  const githubUsername = (user?.user_metadata?.user_name as string | undefined) || null;
  const [myRepos, setMyRepos] = useState<GitHubRepoItem[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [repoSearch, setRepoSearch] = useState("");
  const [goOnly, setGoOnly] = useState(false);

  // Manual GitHub state
  const [repoInput, setRepoInput] = useState("dlvhdr/gh-dash");
  const [ghFiles, setGhFiles] = useState<string[]>([]);
  const [selectedGhFiles, setSelectedGhFiles] = useState<string[]>([]);
  const [ghMeta, setGhMeta] = useState<{ owner: string; repo: string; branch: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || tab !== "github") return;
    if (!githubUsername && !githubToken) {
      setMyRepos([]);
      return;
    }

    let cancelled = false;
    setReposLoading(true);
    setReposError(null);

    (async () => {
      try {
        let res: Response | null = null;
        if (githubToken) {
          res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=40&affiliation=owner,collaborator", {
            headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" },
          });
        }
        if ((!res || !res.ok) && githubUsername) {
          res = await fetch(`https://api.github.com/users/${githubUsername}/repos?sort=updated&per_page=40`, {
            headers: { Accept: "application/vnd.github+json" },
          });
        }
        if (!res || !res.ok) {
          throw new Error(res?.status === 403 ? "GitHub API rate limit reached — upload .go files or try again shortly." : `Could not load repositories (${res?.status ?? "error"})`);
        }
        const data = (await res.json()) as GitHubRepoItem[];
        if (!cancelled) setMyRepos(data);
      } catch (err) {
        if (!cancelled) setReposError((err as Error).message);
      } finally {
        if (!cancelled) setReposLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, tab, githubUsername, githubToken]);

  const filteredMyRepos = useMemo(() => {
    const q = repoSearch.trim().toLowerCase();
    return myRepos.filter((r) => {
      if (goOnly && r.language?.toLowerCase() !== "go") return false;
      if (!q) return true;
      return (
        r.full_name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [myRepos, repoSearch, goOnly]);

  if (!open) return null;

  const ghHeaders = (): HeadersInit =>
    githubToken
      ? { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" }
      : { Accept: "application/vnd.github+json" };

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

  const fetchGitHubRepo = async (overrideInput?: string) => {
    const targetInput = overrideInput ?? repoInput;
    if (overrideInput) setRepoInput(overrideInput);

    const parsed = parseGitHubInput(targetInput);
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

      const repoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, {
        headers: ghHeaders(),
      });
      if (!repoRes.ok) {
        throw new Error(
          repoRes.status === 403
            ? "GitHub API rate limit reached—upload or paste .go files in the Upload tab instead!"
            : `GitHub repo not found (${repoRes.status})`
        );
      }
      const repoData = (await repoRes.json()) as { default_branch: string };
      const branch = repoData.default_branch || "main";

      const treeRes = await fetch(
        `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`,
        { headers: ghHeaders() }
      );
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
          if (githubToken) {
            const apiRes = await fetch(
              `https://api.github.com/repos/${ghMeta.owner}/${ghMeta.repo}/contents/${path}?ref=${ghMeta.branch}`,
              { headers: { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github.raw" } }
            );
            if (apiRes.ok) return await apiRes.text();
          }
          const rawRes = await fetch(
            `https://raw.githubusercontent.com/${ghMeta.owner}/${ghMeta.repo}/${ghMeta.branch}/${path}`
          );
          return rawRes.ok ? await rawRes.text() : "";
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
        background: "var(--cs-backdrop)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 100%)", maxHeight: "88vh", overflowY: "auto",
          background: "var(--cs-surface)", border: "1px solid var(--cs-border-strong)", borderRadius: 14,
          padding: 22, boxShadow: "var(--cs-shadow)",
          display: "flex", flexDirection: "column", gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: "var(--cs-text-heading)" }}>Import Go Project or GitHub Repo</h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--cs-text-dim)", lineHeight: 1.45 }}>
              Extract <code style={{ color: "var(--cs-mint)" }}>lipgloss.NewStyle()</code> chains, adaptive colors, and Charm imports directly in your browser.
            </p>
          </div>
          <button onClick={onClose} style={btn}>✕</button>
        </div>

        {/* Source Tabs */}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTab("upload")} style={tabBtn(tab === "upload")}>1. Upload / Paste Files</button>
          <button onClick={() => setTab("github")} style={tabBtn(tab === "github")}>
            2. GitHub Repos {githubUsername ? `(@${githubUsername})` : ""}
          </button>
        </div>

        {error && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(244, 63, 94, 0.14)", border: "1px solid rgba(244, 63, 94, 0.45)", color: "#e11d48", fontSize: 12 }}>
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
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Signed-in User Repositories */}
            <div style={card}>
              {githubUsername ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--cs-mint)" }}>
                        Your GitHub Repositories (@{githubUsername})
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)" }}>
                        {githubToken
                          ? "Connected via GitHub OAuth (public & private repos)."
                          : "Showing your public GitHub repositories."}
                      </div>
                    </div>
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: "var(--cs-text-body)", cursor: "pointer" }}>
                      <input type="checkbox" checked={goOnly} onChange={(e) => setGoOnly(e.target.checked)} style={{ accentColor: "var(--cs-pink)" }} />
                      Go repos only
                    </label>
                  </div>

                  <input
                    value={repoSearch}
                    onChange={(e) => setRepoSearch(e.target.value)}
                    placeholder="Filter your repos..."
                    style={{ ...inp, marginBottom: 8 }}
                  />

                  {reposLoading ? (
                    <div style={{ fontSize: 12, color: "var(--cs-text-muted)", padding: "10px 0" }}>Loading your repositories from GitHub...</div>
                  ) : reposError ? (
                    <div style={{ fontSize: 12, color: "#e11d48", padding: "6px 0" }}>{reposError}</div>
                  ) : filteredMyRepos.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--cs-text-dim)", padding: "6px 0" }}>
                      No matching repositories found{goOnly ? " (uncheck 'Go repos only' to see all)" : ""}.
                    </div>
                  ) : (
                    <div style={{ maxHeight: 185, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                      {filteredMyRepos.map((repo) => (
                        <div
                          key={repo.id}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                            padding: "8px 10px", borderRadius: 8, background: "var(--cs-panel)", border: "1px solid var(--cs-border)",
                          }}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--cs-text-strong)" }}>{repo.full_name}</span>
                              {repo.language && (
                                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: repo.language === "Go" ? "var(--cs-mint-bg)" : "var(--cs-card)", color: repo.language === "Go" ? "var(--cs-mint)" : "var(--cs-text-muted)", border: "1px solid var(--cs-border-subtle)" }}>
                                  {repo.language}
                                </span>
                              )}
                              {repo.private && (
                                <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "var(--cs-pink-bg)", color: "var(--cs-pink-soft)" }}>
                                  Private
                                </span>
                              )}
                            </div>
                            {repo.description && (
                              <div style={{ fontSize: 11, color: "var(--cs-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 2 }}>
                                {repo.description}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => fetchGitHubRepo(repo.full_name)}
                            disabled={loading}
                            style={{ ...primaryBtn, padding: "4px 10px", fontSize: 11.5, whiteSpace: "nowrap" }}
                          >
                            Scan .go →
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--cs-text-heading)" }}>Want your GitHub repos listed automatically?</div>
                    <div style={{ fontSize: 11.5, color: "var(--cs-text-dim)", marginTop: 2 }}>
                      Sign in with GitHub to browse your own repositories here (or enter any public repo below).
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      onClose();
                      onOpenAuth();
                    }}
                    style={primaryBtn}
                  >
                    Sign In with GitHub
                  </button>
                </div>
              )}
            </div>

            {/* Manual Repo / File Picker */}
            <div style={card}>
              <div style={{ fontSize: 12, color: "var(--cs-text-muted)", marginBottom: 8 }}>
                Or enter any public GitHub repo (<code style={{ color: "var(--cs-lavender-text)" }}>owner/repo</code>) or link to a <code style={{ color: "var(--cs-lavender-text)" }}>styles.go</code> file:
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                <input
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="e.g. dlvhdr/gh-dash or charmbracelet/soft-serve"
                  style={inp}
                />
                <button onClick={() => fetchGitHubRepo()} disabled={loading} style={primaryBtn}>
                  {loading ? "Fetching..." : "Fetch Repo"}
                </button>
              </div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                {["dlvhdr/gh-dash", "charmbracelet/soft-serve", "charmbracelet/glow"].map((sample) => (
                  <button key={sample} onClick={() => fetchGitHubRepo(sample)} style={{ ...btn, fontSize: 11, padding: "3px 8px" }}>
                    {sample}
                  </button>
                ))}
              </div>

              {ghFiles.length > 0 && (
                <div style={{ borderTop: "1px solid var(--cs-border-subtle)", paddingTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--cs-text-heading)", marginBottom: 6 }}>
                    Select Go files to scan ({selectedGhFiles.length} selected, prioritized by style/theme):
                  </div>
                  <div style={{ maxHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                    {ghFiles.map((path) => {
                      const checked = selectedGhFiles.includes(path);
                      return (
                        <label key={path} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--cs-text-body)", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setSelectedGhFiles((prev) => (checked ? prev.filter((p) => p !== path) : [...prev, path]))
                            }
                            style={{ accentColor: "var(--cs-pink)" }}
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
          </div>
        )}

        {/* Extraction Preview */}
        {summary && (
          <div style={{ ...card, borderColor: "var(--cs-mint)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <b style={{ color: "var(--cs-mint)", fontSize: 13 }}>✓ Ready to Import ({sourceLabel})</b>
              <span style={{ fontSize: 11.5, color: "var(--cs-text-muted)" }}>
                {summary.styleNames.length} styles • {Object.keys(summary.tokens).length} color tokens
              </span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {summary.styleNames.map((n) => (
                <code key={n} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 999, background: "var(--cs-input)", color: "var(--cs-text-heading)", border: "1px solid var(--cs-btn-border)" }}>
                  {n}
                </code>
              ))}
              {summary.detectedBubbles.map((b) => (
                <code key={b} style={{ fontSize: 11, padding: "2px 7px", borderRadius: 999, background: "var(--cs-mint-bg)", color: "var(--cs-mint)", border: "1px solid var(--cs-mint-border)" }}>
                  {b}
                </code>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, color: "var(--cs-text-dim)" }}>
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

const card: React.CSSProperties = { background: "var(--cs-card)", border: "1px solid var(--cs-border-subtle)", borderRadius: 10, padding: 14 };
const inp: React.CSSProperties = { background: "var(--cs-input)", color: "var(--cs-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 6, padding: "6px 8px", fontSize: 12, width: "100%" };
const btn: React.CSSProperties = { background: "var(--cs-btn-bg)", color: "var(--cs-btn-text)", border: "1px solid var(--cs-btn-border)", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" };
const primaryBtn: React.CSSProperties = { background: "var(--cs-pink-bg)", color: "var(--cs-pink-soft)", border: "1px solid var(--cs-pink)", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const tabBtn = (active: boolean): React.CSSProperties => ({
  background: active ? "var(--cs-pink-bg)" : "var(--cs-card)",
  color: active ? "var(--cs-pink-soft)" : "var(--cs-text-muted)",
  border: `1px solid ${active ? "var(--cs-pink)" : "var(--cs-border-subtle)"}`,
  borderRadius: 7, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
});
