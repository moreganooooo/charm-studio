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

---

## 🚀 Quick Start (Local Development)

### Prerequisites
* **Go 1.26+**
* **Node.js 20+**

### 1. Build the Go WASM Engine
```bash
cd engine
./build-wasm.sh
```
This compiles `charm.land/lipgloss/v2` + `bubbles/v2` to `web/public/studio.wasm` and copies `wasm_exec.js`.

### 2. Run the Web Studio
```bash
cd ../web
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
5. Create `web/.env.local` (never commit this file!):
   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   ```
6. Restart `npm run dev`.

---

## 🧱 Architecture

```text
charm-studio/
├── engine/               # Go WASM layout & Bubbles v2 evaluator
│   ├── main.go           # Resolves constraints, composites v2 Canvas, emits cells + telemetry
│   ├── wasm_stubs/       # Minimal GOOS=js build-tag stubs for bubbletea/v2 & clipboard
│   └── build-wasm.sh
└── web/                  # Vite + React + TypeScript studio UI
    └── src/
        ├── App.tsx              # Studio shell, Inspector, Undo/Redo, Hero UI
        ├── TerminalViewport.tsx # HiDPI Canvas cell-grid renderer + SVG DevTools overlay
        ├── LayersPanel.tsx      # Layout Tree builder & v2 Layer toggles
        ├── codegen.ts           # Idiomatic Go v2 generator (styles.go, layout.go, main.go)
        ├── goImporter.ts        # Client-side Go style/color extractor & GitHub repo scanner
        └── projectsStore.ts     # Hybrid localStorage + Supabase cloud project store
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
