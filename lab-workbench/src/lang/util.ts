/** cyrb53: fast 53-bit string hash, rendered as 13 hex digits. Not cryptographic; identity only. */
export function hash(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(13, '0');
}

/** JSON with sorted keys; functions and regexps are rendered by their source so they hash stably. */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'function') return `ƒ:${hash(String(v))}`;
    if (v instanceof RegExp) return `re:${String(v)}`;
    if (v === undefined) return null;
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return '[cycle]';
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      if (k.startsWith('__fn')) continue;
      out[k] = walk((v as Record<string, unknown>)[k]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(str: string): number {
  return parseInt(hash(str).slice(-8), 16);
}

export interface Rng {
  next(): number;
  range(lo: number, hi: number): number;
  int(lo: number, hi: number): number;
  normal(mean: number, sd: number): number;
  pick<T>(xs: readonly T[]): T;
  chance(p: number): boolean;
}

export function rng(seedText: string): Rng {
  const next = mulberry32(seedFrom(seedText));
  const r: Rng = {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => Math.floor(lo + (hi - lo + 1) * next()),
    normal: (mean, sd) => {
      const u = Math.max(next(), 1e-9);
      const v = next();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    pick: (xs) => xs[Math.floor(next() * xs.length)],
    chance: (p) => next() < p,
  };
  return r;
}

let counter = 0;
export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}${counter.toString(36)}`;
}

export function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function getPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  if (typeof obj === 'object' && path in (obj as object)) return (obj as Record<string, unknown>)[path];
  return path.split('.').reduce<unknown>((acc, part) => (acc == null ? undefined : (acc as Record<string, unknown>)[part]), obj);
}

export function globToRegExp(pattern: string): RegExp {
  const esc = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/#]*');
  return new RegExp(`^${esc}$`);
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function fmtNumber(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (Number.isInteger(v) && a < 1e15) return v.toLocaleString('en-US');
  if (a !== 0 && (a >= 1e6 || a < 1e-3)) return v.toExponential(2);
  return v.toLocaleString('en-US', { maximumSignificantDigits: digits });
}

export function fmtBytes(v: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let x = v;
  let i = 0;
  while (Math.abs(x) >= 1024 && i < units.length - 1) {
    x /= 1024;
    i++;
  }
  return `${x.toLocaleString('en-US', { maximumFractionDigits: i === 0 ? 0 : 1 })} ${units[i]}`;
}
