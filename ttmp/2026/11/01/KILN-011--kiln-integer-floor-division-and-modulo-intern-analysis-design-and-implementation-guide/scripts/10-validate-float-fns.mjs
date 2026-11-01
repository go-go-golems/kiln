// KILN-011 Phase 3: the f32 floordiv, remainder, fmod and truncdiv references in fns.js against PyTorch
// CPU float32 bit patterns from 09-torch-expected-float.py. NaNs compare equal to NaNs; zeros compare
// by sign. PyTorch CPU's vectorized fmod and remainder return NaN when |a / b| overflows float32
// (they compute through the quotient); C fmodf, which the CUDA spelling uses, is exact there. Those
// cases are counted separately as quotient_overflow, not as mismatches. Usage: node 10-validate-float-fns.mjs <repo root> <expected.json>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const [root, expected] = process.argv.slice(2);
const { FNS } = await import(pathToFileURL(`${root}/packages/kiln/src/std/fns.js`).href);
const e = JSON.parse(readFileSync(expected, "utf8"));
const I = new Int32Array(1), F = new Float32Array(I.buffer);
const val = (bits) => { I[0] = bits; return F[0]; };
const same = (x, y) => (Number.isNaN(x) && Number.isNaN(y)) || Object.is(x, y);
const report = {};
for (const op of ["floordiv", "remainder", "fmod", "truncdiv"]) {
  let bad = 0, zeroSign = 0, overflow = 0;
  e.a.forEach((ab, i) => {
    const got = FNS[op].js(val(ab), val(e.b[i])), want = val(e[op][i]);
    if (same(got, want)) return;
    if (got === 0 && want === 0) { zeroSign++; return; }
    const a = val(ab), b = val(e.b[i]);
    if ((op === "fmod" || op === "remainder") && Number.isNaN(want) && Number.isFinite(a) && !Number.isFinite(Math.fround(a / b))) { overflow++; return; }
    if (bad++ < 5) console.log("MISMATCH", op, val(ab), val(e.b[i]), "got", got, "want", want);
  });
  report[op] = { cases: e.a.length, mismatches: bad, zero_sign_only: zeroSign, quotient_overflow: overflow };
}
let naive = 0;
e.a.forEach((ab, i) => { if (!same(val(e.naive_floor[i]), val(e.floordiv[i]))) naive++; });
report.floor_of_quotient_differs_from_floordiv = naive;
console.log(JSON.stringify(report));
process.exit(Object.values(report).some((r) => r.mismatches) ? 1 : 0);
