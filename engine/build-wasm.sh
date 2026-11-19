#!/usr/bin/env bash
set -euo pipefail

GOROOT_DIR="$(go env GOROOT)"
if [ -f "$GOROOT_DIR/lib/wasm/wasm_exec.js" ]; then
  cp "$GOROOT_DIR/lib/wasm/wasm_exec.js" ../web/public/wasm_exec.js
else
  cp "$GOROOT_DIR/misc/wasm/wasm_exec.js" ../web/public/wasm_exec.js
fi

GOOS=js GOARCH=wasm go build -mod=vendor -o ../web/public/studio.wasm .
echo "Built ../web/public/studio.wasm ($(du -h ../web/public/studio.wasm | cut -f1))"
