# MLP and the blowup guard

Fusion is not always a win. Fusing one matmul into another would **recompute** the first one for every element of the second. A guard in the fusion pass compares the work before and after, and declines. This project shows the guard at work, and where fusion still applies.

> **Try it** — in [Trace](lab:view?name=trace), turn on *Declined*: `merge_loop_ops` declines with *blowup: fused work … > unfused …*. Then switch the activation to [SwiGLU](lab:param?name=act&value=swiglu) and back to [GELU](lab:param?name=act&value=gelu).

## The maths of recomputation

Take $h = \operatorname{GELU}(xW_\text{up}^\top)$ with $h \in \mathbb{R}^{T \times H}$, and $y = hW_\text{down}^\top$ with $y \in \mathbb{R}^{T \times D}$. The second matmul reads every $h_{tk}$ once **per output column**, $D$ times in all. Fusing a producer into it replaces each of those reads by the producer's own computation:

| fusion tried | each $h_{tk}$ then costs | work ratio (fused / unfused) | verdict |
|---|---|---:|---|
| GELU's elementwise ops into the second matmul (a *prologue*) | GELU recomputed $D$ times | 1.5–2.4× | declined |
| the first matmul into the second | a length-$D$ dot product, recomputed $D$ times | 171–256× | declined |
| GELU into the first matmul's *epilogue* | GELU once, as the output is written | < 1× | **accepted** |

The matmul-into-matmul ratio is easy to derive. With $c$ the cost of one multiply-add including its two loads,

$$W_\text{fused} \approx \underbrace{T D H}_{\text{reads of } h} \cdot \underbrace{D\,c}_{\text{one dot product}}, \qquad W_\text{unfused} \approx 2 \cdot TDH\,c \qquad\Rightarrow\qquad \frac{W_\text{fused}}{W_\text{unfused}} \approx \frac{D}{2} = 256$$

Fusion is only free when the producer's value is used about once per element, or when recomputing it is cheaper than a round trip through memory.

## The guard

`merge_loop_ops` has a guard: fuse only if $\text{work}(\text{fused}) \le \text{work}(\text{producer}) + \text{work}(\text{consumer})$. Work counts flops plus 12 units per memory access (`W_MEM`), so inlining a cheap elementwise producer that is read once still wins: it removes a store and a load. The [Trace](lab:view?name=trace) shows 13 declined steps with their numbers, e.g. *blowup: fused work 10,472,128,512 > unfused 7,001,866,240* (a piece of GELU into the second matmul) and *fused work 3,581,468,999,680 > unfused 13,976,469,504* (matmul into matmul).

The result is 2 kernels: `k_linear_gelu_reduce` (32.2 µs) and `k_linear_reduce` (44.4 µs) on the simulated RTX 5090.

The pass also runs **consumers first** (`order("reverse")`). Fusing in producer order could merge the wrong pair first and leave a worse partition.

## SwiGLU

$$\operatorname{SwiGLU}(x) = \big(\operatorname{SiLU}(xW_g^\top) \odot xW_u^\top\big) W_d^\top$$

Two matmuls read the same $x$; their elementwise product feeds the third. Count the kernels after the switch: which fusions does the guard accept now?

## Exercises

1. Change `W_MEM` in `std/loop.js` to 1. Which fusions does the guard accept now, and is the compiled program faster or slower?
2. Write the work estimate for fusing a row softmax into a following matmul over the same rows. Is that fusion profitable? (It is the heart of FlashAttention.)
3. Find the declined steps' node ids in Trace, then look those nodes up in the [loop IR](lab:ir?name=loop).
