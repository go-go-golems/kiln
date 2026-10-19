# GELU, pointwise

The simplest GPU kernel shape: every output element depends only on the same element of the inputs. One thread per element (or per few elements), no shared memory, no synchronization. The only question is how fast the bytes move.

> **Try it** — [measure](lab:measure), then compare thread-mapping options in [Knobs](lab:view?name=knobs): [64 threads per block](lab:pin?TPB=64&COARSEN=1&measure), [1024](lab:pin?TPB=1024&COARSEN=1&measure), [4 elements per thread](lab:pin?TPB=256&COARSEN=4&measure). [Unpin](lab:unpin).

## The maths

$$y = 0.5 \cdot \operatorname{GELU}(x + b), \qquad \operatorname{GELU}(u) = \tfrac12 u \Big(1 + \tanh\big(\sqrt{2/\pi}\,(u + 0.044715\,u^3)\big)\Big)$$

About 15 flop per element against 8 bytes (read $x$, write $y$; $b$ is one row, cached): roughly 2 flop/byte. That is well below every GPU's ridge point (W-18), so the kernel is memory-bound:

$$t \approx \frac{8 \cdot 8192 \cdot 2048\ \text{B}}{1792\ \text{GB/s}} + 2.5\ \mu s = 77.4\ \mu s \quad\text{(simulated: 77.6 µs)}$$

## The system: thread mapping

`MAP=thread` gives each thread `COARSEN` consecutive outputs; `TPB` threads form a block.

- **Coalescing.** Consecutive threads touch consecutive addresses, so a warp's 32 loads fall into 4 sectors of 32 bytes: perfect. *sectors / request* in Perf should read 4.0.
- **Coarsening.** More elements per thread mean fewer threads and more independent loads per thread: more instruction-level parallelism, less index arithmetic. For a memory-bound kernel the gain is small, because the bottleneck is DRAM.
- **Block size.** Small blocks hit the 24-blocks-per-SM limit before the 1536-threads limit (W-23); 64 threads per block or more reach full occupancy.

## Exercises

1. Why is coarsening by 4 not 4× faster? What would it take for coarsening to matter?
2. Change the scale to a learned per-column vector. How many bytes per element now?
3. Look at the generated WGSL in [Kernels](lab:view?name=kernels): how does it compute the global index when the grid has more than 65,535 blocks?
