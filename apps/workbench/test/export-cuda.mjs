// Export the CUDA of every preset's kernels, plus alternative schedules (the model's top options at every
// fork), for compiling with NVRTC + ptxas (test/cuda_check.py) or a real nvcc.
import { wb } from "../src/ui/wb.js";
import { knobs as KN } from "@kiln/kiln/core/kiln.js";
import { writeFileSync } from "node:fs";
import { analyze, estimate } from "@kiln/kiln/std/tile.js";
const out = new Map();
const add = (id) => { for (const kn of wb.prog?.kernels || []) out.set(kn.cuda, { preset: id, name: kn.name, row: kn.row, grid: kn.K.grid, block: kn.K.block, smem: kn.K.smemBytes, cuda: kn.cuda, inputs: kn.inShapes.length }); };
for (const p of wb.presets) {
  await wb.load(p.id);
  if (!wb.prog) continue;
  add(p.id);
  const ds = wb.run.decisions.filter((d) => d.rule === "schedule");
  for (const d of ds) {
    const g = wb.run.at("loop"), n = g.nodes.get(d.node);
    const an = analyze(n.attrs.expr, n.attrs.shape, n.args.map((a) => g.nodes.get(a).type.shape));
    const ranked = d.options.map((o) => ({ o, us: estimate(an, o.knobs, wb.device.target).us })).filter((x) => isFinite(x.us)).sort((a, b) => a.us - b.us);
    const picks = [...ranked.slice(0, 3), ...ranked.filter((x) => x.o.knobs.MAP === "thread").slice(0, 1), ...ranked.filter((x) => x.o.knobs.MAP === "row").slice(0, 2), ...ranked.filter((x) => x.o.knobs.MAP === "tiled").slice(0, 2)];
    for (const x of picks) { wb.kernelPins = { [d.key]: KN.canonical(x.o.knobs) }; wb.compile(); add(p.id); }
    wb.kernelPins = {};
  }
}
writeFileSync(process.argv[2] || "/tmp/kiln-kernels.json", JSON.stringify([...out.values()]));
console.log(`${out.size} distinct kernels`);
