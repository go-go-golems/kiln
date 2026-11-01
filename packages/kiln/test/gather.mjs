// P3a slice 2: gathers (embedding, index_select, x[ids]) are views whose index map reads an int64
// tensor through data-dependent terms. The fused Loop IR reference must equal the frontend reference,
// including negative-index wrapping, and CUDA reads the index as long long.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { Tensor } from "../src/core/util.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { exportProgram } from "../src/std/export.js";
import { SPECS, target } from "../src/std/targets.js";

const pipe = pipeline({ target: target(SPECS.a100) });
const ids64 = (shape, values) => new Tensor(shape, BigInt64Array.from(values.map(BigInt)));
const f32 = (shape, n = shape.reduce((a, b) => a * b, 1)) => new Tensor(shape, Float32Array.from({ length: n }, (_, i) => i * 0.5 - 3));
const cases = [
  ["embedding + bias", ({ ids, w, b }) => ({ out: N.add(N.embedding(ids, w), b) }), { ids: k.tensor([2, 3], "i64"), w: k.tensor([5, 4]), b: k.tensor([4]) },
    { ids: ids64([2, 3], [4, 0, 2, 2, 1, 3]), w: f32([5, 4]), b: f32([4]) }],
  ["index_select of a view", ({ x, ids }) => ({ out: N.indexSelect(N.transpose(x), 1, ids) }), { x: k.tensor([6, 3]), ids: k.tensor([4], "i64") },
    { x: f32([6, 3]), ids: ids64([4], [5, 0, 5, 2]) }],
  ["x[ids] with negative indices, ids through a view", ({ x, ids }) => ({ out: N.gather(N.reshape(x, [8, 3]), N.reshape(ids, [5]), 0, true) }), { x: k.tensor([24]), ids: k.tensor([5, 1], "i64") },
    { x: f32([24]), ids: ids64([5, 1], [-1, 0, -8, 7, 3]) }],
];
for (const [name, fn, types, inputs] of cases) {
  const g = k.trace(name, fn, types);
  const want = Array.from(g.eval(inputs).out.data);
  const r = pipe.run(g);
  assert.ok(r.ok, `${name}: ${r.error?.message}`);
  const fused = r.at("loop");
  assert.ok([...fused.nodes.values()].filter((n) => n.name === "loop.kernel").length === 1, `${name}: one fused Loop IR kernel`);
  const got = Array.from(fused.eval(inputs).out.data);
  assert.deepEqual(got, want, name);
  const p = exportProgram(r, programOf(r.graph));
  assert.equal(p.kernels.length, 1, `${name}: gather and its consumers fuse into one kernel`);
  assert.match(p.kernels[0].cuda, /const long long\* __restrict__ src\d/);
  assert.match(p.kernels[0].cuda, /\(int\)src\d\[/);
}
// negative index wrapping: row -1 is row 7
assert.deepEqual(Array.from(k.trace("w", ({ x, ids }) => ({ out: N.gather(x, ids, 0, true) }), { x: k.tensor([8, 1]), ids: k.tensor([1], "i64") }).eval({ x: f32([8, 1]), ids: ids64([1], [-1]) }).out.data), [0.5]);
// an out-of-range index is an error in the reference, as PyTorch's device assert is
assert.throws(() => k.trace("o", ({ x, ids }) => ({ out: N.embedding(ids, x) }), { x: k.tensor([3, 2]), ids: k.tensor([1], "i64") }).eval({ x: f32([3, 2]), ids: ids64([1], [3]) }), /out of range/);
// indices must be int64
assert.throws(() => k.trace("t", ({ x, ids }) => ({ out: N.embedding(ids, x) }), { x: k.tensor([3, 2]), ids: k.tensor([1]) }), /gather indices must be int64/);
console.log("gathers fuse, evaluate like the frontend reference (with wrapping) and read int64 indices in CUDA");
