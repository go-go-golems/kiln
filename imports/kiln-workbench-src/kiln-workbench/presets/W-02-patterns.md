# Patterns, declines and guards

Real rewrite rules are conditional: they apply only when it is legal and profitable. This project shows the three ways a rule says no, and why each one is visible in the Trace.

> **Try it** — open [Trace](lab:view?name=trace) and turn on *Declined*. Every refusal is listed with its reason. Then compare the [source IR](lab:ir?name=int) with the [optimized IR](lab:ir?name=optimized).

## The rules

**Strength reduction.** Integer multiplication by a power of two is a left shift:

$$x \cdot 2^k = x \ll k$$

`strength_reduce` matches any multiply by a constant and calls `skip("6 is not a power of two")` for the others. A *skip* is a visible decline: the Trace records the rule, the node and the reason.

**Chained patterns.** `P.chain(inner, outer)` matches a producer feeding a consumer, where the producer has exactly one use. Two shifts merge:

$$(x \ll a) \ll b = x \ll (a + b)$$

The one-use condition matters: if the inner shift had other users, merging would duplicate work instead of removing it.

**Common-subexpression elimination in one rule.** Every node has a structural *key* (a hash of its op, attributes and its operands' keys). `cse` replaces a pure node by an earlier node with the same key. The two copies of `x * 8 * 4` become one shift, computed once.

**Guards.** `distribute` rewrites $a \cdot (b + c) \to ab + ac$, then a guard compares the graphs before and after and vetoes the rewrite if the graph grew. The Trace shows *would grow the graph from 13 to 14 nodes*. A guard sees both versions, so it can apply any cost criterion.

## Three ways to say no

| mechanism | when it runs | visible in Trace? | use for |
|---|---|---|---|
| `.where(…)` on the pattern | while matching | no (not a match) | structural conditions |
| `skip("why")` in the rewrite | after matching, before building | yes, with your reason | conditions you want explained |
| `.guard(…)` | after building the replacement | yes, with the guard's reason | profitability checks on the result |

## Exercises

1. Make `distribute` fire anyway by relaxing its guard, then add a `cse` step after it. Does the graph end up smaller than before?
2. Strength-reduce `x * 6` into `(x << 2) + (x << 1)`. Is it a win? Write a guard that decides.
3. Why does `cse` use `graph.findBefore` rather than searching the whole graph?

## Further reading

- Muchnick, *Advanced Compiler Design and Implementation*: strength reduction, value numbering
- Willsey et al., [egg: *Fast and Extensible Equality Saturation*](https://arxiv.org/abs/2004.03082): when rule order stops mattering
