// Tile IR: how a Loop IR kernel maps onto a GPU. A schedule rule forks over three strategies and
// their knobs; legality (threads, shared memory) narrows the options, and nothing else does:
//   MAP=thread  one thread per output element; reductions run serially per thread
//   MAP=row     one block per row; threads cooperate on each row reduction (strided loop + tree combine)
//               and on the row's elementwise sweep; STAGE puts the row's inputs in shared memory
//   MAP=tiled   a contraction tiled into BM×BN output tiles with BK-deep shared-memory slabs and a
//               TM×TN register tile per thread (generalized matmul: any body, any epilogue)
import { k, P, KilnError } from "../core/kiln.js";
import { numel, strides, hash, inKey } from "../core/util.js";
import * as IX from "../core/ix.js";
import { schedule, free, printNest, displayNames, workOf } from "./loop.js";
import { FNS } from "./fns.js";

// ----------------------------------------------------------------------------- knobs
export const MAP = k.param.enum("MAP", ["thread", "row", "tiled"], { off: "thread" }).group("schedule").help("how the kernel maps onto the GPU");
export const TPB = k.param.enum("TPB", [32, 64, 128, 256, 512, 1024], { off: 0, default: 256 }).group("schedule").help("threads per block");
export const COARSEN = k.param.enum("COARSEN", [1, 2, 4], { off: 1 }).group("schedule").help("outputs per thread (thread map)");
export const STAGE = k.param.enum("STAGE", ["none", "reused", "all"], { off: "none" }).group("schedule").help("stage row inputs in shared memory (row map)");
export const BM = k.param.enum("BM", [16, 32, 64, 128], { off: 0 }).group("tile").help("output tile rows");
export const BN = k.param.enum("BN", [16, 32, 64, 128], { off: 0 }).group("tile").help("output tile columns");
export const BK = k.param.enum("BK", [8, 16, 32], { off: 0 }).group("tile").help("reduction slab depth");
export const TM = k.param.enum("TM", [1, 2, 4, 8], { off: 1 }).group("tile").help("register tile rows per thread");
export const TN = k.param.enum("TN", [1, 2, 4, 8], { off: 1 }).group("tile").help("register tile columns per thread");
export const KNOBS = [MAP, TPB, COARSEN, STAGE, BM, BN, BK, TM, TN];
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
  const an = { sched: s, n, dims: s.dims, shape, inShapes, numelOut, rd, rows: null, inner: null, contraction: null, stage: [], flat: (i, idx) => flatOf(idx, inShapes[i]) };
  if (rd != null) {
    an.rows = s.dims.slice(0, rd).reduce((a, d) => a * d.n, 1);
    an.inner = s.dims.slice(rd).reduce((a, d) => a * d.n, 1);
    an.rowVars = s.dims.slice(0, rd).map((d) => d.v);
    an.rowReds = outReds.filter((r) => scopeDepth(s.placed.get(r)) === rd);
    an.maxExtent = Math.max(an.inner, ...an.rowReds.map((r) => r.n));
    // stageable inputs: every load is base(row) + v with one loop variable and the same extent
    const byIn = new Map();
    for (const L of s.loads) { if (!byIn.has(L.i)) byIn.set(L.i, []); byIn.get(L.i).push(L); }
    const extentOf = (v) => s.reds.find((r) => r.r === v)?.n ?? s.dims.find((d) => d.v === v)?.n;
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
        const ext = extentOf(v);
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
      let ok = !inC.some((x) => x.k === "red");
      // the tiled materializer emits the loop body from tile operands and accumulators only: a value the body
      // reads from an outer scope (hoisted by code motion, like p[i] in Σ_j (p[j] − p[i])·w[i,j]) has no home there
      const isNode = (a) => a && typeof a === "object" && (a.k === "in" || a.k === "op" || a.k === "red");
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
  AN.set(expr, { key, an });
  return an;
}

export function legalMaps(an) {
  const out = ["thread"];
  if (an.rd != null) out.push("row");
  if (an.contraction) out.push("tiled");
  return out;
}
export function forkTree(an, t) {
  const maxT = t.maxThreadsPerBlock;
  const smemMax = t.smemPerBlock;
  const ct = an.contraction;
  const nA = ct ? ct.A.length : 0, nB = ct ? ct.B.length : 0;
  return k.fork.tree()
    .level(MAP, () => legalMaps(an))
    .level(TPB, (kn) => (kn.MAP === "thread" ? [64, 128, 256, 512, 1024].filter((v) => v <= maxT) : kn.MAP === "row" ? [32, 64, 128, 256, 512, 1024].filter((v) => v <= maxT && v <= Math.max(32, pow2(an.maxExtent) * 2)) : [0]))
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
    .level(BM, (kn) => (kn.MAP === "tiled" ? [16, 32, 64, 128].filter((v) => v <= Math.max(16, pow2(ct.M))) : [0]))
    .level(BN, (kn) => (kn.MAP === "tiled" ? [16, 32, 64, 128].filter((v) => v <= Math.max(16, pow2(ct.N))) : [0]))
    .level(BK, (kn) => (kn.MAP === "tiled" ? [8, 16, 32].filter((v) => v <= Math.max(8, pow2(ct.K)) && (nA * kn.BM + nB * kn.BN) * v * 4 <= smemMax) : [0]))
    .level(TM, (kn) => (kn.MAP === "tiled" ? [1, 2, 4, 8].filter((v) => kn.BM % v === 0) : [1]))
    .level(TN, (kn) => (kn.MAP === "tiled" ? [1, 2, 4, 8].filter((v) => { const th = (kn.BM / kn.TM) * (kn.BN / v); return kn.BN % v === 0 && th >= 32 && th <= maxT; }) : [1]));
}

// ----------------------------------------------------------------------------- launch geometry
export function launch(an, kn) {
  if (kn.MAP === "row") {
    const st = stagedOf(an, kn);
    return { grid: an.rows, block: kn.TPB, smem: (st.reduce((a, s) => a + s.len, 0) + (an.rowReds.length ? kn.TPB : 0)) * 4, staged: st };
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
export const regsEstimate = (kn, values) => (kn.MAP === "tiled" ? 24 + kn.TM * kn.TN + kn.TM + kn.TN : 20 + Math.min(40, Math.ceil(values / 2)));
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
    l2: c.traffic / perUs(3 * t.bwGBs),
    compute: c.flops / (t.peakTflops * 1e6),
    smem: c.smemWavefronts / (t.sms * perUs(t.clockGHz)),
    issue: c.warpInstr / (t.sms * 4 * perUs(t.clockGHz)),
  };
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
const coefOf = (f, v) => { const a = IX.affine(f, [...IX.vars(f)]); return a ? a.k[v] || 0 : 8; };

// analytic counts for one option: the prior the greedy compile ranks with
export function estimate(an, kn, t) {
  const L = launch(an, kn);
  const s = an.sched;
  let flops = 0, traffic = 0, warpInstr = 0, smemWave = 0;
  const outBytes = an.numelOut * 4;
  const uniq = an.inShapes.reduce((a, sh) => a + numel(sh) * 4, 0);
  const lastV = an.dims.length ? an.dims[an.dims.length - 1].v : null;
  const fl = (st) => (st.e?.k === "op" ? FNS[st.e.fn]?.flops ?? 1 : 0);
  const access = (trips, fvar, st, staged) => {
    if (staged) { smemWave += trips / 32; return; }
    const f = an.flat(st.e.i, st.e.idx);
    const stride = fvar ? coefOf(f, fvar) : 0;
    traffic += (trips / 32) * sectorsFor(stride) * 32;
  };
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
        const f = an.flat(x.i, x.idx);
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

// ----------------------------------------------------------------------------- the dialect
export function printTile(an, kn, args, name) {
  const L = launch(an, kn);
  const s = an.sched;
  const R = displayNames(s);
  const buf = (i) => args[i] ?? "in" + i;
  const ix = (e) => IX.print(IX.subst(e, R));
  const op = (o) => (o.ref ?? String(+o.num.toPrecision(6)));
  const lines = [`launch grid=${L.grid} block=${L.block}${L.smem ? ` smem=${L.smem} B` : ""}`];
  const staged = new Map((L.staged || []).map((x) => [x.i, x]));
  const stmt = (st, pad) => {
    if (st.s === "let") return `${pad}${st.name} = ${st.e.k === "in" ? `load ${staged.has(st.e.i) ? buf(st.e.i) + "_smem" : buf(st.e.i)}[${st.e.idx.map(ix).join(", ")}]` : `${st.e.fn}(${st.e.a.map(op).join(", ")})`}`;
    if (st.s === "init") return `${pad}${st.name} = init(${st.fn})`;
    if (st.s === "acc") return `${pad}${st.name} <- ${st.fn}(${st.name}, ${op(st.val)})`;
    if (st.s === "write") return `${pad}out[${st.idx.map(ix).join(", ")}] = ${op(st.val)}`;
    return null;
  };
  if (kn.MAP === "thread") {
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
export const tile = k.dialect("tile").describe("Tile IR: a Loop IR kernel plus its GPU mapping")
  .op("kernel", {
    args: { variadic: "ins" },
    attrs: { expr: null, shape: [], outDtype: "f32", name: null, origin: [], map: null, inShapes: [], inDtypes: [] },
    infer: ({ shape, outDtype }) => k.tensor(shape, outDtype),
    print: ({ name, ins, map }) => `tile.kernel ${name || "·"}(${ins})  [${canonRow(map || {})}]`,
    body: ({ args, map, node }) => printTile(analyzeFor(node), map, args, node.attrs.name),
    identity: ({ expr, shape, args, outDtype }) => hash(`loop|${expr.__key}|${shape.join("x")}|${args.map((a) => inKey(a.type.shape, a.type.dtype)).join(",")}${outDtype && outDtype !== "f32" ? "|out:" + outDtype : ""}`),
    keyIgnore: ["name", "origin"],
  });

export const scheduleRule = k.rule("schedule").match(P.op("loop.kernel").as("n")).rewrite(({ n, ctx }) => {
  const inShapes = n.args.map((a) => a.type.shape), inDtypes = n.args.map((a) => a.type.dtype || "f32");
  const an = analyze(n.attrs.expr, n.attrs.shape, inShapes);
  return forkTree(an, ctx.target).leaf((kn) => n.lower(tile.kernel, { ...n.attrs, map: { ...kn }, inShapes, inDtypes }));
}).describe("fork over GPU mappings (thread, row, tiled) and their knobs; legality only");

// the prior: rank options with the analytic model on the pipeline's target
export const costPrior = k.decide.cost(({ knobs, node, ctx }) => {
  if (!node.is("loop.kernel")) return null;
  const an = analyze(node.attrs.expr, node.attrs.shape, node.args.map((a) => a.type.shape));
  return estimate(an, knobs, ctx.target).us;
}, { name: "model" }).for("schedule");

/** The analytic model's predicted time (µs) of every scheduled kernel in a Tile IR graph, summed. */
export function predictedCost(tileGraph, t) {
  let us = 0;
  for (const n of tileGraph.nodes.values()) {
    if (n.name !== "tile.kernel") continue;
    us += estimate(analyze(n.attrs.expr, n.attrs.shape, n.attrs.inShapes), n.attrs.map, t).us;
  }
  return us;
}

export const tilePass = k.pass("tile/schedule").short("t").rules(scheduleRule).knobs(...KNOBS)
  .describe("choose a GPU mapping for every kernel: a fork decided by pins, evidence, then the cost model");
