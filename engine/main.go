//go:build js && wasm

package main

import (
    "encoding/json"
    "fmt"
    "image/color"
    "sort"
    "strconv"
    "strings"
    "syscall/js"
    "time"

    "charmstudio/engine/astsync"

    "charm.land/bubbles/v2/filepicker"
    "charm.land/bubbles/v2/help"
    "charm.land/bubbles/v2/key"
    "charm.land/bubbles/v2/list"
    "charm.land/bubbles/v2/paginator"
    "charm.land/bubbles/v2/progress"
    "charm.land/bubbles/v2/spinner"
    "charm.land/bubbles/v2/stopwatch"
    "charm.land/bubbles/v2/table"
    "charm.land/bubbles/v2/textarea"
    "charm.land/bubbles/v2/textinput"
    "charm.land/bubbles/v2/timer"
    "charm.land/bubbles/v2/viewport"
    tea "charm.land/bubbletea/v2"
    "charm.land/huh/v2"
    "charm.land/lipgloss/v2"
    "github.com/charmbracelet/colorprofile"
    uv "github.com/charmbracelet/ultraviolet"
    "github.com/charmbracelet/x/cellbuf"
)

// --- Layout IR ---

type IRDoc struct {
    Tokens   map[string]TokenPair `json:"tokens"`
    Styles   map[string]IRStyle   `json:"styles"`
    Root     IRNode               `json:"root"`
    Overlays []IROverlay          `json:"overlays"`
}

type TokenPair struct {
    Light string `json:"light"`
    Dark  string `json:"dark"`
}

type IRStyle struct {
    Border        string                  `json:"border"`
    BorderEdges   *[4]bool                `json:"borderEdges,omitempty"` // [top, right, bottom, left]
    CustomBorder  *astsync.IRCustomBorder `json:"customBorder,omitempty"`
    BorderColor   string                  `json:"borderColor"`
    Fg            string                  `json:"fg"`
    Bg            string                  `json:"bg"`
    Padding       [4]int                  `json:"padding"`
    Margin        [4]int                  `json:"margin"`
    MaxWidth      int                     `json:"maxWidth,omitempty"`
    MaxHeight     int                     `json:"maxHeight,omitempty"`
    Bold          bool                    `json:"bold"`
    Italic        bool                    `json:"italic,omitempty"`
    Faint         bool                    `json:"faint,omitempty"`
    Underline     bool                    `json:"underline,omitempty"`
    Strikethrough bool                    `json:"strikethrough,omitempty"`
    AlignH        string                  `json:"alignH,omitempty"` // "left", "center", "right"
    AlignV        string                  `json:"alignV,omitempty"` // "top", "center", "bottom"
    PlaceH        string                  `json:"placeH,omitempty"`
    PlaceV        string                  `json:"placeV,omitempty"`
    Truncate      bool                    `json:"truncate,omitempty"`
}

type IRSize struct {
    Mode          string `json:"mode"`
    Value         int    `json:"value"`
    Weight        int    `json:"weight"`
    CollapseBelow int    `json:"collapseBelow"`
}

type IRNode struct {
    ID          string                `json:"id"`
    Kind        string                `json:"kind"`
    Style       string                `json:"style"`
    ContentType string                `json:"contentType"`
    JoinAlign   string                `json:"joinAlign,omitempty"` // "start", "center", "end"
    Width       IRSize                `json:"width"`
    Height      IRSize                `json:"height"`
    Content     string                `json:"content"`
    WidgetData  *astsync.IRWidgetData `json:"widgetData,omitempty"`
    Children    []IRNode              `json:"children"`
}

type IROverlay struct {
    ID        string                     `json:"id"`
    Visible   bool                       `json:"visible"`
    Z         int                        `json:"z"`
    Anchor    string                     `json:"anchor,omitempty"`
    PlaceX    *int                       `json:"placeX,omitempty"`
    PlaceY    *int                       `json:"placeY,omitempty"`
    PlaceH    string                     `json:"placeH,omitempty"`
    PlaceV    string                     `json:"placeV,omitempty"`
    Harmonica *astsync.IRHarmonicaConfig `json:"harmonica,omitempty"`
    Node      IRNode                     `json:"node"`
}

// --- Frame & Telemetry Output ---

type Rect struct {
    X int `json:"x"`
    Y int `json:"y"`
    W int `json:"w"`
    H int `json:"h"`
}

type TelemetryNode struct {
    ID          string `json:"id"`
    Kind        string `json:"kind"`
    Style       string `json:"style"`
    Margin      Rect   `json:"margin"`
    Border      Rect   `json:"border"`
    Padding     Rect   `json:"padding"`
    Content     Rect   `json:"content"`
    AllocatedW  int    `json:"allocatedW,omitempty"`
    AllocatedH  int    `json:"allocatedH,omitempty"`
    ActualW     int    `json:"actualW,omitempty"`
    ActualH     int    `json:"actualH,omitempty"`
    OverflowX   bool   `json:"overflowX"`
    OverflowY   bool   `json:"overflowY"`
    OverflowMsg string `json:"overflowMsg,omitempty"`
}

type CellDTO struct {
    C string `json:"c,omitempty"`
    F string `json:"f,omitempty"`
    B string `json:"b,omitempty"`
    A uint8  `json:"a,omitempty"` // 1=bold, 2=italic, 4=reverse, 8=faint, 16=underline, 32=strikethrough
    W int    `json:"w,omitempty"`
}

type RenderResult struct {
    Cells     []CellDTO       `json:"cells"`
    Telemetry []TelemetryNode `json:"telemetry"`
    Error     string          `json:"error,omitempty"`
}

type HitResult struct {
    ID     string `json:"id"`
    Bounds Rect   `json:"bounds"`
}

// --- Stateful Bubbles & Huh Registry ---

type listItem struct {
    title, desc string
}

func (i listItem) Title() string       { return i.title }
func (i listItem) Description() string { return i.desc }
func (i listItem) FilterValue() string { return i.title }

type studioHelpMap struct {
    bindings []key.Binding
}

func (k studioHelpMap) ShortHelp() []key.Binding  { return k.bindings }
func (k studioHelpMap) FullHelp() [][]key.Binding { return [][]key.Binding{k.bindings} }

type bubbleEntry struct {
    kind       string
    list       list.Model
    table      table.Model
    vp         viewport.Model
    input      textinput.Model
    textarea   textarea.Model
    progress   progress.Model
    pct        float64
    spinner    spinner.Model
    filepicker filepicker.Model
    paginator  paginator.Model
    help       help.Model
    helpKeys   studioHelpMap
    timer      timer.Model
    stopwatch  stopwatch.Model
    form       *huh.Form
    huhSeed    string
    progSeed   string
}

var (
    bubblesStore   = map[string]*bubbleEntry{}
    lastCompositor *lipgloss.Compositor
    lastTelemetry  []TelemetryNode
    lastRootID     string
)

func getOrCreateBubble(node IRNode, w, h int, hasDarkBG bool, tokens map[string]TokenPair) *bubbleEntry {
    id, kind := node.ID, node.ContentType
    entry, ok := bubblesStore[id]
    if !ok || entry.kind != kind {
        entry = &bubbleEntry{kind: kind}
        switch kind {
        case "bubble:list":
            items := []list.Item{
                listItem{"Overview", "Cluster health & metrics"},
                listItem{"Deployments", "14 active workloads"},
                listItem{"Live Logs", "Streaming stdout/stderr"},
                listItem{"Ingresses", "TLS & routing rules"},
                listItem{"Secrets", "Encrypted vault keys"},
                listItem{"Settings", "Theme & keybindings"},
            }
            del := list.NewDefaultDelegate()
            l := list.New(items, del, max(10, w), max(5, h))
            l.Title = "Navigation"
            l.SetShowHelp(false)
            l.SetShowStatusBar(false)
            entry.list = l

        case "bubble:table":
            cols := []table.Column{
                {Title: "Service", Width: 13},
                {Title: "Status", Width: 9},
                {Title: "CPU", Width: 5},
                {Title: "Mem", Width: 6},
            }
            rows := []table.Row{
                {"api-gateway", "Running", "12%", "184Mi"},
                {"auth-worker", "Running", "4%", "92Mi"},
                {"billing-cron", "Idle", "0%", "48Mi"},
                {"edge-proxy", "Running", "28%", "310Mi"},
                {"indexer-v2", "Syncing", "64%", "740Mi"},
                {"metrics-sink", "Running", "9%", "128Mi"},
                {"notify-bus", "Degraded", "41%", "256Mi"},
                {"search-node", "Running", "19%", "512Mi"},
                {"wasm-runner", "Running", "7%", "64Mi"},
            }
            entry.table = table.New(
                table.WithColumns(cols),
                table.WithRows(rows),
                table.WithFocused(true),
                table.WithHeight(max(4, h)),
                table.WithWidth(max(12, w)),
            )

        case "bubble:viewport":
            vp := viewport.New(viewport.WithWidth(max(10, w)), viewport.WithHeight(max(3, h)))
            vp.SoftWrap = true
            sample := node.Content
            if strings.Count(sample, "\n") < 4 {
                sample = strings.Join([]string{
                    "[18:01:02] INFO  Booting charmstudio WASM evaluator...",
                    "[18:01:02] INFO  Lip Gloss v2 Canvas initialized",
                    "[18:01:03] DEBUG Resolving adaptive LightDark tokens",
                    "[18:01:03] INFO  Direct cell-grid HiDPI renderer active",
                    "[18:01:04] WARN  Narrow pane (<70 cols) collapses sidebar",
                    "[18:01:05] INFO  Press ↑/↓ or j/k to scroll this viewport",
                    "[18:01:06] DEBUG Frame telemetry emitted cleanly",
                    "[18:01:07] INFO  Ready for interactive key events",
                    "[18:01:08] INFO  Line 9 — keep scrolling!",
                    "[18:01:09] INFO  Line 10 — soft wrap active",
                    "[18:01:10] INFO  Line 11 — zero layout drift",
                    "[18:01:11] INFO  Line 12 — end of sample log stream",
                }, "\n")
            }
            vp.SetContent(sample)
            entry.vp = vp

        case "bubble:textinput":
            ti := textinput.New()
            ti.SetVirtualCursor(true)
            ti.Focus()
            entry.input = ti

        case "bubble:textarea":
            ta := textarea.New()
            ta.Placeholder = "Write notes, SQL, or commit message..."
            ta.ShowLineNumbers = true
            ta.SetWidth(max(12, w))
            ta.SetHeight(max(3, h))
            ta.Focus()
            entry.textarea = ta

        case "bubble:progress":
            entry.progress = progress.New(progress.WithDefaultGradient())
            entry.pct = 0.68

        case "bubble:spinner":
            sp := spinner.New()
            sp.Spinner = spinner.Dot
            entry.spinner = sp

        case "bubble:filepicker":
            fp := filepicker.New()
            fp.AllowedTypes = []string{".go", ".md", ".json"}
            fp.ShowPermissions = true
            fp.ShowSize = true
            fp.SetHeight(max(4, h))
            entry.filepicker = fp

        case "bubble:paginator":
            pg := paginator.New()
            pg.Type = paginator.Dots
            pg.TotalPages = 5
            pg.PerPage = 10
            entry.paginator = pg

        case "bubble:help":
            hp := help.New()
            entry.help = hp
            entry.helpKeys = studioHelpMap{bindings: []key.Binding{
                key.NewBinding(key.WithKeys("↑/k"), key.WithHelp("↑/k", "up")),
                key.NewBinding(key.WithKeys("↓/j"), key.WithHelp("↓/j", "down")),
                key.NewBinding(key.WithKeys("?"), key.WithHelp("?", "help")),
                key.NewBinding(key.WithKeys("q"), key.WithHelp("q", "quit")),
            }}

        case "bubble:timer":
            dur := 90.0
            if node.WidgetData != nil && node.WidgetData.TimerDurationSec > 0 {
                dur = node.WidgetData.TimerDurationSec
            }
            entry.timer = timer.NewWithInterval(time.Duration(dur)*time.Second, time.Second)

        case "bubble:stopwatch":
            entry.stopwatch = stopwatch.NewWithInterval(100 * time.Millisecond)

        case "huh:form":
            entry.form = buildStudioHuhForm(node.WidgetData, w, h)
            if b, err := json.Marshal(node.WidgetData); err == nil {
                entry.huhSeed = string(b)
            }
        }
        bubblesStore[id] = entry
    }

    ld := lipgloss.LightDark(hasDarkBG)
    switch entry.kind {
    case "bubble:list":
        del := list.NewDefaultDelegate()
        del.Styles = list.NewDefaultItemStyles(hasDarkBG)
        if node.WidgetData != nil {
            if node.WidgetData.ListDelegateMode == "compact" {
                del.ShowDescription = false
            }
            if node.WidgetData.ListTitle != "" {
                entry.list.Title = node.WidgetData.ListTitle
            }
            if node.WidgetData.ListShowPagination != nil {
                entry.list.SetShowPagination(*node.WidgetData.ListShowPagination)
            }
            if node.WidgetData.ListShowStatusBar != nil {
                entry.list.SetShowStatusBar(*node.WidgetData.ListShowStatusBar)
            }
            if len(node.WidgetData.ListItems) > 0 {
                items := make([]list.Item, 0, len(node.WidgetData.ListItems))
                for _, it := range node.WidgetData.ListItems {
                    items = append(items, listItem{title: it.Title, desc: it.Desc})
                }
                entry.list.SetItems(items)
            }
        }
        entry.list.SetDelegate(del)
        entry.list.Styles = list.DefaultStyles(hasDarkBG)
        entry.list.SetSize(max(10, w), max(4, h))
    case "bubble:table":
        accentHex := resolveColor("$accent", tokens, hasDarkBG)
        if accentHex == "" || accentHex == "$accent" {
            accentHex = "#7aa2f7"
        }
        borderHex := resolveColor("$borderIdle", tokens, hasDarkBG)
        if borderHex == "" || borderHex == "$borderIdle" {
            borderHex = "#414868"
        }
        headerFg := ""
        headerBg := ""
        selFg := ""
        selBg := accentHex
        borderKind := "normal"
        if node.WidgetData != nil {
            if len(node.WidgetData.TableColumns) > 0 {
                cols := make([]table.Column, 0, len(node.WidgetData.TableColumns))
                for _, c := range node.WidgetData.TableColumns {
                    cols = append(cols, table.Column{Title: c.Title, Width: max(3, c.Width)})
                }
                entry.table.SetColumns(cols)
            }
            if len(node.WidgetData.TableRows) > 0 {
                rows := make([]table.Row, 0, len(node.WidgetData.TableRows))
                for _, r := range node.WidgetData.TableRows {
                    rows = append(rows, table.Row(r))
                }
                entry.table.SetRows(rows)
            }
            if node.WidgetData.TableHeaderFg != "" {
                headerFg = resolveColor(node.WidgetData.TableHeaderFg, tokens, hasDarkBG)
            }
            if node.WidgetData.TableHeaderBg != "" {
                headerBg = resolveColor(node.WidgetData.TableHeaderBg, tokens, hasDarkBG)
            }
            if node.WidgetData.TableSelectedFg != "" {
                selFg = resolveColor(node.WidgetData.TableSelectedFg, tokens, hasDarkBG)
            }
            if node.WidgetData.TableSelectedBg != "" {
                selBg = resolveColor(node.WidgetData.TableSelectedBg, tokens, hasDarkBG)
            }
            if node.WidgetData.TableBorderStyle != "" {
                borderKind = node.WidgetData.TableBorderStyle
            }
        }
        ts := table.DefaultStyles()
        if borderKind == "none" {
            ts.Header = ts.Header.BorderBottom(false)
        } else {
            b := lipgloss.NormalBorder()
            if borderKind == "rounded" {
                b = lipgloss.RoundedBorder()
            } else if borderKind == "thick" {
                b = lipgloss.ThickBorder()
            }
            ts.Header = ts.Header.
                BorderStyle(b).
                BorderForeground(lipgloss.Color(borderHex)).
                BorderBottom(true)
        }
        if headerFg != "" {
            ts.Header = ts.Header.Foreground(lipgloss.Color(headerFg))
        }
        if headerBg != "" {
            ts.Header = ts.Header.Background(lipgloss.Color(headerBg))
        }
        ts.Header = ts.Header.Bold(true)
        selStyle := ts.Selected.Background(lipgloss.Color(selBg)).Bold(true)
        if selFg != "" {
            selStyle = selStyle.Foreground(lipgloss.Color(selFg))
        } else {
            selStyle = selStyle.Foreground(ld(lipgloss.Color("#ffffff"), lipgloss.Color("#11111b")))
        }
        ts.Selected = selStyle
        entry.table.SetStyles(ts)
        entry.table.SetWidth(max(12, w))
        entry.table.SetHeight(max(4, h))
    case "bubble:viewport":
        if node.Content != "" && node.Content != entry.vp.View() {
            entry.vp.SetContent(node.Content)
        }
        entry.vp.SetWidth(max(10, w))
        entry.vp.SetHeight(max(3, h))
    case "bubble:textinput":
        input := &entry.input
        data := node.WidgetData
        input.Prompt, input.Placeholder = data.TextInputLabels()
        input.EchoMode = textinput.EchoNormal
        limit := 0
        if data != nil {
            switch data.InputEchoMode {
            case "password":
                input.EchoMode = textinput.EchoPassword
            case "none":
                input.EchoMode = textinput.EchoNone
            }
            if data.InputCharLimit != nil {
                limit = max(0, *data.InputCharLimit)
            }
        }
        if limit != input.CharLimit {
            input.CharLimit = limit
            input.SetValue(input.Value())
        }
        styles := textinput.DefaultStyles(hasDarkBG)
        if data != nil {
            if pair, ok := tokens["accent"]; ok {
                styles.Focused.Prompt = styles.Focused.Prompt.Foreground(ld(lipgloss.Color(pair.Light), lipgloss.Color(pair.Dark)))
            }
            if pair, ok := tokens["textMain"]; ok {
                styles.Focused.Text = styles.Focused.Text.Foreground(ld(lipgloss.Color(pair.Light), lipgloss.Color(pair.Dark)))
            }
            if pair, ok := tokens["borderIdle"]; ok {
                styles.Focused.Placeholder = styles.Focused.Placeholder.Foreground(ld(lipgloss.Color(pair.Light), lipgloss.Color(pair.Dark))).Faint(true)
            }
            if pair, ok := tokens["modalGlow"]; ok {
                styles.Cursor.Color = ld(lipgloss.Color(pair.Light), lipgloss.Color(pair.Dark))
            }
        }
        input.SetStyles(styles)
        input.SetWidth(max(1, w-lipgloss.Width(input.Prompt)-1))
    case "bubble:textarea":
        entry.textarea.SetWidth(max(10, w))
        entry.textarea.SetHeight(max(3, h))
        if node.WidgetData != nil {
            if node.WidgetData.TextareaPlaceholder != "" {
                entry.textarea.Placeholder = node.WidgetData.TextareaPlaceholder
            }
            if node.WidgetData.TextareaCharLimit > 0 {
                entry.textarea.CharLimit = node.WidgetData.TextareaCharLimit
            }
            if node.WidgetData.TextareaShowLineNumbers != nil {
                entry.textarea.ShowLineNumbers = *node.WidgetData.TextareaShowLineNumbers
            }
        }
    case "bubble:progress":
        if node.WidgetData != nil {
            startC := resolveColor(node.WidgetData.ProgressStartColor, tokens, hasDarkBG)
            endC := resolveColor(node.WidgetData.ProgressEndColor, tokens, hasDarkBG)
            if startC == "" {
                startC = "#ff5eae"
            }
            if endC == "" {
                endC = "#6dffc2"
            }
            showPct := node.WidgetData.ProgressShowPercent == nil || *node.WidgetData.ProgressShowPercent
            seedKey := fmt.Sprintf("%s|%s|%s|%t", node.WidgetData.ProgressMode, startC, endC, showPct)
            if entry.progSeed != seedKey {
                opts := []progress.Option{}
                if node.WidgetData.ProgressMode == "solid" {
                    opts = append(opts, progress.WithSolidFill(startC))
                } else {
                    opts = append(opts, progress.WithGradient(startC, endC))
                }
                if !showPct {
                    opts = append(opts, progress.WithoutPercentage())
                }
                entry.progress = progress.New(opts...)
                entry.progSeed = seedKey
            }
            if node.WidgetData.ProgressPercent > 0 {
                entry.pct = node.WidgetData.ProgressPercent / 100.0
            }
        }
        entry.progress.SetWidth(max(8, w))
    case "bubble:spinner":
        if node.WidgetData != nil {
            entry.spinner.Spinner = mapStudioSpinner(node.WidgetData.SpinnerType)
            if node.WidgetData.SpinnerColor != "" {
                sc := resolveColor(node.WidgetData.SpinnerColor, tokens, hasDarkBG)
                if sc != "" {
                    entry.spinner.Style = lipgloss.NewStyle().Foreground(lipgloss.Color(sc))
                }
            }
        }
    case "bubble:filepicker":
        if node.WidgetData != nil {
            if len(node.WidgetData.FpAllowedExts) > 0 {
                entry.filepicker.AllowedTypes = node.WidgetData.FpAllowedExts
            }
            if node.WidgetData.FpShowPermissions != nil {
                entry.filepicker.ShowPermissions = *node.WidgetData.FpShowPermissions
            }
            if node.WidgetData.FpShowSize != nil {
                entry.filepicker.ShowSize = *node.WidgetData.FpShowSize
            }
            if node.WidgetData.FpCurrentDir != "" {
                entry.filepicker.CurrentDirectory = node.WidgetData.FpCurrentDir
            }
        }
        entry.filepicker.SetHeight(max(4, h))
    case "bubble:paginator":
        if node.WidgetData != nil {
            if node.WidgetData.PaginatorType == "arabic" {
                entry.paginator.Type = paginator.Arabic
            } else {
                entry.paginator.Type = paginator.Dots
            }
            if node.WidgetData.PaginatorTotalPages > 0 {
                entry.paginator.TotalPages = node.WidgetData.PaginatorTotalPages
            }
            if node.WidgetData.PaginatorPage > 0 {
                entry.paginator.Page = max(0, node.WidgetData.PaginatorPage-1)
            }
        }
    case "bubble:help":
        entry.help.SetWidth(max(12, w))
        if node.WidgetData != nil {
            if node.WidgetData.HelpShowAll != nil {
                entry.help.ShowAll = *node.WidgetData.HelpShowAll
            }
            if len(node.WidgetData.HelpBindings) > 0 {
                bindings := make([]key.Binding, 0, len(node.WidgetData.HelpBindings))
                for _, hb := range node.WidgetData.HelpBindings {
                    bindings = append(bindings, key.NewBinding(key.WithKeys(hb.Key), key.WithHelp(hb.Key, hb.Desc)))
                }
                entry.helpKeys = studioHelpMap{bindings: bindings}
            }
        }
    case "huh:form":
        if node.WidgetData != nil {
            if b, err := json.Marshal(node.WidgetData); err == nil && string(b) != entry.huhSeed {
                entry.form = buildStudioHuhForm(node.WidgetData, w, h)
                entry.huhSeed = string(b)
            }
        }
        if entry.form != nil {
            entry.form.WithWidth(max(16, w))
            entry.form.WithHeight(max(6, h))
        }
    }

    return entry
}

func mapStudioSpinner(t string) spinner.Spinner {
    switch t {
    case "line":
        return spinner.Line
    case "mini-dot":
        return spinner.MiniDot
    case "jump":
        return spinner.Jump
    case "pulse":
        return spinner.Pulse
    case "points":
        return spinner.Points
    case "globe":
        return spinner.Globe
    case "moon":
        return spinner.Moon
    case "monkey":
        return spinner.Monkey
    default:
        return spinner.Dot
    }
}

func buildStudioHuhForm(wd *astsync.IRWidgetData, w, h int) *huh.Form {
    if wd == nil || len(wd.HuhFields) == 0 {
        f := huh.NewForm(
            huh.NewGroup(
                huh.NewInput().Title("Service Name").Placeholder("api-gateway"),
                huh.NewSelect[string]().Title("Environment").Options(
                    huh.NewOption("Production", "prod"),
                    huh.NewOption("Staging", "staging"),
                ),
                huh.NewConfirm().Title("Enable Auto-Scaling?"),
            ),
        ).WithWidth(max(16, w)).WithHeight(max(6, h)).WithShowHelp(false)
        f.Init()
        return f
    }

    grouped := map[int][]huh.Field{}
    for _, fld := range wd.HuhFields {
        gIdx := max(0, fld.Group)
        switch fld.Kind {
        case "select":
            opts := make([]huh.Option[string], 0, max(1, len(fld.Options)))
            for _, o := range fld.Options {
                opts = append(opts, huh.NewOption(o, o))
            }
            if len(opts) == 0 {
                opts = append(opts, huh.NewOption("Default", "default"))
            }
            grouped[gIdx] = append(grouped[gIdx], huh.NewSelect[string]().Title(fld.Label).Options(opts...).Filtering(fld.Filterable))
        case "multiselect":
            opts := make([]huh.Option[string], 0, max(1, len(fld.Options)))
            for _, o := range fld.Options {
                opts = append(opts, huh.NewOption(o, o))
            }
            if len(opts) == 0 {
                opts = append(opts, huh.NewOption("Default", "default"))
            }
            ms := huh.NewMultiSelect[string]().Title(fld.Label).Options(opts...)
            if fld.MaxSelect > 0 {
                ms = ms.Limit(fld.MaxSelect)
            }
            grouped[gIdx] = append(grouped[gIdx], ms)
        case "text":
            tx := huh.NewText().Title(fld.Label).Placeholder(fld.Placeholder)
            if fld.CharLimit > 0 {
                tx = tx.CharLimit(fld.CharLimit)
            }
            if fld.LineLimit > 0 {
                tx = tx.Lines(fld.LineLimit)
            }
            grouped[gIdx] = append(grouped[gIdx], tx)
        case "note":
            grouped[gIdx] = append(grouped[gIdx], huh.NewNote().Title(fld.Label).Description(fld.Description))
        case "confirm":
            grouped[gIdx] = append(grouped[gIdx], huh.NewConfirm().Title(fld.Label))
        default:
            grouped[gIdx] = append(grouped[gIdx], huh.NewInput().Title(fld.Label).Placeholder(fld.Placeholder))
        }
    }
    keys := make([]int, 0, len(grouped))
    for k := range grouped {
        keys = append(keys, k)
    }
    sort.Ints(keys)
    groups := make([]*huh.Group, 0, len(keys))
    for _, k := range keys {
        groups = append(groups, huh.NewGroup(grouped[k]...))
    }
    themeFn := huh.ThemeCharm
    switch wd.HuhTheme {
    case "dracula":
        themeFn = huh.ThemeDracula
    case "catppuccin":
        themeFn = huh.ThemeCatppuccin
    case "base16":
        themeFn = huh.ThemeBase16
    }
    f := huh.NewForm(groups...).
        WithTheme(huh.ThemeFunc(themeFn)).
        WithWidth(max(16, w)).
        WithHeight(max(6, h)).
        WithShowHelp(false)
    f.Init()
    return f
}

func parseHexColor(hex string) (color.Color, bool) {
    h := strings.TrimPrefix(strings.TrimSpace(hex), "#")
    if len(h) != 6 {
        return nil, false
    }
    r, err1 := strconv.ParseUint(h[0:2], 16, 8)
    g, err2 := strconv.ParseUint(h[2:4], 16, 8)
    b, err3 := strconv.ParseUint(h[4:6], 16, 8)
    if err1 != nil || err2 != nil || err3 != nil {
        return nil, false
    }
    return color.RGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: 255}, true
}

func truncateText(text string, maxW, maxH int) string {
    lines := strings.Split(text, "\n")
    if maxH > 0 && len(lines) > maxH {
        lines = lines[:maxH]
    }
    for i, line := range lines {
        runes := []rune(line)
        if maxW > 1 && len(runes) > maxW {
            lines[i] = string(runes[:maxW-1]) + "…"
        } else if maxW == 1 && len(runes) > 1 {
            lines[i] = string(runes[:1])
        }
    }
    return strings.Join(lines, "\n")
}

func renderNodeContent(node IRNode, spec IRStyle, innerW, innerH int, hasDarkBG bool, tokens map[string]TokenPair) string {
    if strings.HasPrefix(node.ContentType, "bubble:") || node.ContentType == "huh:form" {
        b := getOrCreateBubble(node, innerW, innerH, hasDarkBG, tokens)
        switch b.kind {
        case "bubble:list":
            return b.list.View()
        case "bubble:table":
            return b.table.View()
        case "bubble:viewport":
            return b.vp.View()
        case "bubble:textinput":
            return b.input.View()
        case "bubble:textarea":
            return b.textarea.View()
        case "bubble:progress":
            return b.progress.ViewAs(b.pct)
        case "bubble:spinner":
            label := node.Content
            if node.WidgetData != nil && node.WidgetData.SpinnerLabel != "" {
                label = node.WidgetData.SpinnerLabel
            }
            return b.spinner.View() + " " + label
        case "bubble:filepicker":
            return b.filepicker.View()
        case "bubble:paginator":
            return b.paginator.View()
        case "bubble:help":
            return b.help.View(b.helpKeys)
        case "bubble:timer":
            return b.timer.View()
        case "bubble:stopwatch":
            return b.stopwatch.View()
        case "huh:form":
            if b.form != nil {
                return b.form.View()
            }
        }
    }
    switch node.ContentType {
    case "lipgloss:divider":
        orient, ch, lbl := "horizontal", "─", node.Content
        if node.WidgetData != nil {
            if node.WidgetData.DividerOrientation != "" {
                orient = node.WidgetData.DividerOrientation
            }
            if node.WidgetData.DividerChar != "" {
                ch = node.WidgetData.DividerChar
            }
            if node.WidgetData.DividerLabel != "" {
                lbl = node.WidgetData.DividerLabel
            }
        }
        if orient == "vertical" {
            return strings.TrimSuffix(strings.Repeat(ch+"\n", max(1, innerH)), "\n")
        }
        if lbl != "" {
            return fmt.Sprintf("─── %s %s", lbl, strings.Repeat(ch, max(2, innerW-len([]rune(lbl))-5)))
        }
        return strings.Repeat(ch, max(4, innerW))
    case "uv:screen":
        w, h := max(8, innerW), max(3, innerH)
        buf := uv.NewScreenBuffer(w, h)
        if node.WidgetData != nil {
            for _, cmd := range node.WidgetData.UvCommands {
                var st uv.Style
                if cmd.Fg != "" {
                    if c, ok := parseHexColor(resolveColor(cmd.Fg, tokens, hasDarkBG)); ok {
                        st.Fg = c
                    }
                }
                if cmd.Bg != "" {
                    if c, ok := parseHexColor(resolveColor(cmd.Bg, tokens, hasDarkBG)); ok {
                        st.Bg = c
                    }
                }
                if cmd.Bold {
                    st.Attrs |= uv.AttrBold
                }
                switch cmd.Op {
                case "fillRect":
                    rw, rh := max(1, cmd.W), max(1, cmd.H)
                    g := " "
                    if r := []rune(cmd.Text); len(r) > 0 {
                        g = string(r[0])
                    }
                    for yy := max(0, cmd.Y); yy < min(h, cmd.Y+rh); yy++ {
                        for xx := max(0, cmd.X); xx < min(w, cmd.X+rw); xx++ {
                            buf.SetCell(xx, yy, &uv.Cell{Content: g, Width: 1, Style: st})
                        }
                    }
                case "drawText":
                    if cmd.Y >= 0 && cmd.Y < h {
                        for i, r := range []rune(cmd.Text) {
                            xx := cmd.X + i
                            if xx >= 0 && xx < w {
                                buf.SetCell(xx, cmd.Y, &uv.Cell{Content: string(r), Width: 1, Style: st})
                            }
                        }
                    }
                case "setCell":
                    if cmd.X >= 0 && cmd.X < w && cmd.Y >= 0 && cmd.Y < h {
                        g := "✦"
                        if r := []rune(cmd.Text); len(r) > 0 {
                            g = string(r[0])
                        }
                        buf.SetCell(cmd.X, cmd.Y, &uv.Cell{Content: g, Width: 1, Style: st})
                    }
                }
            }
        }
        return strings.TrimRight(buf.Render(), "\n")
    case "cellbuf:canvas":
        w, h := max(8, innerW), max(3, innerH)
        buf := cellbuf.NewBuffer(w, h)
        if node.WidgetData != nil {
            for _, layer := range node.WidgetData.CellbufLayers {
                var st cellbuf.Style
                if layer.Fg != "" {
                    if c, ok := parseHexColor(resolveColor(layer.Fg, tokens, hasDarkBG)); ok {
                        st.Fg = c
                    }
                }
                if layer.Bg != "" {
                    if c, ok := parseHexColor(resolveColor(layer.Bg, tokens, hasDarkBG)); ok {
                        st.Bg = c
                    }
                }
                switch layer.Shape {
                case "checker":
                    ch := '░'
                    if r := []rune(layer.BorderChar); len(r) > 0 {
                        ch = r[0]
                    }
                    for yy := max(0, layer.Y); yy < min(h, layer.Y+layer.H); yy++ {
                        for xx := max(0, layer.X); xx < min(w, layer.X+layer.W); xx++ {
                            if (xx+yy)%2 == 0 {
                                buf.SetCell(xx, yy, &cellbuf.Cell{Rune: ch, Width: 1, Style: st})
                            }
                        }
                    }
                case "box":
                    x0, y0 := layer.X, layer.Y
                    x1, y1 := layer.X+max(2, layer.W)-1, layer.Y+max(2, layer.H)-1
                    bch := '─'
                    if r := []rune(layer.BorderChar); len(r) > 0 {
                        bch = r[0]
                    }
                    for yy := max(0, y0); yy <= min(h-1, y1); yy++ {
                        for xx := max(0, x0); xx <= min(w-1, x1); xx++ {
                            ch := ' '
                            switch {
                            case xx == x0 && yy == y0:
                                ch = '╭'
                            case xx == x1 && yy == y0:
                                ch = '╮'
                            case xx == x0 && yy == y1:
                                ch = '╰'
                            case xx == x1 && yy == y1:
                                ch = '╯'
                            case yy == y0 || yy == y1:
                                ch = bch
                            case xx == x0 || xx == x1:
                                ch = '│'
                            }
                            buf.SetCell(xx, yy, &cellbuf.Cell{Rune: ch, Width: 1, Style: st})
                        }
                    }
                case "line":
                    bch := '─'
                    if r := []rune(layer.BorderChar); len(r) > 0 {
                        bch = r[0]
                    }
                    if layer.Y >= 0 && layer.Y < h {
                        for xx := max(0, layer.X); xx < min(w, layer.X+layer.W); xx++ {
                            buf.SetCell(xx, layer.Y, &cellbuf.Cell{Rune: bch, Width: 1, Style: st})
                        }
                    }
                case "text":
                    if layer.Y >= 0 && layer.Y < h {
                        for i, r := range []rune(layer.Text) {
                            xx := layer.X + i
                            if xx >= 0 && xx < w {
                                buf.SetCell(xx, layer.Y, &cellbuf.Cell{Rune: r, Width: 1, Style: st})
                            }
                        }
                    }
                }
            }
        }
        return strings.TrimRight(cellbuf.Render(buf), "\n")
    }
    if spec.Truncate {
        return truncateText(node.Content, innerW, innerH)
    }
    return node.Content
}

func toKeyPressMsg(key string) (tea.KeyPressMsg, bool) {
    switch key {
    case "ArrowUp":
        return tea.KeyPressMsg{Code: tea.KeyUp}, true
    case "ArrowDown":
        return tea.KeyPressMsg{Code: tea.KeyDown}, true
    case "ArrowLeft":
        return tea.KeyPressMsg{Code: tea.KeyLeft}, true
    case "ArrowRight":
        return tea.KeyPressMsg{Code: tea.KeyRight}, true
    case "PageUp":
        return tea.KeyPressMsg{Code: tea.KeyPgUp}, true
    case "PageDown":
        return tea.KeyPressMsg{Code: tea.KeyPgDown}, true
    case "Tab":
        return tea.KeyPressMsg{Code: tea.KeyTab}, true
    case "Shift+Tab":
        return tea.KeyPressMsg{Code: tea.KeyTab, Mod: tea.ModShift}, true
    case "Enter":
        return tea.KeyPressMsg{Code: tea.KeyEnter}, true
    case "Backspace":
        return tea.KeyPressMsg{Code: tea.KeyBackspace}, true
    case "Escape":
        return tea.KeyPressMsg{Code: tea.KeyEscape}, true
    case " ":
        return tea.KeyPressMsg{Code: tea.KeySpace, Text: " "}, true
    default:
        runes := []rune(key)
        if len(runes) == 1 {
            return tea.KeyPressMsg{Code: runes[0], Text: key}, true
        }
        return tea.KeyPressMsg{}, false
    }
}

func dispatchStudioKey(_ js.Value, args []js.Value) any {
    if len(args) < 2 {
        return false
    }
    nodeID := args[0].String()
    keyStr := args[1].String()

    entry, ok := bubblesStore[nodeID]
    if !ok {
        return false
    }
    msg, valid := toKeyPressMsg(keyStr)
    if !valid {
        return false
    }

    switch entry.kind {
    case "bubble:list":
        entry.list, _ = entry.list.Update(msg)
    case "bubble:table":
        entry.table, _ = entry.table.Update(msg)
    case "bubble:viewport":
        entry.vp, _ = entry.vp.Update(msg)
    case "bubble:textinput":
        switch keyStr {
        case "Tab", "Shift+Tab":
            return false // Let Studio move focus to the adjacent widget.
        case "Escape":
            entry.input.Reset()
        default:
            entry.input, _ = entry.input.Update(msg)
        }
    case "bubble:textarea":
        if keyStr == "Tab" || keyStr == "Shift+Tab" {
            return false
        }
        entry.textarea, _ = entry.textarea.Update(msg)
    case "bubble:filepicker":
        entry.filepicker, _ = entry.filepicker.Update(msg)
    case "bubble:paginator":
        entry.paginator, _ = entry.paginator.Update(msg)
    case "bubble:help":
        if keyStr == "?" {
            entry.help.ShowAll = !entry.help.ShowAll
        }
    case "bubble:timer":
        entry.timer, _ = entry.timer.Update(msg)
    case "bubble:stopwatch":
        entry.stopwatch, _ = entry.stopwatch.Update(msg)
    case "huh:form":
        if entry.form != nil {
            m, _ := entry.form.Update(msg)
            if updated, ok := m.(*huh.Form); ok {
                entry.form = updated
            }
        }
    }
    return true
}

func hitTestStudio(_ js.Value, args []js.Value) any {
    if len(args) < 2 {
        return nil
    }
    col := args[0].Int()
    row := args[1].Int()

    if lastCompositor != nil {
        hit := lastCompositor.Hit(col, row)
        if hitID := hit.ID(); hitID != "" && hitID != lastRootID {
            b := hit.Bounds()
            out, _ := json.Marshal(HitResult{
                ID: hitID,
                Bounds: Rect{
                    X: b.Min.X,
                    Y: b.Min.Y,
                    W: b.Dx(),
                    H: b.Dy(),
                },
            })
            return string(out)
        }
    }

    var best *TelemetryNode
    bestArea := int(^uint(0) >> 1)
    for i := len(lastTelemetry) - 1; i >= 0; i-- {
        t := &lastTelemetry[i]
        if t.Kind == "JoinHorizontal" || t.Kind == "JoinVertical" {
            continue
        }
        r := t.Margin
        if col >= r.X && col < r.X+r.W && row >= r.Y && row < r.Y+r.H {
            area := max(1, r.W) * max(1, r.H)
            if area < bestArea {
                bestArea = area
                best = t
            }
        }
    }

    if best == nil {
        return nil
    }
    out, _ := json.Marshal(HitResult{
        ID:     best.ID,
        Bounds: best.Margin,
    })
    return string(out)
}

// --- Evaluator ---

func resolveColor(ref string, tokens map[string]TokenPair, hasDarkBG bool) string {
    if strings.HasPrefix(ref, "$") {
        if pair, ok := tokens[strings.TrimPrefix(ref, "$")]; ok {
            if hasDarkBG {
                return pair.Dark
            }
            return pair.Light
        }
    }
    return ref
}

func parseProfile(name string) colorprofile.Profile {
    switch name {
    case "ansi256":
        return colorprofile.ANSI256
    case "ansi16":
        return colorprofile.ANSI
    case "ascii":
        return colorprofile.Ascii
    default:
        return colorprofile.TrueColor
    }
}

func colorToHex(c color.Color, prof colorprofile.Profile) string {
    if c == nil || prof == colorprofile.Ascii || prof == colorprofile.NoTTY {
        return ""
    }
    converted := prof.Convert(c)
    if converted == nil {
        return ""
    }
    r, g, b, a := converted.RGBA()
    if a == 0 {
        return ""
    }
    return fmt.Sprintf("#%02x%02x%02x", r>>8, g>>8, b>>8)
}

func toLipPos(align string, defaultPos lipgloss.Position) lipgloss.Position {
    switch align {
    case "left", "start":
        return lipgloss.Left
    case "top":
        return lipgloss.Top
    case "center":
        return lipgloss.Center
    case "right", "end":
        return lipgloss.Right
    case "bottom":
        return lipgloss.Bottom
    default:
        return defaultPos
    }
}

func buildStyles(doc IRDoc, hasDarkBG bool) map[string]lipgloss.Style {
    out := make(map[string]lipgloss.Style, len(doc.Styles))
    ld := lipgloss.LightDark(hasDarkBG)

    for name, spec := range doc.Styles {
        s := lipgloss.NewStyle().
            Padding(spec.Padding[0], spec.Padding[1], spec.Padding[2], spec.Padding[3]).
            Margin(spec.Margin[0], spec.Margin[1], spec.Margin[2], spec.Margin[3]).
            Bold(spec.Bold).
            Italic(spec.Italic).
            Faint(spec.Faint).
            Underline(spec.Underline).
            Strikethrough(spec.Strikethrough)

        switch spec.Border {
        case "rounded":
            s = s.Border(lipgloss.RoundedBorder())
        case "normal":
            s = s.Border(lipgloss.NormalBorder())
        case "thick":
            s = s.Border(lipgloss.ThickBorder())
        case "double":
            s = s.Border(lipgloss.DoubleBorder())
        case "hidden":
            s = s.Border(lipgloss.HiddenBorder())
        case "custom":
            if spec.CustomBorder != nil {
                s = s.Border(lipgloss.Border{
                    Top:         spec.CustomBorder.Top,
                    Bottom:      spec.CustomBorder.Bottom,
                    Left:        spec.CustomBorder.Left,
                    Right:       spec.CustomBorder.Right,
                    TopLeft:     spec.CustomBorder.TopLeft,
                    TopRight:    spec.CustomBorder.TopRight,
                    BottomLeft:  spec.CustomBorder.BottomLeft,
                    BottomRight: spec.CustomBorder.BottomRight,
                })
            }
        }

        if spec.Border != "" && spec.Border != "none" && spec.BorderEdges != nil {
            s = s.BorderTop(spec.BorderEdges[0]).
                BorderRight(spec.BorderEdges[1]).
                BorderBottom(spec.BorderEdges[2]).
                BorderLeft(spec.BorderEdges[3])
        }

        if spec.BorderColor != "" {
            if strings.HasPrefix(spec.BorderColor, "$") {
                if p, ok := doc.Tokens[strings.TrimPrefix(spec.BorderColor, "$")]; ok {
                    s = s.BorderForeground(ld(lipgloss.Color(p.Light), lipgloss.Color(p.Dark)))
                }
            } else {
                s = s.BorderForeground(lipgloss.Color(spec.BorderColor))
            }
        }
        if spec.Fg != "" {
            s = s.Foreground(lipgloss.Color(resolveColor(spec.Fg, doc.Tokens, hasDarkBG)))
        }
        if spec.Bg != "" {
            s = s.Background(lipgloss.Color(resolveColor(spec.Bg, doc.Tokens, hasDarkBG)))
        }
        if spec.MaxWidth > 0 {
            s = s.MaxWidth(spec.MaxWidth)
        }
        if spec.MaxHeight > 0 {
            s = s.MaxHeight(spec.MaxHeight)
        }
        if spec.AlignH != "" {
            s = s.AlignHorizontal(toLipPos(spec.AlignH, lipgloss.Left))
        }
        if spec.AlignV != "" {
            s = s.AlignVertical(toLipPos(spec.AlignV, lipgloss.Top))
        }
        out[name] = s
    }
    return out
}

func insetRect(r Rect, t, ri, b, l int) Rect {
    return Rect{
        X: r.X + l,
        Y: r.Y + t,
        W: max(0, r.W-l-ri),
        H: max(0, r.H-t-b),
    }
}

func evalNode(node IRNode, x, y, availW, availH, viewW int, hasDarkBG bool, doc IRDoc, styles map[string]lipgloss.Style, tel *[]TelemetryNode) string {
    switch node.Kind {
    case "JoinHorizontal":
        var visible []IRNode
        fixedTotal, weightTotal := 0, 0
        for _, ch := range node.Children {
            if ch.Width.CollapseBelow > 0 && viewW < ch.Width.CollapseBelow {
                continue
            }
            visible = append(visible, ch)
            if ch.Width.Mode == "fixed" {
                fixedTotal += ch.Width.Value
            } else {
                w := ch.Width.Weight
                if w <= 0 {
                    w = 1
                }
                weightTotal += w
            }
        }
        remW := max(0, availW-fixedTotal)
        curX := x
        parts := make([]string, 0, len(visible))
        for _, ch := range visible {
            cw := ch.Width.Value
            if ch.Width.Mode != "fixed" {
                w := ch.Width.Weight
                if w <= 0 {
                    w = 1
                }
                cw = (remW * w) / max(1, weightTotal)
            }
            out := evalNode(ch, curX, y, cw, availH, viewW, hasDarkBG, doc, styles, tel)
            actualW, _ := lipgloss.Size(out)
            curX += actualW
            parts = append(parts, out)
        }
        return lipgloss.JoinHorizontal(toLipPos(node.JoinAlign, lipgloss.Top), parts...)

    case "JoinVertical":
        var visible []IRNode
        fixedTotal, weightTotal := 0, 0
        for _, ch := range node.Children {
            if ch.Width.CollapseBelow > 0 && viewW < ch.Width.CollapseBelow {
                continue
            }
            visible = append(visible, ch)
            if ch.Height.Mode == "fixed" {
                fixedTotal += ch.Height.Value
            } else {
                w := ch.Height.Weight
                if w <= 0 {
                    w = 1
                }
                weightTotal += w
            }
        }
        remH := max(0, availH-fixedTotal)
        curY := y
        parts := make([]string, 0, len(visible))
        for _, ch := range visible {
            chH := ch.Height.Value
            if ch.Height.Mode != "fixed" {
                w := ch.Height.Weight
                if w <= 0 {
                    w = 1
                }
                chH = (remH * w) / max(1, weightTotal)
            }
            out := evalNode(ch, x, curY, availW, chH, viewW, hasDarkBG, doc, styles, tel)
            _, actualH := lipgloss.Size(out)
            curY += actualH
            parts = append(parts, out)
        }
        return lipgloss.JoinVertical(toLipPos(node.JoinAlign, lipgloss.Left), parts...)

    default:
        s := styles[node.Style]
        spec := doc.Styles[node.Style]

        targetW := max(0, availW-s.GetHorizontalMargins())
        targetH := max(0, availH-s.GetVerticalMargins())
        if node.Width.Mode != "fit" {
            s = s.Width(targetW)
        }
        if node.Height.Mode != "fit" {
            s = s.Height(targetH)
        }

        innerW := max(1, targetW-s.GetHorizontalPadding()-s.GetHorizontalBorderSize())
        innerH := max(1, targetH-s.GetVerticalPadding()-s.GetVerticalBorderSize())
        bodyStr := renderNodeContent(node, spec, innerW, innerH, hasDarkBG, doc.Tokens)

        rendered := s.Render(bodyStr)
        if spec.PlaceH != "" || spec.PlaceV != "" {
            rendered = lipgloss.Place(
                max(1, targetW),
                max(1, targetH),
                toLipPos(spec.PlaceH, lipgloss.Left),
                toLipPos(spec.PlaceV, lipgloss.Top),
                rendered,
            )
        }
        actualW, actualH := lipgloss.Size(rendered)

        mRect := Rect{X: x, Y: y, W: actualW, H: actualH}
        bRect := insetRect(mRect, s.GetMarginTop(), s.GetMarginRight(), s.GetMarginBottom(), s.GetMarginLeft())
        pRect := insetRect(bRect, s.GetBorderTopSize(), s.GetBorderRightSize(), s.GetBorderBottomSize(), s.GetBorderLeftSize())
        cRect := insetRect(pRect, s.GetPaddingTop(), s.GetPaddingRight(), s.GetPaddingBottom(), s.GetPaddingLeft())

        overX := actualW > availW
        overY := actualH > availH
        var msg string
        if overX && overY {
            msg = fmt.Sprintf("Rendered %d×%d exceeds %d×%d allocated", actualW, actualH, availW, availH)
        } else if overX {
            msg = fmt.Sprintf("Width %d cols > %d available (try Truncate or wider box)", actualW, availW)
        } else if overY {
            msg = fmt.Sprintf("Height %d rows > %d available (wrapped text? try Truncate or taller Height)", actualH, availH)
        }

        *tel = append(*tel, TelemetryNode{
            ID:          node.ID,
            Kind:        node.Kind,
            Style:       node.Style,
            Margin:      mRect,
            Border:      bRect,
            Padding:     pRect,
            Content:     cRect,
            AllocatedW:  availW,
            AllocatedH:  availH,
            ActualW:     actualW,
            ActualH:     actualH,
            OverflowX:   overX,
            OverflowY:   overY,
            OverflowMsg: msg,
        })
        return rendered
    }
}

func renderStudio(_ js.Value, args []js.Value) any {
    var res RenderResult
    if len(args) < 4 {
        res.Error = "expected (irJSON, cols, rows, hasDarkBG, [colorProfile])"
        b, _ := json.Marshal(res)
        return string(b)
    }

    irJSON := args[0].String()
    cols := max(10, args[1].Int())
    rows := max(5, args[2].Int())
    hasDarkBG := args[3].Bool()
    profName := "truecolor"
    if len(args) >= 5 && args[4].Type() == js.TypeString {
        profName = args[4].String()
    }
    prof := parseProfile(profName)

    var doc IRDoc
    if err := json.Unmarshal([]byte(irJSON), &doc); err != nil {
        res.Error = err.Error()
        b, _ := json.Marshal(res)
        return string(b)
    }

    styles := buildStyles(doc, hasDarkBG)
    var tel []TelemetryNode

    rootRendered := evalNode(doc.Root, 0, 0, cols, rows, cols, hasDarkBG, doc, styles, &tel)
    layers := []*lipgloss.Layer{
        lipgloss.NewLayer(rootRendered).X(0).Y(0).Z(0).ID(doc.Root.ID),
    }

    for _, ov := range doc.Overlays {
        if !ov.Visible {
            continue
        }
        ovW := ov.Node.Width.Value
        if ovW <= 0 {
            ovW = 44
        }
        ovH := ov.Node.Height.Value
        if ovH <= 0 {
            ovH = 9
        }
        ox := max(0, (cols-ovW)/2)
        oy := max(0, (rows-ovH)/2)
        switch ov.Anchor {
        case "top-right":
            ox = max(0, cols-ovW-1)
            oy = 1
        case "bottom-right":
            ox = max(0, cols-ovW-1)
            oy = max(0, rows-ovH-1)
        case "bottom-bar":
            ovW = max(20, cols-4)
            ox = max(0, (cols-ovW)/2)
            oy = max(0, rows-ovH-1)
        case "place":
            if ov.PlaceX != nil || ov.PlaceY != nil {
                if ov.PlaceX != nil {
                    ox = max(0, min(cols-ovW, *ov.PlaceX))
                }
                if ov.PlaceY != nil {
                    oy = max(0, min(rows-ovH, *ov.PlaceY))
                }
            } else {
                switch ov.PlaceH {
                case "left":
                    ox = 0
                case "right":
                    ox = max(0, cols-ovW)
                }
                switch ov.PlaceV {
                case "top":
                    oy = 0
                case "bottom":
                    oy = max(0, rows-ovH)
                }
            }
        }
        ovStr := evalNode(ov.Node, ox, oy, ovW, ovH, cols, hasDarkBG, doc, styles, &tel)
        layers = append(layers, lipgloss.NewLayer(ovStr).X(ox).Y(oy).Z(ov.Z).ID(ov.Node.ID))
    }

    canvas := lipgloss.NewCanvas(cols, rows)
    comp := lipgloss.NewCompositor(layers...)
    canvas.Compose(comp)

    lastCompositor = comp
    lastTelemetry = tel
    lastRootID = doc.Root.ID

    cells := make([]CellDTO, cols*rows)
    for row := 0; row < rows; row++ {
        for col := 0; col < cols; col++ {
            c := canvas.CellAt(col, row)
            if c == nil {
                continue
            }
            var at uint8
            if c.Style.Attrs&1 != 0 {
                at |= 1
            }
            if c.Style.Attrs&4 != 0 {
                at |= 2
            }
            if c.Style.Attrs&32 != 0 {
                at |= 4
            }
            if c.Style.Attrs&2 != 0 {
                at |= 8
            }
            if c.Style.Underline > 0 {
                at |= 16
            }
            if c.Style.Attrs&uv.AttrStrikethrough != 0 {
                at |= 32
            }
            cells[row*cols+col] = CellDTO{
                C: c.Content,
                F: colorToHex(c.Style.Fg, prof),
                B: colorToHex(c.Style.Bg, prof),
                A: at,
                W: c.Width,
            }
        }
    }

    res.Cells = cells
    res.Telemetry = tel

    b, _ := json.Marshal(res)
    return string(b)
}

func main() {
    js.Global().Set("renderStudio", js.FuncOf(renderStudio))
    js.Global().Set("dispatchStudioKey", js.FuncOf(dispatchStudioKey))
    js.Global().Set("hitTestStudio", js.FuncOf(hitTestStudio))
    js.Global().Set("parseGoSource", js.FuncOf(parseGoSource))
    js.Global().Set("syncGoSource", js.FuncOf(syncGoSource))
    js.Global().Set("computeGoDiff", js.FuncOf(computeGoDiff))
    select {}
}
