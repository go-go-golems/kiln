---
Title: 'Inventory notes E: design history of KILN and ML-PERF tickets'
Ticket: KILN-004
Status: active
Topics:
    - kiln
    - perf-lab
    - compiler
    - backend
    - frontend
    - evidence
    - workbench-ui
DocType: reference
Intent: long-term
Owners: []
RelatedFiles: []
ExternalSources: []
Summary: 'Design history of Kiln × Perf Lab from the six tickets that built it (ML-PERF-001..003 in Playback, KILN-001..003 in Kiln): a dated timeline matched to commits, per-ticket goals, decisions, results and open tasks, the decisions that were reversed within days, a glossary with source paths, component status (built / partial / planned / superseded), every place the two systems were copied, merged or linked, and the drift between what the tickets say and what the code holds.'
LastUpdated: 2026-10-21T11:00:00-04:00
WhatFor: Knowing why a Kiln or Perf Lab component exists, which ticket decided its shape, whether that decision still holds, and which copies and open tasks surround it, before splitting the system into reusable packages.
WhenToUse: Before moving, extracting or deleting a component that a KILN or ML-PERF ticket designed; before citing a ticket's task list or guide as current status; when a glossary term from the tickets needs its source.
---

> Provenance: drafted by agent E in the session scratchpad; moved here unreviewed by the orchestrator after agent E was
> stopped at the usage limit (`1d0c894`, 2026-10-21 10:42); completed by agent E afterwards (see
> `reference/11-diary-e-design-history-of-kiln-and-ml-perf-tickets.md`).

# Notes E — design history of Kiln × Perf Lab, reconstructed from the ticket workspaces

Compiled 2026-10-21 (read-only pass; nothing in either repository was changed). Input for KILN-004
("component inventory, duplication and complexity map").

## 0. Scope, sources and path abbreviations

| Abbrev. | Absolute path |
| --- | --- |
| `K/` | `/Volumes/SSD/code/kiln/` (kiln repo, branch `main`, HEAD `4d9adc2`, 66 commits) |
| `KT1/` | `K/ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/` |
| `KT2/` | `K/ttmp/2026/10/20/KILN-002--kiln-and-perf-lab-on-real-work-concrete-kernels-from-factory-videos-and-playback-intern-analysis-design-and-implementation-guide/` |
| `KT3/` | `K/ttmp/2026/10/20/KILN-003--one-execution-core-for-kiln-and-perf-lab-hosts-environments-workload-kinds-and-collectors/` |
| `KT4/` | `K/ttmp/2026/10/21/KILN-004--kiln-perf-lab-component-inventory-reusable-packages-duplication-and-complexity-map-intern-guide/` (created 2026-10-21 10:27, stub only) |
| `PB/` | `/Users/manuel.odendahl/code/tulip/playback/.worktrees/docs-ml-perf-001-perf-explorer/` (Playback worktree, branch `docs/ml-perf-001-perf-explorer`, HEAD `cdb84891c`) |
| `MP1/` | `PB/ttmp/2026/10/12/ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/` |
| `MP2/` | `PB/ttmp/2026/10/12/ML-PERF-002--studying-grounding-dino-pr-1005-in-the-perf-lab-evidence-import-images-detections-and-datasets/` |
| `MP3/` | `PB/ttmp/2026/10/12/ML-PERF-003--running-perf-lab-experiments-on-the-dgx-an-ssh-executor-for-containerized-gpu-captures/` (untracked in git) |
| `PK2/` | `/Volumes/SSD/code/playback-kiln-002/` (Playback worktree, branch `perf/kiln-002-redaction-mask-post`) |
| `FVK/` | `/Volumes/SSD/code/factory-videos-kiln/` (factory-videos worktree, branch `FACTORY-KILN-001--gpu-kernels`) |

Read directly: every `index.md`, `tasks.md`, `changelog.md`; the design docs' executive summaries, vocabularies,
architectures, decision records, phase plans, status sections and risk lists (`KT1/design-doc/01-…`, `KT2/design-doc/01-…`,
`KT3/design-doc/01-…`, `MP1/design/01..04`, `MP2/design/01-…`, `MP3/design/01-…`); `K/README.md`; `K/imports/Untitled.md`;
the git logs of `K`, `PB` (`main..HEAD`), `PK2` (`main..HEAD`), `FVK`; selected current source to check claims against code.
The long diaries (`KT1/reference/01..10`, `KT2/reference/01`, `KT3/reference/01`, `MP1/reference/01..04`,
`MP2/reference/01`, `MP3/reference/01`) were read by three parallel readers; their findings are folded in below
(section 2 per ticket, marked "diary").

---

## 1. Timeline

All times local (EDT, -0400) unless noted.

| When | Ticket / repo | What happened | Commits |
| --- | --- | --- | --- |
| 2026-10-12 14:57 | ML-PERF-001 (PB) | Ticket opened: intern guide for reproducible profiling of Grounding DINO PR 1005 and embedding PR 1008; 17 manuals + 28 pinned code/report sources archived | `e0b4e9ece` |
| 10-12 15:18–16:58 | ML-PERF-001 | `lab.js` language spec (design/02) and Lattice-Deck-derived UI design (design/03); prototype `experiments/lab-workbench` on synthetic data; round 2 (panes, one built-in assistant, MathJax 4, palette) | `888034eb2` … `320e1134b` |
| 10-12 17:30–18:24 | ML-PERF-001 | Backend end to end (design/04): Hono + `node:sqlite` lab server, PyTorch `sampler` workload on host `local`, runner, importer, live assistant via pi/lunaroute; E2E defects fixed | `bb25c9ad8` … `71e1d6f44` |
| 10-12 18:50–19:12 | ML-PERF-001 | Round 3: model menu, transcript library, YAML/JSON data blocks, Lab tab, bottom dock | `1d1af2586` … `d6274c408` |
| 10-12 19:45–20:46 | ML-PERF-002 (PB) | Evidence archives, public datasets/media, `detection-qualification/v1` importer, detections/gallery views, `dino-pr1005` preset, local CPU dino run at both revisions | `58af2c81c` … `cdb84891c` |
| 10-12 (guide LastUpdated 22:15) | ML-PERF-003 (PB, untracked) | SSH container executor for `playback@dgx` designed (phases 0–5), DGX inventoried read-only, guide uploaded to reMarkable. **Never implemented.** | none (untracked dir) |
| 2026-10-19 | `K/imports/Untitled.md` | Comparison memo "Kiln Workbench × Perf Lab (ML-PERF-001)" by Manuel Odendahl | imported in `92daa13` |
| 10-19 13:44 | KILN-001 (K) | Repo created; Perf Lab copied **verbatim** from `PB` at `cdb84891c` into `K/lab-workbench/`; Kiln zip imported into `K/imports/kiln-workbench-src/` | `92daa13` |
| 10-19 14:19 | KILN-001 | Four-reader analysis (`KT1/sources/01-04`, 5,288 lines) + intern guide (Parts 0–VI, K-1..K-18, P-1..P-16, D1–D13) | `14abe9f` |
| 10-19 14:27–16:42 | KILN-001 | Phases 0–7: pnpm workspace; visual language; `@kiln/evidence`; records in Kiln; hypotheses; server (Hono+SQLite, executors); paired WebGPU; agent sandbox + model gateway | `1b819d8` … `90300c3` |
| 10-19 17:13–18:12 | KILN-001 | Phase 8a–8c: `@kiln/lab` (port of Perf Lab language), `/api/lab` + importer, boards as dock views; 8d entity graph not started | `aa2dcc2` … `24ea2c2` |
| 2026-10-20 11:32 | KILN-002 (K) | Research notes (3 agents) + intern guide (30 sections, examples A/B/C) | `8044042` |
| 10-20 11:39–12:30 | KILN-002 | P0 (floor, u8, `kiln-program/1`, launchers, identity suffix); Example A done on the M1 Pro; B1 refutes `gray-is-worth-a-kernel` | `f272c11` … `0764e8d` |
| 10-20 12:49–13:33 | KILN-002 + PK2 | C1–C3: W-28 bit-exact with Playback; Playback branch `cdfb0d8c9` adds `REDACTION_MASK_POST=kiln` | `3aa8208`, `f17ed80`, `060bf8e`; PK2 `cdfb0d8c9` |
| 10-20 14:24–15:54 | KILN-002 + PK2 | First NVIDIA runs on GB10 (`bling`, `dgx`): launcher context fix (re-vendored into PK2 `ac835daa9`), `kiln-perf` image, `gb10` spec, PN smoke 18/18, C4 = correct but ~3 % slower | `7bcfc06` … `c800080`; PK2 `ac835daa9` |
| 10-20 16:15–17:30 | KILN-002 | `run-on-gpu-host.sh` (every GPU stage in one script); Kiln server on bling; record context (RC) | `450fbd0` … `0857384` |
| 10-20 20:18 | KILN-003 (K) | Guide v1: one execution core, **transports `local` and `ssh`** ("nothing listens on a GPU host") | `e5d9e7f` |
| 10-20 20:16 (00:16Z 10-21) | ML-PERF-003 | Closed as **superseded** by KILN-003 (docmgr close receipt `MP3/.docmgr-operations/close-d581c…json`) | — |
| 10-20 20:41 | KILN-003 | Guide v2: **one unauthenticated HTTP driver API on every host replaces local and SSH transports** | `e63e15c`, `9ca5883` |
| 10-20 22:00–23:49 | KILN-003 | P0/P1 built: `@kiln/exec`, `kiln_driver.py`, `src/exec`, migration 3; executors/runner serve/kiln-docker-python/lab jobs removed; workbench on hosts; `perf-lab-sampler/1` + CPU hosts; identity bug fixes; demo data set + 78 screenshots | `49f5156` … `4d9adc2` |
| 10-20 23:46 | K server | `node src/index.ts` started from `K/apps/server`, listening on `127.0.0.1:5380` (KT4 diary Step 1) | — |
| 2026-10-21 10:27 | KILN-004 (K) | Ticket opened: component inventory/duplication map (design doc and tasks are empty templates) | uncommitted |

Elapsed: Perf Lab was built in one afternoon/evening (10-12, ~6 h of commits); Kiln×Perf Lab unification in one
afternoon (10-19, ~4.5 h); real-work kernels plus the first NVIDIA runs in one day (10-20, ~6 h); the execution core
designed, redesigned and half-built in one evening (10-20, 20:18–23:49).

---

## 2. Ticket by ticket

### 2.1 ML-PERF-001 — DINO and embedding kernel profiling and visualization (Playback, 2026-10-12)

**Goal.** "Explain how Playback's Grounding DINO detector and experimental embedding providers spend time and memory,
then connect that evidence to their algorithms and implementation" — a reproducible experiment system plus an
execution explorer (`MP1/design/01-…md:35`). Workloads: Grounding DINO PR 1005 (CUDA-graph replay + Triton fusion of
sampling/reduction) and embedding PR 1008 (`MP1/index.md:21`).

**Proposed architecture (guide, design/01 §8).** Run controller → DINO/embedding adapters → independent collectors
(timing/quality, trace/counters, memory/scheduler) → immutable artifact manifest → versioned import → normalized
events/links/metrics → queries → Perfetto/visual clients (`MP1/design/01-…md:434-469`). Decisions (all "Proposed"):
retain native artifacts and normalize a small schema (§8.2, l.471), collect independent modes with distinct run IDs
(§8.3, l.480), start with one complete DINO investigation (§8.4, l.489). The file plan proposed a Python package
`spikes/performance-lab/perf_lab/{cli,contracts,runner,recording,adapters,collectors,importers,analysis,export}`
(`MP1/design/01-…md:721-740`) — **never built**; what was built instead is the browser/Node prototype in
`MP1/experiments/lab-workbench/`.

**What was built (same day).**
- `lab.js` language (design/02): a plain-JS fluent builder evaluated with `new Function`, compiling to a serializable
  IR of experiments/arms/captures/imports/derives/params/hypotheses/boards; passes expand → resolve → trace → validate →
  lower → plan; lambda phase fixed by slot (plan/data/view/handler/effect/eval); parameter binding inferred
  (view/data/plan); content-addressed captures (`MP1/design/02-…md:31-114`).
- Workbench UI (design/03): drafting-table workbench after Lattice Deck; provenance encoding; parameter bar; pending
  plans; React + Redux Toolkit + react-router (`MP1/design/03-…md:31-42`, status §14 l.334).
- Backend (design/04): Hono + `node:sqlite` lab server on `127.0.0.1:5198`, Vite proxy; one `uv`/PyTorch process per
  repetition on host `local`; seeded paired order; importer of timing / torch.profiler trace / allocator / getrusage;
  SSE; live assistant through pi (`lunaroute/deepseek-4.1-flash:high`) with transcripts and token accounting in SQLite
  (`MP1/design/04-…md:31-104`, status §15 l.375-427).
- Rule stated: "the browser owns the language, the server owns state and side effects" (`MP1/design/04-…md:83`).

**Decisions recorded in design/02 §11 (l.649-657).** Evaluate plain JS (no parser; unsandboxed in the prototype);
phase by slot and wrapper (source inspection rejected); serializable IR + lambda registry; parameters with inferred
binding; **one built-in assistant, no program-declared agents** (removed 2026-10-12 "at the user's direction, because
instantiating ad hoc agents per program added configuration without adding evidence", `02-…md:485`); TeX typeset at
view time (MathJax 4); plan-bound changes stay pending (a GPU job from a slider drag "would be unsafe on a shared host").

**Measured (M1 Pro CPU only).** Compiled sampler vs eager at 2,048 queries: paired median ratio 2.58× (95 % CI
2.18–2.69), re-measured 2.50× (2.37–2.72); 1,024 queries 2.29× (1.88–2.52); first-request compile ≈4.9 s cold,
0.9 s warm cache; hypothesis "compilation removes the intermediate" **refuted** (compiled still allocates an
intermediate-sized block); user CPU 480 ms vs 1,293 ms, peak RSS 287.5 vs 457.7 MiB (`MP1/design/04-…md:391-393`).
Evidence boundary: "No new DGX performance or hardware-counter experiment was run for this ticket" (`MP1/index.md:39`).

**Defects found end to end** (design/04 §15.3, l.395-401): run identity keyed by `experiment/arm/mode#rep` overwrote
other parameter values → keyed by (capture hash, rep), migration 3; pi sends system prompt as `developer` role, which
the lunaroute gateway drops → backend sends `system`; URL hydration race; immediately-applied plans did not fetch
measured runs; model invented `<observation>` blocks and multiple code blocks.

**Tasks** (`MP1/tasks.md`): done — research, guide, visualization handoff, reMarkable upload, lab.js spec, UI design,
prototype, wiring to real artifacts, rounds 2 and 3, backend E2E. **Open** —
`- [ ] Future implementation: qualify DGX tools and deliver the DINO vertical slice` (l.8),
`- [ ] Future implementation: add embedding, memory, CPU PMU and contention experiments` (l.9),
`- [ ] Remote executor for playback@dgx (SSH, approval and credential design) so DGX captures are measured, not synthetic` (l.16, `t:rtne`).

**Open questions written by the authors.** Sandbox for assistant/program eval in a shared deployment; whether params
may change `.boundary()`; how hypotheses reference parameter values; persistence of artifact store (`02-…md:675-680`);
MPS timing semantics; restart leaves `running` rows; "An SSH executor for `playback@dgx` fits the host seam, but
outward-facing execution needs its own approval and credential design" (`04-…md:431-435`).

[[DIARY-MP1]]

### 2.2 ML-PERF-002 — studying Grounding DINO PR 1005 in the Perf Lab (Playback, 2026-10-12 evening)

**Goal.** Make PR 1005 *validatable, examinable and studyable* in the lab: bring in evidence produced elsewhere,
datasets, image/box entities and picture views (`MP2/design/01-…md:32-56`). PR 1005 itself reported 67.5 % (RTX PRO
6000) and 56.5 % (DGX Spark) lower median latency; an independent DGX reproduction measured 30 % (`l.34`).

**Additions (all built, phases 1–5 + 6 docs).** Evidence archives as captures (plan status `import` / `blocked`,
archive executor, `source = evidence:<sha256>`); datasets identified by the SHA-256 of their manifest, images fetched
and verified, `privacy` column admits only `'public'`; `image`/`annotation`/`detection`/`check` entities; the PR's
matching rules ported to TypeScript and pinned by a golden test; `detections()` and `gallery()` views; the
`dino-pr1005` preset; a local `dino` workload (`workloads/perf_lab_dino`) running the detector source at both revisions
via `git show` (`MP2/design/01-…md:427-693`, status §12 l.714-754).

**Decision records** (each "accepted"): public media only (l.496); archives are captures, not uploads of runs (l.518);
compute matches at import, in TypeScript — "Two implementations must stay equal; the golden test is the enforcement
seam" (l.567-574); run the backend source at revisions (l.682).

**Measured / imported verdicts** (§12.1, l.726-737): `outputs-exact` supported (512/512); `latency-halved` refuted
(0.303 reduction, CI [0.301, 0.306]); `memory-within-20` refuted (warm cgroup +25 %/+23 %); `prompt-reuse` supported;
`fusion-active` supported (`fused_sampling` 18 launches, 39 native tests); `cpu-parts-preserve` supported (M1 Pro, FP32,
16 images, 32 pairs exact, 1,665 → 1,654 ms).

**Deviations admitted** (§12.2): imported runs stay origin `measured` with a `source` column instead of a new
`imported` origin ("would have required rebuilding three tables"); own ustar/pax reader instead of `tar`; COCO via S3
because of a certificate mismatch; separate `perf_lab_dino` package so the sampler's source hash is not disturbed;
missing predicate → `open`, not `supported`.

**Tasks** (`MP2/tasks.md`): phases 0–6 done; open —
`- [ ] Deferred: DGX executor (SSH, approval, credentials) and production prompt-sequence workload` (l.11, `t:cevg`).
Not done (§12.3): DGX executor; importer version on imported runs; memory/stage captures for the local CPU run.
Most consequential open question: how often production label sets change token layout and what each recapture costs
(§13, l.761).

[[DIARY-MP2]]

### 2.3 ML-PERF-003 — SSH executor for containerized GPU captures on the DGX (designed 2026-10-12, superseded 2026-10-20)

**Goal.** Make the Perf Lab execute captures on `playback@dgx` instead of importing hand-made archives or completing
synthetic stand-ins (`MP3/index.md:26`).

**Architecture.** Lab stays on the Mac. Per approved job the lab server stages a **bundle** (two Playback revisions via
`git archive`, workload script, capture specs, image list, a **step plan** of fully specified `docker run`s), uploads
over SSH, starts a small stdlib **driver** on the DGX that takes a GPU lock, records co-tenants, runs each step in a
disposable network-isolated container of the detection image (pinned by image ID), streams JSON lines, packs a
**result archive**; the server fetches it, registers it like a hand-made archive, imports with the existing
`detection-qualification/v1` importer (`MP3/design/01-…md:45-64`). "The DGX gains nothing permanent except a working
directory (`/home/playback/perf-lab`), a lock file and a cache of public dataset images."

**Key decision (§5, l.351-370).** Three options: A lab server on the DGX; **B SSH container executor from the Mac
(chosen)**; C a lab agent service on the DGX. "Build B. Structure it so that C is a second implementation of the same
host interface (§6.1) if long jobs or several users make reattachment necessary. A job's lifetime is tied to its SSH
connection on purpose: an orphaned GPU process on a shared host is worse than a cancelled job." (l.370). Risk list
adds: "If jobs grow to hours, option C of §5 becomes the better trade." (l.997).

**Concepts defined** (§2.2, l.116-134): host, executor (`process`, local dino, evidence import, `synthetic`, new
`ssh-container`), host profile, capability report, capture, lowered spec, repetition, arm/variant, job, evidence
archive, result archive, detection image (`pb-dgx-sim-detection:latest`, `sha256:d06d49c0…`, torch 2.10.0+cu130,
Triton 3.6.0, transformers 5.2.0, DINO tiny snapshot `a2bb814…`), step, bundle, co-tenant, compile cache.

**DGX inventory (read-only, 2026-10-12, §3.7 l.318-334).** `gx10-b2d2`, Ubuntu 24.04.4, aarch64; NVIDIA GB10, driver
580.159.03, CC 12.1; Docker 29.2.1; 13 running containers (factory-live + observability); 6 resident CUDA `python3`
processes (2150, 9116, 512, 468, 174, 174 MiB); 61 of 196 GB free; unified memory ("RSS, CUDA allocation and container
cgroup peaks overlap and must not be added together"); throughput on this class of host swings ≈2.2× with co-resident
CUDA tenants.

**Tasks** (`MP3/tasks.md`): all six phases unchecked —
`- [ ] Phase 0: host profile (.data/hosts.json), SSH transport, remote probe; pnpm lab hosts probe playback@dgx shows image sha256:d06d49c0` …
`- [ ] Phase 5: prompt-sequence workload and board; experiment 7.3`. Index status `superseded`; banner at
`MP3/index.md:21-24`; changelog l.19-21 says every decision "carries over" and "The open tasks move to KILN-003 phase P4".
First experiments (§7): 7.1 reproduce the archive image by image (16 stratified images), 7.2 memory in fresh
containers, 7.3 prompt sequences.

[[DIARY-MP3]]

### 2.4 The comparison memo — `K/imports/Untitled.md` (2026-10-19)

"The two projects are mirror images. Kiln generates kernels from a model of the computation and predicts their cost;
Perf Lab observes code that already exists and decides what the measurements are allowed to say." (l.5). Defines the
evidence contract (five provenance classes; missing is never zero; observed values sealed; validity from execution;
no shared clock across runs; statistics pair processes; explicit coverage, l.47-54). Side-by-side table (l.80-96).
Proposes 13 ideas to adapt into Kiln, ordered Now/Next/Later (l.122-136): provenance on every number, repetitions + CIs,
run identity by content hash, hypotheses with live verdicts, activation checks (Now); cost badges/pending plans,
paired interleaved A/B, Nsight Compute import, structural comparison, route view (Next); timeline, persistent store and
job log, agent hygiene (Later). Suite ideas (l.148-158): production trace → kernel lab → production; predict before you
measure; continuous model calibration; tuning with statistics; **one entity graph for all kernels** (`compiled_from`,
`corresponds_to`, `implements`); tensor cores and precision; clocks/state as variables; shared qualified evidence;
course mode. Caveats: "Nothing in the ML-PERF-001 archive was run … two missing Redux files keep the prototype from
compiling" (l.162) — **corrected by KILN-001**: the copy in the repo type-checks and passes 104 Vitest tests
(`KT1/design-doc/01-…md:145-150`). Minor discrepancy: memo quotes 2.58× (CI 2.18–2.69) (l.69); KILN-001 cites the
re-measured 2.50× (2.37–2.72) and notes that with four processes "those intervals equal the minimum and maximum of four
ratios" (`KT1/…:148-150`, weakness P-15).

### 2.5 KILN-001 — unified GPU kernel workbench (Kiln repo, 2026-10-19)

**Goal.** One workbench that "treats every kernel as a **claim with three numbers**: what the analytic model predicts,
what the simulator counts, and what hardware measures", each with provenance; hardware numbers with repetitions, CI,
content identity, validity; compiler decisions use hardware evidence only when CIs separate; hypotheses judged live;
Kiln's Swiss visual language (`KT1/design-doc/01-…md:123-129`). Goals §20.1 (l.1102-1119); non-goals §20.2: new
compiler expressiveness, multi-user, replacing the Perf Lab app (`PL/` stays runnable until Phase 8).

**Analysis.** 18 Kiln weaknesses K-1..K-18 (l.1041-1062: simulator times with the model's own formula; one best number
per schedule; evidence key covers neither code nor hardware; agent with full page privileges; runner Origin check
bypassable by DNS rebinding and compiles arbitrary CUDA; no CI; silent scale limits …) and 16 Perf Lab weaknesses
P-1..P-16 (l.1064-1083: approval trusts the client's `proposedBy`; no auth/Origin/Host check; dino workload executes
Playback source at any revision; GPU-minute budget only in the browser; **cyrb53 identity in fields named `*_sha256`**;
shallow seal; synthetic counters marked observed; verdicts in a React component; `pairedRatio` ignores its seed;
`offered` turns missing into 0; no process timeout; no real GPU; declared quality gate not what runs; global catalog;
four-process "95 % CI" is min–max; no model to compare against).

**Architecture (§20.4–20.5, l.1139-1178).** pnpm workspace: `packages/evidence` (@kiln/evidence), `packages/kiln`
(@kiln/kiln), `apps/workbench`, `apps/server` (Hono + node:sqlite, jobs, executors, SSE, model gateway),
`runner/kiln_runner.py`, `imports/` (read-only), `lab-workbench/` ("Perf Lab as received (read-only reference until
Phase 8)"). Browser: project → pipeline → decide chain (kernel pins → pinned → evidence v2 → model → first) → programOf →
kernels + contentIds; EvidenceStore of records; ServerAdapter sync; agent in opaque-origin sandbox. Server on
`127.0.0.1:5280`, job queue one job at a time → `CudaRunnerExecutor` → `python3 kiln_runner.py run -` locally or over
ssh.

**Decision records D1–D13 (§34, l.1955-1973).** D1 base on Kiln UI/compiler, Perf Lab's evidence as headless package;
D2 TS erasable-syntax run by Node 26, esbuild; D3 SHA-256 everywhere (not cyrb53); D4 keep kernel identity for grouping
+ content id for validity; D5 device ids include fingerprint hash; D6 evidence overrides model only when intervals
separate; D7 Perf Lab's five provenance classes + source word; D8 repetition (fresh context) is the statistical unit;
D9 server optional, same-origin, loopback, token + Host allow-list; **D10 CUDA runs through the runner as a subprocess
(locally or over SSH), not through its HTTP server — "Removes a network-exposed code-execution endpoint; reuses SSH
authentication for remote hosts"** (l.1970); D11 agent code in opaque-origin sandbox frame; D12 verdict function in
@kiln/evidence, errors → `open`; D13 provenance by shape/fill/dash, red the only hue.

**Phases 0–8 (§35) — all done the same day except 8d.** Phase 8 as built (§33.1, l.1907-1953): "Three of the four
parts exist; the entity graph does not." `@kiln/lab` is "Perf Lab's language ported to a browser-safe package";
"Capture hashes are still Perf Lab's `cyrb53` (P-5), because the store and routes are keyed by them" (l.1928);
`lab:import` reads a temporary copy of Perf Lab's store; "Lab jobs are history only: creating, approving or cancelling
one answers `501`" (l.1932); `check:pl` proves port fidelity against Perf Lab's own code. **Not built:** entity graph;
lab job execution and dataset materialization; board live refresh on `catalog.changed`.

**Measured.** Phase 6 done-condition on the M1 Pro: paired WebGPU comparison of W-05's thread vs row schedules, ratio
0.0079 [0.0072, 0.0083], n=7, W-05 open → supported (`KT1/changelog.md:86`). WebGPU timestamps quantised to 65.536 µs
without `--enable-unsafe-webgpu`; M1 Pro GPU clock levels up to ≈3× apart so unpaired runs are not comparable
(`KT1/design-doc/01-…md:1449-1456`).

**Tasks open** (`KT1/tasks.md`): `- [ ] Vault report after major milestones (playback-vault, textbook style)` (l.22)
[note: changelog records vault reports 534ff7f, 43572ed, 4fc3320 pushed — the box was never ticked];
`- [ ] Phase 8d: entity graph (corresponds_to edges between Perf Lab and Kiln kernels)` (l.23);
`- [ ] Lab follow-ups: catalog.changed refresh in labs, mirror caption at 390 px` (l.24).

**Open questions / risks (§37).** Whether content ids include the browser's WGSL compiler version; minimum reps on
real devices (starts at 3); calibrating simulator counts against Nsight counters; follow-ups: pair-valued reducers,
gathers, fp16/bf16/tensor cores (K-10), warp shuffles/double buffering (K-11), model-calibration board, kernel
timeline view, Nsight Compute import with `counters-not-latency`.

[[DIARY-K1]]

### 2.6 KILN-002 — Kiln and Perf Lab on real work (2026-10-20)

**Goal.** As of 2026-10-20: "No Kiln kernel has run inside a program that someone uses"; "No Kiln kernel has been timed
on an NVIDIA GPU"; "Perf Lab has never measured a kernel that Kiln generated" (`KT2/design-doc/01-…md:112-119`). Carry
three real workloads through the **eight-step loop** measure → decide (written hypothesis) → write program → check vs
consumer reference → integrate behind a switch → paired compare → consumer quality gate → record with identity
(§4, l.308-366): **A** window similarity matrix in the factory-videos web UI (WGSL/WebGPU); **B** grey conversion for
zone motion in the factory runtime (wgpu on Mac / CUDA on Spark); **C** redaction mask post-processing in Playback
(CUDA). Secondary: YOLOX decode in stream-engine (Part VI, not pursued).

**Identity chain (§23, l.1088-1135).** Kernel identity + `kiln-codegen/2` carried through `kiln-program/1` exports
(committed in the consumer repo), emitted symbol `k_<name>__<identity[0:8]>`, measurement record, and a planned
`corresponds_to` edge with evidence `direct`, method `symbol-suffix`.

**Getting results onto a board (§25, l.1156-1191).** Perf Lab executes only on `local`; Kiln's lab job route answers
501 → results enter as evidence archives in a new generic format `kiln-paired/1` (l.1167-1185). "Building lab job
execution in the Kiln server would make the import step unnecessary; it is deliberately out of scope here, because three
examples with different runtimes … would each need their own executor first." (l.1187-1189) — this is the gap KILN-003
then took on.

**Phases** (§26): P0 groundwork, PA, PB, PC, PN (NVIDIA session, needs permission), PE (importer + lab programs +
`corresponds_to`), PR (vault reports). Permission rule: "Reaching a GPU host over SSH requires explicit permission each
time" (l.1140).

**Outcomes (changelog + tasks).**
- P0 done (`f272c11`, `aa0f0b4`): `N.floor`, u8 inputs, `kiln-program/1` export + CLI, TS WebGPU launcher, Python
  launcher (wgpu + ctypes NVRTC/driver), identity-suffixed symbols.
- A done on the M1 Pro: GPU/CPU 0.029 [0.024, 0.031] at 1,385×768; GPU+paint 76–79 ms at 2,297×768; gate max |d| 2.2e-6;
  verdicts `gpu-rebuild-1385`, `cap-lift-interactive` supported; FVK `3bc92785`.
- B1: `gray-is-worth-a-kernel` **refuted** (motion.gray 9.3 % of session; 90 % of a run is single-threaded
  `videoconvert` NV12→RGB at 4.4 ms/frame vs 0.49 ms VideoToolbox decode; `n-threads=4` 2.75× faster but changes 1.2 %
  of grey pixels by 1). B2–B5 not started "per the guide's rule".
- C1–C3: W-28 bit-exact with Playback (0 of 67.3 M reference pixels on 3 platforms; 0 of 269 M kernel pixels via wgpu);
  96/96 NVRTC 13.2 compiles for sm_120/sm_121; PK2 `cdfb0d8c9`.
- PN/C4 on GB10 hosts: Playback's mask-post tests 25/25 in the redaction image; launcher primary-context bug fixed
  (`7bcfc06`); kiln mask path 6.8× faster than the CPU loop at 100 masks 768×416 (3.1 vs 19.1 ms); `kiln-probe` on an
  idle Spark 259 GB/s read, 28.9 TFLOP/s FMA, 2.4 µs launch → `gb10` target (was falling back to RTX 5090's 1792 GB/s);
  PN smoke 18/18; Kiln's model over-predicts W-28 6.6–115× ("gather charged as uncoalesced"); the shipped set's
  rtx5090 schedules beat the measured gb10 spec's on the GB10 (`b8534b2`); **C4: every correctness gate passes but the
  service is 2.6–3.2 % slower at concurrency 1/4/8 (0.974/0.971/0.968; repeat 0.987/0.958/0.964), `gb10-unchanged-or-better`
  refuted**; stage timers: post-pass −1.0 ms/frame, preprocess +3.1 (+2.7) ms/frame; "the ground-truth gate does not
  exercise the GPU path" (`KT2/changelog.md:73-81`).
- RG `run-on-gpu-host.sh` (`450fbd0`..`9d409d1`): every GPU stage from the Mac (`--host`) or on the host (`--local`),
  verdicts in `summary.md`; found three defects (lab-e2e in `pnpm test`; pb-test verdict lost in a pipeline subshell →
  KNOWN-FLAKY; Playback `test_trt_engine_raw.py` flaky at baseline).
- RC (`432a4b9`): records name preset, project, parameter values and script hash.

**Open tasks** (`KT2/tasks.md`, verbatim):
- `- [ ] B2 W-27 motion-grey program … — NOT STARTED: B1 refuted gray-is-worth-a-kernel on the Mac; reopen only if PN shows otherwise on the Spark` (l.16; B3–B5 same, l.17-19)
- `- [ ] C4 GPU host validation … GB10 DONE on bling … RTX PRO 6000 (post-moves-to-gpu) OPEN: needs SSH to playback@playback-rtx-dev` (l.23)
- `- [ ] PN NVIDIA session … B on Spark NOT DONE (bling has no Factory Videos runtime; dgx runs factory-live)` (l.24)
- `- [ ] PE kiln-paired/1 importer, lab programs per example, corresponds_to edges — BLOCKED: the importer belongs in Perf Lab lab-workbench/server/runner.ts, which this ticket must not modify; Kiln's server answers lab job execution with 501 and has no executor for plan status 'import'. Records are ready in various/a4/records/` (l.25)
- `- [ ] C4.d Find what the candidate's preprocess step waits on under load on the GB10 (py-spy dump …, in_flight sampling, nsys) before any further GPU stage (guide §21)` (l.28, `t:3nev`)
- `- [ ] Playback tests/test_trt_engine_raw.py is flaky at the baseline too … fix belongs in Playback: infer once, apply both post-processing paths` (l.30)
- `- [ ] SW sweep as a job: a knob/parameter grid compiled in the page, sent as ONE job (≤64 kernels, one seeded shuffled order, per-kernel context), plus a view of time against a parameter or knob; Tune and Compare refuse server executors today` (l.32, `t:udht`)

**Open questions (§28, l.1271-1280).** Skip the host sync in redaction (process all 100 slots); should FV fetch
exports instead of committing them; **"A browser host for Perf Lab? … A third would justify a `browser` host kind with
an executor"**; GPU temporal OR/fill; instrument YOLOX element.

[[DIARY-K2]]

### 2.7 KILN-003 — one execution core (2026-10-20 evening)

**Goal.** "Replace Kiln executors, the Perf Lab runner and the designed ML-PERF-003 SSH executor with one execution
core: captures run by jobs on probed hosts, planned from workload kinds and collectors, executed by one generic driver,
imported from result archives into one catalog." (`KT3/index.md:16`). Three question types: kernel speed (exists),
compiler-pass effect end to end with nsys/ncu (missing), service speed at two revisions on a GPU host (designed in
ML-PERF-003) (`KT3/design-doc/01-…md:85-104`).

**Five separated concerns (l.106-114):** host and driver; environment; workload kind; collector; plan and driver.
**Three rules:** the driver runs steps and never interprets them; a collector declares what it disturbs (ncu runs never
contribute latencies); everything that can change a measurement is part of identity (content, image ID, device
fingerprint, protocol, collectors) (l.128-134). "The design is deliberately a simplification, not an addition … Some
functionality is lost on purpose: CUDA runs without the Kiln server, and CPU-only lab runs on the Mac." (l.120-126).

**Nine nouns (§11.1, l.550-598):** Host, Environment, Kind, Collector, Capture, Job, Run, Record, Offer — each with
"Replaces today" column. Six request stages: choose → plan → approve → submit and run → collect → import (§11.2).
Code placement (§11.3): headless `@kiln/exec` (model, planner, kinds, collectors, offers, importers) shared by page and
server; server-only `src/exec/{queue,jobs,host,driver-client}`; `runner/kiln_driver.py` on the host. Dependency rule:
"a layer may use the layers listed in its 'Knows' column and must not import anything in its 'Does not know' column".

**Principles (§12.1):** driver interprets nothing; facts probed, offers derived; collectors compose by declaration;
identity covers everything; **every host speaks one API** ("ML-PERF-003 §5 chose SSH and deferred an agent service;
this design takes the agent and drops SSH", l.675); one catalog; the plan is the contract; one path per concern.

**Removals (§12.2, l.685-705)** — "keeping every existing path would mean keeping three mechanisms behind one interface":
executors.json/Executor/CudaRunnerExecutor; install-runner-over-SSH; `kiln_runner.py serve`, page runner device, bundle
export/import; runner `--ncu`; `kiln-docker-python`; Perf Lab's Mac process executor and `uv` env; synthetic hosts and
seeding; adapter names; **two job systems → one**; job body `kernels[]` → `captures[]`; Perf Lab's cyrb53 → SHA-256;
"Tune and Compare run on the page's devices" → capture sets on any host.

**Driver API (§13.2):** `GET /v1/info`, `POST /v1/probe`, `HEAD/PUT /v1/blobs/:sha256`, `POST/GET /v1/jobs`,
`GET /v1/jobs/:id/events?after=&wait=` (long poll), cancel, archive, `DELETE`, `PUT /v1/self` (self-update while idle).
Jobs owned by the driver (survive server restart), driver queues one job at a time, events persisted to
`events.ndjson`. **"The API has no authentication, by decision (2026-10-20)"** (l.808). Host root layout (§13.3);
drivers started by hand in tmux as a docker-group user (§13.4). Host profiles `kiln-hosts/1` in `<data>/hosts.json`
(`spark` at `127.0.0.1:5281`; `dgx` at `100.103.58.32:5281` — Tailscale) (§13.1).

**Other mechanisms:** environments = `container` (image ID) or `host` (§14.1; "deliberately no virtual-environment
variant", l.866); probe facts → `kiln-capabilities/1` documents with offers and blocked reasons (§15–18); workload kind
interface `validate / contentId / stage / lower (per repetition) / import` (§19.1); collector table with shapes
(wrapper / in-process / sidecar) and `disturbs` (§20.2); pooling rule "A run contributes samples of quantity Q to a
statistic only if no collector in its capture's collector set lists Q under `disturbs`" (§20.3); capture identity
`kiln-capture/1` without host id (§21.1); planner + `kiln-plan/1`; per-GPU `flock` lock in `/run/lock` (advisory)
(§22.4); conditions (never in identity) (§22.5); limits (§22.7); archives first, one import pipeline, records projected
from runs (§23); table renames `lab_*` → `captures/runs/archives`, `lab_jobs` dropped (§23.5); one job API with
`dryRun`, per-host queues, one agent budget (§24); page: hosts replace devices, Devices shows capability documents,
capture-mode chips, Jobs shows plans (§25); ML-PERF-003 section-by-section mapping (§26, l.1852-1874); security
(§27: page boundary unchanged, **driver unauthenticated**, fixed container options, archives untrusted, no footage
leaves a host, counter access a host decision).

**Phases (§29) and status (`KT3/tasks.md`).**
- `- [x] P0: @kiln/exec model, requirements, offers, identity; hosts.json with driver URLs; driver client; kiln_driver.py serve with /v1/info, /v1/probe, /v1/self; /api/hosts; capability documents in Devices` (l.5)
- `- [x] P1: driver jobs, blobs, long-poll events, cancel, archives, restart recovery; GPU lock, conditions, gpu-sampler; planner; kiln-kernels/1 and kiln-probe/1; one job API, queueing on the driver; archive import; remove executors, runner serve, kiln-docker-python` (l.6)
- `- [ ] P2: ncu and nsys collectors; kiln-perf built with --ncu; nsys tool mounts; counters and timeline panels` (l.7)
- `- [ ] P3: kiln-program/1 with kiln_launch.py bench (CUDA events, NVTX); in-program records` (l.8)
- `- [ ] P4: playback-dino/1, memory collectors, table migration, lab dock on the one job API; remove synthetic hosts` (l.9)
- `- [ ] P5: playback-redaction/1 and stage-timers; W-28 in-service board (answers KILN-002 task 3nev)` (l.10)
- `- [ ] P6: torch-function/1` (l.11)
- `- [ ] Host decision: open GPU counters on bling (NVreg_RestrictProfilingToAdminUsers=0 + reboot) - needs the user's go-ahead` (l.12)

**Checked against code (2026-10-21):** `K/packages/exec/src/kinds/index.ts` registers only `kiln-kernels/1` and
`perf-lab-sampler/1`; there is **no `kiln-probe/1` kind** anywhere in `packages/exec`, `apps/server/src` or the driver
(grep), although P1's checkbox names it. Collectors `ncu.ts`, `nsys.ts` and `apps/server/src/exec/nsys-sqlite.ts`
already exist (≈100 + 99 + 47 lines) although P2 is open — code written ahead of hardware validation. The planned
`K/runner/test/test_driver.py` (§33.2) does not exist; driver tests live in `apps/server/test/` with fake docker /
nvidia-smi (commit `49f5156` body).

**Drift from the guide in what was built (commit bodies):**
- `8276bf7` "perf-lab-sampler/1, CPU hosts, and lab programs on real hosts": Perf Lab's local workload became a kind
  running in a `perf-lab-cpu` container; "a host without a GPU is a device `cpu:<arch>:<model>:<cores>`"; "synthetic
  hosts remain the fallback"; "The lab hash (cyrb53 over the stable spec) moves from the server to @kiln/exec"
  (`K/packages/exec/src/lab-hash.ts`). This **re-adds CPU lab runs** that §12.2 listed as deliberately lost, keeps
  **synthetic hosts** that §12.2/P4 remove, and moves **cyrb53** into the new core although §12.2 and §19.1 retire it.
- `877c273`: lab hash normal form (in-memory spec had `warmup.until: undefined` → `null`; JSON had no key) — eight
  captures imported but never found.
- `c746899`: a CPU capture on bling's `perf-lab-cpu` (`--gpus none`) was keyed on the host's GPU.
- `670c5ce`: a GPU-less host now names itself as the reason GPU kinds are blocked.
- `31b769f`: one registry of lab presets (`PRESET_INFO` from @kiln/lab instead of the workbench's own `LAB_META`).

[[DIARY-K3]]

### 2.8 KILN-004 (opened 2026-10-21) — this inventory

`KT4/index.md`, `KT4/tasks.md` (empty TODO), `KT4/design-doc/01-intern-guide-the-kiln-perf-lab-system-its-components-and-how-to-separate-them-again.md`
(template headings only). Diary Step 1 (`KT4/reference/01-investigation-diary.md`): the process on `127.0.0.1:5380` is
`node src/index.ts`, PID 22866, started 2026-10-20 23:46, cwd `K/apps/server`; "the system is the standalone kiln
repository … not a Playback worktree". Title wording — "how to separate them again" — states the intent to undo part
of the merge.

### 2.9 Satellite worktrees

- **PK2** (`perf/kiln-002-redaction-mask-post`, base `main` at `c7a8c2b0d`): two commits —
  `cdfb0d8c9` (2026-10-20 13:31) "Redaction: opt-in GPU mask post-processing, bit-exact with the CPU loop
  (REDACTION_MASK_POST=kiln)", 13 files, +4401/−28: new `services/redaction/src/mask_post.py` (297), vendored
  `src/kiln/kiln_launch.py` (468) and `src/kiln/mask_post.json` (3173, a `kiln-program-set/1`: W-28 separable, 3
  geometries × 8 buckets), `src/kiln/README.md`, `tests/test_mask_post.py` (228), changes to `trt_engine.py`,
  `server.py` (`/health` reports `mask_post`), `scripts/validate_on_host.sh` (`--candidate-env`),
  `docs/vision/redaction-performance.md` (+61); and `ac835daa9` (14:25) re-vendoring the launcher after Kiln `7bcfc06`.
  Uncommitted: `docker-compose.yml` +5 (`REDACTION_MASK_POST: ${REDACTION_MASK_POST:-cpu}`) — "the stream-engine hook
  cannot pass on macOS" (`KT2/tasks.md:22`). The vendored launcher is byte-identical below its 3-line header to
  `K/runtime/python/kiln_launch.py` at `7bcfc06` (sha256 `94a0f717…`; verified 2026-10-21). Stale narration: the
  compose comment and commit body say "Not yet measured on a host" — C4 has since measured it (3 % slower).
- **FVK** (`FACTORY-KILN-001--gpu-kernels`): one commit `3bc92785` "the similarity matrix on the GPU from committed Kiln
  programs; incremental CPU update; ImageData painter" (`web/live/views/similarity/{similarityGpu.ts,kiln/,paint.ts,…}`).

---

[[SECTIONS-3-PLUS]]
