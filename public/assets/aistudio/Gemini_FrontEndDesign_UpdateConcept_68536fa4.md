Markdown  
\# Charm Studio — Front-End UX/UI Redesign Specification (Charm Aubergine \+ 3-Lens Progressive Disclosure)

\#\# 1\. Objective & Core UX Shift  
Redesign the front-end UX/UI of **\*\*Charm Studio\*\*** from an always-on, dense developer cockpit into a **\*\*visuals-first, beginner-welcoming WYSIWYG TUI builder\*\*** inspired by Charmbracelet's aesthetic, while keeping **\*\*100% of our existing Go WASM, Wails v3 Native PTY, \`dave/dst\` AST sync, and 4-file modular Go v2 codegen capabilities intact\*\***.

\#\#\# Core Design Pillars  
1\. **\*\*Charm Aubergine Visual Identity:\*\*** Replace cold blue-gray surfaces with a deep aubergine ground (\`\#150f1d\`), elevated card/rail surfaces (\`\#20162d\`), deep code surface (\`\#0f0a16\`), hot pink primary accents (\`\#ff5eae\`), lilac Lip Gloss annotations (\`\#b9a2ff\`), and mint live-sync indicators (\`\#6dffc2\`). Pair **\*\*Bricolage Grotesque\*\*** (UI) with **\*\*JetBrains Mono\*\*** (terminal canvas, Go types, and code rails).  
2\. **\*\*Three-Lens Progressive Disclosure (\`Visual\` \| \`Hybrid\` \| \`Code\`):\*\*** A single centered pill switcher in the top bar controls UI density without losing state (\`selectedId\`, \`ir\`, \`past\`/\`future\` undo stack, or live Bubbles interaction):  
   \- **\*\*\`Visual\` Lens (Default on First Open):\*\*** Terminal preview is the uncrowded hero. Left outline uses plain, human-friendly labels (\`Navigation\`, \`Services\`, \`Status bar\`). Right side renders a floating \`400px\` contextual property card (*\*Breathing room\**, *\*Border\**, *\*Accent\**) with a live mint bridge callout (\`"Go updated to Padding(1, 2). Switch to Hybrid to see it."\`) and a collapsed \`40px\` vertical \`"Show the Go"\` rail on the right edge.  
   \- **\*\*\`Hybrid\` Lens (Learn-by-Seeing Bridge):\*\*** Reveals Charmbracelet v2 Go types (\`list.Model\`, \`table.Model\`, \`viewport.Model\`, \`textinput.Model\`, \`huh.Form\`) in the left outline; draws a translucent pink padding band (\`rgba(255, 94, 174, 0.25)\`) over the selected node's padding cells on the terminal; docks a \`340px\` inspector pairing plain labels with Lip Gloss v2 API names (\`Breathing room · lipgloss.Padding\`) \+ an interactive TUI box-model diagram; and renders a linked Go snippet card beneath the terminal with the active \`Padding(...)\` / \`Border(...)\` line highlighted in pink.  
   \- **\*\*\`Code\` Lens (Full Power-User Cockpit):\*\*** Docks the full multi-file Go v2 code rail (\`ui/theme\_gen.go\`, \`ui/layout\_gen.go\`, \`model.go\`, \`update.go\`, \`view.go\`, \`fixtures\_preview\_gen.go\`, \`main.go\`, \`go.mod\`, \`demo.tape\`, \`gum.sh\`) on \`\#0f0a16\` with line-level pink highlighting, exposes the 3× Responsive Breakpoint Matrix (\`58×18\`, \`80×24\`, \`116×30\`), Cols/Rows numeric steppers, Color Profile simulator (\`TrueColor\`, \`ANSI 256\`, \`ANSI 16\`, \`ASCII\`), WASM/Native PTY transport switch, and a compact inline spacing stepper pinned to the bottom of the code rail.  
\---

\#\# 2\. Architectural Guardrails (DO NOT BREAK)  
Before modifying any files, preserve all existing backend, transport, and state contracts:  
1\. **\*\*Preserve Engine & Desktop Integrations:\*\*** Do NOT alter \`engine/\*\`, \`desktop/\*\`, \`src/wasmEngine.ts\`, \`src/previewTransport.ts\`, \`src/codegen.ts\`, \`src/zipExport.ts\`, \`src/astDiff.ts\`, or \`src/projectsStore.ts\`.  
2\. **\*\*Preserve \`studioStyles.ts\` Legacy Helper Exports:\*\*** Existing components (\`src/components/PropertyInspector.tsx\`, \`src/components/CodePreviewDrawer.tsx\`, \`src/LayersPanel.tsx\`, \`src/DesktopCompanionModal.tsx\`, \`src/ImportModal.tsx\`) import helper functions and style objects from \`src/components/studioStyles.ts\` (\`btnStyle\`, \`inputStyle\`, \`pillStyle\`, \`segBtn\`, \`checkLbl\`, \`chkAcc\`, \`dot\`, \`labelCol\`, \`microTag\`, \`miniBtn\`). Keep all of these exported and mapped to the new \`--cs-\*\` CSS variables so existing modals and drawers compile with zero errors and automatically inherit the Charm Aubergine theme.  
3\. **\*\*Keep Visual Edits 100% Deterministic:\*\*** Every stepper, swatch, and border toggle mutates \`ir\` directly through \`useStudioStore()\` actions (\`updateSelectedStyle\`, \`updateQuad\`, \`updateNode\`, \`updateToken\`) with instant WASM/Native rendering and zero LLM latency\[cite: 8, 9\].

\---

\#\# 3\. Design Tokens & Typography (\`index.html\` & \`src/index.css\`)

\#\#\# Step 3.1: \`index.html\`  
Add Google Fonts for \`Bricolage Grotesque\` and \`JetBrains Mono\` inside \`\<head\>\`:  
\`\`\`html  
\<link rel="preconnect" href="\[https\://fonts.googleapis.com\](https\://fonts.googleapis.com)" /\>  
\<link rel="preconnect" href="\[https\://fonts.gstatic.com\](https\://fonts.gstatic.com)" crossorigin /\>  
\<link  
  href="\[https\://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700\&family=JetBrains+Mono:wght@400;500;600\&display=swap\](https\://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;600;700\&family=JetBrains+Mono:wght@400;500;600\&display=swap)"  
  rel="stylesheet"  
/\>

### **Step 3.2: src/index.css**

Define the Charm Aubergine CSS custom properties (including backwards-compatible \--cs-\* aliases used by existing modals/drawers) plus a \[data-theme="light"\] override:

CSS  
:root,  
\[data-theme="dark"\] {  
  /\* Core Charm Aubergine Surfaces \*/  
  \--cs-bg-ground: \#150f1d;  
  \--cs-bg-surface: \#20162d;  
  \--cs-bg-code: \#0f0a16;  
  \--cs-border: \#3a2a4f;  
  \--cs-border\-strong: \#4e396b;  
  \--cs-border\-subtle: \#2d203f;

  /\* Text Hierarchy \*/  
  \--cs-text: \#f4eaff;  
  \--cs-text-heading: \#ffffff;  
  \--cs-text-strong: \#f4eaff;  
  \--cs-text-muted: \#a291bd;  
  \--cs-text-dim: \#7e6d99;

  /\* Charm Accents \*/  
  \--cs-pink: \#ff5eae;  
  \--cs-pink-soft: \#ff8cc6;  
  \--cs-pink-bg: rgba(255, 94, 174, 0.18);  
  \--cs-pink-border: rgba(255, 94, 174, 0.45);  
  \--cs-pink-band: rgba(255, 94, 174, 0.25);

  \--cs-lilac: \#b9a2ff;  
  \--cs-lilac-text: \#c8b6ff;  
  \--cs-mint: \#6dffc2;  
  \--cs-mint-bg: rgba(109, 255, 194, 0.14);  
  \--cs-mint-border: rgba(109, 255, 194, 0.4);  
  \--cs-gold: \#ffd37a;

  /\* Legacy Component Variable Aliases \*/  
  \--cs-panel: \#1a1224;  
  \--cs-surface: \#20162d;  
  \--cs-card: \#20162d;  
  \--cs-card-alt: \#1b1326;  
  \--cs-nav\-bg: \#120c19;  
  \--cs-input: \#140e1c;  
  \--cs-btn-bg: \#261b36;  
  \--cs-btn-text: \#f4eaff;  
  \--cs-btn-border: \#3a2a4f;

  \--cs-shadow: 0 18px 40px rgba(0, 0, 0, 0.48);  
  \--cs-font\-ui: "Bricolage Grotesque", system-ui, \-apple-system, sans-serif;  
  \--cs-font\-mono: "JetBrains Mono", "SF Mono", Menlo, monospace;  
}

\[data-theme="light"\] {  
  \--cs-bg-ground: \#f7f3fc;  
  \--cs-bg-surface: \#ffffff;  
  \--cs-bg-code: \#f0e8fa;  
  \--cs-border: \#dfd3f0;  
  \--cs-border\-strong: \#c8b5e3;  
  \--cs-border\-subtle: \#ece3f7;

  \--cs-text: \#1c1326;  
  \--cs-text-heading: \#120b1a;  
  \--cs-text-strong: \#1c1326;  
  \--cs-text-muted: \#6c5a85;  
  \--cs-text-dim: \#8a78a3;

  \--cs-pink: \#e03e92;  
  \--cs-pink-soft: \#c42979;  
  \--cs-pink-bg: rgba(224, 62, 146, 0.12);  
  \--cs-pink-border: rgba(224, 62, 146, 0.4);  
  \--cs-pink-band: rgba(224, 62, 146, 0.22);

  \--cs-lilac: \#6d4aff;  
  \--cs-lilac-text: \#5b37f0;  
  \--cs-mint: \#0d9668;  
  \--cs-mint-bg: rgba(13, 150, 104, 0.12);  
  \--cs-mint-border: rgba(13, 150, 104, 0.35);  
  \--cs-gold: \#c98612;

  \--cs-panel: \#ffffff;  
  \--cs-surface: \#ffffff;  
  \--cs-card: \#ffffff;  
  \--cs-card-alt: \#faf7fe;  
  \--cs-nav\-bg: \#f3ecfc;  
  \--cs-input: \#f7f3fc;  
  \--cs-btn-bg: \#f3ecfc;  
  \--cs-btn-text: \#1c1326;  
  \--cs-btn-border: \#dfd3f0;

  \--cs-shadow: 0 14px 32px rgba(28, 19, 38, 0.12);  
}

\* {  
  box-sizing: border-box;  
}

html,  
body,  
\#root {  
  height: 100%;  
  margin: 0;  
  background: var(--cs-bg-ground);  
  color: var(--cs-text);  
  font-family: var(--cs-font-ui);  
  \-webkit-font\-smoothing: antialiased;  
}

button,  
input,  
select,  
textarea {  
  font-family: inherit;  
}

button {  
  cursor: pointer;  
}

.cs-mono {  
  font-family: var(--cs-font-mono);  
}

## **4\. State & Store Updates (src/types.ts & src/store/studioStore.ts)**

### **Step 4.1: src/types.ts**

Add the StudioLens union type:

TypeScript  
export type StudioLens \= "visual" \| "hybrid" \| "code";

### **Step 4.2: src/store/studioStore.ts**

> 1. **Add "charm-aubergine" as the first/default entry in PALETTES:**

TypeScript  
export const PALETTES: ThemePreset\[\] \= \[  
  {  
    id: "charm-aubergine",  
    label: "Charm Aubergine (Default)",  
    darkBG: true,  
    background: "\#20162d",  
    foreground: "\#f4eaff",  
    tokens: {  
      accent: "\#ff5eae",  
      borderIdle: "\#b9a2ff",  
      textMain: "\#f4eaff",  
      modalGlow: "\#6dffc2",  
      surface: "\#150f1d",  
    },  
  },  
  // Keep all existing palettes below (tokyo-dark, catppuccin, dracula, nord, gruvbox, tokyo-light)  
\];

> 2. **Add activeLens and setActiveLens to StudioStoreValue and StudioProvider:**  
   * Default paletteId to initialDraft?.paletteId ?? "charm-aubergine".  
   * Persist activeLens under localStorage.getItem("charmstudio:activeLens:v1"), defaulting to "visual".  
   * When setActiveLens(lens) is called:  
     * Save to localStorage.  
     * If lens \=== "visual": set showOverlay(false) and viewportMode("single") so the hero terminal is crisp and uncrowded.  
     * If lens \=== "hybrid": set showOverlay(true) so the live pink padding band appears on the terminal.  
     * If lens \=== "code": set showOverlay(true) and setRightTab("code") so the multi-file Go drawer opens immediately.  
   * Add a helper getFriendlyNodeName(node: IRNode): string (or export from src/types.ts) that maps technical IDs / contentTypes into approachable labels for the Visual lens (e.g., "sidebar" → "Navigation", "mainPane" → "Services" or "Main Content", "statusBar" → "Status bar", "bubble:list" → "Navigation list", "bubble:table" → "Data table", "bubble:viewport" → "Scrollable view", "bubble:textinput" → "Text input", "huh:form" → "Interactive form", "JoinHorizontal" → "Row", "JoinVertical" → "Stack").  
   * Add a helper getCharmGoTypeLabel(node: IRNode): string for Hybrid and Code lenses ("bubble:list" → "list.Model", "bubble:table" → "table.Model", "bubble:viewport" → "viewport.Model", "bubble:textinput" → "textinput.Model", "huh:form" → "huh.Form", "JoinHorizontal" → "JoinHorizontal", "JoinVertical" → "JoinVertical", default → "lipgloss.Style").

## **5\. Component Architecture & File-by-File Implementation**

### **5.1 src/components/studioStyles.ts**

* Export CHARM\_TOKENS and studioStyles (shell, topBar, lensPillGroup, primaryCta, secondaryBtn, leftRail, floatingCard, dockedRightRail, codeCard, stepBtn).  
* **Keep and re-skin** existing exported style helpers (btnStyle, inputStyle, pillStyle, segBtn, checkLbl, chkAcc, dot, labelCol, microTag, miniBtn) using CHARM\_TOKENS / \--cs-\* variables so PropertyInspector.tsx, CodePreviewDrawer.tsx, and modals compile and match the Charm Aubergine palette.

### **5.2 src/components/LensTopBar.tsx (New Component)**

Create a 56px top bar (studioStyles.topBar) with three zones:

* **Left:** Charm Studio brand mark (hot-pink dot \#ff5eae \+ Charm Studio in bold Bricolage Grotesque), Scenes button (opens template gallery modal/popover), and ↶ / ↷ Undo/Redo buttons wired to undo() / redo().  
* **Center:** Centered pill group (studioStyles.lensPillGroup) with three buttons: **Visual**, **Hybrid**, **Code**. Active lens pill has background: \#ff5eae, color: \#150f1d, fontWeight: 700\.  
* **Right (Progressive Disclosure):**  
  * Visual lens: Shows a subtle "More ▾" menu (containing Import Go/GitHub, Projects, Settings, Glossary, Light/Dark UI toggle) \+ primary hot-pink **Export Go** CTA button (\#ff5eae fill, \#150f1d bold text).  
  * Hybrid lens: Reveals **Import Go** and **⌘K** (Command Palette) buttons alongside **Export Go**.  
  * Code lens: Reveals **Import Go**, **Desktop · PTY** (DesktopCompanionModal trigger), **⌘K**, **Share** (shareLink()), and **Export Go**.

### **5.3 src/LayersPanel.tsx (Left Outline Rail — Lens-Adaptive)**

Update LayersPanel.tsx to read activeLens from useStudioStore():

* **Width & Surface:** 260px width on \--cs-bg-ground with 1px solid var(--cs-border) right border.  
* **In Visual Lens:**  
  * Title reads **OUTLINE** (muted uppercase 11px, letter-spacing: 0.08em).  
  * Render clean tree rows with subtle icons and friendly human names (getFriendlyNodeName(node)), hiding raw Go type badges, collapse-breakpoint badges, and dense toolbar clutter.  
  * Selected row uses background: var(--cs-pink-bg), border: 1px solid var(--cs-pink-border), and \#f4eaff text.  
  * Bottom of outline has a single clean **\+ Add block** button (opens quick component picker).  
* **In Hybrid and Code Lenses:**  
  * Display the node's id alongside its right-aligned JetBrains Mono Go type badge (list.Model, table.Model, huh.Form, etc.) in \--cs-lilac (\#b9a2ff).  
  * Show quick structure buttons (Box, Split R, Split B, Clone, Del) and the Floating Overlays (+ Layer) section.

### **5.4 src/TerminalViewport.tsx & Center Canvas Stage (src/App.tsx)**

Update TerminalViewport.tsx and the center stage in src/App.tsx:

> 1. **Default Font Stack:** Use "JetBrains Mono", "SF Mono", Menlo, monospace.  
> 2. **Lens-Aware Box-Model Overlay (TerminalViewport.tsx):**  
   * Pass activeLens (or overlayMode: "none" \| "padding-band" \| "full-box-model") into TerminalViewport.  
   * In **Visual** lens: Hide box-model overlay rectangles; show only a crisp \#ff5eae selection outline around selectedTel.border on hover/selection so the terminal preview looks clean and authentic.  
   * In **Hybrid** lens: Highlight the selected node's padding band in translucent Charm pink (fill="rgba(255, 94, 174, 0.25)", stroke="\#ff5eae", strokeWidth={1.5}) and show a compact pill badge on the terminal header indicating the padding cells (e.g., Padding(1, 2\) in \#ff5eae / \#b9a2ff).  
   * In **Code** lens: Render full Margin (\#fb923c), Padding (\#4ade80), and Content (\#60a5fa) box-model DevTools overlays when showOverlay is active.  
> 3. **Visual Coach Mark (Dismissible):**  
   * In Visual lens (until dismissed in localStorage), display a sleek floating mint-accented pill above or below the terminal: ✦ Drag any edge or click a pane. Switch to Hybrid to see the live Go.  
> 4. **Hybrid Linked Go Code Card (Below Terminal in Hybrid Lens):**  
   * When activeLens \=== "hybrid", render a compact codeCard (\#0f0a16 background, 1px solid \#3a2a4f, borderRadius: 16\) directly beneath the terminal preview showing the active style/layout lines from generateThemeGenGo(ir) / generateLayoutGenGo(ir) for selectedNode.  
   * Highlight the line matching the selected node's Padding(...) or Border(...) with a left 3px solid \#ff5eae bar and background: rgba(255, 94, 174, 0.14) so changing a stepper immediately lights up the corresponding Go code line.  
> 5. **Code Lens Stage Controls:**  
   * When activeLens \=== "code", render the compact toolbar above the terminal for Single vs. 3× Breakpoint Matrix (58×18, 80×24, 116×30), Cols/Rows numeric inputs, Color Profile selector (TrueColor, ANSI 256, ANSI 16, ASCII), and WASM vs. Native PTY transport toggle.

### **5.5 src/components/LensRightRail.tsx (Morphing Right Inspector / Code Rail)**

Create src/components/LensRightRail.tsx to render the right-hand experience tailored to activeLens:

> 1. **Visual Lens Mode:**  
   * **Floating Contextual Card (400px wide, borderRadius: 16, \#20162d surface, 1px solid \#3a2a4f, \--cs-shadow):**  
     * Header: Friendly node title (getFriendlyNodeName(selectedNode)) \+ subtle "Change widget" dropdown (Plain Text, Navigation List, Data Table, Scrollable Log, Text Input, Interactive Form).  
     * **Breathing room (Padding):** Two clean \- / \+ stepper rows (Top & Bottom \= padding\[0\], Left & Right \= padding\[1\]) that update padding symmetrically (\[v, h, v, h\]) via updateSelectedStyle.  
     * **Border:** 4 visual border-shape buttons (Rounded ╭─╮, Clean ┌─┐, Bold ┏━┓, None).  
     * **Accent Color:** Circular color swatches mapped to ir.tokens (\#ff5eae Pink, \#b9a2ff Lilac, \#6dffc2 Mint, \#ffd37a Gold, plus active theme tokens) updating borderColor / fg.  
     * **Live Mint Bridge Footer:** A rounded pill/banner in \--cs-mint-bg (border: 1px solid var(--cs-mint-border), color: \#6dffc2) displaying: Go updated to Padding(\${padV}, \${padH}). Switch to Hybrid to see it → (clicking it switches activeLens to "hybrid").  
   * **Collapsed Right Edge Tab (40px wide):**  
     * A vertical rail pinned to the far right edge (writing-mode: vertical-rl, transform: rotate(180deg)) labeled **Show the Go** with a lilac code icon (\#b9a2ff). Clicking it switches activeLens to "hybrid" (or "code").  
> 2. **Hybrid Lens Mode:**  
   * **Docked Right Rail (340px wide, \#150f1d background, 1px solid \#3a2a4f left border):**  
     * Header showing node \#id \+ Go type chip (list.Model, table.Model, etc.) and a toggle pill between **Inspector** and **Full Props**.  
     * **Interactive TUI Box-Model Diagram:** Visual nested rectangle showing Margin (0), Border (rounded), and interactive \- / \+ steppers directly inside the Padding band (top/bottom, left/right).  
     * **Paired Vocabulary Controls:** Each setting displays its friendly name alongside its Lip Gloss v2 API signature in \#b9a2ff (Breathing room · lipgloss.Padding, Border · lipgloss.Border, Text & Border Color · lipgloss.LightDark).  
     * When **Full Props** is toggled on (or for editing Table rows, List items, and Huh form fields), render \<PropertyInspector /\> cleanly inside the rail so zero capabilities are hidden.  
> 3. **Code Lens Mode:**  
   * **Docked Multi-File Go Rail (380px wide, \#0f0a16 deep code background, 1px solid \#3a2a4f left border):**  
     * Renders \<CodePreviewDrawer /\> (with tabs for theme\_gen.go, layout\_gen.go, model.go, update.go, view.go, fixtures\_preview\_gen.go, main.go, go.mod, demo.tape, gum.sh, ir.json, plus the **Live AST Diff** toggle)\[cite: 8\].  
     * Automatically highlights lines referencing the currently selectedId or selectedNode.style with a subtle rgba(255, 94, 174, 0.14) background and 3px solid \#ff5eae left border\[cite: 10\].  
     * **Pinned Bottom Quick-Tweak Stepper:** A compact bar at the bottom of the code rail showing the selected node's Padding(v, h) with \- / \+ steppers so developers can tweak spacing and watch the Go code update live without leaving the Code lens\[cite: 10\].

### **5.6 src/App.tsx (Clean Three-Zone Shell)**

Refactor src/App.tsx layout structure to compose:

> 1. \<LensTopBar /\> at the top (56px).  
> 2. Main flex workspace (flex: 1, overflow: "hidden"):  
   * Left: \<LayersPanel /\> (260px).  
   * Center: Hero stage (flex: 1, background: var(--cs-bg-ground), centered terminal preview \+ dismissible Visual coach mark \+ Hybrid linked Go snippet card).  
   * Right: \<LensRightRail /\> (morphs cleanly between Visual floating card \+ 40px "Show the Go" rail, Hybrid 340px paired inspector, and Code 380px \#0f0a16 code rail)\[cite: 10\].  
> 3. Keep all existing modals mounted and accessible from top-bar / command-palette triggers: ImportModal, DesktopCompanionModal, CharmGlossaryModal, GuideFaqModal, AuthModal, CommandPalette, and the Template/Scene Picker modal\[cite: 8, 10\].

## **6\. Execution Order & Verification Checklist**

Implement in this exact sequence to prevent broken intermediate states:

> 1. Update index.html and src/index.css with Bricolage Grotesque, JetBrains Mono, and the Charm Aubergine \--cs-\* variables.  
> 2. Update src/components/studioStyles.ts with CHARM\_TOKENS and studioStyles while preserving all legacy helper exports (btnStyle, inputStyle, pillStyle, segBtn, checkLbl, chkAcc, dot, labelCol, microTag, miniBtn).  
> 3. Update src/types.ts and src/store/studioStore.ts to add StudioLens, activeLens, setActiveLens, "charm-aubergine" default palette, getFriendlyNodeName, and getCharmGoTypeLabel.  
> 4. Build src/components/LensTopBar.tsx and src/components/LensRightRail.tsx, and update src/LayersPanel.tsx and src/TerminalViewport.tsx for lens-adaptive rendering (including the Hybrid translucent pink padding band).  
> 5. Wire the three-zone shell into src/App.tsx.  
> 6. **Verify:**  
   * Run npm run build (and npx tsc \--noEmit) to confirm zero TypeScript or Vite bundling errors.  
   * Verify first open defaults to Visual lens with Charm Aubergine (\#150f1d / \#20162d / \#ff5eae), friendly outline names, floating property card, live mint bridge banner, and 40px "Show the Go" vertical tab\[cite: 10\].  
   * Verify switching Visual → Hybrid → Code preserves the selected node, undo/redo history, and live Bubbles widget state while revealing Go types, the pink padding band \+ linked Go snippet card, and the full multi-file Go code drawer \+ ZIP export\[cite: 8, 10\].