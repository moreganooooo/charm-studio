#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

go mod tidy
go mod vendor

cp wasm_stubs/clipboard_js.go vendor/github.com/atotto/clipboard/clipboard_js.go
cp wasm_stubs/tty_js.go vendor/charm.land/bubbletea/v2/tty_js.go

GOROOT_DIR="$(go env GOROOT)"
if [ -f "$GOROOT_DIR/lib/wasm/wasm_exec.js" ]; then
  cp "$GOROOT_DIR/lib/wasm/wasm_exec.js" ../public/wasm_exec.js
else
  cp "$GOROOT_DIR/misc/wasm/wasm_exec.js" ../public/wasm_exec.js
fi

GOOS=js GOARCH=wasm go build -mod=vendor -trimpath -ldflags="-s -w" -o ../public/studio.wasm .
echo "Built ../public/studio.wasm ($(du -h ../public/studio.wasm | cut -f1))"
