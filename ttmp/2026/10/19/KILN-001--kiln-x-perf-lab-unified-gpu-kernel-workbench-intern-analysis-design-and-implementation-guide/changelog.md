# Changelog

## 2026-10-19

- Initial workspace created

## 2026-10-19

Analysis by four readers (sources/01-04, 5,288 lines of notes) and the intern guide design-doc/01 (Parts 0-VI: both systems, weaknesses K-1..K-18 and P-1..P-16, unified design with decisions D1-D13, phased plan).

### Related Files

- /Volumes/SSD/code/kiln/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/design-doc/01-kiln-x-perf-lab-intern-guide-to-the-unified-gpu-kernel-workbench.md — the guide

## 2026-10-19

Phase 0: pnpm workspace; Kiln moved into packages/kiln and apps/workbench; React/KaTeX bundled; run-node-tests and shoot scripts

## 2026-10-19

Phase 1: six stylesheets by concern (tokens/base/chrome/views/evidence/utilities); token values adjusted to pass WCAG (contrast.mjs); gutter/dtabs/reduced-motion fixes; evidence marks and specimen page; useLab moved to useSyncExternalStore (lost-bump race)

### Related Files

- /Volumes/SSD/code/kiln/apps/workbench/src/ui/evidence.css — provenance marks, stamps, title block, series
- /Volumes/SSD/code/kiln/apps/workbench/src/ui/tokens.css — unified tokens
- /Volumes/SSD/code/kiln/scripts/contrast.mjs — WCAG check of token pairs

## 2026-10-19

Phase 2: @kiln/evidence (values, stats, sha256, canonical JSON, identity, kiln-measure/1 records, verdict), 111 tests; review fixed nested/frozen read tracking in verdict; guide §29.3, §32.1 and Appendices B and C updated to the shipped code

### Related Files

- /Volumes/SSD/code/kiln/packages/evidence/src/record.ts — kiln-measure/1 record and validation
- /Volumes/SSD/code/kiln/packages/evidence/src/verdict.ts — the one verdict implementation
- /Volumes/SSD/code/kiln/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/reference/02-phase2-evidence-diary.md — subagent diary

## 2026-10-19

Phase 4b: hypotheses in W-05, W-19, W-25 (headless verdicts open → supported/refuted); content ids no longer depend on kernel names (canonicalSource, seedOf by identity), fixing duplicate kernels reading stale; W-25 check moved to records, Spearman with average ranks

### Related Files

- /Volumes/SSD/code/kiln/apps/workbench/presets/W-25-model-vs-measurement.js — hypotheses and fixed check
- /Volumes/SSD/code/kiln/packages/evidence/src/identity.ts — canonicalSource
