# LayerNorm with a residual

Every transformer block ends with $y = \operatorname{LayerNorm}(x + r)$: the sub-layer's output added to the residual stream, then normalized. Unfused, the sum $x + r$ is written to memory and read back. Fused, it lives in registers and shared memory for the duration of one row.

> **Try it** — [measure](lab:measure) and look at the DRAM column in [Perf](lab:view?name=perf), then read the single kernel in [Kernels](lab:view?name=kernels).

## The maths

$$u = x + r, \qquad \mu = \frac1D \sum_j u_j, \qquad \sigma^2 = \frac1D \sum_j (u_j - \mu)^2, \qquad y_j = \frac{u_j - \mu}{\sqrt{\sigma^2 + \varepsilon}}\, g_j + b_j$$

Two reductions per row (the mean, then the variance around it — the stable two-pass form from W-22), then an elementwise affine transform.

**Bytes.** For 2048 rows of 1024 floats: read $x$ and $r$ (8 MiB each), write $y$ (8 MiB) = **24 MiB**. Unfused, $u$ would add a write and a read: 40 MiB. At 1792 GB/s that is the difference between 14 µs and 23 µs of pure traffic.

## What you should see

One kernel, `k_ew_layer_norm_reduce`, 17.7 µs on the simulated RTX 5090, 24 MiB of DRAM traffic: the minimum. The schedule is one block of 1024 threads per row, with the row of $u$ staged in shared memory (`STAGE=all`). The three sweeps (mean, variance, normalize) read $u$ from shared memory, not DRAM.

The checks verify both the structure ("one kernel") and the maths: every output row has mean ≈ 0 and variance ≈ 1 (with $g = 1$, $b = 0$).

## The system

- The residual add is an elementwise producer read by three sweeps of the row. Inlining it means computing $x_j + r_j$ three times, which the fusion guard accepts: three adds are cheaper than a store and a load (W-09 explains the work estimate).
- With `STAGE=all`, the kernel computes $u$ once while staging it, so even the recomputation disappears.

## Exercises

1. Return $x + r$ as a second output (transformers need the updated residual stream). What happens to the kernel count and the bytes? Is the result still optimal?
2. Compare with RMSNorm (W-05) on the [A100](lab:device?id=sim:a100&measure): does the extra reduction cost time on a memory-bound kernel?
3. Why does the model pick 1024 threads per row here but 128 for the softmax in W-06? (Hint: rows, SMs and waves.)
