# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01

Delivered intern design guide and investigation diary: E.ix index values, tensor.ixval, factory ops, nn.assign slice assignment, argmax key, causal mask, cumsum mask. Evidence: the 17 get_attr graphs are folded factory code (symbolic trace), Dynamo keeps factory nodes; BEiT/ConViT tables verified as closed-form coordinate expressions; argmax/causal semantics probed on CPU. Found typed-splat dtype loss, float-only simulator, shared s_red across dtypes.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-010--kiln-index-values-factory-ops-and-slice-assignment-intern-analysis-design-and-implementation-guide/design-doc/01-index-values-factory-ops-and-slice-assignment-analysis-design-and-implementation-guide.md — Design guide
- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-010--kiln-index-values-factory-ops-and-slice-assignment-intern-analysis-design-and-implementation-guide/reference/01-diary.md — Investigation diary (5 steps)

## 2026-11-01 - Implementation phases 0-5 (CPU)

E.ix/tensor.ixval through every stage; integer SIMT simulation; per-dtype s_red; arange/full/zeros/ones/meshgrid/repeat; nn.assign; setitem and in-place writes through basic views; argmax/argmin; causal SDPA. Census: the 20 get_attr/new_zeros records import (BEiT/ConViT/MPNet/GAE factory outputs equal eager PyTorch exactly); full census 1931 -> 1961 imported, 0 regressions. Commits 50f9c3a, 24207fb, 5181a20.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/kiln-010-index-values/integrations/passnet/fx_assign.py — basic-index regions for slice assignment
- /home/manuel/code/wesen/kiln/worktrees/kiln-010-index-values/integrations/passnet/fx_import.py — factory, setitem and view-write lowerings
- /home/manuel/code/wesen/kiln/worktrees/kiln-010-index-values/packages/kiln/src/std/emit.js — CUDA ix spelling and integer simulator
- /home/manuel/code/wesen/kiln/worktrees/kiln-010-index-values/packages/kiln/src/std/loop.js — E.ix and Loop IR cases
- /home/manuel/code/wesen/kiln/worktrees/kiln-010-index-values/packages/kiln/src/std/tensor.js — ixval, factories, assign, argmax
