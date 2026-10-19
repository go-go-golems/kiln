import { k } from "../src/core/kiln.js";
import { Tensor } from "../src/core/util.js";
import { nn, N, tensor, decomposition, optimization } from "../src/std/tensor.js";
import { loop, lift, fuse, stamp } from "../src/std/loop.js";
import { tile, tilePass, costPrior, canonRow } from "../src/std/tile.js";
import { SPECS, target } from "../src/std/targets.js";
const pipe = k.pipeline("upper").pass(decomposition).pass(optimization).pass(lift).pass(fuse).pass(stamp).ir("loop",{dialects:[loop,tensor]}).pass(tilePass).ir("tile", { dialects: [tile, tensor], strict: true })
  .target(target(SPECS.rtx5090)).decide(k.decide.chain(k.decide.pinned(), costPrior, k.decide.first())).build();
const progs = {
  rmsnorm: k.trace("rmsnorm", ({ x }) => N.rms_norm(x, N.weight("w", [2048]), { eps: 1e-6 }), { x: k.tensor([1, 32, 2048]) }),
  softmax: k.trace("softmax", ({ x }) => N.softmax(x), { x: k.tensor([28, 2048]) }),
  linear: k.trace("linear", ({ x }) => N.linear(x, N.weight("w", [3584, 3584])), { x: k.tensor([128, 3584]) }),
  gelu: k.trace("gelu", ({ x }) => N.gelu(x), { x: k.tensor([32, 18944]) }),
};
for (const [name, g] of Object.entries(progs)) {
  const t0 = performance.now();
  const r = pipe.run(g);
  if (!r.ok) { console.log(name, "FAILED", r.error.message); continue; }
  console.log(`== ${name} (${(performance.now()-t0).toFixed(0)} ms)`);
  for (const d of r.decisions) { const sc = d.options.filter(o=>o.score!=null && isFinite(o.score)).sort((a,b)=>a.score-b.score); console.log(`  ${d.rule}@${d.node}: ${d.size} options, by ${d.by} → ${canonRow(d.knobs)} est ${d.score?.toFixed(1)}µs; worst ${sc.at(-1)?.score.toFixed(1)}µs (${canonRow(sc.at(-1)?.knobs||{})})`); }
  for (const kn of r.graph.findAll("tile.kernel")) console.log(r.graph.printNode(kn.id).split("\n").slice(0, 30).join("\n"));
}
