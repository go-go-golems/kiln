// KILN-011 Phase 3: float32 floor division, remainder, fmod and trunc division, as PyTorch computes them.
// Floor division is (a - fmod(a, b)) / b with fix-ups (c10 div_floor_floating), not floor(a / b); the
// remainder of an exact division keeps fmod's zero, signed like the dividend (PyTorch CPU). Expected values
// are PyTorch 2.11 CPU results; scripts/10-validate-float-fns.mjs in KILN-011 checks 100576 random pairs.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { Tensor } from "../src/core/util.js";
import { FNS, CUDA_HELPERS } from "../src/std/fns.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { exportProgram } from "../src/std/export.js";
import { SPECS, target } from "../src/std/targets.js";

const pipe = pipeline({ target: target(SPECS.a100) });
const same = (got, want, what) => got.forEach((g, i) => assert.ok((Number.isNaN(g) && Number.isNaN(want[i])) || Object.is(g, want[i]), `${what}[${i}]: got ${g}, want ${want[i]}`));
const a = [7, -7, 7, -7, 0, -0, 6, -6, 1, -2, 2, 5.5, 1, -1, Infinity, 3];
const b = [2, 2, -2, -2, 3, 3, -3, 3, 0.1, 1, -1, 0, 0, 0, 2, Infinity];
// PyTorch 2.11 CPU output for a // b, a % b, torch.fmod and torch.div(..., rounding_mode="trunc") over these float32 pairs
const WANT = {
  floordiv: [3, -4, -4, 3, 0, -0, -2, -2, 9, -2, -2, Infinity, Infinity, -Infinity, NaN, 0],
  remainder: [1, 1, -1, -1, 0, -0, 0, -0, 0.09999998658895493, -0, 0, NaN, NaN, NaN, NaN, 3],
  fmod: [1, -1, 1, -1, 0, -0, 0, -0, 0.09999998658895493, -0, 0, NaN, NaN, NaN, NaN, 3],
  truncdiv: [3, -3, -3, 3, 0, -0, -2, -2, 10, -2, -2, Infinity, Infinity, -Infinity, Infinity, 0],
};
const OPS = Object.keys(WANT);
for (const op of OPS) same(a.map((x, i) => FNS[op].js(x, b[i])), WANT[op], `${op} reference`);
assert.equal(Math.floor(Math.fround(1 / Math.fround(0.1))), 10, "floor of the f32 quotient is not floor division");

const build = { floordiv: N.floordiv, remainder: N.remainder, truncdiv: (x, y) => N.div(x, y, "trunc"), fmod: N.fmod };
const g = k.trace("fdiv", ({ x, y, i }) => ({
  ...Object.fromEntries(OPS.map((op) => [op, build[op](x, y)])),
  // an int64 dividend and a float scalar promote to float32
  mixed: N.floordiv(i, 2.5),
  // floor of an integer is the integer
  floored: N.floor(i),
}), { x: k.tensor([a.length]), y: k.tensor([b.length]), i: k.tensor([4], "i64") });
const inputs = { x: new Tensor([a.length], Float32Array.from(a)), y: new Tensor([b.length], Float32Array.from(b)), i: new Tensor([4], BigInt64Array.from([7n, -7n, 5n, -1n])) };
const ref = g.eval(inputs);
for (const op of OPS) { assert.equal(ref[op].dtype, "f32"); same([...ref[op].data], WANT[op], `${op} frontend`); }
assert.equal(ref.mixed.dtype, "f32");
assert.deepEqual([...ref.mixed.data], [2, -3, 2, -1]);
assert.equal(ref.floored.dtype, "i64");
assert.deepEqual([...ref.floored.data], [7n, -7n, 5n, -1n]);
const r = pipe.run(g);
assert.ok(!r.error, r.error?.message);
const got = r.at("loop").eval(inputs);
for (const op of OPS) same([...got[op].data], WANT[op], `${op} loop`);
assert.deepEqual([...got.mixed.data], [...ref.mixed.data]);
assert.deepEqual([...got.floored.data], [...ref.floored.data]);
const cuda = exportProgram(r, programOf(r.graph)).kernels.map((kn) => kn.cuda).join("\n");
assert.match(cuda, /kiln_floordiv_f32\(in0, in1\)/);
assert.match(cuda, /kiln_remainder_f32\(in0, in1\)/);
assert.match(cuda, /fmodf\(in0, in1\)/);
assert.match(cuda, /truncf\(\(in0\) \/ \(in1\)\)/);
assert.match(cuda, /(v\d+) = \(\(float\)\(in0\)\);\s+v\d+ = kiln_floordiv_f32\(\1, 2\.5f\)/, "the int64 dividend converts to float first");
for (const h of ["kiln_floordiv_f32", "kiln_remainder_f32"]) assert.ok(cuda.includes(CUDA_HELPERS[h]));
// a float zero divisor is IEEE, not an error
assert.doesNotThrow(() => k.trace("z", ({ x }) => ({ out: N.floordiv(x, N.int(0)) }), { x: k.tensor([2]) }));

console.log("float division: floordiv, remainder, fmod, truncdiv over f32; mixed int/float; integer floor");
