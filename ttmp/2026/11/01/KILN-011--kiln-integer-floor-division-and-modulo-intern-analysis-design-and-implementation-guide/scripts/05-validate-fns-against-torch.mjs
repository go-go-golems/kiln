// KILN-011 implementation check: the FNS reference functions as implemented in packages/kiln/src/std/fns.js
// against PyTorch CPU values from 02-torch-expected.py, plus the INT_MIN / -1 and zero-divisor contracts.
// Usage: node 05-validate-fns-against-torch.mjs <repo root> <expected.json>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [root, expected] = process.argv.slice(2);
const { FNS } = await import(pathToFileURL(`${root}/packages/kiln/src/std/fns.js`).href);
const exp = JSON.parse(readFileSync(expected, "utf8"));
let n = 0, bad = 0;
for (const c of exp) {
  const f = FNS[`${c.op}_${c.dtype}`].js;
  c.a.forEach((a, i) => {
    const got = String(c.dtype === "i64" ? f(BigInt(a), BigInt(c.b[i])) : f(Number(a), Number(c.b[i])));
    n++; if (got !== String(c.want[i])) { bad++; console.log("MISMATCH", c.op, c.dtype, a, c.b[i], "got", got, "want", c.want[i]); }
  });
}
// trunc INT_MIN / -1: PyTorch CPU traps (SIGFPE); the reference wraps, as the CUDA helper does
const trunc = [String(FNS.truncdiv_i64.js(-(2n ** 63n), -1n)), String(FNS.truncdiv_i32.js(-(2 ** 31), -1))];
if (trunc.join() !== `${-(2n ** 63n)},${-(2 ** 31)}`) { bad++; console.log("MISMATCH trunc INT_MIN/-1", trunc); }
let zd = 0;
for (const t of ["i32", "i64"]) for (const op of ["floordiv", "remainder", "truncdiv", "fmod"]) {
  try { FNS[`${op}_${t}`].js(t === "i64" ? 5n : 5, t === "i64" ? 0n : 0); } catch (e) { if (e.kind === "ZeroDivisionError") zd++; }
}
console.log(`${n} cases, ${bad} mismatches; ZeroDivisionError raised in ${zd}/8 functions`);
process.exit(bad || zd !== 8 ? 1 : 0);
