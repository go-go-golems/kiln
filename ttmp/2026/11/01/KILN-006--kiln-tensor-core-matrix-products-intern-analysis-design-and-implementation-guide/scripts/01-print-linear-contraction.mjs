// KILN-006 Step 3: print the Loop IR, contraction analysis and chosen schedule of a linear+bias+relu
// under FP32, TF32 and f16 operands. Run from the repository root: node <this file>
import { k } from "../../../../../../packages/kiln/src/core/kiln.js";
import { N } from "../../../../../../packages/kiln/src/std/tensor.js";
import { pipeline } from "../../../../../../packages/kiln/src/std/emmy.js";
import { programOf } from "../../../../../../packages/kiln/src/std/program.js";
import { analyze } from "../../../../../../packages/kiln/src/std/tile.js";
import { printE } from "../../../../../../packages/kiln/src/std/loop.js";
import { SPECS, target } from "../../../../../../packages/kiln/src/std/targets.js";
const M = 512, K = 256, Nn = 384;
const cases = {
  fp32: [k.tensor([M, K]), k.tensor([Nn, K]), k.tensor([Nn]), (x) => x, "highest"],
  tf32: [k.tensor([M, K]), k.tensor([Nn, K]), k.tensor([Nn]), (x) => x, "tf32"],
  f16: [k.tensor([M, K], "f16"), k.tensor([Nn, K], "f16"), k.tensor([Nn], "f16"), (x) => N.cast(x, "f32"), "highest"],
};
for (const [name, [xt, wt, bt, widen, precision]] of Object.entries(cases)) {
  const g = k.trace("lin_" + name, ({ x, w, b }) => {
    const y = N.relu(N.linear(widen(x), widen(w), widen(b)));
    return { out: name === "f16" ? N.cast(y, "f16") : y };
  }, { x: xt, w: wt, b: bt });
  const run = pipeline({ target: target(SPECS.gb10), matmulPrecision: precision }).run(g);
  if (!run.ok) { console.log(name, "FAILED", run.error?.message); continue; }
  for (const kern of programOf(run.graph).kernels) {
    const an = analyze(kern.expr, kern.shape, kern.inShapes);
    console.log(`--- ${name}: ${kern.name} row=${kern.row} inDtypes=${kern.inDtypes}`);
    console.log("expr:", printE(kern.expr));
    if (an.contraction) console.log("contraction:", { M: an.contraction.M, N: an.contraction.N, K: an.contraction.K, A: an.contraction.A.length, B: an.contraction.B.length, body: an.contraction.inC.map((x) => x.k === "op" ? x.fn : x.k).join(",") });
  }
}
