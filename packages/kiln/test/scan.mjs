// KILN-008: cumsum as a scan primitive. tensor.scan and its reference; E.scan, the carried accumulator the
// scheduler makes of it, and the point reference that evaluates it by definition; fusion legality; the two
// scan mappings (one thread per row, one block per row with a Hillis-Steele chunk scan), their cost-model
// ranking, and their Kernel IR in the SIMT simulator. Integer Kernel IR is checked through the Loop IR
// evaluators here: the simulator's integer support belongs to KILN-010.
import assert from "node:assert/strict";
import { k, KilnError } from "../src/core/kiln.js";
import { N, T, tensor } from "../src/std/tensor.js";
import { Tensor, numel, strides } from "../src/core/util.js";
import * as IX from "../src/core/ix.js";
import { E, schedule, printNest, compileSerial, compilePoint, runSerial } from "../src/std/loop.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf, simulateKernel, simulateFull, kernelInputs } from "../src/std/program.js";
import { SPECS, target } from "../src/std/targets.js";
import { analyze, estimate, legalMaps, predictedCost } from "../src/std/tile.js";
import { typedReducer } from "../src/std/fns.js";

const t = target(SPECS.a100);
const pipe = pipeline({ target: t });
const compile = (g, params) => { const r = pipe.run(g, params ? { params } : undefined); assert.ok(!r.error, r.error?.message); return r; };
const cumsumGraph = (shape, axis, dtype = "f32") => k.trace("cs", ({ x }) => ({ out: N.cumsum(x, axis) }), { x: k.tensor(shape, dtype) });
const scanKernel = (r) => programOf(r.graph).kernels.find((x) => schedule(x.expr, x.shape).scanV);

// ---------------------------------------------------------------- tensor.scan and its reference
{
  const x = new Tensor([2, 3], Float32Array.of(1, 2, 3, 4, -5, 6));
  const ev = (fn, axis) => [...k.trace("s", ({ x }) => ({ o: tensor.scan(x, { fn, axis }) }), { x: k.tensor([2, 3]) }).eval({ x }).o.data];
  assert.deepEqual(ev("add", 1), [1, 3, 6, 4, -1, 5]);
  assert.deepEqual(ev("add", 0), [1, 2, 3, 5, -3, 9]);
  assert.deepEqual(ev("mul", 1), [1, 2, 6, 4, -20, -120]);
  assert.deepEqual(ev("max", 1), [1, 2, 3, 4, 4, 6]);
  assert.deepEqual(ev("min", 1), [1, 1, 1, 4, -5, -5]);
  // the frontend: integers (bool included) widen to int64, exact past 2^53 and wrapping at 2^63
  const big = new Tensor([1, 3], BigInt64Array.of(2n ** 62n, 2n ** 62n, 5n));
  assert.deepEqual([...cumsumGraph([1, 3], -1, "i64").eval({ x: big }).out.data], [2n ** 62n, -(2n ** 63n), -(2n ** 63n) + 5n]);
  const b = new Tensor([1, 4], Uint8Array.of(1, 0, 1, 1), "bool");
  const gb = cumsumGraph([1, 4], -1, "bool");
  assert.equal(gb.nodes.get(gb.outputs[0].id).type.dtype, "i64");
  assert.deepEqual([...gb.eval({ x: b }).out.data], [1n, 1n, 2n, 3n]);
}

// ---------------------------------------------------------------- Loop IR: the scheduled nest
{
  const r = compile(cumsumGraph([2, 4], -1));
  const kern = [...r.at("loop").nodes.values()].find((n) => n.name === "loop.kernel");
  assert.equal(printNest(schedule(kern.attrs.expr, kern.attrs.shape), () => "x"), [
    "for a0 in 0..2:  # free",
    "    acc0 = 0",
    "    for a1 in 0..4:  # scan",
    "        in0 = load x[a0, a1]",
    "        acc0 <~ add(acc0, in0)",
    "        out[a0, a1] = acc0",
  ].join("\n"), "init above the scan loop, one load and one step per position");
  assert.equal(kern.attrs.name, "k_cumsum_scan");
  // a scan over a non-last axis: the scanned coordinate becomes the innermost loop
  const r0 = compile(cumsumGraph([3, 5, 2], 0));
  const k0 = [...r0.at("loop").nodes.values()].find((n) => n.name === "loop.kernel");
  const s0 = schedule(k0.attrs.expr, k0.attrs.shape);
  assert.deepEqual(s0.dims.map((d) => d.v), ["a1", "a2", "a0"]);
  // a size-1 scanned axis is an ordinary one-element reduction
  const r1 = compile(cumsumGraph([4, 1], -1));
  const k1 = [...r1.at("loop").nodes.values()].find((n) => n.name === "loop.kernel");
  assert.equal(schedule(k1.attrs.expr, k1.attrs.shape).scanV, null);
}

// ---------------------------------------------------------------- Loop IR: serial, point and reference agree
{
  const rnd = (n, f) => Array.from({ length: n }, (_, i) => f(((i * 2654435761) >>> 0) / 2 ** 32, i));
  const cases = [[[2, 7], -1], [[3, 5, 4], 0], [[3, 5, 4], 1], [[3, 5, 4], 2], [[1, 300], -1], [[300, 1], 0]];
  for (const [shape, axis] of cases) for (const dtype of ["i64", "i32", "bool", "f32"]) {
    const g = cumsumGraph(shape, axis, dtype);
    const n = numel(shape);
    const data = dtype === "i64" ? BigInt64Array.from(rnd(n, (u, i) => BigInt(Math.floor(u * 2000) - 1000) * 2n ** 50n + BigInt(i)))
      : dtype === "i32" ? Int32Array.from(rnd(n, (u) => Math.floor(u * 2 ** 31) - 2 ** 30)) : dtype === "bool" ? Uint8Array.from(rnd(n, (u) => +(u > 0.5)))
      : Float32Array.from(rnd(n, (u) => u * 2 - 1));
    const x = new Tensor(shape, data, dtype);
    const want = g.eval({ x }).out.data;
    const r = compile(g);
    const got = r.at("loop").eval({ x }).out.data;
    // integers are exact in any order; the f32 Loop IR also runs left to right, as the reference does
    assert.deepEqual([...got], [...want], `${shape} axis ${axis} ${dtype}: Loop IR eval`);
    // the point reference evaluates the scan by its definition, independently of the carried accumulator
    const sk = [...r.at("loop").nodes.values()].find((m) => m.name === "loop.kernel" && schedule(m.attrs.expr, m.attrs.shape).scanV);
    if (sk.args.length === 1 && sk.args[0] === "x") {
      const sched = schedule(sk.attrs.expr, sk.attrs.shape), point = compilePoint(sched, [shape]);
      const serial = new (dtype === "f32" ? Float32Array : BigInt64Array)(n);
      compileSerial(sched, [shape])([data], serial);
      assert.deepEqual([...serial], [...want], `${shape} axis ${axis} ${dtype}: serial`);
      for (let e = 0; e < n; e++) assert.equal(dtype === "f32" ? Math.fround(point([data], e)) : BigInt(point([data], e)), serial[e], `${shape} axis ${axis} ${dtype}: point ${e}`);
    } else assert.equal(dtype, "bool", `${shape} ${dtype}: the scan reads the input directly`);
  }
}

// ---------------------------------------------------------------- scheduling restrictions
{
  const x = E.load(0, [IX.V("a0"), IX.V("q")]);
  const s1 = E.scan("add", "q", IX.V("a1"), 4, x);
  const s2 = E.scan("add", "q2", IX.V("a0"), 3, E.load(0, [IX.V("q2"), IX.V("a1")]));
  const err = (f, re) => assert.throws(f, (e) => e instanceof KilnError && e.kind === "ScheduleError" && re.test(e.message));
  err(() => schedule(E.op("add", s1, s2), [3, 4]), /scans one coordinate/);
  err(() => schedule(E.red("add", "r9", 4, E.scan("add", "q3", IX.V("r9"), 4, E.load(0, [IX.V("a0"), IX.V("q3")]))), [3, 1]), /inside a reduction/);
  err(() => schedule(E.scan("add", "q4", IX.V("a1"), 4, E.op("mul", E.load(0, [IX.V("a0"), IX.V("q4")]), E.load(0, [IX.V("a0"), IX.V("a1")]))), [3, 4]), /other than through its position/);
  // two scans of one coordinate share one ordered loop
  const two = schedule(E.op("add", s1, E.scan("max", "q5", IX.V("a1"), 4, E.load(1, [IX.V("a0"), IX.V("q5")]))), [3, 4]);
  assert.equal(two.carries.length, 2);
  const a = new Tensor([3, 4], Float32Array.from({ length: 12 }, (_, i) => i % 5)), b = new Tensor([3, 4], Float32Array.from({ length: 12 }, (_, i) => (7 * i) % 4));
  const out = runSerial(E.op("add", s1, E.scan("max", "q5", IX.V("a1"), 4, E.load(1, [IX.V("a0"), IX.V("q5")]))), [3, 4], [a, b]).data;
  for (let i = 0; i < 3; i++) { let s = 0, m = -Infinity; for (let j = 0; j < 4; j++) { s += a.data[i * 4 + j]; m = Math.max(m, b.data[i * 4 + j]); assert.equal(out[i * 4 + j], s + m); } }
}

// ---------------------------------------------------------------- fusion legality
{
  const kernels = (g) => [...compile(g).at("loop").nodes.values()].filter((n) => n.name === "loop.kernel");
  const scans = (ks) => ks.filter((n) => schedule(n.attrs.expr, n.attrs.shape).scanV).length;
  // a producer into the body and an epilogue at the scan's own coordinate: one kernel
  const one = kernels(k.trace("f", ({ x }) => ({ o: N.add(N.cumsum(N.mul(x, x), -1), 1) }), { x: k.tensor([4, 64]) }));
  assert.equal(one.length, 1);
  // a reduction of the scan, a shifted read, and a reduction producer stay separate kernels
  const red = kernels(k.trace("f", ({ x }) => ({ o: N.amax(N.cumsum(x, -1), -1, false) }), { x: k.tensor([4, 64]) }));
  assert.equal(red.length, 2); assert.equal(scans(red), 1);
  const shifted = kernels(k.trace("f", ({ x }) => { const c = N.cumsum(x, -1); return { o: N.sub(N.slice(c, -1, 1, 64), N.slice(c, -1, 0, 63)) }; }, { x: k.tensor([4, 64]) }));
  assert.equal(scans(shifted), 1, "a shifted read keeps the scan a separate kernel");
  const normed = kernels(k.trace("f", ({ x }) => ({ o: N.cumsum(N.div(x, N.sum(x, -1)), -1) }), { x: k.tensor([4, 64]) }));
  assert.ok(normed.length >= 2 && normed.every((n) => !schedule(n.attrs.expr, n.attrs.shape).scanV || !schedule(n.attrs.expr, n.attrs.shape).reds.length), "no kernel holds a scan and a reduction");
  for (const [g, x] of [[k.trace("f", ({ x }) => { const c = N.cumsum(x, -1); return { o: N.sub(N.slice(c, -1, 1, 64), N.slice(c, -1, 0, 63)) }; }, { x: k.tensor([4, 64]) }), Tensor.fill([4, 64], (i) => (i % 7) - 3)]]) {
    assert.deepEqual([...compile(g).at("loop").eval({ x }).o.data], [...g.eval({ x }).o.data]);
  }
}

// The lockstep simulator runs every statement for all threads before the next, so it cannot see a missing
// barrier between a shared store and another thread's read of that slot. This structural check can: in the
// chunk loop (taken as a cycle, since the next chunk reuses the arrays), between two barriers, no slot one
// thread writes (s[tid]) is read by another thread (any index other than tid), in either order.
function sharedRaces(K) {
  const loop = K.body.find((s) => s.s === "for" && s.v === "c0");
  const flat = [];
  const walk = (ss) => { for (const s of ss) { if (s.s === "if") walk(s.body); else flat.push(s); } };
  walk(loop.body);
  const races = [];
  const own = (st) => IX.keyOf(st.idx) === IX.keyOf(IX.V("tid"));
  const seq = [...flat, ...flat];
  let since = [];
  for (const st of seq) {
    if (st.s === "sync") { since = []; continue; }
    if (st.s !== "sload" && st.s !== "sstore") continue;
    for (const o of since) if (o.arr === st.arr && (o.s === "sstore" || st.s === "sstore") && o.s !== st.s && !(own(o) && own(st))) races.push(`${o.s} ${o.arr}[${IX.print(o.idx)}] then ${st.s} ${st.arr}[${IX.print(st.idx)}]`);
    since.push(st);
  }
  return races;
}

// ---------------------------------------------------------------- the two mappings in the simulator
// f32 against an f64 reference, bounded by the mapping's combine depth: n for the serial loop, chunks + log2 T
// for the block scan; every simulated run also passes the sampled check (bounds, barriers in uniform code)
{
  const grid = [[[1, 1], -1], [[3, 31], -1], [[4, 256], -1], [[2, 257], -1], [[1, 32768], -1], [[4096, 16], -1], [[5, 300], 0], [[300, 5], 0], [[3, 40, 7], 1]];
  const eps = 2 ** -24, ran = [];
  for (const [shape, axis] of grid) for (const params of [{ MAP: "thread", TPB: 32 }, { MAP: "row", TPB: 32 }, { MAP: "row", TPB: 256 }, { MAP: "row", TPB: 512 }, { MAP: "row", TPB: 1024 }]) {
    const r = compile(cumsumGraph(shape, axis), params);
    const kern = scanKernel(r) ?? programOf(r.graph).kernels[0];           // [1, 1] has no scan: a one-term sum
    if (kern.map.MAP !== params.MAP || kern.map.TPB !== params.TPB) continue;                                // a TPB the fork does not offer here
    const ins = kernelInputs(kern, 1);
    const got = simulateFull(kern, ins);
    const ax = axis < 0 ? shape.length + axis : axis, n = shape[ax], st = strides(shape)[ax];
    const depth = kern.map.MAP === "row" ? Math.ceil(n / kern.map.TPB) + Math.log2(kern.map.TPB) + 1 : n;
    for (let e = 0; e < got.length; e++) {
      const i = Math.floor(e / st) % n;
      let ref = 0, mag = 0;
      for (let j = 0; j <= i; j++) { const v = ins[0][e - (i - j) * st]; ref += v; mag += Math.abs(v); }
      assert.ok(Math.abs(got[e] - ref) <= 2 * depth * eps * mag + 1e-30, `${shape} axis ${axis} ${kern.row} at ${e}: ${got[e]} vs ${ref} (bound ${2 * depth * eps * mag})`);
    }
    const s = simulateKernel(kern, t);
    assert.ok(s.check.ok, `${shape} axis ${axis} ${kern.row}: ${s.check.message}`);
    if (kern.map.MAP === "row" && schedule(kern.expr, kern.shape).scanV) assert.deepEqual(sharedRaces(kern.K), [], `${shape} ${kern.row}: shared-memory races`);
    ran.push(`${shape.join("x")}@${axis}:${kern.row}`);
  }
  if (process.env.KILN_SCAN_VERBOSE) console.log(ran.join("\n"));
  assert.ok(ran.length >= 17, `simulated ${ran.length} kernels`);
  // reducers other than add: max carries -inf as its identity through the block scan
  const gm = k.trace("m", ({ x }) => ({ o: tensor.scan(x, { fn: "max", axis: 1 }) }), { x: k.tensor([3, 100]) });
  const km = scanKernel(compile(gm, { MAP: "row", TPB: 64 }));
  assert.equal(km.map.MAP, "row");
  assert.match(km.cuda, /__int_as_float\(0xff800000\)/);
  assert.ok(simulateKernel(km, t).check.ok);
  // WGSL: the block scan is workgroup memory and barriers
  const kw = scanKernel(compile(cumsumGraph([2, 300], -1), { MAP: "row", TPB: 128 }));
  assert.match(kw.wgsl, /var<workgroup> s_scan0: array<f32, 128>/);
  assert.match(kw.wgsl, /workgroupBarrier\(\)/);
}

// ---------------------------------------------------------------- the cost model
{
  const option = (shape, axis) => { const kern = scanKernel(compile(cumsumGraph(shape, axis))); return { kern, an: analyze(kern.expr, kern.shape, kern.inShapes) }; };
  // many short rows along a non-last axis (adjacent rows are adjacent addresses): one thread per row
  assert.equal(option([16, 65536], 0).kern.map.MAP, "thread");
  // one long row: one block, not one thread walking 32768 positions
  const long = option([1, 32768], -1);
  assert.equal(long.kern.map.MAP, "row");
  assert.deepEqual(legalMaps(long.an), ["thread", "row"]);
  assert.ok(estimate(long.an, { MAP: "row", TPB: 1024, COARSEN: 1, STAGE: "none" }, t).us < estimate(long.an, { MAP: "thread", TPB: 32, COARSEN: 1, STAGE: "none" }, t).us);
  // linear work: far below the masked lowering's 200.93 us at 8x4096 (KILN-008 design guide, section 4.3)
  const mid = option([8, 4096], -1);
  assert.ok(estimate(mid.an, mid.kern.map, t).us < 20, `8x4096: ${estimate(mid.an, mid.kern.map, t).us}`);
  // the position-id program's predicted cost falls against the masked lowering of the same cumsum
  const masked = k.trace("masked", ({ x }) => {
    const [rows, n] = [8, 4096], wide = [rows, n, n];
    const spread = T.view(x, wide, (c) => [c[0], c[2]]);
    const mask = T.view(tensor.const({ data: new Tensor([2], Float32Array.of(1, 0)), shape: [2] }), wide, (c) => [c[1].sub(c[2]).lt(0)]);
    const sel = tensor.ew([mask, spread, T.bc(tensor.const({ value: 0, shape: [], dtype: "i64" }), wide)], { fn: "select", dtype: "i64" });
    return { out: T.squeeze(T.reduce(sel, typedReducer("add", "i64"), -1), -1) };
  }, { x: k.tensor([8, 4096], "i64") });
  const before = predictedCost(compile(masked).at("tile"), t), after = predictedCost(compile(cumsumGraph([8, 4096], -1, "i64")).at("tile"), t);
  assert.ok(after < before / 4, `predicted cost ${after} us against ${before} us for the masked lowering`);
}
console.log("scan: tensor.scan, E.scan carried loop, fusion legality, thread/row mappings, cost ranking");

// ---------------------------------------------------------------- the other cumulative ops (Phase 7, CPU)
{
  const g = k.trace("c", ({ x, y }) => ({ p: N.cumprod(x, 1), mx: N.cummax(y, 1), mn: N.cummin(x, 0), py: N.cumprod(y, 0) }), { x: k.tensor([2, 300], "i32"), y: k.tensor([300, 3]) });
  const dt = (name) => g.nodes.get(g.outputs.find((o) => o.name === name).id).type.dtype;
  assert.deepEqual(["p", "mx", "mn", "py"].map(dt), ["i64", "f32", "i32", "f32"], "products widen integers to int64; max and min keep the dtype");
  assert.throws(() => k.trace("b", ({ b }) => ({ o: N.cummax(b, 0) }), { b: k.tensor([3], "bool") }), /cummax over bool values is not lowered/);
  const x = new Tensor([2, 300], Int32Array.from({ length: 600 }, (_, i) => ((i * 37) % 7) - 3), "i32");
  const y = new Tensor([300, 3], Float32Array.from({ length: 900 }, (_, i) => ((i * 13) % 11) / 10 + 0.5));
  const r = compile(g), want = g.eval({ x, y }), got = r.at("loop").eval({ x, y });
  for (const name of Object.keys(want)) assert.deepEqual([...got[name].data], [...want[name].data], name);
  assert.equal(want.p.data[299], BigInt.asIntN(64, [...x.data.slice(0, 300)].reduce((a, v) => a * BigInt(v), 1n)), "an int64 product wraps like CUDA");
  for (const kern of programOf(r.graph).kernels.filter((q) => q.outDtype === "f32")) assert.ok(simulateKernel(kern, t).check.ok, kern.name);
  assert.match(programOf(r.graph).kernels.map((q) => q.cuda).join("\n"), /1LL/, "the int64 product's identity is an exact literal");
}
console.log("scan: cumprod, cummax and cummin values");
