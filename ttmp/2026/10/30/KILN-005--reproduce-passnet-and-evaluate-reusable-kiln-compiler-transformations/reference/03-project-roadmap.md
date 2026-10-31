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
| Basic integration | Six complete tasks / 76 variants verified under declared modified protocols | Matching/checking/score evidence with protocol identity |
| Precision and layouts | Active | Real-task FP16/BF16, stride/layout and stream correctness |
| Operation coverage | Mostly pending | Task dependency matrix and implementation/tests for all required operations |
| Full benchmark integration | Pending | Every task/variant accounted for with integrity/correctness/scoring |
| Controlled measurements | Pending | Isolated timing, stability checks, provenance and complete comparisons |
| Original PassAgent | Pending | Recorded model/budget/trajectories on declared task set |
| Kiln meta-optimization | Scalar pilot positive; two conditional-policy studies complete without improvement | Fixed train/held-out split, reusable policies/passes and measured generalization |
| Reports and delivery | Ongoing | Milestone vault reports committed/pushed and updated guide editions |
| Completion audit | Pending | Requirement-by-requirement current-state evidence |

Teacher trajectory generation/student fine-tuning remains a separate expensive reproduction phase and has not run. Current work must not be described as complete PassNet reproduction.

## Priority change: start reusable-policy optimization before full corpus support

The user explicitly requested streamlining toward self-optimization. Full 200-task compiler support remains a separate active track; it is no longer a prerequisite for the first compiler-policy experiment. Current exact acceptance at nominal t=-5 is eleven complete tasks containing 141 graphs, with 206 individually passing graphs including partial tasks. Translation succeeds for 1029 graphs and 51 complete tasks, with compilation and numerical eligibility still to be established for the broader set.

The immediate critical path is:

1. Freeze an eligible real-graph corpus and split by graph/model family into training and held-out sets; keep every variant of a family on one side.
2. Measure unchanged Kiln with fixed hardware, schedules/settings and correctness criteria. Record compile time, kernel identities and end-to-end/GPU latency separately.
3. Expose mergeLoopOps profitability as an explicit compiler-policy factory while preserving semantic legality and default behavior.
4. Verify that candidate policies actually change decisions/artifacts on the chosen graphs; identical artifacts provide no optimization signal.
5. Search policies only on training graphs, select one policy and evaluate it unchanged on held-out graphs. Report correctness failures and compile-cost changes.
6. Extend the same harness to generated reusable policies and transformation programs; use original PassBench for external comparisons.

The existing default is fused work <= 1.02 × original work. An initial scalar-threshold study now selects 1.25 and measures 1.0186x family-balanced held-out e2e speedup on seven FP32 development graphs; only one held-out executable changes. Two subsequent bounded-policy studies have measured generated conditional programs without an improvement; new rewrite algorithms and an external agent comparison remain unmeasured. Direct FX-to-Kiln experiments avoid the per-task matcher-authoring step, but are separate from PassBench acceptance and scores. Unrelated missing operator implementation is deferred while this path is built.

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
