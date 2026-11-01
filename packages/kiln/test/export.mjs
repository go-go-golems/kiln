// kiln-program/1: kernels in launch order with their buffers, data constants inline, and every exported kernel
// named by its emitted name plus its identity, in the CUDA entry symbol as well as the record.
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { programOf } from "../src/std/program.js";
import { exportProgram, exportedName, PROGRAM_FORMAT } from "../src/std/export.js";
import { SPECS, target } from "../src/std/targets.js";

const pipe = pipeline({ target: target(SPECS.rtx5090) });
let failed = 0;
const check = (ok, what) => { console.log(`${ok ? "ok  " : "FAIL"} ${what}`); if (!ok) failed++; };
const exp = (g, opts) => { const r = pipe.run(g); return exportProgram(r, programOf(r.graph), opts); };

// three kernels chained through intermediates
{
  const g = k.trace("attention", ({ q, kk, v }) => N.matmul(N.softmax(N.mul(N.matmul(q, N.transpose(kk)), 0.125)), v), { q: k.tensor([2, 32, 16]), kk: k.tensor([2, 32, 16]), v: k.tensor([2, 32, 16]) });
  const r = pipe.run(g), prog = programOf(r.graph), p = exportProgram(r, prog, { params: { seq: 32 } });
  check(p.format === PROGRAM_FORMAT && p.codegen === "kiln-codegen/3", `format ${p.format}, codegen ${p.codegen}`);
  check(p.inputs.map((t) => `${t.name}:${t.buffer}`).join(" ") === "q:0 kk:1 v:2", `inputs take the first buffers: ${p.inputs.map((t) => `${t.name}:${t.buffer}`).join(" ")}`);
  check(p.kernels.length === 3 && p.buffers.length === 6, `${p.kernels.length} kernels, ${p.buffers.length} buffers`);
  const written = new Set(p.inputs.map((t) => t.buffer));
  const ordered = p.kernels.every((kn) => { const ok = kn.reads.every((b) => written.has(b)); written.add(kn.writes); return ok; });
  check(ordered, "every kernel reads only inputs and buffers written before it (launch order)");
  check(p.outputs.length === 1 && p.outputs[0].buffer === p.kernels.at(-1).writes, "the output is the last kernel's buffer");
  for (const [i, kn] of p.kernels.entries()) {
    const want = `${prog.kernels[i].K.name.replace(/[^\w]/g, "_")}__${prog.kernels[i].identity}`;
    check(kn.name === want && kn.name === exportedName(prog.kernels[i]), `kernel ${i} is named ${kn.name}`);
    check(new RegExp(`__global__ void __launch_bounds__\\(\\d+\\) ${kn.name}\\(`).test(kn.cuda), `kernel ${i}: the CUDA entry symbol carries the identity`);
    check(kn.cuda.replace(kn.name, prog.kernels[i].K.name.replace(/[^\w]/g, "_")) === prog.kernels[i].cuda, `kernel ${i}: the CUDA is otherwise the measured source`);
    check(kn.wgsl === prog.kernels[i].wgsl, `kernel ${i}: the WGSL is the measured source`);
    check(kn.dispatch[0] === Math.min(kn.grid, 65535) && kn.dispatch[1] === Math.ceil(kn.grid / 65535), `kernel ${i}: dispatch ${kn.dispatch.join("×")} for grid ${kn.grid}`);
  }
}

// weights become data constants whose bytes are the weight's fp32 values
{
  const g = k.trace("lin", ({ x }) => N.linear(x, N.weight("w", [8, 4])), { x: k.tensor([3, 4]) });
  const p = exp(g);
  const c = p.buffers.find((b) => b.data);
  const bytes = Uint8Array.from(atob(c.data), (ch) => ch.charCodeAt(0));
  const vals = new Float32Array(bytes.buffer);
  const ref = g.nodes.get([...g.nodes.keys()].find((id) => g.nodes.get(id).attrs?.name === "w")).attrs.data.data;
  check(c.name === "w" && c.elements === 32 && vals.length === 32 && vals.every((v, i) => v === Math.fround(ref[i])), `weight w exported as ${c.elements} fp32 values`);
}

// u8 inputs: buffer bytes round up to whole words
{
  const g = k.trace("bytes", ({ b }) => N.mul(b, 2), { b: k.tensor([5, 3], "u8") });
  const p = exp(g);
  check(p.inputs[0].dtype === "u8" && p.buffers[0].dtype === "u8" && p.buffers[0].bytes === 16, `a 15-element u8 input takes ${p.buffers[0].bytes} bytes`);
}

// an output that is no buffer at all cannot be exported, and says so
{
  const g = k.trace("ident", ({ x }) => N.mul(x, 2), { x: k.tensor([4]) });
  const r = pipe.run(g), prog = programOf(r.graph);
  const broken = { ...r, graph: { ...r.graph, inputs: r.graph.inputs, outputs: [{ name: "y", id: "nowhere" }], nodes: r.graph.nodes } };
  let msg = null;
  try { exportProgram(broken, prog); } catch (e) { msg = e.message; }
  check(/output y is missing/.test(msg || ""), `a dangling output is refused: ${msg}`);
}

// buffers past 32-bit CUDA index range are refused rather than emitted with overflowing int offsets
{
  const g = k.trace("huge", ({ x }) => N.relu(x), { x: k.tensor([65536, 32769]) });
  let msg = null;
  try { exp(g); } catch (e) { msg = e.message; }
  check(/32-bit/.test(msg || ""), `a 2^31-element buffer is refused: ${msg}`);
}

// a row-mapped kernel derives offsets from blockIdx only: more than 2^31 launched threads is legal
// (PassBench task 32's 1x1 convolution: 2^26 output rows x 32 lanes ran correctly on the GPU)
{
  const a100 = pipeline({ target: target(SPECS.a100) });
  const g = k.trace("rows", ({ x, w, b }) => N.reshape(N.conv2d(x, w, b, { stride: [1, 1], padding: [0, 0], dilation: [1, 1], groups: 1 }), [64, 256, 4096]),
    { x: k.tensor([64, 512, 64, 64], "bf16"), w: k.tensor([256, 512, 1, 1], "bf16"), b: k.tensor([256], "bf16") });
  const r = a100.run(g);
  let p = null, msg = null;
  try { p = exportProgram(r, programOf(r.graph)); } catch (e) { msg = e.message; }
  const wide = p?.kernels.find((kn) => kn.grid * kn.block > 2 ** 31 - 1);
  check(!!wide && /MAP=(row|tiled)/.test(wide.row), `a row-mapped launch past 2^31 threads is exported: ${msg || wide?.row}`);
}

// an input the source mutates is written by the program's last kernel into the input's own buffer
{
  const g = k.trace("mut", ({ x }) => ({ y: N.mean(N.relu(x), -1), __mut0: N.relu(x) }), { x: k.tensor([4, 8]) });
  const r = pipe.run(g), p = exportProgram(r, programOf(r.graph), { mutations: { __mut0: "x" } });
  const last = p.kernels.at(-1), x = p.inputs[0], mut = p.outputs.find((o) => o.name === "__mut0");
  check(mut.buffer === x.buffer, "the mutated output is the input's buffer");
  check(last.writes === x.buffer && /k_writeback__/.test(last.name) && /dst\[e\] = src0\[e\]/.test(last.cuda), "a final write-back kernel stores into the input");
  check(p.kernels.slice(0, -1).every((kn) => kn.writes !== x.buffer), "no earlier kernel writes the input");
  let msg = null;
  try { exportProgram(r, programOf(r.graph), { mutations: { y: "x" } }); } catch (e) { msg = e.message; }
  check(/does not match the input/.test(msg || ""), `a mutation must match the input's type: ${msg}`);
}

if (failed) { console.log(`${failed} failed`); process.exitCode = 1; }
