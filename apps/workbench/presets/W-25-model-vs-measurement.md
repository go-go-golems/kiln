# The cost model vs. the measurements

A compiler that has to choose between schedules can **predict** (with a cost model) or **measure** (by autotuning). This project measures every schedule the compiler could pick for one kernel, then scores the cost model against the measurements. Neither the model nor the simulator is ground truth, and seeing where they disagree is the lesson.

> **Try it**
> 1. [Sweep every option](lab:tune?strategy=sweep-all&budget=32). It compiles and measures 27 programs, about a minute on the simulator.
> 2. Read the score in the [Code view's checks](lab:view?name=code).
> 3. Open [Knobs](lab:view?name=knobs), choose the `schedule` fork, and sort by *Model*, then by *Measured*.
> 4. If your browser has WebGPU, [switch to it](lab:device?id=webgpu) and sweep again: the same score, on real hardware.

## How a greedy compile decides

At every fork the decide policy ranks the options and takes the first legal one. The standard chain is:

1. **pins** (yours),
2. **evidence**: the fastest *measured* option on this device, once the cost model's favourite has been measured too (so that measuring one pinned schedule cannot lock it in after you unpin),
3. **the cost model**, `std.tile.estimate`: analytic counts of flops, DRAM and L2 bytes, shared-memory wavefronts and warp instructions, turned into time by the roofline-plus-occupancy model,
4. **first**.

After the sweep the compile switches from `by: model` to `by: evidence`. Measurement overrides prediction.

## The maths: scoring a cost model

What matters is not the absolute error of the predictions but whether the model **ranks** options correctly, because the compiler only uses the ranking.

**Spearman's rank correlation.** Rank the $n$ measured options by predicted time and by measured time. With $d_i$ the difference of option $i$'s two ranks,

$$\rho = 1 - \frac{6 \sum_i d_i^2}{n(n^2 - 1)}$$

$\rho = 1$ is a perfect ranking, $0$ no relation, $-1$ reversed.

**Regret.** The cost of trusting the model:

$$\text{regret} = \frac{t_\text{measured}(\text{model's favourite})}{\min_i t_\text{measured}(i)} \;\ge\; 1$$

A model can have a high $\rho$ and still a bad regret if it mis-orders the top few, and only the top matters. Autotuning papers report both, often as "fraction of optimal".

## What you should see

Simulated RTX 5090, softmax over 2048 × 8192:

- All 27 options: **ρ ≈ 0.99**. The 15 thread-per-element schedules are about 1000× slower than the row schedules (each thread re-reads its whole row to compute its own copy of the row max and sum), and both model and simulator agree on that. Easy cases inflate $\rho$.
- **Regret 1.19×.** The model's favourite, `MAP=row,TPB=1024` without staging, measures 99.5 µs. The best measured, `MAP=row,TPB=1024,STAGE=reused`, takes 83.3 µs.
- Restrict attention to the 12 row schedules ([pin them one by one](lab:view?name=knobs), or sweep on a fresh device) and **ρ drops to about 0.92**.

The two scores are also stated as claims, judged live against this device's records. Before the sweep both are open. After it, on the simulated RTX 5090, the first is supported and the second refuted.

```hypothesis model-ranks-schedules
```

```hypothesis model-pick-near-best
```

### Why they disagree

The softmax reads each row three times. Without staging, the second and third reads go to memory. Do they hit L2 or DRAM? The two sides use different heuristics:

- **The cost model** counts the data a kernel touches, 64 MiB, which fits in the 96 MB L2. So it assumes almost every re-read hits L2, and staging buys nothing.
- **The simulator** counts input *and* output, 128 MiB, which does not fit. So it sends 60% of the re-read traffic to DRAM, and staging saves 19%.

Neither is the hardware. A real GPU's L2 behaviour depends on what else is in flight. Here a row is 32 KiB and about 170 rows are active at once, roughly 5 MB, so the re-reads of a row happen within microseconds and almost certainly hit L2. **The analytic model is probably closer to a real GPU here.** That's a hypothesis you can test: sweep on WebGPU and see whether staging still wins on your GPU.

### Why the simulator mostly agrees with the model

Both convert counts to time with the same function (`timeModel`). The simulator executes the kernel and counts real events: every sector, every bank conflict, every divergent branch. The model computes the same counts analytically. Where the analytic counting is exact — tiled matmuls, where the model replicates the kernel's shared-memory address arithmetic — $\rho$ is 1.0. Where it relies on heuristics — cache reuse, as here — they drift apart. What the simulator does *not* check is the time model itself. Only real hardware does that.

## Autotuning: search strategies

- **Sweep top 6.** Measure the model's six best options for each kernel: cheap, and good when the model's top 6 contain the true best.
- **Sweep all.** Exhaustive. Feasible here (27 options) but not for a tiled matmul (645 options in W-08, and multiplied across kernels).
- **SP-MCTS** (single-player Monte Carlo tree search) over the whole program's fork tree, following the CloudRift post. It keeps per-node *max* rewards (single-player games care about the best line, not the average), normalizes UCB by the best time so far, and stops after a patience budget. It spends measurements where the evidence says improvements are.

Production autotuners combine both ideas. TVM's AutoTVM and Ansor train a **learned** cost model (gradient-boosted trees) on measurements and use it to choose what to measure next. MetaSchedule makes the search space a probabilistic program. Every measurement here is stored as evidence, so tuning results persist across compiles for this device.

## Takeaways

1. Judge a cost model by ranking ($\rho$) and by regret, not by absolute error.
2. Cost models are most wrong about caches, contention and the like: anything not counted exactly. Know which parts of yours are heuristics.
3. Measure the top candidates on the target. The evidence then outranks the model.

## Exercises

1. Make the cost model's L2 heuristic match the simulator's (in `std/tile.js`, `estimate`, the `dram = …` line). Re-run the sweep: does the regret go to 1.00×? Is that an improvement?
2. Run [SP-MCTS with budget 12](lab:tune?strategy=spmcts&budget=12). How many measurements does it need to find the 83.3 µs schedule?
3. Write a decide policy that tries the model's top 3 options and picks the best *measured* one (`k.decide.cost` with `run.ctx.store`).

## Further reading

- Chen et al., [AutoTVM: *Learning to Optimize Tensor Programs*](https://arxiv.org/abs/1805.08166)
- Zheng et al., [Ansor](https://arxiv.org/abs/2006.06762) · Shao et al., [MetaSchedule](https://arxiv.org/abs/2205.13603)
- Haj-Ali et al., [ProTuner: tuning programs with Monte Carlo tree search](https://arxiv.org/abs/2005.13685)
- Kaufman et al., [*A Learned Performance Model for Tensor Processing Units*](https://arxiv.org/abs/2008.01040)
- CloudRift, [*Building a GPU compiler from scratch*, part 3](https://www.cloudrift.ai/blog/building-gpu-compiler-from-scratch-3): the SP-MCTS this project implements
