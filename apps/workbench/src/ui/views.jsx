import React from "react";
import { wb } from "./wb.js";
import { CodePane, Reference } from "./Ide.jsx";
import { AgentPanel } from "./Agent.jsx";
import { IrView, GraphView, TraceView } from "./Compiler.jsx";
import { KnobsView } from "./Knobs.jsx";
import { KernelsView } from "./Kernels.jsx";
import { PerfView, TuneView, DevicesView } from "./Perf.jsx";
import { EventsView } from "./Events.jsx";
import { EvidenceView } from "./Evidence.jsx";
import { HypothesesView } from "./Hypotheses.jsx";
import { JobsView, ServerLine } from "./Jobs.jsx";
import { NotesView } from "./Notes.jsx";
import { agent } from "../agent/agent.js";

// Every view the layout can place. `col` views stack their parts vertically; the others lay out a main
// area and a side panel in a row, which wraps below the main area in a narrow tile.
export const VIEWS = {
  notes: { title: "Notes", about: "the project's tutorial: the idea, the maths, what to try", col: true, el: () => <NotesView /> },
  code: { title: "Code", about: "the project script, its parameters and checks", col: true, el: () => <CodePane />, badge: () => { const n = wb.diags.filter((d) => d.level === "error").length; return n ? [n, true] : null; } },
  agent: { title: "Agent", about: "the coding agent that works on the compiler", col: true, el: () => <AgentPanel />, badge: () => (agent.busy ? ["…", false] : null) },
  reference: { title: "Reference", about: "the kiln API and the agent's guidelines", col: true, el: () => <Reference /> },
  ir: { title: "IR", about: "every IR level as text, or the graph after any step", el: () => <IrView />, badge: () => (wb.run && !wb.run.ok ? ["!", true] : null) },
  graph: { title: "Graph", about: "the selected IR level as a DAG", el: () => <GraphView /> },
  trace: { title: "Trace", about: "each pass's rewrites, declines and forks, with diffs", el: () => <TraceView />, badge: () => (wb.run ? [wb.run.steps.filter((s) => s.kind === "rewrite").length, false] : null) },
  kernels: { title: "Kernels", about: "generated CUDA and WGSL, kernel IR, launch configs", col: true, el: () => <KernelsView />, badge: () => (wb.prog ? [wb.prog.kernels.length, false] : null) },
  perf: { title: "Perf", about: "measure on a device: time, metrics, roofline, checks", el: () => <PerfView />, badge: () => { const m = wb.measures[wb.deviceId]; const bad = m ? m.kernels.filter((x) => x.error || x.check?.ok === false).length : 0; return bad ? [bad, true] : null; } },
  knobs: { title: "Knobs", about: "forks, options with model and measured times, pins, sliders", el: () => <KnobsView />, badge: () => (wb.run?.decisions.length ? [wb.run.decisions.length, false] : null) },
  tune: { title: "Tune", about: "autotuning: SP-MCTS or sweep over the program's forks", el: () => <TuneView />, badge: () => (wb.tuning?.running ? [wb.tuning.history.length, false] : null) },
  evidence: { title: "Evidence", about: "measurement records: status, samples, validity; import, export, forget", el: () => <EvidenceView />, badge: () => { const n = wb.store.list({ device: wb.evidenceId, status: "invalid" }).length; return n ? [n, true] : null; } },
  hypotheses: { title: "Hypotheses", about: "the project's claims, judged against the evidence: supported, refuted or open", col: true, el: () => <HypothesesView />, badge: () => { const hs = wb.hypotheses, bad = hs.filter((h) => h.verdict === "refuted" || h.verdict === "unqualified").length; return bad ? [bad, true] : hs.length ? [hs.length, false] : null; } },
  devices: { title: "Devices", about: "simulated GPUs, WebGPU, a CUDA runner, and the Kiln server's executors", col: true, el: () => <><ServerLine /><DevicesView /></> },
  jobs: { title: "Jobs", about: "CUDA jobs on the Kiln server: proposed, approved, running, done; their events and records", el: () => <JobsView />, badge: () => { const n = wb.jobs.filter((j) => j.status === "proposed").length; return n ? [n, false] : wb.jobs.some((j) => j.status === "running" || j.status === "approved") ? ["…", false] : null; } },
  events: { title: "Events", about: "the workbench log and the last compile's events", el: () => <EventsView /> },
};
