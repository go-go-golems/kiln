// kiln-program/1: a compiled program as a consumer loads it. Kernels in launch order, the buffer each argument reads
// and each kernel writes, the dispatch geometry, and the identity that ties every kernel back to its record.
import { numel, dtypeBytes } from "../core/util.js";
import { KilnError } from "../core/kiln.js";
import { CODEGEN_VERSION } from "./records.js";

export const PROGRAM_FORMAT = "kiln-program/1";

const cname = (s) => String(s || "kernel").replace(/[^\w]/g, "_");
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
export function exportProgram(run, prog, { name, params = {}, target = null, source = null } = {}) {
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
  const kernels = [];
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
  }
  const outputs = g.outputs.map((o) => {
    if (!byNode.has(o.id)) throw new KilnError("ExportError", `output ${o.name} is ${g.nodes.get(o.id)?.name || "missing"}: an exported output must be a kernel's or an input's buffer`);
    return { name: o.name, buffer: byNode.get(o.id), shape: g.nodes.get(o.id).type.shape, dtype: buffers[byNode.get(o.id)].dtype };
  });
  return {
    format: PROGRAM_FORMAT, name: name || g.name, codegen: CODEGEN_VERSION,
    target: target ? { id: target.id, name: target.name } : null, params, source,
    inputs, outputs, buffers, kernels,
  };
}
