// Hypotheses (guide §29): Project.hypothesis, the evidence context `ev`, and the verdicts over a store.
import { k } from "../src/core/kiln.js";
import { N } from "../src/std/tensor.js";
import { Project, std } from "../src/std/index.js";
import { pipeline } from "../src/std/emmy.js";
import { SimDevice } from "../src/std/devices.js";
import { SPECS } from "../src/std/targets.js";
import { EvidenceStore } from "../src/std/store.js";
import { makeRecord } from "../src/std/records.js";
import { evaluateHypotheses, evidenceContext } from "../src/std/evidence-context.js";
import { measureProgram } from "../src/std/tune.js";
import { programOf } from "../src/std/program.js";

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };

const sim = new SimDevice(SPECS.rtx5090);
const project = new Project("rmsnorm")
  .program(({ x }) => ({ y: N.rms_norm(x, std.weight("w", [4096]), { eps: 1e-6 }) }), { x: k.tensor([1024, 4096]) })
  .hypothesis("row-beats-thread", (h) => h
    .claim("For rows of 4096, one row per block is at least twice as fast as one element per thread.")
    .predicts((ev) => ev.ratio("k_rms_norm_reduce", { a: "MAP=thread", b: "MAP=row" }), (r) => r.hi < 0.5)
    .alternatives("A block per row leaves SMs idle when there are fewer rows than SM slots")
    .scope("the current device; fp32; default sliders"))
  .hypothesis("predicate-throws", (h) => h.claim("x").predicts((ev) => ev.kernels(), () => { throw new Error("boom"); }))
  .hypothesis("unknown-kernel", (h) => h.claim("x").predicts((ev) => ev.ratio("k_nope", { a: "MAP=thread", b: "MAP=row" }), (r) => r.hi < 1))
  .hypothesis("total-under-1ms", (h) => h.claim("the program takes less than 1 ms").predicts((ev) => ev.total(), (r) => r.hi < 1000));

let threw = null;
try { new Project("p").hypothesis("a", () => {}).hypothesis("a", () => {}); } catch (e) { threw = e.message; }
check(/declared twice/.test(threw || ""), "a hypothesis id is declared once");

const store = new EvidenceStore();
const g = project.graph();
const compile = (params) => pipeline({ target: sim.target, store }).run(g, { ctx: { deviceId: sim.evidenceId, store }, params });
const judge = (run) => Object.fromEntries(evaluateHypotheses(project, { store, prog: programOf(run.graph), device: sim.evidenceId, target: sim.target }).map((h) => [h.id, h]));

// nothing measured
let run = compile();
let H = judge(run);
check(H["row-beats-thread"].verdict === "open" && /missing hi \(no measurement of MAP=/.test(H["row-beats-thread"].reasons[0]) && H["row-beats-thread"].basis === "none", `before measuring: open (${H["row-beats-thread"].reasons[0]})`);
check(H["predicate-throws"].verdict === "open" && /threw: boom/.test(H["predicate-throws"].reasons[0]), "a throwing predicate is open, with the error");
check(H["unknown-kernel"].verdict === "open" && /no kernel "k_nope"/.test(H["unknown-kernel"].error), `rows that throw are open: ${H["unknown-kernel"].error}`);
check(H["total-under-1ms"].verdict === "open", "total before measuring: open");

// the program's own kernel (MAP=row) measured: one side still missing
const row = run;
await measureProgram(programOf(row.graph), sim, { store, run: row });
H = judge(compile());
check(H["row-beats-thread"].verdict === "open" && /MAP=thread/.test(H["row-beats-thread"].reasons[0]), `one side measured: open (${H["row-beats-thread"].reasons[0]})`);
check(H["total-under-1ms"].verdict === "supported" && H["total-under-1ms"].basis === "simulated", `total measured on the simulator: ${H["total-under-1ms"].verdict} (${H["total-under-1ms"].rows[0].total})`);

// pin MAP=thread and measure that program too
const thread = compile({ MAP: "thread" });
await measureProgram(programOf(thread.graph), sim, { store, run: thread });
run = compile();
H = judge(run);
const r = H["row-beats-thread"].rows[0];
check(["supported", "refuted"].includes(H["row-beats-thread"].verdict) && H["row-beats-thread"].basis === "simulated" && r.ratio.prov === "heuristic" && !r.paired,
  `both measured: ${H["row-beats-thread"].verdict} — ratio ${(+r.ratio).toFixed(3)} (${r.b} / ${r.a}), interval [${(+r.lo).toFixed(3)}, ${(+r.hi).toFixed(3)}], ${r.ratio.prov}`);
check(H["row-beats-thread"].support.length >= 2, `support lists the records read (${H["row-beats-thread"].support.length})`);

// ev rows carry provenance
const { ev } = evidenceContext({ store, prog: programOf(run.graph), device: sim.evidenceId, target: sim.target });
const kr = ev.kernels()[0];
check(kr.model.prov === "heuristic" && kr.time.prov === "heuristic" && kr.n === 1 && /simulator/.test(kr.time.method), `ev.kernels: model ${(+kr.model).toFixed(1)} µs, simulated ${(+kr.time).toFixed(1)} µs, both heuristic`);
const opts = ev.options("k_rms_norm_reduce");
check(opts.length === 2 && opts.filter((o) => o.chosen).length === 1, `ev.options: ${opts.map((o) => `${o.row}${o.chosen ? " (chosen)" : ""}`).join(", ")}`);
let mutated = false; try { ev.records()[0].by = "x"; mutated = true; } catch {}
check(!mutated, "ev.records() is read-only");

// a fresh invalid record of an option the prediction reads makes the verdict unqualified
const kern = programOf(run.graph).kernels[0];
store.add(makeRecord({ device: sim, kern, result: await sim.runKernel(kern), activation: { requested: "MAP=tiled", materialized: kern.row, ok: false, notes: ["test"] }, at: new Date(Date.now() + 1000).toISOString() }));
H = judge(compile());
check(H["row-beats-thread"].verdict === "unqualified" && /activation/.test(H["row-beats-thread"].reasons[0]), `an invalid supporting record: unqualified (${H["row-beats-thread"].reasons[0]})`);

console.log(fails ? `${fails} FAILED` : "all hypothesis checks pass");
process.exitCode = fails ? 1 : 0;
