# ML-PERF-001 / 002 / 003: what the diaries and design docs record

Everything below comes from reading the files listed. I modified nothing.

**Root:** `/Users/manuel.odendahl/code/tulip/playback/.worktrees/docs-ml-perf-001-perf-explorer/ttmp/2026/10/12/`

**Abbreviations used in citations** (all paths are relative to the root):

| Key | File |
|---|---|
| D1 | `ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/reference/01-research-and-delivery-diary.md` |
| D2 | `ML-PERF-001--…/reference/02-visualization-capabilities-and-evidence-contract.md` |
| D3 | `ML-PERF-001--…/reference/03-workbench-prototype-diary.md` |
| D4 | `ML-PERF-001--…/reference/04-perf-lab-backend-implementation-diary.md` |
| D5 | `ML-PERF-002--studying-grounding-dino-pr-1005-in-the-perf-lab-evidence-import-images-detections-and-datasets/reference/01-implementation-diary.md` |
| D6 | `ML-PERF-003--running-perf-lab-experiments-on-the-dgx-an-ssh-executor-for-containerized-gpu-captures/reference/01-implementation-diary.md` |
| G1 | `ML-PERF-001--…/design/01-intern-guide-to-reproducible-profiling-and-execution-visualization.md` |
| SPEC | `ML-PERF-001--…/design/02-lab-language-specification.md` |
| UI | `ML-PERF-001--…/design/03-workbench-ui-design.md` |
| BE | `ML-PERF-001--…/design/04-perf-lab-backend-end-to-end-design.md` |
| G2 | `ML-PERF-002--…/design/01-intern-guide-studying-grounding-dino-acceleration-in-the-perf-lab.md` |
| G3 | `ML-PERF-003--…/design/01-intern-guide-running-perf-lab-experiments-on-the-dgx.md` |
| RM | `ML-PERF-001--…/experiments/lab-workbench/README.md` |
| SRC | `ML-PERF-001--…/sources/README.md` |
| T1 | `ML-PERF-001--…/tasks.md` |
| T3 | `ML-PERF-003--…/tasks.md` |
| CL3 | `ML-PERF-003--…/changelog.md` |
| IX3 | `ML-PERF-003--…/index.md` |

---

## 0. Components in `experiments/lab-workbench/`

This is a standalone pnpm root (D3:240).

**Top level:** `server/`, `workloads/`, `src/`, `scripts/lab.ts`, `vite.config.ts`, and git-ignored `.data/`.

**`server/`**
- `app.ts`: Hono HTTP + SSE routes.
- `db.ts`: `node:sqlite` with a numbered `MIGRATIONS` array (5 migrations by end of ML-PERF-002).
- `store.ts`: catalog, artifact and run inserts, synthetic seeding.
- `runner.ts`: job execution. It has process, synthetic, evidence-import (`importEvidence`) and `runDino` paths.
- `importer.ts`: native sampler output → `{run, entities, links}` bundles.
- `qualification.ts`: the `detection-qualification/v1` importer.
- `evidence.ts`: archive registration.
- `tar.ts`: an in-memory ustar/pax reader and writer.
- `datasets.ts`: COCO dataset registration, materialization, media.
- `dino.ts`: the local DINO workload driver (`runDinoRepetition`, `playbackRepo`).
- `probe.ts`: local capability probe.
- `bundles.ts`, `events.ts`, `config.ts`, `index.ts`.
- `assistant/model.ts`, `prompt.ts`, `service.ts`: pi model catalog, prompt, turn protocol.
- Tests: `server.test.ts`, `assistant.test.ts`, `evidence.test.ts`, `qualification.test.ts`.

**`workloads/`** (a uv project: Python 3.12, torch 2.14.1)
- `perf_lab_local/`: `probe.py`, `sampler.py` (the `unfused`/`gather`/`compiled` implementations), `run.py`.
- `perf_lab_dino/run.py`: runs Playback's real Grounding DINO backend at two revisions.

**`scripts/lab.ts`:** the `pnpm lab` CLI (`evidence add|list`, `datasets list|materialize`, `models fetch`).

**`src/lang/`:** the lab.js runtime.
- `builders.ts`: Proxy-based fluent recorder.
- `params.ts`: 12 parameter kinds and the URL codec.
- `query.ts`, `rows.ts`: lazy queries, grouping, aggregation.
- `values.ts`: provenance-carrying values and `ProvenanceError`.
- `build.ts` (1,030 lines): the passes, `lowerWorkload`, `selectImages`.
- `runtime.ts`: `$`, memoized derives.
- `stats.ts`: paired ratio, bootstrap, `offered`.
- `compare.ts`; `algo.ts` (illustrative walkthroughs); `detections.ts` (TypeScript port of the PR's matching).
- `library.ts`, `env.ts`, `ir.ts`, `refs.ts`, `util.ts` (the cyrb53 hash).
- `__fixtures__/quality-golden.json`.
- Tests: `build.test.ts`, `detections.test.ts`, `evidence.test.ts`.

**`src/presets/programs/`:** `hello`, `parameters`, `request-to-kernel`, `compare`, `learn`, `matrices`, `scenario-a` (plus `.replies.txt`), `scenario-b`, `scenario-c` (plus `.replies.txt`), `local-sampler`, `dino-pr1005`. That is 11 programs.

**Other `src/` folders**
- `src/data/`: `capabilities.ts`, `generate.ts` (synthetic runs), `source.ts`, `bundles.ts`, `datasets.ts`, `env.ts`.
- `src/features/`: `agent`, `annotations`, `build`, `catalog`, `jobs`, `params`, `program`, `selection`, `server`, `signals`, `ui`. The `agent` folder holds `builtins.ts`, `runtime.ts`, `context.ts`, `agentSlice.ts`.
- `src/services/`: `labApi.ts` (RTK Query), `server.ts`.
- `src/lib/`: `tex.ts`, `texFonts.ts`, `yaml.ts`, `highlight.tsx`, `format.ts`, `params.ts`.

**Components**
- 17 atoms, including `ProvenanceGlyph`, `BindingBadge`, `TexMath`.
- 18 molecules, including `DetectionOverlay`, `DataBlock`, `CodeBlock`, `Splitter`.
- 15 organisms, including `AgentRail`, `LabTab`, `PlanTab`, `TranscriptLibrary`, `BoardSheet`.
- 19 views: Batch, Chart, Control, Detections, Gallery, Hypothesis, KernelCard, Ledger, Manifest, Mirror, Route, RunList, Source, Stat, Stepper, Table, Text, Timeline.

**Ticket scripts** (`ML-PERF-001--…/scripts/`): `01-archive-sources.py`, `02-workbench-headless-check.mjs`, `03-backend-e2e-check.mjs`. ML-PERF-002 adds `01-quality-golden.py`, `02-dgx-import-headless-check.mjs` and `03-detections-board-headless-check.mjs` (D5:196, D5:272).

**`sources/` (SRC):**
- 17 official manuals extracted with defuddle into `upstream/`: Nsight Compute/Systems, Spark, PyTorch 2.14 memory/CUDA/profiler, Linux perf, Perfetto, Memray, Compute Sanitizer, CUDA (SRC:25-41).
- 25 pinned implementation files from `d59d9ad01543` (DINO) and `3496baeda030` (embedding), stored as inert `.txt` with original line numbering (SRC:21, 47-71).
- 3 prior vault reports (SRC:72-74).
- Manifests: `local-manifest.json`, `web-manifest.json`, `source-map.txt` (SRC:19-21).

---

## 1. What was built in each diary step

### ML-PERF-001, research diary (D1)

**Step 1 (D1:21-80)**
- Created the ticket. Wrote the intern guide (about 10,100 words) and the functional visualization handoff, D2 (about 1,650 words) (D1:144).
- Pinned objects: DINO `d59d9ad0154331795d083afcddae5cbadf2535a0` and embedding `3496baeda030c7f24fd88ce013ecf0d38e4a17cf` (D1:52).
- "no new profiling run or product implementation is claimed" (D1:23).

**Step 2 (D1:82-138)**
- Archived 28 local documents and 17 web manuals; added `scripts/01-archive-sources.py` (D1:96-100).

**Step 3 (D1:140-151)**
- `docmgr doctor` passed. Integrity check: `PASS: 28 local hashes; 17 web archive hashes; 55 local links` (D1:146).
- Uploaded to reMarkable (D1:148-149). "No commit or push was made" (D1:151).

### ML-PERF-001, workbench prototype diary (D3)

**Step 1 (D3:35-103)**
- Created the branch and worktree off `origin/main` (D3:62). Commit `e0b4e9ece` (D3:55).
- Wrote 17 graded API examples in chat (D3:64). The grammar is copied from Lattice Deck (D3:39).

**Step 2 (D3:105-159)**
- Observed Lattice Deck rendered (sha `ad5d12ae…`, D3:122). The vocabulary is recorded in UI §2.

**Step 3 (D3:161-220)**
- Wrote SPEC, UI and the D3 diary. Commit `888034eb2` (D3:439).

**Step 4 (D3:222-295)**
- Built the `src/lang` runtime, the `src/data` synthetic layer and nine presets. Commit `2f6ce7025` (D3:236).
- 20 vitest cases (D3:226, D3:254).
- Build stats: for example `scenario-a` takes 9.7 ms for 44 nodes and 8 captures (D3:255).

**Step 5 (D3:297-357)**
- Built the RTK store (ten slices plus `labApi`), routes, and components: 16 atoms, 16 molecules, 13 organisms, 16 views. Commit `1f4d7951a` (D3:311, D3:315-318).

**Step 6 (D3:359-423)**
- Validated every preset in Chrome and fixed modelling bugs (section 3 below).
- `pnpm test`: 21 passed. `pnpm build`: ✓ (D3:378). Committed in `68c47c09f` (D3:442).

**Step 7 (D3:425-453)**
- Docs reconciled. Commit list at D3:439-442. Task `5448` (wire real artifacts) opened (D3:452).

**Step 8 (D3:455-478)**
- Ran the Vite dev server in tmux session `perf-lab` on port 5199 (D3:469).

**Step 9 (D3:480-539)**
- Splitters, collapse rails, ⌘B / ⌘⌥B, layout persisted in `localStorage`. Commit `77c7f70a4` (D3:493).

**Step 10 (D3:541-599)**
- One built-in assistant. Commit `7316c7ecc` (D3:553). 24 tests (D3:571).

**Step 11 (D3:601-664)**
- MathJax 4, bundled and lazy-loaded. Commit `e5414141e` (D3:613). 29 tests (D3:633).

**Step 12 (D3:666-725)**
- Accent colour and six-hue data palette. Commit `db723c5d1` (D3:678). Contrast was computed (D3:696).

**Step 13 (D3:727-786)**
- Headless CDP check script. Fixed red formulas and colliding labels. Commit `ad08d0437` (D3:739).

**Step 14 (D3:788-796)**
- Docs reconciled. 29 tests.

### ML-PERF-001, backend diary (D4)

**Step 1 (D4:33-97)**
- Vault report, about 6,800 words with 5 Mermaid diagrams (D4:59). Vault commit `6419be5`, pushed (D4:52, D4:60).

**Step 2 (D4:99-163)**
- Probed pi 0.87.1, lunaroute, `node:sqlite` and uv/torch. Wrote BE (D4:115-122).
- Machine: Apple M1 Pro, 10 cores, 32 GiB, Node v26.8.1 (D4:163).

**Step 3 (D4:165-236)**
- Hono server, SQLite migration 1, uv workloads, runner, importer. Commit `90dfd0ff1` (D4:179). 8 server tests (D4:187, D4:202).

**Step 4 (D4:238-308)**
- Browser on the server (catalog, measured bundles, jobs over HTTP + SSE).
- New `local-sampler` preset. Commit `2a1c166dc` (D4:250). 41 tests (D4:270).

**Step 5 (D4:310-381)**
- Live assistant through pi on lunaroute. Migration 2. Commit `7a5aa39a3` (D4:324). 46, then 47 tests (D4:348).

**Step 6 (D4:383-449)**
- `03-backend-e2e-check.mjs`. Migration 3. Commit `49705ae6d` (D4:395). 47 tests (D4:415).

**Step 7 (D4:451-459)**
- Docs reconciled.

**Step 8 (D4:461-556)**
- Model menu, transcript library (migration 4), YAML/JSON data blocks, Lab tab, bottom dock.
- Commits `1d1af2586`, `21f7aa2ba`, `c7e55c506`, `45a48ebf3`, `8891ddb90`, `da6b6d185`, `a563ae110` (D4:483-489). 54 tests (D4:514).

### ML-PERF-002 (D5)

**Step 1 (D5:33-106)**
- Read the PR, the archive and the lab code.
- Wrote G2: 13 sections, 6 decision records, 3 diagrams (D5:64).

**Step 2 (D5:108-176)**
- Migration 5: evidence archives, datasets, public media (D5:126-131).
- Commit `202b4bc31`; ticket and guide `58af2c81c` (D5:122).
- Evidence tests: 7. Total: 61 tests (D5:142, D5:145).

**Step 3 (D5:178-246)**
- Matching port, qualification importer, plan status `import`. Commit `ef084172b` (D5:192). 100 tests (D5:213).

**Step 4 (D5:248-321)**
- `detections` and `gallery` views; `dino-pr1005` preset; server `features` handshake. Commit `2eb8a882b` (D5:262). 102 tests (D5:286).

**Step 5 (D5:323-393)**
- `workloads/perf_lab_dino` and `Runner.runDino`. Commit `d6b6a3861` (D5:337). 103 tests (D5:360).

**Step 6 (D5:395-401)**
- Docs reconciled. The diary names no hash; the branch's git log shows `bf2914296`.

**Step 7 (D5:403-410)**
- Halo-order fix and Inductor-prefix kernel roles. The diary names no hash; the git log shows `cdb84891c`.

### ML-PERF-003 (D6)

**Step 1 (D6:27-98)** is the only step.
- Research, a read-only SSH inventory of the DGX, and G3 (1,027 lines).
- Six phase tasks were created (T3:4-9). No implementation was done.
- G3 was uploaded to reMarkable twice: the first upload had a broken diagram, the second fixed it (D6:68, D6:97).
- On 2026-10-20 the ticket was **superseded by KILN-003**: "This design was not implemented" (IX3:21-24, CL3:21).

---

## 2. Explicit decisions and their rationale

### Language and workbench

**Content-addressed IR; functions never enter the IR.**
- Lambdas are stored as source text plus a registry entry, so the IR stays diffable and Redux-safe (D3:249; SPEC:60, SPEC:653).
- The capture hash is cyrb53 over the stable-stringified lowered spec (D3:295; `src/lang/util.ts:1`, "Not cryptographic; identity only").

**A lambda's phase is set by its slot and wrapper, not by inspecting its source.**
- "Source inspection was rejected: it cannot be made reliable" (SPEC:652).

**A parameter's binding is inferred from its readers** (`plan > data > view`).
- One `param()` construct instead of three, because "the same parameter (e.g. `window`) legitimately moves between data and view" (D3:165, D3:186; SPEC:367, SPEC:654).
- Plan-bound values are part of the content hash; otherwise two runs with different `processes` would share an identity (D3:199; SPEC:377).

**Plan-bound changes become a pending plan and never execute by themselves.**
- "Starting a GPU job from a slider drag would be unsafe on a shared host" (SPEC:375, SPEC:657).
- If every hash already exists, the change applies immediately (D3:207; SPEC:373).
- While pending, the board keeps the old evidence and marks it "STALE FOR CURRENT PARAMETERS" (D3:203).

**Synthetic data is generated per (capture hash, repetition)**, so a plan-bound change genuinely has no evidence until imported (D3:250).

**Proxy-based recording.** Unknown methods are linted rather than thrown (D3:248, D3:575).

**One built-in assistant replaces program-declared agents.**
- `.agent()` was removed by the second-consumer test: "it had no consumer in this workbench" (D3:543, D3:566).
- SPEC: "instantiating ad hoc agents per program added configuration without adding evidence" (SPEC:485, SPEC:655).
- Suggestions must be real actions on the current board (repo design principle 4) (D3:567).

**Assistant policy.**
- It may read evidence, annotate, move the view, set parameters, plan and propose runs.
- **30 GPU-minute budget**, on hosts the lab declares; every proposal needs a person (D3:543; SPEC:491; `src/features/agent/builtins.ts:8` has `budgetGpuMin: 30, approval: 'human'`).
- Forks inherit their parent's host, so a program cannot widen the allow-list (D3:587).

**Approval-gated jobs.**
- `lab.start()` returns a `proposed` job (D3:90; SPEC:645).
- A job a person proposes from the pending-plan banner is approved in the same request; an assistant-proposed job waits (BE:237).

**MathJax is bundled, not loaded from a CDN** (works offline). It uses SVG output and lazy loading (D3:627-629).

**Palette.** A deliberate departure from repo design principle 8, at the user's request (D3:713; UI:324). The candidate takes the accent and the baseline a warm sand, so the pair "survives greyscale" (D3:691).

**Layout persistence** is a per-viewer convenience, so it lives in `localStorage` (D3:507).

### Backend

**Persistence and server stack.**
- `node:sqlite` for all persistence, Hono plus tsx, uv/PyTorch for workloads, pi `ModelRuntime` for model access (BE:96-102; D4:130).
- Only the lunaroute extension is loaded (`noExtensions` plus one path), so the user's other pi extensions do not run in the server (D4:126).
- `completeSimple` is called directly, which keeps pi's coding tools away from the model (D4:127).

**The browser keeps the language.** Builds take milliseconds; the server takes everything that must persist (D4:128).

**Paired order.** Repetitions of different arms interleave per repetition index, shuffled by `rng(seed:rep)` (D4:191).

**Failed processes are imported as invalid runs.** "the failure is evidence" (D4:192).

**The server re-hashes every submitted spec** and returns `409 spec_hash_mismatch` on a mismatch (D4:193; BE:241).

**Offline, a `local` capture fails instead of being simulated.** Simulating it would mint synthetic evidence for a host that measures for real (D4:265).

**Arm revision = content hash of the workload sources**, so editing a script produces new hashes (D4:266).

**Model-written code runs in the browser, never on the server.** That keeps one handle-API implementation with its rollback (D4:339).

**At most 4 executions per question.** The stop instruction is put in the last observation (D4:312, D4:340; BE:388).

**Runs are keyed by (hash, rep), not by reference.**
- "A run's identity must include everything that makes it a different experiment" (D4:399, D4:408; BE:397).
- Damaged artifacts were marked `failed`, not deleted, so the evidence trail is kept (D4:408).

**Transcripts: clear archives, delete is the only destructive action.**
- Clearing archives instead of deleting (D4:505).
- A partial unique index enforces one active conversation per board as a database invariant (D4:506).

**YAML by default for every structured value**, "because these values are read, not parsed" (D4:507).

**Executors.**
- `local` runs real processes. `playback@dgx` and `playback@rtx-dev` get a **synthetic executor** that marks artifacts `origin='synthetic'` (BE:243; RM:130-131).
- One job and one process at a time on `local`, "because concurrent benchmark processes would measure each other" (BE:237).

### ML-PERF-002 (formal decision records in G2)

**Public media only** (G2:496-503).
- The `privacy` column admits only `'public'`, and the route re-checks it. This makes "a private frame was served by the lab" impossible rather than discouraged.

**Archives are captures, not uploads of runs** (G2:518-525; D5:68).
- Imports go through plan status `import` and approved jobs, so hash identity and provenance hold.
- One format, `detection-qualification/v1`, serves both archive and local runs (D5:69).

**Matching is computed at import, in TypeScript** (G2:567-574).
- A golden test pins equivalence with the Python: "the golden test is the enforcement seam".

**The backend source runs at its revisions via `git show`**, sharing weights the way the PR benchmark does (G2:682-689; D5:351).

**Validation happens in memory before any write** (D5:136).

**A fetch allowlist plus SHA-256** (D5:138).
- "The fetch allowlist (`publicFetchUrl`) decides *whom* the server talks to; the SHA-256 decides *what* it accepts."

**Optional spec blocks are added only when declared**, so existing hashes stay stable. The non-dino lowering is "byte-for-byte the old one" (D5:206; G3:197).

**Repetition-count check.** A mismatch fails the job with a sentence (D5:207, D5:212).

**Feature handshake.** `/health` reports `features`; a stale server makes evidence captures `blocked` (D5:271, D5:277; G2:744).

**A separate `perf_lab_dino` package**, so the `local-sampler` hash does not change (D5:352; G2:747).

**Missing evidence makes a hypothesis `open`, not `supported`** (D5:347; G2:748).

### ML-PERF-003 (designed, never built)

**Where the lab lives** (G3:351-370).
- Option B was chosen: an SSH container executor from the Mac. Rejected: A (host the lab on the DGX) and C (an agent service on the DGX).
- The job's lifetime is tied to its SSH connection on purpose: "an orphaned GPU process on a shared host is worse than a cancelled job" (G3:370; D6:82).

**Reuse the archive orchestrator's decisions**: image by ID, `--network none`, fresh containers per memory state, the `nvidia-smi` sampler (D6:31, D6:59).

**The container image ID goes into the lowered spec.** This fixes the "synthetic seed" problem and is needed for correct identity anyway (D6:31; G3:513).

**Co-tenancy is recorded, not refused** (D6:83; G3:814, G3:819).

**The assistant may propose a DGX job but cannot approve it** (G3:857).

---

## 3. Defects found and how they were fixed

### Workbench (D3 Step 6, found by rendering every board)

- **Kernels had no `arm` field.** `groupBy` merged the arms (600 = 2×300). Fix: every entity now carries `run`/`arm`/`rep` (D3:391).
- **Open-loop throughput was 3× too high.** `stats.offered` divided all repetitions by one window. Fix: rates are summed per-process; regression test added (D3:392).
- **The memory ledger summed every graph pool ever captured** ("over-capacity 122.6 GiB"). Fix: a peak-retention sweep (D3:393, D3:405, D3:423).
- **Derive rows rendered as observed.** Fix: `__prov: 'derived'` (D3:394).
- **Experiment attribution was wrong** ("14 experiments"). Fix: patterns must be exactly `exp/arm/mode[#rep]`, resolved by glob (D3:395).
- **CSS class collision** on `tl`. Fix: renamed `sheet__mark--tl` (D3:396).
- Smaller formatting fixes (D3:397).

### Workbench, earlier failures

- **`destroy is not a function`.** A `scrollIntoView` Promise returned from `useEffect` was treated as a cleanup (D3:332).
- **TypeScript and test failures in Step 4**, including experiment `.param()` returning a `ParamRef` (D3:261-264).
- **A trace pass could not see a view parameter read only inside `where()`** of a returned query. Separately, derive memoization was missing transitive reads (D3:268-269).

### Red formulas and colliding chart labels (D3 Step 13)

- The CSS rule `.tex mjx-container` coloured every formula with `--bad`. Fix: target `[data-mml-node='merror']` (D3:744, D3:759).
- Category labels overprinted. Fix: rotate 30° plus a `<title>`.
- Log ticks overlapped. Fix: `thinLogTicks` (1·2·5 ticks).
- The graph-cache track overlapped the axis title (D3:745, D3:760-761).
- Stipple pattern ids collided across charts. Fix: `useId` (D3:705).

### MathJax 4

- `mathjax-full@3.2.2` is deprecated. Switched to `@mathjax/src@4.1.3` (D3:637).
- The `double-struck` dynamic file failed to load. Fix: a static lazy-import map plus a direct font dependency (D3:638).

### Backend (D4)

- **`FOREIGN KEY constraint failed`.** Fix: the artifact row is inserted as `running` first; migration 1 was edited in place (D4:206).
- **`pnpm server` is a pnpm built-in.** Scripts renamed to `lab-server` (D4:278).
- **A derive returning a plain array broke `.where()`.** Fix: wrapped as `Rows` (D4:280, D4:254).
- **Hard-coded `SYNTHETIC` chips, a wrong footer claim, and `gpu-min` on a CPU host** (D4:281).
- **Duplicate bundle fetches.** Fix: in-flight requests are shared (D4:282).
- **The assistant's system prompt never arrived.** pi-ai sends a `developer` role, which lunaroute drops; the model answered with 48 input tokens. Fix: `compat.supportsDeveloperRole = false`, plus `promptChars` and an estimate column (D4:314, D4:328, D4:345, D4:352).
- **`Identifier 'q' has already been declared`.** Fix: assistant code runs inside a block (D4:355).
- **Raw Markdown replies.** Fix: the reply is rendered as rich text (D4:356).

### End-to-end defects (D4 Step 6)

- **Run identity (data loss).**
  - `on conflict (ref) do update set hash = …` re-pointed the 2,048-query rows when the plan ran at 1,024 queries.
  - Fix: migration 3 keyed runs by (`hash`, `rep`) (D4:385, D4:399, D4:419).
- **URL hydration race.**
  - The state → URL effect encoded stale values in the same commit as the decode.
  - Fix: it now reads `store.getState()` (D4:400, D4:420).
- **Measured runs not loaded after an immediate apply.**
  - Fix: `evaluatePending` calls `loadMeasured` (D4:401, D4:421).
- **React-Redux selector-stability warning.**
  - Fix: `useMemo` (D4:402, D4:422).
- **Assistant reply handling.**
  - The model answered from stale history, invented `<observation>` blocks and wrote multiple code blocks per reply.
  - Fix: replies end at their first code block, invented observations are stripped, the last observation asks for prose, and there is a rule that earlier turns may be stale. Run handles gained new fields (D4:403, D4:423).

### Round 3 (D4 Step 8)

- **Editor selection made code unreadable.** Fix: a translucent `--sig` selection with transparent text (D4:493, D4:518).
- **Wrong thinking levels.** `thinkingLevelMap` holds overrides, not a whitelist (D4:519, D4:529).
- **Doubled `pre` frame** inside assistant turns (D4:520).
- **Commit `c7e55c506` omitted `AgentRail.tsx`**; `45a48ebf3` added it (D4:521).
- **A flex-basis bug** pushed buttons to a third row (D4:524).

### ML-PERF-002 (D5)

- **COCO TLS certificate mismatch.** Fix: use the S3 path-style URL (D5:149).
- **Planned to parse `tar -tvzf`.** Replaced by an in-process tar reader because GNU tar and bsdtar list differently (D5:112).
- **Golden port failed 26 of 28 cases.** Python's `compare_ground_truth` pops `matched_gt_ids` as a side effect (D5:182, D5:217).
- **The baseline got the candidate's profiler summary.** Fix: report lookup per variant (D5:219).
- **A stale server ran evidence as synthetic.** It produced 28 synthetic artifacts.
  - Fix: the rows were deleted by hand with SQL, then the feature handshake was added (D5:252, D5:290).
- **Duplicate React keys.** The JUnit `name=` regex matched inside `classname=`. Fix: anchored on whitespace, then manual delete and re-import (D5:291).
- **`$.event.entity` should be `$.entity`** (D5:292).
- **Gallery layout.** Uneven portrait tiles (fixed with a 4:3 frame); a viewport query replaced by a container query; the ground-truth legend key was white on white (D5:294).
- **`cpu-parts-preserve` showed "supported" with zero requests** (`[].every` is true). Fix: `missing()` plus an evaluator change (D5:367).
- **A 321 KB transformers progress bar on stderr** would have hidden real errors. Fix: disabled (D5:364).
- **Cross-host layers were both "thin".** Further runs are now dotted (D5:368).
- **Step 7 defects.**
  - The baseline box was hidden under the candidate's halo. Fix: draw all halos first (D5:407).
  - `kernelRole` labelled `triton_poi_fused__to_copy_addmm…` as matmul. Fix: the Triton prefix decides first (D5:408).

### ML-PERF-003

- **Mermaid sequence diagram parse error.** A `;` in the message text ended the statement. Fix: reworded, re-uploaded under a new name.
- Rule recorded: "no `;` inside sequence-diagram message text" (D6:68, D6:98).

---

## 4. Measured results (with hardware)

### Local sampler on the M1 Pro CPU (D4, BE)

Hardware: Apple M1 Pro, 10 cores, 32 GiB (D4:163). Workload: 8 heads, 32 channels, 16 points, 64² map, float32, CPU, 8 threads (BE:393).

| Measurement | Result | Source |
|---|---|---|
| Correctness, `max \|unfused − gather\|` | 7.2e-7 (CPU), 6.0e-7 (MPS) | D4:198 |
| Correctness, compiled vs eager | 3.6e-7 | D4:198 |
| Eager at 2,048 queries, `unfused` | 4.99 ms (CPU) / 3.90 ms (MPS) | D4:199 |
| Eager at 2,048 queries, `gather` | 47.03 / 57.82 ms | D4:199 |
| `torch.compile` at 2,048 queries | 11.34 ms, after a 13.1 s first compile | D4:199 |
| Smoke job medians (1,024 queries) | baseline 2.223 / 2.191 ms; candidate 7.188 / 12.663 ms | D4:201 |
| Smoke job `compileMs` | 4,249.2 (first process), then 800.1 (reused inductor cache) | D4:201 |
| Allocator, 1,024 queries, `unfused` | per request: 16 MiB `aten::empty` in `sample`, 16 MiB `aten::mul`, 1 MiB `aten::sum` | D4:200 |
| Allocator, 1,024 queries, `compiled` | 16 MiB and 1 MiB inside `Torch-Compiled Region: 0/0` | D4:200 |

**First measured lab run at 2,048 queries (D4:271-274)**
- 14 Python processes in 42 s.
- Paired median ratio compiled ÷ eager **2.58×**, 95 % CI 2.18–2.69, 4 paired processes.
- Per-process medians: eager 5.315 / 5.840 / 5.464 / 5.436 ms; compiled 14.110 / 15.721 / 11.903 / 13.626 ms.
- First-request compile: **4,857.9 ms**, then 899.1 / 875.4 / 873.8 ms.
- CPU capture (32 requests): eager user 981 ms, system 111 ms, 2,547 involuntary switches, max RSS 347 MiB; compiled user 2,576 ms, system 98 ms, 3,466 switches, max RSS 490 MiB.
- Hypothesis `compile-removes-intermediate`: **REFUTED**. Eager has 2 intermediate-sized blocks (33,554,432 B); compiled has 1.

**After the run-identity fix (D4:412-414; BE:393)**
- 2,048 queries: **2.50×**, CI 2.37–2.72.
- 1,024 queries: **2.29×**, CI 1.88–2.52.
- CPU at 1,024 queries: user 480.141 ms vs 1,293.300 ms; maxRss 287.5 MiB vs 457.7 MiB (2.69× and 1.59×).
- BE summary: compile time "about 4.9 s with an empty inductor cache and 0.9 s once the shared cache holds the graph".

**Interpretation.**
- "TorchInductor on CPU kept `grid_sampler_2d` as a separate operation and fused only the multiply and reduction" (D4:213).
- "The inductor cache makes `state.compilerCache` a real experimental variable" (D4:214).

**SQLite counts**
- After the first run: 8 artifacts, 14 runs, 1 job, 458 events (D4:272).
- After the end-to-end check: 20 artifacts, 28 runs, 3 jobs, 1,374 events, 5 conversations, 40 messages, 20 model calls (18,945 input / 11,030 output / 3,342 reasoning tokens; 69,476 estimated prompt tokens) (D4:413).

**Prototype figures that are not measurements:** the synthetic 0.492× ratio is "a property of the prototype" (D4:81).

### PR 1005 DGX archive imported (D5, G2)

**Archive identity**
- Archive sha256 `0daa394d641cfbec…`, 55 files, 2,935,445 bytes (D5:73, D5:143).
- Dataset `c435d426e9d2…`: 128 images, 799 annotations, 12 crowd annotations, 5 categories; licences are Flickr CC, several non-commercial (D5:73).
- Only 16 of 128 images have recorded predictions; the other 112 are "digest only" (D5:37, D5:282).
- All 128 images fetched and verified: 22 MB, 0 failures (D5:144).

**Verdicts (D5:281; G2:728-735)**

| Hypothesis | Verdict | Evidence |
|---|---|---|
| `outputs-exact` | supported | 512/512 pairs exact |
| `fusion-active` | supported | `fused_sampling` 18 launches, 17.222 ms, 12.21 % (D5:212); 39 tests passed, 0 failures |
| `latency-halved` | **refuted** | 77.22 → 53.76 ms (0.304) and 76.92 → 53.73 ms (0.301), both 0.303; bootstrap [0.301, 0.306] and [0.300, 0.304] |
| `memory-within-20` | **refuted** | warm cgroup about +25.5 % and +23.2 %; other pools within |
| `prompt-reuse` | supported | reuse arm: 0 captures over 80 requests |

- So latency improved about 30 %, not the required 50 %, and warm cgroup memory exceeded the 20 % limit.
- PR-stated results from other hosts: x86 RTX PRO 6000 100.22 → 32.59 ms (67.5 %); DGX Spark 230.97 → 100.46 ms (56.5 %) (G2:325-331).
- G2's framing: "The reproduction does not show that the PR is wrong; it shows that the qualification did not reproduce on that host" (G2:333).

**Replay recapture cost.**
- About 77 ms original; 393.78 ms when every request recaptures (D5:84).
- Archive diagnostic: 393.78 ms vs 53.59 ms per request (G3:952).

**Box check.** The chair of image 1993 is drawn at (111.05, 247.73) with size 118.48 × 170.54 px, IoU 0.90 against annotation 376624 (D5:250, D5:282; G2:737).

### Local CPU run of the real DINO backend (D5 Step 5)

- Setup: M1 Pro CPU, FP32, 16 stratified images, `transformers 5.2.0`.
- Model `IDEA-Research/grounding-dino-tiny@a2bb814…`; safetensors hash `1a2412ef…` equals the archive's.
- `num_queries 900` is confirmed (D5:342).
- 32 paired requests per arm, all outputs bitwise identical. Medians **1,665 ms (original) vs 1,654 ms (candidate)** (D5:327, D5:358).
- Replay reports `not configured` on CPU (D5:327).
- Timing step took 169.1 s; predictions took 58 s (D5:357).
- Standalone single image: 1578.3 / 1585.8 ms; model load 5.85 s (D5:356).
- Cross-host on image 61108: the same six boxes on both hosts.
  - D5:359 gives car 0.3924 (DGX) vs 0.3921 (CPU).
  - G2:737 gives 0.3299 vs 0.3365 "for one car" — possibly a different car, but the two docs cite different figures.

### ML-PERF-003 reference figures from the archive (planned experiments, not run)

- Per-image ratios 0.64–0.72; aggregate reduction 30.3 % (G3:920).
- Cold candidate `load_seconds` 85.6 s (G3:922).
- Memory: RSS +6.99 / +8.88 / +8.86 %; CUDA +3.33 / +2.17 / +2.17 %; cgroup −0.27 / +25.47 / +23.24 % for cold / warm / warm-repeat (G3:935).

### Other numbers

- Lattice-derived DINO intermediate: 8·32·12240·16 FP32 = 200,540,160 bytes (D3:86, D3:257).
- Live-model probe: "What is 17*23?" → "391" in 766 ms (D4:132).

---

## 5. Named concepts as the documents define them

### Core program objects

- **Lab.** The root builder `lab(title)` that a program returns (SPEC:123).
- **Experiment.** "the frozen contract of a benchmark (workload, boundary, revisions, state, warmup, repetitions, quality gate, captures)" (SPEC:35). Contract methods: SPEC:147-165.
- **Arm.** "a named side of a comparison (`baseline`, `candidate`)"; its variant is the role it plays for the dino workload (G3:125). Declared as `.baseline(rev, a => a.switches({...}))` (SPEC:151).
- **Capture.** One experiment × arm × mode. It has a lowered spec and a hash (G3:122). Modes: `timing`, `trace`, `kernels`, `memory`, `cpu`, `sanitizer` (SPEC:171-178). ML-PERF-002 added `stages`, `predictions`, `tests` and `memory().states()` (D5:200). Captures are independent collection modes with distinct run IDs (SPEC:169; G1:480-487).
- **Import.**
  - An IR node kind (SPEC:456).
  - A **plan status** (`cached | execute | import | blocked(on)`): an approved job reads the archive's reports instead of starting a process (D5:180, D5:200; SPEC:468).
- **Derived table (derive).** `derive(name, input, (rows, ctx) => …)` is a memoized data node with `prov: derived` (SPEC:82, SPEC:208).

### Parameters and phases

- **Parameter binding (plan / data / view).** The strongest phase among a parameter's readers.
  - View: re-renders.
  - Data: recomputes derives.
  - Plan: candidate IR, then reuse or a pending plan (SPEC:367-377).
- **Lambda phases.** plan, data, view (`live`), handler (`.on`), effect, eval (SPEC:79-86). Five rules, e.g. "Slots own their phase" (SPEC:88-94).
- **Pending plan.** What a plan-bound change produces when some hashes are absent. It lists what would run, where, and at what cost. It is never executed automatically; reverting discards it (SPEC:373-375).

### Hypotheses, boards and views

- **Hypothesis.** `.claim().predicts().supportedBy().alternatives().scope()`.
- **Verdicts:** `supported | refuted | open | unqualified`. `open` while any predicted row is missing; `unqualified` when a supporting run failed validity (SPEC:257-266).
- **Board.** "A named view surface (a 'sheet')" (SPEC:225).
- **View kinds** (UI:231-248):
  - timeline: lanes; concurrency preserved.
  - mirror: two timelines, "STRUCTURAL MATCH — SEPARATE CLOCKS".
  - KernelCard: metrics with unit, scope and denominator.
  - ledger: one bar per scope, never summed.
  - stepper: `ILLUSTRATIVE` stamp.
  - route: one row per hop, with its evidence class.
  - detections (ML-PERF-002): ground truth white dashed, baseline thick, candidate thin, further runs dotted.
  - gallery (ML-PERF-002): 4:3 tiles with verdicts.
  - Others: table, chart, stat, manifest, manifestDiff, hypothesisCard, note, math.

### Provenance and checks

- **Provenance classes.** `observed | derived | heuristic | illustrative | unknown` (SPEC:215; D2:94).
  - Glyphs: ● ◐ ◌ ◇ ▨; missing is never zero (UI:184-192).
  - Link evidence classes: `direct | derived | heuristic | illustrative | unknown` (SPEC:206; G1:572).
- **ProvenanceError.** Observed values are import-only. Assigning to one throws `ProvenanceError` and rolls back the evaluation (SPEC:219, SPEC:644). It is implemented by `sealObserved` Proxies (D3:279).
- **Quality gate.** Runs both implementations on fixed-seed inputs in one process. `mode: 'exact'` has tolerance 1e-5 (fp32) or 1e-2 (fp16). A failure marks the run unqualified (BE:205).
- **Activation check.** Activation is recorded from execution, not configuration. `expect(activation({fusion:'active'}), {arm, onMiss:'invalid'})` (BE:203; SPEC:155).
- **Estimator.** `stats.pairedRatio({ unit: 'process' })`: paired median ratio with bootstrap resampling over **processes**, "the independent unit" (SPEC:158, SPEC:208, SPEC:238-239; D3:241). ML-PERF-002 adds an image-cluster bootstrap with 2,000 draws (D5:270).
- **Content addressing / spec hash.** Artifact-producing nodes carry a hash over their resolved inputs, and rebuilds reuse matching artifacts (SPEC:61). The hash is cyrb53 (D3:295; BE:241).

### Hosts and execution

- **Host.**
  - `local` is real and probed.
  - The synthetic DGX and RTX hosts (`playback@dgx`, `playback@rtx-dev`) have synthetic capability reports and a synthetic executor (RM:130-134; BE:243).
  - A host is part of a capture's identity (G3:118).
- **Runner.** One job and one process at a time. Seeded paired order; cancel by `SIGTERM`; failed processes become invalid runs. Paths: process, synthetic, evidence import, `runDino` (BE:385; D4:185; D5:199; D5:344).
- **Importer.** Native output → `{run, entities, links}`. Mapping table at BE:211-216. Allocator events are attributed to the innermost range, as `derived` links (D4:218).
- **Evidence registry / archive.** A `.tar.gz` registered by SHA-256 and validated in memory (D5:126-129; G3:127). The data layout is `.data/evidence/<sha>.tar.gz` (D5:176).
- **Dataset.** A COCO selection identified by its manifest hash, which must equal `selected_manifest_sha256` (D5:129, D5:155).
- **Public media store.** `.data/media/<sha>.jpg`, privacy `public` only, served with `immutable`/`nosniff` (D5:130, D5:176; G2:496-503).
- **`detection-qualification/v1`.** The report layout `services/detection/GPU.md` prescribes. Mode → report mapping at G2:527-538.

### Entity model

- Entities: requests, spans, kernels, tensors, allocations, plus batches, graphs and instants (G1:540-551; SPEC:193).
- Relationships: `contains`, `launches`, `depends_on`, `reads`, `writes`, `aliases`, `retains`, `compiled_from`, `implements`, `corresponds_to`.
- "A runtime correlation can support `launches`. A source map can support `compiled_from`. Temporal overlap alone supports neither" (G1:558).
- ML-PERF-002 entity kinds: `image`, `annotation`, `detection`, `check` (D5:200).
- Identifier forms: `experiment/arm/mode#rep`; `<run>!<kind>:<id>` (SPEC:65-73).

### Assistant

- **Handle API** (SPEC:629-647): `lab`, `run`, `experiment`, `job`, `self` (the board in view).
- **Checkpoint/rollback.** Each evaluation is wrapped in a checkpoint and restored on error (SPEC:631; D3:81). It does not undo proposed jobs (D3:345).
- **Transcript library.** Archived conversations: search, read, continue, copy as JSON, delete. Implemented with migration 4 `archived_at` and the partial index `conversations_active` (D4:465, D4:495, D4:498; BE:417).

### Lint rules

- `no-quality-gate`, `no-activation-rule`, `no-repetition`, `counters-not-latency`, `lower-runner-slot`, `live-in-plan-slot`, `param-*`, `unknown-method`, `layout-area` (D3:294).
- Plus `host-unavailable` and `capture-unsupported` (D4:254; SPEC:466). Parameter lints: SPEC:413-421.

### ML-PERF-003 concepts (designed only)

- **Host profile.** `.data/hosts.json`, kept out of git and out of SQLite. Fields: ssh, root, image, python, docker limits, threads, `lockWaitSeconds`, `idleWindowSeconds` (G3:120, G3:431-453).
- **Remote probe.** `python3 <root>/driver.py probe --image <ref>` prints one JSON object. Cached 10 minutes; re-probed at every job start. An image-ID change fails the job (G3:455-466).
- **Environment block.** `spec.environment` holds executor, image ID, driver, limits and threads.
  - Only for executed captures on profiled hosts.
  - An unreachable host makes captures `blocked`.
  - Co-tenant load is a run condition, not part of identity (G3:491-513).
- **Staged bundle.** `.data/remote/<jobId>/bundle/` contains `plan.json`, `driver.py`, the workload, `git archive` trees per revision, specs and image lists (G3:131, G3:555-577).
- **Recipes.** "a pure function from a capture group to steps" in `server/remote/recipes.ts` (G3:579-581).
- **`driver.py`.** A standard-library Python file. "It does not decide anything a recipe could decide." It refuses bind mounts outside `<root>` (G3:674-676, G3:746).
- **GPU lock.** `fcntl.flock` on `<root>/gpu.lock`, released by the kernel on exit. It serializes lab jobs across lab servers, but "does not and cannot stop Playback's own GPU work" (G3:745).
- **Conditions.** before/after/idle/step utilization and container changes, attached to every run plus coverage notes. They do not affect validity (G3:802-814).
- **Cancel by label.** `--label perf-lab.job=<jobId>`; cancel and reconcile via `docker ps --filter label=…` (G3:660, G3:825, G3:829).
- **StepHost / SshContainerHost / LocalShellHost.** The step-host interface. `LocalShellHost` runs the same driver on the Mac with a fake `docker` on `PATH` for tests (G3:376, G3:429, G3:986).

---

## 6. Duplication, stand-ins, stale docs, deferred and unbuilt work

### Admitted duplication and forks

- **Two matching implementations** (Python and the TypeScript port). "Two implementations must stay equal; the golden test is the enforcement seam" (G2:573).
- **Special case in `lowerWorkload`.** It keeps the old lowering for non-dino workloads so hashes stay stable (D5:206, D5:233).
- **Separate workload packages.** `perf_lab_dino` is separate from `perf_lab_local` only to protect the sampler's hash (G2:747).
- **"Only when declared" rule** for optional spec blocks (G3:197). It is a recurring compatibility constraint.
- **`run.py` copies nine files today**; G3 plans whole `git archive` trees and a `--trees` mode (G3:575, G3:837).
- **`artifacts.origin` kept two values.** An imported run is `measured` with `source=evidence:<sha>` instead of a new `imported` origin, to avoid rebuilding three tables (G2:741).
- **The server prompt imports the IDE's handle reference** from `IdePane/reference.ts` (D4:329).

### Synthetic stand-ins

- Synthetic executor and capability reports for the DGX and RTX hosts (BE:243; RM:130-134).
- Seeded synthetic artifacts; this caused the stale-server incident (D3:275; D5:252, D5:290; G3:513).
- Scripted assistant replies (RM:135).
- `est_prompt_tokens` is characters ÷ 4, "not a tokenizer count" (D4:368).
- Embedding PR 1008 exists only as the synthetic Scenario B. It was never measured in the lab (RM:62; T1:9 open).
- `window.__perfLab.store` is a development-only hook (D4:404, D4:437).

### Stale or inconsistent docs

- **RM:25-29** still says the workbench runs "entirely on **synthetic data**. No collector, importer, profiler or GPU is involved". RM:126-135 contradicts it.
- **Preset counts.** RM:100 says "the nine programs" and UI:336 says "all nine presets"; there are 11.
- **SPEC:42** says the prototype implements the spec "against synthetic data". **SPEC:680** says the prototype keeps the artifact store and catalog "in memory". SQLite superseded both.
- **BE:383** says "three migrations"; there are five (D4:495; D5:126). BE §15 comes before §14 (BE:375, BE:431).
- **G3:122** calls the capture hash "a SHA-256 hash"; the code uses cyrb53 (`src/lang/util.ts:1`; D3:295; BE:241).
- **D3:371** says the Step 6 commit is "recorded in the next checkpoint" (it is `68c47c09f`, D3:442). D5 Steps 6 and 7 name no hash.
- **The first ML-PERF-003 reMarkable upload** has the broken diagram and "can be deleted" (D6:97).
- **G2:693** points to ML-PERF-001 task `rtne`, which is still open (T1:16). ML-PERF-003 is superseded (CL3:21).

### Deferred, or designed but not built

- **nsys/ncu collectors.** G1 phases 2–3 (G1:750, G1:756). The `kernels` capture is unsupported on macOS (BE:44). The not-implemented list is at SPEC:673.
- **DGX executor.** Task `rtne` (T1:16); deferred in G2 (G2:691-693, G2:752); G3 phases 0–5 all unchecked (T3:4-9); superseded by KILN-003 phase P4 (CL3:21).
- **CPU PMU and contention experiments.** G1 Phase 5 (G1:766-770); D2 capability 4 (D2:68-74); T1:9 open.
- **Prompt-sequence workload.** Task `cevg` (D5:98); D5:385; G2:761; G3 §7.3 (G3:937-952); T3:9.
- **G1 Phase 4 embedding adapter** (G1:760-764).
- **Other unbuilt items:**
  - Bundle export, `ir.diff()` view, `criticalPath`, `run.validity.add`, sandbox (D3:448; SPEC:673).
  - Syntax-error line numbers (D3:284).
  - Per-panel stale markers, command palette, code-splitting (D3:349; UI:338, UI:343).
  - Visual regression harness (D3:414).
  - CI runs of the headless scripts (D3:778; D4:441).
  - Gated real-Python integration test (D4:227).
  - Tokenizer counts (D4:373); FTS5 and Markdown transcript export (D4:544-545).
  - Importer version on runs (D5:238; G2:753; G3:996).
  - Local memory and stage captures (G2:754).
  - Math in chart labels (D3:656).
  - Admission policy and a conditions entity kind (G3:816-817).
  - Prediction records for all 128 images (D5:313).

---

## 7. Pain points, complaints and open questions in the authors' words

### Validation gaps

- Rendering exposed "modelling errors that would have produced plausible but wrong evidence" (D3:361).
- "Language tests that assert evidence … caught none of these; rendering every board did … the numbers were self-consistent" (D3:401).
- "A rendering test that passes on markup can still ship an unreadable page" (D3:766).
- "The end-to-end test found the most serious defect of the day, invisible to the unit tests because each test used one parameter value" (D4:428).
- "A port is only as good as its comparison" (D5:225).
- "A long-running server is part of the system under test" (D5:299).

### Models and providers

- "A provider can silently ignore a message role … token counts were misleading in both directions" (D4:360).
- `history()` sends the last 24 messages, so "a long conversation drops its beginning without saying so" (D4:369).
- If the rebuild throws, "the job stays `importing` in the browser although the server says `done`" (D4:294).

### Safety and correctness concerns

- `evaluateProgram` "runs unsandboxed `new Function` code … not acceptable for a shared deployment" (D3:280; SPEC:651, SPEC:677).
- `deleteRunsOf`: "confirm no path re-runs an available hash" (D4:222).
- Plan reuse: "Confirm that reuse across parameter values is always safe" (D3:207).
- "Whether `lab.start()` returning a *proposed* job … is the right default for agents on `playback@dgx`" (D3:90).
- Migrations 3 and 4 rebuild tables "inside one transaction" (D4:436, D4:538).
- `ReplayModel.disabled` is sticky, and `status()` does not expose it: "a deployment cannot see that acceleration fell back" (D5:85; G2:762).

### Writing discipline

- "Quoting code in a report requires the same discipline as quoting a person" (D4:77).
- Fact-check errors were found in the vault report draft (D4:72-73).
- A table "stated … from memory and had them wrong" (D4:525).

### Design tension

- "connect several graphs without pretending they are equivalent" (D1:64).
- "A successful HTTP status does not establish a usable documentation capture" (D1:118).

### Tooling friction

- The Chrome extension was "not connected" three times (D3:515, D3:701).
- zsh `=word` expansion and word-splitting (D3:77; D4:207).
- `pkill -f vite` matched all of the user's Vite processes (D3:474).
- An occupied port (D3:135).
- tsx CJS top-level await (D4:208).
- Escaping bugs in CDP `Runtime.evaluate` strings (D4:424, D4:522).
- Old artifact rows were deleted by hand with SQL several times (D5:290, D5:291, D5:408).

### ML-PERF-003 trade-offs

- Tying jobs to SSH "cancels a job when the Mac sleeps" (D6:82).
- "If jobs grow to hours, option C … becomes the better trade" (G3:997).
- "Without a pseudo-terminal, a dropped SSH connection does not signal the remote command; a heartbeat write is the reliable way" (D6:74).
- `run.py` "times calls without `torch.cuda.synchronize()` … would be wrong on the GB10" (D6:72; G3:838-849).

### Open questions as written

- SPEC §13: the sandbox boundary; whether parameters may change `.boundary()`; how hypotheses reference parameter values; persistence (now stale) (SPEC:675-680).
- BE §14: MPS timing semantics; partial repetitions are not imported on restart; remote-host approval and credentials (BE:431-435).
- G1:800: host reservation, tool versions, corpus, minimum effect size, storage budget, standalone vs Playback integration.
- G2 §13: licences, local fidelity, report format drift, the production label-set churn question, silent fallback (G2:756-762).
- G3 §10: co-tenant interference, image tag moves, unpinned model snapshot, the 64 MiB result cap, page cache, importer versioning, long jobs (G3:989-997).

---

## 8. DGX and hardware facts (ML-PERF-003)

### Read-only SSH inventory, 2026-10-12 (D6:63; G3:318-333)

Command: `ssh -o BatchMode=yes -o ConnectTimeout=8 playback@dgx '…'`.

| Property | Value |
|---|---|
| Hostname | `gx10-b2d2` |
| OS / arch | Ubuntu 24.04.4 LTS, `aarch64` |
| GPU | NVIDIA GB10, driver 580.159.03, compute capability 12.1 |
| Host tools | `python3` 3.12.3, `rsync`, `flock`, `tar`, Docker 29.2.1, `nvidia-smi` |
| Detection image | `pb-dgx-sim-detection:latest`, still ID `d06d49c09f19`; `playback-detection:*` images also present |
| Running containers | 13 (factory-live stack and observability) |
| Resident CUDA processes | 6 `python3`: 2150, 9116, 512, 468, 174, 174 MiB |
| GPU utilization at probe | 0 % |
| Free disk on `/` | 61 GB of 196 GB |
| Existing experiment dir | `/home/playback/experiments/pr1005-dgx-20261012` |

### Detection image

- Full ID `sha256:d06d49c09f19a5fcd936f8c07b75f167013d53034f99af392e15be7e61b1ffa2` (D6:96; G3:129).
- Contents: Python 3.12, `torch 2.10.0+cu130`, Triton 3.6.0, `transformers 5.2.0`, Grounding DINO tiny snapshot `a2bb814…` under `/models/huggingface` (G3:129).
- Dockerfile at `d59d9ad`: `/app/.venv`, `HF_HOME=/models/huggingface`, `HF_HUB_OFFLINE=1`, `appuser`, a cuBLAS preload for `sm_121` (D6:52).
- PyTorch's bundled cuBLAS lacks `sm_121` kernels, so the image preloads CUDA 13.0 cuBLAS (G3:355).
- The image was "built four weeks before this guide". It downloads the model without a pinned revision (G3:992-993).

### Other host facts

- **Unified memory.** RSS, CUDA allocation and cgroup peaks overlap and "must not be added together" (G3:335).
- **Co-tenant swing.** Throughput on this class of host swings by about 2.2× with co-resident CUDA tenants, citing `docs/vision/redaction-performance.md` (G3:335).
- **Hand-run orchestrator.** `pr1005-run-qualification.py` in the archive is the template for the driver (D6:31, D6:51).
  - Supplementary steps used `--no-healthcheck`; the primary steps did not, and those containers were marked unhealthy while benchmarking (D6:73).
- **Profile values** reproduce the 2026-10-12 settings: memory 16g, shm 1g, threads omp 2 / mkl 2 / openblas 1 / inductorCompile 4 (G3:440-451).
- **Expected probe report** (G3:470-486): includes `computeApps 6`, `computeAppMiB 12594`, `containers 13`.
- **First DGX experiment:** the 16 stratified images (15 strata plus the first negative) (D6:64).
- **Mac-side pin:** the lab's Python pins `torch==2.14.1` for macOS (G3:68).

