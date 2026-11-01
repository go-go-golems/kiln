// Direct writes of mutated inputs (KILN-009). A source graph that updates one of its inputs in place gets a program
// that writes the input itself. The fallback is a write-back kernel appended after every other launch (export.js).
// This module decides when the kernel that computes the new value (the producer) may store straight into the
// input's buffer instead, and rewrites the exported program when it may.
//
// The proof has two halves:
//   launch order — no kernel launched after the producer reads the input's buffer (kernels run in order on one
//                  stream, so earlier readers see the original value and later ones are re-pointed at the new one);
//   same index   — inside the producer, every load from the input reads exactly the element the same thread then
//                  stores, before it stores it, so no thread can observe another thread's write.
// A refusal is never an error: it keeps the write-back and records why, in program.mutations[].
import * as IX from "../core/ix.js";
import { hash } from "../core/util.js";

export const MUTATION_STRATEGIES = Object.freeze(["auto", "writeback"]);
export const INPLACE_WGSL_UNAVAILABLE = "in-place input write is emitted for CUDA only";

const fail = (reason) => ({ ok: false, reason });

// every index expression a statement evaluates, other than a load's or a store's own address
const controlIndices = (s) => s.s === "iset" ? [s.e] : s.s === "for" ? [s.from, s.to, s.step] : s.s === "if" ? [s.c] : s.s === "sload" || s.s === "sstore" ? [s.idx] : [];
// the integer variables a statement (and everything nested in it) assigns
function assigned(s, out = new Set()) {
  if (s.s === "iset") out.add(s.n);
  if (s.s === "for") out.add(s.v);
  for (const c of s.body || []) assigned(c, out);
  return out;
}

/**
 * The in-kernel half of the proof, over Loop IR. `slots` are the source parameter indices bound to the buffer the
 * kernel's single store will write. → { ok: true } or { ok: false, reason }
 *
 * First-slice rule (KILN-009 guide, Decision 7.2): exactly one global store, outside any loop; every load from an
 * aliased slot sits in the store's own statement list, before it, at a structurally equal index (IX.keyOf over the
 * normalized form), and no statement between them reassigns a variable that index uses. No index expression anywhere
 * may read an aliased slot through a data-dependent term (a gather through the mutated input).
 */
export function sameIndexSlots(K, slots) {
  const aliased = new Set(slots);
  const stores = [], loads = [];
  // where every load and store lives: its statement list, its position, and whether a loop encloses it
  const visit = (list, inLoop) => list.forEach((s, at) => {
    if (s.s === "store") stores.push({ s, list, at, inLoop });
    if (s.s === "load" && aliased.has(s.buf)) loads.push({ s, list, at });
    if (s.body) visit(s.body, inLoop || s.s === "for");
  });
  visit(K.body, false);
  if (stores.length !== 1) return fail(`the kernel has ${stores.length} stores`);
  const st = stores[0];
  if (st.inLoop) return fail("the store is inside a loop");
  // a data-dependent index term that reads an aliased slot is a read of the input at a computed, other element
  const gathers = (e) => IX.loadsOf(e).some((l) => aliased.has(l.v.i));
  const everyIndex = (list, f) => list.every((s) => [...controlIndices(s), ...(s.s === "load" || s.s === "store" ? [s.idx] : [])].every(f) && everyIndex(s.body || [], f));
  if (!everyIndex(K.body, (e) => !gathers(e))) return fail("an index expression reads the mutated input (a gather through it)");
  const key = IX.keyOf(st.s.idx), uses = IX.vars(st.s.idx);
  for (const ld of loads) {
    if (ld.list !== st.list) return fail(`a load from slot ${ld.s.buf} is in a different loop or branch than the store`);
    if (ld.at > st.at) return fail(`a load from slot ${ld.s.buf} follows the store`);
    if (IX.keyOf(ld.s.idx) !== key) return fail(`a load from slot ${ld.s.buf} reads index ${IX.print(ld.s.idx)}, the store writes ${IX.print(st.s.idx)}`);
    for (let j = ld.at + 1; j < st.at; j++) {
      const hit = [...assigned(st.list[j])].find((v) => uses.has(v));
      if (hit) return fail(`index variable ${hit} is reassigned between a load from slot ${ld.s.buf} and the store`);
    }
  }
  return { ok: true };
}

/**
 * The launch-order half, over a program's own records. Pure: it reads and never writes them.
 * `irs[q]` is kernel q's Loop IR (null for a kernel without one, such as a write-back). → MutationPlan:
 *   { strategy: "direct", producer, slots }  or  { strategy: "writeback", reason }
 */
export function planMutation({ kernels, irs, inputs, outputs, buffers }, { outName, inName }) {
  const o = outputs.find((x) => x.name === outName), i = inputs.find((x) => x.name === inName);
  const writeback = (reason) => ({ strategy: "writeback", reason });
  const bv = o.buffer, bx = i.buffer;
  if (bv === bx) return writeback("the value is already the input");
  if (inputs.some((x) => x.buffer === bv)) return writeback(`the value is input ${inputs.find((x) => x.buffer === bv).name}, which no kernel computes`);
  if (buffers[bv]?.data != null) return writeback("the value is a data constant, which no kernel computes");
  const producers = kernels.flatMap((k, q) => (k.writes === bv ? [q] : []));
  if (producers.length !== 1) return writeback(`${producers.length} kernels write the value's buffer`);
  const p = producers[0];
  if (!irs[p]) return writeback(`producer ${p} (${kernels[p].name}) has no Loop IR`);
  const other = outputs.find((x) => x !== o && x.buffer === bv);
  if (other) return writeback(`output ${other.name} also holds the value`);
  const writer = kernels.findIndex((k) => k.writes === bx);
  if (writer >= 0) return writeback(`kernel ${writer} (${kernels[writer].name}) already writes ${inName}`);
  for (let q = p + 1; q < kernels.length; q++) if (kernels[q].reads.includes(bx)) return writeback(`kernel ${q} (${kernels[q].name}) reads ${inName} after producer ${p}`);
  const slots = kernels[p].reads.flatMap((b, j) => (b === bx ? [j] : []));
  if (slots.length) {
    const r = sameIndexSlots(irs[p], slots);
    if (!r.ok) return writeback(`producer ${p}: ${r.reason}`);
  }
  return { strategy: "direct", producer: p, slots };
}

/**
 * Applies a direct plan in place: the producer stores into the input's buffer, later readers of the value read the
 * input, and the mutation's output is the input. `emitCuda(K, alias)` renders the producer's CUDA without
 * `__restrict__` on the aliased parameters; `rename(src, from, to)` sets its entry symbol.
 */
export function retargetProducer({ kernels, irs }, plan, o, i, { emitCuda, entryOf, rename }) {
  const p = plan.producer, bv = o.buffer, bx = i.buffer, kern = kernels[p], K = irs[p];
  kern.writes = bx;
  for (let q = p + 1; q < kernels.length; q++) kernels[q].reads = kernels[q].reads.map((b) => (b === bv ? bx : b));
  o.buffer = bx;
  // a different executable gets a different identity (Decision 7.4): records keyed by identity describe exact sources
  const identity = hash(`${kern.identity}|inplace:${plan.slots.join(",")}`), name = `${entryOf(K)}__${identity}`;
  Object.assign(kern, {
    name, identity, inPlace: { input: i.name, slots: plan.slots, of: kern.identity },
    wgsl: null, wgslUnavailable: INPLACE_WGSL_UNAVAILABLE,
    cuda: rename(emitCuda(K, plan.slots), entryOf(K), name),
  });
}

/**
 * Drops buffers that nothing names (no input, output, kernel read or write) and renumbers the rest densely: the
 * launchers index their pointer tables by buffer id, so ids must equal positions. Mutates and returns `program`.
 */
export function compactBuffers(program) {
  const used = new Set([...program.inputs.map((x) => x.buffer), ...program.outputs.map((x) => x.buffer), ...program.kernels.flatMap((k) => [...k.reads, k.writes])]);
  const remap = new Map();
  program.buffers = program.buffers.filter((b) => used.has(b.id)).map((b, id) => { remap.set(b.id, id); return { ...b, id }; });
  const at = (b) => remap.get(b);
  for (const x of [...program.inputs, ...program.outputs]) x.buffer = at(x.buffer);
  for (const k of program.kernels) { k.reads = k.reads.map(at); k.writes = at(k.writes); }
  return program;
}
