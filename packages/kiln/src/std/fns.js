// Scalar functions shared by every level: reference evaluation, the loop evaluator, and the
// CUDA / WGSL / JS emitters. One table, so a new function is one entry here.
import { roundToDtype } from "../core/dtypes.js";
import { erf } from "./special.js";
import { KilnError } from "../core/kiln.js";
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
  round_tf32: { n: 1, js: roundTf32, c: "kiln_round_tf32({0})", w: "kiln_round_tf32({0})", flops: 1, helper: "kiln_round_tf32" },
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
  i64: { add: (a, b) => wrap64(big(a) + big(b)), sub: (a, b) => wrap64(big(a) - big(b)), mul: (a, b) => wrap64(big(a) * big(b)), neg: (a) => wrap64(-big(a)), abs: (a) => wrap64(big(a) < 0n ? -big(a) : big(a)) },
  i32: { add: (a, b) => (a + b) | 0, sub: (a, b) => (a - b) | 0, mul: (a, b) => Math.imul(a, b), neg: (a) => -a | 0, abs: (a) => Math.abs(a) | 0 },
};
const SPELL = { add: "({0} + {1})", sub: "({0} - {1})", mul: "({0} * {1})", neg: "(-{0})", abs: "(({0}) < 0 ? -({0}) : ({0}))" };
for (const [t, ops] of Object.entries(INTEGER_OPS)) {
  for (const [name, js] of Object.entries(ops)) FNS[`${name}_${t}`] = { n: js.length, js, c: SPELL[name], w: null, flops: 1, args: t, type: t };
  FNS[`max_${t}`] = { n: 2, js: (a, b) => (a > b ? a : b), c: "(({0}) > ({1}) ? ({0}) : ({1}))", w: null, flops: 1, args: t, type: t };
  FNS[`min_${t}`] = { n: 2, js: (a, b) => (a < b ? a : b), c: "(({0}) < ({1}) ? ({0}) : ({1}))", w: null, flops: 1, args: t, type: t };
}
// Integer division (KILN-011). PyTorch's // and % round toward negative infinity (remainder has the
// divisor's sign); torch.div(rounding_mode="trunc") and fmod round toward zero (fmod has the dividend's
// sign). BigInt / and % truncate, so truncdiv and fmod are the bare operators; floordiv and remainder
// step the truncated result when the remainder is nonzero and its sign differs from the divisor's.
// INT_MIN / -1 wraps to INT_MIN (asIntN, | 0), as the CUDA helpers make explicit. A zero divisor raises,
// as PyTorch CPU does; kernels leave it unspecified (C and CUDA integer division by zero is undefined).
const zeroDivide = () => { throw new KilnError("ZeroDivisionError", "integer division by zero"); };
const stepsDown = (r, b) => r != 0 && (r < 0) !== (b < 0);
const INTEGER_DIVISION = {
  i64: {
    floordiv: (a, b) => { a = big(a); b = big(b); if (b === 0n) zeroDivide(); const q = a / b; return wrap64(stepsDown(a % b, b) ? q - 1n : q); },
    remainder: (a, b) => { a = big(a); b = big(b); if (b === 0n) zeroDivide(); const r = a % b; return stepsDown(r, b) ? r + b : r; },
    truncdiv: (a, b) => { a = big(a); b = big(b); if (b === 0n) zeroDivide(); return wrap64(a / b); },
    fmod: (a, b) => { a = big(a); b = big(b); if (b === 0n) zeroDivide(); return a % b; },
  },
  // int32 operands: Math.trunc(a / b) is exact (the true quotient is at least 2^-31 from the next
  // integer, above double precision) and a - q * b is exact (|q * b| <= |a|); neither yields -0 here
  i32: {
    floordiv: (a, b) => { if (b === 0) zeroDivide(); const q = Math.trunc(a / b); return (stepsDown(a - q * b, b) ? q - 1 : q) | 0; },
    remainder: (a, b) => { if (b === 0) zeroDivide(); const r = a - Math.trunc(a / b) * b; return (stepsDown(r, b) ? r + b : r) | 0; },
    truncdiv: (a, b) => { if (b === 0) zeroDivide(); return Math.trunc(a / b) | 0; },
    fmod: (a, b) => { if (b === 0) zeroDivide(); return (a - Math.trunc(a / b) * b) | 0; },
  },
};
/** Frontend names of the integer divisions; each has a typed function per integer dtype (floordiv_i64, …). */
export const INTEGER_DIVISIONS = new Set(Object.keys(INTEGER_DIVISION.i64));
// flops: unmeasured placeholders. CUDA has no integer divide instruction; a data divisor costs a
// software sequence (i64 is several times longer than i32), a literal one a multiply-high sequence.
const DIVISION_FLOPS = { i32: 20, i64: 60 };
for (const [t, ops] of Object.entries(INTEGER_DIVISION)) for (const [name, js] of Object.entries(ops))
  FNS[`${name}_${t}`] = { n: 2, js, c: `kiln_${name}_${t}({0}, {1})`, w: null, flops: DIVISION_FLOPS[t], args: t, type: t, helper: `kiln_${name}_${t}` };
// Float floor division and remainder, as PyTorch computes them (c10 div_floor_floating; the remainder
// kernels): not floor(a / b), which rounds the quotient first (1 // 0.1 is 9, floor(1 / 0.1) is 10).
// Every step rounds to f32 as the CUDA helper does; JS % is C fmod (exact). The remainder of an exact
// division is fmod's zero, which has the dividend's sign (PyTorch CPU, -2.0 % 1.0 == -0.0).
const signedZero = (x) => (x < 0 || Object.is(x, -0) ? -0 : 0);
function floordivF32(a, b) {
  a = f(a); b = f(b);
  if (b === 0) return f(a / b);
  const mod = a % b;
  let div = f(f(a - mod) / b);
  if (mod !== 0 && (b < 0) !== (mod < 0)) div = f(div - 1);
  if (div === 0) return signedZero(a / b);
  let floor = Math.floor(div);
  if (f(div - floor) > 0.5) floor = f(floor + 1);
  return floor;
}
function remainderF32(a, b) {
  a = f(a); b = f(b);
  const mod = a % b;
  return mod !== 0 && (b < 0) !== (mod < 0) ? f(mod + b) : mod;
}
FNS.floordiv = { n: 2, js: floordivF32, c: "kiln_floordiv_f32({0}, {1})", w: null, flops: 12, helper: "kiln_floordiv_f32" };
FNS.remainder = { n: 2, js: remainderF32, c: "kiln_remainder_f32({0}, {1})", w: null, flops: 10, helper: "kiln_remainder_f32" };
FNS.fmod = { n: 2, js: (a, b) => f(a) % f(b), c: "fmodf({0}, {1})", w: null, flops: 8 };
FNS.truncdiv = { n: 2, js: (a, b) => Math.trunc(f(f(a) / f(b))), c: "truncf(({0}) / ({1}))", w: null, flops: 5 };
// comparisons yield bool; JS compares BigInt and number operands exactly
const COMPARE = { eq: ["==", (a, b) => a == b], ne: ["!=", (a, b) => a != b], lt: ["<", (a, b) => a < b], le: ["<=", (a, b) => a <= b], gt: [">", (a, b) => a > b], ge: [">=", (a, b) => a >= b] };
for (const t of ["f32", "i32", "i64", "bool"]) for (const [name, [op, js]] of Object.entries(COMPARE))
  FNS[`${name}_${t}`] = { n: 2, js: (a, b) => (js(a, b) ? 1 : 0), c: `(({0}) ${op} ({1}))`, w: null, flops: 1, args: t, type: "bool" };
// conversions from any dtype, with C++'s (and PyTorch's) semantics: truncation toward zero, x != 0 for bool
FNS.to_f32 = { n: 1, js: (x) => f(Number(x)), c: "((float)({0}))", w: null, flops: 1, args: "*", type: "f32" };
// A float outside the integer range (inf, or log(0) in MPNet's relative buckets, a branch where then
// discards) has no C++ value; the reference saturates like CUDA's cvt.rzi (NaN gives 0) instead of throwing.
const saturate = (x, lo, hi) => (Number.isNaN(x) ? 0 : x <= lo ? lo : x >= hi ? hi : Math.trunc(x));
const toI64 = (x) => {
  if (typeof x === "bigint") return x;
  if (Number.isNaN(x)) return 0n;
  if (x >= 2 ** 63) return 2n ** 63n - 1n;
  return x <= -(2 ** 63) ? -(2n ** 63n) : BigInt(Math.trunc(x));
};
FNS.to_i64 = { n: 1, js: toI64, c: "((long long)({0}))", w: null, flops: 1, args: "*", type: "i64" };
FNS.to_i32 = { n: 1, js: (x) => (typeof x === "bigint" ? Number(BigInt.asIntN(32, x)) : saturate(x, -(2 ** 31), 2 ** 31 - 1) | 0), c: "((int)({0}))", w: null, flops: 1, args: "*", type: "i32" };
FNS.to_bool = { n: 1, js: (x) => (x != 0 ? 1 : 0), c: "(({0}) != 0)", w: null, flops: 1, args: "*", type: "bool" };
export const INTEGER_DTYPES = new Set(["i32", "i64", "bool"]);
// CUDA device functions a kernel defines once when its body applies a function with that helper.
// Division helpers: C guarantees a == q * b + r with q truncated and r of a's sign; the floor quotient
// is q - 1 exactly when r != 0 and r, b differ in sign, and then the floor remainder is r + b. b == -1 is
// explicit because INT_MIN / -1 is undefined behavior in C; NVRTC folds the test for a literal divisor.
const cudaDivisionHelpers = (t, c, u) => ({
  [`kiln_floordiv_${t}`]: `__device__ __forceinline__ ${c} kiln_floordiv_${t}(${c} a, ${c} b) { if (b == -1) return (${c})(0u - (${u})a); ${c} q = a / b, r = a % b; return q - (${c})((r != 0) & ((r ^ b) < 0)); }`,
  [`kiln_remainder_${t}`]: `__device__ __forceinline__ ${c} kiln_remainder_${t}(${c} a, ${c} b) { if (b == -1) return 0; ${c} r = a % b; return r + (((r != 0) & ((r ^ b) < 0)) ? b : 0); }`,
  [`kiln_truncdiv_${t}`]: `__device__ __forceinline__ ${c} kiln_truncdiv_${t}(${c} a, ${c} b) { return b == -1 ? (${c})(0u - (${u})a) : a / b; }`,
  [`kiln_fmod_${t}`]: `__device__ __forceinline__ ${c} kiln_fmod_${t}(${c} a, ${c} b) { return b == -1 ? 0 : a % b; }`,
});
export const CUDA_HELPERS = Object.freeze({
  kiln_round_tf32: `__device__ __forceinline__ float kiln_round_tf32(float x) { unsigned b = __float_as_uint(x); if ((b & 0x7f800000u) == 0x7f800000u) return x; return __uint_as_float((b + 0xfffu + ((b >> 13) & 1u)) & 0xffffe000u); }`,
  kiln_floordiv_f32: `__device__ __forceinline__ float kiln_floordiv_f32(float a, float b) { if (b == 0.0f) return a / b; float mod = fmodf(a, b); float div = (a - mod) / b; if ((mod != 0.0f) && ((b < 0.0f) != (mod < 0.0f))) div -= 1.0f; if (div == 0.0f) return copysignf(0.0f, a / b); float fl = floorf(div); if (div - fl > 0.5f) fl += 1.0f; return fl; }`,
  kiln_remainder_f32: `__device__ __forceinline__ float kiln_remainder_f32(float a, float b) { float mod = fmodf(a, b); if ((mod != 0.0f) && ((b < 0.0f) != (mod < 0.0f))) mod += b; return mod; }`,
  ...cudaDivisionHelpers("i32", "int", "unsigned int"),
  ...cudaDivisionHelpers("i64", "long long", "unsigned long long"),
});
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
