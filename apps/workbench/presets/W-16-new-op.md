# A new frontend op

Adding an operator to a compiler takes three things: its **meaning** (a reference implementation every lower level is checked against), its **type rule**, and a **lowering** into ops the compiler already handles. This project adds `hard_swish` from MobileNetV3. After decomposition it is ordinary Tensor IR and fuses into a matmul's epilogue like a built-in.

> **Try it** — compile and look for `ext.hard_swish` in the [torch IR](lab:ir?name=torch), and for its pieces in the [tensor IR](lab:ir?name=tensor). [Measure](lab:measure): one kernel.

## The maths

$$\operatorname{hard\_swish}(x) = x \cdot \frac{\min(\max(x + 3, 0), 6)}{6}$$

A piecewise-linear approximation of $\operatorname{swish}(x) = x \cdot \sigma(x)$: zero for $x \le -3$, the identity for $x \ge 3$, and a parabola in between. It needs no exponential, which is why it was designed for mobile CPUs.

## The three pieces

```js
const Ext = k.dialect("ext")
  .op("hard_swish", { args: ["x"], traits: ["pure"], infer: ({ x }) => x.type, print: "hard_swish({x})",
    eval: ({ x }) => { …x·min(max(x+3,0),6)/6 per element… } });                       // meaning + type
const lowerHardSwish = std.decompose("ext.hard_swish",
  ({ x }) => T.mul(x, T.div(T.ew("min", T.ew("max", T.add(x, 3), 0), 6), 6)));        // lowering
const pipe = std.emmy.pipeline().insertRule("frontend/decomposition", lowerHardSwish)
  .withIr("torch", { dialects: [...std.emmy.pipeline().steps[0].opts.dialects, Ext] });
```

- **`eval`** is the semantics. The end-to-end check runs the program through it, and compares with the Loop IR's evaluation. If the decomposition were wrong (say, `/ 3` for `/ 6`), the check would fail.
- **`insertRule`** adds the decomposition to the standard pass rather than writing a new pass.
- **`withIr("torch", …)`** registers the dialect at the first checkpoint. Checkpoints are **strict**: if an op isn't allowed at a level, compilation stops with an error naming the op and the rule that declined to lower it.

## What you should see

One kernel, `k_linear_ext_hard_swish_reduce`: a 1024 × 1024 × 1024 tiled matmul (128×64 tiles, 4×2 per thread) with hard_swish in its epilogue, 119.8 µs on the simulated RTX 5090. That's the same time as the plain linear layer of W-08: the activation costs nothing. It is applied to each output once, in registers, before the single store.

Put the activation *before* the linear layer instead, and the fusion guard keeps it as a separate kernel: inlined into the matmul's operand loads, it would be recomputed once per output column (W-09).

## Exercises

1. Remove the `insertRule` line. What does the strict tensor checkpoint report?
2. Add `hard_sigmoid(x) = min(max(x + 3, 0), 6) / 6` the same way, then rewrite hard_swish in terms of it. Does the fused kernel change?
3. Add a deliberate bug to the decomposition (`T.add(x, 2)`). Which check catches it, and with what error?
