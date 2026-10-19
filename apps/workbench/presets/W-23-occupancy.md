# Occupancy and latency hiding

A DRAM read takes several hundred nanoseconds. A GPU doesn't wait for it: each SM keeps many warps resident and switches to another one whenever a warp stalls. **Occupancy** — how many warps an SM can hold at once — sets how much latency it can hide. This project is a softmax over long rows (2048 × 8192). Two schedule knobs change its occupancy over a 16× range.

> **Try it** — pin a schedule, measure, and read *occupancy* and *limiter* in [Perf](lab:view?name=perf):
> [32 threads](lab:pin?MAP=row&TPB=32&STAGE=none&measure) ·
> [64 threads](lab:pin?MAP=row&TPB=64&STAGE=none&measure) ·
> [1024 threads](lab:pin?MAP=row&TPB=1024&STAGE=none&measure) ·
> [32 threads + row staged in shared memory](lab:pin?MAP=row&TPB=32&STAGE=reused&measure) ·
> [256 + staged](lab:pin?MAP=row&TPB=256&STAGE=reused&measure) ·
> [1024 + staged](lab:pin?MAP=row&TPB=1024&STAGE=reused&measure) ·
> [unpin](lab:unpin)

## The maths: four budgets per SM

A block can only run on an SM that has room for **all** of its threads, registers and shared memory. The number of blocks resident per SM is the tightest of four limits:

$$b \;=\; \min\left( b_\text{max},\; \left\lfloor \frac{T_\text{SM}}{T} \right\rfloor,\; \left\lfloor \frac{R_\text{SM}}{r \cdot T} \right\rfloor,\; \left\lfloor \frac{S_\text{SM}}{s} \right\rfloor \right), \qquad \text{occupancy} = \frac{b \cdot \lceil T/32 \rceil}{T_\text{SM}/32}$$

Here $T$ is threads per block, $r$ registers per thread and $s$ shared memory per block. For the simulated RTX 5090: $b_\text{max} = 24$ blocks, $T_\text{SM} = 1536$ threads (48 warps), $R_\text{SM} = 65{,}536$ registers, $S_\text{SM} = 128$ KiB.

### Worked examples

| schedule | threads | blocks | registers | shared mem | → blocks/SM | limiter | occupancy |
|---|---:|---:|---:|---:|---:|---|---:|
| TPB=32 | 1536/32 = 48 | 24 | 73 | 1024 | **24** | blocks | 24 warps / 48 = 0.50 |
| TPB=64 | 24 | 24 | 35 | 512 | 24 | blocks/threads | 48/48 = 1.00 |
| TPB=1024 | **1** | 24 | 1 | 32 | 1 | threads | 32/48 = 0.67 |
| TPB=32, row staged (32.9 KiB) | 48 | 24 | 73 | **3** | 3 | smem | 3/48 = 0.06 |
| TPB=1024, row staged (36.9 KiB) | **1** | 24 | 1 | 3 | 1 | threads | 0.67 |

That is the *theoretical* occupancy. The simulator also reports *achieved* occupancy, which depends on the grid. There are 2048 rows, so 2048 blocks over 170 SMs: about 12 blocks per SM in all. With TPB=32 they all fit in one wave, so each SM holds 13 one-warp blocks at most: 13/48 = 0.27, not 0.50.

## The maths: Little's law

How many warps does it take to keep DRAM busy? Bytes in flight must equal bandwidth × latency:

$$\text{bytes in flight} = \beta \times L \approx 1792\ \text{GB/s} \times 600\ \text{ns} \approx 1.08\ \text{MB}$$

Spread over 170 SMs, that is about 6.3 KB per SM. One warp-wide 4-byte load moves 128 bytes, so an SM needs about **49 loads in flight**: one from each of 48 warps at full occupancy, or 4 independent loads each from 12 warps. More warps and more independent work per thread (instruction-level parallelism) are interchangeable. Thread coarsening and vector loads buy latency hiding without occupancy.

The latency $L$ here is an assumed round figure: real DRAM latency under load is roughly 400–800 ns. The simulator encodes the idea with a crude curve: the fraction of peak bandwidth reachable is $\min(1, 0.2 + 1.6 \cdot \text{occupancy})$. Full bandwidth needs about 50% occupancy; at 6% you get 30%.

## What you should see

Simulated RTX 5090. Each row of 8192 floats is read three times: max, sum, normalize.

| TPB | staged | occupancy (achieved) | limiter | DRAM traffic | time |
|---:|---|---:|---|---:|---:|
| 32 | no | 0.50 (0.27) | blocks | 154 MiB | 155.6 µs |
| 64 | no | 1.00 (0.54) | blocks | 154 MiB | 99.5 µs |
| 1024 | no | 0.67 (0.67) | threads | 154 MiB | 99.5 µs |
| 32 | yes | 0.06 (0.05) | **smem** | 128 MiB | 277.8 µs |
| 256 | yes | 0.50 (0.43) | smem | 128 MiB | 90.4 µs |
| 1024 | yes | 0.67 (0.67) | threads | 128 MiB | **83.3 µs** |

Three lessons in one table:

- **Staging is a trade.** Keeping the row in shared memory removes two of its three DRAM reads (154 → 128 MiB, the minimum: 64 MiB in, 64 MiB out). But a 32 KiB row per block fits only 3 blocks in an SM's 128 KiB.
- **Small staged blocks starve the SM.** With 32 threads per staged block, 3 blocks are only 3 warps: occupancy 6%, bandwidth collapses, and staging makes things **3× slower**.
- **Big staged blocks get both.** With 1024 threads, one block per SM is already 32 warps (67%) — enough to hide latency — and it reads the row from DRAM once. The best schedule.

## The system

- The cost model computes occupancy per option from the launch configuration, the shared memory the staging needs, and a register estimate; [Knobs](lab:view?name=knobs) ranks every option.
- The timing model splits the grid into **waves** of `SMs × blocks per SM`. A partial last wave runs with fewer resident warps per SM, and so at lower achieved occupancy. That is how the simulator charges for grids that don't fill the GPU.
- Registers per thread come from a simple estimate, not a register allocator. Run the generated CUDA through `ptxas -v` (the Devices view explains the runner) to get the real count.

> **Caveat** — Real GPUs also have L1 caches that can absorb the re-reads of an unstaged row. They let you trade L1 against shared memory (the carveout), and their schedulers hide latency differently by architecture. Occupancy is necessary for bandwidth, not sufficient. The [occupancy calculator in Nsight Compute](https://docs.nvidia.com/nsight-compute/) computes the same four limits on real hardware.

## Takeaways

1. Occupancy = resident warps / maximum warps. It is limited by threads, blocks, registers or shared memory — whichever runs out first.
2. Memory-bound kernels need enough bytes in flight: high occupancy, or independent loads per thread.
3. Shared-memory staging saves DRAM traffic but spends occupancy. Size blocks so that both work.

## Exercises

1. Compute the occupancy of TPB=128 with the row staged. Predict its time from the table, then [measure it](lab:pin?MAP=row&TPB=128&STAGE=reused&measure).
2. Halve the row: [dim = 4096](lab:param?name=dim&value=4096). Staged blocks now take 16 KiB. How many fit per SM, and does TPB=32 staged recover?
3. Switch to the [H100](lab:device?id=sim:h100&measure) (228 KiB shared memory per SM, 2048 threads). Which limiter changes?

## Further reading

- *CUDA C++ Best Practices Guide*, [the occupancy section](https://docs.nvidia.com/cuda/cuda-c-best-practices-guide/)
- Vasily Volkov, *Better Performance at Lower Occupancy* (GTC 2010), on ILP versus occupancy
- Hwu, Kirk, El Hajj, *Programming Massively Parallel Processors*, the chapter on performance considerations
