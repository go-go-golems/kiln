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
LastUpdated: 2026-10-21T11:40:00-04:00
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
