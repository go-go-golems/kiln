---
Title: 'Kiln x Perf Lab: intern guide to the unified GPU kernel workbench'
Ticket: KILN-001
Status: active
Topics:
    - kiln
    - perf-lab
    - gpu
    - compiler
    - evidence
    - frontend
    - design-system
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://imports/Untitled.md
      Note: Comparison memo the guide corrects and extends
    - Path: repo://imports/kiln-workbench-src/kiln-workbench/app/src/core/kiln.js
      Note: Kiln core framework, decide chain and evidence policy (kiln.js:587-597)
    - Path: repo://imports/kiln-workbench-src/kiln-workbench/app/src/std/program.js
      Note: programOf kernel identity and simulator driver
    - Path: repo://imports/kiln-workbench-src/kiln-workbench/app/src/std/store.js
      Note: Kiln evidence store replaced by measurement records
    - Path: repo://imports/kiln-workbench-src/kiln-workbench/app/src/std/tile.js
      Note: timeModel and analytic estimate
    - Path: repo://imports/kiln-workbench-src/kiln-workbench/app/src/ui/forge-base.css
      Note: Kiln design tokens (source of the visual language)
    - Path: repo://lab-workbench/server/app.ts
      Note: Perf Lab HTTP API and client-trusted approval
    - Path: repo://lab-workbench/server/runner.ts
      Note: Perf Lab runner with seeded paired order
    - Path: repo://lab-workbench/src/lang/stats.ts
      Note: Perf Lab paired-ratio estimator
    - Path: repo://lab-workbench/src/lang/values.ts
      Note: Perf Lab provenance classes and sealing
ExternalSources: []
Summary: Intern-level analysis, design and implementation guide for one workbench that combines Kiln's kernel compiler, cost model and simulator with Perf Lab's evidence discipline, in Kiln's Swiss visual language.
LastUpdated: 2026-10-19T13:37:36.775197-04:00
WhatFor: Onboarding an engineer who must understand both source systems and build the unified workbench phase by phase.
WhenToUse: Before changing anything under packages/, apps/ or runner/ in this repository, and before reading either source system in imports/ or lab-workbench/.
---

# Kiln x Perf Lab: intern guide to the unified GPU kernel workbench

This guide is written for an engineer who has not seen either system before. It explains what the two source
systems are, how each one works internally, where each one stops, and how the unified workbench is designed and
built. It is long on purpose: every later section relies on the vocabulary and the mechanisms of the earlier ones.
Read Part 0 and Part I in order; Parts II to VI can be used as reference once the vocabulary is familiar.

## Part 0. How to read this guide

### 0.1 Path conventions

The repository root is `/Volumes/SSD/code/kiln` (the path `~/code/tulip/experiments/kiln` is a symlink to it).
Paths in this guide are relative to that root unless stated otherwise. Three prefixes keep long paths readable:

| Prefix | Expands to | What it is |
| --- | --- | --- |
| `K/` | `imports/kiln-workbench-src/kiln-workbench/` | The Kiln Workbench source as received (zip import, unmodified) |
| `PL/` | `lab-workbench/` | Perf Lab, copied verbatim from Playback's ML-PERF-001 ticket at commit `cdb84891c` |
| `T/` | `ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/` | This ticket's workspace |

A reference such as `K/app/src/core/kiln.js:587-597` names a file and an inclusive line range. Line numbers refer
to the imported snapshot. Once code moves into `packages/` and `apps/` (Part VI), this guide gives the new path
next to the old one.

### 0.2 Evidence tags

Claims about the source systems carry one of two tags, inherited from the four analysis notes in `T/sources/`:

- **[observed]**: read in the code, or produced by running something, with the file or command named.
- **[inferred]**: a consequence of the code that was not executed.

The analysis notes are the long-form evidence behind this guide. When a section here summarises, the matching note
section has the full detail:

| Note | Subject | Lines |
| --- | --- | --- |
| `T/sources/01-perf-lab-language-and-frontend-notes.md` | Perf Lab's `lab.js` language, compiler passes, evidence contract, Redux store, views, visual design | 1750 |
| `T/sources/02-perf-lab-backend-notes.md` | Perf Lab's Hono server, SQLite schema, runner, Python workloads, importers, security | 961 |
| `T/sources/03-kiln-compiler-runtime-notes.md` | Kiln's core framework, six-IR ML stack, code generation, cost model, simulator, tuner, agent, runner | 1605 |
| `T/sources/04-kiln-ui-and-design-system-notes.md` | Kiln's dock, views, state store, design tokens, accessibility, and the unified token proposal | 972 |

Each note has a companion diary (`T/sources/0N-*-diary.md`) recording how it was produced. The chronological record
of this ticket is `T/reference/01-investigation-diary.md`.

### 0.3 Structure

- **Part I** explains the problem and defines the vocabulary.
- **Part II** describes Kiln Workbench as it is.
- **Part III** describes Perf Lab as it is.
- **Part IV** lists, with evidence, what each system lacks.
- **Part V** is the design of the unified workbench: architecture, data model, algorithms, APIs, visual language
  and decision records.
- **Part VI** is the implementation plan: phases, files, done-conditions, tests and risks.
- The appendices hold API cheat sheets and a file index.

---

## Part I. The problem and the vocabulary

### 1. Executive summary

Kiln Workbench and Perf Lab are two browser workbenches for GPU performance work. Both are programmed in a
JavaScript DSL that compiles to an inspectable intermediate representation, and both have an LLM agent that writes
code against a handle API. They answer different questions.

- **Kiln** answers "what code should run, and how fast should it be?" A user writes a PyTorch-style program and,
  optionally, a compiler (dialects, rewrite rules, passes). Kiln lowers the program through six IRs into CUDA and
  WGSL kernels, chooses schedules with an analytic cost model, executes kernels in a SIMT simulator, in WebGPU or
  through a CUDA runner, and records the fastest time per schedule.
- **Perf Lab** answers "what did the existing code actually do, and is the claim about it true?" A user writes an
  experiment (arms, captures, quality gates, estimators) and boards that display its results. Perf Lab executes
  workloads as fresh, paired, interleaved processes, imports profiler output and evidence archives, labels every
  value with its provenance, and judges hypotheses as supported, refuted, open or unqualified.

Each system stops where the other starts. Kiln can say what a kernel should cost and why, but it keeps one best
number per schedule, with no repetitions, no confidence interval and no record of what produced the number. Perf
Lab can say whether a measured difference is real, but it has no model of what the number should have been, and it
can only test variants someone has already written.

The unified workbench treats every kernel as a **claim with three numbers**: what the analytic model predicts, what
the simulator counts, and what hardware measures. Each number carries its provenance. Hardware numbers carry their
repetitions, a confidence interval, a content identity and a validity verdict. Compiler decisions use hardware
evidence only when the confidence intervals separate. Hypotheses written in a project are judged live against the
evidence. The visual language is Kiln's: white ground, near-black ink, Arial in two weights, one red signal colour,
1 px rules and no shadows.

### 2. The two systems side by side

| Dimension | Kiln Workbench | Perf Lab (ML-PERF-001) |
| --- | --- | --- |
| Question | What code should run, and how fast should it be? | What did the existing code do, and is the claim true? |
| The program is | A computation and, optionally, a compiler | An experiment and its boards |
| The IR is of | Operations: torch → tensor → loop → tile → kernel → gpu | Experiments, captures, derived tables, parameters, views |
| Kernels are | Generated, with every rewrite and fork traceable | Observed entities imported from profilers |
| Numbers come from | Cost model, SIMT simulator, WebGPU, CUDA runner | Python processes on real hosts, imported archives |
| Model of performance | Roofline + occupancy + waves; exact bank conflicts | None by design |
| Trust in a number | A `kind` string inside `metrics` | Five provenance classes; sealed observed values; missing ≠ 0 |
| Repetitions | Median of 50 CUDA events or 20 WebGPU reps; evidence = fastest row | Paired, interleaved processes; bootstrap CI over processes |
| Validity | Outputs checked against the Loop IR | Exit status, activation check, quality gate |
| Persistence | `localStorage` | SQLite through a local server |
| UI | User-arranged dock of 13 views, Swiss style | Fixed grid with boards drawn as drafting sheets |
| Real hardware status | WebGPU verified on a software adapter; CUDA compiled, never timed | CPU workloads executed; GPU data imported or synthetic |

This table condenses the comparison memo `imports/Untitled.md` ("Side by side"), corrected where the analysis found
the memo wrong. The memo states that Perf Lab "does not build" because `features/build/` is missing; that is false
for the copy in this repository: `tsc --noEmit` passes and Vitest reports 11 files and 104 tests passing
[observed, `T/sources/01` §10 and `T/sources/02` §11]. The memo's measured ratios (2.50×, CI 2.37–2.72, and 2.29×,
CI 1.88–2.52) were reproduced exactly from Perf Lab's database; with four processes those intervals equal the
minimum and maximum of four ratios [observed, `T/sources/02` §8.5].

### 3. Vocabulary

Terms are grouped by the system that introduced them. The unified workbench uses all of them with the meanings
given here.

**Compiler terms (Kiln).**

| Term | Meaning |
| --- | --- |
| Dialect | A named set of operation definitions (`k.dialect("arith").op("add", …)`). An op has args, attrs, traits, a type-inference function, an interpreter (`eval`) and a printer. |
| Graph | A DAG of op instances (nodes) with typed values; produced by tracing a JS function (`k.trace`). |
| IR level | A named checkpoint in a pipeline, with the dialects allowed at that point (`strict: true` rejects any other op). |
| Rule | A pattern plus a rewrite (`k.rule(name).match(P…).rewrite(fn)`); may decline with `skip(reason)`. |
| Pass | A set of rules applied to a fixpoint, or a whole-graph function (`k.pass(name).rules(...)`). |
| Pipeline | An ordered list of IR levels and passes (`k.pipeline(name).ir(...).pass(...).build()`). |
| Run | One execution of a pipeline over a graph: the final graph, every rewrite step, every decision, every declined rewrite, events. |
| Trace | The recorded steps of a run, with deltas and periodic snapshots, so any intermediate graph can be rebuilt. |
| Fork | A rewrite that offers several alternatives instead of one (`k.fork([...])`); each alternative is labelled with knob values. |
| Knob | A named choice inside a fork (`MAP`, `TPB`, `COARSEN`, `STAGE`, `BM`, `BN`, `BK`, `TM`, `TN` for schedules). |
| Schedule row | The canonical string of a schedule's knobs, e.g. `MAP=row,TPB=1024,STAGE=all`. |
| Decision | The record of how one fork was resolved: options, chosen option, the policy that chose it (`by`), scores. |
| Decide chain | The ordered list of policies consulted at each fork: kernel pins → pinned params → evidence → cost model → first. |
| Kernel identity | `hash("loop|" + loopExprKey + shapes)`: names *what* a kernel computes, independent of its schedule and code. |
| Cost model | `std.tile.estimate`: an analytic time estimate from flops, traffic, shared-memory wavefronts, occupancy and waves. |
| Simulator | Generated JavaScript that executes a kernel's Kernel IR over sampled thread blocks in lockstep, counting memory sectors, bank conflicts, divergence and barriers. |
| Device | A place where kernels are timed: `sim:<gpu>` (simulator), `webgpu`, `cuda`. |
| Evidence store | Kiln's store of measured rows: one best time per (device, kernel identity, schedule row). |
| Preset | A ready-made project script plus Markdown notes (W-01 to W-25). |
| `lab:` link | A link in notes that drives the workbench (`lab:param?…`, `lab:measure`, `lab:pin?…`). |

**Evidence terms (Perf Lab).**

| Term | Meaning |
| --- | --- |
| Lab program | A `lab.js` file that returns `lab(title)…` with experiments, derives, hypotheses and boards. |
| Experiment | A question with a workload, arms, captures, a warm-up, an activation rule, a quality gate and a repetition plan. |
| Arm | One side of a comparison: usually `baseline` and `candidate`, each a revision plus switches. |
| Capture | One measurement mode (`timing`, `trace`, `kernels`, `memory`, `cpu`, …) of one arm on one host. |
| Spec | The fully lowered, JSON-serialisable description of one capture; its hash is the capture's identity. |
| Repetition / process | One fresh OS process executing a capture. The unit of independence for statistics. |
| Paired order | Per repetition, the arms run in a seeded random order, so time drift does not favour one arm. |
| Provenance class | One of `observed`, `derived`, `heuristic`, `illustrative`, `unknown`, carried by every value. |
| Value | `{value, unit, prov, reason?, method?, source?, …}`; a missing value has `value: null`, `prov: 'unknown'` and a reason, and compares as `NaN`. |
| Sealing | Observed entities are wrapped in a Proxy that throws on assignment: observed values are import-only. |
| Paired ratio | The median over processes of `median(candidate) / median(baseline)`, with a bootstrap confidence interval whose resampling unit is the process. |
| Validity | Whether a run counts at all: invalid on a non-zero exit or an activation miss. Invalid runs are kept and excluded. |
| Activation | Whether the claimed code path actually executed (for example, "the compiled kernel was active"). |
| Quality gate | A correctness comparison against a reference. Failing it makes a run *unqualified*, not invalid. |
| Hypothesis | A claim, a prediction (a predicate over query rows), supporting queries, alternatives and a scope. |
| Verdict | `supported`, `refuted`, `open` (cannot be judged yet) or `unqualified` (supporting evidence is invalid). |
| Binding | The phase a parameter affects: `view` (re-render), `data` (recompute), `plan` (needs new runs). |

**Terms introduced by the unified design (Part V).**

| Term | Meaning |
| --- | --- |
| Measurement record | One stored measurement of one kernel on one device under one protocol (`kiln-measure/1`, §21). |
| Content id | SHA-256 of what actually executes: generated source, launch configuration, inputs and codegen version (§22). |
| Device fingerprint | The facts that make two devices comparable or not: adapter or GPU name, architecture, driver (§23). |
| Three numbers | Model estimate (heuristic), simulator result (heuristic time, derived counts), hardware result (observed). |
| Stale evidence | A record whose content id differs from the current kernel's: shown, never used for decisions. |
| Separated | Two options whose confidence intervals do not overlap; the only condition under which evidence overrides the model. |

---

## Part II. Kiln Workbench as it is

### 4. What Kiln is, in one diagram

```text
 project script (JS)
        │  script.js: new Function(k, P, std, N, T, …)
        ▼
 Project { program, pipeline, params, checks, pins }
        │  k.trace(program)
        ▼
 frontend graph (torch ops)
        │  pipeline.run(graph, { params, decide, ctx })
        ▼
 torch ─d→ tensor ─o→ tensor ─l→ loop ─f→ loop ─s→ tile ─t→ kernel ─k→ kernel ─c→ gpu
                                              ▲
                     forks resolved by the decide chain:
                     kernel pins → pinned → evidence(store) → cost model → first
        │
        ▼  programOf(run.graph)
 kernels[] { name, identity, row, K, cuda, wgsl, inShapes, shape }
        │
        ├──► SimDevice   sim:<gpu>   simulateKernel + timeModel           (in page)
        ├──► WebGpuDevice webgpu     timestamp queries or wall clock      (in page)
        └──► CudaDevice  cuda        HTTP ──► kiln_runner.py serve (nvcc, CUDA events)
        │
        ▼
 Store: one best row per (device, identity, schedule row) ──► localStorage["kiln-wb:evidence"]

 UI: dock of 13 views ◄── wb store (named channels) ──► Agent (one `eval` tool, host-provided model)
```

Kiln is one static HTML file. `K/app/build.mjs` bundles `K/app/src/**` with esbuild into an IIFE, inlines three CSS
files, and loads React 18.3.1 and KaTeX 0.16.9 from cdnjs [observed, `T/sources/03` §8.1]. Everything (compiler,
simulator, cost model, UI, agent) runs in the page. The only external process is the optional CUDA runner.

Source size [observed, `wc -l`]: core 1,484 lines (`kiln.js` alone 1,132), std 2,064, UI 3,086, agent 594, plus 25
presets with notes.

### 5. The core framework (`K/app/src/core/kiln.js`)

#### 5.1 Dialects, ops and graphs

A dialect is declared with a builder. Each op definition supplies its argument names, attributes with defaults,
traits, a type-inference function, an interpreter and a printer. The W-01 preset builds an arithmetic dialect from
scratch (`K/presets/W-01-hello-dialect.js:9-15`):

```js
const Arith = k.dialect("arith")
  .op("const", { attrs: { value: 0 }, traits: ["pure", "const"], infer: () => k.scalar(), eval: ({ value }) => value, print: "{value}" })
  .op("add", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => a + b, print: "{a} + {b}" })
  .op("mul", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => a * b, print: "{a} * {b}" })
  .lifts((v) => Arith.const({ value: v }))        // bare numbers in traced code become consts
  .methods({ add: (a, b) => Arith.add(a, b), mul: (a, b) => Arith.mul(a, b) });
```

A graph is produced by **tracing**: `k.trace(name, fn, inputs)` calls `fn` with symbolic values, and every method
call on a value appends a node. A value exposes `arg(i)`, `is(op)`, `has(trait)`, `isConst()`, `fold()`,
`with({...})` and `lower(Op, attrs?)`; a graph exposes `topo`, `users`, `find`, `print`, `eval`, `key`, `clone` and
`dce` (`kiln.js:113-192, 307-384`).

#### 5.2 Patterns, rules, passes, pipelines

Patterns are built from `P.op`, `P.oneOf`, `P.trait`, `P.const`, `P.any`, `P.var` and `P.chain`, refined with
`.as(name)`, `.where(pred)`, `.args(...)`, `.attrs(...)` and `.oneUse()` (`kiln.js:392-458`). A rule pairs a
pattern with a rewrite. Rules can also be written **by example**: `k.rule("mul_one").from(({x}) => x.mul(1)).to(({x}) => x)`
traces both lambdas and derives the pattern. The parameter names are read from `fn.toString()` (`kiln.js:646-651`),
so by-example rules break under minification [inferred, K-17 in §17].

A rule may **decline** a match by calling `skip(reason)`; the decline is recorded in the trace with its reason.
Declines are how the trace explains a decision not taken, for example the fusion blowup guard (§6.3).

A pass is a set of rules run to a fixpoint (with an order, a mode and a limit) or a whole-graph function. A
pipeline is a sequence of IR checkpoints and passes:

```js
const pipe = k.pipeline("calc")
  .ir("arith", { dialects: [Arith] })
  .pass(simplify)
  .ir("simple", { dialects: [Arith], strict: true })   // strict: any op outside the dialects is an error
  .build();
```

Pipelines are editable values: `with`, `insertAfter`, `insertBefore`, `replace`, `without`, `withIr`, `insertRule`,
`replaceRule` and `removeRule` (`kiln.js:673-730`). W-14 and W-16 use these to add a user pass and a new frontend op
to the standard ML pipeline.

#### 5.3 The run engine

`pipeline.run(graph, {params, decide, ctx})` returns a `Run`. The rewrite driver, in pseudocode
(`kiln.js:742-1074`; full version in `T/sources/03` §1.8):

```text
run(graph, opts):
  for each stage in pipeline (IR checkpoints and passes, in order):
    if stage is an IR checkpoint:
      if strict and graph holds an op outside the stage's dialects: fail(kind "strict", naming the op)
      record checkpoint (irOrder += name; snapshot)
    else (a pass):
      if pass.whole: graph = pass.whole(graph, ctx); record one step
      else:
        repeat until no rule fires (stop at 4,000 rewrites):
          for node in graph (in the pass's order):
            for rule in pass.rules:
              m = rule.match(node); if no match: continue
              r = rule.rewrite(m)                       # may call skip(reason): record a decline, continue
              if r is a fork: r = applyFork(r)          # §5.4: the decide chain picks one alternative
              replace node by r; record step {pass, rule, node, delta}
  return Run { ok, graph, steps, decisions, irOrder, passStats, warnings, events }
```

The trace stores each step as a delta and a full snapshot every 48 rewrites, so `run.stepGraph(i)` can rebuild the
graph after any step and `run.diff(i)` can show what one step changed (`T/sources/03` §1.9). The Trace view is a
browser over these steps.

#### 5.4 Forks, knobs and the decide chain

A fork is how Kiln represents "several rewrites are legal and the right one depends on the hardware". A rule
returns `k.fork([alt1, alt2, …])`, each alternative labelled with knob values. `applyFork` asks the decide chain to
order the options and takes the first that applies:

```text
kernelPins(identity → row)  →  pinned()  →  evidence(store)  →  cost(model)  →  first()
```

Each policy returns `null` (defer to the next) or `{order, by, scores}`:

- **Kernel pins** (`K/app/src/ui/wb.js:103-108`): if the user pinned a schedule row for this kernel identity, it
  wins.
- **`pinned()`** (`kiln.js:565`): fires only when *every* knob of the fork is pinned through parameters. A partial
  pin narrows the options (`kiln.js:983`), but the decision is then reported `by: "model"` (K-7).
- **`evidence(store)`** (`kiln.js:587-597`), quoted in full because Part V replaces it:

```js
evidence: (store, { always = false } = {}) => policy("evidence", (fp, run, next) => {
  const st = store || run?.ctx?.store;
  const rows = st?.lookup?.(fp, run);
  if (!rows || !rows.length) return null;
  const best = new Map();
  for (const r of rows) { const c = canon(r.knobs); if (!best.has(c) || r.us < best.get(c)) best.set(c, r.us); }
  const scores = fp.options.map((o) => best.get(canon(o.knobs)) ?? Infinity);
  if (scores.every((s) => s === Infinity)) return null;
  if (!always && next) { const r = next(); if (r && r.order.length && scores[r.order[0]] === Infinity) return null; }
  return { order: tieBreak(fp, scores), by: "evidence", scores };
}),
```

  The policy defers while the model's favourite option is unmeasured. Once the favourite is measured, the option
  with the smallest single recorded time wins, however small the difference. Unmeasured options score `Infinity` and
  are never explored by this policy.
- **`cost(model)`**: `std.tile.costPrior` scores each option with the analytic estimate (§7.2).
- **`first()`**: emission order.

#### 5.5 Parameters and phases

Parameters are declared with `param.int/float/enum/bool/text(name, {...})`, optionally `.phase("build" | "run")`,
`.group(g)` and `.help(text)` (`kiln.js:461-491`). Build-phase parameters recompile; run-phase parameters only
re-render (`K/app/src/ui/wb.js:190`). Knob parameters are generated from forks and can be pinned to one value.

### 6. The standard ML stack (`K/app/src/std/`)

#### 6.1 Six IRs and eight passes

| IR level | Contents | Pass that follows (short letter) | Source |
| --- | --- | --- | --- |
| torch | `nn.*` frontend ops (`linear`, `rms_norm`, `softmax`, …) | `frontend/decompose` (d) | `tensor.js` |
| tensor | `T.ew`, `T.reduce`, `T.view`, `T.bc`, … | `frontend/optimization` (o) | `tensor.js:283-303` |
| tensor | optimised | `loop/lowering` (l) | `loop.js:285-306` |
| loop | loop ops holding `E.num/load/op/red` expressions | `loop/fusion` (f) | `loop.js:335-345` |
| loop | fused | `tile/schedule` (s): **the schedule fork** | `tile.js` |
| tile | loops with a GPU mapping (knob values) | tile pass (t) | `tile.js` |
| kernel | Kernel IR: grid, block, shared memory, statements | `lowering/kernel` (k) | `kernel.js` |
| gpu | `gpu.kernel` holding CUDA and WGSL text | `lowering/emit` (c) | `program.js:11-24` |

`reference.txt` names the last two passes `kernel/materialize` and `gpu/emit`; the code names them `lowering/kernel`
and `lowering/emit`. The short letters work either way [observed, K-16].

#### 6.2 The Loop IR and the index algebra

A loop op holds one expression tree over output coordinates. `E.num`, `E.load(input, indexExprs)`,
`E.op(fn, args)` and `E.red(reducer, extent, body)` build it. Index expressions come from `ix.js`: constants,
coordinate variables, `add/sub/mul/div/mod/min/max`. Expressions depend **only on coordinates**, which is why Kiln
cannot express gathers, embeddings, top-k or data-dependent bilinear sampling (`T/sources/03` §1.15, K-10). Reducers
are scalar `add`, `max`, `min` and `mul` (`K/app/src/std/fns.js:37-42`); there is no pair-valued reducer, so online
softmax, FlashAttention and Welford variance are not expressible.

`workOf(schedule(expr, shape))` counts the operations a loop nest performs; fusion and the simulator's block
sampling both use it.

#### 6.3 Fusion and the blowup guard

`loop/fusion` inlines producer loops into consumers (`mergeLoopOps`). Inlining a producer into a reduction can
recompute it many times, so the rule compares work before and after and declines when the fused nest does more:

```text
merge_loop_ops(producer, consumer):
  was = workOf(producer) + workOf(consumer)
  now = workOf(inline(producer, consumer))
  if now > was * 1.02: skip("blowup: fused work " + now + " > unfused " + was)   # loop.js:342
  return fused
```

The 2 % slack is not documented in `reference.txt` (K-9). W-09's MLP shows the decline in the trace: "fused work
10,472,128,512 > unfused 7,001,866,240".

#### 6.4 Tile schedules and the schedule fork

`tile/schedule` turns each loop op into a fork over GPU mappings (`T/sources/03` §2.8):

| Knob | Values | Meaning |
| --- | --- | --- |
| `MAP` | `thread`, `row`, `tiled` | One output element per thread; one row per block (cooperative reduction); a 2-D output tile per block (contractions) |
| `TPB` | 32 … 1024 | Threads per block |
| `COARSEN` | 1, 2, 4, … | Outputs per thread (thread map) |
| `STAGE` | `none`, `all`, `reused` | Whether the row is staged in shared memory (row map) |
| `BM`, `BN`, `BK` | tile sizes | Block tile of a contraction |
| `TM`, `TN` | per-thread sub-tile | Register tile of a contraction |

`legalMaps` filters options by the target's shared-memory and thread limits; `forkTree` builds the option tree
(expansion stops silently at 20,000 leaves, K-18). Option counts are large: the RMSNorm fork of W-05 has hundreds of
legal schedules; W-25's softmax has 27.

#### 6.5 Kernel IR and code generation

`lowering/kernel` materialises a scheduled loop into Kernel IR: grid and block sizes, shared-memory buffers, and
statements over registers, loops, conditionals and barriers (`K/app/src/std/kernel.js`). Row maps become
cooperative kernels with a shared-memory tree reduction (one `__syncthreads()` per halving step, no warp shuffles;
`kernel.js:99-113`). Tiled maps become the textbook shared-memory matmul (no double buffering, no vectorised loads,
no `cp.async`; `kernel.js:170-241`).

`lowering/emit` renders each kernel three ways from the same Kernel IR (`K/app/src/std/emit.js`):

- `toCuda` (`emit.js:14-45`): a `__global__` function with static `__shared__` arrays (hence at most 48 KiB per
  block), `rsqrtf` and `__syncthreads()`.
- `toWgsl` (`emit.js:49-86`): storage bindings `b0…` and `bout`, `var<workgroup>` arrays, a 2-D grid fold past
  65,535 workgroups, `workgroupBarrier()` and `inverseSqrt`.
- `toSim` (`emit.js:92-201`): JavaScript that runs one block in lockstep with active masks and reports every
  memory access to `SimMetrics`.

The W-05 RMSNorm kernel as CUDA, abridged from `T/sources/03` §3.1 (rows of 256 at a small slider setting):

```cuda
__global__ void rms_norm(const float* src0, const float* src1, float* dst) {
    const int tid = threadIdx.x, bid = blockIdx.x;
    __shared__ float s_red[64];
    float acc0 = 0.0f /* … one register per IR value … */;
    for (int r3 = tid; r3 < 256; r3 += 64) { in2 = src1[256*bid + r3]; acc0 = acc0 + in2*in2; }
    __syncthreads(); s_red[tid] = acc0; __syncthreads();
    if (tid < 32) { s_red[tid] = s_red[tid] + s_red[tid + 32]; }  __syncthreads();
    /* … the same step for 16, 8, 4, 2 and 1 … */
    acc0 = s_red[0]; v3 = rsqrtf(0.000001f + acc0 / 256.0f);
    for (int q = tid; q < 256; q += 64) dst[256*bid + q] = src0[q] * (src1[256*bid + q] * v3);
}
```

#### 6.6 The program view and kernel identity

`programOf(g)` (`K/app/src/std/program.js:28-42`) lists the final kernels in topological order:

```js
identity: hash(`loop|${a.expr.__key}|${a.shape.join("x")}|${a.inShapes.map((s) => s.join("x")).join(",")}`),
bytes: (numel(a.shape) + a.inShapes.reduce((s, x) => s + numel(x), 0)) * 4,
```

The identity is a function of the Loop IR expression and the shapes only. It deliberately ignores the schedule (the
schedule is the `row`), so all schedules of one kernel share an identity and their evidence can be compared. It also
ignores the generated code and the device, which is the root of weakness K-3 (§17).

Inputs are seeded: `kernelInputs(kern, seed)` fills each input with mulberry32 uniform values in [-1, 1), seeded
from a hash of the kernel **name**, the seed and the input index (`program.js:45-53`). The CUDA runner regenerates
the same values from the same seeds, so every device checks against the same reference values.

### 7. Cost model, simulator and devices

#### 7.1 The time model

The analytic estimate and the simulator both feed counts into one function, `timeModel(c, t)`
(`K/app/src/std/tile.js:152-194`). Its inputs are `flops`, `traffic` (L2 bytes), `dram` (bytes), `smemWavefronts`,
`warpInstr`, threads per block `T`, blocks `G`, shared memory and registers per block, and a target `t`.

```text
occupancy:
  wpb = ceil(T/32);  maxW = maxThreadsPerSM/32
  bps = min(maxBlocksPerSM, floor(maxThreadsPerSM/(wpb·32)), floor(smemPerSM/smem), floor(regsPerSM/(min(255,regs)·wpb·32)))
  occ = bps·wpb/maxW            (infeasible if T > maxTPB, smem > smemPerBlock, or bps < 1)
raw resource times at full efficiency, in µs:
  dram = dram_bytes/(bwGBs·1e3)        l2 = traffic/(3·bwGBs·1e3)        compute = flops/(peakTflops·1e6)
  smem = wavefronts/(sms·clockGHz·1e3) issue = warpInstr/(sms·4·clockGHz·1e3)
latency hiding:  memEff(o) = min(1, 0.2 + 1.6·o)     compEff(o) = min(1, 0.25 + 1.5·o)
waves:
  slots = sms·bps;  waves = ceil(G/slots)
  wave(b): s = min(sms, b); k = ceil(b/s); o = min(occ, k·wpb/maxW)
           wave_time = max over resources r of raw_r · (sms/G) · k / eff_r(o)
  core = (waves−1)·wave(slots) + wave(G − (waves−1)·slots)
  us = launchUs + core;   bound = (us < 1.5·launchUs) ? "launch" : argmax_r Σ_waves v_r
```

There is no latency term, no tensor-core path, no L1 model and only fp32. Each wave is a roofline (the maximum over
resources), not a sum.

#### 7.2 The analytic estimate

`estimate(analysis, knobs, target)` (`tile.js:201-281`) derives the counts without running anything: flops from
`workOf`; global traffic from the stride of the thread-varying coordinate (`min(32, 4·|stride|)` sectors per warp
access, 1 for a broadcast); shared-memory wavefronts from a bank-conflict function; DRAM bytes from a heuristic:

```js
const dram = Math.min(traffic, Math.max(uniq + outBytes, traffic * (uniq > t.l2MB * 1048576 ? 0.6 : 0.12)));  // tile.js:277
```

`costPrior` turns estimates into fork scores; the Knobs view shows them as "model µs".

#### 7.3 The simulator

`simulateKernel` (`K/app/src/std/program.js:92-120`):

1. Choose sampled blocks so that simulated work stays near 6 M operations (at most 12 blocks).
2. Generate seeded inputs; fill the output with `NaN`.
3. Run `toSim(K)` over the sampled blocks, counting sectors per warp request, bank wavefronts, divergence,
   barriers and out-of-bounds accesses (`SimMetrics`, `emit.js:204-251`).
4. Check up to 512 covered outputs against the Loop IR reference (`rtol 2e-3`, `atol 2e-4`); an out-of-bounds access
   or a barrier under a partial mask fails the check.
5. Scale the counts to the full grid and call **the same `timeModel`** (`program.js:122-128`).

The simulator's *counts* are exact for the sampled blocks. Its *time* is the model's formula applied to those
counts, with the same 12 % / 60 % DRAM heuristic. Agreement between model and simulator (W-25 reports Spearman ρ ≈
0.99) is therefore largely self-consistency (K-1).

#### 7.4 Devices

| Class | id | How it times | Check |
| --- | --- | --- | --- |
| `SimDevice` (`devices.js:11-19`) | `sim:rtx5090`, `sim:rtx4090`, `sim:h100`, `sim:a100`, `sim:orin` | `simulateKernel`; `kind: "simulated"` | Sampled outputs against the Loop IR |
| `WebGpuDevice` (`devices.js:21-117`) | `webgpu` | 3 warm-ups + 20 reps; GPU timestamp queries if granted, else wall clock around `submit`; median | 384 sampled outputs |
| `CudaDevice` (`devices.js:120-147`) | `cuda` | `POST /api/run` to `kiln_runner.py serve`; `kind: "CUDA events"` | Runner returns samples; checked in page |

Device specs (`K/app/src/std/targets.js:5-13`) are approximate public figures, for example RTX 5090 = sm_120, 170
SMs, 2.41 GHz, 104.8 TFLOP/s FP32, 1,792 GB/s, 96 MB L2. All specs cap shared memory per block at 48 KiB because
the generated CUDA declares shared memory statically. Device ids `webgpu` and `cuda` are constants, so two different
GPUs produce evidence under the same id (K-3).

When the page is not served by the runner, the Devices view exports a `kiln-bundle/1` file
(`{reps: 50, warmup: 5, ncu, kernels: [{name, identity, row, source, grid, block, smem, inputs: [{size, seed}], out, samples}]}`)
and imports `kiln-results/1` (`devices.js:150-171`).

#### 7.5 The evidence store, measuring and tuning

```js
// K/app/src/std/store.js (40 lines), as an interface
class Store {
  rows: Map<`${device}|${identity}`, Row[]>
  put(row)        // keeps ONE row per canonical knobs: replaced only if faster, or if the old one failed  (store.js:8-17)
  record({device, kern, result, by})   // → put({device, identity, name, knobs, row, us, ok, by, t, metrics})
  lookup(fp, run) // rows for (run.ctx.deviceId, fp.key) with ok !== false
  best(device, identity); list(filter); clear(filter)
  toJSON() → { format: "kiln-evidence/1", rows };  import(json)
}
```

`wb.measure()` (`K/app/src/ui/wb.js:205-228`) calls `measureProgram` for the current device, records each kernel's
result, then recompiles, so the next compile's decisions read `by: "evidence"`. The store persists to
`localStorage["kiln-wb:evidence"]` with a 400 ms debounce.

`tune()` (`K/app/src/std/tune.js:41-107`) searches schedule assignments by sweep or single-player MCTS (UCB over a
max-Q backup, reward `1/total_us`). It compiles with `ctx = {deviceId}` and **no store**, so rollouts never consult
evidence (K-6); a comment says a sweep's purpose is to gather evidence, not to use it. On `sim:rtx4090` the greedy
model choice, the sweep and SP-MCTS all reach the same 10.6 µs for the SwiGLU test MLP [observed, `tune.mjs`], as
expected when the "measurement" uses the same formula as the model.

### 8. The project DSL and presets

A project script is plain JavaScript evaluated with `k, P, std, N, T, nn, tensor, Tensor, ix, E, KB, kx, project,
param` in scope (`K/app/src/std/index.js:60-63`). The last `project(...)` call defines the project:

```js
// K/presets/W-05-rmsnorm.js (the body, after its header comment)
const rows = param.int("rows", { min: 16, max: 4096, default: 1024, scale: "log", help: "batch × sequence" });
const dim  = param.int("dim",  { min: 64, max: 8192, default: 4096, scale: "log", help: "hidden size" });

project("rmsnorm")
  .params(rows, dim)
  .program(({ x }, { param }) => ({ y: N.rms_norm(x, std.weight("w", [param(dim)]), { eps: 1e-6 }) }),
           ({ param }) => ({ x: k.tensor([param(rows), param(dim)]) }))
  .about("y = x · rsqrt(mean(x²) + ε) · w");
```

No pipeline, rule or decide policy is written: the standard pipeline and the default decide chain do the work.
`Project` also offers `.pipeline(p)`, `.data({...})`, `.check(name, fn)`, `.pins({...})`, `.device(id)`,
`.about(text)` and `.note(text)` (`std/index.js:30-59`).

The 25 presets are grouped Basics (W-01 to W-04), ML compiler (W-05 to W-10), Write programs (W-11 to W-13), Extend
the compiler (W-14 to W-16), Other compilers (W-17) and GPU optimization (W-18 to W-25). Each has a Markdown notes
file with math, call-outs ("Try", "Exercise", "Caveat") and `lab:` links that drive the workbench. The full table is
in `T/sources/03` §9.

### 9. The Kiln UI

#### 9.1 Shell and dock

The page is a 52 px header (brand, project button, Compile, Measure ▸, device pill, status pills, Save ▾,
Layout ▦, theme ◐) above a **dock**: a persisted tree of tiles (`K/app/src/ui/dock.js`, pure functions):

```text
Node  = Tile | Split
Tile  = { t: "tile",  id, views: ViewId[], active: ViewId | null }
Split = { t: "split", id, dir: "row" | "col", kids: Node[], sizes: number[] /* sum 1 */ }
```

`normalize(root)` drops unknown views, flattens same-direction splits and renormalises sizes, which makes saved
layouts forward-compatible. Tabs can be dragged to another strip or to a tile edge (the outer 25 % splits the tile);
gutters resize with the pointer or the arrow keys; ⌘\ maximises a tile; phones (≤ 640 px) collapse to one strip.

#### 9.2 Views

| View | Shows |
| --- | --- |
| Notes | The preset's Markdown with MathML, call-outs and `lab:` links |
| Code | The editor (a transparent `<textarea>` over a highlighted `<pre>`), diagnostics, parameters, checks |
| Agent | The chat with tool cards, proposals and history |
| Reference | `reference.txt` and the agent guidelines |
| IR | The program at any IR level, with pipeline chips |
| Graph | A layered DAG of the current IR |
| Trace | Every rewrite, decline and fork, with diffs |
| Kernels | Kernel table; CUDA, WGSL, Kernel IR, Tile, Loop IR and Launch tabs |
| Perf | Big total, kernel table with meters, roofline, per-kernel metrics |
| Knobs | Forks with options, model and measured µs, pins; parameters by group |
| Tune | Strategy, budget, search chart, best program, evidence table |
| Devices | Simulated and real devices; the CUDA runner steps |
| Events | Workbench and compile event logs |

Every non-column view uses the same frame: a `.stagewrap` (toolbar plus scroll area) beside a 288 px `.side` column
of `.block`s, which moves below the main area when the **tile** is narrower than 640 px (container queries).

#### 9.3 State: one store with named channels

`K/app/src/ui/wb.js` exports one mutable `Workbench` instance. Views subscribe to named channels and re-render when
one is bumped:

```js
wb.on(channel, fn) → unsubscribe         wb.bump(...channels)         wb.version(channel)
useLab("compile", "sel", "measure")      // React hook: subscribe in an effect, force-render on a bump
```

Channels in use: `ready, ui, preset, code, notes, diags, compile, sel, params, device, measure, tune, store, events,
toast, layout, drag, platform, agent, agentDraft, convs, gotoLine`. Ten `localStorage` keys are prefixed `kiln-wb:`
(layout, theme, last, draft, draftNotes, mine, device, evidence, agentSettings, convs).

#### 9.4 Visual language

The stylesheet states its aesthetic: "white ground, #1a1a1a ink, Arial in two weights, 1 px rules, no tinted panels.
Red marks errors, selection, and the lambda arrow in code" (`K/app/src/ui/forge-base.css:2-3`). Tokens:

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#1a1a1a` | Ground of every pane |
| `--fill` | `#f6f6f6` | `#222222` | Hover rows, inline code, call-outs |
| `--ink` | `#1a1a1a` | `#f2f2f2` | Text, primary controls (inverted), strong rules, focus ring |
| `--ink-2` | `#737373` | `#9a9a9a` | Secondary text, labels, axes |
| `--hair` | `#d6d6d6` | `#3d3d3d` | Control borders, pane dividers |
| `--rule` | `#ededed` | `#2a2a2a` | Table row rules |
| `--code-bg` | `#fbfbfb` | `#1d1d1d` | Editor and code blocks |
| `--accent` | `#e2001a` | `#ff3b4a` | The only hue: failure, selection, live links |
| `--mono` (misnamed) | `Arial, "Helvetica Neue", Helvetica, sans-serif` | | The UI sans |
| `--code` | `ui-monospace, Menlo, Consolas, "Courier New", monospace` | | The real monospace |
| `--fs-xs/s/m/l/xl` | 10.5 / 12 / 13 / 18 / 30 px | | Meta / body / tabs / headings / big numbers |

No web fonts are shipped, and KaTeX renders MathML, so no math fonts are needed either. Inversion (ink fill, white
text) means "on" or "primary". Success is never coloured: it is ink plus ✓. Charts are hand-written SVG in ink; the
selected or best mark is red. Screenshots are in `T/sources/screens/` (`kiln-default-light-1600.png`,
`kiln-perf-light-1600.png`, `kiln-knobs-light-1600.png`, …).

### 10. The agent and the CUDA runner

**Agent** (`K/app/src/agent/agent.js`). The model is reached through a host capability bridge
(`window.claude.use("sample")`); without one the agent is unavailable. The model has one tool, `eval`, which runs
model-written JavaScript in the page with `new Function` and a scope of namespaces (`editor`, `notes`, `compile`,
`ir`, `trace`, `forks`, `params`, `kernels`, `devices`, `measure`, `tune`, `evidence`, `checks`, `presets`, `chat`,
`ref`). A snapshot (script, notes, params, pins, device, evidence) is taken before each eval, so the user can revert
to any step. Read-only mode replaces mutators with throwing stubs. There is no token accounting and no per-turn eval
cap, and eval code can reach `window.__kiln` and `fetch` in every mode (K-14).

**Runner** (`K/runner/kiln_runner.py`). Subcommands `device`, `run <bundle>` and `serve`. A C++ harness is compiled
with each kernel (`nvcc -O3 -arch=native -Xptxas -v`, cached by `sha1(source + arch)`). It regenerates the page's
seeded inputs, fills the output with NaN bytes, runs 5 warm-ups and 50 timed launches with a CUDA event pair around
each, and prints all times and sampled outputs. The median is reported. There is no L2 flush, no clock lock and no
`nvidia-smi` query. `serve` accepts a request when `Origin` is absent or equals `http://{Host}`, which DNS rebinding
can satisfy, and `POST /api/run` compiles arbitrary CUDA (K-15).

### 11. Kiln's tests

`K/app/test/` holds plain Node scripts that print `ok` lines; `npm test` is a stub. On a scratch copy
[observed, `T/sources/03` §8.3]: `core`, `stack1`, `stack2`, `stack3`, `progs` and `tune` pass; `presets.mjs` compiles
and checks all 25 presets; `notes.mjs` executes all 169 `lab:` links; `param-sweep.mjs` passes 227 compiles in 55 s.
Not run: `ui.mjs` (Playwright), `export-cuda.mjs` + `cuda_check.py` (NVRTC), the runner (no NVIDIA GPU).

---

## Part III. Perf Lab as it is

### 12. What Perf Lab is, in one diagram

```text
 browser ── Vite dev server 127.0.0.1:5199 (pnpm dev) ──/api proxy──► lab server 127.0.0.1:5198 (pnpm lab-server)
   │                                                                     │  Hono, basePath /api, no auth
   │ lab.js ─► evaluateProgram ─► builders (recorded)                    ├─ node:sqlite .data/perf-lab.sqlite (WAL, 5 migrations)
   │        ─► build(): structure → expand·resolve → trace →             ├─ Runner: FIFO, one job and one process at a time
   │                    validate → lower → plan                          │    └─ uv run … python -m perf_lab_local.run | perf_lab_dino.run
   │        ─► IR (Redux) + registry (non-serialisable, last 24 builds)  ├─ importers: repetition dir → Bundle {run, entities, links}
   │                                                                     ├─ evidence archives (SHA-256), datasets, media
   │ boards ─► views materialise queries over runs/entities              ├─ SSE /api/events (job.updated, artifact.imported, …)
   │ param change ─► re-render | recompute | pending plan ─► POST /jobs  └─ assistant: pi ModelRuntime → LLM gateway, token rows
```

Perf Lab is a Vite + React 19 + Redux Toolkit app (`PL/src/`) and a separate Node server (`PL/server/`) run by `tsx`.
The server is a separate process so a client hot reload never interrupts a running job. It imports the browser
language's pure modules (`src/lang/util.ts`, `values.ts`, `detections.ts`) directly, so both sides hash and label
values with the same code [observed, `T/sources/02` §1.1].

### 13. The `lab.js` language

#### 13.1 Evaluation and the recorder

A lab program is plain JavaScript evaluated with `new Function(...libraryNames, '"use strict";\n' + source)`
against about 70 free names, and it must `return lab(...)` (`PL/src/lang/build.ts:72-96`). Builders are wrapped in
a recording Proxy (`PL/src/lang/builders.ts:17-34`): a known method runs; an unknown method is recorded and becomes
an `unknown-method` lint warning instead of an exception. A typo such as `.captrue(...)` therefore builds with a
warning.

A real program, abridged from `PL/src/presets/programs/local-sampler.lab.js` (88 lines):

```js
const L = lab('Local · deformable sampling, measured')
  .param('queries', select([1024, 2048, 4096, 12240]).label('Queries').default(2048));

return L
  .experiment('sampler-local', e => e
    .question('Does compiling the sampler change latency on this machine, and does the sampled intermediate disappear?')
    .host('local')
    .workload(sampler({ queries: ctx => ctx.param('queries'), heads: 8, channels: 32, points: 16, spatial: 64, device: 'cpu' }))
    .baseline(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'unfused' }))
    .candidate(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'compiled' }))
    .state({ process: 'fresh', compilerCache: 'reused' })
    .warmup(w => w.requests(4))
    .expect(activation({ compile: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.ref('workloads/perf_lab_local/sampler.py#unfused', { mode: 'exact' }))
    .repeat({ processes: 4, order: paired({ seed: 20261012 }) })
    .compare(stats.pairedRatio({ unit: 'process', ci: 0.95 }))
    .capture(capture.timing())
    .capture(capture.trace().requests(4).processes(1))
    .capture(capture.memory()))
  .derive('speedup', q.requests('sampler-local/*/timing'), rs => stats.pairedRatio({ unit: 'process', ci: 0.95 }).of(rs))
  .hypothesis('compile-removes-intermediate', h => h
    .claim('Compiling the sampler removes the sampled intermediate: the compiled arm allocates no intermediate-sized block.')
    .predicts(q.read('blocks').where(r => r.arm === 'candidate'), r => r.intermediateSized === 0)
    .supportedBy(q.allocs('sampler-local/*/memory'), q.read('blocks'))
    .alternatives('TorchInductor keeps grid_sampler_2d as a separate kernel on CPU and fuses only the multiply and reduction')
    .scope('allocator evidence for one request per arm on this host; says nothing about GPU fusion'))
  .board('identity', b => b
    .title('Is this a valid comparison?')
    .add(manifestDiff('sampler-local/baseline/timing#0', 'sampler-local/candidate/timing#0'))
    .add(stat(live($ => $.read('speedup')), 'paired median latency ratio, compiled ÷ eager'))
    .add(runList('sampler-local/*/*')));
```

The program states, in code, what most benchmark scripts leave implicit: which revisions are compared, what must
be true for a run to count (`expect`), what correctness reference applies (`gate`), how many independent processes
are measured and in which order (`repeat`), which estimator is used (`compare`), and which claim is tested
(`hypothesis`).

#### 13.2 The compiler passes

`build(source, env, opts)` (`PL/src/lang/build.ts:151`) runs six timed passes [observed, `T/sources/01` §2.6]:

| # | Pass | Lines | What it does |
| --- | --- | --- | --- |
| 1 | `structure` | L174-183 | Evaluate the program; apply agent patches |
| 2 | `expand · resolve` | L313-497 | Call plan lambdas with `ctx`; expand arms × captures into capture instances; validate evidence and datasets |
| 3 | `trace` | L635-745 | Dry-run derives and `live` lambdas to record what they read; infer each parameter's binding |
| 4 | `validate` | L748-827 | Lint rules |
| 5 | `lower` | L830-835 | Map instances to their `spec` |
| 6 | `plan` | L838-872 | Stages, counts by status, GPU-minute estimate |

Each capture instance gets a **spec**, the JSON a Python process receives. A real one (`T/sources/02` §4.4):

```json
{
  "schema_version": 1, "experiment_id": "sampler-local", "arm": "baseline", "host": "local",
  "workload": { "adapter": "sampler", "channels": 32, "device": "cpu", "dtype": "float32", "queries": 2048, "…": "…" },
  "comparison": { "arm_revision": "1fc6b670a8a6", "baseline_revision": "1fc6b670a8a6", "candidate_revision": "1fc6b670a8a6",
                  "corunner": null, "paired_order_seed": 20261012, "switches": { "impl": "unfused" } },
  "state": { "compilerCache": "reused", "process": "fresh" },
  "warmup": { "requests": 4, "until": null },
  "expect": { "arm": "candidate", "expect": { "compile": "active" }, "onMiss": "invalid" },
  "repeat": { "processes": 4 }, "collection": { "mode": "timing" },
  "quality_gate_sha256": "1231e65b50d080"
}
```

The capture's identity is `cyrb53(stableStringify(spec))`: a 53-bit non-cryptographic hash of the key-sorted JSON
(`PL/src/lang/util.ts:1-34`). Any change of workload, revision, switches or seed is a new capture. The server
recomputes the hash and rejects a mismatch with `409 spec_hash_mismatch`. A capture's status is `cached` (already
measured), `blocked` (waiting on evidence), `import` (comes from an archive) or `execute`.

#### 13.3 Lambda phases and parameter binding

The phase of a lambda is decided by **where it appears**, never by inspecting the function
(`PL/src/lang/refs.ts`):

| Phase | Syntactic slot | Runs when | May write state |
| --- | --- | --- | --- |
| plan | a function in an experiment, capture, workload or param-options slot (`ctx => …`) | at build time | no |
| data | `lab.derive(name, input, rows => …)` | on read, memoised on the parameters it read | no |
| view | `live($ => …)` inside a view's arguments | at render | no (`$.set` throws) |
| handler | `view.on(event, $ => …)` | on a UI event | yes (`$.set(ref, v)`) |
| effect | `board.effect(fn)` | never (collected only) | n/a |

A parameter's **binding** is the strongest phase among its readers, `plan > data > view`, found by the trace pass's
dry run. It decides what a change costs: a `view` parameter re-renders, a `data` parameter recomputes derived rows,
a `plan` parameter changes capture hashes and becomes a *pending plan* that needs new runs. The UI shows `VIEW`,
`DATA`, `PLAN` or `PLAN · PENDING` badges, and ParamBar's legend reads "VIEW re-renders · DATA recomputes · PLAN
needs runs".

#### 13.4 Queries, rows and views

`q.runs`, `q.requests`, `q.spans`, `q.kernels`, `q.allocs`, … return lazy, immutable queries over entities of the
imported runs (`PL/src/lang/query.ts`). A run pattern is `experiment/arm/mode(#rep)?` with `*` wildcards. Rows are
arrays of sealed entities with `where`, `groupBy(...).agg(...)`, `sum`, `metric`, `follow(rel)` and `back(rel)`
(`PL/src/lang/rows.ts`). About 26 view constructors (`table`, `chart`, `timeline`, `stat`, `manifestDiff`,
`mirror`, `kernelCard`, `ledger`, `route`, `stepper`, `hypothesisCard`, `math`, `detections`, `gallery`, …) render
query results on boards.

### 14. The evidence contract

#### 14.1 Provenance classes and the Value

`PL/src/lang/values.ts` defines `Prov = 'observed' | 'derived' | 'heuristic' | 'illustrative' | 'unknown'`:

| Class | Constructor | Meaning | Glyph |
| --- | --- | --- | --- |
| observed | `val(v, opts)` | imported from a capture | ● |
| derived | `derived(v, opts)` | computed from observed values by a stated method | ◐ |
| heuristic | annotations, links | a judgement or a model, not a computation from observations | ◌ |
| illustrative | `illustrative(v, unit)`, `algo` | a teaching fixture, not this system's state | ◇ |
| unknown | `missing(reason, opts)` | not measured; always carries a reason | ▨ |

A `Value` is `{__value: true, value, unit?, prov, reason?, source?, scope?, denominator?, method?, metric?}`. Its
`valueOf()` returns `NaN` when `value` is `null`, so any comparison involving a missing value is false. Unknown is
never zero.

#### 14.2 Sealing

```ts
// PL/src/lang/values.ts L77-89
export function sealObserved<T extends object>(obj: T): T {
  return new Proxy(obj, {
    set(_t, prop) { throw new ProvenanceError(`observed values are import-only (tried to set ${String(prop)}). Record a note, a derived value or a hypothesis.`); },
    deleteProperty(_t, prop) { throw new ProvenanceError(`observed values are import-only (tried to delete ${String(prop)}).`); },
  });
}
```

Every imported entity and its `metrics` object is sealed (`rows.ts:114-121`). The seal is shallow and has no
`defineProperty` trap, so `ent.metrics.x.value = 0` and `Object.defineProperty(ent, …)` both succeed [inferred,
P-6].

#### 14.3 The paired-ratio estimator

`stats.pairedRatio(opts)` (`PL/src/lang/stats.ts:23-92`):

```text
pairedRatio({unit='process', ci=0.95, field='latency'}).of(rows):
  byArmRep := map "arm#rep" → list of numbers;  excluded := []
  for r in rows:
    if r.runValid === false: once per arm#rep: excluded += {rep, arm, reason}; continue
    v := finite number of r[field] or skip;  if r.outcome != 'ok': skip
    byArmRep[r.arm + "#" + r.rep].append(v)
  pairs := [ {rep, baseline: median(b), candidate: median(c), ratio: median(c)/median(b)}
             for each rep where both "baseline#rep" and "candidate#rep" exist ]          # arm names hard-coded
  if no pairs: return missing('no paired valid processes')
  ratios := pairs.map(ratio);  rng := seeded from the ratios themselves                 # the `seed` option is ignored
  boots := [ median(resample_with_replacement(ratios)) for 1..2000 ];  sort boots
  return { median: derived(median(ratios)), ci: [derived(quantile(boots, α/2)), derived(quantile(boots, 1−α/2))],
           pairs, excluded }
```

The design intent, from the doc comment: "The process is the resampling unit, so a bootstrap over correlated
requests cannot masquerade as many independent experiments." With four processes, a bootstrap of the median of four
ratios can only produce values between the smallest and the largest ratio, so the reported "95 % CI" is the
min–max range (P-15).

#### 14.4 Validity, activation and quality

A run is **invalid** for exactly two reasons (`PL/server/importer.ts:85-94`): the process exited non-zero, or an
activation expectation missed with `onMiss: 'invalid'`. Invalid runs are stored and excluded by estimators, which
list them. A failed quality gate makes a run **unqualified**, never invalid:

```text
validity.ok    = (exitCode == 0) and every expected activation[k] == v (for this arm)
quality.status = (gate declared and quality.pass and validity.ok) ? 'qualified' : 'unqualified'
```

#### 14.5 Hypothesis verdicts

Verdicts are computed in a React component, `HypothesisView.tsx` L19-48, not in the language:

| Condition (in order) | Verdict |
| --- | --- |
| A run referenced by a supporting query has `validity.ok` falsy | unqualified |
| The prediction query returns no rows | open |
| Every row's predicate passes | supported |
| A failing row has a missing top-level Value field | open |
| Otherwise | refuted |

Known faults [observed unless marked]: a predicate that **throws** counts as a failure and yields `refuted`; a
missing value converted with `Number(v)` becomes a plain `NaN` and yields `refuted` instead of `open` [inferred]; a
predicate written in the negative (`!(r.x > 1)`) passes on `NaN` [inferred]; and no headless consumer (CLI, server)
can compute a verdict because the function lives in the view.

#### 14.6 Lints

`build.ts` emits 27 lint codes. The ones that encode measurement discipline:

| Code | Level | Trigger |
| --- | --- | --- |
| `no-quality-gate` | warning | experiment has no `gate`: "results will be marked unqualified" |
| `no-activation-rule` | warning | workload without `expect`: "a silent fallback would count as a candidate result" |
| `no-repetition` | warning | no `repeat` |
| `counters-not-latency` | info | kernel capture with cache control: counters, not latency |
| `capture-unsupported` | error | counters requested on a host that cannot collect them |
| `param-affects-mismatch` | error | declared `.affects()` disagrees with the inferred binding |

The full table is in `T/sources/01` §3.6.

### 15. The Perf Lab server

#### 15.1 HTTP API (all under `/api`, JSON, error envelope `{error, message}`)

| Route | Purpose |
| --- | --- |
| `GET /health` | Status, migrations, probe, assistant, SSE clients |
| `GET /hosts`, `GET /hosts/:host/capabilities` | `local` (process executor) and synthetic hosts; local capability probe |
| `GET/PUT/DELETE /programs/:labId` | Edited lab.js sources |
| `GET /catalog` | Every available artifact, keyed by capture hash (the `?lab=` filter is ignored) |
| `POST /labs/:labId/seed` | Seed synthetic artifacts |
| `GET /bundles?hashes=…` | Run bundles (`{run, entities, links}`) for up to 64 captures |
| `GET /jobs`, `GET /jobs/:id`, `POST /jobs`, `POST /jobs/:id/approve`, `POST /jobs/:id/cancel` | Job lifecycle |
| `GET/POST /annotations` | Heuristic notes on entities |
| `GET /evidence`, `GET /evidence/:sha`, `POST /evidence?name=` | Evidence archives (raw `.tar.gz`, SHA-256 identity, ≤ 64 MiB) |
| `GET /datasets`, `GET /datasets/:id`, `POST /datasets/:id/materialize`, `GET /media/:sha` | COCO datasets and hash-verified public images |
| `GET /events` | SSE: `job.updated`, `job.event`, `artifact.imported`, `catalog.changed`, `evidence.registered`, `dataset.progress`, `dataset.materialized` |
| `/assistant/*` | Models, conversations, library, turns (SSE), results |

`POST /jobs` takes `{labId, captures: [{hash, ref, host, reps, spec}], proposedBy?, approve?, budgetGpuMin?}`. The
server recomputes every capture hash. If `approve === true` and `proposedBy !== 'assistant'`, the job is approved in
the same request (`PL/server/app.ts:160, 172`): the server **trusts the client's claim** of who proposed it (P-1).

#### 15.2 SQLite schema (after migration 5)

| Table | Key | Holds |
| --- | --- | --- |
| `artifacts` | capture hash | lab, experiment, arm, mode, host, reps, spec JSON, origin (synthetic/measured), status, source |
| `runs` | (hash, rep) | ref, timing, run JSON |
| `run_bundles` | (hash, rep) | gzip-JSON entities and links |
| `jobs`, `job_captures`, `job_events` | id | job state machine `proposed → approved → running ⇄ importing → done / failed / cancelled` |
| `evidence_archives`, `datasets`, `dataset_images`, `dataset_annotations`, `media` | SHA-256 | content-addressed evidence and public images |
| `conversations`, `messages`, `llm_calls` | id | assistant transcripts and token accounting (`est_prompt_tokens = ceil(chars/4)`) |
| `programs`, `annotations` | | edited sources; notes |

Migrations are an append-only array of SQL strings (`PL/server/db.ts:11-320`).

#### 15.3 The runner

```text
runJob(jobId):                                              # PL/server/runner.ts:264-371
  job.status ← running
  groups ← captures grouped by "<experiment>/<mode>@<host>"   (arms of one group interleave)
  for group in groups:
    if spec.evidence: import from the archive; continue
    if dino workload on a process host: run the paired dino process; continue
    for rep in 0 … max(reps) − 1:
      order ← Fisher–Yates shuffle of the group, rng seeded "<paired_order_seed>:<rep>"
      for capture c in order:
        out ← executor.run(c, rep)          # uv run … python -m perf_lab_local.run --spec … --rep … --out …
        bundle ← importRepetition(out.dir, spec, exitCode, stderrTail)   # stored even when invalid
        if out.exitCode ≠ 0: fail the job (remaining repetitions are not run)
    mark the group's artifacts available; emit artifact.imported, catalog.changed
```

One job runs at a time, and inside it one process at a time ("concurrent benchmark processes would measure each
other"). There is no process timeout. Only host `local` has a real executor; `playback@dgx` and `playback@rtx-dev`
use a synthetic executor that sleeps 150 ms. ML-PERF-003 designs an SSH container executor for the DGX; it is not
implemented (`T/sources/02` §9).

#### 15.4 What was measured

The database in `PL/.data/` holds the real runs behind the memo's numbers: the local sampler (CPU, four processes,
compiled ÷ eager) and a local Grounding DINO comparison at two Playback revisions, plus an imported DGX archive from
Playback PR 1005 with 128 images [observed, `T/sources/02` §8]. No GPU kernel was measured on this machine: the
local trace importer builds `kernel` entities from CPU ATen operators only.

### 16. The Perf Lab frontend in brief

- **State.** Redux Toolkit with 11 slices (`program`, `build`, `params`, `signals`, `selection`, `catalog`, `jobs`,
  `agent`, `annotations`, `ui`, `server`). Functions, builders and the data source never enter Redux; they live in
  `PL/src/app/registry.ts`, keyed by build id, which keeps the last 24 builds.
- **Layout.** A fixed CSS grid: IDE, centre, inspector and strip, with collapsible rails. Boards are drawn as
  drafting sheets with registration marks and an engineering title block that states the data's origin (SYNTHETIC
  DATA, MEASURED ON …, ILLUSTRATIVE DATA, NO RUNS IMPORTED).
- **Look.** Two grounds (paper `#fafaf8`, sheet `#fff`), cool grey inks, a blue signal colour, warn/bad/ok hues, six
  data hues, Archivo 800 display type and IBM Plex Mono, uppercase stencil labels. Provenance is drawn with the
  glyphs ● ◐ ◌ ◇ ▨; missing values are hatched, derived values dotted, illustrative values outlined with dashes.
- **Assistant.** The model writes JavaScript that runs in the page (`new AsyncFunction`); on error the runtime rolls
  back to a checkpoint; the server allows four executions per question; tokens are recorded per call.
- **Tests.** Vitest: 11 files, 104 tests, including a golden test of the detection-quality port (28 tests over 16
  archive images).

---

## Part IV. What each system lacks

Every item names its evidence. Kiln items are numbered K-n, Perf Lab items P-n, so later sections can refer to them.

### 17. Kiln

| # | Weakness | Evidence | Consequence |
| --- | --- | --- | --- |
| K-1 | The simulator times kernels with the model's own formula | `program.js:122-128` vs `tile.js:279-280`; same DRAM heuristic at `program.js:126` and `tile.js:277` | Model-vs-simulator agreement is self-consistency; tuning on `sim:*` finds what the formula rewards |
| K-2 | Evidence keeps one best number per schedule | `store.js:8-17` | One lucky low sample wins permanently; no repetitions, spread or environment |
| K-3 | The evidence key covers neither generated code nor hardware | identity at `program.js:37`; device ids `webgpu`, `cuda` at `devices.js:22, 121` | Codegen fixes leave old evidence in force; two GPUs collide in one store |
| K-4 | Measurement method is minimal, and its kind is ignored by decisions | WebGPU wall-clock fallback (`devices.js:21-117`); CUDA warm L2, no clock control (`kiln_runner.py:61-127`) | Simulated, wall-clock and event-timed numbers are ranked together |
| K-5 | Evidence is exploitation-only | `kiln.js:587-597` | A measured option can never lose to an unmeasured one that the model rates highly |
| K-6 | Tuning rollouts cannot see evidence | `tune.js:45` | SP-MCTS rollouts follow the model prior only |
| K-7 | `pinned()` fires only when every knob is pinned | `kiln.js:565, 983` | Partially pinned decisions are reported `by: "model"` |
| K-8 | `keepOriginal` uses `p.off` as its knob value | `core.mjs:44, 60-61` | Pinning the off value is ambiguous |
| K-9 | The fusion guard has an undocumented 2 % slack | `loop.js:342` | A fused kernel may do up to 2 % more work |
| K-10 | Coordinate-only index expressions, scalar reducers, fp32 only | `ix.js`, `fns.js:37-42` | No gathers, online softmax, Welford, fp16/bf16 or tensor cores |
| K-11 | Textbook code generation | `kernel.js:99-113, 170-241` | Simulated numbers flatter these kernels relative to production libraries |
| K-12 | `blocked` decisions are dead code | `kiln.js:752, 985-986` | An empty filter would never fall back |
| K-13 | Correctness checks are sampled; end-to-end skipped above 6e7 ops | `wb.js:156-185`, `program.js:92-120` | 10 of 25 presets are checked per kernel only; edge blocks may go unsampled |
| K-14 | The agent runs with full page privileges and no accounting | `agent.js:253`, `main.jsx:8` | Read-only mode is a convention; no eval cap; no token record |
| K-15 | The runner's Origin check is bypassable by DNS rebinding, and it compiles arbitrary CUDA | `kiln_runner.py:267-325` | Local code execution from a hostile page [inferred, not tested] |
| K-16 | No test harness or CI; pass names drift from the reference | `package.json`, `reference.txt:139-140` | The agent may address passes by wrong names |
| K-17 | By-example rules read lambda source text | `kiln.js:646-651` | Breaks under minification |
| K-18 | Silent scale limits | fork expansion at 20,000 leaves, 4,000 rewrites | Large programs are truncated without a message |

### 18. Perf Lab

| # | Weakness | Evidence | Consequence |
| --- | --- | --- | --- |
| P-1 | Job approval trusts the client's `proposedBy` | `server/app.ts:160, 172` | Page-run code (the assistant's) can approve its own job |
| P-2 | No authentication, Origin or Host check; `c.req.json()` ignores content type | `server/app.ts`, Hono 4.13 `request.js:104-105` | Cross-site `text/plain` POSTs can create and approve jobs [inferred] |
| P-3 | The dino workload executes Playback source at any revision the spec names | `workloads/perf_lab_dino/run.py:54-56, 135-143` | A forged job runs repository code |
| P-4 | The GPU-minute budget is enforced in the browser only | `src/features/agent/runtime.ts:349-350` | The server stores the budget and never reads it |
| P-5 | Content identity is 53-bit cyrb53, and fields named `*_sha256` hold cyrb53 values | `src/lang/util.ts:1`, `build.ts:554, 601, 617` | Collisions possible across many labs; misleading labels |
| P-6 | The seal is shallow | `values.ts:77-89` | Nested observed values are writable |
| P-7 | Synthetic counters carry prov `observed` | `data/generate.ts` | Synthetic data looks measured inside a value |
| P-8 | Verdicts are computed in a React component; a throwing predicate is `refuted` | `HypothesisView.tsx:19-48` | No headless verdict API; wrong verdicts on errors |
| P-9 | `pairedRatio` ignores its seed and hard-codes arm names | `stats.ts:23, 56-57, 69` | Only `baseline`/`candidate` experiments can use it |
| P-10 | `stats.offered` turns a missing arrival into 0 and missing windows into 1 | `stats.ts:100, 103` | Breaks "missing is never zero" |
| P-11 | No process timeout; cancellation signals `uv`, not Python | `runner.ts:57-61, 131-134` | A hung workload blocks the queue |
| P-12 | No real GPU execution; GPU boards are synthetic or imported | `runner.ts:92-98` | The kernel-level story is not measured locally |
| P-13 | The declared quality gate is not what runs | `run.py:161-168` | Python always compares against eager `unfused` |
| P-14 | The catalog is global; restart cleanup is partial | `store.ts:62-84, 254-261` | Stale artifacts and captures stay `running` |
| P-15 | With four processes the "95 % CI" is the min–max of four ratios | `T/sources/02` §8.5 | The label overstates what four pairs support |
| P-16 | No model to compare against | design: device peaks are `NaN` "so a roofline must not invent one" | A measured 9 ms cannot be placed against a bound |

### 19. What each can give the other

- **From Perf Lab to Kiln:** provenance on every number (fixes the presentation side of K-1 and K-4); repetitions
  and confidence intervals with the process as the resampling unit (K-2); content identity with server-side
  re-hashing (K-3); hypotheses with verdicts; activation checks (did the pinned schedule actually materialise, did
  WebGPU grant timestamps); server-side persistence and a job log; agent limits and token accounting (K-14).
- **From Kiln to Perf Lab:** a labelled model (a heuristic roofline bound beside an observed number, P-16);
  counterfactual variants generated by construction instead of found in git history; explanations of compiler
  decisions (declined rewrites with reasons); and hardware without hardware (simulator, WebGPU) for readers without
  a GPU.

---

## Part V. The unified workbench: design

### 20. Goals, non-goals and architecture

#### 20.1 Goals

1. **Every number states where it came from.** Every time, count and ratio shown anywhere in the workbench carries
   a provenance class and a source: model, simulator or hardware (§24).
2. **Hardware numbers are statistics, not samples.** A hardware measurement keeps every repetition, reports a median
   with a bootstrap confidence interval over repetitions, and lists what was excluded and why (§25).
3. **Evidence is keyed by what executed.** A measurement is attached to the content of the generated kernel, its
   launch configuration, its inputs and the device's fingerprint. Changing any of these makes old evidence stale
   instead of silently reusing it (§22, §23).
4. **The compiler trusts evidence only when it is decisive.** A schedule decision switches away from the model's
   choice only when confidence intervals separate (§26).
5. **Claims are written down and judged.** A project can state hypotheses whose verdicts are recomputed from the
   evidence whenever it changes (§29).
6. **Real hardware is reachable and guarded.** CUDA measurements run as server jobs with explicit approval;
   requests are protected against cross-site forgery and DNS rebinding; agent code cannot approve its own jobs
   (§30, §31).
7. **Kiln's look.** The workbench keeps Kiln's Swiss visual language, extended with provenance marks, stamps and
   stale frames that use shape and line style rather than new hues (§32).

#### 20.2 Non-goals for the first release

- New compiler expressiveness (gathers, pair reducers, fp16, tensor cores). These are K-10 items, recorded as
  follow-ups in §37.
- Multi-user deployment. The server binds to loopback and serves one person.
- Replacing the Perf Lab app. Perf Lab's language and boards come in last (Phase 8, §33); until then `PL/` remains
  runnable as it is.

#### 20.3 Principles

- **The server is optional.** The workbench runs as a static page with `localStorage` persistence, exactly like
  Kiln. With the server it gains durable evidence, CUDA jobs and the model gateway. Every feature degrades to a
  clear message when the server is absent.
- **Headless first.** Everything that decides something (statistics, identity, verdicts, the evidence policy) lives
  in a package with no DOM and no React, tested with Vitest or plain Node.
- **One implementation per piece of knowledge.** Hashing, canonical JSON, record validation and verdicts are
  written once in `packages/evidence` and used by the browser, the server and the tests.

#### 20.4 Repository layout

```text
kiln/                                   pnpm workspace root
├── package.json, pnpm-workspace.yaml   workspace scripts: build, dev, test, typecheck
├── tsconfig.base.json                  strict, erasableSyntaxOnly (Node runs .ts directly)
├── packages/
│   ├── evidence/                       @kiln/evidence: values, stats, sha256, identity, record, verdict (TypeScript)
│   └── kiln/                           @kiln/kiln: Kiln core + std (JavaScript ESM, moved from K/app/src/{core,std})
├── apps/
│   ├── workbench/                      @kiln/workbench: UI + agent (JSX), presets, build.mjs → dist/kiln-workbench.html
│   └── server/                         @kiln/server: Hono + node:sqlite; jobs, executors, SSE, model gateway
├── runner/kiln_runner.py               the CUDA runner, hardened (§30.6)
├── imports/                            Kiln zip and memo as received (read-only reference)
├── lab-workbench/                      Perf Lab as received (read-only reference until Phase 8)
└── ttmp/                               docmgr tickets
```

#### 20.5 Runtime architecture

```text
 ┌──────────────────────────── browser: one page, served by the server or opened from dist/ ─────────────────────────────┐
 │                                                                                                                         │
 │  Project script ──► @kiln/kiln pipeline ──► Run (decisions) ──► programOf ──► kernels[] + contentIds                     │
 │                          ▲ decide chain: kernel pins → pinned → evidence v2 (CI separation, §26) → model → first       │
 │                          │                                                                                              │
 │                    EvidenceStore (records) ◄──────── record() ◄──── measurement protocols (§28)                          │
 │                     │      │                                        ├─ sim:<gpu>     simulator, deterministic           │
 │      localStorage ◄─┘      └─► ServerAdapter (sync) ─────┐          ├─ webgpu:<fp>   in-page, reps + paired order       │
 │                                                          │          └─ cuda:<fp>     server job (proposed → approved)  │
 │  Hypotheses: @kiln/evidence verdict() over ev.* rows     │                                                              │
 │  UI: dock of views (Perf, Knobs, Evidence, Hypotheses, Jobs, …) in Kiln's visual language                               │
 │  Agent: eval in an opaque-origin sandbox iframe ◄── postMessage bridge ──► handle API (no token, no fetch to /api)      │
 └──────────────────────────────────────────────────────────┼──────────────────────────────────────────────────────────────┘
                                                            │  same origin, X-Kiln-Token header, Host allow-list
 ┌──────────────────────────────── @kiln/server (127.0.0.1:5280) ──────────────▼────────────────────────────────────────────┐
 │  Hono /api: records, devices, jobs, events (SSE), agent model gateway       node:sqlite  .data/kiln.sqlite (WAL)       │
 │  Job queue (one job at a time) ──► CudaRunnerExecutor ──► python3 kiln_runner.py run - (local or over ssh)              │
 └─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 21. The measurement record

A measurement record is the unit of evidence. It replaces Kiln's evidence row. One record holds every repetition
of one kernel (one schedule) on one device under one protocol.

```ts
// packages/evidence/src/record.ts
type Prov = 'observed' | 'derived' | 'heuristic' | 'illustrative' | 'unknown';
type TimingKind = 'simulated' | 'gpu-timestamp' | 'wall-clock' | 'cuda-events' | 'legacy';

interface MeasurementRecord {
  format: 'kiln-measure/1';
  id: string;                    // sha256(canonicalJSON(record without id)), recomputed by the server
  at: string;                    // ISO 8601
  by: 'measure' | 'tune' | 'job' | 'import';
  device: {
    id: string;                  // 'sim:rtx5090' | 'webgpu:apple-metal-3-1a2b3c4d' | 'cuda:nvidia-rtx-4090-5e6f7a8b'
    class: 'sim' | 'webgpu' | 'cuda';
    name: string;                // human label
    fingerprint: Record<string, string | number | boolean>;
  };
  kernel: {
    name: string;
    identity: string;            // Kiln's loop-expression identity: WHAT is computed (groups schedules)
    row: string;                 // canonical schedule knobs: HOW it is mapped
    knobs: Record<string, string | number>;
    contentId: string;           // sha256 of WHAT EXECUTED (§22)
    lang: 'cuda' | 'wgsl' | 'sim';
    sourceSha256: string;        // sha256 of the generated source text in that language
    launch: { grid: number; block: number; smem: number };
  };
  timing: {
    kind: TimingKind;
    unit: 'us';
    samples: number[];           // one value per repetition: the median of that repetition's timed launches
    launches?: number;           // timed launches per repetition
    warmup?: number;
    raw?: number[][];            // optional per-launch times, per repetition
  };
  counts?: Record<string, number>;               // sectors, wavefronts, flops, bytes, ncu metrics …
  countsProv?: 'derived' | 'observed';           // simulator counts are derived; ncu counters are observed
  check: { ok: boolean; sampled: number; maxAbsErr?: number; detail?: string };
  activation: { requested: string | null; materialized: string; ok: boolean; notes: string[] };
  validity: { ok: boolean; reasons: string[]; partial: string[] };
  protocol: { reps: number; seed: number; order?: number[]; pairId?: string; position?: number[] };
  manifest: { codegen: string; app: string; runner?: string; userAgent?: string; host?: string; [k: string]: unknown };
}
```

Rules that every producer follows:

- `samples.length === protocol.reps` for a completed record. A repetition that failed is not dropped silently: it
  makes the record invalid with a reason.
- `validity.ok` is false when the output check failed, when the activation check failed (§27), or when any
  repetition errored. Invalid records are stored and shown, never used for decisions or verdict support.
- `validity.partial` lists caveats that do not invalidate a record but must be shown, for example
  `"wall clock: includes submit and readback overhead"`.
- The record id is a content hash, so the same measurement imported twice is stored once.

### 22. Content identity

Kiln's kernel identity answers "is this the same computation?" and is kept for grouping. The unified design adds a
**content id** that answers "is this the same executable?":

```text
contentId(kernel, lang, device):
  material = canonicalJSON({
    codegen:  CODEGEN_VERSION,                    # bumped when emit.js / kernel.js semantics change
    lang:     lang,                               # 'cuda' | 'wgsl' | 'sim'
    source:   sha256(canonicalSource(sourceText(kernel, lang), symbol)),   # CUDA, WGSL or Kernel IR text, entry symbol → "kernel"
    launch:   { grid, block, smem },
    inputs:   kernel.inShapes.map((shape, j) => ({ shape, seed: seedOf(kernel, INPUT_SEED, j) })),
    output:   kernel.shape,
    target:   lang == 'sim' ? sha256(canonicalJSON(targetSpec)) : null   # a simulator's "hardware" is its spec
  })
  return sha256(material)
```

- **The kernel's name is not part of its content.** `canonicalSource` replaces the kernel's own entry symbol (the
  CUDA `__global__` name) with `kernel`, and input seeds are derived from the kernel identity, not the name
  (`seedOf` in `std/program.js`). Two kernels of one program that compute the same thing on the same shapes — W-19's
  unfused GELU has two — are then one executable with one content id: measuring one measures both. Before this rule,
  the store kept one current content id per (device, identity, row), so the second kernel's compile made the first
  kernel's record stale and both read "no measurement". The server applies the same `canonicalSource` when it
  recomputes a job's content ids.
- **canonicalJSON** sorts object keys, rejects `undefined`, functions, `NaN` and infinities, and writes numbers with
  `JSON.stringify`. It is the single serialisation used for every hash in the system.
- **sha256** is a small synchronous pure-TypeScript implementation in `packages/evidence/src/sha256.ts`, tested
  against `node:crypto`. A synchronous hash is required because Kiln's compile path is synchronous.
- The content id is computed in `programOf` for each language, so the Kernels view can show it and the evidence
  store can compare it with recorded ones.
- **Stale evidence**: a record whose `kernel.contentId` differs from the current kernel's content id for the same
  device class and language. Stale records stay in the store, are shown with a dashed frame and the word "stale",
  and are never used by the decide chain or by hypothesis support.

**The current content id of an option.** A fork's unchosen options are never compiled, so their content id is not
known when the fork is decided. The store therefore compares an option's records with the content id from the last
compile that produced that row (`EvidenceStore.observe`, called after every compile), or, if this session never
compiled the row, with the content id in the option's newest record. A record from another code generator
(`manifest.codegen ≠ CODEGEN_VERSION`) is stale either way. In practice an edit to `emit.js` that changes the
generated code makes the old records stale for every row the next compile produces. Rows not compiled since keep
deciding until they are measured again or the code-generator version is bumped. Bumping `CODEGEN_VERSION` after
any change to emitted code closes that gap.

Compared with Perf Lab: the same idea (identity is a hash of the lowered specification, recomputed by the server),
with SHA-256 instead of cyrb53 (fixes P-5), and with the generated code inside the identity (fixes K-3).

### 23. Device identity and fingerprints

A device id names a class and the facts that make two measurements comparable:

| Class | Fingerprint fields | Id example |
| --- | --- | --- |
| `sim` | `spec` (sha256 of the target spec), `name` | `sim:rtx5090` (spec changes are caught by the content id) |
| `webgpu` | `vendor`, `architecture`, `device`, `description` (from `GPUAdapter.info`), `timestamps` (granted or not), `userAgent` | `webgpu:apple-metal-3-1a2b3c4d` |
| `cuda` | `name`, `cc`, `driver`, `cuda` (runtime), `host`, `clocks` (max SM and memory clocks), `persistence` | `cuda:nvidia-geforce-rtx-4090-5e6f7a8b` |

The id is `<class>:<slug of the name>-<first 8 hex of sha256(canonicalJSON(fingerprint))>`. Two GPUs of different
models, drivers or hosts produce different ids, so their evidence cannot collide (K-3). A WebGPU adapter that grants
timestamp queries and one that does not are different devices, because their numbers are of different kinds.

Legacy Kiln evidence (`kiln-evidence/1`) is imported under `legacy:<old device id>` with timing kind `legacy`, one
sample, and `validity.partial = ["legacy row: one best value, no repetitions, no content id"]`. It is visible but
never decisive.

### 24. Provenance: the three numbers

Every number in the unified workbench is a `Value` from `@kiln/evidence` (the Perf Lab shape). The mapping from
Kiln's sources to Perf Lab's classes:

| Number | Source | Class | Method string shown in the tooltip |
| --- | --- | --- | --- |
| Model time | `estimate` on the target | heuristic | "analytic estimate: roofline + occupancy + waves (tile.js)" |
| Simulator time | `simulateKernel` | heuristic | "timeModel over counts from N sampled blocks" |
| Simulator counts (sectors, wavefronts, divergence) | `SimMetrics` | derived | "SIMT simulation of N sampled blocks, scaled ×S to the grid" |
| Hardware sample (one repetition) | WebGPU or CUDA | observed | "median of L timed launches (gpu-timestamp)" |
| Hardware median and CI | statistics over samples | derived | "median of N repetitions; 95 % bootstrap CI over repetitions" |
| Ratio of two hardware medians | paired or unpaired estimator | derived | "paired ratio over N repetitions" or "ratio of medians, unpaired" |
| Nsight counters | `ncu` through the runner | observed | "ncu --metrics …" |
| Teaching walkthroughs | notes, illustrations | illustrative | "illustration, not this program" |
| Anything not measured | — | unknown | the reason ("no measurement on this device") |

Rules for combining values: the class of a computed value is the weakest class among its inputs, in the order
`unknown < illustrative < heuristic < derived`, where observed inputs yield `derived`. A ratio of a heuristic time
and an observed time is heuristic. This rule is implemented once, as `combine(...provs)`.

The UI shows the class as a mark (§32.3) and the source as a word ("model", "simulated", "measured"). The three
numbers appear side by side wherever a kernel time is shown, so the gap between them is visible: the model's
prediction, the simulator's count-based estimate, and the hardware median with its interval.

### 25. Statistics

All estimators live in `packages/evidence/src/stats.ts` and are deterministic given their seed.

```text
summarize(samples, {level = 0.95, draws = 2000, seed}):
  n = len(samples)
  if n == 0: return missing("no repetitions")
  m = median(samples)
  if n == 1 or all samples equal: return {median: m, ci: [m, m], n, note: n == 1 ? "single repetition" : "zero spread"}
  r = mulberry32(seedFrom(seed))                         # the caller's seed is honoured (fixes P-9)
  boots = sorted([ median(resample_with_replacement(samples, r)) for _ in 1..draws ])
  return {median: m, ci: [quantile(boots, (1−level)/2), quantile(boots, 1 − (1−level)/2)], n,
          note: n < 6 ? "n = " + n + ": the interval is bounded by the sample range" : null}

pairedRatio(pairs = [{rep, a, b}], {level, seed}):       # b/a per repetition; the repetition is the unit
  ratios = [p.b / p.a for p in pairs if both finite and > 0]
  return summarize(ratios, {level, seed}) with method "paired ratio over N repetitions"

separated(x, y): x.ci[1] < y.ci[0] or y.ci[1] < x.ci[0]
```

Notes for the reader:

- **Why the repetition is the unit.** Timed launches inside one process share the process's state (caches,
  clocks, allocator); they are not independent. Treating 50 launches as 50 observations understates the spread.
  A repetition is one fresh context (a new process for CUDA, a new `GPUDevice` for WebGPU), and the statistics
  resample repetitions. This is Perf Lab's rule, applied to kernels.
- **Small n is labelled, not hidden.** With fewer than six repetitions the interval of a bootstrap median cannot
  extend beyond the sample range; the note says so in the UI (fixes the presentation of P-15).
- **Deterministic devices.** A simulator record has one sample and a zero-width interval. Separation then reduces to
  comparing medians, which reproduces Kiln's behaviour for `sim:*` devices exactly.

### 26. The evidence policy, version 2

The new `k.decide.evidence` keeps the shape of the old one (a policy that may defer) but decides on intervals:

```text
evidence(store, {minReps = 3, always = false})(fork fp, run, next):
  stats = store.optionStats(fp, run)       # per option: null, or {median, lo, hi, n, deterministic, records}
                                           # only fresh (content id matches), valid, non-partial records
  measured = options with stats != null and (stats.deterministic or stats.n >= minReps)
  if measured is empty: return null                                   # defer to the model
  if always: return {order: by median, by: "evidence"}
  model = next()                                                       # the model's order
  fav = model.order[0]
  if stats[fav] is null: return null                                   # defer until the favourite is measured (as before)
  best = argmin over measured of median
  if best == fav:            return {order: [fav, …model order], by: "evidence", note: "confirms the model"}
  if separated(best, fav):   return {order: [best, …], by: "evidence", note: "separated from the model's choice"}
  return {order: model.order, by: "model", note: "evidence within noise: best " + best.row + " overlaps " + fav.row}
```

Decision attribution (the `by` field) becomes one of:

| `by` | Meaning |
| --- | --- |
| `kernel-pin` | The user pinned a schedule row for this kernel identity |
| `pinned` | Every knob of the fork is pinned by parameters |
| `pinned-partial` | Some knobs are pinned; the remaining options were ordered by the next policy (fixes K-7) |
| `evidence` | Measured evidence confirmed the model, or overrode it with separated intervals |
| `model` | The cost model decided; the note says when evidence existed but was within noise |
| `first` | Emission order |

Tuning (`tune.js`) keeps its search but records `kiln-measure/1` records and, after a search, reports for the best
program whether its advantage over the model's program is separated on this device.

### 27. Validity, activation and staleness

Perf Lab's validity rule transfers to kernels with these checks:

| Check | Fails when | Effect |
| --- | --- | --- |
| Output check | Sampled outputs disagree with the Loop IR reference beyond tolerance, an out-of-bounds access, or a divergent barrier | invalid |
| Activation | The measured kernel's materialised row differs from the row the compile decided (or the kernel pin requested) | invalid |
| Repetition error | Any repetition threw, timed out or returned no samples | invalid |
| Timestamp fallback | WebGPU did not grant `timestamp-query`; times include submit and readback | partial |
| Small n | Fewer repetitions than the protocol asked for after exclusions | invalid |
| Legacy | Imported `kiln-evidence/1` row | partial |
| Stale | Content id differs from the current kernel's | not invalid; excluded from decisions and verdicts, shown dashed |

The activation check is the kernel-level form of Perf Lab's `expect(activation(…), {onMiss: 'invalid'})`: it proves
that what ran is what the decision claims ran. For example, a pin to `MAP=tiled` that the legality filter could not
honour, falling back to `MAP=row`, now produces an invalid record with the reason
`"activation: requested MAP=tiled,… materialised MAP=row,…"` instead of silently attributing the time to the pin.

### 28. Measurement protocols

A protocol is how a device produces records. All protocols share the record format and the statistics.

**Simulator (`sim:<gpu>`).** One repetition per kernel; `simulateKernel` as today. Timing kind `simulated`; counts
recorded with `countsProv: 'derived'`. Deterministic.

**WebGPU (`webgpu:<fp>`).** In the page:

```text
measureWebGpu(kernels, {reps = 7, warmup = 3, launches = 20, seed}):
  adapter = requestAdapter(); fp = fingerprint(adapter); device id = deviceId('webgpu', fp)
  for rep in 0 … reps−1:
    order = shuffle(kernels, rng(seed + ":" + rep))           # paired order: each repetition runs every kernel
    for kern in order:
      gpu = adapter.requestDevice(timestamps ? {requiredFeatures: ['timestamp-query']} : {})   # fresh context
      pipeline, buffers = build(kern.wgsl, inputs(kern))
      run warmup launches; time `launches` launches (timestamp queries, else wall clock around submit)
      check sampled outputs (first repetition only)
      sample[kern][rep] = median(launch times); gpu.destroy()
  return one record per kernel: samples, order, check, activation, validity (partial if wall clock)
```

As built (`WebGpuDevice.measureKernels`, `runProtocol` in `std/devices.js`):

- An adapter creates one device, so each fresh context requests a new adapter and refuses one whose facts differ
  from the probed fingerprint (its numbers would carry the wrong device id).
- Inputs are generated once per call; they do not depend on the context, and generating them dominated the cost
  (38 ms for 17 MB, against about 1 ms for a device and 0.5 ms for a pipeline).
- Records store each kernel's `position` in every repetition rather than the protocol's `order`; the order is
  recomputable from the seed (`repetitionOrder(n, seed, rep)`, shared with the server's job protocol).
- A kernel-repetition that does not finish within 60 s fails that repetition (`repErrors`), which makes the record
  invalid instead of hanging the measurement.
- Chrome started without `--enable-unsafe-webgpu` quantises timestamps (65.536 µs in Chrome 155 on macOS). The
  protocol detects a timer grid of 1 µs or more over the run's launch times and marks its records partial
  ("timestamps quantized to …"), so they are shown and never decide; Devices explains why.
- On an M1 Pro the GPU runs at discrete clock levels up to about 3× apart, and the first repetition after idle is
  often the slow one. Intervals therefore come out wide and decisions stay "within noise"; separately run,
  unpaired measurements are not comparable on such a machine. The paired protocol (below, Phase 6) is the remedy.

**CUDA (`cuda:<fp>`).** A server job (§30.4). The page proposes a job containing each kernel's CUDA source, launch
and input seeds; the server's executor runs `kiln_runner.py run -` once per repetition with the kernels in seeded
order; each kernel is a fresh process of its harness; the per-repetition sample is the median of its timed
launches. The job produces records exactly like the WebGPU protocol.

**Paired comparison.** A comparison of two schedules (or two programs) uses one protocol run containing both
kernels, so each repetition yields one sample of each in a random order. Records share a `pairId` and record their
position in each repetition; `ev.ratio` (§29) uses `pairedRatio` when two records share a `pairId`, and an unpaired
ratio of medians (with its own note) otherwise.

As built (Phase 6): `measurePaired({pipeline, graph, params, device, store, identity, rows})` in
`K/src/std/tune.js` compiles the program once per row with the kernel `identity` pinned to it (the
`kernelPinPolicy` the Knobs view's pins use, chained in front of the caller's policies), refuses a row the compile
cannot honour and two sides that are one schedule, then passes the sides' kernels to one `measureKernels` call. A
device without a protocol (the simulator) runs each side once; its paired ratio has zero width. Pairing in
`ev.ratio` is by repetition index, which is sound because a record with a failed repetition is invalid and never
decisive (§27).

**Export and import.** The `kiln-bundle/1` export remains for machines the server cannot reach; the runner's output
is imported as records with `by: "import"`.

### 29. Hypotheses

#### 29.1 Writing one

A project script declares hypotheses next to the program. The predicate reads rows from an evidence context `ev`,
and returns a boolean or a `Value`:

```js
project("rmsnorm")
  .params(rows, dim)
  .program(/* … as in W-05 … */)
  .hypothesis("row-beats-thread", h => h
    .claim("For rows of 4096, one row per block is at least twice as fast as one element per thread.")
    .predicts(ev => ev.ratio("rms_norm", { a: "MAP=thread", b: "MAP=row" }), r => std.evidence.below(r, 0.5))
    .alternatives("A block per row leaves SMs idle when there are fewer rows than SM slots")
    .scope("the current device; fp32; default sliders"));
```

A claim about an interval needs a three-valued predicate. `r.hi < 0.5` returns `false` whenever the interval reaches
0.5, and `false` is a counterexample, so a wide interval would *refute* a claim it merely cannot confirm. The
helpers `below(r, bound)` and `above(r, bound)` (`@kiln/evidence`, also `std.evidence`) return `true` when the
whole interval `[r.lo, r.hi]` is on the claimed side, `false` when it is wholly on the other side, and `null` when
it straddles the bound; `null` leaves the row undecided and the hypothesis `open` (§29.3). The case is not
hypothetical: an unpaired ratio on a GPU with clock states has an interval like `[0.13, 1.2]` around a median of 0.4.

In the notes, a fenced block renders the hypothesis as a card with its live verdict:

````markdown
```hypothesis row-beats-thread
```
````

#### 29.2 The evidence context

| Call | Returns (rows) | Fields |
| --- | --- | --- |
| `ev.kernels({device?})` | one row per kernel of the current program | `name, identity, row, model, time, lo, hi, n, valid` (`model` heuristic; `time` on the device, prov by device class) |
| `ev.options(kernel, {device?})` | one row per measured schedule option of a kernel | `row, knobs, model, time, lo, hi, n, chosen` |
| `ev.ratio(kernel, {a, b, device?})` | one row | `ratio, lo, hi, n, paired, a, b` (`ratio = time(b) / time(a)`, derived) |
| `ev.total({device?})` | one row | `total` (sum of kernel medians; prov = weakest of the parts) |
| `ev.records(filter)` | raw records | read-only, sealed |

Every call records which records it read. Those records are the hypothesis's **support**: if any is invalid, the
verdict is `unqualified`. A missing measurement appears as a missing `Value` (`value: null`, a reason), which
compares as `NaN`.

#### 29.3 The verdict function

`packages/evidence/src/verdict.ts` is the only implementation; the UI, the agent and tests call it.

```text
verdict({rows, predicate, support}):
  if any record in support is invalid:          return unqualified (reasons = its validity reasons)
  if rows is empty:                             return open ("no rows: nothing measured yet")
  for each row:
    view = a read-only proxy of row that records the path of every field read, at any depth (r.k.t → "k.t")
    try   out = predicate(view)
    catch e: check = {pass: null, error: e.message}                          # an error is never a refutation (fixes P-8)
    missing = the read paths whose value is missing (a missing Value, null, undefined or NaN)
    pass = out is Value ? (out missing ? null : Boolean(out.value)) : (out is null, undefined or NaN ? null : Boolean(out))
    if missing is not empty: pass = null                                     # a row with missing inputs can neither support nor refute
  if some check.pass == false:                  return refuted   (one clean counterexample)
  if some check.pass == null:                   return open      (with the missing fields and errors)
  return supported
```

The "missing inputs" rule closes the negative-predicate hole: `!(r.x > 1)` passes on `NaN`, but a row whose `x` is
missing can neither support nor refute. Only fields the predicate reads count, so a missing column the claim does not
mention does not hold a row open. Reads are tracked through nested objects and arrays (`r.k.t`, `r.reps[1]`), and
the proxy's target is an empty shell that forwards to the row, so frozen rows are tracked too. A predicate that
writes to its row throws, and its row is undecided.

### 30. The server

#### 30.1 Process and configuration

`apps/server` is a Hono application served by `@hono/node-server`, run directly by Node 26 (TypeScript type
stripping; no build step). It listens on `127.0.0.1:5280` (`KILN_PORT`), keeps its SQLite database and runner cache
under `KILN_DATA_DIR` (default `apps/server/.data`), and serves the built workbench (`apps/workbench/dist`) at `/`
with a session token injected into the page.

| Variable | Default | Effect |
| --- | --- | --- |
| `KILN_PORT` | `5280` | HTTP port (loopback only) |
| `KILN_DATA_DIR` | `apps/server/.data` | Database, logs, job artifacts |
| `KILN_DIST` | `apps/workbench/dist` | The page to serve |
| `KILN_EXECUTORS` | `.data/executors.json` | CUDA executor profiles (local or SSH), §30.5 |
| `KILN_MODEL` | unset | Model id for the agent gateway; unset turns the gateway off (§31) |
| `KILN_MODEL_URL` | `https://api.anthropic.com/v1/messages` | The Messages endpoint the gateway calls |
| `ANTHROPIC_API_KEY` | unset | Sent upstream as `x-api-key`; never logged, stored or returned to the page |

#### 30.2 Security model

The server is a local tool that can compile and run code on a GPU host. Four checks run before any route:

1. **Host allow-list.** The `Host` header must be `127.0.0.1:<port>`, `localhost:<port>` or `[::1]:<port>`;
   otherwise `403 bad_host`. A rebinding attack resolves an attacker's name to 127.0.0.1, but its requests carry
   the attacker's host name, so they are refused (fixes K-15, P-2's rebinding part).
2. **Origin.** If `Origin` is present it must be `http://<allowed host>`; `Origin: null` (sandboxed frames, file
   pages) is refused.
3. **Session token on every non-GET request.** `X-Kiln-Token` must equal a random 256-bit token generated at
   start-up and written into the served page (`<meta name="kiln-token">`). A cross-site page cannot read the token,
   and a custom header forces a CORS preflight that the server never approves (fixes P-2).
4. **Content type.** JSON routes require `application/json` (`415` otherwise).

The agent's code never holds the token (§31), so it cannot approve jobs or write records directly.

#### 30.3 HTTP API (`/api`)

| Method and path | Body | Response | Notes |
| --- | --- | --- | --- |
| `GET /health` | | `{status, version, startedAt, db: {migrations}, executors: n, features: [...]}` | |
| `GET /records?device=&identity=&since=` | | `{records: MeasurementRecord[]}` | |
| `POST /records` | `{records: MeasurementRecord[]}` | `{added, duplicates, rejected: [{id, reason}]}` | The server validates each record and recomputes its id and content id; a mismatch is rejected |
| `DELETE /records?device=` | | `{deleted}` | "Forget device" |
| `GET /devices` | | `{devices: [{id, class, name, fingerprint, executor, available, error?}]}` | CUDA executors and every device seen in records |
| `POST /devices/:executor/probe` | | device | Runs `kiln_runner.py device` and `nvidia-smi` |
| `GET /jobs`, `GET /jobs/:id` | | `JobView` | |
| `POST /jobs` | `{executor, kernels: [...], protocol: {reps, warmup, launches, seed}, reason}` + header `X-Kiln-Proposer: user \| agent` | `201 JobView` | `user` jobs may pass `approve: true`; `agent` jobs are always `proposed` |
| `POST /jobs/:id/approve`, `POST /jobs/:id/cancel` | | `JobView` | Approve requires the token; the agent bridge does not expose it |
| `GET /events` | | `text/event-stream` | `hello`, `ping`, `job.updated`, `job.event`, `records.added`, `device.updated` |
| `POST /agent/sample` | `{conversation, messages, tools?, system?, max_tokens?}` (Messages API shapes) | `application/x-ndjson`: `text` events, then one `done` or `error` | One `llm_calls` row per upstream call; refusals `503 no_model`, `503 no_api_key`, `413 prompt_too_large` (§31) |
| `GET /agent/usage` | | `{model, ready, totals: [...], conversations: [...]}` | Token sums by model, and by conversation and model (at most 50) |

#### 30.4 Jobs

```text
proposed ──approve──► approved ──► running ──► done
    │                    │            │  └──► failed (error, partial records kept as invalid)
    └──cancel──► cancelled ◄──cancel──┘
```

A job holds kernels (name, identity, row, content id, CUDA source, launch, input seeds, output size, sample indices)
and a protocol. On creation the server recomputes each kernel's content id from the submitted source and launch and
refuses a mismatch (`409 content_id_mismatch`). The queue runs one job at a time. Every state change emits
`job.updated`; every executor line emits `job.event`; completion inserts records and emits `records.added`.

Limits enforced by the server (not the page): at most 64 kernels and 64 repetitions per job; a per-repetition
timeout (default 120 s); a daily budget of executor seconds for agent-proposed jobs (default 600 s).

#### 30.5 Executors

```ts
interface Executor {
  id: string;                                  // 'local-cuda', 'rtx-dev', …
  probe(): Promise<DeviceInfo>;                // fingerprint and availability
  runRepetition(bundle: KilnBundle, signal: AbortSignal): Promise<KilnResults>;
}
```

- `CudaRunnerExecutor({target: 'local'})`: spawns `python3 runner/kiln_runner.py run - --out -` with the bundle on
  stdin.
- `CudaRunnerExecutor({target: 'ssh', host, python, runner})`: the same command through `ssh -T host`, with the
  runner copied once to a cache directory on the host (content-addressed by its SHA-256). The job's lifetime is
  tied to the SSH connection: cancelling kills it, which kills the remote process.
- `FakeRunnerExecutor`: test-only; a script that prints `kiln-results/1` with deterministic numbers. It is never
  registered by the production configuration.

Profiles live in `.data/executors.json`:

```json
{ "executors": [ { "id": "rtx-dev", "target": "ssh", "host": "playback@playback-rtx-dev", "python": "python3",
                   "runnerDir": "~/.cache/kiln-runner", "env": { "KILN_ARCH": "native" } } ] }
```

#### 30.6 Runner changes

`runner/kiln_runner.py` is copied from `K/runner/` and changed:

- `run -` reads the bundle from stdin and `--out -` writes results to stdout, so no HTTP server is needed.
- `serve` gains a Host allow-list and a token (for users who still want live mode without the unified server).
- `device` also reports driver version, clocks and persistence mode from `nvidia-smi` when present.
- Each kernel result includes every per-launch time (already printed by the harness) and the ptxas register count.
- An optional `--flush-l2` writes a 2× L2-sized buffer between launches, for cold-cache questions.

#### 30.7 SQLite schema

```sql
create table records   (id text primary key, at text, device_id text, device_class text, identity text, row text,
                        content_id text, kind text, ok integer, by text, json text not null);
create index records_lookup on records(device_id, identity);
create table devices   (id text primary key, class text, name text, fingerprint_json text, first_seen text, last_seen text);
create table sources   (sha256 text primary key, lang text, text text not null);    -- generated sources by hash
create table jobs      (id text primary key, status text, proposed_by text check (proposed_by in ('user','agent')),
                        executor text, reason text, spec_json text, spec_sha256 text, created_at text,
                        approved_at text, finished_at text, error text);
create table job_events(id integer primary key autoincrement, job_id text references jobs(id) on delete cascade,
                        at text, kind text, detail text);
create table llm_calls (id integer primary key autoincrement, conversation text, model text, input_tokens integer,
                        output_tokens integer, reasoning_tokens integer, cache_read_tokens integer,
                        est_prompt_tokens integer, duration_ms integer, stop_reason text, error text, created_at text);
```

Migrations follow Perf Lab's append-only pattern (`PL/server/db.ts`): an ordered array of SQL strings, each applied
once inside a transaction.

### 31. The agent

The agent keeps Kiln's design (one `eval` tool, a handle API, snapshots and revert) and gains isolation and
accounting:

- **Sandbox.** Eval code runs in a dedicated worker started by an `<iframe sandbox="allow-scripts">` created from
  `srcdoc`. The frame has an opaque origin, so neither it nor its worker can read the page's DOM, `localStorage` or
  the session token, and the server refuses their requests (`Origin: null`). The worker has no document, so it cannot
  navigate anything, and it inherits the frame's CSP, which refuses every connection. The page exposes the handle API
  through one `MessagePort`: every page-side namespace method becomes an async stub in the worker
  (`await editor.set(text)`), and every call is checked against the run mode (Auto, Ask, Read-only) on the page side,
  where eval code cannot change it (fixes K-14).
- **Held scripts.** A project script runs in the page with the user's authority, so a script the agent writes is held
  until the user presses Run (§31.4). Without this, `editor.set` would carry agent-written code past the sandbox.
- **Jobs.** `jobs.propose({device, reason})` is the only way agent code can reach real hardware. The page sends it
  with `X-Kiln-Proposer: agent`; the server keeps it `proposed` until the user approves it in the Jobs view (fixes the
  Kiln side of P-1).
- **Model gateway.** When the page is not hosted with a `window.claude` bridge, `wb.sample` posts to
  `/api/agent/sample`, which calls the configured model and writes an `llm_calls` row per call with reported and
  estimated tokens.
- **Limits.** At most 8 evals per answer and 12 model calls per answer, output capped as before, and a guideline that
  every number cited in an answer names its source word (model, simulated, measured on a named device) and that no
  hardware speedup is claimed from heuristic numbers.

#### 31.1 As built: where each piece lives

| File | Runs in | Role |
| --- | --- | --- |
| `apps/workbench/src/agent/agent.js` | page | Conversations, the answer loop, `runEval`, the handle API (`makeAgentScope`), `pageCall`, `frameContext`, snapshots and revert |
| `apps/workbench/src/agent/sandbox.js` | page | `FRAME_CSP`, `frameDoc()`, `servePort()` (answers one eval's calls), `runInFrame()` (one frame per eval) |
| `apps/workbench/src/agent/worker-main.js` | worker | Entry point: takes the port from the first message and calls `startFrame` |
| `apps/workbench/src/agent/frame.js` | worker | `startFrame(port)`: builds the eval's names (bridged stubs plus local namespaces) and runs the code |
| `apps/workbench/src/agent/inspect.js` | worker | `ir` and `trace` over the worker's own compile |
| `apps/workbench/src/agent/encode.js` | both | Summaries (`runSummary`, `e2eLine`), `yaml`, and the wire format (`toWire`, `fromWire`) |
| `apps/workbench/src/compile.js` | both | `compileScript`, `pipelineFor`, `endToEnd`: the one compile path the page and the worker share |
| `apps/workbench/src/agent/gateway.js` | page | `gatewaySample()`: the `sample` contract over `/api/agent/sample` |
| `apps/server/src/agent.ts` | server | The gateway routes and `llm_calls` accounting |

`build.mjs` bundles `worker-main.js` into `src/frame.gen.js` (`WORKER_JS`). `frameDoc()` embeds that bundle as a
string literal with every `<` escaped, so no byte of it can end the frame's `<script>`; the frame's own script is
a handful of lines that start the worker from a `blob:` URL and transfer it the port. The CSP is
`default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:`.

#### 31.2 The protocol

```text
page                                   frame (opaque origin)          worker (no document)
 │ create <iframe sandbox srcdoc>  ──▶  boot script runs
 │ on load: postMessage({t:"kiln-port"}, [port2]) ─▶ new Worker(blob) ─▶ postMessage(null, [port2])
 │                                                                     startFrame(port2)
 │ port1 ─ {t:"eval", code, api:[{path}], ctx} ───────────────────────▶ build names, run code
 │ ◀─────────────────────────────────── {t:"call", id, path, args} ─── await editor.set(…)
 │ pageCall(api, path, args): mode check, run, toWire
 │ ── {t:"ret", id, ok:true, value, ctx?} ────────────────────────────▶ resolve; new ctx → recompile
 │ ── {t:"ret", id, ok:false, error:{name, message}} ─────────────────▶ reject
 │ ◀──────────────────────────────── {t:"done", ok, out, lang, logs} ─
 │ remove the frame (its worker ends with it)
```

`api` lists the paths of the page scope's own functions (`editor.set`, `jobs.propose`, …). `pageCall` looks the path
up in that `Map` and refuses anything else, including `__proto__` and `constructor`. Arguments that contain a function
are refused in the worker before they are sent. `toWire` turns a `Tensor` into `{$kiln: "Tensor", shape, data}`,
which `fromWire` rebuilds, and other class instances into plain data.

`ctx` is the page state the worker needs to compile exactly as the page would: `{script, params: {vals, pins},
kernelPins, target, deviceId, store}`, where `store` is `EvidenceStore.slice(deviceId)` (that device's records and
current entries). A call that changes the page (`editor.set`, `params.set`, `measure`, …) returns a fresh `ctx`, and
the worker drops its cached compile.

#### 31.3 What runs in the worker and what is bridged

| In the worker | Bridged to the page |
| --- | --- |
| Kiln's script names (`k`, `P`, `std`, `project`, …), `log`, `console` | `editor.get/set/edit`, `notes`, `params`, `forks`, `kernels`, `devices` |
| `ir.*`, `trace.*` over the worker's compile of the editor's script; they return live objects and take predicates | `compile`, `measure`, `tune`, `evidence`, `presets`, `jobs.list/propose` |
| `editor.check(text?, {device?, pins?})`: compiles in the worker; another device's `ctx` comes from the page (`__context`) | `chat.table/code/show/place`; `chat.propose` sends the worker's compile verdict and the page only displays it |

The worker's `editor.check` deep-equals the page's own compile summary, including forks decided by evidence
(`test/sandbox.mjs`).

#### 31.4 Held scripts

A project script is JavaScript, and the page compiles it with the page's authority: it could read the session token
and approve jobs. A script the agent writes therefore does not run in the page until the user says so. With the
setting **Scripts: Hold** (the default), `editor.set` and `editor.edit` put the text in the editor and set
`wb.pending`; the page keeps its last compile, and the Code view shows a bar with a "not run" stamp and **Run it**
(`wb.runScript()`). The worker compiles the held text itself and returns that summary with `ran: false`, so the agent
still sees errors and kernels. While a script is held, `measure`, `tune`, `kernels`, `forks`, the checks,
`evidence.best` and `jobs.propose` refuse with `HeldScriptError`, and the page's own Measure refuses too, because
their results would describe a compile the editor no longer shows. The draft, presets and snapshots carry the flag;
revert restores the previous script unheld. **Scripts: Run** restores the old behaviour.

#### 31.5 Verification

`test/sandbox.mjs` (36 checks, in `pnpm test`) runs the worker's runtime and the port server in Node over a
`MessageChannel`. `test/agent-e2e.mjs` (`pnpm --filter @kiln/workbench test:agent`; needs Chrome) runs the built
page against the development server and a fake model upstream:

| Attempt from eval code | Result |
| --- | --- |
| `typeof document, window, parent, localStorage` | all `undefined` |
| `fetch` the server's `/api/jobs/…/approve` | `TypeError: Failed to fetch`; no job approved |
| `fetch`, `WebSocket`, `EventSource`, `importScripts`, `new Worker` to another host | errors or deferred failures; **no request reaches the host** |
| `location.href = …` | `TypeError` (a worker's location is read-only) |
| `jobs.propose(…)` | `proposed`; still proposed 3 s later, by `agent` |
| `editor.set(…)` | `ran: false`, `compiles: true`; the page's compile unchanged until Run |
| `while (true) {}` | the page keeps answering; Stop removes the frame and ends the worker |

Each model call is one `llm_calls` row filed under the conversation, and the API key never appears in the page. The
exception names do not prove that nothing left: with `connect-src *` added to the CSP, `fetch` still reports
`TypeError` (the response is unreadable from an opaque origin), yet the request reaches the host. The test therefore
aims every attempt at the fake upstream's `/leak` path and asserts that none arrived; with the loosened CSP it fails,
listing `/leak?fetch /leak?sse /leak?ws`.

An earlier build ran eval code in the frame's document. The same test showed that the frame could navigate itself
(`location.href = "http://…/leak?" + data`), and the request arrived carrying the script's first line: neither the
CSP nor the sandbox attribute governs a frame navigating itself. Moving eval code into a worker removed the channel,
since a worker has no document to navigate.

### 32. The visual language

#### 32.1 Tokens

The unified stylesheet keeps Kiln's tokens and fixes their defects. New or changed tokens are marked ★
(`T/sources/04` §6.3 has the full rationale and contrast ratios).

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#1a1a1a` | Ground |
| `--fill` | `#f6f6f6` | `#222222` | Hover rows, inline code, call-outs |
| `--fill-2` | `#e6e6e6` | `#3a3a3a` | Areas, the empty half of a derived mark |
| `--ink` | `#1a1a1a` | `#f2f2f2` | Text, marks, primary controls |
| `--ink-2` | `#6e6e6e` | `#9a9a9a` | Secondary text (`#737373` fails 4.5:1 on `--fill`) |
| ★ `--ink-3` | `#a3a3a3` | `#6e6e6e` | Non-text grey only (decorative marks, hatching); fails text contrast |
| `--hair` | `#d6d6d6` | `#3d3d3d` | Dividers |
| ★ `--hair-strong` | `#8f8f8f` | `#707070` | Input borders (≥ 3:1, also on `--code-bg`) |
| `--rule` | `#ededed` | `#2a2a2a` | Table row rules |
| `--code-bg` | `#fbfbfb` | `#1d1d1d` | Code |
| `--accent` | `#e2001a` | `#ff3b4a` | Failure, selection, live links: the only hue |
| `--sel` | `rgba(226,0,26,.05)` | `rgba(255,59,74,.09)` | Red wash (lighter, so red and grey text on it pass 4.5:1) |
| ★ `--on-accent` | `#ffffff` | `#1a1a1a` | Text on a red fill (white on `#ff3b4a` is 3.51:1) |
| ★ `--tok-com`, `--tok-punc` | `#6e6e6e` | `#8c8c8c` | Code comments and punctuation, darkened to pass 4.5:1 |
| ★ `--sans` | `Arial, "Helvetica Neue", Helvetica, sans-serif` | | Replaces the misnamed `--mono` |
| `--code` | `ui-monospace, Menlo, Consolas, "Courier New", monospace` | | Monospace |
| ★ `--fs-2xs` | `9.5px` | | Tags, stamps, axis text |
| `--fs-xs`, `--fs-s`, `--fs-m`, `--fs-l`, `--fs-xl` | 10.5, 12, 13, 18, 30 px | | As in Kiln |
| ★ `--sp-1 … --sp-8` | 2, 4, 6, 8, 10, 12, 14, 16 px | | Spacing scale |
| ★ `--h-ctl`, `--h-header`, `--h-strip`, `--w-side` | 30, 52, 40, 288 px | | Chrome rhythm |
| ★ `--hatch` | `repeating-linear-gradient(45deg, var(--ink-3) 0 1px, transparent 1px 4px)` | | Missing values |
| ★ `--dash-2`, `--dash-3` | `4 3`, `1 3` | | Series and stale lines |
| ★ `--blink` | `bl 0.8s steps(2) infinite` | | `none` under `prefers-reduced-motion` |

The values above are the shipped ones; `node scripts/contrast.mjs` checks every text pair at 4.5:1 and input borders
at 3:1 in both themes, and `scripts/specimen.mjs` renders every mark for review.

Fixed hazards: the `.gutter` class collision between the dock and the editor (renamed `.dock-gutter` and
`.ed-gutter`), the duplicate `.dtabs` rule, about 120 dead classes inherited from the Octavo simulator, missing
`prefers-reduced-motion` handling, and horizontal clipping at phone width.

#### 32.2 Rules

- One plane: every pane is `--bg`; structure comes from 1 px rules and `.block` sections. No shadows; floating
  layers have a 1 px ink border. Radius 0; circles only for status and provenance marks.
- Arial in two weights (400, 700). Mixed case. Tabular numerals in every numeric column.
- Red means failure, selection or a live action, and nothing else. Success is ink plus ✓. Provenance, staleness and
  series are distinguished by **shape, fill and line style**, never by hue.

#### 32.3 Provenance marks

Marks are 8 px CSS shapes, not Unicode glyphs, so their size does not depend on the system font:

```css
.prov              { display:inline-block; width:8px; height:8px; border:1px solid var(--ink); border-radius:50%; flex:none; }
.prov.observed     { background: var(--ink); }                                                   /* ● measured */
.prov.derived      { background: linear-gradient(90deg, var(--ink) 50%, transparent 50%); }       /* ◐ statistic */
.prov.heuristic    { background: var(--bg); }                                                    /* ◌ model, simulated */
.prov.illustrative { border-radius:0; width:7px; height:7px; transform:rotate(45deg); border-color:var(--ink-2); }
.prov.unknown      { border-radius:0; border-color:var(--ink-3); background:var(--hatch); }      /* ▨ missing */
.prov.bad          { border-color: var(--accent); background: var(--sel); }                       /* invalid */
```

Every mark is paired with a word somewhere visible (a column header, a `.sub` line, a pill label), and with a
`title` giving the method. A value cell renders as `mark number unit`, with the CI as a small ink-2 suffix
(`24.3 µs ±0.4`), and missing values as "—" with the reason in the title.

#### 32.4 Stamps, stale frames and the title block

```css
.stamp        { font: 700 var(--fs-2xs)/1 var(--sans); padding: 2px 5px; border: 1px dashed var(--ink-2); color: var(--ink-2); }
.stamp.bad    { border-color: var(--accent); color: var(--accent); }
.block.stale  { outline: 1px dashed var(--ink-2); outline-offset: -4px; }
```

- Stamps are lowercase words: `model only`, `simulated`, `measured on <device>`, `stale`, `illustrative`,
  `no measurements`, and the four verdicts `supported`, `refuted`, `open`, `unqualified` (refuted and unqualified
  use `.stamp.bad`).
- A **title block** closes the Perf, Evidence and Hypotheses views: a row of hairline cells (project, device, data
  origin, codegen version, build time), adapted from Perf Lab's sheet title block.

#### 32.5 Charts

Hand-written SVG as in Kiln. Series are told apart by fill and dash: model = hollow marker, dashed line; simulator
= half-filled marker, dotted line; hardware = filled marker, solid line with an interval whisker. The selected or
best mark is red. Labels sit beside marks; there are no colour legends.

#### 32.6 Views

| View | Status | Change |
| --- | --- | --- |
| Perf | changed | Big number with mark and source word; kernel table with model, simulated and measured columns (median, CI, n); validity column; roofline with three marks per kernel; title block |
| Knobs | changed | Options table shows measured median, CI and n with marks; `by` tags from §26 with the note |
| Tune | changed | Evidence table moves to the Evidence view; the search chart shows intervals |
| Kernels | changed | Shows the content id per language and the activation row |
| Devices | changed | WebGPU fingerprint, CUDA executors from the server, protocol settings (reps, launches, seed) |
| Evidence | new | Records grouped by kernel × row × device; stale, invalid and partial marked; a detail panel with a sample strip plot, validity reasons and manifest; import, export, forget |
| Hypotheses | new | Every hypothesis of the project as a card: claim, verdict stamp, rows with marks, support, alternatives, scope |
| Jobs | new | Server jobs with state, proposer, protocol, approve and cancel, and the event log |
| Notes | changed | ```` ```hypothesis id ```` blocks render cards; `lab:hypothesis?id=` opens the Hypotheses view |

### 33. Lab programs (Perf Lab inside the workbench)

The last phase brings Perf Lab's language and boards into the unified workbench:

1. **Headless language.** `PL/src/lang/` moves to `packages/lab` with its tests. Its `values.ts` and `stats.ts` are
   replaced by `@kiln/evidence`, so a lab program and a Kiln project share one provenance and statistics layer.
2. **Boards as dock views.** A lab program opens as one dock view per board. The renderers are rewritten in Kiln's
   visual language, starting with the view kinds the presets use most: `table`, `stat`, `chart`, `math`, `text`,
   `row`/`stack`, `hypothesisCard`, `manifestDiff`, `runList`, `note`.
3. **Server routes.** Perf Lab's artifact, run, bundle, job, evidence-archive and dataset routes move into
   `apps/server` as a second route group, sharing the security middleware.
4. **One entity graph.** Kernels observed by Perf Lab (profiler summaries, Nsight) and kernels generated by Kiln are
   linked with `corresponds_to` edges carrying an evidence class, so a route can run from a slow request in a
   service down to the rewrite that produced its kernel.

#### 33.1 As built (Phase 8a–8c, 2026-10-19)

Three of the four parts exist; the entity graph does not. A lab program opens in the dock with the runs imported from
Perf Lab, and its verdicts match those of Perf Lab's own code (`check:pl`, below).

```text
lab-workbench/.data ──lab:import (reads a temporary copy)──▶ KILN_DATA_DIR/kiln.sqlite (lab_* tables) + lab/
                                                                         │
                                       apps/server  /api/lab/{catalog, bundles, evidence, datasets, media, hosts…}
                                                                         │ JSON
apps/workbench  ui/lab/api.js  labClient ──fills──▶ @kiln/lab createMemoryLabData ──▶ labEnv(data)
                ui/lab/state.js  labs.open(id): catalog + evidence → build → bundles the build needs → build
                ui/lab/board.jsx  board:<id> dock views ── panels read  materialize(reg, x, state)
```

**`@kiln/lab` (`packages/lab`).** Perf Lab's language ported to a browser-safe package (it imports only its own
modules and `@kiln/evidence`, which a test enforces). Values, statistics and verdicts come from `@kiln/evidence`;
`evaluateHypothesis(registry, state, id)` returns `{verdict, checks, reasons, support}` and is no longer computed
inside a view. Data access is injected: `labEnv(data: LabData)` takes an object whose methods are all synchronous
(`catalog`, `bundlesLoaded`, `bundleRun`, `archive`, `datasets`, `evidenceBlocked`, `localReport`, `mediaUrl`), so
the client loads before it builds. `@kiln/lab/node` reads Perf Lab's store from a temporary copy. Capture hashes
are still Perf Lab's `cyrb53` (P-5), because the store and routes are keyed by them.

**Server (`apps/server/src/lab/`).** Perf Lab's routes and response shapes under `/api/lab`, behind Kiln's
Host/Origin/token checks; migration 2 adds the `lab_*` tables; `pnpm --filter @kiln/server lab:import [dir]` copies a
Perf Lab data directory in, verifying every hash, idempotently. Lab jobs are history only: creating, approving or
cancelling one answers `501`. Host `local`'s report is read, not probed (`probe.ts`): the server hashes the workload
sources in `KILN_LAB_WORKLOADS` exactly as `PL/workloads/perf_lab_local/probe.py` does. A local capture's identity
depends on that hash alone, so imported local runs match only while the sources are the ones they measured.

**Workbench (`apps/workbench/src/ui/lab/`).** The Lab view lists programs, boards and verdicts; each board is a dock
view `board:<id>` with its parameter bar (PLAN/DATA/VIEW bindings; a plan change whose captures are not all cached
becomes a pending plan, since nothing executes) and a title block saying whether its runs are measured (and where) or
synthetic. All 21 panel kinds the presets use are ported, with five layouts. Opening another program closes the
previous program's boards.

**Checks.**

| Check | Command | Proves |
| --- | --- | --- |
| Port fidelity | `pnpm --filter @kiln/lab check:pl` | 11 presets and both measured programs build to identical hashes, lints, derives and verdicts with Perf Lab's code and with the port |
| Unit tests | `pnpm test` | lab 98, server 89 (fixtures only; nothing reads `PL/.data`) |
| Done-condition | `node apps/workbench/test/lab-e2e.mjs [--shots DIR]` | import into a temporary directory; local-sampler 8/8 and dino-pr1005 18/18 measured captures load; 7 verdicts = `check:pl`; 27 boards of 11 programs without a panel error; 18/18 images; Perf Lab's store byte- and mtime-identical |

**Not built.** The entity graph (part 4); lab job execution and dataset materialization; the board's live refresh
on `catalog.changed` (a program must be reopened after an import). Worker diaries: `reference/09-…` (8a) and
`reference/10-…` (8c); main diary Steps 19–20.

### 34. Decision records

Each record states the decision, the alternatives and the reason. They are numbered so code comments can cite them.

| # | Decision | Alternatives considered | Reason |
| --- | --- | --- | --- |
| D1 | Base the unified app on Kiln's UI and compiler; bring Perf Lab's evidence contract in as a headless package | Base on Perf Lab (React 19, Redux) and port Kiln into it | The target look is Kiln's; Kiln's 13 views and compiler are coupled to its channel store; Perf Lab's evidence contract is already mostly pure functions |
| D2 | TypeScript with erasable syntax only, run by Node 26 directly; esbuild for the browser bundle | Vite; tsc emit; tsx | No transpile step for server and tests; Kiln's esbuild build already produces the single-file page |
| D3 | SHA-256 for every identity, with a synchronous pure-TS implementation | cyrb53 (Perf Lab); WebCrypto (async only) | Collision resistance across shared evidence (P-5); Kiln's compile path is synchronous |
| D4 | Keep Kiln's kernel identity for grouping and add a content id for validity | Replace the identity with the content id | Schedules of one computation must stay comparable; staleness needs the executable's identity |
| D5 | Device ids include a fingerprint hash | Constant ids (`webgpu`, `cuda`) | Evidence from different GPUs must never pool (K-3) |
| D6 | Evidence overrides the model only when intervals separate; deterministic devices have zero-width intervals | Fastest single row (Kiln); a fixed percentage margin | A margin ignores the measured spread; zero-width intervals reproduce Kiln's simulator behaviour |
| D7 | Perf Lab's five provenance classes plus a source word | A new taxonomy (model/simulated/measured only) | Keeps one vocabulary for lab programs and compiler projects; the source word carries Kiln's distinction |
| D8 | The repetition is the statistical unit; a repetition is a fresh context | Pooling launches | Launches in one context are correlated; this is Perf Lab's rule |
| D9 | The server is optional, same-origin, loopback-only, token plus Host allow-list | CORS with an allow-list; no server | Same-origin serving avoids CORS entirely; the token and Host check defeat forgery and rebinding |
| D10 | CUDA runs through the runner as a subprocess (locally or over SSH), not through its HTTP server | Keep `kiln_runner.py serve` | Removes a network-exposed code-execution endpoint; reuses SSH authentication for remote hosts |
| D11 | Agent code runs in an opaque-origin sandbox frame behind a bridge | `new Function` in the page (Kiln, Perf Lab) | The only way to make "read-only" and "needs approval" enforceable rather than advisory |
| D12 | The verdict function lives in `@kiln/evidence`; errors and missing inputs give `open` | Verdicts in the view (Perf Lab) | Headless consumers need verdicts; an error is not evidence against a claim |
| D13 | Provenance, staleness and series use shape, fill and dash; red stays the only hue | Perf Lab's semantic hues | Kiln's rule that colour is a signal; works in monochrome and for colour-blind readers |

---

## Part VI. Implementation plan

### 35. Phases

The phases are ordered so that each one ends with a working workbench. Every phase lists its files, the tests that
prove it, and a done-condition that can be checked. The diary (`T/reference/01-investigation-diary.md`) records
each phase as it happens, with commands, failures and commit hashes.

#### Phase 0: workspace and move (no behaviour change)

Tasks:

1. Create the pnpm workspace (`package.json`, `pnpm-workspace.yaml` listing `packages/*` and `apps/*`,
   `tsconfig.base.json`). `lab-workbench/` stays its own pnpm root and is not part of the workspace.
2. Copy `K/app/src/core` and `K/app/src/std` to `packages/kiln/src/`; copy `K/app/test/*.mjs` to
   `packages/kiln/test/`, rewriting import paths. Kiln's tests that need the UI or presets move with the app.
3. Copy `K/app/src/{ui,agent,main.jsx}`, `K/app/build.mjs`, `K/presets/`, `K/reference.txt`,
   `K/agent-guidelines.txt` to `apps/workbench/`; import the compiler through `@kiln/kiln`.
4. Bundle React 18.3.1, ReactDOM and KaTeX 0.16.9 from npm instead of cdnjs, so the page works offline.
5. Add `scripts/run-node-tests.mjs`, which runs every `test/*.mjs` with Node and fails on a non-zero exit; wire it
   to `pnpm test`.

Done when: `pnpm install && pnpm build` writes `apps/workbench/dist/kiln-workbench.html`; `pnpm test` runs core,
stack1-3, progs, tune, presets and notes green; a screenshot of the built page matches
`T/sources/screens/kiln-default-light-1600.png` in layout.

#### Phase 1: visual language

Tasks: replace the three stylesheets' token blocks with the unified tokens (§32.1); rename `--mono` to `--sans`;
rename `.gutter` to `.dock-gutter`/`.ed-gutter`; remove the duplicate `.dtabs` rule and the dead Octavo classes;
add `.prov`, `.stamp`, `.block.stale`, `.titleblock`, `--hatch`; add `prefers-reduced-motion`; let the header and
toolbars wrap or scroll at phone width.

Done when: light, dark and 390 px screenshots show no clipping and no grey editor gutter; a script reports the
contrast of every text token pair at or above 4.5:1 (3:1 for borders using `--hair-strong`).

#### Phase 2: `@kiln/evidence`

Files: `packages/evidence/src/{values,stats,sha256,canonical,identity,record,verdict,index}.ts` and tests.

Tests: SHA-256 against `node:crypto` on random inputs; canonical JSON key order and rejections; `summarize` and
`pairedRatio` against hand-computed small cases and seed determinism; `separated`; `combine`; deep sealing (set,
delete and `defineProperty` all throw, nested values included); record validation and id recomputation; the verdict
truth table, including a throwing predicate, a negative predicate over a missing value, and invalid support.

Done when: `pnpm --filter @kiln/evidence test` is green and `tsc --noEmit` passes with `erasableSyntaxOnly`.

#### Phase 3: evidence inside Kiln

Files: `packages/kiln/src/std/{program,store,devices,tune}.js`, `packages/kiln/src/core/kiln.js` (policy),
`apps/workbench/src/ui/{wb,Perf,Knobs,Kernels,Devices,Evidence}.jsx`.

Tasks: content ids in `programOf` (§22); device fingerprints (§23); `EvidenceStore` holding records, with
`optionStats` for the policy, legacy import, `kiln-evidence/2` export; record-producing protocols for sim and WebGPU
(§28); the activation check (§27); `decide.evidence` v2 and `pinned-partial` (§26); provenance marks and the three
numbers in Perf and Knobs; the Evidence view.

Tests: store (dedupe by id, stale detection, legacy import), policy (defer, confirm, separated switch, within-noise
keeps the model, deterministic devices behave as before), `presets.mjs` and `notes.mjs` still green, and a WebGPU run
in headless Chrome on this Mac producing records with `kind: 'gpu-timestamp'` or `'wall-clock'`.

Done when: measuring W-05 on `sim:rtx5090` produces a record whose decision reads `by: evidence (confirms the
model)`; the Perf view shows model, simulated and measured columns with marks; the Evidence view lists the record.

#### Phase 4: hypotheses

Files: `packages/kiln/src/std/index.js` (`Project.hypothesis`), `packages/kiln/src/std/evidence-context.js` (`ev`),
`apps/workbench/src/ui/{Hypotheses.jsx,Notes.jsx,doc.js,links.js}`, presets W-05, W-19, W-25.

Done when: W-05's hypothesis is `open` before measuring and `supported` or `refuted` after; a throwing predicate
shows `open` with the error; the Notes block and the Hypotheses view agree.

#### Phase 5: server

Files: `apps/server/src/{index,app,config,db,security,records,devices,jobs,events,executors/*}.ts`, tests;
`runner/kiln_runner.py`; `apps/workbench/src/ui/{wb.js,Jobs.jsx}` (server adapter).

Tests (Vitest, in-memory SQLite, temporary directories): Host, Origin, token and content-type refusals; record
validation and id recomputation; content-id mismatch on job creation; agent-proposed jobs cannot be created
approved; the job lifecycle end to end with the fake runner, including cancel and timeout; SSE events.

Done when: `pnpm dev` serves the workbench from the server; records written in the page appear after a reload from
another browser profile; a fake-runner CUDA job goes proposed → approved → done and its records drive a decision.

#### Phase 6: paired comparisons on real hardware

Tasks: the paired WebGPU protocol (§28); `ev.ratio` with `pairedRatio`; a Compare panel in Perf (two schedules or
two devices side by side, ratio with CI); the CUDA job protocol through a real executor when one is configured.

Done when: on this Mac's GPU, a paired comparison of two RMSNorm schedules reports a ratio with a CI and the
hypothesis of Phase 4 is judged from it. Running on a remote CUDA host needs the owner's permission and is recorded
in the diary when done.

#### Phase 7: agent isolation and accounting

Tasks: the sandbox frame and bridge (§31); the server model gateway with `llm_calls`; the eval cap; guideline
updates.

Done when: an eval that calls `fetch('/api/jobs/…/approve')` fails; `localStorage` is unreachable from eval code;
an agent-proposed job waits for approval; token rows appear per call.

Status: done (diary Step 18). `test/agent-e2e.mjs` checks each clause in Chrome, and also that no request from eval
code reaches any host and that a runaway eval does not freeze the page (§31.5).

#### Phase 8: lab programs

Tasks: as listed in §33, in four sub-phases (headless language, board views, server routes, entity graph).

Done when: `local-sampler.lab.js` and `dino-pr1005.lab.js` open as boards in the dock, with verdicts computed by
`@kiln/evidence`, against data imported from `PL/.data`.

### 36. Testing strategy

| Layer | Tool | What it proves |
| --- | --- | --- |
| `@kiln/evidence` | Vitest | Hashes, statistics, sealing, records and verdicts behave as specified |
| `@kiln/kiln` | Kiln's Node scripts via `run-node-tests.mjs`, plus Vitest for new modules | The compiler, simulator and presets are unchanged except where a phase changes them |
| `@kiln/server` | Vitest with `:memory:` SQLite and temporary directories | API contracts, security refusals, job lifecycle with a fake runner |
| Page | Headless Chrome driven by a small CDP script (`scripts/shoot.mjs`) | Screenshots for the diary and reports; WebGPU protocol on the local GPU |
| Notes | `notes.mjs` | Every `lab:` link still executes |

Rules: tests never touch `PL/.data`, `apps/server/.data` or a real GPU host; a test that needs an external file
skips with a message when the file is absent; every screenshot in a report is produced by the script, not by hand.

### 37. Risks, open questions and follow-ups

**Risks.**

- **WebGPU timing on macOS.** Timestamp queries may be unavailable or quantised; the wall-clock fallback includes
  submit and readback. The protocol labels such records `partial`, and they are never pooled with timestamp records.
- **Headless WebGPU.** Headless Chrome may not expose a hardware adapter. The fallback is a headed Chrome window
  driven over CDP.
- **Simulator cost.** Recording simulator counts for every option of a large fork is slow; the policy reads only
  what was measured, and tuning budgets stay explicit.
- **Moved code drifts from the reference.** The imported Kiln stays in `imports/`; `diff -r` against it shows every
  change made during Phase 0.

**Open questions.**

- Should content ids include the browser's WGSL compiler version (from the user agent)? The fingerprint has it; the
  content id does not.
- What minimum number of repetitions should the policy require on real devices? The design starts at 3 and exposes
  it as a parameter.
- Should simulator counts be calibrated against Nsight counters per device (the memo's "calibrate the model
  continuously")? That needs Phase 6 hardware data first.

**Follow-ups outside this plan.** Pair-valued reducers (online softmax, Welford), data-dependent gathers, fp16/bf16
and tensor-core tiles (K-10); warp-shuffle reductions and double-buffered tiles in codegen (K-11); a model-calibration
board (W-25 at scale); a kernel timeline view; Nsight Compute import with `counters-not-latency` labelling.

### 38. How to run things

```bash
# The source systems, as received
cd lab-workbench && pnpm install && pnpm test                     # Perf Lab: 11 files, 104 tests
cd lab-workbench && pnpm lab-server & pnpm dev                    # Perf Lab UI on 127.0.0.1:5199
node imports/kiln-workbench-src/kiln-workbench/app/test/core.mjs  # needs acorn installed in K/app

# The unified workbench (after Phase 0)
pnpm install
pnpm build                    # apps/workbench/dist/kiln-workbench.html
pnpm test                     # all packages
pnpm --filter @kiln/server start      # http://127.0.0.1:5280 (after Phase 5)
```

---

## Appendix A. API cheat sheet: the unified project DSL

| Call | Phase | Meaning |
| --- | --- | --- |
| `project(name).program(fn, inputs)` | Kiln | The computation |
| `.pipeline(p)`, `.params(...)`, `.data({})`, `.check(name, fn)`, `.pins({})`, `.device(id)`, `.about(t)`, `.note(t)` | Kiln | As in Kiln |
| `.measure({reps, warmup, launches, seed})` | 3 | The protocol for real devices (defaults 7, 3, 20, 1) |
| `.hypothesis(id, h => h.claim(t).predicts(evFn, rowFn).alternatives(...).scope(t))` | 4 | A claim judged against evidence |
| `ev.kernels()`, `ev.options(k)`, `ev.ratio(k, {a, b})`, `ev.total()`, `ev.records(f)` | 4 | Evidence context rows (§29.2) |

## Appendix B. API cheat sheet: `@kiln/evidence`

| Export | Signature |
| --- | --- |
| `observed`, `derived`, `heuristic`, `illustrative` | `(value, {unit?, method?, source?, scope?, denominator?, metric?, ci?, n?}) → Value`; a null or non-finite number gives `missing(...)` |
| `missing` | `(reason, {unit?, method?, source?, scope?, metric?}) → Value` with `value: null`, `prov: 'unknown'` |
| `isValue`, `raw`, `num`, `isMissing`, `provOf`, `combine` | helpers; `provOf` of a plain number is `unknown`; `combine()` of nothing is `unknown` |
| `seal(obj)`, `isSealed(x)` | a deep read-only snapshot (a copy); throws `ProvenanceError` on set, delete, define, `setPrototypeOf`, `preventExtensions`; refuses Map, Set, Date, RegExp and binary data |
| `median`, `quantile`, `rng(seed)` | type-7 quantiles; `rng` is mulberry32, a string seed is hashed |
| `summarize(samples, {level, draws, seed})` | `{median, ci, n, level, method, note}`; default seed 1 |
| `pairedRatio(pairs, {level, draws, seed})` | pairs are `{rep, a, b}`; `summarize` of `b/a` plus `excluded: [{rep, reason}]` |
| `separated(x, y)` | `true` when the intervals do not overlap |
| `sha256Hex(stringOrBytes)`, `isSha256Hex(x)` | synchronous SHA-256 |
| `canonicalJSON(x)`, `CanonicalJSONError` | sorted keys; refuses `undefined`, holes, functions, symbols, bigints, non-finite numbers, cycles and non-plain objects; `-0` is written `0` |
| `contentId({codegen, lang, sourceSha256, launch, inputs, output, target})` | §22 |
| `deviceId(cls, name, fingerprint)`, `slug`, `isFingerprint` | §23; a simulator's id is `sim:<slug>` |
| `RECORD_FORMAT`, `recordId(record)`, `validateRecord(record)` | §21; `validateRecord` returns `{ok, record, errors}` |
| `isDecisive(record, currentContentId)` | valid, no partial caveats, not legacy, and the content id matches (§26–27) |
| `verdict({rows, predicate, support})` | `{verdict, checks: [{row, pass, missing, error?}], reasons}` (§29.3) |

## Appendix C. File index

| Concern | Imported source | Unified location (after Phase 0) |
| --- | --- | --- |
| Core framework | `K/app/src/core/kiln.js` | `packages/kiln/src/core/kiln.js` |
| ML stack | `K/app/src/std/{tensor,loop,tile,kernel,emit,program}.js` | `packages/kiln/src/std/` |
| Devices and evidence | `K/app/src/std/{devices,store,tune,targets}.js` | `packages/kiln/src/std/` |
| UI state | `K/app/src/ui/wb.js` | `apps/workbench/src/ui/wb.js` |
| Views | `K/app/src/ui/*.jsx` | `apps/workbench/src/ui/` |
| Styles | `K/app/src/ui/{forge-base,lab,kiln}.css` | `apps/workbench/src/ui/{tokens,base,chrome,views,evidence,utilities}.css` |
| Agent | `K/app/src/agent/agent.js` | `apps/workbench/src/agent/` |
| Presets | `K/presets/W-*.{js,md}` | `apps/workbench/presets/` |
| Runner | `K/runner/kiln_runner.py` | `runner/kiln_runner.py` |
| Values and sealing | `PL/src/lang/values.ts` | `packages/evidence/src/values.ts` (rewritten) |
| Paired ratio | `PL/src/lang/stats.ts` | `packages/evidence/src/stats.ts` (rewritten) |
| Verdicts | `PL/src/components/organisms/views/HypothesisView/HypothesisView.tsx:19-48` | `packages/evidence/src/verdict.ts` (rewritten) |
| Server patterns | `PL/server/{app,db,runner,events}.ts` | `apps/server/src/` (rewritten) |
| Lab language | `PL/src/lang/` | `packages/lab/` (Phase 8) |
