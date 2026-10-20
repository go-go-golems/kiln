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
