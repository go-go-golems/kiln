# @kiln/server

The Kiln server (guide §30): records, devices and CUDA jobs over HTTP, SQLite storage, server-sent events, and the
built workbench page with a session token; and, under `/api/lab`, Perf Lab's data routes (guide §33.3). Node 26 runs
the TypeScript directly; there is no build step.

```bash
pnpm dev                                  # build the workbench, then serve it on http://127.0.0.1:5280/
pnpm serve                                # serve the last build
pnpm --filter @kiln/server test           # Vitest: in-memory SQLite, the fake runner, no GPU, no SSH
pnpm --filter @kiln/server lab:import     # copy Perf Lab's data (lab-workbench/.data) into $KILN_DATA_DIR
```

| Variable         | Default                     | Effect                                    |
| ---------------- | --------------------------- | ----------------------------------------- |
| `KILN_PORT`      | `5280`                      | HTTP port, loopback only                  |
| `KILN_DATA_DIR`  | `apps/server/.data`         | `kiln.sqlite`, executor profiles, `lab/`  |
| `KILN_DIST`      | `apps/workbench/dist`       | The page (`kiln-workbench.html`)          |
| `KILN_EXECUTORS` | `$KILN_DATA_DIR/executors.json` | CUDA executor profiles; none if missing |
| `KILN_MODEL`     | unset                       | Model id for the agent gateway; unset turns it off |
| `KILN_MODEL_URL` | `https://api.anthropic.com/v1/messages` | The Messages endpoint the gateway calls |
| `ANTHROPIC_API_KEY` | unset                    | Sent upstream as `x-api-key`; never logged, stored or returned |

Relative paths resolve against `apps/server` (where `pnpm --filter` runs the server); prefer absolute ones.

An executor profile runs `runner/kiln_runner.py` on this machine or on a GPU host through `ssh -T` (the runner is
copied once to `runnerDir`, named by its SHA-256):

```json
{ "executors": [
  { "id": "local-cuda", "target": "local", "python": "python3", "env": { "KILN_ARCH": "native" } },
  { "id": "rtx-dev", "target": "ssh", "host": "playback@playback-rtx-dev", "runnerDir": "~/.cache/kiln-runner" }
] }
```

The server probes every executor at start-up; an SSH executor therefore connects to its host as soon as the server
starts. Every request is checked first: the Host must be this loopback address and port (403 `bad_host`), an Origin
must be this server (403 `bad_origin`), and a request other than GET needs the page's `X-Kiln-Token` (403
`bad_token`) and a JSON body (415). The page-side client is `apps/workbench/src/server-client.js`.

The agent gateway (guide §31): when `KILN_MODEL` and `ANTHROPIC_API_KEY` are both set, `POST /api/agent/sample`
relays the workbench agent's model calls and streams the answer back as NDJSON (`text` events, then one `done` or
`error`), and `GET /api/agent/usage` reports token totals by model and by conversation. Every upstream call writes one
`llm_calls` row, whatever its outcome. The page uses the gateway when it is served here without a host bridge
(`window.claude`). The gateway has no upstream timeout and no concurrency cap; a stuck model call holds its request
until the page stops it.

## Perf Lab's data: `/api/lab`

The lab route group (`src/lab/`) serves Perf Lab's catalog, run bundles, programs, annotations, evidence archives,
datasets and media with the response shapes of Perf Lab's own server (`lab-workbench/server/app.ts`), so a Perf Lab
client needs only a base-path change (`/api` → `/api/lab`). It sits behind the same four checks as every other route;
in particular every write needs the page's token and a JSON body. Lab jobs do not run here: the job routes list the
history imported from Perf Lab and answer 501 to create, approve or cancel. Errors are `{error, message}`.

| Method and path | Body | Response |
| --- | --- | --- |
| `GET /catalog` | | `{<captureHash>: {origin, source, ref, host, reps, labId, importedAt}}`, available artifacts only |
| `POST /labs/:labId/seed` | `{captures: [{hash, ref, host, reps, spec}]}` | `{seeded}`; synthetic stand-ins for hosts that do not execute (never `local`, never evidence captures); 409 `spec_hash_mismatch` |
| `GET /bundles?hashes=a,b` | | `{<hash>: [{run, entities, links}]}`, repetitions in order, at most 64 hashes |
| `GET /programs/:labId` | | `{labId, source, presetHash, updatedAt}` or 404 |
| `PUT /programs/:labId` | `{source, presetHash?}` (≤ 500 kB) | `{ok: true}` |
| `DELETE /programs/:labId` | | `{ok: true}` |
| `GET /annotations?lab=` | | `[{id, lab_id, target, kind, body, author, created_at}]` |
| `POST /annotations` | `{labId, target, kind, body?, author?}` | `201 {id}` |
| `GET /evidence`, `GET /evidence/:sha` | | `{sha256, name, bytes, files: [{path, bytes}], addedAt, datasets}` (list, or one) |
| `POST /evidence` | `{name?, data: base64}` or `{name?, path: "/abs/x.tar.gz"}` | `201` new, `200` known (same summary); `400 bad_archive` |
| `GET /datasets`, `GET /datasets/:id` | | summary `{id, name, format, privacy, source, categories, imageCount, annotationCount, present, addedAt}`; the detail adds `provenance`, `images`, `annotations` |
| `GET /media/:sha` | | the image (`image/jpeg` or `image/png`), `cache-control: immutable`; 400 unless 64 lowercase hex digits |
| `GET /jobs?lab=`, `GET /jobs/:id` | | Perf Lab's job view: the row, `captures` (without specs), `events` |
| `POST /jobs`, `/jobs/:id/approve`, `/jobs/:id/cancel`, `/datasets/:id/materialize` | | `501 not_implemented` |
| `GET /hosts`, `GET /hosts/:host/capabilities` | | hosts with `available: false` for `local`; capabilities `503 no_probe` |

An evidence archive is a `.tar.gz` of regular files and directories with relative paths, at most 64 MiB; it is
identified by its SHA-256, extracted after every entry is validated, and a COCO selection inside it
(`qualification/coco/instances_selected.json` with `fixture-provenance.json`) becomes a dataset. Base64 in a JSON body is
bounded by the 32 MiB request limit; register a larger archive by its absolute path. Seeding emits `catalog.changed`
and a new archive `evidence.registered` on `/api/events`.

### Importing Perf Lab's data

```bash
KILN_DATA_DIR=/abs/kiln-data pnpm --filter @kiln/server lab:import [perf-lab-data-dir]
```

The importer opens `<perf-lab-data-dir>/perf-lab.sqlite` read-only (default directory `lab-workbench/.data`; a relative
path resolves against `apps/server`) and copies artifacts, runs and bundles, jobs with their captures and events,
programs, annotations, evidence archives, datasets and media into `kiln.sqlite` and `lab/`. It verifies every identity
Perf Lab recorded before storing anything: archive and media bytes against their SHA-256 and size, media types by
magic number, each artifact's capture hash against its spec, each bundle against its entity and link counts, each
dataset against its row counts. What fails is refused and listed; the rest is imported. Re-running adds nothing. Exit
status: 0, 1 if anything was refused, 2 if the source cannot be read. Perf Lab's assistant transcripts
(`conversations`, `messages`, `llm_calls`) and raw job output directories are not imported. A page that is open during
an import sees the new data after a reload.

### Data layout

```text
$KILN_DATA_DIR/kiln.sqlite                 records, devices, jobs, llm_calls, and the lab_* tables (migration 2)
$KILN_DATA_DIR/lab/evidence/<sha256>.tar.gz an evidence archive as registered
$KILN_DATA_DIR/lab/evidence/<sha256>/       its entries, extracted after validation
$KILN_DATA_DIR/lab/media/<sha256>.jpg|png   public images, named by the SHA-256 of their bytes
```
