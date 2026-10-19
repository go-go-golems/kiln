---
Title: Phase 8c diary — Perf Lab's server routes in the Kiln server (/api/lab) and the importer from PL/.data
Ticket: KILN-001
Status: active
Topics:
    - kiln
    - perf-lab
    - backend
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://apps/server/src/lab/routes.ts
      Note: The /api/lab route group — catalog, seed, bundles, programs, annotations, evidence, datasets, media, hosts, read-only jobs
    - Path: repo://apps/server/src/lab/importer.ts
      Note: importPerfLab — copies PL/.data (opened read-only) into the Kiln database and KILN_DATA_DIR/lab, verifying every hash Perf Lab recorded
    - Path: repo://apps/server/src/lab/import.ts
      Note: The `pnpm --filter @kiln/server lab:import [dir]` command line
    - Path: repo://apps/server/src/db.ts
      Note: Migration 2 — the lab_* tables
    - Path: repo://apps/server/test/lab.test.ts
      Note: Route contracts and shapes, security refusals, media traversal and bad SHA-256s
    - Path: repo://apps/server/test/lab-import.test.ts
      Note: The importer on a synthetic Perf Lab data directory — counts, idempotency, checksum refusals
ExternalSources: []
Summary: 'Chronological diary of Phase 8c (guide §33.3, §35 Phase 8): Perf Lab''s artifact, bundle, program, annotation, evidence-archive, dataset and media routes as a second route group of the Kiln server under /api/lab, with the same response shapes; lab jobs read-only; an idempotent, hash-verifying importer from PL/.data.'
LastUpdated: 2026-10-19T17:20:00-04:00
WhatFor: "Reviewing how Perf Lab's server data moved into the Kiln server, the /api/lab contract, and what was left out (execution, materialize, transcripts)"
WhenToUse: "Before writing a client for /api/lab, porting lab job execution, or re-importing Perf Lab data"
---

# Phase 8c diary — Perf Lab's server routes in the Kiln server

Written by the Phase 8c worker. The main diary is `01-investigation-diary.md`; its Step 1 holds the user's verbatim
requests and its Step 19 the Phase 8 plan. Paths: `T/` is this ticket, `S/` is `apps/server/`, `PL/` is
`lab-workbench/` (Perf Lab as received, never modified). A second worker builds `packages/lab` (8a) at the same time;
this worker writes only under `S/` and this diary, and does not commit.

## Step 1: Read the specification, Kiln's server and Perf Lab's server

Phase 8c moves Perf Lab's data routes into the Kiln server as a second route group, and brings Perf Lab's existing
data along. Before writing anything I read both servers end to end, because the port has two fixed sides: Kiln's
security middleware and migration list, which must apply unchanged, and Perf Lab's response shapes, which a thin client
(and the headless `@kiln/lab` package being built in parallel) will consume with only a base-path change.

The reading settled most of the design: the lab tables get a `lab_` prefix (Kiln already has `jobs`, `job_events` and
`llm_calls`), the evidence upload cannot be a raw `.tar.gz` body because Kiln refuses every non-JSON write, and the
importer can verify every capture hash, because all 70 artifacts in `PL/.data` hash to their key under Perf Lab's own
cyrb53 of the stable-stringified spec.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Coordinator assignment (summary, not verbatim):** implement Phase 8c — Perf Lab's server routes as a route group at
`/api/lab/...` in `apps/server`, sharing the security middleware, with the same response shapes (catalog, bundles,
programs get/put/delete, annotations, evidence archives list/get/register by upload or by path with Perf Lab's
integrity checks, datasets list/get, media by SHA-256, hosts/capabilities if cheap); code under `S/src/lab/`, a
minimal mount hunk in `app.ts`, lab tables as appended migrations, data files under `KILN_DATA_DIR/lab/`. No lab job
execution (leave jobs out or port them read-only, and document the mapping onto Kiln's jobs). An idempotent importer
CLI that opens `perf-lab.sqlite` read-only, verifies SHA-256 where Perf Lab recorded one, prints a summary, and is run
once against the real data into a temporary directory; not importing `llm_calls`, `conversations`, `messages`. Vitest
tests with `:memory:` SQLite and temporary directories, never reading `PL/.data`. README and "As built" notes in this
diary.

**Assistant interpretation:** port the data half of Perf Lab's server, faithfully in shape, stricter where Kiln's
security model requires it, and make the real data available to the Kiln server.

**Inferred user intent:** Phase 8's done-condition ("the two programs open as boards against data imported from
`PL/.data`") needs a server that holds that data and answers in the shapes the language's data layer expects.

### What I did

- Read the guide: §15 (Perf Lab's server), §30 (Kiln's server, security model, schema), §31 (the agent's isolation:
  agent code never holds the token, so it cannot write), §33 (lab programs), §35 Phase 8, §36 (testing rules).
- Read `S/src/{app,security,db,config,records,index,events}.ts`, the head of `jobs.ts` and `agent.ts`,
  `S/test/support/server.ts` and `S/test/security.test.ts`, and `S/README.md`.
- Read `PL/server/{app,db,store,evidence,datasets,tar,importer,bundles,events,config,index,probe}.ts`, the head of
  `runner.ts` and `qualification.ts`, and `server.test.ts`, `evidence.test.ts`.
- Read the client side: `PL/src/services/{labApi,server}.ts`, `PL/src/data/{bundles,datasets}.ts`,
  `PL/src/features/server/thunks.ts`, and grepped every `server.get/post/put/del` call, to know which routes and
  fields a client actually consumes.
- Baseline: `pnpm --filter @kiln/server test` → 8 files, 62 tests passed; `pnpm --filter @kiln/server typecheck` clean.
- Inspected `PL/.data/perf-lab.sqlite` read-only (`new DatabaseSync(file, { readOnly: true })`, scratch script):

  | Table | Rows | Notes |
  | --- | --- | --- |
  | `artifacts` | 70 | 50 measured (36 local, 14 from the DGX archive), 20 synthetic; all `available` |
  | `runs`, `run_bundles` | 80, 80 | every bundle's `n_entities`/`n_links` equals its unpacked lengths |
  | `jobs`, `job_captures`, `job_events` | 12, 86, 2485 | 11 `done`, 1 `cancelled`; 2 captures name no artifact |
  | `evidence_archives` | 1 | `0daa394d…20c3`, 2,935,445 bytes, 55 files |
  | `datasets`, `dataset_images`, `dataset_annotations` | 1, 128, 799 | source `evidence:0daa394d…` |
  | `media` | 128 | all `image/jpeg`, 23,229,457 bytes |
  | `programs`, `annotations` | 0, 0 | |
  | `conversations`, `messages`, `llm_calls` | 5, 60, 30 | Perf Lab's assistant transcripts: not lab data, not imported |

- Recomputed every artifact's capture hash with Perf Lab's own `hash(stableStringify(spec))`
  (`PL/src/lang/util.ts`, run directly by Node): 70 of 70 match.
- Computed five cyrb53 vectors with Perf Lab's function, to pin the server's port of it in a test.

### Why

- The client survey decides which routes matter: the page reads `/catalog`, `/bundles`, `/evidence`, `/datasets`,
  `/datasets/:id`, `/media/:sha`, `/programs/:labId`, `/hosts/local/capabilities`, `/jobs`, `/health`, `/events`, and
  writes `/labs/:labId/seed`, `/programs/:labId` and the assistant routes.

### What worked

- Reading the real database read-only worked with the WAL present (`perf-lab.sqlite-wal`, 420 KB): the read sees the
  WAL's rows.

### What didn't work

- No failures in this step.

### What I learned

- The coordinator's "7.9 MB tar.gz" is the whole `PL/.data/evidence/` directory (the archive plus its extracted
  copy); the archive itself is 2.9 MB.
- `PL/.data/artifacts/` (1.9 MB, 402 files) holds the raw per-repetition output directories of local jobs
  (`<hash>/spec.json`, `<hash>/rep-N/*.json`). The runs and bundles in the database are their imported form; the
  programs read only the bundles.
- Perf Lab writes `media/<sha>.jpg|png` named by content, and its media rows carry the hash, so every media copy can
  be verified.

### What was tricky to build

- Nothing built yet. The constraint that shapes the most code is Kiln's rule that every non-GET request is
  `application/json` with the session token (`S/src/security.ts`): Perf Lab's `POST /evidence` takes the raw archive
  as the body, which Kiln's middleware refuses with 415.

### What warrants a second pair of eyes

- Opening a WAL database read-only still maps its `-shm` file; SQLite may update reader marks in it. That is the
  coordinator's prescribed call, and the alternative (copying the database first) is noted, not taken.

### What should be done in the future

- N/A for this step.

### Code review instructions

- None; reading only.

### Technical details

- Perf Lab's capture hash: `cyrb53(stableStringify(spec))`, 13–14 hex digits (`PL/src/lang/util.ts:2-34`).

## Step 2: The lab route group, migration 2, and the importer

I wrote the port as seven modules under `S/src/lab/`, appended one migration with the thirteen `lab_*` tables, and
mounted the group in `S/src/app.ts` with a two-line hunk. The routes keep Perf Lab's response shapes exactly; where
Kiln's security model forbids Perf Lab's request shape (the raw `.tar.gz` upload), the request changes and the response
does not. The importer copies `PL/.data` row for row, verifying each recorded identity first.

Against the real data the importer added 1 dataset, 1 archive, 128 media, 70 artifacts, 80 runs and 12 jobs in
0.38 s; a second run added nothing. I then served the same requests from Perf Lab's own `createApp` (over a copy of
its database) and from the new `/api/lab` group (over the import), and compared: 157 of 158 responses are identical in
status, content type and body, key order included; the one difference is the wording of the media 404's message.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`. **Coordinator assignment:** see Step 1 here.

**Assistant interpretation:** build the route group, the schema and the importer; prove the shapes against Perf Lab
itself rather than against my reading of it.

**Inferred user intent:** a client written for Perf Lab's server works against `/api/lab` with a base-path change.

**Commit (code):** none (this worker does not commit).

### What I did

- `S/src/db.ts`: migration 2 — `lab_programs`, `lab_artifacts`, `lab_runs`, `lab_run_bundles`, `lab_jobs`,
  `lab_job_captures`, `lab_job_events`, `lab_annotations`, `lab_evidence_archives`, `lab_datasets`,
  `lab_dataset_images`, `lab_dataset_annotations`, `lab_media`. Columns as in Perf Lab after its migration 5; three
  checks added: SHA-256 keys must be 64 lowercase hex digits (`length(x) = 64 and x not glob '*[^0-9a-f]*'`),
  `lab_media.mime in ('image/jpeg', 'image/png')`, `lab_annotations.author in ('user', 'assistant')`.
- `S/src/lab/files.ts`: the data layout under `KILN_DATA_DIR/lab/`, `sha256`, `mimeOf`, `writeFileAtomic`; every path
  builder refuses a name that is not a SHA-256.
- `S/src/lab/captures.ts`: `cyrb53`, `stableStringify`, `captureHash`, `validateCaptures` (Perf Lab's capture identity
  and checks, ported because the seed route and the importer both recompute capture hashes).
- `S/src/lab/tar.ts`: Perf Lab's tar reader, unchanged except for `noUncheckedIndexedAccess` (`h[i] ?? 0`).
- `S/src/lab/store.ts`, `datasets.ts`, `evidence.ts`: Perf Lab's store, datasets and evidence on the `lab_*` tables.
- `S/src/lab/routes.ts`: `labRoutes({config, db, bus})`.
- `S/src/lab/importer.ts` (`importPerfLab`, `formatSummary`, `refusedCount`) and `S/src/lab/import.ts` (the command
  line); `S/package.json` gains `"lab:import": "node src/lab/import.ts"`.
- `S/src/app.ts`: import and `api.route('/lab', labRoutes({ config, db, bus }))`; `FEATURES` gains `'lab'`; the `/api`
  no-store middleware leaves a `cache-control` that says `immutable` alone (lab media).
- `S/src/events.ts`: `EventType` gains `catalog.changed` and `evidence.registered`.
- `S/test/events.test.ts`, `S/test/security.test.ts`: the two assertions that list the health features and the
  migration count now expect `'lab'` and 2 migrations (the only edits to existing tests; both follow from the
  deliberate change, not from a regression).
- Ran the importer twice into a temporary directory, and a comparison script (scratch, not committed) that serves the
  same 158 GET requests from Perf Lab's `createApp` over a copy of `perf-lab.sqlite` (+ `-wal`, with `media/` and
  `evidence/` symlinked read-only) and from `labRoutes` over the imported database.

### Why

- **Evidence upload as JSON.** Kiln refuses every non-GET request that is not `application/json` (415) — the rule
  that forces a CORS preflight. So `POST /api/lab/evidence` takes `{name?, data: base64}` or `{name?, path}`. Base64 in a
  JSON body is bounded by the server's 32 MiB body limit (about 24 MiB of archive); a larger archive, up to Perf Lab's
  64 MiB, is registered by an absolute local path, which must end in `.tar.gz` or `.tgz` and name a regular file. The
  bytes then pass exactly the checks an upload passes. Changing the security middleware to admit `application/gzip`
  on one route was the alternative; it would have been the first exception to a rule the guide states without one.
- **Datasets before archives in the importer.** Datasets are copied row for row (their `added_at` and names are kept);
  then each archive is registered from its verified bytes with the same `registerArchive` an upload uses, whose COCO
  step finds the dataset present. One code path validates archives, whether they arrive by upload, path or import.
- **The dataset and archive row in one transaction.** Perf Lab registered the dataset in its own transaction before
  inserting the archive row; here `registerCocoDataset` is not transactional and `registerArchive` wraps both, so a
  failure leaves neither.
- **The capture hash is checked on import.** It is the identity Perf Lab recorded for each artifact; all 70 real ones
  verify, so the check costs nothing and refuses a tampered spec.
- **Interrupted jobs.** A job Perf Lab left `approved`, `running` or `importing` can never finish on a server that does
  not execute lab jobs; it is imported as `failed` with the error "not finished when imported from Perf Lab" and a
  `job.failed` event, which is what Perf Lab itself does at start-up (`failInterruptedJobs`). The real data has none.
- **A measured import replaces a synthetic stand-in** seeded here earlier, as Perf Lab's `insertArtifact` does.
- **Media cache headers.** Perf Lab serves media `public, max-age=31536000, immutable`; Kiln's `/api` middleware
  overwrote every response's `cache-control` with `no-store`. The middleware now keeps a header that declares
  `immutable` (only the media route sets one), so every other response is unchanged (SSE included).
- **Media are verified when served.** `readMedia` hashes the bytes before sending them; a file changed on disk is
  `500 corrupt_media`, never a wrong image under a content address.

### What worked

- `pnpm --filter @kiln/server typecheck` clean on the first run of the new modules.
- Real import (into `scratchpad/kiln-lab-import-ejGZ0H`):

  ```text
    kind           added  present  refused
    datasets           1        0        0
    archives           1        0        0
    media            128        0        0
    artifacts         70        0        0
    runs              80        0        0
    jobs              12        0        0
    programs           0        0        0
    annotations        0        0        0

    verified bytes written: archives 2,935,445, media 23,229,457
    not imported (assistant transcripts are not lab data): conversations 5, messages 60, llm_calls 30
  ```

  The second run: every kind 0 added, all present, 0 bytes written, exit 0.
- `shasum -a 256` of `PL/.data/perf-lab.sqlite` and `perf-lab.sqlite-wal` is unchanged across the import
  (`f0e3c124…b6d6`, `cd649f33…4c71`).
- The comparison: `{ catalog: 70, artifacts: 70, media: 128, same: 157, differing: 1 }`. Compared: `/catalog`, all 70
  artifacts' bundles in batches of 16 (key order compared too), `/evidence` and its archive, `/datasets` and its
  detail, `/jobs`, each job, `/jobs?lab=dino-pr1005` (event ids ignored, see below), `/annotations` for both labs, a
  missing program, a missing archive and dataset, all 128 media (status, content type, bytes) and a missing medium.

### What didn't work

- `pnpm -s lab:import` (to silence pnpm's banner) printed `For more information, try '--help'.` and ran nothing: pnpm
  12 does not take `-s` there. Ran `pnpm lab:import` instead.
- The comparison script first failed under `tsx` with `ERROR: Top-level await is currently not supported with the
  "cjs" output format` (15 errors): a `.ts` file outside a `"type": "module"` package is compiled as CommonJS. Renamed
  it `.mts`.
- The one differing response: `GET /media/000…0` → both `404 not_found`; Perf Lab says "no such media; materialize
  its dataset first", the port says "import its dataset first (pnpm --filter @kiln/server lab:import)", because
  materialize is not ported. Deliberate.

### What I learned

- Every read-only open of `perf-lab.sqlite` updates the mtime of `perf-lab.sqlite-shm` (16:53 → 16:58 across the
  first import): SQLite's WAL index is shared memory that readers also write their read marks into. The database and
  WAL bytes do not change. Avoiding even that needs a copy of the database and WAL opened elsewhere; the coordinator
  prescribed `readOnly: true` on the file itself, so that is what the importer does, and this is reported.
- Job event ids are Perf Lab's global autoincrement; the import gives them new ids in the same order. Perf Lab's
  client ignores event ids (`fromServerJob` keeps `at`, `kind`, `detail`), so they are not preserved.

### What was tricky to build

- The `cache-control` exception. The first version kept any `cache-control` a route set, which silently changed the
  SSE stream's header (Hono's `streamSSE` sets `no-cache`, which the middleware used to overwrite with `no-store`).
  Keying the exception on the word `immutable` leaves every existing response as it was.
- The importer's refusal semantics: one bad row must not stop the rest, and nothing that failed a check may be half
  stored. Datasets, runs (with their bundle) and jobs (with captures and events) are each one transaction; archive and
  media files are written whole (temporary file and rename) before their row, and an archive's files are removed
  again if its registration fails.

### What warrants a second pair of eyes

- `POST /api/lab/evidence {path}` lets the page (with the token) make the server read a local `.tar.gz`. The response
  lists the archive's entry names and sizes, so it reveals the contents of a tar archive the user names; it cannot
  read other kinds of file (gzip magic and tar validation come first) or write outside `lab/evidence/<sha256>/`.
- The `-shm` observation above.

### What should be done in the future

- See the "As built" section for what a lab-execution phase needs.

### Code review instructions

- Start at `S/src/lab/routes.ts`, then `importer.ts`; the schema is the second entry of `MIGRATIONS` in `S/src/db.ts`.
- `KILN_DATA_DIR=$(mktemp -d) pnpm --filter @kiln/server lab:import` (twice).

### Technical details

- Real archive: `0daa394d641cfbec091824be41eb153dcc367ca9038d038ca7ee395926ef20c3`, 2,935,445 bytes, 55 files;
  dataset `c435d426e9d2d44aff1fcdc457b1705612eca0bfa17c7aed4efbf035114df74c` (128 images, 799 annotations).
- Kiln data dir after the import: 32 MB (`lab/evidence` 7.9 MB = archive + 55 extracted files; `lab/media` 22 MB).

## Step 3: Tests — route contracts, security refusals, and the importer on a synthetic Perf Lab directory

The tests follow guide §36: in-memory SQLite and temporary directories, nothing read from `PL/.data` or
`apps/server/.data`. `S/test/lab.test.ts` drives the route group through the real application (`makeServer`, so every
request passes the security middleware); `S/test/lab-import.test.ts` builds a Perf Lab data directory at Perf Lab's
schema 5 from scratch (`S/test/support/lab.ts`) and imports it. Writing them found one real gap, inherited from Perf
Lab: a gzip-compressed blob that is not a tar archive registered as an archive with no files.

Final count: 10 files, 87 tests (62 existing, 18 route tests, 7 importer tests), typecheck clean.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`. **Coordinator assignment:** see Step 1 here.

**Assistant interpretation:** prove the contracts, the refusals, idempotency and the checksum refusal without the real
data.

**Inferred user intent:** the port stays correct after this worker leaves.

**Commit (code):** none.

### What I did

- `S/test/support/lab.ts`: `writeTar` (Perf Lab's fixture writer, with hostile entry types), `cocoArchive`/`cocoManifest`
  (the two-image COCO selection Perf Lab's own test uses), `capture`/`bundle`/`insertMeasured`/`insertMedia`, and
  `makePerfLabDir()` — Perf Lab's schema 5 tables, two measured local captures with two repetitions each, a synthetic DGX
  capture, the archive file and its row, the dataset rows, both images in `media/`, a finished job and a job left
  `running`, a program, an annotation, and one conversation, message and `llm_calls` row.
- `S/test/lab.test.ts` (18 tests): cyrb53 pinned to five vectors computed with Perf Lab's own function; seeds (never
  `local`, never an evidence capture, `catalog.changed`), forged capture hash 409 and six malformed captures 400;
  bundles (order, `__value` records, unknown hash `[]`, 64-hash cap); programs; annotations; read-only jobs in the exact
  `JobView` shape and 501 for create/approve/cancel; hosts; evidence by base64 (201, then 200, extracted files, the
  dataset detail in full, `present` flipping when an image arrives, materialize 501); evidence by path and eleven
  refused request shapes; ten hostile or invalid archives leaving no row, no file and no event; media served with
  type, `immutable` and `nosniff` while other `/api` responses stay `no-store`; fourteen malformed or traversing media
  names (`..%2F..%2Fsecret.jpg`, `%2e%2e%2f…`, `..%5c…`, `%00`, uppercase, 63 and 65 digits, `.jpg` suffix, …), none
  serving a byte of a planted `secret.jpg`; a tampered media file → 500 `corrupt_media`; the schema's CHECKs; and the
  four checks on seven lab GETs and six lab writes (foreign Host, `Origin: null` and foreign Origin, no or wrong token,
  `application/gzip`), with nothing changed afterwards.
- `S/test/lab-import.test.ts` (7 tests): the import end to end through the routes; idempotency (second run: nothing
  added, no row count or file — hash and mtime — changed); the source opened read-only with its files `0444` and its
  directories `0555`, byte- and mtime-identical afterwards; refusals (a flipped media byte → "checksum mismatch", a
  truncated medium → size, a flipped archive byte → "checksum mismatch", a changed spec → "the spec hashes to …" and
  both its runs "its artifact was not imported", a wrong `n_entities` → the bundle count), with nothing refused stored
  and a repaired source then supplying exactly the refused items; a synthetic stand-in replaced by a measured capture;
  missing source, schema 4, and a Kiln data directory inside the source (also through a symbolic link); the command
  line's output and exit statuses 0, 1, 2 and `--help`.

### Why

- The route tests run through `createApp`, not `labRoutes` alone, so that the security middleware, the body limit,
  the `/api` cache header and the mount are all part of what is tested.
- The importer's fixture writes Perf Lab's schema as SQL in the test support rather than importing
  `PL/server/db.ts`: the importer's contract is "schema 5", and the fixture states it without coupling the Kiln tests
  to Perf Lab's tree.

### What worked

- `pnpm --filter @kiln/server test` → `Test Files 10 passed (10)`, `Tests 87 passed (87)`.
- `pnpm --filter @kiln/server typecheck` → clean.

### What didn't work

- First run of `lab.test.ts`: 3 of 18 failed.
  - `refuses hostile and invalid archives`: `expected [ 201, undefined ] to deeply equal [ 400, 'bad_archive' ]` —
    `gzipSync('plain text, gzip-compressed')` was **accepted** as an archive. Perf Lab's reader loops
    `while (off + 512 <= length)`; 27 bytes run no iteration, so the "archive" has zero entries and registers. Fixed
    in `S/src/lab/tar.ts` (refuse a decompressed length that is not a whole number of 512-byte blocks) and
    `S/src/lab/evidence.ts` (refuse an archive that holds no files); three cases added. Perf Lab has the same gap.
  - Two failures from my assumption that an unknown `/api/...` path answers the JSON `{error: 'not_found'}` of
    `api.notFound`. A probe showed `/api/nope`, `/api/agent/nope` and `/api/lab/nope` all answer
    `404 text/plain "not found\n"`: Hono runs `notFound` on the top-level app only, so the `/api` sub-app's handler is
    never called. This predates the phase; I adjusted the tests (status 404, no image content type, no secret bytes)
    rather than change `app.ts` further.
- First run of `lab-import.test.ts`: 2 of 7 failed, both test mistakes — the fixture's images are 11 and 9 bytes, not
  2 × 11; and refusals are listed in the importer's order (media by SHA-256), not the fixture's.
- Adding the symbolic-link case first broke the "inside" guard for a data directory that does not exist yet: on macOS
  `tmpdir()` is `/var/folders/…`, a link to `/private/var/folders/…`, so `realpathSync` of the source and a plain
  `resolve` of the non-existent target disagreed. The guard now resolves the nearest existing ancestor.

### What I learned

- Unknown `/api` routes are text 404s server-wide (see above); worth fixing in `app.ts` by whoever owns it.

### What was tricky to build

- Proving "never writes to the source": the test makes the whole fixture tree read-only, which only works because a
  read-only open of a rollback-journal database needs no `-journal`, `-wal` or `-shm`. The real `PL/.data` is in WAL
  mode, where SQLite does touch `-shm` (Step 2); the test cannot reproduce that without a WAL fixture, and a WAL
  database in a read-only directory cannot be opened at all unless its `-shm` already exists.

### What warrants a second pair of eyes

- The tar strictness is a deliberate deviation from Perf Lab; the real archive passes it.

### What should be done in the future

- Move the JSON 404 from `api.notFound` to `app.notFound` for `/api/` paths (outside this phase's hunk).

### Code review instructions

- `pnpm --filter @kiln/server test test/lab.test.ts` and `… test/lab-import.test.ts` (a file is a plain argument,
  never after `--`).

### Technical details

- cyrb53 vectors (from `PL/src/lang/util.ts`): `''` → `bdcb81aee8d83`; `'a'` → `1c2ba782c97901`; `('hello', 7)` →
  `12779cb81098a8`; `captureHash({})` → `1bc27f5a56d1e7`.

## Step 4: Final validation, the real import, and the as-built record

With the code final I imported the real data once more into a fresh temporary directory, re-ran the import to show it
adds nothing, re-ran the comparison against Perf Lab's own server, and ran the whole workspace's tests. Everything of
this phase is green; the workspace run fails only in `packages/lab`, which the 8a worker is building at the same time.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`. **Coordinator assignment:** see Step 1 here.

**Assistant interpretation:** the required final runs, and notes precise enough to fold into the guide.

**Inferred user intent:** know exactly what exists, what it answers, and what is still missing.

**Commit (code):** none.

### What I did

- `KILN_DATA_DIR=<scratch>/kiln-lab-final-QB9apv pnpm lab:import` (from `S/`), twice; `shasum -a 256` of the source
  database and WAL before and after; the comparison script against the fresh import.
- `pnpm --filter @kiln/server test`, `pnpm --filter @kiln/server typecheck`, `pnpm test` at the root, and
  `pnpm -r --no-bail --workspace-concurrency=1 test` to see every package (the root script stops at the first failure).
- Checked argument passing: `pnpm --filter @kiln/server lab:import <absolute path>` and `… ../../lab-workbench/.data`
  both reach the script.

### What worked

- Real import, first run: datasets 1, archives 1, media 128, artifacts 70, runs 80, jobs 12 added; programs and
  annotations 0 (Perf Lab has none); 0 refused; verified bytes written: archives 2,935,445, media 23,229,457; not
  imported: conversations 5, messages 60, llm_calls 30. Exit 0. Second run: everything `present`, 0 bytes, exit 0.
  The result: `kiln.sqlite` 1.7 MB, `lab/evidence` 7.9 MB, `lab/media` 22 MB.
- Source database and WAL SHA-256 unchanged (`f0e3c124…b6d6`, `cd649f33…4c71`).
- Comparison against Perf Lab's server: 157 of 158 identical (the media 404 wording differs, as in Step 2).
- `pnpm --filter @kiln/server test`: 10 files, 87 tests passed. Typecheck clean.
- Workspace, no bail: `@kiln/evidence` 9 files / 125 tests passed; `@kiln/kiln` all 10 scripts passed; `@kiln/server`
  87 passed; `@kiln/workbench` all 5 passed.

### What didn't work

- `pnpm test` at the root exits 1: `packages/lab` (8a, in progress) fails to load 3 test files —
  `Error: Cannot find package '@/data/capabilities' imported from …/packages/lab/test/build.test.ts`, the same for
  `@/data/env` in `evidence.test.ts`, and `Cannot find module './__fixtures__/quality-golden.json'` in
  `detections.test.ts`. Not this phase's files; left to 8a.

### What I learned

- N/A beyond the earlier steps.

### What was tricky to build

- N/A.

### What warrants a second pair of eyes

- See "Open issues" below.

### What should be done in the future

- See "Lab job execution: what a later phase needs" below.

### Code review instructions

- `pnpm --filter @kiln/server test && pnpm --filter @kiln/server typecheck`
- `KILN_DATA_DIR=$(mktemp -d) pnpm --filter @kiln/server lab:import` (twice).

### Technical details

See "As built" below.

## As built (Phase 8c)

### Files

| File | Role |
| --- | --- |
| `S/src/lab/routes.ts` | `labRoutes({config, db, bus})`: the `/api/lab` group; `EXECUTABLE_HOSTS = {'local'}` |
| `S/src/lab/store.ts` | programs, artifacts (`catalog`, `insertArtifact`, `seedSynthetic`), bundles (`pack`, `unpack`, `bundlesFor`), read-only jobs (`getJob`, `listJobs`), annotations |
| `S/src/lab/evidence.ts` | `registerArchive`, `readArchivePath`, `listArchives`, `getArchive`; `MAX_ARCHIVE_BYTES` = 64 MiB |
| `S/src/lab/datasets.ts` | `registerCocoDataset` (non-transactional), `listDatasets`, `getDataset`, `readMedia`, `publicFetchUrl` |
| `S/src/lab/tar.ts` | the tar reader; stricter than Perf Lab's (whole blocks, at least one file) |
| `S/src/lab/captures.ts` | `cyrb53`, `stableStringify`, `captureHash`, `validateCaptures`, `splitRef` |
| `S/src/lab/files.ts` | data layout, `sha256`, `mimeOf`, `writeFileAtomic`; path builders refuse non-SHA-256 names |
| `S/src/lab/importer.ts` | `importPerfLab({source, db, dataDir})`, `formatSummary`, `refusedCount`; `PL_SCHEMA = 5` |
| `S/src/lab/import.ts` | the `lab:import` command line |
| `S/src/app.ts` | mount at `/api/lab`; `FEATURES` + `'lab'`; `/api` keeps a `cache-control` containing `immutable` |
| `S/src/db.ts` | migration 2 |
| `S/src/events.ts` | `EventType` + `catalog.changed`, `evidence.registered` |

### Routes (all under `/api/lab`, behind Host/Origin/token/JSON; errors `{error, message}`)

| Method and path | Request | Response | Perf Lab difference |
| --- | --- | --- | --- |
| `GET /catalog` | | `{[hash]: {origin, source, ref, host, reps, labId, importedAt}}` (status `available` only) | none |
| `POST /labs/:labId/seed` | `{captures: [{hash, ref, host, reps, spec}]}` | `{seeded}`; emits `catalog.changed {labId}` if > 0; `409 spec_hash_mismatch {…, ref}`; `400 bad_request` | `local` is never seeded although nothing executes here |
| `GET /bundles?hashes=a,b,…` | | `{[hash]: [{run, entities, links}]}` (rep order; ≤ 64 hashes; unknown → `[]`) | none |
| `GET /programs/:labId` | | `{labId, source, presetHash, updatedAt}`; `404 not_found` | none |
| `PUT /programs/:labId` | `{source (≤ 500,000 chars), presetHash?}` | `{ok: true}`; `400` | none |
| `DELETE /programs/:labId` | | `{ok: true}` | none |
| `GET /annotations?lab=` | | `[{id, lab_id, target, kind, body, author, created_at}]` | none |
| `POST /annotations` | `{labId, target, kind, body?, author?}` | `201 {id}`; author is `'assistant'` only if claimed, else `'user'` | none |
| `GET /evidence` | | `[{sha256, name, bytes, files: [{path, bytes}], addedAt, datasets: [id]}]` | none |
| `GET /evidence/:sha` | | one summary; `404 not_found` | none |
| `POST /evidence` | `{name?, data: base64}` or `{name?, path: absolute .tar.gz/.tgz}`; `?name=` also read | `201` summary (new; emits `evidence.registered {sha256, name, datasets}`), `200` (known); `400 bad_request` / `bad_archive`; `413 too_large` | Perf Lab took the raw `.tar.gz` body; path registration is new; zero-file and non-tar gzip refused |
| `GET /datasets` | | `[{id, name, format, privacy, source, categories, imageCount, annotationCount, present, addedAt}]` | none |
| `GET /datasets/:id` | | summary + `provenance`, `images: [{imageId, fileName, sha256, width, height, license, licenseUrl, sourceUrl, pageUrl, strata, negative, present}]`, `annotations: [{id, imageId, label, bboxPx, area, iscrowd}]`; `404` | none |
| `POST /datasets/:id/materialize` | | `501 not_implemented` | Perf Lab fetched images from COCO's S3 |
| `GET /media/:sha` | | bytes, `content-type` from the row, `cache-control: public, max-age=31536000, immutable`; `400 bad_request` (not 64 lowercase hex), `404 not_found`, `500 corrupt_media` (bytes no longer hash to the name) | 404 message names `lab:import`; bytes re-verified on every read; 500 is new |
| `GET /jobs?lab=` , `GET /jobs/:id` | | `[JobView]` / `JobView` = the job row + `captures` (without `spec_json`) + `events [{id, at, kind, detail}]`; `404` | events get new ids on import |
| `POST /jobs`, `/jobs/:id/approve`, `/jobs/:id/cancel` | | `501 not_implemented` | Perf Lab ran jobs |
| `GET /hosts` | | `[{host:'local', executor:'none', synthetic:false, available:false, error}, {host:'playback@dgx'…, executor:'synthetic', synthetic:true, available:true}]` | `local` is unavailable, executor `'none'` |
| `GET /hosts/:host/capabilities` | | `503 no_probe` for `local`; `404 not_found` otherwise | Perf Lab probed with `uv run … perf_lab_local.probe` |

Not provided: `/api/lab/health` (Kiln's `GET /api/health` lists `'lab'` in `features`), `/api/lab/events` (lab events
arrive on `/api/events` under Perf Lab's names), the assistant routes. Unknown `/api/lab/*` paths answer the page's
text 404, like every unknown `/api` path.

### Schema (migration 2 of `S/src/db.ts`)

Perf Lab's tables after its migration 5, prefixed `lab_`: `lab_programs`, `lab_artifacts` (+ index on `lab_id`),
`lab_runs` (PK `(hash, rep)`, FK to artifacts, index on `ref`), `lab_run_bundles` (gzip-JSON `entities`/`links` blobs,
FK to runs), `lab_jobs` (statuses `proposed approved running importing done failed cancelled`, `proposed_by in ('user',
'assistant')`), `lab_job_captures`, `lab_job_events`, `lab_annotations`, `lab_evidence_archives`, `lab_datasets`,
`lab_dataset_images` (+ index on `sha256`), `lab_dataset_annotations`, `lab_media`. Added CHECKs: archive, dataset,
image and media hashes are 64 lowercase hex digits; `lab_media.mime in ('image/jpeg','image/png')`;
`lab_annotations.author in ('user','assistant')`. No transcript tables.

### Data layout

`$KILN_DATA_DIR/lab/evidence/<sha256>.tar.gz`, `$KILN_DATA_DIR/lab/evidence/<sha256>/…` (extracted),
`$KILN_DATA_DIR/lab/media/<sha256>.jpg|png`.

### Importer

`KILN_DATA_DIR=… pnpm --filter @kiln/server lab:import [perf-lab-data-dir]` (default `lab-workbench/.data`).

1. Refuse when `perf-lab.sqlite` is missing, when Perf Lab's schema is below 5, or when the Kiln data directory is the
   source or below it (symbolic links resolved). Open the source `new DatabaseSync(file, { readOnly: true })`.
2. **Datasets** row for row (dataset, images, annotations in one transaction) if absent; refuse a non-SHA-256 id or
   row counts that differ from `image_count`/`annotation_count`.
3. **Archives**: the file `evidence/<sha>.tar.gz` must have the recorded size and hash; then `registerArchive` with the
   recorded name and `added_at` (validation, extraction, COCO registration — which finds the dataset present). A file
   list that differs from Perf Lab's `files_json` is noted; the verified bytes' list is kept.
4. **Media**: `media/<sha>.<ext>` must have the recorded size, hash and image type; written atomically, then the row.
   A known row whose file verifies is `present`; a known row with a missing or bad file is re-copied.
5. **Artifacts**: `captureHash(spec)` must equal the hash; inserted verbatim; a synthetic row here is upgraded to a
   measured one from Perf Lab (noted); otherwise `present`.
6. **Runs**: only for imported artifacts, only with a bundle that gunzips to arrays of the recorded lengths; run and
   bundle in one transaction; blobs copied byte for byte.
7. **Jobs**: row, captures and events in one transaction, if absent; `approved`/`running`/`importing` become `failed`
   ("not finished when imported from Perf Lab", plus a `job.failed` event).
8. **Programs** if absent (an edit here is never overwritten); **annotations** unless an identical row exists.
9. Count `conversations`, `messages`, `llm_calls` as not imported. Print the summary; exit 0, 1 (refusals), 2 (unreadable).

Not imported, deliberately: Perf Lab's assistant transcripts (`conversations`, `messages`, `llm_calls` — the agent's
conversations are not lab data, and Kiln accounts its own model calls in its own `llm_calls`), the raw job output
directories `PL/.data/artifacts/` (1.9 MB, 402 files; the runs and bundles are their imported form, and nothing reads
them without execution), and `PL/.data/inductor-cache/`.

### Lab job execution: decision and what a later phase needs

Decision: lab jobs are ported **read-only** — the 12 imported jobs, their captures and their 2,485 events are listed in
Perf Lab's `JobView` shape, and every route that would start or change a job answers 501. Execution maps onto Kiln's job
model (guide §30.4–30.5) as follows:

- **One queue.** Kiln's `Jobs` runs one job at a time, and Perf Lab's rule is one benchmark process at a time; a lab job
  must take the same queue (or lock) as a CUDA job, not a second runner beside it.
- **Proposer from the header.** Perf Lab trusts `proposedBy` in the body (P-1). The port should take
  `X-Kiln-Proposer: user | agent` as `POST /api/jobs` does, never create an agent job approved, approve only with the
  token, and count agent lab jobs against the executor-seconds budget. `lab_jobs.proposed_by` keeps Perf Lab's
  `'assistant'` for imported rows; map `agent` to it, or migrate the column.
- **States.** Perf Lab's `importing` state sits between `running` and `done`; Kiln's state machine lacks it and would
  need it (or fold it into `running`).
- **Executors.** A lab executor runs one repetition of one capture: `uv run --project workloads python -m
  perf_lab_local.run --spec … --rep … --out …` locally (Perf Lab's `processExecutor`), or the SSH container executor
  ML-PERF-003 designs for the DGX. Kiln's `Executor` interface runs a `KilnBundle`, so either a second interface
  (`runCapture(capture, rep, signal)`) with profiles in `executors.json` keyed by Perf Lab host names, or an adapter.
  Add the per-repetition timeout Perf Lab lacks; cancellation is the abort signal killing the process.
- **Import after each repetition.** `importRepetition` (`PL/server/importer.ts`) and `importQualification`/`runDino…`
  (`qualification.ts`, `dino.ts`) need Perf Lab's value constructors, which `@kiln/lab` (8a) will provide; outputs go to
  `$KILN_DATA_DIR/lab/artifacts/<hash>/rep-N/`; evidence-backed captures read the extracted archive under
  `lab/evidence/<sha>/` (Perf Lab's `archiveFile`).
- **Events.** Kiln's page reads `job.updated` as Kiln's `JobView`; lab job events need their own names (e.g.
  `lab.job.updated`) or a discriminator, plus `artifact.imported`.
- **Seeding.** `EXECUTABLE_HOSTS` should come from the configured lab executors; then the `/hosts` answer becomes real.
- **Start-up.** Fail interrupted lab jobs as Perf Lab's `failInterruptedJobs` does.

### Open issues

1. ~~A read-only open of the real WAL database updates the mtime of `PL/.data/perf-lab.sqlite-shm` (SQLite's WAL index);
   the database and WAL bytes are unchanged (SHA-256 checked). Opening a copy instead would avoid even that.~~
   Fixed in review (main session, 2026-10-19): with no writer attached, an in-place read-only open rewrites the `-shm`
   index's bytes as well as its time (reproduced on copies). `importPerfLab` now copies `perf-lab.sqlite` and its
   `-wal` to a temporary directory and opens the copy. A new test leaves a fixture as Perf Lab leaves it (database,
   `-wal` and `-shm`, no writer) and compares every file's SHA-256 and mtime before and after; it fails against the
   in-place open and passes against the copy. The real import, rerun, leaves the three files' bytes, sizes and mtimes
   unchanged.
2. Unknown `/api/*` routes answer `404 text/plain "not found"`: `api.notFound` in `S/src/app.ts` never runs (Hono calls
   `notFound` on the top-level app only). Pre-existing.
3. A base64 upload is capped near 24 MiB by the 32 MiB body limit; larger archives go by path.
4. No outbound fetch: an image missing from the media store can only arrive by importing it.
5. A page open during an import is not notified; it sees the new data after a reload.
6. `pnpm test` at the root stops in `packages/lab` (8a in progress; Step 4).
