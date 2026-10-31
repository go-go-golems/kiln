import {avgPool2dSpec,avgPool2dReference,lowerAvgPool2d,adaptiveAvgPool2dSpec,adaptiveAvgPool2dReference,lowerAdaptiveAvgPool2d} from './pooling.js';
import {maxPool2dSpec,maxPool2dReference,lowerMaxPool2d} from './pooling.js';
import {padSpec,padReference,lowerPad,rollSpec,rollReference,lowerRoll} from './layout.js';
import {matmulSpec,linearSpec,matmulReference,linearReference,lowerMatmul,lowerLinear} from './matmul.js';
import {concatSpec,concatReference,lowerConcat} from "./concat.js";
import {bilinearSpec,bilinearReference,lowerBilinear} from "./bilinear.js";
import {conv2dSpec,conv2dReference,lowerConv2d} from "./conv2d.js";
import { roundToDtype } from "../core/dtypes.js";
// The frontend ("Torch IR", dialect nn) and the canonical primitive set ("Tensor IR", dialect tensor),
// with reference semantics for both and the decomposition and optimization passes between them.
import { k, P, Value, KilnError, Node } from "../core/kiln.js";
import { Tensor, numel, strides, rng } from "../core/util.js";
import * as IX from "../core/ix.js";
import { fn as F, reducer } from "./fns.js";

// ----------------------------------------------------------------------------- reference helpers
const asT = (x) => (x instanceof Tensor ? x : typeof x === "number" ? new Tensor([], Float32Array.of(x)) : Array.isArray(x) ? new Tensor([x.length], Float32Array.from(x)) : x);
export function bshape(...shapes) {
  const n = Math.max(...shapes.map((s) => s.length));
  const out = [];
  for (let i = 0; i < n; i++) {
    let d = 1;
    for (const s of shapes) {
      const x = s[s.length - n + i] ?? 1;
      if (x !== 1 && d !== 1 && x !== d) throw new KilnError("ShapeError", `cannot broadcast shapes ${shapes.map((q) => "(" + q.join(",") + ")").join(" and ")}`);
      if (x !== 1) d = x;
    }
    out.push(d);
  }
  return out;
}
function ewRef(name, xs) {
  xs = xs.map(asT);
  const f = F(name).js;
  const shape = bshape(...xs.map((x) => x.shape));
  const out = new Tensor(shape);
  const n = out.data.length, D = shape.length, m = xs.length, o = out.data;
  // per input, per output dim: the stride to step (0 where the input broadcasts)
  const st = xs.map((x) => { const s = strides(x.shape); const off = D - x.shape.length; return shape.map((d, i) => (i < off || x.shape[i - off] === 1 ? 0 : s[i - off])); });
  const d0 = xs[0].data, d1 = xs[1]?.data, d2 = xs[2]?.data;
  // fast path: inputs are full-size or scalars
  if (xs.every((x) => x.data.length === n || x.data.length === 1)) {
    const at = (d) => (d.length === 1 && n !== 1 ? 0 : 1);
    const s0 = at(d0), s1 = d1 ? at(d1) : 0, s2 = d2 ? at(d2) : 0;
    // the common arithmetic without a call per element
    if (m === 2 && (name === "add" || name === "sub" || name === "mul" || name === "div")) {
      if (name === "add") for (let e = 0; e < n; e++) o[e] = d0[e * s0] + d1[e * s1];
      else if (name === "sub") for (let e = 0; e < n; e++) o[e] = d0[e * s0] - d1[e * s1];
      else if (name === "mul") for (let e = 0; e < n; e++) o[e] = d0[e * s0] * d1[e * s1];
      else for (let e = 0; e < n; e++) o[e] = d0[e * s0] / d1[e * s1];
      return out;
    }
    if (m === 3 && name === "fma") { for (let e = 0; e < n; e++) o[e] = d0[e * s0] * d1[e * s1] + d2[e * s2]; return out; }
    if (m === 1) for (let e = 0; e < n; e++) o[e] = f(d0[e * s0]);
    else if (m === 2) for (let e = 0; e < n; e++) o[e] = f(d0[e * s0], d1[e * s1]);
    else if (m === 3) for (let e = 0; e < n; e++) o[e] = f(d0[e * s0], d1[e * s1], d2[e * s2]);
    else for (let e = 0; e < n; e++) o[e] = f(...xs.map((x) => x.data[x.data.length === 1 ? 0 : e]));
    return out;
  }
  // general broadcasting: an odometer over the output with running input offsets
  const idx = new Int32Array(D), off = new Array(m).fill(0);
  for (let e = 0; e < n; e++) {
    o[e] = m === 1 ? f(d0[off[0]]) : m === 2 ? f(d0[off[0]], d1[off[1]]) : m === 3 ? f(d0[off[0]], d1[off[1]], d2[off[2]]) : f(...xs.map((x, j) => x.data[off[j]]));
    for (let i = D - 1; i >= 0; i--) {
      idx[i]++;
      for (let j = 0; j < m; j++) off[j] += st[j][i];
      if (idx[i] < shape[i]) break;
      for (let j = 0; j < m; j++) off[j] -= st[j][i] * shape[i];
      idx[i] = 0;
    }
  }
  return out;
}
function reduceRef(name, x, axis, keep = true) {
  x = asT(x);
  axis = axis < 0 ? x.shape.length + axis : axis;
  const R = reducer(name);
  const oshape = x.shape.map((d, i) => (i === axis ? 1 : d));
  const out = new Tensor(oshape);
  const st = strides(x.shape), os = strides(oshape);
  for (let e = 0; e < out.data.length; e++) {
    let r = e, base = 0;
    for (let i = 0; i < oshape.length; i++) { const c = Math.floor(r / os[i]); r -= c * os[i]; base += c * st[i]; }
    let acc = R.init;
    for (let j = 0; j < x.shape[axis]; j++) acc = R.js(acc, x.data[base + j * st[axis]]);
    out.data[e] = acc;
  }
  return keep ? out : new Tensor(oshape.filter((_, i) => i !== axis), out.data);
}
// a view gathers through an index map; the map is compiled to a JS loop nest once per (map, shapes)
const VIEW_FNS = new Map();
export function viewRef(x, shape, map) {
  x = asT(x);
  const key = `${map.key()}|${shape.join("x")}|${x.shape.join("x")}`;
  let fn = VIEW_FNS.get(key);
  if (!fn) {
    const is = strides(x.shape);
    const offset = map.exprs.map((e, j) => (is[j] ? `${IX.toJs(e)} * ${is[j]}` : null)).filter(Boolean).join(" + ") || "0";
    let body = "";
    shape.forEach((d, i) => { body += `for (let a${i} = 0; a${i} < ${d}; a${i}++) `; });
    body += `out[e++] = src[${offset}];`;
    fn = new Function("src", "out", "__mod", `let e = 0; ${body}`);
    if (VIEW_FNS.size > 500) VIEW_FNS.clear();
    VIEW_FNS.set(key, fn);
  }
  const out = new Tensor(shape);
  fn(x.data, out.data, (a, b) => ((a % b) + b) % b);
  return out;
}
const rows = (x) => { const D = x.shape.at(-1); return [x.data.length / D, D]; };
function rmsRef(x, w, eps) { x = asT(x); w = asT(w); const [R, D] = rows(x); const o = new Tensor(x.shape); for (let r = 0; r < R; r++) { let s = 0; for (let j = 0; j < D; j++) s += x.data[r * D + j] ** 2; const inv = 1 / Math.sqrt(s / D + eps); for (let j = 0; j < D; j++) o.data[r * D + j] = x.data[r * D + j] * inv * w.data[j]; } return o; }
function lnRef(x, w, b, eps) { x = asT(x); w = asT(w); b = asT(b); const [R, D] = rows(x); const o = new Tensor(x.shape); for (let r = 0; r < R; r++) { let m = 0; for (let j = 0; j < D; j++) m += x.data[r * D + j]; m /= D; let v = 0; for (let j = 0; j < D; j++) v += (x.data[r * D + j] - m) ** 2; const inv = 1 / Math.sqrt(v / D + eps); for (let j = 0; j < D; j++) o.data[r * D + j] = (x.data[r * D + j] - m) * inv * w.data[j] + b.data[j]; } return o; }
function softmaxRef(x, dim) { x = asT(x); const ax = dim < 0 ? x.shape.length + dim : dim; const mx = reduceRef("max", x, ax); const e = ewRef("exp", [ewRef("sub", [x, mx])]); return ewRef("div", [e, reduceRef("add", e, ax)]); }
function reshapeMap(inShape, outShape) {
  // Inserting/removing unit axes preserves each non-unit coordinate directly.
  // Flatten/unflatten is equivalent but retains spurious cross-axis dependencies,
  // which can hide contraction structure from scheduling analysis.
  const inputAxes = inShape.map((extent, axis) => ({ extent, axis })).filter(d => d.extent !== 1);
  const outputAxes = outShape.map((extent, axis) => ({ extent, axis })).filter(d => d.extent !== 1);
  if (inputAxes.length === outputAxes.length && inputAxes.every((d, i) => d.extent === outputAxes[i].extent)) {
    const coordinates = new Map(inputAxes.map((d, i) => [d.axis, outputAxes[i].axis]));
    return IX.map(outShape.length, a => inShape.map((extent, axis) => extent === 1 ? IX.C(0) : a[coordinates.get(axis)]));
  }
  return IX.map(outShape.length, (a) => {
    const os = strides(outShape), is = strides(inShape);
    let flat = IX.C(0);
    a.forEach((v, i) => { flat = flat.add(v.mul(os[i])); });
    return inShape.map((d, j) => (d === 1 ? IX.C(0) : flat.div(is[j]).mod(d)));
  });
}
export function broadcastMap(from, to) {
  const off = to.length - from.length;
  return IX.map(to.length, (a) => from.map((d, j) => (d === 1 && to[j + off] !== 1 ? IX.C(0) : a[j + off])));
}

// ----------------------------------------------------------------------------- dialects
function weakScalar(value) {
  if (value.is?.("tensor.const")) return value.type.shape.length === 0 && !value.attrs.data;
  if (value.is?.("tensor.view")) return weakScalar(value.arg("x"));
  return false;
}
function elementwiseDtype(xs) {
  const dtypes = [...new Set(xs.filter((x) => !weakScalar(x)).map((x) => x.type.dtype || "f32"))];
  if (dtypes.length === 1 && ["f16", "bf16"].includes(dtypes[0])) return dtypes[0];
  return "f32";
}
function roundedReference(value, type) {
  if (["f16", "bf16"].includes(type?.dtype)) {
    for (let i = 0; i < value.data.length; i++) value.data[i] = roundToDtype(value.data[i], type.dtype);
  }
  return value;
}
const T_ = (shape, dtype = "f32") => k.tensor(shape, dtype);
const sameAs = ({ x }) => x.type;

export const nn = k.dialect("nn").describe("the frontend: a small PyTorch-like op set, each with reference semantics")
  .op("concat", { args: {variadic:"xs"}, attrs: {axis:0}, traits:["pure"], infer: ({xs,axis}) => {
    const spec=concatSpec(xs.map(x=>x.type.shape),axis);
    const dtype=xs[0].type.dtype;
    if (!["f32","f16","bf16"].includes(dtype) || xs.some(x=>x.type.dtype!==dtype)) throw new KilnError("TypeError","concat requires matching floating dtypes");
    return k.tensor(spec.shape,dtype);
  }, eval: ({xs,axis}) => concatReference(xs,axis), print:"concat({xs}, axis={axis})" })
  .op("bilinear", { args: ["x"], attrs: { size: [1,1] }, infer: ({x,size}) => {
    if(x.type.dtype!=="f32")throw new KilnError("TypeError","bilinear lowering currently requires FP32");
    return k.tensor(bilinearSpec(x.type.shape,size));
  }, eval: ({x,size}) => bilinearReference(x,size), print: "bilinear({x}, {size})" })
  .op("adaptive_avg_pool2d", { args: ["x"], attrs: {output_size: [1,1]}, infer: ({x,output_size}) => {
    if(x.type.dtype!=="f32")throw new KilnError("TypeError","adaptive_avg_pool2d arithmetic requires FP32");
    return k.tensor(adaptiveAvgPool2dSpec(x.type.shape,output_size).shape);
  }, eval: ({x,output_size}) => adaptiveAvgPool2dReference(x,output_size), print:"adaptive_avg_pool2d({x})" })
  .op("avg_pool2d", { args: ["x"], attrs: { kernel_size: 1, stride: null, padding: 0, ceil_mode: false, count_include_pad: true, divisor_override: null },
    infer: ({x,...options}) => {
      if(x.type.dtype!=="f32")throw new KilnError("TypeError","avg_pool2d arithmetic requires FP32");
      return k.tensor(avgPool2dSpec(x.type.shape,options).shape);
    }, eval: ({x,...options}) => avgPool2dReference(x,options), print: "avg_pool2d({x})" })
  .op("max_pool2d", { args: ["x"], attrs: {kernel_size:1,stride:null,padding:0,dilation:1,ceil_mode:false,return_indices:false},
    infer: ({x,...options}) => { if(x.type.dtype!=="f32")throw new KilnError("TypeError","max_pool2d arithmetic requires FP32"); return k.tensor(maxPool2dSpec(x.type.shape,options).shape); },
    eval: ({x,...options}) => maxPool2dReference(x,options), print:"max_pool2d({x})" })
  .op("pad", {args:["x"],attrs:{pad:[],mode:"constant",value:0},
    infer:({x,pad,mode,value})=>k.tensor(padSpec(x.type.shape,pad,mode,value).shape,x.type.dtype),
    eval:({x,pad,mode,value,type})=>roundedReference(padReference(x,pad,mode,value),type),print:"pad({x})"})
  .op("roll", {args:["x"],attrs:{shifts:0,dims:null},
    infer:({x,shifts,dims})=>k.tensor(rollSpec(x.type.shape,shifts,dims).shape,x.type.dtype),
    eval:({x,shifts,dims})=>rollReference(x,shifts,dims),print:"roll({x})"})
  .op("conv2d", { args: ["x", "w", "b"], attrs: { stride: 1, padding: 0, dilation: 1, groups: 1 }, infer: ({ x,w,b,stride,padding,dilation,groups }) => {
    if ([x,w,b].some(v=>v.type.dtype!=="f32")) throw new KilnError("TypeError", "conv2d lowering currently requires FP32");
    const shape=conv2dSpec(x.type.shape,w.type.shape,{stride,padding,dilation,groups}).shape;
    if(b.type.shape.length!==1||b.type.shape[0]!==shape[1])throw new KilnError("ShapeError","conv2d bias shape mismatch");
    return k.tensor(shape);
  }, eval: ({ x,w,b,stride,padding,dilation,groups }) => conv2dReference(x,w,b,{stride,padding,dilation,groups}), print: "conv2d({x}, {w}, {b})" })
  .op("cast", { args: ["x"], attrs: { dtype: "f32" }, traits: ["pure"], infer: ({ x, dtype }) => {
    if (!["f32", "f16", "bf16"].includes(dtype)) throw new KilnError("TypeError", `unsupported floating cast: ${dtype}`);
    return k.tensor(x.type.shape, dtype);
  }, eval: ({ x, type }) => roundedReference(new Tensor(x.shape, x.data.slice()), type), print: "cast({x}, {dtype})" })
  .op("ew", { args: { variadic: "xs" }, attrs: { fn: "add" }, traits: ["pure"], infer: ({ xs, fn }) => (F(fn), T_(bshape(...xs.map((x) => x.type.shape)), elementwiseDtype(xs))), eval: ({ xs, fn, type }) => roundedReference(ewRef(fn, xs), type), print: "{fn}({xs})" })
  .op("linear", { args: ["x", "w"], infer: ({x,w}) => {
    if(x.type.dtype!=="f32"||w.type.dtype!=="f32")throw new KilnError("TypeError","linear arithmetic requires FP32; widen operands and narrow the source operation result explicitly");
    return T_(linearSpec(x.type.shape,w.type.shape).shape);
  }, eval: ({x,w}) => linearReference(x,w), print:"linear({x}, {w})" })
  .op("matmul", { args: ["a", "b"], infer: ({a,b}) => {
    if(a.type.dtype!=="f32"||b.type.dtype!=="f32")throw new KilnError("TypeError","matmul arithmetic requires FP32; widen operands and narrow the source operation result explicitly");
    return T_(matmulSpec(a.type.shape,b.type.shape).shape);
  }, eval: ({a,b}) => matmulReference(a,b), print:"matmul({a}, {b})" })
  .op("rms_norm", { args: ["x", "w"], attrs: { eps: 1e-6 }, infer: sameAs, eval: ({ x, w, eps }) => rmsRef(x, w, eps), print: "rms_norm({x}, {w}, eps={eps})" })
  .op("layer_norm", { args: ["x", "w", "b"], attrs: { eps: 1e-5 }, infer: sameAs, eval: ({ x, w, b, eps }) => lnRef(x, w, b, eps), print: "layer_norm({x}, {w}, {b}, eps={eps})" })
  .op("softmax", { args: ["x"], attrs: { dim: -1 }, infer: sameAs, eval: ({ x, dim }) => softmaxRef(x, dim), print: "softmax({x}, dim={dim})" })
  .op("gelu", { args: ["x"], attrs: { approximate: "tanh" }, infer: ({ x, approximate }) => { if (!["none", "tanh"].includes(approximate)) throw new KilnError("TypeError", "gelu approximate must be none or tanh"); return x.type; }, eval: ({ x, approximate, type }) => approximate === "none" ? roundedReference(ewRef("gelu_erf", [x]), type) : ewRef("mul", [ewRef("mul", [x, 0.5]), ewRef("add", [1, ewRef("tanh", [ewRef("mul", [0.7978845608, ewRef("add", [x, ewRef("mul", [0.044715, ewRef("mul", [x, ewRef("mul", [x, x])])])])])])])]), print: "gelu({x})" })
  .op("silu", { args: ["x"], infer: sameAs, eval: ({ x }) => ewRef("mul", [x, ewRef("sigmoid", [x])]), print: "silu({x})" })
  .op("reduce", { args: ["x"], attrs: { fn: "add", axis: -1, keepdim: true }, infer: ({ x, axis, keepdim }) => { const s = x.type.shape; const a = axis < 0 ? s.length + axis : axis; return T_(keepdim ? s.map((d, i) => (i === a ? 1 : d)) : s.filter((_, i) => i !== a)); }, eval: ({ x, fn, axis, keepdim }) => reduceRef(fn, x, axis, keepdim), print: "{fn}({x}, axis={axis})" })
  .op("transpose", { args: ["x"], attrs: { d0: -2, d1: -1 }, infer: ({ x, d0, d1 }) => { const s = x.type.shape.slice(); const n = s.length; const i = d0 < 0 ? n + d0 : d0, j = d1 < 0 ? n + d1 : d1; [s[i], s[j]] = [s[j], s[i]]; return T_(s, x.type.dtype); }, eval: ({ x, d0, d1, type }) => { const n = asT(x).shape.length; const i = d0 < 0 ? n + d0 : d0, j = d1 < 0 ? n + d1 : d1; return viewRef(x, type.shape, IX.map(n, (a) => { const b = a.slice(); [b[i], b[j]] = [b[j], b[i]]; return b; })); }, print: "transpose({x}, {d0}, {d1})" })
  .op("reshape", { args: ["x"], attrs: { shape: [] }, infer: ({ x, shape }) => { if (numel(shape) !== numel(x.type.shape)) throw new KilnError("ShapeError", `reshape (${x.type.shape}) → (${shape}): sizes differ`); return T_(shape, x.type.dtype); }, eval: ({ x, shape }) => new Tensor(shape, asT(x).data.slice()), print: "reshape({x}, {shape})" })
  .op("slice", { args: ["x"], attrs: { axis: 0, start: 0, end: 1 }, infer: ({ x, axis, start, end }) => { const s = x.type.shape.slice(); const a = axis < 0 ? s.length + axis : axis; s[a] = end - start; return T_(s, x.type.dtype); }, eval: ({ x, axis, start, type }) => { const n = asT(x).shape.length; const a = axis < 0 ? n + axis : axis; return viewRef(x, type.shape, IX.map(n, (c) => c.map((v, i) => (i === a ? v.add(start) : v)))); }, print: "{x}[{axis}: {start}..{end}]" });

export const tensor = k.dialect("tensor").describe("Tensor IR: elementwise, reduction and index-map primitives")
  .op("const", { attrs: { value: 0, shape: [], data: null }, traits: ["pure", "any-ir"], infer: ({ shape, data }) => T_(data ? data.shape : shape),
    eval: ({ value, shape, data }) => (data ? data : Tensor.fill(shape, value)),
    print: ({ value, shape, data, name }) => (data ? `${name ? name + " " : ""}data(${data.shape.join("×")})` : shape.length ? `splat ${+(+value).toPrecision(6)} (${shape.join("×")})` : String(+(+value).toPrecision(6))) })
  .op("ew", { args: { variadic: "xs" }, attrs: { fn: "add", dtype: null }, traits: ["pure"], infer: ({ xs, dtype }) => T_(xs[0].type.shape, dtype || elementwiseDtype(xs)), eval: ({ xs, fn, type }) => roundedReference(ewRef(fn, xs), type),
    validate: ({ args }) => args.every((a) => a.type.shape.join() === args[0].type.shape.join()) || "elementwise inputs must share a shape (insert views)", print: "{fn}({xs})" })
  .op("reduce", { args: ["x"], attrs: { fn: "add", axis: -1 }, traits: ["pure"], infer: ({ x, axis }) => { const s = x.type.shape; const a = axis < 0 ? s.length + axis : axis; return T_(s.map((d, i) => (i === a ? 1 : d))); }, eval: ({ x, fn, axis }) => reduceRef(fn, x, axis), print: "{fn}({x}, axis={axis})" })
  .op("view", { args: ["x"], attrs: { shape: [], map: null }, traits: ["pure"], infer: ({ x, shape }) => T_(shape, x.type.dtype), eval: ({ x, shape, map }) => viewRef(x, shape, map),
    print: ({ x, map }) => `${x}[${map.exprs.map((e) => IX.print(e)).join(", ")}]` });

// constants: splat values lift to tensor.const; data constants carry a Tensor
for (const d of [nn, tensor]) d.lifts((v) => (v instanceof Tensor ? tensor.const({ data: v, shape: v.shape }) : tensor.const({ value: v, shape: [] })));

export function weight(name, shape, { seed = null, scale = null, init = "normal" } = {}) {
  const s = seed ?? [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const sc = scale ?? 1 / Math.sqrt(shape.at(-1) || 1);
  const t = init === "ones" ? Tensor.fill(shape, 1) : init === "zeros" ? Tensor.fill(shape, 0) : Tensor.random(shape, { seed: s, scale: sc });
  return tensor.const({ data: t, shape, name });
}

// ----------------------------------------------------------------------------- helpers over Tensor IR
// broadcast-aware: T.add(a, b) inserts the views elementwise ops need
const cnst = (v) => tensor.const({ value: v, shape: [] });
const toV = (x) => (x instanceof Value ? x : x instanceof Tensor ? tensor.const({ data: x, shape: x.shape }) : cnst(x));
export const T = {
  c: cnst,
  bc(x, shape) { x = toV(x); const s = x.type.shape; if (s.join() === shape.join()) return x; return tensor.view(x, { shape, map: broadcastMap(s, shape) }); },
  ew(fnName, ...xs) { xs = xs.map(toV); const shape = bshape(...xs.map((x) => x.type.shape)); return tensor.ew(xs.map((x) => T.bc(x, shape)), { fn: fnName }); },
  reduce(x, fnName, axis) { return tensor.reduce(x, { fn: fnName, axis: axis < 0 ? x.type.shape.length + axis : axis }); },
  sum: (x, axis = -1) => T.reduce(x, "add", axis),
  max: (x, axis = -1) => T.reduce(x, "max", axis),
  view(x, shape, mapFn) { return tensor.view(x, { shape, map: IX.map(shape.length, mapFn) }); },
  squeeze(x, axis) { const s = x.type.shape; const a = axis < 0 ? s.length + axis : axis; return T.view(x, s.filter((_, i) => i !== a), (c) => [...c.slice(0, a), IX.C(0), ...c.slice(a)]); },
  reshape(x, shape) { return tensor.view(x, { shape, map: reshapeMap(x.type.shape, shape) }); },
};
for (const name of ["add", "sub", "mul", "div", "max", "min", "pow", "exp", "log", "sqrt", "rsqrt", "tanh", "sigmoid", "relu", "neg", "abs", "floor", "square", "recip", "gt", "lt", "select", "sin", "cos"]) {
  if (!T[name]) T[name] = (...xs) => T.ew(name, ...xs);
}
T.maximum = (a, b) => T.ew("max", a, b);

// nn-level conveniences for writing programs: x.add(y), x.matmul(w), x.softmax()
const nv = (x) => (x instanceof Value ? x : tensor.const({ value: x, shape: [] }));
export const N = {
  adaptiveAvgPool2d: (x,output_size) => ["f16","bf16"].includes(x.type.dtype)
    ? N.cast(nn.adaptive_avg_pool2d(N.cast(x,"f32"),{output_size}),x.type.dtype) : nn.adaptive_avg_pool2d(x,{output_size}),
  avgPool2d: (x,options) => ["f16","bf16"].includes(x.type.dtype)
    ? N.cast(nn.avg_pool2d(N.cast(x,"f32"),options),x.type.dtype) : nn.avg_pool2d(x,options),
  maxPool2d: (x,options) => ["f16","bf16"].includes(x.type.dtype)
    ? N.cast(nn.max_pool2d(N.cast(x,"f32"),options),x.type.dtype) : nn.max_pool2d(x,options),
  pad:(x,pad,mode="constant",value=0)=>nn.pad(x,{pad,mode,value}),
  roll:(x,shifts,dims=null)=>nn.roll(x,{shifts,dims}),
  concat: (xs, axis=0) => nn.concat(xs,{axis}),
  resizeBilinear: (x,size) => ["f16","bf16"].includes(x.type.dtype)
    ? N.cast(nn.bilinear(N.cast(x,"f32"),{size}),x.type.dtype) : nn.bilinear(x,{size}),
  conv2d: (x,w,b,options={}) => {
    if (["f16","bf16"].includes(x.type.dtype)) {
      if(w.type.dtype!==x.type.dtype || (b && b.type.dtype!==x.type.dtype)) throw new KilnError("TypeError","conv2d mixed low-precision operands unsupported");
      const convolved = N.cast(nn.conv2d(N.cast(x,"f32"),N.cast(w,"f32"),tensor.const({value:0,shape:[w.type.shape[0]]}),options),x.type.dtype);
      return b ? N.add(convolved,N.reshape(b,[1,w.type.shape[0],1,1])) : convolved;
    }
    return nn.conv2d(x,w,b || tensor.const({value:0,shape:[w.type.shape[0]]}),options);
  },
  cast: (x, dtype) => nn.cast(x, { dtype }),
  ew: (f, ...xs) => nn.ew(xs.map(nv), { fn: f }),
  add: (a, b) => N.ew("add", a, b), sub: (a, b) => N.ew("sub", a, b), mul: (a, b) => N.ew("mul", a, b), div: (a, b) => N.ew("div", a, b),
  max: (a, b) => N.ew("max", a, b), min: (a, b) => N.ew("min", a, b), pow: (a, b) => N.ew("pow", a, b),
  exp: (x) => N.ew("exp", x), log: (x) => N.ew("log", x), sqrt: (x) => N.ew("sqrt", x), rsqrt: (x) => N.ew("rsqrt", x), tanh: (x) => N.ew("tanh", x),
  sigmoid: (x) => N.ew("sigmoid", x), relu: (x) => N.ew("relu", x), abs: (x) => N.ew("abs", x), floor: (x) => N.ew("floor", x), neg: (x) => N.ew("neg", x), square: (x) => N.ew("square", x),
  sin: (x) => N.ew("sin", x), cos: (x) => N.ew("cos", x), select: (c, a, b) => N.ew("select", c, a, b), gt: (a, b) => N.ew("gt", a, b), lt: (a, b) => N.ew("lt", a, b),
  sum: (x, axis = -1, keepdim = true) => nn.reduce(x, { fn: "add", axis, keepdim }),
  amax: (x, axis = -1, keepdim = true) => nn.reduce(x, { fn: "max", axis, keepdim }),
  mean: (x, axis = -1, keepdim = true) => N.mul(N.sum(x, axis, keepdim), 1 / x.type.shape.at(axis < 0 ? axis : axis)),
  linear: (x, w, b) => (b ? N.add(nn.linear(x, w), b) : nn.linear(x, w)),
  matmul: (a, b) => nn.matmul(a, b),
  rms_norm: (x, w, o = {}) => nn.rms_norm(x, w, o), layer_norm: (x, w, b, o = {}) => nn.layer_norm(x, w, b, o),
  softmax: (x, dim = -1) => nn.softmax(x, { dim }), gelu: (x, approximate = "tanh") => nn.gelu(x, { approximate }), silu: (x) => nn.silu(x),
  transpose: (x, d0 = -2, d1 = -1) => nn.transpose(x, { d0, d1 }), reshape: (x, shape) => nn.reshape(x, { shape }),
  slice: (x, axis, start, end) => nn.slice(x, { axis, start, end }),
  weight, const: (v, shape = []) => tensor.const({ value: v, shape }),
};
nn.methods({
  add: (a, b) => N.add(a, b), sub: (a, b) => N.sub(a, b), mul: (a, b) => N.mul(a, b), div: (a, b) => N.div(a, b), pow: (a, b) => N.pow(a, b),
  exp: (a) => N.exp(a), log: (a) => N.log(a), tanh: (a) => N.tanh(a), relu: (a) => N.relu(a), sigmoid: (a) => N.sigmoid(a), sqrt: (a) => N.sqrt(a), neg: (a) => N.neg(a), square: (a) => N.square(a),
  sum: (a, ax, kd) => N.sum(a, ax, kd), mean: (a, ax, kd) => N.mean(a, ax, kd), amax: (a, ax, kd) => N.amax(a, ax, kd),
  matmul: (a, b) => N.matmul(a, b), linear: (a, w, b) => N.linear(a, w, b), softmax: (a, d) => N.softmax(a, d), t: (a) => N.transpose(a), reshape: (a, s) => N.reshape(a, s),
  gelu: (a, approximate = "tanh") => N.gelu(a, approximate), silu: (a) => N.silu(a),
});
tensor.methods({ add: (a, b) => T.add(a, b), sub: (a, b) => T.sub(a, b), mul: (a, b) => T.mul(a, b), div: (a, b) => T.div(a, b), exp: (a) => T.exp(a), sum: (a, ax) => T.sum(a, ax), max: (a, ax) => T.max(a, ax) });

// ----------------------------------------------------------------------------- d: decomposition
// k-style "decompose" rules: a rule per frontend op whose lambda builds Tensor IR. Every node it
// builds is stamped with origin = the op it came from (provenance for kernel names).
export function decompose(opName, build, name = "decompose:" + opName) {
  return k.rule(name).match(P.op(opName).as("n")).rewrite((ctx) => {
    const n = ctx.n;
    const before = new Set(ctx.graph.nodes.keys());
    const args = n.def.variadic ? { [n.def.variadic]: n.args } : Object.fromEntries(n.def.argNames.map((a, i) => [a, n.args[i]]));
    const out = build({ ...n.attrs, ...args, out: n, node: n, T, skip: ctx.skip });
    // provenance: tag what this rewrite created
    const g = ctx.graph;
    const origin = n.attrs.origin || opName.replace(/^nn\./, "");
    for (const [id, node] of [...g.nodes]) if (!before.has(id) && !node.attrs.origin && node.def !== tensor.const.def) g.nodes.set(id, new Node(id, node.def, node.args, { ...node.attrs, origin }, node.type, node.knobs));
    g.touch();
    return out;
  });
}
const lastAxis = (x, a) => (a < 0 ? x.type.shape.length + a : a);
export const decompositions = [
  decompose("nn.adaptive_avg_pool2d", ({x,output_size}) => lowerAdaptiveAvgPool2d(T,x,output_size)),
  decompose("nn.avg_pool2d", ({x,...options}) => lowerAvgPool2d(T,x,options)),
  decompose("nn.max_pool2d", ({x,...options}) => lowerMaxPool2d(T,x,options)),
  decompose("nn.pad", ({x,pad,mode,value}) => lowerPad(T,x,pad,mode,value,tensor)),
  decompose("nn.roll", ({x,shifts,dims}) => lowerRoll(T,x,shifts,dims)),
  decompose("nn.concat", ({xs,axis,out}) => lowerConcat(T,tensor,xs,axis,out.type.dtype)),
  decompose("nn.bilinear", ({x,size}) => lowerBilinear(T,x,size)),
  decompose("nn.conv2d", ({x,w,b,stride,padding,dilation,groups}) => lowerConv2d(T,x,w,b,{stride,padding,dilation,groups})),
  decompose("nn.cast", ({ x, dtype }) => tensor.ew([x], { fn: dtype === "f32" ? "copy" : "round_" + dtype, dtype })),
  decompose("nn.ew", ({ xs, fn }) => T.ew(fn, ...xs)),
  decompose("nn.linear", ({x,w}) => lowerLinear(T,x,w)),
  decompose("nn.matmul", ({a,b}) => lowerMatmul(T,a,b)),
  decompose("nn.rms_norm", ({ x, w, eps }) => {
    const D = x.type.shape.at(-1);
    const ms = T.div(T.sum(T.mul(x, x), -1), D);
    return T.mul(T.mul(x, T.rsqrt(T.add(ms, eps))), w);
  }),
  decompose("nn.layer_norm", ({ x, w, b, eps }) => {
    const D = x.type.shape.at(-1);
    const xc = T.sub(x, T.div(T.sum(x, -1), D));
    const inv = T.rsqrt(T.add(T.div(T.sum(T.mul(xc, xc), -1), D), eps));
    return T.add(T.mul(T.mul(xc, inv), w), b);
  }),
  decompose("nn.softmax", ({ x, dim }) => {
    const a = lastAxis(x, dim);
    const e = T.exp(T.sub(x, T.max(x, a)));
    return T.div(e, T.sum(e, a));
  }),
  decompose("nn.gelu", ({ x, approximate }) => approximate === "none" ? T.ew("gelu_erf", x) : T.mul(T.mul(x, 0.5), T.add(1, T.tanh(T.mul(0.7978845608, T.add(x, T.mul(0.044715, T.mul(x, T.mul(x, x))))))))),
  decompose("nn.silu", ({ x }) => T.mul(x, T.sigmoid(x))),
  decompose("nn.reduce", ({ x, fn, axis, keepdim }) => { const r = T.reduce(x, fn, lastAxis(x, axis)); return keepdim ? r : T.squeeze(r, lastAxis(x, axis)); }),
  decompose("nn.transpose", ({ x, d0, d1, out }) => { const n = x.type.shape.length; const i = lastAxis(x, d0), j = lastAxis(x, d1); return T.view(x, out.type.shape, (c) => { const b = c.slice(); [b[i], b[j]] = [b[j], b[i]]; return b; }); }),
  decompose("nn.reshape", ({ x, shape }) => T.reshape(x, shape)),
  decompose("nn.slice", ({ x, axis, start, out }) => { const a = lastAxis(x, axis); return T.view(x, out.type.shape, (c) => c.map((v, i) => (i === a ? v.add(start) : v))); }),
];
export const decomposition = k.pass("frontend/decomposition").short("d").rules(...decompositions).helpers("tensor", T)
  .describe("each nn op becomes elementwise, reduction and index-map primitives");

// ----------------------------------------------------------------------------- o: optimization
const isSplat = (v) => v.is("tensor.const") && !v.attrs.data;
export const composeViews = k.rule("compose_views")
  .match(P.chain(P.op("tensor.view").as("p"), P.op("tensor.view").as("c")))
  .rewrite(({ p, c }) => tensor.view(p.arg("x"), { shape: c.attrs.shape, map: IX.compose(p.attrs.map, c.attrs.map), origin: c.attrs.origin }));
export const foldSplatView = k.rule("fold_splat_view")
  .match(P.op("tensor.view").as("v").where(({ v }) => isSplat(v.arg("x"))))
  .rewrite(({ v }) => tensor.const({ value: v.arg("x").attrs.value, shape: v.attrs.shape }));
export const dropIdentityView = k.rule("drop_identity_view")
  .match(P.op("tensor.view").as("v").where(({ v }) => v.attrs.map.isIdentity(v.arg("x").type.shape.length) && v.arg("x").type.shape.join() === v.attrs.shape.join()))
  .rewrite(({ v }) => v.arg("x"));
export const foldSplatEw = k.rule("fold_splat_ew")
  .match(P.op("tensor.ew").as("e").where(({ e }) => e.args.every(isSplat)))
  .rewrite(({ e }) => tensor.const({ value: F(e.attrs.fn).js(...e.args.map((a) => a.attrs.value)), shape: e.type.shape }));
// a·b + c → fma(a, b, c): one instruction, one rounding (what nvcc does by default with -fmad=true)
export const contractFma = k.rule("contract_fma")
  .match(P.op("tensor.ew").as("e").where(({ e }) => e.attrs.fn === "add" && e.args.length === 2 && e.args.some((a) => a.is(tensor.ew) && a.attrs.fn === "mul" && a.args.length === 2 && a.users.length === 1)))
  .rewrite(({ e }) => {
    const j = e.args.findIndex((a) => a.is(tensor.ew) && a.attrs.fn === "mul" && a.args.length === 2 && a.users.length === 1);
    const m = e.arg(j), c = e.arg(1 - j);
    return tensor.ew([m.arg(0), m.arg(1), c], { fn: "fma", ...(e.attrs.origin ? { origin: e.attrs.origin } : {}) });
  });
const separateFn = { add: "add_rn", sub: "sub_rn", subtract: "sub_rn", mul: "mul_rn", multiply: "mul_rn" };
export const separateRounding = k.rule("separate_rounding")
  .match(P.op("tensor.ew").as("e").where(({ e }) => Object.hasOwn(separateFn, e.attrs.fn)))
  .rewrite(({ e }) => tensor.ew(e.args, { ...e.attrs, fn: separateFn[e.attrs.fn] }))
  .describe("retain separate FP32 add/subtract/multiply boundaries through CUDA compilation");
export const separateRoundingPass = k.pass("frontend/separate-rounding").rules(separateRounding);
export const optimization = k.pass("frontend/optimization").short("o").rules(composeViews, foldSplatView, dropIdentityView, foldSplatEw, contractFma)
  .describe("compose index-map chains, fold constant views and constant arithmetic, contract multiply-add into fma");

export { asT, ewRef, reduceRef };
