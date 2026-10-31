---
Title: Fixed compiler confirmation protocol with fresh exact model families
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T06:37:14.949949015-04:00
WhatFor: ""
WhenToUse: ""
---

# Fixed compiler confirmation with fresh exact model families

Task p4wv evaluates whether the already chosen singleton-coordinate rewrite transfers beyond the examples that motivated it. This is a confirmation-only comparison, not a new profitability-policy search. The candidate production source is fixed at fed37d1 and the control at c15c610. Their 86 pinned production compilation files differ only in tensor.js.

## Source selection

The existing metadata selector permits an explicit zero training quota. The declaration requests ten matrix graphs and ten reduction graphs, all marked heldout. Selection uses salted task-hash order over the official 4,476-task training list, the declared FP32/static volume envelope, and at most one graph per exact model and selected task. It does not require a changed executable or a predicted speedup.

All exact models in the 200-task evaluation set are excluded. Previously selected programs/models in twelve complete or partial policy-study audits are also excluded, including the failed v8/v8-r1 selections. The combined prior inventory has 123 unique graph/source records. Metadata-only scans that did not select a model are not treated as previous optimization measurements. Architecture relatives can remain, so the result must not be called architecture-disjoint generalization.

The selected population is bounded to two million total input elements, eight million elements per intermediate tensor, 64 million total tensor elements, 128 tensor nodes and 64 million matrix products. The first eligible ten examples per category are retained. Any incomplete scan stays on disk. No graph is replaced because compilation, correctness, timing or artifact sensitivity later fails.

## Compiler controls and dependencies

A detached baseline worktree contains c15c610, while the active worktree supplies candidate production sources matching fed37d1. Separate checkouts prevent control compilation from mutating the active compiler. Frozen production inventories prove the exact one-file difference. Both receive byte-identical importer-generated programs and use the same current Python/CUDA measurement runtime.

The initial package-manager bootstrap fails because the declared pnpm@12.4.1 is unavailable from the registry. The compiler-only control instead receives the active compiler's exact Acorn 8.19.0 bytes and worktree-local @kiln/kiln and @kiln/evidence links. Dependency hashes and Node version are recorded separately; checked-out production sources and manifests are not edited. This is a disclosed experimental bootstrap, not a claim that the repository's full package-manager setup has been reproduced.

Compilation should reuse the existing compile_policy.mjs pipeline with the unchanged fusion policy in both compiler versions. It must not fake an old policy-search training selection or default-equivalence gate. A fixed-compiler comparison has its own source-pair qualification while sharing low-level compilation, runtime, correctness and timing primitives.

## Frozen numerical and timing protocol

Both variants use separate elementary FP32 rounding. The native reference explicitly uses highest-precision FP32 matrix arithmetic, matching the preceding compiler-policy research protocol. Strict dtype-aware output comparison, output structure and unchanged inputs are checked. This is not native PassBench acceptance and does not reclassify the existing 60/63 native fixture outcome.

The declaration fixes seed 42, 20 warmups, 100 trials per metric, three repeats, IQR at most 20 percent of median and at most two retries. Exact distinct executable fingerprints are shuffled deterministically per graph/repeat; aliases share measurements. Synchronized end-to-end and CUDA-event stream elapsed time remain separate metrics.

Every selected graph remains in the result. Compile, source-reference, correctness and stability failures are retained and disable aggregate speedup reporting. Successful timing differences on unchanged executable fingerprints are identity observations, not independent optimization evidence. No calibrated confidence interval is claimed from three repeats.

## Commitment sequence

1. Commit the selector extension, exact-model exclusions, production snapshots and declaration before source selection.
2. Freeze all selected graph membership and source bytes without compilation/timing feedback.
3. Complete and commit the shared confirmation execution code and its code hashes before compiling the selected population.
4. Compile both isolated production versions, record complete source and dependency evidence, and preserve every failure.
5. Run the fixed comparison without ranking, training or changing candidate source.
6. Audit complete membership, source/measurement hashes and all failure records before interpreting a generalization result.

The full reproduction, source/dtype/layout coverage, original PassAgent and updated device-document delivery remain separate active requirements. Completing this confirmation does not complete the overall goal.

## Initial metadata failure and explicitly broader second declaration

The first scan reaches all 4,476 training tasks and selects ten matrix families but only nine reduction families. It remains failed at 19/20 with its audit and generated sources preserved. No confirmation source is compiled or timed before this result.

The second declaration keeps the same quotas, salt, exclusion inventory, compiler pair and numerical/timing/failure rules. It increases the memory envelope to eight million total input elements, 32 million elements per tensor and 128 million total tensor elements. The matrix product ceiling stays 64 million. This broadens the eligible population rather than lowering the quota to nineteen.

The second attempt may reuse metadata-only choices from the first attempt; those are not independent additional confirmations. All official evaluation models and previous policy-study selections remain excluded. The fixed rewrite is unchanged and no artifact or timing feedback informs this amendment.

The confirmation harness reuses compile_policy.mjs with unchanged fusion configuration in each pinned compiler, and measure_policy.sample for timing. Its fixed-source qualification and all-heldout summary are independent of policy-search training-selection receipts. Critical regression tests verify exact alias handling, missing members/repeats and the rule that every compile/reference/correctness/timing failure disables aggregate speedup reporting.
