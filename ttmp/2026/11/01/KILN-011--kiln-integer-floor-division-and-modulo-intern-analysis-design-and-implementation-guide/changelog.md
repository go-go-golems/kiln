# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01

Delivered intern design guide for integer floor division, modulo, trunc division and fmod (typed FNS functions, resolveEw rules, CUDA helpers with explicit INT_MIN/-1, exact i64 folding prerequisite, importer mappings; CPU-first phases). Reference and C helper pseudocode validated against PyTorch CPU on 31974 cases with 0 mismatches. Corpus: no census graph needs it; 25 sole-op graphs do. Diary steps 1-5 recorded.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-011--kiln-integer-floor-division-and-modulo-intern-analysis-design-and-implementation-guide/design-doc/01-integer-floor-division-and-modulo-analysis-design-and-implementation-guide.md — Design guide
- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-011--kiln-integer-floor-division-and-modulo-intern-analysis-design-and-implementation-guide/scripts/01-census-div-mod.py — Corpus demand evidence

## 2026-11-01 - Implementation: Phases 0-3 and Phase 4 CPU prep

Implemented on branch impl/kiln-011-floordiv-mod (commits e1fad06, f83c346, b093150, a2dfa44, 7c4ca98): exact int64 literals through loop-level folding and the serial evaluator; typed floordiv/remainder/truncdiv/fmod over i32/i64 with CUDA helpers; integer true division to f32; importer mappings; float32 division functions; GPU replay script and fixtures. 25/25 upstream tensor-division graphs import and match PyTorch CPU exactly. GPU validation remains.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/kiln-011-floordiv-mod/integrations/passnet/check_integer_division_cuda.py — GPU replay check
- /home/manuel/code/wesen/kiln/worktrees/kiln-011-floordiv-mod/integrations/passnet/fx_import.py — division lowering
- /home/manuel/code/wesen/kiln/worktrees/kiln-011-floordiv-mod/packages/kiln/src/std/fns.js — typed and f32 division functions, CUDA_HELPERS
- /home/manuel/code/wesen/kiln/worktrees/kiln-011-floordiv-mod/packages/kiln/src/std/loop.js — exact BigInt literals, folding, evaluator literal spelling
- /home/manuel/code/wesen/kiln/worktrees/kiln-011-floordiv-mod/packages/kiln/src/std/tensor.js — resolveEw rules, N.div rounding, splat folds keep dtype
