# Changelog

## 2026-11-01

- Initial workspace created

## 2026-11-01

Added the intern design guide for a cumsum scan primitive (tensor.scan, index-defined E.scan with a carried accumulator, scan fusion legality, sequential and block Hillis-Steele mappings from existing Kernel IR statements, cost-model branches; warp-shuffle and decoupled look-back deferred) with a CPU-only build/validation plan, the investigation diary and probe script 01. Probe findings: integer cumsum fails to materialize under MAP=tiled for probed rows >= 1024 (matTiled tv temporary, kernel.js:205), and the SIMT simulator cannot execute integer kernels.

### Related Files

- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/design-doc/01-cumsum-as-a-scan-primitive-analysis-design-and-implementation-guide.md — design guide
- /home/manuel/code/wesen/kiln/worktrees/passnet/ttmp/2026/11/01/KILN-008--kiln-cumsum-as-a-scan-primitive-intern-analysis-design-and-implementation-guide/scripts/01-inspect-cumsum-lowering.mjs — probe of the current lowering

## 2026-11-01

Implemented Phases 0 (tv fix), 1-5 and the Phase 7 CPU slice on impl/kiln-008-cumsum-scan (4bead0f, 79e2ebc, a07d481): tensor.scan, E.scan with a carried scan loop, scan fusion legality, thread/row scan mappings and estimates, cumprod/cummax/cummin; CPU compile gate 51/51 on the typed-slice3 families. GPU validation (Phase 6) remains.
