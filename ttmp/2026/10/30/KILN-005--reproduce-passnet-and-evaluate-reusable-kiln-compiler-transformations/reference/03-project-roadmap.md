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
| Kiln meta-optimization | Pending | Fixed train/held-out split, reusable policies/passes and measured generalization |
| Reports and delivery | Ongoing | Milestone vault reports committed/pushed and updated guide editions |
| Completion audit | Pending | Requirement-by-requirement current-state evidence |

Teacher trajectory generation/student fine-tuning remains a separate expensive reproduction phase and has not run. Current work must not be described as complete PassNet reproduction.
