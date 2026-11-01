// Small shared helpers: hashing, formatting, seeded randomness, tensors.

export function hash(str) {
  // cyrb53: fast, good spread, 53 bits
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
export const clip = (s, n = 200) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
export function summarize(v, n = 120) {
  if (v == null) return String(v);
  if (typeof v === "string") return clip(v, n);
  if (v instanceof Tensor) return `tensor(${v.shape.join("×") || "scalar"})`;
  try { return clip(JSON.stringify(v), n); } catch { return clip(String(v), n); }
}
export function fmtUs(us) {
  if (us == null || !isFinite(us)) return "—";
  if (us >= 1e6) return (us / 1e6).toFixed(2) + " s";
  if (us >= 1000) return (us / 1000).toFixed(us >= 1e5 ? 0 : 2) + " ms";
  if (us >= 100) return us.toFixed(0) + " µs";
  if (us >= 10) return us.toFixed(1) + " µs";
  return us.toFixed(2) + " µs";
}
export function fmtNum(x, d = 2) {
  if (x == null || !isFinite(x)) return "—";
  const a = Math.abs(x);
  if (a >= 1e12) return (x / 1e12).toFixed(d) + "T";
  if (a >= 1e9) return (x / 1e9).toFixed(d) + "G";
  if (a >= 1e6) return (x / 1e6).toFixed(d) + "M";
  if (a >= 1e3) return (x / 1e3).toFixed(d) + "k";
  return a >= 100 ? x.toFixed(0) : a >= 1 ? x.toFixed(d) : x.toPrecision(3);
}
export const fmtBytes = (b) => (b >= 1 << 30 ? (b / (1 << 30)).toFixed(2) + " GiB" : b >= 1 << 20 ? (b / (1 << 20)).toFixed(1) + " MiB" : b >= 1024 ? (b / 1024).toFixed(1) + " KiB" : b + " B");
export const fmtMs = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(2) + " s" : ms.toFixed(ms < 10 ? 1 : 0) + " ms");

// a seeded PRNG (mulberry32) and a normal sampler
export function rng(seed = 1) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next.normal = () => { const u = Math.max(1e-12, next()), v = next(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return next;
}

export const numel = (shape) => shape.reduce((a, b) => a * b, 1);
// an input's part of a kernel identity: its shape, and its dtype only when it is not f32 (f32 identities predate dtypes)
export const inKey = (shape, dtype = "f32") => shape.join("x") + (dtype === "f32" ? "" : ":" + dtype);
/** Bytes per element of a kernel input dtype. */
export { dtypeBytes } from "./dtypes.js";
export function strides(shape) { const s = new Array(shape.length); let m = 1; for (let i = shape.length - 1; i >= 0; i--) { s[i] = m; m *= shape[i]; } return s; }

// Reference tensors are row-major. Low-precision floats retain f32 storage with
// explicit rounding; integer and Boolean tensors retain exact typed storage.
export class Tensor {
  constructor(shape, data, dtype = null) {
    this.shape = shape.slice();
    this.dtype = dtype || (data instanceof BigInt64Array ? "i64" : data instanceof Int32Array ? "i32" : data instanceof Uint8Array ? "u8" : "f32");
    const storage = { f32: Float32Array, f16: Float32Array, bf16: Float32Array,
                      i64: BigInt64Array, i32: Int32Array, bool: Uint8Array, u8: Uint8Array }[this.dtype];
    if (!storage) throw new TypeError(`unsupported reference tensor dtype: ${this.dtype}`);
    this.data = data || new storage(numel(shape));
    if (!(this.data instanceof storage) || this.data.length !== numel(shape)) {
      throw new TypeError(`reference tensor ${this.dtype} storage or element count mismatch`);
    }
  }
  get size() { return this.data.length; }
  static fill(shape, f, dtype = "f32") { const t = new Tensor(shape, null, dtype); const n = t.data.length; const v = t.dtype === "i64" ? (x) => BigInt(x) : (x) => x; if (typeof f !== "function") t.data.fill(v(f)); else for (let i = 0; i < n; i++) t.data[i] = v(f(i)); return t; }
  static random(shape, { seed = 1, scale = 1, dist = "normal" } = {}) { const r = rng(seed); return Tensor.fill(shape, () => (dist === "uniform" ? (r() * 2 - 1) * scale : r.normal() * scale)); }
  at(...idx) { const s = strides(this.shape); let o = 0; idx.forEach((v, i) => { o += v * s[i]; }); return this.data[o]; }
  preview(n = 6) { return Array.from(this.data.slice(0, n)).map((x) => typeof x === "bigint" ? x.toString() : +x.toPrecision(4)); }
}
export function compare(a, b, { rtol = 1e-4, atol = 1e-5 } = {}) {
  const A = a instanceof Tensor ? a.data : typeof a === "number" ? [a] : a, B = b instanceof Tensor ? b.data : typeof b === "number" ? [b] : b;
  if (A.length !== B.length) return { ok: false, message: `sizes differ: ${A.length} vs ${B.length}`, maxAbs: Infinity, bad: A.length };
  if (A instanceof BigInt64Array || B instanceof BigInt64Array) {
    let bad = 0, first = -1;
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) { bad++; if (first < 0) first = i; }
    return { ok: bad === 0, maxAbs: bad ? Infinity : 0, maxRel: bad ? Infinity : 0,
             bad, n: A.length, first, message: bad ? `${bad} of ${A.length} integer values differ (first at ${first}: ${A[first]} vs ${B[first]})` : "integer values equal" };
  }
  let maxAbs = 0, maxRel = 0, bad = 0, first = -1;
  for (let i = 0; i < A.length; i++) {
    const d = Math.abs(A[i] - B[i]);
    if (!(d <= atol + rtol * Math.abs(B[i]))) { bad++; if (first < 0) first = i; }
    if (d > maxAbs || Number.isNaN(d)) maxAbs = Number.isNaN(d) ? Infinity : d;
    const r = d / (Math.abs(B[i]) + 1e-12);
    if (r > maxRel) maxRel = r;
  }
  return { ok: bad === 0, maxAbs, maxRel, bad, n: A.length, first, message: bad ? `${bad} of ${A.length} values differ (first at ${first}: ${A[first]} vs ${B[first]}), max abs diff ${maxAbs.toExponential(2)}` : `max abs diff ${maxAbs.toExponential(2)}` };
}
export function median(xs) { if (!xs.length) return NaN; const s = xs.slice().sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
export const dur = (x) => (typeof x === "number" ? x : (() => { const m = String(x).trim().match(/^([\d.]+)\s*(ms|s|m)?$/); if (!m) throw new Error(`not a duration: ${x}`); return +m[1] * (m[2] === "s" ? 1000 : m[2] === "m" ? 60000 : 1); })());
