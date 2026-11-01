// Evaluate an imported Kiln project script on given inputs, for numerical tests against PyTorch.
// stdin: { script, inputs: { name: { shape, dtype, data: [numbers] } }, attention?: "composed" | "fused" }
// stdout: { frontend: { name: [numbers] }, loop: { ... }, attention_kernels } — the frontend reference and the
// compiled Loop IR (a100 target, separate contraction, FP32 products: CPU PyTorch does not use TF32) on the
// same inputs, and how many Loop IR kernels are recognized softmax contractions (KILN-007).
import { readFileSync } from "node:fs";
import { runScript } from "../../packages/kiln/src/core/script.js";
import { Tensor } from "../../packages/kiln/src/core/util.js";
import { SPECS, target } from "../../packages/kiln/src/std/targets.js";
import { compileScript } from "../../apps/workbench/src/compile.js";
import { params as paramSet } from "../../packages/kiln/src/core/kiln.js";
import { matchSoftmaxContraction } from "../../packages/kiln/src/std/attention.js";

const STORAGE = { f32: Float32Array, f16: Float32Array, bf16: Float32Array, i64: BigInt64Array, i32: Int32Array, bool: Uint8Array };
const request = JSON.parse(readFileSync(0, "utf8"));
const res = runScript(request.script);
if (!res.ok) { process.stdout.write(JSON.stringify({ error: res.diags.map((d) => d.message).join("; ") })); process.exit(0); }
const inputs = Object.fromEntries(Object.entries(request.inputs).map(([name, t]) => {
  const Storage = STORAGE[t.dtype];
  return [name, new Tensor(t.shape, Storage === BigInt64Array ? BigInt64Array.from(t.data.map(BigInt)) : Storage.from(t.data), t.dtype)];
}));
const plain = (outs) => Object.fromEntries(Object.entries(outs).map(([n, t]) => [n, [...t.data].map(Number)]));
const frontend = plain(res.project.graph().eval(inputs));
const c = compileScript(request.script, { params: paramSet([]), target: target(SPECS.a100), contraction: "separate", matmulPrecision: "highest", attention: request.attention ?? "composed" });
const loop = c.ok ? plain(c.run.at("loop").eval(inputs)) : null;
const lg = c.ok ? c.run.at("loop") : null;
const attention_kernels = lg ? [...lg.nodes.values()].filter((n) => n.name === "loop.kernel" && matchSoftmaxContraction(n.attrs.expr, n.attrs.shape, n.args.map((id) => lg.nodes.get(id).type.shape))).length : null;
process.stdout.write(JSON.stringify({ frontend, loop, attention_kernels, error: c.ok ? null : c.diags.map((d) => d.message).join("; ") }));
