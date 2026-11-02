# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01

Design doc and diary for fused (flash-style) attention. CPU experiments show the fully fused SDPA is already one Loop IR expression (same values, 1543 vs 44.1 us modelled on gb10 under existing maps); design: recognizer + fuse_attention + MAP=flash + matFlash; phases 0-6 added as tasks.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-007--kiln-fused-attention-intern-analysis-design-and-implementation-guide/design-doc/01-fused-attention-analysis-design-and-implementation-guide.md — the guide
- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-007--kiln-fused-attention-intern-analysis-design-and-implementation-guide/scripts/03-forced-fusion-single-kernel.mjs — key experiment

## 2026-11-01

Implemented Phases 1-4 (recognizer, loop/attention pass with cost gate, MAP=flash with BR/BC/RM, register-tiled matFlash, --attention plumbing); NVRTC 99/99 on compute_121/89; probe 676 written, CPU dry run shows fully masked SDPA rows are 0, fixed via N.safeSoftmax. Commits c6a4634..b21c7a5.
