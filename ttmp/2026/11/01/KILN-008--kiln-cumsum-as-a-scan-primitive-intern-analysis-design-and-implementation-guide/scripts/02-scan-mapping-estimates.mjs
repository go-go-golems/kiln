// KILN-008 probe: for a cumsum of a given shape, axis and dtype, print every legal scan mapping the Tile IR
// fork can offer (before its TPB filter) with the analytic estimate, the option the pipeline chose, and (unless --no-sim) whether the
// SIMT simulator reproduces the chosen kernel and every row-map kernel against the Loop IR point reference.
// Run from the repository root:
//   node ttmp/.../scripts/02-scan-mapping-estimates.mjs <d0>x<d1>[x…] [axis] [dtype] [--no-sim]
import { k } from "../../../../../../packages/kiln/src/core/kiln.js";
import { N } from "../../../../../../packages/kiln/src/std/tensor.js";
import { pipeline } from "../../../../../../packages/kiln/src/std/emmy.js";
import { programOf, simulateKernel } from "../../../../../../packages/kiln/src/std/program.js";
import { SPECS, target } from "../../../../../../packages/kiln/src/std/targets.js";
import { analyze, estimate, canonRow } from "../../../../../../packages/kiln/src/std/tile.js";

const shape = (process.argv[2] ?? "8x512").split("x").map(Number);
const axis = Number(process.argv[3] ?? -1), dtype = process.argv[4] ?? "f32";
const sim = !process.argv.includes("--no-sim");
const t = target(SPECS.a100);
const g = k.trace("cs", ({ x }) => ({ out: N.cumsum(x, axis) }), { x: k.tensor(shape, dtype) });
const run = (params) => pipeline({ target: t }).run(g, params ? { params } : undefined);
const r = run();
if (r.error) { console.log("ERROR", r.error.message); process.exit(1); }
const chosen = programOf(r.graph).kernels.find((x) => x.name.includes("cumsum"));
const an = analyze(chosen.expr, chosen.shape, chosen.inShapes);
console.log(`cumsum ${shape.join("x")} axis=${axis} ${dtype}: rows=${an.scan.rows} n=${an.scan.n} chosen ${chosen.row}`);
const opts = [];
for (const MAP of ["thread", "row"]) for (const TPB of [32, 64, 128, 256, 512, 1024]) {
  const kn = { MAP, TPB, COARSEN: 1, STAGE: "none" };
  const e = estimate(an, kn, t);
  opts.push({ row: canonRow(kn), us: e.us, bound: e.bound });
}
for (const o of opts.sort((a, b) => a.us - b.us)) console.log(`  ${o.row.padEnd(22)} ${o.us.toFixed(2).padStart(9)} us  ${o.bound}`);
if (sim) {
  const s = simulateKernel(chosen, t);
  console.log(`sim chosen ok=${s.check.ok} n=${s.check.n} ${s.check.message ?? ""}`);
  for (const TPB of [32, 256, 1024]) {
    const rr = run({ MAP: "row", TPB });
    const kk = programOf(rr.graph).kernels.find((x) => x.name.includes("cumsum"));
    const q = simulateKernel(kk, t);
    console.log(`sim ${kk.row} ok=${q.check.ok} n=${q.check.n} ${q.check.message ?? ""}`);
  }
}
