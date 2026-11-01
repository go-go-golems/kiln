# Tasks

## TODO
- [ ] Phase 0 (CPU): fix matTiled tv temporary naming (kernel.js:205) so i64 cumsum rows >= 1024 compile; add regression test <!-- t:mhb3 -->
- [ ] Phase 0 (CPU): extend toSim and simulator buffers to integer dtypes; simulate existing integer kernels <!-- t:yjg1 -->
- [ ] Phase 1 (CPU): add scanRef and tensor.scan; switch nn.cumsum decomposition to tensor.scan <!-- t:9a7a -->
- [ ] Phase 2 (CPU): add E.scan, liftScan, scheduler carried accumulator (step statement), serial/point evaluators, workOf <!-- t:3y3p -->
- [ ] Phase 3 (CPU): fusion legality for scan producers; position-id idiom fuses into one kernel <!-- t:tz38 -->
- [ ] Phase 4 (CPU): an.scan in analyze; scan branches in legalMaps, forkTree, launch, estimate, printTile; ranking tests <!-- t:cpmx -->
- [ ] Phase 5 (CPU): sequential and block (Hillis-Steele) scan materializers; simulator shape grid; f64-tolerance f32 checks <!-- t:mfwh -->
- [ ] Phase 6 (GPU host): compile CUDA on bling, rerun typed-slice3 replay, time against masked lowering and PyTorch <!-- t:533c -->
- [ ] Phase 7: cumprod, cummax/cummin values, logcumsumexp (logaddexp reducer), exclusive and reverse attributes <!-- t:gpwu -->
- [ ] Deferred: warp-shuffle scan (Kernel IR shfl) and decoupled look-back for very long rows <!-- t:0k8f -->
