---
Title: Convolution semantics and lowering plan
Ticket: KILN-005
Status: active
Topics: [kiln]
DocType: design-doc
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: NCHW cross-correlation reference and pending compiler lowering
---

# Convolution semantics and lowering plan

The third evaluation task requires conv2d, in-place ReLU, residual addition and bilinear interpolation. Convolution is therefore a concrete dependency, not an optional synthetic extension. Start with exact shape/group/index semantics before scheduling optimization.

`packages/kiln/src/std/conv2d.js` currently implements independent NCHW/OIHW reference cross-correlation and shape validation. For input N,C,H,W and weight O,C/groups,KH,KW, output size is floor((input + 2*padding - dilation*(kernel-1) - 1)/stride)+1 per spatial axis. Channel and output counts must divide groups; bias must have O elements. String padding and nonpositive dimensions are currently rejected.

For each output n,o,y,x, reduce over input-channel-within-group and kernel coordinates. The input channel is floor(o/(O/groups))*(C/groups)+i. Spatial input indices are y*strideH-paddingH+ky*dilationH and x*strideW-paddingW+kx*dilationW. Out-of-range spatial contributions are zero. This is cross-correlation: kernel spatial indices are not reversed.

The reference accumulates JavaScript numeric products then stores FP32. It is a test oracle for small FP32 inputs, not a claim of exact PyTorch accumulation order or reduced-precision semantics. Three deterministic PyTorch fixtures cover standard, grouped/strided and depthwise/dilated cases. Script 28 regenerates them and records installed PyTorch version; no source implementation was copied.

Pending lowering must represent safe masked loads, since evaluating an out-of-bounds load and selecting zero afterward is invalid. Options include explicit padded tensors or conditional load expressions with reference, loop scheduler, simulator and emitter support. The lowering must preserve groups, bias and accumulation/result precision. Cost models need compute and memory estimates for the resulting reduction structure, followed by actual CUDA profiling.

Completion requires frontend inference/reference, legal lowering, source-preserving precision, CUDA execution, original task numerical/dtype checks and all-variant accounting. Reference tests alone do not increment benchmark coverage. Bilinear interpolation and mutation/alias legality for ReLU remain separate task dependencies.
