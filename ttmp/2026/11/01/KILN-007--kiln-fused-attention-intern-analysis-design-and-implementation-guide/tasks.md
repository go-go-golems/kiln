# Tasks

## TODO
- [ ] Phase 0: write probe 676 (f16/bf16 SDPA backend, P rounding, scale placement, fully masked rows) and run it on the GB10 host <!-- t:uia9 -->
- [ ] Phase 1: matchSoftmaxContraction recognizer in packages/kiln/src/std/attention.js with positive/negative unit tests (CPU) <!-- t:rivl -->
- [ ] Phase 2: fuse_attention rule before merge_loop_ops plus pipeline attention option; composed SDPA compiles to one loop.kernel (CPU) <!-- t:pmjy -->
- [ ] Phase 3: MAP=flash Tile mapping with BR/BC knobs, smem legality, launch and estimate branch (CPU) <!-- t:0iwj -->
- [ ] Phase 4: matFlash Kernel IR materializer; simulateKernel on all legal options, ragged shapes, masks, fully masked row; NVRTC compile (CPU) <!-- t:tg1m -->
- [ ] Phase 5: GPU qualification: family-5 replay fused vs composed, ptxas registers/spills, timing; flip default if no regressions <!-- t:9aq2 -->
- [ ] Phase 6: low-precision P rounding (pRound) from probe 676; requalify f16/bf16 graphs <!-- t:mhxb -->
- [ ] Deferred: causal masks after KILN-010, GQA after KILN-011, tensor-core inner products after KILN-006 <!-- t:l33y -->
