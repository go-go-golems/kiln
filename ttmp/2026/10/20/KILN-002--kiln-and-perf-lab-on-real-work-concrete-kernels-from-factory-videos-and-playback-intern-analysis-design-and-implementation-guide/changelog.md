# Changelog

## 2026-10-20

- Initial workspace created

## 2026-10-20

Research notes (three agents) and the intern guide: 30 sections, three worked examples, phased plan

## 2026-10-20

P0 done (f272c11, aa0f0b4): N.floor; u8 inputs (k.tensor(shape, 'u8'), fp32 identities unchanged); kiln-program/1 export + CLI; WebGPU (TS) and Python (wgpu, cuda) launchers; identity-suffixed symbols. Both launchers pass 5 fixture cases on the M1 Pro; the cuda backend is untested until PN.

### Related Files

- /Volumes/SSD/code/kiln/packages/kiln/src/std/export.js — kiln-program/1 export
- /Volumes/SSD/code/kiln/runtime/python/kiln_launch.py — Python launcher (wgpu, cuda)
- /Volumes/SSD/code/kiln/runtime/webgpu/launch.ts — TypeScript WebGPU launcher

## 2026-10-20

Example A done on the M1 Pro: W-26 window-similarity preset and 12-program set (846282e); factory-videos branch FACTORY-KILN-001--gpu-kernels 3bc92785 computes the matrix on WebGPU above 400 windows, incremental CPU below, ImageData painter. GPU/CPU 0.029 [0.024, 0.031] at 1,385x768; GPU+paint 76-79 ms at 2,297x768; quality gate pass (max |d| 2.2e-6). Verdicts gpu-rebuild-1385 and cap-lift-interactive supported.

### Related Files

- /Volumes/SSD/code/factory-videos-kiln/web/live/views/similarity/similarityGpu.ts — A3 GPU path in factory-videos
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/scripts/similarity-bench.mjs — A1/A4 harness (baseline, paired, gate, shot)
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/a4/paired-m1pro-v2.json — A4 paired measurement (final painter)
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/a4/records/verdicts.json — A4 verdicts

## 2026-10-20

B1 on the M1 Pro: gray-is-worth-a-kernel REFUTED (motion.gray 9.3 % of session; a zero-cost grey saves nothing as shipped). 90 % of a motion run is single-threaded videoconvert NV12->RGB (4.4 ms/frame vs 0.49 ms VideoToolbox decode); videoconvert n-threads=4 makes the run 2.75x faster but changes 1.2 % of grey pixels by 1. B2-B5 not started per the guide's rule.

### Related Files

- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/scripts/motion-split.py — B1 harness (runs, decode, gray)
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/b1/verdict.json — B1 verdict with the free-grey oracle
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/screenshots/b1-motion-split-m1pro.png — B1 stage split figure

## 2026-10-20

Example C, C1–C3: W-28 mask post-processing is bit-exact with Playback (0 of 67.3 M reference pixels on 3 platforms, 0 of 269 M kernel pixels via wgpu); Playback cdfb0d8c9 adds REDACTION_MASK_POST=kiln with refusals and a load-time self-check; all 48 kernels compile with NVRTC 13.2 for sm_120/sm_121. Not run on an NVIDIA GPU (C4, PN.1 need permission). PE blocked by the lab-workbench constraint.

### Related Files

- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/scripts/mask-post-timing-figure.py — C2 timing figure across three geometries
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/scripts/nvrtc-compile-check.py — NVRTC-only compile check of a kiln-program-set
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/c3/nvrtc-13.2-arm64.json — 96/96 NVRTC 13.2 compiles, sm_120 and sm_121
- /Volumes/SSD/code/playback-kiln-002/services/redaction/src/mask_post.py — Playback consumer of the W-28 program set

## 2026-10-20 - GB10 hosts: first NVIDIA run, launcher fix, timing

Step 8–9: W-28 kernels pass Playback's test file inside the redaction image on a GB10 (25/25); launcher context bug fixed (7bcfc06), fixtures pass on bling; GB10 timing of the kiln mask path (0 differing pixels; 6.8x faster than the CPU loop at 100 masks, 768x416); executor probe of bling; bench recordings for C4

### Related Files

- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/scripts/make-bench-recordings.sh — recorder-shaped bench tree from factory footage
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/scripts/mask-post-cuda-time.py — timing script run inside the redaction image
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/c4/mask-post-cuda-time-dgx.json — GB10 timing of REDACTION_MASK_POST=kiln vs the CPU loop

## 2026-10-20 - kiln-perf image; gb10 target; runner u8; PN smoke test

Steps 10–11: kiln-perf image (runner/docker, Kiln 3c71c0d) self-tests 5/5 on two GB10 hosts; kiln-probe measures 259 GB/s read, 28.9 TFLOP/s FMA, 2.4 us launch on an idle DGX Spark; gb10 SPECS entry (was falling back to the RTX 5090's 1792 GB/s); runner gains u8 inputs; PN smoke test 18/18 on bling natively and through the image; gb10's W-28 schedules 4674 us vs fallback 9816 us; Kiln's model over-predicts W-28 6.6–115x (gather charged as uncoalesced)

### Related Files

- /Volumes/SSD/code/kiln/runner/docker/README.md — kiln-perf image
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/scripts/gb10-spec-check.mjs — spec comparison script
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/pn/gb10-spec-check.md — gb10 vs fallback schedules, model vs measured

## 2026-10-20 - C4 on the DGX Spark: correct, 3 % slower

Step 12: the C3 branch's own redaction image built on bling (ac835daa); mask-post tests 25/25 and 0 differing pixels in the timing run there; validate_on_host.sh with REDACTION_MASK_POST=kiln passes every correctness gate but the candidate is 2.6-3.2 % slower at concurrency 1/4/8 (gb10-unchanged-or-better refuted); stage timers: post-pass -1.0 ms/frame, preprocess +3.1 ms/frame; the ground-truth gate does not exercise the GPU path. Also: the shipped set's rtx5090 schedules beat the measured gb10 spec's on the GB10 (b8534b2).

### Related Files

- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/scripts/c4-diag.sh — re-runs both arms and keeps their stage timers
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/c4/diag-bling/timing-b.txt — candidate stage timers
- /Volumes/SSD/code/kiln/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/various/c4/validate-bling/throughput.txt — C4 paired throughput on bling
