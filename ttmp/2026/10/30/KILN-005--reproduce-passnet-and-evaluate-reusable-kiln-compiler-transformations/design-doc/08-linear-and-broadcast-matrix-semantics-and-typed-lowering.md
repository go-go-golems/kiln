---
Title: Linear and broadcast matrix semantics and typed lowering
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
LastUpdated: 2026-10-31T00:18:32.37079708-04:00
WhatFor: ""
WhenToUse: ""
---


# Linear and broadcast matrix semantics and typed lowering

Matrix operations combine shape semantics, reduction arithmetic and source operation boundaries. An importer that recognizes a function name without checking these contracts can generate an executable with the wrong shape or numerical behavior. The new implementation centralizes Kiln's matrix reference and decomposition, then exposes the supported semantics through the FX importer.

## Shape contract

For matmul, each operand has at least one positive static dimension. A left vector [K] is promoted to [1,K]; a right vector [K] is promoted to [K,1]. The promoted contraction dimensions must agree. Batch prefixes align on the right, and each aligned pair must either agree or contain one. The result has the broadcast prefix followed by M,N, with the promoted M or N dimension removed for each original vector operand. Two vectors therefore produce a scalar with shape [].

For example, [2,1,5,17] @ [1,3,17,7] produces [2,3,5,7]. [17] @ [2,17,7] produces [2,7]. [2,5,17] @ [17] produces [2,5]. The matrix dimensions do not participate in ordinary elementwise broadcasting.

Linear uses the last input dimension as K and accepts a vector [K] or matrix [N,K] weight. Output is the input prefix, with N appended for matrix weights. Bias must have the source dtype and broadcast into the already determined output shape. The importer checks result metadata against these independently computed dimensions. mm requires two rank-two inputs; bmm requires rank-three operands with equal batch size and does not inherit matmul broadcasting.

## Centralized reference and decomposition

packages/kiln/src/std/matmul.js owns matmulSpec, linearSpec, independent references and lowering. It replaces the previous reference/decomposition in tensor.js, which derived output batches from the left operand and did not correctly express all vector/broadcast cases. No compatibility wrapper retains the unused old matmulRef export; references now live in their owning module.

The decomposition retains the reduction layout expected by the existing pipeline: [batch...,M,K,N], reducing K at axis -2. Operand views map broadcast batch coordinates to zero for singleton dimensions and to aligned output coordinates otherwise. Vector views omit their promoted dimensions when indexing original storage. A final view removes promotion and reduction dimensions without changing element order.

```text
plan = validate_shapes(left, right)
work_shape = batch_prefix + [M, K, N]
left_view = view(left, work_shape, aligned_left_coordinates)
right_view = view(right, work_shape, aligned_right_coordinates)
products = multiply(left_view, right_view)
reduced = sum(products, axis=-2)
return view(reduced, logical_output_shape, remove_promoted_axes)
```

Raw nn.linear and nn.matmul arithmetic require FP32 operands. The FX importer widens supported FP16/BF16 operands to FP32, performs the compound operation, and narrows once at its source result boundary. Linear bias is applied in FP32 before that narrowing. An operation producing low-precision output must not leave an unrecorded FP32 value for subsequent consumers. This is an explicit contract, not an assumption that arbitrary mixed dtypes or autocast are supported.

## FX integration

fx_linalg.py handles linear, matmul, mm and bmm call forms. fx_import.py delegates matrix binding, shape validation and arithmetic-boundary construction to that module. Supported names include torch and ATen overloads, operator.matmul and tensor matrix methods. Output mutation, unsupported dtype combinations, contraction/batch mismatches and inconsistent result metadata produce explicit diagnostics.

The primary PyTorch 2.9 docs and v2.9.1 native/CUDA sources are archived in sources/pytorch/linalg with URL, SHA256 and size provenance. The implementation is independent; no PyTorch matrix algorithm was copied. Local PyTorch 2.11 rejects a 2D input/vector weight/scalar bias through its addmm path despite the broad documented vector-weight shape. Tests retain vector weights without bias as an executable source case and document the discrepancy rather than treating it as a compiler failure.

## Preserve mutation during source tracing

Ordinary FX Proxy can implement Python += by falling back to non-mutating addition. That loses information needed to preserve input storage effects. fx_trace.py provides MutationProxy/MutationTracer and trace_module to capture in-place operator identities explicitly. The corpus importer uses this tracer.

The importer functionalizes iadd, isub, imul and itruediv only on a known fresh input whose sole graph use is the mutation. Other captured in-place operators fail explicitly. A placeholder input is not fresh: input += value requires writeback/effect support and is rejected. A view observer adds a reference or passes through a potentially aliasing node and also prevents functionalization. Tests show that unsupported ipow remains an in-place operator rather than silently becoming ordinary power.

The more faithful full-corpus audit retracts 22 previously optimistic import successes, across four unverified task families, because they mutate an input or otherwise lack the required ownership proof. No already verified complete task is among those retractions. The intermediate matrix audit had 1006 imported graphs / 47 complete tasks; the authoritative faithful audit has 984 / 43. These are translation counts, not execution acceptance. General input writeback and alias-aware memory effects remain required for the full corpus.

## Generate match patterns without duplicating compiler semantics

generate_pass.py extracts a top-level pattern function from each trusted dataset GraphModule.forward. It removes self/annotations, verifies a simple positional tensor signature and flat tensor return, and unwraps singleton output containers to match the evaluator's one-output replacement interface. Multiple outputs continue through the existing audited upstream tuple-destructuring integration.

Normalization and FX graph identities deduplicate equivalent source patterns. Literal differences that alter matching remain distinct. A captured integer pattern identity becomes part of CorpusDispatch specialization, preventing equal input metadata from confusing different literal-specialized computations. The generated stable module-level callable invokes compiled Kiln programs only. Pattern provenance records the original graph and model source SHA256. A frozen policy corpus cannot be mutated by pass generation.

For explicit += matching, AST extraction uses a directly imported public name for operator.iadd, allowing the existing trace_pattern autowrap mechanism to preserve the target. A leading underscore prevented PyTorch's autowrap scanner from recognizing the alias in an initial test; the public name fixes this without changing the evaluator protocol.

## Validation and present limits

Hand-computed CPU tests cover dot products, matrix/vector combinations, two-sided batch broadcasting, vector weights, reference/decomposition agreement and invalid shapes. All 26 Kiln Node test files pass. The Python integration boundary passes 60 tests after matrix, tracing and pass-generation additions.

Forty-two independently exported source fixtures cover 14 forms across FP32, FP16 and BF16. All 126 CUDA comparisons pass for seeds 1,7,42, including scalar outputs, odd contraction size 129, transpose, batched operands and linear bias. Maximum observed absolute error is 7.62939453125e-6. The NVIDIA PyTorch alpha reports float32_matmul_precision=high; this is tolerance-based same-device evidence, not bitwise IEEE or paper-hardware equivalence.

Real evaluation task 121 has four variants and three source-derived patterns: disabled dropout followed by linear, and two explicit dtype-cast variants. Compilation/matching/scoring evidence is tracked separately from the independent fixtures. Full paper reproduction, all-task execution coverage, noncontiguous inputs, general writeback and tuned matrix scheduling remain open.
