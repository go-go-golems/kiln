---
Title: Phase 5 diary — the server (apps/server)
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
    - Path: repo://apps/server/src/app.ts
      Note: The Hono application, its routes and the page with the session token (guide §30.3)
    - Path: repo://apps/server/src/security.ts
      Note: Host, Origin, token and content-type checks (guide §30.2)
    - Path: repo://apps/server/src/jobs.ts
      Note: Job validation, the state machine and the repetition protocol (guide §30.4)
    - Path: repo://apps/server/src/executors/cuda-runner.ts
      Note: The local and SSH CUDA runner executor (guide §30.5)
    - Path: repo://runner/kiln_runner.py
      Note: run - / --out -, the extended device report, serve with Host allow-list and token (guide §30.6)
    - Path: repo://apps/workbench/src/server-client.js
      Note: The page-side client of the server API (not yet wired into wb.js)
ExternalSources: []
Summary: 'Chronological diary of Phase 5 (guide §30, §35): the Hono + SQLite server, its security checks, records, devices, jobs, server-sent events and CUDA executors, the runner changes and the page-side client.'
LastUpdated: 2026-10-19T18:00:00-04:00
WhatFor: "Reviewing how the server was built and where it deviates from the guide"
WhenToUse: "Before wiring the server into wb.js and the Jobs view, or before running a job on a real CUDA host"
---

# Phase 5 diary — the server

Written by the Phase 5 worker. The main diary is `01-investigation-diary.md`; its Step 1 holds the user's verbatim
requests. Paths: `T/` is this ticket, `PL/` is `lab-workbench/`, `S/` is `apps/server/`, `K/` is `packages/kiln/`.
Two other workers share the working tree (the Phase 3 views and the WebGPU protocol); this worker touches only
`S/`, `runner/kiln_runner.py`, `apps/workbench/src/server-client.js`, the root `package.json` and this diary.

## Step 1: Read the specification and the code the server has to agree with

I read guide §30.1–30.7 and the Phase 5 entry of §35, then the four places whose rules the server must reproduce
exactly: `@kiln/evidence` (`identity.ts`, `record.ts`), Kiln's record builder `K/src/std/records.js`, the CUDA
device and bundle code in `K/src/std/devices.js`, and the runner. Perf Lab's server (`PL/server/db.ts`, `app.ts`,
`events.ts`, `index.ts`) supplied the patterns: `node:sqlite`, numbered migrations, an event bus.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md` (the "Once upload, then implement it…"
request). The coordinating agent assigned Phase 5 to this worker, with the guide as the specification and these
extra rules: no commits, no SSH, no real GPU host, records validated with `validateRecord`, content ids recomputed
only where the server has the source and launch, and a job spec that carries the expected output values.

**Assistant interpretation:** Build `apps/server` (Hono, `@hono/node-server`, `node:sqlite`), the runner's stdin
and stdout mode, a page-side client module, and Vitest tests for every refusal and the job lifecycle.

**Inferred user intent:** Measurements leave the browser: a CUDA job is proposed, approved, run on a GPU host and
turned into `kiln-measure/1` records that decide schedules exactly as page-made records do.

**Commit (code):** none (the coordinator commits).

### What I did

- Checked `node:sqlite` on Node 26.8.1: `new DatabaseSync(':memory:')`, `exec`, `prepare().run/all` work with no
  flag and no experimental warning. Perf Lab uses the same module, so the migration helper ports directly.
- Checked the library versions already in the pnpm store through `PL/node_modules`: hono 4.13.13,
  `@hono/node-server` 2.1.4. `@kiln/evidence` uses vitest 5.0.5, TypeScript 7.0.2, `@types/node` 26.6.5.
- Read the runner. `run_bundle` runs every kernel of a `kiln-bundle/1` once (one process per kernel, `reps` timed
  launches after `warmup`), and returns `kiln-results/1` with `us_all` (every launch), `us_median` and the output
  values at the sample indices. One invocation of the runner is therefore one repetition of the guide's protocol.
- Read `CudaDevice.adopt(info, host)`: name `CUDA <info.name>`, fingerprint = the report's flat primitive fields
  plus `host`, id `deviceId('cuda', info.name, fingerprint)`. The server builds the same identity from the device
  report each repetition returns, so a job's records and a page import of the same report get the same id when the
  host string agrees.
- Read the WebGPU worker's uncommitted `repetitionOrder(n, seed, rep)` in `devices.js`: a Fisher–Yates shuffle
  driven by `rng(\`${seed}:${rep}\`)`. The server uses the same order for CUDA jobs.

### What I learned

- A record's content id cannot be recomputed from the record: it has the source hash and the launch but not the
  input shapes, the input seeds or the output shape (guide §22's `contentId` input). The server can recompute it
  only where it holds the whole kernel description, which is at job creation. `POST /records` therefore recomputes
  the record id (through `validateRecord`) but not the content id.
- The server cannot check outputs by itself: the reference comes from Kiln's Loop IR (`referenceAt`), which runs in
  the page. The job spec carries the expected values at the sample indices, with `null` where the reference is NaN
  (JSON has no NaN), and the server compares with `checkValues`'s tolerances (rtol 2e-3, atol 2e-4).
- `CudaDevice.adopt` puts every flat field of the device report into the fingerprint, so any field that changes
  between probes (a current clock, a runner version) would change the device id. The runner's new fields must be
  stable: driver version, maximum clocks and persistence mode, not current clocks.

## Step 2: Write the server

I scaffolded `S/` as `@kiln/server` and wrote its modules in dependency order: `config`, `db`, `events`,
`security`, `executors/{types,cuda-runner,index}`, `records`, `devices`, `protocol`, `jobs`, `app`, `index`. All of it
is erasable TypeScript with `.ts` import extensions, like `@kiln/evidence`; `node src/index.ts` runs it.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** Implement §30.1–30.7 with the coordinator's additions (job kernels carry `expect`;
content ids recomputed only at job creation).

**Inferred user intent:** A server whose refusals and records can be trusted without trusting the page or the agent.

**Commit (code):** none (the coordinator commits).

### What I did

- `pnpm --filter @kiln/server add hono@^4.13.13 @hono/node-server@^2.1.4` resolved hono 4.13.13 and
  `@hono/node-server` 2.1.5; `add -D vitest@^5.0.5 typescript@^7.0.2 @types/node@^26.6.5 @kiln/kiln@workspace:*`.
  `@kiln/kiln` is a dev dependency only: the tests compile real Kiln kernels, the server never imports Kiln.
- `db.ts`: the §30.7 schema as migration 1, applied in a transaction and recorded in `schema_migrations`.
- `security.ts`: one middleware before every route, the page included. Host (403 `bad_host`), Origin (403
  `bad_origin`), `X-Kiln-Token` on every method but GET and HEAD (403 `bad_token`, compared with
  `timingSafeEqual`), `application/json` on the same methods (415 `unsupported_media_type`). The response then gets
  `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `no-referrer` and `nosniff`; the API adds `no-store`.
- `records.ts`: `insertRecords` validates each record with `validateRecord` (which recomputes the id), inserts with
  `insert or ignore` (a second copy counts as a duplicate), notes the device, all in one transaction; rejected
  records come back as `{id, reason}` with the first three validation errors.
- `devices.ts`: `cudaIdentity(report, host)` copies `CudaDevice.adopt`; `Devices` keeps each executor's last probe or
  job in memory and lists every device row plus every executor whose device is not known yet.
- `jobs.ts`: `parseJob` validates the body and recomputes each kernel's content id (409 `content_id_mismatch` with
  the index, the name, the expected and the submitted id). `Jobs` holds the state machine, a one-job queue
  (`kick`), the repetition loop and `jobRecord`, which follows `makeRecord`'s rules (reasons for repetition errors,
  a failed output check, a failed activation, small n; `by: 'job'`; `pairId` = the job id; `position` per sample).
- `protocol.ts`: `repetitionOrder` (the page's shuffle) and `checkOutputs` (the page's `checkValues` on float32
  values, with `null` for a NaN reference).
- `executors/cuda-runner.ts`: `CudaRunnerExecutor` for `local` and `ssh`. The child runs in its own process group
  (`detached: true`), so an abort kills the runner, nvcc and the harness together (SIGTERM, SIGKILL after a grace
  period). The bundle is written as one line and stdin stays open; the runner's `--exit-on-eof` stops its process
  group when stdin closes, which is what ties a remote run to its SSH connection. For SSH, `installCommand()` copies
  the runner to `runnerDir/kiln_runner-<16 hex of sha256>.py` once (atomically, through a temporary name), and
  `commandFor()` quotes every word for the remote shell (`~` becomes `"$HOME"`). A destination starting with `-` or
  containing anything outside `[A-Za-z0-9_.@-]` is refused, so it cannot become an ssh option.
- `executors/index.ts`: profiles from `KILN_EXECUTORS`; only `CudaRunnerExecutor` can be built from them.
- `app.ts`: the routes of §30.3, `GET /api/events` with `streamSSE`, and `/` serving
  `KILN_DIST/kiln-workbench.html` with `<meta name="kiln-token">` after `<head>` (a clear 404 when it is missing).
- `index.ts`: opens the database, fails jobs left running, builds executors, probes them, starts the queue.

### Why

- **Records are matched to bundle kernels by position, not by name.** Two schedules of one kernel share a name and
  an identity; `ingest` in `devices.js` matches by name, which cannot tell them apart. The runner appends results
  in bundle order, so position is exact; the server still checks the name and records a mismatch as a repetition
  error.
- **The device identity comes from every repetition's results**, not from a probe: it names the GPU that actually
  ran, and a job whose device changes between repetitions fails.
- **A job that fails or is cancelled keeps what it measured** as invalid records (small n, plus `job failed: …` or
  `job cancelled after k of n repetitions`), so the evidence of a partial run is visible and never decisive.
- **An agent job that would cross the daily budget is stopped by the budget**, not by the repetition timeout: the
  repetition's timeout is the smaller of the two, and when the budget is the smaller the error says so.

### What was tricky to build

- Killing a remote run. With `ssh -T` there is no terminal, so killing the local ssh client does not deliver SIGHUP to
  the remote process. Keeping stdin open and letting the runner watch it for end of file is the one signal that
  survives every route (local pipe, SSH channel, a crashed server).

### What warrants a second pair of eyes

- `S/src/jobs.ts` `execute`: the order of state changes, records and events; and `cancel`, which waits (at most
  10 s) for the run to record its end before answering.
- `S/src/executors/cuda-runner.ts` `commandFor`/`installCommand`: the remote shell quoting. The tests assert the
  exact strings; they never run ssh.

## Step 3: An upstream contract change — content ids no longer depend on the kernel name

While the server was half written the coordinator changed, in files this worker does not own, how a content id is
computed, and asked for it to be recorded here as an upstream change.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** The coordinator's message: "a kernel's content id no longer depends on its name.
(1) `@kiln/evidence` exports `canonicalSource(text, symbol)`: the generated source with the kernel's entry symbol
(whole word) replaced by `kernel`. `ContentIdInput.sourceSha256` is now `sha256Hex(canonicalSource(source, symbol))`,
and records' `kernel.sourceSha256` means the same. In Kiln the symbol is `symbolOf(kern)` … i.e. the CUDA
`__global__` name. … (2) Input seeds come from `seedOf(kern, seed, j)` which now hashes `kern.identity` instead of
`kern.name` — the page still sends explicit per-input seeds."

**Inferred user intent:** The same code compiled under two kernel names is one piece of evidence.

**Commit (code):** none.

### What I did

- `jobs.ts`: `entrySymbol(source)` finds the `__global__` function with the runner's own regular expression
  (`kernel_name` in `kiln_runner.py`), and the content id is computed from
  `sha256Hex(canonicalSource(source, symbol))`. A job kernel may carry `symbol`; when it does it must equal the
  source's entry symbol (400 otherwise). The symbol is derived from the source rather than trusted from the page,
  because the source is what runs.
- The stored spec now keeps two hashes per kernel: `textSha256` (the key of the raw text in `sources`) and
  `sourceSha256` (the canonical hash that the content id and the records name).
- `server-client.js` `jobKernel` sends `symbol: symbolOf(kern)` and Kiln's own `contentOf(kern, {kind: 'cuda'})`.
- Test: two kernels named `k_first` and `k_second` with otherwise identical code have one content id, and a
  `symbol` that is not the source's entry point is refused.

### What I learned

- Kiln's CUDA emitter names the entry `cname(K.name)` and `symbolOf` is the same expression, so deriving the symbol
  from the source and taking it from the page agree for every Kiln kernel; the check only fires for a forged spec.

## Step 4: Test the server

Seven Vitest files, 51 tests, all passing; `tsc --noEmit` is clean. Every test uses an in-memory database and a
temporary data directory; the job tests run the fake runner through the real `CudaRunnerExecutor`.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** Tests for every refusal, records, content-id mismatch, agent approval, the job
lifecycle with cancel and timeout, SSE, and records driving a decision.

**Inferred user intent:** The Phase 5 done-condition is checked by a test, not by a demonstration.

**Commit (code):** none.

### What I did

- `S/test/support/fake-runner.mjs`: the guide's fake runner, a Node script with the runner's command line (`device`,
  `run - --out - [--exit-on-eof]`) that answers `kiln-results/1` with deterministic times and outputs, steered by
  environment variables (per-kernel times, an outputs file, a failing kernel, an invocation that exits, a delay from
  the n-th invocation). `fakeExecutor(env)` is `CudaRunnerExecutor({target: 'local', python: node, runner: fake})`,
  so spawning, stdin, stdout, stderr lines and process-group kills are exercised. It lives under `test/` and
  `loadExecutors` cannot build it.
- `security.test.ts` (11): every Host, Origin, token and content-type refusal, the order of the checks, no CORS
  headers, the page with its token, the 404 without a build.
- `records.test.ts` (5): store once, filters, a tampered record (id mismatch), an invalid-but-claims-valid record,
  forgetting a device, persistence across two database handles on one file.
- `jobs.test.ts` (18): content-id mismatch for each part of the content (source, launch, input seed, output),
  symbol canonicalisation, proposer rules, limits, the agent budget at creation and during a run, the full
  lifecycle, one job at a time, a failed output check, a failing kernel, cancel (proposed and running), timeout, a
  runner that exits non-zero, interrupted jobs; and two equivalence tests: `repetitionOrder` against Kiln's, and
  `checkOutputs` against Kiln's `checkValues`.
- `events.test.ts` (2): `hello`, `ping`, `job.updated`, `job.event`, `records.added`, `device.updated`, and the
  subscriber count returning to zero when the stream is cancelled.
- `executors.test.ts` (10): the SSH command strings, refused destinations, the local command, probe, abort killing
  the process group, executor profiles.
- `decide.test.ts` (1): the done-condition without a GPU. Kiln compiles a 256×256 linear layer for a CUDA device; two
  schedules (the model's choice `MAP=tiled,BM=32,BN=16,BK=8` and `MAP=thread,TPB=64`) become one job through
  `jobSpec`; the fake GPU returns the page's reference outputs and runs `MAP=thread` 4× faster; the records, loaded
  into an `EvidenceStore`, make the compile choose `MAP=thread` by evidence, note "separated from the model's choice
  MAP=tiled,BM=32,BN=16,BK=8", on device `cuda:fake-h100-b482840b`.
- `client.test.ts` (4): `server-client.js` against the application through a `fetch` shim, and `subscribe`'s
  reconnection with a fake `EventSource`.
- Ran the server suite five times in a row: 51/51 each time (the cancel, timeout and budget tests depend on timing).

### What didn't work

- My first content-id test forged a second kernel by renaming the first; after Step 3 a renamed kernel has the same
  content id, so the server rightly accepted it (`expected 201 to be 409`). The forged kernel now differs in its input
  seed.
- The budget test first accepted either "budget" or "timed out after 0.1 s" in the error. The second was a defect:
  a repetition cut short by the remaining budget reported a timeout. Fixed in `jobs.ts` (`byBudget`), and the test now
  requires the budget message.
- `tsc` refused a parameter property in a test class (`TS1294`, `erasableSyntaxOnly`) and Kiln's untyped JavaScript
  modules (`TS7016`); `test/support/modules.d.ts` declares `@kiln/kiln/*` and `*/server-client.js`.

## Step 5: Change the runner

`runner/kiln_runner.py` gained the stdin/stdout mode, the extended device report and the token for `serve`. It passes
`python3 -m py_compile`; nothing here can run CUDA, so I exercised the new helpers by importing the module.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** §30.6, minimal changes, syntax-checked only.

**Inferred user intent:** The runner the server spawns is the runner users download, with no separate protocol.

**Commit (code):** none.

### What I did

- `run -` reads the bundle from stdin (`read_stdin_bundle`: the first JSON document, one line or pretty-printed);
  `--out -` writes the results to stdout; `--exit-on-eof` (only with `run -`) starts a thread that waits for end of
  file on stdin and then stops the process group.
- Results carry `"runner": "kiln_runner/2"` at the top level (the server's `manifest.runner`), not in the device
  report, where it would enter the fingerprint and change the device id with every runner release.
- The device query prints `pciBusId`; `nvidia_smi(pci)` adds `driverVersion`, `persistenceMode`, `maxSmClockMHz`,
  `maxMemClockMHz` and `gpuUuid` when `nvidia-smi` is present. Only stable fields: every one enters the fingerprint.
- `serve` makes a 256-bit token, writes it into the page (`with_token`), refuses a Host outside
  `127.0.0.1|localhost|[::1]:<port>` on every request (403 `bad_host`), and requires `X-Kiln-Token` on
  `POST /api/run`.
- Per-launch times (`us_all`) and the register count (`regs`) were already in every kernel result. `--flush-l2`
  (optional in §30.6) is not implemented.
- Checked without CUDA: `with_token` on a page with and without `<head>`, `read_stdin_bundle` on a one-line and an
  indented bundle, `nvidia_smi(None) == {}`.

### What warrants a second pair of eyes

- The page's `CudaDevice.runKernels` (`K/src/std/devices.js`, owned by another worker) posts `/api/run` without the
  token, so live mode against `kiln_runner.py serve` now gets 403 until it sends
  `X-Kiln-Token: document.querySelector('meta[name="kiln-token"]').content`.
- None of the runner changes has run on a GPU. The first real job should check `--exit-on-eof` over SSH (cancel a
  running job and confirm the remote harness is gone) and the `nvidia-smi` fields.

## Step 6: Run the server as a process and open the page in a browser

`KILN_PORT=5299 KILN_DATA_DIR=<scratch> KILN_EXECUTORS=<scratch>/executors.json pnpm serve` with one local executor
(no SSH executor, so the start-up probe never left this machine). Then curl and headless Chrome
(`scripts/shoot.mjs`, a throwaway profile per run).

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md` ("Take screenshots as you go").

**Assistant interpretation:** Check the security model and persistence in a real browser, and record a screenshot.

**Inferred user intent:** Evidence that the server works outside the test harness.

**Commit (code):** none.

### What I did

- curl: `/api/health` answered; `Host: evil.example:5299` got `bad_host`; `/` served the page with a 64-hex token;
  a POST without the token got `bad_token`; `/api/devices` listed `local-cuda` as unavailable with the runner's own
  reason ("nvcc not found: install the CUDA toolkit or set CUDA_HOME").
- Chrome, in the served page: a POST with the meta token → 200; without it → 403 `bad_token`; a fetch from an
  `<iframe sandbox="allow-scripts">` (opaque origin, the Phase 7 agent frame) failed outright ("Failed to fetch"):
  the custom header forces a preflight that the server refuses without CORS headers.
- Persistence across browser profiles: profile A posted a simulator record from the served page
  (`{added: 1}`); a fresh profile B, opening the same page, read it back from `/api/records`
  (`sim:rtx5090 k_linear_reduce MAP=tiled,BM=32,BN=16,BK=8 simulated`).
- `pnpm test` at the root: evidence 114, kiln 9 suites, server 51, workbench 2 suites, all green. `pnpm build`:
  `dist/index.html 1194 KB`.
- Screenshot: `T/various/screens/p5-served-by-server-1600.png` (the workbench served by the server; it does not use
  the server yet).

## Deviations from the guide

- Three columns beyond §30.7: `records.job_id` (the Jobs view lists a job's records), `jobs.started_at` and
  `jobs.executor_ms` (the agents' rolling 24-hour budget is the sum of executor milliseconds of agent jobs started in
  the window).
- `POST /records` recomputes the record id but not the content id (Step 1). Content ids are recomputed at job
  creation, where the server has the source, launch, inputs and output.
- The job kernel spec carries `expect` (the page's reference values, `null` for NaN) and optional `symbol`; the guide's
  list (name, identity, row, content id, CUDA source, launch, input seeds, output size, sample indices) has neither.
- An agent job with `approve: true` is refused (403 `agent_cannot_approve`) rather than silently created proposed.
- `X-Kiln-Proposer` is required on `POST /jobs` (400 `bad_proposer`).
- Errors not named by the guide: `bad_token` (403), `unsupported_media_type` (415), `limit_exceeded` (400),
  `unknown_executor` (400), `agent_budget_exhausted` (429), `bad_state` (409), `too_large` (413).
- `device.updated` carries a device view after a probe, but `{id, deleted}` after `DELETE /records`.
- No executors without an executors file (the guide does not say what the default is).

## What the page integration still needs

- `wb.js`: `connectServer()` at start; when it returns a client, load `records.list()` into the `EvidenceStore`,
  post every new record (`records.add`), call `records.forget` from "Forget device", and on `hello`,
  `records.added` and `device.updated` re-read records and devices.
- A Jobs view: list, approve, cancel, the job's events, and a "Run on <executor>" action building the spec with
  `jobSpec(kernels, {executor, reason, activationOf: (kern) => activationOf(kern, {run})})`.
- The CUDA device for a server executor in the device picker, with `evidenceId` = the id `GET /devices` reports for
  that executor.
- The device fingerprint's `host`: the server uses the executor's SSH destination or this machine's host name; the
  page's `CudaDevice.adopt` uses the runner's URL in live mode and `"import"` for imported results. The same GPU
  therefore gets different device ids by different routes until one host convention is chosen.
- `repetitionOrder` exists twice (Kiln's `devices.js` and `S/src/protocol.ts`), held equal by a test; it belongs in
  `@kiln/evidence`.
