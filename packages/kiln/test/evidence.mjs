// The evidence store and decide.evidence v2 (guide §21–§27): records, dedupe, staleness, legacy import, the
// policy's defer / confirm / separated / within-noise cases, deterministic devices, pinned-partial, activation.
import { deviceId, recordId, sha256Hex, validateRecord } from "@kiln/evidence";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { pipeline } from "../src/std/emmy.js";
import { SimDevice } from "../src/std/devices.js";
import { SPECS, target } from "../src/std/targets.js";
import { EvidenceStore } from "../src/std/store.js";
import { CODEGEN_VERSION, activationOf, contentOf, makeRecord } from "../src/std/records.js";
import { measureProgram } from "../src/std/tune.js";
import { programOf } from "../src/std/program.js";

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };

const sim = new SimDevice(SPECS.rtx5090);
check(sim.evidenceId === "sim:rtx5090", `sim evidence id is ${sim.evidenceId}`);
// a non-deterministic device: records are gpu-timestamp, intervals have width
const fakeGpu = { id: "webgpu", kind: "webgpu", name: "Test GPU", timestamps: true, fingerprint: { vendor: "test", architecture: "t1" }, target: target(SPECS.rtx5090) };
fakeGpu.evidenceId = deviceId("webgpu", fakeGpu.name, fakeGpu.fingerprint);

const g = k.trace("lin", ({ x }) => N.linear(x, N.weight("w", [256, 256])), { x: k.tensor([256, 256]) });
const compile = (store, device, opts = {}) => pipeline({ target: device.target, store }).with(opts.decide ? { decide: opts.decide } : {}).run(g, { ctx: { deviceId: device.evidenceId, store }, params: opts.params });
const sched = (run) => run.decisions.find((d) => d.rule === "schedule");
const kernelFor = (device, knobs) => {
  const run = pipeline({ target: device.target }).with({ decide: k.decide.chain(k.decide.exactly(() => knobs), k.decide.first()) }).run(g, { ctx: { deviceId: device.evidenceId } });
  return programOf(run.graph).kernels[0];
};

// ---------------------------------------------------------------- records, dedupe, staleness
{
  const store = new EvidenceStore();
  const run = compile(store, sim);
  const prog = programOf(run.graph);
  const kern = prog.kernels[0];
  const at = "2026-10-19T12:00:00.000Z";
  const res = await sim.runKernel(kern);
  const r1 = makeRecord({ device: sim, kern, result: res, at, activation: activationOf(kern, { run }) });
  check(validateRecord(r1).ok, "a simulator record validates");
  check(r1.validity.ok && r1.timing.kind === "simulated" && r1.countsProv === "derived" && r1.kernel.contentId === contentOf(kern, sim).contentId, "sim record: valid, simulated, derived counts, content id of the kernel");
  check(r1.activation.ok && r1.activation.notes[0].startsWith("decided by"), `activation ${r1.activation.requested} → ${r1.activation.materialized}`);
  store.add(r1); store.add(makeRecord({ device: sim, kern, result: res, at, activation: activationOf(kern, { run }) }));
  check(store.size === 1, "the same measurement is stored once (content-hash id)");

  // the same option measured again after a code change: the older record goes stale
  const r2 = structuredClone(r1);
  r2.at = "2026-10-19T13:00:00.000Z"; r2.kernel.contentId = sha256Hex("other code"); delete r2.id; r2.id = recordId(r2);
  store.add(r2);
  check(store.isStale(r1) && !store.isStale(r2), "newest record defines the current content id: the older one is stale");
  store.observe(prog, sim);
  check(!store.isStale(r1) && store.isStale(r2) && store.status(r2) === "stale", "a compile observes the real content id: the other one is stale");
  const old = structuredClone(r1); old.manifest.codegen = "kiln-codegen/0"; old.at = "2026-10-19T14:00:00.000Z"; delete old.id; old.id = recordId(old);
  store.add(old);
  check(store.isStale(old) && !store.isDecisive(old), `a record from an older code generator is stale (${CODEGEN_VERSION} now)`);
  let threw = false; try { store.add({ ...r1, id: "0".repeat(64) }); } catch { threw = true; }
  check(threw, "a record whose id is not its content hash is refused");

  // export → import round trip, and legacy import
  const copy = new EvidenceStore();
  const res2 = copy.import(JSON.parse(JSON.stringify(store.toJSON())));
  check(res2.added === 3 && res2.skipped === 0, `kiln-evidence/2 round trip: ${res2.added} added`);
  const legacy = copy.import({ format: "kiln-evidence/1", rows: [{ device: "sim:rtx5090", identity: kern.identity, name: kern.name, knobs: { ...kern.map }, row: kern.row, us: 12.5, ok: true, by: "measure", t: 0, metrics: { threads: 256, blocks: 64 } }, { device: "webgpu", identity: "x" }] });
  const lr = copy.list({ device: "legacy:sim:rtx5090" })[0];
  check(legacy.added === 1 && legacy.skipped === 1 && lr && lr.timing.kind === "legacy" && copy.status(lr) === "partial" && !copy.isDecisive(lr), "a kiln-evidence/1 row imports as a legacy record: partial, never decisive");
}

// ---------------------------------------------------------------- the policy on the simulator (deterministic)
{
  const store = new EvidenceStore();
  const r0 = compile(store, sim);
  check(sched(r0).by === "model", `no evidence: the model decides (${sched(r0).by})`);
  const m = await measureProgram(programOf(r0.graph), sim, { store, run: r0 });
  check(m.kernels.every((x) => x.record?.validity.ok), "measuring the program stores valid records");
  const r1 = compile(store, sim);
  check(sched(r1).by === "evidence" && sched(r1).note === "confirms the model", `measured favourite: by ${sched(r1).by} (${sched(r1).note})`);
  // a faster option on a deterministic device wins over the model's choice: zero-width intervals are separated
  // whenever the medians differ, which is Kiln's old rule (the record's time is a fixture, not a simulation)
  const fav = sched(r1).knobs;
  const other = sched(r1).options.find((o) => k.knobs.canonical(o.knobs) !== k.knobs.canonical(fav)).knobs;
  store.add(makeRecord({ device: sim, kern: kernelFor(sim, other), result: { samples: [m.total / 2], kind: "simulated", reps: 1, check: { ok: true, n: 64 } } }));
  const r2 = compile(store, sim);
  check(sched(r2).by === "evidence" && /separated/.test(sched(r2).note) && k.knobs.canonical(sched(r2).knobs) === k.knobs.canonical(other), `simulator: a faster measured option overrides the model (${sched(r2).note})`);
}

// ---------------------------------------------------------------- the policy on a device with noise
{
  const store = new EvidenceStore();
  const r0 = compile(store, fakeGpu);
  const d0 = sched(r0);
  const fav = d0.knobs;
  const other = d0.options.find((o) => k.knobs.canonical(o.knobs) !== k.knobs.canonical(fav)).knobs;
  const put = (knobs, samples, at) => {
    const kern = kernelFor(fakeGpu, knobs);
    store.add(makeRecord({ device: fakeGpu, kern, result: { samples, kind: "gpu-timestamp", reps: samples.length, check: { ok: true, n: 64, maxAbs: 0 } }, at }));
  };
  put(other, [5.0, 5.1, 4.9, 5.05, 4.95, 5.02, 4.98], "2026-10-19T12:00:00.000Z");
  check(sched(compile(store, fakeGpu)).by === "model", "only a non-favourite measured: evidence defers to the model");
  put(fav, [9.0, 9.1], "2026-10-19T12:00:01.000Z");
  check(sched(compile(store, fakeGpu)).by === "model", "favourite measured with n = 2 < minReps: still the model");
  put(fav, [9.05, 8.95, 9.02, 8.98, 9.01], "2026-10-19T12:00:02.000Z");
  const r1 = compile(store, fakeGpu);
  check(sched(r1).by === "evidence" && /separated/.test(sched(r1).note) && k.knobs.canonical(sched(r1).knobs) === k.knobs.canonical(other), `separated intervals switch: ${sched(r1).note}`);

  const near = new EvidenceStore();
  const putN = (knobs, samples, at) => near.add(makeRecord({ device: fakeGpu, kern: kernelFor(fakeGpu, knobs), result: { samples, kind: "gpu-timestamp", reps: samples.length, check: { ok: true, n: 64 } }, at }));
  putN(fav, [10, 10.4, 9.6, 10.2, 9.8, 10.1, 9.9], "2026-10-19T12:00:00.000Z");
  putN(other, [9.9, 10.3, 9.5, 10.1, 9.7, 10.0, 9.8], "2026-10-19T12:00:01.000Z");
  const r2 = compile(near, fakeGpu);
  check(sched(r2).by === "model" && /within noise/.test(sched(r2).note) && k.knobs.canonical(sched(r2).knobs) === k.knobs.canonical(fav), `overlapping intervals keep the model: ${sched(r2).note}`);

  const wall = new EvidenceStore();
  wall.add(makeRecord({ device: { ...fakeGpu, timestamps: false }, kern: kernelFor(fakeGpu, other), result: { samples: [1, 1, 1, 1, 1], kind: "wall-clock", reps: 5, check: { ok: true, n: 64 } } }));
  check(wall.status(wall.list()[0]) === "partial" && sched(compile(wall, fakeGpu)).by === "model", "wall-clock records are partial and never decide");
}

// ---------------------------------------------------------------- pins: partial pins and activation
{
  const store = new EvidenceStore();
  const r = compile(store, sim, { params: { MAP: "tiled" } });
  const d = sched(r);
  check(d.by === "pinned-partial" && /MAP pinned; the rest by model/.test(d.note) && d.knobs.MAP === "tiled", `pinned-partial: ${d.note}`);
  const kern = programOf(r.graph).kernels[0];
  check(activationOf(kern, { run: r }).ok, "a honoured pin activates");
  const bad = activationOf({ ...kern, map: { ...kern.map, MAP: "row" }, row: "MAP=row" }, { run: r });
  check(!bad.ok && /not honoured/.test(bad.notes[0]), `a pin that did not materialise fails activation: ${bad.notes[0]}`);
  const rec = makeRecord({ device: sim, kern, result: await sim.runKernel(kern), activation: bad });
  check(!rec.validity.ok && rec.validity.reasons.some((x) => x.startsWith("activation:")), "…and makes the record invalid");
  const kp = activationOf(kern, { kernelPins: { [kern.identity]: "MAP=row" } });
  check(!kp.ok && kp.requested === "MAP=row", "a kernel pin the kernel does not match fails activation");
}

console.log(fails ? `${fails} FAILED` : "all evidence checks pass");
process.exitCode = fails ? 1 : 0;
