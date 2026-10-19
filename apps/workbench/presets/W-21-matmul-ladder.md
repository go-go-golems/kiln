# The matmul ladder

Matrix multiplication is the workload GPUs are built for and the classic lesson in GPU optimization. This project compiles one $1024 \times 1024$ matmul five ways, plus whatever the cost model picks. Each step removes the bottleneck of the step before and reveals the next. The `step` parameter pins the schedule.

> **Try it** — measure each step in turn and keep [Perf](lab:view?name=perf) open:
> [1 naive](lab:param?name=step&value=1%20naive&measure) ·
> [2 shared-memory tiles](lab:param?name=step&value=2%20smem%20tiles&measure) ·
> [3 1-D register tiles](lab:param?name=step&value=3%201-D%20register%20tiles&measure) ·
> [4 2-D register tiles](lab:param?name=step&value=4%202-D%20register%20tiles&measure) ·
> [5 8×8 tiles](lab:param?name=step&value=5%208x8%20tiles&measure) ·
> [6 the cost model's pick](lab:param?name=step&value=6%20cost%20model&measure)

## The maths: plenty of reuse, if you can keep it

$C = AB$ with $A, B, C \in \mathbb{R}^{N \times N}$ costs

$$W = 2N^3 \text{ flop}, \qquad Q_\text{min} = 3 \cdot 4N^2 \text{ bytes}, \qquad I_\text{max} = \frac{2N^3}{12N^2} = \frac{N}{6}$$

At $N = 1024$ the best possible intensity is 171 flop/byte, about three times the RTX 5090's ridge point (58.5). In principle matmul is compute-bound. In practice every element of $A$ is used $N$ times, and **the schedule decides how many of those uses reach the chip from far away** (DRAM or L2) versus nearby (shared memory or a register). Each rung of the ladder moves reuse one level closer to the arithmetic units:

| level | where a value lives | approximate bandwidth on an RTX 5090 |
|---|---|---|
| DRAM | off-chip GDDR7 | 1.8 TB/s |
| L2 | on-chip, shared by all SMs | ~5 TB/s (the simulator assumes 3× DRAM) |
| shared memory | per SM, 32 banks × 4 B per clock | 170 SMs × 128 B × 2.41 GHz ≈ 52 TB/s |
| registers | per thread | operands of every instruction, every clock |

## What you should see

Simulated RTX 5090, $N = 1024$ ($W$ = 2.15 GFLOP):

| step | schedule | time | TFLOP/s | bound | L2 traffic | smem wavefronts | occupancy |
|---|---|---:|---:|---|---:|---:|---:|
| 1 naive | thread per output | 1087 µs | 2.0 | l2 | 5.0 GiB | — | 1.00 |
| 2 smem tiles | 32×32×32 tiles | 199 µs | 10.8 | smem | 260 MiB | 69.2 M | 0.67 |
| 3 1-D register tiles | 64×64, 8×1 per thread | 128 µs | 16.7 | smem | 132 MiB | 38.8 M | 1.00 |
| 4 2-D register tiles | 128×128, 8×2 per thread | 169 µs | 12.7 | smem | 72 MiB | 25.7 M | 0.67 |
| 5 8×8 tiles | 128×128, 8×8 per thread | 336 µs | 6.4 | smem | 96 MiB | 25.7 M | 0.33 (regs) |
| 6 cost model | 16×32, 2×4 per thread, 64 threads | **99 µs** | 21.7 | smem | 400 MiB | 36.7 M | 1.00 (0.54) |

At $N = 2048$ ([try it](lab:param?name=n&value=2048)), steps 1–5 take 8141, 1405, 925, **669** and 891 µs. Step 4 is slower than step 3 at $N = 1024$ but faster at $N = 2048$; the next sections explain why. At both sizes the cost model's own pick beats every rung of the ladder: the last section explains that too.

### Step 1 → 2: from L2 to shared memory

Naive: thread $(i, j)$ loops over $k$, loading $A_{ik}$ and $B_{kj}$ from global memory.

- The 32 threads of a warp share $i$, so the $A_{ik}$ load is one broadcast sector.
- They have consecutive $j$, so $B_{kj..k(j+31)}$ is 128 contiguous bytes: 4 sectors.

That is 5 sectors for 2 loads, the **2.5 sectors per request** in [Perf](lab:view?name=perf), and

$$Q_\text{L2} = \underbrace{\tfrac{N^2}{32}}_{\text{warps}} \cdot N \cdot 5 \cdot 32\,\text{B} = 5.4\text{ GB} = 5.0\text{ GiB}$$

At the simulated L2 bandwidth, that is about 1 ms. Nothing is reused on-chip.

Tiling: a block computes a $B_M \times B_N$ tile of $C$. For each slab of $B_K$ along $k$, the block cooperatively copies an $A$ tile and a $B$ tile into shared memory, synchronizes, then computes from there. Each global value now serves a whole tile, so $A$ is fetched $N/B_N$ times and $B$ is fetched $N/B_M$ times:

$$Q_\text{L2} = 4N^2\left(\frac{N}{B_N} + \frac{N}{B_M}\right) = 4 \cdot 1024^2 \cdot (32 + 32) = 268\text{ MB}$$

That is 20× less. The bottleneck moves to **shared-memory bandwidth**. Every FMA still reads 2 operands from shared memory, and a warp-wide read is one "wavefront" per clock per SM: $N^3 \cdot 2 / 32 \approx 67$ M wavefronts, plus the tile stores, makes 69 M.

### Step 2 → 3: from shared memory to registers (1-D)

Give each thread $T_M = 8$ outputs in a column. For each $k$ it loads 8 values of $A$ and **one** value of $B$, reusing that $B$ value from a register 8 times. Per warp and per $k$:

- 8 broadcast $A$ reads plus 1 $B$ read = 9 wavefronts for $32 \times 8 = 256$ FMAs, 0.035 wavefronts per FMA;
- step 2 needed 2 wavefronts for 32 FMAs, 0.0625 per FMA.

The ratio, 0.56, is exactly the drop in the smem column: 69.2 M → 38.8 M.

### Step 3 → 4: 2-D register tiles — and wave quantization

With an $8 \times 2$ register tile, each $k$ step is 8 $A$ + 2 $B$ loads for 16 FMAs, and shared-memory traffic drops again (25.7 M). **But the time goes up.** Tiles of $128 \times 128$ cut a $1024 \times 1024$ matrix into only

$$\frac{1024}{128} \cdot \frac{1024}{128} = 64 \text{ blocks}$$

on a GPU with 170 SMs: **106 SMs sit idle**. That is wave quantization — the grid doesn't fill the machine. At $N = 2048$ there are 256 blocks and step 4 beats step 3.

$$\text{waves} = \left\lceil \frac{\text{blocks}}{\text{SMs} \times \text{blocks per SM}} \right\rceil, \qquad \text{SM use in the last wave} = \frac{\text{blocks left}}{\text{SMs}}$$

### Step 4 → 5: more reuse on paper, slower in practice

An $8 \times 8$ register tile has the best reuse ratio on paper, (8 + 8) loads per 64 FMAs. It loses for two reasons.

- **Bank conflicts.** Thread $t$ reads $B$ at shared address $k \cdot B_N + 8t$. Shared memory has 32 banks, 4 bytes wide, so addresses $0, 8, 16, \dots$ fall in only 4 banks: a **4-way bank conflict**, 4 wavefronts per read. The bank-conflict column in Perf shows 1.88 extra wavefronts per request.
- **Registers.** 64 accumulators plus operands is about 104 registers per thread. $65{,}536 / (104 \cdot 256)$ = 2 blocks per SM: 33% occupancy, limited by registers.

Production kernels fix both with vectorized `float4` loads, swizzled or transposed shared-memory layouts, and *warp tiling*. Those transformations are the next rungs this compiler does not have yet.

### Step 6: the cost model's pick wins by balance, not reuse

The cost model searches all 645 legal tile shapes and picks **16×32 tiles with a 2×4 register tile per thread**: 64 threads per block, 2048 blocks. Its shared-memory traffic is about the same as step 3's (36.7 M vs 38.8 M wavefronts), yet it runs in 99 µs instead of 128. The difference is **load balance**.

- Step 3 launches 256 blocks on 170 SMs. 86 SMs get two blocks and 84 get one, so the kernel lasts as long as two blocks while the average SM does $256/170 = 1.51$ blocks' work. A quarter of the machine idles for the second half.
- Step 6 launches 2048 small blocks. The busiest SM runs $\lceil 2048/170 \rceil = 13$, against an average of 12.05: 7% idle.

$$t \approx \frac{\text{wavefronts}}{\text{SMs} \cdot f} \cdot \frac{\text{blocks on the busiest SM}}{\text{average blocks per SM}} + t_\text{launch}: \quad \frac{38.8\text{M}}{410\text{G/s}} \cdot \frac{2}{1.51} + 2.5 = 128\ \mu s, \qquad \frac{36.7\text{M}}{410\text{G/s}} \cdot \frac{13}{12.05} + 2.5 = 99\ \mu s$$

At $N = 2048$ the pick changes to 32×64 tiles with 8×4 per thread (566 µs, 30.4 TFLOP/s, vs 669 for step 4), and on the A100 at $N = 1024$ it is again 16×32 with 2×4 (244 µs, vs 287 for step 4). Hand-written ladders choose tiles for reuse; a search over tile shapes also sees the grid. Many small blocks are the cheap fix for tail effects; production libraries use *split-K* or *stream-K* to the same end.

## Where this leaves us

The best schedule here reaches 21.7 TFLOP/s, 21% of the RTX 5090's 104.8 TFLOP/s FP32 peak, and it is limited by shared memory. Simon Boehm's post climbs the same ladder further: vectorized shared-memory loads, warp tiling, autotuned tile shapes. He ends close to cuBLAS. Beyond that, tensor cores change the arithmetic itself.

Same ladder, [A100](lab:device?id=sim:a100&measure), $N = 1024$: 883, 482, 325, **287**, 653 µs. With 108 SMs, the 64-block grid of step 4 hurts less than on the 5090.

## The system

- The `step` parameter is read by a custom **decide policy**, `ladder`. It scores the option that matches the step at 0 and every other option at Infinity, and sits in front of the standard chain (pins → evidence → cost model). Step 6 returns `null` for every option, so the standard chain decides. See the script, and `by: ladder` in [Knobs](lab:view?name=knobs).
- The kernel bodies are in [Kernels](lab:view?name=kernels): the `Tile` tab shows the schedule, `Kernel IR` the shared-memory staging and register tile, `CUDA` the code.
- The simulator counts every shared-memory request per warp exactly as the hardware does: the most distinct addresses in any one bank. The cost model computes the same count analytically from the same addresses.

## Exercises

1. Compute $Q_\text{L2}$ for step 3 from the formula and compare with the 132 MiB measured.
2. Why is the naive kernel's $A$ load a broadcast? Rewrite the program as $C = (B^\top A^\top)^\top$ and see whether the naive version gets worse.
3. Add a padding knob to the tiled materializer (`kernel.js`, `matTiled`): store $B$ with a stride of $B_N + 1$. Does step 5's conflict disappear?
4. Tune with [SP-MCTS](lab:tune?strategy=spmcts&budget=32) and compare its best schedule with the cost model's.

## Further reading

- Simon Boehm, [How to Optimize a CUDA Matmul Kernel for cuBLAS-like Performance](https://siboehm.com/articles/22/CUDA-MMM)
- Hwu, Kirk, El Hajj, *Programming Massively Parallel Processors*, the chapters on tiling and memory
- [CUTLASS](https://docs.nvidia.com/cutlass/) and [CuTe](https://docs.nvidia.com/cutlass/latest/media/docs/cpp/cute/index.html): how production kernels lay out tiles
- [MIT 6.S894, Accelerated Computing](https://accelerated-computing.academy/fall25/): the matmul labs
