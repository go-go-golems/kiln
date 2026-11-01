// KILN-006 Phase 1: the tensor-core atom table (mma.js) and its warp emulation, CPU only.
// Proves each fragment layout is a bijection onto its matrix, that the emulated warp-collective atom computes
// A·B + C with exact products under every accumulation order, and that unrepresentable operands are reported.
import assert from "node:assert/strict";
import { rng } from "../src/core/util.js";
import { MMA_OPS, accLayout, ACC_ELEMS, runAtom, atomReference, dot, ORDERS, representable, roundOperand, bankDegree, mmaSmemLayout, layoutTables, OP_FOR_PRECISION } from "../src/std/mma.js";

// ---------------------------------------------------------------- layouts are bijections
for (const [name, op] of Object.entries(MMA_OPS)) {
  assert.equal(op.aElems, op.aRegs * op.perReg); assert.equal(op.bElems, op.bRegs * op.perReg);
  const own = (rows, cols, elems, fn, what) => {
    const seen = new Map();
    for (let l = 0; l < 32; l++) for (let e = 0; e < elems; e++) {
      const [r, c] = fn(l, e);
      assert.ok(r >= 0 && r < rows && c >= 0 && c < cols, `${name} ${what} lane ${l} slot ${e} → [${r}, ${c}] is outside ${rows}×${cols}`);
      const key = r * cols + c;
      assert.ok(!seen.has(key), `${name} ${what} [${r}, ${c}] owned twice (lane ${l} slot ${e} and ${seen.get(key)})`);
      seen.set(key, `lane ${l} slot ${e}`);
    }
    assert.equal(seen.size, rows * cols, `${name} ${what} covers every element`);
  };
  own(op.m, op.k, op.aElems, op.a, "A");
  own(op.k, op.n, op.bElems, op.b, "B");
  own(op.m, op.n, ACC_ELEMS, accLayout, "C/D");
  assert.equal(op.ptx.split(".").slice(3, 4)[0], `m${op.m}n${op.n}k${op.k}`);
  assert.ok(op.ptx.startsWith("mma.sync.aligned.") && op.ptx.includes(".row.col.f32.") && op.ptx.endsWith(".f32"), op.ptx);
}
// spot checks against the PTX ISA figures (lane 0 and lane 5: g = 1, t = 1)
assert.deepEqual(MMA_OPS["m16n8k8.tf32"].a(5, 3), [9, 5]);
assert.deepEqual(MMA_OPS["m16n8k8.tf32"].b(5, 1), [5, 1]);
assert.deepEqual(MMA_OPS["m16n8k16.f16"].a(5, 7), [9, 11]);
assert.deepEqual(MMA_OPS["m16n8k16.f16"].b(5, 3), [11, 1]);
assert.deepEqual(accLayout(5, 3), [9, 3]);
assert.deepEqual(Object.keys(OP_FOR_PRECISION), ["tf32", "f16", "bf16"]);

// ---------------------------------------------------------------- the emulated atom computes A·B + C
const r = rng(11);
const randomMatrix = (n, operand) => Float64Array.from({ length: n }, () => roundOperand(r() * 4 - 2, operand));
for (const [name, op] of Object.entries(MMA_OPS)) {
  const A = randomMatrix(op.m * op.k, op.operand), B = randomMatrix(op.k * op.n, op.operand), C = Float64Array.from({ length: op.m * op.n }, () => Math.fround(r() - 0.5));
  // scatter into a warp's per-thread arrays (two warps; the second is the one run) through the layout table
  const T = 64, w = 32;
  const a = Array.from({ length: op.aElems }, () => new Float32Array(T)), b = Array.from({ length: op.bElems }, () => new Float32Array(T)), acc = Array.from({ length: 4 }, () => new Float32Array(T).fill(NaN));
  for (let l = 0; l < 32; l++) {
    for (let e = 0; e < op.aElems; e++) { const [i, q] = op.a(l, e); a[e][w + l] = A[i * op.k + q]; }
    for (let e = 0; e < op.bElems; e++) { const [q, j] = op.b(l, e); b[e][w + l] = B[q * op.n + j]; }
    for (let e = 0; e < 4; e++) { const [i, j] = accLayout(l, e); acc[e][w + l] = C[i * op.n + j]; }
  }
  assert.equal(runAtom(name, w, acc, a, b), null, `${name}: representable operands`);
  for (let l = 0; l < 32; l++) assert.ok(Number.isNaN(acc[0][l]), "lanes of another warp are untouched");
  let maxErr = 0;
  for (let l = 0; l < 32; l++) for (let e = 0; e < 4; e++) {
    const [i, j] = accLayout(l, e);
    let exact = C[i * op.n + j], seq = C[i * op.n + j];
    for (let q = 0; q < op.k; q++) { const p = A[i * op.k + q] * B[q * op.n + j]; assert.equal(Math.fround(p), p, "products are exact in FP32"); exact += p; seq = Math.fround(seq + p); }
    assert.equal(acc[e][w + l], seq, `${name} D[${i}][${j}] is the sequential FP32 sum`);
    maxErr = Math.max(maxErr, Math.abs(acc[e][w + l] - exact));
  }
  assert.ok(maxErr < 1e-5, `${name} close to the exact sum (${maxErr})`);
  // every order stays within FP32 accumulation error of the exact sum, and they differ from each other somewhere
  for (const order of ORDERS) {
    const D = atomReference(name, A, B, C, order);
    for (let i = 0; i < op.m; i++) for (let j = 0; j < op.n; j++) {
      let exact = C[i * op.n + j]; for (let q = 0; q < op.k; q++) exact += A[i * op.k + q] * B[q * op.n + j];
      assert.ok(Math.abs(D[i * op.n + j] - exact) <= 4 * op.k * 2 ** -23 * 16, `${name} ${order} D[${i}][${j}] = ${D[i * op.n + j]} vs ${exact}`);
    }
  }
  // representability: an unrounded FP32 value in A is reported, not silently used
  const bad = Math.fround(1 + 2 ** -20);
  assert.ok(!representable(bad, op.operand));
  a[1][w + 7] = bad;
  const v = runAtom(name, w, acc, a, b);
  assert.deepEqual(v && { lane: v.lane, operand: v.operand, slot: v.slot }, { lane: 7, operand: "A", slot: 1 }, `${name} reports the unrepresentable operand`);
}
// order semantics on a constructed case: 1 + 2^-24 + 2^-24 + … is order-sensitive in FP32
{
  const a = [1, 2 ** -12, 2 ** -12, 2 ** -12], b = [1, 2 ** -12, 2 ** -12, 2 ** -12];
  assert.equal(dot(0, a, b, "sequential"), 1, "each 2^-24 is lost after the 1");
  assert.equal(dot(0, a, b, "reverse"), 1 + 2 ** -22, "the small terms accumulate first: 1 + 3·2^-24 rounds (tie to even) to 1 + 2^-22");
  assert.equal(dot(0, [1, 1], [Math.fround(1 / 3), Math.fround(1 / 3)], "chunk-rz"), Math.fround(2 * Math.fround(1 / 3)), "an exact sum is unchanged by truncation");
  const t = dot(0, [1, 2 ** -12], [1, 2 ** -13], "chunk-rz");
  assert.equal(t, 1, "1 + 2^-25 truncates to 1");
  assert.equal(dot(0, [-1, -(2 ** -12)], [1, 2 ** -13 * 3], "chunk-rz"), -1, "truncation is toward zero for negative sums");
  assert.throws(() => dot(0, a, b, "random"), /accumulation order/);
}
// TF32 representability is the RNE rounding of fns.js
assert.ok(representable(1 + 2 ** -10, "tf32") && !representable(1 + 2 ** -11, "tf32"));
assert.ok(representable(1 + 2 ** -10, "f16") && !representable(1 + 2 ** -11, "f16") && !representable(1e5, "f16"));
assert.ok(representable(1 + 2 ** -7, "bf16") && !representable(1 + 2 ** -8, "bf16") && representable(1e30 * 0 + 2 ** 100, "bf16"));
assert.ok(representable(NaN, "tf32"));

// ---------------------------------------------------------------- shared-memory padding
assert.equal(bankDegree((l) => l), 1);
assert.equal(bankDegree((l) => l * 32), 32);
assert.equal(bankDegree(() => 5), 1, "a broadcast is one wavefront");
{
  const s = mmaSmemLayout("m16n8k8.tf32", { BM: 64, BN: 64, BK: 8 });
  assert.equal(s.ldA, 8 + s.padA);
  assert.ok(s.degA.every((d) => d === 1), `TF32 A fragment reads conflict-free with pad ${s.padA}: ${s.degA}`);
  assert.equal(s.padA, 4, "stride 8 has 2-way conflicts; 12 has none");
  const z = mmaSmemLayout("m16n8k16.f16", { BM: 64, BN: 64, BK: 16 });
  assert.ok(Math.max(...z.degA) <= 2 && Math.max(...z.degB) <= 2, `f16 fragment reads: A ${z.degA}, B ${z.degB}`);
  assert.equal(z.sizeA, 64 * z.ldA); assert.equal(z.sizeB, 16 * z.ldB);
}
const tbl = layoutTables("m16n8k16.bf16");
assert.equal(new Set(tbl.a).size, 16 * 16); assert.equal(new Set(tbl.c).size, 16 * 8);
console.log("mma layouts are bijections; the emulated atom computes A·B + C with exact products; unrepresentable operands are reported");
