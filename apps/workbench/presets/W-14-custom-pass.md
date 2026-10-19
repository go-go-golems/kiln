# Your own pass in the ML pipeline

A compiler pass you write, inserted into the standard ML pipeline. Softmax ends with $e_j / \sum_k e_k$: a division per element by a value that is the same for the whole row. Division costs several multiplies, so the pass rewrites it to $e_j \cdot (1/\sum_k e_k)$, and code motion computes the reciprocal once per row.

> **Try it** — the pass is a fork with the knob **RECIP**, listed under *knobs* in the Code view's Parameters panel (also in [Knobs](lab:view?name=knobs)). Pin it [off](lab:pin?RECIP=false) and [on](lab:pin?RECIP=true), and diff the [loop IR](lab:ir?name=loop) and the [CUDA](lab:view?name=kernels). [Unpin](lab:unpin?name=RECIP).

## The rule

```js
const hoistRecip = k.rule("hoist_reciprocal")
  .match(P.op("tensor.ew").as("n").where(({ n }) =>
    n.attrs.fn === "div" && n.arg(1).is(Tn.view) && numel(n.arg(1).arg(0).shape) < numel(n.shape)))
  .rewrite(({ n }) => k.fork.toggle(RECIP, () => { … T.ew("mul", n.arg(0), view(recip(Σe))) … }));
```

- **The pattern** matches a division whose divisor is a *broadcast*: a `view` of a smaller tensor. Only then is there something to hoist.
- **The rewrite** builds `recip` at the small shape and broadcasts the result. Because the reciprocal sits *before* the broadcast, loop-invariant code motion places it at the row level of the loop nest: once per row, not once per element.
- **`k.fork.toggle(RECIP, …)`** makes it a choice, not a forced rewrite: the original and the rewritten graph are both options, and a decide policy picks.

## The pass and its place

```js
const recipPass = k.pass("frontend/reciprocal").short("r").rules(hoistRecip).knobs(RECIP)
  .check((g) => …no div left with RECIP on… || "a div survived the rewrite");
const base = std.emmy.pipeline().insertAfter("frontend/optimization", recipPass);
const flops = k.decide.cost(({ knobs }) => (knobs.RECIP ? 1 : 4), { name: "flops" }).for("hoist_reciprocal");
```

- **`.check`** is a pass postcondition, run after the pass on every compile. Pass checks catch bugs where they happen instead of three IRs later.
- **`insertAfter`** puts the pass after the tensor-level optimizations, so it sees the decomposed softmax.
- **The policy** scores the fork by flops (a multiply 1, a division 4) and goes in front of the standard chain. In [Knobs](lab:view?name=knobs) the decision reads *by flops*.

## Does it matter?

The softmax at 1024 × 1024 runs in 7.9 µs either way on the simulated RTX 5090: it is memory-bound (W-06), and the arithmetic hides under the DRAM traffic. On a real GPU, `div.rn.f32` is a multi-instruction sequence while `rcp` + `mul` is two, so the rewrite matters for compute-bound kernels. A fast-math compiler flag does the same globally, with less control. This is how to think about any rewrite: **it saves what the kernel is bound by, or it saves nothing.**

## Exercises

1. Extend the pattern to division by a scalar constant ($x / 3 \to x \cdot 0.\overline{3}$). Is that rewrite exact in fp32? (Hint: 3 is not a power of two.)
2. Make RECIP's cost depend on the device: a policy that returns `null` (no opinion) on WebGPU.
3. Write a pass check that fails if any `recip` sits inside a per-element loop in the Loop IR.
