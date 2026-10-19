# Attention

Scaled dot-product attention, batched over heads:

$$\operatorname{Attention}(Q, K, V) = \operatorname{softmax}\!\Big(\frac{QK^\top}{\sqrt{d}}\Big)V$$

The compiler produces three kernels: $S = QK^\top$ (tiled), the scale fused into the softmax (a row kernel), and $PV$ (tiled). Here is what that costs, and what FlashAttention changes.

| sequence $L$ | $QK^\top$ | scale + softmax | $PV$ | total |
|---:|---:|---:|---:|---:|
| 256 | 6.2 µs | 5.0 µs | 9.5 µs | 20.8 µs |
| 1024 | 41.9 | 40.6 | 54.5 | 137 |
| 2048 | 168 | 153 | 218 | 539 |

Simulated RTX 5090, 8 heads, $d = 64$. From 256 to 2048 the sequence grows 8× and the time 26×; with launch overheads amortized, it tends to the $64\times$ of an $L^2$ algorithm. At $L = 2048$ the softmax kernel alone moves 256 MiB through DRAM: it reads the score matrix once and writes it once.

> **Try it** — [measure](lab:measure), then grow the [sequence to 1024](lab:param?name=seq&value=1024&measure) and [2048](lab:param?name=seq&value=2048&measure) and watch the DRAM column of the middle kernel. [Back to 256](lab:param?name=seq&value=256).

## The maths: quadratic memory

With $h$ heads, sequence length $L$ and head dimension $d$:

| | flops | bytes the score matrix moves |
|---|---|---|
| $S = QK^\top$ | $2hL^2d$ | write $4hL^2$ |
| softmax | $\approx 5hL^2$ | read and write $4hL^2$ each |
| $PV$ | $2hL^2d$ | read $4hL^2$ |

The score matrix $S \in \mathbb{R}^{h \times L \times L}$ goes through DRAM about four times. Its size grows with $L^2$, while $Q$, $K$, $V$ and the output only grow with $L$. At $h = 8$, $L = 2048$ that is 128 MiB of scores, for 3 × 4 MiB of inputs. For long sequences attention is dominated by moving a matrix that nobody needs to keep.

## FlashAttention in one paragraph

Tile $Q$ by rows. For each tile, stream $K$ and $V$ tile by tile, computing a block of $S$ in shared memory. Update a running row max, a running softmax denominator and a running output with the online-softmax rescaling (W-06). Nothing of size $L^2$ ever reaches DRAM. The flops are the same; the bytes drop from $O(hL^2)$ to $O(hLd)$.

This compiler cannot do that yet. It needs a pair-valued reducer (running max and sum), and fusion *across* a contraction, which the blowup guard currently declines (see the declined steps in [Trace](lab:view?name=trace)). Both are good projects.

## Exercises

1. Add a causal mask as a fourth input, `mask: k.tensor([seq, seq])` (0 on and below the diagonal, $-10^9$ above), and add it to the scores before the softmax. Does it fuse into the softmax kernel? How many bytes does reading it cost at $L = 2048$, and how would computing the mask from the indices instead (`row < col`) avoid them?
2. At which sequence length does the score matrix exceed the RTX 5090's 96 MB of L2?
3. Compute the arithmetic intensity of the $QK^\top$ kernel for $d = 64$. Why is attention with small heads harder to make compute-bound than a big linear layer?

## Further reading

- Vaswani et al., *Attention Is All You Need* (2017)
- Dao et al., [FlashAttention](https://arxiv.org/abs/2205.14135); Milakov & Gimelshein, *Online normalizer calculation for softmax*
