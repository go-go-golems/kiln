// Print each kernel's reads/writes for small mutation programs, with the mutated input's buffer marked, to see
// which launches read the original input after its producer (the launch-order question of KILN-009).
// usage (from the repository root): node ttmp/.../scripts/04-kernel-reads-of-mutated-input.mjs
import { k } from "../../../../../../packages/kiln/src/core/kiln.js";
import { N } from "../../../../../../packages/kiln/src/std/tensor.js";
import { pipeline } from "../../../../../../packages/kiln/src/std/emmy.js";
import { programOf } from "../../../../../../packages/kiln/src/std/program.js";
import { exportProgram } from "../../../../../../packages/kiln/src/std/export.js";
import { SPECS, target } from "../../../../../../packages/kiln/src/std/targets.js";
const pipe = pipeline({ target: target(SPECS.rtx5090) });
const cases = {
  "relu_ then mean (export test)": [({ x }) => ({ y: N.mean(N.relu(x), -1), __mut0: N.relu(x) }), { x: k.tensor([4, 8]) }],
  "x += y, out = x * 2": [({ x, y }) => { const s = N.add(x, y); return { out: N.mul(s, 2), __mut0: s }; }, { x: k.tensor([4, 8]), y: k.tensor([4, 8]) }],
  "x += y, out = softmax(x)": [({ x, y }) => { const s = N.add(x, y); return { out: N.softmax(s), __mut0: s }; }, { x: k.tensor([4, 8]), y: k.tensor([4, 8]) }],
  "x <- x - mean(x)": [({ x }) => { const s = N.sub(x, N.mean(x, -1, true)); return { __mut0: s }; }, { x: k.tensor([4, 8]) }],
};
for (const [label, [fn, inputs]] of Object.entries(cases)) {
  const r = pipe.run(k.trace("m", fn, inputs)), p = exportProgram(r, programOf(r.graph), { mutations: { __mut0: "x" } });
  const x = p.inputs.find((i) => i.name === "x").buffer;
  console.log(`\n# ${label}  (x is buffer ${x})`);
  p.kernels.forEach((kn, i) => console.log(`  ${i} ${kn.name.slice(0, 40).padEnd(40)} ${kn.row.padEnd(14)} reads [${kn.reads.map((b) => (b === x ? `*${b}` : b)).join(",")}] writes ${kn.writes === x ? `*${kn.writes}` : kn.writes}`));
  console.log(`  outputs: ${p.outputs.map((o) => `${o.name}->${o.buffer}`).join(" ")}`);
}
