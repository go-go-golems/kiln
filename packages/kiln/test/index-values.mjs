// KILN-010: index values. E.ix is a Loop IR leaf whose value is an index expression at the current
// coordinates; tensor.ixval is the Tensor IR tensor of such values; nn.arange and N.indexValue build
// them. Every stage must carry the expression (hash-consing, substitution, fusion renaming, scheduling,
// the serial references, Kernel IR, CUDA and the SIMT simulator), so each is checked here, and integer
// kernels are checked by the simulator exactly.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import * as IX from "../src/core/ix.js";
import { Tensor } from "../src/core/util.js";
import { N } from "../src/std/tensor.js";
import { E, substE, schedule, printNest, freshR, runSerial, free } from "../src/std/loop.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf, simulateKernel } from "../src/std/program.js";
import { SPECS, target } from "../src/std/targets.js";

const hw = target(SPECS.a100);
const pipe = pipeline({ target: hw });

// ---------------------------------------------------------------- Loop IR invariants
{
  const r1 = freshR(), r2 = freshR();
  const a = E.red("add_i64", r1, 4, E.ix(IX.V(r1)));
  const b = E.red("add_i64", r2, 4, E.ix(IX.V(r2)));
  assert.equal(a, b, "α-equivalent reductions over an index value are one value");
  assert.notEqual(E.ix(IX.V("a0"), "i64"), E.ix(IX.V("a0"), "i32"), "the dtype is part of the key");
  assert.deepEqual([...free(E.ix(IX.V("a0").add(IX.V("a1"))))].sort(), ["a0", "a1"]);
  // substitution renames inside the index value
  const s = substE(E.ix(IX.V("a0").mul(2)), { a0: IX.V("a1").add(1) });
  assert.equal(IX.print(s.e), "2 * a1 + 2");
  // a bool index value must be a predicate
  assert.throws(() => E.ix(IX.V("a0"), "bool"), /predicate/);
  assert.throws(() => E.ix(IX.V("a0"), "f32"), /dtype/);
  // schedule names index values x0, x1 … and emits them as lets
  const x = E.op("add_i64", E.ix(IX.V("a1")), E.ix(IX.V("a0").mul(4)));
  const nest = printNest(schedule(x, [3, 4]));
  assert.match(nest, /x0 = ix a1 : i64/);
  assert.match(nest, /x1 = ix 4 \* a0 : i64/);
  // the reference evaluates it exactly (BigInt for int64)
  assert.deepEqual([...runSerial(x, [3, 4], [], "i64").data], Array.from({ length: 12 }, (_, i) => BigInt(i % 4 + 4 * Math.floor(i / 4))));
  // the int32 range check names the expression
  assert.throws(() => schedule(E.ix(IX.V("a0").mul(2 ** 30)), [8]), /outside int32/);
}

// ---------------------------------------------------------------- end to end
const run = (name, fn, types, params = {}) => {
  const g = k.trace(name, fn, types);
  const r = pipe.run(g, { params });
  assert.ok(r.ok, `${name}: ${r.error?.message}`);
  return { g, r, prog: programOf(r.graph) };
};
const f32 = (shape) => new Tensor(shape, Float32Array.from({ length: shape.reduce((a, b) => a * b, 1) }, (_, i) => (i % 7) * 0.5 - 1.5));
const same = (got, want, name) => assert.deepEqual([...got.data], [...want.data], name);

// x + arange(4): one fused kernel, one load, no index table
{
  const { g, r, prog } = run("x + arange", ({ x }) => ({ out: N.add(x, N.arange(0, 4)) }), { x: k.tensor([3, 4]) });
  const x = f32([3, 4]);
  const want = g.eval({ x }).out;
  same(r.at("loop").eval({ x }).out, want, "fused Loop IR reference");
  assert.equal(prog.kernels.length, 1);
  assert.equal(prog.kernels[0].inShapes.length, 1, "the arange needs no buffer");
  assert.match(prog.kernels[0].cuda, /long long x0 = 0/);
  assert.match(prog.kernels[0].cuda, /x0 = \(\(long long\)\(/);
  assert.match(prog.kernels[0].wgslUnavailable, /index values/);
  for (const kn of prog.kernels) assert.ok(simulateKernel(kn, hw).check.ok, "simulator agrees");
}
// an integer output: arange reshaped, plus an int, with a step and an offset; checked exactly
{
  const { g, r, prog } = run("arange int", () => ({ out: N.add(N.reshape(N.arange(5, 29, 2), [3, 4]), N.int(-7)) }), {});
  const want = g.eval({}).out;
  assert.equal(want.dtype, "i64");
  assert.deepEqual([...want.data].slice(0, 3), [-2n, 0n, 2n]);
  same(r.at("loop").eval({}).out, want, "fused reference");
  assert.equal(prog.kernels.length, 1);
  assert.equal(prog.kernels[0].inShapes.length, 0, "a zero-input kernel");
  const sim = simulateKernel(prog.kernels[0], hw);
  assert.ok(sim.check.ok, sim.check.message);
  assert.equal(sim.check.message, "integer values equal");
}
// negative dividends: floor division and modulo of i - j by 3 in every spelling
{
  const fn = () => ({ q: N.indexValue([5, 5], ([i, j]) => i.sub(j).div(3)), m: N.indexValue([5, 5], ([i, j]) => i.sub(j).mod(3), "i32") });
  const { g, r, prog } = run("floor", fn, {});
  const want = g.eval({});
  assert.equal(want.q.data[1], -1n, "floor((0 - 1) / 3) = -1");
  assert.equal(want.m.data[1], 2, "(0 - 1) mod 3 = 2");
  for (const name of ["q", "m"]) same(r.at("loop").eval({})[name], want[name], name);
  for (const kn of prog.kernels) {
    assert.match(kn.cuda, /% 3\) \+ 3\) % 3\)/, "CUDA spells floor semantics for a possibly negative dividend");
    const sim = simulateKernel(kn, hw);
    assert.ok(sim.check.ok, `${kn.name}: ${sim.check.message}`);
  }
}
// an address keeps the truncating spelling: a nonnegative dividend is unaffected by `signed`
assert.equal(IX.emit(IX.V("a0").div(3), "c", (v) => v, null, true), "(a0 / 3)");
assert.equal(IX.emit(IX.V("a0").sub(IX.V("a1")).div(3), "c"), "((a0 + ((-1) * a1)) / 3)");

// an index value inside a reduction body, under MAP=thread and MAP=row: Σ_j x[i, j] · j
for (const MAP of ["thread", "row"]) {
  const { g, r, prog } = run(`weighted ${MAP}`, ({ x }) => ({ out: N.sum(N.mul(x, N.arange(0, 33)), -1) }), { x: k.tensor([4, 33]) }, { MAP });
  const x = f32([4, 33]);
  const want = g.eval({ x }).out;
  const got = r.at("loop").eval({ x }).out;
  got.data.forEach((v, i) => assert.ok(Math.abs(v - want.data[i]) < 1e-3, `${MAP}: ${v} vs ${want.data[i]}`));
  assert.ok(prog.kernels.some((kn) => kn.map.MAP === MAP), `${MAP} exercised`);
  for (const kn of prog.kernels) { const sim = simulateKernel(kn, hw); assert.ok(sim.check.ok, `${MAP} ${kn.name}: ${sim.check.message}`); }
}
// an integer row reduction (MAP=row tree combine over int64): Σ_j (i·j) per row, in its own s_red_i64
{
  const { g, r, prog } = run("int row sum", () => ({ out: N.sum(N.indexValue([3, 40], ([i, j]) => i.mul(j)), -1) }), {}, { MAP: "row" });
  same(r.at("loop").eval({}).out, g.eval({}).out, "int row sum reference");
  const kn = prog.kernels.find((x) => x.map.MAP === "row");
  assert.ok(kn, "row map exercised");
  assert.match(kn.cuda, /__shared__ long long s_red_i64\[/);
  const sim = simulateKernel(kn, hw);
  assert.ok(sim.check.ok, sim.check.message);
}
// an index value in the epilogue of a tiled contraction: (x @ w) + j
{
  const { g, r, prog } = run("tiled epilogue", ({ x, w }) => ({ out: N.add(N.matmul(x, w), N.arange(0, 16)) }), { x: k.tensor([16, 8]), w: k.tensor([8, 16]) }, { MAP: "tiled" });
  const x = f32([16, 8]), w = f32([8, 16]);
  const want = g.eval({ x, w }).out, got = r.at("loop").eval({ x, w }).out;
  got.data.forEach((v, i) => assert.ok(Math.abs(v - want.data[i]) < 1e-3));
  const kn = prog.kernels.find((x) => x.map.MAP === "tiled");
  assert.ok(kn, "tiled map exercised");
  const sim = simulateKernel(kn, hw);
  assert.ok(sim.check.ok, sim.check.message);
}
// view folding: meshgrid-like broadcast views of aranges collapse into one index expression
{
  const fn = () => {
    const g = N.arange(0, 3);
    const h = N.expand(N.reshape(g, [3, 1]), [3, 3]), w = N.expand(N.reshape(g, [1, 3]), [3, 3]);
    return { out: N.sub(N.reshape(N.concat([N.reshape(h, [1, 9]), N.reshape(w, [1, 9])], 0), [18]), N.int(1)) };
  };
  const { g, r, prog } = run("grid", fn, {});
  const want = g.eval({}).out;
  assert.deepEqual([...want.data], [0, 0, 0, 1, 1, 1, 2, 2, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2].map((v) => BigInt(v - 1)));
  same(r.at("loop").eval({}).out, want, "integer concat of index tensors");
  assert.equal(prog.kernels.length, 1);
  assert.equal(prog.kernels[0].inShapes.length, 0, "no buffers: every view folded into index values");
  assert.ok(simulateKernel(prog.kernels[0], hw).check.ok);
}
// cumsum needs no mask table any more
{
  const { g, r, prog } = run("cumsum", ({ x }) => ({ out: N.cumsum(x, -1) }), { x: k.tensor([2, 5]) });
  const x = f32([2, 5]);
  const want = g.eval({ x }).out, got = r.at("loop").eval({ x }).out;
  got.data.forEach((v, i) => assert.ok(Math.abs(v - want.data[i]) < 1e-5));
  assert.equal(prog.kernels.length, 1);
  assert.equal(prog.kernels[0].inShapes.length, 1, "only x: the [1, 0] table is gone");
  assert.ok(simulateKernel(prog.kernels[0], hw).check.ok);
}
// typed splats keep their dtype through view and arithmetic folding
{
  const { r } = run("typed zeros", () => ({ out: N.add(N.reshape(N.zeros([2, 3], "i64"), [6]), N.int(3)) }), {});
  const out = r.at("loop").eval({}).out;
  assert.equal(out.dtype, "i64");
  assert.deepEqual([...out.data], Array(6).fill(3n));
  assert.deepEqual([...k.trace("full", () => ({ out: N.full([2], 2.7, "i32") }), {}).eval({}).out.data], [2, 2], "full converts its value as PyTorch's fill does");
}
// argmax/argmin: first-index ties, NaN rows (first NaN), all-equal rows, keepdim; thread and row maps
{
  const rowsF = [[1, 3, 3, 0], [NaN, 2, NaN, 5], [5, 2, NaN, 5], [2, 2, 2, 2]];
  const x = new Tensor([4, 4], Float32Array.from(rowsF.flat()));
  for (const MAP of ["thread", "row"]) {
    const { g, r, prog } = run(`argmax ${MAP}`, ({ x }) => ({ mx: N.argmax(x, -1), mn: N.argmin(x, 1, true), c0: N.argmax(x, 0) }), { x: k.tensor([4, 4]) }, { MAP });
    const want = g.eval({ x });
    assert.deepEqual([...want.mx.data], [1n, 0n, 2n, 0n], "torch.max(x, -1).indices (scripts/05)");
    assert.deepEqual(want.mn.shape, [4, 1]);
    assert.deepEqual([...want.mn.data], [3n, 0n, 2n, 0n]);
    const got = r.at("loop").eval({ x });
    for (const name of ["mx", "mn", "c0"]) same(got[name], want[name], `${MAP} ${name}`);
    if (MAP === "row") assert.ok(prog.kernels.some((kn) => kn.map.MAP === "row" && /s_red_i64/.test(kn.cuda) && /s_red\[/.test(kn.cuda)), "an f32 and an int64 row combine in one kernel");
    for (const kn of prog.kernels) { const sim = simulateKernel(kn, hw); assert.ok(sim.check.ok, `${MAP} ${kn.name}: ${sim.check.message}`); }
  }
  // integer argmax (no NaN term)
  const xi = new Tensor([2, 3], BigInt64Array.from([3n, 9n, 9n, -1n, -5n, -1n]));
  const { g, r } = run("argmax int", ({ x }) => ({ out: N.argmax(x, -1) }), { x: k.tensor([2, 3], "i64") });
  assert.deepEqual([...g.eval({ x: xi }).out.data], [1n, 0n]);
  same(r.at("loop").eval({ x: xi }).out, g.eval({ x: xi }).out, "integer argmax");
}
// causal mask: j <= i, top-left aligned
assert.deepEqual([...k.trace("cm", () => ({ m: N.causalMask(2, 3) }), {}).eval({}).m.data], [1, 0, 0, 1, 1, 0]);
console.log("index values: Loop IR invariants, fusion, schedules (thread/row/tiled), floor spellings, integer simulation, factories");
