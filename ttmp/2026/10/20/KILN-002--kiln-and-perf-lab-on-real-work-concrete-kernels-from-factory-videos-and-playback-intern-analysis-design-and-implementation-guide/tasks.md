# Tasks

## TODO
- [x] Guide: research notes, intern guide, upload to reMarkable <!-- t:rn6b -->
- [x] P0.1 floor function in the Kiln function table (JS, CUDA, WGSL) with tests <!-- t:75h3 -->
- [x] P0.2 8-bit (u8) tensor inputs: CUDA and WGSL loads, reference unchanged, tests <!-- t:c9ml -->
- [x] P0.3 kiln-program/1 export (kernels in launch order, buffers, dispatch, identities) and CLI <!-- t:lhbi -->
- [x] P0.4 TypeScript WebGPU launcher for kiln-program/1 <!-- t:odvs -->
- [x] P0.5 Python launcher kiln_launch.py with wgpu and cuda (ctypes NVRTC + driver) backends <!-- t:e0iq -->
- [x] P0.6 identity suffix on emitted kernel names <!-- t:dc6h -->
- [x] A1 browser baseline of similarityMatrix at n 400/691/1385/2297, d 256/768 <!-- t:4cf6 -->
- [x] A2 W-26 window-similarity preset and bucket exports <!-- t:qyni -->
- [x] A3 factory-videos branch: GPU launcher, async hook, incremental row, ImageData painter, cap <!-- t:5ihi -->
- [x] A4 paired measurement, quality gate, kiln-paired/1 record, screenshots <!-- t:xmpi -->
- [x] B1 motion stage split on the Mac (status.service_ms) and to_gray microbenchmark; verdict gray-is-worth-a-kernel <!-- t:x723 -->
- [ ] B2 W-27 motion-grey program with Pillow weight tables; exports for 1080p and 4K — NOT STARTED: B1 refuted gray-is-worth-a-kernel on the Mac; reopen only if PN shows otherwise on the Spark <!-- t:vvou -->
- [ ] B3 agreement on golden clips through the wgpu launcher — NOT STARTED: B1 refuted gray-is-worth-a-kernel on the Mac; reopen only if PN shows otherwise on the Spark <!-- t:qd9y -->
- [ ] B4 backend parameter and kiln.motion_gray registration; motion tests on both backends — NOT STARTED: B1 refuted gray-is-worth-a-kernel on the Mac; reopen only if PN shows otherwise on the Spark <!-- t:bufi -->
- [ ] B5 paired whole-run comparison on the Mac — NOT STARTED: B1 refuted gray-is-worth-a-kernel on the Mac; reopen only if PN shows otherwise on the Spark <!-- t:1no6 -->
- [x] C1 redaction mask-post program (buckets x geometries) <!-- t:xore -->
- [x] C2 reference agreement on the Mac against Playback's own functions <!-- t:zp1a -->
- [x] C3 Playback branch: REDACTION_MASK_POST, CUDA launcher, collect-path change, unit test — Playback cdfb0d8c9 on perf/kiln-002-redaction-mask-post; the docker-compose.yml line is uncommitted (the stream-engine hook cannot pass on macOS; see diary Step 6) <!-- t:g3cs -->
- [ ] C4 GPU host validation: judge, ground truth, validate_on_host.sh — GB10 DONE on bling (Step 12): every correctness gate passes, throughput 0.974/0.971/0.968 at concurrency 1/4/8, gb10-unchanged-or-better REFUTED; RTX PRO 6000 (post-moves-to-gpu) OPEN: needs SSH to playback@playback-rtx-dev <!-- t:dyb3 -->
- [ ] PN NVIDIA session: runner smoke test, target specs, B on Spark — smoke test DONE (18/18 on bling, Steps 11-12); gb10 spec DONE (3c71c0d), but it chooses slower W-28 schedules than rtx5090 (Step 12); B on Spark NOT DONE (bling has no Factory Videos runtime; dgx runs factory-live) <!-- t:tpbv -->
- [ ] PE kiln-paired/1 importer, lab programs per example, corresponds_to edges — BLOCKED: the importer belongs in Perf Lab lab-workbench/server/runner.ts, which this ticket must not modify; Kiln's server answers lab job execution with 501 and has no executor for plan status 'import'. Records are ready in various/a4/records/ <!-- t:mo71 -->
- [x] PR vault report per example with measurements, verdicts and screenshots — vault 594f801, Projects/2026/10/20/ (Examples A, B, C) <!-- t:jram -->
- [x] PN.1 kiln_launch.py cuda backend: run the fixture check on an NVIDIA host (written, untested on hardware) <!-- t:6tbh -->
- [ ] C4.d Find what the candidate's preprocess step waits on under load on the GB10 (py-spy dump of the inference thread, in_flight sampling, nsys) before any further GPU stage (guide §21) <!-- t:3nev -->
