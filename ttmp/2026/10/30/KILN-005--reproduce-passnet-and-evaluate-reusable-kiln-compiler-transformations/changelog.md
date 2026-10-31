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

## 2026-10-31

Complete canonical codegen/3 study: all eight confirmation graphs qualify; baseline selection 58133d1 is unchanged, so identity ratios establish no speedup. Record reliable subprocess validation, canonical source replay, transpose/input-only exports and milestone report 15.

## 2026-10-31

Commit source softmax lowering as 80d022e: 45 FX tests and 99 CUDA comparisons pass; full import eligibility rises to 1122 graphs/61 complete families. Freeze all ten newly complete families (93 graphs) for original-evaluator qualification; no acceptance increment claimed before its audit. Canonical milestone report published and pushed in vault 19be088.

## 2026-10-31

Complete repaired softmax qualification under d71eccd: all ten families/93 variants pass exact replacement, original replay execution and nominal t=-5 correctness. Cumulative coverage is 21 tasks/299 graphs. Retain initial matching failures; report descriptive 5 faster/88 slower variants, 254 emitted kernels and source/scorer provenance in milestone report 16.

## 2026-10-31

fed37d1 singleton reshape canonicalization passes all 93 original comparison variants; target median 703.734 -> 20.4884 ms, observed family-balanced old/new ratio 1.064442x. Separate new source cohort passes 3 tasks/14 variants, raising cumulative coverage to 24 tasks/313 graphs. Preserve native 60/63 fixture outcome and document development-only inference in report 17.

## 2026-10-31

Completed p4wv fixed-source confirmation: 20/20 fresh exact models qualify; 40 artifacts and 23,400 samples independently audited. Observed 1.053746x e2e / 1.059878x stream, retaining 10 slower families. Report18 explains FP32 research scope; official cumulative coverage unchanged at24 tasks/313 graphs.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/reference/18-milestone-report-fixed-compiler-confirmation-across-twenty-fresh-model-families.md — Full technical analysis and experimental limits

## 2026-10-31

Exact GELU passes 36 CUDA fixture records. Complete 60-variant original run adds two tasks/18 accepted graphs: cumulative26 tasks/331 graphs, import1196/69. Seven matching failures are traced to functional LayerNorm argument forms and repaired in the existing normalizer; all53 FX tests pass. Two sparse compile-check failures retain35 unexecuted variants with unchanged tolerances. Targeted complete seven-variant replay is frozen.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/fx_normalize.py — LayerNorm public signature repair
- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/gelu-source-cohort-v1-verified-facts.json — Independent complete accounting with retained failures

## 2026-10-31

Complete seven-variant LayerNorm matching-repair task qualifies under f1e5518 with exact source/artifact/score audit. Cumulative accepted replay reaches27/200 tasks and338/2060 graphs (273 in complete tasks); import eligibility1196/69. Reference19 documents exact GELU, source signatures, native36/36 and retained35 unexecuted variants from two unresolved compile checks.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/reference/19-milestone-report-exact-gelu-source-signatures-and-complete-failure-accounting.md — Technical milestone with exact gates and remaining failures

## 2026-10-31

Qualified original agent image over all 200 tasks/2060 graphs; verified full BF16 checkpoint download and locked R2E imports; preserved infrastructure failures and launched conversion (diary Step141).

## 2026-10-31

Verified unquantized local model conversion and chat/tool API; corrected and documented image/cwd launch failures; unchanged original PassAgent reaches first model request (Step142).

## 2026-10-31

Preserved first genuine original PassBench no-match feedback; published 2357-word technical reference20 to Obsidian and verified pushed vault commit1510350; original50-step smoke remains active (Step143).

## 2026-10-31

Singleton view binding passes57 FX tests and expands import eligibility to1251/76; froze all seven new families/55 variants. Original50-step run audited:7 no-match evaluations, placeholder reward excluded; exact DGX tracer mismatch confirmed and server stopped (diary144–145).

## 2026-10-31

Completed singleton cohort audit:31 tasks/358 graphs cumulative nominal acceptance,72 exact finite native outputs; retained2 numerical failures and33 unexecuted variants. Reference21 and updated intern overview explain terminal agent and matcher diagnostics (Step146).

## 2026-10-31

Published and pushed2762-word reference21 to go-go-parc in ef4b0d8; verified remote main and exact report-body identity. Compiler a040057, source/evidence584e341; complete goal remains active (diary147).

## 2026-10-31

Isolated task10 export failure to convolution accumulation; native CUDA FP16 matches retained frontend row, so no oracle/tolerance change. Preserved scripts415–419, witness/results and design19; coverage remains31/358 (diary148).

## 2026-10-31

Reassessed all148 diary checkpoints/design series and authored6303-word reference22; archived supplied meta-compiler study, selected R2E-Gym native-task direction, and preserved full-shape CUDA evidence contradicting smaller oracle inference. No production or coverage change (diary149).

## 2026-10-31

Published complete6303-word reassessment reference22 append-only to go-go-parc; vault5347eea is pushed and exact committed/body bytes verified. Source/evidence d3e37fb; overall goal remains active (diary150).

## 2026-10-31

Implemented trusted native policy proposal tools, canonical optimization artifacts and charged invalid/duplicate proposal accounting. Final-source operational replay passed on twelve historical training graphs (36 compilations); external LLM, isolated timing and fresh confirmation remain open under task f5d9.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/native_policy_task.py — Native proposal boundary and host-owned ledger

## 2026-10-31

Ran actual native Qwen/R2E-component proposal batch from05efc4c: five steps, two charged submissions, one accepted threshold1.05 artifact. Audited29 raw files and token/tool replay; accepted policy compiles on12 training graphs but all complete program bodies alias baseline. Model server released. Recorded multi-action budget ambiguity and failed-candidate qualification requirements before task f5d9 comparison.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/run_native_policy_agent.py — Actual model-to-native policy path and explicit operational limits

## 2026-10-31

Implemented native proposal-accounting v2: identifiable malformed/multiple/truncated submissions consume slots. Shared qualification and measurement retain per-graph candidate compile failures while controls and declarations stay strict; held-out-only failure does not affect training eligibility.39 focused tests pass;240 archived artifacts retain identities/alias analysis. No new inference or GPU measurement; task f5d9 remains open.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/qualify_policies.py — Shared failure-aware qualification and measurement bindings
- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/run_native_policy_agent.py — Identifiable submission accounting without malformed action execution

## 2026-10-31

Prepared four-slot threshold/random/LLM search comparison with independent training selections and shared confirmation metrics. Twelve training controls compile, eight fresh exact-model confirmation graphs remain uncompiled, deterministic arms each produced four valid proposals, and 53 focused tests pass. Model inference and GPU comparison remain pending.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/integrations/passnet/policy_search.py — Shared search declaration and method-specific selections
