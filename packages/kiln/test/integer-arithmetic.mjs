// P3a slice 3: typed integer arithmetic. PyTorch's type promotion resolves every frontend elementwise op
// into one typed function (add_i64, ne_i32, to_f32, ...); kernels give each value one static type; the
// reference computes int64 exactly in BigInt and wraps as CUDA does.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { Tensor } from "../src/core/util.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { exportProgram } from "../src/std/export.js";
import { SPECS, target } from "../src/std/targets.js";
import { FNS } from "../src/std/fns.js";
import { schedule } from "../src/std/loop.js";

const pipe = pipeline({ target: target(SPECS.a100) });
const i64 = (shape, values) => new Tensor(shape, BigInt64Array.from(values.map(BigInt)));
const dtypeOf = (fn, inputs) => { const g = k.trace("t", (v) => ({ out: fn(v) }), inputs); return g.nodes.get(g.outputs[0].id).type.dtype; };

// promotion: category bool < integer < float; dimensioned tensors dominate 0-dim tensors and scalars,
// which only lift the category, to its default dtype for a scalar
const I = { x: k.tensor([4], "i64"), y: k.tensor([4], "i32"), b: k.tensor([4], "bool"), f: k.tensor([4], "f16"), s: k.tensor([], "f32") };
assert.equal(dtypeOf(({ x }) => N.add(x, N.int(1)), I), "i64");
assert.equal(dtypeOf(({ y }) => N.add(y, N.int(1)), I), "i32", "an int scalar does not widen int32");
assert.equal(dtypeOf(({ y }) => N.mul(y, 1e6), I), "f32", "a float scalar lifts an integer tensor to the default float");
assert.equal(dtypeOf(({ x, y }) => N.add(x, y), I), "i64");
assert.equal(dtypeOf(({ b }) => N.add(b, N.int(1)), I), "i64");
assert.equal(dtypeOf(({ f, x }) => N.mul(f, x), I), "f16", "a floating tensor keeps its own dtype over integers");
assert.equal(dtypeOf(({ y, s }) => N.add(y, s), I), "f32", "a 0-dim float tensor lifts the category");
assert.equal(dtypeOf(({ x }) => N.ne(x, N.int(0)), I), "bool");
assert.equal(dtypeOf(({ x }) => N.sum(x), I), "i64");
assert.equal(dtypeOf(({ y }) => N.sum(y), I), "i64", "integer sums widen to int64");
assert.equal(dtypeOf(({ y }) => N.amax(y), I), "i32");
assert.equal(dtypeOf(({ b }) => N.cumsum(b), I), "i64");
assert.throws(() => dtypeOf(({ b }) => N.add(b, b), I), /add over bool values is not lowered/);
assert.throws(() => dtypeOf(({ x }) => N.div(x, x), I), /div over i64 values is not lowered/);
assert.throws(() => dtypeOf(({ x }) => N.maskedFill(x, x, 0), I), /bool mask/);

// the reference is exact past 2^53 and wraps at 2^63, as CUDA's two's-complement arithmetic does
const big = k.trace("big", ({ x }) => ({ out: N.add(x, N.int(1)) }), { x: k.tensor([2], "i64") });
assert.deepEqual([...big.eval({ x: i64([2], [2n ** 53n, 2n ** 63n - 1n]) }).out.data], [2n ** 53n + 1n, -(2n ** 63n)]);
// conversions: truncation toward zero; nonzero is true
assert.deepEqual([FNS.to_i64.js(-2.7), FNS.to_i32.js(2.7), FNS.to_bool.js(-0.5), FNS.to_bool.js(0n)], [-2n, 2, 1, 0]);

// a position-id graph (the PassBench families' idiom): exact through the pipeline and typed in CUDA
const ids = i64([2, 6], [1, 1, 0, 1, 1, 1, 5, 0, 0, 7, 3, 1]);
const g = k.trace("pos", ({ ids, x }) => {
  const mask = N.cast(N.ne(ids, N.int(0)), "i32");
  return {
    pos: N.add(N.cast(N.mul(N.cast(N.cumsum(mask, -1), "i32"), mask), "i64"), N.int(1)),
    peak: N.amax(N.cumsum(ids, -1), -1, false),
    scaled: N.mul(ids, 1e6),
    filled: N.maskedFill(ids, N.eq(ids, N.int(0)), N.int(-9)),
    masked: N.maskedFill(x, N.cast(N.sub(1.0, N.cast(ids, "f32")), "bool"), -3.4e38),
  };
}, { ids: k.tensor([2, 6], "i64"), x: k.tensor([2, 6]) });
const x = Tensor.fill([2, 6], (i) => i / 4);
const ref = g.eval({ ids, x });
assert.deepEqual([...ref.pos.data].map(Number), [2, 3, 1, 4, 5, 6, 2, 1, 1, 3, 4, 5]);
assert.deepEqual([...ref.peak.data], [5n, 16n]);
assert.deepEqual([...ref.filled.data].map(Number), [1, 1, -9, 1, 1, 1, 5, -9, -9, 7, 3, 1]);
assert.deepEqual([...ref.masked.data].map((v, i) => (Number(ids.data[i]) === 1 ? v : "m")), [0, 0.25, "m", 0.75, 1, 1.25, "m", "m", "m", "m", "m", 2.75]);
const r = pipe.run(g);
assert.ok(!r.error, r.error?.message);
const got = r.at("loop").eval({ ids, x });
for (const name of Object.keys(ref)) assert.deepEqual([...got[name].data], [...ref[name].data], name);
const p = exportProgram(r, programOf(r.graph));
const cuda = p.kernels.map((kn) => kn.cuda).join("\n");
assert.match(cuda, /\(\(in\d\) != \(0LL\)\)/, "an int64 comparison against an exact integer literal");
// cumsum is a scan (KILN-008): the position-id idiom is one kernel, the scan's consumer amax another
const L = r.at("loop"), kernelOf = (name) => L.nodes.get(L.outputs.find((o) => o.name === name).id);
assert.equal(schedule(kernelOf("pos").attrs.expr, [2, 6]).scanV, "a1", "pos fuses mask, scan and epilogue into one kernel");
assert.deepEqual(kernelOf("pos").args, ["ids"], "the position ids read only the input ids");
assert.equal(schedule(kernelOf("peak").attrs.expr, [2]).scanV, null, "amax(cumsum) does not inline its scan into a reduction");
assert.equal(schedule(L.nodes.get(kernelOf("peak").args[0]).attrs.expr, [2, 6]).scanV, "a1", "peak reads a separate scan kernel");
// one block per row: int64 partial sums stage through int64 shared arrays, in the tree combine and the block scan
const rowRun = pipe.run(g, { params: { MAP: "row" } });
const rowCuda = exportProgram(rowRun, programOf(rowRun.graph)).kernels.map((kn) => kn.cuda).join("\n");
assert.match(rowCuda, /__shared__ long long s_red\[/, "an int64 tree combine stages int64 partial sums");
assert.match(rowCuda, /__shared__ long long s_scan0\[/, "an int64 block scan stages int64 prefixes");
assert.match(cuda, /\(-9223372036854775807LL - 1\)/, "the int64 max identity is spelled without overflow");
assert.match(cuda, /\(\(float\)\(in\d\)\)/, "integer to float is an explicit conversion");
for (const src of [cuda, rowCuda]) assert.ok(!/[0-9]\.0f \+|\+ [0-9.]+f\)/.test(src.split("\n").filter((l) => /long long|LL/.test(l)).join("\n")), "no float literal in integer arithmetic");
assert.deepEqual(p.outputs.map((o) => o.dtype), ["i64", "i64", "f32", "i64", "f32"]);

console.log("typed integer arithmetic: promotion, exact reference, typed CUDA");
