import { k } from "../src/core/kiln.js";
import { fmtUs } from "../src/core/util.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { SimDevice } from "../src/std/devices.js";
import { SPECS } from "../src/std/targets.js";
import { Store } from "../src/std/store.js";
import { tune, measureProgram } from "../src/std/tune.js";
import { programOf } from "../src/std/program.js";
const dev = new SimDevice(SPECS.rtx4090);
const store = new Store();
const pipe = pipeline({ target: dev.target, store });
const g = k.trace("mlp", ({ x }) => N.linear(N.silu(N.linear(x, N.weight("up", [256, 128]))), N.weight("down", [128, 256])), { x: k.tensor([64, 128]) });
const base = pipe.run(g, { ctx: { deviceId: dev.id } });
const m0 = await measureProgram(programOf(base.graph), dev, { store });
console.log("greedy (model):", fmtUs(m0.total), m0.kernels.map(r => `${r.kern.name} ${r.kern.row} ${fmtUs(r.us)}`));
for (const strategy of ["sweep", "spmcts"]) {
  const t0 = performance.now();
  const r = await tune({ pipeline: pipe, graph: g, device: dev, store, strategy, budget: 16 });
  console.log(strategy, "best", fmtUs(r.best.us), r.best.rows, `${r.history.length} programs measured in ${(performance.now()-t0).toFixed(0)} ms`, r.iterations ?? "");
}
const after = pipe.run(g, { ctx: { deviceId: dev.id } });
console.log("greedy with evidence:", after.decisions.map(d => `${d.node}: by ${d.by}`), "store rows", store.size);
const m1 = await measureProgram(programOf(after.graph), dev, {});
console.log("greedy (evidence):", fmtUs(m1.total));
