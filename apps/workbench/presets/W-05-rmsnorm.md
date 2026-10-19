# RMSNorm, fused

One PyTorch-style operator goes through all six IRs of the standard pipeline and comes out as one CUDA kernel. This is the example the CloudRift post builds its compiler around. Follow it level by level to see what each pass is for.

> **Try it** — click through the levels in the [IR view](lab:ir?name=torch): torch → tensor → loop → tile → kernel → gpu. Then read the [CUDA](lab:kernel?name=k_rms_norm_reduce) and [measure](lab:measure).

## The maths

$$\operatorname{RMSNorm}(x)_{ij} = \frac{x_{ij}}{\sqrt{\frac1D \sum_k x_{ik}^2 + \varepsilon}}\; w_j$$

One reduction per row (the mean of squares), then an elementwise scale. For $1024 \times 4096$ fp32 inputs:

- **Bytes:** read $x$ (16 MiB), read $w$ (16 KiB), write $y$ (16 MiB): 32 MiB.
- **Work:** about $4D$ flop per row, so the intensity is about 1 flop/byte.
- **Prediction:** memory-bound. $t \approx 33.6\text{ MB} / 1792\text{ GB/s} + 2.5\ \mu s = 21.2\ \mu s$. The simulator says 24.3 µs.

## The pipeline, level by level

| IR | what it is | the pass that produces it |
|---|---|---|
| **torch** | `rms_norm(x, w)`: one frontend op with reference semantics | — |
| **tensor** | about 13 primitive ops: `mul`, `reduce add`, `div`, `add`, `rsqrt`, broadcast views | `d` decomposition, `o` optimization |
| **loop** | **one** `loop.kernel`: a loop nest with a reduction | `l` lift each op to a kernel, `f` fuse, `s` name |
| **tile** | the loop kernel with a GPU mapping: block per row, 1024 threads, row staged in shared memory | `t` schedule (a fork, decided by the cost model) |
| **kernel** | explicit threads: strided loops, shared-memory staging, a tree reduction with syncs | `k` materialize |
| **gpu** | CUDA and WGSL source | `c` emit |

Three ideas carry most of the weight.

1. **Decomposition into a small primitive set.** Every frontend op becomes elementwise, reduction and view (index-map) ops. Later passes handle only those three kinds.
2. **Fusion with loop-invariant code motion.** In the loop IR, every value is placed at the deepest loop it depends on. The row sum depends on the row only, so it is computed once per row, and `rsqrt` is hoisted out of the inner loop. Four kernels' worth of ops become one nest that reads $x$ once (twice with re-reads, served from shared memory).
3. **Cooperative row reductions.** With `MAP=row`, a block of 1024 threads sweeps a row with a stride, each thread keeping a partial sum, then halves the partials in shared memory: 512, 256, … 1. That takes $\log_2 1024 = 10$ steps with a barrier between each. See the *Kernel IR* tab in [Kernels](lab:view?name=kernels).

## Try the knobs

- [Pin TPB=128](lab:pin?MAP=row&TPB=128&measure): fewer threads per row, more blocks per SM. Faster or slower?
- [Pin no staging](lab:pin?STAGE=none&measure): $x$ is read twice from memory instead of once.
- [Unpin](lab:unpin).

## A claim to test

The tile pass maps one row to a block (`MAP=row`). The claim below says why that matters at these sizes: with one output element per thread (`MAP=thread`), every thread reads its whole row to compute its own copy of the row sum. The card is judged against the evidence store, so it stays open until both schedules have been measured on the current device.

```hypothesis row-beats-thread
```

1. [Measure the compiler's choice](lab:measure?view=none), `MAP=row`.
2. [Pin MAP=thread and measure](lab:pin?MAP=thread&measure): the card now has both times. It is supported or refuted when the ratio's interval lies wholly on one side of 0.5, and stays open while the interval straddles it.
3. [Unpin](lab:unpin?name=MAP): the next compile decides from the two measurements.

## Exercises

1. Count the rewrites per pass in [Trace](lab:view?name=trace). Which pass does the most work, and why?
2. Compute the shared memory the staged schedule needs per block, and the blocks per SM it allows (128 KiB per SM on the 5090).
3. Change the program to LayerNorm (`N.layer_norm`). How many reductions per row now, and does it still fuse into one kernel? (See W-13.)

## Further reading

- CloudRift, [*Building a GPU compiler from scratch*, part 1](https://www.cloudrift.ai/blog/building-gpu-compiler-from-scratch-1)
- Mark Harris, *Optimizing Parallel Reduction in CUDA* (NVIDIA): the tree reduction
