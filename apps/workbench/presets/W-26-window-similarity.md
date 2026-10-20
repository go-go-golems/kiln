# Window similarity

The first preset taken from real work. factory-videos' live UI draws, for a run that embeds its video windows, the
cosine similarity of every pair of windows: repeated activity shows up as bright off-diagonal bands. The vectors are
unit length, so the whole matrix is one contraction, $S = X X^\top$ for the $n \times d$ matrix $X$ of window rows.

> **Try it** — [measure](lab:measure), then switch to [256 dimensions](lab:param?name=dims&value=256&measure) and
> to [2,304 windows](lab:param?name=windows&value=2304&measure).

## Buckets, not shapes

Kiln's shapes are compile-time constants and a run's window count is not, so the program is compiled for six window
buckets (256 to 2,304) at the two embedding widths the cache holds (256 for Cosmos-Embed1 at 224p, 768 for 448p and
SigLIP2). The consumer pads its $n$ rows up to the next bucket with zero rows. A zero row has a dot product of zero
with every row, and the consumer reads only the top-left $n \times n$ block, so padding changes no value it reads.

## What the compiler does with it

The transpose is a view, so the program has one input and one kernel: `x` is read twice through two index maps, once
as rows and once as columns. The fork at the contraction offers thread, row and tiled schedules; on WebGPU's default
limits the model picks a 128 × 64 output tile with an 8-deep k step (6 KiB of workgroup memory, 256 invocations) from
1,536 windows up, and 64 × 32 below.

## Measured against the code it replaces

On an M1 Pro (Chrome, WebGPU), today's TypeScript builds the matrix in Float64 at about 1.0 G multiply-adds per
second: 724 ms for 1,385 windows of 768 dimensions and 2.0 s for 2,297. The paired comparison and the quality gate
(maximum absolute error against Float64, and the share of cells that keep their colour step) are in KILN-002's
diary, Phase A.

## Exercises

1. The matrix is symmetric. How much work would a schedule that computes only $j \ge i$ tiles save, and what would
   the consumer have to do differently?
2. Above which $n$ does a 2,304-bucket output stop fitting the default 128 MiB storage-buffer binding limit?
3. Express the same program for a batch of runs: $S_b = X_b X_b^\top$. Which schedule does the model pick now?
