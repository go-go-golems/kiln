// KILN-006 Phase 4: the cost model for MAP=mma. Without a measured tensor-core rate the default compile never
// picks mma; with A100-like rates (a test spec) the model picks it for a large TF32 product and not for a tiny
// one. The analytic counts agree with what the instrumented simulator measures on the same kernel, the tensor
// term appears only for tensor-core kernels, and predictedCost (the cost gate) sums mma kernels like any other.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf, simulateKernel } from "../src/std/program.js";
import { SPECS, target } from "../src/std/targets.js";
import { analyze, estimate, planOf, predictedCost, regsEstimate, timeModel } from "../src/std/tile.js";

const rated = target({ ...SPECS.a100, id: "a100-tensor-test", mma: { tf32: 156, f16: 312, bf16: 312 } });
const unrated = target(SPECS.a100);
const matmul = (n, m = n, kk = n) => k.trace(`mm${n}`, ({ a, b }) => ({ out: N.matmul(a, b) }), { a: k.tensor([n, kk]), b: k.tensor([kk, m]) });
const maps = (run) => programOf(run.graph).kernels.map((kn) => kn.map.MAP);
const contractionDecision = (run) => run.decisions.find((d) => d.knobs?.MAP === "mma" || d.knobs?.MAP === "tiled");

// ---------------------------------------------------------------- ranking
{
  const big = pipeline({ target: rated, matmulPrecision: "tf32" }).run(matmul(1024));
  assert.ok(big.ok, big.error?.message);
  const d = contractionDecision(big);
  assert.equal(d?.knobs.MAP, "mma", `1024³ TF32 with tensor rates: ${maps(big)}`);
  assert.equal(d.by, "model");
  const tiny = pipeline({ target: rated, matmulPrecision: "tf32" }).run(matmul(16));
  assert.ok(!maps(tiny).includes("mma"), `16³: ${maps(tiny)}`);
  for (const t of [unrated, target(SPECS.gb10)]) {
    const run = pipeline({ target: t, matmulPrecision: "tf32" }).run(matmul(1024));
    assert.ok(!maps(run).includes("mma"), `${t.id} has no measured tensor rate: ${maps(run)}`);
  }
  assert.ok(!maps(pipeline({ target: rated }).run(matmul(1024))).includes("mma"), "FP32 highest never uses tensor cores");
  // f16 storage: the f16 rate decides
  const f16 = k.trace("f16", ({ x, w }) => ({ out: N.cast(N.linear(N.cast(x, "f32"), N.cast(w, "f32")), "f16") }), { x: k.tensor([1024, 512], "f16"), w: k.tensor([768, 512], "f16") });
  assert.ok(maps(pipeline({ target: rated }).run(f16)).includes("mma"));
  // a pinned MAP=mma on a target without rates: the model still ranks the remaining knobs (FP32-peak prior)
  const pinned = pipeline({ target: unrated, matmulPrecision: "tf32" }).run(matmul(256), { params: { MAP: "mma" } });
  const pd = pinned.decisions.find((x) => x.knobs?.MAP === "mma");
  assert.ok(pd && pd.by === "pinned-partial" && /the rest by model/.test(pd.note), `${pd?.by}: ${pd?.note}`);
}
// ---------------------------------------------------------------- the analytic counts against the simulator
{
  const run = pipeline({ target: rated, matmulPrecision: "tf32" }).run(matmul(256, 320, 192), { params: { MAP: "mma", BM: 64, BN: 64, BK: 16, WM: 32, WN: 32 } });
  const kern = programOf(run.graph).kernels.find((x) => x.K.mma);
  const node = [...run.at("tile").nodes.values()].find((x) => x.attrs.map?.MAP === "mma");
  const an = analyze(node.attrs.expr, node.attrs.shape, node.attrs.inShapes);
  const e = estimate(an, node.attrs.map, rated, planOf(node, an));
  const s = simulateKernel(kern, rated, { blocks: kern.K.grid });
  assert.ok(s.check.ok, s.check.message);
  assert.equal(e.tensorFlops, 2 * 256 * 320 * 192);
  assert.equal(s.metrics.tensorFlops, e.tensorFlops, "the simulator counts the same tensor flops");
  assert.equal(s.metrics.smemWavefronts, e.smemWavefronts, "shared-memory wavefronts (tile stores + fragment reads, padded) match");
  const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));
  assert.ok(near(s.metrics.warpInstr, e.warpInstr, 0.05), `warp instructions ${e.warpInstr} vs simulated ${s.metrics.warpInstr}`);
  assert.ok(near(s.metrics.traffic, e.traffic, 0.25), `traffic ${e.traffic} vs simulated ${s.metrics.traffic}`);
  assert.equal(e.regs, regsEstimate(kern.map, 0, "m16n8k8.tf32"));
  assert.equal(regsEstimate({ MAP: "mma", WM: 32, WN: 32 }, 0, "m16n8k8.tf32"), 24 + 2 * 4 * 4 + 2 * 4 + 4 * 2);
  assert.equal(regsEstimate({ MAP: "mma", WM: 32, WN: 32 }, 0, "m16n8k16.f16"), 24 + 2 * 4 * 4 + 2 * 8 + 4 * 4);
  assert.ok("tensor" in e.parts && "tensor" in s.metrics.parts, "a tensor resource for tensor-core kernels");
  assert.ok(Math.abs(e.parts.tensor - s.metrics.parts.tensor) < 1e-9, "same tensor time from both counts");
  // the tensor term uses the target's rate, else the FP32 peak
  const c = { flops: 0, tensorFlops: 1e9, traffic: 0, dram: 0, smemWavefronts: 0, warpInstr: 0, threads: 128, blocks: 1080, smem: 0, regs: 32 };
  assert.ok(timeModel({ ...c, tensorTflops: 156 }, rated).parts.tensor < timeModel(c, rated).parts.tensor);
  // no tensor resource for CUDA-core kernels (their parts are unchanged)
  const tiled = estimate(an, { MAP: "tiled", TPB: 0, COARSEN: 1, STAGE: "none", BM: 64, BN: 64, BK: 16, TM: 4, TN: 4 }, rated);
  assert.ok(!("tensor" in tiled.parts));
  // predictedCost, the program-level cost gate, includes the mma kernel's estimate
  const kernels = [...run.at("tile").nodes.values()].filter((x) => x.name === "tile.kernel");
  const sum = kernels.reduce((a, x) => { const xa = analyze(x.attrs.expr, x.attrs.shape, x.attrs.inShapes); return a + estimate(xa, x.attrs.map, rated, planOf(x, xa)).us; }, 0);
  assert.ok(Number.isFinite(sum) && Math.abs(predictedCost(run.at("tile"), rated) - sum) < 1e-9);
  const tiledRun = pipeline({ target: rated, matmulPrecision: "tf32" }).run(matmul(256, 320, 192), { params: { MAP: "tiled" } });
  assert.notEqual(predictedCost(tiledRun.at("tile"), rated), predictedCost(run.at("tile"), rated));
  assert.throws(() => estimate(an, node.attrs.map, rated), /MAP=mma needs a tensor-core plan/);
}
console.log("mma cost model: unchanged defaults without rates, ranking with rates, counts agree with the simulator");
