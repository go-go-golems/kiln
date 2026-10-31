---
Title: Singleton reshape index maps and contraction visibility
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://integrations/passnet/fx_indexing.py
      Note: Shared source reshape contract
    - Path: repo://integrations/passnet/test_fx_singleton_views.py
      Note: Axes scalar ownership and FX-Dynamo source binding checks
    - Path: repo://packages/kiln/src/std/tensor.js
      Note: Direct unit-axis reshape mapping
    - Path: repo://packages/kiln/test/singleton-reshape.mjs
      Note: Numerical and contraction regressions
    - Path: repo://ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/singleton-reshape-cuda.json
      Note: Preserved native 60 of 63 CUDA outcome
    - Path: repo://ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/singleton-view-native-fixtures-v1/manifest.json
      Note: Native finite-output fixture evidence identity
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T05:46:28.617490778-04:00
WhatFor: ""
WhenToUse: ""
---

# Singleton reshape index maps and contraction visibility

The recorded attention workload is numerically accepted but its final contraction uses a row mapping and measures 703.734 ms against 15.431 ms eager. Static inspection shows that both matrix operand loads depend syntactically on both output matrix dimensions. The existing contraction classifier therefore cannot expose a tiled mapping, even though the source operation is a batched matrix multiplication followed by singleton-axis rearrangement.

## Legality rule

For a tensor shape, remove every dimension whose extent is one, retaining the order of all other extents. If input and output shapes have equal resulting sequences, a reshape changes only singleton-axis placement. Each non-singleton input coordinate corresponds directly to the matching non-singleton output coordinate; every singleton input coordinate is zero.

```text
input_nonunit = input axes whose extent differs from 1
output_nonunit = output axes whose extent differs from 1
if their ordered extents agree:
    for each input axis:
        singleton -> constant zero
        non-singleton -> corresponding output coordinate
else:
    use existing flatten/unflatten reshape map
```

This is equivalent to row-major reshape: unit extents contribute no independent coordinate or varying offset, while the ordered varying coordinates retain the same row-major strides after unit extents are removed. The rule also covers rank-zero and all-singleton tensors. It does not merge or split non-singleton axes. General reshapes retain the original mapping.

The implementation belongs in the existing private `reshapeMap` in `packages/kiln/src/std/tensor.js`, shared by normal frontend decomposition and Tensor IR helpers. It introduces no alternate compiler pipeline or source-specific attention rule. The public N.reshape interface and dtype inference remain unchanged. No external implementation is copied; this index mapping follows directly from the row-major contract and the inspected dataset source.

## Compiler effect

The original flatten/unflatten expression can retain both output variables inside division and remainder terms. A structural free-variable analysis then classifies both input operands as depending on both matrix dimensions. The direct map preserves their independent roles before this analysis.

The inspected final contraction changes from legal mappings `[thread,row]` to `[thread,row,tiled]`, with M=16384, N=64 and K=256. This establishes a new legal scheduling option; actual schedule selection, numerical correctness and runtime remain separate measurement gates.

The emitter itself is unchanged. Existing evidence identities include mathematical expression keys and emitted source, so affected kernels receive new identities/content. Unchanged kernels retain their valid evidence. No codegen-version bump or compatibility alias is introduced merely for this IR rewrite.

## Source binding discovered during validation

The first independent source fixture used public torch.reshape, which the importer did not support. The implementation adds torch.reshape and aten.reshape.default to the same static shape helper used by method reshape/view. It resolves one inferred -1 dimension, preserves element count, verifies result shape/dtype and rejects duplicate, unsupported or invalid arguments. Views do not grant fresh-storage ownership.

The initial failed export and following missing-manifest compilation failure are preserved under `sources/singleton-reshape-before-functional-import/`. The fixture remains unchanged rather than replacing its public call with an already supported method. Actual PyTorch/FX shape propagation establishes valid source view/reshape layout semantics before import; this work does not add arbitrary runtime alias/layout support.

## Validation and measurement gates

The numerical regression exercises 444 scalar, singleton-axis and dtype cases, including repeated extents. Additional checks cover a transposed logical input, ordinary reshapes that change non-singleton dimensions, and the real contraction epilogue pattern. The entire 33-file compiler test gate executes with actual child-process permissions and passes. The source suite contains 49 passing FX tests.

Twenty-one source fixtures compile across FP32, FP16 and BF16. They include scalar/unit-only views, noncontiguous logical input, general reshape fallback, and small/tail matrix contractions with the source transpose/reshape epilogue. The CUDA fixture receipt is a separate qualification gate. Then the complete frozen 93-variant benchmark cohort must be rerun under the new source snapshot and audited at nominal t=-5, preserving any regression.

Performance comparisons must distinguish the old and new compiler on the same benchmark membership from a held-out generalization experiment. This change is manually derived from observed benchmark evidence. It is not agent-generated synthesis or an unseen-test improvement claim. Future synthesis studies require their own fresh declared training and confirmation populations.

## Observed CUDA fixture limitation and next gate

The native fixture run is terminal at 60/63 passing comparisons. All failures are the FP32 tail contraction. A separately compiled old reshape lowering and the candidate produce the same outputs for those inputs. Native PyTorch runs with allow_tf32=True and differs from the rounded FP64 reference by up to 0.0980453 on the wider-logit input. Both compiler lowerings pass the unchanged rounded-FP64 comparison on all three seeds. Both also fail one strict comparison against full-FP32 PyTorch on the wider input, with the same one-element discrepancy. These observations preserve an existing native numerical-compatibility limitation; they do not reclassify the native fixture as passed.

The initial diagnostic stopped at its first strict assertion; that log and script are retained. The second diagnostic records every comparison without changing its tolerance. Its extra gamma-scaled sum-of-absolute-products metric is descriptive against a rounded FP64 reference, not a proof or benchmark acceptance rule.

The real large attention program now selects tiled mapping for its final M=16384,N=64,K=256 contraction, with BM=128,BN=64,BK=16,TM=8,TN=2. The complete frozen 93-variant original cohort is the next required correctness/performance gate. No successful benchmark regression check or latency improvement is claimed until it completes.

The full 200-task import re-audit after shared reshape binding reports 1,136 graphs/64 complete families, an increment of 14 graphs/three families with zero import regressions. Script 277 freezes every newly complete family in a separate source-qualification plan. This does not alter the original 93-variant optimization comparison or increase accepted coverage before evaluation.

## Completed development and new source evaluation

The fed37d1 complete 93-variant comparison passes all original numerical/replacement checks. All generated Kiln source programs are unchanged. Eighty-one exact executable structures change and twelve remain unchanged. The target's final grid falls from 67,108,864 row blocks to 8,192 tiled blocks, with end-to-end median 703.734 -> 20.4884 ms. The observed family-balanced ratio is 1.064442x; this sequential development measurement does not establish held-out generalization or statistical significance of small per-variant changes.

The separately frozen public-reshape cohort passes every one of its three families/14 variants. Current cumulative acceptance is 24/200 tasks and 313/2,060 graphs. Native fixture qualification remains explicitly 60/63. Reference 17 contains the complete analysis and failure context.


## Source singleton insertion and removal

The shared indexing binder now handles Tensor/public/ATen unsqueeze and squeeze using the existing N.reshape operation. For rank r, unsqueeze accepts an integer axis in [-r-1,r], normalizes it modulo r+1, and inserts a size-one dimension. Squeeze without dim removes every unit dimension. An explicit integer or list/tuple removes only selected unit dimensions; selected non-unit dimensions remain unchanged. Negative axes are normalized against max(1,r), preserving scalar dim0/-1 no-op behavior. Duplicate normalized axes, Boolean/noninteger axes, invalid ATen overload forms and inconsistent result metadata are rejected. An empty axis list removes nothing. Explicit dim=None is rejected, following the installed source behavior rather than confusing it with an omitted argument.

The binder reuses lower_reshape for exact output shape/dtype and element-count checks. It does not add a compiler operation or transfer fresh-storage ownership through a view. Consequently, an in-place operation after an imported view remains rejected by the existing conservative ownership checks. This is value-semantic lowering within the existing integration contract; it does not implement observable cross-output storage aliasing.

Source lookup is consolidated in one operand_spec helper used by matrix, normalization and singleton binding. The view semantics remain in fx_indexing.py instead of creating another parallel layout module. Public, method and ATen spellings emit identical scripts for equivalent calls. FX/Dynamo matching tests pass without extending the argument normalizer.

Primary contracts are archived in sources/singleton-view-semantics-v2, including PyTorch v2.9.1 _torch_docs.py (SHA256 d7e78bf42ec9b005c7e1bc7b752244e94442c9ccc8a2abed546234723a0533dd), installed docstrings, exact schemas and121 independent source probes under Torch2.11.0+cu130. The implementation is independent dimension arithmetic over existing Kiln primitives; no PyTorch implementation was copied. Official documentation pages were inspected, but direct download returned HTTP403; the tagged upstream docstring source was downloaded instead.

All57 FX tests pass. The complete200-task import audit increases eligibility from1196/69 to1251 graphs/76 complete families with zero import regressions. Every newly complete family is frozen in singleton-view-source-cohort-plan.json: seven tasks and55 variants, without shape/dtype filtering. This is translation eligibility only; native CUDA fixture validation and original evaluator acceptance remain required. Current accepted replay remains27 complete tasks and338 individual graphs.

## Complete singleton source qualification

Under committed a040057,12 independent CUDA programs pass72 finite output comparisons with zero error. The full seven-family/55-variant replay accepts four complete families and20 individual graphs at nominal t=-5. Two other evaluated graphs fail the strict numerical point, while33 variants remain unexecuted because their complete family stops at an end-to-end export check. No threshold changes or family filtering occur. Source/artifact/log/scorer identity and all165 source files are verified. Cumulative replay reaches31 complete tasks/358 individual graphs, with289 inside complete tasks; import eligibility remains1251/76. Reference21 explains scope and retained failures.
