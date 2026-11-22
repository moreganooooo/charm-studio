## **Architecture & Routing Spec**

### **1\. Client-Side Routing & Smart Entry Rules**

* **Routes:**  
  * / — Interactive Home & Scene Launcher (unified split-hero \+ GitHub/template launcher \+ cell-grid/Go preview).  
  * /studio — Full Charm Studio editor workspace (existing 3-pane / 3-lens builder, TerminalViewport.tsx, PropertyInspector.tsx, CodePreviewDrawer.tsx).  
  * /gallery — Community TUI templates, custom LightDark theme packs, and \#s= / ?p= remixable presets.  
  * /desktop — Wails v3 desktop companion, charmbracelet/x/xpty \+ vt runner, incremental go build, MCP server, and git worktree isolation walkthrough.  
  * /docs — Searchable Charmbracelet v2 (charm.land/\*/v2) reference, Lip Gloss LightDark \+ Compositor guide, dave/dst 3-tier sync rules, and v1 → v2 migration matrix.  
* **GitHub Pages (**moreganooooo.github.io/charm-studio/**) Compatibility:**  
  * Add a public/404.html SPA fallback script that redirects unknown subpaths to \${BASE\_URL}?route=... so direct reloads and deep links work cleanly on static hosting without breaking relative /studio.wasm or /wasm\_exec.js assets.  
  * **Entry Priority Order on Initial Load:**  
    1. If window.location.hash.startsWith("\#s=") or ?p= is present → route straight to /studio and hydrate the shared document.  
    2. If an explicit route query/hash is provided (?route=gallery\|desktop\|docs\|studio) → render that view immediately.  
    3. If localStorage.getItem("charmstudio:visited:v1") \=== "true" and no explicit / override was requested → route straight to /studio.  
    4. Otherwise (first-time visitor) → render / and set charmstudio:visited:v1 \= "true" once the user enters /studio or interacts with a launcher CTA.  
  * Clicking the Charm Studio brand mark in any top navigation bar always navigates to / (even for returning users), while localStorage auto-skip only triggers on fresh page loads without an explicit route.  
* **Background WASM Preload:**  
  * Trigger ensureEngineReady() asynchronously right when / mounts (without blocking initial first paint) and update a live status badge (Warming Go WASM… → Go 1.26 WASM Ready).

### **2\. Page-by-Page Functional Spec**

* / **(Home & Launcher):**  
  * **Visual System:** Deep aubergine ground (\#150f1d), hot pink (\#ff5eae) primary accents, lilac (\#b9a2ff) & mint (\#6dffc2) highlights, JetBrains Mono / Bricolage Grotesque pairing, and Charm v2 (charm.land/\*/v2) terminology.  
  * **Top Bar:** Charm Studio brand link (/), navigation links (Gallery, Desktop, Docs), and live Go 1.26 WASM Ready pill.  
  * **Split Hero (Left):** Bold Charm Studio display headline, concise value proposition, primary Open Studio CTA (/studio), secondary Desktop Companion button (/desktop), and quick GitHub repo URL / .go file drop fast-track input that parses styles via extractFromGoSource / parseGoWithDst and opens /studio pre-populated.  
  * **Split Hero (Right):** Interactive live mini-terminal card with a working Visual \| Hybrid \| Code switcher, subtle cell-grid padding overlay on the active pane, and a linked Go snippet card highlighting Padding(1, 2\) live as the user cycles spacing/lenses.  
  * **Starter Scene Shelf:** Cards for Infra Dashboard, 3-Pane Git, Huh Form, and Glow Docs (plus quick access to all TEMPLATES in /studio), each launching /studio with that template and selectedId pre-loaded.  
* /gallery **(Templates & Themes Showcase):**  
  * Filterable grid of built-in TEMPLATES plus curated starter scenes (Infra Dashboard, Log Stream, 3-Pane Git / Kanban, CLI Wizard, Glow Docs Reader, Huh Interactive Form, Gum Shell Prompts, Wish SSH Portal) and PALETTES (Tokyo Night, Catppuccin Mocha, Dracula, Nord, Gruvbox Dark, Tokyo Day).  
  * Category & widget filter pills (All, Dashboards, Forms & Prompts, Docs & Logs, SSH / Wish), live Mini-Terminal preview cards, interactive Light/Dark theme preview toggle, and **Remix in Studio** (loads template \+ palette into studioStore and navigates to /studio) \+ **Copy Share URL (**\#s=**)** actions.  
  * Community/public project section wired to projectsStore.ts / Supabase (is\_public / ?p=) with graceful offline/local fallback when Supabase isn't configured.  
* /desktop **(Wails v3 Companion, Native PTY & MCP Guide):**  
  * Hero & platform overview explaining PreviewTransport (WasmTransport vs. WailsTransport), why desktop unlocks native go build \+ charmbracelet/x/xpty \+ vt streaming to xterm.js (bypassing browser WASM limits), and how studio.wasm still powers zero-install web mode.  
  * Copyable CLI commands for headless bridge (go run . \--headless on :43120 / MCP :43121), \--mcp-stdio, and Wails v3 build (task build).  
  * Interactive 3-step **MCP \+** git worktree **Workflow** explorer (1\. Select // @tui:id=... Node & Theme → 2\. Agent Edits in Isolated Worktree → 3\. Live PTY Preview & AST/Line Diff) with copyable MCP client config snippets for Claude Code, Cursor, and Codex.  
* /docs **(Interactive Charm v2 & Round-Trip Sync Docs):**  
  * Left sticky section nav \+ instant filter search across core sections extracted from CharmGlossaryModal.tsx and GuideFaqModal.tsx:  
    1. **Charm v2 Primitives (**lipgloss/v2**,** bubbletea/v2**,** bubbles/v2**,** huh/v2**):** lipgloss.LightDark(isDark) vs. deprecated v1 AdaptiveColor, View() tea.View (AltScreen, MouseMode, WindowTitle), tea.KeyPressMsg, and SetWidth/SetHeight.  
    2. **4-File Modular Codegen & Preview Fixtures:** ui/theme\_gen.go, ui/layout\_gen.go, model.go, update.go, view.go, and //go:build preview fixtures\_preview\_gen.go.  
    3. **Lossless** dave/dst **Round-Trip Sync:** Tier 1 (2-way AST style/tea.View/huh sync via // @tui:id=...), Tier 2 (managed layout \+ // @tui:sync-disable escape hatch), and Tier 3 (hand-owned Update handlers).  
    4. **Interactive v1 → v2 Toggle:** Side-by-side comparison cards with a one-click v1 (Deprecated) / v2 (Charm Studio) toggle and **Copy Snippet** buttons.

## **Copy-Paste Implementation Prompt**

Markdown

```

You are building the multi-page architecture for **Charm Studio** (`moreganooooo/charm-studio`), a visual layout sandbox and idiomatic Charmbracelet v2 (`charm.land/*/v2`) Go code generator with a React + TypeScript + Vite frontend, a Go WASM engine (`engine/`), and a Wails v3 desktop companion (`desktop/`).

Review the existing codebase first (`src/App.tsx`, `src/store/studioStore.ts`, `src/wasmEngine.ts`, `src/previewTransport.ts`, `src/templates.ts`, `src/goImporter.ts`, `src/projectsStore.ts`, `src/CharmGlossaryModal.tsx`, `src/GuideFaqModal.tsx`, `src/DesktopCompanionModal.tsx`, `vite.config.ts`, and `public/`) and preserve all existing store APIs, types, and keyboard shortcuts.

### 1. Client-Side Routing, GitHub Pages Fallback & Smart Entry
- Create a lightweight router (`src/router.tsx` or `src/navigation.ts`) supporting routes:
  - `/` -> `HomeLauncher`
  - `/studio` -> existing Studio workspace
  - `/gallery` -> `GalleryPage`
  - `/desktop` -> `DesktopPage`
  - `/docs` -> `DocsPage`
- Add `public/404.html` so GitHub Pages (`BASE_URL`) rewrites deep paths (`/gallery`, `/desktop`, `/docs`, `/studio`) cleanly back to `index.html?route=...` while preserving `window.location.hash` (`#s=...`) and query params (`?p=...`).
- Implement smart initial route resolution:
  1. If `window.location.hash.startsWith("#s=")` or URL search has `?p=`, open `/studio`.
  2. If an explicit route is requested via query/hash/path, open that route.
  3. If `localStorage.getItem("charmstudio:visited:v1") === "true"`, open `/studio`.
  4. Otherwise (first-time visitor), open `/`.
- Clicking the `Charm Studio` wordmark in any top nav bar navigates to `/` (and sets a non-sticky "browsing home" flag for that navigation without permanently resetting `charmstudio:visited:v1`). Entering `/studio` or launching a template sets `charmstudio:visited:v1 = "true"`.
- Start `ensureEngineReady()` asynchronously in the background when mounting `/` so `studio.wasm` warms up without blocking first paint.

### 2. `/` — Home & Scene Launcher (`src/components/HomeLauncher.tsx`)
- Style with Charm Studio's aubergine dark palette (`#150f1d` ground, elevated cards `#20162d` / `--cs-*` tokens), `#ff5eae` hot pink primary accent, `#b9a2ff` lilac, `#6dffc2` mint, and monospace/display typography (`JetBrains Mono` + display sans).
- **Top Navigation Bar:** `Charm Studio` brand link (`/`), links to `Gallery`, `Desktop`, and `Docs`, and a live WASM status pill (`Warming Go WASM…` -> `Go 1.26 WASM Ready` in mint).
- **Split Hero — Left Column:**
  - `Charm Studio` headline, concise subtitle explaining visual TUI layout + live Go v2 generation.
  - Primary hot-pink `Open Studio` CTA (navigates to `/studio` and marks visited) + secondary `Desktop Companion` button (navigates to `/desktop`).
  - Quick GitHub repo URL / `.go` file drop or paste input box right below the buttons: supports pasting a public GitHub repo URL (reusing the repo fetch/scan logic from `src/goImporter.ts` / `src/ImportModal.tsx`) or dropping/pasting `.go` source, extracting styles/tokens/view flags, and jumping into `/studio` with the imported `IRDoc` loaded on the undo stack.
- **Split Hero — Right Column:**
  - Interactive live mini-terminal card with a working `Visual` | `Hybrid` | `Code` segmented pill toggle.
  - Clicking `Visual`, `Hybrid`, or `Code` (and adjusting a spacing preset `1` / `2` / `3`) updates an active cell-grid padding highlight on the terminal preview and dynamically highlights the corresponding `lipgloss.NewStyle()...Padding(...)` line in a linked Go snippet card underneath.
- **Starter Scene Shelf:**
  - Four interactive preview cards (`Infra Dashboard`, `3-Pane Git`, `Huh Form`, `Glow Docs`) plus a link to browse all templates in `/gallery`. Clicking a scene card loads that template in `studioStore`, selects its primary node, and navigates to `/studio`.

### 3. `/gallery` — Templates, Themes & Community Showcase (`src/components/GalleryPage.tsx`)
- Display filterable cards for built-in `TEMPLATES` and starter scenes (`Infra Dashboard`, `Log Stream`, `3-Pane Git / Kanban`, `CLI Wizard`, `Glow Docs Reader`, `Huh Interactive Form`, `Gum Shell Prompts`, `Wish SSH Portal`), filterable by category/widget (`All`, `Dashboards`, `Forms & Prompts`, `Docs & Logs`, `SSH & Wish`) and search query.
- Include a **Theme & Polarity Strip** showcasing `allPalettes` (`Tokyo Night`, `Catppuccin Mocha`, `Dracula`, `Nord`, `Gruvbox Dark`, `Tokyo Day`, plus custom uploaded themes) with a live Light/Dark preview toggle so users can inspect color tokens before launching.
- Each template card includes:
  - Compact terminal preview + widget/style metadata badges.
  - **Remix in Studio** button (applies template + selected palette in `studioStore` and opens `/studio`).
  - **Share Link** button (encodes `#s=` via `encodeShareHash` and copies URL).
- Add a **Community & Cloud Projects** shelf backed by `projectsStore.ts` / Supabase public items (when configured) with a clear local-first note and one-click remix support.

### 4. `/desktop` — Wails v3 Companion, Native PTY & MCP Guide (`src/components/DesktopPage.tsx`)
- Present the Wails v3 desktop architecture clearly alongside the browser WASM build:
  - Compare **Browser WASM (`WasmTransport`)** (zero-install GitHub Pages sandbox, `studio.wasm`) vs. **Wails v3 Desktop (`WailsTransport`)** (native `go build` on save, `charmbracelet/x/xpty` + `vt` terminal runner streamed to `xterm.js`, full stdlib/CGo/filesystem access, local MCP server, and isolated `git worktree` sessions).
- Provide one-click copy command blocks for:
  - Headless bridge (`cd desktop && go mod tidy && go run . --headless`)
  - MCP stdio / HTTP endpoint (`:43120` bridge / `:43121` MCP)
  - Full Wails v3 build (`task build`)
- Include an interactive **Agent + Worktree Walkthrough** (`Select // @tui:id=... Node` -> `Agent Edits in Git Worktree` -> `Live PTY Stream & AST Diff`) and copyable MCP config JSON for Claude Code, Cursor, and Codex.

### 5. `/docs` — Interactive Charm v2 & Round-Trip Sync Guide (`src/components/DocsPage.tsx`)
- Extract and organize reference content from `CharmGlossaryModal.tsx` and `GuideFaqModal.tsx` into a clean docs layout with a sticky table of contents, keyword search filter, and copyable Go code blocks.
- Cover:
  1. **Charmbracelet v2 Core Patterns (`charm.land/*/v2`):** `lipgloss.LightDark(isDark)` vs. v1 `AdaptiveColor`, declarative `View() tea.View` (`AltScreen`, `MouseMode`, `WindowTitle`, `ReportFocus`), `tea.KeyPressMsg`, and Bubbles `.SetWidth(w)` / `.SetHeight(h)`.
  2. **4-File Modular Codegen & Preview Fixtures:** `ui/theme_gen.go`, `ui/layout_gen.go`, `model.go`, `update.go`, `view.go`, and `fixtures_preview_gen.go` (`//go:build preview`).
  3. **3-Tier Sync & `dave/dst` Guardrails:** Tier 1 (2-way AST sync via `// @tui:id=...`), Tier 2 (managed layout + `// @tui:sync-disable`), and Tier 3 (hand-written `Update` / `tea.Cmd` logic).
  4. **Interactive v1 vs. v2 Snippet Switcher:** Toggle between deprecated Charm v1 and idiomatic v2 snippets across Lip Gloss colors, Bubble Tea views/keys, and Huh forms.

### 6. Quality & Verification Requirements
- Keep TypeScript strictly typed with zero unused imports or dead code; reuse existing `studioStore`, `templates`, `goImporter`, `persistence`, and `projectsStore` helpers rather than duplicating logic.
- Run `npm run build` (and `npx tsc --noEmit` if configured) and verify all 5 routes (`/`, `/studio`, `/gallery`, `/desktop`, `/docs`), `localStorage` first-visit vs. returning-user behavior, `#s=` share link bypass, and GitHub import/template launch flows work cleanly.

```

