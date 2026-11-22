package main

import (
	"context"
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"charmstudio/engine/astsync"
	"charmstudio/engine/mcp"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func defaultInitialIR() astsync.IRDoc {
	return astsync.IRDoc{
		Tokens: map[string]astsync.TokenPair{
			"accent":     {Light: "#2e7de9", Dark: "#7aa2f7"},
			"borderIdle": {Light: "#9aa5ce", Dark: "#414868"},
			"textMain":   {Light: "#3760bf", Dark: "#c0caf5"},
			"surface":    {Light: "#d5d6db", Dark: "#1f2335"},
		},
		Styles: map[string]astsync.IRStyle{},
		Root: astsync.IRNode{
			ID:   "shell",
			Kind: "JoinVertical",
		},
	}
}

func main() {
	mcpStdio := flag.Bool("mcp-stdio", false, "Run the embedded Charm Studio MCP server over stdin/stdout")
	headless := flag.Bool("headless", false, "Run headless companion HTTP/WS bridge + MCP HTTP server without desktop GUI")
	bridgeAddr := flag.String("bridge-addr", "127.0.0.1:43120", "Address for headless companion HTTP/WebSocket bridge")
	mcpAddr := flag.String("mcp-addr", "127.0.0.1:43121", "Address for embedded MCP Streamable HTTP/SSE server")
	projectDir := flag.String("dir", "", "Optional initial Go project directory for MCP/worktree context")
	flag.Parse()

	mcpSrv := mcp.NewServer(defaultInitialIR())
	if *projectDir != "" {
		mcpSrv.UpdateContext(defaultInitialIR(), "shell", *projectDir, "", "")
	}

	if *mcpStdio {
		ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
		defer stop()
		if err := mcpSrv.ServeStdio(ctx, os.Stdin, os.Stdout); err != nil {
			log.Fatalf("mcp stdio error: %v", err)
		}
		return
	}

	// Start embedded MCP HTTP/SSE server for Claude Code, Codex, and Cursor
	mcpHTTP := &http.Server{
		Addr:              *mcpAddr,
		Handler:           mcpSrv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}
	go func() {
		if err := mcpHTTP.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("MCP HTTP listener stopped: %v", err)
		}
	}()
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = mcpHTTP.Shutdown(ctx)
	}()

	hub := NewEventHub()
	svc := NewStudioService(mcpSrv, hub.Emit, *mcpAddr)
	defer svc.Shutdown()

	if *headless {
		log.Printf("Charm Studio companion bridge listening on http://%s", *bridgeAddr)
		log.Printf("Charm Studio MCP HTTP/SSE listening on http://%s", *mcpAddr)
		srv := &http.Server{
			Addr:              *bridgeAddr,
			Handler:           NewBridgeHandler(svc, hub),
			ReadHeaderTimeout: 5 * time.Second,
		}
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
		return
	}

	// Also expose headless HTTP/WS bridge in desktop mode for external dev tools if port is free
	go func() {
		srv := &http.Server{
			Addr:              *bridgeAddr,
			Handler:           NewBridgeHandler(svc, hub),
			ReadHeaderTimeout: 5 * time.Second,
		}
		_ = srv.ListenAndServe()
	}()

	distFS, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}

	app := application.New(application.Options{
		Name:        "Charm Studio",
		Description: "Live Go TUI Layout Sandbox, Native PTY Preview & MCP Workbench",
		Services: []application.Service{
			application.NewService(svc),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(distFS),
		},
	})

	svc.SetEmitter(func(name string, data any) {
		app.Event.Emit(name, data)
		hub.Emit(name, data)
	})

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:  "Charm Studio",
		Width:  1480,
		Height: 940,
	})

	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
