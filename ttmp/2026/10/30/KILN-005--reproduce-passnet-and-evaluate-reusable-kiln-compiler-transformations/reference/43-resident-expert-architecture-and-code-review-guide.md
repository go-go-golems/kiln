---
Title: Resident expert architecture and code review guide
Ticket: KILN-005
Status: active
Topics: [kiln, passnet, compiler-optimization]
DocType: reference
Intent: review
Owners: []
RelatedFiles: [integrations/passnet/fx_import.py, integrations/passnet/corpus.py, packages/kiln/src/std/tensor.js, packages/kiln/src/std/loop.js, integrations/passnet/transformation_program.mjs]
ExternalSources: []
Summary: Self-contained conceptual map, review order, evidence boundaries and architecture questions for the Kiln–PassNet integration
---

# Resident expert architecture and code review guide

## Purpose and review boundary

This guide is for an independent reviewer assessing the architecture, code structure, semantic contracts, and opportunities to consolidate the Kiln–PassNet research integration. It describes the current work as of the typed-reference-storage checkpoint after commit `45e209d`; the exact review commit should be taken from `git rev-parse HEAD` when the handoff commit is made. The guide is an index into code and evidence, not a claim that the full PassNet reproduction or 200-task support is finished.

The research question is whether a model can propose **reusable changes to Kiln's compiler** that improve held-out PassBench task scores, compared with asking it to write one specialized replacement implementation per task. PassNet supplies the graphs, pass-matching interface, numerical checker and scorer. Kiln supplies the compiler IRs, transformations, scheduling and CUDA code. The integration retains the original evaluator and introduces a Python/JavaScript boundary. The broader goal is explicit outcomes for all 200 tasks and 2,060 graphs, with fully correct and scored tasks reported separately.

### Current evidence, stated precisely

| Population or experiment | Current claim | Evidence to inspect |
|---|---|---|
| Corpus | 200 tasks, 2,060 graphs | `sources/evaluation-inventory.json`, pinned dataset and source receipts |
| Latest local import census | 131 complete tasks; 1,668 imported graphs | `sources/input-mutation-wave-import-v1.json`, `sources/current-capability-wave-frontier-v1.json` |
| Historical external acceptance | 53 complete tasks and 505 graph results **across compiler snapshots** | `sources/kiln-coverage.json`; not a current uniform result |
| Frozen uniform qualification | 111 complete importable tasks, 1,514 graph variants, in progress on bling | [uniform qualification protocol](36-uniform-importable-task-qualification.md) and `sources/uniform-importable-qualification-v1/` |
| Fixed transformation comparison | 92/92 correct in both arms; 11 transfer-family mean task score 0.848880 baseline versus 0.822873 candidate | [paired result](35-fixed-transformation-program-passbench-result.md) and `sources/fixed-policy-passbench-v1/comparison.json` |
| Typed-value work at this handoff | Exact reference storage and views only; no typed CUDA or PassBench acceptance | Changed `util.js`, `tensor.js`, `index.js`; `typed-reference-storage.mjs`; [typed design](../design-doc/21-typed-values-and-data-dependent-indexing.md) |

The uniform qualification has three serial bands: ordinary56, large2 and regression53. At the latest observed remote checkpoint, ordinary was terminal with56 task records, large was running with one task record, regression had not started, and task73 was evaluating. Two dependent queues will then run scalar/layout, stack/unbind and guarded input-mutation cohorts. These source snapshots differ. **Do not add their counts to historical acceptance**; audit each band's terminal manifest and numerical results first. GPU activity is owned by named tmux sessions on `manuel@bling` (`HostKeyAlias=bling.local`).

## Concepts needed to read the system

**Task and graph.** A PassBench task is a family of FX computational graphs with a shared operator pattern and multiple shapes/dtypes. Complete-task correctness requires every graph variant to match once, execute and pass the original numerical checker. An imported or locally compiled graph is an earlier evidence level. The 200-task goal is a corpus outcome goal, not a requirement that every task be optimized profitably.

**Pass replacement.** PassNet asks for a pass `π=(M,R)`: a matcher `M` identifies an FX subgraph and replacement `R` computes its outputs. In the current integration, PassBench owns matching; `generate_pass.py` creates the expected Python `pattern`, `replacement_args` and `replacement_func` functions. The replacement calls a Kiln-compiled CUDA program through PyTorch. FX matching argument normalization is an integration modification, so its scores are labeled as a modified protocol rather than untouched paper reproduction.

**Compiler dialects.** Kiln's standard pipeline in `packages/kiln/src/std/emmy.js` progresses through `torch`/`nn`, `tensor`, `loop`, `tile`, `kernel` and `gpu` IR. `nn` represents source-level mathematical operations. `tensor` contains elementwise, reductions and index-map views. `loop` combines data dependencies into kernel expressions and loop nests; fusion can inline a producer expression into selected consumers. `tile` chooses a mapping to GPU threads/blocks; `kernel` spells out loads, stores, registers and shared memory; `gpu` holds emitted CUDA/WGSL sources. The Python importer generates a Kiln project script that enters this pipeline. It does not itself generate CUDA.

**Program artifact and dispatch.** `scripts/kiln-export.mjs` compiles a project into a `kiln-program/1` artifact with kernels, buffers, launch order and typed input/output descriptions. `runtime/python/kiln_launch.py` compiles/launches CUDA on a caller-provided stream and accepts external tensor pointers. `integrations/passnet/runtime.py` checks PyTorch shapes/dtypes and supplies pointers/output/scratch storage. `dispatch.py` selects the graph specialization and reconstructs source output structure, including the guarded input-mutation copyback and returned alias identity.

**Compiler strategy versus specialized kernel.** A transformation program is a validated `kiln-transformation-program/1` artifact applied to the standard pipeline. A reusable strategy must change the compiler's decisions on multiple task families, remain legal, and improve held-out error-aware score. A fast kernel for one graph is a useful result, but does not establish reusable compiler improvement. The fixed global-fusion result is a measured negative transfer example.

**Numerical and performance evidence.** The external original PassBench numerical checker at `t=-5` is the current acceptance gate. Some exploratory runs explicitly bypass Kiln's internal synthetic reference check for both comparison arms; they still run the original external checker. The official task scorer penalizes incorrect graphs. GPU-only and end-to-end timings answer different questions because Python dispatch, allocation and launch costs matter for short kernels.

```mermaid
flowchart LR
  A[PassNet task and source FX graphs] --> B[FX trace and metadata export]
  B --> C[Kiln FX importer]
  C --> D[nn and tensor IR]
  D --> E[loop fusion and transformation program]
  E --> F[tile, kernel and GPU IR]
  F --> G[kiln-program artifact and CUDA]
  G --> H[PyTorch dispatcher and CUDA launcher]
  H --> I[Original PassBench matcher, checker and scorer]
  I --> J[Task-family evidence and agent feedback]
```

## Code map and suggested reading order

Read the narrow end-to-end path first, then inspect the shared compiler internals and agent layer. Paths below are repository-root relative; the ticket lives under `ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/`.

| Order | File and symbols | Responsibility and questions |
|---:|---|---|
| 1 | `integrations/passnet/corpus.py`: `translate_graph`, `export_task`, `compile_task` | Loads materialized PassNet graphs, traces/exports each variant, writes Kiln scripts, and invokes the shared export CLI. Check source input order, task membership, import diagnostics, and compiler option propagation. |
| 2 | `integrations/passnet/fx_trace.py`: `MutationTracer`, `trace_module`; `fx_export.py`: `encode`, `export_graph` | Preserves in-place operator identity in FX and emits the `kiln-fx/1` typed graph schema after metadata propagation. Check what is source structure versus inferred metadata and where unsupported values fail. |
| 3 | `integrations/passnet/fx_import.py`: `import_graph` | Main source-to-Kiln translation, output structure and mutation-effect metadata. Review its branching complexity, typed/alias contracts, and opportunities for a declarative operator registry without hiding source-specific semantics. |
| 4 | `integrations/passnet/fx_indexing.py`, `fx_layout.py`, `fx_pooling.py`, `fx_max_pooling.py`, `fx_linalg.py`, `fx_norm_ops.py`, `fx_scalar_ops.py` | Focused shape/operation lowerings called by `fx_import.py`. Look for duplicated shape/dtype validation or inconsistent error behavior. |
| 5 | `packages/kiln/src/std/emmy.js`: `pipeline`; `tensor.js`: `nn`, `tensor`, `N`, decomposition and optimization rules | Standard compiler pipeline and frontend semantics. Confirm whether FX-specific requirements belong here, in a typed generic IR, or only at the bridge. |
| 6 | `packages/kiln/src/std/loop.js`: `E`, `schedule`, `liftEw`, `liftReduce`, `liftView`, `createFusionRule`, `inlineInto`; `fusion.js` | Loop expression representation, reduction scheduling and selective fusion. Examine legality, work estimates, duplication accounting, and how future data-dependent indices should appear. |
| 7 | `packages/kiln/src/std/tile.js`: schedule parameters and `scheduleRule`; `kernel.js`: `KB`, `materialize`; `emit.js`: `toCuda`, `toWgsl`, `toSim` | Mapping decisions, concrete GPU operations and source generation. Review typed-register assumptions, index bounds, shared memory, schedule/evidence identity and target cost model. |
| 8 | `packages/kiln/src/std/export.js`: `exportProgram`; `scripts/kiln-export.mjs`: `compileOne` | Artifact schema, buffer sizes, kernel identities, source hashes, optimization-program application and optional internal reference check. |
| 9 | `integrations/passnet/generate_pass.py`: `extract_pattern`, `generate`; `dispatch.py`: `CorpusDispatch`, `restore_outputs`; `runtime.py`: `TorchProgram`; `runtime/python/kiln_launch.py`: `CudaProgram.launch` | PassBench matcher interface, specialization, PyTorch pointer ownership, stream ordering, scratch allocation, input writeback and alias reconstruction. |
| 10 | `integrations/passnet/evaluate_tasks.py`, `run_task.py`, `score_task.py`, `summarize_task_run.py` | Frozen task execution through original PassBench code and audit of membership, matches, numerical result and score. Separate runner failures from compiler failures. |
| 11 | `integrations/passnet/transformation_program.mjs`, `optimization_artifact.mjs`, `run_pi_policy_agent.mjs`, `run_native_policy_agent.py` | Trusted compiler-policy grammar, pipeline application, Pi and R2E-derived agent proposal loops. Review whether artifacts are expressive enough for new passes and whether evaluation budgets remain comparable. |

The existing intern guide gives the broad API and system walkthrough: [PassNet reproduction and Kiln integration intern guide](../design-doc/01-passnet-reproduction-and-kiln-integration-intern-guide.md). Its historical milestone sections contain superseded counts; use the current census and this guide for present-state numbers.

## Documentation and diary map

| Read when reviewing… | Documentation |
|---|---|
| Ticket scope and deliverables | [ticket index](../index.md), [project phases](03-project-roadmap.md), [current capability waves](42-capability-waves-for-coverage-and-optimization-breadth.md) |
| Chronology, decisions, failures and source provenance | [diary volume 1](01-detailed-investigation-diary.md), [diary volume 2](24-implementation-diary-volume-2-pi-agents-and-compiler-optimization.md), especially Steps 228–233 |
| Architectural reassessment and research direction | [project reassessment](22-project-reassessment-from-passnet-integration-to-reusable-compiler-optimization.md), [meta-compiler study assessment](../design-doc/20-meta-compiler-study-assessment-and-optimization-artifact-implementation-priorities.md), `sources/kiln-meta-compiler-study.md` |
| PassBench protocol and FX matcher changes | [FX pattern canonicalization](28-fx-pattern-canonicalization-and-qualification-design.md), [uniform qualification](36-uniform-importable-task-qualification.md), [original evaluator milestone](29-operator-coverage-and-fx-matching-milestone.md) |
| Compiler optimization artifact and measured transfer | [unified transformation export](32-unified-transformation-program-export.md), [fixed comparison protocol](33-fixed-transformation-program-passbench-study.md), [fixed comparison result](35-fixed-transformation-program-passbench-result.md) |
| Fusion legality and strategy design | [selective-consumer fusion](../design-doc/11-selective-consumer-fusion-and-retained-producer-cost-contracts.md), [whole-region fusion planning](../design-doc/12-whole-region-fusion-planning-under-an-additive-cost-model.md) |
| Numerics and compiler identity | [contraction/rounding contract](../design-doc/09-numerical-contracts-contraction-policy-and-reusable-arithmetic-transformations.md), [canonical reduction emission](../design-doc/13-canonical-reduction-emission-and-evidence-identity-contract.md), [convolution precision issue](../design-doc/19-convolution-accumulation-precision-and-protected-export-failure.md) |
| Recent coverage additions | [scalar/layout batch](37-scalar-layout-batch-and-typed-frontier.md), [stack/unbind batch](39-stack-unbind-structural-batch.md), [input mutation design](40-input-mutation-functionalization-design.md), [mutation local result](41-input-mutation-wave-local-result.md) |
| Typed indexing work in progress | [typed-value and indirect-read design](../design-doc/21-typed-values-and-data-dependent-indexing.md), `sources/typed-frontier-source-ops-v1.json`, `sources/pytorch-2-9-typed-index-docs-archive-v1.json` |

The pinned PassNet paper is `sources/paper.pdf` with extracted text in `sources/paper.txt`. `sources/dataset-revision.json`, `sources/dataset-download-receipt.json`, `sources/evaluation-inventory.json` and the materialized `sources/upstream/` checkout establish source identity and corpus membership. PassNet is pinned to `61c64709f6d324216ae8252cec3cdc35b2dd5da5`; the dataset revision is `4f7dd9211178327c2718f1b828d83ea126186f9e`. The large upstream/data trees may be untracked or stored as archived evidence, so inspect the receipts before assuming every raw source belongs in Git.

## Handoff code checkpoint: exact typed reference storage

The newest code batch touches `packages/kiln/src/core/util.js` (`Tensor`, `compare`), `packages/kiln/src/std/tensor.js` (`viewRef`, `tensor.const` inference), `packages/kiln/src/std/index.js` (`Project.inputsFor`) and `packages/kiln/test/typed-reference-storage.mjs`. It uses `BigInt64Array` for exact `i64`, `Int32Array` for `i32`, and `Uint8Array` for Boolean/U8 reference tensors. A value above 2^53 is checked through input copying and a transposed view. The existing f16/bf16 reference storage remains Float32Array with explicit rounding.

This is intentionally an **incomplete typed compiler capability**. `fx_import.py` still rejects integer/Boolean placeholders. Loop IR and Kernel IR still assume float scalar values and static coordinate expressions; CUDA emission still declares float temporaries and does not support `i64`/`bool` buffers. Data-dependent gather, cumsum, mask operations and original PassBench acceptance are pending. The reviewer should judge the checkpoint as reference substrate and challenge its representation before broader propagation.

Validation: the three targeted Node tests for typed storage and existing dtype behavior passed, and `node scripts/run-node-tests.mjs packages/kiln/test` passed all41 scripts with Node26.13.0 when process spawning was permitted. `pnpm --filter @kiln/kiln test` could not bootstrap its pinned pnpm binary inside the filesystem sandbox; the direct runner is the same underlying package test script. The first new test had a graph-scope setup error, fixed before the all41 pass. [Diary Step 233](24-implementation-diary-volume-2-pi-agents-and-compiler-optimization.md) records the exact failures and commands.

## Architecture questions for the reviewer

1. **IR boundary for typed values and indirect reads.** Should integer tensor values and runtime index expressions enter the existing Loop IR expression grammar, or should a smaller generic typed scalar layer sit between tensor and Loop IR? Identify where exact `i64` arithmetic, bounds, masks and scans belong so they can be optimized and emitted without a second GPU compiler. Use [design 21](../design-doc/21-typed-values-and-data-dependent-indexing.md) and the `E`/`KB`/`toCuda` path.
2. **Importer structure.** `fx_import.import_graph` holds source normalization, shape checks, operation routing and mutation/output reconstruction. Recommend a concrete partition that preserves one semantic authority per operation and avoids an unreviewable registry of ad hoc overloads. Check existing `fx_*` modules for duplicated contracts.
3. **Effect and alias model.** The guarded single-use input mutation path emits hidden outputs, copies back on the current PyTorch stream and restores returned input identity. Evaluate legality for repeated uses, overlapping views and compiler fusion across effects. Review `fx_import.py`, `dispatch.py` and [design 40](40-input-mutation-functionalization-design.md).
4. **Reference versus external semantics.** Kiln's synthetic reference evaluator, CUDA lowering and original PassBench checker sometimes disagree for low precision/convolution. Assess which transformations require exact reference semantics before use, where source numerical tolerance belongs, and whether the current optional internal-check bypass creates review risk. Read the numerical and task195 documents before interpreting a green compile as correctness.
5. **Optimization representation and cost model.** Review `createFusionRule`, `fusion.js`, `tile.js`, `transformation_program.mjs` and agent proposal grammar. Can the current action/program representation express pooling, indexing and reduction strategies without growing duplicated pipelines? Which policy features have stable meaning across shapes and hardware? The fixed global-fusion transfer loss is an important control.
6. **Benchmark boundary and evidence.** Review exact FX matching modification, task-family membership audit, score computation, original-vs-modified protocol labels, current historical coverage ledger and staged queue scripts. Could orchestration and evidence be simplified while retaining the information necessary for scientific comparison? Avoid deleting raw receipts until source/result identity is preserved.
7. **Runtime cost and target model.** CUDA is compiled for the actual GB10 device, while scheduler decisions use an A100 proxy. Assess whether this target mismatch or Python allocation/launch overhead dominates the strategies under study, and suggest a measured separation of scheduling effects from dispatch effects.

The requested review output should distinguish: (a) a concrete correctness or reproducibility defect, (b) a structural problem that will worsen with broader operator coverage, and (c) an optional cleanup. For proposed refactors, name the owning module and a migration boundary so work can proceed without invalidating in-flight frozen experiments.

## Reproduction and inspection commands

Run commands from the `worktrees/passnet` worktree. The user's local Node version is available through `nvm use v26`.

```bash
git rev-parse HEAD
git status --short
nvm use v26
node scripts/run-node-tests.mjs packages/kiln/test
python3 -m unittest discover -s integrations/passnet -p 'test_*.py'
python3 ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/scripts/652-rank-current-capability-waves.py
python3 ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/scripts/653-audit-typed-frontier-source-ops.py
```

The Node package runner passed at this handoff; the full Python discovery command is a reviewer option, **not claimed as run here**. GPU task qualification uses the frozen staged plans and pinned Docker image on bling. Do not launch an overlapping timed run while `kiln-uniform-importable-v1`, `kiln-breadth-replays-v1` or `kiln-input-mutation-wave-v1` owns the GPU. Check their tmux sessions and terminal `run.json` records, then use `integrations/passnet/summarize_task_run.py` on complete bands. The remote source snapshot and plan hashes live in their `sources/*-staging*/` receipts.

## Review priorities and next handoff decision

First inspect the FX importer → shared compiler → runtime → PassBench score path. Then inspect typed-value and effect boundaries, because those are the next large capabilities and the most likely sources of architectural sprawl. Finally assess the optimization-program/agent boundary against the measured fixed-policy transfer result. A successful review should identify a small set of concrete consolidation changes that can be applied before or during the typed-indexing wave, while leaving the frozen GPU experiments intact.
