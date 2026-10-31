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
| Original baselines | Exploratory run active | All task results, isolated reruns, settings reconciled, official aggregation |
| Basic integration | Four complete tasks / 49 variants verified under declared modified protocols | Matching/checking/score evidence with protocol identity |
| Precision and layouts | Active | Real-task FP16/BF16, stride/layout and stream correctness |
| Operation coverage | Mostly pending | Task dependency matrix and implementation/tests for all required operations |
| Full benchmark integration | Pending | Every task/variant accounted for with integrity/correctness/scoring |
| Controlled measurements | Pending | Isolated timing, stability checks, provenance and complete comparisons |
| Original PassAgent | Pending | Recorded model/budget/trajectories on declared task set |
| Kiln meta-optimization | Initial FP32 threshold study qualified; generated policies pending | Fixed train/held-out split, reusable policies/passes and measured generalization |
| Reports and delivery | Ongoing | Milestone vault reports committed/pushed and updated guide editions |
| Completion audit | Pending | Requirement-by-requirement current-state evidence |

Teacher trajectory generation/student fine-tuning remains a separate expensive reproduction phase and has not run. Current work must not be described as complete PassNet reproduction.

## Priority change: start reusable-policy optimization before full corpus support

The user explicitly requested streamlining toward self-optimization. Full 200-task compiler support remains a separate active track; it is no longer a prerequisite for the first compiler-policy experiment. Current exact acceptance is five tasks / 73 graphs. Translation succeeds for 804 graphs and 24 complete tasks, with compilation and numerical eligibility still to be established for the broader set.

The immediate critical path is:

1. Freeze an eligible real-graph corpus and split by graph/model family into training and held-out sets; keep every variant of a family on one side.
2. Measure unchanged Kiln with fixed hardware, schedules/settings and correctness criteria. Record compile time, kernel identities and end-to-end/GPU latency separately.
3. Expose mergeLoopOps profitability as an explicit compiler-policy factory while preserving semantic legality and default behavior.
4. Verify that candidate policies actually change decisions/artifacts on the chosen graphs; identical artifacts provide no optimization signal.
5. Search policies only on training graphs, select one policy and evaluate it unchanged on held-out graphs. Report correctness failures and compile-cost changes.
6. Extend the same harness to generated reusable policies and transformation programs; use original PassBench for external comparisons.

The existing default is fused work <= 1.02 × original work. An initial scalar-threshold study now selects 1.25 and measures 1.0186x family-balanced held-out e2e speedup on seven FP32 development graphs; only one held-out executable changes. No generated decision program, new rewrite algorithm or agent comparison has been measured yet. Direct FX-to-Kiln experiments avoid the per-task matcher-authoring step, but are separate from PassBench acceptance and scores. Unrelated missing operator implementation is deferred while this path is built.
