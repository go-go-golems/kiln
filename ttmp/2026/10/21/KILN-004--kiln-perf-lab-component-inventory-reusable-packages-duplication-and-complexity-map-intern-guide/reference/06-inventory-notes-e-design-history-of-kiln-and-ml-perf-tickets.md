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
(section 2 per ticket, "From the diaries"). Citations there use `KEY:line`:

| Key | File |
| --- | --- |
| `K1D01` … `K1D10` | `KT1/reference/01-investigation-diary.md` (coordinator) … `10-phase8c-lab-server-diary.md` (workers 02–10) |
| `K1G` | `KT1/design-doc/01-…` (KILN-001 intern guide) |
| `K2D`, `K2G` | `KT2/reference/01-investigation-diary.md`, `KT2/design-doc/01-…` |
| `K3D`, `K3G` | `KT3/reference/01-investigation-diary.md`, `KT3/design-doc/01-…` |
| `MP1-D1`, `MP1-D3`, `MP1-D4` | `MP1/reference/01-research-and-delivery-diary.md`, `03-workbench-prototype-diary.md`, `04-perf-lab-backend-implementation-diary.md` |
| `MP1-G`, `MP1-SPEC`, `MP1-UI`, `MP1-BE` | `MP1/design/01-…`, `02-lab-language-specification.md`, `03-workbench-ui-design.md`, `04-perf-lab-backend-end-to-end-design.md` |
| `MP1-RM` | `MP1/experiments/lab-workbench/README.md` |
| `MP2-D`, `MP2-G` | `MP2/reference/01-implementation-diary.md`, `MP2/design/01-…` |
| `MP3-D`, `MP3-G` | `MP3/reference/01-implementation-diary.md`, `MP3/design/01-…` |

The ML-PERF reader's full report is kept at `KT4/various/stopped-agent-scratch/mlperf-report.md`.

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
| 2026-10-21 10:27–10:42 | KILN-004 (K) | Ticket opened: component inventory/duplication map; inventory database contract; five area agents (A–E) stopped at a usage limit, partial notes committed | `4dbf767` … `1d0c894` |

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

**From the diaries.**

*Step → commit.* MP1-D1 Steps 1–3 cover the research only: the guide (~10,100 words), 28 local and 17 web sources, and
`docmgr doctor` passing with "28 local hashes; 17 web archive hashes; 55 local links" (MP1-D1:146). MP1-D1 also states
"no new profiling run or product implementation is claimed" (MP1-D1:23).

Prototype (MP1-D3):

| Step | Commit | What |
| --- | --- | --- |
| 1 | `e0b4e9ece` | Ticket and branch |
| 3 | `888034eb2` | SPEC and UI design |
| 4 | `2f6ce7025` | `src/lang` runtime, `src/data` synthetic layer, nine presets; 20 tests |
| 5 | `1f4d7951a` | RTK store (ten slices) and the component set |
| 6 | `68c47c09f` | Every preset validated in Chrome |
| 9 | `77c7f70a4` | Splitters and layout |
| 10 | `7316c7ecc` | One built-in assistant |
| 11 | `e5414141e` | MathJax 4 |
| 12 | `db723c5d1` | Palette |
| 13 | `ad08d0437` | Headless CDP check; 29 tests |

Backend (MP1-D4):

| Step | Commit | What |
| --- | --- | --- |
| 1 | vault `6419be5` | Vault report |
| 3 | `90dfd0ff1` | Server, migration 1, uv workloads; 8 server tests |
| 4 | `2a1c166dc` | Browser on the server, `local-sampler`; 41 tests |
| 5 | `7a5aa39a3` | Live assistant, migration 2 |
| 6 | `49705ae6d` | E2E check, migration 3; 47 tests |
| 8 | `1d1af2586` … `a563ae110` | Round 3, migration 4; 54 tests |

*What `lab-workbench` contains at the end of ML-PERF-002* (this is what Kiln imported):

- `server/`: `app.ts` Hono+SSE, `db.ts` with five numbered migrations, `store.ts`, `runner.ts`, `importer.ts`,
  `qualification.ts`, `evidence.ts`, `tar.ts`, `datasets.ts`, `dino.ts`, `probe.ts`, `assistant/*`.
  - `runner.ts` has process, synthetic, evidence-import and `runDino` paths.
- `workloads/`: `perf_lab_local` (probe and sampler) and `perf_lab_dino`.
- `src/lang/`: `build.ts` is 1,030 lines; `util.ts` holds cyrb53.
- `src/data/`: `generate.ts` (synthetic runs), `capabilities.ts`.
- `src/features/`: RTK slices, including `agent/builtins.ts`.
- Components: 17 atoms, 18 molecules, 15 organisms and 19 views.
- 11 preset programs.
- `scripts/lab.ts`: the `pnpm lab` CLI.

*Decisions with rationale.*

- **Identity.**
  - Functions never enter the IR; lambdas are stored as source plus a registry entry (MP1-D3:249; MP1-SPEC:60, 653).
  - The capture hash is cyrb53 over the stable-stringified lowered spec, "Not cryptographic; identity only"
    (MP1-D3:295; `src/lang/util.ts:1`).
  - Synthetic data is generated per (capture hash, repetition) (MP1-D3:250).
- **Agents.**
  - `.agent()` was removed by the second-consumer test: "it had no consumer in this workbench" (MP1-D3:543, 566).
  - The assistant has a 30 GPU-minute budget with human approval (`src/features/agent/builtins.ts:8`).
  - Model-written code runs in the browser, never on the server (MP1-D4:339).
  - At most 4 executions per question (MP1-D4:312, 340).
- **Server and execution.**
  - The server re-hashes every spec and answers `409 spec_hash_mismatch` (MP1-D4:193; MP1-BE:241).
  - Offline, a `local` capture fails rather than being simulated (MP1-D4:265).
  - An arm's revision is the content hash of its workload sources (MP1-D4:266).
  - Runs are keyed by (hash, rep) (MP1-D4:399).
  - `playback@dgx` and `playback@rtx-dev` get a synthetic executor (MP1-BE:243; MP1-RM:130-131).
  - One process at a time, "because concurrent benchmark processes would measure each other" (MP1-BE:237).
  - Only the lunaroute pi extension is loaded (MP1-D4:126).
- **UI.** The palette departs from Playback design principle 8, at the user's request (MP1-D3:713; MP1-UI:324).

*Defects found.*

- Rendering every board found modelling errors (MP1-D3:391-395):
  - kernels had no `arm`, so 600 = 2×300;
  - `offered` was 3× too high;
  - the memory ledger summed every graph pool ever captured, giving "122.6 GiB";
  - derive rows rendered as observed;
  - "14 experiments".
- Backend defects:
  - a foreign-key failure, fixed by editing migration 1 in place (MP1-D4:206);
  - the system prompt was dropped because pi sends a `developer` role, so the model answered with 48 input tokens
    (MP1-D4:314, 328);
  - the run-identity data loss (MP1-D4:385, 399);
  - a URL hydration race (MP1-D4:400).

*Measured.*

- First lab run: 2.58× (CI 2.18–2.69); first-request compile 4,857.9 ms (MP1-D4:271-274).
- After the identity fix: 2.50× (2.37–2.72) and 2.29× (1.88–2.52) (MP1-D4:412-414).
- Store after the E2E check: 20 artifacts, 28 runs, 3 jobs, 1,374 events, 20 model calls (18,945 input / 11,030 output
  tokens) (MP1-D4:413).

*Pain, in the authors' words.*

- "Language tests that assert evidence … caught none of these; rendering every board did" (MP1-D3:401).
- "The end-to-end test found the most serious defect of the day, invisible to the unit tests because each test used one
  parameter value" (MP1-D4:428).
- `evaluateProgram` "runs unsandboxed `new Function` code … not acceptable for a shared deployment" (MP1-D3:280).
- "A provider can silently ignore a message role" (MP1-D4:360).

*Stale docs.*

- MP1-RM:25-29 still says the workbench runs "entirely on **synthetic data**", contradicting MP1-RM:126-135.
- "nine programs" / "all nine presets" (MP1-RM:100; MP1-UI:336); there are 11.
- MP1-SPEC:42 and :680 say synthetic data and in-memory storage.
- MP1-BE:383 says "three migrations"; there are five.

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

**From the diary.**

*Step → commit (MP2-D):*

| Step | Commit | What |
| --- | --- | --- |
| 1 | — | MP2-G: 13 sections, 6 decision records |
| 2 | `202b4bc31` (ticket `58af2c81c`) | Migration 5: archives, datasets, media; 61 tests |
| 3 | `ef084172b` | Matching port, qualification importer, plan status `import`; 100 tests |
| 4 | `2eb8a882b` | Detections and gallery views, `dino-pr1005`, the server `features` handshake; 102 tests |
| 5 | `d6b6a3861` | `perf_lab_dino`, `Runner.runDino`; 103 tests |
| 6 | `bf2914296` | Docs (the diary names no hash) |
| 7 | `cdb84891c` | Halo order; Inductor-prefix kernel roles (the diary names no hash) |

*Decisions.*

- Validate in memory before any write (MP2-D:136).
- A fetch allow-list plus SHA-256: the allow-list decides "*whom* the server talks to; the SHA-256 decides *what* it
  accepts" (MP2-D:138).
- Optional spec blocks are added only when declared, so existing hashes stay stable (MP2-D:206).
- `/health` reports `features`, and a stale server makes evidence captures `blocked` (MP2-D:271, 277).

*Defects.*

- The golden port failed 26 of 28 cases because Python's `compare_ground_truth` pops `matched_gt_ids` as a side effect
  (MP2-D:182, 217).
- A stale server ran evidence captures as synthetic, producing 28 synthetic artifacts. They were deleted by hand with
  SQL, then the handshake was added (MP2-D:252, 290).
- `cpu-parts-preserve` read "supported" with zero requests, because `[].every` is true (MP2-D:367).
- A 321 KB transformers progress bar on stderr hid errors (MP2-D:364).
- The COCO certificate mismatch forced S3 path-style URLs (MP2-D:149).

*Measured.*

- The archive (`0daa394d…`, 55 files) holds 128 images, but only 16 have recorded predictions.
- Replay recapture costs 393.78 ms against 53.59 ms per request (MP3-G:952).
- Local CPU dino: 1,665 vs 1,654 ms, with 32 paired requests all bitwise identical (MP2-D:327, 358).
- Two docs disagree on cross-host confidence for one car in image 61108:
  - MP2-D:359 gives 0.3924 vs 0.3921;
  - MP2-G:737 gives 0.3299 vs 0.3365.

*Pain.*

- "A port is only as good as its comparison" (MP2-D:225).
- "A long-running server is part of the system under test" (MP2-D:299).
- Rows were deleted by hand with SQL three times (MP2-D:290, 291, 408).

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

**From the diary.**

*One step* (MP3-D:27-98). It covered three things:

- research;
- the read-only SSH inventory;
- the guide (1,027 lines) with six phase tasks.

No implementation followed. The guide went to reMarkable twice: a `;` inside a Mermaid sequence-diagram message broke
the first upload. The rule recorded is "no `;` inside sequence-diagram message text" (MP3-D:68, 97).

*Decisions.*

- Reuse the hand-run archive orchestrator's choices (MP3-D:31, 59):
  - image by ID;
  - `--network none`;
  - fresh containers per memory state;
  - the `nvidia-smi` sampler.
- Put the container image ID into the lowered spec. This fixes the "synthetic seed" identity problem (MP3-D:31;
  MP3-G:513).
- Co-tenancy is recorded, not refused (MP3-D:83; MP3-G:814, 819).
- The assistant may propose a DGX job but cannot approve one (MP3-G:857).

*Trade-offs the author wrote down.*

- Tying jobs to SSH "cancels a job when the Mac sleeps" (MP3-D:82).
- "Without a pseudo-terminal, a dropped SSH connection does not signal the remote command; a heartbeat write is the
  reliable way" (MP3-D:74).
- `run.py` "times calls without `torch.cuda.synchronize()` … would be wrong on the GB10" (MP3-D:72; MP3-G:838-849).

*Designed concepts* (MP3-G):

- host profile `.data/hosts.json` (l.431-453);
- remote probe `driver.py probe` (l.455-466);
- `spec.environment` block (l.491-513);
- staged bundle `.data/remote/<jobId>/bundle/` (l.555-577);
- recipes `server/remote/recipes.ts`, "a pure function from a capture group to steps" (l.579-581);
- stdlib `driver.py`, which "does not decide anything a recipe could decide" (l.674-676);
- GPU lock: `fcntl.flock` on `<root>/gpu.lock` (l.745);
- conditions (l.802-814);
- cancel by `--label perf-lab.job=<id>` (l.825-829);
- `StepHost` / `SshContainerHost` / `LocalShellHost` (l.376, 429, 986).

*Fate in KILN-003* (mapping at K3G:1852-1874):

- **Survived, reshaped:**
  - the driver, now an HTTP server, `runner/kiln_driver.py`;
  - the GPU lock, moved to `/run/lock/kiln-gpu-<uuid>.lock`;
  - conditions;
  - result archives;
  - containers pinned by image ID;
  - the probe.
- **Dropped:**
  - the SSH transport;
  - the heartbeat and stdin-EOF lifetime;
  - label-scanning reconciliation;
  - the `StepHost` family (K3D:212-221).

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

**From the diaries.**

`K1D01` is the coordinator's diary. `K1D02`–`K1D10` are workers' diaries. Workers did not commit ("the coordinator
commits", e.g. K1D02:48) and owned disjoint files (K1D03:33-35, K1D08:35-40).

*Data-quality warnings.*

- Frontmatter `LastUpdated` values are wrong: K1D01 says 13:37 but was edited until 18:12.
- K1D06:34 cites `3dcfcff`, which is reachable from no branch. It is an orphaned Phase 4b commit, replaced by `46cf8c0`.
- Perf Lab's test count disagrees between sources: K1D01:185 has 104 tests; `KT1/sources/01…:80` has 71, because it
  ran `vitest run src` only.

*Phase → commit* (2026-10-19, from git). Phases 0–8 took 13:44 → 18:12.

| Phase | Commit | Time | What |
| --- | --- | --- | --- |
| 0 | `1b819d8` | 14:27 | Workspace |
| 1 | `f966df8` | 14:44 | CSS |
| 2 | `6f01ff0` | 14:47 | `@kiln/evidence` |
| 3a | `a62ae31` | 14:57 | Records, `EvidenceStore`, `decide.evidence` v2 |
| 4a | `8d97886` | 15:00 | Evidence context |
| 4b | `46cf8c0` | 15:16 | Preset hypotheses, `canonicalSource` |
| 3b/3c | `8937ab8` | 15:34 | Views, WebGPU protocol, `kiln-codegen/2` |
| 5a | `b0b3bc6` | 15:39 | `apps/server`, executors |
| 5a+ | `9647125` | 15:45 | `cudaDevice`, token |
| 6a | `da7e416` | 15:51 | `measurePaired` |
| 6 | `74afdbb` | 15:52 | `test:paired` |
| 4c | `d112fd9` | 15:55 | Hypotheses view |
| 6b | `ee37c4c` | 16:03 | Compare panel |
| 5b | `e2dae5e` | 16:20 | `server-sync.js`, Jobs view |
| 7 | `55e6b2e` | 16:39 | Sandbox worker, model gateway |
| 8c | `aa2dcc2` | 17:13 | `/api/lab`, migration 2, `lab:import` |
| 8a | `b020aa6` | 17:23 | `@kiln/lab` |
| 8b | `1d31e9d`, `f077674` | 18:06, 18:12 | Boards as dock views |

*Decisions with rationale.*

- **The record.**
  - "The cleanest unification point is the *record*" (K1D01:283-284).
  - "The kernel name is not behaviour": content ids made name-independent via `canonicalSource` (K1D01:1011-1015).
  - Rules have one home. "Two copies held equal by a test is one rule with two chances to drift": `repetitionOrder` and
    the output check moved into `@kiln/evidence/src/protocol.ts` (K1D01:1252-1254).
  - "The route is not a property of the GPU": `cudaDevice` derives the id from hostname + GPU UUID (K1D01:1346-1347).
- **Agent sandbox and gateway.**
  - A worker replaces frame code, because "Nothing in the CSP or the sandbox attribute stops a frame from navigating
    itself" (K1D01:1826-1828).
  - Held scripts exist because a sandboxed `editor.set` "would have run agent-written code with full access to the
    token" (K1D01:1820-1822).
  - "The page runs the tool loop, not the server" (K1D08:212-214).
  - `'agent'` is deliberately absent from `FEATURES` (K1D08:129-130).
- **Phase 8 (the lab port).**
  - The coordinator kept 8b because it depends on both 8a and 8c (K1D01:1937-1940).
  - Lab job execution was left out (K1D01:1988-1989).
  - `below`/`above` are exposed to lab programs, so both languages judge rows with the same three-valued functions
    (K1D01:2004-2005).
  - cyrb53 is kept bit-for-bit (P-5) (K1D09:132-133).
  - "The browser-safety test is the enforcement seam … A document would only hope for it" (K1D09:598-599).
  - Evidence is uploaded as JSON rather than making "the first exception to a rule" (K1D10:200-206).
  - Lab jobs answer 501 on mutation (K1D10:573-575).

*Defects found and fixed.*

- **Verdicts.**
  - `!(r.k.t > 1)` over a missing `k.t` gave `supported`. "A hole that turns missing data into support is the failure
    the whole evidence design exists to prevent" (K1D01:626-661).
  - A wide interval read as `refuted`; now null is undecided (K1D01:1376-1380).
- **Identity.**
  - Content ids depended on kernel names, so a valid record read `stale` (K1D01:1041-1046).
  - One GPU got a different device id per route (K1D01:1312-1315).
- **WebGPU.** WGSL `tanh` gave NaN on Metal at |x| ≳ 44. Fixed by clamping at ±15 and `kiln-codegen/2`
  (K1D01:1139-1150; K1D04:355-373).
- **Server and sandbox.**
  - Live CUDA runs from the served page had sent no token since Phase 5a (K1D01:1339-1340).
  - A frame navigation leaked a script to the network (K1D01:1779-1780).
- **Lab port.**
  - Opening Perf Lab's WAL database `{readOnly: true}` rebuilds `-shm` in place. Fixed by opening a temp copy
    (K1D01:2011-2022; K1D09:381-498; K1D10:601-608).
  - `/hosts/local/capabilities` 503 `no_probe` gave "0 of 8 measured"; `probe.ts` was the fix (K1D01:2108-2115).
  - The tar reader accepted a gzip that is not a tar, a gap Perf Lab shares (K1D10:367-372).

*Measured.*

- **Build and tests.**
  - Build size 1137 → 1241 KB.
  - Tests: evidence 110 → 125, server 51 → 89, lab 98.
- **WebGPU on the M1 Pro.**
  - The timer grid is 65.536 µs without `--enable-unsafe-webgpu` (K1D04:262-265).
  - W-22's clock ladder spans 1 : 3.05 (K1D04:321-325).
  - Paired W-05: 0.0079 [0.0072, 0.0083], n=7, 6.2 s (K1D01:1491-1505).
- **Lab port fidelity.**
  - `check:pl` reproduces the speedup 2.4964× [2.3744, 2.7211], n=4 (K1D09:676-681).
  - The port's derives and verdicts are identical to Perf Lab's; all 37 differing leaves are additions or relabels
    (K1D09:334-346).
  - The 8c import takes 0.38 s; 157 of 158 responses are identical to Perf Lab's server (K1D10:247-250).
  - `lab-e2e`: 11 programs, 27 boards (K1D01:2082-2101).

*Admitted copies.*

- **The imports.**
  - Perf Lab was copied whole, including `.data/`, `dist/`, `node_modules/` and `.venv/` (K1D01:42-46).
  - Kiln's bundles were committed as "third-party build output, not reviewed line by line" (K1D01:130-131).
  - Phase 0 copied core/std with `cp -R` (K1D01:338-339).
- **The 8a language port.**
  - "everything else was edited in place" (K1D09:169-173).
  - "differs from Perf Lab only mechanically" (K1D09:302-304).
  - The baseline script holds "a verbatim copy of the logic of `HypothesisView.tsx` L19-48" (K1D09:63-64).
- **The 8c server port.**
  - The tar reader is "unchanged except for `noUncheckedIndexedAccess`" (K1D10:183).
  - store, datasets and evidence were ported onto `lab_*` tables (K1D10:184).
  - cyrb53 was ported into `apps/server/src/lab/captures.ts` (K1D10:181-182). KILN-003 later deleted that file.
- **Reimplemented and shimmed.**
  - `probe.ts` re-derives the Python probe's `workloads_revision` in TypeScript (K1D01:2111-2115).
  - Shims kept: `Store` as an alias of `EvidenceStore` (K1D01:753); `devices.js` re-exports `repetitionOrder`
    (K1D01:1243-1244).

*Pain.*

- **Committing with workers.** Workers' hunks were staged with `git hash-object` / `update-index --cacheinfo`
  (K1D01:1717-1729).
- **Untested paths.**
  - Playwright was never installed, so `test/ui.mjs` never ran (K1D01:1867-1870).
  - "None of the runner changes has run on a GPU" (K1D05:298-299).
- **Security gaps.**
  - "`X-Kiln-Proposer` is self-declared" (K1D01:1286-1288).
  - The gateway has "no upstream timeout and no concurrency cap" (K1D01:1898-1900).
  - `POST /api/lab/evidence {path}` "reveals the contents of a tar archive the user names" (K1D10:284-286).

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

**From the diary (K2D, 15 steps, 11:32–17:30).**

*Step → commit.*

| Step | Lines | Commits | What |
| --- | --- | --- | --- |
| 1–2 | K2D:36-212 | `8044042` | Survey and guide |
| 3 | K2D:213-374 | `f272c11`, `aa0f0b4` | P0. CUDA written, not run |
| 4 | K2D:375-543 | `846282e`, `293884c`; FVK `3bc92785` | Example A |
| 5 | K2D:544-684 | `0764e8d` | B1 |
| 6 | K2D:685-919 | `3aa8208`, `f17ed80`; PK2 `cdfb0d8c9` | C1–C3 |
| 7 | — | vault `594f801` | Vault reports |
| 8 | K2D:958-1121 | `7bcfc06` | First NVIDIA runs; context fix |
| 9 | — | PK2 `ac835daa9` | Re-vendor; W-28 timing; first executor probe of bling |
| 10–11 | — | `3c71c0d` | `kiln-perf` image; `gb10` spec; PN smoke |
| 12 | K2D:1581-1810 | `b8534b2`, `c800080` | C4 on bling |
| 13 | K2D:1811-2179 | `450fbd0` … `9d409d1` | `run-on-gpu-host.sh` |
| 14 | K2D:2180-2276 | `fbd9f75` | Kiln server on bling, executor `spark`, SSH tunnel to 5280 |
| 15 | K2D:2277-2401 | `432a4b9`, `0857384` | Record context |

*Decisions.*

- **Scope.**
  - B2–B5 were not built because B1 refuted the premise (K2D:546-552).
  - PE is blocked because Perf Lab's `lab-workbench` is "imported verbatim; never edited in this repository" (K2G:76).
- **Example C (`mask_post`).**
  - Return per-person masks; the threshold stays in torch, because it is a calibrated knob (K2D:696-698, 763-770).
  - The separable form needs a 1.28 MB intermediate, which is why `allocate=False` exists (K2D:771-774).
  - A load-time self-check against the CPU loop sits behind a broad `except` (K2D:775-779).
- **NVIDIA runs.**
  - "Fix the launcher, not the script" (K2D:1057-1059).
  - C4 ran on bling, not dgx: dgx has co-tenants and a 0.23 MB/s uplink (K2D:1622, 1724-1727).
  - The `gb10` spec uses the measured 259 GB/s, not the public 273 (K2D:1554-1556).
  - "The shipped set stays as exported": its `rtx5090` schedules beat the measured `gb10` spec's (K2D:1594-1598,
    1753-1758).
- **Records.**
  - Record context is stored on the record, per job kernel, captured at compile time (K2D:2338-2344).
  - The Kiln server's data directory lives outside the clone (K2D:2229-2230).

*Copies and forks.*

- factory-videos vendors `kiln/launch.ts` plus the program-set JSON (K2D:414).
- Playback vendors `kiln_launch.py`, byte-identical below a three-line header. It is excluded from ruff and mypy, and a
  test checks its hash (K2D:734, 751-758).
- dgx has a worktree, `~/code/worktrees/kiln-002`, fed through the side ref `kiln-002-incoming` (K2D:1015-1017).
- bling clones come from git bundles, because "Kiln has no remote" (K2D:830, 1626-1627).
- bling runs a local registry container (K2D:1615-1617).
- `c4-diag.sh` re-states `start_arm`'s mounts and environment (K2D:1674-1676).

*Pain.*

- The Evidence view's Forget deleted 9 of 11 jobs' records, unrecoverably (K2D:2289-2292).
- Pre-commit cannot pass on macOS (K2D:836-860). That is why the compose line is uncommitted.
- Moving the image took 16 min 39 s (K2D:1622).
- `test_trt_engine_raw.py` fails at both revisions, 4 of 10 at baseline and 5 of 10 at C3 (K2D:1978-1983). The
  KNOWN-FLAKY rule cannot see a test that fails *more often* at the revision (K2D:2141-2143).
- "Supplementary groups are fixed when a process starts" (K2D:2245-2248). KILN-003 hit it again (K3D:927-929).
- "A model can be calibrated in absolute numbers and still rank schedules wrongly" (K2D:1755-1758).

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

**From the diary (K3D, 6 steps).**

*Step → commit.*

| Step | Commit | What |
| --- | --- | --- |
| 1 | `e5d9e7f` | Guide v1 |
| 2 | `e63e15c`, `9ca5883` | HTTP driver revision |
| 3 | `49f5156` | P0 and P1 server side |
| 4 | `79ab40d`, `715ccf4` | `HostDevice`; the browser CUDA path deleted |
| 5 | `8276bf7` | `perf-lab-sampler/1` and CPU hosts |
| 6 | `877c273` … `4d9adc2` | Deployment on the Mac and bling; demo data collected three times; 78 screenshots |

*The two user directions that shaped the design.*

- Mid-guide: "simplify, unify… losing functionality is fine" (K3D:65-67). It led to §11 (nine nouns) and §12
  (removals).
- For v2: "plain TCP… a local HTTP server too… leave authentication out" (K3D:230-231).

*What 49f5156 deleted* (K3D:382-384):

- `apps/server/src/executors/` and its tests;
- `src/jobs.ts`;
- `src/lab/probe.ts`;
- the lab seed, job, host and evidence routes;
- `kiln-docker-python`;
- `fake-runner.mjs`.

`kiln_runner.py` keeps only `device` and `run`. Migration 3 drops synthetic lab artifacts (K3D:379-381). Step 4 deleted
the browser-side CUDA path (K3D:500-539).

*Implementation choices.*

- **Driver and queue.**
  - The driver's queue is the only queue (K3D:395-404).
  - Records are dated by the driver's `result` event, so reimport is idempotent (K3D:395-404).
  - Measure sets `rerun: true` (K3D:395-404).
  - Perf Lab job history is not imported (K3D:395-404).
- **The GPU lock.**
  - It lives in `/run/lock`, not `/tmp`, because systemd-tmpfiles ages `/tmp` (K3D:136-138).
  - CPU jobs on a GPU host take it too (K3D:943-945).
- **Seeding.** A host with a real report is never seeded, "or the boards would show fiction" (K3D:711-713).

*Bugs.*

- **Build bugs** (K3D:416-433):
  - queue order needed `Jobs.serial`;
  - the driver lost finished steps on restart, fixed by `steps.ndjson`;
  - an agent-budget cancel was misclassified;
  - reimport minted a new record id, fixed by hashing `endedAt` (K3D:420-421).
- **Identity bugs found by deployment.**
  - `877c273`: `stableStringify` writes `undefined` as `null` while `JSON.stringify` drops the key, so runs were stored
    under `1c2ee7b51bf704` while the page looked for `21477f7f5fa54` (K3D:907-913).
  - `c746899`: a CPU capture on bling was keyed `gpu:GPU-c6e7f17e…`, now `cpu:aarch64:Cortex-X925:20` (K3D:914-921).
    `gpus: device=<uuid>` is still open (K3D:958-959).

*Measured* (K3D:858-900).

| Program · host | Compiled ÷ eager | 95 % CI |
| --- | --- | --- |
| local-sampler · mac | 1.43× | 1.26–1.60 |
| local-sampler · bling | 1.08× | 1.07–1.12 |
| sampler-hosts · mac | 1.45× | 1.38–1.48 |
| sampler-hosts · bling | 1.1× | 1.07–1.11 |

- A kernel job takes 13–18 s from Measure to records.
- The Mac's ratio drifted across sessions: 1.57 / 1.68 / 1.43 / 1.45 (K3D:933-938). "A within-session interval does not
  cover the next session."

*Copies the diary admits.*

- `LAB_META` was a second copy of `PRESET_INFO`, fixed in `31b769f` (K3D:923-926).
- The page and the server each computed lab hashes until `8276bf7` (K3D:907-913).

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

## 3. Decisions that were reversed or reshaped

Several decisions changed within days, some within hours. Each chain below is in commit order. A later link does not
always cite the earlier one.

### 3.1 How a GPU host is reached

1. **ML-PERF-003 §5 (2026-10-12).** Option B: an SSH container executor run from the Mac. The job lives as long as its
   SSH connection, on purpose. Option C, an agent service on the host, was deferred: "If jobs grow to hours, option C …
   becomes the better trade" (MP3-G:351-370, 997).
2. **KILN-001 D10 (2026-10-19).** "CUDA runs through the runner as a subprocess (locally or over SSH), not through its
   HTTP server — removes a network-exposed code-execution endpoint; reuses SSH authentication" (K1G:1970). Built in
   Phase 5a as `CudaRunnerExecutor` in `apps/server/src/executors/`.
3. **KILN-002 Step 14 (2026-10-20 ~17:00).** The Kiln server runs on bling with executor `spark`, reached through an SSH
   tunnel to port 5280 (K2D:2180-2276).
4. **KILN-003 v1 (`e5d9e7f`, 20:18).** Two transports, `local` and `ssh`: "Nothing listens on a GPU host … a job lives
   as long as its connection".
5. **KILN-003 v2 (`e63e15c`, 20:41).** "Every host speaks one API … ML-PERF-003 §5 chose SSH and deferred an agent
   service; this design takes the agent and drops SSH" (K3G:675). "The API has no authentication, by decision
   (2026-10-20)" (K3G:808).
6. **Built (`49f5156`, 22:00).** `runner/kiln_driver.py serve` listens on `127.0.0.1:5281` by default
   (`runner/kiln_driver.py:4, 1032`). The executors and `kiln_runner.py serve` were deleted.
7. **Deployed (23:xx).** bling's driver is reached as `127.0.0.1:5481` through `ssh -N -L` (K3D:822-823). SSH survives
   as an unmanaged tunnel outside the core. dgx is planned at `100.103.58.32:5281` over Tailscale (K3G §13.1).

Net effect: D10 removed a network-reachable code-execution endpoint. KILN-003 re-introduced one, unauthenticated by
decision and in a different process. It is mitigated only by binding to loopback or Tailscale.

### 3.2 Capture identity hash: cyrb53 versus SHA-256

1. **Perf Lab** names captures by `cyrb53(stableStringify(spec))`, "Not cryptographic; identity only"
   (`lab-workbench/src/lang/util.ts:1`).
2. **KILN-001 weakness P-5:** "cyrb53 identity in fields named `*_sha256`". Decision D3 was SHA-256 everywhere
   (K1G:1955-1973).
3. **KILN-001 8a/8c** kept cyrb53 bit-for-bit, "because the store and routes are keyed by them" (K1G:1928;
   K1D09:132-133). A third copy went into `apps/server/src/lab/captures.ts` (K1D10:181-182).
4. **KILN-003 §12.2** retires cyrb53 in favour of SHA-256 (K3G:703).
5. **`49f5156`** does introduce a SHA-256 capture identity: `captureId` hashes `kiln-capture/1` canonical JSON
   (`packages/exec/src/identity.ts:6-18`), and catalog rows are keyed by it. But migration 3 keeps `lab_hash` as "the
   lab's own name for it, which lab programs look up" (`apps/server/src/db.ts:248-252`).
6. **`8276bf7`** moves the cyrb53 that computes that name into the new core, `packages/exec/src/lab-hash.ts:1-43`. Its
   comment: "cyrb53 is not SHA-256; it is kept because it is the identity every existing Perf Lab artifact and program
   uses". Every capture now has two identities, a SHA-256 key and a cyrb53 lab name. `877c273` was a bug in the second.

**Checked 2026-10-21 — cyrb53 bodies now in the tree:**

- `lab-workbench/src/lang/util.ts` (the imported Perf Lab);
- `packages/lab/src/lang/util.ts:10` (`hash`, 13 hex digits);
- `packages/exec/src/lab-hash.ts:7` (`cyrb53`, exported from `packages/exec/src/index.ts:9`);
- `packages/kiln/src/core/util.js:3`, Kiln's own `hash`, cyrb53 rendered base-36 for a different purpose.

`apps/server/src/lab/captures.ts` no longer exists.

### 3.3 Synthetic hosts and synthetic evidence

1. **Perf Lab.** `playback@dgx` and `playback@rtx-dev` get synthetic capability reports and a synthetic executor
   (MP1-BE:243).
2. **The stale-server incident** (MP2-D:252, 290). A stale server minted 28 synthetic artifacts, which had to be deleted
   by hand.
3. **KILN-001.** `EXECUTABLE_HOSTS = {'local'}`; the other hosts read unavailable (K1D10:488, 522).
4. **KILN-003.** §12.2 and P4 remove "synthetic hosts and seeding"; migration 3 drops synthetic lab artifacts
   (K3D:379-381).
5. **`8276bf7`:** "synthetic hosts remain the fallback" (K3D:691-692).
6. **Still present.** `packages/lab/src/data/capabilities.ts:11-24` keeps `NVIDIA GB10 (synthetic)` and `RTX PRO 6000
   Blackwell (synthetic)` reports. `packages/lab/src/data/generate.ts` (731 lines) still generates synthetic runs. The
   P4 task to remove them is open.

### 3.4 CPU lab runs on the Mac

1. **Perf Lab.** The `local` host runs `uv` processes (MP1-BE).
2. **KILN-001.** Lab jobs are history only and answer 501 (K1D10:573-575).
3. **KILN-003 §12.2.** "CPU-only lab runs on the Mac" are listed as a deliberate loss (K3G:120-126, 697).
4. **`8276bf7`.** They come back as kind `perf-lab-sampler/1` in a `perf-lab-cpu` container behind a Mac driver on
   `127.0.0.1:5381` (K3D:669-700, 818-821). The guide was not updated to match (section 11).

### 3.5 Who executes lab captures

1. **ML-PERF-001.** The Perf Lab runner executes them (process, synthetic, evidence-import and `runDino` paths).
2. **KILN-001 8c.** Not executed; a full mapping onto Kiln jobs is written but unbuilt (K1D10:571-597).
3. **KILN-002 §25.** Execution is "deliberately out of scope" and results enter as `kiln-paired/1` archives instead
   (K2G:1187-1189). PE is blocked as a result.
4. **KILN-003.** One job API with per-host driver queues. Perf Lab's job history is not imported (K3D:395-404).

### 3.6 Smaller reversals

- **Program-declared agents.** `lab.js` `.agent()` was removed on 2026-10-12 in favour of one built-in assistant
  (MP1-SPEC:485; MP1-D3:543, 566).
- **Agent code isolation.**
  - Perf Lab evaluates with unsandboxed `new Function` (MP1-D3:280).
  - KILN-001 D11 put Kiln's agent in an opaque-origin frame, then moved it to a worker after a navigation leak
    (K1D01:1779-1780, 1826-1828).
  - Perf Lab's assistant routes and transcripts were not imported (K1D10:525-527, 566-569).
- **The entity graph (`corresponds_to`).**
  - The memo proposed it (`K/imports/Untitled.md:148-158`).
  - KILN-001 8d was never started (`KT1/tasks.md:23`, still unchecked).
  - KILN-002 PE is blocked.
  - KILN-003 emits `corresponds_to` links from kernel captures (`packages/exec/src/runs.ts:57`) and nsys kernels
    (`packages/exec/src/collectors/nsys.ts:42`).

  So the edge exists as data. No ticket closes 8d, and no board reads kernel captures' runs yet (K3D:761).
- **Two job systems → one.** Kiln jobs and Perf Lab lab jobs became one job API (K3G §12.2, §24).
- **Environments.** "Deliberately no virtual-environment variant" (K3G:866). Perf Lab's `uv` venv became a container.
- **The `gb10` device spec.** It was measured (Step 11), then found to rank schedules worse than the shipped `rtx5090`
  schedules (Step 12). The shipped set stays as exported (K2D:1594-1598, 1753-1758).

## 4. Glossary (term → meaning → where defined)

| Term | Meaning | Source |
| --- | --- | --- |
| lab.js / lab program | Plain-JS fluent builder returning `lab(title)`, compiled to a serializable IR | MP1-SPEC:31-114, 123 |
| experiment / arm / capture | Frozen benchmark contract; a named side (`baseline`/`candidate`); one experiment × arm × mode with a lowered spec and hash | MP1-SPEC:35, 147-178 |
| mode | Perf Lab: a capture kind (`timing`, `trace`, `kernels`, `memory`, `cpu`, `sanitizer`, later `stages`/`predictions`/`tests`). KILN-003: a name for a collector set | MP1-SPEC:171-178; K3D:159-160 |
| derive | Memoized data node with `prov: derived` | MP1-SPEC:82, 208 |
| parameter binding | plan / data / view, inferred from a parameter's readers | MP1-SPEC:367-377 |
| pending plan | What a plan-bound change produces when hashes are missing; never auto-executed | MP1-SPEC:373-375 |
| hypothesis / verdict | `.claim().predicts().supportedBy()`; `supported | refuted | open | unqualified` | MP1-SPEC:257-266; `@kiln/evidence` `verdict` (K1G D12) |
| board / view kinds | Named view surface; timeline, mirror, KernelCard, ledger, stepper, route, detections, gallery … | MP1-SPEC:225; MP1-UI:231-248 |
| provenance classes | `observed | derived | heuristic | illustrative | unknown`; missing is never zero | MP1-SPEC:215; memo l.47-54; K1G D7 |
| ProvenanceError / seal | Observed values are import-only; `seal` is a deep read-only snapshot | MP1-SPEC:219; K1D02:103-108 |
| quality gate / activation check | Both arms on fixed inputs in one process; activation recorded from execution | MP1-BE:203-205 |
| paired ratio | Median ratio with bootstrap over processes, the independent unit | MP1-SPEC:238-239 |
| capture hash | `cyrb53(stableStringify(lowered spec))` | `packages/exec/src/lab-hash.ts:43` |
| evidence archive | `.tar.gz` registered by SHA-256; imported via plan status `import` | MP2-G:518-525 |
| `detection-qualification/v1` | Report layout of `services/detection/GPU.md`, importer `qualification.ts` | MP2-G:527-538 |
| dataset / public media | COCO selection keyed by manifest hash; `privacy = 'public'` only | MP2-G:496-503 |
| record `kiln-measure/1` | Kiln's per-kernel measurement record; id = sha256(canonical JSON) | K1D02:93-94, 240-242; K1G §21 |
| content id | Hash of canonical source, launch, seeds and shapes; name-independent since 4b | K1D01:744, 994-998 |
| `kiln-codegen/N` | Code-generator version inside content identity; a bump stales every record | K1D01:1148-1150 |
| `evidenceId` / device id | Records key on `evidenceId`; `cudaDevice` derives one id per GPU from hostname + UUID | K1D01:794-796, 1335-1337 |
| `EvidenceStore` / `isDecisive` | Kiln's record store replacing keep-best; may-decide rule | K1D01:753-759; K1D02:212-214 |
| `decide.evidence` v2 | Fork policy switching from model to evidence only on separated intervals, `minReps = 3` | K1D01:761-762, 854-856 |
| `below` / `above` | Three-valued predicates over intervals (null = undecided) | K1D01:1402-1404 |
| `measurePaired` | One kernel under two pinned rows in one protocol run, sharing `pairId` | K1D01:1397-1401 |
| held script | Agent-written code waits until the user presses Run | K1D01:1803-1822 |
| model gateway | `POST /api/agent/sample`, a stateless relay; the page runs the tool loop | K1D08:149-152, 212-214 |
| `@kiln/lab`, `check:pl`, `lab:import` | Ported language; fidelity check against Perf Lab's own code; hash-verifying importer | K1D09:743-755; K1D10:544-564 |
| board as dock view | `board:<id>` view ids inside Kiln's dock | K1D01:1978-1981 |
| eight-step loop | measure → decide → write → check → integrate → paired compare → quality gate → record | K2G §4 l.308-366 |
| `kiln-program/1`, `kiln-program-set/1` | Exported program (kernels, buffers, dispatch, identities); a set over `--param` values | K2D:250-252, 411-414 |
| `kiln-paired/1` | Generic paired-run evidence archive for importing into Perf Lab | K2G:1160-1186 |
| identity suffix | Emitted symbol `k_<name>__<identity>` | K2G:1088-1135 |
| W-26 / W-27 / W-28 | Similarity matrix / motion grey (never built) / redaction mask post | K2D:712-716; `KT2/tasks.md` |
| `run-on-gpu-host.sh` verdicts | PASS, FAIL, DONE, KNOWN-FLAKY, SKIP | K2D:1905-1909 |
| record context (RC) | `{preset, project, params, script}` on `kiln-measure/1` | K2D:2316-2318 |
| host / driver / environment | Probed machine; `kiln_driver.py` HTTP API; `container` (image ID) or `host` | K3G:177-220, §13-14 |
| facts / offers / capability doc | Probed facts; derived offers with blocked reasons; `kiln-capabilities/1` | K3G §15-18 |
| workload kind | `@kiln/exec` module: `validate / contentId / stage / lower / import` | K3G §19.1 |
| collector | Wrapper, in-process or sidecar observer declaring what it `disturbs` | K3G §20; K3G:1302-1315 |
| capture (KILN-003) | variant × mode × collectors × protocol × host; identity `kiln-capture/1` excludes host | K3G §21.1 |
| plan / step / job | `kiln-plan/1` marks each capture execute, cached or blocked; driver steps; one job API | K3G §22, §24; K3D:363-366 |
| conditions | Run context (co-tenants, utilisation), never identity | K3G §22.5; MP3-G:802-814 |
| GPU lock | Advisory `flock /run/lock/kiln-gpu-<uuid>.lock` with a holder file | K3G:1581-1597; `runner/kiln_driver.py:1035` |
| `HostDevice` | Page device `host:<id>` adopting the evidence device its records name | K3D:525-528 |
| result archive / blob | Driver output archive; content-addressed upload under `<root>/blobs` | K3G:811-831 |
| host profile (ML-PERF-003) | `.data/hosts.json` with ssh, root, image, limits; superseded by `kiln-hosts/1` | MP3-G:431-453; K3G §13.1 |
| co-tenant | Another process on a shared GPU; recorded, not refused | MP3-G:814-819 |

## 5. Components and their status (as the tickets claim, checked where cheap)

| Component | Ticket | Status 2026-10-21 | Evidence |
| --- | --- | --- | --- |
| Perf Lab app (`lab-workbench/`) | ML-PERF-001/002 | **Built**, frozen copy in Kiln | verbatim at PB `cdb84891c` (`92daa13`) |
| Perf Lab Python package `spikes/performance-lab/perf_lab` | ML-PERF-001 guide | **Planned, superseded** by the prototype | `MP1/design/01-…md:721-740` |
| `lab.js` language | ML-PERF-001 | **Built** twice (`lab-workbench/src/lang`, `packages/lab/src/lang`) | K1D09:169-173 |
| Perf Lab runner, synthetic, evidence and dino paths | ML-PERF-001/002 | **Built** in `lab-workbench` only; not wired into Kiln | MP1-BE:385; K1D10:573-575 |
| SSH container executor for dgx | ML-PERF-003 | **Superseded** (never built) | `MP3/index.md:21-24` |
| `@kiln/kiln` compiler | imported zip | **Built** (imported, then moved into the workspace) | K1D01:338-339 |
| Swiss visual language / six CSS files | KILN-001 Phase 1 | **Built** | `f966df8` |
| `@kiln/evidence` | KILN-001 Phase 2 | **Built** | `6f01ff0`; 125 tests |
| Records, `EvidenceStore`, `decide.evidence` v2 | KILN-001 3a | **Built** | `a62ae31` |
| Hypotheses (Kiln) | KILN-001 4 | **Built** | `8d97886`, `46cf8c0`, `d112fd9` |
| WebGPU repetition protocol | KILN-001 3c | **Built** | `8937ab8` |
| `apps/server` (Hono + SQLite, SSE, token) | KILN-001 5a | **Built** | `b0b3bc6` |
| CUDA executors (runner over SSH) | KILN-001 5a | **Superseded / deleted** | `49f5156` |
| Paired comparison and Compare panel | KILN-001 6 | **Built** | `da7e416`, `ee37c4c` |
| Agent sandbox worker, model gateway | KILN-001 7 | **Built**; no gateway timeout or concurrency cap | `55e6b2e`; K1D01:1898-1900 |
| `@kiln/lab`, `/api/lab`, `lab:import`, boards in dock | KILN-001 8a–8c | **Built** | `b020aa6`, `aa2dcc2`, `1d31e9d` |
| Entity graph (8d) | KILN-001 | **Partial**: edges emitted by `@kiln/exec`, no board, task open | §3.6 |
| Lab live refresh on `catalog.changed` | KILN-001 | **Planned** | `KT1/tasks.md:24` |
| `kiln-program/1` export, launchers (TS WebGPU, Python wgpu + CUDA) | KILN-002 P0 | **Built** | `f272c11`, `aa0f0b4`, `7bcfc06` |
| Example A (factory-videos GPU similarity) | KILN-002 | **Built**, in the FVK branch only | FVK `3bc92785` |
| Example B (grey kernel, W-27) | KILN-002 | **Planned, abandoned** after B1 refuted it | `KT2/tasks.md:16-19` |
| Example C (`REDACTION_MASK_POST=kiln`) | KILN-002 | **Built** on PK2, unmerged; default `cpu`; refuted as a whole-service win on GB10 | PK2 `cdfb0d8c9`; K2D:1670-1671 |
| `kiln-perf` image, `kiln-probe`, `gb10` spec | KILN-002 | **Built**; amd64 untested, image not published | `3c71c0d`; K2D:1403-1406 |
| `run-on-gpu-host.sh` | KILN-002 RG | **Built** | `450fbd0` … `9d409d1` |
| `kiln-paired/1` importer (PE) | KILN-002 | **Blocked**, records waiting in `KT2/various/a4/records/` | `KT2/tasks.md:25` |
| Sweep as a job (SW) | KILN-002 | **Planned** | `KT2/tasks.md:32` |
| `@kiln/exec` model, planner, offers, kinds, collectors | KILN-003 P0/P1 | **Built** | `49f5156` |
| `kiln_driver.py` HTTP driver | KILN-003 P0/P1 | **Built**; unauthenticated by decision | `runner/kiln_driver.py`; K3G:808 |
| `kiln-kernels/1`, `perf-lab-sampler/1` kinds | KILN-003 | **Built** | `packages/exec/src/kinds/` |
| `kiln-probe/1` kind | KILN-003 P1 (checked) | **Not built** (checkbox wrong) | grep: only `runner/docker/kiln-probe.cu:174` |
| `ncu` / `nsys` collectors | KILN-003 P2 (open) | **Partial**: code exists (`packages/exec/src/collectors/{ncu,nsys}.ts`, `apps/server/src/exec/nsys-sqlite.ts`), no counters on hosts | `KT3/tasks.md:7, 12` |
| `kiln_launch.py bench`, in-program records | KILN-003 P3 | **Planned** | K3G:1153 |
| `playback-dino/1`, synthetic-host removal, table migration | KILN-003 P4 | **Planned** | `KT3/tasks.md:9` |
| `playback-redaction/1`, stage timers | KILN-003 P5 | **Planned** | `KT3/tasks.md:10` |
| `torch-function/1` | KILN-003 P6 | **Planned** | `KT3/tasks.md:11` |
| Driver unit tests `runner/test/test_driver.py` | KILN-003 §33.2 | **Not built**; driver is tested through `apps/server/test` | `49f5156` body |

## 6. Where Kiln and Perf Lab were copied, merged or linked

| # | Relation | From → to | Kind | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Perf Lab copied whole; `.data/`, `dist/`, `node_modules/` and `.venv/` are on disk but gitignored (`K/README.md:27-28`) | `PB/…/experiments/lab-workbench` → `K/lab-workbench` | Verbatim copy, never edited since | `92daa13`; K1D01:42-46; `diff -rq` empty |
| 2 | Kiln zip | → `K/imports/kiln-workbench-src` (bundles unreviewed) | Verbatim import | K1D01:130-131 |
| 3 | Kiln core and std | `imports/…` → `packages/kiln` | `cp -R`, prefixes changed | K1D01:338-339, 377-378 |
| 4 | Perf Lab language | `lab-workbench/src/lang` → `packages/lab/src/lang` | Port, mostly mechanical; 3 files rewritten | K1D09:169-173, 302-304 |
| 5 | Perf Lab server store, datasets, evidence, tar | `lab-workbench/server/*` → `apps/server/src/lab/*` on `lab_*` tables | Port | K1D10:181-184 |
| 6 | Perf Lab data store | `lab-workbench/.data/perf-lab.sqlite` → Kiln DB via `lab:import` (temp copy of db + WAL) | One-way import | K1D10:544-564, 603-605 |
| 7 | Perf Lab views | Boards rendered as Kiln dock views (`apps/workbench/src/ui/lab/*`) | Re-implemented UI | K1D01:2053-2067 |
| 8 | Perf Lab probe | Python `workloads_revision` re-derived in TS (`probe.ts`, deleted in `49f5156`) | Reimplementation | K1D01:2111-2115 |
| 9 | Capture hash | cyrb53 in four places (§3.2) | Copies | §3.2 |
| 10 | Protocol rules | Kiln's and the server's copies → `@kiln/evidence/src/protocol.ts` | Duplicate collapsed | K1D01:1217-1220 |
| 11 | Verdict function | `HypothesisView.tsx` → `@kiln/evidence` / `evaluateHypothesis` | Moved | K1D09:818-826; K1D09:63-64 |
| 12 | Lab presets metadata | `LAB_META` (workbench) vs `PRESET_INFO` (`@kiln/lab`) | Duplicate collapsed | `31b769f`; K3D:923-926 |
| 13 | Perf Lab sampler workload | `lab-workbench/workloads/perf_lab_local` → kind `perf-lab-sampler/1` in a `perf-lab-cpu` container | Wrapped | `8276bf7` |
| 14 | Launcher → Playback | `K/runtime/python/kiln_launch.py` → `PK2/services/redaction/src/kiln/kiln_launch.py` + `mask_post.json` | Vendored; sha256 verified, hash test | K2D:734, 751-758 |
| 15 | Launcher → factory-videos | `kiln/launch.ts` + program-set JSON → FVK `web/live/views/similarity/kiln/` | Vendored | K2D:414 |
| 16 | Kiln → GPU hosts | git bundles to bling, side ref to dgx, local registry on bling | Ad hoc forks | K2D:830, 1015-1017, 1615-1617 |
| 17 | Kernel ↔ consumer identity | `kiln-program/1` identities, symbol suffix, `corresponds_to` edges | Designed link | K2G:1088-1135; `packages/exec/src/runs.ts:57` |
| 18 | ML-PERF-003 → KILN-003 | Section-by-section mapping; open tasks moved to P4 | Supersession | K3G:1852-1874; `MP3/changelog.md:19-21` |
| 19 | Playback test logic | Python `compare_ground_truth` → TS `detections.ts`, pinned by a golden test | Port with enforcement seam | MP2-G:567-574 |

## 7. Open tasks, consolidated (verbatim text in section 2)

| Ticket | Task | Note |
| --- | --- | --- |
| ML-PERF-001 | Qualify DGX tools and deliver the DINO vertical slice (`MP1/tasks.md:8`) | Overtaken by KILN-003 P4 |
| ML-PERF-001 | Embedding, memory, CPU PMU and contention experiments (l.9) | No ticket owns it; embedding PR 1008 only ever existed as synthetic Scenario B |
| ML-PERF-001 | `rtne` remote executor for `playback@dgx` (l.16) | Still open; superseded via ML-PERF-003 → KILN-003 |
| ML-PERF-002 | `cevg` DGX executor and production prompt-sequence workload (l.11) | → KILN-003 P4 |
| ML-PERF-003 | Phases 0–5 (all) | Closed superseded; "open tasks move to KILN-003 phase P4" |
| KILN-001 | Vault report box (l.22) | Done in fact (`534ff7f`, `43572ed`, `4fc3320`), box unticked |
| KILN-001 | 8d entity graph (l.23) | Partly overtaken (§3.6) |
| KILN-001 | `catalog.changed` refresh; mirror caption at 390 px (l.24) | Open |
| KILN-002 | B2–B5 (l.16-19) | Abandoned unless the Spark shows otherwise; "B on Spark" never run (l.24) |
| KILN-002 | C4 on RTX PRO 6000 (l.23) | Needs SSH to `playback@playback-rtx-dev` |
| KILN-002 | PE importer (l.25) | Blocked; overtaken by KILN-003's single import pipeline |
| KILN-002 | `3nev` C4.d: what preprocess waits on (l.28) | → KILN-003 P5 |
| KILN-002 | `test_trt_engine_raw.py` flaky (l.30) | Fix belongs in Playback |
| KILN-002 | `udht` sweep as a job (l.32) | Folded into P1's job body (K3D:177), not built as a view |
| KILN-002 | Playback `docker-compose.yml` line uncommitted (l.22) | Pre-commit cannot pass on macOS |
| KILN-003 | P2–P6 (l.7-11) | Open |
| KILN-003 | Counters on bling: `NVreg_RestrictProfilingToAdminUsers=0` + reboot (l.12) | Needs the user's go-ahead; dgx is its owner's call (K3G:2142) |
| KILN-003 | `kiln-probe/1` kind | Unbuilt although P1 is ticked |

Unticketed follow-ups the diaries name:

- fix the cost model's gather accounting (K2D:1562-1563);
- choose W-28 schedules with the tuner (K2D:1785-1786);
- report the GB10 result in Playback's `docs/vision/redaction-performance.md` (K2D:1790);
- gateway timeout and concurrency cap (K1D01:1906-1907);
- port `test/ui.mjs` off Playwright (K1D01:1905);
- a protocol for between-session spread (K3D:966-967);
- where the server runs for two-host work with dgx (K3G §32).

## 8. Hosts

| Host | Hardware | Role in history | Source |
| --- | --- | --- | --- |
| Mac (Apple M1 Pro, 10 cores, 32 GiB; Chrome 155 headless; Node 26.8.1) | Metal 3 GPU, 16 cores | Every Perf Lab CPU run; every Kiln WebGPU/wgpu run; KILN-003 server and a CPU driver on `127.0.0.1:5381` | MP1-D4:163; K1D04:37; K3D:818-821 |
| `dgx` = `playback@dgx` (`gx10-b2d2`, ASUS GX10) | GB10, CC 12.1, driver 580.159.03; Ubuntu 24.04.4 aarch64 | ML-PERF-003 inventory; KILN-002 first NVIDIA run and W-28 timing. Shared: 6 resident CUDA processes, 13 containers, ~8.4 GB GPU memory. Tailscale `100.103.58.32`; not deployed in KILN-003 | MP3-G:318-334; K2D:996-1000; K3D:280-281 |
| `bling` (`manuel@bling.local`, DGX Spark) | GB10, driver 580.178.04, freshly installed, idle | C4, PN, `kiln-perf`, the KILN-002 Kiln server (`spark`), and the KILN-003 driver (tunnel 5481) | K2D:1002-1004, 2180-2276; K3D:822-823 |
| `playback@playback-rtx-dev` | RTX PRO 6000 | Never reached; `post-moves-to-gpu` open | K2D:1787-1788 |
| RTX 5090 | spec only | `rtx5090` target (170 SMs, 1792 GB/s); the old fallback used 48 SMs | K2D:1426, 1473-1474 |

## 9. Results that decided something

| Claim | Result | Verdict | Source |
| --- | --- | --- | --- |
| `compile-removes-intermediate` (sampler, M1 Pro CPU) | Compiled 2.50× *slower* (2.37–2.72); still one intermediate-sized block | Refuted | MP1-BE:391-393 |
| PR 1005 `latency-halved` (dgx archive) | Reduction 0.303 [0.301, 0.306] | Refuted | MP2-G:728-735 |
| PR 1005 `memory-within-20` | Warm cgroup +25.5 % / +23.2 % | Refuted | MP2-G:728-735 |
| PR 1005 `outputs-exact`, `prompt-reuse`, `fusion-active`, `cpu-parts-preserve` | 512/512 exact; 0 recaptures over 80 requests; `fused_sampling` 18 launches; 1,665 → 1,654 ms | Supported | MP2-G:728-737 |
| W-05 thread vs row (WebGPU, M1 Pro) | 0.0079 [0.0072, 0.0083], n=7 | Supported | `KT1/changelog.md:86` |
| `gpu-rebuild-1385`, `cap-lift-interactive` (Example A) | GPU/CPU 0.029 [0.024, 0.031]; GPU + paint 75.9 ms | Supported | K2D:456-477 |
| `gray-is-worth-a-kernel` (Example B) | Grey 9.3 % of the session against a 20 % bar; `videoconvert` 4.4 ms/frame | Refuted | K2D:546-552 |
| W-28 exactness | 0 of 67.3 M reference pixels; 0 of 269 M kernel pixels | Exact | K2D:787, 795 |
| W-28 stage speed (dgx, 100 masks 768×416) | 6.8× (3.34 vs 22.63 ms) | — | K2D:1155-1168 |
| `gb10-unchanged-or-better` (C4 on bling) | Throughput 0.974 / 0.971 / 0.968, repeated as 0.987 / 0.958 / 0.964; preprocess +3.1 ms/frame | Refuted | K2D:1670-1685, 2040-2056 |
| Kiln cost model on GB10 | W-28 over-predicted 6.6–115× (gathers billed as uncoalesced) | Model defect | K2D:1505-1513 |
| `kiln-probe` on idle Spark | 259 GB/s read, 28.9 TFLOP/s FMA, 2.4 µs launch | → `gb10` spec | K2D:1315-1327 |
| Sampler on two hosts (KILN-003) | Mac 1.43×, bling 1.08×; Mac drifts 1.43–1.68× across sessions | — | K3D:858-900, 933-938 |

## 10. Recurring pain points across tickets

1. **Rendering and end-to-end runs find what unit tests do not.**
   - MP1-D3:401: "Language tests that assert evidence … caught none of these; rendering every board did".
   - MP1-D4:428: the run-identity data loss.
   - K1D01:2108-2115: "0 of 8 measured".
   - K3D:907-921: two identity bugs found only by deploying.
2. **Identity is fragile at every seam.** Each of these minted an identity that matched nothing:
   - cyrb53 normal form (`877c273`);
   - CPU-on-GPU device (`c746899`);
   - kernel-name content ids (K1D01:1041-1046);
   - per-route device ids (K1D01:1312-1315);
   - run identity by reference (MP1-D4:399);
   - container hostnames (K2D:1387-1388);
   - import-time record ids (K3D:420-421).
3. **Stale long-running servers.**
   - "A long-running server is part of the system under test" (MP2-D:299); the stale Perf Lab server minted synthetic
     evidence.
   - The Kiln server on `127.0.0.1:5380` has run since 2026-10-20 23:46.
4. **Hand-deleted data.** Hand-written SQL deletes (MP2-D:290, 291, 408). The Evidence view's Forget lost 9 of 11 jobs'
   records (K2D:2289-2292).
5. **Security posture moves.**
   - Unsandboxed `new Function` in Perf Lab (MP1-D3:280).
   - The `X-Kiln-Proposer` header is self-declared (K1D01:1286-1288).
   - The gateway has no timeout (K1D01:1898-1900).
   - The driver is unauthenticated by decision (K3G:808).
6. **Shared GPU hosts.**
   - Co-tenants on dgx move read bandwidth 19 % (K2D:1383-1384).
   - Throughput swings ~2.2× (MP3-G:335).
   - Mac ratios drift between sessions (K3D:933-938).
7. **Copy-and-port as the integration method.** §6 lists 19 relations. Only some have an enforcement seam: `check:pl`,
   the golden matching test, the vendored-launcher hash test and `diff -rq`. The rest rely on nobody editing either side.

## 11. Documentation drift observed (what a reader would get wrong)

**Kiln repository**

- `K/README.md`:
  - l.40 tells users to run `python3 runner/kiln_runner.py serve`; `serve` was removed in `49f5156`;
  - the layout block (l.17-30) omits `apps/server`, `packages/evidence`, `packages/lab`, `packages/exec`, `runtime/` and
    `runner/kiln_driver.py`; `apps/server` has existed since KILN-001 Phase 5a, and the README was last touched in
    `3c71c0d` (KILN-002).
- `KT3/design-doc/01-…` predates what was built:
  - no `perf-lab-sampler/1`;
  - says cyrb53 is replaced (l.703) and Mac CPU runs are lost (l.697);
  - shows bling's driver on the LAN at 5281 (l.2157-2158), but the deployment uses a 5481 SSH tunnel.
- `KT3/scripts/01-verify-measure-context.mjs` still uses `server:spark` on port 5280; both were deleted in Steps 3–4.
- Task boxes disagree with the code:
  - `KT3/tasks.md:6` ticks P1, including `kiln-probe/1`, which does not exist;
  - `KT1/tasks.md:22` leaves the vault reports unticked, although they were pushed.
- Index status lines:
  - `KT2/index.md` says "Status: guide written";
  - `KT3/index.md` says "no phase implemented yet".
- The KILN-001 guide promised `--flush-l2`, which does not exist (`KT2/sources/02…:63-67`).
- The KILN-001 guide describes `CudaRunnerExecutor` and the SSH runner path (§20.5, l.1139-1178; D10, l.1970) and says
  lab jobs answer 501 (§33.1, l.1932). KILN-003 deleted the executors and replaced the lab job routes, so both
  statements are history now.

**ML-PERF tickets**

- MP1-RM:25-29 says synthetic-only.
- MP1-RM:100 and MP1-UI:336 say nine presets; there are 11.
- MP1-SPEC:42 and :680 say synthetic data and in-memory storage.
- MP1-BE:383 says three migrations; there are five.
- MP3-G:122 says the capture hash is SHA-256; it is cyrb53.
- MP2-D:359 and MP2-G:737 give different car confidences.

**Playback branch PK2**

- The compose comment and the commit body say mask post-processing is "Not yet measured on a host"; C4 measured it.
- The `validate_on_host.sh` docstring overstates the ground-truth gate (K2D:1779-1781).

**Frontmatter**

- `LastUpdated` is unreliable in KILN-001's diaries (K1D01, K1D04, K1D06, K1D08). Use git times instead.
