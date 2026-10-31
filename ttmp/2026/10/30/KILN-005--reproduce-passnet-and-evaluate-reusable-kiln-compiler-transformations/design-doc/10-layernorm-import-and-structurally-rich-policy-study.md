

### Native-reference result and explicit research protocol revision

The v5-r1 compilation gate passes all 240 artifacts. Native training completes twelve graphs but fails unchanged-baseline correctness on Pegasus and Opus linear projections. Selection refuses the run. Diagnostics in `sources/rich-matrix-numerics.json` show that Kiln agrees with FP64 and highest-precision PyTorch within 4e-8, whereas the native high/TF32-enabled reference differs by up to 7.25e-5. The native run remains failed, with no selection or confirmation timing.

The separately frozen `policy-corpus-v5-r2` retains every source, split, policy, tolerance and compiled binary. Its sole execution change is an explicit `float32_matmul_precision=highest` reference, enforced by the hashed script 179 wrapper and recorded in the measurement plan. This modified FP32 compiler-policy protocol cannot establish native PassBench acceptance. Training has already been observed in v5-r1; confirmation GPU timing remains unobserved. The research result is pending training and confirmation, and original benchmark compatibility remains a separate open requirement.
