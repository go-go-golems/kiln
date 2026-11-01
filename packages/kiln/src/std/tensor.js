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
import { fn as F, reducer, FNS, INTEGER_DTYPES, resultType, typedReducer } from "./fns.js";

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
function ewRef(name, xs, dtype = resultType(name)) {
  xs = xs.map(asT);
  const f = F(name).js;
  const shape = bshape(...xs.map((x) => x.shape));
  const out = new Tensor(shape, null, dtype);
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
  const out = new Tensor(oshape, null, R.type ?? "f32");
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
// a dtype conversion with C++'s semantics (truncation toward zero; nonzero is true); floats narrow by rounding
function castRef(x, dtype) {
  x = asT(x);
  const from = x.dtype, convert = FNS["to_" + (INTEGER_DTYPES.has(dtype) ? dtype : "f32")].js;
  const out = new Tensor(x.shape, null, dtype);
  for (let i = 0; i < out.data.length; i++) out.data[i] = INTEGER_DTYPES.has(from) || INTEGER_DTYPES.has(dtype) ? convert(x.data[i]) : x.data[i];
  return roundedReference(out, { dtype });
}
function cumsumRef(x, axis, dtype) {
  x = castRef(x, dtype);
  const st = strides(x.shape), n = x.shape[axis], out = new Tensor(x.shape, null, dtype);
  const add = reducer(typedReducer("add", dtype)).js;
  for (let e = 0; e < out.data.length; e++) {
    const i = Math.floor(e / st[axis]) % n;
    out.data[e] = i === 0 ? x.data[e] : add(out.data[e - st[axis]], x.data[e]);
  }
  return out;
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
  const out = new Tensor(shape, null, x.dtype);
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
function expandShape(from, requested) {
  if (!Array.isArray(requested) || requested.length < from.length || !requested.every(Number.isSafeInteger))
    throw new KilnError("ShapeError", "expand requires a static shape with at least the input rank");
  const off=requested.length-from.length;
  return requested.map((size,i)=>{
    const input=i<off?1:from[i-off];
    if(size===-1){if(i<off)throw new KilnError("ShapeError","expand cannot infer a leading dimension");return input;}
    if(size<=0 || (input!==1 && size!==input))throw new KilnError("ShapeError","invalid expand dimension");
    return size;
  });
}
function unfoldShape(from, axis, size, step) {
  if (!Number.isSafeInteger(axis) || !Number.isSafeInteger(size) || !Number.isSafeInteger(step) || size<=0 || step<=0 || axis < -from.length || axis >= from.length)
    throw new KilnError("ShapeError", "unfold requires a valid static axis, size and step");
  const a=(axis+from.length)%from.length;
  if(size>from[a])throw new KilnError("ShapeError","unfold window exceeds input dimension");
  const shape=from.slice();shape[a]=Math.floor((from[a]-size)/step)+1;shape.push(size);
  return {shape,axis:a};
}

// ----------------------------------------------------------------------------- dialects
function weakScalar(value) {
  if (value.is?.("tensor.const")) return value.type.shape.length === 0 && !value.attrs.data;
  if (value.is?.("tensor.view")) return weakScalar(value.arg("x"));
  return false;
}
// PyTorch type promotion. Categories order bool < integer < floating. Dimensioned tensors dominate
// 0-dim tensors, which dominate Python scalars (splat constants): a lower-priority group changes the
// result only when its category is higher, and then a scalar contributes its category's default dtype.
const CATEGORY = { bool: 0, u8: 1, i32: 1, i64: 1, f16: 2, bf16: 2, f32: 2 };
const CATEGORY_DEFAULT = ["bool", "i64", "f32"];
function joinDtypes(ds) {
  const cat = Math.max(...ds.map((d) => CATEGORY[d]));
  const top = [...new Set(ds.filter((d) => CATEGORY[d] === cat))];
  if (top.length === 1) return top[0];
  return cat === 2 ? "f32" : top.includes("i64") ? "i64" : "i32";
}
const dtypeOf = (x) => x.type.dtype || "f32";
export function promoteDtypes(xs, casts = []) {
  const ops = xs.map((x, i) => ({ dtype: casts[i] ?? dtypeOf(x), weak: weakScalar(x), rank: x.type.shape.length }));
  const groups = [ops.filter((o) => !o.weak && o.rank > 0), ops.filter((o) => !o.weak && o.rank === 0), ops.filter((o) => o.weak)].filter((g) => g.length);
  let result = joinDtypes(groups[0].map((o) => o.dtype));
  for (const g of groups.slice(1)) {
    const d = joinDtypes(g.map((o) => o.dtype));
    if (CATEGORY[d] > CATEGORY[result]) result = g[0].weak ? CATEGORY_DEFAULT[CATEGORY[d]] : d;
  }
  return result;
}
// the result dtype of an elementwise function over (already converted) operands
function elementwiseDtype(fn, xs, casts = []) {
  if (FNS[fn]?.type) return FNS[fn].type;
  return fn === "select" ? promoteDtypes(xs.slice(1), casts.slice(1)) : promoteDtypes(xs, casts);
}
export const COMPARISONS = new Set(["eq", "ne", "lt", "le", "gt", "ge"]);
const needsCast = (from, to) => from !== to && (INTEGER_DTYPES.has(from) || INTEGER_DTYPES.has(to));
// a frontend elementwise op resolved to one typed function and the conversions its operands need
export function resolveEw(fn, xs) {
  if (fn === "select") {
    const t = promoteDtypes(xs.slice(1));
    return { fn, casts: xs.map((x, i) => (i > 0 && needsCast(dtypeOf(x), t) ? t : null)) };
  }
  const t = promoteDtypes(xs);
  const compute = COMPARISONS.has(fn) ? (INTEGER_DTYPES.has(t) ? t : "f32") : t;
  let typed = fn;
  if (COMPARISONS.has(fn)) typed = `${fn}_${compute}`;
  else if (INTEGER_DTYPES.has(compute)) {
    typed = `${fn}_${compute}`;
    if (compute === "bool" || !FNS[typed]) throw new KilnError("TypeError", `${fn} over ${compute} values is not lowered`);
  }
  return { fn: typed, casts: xs.map((x) => (needsCast(dtypeOf(x), compute) ? compute : null)) };
}
// the dtype of a reduction's result and the typed reducer computing it: integer sums widen to int64
function reduction(fn, dtype) {
  if (!INTEGER_DTYPES.has(dtype)) return { fn, dtype: "f32", cast: null };
  if (fn === "add") return { fn: "add_i64", dtype: "i64", cast: dtype === "i64" ? null : "i64" };
  if (dtype === "bool" || !["max", "min"].includes(fn)) throw new KilnError("TypeError", `${fn} reduction over ${dtype} values is not lowered`);
  return { fn: typedReducer(fn, dtype), dtype, cast: null };
}
function roundedReference(value, type) {
  if (["f16", "bf16"].includes(type?.dtype)) {
    for (let i = 0; i < value.data.length; i++) value.data[i] = roundToDtype(value.data[i], type.dtype);
  }
  return value;
}
const T_ = (shape, dtype = "f32") => k.tensor(shape, dtype);

// gathers (P3a slice 2): out[pre, j, post] = x[pre, ids[j], post] along one axis of x, where j ranges
// over ids' coordinates. The index map reads ids through the data-dependent term LD(1, j) (argument 1).
// `wrap` normalizes negative indices as Python indexing does; embedding/index_select do not.
export function gatherSpec(xShape, idsShape, axis) {
  const a = axis < 0 ? xShape.length + axis : axis;
  if (!(a >= 0 && a < xShape.length)) throw new KilnError("ShapeError", `gather axis ${axis} out of range for (${xShape})`);
  return { a, shape: [...xShape.slice(0, a), ...idsShape, ...xShape.slice(a + 1)] };
}
export function gatherMap(xShape, idsShape, axis, wrap = false) {
  const { a, shape } = gatherSpec(xShape, idsShape, axis);
  return IX.map(shape.length, (c) => {
    let id = IX.LD(1, c.slice(a, a + idsShape.length));
    if (wrap) id = id.add(id.lt(0).mul(xShape[a]));   // exact in C and JS, unlike a truncating %
    return [...c.slice(0, a), id, ...c.slice(a + idsShape.length)];
  });
}
const gatherIndices = (ids) => { if (ids.type.dtype !== "i64") throw new KilnError("TypeError", `gather indices must be int64, got ${ids.type.dtype || "f32"}`); };
// reference: out-of-range indices are an error, as PyTorch's device-side assert is
export function gatherRef(x, ids, shape, map) {
  x = asT(x); ids = asT(ids);
  const xs = strides(x.shape), is = strides(ids.shape), os = strides(shape), n = numel(shape);
  const out = new Tensor(shape, new x.data.constructor(n));
  const env = { __ld: (_, idx) => Number(ids.data[idx.reduce((acc, v, j) => acc + v * is[j], 0)]) };
  for (let o = 0; o < n; o++) {
    shape.forEach((_, j) => { env["a" + j] = Math.floor(o / os[j]) % shape[j]; });
    const at = map.exprs.map((e) => IX.evalIx(e, env));
    if (at.some((v, j) => v < 0 || v >= x.shape[j])) throw new KilnError("EvalError", `gather index (${at}) out of range for (${x.shape})`);
    out.data[o] = x.data[at.reduce((acc, v, j) => acc + v * xs[j], 0)];
  }
  return out;
}
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
  .op("expand", {args:["x"],attrs:{shape:[]},traits:["pure"],
    infer:({x,shape})=>k.tensor(expandShape(x.type.shape,shape),x.type.dtype),
    eval:({x,type})=>viewRef(x,type.shape,broadcastMap(x.shape,type.shape)),print:"expand({x})"})
  .op("unfold", {args:["x"],attrs:{axis:0,size:1,step:1},traits:["pure"],
    infer:({x,axis,size,step})=>k.tensor(unfoldShape(x.type.shape,axis,size,step).shape,x.type.dtype),
    eval:({x,axis,size,step,type})=>{const a=unfoldShape(x.shape,axis,size,step).axis;return viewRef(x,type.shape,IX.map(type.shape.length,c=>c.slice(0,-1).map((v,i)=>i===a?v.mul(step).add(c.at(-1)):v)));},print:"unfold({x})"})
  .op("conv2d", { args: ["x", "w", "b"], attrs: { stride: 1, padding: 0, dilation: 1, groups: 1 }, infer: ({ x,w,b,stride,padding,dilation,groups }) => {
    if ([x,w,b].some(v=>v.type.dtype!=="f32")) throw new KilnError("TypeError", "conv2d lowering currently requires FP32");
    const shape=conv2dSpec(x.type.shape,w.type.shape,{stride,padding,dilation,groups}).shape;
    if(b.type.shape.length!==1||b.type.shape[0]!==shape[1])throw new KilnError("ShapeError","conv2d bias shape mismatch");
    return k.tensor(shape);
  }, eval: ({ x,w,b,stride,padding,dilation,groups }) => conv2dReference(x,w,b,{stride,padding,dilation,groups}), print: "conv2d({x}, {w}, {b})" })
  .op("expect", { args: ["x"], attrs: { shape: [], dtype: "f32" }, traits: ["pure"], infer: ({ x, shape, dtype }) => {
    // The source framework's recorded type for this value (e.g. FX tensor_meta). Kiln's own type
    // rules must agree; a self-consistency check cannot detect a frontend rule that differs.
    if (x.type.shape.join() !== shape.join() || (x.type.dtype || "f32") !== dtype)
      throw new KilnError("TypeError", `expected (${shape.join(", ")}) ${dtype} from the source graph, Kiln inferred (${x.type.shape.join(", ")}) ${x.type.dtype || "f32"}`);
    return x.type;
  }, eval: ({ x }) => x, print: "expect({x}, {dtype})" })
  .op("cast", { args: ["x"], attrs: { dtype: "f32" }, traits: ["pure"], infer: ({ x, dtype }) => {
    if (!Object.hasOwn(CATEGORY, dtype) || dtype === "u8") throw new KilnError("TypeError", `unsupported cast: ${dtype}`);
    return k.tensor(x.type.shape, dtype);
  }, eval: ({ x, dtype }) => castRef(x, dtype), print: "cast({x}, {dtype})" })
  // fn is resolved (resolveEw): a typed function, and per operand the dtype it converts to first (null: none)
  .op("ew", { args: { variadic: "xs" }, attrs: { fn: "add", casts: null }, traits: ["pure"], infer: ({ xs, fn, casts }) => (F(fn), T_(bshape(...xs.map((x) => x.type.shape)), elementwiseDtype(fn, xs, casts || []))),
    eval: ({ xs, fn, casts, type }) => roundedReference(ewRef(fn, xs.map((x, i) => (casts?.[i] ? castRef(x, casts[i]) : x)), type.dtype), type), print: "{fn}({xs})" })
  .op("linear", { args: ["x", "w"], infer: ({x,w}) => {
    if(x.type.dtype!=="f32"||w.type.dtype!=="f32")throw new KilnError("TypeError","linear arithmetic requires FP32; widen operands and narrow the source operation result explicitly");
    return T_(linearSpec(x.type.shape,w.type.shape).shape);
  }, eval: ({x,w}) => linearReference(x,w), print:"linear({x}, {w})" })
  // precision "highest" pins FP32 operands under matmulPrecision tf32 (a product the reference computes
  // in FP32 regardless, e.g. PyTorch's memory-efficient f32 attention, probe 675)
  .op("matmul", { args: ["a", "b"], attrs: { precision: null }, infer: ({a,b}) => {
    if(a.type.dtype!=="f32"||b.type.dtype!=="f32")throw new KilnError("TypeError","matmul arithmetic requires FP32; widen operands and narrow the source operation result explicitly");
    return T_(matmulSpec(a.type.shape,b.type.shape).shape);
  }, eval: ({a,b}) => matmulReference(a,b), print:"matmul({a}, {b})" })
  .op("rms_norm", { args: ["x", "w"], attrs: { eps: 1e-6 }, infer: sameAs, eval: ({ x, w, eps }) => rmsRef(x, w, eps), print: "rms_norm({x}, {w}, eps={eps})" })
  .op("layer_norm", { args: ["x", "w", "b"], attrs: { eps: 1e-5 }, infer: sameAs, eval: ({ x, w, b, eps }) => lnRef(x, w, b, eps), print: "layer_norm({x}, {w}, {b}, eps={eps})" })
  .op("softmax", { args: ["x"], attrs: { dim: -1 }, infer: sameAs, eval: ({ x, dim }) => softmaxRef(x, dim), print: "softmax({x}, dim={dim})" })
  .op("gelu", { args: ["x"], attrs: { approximate: "tanh" }, infer: ({ x, approximate }) => { if (!["none", "tanh"].includes(approximate)) throw new KilnError("TypeError", "gelu approximate must be none or tanh"); return x.type; }, eval: ({ x, approximate, type }) => approximate === "none" ? roundedReference(ewRef("gelu_erf", [x]), type) : ewRef("mul", [ewRef("mul", [x, 0.5]), ewRef("add", [1, ewRef("tanh", [ewRef("mul", [0.7978845608, ewRef("add", [x, ewRef("mul", [0.044715, ewRef("mul", [x, ewRef("mul", [x, x])])])])])])])]), print: "gelu({x})" })
  .op("silu", { args: ["x"], infer: sameAs, eval: ({ x }) => ewRef("mul", [x, ewRef("sigmoid", [x])]), print: "silu({x})" })
  .op("reduce", { args: ["x"], attrs: { fn: "add", axis: -1, keepdim: true }, infer: ({ x, fn, axis, keepdim }) => { const s = x.type.shape; const a = axis < 0 ? s.length + axis : axis; return T_(keepdim ? s.map((d, i) => (i === a ? 1 : d)) : s.filter((_, i) => i !== a), reduction(fn, dtypeOf(x)).dtype); },
    eval: ({ x, fn, axis, keepdim }) => { const r = reduction(fn, asT(x).dtype); return reduceRef(r.fn, r.cast ? castRef(x, r.cast) : x, axis, keepdim); }, print: "{fn}({x}, axis={axis})" })
  // inclusive prefix sum along an axis; integer sums widen to int64 as PyTorch's do
  .op("cumsum", { args: ["x"], attrs: { axis: -1 }, traits: ["pure"], infer: ({ x }) => {
    const d = dtypeOf(x);
    if (!INTEGER_DTYPES.has(d) && d !== "f32") throw new KilnError("TypeError", `cumsum over ${d} values is not lowered`);
    return T_(x.type.shape, INTEGER_DTYPES.has(d) ? "i64" : "f32");
  }, eval: ({ x, axis, type }) => cumsumRef(x, axis < 0 ? asT(x).shape.length + axis : axis, type.dtype), print: "cumsum({x}, axis={axis})" })
  .op("transpose", { args: ["x"], attrs: { d0: -2, d1: -1 }, infer: ({ x, d0, d1 }) => { const s = x.type.shape.slice(); const n = s.length; const i = d0 < 0 ? n + d0 : d0, j = d1 < 0 ? n + d1 : d1; [s[i], s[j]] = [s[j], s[i]]; return T_(s, x.type.dtype); }, eval: ({ x, d0, d1, type }) => { const n = asT(x).shape.length; const i = d0 < 0 ? n + d0 : d0, j = d1 < 0 ? n + d1 : d1; return viewRef(x, type.shape, IX.map(n, (a) => { const b = a.slice(); [b[i], b[j]] = [b[j], b[i]]; return b; })); }, print: "transpose({x}, {d0}, {d1})" })
  .op("reshape", { args: ["x"], attrs: { shape: [] }, infer: ({ x, shape }) => { if (numel(shape) !== numel(x.type.shape)) throw new KilnError("ShapeError", `reshape (${x.type.shape}) → (${shape}): sizes differ`); return T_(shape, x.type.dtype); }, eval: ({ x, shape }) => new Tensor(shape, asT(x).data.slice()), print: "reshape({x}, {shape})" })
  .op("gather", { args: ["x", "ids"], attrs: { axis: 0, wrap: false }, infer: ({ x, ids, axis }) => { gatherIndices(ids); return T_(gatherSpec(x.type.shape, ids.type.shape, axis).shape, x.type.dtype); },
    eval: ({ x, ids, axis, wrap, type }) => gatherRef(x, ids, type.shape, gatherMap(asT(x).shape, asT(ids).shape, axis, wrap)), print: "gather({x}, {ids}, axis={axis})" })
  .op("slice", { args: ["x"], attrs: { axis: 0, start: 0, end: 1 }, infer: ({ x, axis, start, end }) => { const s = x.type.shape.slice(); const a = axis < 0 ? s.length + axis : axis; s[a] = end - start; return T_(s, x.type.dtype); }, eval: ({ x, axis, start, type }) => { const n = asT(x).shape.length; const a = axis < 0 ? n + axis : axis; return viewRef(x, type.shape, IX.map(n, (c) => c.map((v, i) => (i === a ? v.add(start) : v)))); }, print: "{x}[{axis}: {start}..{end}]" });

export const tensor = k.dialect("tensor").describe("Tensor IR: elementwise, reduction and index-map primitives")
  .op("const", { attrs: { value: 0, shape: [], data: null, dtype: "f32" }, traits: ["pure", "any-ir"], infer: ({ shape, data, dtype }) => T_(data ? data.shape : shape, data?.dtype || dtype),
    eval: ({ value, shape, data, dtype }) => (data ? data : Tensor.fill(shape, value, dtype)),
    print: ({ value, shape, data, name }) => (data ? `${name ? name + " " : ""}data(${data.shape.join("×")})` : shape.length ? `splat ${+(+value).toPrecision(6)} (${shape.join("×")})` : String(+(+value).toPrecision(6))) })
  .op("ew", { args: { variadic: "xs" }, attrs: { fn: "add", dtype: null }, traits: ["pure"], infer: ({ xs, fn, dtype }) => T_(xs[0].type.shape, dtype || elementwiseDtype(fn, xs)), eval: ({ xs, fn, type }) => roundedReference(ewRef(fn, xs, type.dtype), type),
    validate: ({ args }) => args.every((a) => a.type.shape.join() === args[0].type.shape.join()) || "elementwise inputs must share a shape (insert views)", print: "{fn}({xs})" })
  .op("reduce", { args: ["x"], attrs: { fn: "add", axis: -1 }, traits: ["pure"], infer: ({ x, fn, axis }) => { const s = x.type.shape; const a = axis < 0 ? s.length + axis : axis; return T_(s.map((d, i) => (i === a ? 1 : d)), reducer(fn).type ?? "f32"); }, eval: ({ x, fn, axis }) => reduceRef(fn, x, axis), print: "{fn}({x}, axis={axis})" })
  .op("gather", { args: ["x", "ids"], attrs: { shape: [], map: null }, traits: ["pure"], infer: ({ x, ids, shape }) => { gatherIndices(ids); return T_(shape, x.type.dtype); },
    eval: ({ x, ids, shape, map }) => gatherRef(x, ids, shape, map), print: ({ x, map }) => `${x}[${map.exprs.map((e) => IX.print(e)).join(", ")}]` })
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
  expand:(x,shape)=>nn.expand(x,{shape}),
  unfold:(x,axis,size,step)=>nn.unfold(x,{axis,size,step}),
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
  // a cast to the value's own dtype is the value (PyTorch .long() on int64, .float() on f32)
  cast: (x, dtype) => ((x.type?.dtype || "f32") === dtype ? x : nn.cast(x, { dtype })),
  // a Python int or bool scalar: integer category in type promotion, unlike a bare JS number (float)
  int: (v) => tensor.const({ value: v, shape: [], dtype: "i64" }),
  bool: (v) => tensor.const({ value: v ? 1 : 0, shape: [], dtype: "bool" }),
  expect: (x, shape, dtype) => nn.expect(x, { shape, dtype }),
  gather: (x, ids, axis = 0, wrap = false) => nn.gather(x, ids, { axis, wrap }),
  embedding: (ids, weight) => N.gather(weight, ids, 0),
  indexSelect: (x, axis, ids) => N.gather(x, ids, axis),
  ew: (f, ...xs) => { xs = xs.map(nv); return nn.ew(xs, resolveEw(f, xs)); },
  add: (a, b) => N.ew("add", a, b), sub: (a, b) => N.ew("sub", a, b), mul: (a, b) => N.ew("mul", a, b), div: (a, b) => N.ew("div", a, b),
  max: (a, b) => N.ew("max", a, b), min: (a, b) => N.ew("min", a, b), pow: (a, b) => N.ew("pow", a, b),
  exp: (x) => N.ew("exp", x), log: (x) => N.ew("log", x), sqrt: (x) => N.ew("sqrt", x), rsqrt: (x) => N.ew("rsqrt", x), tanh: (x) => N.ew("tanh", x),
  sigmoid: (x) => N.ew("sigmoid", x), relu: (x) => N.ew("relu", x), abs: (x) => N.ew("abs", x), floor: (x) => N.ew("floor", x), neg: (x) => N.ew("neg", x), square: (x) => N.ew("square", x),
  sin: (x) => N.ew("sin", x), cos: (x) => N.ew("cos", x), select: (c, a, b) => N.ew("select", c, a, b), gt: (a, b) => N.ew("gt", a, b), lt: (a, b) => N.ew("lt", a, b),
  ge: (a, b) => N.ew("ge", a, b), le: (a, b) => N.ew("le", a, b), eq: (a, b) => N.ew("eq", a, b), ne: (a, b) => N.ew("ne", a, b),
  // x where mask is false, value where it is true; the result keeps x's dtype (value converts to it)
  maskedFill: (x, mask, value) => {
    if (mask.type.dtype !== "bool") throw new KilnError("TypeError", `masked_fill requires a bool mask, got ${mask.type.dtype || "f32"}`);
    const v = nv(value), d = dtypeOf(x);
    return nn.ew([mask, v, x], { fn: "select", casts: [null, dtypeOf(v) === d ? null : d, null] });
  },
  cumsum: (x, axis = -1) => nn.cumsum(x, { axis }),
  amin: (x, axis = -1, keepdim = true) => nn.reduce(x, { fn: "min", axis, keepdim }),
  sum: (x, axis = -1, keepdim = true) => nn.reduce(x, { fn: "add", axis, keepdim }),
  amax: (x, axis = -1, keepdim = true) => nn.reduce(x, { fn: "max", axis, keepdim }),
  mean: (x, axis = -1, keepdim = true) => N.mul(N.sum(x, axis, keepdim), 1 / x.type.shape.at(axis < 0 ? axis : axis)),
  linear: (x, w, b) => (b ? N.add(nn.linear(x, w), b) : nn.linear(x, w)),
  matmul: (a, b, precision = null) => nn.matmul(a, b, { precision }),
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
// x converted to dtype in Tensor IR. Floats among themselves narrow by rounding (f32 widening is exact);
// a scalar constant converts at compile time.
function convert(x, dtype) {
  const from = dtypeOf(x);
  if (!dtype || from === dtype) return x;
  if (x.is("tensor.const") && !x.attrs.data) return tensor.const({ value: dtype === "bool" ? +(x.attrs.value != 0) : INTEGER_DTYPES.has(dtype) ? Math.trunc(x.attrs.value) : x.attrs.value, shape: x.attrs.shape, dtype });
  if (INTEGER_DTYPES.has(dtype)) return tensor.ew([x], { fn: "to_" + dtype, dtype });
  const wide = INTEGER_DTYPES.has(from) ? tensor.ew([x], { fn: "to_f32", dtype: "f32" }) : x;
  return dtype === "f32" ? (wide === x ? tensor.ew([x], { fn: "copy", dtype }) : wide) : tensor.ew([wide], { fn: "round_" + dtype, dtype });
}
export const decompositions = [
  decompose("nn.adaptive_avg_pool2d", ({x,output_size}) => lowerAdaptiveAvgPool2d(T,x,output_size)),
  decompose("nn.avg_pool2d", ({x,...options}) => lowerAvgPool2d(T,x,options)),
  decompose("nn.max_pool2d", ({x,...options}) => lowerMaxPool2d(T,x,options)),
  decompose("nn.pad", ({x,pad,mode,value}) => lowerPad(T,x,pad,mode,value,tensor)),
  decompose("nn.roll", ({x,shifts,dims}) => lowerRoll(T,x,shifts,dims)),
  decompose("nn.expand", ({x,shape}) => T.bc(x,expandShape(x.type.shape,shape))),
  decompose("nn.unfold", ({x,axis,size,step}) => {const spec=unfoldShape(x.type.shape,axis,size,step);return T.view(x,spec.shape,c=>c.slice(0,-1).map((v,i)=>i===spec.axis?v.mul(step).add(c.at(-1)):v));}),
  decompose("nn.concat", ({xs,axis,out}) => lowerConcat(T,tensor,xs,axis,out.type.dtype)),
  decompose("nn.bilinear", ({x,size}) => lowerBilinear(T,x,size)),
  decompose("nn.conv2d", ({x,w,b,stride,padding,dilation,groups}) => lowerConv2d(T,x,w,b,{stride,padding,dilation,groups})),
  decompose("nn.expect", ({ x }) => x),
  decompose("nn.gather", ({ x, ids, axis, wrap }) => tensor.gather(x, ids, { shape: gatherSpec(x.type.shape, ids.type.shape, axis).shape, map: gatherMap(x.type.shape, ids.type.shape, axis, wrap) })),
  decompose("nn.cast", ({ x, dtype }) => convert(x, dtype)),
  // Broadcasting turns a 0-dim operand into a dimensioned view, so tensor.ew would re-infer its
  // dtype without the nn-level 0-dim rule. Keep the frontend's dtype when the two disagree.
  decompose("nn.ew", ({ xs, fn, casts, out }) => {
    const e = T.ew(fn, ...xs.map((x, i) => convert(x, casts?.[i])));
    return e.type.dtype === out.type.dtype ? e : tensor.ew(e.args, { ...e.attrs, dtype: out.type.dtype });
  }),
  // out[..i..] = sum_j [j <= i] x[..j..]: a reduction over a new last axis, masked through a view of
  // the table [1, 0] indexed by (i - j < 0), which needs no data proportional to the axis
  decompose("nn.cumsum", ({ x, axis, out }) => {
    const a = lastAxis(x, axis), s = x.type.shape, n = s[a], d = out.type.dtype;
    const xs = convert(x, d), wide = [...s, n];
    const spread = T.view(xs, wide, (c) => c.slice(0, -1).map((v, i) => (i === a ? c.at(-1) : v)));
    const mask = T.view(tensor.const({ data: new Tensor([2], Float32Array.of(1, 0)), shape: [2] }), wide, (c) => [c[a].sub(c.at(-1)).lt(0)]);
    const masked = tensor.ew([mask, spread, T.bc(tensor.const({ value: 0, shape: [], dtype: d }), wide)], { fn: "select", dtype: d });
    return T.squeeze(T.reduce(masked, typedReducer("add", d), -1), -1);
  }),
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
  decompose("nn.reduce", ({ x, fn, axis, keepdim }) => { const t = reduction(fn, dtypeOf(x)); const r = T.reduce(convert(x, t.cast), t.fn, lastAxis(x, axis)); return keepdim ? r : T.squeeze(r, lastAxis(x, axis)); }),
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
// a·b + c → fma(a, b, c): one instruction, one rounding (what nvcc does by default with -fmad=true).
// FP32 only: an f16/bf16 multiply rounds its result to storage precision, and contracting it would
// drop that source-visible rounding (eager PyTorch rounds after each low-precision operation).
const fp32 = (v) => (v.type.dtype || "f32") === "f32";
const contractibleMul = (a) => a.is(tensor.ew) && a.attrs.fn === "mul" && a.args.length === 2 && a.users.length === 1 && fp32(a);
export const contractFma = k.rule("contract_fma")
  .match(P.op("tensor.ew").as("e").where(({ e }) => e.attrs.fn === "add" && e.args.length === 2 && fp32(e) && e.args.some(contractibleMul)))
  .rewrite(({ e }) => {
    const j = e.args.findIndex(contractibleMul);
    const m = e.arg(j), c = e.arg(1 - j);
    return tensor.ew([m.arg(0), m.arg(1), c], { fn: "fma", ...(e.attrs.origin ? { origin: e.attrs.origin } : {}) });
  });
const separateFn = { add: "add_rn", sub: "sub_rn", subtract: "sub_rn", mul: "mul_rn", multiply: "mul_rn" };
export const separateRounding = k.rule("separate_rounding")
  .match(P.op("tensor.ew").as("e").where(({ e }) => Object.hasOwn(separateFn, e.attrs.fn)))
  .rewrite(({ e }) => tensor.ew(e.args, { ...e.attrs, fn: separateFn[e.attrs.fn] }))
  .describe("retain separate FP32 add/subtract/multiply boundaries through CUDA compilation");
export const separateRoundingPass = k.pass("frontend/separate-rounding").rules(separateRounding);
// matmulPrecision "tf32": the reference backend (PyTorch with allow_tf32, e.g. NGC containers'
// float32_matmul_precision "high") rounds FP32 matmul/linear and ungrouped convolution operands to
// TF32 and accumulates in FP32. Bias is added in FP32. Grouped convolutions keep FP32 operands.
const isTf32 = (v) => v.is(nn.ew) && v.attrs.fn === "round_tf32";
const tf32 = (v) => (isTf32(v) ? v : nn.ew([v], { fn: "round_tf32" }));
const fp32Operands = (...vs) => vs.every((v) => (v.type.dtype || "f32") === "f32") && !vs.every(isTf32);
export const tf32Linear = k.rule("tf32_linear").match(P.op("nn.linear").as("n").where(({ n }) => fp32Operands(n.arg("x"), n.arg("w"))))
  .rewrite(({ n }) => nn.linear(tf32(n.arg("x")), tf32(n.arg("w"))));
export const tf32Matmul = k.rule("tf32_matmul").match(P.op("nn.matmul").as("n").where(({ n }) => n.attrs.precision !== "highest" && fp32Operands(n.arg("a"), n.arg("b"))))
  .rewrite(({ n }) => nn.matmul(tf32(n.arg("a")), tf32(n.arg("b"))));
// cuDNN's TF32 1x1 convolutions round operands ties-to-even like cuBLAS (probe 671; task 119's shape,
// probe 675: max error 9e-6 against 1.5e-3 for FP32). 3x3 convolutions measure closer to ties-away and
// keep FP32 operands; the P0 replay's convolution regressions were under ties-away rounding.
const pointwise = (n) => n.attrs.groups === 1 && n.arg("w").type.shape.slice(2).every((d) => d === 1);
export const tf32Conv1x1 = k.rule("tf32_conv1x1").match(P.op("nn.conv2d").as("n").where(({ n }) => pointwise(n) && fp32Operands(n.arg("x"), n.arg("w"))))
  .rewrite(({ n }) => nn.conv2d(tf32(n.arg("x")), tf32(n.arg("w")), n.arg("b"), { stride: n.attrs.stride, padding: n.attrs.padding, dilation: n.attrs.dilation, groups: n.attrs.groups }));
export const tf32Pass = k.pass("frontend/tf32-contraction-inputs").rules(tf32Linear, tf32Matmul, tf32Conv1x1)
  .describe("round FP32 matrix-product operands to TF32 to match a cuBLAS TF32 reference");
// Convolutions keep FP32 operands: under the same rounding, the P0 replay matched cuDNN's TF32
// convolutions worse than FP32 did (1 graph fixed, 4 broken), while linear layers matched (8 fixed, 0 broken).
export const optimization = k.pass("frontend/optimization").short("o").rules(composeViews, foldSplatView, dropIdentityView, foldSplatEw, contractFma)
  .describe("compose index-map chains, fold constant views and constant arithmetic, contract multiply-add into fma");

export { asT, ewRef, reduceRef };
