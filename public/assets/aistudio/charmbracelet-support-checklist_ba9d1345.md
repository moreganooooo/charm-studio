# Charmbracelet Support Checklist

Use this checklist to track library and component support as you build out your TUI visual editor.

## Phase 1: Canvas & Layout Engine (`lipgloss`)
- [x] **Box Model:** Width, height, max-width, max-height, padding (top/right/bottom/left), and margins.
- [x] **Borders & Dividers:** Border styles (rounded, thick, double, normal, hidden, custom) and per-side border toggles.
- [x] **Typography & Colors:** Foreground/background colors (HEX, ANSI, AdaptiveColor for light/dark terminals), bold, italic, underline, strikethrough, and faint text.
- [x] **Alignment & Positioning:** Horizontal alignment (left, center, right), vertical alignment (top, center, bottom), and `Place()` coordinates.
- [x] **Layout Compositors:** `JoinHorizontal` (rows/columns) and `JoinVertical` (stacks) to build split panes, headers, and grids.

## Phase 2: Core UI Components (`bubbles`)
- [x] **Text Input (`textinput`):** Single-line input with placeholder, prompt character, echo mode (normal/password/none), and character limit.
- [x] **Text Area (`textarea`):** Multi-line editor with line numbers, cursor styling, and soft-wrapping.
- [x] **Table (`table`):** Columns, rows, selectable row highlight styles, and header/border styling.
- [x] **List (`list`):** Filterable item list with title, pagination, status bar, and custom item delegates.
- [x] **Viewport (`viewport`):** Scrollable content container for long text or overflow areas.
- [x] **Progress Bar (`progress`):** Determinate bar with solid fill or color gradients, plus percentage display.
- [x] **Spinner (`spinner`):** Animated loading indicators (line, dot, mini-dot, jump, pulse, points, globe, moon, monkey).
- [x] **File Picker (`filepicker`):** Directory browser with file-extension filtering and permission/size toggles.
- [x] **Paginator (`paginator`):** Dot-style (`• • ○`) or Arabic-number (`1/5`) page indicators.
- [x] **Help (`help`):** Auto-generated keybinding footer/legend (short single-line vs. full multi-column view).
- [x] **Timer & Stopwatch (`timer` / `stopwatch`):** Countdown and count-up displays with custom time formatting.

## Phase 3: Interactive Forms & Prompts (`huh`)
- [x] **Input (`Input`):** Styled single-line form field with built-in validation rules and error states.
- [x] **Text (`Text`):** Multi-line form field with line limits.
- [x] **Select (`Select`):** Single-choice dropdown/radio list with filtering.
- [x] **MultiSelect (`MultiSelect`):** Checkbox list with min/max selection limits.
- [x] **Confirm (`Confirm`):** Affirmative/negative toggle buttons (e.g., Yes/No).
- [x] **Note (`Note`):** Read-only callout or instruction block inside a form.
- [x] **Form & Group Containers:** Multi-step wizard pagination and built-in theme presets (Charm, Dracula, Catppuccin, Base16).

## Phase 4: Rich Content, Themes & Polish
- [x] **Markdown Renderer (`glamour`):** Rich text block supporting headings, code syntax highlighting, tables, and built-in themes (`dark`, `light`, `dracula`, `tokyo-night`, `pink`).
- [x] **Color Swatches (CharmTone):** Pre-loaded Charmbracelet brand color palettes for quick color-picker presets.
- [x] **Terminal Color Simulation (`colorprofile`):** Preview toggle to simulate how the UI degrades on TrueColor vs. 256-color vs. 16-color terminals.
- [x] **Spring Animations (`harmonica`):** Optional physics parameters (frequency and damping) for sliding drawers or smooth progress bars.
- [x] **App Shell Boilerplate (`bubbletea`):** Code exporter wiring the visual tree into `Init()`, `Update()`, and `View()`.

## Phase 5: Low-Level Drawing & Advanced Primitives (Optional)
- [x] **Screen Primitives (`ultraviolet`):** Direct cell manipulation, cursor positioning, and raw screen rendering for custom graphics.
- [x] **2D Cell Buffer (`x/cellbuf`):** Drawing custom shapes, overlapping layers, or freeform canvases before flushing to the screen.
