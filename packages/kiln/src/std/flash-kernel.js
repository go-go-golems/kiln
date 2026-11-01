// MAP=flash at the Kernel IR (KILN-007): the online-softmax attention kernel, spelled out as threads, shared
// memory and barriers with the KB builder, so the CUDA, WGSL and simulator emitters need nothing new.
//
//   block  = (batch position, row block rb); thread = (row r = tid / TPR, lane = tid % TPR)
//   sQ ← A(i, e) for the block's BR rows                                   sync
//   m = −inf, l = 0, acc[q] = 0                    (q < DPT; column d = lane + q·TPR)
//   for j0 in 0..S step BC:
//       sK ← B(j, e), sV ← V(j, d) for the tile's BC keys                    sync
//       sS[r, c] ← epi(Σ_e sQ[r, e]·sK[c, e]) for c = lane, lane + TPR, …     sync
//       every thread of the row: m' = max(m, max_c sS[r, c]); α = exp(m − m')
//       l = α·l + Σ_c p_c;  acc[q] = α·acc[q] + Σ_c p_c·sV[c, d_q];  m = m'   sync
//   out = post(acc[q] / l)
//
// Each lane of a row computes m', α and p from the same shared values in the same order, so every copy of
// m and l agrees bit for bit without another barrier. A row whose scores are all −inf keeps p = 0 and α = 1
// (a guard on m' > −inf), so it ends in 0 / 0 = NaN, which is what the three-pass reference computes.
// The inner product Σ_e sQ·sK is an FP32 SIMT product in the expression's own spelling (dotFn: mul or
// mul_rn); `products` is the seam where a tensor-core product (KILN-006) can replace scoreTile().
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
    if (n.k === "num") v = kx.num(n.v);
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
// `fn` under a bounds condition, or unconditionally when the condition is always true
const guarded = (kb, conds, fn) => { const cs = conds.filter(Boolean); if (!cs.length) return fn(); kb.if(cs.reduce((a, b) => a.and(b)), fn); };

/** The FP32 SIMT score of one (row, key) pair: Σ_e sQ[r, e] · sK[c, e], sequential in e like the reference. */
function scoreSimt(kb, att, lay, r, c) {
  const dot = kb.let(kx.num(reducer(att.accFn).init), "dot");
  kb.for("e", 0, att.E, 1, (e) => {
    const q = kb.sload("sQ", r.mul(lay.QS).add(e), "qv"), kv = kb.sload("sK", c.mul(lay.KS).add(e), "kv");
    const p = kb.let(kx.op(att.dotFn, kx.v(q), kx.v(kv)), "qk");
    kb.let(kx.op(reducer(att.accFn).op, kx.v(dot), kx.v(p)), dot);
  });
  return kx.v(dot);
}
export const products = { simt: scoreSimt };

export function matFlash(an, kn) {
  const att = an.attention;
  if (!att) throw new KilnError("MaterializeError", "MAP=flash on a kernel that is not a recognized softmax contraction");
  const kb = new KB();
  const { BR, BC, TPB: T } = kn;
  const g = flashGeometry(att, kn), lay = flashLayout(att, BR, BC);
  const { TPR, DPT, nb } = g;
  const { L, S, D, E } = att;
  const raggedL = L % BR !== 0, raggedS = S % BC !== 0, raggedD = D % TPR !== 0;
  const score = products.simt;
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
  const r = kb.int(V("tid").div(TPR), "r"), lane = kb.int(V("tid").mod(TPR), "lane");
  const i = kb.int(rb.mul(BR).add(r), "qi");
  for (const [name, size] of [["sQ", lay.sQ], ["sK", lay.sK], ["sV", lay.sV], ["sS", lay.sS]]) kb.shared(name, size);
  // the block's query rows
  kb.note(`flash attention: ${BR} rows × ${BC} keys per tile, ${TPR} threads per row, ${DPT} columns per thread`);
  kb.for("tq", V("tid"), BR * E, T, (t) => {
    const rr = kb.int(t.div(E), "qr"), ee = kb.int(t.mod(E), "qe"), gi = rb.mul(BR).add(rr);
    const val = kb.let(kx.num(0), "qs");
    guarded(kb, [raggedL && gi.lt(L)], () => kb.let(emitFrag(kb, an, att.A, { ...benv, [att.iVar]: gi, __e: ee }), val));
    kb.sstore("sQ", rr.mul(lay.QS).add(ee), kx.v(val));
  });
  kb.sync();
  const m = kb.let(NEG_INF, "m"), l = kb.let(kx.num(0), "l");
  const acc = Array.from({ length: DPT }, (_, q) => kb.let(kx.num(0), `acc${q}`));
  const col = (q) => lane.add(q * TPR);
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
    // the score tile: each lane computes the scores of its row at keys lane, lane + TPR, …
    kb.for("c", lane, BC, TPR, (c) => {
      const gj = j0.add(c);
      const sv = kb.let(NEG_INF, "sc");
      guarded(kb, [raggedL && i.lt(L), raggedS && gj.lt(S)], () => {
        const dot = score(kb, att, lay, r, c);
        kb.let(emitFrag(kb, an, att.epi, { ...benv, [att.iVar]: i, __j: gj }, new Map([[att.dot, dot]])), sv);
      });
      kb.sstore("sS", r.mul(lay.SS).add(c), kx.v(sv));
    });
    kb.sync();
    // online softmax: every thread of a row reads the same scores in the same order
    const mt = kb.let(NEG_INF, "mt");
    kb.for("cm", 0, BC, 1, (c) => { const sv = kb.sload("sS", r.mul(lay.SS).add(c), "sm"); kb.let(kx.op("max", kx.v(mt), kx.v(sv)), mt); });
    const m2 = kb.let(kx.op("max", kx.v(m), kx.v(mt)), "m2");
    const ok = kb.let(kx.op("gt", kx.v(m2), NEG_INF), "live");
    const dm = kb.let(kx.op(att.subFn, kx.v(m), kx.v(m2)), "dm");
    const ea = kb.let(kx.op("exp", kx.v(dm)), "ea");
    const alpha = kb.let(kx.op("select", kx.v(ok), kx.v(ea), kx.num(1)), "alpha");
    kb.let(kx.op(att.mulFn, kx.v(alpha), kx.v(l)), l);
    for (let q = 0; q < DPT; q++) guarded(kb, [raggedD && col(q).lt(D)], () => kb.let(kx.op(att.mulFn, kx.v(alpha), kx.v(acc[q])), acc[q]));
    kb.for("cp", 0, BC, 1, (c) => {
      const sv = kb.sload("sS", r.mul(lay.SS).add(c), "sp");
      const d = kb.let(kx.op(att.subFn, kx.v(sv), kx.v(m2)), "ds");
      const ex = kb.let(kx.op("exp", kx.v(d)), "ex");
      const p = kb.let(kx.op("select", kx.v(ok), kx.v(ex), kx.num(0)), "p");
      kb.let(kx.op(att.addFn, kx.v(l), kx.v(p)), l);
      for (let q = 0; q < DPT; q++) guarded(kb, [raggedD && col(q).lt(D)], () => {
        const vv = kb.sload("sV", c.mul(lay.VS).add(col(q)), `v${q}`);
        const pv = kb.let(kx.op(att.pvFn, kx.v(p), kx.v(vv)), `pv${q}`);
        kb.let(kx.op(att.addFn, kx.v(acc[q]), kx.v(pv)), acc[q]);
      });
    });
    kb.let(kx.v(m2), m);
    kb.sync();
  });
  // the output: post(acc / l) at every (row, column) this thread owns
  const outSt = strides(att.shape);
  for (let q = 0; q < DPT; q++) {
    const d = col(q);
    guarded(kb, [raggedL && i.lt(L), raggedD && d.lt(D)], () => {
      const o = kb.let(kx.op("div", kx.v(acc[q]), kx.v(l)), `o${q}`);
      const env = { ...benv, [att.iVar]: i, [att.dVar]: d };
      const val = emitFrag(kb, an, att.post, env, new Map([[att.core, kx.v(o)]]));
      const flat = att.shape.reduce((a, _, j) => a.add(IX.lift(env["a" + j] ?? C(0)).mul(outSt[j])), C(0));
      kb.store("out", flat, val);
    });
  }
  return kb;
}
