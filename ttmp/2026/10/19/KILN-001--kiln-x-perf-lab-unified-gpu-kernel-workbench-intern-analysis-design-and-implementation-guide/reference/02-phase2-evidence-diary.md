---
Title: Phase 2 diary — @kiln/evidence
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
    - Path: repo://packages/evidence/src/index.ts
      Note: Public API of @kiln/evidence (guide Appendix B)
    - Path: repo://packages/evidence/src/verdict.ts
      Note: The single verdict implementation (guide §29.3)
ExternalSources: []
Summary: 'Chronological diary of Phase 2 (guide §35): the @kiln/evidence package — values and provenance, statistics, SHA-256, canonical JSON, content and device identity, the kiln-measure/1 record, and verdicts.'
LastUpdated: 2026-10-19T15:00:00-04:00
WhatFor: "Reviewing how @kiln/evidence was built and where it deviates from the guide"
WhenToUse: "Before wiring @kiln/evidence into packages/kiln (Phase 3) or the server (Phase 5)"
---

# Phase 2 diary — `@kiln/evidence`

Written by the Phase 2 worker. The main diary is `01-investigation-diary.md`; its Step 1 holds the user's
verbatim requests. Paths: `T/` is this ticket, `PL/` is `lab-workbench/`, `E/` is `packages/evidence/`.

## Step 1: Read the specification and the Perf Lab sources

Before writing code I read the guide's §21-§29, §35 Phase 2 and Appendix B, and the three Perf Lab files the package
replaces: `PL/src/lang/values.ts` (89 lines), `PL/src/lang/stats.ts` (122 lines) and the verdict function in
`PL/src/components/organisms/views/HypothesisView/HypothesisView.tsx` (lines 19-48). The directive named
`lab-workbench/src/lab/…` and `src/components/HypothesisView.tsx`; the files actually live under `src/lang/` and
`src/components/organisms/views/HypothesisView/`.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md` (the "Once upload, then implement it…"
request). The coordinating agent assigned Phase 2 to this worker with the guide as the specification.

**Assistant interpretation:** Build `packages/evidence` with the Appendix B API, tests against `node:crypto` and
hand-computed cases, a strict typecheck with `erasableSyntaxOnly`, and a diary of deviations.

**Inferred user intent:** One headless implementation of hashing, statistics, records and verdicts that the
browser, the server and the tests share.

**Commit (code):** none (the coordinator commits).

### What I did

- Read the sources listed above, plus `PL/src/lang/util.ts` (`hash` = cyrb53, `mulberry32`, `seedFrom`, `rng`) and
  Kiln's `packages/kiln/src/std/devices.js` (sim device ids are `"sim:" + spec.id`, e.g. `sim:rtx5090`; the WebGPU
  device id is the bare string `webgpu`) and `std/program.js` (launch is `K.grid`, `K.block`, `K.smemBytes`, all
  plain numbers).

### What I learned

- Perf Lab's verdict treats a throwing predicate as a failure (`catch { pass = false }`), so an error refutes (P-8).
- Perf Lab's `pairedRatio` seeds its bootstrap from the ratios (`rng(\`pairedRatio:${ratios.join(',')}\`)`) and
  ignores `opts.seed`, and pairs only arms named `baseline` and `candidate` (P-9).
- `sealObserved` is a one-level Proxy with `set` and `deleteProperty` traps only (P-6).
- `provOf(x, fallback = 'observed')` labels any plain number as observed, which is the presentation side of P-7.

## Step 2: Write the package

I wrote the eight source files in dependency order (sha256 → canonical → values → stats → identity → record →
verdict → index), then the manifest. Everything is erasable TypeScript with `.ts` import extensions, so Node 26
imports `src/index.ts` with no build step and esbuild bundles it for the page.

### Prompt Context

**User prompt (verbatim):** see Step 1 of `01-investigation-diary.md`.

**Assistant interpretation:** Implement guide Appendix B, hardening the Perf Lab ports where Part IV lists faults.

**Inferred user intent:** The evidence rules exist once and are tested, before Phase 3 wires them into Kiln.

**Commit (code):** none (the coordinator commits).

### What I did

- `E/src/sha256.ts`: FIPS 180-4 over a padded `Uint8Array`; strings go through `TextEncoder` (UTF-8);
  `sha256Hex(string | Uint8Array)` and `isSha256Hex`.
- `E/src/canonical.ts`: `canonicalJSON` with sorted keys, refusing undefined (property or element), array holes,
  functions, symbols, bigints, non-finite numbers, cycles (tracked as an ancestor stack, so shared acyclic
  references are allowed), and non-plain objects (Map, Date, class instances, Values). Each refusal is a
  `CanonicalJSONError` naming the path, e.g. `canonicalJSON: undefined at $.check.maxAbsErr`.
- `E/src/values.ts`: `Value`, `observed`/`derived`/`heuristic`/`illustrative`/`missing`, `raw`, `num`, `isMissing`,
  `provOf`, `combine`, `seal`, `isSealed`, `ProvenanceError`.
- `E/src/stats.ts`: `rng`, `quantile` (type 7), `median`, `summarize`, `pairedRatio`, `separated`.
- `E/src/identity.ts`: `contentId`, `deviceId`, `slug`, `isFingerprint`.
- `E/src/record.ts`: the `MeasurementRecord` type (guide §21 verbatim), `RECORD_FORMAT`, `recordId`,
  `validateRecord`, `isDecisive`.
- `E/src/verdict.ts`: `verdict({rows, predicate, support})`.
- `E/package.json` (`exports: {".": "./src/index.ts"}`, scripts `test` and `typecheck`), `E/tsconfig.json`
  (extends the base, `types: ["node"]`).
- `pnpm add -D vitest typescript @types/node --filter @kiln/evidence` resolved vitest `^5.0.5`, typescript `^7.0.2`
  (the native TypeScript 7 compiler) and @types/node `^26.6.5`.

### Why

- **The seal is a snapshot.** `seal(x)` deep-copies `x` into fresh objects (keeping prototypes, so a sealed Value
  still compares as a number) and wraps every level in a Proxy whose `set`, `deleteProperty`, `defineProperty`,
  `setPrototypeOf` and `preventExtensions` traps throw `ProvenanceError`. Proxying the original objects instead
  breaks on frozen inputs: a `get` trap may not return a different object for a non-configurable, non-writable
  property, so returning a sealed child of a frozen parent throws a `TypeError` invariant violation. Copying also
  means later changes to the store's record cannot leak into a sealed view.
- **Constructors refuse to make NaN data.** `derived(0/0)` returns `missing("derived value is not a finite number
  (NaN)")` rather than a derived NaN; with "unknown is never zero", NaN must not be able to pass as data either.
- **`provOf` defaults to `unknown`.** Perf Lab's default `'observed'` let any plain number pass as measured (the
  presentation side of P-7).
- **`summarize` returns plain numbers** (`{median, ci, n, level, method, note}`), not Values: the statistics do not
  know whether the samples were observed or simulated; the caller wraps them with the class of its device.
- **`verdict` tracks what the predicate reads.** The guide's pseudocode computes `missing` over all fields of the
  row. I compute it over the fields the predicate actually read (a Proxy over the row records each own-property
  `get`; destructuring and spreading count as reads). Without this, an `ev.kernels()` row whose `time` is missing
  would make `r => r.model < 100` open, although it only judges the model. Whenever the predicate reads a missing
  field, the result is the guide's.

### What I learned

- Deep-sealing the original objects in place cannot work for frozen inputs (the Proxy invariant above); a
  snapshot is the only sealed view that is both deep and total.

### What was tricky to build

- Sealed arrays. The shell must be a real array (so `Array.isArray` holds and array methods work), its own
  `length` is non-configurable, so the copy skips `length` and assigns it after the elements; holes survive.
  `sort`, `push` and assignment to `length` all go through the `set` trap and throw.
- Accessor properties are evaluated once at seal time and stored as data, because a getter on a sealed object could
  otherwise return a fresh mutable object on each read.

## Step 3: Test, typecheck, and check plain-Node imports

The suite has 110 tests in 8 files and passes; `tsc --noEmit` passes with `erasableSyntaxOnly`; plain Node imports
the package's TypeScript source. Two test bugs came first, both mine, and one typecheck problem.

### What I did

- Tests: `sha256` (6: FIPS examples; every length 0-200 against `node:crypto`; random bytes at 1, 55, 56, 63, 64,
  65, 119, 120, 127, 128, 129, 1000, 4096 and 65537 bytes; 300 random strings over an alphabet with `é`, `中`,
  `😀`, NUL, lone surrogates and a combining mark), `canonical` (18), `values` (13, including the full 5×5 `combine`
  table in both orders and 13 mutation attempts on a sealed object), `stats` (13), `identity` (17), `record` (30),
  `verdict` (11), `package` (2: Appendix B exports, and a child `node --input-type=module` that imports
  `src/index.ts` and must print `ba7816bf… open` with nothing on stderr besides warnings).
- `test/fixtures.ts`: `makeRecord(patch)` builds a complete, valid WebGPU record and computes its id after `patch`.

### What worked

- `pnpm --filter @kiln/evidence test`: `Test Files 8 passed (8)`, `Tests 110 passed (110)`, about 260 ms.
- `pnpm --filter @kiln/evidence typecheck` (`tsc --noEmit -p .`, TypeScript 7.0.2): no output, exit 0.
- `node --input-type=module -e "import('/Volumes/SSD/code/kiln/packages/evidence/src/index.ts')…"` from
  `packages/kiln` printed 33 export names.
- Root `pnpm test`: evidence 110/110, then Kiln's `core, progs, stack1-3, tune` (6 passed) and the workbench's
  `notes, presets` (2 passed).
- esbuild 0.24.2 (the workbench's) bundled `import {sha256Hex, summarize} from ".../src/index.ts"` without help
  (6583 bytes, platform neutral).

### What didn't work

- First run: `Tests 17 failed | 93 passed (110)`, all `TypeError: deviceId: fingerprint must be a flat object of
  strings, finite numbers and booleans` from `makeRecord`. The "nested fingerprint" case mutated the fixture's
  module-level `fp` object (the record held a reference to it), so every later fixture had `clocks: {sm: 1}`.
  Fixed by copying the fingerprint per record (`const fp = { ...FP }`).
- Second run: `rejects NaN sample` failed with `CanonicalJSONError: canonicalJSON: non-finite number NaN at
  $.timing.samples[1]`, thrown by `makeRecord` computing the id. That is correct behaviour (such a record has no
  canonical id), so the case now builds a valid record, sets the NaN afterwards, and expects exactly
  `timing.samples: expected finite non-negative numbers`.
- First typecheck: `src/values.ts(146,5): error TS2322: Type '(_t: object, prop?: string | symbol) => never' is not
  assignable to type '(target: object, v: object | null) => boolean'` (one generic trap function was shared by
  traps with different signatures; now each trap has its own arrow), and 13 × `TS2365: Operator '<' cannot be
  applied to types 'Value' and 'number'` in `verdict.test.ts`. Project predicates are JavaScript and compare Values
  directly; the tests now cast with `const n = (v: unknown) => v as number`, which changes nothing at run time.
- I ran `npx --no-install tsc --version` by reflex; it printed npm's "This is not the tsc command you are looking
  for" and did nothing. `packages/evidence/node_modules/.bin/tsc --version` gives `Version 7.0.2`.

### What I learned

- Node 26 strips types only outside `node_modules`. Importing `@kiln/evidence` through a pnpm-style symlink works
  because Node resolves symlinks to the real path (`packages/evidence/src/index.ts`). With `--preserve-symlinks`
  the same import fails: `Error [ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING]: Stripping types is currently
  unsupported for files under node_modules`. Checked in a scratch directory with
  `node_modules/@kiln/evidence -> packages/evidence`.

### What warrants a second pair of eyes

- `verdict`'s read tracking (Step 2, Why). It is a refinement of the guide's rule, not a different rule, but it is
  where a reviewer should look first.
- `validateRecord` enforces cross-field rules that producers must now satisfy: device class ⇔ timing kind ⇔
  language (sim/simulated/sim, webgpu/gpu-timestamp or wall-clock/wgsl, cuda/cuda-events/cuda); a wall-clock or
  legacy record must list a caveat in `validity.partial`; `validity.ok` implies the check and activation passed and
  `samples.length === protocol.reps`; an invalid record must give a reason; unknown top-level fields are errors.

## Step 4: Deviations from the guide, and notes for Phase 3

### Deviations (all deliberate)

- **Read-tracking in `verdict`** (Step 2). `Check.missing` lists the missing fields the predicate read.
- **Plain `null`, `undefined` and `NaN` row fields count as missing** in `verdict`, as missing Values do
  (`isMissing`). The guide says "fields that are missing Values".
- **`combine()` with no inputs is `unknown`.** The guide does not say.
- **`provOf` falls back to `unknown`**, not Perf Lab's `observed`.
- **Constructors return `missing(...)` for null or non-finite numbers** instead of a Value holding NaN.
- **`summarize` and `pairedRatio` return a `method` string and `level`** besides `{median, ci, n, note}`, for the
  tooltip text of guide §24; `pairedRatio` also returns `excluded` (rejected pairs with reasons). The default seed
  is 1.
- **`pairedRatio(pairs)` takes `{rep, a, b}`**, as in §25 (not Perf Lab's rows with arm names), and excludes
  duplicate repetitions and non-positive samples with a reason.
- **`seal` is a snapshot** (Step 2). It refuses Map, Set, WeakMap, WeakSet, Date, RegExp, Promise and binary data.
- **Additions not in Appendix B:** `raw`, `isSealed`, `isSha256Hex`, `CanonicalJSONError`, `slug`, `isFingerprint`,
  `RECORD_FORMAT`, `isDecisive(record, currentContentId)` (valid ∧ no partial caveats ∧ not legacy ∧ content id
  matches: the guide §26-§27 rule for "may decide", which the store's `optionStats` and the `ev` context both need),
  and the types `Summary`, `PairedSummary`, `Pair`, `Check`, `VerdictResult`, `Validation`, `ContentIdInput`,
  `Launch`, `Fingerprint`, `Lang`, `DeviceClass`, `TimingKind`.
- **`canonicalJSON` writes `-0` as `0`** (as `JSON.stringify` does) rather than refusing it.

### What should be done in the future (Phase 3)

- Import `@kiln/evidence` from `packages/kiln` by adding `"@kiln/evidence": "workspace:*"` to its dependencies;
  do not run Node with `--preserve-symlinks`.
- Producers written in JavaScript must not put `undefined` in records (`{maxAbsErr: x.maxAbsErr}` with an absent
  value makes `recordId` throw). Omit the key instead.
- Sim device ids: call `deviceId('sim', spec.id, {...})` with the target key (`rtx5090`), not the display name,
  to keep today's `sim:rtx5090`.
- Legacy rows: device id `legacy:<old id>` (e.g. `legacy:webgpu`), timing kind `legacy`, `contentId: ''`,
  `sourceSha256: ''`, a caveat in `validity.partial`; class and language are not checked for legacy rows.
- `deviceId` hashes the whole fingerprint object, so its key set must be stable per device class; `isFingerprint`
  allows only flat strings, finite numbers and booleans (clocks as `smClockMHz`, `memClockMHz`, not nested).

### Code review instructions

- Start with `E/src/verdict.ts` and `E/test/verdict.test.ts`, then `E/src/values.ts` (`seal`) and
  `E/src/record.ts` (`validateRecord`'s cross-field rules).
- `pnpm --filter @kiln/evidence test && pnpm --filter @kiln/evidence typecheck`.

### Technical details

- Public surface: `E/src/index.ts`. Source 843 lines, tests and fixtures 748 lines.
- Record id: `sha256Hex(canonicalJSON(record without id))`; `validateRecord` reports
  `id: expected <hex> (sha256 of the canonical record without id)` on a mismatch, and checks the id only once the
  record is otherwise well-formed.

## Step 5: Review by the main agent — nested reads in `verdict`

The main agent reviewed the package before committing it (main diary, Step 6). One defect: `verdict` tracked only
top-level reads, so `!(r.k.t > 1)` over a row whose `k.t` is missing returned `supported` — the negative-predicate
hole one level down. `track()` now wraps nested plain objects and arrays and records dotted paths (`k.t`,
`reps.1`); its proxy target is an empty shell that forwards to the row, so frozen rows are tracked too. A new test,
"reads are tracked through nested objects and arrays", covers both. `pnpm --filter @kiln/evidence test` → 111 passed;
`typecheck` clean.
