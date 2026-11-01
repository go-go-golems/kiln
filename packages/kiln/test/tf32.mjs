// matmulPrecision "tf32": FP32 contraction operands are rounded to TF32 (round to nearest, ties to even: probe 671)
// to match a reference backend with PyTorch allow_tf32 for matrix products; bias, convolutions and
// the default "highest" policy are unchanged.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { Tensor } from "../src/core/util.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { SPECS, target } from "../src/std/targets.js";
import { roundTf32 } from "../src/std/fns.js";

assert.equal(roundTf32(1 + 2 ** -11), 1, "a tie rounds to the even neighbour");
assert.equal(roundTf32(-(1 + 2 ** -11)), -1);
assert.equal(roundTf32(1 + 3 * 2 ** -11), 1 + 4 * 2 ** -11, "a tie with an odd neighbour rounds up");
assert.equal(roundTf32(1 + 2 ** -12), 1, "below half an ulp rounds down");
assert.equal(roundTf32(1 + 3 * 2 ** -12), 1 + 2 ** -10);
assert.equal(roundTf32(Infinity), Infinity);
assert.ok(Number.isNaN(roundTf32(NaN)));
assert.equal(roundTf32(3.4028234663852886e38), Infinity, "rounding past the largest TF32 value overflows");

const hardware = target(SPECS.a100);
const g = k.trace("tf32-linear", ({ x, w, b }) => ({ out: N.linear(x, w, b) }), { x: k.tensor([2, 3]), w: k.tensor([4, 3]), b: k.tensor([4]) });
const x = Float32Array.from([1 + 2 ** -11, 2, -3, 0.1, 58.72745, -23.0976]);
const w = Float32Array.from([0.3, -0.7, 1.1, 2 ** -12, 1, 1, -1, 0.333333, 0.25, 0.5, 0.125, 7.77]);
const b = Float32Array.from([0.1, 0.2, 0.3, 0.4]);
const inputs = { x: new Tensor([2, 3], x), w: new Tensor([4, 3], w), b: new Tensor([4], b) };
const expected = (round) => {
  const out = new Float32Array(8);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) {
    let acc = 0;
    for (let r = 0; r < 3; r++) acc = Math.fround(acc + Math.fround(round(x[i * 3 + r]) * round(w[j * 3 + r])));
    out[i * 4 + j] = Math.fround(acc + b[j]);
  }
  return out;
};
const highest = pipeline({ target: hardware, contraction: "separate" }).run(g);
const tf32 = pipeline({ target: hardware, contraction: "separate", matmulPrecision: "tf32" }).run(g);
for (const run of [highest, tf32]) assert.ok(run.ok, run.error?.message);
const close = (a, e) => a.every((v, i) => Math.abs(v - e[i]) <= 1e-6 * Math.max(1, Math.abs(e[i])));
assert.ok(close(tf32.at("loop").eval(inputs).out.data, expected(roundTf32)), "loop reference rounds operands to TF32");
assert.ok(close(highest.at("loop").eval(inputs).out.data, expected((v) => v)), "highest keeps FP32 operands");
assert.ok(!close(tf32.at("loop").eval(inputs).out.data, expected((v) => v)), "the fixture distinguishes the policies");
const tfKernels = programOf(tf32.graph).kernels, fpKernels = programOf(highest.graph).kernels;
assert.ok(tfKernels.some((kn) => kn.cuda.includes("kiln_round_tf32") && kn.cuda.includes("((b >> 13) & 1u)")), "CUDA rounds ties to even");
assert.ok(fpKernels.every((kn) => !kn.cuda.includes("tf32")), "highest emits no TF32 rounding");
// separate contraction has no WGSL guarantee; check WGSL under the default contraction policy
const wgslKernels = programOf(pipeline({ target: hardware, matmulPrecision: "tf32" }).run(g).graph).kernels;
assert.ok(wgslKernels.some((kn) => kn.wgsl && kn.wgsl.includes("fn kiln_round_tf32")), "WGSL carries the same rounding");

// convolutions keep FP32 operands (cuDNN's TF32 convolution is not matched by operand rounding)
const conv = (groups) => k.trace("tf32-conv-" + groups, ({ x, w }) => ({ out: N.conv2d(x, w, null, { groups }) }),
  { x: k.tensor([1, 2, 4, 4]), w: k.tensor([2, 2 / groups, 3, 3]) });
const convCuda = (groups) => programOf(pipeline({ target: hardware, matmulPrecision: "tf32" }).run(conv(groups)).graph).kernels.map((kn) => kn.cuda).join("\n");
assert.ok(!convCuda(1).includes("tf32"));
assert.ok(!convCuda(2).includes("tf32"));
assert.throws(() => pipeline({ matmulPrecision: "medium" }), /matmulPrecision/);
console.log("tf32 matmul precision rounds FP32 contraction operands and nothing else");
