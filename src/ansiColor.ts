// Keep the index in the IR and Go export. RGB is only for the browser swatch.
export function isAnsiIndex(value: string): boolean {
  return /^(0|[1-9]\d{0,2})$/.test(value) && Number(value) <= 255;
}

export function readGoAnsiColor(expr: string): string | undefined {
  const match = /^(?:(?:lipgloss|compat)\.)?Color\(\s*"(\d+)"\s*\)$/.exec(expr.trim());
  if (!match) return undefined;
  const index = String(Number(match[1]));
  return isAnsiIndex(index) ? index : undefined;
}

const basicColors = [
  "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
  "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
];

export function swatchColor(value: string): string {
  if (!isAnsiIndex(value)) return value;
  const index = Number(value);
  if (index < 16) return basicColors[index];
  const gray = 8 + 10 * (index - 232);
  const cube = index - 16;
  const levels = [0, 95, 135, 175, 215, 255];
  const rgb = index >= 232 ? [gray, gray, gray] :
    [levels[Math.floor(cube / 36)], levels[Math.floor(cube / 6) % 6], levels[cube % 6]];
  return "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("");
}
