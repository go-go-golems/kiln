// The last IR and the executable program: every kernel with its CUDA and WGSL source, the order
// to launch them, and the buffers they read and write. Plus seeded inputs and sampled checks that
// every device shares, so a CUDA box and the browser compare against the same reference values.
import { k, P } from "../core/kiln.js";
import { numel, hash, rng, inKey, dtypeBytes } from "../core/util.js";
import { checkSamples } from "@kiln/evidence";
import { toCuda, toWgsl, wgslUnavailableReason, toSim, SimMetrics } from "./emit.js";
import { printKernelBody } from "./kernel.js";
import { schedule, compilePoint, workOf } from "./loop.js";
import { timeModel, regsEstimate } from "./tile.js";
import { roundOperand } from "./mma.js";

export const gpu = k.dialect("gpu").describe("the final IR: kernels with their rendered sources")
  .op("kernel", {
    args: { variadic: "ins" },
    attrs: { K: null, cuda: "", wgsl: "", wgslUnavailable: null, name: null, expr: null, shape: [], outDtype: "f32", inShapes: [], inDtypes: [], map: null },
    infer: ({ shape, outDtype }) => k.tensor(shape, outDtype),
    print: ({ name, ins }) => `gpu.kernel ${name || "·"}(${ins})`,
    body: ({ cuda }) => cuda,
    identity: ({ expr, shape, args, outDtype }) => hash(`loop|${expr.__key}|${shape.join("x")}|${args.map((a) => inKey(a.type.shape, a.type.dtype)).join(",")}${outDtype && outDtype !== "f32" ? "|out:" + outDtype : ""}`),
    keyIgnore: ["name", "cuda", "wgsl", "wgslUnavailable"],
  });
export const emitRule = k.rule("emit_sources").match(P.op("kernel.kernel").as("n"))
  .rewrite(({ n }) => n.lower(gpu.kernel, { ...n.attrs, cuda: toCuda(n.attrs.K), wgsl: wgslUnavailableReason(n.attrs.K) ? null : toWgsl(n.attrs.K), wgslUnavailable: wgslUnavailableReason(n.attrs.K) }))
  .describe("render CUDA C++ and WGSL from Kernel IR (a 1:1 tree walk)");
export const emitPass = k.pass("lowering/emit").short("c").rules(emitRule).describe("render CUDA and WGSL source for every kernel");

// ----------------------------------------------------------------------------- the program
const KID = new WeakMap();
export function programOf(g) {
  const kernels = [];
  for (const id of g.topo()) {
    const n = g.nodes.get(id);
    if (n.name !== "gpu.kernel" && n.name !== "kernel.kernel") continue;
    const a = n.attrs, inDtypes = a.inShapes.map((_, i) => a.inDtypes?.[i] || "f32");
    kernels.push({
      id, name: a.name || id, K: a.K, cuda: a.cuda || toCuda(a.K), wgsl: wgslUnavailableReason(a.K) ? null : (a.wgsl || toWgsl(a.K)), wgslUnavailable: wgslUnavailableReason(a.K), expr: a.expr, shape: a.shape, inShapes: a.inShapes, inDtypes, outDtype: a.outDtype || "f32",
      args: n.args.map((x) => g.ref(x)), map: a.map, row: a.K.row,
      identity: hash(`loop|${a.expr.__key}|${a.shape.join("x")}|${a.inShapes.map((s, i) => inKey(s, inDtypes[i])).join(",")}${a.outDtype && a.outDtype !== "f32" ? "|out:" + a.outDtype : ""}`),
      bytes: numel(a.shape) * dtypeBytes(a.outDtype || "f32") + a.inShapes.reduce((s, x, i) => s + numel(x) * dtypeBytes(inDtypes[i]), 0),
    });
  }
  return { kernels, graph: g };
}

// seeded uniform inputs: the same numbers on every device (no transcendental functions involved)
// Input data is seeded by the kernel identity (what is computed, on which shapes), not its name: two kernels of one
// program that compute the same thing get the same inputs, so they are the same executable (records.js contentOf).
export function seedOf(kern, seed, j) { return (hash(kern.identity || kern.name).split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) + seed * 7919 + j * 104729) >>> 0; }
export function kernelInputs(kern, seed = 1) {
  return kern.inShapes.map((s, j) => {
    const r = rng(seedOf(kern, seed, j)), u8 = kern.inDtypes?.[j] === "u8";
    const d = new Float32Array(numel(s));
    for (let i = 0; i < d.length; i++) d[i] = u8 ? Math.floor(r() * 256) : r() * 2 - 1;
    return d;
  });
}
// A tensor-core kernel (K.mma, KILN-006) is legal only because its A and B inputs arrive in the operand format: from a
// round_tf32 producer, or from f16/bf16 storage. Seeded inputs are uniform FP32 values, so a check of the kernel in
// isolation rounds those two inputs to the format the graph delivers them in; the reference sees the same values.
export function operandInputs(kern, ins) {
  const mm = kern.K?.mma;
  if (!mm) return ins;
  return ins.map((d, j) => (j === mm.a || j === mm.b ? Float32Array.from(d, (x) => roundOperand(x, mm.operand)) : d));
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

// ----------------------------------------------------------------------------- the simulator
const SIMS = new WeakMap();
function simFor(K, instrument, mmaOrder = "sequential") {
  let c = SIMS.get(K);
  if (!c) { c = {}; SIMS.set(K, c); }
  const key = (instrument ? "i" : "p") + "|" + mmaOrder;
  return (c[key] ||= toSim(K, { instrument, mmaOrder }));
}
export function sampleBlocks(G, count = 12) {
  if (G <= count) return Array.from({ length: G }, (_, i) => i);
  const out = new Set([0, G - 1]);
  for (let i = 1; out.size < count; i++) out.add(Math.floor((i * G) / count));
  return [...out].sort((a, b) => a - b);
}
// mmaOrder: the FP32 accumulation order the emulated tensor-core atoms use (mma.js ORDERS)
export function simulateKernel(kern, target, { seed = 1, blocks = null, mmaOrder = "sequential" } = {}) {
  // sample enough blocks to see the pattern, but bound the simulated work (~6M ops) so heavy kernels stay interactive
  if (blocks == null) {
    let per = 0;
    try { per = workOf(schedule(kern.expr, kern.shape)) / Math.max(1, kern.K.grid); } catch {}
    const byWork = per > 0 ? Math.floor(6e6 / per) : 12;
    blocks = Math.max(per > 2.5e7 ? 1 : 2, Math.min(12, Math.ceil(4096 / kern.K.block), byWork));
  }
  const K = kern.K;
  const ins = operandInputs(kern, kernelInputs(kern, seed));
  const out = new Float32Array(numel(kern.shape)).fill(NaN);
  const M = new SimMetrics(K.block, out.length);
  const run = simFor(K, true, mmaOrder);
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
  const check = pick.length ? checkSamples(got, want) : { ok: false, message: "the sampled blocks wrote nothing" };
  check.n = pick.length;
  if (M.oobs.length) check.ok = false, check.message = `out-of-bounds ${M.oobs[0].what} (address ${M.oobs[0].a}); ` + check.message;
  if (M.badSyncs.length) check.ok = false, check.message = "a barrier runs in divergent code; " + check.message;
  if (M.badMmas.length) check.ok = false, check.message = `${M.badMmas[0].message}; ` + check.message;
  return { metrics: metricsOf(kern, M, target, list.length), check, simMs };
}
export function regsOf(K) { return Math.min(255, regsEstimate(K.map, K.floats.length / 2, K.mma?.op)); }
export function metricsOf(kern, M, t, nb) {
  const K = kern.K, scale = K.grid / Math.max(1, nb);
  const traffic = (M.ldSect + M.stSect) * 32 * scale;
  const uniq = kern.bytes;
  const dram = Math.min(traffic, Math.max(uniq, traffic * (uniq > t.l2MB * 1048576 ? 0.6 : 0.12)));
  const counts = { flops: M.flops * scale, traffic, dram, smemWavefronts: M.shWave * scale, warpInstr: M.warpInstr * scale, threads: K.block, blocks: K.grid, smem: K.smemBytes, regs: regsOf(K) };
  if (M.tensorFlops) Object.assign(counts, { tensorFlops: M.tensorFlops * scale, tensorTflops: t.mma?.[K.mma?.operand] ?? t.peakTflops });
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
