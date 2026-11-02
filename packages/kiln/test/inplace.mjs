// Direct writes of mutated inputs (KILN-009): the launch-order and same-index proofs, the rewrite of the exported
// program, and a CPU oracle that runs the exported kernels with real buffer aliasing.
import { k } from "../src/core/kiln.js";
import * as IX from "../src/core/ix.js";
import { Tensor, rng } from "../src/core/util.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { toCuda } from "../src/std/emit.js";
import { exportProgram, loopIrOf } from "../src/std/export.js";
import { planMutation, sameIndexSlots, retargetProducer, compactBuffers } from "../src/std/inplace.js";
import { simulateProgram } from "../src/std/program-sim.js";
import { SPECS, target } from "../src/std/targets.js";

const pipe = pipeline({ target: target(SPECS.rtx5090) });
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const a100 = pipeline({ target: target(SPECS.a100) });
const build = (fn, inputs, p = pipe) => { const g = k.trace("m", fn, inputs), r = p.run(g); return { g, r, prog: programOf(r.graph) }; };
const exp = ({ r, prog }, opts) => exportProgram(r, prog, opts);
const values = (n, seed) => { const f = rng(seed); return Float32Array.from({ length: n }, () => f() * 2 - 1); };
const close = (a, b) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= 1e-5 + 1e-4 * Math.abs(b[i]));

// the four measured cases of the guide (Section 4.6)
const CASES = {
  "relu_ then mean": { fn: ({ x }) => ({ y: N.mean(N.relu(x), -1), __mut0: N.relu(x) }), inputs: { x: k.tensor([4, 8]) }, want: "direct" },
  "x += y; out = 2x": { fn: ({ x, y }) => { const s = N.add(x, y); return { out: N.mul(s, 2), __mut0: s }; }, inputs: { x: k.tensor([4, 8]), y: k.tensor([4, 8]) }, want: "direct" },
  "x += y; out = softmax(x)": { fn: ({ x, y }) => { const s = N.add(x, y); return { out: N.softmax(s), __mut0: s }; }, inputs: { x: k.tensor([4, 8]), y: k.tensor([4, 8]) }, want: "direct" },
  "x <- x - mean(x)": { fn: ({ x }) => ({ __mut0: N.sub(x, N.mean(x, -1, true)) }), inputs: { x: k.tensor([4, 8]) }, want: "writeback", reason: /producer 0: a load from slot 0 reads index 8 \* \(e \/ 8\) \+ r0/ },
  "x += y over 3x224x224 (multi-block)": { fn: ({ x, y }) => { const s = N.add(x, y); return { out: N.mul(s, 2), __mut0: s }; }, inputs: { x: k.tensor([3, 224, 224]), y: k.tensor([3, 224, 224]) }, want: "direct" },
  // KILN-005 family 57/111 shape: x += a row reduction; every thread loads x[row], a barrier, thread 0 stores it
  "x += a @ w (row kernel, barrier rule)": { fn: ({ x, a, w }) => { const s = N.add(x, N.matmul(a, w)); return { out: N.mul(s, 2), __mut0: s }; }, inputs: { x: k.tensor([64, 1]), a: k.tensor([64, 64]), w: k.tensor([64, 1]) }, want: "direct", row: /MAP=row/ },
  "x += sum(a * w) (staged row kernel)": { fn: ({ x, a, w }) => { const s = N.add(x, N.sum(N.mul(a, w), -1, true)); return { out: N.mul(s, 2), __mut0: s }; }, inputs: { x: k.tensor([64, 1]), a: k.tensor([64, 64]), w: k.tensor([64, 64]) }, want: "direct", row: /MAP=row/ },
  // KILN-005 family 49 shape on a100: a coarsened relu_ (a loop of 4 elements per thread)
  "relu_ coarsened (a100, loop rule)": { fn: ({ x }) => ({ y: N.mul(N.relu(x), 2), __mut0: N.relu(x) }), inputs: { x: k.tensor([24, 256, 20, 20]) }, want: "direct", pipe: a100, row: /COARSEN=/ },
};

for (const [label, c] of Object.entries(CASES)) {
  const b = build(c.fn, c.inputs, c.pipe);
  const auto = exp(b, { mutations: { __mut0: "x" } }), wb = exp(b, { mutations: { __mut0: "x" }, mutationStrategy: "writeback" });
  const m = auto.mutations[0], x = auto.inputs.find((i) => i.name === "x");
  check(m.strategy === c.want && (!c.reason || c.reason.test(m.reason)), `${label}: ${m.strategy}${m.reason ? ` (${m.reason})` : ""}`);
  check(auto.outputs.find((o) => o.name === "__mut0").buffer === x.buffer, `${label}: the mutated output is the input's buffer`);
  check(wb.mutations[0].strategy === "writeback" && wb.mutations[0].planned === c.want && /k_writeback__/.test(wb.kernels.at(-1).name), `${label}: the forced write-back strategy keeps the copy kernel and records the plan`);
  if (c.want === "direct") {
    const p = auto.kernels.find((kn) => kn.inPlace);
    check(!auto.kernels.some((kn) => /k_writeback__/.test(kn.name)) && auto.kernels.length === wb.kernels.length - 1, `${label}: one launch fewer (${auto.kernels.length} vs ${wb.kernels.length})`);
    check(p && p.writes === x.buffer && p.name === m.producer && p.wgsl === null && /CUDA only/.test(p.wgslUnavailable), `${label}: the producer writes the input and is CUDA-only`);
    check(auto.buffers.length === wb.buffers.length - 1 && auto.buffers.every((bf, i) => bf.id === i), `${label}: the value's scratch buffer is gone and ids stay dense (${auto.buffers.length} buffers)`);
    const used = new Set([...auto.inputs, ...auto.outputs].map((t) => t.buffer).concat(auto.kernels.flatMap((kn) => [...kn.reads, kn.writes])));
    check(auto.buffers.every((bf) => used.has(bf.id)), `${label}: every buffer is referenced`);
    const sig = p.cuda.match(/\(([^)]*)\) \{/)[1];
    const aliasedSlots = p.inPlace.slots;
    const params = sig.split(", ");
    const restrictOk = params.every((q, j) => (j === params.length - 1 ? (aliasedSlots.length ? !/__restrict__/.test(q) : /__restrict__/.test(q)) : aliasedSlots.includes(j) ? !/__restrict__|const/.test(q) : /const .*__restrict__/.test(q)));
    check(restrictOk && new RegExp(`void __launch_bounds__\\(\\d+\\) ${p.name}\\(`).test(p.cuda), `${label}: in-place CUDA signature (${sig})`);
    check(p.identity !== p.inPlace.of, `${label}: the in-place variant has its own identity`);
    if (c.row) check(c.row.test(p.row), `${label}: the producer is ${p.row}`);
  }
  // the oracle: both strategies, with aliasing, against the frontend graph
  const feed = Object.fromEntries(Object.entries(c.inputs).map(([n, t], j) => [n, values(t.shape.reduce((a, d) => a * d, 1), 11 + j)]));
  const want = b.g.eval(Object.fromEntries(Object.entries(c.inputs).map(([n, t]) => [n, new Tensor(t.shape, feed[n])])));
  for (const [arm, p] of [["auto", auto], ["writeback", wb]]) {
    const sim = simulateProgram(p, feed, { instrument: true });
    const outsOk = Object.keys(want).filter((n) => n !== "__mut0").every((n) => close(sim.outputs[n], want[n].data));
    check(outsOk && close(sim.inputs.x, want.__mut0.data) && sim.hazards.length === 0, `${label} [${arm}]: oracle outputs and final x match the graph, no aliasing hazard${sim.hazards.length ? `: ${sim.hazards[0].message}` : ""}`);
  }
}

// the oracle's hazard check sees the in-kernel race that lockstep simulation hides (guide Section 4.7)
{
  const b = build(CASES["x <- x - mean(x)"].fn, CASES["x <- x - mean(x)"].inputs);
  const p = exp(b);
  const irs = p.kernels.map(loopIrOf), o = p.outputs.find((t) => t.name === "__mut0"), x = p.inputs[0];
  retargetProducer({ kernels: p.kernels, irs }, { producer: 0, slots: [0] }, o, x, { emitCuda: (K, alias) => toCuda(K, { alias }), entryOf: (K) => K.name, rename: (s) => s });
  compactBuffers(p);
  const sim = simulateProgram(p, { x: values(32, 5) }, { instrument: true });
  check(sim.hazards.length > 0 && /reads element/.test(sim.hazards[0].message), `a forced in-place mean-subtract is flagged: ${sim.hazards[0]?.message}`);
}

// launch-order refusals over synthetic kernel lists
{
  const K = build(CASES["x += y; out = 2x"].fn, CASES["x += y; out = 2x"].inputs).prog.kernels[0].K;
  const base = () => ({
    inputs: [{ name: "x", buffer: 0 }, { name: "y", buffer: 1 }],
    buffers: [{ id: 0 }, { id: 1 }, { id: 2 }, { id: 3 }],
    kernels: [{ name: "p", reads: [0, 1], writes: 2 }, { name: "c", reads: [2], writes: 3 }],
    irs: [K, K], outputs: [{ name: "out", buffer: 3 }, { name: "__mut0", buffer: 2 }],
  });
  const plan = (f) => { const r = base(); f(r); return planMutation(r, { outName: "__mut0", inName: "x" }); };
  check(plan(() => {}).strategy === "direct", "synthetic: producer then consumer of the value goes direct");
  check(/kernel 1 \(c\) reads x after producer 0/.test(plan((r) => { r.kernels[1].reads = [2, 0]; }).reason), "synthetic: a later reader of x refuses");
  check(/already writes x/.test(plan((r) => { r.kernels.unshift({ name: "w", reads: [1], writes: 0 }); r.irs.unshift(K); }).reason), "synthetic: an earlier writer of x refuses");
  check(/output out also holds the value/.test(plan((r) => { r.outputs[0].buffer = 2; }).reason), "synthetic: another output on the value buffer refuses (Decision 7.6)");
  check(/the value is input y/.test(plan((r) => { r.outputs[1].buffer = 1; }).reason), "synthetic: a value that is another input refuses");
  check(/no Loop IR/.test(plan((r) => { r.irs[0] = null; }).reason), "synthetic: a producer without Loop IR refuses");
  check(/the value is already the input/.test(plan((r) => { r.outputs[1].buffer = 0; }).reason), "synthetic: a value already in the input is left alone");
}

// same-index refusals over hand-written Loop IR
{
  const e = IX.V("e"), r = IX.V("r");
  const ld = (buf, idx) => ({ s: "load", n: "in" + buf, buf, idx }), st = (idx) => ({ s: "store", buf: "out", idx, e: { k: "var", n: "in0" } });
  // one block of 8 threads over 8 elements, e = tid
  const K = (body, extra = {}) => ({ body: [{ s: "iset", n: "e", e: IX.V("tid") }, ...body], params: [{ role: "in", size: 8 }, { role: "in", size: 8 }, { role: "out", size: 8 }], grid: 1, block: 8, ints: ["e"], ...extra });
  check(sameIndexSlots(K([ld(0, e), st(e)]), [0]).ok, "same index: load then store of element e");
  check(sameIndexSlots(K([ld(0, IX.C(0).add(e)), st(e.add(0))]), [0]).ok, "same index: equal after normalization");
  check(/reads index/.test(sameIndexSlots(K([ld(0, e.add(1)), st(e)]), [0]).reason), "same index: a neighbour load refuses");
  check(/follows the store/.test(sameIndexSlots(K([st(e), ld(0, e)]), [0]).reason), "same index: a load after the store refuses");
  check(/2 stores/.test(sameIndexSlots(K([ld(0, e), st(e), st(e.add(1))]), [0]).reason), "same index: two stores refuse");
  check(/stored twice/.test(sameIndexSlots(K([{ s: "for", v: "r", from: IX.C(0), to: IX.C(4), step: IX.C(1), body: [ld(0, e), st(e)] }]), [0]).reason), "same index: a loop that rewrites the element it read refuses");
  check(/depends on more than the block/.test(sameIndexSlots(K([ld(0, e), { s: "if", c: e.lt(4), body: [st(e)] }]), [0]).reason), "same index: a per-thread load outside the store's branch refuses");
  check(/different loop or branch/.test(sameIndexSlots(K([{ s: "if", c: e.lt(4), body: [ld(0, e)] }, { s: "if", c: e.lt(4), body: [st(e)] }]), [0]).reason), "same index: a load in a sibling branch refuses");
  // row kernels: every thread reads the block's element, a barrier, then thread 0 stores it (KILN-005 families 57, 111)
  const b = IX.V("bid"), tid = IX.V("tid"), rowK = (body) => ({ body, params: [{ role: "in", size: 4 }, { role: "out", size: 4 }], grid: 4, block: 8, ints: [] });
  check(sameIndexSlots(rowK([ld(0, b), { s: "sync" }, { s: "if", c: tid.eq(0), body: [st(b)] }]), [0]).ok, "barrier: a block-indexed load, a barrier, then one thread's store");
  check(/no barrier/.test(sameIndexSlots(rowK([ld(0, b), { s: "if", c: tid.eq(0), body: [st(b)] }]), [0]).reason), "barrier: without the barrier it refuses");
  check(/stored twice/.test(sameIndexSlots(rowK([ld(0, b), { s: "sync" }, st(b)]), [0]).reason), "barrier: every thread storing the block's element refuses");
  check(/stored twice/.test(sameIndexSlots(rowK([ld(0, b), st(b)]), [0]).reason), "same list: every thread of a block loading and storing one element refuses");
  // coarsened thread kernels: e = 16 * bid + 8 * j + tid inside a loop over j (COARSEN=2)
  const j = IX.V("j"), coarse = (eOf, n) => ({ body: [{ s: "for", v: "j", from: IX.C(0), to: IX.C(2), step: IX.C(1), body: [{ s: "iset", n: "e", e: eOf }, { s: "if", c: e.lt(n), body: [ld(0, e), st(e)] }] }], params: [{ role: "in", size: n }, { role: "out", size: n }], grid: 2, block: 8, ints: ["e"] });
  check(sameIndexSlots(coarse(b.mul(16).add(j.mul(8)).add(tid), 32), [0]).ok, "loop: a coarsened elementwise kernel with distinct addresses");
  check(/stored twice/.test(sameIndexSlots(coarse(b.mul(16).add(tid), 32), [0]).reason), "loop: a loop that stores one element on every iteration refuses");
  check(/more than 10/.test(sameIndexSlots(coarse(b.mul(16).add(j.mul(8)).add(tid), 32), [0], { limit: 10 }).reason), "loop: past the enumeration limit it refuses");
  check(/outside \[0, 16\)/.test(sameIndexSlots({ ...coarse(b.mul(16).add(j.mul(8)).add(tid), 32), params: [{ role: "in", size: 16 }, { role: "out", size: 16 }] }, [0]).reason), "loop: an address outside the buffer refuses");
  check(/reassigned/.test(sameIndexSlots(K([ld(0, e), { s: "iset", n: "e", e: e.add(1) }, st(e)]), [0]).reason), "same index: reassigning the index between load and store refuses");
  check(/gather/.test(sameIndexSlots(K([ld(1, IX.LD(0, [e])), ld(0, e), st(e)]), [0]).reason), "same index: a gather through the mutated input refuses");
  check(sameIndexSlots(K([ld(1, r), ld(0, e), st(e)]), [0]).ok, "same index: loads from unaliased slots are unconstrained");
}

// toCuda without aliases is byte-identical to the measured source
{
  const kernels = [...Object.values(CASES).flatMap((c) => build(c.fn, c.inputs).prog.kernels),
    ...build(({ q, kk, v }) => N.matmul(N.softmax(N.mul(N.matmul(q, N.transpose(kk)), 0.125)), v), { q: k.tensor([2, 32, 16]), kk: k.tensor([2, 32, 16]), v: k.tensor([2, 32, 16]) }).prog.kernels];
  check(kernels.every((kn) => toCuda(kn.K, { alias: [] }) === toCuda(kn.K) && toCuda(kn.K) === kn.cuda), `toCuda(K, { alias: [] }) equals toCuda(K) over ${kernels.length} kernels`);
}

// two mutations, each with its own producer
{
  const b = build(({ x, y }) => ({ out: N.add(N.relu(x), N.relu(y)), __mut0: N.relu(x), __mut1: N.relu(y) }), { x: k.tensor([16]), y: k.tensor([16]) });
  const p = exp(b, { mutations: { __mut0: "x", __mut1: "y" } });
  check(p.mutations.length === 2, `two mutations: ${p.mutations.map((m) => `${m.output}:${m.strategy}${m.reason ? ` (${m.reason})` : ""}`).join(", ")}`);
  const feed = { x: values(16, 1), y: values(16, 2) };
  const want = b.g.eval({ x: new Tensor([16], feed.x), y: new Tensor([16], feed.y) });
  const sim = simulateProgram(p, feed, { instrument: true });
  check(close(sim.outputs.out, want.out.data) && close(sim.inputs.x, want.__mut0.data) && close(sim.inputs.y, want.__mut1.data) && !sim.hazards.length, "two mutations: the oracle matches the graph");
}

// an output that is the input's own value (an imported clone: an identity reshape) keeps the value from before the
// mutation, under both strategies
{
  const b = build(({ x }) => ({ saved: N.reshape(x, [2]), __mut0: N.add(x, 1) }), { x: k.tensor([2]) });
  for (const s of ["auto", "writeback"]) {
    const p = exp(b, { mutations: { __mut0: "x" }, mutationStrategy: s });
    const sim = simulateProgram(p, { x: Float32Array.from([3, 4]) }, { instrument: true });
    check(close(sim.outputs.saved, [3, 4]) && close(sim.inputs.x, [4, 5]) && /k_snapshot__/.test(p.kernels[0].name) && sim.hazards.length === 0,
      `a clone of a mutated input keeps its snapshot [${s}]: saved ${[...sim.outputs.saved]}, x ${[...sim.inputs.x]}`);
  }
}

// an unknown strategy is refused
{
  let msg = null;
  try { exp(build(CASES["x += y; out = 2x"].fn, CASES["x += y; out = 2x"].inputs), { mutations: { __mut0: "x" }, mutationStrategy: "fast" }); } catch (e) { msg = e.message; }
  check(/mutation strategy fast/.test(msg || ""), `an unknown mutation strategy is refused: ${msg}`);
}

if (failed) { console.log(`${failed} failed`); process.exitCode = 1; }
