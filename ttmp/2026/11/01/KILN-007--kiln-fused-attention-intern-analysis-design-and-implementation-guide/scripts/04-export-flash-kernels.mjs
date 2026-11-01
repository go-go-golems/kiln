// KILN-007: compile a matrix of attention variants, fused into one kernel, with MAP=flash pinned, and write every
// flash kernel's CUDA source as JSON ([{ preset, name, row, cuda }]) for an NVRTC compile check (05-nvrtc-compile.py).
// Variants: dtype f32/f16/bf16, mask additive/bool/none/broadcast, contraction separate/allow, ragged and
// BERT-like shapes, D = 64 and 128; every legal (BR, BC, TPB) option on gb10 for two of them.
// Usage (from the worktree root): node ttmp/2026/11/01/KILN-007--*/scripts/04-export-flash-kernels.mjs out.json
import { writeFileSync } from "node:fs";
import { k } from "../../../../../../packages/kiln/src/core/kiln.js";
import { N } from "../../../../../../packages/kiln/src/std/tensor.js";
import { pipeline } from "../../../../../../packages/kiln/src/std/emmy.js";
import { createFusionRule } from "../../../../../../packages/kiln/src/std/loop.js";
import { programOf } from "../../../../../../packages/kiln/src/std/program.js";
import { analyze } from "../../../../../../packages/kiln/src/std/tile.js";
import { flashOptions } from "../../../../../../packages/kiln/src/std/flash.js";
import { SPECS, target } from "../../../../../../packages/kiln/src/std/targets.js";
const t = target(SPECS.gb10);
// forced (unguarded) fusion: one kernel even where the attention pass's cost gate would keep the composed path
const unguarded = k.pass("loop/fusion").short("f").rules(createFusionRule({ decide: () => true })).order("reverse");
const pipe = (contraction) => pipeline({ target: t, contraction }).replace("loop/fusion", unguarded);
function graph({ B = 1, H = 2, L, S, D, mask = "add", maskShape = null, dtype = "f32" }) {
  const shapes = { q: k.tensor([B, H, L, D], dtype), kk: k.tensor([B, H, S, D], dtype), v: k.tensor([B, H, S, D], dtype) };
  if (mask !== "none") shapes.mask = k.tensor(maskShape || [B, 1, L, S], mask === "bool" ? "bool" : dtype);
  return k.trace("attention", ({ q, kk, v, mask: m }) => {
    const c = (x) => N.cast(x, "f32");
    let s = N.mul(N.matmul(c(q), N.transpose(c(kk), -2, -1), "highest"), 1 / Math.sqrt(D));
    if (mask === "add") s = N.add(s, c(m));
    if (mask === "bool") s = N.select(m, s, -Infinity);
    return { out: N.cast(N.matmul(N.softmax(s, -1), c(v), "highest"), dtype) };
  }, shapes);
}
const cases = [
  { L: 512, S: 512, D: 64, all: true }, { L: 13, S: 21, D: 24, all: true }, { L: 128, S: 128, D: 128 },
  { L: 512, S: 512, D: 64, dtype: "f16" }, { L: 512, S: 512, D: 64, dtype: "bf16" }, { L: 64, S: 64, D: 64, mask: "bool" },
  { L: 64, S: 64, D: 64, mask: "bool", dtype: "f16" }, { L: 64, S: 64, D: 64, mask: "none" }, { L: 64, S: 80, D: 64, maskShape: [1, 2, 64, 80] },
  { L: 64, S: 64, D: 64, contraction: "allow" },
];
const out = [];
for (const c of cases) {
  const g = graph(c);
  const contraction = c.contraction || "separate";
  const base = pipe(contraction).run(g, { params: { MAP: "flash" } });
  if (!base.ok) throw base.error;
  const lk = [...base.at("tile").nodes.values()].find((n) => n.name === "tile.kernel" && n.attrs.map.MAP === "flash")
    || [...base.at("tile").nodes.values()].find((n) => n.name === "tile.kernel" && analyze(n.attrs.expr, n.attrs.shape, n.attrs.inShapes).attention);
  const att = analyze(lk.attrs.expr, lk.attrs.shape, lk.attrs.inShapes).attention;
  const opts = c.all ? flashOptions(att, t) : [null];
  for (const o of opts) {
    const run = o ? pipe(contraction).run(g, { params: { MAP: "flash", ...o } }) : base;
    if (!run.ok) throw run.error;
    for (const kern of programOf(run.graph).kernels) if (kern.map.MAP === "flash")
      out.push({ preset: `${c.dtype || "f32"}/${c.mask || "add"}/${contraction}/L${c.L}S${c.S}D${c.D}`, name: kern.name, row: kern.row, cuda: kern.cuda });
  }
}
writeFileSync(process.argv[2] || "flash-kernels.json", JSON.stringify(out, null, 1));
console.log(`${out.length} flash kernels from ${cases.length} variants`);
