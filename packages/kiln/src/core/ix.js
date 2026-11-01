// Integer index expressions: the affine-ish algebra that coordinate maps, loop bounds and kernel
// addresses are written in. Nodes are small immutable objects; every constructor simplifies.
// Ops: + * (by anything) / % (floor, by positive constants mostly) min max, comparisons and && ||.

export class Ix {
  constructor(t, a, b, v) { this.t = t; this.a = a; this.b = b; this.v = v; Object.freeze(this); }
  add(x) { return add(this, lift(x)); }
  sub(x) { return add(this, mul(lift(x), C(-1))); }
  mul(x) { return mul(this, lift(x)); }
  div(x) { return div(this, lift(x)); }
  mod(x) { return mod(this, lift(x)); }
  min(x) { return bin("min", this, lift(x)); }
  max(x) { return bin("max", this, lift(x)); }
  lt(x) { return cmp("<", this, lift(x)); }
  le(x) { return cmp("<=", this, lift(x)); }
  gt(x) { return cmp("<", lift(x), this); }
  ge(x) { return cmp("<=", lift(x), this); }
  eq(x) { return cmp("==", this, lift(x)); }
  and(x) { return bin("&&", this, lift(x)); }
  or(x) { return bin("||", this, lift(x)); }
  toString() { return print(this); }
}
export const C = (v) => new Ix("c", null, null, Math.trunc(v));
export const V = (name) => new Ix("v", null, null, name);
// a data-dependent index term (P3a slice 2): the integer stored in kernel input i at index idx.
// Opaque to the affine algebra; substitution, variables and keys recurse into idx.
export const LD = (i, idx) => new Ix("ld", null, null, Object.freeze({ i, idx: Object.freeze(idx.map(lift)) }));
const mapLd = (e, f) => LD(e.v.i, e.v.idx.map(f));
export const loadsOf = (e, out = []) => { if (e.t === "ld") { out.push(e); e.v.idx.forEach((x) => loadsOf(x, out)); } else if (e.t !== "c" && e.t !== "v") { loadsOf(e.a, out); loadsOf(e.b, out); } return out; };
export const isIx = (x) => x instanceof Ix;
export function lift(x) {
  if (x instanceof Ix) return x;
  if (typeof x === "number") return C(Math.trunc(x));
  if (typeof x === "string") return V(x);
  throw new TypeError("not an index expression: " + String(x));
}
const isC = (e, v) => e.t === "c" && (v === undefined || e.v === v);

// ---------- linear normal form: sum of coef * term + const ----------
function linear(e) {
  const terms = new Map();
  let c = 0;
  const addTerm = (t, k) => {
    if (k === 0) return;
    const key = keyOf(t);
    const cur = terms.get(key);
    if (cur) { cur.k += k; if (cur.k === 0) terms.delete(key); } else terms.set(key, { t, k });
  };
  const walk = (x, k) => {
    if (x.t === "c") c += k * x.v;
    else if (x.t === "+") { walk(x.a, k); walk(x.b, k); }
    else if (x.t === "*" && isC(x.a)) walk(x.b, k * x.a.v);
    else if (x.t === "*" && isC(x.b)) walk(x.a, k * x.b.v);
    else addTerm(x, k);
  };
  walk(e, 1);
  return { terms: [...terms.values()], c };
}
function rebuild({ terms, c }) {
  const parts = terms.slice().sort((p, q) => (keyOf(p.t) < keyOf(q.t) ? -1 : 1)).map(({ t, k }) => (k === 1 ? t : new Ix("*", C(k), t)));
  if (c !== 0 || !parts.length) parts.push(C(c));
  return parts.reduce((acc, p) => (acc ? new Ix("+", acc, p) : p), null);
}
function add(a, b) {
  if (isC(a) && isC(b)) return C(a.v + b.v);
  if (isC(a, 0)) return b;
  if (isC(b, 0)) return a;
  return rebuild(linear(new Ix("+", a, b)));
}
function mul(a, b) {
  if (isC(a) && isC(b)) return C(a.v * b.v);
  if (isC(a, 0) || isC(b, 0)) return C(0);
  if (isC(a, 1)) return b;
  if (isC(b, 1)) return a;
  if (isC(b)) [a, b] = [b, a];
  if (isC(a)) {
    // distribute a constant over a linear form
    const L = linear(b);
    return rebuild({ terms: L.terms.map(({ t, k }) => ({ t, k: k * a.v })), c: L.c * a.v });
  }
  return new Ix("*", a, b);
}
function div(a, b) {
  if (isC(b, 1)) return a;
  if (isC(a) && isC(b) && b.v !== 0) return C(Math.floor(a.v / b.v));
  if (isC(b) && b.v > 0) {
    // (k*b*x + r) / b → k*x + r/b when every coefficient divides and 0 <= const < b
    // floor((b*X + c) / b) = X + floor(c / b) for integer X
    const L = linear(a);
    if (L.terms.every(({ k }) => k % b.v === 0)) return rebuild({ terms: L.terms.map(({ t, k }) => ({ t, k: k / b.v })), c: Math.floor(L.c / b.v) });
  }
  return new Ix("/", a, b);
}
function mod(a, b) {
  if (isC(b, 1)) return C(0);
  if (isC(a) && isC(b) && b.v !== 0) return C(((a.v % b.v) + b.v) % b.v);
  if (isC(b) && b.v > 0) {
    const L = linear(a);
    const keep = L.terms.filter(({ k }) => k % b.v !== 0);
    const c = ((L.c % b.v) + b.v) % b.v;
    if (keep.length !== L.terms.length || c !== L.c) return mod(rebuild({ terms: keep, c }), b);
    if (!keep.length) return C(c);
  }
  return new Ix("%", a, b);
}
function bin(op, a, b) {
  if (isC(a) && isC(b)) return C(op === "min" ? Math.min(a.v, b.v) : op === "max" ? Math.max(a.v, b.v) : op === "&&" ? +(a.v && b.v) : +(a.v || b.v));
  if (op === "&&") { if (isC(a)) return a.v ? b : C(0); if (isC(b)) return b.v ? a : C(0); }
  if (op === "||") { if (isC(a)) return a.v ? C(1) : b; if (isC(b)) return b.v ? C(1) : a; }
  return new Ix(op, a, b);
}
function cmp(op, a, b) {
  if (isC(a) && isC(b)) return C(op === "<" ? +(a.v < b.v) : op === "<=" ? +(a.v <= b.v) : +(a.v === b.v));
  return new Ix(op, a, b);
}

export const ix = {
  c: C, v: V, lift, add: (...xs) => xs.map(lift).reduce(add), mul: (...xs) => xs.map(lift).reduce(mul),
  div: (a, b) => div(lift(a), lift(b)), mod: (a, b) => mod(lift(a), lift(b)),
  min: (a, b) => bin("min", lift(a), lift(b)), max: (a, b) => bin("max", lift(a), lift(b)),
  lt: (a, b) => cmp("<", lift(a), lift(b)), le: (a, b) => cmp("<=", lift(a), lift(b)), eq: (a, b) => cmp("==", lift(a), lift(b)),
  and: (...xs) => xs.map(lift).reduce((p, q) => bin("&&", p, q)), or: (a, b) => bin("||", lift(a), lift(b)),
};

// ---------- queries and rewriting ----------
export function keyOf(e) {
  switch (e.t) {
    case "c": return String(e.v);
    case "v": return e.v;
    case "ld": return `ld${e.v.i}[${e.v.idx.map(keyOf).join(",")}]`;
    default: return `(${keyOf(e.a)}${e.t}${keyOf(e.b)})`;
  }
}
export function vars(e, out = new Set()) {
  if (e.t === "v") out.add(e.v);
  else if (e.t === "ld") e.v.idx.forEach((x) => vars(x, out));
  else if (e.t !== "c") { vars(e.a, out); vars(e.b, out); }
  return out;
}
// the simplifying constructor for a binary node kind
function op2(t, a, b) {
  switch (t) {
    case "+": return add(a, b);
    case "*": return mul(a, b);
    case "/": return div(a, b);
    case "%": return mod(a, b);
    case "min": case "max": case "&&": case "||": return bin(t, a, b);
    default: return cmp(t, a, b);
  }
}
export function subst(e, env) {
  switch (e.t) {
    case "c": return e;
    case "v": return env[e.v] !== undefined ? lift(env[e.v]) : e;
    case "ld": return mapLd(e, (x) => subst(x, env));
    default: return op2(e.t, subst(e.a, env), subst(e.b, env));
  }
}
// rewrite every data-dependent term bottom-up: f receives an ld whose index is already rewritten
export function mapLoads(e, f) {
  switch (e.t) {
    case "c": case "v": return e;
    case "ld": return f(mapLd(e, (x) => mapLoads(x, f)));
    default: return op2(e.t, mapLoads(e.a, f), mapLoads(e.b, f));
  }
}
// renumber the inputs that data-dependent terms read (kernel fusion merges argument lists)
export const remapLoads = (e, f) => mapLoads(e, (l) => LD(f(l.v.i), l.v.idx));
export function evalIx(e, env) {
  switch (e.t) {
    case "c": return e.v;
    case "v": { const x = env[e.v]; if (x === undefined) throw new Error(`index variable ${e.v} is not bound`); return x; }
    case "ld": { if (!env.__ld) throw new Error(`data-dependent index ld${e.v.i} needs input values`); return env.__ld(e.v.i, e.v.idx.map((x) => evalIx(x, env))); }
    case "+": return evalIx(e.a, env) + evalIx(e.b, env);
    case "*": return evalIx(e.a, env) * evalIx(e.b, env);
    case "/": return Math.floor(evalIx(e.a, env) / evalIx(e.b, env));
    case "%": { const b = evalIx(e.b, env); return ((evalIx(e.a, env) % b) + b) % b; }
    case "min": return Math.min(evalIx(e.a, env), evalIx(e.b, env));
    case "max": return Math.max(evalIx(e.a, env), evalIx(e.b, env));
    case "<": return +(evalIx(e.a, env) < evalIx(e.b, env));
    case "<=": return +(evalIx(e.a, env) <= evalIx(e.b, env));
    case "==": return +(evalIx(e.a, env) === evalIx(e.b, env));
    case "&&": return +(evalIx(e.a, env) && evalIx(e.b, env));
    case "||": return +(evalIx(e.a, env) || evalIx(e.b, env));
  }
  throw new Error("bad index expression " + e.t);
}
// Interval of e when every variable v lies in [0, extent(v)); null when unbounded.
export function interval(e, extent) {
  switch (e.t) {
    case "c": return [e.v, e.v];
    case "v": { const n = extent(e.v); return n > 0 ? [0, n - 1] : null; }
    case "ld": return null;
    case "+": { const a = interval(e.a, extent), b = interval(e.b, extent); return a && b ? [a[0] + b[0], a[1] + b[1]] : null; }
    case "*": {
      const a = interval(e.a, extent), b = interval(e.b, extent);
      if (!a || !b) return null;
      const p = [a[0] * b[0], a[0] * b[1], a[1] * b[0], a[1] * b[1]];
      return [Math.min(...p), Math.max(...p)];
    }
    case "/": {
      const a = interval(e.a, extent);
      return a && isC(e.b) && e.b.v > 0 ? [Math.floor(a[0] / e.b.v), Math.floor(a[1] / e.b.v)] : null;
    }
    case "%": {
      if (!isC(e.b) || e.b.v <= 0) return null;
      const a = interval(e.a, extent);
      return a && a[0] >= 0 && a[1] < e.b.v ? a : [0, e.b.v - 1];
    }
    case "min": case "max": {
      const a = interval(e.a, extent), b = interval(e.b, extent), f = Math[e.t];
      return a && b ? [f(a[0], b[0]), f(a[1], b[1])] : null;
    }
    default: return [0, 1];
  }
}
// Simplify e using variable ranges [0, extent(v)): a quotient whose dividend stays within one
// multiple of the divisor is constant, and a remainder of an in-range dividend is the dividend.
export function bounded(e, extent) {
  if (e.t === "c" || e.t === "v") return e;
  if (e.t === "ld") return mapLd(e, (x) => bounded(x, extent));
  const a = bounded(e.a, extent), b = bounded(e.b, extent);
  if ((e.t === "/" || e.t === "%") && isC(b) && b.v > 0) {
    const r = interval(a, extent);
    if (r && Math.floor(r[0] / b.v) === Math.floor(r[1] / b.v)) return e.t === "/" ? C(Math.floor(r[0] / b.v)) : add(a, C(-b.v * Math.floor(r[0] / b.v)));
  }
  return op2(e.t, a, b);
}
// a coefficient-and-constant reading when e is affine in `names` (null otherwise)
export function affine(e, names) {
  const L = linear(e);
  const out = { c: L.c, k: {} };
  for (const { t, k } of L.terms) {
    if (t.t !== "v" || !names.includes(t.v)) return null;
    out.k[t.v] = (out.k[t.v] || 0) + k;
  }
  return out;
}

const PREC = { "||": 1, "&&": 2, "==": 3, "<": 4, "<=": 4, "+": 5, "*": 6, "/": 6, "%": 6 };
export function print(e, parent = 0) {
  switch (e.t) {
    case "c": return e.v < 0 && parent > 0 ? `(${e.v})` : String(e.v);
    case "v": return e.v;
    case "ld": return `in${e.v.i}[${e.v.idx.map((x) => print(x)).join(", ")}]`;
    case "min": case "max": return `${e.t}(${print(e.a)}, ${print(e.b)})`;
  }
  const p = PREC[e.t];
  let s;
  if (e.t === "+" && e.b.t === "c" && e.b.v < 0) s = `${print(e.a, p)} - ${-e.b.v}`;
  else if (e.t === "+" && e.b.t === "*" && isC(e.b.a) && e.b.a.v < 0) s = `${print(e.a, p)} - ${e.b.a.v === -1 ? print(e.b.b, p + 1) : print(new Ix("*", C(-e.b.a.v), e.b.b), p + 1)}`;
  else s = `${print(e.a, p)} ${e.t} ${print(e.b, p + 1)}`;
  return p < parent ? `(${s})` : s;
}

// target spellings. `name` maps a variable to its spelling in the target.
const floorMod = (a, b) => `(((${a} % ${b}) + ${b}) % ${b})`;
// `load(i, idx)` spells a data-dependent term; emitters without integer buffers leave it unset.
export function emit(e, lang, name = (v) => v, load = null) {
  const r = (x) => emit(x, lang, name, load);
  switch (e.t) {
    case "c": return lang === "wgsl" ? `${e.v}i` : e.v < 0 ? `(${e.v})` : String(e.v);
    case "v": return name(e.v);
    case "ld": if (!load) throw new Error(`no ${lang} spelling for data-dependent index ld${e.v.i}`); return load(e.v.i, e.v.idx, r);
    case "+": return `(${r(e.a)} + ${r(e.b)})`;
    case "*": return `(${r(e.a)} * ${r(e.b)})`;
    // the algebra is floor division/modulo; C truncates. Coordinates are nonnegative, so the spellings
    // agree, but a dividend with a data-dependent term may be negative: spell floor semantics there
    case "/": return lang === "js" ? `Math.floor(${r(e.a)} / ${r(e.b)})` : lang === "c" && loadsOf(e.a).length ? `((${r(e.a)} - ${floorMod(r(e.a), r(e.b))}) / ${r(e.b)})` : `(${r(e.a)} / ${r(e.b)})`;
    case "%": return lang !== "wgsl" && loadsOf(e.a).length ? floorMod(r(e.a), r(e.b)) : `(${r(e.a)} % ${r(e.b)})`;
    case "min": return lang === "js" ? `Math.min(${r(e.a)}, ${r(e.b)})` : lang === "wgsl" ? `min(${r(e.a)}, ${r(e.b)})` : `min(${r(e.a)}, ${r(e.b)})`;
    case "max": return lang === "js" ? `Math.max(${r(e.a)}, ${r(e.b)})` : `max(${r(e.a)}, ${r(e.b)})`;
    case "&&": case "||": return `(${r(e.a)} ${e.t} ${r(e.b)})`;
    // comparisons are 0/1 integers, as in C: JS spells the number (a boolean indexes nothing)
    case "==": return lang === "js" ? `(+(${r(e.a)} === ${r(e.b)}))` : `(${r(e.a)} == ${r(e.b)})`;
    default: return lang === "js" ? `(+(${r(e.a)} ${e.t} ${r(e.b)}))` : `(${r(e.a)} ${e.t} ${r(e.b)})`;
  }
}

// JS source with evalIx's exact semantics (floor division, floor modulo via __mod, booleans as 0/1)
export function toJs(e) {
  const r = toJs;
  switch (e.t) {
    case "c": return e.v < 0 ? `(${e.v})` : String(e.v);
    case "v": return e.v;
    case "ld": return `__ld(${e.v.i}, [${e.v.idx.map(r).join(", ")}])`;
    case "+": return `(${r(e.a)} + ${r(e.b)})`;
    case "*": return `(${r(e.a)} * ${r(e.b)})`;
    case "/": return `Math.floor(${r(e.a)} / ${r(e.b)})`;
    case "%": return `__mod(${r(e.a)}, ${r(e.b)})`;
    case "min": return `Math.min(${r(e.a)}, ${r(e.b)})`;
    case "max": return `Math.max(${r(e.a)}, ${r(e.b)})`;
    case "==": return `+(${r(e.a)} === ${r(e.b)})`;
    case "&&": case "||": return `+(${r(e.a)} ${e.t} ${r(e.b)})`;
    default: return `+(${r(e.a)} ${e.t} ${r(e.b)})`;
  }
}

// ---------- coordinate maps: output coords a0..an-1 → input coords ----------
export class IxMap {
  constructor(n, exprs) { this.n = n; this.exprs = exprs; Object.freeze(this); }
  apply(coords) { const env = {}; coords.forEach((c, i) => { env["a" + i] = c; }); return this.exprs.map((e) => subst(e, env)); }
  toString() { return `(${Array.from({ length: this.n }, (_, i) => "a" + i).join(", ")}) → (${this.exprs.map((e) => print(e)).join(", ")})`; }
  key() { return this.n + ":" + this.exprs.map(keyOf).join(","); }
  isIdentity(inRank) { return inRank === this.n && this.exprs.every((e, i) => e.t === "v" && e.v === "a" + i); }
}
export const coordVars = (n) => Array.from({ length: n }, (_, i) => V("a" + i));
// build a map by tracing a lambda over symbolic coordinates: map(n, ([i, j]) => [j, i])
export function map(n, fn) {
  const out = fn(coordVars(n));
  return new IxMap(n, out.map(lift));
}
// consumer reads producer at c.exprs; producer reads its input at p.exprs: the composed map
export function compose(p, c) { const env = Object.fromEntries(c.exprs.map((x, i) => ["a" + i, x])); return new IxMap(c.n, p.exprs.map((e) => subst(e, env))); }
export function identity(n) { return new IxMap(n, coordVars(n)); }
