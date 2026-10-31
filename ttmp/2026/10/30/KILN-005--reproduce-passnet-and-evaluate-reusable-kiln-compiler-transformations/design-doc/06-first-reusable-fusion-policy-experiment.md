---
Title: First reusable fusion-policy experiment
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
LastUpdated: 2026-10-30T22:33:32.707565887-04:00
WhatFor: ""
WhenToUse: ""
---

# First reusable fusion-policy experiment

The immediate research experiment modifies a reusable fusion profitability policy while preserving the matcher, inlining implementation, remaining compiler passes and schedules. Full 200-task support remains a separate active track. This is a direct compiler study, not a replacement for PassBench's published scoring protocol.

## Compiler intervention

`createFusionRule({maxWorkGrowth=1.02, decide=null, onDecision=null})` constructs the existing merge_loop_ops rule. Default mergeLoopOps uses that factory with unchanged settings. The matcher excludes graph outputs and requires loop-kernel consumers; the mutation inlines into the same consumers. The profitability callback receives frozen scalar features: originalWork, fusedWork, consumerCount and producerElements. It returns true, false or a rejection reason. The observer receives frozen decision records.

WorkOf weights memory reads and writes by 12 and arithmetic by the scalar function's flop estimate. It is not a pure arithmetic operation count. The default predicate remains fusedWork <= 1.02 * originalWork. The existing pipeline.replaceRule interface installs a variant without mutating the default pipeline or global rule.

## Frozen corpus and structural preflight

Version 1 froze seven real FP32 graphs from four previously accepted tasks. Training uses task families 0 and 11; held-out uses 1 and 198. Exact source-model identities do not overlap. Source selection deduplicates generated programs, chooses minimum and maximum eligible input volume per family, excludes convolution, and limits inputs to 20M elements.

The preflight showed all seven unchanged/default artifacts identical. Thresholds 1.25 and 2 reduced the LINKX normalization program from two kernels to one; disabled fusion changed all programs. However, relaxed policies changed none of the original held-out artifacts. Those graphs provide regression evidence but no opportunity to observe speed improvement.

Before any GPU candidate timing, version 2 therefore adds held-out task families 81 and 153: residual/spatial-mean/dropout/batch-normalization and batch-normalization/residual/ReLU/spatial-mean. They use distinct RepViT and RepGhostNet models. Version 2 contains three training and seven held-out graphs across six task families. The first frozen version remains archived as structural preflight evidence. No performance feedback was used to expand membership.

These graphs come from the paper's evaluation list and were partly observed during integration. The experiment is an explicitly labeled development study, not an untouched 200-task held-out reproduction. Training and held-out refer to policy-search feedback in this study. A later confirmation should use a separate reserved evaluation protocol and avoid claiming these development tasks were unseen.

## Reference domains and executable identity

Synthetic compiler checks use the same deterministic inputs under every policy. A separately hashed sidecar records source-derived domain constraints: running variance is made positive using abs(value)+0.1. FX resolves source aliases to input placeholders. GPU correctness instead uses original PassBench replay inputs and the trusted source module. No tolerance is loosened.

Each compilation records source hashes, full executable fingerprints, kernel identities, policy decisions, JavaScript pipeline/reference/export time and reference-check outcomes. A skipped large reference check is recorded as skipped. Structural qualification requires default fingerprints and actual semantic artifact bodies to equal unchanged compilation. Each exported file receives a SHA256 in the gate receipt; the measurement runner checks those bytes before loading it.

## Measurement and selection

The frozen plan uses 20 warmups, 100 trials and three repeats. Distinct executable fingerprints are measured in seeded shuffled order on each repeat. Identical executable artifacts share measurement evidence, rather than competing on random timing noise. Correctness checks cover every output and verify inputs were not modified. A correctness or persistent stability failure makes a candidate ineligible.

Two metrics are separate: synchronized end-to-end time includes runtime allocations, launch and final synchronization; CUDA event stream elapsed time includes host dispatch gaps and is not pure device-kernel duration. IQR must be at most 20% of median for each metric; at most two retries are permitted. Raw samples and retries are preserved.

Selection uses only completed training measurements with exact expected graph membership and the predeclared candidate list. Within each task family it averages log speedup relative to unchanged Kiln, then averages families equally and exponentiates. Compile-cost coefficient is zero for this first pilot; JavaScript compilation and NVRTC program-load cost are recorded separately. Exact ties preserve declaration order, preferring unchanged Kiln, then the more conservative threshold before a larger threshold.

Held-out timing is unavailable to candidate selection. The held-out runner requires a completed training selection and measures only unchanged Kiln and that selected policy. It does not run the whole candidate grid on held-out timing. Policy selection and held-out evaluation receipts remain separate from official PassBench coverage and scores.

## Completion gates

1. Default factory equals unchanged compiler artifacts; candidate controls compile and expose a nontrivial training contrast.
2. Unchanged compiler and candidates pass source-model CUDA correctness, with complete exact graph membership.
3. Training selection is recorded before held-out timing starts.
4. Held-out result reports correctness, timing, artifact changes, family weighting and limitations without tuning on that result.
5. A later policy/program experiment extends this harness; a threshold sweep alone is not a new rewriting algorithm or completed recursive compiler improvement.
