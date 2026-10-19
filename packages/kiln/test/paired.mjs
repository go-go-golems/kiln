// Paired comparisons (guide §28, Phase 6): measurePaired compiles one kernel under two schedules, runs both in one
// protocol run, and ev.ratio reads the shared pairId with the paired estimator.
import { deviceId, validateRecord } from "@kiln/evidence";
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { Project, std } from "../src/std/index.js";
import { pipeline } from "../src/std/emmy.js";
import { SimDevice } from "../src/std/devices.js";
import { SPECS, target } from "../src/std/targets.js";
import { EvidenceStore } from "../src/std/store.js";
import { canonRow } from "../src/std/tile.js";
import { makeRecord } from "../src/std/records.js";
import { evaluateHypotheses, evidenceContext } from "../src/std/evidence-context.js";
import { measurePaired } from "../src/std/tune.js";
import { programOf } from "../src/std/program.js";

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };

const project = new Project("rmsnorm")
  .program(({ x }) => ({ y: N.rms_norm(x, std.weight("w", [4096]), { eps: 1e-6 }) }), { x: k.tensor([1024, 4096]) })
  .hypothesis("row-beats-thread", (h) => h
    .claim("one row per block is at least twice as fast as one element per thread")
    .predicts((ev) => ev.ratio("k_rms_norm_reduce", { a: "MAP=thread", b: "MAP=row" }), (r) => std.evidence.below(r, 0.5)));
const graph = project.graph();

// A GPU whose clock state changes between repetitions: every sample of a repetition is scaled by the same factor,
// so unpaired intervals are wide while the per-repetition ratio is exact.
const CLOCK = [1, 3, 1, 1, 3, 1, 3];
const BASE = { thread: 10, row: 4 };
const calls = [];
const gpu = {
  id: "webgpu", kind: "webgpu", name: "Clocked GPU", timestamps: true, fingerprint: { vendor: "test", architecture: "clock" }, target: target(SPECS.rtx5090),
  async measureKernels(kernels, _opts, { onStep } = {}) {
    calls.push(kernels.map((kn) => kn.row));
    onStep?.(kernels.length * CLOCK.length, kernels.length * CLOCK.length);
    return kernels.map((kn) => {
      const samples = CLOCK.map((f) => BASE[kn.map.MAP] * f);
      return { kind: "gpu-timestamp", reps: CLOCK.length, samples, us: [...samples].sort((a, b) => a - b)[3], seed: 1, position: CLOCK.map(() => 0), check: { ok: true, n: 64, maxAbs: 0 } };
    });
  },
};
gpu.evidenceId = deviceId("webgpu", gpu.name, gpu.fingerprint);

const pipe = pipeline({ target: gpu.target });
const run0 = pipe.run(graph, { ctx: { deviceId: gpu.evidenceId } });
const fork = run0.decisions.find((d) => d.rule === "schedule");
const rowOf = (pred) => canonRow(fork.options.find((o) => pred(o.knobs)).knobs);
const threadRow = rowOf((kn) => kn.MAP === "thread"), rowRow = rowOf((kn) => kn.MAP === "row");
const identity = fork.key;
check(threadRow && rowRow && threadRow !== rowRow, `two schedules of one kernel: ${threadRow} vs ${rowRow}`);

// ---------------------------------------------------------------- paired
{
  const store = new EvidenceStore();
  const { pairId, sides } = await measurePaired({ pipeline: pipe, graph, device: gpu, store, identity, rows: [threadRow, rowRow] });
  check(calls.length === 1 && calls[0].length === 2, "both sides run in one protocol run");
  check(sides.every((s) => s.record?.protocol.pairId === pairId), `both records carry the pair id ${pairId.slice(0, 8)}…`);
  check(sides.every((s) => validateRecord(s.record).ok && s.record.validity.ok), "both records validate and are valid");
  check(sides.every((s) => s.record.activation.ok && s.record.activation.requested === s.row), "activation: each side ran the schedule it pinned");
  const prog = programOf(run0.graph);
  const { ev } = evidenceContext({ store, prog, device: gpu.evidenceId, target: gpu.target });
  const r = ev.ratio("k_rms_norm_reduce", { a: "MAP=thread", b: "MAP=row" });
  check(r.paired && Math.abs(r.ratio.value - 0.4) < 1e-9 && r.hi.value < 0.4 + 1e-9, `paired ratio ${r.ratio.value} [${r.lo.value}, ${r.hi.value}] n=${r.n}`);
  check(/paired ratio/.test(r.ratio.method || ""), `method: ${r.ratio.method}`);
  const [h] = evaluateHypotheses(project, { store, prog, device: gpu.evidenceId, target: gpu.target });
  check(h.verdict === "supported", `the hypothesis is ${h.verdict} from the paired run`);

  // the same samples without a pair id: a ratio of medians whose interval spans the clock states
  const loose = new EvidenceStore();
  for (const s of sides) loose.add(makeRecord({ device: gpu, kern: s.kern, result: s.result, activation: s.record.activation }));
  const u = evidenceContext({ store: loose, prog, device: gpu.evidenceId, target: gpu.target }).ev.ratio("k_rms_norm_reduce", { a: "MAP=thread", b: "MAP=row" });
  check(!u.paired && u.hi.value > 0.5, `unpaired: ratio of medians, interval [${u.lo.value.toFixed(3)}, ${u.hi.value.toFixed(3)}]`);
  const [hu] = evaluateHypotheses(project, { store: loose, prog, device: gpu.evidenceId, target: gpu.target });
  check(hu.verdict === "open", `unpaired, the same data leaves it open: the interval straddles 0.5 (${hu.verdict})`);
}

// ---------------------------------------------------------------- refusals
{
  let msg = null;
  try { await measurePaired({ pipeline: pipe, graph, device: gpu, identity, rows: [rowRow, rowRow] }); } catch (e) { msg = e.message; }
  check(/same schedule/.test(msg || ""), `one schedule twice is refused: ${msg}`);
  msg = null;
  try { await measurePaired({ pipeline: pipe, graph, device: gpu, identity, rows: [rowRow, "MAP=row,TPB=7"] }); } catch (e) { msg = e.message; }
  check(/could not honour/.test(msg || ""), `a row the compile cannot honour is refused before measuring: ${msg}`);
  msg = null;
  try { await measurePaired({ pipeline: pipe, graph, device: gpu, identity, rows: [rowRow] }); } catch (e) { msg = e.message; }
  check(/at least two/.test(msg || ""), "one side is refused");
}

// ---------------------------------------------------------------- a device without a protocol (the simulator)
{
  const sim = new SimDevice(SPECS.rtx5090);
  const store = new EvidenceStore();
  const simPipe = pipeline({ target: sim.target });
  const { pairId, sides } = await measurePaired({ pipeline: simPipe, graph, device: sim, store, identity, rows: [threadRow, rowRow] });
  check(sides.every((s) => s.record?.protocol.pairId === pairId && s.record.validity.ok), "simulator: both records valid and paired");
  const prog = programOf(simPipe.run(graph, { ctx: { deviceId: sim.evidenceId } }).graph);
  const r = evidenceContext({ store, prog, device: sim.evidenceId, target: sim.target }).ev.ratio("k_rms_norm_reduce", { a: "MAP=thread", b: "MAP=row" });
  check(r.paired && r.lo.value === r.hi.value && r.ratio.prov === "heuristic", `simulator: a zero-width paired ratio ${r.ratio.value.toFixed(4)}, heuristic`);
}

console.log(fails ? `${fails} FAILED` : "all paired checks pass");
process.exit(fails ? 1 : 0);
