export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#(?<hex>[\da-f]{6}|[\da-f]{3})$/i;
const RGB =
  /^rgb\(\s*(?<r>\d+)\s+(?<g>\d+)\s+(?<b>\d+)\s*(?:\/\s*(?<a>[\d.]+)\s*)?\)$/i;

/** Reads the `#rrggbb`, `#rgb` and `rgb(r g b / a)` forms theme.css uses. */
export function parseColor(value: string): Rgba | undefined {
  const text = value.trim();
  const hex = HEX.exec(text)?.groups?.['hex'];
  if (hex !== undefined) {
    const full = hex.length === 3 ? hex.replaceAll(/[\da-f]/gi, '$&$&') : hex;
    const channel = (offset: number) =>
      Number.parseInt(full.slice(offset, offset + 2), 16);
    return { r: channel(0), g: channel(2), b: channel(4), a: 1 };
  }
  const rgb = RGB.exec(text)?.groups;
  if (rgb === undefined) {
    return undefined;
  }
  return {
    r: Number(rgb['r']),
    g: Number(rgb['g']),
    b: Number(rgb['b']),
    a: rgb['a'] === undefined ? 1 : Number(rgb['a']),
  };
}

/** `foreground` painted over an opaque `background`, as a tint such as `bg-warning/25` is. */
export function blend(foreground: Rgba, background: Rgba): Rgba {
  const mix = (top: number, bottom: number) =>
    top * foreground.a + bottom * (1 - foreground.a);
  return {
    r: mix(foreground.r, background.r),
    g: mix(foreground.g, background.g),
    b: mix(foreground.b, background.b),
    a: 1,
  };
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contrastRatio(first: Rgba, second: Rgba): number {
  const [light, dark] = [luminance(first), luminance(second)].toSorted(
    (a, b) => b - a
  );
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}
