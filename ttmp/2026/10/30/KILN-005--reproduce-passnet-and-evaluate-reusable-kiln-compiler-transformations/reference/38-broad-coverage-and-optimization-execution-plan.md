---
Title: Broad coverage and optimization execution plan
Ticket: KILN-005
Status: active
Topics: [kiln, passnet, compiler-optimization]
DocType: reference
Intent: near-term
Owners: []
RelatedFiles: [integrations/passnet/fx_import.py, integrations/passnet/evaluate_tasks.py, integrations/passnet/transformation_program.mjs]
ExternalSources: []
Summary: Phase plan connecting complete-task coverage to a diverse portfolio of reusable compiler strategies
---

# Broad coverage and optimization execution plan

## Objective and present state

The end target is explicit accounting for all **200 PassBench tasks and 2,060 graphs**, including unsupported and incorrect variants. The earlier 111-task/1,514-graph qualification is running on a frozen source snapshot. Subsequent scalar/layout, stack/unbind and guarded input-mutation batches raised *import eligibility* to **131 complete tasks and 1,668 graphs**. The latest mutation wave added84 imports and12 complete families; its96 complete-family variants export and compile locally, and their source-derived patterns generate. These newer families have not yet passed GPU correctness or PassBench scoring. The historical accepted ledger remains **53 complete tasks and 505 individual graphs** across compiler snapshots; it is not a uniform current-release result.

Our near-term aim is to obtain broad, externally verified task coverage and use correct families to test multiple *reusable* optimization strategies. Coverage and optimization advance together. Full corpus support is a destination, not a gate that delays compiler experiments.

## Operating rules for broad progress

1. **Count complete task families.** A task includes all of its shapes and dtypes. Report imported graphs, locally compiled graphs, GPU-correct graphs and fully accepted tasks separately.
2. **Batch by missing compiler capability.** Implement related operations and semantics together, run one corpus census per batch, and replay affected complete families. Use a small set of representative semantic fixtures before the broad replay. Investigate individual failures when they reveal a shared defect or change an acceptance decision.
3. **Keep one compiler path.** The FX importer, Kiln IR, transformation-program application, CUDA exporter and PassBench evaluation remain shared. Consolidate duplicate lowerings and policy paths as they appear; do not grow a second ad hoc compiler for the benchmark.
4. **Separate search from measurement.** Compile task artifacts concurrently when safe; serialize timed GPU runs on bling. Freeze compiler revision, task membership and evaluation settings for each comparison. A new coverage batch must not alter an in-flight frozen experiment.
5. **Preserve provenance.** Record PyTorch, PassNet and research-derived semantics in the diary; keep source documents and reproducible scripts in the ticket's `sources/` and `scripts/` directories. Commit at broad capability and experiment boundaries.

## Phase sequence

| Phase | Work package | Exit evidence | Compiler strategies unlocked |
|---|---|---|---|
| P0 — finish uniform qualification | Complete the frozen 111-task PassBench run; sort export, compile, execution, numerical and score failures by common cause | One current-snapshot complete-task denominator, per-phase failure census, raw results | A trustworthy training set and bottleneck inventory |
| P1 — verify the cheap breadth batch | Run tasks 85, 135, 167, 192 and 197 under pinned PyTorch 2.9 and original numerical checker after P0 stops timing | All 33 variants accounted for; signed-zero/nonfinite discrepancies resolved where material | More pointwise activation and broadcast families for fusion and materialization studies |
| P2 — structural and effect breadth | Batch remaining views, slices, stack/unbind/expand and alias/mutation cases using explicit ownership and stride contracts | Full-corpus import delta, affected-family GPU replay, no silent mutation reinterpretation | View folding, layout simplification, movement elimination, effect-aware fusion |
| P3 — typed indexing and constants | Add exact integer/Boolean storage and scalar values, dynamic gather, captured tensor assets and lifetime rules as one cross-layer capability | Differential index/constant fixtures plus complete embedding/index families in PassBench | Gather fusion, constant specialization, index-layout and memory-traffic policies |
| P4 — reductions and structured compute | Group missing reduction, normalize, einsum/unfold and spatial variants by common lowering; extend scheduler only where current IR cannot express them | Family-level acceptance and before/after generated-kernel evidence | Reduction scheduling, epilogue fusion, contraction/layout selection |
| P5 — attention and remaining tail | Implement the attention primitive or legal decomposition and remaining dynamic spatial/rare operations; classify genuine source/runtime failures | Every one of 200 tasks has an explicit supported/correct/score or failure outcome | Tiled attention, matrix/reduction fusion, broader hardware-aware strategies |

The ordering of P2 and P3 may change after P0's failure census. P3 is deliberately coherent: `int64` indices cannot be cast through FP32 without losing identity, and data-dependent gather cannot be represented by static index maps. The current 119 nonfloating-placeholder first failures across 18 families therefore require an IR and runtime change, not a permissive importer condition. The 17 captured-constant first failures include tensors up to 1,050,625 elements and likewise require storage rather than scalar literal expansion. Phase P5 includes the local-driver-sensitive 59 first failures, which must be reclassified on bling before attributing them to Kiln.

The P2 mutation subproblem has a source audit and implementation contract in reference40. Its initial guarded implementation is in reference41. The source audit found143 variants across19 task families with mutation-related first errors, primarily on caller-owned inputs. The guarded capability adds input storage writeback and returned alias identity at the PyTorch boundary; overlapping views and further input uses still require broader effect analysis.

## Optimization experiments, in parallel with coverage

Use complete families already accepted by PassBench to establish a small strategy portfolio. The fixed pointwise fusion comparison changed 49 of 92 executable artifacts while retaining 92/92 correctness in both arms. Its 11 transfer families worsened in mean task score from 0.848880 to 0.822873; task effects were sharply different. This is evidence for **selective** strategies, not a globally enabled fusion policy.

| Experiment | Reusable compiler decision | Training and held-out evidence |
|---|---|---|
| O1 — selective fusion | Predict whether and in what order to fuse producer/consumer loops, using launch savings, duplicated work, materialization and schedule shape | Whole-task training families; unchanged held-out families; unchanged Kiln and fixed-fusion controls |
| O2 — reduction/contraction strategy | Choose reduction axis decomposition, contraction recognition, tile schedule and epilogue placement under numerical legality | Correct reduction and matmul families; dtype-specific correctness; GPU-only and end-to-end latency |
| O3 — movement/index strategy | Choose view folding, reshape/transpose simplification, gather materialization and constant placement as P2/P3 land | Newly covered structural/index families; exact generated memory operations and task score |
| O4 — runtime cost isolation | Hold CUDA fixed and measure output/scratch allocation and launch path, so compiler policy gains are not confused with dispatch gains | Paired generated artifacts, paired invocation paths and latency breakdown |

Start O1 and O2 with existing Kiln rules and `kiln-transformation-program/1`, including bounded agent proposals from the existing Pi lanes. Add a new pass algorithm only when the behavior cannot be expressed by current rules. Agent trials and hand-designed policies get equal task sets and evaluation budgets. Reserve whole families for held-out tests. A promotion requires external numerical acceptance and improved error-aware score on those held-out families; a faster correct-only subset is diagnostic evidence, not promotion evidence.

## Next concrete actions

1. Let P0 finish without introducing competing timed GPU work. Analyze the ordinary-task band as soon as its results are available, then the two large families and historical regression band.
2. Run P1's staged five-family source on bling after P0's timed evaluation. The five tasks and all 33 variants are staged with a verified source snapshot in `sources/scalar-layout-batch-gpu-v1/staging.json`; they have not been launched. Compare pinned PyTorch behavior before accepting the new bindings.
   The next structural batch (tasks 65, 112 and 150; 25 variants) is imported, locally compiled and separately staged but also needs pinned GPU replay. Its contract and evidence are in reference39. The remote `kiln-breadth-replays-v1` tmux queue waits for the frozen 111-task study to finish with all three bands accounted for, then runs these two cohorts sequentially. Its tracked source is script643; launch receipt is in `sources/breadth-replays-v1/queue.json`.
3. Use P0's common failures to choose P2 versus P3 first. Write the typed/index and effect contracts at the IR boundary before coding those waves; then implement broad batches and replay complete families.
4. Build O1 and O2 training/held-out partitions from accepted task families. Search several reusable policies, including one reduction/contraction candidate, and publish the negative results as well as improvements.
5. Recompute the complete 200-task ledger after each wave. Stop adding one-off bindings when the next missing capability spans storage, IR and runtime; implement that capability coherently.

The milestone for broad research progress is **a uniform accepted-family corpus plus at least two distinct compiler strategy experiments with held-out results**. The milestone for corpus completion is **explicit outcome coverage for all 200 tasks**, with the supported and correct count stated separately. These milestones can be reached at different times.
