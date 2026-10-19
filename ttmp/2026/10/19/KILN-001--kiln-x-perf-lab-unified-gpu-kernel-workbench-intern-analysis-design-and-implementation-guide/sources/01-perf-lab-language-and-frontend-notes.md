# Perf Lab workbench: the lab.js language and the frontend (source notes for KILN-001)

These are evidence notes on the Perf Lab workbench prototype at `/Volumes/SSD/code/kiln/lab-workbench`. They are
written so that another engineer can turn them into an intern-facing design and implementation guide for the unified
Kiln × Perf Lab workbench.

**Scope**

- **Covered:**
  - everything under `src/` (`lang/`, `features/`, `components/`, `data/`, `presets/`, `styles/`, `app/`, `main.tsx`)
  - `README.md`, `index.html`, `vite.config.ts`, `package.json`, `tsconfig.json`
- **Touched only where the client depends on it:** the lab server (`server/`): the job, approval and assistant
  endpoints.
- **Not read:** `node_modules/`, `dist/`, `workloads/`.

**Date and method**

- Analysis date: 2026-10-19.
- The code was read in place. The only commands run against it were `pnpm exec tsc --noEmit -p .` and
  `pnpm exec vitest run src`, both with the existing `node_modules`.
- Nothing in the repository was modified.

**Conventions**

- Every path is relative to `/Volumes/SSD/code/kiln/lab-workbench` unless it starts with `/`.
- `L12-34` means lines 12 to 34 of the file named just before it.
- **[O]** means *observed*: I read it in the code or saw it in command output.
- **[I]** means *inferred*: I reasoned it from the code but did not execute it. Every [I] item is listed again in
  §11 so it can be checked.
- The companion diary is `01-perf-lab-language-and-frontend-diary.md` in the same directory.

---

## 0. The findings that matter most

1. **The language.** [O]
   - `lab.js` is plain JavaScript. It is evaluated with `new Function` against a library of about 70 free names,
     and must `return lab(...)`.
   - Builders record calls through a Proxy. A method the builders do not know is kept and turned into a
     `unknown-method` lint warning, not an exception.
2. **The compiler** is six named passes in `src/lang/build.ts`: structure → expand · resolve → trace → validate →
   lower → plan. [O]
   - Content identity is `cyrb53(stableStringify(spec))`, a 53-bit non-cryptographic hash.
   - The server re-hashes the same normalized spec and rejects mismatches (`server/app.ts` L159).
3. **The phase of a lambda comes from its syntactic slot.** [O]
   - plan: a `ctx => …` value in an experiment field
   - data: `derive(name, input, rows => …)`
   - view: `live($ => …)`
   - handler: `.on(event, $ => …)`
   - effect: `board.effect(fn)`
4. **Parameter binding is inferred.** A parameter's binding is the strongest phase among its readers: plan >
   data > view. That binding decides whether a change re-renders, recomputes, or becomes a *pending plan* that
   needs new runs. [O]
5. **The evidence contract is real, but enforced in only a few places.** [O]
   - Every value is a `Value` with `prov ∈ {observed, derived, heuristic, illustrative, unknown}`.
   - A missing value is `value: null, prov: 'unknown'` with a reason, and compares as `NaN`.
   - Imported entities are wrapped in a sealing Proxy that throws `ProvenanceError` on set or delete.
   - The rule leaks in several places, listed in §3.7. For example, synthetic counters carry prov `observed`,
     `stats.offered` turns a missing arrival time into 0, and a hypothesis predicate that *throws* produces
     `refuted`.
6. **Hypothesis verdicts are computed in a React module,** `HypothesisView.tsx` L19-48, not in `lang/`.
   The four verdicts are supported, refuted, open and unqualified. [O]
7. **The store.**
   - Redux Toolkit with 11 hand-written slices plus an RTK Query slice that does almost nothing. [O]
   - Functions and builders never enter Redux. They live in `app/registry.ts`, keyed by build id, which keeps the
     last 24 builds. [O]
   - Server traffic is plain `fetch` through `services/server.ts`, plus an SSE stream at `/api/events`. [O]
8. **The assistant.**
   - It runs model-written JavaScript *in the page* with `new AsyncFunction`. This is not a sandbox. [O]
   - On error it automatically rolls back params, signals, annotations and patches to a checkpoint. [O]
   - The server enforces four code executions per question (`MAX_STEPS = 4`). [O]
   - Human approval of jobs is enforced only by client convention: the server trusts a client-supplied
     `proposedBy` field. [O] for the field; [I] that page-run code could bypass approval.
9. **Visual language: a drafting table.** [O]
   - Each board is a "sheet" with registration marks and an engineering title block. The block states the data's
     origin: SYNTHETIC DATA, MEASURED ON …, and so on.
   - Every value carries a provenance glyph, ● ◐ ◌ ◇ ▨.
   - Missing values are drawn hatched, derived ones dotted or stippled, illustrative ones with a dashed outline.
   - Colours come from `src/styles/tokens.css`, a set adapted from "Lattice Deck".
10. **Tests:** `tsc --noEmit` passes, and Vitest reports 7 files and 71 tests passed. [O]
    The memo claim that "features/build/ is missing so the prototype does not build" is **false** for this copy
    (§10).
11. **Dead or half-finished surface:** [O]
    - `board.effect` is never run.
    - `jobList` has no renderer.
    - IR kinds `lambda`, `compare` and `binds` are never emitted.
    - Many `VIEW_METHODS` are accepted and then ignored.
    - `detections` and `gallery` view methods are not validated.
    - The `persist` and `debounce` parameter modifiers are unused.
    - Annotations are never sent to the server's `/annotations` route.
    - `pairedRatio({seed})` ignores its seed.
    - Three README statements are stale.

---

## 1. Orientation

### 1.1 Stack and scripts [O]

`package.json` scripts:

| Script | Command | Purpose |
| --- | --- | --- |
| `dev` | `vite` | Workbench on port 5199 (`vite.config.ts`) |
| `build` | `tsc -b && vite build` | Type-check and bundle |
| `typecheck` | `tsc` | Type-check only |
| `test` | `vitest run` | `src/**/*.test.ts` and `server/**/*.test.ts`, environment `node` |
| `lab-server` | `tsx server/index.ts` | Hono and SQLite lab server on 5198 |
| `lab` | `tsx scripts/lab.ts` | CLI: `lab evidence add`, `lab datasets materialize`, `lab models fetch` (README L117-119) |

Dependencies:

- **UI and state:** React 19, react-router-dom 7, Redux Toolkit 2 (with RTK Query).
- **Charts and math:** d3-scale and d3-shape; MathJax 4, loaded lazily on the first formula. That is why
  `vite.config.ts` sets `chunkSizeWarningLimit` to 1500.
- **Fonts:** `@fontsource-variable/archivo` and `@fontsource/ibm-plex-mono` (400/500/600), imported in
  `src/main.tsx`.
- **Assistant (server side):** the pi agent packages.

Configuration:

- **Vite** proxies `/api` to `127.0.0.1:5198`.
- **TypeScript** is strict, with `noUnusedLocals` and the path alias `@/*` → `src/*`. It includes `src`, `server`
  and `vite.config.ts`.
- **`index.html`** has the title "Perf Lab Workbench", a `#root` div and `/src/main.tsx`.
- **pnpm:** `pnpm-workspace.yaml` makes this a standalone pnpm root.

### 1.2 Directory map [O]

```text
src/
  lang/        the language: builders, library, IR, build passes, params, query/rows/values,
               runtime, stats, compare, algo, detections (+ tests and __fixtures__)
  data/        environment (synthetic and catalog), DataSource, generator, capability reports,
               datasets, bundles
  presets/     index.ts + programs/*.lab.js (11 programs) + 2 *.replies.txt (scripted assistant)
  features/    Redux slices and thunks: program, build, params, signals, selection, catalog,
               jobs, agent, annotations, ui, server
  services/    server.ts (fetch + SSE-over-POST), labApi.ts (RTK Query, fakeBaseQuery)
  app/         store.ts, hooks, registry.ts (non-serializable build state), board-context.tsx,
               UrlSync.tsx
  components/  atoms/ molecules/ organisms/ (incl. organisms/views/) templates/ pages/
  lib/         format.ts, params.ts, highlight, yaml, tex, ...
  styles/      tokens.css, base.css
```

### 1.3 End-to-end data flow [O]

```text
lab.js source (programSlice.sources[labId], or the preset)
   │  buildLab thunk (features/build/thunks.ts L18-63)
   ▼
evaluateProgram ──► LabB builder tree (recorded calls)        lang/build.ts L72-96
   │  build(): structure → expand·resolve → trace → validate → lower → plan
   ▼
IR (serializable) ──► Redux build.byLab[labId]                features/build/buildSlice.ts
builders, lambdas, DataSource ──► app/registry.ts (keyed by buildId, last 24 kept)
   │
   ▼
WorkbenchPage → BoardSheet → ViewRenderer → views
   views materialize queries through lang/runtime.ts against reg.source (data/source.ts)
   param change → params/thunks.changeParam → re-render | recompute | pending plan → job
   job → POST /api/jobs → runner → SSE job.updated / artifact.imported → loadMeasured → rebuild
```

---

## 2. The language

### 2.1 How a program is evaluated [O]

- `evaluateProgram` (`src/lang/build.ts` L72-96) builds the function
  `new Function(...libraryNames, '"use strict";\n' + source + '\n//# sourceURL=lab.js')`.
  It then calls the function with the library values.
  - The program must `return lab(...)`.
  - The error location is recovered from the `lab.js:L:C` stack frame, minus `LINE_OFFSET = 3`.
  - `build.test.ts` asserts that runtime errors report the correct line ("runtime error line numbers").
- The free names come from `src/lang/library.ts` (169 lines). See §2.4 for the list.
- A program can use any JavaScript: local helpers, `Map`, closures and so on. `dino-pr1005.lab.js` L12-25
  defines its own `median` and an LCG bootstrap.
  - [I] Nothing stops a program from calling `fetch` or touching `window`. The program runs in the page's realm,
    just like assistant code (§4.7).

### 2.2 The recorder Proxy [O]

`src/lang/builders.ts` L17-34 wraps every builder in a Proxy:

- A method that exists on the builder is called normally.
- Any other property access returns a function that records `(name, args)` as a prop on the builder and returns
  the Proxy again, so chaining continues.
- Each builder declares the method names it knows. The validate pass emits `unknown-method` (warning, `build.ts`
  L752) for a recorded name outside that set.

`replies.test.ts` checks that `.agent()` is reported as an unknown method.

**Consequence:** a typo such as `.captrue(...)` does not throw. It produces a warning in the IR's lint list, and
the build otherwise succeeds. [O]

### 2.3 Builder API reference [O]

Signatures are paraphrased from `src/lang/builders.ts`. "Known props" are names the recorder accepts without a
lint warning; their values land in the builder's prop bag and are read later by `build.ts`.

#### LabB (`builders.ts` L395-449), from `lab(title)`

| Method | Signature | Notes |
| --- | --- | --- |
| `data` | `.data(name \| {name: value, …}, value?)` (L410) | Lab-level named data |
| `param` | `.param(name, ParamSpec)` | Lab-scope parameter (§2.10) |
| `experiment` | `.experiment(id, e => …)` | A duplicate id throws |
| `derive` | `.derive(name, input: Query, (rows, ctx) => rows)` | A data-phase lambda (§2.8) |
| `hypothesis` | `.hypothesis(id, h => …)` | §3.5 |
| `board` | `.board(id, b => …)` | Applies `defaults` first; a duplicate id throws |
| `defaults` | `.defaults(obj)` | Applied to every board |
| `each` | `.each(list, (lab, item, i) => …)` (L446) | Programmatic repetition |
| `ref` | `.ref(name) → ParamRef` | A handle for a lab-scope parameter, used in views and lambdas |

There is **no** lab-level `.import()`. Evidence enters through `experiment.evidence(archive(sha), opts)`, and
`import` nodes are created by the build for cached or evidence captures.

#### ExperimentB (`builders.ts` L226-307)

| Method | Signature |
| --- | --- |
| `baseline` | `.baseline(rev(sha), arm => …?)` |
| `candidate` | `.candidate(rev(sha), arm => …?)` |
| `arm` | `.arm(name, arm => …?)` |
| `capture` | `.capture(...captures)` or `.capture('mode', cap => patch)` to patch an inherited capture |
| `param` | `.param(name, ParamSpec)`, experiment scope; `urlKey` = `exp.name` |
| `phases` | `.phases(p => p.stable(..).alternate(..).churn(..).only(..))`, see PhasesB L206-213 |
| `matrix` | `.matrix({axis: [values…]}, (e, cell) => …)` (L274), a cartesian product over the axes |
| `when` | `.when(cond, e => …)` (L283) |
| `limitation` | `.limitation(text)` |
| `skip` | `.skip()` (L285-289): skips the current matrix cell; the reason is the cell's latest `limitation` |
| `fork` | `.fork(id, e => …?)`, which creates a sibling experiment and emits a `fork` lint (info) |

`EXPERIMENT_PROPS` (L221-224) lists the known props: `question`, `workload`, `boundary`, `host`, `state`,
`warmup`, `expect`, `gate`, `repeat`, `compare`, `offer`, `admission`, `deadline`, `drain`, `units`, `purpose`,
`evidence`.

#### ArmB (L140-151)

Known props: `rev`, `switches`, `corunner`, `pin`.

#### CaptureB (L173-198), from `capture.<mode>()`

Each mode has its own known props (`CAPTURE_METHODS`, L153-164):

| Mode | Known props |
| --- | --- |
| `timing` | `processes`, `pairs` |
| `trace` | `apis`, `ranges`, `requests`, `buffer`, `processes` |
| `kernels` | `launch`, `sections`, `cacheControl`, `replay` |
| `memory` | `ledgers`, `around`, `states` |
| `cpu` | `events`, `callGraph` |
| `sanitizer` | `tool` |
| `stages` | `processes` |
| `predictions` | — |
| `tests` | — |

Two special behaviours:

- `sections('+X')` appends to the default sections, and a plain name replaces them.
- `clone()` copies the capture.

#### BoardB (L329-372), from `lab.board(id, b => …)`

| Method | Signature | Notes |
| --- | --- | --- |
| `title`, `subtitle` | `(text)` | Support inline `$…$` math |
| `layout` | `(grid\`areas\`)` or `(string)` | CSS grid template areas (L350-353). Used only when the sheet is wider than 860 px (`BoardSheet.tsx` L57) |
| `add` | `(...views)` | Flattens its arguments and wraps each with `toView` (L354) |
| `sig` | `(name, init) → SignalRef` | Board-local state, key `boardId:name` (L355-359) |
| `derive` | `(name, fn) → SignalRef` | A derived signal |
| `param` | `(name, ParamSpec) → ParamRef` | Board-scope parameter, storage key `board:name` |
| `preset` | `(name, values)` | Shown in ParamBar's `PresetMenu` |
| `effect` | `(fn)` | Collected into `this.effects` (L371). **Never executed** (§9) |

Known props: `footer`, `eyebrow` (L346).

#### HypothesisB (L374-391)

| Method | Signature |
| --- | --- |
| `claim` | `.claim(text)` |
| `predicts` | `.predicts(query, row => boolean \| Value)` |
| `supportedBy` | `.supportedBy(...queries)` |
| `alternatives` | `.alternatives(...texts)` |
| `scope` | `.scope(text)` |

#### ViewB (L67-94), from any view constructor

- Generic methods: `.as(name)`, `.on(event, $ => …)`, `.add(...children)`, `.left(v)` and `.right(v)` (split
  slots), `.p(key)` to read a prop, `.pa(key)` to read all values of a prop.
- Every kind except `detections` and `gallery` gets the `COMMON_VIEW` props: `focus`, `grow`, `height`, `title`,
  `eyebrow`, `missing`, `caption`, `width`, `span`.
- `VIEW_METHODS` (L38-65) adds the props specific to each view kind.
- `toView` (L98-103) converts whatever was added into a ViewB:
  - a ParamSpec becomes a `control` view, through `ParamSpec.prototype.bind` (L106-108)
  - a string becomes a text view

#### Parameter declaration (L122-129)

- Names must match `^[a-z][a-zA-Z0-9_-]*$`.
- The URL key is the plain name for lab scope, and `exp.name` for experiment scope.
- The storage key is `board:name` for board scope.

### 2.4 The library: free names in a program [O]

From `src/lang/library.ts`. `tagged(k, props)` (L17) creates `{__k: true, kind: k, ...props}`.

| Group | Names |
| --- | --- |
| Root | `lab` |
| Identity | `rev(sha)`, `fixtures(id)`, `src('rev:path#symbol')`, `archive(sha256, {name})`, `dataset(sha256, {name})` (L89-95) |
| Workloads | `dino(opts)`, `embedding(opts)`, `sampler(opts)`, `load(workload, schedule)` (L97-101) |
| Contracts | `activation(expect)`, `paired({seed})`, `quality.ref(path, opts)`, `quality.exact()` (L103-107) |
| Schedules and stress | `schedule.poisson`, `schedule.constant`, `stress.cpuBandwidth`, `stress.cpuCompute`, `stress.gpuCompute`, `none()` (L111-119) |
| Captures | `capture.timing`, `trace`, `kernels`, `memory`, `cpu`, `stages`, `predictions`, `tests`, `sanitizer(tool)`; `defineCollector(name, def)` (around L40) |
| Units | `ms('2s')` (L77-80) |
| Data | `q` (query roots), `compare`, `by`, `live`, `missing`, `illustrative`, `stats`, `algo` |
| Parameters | `slider`, `range`, `number`, `checkbox`, `toggle`, `select`, `multiselect`, `radio`, `text`/`textInput`, `seed`, `pickRun` |
| Views | `table`, `chart`, `timeline`, `stat`, `manifest`, `manifestDiff`, `mirror`, `metrics`, `kernelCard`, `ledger`, `source`, `route`, `stepper`, `hypothesisCard`, `note`, `math`, `text`, `row`, `stack`, `split`, `runList`, `detections`, `gallery`, `jobList`, `batchView`, `grid` |
| Composition | `component(name, props => view)` (L43-51), `defineKind(name, {defaults, describe, build})` (L59-68), `warmupPolicy()` |

Two of these behave differently from the rest:

- `grid` has two uses (L70-73). As a tagged template, ``grid`a b / c d` `` returns `{__areas}` for
  `board.layout`. Called with a number, it is a grid *view*, rendered with `repeat(auto-fit, …)`
  (`ViewRenderer.tsx` L79-88).
- `component` and `defineKind` are build-time macros. They call `fn(props)` immediately and add the result as a
  child (L47, L65). The renderer shows them as an eyebrow ("component · name") above their children
  (`ViewRenderer.tsx` L89-100).

### 2.5 IR types (`src/lang/ir.ts`, 153 lines) [O]

- **`NodeKind`:** `lab | experiment | arm | capture | import | derive | param | signal | lambda | board | view | hypothesis | compare`.
- **`EdgeKind`:** `contains | input | reads | produces | evidence | binds`.
- **`IRNode`:** id, kind, label, parent, plus optional fields:
  - `status ∈ {cached, execute, import, blocked, skipped}`
  - `phase ∈ {plan, data, view, handler, effect}`
- **`PassRecord`:** `{n, name, detail, ms}`, pushed by `pass()` (`build.ts` L167).
- **`LintItem`:** `{level: error|warning|info, code, message, node?, line?}`.
- **`ParamSummary`** (L54-76): key, name, urlKey, scope, control, label, unit, group, order, binding, readers,
  defaultValue, options, confirm, help and others.
- **`BoardSummary`:** id, index, title, paramKeys, experiments, presets.
- **`CaptureSummary`** (L90-104): id, experiment, arm, mode, host, hash, status, blockedOn, estimateGpuMin,
  spec, evidence.
- **`PlanSummary`** (L106-115): stages, counts by status, `estimateGpuMin`, captures.
- **`ExperimentSummary`:** id, question, host, arms, limitations, fork.
- **`IR`** (L130-146): buildId, title, durationMs, passes, nodes, edges, lint, params, boards, experiments, plan,
  stats.
- **`BuildFailure`:** the error shape used when evaluation throws.

Declared but never produced: NodeKind `lambda` and `compare`, and EdgeKind `binds`. A grep over `build.ts`
finds no place that emits them (§9).

### 2.6 The compiler: passes in order (`src/lang/build.ts`) [O]

`build(source, env, opts)` starts at L151. Each pass is wrapped in `pass(name, fn, detail)`, which times the pass
and pushes a `PassRecord` (L167). The Graph tab lists these records.

| # | Pass | Lines | What it does |
| --- | --- | --- | --- |
| 1 | `structure` | L174-183 | Evaluates the program (§2.1) and applies agent patches from `app/registry.ts` |
| — | (param registration) | L204-245 | Each declared parameter becomes a `ParamSummary` with initial binding `view`. Duplicates raise `param-duplicate` (L208) |
| 2 | `expand · resolve` | L313-497 | Resolves plan lambdas, expands arms × captures into capture instances, and validates evidence and datasets |
| 3 | `trace` | L635-745 | Dry-runs derives and live lambdas to record which parameters, signals and derives each reads, then infers bindings |
| 4 | `validate` | L748-827 | Lint rules (§3.6) |
| 5 | `lower` | L830-835 | Maps instances to their `spec`. A trivial pass, because the real lowering happens in `makeInstance` |
| 6 | `plan` | L838-872 | Stages, counts and the GPU-minute estimate |
| — | graph construction | L875-979 | Builds nodes and edges, de-duplicates edges, and drops edges whose endpoint is missing |
| — | stats and IR | L981-1022 | Node and edge counts, then the IR object |

**Pass 2, expand · resolve, in detail.**

- **`resolveDeep`** (L294-311) walks any value:
  - A function found in a plan slot is called with `ctx`. That is what makes it a *plan lambda*.
  - A `ParamRef` is replaced by the parameter's current value.
  - A `live(...)` found in a plan slot raises `live-in-plan-slot` (error, L303).
- **`makeCtx`** (L263-292) exposes `ctx.param(name)`, `ctx.data`, `ctx.dataset(ds)`, `ctx.capabilities`,
  `ctx.adapter`, `ctx.host` and `ctx.evidence`.
- **Parameter options and defaults** may themselves be plan lambdas. Failures raise `param-options-error` (L325)
  and `param-default-error` (L335).
- **Per experiment:**
  - The host defaults to `'playback@dgx'`.
  - `when` clauses are applied, then warmup. A `warmup.until` function is rejected with `lower-runner-slot` (L383),
    because a data lambda cannot run inside the runner.
  - Then phases and workload options are resolved, and arms are created, honouring `skip`.
  - The evidence archive is validated (`evidence-archive`, L417).
- **Captures × arms → `makeInstance`** (L517-591). Each instance gets a `spec` with these fields:

  | Field | Contents |
  | --- | --- |
  | `schema_version` | — |
  | `experiment_id`, `arm`, `host` | — |
  | `workload` | from `lowerWorkload`, L597-625 |
  | `comparison` | `baseline_revision`, `candidate_revision`, `arm_revision`, `switches`, `corunner`, `paired_order_seed` |
  | `state`, `warmup`, `expect`, `phases` | — |
  | `offer`, `admission`, `deadline` | — |
  | `repeat.processes` | — |
  | `collection` | `{mode, …}` |
  | `quality_gate_sha256` | — |
  | `evidence` | only when declared (L557) |

  - **`hash`** = `hash(stableStringify(spec))`.
  - **`status`** is assigned in this order:
    1. `cached` if `env.isAvailable(hash)`
    2. `blocked` if there is a `blockedOn`
    3. `import` if the capture is evidence
    4. otherwise `execute`
  - **`estimateGpuMin`** = `reps × requests × perRequestMs × factor / 60000`. The factor depends on the mode:

    | Mode | Factor |
    | --- | --- |
    | timing | 1 |
    | trace | 1.4 |
    | cpu | 1.2 |
    | memory | 1.8 |
    | kernels | 25 |
    | sanitizer | 30 |

    Evidence captures estimate to 0. `reps` means `repeat.processes` (default 3) for timing,
    `opts.processes` for trace, and `states.length` for memory.
- **`lowerWorkload`** (L597-625): for dino datasets it records `dataset_sha256`, `image_selection` and
  `image_ids`. `selectImages` (L129-149) accepts `'all'`, `'negatives'`, `'stratified'`, a count, or an explicit
  list of ids. An unregistered dataset blocks the capture (`dataset-images`, L610).
- **Two-stage evidence:** a capture that depends on evidence, such as a local run on images listed in an archive,
  is deferred to stage 2. When the evidence is unavailable it is `blocked` with `blockedOn: 'import:…'`.

**Pass 3, trace, in detail.**

1. Derives are dry-run through `readDerive` with a tracker, which records data-phase parameter reads.
   Failures raise `derive-error` (L643).
2. Board views are walked to collect the params, signals and derives they reference. These are view reads.
3. Live lambdas are run with a tracker.
4. Each board's experiments are collected from the run patterns its views use (`exp/arm/mode`).
5. Each parameter's binding is set to the strongest phase among its readers (L736-741, §2.9).

L732-734 loops over hypotheses and does nothing.

**Pass 6, plan, in detail.**

- Three stages:
  - 0: a capability probe for each host
  - 1: captures
  - 2: captures that depend on evidence
- Counts by status.
- `estimateGpuMin`, summed over every capture whose status is not `cached`.

### 2.7 Content hashing and identity [O]

- `hash` (`src/lang/util.ts` L1-13) is **cyrb53**, a 53-bit non-cryptographic string hash rendered as 13 hex
  digits.
- `stableStringify` (`util.ts` L16-34) sorts object keys, writes `undefined` as `null`, and writes a function as
  `ƒ:<hash of its source>`.
- The capture hash is the hash of the stable string of the lowered spec. Any change in workload, revision, image
  selection, switches or seed therefore produces a new capture. `build.test.ts` covers this with "workload source
  hash in the revision" and "identity changes with the subset" (the latter in `evidence.test.ts`).
- On the wire, `features/catalog/wire.ts` (`toWire`) normalizes the spec through `stableStringify`, so the
  server's re-hash matches. The server returns `409 spec_hash_mismatch` otherwise (`server/app.ts` L159).
- Build and view ids come from `nextId`, a global counter rendered as `build-<base36>`. They are *not*
  content-addressed and change on every evaluation.
- [I] 53 bits is enough to tell apart the captures of one lab. It is not a collision-resistant artifact identity
  once a catalog holds many artifacts from many labs, and archives and datasets already use SHA-256. Kiln should
  decide whether capture identity moves to SHA-256 as well.

### 2.8 Lambda phases [O]

The phase of a lambda is decided by **where** it appears, never by inspecting the function. `refs.ts` defines
`Phase = plan | data | view | handler | effect`.

| Phase | Syntactic slot | Receives | Runs when | May write state |
| --- | --- | --- | --- | --- |
| plan | any function in an experiment, capture, workload or param-options slot | `ctx` (`makeCtx`) | at build time, in pass 2 | no |
| data | `lab.derive(name, input, fn)` | `(rows, ctx)` | on read, memoized on the params it read (`runtime.ts` L113-147) | no |
| view | `live($ => …)` inside a view's arguments | `$` (Dollar) | at render | no; `$.set` throws (`runtime.ts` L225) |
| handler | `view.on(event, $ => …)` | `$` with `set`, `$.entity`, `$.row`, `$.key`, `$.value` | on a UI event (`board-context.tsx` `fire`) | yes, `$.set(ref, v)` |
| effect | `board.effect(fn)` | — | **never**; collected only | — |

The Dollar interface (`refs.ts` L7-16) has these members:

- `$(ref)` reads a param, signal or derive and is tracked.
- `$.read(name)` reads a derive by name.
- `$.peek(ref)` reads without tracking.
- `$.set(ref, v)` writes.
- In handlers it also carries the event context: `$.row`, `$.entity`, `$.key`, `$.value`.

`makeDollar` is `runtime.ts` L201-231.

There is no "eval" phase in the language. The assistant's code is evaluated by a separate runtime, described in
§4.7.

### 2.9 Parameter binding inference [O]

- `refs.ts` defines `BINDING_RANK = {view: 0, data: 1, plan: 2}` and `strongest(a, b)`.
- Every parameter starts as `view` (`build.ts` L204-245). In the trace pass it takes the strongest phase among its
  readers (L736-741).
- The binding drives what a change costs:

  | Binding | Effect of a change | Code |
  | --- | --- | --- |
  | VIEW | re-render only | `params/thunks.changeParam` applies immediately |
  | DATA | derived rows recompute; no rebuild | memo key in `readDerive` changes |
  | PLAN | new capture hashes; becomes a *pending plan* | `evaluatePending` rebuilds with the new values; if every capture is `cached` it applies, otherwise `setPending` |

- The UI shows the binding as a badge with the text `VIEW`, `DATA`, `PLAN`, or `PLAN · PENDING`
  (`BindingBadge.tsx` L4-14).
- ParamBar groups PLAN parameters first, under "Plan · what was measured" (`ParamBar.tsx` L26-27). Its legend
  reads "VIEW re-renders · DATA recomputes · PLAN needs runs" (L49).
- `build.test.ts` covers this with "parameter binding inference", "plan change produces captures" and "data change
  recomputes".
- [I] Inference is a dry run, so a parameter read on only one branch of a lambda may be missed and given too weak
  a binding. The `param-affects-mismatch` lint (error, L811) lets an author declare `.affects(...)` and have it
  checked against what was inferred.

### 2.10 Parameters (`src/lang/params.ts`, 264 lines) [O]

- **`ControlKind`:** `slider | range | number | checkbox | toggle | select | multiselect | radio | text | seed | pickRun`.
  The constructors are `paramKinds`, L86-98.
- **Modifiers on `ParamSpec`:** `label`, `help`, `default`, `unit`, `format`, `group`, `order`, `when`, `validate`,
  `affects`, `confirm`, `url`, `persist`, `debounce`.
  - `persist` and `debounce` are stored but never read anywhere in `src/`.
  - `when` is honoured only by `lib/params.ts` `isVisible`.
- **Options** may be a list, a plan lambda (`select(ctx => …)`, as in `dino-pr1005.lab.js` L29), a `live`
  lambda, or a query. They are normalized by `normalizeOptions`, and `implicitDefault` picks a default.
- **`checkParam`** (L146-202) validates a value against the kind and its options.
- **URL codec:** `encodeParam` (L210-222) writes a range as `lo..hi`, a checkbox as `1`/`0`, and a multiselect
  comma-joined. It omits the default value. `decodeParam` parses the same forms, and `formatParam` renders a value
  for display.
  - `app/UrlSync.tsx` keeps the query string in sync. A value that fails to decode is logged and ignored (L47).
    An unknown key is kept and warned about (L52).
  - A parameter change pushes a history entry, and any other change replaces the current one (L83).
- **Lints on parameters** (`build.ts`):

  | Code | Level | Line |
  | --- | --- | --- |
  | `param-unused` | warning | L805 |
  | `param-default-invalid` | error | L808 |
  | `param-affects-mismatch` | error | L811 |
  | `param-plan-identity` | info | L813 |
  | `param-options-empty` | warning | L814 |
  | `param-shadow` | warning | L819 |
  | `param-url-collision` | error | L820 |

- **`pickRun`:** with no value, it defaults to the first run that matches its pattern (`runtime.ts` `paramValue`).

### 2.11 Queries and rows [O]

**`src/lang/query.ts` (155 lines).**

- A `Query` is a lazy, immutable chain of ops.
- Roots on `q`: `runs`, `requests`, `spans`, `kernels`, `tensors`, `allocs`, `instants`, `batches`, `graphs`,
  `images`, `annotations`, `detections`, `checks`, `read` (a derive by name) and `of` (literal rows).
- Ops: `where`, `name`, `kind`, `role`, `phase`, `arm`, `warm`, `sort`, `top`, `distinct`, `pluck`, `first`,
  `one`, `follow`, `back`, `metric`, `sum`, `groupBy`, `agg`, `keep`, `map`, `stats`.
- `inputs()` returns the run patterns and derives a query reads. The trace pass and board-to-experiment discovery
  use it.
- `describe()` gives a human-readable form, used in panel eyebrows.
- `evaluate()` replays each op as a method call on `Rows`.

**`src/lang/rows.ts` (350 lines).**

- **`EntityKind`:** `run | request | span | kernel | code | op | tensor | alloc | instant | batch | graphgen | image | annotation | detection | check`.
- **`Link`:** `{from, to, rel, evidence, method}`. The evidence class of a link is direct, derived, heuristic,
  illustrative or unknown.
- **`ENT_PROTO`** methods:
  - `metric(name)` returns a missing Value whose reason distinguishes three cases: "counter unsupported on this
    host", "not collected in this capture", and "no counter capture for this entity".
  - `follow(rel)` and `back(rel)` traverse links, and `overlaps` tests time overlap.
- **`makeEnt`** (L114-121) gives the entity the query methods. It seals the entity and its `metrics` object with
  `sealObserved` (§3.3).
- **`Rows extends Array`** (L162-275). Besides the query ops it has `orderBy` and `find2`.
  - `sum` excludes missing values and reports how many it excluded in the method text.
  - `groupBy(...).agg(...)` returns `AggRows` carrying `__members` and `__prov: 'derived'`.
  - `AggRows.keep('max'|'min')` links each extreme row back to its source entity.
- **`FIELD_UNITS`** gives default units per field, used by tables and the hypothesis card.

### 2.12 compare (`src/lang/compare.ts`, 116 lines) [O]

- `compare(left, right)` returns a `CompareB` with three methods:
  - `.require(...fields)` requires these manifest fields to be equal. Any mismatched field is listed in
    `excluded`.
  - `.match(by.op | by.layout | by.role | by.code | by.name)` chooses how kernels are matched.
  - `evaluate` takes rep `#0` of each pattern and groups kernels by the matcher key. It sums `dur` per group and
    produces matched `pairs` sorted by delta, plus `unmatched` on the left and on the right.
- The result's `kind` text is *"structural match across runs — not one observed timeline"*.
  MirrorView stamps the same idea: `STRUCTURAL MATCH — SEPARATE CLOCKS` (`MirrorView.tsx` L135).

### 2.13 algo (`src/lang/algo.ts`, 260 lines) [O]

- Four deterministic walkthroughs: `algo.bilinear`, `weightedReduction`, `rmsnorm` and `matmulTiles`.
- Each has `.walkthrough()`, which returns groups, steps, a formula and notes. All of it is illustrative.
  - `rmsnorm` uses `Math.fround` and a pairwise reduction tree, so it shows real float32 rounding.
- StepperView renders a walkthrough with the stamp `ILLUSTRATIVE` and the footer "Computed from a small fixture;
  not recovered GPU state…" (`StepperView.tsx` L30).

### 2.14 Runtime (`src/lang/runtime.ts`, 253 lines) [O]

- **`BuildRegistry`** (L53-68) holds the non-serializable side of a build: builders, lambdas, `source`
  (DataSource), `boards`, `hypotheses` and so on. It is stored in `app/registry.ts` (`KEEP = 24`, L10).
- **`RuntimeState`** is `{params, signals}`, taken from Redux.
- **`readDerive`** (L113-147):
  - detects cycles
  - memoizes on derive name plus the values of the parameters it read
  - tracks parameter reads
  - tags plain object rows with `__prov: 'derived'` (`markDerived`)
- **`materialize`** resolves a query, a `live` lambda, a ParamRef or a SignalRef to rows. Helpers: `queryEnv`,
  `resolveValue`, `evaluateInput`.
- **Entities in signals:** `dehydrate` and `rehydrate` store entities in signals as `{__ent: ref}`, so Redux only
  ever holds references.
- **Run patterns:** `patternExperiments` matches `exp/arm/mode(#n)?`. `instancesForPattern` and `runsMatching`
  resolve patterns to captures and runs.

### 2.15 detections (`src/lang/detections.ts`, 285 lines) [O]

This is a TypeScript port of PR 1005's `grounding_dino_quality.py` at revision `d59d9ad`.

- **Matching:**
  - `ordered()`
  - `maximumMatching`, using BFS augmenting paths
  - `within()`, with an `isclose` tolerance of 1e-12
  - `pairDetections` and `compareDetections`
- **Overlap:** IoU, or for crowd regions, overlap divided by the detection's area.
- **Ground truth:** `evaluateDetections` gives precedence regular > ignored > crowd. `compareGroundTruth` and
  `cocoBox` are helpers.
- **`verdicts()`** returns one of exact, within-tolerance, changed, added or dropped.
- **Consumers:**
  - the server: `server/qualification.ts` imports `verdicts` and `evaluateDetections`
  - `data/datasets.ts`, which uses `cocoBox`
  - `organisms/views/DetectionsView/evidence.ts`
- **Tests:** `detections.test.ts` (28 tests) checks the port against `src/lang/__fixtures__/quality-golden.json`
  (5682 lines), which has 16 archive images plus edge cases.

---

## 3. The evidence contract

### 3.1 Provenance classes [O]

Values carry one of five provenance classes. `src/lang/values.ts` defines
`Prov = 'observed' | 'derived' | 'heuristic' | 'illustrative' | 'unknown'`.

| Class | Constructor | Meaning | Glyph (`lib/format.ts` L66-72) |
| --- | --- | --- | --- |
| observed | `val(v, opts)` (L40-42) | imported from a capture | ● |
| derived | `derived(v, opts)` (L48-50) | computed from observed values by a stated method | ◐ |
| heuristic | annotations (`annotationsSlice`), links | a judgement, not a computation | ◌ |
| illustrative | `illustrative(v, unit)` (L52-54), `algo` | a teaching fixture, not this system's state | ◇ |
| unknown | `missing(reason, opts)` (L44-46) | not measured; always carries a reason | ▨ |

Links between entities carry a parallel `Evidence` class (direct, derived, heuristic, illustrative, unknown). The
`RouteView` renders it per hop.

### 3.2 The Value object and "missing is NaN" [O]

A `Value` is
`{__value: true, value, unit?, prov, reason?, source?, scope?, denominator?, method?, metric?}`
(`values.ts`). Its prototype `VALUE_PROTO` (L20-31) defines two methods:

```ts
valueOf() { return typeof this.value === 'number' ? this.value
                 : this.value === null ? Number.NaN : this.value; }
toString() { return this.value === null ? `missing(${this.reason ?? ''})` : `${this.value} ${unit}`; }
```

**Consequences.**

- In a program, `a.measured < a.logical` compares numbers.
- Any comparison involving a missing value is **false**, because `NaN < x` and `NaN >= x` are both false.
- Unknown is never treated as zero.

**Formatting.**

- `formatValue` (`lib/format.ts` L32-51) renders a missing value as `—`. Its tooltip reads
  `MISSING · <reason>` followed by `metric`, `method`, `scope`, `denominator` and `source`.
- `raw()`, `num()` (finite numbers only), `isMissing()` and `provOf()` are the helpers.

### 3.3 Sealing: observed values are import-only [O]

```ts
// src/lang/values.ts L77-89
export function sealObserved<T extends object>(obj: T): T {
  return new Proxy(obj, {
    set(_t, prop) { throw new ProvenanceError(`observed values are import-only (tried to set ${String(prop)}). Record a note, a derived value or a hypothesis.`); },
    deleteProperty(_t, prop) { throw new ProvenanceError(`observed values are import-only (tried to delete ${String(prop)}).`); },
  });
}
```

- `ProvenanceError` is defined at L70-75.
- `makeEnt` (`rows.ts` L114-121) seals each entity and its `metrics` object.
- The assistant's reference text tells the model that "observed values are read-only"
  (`IdePane/reference.ts` L73).

[I] The seal is **shallow**, and it traps only `set` and `deleteProperty`:

- `Object.defineProperty(ent, …)` is forwarded to the target by default, because the Proxy has no
  `defineProperty` trap.
- A `Value` object reached through `ent.metrics.x` is not itself sealed, so `ent.metrics.x.value = 0` succeeds.
- Neither case was executed. Both follow from the Proxy semantics and the code above.

### 3.4 The paired-ratio estimator (`src/lang/stats.ts`) [O]

`stats.pairedRatio(opts)` (L23-92) is the estimator programs are expected to use for A/B latency. As pseudocode:

```text
pairedRatio({unit='process', ci=0.95, field='latency', seed /* ignored */}).of(rows):
  byArmRep := map "arm#rep" → list of numbers
  excluded := []
  for r in rows:
      key := r.arm + "#" + (r.rep ?? 0)
      if r.runValid === false:
          once per key: excluded += {rep, arm, reason: r.invalidReason ?? 'run invalid'}
          continue
      v := num(r[field])                       # null if missing or not finite
      if v is null or r.outcome != 'ok': continue
      byArmRep[key].append(v)
  pairs := []
  for rep in sorted distinct reps:
      b := byArmRep["baseline#"+rep]; c := byArmRep["candidate#"+rep]   # arm names are hard-coded
      if b and c: pairs += {rep, baseline: median(b), candidate: median(c), ratio: median(c)/median(b)}
  if pairs empty: return median = ci = missing('no paired valid processes', unit '×')
  ratios := [p.ratio for p in pairs]
  r := rng("pairedRatio:" + ratios.join(","))   # deterministic, seeded from the data itself
  boots := [ median(resample_with_replacement(ratios, r)) for 1..2000 ]
  sort boots
  lo := quantile(boots, (1-ci)/2);  hi := quantile(boots, 1-(1-ci)/2)   # linear interpolation
  return { median: derived(median(ratios), unit '×', method 'median of per-process ratios · N paired; M excluded'),
           ci: [derived(lo), derived(hi)] with method 'bootstrap over N processes',
           pairs, excluded, level: ci, note }
```

**Design intent.** The doc comment at L19-22 says: "The process is the resampling unit, so a bootstrap over
correlated requests cannot masquerade as many independent experiments."

**Limitations.** [O] unless marked.

- `seed` is accepted (L23) and never used. The RNG is seeded from the ratios themselves (L69).
- Arm names are hard-coded to `baseline` and `candidate` (L56-57).
- Pairing matches on rep index alone. Nothing checks that both arms come from the same paired-order block.
- [I] With only 2 processes, which is common because `repeat({processes: 2})`, a bootstrap over two ratios gives
  at most three distinct medians. The "95 % CI" is then very coarse, and the UI shows it without warning.

**`stats.offered(rows)`** (L95-116) does open-loop throughput accounting.

- It returns `requestsOnTime`, `windowsOnTime`, `expired`, `rejected`, `outstandingAtEnd` and `offered`, each
  as a `derived` Value with a method string.
- Rates are per process: it sums each repetition's offer window rather than taking one window across all of them
  (comment at L98).
- It breaks the missing-is-never-zero rule twice:
  - `num(r.scheduledArrival) ?? 0` (L100) turns a missing arrival into time 0.
  - `num(r.windows) ?? 1` (L103) turns a missing window count into 1.

`stats.summary(rows, field)` delegates to `Rows.stats`.

The `dino-pr1005` preset does **not** use `pairedRatio`. It writes its own image-cluster bootstrap with an LCG
seeded `20261012 + rep` (`dino-pr1005.lab.js` L13-25, L109-120), because the resampling unit there is the image,
not the process. [O]

### 3.5 Hypothesis verdicts: how and where [O]

They are computed in `src/components/organisms/views/HypothesisView/HypothesisView.tsx` L19-48 and reused by
`LabTab.tsx`:

```ts
// L22-46 (condensed)
const rows = h.prediction ? materialize(reg, h.prediction.query, state) ?? [] : [];
const checks = rows.map((row) => {
  const missing = Object.entries(row).filter(([, v]) => isValue(v) && v.value === null).map(([k]) => k);
  let pass = false;
  try {
    const out = h.prediction!.fn(row);
    pass = isValue(out) ? out.value !== null && Boolean(out.value) : Boolean(out);   // a missing Value supports nothing
  } catch { pass = false; }
  return { row, pass, missing };
});
const support = h.support.map((s) => { /* runs referenced by the supporting query whose entity.validity.ok is falsy */ });
if (support.some((s) => s.invalid.length)) verdict = 'unqualified';
else if (!checks.length) verdict = 'open';
else if (checks.every((c) => c.pass)) verdict = 'supported';
else if (checks.some((c) => !c.pass && c.missing.length)) verdict = 'open';
else verdict = 'refuted';
```

Truth table, in order of precedence:

| Condition | Verdict | Tone (L50) |
| --- | --- | --- |
| Any supporting run has `validity.ok` falsy | unqualified | warn |
| The prediction query returns no rows | open | warn |
| Every row's predicate passes | supported | ok |
| A failing row has at least one missing top-level Value field | open | warn |
| Otherwise | refuted | bad |

**Rendering.** The card shows:

- the claim, through RichText, so inline math works
- the verdict as the panel's stamp, `stamp={verdict.toUpperCase()}` (L66)
- each check row with its fields, through ValueCell
- the supporting queries with counts and invalid runs
- the alternatives, including annotations from `annotationsSlice` shown as "◌ added by …"
- the scope, as the footer

**Worked examples from `dino-pr1005.lab.js`:** [I]

- `latency-halved` (L156-163) predicts `r.reduction >= 0.5`.
  - Before import, `reduction` is `missing('no paired timing imported')`. The comparison is `NaN >= 0.5` →
    false, and the row has a missing field → **open**. This is the intended path.
- `fusion-active` (L180-184) filters kernels on `name === 'fused_sampling'`.
  - If no such kernel exists, there are zero rows → **open**. It is not refuted, even though "no launches" is
    arguably evidence *against* the claim.
- `memory-within-20` (L164-169) predicts `r.ratio <= 1.2`.
  - The `memoryGrowth` derive computes `Number(b[pool])` (L137). A missing pool value becomes a plain `NaN`
    number, not a Value, so `missing` is empty. The check fails → **refuted** where the honest verdict would be
    **open**.

**Weaknesses.**

- [O] A predicate that **throws**, for example a `TypeError` on an absent field, sets `pass = false` (L30-32).
  If no top-level Value is missing, the verdict is `refuted`.
- [O] Missing-field detection looks only at top-level Value fields of the row (L24).
- [I] A predicate written in the negative, such as `!(r.x > 1)`, passes on NaN and would report `supported`.
- [I] A supporting run with no `validity` field reads as invalid, because `undefined?.ok` is falsy (L38), and
  makes the hypothesis `unqualified`.
- [O] A supporting query that matches zero runs adds nothing to `invalid`. A hypothesis whose evidence was never
  imported is therefore judged on its prediction rows alone. `evidence.test.ts` covers the case where that
  correctly yields `open`.
- [O] There is no unit test of `evaluateHypothesis` itself. It is exercised only indirectly, through
  `evidence.test.ts`.

### 3.6 Lint rules [O]

All lint codes are produced by `build.ts` (line = where the item is pushed):

| Code | Level | Line | Trigger |
| --- | --- | --- | --- |
| `param-duplicate` | error | L208 | parameter declared twice in one scope |
| `live-in-plan-slot` | error | L303 | `live()` used where a plan value is needed |
| `param-options-error` | error | L325 | options lambda threw |
| `param-default-error` | error | L335 | default lambda threw |
| `resolve-error` | error | L348, L358, L459, L491 | a plan lambda threw |
| `lower-runner-slot` | error | L383 | a function in a slot the runner must execute (e.g. `warmup.until`) |
| `evidence-archive` | error | L417 | evidence archive unknown or wrong format |
| `collector-lower` | error | L510 | custom collector failed to lower |
| `dataset-images` | error | L610 | dataset not registered or image selection invalid |
| `derive-error` | error | L643 | a derive threw during the trace dry-run |
| `unknown-method` | warning | L752 | recorder saw an undeclared builder method |
| `no-quality-gate` | warning | L760 | experiment has no `gate` ("results will be marked unqualified") |
| `no-activation-rule` | warning | L762 | dino workload without `expect` ("a silent fallback would count as a candidate result") |
| `no-repetition` | warning | L763 | no `repeat` |
| `no-workload` | error | L764 | no `workload` |
| `counters-not-latency` | info | L767 | kernels capture with `cacheControl`: counters, not latency |
| `capture-unsupported` | error | L777 | kernels/sanitizer on a host whose `counters.unsupported` includes `'*'` |
| `host-unavailable` | error | L780 | no capability report for the host (e.g. `local` without the server probe) |
| `fork` | info | L783 | experiment is a fork |
| `layout-area` | warning | L797 | `board.layout` area name with no matching view |
| `param-unused` | warning | L805 | parameter read by nothing |
| `param-default-invalid` | error | L808 | default fails `checkParam` |
| `param-affects-mismatch` | error | L811 | declared `.affects()` disagrees with the inferred binding |
| `param-plan-identity` | info | L813 | plan parameter changes capture identity |
| `param-options-empty` | warning | L814 | options resolved to an empty list |
| `param-shadow` | warning | L819 | board/experiment parameter shadows a lab parameter |
| `param-url-collision` | error | L820 | two parameters share a URL key |

`hello.lab.js` is the teaching preset for lints. `build.test.ts` ("hello lints") asserts that it yields
`no-quality-gate`, `no-activation-rule` and `no-repetition`.

### 3.7 Where the contract leaks (summary)

| # | Leak | Evidence | Kind |
| --- | --- | --- | --- |
| 1 | Synthetic counters carry prov `observed`; "synthetic" is a run flag only | `data/generate.ts`: kernel metrics built with `val()`; `run.synthetic`, `manifest.synthetic` | [O] |
| 2 | A missing `scheduledArrival` becomes 0 and a missing `windows` becomes 1 | `stats.ts` L100, L103 | [O] |
| 3 | A predicate that throws produces `refuted` | `HypothesisView.tsx` L30-32, L46 | [O] |
| 4 | `Number(Value)` strips provenance; NaN then reads as a refutation | `dino-pr1005.lab.js` L137 + verdict logic | [I] |
| 5 | Derived aggregates in user code may keep an observed Value: `median` of an odd-length list of Values returns the middle Value itself | `dino-pr1005.lab.js` L12, L88 | [I] |
| 6 | The seal is shallow, with no `defineProperty` trap | `values.ts` L78-89, `rows.ts` L118-120 | [I] |
| 7 | `illustrative()` values have no board-level stamp; `ILLUSTRATIVE DATA` in the title block means "no experiments" | `BoardSheet.tsx` L24 | [O] |
| 8 | Hypotheses are judged in the UI, so a headless consumer (CLI, server, Kiln) has no verdict API | `HypothesisView.tsx` L19 | [O] |

---

## 4. The Redux store and runtime

### 4.1 Store configuration (`src/app/store.ts`, 94 lines) [O]

- **Reducers** (L17): `program`, `build`, `params`, `signals`, `selection`, `catalog`, `jobs`, `agent`,
  `annotations`, `ui`, `server`, and `labApi` (RTK Query).
- **Middleware checks:** `serializableCheck` and `immutableCheck` both ignore the `build` slice
  (`ignoredPaths: ['build']`, `warnAfter: 128`, L34-35). The IR is large, and it is treated as immutable by
  convention.
- **Store subscribers:**
  - The layout is persisted to `localStorage['perf-lab:layout']` (L47).
  - The assistant model is persisted to `localStorage['perf-lab:assistant-model']` (L60-61).
  - An edited program is saved to the server 800 ms after the last change, as `PUT /programs/:labId`. When the
    edit is removed (`source === undefined`), a `DELETE` is sent instead, restoring the preset (L67-89). A
    failure is swallowed, and the next change retries.
- **Dev hook:** in dev builds `src/main.tsx` L13 exposes `window.__perfLab = { store }`.
- **Routing:** `App.tsx` defines `/` → redirect to `/labs/hello`, `/labs/:labId`, and
  `/labs/:labId/boards/:boardId`. `ThemeSync` uses `localStorage['perf-lab:theme']`. `ServerSync` dispatches
  `connectServer`.

### 4.2 Slices [O]

| Slice | State | Notes |
| --- | --- | --- |
| `program` | `sources[labId]`, `autoBuild` | `selectSource` falls back to the preset's raw source |
| `build` | `byLab[labId] = {buildId, ir, builtAt, error}` | 33 lines |
| `params` | `byLab[labId] = {values, applied, pending?: PendingPlan}` | `PendingPlan` = `{changes[{key,urlKey,from,to}], captures, hosts, estimateGpuMin}` |
| `signals` | board-local signal values (entities dehydrated as `{__ent}`) | — |
| `selection` | `tab ∈ {lab, graph, plan, runs, inspect, agent}`, `sel` (entity ref), `node` (IR node) | — |
| `catalog` | `seed`, `imported`, `catalogLoaded`; origin `synthetic \| measured \| seed \| job` | Decides `cached` status |
| `jobs` | `list` of jobs; `JobStatus` = `proposed \| approved \| running \| importing \| done \| failed \| cancelled` | Actions `jobAdded`, `jobUpdated`, `jobUpserted` |
| `agent` | turns per lab; `Turn` has `code`, `result`, `jobId`, `mode` (scripted \| live), `usage`, `step`, `streaming`, `skipped`; `mode` defaults to `'scripted'` | — |
| `annotations` | `byLab[labId][hypothesisId].alternatives` with prov `heuristic` | Client-only; never sent to the server |
| `ui` | `theme`, pane sizes, `LAYOUT_LIMITS`, `console` (capped at 300 lines) | — |
| `server` | `status ∈ {unknown, online, offline}`, `health {probe, features, assistant}`, `models`, `defaultModel` | — |
| `labApi` | RTK Query `hosts` and `capabilities` with `fakeBaseQuery` | Effectively a stub; real traffic goes through thunks |

### 4.3 Thunks [O]

**`build/thunks.ts` `buildLab(labId, reason)`** (L18-63). The steps run in this order:

1. **First build only:** a *seed build* in `seedMode` mints synthetic hashes for every host except `local`. It
   dispatches the seed and POSTs `/labs/:id/seed` when the server is online.
2. **The real build** with `appEnv(catalog)`, then `registerBuild` (registry) and `buildSucceeded`.
3. Console log lines.
4. `evaluatePending`.
5. `loadMeasured` when online.

**`params/thunks.ts`.**

- **`changeParam`:** checks the value (`checkParam`), then `setValue`.
  - A VIEW or DATA binding is applied immediately.
  - A PLAN binding goes to `evaluatePending`.
- **`evaluatePending`:** builds a candidate IR with the desired values. If every capture is `cached`, it applies
  them. Otherwise it records a `PendingPlan`.
- **`revertPlan`** restores the applied values.
- **`runPendingPlan`** calls `proposeJob({by: 'user'})`.

**`jobs/thunks.ts`.**

- **`proposeJob`** (L20-61). The job's `budget` is the sum of `estimateGpuMin`, rounded to one decimal place
  (L29). Then:

  | Server | Captures | What happens |
  | --- | --- | --- |
  | online | any | `POST /jobs {id, labId, captures: toWire[], reason, proposedBy: by==='agent' ? 'assistant' : 'user', budgetGpuMin, approve: by==='user'}` (L39-49) |
  | offline | any capture on `local` | Fails: "local captures run only on it" (L55-58) |
  | offline | none on `local` | A user proposal is auto-approved (L59). An agent proposal stays `proposed` |

- **`approveJob`** (L63-75) sends `POST /jobs/:id/approve`, or runs the offline `runJob` simulation, which sleeps,
  marks the captures imported and rebuilds.
- **`cancelJob`** sends `POST /jobs/:id/cancel`.

### 4.4 Server endpoints and the SSE stream [O]

The client calls these endpoints, all under `/api` and proxied by Vite:

| Method | Path | Caller (line) | Notes |
| --- | --- | --- | --- |
| GET | `/health` | `features/server/thunks.ts` L191, L210 | 4 s timeout; sets online/offline |
| GET | `/hosts/local/capabilities` | L220 | 10 s timeout; feeds `data/capabilities.ts` `local` |
| GET | `/catalog` | L63 | origins synthetic/measured, `importedAt` |
| GET | `/jobs` | L230 | upserted into `jobsSlice` |
| GET | `/assistant/models` | L160 | retried up to 10× |
| GET | `/programs/:labId` | L179 | saved source overrides the preset |
| PUT, DELETE | `/programs/:labId` | `app/store.ts` L83 | debounced 800 ms |
| POST | `/labs/:id/seed` | `build/thunks.ts` | synthetic seed hashes |
| GET | `/evidence`, `/datasets`, `/datasets/:id` | `data/datasets.ts` `loadEvidence` | archives and datasets kept outside Redux |
| GET | `/bundles?hashes=` | `data/bundles.ts` | batches of 16; `revive()` restores Value prototypes from JSON |
| POST | `/jobs`, `/jobs/:id/approve`, `/jobs/:id/cancel` | `jobs/thunks.ts` | — |
| POST (SSE) | `/assistant/...` turns, results, archive, restore | `agent/runtime.ts` | `services/server.ts` `streamPost` parses SSE from a POST body |
| GET | `/assistant/conversations?lab=` | `loadTranscript` | — |

`services/server.ts` wraps `fetch` with a 15 s default timeout and a `ServerError`.

**SSE** (`features/server/thunks.ts` L126-151): `new EventSource('/api/events')` listens for these events.

| Event | Handling |
| --- | --- |
| `job.updated` | `serverJobUpdated` |
| `artifact.imported` | catalog refresh |
| `evidence.registered` | evidence refresh |
| `dataset.materialized` | dataset refresh |
| `error` | `checkHealth` (comment at L151) |

A job reported `done` is held in `importing` until `refreshAfterImport` has loaded the new bundles, so the UI
never shows "done" with stale data. `connectServer` runs only once.

### 4.5 State outside Redux [O]

- **`app/registry.ts`:** a `BuildRegistry` map keeping the last 24 builds (`KEEP = 24`, L10). It also holds the
  agent patches for each lab (`addPatch`, `getPatches`, `setPatches`), which pass 1 applies.
- **`data/datasets.ts`:** archives and datasets (`setDatasetsForTest` for tests).
- **`data/capabilities.ts`:**
  - the synthetic `HOSTS`: `playback@dgx` (GB10, with `lts__t_sectors_srcunit_ltcfabric*` listed as unsupported)
    and `playback@rtx-dev`
  - the probed `local` host, whose peak is `NaN`
  - `ADAPTERS`, the workload contracts:
    - `dino` (treatments: reference, norm+transfers, replay+fusion, integrated; `perRequestMs` 110)
    - `embedding`, `sampler`, `unknown`

### 4.6 Board context and URL sync [O]

- **`app/board-context.tsx` `BoardCtx`:** `{resolve, resolveLazy, setRef, fire, stale}`.
  - `fire(view, event, payload)` dispatches `select` for entities, then runs the view's `.on` handlers with a
    writable `$`.
  - `stale` is the set of experiments affected by the pending plan. Panels that read them are dimmed and marked.
- **`app/UrlSync.tsx`:** parameters, `tab`, `sel` and `node` are kept in the query string (details in §2.10).

### 4.7 The assistant runtime (`src/features/agent/`) [O]

**Policy** (`builtins.ts`):

- `ASSISTANT = {can: […], run: {budgetGpuMin: 30, approval: 'human'}}`, plus four `BUILTIN_REPLIES`.
- `can` is only displayed (`AgentRail.tsx` L129).
- `approval: 'human'` is never read anywhere in the code (grep).

**Two modes.**

- **Scripted:** replies are parsed from `*.replies.txt` by `parseReplies`. The format is a `=== board` header, a
  `> prompt` line, prose, and a fenced `js` block.
- **Live:** `liveTurn` (`runtime.ts` L532-571) runs a client loop of at most 6 iterations over `streamPost`, which
  emits `delta`, `reply` and `error` events.
  - The **server** decides whether code may run: `MAX_STEPS = 4` (`server/assistant/service.ts` L14),
    `runnable = code && step <= MAX_STEPS` (L213).
  - After that the model is told to answer in prose (`systemPrompt(…, {final: step > MAX_STEPS})`, L203).
  - The prompt itself says "You get at most four code executions per question" (`server/assistant/prompt.ts` L12).

**Running code** (`runAgentCode`, `runtime.ts` L433-455):

```ts
const snap = takeSnapshot(getState, labId);                       // params, signals, annotations, patches
const scope = { ...createLibrary(), ...handles, log: logFn, console: { log, warn, error } };
const fn = new AsyncFunction(...names, `"use strict";\n{\n${code}\n}`);
const value = await Promise.race([fn(...), cancelled, timeout]);   // TIMEOUT_MS = 10 minutes
// on any throw, cancel or timeout:
restoreSnapshot(dispatch, labId, snap);  → { ok: false, error, rolledBack: true }
```

- `inspect()` renders results as bounded JSON of at most 8000 characters. That is the observation sent back to
  the model.
- `restoreSnapshot` rebuilds when the patches changed.
- [I] `Promise.race` does not stop the losing promise. Code that times out or is cancelled keeps running and can
  still dispatch actions after the rollback.

**Handle API** (`makeHandles`, L149-431). Two objects are passed to the code.

`lab`:

| Member | Purpose |
| --- | --- |
| `lab.ir` | the current IR |
| `lab.derive(name)` | read a derive |
| `lab.query(q)` | materialize a query |
| `lab.runs.find(pattern)`, `lab.run(ref)` | find runs |
| `lab.experiment(id).spec` | read an experiment's spec |
| `lab.experiment(id).fork(newId, fn?)` (L252) | add a forked experiment through a registry patch, then rebuild |
| `lab.experiment(id).patch(fn)` | patch an experiment |
| `lab.experiment(id).plan` | the experiment's plan |
| `lab.hypothesis(id).alternatives.list()` | list alternatives |
| `lab.hypothesis(id).alternatives.add(text)` | add an alternative with prov heuristic, client only |
| `lab.params.get(name)`, `lab.params.set(name, v)` | set goes through `changeParam`, so plan parameters become pending |
| `lab.plan` | `{pending, captures}` (L339-341) |
| `lab.start(expId, {reason, modes})` | propose a job (below) |
| `lab.checkpoint(label)` | returns `{label, restore()}` (L355-358) |
| `lab.jobs` | the job list |

`self`, for the board in view:

- `id`, `title`, `experiments`, `runs()`, `selected`
- a `params` Proxy and a `state` Proxy over the board's signals
- `focus(entity)` (L421), and `find(sel)`, which returns a view by name or kind (L424-427)

The job handle returned by `start` has `status`, `captures`, `approved` (a promise), `done` (a promise) and
`events` (an async iterator).

**`lab.start`** (L342-354) checks three things before proposing:

1. There is at least one capture in `execute` or `import`.
2. Every capture's host is one the lab declares (L345-348).
3. The estimate is within `ASSISTANT.run.budgetGpuMin` (L349-350).

It then calls `proposeJob({by: 'agent'})`. The server never auto-approves an assistant proposal (comment at
`server/app.ts` L171).

**Approval** happens in the UI:

- `PlanTab`'s `JobCard` has Approve and Decline buttons (`approveJob`, `cancelJob`).
- `AgentRail` embeds the same `JobCard` in the turn.
- The Plan tab's badge reads "N to approve".

**Weaknesses of the approval boundary.**

- [O] `server/app.ts` L160 takes `proposedBy` from the request body: `body.proposedBy === 'assistant' ?
  'assistant' : 'user'`. L172 approves immediately when `approve === true && proposedBy === 'user'`.
- [I] Assistant code runs with the page's globals (L439-446 shadow only the library names and `console`). It could
  `fetch('/api/jobs', {method: 'POST', body: … proposedBy: 'user', approve: true})` and skip the human
  entirely. In dev builds it could also reach `window.__perfLab.store`.
- [O] The 30 gpu-min budget is checked per `start` call, not summed across a turn or a conversation.
- [O] The budget is in "gpu-min" even for `local` CPU jobs. The UI relabels this with `minutesUnit`
  (`format.ts` L93).

**Transcripts.**

- `loadTranscript`: `GET /assistant/conversations?lab=`
- `clearTranscript`: `POST /assistant/archive`
- `continueTranscript`: `POST /assistant/library/:id/restore`
- A scripted turn is also stored on the server, through `POST /assistant/turns` and
  `/assistant/messages/:id/result`.

**Context.** `agent/context.ts` `boardContext` builds the compact board summary sent to the model. The
vocabulary the model sees is `IdePane/reference.ts` `REFERENCE`, which the server's `prompt.ts` imports, so the
IDE help and the model prompt share one source.

---

## 5. Components

### 5.1 Atomic structure [O]

`src/components/` follows atomic design, with one folder per widget holding `X.tsx`, `X.css` and `index.ts`:

| Level | Members |
| --- | --- |
| atoms (17) | BindingBadge, Button, Checkbox, Chip, Eyebrow, Icon, IconButton, Kbd, Meter, NumberField, ProvenanceGlyph, RangeSlider, Segmented, SelectBox, Slider, TexMath, TextField |
| molecules (18) | CodeBlock, CodeEditor, ConfirmDialog, ConsoleLog, DataBlock, DetectionOverlay, EmptyState, EntityChip, KeyValueTable, MetricsTable, Panel, ParamControl, PresetMenu, RichText, Splitter, StatTile, TabBar, ValueCell |
| organisms (15 + views) | AgentRail, BoardSheet, BoardStrip, GraphTab, IdePane, Inspector, InspectTab, LabTab, ParamBar, PlanTab, PresetPicker, RunsTab, TopBar, TranscriptLibrary, ViewRenderer, `views/*` |
| templates | WorkbenchLayout |
| pages | WorkbenchPage, NotFoundPage |

### 5.2 WorkbenchPage and WorkbenchLayout [O]

- **`WorkbenchPage.tsx`:**
  - The first build waits for the server check. `ServerSync` must settle first, so the seed-or-measured choice is
    correct.
  - Global shortcuts:

    | Key | Action | Line |
    | --- | --- | --- |
    | ⌘/Ctrl+B | toggle the IDE | L43-46 |
    | ⌘/Ctrl+Alt+B | toggle the inspector | L43-46 |
    | ⌘/Ctrl+Enter | build | L47 |
    | ⌘/Ctrl+/ | focus the agent | L50 |
    | `[` and `]` | previous and next board, ignored while typing | L54-56 |
    | Esc | clear the selection, unless a dialog is open | L58 |

- **`WorkbenchLayout.tsx`:**
  - Panes: `top` (TopBar), `ide` (IdePane), `center` (ParamBar + BoardSheet), `inspector` and `strip`
    (BoardStrip).
  - Splitters are keyboard-operable: arrows, Shift for big steps, Home/End, double-click to reset, Enter to
    collapse (README L72-76).
  - A collapsed pane leaves a labelled rail.
  - The inspector docks right or bottom.
  - Sizes are clamped by `LAYOUT_LIMITS` and persisted (§4.1).

### 5.3 BoardSheet [O]

`BoardSheet.tsx` renders the board as a sheet on a drafting table. The doc comment calls it a "dimension label,
title, panels and a title block". Its parts, in order:

1. **Registration marks** (an SVG circle plus a cross) at the corners (L15-17).
2. **Dims line:** `B-NN`, the run count, the invalid count and coverage.
3. **Stale banner:** shown when the pending plan touches this board's experiments (L35-38).
4. **Views:**
   - In a CSS grid using `board.layout` areas, but only if areas exist and the sheet is wider than 860 px (L57).
   - Everything else goes in a vertical stack (L100-104).
5. **Title block** (L105-113):

   ```text
   PERF LAB — <title> | BOARD B-03 OF 7 | 2 PARAMS | BUILD <id> | <dataOrigin>
   ```

`dataOrigin` (L22-29) works like this:

```ts
const runs = experiments.flatMap((e) => reg.source.runs(`${e}/*/*`));
if (!runs.length) return experiments.length ? 'NO RUNS IMPORTED' : 'ILLUSTRATIVE DATA';
const measured = runs.filter((r) => r.synthetic === false);
if (!measured.length) return 'SYNTHETIC DATA';
return measured.length === runs.length ? `MEASURED ON ${HOSTS}` : `MEASURED ON ${HOSTS} + SYNTHETIC`;
```

[O] There are two doc comments stacked on `dataOrigin` (L20-21). The first belongs to `BoardSheet`, which has
none of its own. This is a cosmetic slip.

### 5.4 ViewRenderer and every view type [O]

`ViewRenderer.tsx`:

- The `VIEWS` map (L41-64) picks the renderer.
- Layout kinds (`row`, `stack`, `grid`, `split`, `component`, `kind:*`) fall through to `Layout` (L67-110).
- Anything else renders `PanelError("no renderer for view kind …")` (L113-114).
- Each view is wrapped in an error `Boundary` (L36-38, L116-118).
- `Layout` calls `useBoard()` and then discards the result with `void ctx` (L68, L102). That is dead code.

Every view draws inside `Panel` (`molecules/Panel/Panel.tsx`). The panel provides:

- an eyebrow with the view kind and its input description
- an optional title
- an optional dashed **stamp** (`Panel.tsx` L24; `Panel.css` L23-29: 1px dashed muted border, 9px mono 600,
  letter-spacing 0.14em)
- actions and a footer
- a stale state

| Kind | Renderer | What it shows / notable behaviour |
| --- | --- | --- |
| `table` | TableView | Infers columns; limit 200 rows; keyboard row navigation; `select` handler; footer notes "◐ derived aggregates" when rows are `__prov: derived`. Declared `sort`/`limit`/`labels` props are not read |
| `chart` | ChartView | d3 scales; marks `point`, `bar`, `line`; shapes; missing values drawn hatched and **excluded from scales**; derived values stippled/dashed; track lane; log scale; legend naming every hue. Declared `rule`, `roof`, `filter`, `legend` props are not implemented |
| `timeline` | TimelineView | Lanes, time buckets, `ROLE_FILL`, `RoleLegend` |
| `stat` | StatView → StatTile | Shows a `PairedRatioResult` as figure + "95 % CI lo – hi" + method; declared `unit`/`format`/`compare` ignored |
| `manifest` | ManifestView | `RunBadges` (valid, qualified, coverage, measured/synthetic) + manifest rows |
| `manifestDiff` | ManifestDiffView | Separates INVALIDATING fields (toolchain, host, model…) from TREATMENT fields |
| `mirror` | MirrorView | Two traces on two clocks with structural correspondence; `EXCLUDED` stamp when `require()` fails (L54); `STRUCTURAL MATCH — SEPARATE CLOCKS` (L135) |
| `kernelCard`, `metrics` | KernelCardView | Counters for a kernel pair matched structurally; `metrics` is an alias |
| `ledger` | LedgerView | Grouped bars within one scope (logical vs measured vs retained) |
| `route` | RouteView | Request → kernel route with per-hop evidence class |
| `stepper` | StepperView | `algo.*` walkthrough; stamp `ILLUSTRATIVE`; declared `show`/`casts`/`tree`/`step` ignored |
| `hypothesisCard` | HypothesisView | §3.5 |
| `note`, `text`, `math` | NoteView, TextView, MathView | RichText with inline `$…$`; MathView uses TexMath (MathJax 4, lazy) |
| `source` | SourceView | `src('rev:path#symbol')` with a pinned GitHub link via `sourceLink` (`format.ts` L74-90; four pinned SHAs) |
| `runList` | RunListView | Runs matching a pattern with their badges |
| `control` | ControlView | A ParamSpec bound in the board body (Slider or Segmented) |
| `batchView` | BatchView | Logical vs physical batch order |
| `detections` | DetectionsView | SVG overlay + table; `all` or `diff` mode; layers: ground truth dashed, baseline thick, candidate thin, other runs dotted (`DetectionsView/evidence.ts` `layersFor`) |
| `gallery` | GalleryView | Image grid; filter `all \| recorded \| differs \| negatives`; keyboard navigation; `.selected(ref)` + `.on('select')` |
| `jobList` | **none** | Declared in `library.ts` L159 and `builders.ts` L62; renders the "no renderer" error |

`detections` and `gallery` have no entry in `VIEW_METHODS`. Their methods (`runs`, `selected`, `filter`, `diff`)
are therefore stored through the recorder without validation, and `unknown-method` lints do not apply to them in
the usual way. [O] for the missing entry; [I] for the exact lint behaviour.

### 5.5 IdePane and the editor [O]

- **`IdePane.tsx`:**
  - Tabs: `lab.js`, `replies` (when the preset has a replies file), and `reference`.
  - Auto-build fires 450 ms after the last edit (L42) when `autoBuild` is on.
  - "Reset to preset" is available.
  - The console sits below, behind a Splitter.
- **`CodeEditor.tsx`:**
  - A `<textarea>` (L32) laid over a syntax-highlighted mirror (`lib/highlight.tsx`, `.hl-*` classes in
    `base.css` L83-103), with a line-number gutter.
  - The build's error line is highlighted.
  - ⌘Enter builds, and Tab inserts two spaces.
  - It is not CodeMirror: there is no completion, no folding, and no lint markers beyond the error line.
- **`IdePane/reference.ts` `REFERENCE`:** the vocabulary in groups. It is shown in the reference tab and imported
  by `server/assistant/prompt.ts`.

### 5.6 Inspector tabs [O]

`Inspector.tsx` has a TabBar with the tabs below, plus a dock toggle (right or bottom).

| Tab | Content |
| --- | --- |
| Lab | Boards; each experiment's question, arms, captures with plan status and resolved contract; each hypothesis with verdict (reuses `evaluateHypothesis`, `LabTab.tsx` L15, L32-41), evidence, alternatives, scope |
| Graph | IR as a filterable **tree** (scope, kind, text filters), readers per param, lints, pass records, "copy IR". Not a node-link diagram |
| Plan | Pending plan (Run / Revert), `JobCard`s (Approve / Decline), "propose missing captures"; badge "N to approve" or the count to run |
| Runs | `HostCard` per host (capability report), run catalog, `pickRun` binding |
| Inspect | Selected entity's fields (ValueCell) and relationships (links with evidence) |
| Agent | `AgentRail`: TurnView per turn, Scripted/Live segmented control, model and thinking menus, transcript library, archive |

### 5.7 ParamBar and ParamControl [O]

**`ParamBar.tsx`** (127 lines) shows "every declared parameter that reaches this board, grouped PLAN first, with
the pending-plan banner" (doc comment, L19).

- **Visible parameters:** `board.paramKeys`, filtered by `isVisible` (`.when`) (L24).
- **Grouping** (L26-29): PLAN parameters first, then by `order`. A parameter goes into its `group` or, by default,
  into "Plan · what was measured" or "Board".
- **Header:**
  - legend "VIEW re-renders · DATA recomputes · PLAN needs runs" (L49)
  - `PresetMenu`: `applyPreset` matches preset keys by `name` or `urlKey` and dispatches `changeParam` for each
    (L36-43)
  - "Reset all" when anything differs from its default (L51-66)
- **Pending-plan banner** (L68-86), with role `status`. It lists the changes `urlKey from → to` and the capture
  count, hosts and estimate (in `gpu-min` or `min` through `minutesUnit`). Its buttons are Review plan (switches
  to the Plan tab), Run plan and Revert.
- **Confirmation** (L106-124): a plan parameter declared with `.confirm(text)` opens a `ConfirmDialog` before the
  change. The dialog shows the text, `urlKey: from → to`, and "Nothing runs until you execute the resulting
  plan."
- [O] One slip: `value(confirm?.p ?? params[0])` (L113) evaluates even while the dialog is closed, and falls back
  to an unrelated parameter. It is harmless but sloppy.

**`ParamControl.tsx`** (160 lines) renders "one declared parameter: label, unit, binding badge, the control for
its kind, and a reset" (L38).

| Kind | Control |
| --- | --- |
| `slider` (L46) | Slider |
| `range` (L54) | RangeSlider; the value is shown as `lo–hi` (L33) |
| `number` (L62) | NumberField |
| `seed` (L65) | NumberField plus an IconButton "Draw a new seed", which uses `Math.random` (L69) |
| `checkbox` (L73) | Checkbox |
| `toggle` (L76) | Segmented |
| `select` (L87) | SelectBox |
| `radio` (L100) | native `<input type="radio">` group |
| `multiselect` (L112) | one Checkbox per option |
| `text` (L128) | TextField |
| `pickRun` (L131) | SelectBox over `runChoices` |

`BindingBadge` is rendered at L154.

### 5.8 TopBar, BoardStrip, PresetPicker [O]

- **`TopBar.tsx`:**
  - IDE toggle.
  - Brand "Perf Lab" with the chip `IR · DAG`.
  - Breadcrumbs `ML-PERF-001 › <preset group> › <lab title>` (L32-40). These hard-code the old ticket name.
  - A "pending plan · N captures" chip that opens the Plan tab.
  - The Build button.
  - Status text "built in N ms · nodes · boards · errors/warnings" (L52-58).
  - `⌘↵` hint, theme toggle, inspector toggle.
- **`BoardStrip.tsx`:** "The filmstrip of boards; `[` and `]` move between them" (L19).
- **`PresetPicker.tsx`:** "A grouped listbox of preset programs: arrow keys move, Enter opens, Escape closes"
  (L9).

---

## 6. Visual design

### 6.1 Tokens (`src/styles/tokens.css`, 133 lines) [O]

The header comment (L1-2) reads: "Design tokens, adapted from Lattice Deck (see design/03-workbench-ui-design.md
§2.1). Colour is a signal: chrome stays neutral; sig/warn/bad/ok carry meaning and always pair with a word or
glyph."

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--paper` | `#fafaf8` | `#121518` | drafting table (page background, `base.css` L11) |
| `--sheet` | `#ffffff` | `#181c20` | the board sheet / panels |
| `--ink` | `#111417` | `#e3e6e9` | text, observed glyph |
| `--on-ink` | `#ffffff` | `#121518` | text on ink fills |
| `--muted` | `#5d646a` | `#98a0a7` | secondary text, stamps |
| `--faint` | `#a9aeb2` | `#69727a` | unknown glyph, hatch lines |
| `--hair` / `--hair-soft` | `#b7bcc0` / `#e3e6e8` | `#4a5157` / `#2a3035` | rules, borders |
| `--grid` / `--gridmaj` | `#eef0f1` / `#e1e4e6` | `#1d2226` / `#252b30` | chart gridlines |
| `--sig` / `-l` / `-w` | `#1f4fd1` / `#c7d3f4` / `#eef2fc` | `#86a2f7` / `#2d3f78` / `#1b2440` | signal (focus ring, links, selection) |
| `--warn` / `-w` | `#b87100` / `#fbf3e4` | `#e0a23a` / `#2e2414` | warnings, pending |
| `--bad` / `-w` | `#d23b1e` / `#fcedea` | `#f07158` / `#34191a` | errors, refuted |
| `--ok` / `-w` | `#2e7d57` / `#e8f3ec` | `#5dbb8b` / `#17291f` | supported, valid |
| `--accent` | `#2e57c4` | `#8fa9f5` | stencil labels, numbering, formula rules, stippling (≥ 6:1, L24) |
| `--d1 … --d6` | `#3d6bc0 #b07a2e #2f8a6e #8462b0 #b4574a #3f8399` | `#82a4ec #e1af62 #6dc2a5 #b9a0e6 #e58f80 #82c0d4` | data series (each ≥ 3:1, L26) |
| `--d-candidate` / `--d-baseline` | `var(--d1)` / `#9a8a70` | `var(--d1)` / `#bcae95` | the two arms |
| `--stipple-tint` | `16%` | `22%` | series tint under stipple (`tintOf`, `format.ts` L60) |
| `--hl-c/s/n/f/k` | `#7a8086 #2e6b4f #8a5a00 #14365f #5b2a86` | `#7f878e #7fc79f #e0b067 #a9c2ff #d1a8ff` | syntax: comment, string, number, function, keyword |
| `--dither`, `--dither-l` | radial-gradient dot screens 3px / 4px | — | stipple fills |
| `--hatch`, `--hatch-warn`, `--hatch-bad` | 45° repeating-linear-gradients | — | missing / warning / bad fills |
| `--ide-w`, `--insp-w`, `--top-h`, `--strip-h` | `360px`, `392px`, `44px`, `92px` | — | layout defaults |
| `--shadow` | `rgba(17,20,23,.12)` | `rgba(0,0,0,.4)` | elevation |

Dark mode applies in two ways:

- `@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) {…} }` (L57-95)
- `:root[data-theme='dark']` (L97-133)

The two blocks are byte-for-byte duplicates. `ThemeSync` sets `data-theme`.

### 6.2 Typography [O]

| Token | Font stack | Use |
| --- | --- | --- |
| `--body` | Arial, Helvetica Neue, Helvetica, Liberation Sans, sans-serif | body text, 13px/1.45 (`base.css` L13) |
| `--display` | Archivo Variable (wdth axis via `@fontsource-variable/archivo`) | panel titles at 700 15px (`Panel.css`) |
| `--mono` | IBM Plex Mono (400/500/600) | numbers, code, stamps, title block |

Shared classes:

- `.num`: mono with `tabular-nums`.
- `.stencil`: 600 10px mono, `letter-spacing 0.12em`, uppercase (L77-81). The "stencil labels" of the drafting
  metaphor.
- `:focus-visible`: a 2px `--sig` outline (L30-33).

### 6.3 How provenance is shown [O]

**Glyphs.**

- `ProvenanceGlyph` (`atoms/ProvenanceGlyph.tsx` L5-9) renders `PROV_GLYPH[prov]`:

  | Prov | Glyph |
  | --- | --- |
  | observed | ● |
  | derived | ◐ |
  | heuristic | ◌ |
  | illustrative | ◇ |
  | unknown | ▨ |

- The tooltip is the prov in upper case, and `aria-label` is the prov name.
- Styling: 10px mono, muted. Observed uses `--ink`, unknown uses `--faint`.

**Cells.** `ValueCell` (`molecules/ValueCell.tsx` L5-20) is used for every table cell.

- The glyph appears only when `prov !== 'observed'` or the value is missing. Observed is the unmarked default.
- A missing value renders as `—` on the `--hatch` background, with a screen-reader-only "missing: \<reason\>".
- Derived text gets a dotted underline (`ValueCell.css`).
- Illustrative cells get a 1px dashed outline.
- The tooltip carries the full provenance chain from `formatValue`.

**Figures.** `StatTile` (`molecules/StatTile.tsx` L7-34) shows:

- the value with its glyph
- an eyebrow label
- "95 % CI lo – hi" when an interval exists
- the method footer, plus "missing: \<reason\>" when the value is missing

**Charts.**

- Missing points are drawn with a hatch and are excluded from the scale domains, so they cannot stretch the axes.
- Derived series are stippled or dashed.
- Series colours come from `seriesColor` (`format.ts` L62-64). Candidate and baseline are fixed, and the others
  cycle through `--d1..d6`.

**Stamps.** A dashed-border mono label in the panel header:

- `ILLUSTRATIVE` on every stepper (`StepperView.tsx` L30)
- the verdict on hypothesis cards: `SUPPORTED`, `REFUTED`, `OPEN` or `UNQUALIFIED`
- `EXCLUDED` and `STRUCTURAL MATCH — SEPARATE CLOCKS` on mirrors

**Title block.**

- The sheet's data origin: `SYNTHETIC DATA`, `MEASURED ON <HOSTS>`, `MEASURED ON … + SYNTHETIC`,
  `NO RUNS IMPORTED`, or `ILLUSTRATIVE DATA`.
- `ManifestView`'s `RunBadges` repeat "measured" or "synthetic" for each run.

[O] A gap: there is no per-board indicator for `illustrative()` Values. The only "ILLUSTRATIVE" markers are the
stepper stamp, and the title-block text that actually means "this board shows no experiments".

---

## 7. Presets and synthetic data

### 7.1 The preset programs [O]

`src/presets/index.ts` registers 11 presets. The program files are `src/presets/programs/*.lab.js`, loaded with
`?raw`.

| Preset | Lines | Teaches (README L53-65) |
| --- | --- | --- |
| hello | 20 | program → IR; the three standard lints |
| parameters | 45 | every parameter kind; VIEW/DATA/PLAN behaviour; pending plans |
| request-to-kernel | 37 | run picker, linked selection, route with per-hop evidence, counters by structural match |
| compare | 38 | manifest diff, paired estimate over processes, mirror on two clocks |
| learn | 43 | illustrative `algo` walkthroughs driven by parameters |
| matrices | 54 | `matrix()` / `when()` / `skip()`, interference matrix, custom collector (`defineCollector('gpu-clocks', …)`) |
| scenario-a | 77 (+45-line replies) | DINO sampled intermediate: logical vs measured vs retained; hypothesis; assistant |
| scenario-b | 66 | embedding layout churn under open-loop offer; request vs window throughput |
| scenario-c | 31 (+47-line replies) | lost trace interval; assistant forks a re-trace; a person approves |
| local-sampler | 88 | **measured** on `local`: eager `grid_sample` vs TorchInductor |
| dino-pr1005 | 243 | **imported + measured**: PR 1005's DGX evidence, acceptance rule as hypotheses, detections on images, local CPU run |

`build.test.ts` asserts that every preset builds.

### 7.2 Excerpt: `dino-pr1005.lab.js` L28-66 [O]

This excerpt shows most of the language in one place:

- a plan-lambda parameter, with options computed from a dataset
- experiments with revisions, activation contracts, quality gates and paired order
- archive-backed evidence
- capture lists
- limitations written as first-class statements

```js
const L = lab('PR 1005 · Grounding DINO acceleration on the DGX')
  .param('image', select(ctx => (ctx.dataset(DS)?.images ?? [{ imageId: 1993 }]).map(i => i.imageId)).label('Image').default(1993))
  // which images the local CPU run uses: a plan parameter, so each choice is its own pair of captures
  .param('localImages', select(['stratified', 'negatives', 4, 'all']).label('Local images').default('stratified'));
const image = L.ref('image');

return L
  .experiment('pr1005-dgx', e => e
    .question('Does the PR halve median latency on the DGX with outputs exactly unchanged and every memory pool within 20 %?')
    .host('playback@dgx')
    .workload(dino({ dataset: DS, images: 'all', labels: LABELS, precision: 'fp16', inputSize: 768, boxThreshold: 0.3, textThreshold: 0.3 }))
    .boundary('detect_with_options')
    .baseline(rev('a6f14d947'))
    .candidate(rev('d59d9ad'))
    .expect(activation({ replay: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.exact())
    .repeat({ processes: 2, order: paired({ seed: 20261009 }) })
    .evidence(DGX, { format: 'detection-qualification/v1' })
    .capture(capture.timing())
    .capture(capture.memory().states(['cold', 'warm', 'warm-repeat']))
    .capture(capture.stages())
    .capture(capture.predictions())
    .capture(capture.kernels())
    .capture(capture.tests())
    .limitation('one GB10 host shared with running services; the 128-image fixture is a reconstruction (799 annotations), not the PR’s original subset (734)')
    .limitation('the paired report keeps output digests, not detections; full predictions exist for 16 images'))
  .experiment('pr1005-prompt-policy', e => e
    .question('Does keying the replay graph on tensor layout, not prompt text, avoid recapture when equal-length prompts alternate?')
    .host('playback@dgx')
    .workload(dino({ dataset: DS, images: [1993, 7088, 16249, 25393], labels: LABELS, precision: 'fp16', inputSize: 768 }))
    .boundary('detect_with_options')
    .baseline(rev('d59d9ad'), a => a.switches({ variant: 'prompt-keyed', replayKey: 'layout + prompt text' }))
    .candidate(rev('d59d9ad'), a => a.switches({ variant: 'reuse', replayKey: 'layout' }))
    .expect(activation({ replay: 'active' }), { arm: 'candidate', onMiss: 'invalid' })
    .gate(quality.exact())
    .evidence(DGX, { format: 'detection-qualification/v1', reports: { timing: ['changing-prompt-diagnostic.json'] } })
    .repeat({ processes: 1 })
    .capture(capture.timing())
    .limitation('a controlled modification of the final stack, not the historical first-round implementation'))
```

The rest of the file shows four more patterns.

**A plan lambda in a workload** (L71):

```js
.workload(dino({ dataset: DS, images: ctx => ctx.param('localImages'), ... }))
```

Because `localImages` is read here, its binding is PLAN, and each choice gets its own captures.

**Missing values in derives** (L84-89):

```js
.derive('localLatency', q.requests('dino-local/*/timing'), rs =>
  ['baseline', 'candidate'].map(arm => {
    const mine = rs.where(r => r.arm === arm);
    if (!mine.length) return { arm, requests: 0, p50: missing('no local timing run yet: run the plan'), allExact: missing('no local timing run yet: run the plan') };
    return { arm, requests: mine.length, p50: median(mine.map(r => r.latency)), allExact: rs.every(r => r.exact === true) };
  }))
```

**Hypotheses over derives** (L156-163):

```js
.hypothesis('latency-halved', h => h
  .claim('The candidate’s median latency is at most half the original’s (the PR’s acceptance rule).')
  .predicts(q.read('latency').where(r => r.run !== 'both'), r => r.reduction >= 0.5)
  .supportedBy(q.requests('pr1005-dgx/*/timing'))
  .alternatives(
    'Co-resident services on the DGX slow both arms and compress the ratio (GPU load was recorded but not controlled)',
    'The model forward still dominates: the fused sampler is ~12 % of candidate CUDA time, matrix kernels the rest')
  .scope('whole-path backend latency on this host; excludes HTTP, decode outside the backend, model load and capture'))
```

**A handler writing a parameter, and a board parameter driving a live view** (L213-220, L228-233):

```js
.board('memory', b => {
  const pool = b.param('pool', toggle(Object.values(POOLS)).label('Pool').default('container cgroup'));
  b.title('Memory, one pool at a time')
   .add(chart(live($ => { const p = $(pool); return q.read('memoryGrowth').where(r => r.pool === p); })).mark('bar')...)
   ...
})
.board('detections', b => b
  .add(gallery(q.images(DS)).runs('pr1005-dgx/*/predictions').selected(image).title('COCO selection (choose an image)')
    .on('select', $ => $.set(image, $.entity.imageId)))
  .add(detections(DS, image).runs('pr1005-dgx/*/predictions')))
```

[O] Two small issues in the preset:

- `[...new Set(rs.map(r => r.rep))].sort()` (L100, L110) sorts lexicographically. Rep 10 would come before
  rep 2.
- The local `median` helper returns the middle *Value* for odd-length lists and a plain number for even-length
  ones (L12). The provenance of `p50` therefore depends on parity (§3.7, #5).

### 7.3 How `data/generate.ts` produces and labels synthetic data [O]

`generate.ts` is 724 lines.

- **`generateRun(capture, rep)`** is deterministic, seeded from `hash#rep` (`seedFrom` and `mulberry32` in
  `lang/util.ts`).
- **Labelling:** `run.synthetic = true` and `run.manifest.synthetic = true`. Toolchain strings carry
  "(synthetic)".
- **`genDino`** does the following:
  - generates kernel lists for the fused and unfused paths, depending on the arm's treatment
  - adds timing requests, trace spans, kernels, codes, ops and links with evidence classes
  - deliberately drops 3 launch links under replay, to exercise missing links
  - derives activation and validity from the experiment's `expect`
  - builds kernel metrics with `val()`
- **`dinoMemory`** produces the memory ledgers and peaks.
- **`genEmbedding`** produces:
  - an open-loop Poisson offer
  - an LRU graph cache with capacity 2, which produces layout churn
  - a CUPTI lost interval on rep 2 when no buffer is configured
- **`genCollector`** covers custom collectors. `gpu.clocks` gets one deliberately missing memory clock with the
  reason "nvidia-smi reported [N/A]".
- [I] Other modes without a specific generator (`cpu`, `sanitizer` and so on) fall through to `genCollector`'s
  generic shape. Only `gpu-clocks` has a bespoke synthetic form (around L137).

**Where synthetic and measured data meet.**

- `data/env.ts` `appEnv(catalog)` serves measured hashes from the bundles fetched from the server (`bundleRun`)
  and generates everything else. `syntheticEnv` generates everything.
- `data/source.ts` `createSource` indexes entities by run slot.
  - Blocked or unavailable captures are invisible to queries.
  - Dataset entities have refs prefixed `dataset:`.

Per the README (L126-135):

| Origin | Runs |
| --- | --- |
| Measured | every run on host `local`, produced by `workloads/perf_lab_local` and imported by `server/importer.ts` |
| Synthetic | runs on `playback@dgx` and `playback@rtx-dev`; the server has no executor for them |
| Imported | `.evidence(archive(…))` captures, labelled measured, with the archive as their source |

---

## 8. Tests [O]

Commands were run in `/Volumes/SSD/code/kiln/lab-workbench` on 2026-10-19 with the existing `node_modules`.

```text
$ pnpm exec tsc --noEmit -p .
(exit 0, no output)

$ pnpm exec vitest run src
 RUN  v4.1.11 /Volumes/SSD/code/kiln/lab-workbench

(node:28125) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:28123) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(Use `node --trace-warnings ...` to show where the warning was created)

 Test Files  7 passed (7)
      Tests  71 passed (71)
   Start at  13:45:05
   Duration  888ms (transform 738ms, setup 0ms, import 967ms, tests 1.07s, environment 0ms)
```

Per-file counts, from `--reporter=verbose`:

| File | Tests | Covers |
| --- | --- | --- |
| `src/lang/build.test.ts` | 26 | every preset builds; hello lints; binding inference; plan change → captures; data change recomputes; scenario B accounting; param codec; runtime error line numbers; data lambda in a runner slot rejected; scenario A evidence; `local` unavailable without a probe; workload source hash in the revision; counter capture refused on a host without counters |
| `src/lang/detections.test.ts` | 28 | golden comparison with `__fixtures__/quality-golden.json` (16 archive images + edge cases), `verdicts` |
| `src/lang/evidence.test.ts` | 6 | image selections; evidence captures become `import` or `blocked`; identity changes with the subset; server without evidence import; hypotheses over missing evidence are `open` |
| `src/features/agent/replies.test.ts` | 3 | scripted reply parsing; `.agent()` reported as an unknown method |
| `src/lib/yaml.test.ts` | 3 | YAML rendering of data blocks |
| `src/lib/tex.test.ts` | 3 | MathJax rendering |
| `src/components/molecules/RichText/tokenize.test.ts` | 2 | inline-math tokenization |

The `test` script also includes `server/**/*.test.ts`. Those files were outside the permitted command and were
not run here.

**Not covered by any `src/` test:** [O]

- Redux slices and thunks
- `evaluateHypothesis` as a unit
- `stats.pairedRatio` and `stats.offered` as units
- the agent runtime: rollback, budget, `start`
- every component (no DOM environment; `environment: 'node'`)
- URL sync
- `data/generate.ts` shapes, beyond what the preset builds touch

---

## 9. Weaknesses, gaps, dead code and half-finished work

Severity is my judgement: **H** affects correctness of evidence or safety, **M** misleads a user or an author,
**L** is cleanup.

| # | Item | Evidence | Sev |
| --- | --- | --- | --- |
| 1 | Human job approval can be bypassed by page-run code; the server trusts the client's `proposedBy` | `server/app.ts` L160, L172; `agent/runtime.ts` L439-446 | H [I for the exploit] |
| 2 | Assistant code runs unsandboxed in the page (`new AsyncFunction`), with network and DOM access; the prompt only asks it not to | `agent/runtime.ts` L443 | H |
| 3 | A throwing hypothesis predicate yields `refuted` | `HypothesisView.tsx` L30-32, L46 | H |
| 4 | Synthetic metrics carry prov `observed`; synthetic-ness is only a run flag | `data/generate.ts` (`val()` in kernel metrics); `BoardSheet.tsx` L25-28 relies on `run.synthetic` | M |
| 5 | `stats.offered` turns missing into 0 and 1 | `stats.ts` L100, L103 | M |
| 6 | `pairedRatio({seed})` ignored; arm names hard-coded; pairing only by rep index | `stats.ts` L23, L56-57, L69 | M |
| 7 | Verdict logic lives in a React view, so there is no headless verdict API | `HypothesisView.tsx` L19-48 | M |
| 8 | Missing detection in verdicts is shallow (top-level Value fields only) | `HypothesisView.tsx` L24 | M |
| 9 | Timeout and cancel do not stop agent code; it may act after rollback | `agent/runtime.ts` L444-446 | M [I] |
| 10 | Assistant budget is per `start` call, not cumulative; `approval: 'human'` is never read | `runtime.ts` L349-350; `builtins.ts` L8 | M |
| 11 | `board.effect` collected, never executed | `builders.ts` L338, L371; no other reference to `.effects` in `src/` | M |
| 12 | `jobList` view declared, no renderer | `library.ts` L159; `builders.ts` L62; `ViewRenderer.tsx` L41-64, L113-114 | M |
| 13 | Many declared view props are ignored by the renderers (chart `rule`/`roof`/`filter`/`legend`; table `sort`/`limit`/`labels`; stat `unit`/`format`/`compare`; stepper `show`/`casts`/`tree`/`step`; most `COMMON_VIEW` props) | `builders.ts` L38-65 vs `organisms/views/*` | M |
| 14 | `detections` and `gallery` have no `VIEW_METHODS` entry, so their methods are not validated | `builders.ts` L38-65 | L |
| 15 | IR declares `lambda`, `compare` (nodes) and `binds` (edge), but none is ever emitted | `ir.ts`; `build.ts` L875-979 | L |
| 16 | `lower` pass is a trivial copy; the hypotheses loop in `trace` is empty | `build.ts` L830-835, L732-734 | L |
| 17 | `persist` and `debounce` param modifiers unused | `params.ts`; grep finds no reader | L |
| 18 | Experiment `.compare(...)` prop resolved but never consumed | `builders.ts` L221-224; no reader in `build.ts` / views | L |
| 19 | Annotations (alternatives) are client-only; the server has `/annotations` but the client never calls it | `annotationsSlice`; grep `annotations` in `src/features` | M |
| 20 | `labApi` RTK Query slice is a stub (`fakeBaseQuery`); README calls it "the seam where the real backend replaces the synthetic data" | `services/labApi.ts`; README L103 | L |
| 21 | Capture identity uses cyrb53 (53-bit, non-cryptographic) | `util.ts` L1-13 | M [I for Kiln scale] |
| 22 | `nextId` global counter, so build and view ids differ on every evaluation (not content-addressed) | `util.ts` | L |
| 23 | Sealing is shallow, with no `defineProperty` trap | `values.ts` L78-89; `rows.ts` L118 | L [I] |
| 24 | `CodeEditor` is a textarea; no completion or inline lints | `CodeEditor.tsx` L32 | L |
| 25 | README stale: L27 "entirely on synthetic data … no collector, importer" contradicts L36 and L126-135; L100 "nine programs" (there are 11); design-doc links `../../design/...` resolve to nothing in this copy | `README.md`; `ls ../../design` → `No such file or directory` | L |
| 26 | TopBar breadcrumb hard-codes `ML-PERF-001` | `TopBar.tsx` L34 | L |
| 27 | Duplicate dark-theme token blocks (media query and `[data-theme='dark']`) | `tokens.css` L57-95, L97-133 | L |
| 28 | `ViewRenderer.Layout` calls `useBoard()` and discards it | `ViewRenderer.tsx` L68, L102 | L |
| 29 | Stacked doc comments on `dataOrigin`; `BoardSheet` has none | `BoardSheet.tsx` L20-21 | L |
| 30 | `ILLUSTRATIVE DATA` in the title block means "no experiments", not "contains illustrative values" | `BoardSheet.tsx` L24 | M |
| 31 | No component, slice or thunk tests; Vitest runs in `node` only | `vite.config.ts`; §8 | M |
| 32 | `ConfirmDialog` body evaluates `value(params[0])` while closed | `ParamBar.tsx` L113 | L |

---

## 10. Verifying the memo claim about `features/build/` [O]

The claim, in `/Volumes/SSD/code/kiln/imports/Untitled.md`, reads: *"two Redux files (features/build/) are
missing so the prototype does not build."*

**Verdict: false for this copy** of `lab-workbench`.

- `src/features/build/buildSlice.ts` (33 lines) and `src/features/build/thunks.ts` (63 lines) both exist.
- Eight modules import them:
  - `src/app/store.ts` L4
  - `src/features/server/thunks.ts` L4
  - `src/features/agent/runtime.ts` L5
  - `src/features/params/thunks.ts` L6
  - `src/features/jobs/thunks.ts` L3
  - `src/components/pages/WorkbenchPage/WorkbenchPage.tsx` L14
  - `src/components/organisms/IdePane/IdePane.tsx` L11
  - `src/components/organisms/TopBar/TopBar.tsx` L7
- `pnpm exec tsc --noEmit -p .` exits 0, and 71 of 71 `src` tests pass (§8).
- The memo also says (L74, L162) that the archive was "read, not built". This copy type-checks and its tests pass.

[I] The memo was probably written against an earlier or partial extract of the archive. Whoever made the memo
should confirm which snapshot it describes.

---

## 11. Index of inferences (things to verify by running)

1. Page-run assistant code can POST `/api/jobs` with `proposedBy: 'user', approve: true` and bypass approval
   (§4.7).
2. Timed-out or cancelled assistant code keeps running after the rollback (§4.7).
3. `Object.defineProperty` and nested Value mutation bypass `sealObserved` (§3.3).
4. `memory-within-20` reports `refuted` rather than `open` when a pool value is missing (§3.5).
5. A negated predicate such as `!(x > 1)` reports `supported` over missing data (§3.5).
6. A supporting run without a `validity` field makes a hypothesis `unqualified` (§3.5).
7. A median of Values computed in user code keeps prov `observed` for odd-length inputs (§7.2).
8. Binding inference by dry run can miss a parameter read on only one branch (§2.9).
9. A bootstrap over two process ratios gives a degenerate CI (§3.4).
10. Modes without a bespoke generator fall back to the generic collector shape (§7.3).
11. A program can use `fetch` and `window`, since it is evaluated in the page realm (§2.1).
12. The exact lint behaviour for unvalidated `detections`/`gallery` methods (§5.4).

## 12. Pointers for the guide writer

- **Teach the language in this order:** builders (§2.3), then phases (§2.8), then binding (§2.9), then evidence
  (§3). The `parameters` and `dino-pr1005` presets are the two best worked examples.
- **The cleanest seam for Kiln is `src/lang/`.** It has no React or Redux imports except type-level ones,
  carries most of the tests, and is already shared with the server (`detections.ts`; `reference.ts` via the
  prompt).
- **Before reuse, move or harden:**
  - verdicts (`HypothesisView.evaluateHypothesis` → `lang/`)
  - the job-approval boundary (server-side)
  - the assistant sandbox
- **The visual language** (sheet, title block, glyphs, hatch for missing, dashed stamps) is coherent and
  documented in `tokens.css` and the atoms. It is a good base for a shared Kiln design system, provided §3.7 #7
  and §9 #30 are fixed, so that "illustrative" is shown wherever it applies.
