---
Title: 'Diary D: Perf Lab and the kiln lab package'
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
Summary: 'Investigation diary of KILN-004 area D: how the inventory of lab-workbench/ (Perf Lab) and packages/lab (@kiln/lab) was gathered, the one headless build run, the file-by-file diffs behind the duplication rows, and the area-D rows of the inventory database.'
LastUpdated: 2026-10-21T12:30:00-04:00
WhatFor: 'Tracing a claim in reference/05-inventory-notes-d-perf-lab-and-the-kiln-lab-package.md or in various/inventory/perf-lab.json back to the read, command or diff that produced it, and resuming area D.'
WhenToUse: 'When a Perf Lab or @kiln/lab claim in the notes, the database or the intern guide is doubted, or before extending the area D inventory.'
---

# Diary D: Perf Lab and the kiln lab package

This diary covers inventory area D of KILN-004: `lab-workbench/` (Perf Lab, the verbatim copy of Playback's
ML-PERF-001 lab workbench) and `packages/lab/` (`@kiln/lab`), plus a brief look at the Kiln-side ports in
`apps/server/src/lab` and `apps/workbench/src/ui/lab`. The deliverables it supports are
`reference/05-inventory-notes-d-perf-lab-and-the-kiln-lab-package.md` (the notes; §n below refers to them) and
`various/inventory/perf-lab.json` (the area's rows in the inventory database). The ticket's main diary is
`reference/01-investigation-diary.md`.

## Step 1: Inventory of Perf Lab and @kiln/lab, gathered and written up (written after the fact)

This step is written after the fact. It covers the whole first pass: reading `lab-workbench/` (language, data layer,
presets, server, Python workloads, frontend, tests) and `packages/lab/` file by file against its source, one
read-only headless build of the `hello` preset, and writing the notes. The session's context was compacted once in
the middle of the reading, so the reads before that point survive only as a summary; the commands listed for that
part are the shape of what was run, not a verbatim log. Then the session hit its usage limit while the notes were
being written. The orchestrator committed the notes as they stood on disk (814 lines, complete through §11 and
"Related") in `1d0c894` and resumed this agent.

The outcome is the notes file with 11 numbered sections — layout and dependencies, the lab.js language, the data
layer, presets, server, frontend, tests, Python and data directories, `@kiln/lab` against its source, the Kiln-side
ports, and findings (duplication, hotspots, reusable components and couplings, dead pieces). Every claim carries
`[obs]` (read at the cited line), `[ran]` (executed) or `[inf]` (inferred).

### Prompt Context

**User prompt (verbatim):** see `01-investigation-diary.md`, Step 1
([link](01-investigation-diary.md#step-1-locating-the-system-and-opening-the-ticket)).

**User instruction relayed mid-task (verbatim, passed on by the orchestrator):**

> Tell each agent btw commit at appropriate intervals and keep a detailed diary as you work (using the diary format
> from the skill).

**Orchestrator's assignment (summary, not a user quote):** build a detailed component inventory, not a code review,
of the entire tracked `lab-workbench/` and of `packages/lab/` compared file by file with `lab-workbench/src/lang`,
`src/data` and the presets, including who consumes `@kiln/lab`. Per module: purpose, public API, the language's data
model, a small example program and what it compiles to, the server's route table, SQLite schema, workload process
protocol, qualification and statistics math, frontend architecture, view types and inputs, dependencies, LOC and
tests. Identify (a) duplication (also `apps/server/src/lab/*` and `apps/workbench/src/ui/lab/*` briefly),
(b) complexity hotspots, (c) reusable components and couplings to cut, (d) dead or vestigial pieces, with `file:line`
evidence and observed versus inferred kept apart. The kiln repository was read-only. A later orchestrator message
narrowed that to two (then three) writable files: these notes, this diary and `various/inventory/perf-lab.json`,
committed by pathspec with subjects `KILN-004 D: …`.

**Commit (code):** none of mine in this step; the notes were committed by the orchestrator in `1d0c894` — "KILN-004:
diary step 3, the inventory database; keep the stopped agents' partial notes".

### What I did

- Sized the tree (tracked files only): `git -C /Volumes/SSD/code/kiln ls-files lab-workbench | xargs wc -l` and per
  directory; 330 files, about 33.2k lines, including the 5682-line golden JSON and the 965-line `uv.lock`.
- Read every module of `lab-workbench/src/lang` (`ir.ts`, `builders.ts`, `library.ts`, `build.ts`, `runtime.ts`,
  `query.ts`, `rows.ts`, `values.ts`, `stats.ts`, `compare.ts`, `params.ts`, `algo.ts`, `detections.ts`, `util.ts`),
  `src/data/*`, `src/presets/*`, `server/*` (`app.ts`, `db.ts`, `runner.ts`, `importer.ts`, `qualification.ts`,
  `store.ts`, `evidence.ts`, `datasets.ts`, `dino.ts`, `probe.ts`, `tar.ts`, `config.ts`, `events.ts`,
  `assistant/*`), `workloads/perf_lab_local/*` and `workloads/perf_lab_dino/run.py`, the frontend's `app/store.ts`,
  `app/registry.ts`, `features/*/thunks.ts`, `features/agent/runtime.ts` and `ViewRenderer.tsx`.
- Compared each `packages/lab/src` file with its source using `diff` and classified the differences as mechanical
  (the four strict tsconfig options) or semantic (§9.1-9.3).
- Found the consumers of `@kiln/lab`:

  ```bash
  cd /Volumes/SSD/code/kiln && grep -rln "@kiln/lab" apps packages --include='*.js' --include='*.jsx' \
    --include='*.mjs' --include='*.ts' --include='package.json' | grep -v node_modules | grep -v "^packages/lab/"
  # apps/workbench/{package.json,build.mjs,test/lab-e2e.mjs,src/ui/lab/{api.js,panels.jsx,state.js}}
  ```

- Built the `hello` preset headlessly with `@kiln/lab` from a scratch script outside the repo
  (`/private/tmp/claude-502/…/scratchpad/run/hello.mts`, run with `node hello.mts`, Node v26.8.1 stripping types):
  `buildSynthetic(src, { labId: 'hello' })`, then materialised the `latency` derive. The IR and the lowered spec are
  reproduced in §2.11.
- Measured the Kiln server ports against their Perf Lab originals:

  ```bash
  for p in importer tar datasets evidence store; do a=lab-workbench/server/$p.ts; b=apps/server/src/lab/$p.ts
    echo "$p: PL $(wc -l <$a) / kiln $(wc -l <$b) / diff lines $(diff $a $b | grep -c '^[<>]')"; done
  # importer 286/326/554  tar 129/98/61  datasets 266/206/182  evidence 100/118/84  store 276/133/327
  ```

- Traced the capture hash: `grep -rn "labCaptureHash\|cyrb53\|function hash" packages/exec/src packages/lab/src
  lab-workbench/src/lang/util.ts apps/server/src` — three implementations.
- Wrote the notes to the scratchpad, then (after the orchestrator's message) into
  `reference/05-inventory-notes-d-perf-lab-and-the-kiln-lab-package.md`.

### Why

- The comparison of `@kiln/lab` with its source had to be per file, because the question is which copy to keep:
  a file that differs only mechanically can be deleted from one side without losing behaviour; a semantic difference
  cannot.
- Running one build turned "what does a program compile to" from a reading of `build.ts` into an observed IR. The
  package was used rather than `lab-workbench` because it runs under plain Node without installing anything; the
  algorithm is the same (§9.2), so the IR shape transfers, with the one known difference that the package normalises
  `lowered`.

### What worked

- The headless build ran first time and printed six passes, three lints, 12 nodes, 13 edges, two cached captures with
  hashes `14fc4e279800ee` and `205b27671c469`, and derive rows (baseline p50 138.78 ms, candidate 68.01 ms, both
  `derived`).
- The lint set matched the existing `build.test.ts` expectation ("hello reports the missing contract as lints").

### What didn't work

- `grep -rn "@kiln/lab" --include=*.js --include=*.jsx … apps packages` under zsh failed with
  `(eval):1: no matches found: --include=*.js` — zsh expanded the unquoted glob. Quoting the patterns
  (`--include='*.js'`) fixed it.
- `find workloads -name '*.py' | xargs wc -l` returned 799.4 KB of output: `workloads/.venv/` exists on disk with
  site-packages. `git check-ignore -v workloads/.venv` → `lab-workbench/.gitignore:5:workloads/.venv/`. Tracked
  Python was counted with `git ls-files` instead (680 lines).
- A shell line separating files with `echo =====` failed in zsh with `(eval):1: ==== not found` (`=word` is zsh
  command expansion); the files were re-read with a plain separator string.
- The session stopped at the usage limit before the diary or any JSON rows were written; nothing on disk was lost.

### What I learned

- `@kiln/lab`'s only consumer is `apps/workbench`; `apps/server` reimplements the Perf Lab server routes it needs
  without depending on the package.
- `apps/server/src/lab/importer.ts` is not a port of Perf Lab's `importer.ts`: it imports a whole Perf Lab `.data`
  directory into Kiln's database. Same file name, different job.
- `quality_gate_sha256` and (outside datasets) `fixture_manifest_sha256` hold cyrb53 values, not SHA-256
  (`lab-workbench/src/lang/build.ts:554,601`).
- `stats.pairedRatio` in Perf Lab ignores its `seed` option; the bootstrap is seeded from the ratios themselves.

### What was tricky to build

- Telling a port from a copy. Headers in `apps/server/src/lab` and `apps/workbench/src/ui/lab` say "ported from
  Perf Lab"; only the diff counts show how far each one moved (61 to 554 changed lines).
- The hypothesis verdict exists in two places with different semantics: a React view in Perf Lab
  (`HypothesisView.tsx:19-48`) and a headless module in the package (`hypothesis.ts`). The Perf Lab language test
  imports the React view (`src/lang/evidence.test.ts:97`).

### What warrants a second pair of eyes

- The P-n change list in `@kiln/lab` (P-5, P-7, P-9, P-10, P-15) was read from comments, not from a change log; a
  reviewer should confirm that no further semantic difference hides behind a mechanical-looking diff in `build.ts`
  (1030 vs 1036 lines).
- The "unused library names" list in §11(d) was checked against the presets only, not against agent reply scripts
  or user programs saved in a Perf Lab store.

### What should be done in the future

- Back the duplication findings with per-file diff counts (Step 2) and fill `various/inventory/perf-lab.json`
  (Step 3).

### Code review instructions

- Start with §2.11 (the compiled example) and §9 (the comparison table) of the notes.
- Reproduce the build with the snippet under "Usage Examples" in the notes.

### Technical details

- Repository state while reading: `/Volumes/SSD/code/kiln`, branch `main`, at `4d9adc2` (no area-D changes since).
- Node v26.8.1; no installs, no `pnpm` commands in `lab-workbench/` or `packages/lab/`.

## Step 2: The duplication between @kiln/lab and Perf Lab, measured file by file; two corrections to the notes

The notes said "most files differ only mechanically" without numbers. This step measured it: every
`packages/lab/src` file was diffed against its `lab-workbench/src` source twice, raw and after undoing the three
mechanical edits `sed` can undo, and the residue was read by eye. The result is §9.5 of the notes: of 16 language
files, 9 differ only mechanically, 3 carry one-line semantic edits and 4 are rewritten; of 6 data files, 2 are
near-copies and 4 are re-architected. The same pass found two errors in the notes written before the interruption,
both corrected: the presets live in `src/presets/programs/`, and the assistant routes are all under
`/api/assistant/`.

### Prompt Context

**User prompt (verbatim):** see `01-investigation-diary.md`, Step 1. **Relayed instruction:** see Step 1 above.

**Orchestrator's resume message (summary, not a user quote):** resume after the usage-limit stop; keep editing the
notes committed in `1d0c894`; write the diary in investigation format; fill `various/inventory/perf-lab.json` per
the contract in `playbook/01-inventory-database-contract-json-rows-diaries-and-crosslinks.md`; validate with
`load_inventory.py --check`; pathspec commits of the three files only.

**Previous commit:** `ae14e8d` — "KILN-004 D: diary step 1, the Perf Lab and @kiln/lab inventory pass".

### What I did

- Diffed every file, raw and normalised:

  ```bash
  cd /Volumes/SSD/code/kiln
  norm() { sed -E "s/(from '[^']+)\.ts'/\1'/g; s/ \| undefined//g; s/!([.;,)\[])/\1/g; s/\s+$//" "$1"; }
  for f in ir refs env query params algo detections builders compare build library runtime rows values stats util; do
    a=lab-workbench/src/lang/$f.ts; b=packages/lab/src/lang/$f.ts
    echo "$f $(wc -l <$a) $(wc -l <$b) $(diff $a $b | grep -c '^[<>]') $(diff <(norm $a) <(norm $b) | grep -c '^[<>]')"
  done   # and the same loop over src/data/{generate,source,env,bundles,capabilities,datasets}.ts
  ```

- Read the normalised residue of `build`, `runtime`, `query` in full, and of `builders`, `params`, `compare`, `algo`,
  `detections`, `library` with constructor-field lines filtered out.
- Diffed the presets: `diff -rq lab-workbench/src/presets/programs packages/lab/presets`, then the two differing
  programs line by line.
- Re-read the route registrations: `grep -n "app\.\(get\|post\|put\|delete\)(" server/assistant/service.ts
  server/app.ts`, and `server/assistant/service.ts:205-245,355-372`, `server/config.ts:20-31`.
- Edited the notes: §4 (presets path), §5.1 (assistant route prefix; no authentication, bind `127.0.0.1`), §5.7
  (where the limits live; how model code round-trips through the browser), new §9.5 (the diff table), §11(a)1.

### Why

- A duplication row in the database has to carry evidence a reader can re-run; "differs mechanically" is a claim,
  the per-file counts are evidence.
- Normalising before counting separates the strict-tsconfig noise (52 of `ir.ts`'s 52 changed lines) from real
  behaviour changes, which is what decides whether one copy can simply be deleted.

### What worked

- Raw versus normalised counts (selected): `ir` 52 → 0, `refs` 2 → 0, `env` 10 → 0, `runtime` 70 → 6, `build`
  38 → 12, `builders` 100 → 60 (all constructor fields), `values` 156 → 156, `stats` 126 → 122, `rows` 70 → 66.
- The `build.ts` residue is exactly two constructor rewrites (`BuildError.failure`, `NeedsEvidence.mode`) and the
  `lowered: JSON.parse(stableStringify(i.spec))` change at `packages/lab/src/lang/build.ts:866-868`; the `runtime.ts`
  residue is the `isSealed` guard in `markDerived` and one `?? pattern`.
- Presets: 9 programs and 2 reply scripts byte-identical; `local-sampler.lab.js` 15 changed lines, `dino-pr1005.lab.js`
  4; `sampler-hosts.lab.js` only in the package.

### What didn't work

- The first preset diff, `diff -rq lab-workbench/src/presets packages/lab/presets`, compared the wrong directory and
  reported every program as "Only in packages/lab/presets"; the follow-up per-file diff failed with
  `diff: lab-workbench/src/presets/local-sampler.lab.js: No such file or directory`. The programs are one level down,
  in `src/presets/programs/`, which the notes had also got wrong; both were corrected.

### What I learned

- The sed normalisation cannot undo constructor parameter properties (`erasableSyntaxOnly`), so `builders.ts` keeps
  60 residual lines that are all mechanical. A count alone would have misclassified it; reading the residue was
  necessary.
- The assistant never executes model code on the server: replies carry `code` and `run`, the browser runs them, and
  `POST /api/assistant/messages/:id/result` stores the observation and continues the turn (`service.ts:355-372`).
- No Perf Lab route has authentication; the server relies on binding `127.0.0.1` (`server/config.ts:28`).

### What was tricky to build

- Choosing a normalisation that removes only mechanical edits. A broader `sed` (for example stripping every `!`) would
  also erase logical negations; the pattern only removes a `!` directly followed by `. ; , ) [`, which in this code
  is always a non-null assertion.

### What warrants a second pair of eyes

- The `norm` counts for `rows.ts` (66) and `generate.ts` (47) were classified from the earlier reading, not
  re-read line by line in this step.

### What should be done in the future

- Step 3: the inventory JSON, with the duplication rows citing §9.5.

### Code review instructions

- Re-run the loop above from `/Volumes/SSD/code/kiln`; compare with the table in §9.5 of the notes.

### Technical details

- Repository at `ae14e8d` (only ticket files changed since `4d9adc2`; no area-D source changed).

## Step 3: The area-D rows of the inventory database, generated and validated

This step turned the notes into rows of `various/inventory/perf-lab.json` under the contract in
`playbook/01-inventory-database-contract-json-rows-diaries-and-crosslinks.md`: the four packages area D owns, 102
modules (both copies of every language and data file, the server, workloads and the main frontend pieces), 19
functionalities with 62 module links, 33 endpoints, 17 `perf-lab` tables, 12 service calls, 10 reusable components,
7 duplications, 8 hotspots, 27 facts, 7 formats (including the workload record format and the lab IR), 4 mermaid
diagrams and 18 dependencies. The rows are generated by a script kept outside the repository, so that the JSON stays
regular and every row gets its `diary_step` tag. Writing the format rows sent me back to `run.py`, which turned up a
third spec identity; the diagrams were also added to the notes as §12.

### Prompt Context

**User prompt (verbatim):** see `01-investigation-diary.md`, Step 1. **Relayed instruction:** see Step 1.
**Orchestrator's resume message (summary):** see Step 2.

**Previous commit:** `ab74354` — "KILN-004 D: per-file diffs of @kiln/lab against Perf Lab; diary step 2".

### What I did

- Read the contract, the loader's `--help`, `scripts/schema.sql`, `scripts/schema-kiln.sql`, and the rows already
  in `orchestrator.json`, so as not to repeat the orchestrator's `lab-workbench` `react` and `@mathjax/src`
  dependency rows.
- Extracted the table columns from the migrations:
  `python3` regex over `lab-workbench/server/db.ts` (`create table (\w+) \((.*?)\n  \);`) → 17 live tables plus the
  `_v3`/`_v4` rebuilds, which are renamed into place.
- Re-read the workload side for the format rows: `grep -n "json\b\|\.json\|emit(\|event" run.py` and
  `run.py:84-110` (the manifest fields).
- Wrote the generator `/private/tmp/claude-502/-Users-manuel-odendahl-code-tulip-playback--worktrees-docs-ml-perf-001-perf-explorer/79c59c94-0f0a-4389-9075-0b3db5c61c18/scratchpad/gen_perf_lab_json.py`
  and ran it with the JSON path as its argument; validated with
  `python3 <ticket>/scripts/load_inventory.py --check`.
- Compared with the other areas' rows (titles, format names and module paths that mention `lab`) and dropped my
  board-views duplication in favour of area B's row "lab board panels: lab-workbench views vs
  apps/workbench/src/ui/lab"; a fact points to it instead.
- Notes: §11(d) gains the third spec identity; new §12 holds the four diagrams.

### Why

- Duplication rows are keyed by title; two areas describing the same pair of directories under different titles
  would show up twice on the site. Area B owns the Kiln-side views and had already described that pair in more
  depth.
- Every row carries `diary_step` (1 for what the first pass found, 2 for what the diffs confirmed, 3 for formats,
  diagrams and the facts found here), which is how the loader links a step to its findings.

### What worked

- After the fixes below, `--check` reported `perf-lab.json {"packages": 4, "modules": 102, "functionalities": 19,
  "functionality_modules": 62, "endpoints": 33, "db_tables": 17, "service_calls": 12, "reusable_components": 10,
  "duplications": 7, "complexity_hotspots": 8, "facts": 27, "formats": 7, "diagrams": 4, "dependencies": 18}`
  (the final run is recorded in Step 4).
- No natural-key collision with areas A, B or the orchestrator.

### What didn't work

- First `--check` crashed in the loader:

  ```text
  File ".../scripts/load_inventory.py", line 221, in build
    explicit_links.append((area, int(s), table, rowid, key))
  TypeError: int() argument must be a string, a bytes-like object or a real number, not 'list'
  ```

  Cause: my `fn()` helper wrote a list into `diary_step` for two functionalities; the contract wants a list under
  `diary_steps`. Fixed in the generator.
- Second `--check` exited 1 with eleven problems of the form
  `PROBLEM: perf-lab.json: formats row 'perf-lab capture spec/1' names diary step 3, which perf-lab's diary lacks`
  (all seven formats and four diagrams). Expected: the rows were tagged for this step before it was written. This
  entry resolves them.

### What I learned

- The workload writes a third identity for the same spec: `manifest.json`'s `spec_sha256` is a real SHA-256 of
  `json.dumps(spec, sort_keys=True)` (`lab-workbench/workloads/perf_lab_local/run.py:89`), while the capture is named
  by cyrb53 and the gate field holds cyrb53 too.
- The workload event stream is small and stable: `start {mode, impl, device, requests}`, `warmup {i, ms}`,
  `request {i, ms}`, `done {window_ms}`, `error {message}` (`run.py:24-25,112-214`).

### What was tricky to build

- Deciding package ownership for dependencies of a single `package.json`: `lab-workbench/package.json` holds both
  the UI and the server dependencies, so `hono`, `@hono/node-server` and the `pi` packages were attributed to
  `lab-workbench/server` (where they are used) and the UI libraries to `lab-workbench`.
- Service calls into packages outside the shared name list (the LLM provider, the COCO image host) use
  descriptive names marked `(external)`.

### What warrants a second pair of eyes

- The `@kiln/workbench → @kiln/server` and `@kiln/server → lab-workbench/server` service-call rows describe other
  areas' packages from area D's side; areas B and C may describe the same calls under different descriptions.
- `modules.loc` for directory rows (`src/components`, `views`) is TS/TSX only; CSS is in the notes.

### What should be done in the future

- The orchestrator may merge the hypothesis duplications (area B's "hypothesis evaluation: @kiln/kiln std.evidence
  vs @kiln/lab lang/hypothesis" and this area's "hypothesis verdicts: lab-workbench HypothesisView vs @kiln/lab
  lang/hypothesis") into one three-way row.

### Code review instructions

- Regenerate and validate:

  ```bash
  T=/Volumes/SSD/code/kiln/ttmp/2026/10/21/KILN-004--kiln-perf-lab-component-inventory-reusable-packages-duplication-and-complexity-map-intern-guide
  python3 <scratchpad>/gen_perf_lab_json.py $T/various/inventory/perf-lab.json
  python3 $T/scripts/load_inventory.py --check
  ```

- Spot-check endpoint `handler_path` lines against `lab-workbench/server/app.ts` and `assistant/service.ts`.

### Technical details

- Format names introduced by this area: `perf-lab capture spec/1`, `perf-lab workload event stream`,
  `perf-lab workload rep record`, `perf-lab run bundle`, `lab IR/1`, `detection-qualification/v1`, `lab.js program`.
- `db_tables.schema_name` is `perf-lab` for all 17 tables; `endpoints.auth` is `local-only` for all 33.

## Step 4: Final validation, crosslinks, and a diary label the loader misread

The last check built the database to a scratch path rather than the ticket, to see how the area's rows and diary
steps link up. It showed one defect of this diary's own making: the loader reads any `**Commit…**` line as the step's
commit, so the "**Commit (previous):**" lines I wrote in Steps 2 and 3, recording the previous commit as instructed,
were taken as those steps' own commits. They are relabelled "**Previous commit:**", which the loader ignores; it then
falls back to the commit that first added each step heading, which is the right answer. Nothing else changed in the
earlier entries.

### Prompt Context

**User prompt (verbatim):** see `01-investigation-diary.md`, Step 1. **Relayed instruction:** see Step 1.
**Orchestrator's resume message (summary):** see Step 2.

**Previous commit:** `7335529` — "KILN-004 D: perf-lab inventory rows; notes section 12 diagrams; diary step 3".

### What I did

- `python3 <ticket>/scripts/load_inventory.py --out <scratchpad>/inv-check.sqlite` (exit 0), then:

  ```sql
  select * from v_area_counts where area='perf-lab';
  select step, how, count(*) from diary_links where agent_area='perf-lab' group by step, how;
  select step, title, commit_hash from diary_entries where agent_area='perf-lab';
  ```

- Read the loader's commit parsing: `scripts/load_inventory.py:151`,
  ``re.search(r"\*\*Commit[^*]*\*\*:?\s*`?([0-9a-f]{7,40})`?", block)``.
- Relabelled the two lines with `sed -i '' 's/^\*\*Commit (previous):\*\* /**Previous commit:** /'` on this diary.

### Why

- A diary step's `commit_hash` is what the site will show as "the commit of this step"; the previous commit there
  would point every step one commit too early.

### What worked

- Area D in the scratch database: 102 modules, 27 facts, 33 endpoints, 7 duplications, 10 reusable components,
  8 hotspots, 7 formats, 3 diary steps (4 with this one), 340 diary links — step 1: 259 explicit, 2 mentioned;
  step 2: 53 explicit, 2 mentioned; step 3: 13 explicit, 11 mentioned.
- `load_inventory.py --check` exits 0 with every area's files present.

### What didn't work

- Before the relabel, `diary_entries` showed step 2 → `ae14e8d` and step 3 → `ab74354`, the previous commits, not
  the steps' own (`ab74354`, `7335529`).

### What I learned

- The diary contract's `**Commit…**` line is a step's own commit; the "previous commit" convention needs a label that
  does not start with `Commit`.

### What was tricky to build

- N/A beyond the label clash above.

### What warrants a second pair of eyes

- Other areas' diaries may carry the same "Commit (previous)" pattern if they followed the same instruction.

### What should be done in the future

- The loader or the contract could name the previous-commit convention explicitly, so every area writes the same
  label.

### Code review instructions

- `sqlite3 <db> "select step, commit_hash from diary_entries where agent_area='perf-lab'"` after a rebuild should
  show each step with the commit that added it.

### Technical details

- Area D commits: `ae14e8d` (diary step 1), `ab74354` (diffs, step 2), `7335529` (inventory JSON, diagrams,
  step 3), and the commit adding this step.
