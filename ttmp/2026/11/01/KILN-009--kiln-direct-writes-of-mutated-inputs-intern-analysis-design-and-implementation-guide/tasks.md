# Tasks

## TODO
- [x] Phase 1: planMutation + sameIndexSlots (IX.keyOf/loadsOf) in report-only mode; program.mutations[] records strategy and reason; table of direct/writeback decisions over the input-mutation corpus (CPU) <!-- t:67ba -->
- [x] Phase 2: simulateProgram CPU oracle over exported kiln-program/1 with shared buffers plus instrumented cross-thread read-after-write check (CPU) <!-- t:ww9b -->
- [x] Phase 3: retargetProducer, toCuda(K,{alias}) without __restrict__ on aliased params, distinct in-place identity, compactBuffers, --mutation-strategy auto|writeback; extend test/export.mjs (CPU) <!-- t:gezw -->
- [x] Phase 4: family 162 matcher fixes: drop_dead_statements returns kept unused in-place results, corpus.expose_inplace_results, __eq__ canonicalization in fx_normalize; rerun script 658 over the census (CPU, device-literal graphs need CUDA or --meta-device) <!-- t:yslq -->
- [ ] Phase 5: GPU replay of the 14 input-mutation families plus 162 and A/B timing of auto vs writeback; report 57/94/111/172/176 as shared-input limited (GPU) <!-- t:ao1l -->
- [ ] Phase 4 follow-up (CUDA host): rerun KILN-005 script 658 for samples 13, 124, 162, 170 (device literals / inf import block CPU capture) <!-- t:7ugt -->
- [ ] Oracle gaps: bool/int typed values in toSim (KILN-010) for task 45; sampled-block oracle for the 20 programs over the simulation budget <!-- t:moxf -->
