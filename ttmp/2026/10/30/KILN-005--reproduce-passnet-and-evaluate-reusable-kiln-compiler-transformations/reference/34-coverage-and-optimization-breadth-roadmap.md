---
Title: Coverage and optimization breadth roadmap
Ticket: KILN-005
Status: active
Topics: [kiln, passnet, compiler-optimization]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: [integrations/passnet/corpus.py, integrations/passnet/evaluate_tasks.py, integrations/passnet/transformation_program.mjs]
ExternalSources: []
Summary: Broad coverage waves and compiler strategy portfolio after the 92-graph policy comparison
---

# Coverage and optimization breadth roadmap

> This document records the initial 111-task planning snapshot. The scalar/layout batch subsequently raised current-source import eligibility to 116 complete tasks and 1,559 graphs. See reference37 for its evidence and reference38 for the current execution plan. The frozen 111-task GPU qualification remains a separate earlier snapshot.

## Decision

Work on two connected tracks: qualify the already importable PassBench tasks, and expand the compiler semantics that block the remaining tasks. Use the growing set of correct tasks to evaluate several *reusable* optimization strategies. Do not make full 200-task coverage a prerequisite for self-optimization, and do not claim complete support from importer success alone. The end target remains all 200 tasks and 2,060 graphs, with every failure visible in the denominator.

This plan emphasizes broad batches. A batch receives one semantic contract, a small set of representative differential fixtures, a full import census, and complete-task PassBench replay. Isolated failures are investigated only when they block many tasks, reveal a shared compiler defect, or determine whether a proposed optimization is safe. Individual graph tuning is not a coverage strategy.

## Where the project stands

| Evidence, as of the current source snapshot | Count | Interpretation |
|---|---:|---|
| Dataset population | 200 tasks / 2,060 graphs | Fixed evaluation denominator |
| Current-source FX imports | 111 complete tasks / 1,526 graphs | Import eligibility; not GPU or benchmark acceptance |
| Cumulative PassBench acceptance | 53 complete tasks / 505 graphs | Modified integration protocol, across recorded compiler snapshots |
| Fully importable but not yet verified tasks | 58 tasks / 1,083 graphs | Largest immediate qualification opportunity |
| Import-blocked graphs | 534 | First error only; later blockers may be hidden |

The 53 accepted tasks are all among the 111 currently fully importable tasks. The 58 unverified tasks are unevenly sized: two contain 396 and 126 graphs, respectively; the other 56 contain 561 together. These numbers come from the current full 2,060-graph import census and the existing acceptance ledger (`sources/coverage-roadmap-census-v1.json`). The census ran on a CPU host with fake metadata; 59 first failures mention a missing NVIDIA driver and need a GPU-host inspection before they are treated as compiler gaps.

The fixed pointwise transformation comparison (`sources/fixed-policy-passbench-v1/comparison.json`) has now finished on 12 complete tasks and 92 graphs. Both unchanged Kiln and the candidate passed all 92 numerical checks. The program changed 49 executable artifacts. Across the 11 transfer tasks, mean original task score changed from 0.848880 to 0.822873; the family-balanced end-to-end ratio on graphs correct in both arms was 0.976551. Task 101, used during development, improved by about 32.78× against unchanged Kiln; task 83 improved by about 2.78×, while task 25 regressed to about 0.33×. The run was sequential on GB10 under the declared modified FX matching protocol. These measurements show that applying this fixed program globally is not the next default compiler change. They do show enough task-dependent response to motivate a selective policy and a broader strategy portfolio.

## Track A: qualify the existing 111-task import surface

**A1. Freeze one current-source task manifest.** Use `graph_list.txt` membership for all 111 fully importable tasks, preserving all 1,514 graphs in those tasks. Keep the prior 53 accepted tasks as a current-source regression set; do not add historical results to a new uniform-run denominator. Record compiler revision, Docker image, GPU, scheduling target, numerical setting, matcher normalization, and internal reference-check setting once for the whole run.

**A2. Execute the 58 unverified tasks in two workload bands.** The first band has 56 tasks and 561 graphs; the second has the two 396- and 126-graph tasks. This division permits a fast broad result without silently omitting the largest families. Compile independent task artifacts in parallel; serialize timed GPU evaluation to avoid cross-run interference. Keep export, compile, match, execution, numerical acceptance, and score as separate per-task outcomes.

**A3. Re-run the prior 53 under the same snapshot.** This establishes a uniform current-release figure and finds regressions hidden by the cumulative ledger. Internal Kiln synthetic reference failures and external PassBench numerical failures must be distinguished. The broad exploratory pass may explicitly bypass the internal synthetic check for both arms, as in reference33, while retaining the external numerical checker; report that protocol choice. A later strict-gate audit can address the internal checker without blocking this breadth measurement.

**A4. Sort failures by shared cause.** Aggregate by first failing phase and operator family, not one ticket per graph. Work on the largest shared cause first. A successful batch ends with complete-task correctness and original scoring, not merely an import-count increase.

## Track B: expand semantics in batches

The 534 current import failures have first-error groups: 119 nonfloating-input rejections, 135 mutation/alias rejections, 142 other operation bindings, 23 scaled-dot-product-attention calls, 17 captured constants, 16 source shape-propagation failures, 59 local-driver failures, and 23 other compiler/metadata failures. These are **first errors**, not independent sets of tasks unlocked by a single fix.

| Wave | Shared compiler capability | Representative source cases | Optimization strategies enabled |
|---|---|---|---|
| B1: typed inputs and constants | Integer/index tensor storage, typed loads, `get_attr` constants, safe scalar conversion | Embedding and mixed tensor/scalar graphs | Gather/index fusion; constant specialization; index-layout planning |
| B2: views, structure and effects | Strided slices, stack/unbind/expand, explicit alias and mutation rules for `relu_`, `silu_`, `iadd`, hardtanh | View-heavy and in-place model fragments | View folding; materialization elimination; mutation-aware fusion |
| B3: reduction and sequence primitives | Einsum subsets, unfold, norm/normalize, missing reductions and source overloads | Attention and convolution-adjacent graphs | Reduction scheduling; epilogue fusion; layout-aware contraction |
| B4: attention and dynamic spatial operations | Scaled dot-product attention, remaining interpolate/conv1d variants and pooling edge semantics | Transformer and spatial families | Tiled attention; matrix/reduction fusion; tile-size selection |
| B5: environment and tail | Re-run driver-sensitive metadata on bling, then classify remaining shape propagation and rare operations | All still-blocked families | Identifies actual compiler gaps after environment effects are removed |

For each wave, first pin the PyTorch source signature, shape/dtype/layout behavior, alias effect, and numerical contract. Add the lowering to the existing FX importer and Kiln IR where it belongs. Apply a few adversarial CPU or CUDA fixtures covering boundaries and the smallest complete affected families. Then run the full import census and complete-family replay. Batch closely related overloads together; do not require a large standalone test suite for every trivial binding. A wave is useful even when it does not immediately complete a task, but its report must distinguish graph imports from accepted tasks.

## Track C: build a portfolio of reusable compiler strategies

The policy experiment demonstrates why one global fusion program is insufficient. Task-family effects must guide both pass design and policy selection. The initial portfolio should use existing Kiln rule and pipeline interfaces rather than another compiler stack:

| Stratum | Candidate compiler work | What to measure |
|---|---|---|
| Pointwise, convolution and pooling | Selective producer fusion, fusion order, tiling and launch/materialization cost | Task score and changed executables; task 25 regression versus task 83/101 gains |
| Matmul, linear and attention | Contraction recognition, layout normalization, tensor-core/precision legality, epilogue placement | Numerical acceptance by dtype; kernel schedule; end-to-end and GPU latency |
| Reductions, softmax and normalization | Axis-aware reduction schedules, producer/consumer fusion, intermediate precision | Stability, reduction cost, scratch traffic and complete-task score |
| Views, indexing and movement | Singleton-view maps, transpose/reshape simplification, gather and pad materialization | Whether logical dependencies and memory traffic disappear |
| Runtime and dispatch | Output/scratch reuse, launch grouping, callable overhead | End-to-end versus GPU-only latency, with compiler output held fixed |

The agent can propose transformation programs or bounded policies for these strata. A new pass algorithm is added to Kiln only when a measured pattern cannot be represented by the current rule set. Semantic legality remains a compiler contract; the agent searches profitability and composition. Start with the existing Pi/LLM lanes and `kiln-transformation-program/1` artifact, not a new agent framework.

Selection is by **complete-task, error-aware score** on training families. Reserve whole model/task families for held-out evaluation; keep every dtype and shape variant of a task together. Record unchanged Kiln, a hand-designed strategy, and agent proposals under equal compilation/evaluation budgets. Compare exact CUDA/schedule identity, because a policy that aliases the control cannot demonstrate a compiler improvement. Correct-on-both latency is explanatory; failed variants still count in the official task score. A candidate is promoted only after an unchanged held-out replay shows a useful gain without losing required correctness.

```text
freeze task families and source revision
  → current-source import/compile/PassBench baseline
  → group correct families by operator and bottleneck
  → propose several reusable strategies per group
  → select on complete training tasks and original score
  → freeze one candidate per group
  → replay held-out families, including every variant
  → retain only measured wins; expand coverage waves in parallel
```

## Execution order and checkpoints

1. **Now:** publish the 92-graph policy result and this census. Do not adopt the fixed pointwise program globally. Preserve task 25, 83 and 101 as contrasting development evidence.
2. **Next coverage run:** freeze all 111 currently fully importable tasks; run the 56-task/561-graph band and the two large families, then the prior 53 as one uniform source snapshot. Report phase-wise failure counts and complete-task scores.
3. **Next implementation batch:** run a GPU-side census for the 59 environment-sensitive cases, then implement B1 and B2 as broad typed-input/structure/effect work. Recompute full import and complete-task counts once per batch.
4. **Next optimization experiment:** partition the already correct families by actual compiler behavior. Train a selective pointwise/conv/pooling decision on the observed task 25 versus 83/101 divergence, and evaluate it on reserved complete families. In parallel, develop one reduction or contraction strategy so research is not limited to fusion.
5. **Subsequent waves:** B3/B4 and the remaining tail, with the same census and replay protocol, until all 200 task outcomes are accounted for. A task may remain unsupported temporarily, but it stays visible in the ledger and informs the next capability wave.

Keep one FX importer, one transformation-program application path, one PassBench evaluation/audit path, and one evidence ledger. A new helper should replace duplicate behavior when possible. The diary records source provenance for each port, especially PyTorch, PassNet or research-derived semantics, and captures negative as well as positive results. Commit after each broad capability batch or completed experiment, not each fixture.
