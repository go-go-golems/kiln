---
Title: Layer normalization lowering and structurally rich optimization corpus
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
LastUpdated: 2026-10-31T02:52:05.539509948-04:00
WhatFor: ""
WhenToUse: ""
---

# Layer normalization lowering and a structurally rich optimization corpus

## Motivation and evidence

The earlier twelve-graph development training set has no reductions, fanout or exact internal duplicate kernels. A new selector therefore declares balanced reduction/matrix quotas before timing. Its first attempt exhausts the 4096-task bound with ten matrix graphs but only two reduction graphs. The final saved checkpoint covers 4065 tasks and identifies 115 unsupported LayerNorm attempts. This failed attempt and its log remain preserved; no completed manifest or optimization result is claimed for it.

The next action adds a missing source binding rather than weakening model exclusions or changing resource limits. Kiln already has a layer-normalization primitive and decomposition. Reusing it keeps the compiler architecture consistent and avoids a second numerical implementation.

## Source operator contract

fx_norm_ops.py binds torch.nn.functional.layer_norm, torch.layer_norm and aten.layer_norm.default. It validates static positive normalized dimensions against the exact trailing input dimensions, affine parameter shape/dtype, output metadata and finite nonnegative epsilon. Optional weight and bias become identity/zero affine tensors. Mixed parameter precision and native-layer-norm tuple statistics remain explicitly unsupported.

The source's trailing normalized dimensions are flattened into one feature axis. If input shape is [2,3,5] and normalized_shape is [3,5], the compiler uses rows=2 and width=15. Weight and bias flatten to [15], existing N.layer_norm operates on [2,15], and a final reshape restores [2,3,5]. FP16/BF16 values widen to FP32 arithmetic and narrow once at the source operation boundary.

```text
validate input [...prefix, ...normalized_shape]
rows = product(prefix)
width = product(normalized_shape)
reshape widened input to [rows, width]
reshape widened affine tensors to [width], or supply ones/zeros
apply existing N.layer_norm(..., {eps})
reshape to original input shape and restore storage dtype
```

The result is fresh for the importer's existing single-use ownership proof. This permits a subsequent in-place activation only under that proof; it does not introduce general writeback or alias support.

The implementation is independent. PyTorch v2.9.1 API definitions/docstrings, native LayerNorm sources and license are archived under sources/pytorch/layer-norm. Direct documentation downloads returned HTTP 403, which is recorded. Official pinned source docstrings supply the archived API reference; the public pages were also read with the web tool. No native normalization code was copied.

## Numerical qualification

Twenty-one fixture programs cover seven forms across FP32, FP16 and BF16: vectors, odd width 129, multiple normalized dimensions, optional affine parameters independently and normalization of the full input shape. Each runs random and constant-input cases for seeds 1,7,42, totaling 126 comparisons. All pass standard dtype tolerances and unchanged-input checks. Maximum observed absolute errors are 4.76837158203125e-7 for FP32, 0.00048828125 for FP16 and zero for BF16.

All 21 artifacts compile with ordinary end-to-end checking and contraction separate. These fixtures do not add original PassBench acceptance. The separate full import audit increases eligibility from 984 graphs/43 complete families to 1029/51; cumulative original replay acceptance remains 11 complete tasks/206 individual graphs until genuine tasks are evaluated.

## Deterministic source selection

prepare_study.py selects from the pinned official training list in salted task-hash order. All exact models from the 200-task evaluation population and all prior policy corpora are excluded. A model appears at most once across the new training and confirmation splits. Exact generated-source duplicates are also excluded.

Each category receives six training and four confirmation graphs. Eligibility requires FP32 inputs and a matrix or reduction computation. Reductions include known compound operators such as N.layer_norm, whose decomposition introduces reductions even when the emitted source has no literal N.sum call. Limits are fixed at two million input elements, eight million elements in one tensor, 64 million total tensor elements, 128 tensor nodes and 16 million matrix products. These are metadata/resource bounds, not measured performance filters.

The successful retry preserves the original salt, quotas, model exclusions and resource limits in a new directory. It scans 888 tasks and freezes twenty sources: twelve training and eight confirmation graphs. Membership SHA256 is f3df1ddadef41f31d9b88ab9953c7c7a2a6cd3bffa75bb830159205b40848ad0. Per-source input/model/constraint files and importer modules are hashed. Importer hashes are checked before and after selection. Partial failures are retained and the final audit is now written even when quotas cannot be filled.

## Verify actual training opportunity

Only training IR is compiled during the structural and control stages. The twelve new training graphs have 34 fused kernels, eighteen reduction-containing kernels and eleven multi-consumer kernels. Without fusion they have 215 kernels, eighteen reduction-containing kernels and thirteen multi-consumer kernels. There are still no exact internal duplicate kernels, so CSE is not proposed merely to increase the number of candidate passes.

Unchanged and explicit-default controls compile all twelve training sources and have identical executable fingerprints. Their default-policy trace contains 260 attempted fusion decisions: 181 accepted and 79 rejected. Twenty rejections have modest estimated work ratios from approximately 1.0264 to 1.1424, providing a concrete reason to test relaxations as well as restrictions. Counts refer to compiler attempts, including repeated opportunities, not unique graphs or independent timing samples.

## Freeze reusable policies before measurement

The fixed twelve-candidate grammar contains unchanged/default controls; disabled fusion; scalar thresholds 1.0,1.05,1.1,1.25,1.5,2.0; and three conditional programs. Conditions distinguish fanout, producer size and estimated work. Producer/work medians (2048 elements and 1694208 work units) come only from training compiler features. Each program uses the existing bounded DSL with hard work-growth cap two, and changes profitability decisions within the existing legal fusion rewrite.

This is Codex-authored program generation from training evidence. It is not an external PassAgent invocation or a claim of a new graph-mutating algorithm. No candidate reads tensor values or graph IDs. Candidate JSON, source membership, reference domains and the measurement plan are hashed together before confirmation IR compilation or new GPU timing.

The numerical contract stays contraction separate for baseline and every candidate. Measurement uses original source replay and nominal dtype comparisons, twenty warmups, one hundred trials, three repeats, IQR/median bound 0.2 and up to two retries. Exact executable aliases share evidence. Selection uses training-only family-balanced geometric-mean synchronized end-to-end ratios; exact ties prefer the earlier declaration with baseline first. Only baseline and the committed selection are timed on confirmation. Compilation cost is recorded but has coefficient zero in this initial objective.

## Compiler and qualification interfaces

compile_policy.mjs reads the fixed numerical contract from the corpus, supports train/heldout/all compilation phases, and preserves nonempty output directories. It samples only constrained reference inputs from deterministic defaults, avoiding both eager allocation of unrelated tensors and repeated application of an embedded positive-variance transform.

New full qualification uses kiln-policy-compilation/2 receipts with explicit phase and numerical policy. A training-only receipt cannot qualify a whole corpus. The qualifier checks the plan, manifest, receipt and artifact numerical contract, as well as existing source hashes, kernel identities, alias consistency and default equivalence. Older experiment receipts remain reproducible through their pinned implementation revisions rather than a compatibility adapter.

The shared source snapshot now includes integration MJS and package TypeScript sources in addition to JavaScript/Python. The full-study compiler verifies that every source matches its committed revision and that frozen declaration hashes remain unchanged around each candidate. GPU measurement records native PyTorch precision flags without modifying them.

## Current gate

The source corpus, training controls and twelve candidates are frozen. Full candidate compilation/qualification and GPU training-selection/confirmation remain required. Neither imported coverage nor fixture success is substituted for an optimization result. If the baseline fails original replay or a candidate fails correctness, the failure remains visible; confirmation membership is not replaced based on its outcome.


### Native-reference result and explicit research protocol revision

The v5-r1 compilation gate passes all 240 artifacts. Native training completes twelve graphs but fails unchanged-baseline correctness on Pegasus and Opus linear projections. Selection refuses the run. Diagnostics in `sources/rich-matrix-numerics.json` show that Kiln agrees with FP64 and highest-precision PyTorch within 4e-8, whereas the native high/TF32-enabled reference differs by up to 7.25e-5. The native run remains failed, with no selection or confirmation timing.

The separately frozen `policy-corpus-v5-r2` retains every source, split, policy, tolerance and compiled binary. Its sole execution change is an explicit `float32_matmul_precision=highest` reference, enforced by the hashed script 179 wrapper and recorded in the measurement plan. This modified FP32 compiler-policy protocol cannot establish native PassBench acceptance. Training has already been observed in v5-r1; confirmation GPU timing remains unobserved. The research result is pending training and confirmation, and original benchmark compatibility remains a separate open requirement.


### Completed FP32 research result

The explicit v5-r2 protocol qualifies every training candidate and selects scalar105 at 1.0013193438356627. Selection is committed in 2a4162c before confirmation timing. All eight confirmation graphs qualify: family-balanced end-to-end 1.0005681560422044 and stream elapsed 0.9995845291040679. This does not demonstrate a meaningful improvement. Reference 12 explains limitations and script 183 verifies declarations/artifacts/selection. The native v5-r1 failure remains unchanged and does not become accepted benchmark evidence.
