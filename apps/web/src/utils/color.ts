export function hexToRgb(hex: string): string | null {
  // Remove hash
  hex = hex.replace(/^#/, "");

  // Convert 3-char hex to 6-char
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  // Parse hex
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})?$/i.exec(
    hex,
  );
  if (!result) return null;
  const r = result[1];
  const g = result[2];
  const b = result[3];
  if (!r || !g || !b) return null;
  return `${parseInt(r, 16)} ${parseInt(g, 16)} ${parseInt(b, 16)}`;
}

// Convert HSL/HSLA to RGB
// hsla(240, 25%, 6%, 1) -> 15 15 19 (approx)
function hslToRgb(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

  return `${Math.round(255 * f(0))} ${Math.round(255 * f(8))} ${Math.round(
    255 * f(4),
  )}`;
}

function parseHsla(hsla: string): string | null {
  // matches hsla(H, S%, L%, A) or hsl(H, S%, L%)
  // simple regex, assuming comma separation and valid syntax
  const match = hsla.match(/hsla?\((\d+),\s*(\d+)%,\s*(\d+)%(?:,\s*[\d.]+)?\)/);
  if (match) {
    const h = match[1];
    const s = match[2];
    const l = match[3];
    if (!h || !s || !l) return null;
    return hslToRgb(
      parseInt(h, 10),
      parseInt(s, 10),
      parseInt(l, 10),
    );
  }
  return null;
}

export function colorToRgbString(color: string): string {
  if (color.startsWith("#")) {
    const rgb = hexToRgb(color);
    if (rgb) return rgb;
  } else if (color.startsWith("hsl")) {
    const rgb = parseHsla(color);
    if (rgb) return rgb;
  }
  // If parsing fails, assume it's already in RGB or named color
  // However, returning "red" for Tailwind opacity utility will likely fail (as it expects RGB components)
  // But returning original string allows basic non-opacity usage to potentially work or fail gracefully.
  return color;
}
