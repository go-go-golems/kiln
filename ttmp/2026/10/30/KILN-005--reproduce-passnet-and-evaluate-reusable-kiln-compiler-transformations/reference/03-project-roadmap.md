---
Title: Project phases and completion gates
Ticket: KILN-005
Status: active
Topics: [kiln]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Full scope and current milestone gates
---

# Project phases and completion gates

The target is evaluation across all 200 PassBench tasks and 2,060 variants with explicit coverage and failures. Full implementation support remains the target; unsupported cases must not disappear from denominators. Restricted development checks are intermediate gates.

| Phase | State | Required completion evidence |
|---|---|---|
| Workspace and acquisition | Complete | Worktree, ticket, pinned paper/code/dataset and materialization receipts |
| Intern design | Progress edition delivered | Updated technical guide with actual final architecture and verified reMarkable delivery |
| Original baselines | Full exploratory audit complete; controlled measurements pending | All task results, isolated reruns, settings reconciled, official aggregation |
| Basic integration | Twenty-seven complete tasks / 338 individually passing graphs, cumulative modified-protocol evidence | Matching/checking/score evidence with protocol identity |
| Precision and layouts | Active | Real-task FP16/BF16, stride/layout and stream correctness |
| Operation coverage | Active: 1,196 graph imports / 69 complete families; broader execution qualification pending | Task dependency matrix and implementation/tests for all required operations |
| Full benchmark integration | Pending | Every task/variant accounted for with integrity/correctness/scoring |
| Controlled measurements | Pending | Isolated timing, stability checks, provenance and complete comparisons |
| Original PassAgent | No configured provider; local serving feasibility documented | Recorded model/budget/trajectories on declared task set |
| Kiln meta-optimization | Reusable policies measured; singleton reshape rewrite improves the development replay; fresh exact-model confirmation complete (1.053746x e2e) | Fixed train/held-out split, reusable policies/passes and measured generalization |
| Reports and delivery | Ongoing | Milestone vault reports committed/pushed and updated guide editions |
| Completion audit | Pending | Requirement-by-requirement current-state evidence |

Teacher trajectory generation/student fine-tuning remains a separate expensive reproduction phase and has not run. Current work must not be described as complete PassNet reproduction.

## Priority change: start reusable-policy optimization before full corpus support

The user explicitly requested streamlining toward self-optimization. Full 200-task compiler support remains a separate active track; it is no longer a prerequisite for the first compiler-policy experiment. Current exact acceptance at nominal t=-5 is twenty-seven complete tasks containing 273 graphs, with 338 individually passing graphs including partial tasks. Translation succeeds for 1,196 graphs and 69 complete tasks; the repaired ten-family/93-variant softmax cohort accepts every variant after the functional-default matching repair. Compilation and numerical eligibility remain separate gates for the broader set.

The initial self-optimization dependency sequence is implemented and measured through held-out confirmation; broader external-agent synthesis remains open:


1. Freeze an eligible real-graph corpus and split by graph/model family into training and held-out sets; keep every variant of a family on one side.
2. Measure unchanged Kiln with fixed hardware, schedules/settings and correctness criteria. Record compile time, kernel identities and end-to-end/GPU latency separately.
3. Expose mergeLoopOps profitability as an explicit compiler-policy factory while preserving semantic legality and default behavior.
4. Verify that candidate policies actually change decisions/artifacts on the chosen graphs; identical artifacts provide no optimization signal.
5. Search policies only on training graphs, select one policy and evaluate it unchanged on held-out graphs. Report correctness failures and compile-cost changes.
6. Extend the same harness to generated reusable policies and transformation programs; use original PassBench for external comparisons.

The existing default is fused work <= 1.02 × original work. An initial scalar-threshold study now selects 1.25 and measures 1.0186x family-balanced held-out e2e speedup on seven FP32 development graphs; only one held-out executable changes. Two subsequent bounded-policy studies have measured generated conditional programs without an improvement; a reusable singleton-reshape algorithm is now measured on the development corpus; fresh exact-model confirmation reports 1.053746x e2e improvement; an external agent comparison remains unmeasured. Direct FX-to-Kiln experiments avoid the per-task matcher-authoring step, but are separate from PassBench acceptance and scores. With this experiment harness established, missing source operators and complete-family qualification have resumed alongside the remaining synthesis work. Historical results are preserved in the dated checkpoints below.

### Fresh conditional-policy checkpoint

The second direct policy study is complete: eight bounded policies compiled on 20 fresh official-training-source graphs (12 train, eight held-out). Every candidate aliases baseline on training, so selection retained unchanged Kiln; all 20 replay checks and stable timing runs qualified. This is a negative optimization result, not full PassBench acceptance. Design 07 and policy-measurements-v2/verified-facts.json own details.

Original-source Inductor reference attempts are complete for all 200 tasks / 2,060 variants. The nominal t=-5 audit accepts 1,748 variants and 140 complete tasks. The previously reported tolerance-one audit accepts 2,039/191 at a relaxed numerical point and must not be described as nominal correctness. Historical timing overlap and different hardware/software prevent a final paper-comparable performance claim. Controlled baseline reruns, original PassAgent evaluation and remaining Kiln task support remain open.

### Activation and ownership checkpoint

SiLU/sigmoid lowering and conservative fresh-single-use functionalization increased import eligibility to 912 graphs / 36 complete tasks. Evaluation task 143 passed all three dtypes through modified-protocol matching, numerical checks and original scoring, increasing verified Kiln coverage to six tasks / 76 graphs. Historical checkpoint: this used upstream tolerance-one acceptance. The subsequent numerical audit corrected the ledger to nominal t=-5; see the checkpoint below. Detailed contracts are in design 02 and guide Section 24.


### Matrix and numerical-audit checkpoint

Matrix semantics, faithful in-place tracing and source-derived canonical matchers are implemented. Independent CUDA fixtures pass 126/126 comparisons. Source-role binding and matcher specificity fixes restore the complete 30-variant residual task under t=-5. The current six complete tasks / 78 individually passing graphs are the corrected nominal coverage; 984 graphs / 43 complete families are import eligibility only.

The shared runner has frozen all newly complete families relative to the activation audit: 14 tasks / 151 variants. Its execution is in progress on bling.local; source and membership hashes are checked at phase boundaries. Original PassAgent, the remaining compiler semantics, controlled full-corpus comparisons and broader transformation synthesis remain open. The full scope has not been reduced to this cohort.


### First matrix cohort result

The 14-task / 151-variant cohort is complete: two additional complete tasks, 68 passing variants, 20 evaluated nonqualifying variants and 63 unexecuted variants from four compiler failures. After overlap accounting, cumulative coverage is 8/200 complete tasks and 144/2060 individually passing graphs. Source eligibility remains 984/43. All four compile-blocked families are retained in a separate 63-variant reference-domain rerun; that result is pending. Guide Section 26 and matrix-cohort-v1-audit.json own the details.


### Reference-domain follow-up

The 63-variant rerun yields five more nominally passing graphs from an incomplete six-variant task; cumulative coverage is 8 complete tasks /149 individual graphs. The remaining compiler checks include sparse finite BF16 discrepancies. An eager synthetic allocation bug on a 411-million-element input is fixed through selective Project.inputsFor sampling and tested against the exact program. The complete nine-variant task is pending a separate original-evaluator rerun; no additional acceptance is claimed.


### FP32 evaluator correction and contraction investigation

The full selective-input rerun is terminal: seven variants compile, the next BF16 reference check fails, and no original evaluation runs. The allocation fix holds. A proven double-versus-FP32 loop-reference defect is corrected and validated against 27 core test files and actual CUDA cancellation. Two preserved real compiler failures now pass unchanged checks; the remaining one disappears when explicit FMA contraction is removed in a diagnostic. Establishing a coherent source/IR/CUDA numerical policy is the next gate; global defaults and official tolerances remain unchanged. Coverage remains 8/200 complete tasks and 149/2060 passing individual graphs.


### Numerical-contract milestone and next optimization gate

Separate-rounding scalar operations are implemented through IR and CUDA intrinsics, while global defaults remain unchanged. The 63-variant complete-task cohort is terminal: all compile/evaluate/score, 62 nominally pass and three additional task families are complete. Cumulative coverage is 11 tasks /206 individual graphs; complete tasks contain 141 graphs. One BF16 RepViT variant remains a nominal failure. Design 09, the intern guide Section 29 and contraction-verified-facts.json own the details, including archived remote source overrides.

The previous 12 training graphs have no reductions, fanout or duplicate internal kernels even before fusion. Before another reusable transformation study, freeze a new official-training-source corpus containing reductions and matrix operations, preserve a fixed numerical contract, demonstrate changed implementations on training, and evaluate the selected policy on fresh confirmation models. Original PassAgent and the remaining full-corpus compiler support remain separate open requirements.


### Rich-corpus self-optimization declaration

Functional LayerNorm reuses the existing compiler primitive after validated flattening; 126 independent CUDA comparisons pass. Import eligibility is now 1029 graphs/51 complete families, while original accepted coverage stays 11/206. A failed metadata selection is preserved, and the unchanged declared envelope succeeds after this missing operator is added.

The new corpus contains twelve training and eight fresh exact-model confirmation sources, balanced between reductions and matrices. Training has eighteen reductions and eleven fanout kernels, in contrast with none in the prior set. Unchanged/default controls agree and twelve reusable profitability programs are frozen before confirmation IR compilation or any new GPU timing. Full compilation, training selection and confirmation are the next gate (task mg15); this is not yet an optimization result.


### Rich policy study result (after training selection and confirmation)

The twelve-policy/twenty-source rich study is complete. All 240 artifacts qualify. Native training remains failed on two TF32-reference disagreements, with no selection. A separately frozen highest-precision FP32 research protocol qualifies all twelve training/eight confirmation graphs and selects scalar105 before confirmation timing (commit 2a4162c). Confirmation ratios are 1.0005681560422044 end-to-end and 0.9995845291040679 stream elapsed: no convincing improvement. See reference 12 and script 183. This completes mg15 without closing original reproduction, all200 coverage, native numerical compatibility or broader pass synthesis. The next proposed substantive transformation is selective producer fusion, rather than more threshold variants on this now-observed population.


### Selective-consumer capability and fresh confirmation

Selective consumer fusion is implemented in the existing rule factory (51b45eb), with retained-producer accounting, 29 passing compiler test files and 108/108 CUDA fixtures. The complete v6 study compiles 240 artifacts and selects select-edge100-total125 before confirmation (731e834). All eight confirmation graphs qualify but measure0.9720486952136568 end-to-end and 0.975410682956454 stream elapsed, a regression. The default remains unchanged. This completes task pgyz's capability/lifetime/fresh-corpus requirements; it does not complete broader pass synthesis or original reproduction. Future cost-model/partition hypotheses must use a new declared population. See design 11/reference 13 and scripts199/200.


### Whole-region planner and evidence identity

The local additive-model planner is implemented (4523355), exhaustive 280-case oracle and 108 CUDA comparisons pass, and all 240 v7 artifacts qualify (114d90b). Training selection is committed in cff6a69. Confirmation passes all eight graphs but measures 0.9900990594274756 end-to-end/0.9865479028062627 stream elapsed, so the default is unchanged. A training-only audit finds eight selected changes equivalent after generated entry/reduction-name normalization; aliases/selection remain frozen. Next: canonicalize generated names and align code/evidence identity before a fresh declaration. Original reproduction/support/synthesis tasks remain open. See design 12/reference 14 and scripts213/214.


### Canonical emission and completed no-change selection

Core e0f64dc canonicalizes reduction names before code emission and fixes spawn-error test acceptance. All32 compiler files execute successfully,8/8 known name-only contrasts resolve exactly, and108 canonical CUDA comparisons pass. Transpose/input-only export support (71fb43d) passes117 CUDA comparisons but leaves import eligibility1029/51 and original acceptance11/206 unchanged. Fresh broader v8-r2 qualifies240 artifacts; training selects baseline in58133d1, every altered candidate is slower, and all eight confirmation graphs qualify. Ratios1.0 are identity comparisons, with no speedup claim. See design13/reference15. Original PassAgent awaits the requested model/provider; remaining full support and synthesis stay open.

### Softmax source checkpoint

Source softmax reuses the existing stable compiler primitive with explicit conversion/axis contracts. All 45 FX tests and 99 CUDA fixture comparisons pass. Import eligibility is now 1,122 graphs/61 complete families. A frozen ten-family/93-graph original-evaluator cohort is the next acceptance gate; strict cumulative acceptance remains eleven complete tasks/206 individual graphs pending that audit. See design 14 and diary Step 122.

### First original softmax cohort audited

All ten families/93 variants compile, execute their original evaluator attempts and score. Strict audit accepts four complete families/21 graphs; the remaining 72 variants fail structural matching. Cumulative coverage is now 15/200 complete tasks, 227/2,060 individually accepted graphs and 162 graphs in complete tasks. The real FX/Dynamo default-argument mismatch is repaired in d71eccd and passes 46 FX tests. The same membership is running separately as softmax-cohort-v2; its result is pending. Source snapshots and failed attempts remain preserved. Design 14 and diary Step 124 own this gate.

### Complete repaired softmax qualification

The d71eccd rerun is terminal and verified: all ten families/93 variants satisfy original replay execution, exactly one replacement and nominal t=-5 correctness. Cumulative coverage is 21/200 complete tasks and 299/2,060 individual graphs; complete tasks contain 234 graphs. Import eligibility remains 1,122/61. Descriptive timings show five variants faster than eager and 88 slower; the worst accepted ratio is about 0.02193x (15.431 ms eager versus 703.734 ms Kiln). This is coverage qualification, not an optimization gain or exact paper reproduction. Reference 16, diary Step 125 and softmax-cohort-v2-verified-facts.json own the full result.

### Singleton reshape compiler improvement and source qualification

Compiler fed37d1 preserves direct unit-axis coordinates and exposes the attention epilogue as a tiled contraction. All 93 unchanged comparison variants pass original nominal checks. The targeted median falls from 703.734 to 20.4884 ms (34.3479x); the observed family-balanced old/new ratio is 1.06444x, with no held-out or paired-statistical claim. Native independent fixtures remain 60/63, with the old/new FP32 tail reference mismatch preserved.

The separate public-reshape cohort passes all three families/14 variants. Cumulative original replay coverage reaches 24 tasks/313 individual graphs; complete tasks contain 248 graphs. Import eligibility is 1,136 graphs/64 complete families. Reference 17, design 15, diary Step 128 and both verified-facts receipts own the evidence. Fresh unseen-family confirmation and original PassAgent remain open.

## Fixed-source fresh-model confirmation checkpoint

Task p4wv is complete: all20 declared exact-model confirmation graphs qualify, with all40 artifacts and23400 raw timing samples independently audited. The observed family-balanced ratios are1.053746x end-to-end and1.059878x stream elapsed. Nine families are faster,ten slower andone is an exact alias. Gains concentrate in the reduction stratum (1.115219x); matrix aggregate is0.995662x. Reference18/design16 own the experiment and its scope. No native PassBench score or architecture-disjoint confidence claim is inferred.

These graphs come from the official training list and do not expand the cumulative evaluation coverage of24 tasks/313 graphs or import eligibility1136/64. The bounded confirmation is finished; original PassAgent setup, full operation/dtype/layout coverage, native precision compatibility, uniform current-release evaluation and approved updated device delivery remain active. Any next policy tuned on this population requires a fresh confirmation set.

## Exact GELU qualification checkpoint

Compiler d316241 adds exact GELU, explicit source mode/FP32 operation math and canonical keyword-only defaults. All34 core tests and52 FX tests pass. Import eligibility is1196 graphs/69 complete families, up60/five with zero regressions. All36 CUDA fixture records pass. The complete five-family/60-variant original run qualifies two families/18 graphs, fails matching for seven graphs and retains35 unexecuted variants from two compile-check failures. Cumulative acceptance is26 tasks/331 individual graphs (266 within complete tasks). Design17, diary136–137 and gelu-source-cohort-v1-verified-facts.json own the evidence.

The seven-variant mismatch is traced to functional LayerNorm keyword-versus-positional affine arguments, with a focused normalizer repair under validation. Sparse FP16 predecessor/reference discrepancies in the two compilation failures remain visible; tolerances are unchanged.

## Complete LayerNorm matching-repair replay

All seven variants of the frozen targeted task qualify after f1e5518: one replacement, successful execution and nominal t=-5 correctness for every graph. Script325 verifies164 committed source files, all seven artifacts, complete membership and scorer/log identity. The existing coverage builder now reports27/200 complete tasks and338/2060 individual graphs, with273 inside complete tasks. Import eligibility remains1196/69. The initial seven matching failures and35 unexecuted variants from two compile-check failures stay archived. Reference19 and diary138 explain the full milestone; original PassAgent and full native/support scope remain open.


### Original-agent operational milestone

The pinned unquantized local provider now serves real tool calls, and the unchanged original PassAgent has invoked the original evaluator and received a genuine no-match rejection. Its50-step shipping smoke remains active at this checkpoint; terminal candidate results and the full official population are separate gates. Design18/reference20 and diary Steps140–143 own model/runtime identities, full200/2060 membership, failures and publication evidence. Kiln coverage is unchanged. The final image corrects shell execution configuration while retaining exactly the audited source layers.
