# Regex → NFA → DFA → JavaScript

Compilers are not only about tensors. This project uses the same framework — dialects, rewrite rules, whole-graph passes, IR checkpoints, an end-to-end check — for a classic: compiling a regular expression into a deterministic automaton and then into JavaScript.

> **Try it** — edit the **pattern** in the Code view's Parameters panel, or try [`(a|b)*abb`](lab:param?name=pattern&value=%28a%7Cb%29*abb), the textbook example. Toggle [minimize off](lab:param?name=minimize&value=false) and [on](lab:param?name=minimize&value=true), and compare the [DFA](lab:ir?name=dfa). Read the generated matcher in the [js IR](lab:ir?name=js).

## The pipeline

| IR | what it holds | pass to the next level |
|---|---|---|
| **regex** | the parsed pattern: `char`, `any`, `cat`, `alt`, `star`, `plus`, `opt` | `desugar`: $a^+ \to a\,a^*$, $a? \to a \mid \varepsilon$ (rewrite rules) |
| **core** | only `char`, `any`, `eps`, `cat`, `alt`, `star` | `thompson`: a whole-graph pass building an NFA |
| **nfa** | one node holding states, edges and ε-edges | `subset`, then `minimize` |
| **dfa** | one node holding a transition table | `codegen` |
| **js** | the source of a `switch`-based matcher | — |

Every level evaluates. The end-to-end check runs the source matcher and the generated function on 15 test strings, and a second check compares with JavaScript's own `RegExp`.

## The maths

**Thompson's construction** builds an NFA with ε-moves, compositionally: each operator becomes a small gadget wired to its operands' gadgets. Each operator adds at most two states, so the NFA has $O(m)$ states for a pattern of length $m$. The default pattern `(ab|a)*b+.c?` gives 24 states.

**Subset construction** makes it deterministic: each DFA state is the set of NFA states the input could have reached, closed under ε-moves. In the worst case that is $2^{O(m)}$ states — `(a|b)*a(a|b)^{k}` needs $2^{k+1}$ — but typical patterns stay small.

**Minimization (Moore's algorithm)** merges equivalent states. Start with two classes, accepting and not; repeatedly split a class whenever two of its states go, on some symbol, to different classes; stop when nothing splits. The result is the unique smallest DFA for the language.

| pattern | NFA states | DFA states | minimized |
|---|---:|---:|---:|
| `(ab\|a)*b+.c?` | 24 | 10 | 8 |
| `(a\|b)*abb` | 14 | 5 | 4 |

For `(a|b)*abb` the minimized DFA is the one in the Dragon Book (states 0–3, accepting 3), and the generated code is a four-case `switch`.

## The system

- **Whole-graph passes** (`k.pass(…).whole(({ graph, edit }) => …)`) replace a subgraph in one step. Rewrite rules suit local patterns; algorithms like subset construction need the whole automaton.
- **Strict checkpoints** guarantee each level only contains its own dialect's ops: after `thompson` no `re.*` op may survive.
- **The pattern is a text parameter** and `minimize` a pipeline parameter. Changing either recompiles, and the checks run again.

## Exercises

1. Add character classes `[a-c]`: parse them as an alternation, or (better) add an edge label for a set and teach `subset` to split the alphabet into disjoint classes.
2. Write a pattern whose DFA has many more states than its NFA. How many does `(a|b)*a(a|b)(a|b)(a|b)` have?
3. Make the code generator emit a lookup table (`Uint8Array`) instead of a `switch`. Which is faster for long strings?

## Further reading

- Russ Cox, [*Regular Expression Matching Can Be Simple And Fast*](https://swtch.com/~rsc/regexp/regexp1.html)
- Aho, Lam, Sethi, Ullman, *Compilers: Principles, Techniques, and Tools*, chapter 3
