---
Title: Phase 5b diary — the workbench page on the Kiln server
Ticket: KILN-001
Status: active
Topics:
    - kiln
    - perf-lab
    - evidence
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://apps/workbench/src/server-sync.js
      Note: Record sync (load, debounced posts, rejections, records.added, forget), ServerDevice, the job list
    - Path: repo://apps/workbench/src/ui/wb.js
      Note: The server section (guide §30) and its hooks in the constructor, start, measure and importResults
    - Path: repo://apps/workbench/src/ui/Jobs.jsx
      Note: The Jobs view and the Devices view's server line
    - Path: repo://apps/server/test/support/serve-dev.ts
      Note: The development server with one fake CUDA executor, "Fake GPU (development)"
    - Path: repo://apps/workbench/test/server-e2e.mjs
      Note: The served page end to end in headless Chrome, without a GPU or SSH
    - Path: repo://apps/workbench/test/server-sync.mjs
      Note: The sync module against a fake client
ExternalSources: []
Summary: 'Chronological diary of Phase 5b (guide §30, §35 Phase 5): the workbench page connected to the Kiln server — record sync, one CUDA device per server executor, Measure as a job, the Jobs view — and its validation end to end on a fake runner.'
LastUpdated: 2026-10-19T16:30:00-04:00
WhatFor: "Reviewing how the page uses the server, and what the integration does not do yet"
WhenToUse: "Before running jobs on a real CUDA host, before the agent bridge proposes jobs, or before changing the sync"
---

# Phase 5b diary — the workbench page on the Kiln server

Written by the Phase 5b worker. The main diary is `01-investigation-diary.md`; its Step 1 holds the user's verbatim
requests. Paths: `T/` is this ticket, `S/` is `apps/server/`, `W/` is `apps/workbench/`, `K/` is `packages/kiln/`.
The coordinator edited `W/src/ui/wb.js` (its measure and compare sections) and `W/src/ui/Perf.jsx` at the same
time, and a Phase 7 worker was editing `S/src/app.ts`, `S/src/config.ts` and the agent files; this worker left
`Perf.jsx`, `pipelineFor`, the measure internals, `packages/evidence` and `K/src/std/tune.js` alone and never used SSH.

## Step 1: Read the server, the client and the workbench

I read the server's README, `S/src/{index,config,app,jobs,devices,records}.ts`, the executor types, the fake runner
and the test harness (`S/test/support/server.ts`), then the page-side client `W/src/server-client.js`, all of
`W/src/ui/wb.js`, the view registry (`views.jsx`, `dock.js`), `Evidence.jsx`, the Devices view in `Perf.jsx`, and
`EvidenceStore` (`K/src/std/store.js`).

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md` (the "Once upload, then implement it…"
request). The coordinator assigned Phase 5b: connect the page to the server committed in `b0b3bc6` and `9647125`
(sync in `wb.js`, a CUDA device per server executor, Measure as a job, a Jobs view, a server line in Devices), and
validate it end to end on a fake runner with screenshots, without a GPU and without SSH.

**Assistant interpretation:** Wire `server-client.js` into the workbench through one new `wb.js` section, keep the
logic that can be tested without a browser in a module with a Node test, and drive the served page in Chrome.

**Inferred user intent:** The done-condition of Phase 5: a CUDA job goes proposed → approved → done and its
records decide a schedule, through the real page and the real server.

**Commit (code):** none (the coordinator commits).

### What I learned

- **A token does not mean the Kiln server.** `sessionToken()` reads `<meta name="kiln-token">`, which the runner's
  own `serve` mode writes too. `connectServer()` returns a client for either. The page therefore asks
  `GET /api/health` first and treats the origin as the Kiln server only when it answers with the `jobs` feature;
  otherwise it drops the client and keeps the runner device.
- **The fake runner computes nothing.** Its default outputs are `fround(sin(i))` at each sample index, so a real
  Kiln kernel fails the server's output check (`checkSamples` against the job's `expect`) and every record is
  invalid. The dev executor has to return the job's reference values; `S/test/decide.test.ts` does the same through
  `KILN_FAKE_OUTPUTS`.
- **The server gives the executor a bundle, not the job.** `runRepetition(bundle)` sees sources, launches and sample
  indices but not `expect`. The dev executor reads the running job's stored spec (`jobs.spec_json`, where `expect`
  survives) before each repetition.
- **The Devices view lives in `Perf.jsx`**, which this worker must not edit. The server line therefore wraps the
  view in the registry. Its runner block takes `wb.devices.find((x) => x.kind === "cuda")`, which on a served page
  is the first server device (see "Open issues").
- **A user job is never `proposed` in the job list.** `jobSpec(…, { approve: true })` makes the server create it
  approved; its events still read `proposed → approved → running → done`.
- **`W-05` has one kernel and one fork** (`schedule`, decided by the model as `MAP=row,TPB=1024,STAGE=all`). The
  evidence policy decides a fork once its favourite has ≥ 3 repetitions; a job measures the compiled program, so
  its record makes the next compile say `by evidence` with the note "confirms the model".

## Step 2: The sync module and its test

`W/src/server-sync.js` holds everything that needs neither React nor the workbench:

- `recordSync({ client, store, delay, chunk, onRejected, onError })`. `load(filter)` imports the server's records and
  marks their ids as the server's; every store change schedules a debounced push (400 ms) of the records the
  server does not have, in chunks of 250; a rejected id is remembered with its reason, reported once through
  `onRejected`, and never posted again; a failed post goes to `onError` and stays pending for the next change;
  `added({ job, device, ids })` handles `records.added`, fetching by job, else by device, else everything, and only
  when the page lacks one of the ids; `forget(devices)` calls `DELETE /records?device=` once per distinct device.
- `ServerDevice` (kind `cuda`, id `server:<executor>`, label `<name> · <executor> · server`). `adopt(view)` takes a
  `GET /devices` row: `evidenceId` is the row's id, the target comes from the fingerprint by `cudaTarget`, and the
  status is `ready` or `not connected: <the server's reason>`. `probe()` is `POST /devices/:executor/probe`. It has a
  job protocol (`{ reps: 7, warmup: 3, launches: 20, seed: 1 }`, jobSpec's defaults), which the Devices view's
  Protocol block edits and saves as `protocol:cuda`. `runKernel`/`runKernels` throw "runs jobs only", so Tune and
  Compare fail with a sentence instead of a TypeError.
- `serverDevices(views, existing, client)`, `upsertJob(jobs, view)` (newest first; a `job.updated` view has no events,
  so the old ones are kept) and `addJobEvent(jobs, e)` (appended only to a job read in full, and not twice: a full
  view read while the job runs and the event stream can both carry an event).

To share the CUDA target rule with the runner device rather than copy it, I moved the two lines of
`CudaDevice.probe` into `cudaTarget(info, name)` in `K/src/std/devices.js`; `CudaDevice` calls it.

`W/test/server-sync.mjs` runs it against a fake client over real `kiln-measure/1` records (one linear program
measured on four simulated GPUs): 26 checks — load, never posting server records back, the debounce merging two
changes into one post, records.added by job and the no-fetch case, forget once per device, a rejection reported
once and never re-posted, a failed post retried, chunking, server devices from a view list and a probe (cc 9.0 → the
H100 spec, 132 SMs), keeping the device object across re-reads, the job list, and the runner-serve fallback
(`wb.startServer()` with a client whose health fails leaves `wb.server = null` and the runner device).

## Step 3: The server section in `wb.js`

One section, `// ---------- server (guide §30) ----------`, plus these hooks:

- imports (`median`, `connectServer`, `jobSpec`, the sync module), on lines of their own;
- constructor: `this.server = connectServer()`, `serverInfo`, `jobs`, `awaiting`, `proposed`; and, like the
  Evidence and Hypotheses views before it, a one-time layout migration that puts Jobs beside Devices;
- `start()`: `this.startServer()` before loading the preset (not awaited);
- `measure()`: `if (device.server) { await this.proposeJob(device, { quiet }); return null; }`, before the
  `measuring` guard — a job takes as long as the queue says, so it does not hold the page's Measure button;
- `importResults()`: takes the first CUDA device that is not a server device, and throws a sentence when there is
  none (a served page has no runner device; adopting a results file into a server device would overwrite its id).

The section: `startServer()` (health, drop the runner device, `recordSync`, subscribe), `serverReread()` (on `hello`:
records, devices and jobs, then post what the server lacks), `serverDevices()` (re-select a saved server device once
the server lists it; recompile when the selected device's evidence id changed), `serverJobs()`,
`serverRecordsAdded()` (import, then the job's records become Perf's measurement through `jobMeasured`, then
compile), `jobSettled()` (one toast when the page's own job ends; only a failure is red), `proposeJob(device,
{ proposer })` (the user's job approved on creation, an agent's left proposed), `openJob()`, `jobAction()` and
`forgetOnServer()`.

## Step 4: The Jobs view, the server line, registration

- `W/src/ui/Jobs.jsx`: the job list (newest first: the status word in a stamp — solid for done, red for failed,
  dashed otherwise; the reason; proposer, executor and short id; kernel count and `reps × launches`; created,
  started and finished; executor seconds; Approve on proposed, Cancel on proposed, approved or running), and a side
  panel with the job's fields, its event lines (24-hour times, kind, text) and its records, each linking to the
  Evidence view. Empty states: not served by the server (how to start it), a server without executors (where
  `executors.json` goes; `S/README.md`), no jobs yet (which device to pick).
- `ServerLine` (same file): a toolbar line above the Devices view — a dot and the words "connected · kiln-server/0.1 ·
  1 executor", or "not served by the server".
- `views.jsx`: the `jobs` entry (its badge counts proposed jobs, or shows "…" while one is queued or running) and the
  Devices entry as a `col` view `<><ServerLine /><DevicesView /></>`. `dock.js`: `jobs` after `devices` in
  `SYS_VIEWS` and in every layout. `Dock.jsx`: the tab strips listen to the `jobs` channel, so badges move with jobs.
- `jobs.css` (in `build.mjs`'s list): tokens only. A narrow stage hides the times column (the side panel has them).
- `Evidence.jsx`: "Forget this device" and "Forget all" also call `wb.forgetOnServer(devices)`, with "here and on
  the server" in the toast.

## Step 5: The development server

`S/test/support/serve-dev.ts` is `S/src/index.ts` with one executor, `dev-fake`: the fake runner behind the real
`CudaRunnerExecutor`, its device report named "Fake GPU (development)" (cc 9.0, 132 SMs), and outputs set before
each repetition to the running job's `expect` (null as 0). It is not reachable from `executors.json`; it lives under
`test/support`, exports nothing and is never imported by a test.

```bash
KILN_DATA_DIR=<scratch> KILN_PORT=5288 KILN_DIST=$PWD/apps/workbench/dist node apps/server/test/support/serve-dev.ts
```

`GET /api/devices` then lists `cuda:fake-gpu-development-6281c61e`, available, through `dev-fake`.

## Step 6: End to end in headless Chrome

`W/test/server-e2e.mjs` (`pnpm --filter @kiln/workbench test:server`; skipped by `pnpm test`, it needs Chrome)
starts the dev server on a random port with a temporary data directory and drives the served page with
`scripts/shoot.mjs`'s `withPage`:

1. waits for the server device to be ready; loads W-05; selects `server:dev-fake`;
2. Measure → the job is approved on creation, runs and finishes; the page imports its record and recompiles;
3. an agent-proposed job waits as `proposed` and the Jobs view's Approve button runs it; a third is withdrawn
   with Cancel;
4. a fresh page (a new browser profile) loads the server's records and jobs and decides by evidence without
   measuring — in light and dark, at 1600 and 390 px, taking the screenshots;
5. a simulated Measure's record reaches the server, and Evidence's "Forget this device" empties the device there.

### What didn't work

- The wait `jobs[0]?.status === "proposed" && document.querySelector(".jobt button")` never became true: the DevTools
  call returns by value and a DOM node does not serialise, so the poll threw every time. `!!` fixed it.
- The first Devices wrapper was `<div className="page col">…</div>`. On a phone the device list disappeared and the
  side panel overflowed: the narrow-tile rules in `chrome.css` match `.tabbody > .page:not(.col)`, and the inner page
  was no longer a child of `.tabbody`. Registering Devices as a `col` view with a fragment keeps that structure.
- Event times wrapped in the side panel ("04:13:06 PM" on two lines); they are 24-hour now.

### Result (last run)

```text
ok   the server device: CUDA Fake GPU (development) · dev-fake · server · cuda:fake-gpu-development-6281c61e · target CUDA Fake GPU (development) sm_90 132 SMs
ok   the runner-served CUDA device is not offered on the Kiln server's page
ok   before: schedule by model, 0 records on the device
ok   job …: events proposed → approved → running → repetition ×7 → done; statuses seen approved → running → done; 3.26 executor s
ok   1 records: valid, checked, activated, 7 samples each, fresh, on cuda:fake-gpu-development-6281c61e
ok   after: schedule by evidence (confirms the model)
ok   Perf's measurement comes from the job: 34.51 µs
ok   an agent's job waits as proposed and the Approve button runs it
ok   the Cancel button withdraws a proposed job; jobs now agent:cancelled, agent:done, user:done
ok   a fresh page loads 2 records and 3 jobs from the server and decides: evidence (confirms the model)
ok   a record the page makes (simulated measure) is posted: 1 on the server
ok   Evidence's Forget this device forgets on the server too: 2 → 0 there, 0 here
     … and no page errors on any page
all passed
```

Screenshots (`T/various/screens/`): `p5b-jobs-{light,dark}-{1600,390}.png` (a done job with its events and record),
`p5b-jobs-proposed-light-1600.png` (an agent's job with Approve and Cancel), `p5b-devices-{light,dark}-{1600,390}.png`
(the server line and the server device), `p5b-evidence-{light,dark}-{1600,390}.png` (the job's records, `by job`,
valid, n=7), `p5b-knobs-light-1600.png` (the fork "picked by evidence (confirms the model)") and
`p5b-perf-light-1600.png` (the device picker on the server device, 34.5 µs measured).

## Step 7: Validation

- `pnpm test`: `@kiln/evidence` 125 tests in 9 files; `@kiln/kiln` 10 of 10 scripts; `@kiln/server` 60 tests in
  8 files; `@kiln/workbench` 3 of 3 scripts (`notes`, `presets`, `server-sync`). The first full run had one timeout in
  `S/test/agent.test.ts` ("aborts the upstream call…", 5 s), an uncommitted Phase 7 file; it passed on both reruns.
- `pnpm build`: `dist/index.html` 1241 KB (bundle 1180 KB).
- `node scripts/contrast.mjs`: 68 pairs, all pass.
- `pnpm --filter @kiln/server typecheck`: clean (it covers `test/support/serve-dev.ts`).
- `W/test/ui.mjs` could not run here: it imports Playwright, which this machine does not have (it is skipped by
  `pnpm test` too).

## Deviations

- The server line is a strip above the Devices view, added in the registry, not a line inside `DevicesView`:
  `Perf.jsx` was off-limits.
- `measure()` on a server device returns `null` (the job's records come later); the job is in `wb.jobs`.
- `proposeJob` takes `{ proposer: "agent" }` as well as the user's default, so the agent bridge can propose jobs
  that wait for Approve; the end-to-end test uses it.
- Records the page created in earlier sessions (its localStorage store, simulated ones included) are posted at
  connection too: the server deduplicates by id, and they are the page's records.
- A job's records also become Perf's last measurement on that device (`jobMeasured`), so Perf shows the measured
  total and the per-kernel check as after a page Measure.
- `cudaTarget` was extracted in `K/src/std/devices.js` (a refactor of `CudaDevice.probe`, behaviour unchanged).

## Open issues

- **`DevicesView` (`Perf.jsx`) shows its runner block for a server device.** It takes the first `kind === "cuda"`
  device, which on a served page is a server device, so "A real CUDA GPU · ready" appears with the bundle steps,
  whose import now refuses on a served page. The fix is one condition in `Perf.jsx`:
  `wb.devices.find((x) => x.kind === "cuda" && !x.server)` (and hide the block when that is undefined).
- **Tune and the Compare panel on a server device** fail with "runs jobs only". A paired comparison could be one job
  with both schedules (the server already shuffles kernels per repetition); Tune would need a job per candidate.
- **The device fingerprint's `host`** is this machine's host name for a local executor (`manuel.local` here); a
  results file imported elsewhere gets `"import"`. The id rule is shared; the host convention is still per route.
- **The sync loads every record at each `hello`.** That is fine for thousands; a `since` cursor would bound it.
- **No retry for a rejected record** after a server upgrade: the refusal is remembered for the page's lifetime.
