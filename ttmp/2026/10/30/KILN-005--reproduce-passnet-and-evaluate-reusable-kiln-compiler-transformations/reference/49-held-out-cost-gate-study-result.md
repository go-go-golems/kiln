---
Title: Held-out cost-gate study result
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
    - Path: scripts/kiln-export.mjs
      Note: compileOne — the cost gate compiles both arms and keeps the predicted-cheaper executable
    - Path: ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/scripts/670-analyze-cost-gate-held-out-study.py
      Note: Pre-registered analysis (written before any arm finished)
    - Path: ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/cost-gate-held-out-v1/declaration.json
      Note: Frozen endpoints and decision rule
ExternalSources: []
Summary: On 20 held-out families the predicted-cost gate beat always-applying the fixed program on every speed endpoint and the official score, avoiding a measured 11.8 % loss on the 91 graphs it rejected; the frozen decision rule is nevertheless not met because one graph with a baseline-identical executable failed PassBench's timing-fluctuation guard
LastUpdated: 2026-11-01T00:30:00-04:00
WhatFor: Whether the cost gate is a reusable compiler strategy
WhenToUse: Before adopting the gate by default or designing the next policy experiment
---

# Held-out cost-gate study result

## Question and protocol

[Reference 47](47-cost-model-calibration-and-a-cost-gated-transformation-counterfactual.md) found, retrospectively, that keeping a transformation only when Kiln's analytic schedule model predicts a cheaper program would have turned the fixed transformation program's transfer loss into a gain. This study tests that rule on families it was not derived from.

**Population.** All complete families of the uniform qualification (ordinary and regression bands) outside reference 35's twelve tasks whose exported kernels change under `fixed-program.json`. This is a compile-only census (script 666): 20 families, 237 graphs.

**Arms.** The three plans are identical except for `optimization_program`:

- **baseline**: no program;
- **always**: `fixed-program.json` applied to every graph;
- **gated**: the same program inside `kind: "cost-gated"`. It compiles both ways and keeps the transformed executable only if `predictedCost` (a100 model) is strictly lower.

**Protocol.** Original PassBench checker at `t = -5` and the original scorer; GB10; separate contraction; 20 warmups and 100 timed trials. Arms ran sequentially in the declared order, on source revision `e0d76a5` (snapshot `c0d8027c…`).

**Declaration** (frozen before any GPU run, `declaration.json`):
- *Primary endpoint:* family-balanced geometric mean of compiled GPU median ratio (arm / baseline) over graphs whose always-arm executable differs from baseline and that all three arms accept.
- *Decision rule:* claim the gate only if (1) gated < always, (2) gated ≤ 1.0, and (3) gated accepts no fewer graphs than baseline.

## Result

| Endpoint | baseline | always | gated |
|---|---:|---:|---:|
| Accepted graphs (of 237) | 237 | 237 | **236** |
| Complete families (of 20) | 20 | 20 | 19 |
| Official task score, mean of 20 | 0.893 | 1.001 | **1.034** |
| **Primary:** GPU ratio, family-balanced GM (190 graphs, 20 families) | 1 | 0.679 | **0.644** |
| End-to-end ratio, same population | 1 | 0.682 | **0.648** |
| GPU ratio where the gate kept baseline (91 graphs, 10 families) | 1 | **1.118** | 0.999 |

Script 670 checks consistency: in every graph, the gated executable is byte-identical to either the baseline or the always executable, exactly as its recorded `compiler_policy_decision` says (0 inconsistencies).

**Decision under the frozen rule: not supported.** Conditions (1) and (2) hold; condition (3) fails by one graph.

## The one failed condition

The graph is task 31, `bfloat16/5/…/coat_lite_medium_384_start189_end198_23`. The gate chose `baseline`, so the gated arm ran an executable byte-identical to the baseline arm's, and the baseline arm accepted it. In the gated run, PassBench rejected the compiled-run measurement:

```text
Compiled model execution failed: Environment fluctuation detected.
  IQR/median = 22.8% (threshold: 20%)
RuntimeError: Environment fluctuation detected.
```

The failure is in the harness's timing-stability guard, not in correctness: the numerical comparison for that graph shows `max_diff 0.0`. It does not depend on the gate, since an identical executable passed in another arm. The rule is still the rule. The pre-registered outcome is "not supported", and this document does not reinterpret it. What the evidence does support is narrower: the shortfall is one harness rejection, and a replicate of the gated arm (or of the one family) is the proper way to resolve it.

## What the measurements show

- **The gate removes the program's losses.** On the 91 graphs where the model predicted the transformed program would not be faster, always-applying it was measurably worse: 11.8% slower, family-balanced. The worst cases were task 174 at 1.82, task 10 at 1.37 (33 graphs) and task 31 at 1.05. The gate kept the baseline there, and its measured ratio of 0.999 also shows that identical executables reproduce within noise across arms.
- **It keeps the wins.** On the graphs where it applied the program, gated and always agree within noise (task 32: 0.034 vs 0.034; task 75: 0.193 vs 0.195; task 41: 0.089 vs 0.089).
- **One known residual error.** Task 120's 9 graphs measured 1.15 under the transformation, and the gate applied it. This is the same kind of error as task 106 in reference 47. It is the next target for the cost model, which now has measured GB10 L2 bandwidth (below).

## Related probe results (same GPU, after the study)

`sources/gpu-probes-v1/result.json` (script 671):

- **TF32 rounding.** FP32 `linear` and 1×1 convolutions under `allow_tf32` are closest to round-to-nearest-*even* operand rounding (mean abs error 6.1e-5 and 8.0e-6), not to the round-to-nearest-away (`cvt.rna`) that Kiln emits (1.1e-4 and 1.7e-5). 3×3 convolutions are closest to RNA. Truncation and plain FP32 are far worse in every case. This makes "Kiln's rounding differs from cuDNN's 1×1 convolutions" a concrete hypothesis for reference 48's convolution regressions.
- **GB10 read bandwidth.** About 8.4–10.8 TB/s for L2-resident buffers (1–4 MB), about 2 TB/s at 12–16 MB, and 236–296 GB/s from DRAM (≥ 64 MB). The cost model's `l2 = traffic / (3 × bwGBs)` assumes L2 is 3× DRAM. On GB10 it is about 40×.

## Next steps

1. Replicate the gated arm, or task 31 alone, to resolve condition (3). The design is unchanged.
2. Give targets a measured L2 bandwidth (`l2GBs`), recalibrate (scripts 664 and 665), and re-test the working-set DRAM rule from Step 250, which the L2 term previously masked.
3. Emit RNE for TF32 operand rounding of matrix products and 1×1 convolutions, then re-run the P0 TF32 families.

## Evidence

- `sources/cost-gate-held-out-v1/`: `{baseline,always,gated}-{audit,collection}.json`, `*-raw.tar.gz`, `comparison.json`, `declaration.json`, `census.json`, `staging.json`.
- `sources/gpu-probes-v1/result.json`.
