// kiln-program/1: a compiled program as a consumer loads it. Kernels in launch order, the buffer each argument reads
// and each kernel writes, the dispatch geometry, and the identity that ties every kernel back to its record.
import { numel, dtypeBytes, hash } from "../core/util.js";
import { KilnError } from "../core/kiln.js";
import { CODEGEN_VERSION } from "./records.js";
import { CUDA_STORAGE, toCuda } from "./emit.js";
import { MUTATION_STRATEGIES, planMutation, retargetProducer, compactBuffers } from "./inplace.js";

export const PROGRAM_FORMAT = "kiln-program/1";

const cname = (s) => String(s || "kernel").replace(/[^\w]/g, "_");
// CUDA kernels compute thread ids, loop variables and flat element offsets in 32-bit int (emit.js):
// refuse an artifact whose buffers or launches could exceed that range instead of overflowing silently.
export const INT32_INDEX_LIMIT = 2 ** 31 - 1;
const storageBytes = (dtype, n) => Math.max(4, Math.ceil(n * dtypeBytes(dtype) / 4) * 4);
const base64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };

/**
 * The exported name of a kernel: its emitted name plus the full identity, so a profiler trace that shows the symbol
 * names the computation without a lookup table.
 */
export const exportedName = (kern) => `${cname(kern.K.name)}__${kern.identity}`;

// the CUDA entry symbol renamed; the source is otherwise exactly what the workbench measured
function renameCuda(src, from, to) {
  const re = new RegExp(`(__global__\\s+void\\s+(?:__launch_bounds__\\s*\\([^)]*\\)\\s*)?)${from}(\\s*\\()`);
  if (!re.test(src)) throw new KilnError("ExportError", `no entry ${from} in the CUDA source`);
  return src.replace(re, `$1${to}$2`);
}

/**
 * `run` is a finished pipeline run whose last IR holds gpu kernels; `prog` is `programOf(run.graph)`. Data constants
 * (weights, tables) become buffers with their values inline, as base64 little-endian fp32. → the kiln-program/1 object
 */
// An input the source graph mutates is written by the program itself, because the caller may run no tensor operation
// (PassBench's dispatch admits factories only). Where inplace.js proves it safe, the kernel that computes the new
// value stores it straight into the input's buffer. Otherwise a final copy kernel writes it there: every read of the
// original value is an earlier launch, so that write cannot race. program.mutations[] records which, and why.
function writebackKernel(from, to) {
  const ctype = CUDA_STORAGE[from.dtype], n = numel(from.shape), block = 256, grid = Math.max(1, Math.ceil(n / block));
  const identity = hash(`writeback|${from.dtype}|${from.shape.join("x")}`), exported = `k_writeback__${identity}`;
  const cuda = `${from.dtype === "f16" ? "#include <cuda_fp16.h>\n" : from.dtype === "bf16" ? "#include <cuda_bf16.h>\n" : ""}extern "C" __global__ void __launch_bounds__(${block}) ${exported}(const ${ctype}* __restrict__ src0, ${ctype}* __restrict__ dst) {
    const int e = blockIdx.x * ${block} + threadIdx.x;
    if (e < ${n}) dst[e] = src0[e];
}`;
  return { name: exported, identity, row: "MAP=thread", reads: [from.buffer], writes: to.buffer, grid, block, smemBytes: 0,
    dispatch: [Math.min(grid, 65535), Math.ceil(grid / 65535), 1], shape: from.shape, inShapes: [from.shape], inDtypes: [from.dtype],
    wgslUnavailable: "input mutation write-back is emitted for CUDA only", cuda };
}

// The Loop IR behind each exported kernel record, for in-process consumers (the CPU program oracle, program-sim.js):
// a record serializes without it. A write-back kernel maps to { copy: true }.
const LOOP_IR = new WeakMap();
export const loopIrOf = (kernelRecord) => LOOP_IR.get(kernelRecord) ?? null;

export function exportProgram(run, prog, { name, params = {}, target = null, source = null, mutations = {}, mutationStrategy = "auto" } = {}) {
  if (!MUTATION_STRATEGIES.includes(mutationStrategy)) throw new KilnError("ExportError", `mutation strategy ${mutationStrategy}: one of ${MUTATION_STRATEGIES.join(" ")}`);
  const g = run.graph;
  const buffers = [], byNode = new Map();
  const add = (nodeId, dtype, shape, extra = {}) => {
    const id = buffers.length, elements = numel(shape);
    buffers.push({ id, dtype, elements, bytes: storageBytes(dtype, elements), ...extra });
    byNode.set(nodeId, id);
    return id;
  };
  const inputs = g.inputs.map((i) => {
    const t = g.nodes.get(i.id).type, dtype = t.dtype || "f32";
    return { name: i.name, buffer: add(i.id, dtype, t.shape), shape: t.shape, dtype };
  });
  const kernels = [], irs = [];
  for (const kn of prog.kernels) {
    const node = g.nodes.get(kn.id);
    const reads = node.args.map((a, j) => {
      if (byNode.has(a)) return byNode.get(a);
      const src = g.nodes.get(a);
      if (src?.name === "tensor.const" && src.attrs.data) {
        const d = Float32Array.from(src.attrs.data.data);
        return add(a, "f32", src.attrs.data.shape, { name: src.attrs.name || null, data: base64(new Uint8Array(d.buffer)) });
      }
      throw new KilnError("ExportError", `kernel ${kn.name} argument ${j} is ${src?.name || "missing"}: an exported argument must be a program input, a data constant, or an earlier kernel's output`);
    });
    const writes = add(kn.id, kn.outDtype || "f32", kn.shape);
    const K = kn.K, exported = exportedName(kn);
    kernels.push({
      name: exported, identity: kn.identity, row: kn.row, reads, writes,
      grid: K.grid, block: K.block, smemBytes: K.smemBytes,
      // WebGPU folds grids past 65535 workgroups into two dimensions; the WGSL computes its block index to match
      dispatch: [Math.min(K.grid, 65535), Math.ceil(K.grid / 65535), 1],
      shape: kn.shape, inShapes: kn.inShapes, inDtypes: kn.inDtypes,
      wgsl: kn.wgsl, ...(kn.wgslUnavailable ? { wgslUnavailable: kn.wgslUnavailable } : {}), cuda: renameCuda(kn.cuda, cname(K.name), exported),
    });
    irs.push(K);
  }
  for (const b of buffers) if (b.elements > INT32_INDEX_LIMIT) throw new KilnError("ExportError", `buffer ${b.id} has ${b.elements} elements: CUDA index arithmetic is 32-bit (limit ${INT32_INDEX_LIMIT})`);
  for (const kn of kernels) {
    // CUDA's x grid dimension is itself limited to 2^31 - 1 blocks
    if (kn.grid > INT32_INDEX_LIMIT) throw new KilnError("ExportError", `kernel ${kn.name} launches ${kn.grid} blocks: CUDA grids are limited to ${INT32_INDEX_LIMIT}`);
    // only thread-mapped kernels form a global thread id (bid * block + tid); row, tiled, mma and flash kernels
    // derive offsets from bid, bounded by the buffer extents checked above
    const threadMapped = !/(^|,)MAP=(row|tiled|mma|flash)(,|$)/.test(kn.row);
    if (threadMapped && kn.grid * kn.block > INT32_INDEX_LIMIT) throw new KilnError("ExportError", `kernel ${kn.name} launches ${kn.grid * kn.block} threads: CUDA thread ids are 32-bit (limit ${INT32_INDEX_LIMIT})`);
  }
  const outputs = g.outputs.map((o) => {
    if (!byNode.has(o.id)) throw new KilnError("ExportError", `output ${o.name} is ${g.nodes.get(o.id)?.name || "missing"}: an exported output must be a kernel's or an input's buffer`);
    return { name: o.name, buffer: byNode.get(o.id), shape: g.nodes.get(o.id).type.shape, dtype: buffers[byNode.get(o.id)].dtype };
  });
  // mutations in order: each plan sees the records as the previous mutations left them (inplace.js)
  const decided = [];
  for (const [outName, inName] of Object.entries(mutations)) {
    const o = outputs.find((x) => x.name === outName), i = inputs.find((x) => x.name === inName);
    if (!o || !i) throw new KilnError("ExportError", `mutation ${outName} -> ${inName}: no such output or input`);
    if (o.shape.join() !== i.shape.join() || o.dtype !== i.dtype) throw new KilnError("ExportError", `mutation ${outName} -> ${inName}: value (${o.shape}) ${o.dtype} does not match the input (${i.shape}) ${i.dtype}`);
    const auto = planMutation({ kernels, irs, inputs, outputs, buffers }, { outName, inName });
    const plan = mutationStrategy === "writeback" ? { strategy: "writeback", reason: "forced (mutation strategy writeback)", planned: auto.strategy } : auto;
    if (plan.strategy === "direct") {
      retargetProducer({ kernels, irs }, plan, o, i, { emitCuda: (K, alias) => toCuda(K, { alias }), entryOf: (K) => cname(K.name), rename: renameCuda });
      decided.push({ output: outName, input: inName, strategy: "direct", producer: kernels[plan.producer].name, slots: plan.slots });
    } else {
      if (o.buffer !== i.buffer) { kernels.push(writebackKernel(o, i)); irs.push({ copy: true }); o.buffer = i.buffer; }
      decided.push({ output: outName, input: inName, ...plan });
    }
  }
  kernels.forEach((kn, q) => LOOP_IR.set(kn, irs[q]));
  return compactBuffers({
    format: PROGRAM_FORMAT, name: name || g.name, codegen: CODEGEN_VERSION,
    target: target ? { id: target.id, name: target.name } : null, params, source,
    inputs, outputs, buffers, kernels, ...(decided.length ? { mutations: decided } : {}),
  });
}
