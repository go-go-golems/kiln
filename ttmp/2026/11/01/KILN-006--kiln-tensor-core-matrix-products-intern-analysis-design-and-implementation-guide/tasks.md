# Tasks

## TODO
- [ ] Phase 0 (GPU): mma layout and tensor-throughput probe on GB10; set targets.js gb10.mma <!-- t:i7s0 -->
- [ ] Phase 1 (CPU): mma.js with MMA_OPS, accLayout, MMA.run emulator and layout/bijection tests <!-- t:8ht2 -->
- [ ] Phase 2 (CPU): Kernel IR mma statement; toCuda inline PTX, toSim warp emulation, WGSL refusal; tests <!-- t:1ump -->
- [ ] Phase 3 (CPU): operandPrecision, mmaPlan, MAP=mma with WM/WN knobs, matMma; pinned simulateKernel tests <!-- t:klbe -->
- [ ] Phase 4 (CPU): cost model tensor term, per-precision rates, regsEstimate; default-unchanged tests <!-- t:o4p7 -->
- [ ] Phase 5 (GPU): NVRTC sm_121 compile and launcher checks; PassBench replay of matrix-heavy families; recalibrate <!-- t:fhaf -->
- [x] Write intern design guide and diary (this ticket's research deliverable) <!-- t:8al0 -->
