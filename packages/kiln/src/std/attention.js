// Fused attention at the Loop IR (KILN-007). Attention written as matmul / softmax / matmul is, after full
// inlining, one ordinary Loop IR expression (the three-pass softmax over the scores, contracted with the
// values). This module recognizes that expression and forms it on purpose:
//
//   matchSoftmaxContraction(expr, shape, inShapes)
//       → null, or a description of the parts the flash mapping (tile.js MAP=flash, flash.js) needs
//   fuseAttention / attentionPass
//       → after ordinary fusion, inline the smallest region of producers whose fused expression the
//         recognizer accepts, when some MAP=flash option fits the target
//
// The expression stays the semantics (the serial reference, kernel identity, evidence); the online softmax
// is a property of the MAP=flash mapping only. Recognized form (j is the key, e the inner-product axis):
//
//   out[…] = post( Σ_j P(j) · V(j, d) )                 P(j) = exp(s(j) − M) / Λ          (normalized)
//   out[…] = post( (Σ_j exp(s(j) − M) · V(j, d)) / Λ )                                     (unnormalized)
//   M = max_j s(j),  Λ = Σ_j exp(s(j) − M),  s(j) = epi( Σ_e A(e) · B(j, e) )
//
// A depends on the query row and e, B and V on the key (never on the query row the block tiles), epi is
// any reduction-free expression of the raw score and side loads (scale, additive mask, select(mask, s, −inf)),
// post any reduction-free expression of the result (a narrowing round, a fused elementwise consumer).
import { k, P } from "../core/kiln.js";
import * as IX from "../core/ix.js";
import { E, substE, walkE, free, inlineInto } from "./loop.js";
import { flashLegal } from "./flash.js";

const J = "__j", EV = "__e";
const MUL = new Set(["mul", "mul_rn", "multiply"]);
const SUB = new Set(["sub", "sub_rn", "subtract"]);
const DIV = new Set(["div", "divide"]);
const isRed = (x, fn) => x && x.k === "red" && (!fn || x.fn === fn);
const bindVar = (red, name) => substE(red.body, { [red.r]: IX.V(name) });
const redsIn = (x) => { const out = []; walkE(x, (n) => { if (n.k === "red") out.push(n); }); return out; };
const loadsIn = (x) => { const out = []; walkE(x, (n) => { if (n.k === "in") out.push(n); }); return out; };
const hasDataIndex = (x) => loadsIn(x).some((l) => l.idx.some((e) => IX.loadsOf(e).length));
// output coordinates a0… that an expression reads
const coordsOf = (x) => new Set([...free(x)].filter((v) => /^a\d+$/.test(v)));

// rewrite an expression, replacing every occurrence of the nodes in `holes` (identity) by a marker load
function withHoles(x, holes) {
  const memo = new Map();
  const rw = (n) => {
    if (holes.has(n)) return holes.get(n);
    if (memo.has(n)) return memo.get(n);
    let r = n;
    if (n.k === "op") r = E.op(n.fn, ...n.a.map(rw));
    else if (n.k === "red") r = n;   // reductions other than holes stay (the caller rejects them)
    memo.set(n, r);
    return r;
  };
  return rw(x);
}

// P(j) = exp(sub(s(j), M)) with M = max_j s(j): → { sJ, M, expJ, subFn } or null
function matchExp(x, S) {
  if (!x || x.k !== "op" || x.fn !== "exp") return null;
  const d = x.a[0];
  if (d.k !== "op" || !SUB.has(d.fn)) return null;
  const [sJ, M] = d.a;
  if (!isRed(M, "max") || M.n !== S || free(M).has(J)) return null;
  if (!free(sJ).has(J)) return null;
  if (bindVar(M, J).__key !== sJ.__key) return null;
  return { sJ, M, expJ: x, subFn: d.fn };
}
// Λ = Σ_j exp(s(j) − M): the same exp term
const isLsum = (L, expJ, S) => isRed(L, "add") && L.n === S && !free(L).has(J) && bindVar(L, J).__key === expJ.__key;

// the P·V reduction X: → partial description or null
function matchPV(X) {
  if (!isRed(X, "add")) return null;
  const S = X.n;
  const body = bindVar(X, J);
  if (body.k !== "op" || !MUL.has(body.fn) || body.a.length !== 2) return null;
  for (const [p, v] of [[body.a[0], body.a[1]], [body.a[1], body.a[0]]]) {
    if (!free(v).has(J) || redsIn(v).length) continue;
    if (p.k === "op" && DIV.has(p.fn)) {
      const ex = matchExp(p.a[0], S);
      if (ex && isLsum(p.a[1], ex.expJ, S)) return { X, S, ...ex, Lsum: p.a[1], V: v, pvFn: body.fn, normalized: true, divFn: p.fn };
    }
    const ex = matchExp(p, S);
    if (ex) return { X, S, ...ex, Lsum: null, V: v, pvFn: body.fn, normalized: false };
  }
  return null;
}

/**
 * Recognize a softmax contraction (scaled dot-product attention) in a Loop IR expression over an output of
 * `shape`, reading inputs of `inShapes`. Returns null, or:
 *   { L, S, D, E, iVar, dVar, rowVars, batchVars, A, B, V, epi, post, core, dot, M, Lsum,
 *     dotFn, accFn, pvFn, subFn, normalized, inputs }
 * Fragments (A, B, V, epi, post) are Loop IR expressions over the output coordinates a0…, the key variable
 * "__j" and the inner-product variable "__e". `epi` contains the node `dot` (the raw inner product Σ_e A·B)
 * and `post` the node `core` (the normalized result), both to be bound by the materializer.
 */
export function matchSoftmaxContraction(expr, shape, inShapes) {
  if (!expr || shape.length < 2) return null;
  if (hasDataIndex(expr)) return null;
  // a size-1 output coordinate is 0: kernels fused from different views spell it either way (a0 or 0),
  // and the three copies of the score must compare equal
  const ones = Object.fromEntries(shape.map((d, i) => [d, i]).filter(([d]) => d === 1).map(([, i]) => ["a" + i, IX.C(0)]));
  if (Object.keys(ones).length) expr = substE(expr, ones);
  for (const X of redsIn(expr).reverse()) {   // outermost candidates first
    const pv = matchPV(X);
    if (!pv) continue;
    const r = complete(expr, shape, inShapes, pv);
    if (r) return r;
  }
  return null;
}

function complete(expr, shape, inShapes, pv) {
  const { X, S, sJ, M, V } = pv;
  // the core: the normalized contraction, X itself or X / Λ found in the post expression
  let core = X, Lsum = pv.Lsum;
  if (!pv.normalized) {
    let found = null;
    walkE(expr, (n) => { if (!found && n.k === "op" && DIV.has(n.fn) && n.a[0] === X && isLsum(n.a[1], pv.expJ, S)) found = n; });
    if (!found) return null;
    core = found; Lsum = found.a[1];
  }
  const CORE = E.load(-1, []);
  const post = withHoles(expr, new Map([[core, CORE]]));
  if (redsIn(post).length) return null;                 // another reduction outside the attention core
  // the score: exactly one reduction, the inner product Σ_e A(e)·B(j, e)
  const sr = redsIn(sJ);
  if (sr.length !== 1 || !isRed(sr[0], "add")) return null;
  const dot = sr[0];
  const dbody = bindVar(dot, EV);
  if (dbody.k !== "op" || !MUL.has(dbody.fn) || dbody.a.length !== 2) return null;
  let A = null, B = null;
  for (const [a, b] of [[dbody.a[0], dbody.a[1]], [dbody.a[1], dbody.a[0]]]) if (!free(a).has(J) && free(b).has(J)) { A = a; B = b; break; }
  if (!A || redsIn(A).length || redsIn(B).length) return null;
  if (!free(A).has(EV) || !free(B).has(EV)) return null;
  const DOT = E.load(-2, []);
  const epi = withHoles(sJ, new Map([[dot, DOT]]));
  if (redsIn(epi).length || free(epi).has(EV)) return null;
  // coordinates: d is the one output coordinate the values read and the score does not
  const n = shape.length;
  const scoreCoords = coordsOf(sJ), vCoords = coordsOf(V);
  const dCands = [...vCoords].filter((v) => !scoreCoords.has(v));
  if (dCands.length !== 1) return null;
  const dVar = dCands[0];
  const dIdx = +dVar.slice(1);
  const rowVars = Array.from({ length: n }, (_, i) => "a" + i).filter((v) => v !== dVar);
  // the block row: an output coordinate the scores read and neither keys nor values do
  const kvCoords = new Set([...coordsOf(B), ...vCoords]);
  // (a size-1 query axis reads as the constant 0: any coordinate the keys and values ignore will do)
  const free1 = rowVars.filter((v) => !kvCoords.has(v));
  const read = free1.filter((v) => coordsOf(A).has(v) || coordsOf(epi).has(v));
  const iCands = read.length ? read : free1;
  if (!iCands.length) return null;
  const iVar = iCands.reduce((best, v) => (shape[+v.slice(1)] >= shape[+best.slice(1)] ? v : best));
  const L = shape[+iVar.slice(1)], D = shape[dIdx];
  // the post expression and the softmax statistics may not depend on the key or inner-product variables
  if (free(post).has(J) || free(post).has(EV)) return null;
  if (free(M).has(dVar) || free(Lsum).has(dVar)) return null;
  const inputs = new Set(loadsIn(expr).map((l) => l.i));
  return {
    L, S, D, E: dot.n, iVar, dVar, rowVars, batchVars: rowVars.filter((v) => v !== iVar), shape: shape.slice(), inShapes: inShapes.map((s) => s.slice()),
    A, B, V, epi, post, core: CORE, dot: DOT, M, Lsum,
    dotFn: dbody.fn, accFn: dot.fn, pvFn: pv.pvFn, subFn: pv.subFn, normalized: pv.normalized,
    // FP32 spelling of the online-softmax updates: separate rounding when the expression asks for it
    addFn: pv.pvFn === "mul_rn" ? "add_rn" : "add", mulFn: pv.pvFn === "mul_rn" ? "mul_rn" : "mul",
    inputs: [...inputs].sort((a, b) => a - b),
  };
}

// ----------------------------------------------------------------------------- the fusion rule
// Region search: starting from a candidate consumer, inline producers (loop kernels whose every user is
// already in the region, and that are not graph outputs) one at a time, breadth first over sets, and stop
// at the smallest set whose fused expression the recognizer accepts. Inlining is substitution, so the
// fused expression depends on the set, not the order. Bounded: a handful of kernels, a few dozen states.
const MAX_REGION = 6, MAX_STATES = 48;
// cheap filter: a sum whose region (the kernel or a producer two levels up) holds a max reduction
const hasMax = (v, depth) => v.is("loop.kernel") && (v.attrs.expr.__key.includes("red:max") || (depth > 0 && v.args.some((a) => hasMax(a, depth - 1))));
const mightBeAttention = (c) => c.attrs.expr.__key.includes("red:add") && hasMax(c, 3);
function regionSearch(c, graph, accept) {
  const start = { ids: new Set([c.id]), node: { id: c.id, args: c.args, attrs: { expr: c.attrs.expr, origin: c.attrs.origin || [] } } };
  const queue = [start], seen = new Set([c.id]);
  let states = 0;
  while (queue.length && states++ < MAX_STATES) {
    const st = queue.shift();
    const m = accept(st.node);
    if (m) return { ...st, match: m };
    if (st.ids.size >= MAX_REGION) continue;
    const cands = [...new Map(st.node.args.map((a) => [a.id, a])).values()].filter((p) => p.is("loop.kernel") && !graph.isOutput(p.id) && p.users.every((u) => st.ids.has(u.id)));
    for (const p of cands) {
      const ids = new Set([...st.ids, p.id]);
      const key = [...ids].sort().join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      let r;
      try { r = inlineInto(st.node, p); } catch { continue; }
      queue.push({ ids, node: { id: c.id, args: r.args, attrs: { expr: r.expr, origin: r.origin } } });
    }
  }
  return null;
}

/** The fusion rule; `legal(match, target)` says whether some MAP=flash option can run the match. */
export function createAttentionRule({ legal = () => true } = {}) {
  return k.rule("fuse_attention")
    .match(P.op("loop.kernel").as("c").where(({ c }) => mightBeAttention(c)))
    .mutate(({ c, tx, skip, graph, ctx }) => {
      // already one kernel: nothing to fuse
      if (matchSoftmaxContraction(c.attrs.expr, c.attrs.shape, c.args.map((a) => a.type.shape))) skip("already a fused attention kernel");
      const found = regionSearch(c, graph, (nd) => matchSoftmaxContraction(nd.attrs.expr, c.attrs.shape, nd.args.map((a) => a.type.shape)));
      if (!found || found.ids.size < 2) skip("not a softmax contraction");
      if (!legal(found.match, ctx?.target)) skip("no MAP=flash option fits this target");
      tx.set(c, { args: found.node.args, attrs: { expr: found.node.attrs.expr, origin: found.node.attrs.origin } });
    })
    .describe("fuse a scores / softmax / P·V region into one kernel when MAP=flash can run it");
}

export const fuseAttention = createAttentionRule({ legal: flashLegal });
export const attentionPass = k.pass("loop/attention").short("a").rules(fuseAttention)
  .describe("fuse attention (scores, softmax, P·V) into one kernel the flash map runs");
