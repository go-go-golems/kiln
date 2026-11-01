// MAP=flash at the Tile IR (KILN-007): the geometry, legality, cost counts and printed form of the
// flash-attention mapping of a recognized softmax contraction (attention.js). One block owns BR consecutive
// query rows of one batch position; K and V stream through shared memory BC keys at a time; each query row
// is owned by TPR = TPB / BR threads, and each of those keeps DPT = ceil(D / TPR) output columns in registers
// together with the row's running maximum m and sum l (the online softmax). The materializer is
// flash-kernel.js; the inner products are FP32 SIMT products (the `products` field names the seam where a
// tensor-core product can plug in later: KILN-006).
import * as IX from "../core/ix.js";
import { strides } from "../core/util.js";
import { walkE } from "./loop.js";
import { FNS } from "./fns.js";

export const FLASH_BR = [8, 16, 32, 64], FLASH_BC = [16, 32, 64], FLASH_TPB = [64, 128, 256];
const pow2 = (x) => 2 ** Math.ceil(Math.log2(Math.max(1, x)));

/** Shared-memory layout in floats: Q, K row-padded by one (bank conflicts), V, the score tile row-padded. */
export function flashLayout(att, BR, BC) {
  const QS = att.E + 1, KS = att.E + 1, VS = att.D, SS = BC + 1;
  return { QS, KS, VS, SS, sQ: BR * QS, sK: BC * KS, sV: BC * VS, sS: BR * SS };
}
export const flashSmemBytes = (att, BR, BC) => { const l = flashLayout(att, BR, BC); return 4 * (l.sQ + l.sK + l.sV + l.sS); };
export const flashGeometry = (att, kn) => {
  const TPR = kn.TPB / kn.BR, DPT = Math.ceil(att.D / TPR);
  const batches = att.batchVars.reduce((a, v) => a * att.shape[+v.slice(1)], 1);
  const nb = Math.ceil(att.L / kn.BR), tiles = Math.ceil(att.S / kn.BC);
  return { TPR, DPT, batches, nb, tiles, blocks: batches * nb };
};

// option legality, level by level (the fork tree in tile.js asks for each knob given the earlier ones)
export const flashBR = (att) => FLASH_BR.filter((v) => v <= Math.max(8, pow2(att.L)));
export const flashBC = (att, BR, t) => FLASH_BC.filter((v) => v <= Math.max(16, pow2(att.S)) && flashSmemBytes(att, BR, v) <= t.smemPerBlock);
export const flashTPB = (att, BR, BC, t) => FLASH_TPB.filter((T) => {
  if (T > t.maxThreadsPerBlock || T % BR) return false;
  const TPR = T / BR;
  return TPR <= 32 && TPR <= BC && Math.ceil(att.D / TPR) <= 32;
});
/** Every legal (BR, BC, TPB) for a match on a target; empty when MAP=flash cannot run it. */
export function flashOptions(att, t) {
  const out = [];
  for (const BR of flashBR(att)) for (const BC of flashBC(att, BR, t)) for (const TPB of flashTPB(att, BR, BC, t)) out.push({ BR, BC, TPB });
  return out;
}
export const flashLegal = (att, t) => !!t && flashOptions(att, t).length > 0;

export function flashLaunch(att, kn) {
  const g = flashGeometry(att, kn);
  return { grid: g.blocks, block: kn.TPB, smem: flashSmemBytes(att, kn.BR, kn.BC), ...g };
}

// ----------------------------------------------------------------------------- counts for the cost model
const flatOf = (idx, shape) => { const st = strides(shape); return idx.reduce((acc, e, j) => acc.add(IX.lift(e).mul(st[j])), IX.C(0)); };
const sectorsFor = (stride) => { const s = Math.abs(stride); return s === 0 ? 1 : Math.min(32, 4 * s); };
// bytes moved per element read by a warp whose lanes step `v`, summed over a fragment's loads, and its flops
function fragment(x, inShapes, v) {
  let bytes = 0, flops = 0;
  walkE(x, (n) => {
    if (n.k === "in" && n.i >= 0) {
      const a = IX.affine(flatOf(n.idx, inShapes[n.i]), [...IX.vars(flatOf(n.idx, inShapes[n.i]))]);
      bytes += sectorsFor(a ? a.k[v] || 0 : 8);
    } else if (n.k === "op") flops += FNS[n.fn]?.flops ?? 1;
  });
  return { bytes, flops };
}
// the most distinct shared addresses in one bank over a warp's 32 lanes
const conflict = (addr) => { const banks = new Map(); for (let t = 0; t < 32; t++) { const a = addr(t), b = ((a % 32) + 32) % 32; if (!banks.has(b)) banks.set(b, new Set()); banks.get(b).add(a); } let d = 1; for (const s of banks.values()) d = Math.max(d, s.size); return d; };

/** Analytic counts for one MAP=flash option (the shape of the kernel flash-kernel.js writes). */
export function flashCounts(att, kn) {
  const { BR, BC, TPB } = kn;
  const g = flashGeometry(att, kn), lay = flashLayout(att, BR, BC);
  const { E: Ed, D } = att;
  const fA = fragment(att.A, att.inShapes, "__e"), fB = fragment(att.B, att.inShapes, "__e"), fV = fragment(att.V, att.inShapes, att.dVar);
  const fE = fragment(att.epi, att.inShapes, "__j"), fP = fragment(att.post, att.inShapes, att.dVar);
  const B = g.blocks, T = g.tiles;
  const rows = B * BR, scores = B * T * BR * BC;
  // per thread and key tile: the row maximum (BC), the probabilities (sub, exp, select, add: 11) and the P·V update
  const perThreadTile = BC * (1 + 11) + BC * g.DPT * 2 + g.DPT + 12;
  const flops = B * BR * Ed * fA.flops + B * T * BC * (Ed * fB.flops + D * fV.flops)
    + scores * (2 * Ed + fE.flops) + B * T * TPB * perThreadTile + rows * g.TPR * g.DPT * (4 + fP.flops);
  const traffic = B * BR * Ed * fA.bytes + B * T * BC * (Ed * fB.bytes + D * fV.bytes) + scores * fE.bytes
    + rows * D * (4 + fP.bytes);
  // shared memory: stores of the Q, K, V and score tiles; inner-product reads of Q and K; the per-thread
  // sweeps over the score row and the V tile (lanes of a row read consecutive columns, rows broadcast)
  const sStore = conflict((t) => Math.floor(t / g.TPR) * lay.SS + (t % g.TPR));
  const smemWavefronts = (B * BR * Ed + B * T * BC * (Ed + D)) / 32 + (scores / 32) * sStore
    + (scores * Ed * 2) / 32 + (B * T * TPB * (2 * BC + BC * g.DPT)) / 32;
  const warpInstr = (flops + B * T * TPB * (2 * BC + BC * g.DPT) + scores * Ed * 2) / 32 + traffic / 128;
  return { flops, traffic, smemWavefronts, warpInstr, threads: TPB, blocks: B, smem: flashSmemBytes(att, BR, BC), regs: 32 + g.DPT * 2 };
}

// ----------------------------------------------------------------------------- printing
export function printFlash(att, kn, buf = (i) => "in" + i) {
  const g = flashLaunch(att, kn);
  const P = (x) => printFrag(x, buf);
  return [
    `launch grid=${g.grid} block=${g.block} smem=${g.smem} B`,
    `Tile(axes=(${att.batchVars.map((v) => `${v}:${att.shape[+v.slice(1)]}=BLOCK`).concat([`${att.iVar}:${att.L}/${kn.BR}=BLOCK`, `row:${kn.BR}×lane:${g.TPR}=THREAD`]).join(", ")})):  # flash attention, online softmax`,
    `    Q tile [${kn.BR}×${att.E}] = Stage(${P(att.A)})`,
    `    m = -inf, l = 0, acc[${g.DPT}] = 0 per thread (columns ${att.dVar} = lane + q·${g.TPR})`,
    `    for j0 in 0..${att.S} step ${kn.BC}:`,
    `        K tile [${kn.BC}×${att.E}] = Stage(${P(att.B)}),  V tile [${kn.BC}×${att.D}] = Stage(${P(att.V)})`,
    `        S tile [${kn.BR}×${kn.BC}] = ${P(att.epi).replace("in-2[]", `Σ_e<${att.E} ${att.dotFn}(Q, K)`)}`,
    `        m' = max(m, rowmax S);  α = exp(m − m');  p = exp(S − m')`,
    `        l = α·l + Σ p;  acc = α·acc + Σ p·V;  m = m'`,
    `    out = ${P(att.post).replace("in-1[]", "acc / l")}`,
  ].join("\n");
}
function printFrag(x, buf) {
  switch (x.k) {
    case "num": return String(+x.v.toPrecision(6));
    case "in": return x.i < 0 ? `in${x.i}[]` : `${buf(x.i)}[${x.idx.map((e) => IX.print(e)).join(", ")}]`;
    case "op": return `${x.fn}(${x.a.map((a) => printFrag(a, buf)).join(", ")})`;
    default: return "…";
  }
}
