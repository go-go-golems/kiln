# Batch size and arithmetic intensity

Why is generating text one token at a time so slow, while processing a long prompt is fast? Why does serving many users at once barely cost more than serving one? All three answers come from one formula: the **arithmetic intensity of a matrix–vector versus a matrix–matrix product**.

> **Try it** — [measure at batch 1](lab:measure), then [batch 8](lab:param?name=batch&value=8&measure), [batch 128](lab:param?name=batch&value=128&measure) and [batch 1024](lab:param?name=batch&value=1024&measure). Watch time per token and the bound in [Perf](lab:view?name=perf). [Back to batch 1](lab:param?name=batch&value=1).

## The program

One linear layer, $y = x W^\top$, with $W \in \mathbb{R}^{d \times d}$ (here $d = 2048$, so $W$ is 16 MiB of fp32) and $x \in \mathbb{R}^{M \times d}$. $M$ is the number of tokens processed together:

- **Decoding:** $M$ = the number of sequences in flight. Each step makes one token per sequence, so $M$ is 1 for a single user.
- **Prefill:** $M$ = the prompt length. All prompt tokens go through the layer at once.

## The maths

$$W_\text{flop} = 2Md^2, \qquad Q = 4\,(Md + d^2 + Md) = 4d\,(2M + d)\ \text{bytes}$$

The $d^2$ term is the weights. It is paid once per call, whatever $M$ is. So the intensity is

$$I(M) \;=\; \frac{2Md^2}{4d(2M+d)} \;=\; \frac{Md}{2(2M + d)} \;\approx\; \frac{M}{2} \quad (M \ll d)$$

**Each token you add to the batch adds about half a flop per byte.** At $M = 1$ the layer does 0.5 flop/byte, about 1/100 of an RTX 5090's ridge point (58.5). The weights stream from DRAM and the cores idle.

The layer becomes compute-bound when $I(M) = I^*$:

$$M^* = \frac{2 d I^*}{d - 4I^*}$$

which gives $M^* \approx 132$ on the RTX 5090 and $\approx 42$ on the H100 (ridge 20).

Below $M^*$, the roofline bound $t \ge t_\text{launch} + Q/\beta$ hardly changes with $M$, because $Q$ is dominated by $d^2$. **Up to $M^*$, extra tokens are nearly free.** That is the economics behind batched LLM serving, and behind speculative decoding, which turns several sequential decoding steps into one batched verification.

## What you should see

Simulated RTX 5090, $d = 2048$. The bound column is $2.5\,\mu s + \max(Q/\beta, W/\pi)$.

| batch $M$ | intensity | roofline bound | simulated | per token | bound by |
|---:|---:|---:|---:|---:|---|
| 1 | 0.5 | 11.9 µs | 12.6 µs | 12.6 µs | dram |
| 8 | 3.9 | 11.9 µs | 33.9 µs | 4.2 µs | smem |
| 32 | 15.5 | 12.2 µs | 42.2 µs | 1.3 µs | smem |
| 128 | 56.9 | 13.0 µs | 86.3 µs | 0.67 µs | smem |
| 256 | 102 | 23.0 µs | 121.5 µs | 0.47 µs | smem |
| 1024 | 256 | 84.5 µs | 359.4 µs | 0.35 µs | smem |

Per-token cost falls by 36× from $M = 1$ to $M = 1024$. Two things in this table are worth a closer look.

**Batch 1 hits the roofline.** The compiler picks a row schedule: a block per output row computes a dot product with a tree reduction. That streams $W$ at 1331 GB/s, 74% of peak. A matrix–vector product can't do better than streaming the weights once, so this is essentially optimal.

**Batch 8 is 2.8× off the roofline.** In theory it should cost the same as batch 1 (same bytes), but this compiler has no good schedule for "skinny" matrices:

- The row schedule re-reads $W$ once per row of $x$, so traffic grows by 8×.
- The tiled schedule pads $M$ up to a 16-row tile, wasting half its work, and becomes limited by shared memory.

Production libraries ship special kernels for this shape: batched GEMV, and **split-K**, which splits the long $d$ dimension across blocks and adds the partial sums. Writing a split-K pass is a good exercise.

At large $M$ the layer is compute-heavy but shows "smem", not "compute": these FP32 SIMT kernels are limited by shared-memory bandwidth at about 24 TFLOP/s, 23% of peak. W-21 climbs that ladder. Real prefill uses tensor cores, which this compiler does not emit.

## The system

- The fork at the tile pass offers `MAP=row` (dot products with a block-wide tree reduction) and `MAP=tiled` with every legal tile shape. Open [Knobs](lab:view?name=knobs) at batch 1 and at batch 1024: the cost model's favourite flips from row to tiled as the intensity grows.
- The check in [Code](lab:view?name=code) prints the intensity of the current shape.
- The cost model's estimates, and the simulator, count bank conflicts in shared memory the same way the hardware does: per warp, the most distinct addresses that fall in one bank.

> **Caveat** — Real decode kernels also read the KV cache (attention), quantize weights to 8 or 4 bits (which cuts $Q$ by 4–8×, so intensity goes up by the same factor), and fuse several layers. The intensity argument stays the same, with different constants.

## Takeaways

1. Matrix–vector products (decoding) are memory-bound by construction: about 0.5 flop/byte in fp32.
2. Batching raises intensity linearly until the ridge point. Below it, extra batch is nearly free; above it, cost grows with the flops.
3. "Memory-bound" tells you the target. At batch 1, the job is moving the weights at full bandwidth, or moving fewer of them (quantization).

## Exercises

1. Derive $I(M)$ for fp16 weights with fp32 activations. What is $M^*$ on the RTX 5090 now?
2. Switch to the [H100](lab:device?id=sim:h100&measure). At what batch does its bound column leave DRAM?
3. Write the split-K rewrite as a Tensor IR pass: reshape the $d$ axis into $(S, d/S)$, reduce the inner axis, then the outer. Offer $S$ as a fork. Measure batch 8.

## Further reading

- [Modal GPU Glossary](https://modal.com/gpu-glossary): arithmetic intensity
- Horace He, [Making Deep Learning Go Brrrr](https://horace.io/brrr_intro.html)
- [CUTLASS documentation](https://docs.nvidia.com/cutlass/): split-K and stream-K GEMM
