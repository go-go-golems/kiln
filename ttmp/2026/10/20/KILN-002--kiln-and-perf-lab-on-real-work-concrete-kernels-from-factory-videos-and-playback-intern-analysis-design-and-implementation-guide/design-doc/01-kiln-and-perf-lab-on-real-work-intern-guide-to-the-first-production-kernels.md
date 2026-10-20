---
Title: 'Kiln and Perf Lab on real work: intern guide to the first production kernels'
Ticket: KILN-002
Status: active
Topics:
    - kiln
    - perf-lab
    - gpu
    - compiler
    - evidence
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://packages/kiln/src/core/ix.js
      Note: Index maps with floor division (nearest resize, reflect border)
    - Path: repo://packages/kiln/src/std/devices.js
      Note: WebGPU executor dispatch and bundle() export
    - Path: repo://packages/kiln/src/std/emit.js
      Note: CUDA and WGSL emitters (u8 loads, identity suffix)
    - Path: repo://packages/kiln/src/std/fns.js
      Note: Function table that gains floor
    - Path: repo://ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/sources/01-factory-videos-research.md
      Note: Factory-videos research notes (path:line evidence)
    - Path: repo://ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/sources/02-kiln-and-perf-lab-research.md
      Note: Kiln and Perf Lab research notes
    - Path: repo://ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/sources/03-playback-research.md
      Note: Playback redaction and stream-engine research notes
ExternalSources: []
Summary: 'How Kiln (a kernel compiler workbench) and Perf Lab (a measurement workbench) produce their first kernels that real programs use: the window-similarity matrix in the factory web UI, zone-motion energy in the factory runtime, and redaction mask post-processing in Playback, with the measurement, quality gates and evidence that make each one count.'
LastUpdated: 2026-10-20T11:06:14.034557-04:00
WhatFor: Onboarding an intern onto KILN-002 and serving as the implementation plan for its phases.
WhenToUse: Before writing a Kiln program for a consumer outside Kiln, adding a Perf Lab workload, or registering a generated kernel in the factory runtime or Playback.
---

# Kiln and Perf Lab on real work: intern guide to the first production kernels

> **Summary.** Kiln compiles array programs into GPU kernels; Perf Lab turns paired measurements into verdicts. Neither
> has yet produced a kernel that a real program runs. This guide carries three real workloads through the whole path:
>
> - **A. Window similarity matrix** (factory web UI): an n × n cosine matrix computed in Float64 JavaScript and capped
>   at 400 windows; a Kiln WGSL kernel for the full rebuild lifts the cap to a whole recording (691–1,385 windows).
> - **B. Grey conversion for zone motion** (factory runtime): OpenCV's exact integer grey plus Pillow's two-pass
>   antialiased bicubic, reproduced by a Kiln program after adding `floor` and 8-bit inputs to the compiler — but only
>   if a first measurement shows the stage is worth it.
> - **C. Redaction mask post-processing** (Playback): a per-detection CPU loop that is about a third of inference time
>   on the RTX PRO 6000 at five people per frame, replaced by one Kiln program on the GPU and judged by the redaction
>   service's own noise-floor gate.
>
> Every example follows the same eight-step loop (§4): measure, decide, write, check against the consumer, integrate
> behind a switch, compare paired, pass the consumer's gate, record with identity. Part VIII is the phased plan.

## 0. How to read this guide

This guide explains how two research tools, **Kiln** and **Perf Lab**, are brought to bear on three pieces of real
code that run every day: a similarity matrix drawn in the factory-videos web UI, a motion signal computed for every
frame of a factory recording, and the mask clean-up step in Playback's redaction service. By the end you should be
able to explain what each tool does, why a kernel only "counts" when four separate conditions hold, how each of the
three workloads is turned into a Kiln program, and which files you will edit in which order.

Part I builds the vocabulary: what Kiln is, what Perf Lab is, what the KILN-001 ticket joined together, and the loop
that every example in this guide follows. Part II chooses the work and explains, operation by operation, what Kiln
can and cannot express. Parts III to VI are the worked examples. Part VII connects the measurements to the evidence
graph, and Part VIII is the phased implementation plan with API and file references.

### 0.1 Path roots

Paths are long, so they are written relative to a root.

| Root   | Absolute path                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------- |
| `KILN` | `/Volumes/SSD/code/kiln` (also reachable as `~/code/tulip/experiments/kiln`, a symlink)                                 |
| `KS`   | `KILN/packages/kiln/src` — the Kiln compiler (`core/`, `std/`)                                                          |
| `WB`   | `KILN/apps/workbench` — the Kiln workbench UI, presets and browser test scripts                                         |
| `SRV`  | `KILN/apps/server/src` — the Kiln server (jobs, CUDA executor, `/api/lab`)                                              |
| `LAB`  | `KILN/lab-workbench` — Perf Lab, imported verbatim; never edited in this repository                                     |
| `FV`   | `~/code/tulip/experiments/2026-09-14--factory-videos` — the factory video-analysis repository                          |
| `PB`   | the Playback repository (`~/code/tulip/playback`, or a worktree of it)                                                  |
| `T1`   | `KILN/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-…/` — the previous ticket                   |
| `T2`   | `KILN/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-…/` — this ticket                                         |
| `G1`   | `T1/design-doc/01-kiln-x-perf-lab-intern-guide-to-the-unified-gpu-kernel-workbench.md` — the KILN-001 guide            |

The research notes behind every claim here are in `T2/sources/`: `01-factory-videos-research.md`,
`02-kiln-and-perf-lab-research.md` and `03-playback-research.md`. Each note carries `path:line` references and labels
every number.

### 0.2 Evidence labels

Numbers in this guide carry one of three labels, and the distinction matters more than the numbers themselves.

- **MEASURED** means someone ran the code on named hardware and recorded the result; the source line is cited.
- **DERIVED** means the number follows by arithmetic from measured or source-code values; the arithmetic is shown.
- **UNKNOWN** means nobody has measured it. Several of the most important numbers in this guide are UNKNOWN, and the
  first task of each example is to measure them.

---

# Part I — The tools and the loop

## 1. The problem this ticket solves

Kiln and Perf Lab were built to answer two halves of one question: *what kernel should run here, and how do we know
it is faster?* Kiln answers the first half. It compiles small array programs through a chain of intermediate
representations into GPU kernels, searches schedules with a cost model, and checks every kernel against a reference.
Perf Lab answers the second half. It describes experiments as programs, runs paired measurements of a baseline and a
candidate, and turns the measurements into verdicts with confidence intervals.

KILN-001 joined the two into one workbench. After it, the workbench can import Perf Lab's measurements, rebuild Perf
Lab's lab programs on the same data, and reproduce Perf Lab's verdicts (`G1` §33.1). What it has not done is the
thing both tools exist for. As of 2026-10-20:

- **No Kiln kernel has run inside a program that someone uses.** Every Kiln kernel to date lives inside a preset in
  the workbench (`WB/presets/W-01..W-25`).
- **No Kiln kernel has been timed on an NVIDIA GPU.** The CUDA runner exists (`KILN/runner/kiln_runner.py`) but has
  only been exercised with a fake runner; the one real measured comparison ran on WebGPU over Apple Metal
  (`T2/sources/02` Q4).
- **Perf Lab has never measured a kernel that Kiln generated.** Its one GPU case study, Grounding DINO in Playback
  PR 1005, measures kernels written by PyTorch Inductor and by hand.

The consequence is that the evidence graph the two tools share has no edge that is more than a guess. When Perf Lab
observes a kernel called `fused_sampling` on the DGX and Kiln has a preset that computes a similar function, the
best the workbench can say is that the two *probably* correspond. This ticket replaces guesses with facts by choosing
real workloads where Kiln generates the kernel, the real program runs it, and Perf Lab measures it.

Stated without the solution, the problem is: **find code that runs in production, can be written as a Kiln program
today or with a small compiler extension, has a measurable cost, and has an existing quality gate; then carry one
kernel through the whole path from program to production.** The rest of this guide is that path, three times.

## 2. The systems you need to know

Four kinds of system appear in this guide. Two are tools, and two are consumers of what the tools produce.

```text
                        ┌──────────────────────────────── KILN repository ───────────────────────────────┐
                        │                                                                                 │
   Kiln program ──────► │  Kiln compiler (KS)          kernel record          executors                   │
   (JS, a preset or     │  torch → tensor → loop  ───► {cuda, wgsl,     ───►  WebGPU (browser, WB)         │
    a .js file)         │  → tile → kernel → gpu       identity, grid}        CUDA runner (SRV + runner/)  │
                        │                                   │                                             │
                        │                                   ▼ export (bundle JSON / WGSL text)            │
                        │  @kiln/evidence  @kiln/lab  /api/lab  ◄── import ── Perf Lab store (LAB/.data)   │
                        └───────────────────────────────────┼─────────────────────────────────────────────┘
                                                            │
                     ┌──────────────────────────────────────┼──────────────────────────────────┐
                     ▼                                      ▼                                  ▼
          factory web UI (FV/web)               factory runtime v2 (FV/src/factory)    Playback redaction (PB)
          similarity matrix, WebGPU             zone motion, Python, CPU or GPU        mask post-processing, CUDA
```

### 2.1 Kiln: from a program to a kernel

A Kiln program is a short JavaScript function that describes what to compute, not how. The compiler lowers it
through seven intermediate representations, each with a strict checkpoint, and at the end produces one or more
kernels (`KS/std/emmy.js:18-35`):

```text
torch IR ──decomposition──► tensor IR ──optimization, lift, fuse, stamp──► loop IR ──tile──► tile IR
        ──kernel──► kernel IR ──emit──► gpu IR  (CUDA source, WGSL source, simulator)
```

The box blur preset shows the authoring API in full (`WB/presets/W-12-blur.js:8-22`):

```js
const H = param.int("height", { min: 32, max: 4096, default: 1024, scale: "log" });
const W = param.int("width", { min: 32, max: 4096, default: 1024, scale: "log" });
const r = param.int("radius", { min: 1, max: 3, default: 1 });
project("blur")
  .params(H, W, r)
  .program(({ img }, { param }) => {
    const h = param(H), w = param(W), k2 = 2 * param(r) + 1;
    let acc = null;
    for (let dy = 0; dy < k2; dy++) for (let dx = 0; dx < k2; dx++) {
      const s = N.slice(N.slice(img, 0, dy, dy + h), 1, dx, dx + w);
      acc = acc ? N.add(acc, s) : s;
    }
    return { out: N.mul(acc, 1 / (k2 * k2)) };
  }, ({ param }) => ({ img: k.tensor([param(H) + 2 * param(r), param(W) + 2 * param(r)]) }));
```

Read it from the bottom up. The second callback declares the inputs: one fp32 tensor called `img`, already padded by
the radius on every side. The first callback declares the outputs: `out` is the sum of `(2r+1)²` shifted views of
`img`, scaled by the tap count. A *view* (`N.slice`, `T.view`) is an index map, not a copy; the compiler fuses all
the additions into a single kernel in which each thread reads the shifted neighbours directly.

Four facts about the compiler shape everything in this guide.

- **Shapes are compile-time constants.** Every size is a literal in the emitted code. A workload whose size changes at
  run time needs either one kernel per size or padding to a fixed bucket (`T2/sources/02` Q1).
- **Everything is fp32.** `Tensor` is a `Float32Array` (`KS/core/util.js:50-51`). There are no integer, fp16 or bf16
  tensors and no tensor cores (`G1` K-10).
- **Indexing depends only on output coordinates.** An index map may use constants, the output coordinates, addition,
  multiplication by constants, floor division and modulo by positive constants, `min`, `max` and comparisons
  (`KS/core/ix.js:1-11,78-96`). It may not read a value from memory to decide where to read next. That rules out
  gathers, histograms, scatter, sorting and data-dependent bilinear sampling.
- **One output buffer per kernel.** A program may have several outputs, but each becomes its own kernel
  (`KS/std/kernel.js:254`).

The compiled kernel is a record. `programOf` returns `{id, name, K, cuda, wgsl, expr, shape, inShapes, args, map,
row, identity, bytes}` (`KS/std/program.js:29-43`). Two fields matter most outside the workbench:

- `cuda` and `wgsl` are complete source strings. The CUDA entry point is
  `extern "C" __global__ void <name>(const float* src0, …, float* dst)` with a one-dimensional launch
  (`KS/std/emit.js:21-24`). The WGSL entry is `@compute @workgroup_size(block) fn main`, with input `i` bound at
  `@group(0) @binding(i)` and the output at binding `nIn` (`KS/std/emit.js:49-86`).
- `identity` is a hash of *what* the kernel computes: the loop expression and the shapes, not the schedule
  (`KS/std/program.js:29-43`). Two schedules of the same computation share an identity. This is the key that will let
  a measured kernel be linked to the program that produced it (§23).

Every kernel is checked before it is believed. The loop IR has a point evaluator that computes any single output
element in JavaScript (`KS/std/loop.js:232-258`); measurements compare 384 sampled outputs against it with
`rtol 2e-3, atol 2e-4` (`KILN/packages/evidence/src/protocol.ts:37-60`), and the workbench additionally runs the whole
program against the frontend operators' own evaluators when it is small enough (`WB/src/compile.js:42-59`).

### 2.2 Perf Lab: from an experiment to a verdict

Perf Lab describes measurements as **lab programs**, small JavaScript files that build experiments with a fluent API.
The local sampler program is the canonical example (`LAB/src/presets/programs/local-sampler.lab.js:7-29`):

```js
L.experiment('sampler-local', e => e
  .host('local')
  .workload(sampler({ queries: ctx => ctx.param('queries'), heads: 8, channels: 32, points: 16, spatial: 64,
                      device: 'cpu', dtype: 'float32' }))
  .boundary('sampler_output')
  .baseline(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'unfused' }))
  .candidate(ctx => rev(ctx.capabilities.tools.workloads), a => a.switches({ impl: 'compiled' }))
  .state({ process: 'fresh', compilerCache: 'reused' })
  .warmup(w => w.requests(4))
  .gate(quality.ref('workloads/perf_lab_local/sampler.py#unfused', { mode: 'exact' }))
  .repeat({ processes: 4, order: paired({ seed: 20261012 }) })
  .compare(stats.pairedRatio({ unit: 'process', ci: 0.95 }))
  .capture(capture.timing()) /* … trace, memory, cpu … */)
```

An experiment has two **arms**, a baseline and a candidate, that differ in exactly one switch. The program lowers each
arm into a **spec**, a JSON object that names the host, the workload and its parameters, the source revision, the
switches, the warm-up and the repetition plan (`LAB/src/lang/build.ts:517-590`). The spec's hash
(`cyrb53(stableStringify(spec))`, `build.ts:558`) is the **capture** identity: if a capture with that hash exists, the
lab reuses it; if not, it must be executed or imported.

Execution means running a **workload**, a Python module under `LAB/workloads/`, once per repetition in a fresh process
(`LAB/server/runner.ts:57-61`). The workload writes `manifest.json`, `timing.json`, `quality.json` and friends into a
directory; the importer turns that directory into runs and entities in the SQLite store
(`LAB/server/importer.ts:63-275`). Statistics then compare the arms: `pairedRatio` takes each process's median per
arm, forms candidate/baseline ratios, and bootstraps a confidence interval (`LAB/src/lang/stats.ts:23-80`). A
**hypothesis** attached to the program turns that interval into a verdict: `supported`, `refuted`, `open` or
`unqualified` (`KILN/packages/evidence/src/verdict.ts:49-91`).

Two Perf Lab facts constrain this ticket.

- **The local workload's identity is a hash of its source directory.** `workloads_revision` is sha256 over every
  `perf_lab_local/*.py` file's name and bytes, first 12 hex digits (`LAB/workloads/perf_lab_local/probe.py:23-29`,
  mirrored by `SRV/lab/probe.ts:25-34`). Editing any file in that directory changes every local capture hash. New
  workloads therefore go in a *new package* beside it, following the `perf_lab_dino` precedent (`T2/sources/02` Q10).
- **Only host `local` can execute.** Every other host gets a synthetic executor that sleeps 150 ms
  (`LAB/server/runner.ts:91-98`). DGX numbers so far came from hand-made evidence archives. The SSH container
  executor designed in Playback's ML-PERF-003 ticket is not built (`T2/sources/02` Q9).

### 2.3 What KILN-001 built

KILN-001 created the Kiln repository, copied Perf Lab into it verbatim, and built a unified workbench in nine phases
(`G1` Part VI). The pieces this ticket relies on:

| Piece                         | What it does                                                                                                           | Where                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `@kiln/evidence`              | Values with provenance, paired statistics, three-valued verdicts; shared by both tools                                 | `KILN/packages/evidence/src/`          |
| `@kiln/lab`                   | Perf Lab's lab language, headless: `labEnv`, `build`, `evaluateHypothesis`                                             | `KILN/packages/lab/src/`               |
| `/api/lab` + importer         | Imports a copy of Perf Lab's store; serves catalog, bundles, evidence, datasets, media                                  | `SRV/lab/`                             |
| Lab boards as dock views      | Every Perf Lab board renders inside the Kiln workbench on imported data                                                | `WB/src/ui/lab/`                       |
| WebGPU paired measurement     | Times two Kiln kernels in one browser with paired order and verdicts                                                   | `WB/test/paired-webgpu.mjs`            |
| CUDA executor (never run)     | Ships a bundle over SSH to `kiln_runner.py`, which builds with `nvcc` and times with CUDA events                         | `SRV/executors/cuda-runner.ts`, `KILN/runner/kiln_runner.py` |

The one item of KILN-001's plan that remains open is **Phase 8d**, the entity graph: edges named `corresponds_to`
between kernels Perf Lab observed and kernels Kiln generated (`T1/tasks.md:23`; memo item 5,
`KILN/imports/Untitled.md:154`). The edge exists only in prose. This ticket gives it something true to say.

### 2.4 The consumers

Three programs consume the kernels in this guide. They are described properly in their own parts; this table is the
map.

| Consumer                      | Language / runtime                     | Where the work happens                                    | Kiln target              |
| ----------------------------- | -------------------------------------- | --------------------------------------------------------- | ------------------------ |
| Factory web UI                | TypeScript in the browser              | `FV/web/live/views/similarity/model.ts`                    | WGSL on WebGPU           |
| Factory runtime v2            | Python, operation/implementation graph | `FV/src/factory/kernels/motion.py`                         | WGSL (Mac) or CUDA (Spark) |
| Playback redaction service    | Python + PyTorch + TensorRT, container | `PB/services/redaction/src/trt_engine.py`, `seg_engine.py` | CUDA                     |
| Playback stream-engine        | C++ GStreamer element, DeepStream      | `PB/services/stream-engine/src/pipeline/gstyoloxinfer.cpp` | CUDA                     |

## 3. Vocabulary

| Term                 | Meaning in this guide                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Program (Kiln)       | A `project(...).program(outputsFn, inputsFn)` script; compiles to one or more kernels                                    |
| Preset               | A Kiln program shipped with the workbench, `WB/presets/W-NN-*.js`, with a `.md` explanation                              |
| Kernel record        | What `programOf` returns: sources, launch geometry, shapes, `identity`                                                   |
| Identity             | Hash of a kernel's computation and shapes; independent of its schedule                                                   |
| Bucket               | A fixed compile-time size that a variable-size input is padded up to                                                    |
| Lab program          | A Perf Lab `.lab.js` file building experiments, boards and hypotheses                                                   |
| Arm                  | One side of an experiment: baseline or candidate; differs from the other by declared switches                           |
| Spec / capture       | The JSON an arm lowers to, and the stored result of executing it; the spec hash is the capture key                      |
| Workload             | A Python package under `LAB/workloads/` that executes a spec and writes result files                                   |
| Operation            | In the factory runtime, a named computation with typed ports (`motion.gray`, `motion.change`, …)                        |
| Implementation       | In the factory runtime, one registered way to compute an operation (`cpu.motion_change`, and soon `kiln.motion_change`) |
| Consumer reference   | The consumer's existing implementation, which a Kiln kernel must agree with                                             |
| Quality gate         | The consumer's existing acceptance check (a parity budget, a test suite, a redaction judge)                             |
| `corresponds_to`     | The planned evidence edge from an observed kernel to the generated kernel it is an instance of                          |

## 4. The loop every example follows

Each example in this guide passes through the same eight steps. The order is deliberate: measurement comes before the
kernel, and the consumer's own reference and gate decide correctness, not Kiln's.

```text
 1 measure ──► 2 decide ──► 3 write program ──► 4 check vs consumer reference
                                                        │
 8 record ◄── 7 gate ◄── 6 compare (paired) ◄── 5 integrate behind a switch
```

1. **Measure the baseline in place.** Find out what the target stage costs inside the real program on the real
   hardware, separately from everything around it. A kernel that removes 4 ms from a stage that takes 5 ms of a
   55-second job is not worth writing.
2. **Decide with a written hypothesis.** State the claim the kernel must satisfy, for example "the candidate's median
   per-request time is below 0.5 × the baseline's", before writing the kernel. A Perf Lab or `@kiln/evidence`
   hypothesis makes the claim checkable.
3. **Write the Kiln program** at the consumer's shapes, and compile it for the consumer's target.
4. **Check it against the consumer's reference**, not only against Kiln's point evaluator. Kiln's checks prove the
   kernel computes what the program says; only the consumer's reference proves the program says the right thing.
5. **Integrate behind a switch.** The consumer gains a second implementation selected by a parameter or flag, and
   the old one stays the default until step 7 passes.
6. **Compare with paired measurements.** Run baseline and candidate interleaved in a seeded order on the same host,
   and compute a ratio with a confidence interval.
7. **Pass the consumer's quality gate.** Each consumer already has one: a parity budget for the factory grey image,
   the redaction judge with its noise floor, the ground-truth score.
8. **Record the evidence with identity.** The capture names the Kiln kernel's identity and codegen version, so the
   evidence graph can link the observed kernel to the program that generated it with a `direct` edge.

As pseudocode, the loop is:

```text
function bring_to_real_work(stage):
    base = measure(stage.baseline, host=stage.host)              # step 1, Perf Lab or a browser harness
    if base.share_of_job < stage.worth_it_threshold: return refuted(base)
    hyp  = hypothesis("candidate/baseline < r", on=stage)         # step 2
    prog = kiln_program(stage.math, shapes=stage.shapes)          # step 3
    k    = compile(prog, target=stage.target)
    assert agrees(k, stage.consumer_reference, stage.tolerance)  # step 4
    stage.consumer.register(impl=k, selected_by=stage.switch)     # step 5
    runs = paired(stage.baseline, k, order=seeded, host=stage.host) # step 6
    assert stage.quality_gate(runs.candidate_outputs)             # step 7
    record(runs, identity=k.identity, codegen=CODEGEN_VERSION)    # step 8
    return verdict(hyp, runs)
```

Three properties of the loop are worth stating explicitly.

- **A refuted hypothesis at step 1 or step 6 is a result, not a failure.** KILN-001's local-sampler experiment ended
  with `compile-removes-intermediate` refuted, and that verdict is as useful as a supported one: it tells the next
  person not to try that lever on that host.
- **Steps 4 and 7 use different references for different reasons.** Step 4 compares outputs element by element to
  catch a wrong program. Step 7 asks whether the consumer still meets its own product requirement, which can tolerate
  differences that step 4 would flag (the redaction mask head, for instance, is not run-to-run deterministic).
- **Steps 5 and 8 are what make the work reusable.** A kernel that is not registered behind a switch cannot be
  compared fairly, and a measurement that does not carry the kernel's identity cannot be linked back to its source.

---

# Part II — Choosing the work

## 5. Selection criteria and candidates

A workload qualifies for this ticket when five things are true. Each criterion exists because a past experiment
failed without it.

1. **It runs in code someone uses.** A kernel in a preset proves the compiler works; it does not prove the compiler is
   useful.
2. **Kiln can express it today, or after a small and general compiler extension.** "Small" means a change of the size
   of adding one function to `KS/std/fns.js`, not a new indexing model.
3. **Its cost can be measured in place**, on the hardware it runs on, separately from its neighbours.
4. **The consumer already has a quality gate**, so correctness is judged by the consumer's standard and not by a
   tolerance invented for the occasion.
5. **There is a seam to plug a second implementation into**, so baseline and candidate can be compared on the same
   build.

Two read-only surveys (`T2/sources/01`, `T2/sources/03`) examined every array computation in the factory-videos
repository and in Playback's vision services. The table scores each candidate against the five criteria.

| Candidate                                     | Uses | Kiln | Measurable | Gate | Seam | Decision                          |
| --------------------------------------------- | :--: | :--: | :--------: | :--: | :--: | --------------------------------- |
| A. Window similarity matrix (factory web UI)  | yes  | yes  | yes, in the browser | Float64 reference | async hook | **Example A (Part III)** |
| B. Grey conversion and resample for zone motion (factory runtime) | yes | after `floor` | yes, per-node service time | v1→v2 parity method | registry, with a parameter | **Example B (Part IV)** |
| C. Redaction mask post-processing (Playback)  | yes  | yes  | yes, stage timers exist | judge + ground truth | engine collect | **Example C (Part V)** |
| D. YOLOX decode (stream-engine)               | yes  | yes  | not yet instrumented | none for decode | C++ element | Designed, not scheduled (Part VI) |
| Exact t-SNE step (factory web UI)             | yes  | yes  | yes (2,442 ms cold at 800 points) | — | worker | Rejected: its promise of identical layouts in every browser conflicts with fp32 |
| DIS optical flow (factory runtime)            | yes  | no   | yes (3.2–8.3 ms per pair) | — | registry | Rejected: gathers and search |
| Model calls (SAM 3, Cosmos, YOLO26n)          | yes  | no   | yes | — | model service | Rejected: networks, not kernels |
| Grounding DINO sampler (PR 1005)              | yes  | no   | yes (DGX archive) | PR's detection match | — | Rejected for now: data-dependent bilinear sampling (K-10) |
| Visual similarity, barcode, ffmpeg resizes    | yes  | no   | — | — | — | Rejected: binary64, integer decode, or not GPU work |

The ranking among A, B and C follows from criterion 3 and from where Kiln has already run. WGSL kernels have run
on real hardware (WebGPU on Apple Metal); CUDA kernels have not. Example A needs only WGSL in a browser on this Mac.
Example B can run as WGSL on the Mac and as CUDA on the DGX Spark. Example C runs only as CUDA on an NVIDIA host, and
its acceptance needs `validate_on_host.sh` on a GPU machine, which needs explicit permission to reach.

## 6. What Kiln can express, operation by operation

Every operation in the three examples maps onto one of five Kiln constructs. The table is the reference you will use
when writing the programs in Parts III to V.

| Consumer operation                                        | Kiln construct                                                   | Example |
| --------------------------------------------------------- | ---------------------------------------------------------------- | ------- |
| Dot products of every pair of rows                        | Contraction: `N.matmul(x, N.transpose(x, 0, 1))`, tiled schedule  | A       |
| Fixed-point colour conversion, threshold, clip            | Elementwise ops (`N.mul`, `N.add`, `N.gt`, `N.min`, `N.max`) plus **`floor`** | B, C |
| Nearest-neighbour resize, crop, letterbox removal         | `T.view` with floor division by constants                        | C       |
| Reflect-101 border                                        | `T.view` with `min`, `max` and multiplication by −1             | C       |
| Separable convolution (Gaussian, Pillow bicubic)          | Sum of shifted views times scalar or per-column weights          | B, C    |
| Coordinate-dependent weights or window starts             | A weight table passed in as an input tensor                      | B       |
| Union of masks, maximum class score                       | Reduction with `max` over one axis                              | C, D    |

### 6.1 The compiler extensions this ticket needs

Three of the operations need something Kiln does not have yet. Each extension is general, and each is justified by
the example that needs it.

- **A `floor` function.** OpenCV's grey conversion is exact integer arithmetic:
  `gray = (9798·R + 19235·G + 3735·B + 16384) >> 15`, verified against all 2²⁴ colours (`T2/sources/01` §1.2). The
  largest intermediate is 32768·255 + 16384 < 2²⁴, so every value is exact in fp32, and `>> 15` is
  `floor(x / 32768)`, a division by a power of two, which is also exact. Pillow's resample rounds to 8 bits between
  its two passes, which is `floor(x + 0.5)` followed by a clip. Kiln's function table has no `floor`
  (`KS/std/fns.js:4-37`). Adding it is one entry: JavaScript `Math.floor`, CUDA `floorf`, WGSL `floor`.
- **8-bit inputs.** A 1080p RGB frame is 6.2 MB as bytes and 24.9 MB as fp32. Example B uploads one frame per sample;
  quadrupling the upload to satisfy a type system that cannot express bytes would cost more than the kernel saves.
  An input declared `k.tensor(shape, { dtype: "u8" })` keeps the reference evaluator unchanged (values are still read
  as numbers) and changes only the emitted load: CUDA reads `const unsigned char*`, WGSL reads an `array<u32>` and
  extracts byte `i & 3` of word `i >> 2`. This lifts the part of limitation K-10 that blocks real image inputs without
  touching the fp32 arithmetic.
- **Program export and launchers.** Today's export, `bundle()` (`KS/std/devices.js:336-344`), writes one entry per
  *kernel* for the CUDA runner, with seeded random inputs. A consumer needs the *program*: the kernels in order, which
  buffer feeds which input, and the dispatch geometry. The new export format, `kiln-program/1`, adds exactly that.
  Two small launchers read it: a TypeScript one for WebGPU (Example A) and a Python one with two backends — `wgpu`
  (WGSL on Metal or Vulkan) and CUDA through `ctypes` over NVRTC and the driver API (Examples B and C).

The first two extensions are compiler changes with unit tests. The third is new code outside the compiler, and it is
the piece that makes "a kernel someone uses" possible at all.

### 6.2 What stays outside Kiln, and why

Some steps in each example stay where they are, and the reason is the same each time: moving them would make the
change larger without making the targeted stage faster.

- **Example A** keeps the normalisation of window vectors in TypeScript (it is O(n·d) and runs once per window) and
  moves the canvas painter from per-cell `fillRect` calls to one `ImageData` write. The painter is not a Kiln kernel,
  but without it the larger matrix cannot be drawn in reasonable time.
- **Example B** keeps the frame difference and the per-zone means on the CPU. They work on the 480×270 grey image
  (129,600 pixels) that the GPU returns, and they are a running scan with state, gaps and time-gated boxes
  (`T2/sources/01` §1.3). Only the full-resolution colour conversion and resample move.
- **Example C** keeps the score filter and index-select in PyTorch (they are already on the GPU) and the temporal OR,
  upscale and fill on the CPU (§21).

---

# Part III — Example A: the window similarity matrix in the factory web UI

## 7. What the view does today

The factory web UI shows, for a run that embeds video windows, a square image whose cell (i, j) is the cosine
similarity between window i and window j. Repeated work shows up as bright off-diagonal bands. The computation is in
`FV/web/live/views/similarity/model.ts`:

```ts
// model.ts:123-140 (abridged)
export function similarityMatrix(all: WindowVector[], cap = MAX_MATRIX_WINDOWS): SimilarityMatrix {
  const windows = all.slice(Math.max(0, all.length - cap));      // keep the most recent `cap`
  const n = windows.length;
  const values = new Float64Array(n * n);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    values[i * n + i] = 1;
    for (let j = i + 1; j < n; j++) {
      const c = cosine(windows[i].unit, windows[j].unit);         // dot product of unit vectors
      values[i * n + j] = c; values[j * n + i] = c;
      if (c < min) min = c; if (c > max) max = c;
    }
  }
  return { windows, values, omitted: all.length - n, min, max };
}
```

- `MAX_MATRIX_WINDOWS = 400` (`model.ts:110`). Above it the view keeps the newest 400 windows and shows a badge
  naming how many older ones are hidden (`EmbeddingSimilarity.tsx:120-125`).
- The input vectors are made unit length once per window in `windowVectors` (`model.ts:45-70`), in Float64.
- The matrix is **rebuilt from scratch whenever a window arrives**: `vectors` recomputes when the output's version
  changes and `matrix` recomputes when `vectors` does (`EmbeddingSimilarity.tsx:140-141`).
- The painter is Canvas 2D and calls `fillRect` with an `rgb(...)` string for each of the n² cells
  (`EmbeddingSimilarity.tsx:49-81`) — 160,000 calls at n = 400.

How large does n get? A run over the 46-minute 2026-09-21 recording embeds 691 windows on the classifier lab's
8 s / 4 s lattice, and 1,385 at 2 s / 2 s (DERIVED from 2,771,933 ms, `T2/sources/01` §7). Both exceed the cap.

| n      | d   | multiply-adds per rebuild, n(n−1)/2 · d (DERIVED) |
| -----: | --: | ------------------------------------------------: |
| 400    | 256 | 20.4 M                                            |
| 400    | 768 | 61.3 M                                            |
| 691    | 768 | 183 M                                             |
| 1,385  | 768 | 736 M                                             |
| 2,297  | 768 | 2,025 M                                           |

The JavaScript cost of each row is UNKNOWN; measuring it is Phase A1.

## 8. What the kernel is for

The problem-restatement test (`.claude/rules/design-tests.md` in Playback) is worth applying before writing anything:
*the view should show every window of a run, and stay responsive while a run is live.* Two different costs block that,
and they have different fixes.

- **The live case** rebuilds n² cells to add n new ones. Updating only the new row and column is O(n·d) — for
  n = 1,385 and d = 768, about one million multiply-adds — and needs no GPU. This is a plain TypeScript change and
  belongs in the same work, but it is not a Kiln kernel.
- **The open-a-finished-run case** must build the whole matrix once: 736 M multiply-adds for the 46-minute recording
  at 2 s windows. That is the case the cap exists for, and it is the case a GPU kernel addresses.

The Kiln kernel is therefore the full rebuild. The incremental update and the `ImageData` painter are companions in
the same change, and the cap rises only when all three are in place.

## 9. The Kiln program

The matrix is X·Xᵀ for the n × d matrix X of unit rows. Kiln recognises the contraction and offers tiled schedules
(`KS/std/tile.js:31-104`).

```js
// W-26 Window similarity (the preset that Phase A2 adds)
const NB = param.enum("windows", [256, 512, 1024, 1536, 2048, 2304], { default: 1536 });
const D = param.enum("dims", [256, 768], { default: 768 });
project("window-similarity")
  .params(NB, D)
  .program(({ x }) => ({ s: N.matmul(x, N.transpose(x, 0, 1)) }),
           ({ param }) => ({ x: k.tensor([param(NB), param(D)]) }));
```

**Buckets.** Shapes are compile-time constants, so the consumer pads n up to the next bucket with zero rows. A zero row
has a dot product of zero with everything, and the consumer reads only the top-left n × n block, so padding changes no
value it reads. Twelve kernels (six bucket sizes × two dimensions) cover every run up to 2,304 windows. The largest
output, 2,304² floats, is 21 MB.

**Precision.** The reference is Float64; the kernel is fp32. A 768-term dot product of unit vectors in fp32 has an
error on the order of √768 · 2⁻²⁴ ≈ 2·10⁻⁶ (DERIVED, standard rounding-error bound for summation). The view maps each
cosine to one of a fixed number of colour steps between the off-diagonal minimum and maximum, so the observable
quality gate is the fraction of cells whose colour step changes (§11).

**Diagonal and min/max.** The JavaScript sets the diagonal to exactly 1 and tracks the off-diagonal min and max. The
kernel computes the diagonal as a dot product (≈ 1 within rounding); the launcher overwrites it with 1 and computes
min and max in one pass over the n × n result in TypeScript, which costs a few milliseconds and saves a second kernel.

## 10. Integration

```text
 envelopes ─► windowVectors (TS, Float64 unit rows) ─► Float32Array, padded to bucket
                                                         │
                         ┌───────────── WebGPU available and n > 64 ─────────────┐
                         ▼                                                       ▼
            kiln-program/1 launcher (TS)                              similarityMatrix (TS, today's code)
            upload x, dispatch, read back s                                      │
                         └──────────────► SimilarityMatrix {values, min, max} ◄──┘
                                                         │
                                      ImageData painter (one putImageData per redraw)
```

- **Kernels ship as data.** Phase A2 runs the Kiln export once and commits the twelve WGSL programs as one JSON file
  under `FV/web/live/views/similarity/kiln/`, with each program's `identity` and Kiln's `CODEGEN_VERSION`. The web
  build does not depend on Kiln; regenerating the file is a documented command.
- **The launcher** (`similarityGpu.ts`) requests the adapter once, creates the pipelines lazily per bucket, and
  returns a `Promise<SimilarityMatrix>`. Its dispatch matches Kiln's WebGPU executor exactly: `gx = min(grid, 65535)`,
  `gy = ceil(grid / 65535)` (`KS/std/devices.js:139`), because the generated WGSL folds the block index the same way
  (`KS/std/emit.js:62-63`).
- **The hook** becomes asynchronous. `EmbeddingSimilarity.tsx` keeps the synchronous CPU result for small n and for
  browsers without WebGPU, and shows the GPU result when it resolves; a newer request supersedes an older one.
- **The cap** rises from 400 to the largest bucket when WebGPU is available, and stays at 400 otherwise.

## 11. Measurement, gate and done-condition

The browser is not a Perf Lab host, so Example A is measured by a browser harness modelled on
`WB/test/paired-webgpu.mjs`: headless Chrome with WebGPU, a page that loads real window vectors, and a seeded paired
order of baseline (today's `similarityMatrix`) and candidate (the GPU path, *including* upload and read-back, because
that is what a user waits for). Each repetition records per-arm wall-clock times; `@kiln/evidence`'s `pairedRatio`
(`KILN/packages/evidence/src/stats.ts:77-136`) turns them into a ratio with a 95% interval, and the evidence record
names each program's `identity`.

Test data comes from the embedding cache: `FV/cache/embeddings/cosmos-embed1-…-224p-…/matrix.npz` holds 2,297 unit
vectors of 256 dimensions and the 448p and SigLIP2 directories hold 2,297 × 768 (`T2/sources/01` §7). They are shot
vectors from the YouTube corpus rather than section-table windows, which does not matter for timing or for numerical
agreement.

**Hypotheses**, stated before measuring:

- `gpu-rebuild-1385`: at n = 1,385, d = 768, the candidate's median time is below 0.1 × the baseline's.
- `cap-lift-interactive`: at n = 2,297, d = 768, the candidate (compute + read-back + paint) completes in under
  100 ms on this Mac.

**Quality gate.** For every bucket and both dimensions on real vectors: `max |s_gpu − s_f64| ≤ 1e-5` over the n × n
block, and at least 99.9% of cells fall in the same colour step as the Float64 result.

**Done-condition.**

- The twelve programs are exported, committed in FV with their identities, and regenerate byte-identically from the
  documented command.
- `EmbeddingSimilarity` shows every window of a 1,385-window run without the "older not shown" badge on a WebGPU
  browser, and falls back to the 400-window view without WebGPU.
- The paired measurement and the gate results are recorded in `T2/various/` and in the diary, and the two hypotheses
  have verdicts.

---

# Part IV — Example B: grey conversion for zone motion in the factory runtime

## 12. What the runtime does today

The factory runtime (`FV/src/factory/`) runs analysis scripts over recordings. A script that asks for
`video.motion(zones, { everyMs: 250, windowMs: 5000 })` is expanded by the compiler into four nodes
(`FV/src/factory/compiler/motion.py:93-110`):

```text
 video.frames({everyMs}) ─► motion.gray({decodeWidth: 480}) ─► motion.change({keys}) ─► video.zone_motion({…})
      every decoded frame          one selected frame               per-zone mean |Δ|        mean, p90, count
      RGB uint8, full size         per 250 ms window                 (scan, keeps prev)       per window
```

**Frames.** GStreamer decodes in hardware (VideoToolbox on the Mac, NVDEC on the Spark) and then converts *every*
frame to packed RGB at full resolution on the CPU with `videoconvert` (`FV/src/factory/backends/media/gst.py:127-141`;
`file.py:30`). The runtime selects the first frame in each 250 ms bucket (`runtime/grids.py:3-7`), so at 30 fps one
frame in 7.5 reaches `motion.gray` (DERIVED).

**Grey.** `to_gray` is two lines, and both are more precise than they look (`kernels/motion.py:146-151`):

```python
gray = cv2.cvtColor(np.ascontiguousarray(rgb), cv2.COLOR_RGB2GRAY)          # 1920×1080 → 1920×1080
return np.asarray(Image.fromarray(gray).resize((width, height), Image.BICUBIC))  # → 480×270
```

- The colour conversion equals `(9798·R + 19235·G + 3735·B + 16384) >> 15` exactly, checked over all 2²⁴ RGB triples
  on this Mac with OpenCV 5.0.0. The commonly quoted 14-bit form differs on 0.26% of pixels (`T2/sources/01` §1.2).
- Pillow's bicubic is an *antialiased* separable filter: the support widens with the downscale factor (17 taps at 4×,
  33 at 8×), the coefficients are 22-bit fixed-point integers, and the image is rounded to 8 bits between the
  horizontal and the vertical pass. A 25-line re-implementation (quoted in `T2/sources/01` §1.2) is bit-identical to
  Pillow on twelve size pairs.

**Change.** `MotionChange.step` keeps the previous selected grey frame as int16, takes `|cur − prev|` over the whole
480×270 image, and averages it inside each zone box (`kernels/motion.py:176-202`). Boxes come from a Zones file in
source pixels, scaled to the grey size; on the 09-21 recording the left camera has three zones and the right four, and
some boxes overlap (`T2/sources/01` §9).

**What is known about cost.** v1 computed the same signal for the 46-minute recording in 53.2 s (left) and 58.2 s
(right) on the Mac, about 4.8 ms per sample including a software ffmpeg decode of every frame (`T2/sources/01` §5).
Runtime v2 has never been timed on this operation, and **no split between decode, colour conversion, resample and
difference exists for either version**. That split is the first thing to measure.

## 13. Measure first

Runtime v2 already records per-node lane service times (`runtime/resources.py:244`, `runtime/session.py:1230`, exposed
as `status.service_ms`), so the split needs no new instrumentation (`T2/sources/01` §5). Phase B1 runs the motion
script over one golden clip and reads those times.

```text
B1  for clip in [marker-short-left, marker-short-right]:                 # 75 s each, 1080p30, 2,250 frames
        for rep in 1..4 (fresh process each):
            factory run <motion script> --source clip --execution mac
            record status.service_ms for: source (decode + videoconvert), motion.gray, motion.change, zone_motion
            record wall time
    report: per node, median ms per selected frame and share of wall time
    microbenchmark: to_gray alone on 300 decoded frames → cvtColor ms, Pillow ms
```

The hypothesis that decides whether Example B continues:

- `gray-is-worth-a-kernel`: `motion.gray` is at least 20% of the run's wall time on the Mac.

If it is refuted — for example because `videoconvert` of every frame dominates — the right next step is the existing
GPU scale path that the Spark already has (`gst.py:127-141`) rather than a Kiln kernel, and the ticket records that
verdict. Example B's kernel phases (B2–B4) proceed only if the hypothesis is supported, or if the Spark measurement
(which needs permission) shows a different picture.

## 14. The Kiln program

The program reproduces `to_gray` exactly in structure: colour conversion, horizontal pass, round and clip, vertical
pass, round and clip.

```js
// W-27 Motion grey (Phase B2), for a 1920×1080 source and decodeWidth 480; taps and starts from Pillow's coeffs()
project("motion-gray")
  .program(({ rgb, wh, wv }) => {
    const Hs = 1080, Ws = 1920, Ho = 270, Wo = 480, T_ = 17;
    const c = (ch) => T.view(rgb, [Hs, Ws], ([y, x]) => [y, x, ix.c(ch)]);
    const g = N.floor(N.mul(N.add(N.add(N.add(N.mul(c(0), 9798), N.mul(c(1), 19235)), N.mul(c(2), 3735)), 16384),
                            1 / 32768));                                        // exact cv2 RGB2GRAY
    const r8 = (v) => N.min(N.max(N.floor(N.add(v, 0.5)), 0), 255);            // Pillow's clip8 rounding
    let h = null;                                                               // horizontal: (1080, 480)
    for (let t = 0; t < T_; t++) {
      const src = T.view(g, [Hs, Wo], ([y, x]) => [y, ix.min(ix.max(x.mul(4).add(-6), 0).add(t), Ws - 1)]);
      const w = T.view(wh, [Hs, Wo], ([y, x]) => [x, ix.c(t)]);
      h = h ? N.add(h, N.mul(src, w)) : N.mul(src, w);
    }
    h = r8(h);
    let v = null;                                                               // vertical: (270, 480)
    for (let t = 0; t < T_; t++) {
      const src = T.view(h, [Ho, Wo], ([y, x]) => [ix.min(ix.max(y.mul(4).add(-6), 0).add(t), Hs - 1), x]);
      const w = T.view(wv, [Ho, Wo], ([y, x]) => [y, ix.c(t)]);
      v = v ? N.add(v, N.mul(src, w)) : N.mul(src, w);
    }
    return { gray: r8(v) };
  }, () => ({ rgb: k.tensor([1080, 1920, 3], { dtype: "u8" }), wh: k.tensor([480, 17]), wv: k.tensor([270, 17]) }));
```

The pieces map onto the Pillow algorithm as follows.

- **Window start.** For an integer ratio of 4, Pillow's window for output column x starts at
  `max(int((x + 0.5)·4 − 8 + 0.5), 0) = max(4x − 6, 0)` for every x ≥ 0 (DERIVED from `coeffs()` in
  `T2/sources/01` §1.2, using `int()`'s truncation toward zero for the two negative cases). Taps past the right edge
  get weight zero and an index clamped to the last column, so they read a valid pixel and contribute nothing. For a
  non-integer ratio the start is `max(⌊(a·x + b) / c⌋, 0)` for constants a, b, c derived from the ratio, which is still
  an index map; the program generator computes it.
- **Weights.** `wh[x, t]` and `wv[y, t]` are Pillow's normalised weights for each output position, including the
  renormalised border windows. They are coordinate-dependent, and Kiln has no way to compute them from coordinates,
  so they are passed in as small input tensors (480 × 17 and 270 × 17 floats), computed once per geometry.
- **Rounding.** Pillow accumulates 22-bit integer products; the program accumulates fp32 products of 8-bit values and
  fp32 weights. The two agree except where a sum lands within fp32 rounding error of a half-integer, which makes the
  rounded value differ by one level. Phase B3 measures how many pixels per frame that affects; the estimate is a few
  dozen out of 129,600 (DERIVED: weights quantised to 2⁻²² against an fp32 accumulation error of about 10⁻⁵ at
  magnitude 255).
- **Fusion.** Kiln will fuse the colour conversion into the horizontal pass (each grey value is used by up to 17
  outputs, so the guard may instead materialise it), and will not fuse the horizontal pass into the vertical one
  (each horizontal value is used 17 times). Whichever way the guard decides, the kernels are correct; the measurement
  says whether the decision was good.

## 15. Integration in the factory runtime

**Registering a second implementation needs a selector.** The compiler demands that exactly one implementation
resolves for each node and has no preference order; two resolving implementations are a compile error,
`AMBIGUOUS_IMPLEMENTATION` (`FV/src/factory/compiler/lower.py:477-506`). `cpu.motion_gray` has no requirements and
accepts every parameter set (`kernels/motion.py:451-461`), so adding a second implementation that also resolves breaks
every motion script. Three ways to make them disjoint were considered.

| Option                                                  | Effect on caches                                                        | Verdict |
| ------------------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| Gate the CPU implementation on `TARGET_MAC`             | The Spark would have only the Kiln path; no way to compare on one host | Rejected |
| A new `Requirement` (e.g. `KILN`) plus `default_available` plumbing | `cpu.motion_gray` still accepts everything, so both resolve | Insufficient alone |
| An optional `backend` parameter on `motion.gray`, absent meaning `cpu` | Absent keeps every existing node key; `kiln` gets a new key | **Chosen** |

The parameter belongs in the node key, and that is a correctness argument, not a convenience. `node_key` hashes the
operation, its parameters and its inputs, but not the implementation (`compiler/graph.py:326-334`). If the Kiln path
were selected without a parameter, a grey frame computed by Kiln and one computed by OpenCV would share a cache key
while differing in a few pixels. With `backend` in the parameters they cannot collide. The schema has
`additionalProperties: false` (`kernels/catalog_w8c.py:49-51,76`), so the property is added to `motion.gray`'s
schema; Phase B4 confirms that parameter normalisation does not fill an absent optional property with its default,
which is what keeps existing keys stable.

```python
KILN_GRAY = REGISTRY.implementation(ImplementationSpec(
    implementation_id="kiln.motion_gray", operation=GRAY.name, version="1",
    resource=lambda p: "gpu",                                   # its own lane: credit 1, wait (lower.py:509-514)
    make_kernel=lambda services, params: KilnGrayFrames(services, params),
    accepts=lambda p: p.get("backend") == "kiln"))
# and cpu.motion_gray gains: accepts=lambda p: p.get("backend", "cpu") == "cpu"
```

The script or the execution options choose the backend; the compiler's motion expansion passes it through to the
`motion.gray` node only when it is not `cpu`.

**Running the kernel from Python.** `KilnGrayFrames` loads the `kiln-program/1` export for the source geometry and
runs it through the Python launcher (§6.1). On the Mac the launcher uses the `wgpu` package, which runs WGSL on Metal;
on the Spark it uses CUDA through `ctypes` (§19). The kernel's output is the 480×270 grey image as uint8 on the host
— 129,600 bytes — which `motion.change`, `flow.pairs` and point tracking consume unchanged.

## 16. Quality gate and done-condition

The factory repository has no pixel-level test of the grey image; the "mean |Δ| 0.013" figure is the result of the
experiment that chose the conversion, not an assertion (`T2/sources/01` §4). The gate for this example is therefore
written in the same terms as that experiment, so the two numbers can be read side by side:

- **Pixel agreement:** on every selected frame of `marker-short-left.mp4` and `marker-short-right.mp4`, the Kiln grey
  image differs from `to_gray` by at most one level, in at most 0.1% of pixels.
- **Signal agreement:** the per-zone motion values (`motion.change`) of the two backends differ by a mean absolute
  0.013 or less — the budget the v2 conversion itself was accepted with — and `zone_motion`'s window features agree to
  their four printed decimals in at least 99% of cells.
- **Existing tests:** `pytest test/factory_tests/test_w8c_motion_points.py --run-slow` passes with the default backend
  and with `backend: "kiln"`.

**Done-condition.** B1's verdict is recorded. If `gray-is-worth-a-kernel` is supported: the program is exported for
the 1080p and 4K geometries; `kiln.motion_gray` is registered and selected by `backend`; the gate passes on both golden
clips; and a paired comparison of whole runs (four processes per arm, seeded order) gives a ratio with an interval for
the Mac and, with permission, for the Spark.

---

# Part V — Example C: redaction mask post-processing in Playback

Playback's redaction service blacks out people in recorded video before anyone without raw-access rights sees it. It
is the most valuable target in this guide, because the fleet already asks more of it than one GB10 can deliver, and
the stage examined here grows with the number of people in the frame. It is also the strictest: privacy depends on
the output, so every change passes a judge built for exactly this service.

## 17. What happens today

### 17.1 The engine's outputs

The segmentation engine is a TensorRT FP16 plan exported from mmdeploy. Its I/O is documented at the top of
`PB/services/redaction/src/trt_engine.py:13-16`:

```text
input   (1, 3, 640, 640)  float32  BGR letterbox uint8 -> float32
dets    (1, N, 5)         float32  xyxy + score
labels  (1, N)            int64    COCO class id
masks   (1, N, 640, 640)  float32  sigmoid logits, binarized at runtime
```

`N` is dynamic and at most 100 (`trt_engine.py:88-92`); non-maximum suppression runs inside the engine. On the 1080p
path the decoded frame (1920×1080) is first downscaled to the **inference size** 768×416 with `cv2.INTER_AREA`
(`video_pipeline.py:509-516,801`), and the engine letterboxes that into 640×640: scale `min(640/768, 640/416) =
0.8333`, content 640×347, 146 rows of grey padding above and below (DERIVED, `T2/sources/03` Q1). 45.8% of every
forward pass is padding.

### 17.2 The collect step, line by line

After the forward pass the engine filters, copies and releases the GPU slot (`trt_engine.py:705-764`):

```python
slot.stream.synchronize()                                   # wait for the forward
with torch.cuda.stream(slot.stream):
    scores_gpu = dets_gpu[0, :, 4]
    keep_mask = (scores_gpu >= self._confidence) & (labels_gpu[0] == PERSON_CLASS_ID)
    idx_gpu = torch.nonzero(keep_mask, as_tuple=False).flatten()
    n_keep = int(idx_gpu.numel())                           # host synchronisation
    kept_scores = scores_gpu[idx_gpu].cpu().numpy().astype(np.float32)
    kept_masks_lb = ((masks_gpu[0, idx_gpu] >= MASK_THRESHOLD).to(torch.uint8).cpu().numpy())
self._release(inflight)                                     # slot back to the pool
```

The confidence cut is 0.3 and `MASK_THRESHOLD` is 0.35 (`calibration/best_params.json:20-21`). The index-select,
threshold and cast run on the GPU, so only kept detections cross the bus, but each one is a full 640×640 uint8 mask:
**409,600 bytes per person** (DERIVED: 640·640·1), copied into pageable memory.

Then, with the GPU already released, a CPU loop runs once per detection (`trt_engine.py:766-773`):

```python
out_masks = np.empty((n_keep, height, width), dtype=np.uint8)   # height, width = 416, 768 on 1080p
for i in range(n_keep):
    m_src = _unletterbox_mask(kept_masks_lb[i], scale, pad_x, pad_y, (height, width))
    m_src = _smooth_mask(m_src, self._smooth_px)
    out_masks[i] = _dilate_mask(m_src, self._dilate_kernel)
```

| Function                | What it does                                                                                                  | Source                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `_unletterbox_mask`     | Crop the 640×347 content rectangle, `cv2.resize(…, (768, 416), INTER_NEAREST)`                                | `trt_engine.py:139-157`        |
| `_smooth_mask`          | `cv2.GaussianBlur(mask·255, ksize=(0,0), sigmaX=2.0)`, then `≥ 128`                                          | `seg_engine.py:140-154`        |
| `_dilate_mask`          | `cv2.dilate` with an elliptical kernel — **a no-op in production**, because `mask_dilate_px = 0`             | `seg_engine.py:125-137`; `best_params.json:23` |

Two more CPU steps follow on other threads: the per-detection masks are OR-ed into one union
(`np.logical_or.reduce`, `seg_engine.py:508-516`), OR-ed with the previous 100 ms of unions for temporal stability
(`video_pipeline.py:274-287`), upscaled to 1920×1080 with nearest-neighbour, and used for a black fill bounded to the
union's bounding box (`video_pipeline.py:1012-1053`). Playback has no blur or pixelation mode; the fill is always
black (`video_pipeline.py:1052`, `seg_engine.py:504-505`).

### 17.3 What it costs

`PB/docs/vision/redaction-performance.md` measured every stage on two hosts. The rows that matter here:

| ms per frame, MEASURED                         | GB10, ~1 person | RTX PRO 6000, 1080p24 occupied (5.54 det/frame) |
| ---------------------------------------------- | --------------: | -----------------------------------------------: |
| `infer_forward` (TensorRT)                     | 15.03           | 4.62                                             |
| `infer_decode` (GPU filter, sync, D2H)         | 8.88            | 0.78                                             |
| `infer_post` (the CPU loop above)              | 0.54            | 2.87                                             |
| `infer_busy` (all inference work)              | 25.81           | 9.02                                             |
| `fill_busy` (union bbox + black fill)          | 5.15 (later 1.36) | 3.55                                           |

Sources: GB10 table `redaction-performance.md:159-185` (busy host, 2026-08-19); RTX table `:851-875`
(2026-08-20). Three facts follow.

- **On the RTX host the CPU loop is a third of inference.** DERIVED: 2.87 / 9.02 = 32%, about 0.52 ms per detection
  (2.87 / 5.54). The forward pass is no longer dominant there (`:876-882`).
- **On the GB10 the forward pass dominates the recorded numbers**, but those were taken on a contended host (five
  co-resident CUDA processes, `:126-141`); the same engine ran at about 126 queries/s (~7.9 ms per forward) in quiet
  moments (`:1309-1312`). `infer_decode` at 8.88 ms is the document's own open item: "making it *cheaper* is still
  open" (`:1313-1315`).
- **The fleet needs 82 frames/s** (30+24+24+2+2, `:287-296`). A GB10 delivers 46–49 f/s and an RTX PRO 6000 about
  114 f/s (`:28, 239-250, 842`).

Seven levers have already been measured and rejected on this service, including batching, a smaller letterbox, TRT
build knobs, CUDA graphs, NVDEC, a larger context pool and host-thread changes (`:1247-1325`; table in
`T2/sources/03` Q3). Moving the mask post-processing onto the GPU is not on that list.

## 18. The Kiln program

The post-processing is four operations on each kept mask followed by a union across masks. Every one of them is
coordinate-only, so the whole chain is one Kiln program.

```text
 masks (n, 640, 640) fp32 sigmoid      ── threshold ≥ 0.35 ──►  0 / 255
        │ unletterbox: nearest, index map  y_src = pad_y + ⌊y·347/416⌋,  x_src = pad_x + ⌊x·640/768⌋
        ▼
 u (n, 416, 768)                        ── reflect-101 border, index map ──►  13-tap horizontal Gaussian
        ▼                                                                     13-tap vertical Gaussian
 b (n, 416, 768)                        ── ≥ 127.5 ──►  0 / 1
        ▼
 union (416, 768) = max over n          ── one output buffer, 319,488 floats
```

**Why each step is expressible.**

- *Threshold* is `N.gt(m, 0.35)` scaled by 255: an elementwise op.
- *Nearest-neighbour unletterbox* is a view. OpenCV's `INTER_NEAREST` maps destination `x` to source
  `floor(x · (src_w / dst_w))`, computed in double precision. Kiln index maps support multiplication by constants and
  floor division by positive constants (`KS/core/ix.js:78-87`), so `T.view(m, [n, 416, 768], ([d, y, x]) =>
  [d, y.mul(347).div(416).add(146), x.mul(640).div(768)])` reads the same source pixel. Floor division agrees with
  OpenCV's double-precision floor for these geometries because 347 is prime and less than 416 (no exact integer
  products except at 0), and `1/1.2` rounds *up* in double precision, so products at multiples of 6 do not fall below
  the integer. A unit test will assert the agreement on every pixel rather than relying on this argument.
- *Reflect-101 border* is a view too. `cv2.GaussianBlur` uses `BORDER_REFLECT_101`, which maps an out-of-range
  coordinate `i` to `-i` below zero and `2(H-1) - i` above. With `a = max(i, -i)` and `b = min(a, 2(H-1) - a)` the
  map is built from `max`, `min` and multiplication by constants, all of which `ix` supports.
- *Gaussian smoothing* is a stencil: 13 shifted views multiplied by scalar weights and summed, once along x and once
  along y. OpenCV derives the 13-tap size from σ = 2 (`round(2·3·2+1) | 1`); this is DERIVED from OpenCV's documented
  rule because the repository passes `ksize=(0,0)` (`T2/sources/03` Q1). The implementation phase prints OpenCV's
  `getGaussianKernel(13, 2)` and uses exactly those weights.
- *Re-threshold and union* are an elementwise compare and a `max` reduction over the detection axis.

As a Kiln program (written against the API in §2.1; the exact helper names are fixed in Phase C):

```js
const B = param.int("detections", { min: 1, max: 100, default: 8 });    // bucket size
project("redaction-mask-post")
  .params(B)
  .program(({ masks }, { param }) => {
    const n = param(B), H = 416, W = 768, R = 6, w = gaussianWeights13(2.0);   // from cv2.getGaussianKernel
    const on = N.mul(N.gt(masks, 0.35), 255);                                  // (n,640,640)
    const reflect = (i, len) => { const a = ix.max(i, i.mul(-1)); return ix.min(a, a.mul(-1).add(2 * (len - 1))); };
    // horizontal pass reads the unletterboxed mask at reflected x
    let h = null;
    for (let t = -R; t <= R; t++) {
      const v = T.view(on, [n, H, W], ([d, y, x]) =>
        [d, y.mul(347).div(416).add(146), reflect(x.add(t), W).mul(640).div(768)]);
      h = h ? N.add(h, N.mul(v, w[t + R])) : N.mul(v, w[t + R]);
    }
    // vertical pass reads the horizontal result at reflected y
    let s = null;
    for (let t = -R; t <= R; t++) {
      const v = T.view(h, [n, H, W], ([d, y, x]) => [d, reflect(y.add(t), H), x]);
      s = s ? N.add(s, N.mul(v, w[t + R])) : N.mul(v, w[t + R]);
    }
    return { union: N.amax(N.gt(s, 127.5), 0, false) };                         // (416,768)
  }, ({ param }) => ({ masks: k.tensor([param(B), 640, 640]) }));
```

**Why the cut is 127.5.** OpenCV blurs an 8-bit image with fixed-point weights and rounds the result to an integer
before the `≥ 128` comparison. A real-valued blur that is at least 127.5 rounds to at least 128, so the fp32 cut at
127.5 reproduces the decision everywhere except where the blurred value lies within OpenCV's fixed-point rounding
error of 127.5. Those pixels sit exactly on a mask boundary, and §20 explains why a handful of them is acceptable.

**Why the program is written as two passes.** A fused 13×13 stencil reads 169 inputs per output pixel; the separable
form reads 26 and writes one intermediate. Kiln's fusion pass decides whether to inline the horizontal pass into the
vertical one; its blow-up guard (`KS/std/loop.js:342`) refuses an inlining that recomputes each horizontal value 13
times, so the program compiles to two kernels plus the union. That is the shape a hand-written CUDA version would
have.

**Variable detection count.** Shapes are compile-time constants, but `n_keep` varies from 0 to 100. The program is
compiled once per **bucket** — 1, 2, 4, 8, 16, 32, 64 and 100 — and the engine pads the kept masks with zero masks up
to the bucket. A zero mask thresholds to zero everywhere and cannot change a `max`, so padding is exact. Eight
compiled kernels per geometry is a small, fixed set; there are two geometries in production (768×416 for 1080p and
720p sources, 640×480 unscaled).

**Cost.** DERIVED: per detection, 26 multiply-adds per output pixel × 319,488 pixels ≈ 8.3 M, plus reading the
640×347 content region (0.89 MB) and writing and reading one 1.28 MB intermediate. At the RTX PRO 6000's ~1.8 TB/s
that is microseconds per detection; launch overhead (three kernels) dominates. The GPU work is not the question. The
question is how much of the 2.87 ms CPU loop, the n × 410 KB copies and the CPU union disappear, and that is
UNKNOWN until Phase C5 measures it.

## 19. Integration in the engine

The integration replaces the CPU loop and the per-detection copies, and nothing else.

```text
 today:   GPU filter ─► index-select ─► threshold ─► uint8 ─► D2H n×410 KB ─► release ─► CPU loop ×n ─► union (CPU)
 Kiln:    GPU filter ─► index-select ─► pad to bucket ─► Kiln kernels (on slot stream) ─► D2H 319 KB ─► release
```

**Return shape.** `collect()` currently returns `n_keep` per-detection masks at inference resolution, and every caller
unions them (`_frame_union`, `video_pipeline.py:1206-1210`; `apply_black_fill`, `seg_engine.py:492-505`). With the
Kiln path the engine returns a single mask, the union, with shape `(1, 416, 768)`. The union of one mask is itself, so
callers need no change. Phase C4 must audit every reader of the per-detection masks for anything that uses the first
dimension as a detection count (for example region metadata in `.redact.json`); detection counts must come from
`kept_scores`, which is unchanged.

**Launching a Kiln kernel from Python.** Kiln exports CUDA source with fixed shapes and no host wrapper
(`KS/std/devices.js:336-344`; `T2/sources/02` Q3). The redaction image has PyTorch, CUDA 13.2 and TensorRT 10.16 but
no CuPy, cuda-python or PyCUDA (`T2/sources/03` Q2). Three ways to launch a raw kernel were considered:

| Option                                      | New dependency                     | Startup cost                     | Verdict                                       |
| ------------------------------------------- | ---------------------------------- | -------------------------------- | --------------------------------------------- |
| `torch.utils.cpp_extension.load_inline`     | `nvcc` + `ninja` at run time       | C++ build, tens of seconds        | Heavy; ties the service to a compiler at boot |
| CuPy `RawKernel`                            | CuPy wheel for CUDA 13             | NVRTC compile, cached            | Adds a large dependency for one call site     |
| `ctypes` over `libnvrtc` and `libcuda`      | none (both ship with the image)    | NVRTC compile once, < 1 s        | **Chosen**                                    |

The chosen option is a small module, `kiln_launch.py`, of about one hundred lines: compile the kernel source with
NVRTC once, load the PTX with `cuModuleLoadData`, and call `cuLaunchKernel` with the slot's stream
(`slot.stream.cuda_stream`) and the `data_ptr()` of PyTorch tensors. The same module serves the factory runtime on the
Spark (§15), which is its second consumer; without that second consumer it would not be worth a module.

```text
class KilnKernel:
    def __init__(self, record):                 # one entry of a kiln-bundle/1 JSON
        ptx = nvrtc_compile(record.source, arch=device_arch())
        self.fn = cuModuleGetFunction(cuModuleLoadData(ptx), record.name)
        self.grid, self.block = record.grid, record.block
    def __call__(self, stream, *tensors):        # inputs then output, contiguous float32 CUDA tensors
        args = [ctypes.c_void_p(t.data_ptr()) for t in tensors]
        cuLaunchKernel(self.fn, self.grid, 1, 1, self.block, 1, 1, 0, stream, args)
```

**Switch.** A new setting, `REDACTION_MASK_POST=cpu|kiln`, defaults to `cpu`. The Kiln path is chosen per engine at
startup, compiled during warm-up, and falls back to `cpu` with a logged reason if compilation fails. Keeping both
paths is what makes the paired comparison in §20 possible.

## 20. Quality gates and acceptance

The redaction service already has the three gates this change needs. They are the reason this example is credible.

1. **Element agreement (new unit test).** For recorded kept masks, compare the Kiln union against the CPU path's union
   pixel by pixel. Report the count of differing pixels per frame. Expectation: zero from the unletterbox, and a
   handful at mask boundaries from the Gaussian's fixed-point rounding.
2. **The redaction judge** (`PB/services/redaction/scripts/verify_redaction_identical.py`). It counts pure-black
   pixels per decoded frame, establishes a **noise floor** from three or more runs of unchanged code — the mask head is
   not run-to-run deterministic, with a worst per-frame delta of 601 px on the GB10 and 2,856 px on the RTX PRO 6000
   (`redaction-performance.md:1080-1084,1262`) — and fails a candidate that **loses** coverage beyond
   `max(4 × floor, 64)` pixels per frame (`verify_redaction_identical.py:195,226-247`). A boundary difference of a few
   pixels is far inside that tolerance; losing coverage beyond it fails.
3. **Ground truth** (`score_against_ground_truth.py`): recall 0.9681 and F2 0.9457 on the checked-in fixtures
   (`redaction-performance.md:1079-1081`). `validate_on_host.sh` fails if recall drops by more than 0.0005 or the
   detection count decreases.

`validate_on_host.sh` runs all of these plus a paired throughput A/B (`validate_on_host.sh:9-58`) and is the
acceptance command for this example. It needs a GPU host, which needs explicit permission (§24).

**Hypotheses** for Phase C5, stated before measuring:

- `post-moves-to-gpu`: on the RTX PRO 6000, 1080p24 occupied, the candidate's median `infer_busy` is below 0.8 × the
  baseline's (it removes most of the 2.87 ms loop and part of the 0.78 ms decode).
- `gb10-unchanged-or-better`: on the GB10 the candidate's throughput at concurrency 4 is not below the baseline's.

## 21. What this example does not do

The temporal OR, the upscale to 1920×1080 and the black fill stay on the CPU. Each could move to the GPU as well —
the fill is a `select`, the upscale another nearest view — but moving them changes the threading model of
`video_pipeline.py`, which is outside this ticket. A second variant that skips the host synchronisation entirely
(always processing all 100 engine slots with a per-slot keep weight) is recorded as an open question in §28: it trades
host round trips for about 100× more GPU reads.

---

# Part VI — Secondary example: YOLOX decode in the stream-engine

## 22. The YOLOX element

The stream-engine's custom GStreamer element copies the whole raw detector output to the host every batch and decodes
it on one CPU thread (`PB/services/stream-engine/src/pipeline/gstyoloxinfer.cpp:368-404, 242-295`). The output is
`B × 8400 × 85` fp32 — 2,856,000 bytes per frame slot (DERIVED: 8400·85·4) — where 8400 = 80² + 40² + 20² anchors at
strides 8, 16 and 32, and 85 = four box regressions, objectness and 80 class scores (`:65-90,179-205`).

**A finding to report separately.** `B` is the element's configured `batch-size` property (the camera count at
startup), not the number of frames actually filled in the batch (`:371,397`). A partial batch therefore runs TensorRT
on, and copies, stale slots. The element's own header comment says "batch = active" (`:22`), which the code does not
do. This is a defect independent of Kiln.

**The Kiln program.** The decode is per-anchor and coordinate-only, with one subtlety: the C++ keeps an anchor only if
person is the *argmax* class. Kiln has no argmax, but "person is the argmax, first index wins ties" is exactly
`cls[0] ≥ max(cls[1..79])`, a `max` reduction over a slice followed by a compare. The anchor grid (`gx`, `gy`,
stride) becomes a small constant input tensor, because Kiln has no iota. The output is `B × 8400 × 6`: the decoded
box, the person score and a keep flag, 14× smaller than the raw output. NMS stays on the CPU, which Kiln cannot
express (it sorts).

**Why it is secondary.** Its cost has never been measured: the 406 frames/s limit in the stream-engine README was
measured on 2026-04-13 with the previous nvinfer pipeline, before this element existed
(`services/stream-engine/src/pipeline/README.md:973-990`; `T2/sources/03` Q7). The first step is instrumentation —
per-batch timers around the copy and the decode — not a kernel. The element also has a hand-written CUDA preprocess
kernel that must stay byte-equivalent to OpenCV's NV12 conversion; it is a gather with integer arithmetic and is out
of Kiln's reach (`gstyoloxinfer_preprocess.cu:1-16`).

---

# Part VII — Evidence, identity and NVIDIA hosts

## 23. Identity from program to profiler trace

A measurement is useful later only if someone can tell which kernel it measured. Kiln already computes the right key:
`identity = hash("loop|" + expr.__key + "|" + shape + "|" + inShapes)` names what a kernel computes and not how it is
scheduled (`KS/std/program.js:29-43`), and `CODEGEN_VERSION = "kiln-codegen/2"` names the emitter
(`KS/std/records.js:11`). This ticket carries that key through every boundary a kernel crosses.

```text
 Kiln program ──► kernel record {identity, row, codegen}
       │                 │
       │                 ├──► kiln-program/1 export (each kernel entry keeps identity + codegen)
       │                 │          │
       │                 │          ├──► consumer repo: committed export, loaded by the launcher
       │                 │          │
       │                 │          └──► emitted symbol name  k_<name>__<identity[0:8]>   (CUDA and WGSL)
       │                 │                          │
       │                 │                          └──► profiler trace on the host (nsys, torch.profiler)
       ▼                 ▼
 measurement record {arm, identity, codegen, consumer revision, host fingerprint, samples}
       │
       └──► evidence graph:  observed kernel ──corresponds_to (direct, method "symbol-suffix")──► generated kernel
```

Three rules make the chain hold.

- **Exports keep identity.** Every kernel entry in a `kiln-program/1` file carries `identity`, `row` (the schedule) and
  `codegen`. The consumer commits the file, so the consumer's git revision pins the exact kernels it ran.
- **Symbols carry identity.** A profiler on an NVIDIA host reports kernel *names*. If Kiln's emitted name ends in the
  first eight hex digits of the identity, any trace that mentions the kernel links to its program without a lookup
  table. Today the CUDA name is `cname(K.name)` (`KS/std/emit.js:21`); the suffix is a one-line change with a test.
- **Measurements record the arm's identity and the host.** A paired record names, for the candidate arm, the identity
  and codegen of each kernel it launched, the consumer's revision, and a host fingerprint (GPU name, driver, and the
  other GPU processes present — the redaction document shows throughput swinging about 2× with co-resident tenants,
  `PB/docs/vision/redaction-performance.md:126-141`).

With those three in place, Phase 8d's `corresponds_to` edge (`T1/tasks.md:23`) has a precise definition:

```text
link = { from: "<runRef>!kernel:<observed symbol>",
         to:   "kiln:<identity>",
         rel:  "corresponds_to",
         evidence: "direct",            // symbol suffix matched an identity in a committed export
         method: "symbol-suffix" }
```

The `Link` shape and the evidence classes already exist in `@kiln/lab` (`KILN/packages/lab/src/lang/rows.ts:27-32`,
`values.ts:39`). An edge without a suffix match falls back to `heuristic` (name and shape similarity), which is what
PR 1005's sampler would get today; the point of this ticket is that the three examples get `direct`.

## 24. Running on NVIDIA hosts

No Kiln kernel has been timed on an NVIDIA GPU (`T2/sources/02` Q4). Examples B (on the Spark) and C (anywhere) need
it, so the first NVIDIA session has a fixed agenda. **Reaching a GPU host over SSH requires explicit permission each
time**; nothing in this ticket assumes it.

1. **Smoke test the CUDA runner.** Export the twelve similarity kernels and three motion-grey kernels with `bundle()`,
   run them through `SRV/executors/cuda-runner.ts` with an `ssh` profile, and check that every sampled output agrees
   with the Loop IR reference (`rtol 2e-3, atol 2e-4`). This exercises `nvcc` discovery, content-addressed runner
   upload and the `kiln-results/1` format for the first time (`KILN/runner/kiln_runner.py:42-65,161-181,299`).
2. **Add target specs for the real hosts.** `KS/std/targets.js` has no GB10 and no RTX PRO 6000 entry. Fill SM count,
   clocks, bandwidth and shared-memory limits from `nvidia-smi --query-gpu` and the CUDA device properties *on the
   host*, not from data sheets, and cite the command output in the diary.
3. **Record the runner's known gaps in every result.** The runner flushes no L2 cache, locks no clocks and does not
   check for co-tenants (`T2/sources/02` Q4). Until it does, every NVIDIA result carries the `nvidia-smi` process list
   taken immediately before and after, and comparisons are paired in one session.
4. **Then run the consumers**: the motion-grey paired runs on the Spark (§16) and `validate_on_host.sh` for redaction
   (§20).

## 25. Getting results onto a board

Perf Lab can execute only on host `local`, and Kiln's own lab job route answers 501 (`T2/sources/02` Q6, Q9). The
browser harness (Example A) and the factory runs (Example B) therefore execute outside the lab, and their results
enter it the way the DGX numbers for PR 1005 did: as an **evidence archive** registered through
`POST /api/lab/evidence` and imported by a lab program that names it (`LAB/server/runner.ts:165-211`; Kiln:
`SRV/lab/routes.ts`).

The existing archive format, `detection-qualification/v1`, describes detections and is not a fit. This ticket adds a
second, generic format:

```json
{
  "format": "kiln-paired/1",
  "experiment": "similarity-rebuild",
  "host": { "name": "local", "gpu": "Apple M1 Pro", "browser": "Chrome 1xx", "coTenants": [] },
  "consumer": { "repo": "factory-videos", "revision": "<git sha>" },
  "order": { "seed": 20261020, "sequence": ["baseline", "candidate", "candidate", "baseline"] },
  "arms": {
    "baseline":  { "impl": "similarityMatrix (Float64 JS)", "kernels": [] },
    "candidate": { "impl": "kiln webgpu", "kernels": [{ "identity": "…", "row": "…", "codegen": "kiln-codegen/2" }] }
  },
  "params": { "n": 1385, "d": 768 },
  "repetitions": [ { "rep": 1, "arm": "baseline", "samplesMs": [] } ],
  "quality": { "maxAbsDiff": 0.0, "binAgreement": 1.0 }
}
```

The importer maps each repetition onto a run, each arm onto an experiment arm, and each candidate kernel onto a
`kernel` entity carrying its identity, which is exactly the node the `corresponds_to` edge in §23 points at. One lab
program per example then shows the paired ratio, the hypothesis verdicts and the kernel cards on a board. Building
lab job execution in the Kiln server would make the import step unnecessary; it is deliberately out of scope here,
because three examples with different runtimes (a browser, a Python runtime, a container on a remote host) would each
need their own executor first.

---

# Part VIII — Implementation plan and reference

## 26. Phases

The phases are ordered by dependency and by what can run without remote access. Each has a done-condition that can be
checked rather than felt.

```text
 P0 groundwork ──► PA similarity (Mac, browser) ──────────────────────────┐
      │                                                                    ├──► PE evidence + boards ──► PR reports
      ├──────────► PB1 measure motion ──► PB2–B5 grey kernel (Mac) ────────┤
      │                                                                    │
      └──────────► PC1–C3 redaction kernel + reference + patch ────────────┤
                                                                           │
                    PN NVIDIA session (needs permission): runner smoke, B on Spark, C validate_on_host
```

### P0 — Compiler and export groundwork (KILN)

| Task | What                                                                                                    | Files                                                    |
| ---- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 0.1  | Add `floor` to the function table; expose `N.floor`; tests in JS evaluator, CUDA and WGSL emit          | `KS/std/fns.js`, `KS/std/tensor.js`, kiln tests          |
| 0.2  | 8-bit inputs: `k.tensor(shape, {dtype: "u8"})`, carried to kernel params; CUDA and WGSL loads; reference unchanged | `KS/core/kiln.js`, `KS/std/kernel.js`, `KS/std/emit.js`, tests |
| 0.3  | `kiln-program/1` export: kernels in launch order, buffer table, dispatch geometry, identities           | new `KS/std/export.js`, CLI `KILN/scripts/kiln-export.mjs` |
| 0.4  | TypeScript WebGPU launcher for `kiln-program/1`                                                          | new `KILN/runtime/webgpu/launch.ts` (vendored by consumers) |
| 0.5  | Python launcher, backends `wgpu` and `cuda` (ctypes over NVRTC and the driver API)                       | new `KILN/runtime/python/kiln_launch.py`                 |
| 0.6  | Identity suffix on emitted kernel names                                                                  | `KS/std/emit.js`                                         |

Done when: `pnpm test` passes with new tests for 0.1, 0.2 and 0.6; a round-trip test exports W-12 and runs it through
both launchers (WebGPU in headless Chrome, `wgpu` in Python on the Mac) with outputs matching the Loop IR reference.

### PA — Example A

| Task | What                                                                                          | Done when                                                         |
| ---- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| A1   | Browser baseline: time `similarityMatrix` at n ∈ {400, 691, 1385, 2297}, d ∈ {256, 768}       | Table of medians in the diary; numbers move from UNKNOWN to MEASURED |
| A2   | W-26 preset and the twelve exports                                                            | Preset compiles; exports pass the quality gate on cached vectors  |
| A3   | FV worktree branch: launcher, async hook, incremental row update, `ImageData` painter, cap    | A 1,385-window run renders fully; fallback verified without WebGPU |
| A4   | Paired measurement, gate, `kiln-paired/1` record, screenshots                                  | Both hypotheses in §11 have verdicts                              |

### PB — Example B

| Task | What                                                                                           | Done when                                                       |
| ---- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| B1   | Stage split on the Mac from `status.service_ms`, plus a `to_gray` microbenchmark                | `gray-is-worth-a-kernel` has a verdict                          |
| B2   | W-27 program, weight tables from Pillow's `coeffs()`, exports for 1080p and 4K                  | JS reference of the program equals `to_gray` within the gate    |
| B3   | Agreement on golden clips via the `wgpu` launcher                                              | Pixel and signal gates in §16 pass                              |
| B4   | `backend` parameter, `kiln.motion_gray` registration, tests                                    | Existing motion tests pass on both backends                     |
| B5   | Paired whole-run comparison on the Mac                                                         | Ratio with interval recorded                                    |

### PC — Example C

| Task | What                                                                                           | Done when                                                                 |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| C1   | Redaction program, Gaussian weights from `cv2.getGaussianKernel(13, 2)`, buckets × 2 geometries | Program compiles for every bucket                                         |
| C2   | Reference agreement on the Mac: Kiln (via `wgpu`) vs `_unletterbox_mask` + `_smooth_mask` + union on realistic masks | Differing pixels per frame reported; zero from the unletterbox alone |
| C3   | Playback branch: `REDACTION_MASK_POST`, `kiln_launch` CUDA backend, collect-path change, unit test | Code review ready; CPU default unchanged                                |
| C4   | On a GPU host (permission): judge, ground truth, `validate_on_host.sh`, paired throughput        | Hypotheses in §20 have verdicts                                           |

### PN, PE, PR

- **PN** is the NVIDIA session of §24. It needs permission and runs once A–C have produced their exports.
- **PE** adds the `kiln-paired/1` importer, a lab program per example, and the `corresponds_to` edges of §23.
- **PR** writes one report per example for the project vault, with the measurements, the verdicts and screenshots.

## 27. Risks

| Risk                                                                                                  | Consequence                                         | Mitigation                                                    |
| ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Decode and `videoconvert` dominate Example B                                                          | The grey kernel saves little                         | B1 measures first; a refuted hypothesis is a recorded result  |
| Read-back latency dominates the GPU similarity at small n                                             | No gain below some n                                | The launcher is used only above a threshold set from A1       |
| fp32 accumulation flips Pillow's rounding on some pixels                                             | Grey images differ by one level in a few pixels     | The gate counts them; the signal gate decides                 |
| OpenCV versions differ (4.13 in the redaction image, 5.0 on the Mac)                                  | The CPU reference used on the Mac may not match production | C2 records the version; C4 re-runs agreement in the container |
| Kiln's scale limits (20,000 fork leaves, 4,000 rewrites, K-18) on 17- and 26-term stencils            | Compile fails or silently truncates the search      | Watch the limit counters; pin schedules if needed (W-21 shows how) |
| End-to-end check skipped above 6·10⁷ operations (K-13)                                                | Kiln's own whole-program check does not run         | The consumer reference (step 4 of §4) is the authority anyway |
| Parameter normalisation fills defaults                                                                | Adding `backend` would change every motion node key | B4 checks before relying on it; if so, encode `cpu` as absence explicitly |
| GPU hosts are contended                                                                               | Throughput swings about 2×                          | Paired order in one session; record co-tenants                |

## 28. Open questions

1. **Skip the host synchronisation in redaction?** Processing all 100 engine slots with a per-slot keep weight would
   remove `nonzero` and its sync, at about 100× more GPU reads. Worth a measurement once C4 has a baseline.
2. **Should FV fetch exports from Kiln instead of committing them?** Committing pins the kernels to the consumer's
   revision, which this guide relies on for identity (§23); fetching would not.
3. **A browser host for Perf Lab?** Example A's harness is the second browser measurement after Phase 6. A third
   would justify a `browser` host kind with an executor.
4. **GPU temporal OR and fill in redaction** (§21): a separate change to `video_pipeline.py`'s threading.
5. **Instrument the YOLOX element** (Part VI) and file the batch-size defect independently of Kiln.

## 29. API reference

### 29.1 Kiln authoring (`KS`)

| API                                              | Meaning                                                                | Source                         |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------ |
| `project(name)`                                  | New project builder in a script scope                                  | `KS/std/index.js:74-77`        |
| `.params(...p)` / `param.int/float/enum/bool`    | Declare parameters (sliders, buckets)                                  | `KS/std/index.js:35-73`        |
| `.program(outputsFn, inputsFn)`                  | Outputs `({inputs}, {param}) => ({name: expr})`; inputs `({param}) => ({name: k.tensor(shape)})` | `KS/std/index.js:35-73` |
| `k.tensor(shape)`                                | fp32 input (gains `{dtype: "u8"}` in task 0.2)                         | `KS/core/kiln.js:9`            |
| `N.add/sub/mul/div/max/min/gt/lt/select/abs/...` | Elementwise frontend ops (gains `N.floor` in task 0.1)                 | `KS/std/tensor.js:194-211`     |
| `N.sum/amax/mean(x, axis, keepdim)`              | Reductions with add / max                                              | `KS/std/tensor.js:194-211`     |
| `N.matmul(a, b)`, `N.linear(x, w)`               | Contractions; tiled schedules                                          | `KS/std/tensor.js:248-254`     |
| `N.transpose/reshape/slice`                      | Shape views                                                            | `KS/std/tensor.js:194-211`     |
| `T.view(x, shape, ([i, j, …]) => [ix…])`         | Arbitrary coordinate-only index map                                    | `KS/std/tensor.js:176-190`     |
| `ix.c(n)`, `ix.min`, `ix.max`; `.add .mul .div .mod` on index terms | Index expressions in script scope; `div`/`mod` floor by positive constants | `KS/core/ix.js:1-11,78-118` |

### 29.2 Kiln outputs and execution

| API                                    | Meaning                                                                                         | Source                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| `programOf(...)`                       | `{id, name, K, cuda, wgsl, expr, shape, inShapes, args, map, row, identity, bytes}`              | `KS/std/program.js:29-43`               |
| `toCuda(K)` / `toWgsl(K)`              | Kernel source; CUDA `extern "C"`, inputs `src0..`, output `dst`; WGSL bindings `0..nIn`         | `KS/std/emit.js:14-86`                  |
| `bundle(kernels, opts)`                | `kiln-bundle/1` for the CUDA runner (per kernel, seeded inputs)                                 | `KS/std/devices.js:336-344`             |
| WebGPU dispatch                        | `gx = min(grid, 65535)`, `gy = ceil(grid / 65535)`                                              | `KS/std/devices.js:139`                 |
| `checkSamples`                         | 384 sampled outputs vs reference, `rtol 2e-3, atol 2e-4`                                        | `KILN/packages/evidence/src/protocol.ts:37-60` |
| `kiln_runner.py run - --out -`         | Builds with `nvcc`, times with CUDA events, returns `kiln-results/1`                            | `KILN/runner/kiln_runner.py`            |

`kiln-program/1` (task 0.3), the format consumers load:

```json
{
  "format": "kiln-program/1",
  "name": "window-similarity",
  "codegen": "kiln-codegen/2",
  "params": { "windows": 1536, "dims": 768 },
  "inputs":  [{ "name": "x", "buffer": 0, "shape": [1536, 768], "dtype": "f32" }],
  "outputs": [{ "name": "s", "buffer": 1, "shape": [1536, 1536] }],
  "buffers": [{ "id": 0, "floats": 1179648 }, { "id": 1, "floats": 2359296 }],
  "kernels": [{ "name": "k_window_similarity__1a2b3c4d", "identity": "…", "row": "MAP=tiled,…",
                "reads": [0], "writes": 1, "grid": 2304, "block": 256, "smemBytes": 16384,
                "wgsl": "…", "cuda": "…" }]
}
```

### 29.3 Evidence and lab

| API                                          | Meaning                                                        | Source                                         |
| -------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| `pairedRatio(samples, {seed, ci})`           | Per-process medians, ratios, seeded bootstrap interval         | `KILN/packages/evidence/src/stats.ts:77-136`   |
| verdict                                      | `supported / refuted / open / unqualified`                     | `KILN/packages/evidence/src/verdict.ts:49-91`  |
| `Link {from, to, rel, evidence, method}`     | Entity edge; evidence `direct / derived / heuristic / …`       | `KILN/packages/lab/src/lang/rows.ts:27-32`     |
| `POST /api/lab/evidence`                     | Register an archive (base64 or local path)                     | `SRV/lab/routes.ts`                            |

### 29.4 Consumers

| API                                                      | Meaning                                                         | Source                                                   |
| -------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| `similarityMatrix(all, cap)`                             | Float64 cosine matrix of the newest `cap` windows               | `FV/web/live/views/similarity/model.ts:123-140`           |
| `ImplementationSpec(implementation_id, operation, version, resource, make_kernel, requirements, accepts, refusal)` | One implementation of an operation | `FV/src/factory/core/operations.py:118-128` |
| compiler `resolve`                                       | Exactly one implementation must resolve                         | `FV/src/factory/compiler/lower.py:477-506`                |
| `to_gray(rgb, width, height)`                            | cv2 grey then Pillow bicubic                                    | `FV/src/factory/kernels/motion.py:146-151`                |
| `TrtSegEngine` collect                                   | GPU filter, index-select, D2H, release, CPU loop                | `PB/services/redaction/src/trt_engine.py:705-773`         |
| `verify_redaction_identical.py emit/compare/judge`       | Black-pixel counts, noise floor, coverage-loss gate             | `PB/services/redaction/scripts/verify_redaction_identical.py:46-52,195` |
| `score_against_ground_truth.py <engine> <label>`         | Recall / F2 on fixtures                                         | `PB/services/redaction/scripts/score_against_ground_truth.py` |
| `validate_on_host.sh [--baseline REF] [--conc 1,4,8]`    | Full host acceptance with paired throughput                     | `PB/services/redaction/scripts/validate_on_host.sh:7-92`  |

## 30. File reference

| File                                                              | Why you read it                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `KS/std/emmy.js`                                                  | The pipeline of IRs and the default decide chain                    |
| `KS/std/tensor.js`, `KS/core/ix.js`, `KS/std/fns.js`              | Everything a program can say                                        |
| `KS/std/tile.js`, `KS/std/loop.js`                                | Schedules, fusion guard, Loop IR evaluator                          |
| `KS/std/emit.js`, `KS/std/program.js`, `KS/std/devices.js`        | Sources, identity, WebGPU executor, `bundle()`                      |
| `WB/presets/W-08-linear.js`, `W-12-blur.js`, `W-21-matmul-ladder.js` | Templates for contraction, stencil, pinned schedules             |
| `WB/test/paired-webgpu.mjs`, `KILN/scripts/shoot.mjs`             | Headless Chrome with WebGPU; paired measurement                     |
| `KILN/runner/kiln_runner.py`, `SRV/executors/cuda-runner.ts`      | The CUDA path that has never run                                    |
| `LAB/src/presets/programs/local-sampler.lab.js`, `LAB/src/lang/build.ts` | How an experiment becomes a spec and a capture               |
| `LAB/workloads/perf_lab_dino/run.py`, `LAB/server/runner.ts:284-292` | How a second workload package is added                          |
| `FV/web/live/views/similarity/model.ts`, `EmbeddingSimilarity.tsx` | Example A today                                                    |
| `FV/src/factory/kernels/motion.py`, `catalog_w8c.py`, `compiler/motion.py`, `compiler/lower.py` | Example B today              |
| `FV/test/factory_tests/test_w8c_motion_points.py`                 | Motion tests that must pass on both backends                        |
| `PB/services/redaction/src/trt_engine.py`, `seg_engine.py`, `video_pipeline.py` | Example C today                                        |
| `PB/docs/vision/redaction-performance.md`                         | Every redaction number, and the levers already rejected            |
| `PB/services/stream-engine/src/pipeline/gstyoloxinfer.cpp`        | Part VI                                                             |
| `T2/sources/01..03`                                               | The research notes with every `path:line`                           |
