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
import { LabView } from "./lab/LabView.jsx";
import { BoardView } from "./lab/board.jsx";
import { labs } from "./lab/state.js";
import { isBoardView } from "./dock.js";
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
  devices: { title: "Devices", about: "simulated GPUs, WebGPU, and the Kiln server's hosts with their capability documents", col: true, el: () => <><ServerLine /><DevicesView /></> },
  jobs: { title: "Jobs", about: "jobs on the Kiln server's hosts: captures, verdicts, plans, events, archives and records; dry runs", el: () => <JobsView />, badge: () => { const n = wb.jobs.filter((j) => j.status === "proposed").length; return n ? [n, false] : wb.jobs.some((j) => j.status === "running" || j.status === "approved" || j.status === "importing") ? ["…", false] : null; } },
  events: { title: "Events", about: "the workbench log and the last compile's events", el: () => <EventsView /> },
  lab: { title: "Lab", about: "lab programs: Perf Lab's experiments, boards and hypotheses over imported runs", col: true, el: () => <LabView />, badge: () => labs.badge() },
};

/** A view's definition: a fixed view, or a board of the open lab program ("board:<id>"). */
export function viewDef(id) {
  if (VIEWS[id]) return VIEWS[id];
  const b = isBoardView(id) ? id.slice(6) : null;
  const sum = labs.current?.ir?.boards.find((x) => x.id === b);
  return { title: sum ? `${labs.current.short} · ${sum.title || b}` : `Board ${b}`, about: sum ? `board ${sum.index + 1} of ${labs.current.title}` : "a board of a lab program that is not open", col: true, el: () => <BoardView id={b} /> };
}

/** The views a + menu offers: the fixed ones, then the open lab program's boards. */
export const addableViews = () => [...Object.keys(VIEWS), ...(labs.current?.ir?.boards ?? []).map((b) => `board:${b.id}`)];
