---
Title: P0 replay result and the TF32 convolution boundary
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
    - Path: integrations/passnet/generate_pass.py
      Note: Output-order-independent pattern identity (repair measured here)
    - Path: packages/kiln/src/std/tensor.js
      Note: tf32Pass; convolutions removed from it after this replay
    - Path: ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/scripts/669-collect-task-plan-run.py
      Note: Generic collector used for this run
ExternalSources: []
Summary: GPU replay of the P0/P1 repairs on 15 families (181 graphs) — identity and matcher repairs complete 6, 24 and 79; TF32 operand rounding matches cuBLAS linear layers but not cuDNN convolutions
LastUpdated: 2026-10-31T23:30:00-04:00
WhatFor: Measured effect of each named repair from reference 46
WhenToUse: Citing which failure classes are closed; deciding the next numerical investigation
---

# P0 replay result and the TF32 convolution boundary

## Question

[Reference 46](46-uniform-111-family-passbench-qualification-result.md) assigned a named cause to every failing graph of the uniform qualification. Three of those causes received repairs (diary Steps 239–243). This replay measures each repair under the original PassBench checker. It uses the uniform protocol, plus `matmul_precision: "tf32"` (the reference backend probe recorded `matmul_allow_tf32: true`).

- Source revision `b796952`, snapshot `ccef175d…`.
- 15 complete families, 181 graphs, run in one plan.
- Groups: identity 6, 24, 185; matcher 79; TF32 27, 52, 72, 88, 93, 118, 133, 157; accepted controls 20, 42, 164.

## Result

| Group | Family | Accepted before → after | Complete |
|---|---|---|---|
| identity | 6 | 53 → **66/66** | yes |
| identity | 24 | 2 → **4/4** | yes |
| identity | 185 | 2 → 3/5 | no: the 2 remaining graphs are bf16/f16, the "larger low-precision disagreement" class |
| matcher | 79 | 0 → **21/21** | yes |
| tf32 | 27 | 11 → **14/14** | yes |
| tf32 | 93 | 7 → **9/9** | yes |
| tf32 | 52 | 5 → 8/9 | no: 1 bf16 graph |
| tf32 | 72 | 6 → 6/9 | no |
| tf32 | 88 | 2 → 2/3 | no |
| tf32 | 157 | 2 → 2/3 | no |
| tf32 | 118 | 0 → 0/6 | no |
| tf32 | 133 | **16 → 13/20** | no: regression |
| control | 20, 42, 164 | 6, 3, 3 → unchanged | yes |

**Totals: 8 of 15 families complete (the 3 controls plus 5 of the 12 repaired families), 160 of 181 graphs accepted.** The identity and matcher repairs behave exactly as the CPU matcher census predicted. The TF32 controls show that the rounding does not break FP32 linear layers that already passed.

## The TF32 result splits by operation

Here are the FP32 graphs of the TF32 group, classified by their contraction operation and outcome:

| Operation | Fixed (fail → pass) | Broken (pass → fail) | Still failing | Still passing |
|---|---:|---:|---:|---:|
| `linear` | 8 | 0 | 3 (88, 157, 118) | 3 |
| `conv2d` (groups = 1) | 1 | 4 | 6 (72, 133) | 0 |

Kiln's TF32 emulation rounds operands to nearest (`cvt.rna.tf32.f32`) and then accumulates in FP32. That reproduces cuBLAS TF32 matrix products: every failing linear graph in families 27, 52 and 93 now passes, and none broke. It does not reproduce cuDNN's TF32 convolutions, which got worse. cuDNN chooses its convolution algorithms per shape (implicit GEMM, Winograd, FFT), and its TF32 kernels need not round operands the same way. The remaining 3 linear failures show that operand rounding is not the whole story for linear layers either, but there it does no harm.

**Change (7e40d54):** `tf32Pass` now rounds only `nn.linear` and `nn.matmul`. Convolutions keep FP32 operands under `matmulPrecision: "tf32"`. This should restore family 133 to its pre-replay state (16/20) and leave 72 unchanged. That is a prediction from the uniform run, which used FP32 convolutions, and has not been re-measured.

## What remains open

- **Convolution numerics against cuDNN TF32:** 72 and 133, and probably the "low-precision rounding-boundary" class as well. The next step is a GPU probe: run a small exact convolution under `allow_tf32` with operands chosen so that RN, RZ and FP32 accumulation give distinguishable results. The probe must not overlap a running study.
- **Linear layers still failing under TF32:** 88, 118, 157. These need per-graph error magnitudes against a CPU TF32 emulation.
- Unchanged: 185 bf16/f16, 52 bf16, 128 (protocol decision), and 73 (large band).

## Evidence

- `sources/p0-replay-gpu-v1/results-audit.json`, `results-collection.json`, `results-raw.tar.gz` (SHA256 `c6215f19…`).
- Plan: `sources/p0-replay-v1/plan.json` (SHA256 `53ae04fa…`).
