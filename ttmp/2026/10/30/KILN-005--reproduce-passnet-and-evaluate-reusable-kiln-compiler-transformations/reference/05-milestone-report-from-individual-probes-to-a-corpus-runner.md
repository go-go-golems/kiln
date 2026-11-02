---
Title: Milestone report - from individual probes to a corpus runner
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-30T21:59:27.205188176-04:00
WhatFor: ""
WhenToUse: ""
---

# From individual probes to a corpus runner

A compiler integration has several distinct success conditions. A source graph may translate into a compiler's frontend and still fail during lowering. An executable may match its source model on random inputs and still fail the benchmark's input distribution. A replacement may compute correct values but fail to match the evaluator's graph. Finally, a benchmark may accept an implementation whose invocation overhead or generated schedule makes it slower than eager execution.

This milestone makes those conditions explicit. Kiln now has a shared corpus export and compilation runner, a checker that validates complete output structures, and a full import audit of the pinned PassBench evaluation corpus. Four tasks comprising 49 graph variants have passed the declared integration protocol. The broader audit finds 381 translatable graphs and 21 tasks whose variants all translate. Those larger numbers do not establish execution support.

## Separate the compiler from the experiment protocol

The compiler path starts with a trusted Python graph module. `fx_export.py` preserves FX operator identities, literal arguments, references and tensor metadata in `kiln-fx/1`. `fx_import.py` translates the supported semantics into Kiln source. Kiln then performs its existing IR transformations, scheduling and CUDA emission. `runtime.py` binds caller-owned PyTorch allocations and streams to the compiled program.

The experiment path has different responsibilities. `corpus.py` loads a task's graph list and creates a manifest containing each source identity, input order, dtype and output structure. It invokes the normal compiler export CLI and records a result for every graph. `check_corpus_cuda.py` compares the compiled outputs against the corresponding trusted source model. Original PassBench remains responsible for its correctness protocol, timing and published score.

Earlier experiments repeated this orchestration in individual task scripts. That repetition made progress inspectable but would become difficult to maintain across 200 tasks. The shared runner now owns export, compilation and source comparisons. Numbered scripts remain archived evidence of how experiments were conducted. Task-specific pattern generation and evaluator invocation remain candidates for the next consolidation.

## Why a numerically correct replacement failed to integrate

The residual-plus-mean task has 30 variants across FP32, FP16 and BF16. Each variant returns both a residual sum and its spatial mean. Some variants have a single tensor input with zero-valued scalar additions; others have three tensor inputs. Preserving the association of the additions and their intermediate rounding matters in low precision.

All 30 variants compiled and passed standalone CUDA comparisons for both outputs. The original evaluator nevertheless exposed two independent integration problems.

First, FX symbolic tracing represents an ordinary `+=` expression through the proxy's ordinary addition behavior, while Dynamo preserves `operator.iadd`. Structural matching therefore failed despite equivalent arithmetic on the fresh intermediate. The integration now uses explicit FX autowrapping for a directly imported `operator.iadd` in the match pattern. This retains the target identity without rewriting the target graph's arithmetic. A module-level `torch.fx.wrap` registration inside the generated pass was rejected by the original AST validator; that failed attempt remains archived, and the validator was retained.

Second, the standard upstream replacement backend creates one opaque result node. A pattern returning two tensors needs two replacement result nodes. The pinned upstream repository already implements tuple destructuring in `FixedPatternReplacementPass._make_multi_output_replacement`, in `pass_mgr_direct.py`. The integration imports that helper directly while supplying the standard backend's guarded callable. No implementation was copied into Kiln, and the standard source and dispatch checks remain active.

These changes are named `kiln-pattern-autowrap/1` and `kiln-pattern-multi-output/1`. They supplement the previously documented argument-normalization and record_stream policies. Results using them are modified integration results; they do not constitute an unchanged PassNet reproduction.

## Acceptance and performance evidence

The clean isolated run recorded one successful replacement and one successful result for every expected graph, with no failed result blocks. The coverage builder verifies exact graph-list membership and rejects duplicates or unexpected graphs. The reference workload was paused during the clean run and verified running and unpaused afterward.

The original scorer, with slowdown penalty p=0 and fpdb=0.1, reported an aggregate score of 1.0032945157872568 for this task. That result is approximately eager parity. Its distance from 1 is too small to establish a robust improvement without repeated controlled measurements. It is also specific to the exploratory GB10 environment, rather than the paper's A30 configuration.

The earlier convolution task remains much slower than eager and still has unresolved numerical stress-test failures outside the original replay distribution. Acceptance for the new task does not resolve those limitations.

## Inspecting all graphs without materializing their inputs

Large graphs make real CPU propagation an expensive way to discover missing support. PyTorch's `ShapeProp` accepts a `FakeTensorMode`, allowing tensor metadata propagation without allocating the dataset's tensor storage. The shared runner disables fallback kernels explicitly, so an unsupported metadata operation fails rather than silently executing a real kernel. Trusted Python still executes during tracing; this mechanism is not a security sandbox.

The implementation uses the installed PyTorch API. Its exact source revision, archived `ShapeProp` source and consulted [official Fake Tensor documentation](https://docs.pytorch.org/docs/main/user_guide/torch_compiler/torch.compiler_fake_tensor.html) are stored in the ticket sources. All 30 reduction-task exports had identical ordered manifest records and generated Kiln source under real and fake propagation.

The completed audit accounts for all 200 tasks and 2,060 graph variants. It records only the first blocker for each graph. Before indexing support, 279 graphs and 19 complete tasks imported successfully. Static indexing increased those counts to 381 graphs and 21 complete tasks.

## Static indexing and the next compiler dependency

`fx_indexing.py` owns basic index normalization. It expands ellipsis, tracks which indices consume source axes, normalizes negative integers, and uses Python's slice-bound normalization for unit-step slices. Kiln slices preserve selected integer axes as unit dimensions; a final reshape removes those axes and inserts dimensions requested by None indices. An independently computed output shape must agree with FX metadata.

Three-output probes passed CUDA comparisons in FP32, FP16 and BF16. Strided slices, empty tensors, advanced indexing, mutation-dependent alias behavior and external noncontiguous inputs remain explicit limitations.

Concatenation is now the first blocker for 531 graphs. Linear, matmul, integer inputs, softmax and activation functions are other important dependencies. These counts do not predict marginal coverage gains: after one blocker is removed, another can appear in the same graph. Fifty-nine graphs also fail local trusted-source tracing because the local machine lacks an NVIDIA driver; those failures are distinct from semantic lowering gaps.

The next implementation should add concatenation to Kiln's compiler with explicit reference semantics, dtype behavior and GPU validation, then repeat the same corpus audit. Execution support will continue to be counted only from complete evaluator evidence.
