---
Title: Typed storage and reduced precision compiler extension
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
LastUpdated: 2026-10-30T20:47:57.77289994-04:00
WhatFor: ""
WhenToUse: ""
---

# Typed storage and reduced precision compiler extension

## Problem and semantic contract

The integration currently rejects non-FP32 tensors. Removing that check would silently misinterpret FP16/BF16 pointers as float pointers. Reduced precision is an end-to-end compiler feature: tensor type, reference evaluation, intermediate rounding, buffer layout, emitted loads/stores, exported byte counts and runtime allocation must agree.

A tensor has a storage dtype and operations have an arithmetic/result dtype. FP32 accumulation does not authorize FP32 storage for an FP16 output. Each source operation's observable rounding must be represented before fusion; final-output-only rounding can disagree with eager execution. Numerical tolerances are evidence of acceptable error, not permission to change output dtype.

## Current source evidence

- core/kiln.js tensor(shape,dtype) stores an unrestricted dtype string.
- core/util.js dtypeBytes recognizes u8 as one byte and otherwise returns four. It cannot describe reduced-precision buffers correctly.
- std/kernel.js materialize retains input dtype in K.params but output parameters have no dtype.
- std/emit.js toCuda emits input unsigned char for u8 and float otherwise; output is always float. Arithmetic temporaries/shared memory are float.
- std/emit.js toWgsl emits packed u8 or f32 input storage and f32 output storage. CUDA-only type support cannot be implemented by accidentally emitting invalid WGSL.
- std/export.js unconditionally allocates kernel output buffers as f32 and computes sizes in 32-bit words except u8 packing.
- std/program.js includes input dtype in kernel identity but not a separately modeled output dtype; it estimates output bytes at four per element.
- runtime/python/kiln_launch.py host packing and output decoding are FP32 except u8 inputs. The pointer launcher can transport other storage types only after artifact/kernel agreement is implemented.

## Implementation sequence

1. Define a closed dtype table with byte widths and storage/arithmetic categories. Unknown types must fail. Preserve existing f32/u8 behavior and avoid adding interface adapters.
2. Add typed reference quantization/conversion with explicit FP16/BF16 round-to-nearest-even behavior. Test signed zero, NaN, infinity, subnormals, overflow and midpoint rounding against PyTorch-generated reference vectors.
3. Propagate result dtype through frontend inference and loop/kernel outputs. Introduce explicit conversion/rounding nodes where source semantics require them. Legality of moving conversion across arithmetic must be explicit.
4. Make CUDA storage types and load/store conversion depend on buffer dtype. Use verified CUDA half/bfloat16 headers/intrinsics or documented bit conversions. Keep arithmetic accumulation choice separate. Verify NVRTC on SM121 and declared minimum architecture.
5. Define backend capability handling: unsupported WGSL types produce a specific unavailable-backend result rather than crashing CUDA compilation or emitting f32 aliases. Audit unconditional dual-emission call sites before modifying them.
6. Export exact buffer byte counts, logical elements, output dtype and alignment. Include dtype/rounding semantics in kernel/evidence identities so previous FP32 measurements cannot be reused for different precision.
7. Extend Python pointer bridge allocations and validation. Add host packing only when reference/fixture paths require it, without routing GPU execution through CPU conversions.
8. Compile and check all six first-task variants, then expand the corpus. Keep unsupported full-benchmark tasks in declared denominators.

## Invariants and tests

```text
for each exported buffer:
    bytes >= logical_elements * storage_width
    kernel pointer type == exported storage dtype
for each output:
    PyTorch dtype == graph result dtype == artifact dtype
for each conversion:
    reference rounding == CUDA rounding on boundary vectors
for each fused region:
    observable source precision boundaries remain represented
```

Meaningful validation includes actual CUDA round-trips for f16/bf16 inputs and outputs, multikernel intermediates, odd element counts and non-default streams. Test reductions separately from elementwise operations because accumulation and cancellation differ. FP32 tests must continue to pass. Test explicit diagnostics for unsupported layouts/backends rather than silently falling back.

## Provenance and research requirements

Implementation must consult exact PyTorch operator promotion/accumulation behavior and official CUDA type/conversion documentation; archive the relevant sources before porting algorithms. Record URL, version/revision, file/symbol, license and adaptation in the detailed diary. No implementation is copied by this design document. Current inventory is evidence of missing capabilities, not proof of a complete precision contract.

## Delivery gate

A low-precision feature is complete only when source graph semantics, compiler reference checks, actual CUDA execution, original numerical/dtype checker and exported artifact agree. A pointer cast or output cast alone is not completion. This design remains a plan; current implementation supports the verified FP32 path only.
