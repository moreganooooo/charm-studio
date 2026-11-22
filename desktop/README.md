# Charm Studio Desktop (Wails v3 + Native PTY + MCP)

Native Go 1.26+ desktop companion built with **Wails v3 (`wails.io`)**, **`charmbracelet/x/xpty` + `charmbracelet/x/vt`**, an embedded **Model Context Protocol (MCP)** server (`engine/mcp/`), and **`git worktree`** session isolation (`engine/worktree/`).

## Prerequisites
- **Go 1.26+**
- **Node.js 20+**
- Optional for native desktop packaging: `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0`

## Option A: Run Native Desktop App (Wails v3)
```bash
# 1. Build web studio + WASM and copy dist/ into desktop/frontend/dist/
cd ..
npm install
npm run build:wasm
npm run build
rm -rf desktop/frontend/dist && mkdir -p desktop/frontend/dist && cp -R dist/* desktop/frontend/dist/

# 2. Run Wails v3 desktop companion
cd desktop
go mod tidy
go run .
```

## Option B: Run Headless Companion Alongside Vite Dev (`localhost:5173` / `:3000`)
```bash
cd desktop
go mod tidy
go run . --headless
```
This starts:
- Companion HTTP/WebSocket bridge on `http://127.0.0.1:43120` (for Native PTY, AST Sync, and Worktrees)
- Embedded MCP Streamable HTTP / SSE server on `http://127.0.0.1:43121`

## Option C: Connect Coding Agents via MCP Stdio
```bash
go build -o charmstudio-desktop ./desktop
claude mcp add charmstudio -- ./charmstudio-desktop --mcp-stdio
```
