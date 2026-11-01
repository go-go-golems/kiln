# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01

Design guide for direct writes of mutated inputs (launch-order + same-index proof over kiln-program/1, alias-safe CUDA, buffer compaction, CPU program oracle) and the family 162 matcher fixes (return kept in-place results; canonicalize __eq__), with CPU reproductions in scripts/01-04; diary in investigation format. Implementation not started.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-009--kiln-direct-writes-of-mutated-inputs-intern-analysis-design-and-implementation-guide/design-doc/01-direct-writes-of-mutated-inputs-analysis-design-and-implementation-guide.md — the guide
- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-009--kiln-direct-writes-of-mutated-inputs-intern-analysis-design-and-implementation-guide/scripts/03-match-fixed-162-pattern.py — CPU check that both 162 fixes give exactly one match

## 2026-11-01

Implemented Phases 1-4 on CPU (commits 15d3344, 78f5f1b): inplace.js launch-order/same-index proofs with enumerated store addresses and a barrier rule for row kernels; toCuda alias option; program-sim.js aliasing oracle; --mutation-strategy auto|writeback. Corpus: 113/114 mutations direct; oracle 84 ok, 0 hazards. Family 162: kept in-place results returned, __eq__ canonicalized; census agreement 1984/1984; meta-device match 6/6.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/kiln-009-mutated-inputs/packages/kiln/src/std/inplace.js — in-place proofs and rewrite
- /home/manuel/code/wesen/kiln/worktrees/kiln-009-mutated-inputs/packages/kiln/src/std/program-sim.js — CPU program oracle with aliasing hazard check
