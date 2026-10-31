# Changelog

## 2026-10-30

- Initial workspace created

## 2026-10-30

Added static layout and floating cast import; 18 CPU tests and four exact CUDA output comparisons passed. Full benchmark coverage remains 3/200.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/fx_import.py — Static layout and explicit dtype lowering

## 2026-10-30

Verified 4 tasks / 49 graphs; consolidated corpus runners; completed all-graph import audit and static indexing CUDA validation; delivered Progress 02 guide to reMarkable.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/corpus.py — Shared corpus execution and metadata audit
- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/fx_indexing.py — Static indexing semantic lowering

## 2026-10-30

Published detailed current-state technical report to go-go-parc, committed and pushed as d081b7a; verified five tasks / 73 graphs and documented the prioritized self-optimization experiment.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/reference/06-project-report-passnet-kiln-integration-and-the-path-to-self-optimization.md — Comprehensive published project analysis

## 2026-10-30

Completed first reusable fusion-policy pilot: training-selected 1.25, held-out family-balanced e2e 1.0186x vs unchanged Kiln, 60/60 stress checks; published vault report 2383314 and delivered guide Progress 03.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/reference/07-milestone-report-first-measured-reusable-fusion-policy-improvement.md — Measured policy transfer and limits

## 2026-10-30

Committed bounded feature-policy interpreter and fresh 12/8 study: all 160 compiles passed, training retained baseline and confirmation showed no improvement. Audited original 200-task reference: 2039/2060 variants and 191 complete tasks pass upstream tolerance one; timings exploratory. Published follow-up report and preserved all scripts and evidence.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/reference/08-milestone-report-bounded-fusion-programs-and-a-negative-confirmation-result.md — Conditional policy design and measured negative result

## 2026-10-31

Completed adaptive training-derived fusion study with no improvement; added SiLU/sigmoid and conservative fresh-single-use activation functionalization. Import eligibility now 912/2060 graphs across 36 tasks; task 143 verified in all three dtypes, bringing accepted coverage to 6 tasks/76 graphs. All 47 Python tests and 18 CUDA fixture comparisons pass. Technical report pushed to vault at 9f2e915; updated guide delivery in progress.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/fx_import.py — Typed activation and ownership lowering
- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/reference/09-milestone-report-adaptive-policy-synthesis-and-activation-coverage.md — Measured synthesis result and compiler extension report

## 2026-10-31

Audited full 14-task matrix cohort, corrected nominal coverage to 8 complete tasks and 149 individual graphs after follow-up, and fixed eager synthetic input allocation through selective Project.inputsFor sampling. Original failed runs and numerical diagnostics preserved; nine-variant full-task rerun pending.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/packages/kiln/src/std/index.js — Selective synthetic sampling before reference cost guard

## 2026-10-31

Completed rich twelve-policy study: 240 qualified artifacts, native TF32 reference failure retained, separately declared FP32 selection committed before fresh eight-model confirmation; no meaningful speedup demonstrated. Report 12 and guide Section 31 document evidence and limits.

## 2026-10-31

Implemented opt-in selective consumer fusion with shared inlining, retained-producer cost guard and bounded consumer programs;29 core files and108 CUDA comparisons pass. Fresh240-artifact study selects policy before confirmation but regresses to0.972049x; default unchanged. Guide Section32 and report13 preserve evidence and diagnosis.

## 2026-10-31

Implemented local model-optimal whole-region fusion planner with canonical region API;30 compiler files,280 exhaustive cases and108 CUDA comparisons pass. Frozen240-artifact fresh study confirms no speedup (0.990099x). Training-only generated-name audit identifies nuisance contrasts; canonical naming/evidence identity is next. Report14 and guide Section33 document scope.
