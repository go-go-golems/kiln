// Causal-mask MAP=flash kernels from the integration tree, in the 04-export-flash-kernels format, for NVRTC/ptxas.
import { writeFileSync, readFileSync } from "node:fs";
const W = process.cwd() + "/packages/kiln/src";
const { k } = await import(W + "/core/kiln.js");
const { N } = await import(W + "/std/tensor.js");
const { pipeline } = await import(W + "/std/emmy.js");
const { programOf } = await import(W + "/std/program.js");
const { SPECS, target } = await import(W + "/std/targets.js");
const out = JSON.parse(readFileSync(process.argv[2], "utf8"));
for (const [L, S, dtype] of [[7, 7, "f32"], [128, 128, "f32"], [64, 96, "bf16"], [96, 64, "f16"]]) {
  const c = (x) => N.cast(x, "f32");
  const g = k.trace("c", ({ q, kk, v }) => ({ out: N.cast(N.matmul(N.safeSoftmax(N.select(N.causalMask(L, S), N.mul(N.matmul(c(q), N.transpose(c(kk), -2, -1), "highest"), 0.125), -Infinity), -1), c(v), "highest"), dtype) }),
    { q: k.tensor([1, 2, L, 64], dtype), kk: k.tensor([1, 2, S, 64], dtype), v: k.tensor([1, 2, S, 64], dtype) });
  const run = pipeline({ target: target(SPECS.gb10), contraction: "separate", attention: "fused" }).run(g, { params: { MAP: "flash" } });
  if (!run.ok) throw new Error(`causal ${L}x${S} ${dtype}: ${run.error?.message}`);
  const kn = programOf(run.graph).kernels.find((x) => x.map.MAP === "flash");
  if (!kn) throw new Error(`causal ${L}x${S} ${dtype}: no flash kernel`);
  out.push({ preset: `${dtype}/causal/separate/L${L}S${S}D64`, name: kn.name, row: kn.row, cuda: kn.cuda });
}
writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(out.length, "kernels");
