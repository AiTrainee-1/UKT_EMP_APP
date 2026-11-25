// Shapes and colour helpers for the manga-style cards (owner 2026-11-25: the app-update popup's look, now shared by the
// app tour, the notification / location / permission popups - src/components/manga). Pure: no React Native, tested in
// mangaShapes.test.ts.

/**
 * A manga "burst" (a spiky star, the shape behind a shout) around (cx, cy): `points` spikes reaching `outer`, with the
 * dips between them at `inner`. The first spike points straight up. Returns an SVG path.
 */
export function burstPath(cx: number, cy: number, outer: number, inner: number, points: number): string {
  const n = Math.max(3, Math.round(points));
  const parts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const x = round1(cx + Math.cos(a) * r);
    const y = round1(cy + Math.sin(a) * r);
    parts.push(`${i === 0 ? 'M' : 'L'}${x} ${y}`);
  }
  return `${parts.join(' ')} Z`;
}

function round1(v: number): string {
  const r = Math.round(v * 10) / 10;
  return String(Object.is(r, -0) ? 0 : r);
}

/** "#RRGGBB" or "#RGB" to [r, g, b]; null for anything else (rgba(), names). */
export function parseHex(hex: string): [number, number, number] | null {
  const s = hex.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }
  return null;
}

const hex2 = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');

/**
 * `a` mixed into `b` as a solid colour: amount 0 gives `b`, 1 gives `a`. A card's tint is the accent mixed into the card
 * colour, so it works on both themes. When either colour is not a hex colour, `b` comes back unchanged.
 */
export function mixHex(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return b;
  const t = Math.max(0, Math.min(1, amount));
  return `#${hex2(cb[0] + (ca[0] - cb[0]) * t)}${hex2(cb[1] + (ca[1] - cb[1]) * t)}${hex2(cb[2] + (ca[2] - cb[2]) * t)}`.toUpperCase();
}

/** "#2563EB" + 0.14 -> "rgba(37,99,235,0.14)"; any other format is returned as it is. */
export function withAlpha(hex: string, a: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
}

/** A number as an SVG / style percentage ("37.5%"), kept between 0 and 100. */
export function percent(part: number, whole: number): string {
  if (!(whole > 0)) return '50%';
  const p = Math.max(0, Math.min(100, (part / whole) * 100));
  return `${Math.round(p * 10) / 10}%`;
}
