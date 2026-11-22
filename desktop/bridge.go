package main

import (
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
)

type wsClient struct {
	conn net.Conn
	mu   sync.Mutex
}

func (c *wsClient) sendText(data []byte) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	return writeWSFrame(c.conn, 0x1, data)
}

func writeWSFrame(conn net.Conn, opcode byte, payload []byte) error {
	var header [10]byte
	header[0] = 0x80 | (opcode & 0x0f)
	n := len(payload)
	hLen := 2
	switch {
	case n < 126:
		header[1] = byte(n)
	case n <= 65535:
		header[1] = 126
		binary.BigEndian.PutUint16(header[2:4], uint16(n))
		hLen = 4
	default:
		header[1] = 127
		binary.BigEndian.PutUint64(header[2:10], uint64(n))
		hLen = 10
	}
	if _, err := conn.Write(header[:hLen]); err != nil {
		return err
	}
	if n > 0 {
		_, err := conn.Write(payload)
		return err
	}
	return nil
}

type EventHub struct {
	mu      sync.Mutex
	clients map[*wsClient]struct{}
}

func NewEventHub() *EventHub {
	return &EventHub{clients: map[*wsClient]struct{}{}}
}

func (h *EventHub) Emit(event string, data any) {
	payload, err := json.Marshal(map[string]any{
		"event": event,
		"data":  data,
	})
	if err != nil {
		return
	}
	h.mu.Lock()
	list := make([]*wsClient, 0, len(h.clients))
	for c := range h.clients {
		list = append(list, c)
	}
	h.mu.Unlock()

	for _, c := range list {
		if err := c.sendText(payload); err != nil {
			h.remove(c)
		}
	}
}

func (h *EventHub) add(c *wsClient) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *EventHub) remove(c *wsClient) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	_ = c.conn.Close()
}

func (h *EventHub) ServeWS(w http.ResponseWriter, r *http.Request) {
	if !strings.Contains(strings.ToLower(r.Header.Get("Upgrade")), "websocket") {
		http.Error(w, "websocket upgrade required", http.StatusUpgradeRequired)
		return
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		http.Error(w, "missing Sec-WebSocket-Key", http.StatusBadRequest)
		return
	}
	hj, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "hijack unsupported", http.StatusInternalServerError)
		return
	}
	conn, rw, err := hj.Hijack()
	if err != nil {
		return
	}

	sum := sha1.Sum([]byte(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"))
	accept := base64.StdEncoding.EncodeToString(sum[:])

	_, _ = fmt.Fprintf(rw,
		"HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n",
		accept,
	)
	_ = rw.Flush()

	client := &wsClient{conn: conn}
	h.add(client)

	// Drain client control frames (close/ping) until disconnect
	go func() {
		defer h.remove(client)
		buf := make([]byte, 1024)
		for {
			if _, err := conn.Read(buf); err != nil {
				return
			}
		}
	}()
}

func NewBridgeHandler(svc *StudioService, hub *EventHub) http.Handler {
	mux := http.NewServeMux()

	withCORS := func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next(w, r)
		}
	}

	mux.HandleFunc("/api/health", withCORS(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "mode": "charmstudio-companion"})
	}))

	mux.HandleFunc("/api/events", hub.ServeWS)

	mux.HandleFunc("/api/rpc/", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		method := strings.TrimPrefix(r.URL.Path, "/api/rpc/")
		body, err := io.ReadAll(io.LimitReader(r.Body, 8*1024*1024))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		var req struct {
			Args []json.RawMessage `json:"args"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		res, callErr := dispatchBridgeRPC(svc, method, req.Args)
		w.Header().Set("Content-Type", "application/json")
		if callErr != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": callErr.Error()})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"result": res})
	}))

	return mux
}

func argString(args []json.RawMessage, idx int) string {
	if idx >= len(args) {
		return ""
	}
	var s string
	if err := json.Unmarshal(args[idx], &s); err == nil {
		return s
	}
	return ""
}

func argInt(args []json.RawMessage, idx int, def int) int {
	if idx >= len(args) {
		return def
	}
	var v int
	if err := json.Unmarshal(args[idx], &v); err == nil {
		return v
	}
	return def
}

func dispatchBridgeRPC(svc *StudioService, method string, args []json.RawMessage) (any, error) {
	switch method {
	case "ParseGoSource":
		return svc.ParseGoSource(argString(args, 0)), nil
	case "SyncGoSource":
		return svc.SyncGoSource(argString(args, 0), argString(args, 1)), nil
	case "ComputeGoDiff":
		return svc.ComputeGoDiff(argString(args, 0), argString(args, 1)), nil
	case "StartPTY":
		return svc.StartPTY(argString(args, 0), argInt(args, 1, 82), argInt(args, 2, 24))
	case "StopPTY":
		return nil, svc.StopPTY()
	case "SendPTYInput":
		return nil, svc.SendPTYInput(argString(args, 0))
	case "SendPTYMouse":
		return nil, svc.SendPTYMouse(argInt(args, 0, 0), argInt(args, 1, 0), argInt(args, 2, 0), argString(args, 3))
	case "ResizePTY":
		return nil, svc.ResizePTY(argInt(args, 0, 82), argInt(args, 1, 24))
	case "GetPTYStatus":
		return svc.GetPTYStatus(), nil
	case "GetPTYBuffer":
		return svc.GetPTYBuffer(), nil
	case "UpdateMCPContext":
		return nil, svc.UpdateMCPContext(argString(args, 0), argString(args, 1), argString(args, 2))
	case "GetMCPStatus":
		return svc.GetMCPStatus(), nil
	case "CreateWorktree":
		return svc.CreateWorktree(argString(args, 0), argString(args, 1), argString(args, 2))
	case "ListWorktrees":
		return svc.ListWorktrees(argString(args, 0))
	case "GetWorktreeDiff":
		return svc.GetWorktreeDiff(argString(args, 0))
	case "ActivateWorktreeInPTY":
		return svc.ActivateWorktreeInPTY(argString(args, 0), argInt(args, 1, 82), argInt(args, 2, 24))
	case "MergeWorktree":
		return nil, svc.MergeWorktree(argString(args, 0), argString(args, 1))
	case "DiscardWorktree":
		return nil, svc.DiscardWorktree(argString(args, 0))
	default:
		return nil, errors.New("unknown RPC method: " + method)
	}
}
