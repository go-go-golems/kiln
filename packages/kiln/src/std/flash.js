// MAP=flash at the Tile IR (KILN-007): the geometry, legality, cost counts and printed form of the
// flash-attention mapping of a recognized softmax contraction (attention.js). One block owns BR consecutive
// query rows of one batch position; K and V stream through shared memory BC keys at a time. Threads form
// G = BR / RM row groups of TPR lanes; each thread keeps an RM × KN tile of scores and an RM × DPT tile of
// output accumulators in registers (KN = BC / TPR keys, DPT = ceil(D / TPR) columns), with every owned row's
// running maximum m and sum l: the online softmax. Register tiling is what keeps the kernel from being bound
// by shared memory: a loaded Q or P value feeds KN or DPT products, a loaded K or V value RM products.
// The materializer is flash-kernel.js; its products are FP32 SIMT (the `products` seam there is where a
// tensor-core product can plug in later: KILN-006).
import * as IX from "../core/ix.js";
import { strides } from "../core/util.js";
import { walkE } from "./loop.js";
import { FNS } from "./fns.js";

export const FLASH_BR = [8, 16, 32, 64], FLASH_BC = [16, 32, 64], FLASH_TPB = [64, 128, 256], FLASH_RM = [1, 2, 4];
const pow2 = (x) => 2 ** Math.ceil(Math.log2(Math.max(1, x)));

// Threads: G = BR / RM row groups of TPR = TPB / G lanes. Lane `lane` of group g owns rows g + k·G (k < RM),
// the keys lane + n·TPR (n < KN = BC / TPR) of every score tile, and the columns lane + q·TPR (q < DPT).
export const flashGeometry = (att, kn) => {
  const RM = kn.RM || 1, G = kn.BR / RM, TPR = kn.TPB / G, KN = kn.BC / TPR, DPT = Math.ceil(att.D / TPR);
  const batches = att.batchVars.reduce((a, v) => a * att.shape[+v.slice(1)], 1);
  const nb = Math.ceil(att.L / kn.BR), tiles = Math.ceil(att.S / kn.BC);
  return { RM, G, TPR, KN, DPT, batches, nb, tiles, blocks: batches * nb };
};
/** Shared-memory layout in floats: Q, K and V tiles, the probability tile sP, and each lane's partial row
 *  maxima sM (TPR per row). Row strides make a warp's accesses fall in distinct banks: Q and K rows are read by
 *  different row groups (and lanes) at one e, so their stride is odd; probability rows are written at
 *  (g, lane) and read at (g, c), so their stride is ≡ TPR (mod 32). */
export function flashLayout(att, BR, BC, TPR = 1) {
  const QS = att.E + 1, KS = att.E + 1, VS = att.D, SS = BC + ((((TPR - BC) % 32) + 32) % 32);
  return { QS, KS, VS, SS, sQ: BR * QS, sK: BC * KS, sV: BC * VS, sP: BR * SS, sM: BR * TPR };
}
const smemOf = (l) => 4 * (l.sQ + l.sK + l.sV + l.sP + l.sM);
export const flashSmemBytes = (att, kn) => smemOf(flashLayout(att, kn.BR, kn.BC, flashGeometry(att, kn).TPR));

// option legality, level by level (the fork tree in tile.js asks for each knob given the earlier ones)
export const flashBR = (att) => FLASH_BR.filter((v) => v <= Math.max(8, pow2(att.L)));
// the smallest layout a (BR, BC) admits (TPR = 1): BC is legal when some TPB fits
export const flashBC = (att, BR, t) => FLASH_BC.filter((v) => v <= Math.max(16, pow2(att.S)) && smemOf(flashLayout(att, BR, v, 1)) <= t.smemPerBlock);
export const flashRM = (att, BR) => FLASH_RM.filter((v) => BR % v === 0 && v <= BR);
export const flashTPB = (att, BR, BC, RM, t) => FLASH_TPB.filter((T) => {
  const G = BR / RM;
  if (T > t.maxThreadsPerBlock || T % G) return false;
  const TPR = T / G, KN = BC / TPR, DPT = Math.ceil(att.D / TPR);
  // register budget: RM·KN scores and RM·DPT accumulators per thread
  return TPR <= 32 && Number.isInteger(KN) && KN >= 1 && RM * KN <= 16 && RM * DPT <= 64 && smemOf(flashLayout(att, BR, BC, TPR)) <= t.smemPerBlock;
});
/** Every legal (BR, BC, RM, TPB) for a match on a target; empty when MAP=flash cannot run it. */
export function flashOptions(att, t) {
  const out = [];
  for (const BR of flashBR(att)) for (const BC of flashBC(att, BR, t)) for (const RM of flashRM(att, BR)) for (const TPB of flashTPB(att, BR, BC, RM, t)) out.push({ BR, BC, RM, TPB });
  return out;
}
export const flashLegal = (att, t) => !!t && flashOptions(att, t).length > 0;

export function flashLaunch(att, kn) {
  const g = flashGeometry(att, kn);
  return { grid: g.blocks, block: kn.TPB, smem: flashSmemBytes(att, kn), ...g };
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

/** Analytic counts for one MAP=flash option (the shape of the kernel flash-kernel.js writes). */
export function flashCounts(att, kn) {
  const { BR, BC, TPB } = kn;
  const g = flashGeometry(att, kn), lay = flashLayout(att, BR, BC, g.TPR);
  const { E: Ed, D } = att;
  const { RM, KN, DPT, TPR } = g;
  const fA = fragment(att.A, att.inShapes, "__e"), fB = fragment(att.B, att.inShapes, "__e"), fV = fragment(att.V, att.inShapes, att.dVar);
  const fE = fragment(att.epi, att.inShapes, "__j"), fP = fragment(att.post, att.inShapes, att.dVar);
  const B = g.blocks, T = g.tiles, threadTiles = B * T * TPB;
  const rows = B * BR, scores = B * T * BR * BC;
  // per thread and key tile: RM·KN inner products of length E; the row maxima (RM·(KN + TPR)), RM·KN
  // probabilities (sub, exp, select: 10) and the P·V update (RM·DPT products per key, RM sums)
  const perThreadTile = RM * KN * 2 * Ed + RM * (KN + TPR) + RM * KN * 10 + RM * (DPT + 1) * 2 + BC * RM * (DPT * 2 + 1);
  const flops = B * BR * Ed * fA.flops + B * T * BC * (Ed * fB.flops + D * fV.flops) + scores * fE.flops
    + threadTiles * perThreadTile + rows * TPR * DPT * (4 + fP.flops);
  const traffic = B * BR * Ed * fA.bytes + B * T * BC * (Ed * fB.bytes + D * fV.bytes) + scores * fE.bytes
    + rows * D * (4 + fP.bytes);
  // shared memory, in warp requests (a request whose lanes hit distinct banks or one broadcast address is
  // one wavefront; the layout's strides make every access below conflict-free): tile stores, then per thread
  // and tile the score reads (E·(RM + KN)), the partial maxima (RM stores, RM·TPR reads), the probability
  // stores (RM·KN) and the P·V reads (BC·(RM + DPT))
  const perThreadSmem = Ed * (RM + KN) + RM * (1 + TPR) + RM * KN + BC * (RM + DPT);
  const smemWavefronts = (B * BR * Ed + B * T * BC * (Ed + D)) / 32 + (threadTiles * perThreadSmem) / 32;
  const warpInstr = (flops / 2 + threadTiles * perThreadSmem) / 32 + traffic / 128;
  return { flops, traffic, smemWavefronts, warpInstr, threads: TPB, blocks: B, smem: flashSmemBytes(att, kn), regs: Math.min(255, 32 + RM * (KN + DPT) + DPT) };
}

// ----------------------------------------------------------------------------- printing
export function printFlash(att, kn, buf = (i) => "in" + i) {
  const g = flashLaunch(att, kn);
  const P = (x) => printFrag(x, buf);
  return [
    `launch grid=${g.grid} block=${g.block} smem=${g.smem} B`,
    `Tile(axes=(${att.batchVars.map((v) => `${v}:${att.shape[+v.slice(1)]}=BLOCK`).concat([`${att.iVar}:${att.L}/${kn.BR}=BLOCK`, `group:${g.G}×lane:${g.TPR}=THREAD`]).join(", ")})):  # flash attention, online softmax`,
    `    Q tile [${kn.BR}×${att.E}] = Stage(${P(att.A)})`,
    `    per thread: rows g + k·${g.G} (k < ${g.RM}), keys lane + n·${g.TPR} (n < ${g.KN}), columns ${att.dVar} = lane + q·${g.TPR} (q < ${g.DPT})`,
    `    m = -inf, l = 0 per row; acc[${g.RM}×${g.DPT}] = 0`,
    `    for j0 in 0..${att.S} step ${kn.BC}:`,
    `        K tile [${kn.BC}×${att.E}] = Stage(${P(att.B)}),  V tile [${kn.BC}×${att.D}] = Stage(${P(att.V)})`,
    `        S tile [${kn.BR}×${kn.BC}] = ${P(att.epi).replace("in-2[]", `Σ_e<${att.E} ${att.dotFn}(Q, K)`)}`,
    `        m' = max(m, rowmax S);  α = exp(m − m');  P tile = exp(S − m')`,
    `        l = α·l + Σ P;  acc = α·acc + P·V;  m = m'`,
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
