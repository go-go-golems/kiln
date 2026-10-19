# Linear layer, tiled

$y = x W^\top$: the operation that dominates transformer FLOPs. The tile pass recognizes a **contraction** in the loop IR and offers shared-memory tiled schedules, hundreds of them. This is the compiler's view of what W-21 walks through by hand.

> **Try it** — open the `schedule` fork in [Knobs](lab:view?name=knobs): 645 legal tile shapes, ranked by the cost model. [Measure](lab:measure), then [tune for 32 programs](lab:tune?strategy=spmcts&budget=32) and see whether the measured best differs from the model's pick.

## The maths

$$y_{mn} = \sum_k x_{mk}\, W_{nk}, \qquad W = 2MNK, \qquad I_\text{max} = \frac{2MNK}{4(MK + NK + MN)}$$

At $M = N = K = 1024$ that is 2.1 GFLOP and up to 171 flop/byte: compute-heavy, *if* the schedule reuses data on-chip.

## The system

The tile pass analyzes the loop nest: two operands indexed by $(m, k)$ and $(n, k)$, a sum over $k$, an output over $(m, n)$. Each `MAP=tiled` option fixes:

| knob | meaning | effect |
|---|---|---|
| `BM × BN` | output tile per block | global traffic $\propto 1/B_M + 1/B_N$; fewer blocks |
| `BK` | depth of each shared-memory slab | shared memory $= 4 B_K (B_M + B_N)$ bytes |
| `TM × TN` | outputs per thread (register tile) | shared-memory reads per FMA $= (T_M + T_N)/(T_M T_N)$ |

Legality: at most 1024 threads per block, at most 48 KiB of static shared memory, and at least one warp of threads.

The kernel each option produces is in [Kernels](lab:view?name=kernels): a loop over $k$-slabs, cooperative tile loads, a barrier, an unrolled register-tile update, a barrier, and finally the epilogue. In W-09 and W-16 the epilogue includes fused activations.

The cost model's pick runs at about 18 TFLOP/s on the simulated RTX 5090 (119.8 µs), limited by shared-memory bandwidth. W-21 explains why and what comes next.

## Exercises

1. [Make $M = 64$](lab:param?name=M&value=64&measure) (a small batch) and compare the model's pick and its time with $M = 1024$. W-20 explores this axis in depth.
2. Add a bias: `N.linear(x, W, b)`. Where does the bias add end up in the kernel?
3. Switch to the [Orin](lab:device?id=sim:orin&measure) (8 SMs): which tile shape does the model pick there, and why does a GPU with fewer SMs prefer bigger tiles? (W-24.)
