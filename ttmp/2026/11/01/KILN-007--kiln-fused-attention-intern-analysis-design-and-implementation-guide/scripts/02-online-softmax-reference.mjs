// KILN-007 experiment: a scalar JS reference of flash-style attention (online softmax over key tiles,
// FP32 registers) against the three-pass composition Kiln lowers today, and the effect of rounding the
// probability tile P to f16/bf16 before P·V (the low-precision rounding point the design must model).
// Usage: node .../scripts/02-online-softmax-reference.mjs [L S D BC trials]
import { roundToDtype } from "../../../../../../packages/kiln/src/core/dtypes.js";
const f = Math.fround;
const [L, S, D, BC, trials] = (process.argv.slice(2).length ? process.argv.slice(2) : ["64", "200", "64", "32", "5"]).map(Number);
let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
const gauss = () => f(Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd()));
const mat = (r, c, round) => Array.from({ length: r }, () => Array.from({ length: c }, () => round(gauss())));
// three passes: s = q·k * scale + mask (FP32), m = max s, e = exp(s - m), l = Σ e, p = e / l, o = Σ p v
function threePass(q, k, v, mask, scale) {
  return q.map((qi, i) => {
    const s = k.map((kj, j) => { let a = 0; for (let d = 0; d < D; d++) a = f(a + f(qi[d] * kj[d])); return f(f(a * scale) + mask[i][j]); });
    const m = s.reduce((a, b) => (a > b ? a : b), -Infinity);
    const e = s.map((x) => f(Math.exp(f(x - m)))); const l = e.reduce((a, b) => f(a + b), 0);
    const o = new Array(D).fill(0);
    for (let j = 0; j < S; j++) { const p = f(e[j] / l); for (let d = 0; d < D; d++) o[d] = f(o[d] + f(p * v[j][d])); }
    return o;
  });
}
// online: per key tile of BC columns, m' = max(m, max s_tile), alpha = exp(m - m'), l = alpha·l + Σ exp(s - m'),
// acc = alpha·acc + Σ round(exp(s - m'))·v; out = acc / l. roundP models a kernel that rounds P to the input dtype.
function online(q, k, v, mask, scale, roundP = (x) => x) {
  return q.map((qi, i) => {
    let m = -Infinity, l = 0; const acc = new Array(D).fill(0);
    for (let j0 = 0; j0 < S; j0 += BC) {
      const j1 = Math.min(S, j0 + BC), s = [];
      for (let j = j0; j < j1; j++) { let a = 0; for (let d = 0; d < D; d++) a = f(a + f(qi[d] * k[j][d])); s.push(f(f(a * scale) + mask[i][j])); }
      const mNew = s.reduce((a, b) => (a > b ? a : b), m);
      const alpha = mNew === -Infinity ? 1 : f(Math.exp(f(m - mNew)));
      l = f(l * alpha); for (let d = 0; d < D; d++) acc[d] = f(acc[d] * alpha);
      s.forEach((x, t) => { const p = mNew === -Infinity ? 0 : f(Math.exp(f(x - mNew))); l = f(l + p); const pr = roundP(p); for (let d = 0; d < D; d++) acc[d] = f(acc[d] + f(pr * v[j0 + t][d])); });
      m = mNew;
    }
    return acc.map((a) => f(a / l));
  });
}
const maxErr = (a, b) => { let e = 0, mag = 0; a.forEach((r, i) => r.forEach((x, d) => { e = Math.max(e, Math.abs(x - b[i][d])); mag = Math.max(mag, Math.abs(b[i][d])); })); return { e, mag }; };
console.log(`L=${L} S=${S} D=${D} BC=${BC}`);
for (const dt of ["f32", "f16", "bf16"]) {
  const r = dt === "f32" ? (x) => x : (x) => roundToDtype(x, dt);
  let worst = { online: 0, roundedP: 0 };
  for (let t = 0; t < trials; t++) {
    const q = mat(L, D, r), k = mat(S, D, r), v = mat(S, D, r), mask = mat(L, S, r);
    const ref = threePass(q, k, v, mask, 1 / Math.sqrt(D));
    worst.online = Math.max(worst.online, maxErr(online(q, k, v, mask, 1 / Math.sqrt(D)), ref).e);
    if (dt !== "f32") worst.roundedP = Math.max(worst.roundedP, maxErr(online(q, k, v, mask, 1 / Math.sqrt(D), r), ref).e);
  }
  console.log(`${dt} inputs: online-vs-three-pass max abs ${worst.online.toExponential(2)}${dt !== "f32" ? `; with P rounded to ${dt}: ${worst.roundedP.toExponential(2)}` : ""}`);
}
// fully masked row: three-pass gives NaN (exp(-inf - -inf)); the online form must reproduce PyTorch's choice deliberately
const q = mat(1, D, (x) => x), k = mat(S, D, (x) => x), v = mat(S, D, (x) => x), dead = [new Array(S).fill(-Infinity)];
console.log(`fully masked row: three-pass ${threePass(q, k, v, dead, 0.125)[0][0]}, online ${online(q, k, v, dead, 0.125)[0][0]}`);
