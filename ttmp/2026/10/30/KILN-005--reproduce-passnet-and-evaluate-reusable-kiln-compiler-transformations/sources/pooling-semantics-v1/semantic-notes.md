# Average-pooling source and implementation notes

Public contract: https://docs.pytorch.org/docs/main/generated/torch.nn.functional.avg_pool2d.html (read through web search; direct download returned HTTP 403).

Pinned PyTorch v2.9.1 AveragePool2d.cpp, CUDA AveragePool2d.cu and Pool.h are archived alongside their hashes and exact URLs. They were inspected for window clipping, divisor selection, accumulation and output-shape correction. No upstream implementation text was copied into Kiln. The JavaScript reference/decomposition and Python binding are new implementations using existing Kiln views, masks and reductions.

For axis length L, kernel K, stride S and padding P, output size is floor((L+2P-K+(ceil?S-1:0))/S)+1. In ceil mode, remove a last window whose padded start is at least L+P. Window endpoints for included-padding division stop at L+P; actual reads stop at L. Thus implicit trailing cells required only for ceil mode are not equivalent to explicit padding. Excluded-padding division counts actual input cells. A nonzero integer divisor override supersedes both counts.

Kiln pads through a clamped view and select mask before window extraction. The select is necessary because multiplication by zero would not suppress a NaN in a clamped boundary cell. The decomposition reduces window width and height using existing reduction primitives; it does not promise the serial addition order of PyTorch CUDA. FP16/BF16 inputs widen for accumulation and narrow once at the operation boundary. CUDA testing must establish the practical numerical behavior; CPU-oracle fixtures alone cannot do so.

The first implementation stores static spatial masks and output divisors as constants, following the existing convolution decomposition approach. This is a correctness-oriented baseline. Large image sizes may require symbolic masks or other lowering improvements; those should be driven by compiled code and measurements rather than hidden host computation.
