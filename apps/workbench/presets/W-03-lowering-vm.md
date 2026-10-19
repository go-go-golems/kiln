# Lowering to a register VM

Compilers are pipelines of lowerings: each pass rewrites the program into a lower-level dialect, and a checkpoint proves nothing was left behind. This project lowers arithmetic to three-address VM instructions, then a whole-graph pass allocates registers and emits a linear program.

> **Try it** — compare the three levels: [arith](lab:ir?name=arith), [vm](lab:ir?name=vm), [asm](lab:ir?name=asm). Then [turn register reuse off](lab:param?name=reuse&value=false) and read the register count in the asm IR. [Turn it back on](lab:param?name=reuse&value=true).

## Lowering with strict checkpoints

Each `lower_*` rule rewrites a node **in place** with `n.lower(Vm.bin({ opcode }))`. The node keeps its id and its operands but changes its op. The `vm` checkpoint is `strict`: if any `arith.*` op survives, the compile stops with a `LoweringError` naming the node and the last rule that declined it. Delete `lowerNeg` to see one.

## Register allocation: linear scan over a DAG

A DAG has no control flow, so a topological order is a valid schedule, and register allocation reduces to *live ranges* in that order:

1. A value is **live** from the instruction that defines it to its **last use**.
2. Walk the instructions in order. Before allocating a destination, free the registers of operands whose last use is this instruction.
3. Take a free register if there is one, otherwise a new one.

The number of registers needed equals the maximum number of simultaneously live values (the *register pressure*) along the chosen order. With reuse on, this polynomial needs 3 registers for 14 instructions; with reuse off, one per value.

## Whole-graph passes

`regalloc+emit` is a `.whole(...)` pass: it sees the entire graph at once, because allocation is a global decision. It builds a single `asm.program` node holding the instruction list, and `edit.replaceAll` makes it the output. The node's `eval` is a tiny interpreter, so even the final code is checked against the source: see the end-to-end check in [Code](lab:view?name=code).

## Exercises

1. The order of a DAG's topological sort changes the register pressure. Find an order for this program that needs only 2 registers, or prove it can't be done.
2. Add an `fma` instruction (`r = a * b + c`) with a rule that fuses `bin mul` into a following `bin add` when the product has one use. How many instructions are saved?
3. Make the VM have only 2 registers and add spills (`store r, slot` / `load slot`).

## Further reading

- Poletto & Sarkar, *Linear Scan Register Allocation* (TOPLAS 1999)
- [Cornell CS 6120](https://www.cs.cornell.edu/courses/cs6120/2025fa/self-guided/): the lessons on SSA and register allocation
