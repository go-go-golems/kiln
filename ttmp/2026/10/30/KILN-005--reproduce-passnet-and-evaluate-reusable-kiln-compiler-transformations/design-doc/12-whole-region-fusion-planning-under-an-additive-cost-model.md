---
Title: Whole region fusion planning under an additive cost model
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
LastUpdated: 2026-10-31T04:02:11.270610482-04:00
WhatFor: ""
WhenToUse: ""
---

# Whole-region fusion planning under an additive cost model

## 1. The limitation of independent edge decisions

The previous selective policy chose consumer edges independently, then checked the complete mutation. That can miss profitable producer removal: every consumer may incur extra work after inlining, while their joint substitution removes a larger producer cost. The opposite issue occurs when some consumers remain: their producer is still materialized and cannot be credited as removed.

The new planner compares complete affected-region alternatives under a declared surrogate objective. It retains the existing graph substitution, lifetime and rollback machinery. The standard compiler default remains unchanged. The planner is locally optimal for the specified additive model; that statement does not imply global compiler optimality or better GPU latency.

## 2. Derive the candidate set

Let P be producer work, C_i original consumer work and F_i the work of that consumer after substitution. For selected subset S, the work estimate is:

\[
W(S)=\begin{cases}
\sum_i F_i,&S=U,\\
P+\sum_{i\in S}F_i+\sum_{i\notin S}C_i,&S\ne U.
\end{cases}
\]

The empty subset keeps the graph unchanged. A nonempty proper subset retains the producer and all consumers. Complete selection removes the producer. Consumer output shapes do not change under inlining.

For every proper subset, kernel count and materialized output volume are constant. Therefore an additive objective

\[
J(S)=W(S)+L\,K(S)+M\,V(S)
\]

has the same launch and materialization terms for all proper subsets. Its cheapest retained-producer choice includes every edge with F_i<C_i and excludes positive deltas. Zero-delta edges do not improve that proper-subset objective. Complete selection must still be tested separately because it removes producer work, one kernel and its materialized output.

The exact local search thus compares only three candidates: empty selection, all consumers, and the negative-delta subset. This takes O(m) time for m consumers, after proposed expressions have been scheduled. If the negative-delta subset equals the complete or empty subset, that candidate is redundant. The implementation can evaluate it safely without changing complexity.

A work-growth bound is applied before choosing a plan. Because the negative-delta subset minimizes work among proper subsets, if it fails that upper bound then every other proper subset fails too. The complete candidate is checked independently. Empty selection is always available as the original graph. Exact objective ties retain the original graph; a tie between improving complete and partial plans prefers complete selection.

The assumptions matter. Consumer-local work must be independent across the selected substitutions; the producer and consumer nodes must remain in the affected region as specified; there must be no effects or alias writeback; and the objective must be additive in the defined terms. Actual scheduling, occupancy, caching and later compiler transformations violate any direct interpretation of J as measured execution time.

## 3. Implement one canonical region interface

`createFusionRule` now accepts `selectConsumers(region)`, which returns distinct valid indices into a frozen array of consumer proposals. The region contains producer work/element count, and each consumer contains original work, proposed work, shape volume and scalar structural metadata. Replacements are constructed before any graph edit, so every decision sees one graph state.

The former singular `selectConsumer` option is removed and explicitly rejected. Current compiler tests and integration callers use the region callback. No compatibility alias is provided. Historical scripts that use the singular callback remain associated with their pinned revisions and must run against those revisions. This deliberate API change consolidates selection rather than maintaining parallel individual and region mechanisms.

Default selection remains every consumer. The normal aggregate guard still computes actual pre/post region work after mutation and dead-code elimination. It is a second check on the proposal. Invalid selections, duplicates or out-of-range indices fail explicitly. Empty selection follows the existing skip path, and guard rejection restores the graph.

The pure function `chooseFusionSubset` lives in `packages/kiln/src/std/fusion.js` and is exposed as `std.loop.chooseFusionSubset`. It validates finite nonnegative inputs and rejects cost overflow. Work totals are computed directly from chosen consumer costs rather than subtracting large nearly equal numbers. It returns an immutable selected-index array.

```javascript
std.loop.createFusionRule({
  selectConsumers: region => std.loop.chooseFusionSubset(region, {
    launchWork: 32768,
    materializationWork: 12,
    maxWorkGrowth: 1.02
  })
});
```

These coefficients are illustrative surrogate-work weights, not nanoseconds or calibrated hardware constants. Materialization work augments a base work model that already weights memory accesses. Its experimental role is an additional prior about materialized output volume; any benefit must be measured independently.

## 4. Keep the bounded policy interface explicit

The new region policy kind declares `max_work_growth`, `launch_work` and `materialization_work`. It cannot contain a consumer or aggregate tree. Weights are copied into immutable closures, validated as finite/nonnegative, and bounded at 1,048,576 launch-work units and 64 materialization-work units per element. The normal integration hard aggregate work cap remains two times the original estimate.

Existing serialized selective policies still describe the same two-tree strategy. Their interpreter now evaluates that strategy across the region's consumer array and returns indices through the canonical callback. This changes no serialized selective-policy meaning and adds no old callback alias. The compiler driver passes the prepared region selector to the shared rule factory.

The fresh experiment compares twelve programs: unchanged/default, scalar100/scalar125 and eight region objectives. Region weights are (launch,materialization) = (0,0), (4096,0), (32768,0), (262144,0), (0,1), (0,12), (32768,12), (262144,12). Every region program uses the same 1.02 work-growth bound. Candidate generation reads training traces only and has a poisoned-confirmation independence test.

## 5. Validate the model and graph semantics separately

The pure planner is checked against exhaustive enumeration of every subset in 280 deterministic scenarios with up to seven consumers. Tests vary work bounds, launch weights and materialization weights, and explicitly cover jointly profitable complete fusion, a truly partial optimum, exact ties, admissibility and invalid numerical inputs.

Existing graph tests continue to verify retained producer identity, untouched unselected consumers, repeated operands, nested reduction binders, rollback and complete-selection equivalence. The policy test exercises the new program through the real compiler. At the first boundary, all 30 compiler test files and all 74 then-existing Python tests pass; six proposal tests pass after the new region proposal case is added.

Nine independent source equations are reused from the previous archived fixtures. Four region objectives produce 36 new artifacts under normal reference checking and separate elementary FP32 arithmetic. The CUDA checker is promoted from ticket script 189 into shared `check_fusion_cuda.py`; equations, seeds, dtype tolerances and unchanged-input assertions remain the same. No native library algorithm is copied.

## 6. Use fresh sources and an explicit reference contract

The v7 declaration keeps the earlier semantic/resource bounds and training/confirmation quotas, but changes the declared salt and excludes all exact models and generated programs from v6 as well as every earlier study and the full evaluation set. It selects twenty graphs after 2,255 task inspections: twelve training and eight confirmation. Membership is `9cdb2cf0b136d36491e5a3cf9057219866531921a84b26dacfa42261467e55c1`.

Reference precision is declared as highest-precision FP32 from the outset. This is a modified compiler-policy research protocol, not native PassBench acceptance. Separate compiler arithmetic, original source replay, numerical tolerances, input immutability, timing budget, exact alias sharing and training-only selection remain fixed across candidates.

Shared `prepare_controls.py`, `freeze_study.py` and `compile_study.py` replace repeated per-study control/freezing implementations. Ticket scripts retain exact commands and history. Confirmation compilation follows candidate/procedure freeze, and confirmation timing follows a committed selection. Failures remain in the declared population and cannot be repaired by silent filtering.

## 7. Remaining claims to establish

At this design checkpoint, the planner and fixtures compile and the fresh source population is frozen; CUDA execution and the full policy experiment remain pending. Local model optimality has executable evidence. GPU benefit, global partition quality, native reduced-precision compatibility and external-model synthesis do not follow from that proof.

Review the implementation, exhaustive test and current policy interpreter first, then the frozen declarations and per-policy compilation receipts. The broader project still includes original PassAgent evaluation, remaining benchmark support and reusable transformation synthesis. Updated reMarkable guide delivery remains separately pending after earlier approval-review rejection.
