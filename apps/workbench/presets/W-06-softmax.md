# Softmax in one kernel

Softmax is the classic case for fusion with reductions: two reductions and three elementwise ops per row become one kernel with three sweeps, reading the row from DRAM once.

> **Try it** — read the [loop IR](lab:ir?name=loop) (three sweeps, in order), then the [CUDA](lab:view?name=kernels), then [measure](lab:measure).

## The maths: the safe softmax

$$\operatorname{softmax}(x)_j = \frac{e^{x_j - m}}{\sum_k e^{x_k - m}}, \qquad m = \max_k x_k$$

Subtracting the row maximum changes nothing mathematically (it cancels between numerator and denominator), but it keeps $e^{x_j - m} \le 1$. Without it, $e^{x}$ overflows fp32 at $x > 88.7$, and logits beyond that are common.

The decomposition produces two reductions and three elementwise ops: max, subtract, exp, sum, divide. Fused with loop-invariant code motion, the loop IR becomes

```text
for each row:
  m = max_k x[k]                   # sweep 1
  s = Σ_k exp(x[k] - m)            # sweep 2
  for each j: y[j] = exp(x[j] - m) / s   # sweep 3
```

Three sweeps over the row, one kernel. With the row staged in shared memory, DRAM sees it once: $8\,\text{bytes} \times$ elements in total.

## The system

The tile pass maps a row to a block (`MAP=row`) with cooperative reductions for the max and the sum. Whether staging the row in shared memory pays depends on the row length and on occupancy: see W-23. For 1024 × 1024 the cost model's pick runs in 7.9 µs on the simulated RTX 5090, for 8 MiB of DRAM traffic.

## Beyond: online softmax and FlashAttention

Two sweeps are enough: keep a running maximum $m$ and a running sum $s$, and rescale the sum whenever the maximum grows:

$$m' = \max(m, x_k), \qquad s' = s \cdot e^{m - m'} + e^{x_k - m'}$$

This combine is associative, so it fits a parallel tree reduction (Milakov & Gimelshein, 2018). It is also the key step of FlashAttention, which never materializes the attention matrix. This compiler's reducers are `add`, `max`, `min` and `mul`; a pair-valued reducer is the extension that would enable both.

## Exercises

1. Remove the max subtraction (write softmax by hand with `N.exp` and `N.sum`) and feed it inputs around 100. What does the end-to-end check say?
2. How many bytes does the unstaged schedule read per row? [Pin STAGE=none](lab:pin?STAGE=none&measure) and compare the DRAM column. [Unpin](lab:unpin).
3. Write the online-softmax recurrence for a tree reduction: how do two partial results $(m_a, s_a)$ and $(m_b, s_b)$ combine?

## Further reading

- Milakov & Gimelshein, *Online normalizer calculation for softmax* (2018)
- Dao et al., [FlashAttention](https://arxiv.org/abs/2205.14135)
