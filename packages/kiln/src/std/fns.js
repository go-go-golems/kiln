// Scalar functions shared by every level: reference evaluation, the loop evaluator, and the
// CUDA / WGSL / JS emitters. One table, so a new function is one entry here.
import { roundToDtype } from "../core/dtypes.js";
import { erf } from "./special.js";
const f = Math.fround;
// TF32: FP32 storage with a 10-bit explicit mantissa. Under allow_tf32, cuBLAS products and 1x1
// convolutions on GB10 round FP32 operands to nearest, ties to even (probe 671: RNE max error 3.8e-4
// against RNA's 6.9e-3 for linear). cuDNN's 3x3 convolutions round ties away instead; Kiln applies
// TF32 to matrix products and 1x1 convolutions only (tensor.js tf32Pass).
const TF32_BITS = new Uint32Array(1), TF32_VALUE = new Float32Array(TF32_BITS.buffer);
export function roundTf32(x) {
  TF32_VALUE[0] = x;
  if ((TF32_BITS[0] & 0x7f800000) === 0x7f800000) return TF32_VALUE[0];  // inf, nan
  TF32_BITS[0] = ((TF32_BITS[0] + 0xfff + ((TF32_BITS[0] >>> 13) & 1)) & 0xffffe000) >>> 0;
  return TF32_VALUE[0];
}
export const FNS = {
  // CUDA round-to-nearest intrinsics retain operation boundaries under NVRTC
  // contraction. WGSL has no implementation of this declared guarantee here.
  add_rn: { n: 2, js: (a, b) => f(f(a) + f(b)), c: "__fadd_rn({0}, {1})", w: null, flops: 1 },
  sub_rn: { n: 2, js: (a, b) => f(f(a) - f(b)), c: "__fsub_rn({0}, {1})", w: null, flops: 1 },
  mul_rn: { n: 2, js: (a, b) => f(f(a) * f(b)), c: "__fmul_rn({0}, {1})", w: null, flops: 1 },
  round_f16: { n: 1, js: (x) => roundToDtype(x, "f16"), c: "__half2float(__float2half_rn({0}))", w: "unpack2x16float(pack2x16float(vec2<f32>({0}, 0.0))).x", flops: 1 },
  round_tf32: { n: 1, js: roundTf32, c: "kiln_round_tf32({0})", w: "kiln_round_tf32({0})", flops: 1 },
  round_bf16: { n: 1, js: (x) => roundToDtype(x, "bf16"), c: "__bfloat162float(__float2bfloat16_rn({0}))", w: "kiln_round_bf16({0})", flops: 1 },
  add: { n: 2, js: (a, b) => a + b, c: "({0} + {1})", w: "({0} + {1})", flops: 1 },
  sub: { n: 2, js: (a, b) => a - b, c: "({0} - {1})", w: "({0} - {1})", flops: 1 },
  subtract: { n: 2, js: (a, b) => a - b, c: "({0} - {1})", w: "({0} - {1})", flops: 1 },
  mul: { n: 2, js: (a, b) => a * b, c: "({0} * {1})", w: "({0} * {1})", flops: 1 },
  multiply: { n: 2, js: (a, b) => a * b, c: "({0} * {1})", w: "({0} * {1})", flops: 1 },
  div: { n: 2, js: (a, b) => a / b, c: "({0} / {1})", w: "({0} / {1})", flops: 4 },
  divide: { n: 2, js: (a, b) => a / b, c: "({0} / {1})", w: "({0} / {1})", flops: 4 },
  max: { n: 2, js: (a, b) => (a > b ? a : b), c: "fmaxf({0}, {1})", w: "max({0}, {1})", flops: 1 },
  maximum: { n: 2, js: (a, b) => (a > b ? a : b), c: "fmaxf({0}, {1})", w: "max({0}, {1})", flops: 1 },
  min: { n: 2, js: (a, b) => (a < b ? a : b), c: "fminf({0}, {1})", w: "min({0}, {1})", flops: 1 },
  minimum: { n: 2, js: (a, b) => (a < b ? a : b), c: "fminf({0}, {1})", w: "min({0}, {1})", flops: 1 },
  pow: { n: 2, js: (a, b) => Math.pow(a, b), c: "powf({0}, {1})", w: "pow({0}, {1})", flops: 8 },
  gt: { n: 2, js: (a, b) => (a > b ? 1 : 0), c: "(({0}) > ({1}) ? 1.0f : 0.0f)", w: "select(0.0, 1.0, ({0}) > ({1}))", flops: 1 },
  lt: { n: 2, js: (a, b) => (a < b ? 1 : 0), c: "(({0}) < ({1}) ? 1.0f : 0.0f)", w: "select(0.0, 1.0, ({0}) < ({1}))", flops: 1 },
  fma: { n: 3, js: (a, b, c) => a * b + c, c: "fmaf({0}, {1}, {2})", w: "fma({0}, {1}, {2})", flops: 2 },
  // select and copy are polymorphic: their result is an operand, of whatever dtype (poly)
  select: { n: 3, js: (c, a, b) => (c > 0 ? a : b), c: "(({0}) > 0.0f ? ({1}) : ({2}))", w: "select({2}, {1}, ({0}) > 0.0)", flops: 1, poly: true },
  neg: { n: 1, js: (a) => -a, c: "(-{0})", w: "(-{0})", flops: 1 },
  negative: { n: 1, js: (a) => -a, c: "(-{0})", w: "(-{0})", flops: 1 },
  exp: { n: 1, js: Math.exp, c: "expf({0})", w: "exp({0})", flops: 8 },
  // Keep the complete source operation in FP32 opmath, then narrow its result.
  // WGSL has no builtin erf; do not substitute tanh for exact GELU.
  gelu_erf: { n: 1, js: (x) => x * 0.5 * (1 + erf(x * Math.SQRT1_2)), c: "(({0} * 0.5f) * (1.0f + erff({0} * 0.7071067811865476f)))", w: null, flops: 12 },
  log: { n: 1, js: Math.log, c: "logf({0})", w: "log({0})", flops: 8 },
  sqrt: { n: 1, js: Math.sqrt, c: "sqrtf({0})", w: "sqrt({0})", flops: 4 },
  rsqrt: { n: 1, js: (a) => 1 / Math.sqrt(a), c: "rsqrtf({0})", w: "inverseSqrt({0})", flops: 4 },
  // WGSL: Metal's tanh overflows to NaN for |x| above ~44 (W-24's GELU reaches 440); tanh(±15) is ±1 in f32 already
  tanh: { n: 1, js: Math.tanh, c: "tanhf({0})", w: "tanh(clamp({0}, -15.0, 15.0))", flops: 8 },
  sigmoid: { n: 1, js: (a) => 1 / (1 + Math.exp(-a)), c: "(1.0f / (1.0f + expf(-({0}))))", w: "(1.0 / (1.0 + exp(-({0}))))", flops: 10 },
  relu: { n: 1, js: (a) => (a > 0 ? a : 0), c: "fmaxf({0}, 0.0f)", w: "max({0}, 0.0)", flops: 1 },
  abs: { n: 1, js: Math.abs, c: "fabsf({0})", w: "abs({0})", flops: 1 },
  floor: { n: 1, js: Math.floor, c: "floorf({0})", w: "floor({0})", flops: 1 },
  sin: { n: 1, js: Math.sin, c: "sinf({0})", w: "sin({0})", flops: 8 },
  cos: { n: 1, js: Math.cos, c: "cosf({0})", w: "cos({0})", flops: 8 },
  recip: { n: 1, js: (a) => 1 / a, c: "(1.0f / {0})", w: "(1.0 / {0})", flops: 4 },
  square: { n: 1, js: (a) => a * a, c: "({0} * {0})", w: "({0} * {0})", flops: 1 },
  copy: { n: 1, js: (a) => a, c: "{0}", w: "{0}", flops: 0, poly: true },
};

// Typed functions (P3a slice 3). Untyped functions above compute in f32; a typed function names its
// operand dtype (`args`, "*" for any) and its result dtype (`type`). The tensor level resolves PyTorch's
// type promotion into these names, so every kernel value has one static type. Reference values: i64 is
// a BigInt (exact, two's-complement wrap like CUDA), i32 and bool are numbers.
const big = (x) => (typeof x === "bigint" ? x : BigInt(x));
const wrap64 = (x) => BigInt.asIntN(64, x);
const INTEGER_OPS = {
  i64: { add: (a, b) => wrap64(big(a) + big(b)), sub: (a, b) => wrap64(big(a) - big(b)), mul: (a, b) => wrap64(big(a) * big(b)), neg: (a) => wrap64(-big(a)) },
  i32: { add: (a, b) => (a + b) | 0, sub: (a, b) => (a - b) | 0, mul: (a, b) => Math.imul(a, b), neg: (a) => -a | 0 },
};
const SPELL = { add: "({0} + {1})", sub: "({0} - {1})", mul: "({0} * {1})", neg: "(-{0})" };
for (const [t, ops] of Object.entries(INTEGER_OPS)) {
  for (const [name, js] of Object.entries(ops)) FNS[`${name}_${t}`] = { n: js.length, js, c: SPELL[name], w: null, flops: 1, args: t, type: t };
  FNS[`max_${t}`] = { n: 2, js: (a, b) => (a > b ? a : b), c: "(({0}) > ({1}) ? ({0}) : ({1}))", w: null, flops: 1, args: t, type: t };
  FNS[`min_${t}`] = { n: 2, js: (a, b) => (a < b ? a : b), c: "(({0}) < ({1}) ? ({0}) : ({1}))", w: null, flops: 1, args: t, type: t };
}
// comparisons yield bool; JS compares BigInt and number operands exactly
const COMPARE = { eq: ["==", (a, b) => a == b], ne: ["!=", (a, b) => a != b], lt: ["<", (a, b) => a < b], le: ["<=", (a, b) => a <= b], gt: [">", (a, b) => a > b], ge: [">=", (a, b) => a >= b] };
for (const t of ["f32", "i32", "i64", "bool"]) for (const [name, [op, js]] of Object.entries(COMPARE))
  FNS[`${name}_${t}`] = { n: 2, js: (a, b) => (js(a, b) ? 1 : 0), c: `(({0}) ${op} ({1}))`, w: null, flops: 1, args: t, type: "bool" };
// conversions from any dtype, with C++'s (and PyTorch's) semantics: truncation toward zero, x != 0 for bool
FNS.to_f32 = { n: 1, js: (x) => f(Number(x)), c: "((float)({0}))", w: null, flops: 1, args: "*", type: "f32" };
FNS.to_i64 = { n: 1, js: (x) => (typeof x === "bigint" ? x : BigInt(Math.trunc(x))), c: "((long long)({0}))", w: null, flops: 1, args: "*", type: "i64" };
FNS.to_i32 = { n: 1, js: (x) => (typeof x === "bigint" ? Number(BigInt.asIntN(32, x)) : Math.trunc(x) | 0), c: "((int)({0}))", w: null, flops: 1, args: "*", type: "i32" };
FNS.to_bool = { n: 1, js: (x) => (x != 0 ? 1 : 0), c: "(({0}) != 0)", w: null, flops: 1, args: "*", type: "bool" };
export const INTEGER_DTYPES = new Set(["i32", "i64", "bool"]);
/** The result dtype of a function application: f32 unless the function is typed. */
export const resultType = (name) => FNS[name]?.type ?? "f32";
export const REDUCERS = {
  add: { init: 0, js: (a, b) => a + b, op: "add", c: "0.0f", w: "0.0" },
  max: { init: -Infinity, js: (a, b) => (a > b ? a : b), op: "max", c: "__int_as_float(0xff800000)", w: "bitcast<f32>(0xff800000u)" },
  min: { init: 3.4028234663852886e38, js: (a, b) => (a < b ? a : b), op: "min", c: "3.402823466e38f", w: "3.402823466e38" },
  mul: { init: 1, js: (a, b) => a * b, op: "mul", c: "1.0f", w: "1.0" },
  add_i64: { init: 0n, js: FNS.add_i64.js, op: "add_i64", c: "0LL", w: null, type: "i64" },
  max_i64: { init: -(2n ** 63n), js: FNS.max_i64.js, op: "max_i64", c: "(-9223372036854775807LL - 1)", w: null, type: "i64" },
  min_i64: { init: 2n ** 63n - 1n, js: FNS.min_i64.js, op: "min_i64", c: "9223372036854775807LL", w: null, type: "i64" },
  add_i32: { init: 0, js: FNS.add_i32.js, op: "add_i32", c: "0", w: null, type: "i32" },
  mul_i64: { init: 1n, js: FNS.mul_i64.js, op: "mul_i64", c: "1LL", w: null, type: "i64" },
  mul_i32: { init: 1, js: FNS.mul_i32.js, op: "mul_i32", c: "1", w: null, type: "i32" },
  max_i32: { init: -(2 ** 31), js: FNS.max_i32.js, op: "max_i32", c: "(-2147483647 - 1)", w: null, type: "i32" },
  min_i32: { init: 2 ** 31 - 1, js: FNS.min_i32.js, op: "min_i32", c: "2147483647", w: null, type: "i32" },
};
/** A reduction's typed name for an operand dtype: add over i64 is add_i64; floating reductions keep their name. */
export const typedReducer = (name, dtype) => (INTEGER_DTYPES.has(dtype) ? `${name}_${dtype === "i32" ? "i32" : "i64"}` : name);
// Loop references model FP32 scalar registers, including accumulator updates.
// Tensor references already round through Float32Array storage between nodes.
// Typed integer results are exact and pass through unrounded; a polymorphic result is an operand,
// already f32 when it is a float.
export const FLOAT32_FUNCTIONS = Object.freeze(Object.fromEntries(
  Object.entries(FNS).map(([name, spec]) => [name, INTEGER_DTYPES.has(spec.type) || spec.poly ? spec.js : (...args) => f(spec.js(...args))])
));
export const FLOAT32_REDUCERS = Object.freeze(Object.fromEntries(
  Object.entries(REDUCERS).map(([name, spec]) => [name, spec.type ? spec.js : (a, b) => f(spec.js(a, b))])
));
/** JS source of a reduction's initial value (BigInt literals keep their suffix). */
export const jsInit = (name) => { const v = REDUCERS[name].init; return typeof v === "bigint" ? `${v}n` : String(v); };
export function fn(name) { const x = FNS[name]; if (!x) throw new Error(`unknown function "${name}" (known: ${Object.keys(FNS).join(", ")})`); return x; }
export function reducer(name) { const x = REDUCERS[name]; if (!x) throw new Error(`unknown reduction "${name}" (add, max, min, mul, or a typed add_i64…)`); return x; }
export const fill = (tpl, args) => tpl.replace(/\{(\d)\}/g, (_, i) => args[+i]);
export const fr = f;
