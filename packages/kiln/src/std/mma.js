// Tensor-core matrix-multiply-accumulate atoms (KILN-006): the single source of truth for the shapes,
// operand formats and per-lane fragment layouts of the PTX `mma.sync` instructions Kiln emits, and a
// faithful JavaScript emulation of one warp-collective atom for the SIMT simulator.
//
// Every consumer reads this table: the materializer (kernel.js matMma, fragment addresses), the CUDA
// emitter (emit.js, PTX string, register packing), the simulator (emit.js toSim → MMA.run) and the cost
// model (tile.js estimateMma, bank-conflict degrees). None of them repeats a layout formula.
//
// Layouts are transcribed from NVIDIA's PTX ISA, section "Warp-level matrix multiply-accumulate
// instructions", subsections "Matrix Fragments for mma.m16n8k8" (.tf32) and "Matrix Fragments for
// mma.m16n8k16 with floating point type" (.f16/.bf16). With g = lane >> 2 (groupID) and t = lane & 3
// (threadID_in_group):
//   m16n8k8.tf32   A a0..a3: row g + 8·(i & 1), col t + 4·(i >> 1)       B b0,b1: row(k) t + 4·i, col g
//   m16n8k16.f16   A a0..a7: row g + 8·(r & 1), col 2t + (e & 1) + 8·(r >> 1), r = e >> 1 (register)
//                  B b0..b3: row(k) 2t + (e & 1) + 8·(e >> 1), col g
//   C/D (f32)      c0..c3: row g + 8·(i >> 1), col 2t + (i & 1)
// A CPU test (test/mma-layout.mjs) proves each layout is a bijection onto its matrix. Only a GPU probe can
// prove the table matches silicon (KILN-006 guide, Phase 0); until then it is a transcription.
//
// Kernel IR keeps one f32 temporary per operand *element*: a TF32 element is the FP32 bit pattern with its
// low 13 mantissa bits clear (one 32-bit register), and two f16/bf16 elements share one 32-bit register,
// element 2j in the low half and 2j+1 in the high half (the emitter packs them).
import { roundTf32 } from "./fns.js";
import { roundToDtype } from "../core/dtypes.js";

const lanes = (fn) => (lane, i) => fn(lane >> 2, lane & 3, i);
const f16Layout = {
  a: lanes((g, t, e) => { const r = e >> 1; return [g + 8 * (r & 1), 2 * t + (e & 1) + 8 * (r >> 1)]; }),
  b: lanes((g, t, e) => [2 * t + (e & 1) + 8 * (e >> 1), g]),
};
/**
 * The atoms. Fields: m, n, k (A is m×k, B is k×n, C/D m×n); operand (the operand format); aRegs/bRegs (32-bit
 * registers per lane), perReg (elements per register); aElems/bElems (elements per lane = regs·perReg);
 * a(lane, e) → [row, k] and b(lane, e) → [k, col] (the element e that lane holds); ptx (the instruction).
 */
export const MMA_OPS = Object.freeze({
  "m16n8k8.tf32": Object.freeze({
    name: "m16n8k8.tf32", m: 16, n: 8, k: 8, operand: "tf32", aRegs: 4, bRegs: 2, perReg: 1, aElems: 4, bElems: 2,
    ptx: "mma.sync.aligned.m16n8k8.row.col.f32.tf32.tf32.f32",
    a: lanes((g, t, i) => [g + 8 * (i & 1), t + 4 * (i >> 1)]),
    b: lanes((g, t, i) => [t + 4 * i, g]),
  }),
  "m16n8k16.f16": Object.freeze({
    name: "m16n8k16.f16", m: 16, n: 8, k: 16, operand: "f16", aRegs: 4, bRegs: 2, perReg: 2, aElems: 8, bElems: 4,
    ptx: "mma.sync.aligned.m16n8k16.row.col.f32.f16.f16.f32", ...f16Layout,
  }),
  "m16n8k16.bf16": Object.freeze({
    name: "m16n8k16.bf16", m: 16, n: 8, k: 16, operand: "bf16", aRegs: 4, bRegs: 2, perReg: 2, aElems: 8, bElems: 4,
    ptx: "mma.sync.aligned.m16n8k16.row.col.f32.bf16.bf16.f32", ...f16Layout,
  }),
});
/** C and D, every op: 4 f32 accumulators per lane → [row, col]. */
export const accLayout = lanes((g, t, i) => [g + 8 * (i >> 1), 2 * t + (i & 1)]);
export const ACC_ELEMS = 4;
/** The atom for each operand precision (tile.js operandPrecision): FP32 accumulate always. */
export const OP_FOR_PRECISION = Object.freeze({ tf32: "m16n8k8.tf32", f16: "m16n8k16.f16", bf16: "m16n8k16.bf16" });
export const mmaOp = (name) => MMA_OPS[name] ?? (() => { throw new TypeError(`unknown mma op ${name}`); })();

// ----------------------------------------------------------------------------- operand formats
/** x rounded to the operand format (TF32: round to nearest, ties to even, as fns.js round_tf32). */
export function roundOperand(x, operand) {
  if (operand === "tf32") return roundTf32(x);
  if (operand === "f16" || operand === "bf16") return roundToDtype(x, operand);
  throw new TypeError(`no tensor-core operand format ${operand}`);
}
/** Whether x is exactly representable in the operand format (NaN counts as representable: it stays NaN). */
export const representable = (x, operand) => Number.isNaN(x) || roundOperand(x, operand) === x;

// ----------------------------------------------------------------------------- accumulation
// The PTX ISA fixes the operands and that the products are summed into an FP32 accumulator; it does not
// promise IEEE round-to-nearest after each addition, nor a summation order. Products of two TF32, f16 or bf16
// values have at most 22 significant bits and are exact in FP32 (and in a JS double). The orders below make the
// unspecified part explicit, so tests can check a kernel stays inside tolerance under each of them:
//   sequential  d = c; for k ascending: d = fround(d + a·b)                   (the default; the Loop IR reference order)
//   reverse     the same, k descending
//   pairwise    a balanced tree over the k products, fround at every node, then fround(c + tree)
//   chunk-rz    a hardware-like model: c plus each consecutive chunk of 4 products summed in one step and
//               rounded toward zero (after Fasi et al. 2021, "Numerical behavior of NVIDIA tensor cores",
//               who measured truncating multi-term adders on V100/T4/A100). A model, not a measured GB10 fact.
export const ORDERS = Object.freeze(["sequential", "reverse", "pairwise", "chunk-rz"]);
const f = Math.fround;
const RZ = new Float32Array(1), RZB = new Uint32Array(RZ.buffer);
function froundRz(x) {
  const r = f(x);
  if (r === x || !Number.isFinite(x)) return r;
  if (!Number.isFinite(r)) return Math.sign(x) * 3.4028234663852886e38;   // a finite sum never truncates to infinity
  if (Math.abs(r) <= Math.abs(x)) return r;
  RZ[0] = r; RZB[0] -= 1;                          // one ulp toward zero: |r| > |x| > 0, sign-magnitude bits
  return RZ[0];
}
const pairwise = (p, lo, hi) => (hi - lo === 1 ? p[lo] : f(pairwise(p, lo, (lo + hi) >> 1) + pairwise(p, (lo + hi) >> 1, hi)));
/** One dot product c + Σ_k a[k]·b[k] under an accumulation order (products exact). */
export function dot(c, a, b, order = "sequential") {
  const K = a.length;
  if (order === "sequential") { let d = c; for (let q = 0; q < K; q++) d = f(d + a[q] * b[q]); return d; }
  if (order === "reverse") { let d = c; for (let q = K - 1; q >= 0; q--) d = f(d + a[q] * b[q]); return d; }
  if (order === "pairwise") { const p = Array.from({ length: K }, (_, q) => a[q] * b[q]); return f(c + pairwise(p, 0, K)); }
  if (order === "chunk-rz") { let d = c; for (let q = 0; q < K; q += 4) { let s = d; for (let j = q; j < Math.min(K, q + 4); j++) s += a[j] * b[j]; d = froundRz(s); } return d; }
  throw new TypeError(`unknown mma accumulation order ${order} (one of ${ORDERS.join(", ")})`);
}

/**
 * D = A·B + C for one atom on dense row-major arrays: A m×k, B k×n, C m×n. Pure, for tests and for MMA.run.
 * Operands must already be representable (MMA.run checks); this function does not round them.
 */
export function atomReference(opName, A, B, Cm, order = "sequential") {
  const op = mmaOp(opName), D = new Float32Array(op.m * op.n), ar = new Float64Array(op.k), bc = new Float64Array(op.k);
  for (let i = 0; i < op.m; i++) for (let j = 0; j < op.n; j++) {
    for (let q = 0; q < op.k; q++) { ar[q] = A[i * op.k + q]; bc[q] = B[q * op.n + j]; }
    D[i * op.n + j] = dot(Cm[i * op.n + j], ar, bc, order);
  }
  return D;
}

// flat per-lane index tables, computed once per op: slot (lane·elems + e) → element offset in the dense matrix
const TABLES = new Map();
function tablesOf(opName) {
  let t = TABLES.get(opName);
  if (t) return t;
  const op = mmaOp(opName);
  const a = new Int32Array(32 * op.aElems), b = new Int32Array(32 * op.bElems), c = new Int32Array(32 * ACC_ELEMS);
  for (let l = 0; l < 32; l++) {
    for (let e = 0; e < op.aElems; e++) { const [r, q] = op.a(l, e); a[l * op.aElems + e] = r * op.k + q; }
    for (let e = 0; e < op.bElems; e++) { const [q, cc] = op.b(l, e); b[l * op.bElems + e] = q * op.n + cc; }
    for (let i = 0; i < ACC_ELEMS; i++) { const [r, cc] = accLayout(l, i); c[l * ACC_ELEMS + i] = r * op.n + cc; }
  }
  t = { op, a, b, c, A: new Float64Array(op.m * op.k), B: new Float64Array(op.k * op.n), C: new Float64Array(op.m * op.n) };
  TABLES.set(opName, t);
  return t;
}
export const layoutTables = (opName) => { const { a, b, c } = tablesOf(opName); return { a, b, c }; };

/**
 * The warp-collective statement as the simulator executes it: lanes w … w+31 of the per-thread arrays.
 * acc: 4 Float32Arrays (read C, write D); a: aElems arrays; b: bElems arrays (all indexed by thread).
 * Gathers A, B and C through the layout table, checks every operand is representable in the operand format
 * (hardware would silently use only the format's bits), computes D with exact products and the chosen
 * accumulation order, and scatters D back. → null, or the first violation { lane, operand, slot, value }.
 */
export function runAtom(opName, w, acc, a, b, order = "sequential") {
  const T = tablesOf(opName), op = T.op;
  let bad = null;
  for (let l = 0; l < 32; l++) {
    const t = w + l;
    for (let e = 0; e < op.aElems; e++) { const v = a[e][t]; if (!bad && !representable(v, op.operand)) bad = { lane: l, operand: "A", slot: e, value: v }; T.A[T.a[l * op.aElems + e]] = v; }
    for (let e = 0; e < op.bElems; e++) { const v = b[e][t]; if (!bad && !representable(v, op.operand)) bad = { lane: l, operand: "B", slot: e, value: v }; T.B[T.b[l * op.bElems + e]] = v; }
    for (let i = 0; i < ACC_ELEMS; i++) T.C[T.c[l * ACC_ELEMS + i]] = acc[i][t];
  }
  const D = atomReference(opName, T.A, T.B, T.C, order);
  for (let l = 0; l < 32; l++) for (let i = 0; i < ACC_ELEMS; i++) acc[i][w + l] = D[T.c[l * ACC_ELEMS + i]];
  return bad;
}
export const MMA = Object.freeze({ run: runAtom, ops: MMA_OPS, accLayout, dot, atomReference, representable, roundOperand, ORDERS });

// ----------------------------------------------------------------------------- shared-memory addressing
/**
 * Bank-conflict degree of one warp access: the largest number of distinct 4-byte addresses that fall in one of
 * the 32 banks (the way the simulator's SimMetrics.smem and tile.js estimate count wavefronts). addr(lane) → word.
 */
export function bankDegree(addr) {
  const banks = new Map();
  for (let t = 0; t < 32; t++) { const a = addr(t), bk = ((a % 32) + 32) % 32; if (!banks.has(bk)) banks.set(bk, new Set()); banks.get(bk).add(a); }
  let d = 1;
  for (const v of banks.values()) d = Math.max(d, v.size);
  return d;
}
export const PADS = Object.freeze([0, 4, 8]);
/**
 * The shared-tile geometry matMma writes and estimateMma costs: sA is BM rows of BK (+padA) words (row-major
 * [m][k]), sB is BK rows of BN (+padB) words (row-major [k][n]). The pads are the smallest of PADS that minimize
 * the summed conflict degree of one k-step's fragment reads (every element slot of A and of B). Deterministic.
 * → { padA, padB, ldA, ldB, degA: [per A slot], degB: [per B slot], sizeA, sizeB }
 */
export function mmaSmemLayout(opName, { BM, BN, BK }) {
  const op = mmaOp(opName);
  const degsA = (ld) => Array.from({ length: op.aElems }, (_, e) => bankDegree((l) => { const [r, q] = op.a(l, e); return r * ld + q; }));
  const degsB = (ld) => Array.from({ length: op.bElems }, (_, e) => bankDegree((l) => { const [q, c] = op.b(l, e); return q * ld + c; }));
  const best = (degs, base) => PADS.map((p) => ({ p, d: degs(base + p) })).reduce((x, y) => (y.d.reduce((s, v) => s + v, 0) < x.d.reduce((s, v) => s + v, 0) ? y : x));
  const A = best(degsA, BK), B = best(degsB, BN);
  return { padA: A.p, padB: B.p, ldA: BK + A.p, ldB: BN + B.p, degA: A.d, degB: B.d, sizeA: BM * (BK + A.p), sizeB: BK * (BN + B.p) };
}
/** Shared memory (bytes) of a MAP=mma block: the two padded f32 tiles. */
export const mmaSmemBytes = (opName, kn) => { const s = mmaSmemLayout(opName, kn); return (s.sizeA + s.sizeB) * 4; };
