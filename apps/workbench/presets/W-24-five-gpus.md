# One program, five GPUs

"Which GPU is faster?" has no single answer: it depends on which resource your kernels exhaust. This project compiles the feed-forward block of a transformer layer at GPT-2-small width for five simulated GPUs. On each one it measures which schedule wins and what binds.

> **Try it** — [measure on every simulated GPU](lab:measure?all=sim) (it takes a few seconds), then compare in [Perf](lab:view?name=perf) under *Across devices*. To see one device's schedules, switch to it: [RTX 5090](lab:device?id=sim:rtx5090&measure) · [RTX 4090](lab:device?id=sim:rtx4090&measure) · [H100](lab:device?id=sim:h100&measure) · [A100](lab:device?id=sim:a100&measure) · [Orin](lab:device?id=sim:orin&measure). The [Knobs](lab:view?name=knobs) view shows the picks.

## The program

$$y = x + W_\text{down}\, \operatorname{GELU}\!\big(W_\text{up}\, \operatorname{RMSNorm}(x)\big), \qquad x \in \mathbb{R}^{256 \times 768},\; W_\text{up} \in \mathbb{R}^{3072 \times 768}$$

It compiles to three kernels:

- RMSNorm: a row kernel.
- Up-projection with GELU fused into its epilogue: a tiled matmul.
- Down-projection with the residual add fused in: a tiled matmul.

Each matmul is $2 \cdot 256 \cdot 768 \cdot 3072 = 1.21$ GFLOP. Its 9.4 MB weight matrix dominates the bytes, so its intensity is about 90 flop/byte.

## The devices

| simulated GPU | SMs | clock | FP32 peak $\pi$ | DRAM $\beta$ | ridge $\pi/\beta$ | shared-memory rate (SMs × clock) |
|---|---:|---:|---:|---:|---:|---:|
| RTX 5090 (Blackwell) | 170 | 2.41 GHz | 104.8 TF | 1792 GB/s | 58.5 | 410 G wavefronts/s |
| RTX 4090 (Ada) | 128 | 2.52 | 82.6 | 1008 | 81.9 | 323 |
| H100 SXM (Hopper) | 132 | 1.98 | 67 | 3350 | 20.0 | 261 |
| A100 80GB (Ampere) | 108 | 1.41 | 19.5 | 2039 | 9.6 | 152 |
| Orin Nano class | 8 | 0.625 | 1.28 | 68 | 18.8 | 5 |

By the roofline alone, the matmuls (about 90 flop/byte) are compute-bound everywhere. Then the H100 should be about 1.6× slower than the 5090 (67 vs 104.8 TFLOP/s) and the A100 about 5× slower.

## What you should see

Simulated, tokens = 256:

| GPU | total | up-proj + GELU | down-proj + residual | bound |
|---|---:|---|---|---|
| RTX 5090 | 177 µs | 67.8 µs, 32×32 tiles, 2×2 per thread | 105.7 µs, 32×16 tiles | smem |
| RTX 4090 | 176 µs | 70.2 µs, 64×32 tiles | 101.2 µs, 32×16 tiles | smem |
| H100 | 249 µs | 88.6 µs, 64×32 tiles | 157.2 µs | smem |
| A100 | 381 µs | 152.8 µs, 128×64, 4×2 per thread | 224.7 µs, 128×16 | smem |
| Orin | 6261 µs | 3102 µs, 128×128, 8×2 per thread | 3131 µs, 128×64, 8×4 | smem |

**What binds is shared memory, not the FP32 peak and not DRAM.** These kernels read their operands from shared memory at one warp-wide request per SM per clock. Their speed therefore tracks the last column, SMs × clock:

- The 4090 nearly ties the 5090 despite 22% less FP32 peak.
- The A100 is about 2.2× slower than the 5090, close to its 2.7× deficit in shared-memory rate and far from its 5.4× deficit in FP32 peak.
- The H100 lands between the two.

**The schedules differ per device.** The cost model sees each target's SM count, shared memory and limits:

- **Bigger tiles on fewer SMs.** With 8 SMs the Orin can't use parallelism anyway, so it takes 128×128 tiles for maximum reuse. The 5090 needs at least 170 blocks in flight, so it takes small 32×32 tiles that give 768 blocks.
- **Wave quantization.** A schedule with $G$ blocks on $S$ SMs holding $b$ blocks each runs in $\lceil G / (S b) \rceil$ waves. A grid that barely spills into an extra wave wastes most of that wave. The best tile size is not a constant; it is a function of the matrix *and* the GPU.

**The RMSNorm kernel** (3–4 µs everywhere, 28 µs on the Orin) is launch-bound: 256 rows of 768 floats is 0.8 MB.

## Why the H100 looks bad here

The H100 is built for **tensor cores**: about 989 TFLOP/s dense BF16, against 67 TFLOP/s FP32 on its CUDA cores. It also has HBM3 at 3.35 TB/s. This compiler emits FP32 SIMT code that uses neither, so the H100 competes on shared-memory rate, where a gaming card with more SMs and higher clocks wins. On real workloads the H100 runs this block in BF16 on tensor cores, far faster than the 5090's FP32 path. The lesson is not "the 5090 beats the H100". It is **"performance depends on which units your code actually uses"**.

## The system

- Switching device recompiles: the target's `maxThreadsPerBlock`, shared memory per block and SM count change which schedules are legal and how the cost model ranks them. Compare the [Tile IR](lab:ir?name=tile) between devices.
- Every measurement is recorded as evidence keyed by (device, kernel identity, schedule), so tuning results never leak from one GPU to another. See [Evidence](lab:view?name=evidence).
- *Across devices* in Perf shows each device's latest measurement of this project.

## Takeaways

1. Know which resource binds on *each* target: FP32 peak, tensor cores, DRAM, shared memory or launch overhead. Specs that don't bind don't matter.
2. Schedules are not portable. Tile sizes that fill a 170-SM GPU waste an 8-SM one, and vice versa. Autotune per device, or let the cost model see the device.
3. "Compute-bound" on paper can mean "on-chip-bandwidth-bound" in practice.

## Exercises

1. Raise [tokens to 1024](lab:param?name=tokens&value=1024) and measure on every GPU again. Which GPU gains the most, and why? (Think about blocks per SM and waves.)
2. Compute the waves for the up-projection on the A100: $G = (256/128)(3072/64)$ blocks, 108 SMs. How busy is the last wave?
3. Tune the program on the 5090, then switch to the 4090: does the 5090's evidence apply? Read the *by* column in Knobs.

## Further reading

- NVIDIA, *H100 Tensor Core GPU Architecture* (whitepaper, 2022)
- [Modal GPU Glossary](https://modal.com/gpu-glossary): SMs, warps, tensor cores, occupancy
- Ansor, [*Generating High-Performance Tensor Programs for Deep Learning*](https://arxiv.org/abs/2006.06762): why schedules are tuned per target
