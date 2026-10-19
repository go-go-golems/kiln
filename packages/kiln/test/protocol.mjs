// The measurement protocol's bookkeeping (guide §28), without a GPU: seeded kernel order per repetition,
// per-repetition medians, positions, the check on the first completed repetition, failed repetitions kept, and
// measureProgram batching a device that has measureKernels.
import { deviceId, validateRecord } from "@kiln/evidence";
import { k } from "../src/core/kiln.js";
import { median } from "../src/core/util.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { deadline, repetitionOrder, runProtocol, timerQuantum } from "../src/std/devices.js";
import { SPECS, target } from "../src/std/targets.js";
import { EvidenceStore } from "../src/std/store.js";
import { makeRecord } from "../src/std/records.js";
import { measureProgram } from "../src/std/tune.js";
import { programOf } from "../src/std/program.js";

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- order
{
  const o = repetitionOrder(5, 1, 0);
  check(same([...o].sort(), [0, 1, 2, 3, 4]), `an order is a permutation: ${o}`);
  check(same(o, repetitionOrder(5, 1, 0)), "the same seed and repetition give the same order");
  const orders = Array.from({ length: 8 }, (_, rep) => repetitionOrder(5, 1, rep).join(""));
  check(new Set(orders).size > 4, `orders change between repetitions (${new Set(orders).size} distinct of 8)`);
  check(!same(orders, Array.from({ length: 8 }, (_, rep) => repetitionOrder(5, 2, rep).join(""))), "another seed gives other orders");
  check(same(repetitionOrder(1, 7, 3), [0]) && same(repetitionOrder(0, 1, 0), []), "one kernel and no kernels");
  // each kernel takes each position about equally often
  const counts = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let rep = 0; rep < 600; rep++) repetitionOrder(3, 1, rep).forEach((i, pos) => counts[i][pos]++);
  check(counts.flat().every((c) => c > 150 && c < 250), `positions are balanced over 600 repetitions: ${JSON.stringify(counts)}`);
}

// ---------------------------------------------------------------- timer resolution
{
  // Chrome 155 on macOS without --enable-unsafe-webgpu: launch times on a 65.536 µs grid (diary 04, Step 4)
  check(timerQuantum([196.608, 262.144, 196.608, 196.608, 262.144, 131.072]) === 65.536, "a coarsened timer is found: 65.536 µs");
  // with the flag: an Apple GPU timer, values in ns ticks; no grid at the µs scale
  const fine = timerQuantum([220.25, 220.875, 222.125, 220.292, 220.542, 219.75, 219.833, 220.5, 219.625, 219.5]);
  check(fine === null || fine < 1, `a fine timer is not mistaken for a coarse one (${fine})`);
  check(timerQuantum([0, 0, 0]) === Infinity && timerQuantum([5, 5]) === null && timerQuantum([]) === null, "every launch at 0 is flagged; one repeated value tells nothing");
}

// ---------------------------------------------------------------- a GPU that stops answering
{
  const late = await deadline(new Promise(() => {}), 20, "no answer from the GPU within 0.02 s").then(() => "settled", (e) => e.message);
  check(late === "no answer from the GPU within 0.02 s", `a hung context fails its repetition: ${late}`);
  check((await deadline(Promise.resolve(7), 1000, "x")) === 7, "work that answers in time passes through");
  const out = await runProtocol([{ name: "hang" }], { reps: 2, warmup: 0, launches: 1, seed: 1 }, (_, { rep }) => (rep === 0 ? deadline(new Promise(() => {}), 10, "no answer from the GPU within 0.01 s") : { times: [3] }), { kind: "gpu-timestamp" });
  check(out[0].samples.length === 1 && out[0].repErrors?.[0] === "repetition 0: no answer from the GPU within 0.01 s", "…and the protocol keeps going, with the error kept");
}

// ---------------------------------------------------------------- bookkeeping
const kernels = [{ name: "a" }, { name: "b" }, { name: "c" }];
const proto = { reps: 5, warmup: 2, launches: 4, seed: 1 };
{
  const calls = [];
  const out = await runProtocol(kernels, proto, async (kern, { rep, position, check: ck }) => {
    calls.push({ name: kern.name, rep, position, ck });
    const base = { a: 10, b: 20, c: 30 }[kern.name];
    return { times: [base + rep, base + rep + 1, base + rep - 1, base + rep + 100], check: ck ? { ok: true, n: 8 } : null };
  }, { kind: "gpu-timestamp" });
  check(calls.length === 15, "every kernel runs once per repetition");
  for (let rep = 0; rep < 5; rep++) check(same(calls.filter((c) => c.rep === rep).map((c) => kernels.findIndex((x) => x.name === c.name)), repetitionOrder(3, 1, rep)), `repetition ${rep} runs in the seeded order`);
  check(calls.filter((c) => c.ck).length === 3 && calls.filter((c) => c.ck).every((c) => c.rep === 0), "the output check runs once per kernel, in its first repetition");
  const a = out[0];
  check(same(a.samples, [10.5, 11.5, 12.5, 13.5, 14.5]) && a.raw.length === 5 && a.raw[0].length === 4, `a repetition's sample is the median of its launches: ${a.samples}`);
  check(a.us === median(a.samples) && a.kind === "gpu-timestamp" && a.reps === 5 && a.launches === 4 && a.warmup === 2 && a.seed === 1, "the result carries the protocol");
  check(same(a.position, [0, 1, 2, 3, 4].map((rep) => repetitionOrder(3, 1, rep).indexOf(0))), `positions follow the orders: ${a.position}`);
  check(a.check?.ok === true && !a.repErrors && !a.error, "a clean kernel: check kept, no errors");
}
{
  // b fails in repetitions 0 and 2; c fails everywhere
  const out = await runProtocol(kernels, proto, async (kern, { rep, check: ck }) => {
    if (kern.name === "c") throw new Error("pipeline: invalid WGSL");
    if (kern.name === "b" && (rep === 0 || rep === 2)) throw new Error("device lost");
    return { times: [5, 6, 7], check: ck ? { ok: true, n: 8, rep } : null };
  }, { kind: "wall-clock" });
  const b = out[1], c = out[2];
  check(b.samples.length === 3 && b.position.length === 3 && same(b.repErrors, ["repetition 0: device lost", "repetition 2: device lost"]), `failed repetitions are kept as errors: ${b.repErrors}`);
  check(b.check?.rep === 1, "the check moves to the first repetition that completed");
  check(c.samples.length === 0 && c.us === Infinity && c.error === "all 5 repetitions failed; repetition 0: pipeline: invalid WGSL", `a kernel that never ran: ${c.error}`);
  const empty = await runProtocol(kernels, proto, async () => ({ times: [Number.NaN] }), { kind: "gpu-timestamp" });
  check(empty[0].error?.includes("no timed launch completed"), "launch times that are not finite are an error, not a sample");

  // what the records say
  const g = k.trace("lin", ({ x }) => N.linear(x, N.weight("w", [64, 64])), { x: k.tensor([64, 64]) });
  const kern = programOf(pipeline().run(g).graph).kernels[0];
  const gpu = { id: "webgpu", kind: "webgpu", name: "Test GPU", timestamps: false, fingerprint: { vendor: "test" }, target: target(SPECS.rtx5090) };
  gpu.evidenceId = deviceId("webgpu", gpu.name, gpu.fingerprint);
  const rb = makeRecord({ device: gpu, kern, result: b });
  check(validateRecord(rb).ok && !rb.validity.ok && same(rb.validity.reasons, ["small n: 3 of 5 repetitions completed", "repetition error: repetition 0: device lost", "repetition error: repetition 2: device lost"]), `partial repetitions: an invalid record that says why (${rb.validity.reasons.length} reasons)`);
  check(same(rb.validity.partial, ["wall clock: includes submit and readback overhead"]) && rb.protocol.position.length === 3 && rb.timing.raw.length === 3, "wall clock is a partial caveat; positions and raw launches are kept");
  const rc = makeRecord({ device: gpu, kern, result: c });
  check(validateRecord(rc).ok && !rc.validity.ok && rc.validity.reasons[0] === "repetition error: all 5 repetitions failed; repetition 0: pipeline: invalid WGSL" && rc.timing.samples.length === 0, "no repetition: an invalid record with the error");
  const seeded = makeRecord({ device: gpu, kern, result: { ...b, seed: 9 } });
  check(seeded.protocol.seed === 9, "the record keeps the protocol seed");
  const coarse = makeRecord({ device: { ...gpu, timestamps: true }, kern, result: { samples: [65.536, 65.536, 131.072], kind: "gpu-timestamp", reps: 3, check: { ok: true, n: 8 }, partial: ["timestamps quantized to 65.536 µs by the browser"] } });
  const cs = new EvidenceStore([coarse]);
  check(coarse.validity.ok && cs.status(coarse) === "partial" && !cs.isDecisive(coarse), "a record from a coarse timer is valid but partial: it never decides");
}

// ---------------------------------------------------------------- measureProgram with a protocol device
{
  const g = k.trace("mlp", ({ x }) => N.linear(N.silu(N.linear(x, N.weight("up", [128, 64]))), N.weight("down", [64, 128])), { x: k.tensor([32, 64]) });
  const run = pipeline().run(g);
  const prog = programOf(run.graph);
  let batches = 0, steps = [];
  const gpu = {
    id: "webgpu", kind: "webgpu", name: "Test GPU", timestamps: true, fingerprint: { vendor: "test" }, target: target(SPECS.rtx5090),
    async measureKernels(ks, opts, { onStep } = {}) {
      batches++;
      return runProtocol(ks, { reps: 4, warmup: 1, launches: 3, seed: 1 }, async (kn, { check: ck }) => ({ times: [kn.K.grid / 100, kn.K.grid / 100 + 1, kn.K.grid / 100 + 2], check: ck ? { ok: true, n: 16, maxAbs: 0 } : null }), { kind: "gpu-timestamp", onStep });
    },
    async runKernel() { throw new Error("runKernel must not be called for a protocol device"); },
  };
  gpu.evidenceId = deviceId("webgpu", gpu.name, gpu.fingerprint);
  const store = new EvidenceStore(), memo = new Map();
  const m = await measureProgram(prog, gpu, { store, memo, run, onStep: (d, t) => steps.push(`${d}/${t}`) });
  check(batches === 1 && m.kernels.length === prog.kernels.length, `one protocol run for ${prog.kernels.length} kernels`);
  check(steps.length === 4 * prog.kernels.length && steps.at(-1) === `${4 * prog.kernels.length}/${4 * prog.kernels.length}`, `progress reported per kernel and repetition (${steps.at(-1)})`);
  const recs = store.list();
  check(recs.length === prog.kernels.length && recs.every((r) => r.validity.ok && r.timing.kind === "gpu-timestamp" && r.timing.samples.length === 4 && r.protocol.reps === 4 && r.protocol.position.length === 4 && r.activation.ok), "one valid 4-repetition record per kernel, with positions and activation");
  check(recs.every((r) => store.status(r) === "fresh" && store.isDecisive(r)), "the records are fresh and may decide");
  await measureProgram(prog, gpu, { store, memo, run });
  check(batches === 1 && store.size === prog.kernels.length, "a memoised program is not measured again");
  // a compile on this device now decides on the records (n = 4 ≥ minReps)
  const again = pipeline({ store }).run(g, { ctx: { deviceId: gpu.evidenceId, store } });
  const by = again.decisions.filter((d) => d.rule === "schedule").map((d) => d.by);
  check(by.every((b) => b === "evidence"), `the next compile decides by evidence: ${by}`);
}

console.log(fails ? `${fails} FAILED` : "all protocol checks pass");
process.exitCode = fails ? 1 : 0;
