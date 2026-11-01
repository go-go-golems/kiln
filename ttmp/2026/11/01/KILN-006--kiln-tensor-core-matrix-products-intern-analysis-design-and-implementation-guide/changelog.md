# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01

Added the intern design guide for tensor-core matrix products (MAP=mma over mma.sync TF32/f16/bf16, FP32 accumulate; CPU-only build and validation path), the investigation diary and probe script 01. Found that TF32 rounding is not fused into contractions, so legality uses operand-producer provenance.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-006--kiln-tensor-core-matrix-products-intern-analysis-design-and-implementation-guide/design-doc/02-tensor-core-matrix-products-analysis-design-and-implementation-guide.md — Design guide
- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-006--kiln-tensor-core-matrix-products-intern-analysis-design-and-implementation-guide/scripts/01-print-linear-contraction.mjs — Loop IR probe
