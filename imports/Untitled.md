# Kiln Workbench × Perf Lab (ML-PERF-001)

Oct 19, 2026 · @Manuel Odendahl

The two projects are mirror images. Kiln generates kernels from a model of the computation and predicts their cost; Perf Lab observes code that already exists and decides what the measurements are allowed to say. Kiln is strong on *why* and *what if*, weak on measurement discipline. Perf Lab is strong on evidence, provenance and statistics, but has no model of the computation and, so far, no GPU measurements. Joined, they close the loop from a slow request in production to a qualified, faster kernel.

## At a glance

&#91;embedded content: The optimization loop · 8 stages, who owns each\]

Kiln owns prediction and generation, Perf Lab owns planning and qualification, and the last three stages need Kiln's engines run under Perf Lab's rules. Each decision refits the model and points at the next bottleneck.

## What ML-PERF-001 is

ML-PERF-001 is a one-day ticket (2026-10-12), written by a coding agent with one engineer. Its goal: explain how Playback's Grounding DINO detector and its EmbeddingGemma 2 service spend time and memory, down to the operation and source line responsible. It has two layers: a design package and a working prototype called **Perf Lab**.

### The subject

- **Grounding DINO, PR 1005.** CUDA-graph replay plus a Triton fusion of sampling and reduction in multi-scale deformable attention. The fusion avoids an intermediate of 8 · 32 · 12,240 · 16 fp32 values: 200 MB written and read back per call.
- **EmbeddingGemma 2, PR 1008.** A two-entry CUDA-graph cache and a Triton RMSNorm kernel that reproduces ATen's arithmetic order.
- **Hardware.** A DGX Spark (GB10, Grace CPU, unified memory) and an RTX PRO 6000 Blackwell. Both appear only as synthetic hosts in the prototype.
- **Audience.** An intern learning what a request, a tensor and a kernel are; a performance engineer testing a hypothesis; a reviewer checking whether a comparison is valid.

### The design package

- **An intern guide** of about 10,000 words. It walks from the request path to kernels, and works through the maths on small examples: bilinear weights, RMSNorm, tiling, arithmetic intensity, roofline, Little's law.
- **A methodology** with separate collection modes, each with its own run IDs: timing, Nsight Systems timelines with NVTX ranges, torch.profiler attribution, narrow Nsight Compute passes on launches picked from a prior trace, perf, memory and Compute Sanitizer.
- **An evidence contract** for UX designers, a language specification, a UI design and a backend design.

### The lab language

A lab is a plain JavaScript program of fluent builders that returns `lab(…)`. It compiles to an IR, but an IR of *experiments*, not of computation: experiments, arms, captures, imports, derived tables, parameters, hypotheses, boards and views. Passes run in order: expand and resolve, trace, validate, lower, plan.

| Concept | What it does |
| --- | --- |
| Experiment contract | Question, workload, timed boundary, host, baseline and candidate arms, cache state, warmup, quality gate, repetitions and estimator |
| Captures | timing, trace, kernels, memory, cpu, sanitizer; each lowers to a JSON spec for a Python runner |
| Content addressing | Each capture's lowered spec is hashed, with the workload source's hash folded in. Editing a script invalidates its runs; unchanged captures are reused. |
| Lambda phases | Set by the slot a lambda sits in: plan (baked into the spec), data (over imported rows), view (live), handler, effect, eval |
| Parameter binding | Inferred from which phase reads the parameter. A view change re-renders, a data change recomputes, a plan change becomes a pending plan a person approves. |
| Queries | Lazy and composable over entities (requests, spans, kernels, tensors, allocations) and typed links (contains, launches, compiled\_from, implements) |
| Hypotheses | Claim, prediction over a derived table, supporting evidence, alternatives, scope; verdict computed live: supported, refuted, open or unqualified |
| Boards | Grids of views: table, chart, timeline, mirror, kernel card, ledger, stepper, route, hypothesis card and more |

### The evidence contract

This is the most original part. Every value carries one of five provenance classes: observed, derived, heuristic, illustrative or unknown.

- **Missing is never zero.** A missing value compares as NaN, so a predicate over it is false and the hypothesis stays *open*.
- **Observed values are sealed.** A Proxy throws a `ProvenanceError` on writes; the assistant cannot overwrite a measurement.
- **Validity comes from execution.** A run is invalid on a non-zero exit, a failed quality gate, or an activation miss: the compiled or fused path silently fell back.
- **No shared clock across runs.** Comparisons are structural matches, labelled as such.
- **Statistics pair processes, not requests.** The estimator is a paired median ratio with a 2,000-draw bootstrap over processes.
- **Coverage is explicit.** Lost trace intervals, missing source, unsupported counters and missing links are recorded per run.

### The system

- **Browser:** React and Redux. The language runs here in milliseconds, with an IDE pane, a board sheet, a filmstrip of boards and an inspector (lab, graph, plan, runs, inspect, agent).
- **Server:** Hono with SQLite (programs, content-addressed artifacts, runs, jobs, transcripts, token accounting). It runs one Python process per repetition, interleaves arms in a seeded paired order, imports results, and streams events over SSE.
- **Importers:** torch.profiler traces, allocator events and rusage, plus PR 1005's own benchmark JSON. Evidence archives produced elsewhere are registered by SHA-256.
- **Assistant:** an LLM writes JavaScript against a handle API, run in the browser under checkpoint and rollback, with at most four executions per turn. Jobs it proposes need a person's approval and fit a 30 GPU-minute budget.

### What was actually measured

Only CPU runs on an Apple M1 Pro. No Nsight Systems, Nsight Compute or perf run was made; every DGX and RTX board uses deterministic synthetic data, labelled as such.

| Measurement (local sampler, CPU, fp32) | Result |
| --- | --- |
| TorchInductor-compiled sampler vs eager, 2,048 queries | 2.58× slower (95% CI 2.18–2.69), paired over processes |
| Same, 1,024 queries | 2.29× slower (1.88–2.52) |
| First-request compile | 4.9 s with an empty cache, about 0.9 s with a reused one |
| Hypothesis "compiling removes the intermediate" | Refuted: the compiled arm still allocates an intermediate-sized block |

The archived reports hold the real GPU results: PR 1005 took DGX median latency from 77.2 to 53.8 ms, and `fused_sampling` accounted for 12.2% of CUDA time. The archive is also incomplete: two Redux files (`features/build/`) are missing, so the prototype does not build as shipped.

## Side by side

Both are browser workbenches driven by a JavaScript DSL that compiles to an inspectable IR, with an LLM agent that writes code against a handle API. That is where the resemblance ends.

| Dimension | Kiln Workbench | Perf Lab (ML-PERF-001) |
| --- | --- | --- |
| Question it answers | What code should run, and how fast should it be? | What did the existing code actually do, and is the claim true? |
| The program is | The computation (a PyTorch-style model) and the compiler (dialects, rules, passes) | The experiment (arms, captures, gates, estimators) and its boards |
| The IR is of | Operations: torch → tensor → loop → tile → kernel → gpu | Experiments, captures, derived tables, parameters and views |
| Kernels are | Generated, with every rewrite and fork traceable | Observed entities imported from profilers |
| Where numbers come from | A SIMT simulator, an analytic cost model, WebGPU, a CUDA runner | Python processes on real hosts, or imported evidence archives |
| Model of performance | Roofline + occupancy + waves; exact bank conflicts; cost model ranks schedules | None by design; device peaks are NaN "so a roofline must not invent one" |
| Trust in a number | Implicit: a `kind` field (simulated or measured) | Explicit: five provenance classes, sealed observed values, missing ≠ 0 |
| Repetitions and statistics | Median of 50 CUDA events; no CI; evidence = fastest row | Paired, interleaved processes; bootstrap CI over processes; exclusions listed |
| Validity | Kernel outputs checked against the Loop IR; end-to-end check | Quality gate, activation check, exit status; invalid runs kept and labelled |
| Parameters | Sliders and knobs; phase "build" or "run" | Binding inferred (view, data, plan); plan changes need approval |
| Teaching | 25 presets with notes, KaTeX, lab: links that drive the workbench | Intern guide; illustrative steppers stamped ILLUSTRATIVE; 11 presets |
| Agent | One eval tool, snapshots and revert, notes editing | Handle API, checkpoint and rollback, 4 executions a turn, human-approved jobs |
| Persistence | localStorage; evidence keyed by device, kernel identity, schedule | SQLite: programs, artifacts by hash, runs, jobs, transcripts, tokens |
| Visualizations | IR text and graph, trace diffs, kernels, roofline, knobs, tune | Timeline, mirror, kernel card, ledger, route, stepper, hypothesis, detections |
| Real-hardware status | WebGPU verified; CUDA compiled with NVRTC, never timed on a GPU | CPU only; GPU boards synthetic; nsys and ncu designed, not built |

## How they complement each other

Each project stops exactly where the other one starts. Kiln can say what a kernel should cost and why, but cannot say whether a measured speedup is real. Perf Lab can say whether it is real, but not what it should have been.

**What Kiln lacks, Perf Lab has.**

- **Measurement discipline.** Kiln's evidence store keeps one number per (device, kernel, schedule): no repetitions, no confidence interval, no manifest. A noisy WebGPU timing can win a schedule fork on luck. Perf Lab's paired, interleaved, process-level estimator is the fix.
- **Provenance.** Kiln shows a simulated time and a WebGPU time in the same style, side by side. Perf Lab would refuse to: one is heuristic, the other observed.
- **Validity beyond correctness.** Kiln checks outputs, but not that what ran is what was claimed. Perf Lab's activation check (did the fused path really execute?) maps directly onto pins and fallbacks.
- **Production context.** Kiln's programs are synthetic. Perf Lab starts from a slow request in a real service and walks down to the kernel.

**What Perf Lab lacks, Kiln has.**

- **A model to compare against.** Perf Lab deliberately draws no roofline. Once its Nsight Compute importer exists, it can report how many bytes `fused_sampling` read, but not whether that is good. Kiln's cost model gives the bound and the distance to it.
- **Counterfactuals by construction.** Perf Lab can only test variants someone already wrote (a PR, a compile flag). Kiln generates them: pin a schedule, toggle a fusion, add a pass, and the variant exists.
- **Explanations of compiler decisions.** Perf Lab's measured sampler shows TorchInductor kept the intermediate and ran 2.58× slower, but it can only observe that. Kiln's trace shows each declined fusion with its reason ("blowup: fused work 10.5 G > unfused 7.0 G").
- **Hardware without hardware.** An intern without a GPU can run Kiln's simulator or WebGPU. Perf Lab's GPU boards are synthetic until the remote executor exists.

**A worked example: PR 1005's fusion.** Perf Lab already derives the logical traffic of the intermediate: 200 MB written and read back per call. Kiln would turn that into a prediction: on GB10's 273 GB/s, that traffic alone costs about 1.5 ms a call. Nsight Compute's DRAM bytes would then be the observation, and the gap between the three numbers (logical, predicted, observed) is the lesson. Kiln cannot express this kernel yet: bilinear sampling needs data-dependent gathers, which its frontend lacks.

## What to adapt into Kiln

Thirteen ideas, ordered by value per effort. The first five fix Kiln's weakest point, how much a number can be trusted, and each takes days, not weeks.

| When | Idea | Where it is in Perf Lab | What it becomes in Kiln |
| --- | --- | --- | --- |
| Now | Provenance on every number | Five classes, glyphs, a title block naming the data's origin (`values.ts`, `BoardSheet.tsx`) | Every metric tagged *model*, *simulated* or *measured*; a glyph in Perf and Knobs; a line such as "SIMULATED · RTX 5090 model" on each view; the agent and the notes must say which they cite |
| Now | Repetitions and confidence intervals | Paired median ratio, bootstrap over processes (`stats.ts`) | Keep every repetition with its manifest. The evidence policy switches a schedule only when the CIs separate; otherwise it reports "by evidence, within noise" |
| Now | Run identity by content hash | Spec hash with the workload source folded in; the server re-hashes and rejects forgeries | Hash the generated kernel source, launch configuration, device, driver or adapter and input seed. A changed codegen invalidates old evidence instead of silently reusing it |
| Now | Hypotheses with live verdicts | `.hypothesis()`: claim, prediction, support, alternatives, scope; supported, refuted, open or unqualified | A `> **Hypothesis**` block in notes with a predicate over measurement records. Exercises become predictions the reader writes before measuring, judged by their own runs |
| Now | Activation checks | `expect(activation, { onMiss: 'invalid' })`, the `no-activation-rule` lint | Record the schedule that actually materialized. A pin that fell back, or a WebGPU run without timestamp queries, marks the measurement invalid or partial |
| Next | Cost badges on parameters, and pending plans | Binding inferred from the reading phase; plan changes wait for approval | Each slider and knob shows what a change costs: re-render, recompile (ms), simulate (s), or real GPU. Real-GPU runs, including the agent's, become proposed jobs with an estimate |
| Next | Paired, interleaved A/B runs | Seeded arm order per repetition, one fresh process each (`runner.ts`) | The CUDA runner and WebGPU alternate variants per repetition, in a fresh context, and report a ratio with its CI |
| Next | Nsight Compute import, with its caveats | Designed collectors; the `counters-not-latency` lint | The runner already calls ncu: import its counters as observed, beside the simulator's counts and the model's, so W-25's model-vs-measurement score runs on real counters |
| Next | Structural comparison of two compiles | `compare()` and the Mirror view, captioned "separate clocks" | Match kernels between two compiles (fusion on and off, two devices) by origin; show per-kernel deltas and the kernels that exist on one side only |
| Next | The route view | Hop by hop through typed links, stopping where evidence ends | From a frontend op through each IR to its CUDA lines and counters, one hop per pass, naming the rule behind each hop |
| Later | A timeline | Lanes per stream; sub-pixel events merged, keeping count and longest member | A per-program kernel timeline with launch gaps and waves, for multi-kernel programs such as W-24 |
| Later | A persistent store and job log | SQLite: artifacts by hash, runs, jobs, transcripts, token accounting | An optional local store (the runner already serves the page) for evidence, jobs and agent transcripts, or the artifact database for shared evidence |
| Later | Agent hygiene | Four executions a turn, invented observations stripped, tokens recorded, a probe for a dropped system role | The same limits and accounting for Kiln's agent, plus a rule that it never states a real-GPU speedup from simulated numbers |

## What Perf Lab could take from Kiln

- **A labelled model, not no model.** Perf Lab refuses to draw a roofline without measured peaks, which is right for observed data. But a model tagged *heuristic* is what turns "9 ms" into "9 ms, 3× above the memory bound". Kiln's `estimate` and per-device specs could supply it.
- **Variants generated, not only found.** Perf Lab's arms are git revisions and switches. A kernel lab beside it could generate the variant a hypothesis needs (fused, tiled, staged) and hand it back as a new arm.
- **Compiler explanations.** When Inductor keeps an intermediate, the useful question is which fusion it declined and why. Kiln's trace of declined rewrites, with reasons, is the model for that view; Inductor's own logs could feed it.
- **Tutorials you do, not read.** Perf Lab's steppers are illustrative. Kiln's notes link to actions (set a slider, pin a schedule, measure), and its simulator can step through a real warp's accesses, observed in simulation rather than illustrated.
- **A GPU for everyone.** The intern guide assumes access to a DGX. WebGPU and the simulator let every reader run the kernel-level exercises on their own laptop.

## Ideas for a GPU optimization and compiler workbench suite

The suite worth building treats every kernel as a claim with three numbers: what the model predicts, what the simulator counts, and what the hardware does. The gaps between them are the curriculum.

1. **Production trace → kernel lab → production.** Import a profiler trace from a real service, select the hot kernel, and lift its op into a compiler project. Optimize it there with forks and tuning, export CUDA or Triton, then re-qualify it as a new arm of a paired experiment, with a quality gate and an activation check. PR 1005's sampling fusion is the first candidate.
2. **Predict before you measure.** Each tutorial step asks for a prediction (time, bound, bytes) before the Measure link works. The workbench scores it against the measurement and keeps a calibration record per learner; a course's grade is that calibration.
3. **Calibrate the model continuously.** Every qualified measurement refits the cost model's per-device efficiency curves, such as bandwidth versus occupancy and L2 hit rates. Report rank correlation and regret per device over time: W-25 at scale. A learned residual is allowed, labelled heuristic.
4. **Tune with statistics.** Race schedules: stop measuring an option once its confidence interval rules it out, and spend measurements where the model is least certain. Kiln's search plus Perf Lab's estimator.
5. **One entity graph for all kernels.** Generated, simulated and observed kernels in one graph, linked by `compiled_from`, `corresponds_to` and `implements`, each link with its evidence class. The route view then runs from a slow request down to the rewrite that made its kernel.
6. **Tensor cores and precision.** Neither project models what GB10, RTX PRO 6000 or H100 are built for: bf16 and fp8 on tensor cores. Add half-precision types, MMA tiles and per-dtype numerics checks; Perf Lab's quality gates already carry per-dtype tolerances.
7. **Clocks and state as variables.** Record or lock GPU clocks, power and temperature, and flush L2 between repetitions when the question needs a cold cache. Perf Lab's `matrices` preset shows the collector pattern; Kiln's runner should write it into every manifest.
8. **Shared, qualified evidence.** Content-addressed kernel identity plus manifests make runs from many people's GPUs comparable. A table per kernel and device, every row qualified, shows how a schedule ports across hardware.
9. **Course mode.** Notes, hypotheses and checks make auto-graded labs that run in a browser, in the spirit of MIT 6.S894's matmul labs. The CUDA runner covers the last step on real hardware.

## Caveats and sources

- **Nothing in the ML-PERF-001 archive was run.** It was read, not built: two missing Redux files keep the prototype from compiling, and no SQLite database or run data was included. Its numbers come from its diaries and archived reports.
- **Kiln's GPU numbers are simulated.** WebGPU runs were verified for correctness on a software adapter, and the CUDA kernels compiled with NVRTC, but no kernel was timed on a physical NVIDIA GPU.
- **Neither project has run on GB10.** The DGX figures quoted here are PR 1005's own historical results.

Key files in the archive, under `ttmp/2026/10/12/ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/`:

- `design/01-intern-guide-to-reproducible-profiling-and-execution-visualization.md`: the intern guide and methodology
- `design/02-lab-language-specification.md`: the lab language
- `reference/02-visualization-capabilities-and-evidence-contract.md`: the evidence contract
- `design/04-perf-lab-backend-end-to-end-design.md`, section 15: what was built and measured
- `reference/03-workbench-prototype-diary.md` and `reference/04-perf-lab-backend-implementation-diary.md`: the build diaries
- `experiments/lab-workbench/src/lang/values.ts`, `stats.ts`, `build.ts`: provenance, the estimator and the passes
