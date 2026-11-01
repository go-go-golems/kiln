// A CPU oracle for an exported kiln-program/1 (KILN-009): every kernel runs in launch order on the SIMT simulator
// over one buffer table indexed by buffer id, so a kernel that writes a buffer it also reads really shares it, as on
// the GPU. The simulator executes a block in lockstep (emit.js), which hides an intra-block race, so the instrumented
// mode also records, for every kernel that writes a buffer it reads, which thread loaded and which stored each
// address, and reports a hazard when a thread reads an element another thread stores, or reads one after storing it.
import { SimMetrics, toSim } from "./emit.js";
import { loopIrOf } from "./export.js";

const fromBase64 = (s) => new Float32Array(Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer);

// per-thread loads from the aliased slots and stores to dst, in the order the lockstep simulator issued them
class AliasWatch extends SimMetrics {
  constructor(T, n, slots) { super(T, n); Object.assign(this, { slots: new Set(slots), bid: 0, seq: 0, stored: new Map(), loads: [], hazards: [] }); }
  block(bid) { super.block(); this.bid = bid; }
  gmem(A, kind, slot) {
    super.gmem(A, kind);
    const st = kind === "st", seq = ++this.seq;
    if (!st && !this.slots.has(slot)) return;
    for (let t = 0; t < this.T; t++) {
      const a = A[t];
      if (a < 0) continue;
      const thread = this.bid * this.T + t;
      if (!st) { this.loads.push([a, thread, seq]); continue; }
      const prev = this.stored.get(a);
      if (prev && prev.thread !== thread) this.hazards.push(`threads ${prev.thread} and ${thread} both store element ${a}`);
      this.stored.set(a, { thread, seq });
    }
  }
  finish() {
    for (const [a, thread, seq] of this.loads) {
      const s = this.stored.get(a);
      if (!s) continue;
      if (s.thread !== thread) this.hazards.push(`thread ${thread} reads element ${a}, which thread ${s.thread} stores`);
      else if (s.seq < seq) this.hazards.push(`thread ${thread} reads element ${a} after storing it`);
    }
    return this.hazards;
  }
}

/**
 * `program` must come from exportProgram in this process (its kernels carry their Loop IR, export.js loopIrOf);
 * `inputs` maps each input name to a Float32Array. Inputs are copied, so the caller's arrays stay unchanged.
 * → { outputs: name → Float32Array, inputs: name → contents after the run, hazards: [{ kernel, message }] }
 */
export function simulateProgram(program, inputs, { instrument = false } = {}) {
  const B = program.buffers.map((b) => (b.data != null ? fromBase64(b.data) : new Float32Array(b.elements).fill(NaN)));
  for (const i of program.inputs) {
    const v = inputs[i.name];
    if (!v || v.length !== B[i.buffer].length) throw new TypeError(`input ${i.name}: want ${B[i.buffer].length} values`);
    B[i.buffer].set(v);
  }
  const hazards = [];
  for (const kern of program.kernels) {
    const K = loopIrOf(kern);
    if (!K) throw new TypeError(`kernel ${kern.name} has no Loop IR in this process`);
    const src = kern.reads.map((b) => B[b]), dst = B[kern.writes];
    if (K.copy) { dst.set(src[0].subarray(0, dst.length)); continue; }
    const blocks = Array.from({ length: K.grid }, (_, b) => b);
    const slots = kern.reads.flatMap((b, j) => (b === kern.writes ? [j] : []));
    if (instrument && slots.length) {
      const M = new AliasWatch(K.block, dst.length, slots);
      toSim(K, { instrument: true })([...src, dst], blocks, M);
      for (const message of M.finish().slice(0, 8)) hazards.push({ kernel: kern.name, message });
      if (M.oobs.length) hazards.push({ kernel: kern.name, message: `out-of-bounds ${M.oobs[0].what} at ${M.oobs[0].a}` });
    } else toSim(K)([...src, dst], blocks, null);
  }
  const named = (list) => Object.fromEntries(list.map((x) => [x.name, B[x.buffer].slice()]));
  return { outputs: named(program.outputs), inputs: named(program.inputs), hazards };
}
