# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01

Added the intern design guide for tensor-core matrix products (MAP=mma over mma.sync TF32/f16/bf16, FP32 accumulate; CPU-only build and validation path), the investigation diary and probe script 01. Found that TF32 rounding is not fused into contractions, so legality uses operand-producer provenance.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-006--kiln-tensor-core-matrix-products-intern-analysis-design-and-implementation-guide/design-doc/02-tensor-core-matrix-products-analysis-design-and-implementation-guide.md — Design guide
- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-006--kiln-tensor-core-matrix-products-intern-analysis-design-and-implementation-guide/scripts/01-print-linear-contraction.mjs — Loop IR probe

## 2026-11-01

Implemented Phases 1-4 on CPU (branch impl/kiln-006-tensor-cores): mma.js atom table and warp emulator; Kernel IR mma statement with CUDA inline PTX, WGSL refusal and simulator emulation; MAP=mma (mmaPlan legality over copy/round_* operand chains, WM/WN knobs, matMma from reusable warp-tile helpers); estimateMma and a tensor resource in timeModel, gated so defaults are unchanged without measured rates. Default compiles byte-identical to 373766b on 36 program/target/precision combinations. GPU fixtures script 02 for the coordinator.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/kiln-006-tensor-cores/packages/kiln/src/std/mma.js — atom table
- /home/manuel/code/wesen/kiln/worktrees/kiln-006-tensor-cores/packages/kiln/src/std/tile.js — MAP=mma
