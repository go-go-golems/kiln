# Fusion: why the compiler fuses

The elementwise tail of a transformer block — add a bias, apply GELU, scale, add the residual — does almost no arithmetic. Its cost is entirely **bytes**. Fusion turns eleven passes over memory into one. This project has a `fuse` switch so you can measure the difference.

> **Try it** — [measure fused](lab:measure), then [turn fusion off](lab:param?name=fuse&value=false&measure) and compare in [Perf](lab:view?name=perf). [Turn it back on](lab:param?name=fuse&value=true) when you're done.

## The program

$$y = r + s \cdot \operatorname{GELU}(x + b), \qquad \operatorname{GELU}(u) = \tfrac12\,u\,\Big(1 + \tanh\!\big(\sqrt{2/\pi}\,(u + 0.044715\,u^3)\big)\Big)$$

$x$ and $r$ are `tokens × hidden` (4096 × 1024 by default); $b$ is a `hidden` vector broadcast over the rows; $s = 0.5$.

The `frontend/decomposition` pass rewrites `GELU` into its primitive operations. Together with the bias add, the scale and the residual add, that is about a dozen elementwise operations; see the [tensor IR](lab:ir?name=tensor).

## The maths: counting bytes

Let $n$ = tokens × hidden = 4,194,304 elements, 4 bytes each, so one tensor is $4n$ bytes = 16 MiB.

**Unfused**, every operation is its own kernel. Each one reads its inputs from DRAM and writes its result back:

$$Q_\text{unfused} = \sum_{k \in \text{kernels}} 4n\,\big(\text{inputs}_k + 1\big)$$

**Fused**, there is one kernel. It reads $x$ and $r$, reads $b$ once per row (4 KiB, which stays in cache), and writes $y$:

$$Q_\text{fused} \approx 3 \cdot 4n = 12n \text{ bytes} = 48\text{ MiB}$$

Every intermediate lives in a register for a few cycles and never touches memory.

Both versions do the same arithmetic, about 19 flop per element, so the intensity is $19/12 \approx 1.6$ flop/byte fused and roughly ten times lower unfused. That is far below the ridge point of any GPU (W-18), so

$$t \approx \frac{Q}{\beta} + K \cdot t_\text{launch}$$

where $K$ is the number of kernels.

## What you should see

Simulated, RTX 5090 ($\beta$ = 1792 GB/s, $t_\text{launch}$ = 2.5 µs):

| | kernels | DRAM traffic | predicted $Q/\beta + K t_\text{launch}$ | simulated |
|---|---:|---:|---:|---:|
| fused | 1 | 48 MiB | 28.1 + 2.5 = 30.6 µs | 30.9 µs |
| unfused | 11 | 416 MiB | 243 + 27.5 = 271 µs | 273.8 µs |

That is a **8.9× speedup from moving fewer bytes**, with the same arithmetic. The unfused version even pays 16 MiB to materialize the bias broadcast: `k_ew` writes a full `tokens × hidden` copy of $b$, because without fusion a broadcast view becomes a real tensor.

Look at the unfused [loop IR](lab:ir?name=loop): eleven `loop.kernel` nodes, each a one-line loop nest. Fused, there is one kernel whose body is the whole expression; the [Graph](lab:graph?name=loop) shows the difference at a glance.

## The system: how this compiler fuses

1. **Lift.** `loop/lowering` turns each tensor op into a `loop.kernel`: an expression over output coordinates, with loads from its inputs.
2. **Fuse.** `loop/fusion` repeatedly inlines a producer kernel's expression into its consumer, so the consumer recomputes the producer's value where it used to load it. The pass scans **consumers first** (`order("reverse")`).
3. **Guard.** Inlining duplicates the producer's work at every use. A guard compares the work before and after, where a memory access costs 12 work units, and declines when the work would blow up. That is why the matmuls in W-09 stay separate.
4. **Switch.** This project wraps the standard rule: `maybeMerge` uses the same pattern and the same guards, but calls `skip("fusion is switched off")` when `fuse` is false. Turn on *Declined* in [Trace](lab:view?name=trace) to see it decline 10 times.

Reductions fuse too. A reduction's consumers are inlined, and loop-invariant code motion places each value at the deepest loop it depends on. That is how RMSNorm (W-05) and softmax (W-06) become one kernel each.

## When fusion is the wrong call

- **Recomputation.** Inlining a matmul into another matmul recomputes it per output element. The guard declines it (W-09).
- **Register pressure.** A fused kernel holds more live values per thread. Past the register budget, occupancy drops (W-23) or values spill to local memory.
- **Different parallel shapes.** A row reduction feeding an elementwise op over a different axis may need different thread mappings; forcing them into one kernel can serialize work.

## Takeaways

1. For memory-bound ops, **time ≈ bytes / bandwidth**. Count the bytes and you can predict the speedup before running anything.
2. Fusion is the single biggest optimization for the "glue" of neural networks: norms, activations, residuals, dropout, bias. This is the core of what `torch.compile`, XLA and TVM do.
3. Launch overhead adds up: 11 kernels cost 27.5 µs before moving a byte.

## Exercises

1. Predict, then measure: what does the unfused version cost at `hidden = 256`? Which term dominates now?
2. Add dropout-style masking, `N.mul(y, N.gt(x, 0))`, to the program. How many extra bytes does it cost fused? Unfused?
3. Write a rule that fuses only elementwise producers, never reductions. Is anything in this program affected?

## Further reading

- Horace He, [Making Deep Learning Go Brrrr](https://horace.io/brrr_intro.html), the section on operator fusion
- [MLC course](https://mlc.ai/summer22/), the lectures on graph-level optimization
- TVM, [*An Automated End-to-End Optimizing Compiler for Deep Learning*](https://arxiv.org/abs/1802.04799), section 3 on operator fusion
