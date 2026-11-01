// Kernel IR: every scheduling decision made concrete. Threads see tid / bid, shared arrays are
// declared, cooperative loops and tree combines are spelled out, and every load and store has a flat
// address. The CUDA, WGSL and simulator emitters are tree walks over this form.
//
// statements:  let {n, e} · iset {n, e:Ix} · load {n, buf, idx} · store {buf, idx, e}
//              sload {n, arr, idx} · sstore {arr, idx, e} · sync · for {v, from, to, step, body}
//              if {c:Ix, body} · note {text}
// float expressions: {k:"num", v} · {k:"var", n} · {k:"op", fn, a:[…]}
import { k, P, KilnError } from "../core/kiln.js";
import { numel, strides, hash, inKey, dtypeBytes } from "../core/util.js";
import * as IX from "../core/ix.js";
import { reducer, FNS, INTEGER_DTYPES } from "./fns.js";
import { analyze, launch, stagedOf, canonRow } from "./tile.js";
import { displayNames } from "./loop.js";
import { matFlash } from "./flash-kernel.js";

// an int64 literal past 2^53 keeps its exact decimal spelling beside the (JSON-safe) number
export const kx = { num: (v) => (typeof v === "bigint" ? { k: "num", v: Number(v), exact: String(v) } : { k: "num", v: +v }), v: (n) => ({ k: "var", n }), op: (fn, ...a) => ({ k: "op", fn, a }) };
const V = IX.V, C = IX.C;

export class KB {
  constructor() { this.body = []; this.cur = this.body; this.floats = new Set(); this.ints = new Set(); this.smem = []; this.cnt = {}; }
  fresh(p) { this.cnt[p] = (this.cnt[p] || 0) + 1; return p + (this.cnt[p] - 1); }
  push(s) { this.cur.push(s); return s; }
  let(e, name) { name ??= this.fresh("f"); this.floats.add(name); this.push({ s: "let", n: name, e }); return name; }
  int(e, name) { name ??= this.fresh("i"); this.ints.add(name); this.push({ s: "iset", n: name, e: IX.lift(e) }); return V(name); }
  load(buf, idx, name) { name ??= this.fresh("g"); this.floats.add(name); this.push({ s: "load", n: name, buf, idx: IX.lift(idx) }); return name; }
  store(buf, idx, e) { this.push({ s: "store", buf, idx: IX.lift(idx), e }); }
  shared(name, size) { this.smem.push({ name, size }); return name; }
  sload(arr, idx, name) { name ??= this.fresh("sv"); this.floats.add(name); this.push({ s: "sload", n: name, arr, idx: IX.lift(idx) }); return name; }
  sstore(arr, idx, e) { this.push({ s: "sstore", arr, idx: IX.lift(idx), e }); }
  sync() { const last = this.cur[this.cur.length - 1]; if (last?.s !== "sync") this.push({ s: "sync" }); }
  note(text) { this.push({ s: "note", text }); }
  for(v, from, to, step, fn) {
    const st = this.push({ s: "for", v, from: IX.lift(from), to: IX.lift(to), step: IX.lift(step), body: [] });
    const prev = this.cur; this.cur = st.body; fn(V(v)); this.cur = prev;
  }
  if(c, fn) { c = IX.lift(c); if (c.t === "c") { if (c.v) fn(); return; } const st = this.push({ s: "if", c, body: [] }); const prev = this.cur; this.cur = st.body; fn(); this.cur = prev; }
}

// decode a flat index into coordinates over dims (row-major)
function decode(e, dims) {
  const env = {};
  let stride = 1;
  for (let i = dims.length - 1; i >= 0; i--) { const d = dims[i]; env[d.v] = dims.length === 1 ? e : i === 0 ? e.div(stride) : e.div(stride).mod(d.n); stride *= d.n; }
  return env;
}

// emit Loop IR statements serially; strategies override free loops and reductions through hooks
function emitNest(kb, stmts, ctx) {
  for (let i = 0; i < stmts.length; i++) {
    const st = stmts[i];
    if (st.s === "let" && st.e.k === "in") ctx.vals.set(st.name, kx.v(ctx.load(st, ctx)));
    else if (st.s === "let") ctx.vals.set(st.name, kx.v(kb.let(kx.op(st.e.fn, ...st.e.a.map((o) => opnd(o, ctx))), ctx.nm(st.name))));
    else if (st.s === "init") {
      const next = stmts[i + 1];
      if (ctx.onReduce && ctx.onReduce(st, next, ctx)) { i++; continue; }
      ctx.vals.set(st.name, kx.v(kb.let(kx.num(reducer(st.fn).init), ctx.nm(st.name))));
    } else if (st.s === "for" && st.kind === "reduce") {
      const v = ctx.nm(ctx.redName(st.v));
      kb.for(v, 0, st.n, 1, (rv) => emitNest(kb, st.body, { ...ctx, env: { ...ctx.env, [st.v]: rv } }));
    } else if (st.s === "acc") {
      const acc = ctx.vals.get(st.name);
      kb.let(kx.op(reducer(st.fn).op, acc, opnd(st.val, ctx)), acc.n);
    } else if (st.s === "for") ctx.onFree(st, ctx);
    else if (st.s === "write") ctx.write(st, ctx);
  }
}
const opnd = (o, ctx) => (o.ref != null ? ctx.vals.get(o.ref) ?? (() => { throw new KilnError("MaterializeError", `value ${o.ref} used before it is computed`); })() : kx.num(o.num));

function baseCtx(an, kb, P) {
  const ctx = {
    env: {}, vals: new Map(), nm: (n) => n,
    redName: (n) => {
      const name=an.reductionNames[n];
      if(!name)throw new KilnError("MaterializeError", `reduction ${n} has no canonical binder`);
      return name.v;
    },
    flat: (c, i, idx) => an.flat(i, idx.map((e) => IX.subst(e, c.env))),
    load: null, onFree: null, onReduce: null, write: null,
  };
  return ctx;
}
const outFlat = (an, idx, env) => { const st = strides(an.shape); return idx.reduce((a, e, j) => a.add(IX.subst(e, env).mul(st[j])), C(0)); };

// ----------------------------------------------------------------------------- MAP=thread
function matThread(an, kn) {
  const kb = new KB();
  const T = kn.TPB, Cn = kn.COARSEN, N = an.numelOut;
  const body = (eIx) => {
    const e = kb.int(eIx, "e");
    kb.if(e.lt(N), () => {
      const ctx = baseCtx(an, kb);
      ctx.env = decode(e, an.dims);
      ctx.load = (st, c) => kb.load(st.e.i, c.flat(c, st.e.i, st.e.idx), st.name);
      ctx.onFree = (st, c) => emitNest(kb, st.body, c);
      ctx.write = (st, c) => kb.store("out", outFlat(an, st.idx, c.env), opnd(st.val, c));
      emitNest(kb, an.sched.stmts, ctx);
    });
  };
  if (Cn === 1) body(V("bid").mul(T).add(V("tid")));
  else kb.for("j", 0, Cn, 1, (j) => body(V("bid").mul(T * Cn).add(j.mul(T)).add(V("tid"))));
  return kb;
}

// ----------------------------------------------------------------------------- MAP=row
function treeCombine(kb, T, fnName, accName) {
  const red = "s_red";
  if (!kb.smem.find((s) => s.name === red)) kb.shared(red, T);
  kb.sync();
  kb.sstore(red, V("tid"), kx.v(accName));
  kb.sync();
  for (let s = T / 2; s >= 1; s /= 2) {
    kb.if(V("tid").lt(s), () => {
      const a = kb.sload(red, V("tid")), b = kb.sload(red, V("tid").add(s));
      kb.sstore(red, V("tid"), kx.op(reducer(fnName).op, kx.v(a), kx.v(b)));
    });
    kb.sync();
  }
  kb.sload(red, C(0), accName);
}
function matRow(an, kn) {
  const kb = new KB();
  const T = kn.TPB;
  const rowDims = an.dims.slice(0, an.rd), innerDims = an.dims.slice(an.rd);
  const ctx = baseCtx(an, kb);
  ctx.env = rowDims.length ? decode(V("bid"), rowDims) : {};
  // staging: copy each staged input's row slab into shared memory
  const staged = new Map();
  for (const x of stagedOf(an, kn)) {
    const arr = kb.shared(`s_in${x.i}`, x.len);
    const base = IX.subst(x.base, ctx.env);
    kb.for("t" + x.i, V("tid"), x.len, T, (t) => { const g = kb.load(x.i, base.add(t)); kb.sstore(arr, t, kx.v(g)); });
    staged.set(x.i, { arr, base });
  }
  if (staged.size) kb.sync();
  ctx.load = (st, c) => {
    const f = c.flat(c, st.e.i, st.e.idx);
    const s = staged.get(st.e.i);
    if (s) return kb.sload(s.arr, f.sub(s.base), st.name);
    return kb.load(st.e.i, f, st.name);
  };
  ctx.write = (st, c) => {
    const f = outFlat(an, st.idx, c.env);
    if (c.depth === an.rd && !innerDims.length) kb.if(V("tid").eq(0), () => kb.store("out", f, opnd(st.val, c)));
    else kb.store("out", f, opnd(st.val, c));
  };
  ctx.depth = 0;
  ctx.onFree = (st, c) => {
    if (c.depth < an.rd) {
      const sub = { ...c, depth: c.depth + 1, env: { ...c.env } };
      if (sub.depth === an.rd) sub.onReduce = rowReduce;
      emitNest(kb, st.body, sub);
    } else if (c.depth === an.rd) {
      // the row's elementwise sweep: every inner coordinate, strided over the block
      const inner = numel(innerDims.map((d) => d.n));
      kb.for("q", V("tid"), inner, T, (q) => {
        const env = { ...c.env, ...decode(q, innerDims) };
        emitNest(kb, st.body, { ...c, env, depth: an.dims.length, onReduce: null, onFree: (s2, c2) => emitNest(kb, s2.body, c2) });
      });
    } else emitNest(kb, st.body, c);
  };
  // a reduction at row scope: strided over the block, then a tree combine
  const rowReduce = (init, loopSt, c) => {
    if (!loopSt || loopSt.s !== "for") return false;
    const acc = kb.let(kx.num(reducer(init.fn).init), init.name);
    c.vals.set(init.name, kx.v(acc));
    kb.for(c.nm(c.redName(loopSt.v)), V("tid"), loopSt.n, T, (rv) => emitNest(kb, loopSt.body, { ...c, env: { ...c.env, [loopSt.v]: rv }, onReduce: null }));
    treeCombine(kb, T, init.fn, acc);
    return true;
  };
  if (an.rd === 0) ctx.onReduce = rowReduce;
  emitNest(kb, an.sched.stmts, ctx);
  return kb;
}

// ----------------------------------------------------------------------------- MAP=tiled
function matTiled(an, kn) {
  const kb = new KB();
  const ct = an.contraction;
  const { BM, BN, BK, TM, TN } = kn;
  const T = (BM / TM) * (BN / TN), TX = BN / TN;
  const gm = Math.ceil(ct.M / BM), gn = Math.ceil(ct.N / BN);
  const bz = kb.int(V("bid").div(gm * gn), "bz"), bm = kb.int(V("bid").div(gn).mod(gm), "bm"), bn = kb.int(V("bid").mod(gn), "bn");
  const ty = kb.int(V("tid").div(TX), "ty"), tx = kb.int(V("tid").mod(TX), "tx");
  const benv = ct.batch.length ? decode(bz, ct.batch) : {};
  const s = an.sched;
  const accName = s.names.get(ct.C);
  // find C's loop statement and init
  let cLoop = null;
  const findC = (ss) => { for (const st of ss) { if (st.s === "for" && st.kind === "reduce" && st.red === accName) cLoop = st; else if (st.s === "for") findC(st.body); } };
  findC(s.stmts);
  const fnName = cLoop.body[cLoop.body.length - 1].fn;
  const acc = (i, j) => `acc_${i}_${j}`;
  for (let i = 0; i < TM; i++) for (let j = 0; j < TN; j++) kb.let(kx.num(reducer(fnName).init), acc(i, j));
  const arrA = ct.A.map((a, q) => kb.shared(`sA${q}`, BM * BK));
  const arrB = ct.B.map((b, q) => kb.shared(`sB${q}`, BK * BN));
  const coef = (f, v) => { const a = IX.affine(f, [...IX.vars(f)]); return a ? Math.abs(a.k[v] || 0) : 1; };
  const tileLoad = (ld, arr, rows, rowVar, rowBase, lim, isA, k0) => {
    const f0 = an.flat(ld.i, ld.idx);
    const sK = coef(f0, ct.C.r), sR = coef(f0, rowVar);
    const kFast = sK !== 0 && (sR === 0 || sK <= sR);
    kb.for(isA ? "la" : "lb", V("tid"), rows * BK, T, (l) => {
      const rr = kb.int(kFast ? l.div(BK) : l.mod(rows), "rr"), kk = kb.int(kFast ? l.mod(BK) : l.div(rows), "kq");
      const gRow = rowBase.add(rr), gK = k0.add(kk);
      const v = kb.let(kx.num(0), "tv");
      kb.if(gRow.lt(lim).and(gK.lt(ct.K)), () => {
        const env = { ...benv, [rowVar]: gRow, [ct.C.r]: gK };
        const g = kb.load(ld.i, an.flat(ld.i, ld.idx.map((e) => IX.subst(e, env))));
        kb.let(kx.v(g), v);
      });
      kb.sstore(arr, isA ? rr.mul(BK).add(kk) : kk.mul(BN).add(rr), kx.v(v));
    });
  };
  kb.for("k0", 0, ct.K, BK, (k0) => {
    ct.A.forEach((a, q) => tileLoad(a, arrA[q], BM, ct.mVar, bm.mul(BM), ct.M, true, k0));
    ct.B.forEach((b, q) => tileLoad(b, arrB[q], BN, ct.nVar, bn.mul(BN), ct.N, false, k0));
    kb.sync();
    kb.for("kk", 0, BK, 1, (kk) => {
      kb.if(k0.add(kk).lt(ct.K), () => {
        const av = ct.A.map((a, q) => Array.from({ length: TM }, (_, i) => kb.sload(arrA[q], ty.mul(TM).add(i).mul(BK).add(kk), `a${q}_${i}`)));
        const bv = ct.B.map((b, q) => Array.from({ length: TN }, (_, j) => kb.sload(arrB[q], kk.mul(BN).add(tx.mul(TN)).add(j), `b${q}_${j}`)));
        for (let i = 0; i < TM; i++) for (let j = 0; j < TN; j++) {
          const ctx = baseCtx(an, kb);
          ctx.nm = (n) => `${n}_${i}_${j}`;
          ctx.vals.set(accName, kx.v(acc(i, j)));
          ctx.load = (st, c) => { const qa = ct.A.indexOf(st.node), qb = ct.B.indexOf(st.node); if (qa >= 0) return av[qa][i]; if (qb >= 0) return bv[qb][j]; throw new KilnError("MaterializeError", "a load in the contraction body is neither an A nor a B operand"); };
          emitNest(kb, cLoop.body, ctx);
        }
      });
    });
    kb.sync();
  });
  // epilogue: every statement outside the contraction, per output element of the register tile
  for (let i = 0; i < TM; i++) for (let j = 0; j < TN; j++) {
    const m = bm.mul(BM).add(ty.mul(TM)).add(i), n = bn.mul(BN).add(tx.mul(TN)).add(j);
    kb.if(m.lt(ct.M).and(n.lt(ct.N)), () => {
      const ctx = baseCtx(an, kb);
      ctx.nm = (nn) => `${nn}_${i}_${j}`;
      ctx.env = { ...benv, [ct.mVar]: m, [ct.nVar]: n };
      ctx.load = (st, c) => kb.load(st.e.i, c.flat(c, st.e.i, st.e.idx), c.nm(st.name));
      ctx.onFree = (st, c) => emitNest(kb, st.body, c);
      ctx.onReduce = (init, loopSt, c) => { if (loopSt?.red === accName) { c.vals.set(accName, kx.v(acc(i, j))); return true; } return false; };
      ctx.write = (st, c) => kb.store("out", outFlat(an, st.idx, c.env), opnd(st.val, c));
      emitNest(kb, s.stmts, ctx);
    });
  }
  return kb;
}

// ----------------------------------------------------------------------------- materialize
// Integer storage (P3a slice 1): an integer value may only be copied from a load to a store of the
// same dtype, or converted to float. Arithmetic, comparisons, conversions and shared-memory staging of integers are refused
// by name, here, rather than computed in float temporaries, which would corrupt int64 values above 2^24.
// Static value types (P3a slice 3). A load takes its buffer's dtype (floating storage loads as f32), a
// shared array the dtype stored into it, a typed function (fns.js) declares its operand and result
// dtypes, and an untyped function computes in f32: an integer operand there is a missing conversion.
// A literal takes the dtype its context requires. → { values: integer-typed names → dtype, smem: array → dtype }
function valueTypes(body, params, name) {
  // literal: names holding only literals so far (a reduction's initial value), typed by their later use
  const types = new Map(), literal = new Set(), smem = new Map(), ins = params.filter((p) => p.role === "in"), out = params.find((p) => p.role === "out");
  const value = (d) => (INTEGER_DTYPES.has(d) ? d : "f32");
  const refuse = (what) => { throw new TypeError(`${what} in ${name}`); };
  const typeOf = (e) => {
    if (e.k === "num") return null;
    if (e.k === "var") return types.get(e.n) ?? (literal.has(e.n) ? null : "f32");
    const spec = FNS[e.fn], ts = e.a.map(typeOf);
    if (spec.args) {
      ts.forEach((t) => { if (spec.args !== "*" && t !== null && t !== spec.args) refuse(`${e.fn} applied to a ${t} value`); });
      return spec.type;
    }
    if (e.fn === "select" || e.fn === "copy") {
      const vs = [...new Set((e.fn === "select" ? ts.slice(1) : ts).filter((t) => t !== null))];
      if (vs.length > 1) refuse(`${e.fn} over ${vs.join(" and ")} values`);
      return vs[0] ?? null;
    }
    ts.forEach((t) => { if (t !== null && t !== "f32") refuse(`${e.fn} applied to a ${t} value (integer arithmetic needs a typed function)`); });
    return "f32";
  };
  const assign = (n, t) => {
    if (t === null) { if (!types.has(n)) literal.add(n); return; }
    const prev = types.get(n);
    if (prev && prev !== t) refuse(`${n} holds both ${prev} and ${t} values`);
    types.set(n, t);
  };
  const walk = (ss) => {
    for (const s of ss) {
      if (s.s === "load") assign(s.n, value(ins[s.buf]?.dtype));
      else if (s.s === "let") assign(s.n, typeOf(s.e));
      else if (s.s === "sload") assign(s.n, smem.get(s.arr) ?? "f32");
      else if (s.s === "sstore") {
        const t = typeOf(s.e) ?? "f32", prev = smem.get(s.arr);
        if (prev && prev !== t) refuse(`shared array ${s.arr} holds both ${prev} and ${t} values`);
        smem.set(s.arr, t);
      } else if (s.s === "store") {
        const t = typeOf(s.e), o = value(out.dtype || "f32");
        if (t !== null && t !== o) refuse(`store of a ${t} value into ${out.dtype || "f32"} storage`);
      }
      if (s.body) walk(s.body);
    }
  };
  walk(body);
  return { values: new Map([...types].filter(([, t]) => t !== "f32")), smem };
}

export function materialize(node) {
  const a = node.attrs;
  const analysis = analyze(a.expr, a.shape, a.inShapes);
  // Keep globally fresh Loop IR symbols for substitution/analysis, but bind
  // deterministic per-kernel names before any source/evidence is emitted.
  // Do not modify the cached analysis or schedule shared with other materializers.
  const an = {...analysis,reductionNames:displayNames(analysis.sched)};
  const kn = a.map;
  const L = launch(an, kn);
  const kb = kn.MAP === "row" ? matRow(an, kn) : kn.MAP === "tiled" ? matTiled(an, kn) : kn.MAP === "flash" ? matFlash(an, kn) : matThread(an, kn);
  const params = [...a.inShapes.map((s, i) => ({ name: "in" + i, size: numel(s), shape: s, role: "in", dtype: a.inDtypes?.[i] || "f32" })), { name: "out", size: numel(a.shape), shape: a.shape, role: "out", dtype: a.outDtype || "f32" }];
  const { values, smem: smemTypes } = valueTypes(kb.body, params, a.name || "kernel");
  const smem = kb.smem.map((x) => ({ ...x, dtype: smemTypes.get(x.name) ?? "f32" }));
  const smemBytes = smem.reduce((s, x) => s + x.size * dtypeBytes(x.dtype), 0);
  return {
    name: a.name || "kernel", grid: L.grid, block: L.block, smem, smemBytes, body: kb.body,
    // temporaries by storage type: integer values (P3a slice 1) are never float temporaries
    floats: [...kb.floats].filter((f) => !values.has(f)), values: Object.fromEntries(values),
    ints: [...kb.ints].filter((v) => v !== "tid" && v !== "bid"),
    params,
    map: kn, row: canonRow(kn),
  };
}

// ----------------------------------------------------------------------------- printing
export function printKernelBody(K, args = []) {
  const bn = (b) => (b === "out" ? "out" : args[b] ?? "in" + b);
  const fx = (e) => (e.k === "num" ? (e.exact ?? String(+e.v.toPrecision(7))) : e.k === "var" ? e.n : `${e.fn}(${e.a.map(fx).join(", ")})`);
  const ix = (e) => IX.print(e);
  const lines = [`grid=${K.grid} block=${K.block}${K.smemBytes ? ` smem=${K.smemBytes} B` : ""}  [${K.row}]`];
  for (const s of K.smem) lines.push(`Smem ${s.name}[${s.size}] (${s.dtype ?? "f32"})`);
  const walk = (ss, pad) => {
    for (const s of ss) {
      switch (s.s) {
        case "let": lines.push(`${pad}${s.n} = ${fx(s.e)}`); break;
        case "iset": lines.push(`${pad}${s.n} = ${ix(s.e)}`); break;
        case "load": lines.push(`${pad}${s.n} = load ${bn(s.buf)}[${ix(s.idx)}]`); break;
        case "store": lines.push(`${pad}${bn(s.buf)}[${ix(s.idx)}] = ${fx(s.e)}`); break;
        case "sload": lines.push(`${pad}${s.n} = ${s.arr}[${ix(s.idx)}]`); break;
        case "sstore": lines.push(`${pad}${s.arr}[${ix(s.idx)}] = ${fx(s.e)}`); break;
        case "sync": lines.push(`${pad}Sync`); break;
        case "note": lines.push(`${pad}# ${s.text}`); break;
        case "for": lines.push(`${pad}for ${s.v} = ${ix(s.from)}; ${s.v} < ${ix(s.to)}; ${s.v} += ${ix(s.step)}:`); walk(s.body, pad + "    "); break;
        case "if": lines.push(`${pad}if ${ix(s.c)}:`); walk(s.body, pad + "    "); break;
      }
    }
  };
  walk(K.body, "");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------- dialect + passes
export const kern = k.dialect("kernel").describe("Kernel IR: threads, shared memory, syncs and flat addresses")
  .op("kernel", {
    args: { variadic: "ins" },
    attrs: { K: null, name: null, expr: null, shape: [], outDtype: "f32", inShapes: [], inDtypes: [], map: null },
    infer: ({ shape, outDtype }) => k.tensor(shape, outDtype),
    print: ({ name, ins }) => `kernel ${name || "·"}(${ins})`,
    body: ({ K, args }) => printKernelBody(K, args),
    identity: ({ expr, shape, args, outDtype }) => hash(`loop|${expr.__key}|${shape.join("x")}|${args.map((a) => inKey(a.type.shape, a.type.dtype)).join(",")}${outDtype && outDtype !== "f32" ? "|out:" + outDtype : ""}`),
    keyIgnore: ["name"],
  });
export const materializeRule = k.rule("materialize").match(P.op("tile.kernel").as("t"))
  .rewrite(({ t }) => t.lower(kern.kernel, { K: materialize(t.node), name: t.attrs.name, expr: t.attrs.expr, shape: t.attrs.shape, inShapes: t.attrs.inShapes, inDtypes: t.attrs.inDtypes, outDtype: t.attrs.outDtype, map: t.attrs.map }))
  .describe("spell the chosen mapping out as threads, shared memory and syncs");

// peephole: two syncs in a row, or a sync that ends the kernel, do nothing
function dropSyncs(body, top = true) {
  const out = [];
  for (const s of body) {
    const t = s.body ? { ...s, body: dropSyncs(s.body, false) } : s;
    if (t.s === "sync" && out.length && out[out.length - 1].s === "sync") continue;
    out.push(t);
  }
  while (top && out.length && out[out.length - 1].s === "sync") out.pop();
  return out;
}
const countSyncs = (b) => b.reduce((a, s) => a + (s.s === "sync" ? 1 : 0) + (s.body ? countSyncs(s.body) : 0), 0);
export const dropRedundantSyncs = k.rule("drop_redundant_syncs").match(P.op("kernel.kernel").as("n").where(({ n }) => countSyncs(dropSyncs(n.attrs.K.body)) < countSyncs(n.attrs.K.body)))
  .rewrite(({ n }) => n.with({ attrs: { K: { ...n.attrs.K, body: dropSyncs(n.attrs.K.body) } } }))
  .describe("remove a barrier that directly follows another, or ends the kernel");

export const kernelPass = k.pass("lowering/kernel").short("k").rules(materializeRule, dropRedundantSyncs)
  .describe("materialize Tile IR into Kernel IR, then peepholes");
