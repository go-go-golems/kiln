---
Title: Selective consumer fusion and retained producer cost contracts
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
LastUpdated: 2026-10-31T03:37:40.569598617-04:00
WhatFor: ""
WhenToUse: ""
---

# Selective consumer fusion and retained producer cost contracts

## 1. Motivation and scope

The completed rich policy study selected a 1.05 work-growth threshold but measured essentially no improvement on confirmation. Changing the aggregate acceptance bound still applies the same graph mutation: Kiln inlines a producer into every direct consumer or declines the complete proposal. This document extends the mutation itself so that a policy can choose a subset of consumers.

The implementation is opt-in. `createFusionRule` gains an optional `selectConsumer` function, while its existing default continues selecting all consumers. The standard compiler pipeline retains the same rule and default bound. The integration's bounded policy language gains a selective kind with separate consumer and aggregate decision trees. This is an implemented new transformation capability; its profitability on independent workloads remains an experimental question.

## 2. Graph semantics and lifetime

Let p be a producer kernel with consumers c1 through cm. Selecting a subset S changes only the chosen consumer expressions. Every load of p in a selected consumer is replaced with p's expression, evaluated at the original load coordinates. Unselected consumers retain their original input edges and node objects.

If S contains every consumer, ordinary dead-code elimination removes p. If any consumer still reads p, p remains materialized and is dispatched through the existing program scheduler. No special lifetime table or runtime dispatch mode is needed. `Graph.dce` traverses from graph outputs and effectful nodes; `tx.set` changes only the selected nodes and invalidates normal graph caches.

```text
Before:                   Partial selection:
       p -> c1 -> out1     p expression -> c1 -> out1
       p -> c2 -> out2     p ------------> c2 -> out2
```

The selector operates on one unmodified graph snapshot. The rule plans every replacement before calling `tx.set`, so a previous consumer edit cannot change a later selection's features. Empty selection uses the engine's skip path and produces no rewrite. The existing transactional guard restores the original graph if aggregate profitability is rejected.

The match still excludes graph-output producers and requires every direct consumer to be a loop kernel. These restrictions preserve the current pure-kernel inlining scope. The transformation does not implement tensor alias writeback, mutation of user storage or side-effecting kernels.

## 3. Account for a retained producer

The original all-consumer rule can omit p from the post-mutation cost because no consumer reads it. That assumption is invalid for partial fusion. For a selected subset S, the affected-region work is:

\[
W_0=W(p)+\sum_{c\in U(p)}W(c),
\]

\[
W_1=\mathbf{1}_{p\;live}\,W(p)+\sum_{c\in U(p),\;c\;live}W(c').
\]

Here c' is either the inlined selected consumer or the unchanged unselected consumer. Both complete and partial fusion now use this aggregate formula. For complete fusion, p is dead and the formula reduces to the previous behavior.

`workOf(schedule(...))` weights scalar operations and memory traffic by loop trip counts. The model is not a measured latency estimate: retained producer launches, cache behavior, occupancy and duplicated arithmetic can make a model-approved change slower. The implementation establishes correct accounting under the existing model, not a new cost-model accuracy claim.

A regression fixture specifically distinguishes the formulas. Its partial mutation exceeds a 1.02 aggregate bound when the retained producer is counted, but would pass if that cost were omitted. Rejection restores the original selected consumer object and graph identity.

## 4. Compiler API

The existing factory now supports:

```javascript
std.loop.createFusionRule({
  maxWorkGrowth: 1.02,
  selectConsumer: features => features.consumerElements <= 128,
  decide: null,
  onDecision: event => record(event)
});
```

The optional selector must return a Boolean. It receives frozen scalar features: producer work, original consumer work, proposed fused-consumer work, number of consumers, consumer index, producer element count and consumer element count. It receives no mutable graph or tensor data. The general JavaScript API exposes an index for deterministic caller choices; the agent-facing declarative grammar deliberately excludes consumer order and node IDs.

The existing `decide` callback continues to receive aggregate original/fused work, consumer count and producer element count. Its decision is evaluated after substitution and dead-code elimination, so the retained-producer term is observable. Diagnostics add selected-consumer count and whether the producer remains live.

Inlining itself remains centralized in `inlineInto`. That function already remaps shared inputs, substitutes producer coordinates and introduces fresh reduction binders. The new selector does not create a second expression substitution implementation.

## 5. Agent-facing programs

A selective policy contains two bounded trees:

```json
{
  "format": "kiln-fusion-policy/1",
  "id": "select-small-consumers",
  "kind": "selective",
  "consumer_tree": {
    "if": {"feature": "consumerElements", "op": "le", "value": 128},
    "then": {"threshold": 1.1},
    "else": {"accept": false}
  },
  "tree": {"threshold": 1.02}
}
```

This is an illustrative valid program, not a selected research result. A threshold in the consumer tree compares fused-consumer work with original consumer work; it does not subtract the producer as though it were dead. The aggregate tree compares complete affected-region costs, including a retained producer. The existing two-times hard aggregate growth cap still applies.

The trees share a total 31-node budget and a maximum depth of six. Consumer predicates may read producer/consumer work, fused-consumer work, consumer count and producer/consumer element counts. Aggregate predicates retain the existing feature set. Unknown fields, invalid features, malformed leaves and nonfinite values are rejected. Validation compiles immutable closures so editing the original JSON cannot change later decisions.

`compile_policy.mjs` passes both interpreted functions to the existing fusion-rule factory. Receipts, artifact hashing, source provenance, qualification, GPU measurement and training selection remain shared with earlier studies. Historical results stay tied to their recorded revisions; they are not regenerated with this new compiler.

## 6. Validation and fresh evaluation

The focused compiler test verifies selected and unselected edges, retained producer identity, exact output structure, aggregate accounting, rollback, empty-selection skips, select-all equivalence and repeated operands with nested reductions. The policy test exercises both tree validation and real graph transformation. At the implementation boundary, all 29 compiler test files and the declarative policy tests pass.

Independent CUDA fixtures contain elementwise, reduction and nested-reduction fanout graphs in FP32, FP16 and BF16. They compile under unchanged, none, partial and all selection modes: 36 artifacts total. Each compile runs normal reference checking under separate FP32 arithmetic. Three random seeds give 108 intended GPU comparisons against independently expressed PyTorch equations, including unchanged-input assertions. These establish tested numerical behavior, not benchmark coverage or generalization.

A fresh v6 source declaration excludes exact models and generated programs from every prior policy corpus, including v5. It keeps the earlier resource bounds and per-category quotas, but uses a new declared salt. It selects twenty sources after 2,549 tasks: twelve training and eight confirmation. Membership is `0547e152ab29ae79070177cec031ddb393751f2b45d13499548a583668e7203f`. Confirmation has not been compiled or timed at this design checkpoint.

The next experimental steps are training-only structural analysis, frozen candidate generation and reference-protocol declaration, full compilation qualification, training selection committed before confirmation timing, and unchanged confirmation evaluation. Reference precision must be explicit from the outset. If the baseline fails, the study must retain that failure rather than filtering examples or silently modifying precision.

## 7. Evidence and open limits

Primary implementation files are `packages/kiln/src/std/loop.js`, `packages/kiln/test/selective-fusion.mjs`, and the integration's `fusion_policy.mjs`, `test_fusion_policy.mjs` and `compile_policy.mjs`. Saved scripts 185–189 preserve the initial diagnostic, validation boundary, fresh selection and CUDA fixture construction/checking.

The first targeted test incorrectly expected only two selector calls while its scalar constants introduced two additional broadcast kernels. Script 185 records the extra legitimate candidates. The fixture now uses tensor inputs for both consumers, isolating the producer lifetime being tested; compiler behavior was not weakened to satisfy the call count.

The initial transformation does not choose a globally optimal consumer subset, explore schedules jointly with selection, synthesize a new reduction algorithm or prove native reduced-precision library equivalence. Its purpose is to make selective graph mutation available through one shared compiler primitive with correct retained-work accounting. Measurement must determine whether any reusable policy can profit from that capability.
