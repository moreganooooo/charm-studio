# ✦ Charm Studio

**Live Go TUI Layout Sandbox & Code Generator for Charmbracelet (`Lip Gloss` + `Bubbles`)**

Stop guessing terminal cell math in the dark. Tweak borders, padding, margins, and responsive breakpoints in **real compiled Go (WASM)**—then poke straight into live Bubbles, stress-test three terminal sizes at once, and walk away with clean `styles.go` and `layout.go` without the compile-resize-sigh loop.

<!-- Drop a screenshot or 20s GIF of Matrix (3x) mode here! -->
<!-- ![Charm Studio Preview](./docs/preview.png) -->

---

## ✨ Features

* **Real Go WASM Rendering Engine** — Evaluates layouts using compiled `charm.land/lipgloss/v2`, `charm.land/bubbletea/v2`, and `charm.land/bubbles/v2` (not a CSS approximation).
* **3× Responsive Breakpoint Matrix** — Preview **Compact (`58×18`)**, **Standard (`80×24`)**, and **Wide (`116×30`)** simultaneously—or switch to **Single Viewport** and drag the `⌟` corner handle to resize cell-by-cell.
* **Box-Model DevTools & Overflow Warnings** — Hover or click any pane to inspect exact **Margin**, **Padding**, and **Content** cell bounds, plus automatic overflow alerts.
* **Interactive Bubbles v2 Inside Panes** — Click into a pane and use `↑/↓`, `j/k`, `/`, or type directly to drive live `list`, `table`, `viewport`, and `textinput` widgets.
* **Full Lip Gloss v2 Style Controls** — Per-edge borders (`Top/Right/Bottom/Left`), horizontal/vertical alignment, `Bold/Italic/Faint/Underline`, `Truncate`, `Fork Style`, and paired `LightDark` color tokens.
* **Color Profile Downsampling Simulator** — Test `TrueColor (24-bit)`, `ANSI 256`, `ANSI 16`, and `ASCII` powered by `charmbracelet/colorprofile`.
* **Layout Tree Builder & Templates** — Add boxes, split horizontally/vertically (`JoinHorizontal` / `JoinVertical`), reorder nodes, toggle v2 `NewLayer` modal overlays, or start from 4 built-in templates.
* **Import `.go` Files or Public GitHub Repos** — Upload local `styles.go` / `ir.json` files or pull `lipgloss.NewStyle()` definitions and adaptive colors straight from a public GitHub repo.
* **Custom Theme Uploader & Fonts** — Import custom JSON color schemes, create your own theme tokens, and switch preview monospace fonts in Settings.
* **Clean Go Code Export** — Generates copy-ready `styles.go`, `layout.go`, runnable `main.go`, and portable `ir.json`.
* **Save, Share & Cloud Sync** — `⌘Z` Undo/Redo, compressed `#s=...` shareable URL links, multi-project local storage, and optional **GitHub OAuth + Supabase** cloud sync.
* **Wails v3 Desktop Companion & Native PTY Runner** — Run real Go TUI binaries inside `charmbracelet/x/xpty` + `charmbracelet/x/vt` with incremental `go build` on save, streamed live to `xterm.js`.
* **Worktree-Isolated MCP Server ("Vibe Coding")** — Built-in MCP HTTP/SSE/Stdio server exposing live layout IR, selection, theme tokens, Charm v2 migration rules, `astsync` tools, and isolated `git worktree` preview branches for AI coding agents.

---

## 🚀 Quick Start (Local Development)

### Prerequisites
* **Go 1.26+**
* **Node.js 20+**

### 1. Build the Go WASM Engine
```bash
cd engine
bash build-wasm.sh
```
This compiles `charm.land/lipgloss/v2` + `bubbles/v2` to `public/studio.wasm` and copies `wasm_exec.js`.

### 2. Run the Web Studio
```bash
cd ..
npm install
npm run dev
```
Open **`http://localhost:5173`**.

---

## ☁️ Optional: Enable GitHub Login & Cloud Sync (Supabase)

Charm Studio works locally out of the box with zero backend. To enable **Sign in with GitHub**, cloud-synced projects, and `?p=<id>` share links:

1. Create a free project at [supabase.com](https://supabase.com).
2. Run this schema in the Supabase **SQL Editor**:
   ```sql
   create table public.projects (
     id uuid primary key,
     user_id uuid references auth.users(id) on delete cascade not null,
     name text not null,
     schema_version int not null default 1,
     template_id text not null,
     palette_id text not null,
     ir_json jsonb not null,
     is_public boolean not null default false,
     updated_at timestamptz not null default now()
   );

   alter table public.projects enable row level security;

   create policy "Users manage own projects" on public.projects
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

   create policy "Anyone can view public projects" on public.projects
     for select using (is_public = true);
   ```
3. Enable **GitHub** under **Authentication → Providers** using a GitHub OAuth App with callback URL `https://<YOUR_PROJECT_REF>.supabase.co/auth/v1/callback`.
4. Under **Authentication → URL Configuration**, set **Site URL** to `http://localhost:5173` and add `http://localhost:5173/**` (plus your production URL if deployed) to **Redirect URLs**.
5. Create `.env.local` in the repository root (never commit this file!):
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   ```
6. Restart `npm run dev`.

---

### 3. Optional: Run Wails v3 Desktop Companion (Native PTY + MCP + Worktrees)
```bash
# Headless companion bridge (connects to Vite dev UI at http://127.0.0.1:43120 + MCP at :43121)
cd desktop
go mod tidy
go run . --headless

# Or run the full Wails v3 native desktop window (after npm run build + copying dist/)
cd desktop
task build
```

---

## 🧱 Architecture

```text
charm-studio/
├── engine/               # Go WASM & native Go layout, AST, PTY, MCP, and Git worktree engine
│   ├── main.go           # Resolves constraints, composites v2 Canvas, emits cells + telemetry
│   ├── astsync/          # dave/dst AST parser, surgical Go patcher & ComputeGoDiff
│   ├── ptyrunner/        # fsnotify watcher + incremental go build + xpty/vt runner
│   ├── mcp/              # Embedded MCP JSON-RPC 2.0 server (Stdio + Streamable HTTP/SSE)
│   ├── worktree/         # Git worktree session manager & AST/line diff engine
│   ├── wasm_stubs/       # Minimal GOOS=js build-tag stubs for bubbletea/v2 & clipboard
│   └── build-wasm.sh
├── desktop/              # Wails v3 (v3.0.0+) Go 1.26+ desktop companion host
│   ├── main.go           # Wails v3 application, --headless bridge, --mcp-stdio, embedded dist/
│   ├── services.go       # Native StudioService RPCs (astsync, PTY, MCP, worktree)
│   └── bridge.go         # Local HTTP/WebSocket bridge for browser dev mode
└── src/                  # Vite + React + TypeScript studio UI
    ├── App.tsx                  # Studio shell, modals, auth & cloud sync lifecycle
    ├── previewTransport.ts      # PreviewTransport abstraction (WasmTransport + WailsTransport)
    ├── DesktopCompanionModal.tsx# Native PTY, MCP agent config & git worktree diff UI
    ├── store/studioStore.ts     # Centralized layout tree state, desktop/PTY/MCP state & undo/redo
    ├── components/              # CanvasToolbar, PropertyInspector, CodePreviewDrawer
    ├── TerminalViewport.tsx     # HiDPI Canvas WASM grid + xterm.js Native PTY renderer
    ├── LayersPanel.tsx          # Layout Tree builder & v2 Layer toggles
    ├── codegen.ts               # Idiomatic Go v2 generator (theme_gen.go, layout_gen.go, model/update/view)
    ├── goImporter.ts            # Go AST/regex style/color extractor & GitHub repo scanner
    └── projectsStore.ts         # Hybrid localStorage + Supabase cloud project store
```

---

## 🗺️ Roadmap Ideas

* Local CLI companion (`charmstudio dev`) using `go build -overlay` to hot-reload and inspect existing Bubble Tea `tea.Model` components directly from disk
* Interactive `huh` form previews
* Bundled WOFF2 Nerd Fonts for consistent glyph rendering across platforms
* One-click `.tape` (`vhs`) / `freeze` snapshot export

---

## 📄 License

[MIT](./LICENSE)
