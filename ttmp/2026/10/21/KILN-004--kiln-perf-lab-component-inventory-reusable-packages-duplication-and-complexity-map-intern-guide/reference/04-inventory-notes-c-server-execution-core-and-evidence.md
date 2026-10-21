---
Title: 'Inventory notes C: server, execution core and evidence'
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
Summary: 'Component inventory of apps/server (@kiln/server), packages/exec (@kiln/exec), packages/evidence (@kiln/evidence) and the GPU-host driver runner/kiln_driver.py: routes, SQLite schema, wire formats, the job state machine, the end-to-end job flow, duplication against lab-workbench/server, complexity hotspots, reusable packages and dead or half-migrated code.'
LastUpdated: 2026-10-21T11:30:00-04:00
WhatFor: 'Knowing what the backend half of Kiln consists of, which parts are reusable as they stand, and what is copied from Perf Lab, before deciding how to separate or repackage Kiln and Perf Lab.'
WhenToUse: 'Before changing the job pipeline, the driver protocol, the server schema or the evidence package; before porting anything else from lab-workbench/server; when a claim in the KILN-004 guide about the server side needs its file:line evidence.'
---

# Inventory notes C: server, execution core and evidence

## Scope, revision and conventions

These notes inventory the backend and measurement side of the kiln repository (`/Volumes/SSD/code/kiln`, branch
`main`). They describe what exists; they are not a code review. All source was read at kiln `4d9adc2`; the KILN-004
commits after it touch only `ttmp/`.

In scope:

- `apps/server` (`@kiln/server`): the Hono + `node:sqlite` server, which runs on `127.0.0.1:5380` in this session
  (default port 5280).
- `packages/exec` (`@kiln/exec`): the execution core. It holds the host model, workload kinds, collectors, the planner
  and the identities.
- `packages/evidence` (`@kiln/evidence`): provenance-carrying values, statistics, hashing, identities, measurement
  records and verdicts.
- `runner/kiln_driver.py`: the GPU-host driver that the server drives over HTTP (`kiln-driver/1`). Its in-container
  partner `runner/kiln_runner.py` belongs to area A, so these notes cover only its contract with the driver.
- The comparison side: `lab-workbench/server`, Perf Lab's server, imported verbatim in `92daa13` on 2026-10-19.

Evidence markers:

- **(O)** observed: read in the source, or seen in a live GET.
- **(I)** inferred: follows from what was read, but was not verified by running it.

Paths are repo-relative. `PL` abbreviates `lab-workbench/server`.

## 1. Map at a glance

```text
 apps/workbench (page)  ── HTTP /api/* + SSE /api/events ──►  apps/server  (@kiln/server, Hono, node:sqlite)
 packages/lab (lab UI)  ──────────── /api/lab/* ───────────►     │  records · devices · hosts · jobs · archives
                                                                 │  events · agent gateway · lab data routes
                                                                 │
                                    imports @kiln/exec ──────────┤  planner, kinds, collectors, importers (pure TS)
                                    imports @kiln/evidence ──────┤  records, stats, hashing (pure TS, no deps)
                                                                 │
                         HTTP kiln-driver/1 (no auth; loopback,  ▼  one tunnelled port per host)
                                              runner/kiln_driver.py  (one per GPU host, Python stdlib)
                                                                 │  docker run --network none, GPU flock,
                                                                 ▼  nvidia-smi sampler, result.tar.gz
                                              kiln_runner.py / perf_lab_local.run inside the container
```

Lines of code (O, `wc -l`):

| Area                      | File                                     |  LOC | Role                                               |
| ------------------------- | ---------------------------------------- | ---: | -------------------------------------------------- |
| apps/server/src           | exec/jobs.ts                             |  495 | job state machine, driver follower, import trigger |
|                           | db.ts                                    |  415 | three migrations, sqlite helpers                   |
|                           | lab/importer.ts                          |  326 | one-shot Perf Lab store importer                   |
|                           | agent.ts                                 |  322 | Anthropic model gateway (Phase 7)                  |
|                           | lab/datasets.ts                          |  206 | COCO selection datasets                            |
|                           | exec/hosts.ts                            |  190 | host registry, probe cache, driver self-update     |
|                           | lab/store.ts                             |  133 | catalog, bundles, programs, annotations            |
|                           | exec/import.ts                           |  131 | archive → captures, runs, records                  |
|                           | app.ts                                   |  126 | Hono app, /api routes                              |
|                           | lab/evidence.ts                          |  118 | evidence archive registration                      |
|                           | exec/driver-client.ts                    |  117 | typed kiln-driver/1 client                         |
|                           | exec/routes.ts                           |  102 | hosts, jobs, archives routes                       |
|                           | lab/tar.ts                               |   98 | tar.gz reader/writer                               |
|                           | records.ts                               |   89 | record insert/list/delete                          |
|                           | lab/routes.ts                            |   76 | /api/lab routes                                    |
|                           | config.ts                                |   66 | env → config                                       |
|                           | security.ts                              |   48 | host/origin/token/content-type guard               |
|                           | exec/nsys-sqlite.ts                      |   47 | reads an nsys sqlite export                        |
|                           | index.ts                                 |   38 | boot                                               |
|                           | lab/files.ts                             |   37 | sha256, atomic write                               |
|                           | lab/import.ts                            |   34 | `pnpm lab:import` CLI                              |
|                           | events.ts, devices.ts, exec/assets.ts    |   23 | each: bus, device list, staged workload revision   |
| packages/exec/src         | kinds/perf-lab-sampler.ts                |  367 | Perf Lab sampler kind (+ ported importer)          |
|                           | model.ts                                 |  331 | types: host, facts, plan, observations             |
|                           | kinds/kiln-kernels.ts                    |  244 | CUDA kernel timing kind                            |
|                           | plan.ts                                  |  199 | `planJob`, limits                                  |
|                           | registry.ts                              |  136 | `WorkloadKind`, `Collector` interfaces             |
|                           | collectors/ncu.ts, collectors/nsys.ts    |  199 | 100 + 99: Nsight Compute / Systems collectors      |
|                           | hosts.ts                                 |   99 | kiln-hosts/1 parser                                |
|                           | runs.ts                                  |   86 | step → run bundles                                 |
|                           | requirements.ts                          |   85 | requirement checks, probe request                  |
|                           | collectors/index.ts                      |   66 | 11 collectors, 6 modes                             |
|                           | offers.ts                                |   61 | what a host offers per kind                        |
|                           | lab-hash.ts, gpu-sampler.ts, identity.ts |  108 | 43 + 40 + 25: cyrb53 copy, nvidia-smi CSV, capture id |
| packages/evidence/src     | 8 modules (§4)                           | 1051 | values, stats, hashing, identity, records, verdict |
| runner                    | kiln_driver.py                           | 1044 | GPU-host driver                                    |
|                           | kiln_runner.py                           |  281 | in-container kernel runner                         |
| lab-workbench/server (PL) | 22 .ts files incl. tests                 | 4058 | Perf Lab's server                                  |

## 2. `apps/server` (`@kiln/server`), module by module

### 2.1 Boot and configuration: `src/index.ts`, `src/config.ts`

- (O) `index.ts:14-30` boots in this order:
  1. `loadConfig()`, `openDb()`, `new EventBus()` and `loadHosts()`.
  2. `new Hosts(..., { driverFile: runner/kiln_driver.py, probeTtlMs: 10 min })`.
  3. `new Jobs(...).resume()`.
  4. `createApp()`, then `serve()`.

  It probes every host at start-up.
- (O) `config.ts` reads these variables:
  - `KILN_PORT`, default 5280.
  - `KILN_DATA_DIR`.
  - `KILN_DIST`, the built page.
  - `KILN_HOSTS`, default `<dataDir>/hosts.json`, format `kiln-hosts/1` (`config.ts:21`).
  - `KILN_LAB_WORKLOADS`, Perf Lab's `perf_lab_local/` sources (`config.ts:17`).
  - `KILN_MODEL`, `KILN_MODEL_URL` and `ANTHROPIC_API_KEY`.

  Three values are fixed: `agentBudgetSec` 600, `pollWaitS` 25 and `pingMs` 15000.
- (O) `package.json` has four scripts: `start`, `lab:import`, `test` and `typecheck`.
  - Dependencies: `hono ^4.13.13`, `@hono/node-server ^2.1.5`, `@kiln/evidence` and `@kiln/exec`.
  - Dev dependencies: `@kiln/kiln` (used by `test/decide.test.ts`), `typescript ^7.0.2` and `vitest ^5.0.5`.
  - SQLite is Node's built-in `node:sqlite` `DatabaseSync` (`db.ts:5`).

### 2.2 Security and the app: `src/security.ts`, `src/app.ts`

- (O) `security.ts:26-47` applies four checks in this order:
  1. a Host header allow-list;
  2. an Origin check;
  3. `X-Kiln-Token` on every non-GET request;
  4. `content-type: application/json` on request bodies.

  Failures return 403 or 415. Every response gets anti-framing headers.
- (O) `app.ts` sets the response rules:
  - The request body limit is 32 MiB.
  - `/api/*` responses get `cache-control: no-store` unless the route declared `immutable` (`app.ts:50-54`).
  - `/` and `/index.html` serve the page (`app.ts:122-123`).
  - An unknown `/api` route gets a JSON 404 (`app.ts:112`).
- (O) Perf Lab's `PL/app.ts` has none of this middleware: it checks no token and no origin.

### 2.3 HTTP route table

Every route is under `/api`. Every non-GET needs `X-Kiln-Token` (`security.ts`). All rows are (O).

| Method | Path                          | Handler            | What it does                                                         |
| ------ | ----------------------------- | ------------------ | -------------------------------------------------------------------- |
| GET    | /health                       | app.ts:55          | status, version, migrations count, host count, features, SSE clients |
| GET    | /records                      | app.ts:68          | list records; filters `device`, `identity`, `since` (ISO), `job`     |
| POST   | /records                      | app.ts:73          | insert `{records:[...]}`, capped per request; emits `records.added`  |
| DELETE | /records?device=              | app.ts:81          | forget a device's records; emits `device.updated`                    |
| GET    | /devices                      | app.ts:90          | devices with record counts                                           |
| GET    | /hosts                        | exec/routes.ts:24  | host views; pings drivers; adds the `perf_lab_local` revision        |
| GET    | /hosts/:id/capabilities       | exec/routes.ts:29  | cached or fresh `kiln-capabilities/1`                                |
| POST   | /hosts/:id/probe              | exec/routes.ts:38  | force a probe                                                        |
| GET    | /jobs                         | exec/routes.ts:49  | all jobs (summary views)                                             |
| GET    | /jobs/:id                     | exec/routes.ts:50  | one job with its events and captures                                 |
| GET    | /jobs/:id/plan                | exec/routes.ts:54  | the stored `kiln-plan/1`                                             |
| POST   | /jobs                         | exec/routes.ts:58  | propose, propose and approve, or dry-run; header `x-kiln-proposer`   |
| POST   | /jobs/:id/approve             | exec/routes.ts:63  | proposed → approved                                                  |
| POST   | /jobs/:id/cancel              | exec/routes.ts:64  | cancel, locally or through the driver                                |
| POST   | /jobs/:id/reimport            | exec/routes.ts:65  | re-run the importers on the stored archive                           |
| GET    | /archives                     | exec/routes.ts:68  | evidence and job archives                                            |
| GET    | /archives/:sha                | exec/routes.ts:69  | archive bytes, from `archives/` or `lab/evidence/`                   |
| POST   | /archives                     | exec/routes.ts:77  | register an outside archive: `{data: base64}` or `{path: absolute}`  |
| GET    | /events                       | app.ts:94          | SSE: `hello`, bus events, `ping` every 15 s                          |
| POST   | /agent/sample                 | agent.ts:251       | Anthropic Messages proxy, streamed back as NDJSON                    |
| GET    | /agent/usage                  | agent.ts:302       | `llm_calls` totals                                                   |
| GET    | /lab/programs/:labId          | lab/routes.ts:26   | one lab program                                                      |
| PUT    | /lab/programs/:labId          | lab/routes.ts:30   | save a lab program                                                   |
| DELETE | /lab/programs/:labId          | lab/routes.ts:36   | delete a lab program                                                 |
| GET    | /lab/catalog                  | lab/routes.ts:42   | captures as Perf Lab catalog entries                                 |
| GET    | /lab/bundles                  | lab/routes.ts:43   | run bundles by capture key (at most 64 per request)                  |
| GET    | /lab/annotations              | lab/routes.ts:51   | annotations of a lab                                                 |
| POST   | /lab/annotations              | lab/routes.ts:52   | add an annotation                                                    |
| GET    | /lab/datasets                 | lab/routes.ts:60   | datasets                                                             |
| GET    | /lab/datasets/:id             | lab/routes.ts:61   | one dataset                                                          |
| POST   | /lab/datasets/:id/materialize | lab/routes.ts:65   | **501**: not implemented in Kiln (Perf Lab fetches the images)       |
| GET    | /lab/media/:sha               | lab/routes.ts:68   | content-addressed media, `immutable`                                 |
| GET    | / and /index.html             | app.ts:122-123     | the built workbench page                                             |

No `/lab/seed`, `/lab/evidence`, `/lab/jobs` or `/lab/hosts` route exists (O, `lab/routes.ts`).
`apps/server/README.md` still describes them as 501 stubs (§11).

### 2.4 Database: `src/db.ts` (schema "kiln")

`openDb` (`db.ts:375`) applies three migrations, tracked in `schema_migrations`. The helpers `migrate`, `tx`, `all`,
`get` and `run` are at `db.ts:383-415`, copied from `PL/db.ts:330-363`.

Migration 1 (O) creates six tables:

- `records`(id, at, device_id, device_class, identity, row, content_id, kind, ok, by, job_id, json);
- `devices`(id, class, name, fingerprint_json, first_seen, last_seen);
- `sources`;
- `jobs` (first version) and `job_events`;
- `llm_calls`.

Migration 2 (O, `db.ts:89-246`) adds Perf Lab's tables with a `lab_` prefix, with `sha256` CHECK constraints:

- programs and artifacts: `lab_programs`, `lab_artifacts`;
- runs: `lab_runs`, `lab_run_bundles`;
- jobs: `lab_jobs`, `lab_job_captures`, `lab_job_events`;
- `lab_annotations`, `lab_evidence_archives`;
- datasets: `lab_datasets`, `lab_dataset_images`, `lab_dataset_annotations`;
- `lab_media`.

Migration 3 (O, `db.ts:254-369`) is KILN-003 P1's "one execution core" migration. It drops `lab_job*` and the first
`jobs`/`job_events`, and creates:

| Table                 | Key columns / notes                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| `jobs`                | id; status ∈ proposed/approved/running/importing/done/failed/cancelled; proposed_by ∈ user/agent; host, reason, spec_json, spec_sha256, plan_sha256, plan_steps, archive_sha256, result_json; created/approved/submitted/started/finished_at; executor_ms, driver_seq, error |
| `job_events`          | the per-job event log (kind, detail, at)                                                                |
| `job_captures`        | job_id, seq, idx, capture, kind, pair_id, mode, collectors_json, label; verdict ∈ execute/cached/blocked; reason |
| `captures`            | hash (PK), kind, lab_id, lab_hash, experiment, arm, mode, host, reps, spec_json; origin ∈ executed/imported; status, created_at, imported_at, source, job_id. Seeded from `lab_artifacts where origin='measured'` (`db.ts:327-328`) |
| `runs`, `run_bundles` | runs per capture; bundles are gzip-compressed JSON blobs (`lab/store.ts` `pack`)                        |
| `archives`            | renamed from `lab_evidence_archives`, plus `job_id`                                                     |
| `devices`             | gains `spec_json` (`db.ts:368`) and `host`                                                              |

Migration 2 tables that remain and serve the lab routes: `lab_programs`, `lab_annotations`, `lab_datasets`,
`lab_dataset_images`, `lab_dataset_annotations` and `lab_media` (O). Also remaining are `lab_artifacts`, `lab_runs` and
`lab_run_bundles`, which migration 3 copies from (I: their remaining readers were not checked table by table).

Unused or stale (O, by grep over `apps` and `packages`):

- Nothing reads or writes the `sources` table.
- Nothing writes `devices.spec_json`. The only `update devices` is `exec/import.ts:121`, and it sets `host`.
- The comment at `db.ts:9-10` about `jobs.executor`/`executor_ms` describes the dropped first `jobs` table.

### 2.5 Records and devices: `src/records.ts`, `src/devices.ts`

- (O) `insertRecords` (`records.ts:20`) validates each record with `@kiln/evidence` `validateRecord` (`records.ts:28`).
  It inserts with `insert or ignore` on the record's id, so a repeated record counts as a duplicate rather than an
  error. It also upserts the device row (`records.ts:83`). `recordIdsOfJob` (`records.ts:75`) lists a job's records.
- (O) `deleteRecords` deletes a device's records and the device row (`records.ts:70`). `listDevices` counts records
  per device (`devices.ts:21`).
- (O) Consumers: `apps/workbench/src/server-client.js` (`records`, `devices`) and `packages/kiln/src/std/records.js`.

### 2.6 Event bus and SSE: `src/events.ts`

- (O) `EventBus` is 23 synchronous lines (`on`, `emit`, `size`), 0.73 similar to `PL/events.ts`.
- (O, grep `emit('`) Event types emitted, with the number of sites:

  | Event                 | Sites |
  | --------------------- | ----: |
  | `records.added`       |     2 |
  | `device.updated`      |     2 |
  | `host.updated`        |     3 |
  | `job.updated`         |     1 |
  | `job.event`           |     1 |
  | `catalog.changed`     |     1 |
  | `evidence.registered` |     1 |

  SSE adds `hello` and `ping`.
- (O) Consumer: `subscribe` in `apps/workbench/src/server-client.js`, which keeps its own `EVENT_TYPES` list.

### 2.7 Hosts: `src/exec/hosts.ts`, `src/exec/driver-client.ts`, `src/exec/assets.ts`

- (O) `loadHosts` (`hosts.ts:13`) parses `kiln-hosts/1` with `@kiln/exec` `parseHosts`. It **refuses to start** if the
  data directory still holds the retired `executors.json` (`hosts.ts:15`).
- (O) `class Hosts` (`hosts.ts:70`) has these members:

  | Member                       | Line | Behaviour                                                         |
  | ---------------------------- | ---: | ----------------------------------------------------------------- |
  | `ids`, `profile`, `client`   |  84+ | registry lookups                                                  |
  | `driver()`                   |   95 | bytes and sha256 of `runner/kiln_driver.py`                       |
  | `cached`                     |  101 | the cached capabilities                                           |
  | `capabilities(id, {force})`  |  106 | capabilities, cached for 10 minutes                               |
  | `probe` (private)            |  116 | see below                                                         |
  | `waitForDriver`              |  141 | waits for a re-executed driver                                    |
  | `ping`                       |  156 | a quick reachability check                                        |
  | `view`                       |  168 | → `HostView`                                                      |
  | `list`                       |  187 | all host views                                                    |

  `probe` first does `PUT /v1/self` if the remote driver's sha256 differs and the driver is idle, and waits for it with
  `waitForDriver`. Then it does `POST /v1/probe` and computes the offers.
- (O) `DriverClient` (`driver-client.ts`) wraps the driver protocol:

  | Method                     | Line | Driver call / timeout                       |
  | -------------------------- | ---: | ------------------------------------------- |
  | `info`                     |   64 | `GET /v1/info`                              |
  | `probe`                    |   69 | `POST /v1/probe`, 300 s                     |
  | `hasBlob`                  |   73 | `HEAD /v1/blobs/:sha`                       |
  | `putBlob`                  |   83 | `PUT /v1/blobs/:sha`                        |
  | `submit`                   |   87 | `POST /v1/jobs`                             |
  | `events(job, after, waitS)`|   92 | `GET .../events`, timeout `waitS + 15` s    |
  | `cancel`                   |   97 | `POST .../cancel`                           |
  | `archive`                  |  101 | `GET .../archive`, 600 s                    |
  | `remove`                   |  105 | `DELETE /v1/jobs/:id`                       |
  | `jobs`                     |  109 | `GET /v1/jobs`                              |
  | `putSelf`                  |  114 | `PUT /v1/self`                              |

  `DriverError` carries the status and body, with `is(code)`.
- (O) `DriverClient.jobs()` has **no caller** in `apps` or `packages` (grep `\.jobs()`). The server never reconciles
  driver-side jobs it does not know about.
- (O) `exec/assets.ts` computes the revision of the staged Perf Lab workload sources "as probe.py's
  workloads_revision computes it" (`assets.ts:17`). `GET /hosts` reports it.

### 2.8 Jobs: `src/exec/jobs.ts` (the state machine)

The header comment (`jobs.ts:1-11`) is accurate (O):

```text
proposed ──approve──► approved ──(driver starts it)──► running ──► importing ──► done
    │                    │                                │            └──► failed (an importer refused)
    └──cancel──► cancelled ◄────────cancel────────────────┤
                                                          └──► failed (driver failed, lock timeout, restart)
```

The diagram omits one transition (O, `jobs.ts:345-351`): **approved → proposed ("replan")**. It happens when, at
submit time, an environment image in the stored plan no longer matches the host's probed facts.

`class Jobs` (`jobs.ts:135`), public surface (O):

| Method                   |    Line | Behaviour |
| ------------------------ | ------: | --------- |
| `agentUsedMs()`          |     153 | executor ms spent by agent-proposed jobs in the last 24 h |
| `create(body, proposer)` |     158 | see the list below |
| `approve(id)`            |     211 | only from `proposed`; otherwise 409 `bad_state` |
| `cancel(id)`             |     222 | proposed, or approved but not yet submitted: cancelled locally. Submitted approved or running: driver `cancel`, then a wait of up to 15 s for the partial-archive import |
| `reimport(id)`           |     245 | only done/failed/cancelled jobs with an archive; records are content-addressed, so no duplicates |
| `resume()`               |     257 | at start-up, follows approved/running/importing jobs and imports archives fetched but not imported |
| `plan`, `view`, `list`   | 461-471 | the read side |

`create` runs these checks and writes, in order (O):

1. Validate the proposer. An agent cannot approve its own job (403 `agent_cannot_approve`), and agent jobs are held to
   a 24-hour executor budget (429 `agent_budget_exhausted`).
2. Get the host's capabilities (503 `host_unreachable` on failure).
3. Run `planJob`. A `dryRun` returns the plan with 200 and stops here.
4. Write blobs to `<data>/blobs/<sha>` and the plan to `<data>/plans/<id>.json` (canonical JSON).
5. Insert `jobs` and `job_captures`, then `follow`.

The private pipeline (O):

- `follow` (274) → `drive` (285): submission is serial per host (`jobs.ts:332`). `drive` then long-polls
  `client.events(id, driver_seq, pollWaitS)`:
  - `driver.started` → `running`;
  - `step.finished` adds to `executor_ms`;
  - at most 400 `step.output` events are stored per job;
  - when an agent job's budget runs out mid-run, the job is cancelled (`jobs.ts:320-326`);
  - the `result` event → `collect`.
- `submit` (339): the replan check above, then `HEAD`/`PUT` for every plan blob the driver lacks, then
  `client.submit`. Any error → `failed` ("submitting to <host> failed: …").
- `collect` (370):
  1. set status `importing`;
  2. fetch the archive and verify its sha256 against the `result` event;
  3. store it at `<data>/archives/<sha>.tar.gz`;
  4. `registerArchive` (434) lists its files into `archives` without extracting them;
  5. `complete` (400) → `importStored` (414) → `importArchive`;
  6. `DELETE /v1/jobs/:id` on the driver.
- `outcome` (393): a budget-forced cancel ends as `failed`, not `cancelled`.
- The pipeline emits `job.updated`, `job.event`, `records.added`, `device.updated` (once per device of the job's
  records) and `catalog.changed`.

Coupling (O): `exec/jobs.ts` imports `../lab/files.ts` (sha256, atomic write) and `../lab/tar.ts` (`readTarGz`). The
execution core depends on helpers of the Perf Lab port.

### 2.9 Importing an archive: `src/exec/import.ts`, `src/exec/nsys-sqlite.ts`

- (O) `importArchive(db, job, archive)` (`import.ts:48`) works in this order:
  1. Read the tar, with a limit of `plan.limits.archiveBytes + 64 MiB` (`import.ts:50`).
  2. Read `execution.json` (`kiln-execution/1`) and the recorded conditions.
  3. For each step, run the kind's `import` and every collector's `import` (`collectorImport`, `import.ts:125`).
  4. `stepRuns` turns the observations into runs.
  5. Upsert `captures` (`on conflict … update`, `import.ts:99`), `runs` and `run_bundles` (packed with `lab/store.ts`
     `pack`).
  6. `kind.finish` produces measurement records → `insertRecords`.
  7. Set `devices.host` (`import.ts:121`).

  A capture whose runs already exist counts as cached.
- (O) `nsys-sqlite.ts` opens an `nsys export --type sqlite` file with `node:sqlite` in a temp directory, and returns
  `NsysTables` (kernels, memcpy, NVTX). The browser-safe `@kiln/exec` nsys collector gets these tables through its
  `ImportContext` instead of opening SQLite itself.

### 2.10 Agent gateway: `src/agent.ts`

- (O) It is a model **gateway**, not an agent:
  - `parseSample` validates the request, and `estimatePromptTokens` estimates its size;
  - `withBreakpoint` adds `cache_control`;
  - the Anthropic SSE stream is re-emitted as NDJSON;
  - every call writes one `llm_calls` row, in which `reasoning_tokens` is always null.

  No transcripts are stored and no tools run on the server.
- (O) Perf Lab's `PL/assistant/service.ts` (377 lines, `pi-coding-agent`, `conversations`/`messages` tables) is a
  different design. Its difflib similarity is 0.07, and it was not ported.

### 2.11 Perf Lab data routes: `src/lab/*`

All rows are (O).

| File              | LOC | Purpose |
| ----------------- | --: | ------- |
| `lab/routes.ts`   |  76 | `/api/lab/*`, with Perf Lab's response shapes |
| `lab/store.ts`    | 133 | `catalog(db)` builds `CatalogEntry` from `captures` (`origin` is always `'measured'`, `store.ts:85`); bundles; programs; annotations; `pack`/unpack gzip JSON |
| `lab/datasets.ts` | 206 | COCO selection datasets (`registerCocoDataset`), images, annotations, allowed public sources |
| `lab/evidence.ts` | 118 | `registerArchive` (`evidence.ts:65`): gzip check, `readTarGz`, extract under `lab/evidence/<sha>/`, keep a copy, register the COCO selections. `readArchivePath` (110) serves `{path}` uploads. `MAX_ARCHIVE_BYTES` = 64 MiB (`evidence.ts:12`) |
| `lab/tar.ts`      |  98 | `readTarGz` (refuses links, absolute paths, `..` and bad checksums) and a tar writer |
| `lab/files.ts`    |  37 | `sha256` (node:crypto), `writeFileAtomic` |
| `lab/importer.ts` | 326 | `importPerfLabStore` copies a Perf Lab SQLite store's datasets, archives, media, programs and annotations, its measured artifacts (→ `captures`) and its runs. It re-verifies each cyrb53 hash with `labCaptureHash` (`importer.ts:222`), and skips synthetic artifacts, jobs and transcripts |
| `lab/import.ts`   |  34 | the CLI behind `pnpm lab:import`. Its help text says "jobs (history)" are copied, but the importer does not copy them |

## 3. `packages/exec` (`@kiln/exec`)

The package is browser-safe (O: no `node:` import anywhere in `packages/exec/src`), and its only dependency is
`@kiln/evidence`. Its exports (O, `src/index.ts:3-18`):

| Source module                       | Exports |
| ----------------------------------- | ------- |
| `model.ts`                          | all model types |
| `registry.ts`                       | `Collector`, `WorkloadKind`, the contexts, `environmentBlock` |
| `hosts.ts`                          | `HOSTS_FORMAT`, `HOST_ID`, `parseHost`, `parseHosts` |
| `requirements.ts`                   | `check`, `checkAll`, `environmentVerdict`, `probeRequest` |
| `offers.ts`                         | `capabilities`, `candidateEnvironments`, `collectorsVerdict`, `kindOffer`, `offers` |
| `identity.ts`                       | `CAPTURE_FORMAT`, `captureId`, `deviceKey` |
| `lab-hash.ts`                       | `cyrb53`, `labCaptureHash`, `stableStringify` |
| `plan.ts`                           | `planJob`, `PLAN_LIMITS`, `parseProtocol` |
| `collectors/index.ts`               | `COLLECTORS`, `MODES`, `collectorById`, `disturbs`, `modeCollectors`, `modeOf`, `supports` |
| `collectors/ncu.ts`, `nsys.ts`, `gpu-sampler.ts` | `NCU_METRICS`, `parseNcuCsv`; `kilnIdentityOf`, `nsysEntities`; `parseGpuCsv` |
| `kinds/*`                           | `KINDS`, `kindById`, and the two kinds' helpers |
| `runs.ts`                           | `captureRef`, `stepRuns` |

### 3.1 Model and registry

- (O) `model.ts` (331) defines:
  - `HostProfile`, with the docker options `gpus`, `network` (default `none`), `memory` and `shmSize`
    (`model.ts:10-11`, validated in `hosts.ts:16-17`);
  - `Facts` (`kiln-facts/1`, `model.ts:92`) and `ProbeRequest` (`kiln-probe-request/1`, 103);
  - the capture identity (115) and `Capabilities` (`kiln-capabilities/1`, 139-141);
  - `Plan` (`kiln-plan/1`, 257-262), with `job`, `host`, `driver.sha256`, `environments`, `files`, `steps` and
    `limits {archiveBytes, minFreeDiskBytes}`;
  - the observation types.
- (O) `model.ts:320-321` declares the `'program'` and `'device-spec'` observation types, which no kind produces.
- (O) `registry.ts` (136) defines the two plug-in contracts:
  - `WorkloadKind {id, environments, requires, inProcess, assets, nvtxRange?, accept, lower, import, finish?, lab?}`;
  - `Collector {shape: wrapper | in-process | sidecar, requires, disturbs, exclusive, hints, optional, apply, import}`.

### 3.2 Kinds: `kinds/index.ts`

`KINDS` holds exactly two kinds (O): `kiln-kernels/1` and `perf-lab-sampler/1`. `kiln-probe/1` and `kiln-program/1`
appear only in the design doc. `nvtxRange` is declared but unused (I: no kind sets it).

- `kiln-kernels/1` (O, 244 lines):
  - `acceptKernel`, `kernelContentId` and `entrySymbol`;
  - the bundle, `kiln-bundle/1`, still carries `ncu: false` (`kiln-kernels.ts:121`). `kiln_runner.py` no longer reads
    it, so the field is vestigial;
  - the results are `kiln-results/1` (156, 171);
  - `kernelRecords` emits `kiln-measure/1` records, skipping runs taken under disturbing collectors.
- `perf-lab-sampler/1` (O, 367 lines):
  - its content id covers the spec plus the staged assets `perf_lab_local/{__init__,run,sampler}.py`;
  - `samplerEntities` is a port of `PL/importer.ts` `importRepetition`. `roleOf` and `SPAN_NAME` are identical
    (`PL/importer.ts:53-61` vs `perf-lab-sampler.ts:129-137`). The difflib similarity is 0.65, with 211 matching
    lines.

### 3.3 Collectors: `collectors/*`

There are eleven collectors (O): `cuda-events`, `ptxas`, `nvtx`, `stage-timers`, `wall-clock`, `rusage`,
`torch-profiler`, `torch-memory`, `ncu`, `nsys` and `gpu-sampler`. There are six modes: `timing`, `counters`,
`timeline`, `cpu`, `trace` and `memory`.

- (O, live `GET /api/hosts`) `nvtx` and `stage-timers` are never usable: "no registered kind cooperates".
- (O) `ncu` (`parseNcuCsv`, `NCU_METRICS`) and `nsys` (`nsysEntities`, `kilnIdentityOf`) are implemented, although
  KILN-003 `tasks.md` still lists P2 (profiler collectors) as open (I: the task list lags the code).
- (O) `gpu-sampler` parses the CSV from the driver's `nvidia-smi -lms 100` (`parseGpuCsv`).

### 3.4 Planner: `plan.ts`

- (O) `PLAN_LIMITS` (`plan.ts:11`):

  | Limit           | Value   |
  | --------------- | ------- |
  | captures        | 256     |
  | group           | 64      |
  | reps            | 64      |
  | warmup          | 1000    |
  | launches        | 10 000  |
  | archive         | 1 GiB   |
  | min free disk   | 5 GiB   |
  | step output     | 64 MiB  |

- (O) `planJob(input) → PlanOutput` works in five passes:
  1. It gives each capture a verdict, `execute`, `cached` or `blocked`, with a reason.
  2. It groups captures by `kind|collectors|pairId`.
  3. When `ncu` is requested, it adds a timing companion step, because counters disturb timing.
  4. It orders repetitions with `@kiln/evidence` `repetitionOrder(seed, rep)`, which interleaves paired arms.
  5. It applies in-process collectors first, then wrappers, and emits `kiln-plan/1` with `limits`
     (`plan.ts:171-175`).

### 3.5 Identity, hosts, requirements, offers

- (O) `identity.ts`:
  - `captureId` is the sha256 of the canonical JSON `{format: 'kiln-capture/1', kind, content, collectors, protocol,
    device, environment}`;
  - `deviceKey` is `gpu:<uuid>` or `cpu:<arch>:<model>:<cores>`.
- (O) `hosts.ts` (99): `parseHosts` reads `kiln-hosts/1` (`hosts.ts:5`, 84).
- (O) `requirements.ts` (85) checks a kind's requirements against `kiln-facts/1` and builds the probe request (59, 84).
- (O) `offers.ts` (61) answers which environment runs which kind, or why the kind is blocked, and builds
  `kiln-capabilities/1` (`offers.ts:60`).
- (O) `lab-hash.ts` (43) holds `cyrb53`, `stableStringify` and `labCaptureHash`, copied from Perf Lab's language util
  (duplication, §8).

### 3.6 Tests

`packages/exec/test/exec.test.ts` has 21 tests (O, vitest JSON, 19 ms).

## 4. `packages/evidence` (`@kiln/evidence`)

The package has no runtime dependencies and no `node:` imports (O). Its exports (O, `src/index.ts`):

| Module         | LOC | Exports |
| -------------- | --: | ------- |
| `values.ts`    | 174 | `observed`, `derived`, `heuristic`, `illustrative`, `missing`, `combine`, `seal`, `isSealed`, `ProvenanceError`, `raw`, `num`, … |
| `stats.ts`     | 142 | `median`, `quantile` (type 7), `rng` (mulberry32), `summarize` (bootstrap CI), `pairedRatio`, `separated` |
| `protocol.ts`  |  60 | `repetitionOrder`, `checkSamples` |
| `sha256.ts`    |  65 | `sha256Hex`, `isSha256Hex` (pure JS) |
| `canonical.ts` |  65 | `canonicalJSON`, `CanonicalJSONError` |
| `identity.ts`  | 107 | `canonicalSource`, `contentId`, `deviceId`, `cudaDevice`, `slug`, `isFingerprint` |
| `record.ts`    | 287 | `RECORD_FORMAT` = `kiln-measure/1` (`record.ts:8`), `validateRecord`, `validateContext`, `recordId`, `poolKey`, `isDecisive` |
| `verdict.ts`   | 151 | `verdict` → supported/refuted/open/unqualified, `below`, `above` |

- Consumers (O, grep):
  - `apps/server`: records, devices, exec and the tests;
  - `packages/exec`;
  - `packages/kiln/src/std/*` (6 files);
  - `packages/lab/src` and `packages/lab/src/lang` (7 files).
- Tests (O, vitest JSON): 133 in nine files.

  | File      | Tests |
  | --------- | ----: |
  | canonical |    18 |
  | identity  |    23 |
  | package   |     2 |
  | protocol  |     5 |
  | record    |    38 |
  | sha256    |     6 |
  | stats     |    13 |
  | values    |    13 |
  | verdict   |    15 |

## 5. The driver: `runner/kiln_driver.py` (`kiln-driver/1`)

The driver uses only the Python standard library and runs one process per GPU host (`kiln_driver.py:1-30`), started
as `python3 kiln_driver.py serve --root ~/kiln-exec --listen 127.0.0.1:5281`. The header describes it as "plain HTTP
without authentication: run it only while you work with the host, and bind it to the one address the server
reaches" (O). In this session the server reaches `mac` at `127.0.0.1:5381` and `bling` at `127.0.0.1:5481` (O, live
`GET /api/hosts`; I: through ssh tunnels).

### 5.1 Routes

(O) From the header, `kiln_driver.py:16-28`, and the dispatcher `handler_for`, line 879:

| Method | Path                                | Contract |
| ------ | ----------------------------------- | -------- |
| GET    | /v1/info                            | api, sha256 of the driver file, hostname, root, running, queued |
| POST   | /v1/probe                           | `kiln-probe-request/1` → `kiln-facts/1` |
| HEAD   | /v1/blobs/:sha                      | 200 stored / 404 |
| GET    | /v1/blobs/:sha                      | the blob bytes; handled by the same `blobs` branch (`handler_for`, ~939), not in the header |
| PUT    | /v1/blobs/:sha                      | 201; 400 when the bytes do not hash to the name |
| POST   | /v1/jobs                            | `kiln-plan/1` → 202 `{position}`; 409 missing blobs; 400 refused mount |
| GET    | /v1/jobs                            | every job with its state (no server caller) |
| GET    | /v1/jobs/:id/events?after=N&wait=S  | the events after N; waits at most 60 s; at most 1000 events per reply |
| GET    | /v1/jobs/:id/plan                   | the stored plan (~977); not in the header |
| POST   | /v1/jobs/:id/cancel                 | 202; kills the running container |
| GET    | /v1/jobs/:id/archive                | `result.tar.gz`; 409 before the job ended |
| DELETE | /v1/jobs/:id                        | deletes the job directory once the job ended |
| PUT    | /v1/self                            | a new driver source: compile check, 202, then re-exec (`reexec`, 1008); 409 while busy |

### 5.2 Events

(O) In emission order:

1. `job.queued`.
2. `driver.started {driver: <sha256>, pid, hostname}` (`kiln_driver.py:588`). The design doc names the field `sha256`.
3. `lock.waiting`, `lock.acquired`.
4. `conditions`.
5. `step.started`, `step.output` (the server keeps at most 400), `step.refused`, `step.finished`.
6. `job.cancelled`, `driver.failed`.
7. Exactly one final `result {status: done|failed|cancelled, error, sha256, bytes, partial}`.

### 5.3 Worker lifecycle

(O) For each job, in order:

1. Check free disk against `limits.minFreeDiskBytes`.
2. Take the GPU lock: `fcntl.flock` on `/run/lock/kiln-gpu-<uuid>.lock`, with a `.holder` file
   (`kiln_driver.py:670`, released at 705). It emits `lock.waiting` while blocked, bounded by the plan's lock wait
   (600 s in the sampled plan).
3. Record the conditions (GPU clocks, temperature, compute apps) before and after each step, plus an idle window.
4. Run each step as a container (`container`, `kiln_driver.py:773-790`):

   ```text
   docker run --rm --init --name kiln-<job>-<step>
     --label kiln.job=… --label kiln.step=…
     --network <host profile, default none>
     --user <uid>:<gid>          (unless step.user is root)
     [--memory] [--shm-size]
     -v bundle:/job/in:ro  -v out:/job/out  + role mounts bundle|cache|tool
   ```

   The probe container also runs with `--network none` (402).
5. Run sidecars: `gpu-sampler` runs `nvidia-smi -lms 100` for the length of the step.
6. `enforce_output` (862) drops the largest files beyond `maxOutputBytes` (default 64 MiB, 757).
7. Append to `steps.ndjson` after each step, for recovery (606), and write `execution.json` (`kiln-execution/1`,
   614 and 624).
8. Pack `result.tar.gz`, then emit `result`. (O) The archive's `events.ndjson` is packed before the final `result`
   event, so it lacks it.

At start-up, `recover()` (329) fails interrupted jobs with "driver restarted".

Root layout (O, header):

- `blobs/<sha256>`;
- `jobs/<id>/{plan.json, events.ndjson, bundle/, out/<step>/, conditions/, logs/, execution.json, result.tar.gz}`;
- `cache/<role>/`.

## 6. Wire and file formats

| Format                       | Kind     | Producer → consumer                                          | Defined at |
| ---------------------------- | -------- | ------------------------------------------------------------ | ---------- |
| `kiln-hosts/1`               | file     | operator → `apps/server` (`loadHosts`)                       | `packages/exec/src/hosts.ts:5` |
| `kiln-driver/1`              | protocol | `kiln_driver.py` ↔ `DriverClient`                            | `runner/kiln_driver.py:53` |
| `kiln-probe-request/1`       | wire     | server (`probeRequest`) → driver                             | `packages/exec/src/model.ts:103` |
| `kiln-facts/1`               | wire     | driver probe → server `offers`                               | `model.ts:92`; `kiln_driver.py:370` |
| `kiln-capabilities/1`        | wire     | server → page (`GET /hosts/:id/capabilities`)                | `model.ts:139-141`; `offers.ts:60` |
| `kiln-plan/1`                | wire     | `planJob` → driver `POST /v1/jobs`; stored as `plans/<id>.json` | `model.ts:257-262`; `plan.ts:171` |
| `kiln-capture/1`             | identity | `captureId` hash input                                       | `packages/exec/src/identity.ts:6` |
| `kiln-bundle/1`              | file     | `kiln-kernels` lower → `kiln_runner.py` input                | `kiln-kernels.ts:121`; `kiln_runner.py:10` |
| `kiln-results/1`             | file     | `kiln_runner.py` → `kiln-kernels` import                     | `kiln-kernels.ts:156,171`; `kiln_runner.py:239-268` |
| `kiln-execution/1`           | file     | driver → `importArchive`                                     | `kiln_driver.py:614,624` |
| `result.tar.gz`              | archive  | driver → server `archives/<sha>.tar.gz`                      | `kiln_driver.py` header |
| `kiln-measure/1`             | record   | the kinds' `finish`, or the page → `records` table           | `packages/evidence/src/record.ts:8` |
| `perf-lab-sampler/1`         | kind id  | lab UI → planner → `perf_lab_local.run`                      | `packages/exec/src/kinds/perf-lab-sampler.ts` |
| `kiln-kernels/1`             | kind id  | page → planner → `kiln_runner.py`                            | `packages/exec/src/kinds/kiln-kernels.ts` |
| `detection-qualification/v1` | manifest | Perf Lab only (`PL/qualification.ts`, 8 occurrences)         | not ported to Kiln |

## 7. End-to-end job flow

```text
page / lab UI                  apps/server                        @kiln/exec               kiln_driver.py (host)
─────────────                  ───────────                        ──────────               ─────────────────────
POST /api/jobs {host,          Jobs.create (jobs.ts:158)
 captures, reason, approve?}    ├ hosts.capabilities(host) ──── probe (TTL 10 min) ─────► POST /v1/probe → kiln-facts/1
 X-Kiln-Token, x-kiln-proposer  ├ planJob(...) ──────────────────► verdicts, groups, kiln-plan/1
                                ├ blobs → data/blobs, plan → data/plans/<id>.json
                                └ insert jobs + job_captures; event 'proposed'
POST /api/jobs/:id/approve     Jobs.approve → follow → drive (serial per host)
                                submit: images match facts? else → proposed ('replan')
                                ├ HEAD/PUT /v1/blobs/:sha ───────────────────────────────► blobs/<sha>
                                └ POST /v1/jobs (kiln-plan/1) ────────────────────────────► queue, 202 {position}
                               drive: GET /v1/jobs/:id/events?after=seq&wait=25 ◄──────── job.queued, driver.started,
                                maps to running; stores ≤400 step.output; executor_ms        lock.*, step.*, conditions
                                                                                            docker run per step
                               on 'result': collect (jobs.ts:370)
                                ├ status importing; GET /v1/jobs/:id/archive ◄──────────── result.tar.gz
                                ├ verify sha256; data/archives/<sha>.tar.gz; archives row
                                ├ importArchive (import.ts:48) ──► kind.import + collectors.import + stepRuns
                                │   captures/runs/run_bundles upsert; kind.finish → kiln-measure/1 records
                                ├ finish: done | failed | cancelled; SSE job.updated, records.added, catalog.changed
                                └ DELETE /v1/jobs/:id ────────────────────────────────────► job dir removed
page: GET /api/records, /api/lab/catalog, /api/lab/bundles (refreshed on SSE events)
```

Restart behaviour (O): the server's `resume()` re-follows each job from `jobs.driver_seq`, and the driver's
`recover()` fails the jobs it was running when it died. Partial archives (from a cancel or a failure) are imported too.

## 8. Duplication

### 8.1 Against `lab-workbench/server` (Perf Lab)

The similarity ratios are Python `difflib.SequenceMatcher` over whitespace-stripped lines, with `autojunk=False` (O;
the script and its reproduction are in diary Step 1). A ratio below about 0.15 means unrelated code. Trivial lines
such as `}` inflate the matching-line counts.

| Perf Lab file          | Kiln file                                     | PL LOC | Kiln LOC | Same lines | Ratio | Canonical side |
| ---------------------- | --------------------------------------------- | -----: | -------: | ---------: | ----: | -------------- |
| `tar.ts`               | `apps/server/src/lab/tar.ts`                  |    129 |       98 |         83 |  0.73 | Kiln (trimmed copy) |
| `events.ts`            | `apps/server/src/events.ts`                   |     21 |       23 |         16 |  0.73 | Kiln |
| `importer.ts`          | `packages/exec/src/kinds/perf-lab-sampler.ts` |    286 |      367 |        211 |  0.65 | Kiln (ported into a kind) |
| `datasets.ts`          | `apps/server/src/lab/datasets.ts`             |    266 |      206 |        150 |  0.64 | Kiln, minus `materialize` (PL fetches; Kiln returns 501) |
| `evidence.ts`          | `apps/server/src/lab/evidence.ts`             |    100 |      118 |         70 |  0.64 | Kiln, minus qualification (PL registers detection-qualification/v1) |
| `db.ts`                | `apps/server/src/db.ts`                       |    363 |      415 |        152 |  0.39 | Kiln; helpers `PL/db.ts:330-363` ≈ `db.ts:383-415` |
| `store.ts`             | `apps/server/src/lab/store.ts`                |    276 |      133 |         37 |  0.18 | Kiln (rewritten over `captures`) |
| `app.ts`               | `apps/server/src/app.ts`                      |    286 |      126 |         22 |  0.11 | separate designs |
| `runner.ts`            | `apps/server/src/exec/jobs.ts`                |    380 |      495 |         38 |  0.09 | separate designs; Kiln's replaces PL's |
| `assistant/service.ts` | `apps/server/src/agent.ts`                    |    377 |      322 |         26 |  0.07 | separate designs |

Not ported (O):

- `PL/qualification.ts` (394 lines, `detection-qualification/v1`) and `PL/dino.ts` (114);
- `PL/probe.ts` (37), `PL/assistant/*` and `PL/bundles.ts` (5);
- the synthetic executor and `SYNTHETIC_HOSTS`.

Consequence (I): an evidence archive registered in Kiln registers only its COCO datasets, so Kiln does not recognise
detection-qualification evidence.

Canonical side (O, from git history): `lab-workbench/` has not changed since its verbatim import in `92daa13`
(2026-10-19). Every later server change landed in `apps/server` and `packages/exec`. Kiln is therefore canonical for
every file in the table. `lab-workbench/server` is a frozen reference that still builds and passes its own 104 tests.

### 8.2 Duplication inside Kiln

| What | Where (O) | Note |
| ---- | --------- | ---- |
| Perf Lab schema 5, a third copy | `apps/server/test/support/lab.ts` (`PL_SCHEMA_5`), `PL/db.ts`, Kiln migration 2 | the importer test fixture builds a PL store from a hand copy |
| cyrb53 + `stableStringify` | `packages/exec/src/lab-hash.ts`, `packages/lab/src/lang/util.ts`, `lab-workbench/src/lang/util.ts` | must stay bit-identical, or imported capture hashes stop verifying (`importer.ts:222`) |
| SHA-256 helpers | `@kiln/evidence` `sha256Hex` (pure JS); `node:crypto` in `lab/files.ts`, `exec/hosts.ts`, `exec/assets.ts` | three node:crypto call sites beside the package |
| Archive registration | `lab/evidence.ts:65` `registerArchive` (extract + datasets) vs the private `registerArchive` at `exec/jobs.ts:434` (list only, `readTarGz(data, 2**31)`) | two size limits (64 MiB, against a 2 GiB read limit and a 1 GiB plan limit) and two storage directories; `GET /archives/:sha` searches both (`routes.ts:72`) |
| `HostView` wire type | `apps/server/src/exec/hosts.ts` `HostView`; `packages/lab/src/data/capabilities.ts:48` `HostViewLike`; untyped reads in `apps/workbench/src/server-sync.js:94-142` | a structural re-declaration with no shared type package |
| SQLite helpers | `db.ts:383-415` vs `PL/db.ts:330-363` | copied |

## 9. Complexity hotspots

Ranked by how much a change there can break (I, judged from the code read):

1. **`apps/server/src/exec/jobs.ts` (495).** Seven states, spread across `create`, `approve`, `cancel`, `drive`,
   `submit`, `collect`, `complete` and `outcome`. Two schedulers (the driver's queue and the per-host serial
   submit). Long-polling with a resumable `driver_seq`. A budget-forced cancellation that ends as `failed`. A replan
   edge missing from its own diagram. Restart correctness depends on `driver_seq`, `submitted_at` and the stored plan
   files agreeing.
2. **`runner/kiln_driver.py` (1044).** One file holds the HTTP server, the queue, the GPU flock, docker argv
   construction, sidecars, output enforcement, recovery and self-update (`PUT /v1/self` re-exec), with no
   authentication.
3. **`apps/server/src/db.ts` (415).** Migration 3 rewrites migration 2's tables and seeds `captures` from
   `lab_artifacts`. It has stale comments and the unused `sources` and `devices.spec_json`.
4. **`packages/exec/src/plan.ts` + `registry.ts`.** New collectors and kinds go wrong at the kind/collector contract
   (shapes, `disturbs`, `exclusive`, companions). `nvtx` and `stage-timers` are registered but unusable.
5. **`packages/exec/src/kinds/perf-lab-sampler.ts` (367).** The largest kind; half of it is a port of Perf Lab's
   importer.
6. **`apps/server/src/lab/importer.ts` (326).** A one-shot migration tool that must track two schemas.
7. **`apps/server/src/agent.ts` (322).** Streaming re-encoding and token accounting.

## 10. Reusable vs leaky packages

All rows are (O) unless marked.

| Component | Readiness (vocabulary) | Why |
| --------- | ---------------------- | --- |
| `@kiln/evidence` | ready | zero dependencies, no `node:` imports, 133 tests; four packages already consume it |
| `@kiln/exec` | needs-extraction | browser-safe and depends only on evidence, but it embeds two concrete kinds (one of them Perf Lab's) and a cyrb53 copy. The `WorkloadKind`/`Collector` contract could be a package of its own (I) |
| `runner/kiln_driver.py` | ready (as a tool) | stdlib-only, a versioned protocol, self-updating. The missing auth is a deployment constraint, not a coupling |
| `DriverClient` (`exec/driver-client.ts`) | needs-extraction | 117 lines, with no server imports beyond types. Its natural home is beside the driver protocol (I) |
| `lab/tar.ts` | needs-extraction | the safe tar.gz reader, used by both `lab/` and `exec/`, lives under `lab/` |
| `events.ts` EventBus | ready (trivial) | 23 lines |
| `exec/jobs.ts` + `exec/import.ts` | entangled | they import `../lab/files.ts`, `../lab/tar.ts`, `lab/store.ts` `pack`, records, db and the bus |
| `lab/*` routes and store | domain-specific | Perf Lab's response shapes over Kiln's tables |
| `agent.ts` gateway | needs-extraction | standalone apart from config and db; it could front any client (I) |

## 11. Dead, stale and half-migrated code

| Item | Evidence (O) |
| ---- | ------------ |
| `apps/server/README.md` describes executors, `KILN_EXECUTORS`, `pnpm dev`/`pnpm serve`, and 501 routes `/lab/seed`, `/lab/evidence`, `/lab/jobs`, `/lab/hosts` | none of them exist (`package.json` scripts; `lab/routes.ts`); the executors were deleted in `49f5156` |
| `DriverClient.jobs()` | no caller (`driver-client.ts:109`) |
| `sources` table | never read or written |
| `devices.spec_json` | added at `db.ts:368`, never written |
| `db.ts:9-10` comment on `jobs.executor`/`executor_ms` | describes the dropped first `jobs` table |
| `CatalogEntry.origin` includes `'job'` | always `'measured'` (`store.ts:85`) |
| `kiln-bundle/1` field `ncu: false` | `kiln-kernels.ts:121`; `kiln_runner.py` does not read it |
| `'program'` and `'device-spec'` observation types; `nvtxRange` | `model.ts:320-321`; no producer |
| `nvtx` and `stage-timers` collectors | registered; "no registered kind cooperates" |
| `lab/import.ts` help says "jobs (history)" are copied | the importer skips jobs |
| `POST /lab/datasets/:id/materialize` | 501 (`lab/routes.ts:65`) |
| `packages/lab` `lab-data.ts` comments naming `/api/lab/evidence` and `/api/lab/health` | the routes do not exist |
| The replan edge | `jobs.ts:345-351` sets `proposed` but keeps the old plan file. Re-approving re-submits the same plan, which replans again (I: a dead end; the event text tells the user to propose a new job) |

Deleted in KILN-003 (O, `git show --stat`):

- `49f5156` removed `executors/cuda-runner.ts`, `executors/index.ts`, `executors/types.ts`, the first `jobs.ts`,
  `lab/probe.ts`, `test/executors.test.ts`, `fake-runner.mjs` and `runner/docker/kiln-docker-python`.
- `8276bf7` removed `lab/captures.ts`.

## 12. Tests (O, vitest JSON reporter, this session)

| Package          | Files | Tests | Notes |
| ---------------- | ----: | ----: | ----- |
| `@kiln/server`   |     9 |    79 | agent 13, client 4, decide 1, events 2, jobs 22 (32.6 s), lab-import 7, lab 14, records 5, security 11 |
| `@kiln/exec`     |     1 |    21 | `exec.test.ts` |
| `@kiln/evidence` |     9 |   133 | canonical 18, identity 23, package 2, protocol 5, record 38, sha256 6, stats 13, values 13, verdict 15 |

`jobs.test.ts` runs the real `kiln_driver.py` against fake `docker`, `nvidia-smi` and `nvcc` binaries in
`apps/server/test/support/bin`, plus a `fake_runner.py`. The driver protocol is therefore exercised end to end without
a GPU.

## 13. Live server snapshot (read-only GETs on 127.0.0.1:5380)

- `GET /api/health`: migrations 3, 2 hosts, features `[records, devices, hosts, jobs, archives, events, lab]`.
- `GET /api/hosts` returned two hosts:
  - `mac`: 127.0.0.1:5381, environment `perf-lab-cpu`, no GPU. `kiln-kernels/1` is blocked: "mac has no NVIDIA GPU".
  - `bling`: 127.0.0.1:5481, unreachable at the time. Its cached facts: GB10, GPU counters admin-only, environment
    `kiln-perf` with nvcc 13.0, ncu 2025.3.1.0 and nsys 2025.3.2.474.
- `GET /api/jobs`: 20 jobs, all `done` (16 on bling, 4 on mac).
- `GET /api/archives`: 21 archives, of which 20 are job archives.
- `GET /api/devices`: one device, `cuda:nvidia-gb10-e220ce35`, with 12 records.
- A sampled `GET /api/jobs/:id/plan`: `kiln-plan/1`, with the same bundle sha256 for every repetition, lock
  `waitSeconds` 600 and `shmSize` `1g`.

## 14. Open questions

- Should the replan edge regenerate the plan, as the design doc implies, or fail the job?
- Should `DriverClient.jobs()` back a start-up reconciliation of driver jobs the server has lost track of?
- Now that Perf Lab's runner is gone, where should `detection-qualification/v1` evidence live: in a kind, or in an
  archive importer beside `lab/evidence.ts`?
- Should the two archive registration paths become one, with one size limit and one directory?
