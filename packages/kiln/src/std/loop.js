// Loop IR. A loop.kernel holds one kernel as an expression over its output coordinates
// (a0, a1, …): loads from its inputs, scalar ops, and reductions with their own variables.
// Expressions are hash-consed up to renaming of reduction variables, so a reduction that appears
// twice is one value. Scheduling places every value at the outermost loop where all its variables are
// bound (loop-invariant hoisting), which turns fused softmax into three sweeps per row, like the blog.
import { k, P, KilnError } from "../core/kiln.js";
import { Tensor, numel, strides, hash } from "../core/util.js";
import * as IX from "../core/ix.js";
import { FNS, FLOAT32_FUNCTIONS, FLOAT32_REDUCERS, fn as F, reducer, jsInit, INTEGER_DTYPES } from "./fns.js";

// ----------------------------------------------------------------------------- expressions
const INTERN = new Map();
const FREE = new WeakMap();
let RV = 0;
export const freshR = () => "r" + RV++;
const COMM = new Set(["add", "mul", "multiply", "max", "maximum", "min", "minimum"]);

function intern(o) {
  const key = akey(o, []);
  let x = INTERN.get(key);
  if (!x) { x = Object.freeze({ ...o, __key: key }); INTERN.set(key, x); if (INTERN.size > 400000) INTERN.clear(); }
  return x;
}
// α-normalized key: bound reduction variables print as de Bruijn distances
function akey(o, bound) {
  const name = (v) => { const i = bound.lastIndexOf(v); return i < 0 ? v : "$" + (bound.length - 1 - i); };
  switch (o.k) {
    case "num": return "#" + o.v;
    case "in": {
      if (!bound.length) return `in${o.i}[${o.idx.map(IX.keyOf).join(",")}]`;
      const env = {}; for (const v of bound) env[v] = IX.V(name(v));
      return `in${o.i}[${o.idx.map((e) => IX.keyOf(IX.subst(e, env))).join(",")}]`;
    }
    case "op": return `${o.fn}(${o.a.map((x) => (bound.length && intersects(free(x), bound) ? akey(x, bound) : x.__key || akey(x, []))).join(",")})`;
    case "red": return `red:${o.fn}:${o.n}{${akey(o.body, [...bound, o.r])}}`;
  }
  throw new Error("bad expression " + o.k);
}
const intersects = (set, arr) => arr.some((v) => set.has(v));
export function free(x) {
  let f = FREE.get(x);
  if (f) return f;
  if (x.k === "num") f = new Set();
  else if (x.k === "in") { f = new Set(); for (const e of x.idx) IX.vars(e, f); }
  else if (x.k === "op") { f = new Set(); for (const a of x.a) for (const v of free(a)) f.add(v); }
  else { f = new Set(free(x.body)); f.delete(x.r); }
  FREE.set(x, f);
  return f;
}
export const E = {
  num: (v) => intern({ k: "num", v: +v }),
  load: (i, idx) => intern({ k: "in", i, idx: idx.map(IX.lift) }),
  op: (fnName, ...a) => {
    F(fnName);
    if (a.every((x) => x.k === "num")) {
      // folding: a typed integer result is exact (literals are integral numbers); a float one rounds to f32
      if (INTEGER_DTYPES.has(F(fnName).type)) return E.num(Number(F(fnName).js(...a.map((x) => x.v))));
      return E.num(Math.fround(F(fnName).js(...a.map((x) => (F(fnName).args === "*" ? x.v : Math.fround(x.v))))));
    }
    if (COMM.has(fnName) && a.length === 2 && a[0].__key > a[1].__key) a = [a[1], a[0]];
    return intern({ k: "op", fn: fnName, a });
  },
  red: (fnName, r, n, body) => { reducer(fnName); return intern({ k: "red", fn: fnName, r, n, body }); },
};
// substitute index variables (coordinates or reduction vars) inside an expression
export function substE(x, env, remapIn = null) {
  switch (x.k) {
    case "num": return x;
    // remapIn renumbers this expression's own inputs, including data-dependent index terms; it applies
    // before env, whose values already use the caller's numbering
    case "in": return E.load(remapIn ? remapIn(x.i) : x.i, x.idx.map((e) => IX.subst(remapIn ? IX.remapLoads(e, remapIn) : e, env)));
    case "op": return E.op(x.fn, ...x.a.map((a) => substE(a, env, remapIn)));
    case "red": { const r = freshR(); return E.red(x.fn, r, x.n, substE(x.body, { ...env, [x.r]: IX.V(r) }, remapIn)); }
  }
}
export function walkE(x, fnv, seen = new Set()) {
  if (seen.has(x)) return;
  seen.add(x);
  if (x.k === "op") x.a.forEach((a) => walkE(a, fnv, seen));
  if (x.k === "red") walkE(x.body, fnv, seen);
  fnv(x);
}
export function printE(x, names = (i) => "in" + i) {
  switch (x.k) {
    case "num": return String(+x.v.toPrecision(6));
    case "in": return `${names(x.i)}[${x.idx.map((e) => IX.print(e)).join(", ")}]`;
    case "op": return `${x.fn}(${x.a.map((a) => printE(a, names)).join(", ")})`;
    case "red": return `${x.fn}_{${x.r}<${x.n}} ${printE(x.body, names)}`;
  }
}

// ----------------------------------------------------------------------------- scheduling
// returns { dims, stmts, loads, reds, values } where stmts is the Loop IR nest:
//   for {v, n, kind, body} · let {name, e:{in|op}} · init {name, fn} · acc {name, fn, val} · write {idx, val}
const SCHED = new WeakMap();
export function schedule(expr, shape) {
  const ck = SCHED.get(expr);
  if (ck && ck.shape === shape.join()) return ck.s;
  // drop size-1 output dims: their coordinate is 0
  const env = {};
  const dims = [];
  shape.forEach((d, i) => { if (d === 1) env["a" + i] = IX.C(0); else dims.push({ v: "a" + i, n: d, dim: i }); });
  const x = Object.keys(env).length ? substE(expr, env) : expr;
  // scopes: root → a… output loops → reduction loops
  const root = { id: "root", depth: 0, items: [], kids: [] };
  const scopes = [root];
  let cur = root;
  const binder = new Map();
  for (const d of dims) { const s = { id: d.v, depth: cur.depth + 1, parent: cur, items: [], kids: [], loop: { v: d.v, n: d.n, kind: "free" } }; cur.kids.push(s); binder.set(d.v, s); scopes.push(s); cur = s; }
  const inner = cur;
  // collect nodes (post-order: deps first)
  const order = [];
  walkE(x, (n) => { if (n.k !== "num") order.push(n); });
  const deepest = (vars) => { let best = root; for (const v of vars) { const b = binder.get(v); if (!b) throw new KilnError("ScheduleError", `index variable ${v} is not bound in this kernel`); if (b.depth > best.depth) best = b; } return best; };
  // place reductions top-down (an outer reduction before the ones in its body)
  const placed = new Map();
  const reds = order.filter((n) => n.k === "red").reverse();
  const pending = new Set(reds);
  let guard = 0;
  while (pending.size && guard++ < 10000) {
    for (const r of [...pending]) {
      const vars = [...free(r)];
      if (vars.some((v) => !binder.has(v))) continue;          // an enclosing reduction is not placed yet
      const s = deepest(vars);
      const loop = { id: r.r, depth: s.depth + 1, parent: s, items: [], kids: [], loop: { v: r.r, n: r.n, kind: "reduce" }, red: r };
      s.kids.push(loop); scopes.push(loop); binder.set(r.r, loop); placed.set(r, s); pending.delete(r);
    }
  }
  if (pending.size) throw new KilnError("ScheduleError", "could not place every reduction (a variable escapes its loop)");
  for (const n of order) { if (n.k === "red") { placed.get(n).items.push(n); continue; } const s = deepest([...free(n)]); placed.set(n, s); s.items.push(n); }
  // names
  const names = new Map();
  let ni = 0, nv = 0, na = 0;
  for (const n of order) names.set(n, n.k === "in" ? "in" + ni++ : n.k === "op" ? "v" + nv++ : "acc" + na++);
  const opnd = (n) => (n.k === "num" ? { num: n.v } : { ref: names.get(n) });
  const loopOf = new Map(scopes.filter((s) => s.red).map((s) => [s.red, s]));
  // emission
  const emitScope = (s) => {
    const out = [];
    for (const n of s.items) {
      if (n.k === "in") out.push({ s: "let", name: names.get(n), e: { k: "in", i: n.i, idx: n.idx }, node: n });
      else if (n.k === "op") out.push({ s: "let", name: names.get(n), e: { k: "op", fn: n.fn, a: n.a.map(opnd) }, node: n });
      else {
        const L = loopOf.get(n);
        out.push({ s: "init", name: names.get(n), fn: n.fn });
        out.push({ s: "for", v: n.r, n: n.n, kind: "reduce", body: [...emitScope(L), { s: "acc", name: names.get(n), fn: n.fn, val: opnd(n.body) }], red: names.get(n) });
      }
    }
    const kid = s.kids.find((c) => c.loop && c.loop.kind === "free");
    if (kid) out.push({ s: "for", v: kid.loop.v, n: kid.loop.n, kind: "free", body: emitScope(kid) });
    if (s === inner) out.push({ s: "write", idx: shape.map((_, i) => (env["a" + i] ? IX.C(0) : IX.V("a" + i))), val: opnd(x) });
    return out;
  };
  const stmts = emitScope(root);
  const loads = order.filter((n) => n.k === "in");
  const res = { dims, stmts, loads, reds: order.filter((n) => n.k === "red"), placed, names, expr: x, shape, inner, root, scopes };
  SCHED.set(expr, { shape: shape.join(), s: res });
  return res;
}

// display names for reduction variables: r0, r1, … in order of appearance
export function displayNames(sched) {
  const m = {};
  let i = 0;
  const walk = (ss) => { for (const s of ss) if (s.s === "for") { if (s.kind === "reduce" && !(s.v in m)) m[s.v] = IX.V("r" + i++); walk(s.body); } };
  walk(sched.stmts);
  return m;
}
export function printNest(sched, bufName = (i) => "in" + i, outName = "out") {
  const R = displayNames(sched);
  const ix = (e) => IX.print(IX.subst(e, R));
  const op = (o) => (o.ref ?? String(+o.num.toPrecision(6)));
  const lines = [];
  const walk = (ss, d) => {
    const pad = "    ".repeat(d);
    for (const s of ss) {
      if (s.s === "for") { lines.push(`${pad}for ${s.kind === "reduce" ? R[s.v].v : s.v} in 0..${s.n}:  # ${s.kind}`); walk(s.body, d + 1); }
      else if (s.s === "let") lines.push(`${pad}${s.name} = ${s.e.k === "in" ? `load ${bufName(s.e.i)}[${s.e.idx.map(ix).join(", ")}]` : `${s.e.fn}(${s.e.a.map(op).join(", ")})`}`);
      else if (s.s === "init") lines.push(`${pad}${s.name} = ${((v) => (v == 0 ? "0" : v == 1 ? "1" : typeof v === "bigint" ? String(v) : s.fn === "max" ? "-inf" : "+inf"))(reducer(s.fn).init)}`);
      else if (s.s === "acc") lines.push(`${pad}${s.name} <- ${s.fn}(${s.name}, ${op(s.val)})`);
      else if (s.s === "write") lines.push(`${pad}${outName}[${s.idx.map(ix).join(", ")}] = ${op(s.val)}`);
    }
  };
  walk(sched.stmts, 0);
  return lines.join("\n");
}

// work estimate for fusion decisions: ops and memory traffic weighted by trip counts
const W_MEM = 12;
export function workOf(sched) {
  let w = 0;
  const walk = (ss, trips) => {
    for (const s of ss) {
      if (s.s === "for") walk(s.body, trips * s.n);
      else if (s.s === "let") w += trips * (s.e.k === "in" ? W_MEM : FNS[s.e.fn]?.flops ?? 1);
      else if (s.s === "acc") w += trips;
      else if (s.s === "write") w += trips * W_MEM;
    }
  };
  walk(sched.stmts, 1);
  return w;
}

// ----------------------------------------------------------------------------- serial evaluator
// JS spelling of an index over inputs I0…: data-dependent terms read the (possibly BigInt) input element
const jsIndex = (inShapes) => {
  const flat = (idx, st) => idx.reduce((acc, e, j) => (st[j] === 0 ? acc : acc.add(IX.lift(e).mul(st[j]))), IX.C(0));
  const js = (e) => IX.emit(e, "js", (v) => v, (i, idx, r) => `Number(I${i}[${r(flat(idx, strides(inShapes[i])))}])`);
  return { js, flat };
};
// compiles the nest to a JS function: the reference every GPU schedule is checked against
const EVAL = new WeakMap();
export function compileSerial(sched, inShapes) {
  const key = inShapes.map((s) => s.join("x")).join("|");
  const ck = EVAL.get(sched);
  if (ck && ck.key === key) return ck.fn;
  const outSt = strides(sched.shape);
  const { js, flat } = jsIndex(inShapes);
  const body = [];
  const op = (o) => (o.ref ?? `(${Math.fround(o.num)})`);
  const walk = (ss, pad) => {
    for (const s of ss) {
      if (s.s === "for") { body.push(`${pad}for (let ${s.v} = 0; ${s.v} < ${s.n}; ${s.v}++) {`); walk(s.body, pad + "  "); body.push(`${pad}}`); }
      else if (s.s === "let") {
        if (s.e.k === "in") body.push(`${pad}const ${s.name} = I${s.e.i}[${js(flat(s.e.idx, strides(inShapes[s.e.i])))}];`);
        else { const f = FNS[s.e.fn]; body.push(`${pad}const ${s.name} = F.${s.e.fn}(${s.e.a.map(op).join(", ")});`); if (!f) throw new KilnError("EvalError", "unknown fn " + s.e.fn); }
      } else if (s.s === "init") body.push(`${pad}let ${s.name} = ${jsInit(s.fn)};`);
      else if (s.s === "acc") body.push(`${pad}${s.name} = R.${s.fn}(${s.name}, ${op(s.val)});`);
      else if (s.s === "write") body.push(`${pad}O[${js(flat(s.idx, outSt))}] = W(${op(s.val)});`);
    }
  };
  walk(sched.stmts, "  ");
  // int64 storage takes BigInts; a literal operand of a polymorphic select is a number
  const src = `return function kernel(I, O) {\n  const W = O instanceof BigInt64Array ? BigInt : (x) => x;\n${inShapes.map((_, i) => `  const I${i} = I[${i}];`).join("\n")}\n${body.join("\n")}\n};`;
  const fnc = new Function("F", "R", src)(FLOAT32_FUNCTIONS, FLOAT32_REDUCERS);
  fnc.source = src;
  EVAL.set(sched, { key, fn: fnc });
  return fnc;
}
// one output element at a flat index: the reference for sampled checks of big kernels
const POINT = new WeakMap();
export function compilePoint(sched, inShapes) {
  const key = inShapes.map((s) => s.join("x")).join("|");
  const ck = POINT.get(sched);
  if (ck && ck.key === key) return ck.fn;
  const outSt = strides(sched.shape);
  const { js, flat } = jsIndex(inShapes);
  const op = (o) => (o.ref ?? `(${Math.fround(o.num)})`);
  const body = [];
  for (const d of sched.dims) body.push(`  const ${d.v} = Math.floor(e / ${outSt[d.dim]}) % ${d.n};`);
  const walk = (ss, pad) => {
    for (const s of ss) {
      if (s.s === "for" && s.kind === "free") walk(s.body, pad);
      else if (s.s === "for") { body.push(`${pad}for (let ${s.v} = 0; ${s.v} < ${s.n}; ${s.v}++) {`); walk(s.body, pad + "  "); body.push(`${pad}}`); }
      else if (s.s === "let") body.push(s.e.k === "in" ? `${pad}const ${s.name} = I${s.e.i}[${js(flat(s.e.idx, strides(inShapes[s.e.i])))}];` : `${pad}const ${s.name} = F.${s.e.fn}(${s.e.a.map(op).join(", ")});`);
      else if (s.s === "init") body.push(`${pad}let ${s.name} = ${jsInit(s.fn)};`);
      else if (s.s === "acc") body.push(`${pad}${s.name} = R.${s.fn}(${s.name}, ${op(s.val)});`);
      else if (s.s === "write") body.push(`${pad}return ${op(s.val)};`);
    }
  };
  walk(sched.stmts, "  ");
  const src = `return function point(I, e) {\n${inShapes.map((_, i) => `  const I${i} = I[${i}];`).join("\n")}\n${body.join("\n")}\n};`;
  const fnc = new Function("F", "R", src)(FLOAT32_FUNCTIONS, FLOAT32_REDUCERS);
  POINT.set(sched, { key, fn: fnc });
  return fnc;
}
export function runSerial(expr, shape, inputs, dtype = "f32") {
  const sched = schedule(expr, shape);
  const f = compileSerial(sched, inputs.map((t) => t.shape));
  const out = new Tensor(shape, null, dtype);
  f(inputs.map((t) => t.data), out.data);
  return out;
}

// ----------------------------------------------------------------------------- the dialect
export const loop = k.dialect("loop").describe("Loop IR: one kernel per node, an expression scheduled into a loop nest")
  .op("kernel", {
    args: { variadic: "ins" },
    attrs: { expr: null, shape: [], outDtype: "f32", name: null, origin: [] },
    infer: ({ shape, outDtype }) => k.tensor(shape, outDtype),
    eval: ({ args, expr, shape, outDtype }) => runSerial(expr, shape, args.map((a) => (a instanceof Tensor ? a : new Tensor([], Float32Array.of(a)))), outDtype),
    print: ({ name, ins }) => `loop.kernel ${name || "·"}(${ins})`,
    body: ({ expr, shape, args }) => printNest(schedule(expr, shape), (i) => args[i] ?? "in" + i),
    identity: ({ expr, shape, args }) => hash(`loop|${expr.__key}|${shape.join("x")}|${args.map((a) => a.type.shape.join("x")).join(",")}`),
    keyIgnore: ["name", "origin"],
  });

// ----------------------------------------------------------------------------- l: lift
const isSplat = (v) => v.is("tensor.const") && !v.attrs.data;
const coords = (n) => IX.coordVars(n);
const mkKernel = (args, expr, shape, origin, outDtype = "f32") => loop.kernel(args, { expr, shape, outDtype, origin: origin ? [origin] : [] });
export const liftEw = k.rule("lift_elementwise").match(P.op("tensor.ew").as("n")).rewrite(({ n }) => {
  const ins = [];
  const shape = n.type.shape;
  const ops = n.args.map((a) => {
    if (isSplat(a)) return E.num(a.attrs.value);
    let i = ins.findIndex((x) => x.id === a.id);
    if (i < 0) { ins.push(a); i = ins.length - 1; }
    return E.load(i, coords(shape.length).slice(shape.length - a.type.shape.length));
  });
  let expr = E.op(n.attrs.fn, ...ops);
  if (["f16", "bf16"].includes(n.type.dtype)) expr = E.op("round_" + n.type.dtype, expr);
  return mkKernel(ins, expr, shape, n.attrs.origin, n.type.dtype);
});
export const liftReduce = k.rule("lift_reduce").match(P.op("tensor.reduce").as("n")).rewrite(({ n }) => {
  const x = n.arg("x"), s = x.type.shape, ax = n.attrs.axis;
  const r = freshR();
  const idx = coords(s.length).map((c, i) => (i === ax ? IX.V(r) : c));
  return mkKernel([x], E.red(n.attrs.fn, r, s[ax], E.load(0, idx)), n.type.shape, n.attrs.origin, n.type.dtype);
});
export const liftView = k.rule("lift_indexmap").match(P.op("tensor.view").as("n")).rewrite(({ n }) => mkKernel([n.arg("x")], E.load(0, n.attrs.map.exprs), n.attrs.shape, n.attrs.origin, n.type.dtype));
// a gather is a view whose map reads its index argument through data-dependent terms LD(1, …)
export const liftGather = k.rule("lift_gather").match(P.op("tensor.gather").as("n")).rewrite(({ n }) => mkKernel([n.arg("x"), n.arg("ids")], E.load(0, n.attrs.map.exprs), n.attrs.shape, n.attrs.origin, n.type.dtype));
export const liftSplatOut = k.rule("lift_constant_output").match(P.op("tensor.const").as("n").where(({ n, graph }) => !n.attrs.data && graph.isOutput(n.id)))
  .rewrite(({ n }) => mkKernel([], E.num(n.attrs.value), n.type.shape, "constant", n.type.dtype));
export const lift = k.pass("loop/lowering").short("l").rules(liftEw, liftReduce, liftView, liftGather, liftSplatOut)
  .describe("each Tensor IR primitive becomes a one-op loop kernel");

// ----------------------------------------------------------------------------- f: fusion
// a producer that cannot be substituted into a consumer; the fusion rule skips it
export class FusionIllegal extends Error {}
// inline producer kernel p into consumer c: every load of p becomes p's expression at that index
export function inlineInto(c, p) {
  const cArgs = c.args, pArgs = p.args;
  const pi = cArgs.findIndex((a) => a.id === p.id);
  const args = cArgs.filter((a) => a.id !== p.id);
  const mapC = new Map(), mapP = new Map();
  cArgs.forEach((a, i) => { if (a.id !== p.id) mapC.set(i, args.findIndex((b) => b.id === a.id)); });
  pArgs.forEach((a, i) => { let j = args.findIndex((b) => b.id === a.id); if (j < 0) { args.push(a); j = args.length - 1; } mapP.set(i, j); });
  const pe = p.attrs.expr;
  // data-dependent index terms: renumber their inputs; one that reads p itself becomes p's value at
  // that index, which is expressible only when p is a pure load (a view of an integer tensor)
  const remapIdx = (e) => IX.mapLoads(e, (l) => {
    if (cArgs[l.v.i].id !== p.id) return IX.LD(mapC.get(l.v.i), l.v.idx);
    if (pe.k !== "in") throw new FusionIllegal(`${c.id} indexes by ${p.id}, which is not a view`);
    const env = {}; l.v.idx.forEach((x, j) => { env["a" + j] = x; });
    return IX.LD(mapP.get(pe.i), pe.idx.map((x) => IX.remapLoads(IX.subst(x, env), (i) => mapP.get(i))));
  });
  // every reduction gets a fresh variable, so two reductions never share a name in one kernel
  const rw = (x, ren) => {
    switch (x.k) {
      case "num": return x;
      case "in": {
        const idx = x.idx.map((e) => remapIdx(IX.subst(e, ren)));
        if (cArgs[x.i].id === p.id) { const env = {}; idx.forEach((e, j) => { env["a" + j] = e; }); return substE(pe, env, (i) => mapP.get(i)); }
        return E.load(mapC.get(x.i), idx);
      }
      case "op": return E.op(x.fn, ...x.a.map((a) => rw(a, ren)));
      case "red": { const r = freshR(); return E.red(x.fn, r, x.n, rw(x.body, { ...ren, [x.r]: IX.V(r) })); }
    }
  };
  if (pi < 0) throw new KilnError("FusionError", `${p.id} is not an input of ${c.id}`);
  return { expr: rw(c.attrs.expr, {}), args, origin: [...new Set([...(p.attrs.origin || []), ...(c.attrs.origin || [])])] };
}
const kernelWork = (n) => workOf(schedule(n.attrs.expr, n.attrs.shape));
export { chooseFusionSubset } from "./fusion.js";
export function createFusionRule(options={}) {
  if(!options||typeof options!=="object"||Array.isArray(options)||Object.keys(options).some(k=>!["maxWorkGrowth","decide","selectConsumers","onDecision"].includes(k)))throw new TypeError("Unknown fusion rule option; use selectConsumers for region selection");
  const {maxWorkGrowth=1.02,decide=null,selectConsumers=null,onDecision=null}=options;
  if (!Number.isFinite(maxWorkGrowth) || maxWorkGrowth<0) throw new TypeError("maxWorkGrowth must be finite and nonnegative");
  if (decide!==null && typeof decide!=="function") throw new TypeError("fusion decide must be a function");
  if (selectConsumers!==null && typeof selectConsumers!=="function") throw new TypeError("fusion region selector must be a function");
  if (onDecision!==null && typeof onDecision!=="function") throw new TypeError("fusion observer must be a function");
  return k.rule("merge_loop_ops")
  .match(P.op("loop.kernel").as("p").where(({ p, graph }) => !graph.isOutput(p.id) && p.users.length > 0 && p.users.every((u) => u.is("loop.kernel"))))
  .mutate(({ p, tx, skip }) => {
    const consumers=p.users,replacements=[],edges=[];
    // Plan against the same graph before editing any consumer. Cost features
    // describe one proposed edge substitution, not a removed producer.
    const producerWork=selectConsumers?kernelWork(p):null,producerElements=numel(p.attrs.shape);
    for (const [consumerIndex,u] of consumers.entries()) {
      let replacement;
      try { replacement=inlineInto(u,p); } catch (e) { if (e instanceof FusionIllegal) skip(e.message); throw e; }
      replacements.push(replacement);
      if (selectConsumers) {
        edges.push(Object.freeze({producerWork,consumerWork:kernelWork(u),
          fusedConsumerWork:workOf(schedule(replacement.expr,u.attrs.shape)),
          consumerCount:consumers.length,consumerIndex,
          producerElements,consumerElements:numel(u.attrs.shape)}));
      }
    }
    const region=selectConsumers?Object.freeze({producerWork,producerElements,consumers:Object.freeze(edges)}):null;
    const selected=selectConsumers?selectConsumers(region):consumers.map((_,i)=>i);
    if(!Array.isArray(selected)||new Set(selected).size!==selected.length||selected.some(i=>!Number.isSafeInteger(i)||i<0||i>=consumers.length))throw new TypeError("fusion region selector must return distinct valid consumer indices");
    if (!selected.length) skip("fusion region selector selected no consumers");
    for (const i of selected) {
      const replacement=replacements[i];
      tx.set(consumers[i],{args:replacement.args,attrs:{expr:replacement.expr,origin:replacement.origin}});
    }
  })
  .guard(({ before, after, root }) => {
    const users = before.users(root);
    const was = kernelWork(before.value(root)) + users.reduce((a, u) => a + kernelWork(before.value(u)), 0);
    // Partial fusion leaves p live for unselected consumers. Include that
    // materialization in the same aggregate guard used for complete fusion.
    const retainedProducer=after.nodes.has(root);
    const now = (retainedProducer ? kernelWork(after.value(root)) : 0)
      + users.reduce((a, u) => a + (after.nodes.has(u) ? kernelWork(after.value(u)) : 0), 0);
    const producer=before.value(root);
    const features=Object.freeze({originalWork:was,fusedWork:now,consumerCount:users.length,
      producerElements:producer.attrs.shape.reduce((a,b)=>a*b,1)});
    const decision=decide ? decide(features) : now <= was * maxWorkGrowth || `blowup: fused work ${Math.round(now).toLocaleString()} > unfused ${Math.round(was).toLocaleString()}`;
    if (typeof decision!=="boolean" && typeof decision!=="string") throw new TypeError("fusion policy must return a Boolean or rejection reason");
    onDecision?.(Object.freeze({...features,selectedConsumerCount:users.filter(u=>before.node(u)!==after.node(u)).length,
      retainedProducer,accepted:decision===true,reason:typeof decision==="string"?decision:null}));
    return decision;
  })
  .describe("inline a producer kernel into selected consumers subject to an aggregate work guard");
}
export const mergeLoopOps = createFusionRule();
export const fuse = k.pass("loop/fusion").short("f").rules(mergeLoopOps).order("reverse").describe("maximal fusion, consumers first, with a blowup guard");

// ----------------------------------------------------------------------------- s: stamp names
export const stampNames = k.rule("stamp_loop_names").match(P.op("loop.kernel").as("n").where(({ n }) => !n.attrs.name)).rewrite(({ n, graph }) => {
  const o = (n.attrs.origin || []).filter(Boolean);
  const base = o.length ? o.slice(0, 3).join("_") : "kernel";
  const red = schedule(n.attrs.expr, n.attrs.shape).reds.length ? "_reduce" : "";
  // a program with several outputs: name each output's kernel after the output
  const outs = graph.outputs.filter((x) => x.id === n.id);
  let name = (graph.outputs.length > 1 && outs.length === 1 ? `k_${outs[0].name}` : `k_${base}${red}`).replace(/[^\w]/g, "_");
  const taken = new Set([...graph.nodes.values()].map((x) => x.attrs.name).filter(Boolean));
  if (taken.has(name)) { let i = 2; while (taken.has(name + "_" + i)) i++; name += "_" + i; }
  return n.with({ attrs: { name } });
});
export const stamp = k.pass("loop/stamp").short("s").rules(stampNames).describe("name each kernel after the ops it realizes");
