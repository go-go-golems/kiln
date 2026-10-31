---
Title: Cost model calibration and a cost-gated transformation counterfactual
Ticket: KILN-005
Status: active
Topics:
    - kiln
    - passnet
    - compiler-optimization
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: packages/kiln/src/std/tile.js
      Note: analyze/estimate/timeModel — the analytic cost model being calibrated
    - Path: packages/kiln/src/std/targets.js
      Note: a100 model used for scheduling; measured gb10 spec of the hardware that ran
    - Path: ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/scripts/665-paired-cost-model-check.py
      Note: Paired predicted-vs-measured effect of a compiler change on the same graph
ExternalSources: []
Summary: Kiln's analytic cost model ranks measured PassBench GPU time (ρ≈0.9) and predicted the fixed program's major wins and its task-25 regression; gating the transformation on predicted cost would have turned the transfer loss into a gain (retrospective)
LastUpdated: 2026-10-31T22:00:00-04:00
WhatFor: Deciding whether policy search should be driven by the analytic cost model
WhenToUse: Before designing the next optimization-policy experiment
---

# Cost model calibration and a cost-gated transformation counterfactual

## Question

Reference 45 (§B5) set a go/no-go condition for further policy search: does Kiln's analytic cost model rank the measured costs of the programs it compiles? If it does not, no policy that conditions on it can be good. Two kinds of evidence answer the question:

- The **absolute** ranking across 1,391 accepted graphs: does the model order programs by measured time?
- The **paired** ranking across 49 graphs whose kernels changed between the two arms of the fixed transformation-program study (reference 35): does the model predict the *effect of a compiler change on the same graph*? Policy decisions need this second kind.

## Method

Script 664 recompiles each exact staged script with the qualification settings (target `a100`, separate contraction) and sums `estimate(analyze(expr, shape, inShapes), map, target).us` over the chosen Tile IR kernels. It scores the result under the `a100` model that chose the schedules and under the measured `gb10` spec in `targets.js` (DGX Spark: 48 SMs, 259 GB/s, 2.4 µs launch). It also reports the Loop IR `workOf` total that fusion policies see. Measured values are the compiled GPU medians (100 trials) from the original evaluator logs. Script 665 does the same for both arms of reference 35, applying `fixed-program.json` to the candidate arm exactly as `kiln-export.mjs` does.

## Absolute calibration (1,391 accepted graphs, three uniform bands)

| Predictor | Spearman ρ vs measured compiled GPU time |
|---|---:|
| a100 cost model | 0.931 |
| gb10 cost model | 0.898 |
| Loop IR work estimate | 0.912 |
| gb10 model, median within-family ρ (66 families with ≥5 graphs) | 0.916 |

The gb10 spec is also roughly calibrated in absolute terms: the median ratio of measured to predicted time is 1.07. The median difference between end-to-end and GPU time is **12.9 µs**. That is Python dispatch, allocation and launch overhead, and it is comparable to the GPU time of many small replacements.

## Paired effect of one compiler change (49 changed graphs, 7 families)

| Predictor of the candidate/baseline ratio | Spearman ρ | Sign agreement on the 20 graphs with a measured change beyond ±2 % |
|---|---:|---:|
| a100 model | 0.57 | 15 / 20 |
| gb10 model | 0.61 | 15 / 20 |
| work estimate | 0.53 | 15 / 20 |

Per family, the model predicted the large effects:

| Family | Measured ratio | a100-predicted ratio | Verdict |
|---|---|---|---|
| 101 (development) | 0.018–0.063 | 0.021–0.077 | correct, near-exact magnitude |
| 83 | 0.19, 0.26, 0.83 | 0.11–0.15 | correct sign |
| 25 | **2.25–3.71 (regression)** | **2.71–3.06** | correct: the model predicted the regression |
| 106 | 1.00–1.88 | 0.07–0.26 | **wrong**: predicted large win, measured neutral/loss |
| 107, 127, 159 | 0.99–1.05 | ≈1.00 | correct (no material change) |

The transfer loss in reference 35 was therefore **not a cost-model failure**. The program's selective stage accepted consumer work growth up to 2× (`consumer_tree: {threshold: 2}`), and no stage consulted the schedule cost model, which predicted task 25's slowdown.

## Retrospective counterfactual: gate the transformation on predicted cost

Rule: for each graph, use the transformed program only if the model predicts a lower total cost than the untransformed one. The rule has no tuned parameter. Using the two measured arms, here is the family-balanced geometric mean of measured candidate/baseline GPU time over the changed graphs:

| Population | Always apply (as measured) | Cost-gated (a100 or gb10 model) | Work-gated at 1.0 |
|---|---:|---:|---:|
| 11 transfer families (task 101 excluded) | 1.041 | **0.863** | 0.865 |
| All 12 families | 0.626 | 0.533 | 0.534 |

Gating keeps the wins on 83 and 101 and removes task 25's regression. Task 106 remains a loss, because the model mispredicts it in the gate's favor.

**Scope of this claim.** This is a retrospective analysis of one population. The rule was formulated after seeing the data, the measure is GPU time on changed graphs rather than the official error-aware task score, and end-to-end dispatch costs are excluded. It motivates, but does not establish, a reusable strategy.

## Implications for the next experiment

1. Policy search should be driven by the schedule cost model, which predicts paired effects, rather than by `workOf` thresholds that admit 2× work growth.
2. The next held-out test should compare three arms on fresh complete families with changed executables: baseline, always-apply and cost-gated. It should use the official scorer and the frozen protocol.
3. Task 106 is the model's known counterexample. Its kernels (1 → 2, predicted 4–14× faster) are the first target for model repair.
4. The 12.9 µs median dispatch overhead caps the end-to-end benefit of any kernel-level improvement on small graphs. It deserves its own optimization track (fewer Python-side allocations and checks per call).

## Evidence

- `sources/cost-model-calibration-v1/uniform-accepted-1391.json` (per-graph measured and predicted values).
- `sources/cost-model-calibration-v1/fixed-policy-paired-49.json` (per-graph ratios and kernel counts).
- Scripts 664 (`664-predict-program-cost.mjs`, `664-calibrate-cost-model.py`) and 665.
