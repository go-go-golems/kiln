// A float16/bfloat16 constant holds its value rounded to the dtype, as PyTorch's fill and cast round it.
// Coverage family 40 (DNLNet): x_bf16 /= torch.tensor(0.05, device="cuda") divides by bf16(0.05) =
// 0.050048828125 on CUDA; the importer narrows the 0-d CUDA operand (N.cast), and before this fix the
// folded cast kept 0.05 and the generated kernel divided by 0.05f.
import assert from "node:assert/strict";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { Tensor } from "../src/core/util.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { exportProgram } from "../src/std/export.js";
import { SPECS, target } from "../src/std/targets.js";

const g = k.trace("dnlnet", ({ x }) => ({ out: N.div(x, N.cast(N.full([], 0.05, "f32"), "bf16")), half: N.mul(N.cast(x, "f16"), N.full([], 0.3, "f16")) }), { x: k.tensor([4], "bf16") });
const x = new Tensor([4], Float32Array.of(1, 3, 0.1015625, -7));
const got = g.eval({ x });
const bf16Divisor = 0.050048828125;
for (let i = 0; i < 4; i++) {
  assert.equal(got.out.data[i], roundBf16(Math.fround(x.data[i] / bf16Divisor)), `bf16 quotient ${i}`);
}
function roundBf16(v) { const f = new Float32Array([v]), u = new Uint32Array(f.buffer); u[0] = (u[0] + 0x7fff + ((u[0] >> 16) & 1)) & 0xffff0000; return f[0]; }
const r = pipeline({ target: target(SPECS.a100) }).run(g), p = exportProgram(r, programOf(r.graph));
const source = p.kernels.map((kernel) => kernel.cuda ?? "").join("\n");
assert.match(source, /0\.050048828125f/, "the kernel divides by bfloat16's 0.05");
assert.doesNotMatch(source, /[^0-9]0\.05f/, "no unrounded 0.05f literal");
assert.match(source, /0\.30004882812[0-9]*f/, "the float16 splat holds float16's 0.3");
console.log("low-precision-constants: ok");
