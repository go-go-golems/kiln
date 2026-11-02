# Tasks

## TODO
- [ ] Phase 0: write probe 676 (f16/bf16 SDPA backend, P rounding, scale placement, fully masked rows) and run it on the GB10 host <!-- t:uia9 -->
- [x] Phase 1: matchSoftmaxContraction recognizer in packages/kiln/src/std/attention.js with positive/negative unit tests (CPU) <!-- t:rivl -->
- [x] Phase 2: fuse_attention rule before merge_loop_ops plus pipeline attention option; composed SDPA compiles to one loop.kernel (CPU) <!-- t:pmjy -->
- [x] Phase 3: MAP=flash Tile mapping with BR/BC knobs, smem legality, launch and estimate branch (CPU) <!-- t:0iwj -->
- [x] Phase 4: matFlash Kernel IR materializer; simulateKernel on all legal options, ragged shapes, masks, fully masked row; NVRTC compile (CPU) <!-- t:tg1m -->
- [ ] Phase 5: GPU qualification: family-5 replay fused vs composed, ptxas registers/spills, timing; flip default if no regressions <!-- t:9aq2 -->
- [ ] Phase 6: low-precision P rounding (pRound) from probe 676; requalify f16/bf16 graphs <!-- t:mhxb -->
- [ ] Deferred: causal masks after KILN-010, GQA after KILN-011, tensor-core inner products after KILN-006 <!-- t:l33y -->
- [ ] Phase 0b: run probe 676 on the GB10 (script written; CPU dry run in sources/probe-676-cpu-dry-run: fully masked rows are 0 on CPU) <!-- t:rimo -->
- [ ] Follow-up: attention-aware exact serial evaluator so kiln-export's end-to-end check covers fused attention at realistic shapes <!-- t:ijs6 -->
- [ ] Follow-up: mma product in flash-kernel.js after KILN-006 merges (mma geometry, [e][key] K tile, element-keyed partial maxima) <!-- t:dvnx -->
