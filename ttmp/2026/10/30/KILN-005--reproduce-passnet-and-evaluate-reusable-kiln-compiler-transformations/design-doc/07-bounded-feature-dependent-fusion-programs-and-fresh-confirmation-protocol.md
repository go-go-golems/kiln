---
Title: Bounded feature-dependent fusion programs and fresh confirmation protocol
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://integrations/passnet/fusion_policy.mjs
      Note: Bounded compiler-feature policy interpreter
    - Path: repo://integrations/passnet/qualify_policies.py
      Note: Independent structural qualification
    - Path: repo://ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/policy-corpus-v3/measurement-plan.json
      Note: Frozen candidate and timing protocol
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

## Adaptive training study, corpus version 4

The completed v3 study becomes development evidence. Version 4 reuses its 12 training graphs, explicitly acknowledging prior observed timings, and reserves eight different exact confirmation models/program hashes. All previously selected policy-study models and accepted-task models are excluded from new confirmation eligibility. Selection uses the pinned official training list, deterministic task ordering and the same input/intermediate volume envelope. This is adaptive training with fresh exact-model confirmation, not independent architecture-family or paper-benchmark evaluation.

`propose_policy.py` consolidates deterministic candidate generation. Its fixed budget is 12 programs: unchanged/default controls, four strict scalar thresholds (1.0, 0.95, 0.9, 0.75), disabled fusion, and five conditional programs. Conditions use training feature quantiles or single-consumer structure. Median producer size is 432128, lower-quartile producer size is 6272 and median original work is 32058496. These cutoffs come only from the saved 70 training decisions; no timing enters their calculation. The grammar itself was authored by the current Codex session. It is deterministic template synthesis, not an external LLM invocation.

The proposal generator filters exact training graph membership before reading any decisions, validates successful training records, and hashes only training trace evidence. Tests modify held-out records to malformed values and confirm proposals remain identical. New confirmation source selection occurs after proposals are written. `stage_corpus.py` centralizes exact manifest source staging so compiled artifacts cannot proceed to replay merely because generated scripts were available.

Version 4 membership hash is `c9d44fa395e7e393552b62ec62d8363c0999be7adf091e22e2911fb8cb6fe115`. All 240 combinations compile. Default equivalence and absence of cross-split baseline executable aliases hold. Changed training counts are scalar100=1, scalar095=2, scalar090=2, scalar075=4, disabled=9, tree-large-strict100=0, tree-large-strict090=1, tree-small-strict100=1, tree-high-work-strict095=1 and tree-single-strict090=2. Thus this study can measure actual training interventions rather than exclusively exact aliases. Candidates, membership, trace provenance and the unchanged timing budget are frozen before new performance measurement.

Qualification additionally requires receipt policy declarations and artifact policy metadata to equal frozen JSON, all compiler targets to match, kernel counts to match artifacts, and one fingerprint never to identify different executable bodies. The latter protects shared timing evidence from incorrect aliasing. These checks strengthen the shared evaluator without introducing another experiment-specific benchmarking implementation.
