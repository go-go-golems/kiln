// KILN-006 Phase 2: the warp-collective Kernel IR statement `mma`, written by hand, through every emitter:
// the simulator executes it with the atom emulation, CUDA renders inline PTX mma.sync with the right constraint
// list and packing helpers, WGSL refuses it, a partial warp and an unrepresentable operand are reported.
import assert from "node:assert/strict";
import * as IX from "../src/core/ix.js";
import { rng } from "../src/core/util.js";
import { KB, kx, printKernelBody } from "../src/std/kernel.js";
import { toCuda, toSim, toWgsl, wgslUnavailableReason, SimMetrics } from "../src/std/emit.js";
import { MMA_OPS, fragmentIx, atomReference, roundOperand } from "../src/std/mma.js";

const V = IX.V;
// two warps, warp w computes D_w = A_w·B_w + 0 for its own batch w; A_w row-major 16×k, B_w row-major k×8
function handwritten(opName, { guard = false } = {}) {
  const op = MMA_OPS[opName], kb = new KB();
  const lane = kb.int(V("tid").mod(32), "lane"), warp = kb.int(V("tid").div(32), "warp");
  const acc = [0, 1, 2, 3].map((i) => kb.let(kx.num(0), `c${i}`));
  const a = Array.from({ length: op.aElems }, (_, e) => { const [r, q] = fragmentIx(opName, "a", e, lane); return kb.load(0, warp.mul(op.m * op.k).add(r.mul(op.k)).add(q), `a${e}`); });
  const b = Array.from({ length: op.bElems }, (_, e) => { const [q, c] = fragmentIx(opName, "b", e, lane); return kb.load(1, warp.mul(op.k * op.n).add(q.mul(op.n)).add(c), `b${e}`); });
  if (guard) kb.if(V("tid").lt(48), () => kb.mma(opName, acc, a, b));
  else kb.mma(opName, acc, a, b);
  acc.forEach((n, i) => { const [r, c] = fragmentIx(opName, "c", i, lane); kb.store("out", warp.mul(op.m * op.n).add(r.mul(op.n)).add(c), kx.v(n)); });
  return {
    name: "mma_" + opName.replace(/\W/g, "_"), grid: 1, block: 64, smem: [], smemBytes: 0, body: kb.body, values: {},
    floats: [...kb.floats], ints: [...kb.ints].filter((v) => v !== "tid" && v !== "bid"),
    params: [{ name: "in0", size: 2 * op.m * op.k, shape: [2, op.m, op.k], role: "in", dtype: "f32" }, { name: "in1", size: 2 * op.k * op.n, shape: [2, op.k, op.n], role: "in", dtype: "f32" }, { name: "out", size: 2 * op.m * op.n, shape: [2, op.m, op.n], role: "out", dtype: "f32" }],
    map: {}, row: "handwritten",
  };
}
const r = rng(5);
for (const [opName, op] of Object.entries(MMA_OPS)) {
  const K = handwritten(opName);
  const A = Float32Array.from({ length: 2 * op.m * op.k }, () => roundOperand(r() * 2 - 1, op.operand));
  const B = Float32Array.from({ length: 2 * op.k * op.n }, () => roundOperand(r() * 2 - 1, op.operand));
  const out = new Float32Array(2 * op.m * op.n).fill(NaN);
  const M = new SimMetrics(K.block, out.length);
  toSim(K, { instrument: true })([A, B, out], [0], M);
  assert.deepEqual(M.badMmas, [], `${opName}: ${JSON.stringify(M.badMmas)}`);
  assert.equal(M.tensorFlops, 2 * 2 * op.m * op.n * op.k, "two atoms counted");
  for (let w = 0; w < 2; w++) {
    const D = atomReference(opName, A.subarray(w * op.m * op.k), B.subarray(w * op.k * op.n), new Float32Array(op.m * op.n));
    assert.deepEqual(Array.from(out.subarray(w * op.m * op.n, (w + 1) * op.m * op.n)), Array.from(D), `${opName}: warp ${w} wrote D = A·B`);
  }
  // non-instrumented run: a violation throws (no metrics to record it in)
  const bad = Float32Array.from(A); bad[3] = Math.fround(0.1);
  assert.throws(() => toSim(K)([bad, B, out], [0], null), /not representable in (tf32|f16|bf16)/);
  const Mb = new SimMetrics(K.block, out.length);
  toSim(K, { instrument: true })([bad, B, out], [0], Mb);
  assert.match(Mb.badMmas[0].message, new RegExp(`mma ${opName.replace(".", "\\.")} operand A`));
  // a guarded mma runs with a partial second warp (tid < 48): reported, not executed
  const G = handwritten(opName, { guard: true }), Mg = new SimMetrics(64, out.length);
  toSim(G, { instrument: true })([A, B, out], [0], Mg);
  assert.match(Mg.badMmas[0]?.message ?? "", /16 of 32 lanes active \(warp 1\)/);
  // CUDA: inline PTX with the op's string, 4 "+f" accumulators, aRegs + bRegs "r" operands
  const cuda = toCuda(K);
  assert.ok(cuda.includes(`asm volatile("${op.ptx} {%0,%1,%2,%3}, {%4,%5,%6,%7}, {%8,%9}, {%0,%1,%2,%3};\\n"`), cuda);
  assert.equal((cuda.match(/"\+f"\(c\d\)/g) || []).length, 4);
  assert.equal((cuda.match(/"r"\(/g) || []).length, op.aRegs + op.bRegs);
  if (op.operand === "tf32") {
    assert.ok(cuda.includes(`"r"(__float_as_uint(a0))`) && !cuda.includes("kiln_pack_") && !cuda.includes("cuda_fp16.h"));
  } else {
    assert.ok(cuda.includes(`"r"(kiln_pack_${op.operand}(a0, a1))`) && cuda.includes(`"r"(kiln_pack_${op.operand}(b2, b3))`));
    assert.ok(cuda.includes(`__device__ __forceinline__ unsigned kiln_pack_${op.operand}(float lo, float hi)`));
    assert.ok(cuda.includes(op.operand === "f16" ? "#include <cuda_fp16.h>" : "#include <cuda_bf16.h>"));
    assert.ok(cuda.includes(op.operand === "f16" ? "__floats2half2_rn(lo, hi)" : "__floats2bfloat162_rn(lo, hi)"));
  }
  assert.equal(cuda.match(/kiln_pack_\w+\(float lo/g)?.length ?? 0, op.operand === "tf32" ? 0 : 1, "the helper is defined once");
  // WGSL: refused by name
  assert.match(wgslUnavailableReason(K), new RegExp(`tensor-core mma \\(${opName.replace(".", "\\.")}\\) has no WGSL lowering`));
  assert.throws(() => toWgsl(K), /no WGSL lowering/);
  // the Kernel IR printer
  assert.ok(printKernelBody(K).includes(`mma.${opName} {c0, c1, c2, c3} += {a0,`), printKernelBody(K));
}
assert.throws(() => toSim(handwritten("m16n8k8.tf32"), { mmaOrder: "random" }), /accumulation order/);
console.log("the mma statement simulates as one emulated atom per warp, renders inline PTX, and is refused by WGSL");
