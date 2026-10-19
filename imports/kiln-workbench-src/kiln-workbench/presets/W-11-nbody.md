# N-body forces

Not every GPU kernel is a neural-network layer. This project computes the gravitational pull of every particle on every other particle — an $O(n^2)$ all-pairs interaction — written with plain broadcasting. The compiler finds the reductions, maps the pairwise distances to a tiled kernel, and refuses one tempting fusion.

> **Try it** — [measure](lab:measure) at 512 particles, then at [2048](lab:param?name=particles&value=2048&measure) and [8192](lab:param?name=particles&value=8192&measure). Watch which bound the kernels hit. [Back to 512](lab:param?name=particles&value=512).

## The maths

With unit masses and $G = 1$, particle $i$ accelerates towards every other particle $j$:

$$a_i = \sum_j \frac{p_j - p_i}{\big(\lVert p_j - p_i \rVert^2 + \varepsilon\big)^{3/2}}$$

The **softening** $\varepsilon$ keeps the force finite when two particles nearly coincide, and makes the $j = i$ term zero instead of $0/0$. Because the pair force is antisymmetric ($F_{ij} = -F_{ji}$), the total $\sum_i a_i$ is zero up to rounding: Newton's third law, which the project's check tests.

The program builds the pairwise differences by broadcasting: `reshape(p, [1, n, 3]) − reshape(p, [n, 1, 3])` is an $n \times n \times 3$ tensor that is never stored. Views compose into index maps, so `d[i, j, c]` is just `p[j, c] − p[i, c]` inside a loop.

**Work.** About 20 flops per pair: $20n^2$ in all. Bytes: the positions, $12n$. The intensity grows linearly with $n$, so all-pairs kernels are classic compute-bound workloads, *if* the positions are reused from on-chip memory.

## What the compiler makes

Two kernels (simulated RTX 5090):

| particles | `k_ew_reduce_reduce`: $r^2_{ij}$ | `k_ew_reduce_reduce_2`: $a_i$ | total |
|---:|---|---|---:|
| 512 | 3.3 µs, tiled, launch-bound | 5.1 µs, row per (particle, coordinate) | 8.4 µs |
| 2048 | 17.5 µs, L2-bound | 41.0 µs, L2-bound | 58.4 µs |
| 8192 | 376 µs, DRAM-bound | 1093 µs, DRAM-bound | 1469 µs |

1. **The squared distances** $r^2_{ij} = \sum_c (p_{jc} - p_{ic})^2$ form an $n \times n$ matrix with a reduction over 3 coordinates. The tile pass recognizes the shape of a contraction (output $(i, j)$, reduction over $c$) and offers shared-memory tiles.
2. **The accelerations** $a_{ic} = \sum_j d_{ijc} \cdot (r^2_{ij} + \varepsilon)^{-3/2}$: a row reduction over $j$ for each output $(i, c)$.

**The declined fusion.** Inlining $r^2$ into the second kernel would avoid writing and re-reading the $n \times n$ matrix. But the second kernel reads each $r^2_{ij}$ three times (once per coordinate $c$), so fusing would compute every distance and every `pow` three times. The guard declines: *fused work 48,777,216 > unfused 40,912,896* (see *Declined* in [Trace](lab:view?name=trace)). At $n = 8192$ that decision costs dearly: the $r^2$ matrix is 256 MiB and goes through DRAM twice, which is why both kernels end up DRAM-bound.

## How it should be done

The classic GPU n-body kernel (*GPU Gems 3*, chapter 31) tiles over $j$: each block loads a tile of positions into shared memory, and each thread accumulates the force on its own particle from all of them. Nothing of size $n^2$ is stored; each position is read from DRAM $n/\text{tile}$ times; the kernel runs near peak FLOP/s. Here that would need a reduction whose output has 3 components per thread — a vector-valued reducer, the same extension as online softmax (W-06) and Welford (W-22).

> **Note** — the tile pass only offers `MAP=tiled` when every value the reduction loop reads is either a tile operand or computed inside the loop. A hoisted value like $p_i$ inside $\sum_j (p_j - p_i)\,w_{ij}$ would have no home in a tiled kernel. That legality rule was added after this very program broke the tiled materializer at 2048 particles.

## Exercises

1. Compute the arithmetic intensity of the ideal (tiled-over-$j$) kernel at $n = 8192$ and place it on the RTX 5090's roofline (W-18).
2. Rewrite the program so the second kernel reads $r^2$ once: compute the scalar weight $w_{ij} = (r^2_{ij} + \varepsilon)^{-3/2}$ as its own output first. Does the fusion guard now accept a different partition?
3. The check accepts a net force below $10^{-3} \cdot \max_i |a_i| \cdot \sqrt{3n}$. Why scale the tolerance with the largest force, and why with $\sqrt{n}$ rather than $n$? (Hint: rounding errors of a sum behave like a random walk.)

## Further reading

- Nyland, Harris, Prins, *Fast N-Body Simulation with CUDA*, GPU Gems 3, chapter 31
- Barnes & Hut (1986): the $O(n \log n)$ tree algorithm that replaces all-pairs at large $n$
