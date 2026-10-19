# Hello, dialect

The smallest complete compiler: a dialect, a program, a pass of rewrite rules, and a pipeline with checkpoints. Everything else in the workbench is this pattern at a larger scale.

> **Try it** — open the [simplified IR](lab:ir?name=simple), then step through the rewrites in [Trace](lab:view?name=trace). Each step shows its diff. Then open the [Graph](lab:graph?name=arith) of the source.

## The pieces

**A dialect** is a set of operations. Each op declares:

- `args` and `attrs`: its operands and constants;
- `infer`: its result type;
- `eval`: what it computes. Any graph built from evaluable ops can be interpreted, so every rewrite can be checked;
- `print`: how it shows up in the IR view;
- `traits` such as `pure` (no side effects: it can be folded and deduplicated), `commutative` and `const`.

**Tracing.** `k.trace(name, fn, inputTypes)` calls your JavaScript function with symbolic values. Every dialect call becomes a node, and the result is a dataflow graph (a DAG). `.lifts()` turns bare numbers into constants; `.methods()` lets you write `x.mul(3).add(y)`.

**Rules** match a pattern and return a replacement. Three ways to write the match:

| style | example | when |
|---|---|---|
| pattern + predicate | `P.trait("pure").where(({n}) => …)` | general conditions |
| typed pattern | `P.op("arith.mul").args(P.any(), P.const(1))` | fixed shapes |
| by example | `.from(({x}) => x.mul(1)).to(({x}) => x)` | algebraic identities |

**A pass** runs its rules to a **fixpoint**: rewrite the first match, rescan, repeat until nothing matches. **A pipeline** alternates IR checkpoints and passes. A `strict` checkpoint fails the compile if an op from another dialect survives.

## What happens to this program

$$\text{out} = x \cdot (3 + (-2)) + 0 + y \cdot 2 + 0 \cdot y$$

The rewrites, in order (see [Trace](lab:view?name=trace)):

1. `fold` turns $3 + (-2)$ into $1$.
2. `mul_one` turns $x \cdot 1$ into $x$.
3. `add_zero` drops the first $+0$.
4. `x*2 → x+x` turns $y \cdot 2$ into $y + y$ (addition is cheaper than multiplication on many targets).
5. `const_right` moves the constant in $0 \cdot y$ to the right, which lets `mul_zero` match.
6. `mul_zero` and `add_zero` finish.

The final graph has 4 nodes: $x + (y + y)$. The checks in [Code](lab:view?name=code) verify the size, and that the value is unchanged on $x = 3, y = 4$.

## Why rule order and canonical forms matter

`mul_zero` is written as `x.mul(0)`: it matches only when the constant is the **second** argument. Rather than writing every rule twice, `const_right` establishes a **canonical form** (constants on the right) and the other rules assume it. This is how production rewriters such as MLIR's canonicalization keep the rule count manageable.

## Exercises

1. Add a rule for $x - x \to 0$ (you'll need a `sub` op). Does it fire on `x.sub(x)` after other rewrites?
2. Write a rule that would loop forever (e.g. $a + b \to b + a$ without a condition) and watch the `FixpointError`. How does `const_right` avoid it?
3. Add a `strict: true` checkpoint *before* `simplify`. Why does it still pass?

## Further reading

- MLIR [Toy tutorial](https://mlir.llvm.org/docs/Tutorials/Toy/), chapters 2–3: dialects and pattern rewrites
- Cooper & Torczon, *Engineering a Compiler*: the chapters on IR and value numbering
