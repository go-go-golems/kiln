---
Title: Input-mutation replay result and the shared-input limit of PassBench
Ticket: KILN-005
Status: active
Topics:
    - kiln
    - passnet
    - compiler-optimization
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: packages/kiln/src/std/export.js
      Note: writebackKernel — the compiled program writes a mutated input itself
    - Path: ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/mutation-writeback-replay-gpu-v1/results-audit.json
      Note: Per-graph audit of the replay
ExternalSources: []
Summary: The write-back design accepted 8 of 14 input-mutation families (90/126 graphs, from 0/12 with copy_). Four families that accumulate into an input cannot pass PassBench with any faithful replacement because the compiled and eager runs share one input dict; two more miss t=-5 by one low-precision ulp in matrix products.
LastUpdated: 2026-10-31T00:00:00Z
WhatFor: Interpreting input-mutation acceptance rates and choosing denominators
WhenToUse: Before reporting or comparing PassBench results on graphs that mutate their inputs
---

# Input-mutation replay result and the shared-input limit of PassBench

A source graph that updates one of its inputs in place (`x.relu_()`, `x += y`) needs a replacement that performs the same update. PassBench forbids tensor operations inside a replacement (`PosionDispatchTensor` admits factories only), so Kiln's compiled program performs it. The last kernel copies the computed value into the input's own buffer, and the program's output for that mutation is the input tensor itself (Step 257).

This note records the GPU replay of that design and two findings that bound what any compiler can score on these families.

> [!summary]
> - The write-back works. 8 of 14 families and 90 of 126 graphs are accepted, against 0 of 12 when the dispatcher called `copy_`. Every graph executed.
> - **Four families are unwinnable by construction.** 94, 111, 172 and 176 accumulate into an input and return a value derived from it. `test_single_model` passes the same `input_dict` to the compiled run and then to the eager run, so the eager reference sees twice the updates.
> - **Two families miss t=-5 by one f16/bf16 ulp.** 17 and 147 are low-precision matrix products. The cause needs a GPU probe to decide.

## Result

| Family | Mutation | Graphs accepted | Cause of rejections |
|---|---|---|---|
| 45 | clamp (`hardtanh_`) | 10/10 | — |
| 49, 134, 161, 196 | `relu_` | 6/6, 15/15, 6/6, 6/6 | — |
| 92, 96, 131 | `silu_` | 15/15, 8/8, 9/9 | — |
| 94, 111, 172, 176 | `x += y` | 0/2, 0/12, 0/7, 0/6 | shared input history |
| 17 | (no mutation in the failing graphs) | 14/18 | one-ulp f16/bf16 differences, batch-128 1×1 convolution |
| 147 | (no mutation in the failing graphs) | 1/6 | one-ulp f16/bf16 differences, K=128 linear |

## The shared-input limit

`pass_bench/torch/test_compiler.py::test_single_model` does the following, in order:

1. It builds `input_dict` once.
2. It runs the compiled model 20 warmup times plus 100 trials. `compiled_out` is the last result.
3. It runs the eager model on the same `input_dict` for another 20 + 100 calls. `expected_out` is the last result.
4. It compares the two.

For a graph computing `x ← x + y; out = f(x)`, with N = 120 calls per phase:

```text
compiled_out = f(x0 + N·y)
expected_out = f(x0 + 2N·y)
```

They differ whenever `y ≠ 0`. A replacement that skipped the write-back would also fail: compiled would see `f(x0 + y)` and eager `f(x0 + N·y)`. Idempotent updates (`relu_`, clamp) are unaffected. `silu_` passes only because repeated application converges toward 0, so the doubled history is below the tolerance.

The original graph compiled without any replacement shows the same mismatch, so these families measure the harness, not the compiler. They should be reported with this reason and kept out of acceptance denominators.

## The low-precision near-misses

The failing variants are f16/bf16 matrix products. The differences are single ulps:

- Family 17: max diff 2⁻¹⁴ to 2⁻¹¹, mean around 1e-9, so a handful of elements flip.
- Family 147: max diff one bf16 ulp, mean around 4e-6, so more elements flip.

Kiln widens operands to f32, accumulates in f32 and narrows once at the source operation's boundary. That is PyTorch's documented rounding point. Two explanations remain, and they predict different counts:

- **Reduction order.** cuBLAS or cuDNN may sum in a different f32 order. This flips only elements whose f32 result lies within an f32 rounding error of an f16 tie, a rate of roughly 2⁻¹³·√K.
- **Reduced-precision reductions.** `torch.backends.cuda.matmul.allow_fp16_reduced_precision_reduction` and its bf16 counterpart default to `True`, which permits low-precision partial sums in split-K kernels. This flips many more elements.

147's flip rate looks too high for reduction order alone, but that is an estimate. A GPU probe should rerun one failing graph with both flags set to `False` and compare Kiln's output with the reference under each setting.

## Working rules

- An input-mutation family is comparable across compilers only if its update is idempotent or contractive, or if the harness resets inputs between phases.
- A tolerance miss of one low-precision ulp in a matrix product is a reference-backend rounding question, not a Kiln semantics error. Settle it with a probe before changing Kiln.
