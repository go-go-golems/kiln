# Redaction mask post-processing

Playback's redaction service blacks out people in recorded video. Its segmentation engine returns one mask per person
on a 640 × 640 letterboxed canvas, thresholded to $\{0, 1\}$ on the GPU. Then, for every person, a CPU loop undoes
the letterbox (crop the content rectangle, nearest-neighbour resize back to the inference size) and smooths the
staircase edge: a Gaussian blur of $255 \cdot m$ with $\sigma = 2$, kept where it is at least 128. This preset is that
loop, one output mask per input mask.

> **Try it** — [measure](lab:measure), then switch to the [direct form](lab:param?name=form&value=direct&measure) and
> to [64 detections](lab:param?name=detections&value=64&measure).

## Bit-exact, not approximately equal

OpenCV blurs an 8-bit image in fixed point. For $\sigma = 2$ its 13 weights are $k/256$ with
$k = (1, 2, 7, 16, 31, 45, 52, 45, 31, 16, 7, 2, 1)$, which sum to exactly 256; an impulse on a one-row image reveals
them. With a $\{0, 1\}$ mask the blurred value is $255 \cdot S / 65536$ for the integer
$S = \sum_{i,j} k_i k_j \, m_{y+i,\,x+j}$, and OpenCV's "round, then compare with 128" is exactly $S \ge 32768$. $S$ never
exceeds 65,536, so fp32 holds every partial sum exactly in any order, and the kernels agree with OpenCV on every pixel:
KILN-002 C2 found 0 differing pixels in 269 M, on Playback's own functions, with OpenCV 4.13 on arm64 and x86-64 (with
Intel IPP).

## Index maps do all the moving

The letterbox for a 768 × 416 inference frame scales by 5/6 into 640 × 347 with 146 rows of padding above. OpenCV's
nearest-neighbour resize reads source row $\lfloor 347 y / 416 \rfloor + 146$ and column $\lfloor 640 x / 768 \rfloor$;
the Gaussian's border is `BORDER_REFLECT_101` ($-1 \to 1$, $n \to n - 2$). Both are index maps, so no kernel copies a
mask: the horizontal pass reads the engine's canvas directly through crop, resize and reflection at once.

## Two forms

The **separable** form is a horizontal pass into an intermediate and a vertical pass with the cut: two kernels, 26
reads per pixel, and 1.28 MB of intermediate per mask. The **direct** form sums all 169 taps in one kernel with no
intermediate. On an M1 Pro the separable form takes 0.10–0.17 ms per mask from 16 masks up and the direct form
0.39–0.50 ms, about what OpenCV's CPU loop takes there. Playback uses the separable form; the intermediate is
allocated by the caller per call (`CudaProgram(..., allocate=False)` and `launch(..., scratch=...)`), so two frames
collected at once on different streams never share one.

## Buckets

The engine keeps up to 100 detections. Shapes are compile-time constants, so the program is compiled for 1, 2, 4, 8,
16, 32, 64 and 100 masks; the engine pads the kept masks with zero masks and reads the first $n$ outputs. A zero mask
blurs to zero, so padding changes nothing.

## Exercises

1. Why does the fusion pass keep the horizontal result in a buffer instead of inlining it into the vertical pass?
   How many times would each horizontal value be recomputed?
2. The cut $S \ge 32768$ assumes $\{0, 1\}$ masks. What is the exact condition for a general 8-bit image, and does
   fp32 still hold it exactly?
3. Write the union of all masks as one more output. Which of Playback's callers could use it, and which still need
   the per-person masks?
