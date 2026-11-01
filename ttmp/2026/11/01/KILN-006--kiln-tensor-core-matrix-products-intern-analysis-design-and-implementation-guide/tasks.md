# Tasks

## TODO
- [ ] Phase 0 (GPU): mma layout and tensor-throughput probe on GB10; set targets.js gb10.mma <!-- t:i7s0 -->
- [x] Phase 1 (CPU): mma.js with MMA_OPS, accLayout, MMA.run emulator and layout/bijection tests <!-- t:8ht2 -->
- [x] Phase 2 (CPU): Kernel IR mma statement; toCuda inline PTX, toSim warp emulation, WGSL refusal; tests <!-- t:1ump -->
- [x] Phase 3 (CPU): operandPrecision, mmaPlan, MAP=mma with WM/WN knobs, matMma; pinned simulateKernel tests <!-- t:klbe -->
- [x] Phase 4 (CPU): cost model tensor term, per-precision rates, regsEstimate; default-unchanged tests <!-- t:o4p7 -->
- [ ] Phase 5 (GPU): NVRTC sm_121 compile and launcher checks; PassBench replay of matrix-heavy families; recalibrate <!-- t:fhaf -->
- [x] Write intern design guide and diary (this ticket's research deliverable) <!-- t:8al0 -->
- [x] GPU handoff: script 02 writes Phase 0 layout probes and Phase 5 MAP=mma fixtures for kiln_launch.py check-fixtures --backend cuda <!-- t:y9uy -->
- [ ] Future: split-K accumulators if GPU shows large-K drift (simulated chunk-rz fails tolerance at K>=4096) <!-- t:9fxh -->
- [ ] Future: f16/bf16 packing in runtime/python kiln_launch.py _packed/_host so f16/bf16 mma fixtures can run through check-fixtures <!-- t:7cca -->
