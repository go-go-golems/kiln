---
Title: Typed compiler semantics and first complete PassBench task
Ticket: KILN-005
Status: active
Topics: [kiln]
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: Precision propagation, integrity protocol and verified first-task results
---

# Typed compiler semantics and the first complete PassBench task

Kiln now executes all six variants of one genuine PassBench task with accepted numerical, dtype and timing-stability results. This milestone required a typed compiler implementation spanning reference rounding, view inference, scalar expressions, lower-level result types, CUDA storage, artifact allocation and PyTorch stream ownership. It establishes one verified task out of 200 under an explicitly modified integration protocol.

## Storage and arithmetic are different contracts

A storage dtype determines how bits in a buffer represent elements. Arithmetic precision determines how intermediate values are computed and rounded. An FP16 tensor can participate in an operation that accumulates in FP32 and then narrows its result. Treating every value as FP32 until final output allocation erases source-visible rounding, while rounding every elementary normalization step to FP16 introduces rounding that PyTorch does not perform.

The first implementation layer is `packages/kiln/src/core/dtypes.js`. It defines explicit byte widths and FP32-to-FP16/BF16 conversion behavior. Unknown dtype names fail instead of defaulting to four bytes. Tests cover every finite 16-bit encoding, midpoint ties, subnormal boundaries, signed zero, infinity and NaN behavior. A differential corpus of 23,081 FP32 bit patterns produced 46,162 conversion comparisons against PyTorch, all passing under the stated NaN-payload comparison policy.

That reference layer is necessary but insufficient. The CUDA emitter must use half/bfloat16 pointer types and load/store conversions. The artifact must allocate the corresponding number of bytes. The PyTorch bridge must create an output with the same dtype. Each of these boundaries was tested separately before complete graph execution was enabled.

## Preserve precision through compiler transformations

Views initially reset dtype to FP32. Correcting reshape, transpose, slice and broadcast views exposed an implicit dependency in the older u8 path: arithmetic had relied on that accidental dtype loss to produce FP32. Explicit u8-to-FP32 arithmetic promotion restored its behavior. This regression illustrates why type propagation must distinguish storage preservation from arithmetic promotion.

Elementwise operations now infer same-low-precision results and insert explicit scalar rounding functions into loop expressions. Producer fusion substitutes those expressions into consumers, retaining the rounding boundary. A cancellation-sensitive test evaluates `(x+y)-x` at a midpoint where losing the first rounding changes the result. FP16 and BF16 CUDA results matched PyTorch exactly in the tested cases.

The compiler carries `outDtype` through loop, tile, kernel and GPU representations. Kernel pointer declarations, byte estimates and export buffers use it. Non-FP32 output identity is distinguished so precision changes do not reuse an incompatible measurement identity. CUDA-only storage availability is explicit: unsupported WGSL storage produces an unavailable reason instead of silently becoming FP32 shader storage.

## Normalization needs explicit accumulation

The first task performs ReLU, inference batch normalization and disabled dropout. All six variants use activation shape `[1000,128]` with 128-element channel vectors. Four variants use FP16, one FP32 and one BF16.

`N.cast` expresses the precision boundary directly. The importer widens activation, statistics and affine parameters to FP32, computes normalization, and narrows the result to its declared source dtype. ReLU still retains its source dtype before widening. This avoids separately rounding each subtraction, division and affine operation to the output storage dtype.

Independent tests used nontrivial statistics and affine parameters, not only the source's zero/one defaults. FP16 maximum absolute error was 0.001953125 within the declared baseline tolerances; BF16 matched exactly in that test. Those tests justified proceeding to the original numerical checker; they did not replace it.

## Separate protocol changes from compiler results

The original matcher encountered a structural difference between symbolic-traced patterns and Dynamo graphs: positional versus keyword forms and inserted defaults. The integration normalizes the arguments of a narrow whitelist of functional calls in both graphs. This is a declared matching protocol change, logged as `kiln-normalized-fx/1`.

The original replacement dispatch guard also rejected `record_stream`, which the runtime uses for allocator lifetime tracking. The integration explicitly allows only that metadata operation and delegates every other operation to the original guard. A GPU test confirms that tensor addition remains rejected. This policy is logged separately as `kiln-dispatch-record-stream/1`; original source validation, numerical checks and dtype checks remain active.

These changes mean the result is not unchanged-protocol PassNet reproduction. Keeping original checkout files untouched and recording process-local integration policy makes the distinction reviewable. Broadening allowed operations or hiding prohibited constructors would require a different integrity argument and is not justified by this milestone.

## Measurement evidence and its limits

The first non-isolated complete-task run passed five variants and failed BF16 timing stability. Its failure remains archived. An isolated rerun temporarily paused only the identified reference benchmark container, retained desktop GPU activity in the recorded environment, and automatically resumed the reference run on exit.

All six variants passed in the isolated rerun. The unchanged official scorer parsed six samples with explicit p=0 and fpdb=0.1, yielding aggregate 0.8495327431059172. This is slower than eager in that run. It is one complete task-family result on DGX Spark, not evidence that Kiln generally improves performance or that a learned compiler policy generalizes.

The coverage ledger therefore records one of 200 tasks and six of 2,060 graphs verified under the modified protocol. The other 199 tasks remain unverified. Separately, all twelve variants of the second task—division followed by transpose—have compiled and passed source-based GPU comparisons, but full evaluator acceptance was pending at this report's checkpoint.

## Continue from evidence

The next execution gate is full checker acceptance for the second task, including both captured division constants and all shape/dtype variants. Larger missing capabilities include convolution, concatenation, embedding/indexing, pooling and broader layouts. The static corpus inventory informs implementation priorities but cannot prove execution support.

Reusable compiler policy research remains a later experimental layer: establish fixed graph-family training/held-out splits, compare unchanged and candidate compiler policies under equal budgets, and retain unsupported-case accounting. Neither the current task-specific artifact dispatch nor successful low-precision tests establish agent-driven compiler improvement.

Reproduction procedures are numbered in KILN-005 `scripts/`; code lives in `packages/kiln/`, `runtime/python/` and `integrations/passnet/`. Raw evidence includes `first-task-isolated.log`, `first-task-score.json`, `rounding-check.json` and per-variant compiler/GPU receipts. Commits through `2ad42d5` establish this report's implementation checkpoint.
