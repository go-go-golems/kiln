# Box blur, a stencil

A stencil — each output pixel averages its neighbourhood — written as a sum of shifted slices of the input. The slices are **views**: index maps, not copies. They compose and fuse, so the whole stencil is one kernel that never materializes a shifted image.

> **Try it** — [measure](lab:measure), then grow the [radius to 2](lab:param?name=radius&value=2&measure) and [3](lab:param?name=radius&value=3&measure). [Back to 1](lab:param?name=radius&value=1).

## The maths

$$\text{out}_{yx} = \frac{1}{(2r+1)^2} \sum_{dy=0}^{2r} \sum_{dx=0}^{2r} \text{img}_{y+dy,\,x+dx}$$

The input is padded by $r$ on each side, so `slice(slice(img, 0, dy, dy+H), 1, dx, dx+W)` is the window shifted by $(dy, dx)$. In the Tensor IR each slice is a `view` with the index map $(y, x) \mapsto (y + dy, x + dx)$. The optimizer folds view-of-view into one map, and fusion inlines all $(2r+1)^2$ of them into one loop body. Read the [loop IR](lab:ir?name=loop): nine loads of `in0` at different offsets, eight adds, one multiply.

## The system: L2 does the reuse

Each input pixel is read by $(2r+1)^2$ different threads. Nothing in the kernel shares those reads explicitly, but neighbouring threads run at nearly the same time, so the repeats hit the L2 cache. The kernel is **L2-bound**, not DRAM-bound:

| radius | taps | L2 traffic | time (simulated RTX 5090, 1024 × 1024) |
|---:|---:|---:|---:|
| 1 | 9 | 48 MiB | 12.1 µs |
| 2 | 25 | 124 MiB | 27.5 µs |
| 3 | 49 | 242 MiB | 51.1 µs |

The time grows with the number of taps, while DRAM traffic stays near the 8 MiB minimum (read the image once, write the result once). Two details are visible in [Perf](lab:view?name=perf):

- **Sectors per request ≈ 4.9, not 4.** A warp's 32 consecutive loads start at offset $dx$, so 128 bytes straddle 5 of the 32-byte sectors whenever $dx \bmod 8 \ne 0$. Misaligned access wastes about 20% of each transfer.
- **Intensity ≈ 1 flop/byte** against L2: no schedule choice can make this kernel compute-bound.

## How it should be done

Production stencils stage a tile plus its **halo** (the $r$-wide border) in shared memory: each block loads $(B + 2r)^2$ pixels once and computes $B^2$ outputs from shared memory. A separable blur goes further: a box filter is a horizontal pass followed by a vertical pass, $2(2r+1)$ taps instead of $(2r+1)^2$. Both are transformations this compiler doesn't do: the first needs a 2-D staging schedule, the second an algebraic rewrite of the program.

## Exercises

1. Write the separable version as two programs-in-one: a horizontal blur into a temporary, then a vertical blur. Does the compiler fuse them back into one kernel? Should it?
2. For radius 3, how many bytes would a halo-tiled kernel with 32 × 32 output tiles read from L2 per output pixel?
3. Change the padding so the slices start at multiples of 8 floats. Does *sectors per request* drop to 4?
