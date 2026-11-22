//go:build js && wasm

package main

import (
	"syscall/js"

	"charmstudio/engine/astsync"
)

func parseGoSource(_ js.Value, args []js.Value) any {
	if len(args) < 1 {
		return `{"error":"expected go source string"}`
	}
	return astsync.ParseGoSourceJSON(args[0].String())
}

func syncGoSource(_ js.Value, args []js.Value) any {
	if len(args) < 2 {
		return `{"error":"expected (existingGo, irJSON)"}`
	}
	return astsync.SyncGoSourceJSON(args[0].String(), args[1].String())
}

func computeGoDiff(_ js.Value, args []js.Value) any {
	if len(args) < 2 {
		return `{"error":"expected (beforeGo, afterGo)"}`
	}
	return astsync.ComputeGoDiffJSON(args[0].String(), args[1].String())
}
