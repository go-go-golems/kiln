// Round-trip fixtures for the launchers: each case is a kiln-program/1 export plus its expected outputs, computed by
// the frontend graph's reference evaluator on deterministic inputs. Both launcher tests (WebGPU in headless Chrome,
// Python over wgpu or CUDA) regenerate the same inputs from `gen` and compare against these values.
//
//   node runtime/test/fixtures.mjs <dir>     writes <case>.program.json and <case>.expect.json per case
//
// Inputs: element i of an input with seed s is h = (i·2654435761 + s·40503) mod 2³²; an f32 input holds
// (h mod 2001) / 1000 − 1 rounded to fp32, a u8 input holds h mod 256. The formula is integer-exact in JavaScript and
// NumPy, so neither side needs a shared random generator or input files.
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { params as paramSet } from "../../packages/kiln/src/core/kiln.js";
import { Tensor, numel } from "../../packages/kiln/src/core/util.js";
import { WEBGPU_DEFAULT, target as mkTarget } from "../../packages/kiln/src/std/targets.js";
import { exportProgram } from "../../packages/kiln/src/std/export.js";
import { sampleIndices } from "../../packages/kiln/src/std/program.js";
import { compileScript } from "../../apps/workbench/src/compile.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const preset = (id) => readFileSync(join(ROOT, "apps/workbench/presets", readdirSync(join(ROOT, "apps/workbench/presets")).find((n) => n.startsWith(id + "-") && n.endsWith(".js"))), "utf8");

export const GREY_SCRIPT = `// factory-videos' grey conversion from u8 RGB: (9798R + 19235G + 3735B + 16384) >> 15
const H = param.int("height", { min: 8, max: 4320, default: 48 });
const W = param.int("width", { min: 8, max: 7680, default: 64 });
project("grey")
  .params(H, W)
  .program(({ rgb }, { param }) => {
    const h = param(H), w = param(W), ch = (c) => N.reshape(N.slice(rgb, 2, c, c + 1), [h, w]);
    const s = N.add(N.add(N.add(N.mul(ch(0), 9798), N.mul(ch(1), 19235)), N.mul(ch(2), 3735)), 16384);
    return { grey: N.floor(N.mul(s, 1 / 32768)) };
  }, ({ param }) => ({ rgb: k.tensor([param(H), param(W), 3], "u8") }));
`;

export const CASES = [
  { id: "blur-small", text: () => preset("W-12"), pins: { height: 64, width: 96, radius: 1 }, why: "one kernel, one f32 input" },
  { id: "blur-2d-grid", text: () => preset("W-12"), pins: { height: 4096, width: 4096, radius: 1 }, why: "131,072 workgroups: the dispatch folds into two dimensions" },
  { id: "attention", text: () => preset("W-10"), pins: { heads: 2, seq: 32, d_head: 16 }, why: "three kernels chained through intermediate buffers" },
  { id: "mlp", text: () => preset("W-09"), pins: { tokens: 16, dim: 64, hidden: 128, act: "gelu" }, why: "weights exported as data constants" },
  { id: "grey-u8", text: () => GREY_SCRIPT, pins: { height: 48, width: 64 }, why: "an 8-bit input packed four to a word" },
];

/** The deterministic input values (see the header); `n` elements of `dtype` for seed `seed`. */
export function gen(dtype, n, seed) {
  const out = dtype === "u8" ? new Uint8Array(n) : new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const h = (Math.imul(i, 2654435761 | 0) + seed * 40503) >>> 0;
    out[i] = dtype === "u8" ? h % 256 : (h % 2001) / 1000 - 1;
  }
  return out;
}

export function buildCase(c) {
  const comp = compileScript(c.text(), { params: paramSet([]), target: mkTarget(WEBGPU_DEFAULT), pins: c.pins });
  if (!comp.ok || !comp.prog) throw new Error(`${c.id}: ${comp.diags.map((d) => d.message).join("; ")}`);
  const program = exportProgram(comp.run, comp.prog, { name: c.id, params: c.pins, target: mkTarget(WEBGPU_DEFAULT) });
  const seeds = Object.fromEntries(program.inputs.map((t, j) => [t.name, 11 + j]));
  const ins = Object.fromEntries(program.inputs.map((t) => [t.name, new Tensor(t.shape, Float32Array.from(gen(t.dtype, numel(t.shape), seeds[t.name])))]));
  const want = comp.graph.eval(ins);
  const expect = {};
  for (const o of program.outputs) {
    const d = want[o.name].data, idx = d.length <= 65536 ? [...d.keys()] : sampleIndices(d.length, 4096);
    expect[o.name] = { indices: idx, values: idx.map((i) => d[i]) };
  }
  return { program, expect: { case: c.id, why: c.why, seeds, expect } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2];
  if (!dir) { console.error("usage: node runtime/test/fixtures.mjs <dir>"); process.exit(2); }
  mkdirSync(dir, { recursive: true });
  for (const c of CASES) {
    const t0 = performance.now(), { program, expect } = buildCase(c);
    writeFileSync(join(dir, `${c.id}.program.json`), JSON.stringify(program));
    writeFileSync(join(dir, `${c.id}.expect.json`), JSON.stringify(expect));
    console.log(`${c.id.padEnd(14)} ${program.kernels.length} kernel(s) ${program.buffers.length} buffers  ${(performance.now() - t0).toFixed(0)} ms  — ${c.why}`);
  }
}
