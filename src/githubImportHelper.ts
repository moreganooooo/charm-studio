import { buildIRFromExtracted, extractFromGoSourceAsync, type ExtractedGoSummary } from "./goImporter";
import type { IRDoc } from "./types";

export interface ParsedGitHubTarget {
  owner: string;
  repo: string;
  branch?: string;
  filePath?: string;
}

export function parseGitHubInput(raw: string): ParsedGitHubTarget | null {
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

export async function fetchGitHubRepoToIR(
  rawInput: string,
  githubToken?: string | null
): Promise<{
  doc: IRDoc;
  firstNodeId: string;
  summary: ExtractedGoSummary;
  sourceLabel: string;
}> {
  const parsed = parseGitHubInput(rawInput);
  if (!parsed) {
    throw new Error("Enter a valid GitHub repo (e.g. dlvhdr/gh-dash) or a GitHub file URL.");
  }

  const headers: HeadersInit = githubToken
    ? { Authorization: `Bearer ${githubToken}`, Accept: "application/vnd.github+json" }
    : { Accept: "application/vnd.github+json" };

  if (parsed.filePath && parsed.branch) {
    const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${parsed.branch}/${parsed.filePath}`;
    const res = await fetch(rawUrl);
    if (!res.ok) throw new Error(`Could not fetch ${parsed.filePath} (${res.status})`);
    const text = await res.text();
    const label = `${parsed.owner}/${parsed.repo}/${parsed.filePath}`;
    const summary = await extractFromGoSourceAsync(text);
    const { doc, firstNodeId } = buildIRFromExtracted(summary, label);
    return { doc, firstNodeId, summary, sourceLabel: label };
  }

  const repoRes = await fetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, { headers });
  if (!repoRes.ok) {
    throw new Error(
      repoRes.status === 403
        ? "GitHub API rate limit reached — drop or paste a .go file instead."
        : `GitHub repo not found (${repoRes.status})`
    );
  }
  const repoData = (await repoRes.json()) as { default_branch: string };
  const branch = repoData.default_branch || "main";

  const treeRes = await fetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`,
    { headers }
  );
  if (!treeRes.ok) throw new Error(`Could not inspect repository files (${treeRes.status})`);
  const treeData = (await treeRes.json()) as { tree: { path: string; type: string }[] };

  const candidates = treeData.tree
    .filter((item) => item.type === "blob" && item.path.endsWith(".go") && !item.path.endsWith("_test.go"))
    .map((item) => item.path)
    .sort((a, b) => {
      const score = (p: string) => (/style|theme|color/i.test(p) ? 0 : /ui|tui|view|model/i.test(p) ? 1 : 2);
      return score(a) - score(b);
    })
    .slice(0, 4);

  if (candidates.length === 0) {
    throw new Error("No .go files found in this repository.");
  }

  const texts = await Promise.all(
    candidates.map(async (path) => {
      const rawRes = await fetch(
        `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${branch}/${path}`
      );
      return rawRes.ok ? await rawRes.text() : "";
    })
  );

  const label = `${parsed.owner}/${parsed.repo}`;
  const summary = await extractFromGoSourceAsync(texts.join("\n\n"));
  const { doc, firstNodeId } = buildIRFromExtracted(summary, label);
  return { doc, firstNodeId, summary, sourceLabel: label };
}
