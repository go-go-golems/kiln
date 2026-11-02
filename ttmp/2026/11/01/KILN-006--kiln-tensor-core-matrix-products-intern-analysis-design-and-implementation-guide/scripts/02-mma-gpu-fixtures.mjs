// KILN-006: GPU validation fixtures for the tensor-core path, in the launcher round-trip format of
// runtime/test/fixtures.mjs (<case>.program.json + <case>.expect.json, inputs regenerated from `gen` on both sides).
//
//   node ttmp/2026/11/01/KILN-006-…/scripts/02-mma-gpu-fixtures.mjs <dir>       (from the repository root)
//   python3 runtime/python/kiln_launch.py check-fixtures <dir> --backend cuda    (on the GPU host)
//
// Two kinds of case:
//   probe-<op>   Phase 0 layout probe: one warp, one hand-written atom per op (as test/mma-kernel-ir.mjs), whose
//                fragment loads go straight from global memory through the mma.js layout table. The kernel rounds
//                its inputs to the operand format first (round_tf32 / round_f16 / round_bf16), so the launcher's FP32
//                inputs are legal; expected D = round(A)·round(B) by mma.js atomReference. A layout transcription
//                error permutes products and fails by O(1), far outside the checker's rtol 1e-3 / atol 1e-4.
//   mma-<case>   Phase 5 kernels: whole programs compiled for gb10 with MAP=mma pinned (TF32 under
//                --matmul-precision tf32; f32 inputs only, which is what the Python CUDA launcher packs). Expected
//                values are Kiln's Loop IR reference (TF32 operand rounding, FP32 accumulation) on the same inputs.
// Every kernel of every case was simulated on CPU against the same reference before writing (the script fails
// otherwise). f16/bf16 storage programs are not written: the launcher's _packed/_host handle f32 and u8 only;
// validate those through integrations/passnet (TorchProgram), see the KILN-006 diary.
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../../..");
const { k } = await import(join(ROOT, "packages/kiln/src/core/kiln.js"));
const IX = await import(join(ROOT, "packages/kiln/src/core/ix.js"));
const { Tensor, numel } = await import(join(ROOT, "packages/kiln/src/core/util.js"));
const { N } = await import(join(ROOT, "packages/kiln/src/std/tensor.js"));
const { pipeline } = await import(join(ROOT, "packages/kiln/src/std/emmy.js"));
const { programOf, simulateKernel } = await import(join(ROOT, "packages/kiln/src/std/program.js"));
const { SPECS, target } = await import(join(ROOT, "packages/kiln/src/std/targets.js"));
const { exportProgram, PROGRAM_FORMAT } = await import(join(ROOT, "packages/kiln/src/std/export.js"));
const { CODEGEN_VERSION } = await import(join(ROOT, "packages/kiln/src/std/records.js"));
const { KB, kx } = await import(join(ROOT, "packages/kiln/src/std/kernel.js"));
const { toCuda, toSim, SimMetrics } = await import(join(ROOT, "packages/kiln/src/std/emit.js"));
const { MMA_OPS, fragmentIx, atomReference, roundOperand } = await import(join(ROOT, "packages/kiln/src/std/mma.js"));
const { gen } = await import(join(ROOT, "runtime/test/fixtures.mjs"));

const dir = process.argv[2];
if (!dir) { console.error("usage: node 02-mma-gpu-fixtures.mjs <dir>"); process.exit(2); }
mkdirSync(dir, { recursive: true });
const gb10 = target(SPECS.gb10);
const write = (id, program, expect) => {
  writeFileSync(join(dir, `${id}.program.json`), JSON.stringify(program));
  writeFileSync(join(dir, `${id}.expect.json`), JSON.stringify(expect));
  console.log(`${id.padEnd(22)} ${program.kernels.map((x) => x.row).join(" | ")}`);
};
const buffersOf = (tensors) => tensors.map((t, id) => ({ id, dtype: "f32", elements: numel(t.shape), bytes: Math.max(4, numel(t.shape) * 4) }));

// ---------------------------------------------------------------- Phase 0: one atom per op
for (const [opName, op] of Object.entries(MMA_OPS)) {
  const kb = new KB(), V = IX.V, lane = kb.int(V("tid").mod(32), "lane");
  const round = `round_${op.operand}`;
  const acc = [0, 1, 2, 3].map((i) => kb.let(kx.num(0), `c${i}`));
  const frag = (which, elems, buf, ld) => Array.from({ length: elems }, (_, e) => {
    const [r, c] = fragmentIx(opName, which, e, lane);
    return kb.let(kx.op(round, kx.v(kb.load(buf, r.mul(ld).add(c), `g${which}${e}`))), `${which}${e}`);
  });
  const a = frag("a", op.aElems, 0, op.k), b = frag("b", op.bElems, 1, op.n);
  kb.mma(opName, acc, a, b);
  acc.forEach((n, i) => { const [r, c] = fragmentIx(opName, "c", i, lane); kb.store("out", r.mul(op.n).add(c), kx.v(n)); });
  const name = `kiln_mma_probe_${op.operand}`;
  const ins = [{ name: "a", shape: [op.m, op.k] }, { name: "b", shape: [op.k, op.n] }], out = { name: "d", shape: [op.m, op.n] };
  const K = { name, grid: 1, block: 32, smem: [], smemBytes: 0, body: kb.body, values: {}, floats: [...kb.floats], ints: ["lane"],
    params: [...ins.map((t, i) => ({ name: "in" + i, size: numel(t.shape), shape: t.shape, role: "in", dtype: "f32" })), { name: "out", size: numel(out.shape), shape: out.shape, role: "out", dtype: "f32" }], map: {}, row: `probe ${opName}` };
  const seeds = { a: 101, b: 202 };
  const A = gen("f32", op.m * op.k, seeds.a), B = gen("f32", op.k * op.n, seeds.b);
  const want = atomReference(opName, A.map((x) => roundOperand(x, op.operand)), B.map((x) => roundOperand(x, op.operand)), new Float32Array(op.m * op.n));
  const got = new Float32Array(op.m * op.n), M = new SimMetrics(32, got.length);
  toSim(K, { instrument: true })([A, B, got], [0], M);
  if (M.badMmas.length || got.some((v, i) => v !== want[i])) throw new Error(`${opName}: the simulated probe disagrees with atomReference`);
  const tensors = [...ins, out];
  const program = { format: PROGRAM_FORMAT, name: `probe-${op.operand}`, codegen: CODEGEN_VERSION, target: { id: gb10.id, name: gb10.name }, params: {}, source: null,
    inputs: ins.map((t, i) => ({ name: t.name, buffer: i, shape: t.shape, dtype: "f32" })), outputs: [{ name: out.name, buffer: 2, shape: out.shape, dtype: "f32" }], buffers: buffersOf(tensors),
    kernels: [{ name, identity: `probe-${op.operand}`, row: K.row, reads: [0, 1], writes: 2, grid: 1, block: 32, smemBytes: 0, dispatch: [1, 1, 1], shape: out.shape, inShapes: ins.map((t) => t.shape), inDtypes: ["f32", "f32"], wgsl: null, wgslUnavailable: "tensor-core mma has no WGSL lowering", cuda: toCuda(K) }] };
  write(`probe-${op.operand}`, program, { case: `probe-${op.operand}`, why: `Phase 0 layout probe for mma.${opName}`, seeds, expect: { d: { indices: [...want.keys()], values: [...want] } } });
}

// ---------------------------------------------------------------- Phase 5: pinned MAP=mma programs (TF32)
const CASES = [
  { id: "mma-linear-relu", why: "the guide's running example, relu(x·wᵀ + b), 512×256×384", pins: { MAP: "mma" },
    g: () => k.trace("lin", ({ x, w, b }) => ({ out: N.relu(N.linear(x, w, b)) }), { x: k.tensor([512, 256]), w: k.tensor([384, 256]), b: k.tensor([384]) }) },
  { id: "mma-linear-64x64", why: "explicit warp tiles 32×32, BK=16", pins: { MAP: "mma", BM: 64, BN: 64, BK: 16, WM: 32, WN: 32 },
    g: () => k.trace("lin64", ({ x, w, b }) => ({ out: N.linear(x, w, b) }), { x: k.tensor([256, 192]), w: k.tensor([320, 192]), b: k.tensor([320]) }) },
  { id: "mma-large-k", why: "K = 4096: accumulation-order drift against the sequential reference", pins: { MAP: "mma", BM: 64, BN: 64, BK: 32, WM: 32, WN: 32 },
    g: () => k.trace("largek", ({ a, b }) => ({ out: N.matmul(a, b) }), { a: k.tensor([128, 4096]), b: k.tensor([4096, 128]) }) },
  { id: "mma-bmm", why: "batched [4,96,80]@[4,80,72]", pins: { MAP: "mma" },
    g: () => k.trace("bmm", ({ a, b }) => ({ out: N.matmul(a, b) }), { a: k.tensor([4, 96, 80]), b: k.tensor([4, 80, 72]) }) },
  { id: "mma-tails", why: "M=33, K=19, N=17 with 32×16 tiles (fused TF32 rounding in the tile loader)", pins: { MAP: "mma", BM: 32, BN: 16, BK: 16, WM: 16, WN: 8 },
    g: () => k.trace("tails", ({ x, w }) => ({ out: N.linear(x, w) }), { x: k.tensor([33, 19]), w: k.tensor([17, 19]) }) },
  { id: "mma-bias-gelu", why: "fused bias + GELU epilogue", pins: { MAP: "mma" },
    g: () => k.trace("gelu", ({ x, w, b }) => ({ out: N.gelu(N.linear(x, w, b)) }), { x: k.tensor([48, 32]), w: k.tensor([24, 32]), b: k.tensor([24]) }) },
];
for (const c of CASES) {
  const run = pipeline({ target: gb10, matmulPrecision: "tf32" }).run(c.g(), { params: c.pins });
  if (!run.ok) throw new Error(`${c.id}: ${run.error?.message}`);
  const prog = programOf(run.graph);
  if (!prog.kernels.some((x) => x.K.mma)) throw new Error(`${c.id}: no MAP=mma kernel`);
  for (const kern of prog.kernels) { const r = simulateKernel(kern, gb10); if (!r.check.ok) throw new Error(`${c.id} ${kern.name} ${kern.row}: ${r.check.message}`); }
  const program = exportProgram(run, prog, { name: c.id, params: c.pins, target: gb10 });
  const seeds = Object.fromEntries(program.inputs.map((t, j) => [t.name, 11 + j]));
  const ins = Object.fromEntries(program.inputs.map((t) => [t.name, new Tensor(t.shape, Float32Array.from(gen(t.dtype, numel(t.shape), seeds[t.name])))]));
  const want = run.at("loop").eval(ins), expect = {};
  for (const o of program.outputs) { const d = want[o.name].data; expect[o.name] = { indices: [...d.keys()], values: [...d] }; }
  write(c.id, program, { case: c.id, why: c.why, seeds, expect });
}
