// MAP=flash at the Kernel IR (KILN-007): the online-softmax attention kernel, spelled out as threads, shared
// memory and barriers with the KB builder, so the CUDA, WGSL and simulator emitters need nothing new.
//
//   block  = (batch position, row block rb); thread = (row group g = tid / TPR, lane = tid % TPR)
//   rows r_k = g + k·G (k < RM), keys c_n = lane + n·TPR (n < KN), columns d_q = lane + q·TPR (q < DPT)
//   sQ ← A(i, e) for the block's BR rows                                                        sync
//   m_k = −inf, l_k = 0, acc_kq = 0
//   for j0 in 0..S step BC:
//       sK ← B(j, e), sV ← V(j, d) for the tile's BC keys                                         sync
//       s_kn = epi(Σ_e sQ[r_k, e]·sK[c_n, e]) in registers; sM[r_k, lane] = max_n s_kn           sync
//       m'_k = max(m_k, max_t sM[r_k, t]); α_k = exp(m_k − m'_k); sP[r_k, c_n] = exp(s_kn − m'_k)
//       l_k = α_k·l_k, acc_kq = α_k·acc_kq                                                      sync
//       for c: p_k = sP[r_k, c]; l_k += p_k; acc_kq += p_k·sV[c, d_q]; then m_k = m'_k           sync
//   out = post(acc_kq / l_k)
//
// The maximum is exact in any order, so the per-lane partial maxima give every lane of a row group the same
// m'_k; every lane computes α_k from it, and sums
// l_k over the same sP row in the same order, so all copies agree bit for bit. A row whose scores are all
// −inf keeps p = 0 and α = 1 (a guard on m' > −inf) and ends in 0 / 0 = NaN, which is what the three-pass
// reference of a plain softmax computes; under N.safeSoftmax (the importer's SDPA) m starts at the floor
// −FLT_MAX and the sum is floored at FLT_MIN, so that row is 0, as in PyTorch. Both products are FP32 SIMT in the expression's own spelling (dotFn, pvFn: mul or
// mul_rn); `products` is the seam where a tensor-core implementation (KILN-006) can replace the score tile
// and the P·V update.
import { KilnError } from "../core/kiln.js";
import * as IX from "../core/ix.js";
import { strides } from "../core/util.js";
import { reducer } from "./fns.js";
import { KB, kx } from "./kernel.js";
import { flashGeometry, flashLayout } from "./flash.js";

const V = IX.V, C = IX.C;
// kernel.js imports this module (a cycle): nothing here may touch KB or kx at module evaluation
const NEG_INF = Object.freeze({ k: "num", v: -Infinity });

// emit a reduction-free Loop IR fragment under an index environment; `leaves` binds marker nodes to values
function emitFrag(kb, an, x, env, leaves = new Map()) {
  const memo = new Map();
  const go = (n) => {
    if (leaves.has(n)) return leaves.get(n);
    if (memo.has(n)) return memo.get(n);
    let v;
    // a literal keeps KILN-011's exact int64 digits; an index value (KILN-010: a causal mask j <= i) is the
    // integer expression under this fragment's coordinates, as kernel.js emitNest spells it
    if (n.k === "num") v = kx.num(n.exact != null ? BigInt(n.exact) : n.v);
    else if (n.k === "ix") v = kx.v(kb.let(kx.ix(IX.subst(n.e, env), n.dtype)));
    else if (n.k === "in") {
      if (n.i < 0) throw new KilnError("MaterializeError", "an unbound marker in a flash fragment");
      v = kx.v(kb.load(n.i, an.flat(n.i, n.idx.map((e) => IX.subst(e, env)))));
    } else if (n.k === "op") v = kx.v(kb.let(kx.op(n.fn, ...n.a.map(go))));
    else throw new KilnError("MaterializeError", "a reduction inside a flash fragment");
    memo.set(n, v);
    return v;
  };
  return go(x);
}
// `fn` under a bounds condition, or unconditionally when every condition is statically true (false entries)
const guarded = (kb, conds, fn) => { const cs = conds.filter(Boolean); if (!cs.length) return fn(); kb.if(cs.reduce((a, b) => a.and(b)), fn); };

// ----------------------------------------------------------------------------- the product seam
// matFlash is written against two product operations, so that a tensor-core implementation (KILN-006's
// kernel.js mmaAccumulators / mmaWarpStep / mmaAccElements) can replace the FP32 SIMT one without touching the
// online softmax:
//   scores(kb, ctx) → [{ slot, row, key, value }]  the raw inner products this thread holds: `slot` indexes
//        ctx.rows (the rows whose statistics m, l this thread keeps), `row`/`key` are Ix within the block's
//        row tile and the key tile, `value` a kx value. Called unguarded by every thread (the mma contract:
//        all 32 lanes active). The SIMT form returns RM × KN elements; an mma form returns mmaAccElements.
//   pv(kb, ctx)  the whole P·V update of one key tile from shared sP (row-major [row][key], stride lay.SS)
//        and sV (row-major [key][d], stride lay.VS) into ctx.acc[slot][q] and the sums ctx.l[slot].
//        Because P goes through sP, the accumulator layout of the first product never has to match the
//        A-operand layout of the second (the known gap for chaining two mma products).
// Remaining work for an mma form (not done here): an mma thread geometry in flash.js (warps per row tile
// instead of TPR lanes per row group), a K tile staged [e][key] (the B-operand layout mmaWarpStep reads),
// and per-row partial maxima keyed by the accumulator element's row instead of (row group, lane).

/** The RM × KN score tile of one thread: dot[k][n] = Σ_e sQ[r_k, e] · sK[c_n, e], sequential in e (as the
 *  reference sums), each loaded Q value feeding KN products and each K value RM products. */
function scoresSimt(kb, { att, lay, rows, keys }) {
  const init = kx.num(reducer(att.accFn).init), add = reducer(att.accFn).op;
  const dot = rows.map((_, k) => keys.map((_, n) => kb.let(init, `d${k}_${n}`)));
  kb.for("e", 0, att.E, 1, (e) => {
    const q = rows.map((r, k) => kb.sload("sQ", r.mul(lay.QS).add(e), `q${k}`));
    const kv = keys.map((c, n) => kb.sload("sK", c.mul(lay.KS).add(e), `k${n}`));
    rows.forEach((_, k) => keys.forEach((_, n) => {
      const p = kb.let(kx.op(att.dotFn, kx.v(q[k]), kx.v(kv[n])), `qk${k}_${n}`);
      kb.let(kx.op(add, kx.v(dot[k][n]), kx.v(p)), dot[k][n]);
    }));
  });
  return rows.flatMap((r, k) => keys.map((c, n) => ({ slot: k, row: r, key: c, value: kx.v(dot[k][n]) })));
}
/** The P·V update of one key tile: for each key c, l_k += p_k; acc[k][q] += p_k · sV[c, d_q] (each V value
 *  feeds RM products, each P value DPT). */
function pvSimt(kb, { att, lay, BC, rows, cols, l, acc, colOk }) {
  kb.for("cp", 0, BC, 1, (c) => {
    const p = rows.map((r, k) => kb.sload("sP", r.mul(lay.SS).add(c), `p${k}`));
    rows.forEach((_, k) => kb.let(kx.op(att.addFn, kx.v(l[k]), kx.v(p[k])), l[k]));
    cols.forEach((d, q) => guarded(kb, [colOk(q)], () => {
      const v = kb.sload("sV", c.mul(lay.VS).add(d), `v${q}`);
      rows.forEach((_, k) => {
        const pv = kb.let(kx.op(att.pvFn, kx.v(p[k]), kx.v(v)), `pv${k}_${q}`);
        kb.let(kx.op(att.addFn, kx.v(acc[k][q]), kx.v(pv)), acc[k][q]);
      });
    }));
  });
}
export const products = { simt: { scores: scoresSimt, pv: pvSimt } };

export function matFlash(an, kn) {
  const att = an.attention;
  if (!att) throw new KilnError("MaterializeError", "MAP=flash on a kernel that is not a recognized softmax contraction");
  const kb = new KB();
  const { BR, BC, TPB: T } = kn;
  const g = flashGeometry(att, kn), lay = flashLayout(att, BR, BC, g.TPR);
  const { RM, G, TPR, KN, DPT, nb } = g;
  const { L, S, D, E } = att;
  const raggedL = L % BR !== 0, raggedS = S % BC !== 0, raggedD = D % TPR !== 0;
  const prod = products.simt;
  // block and thread coordinates
  const rb = kb.int(V("bid").mod(nb), "rb");
  const benv = {};
  if (att.batchVars.length) {
    const bz = kb.int(V("bid").div(nb), "bz");
    let stride = 1;
    for (let q = att.batchVars.length - 1; q >= 0; q--) {
      const v = att.batchVars[q], n = att.shape[+v.slice(1)];
      benv[v] = kb.int(q === 0 ? bz.div(stride) : bz.div(stride).mod(n), "b" + v);
      stride *= n;
    }
  }
  const grp = kb.int(V("tid").div(TPR), "grp"), lane = kb.int(V("tid").mod(TPR), "lane");
  const rows = Array.from({ length: RM }, (_, k) => kb.int(grp.add(k * G), `r${k}`));
  const qi = rows.map((r, k) => kb.int(rb.mul(BR).add(r), `qi${k}`));
  const cols = Array.from({ length: DPT }, (_, q) => lane.add(q * TPR));
  const colOk = (q) => raggedD && cols[q].lt(D);
  for (const [name, size] of [["sQ", lay.sQ], ["sK", lay.sK], ["sV", lay.sV], ["sP", lay.sP], ["sM", lay.sM]]) kb.shared(name, size);
  kb.note(`flash attention: ${BR} rows × ${BC} keys per tile; ${G} row groups × ${TPR} lanes; per thread ${RM} rows × ${KN} keys, ${DPT} columns`);
  // the block's query rows
  kb.for("tq", V("tid"), BR * E, T, (t) => {
    const rr = kb.int(t.div(E), "qr"), ee = kb.int(t.mod(E), "qe"), gi = rb.mul(BR).add(rr);
    const val = kb.let(kx.num(0), "qs");
    guarded(kb, [raggedL && gi.lt(L)], () => kb.let(emitFrag(kb, an, att.A, { ...benv, [att.iVar]: gi, __e: ee }), val));
    kb.sstore("sQ", rr.mul(lay.QS).add(ee), kx.v(val));
  });
  kb.sync();
  // a floored maximum starts at its floor: max over the tiles is then max(M, floor), as the expression says
  const m0 = att.mFloor != null ? kx.num(att.mFloor) : NEG_INF;
  const m = rows.map((_, k) => kb.let(m0, `m${k}`)), l = rows.map((_, k) => kb.let(kx.num(0), `l${k}`));
  const acc = rows.map((_, k) => cols.map((_, q) => kb.let(kx.num(0), `acc${k}_${q}`)));
  kb.for("j0", 0, S, BC, (j0) => {
    // stage the key tile and the value tile
    kb.for("tk", V("tid"), BC * E, T, (t) => {
      const cc = kb.int(t.div(E), "kc"), ee = kb.int(t.mod(E), "ke"), gj = j0.add(cc);
      const val = kb.let(kx.num(0), "ks");
      guarded(kb, [raggedS && gj.lt(S)], () => kb.let(emitFrag(kb, an, att.B, { ...benv, __j: gj, __e: ee }), val));
      kb.sstore("sK", cc.mul(lay.KS).add(ee), kx.v(val));
    });
    kb.for("tw", V("tid"), BC * D, T, (t) => {
      const cc = kb.int(t.div(D), "wc"), dd = kb.int(t.mod(D), "wd"), gj = j0.add(cc);
      const val = kb.let(kx.num(0), "vs");
      guarded(kb, [raggedS && gj.lt(S)], () => kb.let(emitFrag(kb, an, att.V, { ...benv, __j: gj, [att.dVar]: dd }), val));
      kb.sstore("sV", cc.mul(lay.VS).add(dd), kx.v(val));
    });
    kb.sync();
    // the score tile: RM × KN inner products in registers, then the epilogue (scale, mask) per score
    const keys = Array.from({ length: KN }, (_, n) => kb.int(lane.add(n * TPR), `c${n}`));
    const ctx = { att, lay, BC, rows, keys, cols, l, acc, colOk };
    const elems = prod.scores(kb, ctx);
    const pm = rows.map((_, k) => kb.let(NEG_INF, `pm${k}`));
    const sc = elems.map((el, x) => {
      const s = kb.let(NEG_INF, `s${x}`), gi = rb.mul(BR).add(el.row), gj = j0.add(el.key);
      guarded(kb, [raggedL && gi.lt(L), raggedS && gj.lt(S)], () =>
        kb.let(emitFrag(kb, an, att.epi, { ...benv, [att.iVar]: gi, __j: gj }, new Map([[att.dot, el.value]])), s));
      kb.let(kx.op("max", kx.v(pm[el.slot]), kx.v(s)), pm[el.slot]);
      return { ...el, s };
    });
    rows.forEach((r, k) => kb.sstore("sM", r.mul(TPR).add(lane), kx.v(pm[k])));
    kb.sync();
    // online softmax: the tile's row maxima, the rescale factors, and this thread's probabilities
    rows.forEach((r, k) => {
      const mt = kb.let(NEG_INF, `mt${k}`);
      kb.for("cm", 0, TPR, 1, (t) => { const v = kb.sload("sM", r.mul(TPR).add(t), `sm${k}`); kb.let(kx.op("max", kx.v(mt), kx.v(v)), mt); });
      const m2 = kb.let(kx.op("max", kx.v(m[k]), kx.v(mt)), `mx${k}`);
      const live = kb.let(kx.op("gt", kx.v(m2), NEG_INF), `live${k}`);
      const dm = kb.let(kx.op(att.subFn, kx.v(m[k]), kx.v(m2)), `dm${k}`);
      const ea = kb.let(kx.op("exp", kx.v(dm)), `ea${k}`);
      const alpha = kb.let(kx.op("select", kx.v(live), kx.v(ea), kx.num(1)), `alpha${k}`);
      sc.filter((el) => el.slot === k).forEach((el, n) => {
        const ds = kb.let(kx.op(att.subFn, kx.v(el.s), kx.v(m2)), `ds${k}_${n}`);
        const ex = kb.let(kx.op("exp", kx.v(ds)), `ex${k}_${n}`);
        const p = kb.let(kx.op("select", kx.v(live), kx.v(ex), kx.num(0)), `pp${k}_${n}`);
        kb.sstore("sP", el.row.mul(lay.SS).add(el.key), kx.v(p));
      });
      kb.let(kx.op(att.mulFn, kx.v(alpha), kx.v(l[k])), l[k]);
      cols.forEach((_, q) => guarded(kb, [colOk(q)], () => kb.let(kx.op(att.mulFn, kx.v(alpha), kx.v(acc[k][q])), acc[k][q])));
      kb.let(kx.v(m2), m[k]);
    });
    kb.sync();
    prod.pv(kb, ctx);
    kb.sync();
  });
  // the output: post(acc / l) at every (row, column) this thread owns
  const outSt = strides(att.shape);
  rows.forEach((_, k) => cols.forEach((d, q) => guarded(kb, [raggedL && qi[k].lt(L), colOk(q)], () => {
    const den = att.lFloor != null ? kx.v(kb.let(kx.op("max", kx.v(l[k]), kx.num(att.lFloor)), `lf${k}_${q}`)) : kx.v(l[k]);
    const o = kb.let(kx.op("div", kx.v(acc[k][q]), den), `o${k}_${q}`);
    const env = { ...benv, [att.iVar]: qi[k], [att.dVar]: d };
    const val = emitFrag(kb, an, att.post, env, new Map([[att.core, kx.v(o)]]));
    kb.store("out", att.shape.reduce((a, _, j) => a.add(IX.lift(env["a" + j] ?? C(0)).mul(outSt[j])), C(0)), val);
  })));
  return kb;
}
