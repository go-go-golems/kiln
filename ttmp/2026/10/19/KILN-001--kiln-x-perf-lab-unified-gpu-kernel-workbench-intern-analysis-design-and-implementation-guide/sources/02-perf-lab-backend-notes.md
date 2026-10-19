# Perf Lab backend: evidence-backed technical notes (source for the KILN-001 intern guide)

These notes describe the backend half of the Perf Lab workbench as it exists on disk on 2026-10-19: the Hono + SQLite
lab server, its runner and importers, the Python workloads, the assistant service, the `pnpm lab` CLI, the data in
`.data/`, and the planned remote GPU executor (ML-PERF-003). They are written so an engineer can turn them into an
intern-facing design and implementation guide without re-reading the code.

## 0. Scope, provenance and conventions

- **Code under study:** `/Volumes/SSD/code/kiln/lab-workbench` (also reachable as `~/code/tulip/experiments/kiln/lab-workbench`).
  All `file:line` references below are relative to that directory unless they start with `src/` (the browser half,
  cited only where the backend depends on it) or name a ticket document.
- **Where the code came from.** `kiln/README.md` says the directory is a verbatim copy of
  `playback/ttmp/2026/10/12/ML-PERF-001--…/experiments/lab-workbench` at Playback commit `cdb84891c`. `diff -rq` of
  `server/` between the two locations reports no differences (observed). The kiln repository itself has no commits yet
  (`git log` → "your current branch 'main' does not have any commits yet").
- **Size.** Backend TypeScript and Python, excluding tests: about 3,300 lines (`server/*.ts` + `server/assistant/*.ts`
  + `scripts/lab.ts` + `workloads/perf_lab_*/*.py`; `wc -l` total including tests is 4,853).
- **What I ran.** `pnpm exec vitest run server` and `pnpm exec vitest run` (both read-only: every test opens
  `:memory:` SQLite and `mkdtemp` directories, see §11). `sqlite3 -readonly` and Python `sqlite3` with
  `file:…?mode=ro` against `.data/perf-lab.sqlite`. Nothing in the repository was modified; no server was started;
  `tsc -b` was not run because it writes `tsconfig.tsbuildinfo`.
- **Labels.** *Observed* = read in code, data or command output. *Inferred* = my reasoning from the code, not
  exercised. Where a design document and the code disagree, the code wins and the disagreement is listed in §10.
- **Background documents read:** ML-PERF-001 `design/04-perf-lab-backend-end-to-end-design.md` (esp. §2, §5–§8, §11,
  §15), `reference/04-perf-lab-backend-implementation-diary.md` (steps 5–6), and ML-PERF-003 `index.md`, `tasks.md`,
  `design/01-intern-guide-running-perf-lab-experiments-on-the-dgx.md` (§0, §4–§6, §6.13–§10),
  `reference/01-implementation-diary.md`.

## 1. Process architecture

### 1.1 Processes and ports

```text
browser ──► Vite dev server 127.0.0.1:5199 (pnpm dev) ──/api proxy──► lab server 127.0.0.1:5198 (pnpm lab-server)
                                                                          │  Hono app, basePath /api
                                                                          ├─ node:sqlite  .data/perf-lab.sqlite (WAL)
                                                                          ├─ Runner: one job, one child process at a time
                                                                          │     └─ uv run --project workloads python -m perf_lab_local.run | perf_lab_dino.run
                                                                          ├─ probe at startup: uv run … python -m perf_lab_local.probe
                                                                          └─ PiAssistant: pi ModelRuntime + lunaroute extension → LLM gateway
```

- **Two Node processes in development.** Vite serves the React app on port 5199 (`vite.config.ts:9-14`,
  `strictPort: false`, host `127.0.0.1`) and proxies `/api` to `http://127.0.0.1:5198` (`vite.config.ts:13`). The lab
  server is a separate process so a client hot reload never interrupts a running job (design 04 §2).
- **No static serving in the server.** The Hono app is created with `.basePath('/api')` (`server/app.ts:68`) and mounts
  only API routes; nothing serves `dist/`. A production build (`pnpm build` → `tsc -b && vite build`) is served only
  by `vite preview` (inferred: Vite's `preview.proxy` defaults to `server.proxy`, so `/api` would still be proxied).
- **Package scripts** (`package.json`): `lab-server` = `tsx server/index.ts`; `lab-server:watch` = `tsx watch
  server/index.ts`; `lab` = `tsx scripts/lab.ts`; `dev`, `build`, `typecheck`, `test` (`vitest run`), `preview`. The
  server runs TypeScript directly through `tsx`, which lets it import the browser language's pure modules
  (`src/lang/util.ts`, `src/lang/values.ts`, `src/lang/detections.ts`, `src/components/organisms/IdePane/reference`)
  without a build step. The name `lab-server` exists because `pnpm server` is a pnpm built-in (design 04 §15.4).
- **Runtime versions.** Node `v26.8.1` on this machine (observed; `node:sqlite`'s `DatabaseSync` is used without a
  native addon). Python `3.12` (`workloads/.python-version`), `torch==2.14.1`, `numpy==2.5.4`, `transformers==5.2.0`,
  `huggingface-hub`, `opencv-python-headless`, `pillow`, `pydantic-settings` (`workloads/pyproject.toml`), locked by
  `workloads/uv.lock`; `[tool.uv] package = false`.

### 1.2 Startup sequence (`server/index.ts`)

| Line  | Step                                                                                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12    | `loadConfig()` reads environment (§1.3).                                                                                                                                                                                                                                                              |
| 13    | `openDb(config.dbFile)`: `mkdir -p`, `pragma journal_mode = wal; foreign_keys = on; busy_timeout = 5000`, apply pending migrations (`server/db.ts:322-344`).                                                                                                                                          |
| 14    | `failInterruptedJobs(db)`: every job in `approved`/`running`/`importing` becomes `failed` with "server restarted before the job finished" (`server/store.ts:254-261`).                                                                                                                                 |
| 15-16 | `EventBus`, then `new Runner(db, bus, { local: processExecutor(config) }, { dataDir, config })`: only host `local` gets a real executor.                                                                                                                                                               |
| 18-22 | `probeLocal(config)` runs asynchronously; until it resolves, `/hosts/local/capabilities` answers 503 `probing`.                                                                                                                                                                                       |
| 24-27 | `new PiAssistant(db, createPiCatalog(), config.model)`: the model catalog loads asynchronously; the assistant reports `available: false, reason: 'starting'` until then (`server/assistant/service.ts:43, 57-61`).                                                                                    |
| 29-32 | `createApp(...)`, `serve({ fetch, hostname: config.host, port: config.port })` from `@hono/node-server`; logs the URL, DB path and the number of jobs it failed.                                                                                                                                       |
| 34-39 | `SIGINT`/`SIGTERM` → `db.close(); process.exit(0)`. Running child processes are not killed explicitly (inferred: on Ctrl-C the terminal signals the whole process group; on a bare `SIGTERM` to Node a running Python child would be orphaned). |

### 1.3 Configuration and environment variables

`server/config.ts:20-34` builds `ServerConfig { root, dataDir, dbFile, artifactsDir, workloadsDir, host, port, model, uv }`.
`root` is the lab-workbench directory resolved from `import.meta.url` (`config.ts:4`). `host` is hard-coded to
`127.0.0.1` (`config.ts:28`); only tests can override it.

| Variable                          | Default                                                                  | Read at                                                 | Effect                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `PERF_LAB_DATA_DIR`               | `<root>/.data`                                                           | `server/config.ts:21`                                   | SQLite file, `artifacts/`, `evidence/`, `media/`, `inductor-cache/` live here             |
| `PERF_LAB_PORT`                   | `5198`                                                                   | `server/config.ts:29`                                   | HTTP port                                                                                 |
| `PERF_LAB_MODEL`                  | `lunaroute/deepseek-4.1-flash:high`                                      | `server/config.ts:30`                                   | Default assistant model, `provider/id[:thinking]`                                         |
| `PERF_LAB_UV`                     | `uv`                                                                     | `server/config.ts:31`, `scripts/lab.ts:108`             | The `uv` binary used for every Python invocation                                          |
| `PERF_LAB_PI_EXTENSIONS`          | `~/.pi/agent/npm/node_modules/@lunaroute/pi-extension/src/index.ts` if present | `server/assistant/model.ts:65-69`                 | Comma-separated pi extension files that register model providers                         |
| `PERF_LAB_SYSTEM_ROLE_PROVIDERS`  | `lunaroute`                                                              | `server/assistant/model.ts:75`                          | Providers whose system prompt is sent in the `system` role instead of `developer`        |
| `PERF_LAB_PLAYBACK_REPO`          | `git -C <root> rev-parse --show-toplevel`                                | `server/dino.ts:34-38`                                  | Playback checkout from which the dino workload `git show`s the arms' sources             |
| `PERF_LAB_URL`                    | `http://127.0.0.1:5198`                                                  | `scripts/lab.ts:17`                                     | Server the CLI talks to                                                                   |
| `PERF_LAB_INDUCTOR_CACHE`         | set by the runner to `<dataDir>/inductor-cache`                          | `server/runner.ts:59` → `workloads/perf_lab_local/run.py:66-67` | Shared TorchInductor cache for the sampler when `state.compilerCache != 'fresh'` |
| `PYTHONUNBUFFERED=1`, `TQDM_DISABLE=1` | set by the server for children                                     | `server/runner.ts:59`, `server/dino.ts:84`              | Line-buffered progress; no progress bars on stderr                                        |

## 2. HTTP API reference

All routes are under `/api` and exchange JSON unless stated. Errors use one envelope, `{ error: <code>, message,
...extra }` (`server/app.ts:47`). There is no authentication, no CORS middleware and no Origin/Host check (observed: no
such middleware in `server/app.ts` or `server/index.ts`).

### 2.1 Core routes (`server/app.ts`)

| Method and path                         | Lines   | Request                                                                                                  | Response (200 unless noted)                                                                                                                                                                                 | Other statuses                                                           |
| --------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /health`                           | 70-82   | —                                                                                                        | `{ status:'ok', startedAt, database:{file, migrations:<count of schema_migrations>}, probe:{ok,ms}\|{ok:false,error}, assistant:{available, model?, reason?}, features:['evidence-import','datasets','media'], sseClients }` | —                                                                        |
| `GET /hosts`                            | 85-91   | —                                                                                                        | `[{host:'local', executor:'process', synthetic:false, available:<probe ok>, error?}, {host:'playback@dgx', executor:'synthetic', synthetic:true, available:true}, {host:'playback@rtx-dev', …}]`               | —                                                                        |
| `GET /hosts/:host/capabilities`         | 92-99   | —                                                                                                        | `LocalCapabilities` (`server/probe.ts:7-18`) for `local` only                                                                                                                                               | 404 `not_found` (any other host), 503 `probing`, 503 `probe_failed`      |
| `GET /programs/:labId`                  | 102-105 | —                                                                                                        | `{ labId, source, presetHash, updatedAt }`                                                                                                                                                                  | 404 `not_found`                                                          |
| `PUT /programs/:labId`                  | 106-111 | `{ source: string ≤ 500,000 chars, presetHash?: string }`                                                | `{ ok: true }` (upsert, `server/store.ts:42-52`)                                                                                                                                                            | 400 `bad_request`                                                        |
| `DELETE /programs/:labId`               | 112-115 | —                                                                                                        | `{ ok: true }` (the browser then falls back to the preset)                                                                                                                                                  | —                                                                        |
| `GET /catalog`                          | 118-125 | (a `?lab=` parameter is ignored)                                                                         | `{ [captureHash]: { origin, source, ref:'exp/arm/mode', host, reps, labId, importedAt } }` for artifacts with `status='available'` in **all** labs                                                         | —                                                                        |
| `POST /labs/:labId/seed`                | 126-133 | `{ captures: CaptureInput[] }`                                                                           | `{ seeded: n }`; emits `catalog.changed` if n > 0                                                                                                                                                           | 400, 409 `spec_hash_mismatch`                                            |
| `GET /bundles?hashes=a,b,…`             | 134-139 | up to 64 hashes                                                                                          | `{ [hash]: Bundle[] }` ordered by repetition (`server/store.ts:134-141`)                                                                                                                                    | —                                                                        |
| `GET /jobs?lab=`                        | 142     | optional lab filter                                                                                      | `JobView[]` ordered by `created_at`                                                                                                                                                                         | —                                                                        |
| `GET /jobs/:id`                         | 143-146 | —                                                                                                        | `JobView`                                                                                                                                                                                                   | 404                                                                      |
| `POST /jobs`                            | 147-175 | `{ id?: 'job-[a-z0-9-]{4,48}', labId, captures: CaptureInput[], reason?, proposedBy?: 'user'\|'assistant', budgetGpuMin?, approve? }` | **201** `JobView`; emits `job.updated`. If `approve === true` and `proposedBy` is not `'assistant'`, the job is approved and enqueued in the same request (lines 160, 171-172)                               | 400, 409 `spec_hash_mismatch`, 409 `conflict` (id exists)                |
| `POST /jobs/:id/approve`                | 183-190 | —                                                                                                        | `JobView` (status `approved`, enqueued)                                                                                                                                                                     | 404, 409 if not `proposed`                                               |
| `POST /jobs/:id/cancel`                 | 191-202 | —                                                                                                        | `JobView`; `proposed`/`approved` → `cancelled` immediately; a running job gets `SIGTERM` (`server/runner.ts:131-134`) and is marked by the runner                                                          | 404, 409 if `done`/`failed`/`cancelled`                                  |
| `GET /annotations?lab=`                 | 205     | —                                                                                                        | `[{ id, lab_id, target, kind, body, author, created_at }]`                                                                                                                                                  | —                                                                        |
| `POST /annotations`                     | 206-211 | `{ labId, target, kind, body?, author?: 'assistant'\|'user' }`                                           | **201** `{ id }`                                                                                                                                                                                            | 400                                                                      |
| `GET /evidence`                         | 214     | —                                                                                                        | `ArchiveSummary[]` = `{ sha256, name, bytes, files:[{path,bytes}], addedAt, datasets:[id] }` (`server/evidence.ts:20-27`)                                                                                  | —                                                                        |
| `GET /evidence/:sha`                    | 215-218 | —                                                                                                        | `ArchiveSummary`                                                                                                                                                                                            | 404                                                                      |
| `POST /evidence?name=`                  | 219-231 | raw `.tar.gz` bytes (any content type; the CLI sends `application/gzip`)                                 | **201** new archive, **200** already registered; emits `evidence.registered`                                                                                                                               | 413 `too_large` (declared `content-length` > 64 MiB), 400 `bad_archive` |
| `GET /datasets`                         | 233     | —                                                                                                        | `DatasetSummary[]` with `present` = images whose bytes are in the media store (`server/datasets.ts:144-158`)                                                                                                | —                                                                        |
| `GET /datasets/:id`                     | 234-237 | —                                                                                                        | `DatasetDetail` = summary + `provenance`, `images[]`, `annotations[]` (`server/datasets.ts:162-181`)                                                                                                        | 404                                                                      |
| `POST /datasets/:id/materialize`        | 240-254 | —                                                                                                        | **202** `{ started: true, missing }`; progress over `/events`                                                                                                                                               | 404, 409 `busy`                                                          |
| `GET /media/:sha`                       | 255-263 | —                                                                                                        | image bytes; `content-type` from the row, `cache-control: public, max-age=31536000, immutable`, `x-content-type-options: nosniff`                                                                        | 400 (not a SHA-256), 403 (not public), 404                               |
| `GET /events`                           | 266-282 | —                                                                                                        | `text/event-stream` (§2.3)                                                                                                                                                                                  | —                                                                        |

**Shared request type.** `CaptureInput = { hash, ref:'experiment/arm/mode', host, reps: 1..64, spec: object }`
(`server/store.ts:8-15`). `validateCaptures` (`server/app.ts:50-64`) requires a non-empty array, checks the `ref`
pattern `^[^/]+/[^/]+/[^/#]+$`, recomputes `hash(stableStringify(spec))` and refuses a mismatch with 409
`spec_hash_mismatch`, and bounds `reps` to 1..64. It does not validate anything inside `spec`.

**`JobView`** (`server/store.ts:150-182, 238-246`): the `jobs` row (`id, lab_id, status, proposed_by, reason, hosts,
budget_gpu_min, progress, created_at, approved_at, finished_at, error`) plus `captures[]` (job_captures without
`spec_json`) and `events[]` (`{ id, at, kind, detail }`).

**`Bundle`** (`server/importer.ts:14-19`): `{ run, entities, links }`, the same shape the browser's synthetic
generator produces, so queries and views have one code path. Every entity has `{ kind, id, ref, run, arm, rep, … }`
with `ref = "<exp>/<arm>/<mode>#<rep>!<kind>:<id>"` (`server/importer.ts:68-72`). Links are `{ from, to, rel, evidence:
'direct'|'derived', method }`. Measured scalars are value records, e.g. `{"__value":true,"value":480.14,
"prov":"observed","unit":"ms","scope":"…","source":"sampler-local/baseline/cpu#0/cpu.json","method":"getrusage(RUSAGE_SELF)"}`
(observed in the DB), built by `val()`/`missing()` from `src/lang/values.ts`. Bundles are stored gzip-compressed JSON
(`server/bundles.ts:4-5`).

### 2.2 Assistant routes (`server/assistant/service.ts`, mounted at `server/app.ts:284`)

| Method and path                          | Lines   | Request                                                                                                    | Response                                                                                                                                                            | Other statuses                     |
| ---------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `GET /assistant/models`                  | 249-252 | —                                                                                                          | `{ available, model, reason?, default, models: ModelInfo[] }`; `ModelInfo = { spec, provider, id, name, reasoning, thinking[], contextWindow }` (`model.ts:23-32`) | —                                  |
| `GET /assistant/conversations?lab=`      | 255-259 | —                                                                                                          | active conversations of a lab: `[{ id, boardId, messages[] }]`, each message with its `usage` row                                                                 | —                                  |
| `GET /assistant/library?lab=&q=&limit=`  | 262-279 | `q` substring of message content or code (LIKE with escaped `%_\`), `limit` 1..200 (default 100)          | summaries `{ id, labId, boardId, title, createdAt, updatedAt, archivedAt, messages, prompts, liveReplies, tokens:{calls,input,output,reasoning,estPrompt}, models }` | —                                  |
| `GET /assistant/library/:id`             | 281-285 | —                                                                                                          | summary + `transcript[]`                                                                                                                                            | 404                                |
| `POST /assistant/archive`                | 288-297 | `{ labId, boardId? }`                                                                                      | `{ archived: n }`                                                                                                                                                   | 400                                |
| `POST /assistant/library/:id/restore`    | 300-309 | —                                                                                                          | summary; archives the board's current active conversation in the same transaction                                                                                  | 404, 409 `busy`                    |
| `DELETE /assistant/library/:id`          | 312-319 | —                                                                                                          | `{ deleted, messages, calls }`; messages and `llm_calls` cascade                                                                                                    | 404, 409 `busy`                    |
| `POST /assistant/turns`                  | 321-353 | `{ labId, boardId, mode:'scripted'\|'live', prompt (1..4000 chars), context: object, model?, scripted?:{text,code} }` | scripted: JSON `{ conversationId, userId, assistantId }`; live: SSE stream (below)                                                                     | 400, 503 `unavailable`, 409 `busy` |
| `POST /assistant/messages/:id/result`    | 355-375 | `{ status:'ok'\|other, value?, error?, logs?, ms?, continue?, context?, model? }`                          | stores the result and an `observation` message; `{ ok: true }`, or an SSE continuation if `continue === true` on a live message                                   | 404, 503, 409                      |

**Assistant SSE events** (one stream per POST, `service.ts:200-246`): `stored` `{conversationId, userId}`, `delta`
`{text}` (streamed tokens), `reply` `{id, text, code, run, step, model, usage:{input,output,reasoning,total,estPrompt}|null,
ms}`, `error` `{message}`, and always a final `end` `{}`.

### 2.3 The global event stream (`server/events.ts`, `server/app.ts:266-282`)

`EventBus` is an in-process fan-out (`server/events.ts:9-21`); events are notifications only, and clients re-read state
over HTTP. `/events` sends `hello` `{at}` on connect and `ping` `{}` every 15 s.

| Event                  | Emitted at                                                                                            | Payload                                                                         |
| ---------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `job.updated`          | `app.ts:173, 188, 200`; `runner.ts:156-158` after every state change                                  | full `JobView`                                                                  |
| `job.event`            | `runner.ts:151-154` for every job event the runner records                                            | `{ jobId, id, at, kind, detail }`                                               |
| `artifact.imported`    | `runner.ts:207, 258, 354`                                                                             | `{ hash, ref, origin, source? }`                                                |
| `catalog.changed`      | `app.ts:131`; `runner.ts:209, 260, 356`                                                               | `{ labId }`                                                                     |
| `evidence.registered`  | `app.ts:226`                                                                                          | `{ sha256, name, datasets }`                                                    |
| `dataset.progress`     | `app.ts:248`                                                                                          | `{ id, present, total, imageId }`                                               |
| `dataset.materialized` | `app.ts:250-251`                                                                                      | `MaterializeResult` `{ datasetId, total, present, fetched, failed[] }`          |

**Job event kinds** stored in `job_events.kind` (observed counts in the DB): `job.proposed` 12, `job.approved` 12,
`job.started` 11, `run.started` 112, `script.start` 70, `script.warmup` 280, `script.request` 1,670, `script.done` 72,
`script.image` 32, `script.materialized` 2, `script.loaded` 2, `run.imported` 100, `run.done` 20 (synthetic host),
`artifact.imported` 78, `job.done` 11, `job.cancelled` 1. `script.*` events are the workload's stdout JSON lines
(`runner.ts:67-76`, `dino.ts:90-98`). `job.failed` exists in code (`runner.ts:365`, `store.ts:258`) but has no rows.

## 3. SQLite schema

### 3.1 Migration mechanism

`MIGRATIONS` is an ordered array of SQL strings (`server/db.ts:11-320`); version = index + 1. `migrate()` creates
`schema_migrations(version, applied_at)`, skips applied versions and runs each pending one in its own `begin …
commit` (`db.ts:330-357`). The rule is append-only ("Never edit an applied migration", `db.ts:7-9`). Table rebuilds use
the copy-and-rename pattern because SQLite cannot alter keys. The real DB has all five applied (observed):

| Version | Applied (UTC)            | Lines   | Change                                                                                                                                                                                                                         |
| ------- | ------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | 2026-10-12T21:51:09Z     | 12-150  | `programs`, `artifacts`, `runs`, `run_bundles`, `jobs`, `job_captures`, `job_events`, `annotations`, `conversations`, `messages`, `llm_calls`                                                                                  |
| 2       | 2026-10-12T22:01:35Z     | 152-155 | `llm_calls.prompt_chars`, `est_prompt_tokens` (the gateway's input count excludes system-role content)                                                                                                                        |
| 3       | 2026-10-12T22:13:50Z     | 160-195 | `runs` and `run_bundles` re-keyed from `ref` to `(hash, rep)`; measured artifacts with fewer runs than `reps` marked `failed` (the queries=1024 runs had overwritten the queries=2048 rows)                                   |
| 4       | 2026-10-12T22:57:10Z     | 199-256 | `conversations.archived_at`; the unique `(lab_id, board_id)` becomes partial index `conversations_active … where archived_at is null`; children dropped before parents because `foreign_keys = on` would cascade |
| 5       | 2026-10-12T23:50:57Z     | 259-319 | `artifacts.source`; `evidence_archives`, `datasets`, `dataset_images`, `dataset_annotations`, `media`                                                                                                                          |

### 3.2 Tables as they stand after migration 5

| Table                 | Key                                         | Columns (beyond the key)                                                                                                                                                                                       | Notes                                                                                                                       |
| --------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `programs`            | `lab_id`                                    | `source`, `preset_hash`, `updated_at`                                                                                                                                                                          | edited lab.js sources; 0 rows                                                                                               |
| `artifacts`           | `hash` (capture hash)                       | `lab_id, experiment, arm, mode, host, reps, spec_json, origin ∈ {synthetic, measured}, status ∈ {running, available, failed}, created_at, imported_at, source`                                                | index `artifacts_lab(lab_id)`; `source` is null for executed captures and `evidence:<sha256>` for imported ones              |
| `runs`                | `(hash, rep)`                               | `ref, experiment, arm, mode, host, started_at, duration_s, run_json`; FK `hash → artifacts on delete cascade`                                                                                                 | index `runs_ref(ref)`                                                                                                       |
| `run_bundles`         | `(hash, rep)`                               | `entities BLOB, links BLOB` (gzip JSON), `n_entities, n_links`; FK `(hash,rep) → runs on delete cascade`                                                                                                      |                                                                                                                             |
| `jobs`                | `id`                                        | `lab_id, status ∈ {proposed, approved, running, importing, done, failed, cancelled}, proposed_by ∈ {user, assistant}, reason, hosts (comma-joined text), budget_gpu_min, progress, created_at, approved_at, finished_at, error` |                                                                                                                             |
| `job_captures`        | `(job_id, hash)`                            | `ref, experiment, arm, mode, host, reps, spec_json, status (unconstrained: pending/running/imported/failed/cancelled), error`; FK `job_id → jobs cascade`                                                       |                                                                                                                             |
| `job_events`          | `id` autoincrement                          | `job_id, at, kind, detail`                                                                                                                                                                                     | index `job_events_job(job_id, id)`                                                                                          |
| `annotations`         | `id` autoincrement                          | `lab_id, target, kind, body_json, author, created_at`                                                                                                                                                          | index `annotations_lab`; 0 rows                                                                                             |
| `conversations`       | `id`                                        | `lab_id, board_id, created_at, updated_at, archived_at`                                                                                                                                                        | partial unique `conversations_active`, index `conversations_lab(lab_id, updated_at)`                                        |
| `messages`            | `id`; unique `(conversation_id, seq)`       | `role ∈ {user, assistant, observation}, mode ∈ {scripted, live}, content, code, result_json, status, created_at`; FK cascade                                                                                   |                                                                                                                             |
| `llm_calls`           | `id` autoincrement                          | `conversation_id` (cascade), `message_id` (set null), `provider, model, thinking, input_tokens, output_tokens, reasoning_tokens, cache_read_tokens, cache_write_tokens, total_tokens, duration_ms, stop_reason, error, created_at, prompt_chars, est_prompt_tokens` | indexes on `conversation_id`, `message_id`                                                                                 |
| `evidence_archives`   | `sha256`                                    | `name, bytes, files_json, added_at`                                                                                                                                                                            |                                                                                                                             |
| `datasets`            | `id` (= SHA-256 of the manifest file)       | `name, format ∈ {coco}, privacy ∈ {public}, source, provenance_json, categories_json, image_count, annotation_count, added_at`                                                                                 | the CHECK makes non-public datasets unrepresentable                                                                         |
| `dataset_images`      | `(dataset_id, image_id)`                    | `file_name, sha256, width, height, license_name, license_url, source_url, page_url, strata_json`                                                                                                               | index `dataset_images_sha(sha256)`                                                                                          |
| `dataset_annotations` | `(dataset_id, id)`                          | `image_id, category, bbox_json (COCO pixel xywh), area, iscrowd`                                                                                                                                               | index `(dataset_id, image_id)`                                                                                              |
| `media`               | `sha256`                                    | `bytes, mime, privacy ∈ {public}, source_url, added_at`                                                                                                                                                        | bytes on disk at `.data/media/<sha256>.jpg\|png`                                                                            |

JSON columns (`spec_json`, `run_json`, `files_json`, `provenance_json`, …) are opaque TEXT; nothing queries inside them
except ad-hoc analysis.

### 3.3 What is content-addressed, and by what

| Identity                         | Function and input                                                                                                                       | Where                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Capture hash** (`artifacts.hash`, `runs.hash`, job captures, `/catalog` keys) | **cyrb53** (a 53-bit non-cryptographic string hash, 13–14 hex digits) of `stableStringify(spec)`: JSON with sorted keys, `undefined` → `null`, functions rendered as `ƒ:<hash of source>`, keys starting `__fn` dropped | `src/lang/util.ts:1-34`; computed by the browser (`src/lang/build.ts:558`) and **recomputed by the server** (`server/app.ts:57-58`) |
| Run identity                     | `(capture hash, repetition)` since migration 3                                                                                           | `server/db.ts:161-195`                                                                            |
| **Evidence archive**             | **SHA-256 of the raw `.tar.gz` bytes**                                                                                                   | `server/evidence.ts:62`; `sha256()` from `server/datasets.ts:14`                                  |
| **Dataset**                      | **SHA-256 of the COCO manifest file bytes** (`qualification/coco/instances_selected.json`), cross-checked with `provenance.selected_manifest_sha256` | `server/datasets.ts:83-87`                                                        |
| **Media (images)**               | **SHA-256 of the image bytes**, recorded in the dataset's provenance and verified after every fetch                                     | `server/datasets.ts:91, 250-251`; re-verified in Python before use (`workloads/perf_lab_dino/run.py:162-168`) |
| Workload source revision (`local`) | SHA-256 over sorted `perf_lab_local/*.py` file names and bytes, first 12 hex digits; reported by the probe as `tools.workloads` and used as both arms' `rev` in the `local-sampler` preset, so editing a script changes every capture hash | `workloads/perf_lab_local/probe.py:23-29`; `src/presets/programs/local-sampler.lab.js:18-19` |
| `manifest.workload_sha256`       | SHA-256 over sorted `*.py` bytes (no names) — a second, different hash of the same sources                                               | `workloads/perf_lab_local/run.py:39-43`                                                           |
| `manifest.spec_sha256`           | SHA-256 of Python's `json.dumps(spec, sort_keys=True)`; recorded, never checked against anything                                         | `workloads/perf_lab_local/run.py:89`                                                              |
| `quality_gate_sha256`, `fixture_manifest_sha256` (spec fields) | **cyrb53**, despite the name (e.g. `1231e65b50d080`) — except a dino workload's `fixture_manifest_sha256`, which is the real dataset SHA-256 | `src/lang/build.ts:554, 601, 617`                                                     |
| Dino provenance                  | per-file SHA-256 of every source file written from `git show`, of every model snapshot file, of the frozen baseline source               | `workloads/perf_lab_dino/run.py:59-83, 230, 242-252`                                              |

### 3.4 Token accounting

- Every model call writes one `llm_calls` row (`service.ts:104-129`) with the provider's usage
  (`input/output/reasoning/cacheRead/cacheWrite/totalTokens`), duration, stop reason, error, `prompt_chars` and
  `est_prompt_tokens = ceil(prompt_chars / 4)` (`service.ts:126-127`). `prompt_chars` = system prompt length + the
  length of each message's content (JSON-stringified when not a string) (`model.ts:128-130`).
- The estimate exists because the lunaroute gateway's reported `input` excludes system-role content (migration 2
  comment, `db.ts:151`; diary step 5). The DB shows it: calls 2–7 report 4–98 input tokens for 5,290–13,689 characters
  sent (observed `llm_calls` ids 2–7).
- Per-message usage is joined into transcripts (`service.ts:142-147`); per-conversation totals in summaries
  (`service.ts:158-163`). There is no cost column use: pi's `Usage.cost` is not stored.
- Totals in the DB (observed): 30 calls; `lunaroute/deepseek-4.1-flash:high` 28 calls, 73,354 reported input, 16,155
  output, 4,524 reasoning, 140,814 estimated prompt tokens, mean 4.2 s; `lunaroute/glm-5.3-flash:low` 2 calls; no
  errors.

## 4. Runner and workloads

### 4.1 Executors and the queue (`server/runner.ts`)

- `Executor { kind: 'process' | 'synthetic'; run(capture, rep, ctx) → { exitCode, stderrTail, dir } }`
  (`runner.ts:31-35`).
- `processExecutor(config)` (`runner.ts:46-89`) for `local`: writes the capture's `spec_json` to
  `.data/artifacts/<hash>/spec.json`, wipes and creates `.data/artifacts/<hash>/rep-<n>/`, then spawns

  ```text
  uv run --project <root>/workloads python -m perf_lab_local.run --spec <artifacts>/<hash>/spec.json --rep <n> --out <artifacts>/<hash>/rep-<n>
  ```

  with `cwd = workloads`, `stdio ['ignore','pipe','pipe']`, `PYTHONUNBUFFERED=1`, `PERF_LAB_INDUCTOR_CACHE=<dataDir>/inductor-cache`.
  stdout lines that start with `{` are parsed and logged as job events `script.<event>` with detail
  `"<ref>#<rep> <json of the other fields>"`; other lines (e.g. profiler diagnostics) are ignored. stderr is kept as a
  rolling 8,000-character tail and written to `rep-<n>/stderr.log` on close. A spawn error resolves with exit code −1.
- `syntheticExecutor` (`runner.ts:92-98`): sleeps 150 ms, returns exit 0, writes nothing. Every host without an entry in
  the executor map (`playback@dgx`, `playback@rtx-dev`) uses it (`runner.ts:118-124`).
- **Queue.** One `Runner` per server; a FIFO of job ids; `pump()` runs one job at a time and, inside it, one process at
  a time ("concurrent benchmark processes would measure each other", `runner.ts:100-103, 126-149`). There is no per-host
  parallelism and no persistence of the queue: a restart fails approved and running jobs (`store.ts:254-261`).

### 4.2 From job to N processes: grouping and seeded paired order

A job holds captures; a capture is one `(experiment, arm, mode, host)` with `reps` repetitions. The runner groups the
arms of one experiment, mode and host together so that their repetitions interleave (`runner.ts:276-281`), then picks a
path per group: evidence import, the paired dino process, or the generic executor.

```text
runJob(jobId):                                              # runner.ts:264-371
  job ← jobs[jobId]; if job.status ≠ 'approved': return     # cancelled before it ran
  job.status ← running; event job.started "on <hosts>"
  captures ← job_captures in insertion order; total ← Σ c.reps
  groups ← group captures by "<experiment>/<mode>@<host>" (insertion order)
  for group in groups:
    spec0 ← group[0].spec
    if spec0.evidence:            done += importEvidence(group); continue      # §5.3, synchronous
    if spec0.workload.adapter = 'dino' and host has a process executor:
                                  done += await runDino(group); continue       # §4.5
    ex ← executor(host) ; origin ← ex.kind = process ? 'measured' : 'synthetic'
    for c in group:
      c.status ← running
      if process: delete runs where hash = c.hash                              # a re-run never mixes repetitions
      upsert artifact(c, origin, status 'running')                             # hidden from /catalog until 'available'
    seed ← spec0.comparison.paired_order_seed ?? 0
    for rep in 0 … max(c.reps) − 1:
      order ← copy(group); r ← rng("<seed>:<rep>")                             # mulberry32 seeded by cyrb53 of the text
      for i from len−1 down to 1: j ← floor(r.next()·(i+1)); swap(order[i], order[j])   # Fisher–Yates
      for c in order:
        if rep ≥ c.reps: continue
        if cancelled(jobId): throw Cancelled
        event run.started "<ref>#<rep> on <host>"
        out ← await ex.run(c, rep)
        if cancelled(jobId): throw Cancelled
        if ex is process:
          job.status ← importing
          bundle ← importRepetition(out.dir, spec, hash, ref, rep, host, out.exitCode, out.stderrTail)
          insert run + bundle                                                  # stored even when invalid
          event run.imported "<ref>#<rep>: <n> entities[ · invalid: reasons]"
          if out.exitCode ≠ 0: throw "<ref>#<rep> exited with <code>: <last 3 stderr lines>"
          job.status ← running
        else: event run.done "(synthetic host: no process runs)"
        progress ← ++done / total
    for c in group: upsert artifact(c, origin, 'available'); c.status ← imported; emit artifact.imported
    emit catalog.changed
  job ← done, progress 1
on error e:
  every artifact still 'running' → 'failed'; captures still 'running' → failed (with e.message) | cancelled
  job ← failed (error e.message) | cancelled
finally: forget current child; drop jobId from the cancelled set; emit job.updated
```

Consequences worth stating in the guide:

- With two arms the shuffle is a coin flip per repetition: each process pair runs in a seeded, reproducible random
  order, so drift over time does not consistently favour one arm. The observed order in the `local-sampler` server
  smoke test was `candidate#0, baseline#0, baseline#1, candidate#1` (diary).
- Groups run one after another (all timing processes, then trace, memory, cpu); pairing is within a group only.
- The `local-sampler` plan has 8 captures (2 arms × {timing ×4 reps, trace ×1, memory ×1, cpu ×1}) = **14 processes**
  (`src/presets/programs/local-sampler.lab.js:24-29`); reps come from `repeat.processes` for timing and from the
  capture's own `processes(...)` for trace (`src/lang/build.ts:525-527`).

### 4.3 Timeouts, budget and exit status

- **Timeouts.** None on workload processes: neither `spawn` in `runner.ts:57-61` nor in `dino.ts:84` passes a timeout,
  and the runner awaits `close` indefinitely. Existing timeouts are the probe (180 s, `probe.ts:28`), per-image dataset
  fetches (30 s, `datasets.ts:246`) and, in the browser, assistant code execution (10 min,
  `src/features/agent/runtime.ts:27`).
- **The "30 GPU-minute" budget is enforced only in the browser.** The assistant's policy sets `budgetGpuMin: 30`
  (`src/features/agent/builtins.ts:8`) and `lab.start()` refuses plans whose summed `estimateGpuMin` exceeds it
  (`src/features/agent/runtime.ts:349-350`). The estimate is a plan-time model, `reps × requests × adapter.perRequestMs ×
  factor / 60000` with `factor = {timing 1, trace 1.4, memory 1.8, kernels 25, cpu 1.2, sanitizer 30}`, and 0 for
  evidence imports (`src/lang/build.ts:566-571, 589`). The server stores `budget_gpu_min` (`app.ts:169`,
  `store.ts:193-199`) and never reads it again; observed values are 3.8 (sampler jobs), 0.3 (dino-local) and 0 (imports).
- **Exit status.**
  - Generic process path: the importer records a non-zero exit as an *invalid* run (§5.5), the run is stored, then the
    job fails and the remaining repetitions are not run (`runner.ts:323-340`). A process killed by a signal reports
    `code === null`, which also counts as non-zero.
  - Dino path: a non-zero exit throws **before** import, so no run is stored (`dino.ts:109`).
  - Synthetic path: always 0.
- **Cancellation.** `POST /jobs/:id/cancel` adds the id to `cancelled` and sends `SIGTERM` to the current child
  (`runner.ts:131-134`). The child is `uv`, not Python; whether `uv run` forwards the signal to Python was not verified
  (inferred risk). The flag is checked between repetitions, so a running repetition finishes or dies before the job
  stops.

### 4.4 The JSON specification handed to Python

The browser lowers each capture to a specification (`src/lang/build.ts:531-557`) and the server writes it verbatim to
`spec.json`. A real one from the DB (`sampler-local/baseline/timing`, hash `24318dbc66390`):

```json
{
  "schema_version": 1, "experiment_id": "sampler-local", "arm": "baseline", "host": "local",
  "workload": { "adapter": "sampler", "boundary": "sampler_output", "channels": 32, "device": "cpu", "dtype": "float32",
                "fixture_manifest_sha256": "1fddcd7c1dea78", "heads": 8, "points": 16, "queries": 2048, "spatial": 64 },
  "comparison": { "arm_revision": "1fc6b670a8a6", "baseline_revision": "1fc6b670a8a6", "candidate_revision": "1fc6b670a8a6",
                  "corunner": null, "paired_order_seed": 20261012, "switches": { "impl": "unfused" } },
  "state": { "compilerCache": "reused", "process": "fresh" },
  "warmup": { "requests": 4, "until": null },
  "expect": { "arm": "candidate", "expect": { "compile": "active" }, "onMiss": "invalid" },
  "phases": [], "offer": null, "admission": null, "deadline": null,
  "repeat": { "processes": 4 },
  "collection": { "mode": "timing" },
  "quality_gate_sha256": "1231e65b50d080"
}
```

An `evidence` block (`{ archive_sha256, format, reports }`) is added only when declared, so captures without evidence
keep their hashes (`src/lang/build.ts:556-557`). A dino workload is lowered with `dataset_sha256`, `image_selection`
and the resolved `image_ids` (`src/lang/build.ts:597-625`).

### 4.5 Python: `perf_lab_local` (sampler)

**What it computes** (`workloads/perf_lab_local/sampler.py:1-12`): deformable-attention sampling. For Q queries and H
heads, P fractional locations are sampled bilinearly from a C-channel `spatial²` value map and reduced with softmax
attention weights. Shape defaults: H 8, C 32, Q 2048, P 16, spatial 64 (`sampler.py:39-46`). Inputs are generated on
CPU from a seed and moved to the device (`sampler.py:49-55`). Three implementations of the same function:

- `unfused`: `F.grid_sample` into a `[B·H, C, Q, P]` intermediate, then `(sampled · w).sum(-1)`, with
  `record_function("sample")` and `("reduce")` ranges (`sampler.py:58-65`).
- `gather`: per point, four-corner `torch.gather` and accumulate, never materializing the intermediate
  (`sampler.py:68-97`).
- `compiled`: `torch.compile(plain)` where `plain` is `unfused` without profiler ranges (`sampler.py:100-103`,
  `run.py:117-128`). An Inductor exception falls back to `plain` and records `executed: 'unfused', compile: 'inactive',
  reason` (`run.py:125-128`).

**CLI** (`run.py:47-51`): `python -m perf_lab_local.run --spec spec.json --rep N --out DIR`.

**What it reads from the spec** (`run.py:56-86`): `workload.{device, dtype, threads, seed, heads, channels, queries,
points, spatial, boundary, requests}`, `comparison.switches.impl` (default `unfused`), `collection.{mode, requests}`,
`state.compilerCache` (`fresh` → a private Inductor cache under `--out`; otherwise `PERF_LAB_INDUCTOR_CACHE`,
`run.py:63-67`), `warmup.{requests (default 4), until}`. Default request counts per mode: timing 32, cpu 32, trace 6,
memory 3 (`run.py:83`). The fixture seed defaults to `20261012`; a pool of up to 8 input sets is cycled
(`run.py:138`).

**Sequence of one repetition:**

1. `manifest.json` (`run.py:88-111`): spec SHA-256, experiment, arm, mode, rep, impl, device, dtype, threads, shape,
   intermediate numel, Python/torch/numpy versions, platform, `git rev-parse HEAD` of the workloads directory,
   `workload_sha256`, boundary, pid, start time, Inductor cache path. Emits `{"event":"start",…}`.
2. **Warmup** until `warmup.requests` calls are done and, if `warmup.until` is set, the activation predicate holds,
   bounded at 16 extra calls (`run.py:141-154`). The first compiled call's wall time is `compileMs`
   (`run.py:150-156`). `activation.json` records `impl`, `executed`, `intermediate`, `compile`, `compileMs`,
   `warmupRequests`, `untilSatisfied` (`run.py:115, 155-159`).
3. **Quality gate** on separate inputs (seed − 1): max absolute difference against eager `unfused`, tolerance `1e-5`
   (fp32) or `1e-2` (fp16/bf16); `quality.json` `{reference, maxAbsDiff, tolerance, pass}` (`run.py:161-168`). The gate
   is hard-coded here; the program's declared gate only contributes its hash (`quality_gate_sha256`).
4. **Measured window** (`run.py:171-209`):
   - `timing` / `cpu`: per request `start_ns`, `end_ns` (`time.perf_counter_ns`, relative to the window start) and
     `cpu_ns` (`time.thread_time_ns`, calling thread only) → `timing.json`; `cpu` also writes `cpu.json` with the
     `getrusage(RUSAGE_SELF)` deltas of `ru_utime, ru_stime, ru_nvcsw, ru_nivcsw, ru_minflt, ru_majflt, ru_inblock,
     ru_oublock`, `maxrss_bytes` (bytes on macOS, KiB×1024 on Linux) and the window length. On `mps`, each request
     ends with `torch.mps.synchronize()` (`run.py:86`).
   - `trace` / `memory`: `torch.profiler.profile(activities=[CPU], record_shapes=True, profile_memory=(mode=='memory'))`
     with a `request#<i>` range per request and a `sync` range → `trace.json` (Chrome trace). `memory` also writes
     `memory.json`: a tensor ledger (the three request inputs plus what the implementation appended on request 0, e.g.
     `sampled_intermediate`) and the allocator name.
   - Any other mode: `{"event":"error"}` and exit 3; an unknown impl exits 2.
5. `{"event":"done","window_ms":…}`, exit 0.

Progress lines are `{"event": "warmup"|"request"|"start"|"done"|"error", …}` (`run.py:24-25`). Observed artifact
directory: `.data/artifacts/<hash>/spec.json` and `rep-<n>/{manifest,activation,quality,timing|trace|memory|cpu}.json` +
`stderr.log`.

**Probe** (`workloads/perf_lab_local/probe.py:32-72`), run once at startup: CPU brand and performance/efficiency core
counts from `sysctl` (macOS), memory size, MPS availability, Python/torch/numpy versions, `ncu`/`nsys` "unavailable",
the workloads revision hash, thread count, and `counters.unsupported: ['*']` ("macOS exposes no hardware performance
counters without elevated privileges"). The server takes the last stdout line starting with `{` (`server/probe.ts:31-33`).

### 4.6 Python: `perf_lab_dino` (Grounding DINO at two Playback revisions)

The server path (`server/dino.ts:60-114`, called from `runner.ts:217-262`) requires a group of exactly two captures
whose variants (`comparison.switches.variant`, else the arm name, `qualification.ts:113`) are `baseline` and
`candidate`, and mode `timing` or `predictions`. For each repetition it writes `baseline.spec.json`,
`candidate.spec.json` and `images.json` (`{imageId, fileName, sha256, path}` of every selected, already-materialized
dataset image, `dino.ts:41-57`) into `.data/artifacts/<base16>-<cand16>/rep-<n>/` and spawns

```text
uv run --project workloads python -m perf_lab_dino.run --specs baseline.spec.json candidate.spec.json \
    --mode timing|predictions --rep N --images images.json --repo <Playback checkout> --out <dir>
```

What the script does (`workloads/perf_lab_dino/run.py:104-257`):

1. Checks the two variants and that both arms declare an identical `workload` (`run.py:114-121`); `chdir` to the
   output directory so `pydantic-settings` finds no `.env` (`run.py:124-125`).
2. **Materializes source at each arm's `comparison.arm_revision`** with `git -C <repo> show <rev>:<path>` for nine
   files of `services/detection/src/detection/` (config, backends, replay, fusion, postprocess, …) plus, for the
   candidate, `services/detection/benchmarks/{__init__,grounding_dino}.py`; writes an empty package `__init__.py`; records
   a SHA-256 per file (`run.py:31-41, 54-83, 129-133`). Emits `materialized`.
3. Imports the candidate's backend and the PR's benchmark module from the candidate tree (`sys.path.insert`,
   `run.py:135-143`); builds `GroundingDinoDetector(model_path=<pinned snapshot>, input_size, box/text thresholds,
   use_fp16)`; the model is `IDEA-Research/grounding-dino-tiny@a2bb814dd30d…`, loaded offline only (`run.py:42-43,
   86-92, 147-157`). The baseline detector is the benchmark's `load_baseline_detector(baseline_src, backend, detector)`,
   sharing processor and weights (`run.py:158-159`). Emits `loaded`.
4. Verifies every image's bytes against its SHA-256 (`run.py:162-168`).
5. `timing`: per image, `warmup` calls per variant (default 1), then `pairs` iterations (default 2) in which the order
   of the two variants is shuffled by `random.Random(paired_order_seed + rep)` (default seed 20261009); each call is
   timed with `time.perf_counter` and its output digest recorded with the benchmark's `output_digest`
   (`run.py:170-209`). `predictions`: one call per variant per image, full detections (`run.py:181-182`). Emits `image`
   per image.
6. Writes `reports/paired.json` (header + `results`) or `reports/example-predictions.json`, `artifact-provenance.json`
   (versions, model snapshot, per-model-file SHA-256, source hashes) and `run-configuration.json` (`run.py:212-255`).
   The header's `gpu`, CUDA peaks and cgroup peak are `null`, and there is no `torch.cuda.synchronize()` around timed
   calls — correct on the Mac's CPU, wrong on a GPU (ML-PERF-003 §6.13 lists the four changes).
7. The server imports **both arms from the one report** with the qualification importer (`dino.ts:110-113`), source
   `local`, `reportsDir: 'reports/'`.

## 5. Importers, evidence archives and validity

### 5.1 Local repetitions: `importRepetition` (`server/importer.ts:63-286`)

Input: the repetition directory, spec, hash, ref, rep, host, exit code, stderr tail. Output: one `Bundle`.

| Native file            | Modes            | Entities and links produced                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Lines   |
| ---------------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `timing.json`          | timing, cpu      | one `request` per call: `start/end` (ns), `latency = timeInSystem` (ms), `cpuTime` (ms), `batch`, `layout "Q<q>/<dtype>/<device>"`, `warm: true`, `runValid`, `invalidReason`                                                                                                                                                                                                                                                                                                                            | 107-119 |
| `cpu.json`             | cpu              | `instant` `rusage`: `userTime`, `systemTime`, voluntary/involuntary context switches, minor/major faults (value records, method `getrusage(RUSAGE_SELF)`), `maxRss` (scope "process lifetime"), `window`                                                                                                                                                                                                                                                                                                 | 120-135 |
| `trace.json` (`torch.profiler` Chrome trace) | trace, memory | `request` per `request#<i>` user annotation; `span` per other `record_function` range (lane `cpu:main` for the request thread, `cpu:thread <tid>` otherwise), linked `request -contains-> span`; `kernel` per **outermost** `cpu_op` event (an op contained in a longer op on the same thread is dropped), with `role` from `roleOf()` (`grid_sampler\|gather` → `encoder.sampling`; `aten::mul\|sum\|add` → `encoder.reduce`; `Compiled Region\|CompiledFxGraph` → `compiled.region`; index/cast ops → `elementwise`; else `other`), `shapes` from `Input Dims`, linked `span -launches-> kernel` (or `request -contains-> kernel`); `coverage.source.missing` lists every op ("ATen CPU kernel; source mapping not collected"); on `mps`, `coverage.links.missing` notes Metal kernels are invisible | 138-194 |
| `[memory]` trace events | memory          | `alloc` per positive-bytes event: size, attributed to the smallest enclosing op and range and to the request, `address`, `totalAfter`; a negative event with the same address closes it (`end`, `lifetime`); open blocks stay "live at end of trace"; `instant` `allocator-peak` = max `Total Allocated`                                                                                                                                                                                                 | 196-240 |
| `memory.json`          | memory           | `tensor` per ledger entry; linked `tensor -aliases-> alloc` with evidence **`derived`** when an alloc of equal bytes in the same range during request 0 exists ("size, range and request match")                                                                                                                                                                                                                                                                                                          | 225-236 |

The run entity (`importer.ts:243-284`) carries `manifest` (workload, boundary, fixtures, precision, input size, host,
revision, arm, mode, state, gate, toolchain or `missing('no manifest written')`, device, threads, impl,
`workloadSha256`, `gitRevision`, `specHash`, `synthetic: false`), `validity`, `activation`, `quality`, `coverage`
(`counters.unsupported: ['*']` always), `clock` (`time.perf_counter_ns (process)` or `torch.profiler (CPU, µs)`),
`startedAt`, `durationS`, `requests`, `synthetic: false`, `measured: true`.

### 5.2 Evidence archives, the tar reader and bundles of files (`server/evidence.ts`, `server/tar.ts`)

```text
registerArchive(db, dataDir, bytes, name):                  # evidence.ts:59-93
  require 1 ≤ len ≤ 64 MiB and gzip magic 1f 8b
  sha ← SHA-256(bytes); if registered: return existing (created=false)
  entries ← readTarGz(bytes)                                # validates everything in memory first
  root ← <dataDir>/evidence/<sha>/ ; rm -rf root; mkdir
  try:
    write every regular file under root
    write the original bytes to <dataDir>/evidence/<sha>.tar.gz
    if the archive has qualification/coco/instances_selected.json and fixture-provenance.json:
        registerCocoDataset(manifest, provenance, name "<name> · COCO selection", source "evidence:<sha>")
    insert evidence_archives(sha, name, bytes, sorted [{path, bytes}], now)
  except: rm root and the .tar.gz copy; rethrow
```

`readTarGz` (`tar.ts:56-95`): gunzip with a 512 MiB output cap; per 512-byte header verify the checksum; support pax
`x` path records, GNU `L` long names and the ustar prefix; skip global pax `g` headers; accept only regular files
(`0`, NUL, `7`) and directories (`5`); refuse links, devices and FIFOs with an error rather than skipping them; at most
10,000 entries. `checkPath` (`tar.ts:48-54`) refuses empty paths, NUL, absolute and drive-letter paths and any `..`
segment. `archiveFile(db, dataDir, sha, path)` reads a file only if the archive recorded that exact path
(`evidence.ts:96-100`). `writeTar` exists for tests, including hostile fixtures (`tar.ts:97-129`).

`bundles.ts` is not about archives: it is the gzip-JSON codec for run entities and links (`server/bundles.ts:3-5`).

### 5.3 Importing evidence-backed captures (`runner.ts:165-211`)

For a group whose spec declares `evidence`: the archive must be registered (else the job fails with "…is not
registered on this server (pnpm lab evidence add <file>)") and the format must be `detection-qualification/v1`. Per
capture it calls `importQualification` with `read = archiveFile(…)`, `source = "evidence:<sha>"`, `reportsDir =
"qualification/reports/"`, the dataset named by `workload.dataset_sha256`; requires exactly `reps` bundles; deletes
old runs; inserts artifact `measured`/`running` with `source`; inserts every run; marks the artifact `available`.
This path is synchronous (no `await`), so a large import blocks the event loop.

### 5.4 PR 1005 report importer: `importQualification` (`server/qualification.ts`)

Format `detection-qualification/v1` = the JSON/text reports written by Playback PR 1005's benchmark and the DGX
reproduction, laid out as `services/detection/GPU.md` prescribes (`qualification.ts:7-12`). One importer serves the
archived DGX run and the local dino run; only `read` and the report paths differ.

**Report selection** (`reportsFor`, `qualification.ts:45-53`): an explicit `spec.evidence.reports[mode]` wins;
`memory` → one file per state, `<state>-<variant>.json` for states `cold, warm, warm-repeat`; `kernels` →
`<variant>-profiler-summary.txt`; `tests` → `compatibility.xml` for the candidate, `<variant>-compatibility.xml`
otherwise; `timing` → `paired.json, paired-repeat.json` (two repetitions); `stages` → `stage-timings.json`;
`predictions` → `example-predictions.json`. Each file becomes one repetition.

| Mode          | Report shape                                                                         | Entities                                                                                                                                                                                                                                          | Lines   |
| ------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `timing` (paired) | `results[]` with `latencies_ms[variant]`, `output_digests[variant]`              | `request` per call (image, payload SHA, pair index, seq, latency, digest, `exact` = equal to the other variant's digest at the same position, `stable`)                                                                                         | 173-191 |
| `timing` (rows)   | changing-prompt diagnostic `rows[]` per variant                                  | `request` per row; `instant` `replay-captures`; activation `replayKey`, `replay`                                                                                                                                                               | 192-215 |
| `memory`      | per state and variant: process peak RSS, CUDA allocated/reserved, cgroup peak, load s | `instant` `memory.peaks` with four pools as value records (or `missing`); `request` per timed call                                                                                                                                             | 218-234 |
| `stages`      | `rows[]` with `latencies_ms` per stage                                               | `request` per image × pair; `span` per stage laid end to end; `request -contains-> span`; activation `replay`, `fusion` (baseline: "absent (original source)")                                                                                  | 237-256 |
| `predictions` | `{ file: { baseline:[det], candidate:[det] } }`                                      | `instant` `predictions.image` per image; `detection` per detection with verdict vs the other arm (`verdicts()`), counterpart ref, box and confidence deltas, ground-truth match and IoU from the dataset annotations (`evaluateDetections`)      | 259-289 |
| `kernels`     | `torch.profiler` `key_averages().table()` text                                       | `kernel` per row (name, `kernelRole()`: Inductor prefix first — `triton_poi` pointwise, `triton_per\|red` reduction — then matmul, copy; self/avg CUDA, self CPU, calls); `instant` `profile-totals`                                            | 292-307 |
| `tests`       | JUnit XML                                                                            | `check` per test case (suite, name, seconds, outcome); activation `nativeSuite`                                                                                                                                                                | 310-316 |

A missing report file is not an error: the run is created with zero entities, valid, `coverage.complete: false` and a
note ("… is not in this archive: the qualification records it for the candidate only", `qualification.ts:167-169`).
The DGX archive's `candidate-profiler-trace.json.gz` (a Chrome trace) is in the archive but nothing reads it; kernel
evidence comes only from the summary table.

### 5.5 Validity and quality: what makes a run invalid

Local repetitions (`importer.ts:85-94, 243, 270-276`):

```text
reasons ← []
if exitCode ≠ 0: reasons += "process exited with <code>: <last non-empty stderr line>"
e ← spec.expect
if e.expect and (e.arm absent or e.arm = this arm):
  for (k, v) in e.expect:
    if activation[k] ≠ v and (e.onMiss ?? 'invalid') = 'invalid':
      reasons += "activation: <k> <activation[k] ?? 'unknown'> (expected <v>)"
validity ← { ok: reasons = [], reasons }                     # copied onto every request as runValid / invalidReason
quality.gate   ← spec.quality_gate_sha256 ? 'declared' : 'none'
quality.status ← (gate declared ∧ quality.json.pass ∧ validity.ok) ? 'qualified' : 'unqualified'
```

Qualification reports (`qualification.ts:325-333, 337, 372-377`):

```text
reasons ← []
if the report exists and e.expect and arm matches and mode ∈ {timing, memory}:   # same activation rule as above
  …
validity ← { ok: reasons = [], reasons }                     # no exit status: archived reports have none
exactAll ← (timing only) every output digest equals the other variant's; else null
quality.status ← (gate declared ∧ exactAll = true ∧ validity.ok) ? 'qualified' : 'unqualified'
```

So a run is **invalid** only for a non-zero exit (local path) or an activation miss with `onMiss: 'invalid'`. A failed
quality gate makes a run *unqualified*, never invalid. Invalid runs are kept and excluded downstream: the browser's
`pairedRatio` estimator skips every request of a run whose `runValid === false` and lists it under `excluded`
(`src/lang/stats.ts:36-46`).

### 5.6 Datasets and media (`server/datasets.ts`)

- `registerCocoDataset` (`datasets.ts:83-129`): id = SHA-256 of the manifest; refuses a provenance whose
  `selected_manifest_sha256` differs, any image without a 64-hex SHA-256 in `provenance.image_hashes`, any image whose
  `coco_url` does not map to an allowed public source, and annotations with unknown categories. Strata and negatives
  come from the provenance.
- Allowed sources (`datasets.ts:66-77`): `http(s)://images.cocodataset.org/<split>/<n>.jpg` and the S3 path-style form;
  both are fetched from `https://s3.amazonaws.com/images.cocodataset.org/…` because COCO's own host serves a certificate
  for another name.
- `materialize` (`datasets.ts:227-266`): four concurrent workers, 30 s per fetch, ≤ 16 MiB per image, SHA-256 must
  match, JPEG/PNG magic required, file written to `.data/media/<sha>.<ext>`, `media` row inserted. A mismatching image
  is reported in `failed[]` and not stored.
- `readMedia` serves only rows with privacy `public`, re-checked at the route (`datasets.ts:197-206`).

## 6. Assistant backend (`server/assistant/`)

**Provider.** `createPiCatalog()` (`model.ts:91-188`) imports `@earendil-works/pi-coding-agent` 0.87.1, creates one
`ModelRuntime` (`refreshOnCreate: false`; credentials and OAuth refresh come from the user's `~/.pi/agent/auth.json`),
and a `DefaultResourceLoader` with `noExtensions: true` plus only the files of `extensionPaths()` (the lunaroute
extension), and no skills, prompt templates, themes or context files. It creates a tool-less in-memory agent session
(`noTools: 'all'`) only so that extension-registered providers bind to the runtime; prompts never go through the
session (`model.ts:106-115`). The catalog lists `modelRuntime.getAvailable()` minus `-background` variants and
non-text models (`model.ts:117`); `handle(spec)` resolves `provider/id:thinking` to a cached handle or refuses with a
reason (no credentials, unsupported thinking level) (`model.ts:171-182`). Thinking levels come from pi's
`thinkingLevelMap` (`model.ts:81-86`). Completion is `modelRuntime.streamSimple(model, context, { reasoning, signal })`
with text deltas forwarded to the browser (`model.ts:126-153`). The design records 14 models available on this machine
(8 OpenAI Codex, 6 lunaroute; design 04 §15.5).

**The dropped system role.** pi-ai sends the system prompt to reasoning models as a `developer`-role message; the
lunaroute gateway drops that role. This was found by the first live turn (48 input tokens, answer "I don't have access
to the board or the handle API") and confirmed by a manual secret-word probe recorded in the diary
(`reference/04-perf-lab-backend-implementation-diary.md:345`): the word placed in `systemPrompt` was not known to the
model (answer "only", input 42); in a user message it was ("PERIWINKLE", input 332); with
`compat.supportsDeveloperRole: false` it was; and a 3,600-token system prompt with the word at its end was answered
correctly while the reported input was 36, so the count excludes system content. The fix is a per-provider override:
for providers in `PERF_LAB_SYSTEM_ROLE_PROVIDERS` (default `lunaroute`) the handle uses a model copy with
`supportsDeveloperRole: false` (`model.ts:71-75, 122`). There is no automated runtime probe in the code; the
`llm_calls` rows 1–7 are the residue of the incident (§3.4).

**System prompt** (`prompt.ts:6-36`): fixed rules (reply with one sentence and exactly one fenced `js` block, which is
the body of an async function; never write observations; at most four executions; earlier turns may be stale; state
observed / derived / missing; never present a missing value as zero; observed values are read-only; `lab.start()` only
proposes a job, a person must approve; "within a budget of 30 minutes of host time"; no fetch, timers, DOM or imports),
then the handle-API reference imported from the IDE (`src/components/organisms/IdePane/reference`), then the
browser-supplied board context JSON **truncated to 12,000 characters** (`prompt.ts:35`, which can cut the JSON
mid-token). On the last allowed step it adds "answer now in prose".

**Tools.** The model has no server-side tools. Its "tool" is the JavaScript it writes, which **the browser** executes
against the handle API (`new AsyncFunction(...libraryNames, "use strict"; { code })`,
`src/features/agent/runtime.ts:433-452`) with snapshot/rollback on error and a 10-minute timeout; the browser posts the
result to `/assistant/messages/:id/result`. The server never runs model-written code (diary step 5).

**Turn protocol** (`service.ts:14-15, 181-246, 321-375`):

```text
POST /assistant/turns (live):
  conversation ← active (lab, board) or a new one; 409 if a turn is already streaming on it
  store user message; SSE 'stored'
  reply():
    step ← (# assistant messages since the last user message) + 1
    context ← { systemPrompt(board, final: step > 4), messages: last 24 messages (assistant code re-fenced) }
    stream completion → SSE 'delta'…
    if error and no text: record llm_call; SSE 'error'; return
    (text, code) ← splitReply(reply)      # prose before the first fenced block + that block; rest dropped;
                                          # invented <observation>…</observation> removed
    runnable ← code and step ≤ 4
    store assistant message (status pending | skipped | null); record llm_call; SSE 'reply'
POST /assistant/messages/:id/result:
  store result on the message (status ok | rolled_back; value ≤ 20,000 chars, error ≤ 4,000, logs ≤ 200)
  store an 'observation' message = observationText(result) (≤ 6,000 chars; on the 4th step adds "That was your last code execution …")
  if continue and live: reply() as a new SSE stream
```

**Transcript storage.** Conversations are per (lab, board) with at most one active (partial unique index); "Clear"
archives (`/assistant/archive`); the library lists, searches, restores (archiving the board's current conversation in
one transaction) and deletes with cascade (`service.ts:255-319`). Observed: 5 conversations (2 `smoke-assistant`
boards, 3 archived `local-sampler` boards: `identity` 14 messages, `latency` 10, `cpu` 32), 60 messages, 30 calls.

## 7. `scripts/lab.ts` CLI

The CLI talks to a running server (`PERF_LAB_URL`, default `http://127.0.0.1:5198`); usage text at `scripts/lab.ts:1-11`.

| Command                                              | Lines  | Behaviour                                                                                                                                                                                      |
| ---------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lab evidence add <file.tar.gz> [--name <n>]`   | 81-86  | `POST /evidence?name=` with the file bytes (`content-type: application/gzip`); prints `sha256  name  N files, B bytes` and each dataset registered with the materialize hint                   |
| `pnpm lab evidence list`                             | 87-88  | `GET /evidence`                                                                                                                                                                                |
| `pnpm lab datasets list`                             | 89-90  | `GET /datasets`: id, name, images (present), annotations                                                                                                                                       |
| `pnpm lab datasets materialize <id-or-prefix>`       | 91-99  | resolves a unique prefix; opens `/events` first, then `POST /datasets/:id/materialize`; prints `present/total` from `dataset.progress` and the final `dataset.materialized` summary and failures |
| `pnpm lab models fetch`                              | 100-109 | `uv run --project workloads python -c "snapshot_download('IDEA-Research/grounding-dino-tiny', revision='a2bb814dd30d…')"` (≈ 690 MB), the snapshot the DGX evidence used                       |

Errors exit 1 with the server's message (`lab.ts:20-32`). Not present yet: any `hosts` subcommand (planned by
ML-PERF-003 §6.15).

## 8. What is in `.data` (observed, read-only)

### 8.1 Layout and sizes

```text
.data/                       36 MB total
  perf-lab.sqlite            1.9 MB (+ -wal 420 KB, -shm)
  artifacts/   1.9 MB        34 directories: <capture-hash>/{spec.json, rep-<n>/…} for sampler captures,
                             <base16>-<cand16>/rep-0/{baseline,candidate}.spec.json, images.json, src-baseline/,
                             src-candidate/, reports/, artifact-provenance.json, run-configuration.json, stderr.log for dino
  evidence/    7.9 MB        0daa394d…20c3.tar.gz and its extraction 0daa394d…20c3/ (55 files)
  media/       22 MB         128 COCO val2017 JPEGs named by SHA-256 (23,229,457 bytes in total)
  inductor-cache/ 1.6 MB     shared TorchInductor cache (aotautograd, fxgraph, locks, …)
```

The data was produced in the Playback worktree and copied: manifests embed absolute paths into that worktree (e.g.
`inductor_cache: /Users/manuel.odendahl/code/tulip/playback/.worktrees/…/lab-workbench/.data/inductor-cache` in
`artifacts/24318dbc66390/rep-0/manifest.json`).

### 8.2 Row counts

`programs` 0 · `artifacts` 70 (50 measured, 20 synthetic, all `available`) · `runs` 80 · `run_bundles` 80 · `jobs` 12 ·
`job_captures` 86 (78 imported, 8 pending) · `job_events` 2,485 · `annotations` 0 · `conversations` 5 · `messages` 60 ·
`llm_calls` 30 · `evidence_archives` 1 · `datasets` 1 · `dataset_images` 128 · `dataset_annotations` 799 · `media` 128.

### 8.3 Jobs

| Job                 | Lab           | Host         | Status    | Created (UTC)       | Duration | Note                                                                                       |
| ------------------- | ------------- | ------------ | --------- | ------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `job-mv5sfo0r-l0ge` | local-sampler | local        | done      | 2026-10-12 21:52:33 | 42 s     | first run at 2,048 queries, cold Inductor cache                                            |
| `job-mv5t0dn0-unym` | local-sampler | local        | done      | 22:08:39            | 36 s     | 1,024 queries (this run overwrote the 2,048 rows before migration 3)                       |
| `job-mv5t7r6k-6c0y` | local-sampler | local        | done      | 22:14:24            | 35 s     | 2,048 re-measured after migration 3 marked its artifacts failed                            |
| `job-mv5un7zf-oqlm` | local-sampler | local        | done      | 22:54:25            | 45 s     | 4,096 queries                                                                              |
| `job-mv5vvy7l-t6w8` | local-sampler | local        | done      | 23:29:12            | 59 s     | 12,240 queries                                                                             |
| `job-mv5vvze7-vsb0` | local-sampler | local        | cancelled | 23:29:13            | —        | duplicate, cancelled before it ran; its 8 `job_captures` stay `pending`                    |
| `job-mv5xa0la-xb7l`, `-xcvua-mw5w`, `-xegty-d4p5`, `-yf2at-e6io`, `-ylxbt-pbbs` | dino-pr1005 | playback@dgx | done | 2026-10-13 00:08–00:45 | < 4 s | evidence imports from archive `0daa394d…` (14, 14, 2, 2, 2 captures)                      |
| `job-mv5xtdeh-jvk0` | dino-pr1005   | local        | done      | 00:23:11            | 3 min 48 s | local CPU run of Grounding DINO at `a6f14d947` vs `d59d9ad`: timing 169 s, predictions 58 s |

### 8.4 Artifacts by lab

- `local-sampler`: 32 measured artifacts = 4 query values (1,024, 2,048, 4,096, 12,240) × 4 modes × 2 arms (`unfused`
  baseline, `compiled` candidate); every run valid and qualified; toolchain `torch 2.14.1 · python 3.12.14 · numpy
  2.5.4`, 8 threads, CPU (Apple M1 Pro per the diary's probe line).
- `dino-pr1005`: 14 artifacts imported from the archive (`pr1005-dgx` timing/memory/stages/predictions/kernels/tests ×
  2 arms, `pr1005-prompt-policy` timing × 2), each with `source = evidence:0daa394d…`; 4 measured locally
  (`dino-local` timing and predictions × 2); and **10 orphan synthetic artifacts** under hashes of earlier program
  versions that predate the `.evidence(...)` declaration.
- `hello`, `compare`, `scenario-c`: 10 synthetic seeds; six of them were written on **2026-10-19 13:16–13:17 UTC**, i.e. a
  server ran this morning in the Playback worktree and a browser opened `/labs/hello` and `/labs/compare` (observed
  `created_at`).

### 8.5 Verifying the memo's numbers

The memo and design 04 §15.2 claim: at 2,048 queries the compiled arm is slower than eager, paired median ratio **2.58×
(95 % CI 2.18–2.69) in the first run** and **2.50× (2.37–2.72) after re-measurement**; at 1,024 queries **2.29×
(1.88–2.52)**; first compile **≈ 4.9 s** with an empty cache and **≈ 0.9 s** with the shared cache; user CPU 480 vs
1,293 ms and peak RSS 287.5 vs 457.7 MiB at 1,024 queries; eager allocates two intermediate-sized blocks per request and
the compiled graph one.

Recomputed from the DB with the browser's estimator definition — median of per-process ratios of per-process median
latencies, CI = 2.5/97.5 % quantiles of 2,000 bootstrap medians over processes (`src/lang/stats.ts:19-89`):

| Queries | Baseline per-process medians (ms) | Candidate per-process medians (ms) | Per-process ratios            | Median ratio | CI as the estimator yields       | Memo                   |
| ------- | --------------------------------- | ---------------------------------- | ----------------------------- | ------------ | -------------------------------- | ---------------------- |
| 1,024   | 3.02, 2.42, 2.44, 3.17            | 6.32, 6.10, 6.10, 5.95             | 2.092, 2.523, 2.498, 1.880    | **2.295**    | 1.88–2.52 (= min–max, see below) | 2.29× (1.88–2.52) ✔    |
| 2,048   | 5.25, 5.23, 5.16, 5.08            | 13.19, 12.42, 12.80, 13.82         | 2.513, 2.374, 2.480, 2.721    | **2.497**    | 2.37–2.72                        | 2.50× (2.37–2.72) ✔    |
| 4,096   | 11.39, 10.90, 15.46, 11.71        | 22.30, 21.28, 24.51, 30.14         | 1.957, 1.953, 1.585, 2.575    | 1.955        | 1.59–2.58                        | not in memo            |
| 12,240  | 31.33, 30.70, 34.98, 31.81        | 67.64, 68.99, 70.39, 70.88         | 2.159, 2.247, 2.013, 2.228    | 2.194        | 2.01–2.25                        | not in memo            |

- **2.50× (2.37–2.72) and 2.29× (1.88–2.52) are reproduced exactly.** With four processes, a bootstrap median is
  pinned to the minimum whenever at least three of four draws are the minimum (probability 4·(1/4)³·(3/4) + (1/4)⁴ ≈
  5.1 % > 2.5 %), so the "95 % CI" is the min–max of the four ratios.
- **2.58× (2.18–2.69) cannot be re-verified:** those runs belonged to `job-mv5sfo0r-l0ge` and were replaced by the
  re-run (`deleteRunsOf`, `runner.ts:297`; migration 3). The diary's headless check recorded it
  (`reference/04-…-diary.md:271`).
- **First compile 4.9 s: verified** in `job_events`: `sampler-local/candidate/timing#0 {"i":0,"ms":4857.931}` in the
  first job; later first calls are 805–1,017 ms with the shared cache, and 2.7–3.3 s for the first process at a new
  query size (`job-mv5t0dn0-unym` 2,745 ms; `job-mv5un7zf-oqlm` 3,183 ms; `job-mv5vvy7l-t6w8` 3,283 ms).
- **CPU and RSS at 1,024: verified.** `rusage.userTime` 480.141 vs 1,293.300 ms; `maxRss` 301,449,216 B (287.5 MiB) vs
  479,936,512 B (457.7 MiB).
- **Allocator claim: verified.** Memory runs have 9 allocations over 3 requests for eager (16 MiB `aten::empty` =
  `grid_sample` output, 16 MiB `aten::mul` = product, 1 MiB `aten::sum` per request at 1,024 queries) and 6 for
  compiled (16 MiB + 1 MiB in `Torch-Compiled Region: 0/0`); peak allocated 34.6 MB vs 17.8 MB. Inductor did not fuse
  away the intermediate, so the preset's hypothesis is refuted on this host.

Other measured results in the DB: the DGX archive's paired timing gives median per-call latency 77.2/76.9 ms
(baseline) vs 53.8/53.7 ms (candidate), all outputs exact, replay active (NVIDIA GB10, torch 2.10.0+cu130, CUDA 13.0,
triton 3.6.0); the prompt-keyed diagnostic 393.8 ms vs 53.6 ms; the candidate passed 39/39 native tests. The local CPU
dino run gives 1,664.8 ms (baseline) vs 1,654.4 ms (candidate) median per call over 16 images × 2 pairs, outputs exact,
replay "not configured" (as expected without CUDA).

## 9. ML-PERF-003: the planned remote GPU executor (design only)

Status: ticket created 2026-10-12 with an intern guide (1,027 lines) and a diary; **all six phase tasks are open** and
no code exists (no `server/remote/`, no `workloads/perf_lab_remote/` in the copy).

- **Problem.** The lab executes only on the Mac. DGX captures are either imported from hand-made archives or completed
  as synthetic stand-ins (guide §0, §4).
- **Placement decision (guide §5).** Keep the lab server on the Mac and add an **SSH container executor** (option B),
  rejected alternatives: hosting the lab on the DGX (splits the catalog, puts credentials on a shared host that holds
  camera recordings, and the workload must still run inside the detection image because the image preloads system
  cuBLAS for `sm_121`) and a DGX agent service (option C, kept as a future second implementation). A job's lifetime is
  tied to its SSH connection on purpose: "an orphaned GPU process on a shared host is worse than a cancelled job."
- **Abstraction (§6.1).** `StepHost { probe(); run(stagedJob, ctx) → { exitCode, archive bytes, sha256, steps };
  cancel(jobId); reconcile(jobIds) }`, implemented by `SshContainerHost` (ssh subprocesses) and `LocalShellHost`
  (tests, fake `docker` on `PATH`). The runner partitions groups into evidence / local dino / local process / remote.
- **Host profiles (§6.2)** in `.data/hosts.json` (`PERF_LAB_HOSTS`): ssh target, remote root, image (tag resolved to an
  image ID by the probe), container python, docker limits (`gpus all`, 16 g memory, 1 g shm), thread settings, lock wait,
  idle window. A profiled host replaces its synthetic entry in `/api/hosts`.
- **Identity (§6.4).** Executed captures on profiled hosts gain `spec.environment = { executor: 'ssh-container', image:
  sha256:…, driver, limits, threads }`, so a rebuilt image or driver update changes the capture hash; evidence and
  local captures keep their hashes; a profiled host without a successful probe makes captures `blocked`. This also
  resolves the stale-synthetic-seed problem.
- **Flow (§0, §6.5–§6.10).** Stage a bundle (`git archive` of both revisions, `run.py`, specs, image list, `plan.json`
  of fully specified `docker run` steps) → upload bundle and missing media → `driver.py run` on the DGX takes a GPU lock
  (`flock`), records co-tenancy (GPU processes, containers, 1 s utilization) before/during/after, runs each step in a
  disposable `--network none` container pinned by image ID with read-only inputs, streams JSON-line progress, packs a
  `result.tar.gz` → the lab fetches it, registers it in the same evidence store and imports with the same
  `detection-qualification/v1` importer.
- **`run.py` changes (§6.13):** `--trees` as an alternative to `--repo`; `torch.cuda.synchronize()` around each timed
  call; a complete header (`gpu`, CUDA peaks, cgroup `memory.peak`); executor host name in `run-configuration.json`.
- **API and CLI additions (§6.15):** `POST /api/hosts/:host/probe`, `features: 'remote-executor'`, job events `driver.*`,
  `lock.*`, `step.*`, `resultArchive`; `pnpm lab hosts list|probe|install|gc`; lab.js `.environment({ image })`,
  `capture.memory().image(id).iterations(n)`, later `prompts` and `capture.timing().sequence({ cycles })`. Server modules
  `remote/{profiles,ssh,host,probe,stage,recipes,import}.ts`.
- **Phases (§8):** 0 profile + probe (done when `pnpm lab hosts probe playback@dgx` shows image `sha256:d06d49c0…`);
  1 identity; 2 staging, recipes, driver, `run.py`; 3 remote path in the runner, reproduce PR 1005 on 16 stratified
  images (§7.1, expected per-image ratios 0.64–0.72 and ≈ 30 % reduction); 4 memory in fresh containers, conditions,
  cancel (§7.2); 5 prompt-sequence workload (§7.3).
- **DGX facts recorded read-only on 2026-10-12 (diary):** `gx10-b2d2`, Ubuntu 24.04.4, aarch64, Docker 29.2.1, NVIDIA
  GB10 (cc 12.1), driver 580.159.03, image `pb-dgx-sim-detection:latest` = `d06d49c09f19…`, six resident CUDA
  processes, 13 running containers, 61 GB free.
- **Open risks (§10):** co-tenant interference (six resident CUDA processes), the image tag moving, the image's
  unpinned model snapshot, the 64 MiB archive cap vs full profiler traces, no page-cache flush ("cold" = empty compiler
  caches), importer versioning, long jobs vs SSH lifetime.

## 10. Weaknesses, gaps, security concerns

Ordered roughly by consequence. Each item names its evidence.

### 10.1 Security

1. **Human approval is a client-side convention.** The server approves a job when the request says `approve: true`
   and `proposedBy` is anything but `'assistant'` (`server/app.ts:160, 172`); it trusts the client's claim of who
   proposed. Model-written code runs in the browser as `new AsyncFunction(...)` whose library names shadow nothing
   global (`src/features/agent/runtime.ts:439-446`), so it can reach `fetch` and post its own approved job; the
   prompt's "do not use fetch" (`server/assistant/prompt.ts:22`) is advice. The 30 GPU-minute budget is likewise
   browser-only (§4.3). (Observed in code; not exploited.)
2. **Cross-site request forgery against `127.0.0.1:5198`.** No auth, no Origin/Host check, no CORS policy, and Hono's
   `c.req.json()` parses the body whatever its content type (`node_modules/hono/dist/request.js:104-105`, hono 4.13.13).
   A page on any site can therefore send a "simple" cross-origin `POST` (`text/plain`) to `/api/jobs` with `approve:
   true` — the capture hash is a public, trivially computable cyrb53 — or to `/api/evidence`, `/api/assistant/turns`
   (spends model tokens) and `/api/datasets/:id/materialize`. `PUT`/`DELETE` need a preflight and are blocked. DNS
   rebinding is not prevented either. (Inferred; design 04 §11 assumes "single-user development tool" is enough.)
3. **What code a job can run.** The sampler workload only selects among fixed implementations (`run.py:117-136`) —
   good. The dino workload executes Playback source at **any revision string the spec names** (`git show <rev>:<path>`,
   `workloads/perf_lab_dino/run.py:54-56`, then `importlib.import_module`, lines 135-143), i.e. any commit or branch
   in the developer's checkout. The revision is not validated (a value starting with `-` reaches `git show` as an
   option; inferred). Combined with items 1–2, a forged job can run arbitrary repository code.
4. **Third-party code at startup.** The server loads a pi extension TypeScript file from the user's home
   (`server/assistant/model.ts:64-69, 99`) and runs `uv run` (which may sync the environment from the network unless
   `--frozen`; inferred) for the probe and every repetition.
5. **Resource exhaustion (local only).** `POST /evidence` reads the whole body before validating when there is no
   `content-length` (`app.ts:220-223`); archives are gunzipped synchronously up to 512 MiB (`tar.ts:57`); importing
   blocks the single event loop.

### 10.2 Correctness and robustness

6. **No process timeout**; a hung workload blocks the single queue until someone cancels (`runner.ts:57-61`,
   `dino.ts:84`). Cancellation signals `uv`, not Python (`runner.ts:133`).
7. **Asymmetric failure handling.** The sampler path stores a failed repetition as an invalid run, the dino path does
   not (`runner.ts:326-339` vs `dino.ts:109`); one failing repetition aborts the whole job, including unrelated groups.
8. **Restart cleanup is partial.** `failInterruptedJobs` fixes jobs only (`store.ts:254-261`): artifacts stay `running`
   and job captures stay `running`. Cancelling a not-yet-run job leaves its captures `pending` (observed: 8 rows) and
   leaves its id in the runner's `cancelled` set forever: the route calls `runner.cancel` for every non-terminal job
   (`app.ts:195-199`), and `runJob` returns before the `try … finally` that would delete it
   (`runner.ts:131-134, 264-266, 368`). A small leak, not a functional bug.
9. **Content identity is weak and mislabelled.** Capture hashes are 53-bit cyrb53, not cryptographic
   (`src/lang/util.ts:1`); `quality_gate_sha256` and the sampler's `fixture_manifest_sha256` are cyrb53 values in
   fields named SHA-256, and the run manifest shows them as `sha256:<cyrb53>` (`importer.ts:258`). Two different
   SHA-256s of the workload sources exist (`probe.py:23-29` vs `run.py:39-43`), and `manifest.spec_sha256` is never
   checked.
10. **The declared quality gate is not what runs.** Python always compares against eager `unfused`
    (`run.py:161-168`); the program's `.gate(quality.ref(...))` contributes only a hash. A program declaring a
    different reference or mode would still be judged against the hard-coded one.
11. **The catalog is global.** `GET /catalog` ignores `?lab=` (design 04 §8 documents the filter) and returns every
    lab's artifacts; `insertArtifact`'s upsert never updates `lab_id`, so a hash shared by two labs belongs to the first
    (`store.ts:62-84`). Stale synthetic artifacts are never collected (observed: 10 orphans in `dino-pr1005`).
12. **The kiln copy cannot run the dino workload as is.** `playbackRepo()` falls back to the git top level of the lab
    directory (`dino.ts:34-38`), which in the copy is the empty kiln repository, so `git show` of Playback revisions
    fails; set `PERF_LAB_PLAYBACK_REPO`. `run.py`'s `git_revision()` returns `None` there (no commits). The
    `local-sampler` preset names its reference source by a Playback path
    (`src('HEAD:ttmp/2026/10/12/ML-PERF-001--…/workloads/perf_lab_local/sampler.py#unfused')`, preset line 5). The
    DB and manifests carry absolute paths into the Playback worktree. (Inferred from code and paths; not run.)
13. **Dino Inductor cache is uncontrolled.** The candidate reports `use_compile: true` (observed in the local report),
    but `dino.ts:84` does not pass `PERF_LAB_INDUCTOR_CACHE`, so the cache state (cold/warm) is not part of the
    experiment for that workload.
14. **Prompt and context truncation is silent.** Board context is cut at 12,000 characters, possibly mid-JSON
    (`prompt.ts:35`); history keeps the last 24 messages without telling the model (`service.ts:15, 182`); the
    prompt-token figure is characters ÷ 4.
15. **Statistics.** With four processes the bootstrap "95 % CI" equals the min–max of four ratios (§8.5); the label
    overstates what four pairs support.
16. **CLI race.** `pnpm lab datasets materialize` opens `/events` and posts the request concurrently; if materialization
    finishes before the SSE subscription is live, the command waits forever (`scripts/lab.ts:96-99`; inferred).

### 10.3 Gaps (half-finished or absent)

17. **No real GPU execution.** `local` is the only executable host; DGX/RTX hosts are synthetic or imported
    (`runner.ts:92-98`, `app.ts:42`). Remote execution is ML-PERF-003, unimplemented.
18. **No GPU kernel evidence from local runs.** The importer builds `kernel` entities from CPU ATen operators only;
    `counters.unsupported: ['*']` always (`importer.ts:100, 173-190`); Metal kernels are invisible. The DGX archive's
    Chrome profiler trace is not imported (§5.4).
19. **No per-run conditions** (co-tenancy, thermal, load) are recorded locally; ML-PERF-003 plans them for the DGX only.
20. **No importer version** on runs, so a board cannot tell which importer produced a run (ML-PERF-003 §10).
21. **No Python tests** in `workloads/` (observed); the server tests exercise the importer with hand-written fixtures and
    the qualification importer with the real archive.
22. **Design/code drift.** Design 04 §6 lists "quality failure" among validity reasons; the code does not (and §5.3 of
    the same document says a quality failure is "unqualified, never silently invalid"). §8's `/catalog?lab=` filter
    and `status` field are not implemented. §15.1 says "three migrations"; there are five.

## 11. Test results

- `pnpm exec vitest run server` (from `lab-workbench/`): **Test Files 4 passed (4), Tests 33 passed (33)**, duration
  604 ms. Verbose list: `assistant.test.ts` 9 (scripted storage, live loop with token rows, four-execution stop, model
  choice and refusal, archive/list/restore/delete, spec parsing, thinking levels, fence parsing, observation
  truncation); `server.test.ts` 9 (migrations once, value-record round trip, importer activation judgement, failed
  process as invalid run, forged hash 409, seeding skips executable hosts, paired run end to end, two parameter values
  keep their runs, non-zero exit fails the job and keeps the catalog empty); `evidence.test.ts` 7 (hostile tar entries,
  archive registration and COCO selection, provenance mismatch, public-source mapping, hash-verified materialization,
  public-only media, the real DGX archive with 128 images); `qualification.test.ts` 8 (profiler table and JUnit parsers,
  kernel roles by Inductor prefix, report selection, paired timing with exact digests, memory pools, stages/predictions/
  kernels/tests, prompt diagnostic, an evidence job end to end).
- `pnpm exec vitest run` (whole workbench): **Test Files 11 passed (11), Tests 104 passed (104)**, 2.15 s.
- Safety of running them: every server test uses `openDb(':memory:')` and `mkdtempSync(tmpdir())`
  (`server.test.ts:16-22, 59-63`, `evidence.test.ts:53-58`, `qualification.test.ts:46-48, 132-136`; `assistant.test.ts:37,
  51` uses `/tmp/unused` without writing). They never touch `.data`. The temporary directories are not removed
  (`afterEach` only empties the list, `server.test.ts:22`).
- Three test blocks depend on a file outside the repository,
  `~/code/tulip/playback-vault/Projects/2026/10/12/_assets/pr1005-dgx-20261012/evidence-final.tar.gz`, and are skipped
  when it is absent: one `it.skipIf` (`evidence.test.ts:143-144`) and two `describe.skipIf` blocks
  (`qualification.test.ts:43-45, 125`). It is present on this machine, so nothing was skipped.

## Appendix A. Backend file inventory

| File                                   | Lines | Role                                                                                       |
| -------------------------------------- | ----- | ------------------------------------------------------------------------------------------ |
| `server/index.ts`                      | 39    | process entry: config, DB, interrupted jobs, runner, probe, assistant, serve, signals      |
| `server/config.ts`                     | 34    | `ServerConfig`, environment                                                                |
| `server/app.ts`                        | 286   | Hono routes, capture validation, SSE                                                       |
| `server/db.ts`                         | 363   | five migrations, `openDb`, `migrate`, `tx`, query helpers                                  |
| `server/store.ts`                      | 276   | programs, artifacts, runs/bundles, jobs, captures, events, annotations                     |
| `server/runner.ts`                     | 380   | executors, queue, grouping, paired order, evidence and dino paths                          |
| `server/importer.ts`                   | 286   | local repetition → bundle; validity; quality                                               |
| `server/qualification.ts`              | 394   | `detection-qualification/v1` importer, profiler/JUnit parsers, kernel roles                |
| `server/evidence.ts`                   | 100   | archive registration and file access                                                       |
| `server/tar.ts`                        | 129   | safe tar.gz reader, test writer                                                            |
| `server/datasets.ts`                   | 266   | COCO datasets, public sources, media store, materialization                                |
| `server/dino.ts`                       | 114   | local paired dino repetition                                                               |
| `server/probe.ts`                      | 37    | local capability probe                                                                     |
| `server/events.ts`                     | 21    | event bus                                                                                  |
| `server/bundles.ts`                    | 5     | gzip-JSON codec                                                                            |
| `server/assistant/model.ts`            | 188   | pi model catalog, system-role override, streaming                                          |
| `server/assistant/prompt.ts`           | 59    | rules, reference, board context, observation text, reply splitting                         |
| `server/assistant/service.ts`          | 377   | assistant routes, turn protocol, transcripts, token rows                                   |
| `scripts/lab.ts`                       | 115   | CLI                                                                                        |
| `workloads/perf_lab_local/run.py`      | 219   | one sampler repetition                                                                     |
| `workloads/perf_lab_local/sampler.py`  | 120   | three implementations of deformable sampling                                               |
| `workloads/perf_lab_local/probe.py`    | 76    | capability report                                                                          |
| `workloads/perf_lab_dino/run.py`       | 261   | paired Grounding DINO at two Playback revisions                                            |
| tests (`server/*.test.ts`)             | 704   | 33 tests                                                                                   |
