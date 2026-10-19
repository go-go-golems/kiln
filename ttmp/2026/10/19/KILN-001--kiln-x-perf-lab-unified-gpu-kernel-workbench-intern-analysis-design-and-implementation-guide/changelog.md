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

## 2026-10-19

Phase 3b/3c: views on records (Perf, Knobs, Kernels, Devices, new Evidence view, shared marks) and the WebGPU repetition protocol (7×20, seeded order, fresh device per kernel-repetition, coarse timers partial); review fixes incl. WGSL tanh clamp (NaN on Metal) and kiln-codegen/2

### Related Files

- /Volumes/SSD/code/kiln/apps/workbench/src/ui/marks.jsx — value cells and marks
- /Volumes/SSD/code/kiln/packages/kiln/src/std/devices.js — runProtocol and WebGpuDevice.measureKernels

## 2026-10-19

Phase 5a: apps/server (Hono + node:sqlite; Host/Origin/token/JSON checks; records, devices, jobs with proposed→approved→running, agent budget; SSE; local/SSH CUDA runner executor), runner stdin/stdout mode, page-side client (not yet wired); repetitionOrder and the output check moved into @kiln/evidence (protocol.ts) so page and server share one copy

### Related Files

- /Volumes/SSD/code/kiln/apps/server/src/jobs.ts — job validation, state machine and repetition protocol
- /Volumes/SSD/code/kiln/apps/server/src/security.ts — Host, Origin, token and content-type checks
- /Volumes/SSD/code/kiln/packages/evidence/src/protocol.ts — repetitionOrder and checkSamples, shared by page and server

## 2026-10-19

Vault report (phases 0–5a) pushed as playback-vault 534ff7f. CUDA device ids no longer depend on the route: the runner reports hostname, cudaDevice() in @kiln/evidence builds the identity for page and server; live CudaDevice runs send X-Kiln-Token

### Related Files

- /Volumes/SSD/code/kiln/packages/evidence/src/identity.ts — cudaDevice, the one CUDA identity rule

## 2026-10-19

Phase 6a: measurePaired (one kernel under two schedules in one protocol run, shared pairId) and kernelPinPolicy in Kiln; verdict treats null predicates as undecided, with below/above three-valued interval helpers; W-05 and W-19 predicates three-valued

### Related Files

- /Volumes/SSD/code/kiln/packages/kiln/src/std/tune.js — measurePaired and kernelPinPolicy
- /Volumes/SSD/code/kiln/packages/kiln/test/paired.mjs — paired vs unpaired under a clocked fake GPU

## 2026-10-19

Phase 6 done-condition met on the M1 Pro: paired WebGPU comparison of W-05's thread and row schedules, ratio 0.0079 [0.0072, 0.0083] n=7, W-05 open → supported (test:paired)

### Related Files

- /Volumes/SSD/code/kiln/apps/workbench/test/paired-webgpu.mjs — the Phase 6 done-condition on the local GPU

## 2026-10-19

Phase 4 complete: Hypotheses view, notes cards (hypothesis fences), lab:hypothesis, W-05 pin-and-measure link (worker diary reference/06); ev.ratio labels keep the filtered knobs (MAP=thread,TPB=128)

### Related Files

- /Volumes/SSD/code/kiln/apps/workbench/src/ui/Hypotheses.jsx — the Hypotheses view and the notes card
- /Volumes/SSD/code/kiln/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/reference/06-phase4-ui-diary.md — Phase 4 UI worker diary

## 2026-10-19

Phase 6b: Compare panel in the Perf view (wb.compare → measurePaired → ev.ratio); pipelineFor uses the shared kernelPinPolicy. Diary Step 16.

### Related Files

- /Volumes/SSD/code/kiln/apps/workbench/src/ui/Perf.jsx — ComparePanel
- /Volumes/SSD/code/kiln/apps/workbench/src/ui/wb.js — compare and the shared pin policy

## 2026-10-19

Phase 5b: page–server integration (records sync, server CUDA devices, Measure as a job, Jobs view, server line in Devices); DevicesView hides the runner block for server devices. Worker diary 07; main diary Step 17.

### Related Files

- /Volumes/SSD/code/kiln/apps/workbench/src/server-sync.js — records sync and server devices
- /Volumes/SSD/code/kiln/apps/workbench/src/ui/Jobs.jsx — Jobs view

## 2026-10-19

Phase 7: agent eval code runs in a worker inside a sandboxed opaque-origin frame (CSP refuses every connection; no document to navigate) and reaches the page through one MessagePort; agent-written scripts are held until the user runs them; the server model gateway writes one llm_calls row per call. agent-e2e.mjs proves the done-condition in Chrome. Gateway worker diary 08; main diary Step 18.

### Related Files

- /Volumes/SSD/code/kiln/apps/server/src/agent.ts — model gateway and llm_calls
- /Volumes/SSD/code/kiln/apps/workbench/src/agent/agent.js — answer loop, pageCall, held scripts
- /Volumes/SSD/code/kiln/apps/workbench/src/agent/frame.js — the eval's runtime in the worker
- /Volumes/SSD/code/kiln/apps/workbench/src/agent/sandbox.js — frame document, CSP, port server
- /Volumes/SSD/code/kiln/apps/workbench/src/compile.js — the compile path shared by page and worker
- /Volumes/SSD/code/kiln/apps/workbench/test/agent-e2e.mjs — browser done-condition test

## 2026-10-19

Vault report 2 (phases 4c, 5b, 6, 7) pushed: playback-vault 43572ed. Phase 7 code commit 55e6b2e recorded in diary Step 18.
