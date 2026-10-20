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
