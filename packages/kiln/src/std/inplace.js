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

// Enumerating every store address is cheap next to running the kernel; past this many (thread, iteration) pairs the
// proof gives up and the write-back stays.
export const ENUMERATION_LIMIT = 2 ** 26;

/**
 * Every address the kernel's single store writes, enumerated over the whole launch (every block, thread and loop
 * iteration whose guards hold), must be in range and distinct. `frames` is the path from K.body to the store:
 * [{ list, at }], one per enclosing statement list. → null when injective, else the reason it is not (or cannot be
 * shown). Index arithmetic is evaluated as the CUDA emitter spells it, over nonnegative coordinates.
 */
export function storeInjective(K, frames, { limit = ENUMERATION_LIMIT } = {}) {
  const n = K.params.find((p) => p.role === "out").size, name = (v) => `v_${v}`;
  const ix = (e) => IX.emit(e, "js", name);
  const ints = new Set(K.ints);
  // a loop or branch beside the path may assign integer variables (a reduction's loop counter): harmless unless the
  // path to the store reads one of them
  const pathUses = new Set(), skipped = [];
  frames.forEach(({ list, at }, d) => {
    for (let j = 0; j < at; j++) if (list[j].s === "iset") IX.vars(list[j].e, pathUses); else if (list[j].body) skipped.push(list[j]);
    const s = list[at];
    for (const e of d === frames.length - 1 ? [s.idx] : controlIndices(s)) IX.vars(e, pathUses);
  });
  for (const s of skipped) {
    const hit = [...assigned(s)].find((v) => pathUses.has(v));
    if (hit) return `a ${s.s} beside the path to the store assigns ${hit}, which the store's address depends on`;
  }
  const level = (d) => {
    const { list, at } = frames[d];
    let src = "";
    for (let j = 0; j < at; j++) {
      const s = list[j];
      if (s.s === "iset") { ints.add(s.n); src += `${name(s.n)} = ${ix(s.e)};`; }
    }
    const s = list[at];
    if (d === frames.length - 1) return src + `{ const a = ${ix(s.idx)}; if (!(a >= 0 && a < ${n})) return "the store writes address " + a + ", outside [0, ${n})"; if (seen[a]) return "element " + a + " is stored twice"; seen[a] = 1; }`;
    if (s.s === "if") return src + `if (${ix(s.c)}) { ${level(d + 1)} }`;
    if (s.s === "for") { ints.add(s.v); return src + `for (${name(s.v)} = ${ix(s.from)}; ${name(s.v)} < ${ix(s.to)}; ${name(s.v)} += ${ix(s.step)}) { if (++work > ${limit}) return null; ${level(d + 1)} }`; }
    throw new TypeError(`a store nested in ${s.s}`);
  };
  let body;
  try { body = level(0); } catch (e) { return `the store's address is not enumerable: ${e.message}`; }
  ints.delete("tid"); ints.delete("bid");
  const declared = [...ints].map((v) => `${name(v)} = 0`).join(", ");
  const src = `const seen = new Uint8Array(${n}); let work = 0${declared ? ", " + declared : ""};
    for (let v_bid = 0; v_bid < ${K.grid}; v_bid++) for (let v_tid = 0; v_tid < ${K.block}; v_tid++) {
      if (++work > ${limit}) return null;${declared ? " " + [...ints].map((v) => `${name(v)} = 0;`).join(" ") : ""} ${body}
    }
    return "ok";`;
  const r = new Function(src)();
  return r === "ok" ? null : r === null ? `more than ${limit} (thread, iteration) pairs to enumerate` : r;
}

/**
 * The in-kernel half of the proof, over Loop IR. `slots` are the source parameter indices bound to the buffer the
 * kernel's single store writes. → { ok: true } or { ok: false, reason }
 *
 * Rule (KILN-009 guide, Decision 7.2, extended to the coarsened and row-reduction kernels of the PassBench corpus):
 *   - exactly one global store, and its addresses over the whole launch are distinct (storeInjective);
 *   - no index expression reads an aliased slot through a data-dependent term (a gather through the mutated input);
 *   - every load from an aliased slot is either
 *       (same list)  in the store's own statement list, before it, at a structurally equal index (IX.keyOf over the
 *                    normalized form), with no statement between them reassigning a variable that index uses; or
 *       (barrier)    at the kernel's top level, at a structurally equal index that depends on the block index only,
 *                    with a __syncthreads() at top level between it and the branch (ifs only, no loop) holding the
 *                    store: every thread of the block reads the element before the one thread that stores it.
 * With distinct store addresses, an element is loaded only by the (block, thread, iteration) that stores it, before
 * it stores it, or (barrier) by threads of that block before a barrier the store follows.
 */
export function sameIndexSlots(K, slots, { limit } = {}) {
  const aliased = new Set(slots);
  const stores = [], loads = [];
  // where every load and store lives: its statement list, its position, and the path of enclosing lists
  const visit = (list, path) => list.forEach((s, at) => {
    const frames = [...path, { list, at }];
    if (s.s === "store") stores.push({ s, list, at, frames });
    if (s.s === "load" && aliased.has(s.buf)) loads.push({ s, list, at });
    if (s.body) visit(s.body, frames);
  });
  visit(K.body, []);
  if (stores.length !== 1) return fail(`the kernel has ${stores.length} stores`);
  const st = stores[0];
  // a data-dependent index term that reads an aliased slot is a read of the input at a computed, other element
  const gathers = (e) => IX.loadsOf(e).some((l) => aliased.has(l.v.i));
  const everyIndex = (list, f) => list.every((s) => [...controlIndices(s), ...(s.s === "load" || s.s === "store" ? [s.idx] : [])].every(f) && everyIndex(s.body || [], f));
  if (!everyIndex(K.body, (e) => !gathers(e))) return fail("an index expression reads the mutated input (a gather through it)");
  const key = IX.keyOf(st.s.idx), uses = IX.vars(st.s.idx);
  const top = st.frames[0].at, branchesOnly = st.frames.slice(0, -1).every(({ list, at }) => list[at].s === "if");
  for (const ld of loads) {
    const where = `a load from slot ${ld.s.buf}`;
    if (IX.keyOf(ld.s.idx) !== key) return fail(`${where} reads index ${IX.print(ld.s.idx)}, the store writes ${IX.print(st.s.idx)}`);
    if (ld.list === st.list) {
      if (ld.at > st.at) return fail(`${where} follows the store`);
      for (let j = ld.at + 1; j < st.at; j++) {
        const hit = [...assigned(st.list[j])].find((v) => uses.has(v));
        if (hit) return fail(`index variable ${hit} is reassigned between ${where} and the store`);
      }
    } else if (ld.list === K.body && branchesOnly && ld.at < top) {
      if ([...uses].some((v) => v !== "bid")) return fail(`${where} is outside the store's branch at an index that depends on more than the block`);
      if (!K.body.slice(ld.at + 1, top).some((s) => s.s === "sync")) return fail(`${where} is outside the store's branch with no barrier between them`);
    } else return fail(`${where} is in a different loop or branch than the store`);
  }
  const why = storeInjective(K, st.frames, { limit });
  return why ? fail(why) : { ok: true };
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
