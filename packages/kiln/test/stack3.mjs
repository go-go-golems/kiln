import { k } from "../src/core/kiln.js";
import { Tensor, fmtUs } from "../src/core/util.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf, simulateKernel } from "../src/std/program.js";
import { canonRow } from "../src/std/tile.js";
import { SPECS, target } from "../src/std/targets.js";
const T5090 = target(SPECS.rtx5090);
const pipe = pipeline({ target: T5090 });
const progs = {
  rmsnorm: k.trace("rmsnorm", ({ x }) => N.rms_norm(x, N.weight("w", [2048]), { eps: 1e-6 }), { x: k.tensor([1, 32, 2048]) }),
  softmax: k.trace("softmax", ({ x }) => N.softmax(x), { x: k.tensor([28, 2048]) }),
  linear: k.trace("linear", ({ x }) => N.linear(x, N.weight("w", [512, 256])), { x: k.tensor([64, 256]) }),
  gelu: k.trace("gelu", ({ x }) => N.gelu(x), { x: k.tensor([32, 4096]) }),
  mlp: k.trace("mlp", ({ x }) => N.linear(N.silu(N.linear(x, N.weight("up", [512, 128]))), N.weight("down", [128, 512])), { x: k.tensor([32, 128]) }),
  rowsum: k.trace("rowsum", ({ x }) => N.sum(x, -1), { x: k.tensor([16, 1000]) }),
};
const mode = process.argv[2];
for (const [name, g] of Object.entries(progs)) {
  for (const pins of mode === "all" ? [{}, { MAP: "thread" }, { MAP: "row", STAGE: "none" }, { MAP: "row", STAGE: "all" }] : [{}]) {
    const r = pipe.run(g, { params: pins });
    if (!r.ok) { console.log(name, JSON.stringify(pins), "FAILED", r.error.message); process.exitCode = 1; continue; }
    const prog = programOf(r.graph);
    for (const kn of prog.kernels) {
      const t0 = performance.now();
      let res;
      try { res = simulateKernel(kn, T5090); } catch (e) { console.log(name, kn.name, "SIM ERROR", e.message); console.log(kn.K && e.stack.split("\n").slice(0,3).join("\n")); process.exitCode = 1; continue; }
      const m = res.metrics; if (!m.bound) { console.log(name, kn.name, kn.row, "INFEASIBLE", m.infeasible, "regs", m.regs, "floats", kn.K.floats.length); continue; }
      console.log(`${name.padEnd(8)} ${kn.name.padEnd(26)} ${kn.row.padEnd(40)} grid=${kn.K.grid} block=${kn.K.block} → ${fmtUs(m.us).padStart(9)} ${m.bound.padEnd(7)} occ=${(m.occupancy*100).toFixed(0)}% ld ${m.ldSectorsPerReq.toFixed(1)} sect/req, bank ${m.bankConflicts.toFixed(2)}  check: ${res.check.ok ? "ok" : "FAIL"} (${res.check.n}) ${res.check.ok ? "" : res.check.message}  [${(performance.now()-t0).toFixed(0)}ms]`);
      if (!res.check.ok) process.exitCode = 1;
    }
  }
}
