package astsync

type TokenPair struct {
	Light string `json:"light"`
	Dark  string `json:"dark"`
}

type IRCustomBorder struct {
	Top         string `json:"top"`
	Bottom      string `json:"bottom"`
	Left        string `json:"left"`
	Right       string `json:"right"`
	TopLeft     string `json:"topLeft"`
	TopRight    string `json:"topRight"`
	BottomLeft  string `json:"bottomLeft"`
	BottomRight string `json:"bottomRight"`
}

type IRStyle struct {
	Border        string          `json:"border"`
	BorderEdges   *[4]bool        `json:"borderEdges,omitempty"` // [top, right, bottom, left]
	CustomBorder  *IRCustomBorder `json:"customBorder,omitempty"`
	BorderColor   string          `json:"borderColor"`
	Fg            string          `json:"fg"`
	Bg            string          `json:"bg,omitempty"`
	Padding       [4]int          `json:"padding"`
	Margin        [4]int          `json:"margin"`
	MaxWidth      int             `json:"maxWidth,omitempty"`
	MaxHeight     int             `json:"maxHeight,omitempty"`
	Bold          bool            `json:"bold"`
	Italic        bool            `json:"italic,omitempty"`
	Faint         bool            `json:"faint,omitempty"`
	Underline     bool            `json:"underline,omitempty"`
	Strikethrough bool            `json:"strikethrough,omitempty"`
	AlignH        string          `json:"alignH,omitempty"` // "left", "center", "right"
	AlignV        string          `json:"alignV,omitempty"` // "top", "center", "bottom"
	PlaceH        string          `json:"placeH,omitempty"` // "left", "center", "right"
	PlaceV        string          `json:"placeV,omitempty"` // "top", "center", "bottom"
	Truncate      bool            `json:"truncate,omitempty"`
}

type IRSize struct {
	Mode          string `json:"mode"`
	Value         int    `json:"value,omitempty"`
	Weight        int    `json:"weight,omitempty"`
	CollapseBelow int    `json:"collapseBelow,omitempty"`
}

type IRListItem struct {
	Title string `json:"title"`
	Desc  string `json:"desc"`
}

type IRTableColumn struct {
	Title string `json:"title"`
	Width int    `json:"width"`
}

type IRHuhField struct {
	ID              string   `json:"id"`
	Kind            string   `json:"kind"` // "input", "text", "select", "multiselect", "confirm", "note"
	Label           string   `json:"label"`
	Description     string   `json:"description,omitempty"`
	Placeholder     string   `json:"placeholder,omitempty"`
	Options         []string `json:"options,omitempty"`
	Validation      string   `json:"validation,omitempty"`
	ValidationParam string   `json:"validationParam,omitempty"`
	ErrorMessage    string   `json:"errorMessage,omitempty"`
	CharLimit       int      `json:"charLimit,omitempty"`
	LineLimit       int      `json:"lineLimit,omitempty"`
	Filterable      bool     `json:"filterable,omitempty"`
	MinSelect       int      `json:"minSelect,omitempty"`
	MaxSelect       int      `json:"maxSelect,omitempty"`
	Group           int      `json:"group,omitempty"`
}

type IRHelpBinding struct {
	Key  string `json:"key"`
	Desc string `json:"desc"`
}

type IRUvCommand struct {
	ID   string `json:"id"`
	Op   string `json:"op"`
	X    int    `json:"x"`
	Y    int    `json:"y"`
	W    int    `json:"w,omitempty"`
	H    int    `json:"h,omitempty"`
	Text string `json:"text,omitempty"`
	Fg   string `json:"fg,omitempty"`
	Bg   string `json:"bg,omitempty"`
	Bold bool   `json:"bold,omitempty"`
}

type IRCellbufLayer struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Shape      string `json:"shape"`
	X          int    `json:"x"`
	Y          int    `json:"y"`
	W          int    `json:"w"`
	H          int    `json:"h"`
	Text       string `json:"text,omitempty"`
	Fg         string `json:"fg,omitempty"`
	Bg         string `json:"bg,omitempty"`
	BorderChar string `json:"borderChar,omitempty"`
}

type IRHarmonicaConfig struct {
	Enabled   bool    `json:"enabled"`
	Frequency float64 `json:"frequency"`
	Damping   float64 `json:"damping"`
}

type IRWidgetData struct {
	ListTitle               string             `json:"listTitle,omitempty"`
	ListItems               []IRListItem       `json:"listItems,omitempty"`
	ListShowPagination      *bool              `json:"listShowPagination,omitempty"`
	ListShowStatusBar       *bool              `json:"listShowStatusBar,omitempty"`
	ListDelegateMode        string             `json:"listDelegateMode,omitempty"`
	TableColumns            []IRTableColumn    `json:"tableColumns,omitempty"`
	TableRows               [][]string         `json:"tableRows,omitempty"`
	TableHeaderFg           string             `json:"tableHeaderFg,omitempty"`
	TableHeaderBg           string             `json:"tableHeaderBg,omitempty"`
	TableSelectedFg         string             `json:"tableSelectedFg,omitempty"`
	TableSelectedBg         string             `json:"tableSelectedBg,omitempty"`
	TableBorderStyle        string             `json:"tableBorderStyle,omitempty"`
	InputPrompt             *string            `json:"inputPrompt,omitempty"`
	InputPlaceholder        *string            `json:"inputPlaceholder,omitempty"`
	InputEchoMode           string             `json:"inputEchoMode,omitempty"`
	InputCharLimit          *int               `json:"inputCharLimit,omitempty"`
	TextareaPlaceholder     string             `json:"textareaPlaceholder,omitempty"`
	TextareaShowLineNumbers *bool              `json:"textareaShowLineNumbers,omitempty"`
	TextareaSoftWrap        *bool              `json:"textareaSoftWrap,omitempty"`
	TextareaCharLimit       int                `json:"textareaCharLimit,omitempty"`
	TextareaCursorStyle     string             `json:"textareaCursorStyle,omitempty"`
	ProgressPercent         float64            `json:"progressPercent,omitempty"`
	ProgressMode            string             `json:"progressMode,omitempty"`
	ProgressStartColor      string             `json:"progressStartColor,omitempty"`
	ProgressEndColor        string             `json:"progressEndColor,omitempty"`
	ProgressShowPercent     *bool              `json:"progressShowPercent,omitempty"`
	Harmonica               *IRHarmonicaConfig `json:"harmonica,omitempty"`
	SpinnerType             string             `json:"spinnerType,omitempty"`
	SpinnerLabel            string             `json:"spinnerLabel,omitempty"`
	SpinnerColor            string             `json:"spinnerColor,omitempty"`
	FpCurrentDir            string             `json:"fpCurrentDir,omitempty"`
	FpAllowedExts           []string           `json:"fpAllowedExts,omitempty"`
	FpShowPermissions       *bool              `json:"fpShowPermissions,omitempty"`
	FpShowSize              *bool              `json:"fpShowSize,omitempty"`
	PaginatorType           string             `json:"paginatorType,omitempty"`
	PaginatorPage           int                `json:"paginatorPage,omitempty"`
	PaginatorTotalPages     int                `json:"paginatorTotalPages,omitempty"`
	PaginatorPerPage        int                `json:"paginatorPerPage,omitempty"`
	HelpShowAll             *bool              `json:"helpShowAll,omitempty"`
	HelpBindings            []IRHelpBinding    `json:"helpBindings,omitempty"`
	TimerDurationSec        float64            `json:"timerDurationSec,omitempty"`
	TimerFormat             string             `json:"timerFormat,omitempty"`
	TimerAutoStart          *bool              `json:"timerAutoStart,omitempty"`
	HuhFields               []IRHuhField       `json:"huhFields,omitempty"`
	HuhTheme                string             `json:"huhTheme,omitempty"`
	HuhGroupNames           []string           `json:"huhGroupNames,omitempty"`
	GlamourTheme            string             `json:"glamourTheme,omitempty"`
	DividerOrientation      string             `json:"dividerOrientation,omitempty"`
	DividerChar             string             `json:"dividerChar,omitempty"`
	DividerLabel            string             `json:"dividerLabel,omitempty"`
	UvCommands              []IRUvCommand      `json:"uvCommands,omitempty"`
	UvCursorX               int                `json:"uvCursorX,omitempty"`
	UvCursorY               int                `json:"uvCursorY,omitempty"`
	UvShowCursor            *bool              `json:"uvShowCursor,omitempty"`
	CellbufLayers           []IRCellbufLayer   `json:"cellbufLayers,omitempty"`
}

// TextInputLabels resolves omitted labels while retaining explicitly empty ones.
func (d *IRWidgetData) TextInputLabels() (prompt, placeholder string) {
	prompt, placeholder = "> ", "Filter services or type a command..."
	if d != nil {
		if d.InputPrompt != nil {
			prompt = *d.InputPrompt
		}
		if d.InputPlaceholder != nil {
			placeholder = *d.InputPlaceholder
		}
	}
	return
}

type IRNode struct {
	ID          string        `json:"id"`
	Kind        string        `json:"kind"`
	Style       string        `json:"style,omitempty"`
	ContentType string        `json:"contentType,omitempty"`
	JoinAlign   string        `json:"joinAlign,omitempty"`
	Width       IRSize        `json:"width,omitempty"`
	Height      IRSize        `json:"height,omitempty"`
	Content     string        `json:"content,omitempty"`
	WidgetData  *IRWidgetData `json:"widgetData,omitempty"`
	Children    []IRNode      `json:"children,omitempty"`
}

type IROverlay struct {
	ID        string             `json:"id"`
	Visible   bool               `json:"visible"`
	Z         int                `json:"z"`
	Anchor    string             `json:"anchor,omitempty"`
	PlaceX    *int               `json:"placeX,omitempty"`
	PlaceY    *int               `json:"placeY,omitempty"`
	PlaceH    string             `json:"placeH,omitempty"`
	PlaceV    string             `json:"placeV,omitempty"`
	Harmonica *IRHarmonicaConfig `json:"harmonica,omitempty"`
	Node      IRNode             `json:"node"`
}

type ViewConfig struct {
	AltScreen                 bool   `json:"altScreen"`
	MouseMode                 string `json:"mouseMode"`
	WindowTitle               string `json:"windowTitle,omitempty"`
	ReportFocus               bool   `json:"reportFocus,omitempty"`
	DisableBracketedPasteMode bool   `json:"disableBracketedPasteMode,omitempty"`
	CursorMode                string `json:"cursorMode,omitempty"` // "auto", "none", "manual"
	CursorX                   int    `json:"cursorX,omitempty"`
	CursorY                   int    `json:"cursorY,omitempty"`
}

type IRDoc struct {
	Tokens           map[string]TokenPair            `json:"tokens"`
	Styles           map[string]IRStyle              `json:"styles"`
	View             *ViewConfig                     `json:"view,omitempty"`
	Root             IRNode                          `json:"root"`
	Overlays         []IROverlay                     `json:"overlays"`
	LockedProps      map[string][]string             `json:"lockedProps,omitempty"`
	LockReasons      map[string]string               `json:"lockReasons,omitempty"`
	DynamicExprs     map[string]map[string]string    `json:"dynamicExprs,omitempty"`
	OverriddenProps  map[string][]string             `json:"overriddenProps,omitempty"`
	UntouchedSymbols []string                        `json:"untouchedSymbols,omitempty"`
}

type GoParseResult struct {
	Styles           map[string]IRStyle            `json:"styles"`
	Tokens           map[string]TokenPair          `json:"tokens"`
	View             *ViewConfig                   `json:"view,omitempty"`
	Root             *IRNode                       `json:"root,omitempty"`
	Overlays         []IROverlay                   `json:"overlays,omitempty"`
	DetectedBubbles  []string                      `json:"detectedBubbles"`
	StyleNames       []string                      `json:"styleNames"`
	ColorCount       int                           `json:"colorCount"`
	SyncDisabled     bool                          `json:"syncDisabled"`
	LockedSymbols    []string                      `json:"lockedSymbols"`
	LockedProps      map[string][]string           `json:"lockedProps,omitempty"`
	LockReasons      map[string]string             `json:"lockReasons,omitempty"`
	DynamicExprs     map[string]map[string]string  `json:"dynamicExprs,omitempty"`
	UntouchedSymbols []string                      `json:"untouchedSymbols,omitempty"`
	Error            string                        `json:"error,omitempty"`
}

type GoSyncResult struct {
	UpdatedGo      string              `json:"updatedGo"`
	PatchedSymbols []string            `json:"patchedSymbols"`
	LockedSymbols  []string            `json:"lockedSymbols"`
	LockedProps    map[string][]string `json:"lockedProps,omitempty"`
	LockReasons    map[string]string   `json:"lockReasons,omitempty"`
	SyncDisabled   bool                `json:"syncDisabled"`
	Error          string              `json:"error,omitempty"`
}

type AstDelta struct {
	Kind     string `json:"kind"`               // "added", "removed", "modified", "untouched", "locked"
	Category string `json:"category"`           // "Node", "Style", "Token", "Overlay", "View", "Func", "Type", "Lock"
	Bucket   string `json:"bucket,omitempty"`   // "styles_tokens", "layout_overlays", "view_flags", "locked_untouched"
	Symbol   string `json:"symbol"`
	Detail   string `json:"detail"`
}

type DiffLine struct {
	Type    string `json:"type"` // "ctx", "add", "del"
	OldLine int    `json:"oldLine,omitempty"`
	NewLine int    `json:"newLine,omitempty"`
	Text    string `json:"text"`
}

type GoDiffResult struct {
	Deltas  []AstDelta `json:"deltas"`
	Lines   []DiffLine `json:"lines"`
	Added   int        `json:"added"`
	Removed int        `json:"removed"`
	Error   string     `json:"error,omitempty"`
}
