# Your own cost model

The compiler chooses each kernel's schedule with a **decide policy**. This project swaps the standard analytic model for a tempting heuristic: *maximize occupancy*. On a matmul it picks one row per block with 64 threads, and runs 18× slower. A cost model must model the bottleneck, not a proxy for it.

> **Try it** — [measure](lab:measure) and read the info check in the [Code view](lab:view?name=code). Then pin the standard model's choice for the matmul, [`MAP=tiled` 128×128](lab:pin?MAP=tiled&BM=128&BN=128&BK=8&TM=8&TN=2&measure), and [unpin](lab:unpin).

## The policy

```js
const occupancyFirst = k.decide.cost(({ knobs, node, ctx }) => {
  const e = estimate(analyze(…node…), knobs, ctx.target);
  if (!isFinite(e.us)) return Infinity;           // illegal on this device
  return -e.occupancy + threadsPerBlock(knobs) * 1e-6;   // most warps per SM, then smaller blocks
}, { name: "occupancy" }).for("schedule");
const pipe = std.emmy.pipeline().with({ decide: k.decide.chain(k.decide.pinned(), k.decide.evidence(), occupancyFirst, k.decide.first()) });
```

A cost function returns a number per option (lower is better), `Infinity` for illegal, or `null` for "no opinion" — then the next policy in the chain decides.

## What happens

The program is $y = \operatorname{RMSNorm}(\operatorname{GELU}(xW^\top))$ with $x \in \mathbb{R}^{2048 \times 1024}$. Two kernels, simulated RTX 5090:

| kernel | occupancy-first picks | time | the standard model picks | time |
|---|---|---:|---|---:|
| matmul | `MAP=row, TPB=64` — occupancy 1.00 | **3212 µs**, 1.3 TFLOP/s | tiled 128×128, 8×2 per thread — occupancy 0.67 | 181 µs, 23.7 TFLOP/s |
| GELU + RMSNorm | `MAP=row, TPB=64` | 12.6 µs | `MAP=row, TPB=1024, STAGE=all` | 12.6 µs |

**Why the row map loses by 18×.** One block per output row computes 1024 dot products of length 1024, reading $W$ straight from L2 for every row: $2048 \times 4\ \text{MiB} = 8\ \text{GiB}$ of L2 traffic. The tiled map reads each element of $W$ once per 128-row tile from L2 and then serves it from shared memory and registers (W-21). Occupancy is 100% in the first case and 67% in the second — and it doesn't matter, because neither kernel is waiting for DRAM latency. One is bound by L2 bandwidth, the other by shared-memory bandwidth.

**Why the norm kernel ties.** Memory-bound row kernels need enough warps to keep bytes in flight (W-23); here both choices have enough, so occupancy-first happens to agree with the model.

## The maths: what a cost model must predict

The standard model, `std.tile.estimate`, counts per option: flops, DRAM bytes, L2 bytes, shared-memory wavefronts (with exact bank conflicts for tiled kernels) and warp instructions. It turns each count into time at that unit's peak rate, takes the maximum (the bottleneck), and derates by achieved occupancy and wave quantization:

$$t = \sum_\text{waves} \max_{u \in \{\text{dram, l2, smem, issue}\}} \frac{\text{count}_u \cdot \text{share}}{\text{rate}_u \cdot \text{eff}_u(\text{occupancy})} + t_\text{launch}$$

Occupancy appears only as an efficiency factor. A model that optimizes the factor and ignores the counts optimizes the wrong thing.

## Exercises

1. Write a cost model that ranks by *estimated L2 bytes* only. Which kernels does it get right, and which wrong?
2. Make occupancy-first return `null` for any kernel with a contraction (`an.contraction`), so the chain falls through to `k.decide.first()`. What does `first` pick? Now add `std.tile.costPrior` to the chain instead.
3. [Tune for 16 programs](lab:tune?strategy=sweep&budget=16). The evidence policy is in the chain in front of your model: does the measured evidence overrule it? (It only does once your model's own favourite has been measured.)

## Further reading

- Williams, Waterman, Patterson, *Roofline* (2009)
- Chen et al., *TVM* (OSDI 2018) and *Learning to Optimize Tensor Programs* (2018): analytic vs learned cost models
