# Charmbracelet Support Checklist

Use this checklist to track library and component support as you build out your TUI visual editor.

## Phase 1: Canvas & Layout Engine (`lipgloss`)
- [ ] **Box Model:** Width, height, max-width, max-height, padding (top/right/bottom/left), and margins.
- [ ] **Borders & Dividers:** Border styles (rounded, thick, double, normal, hidden, custom) and per-side border toggles.
- [ ] **Typography & Colors:** Foreground/background colors (HEX, ANSI, AdaptiveColor for light/dark terminals), bold, italic, underline, strikethrough, and faint text.
- [ ] **Alignment & Positioning:** Horizontal alignment (left, center, right), vertical alignment (top, center, bottom), and `Place()` coordinates.
- [x] **Layout Compositors:** `JoinHorizontal` (rows/columns) and `JoinVertical` (stacks) to build split panes, headers, and grids.

## Phase 2: Core UI Components (`bubbles`)
- [x] **Text Input (`textinput`):** Single-line input with placeholder, prompt character, echo mode (normal/password/none), and character limit.
- [ ] **Text Area (`textarea`):** Multi-line editor with line numbers, cursor styling, and soft-wrapping.
- [ ] **Table (`table`):** Columns, rows, selectable row highlight styles, and header/border styling.
- [ ] **List (`list`):** Filterable item list with title, pagination, status bar, and custom item delegates.
- [x] **Viewport (`viewport`):** Scrollable content container for long text or overflow areas.
- [ ] **Progress Bar (`progress`):** Determinate bar with solid fill or color gradients, plus percentage display.
- [ ] **Spinner (`spinner`):** Animated loading indicators (line, dot, mini-dot, jump, pulse, points, globe, moon, monkey).
- [ ] **File Picker (`filepicker`):** Directory browser with file-extension filtering and permission/size toggles.
- [ ] **Paginator (`paginator`):** Dot-style (`• • ○`) or Arabic-number (`1/5`) page indicators.
- [ ] **Help (`help`):** Auto-generated keybinding footer/legend (short single-line vs. full multi-column view).
- [ ] **Timer & Stopwatch (`timer` / `stopwatch`):** Countdown and count-up displays with custom time formatting.

## Phase 3: Interactive Forms & Prompts (`huh`)
- [ ] **Input (`Input`):** Styled single-line form field with built-in validation rules and error states.
- [ ] **Text (`Text`):** Multi-line form field with line limits.
- [ ] **Select (`Select`):** Single-choice dropdown/radio list with filtering.
- [ ] **MultiSelect (`MultiSelect`):** Checkbox list with min/max selection limits.
- [x] **Confirm (`Confirm`):** Affirmative/negative toggle buttons (e.g., Yes/No).
- [ ] **Note (`Note`):** Read-only callout or instruction block inside a form.
- [ ] **Form & Group Containers:** Multi-step wizard pagination and built-in theme presets (Charm, Dracula, Catppuccin, Base16).

## Phase 4: Rich Content, Themes & Polish
- [ ] **Markdown Renderer (`glamour`):** Rich text block supporting headings, code syntax highlighting, tables, and built-in themes (`dark`, `light`, `dracula`, `tokyo-night`, `pink`).
- [x] **Color Swatches (CharmTone):** Pre-loaded Charmbracelet brand color palettes for quick color-picker presets.
- [x] **Terminal Color Simulation (`colorprofile`):** Preview toggle to simulate how the UI degrades on TrueColor vs. 256-color vs. 16-color terminals.
- [ ] **Spring Animations (`harmonica`):** Optional physics parameters (frequency and damping) for sliding drawers or smooth progress bars.
- [x] **App Shell Boilerplate (`bubbletea`):** Code exporter wiring the visual tree into `Init()`, `Update()`, and `View()`.

## Phase 5: Low-Level Drawing & Advanced Primitives (Optional)
- [ ] **Screen Primitives (`ultraviolet`):** Direct cell manipulation, cursor positioning, and raw screen rendering for custom graphics.
- [ ] **2D Cell Buffer (`x/cellbuf`):** Drawing custom shapes, overlapping layers, or freeform canvases before flushing to the screen.
