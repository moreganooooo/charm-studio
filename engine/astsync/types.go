package astsync

type TokenPair struct {
	Light string `json:"light"`
	Dark  string `json:"dark"`
}

type IRStyle struct {
	Border      string   `json:"border"`
	BorderEdges *[4]bool `json:"borderEdges,omitempty"` // [top, right, bottom, left]
	BorderColor string   `json:"borderColor"`
	Fg          string   `json:"fg"`
	Bg          string   `json:"bg,omitempty"`
	Padding     [4]int   `json:"padding"`
	Margin      [4]int   `json:"margin"`
	Bold        bool     `json:"bold"`
	Italic      bool     `json:"italic,omitempty"`
	Faint       bool     `json:"faint,omitempty"`
	Underline   bool     `json:"underline,omitempty"`
	AlignH      string   `json:"alignH,omitempty"` // "left", "center", "right"
	AlignV      string   `json:"alignV,omitempty"` // "top", "center", "bottom"
	Truncate    bool     `json:"truncate,omitempty"`
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
	ID          string   `json:"id"`
	Kind        string   `json:"kind"` // "input", "select", "confirm"
	Label       string   `json:"label"`
	Placeholder string   `json:"placeholder,omitempty"`
	Options     []string `json:"options,omitempty"`
}

type IRWidgetData struct {
	ListTitle        string          `json:"listTitle,omitempty"`
	ListItems        []IRListItem    `json:"listItems,omitempty"`
	TableColumns     []IRTableColumn `json:"tableColumns,omitempty"`
	TableRows        [][]string      `json:"tableRows,omitempty"`
	InputPrompt      string          `json:"inputPrompt,omitempty"`
	InputPlaceholder string          `json:"inputPlaceholder,omitempty"`
	HuhFields        []IRHuhField    `json:"huhFields,omitempty"`
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
	ID      string `json:"id"`
	Visible bool   `json:"visible"`
	Z       int    `json:"z"`
	Anchor  string `json:"anchor,omitempty"`
	Node    IRNode `json:"node"`
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
