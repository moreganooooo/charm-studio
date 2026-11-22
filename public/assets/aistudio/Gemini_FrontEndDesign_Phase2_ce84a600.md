

````
# Charm Studio — Phase 2 Prompt: Deep Go-to-Canvas Sync, Cell-Level Padding Bands, Edge Dragging & Bi-Directional Inline Code Editing

## Context & Goal
We have implemented the Charm Aubergine visual identity and the Three-Lens Progressive Disclosure shell (`Visual` | `Hybrid` | `Code` via `LensTopBar.tsx`, `LensRightRail.tsx`, `LayersPanel.tsx`, and `studioStore.ts`).

Now let's elevate **"The Go is Always Linked"** from a visual shell into a true single-source-of-truth interactive engine across `src/store/studioStore.ts`, `src/TerminalViewport.tsx`, `src/codegen.ts`, `src/components/LensRightRail.tsx`, and `src/App.tsx`.

Implement all **six** capabilities below in clean, strongly-typed TypeScript without breaking `engine/*`, `desktop/*`, `src/wasmEngine.ts`, or `src/zipExport.ts`.

---

## Step 1: Extend `studioStore.ts` with Linked-Sync Telemetry & Interaction State
In `src/store/studioStore.ts` (and export supporting types from `src/types.ts`), add state that connects canvas hover/drag/keystrokes directly to the inspector and Go code rail:

1. **Property Hover & Active Property Tracking:**
   ```ts
   export type SyncPropertyKind = "padding" | "padding-v" | "padding-h" | "border" | "colors" | "size" | "widget" | "keybinding";
````

*   
  Add `hoveredProperty: SyncPropertyKind | null` \+ `setHoveredProperty` (used when hovering padding steppers, box-model zones, or border controls).  
* Add `activeProperty: SyncPropertyKind` (default `"padding"`) \+ `setActiveProperty` (updated automatically whenever the user edits padding, border, colors, pane width/height, or widget type so the `Hybrid` Go card and `Code` rail always focus the exact code block just modified).  
2. **Live Keystroke-to-Handler Pulse (`lastKeyPulse`):**  
   * Add `lastKeyPulse: { nodeId: string; key: string; ts: number } | null` \+ `triggerKeyPulse(nodeId: string, key: string)`.  
   * Called by `TerminalViewport` whenever a user presses interactive keys (`ArrowUp`, `ArrowDown`, `j`, `k`, `/`, `Tab`, `Enter`, or text input) inside a live Bubbles/Huh pane.  
3. **Off-Screen 3-Size Fit Check (`matrixFitStatus`):**  
   * Whenever `ir` or `palette` changes (debounced `150ms` after engine ready), run `renderFrame(ir, preset.cols, preset.rows, palette.darkBG, colorProfile)` across all three `MATRIX_PRESETS` (`58×18`, `80×24`, `116×30`) and store:  
   * TypeScript

```
export interface MatrixFitStatus {
  allFit: boolean;
  failingPresets: { title: string; cols: number; rows: number; nodeIds: string[] }[];
}
```

   * 

## **Step 2: Hollow 4-Strip Cell Padding Band & Draggable Pane Split Handles (`src/TerminalViewport.tsx`)**

Upgrade `src/TerminalViewport.tsx` so cell geometry and direct canvas manipulation are 100% authentic:

1. **Hollow 4-Strip Cell-Level Padding Band (No Inner Text Tinting):**  
   * Using `selectedTel.padding` and `selectedTel.content` (emitted in cell coordinates by Go WASM), compute the four perimeter padding strips:  
     * **Top strip:** `{ x: padding.x, y: padding.y, w: padding.w, h: Math.max(0, content.y - padding.y) }`  
     * **Bottom strip:** `{ x: padding.x, y: content.y + content.h, w: padding.w, h: Math.max(0, (padding.y + padding.h) - (content.y + content.h)) }`  
     * **Left strip:** `{ x: padding.x, y: content.y, w: Math.max(0, content.x - padding.x), h: content.h }`  
     * **Right strip:** `{ x: content.x + content.w, y: content.y, w: Math.max(0, (padding.x + padding.w) - (content.x + content.w)), h: content.h }`  
   * Render these 4 strips in the SVG overlay whenever `activeLens === "hybrid"` OR `hoveredProperty` is `"padding"`, `"padding-v"`, or `"padding-h"` (even in `Visual` lens when hovering the Breathing Room stepper\!).  
   * Style the strips with `fill="rgba(255, 94, 174, 0.25)"` and `stroke="#ff5eae"` (`strokeWidth={1}`), boosting opacity to `0.42` on Top+Bottom when `hoveredProperty === "padding-v"` or Left+Right when `hoveredProperty === "padding-h"`.  
   * Render a small floating pill badge on the top-right corner of `selectedTel.border` showing the cell padding count (e.g., `Padding(1, 2)` in `JetBrains Mono`, `#ff5eae` border on `#150f1d`).  
2. **Draggable Split-Edge Handles Between Panes (`"Drag any edge"`):**  
   * Walk `doc.root` for `JoinHorizontal` and `JoinVertical` containers whose visible children have `TelemetryNode` bounds.  
   * Render interactive `6px`\-wide vertical resize handles along the shared seam between adjacent `JoinHorizontal` children (`cursor: "col-resize"`) and horizontal resize handles between `JoinVertical` children (`cursor: "row-resize"`), highlighting in `#ff5eae` on hover/drag.  
   * Dragging a seam snaps to exact terminal cells (`Math.round(deltaPx / cellSize.w)` or `cellSize.h`), updates the left/top sibling's `width` (or `height`) to `{ mode: "fixed", value: nextCells }` via `updateNode`, sets `activeProperty("size")`, and shows a live cell-dimension pill (`34 cols | 48 cols`) while dragging.  
3. **Dispatch Keystroke Pulses:**  
   * Inside `handleKeyDown`, whenever `dispatchKey(...)` returns `true` (or `Tab` cycles focus), call `triggerKeyPulse(selectedId, e.key)`.

## **Step 3: Emit Exact Line-Range Source Maps (`CodeSpanMap`) in `src/codegen.ts`**

Upgrade `src/codegen.ts` so every generated Go file knows the exact `1`\-indexed line numbers for every node and property:

1. **Define & Export `CodeSpan` Types:**  
2. TypeScript

```
export type GeneratedGoFile = "theme_gen.go" | "layout_gen.go" | "model.go" | "update.go" | "view.go";

export interface CodeSpan {
  file: GeneratedGoFile;
  startLine: number;
  endLine: number;
  highlightLine?: number;
  property?: SyncPropertyKind;
}

export type CodeSpanMap = Record<string, CodeSpan[]>;
```

3.   
4. **Add `*WithSpans` Generators (Preserving Existing String Exports):**  
   * Implement line-tracking builders for:  
     * `generateThemeGenGoWithSpans(doc: IRDoc): { code: string; spans: CodeSpanMap }` — records the full `lipgloss.NewStyle()...` chain span for every style/node ID, plus property-specific `highlightLine` entries for `padding` (`.Padding(...)`), `border` (`.Border(...)`), and `colors` (`.BorderForeground(...)` / `.Foreground(...)` / `.Background(...)` / `lipgloss.LightDark(...)`).  
     * `generateLayoutGenGoWithSpans(doc: IRDoc): { code: string; spans: CodeSpanMap }` — records line spans for each node's `.Width(...)`, `.Height(...)`, `JoinHorizontal(...)`, `JoinVertical(...)`, and `NewLayer(...)` block (`property: "size"`).  
     * `generateModelGoWithSpans(doc: IRDoc, modulePath?: string): { code: string; spans: CodeSpanMap }` — records line spans for each Bubbles/Huh widget initialization (`property: "widget"`).  
     * `generateUpdateGoWithSpans(doc: IRDoc, modulePath?: string): { code: string; spans: CodeSpanMap }` — records line spans for each node's `case tea.KeyPressMsg:` / widget update routing block (`property: "keybinding"`).  
     * `generateViewGoWithSpans(doc: IRDoc, modulePath?: string): { code: string; spans: CodeSpanMap }`.  
   * Keep all existing functions (`generateThemeGenGo`, `generateLayoutGenGo`, `generateModelGo`, `generateUpdateGo`, `generateViewGo`) returning `string` via `.code` so `zipExport.ts` and `CodePreviewDrawer.tsx` continue working without changes.

## **Step 4: Full 4-Side Box-Model Diagram & Bi-Directional Inline Code Editing (`src/components/LensRightRail.tsx`)**

Upgrade `src/components/LensRightRail.tsx` so both visual controls and code lines are two-way interactive:

1. **Interactive Vertical \+ Horizontal Padding in `Hybrid` Box-Model Diagram:**  
   * Give the Top/Bottom (`padV = padding[0]`) and Left/Right (`padH = padding[1]`) zones of the TUI box-model diagram independent `-` / `+` steppers (updating `[0, 2]` for vertical and `[1, 3]` for horizontal).  
   * Attach `onMouseEnter` / `onMouseLeave` handlers to both zones calling `setHoveredProperty("padding-v")` and `setHoveredProperty("padding-h")` so hovering the diagram lights up the exact corresponding cell rows or columns on the terminal preview.  
   * Ensure `Border`, `Accent` (`updateToken`), and `Breathing room` controls call `setActiveProperty(...)` on change.  
2. **Live Keystroke Pulse Auto-Jump in `Code` Lens:**  
   * When `activeLens === "code"` and `lastKeyPulse` fires (within the last `1500ms`), highlight the matching `keybinding` span in `update.go` in mint/pink (`rgba(109, 255, 194, 0.16)` with `#6dffc2` left border) and display a subtle badge `"Live KeyPressMsg → update.go"` at the top of the code rail.  
3. **Bi-Directional Inline Go Editing (Click-to-Edit Highlighted Lines):**  
   * In the `Code` rail (and in the `Hybrid` Linked Go Card), make any highlighted style/layout line clickable (`title="Click to edit Go expression directly"`).  
   * Clicking opens a compact inline monospace `<input>` pre-filled with that line (e.g., `.Padding(1, 2)` or `.Border(lipgloss.RoundedBorder())` or `.Width(36)`).  
   * On `Enter`, parse the edited Go snippet back into `IRStyle` / `IRNode` (supporting `.Padding(v, h)` / `.Padding(t, r, b, l)`, `.Border(lipgloss.RoundedBorder|NormalBorder|ThickBorder|DoubleBorder|HiddenBorder)`, `.Width(n)`, `.Height(n)`, and hex color strings `"#..."`, also invoking `parseGoWithDst` when available) and commit to `studioStore.ts` so the WASM terminal preview and `Visual`/`Hybrid` steppers update instantaneously.

## **Step 5: Real Code-Span Linked Card & Multi-Size Fit Pill (`src/App.tsx`)**

Update the center stage in `src/App.tsx`:

1. **Real Sliced Go Snippet Card in `Hybrid` Lens:**  
   * Replace any hardcoded 3-line Go template below the terminal with a dynamic slice from the real `generateThemeGenGoWithSpans`, `generateLayoutGenGoWithSpans`, `generateModelGoWithSpans`, or `generateUpdateGoWithSpans` output matching `(selectedId, activeProperty)`.  
   * Show the real filename (`ui/theme_gen.go`, `ui/layout_gen.go`, `model.go`, or `update.go`) and line numbers in the card header, highlight `span.highlightLine` in Charm pink (`#ff5eae`), and support the same click-to-edit inline Go expression workflow as the `Code` rail.  
2. **Multi-Size Fit Status Pill (`All 3 sizes fit`):**  
   * In `Hybrid` and `Code` lenses, render a crisp status pill next to the viewport controls reading `✓ All 3 sizes fit (58×18 · 80×24 · 116×30)` in `#6dffc2` mint when `matrixFitStatus.allFit` is true, or `⚠ Overflow on Compact (58×18)` in `#ffd37a` gold (clicking selects the overflowing node ID).

## **Step 6: Build & Verify**

1. Run `npx tsc --noEmit` and `npm run build` to verify zero TypeScript or Vite bundling errors.  
2. Confirm:  
   * Hovering `Breathing room` or the `Hybrid` box-model diagram illuminates only the hollow 4-strip cell padding band around the selected pane without tinting inner text.  
   * Dragging a seam between two split panes updates their cell widths/heights live and highlights `Width(...)` in `ui/layout_gen.go`.  
   * Editing `.Padding(2, 4)` or `.Border(...)` inline in the `Hybrid` Go card or `Code` rail immediately updates the WASM terminal preview and syncs the `Visual` steppers.  
   * Pressing `↑/↓` or typing inside a live Bubbles widget pulses the matching `KeyPressMsg` handler in `update.go`.

