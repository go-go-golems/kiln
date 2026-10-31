# Adaptive average pooling provenance and contract

The implementation in packages/kiln/src/std/pooling.js is independently written using existing Kiln tensor views, select, sum and division. No upstream implementation code was copied. The pinned PyTorch v2.9.1 AdaptiveAveragePooling.cpp, CUDA implementation and AdaptivePooling.h were consulted for semantic boundaries and accumulation/division order; hashes and URLs are in manifest.json.

For each axis, bin i is [floor(i*input/output), ceil((i+1)*input/output)). Bins may overlap, vary in width, and remain nonempty when output is larger than input. Null output dimensions preserve the input dimension. The current Kiln frontend requires positive static CHW/NCHW shapes and positive output dimensions; zero-size and dynamic tensors remain unsupported.

The contiguous CUDA reference accumulates in opmath precision and divides by bin height then bin width. Kiln widens low-precision inputs to FP32 and narrows once at the operator boundary. A rectangular maximum-bin view uses static masks only for varying bin widths, with clamped loads and select rather than multiplication so masked NaNs cannot contaminate sums. The generic reduction may change floating-point association; CPU fixtures do not establish universal GPU numerical equivalence.

The public API was read through web search at https://docs.pytorch.org/docs/stable/generated/torch.nn.modules.pooling.AdaptiveAvgPool2d.html and https://docs.pytorch.org/docs/stable/generated/torch.nn.functional.adaptive_avg_pool2d.html . Direct HTML download returned403 and is retained as a failed acquisition in manifest.json. No current documentation version is substituted for the pinned source version.
