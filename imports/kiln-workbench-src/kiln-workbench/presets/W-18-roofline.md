# The roofline: three regimes

Every kernel is limited by one of three things: **arithmetic** (compute-bound), **moving bytes** (memory-bound), or **fixed overhead** (launch-bound). This project is one elementwise kernel with two sliders. Moving them carries the kernel through all three regimes, and the roofline model predicts where it ends up.

> **Try it** — [measure now](lab:measure), then [degree 256](lab:param?name=degree&value=256&measure) for compute-bound and [4096 elements](lab:param?name=elements&value=4096&measure) for launch-bound. [Reset](lab:param?name=elements&value=4194304) before the next section.

## The program

For every element $x_i$ the kernel evaluates a polynomial of degree $d$ in Horner form:

$$y_i = \Big(\big((c_d\,x_i + c_{d-1})\,x_i + c_{d-2}\big)\,x_i + \dots\Big)\,x_i + c_0$$

Each Horner step is one multiply and one add, which the `frontend/optimization` pass contracts into one **fused multiply-add** (`fma`, the `contract_fma` rule — see it in [Trace](lab:view?name=trace)). An FMA counts as 2 floating-point operations but issues as 1 instruction. So per element:

| quantity | per element | for $n$ elements |
|---|---|---|
| work $W$ | $2d$ flop | $2dn$ |
| DRAM traffic $Q$ | 4 B read + 4 B write | $8n$ bytes |
| arithmetic intensity $I = W/Q$ | | $d/4$ flop/byte |

The degree changes the work but not the bytes. **Intensity is the x-axis of the roofline**, and the degree slider walks along it.

## The maths: the roofline

A GPU has a peak arithmetic rate $\pi$ (flop/s) and a peak memory bandwidth $\beta$ (bytes/s). A kernel with intensity $I$ cannot go faster than either:

$$P(I) \;=\; \min\big(\pi,\; \beta \cdot I\big)$$

The two lines meet at the **ridge point** $I^* = \pi/\beta$. Below it, more arithmetic per byte is free: the memory system is the bottleneck. Above it, every extra flop costs time.

Turned around, the best possible time of a kernel is

$$t \;\ge\; t_\text{launch} + \max\!\left(\frac{Q}{\beta},\; \frac{W}{\pi}\right)$$

and the term that wins names the regime. For this kernel the crossover degree is $d^* = 4 I^*$:

| GPU (simulated, FP32) | $\pi$ | $\beta$ | ridge $I^*$ | crossover degree $d^*$ |
|---|---:|---:|---:|---:|
| RTX 5090 | 104.8 TFLOP/s | 1792 GB/s | 58.5 | 234 |
| RTX 4090 | 82.6 | 1008 | 81.9 | 328 |
| H100 SXM | 67 | 3350 | 20.0 | 80 |
| A100 80GB | 19.5 | 2039 | 9.6 | 38 |
| Orin Nano class | 1.28 | 68 | 18.8 | 75 |

FP32 throughput counts the CUDA cores only. Tensor cores, which this compiler does not use, move $\pi$ up by 10× or more on the datacenter parts. That is why "memory-bound" is the normal state of affairs for everything except big matmuls.

### Worked example: 4,194,304 elements on the RTX 5090

- $Q = 8 \times 4{,}194{,}304 = 33.6$ MB, so $Q/\beta = 33.6\text{ MB} / 1792\text{ GB/s} = 18.7\ \mu s$.
- At $d = 8$: $W = 67$ Mflop, $W/\pi = 0.64\ \mu s$. Memory wins by 30×.
- At $d = 256$: $W = 2.15$ Gflop, $W/\pi = 20.5\ \mu s$. Now compute wins, narrowly.
- Add the launch overhead the simulator assumes, $t_\text{launch} = 2.5\ \mu s$: the bound is about $21.2\ \mu s$ at low degree and $23\ \mu s$ at $d = 256$.

## What you should see

Simulated, 4,194,304 elements:

| degree | intensity | RTX 5090 | A100 | H100 |
|---:|---:|---|---|---|
| 1 | 0.25 | 21.4 µs, dram | 19.0 µs, dram | 12.5 µs, dram |
| 8 | 2 | 21.4 µs, dram | 19.0 µs, dram | 12.5 µs, dram |
| 32 | 8 | 21.4 µs, dram | 19.0 µs, dram | 12.5 µs, dram |
| 64 | 16 | 21.7 µs, dram | **30.1 µs, compute** | 12.6 µs, dram |
| 128 | 32 | 21.4 µs, dram | 57.6 µs, compute | **19.1 µs, issue** |
| 256 | 64 | **23.2 µs, issue** | 113.2 µs, compute | 35.3 µs, issue |

From degree 1 to 32 the time does not move at all: 32× more arithmetic for free. That flat line is the memory roof. Each GPU leaves it near its own $d^*$: the A100 first (its FP32 peak is low next to its HBM bandwidth), then the H100, and the 5090 only at the top of the slider.

"issue" means the scheduler's instruction rate. One FMA is one instruction, so issue-bound and compute-bound are the same wall here; the few load, store and index instructions on top tip it over.

Now the size, at degree 8 on the RTX 5090:

| elements | time | bound | achieved bandwidth |
|---:|---:|---|---:|
| 1,024 | 2.7 µs | launch | 3 GB/s |
| 16,384 | 2.8 µs | launch | 47 GB/s |
| 262,144 | 3.8 µs | dram | 557 GB/s |
| 1,048,576 | 7.3 µs | dram | 1142 GB/s |
| 16,777,216 | 77.6 µs | dram | 1729 GB/s |

Below a few hundred thousand elements the kernel is **overhead-bound**. The GPU finishes the work in nanoseconds and the 2.5 µs launch is the whole bill. Achieved bandwidth only approaches the peak once the transfer is long enough to amortize it.

## The system: where these numbers come from

- **Compile.** `N.add(N.mul(y, x), c)` → the `nn` dialect → decomposition into `tensor.ew` ops → `contract_fma` → lifted into one `loop.kernel` by fusion. See the [loop IR](lab:ir?name=loop): one load of `x`, $d$ FMAs, one store.
- **Schedule.** The tile pass forks over thread-per-element schedules (`TPB`, `COARSEN`). The cost model ranks them; see [Knobs](lab:view?name=knobs).
- **Measure.** The simulated GPU executes sampled blocks of the generated kernel lockstep, warp by warp. It counts flops, warp instructions and DRAM sectors, then converts the counts to time with the roofline-plus-occupancy model above. The roofline in [Perf](lab:view?name=perf) plots the point.

> **Caveat** — The simulator turns counts into time with a model, so these are not hardware numbers. Real GPUs add caches, clocks that boost and throttle, and launch overheads that vary. The shape — flat, then rising; a floor at small sizes — is what transfers. Try [WebGPU](lab:device?id=webgpu&measure) on your own GPU.

## Takeaways

1. Compute the intensity before optimizing. If $I \ll I^*$, cutting flops does nothing; only cutting bytes helps.
2. Elementwise ops have $I < 1$: they are always memory-bound, which is why **fusion** (next: W-19) is the main optimization for them.
3. Small kernels are overhead-bound: batch them, fuse them, or capture them in a CUDA graph.

## Exercises

1. Make the polynomial read a second input (a per-element coefficient tensor). What happens to $Q$, $I$ and $d^*$?
2. Switch to the [A100](lab:device?id=sim:a100&measure) and find the smallest degree at which the bound changes. Compare with $d^* = 38$.
3. Pin `COARSEN=4` in Knobs at 16M elements: does processing 4 elements per thread change anything for a memory-bound kernel? Why not?

## Further reading

- Williams, Waterman, Patterson, *Roofline: An Insightful Visual Performance Model* (CACM 2009)
- Horace He, [Making Deep Learning Go Brrrr From First Principles](https://horace.io/brrr_intro.html): compute, memory, overhead
- [Modal GPU Glossary](https://modal.com/gpu-glossary): arithmetic intensity, memory-bound, ridge point
