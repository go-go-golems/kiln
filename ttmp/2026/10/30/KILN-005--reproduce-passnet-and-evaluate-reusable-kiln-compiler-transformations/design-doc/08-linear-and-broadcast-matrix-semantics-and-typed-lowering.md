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


## Canonical argument roles preserve floating-point evaluation order

Two source programs can have the same FX pattern while using different positional names. For example, `(x+y)+z` and `(y+z)+x` become the same pattern when placeholders are renamed by their first use. A replacement that dispatches compiled programs using the original source signature can therefore select a metadata-compatible implementation with different operand roles. Shape and dtype checks cannot distinguish these programs when all three inputs have identical metadata. FP16 values 2048, -2048 and 0.5 expose the difference: alternative association can produce either zero or 0.5.

The generator now canonicalizes roles before both matching and compilation. It visits normalized FX operations in order, records each placeholder on first use, reorders the extracted function signature, and imports the source graph using the same permutation. A manifest field `source_input_order` records which original argument occupies each canonical position. Replay validation applies this permutation before launching Kiln, and applies its inverse before invoking the trusted source model on generated inputs. Frozen policy corpora retain their existing identity and cannot be mutated by this generator.

Canonicalization must not reorder arithmetic operations. Its only transformation is argument binding; reduction order, dtype boundaries and mutations retain their source position. The regression test uses the nonassociative FP16 example and verifies both source signatures through the same dispatch specialization.

Pattern priority is a second independent contract. A generic three-placeholder pattern can match a source with two tensor arguments and a literal zero. The replacement then receives an integer where tensor metadata is required. Generated patterns are ordered by ascending argument count, placing these concrete literal specializations before their more general counterparts. The initial canonical evaluation preserved this exact failure as `AttributeError: 'int' object has no attribute 'shape'`. After changing priority, all 30 residual-task variants pass original replay at t=-5, with exactly one replacement each. The complete Python integration suite passes 62 tests.

## Numerical acceptance requires an explicit point on the original curve

The previous coverage ledger used the upstream checker at t=1. That is a relaxed diagnostic point, not nominal correctness. The ledger now requires t=-5, the nominal strict point for the benchmark's dtype-specific tolerance mapping, and retains t=1 only as a separately named diagnostic. This changes the interpretation of historical counts; historical reports remain preserved and the correction is documented explicitly.

The full TorchInductor reference logs illustrate why the distinction matters. At t=-5, 1748 graphs and 140 complete tasks pass. At t=-4 the counts are 1855/157; at t=-3 they are 1962/172; at t=1 they are 2039/191. These are the same execution logs audited at different numerical thresholds, not four separate benchmark runs. Hardware/software differences and the original timing limitations remain applicable.

The new four-variant linear task passes two variants at t=-5 and all four at t=-4, -3 and 1. It therefore remains an incomplete task in nominal coverage. In a separate diagnostic on its first BF16 case, Kiln has zero non-close values against FP32 and FP64 accumulation under the diagnostic tolerance; native PyTorch with its default reduced-precision reduction differs at 3175 output positions. Disabling that native reduction option also removes non-close differences against Kiln. The diagnostic restores the flag and does not change the original evaluator's configuration. This establishes a native algorithm precision difference for that BF16 case; it does not establish that every remaining discrepancy has the same cause, nor permit relaxing benchmark acceptance.

## Shared complete-task evaluation

`evaluate_tasks.py` replaces bespoke launch sequences with export, canonical pattern generation, compilation, original evaluator invocation and original scorer invocation. Each phase records command, exit code, elapsed time and logs. Compilation or export failure remains visible for the whole task. A successful process is deliberately called `process_complete`; correctness is established separately by `summarize_task_run.py` from exact membership, successful execution, one replacement and t=-5 numerical checking.

The runner hashes compiler, runtime and integration sources before and after every phase and stops if they change. It also verifies frozen graph-list hashes before starting. The newly complete cohort is derived mechanically by subtracting the activation milestone's fully importable families from the faithful matrix audit: 14 tasks and 151 variants, including the partially passing linear task. The earlier working estimate of 11 tasks/94 variants omitted three eligible families and has been replaced by this complete set. No measured result is used to select membership. The hardware remains DGX Spark GB10, the scheduling target remains the documented A100 proxy, and this is the modified integration protocol.


## Compiler reference inputs must satisfy source domains

The first complete cohort leaves four families (51,60,82,182), comprising 63 variants, unexecuted because a synthetic end-to-end check failed during compilation. Their programs include inference batch normalization. The default reference sampler can assign negative running variance and produce NaNs in sqrt. The domain hypothesis is tested by rerunning every compile-blocked family, rather than bypassing checks or filtering variants.

The shared reference_domains.py now exposes constraints_for_graph and attach_reference_data. The first follows a source variance placeholder through supported sign-preserving views/casts and assigns a positive reference-only domain using canonical input names. The second configures existing Project.data after obtaining deterministic Project.inputsFor values, replacing only established variance inputs by abs(value)+0.1. Program placeholders and generated runtime arguments remain free. The compiler's check remains enabled. Unknown computed domains produce an explicit reference_domain_diagnostic and retain ordinary validation; they do not falsely establish semantic import failure.

Policy reference-domain export reuses the same source inference and honors source_input_order. Frozen prior corpora are not rewritten. Full Python integration validation passes 65 tests; actual compiler/rerun results remain a separate required gate.


## Select synthetic inputs before allocation

The initial attach_reference_data implementation requested every project input before configuring positive variance. On task 182 variant 005 this allocated a [512,256,56,56] tensor even though the ordinary compiler endToEnd work estimate would skip expensive evaluation. The node process aborted with `FATAL ERROR: invalid array length Allocation failed - JavaScript heap out of memory` after roughly 2.4 GB heap use.

Project.inputsFor(g,{names}) now supports validated selective sampling. Source-domain setup requests only established variance names, so values retain the same deterministic seed and dtype rounding as before. Project.data remains partial; ordinary endToEnd generates other inputs only after its existing cost guard. Tests use the exact huge input shape with a small selected variance, proving the unrelated tensor is not sampled. The focused previously aborting program compiles with its normal check policy. A full nine-variant original-evaluator rerun remains necessary for acceptance.
