# Perf Lab backend analysis: work diary

This is the chronological diary of the subagent that wrote `02-perf-lab-backend-notes.md` (same directory) for
KILN-001. The brief asked for a detailed technical analysis of the Perf Lab backend at
`/Volumes/SSD/code/kiln/lab-workbench`, read-only on the code and the SQLite database, with no installs and no
long-running servers. All times are UTC on 2026-10-19 (the transcript's timestamps; local time was UTC−4, which is why
vitest prints "Start at 13:38:31"). Nothing was committed; the parent session commits.

## Step 1: Orientation in the workbench

I started by finding out what the backend is made of before reading any one file: the directory listing, the package
scripts, the README, the Vite configuration and the Python project layout. The aim was to know which processes exist
and how they are started, so the later reading had a frame.

The workbench is a standalone pnpm package with a React front end and a `server/` directory run through `tsx`, plus a
`workloads/` uv project. The server is a separate process from Vite, connected by a `/api` proxy.

### What I did

- 17:37:22 `cd /Volumes/SSD/code/kiln/lab-workbench && ls -la && … ls -la server server/assistant scripts workloads .data … && cat package.json`
- 17:37:25 `cat README.md .gitignore vite.config.ts tsconfig.json pnpm-workspace.yaml` and `ls -R workloads` (excluding `.venv`)

### What worked

- `package.json` shows the process model directly: `lab-server = tsx server/index.ts`, `lab = tsx scripts/lab.ts`,
  `dev = vite`. `vite.config.ts` pins Vite to 127.0.0.1:5199 and proxies `/api` to 127.0.0.1:5198.

### What didn't work

- Nothing failed in this step.

### What I learned

- The server runs TypeScript directly through `tsx`. That is how it imports the browser language's pure modules
  (`src/lang/util.ts` and others) without a build step. The consequence for the guide: the browser and server share
  the capture-hash function.
- `.data/`, `node_modules/` and `workloads/.venv` exist on disk but are gitignored.

### What warrants a second pair of eyes

- Nothing yet.

## Step 2: Reading the server core (entry, config, routes, schema, store, hashing)

I read every server module in full with line numbers (`nl -ba`), in dependency order. The guide needs `file:line`
citations, and these files are short enough that skimming would cost more than reading.

The important finding here was that the capture hash is cyrb53, not SHA-256. The spec fields named `*_sha256` hold
cyrb53 values too (confirmed in step 4).

### What I did

- 17:37:28 `nl -ba index.ts config.ts events.ts bundles.ts probe.ts` (in `server/`)
- 17:37:28 `nl -ba app.ts`
- 17:37:30 `nl -ba db.ts`
- 17:37:33 `nl -ba store.ts`
- 17:37:36 `grep -n "export function hash\|…\|createHash" src/lang/util.ts; nl -ba src/lang/util.ts | sed -n '1,80p'`

### What worked

- `app.ts` is the whole HTTP surface in 286 lines. Every route, status code and event emission could be cited directly.
- `db.ts` holds the five migrations inline, with comments explaining why each exists. Migration 3, for example,
  re-keys `runs` to `(hash, rep)` because the 1,024-query runs had overwritten the 2,048-query ones.

### What didn't work

- Nothing failed.

### What I learned

- The server recomputes `hash(stableStringify(spec))` and refuses a mismatch (`app.ts:50-64`). This is the integrity
  check, but cyrb53 is 53-bit and non-cryptographic.
- `failInterruptedJobs` only touches the `jobs` table (`store.ts:254-261`).
- There is no auth, CORS or Origin middleware anywhere.
- The bind address is hard-coded to 127.0.0.1 (`config.ts:28`).

### What warrants a second pair of eyes

- Calling cyrb53 a "content address" is a naming and strength question for the Kiln merge. Kiln may want SHA-256 for
  capture identity.

## Step 3: Runner, importers, evidence, datasets and the dino path

Next came the execution and import half: `runner.ts`, `importer.ts`, `evidence.ts`, `tar.ts`, `qualification.ts`,
`datasets.ts` and `dino.ts`. This is the code the guide must explain as pseudocode, so I read for control flow.
Specifically: grouping, the paired shuffle, when a run becomes invalid, and what happens on failure.

### What I did

- 17:37:38 `nl -ba runner.ts`
- 17:37:41 `nl -ba importer.ts`
- 17:37:44 `nl -ba evidence.ts tar.ts`
- 17:37:48 `nl -ba qualification.ts`
- 17:37:52 `nl -ba datasets.ts`
- 17:37:54 `nl -ba dino.ts`

### What worked

- The paired order (`runner.ts:302-310`) is a per-repetition Fisher–Yates shuffle with `rng("<seed>:<rep>")`, which
  made it easy to state as pseudocode.
- `tar.ts` is a small, careful reader: it verifies checksums, refuses `..` and absolute paths, and accepts regular
  files and directories only.

### What didn't work

- Nothing failed.

### What I learned

- Validity and quality are separate. A run is invalid only for a non-zero exit or an activation miss. A failed quality
  gate makes it "unqualified".
- The sampler path stores a failed repetition as an invalid run before failing the job. The dino path throws before
  importing (`dino.ts:109`).
- No `spawn` passes a timeout.
- `playbackRepo()` falls back to `git rev-parse --show-toplevel` of the lab directory (`dino.ts:34-38`).

### What warrants a second pair of eyes

- The dino workload `git show`s whatever revision string the spec carries, then imports that code. I did not test
  argument injection through a revision beginning with `-`; that claim is inferred.

## Step 4: Assistant backend, CLI and Python workloads

This covered the remaining backend code: the pi-based assistant (`model.ts`, `prompt.ts`, `service.ts`), the
`scripts/lab.ts` CLI, and the three Python entry points. For Python I read for what each script takes from the spec,
what it writes, and which exit codes it uses.

### What I did

- 17:37:57 `nl -ba model.ts prompt.ts` (in `server/assistant/`)
- 17:38:00 `nl -ba service.ts`
- 17:38:03 `nl -ba scripts/lab.ts`
- 17:38:07 `cat pyproject.toml .python-version; nl -ba perf_lab_local/run.py`
- 17:38:12 `nl -ba perf_lab_local/sampler.py perf_lab_local/probe.py`
- 17:38:14 `nl -ba perf_lab_dino/run.py`

### What worked

- `model.ts` explains the system-role override in code: `PERF_LAB_SYSTEM_ROLE_PROVIDERS` defaults to `lunaroute`, and
  for those providers the model copy gets `supportsDeveloperRole: false` (lines 71-75, 122).
- `run.py` documents its own output files and exit codes (2 for an unknown impl, 3 for an unsupported mode).

### What didn't work

- Nothing failed.

### What I learned

- The quality gate that runs is hard-coded in Python: max-abs-diff against eager `unfused`, with tolerance 1e-5 or
  1e-2 (`run.py:161-168`). The program's declared gate contributes only its hash.
- The dino `run.py` does no `torch.cuda.synchronize()`, and it writes `gpu` and the CUDA peaks as null. That is
  correct on the Mac and wrong on a GPU; ML-PERF-003 §6.13 already lists it.
- The assistant never runs model-written code on the server. The browser runs it.

### What warrants a second pair of eyes

- `prompt.ts:35` truncates the board-context JSON at 12,000 characters, which can cut mid-token. Whether this hurts
  answer quality in practice was not measured.

## Step 5: Checking test safety, then running the tests

The brief said to check that tests do not write to `.data/perf-lab.sqlite` before running them. I grepped every test
file for `openDb`, `dataDir`, `mkdtemp` and `:memory:`. Then I read the `server.test.ts` harness and checked the
external fixture the DGX tests need, and only then ran vitest.

### What I did

- 17:38:21 `grep -n "openDb\|loadConfig\|dataDir\|mkdtemp\|tmpdir\|:memory:\|perf-lab.sqlite\|describe(\|it(\|test(" server.test.ts evidence.test.ts qualification.test.ts assistant.test.ts`
- 17:38:24 `sed -n 1,70p server.test.ts && sed -n 120,215p server.test.ts && grep -n "DGX\s*=" evidence.test.ts qualification.test.ts`
- 17:38:29 `ls ~/code/tulip/playback-vault/…/pr1005-dgx-20261012/evidence-final.tar.gz; timeout 300 pnpm exec vitest run server 2>&1 | tail -60`
- 17:38:35 `timeout 300 pnpm exec vitest run server --reporter=verbose 2>&1 | grep -E "✓|✗|×|↓|skip"`
- 17:42:53 `timeout 300 pnpm exec vitest run 2>&1 | tail -8` (the whole workbench, after confirming the front-end tests are pure)

### What worked

- Every server test uses `openDb(':memory:')` and `mkdtempSync(tmpdir())`, so running them was safe.
- Server tests, verbatim:

  ```text
   Test Files  4 passed (4)
        Tests  33 passed (33)
     Start at  13:38:31
     Duration  604ms (transform 267ms, setup 0ms, import 558ms, tests 741ms, environment 0ms)
  ```

- Whole workbench, verbatim:

  ```text
   Test Files  11 passed (11)
        Tests  104 passed (104)
     Start at  13:42:55
     Duration  2.15s (transform 5.35s, setup 0ms, import 6.23s, tests 3.09s, environment 5ms)
  ```

  It also printed `(node:26322) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.`

### What didn't work

- Nothing failed.
- I deliberately did not run `pnpm typecheck` / `tsc -b`, because it writes `tsconfig.tsbuildinfo`, a repository
  write the brief forbids.

### What I learned

- Three test blocks need the DGX archive from the vault: one `it.skipIf` in `evidence.test.ts:144`, and two
  `describe.skipIf` blocks in `qualification.test.ts:45, 125`. The archive is present here, so nothing was skipped.
- Temporary directories leak: `afterEach(() => dirs.splice(0))` (`server.test.ts:22`) empties the list but never
  removes the directories.
- There are no Python tests.

### What warrants a second pair of eyes

- In a fresh checkout without the vault, the evidence path loses its only end-to-end coverage and the run still shows
  green. CI for Kiln should vendor a small archive instead.

## Step 6: Read-only inspection of the SQLite database

I opened `.data/perf-lab.sqlite` only with `sqlite3 -readonly`, and later with Python's `file:…?mode=ro` URI. From it I
listed the tables, migrations, row counts and indexes, then the jobs and artifacts, then one full spec.

### What I did

- 17:38:41 `sqlite3 -readonly perf-lab.sqlite ".tables"`, `select * from schema_migrations`, a `count(*)` loop over all 16 tables, `.indexes`
- 17:38:46 jobs: `select id, lab_id, status, proposed_by, hosts, budget_gpu_min, … from jobs order by created_at`
- 17:38:49 artifacts with run counts per hash
- 17:38:54 `select spec_json from artifacts where hash like '24318dbc66390%'` piped to `python3 -m json.tool`
- 17:39:13 per-artifact `json_extract` of queries, impl, compiler cache, device and quality gate hash for `local-sampler`
- 17:42:09 latest timestamps per table, `node --version`, capture and artifact status counts
- 17:42:13 artifacts created after 2026-10-13T01, and pending captures per job

### What worked

- All five migrations are applied (2026-10-12 21:51–23:50Z). Row counts: artifacts 70 (50 measured, 20 synthetic, all
  available), runs 80, jobs 12, job_captures 86 (78 imported, 8 pending), job_events 2,485, llm_calls 30.
- The real spec showed `"quality_gate_sha256": "1231e65b50d080"` and `"fixture_manifest_sha256": "1fddcd7c1dea78"`:
  14 hex digits, i.e. cyrb53.

### What didn't work

- Nothing failed.

### What I learned

- The latest artifact timestamp is `2026-10-19T13:17:23.989Z`. Six synthetic seeds for `hello` and `compare` were
  written at 13:16–13:17Z today, four hours before this session. So somebody ran a server and opened those labs this
  morning. Everything else dates from 2026-10-12/13.
- The 8 pending captures belong to the cancelled duplicate job `job-mv5vvze7-vsb0`.

### What warrants a second pair of eyes

- Who wrote the 13:16Z seeds, and was that against this `.data` or the Playback copy? `PERF_LAB_DATA_DIR` decides it.
  It does not change any finding, but it shows the DB is not frozen.

## Step 7: Tracing the `*_sha256` fields and the budget

I wanted to confirm in source that the misnamed hash fields come from cyrb53. I also wanted to find where the
assistant's "30 GPU-minute" budget is actually enforced.

### What I did

- 17:38:57 the grep below (failed)
- 17:39:00 the same grep without `--include`
- 17:39:05 `nl -ba src/lang/build.ts | sed -n 520,630p`
- 17:39:08 `grep -rn "budget" server scripts …; grep -rn "budgetGpuMin\|30 minutes\|budget.*30\|MAX_BUDGET\|BUDGET" src …`

### What worked

- `src/lang/build.ts:554` sets `quality_gate_sha256: hash(...)`, and `:601` does the same for the sampler's
  `fixture_manifest_sha256`. A dino workload's fixture field (`:617`) is the real dataset SHA-256.
- The budget is enforced only in the browser (`src/features/agent/runtime.ts:349-350`). The server stores
  `budget_gpu_min` and never reads it back.

### What didn't work

- Command:

  ```text
  cd /Volumes/SSD/code/kiln/lab-workbench && grep -rn "quality_gate_sha256\|fixture_manifest_sha256\|archive_sha256" src --include=*.ts | grep -v test | head -10
  ```

  Error, verbatim: `(eval):1: no matches found: --include=*.ts`. zsh expands the unquoted `--include=*.ts` as a
  filename glob before grep sees it. Fixed by dropping `--include` (or quoting it as `'--include=*.ts'`).

### What I learned

- In this shell, always quote grep `--include` patterns.

### What warrants a second pair of eyes

- The budget: a server-side check in `POST /jobs` would be a one-line guard. Kiln should decide whether the budget is
  policy (server) or advice (client).

## Step 8: Re-computing the memo's sampler numbers from the stored bundles

The memo and design 04 §15.2 make specific claims: 2.58× (2.18–2.69) on the first run, 2.50× (2.37–2.72) after
re-measurement, 2.29× (1.88–2.52) at 1,024 queries, and about 4.9 s for the first compile. I recomputed them from the
DB rather than trusting either document. The bundles are gzip JSON BLOBs, so I wrote a small read-only Python script
in the scratchpad. I then read `src/lang/stats.ts` to apply exactly the browser estimator's definition, and grepped the
ML-PERF-001 docs for where each number is written.

### What I did

- 17:39:26 wrote and ran `scratchpad/sampler.py`: opens the DB `?mode=ro`, gunzips each timing bundle, and prints the
  per-process median latency, compile ms, activation, validity and quality for each query size, plus the per-rep
  ratios
- 17:39:32 – 17:39:42 four `job_events` queries looking for the first compiled warmup call (two returned nothing, see below)
- 17:39:46 the grep below (failed)
- 17:39:50 `grep -rn '2\.58\|2\.18\|4\.9 s\|4857' --include='*.md' .` (quoted; worked)
- 17:39:59 – 17:40:04 `nl -ba src/lang/stats.ts | sed -n 1,100p`

### What worked

- Per-rep ratios (candidate median ÷ baseline median), and the median of those ratios (which is what `pairedRatio`
  reports):
  - 1,024 queries: [2.092, 2.523, 2.498, 1.88], median 2.295. Matches the memo's 2.29× (1.88–2.52).
  - 2,048 queries: [2.513, 2.374, 2.48, 2.721], median 2.497. Matches the memo's 2.50× (2.37–2.72).
  - 4,096 queries: median 1.955. 12,240 queries: median 2.194. The memo does not report these.
- The script also printed a "median-of-medians ratio": 2.234 / 2.501 / 2.026 / 2.207. That is a different estimator,
  not the one the browser uses, and I do not quote it in the notes.
- First compile, verbatim from `job_events`:
  `job-mv5sfo0r-l0ge|2026-10-12T21:52:41.253Z|sampler-local/candidate/timing#0 {"i":0,"ms":4857.931}`. Later first
  calls take 805–1,017 ms with the shared cache, and 2,745 / 3,183 / 3,283 ms for the first process at a new query
  size.

### What didn't work

- The first two attempts to find the warmup event used the wrong JSON spacing. Commands, verbatim:

  ```text
  cd /Volumes/SSD/code/kiln/lab-workbench/.data && sqlite3 -readonly perf-lab.sqlite "select job_id, at, kind, substr(detail,1,160) from job_events where kind in ('script.warmup','job.started','job.done','job.failed','job.cancelled') and (detail like '%candidate%#0%\"i\": 0%' or kind like 'job.%') order by id;" | head -60
  ```

  returned only the `job.*` rows and zero `script.warmup` rows, and

  ```text
  cd /Volumes/SSD/code/kiln/lab-workbench/.data && sqlite3 -readonly perf-lab.sqlite "select job_id, at, substr(detail,1,140) from job_events where kind='script.warmup' and detail like '%candidate/timing#%' and detail like '%\"i\": 0,%' order by id;"; echo ---; sqlite3 -readonly perf-lab.sqlite "select job_id, at, substr(detail,1,140) from job_events where kind='script.warmup' and detail like '%candidate/%' and detail like '%\"i\": 0,%' order by id limit 40;" | head -40
  ```

  printed only `---`. No error text: the patterns simply matched nothing. Sampling three rows (`select job_id, detail
  from job_events where kind='script.warmup' limit 3`) showed the stored form is compact, `{"i":0,"ms":4857.931}`,
  not Python's spaced `"i": 0`. The runner re-serializes the line with `JSON.stringify`. The pattern
  `'%{"i":0,%'` worked.
- Command:

  ```text
  cd /Users/manuel.odendahl/code/tulip/playback/.worktrees/docs-ml-perf-001-perf-explorer/ttmp/2026/10/12/ && ls; ls ML-PERF-001--…/ ML-PERF-001--…/*; grep -rn "2\.58\|2\.18\|4\.9 s" --include=*.md . | head -20
  ```

  Error, verbatim: `(eval):1: no matches found: --include=*.md`. This is the same zsh glob problem as step 7; it worked
  once quoted.

### What I learned

- **2.58× (2.18–2.69) cannot be re-verified from the DB.** Its runs were deleted by `deleteRunsOf` when the 2,048
  capture was re-run after migration 3. It survives only in design 04 line 393 and the backend diary (line 271).
- **With four processes the "95 % CI" is the min–max of the four ratios.** A bootstrap median of four draws equals
  the minimum whenever at least three draws are the minimum, with probability 13/256 ≈ 5.1 % > 2.5 %. Both memo CIs
  are exactly the min and max of the ratios.

### What warrants a second pair of eyes

- The CI arithmetic above is analytic. I did not run the browser's bootstrap code itself, but both reported intervals
  equal min–max, which is consistent.

## Step 9: CPU, memory, DINO and assistant-token evidence

This step checked the remaining memo claims (CPU time, peak RSS, allocator behaviour) and the DINO results, then
characterized the assistant's token rows. Two more read-only scratchpad scripts did this. Finally I read the backend
diary's account of the dropped system role, so I could cite it rather than paraphrase.

### What I did

- 17:40:20 `scratchpad/cpu.py`: for the cpu, memory and trace modes, entity kinds, link counts, rusage values,
  allocation sizes and the allocator peak
- 17:40:32 `scratchpad/dino.py`: for each `dino-pr1005` run, entity kinds, median latency, validity, quality,
  activation, device, toolchain, report path and coverage notes
- 17:40:38 evidence archive, dataset, media totals, sample `dataset_images` rows, and the archive file list
- 17:40:43 conversations with message counts; `llm_calls` grouped by model; the first calls' input tokens against
  prompt characters
- 17:40:47 – 17:40:50 `grep -n "developer\|system role\|…" reference/04-…-diary.md`; `sed -n 300,435p` of that diary

### What worked

- At 1,024 queries: `userTime` 480.141 vs 1,293.3 ms; `maxRss` 301,449,216 vs 479,936,512 B (287.5 vs 457.7 MiB).
  Matches the memo.
- At 1,024 queries, memory: eager has 9 allocations over 3 requests (`16.0 MiB in aten::empty`, `16.0 MiB in aten::mul`,
  `1.0 MiB in aten::sum`), peak 34,603,008 B. Compiled has 6 (`16.0 MiB` and `1.0 MiB in Torch-Compiled Region: 0/0`),
  peak 17,825,792 B. This matches the memo's "two intermediate-sized blocks vs one; hypothesis refuted".
- DINO, local CPU: timing medians 1,664.8 ms (baseline) vs 1,654.4 ms (candidate); both qualified, outputs exact;
  candidate replay "not configured".
- DINO, DGX: memory medians about 75.0 / 74.8 / 74.7 ms (baseline) on an NVIDIA GB10 with `torch 2.10.0+cu130`.
  `pr1005-dgx/baseline/kernels#0` has zero entities and the note "…is not in this archive: the qualification records
  it for the candidate only".
- `llm_calls` ids 2–7 report 4–98 input tokens for 5,290–13,689 prompt characters: the residue of the dropped system
  role.

### What didn't work

- Nothing failed.

### What I learned

- The DGX archive includes `candidate-profiler-trace.json.gz`, which no importer reads. Kernel entities come only
  from the text summary table.
- The local DINO predictions cover 16 of 128 images ("predictions recorded for 16 images of 128; other images have
  output digests only").

### What warrants a second pair of eyes

- The dropped-system-role diagnosis rests on the diary's manual secret-word probe and the token residue. No automated
  check exists in the code, so a gateway change would go unnoticed.

## Step 10: Design 04 and the ML-PERF-003 remote-executor plan

I read the parts of design 04 that the code should implement (§2, §5–§8, §11, §15) and compared them with what I had
read. Then I read the ML-PERF-003 ticket (index, tasks, changelog, diary, and the intern guide's §0, §4–§6, §6.13–§10)
to state precisely what is planned and what exists.

### What I did

- 17:40:53 `grep -n "^#" design/04-perf-lab-backend-end-to-end-design.md && sed -n '/^## 15/,$p' …`
- 17:40:57 `sed -n 46,104p; sed -n 179,270p; sed -n 352,375p` of design 04
- 17:41:02 – 17:41:11 ML-PERF-003: `find . -type f`, `cat index.md tasks.md changelog.md`, diary head, the guide's headings and sections

### What worked

- ML-PERF-003 is design-only: every phase task in `tasks.md` is unchecked, and the code has no `server/remote/` or
  `workloads/perf_lab_remote/`.

### What didn't work

- Nothing failed.

### What I learned

- Design and code have drifted in three places:
  - §6 lists "quality failure" as a validity reason, but the code does not, and §5.3 agrees with the code.
  - §8 documents a `/catalog?lab=` filter that the route ignores.
  - §15.1 says "three migrations"; there are five.
- ML-PERF-003's `spec.environment` block would change hashes only for executed DGX captures. It would also retire the
  stale synthetic DGX seeds.

### What warrants a second pair of eyes

- The plan ties job lifetime to an SSH connection on purpose. Whether that suits long memory experiments should be
  decided before Kiln adopts the executor.

## Step 11: `.data` layout, the client-side sandbox, environment variables and Hono

This step filled the remaining gaps: the on-disk layout and sizes; how assistant code is executed in the browser
(which matters for the approval-bypass finding); every environment variable; and whether Hono's `req.json()` checks
the content type (which matters for the CSRF finding). I also confirmed the kiln copy of `server/` is identical to the
Playback copy.

### What I did

- 17:39:59 `cat /Volumes/SSD/code/kiln/README.md .ttmp.yaml .gitignore; git -C /Volumes/SSD/code/kiln log --oneline | head; diff -rq <kiln>/lab-workbench/server <playback>/…/experiments/lab-workbench/server && echo SAME-server`
- 17:41:15 – 17:41:18 `du -sh . artifacts evidence media inductor-cache`; listings; one artifact tree; one `manifest.json`
- 17:41:29 – 17:41:32 `grep -n "new Function\|AsyncFunction\|fetch\|globalThis\|…" src/features/agent/runtime.ts`; `sed -n 425,460p` and `335,360p`
- 17:42:01 dino-local spec fields, `run-configuration.json`, and the head of the report
- 17:42:25 `grep -rn "process.env\.\|os.environ" server scripts workloads/perf_lab_local workloads/perf_lab_dino`
- 17:42:36 Hono version and `grep -n "json()\|cachedBody\|content-type" node_modules/hono/dist/request.js`
- 17:43:01 – 17:43:04 Python tests (none), `wc -l` of the backend files, `sed -n 1,30p src/presets/programs/local-sampler.lab.js`

### What worked

- `diff -rq` printed `SAME-server`: the kiln copy of `server/` matches Playback's.
- Hono 4.13.13 `request.js:104-105`: `json()` parses the body without looking at `content-type`.
- `runtime.ts:433-452` runs assistant code as `new AsyncFunction(...names, code)`. The scope object shadows only the
  library names and `console`, so `fetch` is reachable.

### What didn't work

- `git -C /Volumes/SSD/code/kiln log --oneline` printed `fatal: your current branch 'main' does not have any commits yet`.
  This is not a command error; it is the repository's real state.

### What I learned

- `.data` is 36 MB in total: media 22 MB, evidence 7.9 MB, artifacts 1.9 MB, inductor cache 1.6 MB, DB 1.9 MB.
- Manifests embed absolute paths into the Playback worktree, so `.data` was copied over from there.
- Because the kiln repository has no commits, `playbackRepo()` resolves to the kiln root and `git show <playback-rev>:…`
  would fail. Running the dino workload from the kiln copy needs `PERF_LAB_PLAYBACK_REPO`. (Inferred; not run.)

### What warrants a second pair of eyes

- The CSRF claim, a cross-site `text/plain` POST to `/api/jobs` with `approve: true`, is inferred from Hono's
  `json()` and the absence of an Origin check. It was not exercised, because exercising it would mean starting a
  server, which the brief forbids. Someone should confirm it in a sandbox before the guide states it as fact.

## Step 12: Writing the notes

I wrote `02-perf-lab-backend-notes.md` in one pass from steps 1–11, in the ten sections the brief asked for, plus a
test-results section and a file inventory. Every major claim carries a `file:line`, and *inferred* is marked wherever
something was not exercised. The file came out at 959 lines, inside the 600–1200 the brief set.

### What I did

- 17:49:48 `Write` of `sources/02-perf-lab-backend-notes.md`

### What worked

- Organizing by the brief's ten topics kept the notes navigable for the guide's author. Pseudocode for `runJob`,
  `registerArchive` and the validity rules came straight from the code read in step 3.

### What didn't work

- Nothing failed.

### What I learned

- Nothing new; this step consolidated.

### What warrants a second pair of eyes

- Sections 10.1–10.2 mix observed defects with inferred risks. Each item says which it is, but a reviewer should check
  that the label sits on the right items.

## Step 13: Self-check against the transcript and code (after the diary request)

When the coordinator asked for this diary, I first re-checked the figures the notes quote, because the notes were
written after a context compaction. I replayed the earlier tool outputs from the session transcript, and re-read the
code for the line numbers I was least sure of. This found two errors in the notes, which I fixed.

### What I did

- 17:52:12 `wc -l` of the notes (959), and a `grep -c` of the transcript for each quoted figure (1.955, 2.194, 2.15,
  805, 34.6, 17.8, `Torch-Compiled Region`, 3.02, 11.39, 31.33): all present
- extracted the ordered tool log and errors from the transcript JSONL with a `python3 -I` script into
  `scratchpad/backend-transcript-log.txt`
- printed the stored outputs of the test runs, the sampler, cpu/memory and dino scripts, and the failing commands
- `grep -c "it(…" server/*.test.ts`; `grep -n` of `SYNTHETIC`, `bus.emit`, `deleteRunsOf`, `cancelled`, `proposedBy`,
  `12_000`, `HISTORY`, `content-length`; `sed -n` of `app.ts:191-202` and `runner.ts:126-136, 262-275, 356-372`

### What worked

- Every number in §8.5, and the test-run figures, matched the stored outputs.
- The cited lines matched: `app.ts:42, 131, 160, 172-173, 188, 200, 220-223`; `runner.ts:132-133, 297, 368`;
  `dino.ts:109`; `prompt.ts:35`; `service.ts:14-15`.

### What didn't work

- My first attempt to fix the notes with `Edit` failed, verbatim:
  `<tool_use_error>File has not been read yet. Read it first before writing to it.</tool_use_error>`. The context
  compaction had dropped the file's read state. I read the affected lines and retried.

### What I learned

- Two corrections, now applied to the notes:
  - §11 said `server.test.ts` has 7 tests. It has 9 (`grep` count and the verbose list); 9 + 9 + 7 + 8 = 33.
  - §11 called the vault-dependent tests "three suites". They are one `it.skipIf` and two `describe.skipIf` blocks.
- I also reworded §10.2 item 8. The cancel route calls `runner.cancel` for every non-terminal job (`app.ts:195-199`),
  and `runJob` returns before its `try … finally` (`runner.ts:264-266, 368`). So a job cancelled before it ran leaves
  its id in the `cancelled` set: a small leak, not a functional bug.

### What warrants a second pair of eyes

- The notes cite many line ranges I did not re-verify one by one in this step: the ones covered above were checked,
  and the rest were cited from full `nl -ba` reads earlier in the session. A spot-check of the importer and
  qualification line ranges would be cheap insurance.
