---
Title: Capability waves for coverage and optimization breadth
Ticket: KILN-005
Status: active
Topics: [kiln, passnet, compiler-optimization]
DocType: reference
Intent: near-term
Owners: []
RelatedFiles: [integrations/passnet/fx_import.py, integrations/passnet/evaluate_tasks.py, integrations/passnet/transformation_program.mjs]
ExternalSources: []
Summary: Broad-batch plan connecting PassBench coverage to a portfolio of reusable Kiln optimization strategies
---

# Capability waves for coverage and optimization breadth

## Goal and evidence boundary

The corpus goal is an explicit result for all 200 tasks, with the number of fully correct and scored tasks reported separately. The research goal is to improve held-out PassBench task scores with **reusable Kiln compiler decisions**, not one implementation per graph. The two goals proceed together. Full corpus support is not a prerequisite for testing self-optimization.

At this checkpoint, **131 complete task families and 1,668 graphs are import eligible**. Their newer waves are locally compiled, but queued external qualification has not completed. The historical accepted ledger is **53 complete tasks and 505 individual graphs across different compiler snapshots**. It must not be read as current uniform acceptance. The frozen 111-task qualification is running on bling; its queue will then run five scalar/layout, three stack/unbind and twelve guarded-mutation families. These are separate source snapshots and cannot be summed into a single accepted count without a common replay.

## Plan by capability, not by individual operator

| Wave | Shared capability to implement | Breadth experiment | New compiler decisions made possible |
|---|---|---|---|
| Q0: qualify the existing compiler | Complete the frozen 111-family run and dependent breadth queues; classify first common failures by stage | Original PassBench checker and scorer, exact task membership, one failure census per source snapshot | Select a uniform correct training corpus; distinguish compiler defects from unsupported imports |
| Q1: typed values and dynamic indexing | Exact `int64`/Boolean tensor storage and scalar semantics; data-dependent gather/indexing; captured tensor constants with explicit lifetime | Import census, representative mixed-dtype/index fixtures, then complete embedding/index families | Gather fusion, index layout, constant specialization, memory traffic, register-pressure tradeoffs |
| Q2: spatial neighborhoods | One shared window/reduction representation for avg, max and adaptive pooling, padding/ceil/divisor semantics, then unfold and local filters | Batch all spatial first failures; qualify full families under the original checker | Tile and halo size, shared-memory reuse, reduction shape, pooling/activation fusion |
| Q3: reductions and contractions | Shared reduction/normalization lowering and contraction recognition for einsum/matmul-like source forms; numerical order remains explicit | Import and compile batch, then GPU correctness by dtype and shape family | Reduction tree, axis decomposition, epilogue fusion, tile shape, precision policy |
| Q4: effects and layouts | Extend the current guarded mutation model to multi-use inputs and legal views with storage/version analysis; generalize strides and structural movement | Revisit remaining view/alias families as one effect/layout cohort | Storage reuse, view elimination, producer-consumer fusion under effects, layout choice |
| Q5: attention and irregular tail | Attention decomposition or primitive, dynamic/rare operators and source/runtime exceptions driven by the residual census | Every remaining task gets a concrete supported, incorrect or unsupported outcome | Attention tiling and fusion, irregular indexing policies, full-corpus strategy transfer |

Q1 and Q2 may exchange order after Q0 reveals the actual first shared failure. The old typed frontier found 119 graph first failures across 18 families and 17 captured-constant first failures across three families; those are **first-error counts**, not a prediction of accepted tasks. Q2 should use one spatial primitive where possible, rather than three unrelated pool implementations. Q4 may run earlier if the mutation replay reveals a large, shared alias defect. The implementation order is a response to evidence, while the capability boundaries remain stable.

The current-source importer census in `sources/current-capability-wave-frontier-v1.json` sharpens that choice. All blocked variants of 18 tasks first fail on typed inputs (119 graphs); eight tasks first fail on reduction/contraction operations (52 graphs); eight first fail on spatial operations (25 graphs). Fourteen tasks (59 graphs) first fail during a **local driver probe**. That group requires a bling reclassification before it can be ranked as missing Kiln capability. These counts are upper bounds on immediate family gain: a later unsupported operation may appear when the first blocker is removed. They do not predict external PassBench acceptance.

## One batch loop

1. Freeze a source snapshot and list the first unsupported or incorrect stage for all 200 tasks. Group by **shared semantic or IR cause**; estimate how many *complete* families a capability could unlock. Preserve the full failing set rather than counting only easy shapes.
2. Write the semantic contract once at the FX-to-IR boundary: dtype, shape, strides, alias/effect behavior, numerical order and output structure. Identify the shared Kiln IR and CUDA lowering change. Do not accept an importer binding whose value cannot be represented faithfully downstream.
3. Implement a coherent family of operations and one or two representative semantic fixtures. Compile the entire newly eligible cohort locally in parallel. Use failure clustering to repair shared defects, then rerun that cohort once.
4. Send **complete families** to the serialized GPU queue. Use original PassBench matching, numerical checker and scoring. Audit exact graph membership, one match per graph and nominal `t=-5` acceptance before changing the accepted ledger.
5. Record the capability, source provenance, scripts, compiler revision, task membership and failures in the ticket diary and `sources/`. Commit the capability and its evidence at a meaningful boundary. Recompute the 200-task census, then choose the next wave.

This loop intentionally avoids full-suite retesting after each operator. Focused fixtures resolve semantic questions; one broad census and one family-level replay establish the batch result. A single graph failure warrants investigation when it reveals a general compiler issue, changes a family-level result or blocks the next strategy experiment.

## Optimization portfolio that grows with coverage

| Strategy family | Earliest usable corpus | Comparison to run |
|---|---|---|
| Selective fusion and materialization | Current correct pointwise/multi-consumer families | Baseline, fixed fusion, hand policy and agent proposal at equal search budget |
| Reduction/contraction scheduling | Current correct reductions; grows with Q3 | Tile/reduction-tree/epilogue choices with dtype-specific numerical acceptance |
| Movement and index placement | Structural families now; gather families after Q1 | View folding, index materialization and gather fusion versus stable baseline |
| Spatial reuse | Q2 accepted pool/unfold families | Direct versus tiled window lowering, reuse across neighboring outputs, fused activation |
| Effect-aware storage and fusion | Guarded mutation wave, then Q4 | Explicit copyback/storage plan and legal fusion choices with returned alias identity |
| Mixed-dtype specialization | Q1 and Q3 | Storage/loading/accumulation choices with exact source dtype semantics |

The first optimization milestone needs **two different strategy families** on disjoint held-out complete tasks, with source revisions and evaluation budget frozen. The fixed pointwise-fusion result already shows why this is necessary: both arms were correct on 92/92 graphs, but the candidate worsened mean task score across eleven transfer families from 0.848880 to 0.822873. A global pass toggle is therefore a useful control, not a promotion criterion. For each strategy, report correctness and error-aware score first, then GPU-only and end-to-end latency, compilation cost and search cost. A policy may be promoted only after held-out external acceptance and score gain; failed candidates remain useful measurements.

## Architecture and stopping rules

The FX importer, typed Kiln tensor/loop IR, scheduler, CUDA exporter and PyTorch dispatch form one path. Capability waves extend that path; they do not add parallel benchmark-specific lowerings. Before each batch, inspect whether a new case duplicates an existing dtype, indexing, reduction or effect mechanism. Consolidate at the common IR boundary when it does. Keep PassBench-specific matching and scoring in the integration layer.

If a batch yields no complete family after local compile and external replay, stop adding adjacent bindings and inspect the next shared representation or numerical barrier. If a correct cohort exists but offers no meaningful strategy choice, advance coverage while running optimization experiments on the already accepted corpus. If a strategy works only for one graph instance, classify it as kernel specialization and do not count it as reusable compiler improvement.

## Immediate execution order

1. Finish and audit the existing bling qualification queue. Do not start competing timed GPU work.
2. Produce a compact residual first-failure census from the **current** importer snapshot, including candidate complete-family yield for Q1–Q5. Use that to choose Q1 or Q2.
3. In parallel with local compiler work, freeze a correct-family training/held-out split and run the first selective-fusion and reduction/scheduling strategy comparisons. Avoid waiting for all 200 tasks.
4. Build the next chosen capability as one wave, run the batch loop, update the 200-task outcome ledger and then reassess wave order.

Success is reported at two independent levels: **breadth** (complete externally accepted tasks out of 200, plus explicit outcomes for all tasks) and **generalization** (held-out score gain for reusable strategies at a fixed experimental budget).
