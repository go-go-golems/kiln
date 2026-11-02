---
Title: Uniform 111-family PassBench qualification result
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
    - Path: integrations/passnet/summarize_task_run.py
      Note: Auditor that decides complete-family acceptance
    - Path: ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/scripts/655-collect-uniform-band.py
      Note: Collector that checks plan and snapshot identity before auditing
ExternalSources: []
Summary: First uniform breadth result — 86 of 111 importable families (1,391 of 1,514 graphs) complete under one frozen compiler snapshot, with every failure named
LastUpdated: 2026-10-31T21:00:00-04:00
WhatFor: The current-snapshot breadth number and the failure accounting behind it
WhenToUse: Citing corpus coverage; choosing the next repair or capability wave
---

# Uniform 111-family PassBench qualification result

## Result

All three bands of the frozen uniform qualification declared in [reference 36](36-uniform-importable-task-qualification.md) are terminal and audited. The bands are ordinary ([reference 44](44-uniform-ordinary-band-passbench-result.md)), large and regression. Every band used the same compiler source snapshot, SHA256 `7557de52462180c4f7ab5dd246b7ee554fcc55480e880ae0a82f189a9772a740` (revision `0c17cee`), and the same protocol:

- modified FX matching integration;
- original PassBench numerical checker at `t=-5` and the original scorer;
- NVIDIA GB10 with an A100 scheduling target;
- separate contraction;
- Kiln's internal synthetic check bypassed;
- 20 warmups and 100 timed trials.

| Band | Families | Complete families | Graphs | Accepted graphs |
|---|---:|---:|---:|---:|
| ordinary | 56 | 32 | 561 | 479 |
| large | 2 | 1 | 522 | 481 |
| regression | 53 | 53 | 431 | 431 |
| **total** | **111** | **86** | **1,514** | **1,391** |

**86 of the 200 PassBench tasks are complete on one frozen compiler snapshot.** This is the first uniform breadth number of the project. It must not be added to the historical 53-task ledger (`sources/kiln-coverage.json`), which spans other snapshots. It also includes the regression band's 53 families, which overlap that ledger's population. Of the remaining 89 tasks, 20 became import-eligible after this snapshot (scalar/layout, stack/unbind and input-mutation waves; 131 eligible in the latest census). They are queued on bling under a newer snapshot and will be reported separately. The other 69 are not yet importable. Their first blockers are in `sources/current-capability-wave-frontier-v1.json`; typed values and dynamic indexing account for the largest group.

## Every failure has a name

The 25 incomplete families contain 123 failing graphs. Each failing graph falls into exactly one class:

| Class | Graphs | Families | Status after Steps 239–245 |
|---|---:|---:|---|
| Pattern identity depends on output order | 16 | 6, 24, 185 | Fixed (9de3901). CPU simulation 75/75. GPU replay queued |
| `sigmoid` spelling differs between TorchDynamo and pattern trace | 21 | 79 | Fixed (8ee076e). Simulation 21/21. GPU replay queued |
| Dead branch makes the pattern match twice | 2 | 128 | Diagnosed. Needs a protocol decision |
| FP32 contraction against a TF32 eager reference | ~15 | 27, 52, 72, 88, 93, 118, 133, 157 | `matmul_precision: "tf32"` implemented (f89f76c). GPU replay queued |
| Low-precision rounding-boundary disagreements (mean diff ≤ 1e-7, pass at `t=-4`) | most remaining | 82, 95, 110, 118, 141, 148, 178, 186, 188, … | Not a lowering bug. Needs a rounding-order investigation |
| Larger low-precision disagreement (mean diff ~1e-4) | few | 14, 121, 185 (bf16/f16) | Hypothesis: cuBLAS reduced-precision reductions |
| bf16 batch norm cancellation after depthwise conv | 41 | 73 (large band) | Hypothesis: 1-ulp conv accumulation order amplified by `x − mean` |
| Unexplained FP32 | 2 | 160 | Open |

Diary Steps 240–243 hold the evidence for each class. The queued P0/P1 replay (Step 244: 15 families, 181 graphs, with three accepted controls) will measure the first four repairs under the original checker.

## Evidence

- `sources/uniform-importable-qualification-v1/{pending-ordinary,pending-large,regression}-{plan,audit,collection,failure-summary}.json` and `*-raw.tar.gz`. The regression archive SHA256 is `888a7fc3b8770619b3c8c8842a0a62b9ee77310751401d14f9871e34d7227c23`.
- Collector `scripts/655-collect-uniform-band.py` (plan and snapshot identity checks); summarizer `scripts/659-summarize-uniform-band-failures.py`.
- Matcher census predicting rule selection for all 1,514 graphs after the repairs: `sources/matcher-census-v1/`.
