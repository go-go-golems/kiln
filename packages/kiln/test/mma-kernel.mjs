// KILN-006 Phase 3: MAP=mma end to end on CPU. The schedule rule offers the tensor-core mapping exactly when
// mmaPlan accepts the contraction; pinned, the materializer (kernel.js matMma) writes Kernel IR whose simulation
// (warp-emulated mma atoms) agrees with the Loop IR reference for TF32, f16 and bf16 products, batched products,
// tile tails and fused epilogues. Refusals are exact and give reasons.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { E } from "../src/std/loop.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf, simulateKernel } from "../src/std/program.js";
import { SPECS, WEBGPU_DEFAULT, target } from "../src/std/targets.js";
import { analyze, mmaPlan, legalMaps, canonRow } from "../src/std/tile.js";
import { MMA_OPS } from "../src/std/mma.js";

const gb10 = target(SPECS.gb10);
const compile = (g, opts = {}, params = { MAP: "mma" }) => {
  const run = pipeline({ target: gb10, ...opts }).run(g, { params });
  assert.ok(run.ok, run.error?.message);
  return run;
};
const mmaKernels = (run) => programOf(run.graph).kernels.filter((kn) => kn.map.MAP === "mma");
const linear = (name, { M, K, Nn, dtype = "f32", epilogue = N.relu, bias = true }) => k.trace(name, ({ x, w, b }) => {
  const widen = (v) => (dtype === "f32" ? v : N.cast(v, "f32"));
  const y = epilogue(N.linear(widen(x), widen(w), bias ? widen(b) : undefined));
  return { out: dtype === "f32" ? y : N.cast(y, dtype) };
}, { x: k.tensor([M, K], dtype), w: k.tensor([Nn, K], dtype), b: k.tensor([Nn], dtype) });
const checkKernel = (kern, label) => {
  const r = simulateKernel(kern, gb10);
  assert.ok(r.check.ok && r.check.n > 0, `${label} [${kern.row}]: ${r.check.message}`);
  assert.ok(r.metrics.tensorFlops > 0, `${label}: the simulation ran tensor-core atoms`);
  return r;
};

// ---------------------------------------------------------------- TF32 linear + bias + relu (the guide's running example)
{
  const run = compile(linear("tf32-linear", { M: 512, K: 256, Nn: 384 }), { matmulPrecision: "tf32" });
  const [kern] = mmaKernels(run);
  assert.ok(kern, "the contraction kernel takes the pinned mma mapping");
  assert.equal(kern.K.mma.op, "m16n8k8.tf32"); assert.ok(Number.isInteger(kern.K.mma.a) && Number.isInteger(kern.K.mma.b), "both operands arrive rounded from producer kernels");
  assert.equal(programOf(run.graph).kernels.filter((kn) => kn.map.MAP !== "mma").length, 2, "the two round_tf32 kernels keep their maps (pin ignored there)");
  assert.ok(kern.cuda.includes('asm volatile("mma.sync.aligned.m16n8k8.row.col.f32.tf32.tf32.f32'), "CUDA carries inline PTX");
  assert.ok(!kern.cuda.includes("kiln_pack_"), "TF32 operands are passed as FP32 bit patterns");
  assert.equal(kern.wgsl, null);
  assert.match(kern.wgslUnavailable, /tensor-core mma \(m16n8k8\.tf32\) has no WGSL lowering/);
  checkKernel(kern, "tf32 linear");
  for (const mmaOrder of ["reverse", "pairwise", "chunk-rz"]) {
    const r = simulateKernel(kern, gb10, { mmaOrder });
    assert.ok(r.check.ok, `accumulation order ${mmaOrder} stays within tolerance: ${r.check.message}`);
  }
  // the printed Tile IR names the atom and the warp grid
  const tileText = run.at("tile").print();
  assert.match(tileText, /tensor cores: mma\.m16n8k8\.tf32 \(16×8×8, tf32 operands, f32 accumulate\)/);
  // a deliberately wrong check: drop the operand-format knowledge, so unrounded FP32 values reach the TF32 atoms
  const wrong = { ...kern, K: { ...kern.K, mma: undefined } };
  const bad = simulateKernel(wrong, gb10);
  assert.ok(!bad.check.ok && /not representable in tf32/.test(bad.check.message), bad.check.message);
}
// ---------------------------------------------------------------- explicit knobs, every warp-tile shape that fits
for (const knobs of [{ BM: 64, BN: 64, BK: 16, WM: 32, WN: 32 }, { BM: 32, BN: 64, BK: 8, WM: 16, WN: 64 }, { BM: 128, BN: 16, BK: 32, WM: 64, WN: 8 }]) {
  const run = compile(linear("tf32-knobs", { M: 96, K: 72, Nn: 80 }), { matmulPrecision: "tf32" }, { MAP: "mma", ...knobs });
  const [kern] = mmaKernels(run);
  assert.equal(kern.row, canonRow({ MAP: "mma", ...knobs }), "every knob honoured");
  assert.equal(kern.K.block, (knobs.BM / knobs.WM) * (knobs.BN / knobs.WN) * 32);
  checkKernel(kern, `tf32 ${kern.row}`);
}
// ---------------------------------------------------------------- f16 and bf16: packed operands, round-once epilogue
for (const dtype of ["f16", "bf16"]) {
  const run = compile(linear(`${dtype}-linear`, { M: 64, K: 48, Nn: 40, dtype }));
  const [kern] = mmaKernels(run);
  assert.ok(kern, `${dtype}: mma legal from storage dtype alone (no precision option)`);
  assert.equal(kern.K.mma.op, `m16n8k16.${dtype}`);
  assert.ok(kern.cuda.includes(`kiln_pack_${dtype}(`) && kern.cuda.includes(dtype === "f16" ? "#include <cuda_fp16.h>" : "#include <cuda_bf16.h>"));
  assert.ok(kern.cuda.includes(dtype === "f16" ? "__float2half_rn(" : "__float2bfloat16_rn("), "the epilogue stores in the storage dtype");
  checkKernel(kern, `${dtype} linear`);
}
// ---------------------------------------------------------------- batched matmul and tile tails
{
  const g = k.trace("bmm", ({ a, b }) => ({ out: N.matmul(a, b) }), { a: k.tensor([4, 96, 80]), b: k.tensor([4, 80, 72]) });
  const [kern] = mmaKernels(compile(g, { matmulPrecision: "tf32" }));
  assert.ok(kern && kern.K.grid % 4 === 0, "four batches of tiles");
  checkKernel(kern, "batched tf32 matmul");
  for (const dtype of ["f32", "f16"]) {
    const run = compile(linear(`tail-${dtype}`, { M: 33, K: 19, Nn: 17, dtype, epilogue: (y) => y }), dtype === "f32" ? { matmulPrecision: "tf32" } : {}, { MAP: "mma", BM: 32, BN: 16, BK: 16, WM: 16, WN: 8 });
    const [kt] = mmaKernels(run);
    assert.equal(kt.K.grid, 2 * 2, "ceil(33/32) × ceil(17/16) tiles");
    if (dtype === "f32") {
      // at this size fusion inlines the round_tf32 producers into the contraction: the tile loader rounds once per
      // staged element (mmaPlan aFns/bFns), and the kernel's inputs may hold any FP32 value
      assert.deepEqual([kt.K.mma.a, kt.K.mma.b], [null, null]);
      assert.ok(kt.cuda.includes("kiln_round_tf32(") && kt.cuda.includes("m16n8k8.row.col.f32.tf32"));
    }
    const r = simulateKernel(kt, gb10, { blocks: kt.K.grid });
    assert.ok(r.check.ok && r.check.n === Math.min(512, 33 * 17), `${dtype} tails: the sampled outputs (512 of the 561 written) are right (${r.check.n}): ${r.check.message}`);
  }
}
// ---------------------------------------------------------------- fused epilogues see the right m, n
{
  const gelu = linear("bias-gelu", { M: 48, K: 32, Nn: 24, epilogue: N.gelu });
  const [kern] = mmaKernels(compile(gelu, { matmulPrecision: "tf32" }));
  checkKernel(kern, "bias + gelu epilogue");
  const scaled = k.trace("scale-residual", ({ x, w, r }) => ({ out: N.add(N.mul(N.linear(x, w), 0.5), r) }), { x: k.tensor([40, 24]), w: k.tensor([32, 24]), r: k.tensor([40, 32]) });
  const [ks] = mmaKernels(compile(scaled, { matmulPrecision: "tf32" }));
  assert.ok(ks, "a residual epilogue (a load varying with both m and n) stays outside the contraction");
  checkKernel(ks, "scale + residual epilogue");
}

// ---------------------------------------------------------------- legality refusals
{
  // FP32 "highest": no producer rounds the operands
  const fp = compile(linear("fp32", { M: 64, K: 32, Nn: 32 }));
  assert.equal(mmaKernels(fp).length, 0, "no MAP=mma for FP32 operands");
  assert.ok(fp.warnings.some((w) => /MAP=mma are not offered/.test(w)));
  // a product pinned to "highest" under the tf32 option keeps FP32 operands
  const pinnedHighest = k.trace("highest", ({ a, b }) => ({ out: N.matmul(a, b, "highest") }), { a: k.tensor([32, 16]), b: k.tensor([16, 32]) });
  assert.equal(mmaKernels(compile(pinnedHighest, { matmulPrecision: "tf32" })).length, 0);
  // mixed f16 and bf16 operands
  const mixed = k.trace("mixed", ({ x, w }) => ({ out: N.linear(N.cast(x, "f32"), N.cast(w, "f32")) }), { x: k.tensor([32, 32], "f16"), w: k.tensor([32, 32], "bf16") });
  const mixedRun = pipeline({ target: gb10 }).run(mixed);
  const node = [...mixedRun.at("tile").nodes.values()].find((n) => n.name === "tile.kernel");
  const an = analyze(node.attrs.expr, node.attrs.shape, node.attrs.inShapes);
  assert.match(mmaPlan(an, node.attrs.inPrecisions, gb10).reason, /mixed operand precisions (f16, bf16|bf16, f16)/);
  // WebGPU and pre-Ampere targets
  const tfRun = pipeline({ target: gb10, matmulPrecision: "tf32" }).run(linear("t", { M: 256, K: 128, Nn: 192 }));
  const tnode = [...tfRun.at("tile").nodes.values()].find((n) => n.name === "tile.kernel" && n.attrs.inPrecisions.includes("tf32"));
  const tan = analyze(tnode.attrs.expr, tnode.attrs.shape, tnode.attrs.inShapes);
  assert.equal(mmaPlan(tan, tnode.attrs.inPrecisions, gb10).op, "m16n8k8.tf32");
  assert.match(mmaPlan(tan, tnode.attrs.inPrecisions, target(WEBGPU_DEFAULT)).reason, /target webgpu has no mma\.sync \(sm 0\)/);
  assert.match(mmaPlan(tan, tnode.attrs.inPrecisions, { id: "volta", sm: 70 }).reason, /sm 70/);
  assert.match(mmaPlan(tan, tnode.attrs.inPrecisions.map(() => "f32"), gb10).reason, /operand precision f32 has no tensor-core format/);
  assert.deepEqual(tnode.attrs.inPrecisions.filter((p) => p === "tf32").length, 2, "both operands come from round_tf32 producers; the bias does not");
  // bodies that are not a pure product sum, built directly in Loop IR: max reduction, mul(sub(a, c), b), a second multiply
  const r = "r_test", ld0 = E.load(0, ["a0", r]), ld1 = E.load(1, [r, "a1"]);
  const planOf = (expr) => mmaPlan(analyze(expr, [32, 16], [[32, 24], [24, 16]]), ["tf32", "tf32"], gb10);
  assert.equal(planOf(E.red("add", r, 24, E.op("mul", ld0, ld1))).op, "m16n8k8.tf32", "the pure product sum is legal");
  assert.equal(planOf(E.red("add", r, 24, E.op("mul", E.op("copy", ld0), E.op("copy", ld1)))).op, "m16n8k8.tf32", "copy is transparent");
  assert.match(planOf(E.red("max", r, 24, E.op("mul", ld0, ld1))).reason, /reduction max is not a sum/);
  assert.match(planOf(E.red("add", r, 24, E.op("mul", E.op("sub", ld0, E.num(0.5)), ld1))).reason, /not mul\(A, B\)/);
  assert.match(planOf(E.red("add", r, 24, E.op("mul", E.op("mul", ld0, ld1), ld1))).reason, /not mul\(A, B\)|one A and one B/);
  assert.match(planOf(E.red("add", r, 24, E.op("add", ld0, ld1))).reason, /not mul\(A, B\)/);
  assert.ok(!legalMaps(tan, { reason: "x" }).includes("mma") && legalMaps(tan, { op: "m16n8k8.tf32" }).includes("mma"));
}
// ---------------------------------------------------------------- the default compile and existing knob keys are unchanged
{
  const run = pipeline({ target: gb10, matmulPrecision: "tf32" }).run(linear("default", { M: 512, K: 256, Nn: 384 }));
  const kernels = programOf(run.graph).kernels;
  assert.ok(kernels.every((kn) => kn.map.MAP !== "mma"), "GB10's tensor rates are unmeasured: the model never picks mma by default");
  assert.ok(kernels.every((kn) => !("WM" in kn.map) && !("WN" in kn.map)), "non-mma options carry no WM/WN keys (evidence keys unchanged)");
  const sched = run.decisions.find((d) => d.knobs?.MAP === "tiled");
  assert.ok(sched, "the contraction is still tiled");
}
assert.equal(Object.keys(MMA_OPS).length, 3);
console.log("MAP=mma: TF32/f16/bf16 products, batches, tails and fused epilogues simulate correctly; refusals are exact");
