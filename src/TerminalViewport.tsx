import { useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { AlertTriangle, Camera, Check, Columns2, Copy, Keyboard, Pencil, Plus, Rows2, Terminal as TerminalIcon, Trash2 } from "lucide-react";
import { useStudioStore } from "./store/studioStore";
import { Tooltip } from "./Tooltip";
import type { PtyStatus } from "./previewTransport";
import { findNode, listVisibleFocusBoxes, type ColorProfile, type IRDoc, type IRNode, type Rect, type TelemetryNode } from "./types";
import { dispatchKey, ensureEngineReady, hitTestCell, renderFrame, wailsTransport } from "./wasmEngine";

interface SplitEdge {
  key: string;
  axis: "x" | "y";
  firstId: string;
  secondId: string;
  seamX: number;
  seamY: number;
  span: number;
  firstSize: number;
  secondSize: number;
}

function getNodeBounds(node: IRNode, telMap: Map<string, TelemetryNode>): Rect | null {
  const direct = telMap.get(node.id);
  if (direct && direct.border.w > 0 && direct.border.h > 0) {
    return direct.margin.w > 0 && direct.margin.h > 0 ? direct.margin : direct.border;
  }
  const childRects = (node.children ?? [])
    .map((c) => getNodeBounds(c, telMap))
    .filter((r): r is Rect => r !== null);
  if (childRects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of childRects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: Math.max(0, maxX - minX), h: Math.max(0, maxY - minY) };
}

function collectSplitEdges(root: IRNode, telemetry: TelemetryNode[]): SplitEdge[] {
  const telMap = new Map<string, TelemetryNode>();
  for (const t of telemetry) telMap.set(t.id, t);

  const edges: SplitEdge[] = [];
  const walk = (node: IRNode) => {
    if ((node.kind === "JoinHorizontal" || node.kind === "JoinVertical") && node.children?.length) {
      const visibleChildren = node.children
        .map((ch) => ({ node: ch, rect: getNodeBounds(ch, telMap) }))
        .filter((item): item is { node: IRNode; rect: Rect } => item.rect !== null);

      for (let i = 0; i < visibleChildren.length - 1; i++) {
        const a = visibleChildren[i];
        const b = visibleChildren[i + 1];
        if (node.kind === "JoinHorizontal") {
          const seamX = Math.round((a.rect.x + a.rect.w + b.rect.x) / 2);
          const minY = Math.min(a.rect.y, b.rect.y);
          const maxY = Math.max(a.rect.y + a.rect.h, b.rect.y + b.rect.h);
          if (maxY > minY) {
            edges.push({
              key: `${node.id}:${a.node.id}:${b.node.id}`,
              axis: "x",
              firstId: a.node.id,
              secondId: b.node.id,
              seamX,
              seamY: minY,
              span: maxY - minY,
              firstSize: a.rect.w,
              secondSize: b.rect.w,
            });
          }
        } else {
          const seamY = Math.round((a.rect.y + a.rect.h + b.rect.y) / 2);
          const minX = Math.min(a.rect.x, b.rect.x);
          const maxX = Math.max(a.rect.x + a.rect.w, b.rect.x + b.rect.w);
          if (maxX > minX) {
            edges.push({
              key: `${node.id}:${a.node.id}:${b.node.id}`,
              axis: "y",
              firstId: a.node.id,
              secondId: b.node.id,
              seamX: minX,
              seamY,
              span: maxX - minX,
              firstSize: a.rect.h,
              secondSize: b.rect.h,
            });
          }
        }
      }
      for (const ch of node.children) walk(ch);
    }
  };
  walk(root);
  return edges;
}

export interface TermPalette {
  id: string;
  label: string;
  darkBG: boolean;
  background: string;
  foreground: string;
}

interface Props {
  title: string;
  mode?: "wasm" | "pty";
  ptyStatus?: PtyStatus | null;
  doc: IRDoc;
  renderTick: number;
  cols: number;
  rows: number;
  fontSize?: number;
  fontFamily?: string;
  palette: TermPalette;
  colorProfile: ColorProfile;
  showOverlay: boolean;
  overlayMode?: "none" | "padding-band" | "full-box-model";
  showQuickBar?: boolean;
  chrome?: "full" | "minimal";
  pageKeyboardNavigation?: boolean;
  headerRightSlot?: React.ReactNode;
  selectedId: string;
  onSelect: (id: string) => void;
  onInteract: () => void;
  onResize?: (cols: number, rows: number) => void;
  onTelemetry?: (tel: TelemetryNode[]) => void;
  onQuickSplit?: (id: string, kind: "JoinHorizontal" | "JoinVertical") => void;
  onQuickWidgetPicker?: (id: string) => void;
  onQuickClone?: (id: string) => void;
  onQuickDelete?: (id: string) => void;
  onQuickInlineEdit?: (id: string, nextContent: string) => void;
  onRequestInspectData?: (id: string) => void;
  snapshotActionRef?: React.MutableRefObject<(() => void) | null>;
}

const FONT_STACK = `"JetBrains Mono", "SF Mono", Menlo, monospace`;

const INLINE_EDITABLE_TYPES = new Set([
  "text",
  "glamour:markdown",
  "gum:choose",
  "gum:confirm",
  "wish:ssh",
  "bubble:viewport",
]);

export function TerminalViewport({
  title,
  mode = "wasm",
  ptyStatus = null,
  doc,
  renderTick,
  cols,
  rows,
  fontSize = 14,
  fontFamily = FONT_STACK,
  palette,
  colorProfile,
  showOverlay,
  overlayMode,
  showQuickBar = false,
  chrome = "full",
  pageKeyboardNavigation = false,
  headerRightSlot,
  selectedId,
  onSelect,
  onInteract,
  onResize,
  onTelemetry,
  onQuickSplit,
  onQuickWidgetPicker,
  onQuickClone,
  onQuickDelete,
  onQuickInlineEdit,
  onRequestInspectData,
  snapshotActionRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const xtermHostRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const selectedIdRef = useRef(selectedId);
  const ptyConfigRef = useRef({ cols, rows, fontSize, fontFamily, palette });

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    ptyConfigRef.current = { cols, rows, fontSize, fontFamily, palette };
  }, [cols, rows, fontSize, fontFamily, palette]);

  const {
    activeLens,
    hoveredProperty,
    setActiveProperty,
    triggerKeyPulse,
    updateNode,
  } = useStudioStore();

  const [ready, setReady] = useState(false);
  const [focused, setFocused] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryNode[]>([]);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredEdgeKey, setHoveredEdgeKey] = useState<string | null>(null);
  const [dragEdgeInfo, setDragEdgeInfo] = useState<{ key: string; x: number; y: number; label: string } | null>(null);
  const [cellSize, setCellSize] = useState({ w: fontSize * 0.6, h: fontSize * 1.38 });
  const [inlineEdit, setInlineEdit] = useState<{ id: string; text: string } | null>(null);
  const [snapshotSaved, setSnapshotSaved] = useState(false);

  const exportSnapshotPng = () => {
    const srcCanvas = canvasRef.current;
    if (!srcCanvas || !ready || mode !== "wasm") return;

    const scale = Math.max(2, window.devicePixelRatio || 1);
    const cssW = Math.ceil(cols * cellSize.w);
    const cssH = Math.ceil(rows * cellSize.h);
    const outerPad = 36;
    const headerH = 34;
    const innerPad = 10;
    const radius = 12;

    const cardW = cssW + innerPad * 2;
    const cardH = headerH + cssH + innerPad * 2;
    const totalW = cardW + outerPad * 2;
    const totalH = cardH + outerPad * 2;

    const out = document.createElement("canvas");
    out.width = Math.ceil(totalW * scale);
    out.height = Math.ceil(totalH * scale);
    const ctx = out.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Padded Charm Aubergine backdrop with subtle radial spotlight
    const bgGrad = ctx.createRadialGradient(totalW * 0.5, totalH * 0.42, 10, totalW * 0.5, totalH * 0.42, Math.max(totalW, totalH) * 0.65);
    bgGrad.addColorStop(0, "#291c3a");
    bgGrad.addColorStop(1, "#150f1d");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, totalW, totalH);

    // Card drop shadow
    const drawRoundedPath = (x: number, y: number, w: number, h: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    drawRoundedPath(outerPad, outerPad, cardW, cardH, radius);
    ctx.fillStyle = palette.background;
    ctx.fill();
    ctx.restore();

    // Clip card body for chrome header + terminal canvas
    ctx.save();
    drawRoundedPath(outerPad, outerPad, cardW, cardH, radius);
    ctx.clip();

    ctx.fillStyle = palette.background;
    ctx.fillRect(outerPad, outerPad, cardW, cardH);

    // Window chrome header
    ctx.fillStyle = palette.darkBG ? "#1b1326" : "#f3ecfc";
    ctx.fillRect(outerPad, outerPad, cardW, headerH);
    ctx.fillStyle = palette.darkBG ? "rgba(185, 162, 255, 0.16)" : "rgba(28, 19, 38, 0.1)";
    ctx.fillRect(outerPad, outerPad + headerH - 1, cardW, 1);

    // Window dots
    const dotColors = ["#ff5eae", "#ffd37a", "#6dffc2"];
    dotColors.forEach((c, idx) => {
      ctx.beginPath();
      ctx.arc(outerPad + 16 + idx * 14, outerPad + headerH / 2, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = c;
      ctx.fill();
    });

    // Header label
    ctx.fillStyle = palette.darkBG ? "#c8b6ff" : "#5b37f0";
    ctx.font = `600 11.5px "JetBrains Mono", "SF Mono", Menlo, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${title} · ${cols}×${rows}`, outerPad + cardW / 2, outerPad + headerH / 2);

    // Terminal HiDPI canvas
    ctx.drawImage(srcCanvas, outerPad + innerPad, outerPad + headerH + innerPad, cssW, cssH);
    ctx.restore();

    // Hairline border + top inner highlight
    drawRoundedPath(outerPad + 0.5, outerPad + 0.5, cardW - 1, cardH - 1, radius);
    ctx.strokeStyle = "rgba(185, 162, 255, 0.28)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.beginPath();
    ctx.moveTo(outerPad + radius, outerPad + 1);
    ctx.lineTo(outerPad + cardW - radius, outerPad + 1);
    ctx.stroke();

    const triggerDownload = (url: string, revoke: boolean) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = `charm-studio-${cols}x${rows}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      if (revoke) setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    if (out.toBlob) {
      out.toBlob((blob) => {
        if (blob) {
          triggerDownload(URL.createObjectURL(blob), true);
        }
      }, "image/png");
    } else {
      triggerDownload(out.toDataURL("image/png"), false);
    }

    setSnapshotSaved(true);
    setTimeout(() => setSnapshotSaved(false), 1600);
  };

  useEffect(() => {
    if (!snapshotActionRef) return;
    snapshotActionRef.current = exportSnapshotPng;
    return () => {
      snapshotActionRef.current = null;
    };
  });

  useEffect(() => {
    let cancelled = false;
    ensureEngineReady().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  // Native PTY xterm.js lifecycle
  useEffect(() => {
    if (mode !== "pty") {
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
        fitAddonRef.current = null;
      }
      return;
    }
    const host = xtermHostRef.current;
    if (!host) return;

    const cfg = ptyConfigRef.current;
    const term = new Terminal({
      cols: cfg.cols,
      rows: cfg.rows,
      fontSize: cfg.fontSize,
      fontFamily: cfg.fontFamily,
      cursorBlink: true,
      convertEol: false,
      theme: {
        background: cfg.palette.background,
        foreground: cfg.palette.foreground,
        cursor: cfg.palette.foreground,
      },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(host);
    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    const dataSub = term.onData((data) => {
      void wailsTransport.sendKey(selectedIdRef.current, data, { rawSeq: data });
    });

    const unsubOut = wailsTransport.onPtyOutput((chunk) => {
      term.write(chunk);
    });

    wailsTransport.init().then(() => {
      wailsTransport.getPtyBuffer().then((buf) => {
        if (buf) term.write(buf);
      }).catch(() => {});
      void wailsTransport.resize(ptyConfigRef.current.cols, ptyConfigRef.current.rows);
    }).catch(() => {});

    return () => {
      unsubOut();
      dataSub.dispose();
      term.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
    };
  }, [mode]);

  useEffect(() => {
    const term = xtermRef.current;
    if (mode !== "pty" || !term) return;
    term.options.fontSize = fontSize;
    term.options.fontFamily = fontFamily;
    term.options.theme = {
      background: palette.background,
      foreground: palette.foreground,
      cursor: palette.foreground,
    };
    term.resize(cols, rows);
    void wailsTransport.resize(cols, rows);
  }, [mode, cols, rows, fontSize, fontFamily, palette]);

  useEffect(() => {
    if (mode !== "wasm") return;
    const canvas = canvasRef.current;
    if (!ready || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.font = `${fontSize}px ${fontFamily}`;
    const cw = Math.ceil(ctx.measureText("M").width * 10) / 10;
    const ch = Math.ceil(fontSize * 1.38);
    setCellSize({ w: cw, h: ch });

    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.ceil(cols * cw);
    const cssH = Math.ceil(rows * ch);
    canvas.width = Math.ceil(cssW * dpr);
    canvas.height = Math.ceil(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const frame = renderFrame(doc, cols, rows, palette.darkBG, colorProfile);
    if (frame.error) {
      console.error("WASM render error:", frame.error);
      return;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.textBaseline = "middle";

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = frame.cells[r * cols + c];
        if (!cell) continue;
        if (cell.w === 0 && !cell.c) continue;

        const px = c * cw;
        const py = r * ch;
        const attrs = cell.a ?? 0;
        const isBold = (attrs & 1) !== 0;
        const isItalic = (attrs & 2) !== 0;
        const isReverse = (attrs & 4) !== 0;
        const isFaint = (attrs & 8) !== 0;
        const isUnderline = (attrs & 16) !== 0;

        let fg = cell.f || palette.foreground;
        let bg = cell.b || "";
        if (isReverse) {
          const oldFg = fg;
          fg = bg || palette.background;
          bg = oldFg;
        }

        if (bg) {
          ctx.fillStyle = bg;
          ctx.fillRect(px, py, cw * (cell.w && cell.w > 1 ? cell.w : 1) + 0.5, ch + 0.5);
        }

        if (cell.c && cell.c !== " ") {
          ctx.globalAlpha = isFaint ? 0.55 : 1;
          ctx.fillStyle = fg;
          ctx.font = `${isItalic ? "italic " : ""}${isBold ? "700 " : "400 "}${fontSize}px ${fontFamily}`;
          ctx.fillText(cell.c, px, py + ch * 0.52);
          ctx.globalAlpha = 1;
        }

        if (isUnderline) {
          ctx.fillStyle = fg;
          ctx.fillRect(px, py + ch - 2, cw, 1);
        }
      }
    }

    setTelemetry(frame.telemetry ?? []);
    onTelemetry?.(frame.telemetry ?? []);
  }, [mode, ready, doc, renderTick, cols, rows, fontSize, fontFamily, palette, colorProfile]);

  const hitTest = (e: React.MouseEvent<SVGSVGElement>): TelemetryNode | null => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = Math.floor((e.clientX - rect.left) / cellSize.w);
    const cy = Math.floor((e.clientY - rect.top) / cellSize.h);

    const wasmHit = hitTestCell(cx, cy);
    if (wasmHit) {
      const matched = telemetry.find((n) => n.id === wasmHit.id);
      if (matched) return matched;
      return {
        id: wasmHit.id,
        kind: "Box",
        style: "",
        margin: wasmHit.bounds,
        border: wasmHit.bounds,
        padding: wasmHit.bounds,
        content: wasmHit.bounds,
        overflowX: false,
        overflowY: false,
      };
    }

    return (
      [...telemetry].reverse().find(
        (n) => cx >= n.margin.x && cx < n.margin.x + n.margin.w && cy >= n.margin.y && cy < n.margin.y + n.margin.h
      ) ?? null
    );
  };

  const openInlineEditForNode = (id: string) => {
    const node = findNode(doc, id);
    if (!node || node.kind !== "Box") return;
    const ct = node.contentType ?? "text";
    if (!INLINE_EDITABLE_TYPES.has(ct)) {
      onRequestInspectData?.(id);
      return;
    }
    setInlineEdit({ id, text: node.content ?? "" });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (mode === "pty") return;
    if (inlineEdit) return;
    // The launcher is a web page with controls after the demo. Let Tab leave
    // the preview and let its native buttons handle their own keystrokes.
    if (pageKeyboardNavigation && (e.key === "Tab" || e.target !== e.currentTarget)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const handled = dispatchKey(selectedId, e.key, e.shiftKey);
    if (handled) {
      e.preventDefault();
      triggerKeyPulse(selectedId, e.key);
      onInteract();
      return;
    }
    if (e.key === "Tab") {
      const order = listVisibleFocusBoxes(doc, cols);
      if (order.length > 1) {
        e.preventDefault();
        const curIdx = Math.max(0, order.findIndex((n) => n.id === selectedId));
        const nextIdx = e.shiftKey
          ? (curIdx + order.length - 1) % order.length
          : (curIdx + 1) % order.length;
        const nextId = order[nextIdx].id;
        triggerKeyPulse(nextId, e.shiftKey ? "shift+tab" : "tab");
        onSelect(nextId);
      }
    }
  };

  const startSplitEdgeDrag = (e: React.PointerEvent<HTMLDivElement>, edge: SplitEdge) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startFirst = edge.firstSize;
    const totalSpan = Math.max(12, edge.firstSize + edge.secondSize);
    const minCell = edge.axis === "x" ? 6 : 3;
    const cw = cellSize.w;
    const ch = cellSize.h;
    let lastCommitted = startFirst;

    const initialLabel =
      edge.axis === "x"
        ? `${startFirst} cols | ${edge.secondSize} cols`
        : `${startFirst} rows | ${edge.secondSize} rows`;
    const basePxX = 6 + edge.seamX * cw;
    const basePxY = 6 + edge.seamY * ch;
    setDragEdgeInfo({
      key: edge.key,
      x: basePxX,
      y: basePxY,
      label: initialLabel,
    });
    setActiveProperty("size");

    const onMove = (ev: PointerEvent) => {
      const delta =
        edge.axis === "x"
          ? Math.round((ev.clientX - startX) / Math.max(1, cw))
          : Math.round((ev.clientY - startY) / Math.max(1, ch));
      const nextFirst = Math.max(minCell, Math.min(totalSpan - minCell, startFirst + delta));
      const nextSecond = Math.max(minCell, totalSpan - nextFirst);
      const label =
        edge.axis === "x"
          ? `${nextFirst} cols | ${nextSecond} cols`
          : `${nextFirst} rows | ${nextSecond} rows`;

      setDragEdgeInfo({
        key: edge.key,
        x: edge.axis === "x" ? 6 + (edge.seamX + (nextFirst - startFirst)) * cw : basePxX,
        y: edge.axis === "y" ? 6 + (edge.seamY + (nextFirst - startFirst)) * ch : basePxY,
        label,
      });

      if (nextFirst !== lastCommitted) {
        lastCommitted = nextFirst;
        updateNode(edge.firstId, (n) =>
          edge.axis === "x"
            ? { ...n, width: { ...(n.width ?? { mode: "fixed" }), mode: "fixed", value: nextFirst } }
            : { ...n, height: { ...(n.height ?? { mode: "fixed" }), mode: "fixed", value: nextFirst } }
        );
        setActiveProperty("size");
      }
    };

    const onUp = () => {
      setDragEdgeInfo(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startCornerResize = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!onResize) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startCols = cols;
    const startRows = rows;
    const cw = cellSize.w;
    const ch = cellSize.h;

    const onMove = (ev: PointerEvent) => {
      const nextCols = Math.max(30, Math.min(140, startCols + Math.round((ev.clientX - startX) / cw)));
      const nextRows = Math.max(10, Math.min(45, startRows + Math.round((ev.clientY - startY) / ch)));
      onResize(nextCols, nextRows);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const boxRect = (r: Rect) => ({
    x: r.x * cellSize.w,
    y: r.y * cellSize.h,
    width: Math.max(0, r.w * cellSize.w),
    height: Math.max(0, r.h * cellSize.h),
  });

  const hoveredTel = telemetry.find((t) => t.id === hoveredId) ?? null;
  const selectedTel = telemetry.find((t) => t.id === selectedId) ?? null;
  const overflows = telemetry.filter((t) => t.overflowX || t.overflowY);
  const selectedNode = findNode(doc, selectedId);
  const selectedStyleObj = selectedNode?.style ? doc.styles[selectedNode.style] : undefined;
  const effectiveOverlayMode: "none" | "padding-band" | "full-box-model" =
    overlayMode ?? (showOverlay ? "full-box-model" : "none");
  const isPaddingHovered =
    hoveredProperty === "padding" ||
    hoveredProperty === "padding-v" ||
    hoveredProperty === "padding-h";
  const showHollowPaddingBand =
    activeLens === "hybrid" ||
    effectiveOverlayMode === "padding-band" ||
    isPaddingHovered;
  const splitEdges = mode === "wasm" && ready && Boolean(onResize) ? collectSplitEdges(doc.root, telemetry) : [];
  const canMutateSelected = selectedNode && selectedId !== doc.root.id && !doc.overlays.some((o) => o.node.id === selectedId);

  const canvasPixelW = Math.ceil(cols * cellSize.w);

  return (
    <div
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={handleKeyDown}
      style={{
        position: "relative",
        display: "inline-flex",
        flexDirection: "column",
        border: `1px solid ${focused ? "var(--cs-pink)" : "var(--cs-border-strong)"}`,
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--cs-panel)",
        boxShadow: focused
          ? "inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 0 0 2px var(--cs-pink-bg), var(--cs-shadow)"
          : "inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 14px 36px rgba(0,0,0,0.22)",
        outline: "none",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          borderBottom: "1px solid var(--cs-border)",
          background: chrome === "minimal" ? "var(--terminal-titlebar, rgba(22, 15, 32, 0.9))" : "var(--cs-card-alt)",
          boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        }}
      >
        {chrome === "minimal" ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 12px",
              fontSize: 11,
              gap: 8,
            }}
          >
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255, 94, 174, 0.65)" }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(255, 211, 122, 0.65)" }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "rgba(109, 255, 194, 0.65)" }} />
              {title && (
                <span className="cs-mono" style={{ marginLeft: 6, color: "var(--cs-text-dim)", fontSize: 10.5 }}>
                  {title}
                </span>
              )}
            </div>
            {headerRightSlot ? (
              <div onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                {headerRightSlot}
              </div>
            ) : (
              <span className="cs-mono" style={{ color: "var(--cs-text-dim)", fontSize: 10 }}>
                •••
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", fontSize: 12, gap: 8 }}>
            <span style={{ fontWeight: 600, color: "var(--cs-text-strong)", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>{title}</span>
              <span style={{ color: "var(--cs-text-dim)", fontWeight: 400 }}>{cols}×{rows}</span>
              {focused && (
                <Tooltip title="Live Terminal Focus" content="Keystrokes go straight to the active pane. Press Tab to jump between panes.">
                  <span style={{ color: "var(--cs-pink)", marginLeft: 4, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Keyboard size={12} />
                    <span>Keys → #{selectedId}</span>
                  </span>
                </Tooltip>
              )}
            </span>

          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {mode === "wasm" && ready && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  exportSnapshotPng();
                }}
                title="Export HiDPI PNG snapshot framed on a padded Charm Aubergine card for GitHub READMEs"
                style={{
                  ...qBtn,
                  borderColor: snapshotSaved ? "var(--cs-mint-border)" : "var(--cs-btn-border)",
                  color: snapshotSaved ? "var(--cs-mint)" : "var(--cs-btn-text)",
                }}
              >
                {snapshotSaved ? <Check size={11} /> : <Camera size={11} />}
                <span>{snapshotSaved ? "Saved PNG" : "Snapshot PNG"}</span>
              </button>
            )}

            {mode === "pty" ? (
              <span
                style={{
                  color: ptyStatus?.state === "error" ? "#e11d48" : "var(--cs-mint)",
                  background: ptyStatus?.state === "error" ? "rgba(244, 63, 94, 0.14)" : "var(--cs-mint-bg)",
                  border: `1px solid ${ptyStatus?.state === "error" ? "rgba(244, 63, 94, 0.45)" : "var(--cs-mint-border)"}`,
                  borderRadius: 999,
                  padding: "1px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <TerminalIcon size={11} />
                <span>
                  Native PTY · {ptyStatus?.state ?? "idle"}
                  {ptyStatus?.lastBuildMs ? ` (${ptyStatus.lastBuildMs}ms)` : ""}
                </span>
              </span>
            ) : effectiveOverlayMode === "padding-band" && selectedStyleObj ? (
              <span
                className="cs-mono"
                style={{
                  color: "var(--cs-pink-soft)",
                  background: "var(--cs-pink-bg)",
                  border: "1px solid var(--cs-pink-border)",
                  borderRadius: 999,
                  padding: "1px 8px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                Padding({selectedStyleObj.padding[0]}, {selectedStyleObj.padding[1]})
              </span>
            ) : overflows.length > 0 ? (
              <Tooltip
                title="Layout Overflow Detected"
                content={`${overflows.map((o) => `#${o.id}: ${o.overflowMsg ?? "exceeds terminal bounds"}`).join(" • ")} Click to select and adjust Width or Collapse Below.`}
              >
                <span
                  onClick={() => onSelect(overflows[0].id)}
                  style={{ cursor: "pointer", color: "#e11d48", background: "rgba(244, 63, 94, 0.14)", border: "1px solid rgba(244, 63, 94, 0.45)", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}
                >
                  <AlertTriangle size={11} />
                  <span>Overflow: {overflows.map((o) => `#${o.id}`).join(", ")}</span>
                </span>
              </Tooltip>
            ) : (
              <Tooltip content="Every pane fits cleanly inside this terminal size with zero clipping.">
                <span style={{ color: "var(--cs-mint)", background: "var(--cs-mint-bg)", border: "1px solid var(--cs-mint-border)", borderRadius: 999, padding: "1px 8px", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Check size={11} />
                  <span>Clean</span>
                </span>
              </Tooltip>
            )}
          </div>
        </div>
        )}

        {/* Docked Selected Node Quick-Action Bar (keeps 100% of terminal cells unobstructed) */}
        {mode === "wasm" && showQuickBar && ready && selectedNode?.kind === "Box" && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 4,
              padding: "5px 10px",
              borderTop: "1px solid var(--cs-border-subtle)",
              background: "var(--cs-panel)",
              fontSize: 11,
            }}
          >
            <span className="cs-mono" style={{ fontWeight: 700, color: "var(--cs-pink)", paddingRight: 4 }}>
              #{selectedId}
            </span>
            {onQuickSplit && canMutateSelected && (
              <>
                <button onClick={() => onQuickSplit(selectedId, "JoinHorizontal")} title="Split Right (Row)" style={qBtn}>
                  <Columns2 size={11} />
                  <span>Split R</span>
                </button>
                <button onClick={() => onQuickSplit(selectedId, "JoinVertical")} title="Split Below (Stack)" style={qBtn}>
                  <Rows2 size={11} />
                  <span>Split B</span>
                </button>
              </>
            )}
            {onQuickWidgetPicker && (
              <button onClick={() => onQuickWidgetPicker(selectedId)} title="Insert Charm component beside this pane" style={qBtn}>
                <Plus size={11} />
                <span>Widget</span>
              </button>
            )}
            <button onClick={() => openInlineEditForNode(selectedId)} title="Edit pane text / data" style={qBtn}>
              <Pencil size={11} />
              <span>Edit</span>
            </button>
            {onQuickClone && canMutateSelected && (
              <button onClick={() => onQuickClone(selectedId)} title="Duplicate pane" style={qBtn}>
                <Copy size={11} />
              </button>
            )}
            {onQuickDelete && canMutateSelected && (
              <button onClick={() => onQuickDelete(selectedId)} title="Delete pane" style={{ ...qBtn, color: "#e11d48" }}>
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ position: "relative", padding: 6, background: palette.background }}>
        {mode === "pty" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {ptyStatus?.state === "error" && ptyStatus.error && (
              <pre
                style={{
                  margin: 0,
                  padding: "8px 10px",
                  borderRadius: 6,
                  background: "rgba(244, 63, 94, 0.14)",
                  border: "1px solid rgba(244, 63, 94, 0.4)",
                  color: "#fda4af",
                  fontSize: 11.5,
                  fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
                  maxHeight: 140,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {ptyStatus.error}
              </pre>
            )}
            <div
              ref={xtermHostRef}
              onMouseDown={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const c = Math.max(0, Math.min(cols - 1, Math.floor(((e.clientX - rect.left) / Math.max(1, rect.width)) * cols)));
                const r = Math.max(0, Math.min(rows - 1, Math.floor(((e.clientY - rect.top) / Math.max(1, rect.height)) * rows)));
                void wailsTransport.sendMouse(c, r, { button: e.button, action: "press" });
              }}
              onMouseUp={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const c = Math.max(0, Math.min(cols - 1, Math.floor(((e.clientX - rect.left) / Math.max(1, rect.width)) * cols)));
                const r = Math.max(0, Math.min(rows - 1, Math.floor(((e.clientY - rect.top) / Math.max(1, rect.height)) * rows)));
                void wailsTransport.sendMouse(c, r, { button: e.button, action: "release" });
              }}
              onWheel={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const c = Math.max(0, Math.min(cols - 1, Math.floor(((e.clientX - rect.left) / Math.max(1, rect.width)) * cols)));
                const r = Math.max(0, Math.min(rows - 1, Math.floor(((e.clientY - rect.top) / Math.max(1, rect.height)) * rows)));
                void wailsTransport.sendMouse(c, r, { button: e.deltaY < 0 ? 64 : 65, action: "wheel" });
              }}
              style={{
                width: Math.ceil(cols * Math.max(7, fontSize * 0.61)),
                height: Math.ceil(rows * Math.max(16, fontSize * 1.24)),
                overflow: "hidden",
              }}
            />
          </div>
        ) : (
          <>
            {!ready && (
              <div style={{ padding: 24, fontSize: 12, color: "var(--cs-text-muted)", fontFamily: "ui-monospace, monospace" }}>
                Booting Go Lip Gloss engine...
              </div>
            )}
            <canvas ref={canvasRef} style={{ display: ready ? "block" : "none" }} />
            <svg
              onMouseMove={(e) => setHoveredId(hitTest(e)?.id ?? null)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={(e) => {
                e.currentTarget.closest<HTMLElement>("[tabindex]")?.focus();
                const hit = hitTest(e);
                if (hit) onSelect(hit.id);
              }}
              onDoubleClick={(e) => {
                const hit = hitTest(e);
                if (hit) {
                  onSelect(hit.id);
                  openInlineEditForNode(hit.id);
                }
              }}
              style={{ position: "absolute", inset: 6, width: "calc(100% - 12px)", height: "calc(100% - 12px)", cursor: "pointer" }}
            >
              {effectiveOverlayMode === "none" && !showHollowPaddingBand && hoveredTel && hoveredTel.id !== selectedId && (
                <rect {...boxRect(hoveredTel.border)} fill="transparent" stroke="rgba(255, 94, 174, 0.45)" strokeDasharray="3 3" rx={3} />
              )}
              {effectiveOverlayMode === "none" && !showHollowPaddingBand && selectedTel && (
                <rect {...boxRect(selectedTel.border)} fill="transparent" stroke="#ff5eae" strokeWidth={1.5} rx={3} />
              )}
              {effectiveOverlayMode === "padding-band" && hoveredTel && hoveredTel.id !== selectedId && (
                <rect {...boxRect(hoveredTel.border)} fill="transparent" stroke="rgba(185, 162, 255, 0.45)" strokeDasharray="3 3" />
              )}
              {effectiveOverlayMode === "full-box-model" && !isPaddingHovered && hoveredTel && hoveredTel.id !== selectedId && (
                <rect {...boxRect(hoveredTel.margin)} fill="rgba(196, 181, 253, 0.09)" stroke="#c4b5fd" strokeDasharray="4 3" />
              )}
              {effectiveOverlayMode === "full-box-model" && !isPaddingHovered && selectedTel && (
                <>
                  <rect {...boxRect(selectedTel.margin)}  fill="rgba(251, 146, 60, 0.16)" stroke="#fb923c" strokeWidth={1.5} />
                  <rect {...boxRect(selectedTel.padding)} fill="rgba(74, 222, 128, 0.14)" stroke="#4ade80" strokeDasharray="3 2" />
                  <rect {...boxRect(selectedTel.content)} fill="rgba(96, 165, 250, 0.18)" stroke="#60a5fa" />
                </>
              )}
              {showHollowPaddingBand && selectedTel && (() => {
                const p = selectedTel.padding;
                const c = selectedTel.content;
                const strips: { key: string; rect: Rect; opacity: number }[] = [
                  {
                    key: "top",
                    rect: { x: p.x, y: p.y, w: p.w, h: Math.max(0, c.y - p.y) },
                    opacity: hoveredProperty === "padding-v" ? 0.42 : 0.25,
                  },
                  {
                    key: "bottom",
                    rect: { x: p.x, y: c.y + c.h, w: p.w, h: Math.max(0, p.y + p.h - (c.y + c.h)) },
                    opacity: hoveredProperty === "padding-v" ? 0.42 : 0.25,
                  },
                  {
                    key: "left",
                    rect: { x: p.x, y: c.y, w: Math.max(0, c.x - p.x), h: c.h },
                    opacity: hoveredProperty === "padding-h" ? 0.42 : 0.25,
                  },
                  {
                    key: "right",
                    rect: { x: c.x + c.w, y: c.y, w: Math.max(0, p.x + p.w - (c.x + c.w)), h: c.h },
                    opacity: hoveredProperty === "padding-h" ? 0.42 : 0.25,
                  },
                ];
                return (
                  <>
                    {strips
                      .filter((s) => s.rect.w > 0 && s.rect.h > 0)
                      .map((s) => (
                        <rect
                          key={s.key}
                          {...boxRect(s.rect)}
                          fill={`rgba(255, 94, 174, ${s.opacity})`}
                          stroke="#ff5eae"
                          strokeWidth={1}
                        />
                      ))}
                    <rect {...boxRect(p)} fill="transparent" stroke="#ff5eae" strokeWidth={1.25} />
                    <rect {...boxRect(c)} fill="transparent" stroke="rgba(185, 162, 255, 0.7)" strokeDasharray="3 2" />
                  </>
                );
              })()}
            </svg>

            {/* Floating Padding(v, h) Pill Badge on Top-Right Corner of Selected Border */}
            {showHollowPaddingBand && selectedTel && selectedStyleObj && (
              <div
                className="cs-mono"
                style={{
                  position: "absolute",
                  left: Math.max(6, Math.min(canvasPixelW - 110, 6 + (selectedTel.border.x + selectedTel.border.w) * cellSize.w - 92)),
                  top: Math.max(4, 6 + selectedTel.border.y * cellSize.h - 10),
                  zIndex: 18,
                  pointerEvents: "none",
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: "#150f1d",
                  border: "1px solid #ff5eae",
                  color: "#ff5eae",
                  fontSize: 10.5,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.45)",
                }}
              >
                Padding({selectedStyleObj.padding[0]}, {selectedStyleObj.padding[1]})
              </div>
            )}

            {/* Draggable Split-Edge Handles Between Panes */}
            {splitEdges.map((edge) => {
              const hot = hoveredEdgeKey === edge.key || dragEdgeInfo?.key === edge.key;
              if (edge.axis === "x") {
                const spanPx = Math.max(8, edge.span * cellSize.h);
                const pillH = Math.min(28, Math.max(10, spanPx - 4));
                return (
                  <div
                    key={edge.key}
                    onPointerDown={(e) => startSplitEdgeDrag(e, edge)}
                    onMouseEnter={() => setHoveredEdgeKey(edge.key)}
                    onMouseLeave={() => setHoveredEdgeKey((k) => (k === edge.key ? null : k))}
                    title="Drag seam to resize pane width in terminal cells"
                    style={{
                      position: "absolute",
                      left: 6 + edge.seamX * cellSize.w - 4,
                      top: 6 + edge.seamY * cellSize.h,
                      width: 8,
                      height: spanPx,
                      cursor: "col-resize",
                      zIndex: 19,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {hot && (
                      <div
                        style={{
                          position: "absolute",
                          top: 0,
                          bottom: 0,
                          left: 3,
                          width: 2,
                          background: "rgba(255, 94, 174, 0.55)",
                          borderRadius: 2,
                        }}
                      />
                    )}
                    <div
                      style={{
                        position: "relative",
                        width: 4,
                        height: pillH,
                        borderRadius: 999,
                        background: hot ? "#ff5eae" : "rgba(255, 94, 174, 0.35)",
                        boxShadow: hot ? "0 0 8px rgba(255, 94, 174, 0.75)" : "0 1px 3px rgba(0, 0, 0, 0.45)",
                        transition: "background 140ms ease, box-shadow 140ms ease",
                      }}
                    />
                  </div>
                );
              }
              const spanPx = Math.max(8, edge.span * cellSize.w);
              const pillW = Math.min(28, Math.max(10, spanPx - 4));
              return (
                <div
                  key={edge.key}
                  onPointerDown={(e) => startSplitEdgeDrag(e, edge)}
                  onMouseEnter={() => setHoveredEdgeKey(edge.key)}
                  onMouseLeave={() => setHoveredEdgeKey((k) => (k === edge.key ? null : k))}
                  title="Drag seam to resize pane height in terminal rows"
                  style={{
                    position: "absolute",
                    left: 6 + edge.seamX * cellSize.w,
                    top: 6 + edge.seamY * cellSize.h - 4,
                    width: spanPx,
                    height: 8,
                    cursor: "row-resize",
                    zIndex: 19,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {hot && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: 3,
                        height: 2,
                        background: "rgba(255, 94, 174, 0.55)",
                        borderRadius: 2,
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: "relative",
                      width: pillW,
                      height: 4,
                      borderRadius: 999,
                      background: hot ? "#ff5eae" : "rgba(255, 94, 174, 0.35)",
                      boxShadow: hot ? "0 0 8px rgba(255, 94, 174, 0.75)" : "0 1px 3px rgba(0, 0, 0, 0.45)",
                      transition: "background 140ms ease, box-shadow 140ms ease",
                    }}
                  />
                </div>
              );
            })}

            {/* Live Cell-Dimension Pill While Dragging a Seam */}
            {dragEdgeInfo && (
              <div
                className="cs-mono"
                style={{
                  position: "absolute",
                  left: Math.max(10, Math.min(canvasPixelW - 140, dragEdgeInfo.x + 8)),
                  top: Math.max(10, dragEdgeInfo.y + 8),
                  zIndex: 25,
                  pointerEvents: "none",
                  padding: "3px 9px",
                  borderRadius: 999,
                  background: "#150f1d",
                  border: "1px solid #ff5eae",
                  color: "#f4eaff",
                  fontSize: 11,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  boxShadow: "0 8px 20px rgba(0, 0, 0, 0.55)",
                }}
              >
                {dragEdgeInfo.label}
              </div>
            )}
          </>
        )}

        {/* Double-Click Inline Quick-Edit Popover */}
        {inlineEdit && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 30,
              width: "min(380px, 92%)",
              background: "var(--cs-surface)",
              border: "1px solid var(--cs-pink)",
              borderRadius: 10,
              padding: 12,
              boxShadow: "var(--cs-shadow)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontWeight: 700, color: "var(--cs-text-heading)" }}>
              <span>Quick Edit #{inlineEdit.id}</span>
              <span style={{ fontSize: 10.5, color: "var(--cs-text-dim)" }}>Cmd/Ctrl + Enter to apply</span>
            </div>
            <textarea
              autoFocus
              rows={5}
              value={inlineEdit.text}
              onChange={(e) => setInlineEdit({ ...inlineEdit, text: e.target.value })}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  onQuickInlineEdit?.(inlineEdit.id, inlineEdit.text);
                  setInlineEdit(null);
                } else if (e.key === "Escape") {
                  setInlineEdit(null);
                }
              }}
              style={{
                width: "100%",
                background: "var(--cs-input)",
                color: "var(--cs-text)",
                border: "1px solid var(--cs-btn-border)",
                borderRadius: 6,
                padding: 8,
                fontSize: 12,
                fontFamily: `"JetBrains Mono", ui-monospace, monospace`,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
              <button onClick={() => setInlineEdit(null)} style={qBtn}>Cancel</button>
              <button
                onClick={() => {
                  onQuickInlineEdit?.(inlineEdit.id, inlineEdit.text);
                  setInlineEdit(null);
                }}
                style={{
                  ...qBtn,
                  background: "var(--cs-pink-bg)",
                  borderColor: "var(--cs-pink-border)",
                  color: "var(--cs-pink-soft)",
                  fontWeight: 700,
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        )}

        {onResize && (
          <Tooltip title="Resize Terminal" content="Drag this corner handle to test how your layout adapts to different terminal widths and heights.">
            <div
              onPointerDown={startCornerResize}
              style={{
                position: "absolute",
                right: 2,
                bottom: 2,
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "nwse-resize",
                color: "#ff75b5",
                fontSize: 13,
                userSelect: "none",
                opacity: 0.9,
              }}
            >
              ⌟
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

const qBtn: React.CSSProperties = {
  background: "var(--cs-btn-bg)",
  color: "var(--cs-btn-text)",
  border: "1px solid var(--cs-btn-border)",
  borderRadius: 5,
  padding: "2px 6px",
  fontSize: 10.5,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 3,
};
