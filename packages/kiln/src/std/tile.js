// Tile IR: how a Loop IR kernel maps onto a GPU. A schedule rule forks over three strategies and
// their knobs; legality (threads, shared memory) narrows the options, and nothing else does:
//   MAP=thread  one thread per output element; reductions run serially per thread
//   MAP=row     one block per row; threads cooperate on each row reduction (strided loop + tree combine)
//               and on the row's elementwise sweep; STAGE puts the row's inputs in shared memory
//   MAP=tiled   a contraction tiled into BM×BN output tiles with BK-deep shared-memory slabs and a
//               TM×TN register tile per thread (generalized matmul: any body, any epilogue)
//   MAP=mma     a tensor-core contraction (KILN-006): the same BM×BN×BK block tiling, split into WM×WN warp
//               tiles of 16×8 mma.sync atoms (mma.js); legal only when mmaPlan accepts the kernel: a pure sum of
//               products of one A and one B operand that both arrive in a tensor-core format (TF32, f16, bf16)
// A kernel with a scan (an ordered loop over one output coordinate) reads MAP as what one thread or block owns:
//   MAP=thread  one thread per row (the other output coordinates); the scan loop runs serially, carry in a register
//   MAP=row     one block per row; chunks of TPB positions, a Hillis-Steele scan of each chunk in shared memory,
//               and a block-wide carry between chunks
//   MAP=flash   a recognized softmax contraction (attention.js): BR query rows per block, K and V streamed
//               BC keys at a time through shared memory, online softmax in registers (flash.js)
import { k, P, KilnError } from "../core/kiln.js";
import { numel, strides, hash, inKey, dtypeBytes } from "../core/util.js";
import * as IX from "../core/ix.js";
import { schedule, free, printNest, displayNames, workOf } from "./loop.js";
import { FNS, reducer } from "./fns.js";
import { MMA_OPS, OP_FOR_PRECISION, mmaSmemLayout, mmaSmemBytes } from "./mma.js";
import { matchSoftmaxContraction } from "./attention.js";
import { flashBR, flashBC, flashRM, flashTPB, flashLaunch, flashCounts, printFlash } from "./flash.js";

// ----------------------------------------------------------------------------- knobs
export const MAP = k.param.enum("MAP", ["thread", "row", "tiled", "mma", "flash"], { off: "thread" }).group("schedule").help("how the kernel maps onto the GPU");
export const TPB = k.param.enum("TPB", [32, 64, 128, 256, 512, 1024], { off: 0, default: 256 }).group("schedule").help("threads per block");
export const COARSEN = k.param.enum("COARSEN", [1, 2, 4], { off: 1 }).group("schedule").help("outputs per thread (thread map)");
export const STAGE = k.param.enum("STAGE", ["none", "reused", "all"], { off: "none" }).group("schedule").help("stage row inputs in shared memory (row map)");
export const BM = k.param.enum("BM", [16, 32, 64, 128], { off: 0 }).group("tile").help("output tile rows");
export const BN = k.param.enum("BN", [16, 32, 64, 128], { off: 0 }).group("tile").help("output tile columns");
export const BK = k.param.enum("BK", [8, 16, 32], { off: 0 }).group("tile").help("reduction slab depth");
export const TM = k.param.enum("TM", [1, 2, 4, 8], { off: 1 }).group("tile").help("register tile rows per thread");
export const TN = k.param.enum("TN", [1, 2, 4, 8], { off: 1 }).group("tile").help("register tile columns per thread");
export const WM = k.param.enum("WM", [16, 32, 64], { off: 0 }).group("tile").help("warp tile rows (mma map)");
export const WN = k.param.enum("WN", [8, 16, 32, 64], { off: 0 }).group("tile").help("warp tile columns (mma map)");
export const BR = k.param.enum("BR", [8, 16, 32, 64], { off: 0 }).group("tile").help("query rows per block (flash map)");
export const BC = k.param.enum("BC", [16, 32, 64], { off: 0 }).group("tile").help("keys per shared-memory tile (flash map)");
export const RM = k.param.enum("RM", [1, 2, 4], { off: 0 }).group("tile").help("query rows per thread (flash map)");
export const KNOBS = [MAP, TPB, COARSEN, STAGE, BM, BN, BK, TM, TN, WM, WN, BR, BC, RM];
export const canonRow = (kn) => KNOBS.filter((p) => kn[p.name] !== undefined && kn[p.name] !== p.off).map((p) => `${p.name}=${kn[p.name]}`).join(",") || "MAP=thread";

// ----------------------------------------------------------------------------- analysis
const AN = new WeakMap();
const flatOf = (idx, shape) => { const st = strides(shape); return idx.reduce((acc, e, j) => acc.add(IX.lift(e).mul(st[j])), IX.C(0)); };
const pow2 = (x) => 2 ** Math.ceil(Math.log2(Math.max(1, x)));
export function analyze(expr, shape, inShapes) {
  const key = shape.join("x") + "|" + inShapes.map((s) => s.join("x")).join(",");
  const c = AN.get(expr);
  if (c && c.key === key) return c.an;
  const s = schedule(expr, shape);
  const n = s.dims.length;
  const scopeDepth = (sc) => sc.depth;
  const outReds = s.reds.filter((r) => !s.placed.get(r).red);
  const hoisted = outReds.filter((r) => scopeDepth(s.placed.get(r)) < n);
  // the row depth: the outermost output scope that holds a reduction (n means: per output element)
  const rd = outReds.length ? Math.min(...outReds.map((r) => scopeDepth(s.placed.get(r)))) : null;
  const numelOut = numel(shape);
  const extent = (v) => s.reds.find((r) => r.r === v)?.n ?? s.dims.find((d) => d.v === v)?.n;
  const an = { sched: s, n, dims: s.dims, shape, inShapes, numelOut, rd, rows: null, inner: null, contraction: null, stage: [], flat: (i, idx) => flatOf(idx, inShapes[i]),
    // the flat index with loop ranges applied: what the cost model reads strides from (codegen keeps flat)
    boundedFlat: (i, idx) => IX.bounded(flatOf(idx, inShapes[i]), extent) };
  if (s.scanV) {
    // the scheduler made the scanned coordinate the innermost loop; every other output coordinate is a row
    const sd = s.dims[n - 1], rowDims = s.dims.slice(0, n - 1);
    an.rd = null;
    an.scan = { v: s.scanV, n: sd.n, dim: sd.dim, rowDims, rowVars: rowDims.map((d) => d.v), rows: rowDims.reduce((a, d) => a * d.n, 1),
      carries: s.carries.map((c) => ({ name: s.names.get(c), fn: c.fn, dtype: reducer(c.fn).type ?? "f32" })), reductions: s.reds.length };
    an.maxExtent = sd.n;
    AN.set(expr, { key, an });
    return an;
  }
  if (rd != null) {
    an.rows = s.dims.slice(0, rd).reduce((a, d) => a * d.n, 1);
    an.inner = s.dims.slice(rd).reduce((a, d) => a * d.n, 1);
    an.rowVars = s.dims.slice(0, rd).map((d) => d.v);
    an.rowReds = outReds.filter((r) => scopeDepth(s.placed.get(r)) === rd);
    an.maxExtent = Math.max(an.inner, ...an.rowReds.map((r) => r.n));
    // stageable inputs: every load is base(row) + v with one loop variable and the same extent
    const byIn = new Map();
    for (const L of s.loads) { if (!byIn.has(L.i)) byIn.set(L.i, []); byIn.get(L.i).push(L); }
    for (const [i, loads] of byIn) {
      let ok = true, base = null, L0 = null, v0 = new Set();
      for (const L of loads) {
        const sc = s.placed.get(L);
        if (sc.depth <= rd && !sc.red) { ok = false; break; }          // a row-level scalar load
        const f = flatOf(L.idx, inShapes[i]);
        const others = [...IX.vars(f)].filter((v) => !an.rowVars.includes(v));
        if (others.length !== 1) { ok = false; break; }
        const v = others[0];
        const aff = IX.affine(f, [v, ...an.rowVars]);
        if (!aff || aff.k[v] !== 1) { ok = false; break; }
        const b = IX.subst(f, { [v]: IX.C(0) });
        const ext = extent(v);
        if (base && IX.keyOf(b) !== IX.keyOf(base)) { ok = false; break; }
        if (L0 != null && ext !== L0) { ok = false; break; }
        base = b; L0 = ext; v0.add(v);
      }
      if (ok && base) an.stage.push({ i, base, len: L0, loads: loads.length, vars: [...v0] });
    }
  }
  if (n >= 2 && !hoisted.length) {
    const inner = outReds.filter((r) => scopeDepth(s.placed.get(r)) === n);
    if (inner.length === 1) {
      const C = inner[0];
      const loopScope = s.scopes.find((x) => x.red === C);
      const inC = [...s.placed.entries()].filter(([, sc]) => sc === loopScope).map(([nd]) => nd);
      const mVar = s.dims[n - 2].v, nVar = s.dims[n - 1].v;
      // an index value in the contraction body would need the tile's coordinates, which the tiled
      // body does not bind (its operands come from shared tiles): keep such kernels off MAP=tiled
      let ok = !inC.some((x) => x.k === "red" || x.k === "ix");
      // the tiled materializer emits the loop body from tile operands and accumulators only: a value the body
      // reads from an outer scope (hoisted by code motion, like p[i] in Σ_j (p[j] − p[i])·w[i,j]) has no home there
      const isNode = (a) => a && typeof a === "object" && (a.k === "in" || a.k === "ix" || a.k === "op" || a.k === "red");
      if (ok && inC.some((x) => x.k === "op" && x.a.some((a) => isNode(a) && s.placed.get(a) !== loopScope))) ok = false;
      const A = [], B = [];
      for (const x of inC) if (x.k === "in") {
        const f = free(x);
        if (f.has(mVar) && f.has(nVar)) { ok = false; break; }
        (f.has(nVar) ? B : A).push(x);
      }
      if (ok && (A.length || B.length)) an.contraction = { C, loopScope, inC, A, B, mVar, nVar, M: s.dims[n - 2].n, N: s.dims[n - 1].n, K: C.n, batch: s.dims.slice(0, n - 2) };
    }
  }
  // a softmax contraction (attention) the flash map can run; null otherwise
  an.attention = matchSoftmaxContraction(expr, shape, inShapes);
  AN.set(expr, { key, an });
  return an;
}

// ----------------------------------------------------------------------------- tensor-core legality (KILN-006)
/**
 * The operand precision of each input of a kernel node (a loop.kernel, or a tile.kernel whose inputs are scheduled):
 * "f16"/"bf16" for half-precision storage, "tf32" for an FP32 input whose producer kernel's root is round_tf32
 * (tensor.js tf32Pass), otherwise the storage dtype ("f32", integer types). A graph input is never "tf32", even if
 * its values happen to be representable: the IR has no annotation that says so.
 */
export function operandPrecision(n) {
  return n.args.map((a) => {
    const d = a.type?.dtype || "f32";
    if (d === "f16" || d === "bf16") return d;
    const e = a.attrs?.expr;
    if (d === "f32" && e && e.k === "op" && e.fn === "round_tf32") return "tf32";
    return d;
  });
}
// An operand is a load under a chain of format functions: copy (the FX importer's widening cast survives fusion as
// copy) and the roundings to a tensor-core format (a round_tf32 producer that fusion inlined into the contraction).
// → { load, fns (innermost first), format (the outermost rounding's format, or null) } or null
const FORMAT_FNS = { copy: null, round_tf32: "tf32", round_f16: "f16", round_bf16: "bf16" };
function operandChain(x) {
  const fns = [];
  while (x?.k === "op" && x.a.length === 1 && Object.hasOwn(FORMAT_FNS, x.fn)) { fns.unshift(x.fn); x = x.a[0]; }
  if (x?.k !== "in") return null;
  const format = [...fns].reverse().map((f) => FORMAT_FNS[f]).find(Boolean) ?? null;
  return { load: x, fns, format };
}
/**
 * Whether a contraction can run on tensor cores, and with which atom. Legal when the reduction at the innermost
 * output scope is a sum, from zero, of mul(A, B) over exactly one A and one B operand of the same tensor-core
 * precision; each operand is its load under copy and format roundings (operandChain), and its precision is the
 * outermost rounding's format, else its input's precision (operandPrecision). Then each MMA output is the sum of the
 * same exact products the reference sums; only the FP32 accumulation order and rounding can differ.
 * t (optional): the target; mma.sync needs sm >= 80.
 * → { op, operand, a, b, aFns, bFns } (a, b: kernel input indices; *Fns: the chain the tile loader applies) or { reason }
 */
export function mmaPlan(an, prec, t = null) {
  const ct = an.contraction;
  if (!ct) return { reason: "not a contraction" };
  if (t && !(t.sm >= 80)) return { reason: `target ${t.id} has no mma.sync (sm ${t.sm})` };
  if (ct.A.length !== 1 || ct.B.length !== 1) return { reason: `contraction body must read one A and one B operand (reads ${ct.A.length} and ${ct.B.length})` };
  if (ct.C.fn !== "add") return { reason: `reduction ${ct.C.fn} is not a sum` };
  const body = ct.C.body;
  const xs = body?.k === "op" && body.fn === "mul" && body.a.length === 2 ? body.a.map(operandChain) : null;
  const [A, B] = [ct.A[0], ct.B[0]];
  if (!xs || !xs.every(Boolean)) return { reason: "body is not mul(A, B) up to copy and format rounding" };
  const [ca, cb] = xs[0].load === A && xs[1].load === B ? xs : xs[0].load === B && xs[1].load === A ? [xs[1], xs[0]] : [];
  if (!ca) return { reason: "body is not mul(A, B) up to copy and format rounding" };
  if (!prec && !(ca.format && cb.format)) return { reason: "operand precisions unknown" };
  const pa = ca.format ?? prec[A.i] ?? "f32", pb = cb.format ?? prec[B.i] ?? "f32";
  if (pa !== pb) return { reason: `mixed operand precisions ${pa}, ${pb}` };
  const op = OP_FOR_PRECISION[pa];
  return op ? { op, operand: pa, a: A.i, b: B.i, aFns: ca.fns, bFns: cb.fns, roundsA: !!ca.format, roundsB: !!cb.format } : { reason: `operand precision ${pa} has no tensor-core format` };
}
const warpsOf = (kn) => (kn.BM / kn.WM) * (kn.BN / kn.WN);

export function legalMaps(an, plan = null) {
  // a scan: one thread per row always; one block per row when no reduction shares the kernel
  if (an.scan) return an.scan.reductions ? ["thread"] : ["thread", "row"];
  const out = ["thread"];
  if (an.rd != null) out.push("row");
  if (an.contraction) out.push("tiled");
  if (plan?.op) out.push("mma");
  if (an.attention) out.push("flash");
  return out;
}
export function forkTree(an, t, plan = null) {
  const maxT = t.maxThreadsPerBlock;
  const smemMax = t.smemPerBlock;
  const ct = an.contraction;
  const nA = ct ? ct.A.length : 0, nB = ct ? ct.B.length : 0;
  const att = an.attention;
  return k.fork.tree()
    .level(MAP, () => legalMaps(an, plan))
    .level(BR, (kn) => (kn.MAP === "flash" ? flashBR(att) : [0]))
    .level(BC, (kn) => (kn.MAP === "flash" ? flashBC(att, kn.BR, t) : [0]))
    .level(RM, (kn) => (kn.MAP === "flash" ? flashRM(att, kn.BR) : [0]))
    // a scan's thread map has one thread per row: blocks wider than the row count only add idle threads
    .level(TPB, (kn) => (kn.MAP === "flash" ? flashTPB(att, kn.BR, kn.BC, kn.RM, t) : kn.MAP === "thread" && an.scan ? [32, 64, 128, 256, 512, 1024].filter((v) => v <= maxT && v <= Math.max(32, pow2(an.scan.rows))) : kn.MAP === "thread" ? [64, 128, 256, 512, 1024].filter((v) => v <= maxT) : kn.MAP === "row" ? [32, 64, 128, 256, 512, 1024].filter((v) => v <= maxT && v <= Math.max(32, pow2(an.maxExtent) * (an.scan ? 1 : 2))) : [0]))
    .level(COARSEN, (kn) => (kn.MAP === "thread" ? [1, 2, 4] : [1]))
    .level(STAGE, (kn) => {
      if (kn.MAP !== "row" || !an.stage.length) return ["none"];
      const bytes = (list) => list.reduce((a, s) => a + s.len * 4, 0) + kn.TPB * 4;
      const reused = an.stage.filter((s) => s.loads >= 2);
      const opts = ["none"];
      if (reused.length && bytes(reused) <= smemMax) opts.push("reused");
      if (an.stage.length > reused.length && bytes(an.stage) <= smemMax) opts.push("all");
      return opts;
    })
    .level(BM, (kn) => (kn.MAP === "tiled" || kn.MAP === "mma" ? [16, 32, 64, 128].filter((v) => v <= Math.max(16, pow2(ct.M))) : [0]))
    .level(BN, (kn) => (kn.MAP === "tiled" || kn.MAP === "mma" ? [16, 32, 64, 128].filter((v) => v <= Math.max(16, pow2(ct.N))) : [0]))
    .level(BK, (kn) => (kn.MAP === "mma" ? [8, 16, 32].filter((v) => { const ak = MMA_OPS[plan.op].k; return v % ak === 0 && v <= Math.max(ak, pow2(ct.K)) && mmaSmemBytes(plan.op, { ...kn, BK: v }) <= smemMax; })
      : kn.MAP === "tiled" ? [8, 16, 32].filter((v) => v <= Math.max(8, pow2(ct.K)) && (nA * kn.BM + nB * kn.BN) * v * 4 <= smemMax) : [0]))
    .level(TM, (kn) => (kn.MAP === "tiled" ? [1, 2, 4, 8].filter((v) => kn.BM % v === 0) : [1]))
    .level(TN, (kn) => (kn.MAP === "tiled" ? [1, 2, 4, 8].filter((v) => { const th = (kn.BM / kn.TM) * (kn.BN / v); return kn.BN % v === 0 && th >= 32 && th <= maxT; }) : [1]))
    // warp tiles (mma map only; unset elsewhere, so existing options keep their canonical knobs)
    .level(WM, (kn) => (kn.MAP === "mma" ? [16, 32, 64].filter((v) => kn.BM % v === 0) : [undefined]))
    .level(WN, (kn) => (kn.MAP === "mma" ? [8, 16, 32, 64].filter((v) => kn.BN % v === 0 && warpsOf({ ...kn, WN: v }) * 32 <= maxT) : [undefined]));
}

// ----------------------------------------------------------------------------- launch geometry
// plan: mmaPlan's result, required for MAP=mma (the atom fixes the shared-memory padding)
export function launch(an, kn, plan = null) {
  if (kn.MAP === "flash") return flashLaunch(an.attention, kn);
  if (an.scan) {
    const sc = an.scan;
    if (kn.MAP === "row") return { grid: sc.rows, block: kn.TPB, smem: sc.carries.reduce((a, c) => a + kn.TPB * dtypeBytes(c.dtype), 0), staged: [] };
    return { grid: Math.ceil(sc.rows / (kn.TPB * kn.COARSEN)), block: kn.TPB, smem: 0, staged: [] };
  }
  if (kn.MAP === "row") {
    const st = stagedOf(an, kn);
    return { grid: an.rows, block: kn.TPB, smem: (st.reduce((a, s) => a + s.len, 0) + (an.rowReds.length ? kn.TPB : 0)) * 4, staged: st };
  }
  if (kn.MAP === "mma") {
    if (!plan?.op) throw new KilnError("ScheduleError", `MAP=mma needs a tensor-core plan${plan?.reason ? ": " + plan.reason : ""}`);
    const ct = an.contraction;
    const batches = ct.batch.reduce((a, d) => a * d.n, 1);
    return { grid: batches * Math.ceil(ct.M / kn.BM) * Math.ceil(ct.N / kn.BN), block: warpsOf(kn) * 32, smem: mmaSmemBytes(plan.op, kn), batches };
  }
  if (kn.MAP === "tiled") {
    const ct = an.contraction;
    const batches = ct.batch.reduce((a, d) => a * d.n, 1);
    return { grid: batches * Math.ceil(ct.M / kn.BM) * Math.ceil(ct.N / kn.BN), block: (kn.BM / kn.TM) * (kn.BN / kn.TN), smem: (ct.A.length * kn.BM + ct.B.length * kn.BN) * kn.BK * 4, batches };
  }
  return { grid: Math.ceil(an.numelOut / (kn.TPB * kn.COARSEN)), block: kn.TPB, smem: 0 };
}
export function stagedOf(an, kn) {
  if (kn.MAP !== "row" || kn.STAGE === "none") return [];
  return an.stage.filter((s) => kn.STAGE === "all" || s.loads >= 2);
}

// ----------------------------------------------------------------------------- the cost model
// registers per thread: what a register allocator would need, roughly (values are short-lived)
// mma map: accumulators (4 per atom) plus one k-step's fragments (one f32 temporary per element; the f16/bf16 sizes when
// the op is not given)
export const regsEstimate = (kn, values, op = null) => {
  if (kn.MAP === "mma") { const o = MMA_OPS[op] ?? MMA_OPS["m16n8k16.f16"], MI = kn.WM / 16, NI = kn.WN / 8; return 24 + MI * NI * 4 + MI * o.aElems + NI * o.bElems; }
  return kn.MAP === "tiled" ? 24 + kn.TM * kn.TN + kn.TM + kn.TN : 20 + Math.min(40, Math.ceil(values / 2));
};
// counts → time on a target. The simulator feeds measured counts into the same model.
export function timeModel(c, t) {
  const T = c.threads, G = c.blocks;
  const wpb = Math.ceil(T / 32), maxW = t.maxThreadsPerSM / 32;
  const lim = {
    blocks: t.maxBlocksPerSM,
    threads: Math.floor(t.maxThreadsPerSM / (wpb * 32)),
    smem: c.smem > 0 ? Math.floor(t.smemPerSM / c.smem) : Infinity,
    regs: Math.floor(t.regsPerSM / (Math.min(255, c.regs) * wpb * 32)),
  };
  const bps = Math.min(...Object.values(lim));
  if (T > t.maxThreadsPerBlock) return { us: Infinity, infeasible: `${T} threads per block > ${t.maxThreadsPerBlock}` };
  if (c.smem > t.smemPerBlock) return { us: Infinity, infeasible: `${c.smem} B shared memory per block > ${t.smemPerBlock}` };
  if (bps < 1) return { us: Infinity, infeasible: "not one block fits on an SM" };
  const limiter = Object.entries(lim).find(([, v]) => v === bps)[0];
  const occ = (bps * wpb) / maxW;                                   // theoretical occupancy
  const perUs = (x) => x * 1e3;
  // each resource's time if the whole grid ran on every SM at full efficiency
  const raw = {
    dram: c.dram / perUs(t.bwGBs),
    // measured L2 read bandwidth where known (targets.js l2GBs); otherwise the 3x-DRAM prior
    l2: c.traffic / perUs(t.l2GBs ?? 3 * t.bwGBs),
    compute: c.flops / (t.peakTflops * 1e6),
    smem: c.smemWavefronts / (t.sms * perUs(t.clockGHz)),
    issue: c.warpInstr / (t.sms * 4 * perUs(t.clockGHz)),
  };
  // tensor-core work (KILN-006): its own pipeline and rate (targets.js mma, or the FP32 peak as a pessimistic prior)
  if (c.tensorFlops) raw.tensor = c.tensorFlops / ((c.tensorTflops ?? t.peakTflops) * 1e6);
  // latency hiding: fewer resident warps per SM → less of each peak is reachable
  const memEff = (o) => Math.min(1, 0.2 + 1.6 * o), compEff = (o) => Math.min(1, 0.25 + 1.5 * o);
  const eff = (k, o) => (k === "dram" || k === "l2" ? memEff(o) : compEff(o));
  // waves: up to sms × bps blocks run at once; a partial wave leaves SMs idle and runs fewer warps per SM
  const slots = t.sms * bps, waves = Math.ceil(G / slots);
  const parts = Object.fromEntries(Object.keys(raw).map((key) => [key, 0]));
  let core = 0, smUse = 0, achieved = 0;
  const wave = (b, times) => {
    const s = Math.min(t.sms, b), k = Math.ceil(b / s), o = Math.min(occ, (k * wpb) / maxW);
    let worst = 0;
    for (const key in raw) { const v = (raw[key] * (t.sms / G) * k) / eff(key, o); parts[key] += v * times; worst = Math.max(worst, v); }
    core += worst * times; smUse += (s / t.sms) * times; achieved += o * times;
  };
  if (waves > 1) wave(slots, waves - 1);
  wave(G - (waves - 1) * slots, 1);
  const [bound] = Object.entries(parts).reduce((a, b) => (b[1] > a[1] ? b : a));
  const us = t.launchUs + core;
  return { us, bound: us < t.launchUs * 1.5 ? "launch" : bound, parts, occupancy: occ, achievedOccupancy: achieved / waves, blocksPerSM: bps, limiter, waves, util: smUse / waves, gflops: c.flops / us / 1e3, gbs: c.dram / us / 1e3 };
}

// coalescing: 32-byte sectors per warp access for an address stride (in floats) between lanes
const sectorsFor = (stride) => { const s = Math.abs(stride); return s === 0 ? 1 : Math.min(32, 4 * s); };
// a data-dependent term that does not vary with v is constant along v (a gathered row); one that does is not affine
const coefOf = (f, v) => { const g = IX.mapLoads(f, (l) => (IX.vars(l).has(v) ? l : IX.C(0))); const a = IX.affine(g, [...IX.vars(g)]); return a ? a.k[v] || 0 : 8; };

// a scan kernel's counts. Thread map: each warp owns up to 32 rows and walks the scan loop serially, so a
// statement in that loop is one warp instruction per position per warp (not per 32 positions), and a load's
// sectors follow the address stride between adjacent rows. A load in the scan loop that walks its row
// contiguously re-reads the sectors of earlier positions, which L1 holds: it is charged the smaller of the
// per-access sectors and the warp's footprint (lanes × n × 4 bytes). Stores are charged per access. Row map: every chunk of T positions runs the body
// once per thread, then log2 T Hillis-Steele rounds (a shared load, a combine, a shared store, two barriers)
// per carried value. A barrier is charged as warp instructions: it stalls the whole block.
const SYNC_INSTR = 8;
function estimateScan(an, kn, t) {
  const L = launch(an, kn), s = an.sched, sc = an.scan;
  const fl = (st) => (st.e?.k === "op" ? FNS[st.e.fn]?.flops ?? 1 : 0);
  let flops = 0, traffic = 0, warpInstr = 0, smemWave = 0;
  const laneVar = sc.rowVars.at(-1) ?? null;
  const outSt = strides(an.shape);
  if (kn.MAP === "thread") {
    const lanes = Math.min(32, sc.rows), warps = Math.ceil(sc.rows / 32);
    const sectors = (stride) => (stride === 0 ? 1 : Math.min(lanes, Math.ceil((lanes * 4 * Math.abs(stride)) / 32)));
    const walk = (ss, reps) => {
      for (const st of ss) {
        if (st.s === "for") walk(st.body, st.kind === "free" ? reps : reps * st.n);
        else if (st.s === "let") {
          warpInstr += warps * reps;
          if (st.e.k === "in") {
            const f = an.boundedFlat(st.e.i, st.e.idx), perAccess = reps * sectors(laneVar ? coefOf(f, laneVar) : 0);
            const alongV = Math.abs(coefOf(f, sc.v)), footprint = alongV === 1 ? (reps / sc.n) * Math.ceil((lanes * sc.n * 4) / 32) : Infinity;
            traffic += warps * Math.min(perAccess, footprint) * 32;
          }
          else flops += sc.rows * reps * fl(st);
        } else if (st.s === "acc" || st.s === "step") { warpInstr += warps * reps; flops += sc.rows * reps; }
        else if (st.s === "write") { warpInstr += warps * reps; traffic += warps * reps * sectors(laneVar ? outSt[sc.rowDims.at(-1).dim] : 0) * 32; }
      }
    };
    walk(s.stmts, 1);
  } else {
    const T = kn.TPB, chunks = Math.ceil(sc.n / T), wpb = T / 32, lg = Math.log2(T);
    const walk = (ss, inScan) => {
      for (const st of ss) {
        if (st.s === "for") walk(st.body, inScan || st.kind === "scan");
        else {
          const reps = sc.rows * (inScan ? chunks : 1) * wpb;
          if (st.s === "let") {
            warpInstr += reps;
            if (st.e.k === "in") traffic += reps * (inScan ? sectorsFor(coefOf(an.boundedFlat(st.e.i, st.e.idx), sc.v)) : 1) * 32;
            else flops += reps * 32 * fl(st);
          } else if (st.s === "step") {
            warpInstr += reps * (4 + 3 * lg + SYNC_INSTR * (2 * lg + 2));
            smemWave += reps * (2 + 2 * lg);
            flops += reps * 32 * (lg + 2);
          } else if (st.s === "write") { warpInstr += reps; traffic += reps * sectorsFor(outSt[sc.dim]) * 32; }
        }
      }
    };
    walk(s.stmts, false);
  }
  const uniq = an.inShapes.reduce((a, sh) => a + numel(sh) * 4, 0), outBytes = an.numelOut * 4;
  const dram = Math.min(traffic, Math.max(uniq + outBytes, traffic * (uniq > t.l2MB * 1048576 ? 0.6 : 0.12)));
  const counts = { flops, traffic, dram, smemWavefronts: smemWave, warpInstr, threads: L.block, blocks: L.grid, smem: L.smem, regs: regsEstimate(kn, [...s.placed.keys()].length) };
  return { ...counts, ...timeModel(counts, t) };
}

// analytic counts for one option: the prior the greedy compile ranks with. plan: mmaPlan's result (MAP=mma only)
export function estimate(an, kn, t, plan = null) {
  if (an.scan) return estimateScan(an, kn, t);
  if (kn.MAP === "mma") return estimateMma(an, kn, t, plan);
  const L = launch(an, kn);
  const s = an.sched;
  let flops = 0, traffic = 0, warpInstr = 0, smemWave = 0;
  const outBytes = an.numelOut * 4;
  const uniq = an.inShapes.reduce((a, sh) => a + numel(sh) * 4, 0);
  const lastV = an.dims.length ? an.dims[an.dims.length - 1].v : null;
  const fl = (st) => (st.e?.k === "op" ? FNS[st.e.fn]?.flops ?? 1 : 0);
  const access = (trips, fvar, st, staged) => {
    if (staged) { smemWave += trips / 32; return; }
    const f = an.boundedFlat(st.e.i, st.e.idx);
    const stride = fvar ? coefOf(f, fvar) : 0;
    traffic += (trips / 32) * sectorsFor(stride) * 32;
  };
  if (kn.MAP === "flash") {
    const c = flashCounts(an.attention, kn);
    const dram = Math.min(c.traffic, Math.max(uniq + outBytes, c.traffic * (uniq > t.l2MB * 1048576 ? 0.6 : 0.12)));
    const counts = { ...c, dram };
    return { ...counts, ...timeModel(counts, t) };
  }
  if (kn.MAP === "thread") {
    const walk = (ss, trips) => {
      for (const st of ss) {
        if (st.s === "for") walk(st.body, st.kind === "reduce" ? trips * st.n : trips);
        else if (st.s === "let") { if (st.e.k === "in") access(trips, lastV, st); else flops += trips * fl(st); warpInstr += trips / 32; }
        else if (st.s === "acc") { flops += trips; warpInstr += trips / 32; }
      }
    };
    walk(s.stmts, an.numelOut);
    traffic += outBytes;
  } else if (kn.MAP === "row") {
    const staged = new Set(L.staged.map((x) => x.i));
    for (const x of L.staged) { traffic += an.rows * x.len * 4; smemWave += (an.rows * x.len) / 32; }
    const walk = (ss, trips, depth, fvar, inRowScope) => {
      for (const st of ss) {
        if (st.s === "for" && st.kind === "free") {
          if (depth < an.rd) walk(st.body, trips, depth + 1, null, depth + 1 === an.rd);
          else walk(st.body, trips * st.n, depth + 1, st.v, false);
        } else if (st.s === "for") walk(st.body, trips * st.n, depth, inRowScope ? st.v : fvar, false);
        else if (st.s === "let") {
          const t2 = inRowScope || depth < an.rd ? an.rows * kn.TPB : trips;
          if (st.e.k === "in") access(t2, inRowScope || depth < an.rd ? null : fvar, st, staged.has(st.e.i)); else flops += t2 * fl(st);
          warpInstr += t2 / 32;
        } else if (st.s === "acc") { flops += trips; warpInstr += trips / 32; }
      }
    };
    walk(s.stmts, an.rows, 0, null, an.rd === 0);
    const combine = an.rowReds.length * an.rows * kn.TPB * 2 * Math.log2(kn.TPB);
    warpInstr += combine / 32; smemWave += combine / 32;
    traffic += outBytes;
  } else {
    const ct = an.contraction;
    const Mp = Math.ceil(ct.M / kn.BM) * kn.BM, Np = Math.ceil(ct.N / kn.BN) * kn.BN, Kp = Math.ceil(ct.K / kn.BK) * kn.BK;
    const batches = L.batches;
    const kt = Kp / kn.BK;
    const bodyOps = ct.inC.filter((x) => x.k === "op").reduce((a, x) => a + (FNS[x.fn]?.flops ?? 1), 0) + 1;
    flops = batches * Mp * Np * Kp * bodyOps;
    warpInstr = (batches * Mp * Np * Kp * (bodyOps + 0.5)) / 32 / 1 + (batches * L.grid * kt * L.block * (ct.A.length * kn.TM + ct.B.length * kn.TN)) / 32 / Math.max(1, kn.TM * kn.TN / 2);
    // shared-memory bank conflicts, worked out the way the hardware (and the simulator) counts them: for one
    // warp, the largest number of distinct addresses that fall in the same bank. The addresses mirror the
    // kernel the materializer writes (kernel.js, matTiled): tile stores, then the inner-product reads.
    const conflict = (addr) => { const banks = new Map(); for (let t = 0; t < 32; t++) { const a = addr(t), b = ((a % 32) + 32) % 32; if (!banks.has(b)) banks.set(b, new Set()); banks.get(b).add(a); } let d = 1; for (const v of banks.values()) d = Math.max(d, v.size); return d; };
    const TX = kn.BN / kn.TN;
    const tileLoads = (list, rows, other, isA) => {
      for (const x of list) {
        const f = an.boundedFlat(x.i, x.idx);
        const sK = coefOf(f, ct.C.r), sR = coefOf(f, other);
        const stride = Math.min(Math.abs(sK) || 99, Math.abs(sR) || 99) === 99 ? 0 : Math.min(Math.abs(sK) || 99, Math.abs(sR) || 99);
        const n = L.grid * kt * rows * kn.BK;
        traffic += (n / 32) * sectorsFor(stride) * 32;
        const kFast = Math.abs(sK) !== 0 && (Math.abs(sR) === 0 || Math.abs(sK) <= Math.abs(sR));
        const deg = conflict((t) => { const rr = kFast ? Math.floor(t / kn.BK) : t % rows, kk = kFast ? t % kn.BK : Math.floor(t / rows); return isA ? rr * kn.BK + kk : kk * kn.BN + rr; });
        smemWave += (n / 32) * deg;
      }
    };
    tileLoads(ct.A, kn.BM, ct.mVar, true);
    tileLoads(ct.B, kn.BN, ct.nVar, false);
    // inner-product reads: TM values of A (shared along a row of threads) and TN of B (strided by TN floats)
    const degA = conflict((t) => Math.floor(t / TX) * kn.TM * kn.BK), degB = conflict((t) => (t % TX) * kn.TN);
    smemWave += (L.grid * kt * kn.BK * L.block * (ct.A.length * kn.TM * degA + ct.B.length * kn.TN * degB)) / 32;
    traffic += outBytes;
  }
  const dram = Math.min(traffic, Math.max(uniq + outBytes, traffic * (uniq > t.l2MB * 1048576 ? 0.6 : 0.12)));
  const regs = regsEstimate(kn, [...s.placed.keys()].length);
  const counts = { flops, traffic, dram, smemWavefronts: smemWave, warpInstr, threads: L.block, blocks: L.grid, smem: L.smem, regs };
  return { ...counts, ...timeModel(counts, t) };
}

// MAP=mma (KILN-006). Counts mirror the kernel matMma writes (kernel.js): cooperative tile loads into padded f32
// shared tiles, then per warp and k-step MI·aElems + NI·bElems fragment loads and MI·NI atoms, then the epilogue.
// Bank-conflict degrees come from mma.js, the same function the materializer's padding choice minimizes.
function estimateMma(an, kn, t, plan) {
  const L = launch(an, kn, plan);
  const s = an.sched, ct = an.contraction, op = MMA_OPS[plan.op], lay = mmaSmemLayout(plan.op, kn);
  const Mp = Math.ceil(ct.M / kn.BM) * kn.BM, Np = Math.ceil(ct.N / kn.BN) * kn.BN, Kp = Math.ceil(ct.K / kn.BK) * kn.BK;
  const kt = Kp / kn.BK, warps = L.block / 32, ksteps = Kp / op.k, MI = kn.WM / 16, NI = kn.WN / 8;
  const tensorFlops = 2 * L.batches * Mp * Np * Kp;
  let traffic = 0, smemWave = 0, warpInstr = 0;
  // cooperative tile loads: global reads (coalescing along the faster of k and the row variable), shared stores
  const tileLoads = (x, rows, other, isA) => {
    const f = an.boundedFlat(x.i, x.idx);
    const sK = coefOf(f, ct.C.r), sR = coefOf(f, other);
    const stride = Math.min(Math.abs(sK) || 99, Math.abs(sR) || 99) === 99 ? 0 : Math.min(Math.abs(sK) || 99, Math.abs(sR) || 99);
    const n = L.grid * kt * rows * kn.BK;
    traffic += (n / 32) * sectorsFor(stride) * 32;
    const kFast = Math.abs(sK) !== 0 && (Math.abs(sR) === 0 || Math.abs(sK) <= Math.abs(sR));
    const deg = bankDeg((u) => { const rr = kFast ? Math.floor(u / kn.BK) : u % rows, kk = kFast ? u % kn.BK : Math.floor(u / rows); return isA ? rr * lay.ldA + kk : kk * lay.ldB + rr; });
    smemWave += (n / 32) * deg;
    warpInstr += (n / 32) * 6;                       // index decode, guard, load, select, shared store
  };
  tileLoads(ct.A[0], kn.BM, ct.mVar, true);
  tileLoads(ct.B[0], kn.BN, ct.nVar, false);
  // fragment reads, atoms and (f16/bf16) register packing, per warp and k-step
  const perStep = L.grid * warps * ksteps;
  smemWave += perStep * (MI * lay.degA.reduce((a, d) => a + d, 0) + NI * lay.degB.reduce((a, d) => a + d, 0));
  warpInstr += perStep * (MI * op.aElems + NI * op.bElems + MI * NI + (op.perReg > 1 ? (MI * op.aRegs + NI * op.bRegs) : 0));
  // epilogue: the statements outside the contraction, once per output element (scalar CUDA-core work)
  let epiOps = 0, epiLoads = 0;
  const walk = (ss) => { for (const st of ss) { if (st.s === "for" && st.kind === "free") walk(st.body); else if (st.s === "let") { if (st.e.k === "in") epiLoads++; else epiOps += FNS[st.e.fn]?.flops ?? 1; } } };
  walk(s.stmts);
  const outs = L.batches * Mp * Np;
  const flops = outs * epiOps;
  warpInstr += (outs * (epiOps + epiLoads + 2)) / 32;
  traffic += an.numelOut * 4 * (1 + epiLoads);
  const uniq = an.inShapes.reduce((a, sh) => a + numel(sh) * 4, 0), outBytes = an.numelOut * 4;
  const dram = Math.min(traffic, Math.max(uniq + outBytes, traffic * (uniq > t.l2MB * 1048576 ? 0.6 : 0.12)));
  const regs = regsEstimate(kn, [...s.placed.keys()].length, plan.op);
  const counts = { flops, tensorFlops, tensorTflops: t.mma?.[plan.operand] ?? t.peakTflops, traffic, dram, smemWavefronts: smemWave, warpInstr, threads: L.block, blocks: L.grid, smem: L.smem, regs };
  return { ...counts, ...timeModel(counts, t) };
}
const bankDeg = (addr) => { const banks = new Map(); for (let u = 0; u < 32; u++) { const a = addr(u), b = ((a % 32) + 32) % 32; if (!banks.has(b)) banks.set(b, new Set()); banks.get(b).add(a); } let d = 1; for (const v of banks.values()) d = Math.max(d, v.size); return d; };

// ----------------------------------------------------------------------------- the dialect
export function printTile(an, kn, args, name, plan = null) {
  if (kn.MAP === "flash") return printFlash(an.attention, kn, (i) => args[i] ?? "in" + i);
  const L = launch(an, kn, plan);
  const s = an.sched;
  const R = displayNames(s);
  const buf = (i) => args[i] ?? "in" + i;
  const ix = (e) => IX.print(IX.subst(e, R));
  const op = (o) => (o.ref ?? String(+o.num.toPrecision(6)));
  const lines = [`launch grid=${L.grid} block=${L.block}${L.smem ? ` smem=${L.smem} B` : ""}`];
  const staged = new Map((L.staged || []).map((x) => [x.i, x]));
  const stmt = (st, pad) => {
    if (st.s === "let") return `${pad}${st.name} = ${st.e.k === "in" ? `load ${staged.has(st.e.i) ? buf(st.e.i) + "_smem" : buf(st.e.i)}[${st.e.idx.map(ix).join(", ")}]` : st.e.k === "ix" ? `ix ${ix(st.e.e)} : ${st.e.dtype}` : `${st.e.fn}(${st.e.a.map(op).join(", ")})`}`;
    if (st.s === "init") return `${pad}${st.name} = init(${st.fn})`;
    if (st.s === "acc") return `${pad}${st.name} <- ${st.fn}(${st.name}, ${op(st.val)})`;
    if (st.s === "write") return `${pad}out[${st.idx.map(ix).join(", ")}] = ${op(st.val)}`;
    return null;
  };
  if (an.scan) {
    const sc = an.scan;
    const rowAxes = sc.rowDims.map((d) => `${d.v}:${d.n}`).join(" × ") || "1";
    if (kn.MAP === "thread") lines.push(`Tile(axes=(${rowAxes} → thread, ${kn.TPB}/block${kn.COARSEN > 1 ? `, ${kn.COARSEN} per thread` : ""}); ${sc.v}:${sc.n} serial scan):`);
    else lines.push(`Tile(axes=(${[...sc.rowDims.map((d) => `${d.v}:${d.n}=BLOCK`), `lane:${kn.TPB}=THREAD`].join(", ")}); ${sc.v}:${sc.n} in chunks of ${kn.TPB}, block scan):`);
    const walk = (ss, pad) => {
      for (const st of ss) {
        if (st.s === "for" && st.kind === "free") walk(st.body, pad);
        else if (st.s === "for" && st.kind === "scan") {
          lines.push(kn.MAP === "thread" ? `${pad}for ${st.v} in 0..${st.n}:  # scan, serial` : `${pad}ChunkLoop(${st.v} = c0 + lane; c0 < ${st.n}; c0 += ${kn.TPB}):  # scan`);
          walk(st.body, pad + "    ");
        } else if (st.s === "for") { lines.push(`${pad}for ${R[st.v].v} in 0..${st.n}:  # reduce, serial`); walk(st.body, pad + "    "); }
        else if (st.s === "step") lines.push(kn.MAP === "thread" ? `${pad}${st.name} <~ ${st.fn}(${st.name}, ${op(st.val)})` : `${pad}${st.name} = BlockScan(${op(st.val)}, op=${st.fn}, carry)`);
        else lines.push(stmt(st, pad));
      }
    };
    walk(s.stmts, "    ");
  } else if (kn.MAP === "thread") {
    lines.push(`Tile(axes=(${s.dims.map((d) => `${d.v}:${d.n}`).join(" × ") || "1"} → thread, ${kn.TPB}/block${kn.COARSEN > 1 ? `, ${kn.COARSEN} per thread` : ""})):`);
    const walk = (ss, pad) => { for (const st of ss) { if (st.s === "for" && st.kind === "free") walk(st.body, pad); else if (st.s === "for") { lines.push(`${pad}for ${R[st.v].v} in 0..${st.n}:  # reduce, serial`); walk(st.body, pad + "    "); } else lines.push(stmt(st, pad)); } };
    walk(s.stmts, "    ");
  } else if (kn.MAP === "row") {
    const rowAxes = s.dims.slice(0, an.rd).map((d) => `${d.v}:${d.n}=BLOCK`);
    lines.push(`Tile(axes=(${[...rowAxes, `lane:${kn.TPB}=THREAD`].join(", ")})):`);
    for (const x of L.staged) lines.push(`    ${buf(x.i)}_smem = Stage(${buf(x.i)}, origin=(${IX.print(x.base)}), slab=(${x.len}))`);
    const walk = (ss, pad, depth) => {
      for (const st of ss) {
        if (st.s === "for" && st.kind === "free") {
          if (depth < an.rd) walk(st.body, pad, depth + 1);
          else { const inner = []; let b = st; inner.push(`${b.v}`); lines.push(`${pad}StridedLoop(${st.v} = lane; < ${st.n}; += ${kn.TPB}):  # free`); walk(st.body, pad + "    ", depth + 1); }
        } else if (st.s === "for") {
          if (depth === an.rd) { lines.push(`${pad}StridedLoop(${R[st.v].v} = lane; < ${st.n}; += ${kn.TPB}):  # reduce`); walk(st.body, pad + "    ", 99); lines.push(`${pad}Combine(${st.red}, op=${st.body.at(-1).fn})`); }
          else { lines.push(`${pad}for ${R[st.v].v} in 0..${st.n}:  # reduce`); walk(st.body, pad + "    ", 99); }
        } else lines.push(stmt(st, pad));
      }
    };
    walk(s.stmts, "    ", 0);
  } else if (kn.MAP === "mma") {
    const ct = an.contraction, op = MMA_OPS[plan.op], lay = mmaSmemLayout(plan.op, kn);
    const MI = kn.WM / 16, NI = kn.WN / 8;
    lines.push(`Tile(axes=(${[...ct.batch.map((d) => `${d.v}:${d.n}=BLOCK`), `${ct.mVar}:${ct.M}/${kn.BM}=BLOCK`, `${ct.nVar}:${ct.N}/${kn.BN}=BLOCK`, `warp:${kn.BM / kn.WM}×${kn.BN / kn.WN}=WARP`, "lane:32=LANE"].join(", ")})):`);
    lines.push(`    tensor cores: mma.${plan.op} (${op.m}×${op.n}×${op.k}, ${plan.operand} operands, f32 accumulate); warp tile ${kn.WM}×${kn.WN} = ${MI}×${NI} atoms, ${MI * NI * 4} accumulators per lane`);
    lines.push(`    for k0 in 0..${ct.K} step ${kn.BK}:`);
    lines.push(`        ${buf(plan.a)}_tile = Stage(${buf(plan.a)}[${ct.A[0].idx.map(ix).join(", ")}], ${kn.BM}×${kn.BK}, row stride ${lay.ldA})`);
    lines.push(`        ${buf(plan.b)}_tile = Stage(${buf(plan.b)}[${ct.B[0].idx.map(ix).join(", ")}], ${kn.BK}×${kn.BN}, row stride ${lay.ldB})`);
    lines.push(`        for ks in 0..${kn.BK / op.k}:  # unrolled: ${MI}×${op.aElems} A and ${NI}×${op.bElems} B fragment loads, ${MI * NI} × mma`);
    lines.push("    epilogue (per accumulator element):");
    const walkE = (ss, pad) => { for (const st of ss) { if (st.s === "for" && st.kind === "free") walkE(st.body, pad); else if (st.s !== "for" && st.s !== "init") lines.push(stmt(st, pad)); } };
    walkE(s.stmts, "        ");
  } else {
    const ct = an.contraction;
    lines.push(`Tile(axes=(${[...ct.batch.map((d) => `${d.v}:${d.n}=BLOCK`), `${ct.mVar}:${ct.M}/${kn.BM}=BLOCK`, `${ct.nVar}:${ct.N}/${kn.BN}=BLOCK`, `ty:${kn.BM / kn.TM}=THREAD`, `tx:${kn.BN / kn.TN}=THREAD`].join(", ")})):`);
    lines.push(`    register tile ${kn.TM}×${kn.TN} per thread; ${kn.TM * kn.TN} accumulators`);
    lines.push(`    for k0 in 0..${ct.K} step ${kn.BK}:`);
    for (const a of ct.A) lines.push(`        ${buf(a.i)}_tile = Stage(${buf(a.i)}[${a.idx.map(ix).join(", ")}], ${kn.BM}×${kn.BK})`);
    for (const b of ct.B) lines.push(`        ${buf(b.i)}_tile = Stage(${buf(b.i)}[${b.idx.map(ix).join(", ")}], ${kn.BK}×${kn.BN})`);
    lines.push(`        for kk in 0..${kn.BK}:  # unrolled over the ${kn.TM}×${kn.TN} tile`);
    const walkC = (ss, pad) => { for (const st of ss) { if (st.s === "for" && st.red === undefined && st.kind === "free") walkC(st.body, pad); else if (st.s === "for") { for (const b of st.body) { const l = stmt(b, pad); if (l) lines.push(l); } } } };
    walkC(s.stmts, "            ");
    lines.push("    epilogue (per output element):");
    const walkE = (ss, pad) => { for (const st of ss) { if (st.s === "for" && st.kind === "free") walkE(st.body, pad); else if (st.s !== "for" && st.s !== "init") lines.push(stmt(st, pad)); } };
    walkE(s.stmts, "        ");
  }
  return lines.join("\n");
}

// the printer needs input shapes: they ride on the attrs at schedule time
const analyzeFor = (node) => analyze(node.attrs.expr, node.attrs.shape, node.attrs.inShapes);
/** The tensor-core plan of a scheduled tile.kernel (from its inPrecisions attribute), or null off MAP=mma. */
export const planOf = (node, an = analyzeFor(node)) => (node.attrs.map?.MAP === "mma" ? mmaPlan(an, node.attrs.inPrecisions) : null);
export const tile = k.dialect("tile").describe("Tile IR: a Loop IR kernel plus its GPU mapping")
  .op("kernel", {
    args: { variadic: "ins" },
    // inPrecisions: operandPrecision of the inputs at schedule time (what makes MAP=mma legal; not part of identity)
    attrs: { expr: null, shape: [], outDtype: "f32", name: null, origin: [], map: null, inShapes: [], inDtypes: [], inPrecisions: [] },
    infer: ({ shape, outDtype }) => k.tensor(shape, outDtype),
    print: ({ name, ins, map }) => `tile.kernel ${name || "·"}(${ins})  [${canonRow(map || {})}]`,
    body: ({ args, map, node }) => printTile(analyzeFor(node), map, args, node.attrs.name, planOf(node)),
    identity: ({ expr, shape, args, outDtype }) => hash(`loop|${expr.__key}|${shape.join("x")}|${args.map((a) => inKey(a.type.shape, a.type.dtype)).join(",")}${outDtype && outDtype !== "f32" ? "|out:" + outDtype : ""}`),
    keyIgnore: ["name", "origin", "inPrecisions"],
  });

export const scheduleRule = k.rule("schedule").match(P.op("loop.kernel").as("n")).rewrite(({ n, ctx }) => {
  const inShapes = n.args.map((a) => a.type.shape), inDtypes = n.args.map((a) => a.type.dtype || "f32");
  const an = analyze(n.attrs.expr, n.attrs.shape, inShapes);
  const inPrecisions = operandPrecision(n);
  return forkTree(an, ctx.target, mmaPlan(an, inPrecisions, ctx.target)).leaf((kn) => n.lower(tile.kernel, { ...n.attrs, map: { ...kn }, inShapes, inDtypes, inPrecisions }));
}).describe("fork over GPU mappings (thread, row, tiled, mma, flash) and their knobs; legality only");

// the prior: rank options with the analytic model on the pipeline's target
// A tensor-core option whose rate the target does not know (targets.js mma: null, e.g. GB10 until measured) is not
// ranked against other mappings: the default compile is unchanged until the rate is measured. When MAP=mma is pinned
// (every option is mma) the model still ranks its knobs, with the FP32 peak as a pessimistic tensor rate.
export const costPrior = k.decide.cost(({ knobs, node, ctx, fork }) => {
  if (!node.is("loop.kernel")) return null;
  const an = analyze(node.attrs.expr, node.attrs.shape, node.args.map((a) => a.type.shape));
  if (knobs.MAP !== "mma") return estimate(an, knobs, ctx.target).us;
  const plan = mmaPlan(an, operandPrecision(node), ctx.target);
  if (ctx.target.mma?.[plan.operand] == null && fork?.options?.some((o) => o.knobs.MAP !== "mma")) return Infinity;
  return estimate(an, knobs, ctx.target, plan).us;
}, { name: "model" }).for("schedule");

/** The cheapest option of a Loop IR kernel under the analytic model: { us, knobs, … } over every legal leaf. */
export function bestEstimate(expr, shape, inShapes, t) {
  const an = analyze(expr, shape, inShapes);
  const f = forkTree(an, t).leaf((kn) => kn);
  let best = null;
  const rec = (i, kn) => {
    if (i === f.meta.tree.length) { const e = estimate(an, kn, t); if (!best || e.us < best.us) best = { ...e, knobs: kn }; return; }
    const { p, valuesFn } = f.meta.tree[i];
    for (const v of valuesFn(kn)) rec(i + 1, { ...kn, [p.name]: v });
  };
  rec(0, {});
  return best;
}

/** The analytic model's predicted time (µs) of every scheduled kernel in a Tile IR graph, summed. */
export function predictedCost(tileGraph, t) {
  let us = 0;
  for (const n of tileGraph.nodes.values()) {
    if (n.name !== "tile.kernel") continue;
    const an = analyze(n.attrs.expr, n.attrs.shape, n.attrs.inShapes);
    us += estimate(an, n.attrs.map, t, planOf(n, an)).us;
  }
  return us;
}

export const tilePass = k.pass("tile/schedule").short("t").rules(scheduleRule).knobs(...KNOBS)
  .describe("choose a GPU mapping for every kernel: a fork decided by pins, evidence, then the cost model");
