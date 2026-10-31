---
Title: Bounded feature-dependent fusion programs and fresh confirmation protocol
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
LastUpdated: 2026-10-30T23:35:46.118213126-04:00
WhatFor: ""
WhenToUse: ""
---

# Bounded feature-dependent fusion programs and fresh confirmation protocol

A profitability policy decides whether an already matched, legal transformation should execute. This experiment changes that decision while retaining Kiln's existing loop fusion matcher and graph mutation. It extends the scalar-threshold experiment with generated conditional programs, then checks whether those programs improve previously unused source graphs. Syntax expressiveness and measured compiler improvement are separate outcomes.

## Intervention and API

`integrations/passnet/fusion_policy.mjs` exports `prepareFusionPolicy(policy, limits)`. The result contains `apply`, `nodeCount`, and a `decide(features)` closure for `createFusionRule`. The unchanged policy has `apply=false`, so the existing pipeline remains intact. Other policies install the same rule through `pipeline.replaceRule`; no global compiler default is changed.

The schema is `kiln-fusion-policy/1`. Every policy has an identifier and one of three kinds: unchanged, threshold, or decision-tree. A threshold compares fusedWork to originalWork multiplied by a constant. A tree branches on a scalar feature and ends in a threshold or Boolean leaf. The interpreter accepts only originalWork, fusedWork, consumerCount and producerElements. The work estimates include weighted memory operations; they are not measured latency or pure arithmetic counts.

```json
{
  "format": "kiln-fusion-policy/1",
  "id": "small-single",
  "kind": "decision-tree",
  "tree": {
    "if": {"feature": "producerElements", "op": "le", "value": 512},
    "then": {"threshold": 1.08},
    "else": {"threshold": 1.02}
  }
}
```

Preparation validates each node and compiles closures that capture scalar values. Retaining the original mutable JSON node would allow a later edit to change an already validated policy. Tests explicitly mutate both threshold and Boolean input leaves after preparation and verify unchanged decisions.

Programs have at most 31 nodes and depth six. Comparisons are lt, le, gt, ge and eq. Cutoffs and features must be finite and nonnegative. Thresholds range from zero to two. Independently of a tree's output, fusedWork greater than twice originalWork is rejected. These are bounded experimental policy constraints, not a general security sandbox. The generated program receives no tensor values and executes no eval or imports.

## Fresh source selection

Scripts 80 and 81 freeze the corpus and candidate set. Selection reads the pinned official PassNet training list, deterministically orders task directories by SHA256, and examines up to eight FP32 variants per task. It excludes exact models and generated source hashes already observed in accepted workloads or the previous policy study. Eligibility limits input volume and excludes convolution, matmul, embedding and functional linear operations for this initial experiment. Unsupported importer cases remain in the scan audit.

One source graph is retained per exact model and task. A hash of the source model assigns its split, with quotas of 12 training and eight held-out programs. The final manifest contains 20 exact models after scanning 516 task directories. Metadata inspection also checks intermediate tensor volumes. Largest individual tensor volume is 1,572,864 elements; largest summed intermediate tensor volume is 6,291,456. Distinct exact models do not imply independent architecture families.

The frozen membership identity is `3012570a49bd83e072278df39e3d7f30478ad7990156a371242ae739c4ffde8e`. The generated Kiln program hash is checked again during compilation. `reference_domains.py` identifies running-variance placeholders from source FX batch-normalization calls, following supported metadata aliases. Positive variance constraints apply to compiler reference inputs; they do not replace runtime graph inputs with constants.

## Proposal provenance and controls

The current Codex session authored the candidate hypotheses from the previous pilot's observations, before fresh GPU timing. The precise serving snapshot is not recorded. This is not an independent external-model evaluation or reproduction of the original PassAgent.

Eight candidates are declared: unchanged baseline, explicit default 1.02, scalar 1.08, four conditional policies targeting small producers, single consumers or low original work, and scalar 1.25. Candidate order defines exact-score tie breaking. Baseline is first, so a candidate with identical code receives no advantage from timing noise or greater complexity.

Compilation produces an artifact, kernel identities, decision traces and receipt for every candidate/graph pair. `qualify_policies.py` checks membership, source hashes, complete successful compilation, artifact identities and reference-domain identity. It requires explicit default executables to equal unchanged compiler executables. It also reports identical baseline executable bodies across train and held-out partitions rather than treating aliases as independent performance contrasts.

## Measurement and decision protocol

The plan retains 20 warmups, 100 trials, three repeats, seeded randomized order among distinct fingerprints, and a maximum IQR/median fraction of 0.2 with two retries. Identical executables within a graph share correctness and timing evidence. End-to-end timing includes allocation, invocation and synchronization. CUDA-event stream timing includes dispatch gaps and must not be called pure kernel latency.

Selection reads only complete training measurements. It maximizes a family-balanced geometric mean end-to-end speedup relative to unchanged Kiln; compile-cost coefficient is zero. Numerical or timing failures make a candidate ineligible. Held-out evaluation may execute only the unchanged compiler and the fixed selected policy. Candidate and corpus files must not change in response to held-out timings.

## Structural qualification result

All 160 candidate/graph combinations compile. Explicit default equals unchanged on every executable, and no exact baseline executable aliases cross the split boundary. All four tree policies and scalar 1.08 produce unchanged code throughout this corpus. Scalar 1.25 changes a single held-out upernet-convnext-tiny graph from two kernels to one, with no changed training program.

Consequently, this proposal set cannot justify selecting an improved compiler from training performance. If baseline correctness qualifies, exact training ties select baseline. We preserve that negative result. Measuring the changed held-out scalar and choosing it afterward would violate the registered training-only decision protocol. A subsequent synthesis study can use training decision traces and a new declared proposal budget, with the previous confirmation graphs explicitly marked as already observed.

## Relation to full reproduction

This direct policy study does not run the original PassBench matching/scoring pipeline and adds no complete accepted benchmark tasks. Current accepted coverage remains five tasks and 73 variants under documented modified protocols. Importer eligibility remains a separate count. Full benchmark support, original PassAgent reproduction and independent hardware-matched paper reproduction remain unfinished.
