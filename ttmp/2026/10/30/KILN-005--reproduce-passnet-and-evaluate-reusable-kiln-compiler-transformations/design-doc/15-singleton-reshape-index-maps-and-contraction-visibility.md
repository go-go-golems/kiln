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
    - Path: repo://packages/kiln/src/std/tensor.js
      Note: Direct unit-axis reshape mapping
    - Path: repo://packages/kiln/test/singleton-reshape.mjs
      Note: Numerical and contraction regressions
    - Path: repo://ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/singleton-reshape-cuda.json
      Note: Preserved native 60 of 63 CUDA outcome
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
