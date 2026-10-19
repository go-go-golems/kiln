# Variance three ways: speed vs. numerics

LayerNorm, BatchNorm and RMSNorm all compute a variance per row, on every layer, for every token. A tempting "optimization" computes it in one pass over the data instead of two. On a GPU in fp32, that formula can return garbage. This project computes the same statistic three ways side by side, so you can watch it happen.

> **Try it** — [measure at offset 0](lab:measure): all three kernels pass. Then [offset 100](lab:param?name=offset&value=100&measure), [offset 1000](lab:param?name=offset&value=1000&measure) and [offset 10000](lab:param?name=offset&value=10000&measure), and read the checks in [Perf](lab:view?name=perf). [Reset to 0](lab:param?name=offset&value=0).

## The program

Inputs $x_{ij}$ are uniform on $[-1, 1)$, so the true variance of every row is $\sigma^2 = 1/3$. The program adds an offset $c$ to every input — the mean moves, the spread stays — and returns three per-row variances:

| output | formula | sweeps over the row |
|---|---|---|
| `two_pass` | $\mu = \frac1D\sum_j x_j$, then $\frac1D\sum_j (x_j - \mu)^2$ | 2 |
| `one_pass` | $\frac1D\sum_j x_j^2 \;-\; \mu^2$ | 1 |
| `shifted` | $K = x_0$, then $\frac1D\sum_j (x_j - K)^2 - \big(\frac1D\sum_j (x_j-K)\big)^2$ | 1 |

All three are algebraically identical:

$$\operatorname{Var}(x) = \mathbb{E}\big[(x-\mu)^2\big] = \mathbb{E}[x^2] - \mu^2 = \mathbb{E}\big[(x-K)^2\big] - \big(\mathbb{E}[x-K]\big)^2 \quad\text{for any } K$$

Each method computes its own means, so each output is one self-contained kernel: `k_two_pass`, `k_one_pass` and `k_shifted` in [Kernels](lab:view?name=kernels).

## The maths: catastrophic cancellation

fp32 stores 24 significant bits. Every operation's result is exact up to a relative error of the **unit roundoff** $u = 2^{-24} \approx 5.96 \times 10^{-8}$.

The one-pass formula subtracts two large, nearly equal numbers: $\mathbb{E}[x^2] \approx c^2 + \sigma^2$ and $\mu^2 \approx c^2$. Each carries an absolute rounding error of about $u \cdot c^2$, and the subtraction keeps the errors while cancelling the true values. The relative error of the result is roughly

$$\frac{|\widehat{\operatorname{Var}} - \operatorname{Var}|}{\operatorname{Var}} \;\approx\; u \cdot \frac{c^2 + \sigma^2}{\sigma^2} \cdot g(D)$$

where $g(D)$ is a modest growth factor from accumulating $D$ terms (about $\log_2 D$ for a tree reduction). The ratio $c^2/\sigma^2$ is the **condition number** of this way of computing the variance. With $\sigma^2 = 1/3$:

| offset $c$ | $c^2/\sigma^2$ | predicted relative error | simulated max error of `one_pass` (absolute) |
|---:|---:|---:|---:|
| 1 | 3 | $2 \times 10^{-7}$ | $9 \times 10^{-8}$ |
| 10 | 300 | $2 \times 10^{-5}$ | $8 \times 10^{-6}$ |
| 100 | $3 \times 10^4$ | $2 \times 10^{-3}$ | $1.4 \times 10^{-3}$ — **fails** |
| 1000 | $3 \times 10^6$ | 0.2 | 0.039 — fails |
| 10000 | $3 \times 10^8$ | 20 | 8.3 — the "variance" is meaningless |

The two-pass formula subtracts the mean *before* squaring. Its terms $(x_j - \mu)^2$ are small, nothing large cancels, and its error stays near $u$ for every offset (simulated $\le 2 \times 10^{-5}$ even at $c = 10^4$). The shifted formula gets the same protection with one pass: subtracting any value $K$ close to the data makes $x - K$ small, and $K = x_0$ is close.

## What you should see

All three kernels take **7.9 µs**, with or without numerical trouble. The input is 8 MiB per call and every version is memory-bound. The "extra" sweep of the two-pass method re-reads a row that one thread block touched microseconds earlier, so it hits cache.

The one-pass formula buys nothing in speed and costs everything in accuracy. That is the lesson: **check whether an optimization changes the numerics, and measure whether it changes the speed.**

## The system: how the failure is caught

- The simulated GPU computes in **fp32**: every register is a `Float32Array` element, and every sum is a tree of fp32 adds, as on a real GPU. The reference (`compilePoint`, the Loop IR evaluated in JavaScript) accumulates in **fp64**. Each measurement compares the kernel's sampled outputs against that reference with relative tolerance $2 \times 10^{-3}$, which is how `k_one_pass` fails while the others pass.
- The end-to-end check in [Code](lab:view?name=code) fails too at large offsets. There the frontend reference, which rounds every op's result to fp32, disagrees with the Loop IR, which keeps intermediates in fp64 inside a kernel. Two implementations of an ill-conditioned formula disagree with each other — a symptom worth recognizing.
- Per-kernel checks use synthetic inputs, uniform on $[-1, 1)$. They catch this bug only because the offset is added *inside* the kernel. If the offset came from upstream data, the test inputs would miss it. **Test with realistic magnitudes.**

## Welford, and why this compiler can't express it (yet)

Welford's algorithm updates a running mean and sum of squared deviations one element at a time:

$$\mu_k = \mu_{k-1} + \frac{x_k - \mu_{k-1}}{k}, \qquad M_k = M_{k-1} + (x_k - \mu_{k-1})(x_k - \mu_k)$$

Two partial results $(n_a, \mu_a, M_a)$ and $(n_b, \mu_b, M_b)$ merge exactly (Chan, Golub and LeVeque), with $\delta = \mu_b - \mu_a$ and $n = n_a + n_b$:

$$\mu = \mu_a + \delta\,\frac{n_b}{n}, \qquad M = M_a + M_b + \delta^2\,\frac{n_a n_b}{n}$$

The merge is associative, so it fits a GPU tree reduction: one pass, numerically stable. This compiler's reductions only combine with `add`, `max`, `min` and `mul`. Adding a reducer over a *tuple* $(n, \mu, M)$ is the same extension online softmax and FlashAttention need.

## Takeaways

1. Algebraic identities are not numerical identities. $\mathbb{E}[x^2] - \mu^2$ loses about $\log_2(c^2/\sigma^2)$ bits.
2. On a GPU, a second sweep over a row in cache or shared memory is cheap. Don't trade accuracy for it without measuring.
3. Kernel tests need inputs with realistic magnitudes and offsets, not just values on $[-1, 1)$.

## Exercises

1. At which offset does `one_pass` lose all significant digits? Predict with $\log_2(c^2/\sigma^2) \ge 24$, then check.
2. Change `K` to the row's maximum instead of its first element. Is `shifted` still stable? Why does any sample of the row work?
3. Add a pairwise (tree) summation variant of `one_pass` in fp32 by hand. Does it help? (Hint: the cancellation is in the final subtraction, not the sum.)

## Further reading

- Higham, *Accuracy and Stability of Numerical Algorithms*, the chapters on summation and on computing the variance
- Welford (1962), *Note on a method for calculating corrected sums of squares and products*; Chan, Golub, LeVeque (1983), *Algorithms for computing the sample variance*
- Goldberg, *What Every Computer Scientist Should Know About Floating-Point Arithmetic*
