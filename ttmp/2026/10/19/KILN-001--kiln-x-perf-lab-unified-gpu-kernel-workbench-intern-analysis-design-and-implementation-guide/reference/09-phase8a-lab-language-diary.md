---
Title: Phase 8a diary — Perf Lab's lab.js language as the headless package @kiln/lab
Ticket: KILN-001
Status: active
Topics:
    - kiln
    - perf-lab
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://packages/lab/src/index.ts
      Note: The public API of @kiln/lab (the "As built" section lists it)
    - Path: repo://packages/lab/src/lang/values.ts
      Note: The value layer on @kiln/evidence (adapter: valueFrom, revive, computed, defined)
    - Path: repo://packages/lab/src/lang/stats.ts
      Note: stats.pairedRatio / offered / summary on evidence's median and pairedRatio (P-9, P-10, P-15)
    - Path: repo://packages/lab/src/lang/hypothesis.ts
      Note: evaluateHypothesis on evidence's verdict (P-8), moved out of HypothesisView.tsx
    - Path: repo://packages/lab/src/data/lab-data.ts
      Note: The injected data interface LabData, createMemoryLabData, bundlesNeeded
    - Path: repo://packages/lab/src/data/env.ts
      Note: labEnv(data), syntheticEnv, buildSynthetic
    - Path: repo://packages/lab/src/node/perf-lab-store.ts
      Note: Reads Perf Lab's SQLite store from a temporary copy, read-only
    - Path: repo://packages/lab/scripts/check-pl.ts
      Note: The done-condition script (pnpm --filter @kiln/lab check:pl)
    - Path: repo://packages/lab/scripts/extract-fixtures.ts
      Note: Produced test/fixtures/local-sampler-q2048.json (see Step 5)
    - Path: repo://packages/lab/test/hypothesis.test.ts
      Note: Three-valued and P-8 verdict cases
    - Path: repo://packages/lab/test/measured.test.ts
      Note: The real-shaped fixture reproduces Perf Lab's numbers exactly
ExternalSources: []
Summary: 'Chronological diary of Phase 8a (guide §33.1, §35 Phase 8): Perf Lab''s lab.js language moved into the headless package @kiln/lab on @kiln/evidence values, statistics and verdicts, with an injected data layer and a read-only check against Perf Lab''s SQLite store.'
LastUpdated: 2026-10-19T17:25:00-04:00
WhatFor: "Reviewing how the lab language was ported, which numbers changed and why, and the package's public API"
WhenToUse: "Before building lab boards on @kiln/lab (Phase 8b), writing its /api/lab client, or changing its estimators or verdicts"
---

# Phase 8a diary — Perf Lab's lab.js language as the headless package @kiln/lab

Written by the Phase 8a worker. The main diary is `01-investigation-diary.md`; its Step 1 holds the user's verbatim
requests. Paths: `T/` is this ticket, `PL/` is `lab-workbench/` (Perf Lab as received, never modified), `E/` is
`packages/evidence/`, `L/` is `packages/lab/` (this phase), `$SCRATCH` is this session's scratchpad. Two other workers
share the working tree: Phase 8b builds lab boards as dock views (`apps/workbench/src/ui/lab/`), Phase 8c ports Perf
Lab's server routes into `apps/server` under `/api/lab`. This worker writes only under `L/` and this diary, and does
not commit.

## Step 1: Read the specification, the language and the evidence package; record a baseline

Phase 8a moves `PL/src/lang/` into a package that runs without React, Redux or a server, and replaces its value and
statistics code with `@kiln/evidence`. Before porting I read the guide's §13–14 (the language and the evidence
contract), §24–25 and §29 (provenance, statistics, verdicts), §33–36 (lab programs, the phase, testing rules), all of
`E/src`, all of `PL/src/lang` (4.3 k lines with tests), the data modules the language needs headlessly
(`PL/src/data/{source,generate,capabilities,bundles,datasets,env}.ts`), the hypothesis view, and the server code that
stores and serves bundles (`PL/server/{app,store,bundles,evidence,datasets,probe}.ts`).

Because the task forbids silently changing results, I first ran **Perf Lab's own code**, unmodified, on every preset
with synthetic data and on the two measured programs against `PL/.data/perf-lab.sqlite` (opened read-only), and kept
the output as the baseline the port is compared with. Perf Lab's code cannot run under plain Node (parameter
properties, the `@/` alias, Vite `?raw` imports), so the script runs under `PL`'s own `tsx` from the scratchpad, reads
preset sources with `fs`, and reimplements only `evaluateHypothesis` (the React file also imports CSS) — a verbatim
copy of the logic of `HypothesisView.tsx` L19-48.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Coordinator assignment (summary, not verbatim):** implement Phase 8a: `packages/lab` (`@kiln/lab`) shaped like
`@kiln/evidence` (erasable TypeScript, relative `.ts` imports, bundles for the browser, Node-only readers in a
separate entry); replace the language's `values.ts`/`stats.ts` with `@kiln/evidence` and record every changed number;
move the hypothesis verdict out of `HypothesisView.tsx` onto evidence's `verdict`; port the synthetic data layer and an
`appEnv`-like factory whose data access is injected, shaped so a thin client of Phase 8c's `/api/lab` routes can
satisfy it; port the tests and fixtures, adding tests for the estimators and verdicts; write `scripts/check-pl.ts`
(`check:pl`) that opens `PL/.data/perf-lab.sqlite` read-only, builds `local-sampler.lab.js` and `dino-pr1005.lab.js`,
and prints every derive and verdict. Write only under `packages/lab/` and this diary; no commits.

**Assistant interpretation:** a faithful port first (same capture hashes, same derive numbers), then the deliberate
semantic changes the guide asks for (P-6, P-7, P-8, P-9, P-10), each recorded with its before/after effect.

**Inferred user intent:** Phase 8b and the agent need verdicts and derived rows without a browser view; the measured
programs must give the same answers as Perf Lab unless a change is a known fix.

### What I did

- Read the guide sections above, `E/src/*.ts`, `PL/src/lang/*.ts`, the data modules, `HypothesisView.tsx`,
  `PL/server/{app,store,bundles,evidence,datasets,probe,db}.ts`, `PL/src/features/server/thunks.ts` (how the app loads
  the catalog, bundles and datasets before building), the Phase 8c diary's header (route shapes kept, base path
  `/api/lab`) and the imports of 8b's `apps/workbench/src/ui/lab/board.jsx` (`materialize`, `makeDollar`,
  `resolveValue`, `isLive`, `isParamRef`, `isSignalRef`), so the package exports what both neighbours need.
- Inspected the store read-only (scratch script, `DatabaseSync(path, { readOnly: true })` on the file in place — see
  Step 4 for why that was wrong): 70 artifacts (50 measured: 32 local-sampler at four `queries` values; 18 for PR 1005
  from the DGX archive or the local CPU run), 80 runs,
  80 bundles, 1 archive, 1 dataset of 128 images / 799 annotations, 128 media rows. Bundle blobs are gzip JSON
  (`1f 8b 08 00`); Values inside keep `__value: true`; only two shapes occur: `observed` numbers (106) and
  `unknown`/`null` with a reason (12).
- Wrote the baseline script `$SCRATCH/baseline/baseline.mts` and ran it under `PL/node_modules/.bin/tsx --tsconfig
  PL/tsconfig.json`; output in `$SCRATCH/baseline/baseline.json`. `git status` under `PL/` stayed empty.

### Why

- A port of 4.3 k lines with a changed value layer can drift in many small ways (a quantile, a seed, a provenance
  label); an executable baseline from the original code is the only reliable reference for "did a number change".

### What worked

- Perf Lab's verdicts on the real data (its own code, its own verdict rule):

  | Program | Hypothesis | Verdict (Perf Lab) |
  | --- | --- | --- |
  | local-sampler | compile-removes-intermediate | refuted (the candidate allocates 1 intermediate-sized block) |
  | dino-pr1005 | outputs-exact | supported |
  | dino-pr1005 | latency-halved | refuted (reduction 0.304 and 0.301 per run) |
  | dino-pr1005 | memory-within-20 | refuted (2 of 12 pool × state rows above 1.2) |
  | dino-pr1005 | prompt-reuse | supported |
  | dino-pr1005 | cpu-parts-preserve | supported |
  | dino-pr1005 | fusion-active | supported |

- Key derive values: local-sampler `speedup` median 2.4964 × with CI [2.3744, 2.7211] over 4 paired processes; dino
  `latency` reduction 0.30376 (#0), 0.30145 (#1), 0.30293 (both).
- Every capture of both programs was `cached` (no pending plan) once the local host report carried
  `tools.workloads = 1fc6b670a8a6` (the check script's step explains where that value comes from).

### What didn't work

- `tsx baseline.ts` failed: `ERROR: Top-level await is currently not supported with the "cjs" output format` (tsx
  treats a `.ts` file outside a `"type": "module"` package as CommonJS). Renaming the script to `.mts` fixed it.

### What I learned

- Capture identity is `cyrb53(stableStringify(spec))` and the store is keyed by it; the port must keep that hash
  bit-for-bit or the catalog stops matching (P-5 cannot be fixed here without a coordinated store migration).
- The language reads provenance only when it *produces* values (`derived`, `missing`); `provOf` of a plain number is
  used by Perf Lab's views only. Evidence's P-7 change (a plain number is `unknown`) therefore changes no derive and no
  verdict; it matters to the Phase 8b renderers.
- `stats.pairedRatio`'s bootstrap draws from `mulberry32(seedFrom('pairedRatio:' + ratios))`; evidence's `rng(n)` for
  an integer `n` is the same `mulberry32(n)`, and evidence's resampling loop draws in the same order. Passing Perf Lab's
  seed as an integer to evidence's `pairedRatio` should reproduce its intervals exactly (checked later).

### What was tricky to build

- N/A (reading step).

### What warrants a second pair of eyes

- The baseline's local host report is reconstructed; a different `tools.workloads` makes every local capture
  `execute` and every local derive empty, which is the correct behaviour, not a port defect.

### What should be done in the future

- N/A.

### Code review instructions

- `$SCRATCH/baseline/baseline.mts` is the reference run; `$SCRATCH/baseline/dump.mjs` normalises results (a Value
  becomes `{$v, prov, unit?, reason?}`, an entity `{$ent: ref}`) so the port's output can be diffed against it.

### Technical details

- Bundle storage: `run_bundles.entities` and `.links` are `gzip(JSON.stringify(x))` (`PL/server/bundles.ts`);
  `runs.run_json` is plain JSON; `GET /bundles?hashes=` returns `{[hash]: [{run, entities, links}]}` ordered by rep.

## Step 2: Create the package, replace the value layer, port the language and the data layer

The package was created in the shape of `E/`: `package.json` with `exports` (`.` → `src/index.ts`, `./node` →
`src/node/index.ts`, `./presets/*` → the program files), `test: vitest run`, `typecheck: tsc --noEmit -p .`, a
`tsconfig.json` extending the root base config (erasable syntax only, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`), and `@kiln/evidence: workspace:*` as its one dependency. I copied `PL/src/lang/*.ts`,
the six data modules, the three tests, the golden detection fixture and all eleven programs (plus the two scripted
reply files) into `L/`, deleted the copies of `values.ts`, `stats.ts` and `util.ts`, and rewrote those three on
evidence. Everything else was edited in place, file by file, until `tsc` was clean.

The port has two kinds of change: mechanical ones forced by the toolchain (Node 26 type stripping, the stricter base
config) that must not change behaviour, and semantic ones the guide asks for, each of which is listed under "What I
did" with its effect measured in Step 3.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** one value implementation (evidence's) with a thin adapter; estimators keep their DSL
surface; the data layer loses Redux, `fetch` and module-level server caches in favour of an injected interface.

**Inferred user intent:** a package Phase 8b can import in the browser and an agent can run in Node, giving the same
answers as Perf Lab.

### What I did

- **Linking.** `pnpm install` at the root linked the package. The first attempt also listed `esbuild` as a dev
  dependency (to test browser bundling); that re-resolved `vite`'s peer dependencies across the workspace lockfile, so
  I removed it and ran `pnpm install` again. The lockfile diff is now only the new `packages/lab` importer (16 lines).
- **Values (`src/lang/values.ts`).** Re-exports evidence's `observed/derived/heuristic/illustrative/missing`, `isValue`,
  `raw`, `num`, `isMissing`, `provOf`, `combine`, `seal`, `isSealed`, `ProvenanceError`. Added: `valueFrom(fields)`
  (rebuild a Value from JSON through evidence's constructors; an `unknown` record with a value becomes missing with the
  value in its reason, never data), `revive(x)` (rebuild every `__value` record at any depth — used on bundles),
  `withValue`, `fieldsOf`, `computed(prov, value, opts)` (evidence has one constructor per class; this picks it from a
  provenance computed at run time), `defined(opts)` (drops undefined fields for `exactOptionalPropertyTypes`), and the
  type `LinkEvidence` (Perf Lab's `Evidence`: how a link was established, which is not a value provenance).
  Perf Lab's `val` (observed), `makeValue` and `sealObserved` are gone.
- **Helpers (`src/lang/util.ts`).** `hash` stays cyrb53 (P-5: the store and the /api/lab routes are keyed by it).
  `rng(seedText)` is evidence's `rng(seedFrom(seedText))` — the same mulberry32 stream Perf Lab used, so generated
  runs are bit-identical. Perf Lab's `quantile` and `mulberry32` were removed; callers use evidence's `quantile`,
  `median`.
- **Statistics (`src/lang/stats.ts`).** `stats.pairedRatio(opts).of(rows)` keeps its options and result shape, takes
  per-repetition medians from evidence's `median` and the ratio, bootstrap and interval from evidence's `pairedRatio`.
  Its seed is the `seed` option if given (Perf Lab declared and ignored it: P-9), else
  `seedFrom('pairedRatio:' + ratios.join(','))` — Perf Lab's own stream, passed as an integer so evidence's `rng`
  uses it unhashed. New options `baseline`/`candidate` name the arms (Perf Lab hard-coded them: P-9). New result
  fields: `caveat` (evidence's small-n note, P-15), `seed`, `n`; the median Value now carries `ci` and `n`.
  `stats.offered` (P-10): a request without a scheduled arrival no longer counts as arriving at t = 0 (it is left out
  of its process's window and named in the method); a process with no arrival times makes both rates missing; an
  on-time request without a window count makes `windowsOnTime` missing instead of counting as one window.
  `stats.summary` is unchanged (it is `rows.stats`).
- **Rows (`src/lang/rows.ts`).** `makeEnt` seals the whole entity with evidence's deep `seal` (Perf Lab sealed the
  entity and its `metrics` shallowly: P-6). Aggregates (`stats`, `sum`, `groupBy().agg`) take evidence's `quantile`
  (same type-7 formula) and the provenance `combine('derived', …inputs)`: over plain or observed fields this is
  `derived` as before; over illustrative inputs it is now `illustrative`.
- **Synthetic data (`src/data/generate.ts`).** The six `val(…)` calls (generated ncu counters) became
  `illustrative(…)` (P-7). Every number is unchanged.
- **Hypotheses (`src/lang/hypothesis.ts`, new).** `evaluateHypothesis(registry, state, id)` replaces the logic in
  `HypothesisView.tsx`: it materializes the prediction query, collects the runs of every `supportedBy` query's
  entities with their validity, and calls evidence's `verdict({rows, predicate, support})`. P-8 is fixed by that call:
  a throwing predicate leaves its row undecided, a row whose predicate read a missing field is undecided, and a
  predicate may return `null` (evidence's `below`/`above`). A failing prediction or support query yields `open` with
  the error in `reasons` instead of throwing. `evaluateHypotheses` judges them all.
- **Erasable syntax.** Rewrote the parameter properties of 16 classes (`Query`, `Grouped`, `MatcherB`, `CompareB`,
  `ParamSpec`, `ViewB`, `SubRecorder`, `ArmB`, `CaptureB`, `ExperimentB`, `BoardB`, `HypothesisB`, `LabB`,
  `BuildError`, `NeedsEvidence`, the generator's `Gen`) as declared fields assigned in the constructor. Perf Lab
  targets ES2022, so its class fields already had define semantics; own-property sets are unchanged, which matters
  because `stableStringify` (sorted keys) feeds the capture hash.
- **Strictness.** `exactOptionalPropertyTypes`: optional fields of the IR, env and runtime types became
  `?: T | undefined` (the code assigns `undefined` explicitly; JSON drops it either way). `noUncheckedIndexedAccess`:
  `!` on indexes that are in range by construction (detections, algorithms, the generator), `?? fallback` elsewhere.
- **Data layer.** `capabilities.ts` became a factory, `capabilitiesFor(localReport, error)` (Perf Lab:
  `setLocalReport` into a module variable). `datasets.ts` lost its fetches and module caches and keeps the pure
  `indexDataset` (image and annotation entities) plus `datasetProvider(details, mediaUrl)`; media URLs default to
  `/api/lab/media/<sha>` (Perf Lab: `/api/media/<sha>`). `bundles.ts` lost its fetch and cache and keeps the JSON
  shape and `reviveBundles`. New `lab-data.ts`: the `LabData` interface and `createMemoryLabData`, whose setters take
  the /api/lab routes' JSON as is (catalog, bundles, evidence, datasets, health features, local report), and
  `bundlesNeeded(ir, data)` (Perf Lab's thunk: measured hashes of the plan whose bundles are not loaded). `env.ts`:
  `syntheticEnv(available, {local})`, `labEnv(data)` (Perf Lab's `appEnv`), and `buildSynthetic(source, opts)` (seed
  build + real build, as the Perf Lab app does on first open and as its tests did by hand).
- **Presets.** `src/presets.ts` lists the eleven programs (metadata copied from `PL/src/presets/index.ts`, sources
  not inlined); `@kiln/lab/node` reads them (`readPresets`, `readPreset`); a Vite app can import
  `@kiln/lab/presets/<file>?raw`.
- **Node entry (`src/node/`).** `readPerfLabStore(dbPath, {localReport})` opens Perf Lab's SQLite store with
  `DatabaseSync(path, { readOnly: true })` (in place at this step; since Step 4 it opens a temporary copy), runs the same queries as Perf Lab's server routes (catalog of available
  artifacts, bundles joined with runs and gunzipped, archives with their datasets, dataset details with media
  presence), fills a `MemoryLabData`, and closes the database.
- **Tests.** Ported `build.test.ts`, `evidence.test.ts` and `detections.test.ts`: `@/` imports became `../src/index.ts`,
  `setLocalReport` became the `local` option, the hypothesis test calls the package's `evaluateHypothesis`, the golden
  JSON is imported with `with { type: 'json' }`. All 60 passed on the first full run.

### Why

- Evidence's constructors turn null and NaN into missing values and its seal is deep; a second value implementation
  in the language would let the two drift, which is the problem §33.1 exists to remove.
- Builds are synchronous (the `new Function` program runs once and every derive is read on demand), so the injected
  data must be synchronous too; loading is the caller's job, which keeps network code out of the package.

### What worked

- `tsc` is clean and all 60 ported tests pass (`Test Files 3 passed (3)`, `Tests 60 passed (60)`).

### What didn't work

- `Write` to a copied file failed with `File has not been read yet. Read it first before writing to it.`; the three
  files to be rewritten were deleted and written fresh, the others edited after a read.
- The first `pnpm typecheck` after the mechanical import rewrite reported 122 errors, almost all
  `exactOptionalPropertyTypes` (TS2375/TS2379/TS2412) and `noUncheckedIndexedAccess` (TS2532/TS18048); none was a
  behaviour problem.

### What I learned

- Evidence's `seal` copies the object and throws on `defineProperty`, so anything that later marks a row must skip
  sealed rows. The runtime's `markDerived` already skipped entities (by prototype); a derive that returns sealed
  non-entity rows (e.g. a `metrics` object taken from an entity) would have thrown, so it now also skips `isSealed`
  rows.
- Perf Lab's revive and the server agree on `{__value: true, …}`; only two Value shapes occur in the stored bundles
  (`observed` numbers and `unknown`/`null` with a reason), both of which evidence's constructors reproduce exactly.

### What was tricky to build

- Keeping the capture hash. It is cyrb53 of `stableStringify` of the lowered spec; the spec contains estimator
  descriptions (`stats.pairedRatio(...)` lowers to its `describe()` string) and options. The new `pairedRatio` options
  appear in its `opts` only when given, and `describe()` is unchanged, so every preset's hashes are as before (Step 3
  checks all of them against Perf Lab's).

### What warrants a second pair of eyes

- `computed(prov, …)` maps a computed `unknown` to a missing value; it cannot occur today (aggregates combine with
  `'derived'` and skip missing inputs) but would hide a value if a future input had an unknown class with a value.
- `revive` treats every object with `__value: true` as a Value: a program's own data with that key would be rebuilt.

### What should be done in the future

- P-5 (cyrb53 capture hashes) stays until the store and the /api/lab routes migrate together.

### Code review instructions

- Start with `src/lang/values.ts`, `src/lang/stats.ts`, `src/lang/hypothesis.ts`, `src/data/lab-data.ts`,
  `src/data/env.ts`; the rest of `src/lang` differs from Perf Lab only mechanically
  (`diff -r lab-workbench/src/lang packages/lab/src/lang`).
- `pnpm --filter @kiln/lab typecheck && pnpm --filter @kiln/lab test`.

### Technical details

- Package exports: `"."` (browser-safe language and data layer), `"./node"` (store and preset readers),
  `"./presets/*"` (program files).

## Step 3: Compare the port with Perf Lab's own results

With the port compiling, I ran it on exactly the inputs of the Step 1 baseline: every preset built synthetically with
the same local host report, and the two measured programs against `PL/.data/perf-lab.sqlite` (read with the package's
own `readPerfLabStore`, read-only — at this step still on the file in place; see Step 4). The scratch script `$SCRATCH/baseline/port.mts` writes the same JSON shape as the
baseline (every derive normalised by `dump.mjs`, every verdict, every capture hash and status, the lint codes), and
`$SCRATCH/baseline/diff.mjs` lists every differing leaf, grouped.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** "if a number changes, record before/after and decide deliberately".

**Inferred user intent:** no silent change of a result.

### What I did

- `node port.mts port.json` (plain Node 26, no tsx) and `node diff.mjs baseline.json port.json`.

### What worked

- **Every capture hash and status, every lint, every verdict and every number is identical** — 11 synthetic presets
  and both measured programs, including the bootstrap intervals (local-sampler speedup: median 2.4964459993879693 ×,
  CI [2.3744362958359226, 2.721142926800785] before and after). The P-10 fix changes no synthetic number (every
  generated request has an arrival time and a window count).
- The 37 differing leaves are all additions or deliberate relabelling:

  | Difference | Count | Before (Perf Lab) | After (@kiln/lab) | Decision |
  | --- | --- | --- | --- | --- |
  | `speedup.caveat` | 5 | — | `"n = 4: the interval is bounded by the sample range"` (real); `null` (synthetic, n ≥ 6) | keep: P-15 says it must be visible |
  | `speedup.n`, `speedup.seed` | 10 | — | `4`, `2082729843` (real local-sampler) | keep: the seed reproduces the interval |
  | scenario-a `intermediate[0].measuredTraffic.prov` | 1 | `derived` | `illustrative` | keep: an aggregate of generated (illustrative) counters is illustrative (P-7) |
  | hypothesis `reasons` | 15 | — | evidence's reasons (e.g. `row 7: the prediction does not hold`) | keep |
  | `passes` of unqualified hypotheses | 6 | per-row booleans | none | keep: evidence does not judge rows when the support is invalid |

### What didn't work

- N/A.

### What I learned

- On this store the verdict change P-8 makes no difference: no predicate throws and no predicate reads a missing
  field in a row it would otherwise refute. The real verdicts are therefore the same under both rules.

### What was tricky to build

- N/A.

### What warrants a second pair of eyes

- The local-sampler interval is exactly [min, max] of the four ratios — that is the small-n bootstrap, and the new
  `caveat` says so; the claim "2.5 × slower" rests on four processes.

### What should be done in the future

- N/A.

### Code review instructions

- Rerun: `cd $SCRATCH/baseline && node port.mts port.json && node diff.mjs baseline.json port.json`.

### Technical details

- Synthetic verdicts (both versions): hello lints `no-quality-gate`, `no-activation-rule`, `no-repetition`;
  scenario-a `sampler-traffic` supported; synthetic local-sampler `compile-removes-intermediate` unqualified (the
  generated runs fail the activation check); synthetic dino-pr1005: four unqualified, `memory-within-20` and
  `fusion-active` open.

## Step 4: Stop opening Perf Lab's store in place

Mid-phase the coordinator relayed Worker 8c's finding. A read-only `DatabaseSync` open of Perf Lab's WAL database still
rewrites `PL/.data/perf-lab.sqlite-shm` (its mtime changes), and nothing under `PL/.data` may be written. Read-only
protects the database file, not the WAL index. Any reader of a WAL database maps and, if needed, rebuilds the `-shm`
file beside it.

`readPerfLabStore` now copies the store and reads the copy. Before the change, my scratch scripts and the fixture
extractor had opened the original in place several times. This step records which runs did that and what they touched.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Coordinator message (verbatim):** "Constraint for check:pl: do not open lab-workbench/.data/perf-lab.sqlite in
place, even read-only. Worker 8c found that a read-only DatabaseSync open of that WAL database still rewrites
lab-workbench/.data/perf-lab.sqlite-shm (its mtime changes), and nothing under lab-workbench/.data may be written. Copy
perf-lab.sqlite and perf-lab.sqlite-wal (not -shm) into a fresh temp directory (mkdtemp under os.tmpdir()), open the
copy read-only, and delete the temp dir afterwards; files the bundles reference (evidence archives, media) can be read
in place with readFile. If you already ran check:pl against the original, say so in your diary and receipt. Also: root
`pnpm test` currently fails in packages/lab on unresolved `@/data/capabilities`, `@/data/env` and
`./__fixtures__/quality-golden.json`; make sure those resolve before you hand back. When you report, list @kiln/lab's
public exports by name (the browser entry, and what an injected-data env factory takes), since I am wiring
apps/workbench/src/ui/lab/api.js to them."

**Assistant interpretation:** change the reader to work on a temporary copy, and verify it leaves `PL/.data` untouched.
Disclose every earlier in-place open. Make the root test run green.

**Inferred user intent:** Perf Lab's data directory is evidence and must stay byte-for-byte as received.

### What I did

- `src/node/perf-lab-store.ts`:
  - `readPerfLabStore` copies `perf-lab.sqlite` and, when present, `perf-lab.sqlite-wal` (never `-shm`) into
    `mkdtempSync(join(tmpdir(), 'kiln-lab-pl-'))`.
  - It opens the copy with `DatabaseSync(copy, { readOnly: true })`, runs the queries, and closes it.
  - It removes the temporary directory in a `finally` block (`rmSync(dir, { recursive: true, force: true })`).
  - The reader opens no archive or media file: media presence is a join against the `media` table.
- Checked with `stat` before and after `check:pl`, the package tests and the root `pnpm test`. The three files under
  `PL/.data` kept their mtimes and sizes, and no `kiln-lab-pl-*` directory was left in `os.tmpdir()`.
- **Disclosure: in-place opens before this step.** All of these used `DatabaseSync(…, { readOnly: true })` on the
  original file:
  - Step 1's store inspection scripts and `$SCRATCH/baseline/baseline.mts`.
  - Step 3's `$SCRATCH/baseline/port.mts`, through the then in-place `readPerfLabStore`.
  - The `scripts/extract-fixtures.ts` runs that produced `test/fixtures/local-sampler-q2048.json`. The last of them ran
    at 17:11.

  `check:pl` itself never ran against the original. I wrote it after this change, and every run read the copy (its
  header says "read from a temporary copy").
- State of `PL/.data` after the change:

  | File | mtime | Size (bytes) | Content |
  | --- | --- | --- | --- |
  | `perf-lab.sqlite` | 2026-10-12 20:44:53 | 1,941,504 | unchanged (sha256 `f0e3c124c06b…`, same as at Step 1) |
  | `perf-lab.sqlite-wal` | 2026-10-19 09:17:23, before this session | 420,272 | unchanged (sha256 `cd649f3340fe…`) |
  | `perf-lab.sqlite-shm` | 2026-10-19 17:11:34 | 32,768 | rewritten by my last in-place open |

  I did not record the `-shm`'s hash before my first open, so I cannot show that its bytes are the same. It is
  SQLite's WAL index, rebuilt from the WAL on demand. No checkpoint ran: the WAL's size and mtime are unchanged, and so
  is the database file.

### Why

- A copy is the only read that is both write-free and complete. The WAL holds 420 KB of frames from 2026-10-19 that
  were never checkpointed into the 2026-10-12 database file. A reader that ignores the WAL, such as one opened with
  SQLite's `immutable` flag, would not see what Perf Lab's server serves. I did not try `immutable`.

### What worked

- The copy-based reader gives the same counts as the in-place one: 70 artifacts, 50 measured, 80 bundles, 1 archive,
  1 dataset. `check:pl` (Step 6) reproduces the Step 1 headline values and all seven verdicts.

### What didn't work

- I tried to re-run Step 3's full comparison through the copy-based reader:

  ```text
  cd $SCRATCH/baseline && node port.mts port2.json && node diff.mjs baseline.json port2.json
  ```

  Diagnostic: `Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Modify Shared
  Resources]`. I did not retry. Step 3's leaf-by-leaf diff therefore stands as recorded from the in-place read. The
  measured numbers it compared are rechecked through the copy by `check:pl` (Step 6) and by `test/measured.test.ts`
  for local-sampler.

### What I learned

- In SQLite's WAL mode, "read-only" does not mean "writes nothing": the `-shm` index is shared state that every
  connection maps. Treat an evidence store as immutable only by never opening it in place.

### What was tricky to build

- N/A. The change is about ten lines.

### What warrants a second pair of eyes

- The `-shm` mtime of 17:11:34. If anything compares `PL/.data` against a checksum list that includes `-shm`, it will
  differ.
- `scripts/perf-lab.ts`'s `openPerfLab()` reads the store twice. The first read gives the measured artifacts the local
  report is reconstructed from; the second serves the builds. So each `check:pl` makes two temporary copies of about
  2.3 MB each.

### What should be done in the future

- Phase 8c or a later phase should give Perf Lab's store a read path that cannot write. A frozen copy (database file
  plus WAL) checkpointed into one file would let readers open it with `immutable=1`.

### Code review instructions

- `src/node/perf-lab-store.ts`, lines 45–60.
- Verify with `stat -f '%N %m %z' lab-workbench/.data/perf-lab.sqlite*` before and after
  `pnpm --filter @kiln/lab check:pl`.

### Technical details

- SQLite rebuilds the WAL index from the WAL on first open of the copy. That is why the `-shm` need not, and must not,
  be copied.

## Step 5: Tests for the estimators, the verdict and the data layer; the real-shaped fixture

The ported tests (60 in three files) cover the language. This step adds tests for what Phase 8a changed: the
estimators on evidence, the three-valued verdict, the injected data layer, and the browser entry. It also adds one
fixture with real measured data, so the package checks Perf Lab's numbers without reading `PL/.data` at test time.

The package now has 98 tests in 8 files, and none of them reads `PL/.data`, `apps/server/.data` or a GPU host.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** test every deliberate change, with at least one case where three-valued logic answers
differently from Perf Lab's two-valued rule. Test real data from a committed fixture produced by a script kept in the
package.

**Inferred user intent:** the next phase can change the package and find out from `pnpm test` alone whether a result
moved.

### What I did

- **`test/stats.test.ts` (11 tests).**
  - `pairedRatio`:
    - checked against evidence's `pairedRatio` with Perf Lab's default seed;
    - an explicit seed, numeric and string (P-9);
    - arm names `eager`/`compiled`: missing without them, median 0.565 with them (P-9);
    - the n = 4 caveat, with the interval inside the sample range (P-15);
    - invalid processes and refused pairs excluded and named (`5 paired processes; 2 excluded`);
    - missing (not zero) when nothing pairs.
  - `offered`:
    - windows summed per process (16/9 requests and 32/9 windows per second, 2 expired);
    - a request without an arrival time left out of the window (P-10: an 8 s window, not Perf Lab's 10 s);
    - missing rates when a process has no arrival times or an on-time request has no window count.
  - Aggregates:
    - type-7 quantiles that exclude and count missing values;
    - provenance: observed or plain inputs give `derived`, any illustrative input gives `illustrative`.
- **`test/hypothesis.test.ts` (10 tests).**
  - Three-valued `below(r, 0.5)` over CI rows:
    - all below → supported;
    - one straddling → **open**, where the two-valued `r.hi < 0.5` gives **refuted**;
    - one wholly above → refuted even though another row is undecided.
  - P-8 cases, each noting what Perf Lab answered:
    - a throwing predicate → open (Perf Lab: refuted);
    - `!(r.x > 1)` on a missing `x` → open with `row 0: missing x (not measured)` (Perf Lab: supported);
    - an unread missing field does not hold a row open.
  - Failures and edge cases:
    - a failing prediction query → open with `the prediction query failed: boom`;
    - no rows → open.
  - Support and ordering:
    - invalid support → unqualified, naming the run (synthetic local-sampler);
    - `evaluateHypotheses` in declaration order;
    - an unknown id throws.
- **`test/data.test.ts` (9 tests).**
  - `revive`: works at depth, and an `unknown` value with data becomes missing.
  - A `MemoryLabData` filled with route JSON:
    - captures are `cached` from the catalog alone, but derives are missing until `addBundles`;
    - `bundlesNeeded` lists exactly the measured hashes, then nothing;
    - an empty bundle list counts as loaded;
    - `evidenceBlockedBy` follows the health features;
    - the local report is read lazily.
  - Deep seal (P-6): assigning to a run, assigning inside its `validity`, or defining a property throws
    `ProvenanceError`.
  - Dataset indexing (normalised boxes, media URLs, strata) and the 8-hex prefix lookup.
- **`test/measured.test.ts` (5 tests)**, on the fixture:
  - the catalog hashes are exactly the plan's cached hashes;
  - Perf Lab's latency quantiles, bit for bit;
  - the four pairs, median 2.4964459993879693 and CI [2.3744362958359226, 2.721142926800785], with the caveat;
  - the `blocks` rows and `compile-removes-intermediate` refuted, with its support counts;
  - measured runs stay `measured: true`, `synthetic: false`.
- **`test/browser-safety.test.ts` (3 tests)** walks the import graph statically from `src/index.ts`:
  - only relative `.ts` modules and `@kiln/evidence`;
  - never `src/node/`;
  - no `process.env`, `Buffer`, `__dirname` or `require('…')`.
- **The fixture.** `scripts/extract-fixtures.ts` (`pnpm --filter @kiln/lab fixtures`) works in four parts:
  - **Read.** It reads the store with `readPerfLabStore`, which at the time of the committed run, 17:11, still read in
    place; see Step 4. A re-run now reads the copy.
  - **Local report.** It reconstructs the local host report from the measured local-sampler artifacts: workload
    adapter `sampler`, arm revision `1fc6b670a8a6`, `os.cpus()` and `os.arch()`, no GPU, counters unsupported.
  - **Build.** It builds `local-sampler.lab.js` with `labEnv` and keeps the catalog entries and bundles of its cached
    timing and memory captures: 4 hashes, 10 runs (timing 4 repetitions per arm, memory 1 per arm). Trace and CPU
    captures are left out to keep the file small, and the test asserts the plan would execute them.
  - **Write.** It writes `test/fixtures/local-sampler-q2048.json` (144,634 bytes) with an `about` field naming its
    source and the command.
- **Library addition.** `below` and `above` from `@kiln/evidence` are now in the program library, so a predicate can
  return a three-valued answer. No preset uses them yet, so no verdict changes.
- **Browser bundling check.** I bundled `src/index.ts` with the workbench's own esbuild (not a dependency of
  `@kiln/lab`):

  ```text
  apps/workbench/node_modules/.bin/esbuild packages/lab/src/index.ts --bundle --platform=browser --format=esm \
    --outfile=$SCRATCH/lab-bundle.js
  ```

  The bundle is 187.6 kb. `$SCRATCH/bundle-smoke.mjs` imported it and ran `buildSynthetic` plus `evaluateHypothesis`:
  it printed `144 exports; open` (a straddling `below` is open).

### Why

- The fixture keeps a real-data regression test without coupling `pnpm test` to Perf Lab's data directory.
- The browser-safety test is the enforcement seam for "the browser entry never reaches Node". A document would only
  hope for it.

### What worked

- `pnpm --filter @kiln/lab test`: `Test Files 8 passed (8)`, `Tests 98 passed (98)`.
- `pnpm --filter @kiln/lab typecheck`: clean.

### What didn't work

- `pnpm --filter @kiln/lab fixtures` first failed with `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`. Running
  `node scripts/extract-fixtures.ts` directly showed the cause: `expected one workload revision for the local sampler,
  found 3: 1fc6b670a8a6, a6f14d947, d59d9ad`. The `dino-local` artifacts also run on host `local`. Fix: record each
  measured artifact's workload `adapter` and keep only `sampler` when reconstructing the local report.
- The first browser-safety run flagged `src/lang/compare.ts`. The Node-globals regex matched `CompareB`'s method
  `require(...fields)`. It now requires a string argument and no preceding `.` or word character.
- The root `pnpm test` failure the coordinator reported (unresolved `@/data/capabilities`, `@/data/env`,
  `./__fixtures__/quality-golden.json`) came from the test files right after copying, before their imports were
  rewritten in Step 2. It does not occur now (Step 6).

### What I learned

- The bootstrap on four pairs returns [min, max] of the ratios at the 95 % level. Without the caveat, a reader would
  take the local-sampler interval for a measured spread.

### What was tricky to build

- Making the three-valued test meaningful. The straddling case needs a two-valued predicate over the same rows
  (`r.hi < 0.5`) that refutes, so that the test shows the two rules disagree rather than only that `below` works.

### What warrants a second pair of eyes

- The fixture's `localReport` contains this machine's CPU name and core count, from `os.cpus()`. It is not sensitive,
  but it is machine-specific.
- `below`/`above` in the library is a language addition beyond a pure port.

### What should be done in the future

- A dino-pr1005 fixture (DGX archive bundles) would cover `stats.offered` and the dataset entities on real data. It
  would be large: the per-image timing alone is 1024 requests.

### Code review instructions

- `test/hypothesis.test.ts`, then `test/measured.test.ts`, then `scripts/extract-fixtures.ts`.

### Technical details

- Test counts per file: build 26, detections 28 and evidence 6 (60 ported), stats 11, hypothesis 10, data 9,
  measured 5, browser-safety 3.

## Step 6: check:pl and the root test run

This step runs the done-condition script on Perf Lab's store, through the copy-based reader, and the whole workspace's
tests. Both measured programs plan with every capture cached. Every derive evaluates, and the seven verdicts are those
Perf Lab gave (Step 1).

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** `check:pl` must show derives (abridged) and every verdict with its rows. The root test
run must be green.

**Inferred user intent:** the language port is done when it answers the real questions the way Perf Lab did.

### What I did

- `pnpm --filter @kiln/lab check:pl` (output kept in `$SCRATCH/check-pl.txt`).
- `pnpm test` at the root, and `pnpm --filter @kiln/lab typecheck`.

### What worked

- Store header: `70 artifacts, 70 available, 50 measured, 80 bundles, 1 archives, 1 datasets`, host `local`
  reconstructed with `tools.workloads = 1fc6b670a8a6`.
- **local-sampler:** 8 captures, all cached; no lint.

  | Derive | Arm or row | Value |
  | --- | --- | --- |
  | `latency` | baseline | p50 5.1709 ms, p95 6.0416, max 9.1662 (128 requests) |
  | `latency` | candidate | p50 12.878 ms, p95 18.684, max 22.902 |
  | `speedup` | — | 2.4964 × [2.3744, 2.7211], n = 4, caveat "n = 4: the interval is bounded by the sample range", seed 2082729843 |
  | `blocks` | baseline | 3 blocks, 2 intermediate-sized, allocated in `aten::empty, aten::mul` |
  | `blocks` | candidate | 2 blocks, 1 intermediate-sized, allocated in `Torch-Compiled Region: 0/0` |

- **dino-pr1005:** 18 captures, all cached; no lint.

  | Derive | Value |
  | --- | --- |
  | `localLatency` p50 | baseline 1664.8, candidate 1654.4 |
  | `latency` reduction | 0.30376 (#0), 0.30145 (#1), 0.30293 (both) |
  | `reductionCI` | #0 [0.30059, 0.30584], #1 [0.29977, 0.30377] |
  | `memoryGrowth` | 12 rows; container cgroup warm 1.2547 and warm-repeat 1.2324 exceed 1.2 |
  | `promptPolicy` | candidate 0 captures, p50 53.593 vs baseline 393.78 |

- Verdicts, the same as Perf Lab's (Step 1):

  | Program | Hypothesis | Verdict | Deciding rows |
  | --- | --- | --- | --- |
  | local-sampler | compile-removes-intermediate | refuted | row 0 (candidate: 1 intermediate-sized block) |
  | dino-pr1005 | outputs-exact | supported | row 0 (`both`, allExact) |
  | dino-pr1005 | latency-halved | refuted | rows 0, 1 (reduction 0.304, 0.301) |
  | dino-pr1005 | memory-within-20 | refuted | rows 7, 11 (container cgroup, warm and warm-repeat) |
  | dino-pr1005 | prompt-reuse | supported | row 0 |
  | dino-pr1005 | cpu-parts-preserve | supported | row 0 |
  | dino-pr1005 | fusion-active | supported | row 0 (kernel `k001`) |

- Root `pnpm test` (`pnpm -r --workspace-concurrency=1 test`, 5 of 6 projects): exit 0. Counts:
  - `@kiln/evidence`: 125 tests in 9 files;
  - `@kiln/lab`: 98 tests in 8 files;
  - `apps/server`: 88 tests in 10 files.
- `pnpm --filter @kiln/lab typecheck`: clean.

### What didn't work

- N/A.

### What I learned

- No real verdict depends on the P-8 change, because no predicate on this store throws or reads a missing field. The
  change matters for programs written from now on, and the tests pin it.

### What was tricky to build

- N/A.

### What warrants a second pair of eyes

- `check:pl` depends on the reconstructed local report. A different workload revision would make every local capture
  `execute`. The script would then print empty local derives, and the dino `cpu-parts-preserve` verdict would be
  `open`.

### What should be done in the future

- N/A.

### Code review instructions

- `pnpm --filter @kiln/lab check:pl`. It exits 1 on a build failure or a derive that throws.

### Technical details

- `KILN_PL_DB` overrides the store path (default `lab-workbench/.data/perf-lab.sqlite`).

## As built

### Package

- Name: `@kiln/lab`, in `packages/lab`.
- `exports`:
  - `"."` → `src/index.ts`: browser-safe; imports only its own modules and `@kiln/evidence`.
  - `"./node"` → `src/node/index.ts`: the SQLite reader and the preset file readers.
  - `"./presets/*"` → `presets/*`: the eleven `.lab.js` programs and two `.replies.txt` files.
- Scripts:
  - `test` (`vitest run`);
  - `typecheck` (`tsc --noEmit -p .`);
  - `check:pl` (`node scripts/check-pl.ts`);
  - `fixtures` (`node scripts/extract-fixtures.ts`).
- One runtime dependency: `@kiln/evidence: workspace:*`.

### Building and reading a program

- `build({ source, labId, params, env, signals?, patches?, seedMode? }): { ir, registry }`. It throws `BuildError`
  (with `.failure`) when the program cannot be built.
- `readDerive(registry, name, state)` reads one derive by name. `state` is a `RuntimeState`:
  `{ params: Record<string, unknown>, signals: Record<string, unknown> }`.
- `materialize`, `makeDollar`, `resolveValue`, `isLive`, `isParamRef` and `isSignalRef` are exported for the board
  renderer (Phase 8b).
- `ir.plan.captures[]` lists each capture with `{ hash, ref, mode, status: 'cached' | 'execute' | 'import' |
  'blocked', … }`.

### Injected data: `labEnv(data: LabData): BuildEnv`

The injected-data env factory takes one object implementing `LabData`. Every method is synchronous; the caller loads
the data before a build.

| Method | Returns | Filled from |
| --- | --- | --- |
| `catalog()` | `Record<hash, CatalogEntry>` | `GET /api/lab/catalog` |
| `bundlesLoaded(hash)` | `boolean` (an empty list counts as loaded) | — |
| `bundleRun(hash, rep)` | `RunBundle \| undefined` | `GET /api/lab/bundles?hashes=…` |
| `archive(sha256)` | `boolean` | `GET /api/lab/evidence` |
| `datasets()` | `readonly DatasetDetail[]` | `GET /api/lab/datasets/:id` |
| `evidenceBlocked()` | `string \| undefined` | `GET /api/lab/health` `features` |
| `localReport()` | `LocalReport \| null` | `GET /api/lab/hosts/local/capabilities` |
| `localReportError?()` | `string \| undefined` | — |
| `mediaUrl?(sha256)` | `string` (default `/api/lab/media/<sha>`) | — |

- `CatalogEntry` is `{ origin: 'synthetic' | 'measured' | 'seed' | 'job', source?, ref?, host?, reps?, labId?,
  importedAt?, at? }`. Only `origin: 'measured'` hashes read bundles; the other origins are generated.
- `createMemoryLabData(init?: MemoryLabDataInit): MemoryLabData` is the in-memory implementation.
  - `init` is `{ catalog?, bundles?, archives?, datasets?, features?, localReport?, localReportError?, mediaUrl? }`,
    each in the routes' JSON shape.
  - It adds setters that take each route's JSON exactly as returned:

    | Setter | Route |
    | --- | --- |
    | `setCatalog(catalog)` | `GET /catalog` |
    | `addBundles(byHash)` | `GET /bundles?hashes=`, `{ [hash]: BundleJSON[] }`; values are revived here |
    | `dropBundles(hash)` | — (after an import replaced a hash's bundles) |
    | `setArchives(ArchiveInfo[])` | `GET /evidence` |
    | `setDatasets(DatasetDetail[])` | `GET /datasets/:id`, one per id in the archives' `datasets` |
    | `setFeatures(string[] \| null)` | `GET /health` |
    | `setLocalReport(report \| null, error?)` | `GET /hosts/local/capabilities` |

- `bundlesNeeded(ir, data): string[]` returns the plan's measured hashes whose bundles are not loaded. Fetch them in
  batches of at most 64 per request, `addBundles`, then **build again**. A registry built before the bundles arrived
  keeps reading missing values.
- A typical client sequence:
  1. Fetch `health`, `catalog`, `evidence`, `datasets/:id` and `hosts/local/capabilities`, and fill the
     `MemoryLabData`.
  2. Build.
  3. Fetch `bundles` for `bundlesNeeded(ir, data)`, and add them.
  4. Rebuild.
- `syntheticEnv(available: ReadonlySet<string> | Record<string, unknown>, { local?: LocalReport | null }): BuildEnv`
  is the env for generated data only.
- `buildSynthetic(source, { labId?, params?, signals?, patches?, local? }): BuildOutput` does a seed build to collect
  the capture hashes, then the real build with all of them available.

### Hypotheses

- `evaluateHypothesis(registry, state, id): HypothesisResult`.
  - `id`, `h` (the `HypothesisB`), `claim`.
  - `verdict`: `Verdict`, one of `'supported' | 'refuted' | 'open' | 'unqualified'`.
  - `checks`: `Check[]`, one per prediction row: `{ row, pass: true | false | null, missing: string[], error? }`.
  - `reasons`: `string[]`, why the verdict is not `supported`.
  - `support`: `{ describe, count, runs: string[], invalid: string[] }[]`.
  - `error?`: set when a query failed; the verdict is then `open`.
  - It throws on an unknown id.
- `evaluateHypotheses(registry, state): HypothesisResult[]` returns them in declaration order.
- `below(interval, bound)`, `above(interval, bound)` and `verdict` are evidence's, re-exported. `below` and `above` are
  also in the program library.

### Values and statistics

- Evidence's value API is re-exported: `observed`, `derived`, `heuristic`, `illustrative`, `missing`, `isValue`, `raw`,
  `num`, `isMissing`, `provOf`, `combine`, `seal`, `isSealed`, `ProvenanceError`; types `Value`, `Prov`, `ValueOpts`.
- Adapter additions: `valueFrom`, `revive`, `withValue`, `fieldsOf`, `computed`, `defined`; types `ValueFields`,
  `LinkEvidence`.
- `stats.pairedRatio({ unit?, ci?, field?, seed?, baseline?, candidate? }).of(rows)` returns `PairedRatioResult`. Its
  fields:

  | Field | Contents |
  | --- | --- |
  | `__estimate`, `estimator`, `unit` | identity of the estimate |
  | `median` | a `Value` carrying `ci` and `n` |
  | `ci` | `[Value, Value]` |
  | `level` | confidence level |
  | `pairs` | `{ rep, baseline, candidate, ratio }[]` |
  | `excluded` | `{ rep, arm, reason }[]` |
  | `note` | e.g. `5 paired processes; 2 excluded` |
  | `caveat` | `string \| null` |
  | `seed` | the seed the interval was drawn with |
  | `n` | number of pairs |

- `stats.offered(rows)` and `stats.summary(rows, field)` keep Perf Lab's surface.

### Node entry (`@kiln/lab/node`)

- `readPerfLabStore(dbPath, { localReport?, mediaUrl? }): PerfLabStore`.
  - It reads from a temporary copy (Step 4).
  - `PerfLabStore` is `{ data: MemoryLabData, bundles: Record<hash, BundleJSON[]>, measured: { hash, ref, host, reps,
    source, adapter, armRevision }[], counts }`.
- `PERF_LAB_FEATURES` (`['evidence-import', 'datasets', 'media']`).
- `PRESETS_DIR`, `readPresets(): Preset[]`, `readPreset(id): Preset`. `Preset` is `PresetInfo` plus `source` and
  `replies`.
- In the browser, a Vite app imports program text as `@kiln/lab/presets/<file>?raw`. `PRESET_INFO` and `presetInfo(id)`
  give the metadata (`id`, `name`, `group`, `description`, `complexity`, `file`, `repliesFile?`).

### Full export list of the browser entry (`@kiln/lab`)

| Group | Exports |
| --- | --- |
| Building | `build`, `BuildError`, `evaluateProgram`, `paramSpecOf`, `selectImages`; types `BuildInput`, `BuildOutput`, `ImageSelection`, `Patch` |
| Library | `createLibrary`, `capture`, `component`, `defineCollector`, `defineKind`; types `KindDef`, `Library` |
| IR types | `BoardSummary`, `BuildFailure`, `CaptureSummary`, `EdgeKind`, `ExperimentSummary`, `IR`, `IREdge`, `IRNode`, `LintItem`, `NodeKind`, `ParamSummary`, `PassRecord`, `PlanSummary` |
| Env types | `AdapterContract`, `BuildEnv`, `Capabilities`, `CaptureInstance`, `DatasetInfo` |
| Builders | `ArmB`, `BoardB`, `CaptureB`, `ExperimentB`, `HypothesisB`, `LabB`, `PhasesB`, `SubRecorder`, `ViewB`, `CAPTURE_METHODS`, `VIEW_METHODS`, `isLab`, `isView`, `recorder`, `toView`; types `CallLog`, `CollectorDef`, `DeriveDecl`, `ParamSlot`, `PhaseDecl`, `Rec`, `WhenDecl` |
| Algorithms | `algo`, `isAlgo`, `walkthrough`; types `AlgoSpec`, `WCell`, `WGroup`, `WStep`, `Walkthrough` |
| Compare | `by`, `compare`, `isCompare`, `CompareB`, `MatcherB`; types `ComparePair`, `CompareResult` |
| Parameters | `ParamSpec`, `checkParam`, `decodeParam`, `encodeParam`, `formatParam`, `implicitDefault`, `isParamSpec`, `literalOptions`, `normalizeOptions`, `paramKinds`; types `ParamCheck`, `ControlKind`, `OptionItem`, `OptionValue`, `ParamConstraints`, `ParamModifiers` |
| Refs | `BINDING_RANK`, `isFn`, `isLive`, `isParamRef`, `isSignalRef`, `live`, `strongest`; types `Binding`, `Dollar`, `LiveFn`, `ParamRef`, `Phase`, `SignalRef` |
| Query and rows | `Query`, `isQuery`, `q`, `AggRows`, `FIELD_UNITS`, `Grouped`, `Rows`, `isEnt`, `makeEnt`, `rows`; types `QueryEnv`, `QueryOp`, `QueryRoot`, `DataSource`, `Ent`, `EntityKind`, `Link`, `RawEnt` |
| Runtime | `dehydrate`, `evaluateInput`, `instancesForPattern`, `makeDollar`, `materialize`, `paramRuntime`, `paramValue`, `patternExperiments`, `queryEnv`, `readDerive`, `rehydrate`, `resolveValue`, `runsMatching`, `signalValue`; types `BuildRegistry`, `DollarOptions`, `ParamRuntime`, `ResolvedArm`, `ResolvedExperiment`, `RuntimeState`, `Tracker` |
| Values | `combine`, `computed`, `defined`, `derived`, `fieldsOf`, `heuristic`, `illustrative`, `isMissing`, `isSealed`, `isValue`, `missing`, `num`, `observed`, `provOf`, `ProvenanceError`, `raw`, `revive`, `seal`, `valueFrom`, `withValue`; types `LinkEvidence`, `Prov`, `Value`, `ValueFields`, `ValueOpts` |
| Statistics | `stats`; types `PairedRatioOpts`, `PairedRatioResult` |
| Verdicts | `evaluateHypotheses`, `evaluateHypothesis`, `below`, `above`, `verdict`; types `HypothesisResult`, `HypothesisSupport`, `Verdict`, `Check`, `SupportRecord`, `VerdictResult` |
| Detections | `cocoBox`, `compareDetections`, `compareGroundTruth`, `evaluateDetections`, `maximumMatching`, `ordered`, `overlap`, `pairDetections`, `detectionVerdicts`; types `Box`, `DetectionCompareResult`, `Detection`, `DetectionStatus`, `Evaluation`, `GroundTruth`, `Pairing` |
| Helpers | `clamp`, `fmtBytes`, `fmtNumber`, `getPath`, `globToRegExp`, `hash`, `nextId`, `rng`, `seedFrom`, `stableStringify`; type `Rng` |
| Environments | `buildSynthetic`, `labEnv`, `syntheticEnv`; types `SyntheticBuildOptions`, `SyntheticEnvOptions` |
| Data | `bundlesNeeded`, `createMemoryLabData`, `reviveBundles`; types `CatalogEntry`, `LabData`, `MemoryLabData`, `MemoryLabDataInit`, `BundleJSON`, `RunBundle` |
| Capabilities | `KNOWN_HOSTS`, `adapter`, `capabilities`, `capabilitiesFor`, `knownHosts`; type `LocalReport` |
| Datasets | `EVIDENCE_IMPORT_FEATURE`, `datasetProvider`, `datasetRefPrefix`, `defaultMediaUrl`, `evidenceBlockedBy`, `indexDataset`; types `ArchiveInfo`, `DatasetAnnotation`, `DatasetDetail`, `DatasetEntities`, `DatasetImage` |
| Sources | `createSource`, `createSyntheticSource`, `generatedRun`, `syntheticRuns`, `generateRun`, `syntheticMissing`; types `DatasetProvider`, `RunProvider`, `GeneratedRun`, `RawEntity` |
| Presets | `PRESET_INFO`, `presetInfo`; types `Preset`, `PresetGroup`, `PresetInfo` |

### Differences from Perf Lab that a caller can observe

- Media URLs are `/api/lab/media/<sha>`. Perf Lab used `/api/media/<sha>`.
- Generated ncu counters are `illustrative`, as is any aggregate over them (P-7).
- `stats.pairedRatio`:
  - honours `seed`, `baseline` and `candidate` (P-9);
  - reports `caveat`, `seed` and `n` (P-15).
- `stats.offered` leaves a request without an arrival time out of its window (P-10).
- Entities are deeply sealed (P-6).
- Verdicts are evidence's (P-8). A throwing predicate or a read of a missing field leaves its row open. Unqualified
  hypotheses report no per-row checks.
- Capture hashes are still cyrb53 (P-5, unchanged on purpose).

### Open issues

- P-5: cyrb53 capture hashes stay until the store and the routes migrate together.
- `HypothesisResult.support` holds only `supportedBy` query runs. The runs behind the prediction rows are not checked
  for validity, as in Perf Lab.
- A prediction that returns a single object is judged as one row.
- `revive` treats any object with `__value: true` as a Value.
- `computed('unknown', x)` yields missing. This is unreachable today.
- The module-level `runCache` of generated runs in `src/data/source.ts` is unbounded. It is keyed by hash and
  repetition, as in Perf Lab.
- `capabilitiesFor`'s default error for a missing local report reads "the lab server is not running". A Kiln client
  may want its own text, via `setLocalReport(null, error)`.
