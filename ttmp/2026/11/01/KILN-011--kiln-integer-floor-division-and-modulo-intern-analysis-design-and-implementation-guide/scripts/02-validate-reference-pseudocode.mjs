// KILN-011: check the design doc's reference pseudocode (Section 6.4) against PyTorch CPU values.
// Usage: node 02-validate-reference-pseudocode.mjs <expected.json from 02-torch-expected.py>
import { readFileSync } from "node:fs";
const zeroDivide = () => { throw new Error("ZeroDivisionError"); };
const big = (x) => (typeof x === "bigint" ? x : BigInt(x)), wrap64 = (x) => BigInt.asIntN(64, x);
const floorFix = (q, r, b, one) => (r != 0 && (r < 0) !== (b < 0) ? q - one : q);
const I64 = {
  floordiv: (a, b) => { a = big(a); b = big(b); if (b === 0n) zeroDivide(); return wrap64(floorFix(a / b, a % b, b, 1n)); },
  remainder: (a, b) => { a = big(a); b = big(b); if (b === 0n) zeroDivide(); const r = a % b; return r !== 0n && (r < 0n) !== (b < 0n) ? r + b : r; },
  truncdiv: (a, b) => { a = big(a); b = big(b); if (b === 0n) zeroDivide(); return wrap64(a / b); },
  fmod: (a, b) => { a = big(a); b = big(b); if (b === 0n) zeroDivide(); return a % b; },
};
const I32 = {
  floordiv: (a, b) => { if (b === 0) zeroDivide(); const q = Math.trunc(a / b); return floorFix(q, a - q * b, b, 1) | 0; },
  remainder: (a, b) => { if (b === 0) zeroDivide(); const r = a - Math.trunc(a / b) * b; return (r !== 0 && (r < 0) !== (b < 0) ? r + b : r) | 0; },
  truncdiv: (a, b) => { if (b === 0) zeroDivide(); return Math.trunc(a / b) | 0; },
  fmod: (a, b) => { if (b === 0) zeroDivide(); return (a - Math.trunc(a / b) * b) | 0; },
};
const exp = JSON.parse(readFileSync(process.argv[2], "utf8"));
let n = 0, bad = 0;
for (const c of exp) {
  const impl = (c.dtype === "i64" ? I64 : I32)[c.op];
  c.a.forEach((a, i) => {
    const got = String(c.dtype === "i64" ? impl(BigInt(a), BigInt(c.b[i])) : impl(Number(a), Number(c.b[i])));
    n++; if (got !== String(c.want[i])) { bad++; console.log("MISMATCH", c.op, c.dtype, a, c.b[i], "got", got, "want", c.want[i]); }
  });
}
let zd = 0; for (const t of [I64, I32]) for (const f of Object.values(t)) { try { f(t === I64 ? 5n : 5, t === I64 ? 0n : 0); } catch { zd++; } }
console.log(`${n} cases, ${bad} mismatches; zero divisor raised in ${zd}/8 functions`);
