import {
  findNode,
  getFriendlyNodeName,
  type IRDoc,
  type OverflowDiagnosis,
  type TelemetryNode,
} from "./types";

export function buildOverflowDiagnoses(
  doc: IRDoc,
  telemetry: TelemetryNode[],
  opts: { cols: number; rows: number; presetTitle?: string }
): OverflowDiagnosis[] {
  const failing = telemetry.filter((t) => t.overflowX || t.overflowY);
  if (failing.length === 0) return [];

  const fileLocked = Boolean(doc.importedGo?.fileSyncDisabled);

  return failing.map((t) => {
    const node = findNode(doc, t.id);
    const nodeLabel = getFriendlyNodeName(node);
    const styleName = node?.style;
    const styleObj = styleName ? doc.styles[styleName] : undefined;

    const allocW = t.allocatedW ?? opts.cols;
    const allocH = t.allocatedH ?? opts.rows;
    const actualW = t.actualW ?? Math.max(t.margin.w, t.border.w);
    const actualH = t.actualH ?? Math.max(t.margin.h, t.border.h);
    const deltaW = Math.max(0, actualW - allocW);
    const deltaH = Math.max(0, actualH - allocH);

    const padV = (styleObj?.padding[0] ?? 0) + (styleObj?.padding[2] ?? 0);
    const padH = (styleObj?.padding[1] ?? 0) + (styleObj?.padding[3] ?? 0);

    const nodeKey = `node:${t.id}`;
    const nodeLocks = doc.lockedProps?.[nodeKey] ?? [];
    const styleLocks = styleName ? doc.lockedProps?.[styleName] ?? [] : [];

    const nodeLocked =
      fileLocked ||
      doc.lockReasons?.[nodeKey] === "sync-disabled" ||
      nodeLocks.includes("*");
    const styleLocked =
      fileLocked ||
      Boolean(
        styleName &&
          (doc.lockReasons?.[styleName] === "sync-disabled" || styleLocks.includes("*"))
      );
    const widthLocked = nodeLocked || nodeLocks.includes("width");
    const paddingLocked = styleLocked || styleLocks.includes("padding");

    let failingProperty: "width" | "padding" = "width";
    let causeRule = t.overflowMsg || `Content exceeds ${allocW}×${allocH} allocated cells`;

    if (deltaW > 0) {
      if (node?.width?.mode === "fixed" && (node.width.value ?? 0) > allocW) {
        failingProperty = "width";
        causeRule = `Fixed Width(${node.width.value}) exceeds ${allocW} allocated cols`;
      } else if (padH > 0 && (node?.width?.mode !== "fixed" || padH >= deltaW)) {
        failingProperty = "padding";
        causeRule = `Horizontal Padding(${styleObj?.padding[0] ?? 0}, ${styleObj?.padding[1] ?? 0}) (${padH} cols) exceeds ${allocW}-col cell budget`;
      } else {
        failingProperty = "width";
        causeRule = `Rendered width (${actualW} cols) exceeds ${allocW} allocated cols`;
      }
    } else if (deltaH > 0) {
      if (padV > 0 && (node?.height?.mode !== "fixed" || padV >= deltaH)) {
        failingProperty = "padding";
        causeRule = `Vertical Padding(${styleObj?.padding[0] ?? 0}, ${styleObj?.padding[1] ?? 0}) (${padV} rows) exceeds ${allocH}-row cell budget`;
      } else {
        failingProperty = "width";
        causeRule = `Rendered height (${actualH} rows) exceeds ${allocH} allocated rows`;
      }
    }

    const deltaParts: string[] = [];
    if (deltaW > 0) deltaParts.push(`+${deltaW} col${deltaW === 1 ? "" : "s"}`);
    if (deltaH > 0) deltaParts.push(`+${deltaH} row${deltaH === 1 ? "" : "s"}`);
    const deltaSummary = deltaParts.join(" · ") || "exceeds bounds";

    const canEnableTruncate = Boolean(styleObj && !styleObj.truncate && !styleLocked);
    const canCollapseBelow = Boolean(
      node && !widthLocked && (node.width?.collapseBelow ?? 0) < 70 && t.id !== doc.root.id
    );
    const canSwitchToFill = Boolean(
      node && !widthLocked && node.width?.mode === "fixed" && t.id !== doc.root.id
    );
    const canReducePadding = Boolean(
      styleObj && !paddingLocked && ((deltaW > 0 && padH > 0) || (deltaH > 0 && padV > 0))
    );

    const suggestionParts: string[] = [];
    if (canReducePadding && styleObj) {
      const nextV = deltaH > 0 ? Math.max(0, styleObj.padding[0] - 1) : styleObj.padding[0];
      const nextH = deltaW > 0 ? Math.max(0, styleObj.padding[1] - 1) : styleObj.padding[1];
      suggestionParts.push(`reduce Padding to (${nextV}, ${nextH})`);
    }
    if (canEnableTruncate) suggestionParts.push("enable Truncate");
    if (canCollapseBelow) suggestionParts.push("set CollapseBelow 70");
    if (canSwitchToFill) suggestionParts.push("switch Width to Fill");

    const suggestion =
      suggestionParts.length > 0
        ? suggestionParts[0].charAt(0).toUpperCase() + suggestionParts.slice(0, 2).join(" or ").slice(1)
        : undefined;

    return {
      nodeId: t.id,
      nodeLabel,
      styleName,
      presetTitle: opts.presetTitle || `${opts.cols}×${opts.rows}`,
      cols: opts.cols,
      rows: opts.rows,
      actualW,
      actualH,
      allocatedW: allocW,
      allocatedH: allocH,
      deltaW,
      deltaH,
      headline: `${nodeLabel} overflows at ${opts.cols} x ${opts.rows}`,
      displayHeadline: `${nodeLabel} overflows at ${opts.cols} × ${opts.rows}`,
      dimensionsText: `actual ${actualW}×${actualH} vs allocated ${allocW}×${allocH} (${deltaSummary})`,
      deltaSummary,
      failingProperty,
      causeRule,
      goFile: failingProperty === "padding" ? "theme_gen" : "layout_gen",
      goSymbol: failingProperty === "padding" ? styleName || t.id : t.id,
      suggestion,
      canEnableTruncate,
      canCollapseBelow,
      canSwitchToFill,
      canReducePadding,
    };
  });
}

export function formatOverflowSummaryLabel(diagnoses: OverflowDiagnosis[]): string {
  if (diagnoses.length === 0) return "";
  const first = diagnoses[0];
  if (diagnoses.length === 1) {
    return `${first.nodeLabel} overflows at ${first.cols} × ${first.rows}`;
  }
  return `${diagnoses.length} panes overflow at ${first.cols} × ${first.rows}`;
}

export function formatOverflowCopyText(diag: OverflowDiagnosis): string {
  const lines = [
    diag.headline,
    `Dimensions: ${diag.dimensionsText}`,
    `Cause: ${diag.causeRule}`,
  ];
  if (diag.suggestion) {
    lines.push(`Suggestion: ${diag.suggestion}`);
  }
  return lines.join("\n");
}
