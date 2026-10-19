// The last IR and the executable program: every kernel with its CUDA and WGSL source, the order
// to launch them, and the buffers they read and write. Plus seeded inputs and sampled checks that
// every device shares, so a CUDA box and the browser compare against the same reference values.
import { k, P } from "../core/kiln.js";
import { numel, hash, rng, compare } from "../core/util.js";
import { toCuda, toWgsl, toSim, SimMetrics } from "./emit.js";
import { printKernelBody } from "./kernel.js";
import { schedule, compilePoint, workOf } from "./loop.js";
import { timeModel, regsEstimate } from "./tile.js";

export const gpu = k.dialect("gpu").describe("the final IR: kernels with their rendered sources")
  .op("kernel", {
    args: { variadic: "ins" },
    attrs: { K: null, cuda: "", wgsl: "", name: null, expr: null, shape: [], inShapes: [], map: null },
    infer: ({ shape }) => k.tensor(shape),
    print: ({ name, ins }) => `gpu.kernel ${name || "·"}(${ins})`,
    body: ({ cuda }) => cuda,
    identity: ({ expr, shape, args }) => hash(`loop|${expr.__key}|${shape.join("x")}|${args.map((a) => a.type.shape.join("x")).join(",")}`),
    keyIgnore: ["name", "cuda", "wgsl"],
  });
export const emitRule = k.rule("emit_sources").match(P.op("kernel.kernel").as("n"))
  .rewrite(({ n }) => n.lower(gpu.kernel, { ...n.attrs, cuda: toCuda(n.attrs.K), wgsl: toWgsl(n.attrs.K) }))
  .describe("render CUDA C++ and WGSL from Kernel IR (a 1:1 tree walk)");
export const emitPass = k.pass("lowering/emit").short("c").rules(emitRule).describe("render CUDA and WGSL source for every kernel");

// ----------------------------------------------------------------------------- the program
const KID = new WeakMap();
export function programOf(g) {
  const kernels = [];
  for (const id of g.topo()) {
    const n = g.nodes.get(id);
    if (n.name !== "gpu.kernel" && n.name !== "kernel.kernel") continue;
    const a = n.attrs;
    kernels.push({
      id, name: a.name || id, K: a.K, cuda: a.cuda || toCuda(a.K), wgsl: a.wgsl || toWgsl(a.K), expr: a.expr, shape: a.shape, inShapes: a.inShapes,
      args: n.args.map((x) => g.ref(x)), map: a.map, row: a.K.row,
      identity: hash(`loop|${a.expr.__key}|${a.shape.join("x")}|${a.inShapes.map((s) => s.join("x")).join(",")}`),
      bytes: (numel(a.shape) + a.inShapes.reduce((s, x) => s + numel(x), 0)) * 4,
    });
  }
  return { kernels, graph: g };
}

// seeded uniform inputs: the same numbers on every device (no transcendental functions involved)
export function seedOf(kern, seed, j) { return (hash(kern.name).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) + seed * 7919 + j * 104729) >>> 0; }
export function kernelInputs(kern, seed = 1) {
  return kern.inShapes.map((s, j) => {
    const r = rng(seedOf(kern, seed, j));
    const d = new Float32Array(numel(s));
    for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
    return d;
  });
}
// reference values at chosen output indices, from the Loop IR semantics
export function referenceAt(kern, inputs, idx) {
  const f = compilePoint(schedule(kern.expr, kern.shape), kern.inShapes);
  return Float32Array.from(idx, (e) => f(inputs, e));
}
export function sampleIndices(n, count = 384, seed = 3) {
  if (n <= count) return Array.from({ length: n }, (_, i) => i);
  const r = rng(seed), out = new Set([0, n - 1]);
  while (out.size < count) out.add(Math.floor(r() * n));
  return [...out].sort((a, b) => a - b);
}
// Per-kernel inputs are uniform in [−1, 1), which can be outside an op's domain (pow of a negative, log): where
// the reference itself is NaN the output is undefined, so those samples are skipped rather than compared.
export function checkValues(got, want, { rtol = 2e-3, atol = 2e-4 } = {}) {
  const keep = [];
  for (let i = 0; i < want.length; i++) if (!Number.isNaN(want[i])) keep.push(i);
  const skipped = want.length - keep.length;
  if (!keep.length) return { ok: true, maxAbs: 0, bad: 0, skipped, message: `the reference is undefined (NaN) at all ${skipped} sampled outputs on these inputs; nothing to compare` };
  const g = Float32Array.from(keep, (i) => (Number.isNaN(got[i]) ? 1e30 : got[i])), w = Float32Array.from(keep, (i) => want[i]);
  const r = compare(g, w, { rtol, atol });
  if (skipped) { r.skipped = skipped; r.message = `${r.message} (${skipped} samples skipped: the reference is NaN there)`; }
  return r;
}

// ----------------------------------------------------------------------------- the simulator
const SIMS = new WeakMap();
function simFor(K, instrument) {
  let c = SIMS.get(K);
  if (!c) { c = {}; SIMS.set(K, c); }
  const key = instrument ? "i" : "p";
  return (c[key] ||= toSim(K, { instrument }));
}
export function sampleBlocks(G, count = 12) {
  if (G <= count) return Array.from({ length: G }, (_, i) => i);
  const out = new Set([0, G - 1]);
  for (let i = 1; out.size < count; i++) out.add(Math.floor((i * G) / count));
  return [...out].sort((a, b) => a - b);
}
export function simulateKernel(kern, target, { seed = 1, blocks = null } = {}) {
  // sample enough blocks to see the pattern, but bound the simulated work (~6M ops) so heavy kernels stay interactive
  if (blocks == null) {
    let per = 0;
    try { per = workOf(schedule(kern.expr, kern.shape)) / Math.max(1, kern.K.grid); } catch {}
    const byWork = per > 0 ? Math.floor(6e6 / per) : 12;
    blocks = Math.max(per > 2.5e7 ? 1 : 2, Math.min(12, Math.ceil(4096 / kern.K.block), byWork));
  }
  const K = kern.K;
  const ins = kernelInputs(kern, seed);
  const out = new Float32Array(numel(kern.shape)).fill(NaN);
  const M = new SimMetrics(K.block, out.length);
  const run = simFor(K, true);
  const list = sampleBlocks(K.grid, blocks);
  const t0 = performance.now();
  run([...ins, out], list, M);
  const simMs = performance.now() - t0;
  // compare what the sampled blocks wrote against the Loop IR reference
  const covered = [];
  for (let i = 0; i < M.cov.length; i++) if (M.cov[i]) covered.push(i);
  const pick = covered.length > 512 ? sampleIndices(covered.length, 512).map((j) => covered[j]) : covered;
  const want = referenceAt(kern, ins, pick);
  const got = Float32Array.from(pick, (i) => out[i]);
  const check = pick.length ? checkValues(got, want) : { ok: false, message: "the sampled blocks wrote nothing" };
  check.n = pick.length;
  if (M.oobs.length) check.ok = false, check.message = `out-of-bounds ${M.oobs[0].what} (address ${M.oobs[0].a}); ` + check.message;
  if (M.badSyncs.length) check.ok = false, check.message = "a barrier runs in divergent code; " + check.message;
  return { metrics: metricsOf(kern, M, target, list.length), check, simMs };
}
export function regsOf(K) { return Math.min(255, regsEstimate(K.map, K.floats.length / 2)); }
export function metricsOf(kern, M, t, nb) {
  const K = kern.K, scale = K.grid / Math.max(1, nb);
  const traffic = (M.ldSect + M.stSect) * 32 * scale;
  const uniq = kern.bytes;
  const dram = Math.min(traffic, Math.max(uniq, traffic * (uniq > t.l2MB * 1048576 ? 0.6 : 0.12)));
  const counts = { flops: M.flops * scale, traffic, dram, smemWavefronts: M.shWave * scale, warpInstr: M.warpInstr * scale, threads: K.block, blocks: K.grid, smem: K.smemBytes, regs: regsOf(K) };
  const tm = timeModel(counts, t);
  return {
    ...counts, ...tm,
    ldSectorsPerReq: M.ldReq ? M.ldSect / M.ldReq : 0, stSectorsPerReq: M.stReq ? M.stSect / M.stReq : 0,
    ldEfficiency: M.ldReq ? Math.min(1, 4 / (M.ldSect / M.ldReq)) : null,
    bankConflicts: M.shReq ? (M.shWave - M.shReq) / M.shReq : 0, smemWavesPerReq: M.shReq ? M.shWave / M.shReq : 0,
    divergence: M.branchWarps ? M.divWarps / M.branchWarps : 0, syncs: M.syncs * scale,
    intensity: counts.flops / Math.max(1, dram), sampledBlocks: nb, kind: "simulated",
  };
}
// run every block (no instrumentation): for small kernels and end-to-end reference runs
export function simulateFull(kern, inputs) {
  const out = new Float32Array(numel(kern.shape));
  const run = simFor(kern.K, false);
  run([...inputs, out], Array.from({ length: kern.K.grid }, (_, i) => i), null);
  return out;
}
