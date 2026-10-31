---
Title: Convolution accumulation precision and protected export failure
Ticket: KILN-005
Status: active
Topics:
    - kiln
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://packages/kiln/src/std/conv2d.js
      Note: Reference accumulation and lowering boundaries
    - Path: repo://packages/kiln/src/std/fns.js
      Note: FP32 scalar and accumulator update definitions
    - Path: repo://ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/singleton-accumulation-counterfactual-v1.json
      Note: Controlled arithmetic isolation
    - Path: repo://ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/singleton-native-precision-v1.json
      Note: Independent native CUDA row probe and limitations
ExternalSources: []
Summary: ""
LastUpdated: 2026-10-31T11:15:22.012691683-04:00
WhatFor: ""
WhenToUse: ""
---

# Convolution accumulation precision and protected export failure

## Observed failure and scope

Task10's second imported variant fails the protected export check before any original PassBench execution. Its computation is FP16 convolution, bias addition, singleton reshape, FP32 softmax and FP16 output. The input has shape [128,608,8,6], the weight [1,608,1,1], and the output [128,1,48,1]. The existing runner stops this family after the failure, leaving all33 variants unexecuted. The first compiled variant is not accepted benchmark evidence.

The deterministic export input produces6144 output values. Frontend and tensor interpreters agree exactly. The loop interpreter differs at21 values; two exceed the unchanged export criterion `abs(error) <= 1e-4 + 1e-3 * abs(reference)`. Maximum absolute output difference is0.0010986328125. These are local reference checks, separate from PassBench's nominal-5 acceptance protocol.

Scripts415–418 isolate convolution accumulation as the cause for this deterministic input. An independent native PyTorch CUDA probe supports retaining the frontend reference for the tested row. No compiler repair is implemented in this checkpoint. Accepted coverage remains31 complete tasks and358 individual graphs, cumulatively across recorded compiler revisions.

## Accumulation and narrowing boundaries

The frontend convolution reference computes a dot product with JavaScript double arithmetic and stores its result in a Float32Array. Tensor decomposition also uses double accumulation inside each reduction, with FP32 storage between tensor nodes. The loop interpreter rounds every scalar product and accumulator update to FP32. These implementations agree over real arithmetic but can produce different floating-point values.

For this1x1 convolution, each output reduces608 input channels. If `f` denotes FP32 rounding, the loop computes `s[j+1] = f(s[j] + f(x[j] * w[j]))`. The frontend accumulates products in double precision before one final FP32 store. FP16 input products fit within FP32 precision here; repeated addition is the relevant difference.

The public low-precision convolution wrapper deliberately narrows the convolution result before adding FP16 bias. Existing native fixtures establish this boundary. It must remain intact. The imported program then reshapes the result, widens for softmax and narrows its output. Narrowing is discontinuous at representable-value midpoints, so a small accumulator difference can become a larger downstream output difference.

At flattened convolution index1696, the independent double sum is10.386718338355422. Its FP32 store is10.38671875, while sequential FP32 accumulation produces10.386717796325684. The FP16 midpoint between10.3828125 and10.390625 is10.38671875. Consequently, even improving accumulation must preserve the declared intermediate FP32 and FP16 boundaries; accumulating in double and directly narrowing to half is a different program.

## Controlled substitutions

Script416 uses the graph evaluator's existing `onNode` hook to substitute diagnostic values after evaluation. It changes neither registered evaluator definitions nor compiler source. The convolution substitution is explicitly restricted to this retained1x1 shape, preventing it from becoming an accidental general implementation.

| Diagnostic | Changed arithmetic | Differences from loop | Failing values |
|---|---|---:|---:|
| Unchanged frontend | None |21|2|
| Frontend convolution only | FP32 product and accumulator rounding |0|0|
| Tensor softmax sum only | FP32 accumulator rounding |21|2|
| All tensor add reductions | FP32 accumulator rounding |0|0|

The frontend convolution substitution changes5670 pre-narrowing convolution values, with maximum absolute difference0.0000362396240234375. Changing only the softmax sum changes66 reduction results by at most7.152557373046875e-7 and leaves both failures. This establishes the cause of this local discrepancy; it does not establish which implementation should define external correctness.

## Independent native probe

Script417 preserves all608 channels and48 spatial positions for original batch35, its weight and bias, and both interpreter outputs. The resulting29184 input values form a complete softmax row. The witness bytes have SHA256 `daf0ebf62b22502a7027d5896d3b46778deb44c0d70fc297bb3d1573a9e02bc3`.

Script418 copies only this witness into an isolated remote diagnostic directory and runs native PyTorch in the pinned evaluation container. It uses `manuel@bling` with `HostKeyAlias=bling.local`, without modifying shared compiler sources. The device is NVIDIA GB10; PyTorch is2.12.0a0+5aff3928d8.nv26.05. TF32 is disabled explicitly.

Native CUDA FP16 output matches the frontend's48 retained values exactly. It differs from the loop at21 values, including the same two failures. CPU FP16 differs from the frontend at20 values and fails two, while remaining within the export threshold of the loop. Therefore CPU execution is not an adequate substitute for this CUDA numerical check.

FP32 and FP64 native probes are retained as distinct dtype controls. They do not preserve all FP16 narrowing boundaries and must not be described as experiments changing only accumulator precision. The probe uses batch size1, while the original program uses128. cuDNN may select a different algorithm for different shapes. This is evidence about the retained row, not proof of full-shape behavior, a compiled Kiln GPU result, or original PassBench acceptance.

## Repair boundary and architecture

Changing the frontend reference to sequential FP32 accumulation would make this local check pass but would move it away from the observed native CUDA result. Loosening export tolerance or skipping the check would leave the accuracy issue unresolved. Neither action is authorized as a repair by this evidence.

The repair should expose accumulation strategy explicitly at the existing tensor-to-loop reduction boundary. Candidate strategies include balanced or blocked FP32 reduction, compensated FP32 accumulation, and a more precise accumulator fallback. None is qualified by this checkpoint. A new strategy must have an interpreter and emitted implementation that agree about update order, rounding, contraction and final narrowing. Shared reduction machinery should own those rules rather than adding a separate convolution runtime or graph-specific kernel.

Compensated accumulation needs additional accumulator state and protection against reassociation. A balanced reduction changes summation order and can still cross half-precision midpoints. A double-precision fallback affects code generation, backend availability and performance. Selection requires measured correctness and cost; the current diagnostic cannot choose a universal strategy.

This is a useful object for later self-optimization: the agent may select among compiler-provided accumulation strategies under fixed numerical gates. It must not alter the oracle or use evaluation failures to relax acceptance. Existing policy/search infrastructure should be extended only after a reusable numerical primitive is validated.

## Next implementation gates

1. Reproduce the native behavior at the original128-batch geometry, recording algorithm-affecting settings and full finite comparisons.
2. Define the reduction strategy contract and independent cancellation/midpoint fixtures before changing lowering.
3. Evaluate a reusable strategy on the retained failure, FP32/FP16/BF16 convolution fixtures, and composed softmax programs. Preserve bias and cast boundaries.
4. Compile and execute all33 frozen variants through the original evaluator with unchanged declared tolerances; retain every failure and unsupported case.
5. Investigate task88 and95 separately. Their evaluated linear/normalization failures are not explained or repaired by this convolution result.

## Evidence and provenance

The primary evidence files are `singleton-export-check-diagnostic-v1.json`, `singleton-accumulation-counterfactual-v1.json`, `singleton-precision-witness-v1.json` and `singleton-native-precision-v1.json`, with raw logs alongside them. Scripts415–418 reproduce acquisition and measurement. Their diagnostic code is authored in this project; no PyTorch or PassNet implementation is ported in this checkpoint. Existing pinned PyTorch and PassNet sources provide the execution environment and task context. Diary Step148 records failures and review instructions.
