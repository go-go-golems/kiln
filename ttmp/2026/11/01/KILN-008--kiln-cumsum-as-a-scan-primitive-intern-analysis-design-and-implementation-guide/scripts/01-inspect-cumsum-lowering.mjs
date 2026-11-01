// KILN-008 probe: print the current cumsum lowering at every IR level, the cost model's choice and
// estimate per row length, and whether the CPU SIMT simulator reproduces the kernel.
// Run from the repository root: node ttmp/.../scripts/01-inspect-cumsum-lowering.mjs [rows] [n] [dtype] [-v] [--no-sim]
import { k } from "../../../../../../packages/kiln/src/core/kiln.js";
import { N } from "../../../../../../packages/kiln/src/std/tensor.js";
import { pipeline } from "../../../../../../packages/kiln/src/std/emmy.js";
import { programOf, simulateKernel } from "../../../../../../packages/kiln/src/std/program.js";
import { SPECS, target } from "../../../../../../packages/kiln/src/std/targets.js";
import { analyze, estimate } from "../../../../../../packages/kiln/src/std/tile.js";

const [rows, n, dtype] = [Number(process.argv[2] ?? 2), Number(process.argv[3] ?? 4), process.argv[4] ?? "f32"];
const verbose = process.argv.includes("-v");
const t = target(SPECS.a100);
const pipe = pipeline({ target: t });
const g = k.trace("cs", ({ x }) => ({ out: N.cumsum(x, -1) }), { x: k.tensor([rows, n], dtype) });
const r = pipe.run(g);
if (r.error) { console.log("ERROR", r.error.message); process.exit(1); }
for (const ir of ["tensor", "loop", "tile", "kernel"]) if (verbose || ir !== "kernel") { console.log(`==== ${ir}`); console.log(r.at(ir).print({ bodies: true }) ?? String(r.at(ir))); }
const prog = programOf(r.graph);
for (const kern of prog.kernels) {
  const an = analyze(kern.expr, kern.shape, kern.inShapes);
  const est = estimate(an, kern.map, t);
  console.log(`==== kernel ${kern.name} map=${kern.row} grid=${kern.K.grid} block=${kern.K.block} model=${est.us.toFixed(2)}us flops=${est.flops} bound=${est.bound}`);
  if (verbose) console.log(kern.cuda);
  if (process.argv.includes("--no-sim")) continue;
  try { const s = simulateKernel(kern, t); console.log(`sim check ok=${s.check.ok} n=${s.check.n} ${s.check.message ?? ""}`); }
  catch (e) { console.log(`sim FAILED: ${e.constructor.name}: ${e.message.split("\n")[0]}`); }
}
