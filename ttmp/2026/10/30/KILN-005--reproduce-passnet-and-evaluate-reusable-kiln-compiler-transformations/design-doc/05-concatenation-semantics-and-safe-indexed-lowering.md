---
Title: Concatenation semantics and safe indexed lowering
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
LastUpdated: 2026-10-30T22:05:44.342285733-04:00
WhatFor: ""
WhenToUse: ""
---

# Concatenation semantics and safe indexed lowering

The full corpus audit identified concatenation as the first blocker for 531 graphs after static indexing support. This implementation adds a reusable nn.concat primitive and N.concat convenience API. Import success now covers 804 graphs and 24 complete tasks, but compilation and PassBench acceptance remain separate gates.

## Contract

`N.concat(xs, axis=0)` accepts a nonempty sequence of positive, static, equal-rank tensors. Dimensions other than the concatenated axis must match. Negative axes normalize against the common rank. Operands must share FP32, FP16 or BF16 storage dtype; the output preserves it. The FX importer uses the propagated PyTorch result dtype and emits explicit input casts for mixed floating operands.

Empty tensors, integer concatenation and mutation through an out buffer remain explicit unsupported cases. In particular, PyTorch permits a one-dimensional empty tensor in additional concatenation cases; this compiler primitive does not yet implement that exception. Consulted official torch.cat documentation is archived under sources/pytorch; no upstream implementation was copied.

## Reference and lowering

The independent reference implementation copies contiguous input blocks for each outer row. It does not compute arithmetic combinations of the operands, preserving values including NaNs and signed zeros.

For each operand, the Tensor IR lowering creates an indexed view of the output shape. The concatenated coordinate subtracts that operand's prefix offset and clamps to its valid input extent. Static per-axis masks then select the operand belonging at each output coordinate. Clamping is necessary because the compiler may evaluate unselected branch loads before selection.

```text
for each input j:
    start = sum of earlier axis lengths
    read_j = input_j[..., clamp(output_axis-start, 0, length_j-1), ...]
    mask_j = start <= output_axis < start+length_j
    result = select(mask_j, read_j, result)
```

The first operand initializes the result. Later masks cover their respective segments. Result dtype is explicit on the select primitive, preventing the FP32 mask from promoting a low-precision result. The initial implementation uses O(number_of_inputs × output_axis_length) static mask storage and can read unselected inputs. It establishes safe value semantics; performance optimization requires separate measurement.

## Reference input domain

The first BF16 probe failed the internal compiler check, although the decomposition selected the correct elements. Project.inputsFor had generated arbitrary FP32 data for BF16-declared storage. The reference concatenation copied those values while typed selection rounded them.

Script 62 reproduced the difference without weakening tolerances: maximum error 0.0018287301063537598 before input rounding, zero for every output after rounding the input domain to BF16. Project.inputsFor now converts generated or caller-supplied Tensor values to the declared FP16/BF16 representation, returning a new Tensor and preserving caller data. The same representable values are supplied to the original and transformed graphs. This is a correction to reference-input preparation, not a change to concatenation's value semantics.

## Validation

- Local Node 26 reference/decomposition tests cover multiple axes and FP32/FP16/BF16 types, invalid shapes, NaN, infinity and signed zero.
- Twenty-seven integration CPU tests passed, including mixed FP16/BF16 promotion to FP32.
- All 24 compiler test files passed on bling, including reference-input dtype and caller-data ownership checks.
- Four source-derived CUDA probe programs passed: FP32, FP16, BF16 and mixed FP16/BF16. Each returns concatenation, a transposed concatenation and a sliced concatenation.
- Probe compile receipts and successful/failed logs are archived under sources/concat and sources/concat-probes*.log.

The next gate is complete evaluation of a real concatenation task through the declared PassBench integration protocol. Current verified coverage remains 4 tasks / 49 graph variants.
