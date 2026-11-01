# Tasks

## TODO
- [x] Write the intern analysis/design/implementation guide and investigation diary (done: design-doc/01, reference/01-diary) <!-- t:4v8u -->
- [ ] Phase 0: typed splats (N.const dtype, N.full/zeros/ones); foldSplatView and foldSplatEw keep dtype <!-- t:tnml -->
- [ ] Phase 1: E.ix through Loop IR (akey, free, substE, printE, schedule, workOf, compileSerial/Point, inlineInto) with int32 interval check <!-- t:eud4 -->
- [ ] Phase 1: Kernel IR {k:ix} (emitNest, valueTypes, printer), CUDA spelling, WGSL refusal, tile.js contraction kinds, IX.emit floor spelling for negative dividends <!-- t:ozpu -->
- [ ] Phase 1: simulator integer temporaries and typed output storage (emit.js toSim, program.js simulateKernel) <!-- t:xvbu -->
- [ ] Phase 2: tensor.ixval, lift_ixval, fold_view_of_ixval, nn.arange; cumsum and concat masks via ixval; integer/bool concat <!-- t:p5kc -->
- [ ] Phase 3: nn.assign (select with clamped reads) and importer: factory-preserving tracer with __setitem__, factory/meshgrid/repeat lowerings, setitem, in-place on views, contiguous freshness, abs_i64 <!-- t:qcm8 -->
- [ ] Phase 3: rerun the import census for the BEiT, ConViT and MPNet families (17 get_attr graphs) and new_zeros graphs <!-- t:zbmt -->
- [ ] Phase 4: nn.argmax via NaN-aware index key; lower_max_min returns indices; per-dtype treeCombine arrays <!-- t:kxnc -->
- [ ] Phase 5: causal SDPA via N.causalMask in lower_sdpa <!-- t:evcp -->
- [ ] Phase 6 (GPU host): NVRTC compile of new kernel shapes; PassBench replays after resolving Q1 (pattern tracer and factory nodes) <!-- t:qvxn -->
