// kiln: a small, runnable core for building IRs, passes and compilers.
//   dialect · graph · trace · pattern (P) · rule · pass · pipeline · param · fork · decide · strategy
// Graphs are DAGs of immutable nodes. A pipeline run mutates one working graph and records every rule
// application (with a snapshot), every fork decision (with all its options) and every param read.
import { hash, clip, Tensor } from "./util.js";
import * as IX from "./ix.js";

// ============================================================================ types and markers
export const tensor = (shape = [], dtype = "f32") => ({ kind: "tensor", shape: [...shape], dtype });
export const scalar = (dtype = "f32") => tensor([], dtype);
export const typeStr = (t) => (!t ? "?" : t.kind === "tensor" ? (t.shape.length ? `(${t.shape.join(", ")}) ${t.dtype}` : t.dtype) : t.kind || String(t));
const marker = (kind) => { const m = { kind, def: undefined, opt: false }; m.default = (v) => ({ ...m, def: v }); m.optional = () => ({ ...m, opt: true }); return m; };
export const T = { number: marker("number"), int: marker("int"), string: marker("string"), bool: marker("bool"), any: marker("any"), fn: marker("fn"), list: () => marker("list"), enum: (...vs) => ({ ...marker("enum"), values: vs }) };

export class KilnError extends Error { constructor(kind, message, extra = {}) { super(message); this.kind = kind; this.name = kind; Object.assign(this, extra); } }
export class Skip extends Error { constructor(reason, { reject = false } = {}) { super(reason); this.reason = reason; this.reject = reject; this.name = "Skip"; } }
export const skip = (reason, opts) => { throw new Skip(reason, opts); };

// ============================================================================ build scopes
const SCOPES = [];
const scope = () => SCOPES[SCOPES.length - 1] || null;
function withScope(s, fn) { SCOPES.push(s); try { return fn(); } finally { SCOPES.pop(); } }

// methods contributed by dialects to value handles: x.add(y)
const METHODS = new Map(); // name → [{ dialect, fn }]
function methodFor(name, value) {
  const list = METHODS.get(name);
  if (!list || !list.length) return null;
  const d = value?._dialect?.();
  const s = scope();
  return (d && list.find((m) => m.dialect === d)) || (s?.dialect && list.find((m) => m.dialect === s.dialect)) || list[list.length - 1];
}
const HANDLER = {
  get(t, p, r) {
    if (p in t || typeof p === "symbol" || p === "then" || p === "toJSON") return Reflect.get(t, p, r);
    const m = methodFor(p, t);
    if (m) return (...a) => m.fn(r, ...a);
    return undefined;
  },
};

// ============================================================================ dialects and ops
export class OpTemplate { constructor(def, attrs) { this.def = def; this.attrs = attrs; } }

export class OpDef {
  constructor(dialect, short, spec = {}) {
    this.dialect = dialect; this.short = short; this.name = `${dialect.name}.${short}`; this.spec = spec;
    this.variadic = spec.args && !Array.isArray(spec.args) ? spec.args.variadic : null;
    this.argNames = Array.isArray(spec.args) ? spec.args : this.variadic ? [this.variadic] : [];
    this.attrSpec = spec.attrs || {};
    this.traits = new Set(spec.traits || []);
    const self = this;
    this.ctor = function (...a) { return self.call(a); };
    this.ctor.def = this;
    this.ctor.extend = (short2, spec2) => { dialect.op(short2, { ...spec, ...spec2 }); return dialect[short2]; };
  }
  defaults() { const o = {}; for (const [k, m] of Object.entries(this.attrSpec)) { if (m && typeof m === "object" && "def" in m && m.def !== undefined) o[k] = m.def; else if (m !== null && (typeof m !== "object" || !("kind" in m))) o[k] = m; } return o; }
  call(a) {
    // positional args (or one array for variadic ops), then an optional attrs object
    let attrs = {};
    const isPlain = (x) => x && typeof x === "object" && !(x instanceof Value) && !Array.isArray(x) && !(x instanceof PatNode) && !(x instanceof Tensor) && !(x instanceof Float32Array);
    if (a.length && isPlain(a[a.length - 1])) attrs = a.pop();
    let args;
    if (this.variadic) args = a.length === 1 && Array.isArray(a[0]) ? a[0] : a;
    else args = a;
    const s = scope();
    const want = this.variadic ? null : this.argNames.length;
    if (want && args.length === 0) return new OpTemplate(this, { ...this.defaults(), ...attrs });   // n.lower(Op({…}))
    if (want != null && args.length !== want) throw new KilnError("ArityError", `${this.name} takes ${want} argument${want === 1 ? "" : "s"} (${this.argNames.join(", ")}), got ${args.length}`);
    if (!s) throw new KilnError("ScopeError", `${this.name}(…) builds a node, so call it inside k.graph(…), k.trace(…) or a rule's rewrite`);
    args = args.map((x) => this.dialect.liftArg(x, s));
    return s.add(this, args, { ...this.defaults(), ...attrs });
  }
}

export class Dialect {
  constructor(name) { this.name = name; this.ops = new Map(); this._lift = null; this.about = ""; }
  op(short, spec) { const d = new OpDef(this, short, spec); this.ops.set(short, d); this[short] = d.ctor; return this; }
  lifts(fn) { this._lift = fn; return this; }
  describe(text) { this.about = text; return this; }
  liftArg(x, s) {
    if (x instanceof Value || x instanceof PatNode) return x;
    if (typeof x === "number" || x instanceof Tensor) {
      const d = this._lift ? this : [...DIALECTS.values()].reverse().find((dd) => dd._lift);
      if (!d) throw new KilnError("LiftError", `${this.name} cannot turn ${x} into a value: add dialect.lifts(v => …)`);
      return d._lift(x);
    }
    throw new KilnError("ArgError", `expected a value, got ${typeof x === "object" ? JSON.stringify(x)?.slice(0, 60) : String(x)}`);
  }
  methods(obj) {
    for (const [name, fn] of Object.entries(obj)) {
      const list = METHODS.get(name) || [];
      METHODS.set(name, [...list.filter((m) => m.dialect !== this), { dialect: this, fn }]);
    }
    return this;
  }
  get(short) { return this.ops.get(short); }
}
export const DIALECTS = new Map();
export function dialect(name) { const d = new Dialect(name); DIALECTS.set(name, d); return d; }

// the builtin dialect: graph inputs
export const Kiln = dialect("kiln").op("input", { attrs: { name: T.string }, print: "input {name}" });
const INPUT = Kiln.get("input");

// ============================================================================ nodes and graphs
export class Node {
  constructor(id, def, args, attrs, type, knobs) { this.id = id; this.def = def; this.args = args; this.attrs = attrs; this.type = type; this.knobs = knobs || null; Object.freeze(this); }
  get name() { return this.def.name; }
}

let GID = 0;
export class Graph {
  constructor(name = "graph") { this.name = name; this.nodes = new Map(); this.inputs = []; this.outputs = []; this.next = 0; this.version = 0; this.gid = ++GID; this._c = {}; }
  clone() { const g = new Graph(this.name); g.nodes = new Map(this.nodes); g.inputs = this.inputs.map((x) => ({ ...x })); g.outputs = this.outputs.map((x) => ({ ...x })); g.next = this.next; return g; }
  touch() { this.version++; this._c = {}; }
  node(id) { return this.nodes.get(id); }
  get size() { return this.nodes.size; }
  freshId(pref = "n") { let id; do { id = pref + this.next++; } while (this.nodes.has(id)); return id; }
  addNode(def, args, attrs = {}, { id, type, knobs } = {}) {
    id = id || this.freshId();
    const n = new Node(id, def, args, attrs, null, knobs);
    const t = type || inferType(this, n);
    this.nodes.set(id, new Node(id, def, args, attrs, t, knobs));
    this.touch();
    return id;
  }
  setNode(n) { this.nodes.set(n.id, n); this.touch(); }
  remove(id) { this.nodes.delete(id); this.touch(); }
  replaceUses(oldId, newId, except = null) {
    for (const n of [...this.nodes.values()]) {
      if (except?.has(n.id) || !n.args.includes(oldId)) continue;
      this.nodes.set(n.id, new Node(n.id, n.def, n.args.map((a) => (a === oldId ? newId : a)), n.attrs, n.type, n.knobs));
    }
    for (const o of this.outputs) if (o.id === oldId) o.id = newId;
    this.touch();
  }
  users(id) {
    if (!this._c.users) {
      const u = new Map();
      for (const n of this.nodes.values()) for (const a of n.args) { if (!u.has(a)) u.set(a, []); if (!u.get(a).includes(n.id)) u.get(a).push(n.id); }
      for (const o of this.outputs) { if (!u.has(o.id)) u.set(o.id, []); }
      this._c.users = u;
    }
    return this._c.users.get(id) || [];
  }
  isOutput(id) { return this.outputs.some((o) => o.id === id); }
  topo() {
    if (this._c.topo) return this._c.topo;
    const out = [], seen = new Set();
    const visit = (id0) => {
      const stack = [[id0, 0]];
      while (stack.length) {
        const top = stack[stack.length - 1];
        const [id, i] = top;
        if (i === 0 && seen.has(id)) { stack.pop(); continue; }
        if (i === 0) seen.add(id);
        const n = this.nodes.get(id);
        if (n && i < n.args.length) { top[1]++; if (!seen.has(n.args[i])) stack.push([n.args[i], 0]); }
        else { stack.pop(); if (n) out.push(id); }
      }
    };
    for (const i of this.inputs) visit(i.id);
    for (const o of this.outputs) visit(o.id);
    for (const id of this.nodes.keys()) visit(id);
    this._c.topo = out;
    return out;
  }
  dce() {
    const live = new Set();
    const stack = this.outputs.map((o) => o.id);
    for (const n of this.nodes.values()) if (n.def.traits.has("effect")) stack.push(n.id);
    while (stack.length) { const id = stack.pop(); if (live.has(id)) continue; live.add(id); const n = this.nodes.get(id); if (n) stack.push(...n.args); }
    for (const i of this.inputs) live.add(i.id);
    let removed = 0;
    for (const id of [...this.nodes.keys()]) if (!live.has(id)) { this.nodes.delete(id); removed++; }
    if (removed) this.touch();
    return removed;
  }
  value(id) { return wrap(this, id); }
  find(q) { const pred = typeof q === "function" ? q : (n) => n.name === q || n.def.short === q; const n = this.topo().map((id) => this.nodes.get(id)).find((x) => pred(x)); return n ? this.value(n.id) : null; }
  findAll(q) { const pred = typeof q === "function" ? q : (n) => n.name === q || n.def.short === q; return this.topo().map((id) => this.nodes.get(id)).filter((x) => pred(x)).map((n) => this.value(n.id)); }
  findBefore(id, pred) { for (const x of this.topo()) { if (x === id) return null; const v = this.value(x); if (pred(v)) return v; } return null; }
  ref(id) { const n = this.nodes.get(id); return n?.def === INPUT ? n.attrs.name : id; }
  dialects() { return [...new Set([...this.nodes.values()].map((n) => n.def.dialect.name))]; }
  key() { if (!this._c.key) this._c.key = hash(this.outputs.map((o) => nodeKey(this, o.id)).join("|")); return this._c.key; }
  nodeKey(id) { return nodeKey(this, id); }
  print(opts) { return printGraph(this, opts); }
  printNode(id, opts) { return printNode(this, this.nodes.get(id), opts); }
  eval(inputs = {}, opts = {}) { return evalGraph(this, inputs, opts); }
  summary() { const d = {}; for (const n of this.nodes.values()) d[n.name] = (d[n.name] || 0) + 1; return d; }
}

function inferType(g, n) {
  const spec = n.def.spec;
  if (n.def === INPUT) return n.type || scalar();
  if (!spec.infer) return n.args.length ? g.nodes.get(n.args[0])?.type || scalar() : scalar();
  const ctx = { ...n.attrs, attrs: n.attrs, args: n.args.map((a) => g.value(a)), node: n };
  n.def.argNames.forEach((nm, i) => { ctx[nm] = n.def.variadic ? ctx.args : ctx.args[i]; });
  const t = spec.infer(ctx);
  return t;
}

// structural keys: op, attrs (minus names), types, and inputs' keys; input names are positional
function attrKey(v) {
  if (v == null) return String(v);
  if (v instanceof Float32Array || v instanceof Tensor) { const d = v instanceof Tensor ? v.data : v; if (!d.__kh) { let s = d.length + ":"; const step = Math.max(1, Math.floor(d.length / 64)); for (let i = 0; i < d.length; i += step) s += d[i].toFixed(5) + ","; Object.defineProperty(d, "__kh", { value: hash(s) }); } return "data:" + d.__kh; }
  if (v instanceof IX.Ix) return IX.keyOf(v);
  if (v instanceof IX.IxMap) return v.key();
  if (typeof v === "function") return "fn:" + hash(String(v));
  if (Array.isArray(v)) return "[" + v.map(attrKey).join(",") + "]";
  if (typeof v === "object") { if (v.__key) return v.__key; return "{" + Object.keys(v).sort().map((k) => k + ":" + attrKey(v[k])).join(",") + "}"; }
  return JSON.stringify(v);
}
function nodeKey(g, id, memo = g._c.nk || (g._c.nk = new Map())) {
  if (memo.has(id)) return memo.get(id);
  const n = g.nodes.get(id);
  if (!n) return "?";
  let s;
  if (n.def === INPUT) s = "in" + g.inputs.findIndex((i) => i.id === id) + ":" + typeStr(n.type);
  else {
    const ign = n.def.spec.keyIgnore || ["name", "note", "label"];
    const attrs = Object.keys(n.attrs).filter((k) => !ign.includes(k)).sort().map((k) => k + "=" + attrKey(n.attrs[k])).join(";");
    s = hash(`${n.name}(${n.args.map((a) => nodeKey(g, a, memo)).join(",")})[${attrs}]${typeStr(n.type)}`);
  }
  memo.set(id, s);
  return s;
}

// ---------------------------------------------------------------------------- printing
function fmtAttr(v) {
  if (v == null) return String(v);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toPrecision(6));
  if (v instanceof Float32Array) return `[${v.length} values]`;
  if (v instanceof Tensor) return `tensor(${v.shape.join("×")})`;
  if (v instanceof IX.Ix) return IX.print(v);
  if (v instanceof IX.IxMap) return v.toString();
  if (typeof v === "function") return "λ";
  if (Array.isArray(v)) return v.length > 8 ? `[${v.slice(0, 8).map(fmtAttr).join(", ")}, …]` : `[${v.map(fmtAttr).join(", ")}]`;
  if (typeof v === "object") return v.__print ? v.__print() : "{…}";
  return String(v);
}
function nodeLine(g, n) {
  const spec = n.def.spec;
  const refs = n.args.map((a) => g.ref(a));
  if (spec.print) {
    const ctx = { ...n.attrs, attrs: n.attrs, args: refs, node: n };
    n.def.argNames.forEach((nm, i) => { ctx[nm] = n.def.variadic ? refs.join(", ") : refs[i]; });
    if (typeof spec.print === "function") return String(spec.print(ctx));
    return spec.print.replace(/\{([\w.]+)\}/g, (m, k) => {
      const v = k.split(".").reduce((o, p) => (o == null ? o : o[p]), ctx);
      return v === undefined ? m : typeof v === "string" ? v : fmtAttr(v);
    });
  }
  const shown = Object.entries(n.attrs).filter(([k, v]) => k !== "body" && typeof v !== "function").map(([k, v]) => `${k}=${fmtAttr(v)}`);
  return `${n.def.short}(${[...refs, ...shown].join(", ")})`;
}
function printNode(g, n, { types = true, body = true } = {}) {
  if (!n) return "";
  const line = `${n.id} = ${nodeLine(g, n)}${types ? `  -> ${typeStr(n.type)}` : ""}${n.knobs && Object.keys(n.knobs).length ? `  ⟨${Object.entries(n.knobs).map(([k, v]) => `${k}=${v}`).join(",")}⟩` : ""}`;
  if (body && n.def.spec.body) { const b = n.def.spec.body({ ...n.attrs, attrs: n.attrs, node: n, args: n.args.map((a) => g.ref(a)) }); if (b) return line + "\n" + String(b).split("\n").map((l) => "    " + l).join("\n"); }
  return line;
}
function printGraph(g, { only = null, types = true, body = true, header = true, ids = null } = {}) {
  const lines = [];
  const order = g.topo().filter((id) => (!ids || ids.has(id)));
  const nodes = order.map((id) => g.nodes.get(id)).filter((n) => n.def !== INPUT && (!only || only(n)));
  if (header) {
    lines.push(`# graph ${g.name}: ${g.nodes.size} nodes, ${g.inputs.length} input${g.inputs.length === 1 ? "" : "s"}, ${g.outputs.length} output${g.outputs.length === 1 ? "" : "s"}`);
    if (g.inputs.length) { lines.push("", "inputs:"); for (const i of g.inputs) lines.push(`  ${i.name}: ${typeStr(g.nodes.get(i.id)?.type)}`); }
    lines.push("");
  }
  const w = Math.min(28, Math.max(0, ...nodes.filter((n) => !n.def.spec.body).map((n) => (n.id + " = " + nodeLine(g, n)).length)));
  for (const n of nodes) {
    if (n.def.spec.body && body) { lines.push(""); lines.push(printNode(g, n, { types, body })); lines.push(""); continue; }
    const head = `${n.id} = ${nodeLine(g, n)}`;
    lines.push(types ? head.padEnd(w) + `  -> ${typeStr(n.type)}${n.knobs && Object.keys(n.knobs).length ? `  ⟨${Object.entries(n.knobs).map(([k, v]) => `${k}=${v}`).join(",")}⟩` : ""}` : head);
  }
  if (header && g.outputs.length) { lines.push("", "outputs:"); for (const o of g.outputs) lines.push(`  ${o.name}: ${g.ref(o.id)}  ${typeStr(g.nodes.get(o.id)?.type)}`); }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------------------- evaluation
function evalGraph(g, inputs, { upto = null, values = new Map(), onNode = null } = {}) {
  for (const i of g.inputs) {
    if (!(i.name in inputs)) throw new KilnError("InputError", `missing input "${i.name}" (inputs: ${g.inputs.map((x) => x.name).join(", ")})`);
    values.set(i.id, inputs[i.name]);
  }
  for (const id of g.topo()) {
    if (values.has(id)) continue;
    const n = g.nodes.get(id);
    if (!n.def.spec.eval) throw new KilnError("EvalError", `${n.name} (${id}) has no eval: it can be compiled but not interpreted`, { node: id });
    const ctx = { ...n.attrs, attrs: n.attrs, args: n.args.map((a) => values.get(a)), type: n.type, node: n, graph: g };
    n.def.argNames.forEach((nm, i) => { ctx[nm] = n.def.variadic ? ctx.args : ctx.args[i]; });
    let v;
    try { v = n.def.spec.eval(ctx); } catch (e) { if (e instanceof KilnError) throw e; throw new KilnError("EvalError", `${n.name} (${id}): ${e.message}`, { node: id }); }
    values.set(id, v);
    onNode?.(n, v);
    if (upto === id) break;
  }
  const out = {};
  for (const o of g.outputs) out[o.name] = values.get(o.id);
  return out;
}

// ============================================================================ values (handles)
export class Value {
  constructor(g, id) { this._g = g; this.id = id; }
  get node() { return this._g.nodes.get(this.id); }
  get def() { return this.node?.def; }
  get type() { return this.node?.type; }
  get shape() { return this.node?.type?.shape; }
  get name() { return this.node?.name; }
  get opName() { return this.node?.def.short; }
  get attrs() { return this.node?.attrs || {}; }
  get knobs() { return this.node?.knobs || {}; }
  get args() { return (this.node?.args || []).map((a) => wrap(this._g, a)); }
  get users() { return this._g.users(this.id).map((u) => wrap(this._g, u)); }
  get graph() { return this._g; }
  get ref() { return this._g.ref(this.id); }
  _dialect() { return this.node?.def.dialect; }
  arg(i) {
    const n = this.node;
    if (typeof i === "string") { const k = n.def.argNames.indexOf(i); if (k < 0) throw new KilnError("ArgError", `${n.name} has no argument "${i}" (it has ${n.def.argNames.join(", ")})`); i = k; }
    return n.args[i] != null ? wrap(this._g, n.args[i]) : null;
  }
  is(q) { if (q instanceof Value) return q.id === this.id; if (q instanceof OpDef) return this.def === q; if (typeof q === "function" && q.def) return this.def === q.def; return this.name === q || this.def?.short === q; }
  has(trait) { return !!this.def?.traits.has(trait); }
  isConst(v) { if (!this.has("const")) return false; return v === undefined || this.attrs.value === v; }
  get value() { return this.attrs.value; }
  isInput() { return this.def === INPUT; }
  otherArg(v) { return this.args.find((a) => a.id !== v.id) || null; }
  out() { return this; }
  with(patch = {}) { const n = this.node; return new InPlace(this.id, patch.def || n.def, patch.args ? patch.args.map((a) => toId(a)) : n.args, patch.attrs ? { ...n.attrs, ...patch.attrs } : n.attrs, patch.knobs); }
  lower(x, attrs) {
    if (x instanceof OpTemplate) return new InPlace(this.id, x.def, this.node.args, { ...x.attrs, ...attrs });
    if (typeof x === "function" && x.def) return new InPlace(this.id, x.def, this.node.args, { ...x.def.defaults(), ...attrs });
    if (x instanceof Value) { const m = x.node; return new InPlace(this.id, m.def, m.args, m.attrs, null, x.id); }
    throw new KilnError("LowerError", "lower() takes an op template like Vm.binop({opcode}) or a value built in this rewrite");
  }
  fold() { const n = this.node; const vals = this.args.map((a) => a.attrs.value); const ctx = { ...n.attrs, attrs: n.attrs, args: vals, type: n.type, node: n }; n.def.argNames.forEach((nm, i) => { ctx[nm] = n.def.variadic ? vals : vals[i]; }); return n.def.spec.eval(ctx); }
  print() { return this._g.printNode(this.id); }
  key() { return this._g.nodeKey(this.id); }
  toString() { return this.ref; }
}
export const wrap = (g, id) => new Proxy(new Value(g, id), HANDLER);
const toId = (x) => (x instanceof Value ? x.id : typeof x === "string" ? x : (() => { throw new KilnError("ArgError", "expected a value"); })());

export class InPlace { constructor(id, def, args, attrs, knobs, removeId) { this.id = id; this.def = def; this.args = args; this.attrs = attrs; this.knobs = knobs; this.removeId = removeId; } }

// a builder adds nodes to a graph (k.graph, k.trace, rewrites)
class GraphScope {
  constructor(g, opts = {}) { this.g = g; this.created = new Set(); this.dialect = opts.dialect || null; this.pattern = false; }
  add(def, args, attrs) { const id = this.g.addNode(def, args.map((a) => a.id), attrs); this.created.add(id); return wrap(this.g, id); }
}
export class Builder {
  constructor(g, sc) { this._g = g; this._s = sc; }
  input(name, type = scalar()) {
    const id = this._g.nodes.has(name) ? this._g.freshId("in") : name;
    this._g.addNode(INPUT, [], { name }, { id, type });
    this._g.inputs.push({ name, id });
    return wrap(this._g, id);
  }
  output(name, v) { if (!(v instanceof Value)) throw new KilnError("ArgError", `output ${name}: expected a value`); this._g.outputs.push({ name, id: v.id }); return v; }
  get graph() { return this._g; }
}
export function graph(name, fn, opts = {}) {
  const g = new Graph(name);
  const sc = new GraphScope(g, opts);
  withScope(sc, () => fn(new Builder(g, sc)));
  g.dce();
  return g;
}
// trace a lambda over typed inputs: its dialect calls become nodes
export function trace(name, fn, inputs = {}, opts = {}) {
  return graph(name, (b) => {
    const vals = {};
    for (const [k, t] of Object.entries(inputs)) vals[k] = b.input(k, t);
    const out = fn(vals);
    if (out instanceof Value) b.output("out", out);
    else if (out && typeof out === "object") for (const [k, v] of Object.entries(out)) b.output(k, v);
    else throw new KilnError("TraceError", `${name}: the traced function must return a value or an object of values`);
  }, opts);
}
export function lift(v) { const s = scope(); if (v instanceof Value || v instanceof PatNode) return v; const d = [...DIALECTS.values()].reverse().find((x) => x._lift); if (!d) throw new KilnError("LiftError", "no dialect can lift constants"); return d._lift(v); }

// ============================================================================ patterns
class PatNode { constructor(def, args, attrs) { this.def = def; this.args = args; this.attrs = attrs; } _dialect() { return this.def?.dialect; } }
class PVar extends PatNode { constructor(name) { super(null, [], {}); this.vname = name; } }
const patProxy = (x) => new Proxy(x, HANDLER);

export class Pat {
  constructor(kind, data = {}) { this.kind = kind; Object.assign(this, data); this._as = null; this._where = []; this._args = null; this._attrs = null; this._oneUse = false; this._replaces = null; }
  _copy(patch) { const p = Object.assign(Object.create(Pat.prototype), this, patch); p._where = patch._where || this._where.slice(); return p; }
  as(name) { return this._copy({ _as: name }); }
  where(fn) { return this._copy({ _where: [...this._where, fn] }); }
  args(...subs) { return this._copy({ _args: subs }); }
  attrs(o) { return this._copy({ _attrs: o }); }
  oneUse() { return this._copy({ _oneUse: true }); }
  replaces(name) { return this._copy({ _replaces: name }); }
  // match with `id` as this pattern's node; returns an env (captures) or null
  matchAt(g, id, env = {}) {
    const n = g.nodes.get(id);
    if (!n) return null;
    if (this.kind === "chain") return this._matchChain(g, id, env);
    if (this.kind === "var") {
      if (env[this.name] != null) return env[this.name].id === id ? env : null;
      return { ...env, [this.name]: g.value(id) };
    }
    if (this.kind === "op" && !this.names.includes(n.name) && !this.names.includes(n.def)) return null;
    if (this.kind === "trait" && !n.def.traits.has(this.trait)) return null;
    if (this.kind === "const" && (!n.def.traits.has("const") || (this.value !== undefined && n.attrs.value !== this.value))) return null;
    if (this._attrs) for (const [k, v] of Object.entries(this._attrs)) if (n.attrs[k] !== v) return null;
    if (this._oneUse && g.users(id).length !== 1) return null;
    let e = env;
    if (this._args) {
      if (this._args.length !== n.args.length) return null;
      for (let i = 0; i < this._args.length; i++) { e = this._args[i].matchAt(g, n.args[i], e); if (!e) return null; }
    }
    const v = g.value(id);
    if (this._as) { if (e[this._as] && e[this._as].id !== id) return null; e = { ...e, [this._as]: v }; }
    for (const w of this._where) { if (!w({ ...e, node: v, graph: g })) return null; }
    return e;
  }
  _matchChain(g, id, env) {
    const pats = this.pats;
    let e = pats[pats.length - 1].matchAt(g, id, env);
    if (!e) return null;
    let cur = id;
    const ids = [id];
    for (let i = pats.length - 2; i >= 0; i--) {
      const n = g.nodes.get(cur);
      let hit = null;
      for (const a of n.args) {
        if (g.users(a).length !== 1 || g.isOutput(a)) continue;
        const e2 = pats[i].matchAt(g, a, e);
        if (e2) { hit = [a, e2]; break; }
      }
      if (!hit) return null;
      [cur, e] = hit;
      ids.push(cur);
    }
    const root = this._replaces ? e[this._replaces]?.id : id;
    return { ...e, __root: root, __ids: ids };
  }
  matchAll(g) { const out = []; for (const id of g.topo()) { const e = this.matchAt(g, id); if (e) out.push(e); } return out; }
  explain(g, id) { return this.matchAt(g, id) ? "ok" : "no match"; }
}
const opNames = (xs) => xs.flatMap((x) => (typeof x === "string" ? [x] : x instanceof OpDef ? [x.name] : typeof x === "function" && x.def ? [x.def.name] : []));
export const P = {
  op: (...names) => new Pat("op", { names: opNames(names) }),
  oneOf: (...names) => new Pat("op", { names: opNames(names) }),
  trait: (trait) => new Pat("trait", { trait }),
  any: () => new Pat("any"),
  const: (value) => new Pat("const", { value }),
  var: (name) => new Pat("var", { name }),
  chain: (...pats) => new Pat("chain", { pats }),
};

// ============================================================================ params (knobs, sliders)
export class Param {
  constructor(type, name, opts = {}) { this.type = type; this.name = name; this.opts = opts; this._phase = opts.phase || "build"; this._ui = opts.ui || null; this._group = opts.group || null; this._help = opts.help || ""; this._domain = null; }
  phase(p) { this._phase = p; return this; }
  ui(u) { this._ui = u; return this; }
  group(g) { this._group = g; return this; }
  help(h) { this._help = h; return this; }
  domain(fn) { this._domain = fn; return this; }
  get off() { return this.opts.off; }
  get def() { return this.opts.default !== undefined ? this.opts.default : this.type === "enum" ? this.opts.values[0] : this.type === "bool" ? false : this.opts.min ?? 0; }
  values(ctx) {
    if (this._domain && ctx) return this._domain(ctx);
    if (this.type === "enum") return this.opts.values;
    if (this.type === "bool") return [false, true];
    if (this.type === "int" && this.opts.min != null && this.opts.max != null) { const out = []; for (let v = this.opts.min; v <= this.opts.max; v += this.opts.step || 1) out.push(v); return out; }
    return [this.def];
  }
  parse(v) {
    if (this.type === "int") { const x = Math.round(+v); if (!isFinite(x)) throw new KilnError("ParamError", `${this.name} takes an integer`); return x; }
    if (this.type === "float") { const x = +v; if (!isFinite(x)) throw new KilnError("ParamError", `${this.name} takes a number`); return x; }
    if (this.type === "bool") return v === true || v === "true" || v === 1 || v === "1" || v === "on";
    if (this.type === "enum") { const hit = this.opts.values.find((x) => String(x) === String(v)); if (hit === undefined) throw new KilnError("ParamError", `${this.name} takes one of ${this.opts.values.join(", ")}; got ${v}`); return hit; }
    return v;
  }
}
export const param = {
  int: (name, opts) => new Param("int", name, opts),
  float: (name, opts) => new Param("float", name, opts),
  enum: (name, values, opts = {}) => new Param("enum", name, { ...opts, values }),
  bool: (name, opts) => new Param("bool", name, opts),
  text: (name, opts) => new Param("text", name, opts),
};
export class ParamSet {
  constructor(params = []) { this.params = new Map(); this.vals = new Map(); this.pins = new Set(); this.subs = new Set(); for (const p of params) this.declare(p); }
  declare(p) { if (!this.params.has(p.name)) this.params.set(p.name, p); return this; }
  param(p) { const name = typeof p === "string" ? p : p.name; return this.params.get(name) || (typeof p === "object" ? p : null); }
  get(p) { const P0 = this.param(p); const name = P0?.name ?? p; return this.vals.has(name) ? this.vals.get(name) : P0?.def; }
  isPinned(p) { return this.pins.has(typeof p === "string" ? p : p.name); }
  set(p, v, { pin = true } = {}) { const P0 = this.param(p); if (!P0) throw new KilnError("ParamError", `no param ${typeof p === "string" ? p : p.name}`); this.vals.set(P0.name, P0.parse(v)); if (pin) this.pins.add(P0.name); this.emit(P0); return this; }
  pin(obj) { for (const [k, v] of Object.entries(obj)) { if (!this.params.has(k)) this.params.set(k, param.text(k)); this.set(k, v); } return this; }
  unpin(name) { if (name == null) { this.pins.clear(); this.vals.clear(); } else { this.pins.delete(name); this.vals.delete(name); } this.emit(null); return this; }
  pinned() { const o = {}; for (const n of this.pins) o[n] = this.vals.get(n); return o; }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(p) { for (const f of this.subs) f(p); }
  clone() { const s = new ParamSet([...this.params.values()]); for (const [k, v] of this.vals) s.vals.set(k, v); for (const p of this.pins) s.pins.add(p); return s; }
  toJSON() { return this.pinned(); }
}
export const params = (src) => new ParamSet(src instanceof Pipeline ? src.allParams() : Array.isArray(src) ? src : []);

// ============================================================================ forks and decisions
const canon = (knobs) => Object.keys(knobs || {}).sort().map((k) => `${k}=${knobs[k]}`).join(",");
export const knobs = { canonical: canon, parse: (s) => Object.fromEntries(String(s).split(",").filter(Boolean).map((kv) => { const i = kv.indexOf("="); const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim(); return [k, v === "true" ? true : v === "false" ? false : v !== "" && !isNaN(+v) ? +v : v]; })) };

export class Fork {
  constructor(options, meta = {}) { this.options = options; this.meta = meta; }
  keepOriginal(param0) {
    const p = param0 || this.meta.param;
    this.options = [...this.options, { knobs: p ? { [p.name]: p.off } : {}, label: "keep original", build: () => undefined, original: true }];
    return this;
  }
}
function opt(o, i) { if (typeof o === "function") return { knobs: {}, label: "option " + i, build: o }; if (o instanceof Value || o instanceof InPlace) return { knobs: {}, label: "option " + i, build: () => o }; return { label: canon(o.knobs) || "option " + i, ...o, knobs: o.knobs || {} }; }
export function fork(options, meta) { return new Fork(options.map(opt), meta); }
fork.over = (p, values, fn) => {
  if (typeof values === "function") { fn = values; values = null; }
  const f = new Fork([], { param: p, lazyValues: values, fn });
  return f;
};
fork.toggle = (p, fn) => fork.over(p, [p.off === false ? true : p.opts.values?.find((v) => v !== p.off) ?? true], fn).keepOriginal();
fork.tree = () => {
  const levels = [];
  const b = {
    level(p, valuesFn) { levels.push({ p, valuesFn }); return b; },
    leaf(fn) { return new Fork([], { tree: levels, leaf: fn }); },
  };
  return b;
};
// expand lazily-specified forks once we have the rewrite context (for param domains)
function expandFork(f, rctx) {
  if (f.meta.tree) {
    const out = [];
    const rec = (i, kn) => {
      if (out.length >= 20000) return;
      if (i === f.meta.tree.length) { const k = { ...kn }; out.push({ knobs: k, label: canon(k), build: () => f.meta.leaf(k) }); return; }
      const { p, valuesFn } = f.meta.tree[i];
      const vals = valuesFn ? valuesFn(kn, rctx) : p.values(rctx);
      // undefined: this knob does not apply to the option (it stays unset, so canonical labels and evidence keys
      // of options that never had it are unchanged)
      for (const v of vals) rec(i + 1, v === undefined ? kn : { ...kn, [p.name]: v });
    };
    rec(0, {});
    return out.concat(f.options);
  }
  if (f.meta.fn) {
    const p = f.meta.param;
    const vals = f.meta.lazyValues || p.values(rctx);
    return vals.map((v) => ({ knobs: { [p.name]: v }, label: `${p.name}=${v}`, build: () => f.meta.fn(v) })).concat(f.options);
  }
  return f.options;
}

// decide policies rank a fork point's options: { order, by, scores } or null (pass it on)
const policy = (name, rank, extra = {}) => Object.assign({ name, rank }, extra);
const firstOrder = (fp) => fp.options.map((_, i) => i);
const tieBreak = (fp, scores) => fp.options.map((_, i) => i).sort((a, b) => (scores[a] - scores[b]) || (canon(fp.options[a].knobs) < canon(fp.options[b].knobs) ? -1 : 1));
export const decide = {
  first: () => policy("first", (fp) => ({ order: firstOrder(fp), by: "first" })),
  // every knob pinned: emission order among what is left; some pinned: the rest is ordered by the next policy
  pinned: () => policy("pinned", (fp, run, next) => {
    if (fp.allPinned) return { order: firstOrder(fp), by: "pinned" };
    if (!fp.pinned?.length) return null;
    const r = next?.();
    const pins = fp.pinned.join(",");
    return r ? { ...r, by: "pinned-partial", note: `${pins} pinned; the rest by ${r.by}${r.note ? ": " + r.note : ""}` } : { order: firstOrder(fp), by: "pinned-partial", note: `${pins} pinned; the rest in emission order` };
  }),
  random: (seed = 1) => { let s = seed; return policy("random", (fp) => { const o = firstOrder(fp); for (let i = o.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) % 2147483648; const j = s % (i + 1); [o[i], o[j]] = [o[j], o[i]]; } return { order: o, by: "random" }; }); },
  cost(fn, { name = "cost" } = {}) {
    let only = null;
    const p = policy(name, (fp, run) => {
      if (only && !only.includes(fp.rule) && !only.includes(fp.ruleId)) return null;
      const scores = fp.options.map((o) => { try { const v = fn({ knobs: o.knobs, option: o, node: fp.node, fork: fp, ctx: run?.ctx, run }); return v == null || Number.isNaN(v) ? Infinity : v; } catch (e) { return Infinity; } });
      if (scores.every((s) => s === Infinity)) return null;
      return { order: tieBreak(fp, scores), by: name, scores };
    });
    p.for = (...rules) => { only = rules; return p; };
    return p;
  },
  // each part gets a thunk for the ranking of the parts after it (evidence uses it to compare with the fallback)
  chain: (...ps) => {
    const from = (i, fp, run) => { for (let j = i; j < ps.length; j++) { const r = ps[j].rank(fp, run, () => from(j + 1, fp, run)); if (r) return r; } return null; };
    return policy("chain", (fp, run) => from(0, fp, run), { parts: ps });
  },
  exactly: (choose) => policy("exactly", (fp, run) => { const r = choose(fp, run); if (r == null) return null; const i = typeof r === "number" ? r : fp.options.findIndex((o) => canon(o.knobs) === canon(r)); return i < 0 ? null : { order: [i, ...firstOrder(fp).filter((j) => j !== i)], by: "replay" }; }),
  // Measured evidence (guide §26). The store answers optionStats(fp, run): per option null or
  // { median, lo, hi, n, deterministic } over the records that may decide. Evidence defers until the next policy's
  // favourite is measured (one measurement of a pinned, say naive, schedule must not lock it in after unpinning),
  // and overrides that favourite only with a separated interval; a deterministic device (the simulator) has
  // zero-width intervals, so there the fastest measured option wins as before. { always: true } ignores the model.
  evidence: (store, { minReps = 3, always = false } = {}) => policy("evidence", (fp, run, next) => {
    const st = store || run?.ctx?.store;
    const stats = st?.optionStats?.(fp, run);
    if (!stats) return null;
    const usable = (s) => s && (s.deterministic || s.n >= minReps);
    const measured = stats.map((s, i) => (usable(s) ? i : -1)).filter((i) => i >= 0);
    if (!measured.length) return null;
    const scores = stats.map((s) => (usable(s) ? s.median : Infinity));
    const byMedian = () => tieBreak(fp, scores);
    if (always || !next) return { order: byMedian(), by: "evidence", scores, note: "fastest measured option" };
    const model = next();
    if (!model || !model.order.length) return { order: byMedian(), by: "evidence", scores, note: "fastest measured option" };
    const fav = model.order[0];
    if (!usable(stats[fav])) return null;
    const best = measured.reduce((a, b) => (scores[b] < scores[a] || (scores[b] === scores[a] && b === fav) ? b : a));
    const rowOf = (i) => st.rowOf?.(fp.options[i].knobs) ?? canon(fp.options[i].knobs);
    if (best === fav) return { order: [fav, ...model.order.filter((i) => i !== fav)], by: "evidence", scores, note: "confirms the model" };
    const a = stats[best], b = stats[fav];
    if (a.hi < b.lo || b.hi < a.lo) return { order: [best, ...byMedian().filter((i) => i !== best)], by: "evidence", scores, note: `separated from the model's choice ${rowOf(fav)}` };
    return { ...model, by: model.by, note: `evidence within noise: best ${rowOf(best)} overlaps ${rowOf(fav)}` };
  }),
  strict: () => policy("strict", (fp) => { throw new KilnError("EvidenceError", `no measured evidence decides ${fp.rule} at ${fp.nodeId} (${fp.options.length} options); measure it or pin a row`); }),
};

// ============================================================================ rules
let RID = 0;
export class Rule {
  constructor(name) { this.name = name; this.id = name; this.uid = ++RID; this.pat = null; this.fn = null; this.mut = null; this.guards = []; this.whens = []; this.fix = false; this.reqs = []; this.about = ""; }
  match(p) { this.pat = p; return this; }
  rewrite(fn) { this.fn = fn; return this; }
  mutate(fn) { this.mut = fn; return this; }
  guard(fn) { this.guards.push(fn); return this; }
  when(fn) { this.whens.push(fn); return this; }
  fixpoint(on = true) { this.fix = on; return this; }
  requires(...names) { this.reqs.push(...names); return this; }
  describe(t) { this.about = t; return this; }
  // traced rewrite pairs: .from(({x}) => x.mul(2)).to(({x}) => x.add(x))
  from(fn, { dialect: d } = {}) {
    const names = paramNames(fn);
    const vars = Object.fromEntries(names.map((n) => [n, patProxy(new PVar(n))]));
    const sc = { pattern: true, dialect: d || null, add: (def, args, attrs) => patProxy(new PatNode(def, args, attrs)) };
    const root = withScope(sc, () => fn(vars));
    const toPat = (x) => {
      if (x instanceof PVar) return P.var(x.vname);
      if (!(x instanceof PatNode)) throw new KilnError("PatternError", "from(): the lambda must return a pattern built from its variables");
      let p = P.op(x.def.name);
      if (x.args.length) p = p.args(...x.args.map(toPat));
      else if (Object.keys(x.attrs).length) p = p.attrs(x.attrs);
      return p;
    };
    this.pat = toPat(root);
    this._vars = names;
    return this;
  }
  to(fn) { this.fn = (ctx) => fn(ctx); return this; }
  applyTo(g, opts = {}) {
    const p = pipeline("test").pass(pass("test").rules(this).mode("once")).build();
    const r = p.run(g, opts);
    return { changed: r.steps.some((s) => s.kind === "rewrite"), graph: r.graph, run: r };
  }
  explain(g) {
    const lines = [];
    for (const id of g.topo()) {
      const e = this.pat?.matchAt(g, id);
      if (e) lines.push(`${this.name} @ ${id}: matches`);
    }
    return lines.join("\n") || `${this.name}: no matches`;
  }
}
function paramNames(fn) {
  const src = String(fn);
  const m = src.match(/^\s*(?:async\s*)?\(\s*\{([^}]*)\}\s*\)/) || src.match(/^\s*function\s*\w*\s*\(\s*\{([^}]*)\}/);
  if (!m) throw new KilnError("PatternError", "from()/to() lambdas take one destructured object: ({ x, y }) => …");
  return m[1].split(",").map((s) => s.trim().split(/[:=\s]/)[0]).filter(Boolean);
}
export const rule = (name) => new Rule(name);

// ============================================================================ passes
export class Pass {
  constructor(name) { this.name = name; this._rules = []; this._mode = "fixpoint"; this._order = "topo"; this._short = null; this._knobs = []; this._whole = null; this._helpers = {}; this._checks = []; this.maxSteps = 4000; this.about = ""; }
  rules(...rs) { this._rules.push(...rs.flat()); return this; }
  mode(m) { this._mode = m; return this; }
  order(o) { this._order = o; return this; }   // "topo" (producers first) or "reverse" (consumers first)
  short(s) { this._short = s; return this; }
  knobs(...ps) { this._knobs.push(...ps); return this; }
  whole(fn) { this._whole = fn; return this; }
  helpers(name, obj) { this._helpers[name] = obj; return this; }
  check(fn) { this._checks.push(fn); return this; }
  describe(t) { this.about = t; return this; }
  limit(n) { this.maxSteps = n; return this; }
  get ruleList() { return this._rules; }
  clone() { const p = new Pass(this.name); Object.assign(p, this, { _rules: this._rules.slice(), _knobs: this._knobs.slice(), _checks: this._checks.slice(), _helpers: { ...this._helpers } }); return p; }
}
export const pass = (name) => new Pass(name);

// ============================================================================ pipelines
export class PipelineBuilder {
  constructor(name) { this.name = name; this.steps = []; this._params = []; this._decide = null; this._target = null; this._uses = []; this._backend = null; this._helpers = {}; this.about = ""; }
  ir(name, opts = {}) { this.steps.push({ kind: "ir", name, opts }); return this; }
  pass(p) { this.steps.push({ kind: "pass", pass: p }); return this; }
  params(...ps) { this._params.push(...ps.flat()); return this; }
  decide(p) { this._decide = p; return this; }
  target(t) { this._target = t; return this; }
  use(...s) { this._uses.push(...s); return this; }
  backend(b) { this._backend = b; return this; }
  describe(t) { this.about = t; return this; }
  build() { return new Pipeline(this); }
}
export const pipeline = (name) => new PipelineBuilder(name);

export class Pipeline {
  constructor(b) { this.name = b.name; this.steps = b.steps.map((s) => ({ ...s })); this._params = b._params.slice(); this._decide = b._decide || decide.first(); this._target = b._target || { name: "default" }; this._uses = b._uses.slice(); this._backend = b._backend; this._retry = b._retry || null; this.about = b.about; this._extra = b._extra || {}; }
  _rebuild(mut) { const b = new PipelineBuilder(this.name); b.steps = this.steps.map((s) => ({ ...s })); b._params = this._params.slice(); b._decide = this._decide; b._target = this._target; b._uses = this._uses.slice(); b._backend = this._backend; b._retry = this._retry; b.about = this.about; b._extra = { ...this._extra }; mut(b); return new Pipeline(b); }
  get passes() { return this.steps.filter((s) => s.kind === "pass").map((s) => s.pass); }
  irNames() { return this.steps.filter((s) => s.kind === "ir").map((s) => s.name); }
  passNames() { return this.passes.map((p) => p.name); }
  pass(name) { return this.passes.find((p) => p.name === name || p._short === name) || null; }
  allParams() { const m = new Map(); for (const p of this._params) m.set(p.name, p); for (const ps of this.passes) for (const k of ps._knobs) m.set(k.name, k); return [...m.values()]; }
  helpers(name) { for (const p of this.passes) if (p._helpers[name]) return p._helpers[name]; return null; }
  get target() { return this._target; }
  with(o = {}) { return this._rebuild((b) => { if (o.decide) b._decide = o.decide; if (o.target) b._target = o.target; if (o.retry) b._retry = o.retry; if (o.backend) b._backend = o.backend; if (o.name) b.name = o.name; if (o.use) b._uses.push(...o.use); }); }
  idx(name) { const i = this.steps.findIndex((s) => s.kind === "pass" && (s.pass.name === name || s.pass._short === name)); if (i < 0) throw new KilnError("PipelineError", `no pass "${name}" in ${this.name} (passes: ${this.passNames().join(", ")})`); return i; }
  replace(name, passes) { const i = this.idx(name); return this._rebuild((b) => b.steps.splice(i, 1, ...[passes].flat().map((p) => ({ kind: "pass", pass: p })))); }
  insertAfter(name, p) { const i = this.idx(name); return this._rebuild((b) => b.steps.splice(i + 1, 0, { kind: "pass", pass: p })); }
  insertBefore(name, p) { const i = this.idx(name); return this._rebuild((b) => b.steps.splice(i, 0, { kind: "pass", pass: p })); }
  without(name) { const i = this.idx(name); return this._rebuild((b) => b.steps.splice(i, 1)); }
  withIr(name, opts) { return this._rebuild((b) => { const s = b.steps.find((x) => x.kind === "ir" && x.name === name); if (s) s.opts = { ...s.opts, ...opts }; }); }
  insertRule(passName, r, { before, after } = {}) {
    const i = this.idx(passName);
    return this._rebuild((b) => {
      const p = b.steps[i].pass.clone();
      const at = before ? p._rules.findIndex((x) => x.name === before) : after ? p._rules.findIndex((x) => x.name === after) + 1 : p._rules.length;
      p._rules.splice(at < 0 ? p._rules.length : at, 0, r);
      b.steps[i] = { kind: "pass", pass: p };
    });
  }
  replaceRule(passName, ruleName, r) {
    const i = this.idx(passName);
    return this._rebuild((b) => { const p = b.steps[i].pass.clone(); const j = p._rules.findIndex((x) => x.name === ruleName); if (j < 0) throw new KilnError("PipelineError", `no rule ${ruleName} in ${passName}`); p._rules[j] = r; b.steps[i] = { kind: "pass", pass: p }; });
  }
  removeRule(passName, ruleName) {
    const i = this.idx(passName);
    return this._rebuild((b) => { const p = b.steps[i].pass.clone(); p._rules = p._rules.filter((x) => x.name !== ruleName); b.steps[i] = { kind: "pass", pass: p }; });
  }
  describe() {
    const lines = [`pipeline ${this.name}`];
    for (const s of this.steps) {
      if (s.kind === "ir") lines.push(`  ir ${s.name.padEnd(12)} [${(s.opts.dialects || []).map((d) => d.name || d).join(", ")}]${s.opts.strict ? " strict" : ""}`);
      else lines.push(`  ${s.pass._short || "·"}  ${s.pass.name.padEnd(24)} ${s.pass._whole ? "<whole graph>" : s.pass._rules.map((r) => r.name).join(", ")}${s.pass._mode !== "fixpoint" ? ` [${s.pass._mode}]` : ""}`);
    }
    return lines.join("\n");
  }
  run(g, opts = {}) { return new Run(this, g, opts).go(); }
}

// ============================================================================ strategies (event listeners)
export class Strategy {
  constructor(name) { this.name = name; this.handlers = {}; this._state = () => ({}); this._expose = null; }
  state(fn) { this._state = fn; return this; }
  on(ev, fn) { this.handlers[ev] = fn; return this; }
  expose(fn) { this._expose = fn; return this; }
}
export const strategy = (name) => new Strategy(name);

// ============================================================================ the engine
export class Run {
  constructor(pipe, g, opts) {
    this.pipeline = pipe; this.input = g; this.opts = opts;
    this.params = opts.params instanceof ParamSet ? opts.params : params(pipe).pin(opts.params || {});
    for (const p of pipe.allParams()) this.params.declare(p);
    this.decidePolicy = opts.decide || pipe._decide;
    this.ctx = { target: opts.target || pipe._target, run: this, pipeline: pipe, ...(opts.ctx || {}) };
    this.steps = []; this.decisions = []; this.reads = {}; this.events = []; this.checkpoints = new Map(); this.irOrder = []; this.passStats = {}; this.warnings = [];
    this.error = null; this.ok = true; this.t0 = (typeof performance !== "undefined" ? performance : Date).now();
    this.strategies = [...pipe._uses, ...(opts.use || [])].map((s) => ({ s, st: s._state() }));
    this.blocked = opts.blocked || new Map();
  }
  now() { return (typeof performance !== "undefined" ? performance : Date).now() - this.t0; }
  emit(kind, data = {}) {
    const ev = { t: this.now(), kind, ...data };
    this.events.push(ev);
    for (const { s, st } of this.strategies) { const h = s.handlers[kind] || s.handlers["*"]; if (h) try { h(ev, st, this); } catch (e) { this.warnings.push(`strategy ${s.name}: ${e.message}`); } }
    this.opts.onEvent?.(ev);
  }
  strategy(name) { const x = this.strategies.find((y) => y.s.name === name); return x ? (x.s._expose ? x.s._expose(x.st) : x.st) : null; }
  paramValue(p, where) {
    const name = typeof p === "string" ? p : p.name;
    (this.reads[name] ||= []).includes(where) || this.reads[name].push(where);
    return this.params.get(p);
  }
  at(name) { return this.checkpoints.get(name) || null; }
  // the graph right after step i (the latest rewrite at or before i)
  stepGraph(i) {
    if (i < 0 || !this.steps.length) return this.at("input") || this.input;
    i = Math.min(i, this.steps.length - 1);
    let j = i;
    while (j >= 0 && !(this.steps[j].kind === "rewrite" && this.steps[j].graph)) j--;
    const g = (j >= 0 ? this.steps[j].graph : this.at("input") || this.input).clone();
    for (let q = j + 1; q <= i; q++) {
      const s = this.steps[q];
      if (s.kind !== "rewrite" || !s.delta) continue;
      for (const id of s.delta.removed) g.nodes.delete(id);
      for (const n of s.delta.nodes) if (n) g.nodes.set(n.id, n);
      g.inputs = s.delta.inputs.map((x) => ({ ...x })); g.outputs = s.delta.outputs.map((x) => ({ ...x })); g.next = s.delta.next;
    }
    g.touch();
    return g;
  }
  diff(i) { const s = typeof i === "number" ? this.steps[i] : null; return s ? { before: s.before, after: s.after, text: unifiedDiff(s.before, s.after) } : null; }
  get ms() { return this.endT ?? this.now(); }

  go() {
    const want = this.opts.passes ? parsePassFilter(this.opts.passes, this.pipeline) : null;
    let g = this.input.clone();
    g.touch();
    this.graph = g;
    this.emit("runStart", { graph: g.name, nodes: g.size });
    this.checkpoints.set("input", g.clone());
    try {
      for (const st of this.pipeline.steps) {
        if (st.kind === "ir") {
          if (!want) this.checkIr(st);
          const snap = this.graph.clone();
          this.checkpoints.set(st.name, snap);
          this.irOrder.push(st.name);
          this.emit("ir", { ir: st.name, nodes: snap.size });
          if (this.opts.upTo === st.name) break;
          continue;
        }
        const p = st.pass;
        if (want && !want.has(p)) continue;
        this.runPass(p);
      }
    } catch (e) {
      this.ok = false;
      this.error = e instanceof KilnError ? e : new KilnError(e.name === "Skip" ? "RuleError" : "InternalError", e.message, { stack: e.stack });
      this.emit("error", { text: this.error.message });
    }
    this.endT = this.now();
    this.emit("runEnd", { ok: this.ok, ms: this.endT, steps: this.steps.length });
    return this;
  }
  checkIr(st) {
    const allowed = (st.opts.dialects || []).map((d) => (typeof d === "string" ? d : d.name));
    if (!st.opts.strict || !allowed.length) return;
    const bad = [...this.graph.nodes.values()].filter((n) => n.def !== INPUT && !allowed.includes(n.def.dialect.name) && !n.def.traits.has("any-ir"));
    if (bad.length) {
      const why = bad.slice(0, 6).map((n) => {
        const sk = this.steps.filter((s) => s.kind === "skip" && s.node === n.id).slice(-1)[0];
        return { id: n.id, op: n.name, declinedBy: sk ? `${sk.pass}/${sk.rule}: ${sk.reason}` : null };
      });
      throw new KilnError("LoweringError", `${bad.length} node${bad.length > 1 ? "s" : ""} did not lower to the ${st.name} IR (${allowed.join(", ")}): ${why.map((w) => `${w.id} ${w.op}${w.declinedBy ? " — " + w.declinedBy : ""}`).join("; ")}`, { nodes: why, ir: st.name });
    }
  }
  runPass(p) {
    const t0 = this.now();
    const stats = (this.passStats[p.name] = { applied: 0, skipped: 0, forks: 0, ms: 0, short: p._short });
    this.emit("passStart", { pass: p.name });
    this.declined = new Map();
    if (p._whole) this.runWhole(p);
    else if (p._mode === "ordered-once") {
      for (const r of p._rules) for (const id of [...this.graph.topo()]) if (this.graph.nodes.has(id)) this.tryRule(p, r, id);
    } else if (p._mode === "once") {
      for (const id of [...this.graph.topo()]) { if (!this.graph.nodes.has(id)) continue; for (const r of p._rules) { if (!this.graph.nodes.has(id)) break; if (this.tryRule(p, r, id) && !r.fix) break; } }
    } else {
      // Fixpoint: scan in order, rewrite the first match, repeat. After a rewrite the scan resumes at the
      // first node near the change (the rewritten nodes, their operands and their users) instead of the
      // top: everything before it was tried and is unchanged. When a resumed scan finds nothing, one full
      // sweep from the top confirms the fixpoint.
      let n = 0, resume = null;
      outer: for (;;) {
        const ids = p._order === "reverse" ? this.graph.topo().slice().reverse() : this.graph.topo();
        let from = 0;
        if (resume) { from = ids.length; for (let q = 0; q < ids.length; q++) if (resume.has(ids[q])) { from = q; break; } }
        for (let q = from; q < ids.length; q++) {
          const id = ids[q];
          for (const r of p._rules) {
            if (!this.graph.nodes.has(id)) continue;
            if (this.tryRule(p, r, id)) {
              if (++n > p.maxSteps) throw new KilnError("FixpointError", `${p.name} did not reach a fixpoint after ${p.maxSteps} rewrites (last: ${r.name} at ${id}); is a rule undoing another?`);
              resume = this.nearLastStep();
              continue outer;
            }
          }
        }
        if (resume) { resume = null; continue; }
        break;
      }
    }
    for (const c of p._checks) { const r = c(this.graph, this); if (r !== true && r != null) throw new KilnError("PassCheckError", `${p.name}: ${r}`); }
    stats.ms = this.now() - t0;
    this.emit("passEnd", { pass: p.name, applied: stats.applied, ms: stats.ms });
  }
  nearLastStep() {
    const st = this.steps[this.steps.length - 1], g = this.graph, near = new Set();
    if (!st || st.kind !== "rewrite") return null;
    for (const id of [st.node, ...(st.added || []), ...(st.changed || [])]) {
      if (!g.nodes.has(id)) continue;
      near.add(id);
      for (const a of g.nodes.get(id).args) near.add(a);
      for (const u of g.users(id)) near.add(u);
    }
    return near.size ? near : null;
  }
  runWhole(p) {
    const before = this.graph.clone();
    const g = this.graph;
    const sc = new GraphScope(g);
    const where = `${p.name}/<whole>`;
    let res;
    try {
      res = withScope(sc, () => p._whole({ graph: g, b: wholeBuilder(g, sc), edit: wholeBuilder(g, sc), param: (x) => this.paramValue(x, where), ctx: this.ctx, run: this, skip }));
    } catch (e) {
      if (e instanceof Skip) { this.graph = before; this.steps.push({ kind: "skip", pass: p.name, rule: "<whole>", node: null, reason: e.reason, graph: before }); return; }
      throw e;
    }
    if (res instanceof Graph) this.graph = res;
    this.graph.dce();
    this.recordStep(p, { name: "<whole>" }, null, before, null);
  }
  isDeclined(r, n) { const s = this.declined.get(r.uid); return s ? s.has(n) : false; }
  decline(r, n) { if (!this.declined.has(r.uid)) this.declined.set(r.uid, new WeakSet()); this.declined.get(r.uid).add(n); }
  tryRule(p, r, id) {
    const g = this.graph;
    const node = g.nodes.get(id);
    if (!node || node.def === INPUT) return false;
    if (this.isDeclined(r, node)) return false;
    if (!r.pat) return false;
    let env;
    try { env = r.pat.matchAt(g, id); } catch (e) { throw new KilnError("PatternError", `${p.name}/${r.name} at ${id}: ${e.message}`); }
    if (!env) return false;
    const rootId = env.__root || id;
    if (r.whens.length && !r.whens.every((w) => w({ ...env, node: g.value(rootId), graph: g }))) { this.decline(r, node); return false; }
    if (r.reqs.length) {
      const done = new Set(this.steps.filter((s) => s.kind === "rewrite").map((s) => s.rule));
      const miss = r.reqs.filter((x) => !done.has(x));
      if (miss.length) { this.decline(r, node); this.skipStep(p, r, id, `requires ${miss.join(", ")}`, false); return false; }
    }
    const before = g.clone();
    const where = `${p.name}/${r.name}@${rootId}`;
    const rctx = { ...env, graph: g, node: g.value(rootId), param: (x) => this.paramValue(x, where), ctx: this.ctx, run: this, skip, pass: p.name, rule: r.name };
    delete rctx.__root; delete rctx.__ids;
    const sc = new GraphScope(g);
    rctx.edit = wholeBuilder(g, sc);   // graph surgery inside a rule (not `b`: pattern variables are often called b)
    let res;
    try {
      res = withScope(sc, () => (r.mut ? r.mut({ ...rctx, tx: txFor(g, sc) }) : r.fn(rctx)));
    } catch (e) {
      this.graph = before;
      if (e instanceof Skip) { this.decline(r, node); this.skipStep(p, r, rootId, e.reason, e.reject); return false; }
      if (e instanceof KilnError && e.kind === "EvidenceError") throw e;
      throw new KilnError("RuleError", `${p.name}/${r.name} at ${rootId}: ${e.message}`, { rule: r.name, node: rootId, cause: e });
    }
    if (r.mut) { this.graph.dce(); return this.finish(p, r, rootId, before, null, node); }
    if (Array.isArray(res)) res = fork(res);
    if (res instanceof Fork) return this.applyFork(p, r, rootId, res, rctx, before, node);
    const out = this.applyResult(res, rootId, sc);
    if (out === "nochange") { this.graph = before; this.decline(r, node); return false; }
    const bad = this.validate(before, rootId);
    if (bad) { this.graph = before; this.decline(r, node); this.skipStep(p, r, rootId, bad, true); return false; }
    return this.finish(p, r, rootId, before, null, node);
  }
  applyResult(res, rootId, sc) {
    const g = this.graph;
    if (res == null) return "nochange";
    if (res instanceof Graph) { this.graph = res; return "ok"; }
    if (res instanceof InPlace) {
      const old = g.nodes.get(res.id);
      const kn = res.knobs ? { ...(old.knobs || {}), ...res.knobs } : old.knobs;
      const same = old.def === res.def && old.args.length === res.args.length && old.args.every((a, i) => a === res.args[i]) && attrKey(old.attrs) === attrKey(res.attrs) && canon(old.knobs || {}) === canon(kn || {});
      if (same) return "nochange";
      const n = new Node(res.id, res.def, res.args, res.attrs, null, kn);
      g.nodes.set(res.id, new Node(res.id, res.def, res.args, res.attrs, inferType(g, n), kn));
      if (res.removeId && res.removeId !== res.id && !g.users(res.removeId).length) g.remove(res.removeId);
      g.touch();
      g.dce();
      return "ok";
    }
    if (res instanceof Value) {
      if (res.id === rootId) return "nochange";
      if (!g.nodes.has(res.id)) throw new KilnError("RuleError", `the rewrite returned ${res.id}, which is not in the graph`);
      g.replaceUses(rootId, res.id, sc.created);
      g.dce();
      return "ok";
    }
    if (res instanceof OpTemplate) throw new KilnError("RuleError", `the rewrite returned an op template (${res.def.name}) — pass arguments, or use node.lower(${res.def.short}(…))`);
    throw new KilnError("RuleError", `a rewrite must return a value, node.with(…), node.lower(…), a fork, or nothing; got ${typeof res}`);
  }
  validate(before, rootId) {
    const g = this.graph;
    for (const n of g.nodes.values()) {
      if (before.nodes.get(n.id) === n) continue;
      const v = n.def.spec.validate;
      if (!v) continue;
      const r = v({ ...n.attrs, attrs: n.attrs, node: n, type: n.type, args: n.args.map((a) => g.value(a)) }, this.ctx);
      if (r !== true && r !== undefined && r !== null) return `${n.name} ${n.id} is not legal here: ${r === false ? "validate failed" : r}`;
    }
    return null;
  }
  applyFork(p, r, rootId, f, rctx, before, node) {
    const all = expandFork(f, rctx);
    if (!all.length) { this.graph = before; this.decline(r, node); this.skipStep(p, r, rootId, "fork with no options", false); return false; }
    // pins narrow the options
    const pinned = this.params.pinned();
    const knobNames = [...new Set(all.flatMap((o) => Object.keys(o.knobs)))];
    const pinnedHere = knobNames.filter((k) => k in pinned);
    let options = all.filter((o) => pinnedHere.every((k) => !(k in o.knobs) || String(o.knobs[k]) === String(pinned[k])));
    let honoured = pinnedHere;
    if (!options.length) { this.warnings.push(`pins ${pinnedHere.map((k) => k + "=" + pinned[k]).join(",")} are not offered by ${r.name} at ${rootId}; ignoring them there`); options = all; honoured = []; }
    const blockedSet = this.blocked.get(`${r.name}@${rootId}`);
    if (blockedSet) options = options.filter((o) => !blockedSet.has(canon(o.knobs))) || options;
    const fp = {
      pass: p.name, rule: r.name, ruleId: `${p.name}/${r.name}`, nodeId: rootId, node: this.graph.value(rootId),
      options, all, size: options.length, allPinned: knobNames.length > 0 && knobNames.every((k) => honoured.includes(k)), knobs: knobNames, pinned: honoured,
      key: identityOf(this.graph, rootId), ctx: this.ctx,
    };
    this.emit("fork", { pass: p.name, rule: r.name, node: rootId, options: options.length });
    let ranking = null;
    try { ranking = this.decidePolicy.rank(fp, this); } catch (e) { if (e instanceof KilnError) throw e; throw new KilnError("DecideError", `deciding ${r.name} at ${rootId}: ${e.message}`); }
    if (!ranking) ranking = { order: options.map((_, i) => i), by: "first" };
    const tried = [];
    for (const i of ranking.order) {
      const o = options[i];
      this.graph = before.clone(); this.graph.touch();
      const sc = new GraphScope(this.graph);
      let res;
      try { res = withScope(sc, () => o.build({ ...rctx, graph: this.graph, node: this.graph.value(rootId) })); }
      catch (e) { if (e instanceof Skip) { tried.push({ knobs: o.knobs, reason: e.reason }); continue; } throw new KilnError("RuleError", `${p.name}/${r.name} option ${canon(o.knobs)} at ${rootId}: ${e.message}`, { cause: e }); }
      if (Array.isArray(res) || res instanceof Fork) throw new KilnError("RuleError", "a fork option cannot return another fork; use k.fork.tree() for several knobs");
      const out = this.applyResult(res, rootId, sc);
      const decision = { pass: p.name, rule: r.name, node: rootId, key: fp.key, options: options.map((x, j) => ({ knobs: x.knobs, label: x.label, score: ranking.scores?.[options.indexOf(x)] ?? null, original: !!x.original, j })), size: options.length, by: ranking.by, note: ranking.note ?? null, knobs: o.knobs, label: o.label, score: ranking.scores?.[i] ?? null, chosen: i, tried, original: !!o.original, t: this.now() };
      if (out === "nochange") {
        this.graph = before;
        this.decline(r, node);
        this.decisions.push(decision);
        this.emit("decided", { decision });
        return false;
      }
      const bad = this.validate(before, rootId);
      if (bad) { tried.push({ knobs: o.knobs, reason: bad }); continue; }
      const gbad = this.runGuards(r, before, rootId);
      if (gbad) { tried.push({ knobs: o.knobs, reason: gbad }); continue; }
      // stamp the knobs on what this option built or changed
      for (const n of [...this.graph.nodes.values()]) if (before.nodes.get(n.id) !== n && n.def !== INPUT) this.graph.nodes.set(n.id, new Node(n.id, n.def, n.args, n.attrs, n.type, { ...(n.knobs || {}), ...o.knobs }));
      this.graph.touch();
      this.decisions.push(decision);
      this.passStats[p.name].forks++;
      this.emit("decided", { decision });
      return this.finish(p, r, rootId, before, decision, node, true);
    }
    this.graph = before;
    this.decline(r, node);
    this.skipStep(p, r, rootId, `no legal option among ${options.length}: ${tried.slice(0, 3).map((t) => `${canon(t.knobs)} (${t.reason})`).join("; ")}`, true);
    this.decisions.push({ pass: p.name, rule: r.name, node: rootId, key: fp.key, options: options.map((x) => ({ knobs: x.knobs, label: x.label })), size: options.length, by: "none", knobs: null, failed: true, tried, t: this.now() });
    return false;
  }
  runGuards(r, before, rootId) {
    for (const gfn of r.guards) {
      const res = gfn({ before, after: this.graph, root: rootId, node: this.graph.value(rootId), ctx: this.ctx, run: this });
      if (res !== true && res !== undefined && res !== null) return res === false ? "guard failed" : String(res);
    }
    return null;
  }
  finish(p, r, rootId, before, decision, node, guarded = false) {
    if (!guarded && r.guards.length) {
      const bad = this.runGuards(r, before, rootId);
      if (bad) { this.graph = before; this.decline(r, node); this.skipStep(p, r, rootId, bad, true); return false; }
    }
    this.recordStep(p, r, rootId, before, decision);
    if (!this.graph.nodes.has(rootId) || this.graph.nodes.get(rootId) === node) this.decline(r, node);
    return true;
  }
  recordStep(p, r, rootId, before, decision) {
    const after = this.graph;
    const removed = [...before.nodes.keys()].filter((id) => !after.nodes.has(id));
    const added = [...after.nodes.keys()].filter((id) => !before.nodes.has(id));
    const changed = [...after.nodes.keys()].filter((id) => before.nodes.has(id) && before.nodes.get(id) !== after.nodes.get(id));
    const bIds = new Set([...removed, ...changed]), aIds = new Set([...added, ...changed]);
    // a step keeps its delta (nodes are immutable, so this is cheap) and, every 48 rewrites, a full snapshot;
    // stepGraph(i) rebuilds any step's graph from the nearest snapshot. Printed diffs are clipped.
    const nRewrites = (this._nRewrites = (this._nRewrites || 0) + 1);
    const step = {
      i: this.steps.length, kind: "rewrite", pass: p.name, short: p._short, rule: r.name, node: rootId, t: this.now(),
      removed, added, changed, decision: decision ? { by: decision.by, knobs: decision.knobs, size: decision.size } : null,
      before: bIds.size ? clipLines(printGraph(before, { ids: bIds, header: false }), 160) : "",
      after: aIds.size ? clipLines(printGraph(after, { ids: aIds, header: false }), 160) : "",
      delta: { removed, nodes: [...added, ...changed].map((id) => after.nodes.get(id)), inputs: after.inputs.map((x) => ({ ...x })), outputs: after.outputs.map((x) => ({ ...x })), next: after.next },
      graph: nRewrites % 48 === 0 ? after.clone() : null,
    };
    this.steps.push(step);
    this.passStats[p.name].applied++;
    this.emit("rewrite", { pass: p.name, rule: r.name, node: rootId, step: step.i });
  }
  skipStep(p, r, id, reason, reject) {
    this.steps.push({ i: this.steps.length, kind: "skip", pass: p.name, short: p._short, rule: r.name, node: id, reason, reject, t: this.now(), graph: null });
    this.passStats[p.name].skipped++;
    this.emit("skip", { pass: p.name, rule: r.name, node: id, text: reason });
  }
}
export function identityOf(g, id) {
  const n = g.nodes.get(id);
  if (n?.def.spec.identity) return n.def.spec.identity({ ...n.attrs, attrs: n.attrs, node: n, type: n.type, args: n.args.map((a) => g.value(a)) });
  return g.nodeKey(id);
}
function wholeBuilder(g, sc) {
  return {
    graph: g,
    value: (id) => g.value(id),
    replace: (id, v) => { g.replaceUses(toId(id), toId(v), sc.created); return v; },
    remove: (id) => g.remove(toId(id)),
    replaceAll: (v) => { for (const o of g.outputs) o.id = toId(v); g.dce(); return v; },
    setOutputs: (outs) => { g.outputs = Object.entries(outs).map(([name, v]) => ({ name, id: toId(v) })); },
    node: (def, args, attrs) => sc.add(def.def || def, args.map((a) => (a instanceof Value ? a : g.value(a))), attrs || {}),
    hostArg: (v) => v,
  };
}
function txFor(g, sc) {
  return {
    set: (v, patch) => { const n = g.nodes.get(toId(v)); const nn = new Node(n.id, patch.def || n.def, patch.args ? patch.args.map(toId) : n.args, patch.attrs ? { ...n.attrs, ...patch.attrs } : n.attrs, null, n.knobs); g.nodes.set(n.id, new Node(n.id, nn.def, nn.args, nn.attrs, inferType(g, nn), n.knobs)); g.touch(); },
    replace: (v, w) => { g.replaceUses(toId(v), toId(w), sc.created); g.dce(); },
    insert: (v) => v,
    remove: (v) => { g.remove(toId(v)); },
  };
}
function parsePassFilter(spec, pipe) {
  const out = new Set();
  const list = Array.isArray(spec) ? spec : String(spec).includes("/") || String(spec).includes(",") ? String(spec).split(",").map((s) => s.trim()) : [...String(spec)];
  for (const x of list) {
    const p = pipe.passes.find((q) => q._short === x || q.name === x);
    if (!p) throw new KilnError("PipelineError", `no pass "${x}" (letters: ${pipe.passes.map((q) => q._short).filter(Boolean).join("")})`);
    out.add(p);
  }
  return out;
}

const clipLines = (text, n) => { const ls = text.split("\n"); return ls.length <= n ? text : ls.slice(0, n).join("\n") + `\n    … ${ls.length - n} more lines`; };

// ============================================================================ diffs
export function unifiedDiff(a, b) {
  const A = (a || "").split("\n").filter((l) => l !== ""), B = (b || "").split("\n").filter((l) => l !== "");
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) { if (A[i] === B[j]) { out.push({ op: " ", text: A[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ op: "-", text: A[i++] }); else out.push({ op: "+", text: B[j++] }); }
  while (i < n) out.push({ op: "-", text: A[i++] });
  while (j < m) out.push({ op: "+", text: B[j++] });
  return out;
}

// ============================================================================ the k namespace
export const k = {
  dialect, graph, trace, lift, tensor, scalar, typeStr, rule, pass, pipeline, param, params, fork, decide, strategy, skip, knobs,
  ix: { ...IX.ix, map: IX.map, compose: IX.compose, identity: IX.identity, print: IX.print, subst: IX.subst, vars: IX.vars, eval: IX.evalIx },
  ...T, Tensor, Graph, KilnError, unifiedDiff, dialects: () => [...DIALECTS.values()],
};
