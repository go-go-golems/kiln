// std: the standard library the workbench scripts and the agent see.
import { k, P } from "../core/kiln.js";
import { Tensor } from "../core/util.js";
import { roundToDtype } from "../core/dtypes.js";
import * as IX from "../core/ix.js";
import { nn, tensor, N, T, weight, decompose, decomposition, optimization, composeViews } from "./tensor.js";
import { loop, E, schedule, printNest, lift, fuse, stamp, mergeLoopOps, createFusionRule, chooseFusionSubset, inlineInto, workOf, runSerial, freshR, printE, liftEw, liftReduce, liftView } from "./loop.js";
import { tile, tilePass, scheduleRule, costPrior, analyze, estimate, timeModel, launch, KNOBS, MAP, TPB, COARSEN, STAGE, BM, BN, BK, TM, TN, canonRow, forkTree, legalMaps } from "./tile.js";
import { kern, kernelPass, materialize, materializeRule, dropRedundantSyncs, KB, kx, printKernelBody } from "./kernel.js";
import { gpu, emitPass, emitRule, programOf, simulateKernel, kernelInputs, referenceAt } from "./program.js";
import { toCuda, toWgsl, toSim } from "./emit.js";
import { pipeline, defaultDecide, IRS, passes, dialects } from "./emmy.js";
import { SPECS, target } from "./targets.js";
import { tune, measureProgram, measurePaired, kernelPinPolicy } from "./tune.js";
import { Store, EvidenceStore } from "./store.js";
import { Hypothesis, evidenceContext, evaluateHypotheses } from "./evidence-context.js";
import { above, below, combine, derived, heuristic, isMissing, missing, observed } from "@kiln/evidence";
import { FNS, REDUCERS } from "./fns.js";

export const std = {
  N, T, nn, tensor, weight, decompose, Tensor,
  emmy: { pipeline, defaultDecide, IRS, passes, dialects },
  frontend: { decomposition, optimization, composeViews },
  loop: { dialect: loop, E, schedule, printNest, lift, fuse, stamp, mergeLoopOps, createFusionRule, chooseFusionSubset, inlineInto, workOf, runSerial, freshR, printE, liftEw, liftReduce, liftView },
  tile: { dialect: tile, pass: tilePass, rule: scheduleRule, costPrior, analyze, estimate, timeModel, launch, KNOBS, MAP, TPB, COARSEN, STAGE, BM, BN, BK, TM, TN, canonRow, forkTree, legalMaps },
  kernel: { dialect: kern, pass: kernelPass, materialize, rule: materializeRule, dropRedundantSyncs, KB, kx, print: printKernelBody },
  gpu: { dialect: gpu, pass: emitPass, rule: emitRule, programOf, simulateKernel, kernelInputs, referenceAt, toCuda, toWgsl, toSim },
  targets: SPECS, target, tune, measureProgram, measurePaired, kernelPinPolicy, Store, EvidenceStore, FNS, REDUCERS, ix: IX,
  // the Value constructors, for hypothesis rows a script computes itself (a missing Value keeps its row open with the reason);
  // below/above: three-valued interval tests, so an interval that straddles a bound leaves the hypothesis open
  evidence: { evidenceContext, evaluateHypotheses, missing, derived, heuristic, observed, combine, isMissing, below, above },
};

// ----------------------------------------------------------------------------- projects
// A preset script builds one project: what to compile, with which pipeline, checked how.
export class Project {
  constructor(name) { this.name = name; this._pipe = null; this._prog = null; this._spec = null; this._data = null; this._checks = []; this._params = []; this._pins = {}; this._device = null; this._about = ""; this._notes = []; this._hypotheses = []; }
  pipeline(p) { this._pipe = p && typeof p.build === "function" && !p.run ? p.build() : p; return this; }
  program(fn, inputs = {}) { this._prog = fn; this._spec = inputs; return this; }
  data(obj) { this._data = obj; return this; }
  check(name, fn) { this._checks.push({ name, fn }); return this; }
  params(...ps) { this._params.push(...ps.flat()); return this; }
  pins(obj) { Object.assign(this._pins, obj); return this; }
  device(id) { this._device = id; return this; }
  about(t) { this._about = t; return this; }
  note(t) { this._notes.push(t); return this; }
  // a claim about this program's performance, judged against the evidence store (guide §29)
  hypothesis(id, fn) {
    if (typeof id !== "string" || !/^[a-z0-9][a-z0-9-]*$/i.test(id)) throw new k.KilnError("ProjectError", `hypothesis id must be letters, digits and hyphens (got ${JSON.stringify(id)})`);
    if (this._hypotheses.some((h) => h.id === id)) throw new k.KilnError("ProjectError", `hypothesis "${id}" is declared twice`);
    const h = new Hypothesis(id);
    fn?.(h);
    this._hypotheses.push(h);
    return this;
  }
  get usesGpu() { return !this._pipe || this._pipe.irNames().includes("gpu"); }
  // trace the program with the current param values (sliders can change sizes)
  graph(paramGet = (p) => p.def) {
    if (!this._prog) throw new k.KilnError("ProjectError", `project "${this.name}" has no program: add .program(({ x }) => …, { x: k.tensor([…]) })`);
    if (this._prog instanceof k.Graph) return this._prog;
    const spec = typeof this._spec === "function" ? this._spec({ param: paramGet }) : this._spec;
    const fn = this._prog;
    return k.trace(this.name, (vals) => fn(vals, { param: paramGet }), spec);
  }
  inputsFor(g, { names = null } = {}) {
    const selected = names === null ? null : new Set(names);
    if (selected && (!Array.isArray(names) || selected.size !== names.length || names.some(name => !g.inputs.some(i => i.name === name)))) {
      throw new k.KilnError("ProjectError", "reference input names must be distinct graph inputs");
    }
    const out = {};
    for (const i of g.inputs) {
      if (selected && !selected.has(i.name)) continue;
      const t = g.nodes.get(i.id).type;
      const d = this._data?.[i.name];
      const value = d !== undefined ? d : t?.kind === "tensor" ? Tensor.random(t.shape || [], { seed: 11 + i.name.length, dist: "uniform" }) : 0;
      if (t?.kind === "tensor" && ["f16", "bf16"].includes(t.dtype)) {
        if (!(value instanceof Tensor)) throw new k.KilnError("TypeError", `reference input ${i.name} requires Tensor data`);
        out[i.name] = new Tensor(value.shape, Float32Array.from(value.data, x => roundToDtype(x, t.dtype)));
      } else out[i.name] = value;
    }
    return out;
  }
}
export function makeScriptScope(sink) {
  const project = (name = "project") => { const p = new Project(name); sink.projects.push(p); return p; };
  return { k, P, std, N, T, nn, tensor, Tensor, ix: IX, project, param: k.param, E, KB, kx };
}
