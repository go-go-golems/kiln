---
Title: 'Inventory notes A: compiler, runtime launchers and CUDA runner'
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
Summary: 'Component inventory of the Kiln compiler (@kiln/kiln core and std), the imported original source, the kiln-program/1 launchers (runtime/), the CUDA runner and driver (runner/) and the export/test scripts: public APIs, file formats, the IR pipeline with a worked example, duplicated concepts with file:line evidence, complexity hotspots, reuse candidates and vestigial code.'
LastUpdated: 2026-10-21T11:10:00-04:00
WhatFor: 'Source material for the KILN-004 intern guide sections on the compiler, the launchers and the CUDA runner; the evidence behind every duplication and reuse claim made about those areas.'
WhenToUse: 'Before moving, repackaging or deduplicating anything under packages/kiln, runtime/, runner/ or scripts/kiln-export.mjs, or when a claim in the guide about those areas needs its file:line evidence.'
---

# Inventory notes A: compiler, runtime launchers and CUDA runner

## Goal

An inventory, not a review, of the compiler and execution-runtime side of the kiln repository
(`/Volumes/SSD/code/kiln`, branch `main`, commit `f8bc5d4` at the time of writing; the code under inventory is
unchanged since `4d9adc2`). For each component: purpose, public API, file formats, dependencies and consumers, size
and tests. Then the cross-cutting results the guide needs: the IR pipeline with a worked example, every duplicated
concept with file:line evidence, complexity hotspots and module-level globals, reuse and packaging candidates with
the coupling that would have to be cut, and vestigial code.

Evidence labels used throughout:

- **Observed**: read in the source, or printed by a command that was run (commands are in diary A).
- **Inferred**: a consequence reasoned from observed code but not executed.

## Context

Areas covered (the orchestrator's split, area A):

1. `packages/kiln/` (`@kiln/kiln`, `src/core` and `src/std`, `test/`)
2. `imports/kiln-workbench-src/` compared to `packages/kiln` and `apps/workbench`
3. `runtime/` (README, `webgpu/launch.ts`, `python/kiln_launch.py`, `test/`)
4. `runner/` (`kiln_runner.py`, `kiln_driver.py`, `runner/docker` kiln-perf image)
5. `scripts/kiln-export.mjs`, `scripts/run-node-tests.mjs`

Not covered here: `apps/workbench` UI (area B), `apps/server`, `packages/exec`, `packages/evidence` (area C),
`lab-workbench/`, `packages/lab` (area D). Where an area-A component is consumed from those, the consumer is named
with a path only.

## Quick Reference

### Size table (observed, `wc -l` on tracked files)

| Component                                     | Lines | Notes                                                         |
| --------------------------------------------- | ----- | ------------------------------------------------------------- |
| `packages/kiln/src/core/kiln.js`              | 1152  | 70.7 KB; IR, rewrite engine, forks, decisions, pipeline, Run  |
| `packages/kiln/src/core/ix.js`                | 241   | Integer index expressions (affine algebra)                    |
| `packages/kiln/src/core/util.js`              | 76    | Hash, rng, Tensor, formatting                                 |
| `packages/kiln/src/core/script.js`            | 39    | Run a user script with acorn + `new Function`                 |
| `packages/kiln/src/std/tile.js`               | 364   | Schedules, knobs, cost model                                  |
| `packages/kiln/src/std/loop.js`               | 359   | Loop IR, fusion, LICM scheduling, JS reference compiler       |
| `packages/kiln/src/std/kernel.js`             | 318   | Kernel IR (statements), materialisation                       |
| `packages/kiln/src/std/devices.js`            | 308   | SimDevice, WebGpuDevice, measurement protocol                 |
| `packages/kiln/src/std/tensor.js`             | 306   | `nn`/`tensor` dialects, decompositions, frontend optimisation |
| `packages/kiln/src/std/emit.js`               | 254   | CUDA, WGSL and SIMT-simulator emitters                        |
| `packages/kiln/src/std/records.js`            | 208   | kiln-measure/1 records                                        |
| `packages/kiln/src/std/tune.js`               | 178   | Measurement loops, SP-MCTS and sweep tuners                   |
| `packages/kiln/src/std/store.js`              | 174   | kiln-evidence/2 EvidenceStore                                 |
| `packages/kiln/src/std/evidence-context.js`   | 168   | Hypotheses evaluated against evidence                         |
| `packages/kiln/src/std/program.js`            | 135   | `gpu` dialect, programOf, inputs, simulation                  |
| `packages/kiln/src/std/index.js`              | 77    | `std` namespace, `Project`, script scope                      |
| `packages/kiln/src/std/export.js`             | 75    | kiln-program/1 export                                         |
| `packages/kiln/src/std/fns.js`                | 48    | Scalar function table (js/c/wgsl templates)                   |
| `packages/kiln/src/std/emmy.js`               | 37    | The default pipeline ("emmy") and decision policy             |
| `packages/kiln/src/std/targets.js`            | 19    | GPU spec table                                                |
| `packages/kiln/test/*.mjs` (13 files)         | 855   | Node scripts run by `scripts/run-node-tests.mjs`              |
| `runtime/python/kiln_launch.py`               | 474   | kiln-program/1 launcher, wgpu-py and CUDA (ctypes)            |
| `runtime/python/test_kiln_launch.py`          | 172   | unittest with a fake CUDA driver                              |
| `runtime/webgpu/launch.ts`                    | 160   | kiln-program/1 launcher, browser WebGPU                       |
| `runtime/test/fixtures.mjs`                   | 78    | Builds fixture programs + expected outputs                    |
| `runtime/test/webgpu-roundtrip.mjs`           | 66    | Runs launch.ts in headless Chrome                             |
| `runtime/README.md`                           | 67    |                                                               |
| `runner/kiln_driver.py`                       | 1044  | HTTP job executor (kiln-driver/1), Docker, GPU locks          |
| `runner/kiln_runner.py`                       | 281   | nvcc harness, kiln-bundle/1 → kiln-results/1                  |
| `runner/docker/kiln-probe.cu` + `kiln-probe`  | 194 + 102 | Measures a GPU spec in the `SPECS` shape                  |
| `runner/docker/{Dockerfile,build.sh,kiln-selftest,README.md}` | 49 + 62 + 6 + 84 | kiln-perf image                  |
| `runner/docker/perf-lab-cpu/Dockerfile`       | 21    | CPU torch image                                               |
| `scripts/kiln-export.mjs`                     | 87    | CLI: preset/script → kiln-program/1 or kiln-program-set/1     |
| `scripts/run-node-tests.mjs`                  | 34    | Runs each `<dir>/*.mjs`                                       |

### File formats owned or consumed by area A

| Format                | Produced by                                       | Consumed by                                                          |
| --------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `kiln-program/1`      | `std/export.js` `exportProgram`                   | `runtime/webgpu/launch.ts`, `runtime/python/kiln_launch.py`          |
| `kiln-program-set/1`  | `scripts/kiln-export.mjs` (comma-list `--param`)  | humans / tooling (no in-repo reader found)                           |
| `kiln-measure/1`      | `std/records.js` `makeRecord`                     | `std/store.js`, `@kiln/evidence`, `apps/server`                      |
| `kiln-evidence/2`     | `std/store.js` `EvidenceStore.toJSON`             | `EvidenceStore.import`, workbench                                    |
| `kiln-evidence/1`     | legacy (the imported original)                    | `std/records.js` `legacyRecord` (import path only)                   |
| `kiln-bundle/1`       | `packages/exec/src/kinds/kiln-kernels.ts` `lower` | `runner/kiln_runner.py run`                                          |
| `kiln-results/1`      | `runner/kiln_runner.py run`                       | `packages/exec` / `apps/server`                                      |
| `kiln-driver/1` (API) | `runner/kiln_driver.py`                           | `apps/server` (executor client; area C)                              |
| `kiln-plan/1`         | `apps/server` / `packages/exec` (area C)          | `kiln_driver.py` `POST /v1/jobs`                                     |
| `kiln-probe-request/1` → `kiln-facts/1` | server                          | `kiln_driver.py` `POST /v1/probe`                                    |
| `kiln-execution/1`    | `kiln_driver.py` (written into the job directory) | archive consumers (area C)                                           |
| codegen tag `kiln-codegen/2`, app tag `kiln-workbench/0.1` | `std/records.js` | stamped into every record                                     |

## 1. packages/kiln (`@kiln/kiln`)

### 1.1 Package shape (observed)

- `package.json`: `exports` maps `./core/*` and `./std/*` to the source files; there is **no** root entry or index
  barrel. Dependencies: `acorn` 8.19.0, `@kiln/evidence` (workspace; its `exports` point at TypeScript source
  `./src/index.ts`, so any consumer of `@kiln/kiln` std modules that touch evidence needs a TS-stripping runtime,
  Node 26's native type stripping in practice). `test` = `node ../../scripts/run-node-tests.mjs test`.
- Plain ES modules, JavaScript, no build step, no types (JSDoc only in places).
- Two-layer split by directory: `core/` (generic IR and rewriting) and `std/` (the GPU compiler built on it). The
  split leaks in one direction: `core/script.js:4` imports `../std/index.js` (core depends on std).

### 1.2 `core/kiln.js` (1152 lines): IR, rewriting, forks, decisions, pipelines

Section map (observed, line ranges):

| Lines     | Contents                                                                                       |
| --------- | ---------------------------------------------------------------------------------------------- |
| 9-17      | `tensor(shape, dtype="f32")`, `scalar`, `typeStr`, type markers `T` (number,int,string,bool,any,fn,...), `KilnError(kind, message, extra)`, `Skip(reason,{reject})`, `skip()` |
| 20-22     | **global** `SCOPES` stack (current build scope)                                                |
| 25-40     | **global** `METHODS` map (method name → `[{dialect, fn}]`) and the Proxy `HANDLER` that gives `Value`s dialect methods (`x.exp()`) |
| 43-74     | `OpTemplate`, `OpDef` (name, attrs schema, type inference, print template, traits, eval)       |
| 76-100    | `Dialect` (`.op(name, spec)`, `.get`, `.methods`), **global** `DIALECTS` map, `dialect(name)` registers |
| 103-104   | built-in `kiln` dialect with `kiln.input`                                                     |
| 107-192   | `Node` (frozen), **global** `GID` counter (112), `Graph`: `clone, addNode, replaceUses, users, topo, dce, find, findAll, key, print, eval` |
| ~195-228  | `inferType`, `attrKey`/`nodeKey` structural hashing                                           |
| 230-281   | printing (graph and nodes)                                                                     |
| 284-304   | `evalGraph` (reference evaluation through `OpDef.eval`)                                        |
| 307-347   | `Value` handle and `wrap(g, id)` Proxy                                                         |
| 349       | `InPlace` (in-place replacement result)                                                        |
| 352-385   | `GraphScope`, `Builder`, `graph(name, fn, opts)`, `trace(name, fn, inputs, opts)`, `lift(v)`   |
| 388-458   | Patterns: `PatNode`, `PVar`, `Pat`, `P` = `{op, oneOf, trait, any, const, var, chain}`         |
| 461-511   | `Param`, `param` (int/float/choice/bool builders), `ParamSet`, `params(src)`, `knobs.canonical/parse` |
| 513-557   | `Fork`, `fork(options, meta)`, `fork.over`, `toggle`, `tree`, `expandFork` (cap 20000 options)  |
| 560-618   | `decide` policies: `first, pinned, random, cost, chain, exactly, evidence, strict`             |
| 621-671   | **global** `RID` (621), `Rule` (`from()`/`to()`/`when()`/guards), `rule(name)`                 |
| 674-689   | `Pass` (modes `fixpoint`, `once`, `ordered-once`; `maxSteps` 4000), `pass(name)`               |
| 692-749   | `PipelineBuilder` / `Pipeline` (`with, replace, insertAfter, insertBefore, without, insertRule, replaceRule, removeRule, describe, run, allParams`) |
| 752-758   | `Strategy`, `strategy(name)`                                                                   |
| 761-1094  | `Run` (the execution engine; see 1.2.1)                                                        |
| 1095      | `identityOf(g, id)`                                                                            |
| ~1100-1133| `wholeBuilder`, `txFor`, `parsePassFilter`                                                     |
| 1134      | `unifiedDiff(a, b)` (LCS, O(n·m))                                                              |
| 1148      | `k` namespace object re-exporting the public surface                                           |

Public API (observed, the `k` namespace and named exports): `tensor, scalar, typeStr, T, KilnError, Skip, skip,
OpTemplate, OpDef, Dialect, DIALECTS, dialect, Kiln, Node, Graph, Value, wrap, InPlace, Builder, graph, trace, lift,
Pat, P, Param, param, ParamSet, params, knobs, Fork, fork, decide, Rule, rule, Pass, pass, PipelineBuilder,
pipeline, Pipeline, Strategy, strategy, Run, identityOf, unifiedDiff, k`.

Rule authoring (observed): `rule(name).from(lambda).to(lambda)`; `Rule.from()`/`to()` read the lambda's
**parameter names from its source text** with a regex (`paramNames`, kiln.js:665). Inferred: minified or
transpiled rule sources would break pattern variable binding.

#### 1.2.1 `Run` (761-1094): the hotspot

`pipeline.run(graph, opts)` constructs `new Run(pipe, g, opts)` and calls `go()`. Methods (observed lines):
`constructor 762, now 773, emit 774, strategy 780, paramValue 781, at 786 (checkpoint by IR name), stepGraph 788,
diff 804, go 807, checkIr 838, runPass 850, nearLastStep 889, runWhole 900, isDeclined 916, decline 917,
tryRule 918, applyResult 958, validate 984, applyFork 995, runGuards 1052, finish 1059, recordStep 1068,
skipStep 1089`.

Responsibilities folded into this one class (observed):

- pass scheduling (fixpoint with incremental resume from the last rewritten node, once, ordered-once, whole-graph
  passes), with a 4000-step cap;
- strict IR checking at each IR boundary (`checkIr`: only the dialects the IR declares may remain);
- rule matching, guard evaluation, decline memo (`WeakSet` per rule);
- fork expansion and decision recording (`applyFork`: pins, blocked options, policy chain, decision records with
  `{rule, node, key, by, knobs, size, note}`);
- step journaling (`recordStep`: per-step delta plus a full graph snapshot every 48 rewrites, used by
  `stepGraph(i)` and `diff(i)`);
- event emission for the UI (`emit`), timing, parameter resolution and strategies.

Run result surface used by consumers (observed in probes and workbench imports): `ok`, `error`, `graph`, `irOrder`,
`at(irName)`, `steps[]` (`kind`, `short`, `rule`, `node`), `decisions[]`, `stepGraph(i)`, `diff(i)`.

### 1.3 `core/ix.js` (241 lines): index expressions

Immutable, self-simplifying integer expressions used for every address and loop bound downstream of the loop IR.
API (observed): class `Ix`; constructors `C(n)` (constant), `V(name)` (variable), `lift`; linear normal form; `ix`
(builder), `keyOf`, `vars(e)`, `subst(e, map)`, `evalIx(e, env)`, `affine(e)`, `print(e)`, `emit(e, lang, nameOf)`
(lang `js`/`c`/`wgsl`), `toJs`; index maps `IxMap`, `coordVars`, `map`, `compose`, `identity`.

Dependencies: none. Consumers: `std/loop.js`, `std/tile.js`, `std/kernel.js`, `std/emit.js`
(`IX.emit(e, "js", iname)` at emit.js:108), `std/tensor.js` (views).

### 1.4 `core/util.js` (76 lines)

`hash(s)` (cyrb53, base-36 string), `clip`, `summarize`, `fmtUs/fmtNum/fmtBytes/fmtMs`, `rng(seed)` (mulberry32 plus
Box-Muller `normal`, util.js:39), `numel(shape)`, `inKey(shape, dtype)`, `dtypeBytes(dtype)`, `strides(shape)`,
`Tensor` (`fill`, `random`, `at`, `preview`), `compare(a, b)`, `median`, `dur`. No dependencies.

### 1.5 `core/script.js` (39 lines)

`headerOf(text)`, `lineOf(err)`, `runScript(text, extra)`: parses the user's script with acorn (for error locations
and headers), then evaluates it with `new Function` over a scope from `std/index.js` `makeScriptScope`. Observed:
script.js:4 imports `../std/index.js`, the only core→std edge. Inferred: no sandboxing; the workbench runs this on
the main thread or in its agent worker (area B).

### 1.6 `std/` modules

#### `std/index.js` (77 lines)

- `std` namespace (index.js:19-31) bundling the std modules.
- `class Project` (35-73): the object a preset script builds: `pipeline, program, data, check, params, pins, device,
  about, note, hypothesis, usesGpu, graph, inputsFor`.
- `makeScriptScope(sink)` → `{k, P, std, N, T, nn, tensor, Tensor, ix, project, param, E, KB, kx}`: the names a
  preset script can use without importing.

#### `std/emmy.js` (37 lines): the default pipeline

- `IRS` (IR names in order), `defaultDecide(store)` = `decide.chain(decide.pinned, decide.evidence(store), costPrior,
  decide.first)`, `pipeline({target = rtx5090, store, name = "emmy"})`, `passes`, `dialects`.
- `pipeline().describe()` (observed output, abridged):

```text
pipeline emmy
  ir torch        [nn, tensor]
  d  frontend/decomposition   decompose:nn.ew, decompose:nn.linear, ... decompose:nn.softmax, ...
  ir tensor       [tensor] strict
  o  frontend/optimization    compose_views, fold_splat_view, drop_identity_view, fold_splat_ew, contract_fma
  l  loop/lowering            lift_elementwise, lift_reduce, lift_indexmap, lift_constant_output
  f  loop/fusion              merge_loop_ops
  s  loop/stamp               stamp_loop_names
  ir loop         [loop, tensor] strict
  t  tile/schedule            schedule
  ir tile         [tile, tensor] strict
  k  lowering/kernel          materialize, drop_redundant_syncs
  ir kernel       [kernel, tensor] strict
  c  lowering/emit            emit_sources
  ir gpu          [gpu, tensor] strict
```

#### `std/targets.js` (19 lines)

`SPECS` = `{rtx5090, rtx4090, h100, a100, gb10, orin}` (each: SM count, clocks, bandwidth, smem, regs, limits);
`gb10` is commented as measured with `kiln-probe` on 2026-10-20 (targets.js:10-14); `WEBGPU_DEFAULT` (18);
`target(spec)` adds `warp: 32`.

#### `std/fns.js` (48 lines)

`FNS` table: per scalar function `{js, c, w, flops}` templates (`w` = WGSL); `REDUCERS` (add/max/min/mul with
identities); helpers `fn`, `reducer`, `fill`, `fr`. `tanh` is clamped, `floor` exists (both differ from the
imported original). Consumers: `loop.js`, `emit.js` (CUDA, WGSL, simulator), `tensor.js` (reference evaluation).

#### `std/tensor.js` (306 lines): frontend dialects

- Reference evaluators `ewRef`, `reduceRef`, `viewRef` (compiles view index functions with `new Function` and
  caches them in a module-level `VIEW_FNS` map, tensor.js:83-101), `matmulRef`, `linearRef`, `rms`, `ln`, `softmax`.
- Dialect `nn` (high level, "torch" IR): `ew, linear, matmul, rms_norm, layer_norm, softmax, gelu, silu, reduce,
  transpose, reshape, slice`. Dialect `tensor` (low level): `const, ew, reduce, view` (tensor.js:137-160).
- `weight()`, `T` and `N` builder helpers (`N.softmax(x, -1)`, `N.floor`, `N.add`, ...), `nn.methods`,
  `tensor.methods`.
- `decompose()`, `decompositions`, pass `d` (decomposition); pass `o` (optimisation: `compose_views`,
  `fold_splat_view`, `drop_identity_view`, `fold_splat_ew`, `contract_fma`).

#### `std/loop.js` (359 lines): loop IR

- Hash-consed scalar expressions: module-level `INTERN` table (capped at 400 000 entries), `FREE` `WeakMap`, `RV`
  counter / `freshR`. `E` builders (`num`, `load`, `op`, `red`), `substE`, `walkE`, `printE`.
- `schedule()` (statement placement with loop-invariant code motion), `printNest`, `workOf`.
- `compileSerial` / `compilePoint` (JS reference implementations through `new Function`), `runSerial`.
- Dialect `loop` with op `loop.kernel`; **its identity function omits dtype** (loop.js:277, see §6.1).
- Passes: `l` (lift: `lift_elementwise`, `lift_reduce`, `lift_indexmap`, `lift_constant_output`), `f` (fusion:
  `merge_loop_ops` with a blow-up guard, applied in reverse topological order), `s` (`stamp_loop_names`).

#### `std/tile.js` (364 lines): schedules and the cost model

- Knobs `MAP, TPB, COARSEN, STAGE, BM, BN, BK, TM, TN` (`KNOBS`), `canonRow(knobs)` (the canonical row string, e.g.
  `MAP=row,TPB=128`).
- `analyze(kernel)` (rows, staging, contraction detection), `legalMaps`, `forkTree` (the schedule fork),
  `launch`, `stagedOf`, `regsEstimate`.
- **`timeModel` (tile.js:152-194)**: roofline plus occupancy and wave quantisation; `estimate` (analytic counts
  including shared-memory bank conflicts).
- `printTile`, dialect `tile` with `tile.kernel` (identity at tile.js:346, includes `inKey(shape, dtype)`),
  `scheduleRule`, `costPrior` (= `decide.cost("model", ...)` for the `schedule` fork), `tilePass` (`t`).

#### `std/kernel.js` (318 lines): kernel IR

- `kx` (index helpers) and `KB` (kernel builder). Statement kinds: `let, iset, load, store, sload, sstore, sync, for,
  if, note`.
- Materialisation strategies `matThread`, `matRow` (shared-memory tree combine), `matTiled`; `materialize`;
  `printKernelBody`; dialect `kernel` with `kernel.kernel` (identity kernel.js:294); `materializeRule`,
  `dropRedundantSyncs`, `kernelPass` (`k`).

#### `std/program.js` (135 lines)

- Dialect `gpu` with `gpu.kernel` (identity program.js:19), `emitRule` / `emitPass` (`c`).
- `programOf(g)` → `{kernels, graph}` where each kernel is
  `{id, name, K, cuda, wgsl, expr, shape, inShapes, inDtypes, args, map, row, identity, bytes}` (identity recomputed
  at program.js:38).
- `seedOf(kern, seed, j)` (program.js:48: seeded by identity, not name), `kernelInputs` (mulberry32; f32 inputs
  `r*2-1`, u8 inputs `floor(r*256)`), `referenceAt`, `sampleIndices`, `sampleBlocks`, `simulateKernel` (SIMT
  simulation with a module-level `SIMS` `WeakMap` cache), `regsOf`, `metricsOf`, `simulateFull`.
- `checkValues` from the original was removed; checks now use `checkSamples` from `@kiln/evidence`.

#### `std/emit.js` (254 lines): three emitters

- `toCuda(K)`: `extern "C" __global__ void __launch_bounds__(block) <cname>(const T* __restrict__ src0, ..., float*
  __restrict__ dst)`; `cname` at emit.js:5.
- `toWgsl(K)`: grids above 65535 folded into 2-D (`wid.x + wid.y * nwg.x`), u8 inputs bound as packed `u32` arrays
  with an `ldN` unpack function.
- `toSim(K, {instrument})` (emit.js:95-210): lockstep SIMT simulator generated as JS source and compiled with `new
  Function("FN", src)`. Each per-thread statement becomes its own small function (comment at emit.js:112-114: V8
  optimises small functions quickly and deopts stay local). Masks per nesting depth, uniform-loop detection,
  instrumented mode counts active warps/lanes, out-of-bounds accesses, divergence and syncs into `SimMetrics`.

#### `std/devices.js` (308 lines)

- `SimDevice` (runs the simulator), `runProtocol` (seeded per-rep order using `repetitionOrder` from
  `@kiln/evidence`), `timerQuantum`, `deadline`, `CONTEXT_TIMEOUT_MS = 60000`.
- `WebGpuDevice`: `probe`, a fresh `GPUDevice` per repetition, `measureKernels`, `runKernel`; default protocol
  `{reps: 7, warmup: 3, launches: 20, seed: 1}` (devices.js:203); WebGPU execution in `runOnce` (devices.js:125-197).
- `sessionToken()` (reads `<meta name="kiln-token">`), `cudaTarget(info, name)` (compute capability → `SPECS`,
  fallback `rtx5090`, devices.js:301), `makeDevices()`.
- Removed relative to the original: `CudaDevice`, `bundle`, `ingest` (live fetch to `kiln_runner /api/device` and
  `/api/run`). CUDA now runs through Kiln server hosts (`apps/workbench/src/server-sync.js` `HostDevice`, area B/C).

#### `std/records.js` (208 lines): kiln-measure/1

Constants: `CODEGEN_VERSION = "kiln-codegen/2"`, `APP = "kiln-workbench/0.1"`, `INPUT_SEED = 1`.
Functions: `langOf`, `sourceOf(kern, lang)`, `specHash`, `contentOf` (memoised content id: sha256 of the source
with the entry symbol canonicalised to `kernel`, records.js:39-51), `symbolOf` (records.js:63), `flatKnobs`
(records.js:68), `launchOf`, `activationOf(kern, {run})` (did a schedule fork decide this kernel), `recordContext`,
`makeRecord(...)`, `legacyRecord(row)` (kiln-evidence/1 rows → kiln-measure/1, records.js:~190-208).

`kiln-measure/1` record fields (observed in `makeRecord`):

```text
format: "kiln-measure/1"
at, by
device:     { id, class, name, fingerprint }
kernel:     { name, identity, row, knobs, contentId, lang, sourceSha256, launch: { grid, block, smem } }
timing:     { kind, unit: "us", samples[], launches?, warmup?, raw? }
check:      { ok, sampled, maxAbsErr?, detail? }
activation: { requested, materialized, ok, notes[] }
validity:   { ok, reasons[], partial }
protocol:   { reps, seed, order?, position?, pairId? }
manifest:   { codegen, app, userAgent?, runner? }
counts?, countsProv?, context?
id
```

#### `std/store.js` (174 lines)

`EVIDENCE_FORMAT = "kiln-evidence/2"`; `class EvidenceStore` with `add, record, observe, rowOf, currentContentId,
isStale, isDecisive, status, statsFor, optionStats, list, best, forget, clear, on, emit, toJSON, slice, fromSlice,
import`; `Store` is an alias. Used by `decide.evidence(store)` (via `optionStats`) and the workbench.

#### `std/export.js` (75 lines): kiln-program/1

`PROGRAM_FORMAT = "kiln-program/1"`, `exportedName(kern)` = `${cname(K.name)}__${identity}` (export.js:17),
`renameCuda(src, from, to)` (regex, throws `ExportError` when the entry is missing, export.js:19-22),
`exportProgram(run, prog, {name, params, target, source})`.

`kiln-program/1` schema (observed in `exportProgram` and `runtime/README.md`):

```text
format: "kiln-program/1"
name, codegen, target, params, source
inputs:  [{ name, buffer, shape, dtype }]
outputs: [{ name, buffer, shape, dtype }]
buffers: [{ id, dtype, elements, bytes, name?, data? (base64 constant) }]
kernels: [{ name, identity, row, reads[], writes[], grid, block, smemBytes,
            dispatch, shape, inShapes, inDtypes, wgsl, cuda }]
```

#### `std/tune.js` (178 lines)

`replay` policy, `measureProgram`, `kernelPinPolicy`, `measurePaired` (A/B pairs with a `pairId`), `tune(...)` with
strategies `"spmcts"` (single-player Monte Carlo tree search over forks) and `"sweep"`.

#### `std/evidence-context.js` (168 lines)

`evidenceContext({store, prog, device, target})` → `{ev, support}`; `evaluateHypotheses`; `Hypothesis` builder
(`claim, predicts, alternatives, scope`).

### 1.7 Tests (observed)

`packages/kiln/test`: `core.mjs` (core only), `stack1.mjs`, `stack2.mjs`, `stack3.mjs`, `progs.mjs`, `tune.mjs`,
`evidence.mjs`, `export.mjs`, `hypotheses.mjs`, `paired.mjs`, `protocol.mjs`, `targets.mjs`, `u8.mjs`; 855 lines.
Std modules are covered end to end through the stack and program tests, not per module. Baseline (diary of the
ticket, step 2): 13 suites pass under `pnpm test`.

### 1.8 Consumers (observed)

- `apps/workbench/src/**` (agent, compile.js, main.jsx, server-client.js, server-sync.js, ui): many deep imports of
  `@kiln/kiln/core/*` and `@kiln/kiln/std/*`.
- `apps/server`: only `test/decide.test.ts`.
- `scripts/kiln-export.mjs` and `runtime/test/fixtures.mjs`: import by **relative path** (`../packages/kiln/src/...`)
  and both also import `apps/workbench/src/compile.js` (`compileScript`, `endToEnd`), i.e. scripts and the runtime
  tests depend on the app.

## 2. IR pipeline: stages, data structures and a worked example

### 2.1 Stages (observed)

| IR       | Dialects allowed     | Node payload (data structure)                                                          | Produced by pass         |
| -------- | -------------------- | -------------------------------------------------------------------------------------- | ------------------------ |
| `torch`  | `nn`, `tensor`       | `Graph` of `Node{op, args, attrs, type}` with `nn.*` ops; types `{kind:"tensor", shape, dtype}` | `k.trace` / user script |
| `tensor` | `tensor` (strict)    | `tensor.ew/reduce/view/const` nodes; views carry an `IxMap`                           | `d` decompose, `o` optimise |
| `loop`   | `loop`, `tensor`     | `loop.kernel` nodes whose attrs hold a hash-consed expression tree (`E`) plus a scheduled loop nest | `l` lift, `f` fuse, `s` stamp |
| `tile`   | `tile`, `tensor`     | `tile.kernel` with a knob map (`MAP, TPB, ...`), launch `{grid, block, smem}`, Tile/StridedLoop/Combine body | `t` schedule (a fork)   |
| `kernel` | `kernel`, `tensor`   | `kernel.kernel` with Kernel IR statements (`let/iset/load/store/sload/sstore/sync/for/if/note`), flat `Ix` addresses, smem arrays | `k` materialise    |
| `gpu`    | `gpu`, `tensor`      | `gpu.kernel` with `{cuda, wgsl}` source strings next to the Kernel IR                  | `c` emit                 |
| program  | (not an IR)          | `programOf(g)` → `{kernels[], graph}`                                                  | function call            |
| export   | (file)               | `kiln-program/1` JSON                                                                  | `exportProgram`          |

Every step is journaled in `run.steps`; every fork decision in `run.decisions`; each IR boundary is a checkpoint
(`run.at("loop")`).

### 2.2 Worked example: softmax over `x: (4, 64) f32`, target `rtx4090` (observed)

Command: a scratch probe (`ir.mjs`, see diary A) running
`pipeline({target: target(SPECS.rtx4090)}).run(k.trace("softmax", ({x}) => ({y: N.softmax(x, -1)}), {x: k.tensor([4, 64])}))`.

torch IR:

```text
n0 = softmax(x, dim=-1)  -> (4, 64) f32
```

tensor IR (after `d`):

```text
n1 = max(x, axis=1)   -> (4, 1) f32
n2 = n1[a0, 0]        -> (4, 64) f32
n3 = sub(x, n2)       -> (4, 64) f32
n4 = exp(n3)          -> (4, 64) f32
n5 = add(n4, axis=1)  -> (4, 1) f32
n6 = n5[a0, 0]        -> (4, 64) f32
n7 = div(n4, n6)      -> (4, 64) f32
```

loop IR (after `l`, `f`, `s`; one fused kernel, LICM put the two reductions before the write sweep):

```text
n14 = loop.kernel k_softmax_reduce(x)  -> (4, 64) f32
    for a0 in 0..4:  # free
        acc0 = -inf
        for r0 in 0..64:  # reduce
            in1 = load x[a0, r0]
            acc0 <- max(acc0, in1)
        acc1 = 0
        for r1 in 0..64:  # reduce
            in2 = load x[a0, r1]; v2 = sub(in2, acc0); v3 = exp(v2)
            acc1 <- add(acc1, v3)
        for a1 in 0..64:  # free
            in0 = load x[a0, a1]; v0 = sub(in0, acc0); v1 = exp(v0); v4 = div(v1, acc1)
            out[a0, a1] = v4
```

tile IR (after `t`; the schedule fork had 21 options and the cost model picked one):

```text
n14 = tile.kernel k_softmax_reduce(x)  [MAP=row,TPB=128]  ⟨MAP=row,TPB=128,COARSEN=1,STAGE=none,BM=0,BN=0,BK=0,TM=1,TN=1⟩
    launch grid=4 block=128 smem=512 B
    Tile(axes=(a0:4=BLOCK, lane:128=THREAD)):
        acc0 = init(max)
        StridedLoop(r0 = lane; < 64; += 128): ...
        Combine(acc0, op=max)
        ...
```

kernel IR (after `k`): `Smem s_red[128] (float)`, strided loads at flat addresses `x[64 * bid + r0]`, then a
shared-memory tree combine (`if tid < 64 ... Sync ... if tid < 1`), twice, then the write sweep.

gpu IR (after `c`), CUDA head:

```cuda
extern "C" __global__ void __launch_bounds__(128) k_softmax_reduce(const float* __restrict__ src0, float* __restrict__ dst) {
    const int tid = threadIdx.x;
    const int bid = blockIdx.x;
    __shared__ float s_red[128];
    ...
    for (int r0 = tid; r0 < 64; r0 += 128) {
        in1 = src0[((64 * bid) + r0)];
        acc0 = fmaxf(acc0, in1);
    }
```

WGSL head: `var<workgroup> s_red: array<f32, 128>; @compute @workgroup_size(128) fn main(...) { let bid: i32 =
i32(wid.x) + i32(wid.y) * i32(nwg.x); if (bid >= 4i) { return; } ...`.

Journal (observed `run.steps`): `decompose:nn.softmax@n0`; seven `lift_*` rewrites `@n1..n7`; six `merge_loop_ops`
`@n13..n8` (reverse order); `stamp_loop_names@n14`; `schedule@n14`; `materialize@n14`; `emit_sources@n14`.
Decisions: `schedule n14 model {MAP:row, TPB:128, COARSEN:1, STAGE:none, BM:0, BN:0, BK:0, TM:1, TN:1} of 21`.
`programOf` row/identity: `MAP=row,TPB=128 tw9114dnid`.

Observed side note (inventory, not a judgement on the model): for a 64-wide row the chosen `TPB=128` leaves half the
block idle in every strided loop (`r0 = tid; r0 < 64; r0 += 128`).

## 3. imports/kiln-workbench-src: what moved, changed, duplicated (observed by diff)

`imports/` holds the original Kiln Workbench as received (source tree and a zip) plus built artefacts
(`app/dist`, `runner/kiln-workbench.html`). Nothing in live code imports from `imports/` (grep over tracked
sources). It is a frozen snapshot and therefore a full duplicate of the code it was split from.

| Original (imports/kiln-workbench-src/...) | Now                                    | Status                                                                 |
| ----------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| `app/src/core/ix.js`, `script.js`         | `packages/kiln/src/core/`              | identical                                                              |
| `app/src/core/kiln.js`                    | `packages/kiln/src/core/kiln.js`       | 52 diff lines: `decide.pinned` supports partial pins and `fp.pinned`; `decide.evidence` rewritten to `optionStats` with `minReps` and separated intervals |
| `app/src/core/util.js`                    | same                                   | `inKey`, `dtypeBytes` added                                            |
| `app/src/std/emmy.js`, `loop.js`          | `packages/kiln/src/std/`               | identical                                                              |
| `app/src/std/emit.js`                     | same                                   | u8 input support                                                       |
| `app/src/std/fns.js`                      | same                                   | `tanh` clamp, `floor`                                                  |
| `app/src/std/kernel.js`, `tile.js`, `program.js` | same                            | `inDtypes`, `inKey` in identity; `checkValues` removed (now `checkSamples` from `@kiln/evidence`); `seedOf` uses identity |
| `app/src/std/targets.js`                  | same                                   | `gb10` added                                                           |
| `app/src/std/tensor.js`                   | same                                   | `floor`                                                                |
| `app/src/std/index.js`                    | same                                   | hypotheses/evidence added to the scope                                 |
| `app/src/std/devices.js`, `store.js`, `tune.js` | same                             | heavily rewritten (protocol, evidence/2, paired measurement; CUDA device removed) |
| (none)                                    | `std/records.js`, `export.js`, `evidence-context.js` | new                                                      |
| `app/src/ui`, `agent`, `main.jsx`         | `apps/workbench/src/`                  | moved; plus new `agent/{encode,frame,gateway,inspect,sandbox,worker-main}`, `compile.js`, `server-client.js`, `server-sync.js`, `ui/lab/*`, Evidence/Hypotheses/Jobs/marks views, split CSS |
| `docs.gen.js`, `presets.gen.js`           | generated, gitignored (`*.gen.js`)     | were committed in the original                                         |
| `presets/`                                | `apps/workbench/presets/`              | W-05, W-19, W-24 (md), W-25 changed; W-26, W-28 new                    |
| `app/test/{core,progs,stack1-3,tune}.mjs` | `packages/kiln/test/`                  | identical                                                              |
| `app/test/{cuda_check.py, param-sweep, presets}` | `apps/workbench/test/`          | identical                                                              |
| `app/test/{export-cuda, notes, ui}`       | `apps/workbench/test/`                 | minor diffs                                                            |
| `runner/kiln_runner.py` (361 lines)       | `runner/kiln_runner.py` (281)          | `serve` HTTP mode and `NCU_METRICS` removed (ncu moved to `packages/exec/src/collectors/ncu.ts`); u8 inputs; `pciBusId`; `nvidia_smi` facts; hostname; `RUNNER_VERSION = "kiln_runner/2"` |

## 4. runtime/: kiln-program/1 launchers

### 4.1 Purpose (observed, `runtime/README.md`)

Load a `kiln-program/1` file and run it outside the workbench: in a browser (WebGPU) or in Python (wgpu-py or
CUDA). `CudaProgram(allocate=False)` lets the caller own device memory and scratch, for embedding a Kiln kernel in
another CUDA program (e.g. a PyTorch extension or a pipeline that already holds buffers).

### 4.2 `runtime/webgpu/launch.ts` (160 lines)

```ts
export type Dtype = "f32" | "u8";
export interface ProgramTensor { name: string; buffer: number; shape: number[]; dtype: Dtype }
export interface ProgramBuffer { id: number; dtype: Dtype; elements: number; bytes: number; name?: string | null; data?: string }
export interface ProgramKernel { ... }          // name, reads, writes, grid, block, smemBytes, dispatch, wgsl, ...
export interface KilnProgram { ... }            // format, inputs, outputs, buffers, kernels
export type InputData = Float32Array | Uint8Array | Uint8ClampedArray | ArrayLike<number>;
export function unsupportedReason(program: KilnProgram, limits: GPUSupportedLimits): string | null;   // :48
export class KilnWebGpuProgram {                                                                    // :60
  static async create(device: GPUDevice, program: KilnProgram): Promise<KilnWebGpuProgram>;        // :73
  buffer(name: string): GPUBuffer;                                                                  // :105
  write(name: string, data: InputData): void;                                                       // :112 (u8 packed into u32 words)
  encode(encoder: GPUCommandEncoder): void;                                                         // :119 (all kernels, one compute pass)
  run(inputs, outputs?): Promise<Record<string, Float32Array>>;                                     // :126 (serialised)
  destroy(): void;                                                                                  // :155
}
```

Dependencies: none (WebGPU globals). Consumers: `runtime/test/webgpu-roundtrip.mjs` only (strips the TS types with
Node's `stripTypeScriptTypes` and injects it into a headless Chrome page through `scripts/shoot.mjs` `withPage`).
Not imported by the workbench, which has its own WebGPU execution (see §6.6).

### 4.3 `runtime/python/kiln_launch.py` (474 lines)

```python
FORMAT = "kiln-program/1"                                              # :39
def load(program) -> dict                                              # :43  path, str or dict
def open_program(program, backend: str = "wgpu", **kw) -> "Program"    # :56  "wgpu" | "cuda"
def gen(dtype: str, n: int, seed: int) -> np.ndarray                   # :65  fixture input formula
class Program:                                                         # :73  _packed, _constant, _host, run, close, context manager
class WgpuProgram(Program):                                            # :121 __init__(program, device=None, power_preference="high-performance"); write, dispatch, read, run, close
def unsupported_reason(program: dict, limit) -> str | None             # :179
def _find_library(env, names, globs) -> ctypes.CDLL                    # :202  libcuda / libnvrtc lookup, env override
def _torch_lib_globs(stem) -> list[str]                                # :218  finds NVRTC inside a torch wheel
class _Cuda:                                                           # :225  singleton; driver API + NVRTC via ctypes; compile(source, entry, arch) -> (cubin|ptx, kind)
class CudaProgram(Program):                                            # :309
    def __init__(self, program, device: int = 0, allocate: bool = True)
    def launch(self, stream: int = 0, scratch: dict[int, int] | None = None, **pointers: int) -> None   # :372
    def write(name, data); def read(name); def run(outputs=None, **inputs); def close()
def check_fixtures(directory: str, backend: str) -> int                # :437
# CLI: python kiln_launch.py check <fixtures-dir> --backend wgpu|cuda
```

Dependencies: numpy; `wgpu` (wgpu-py) for the wgpu backend; libcuda + libnvrtc (system or torch wheel) for CUDA. No
dependency on the rest of the repo. Tests: `test_kiln_launch.py` (unittest with a fake driver, 172 lines); fixture
check against real GPUs via `kiln-selftest` in the kiln-perf image.

### 4.4 `runtime/test/`

- `fixtures.mjs` (78 lines): `CASES` = `blur-small, blur-2d-grid, attention, mlp, grey-u8`; deterministic inputs
  with `h = (i * 2654435761 + s * 40503) mod 2^32` (fixtures.mjs:44); `buildCase` compiles with `compileScript`
  from `apps/workbench/src/compile.js`; writes program JSON plus expected outputs.
- `webgpu-roundtrip.mjs` (66 lines): runs each fixture through `launch.ts` in headless Chrome.
- Root script `test:launch` runs fixtures + roundtrip; both are outside `pnpm test` (GPU/browser needed).

## 5. runner/: CUDA runner, driver and the kiln-perf image

### 5.1 `runner/kiln_runner.py` (281 lines)

Docstring (observed, kiln_runner.py:2-13): "run Kiln Workbench kernels on a real CUDA GPU ... run by the Kiln driver
inside the kiln-perf image (kiln-kernels/1, KILN-003 guide §19.2): it compiles each kernel with nvcc, runs it on the
same seeded inputs the workbench uses, times it with CUDA events, and returns the outputs at sampled indices".

CLI:

```text
python kiln_runner.py device                         what GPU this is (JSON)
python kiln_runner.py run bundle.json -o out.json    run a kiln-bundle/1; write kiln-results/1
  --arch  (default: native, or $KILN_ARCH)           kiln_runner.py:257,265
cache dir: $KILN_CACHE or <tmp>/kiln-runner-cache    kiln_runner.py:30
```

Internals: `HARNESS` C++ template (mulberry32 input generation inside the harness, kiln_runner.py:56-69), `build`
(nvcc `-O3 -Xptxas -v`, cache keyed by source, register count parsed from ptxas, :141), `DEVICE_QUERY`,
`nvidia_smi(pci)` with `SMI_FIELDS` (:184), `kernel_name(src)` regex (:205), `run_kernel` (:212), `run_bundle`.
`RUNNER_VERSION = "kiln_runner/2"` (:29).

`kiln-bundle/1` (input, fields read by `run_bundle`/`run_kernel`):

```text
format: "kiln-bundle/1", reps (default 50), warmup (default 5)
kernels: [{ name, identity?, source (CUDA, one __global__), inputs: [{ size, seed, dtype: "f32"|"u8" }],
            samples: [index...], out (element count), grid, block }]
```

`kiln-results/1` (output, kiln_runner.py:253):

```text
format: "kiln-results/1", device {...}, runner: "kiln_runner/2", created
kernels: [{ name, identity, us_median, us_min, us_all[], samples[], regs } | { name, identity, error }]
```

Consumers: `packages/exec/src/kinds/kiln-kernels.ts` (`lower()` builds the bundle and stages the runner into the job;
its own `entrySymbol` regex at :51-52 says "the runner finds it the same way, kiln_runner.py kernel_name"),
`apps/server` exec assets (`exec/assets.ts`, area C).

### 5.2 `runner/kiln_driver.py` (1044 lines): kiln-driver/1

A host-side HTTP job executor. It does not compile or launch CUDA itself: it runs plan steps as Docker containers
with GPU access, under a per-GPU file lock, and archives the results.

HTTP API (docstring, kiln_driver.py:15-25, plus two undocumented routes found in `handler_for`, :879):

| Method | Path                                    | Behaviour                                                        |
| ------ | --------------------------------------- | ---------------------------------------------------------------- |
| GET    | `/v1/info`                              | api, sha256 of the driver file, hostname, root, running, queued  |
| POST   | `/v1/probe`                             | `kiln-probe-request/1` → `kiln-facts/1`                          |
| HEAD   | `/v1/blobs/<sha256>`                    | 200 stored, 404 not                                              |
| PUT    | `/v1/blobs/<sha256>`                    | 201; 400 when the bytes do not hash to the name                  |
| GET    | `/v1/blobs/<sha256>`                    | undocumented (present in handler)                                |
| POST   | `/v1/jobs`                              | `kiln-plan/1` → 202 `{position}`; 409 missing blobs; 400 refused mount |
| GET    | `/v1/jobs`                              | every job with its state                                         |
| GET    | `/v1/jobs/<id>/events?after=N&wait=S`   | events after N, long-poll up to S seconds                        |
| GET    | `/v1/jobs/<id>/plan`                    | undocumented (present in handler)                                |
| POST   | `/v1/jobs/<id>/cancel`                  | 202; running container killed                                    |
| GET    | `/v1/jobs/<id>/archive`                 | `result.tar.gz` once ended; 409 before                           |
| DELETE | `/v1/jobs/<id>`                         | delete the job directory once ended                              |
| PUT    | `/v1/self`                              | new `kiln_driver.py`; 202 then re-exec; 409 while busy           |

Limits and validation (observed constants, :53-65): `API = "kiln-driver/1"`, `SHA`, `JOB_ID`, `STEP_ID`, `ENV_NAME`,
`ENVIRONMENT` regexes, `MAX_PLAN_BYTES = 16 MiB`, `MAX_STEPS = 4096`, `MAX_OUTPUT_EVENTS = 400`,
`DEFAULT_TOOL_PREFIXES = ("/opt/nvidia/", "/usr/local/cuda")`, `GPU_SAMPLER_FIELDS`, `PROBE_TIMEOUT = 180`.

Structure (observed): helpers `now, file_sha256, log, run, sysctl, memory_bytes, cpu_facts, gpus(smi) :147,
gpu_counters :163, compute_apps :173, gpu_now :184`; `class Refused` (:97, HTTP error with status), `class Docker`
(:201; version, image, names, kill_job), `PROBE_SCRIPT` (:229, runs inside an environment's image to report tool
versions), `class Job` (:278), `class Driver` (:289) with `emit, events_after, recover, probe, probe_environment,
gpu_args, tool_mount, blob, put_blob, submit (:455), check_step, resolve_mount (roles bundle/cache/tool, :528),
cancel, worker (:561), execute (:581), finish, pack, acquire (:654, flock on /run/lock/kiln-gpu-<uuid>.lock plus a
.holder file), release, conditions, idle_window, run_step (:728), start_sampler (nvidia-smi sidecar, :765),
container (:773, docker run), pump, replace_self`; then `check_rel, read_holder, enforce_output, handler_for, reexec,
serve, main`. Writes `kiln-execution/1` into each job.

CLI: `kiln_driver.py serve --root DIR --listen 127.0.0.1:5281 --docker EXE --nvidia-smi EXE --lock-dir DIR
--hostname NAME --allow-tool PREFIX`.

Dependencies: Python standard library only, the `docker` CLI, `nvidia-smi`. Consumers: the server's executor client
(area C).

### 5.3 `runner/docker/`: the kiln-perf image

- `Dockerfile` (49): Ubuntu 24.04, CUDA 13.0 nvcc + NVRTC, `python3-numpy`, optional Nsight Compute; copies
  `kiln_runner.py`, `runtime/python/kiln_launch.py`, built fixtures, `kiln-probe` (+ `.cu`), `kiln-selftest`.
- `build.sh` (62): `--host`, `--tag`, `--cuda`, `--ncu`, `--context-only`; refuses a dirty tree over `runner
  runtime/python runtime/test packages/kiln/src apps/workbench/src apps/workbench/presets` (because fixtures are
  compiled from the workbench).
- `kiln-probe` (102, Python; `kiln-probe [--quick] [--id gb10] [--name "NVIDIA GB10"]`) + `kiln-probe.cu` (194):
  compiles the probe with `nvcc -O3 -std=c++17 -arch=...` (kiln-probe:56-61), measures SM count, clocks, bandwidth
  and smem, and prints a JSON report with a spec in the `SPECS` shape of `std/targets.js`.
- `kiln-selftest` (6): `kiln_launch.py check fixtures --backend cuda` and `kiln_runner.py device`.
- `perf-lab-cpu/Dockerfile` (21): Python 3.12 + torch 2.14.1 CPU (for Perf Lab CPU jobs, area D).

## 6. Duplicated concepts (observed, file:line)

### 6.1 Kernel identity formula: five copies, one divergent

```text
std/loop.js:277     identity: ({ expr, shape, args }) => hash(`loop|${expr.__key}|${shape.join("x")}|${args.map((a) => a.type.shape.join("x")).join(",")}`)
std/tile.js:346     identity: ({ expr, shape, args }) => hash(`loop|${expr.__key}|${shape.join("x")}|${args.map((a) => inKey(a.type.shape, a.type.dtype)).join(",")}`)
std/kernel.js:294   identity: (same as tile.js:346)
std/program.js:19   identity: (same as tile.js:346)
std/program.js:38   identity: hash(`loop|${a.expr.__key}|${a.shape.join("x")}|${a.inShapes.map((s, i) => inKey(s, inDtypes[i])).join(",")}`)
```

The loop-dialect copy omits the input dtype. The schedule fork is keyed while the node is still a `loop.kernel`, so
for a u8 kernel the fork key equals the f32 kernel's identity while `programOf` reports the dtype-aware identity.
Observed with a probe (`u8.mjs`, diary A), a `floor((rgb + 1) * 0.5)` kernel on `(8, 64)`:

```text
f32 fork key 302w2uv760 kernel identity 302w2uv760  activation ["decided by model"]
u8  fork key 302w2uv760 kernel identity 2dbf6f6auuk activation ["no schedule fork decided this kernel"]
```

Inferred consequences (not executed): `activationOf` misreports u8 kernels as undecided; `kernelPinPolicy` and
`decide.evidence` look up options by fork key, so f32 evidence can decide a u8 kernel's fork and pins recorded
against the u8 identity never match. Smallest class fix (inferred): one exported `kernelIdentity({expr, shape,
inShapes, inDtypes})` used at all five sites.

### 6.2 CUDA entry symbol / C name: six places

- `std/emit.js:5` `const cname = (s) => String(s || "kernel").replace(/[^\w]/g, "_")`
- `std/export.js:9` the same `cname`; `export.js:17` `exportedName`; `export.js:19-22` `renameCuda` regex rename
- `std/records.js:63` `symbolOf` (comment: "as the emitters print it (emit.js `cname`)")
- `runner/kiln_runner.py:205` `kernel_name(src)` regex over `__global__`
- `packages/exec/src/kinds/kiln-kernels.ts:51-52` `entrySymbol(source)` regex (comment says it mirrors the runner)
- `runtime/python/kiln_launch.py:361` compiles with `entry = k["name"]`, i.e. it relies on `exportProgram` having
  renamed the CUDA entry to the kernel's exported name (`export.js:63`)

### 6.3 Input generators

- mulberry32: `core/util.js:39` (`rng`, JS) and `runner/kiln_runner.py:56-69` (C++ in `HARNESS`, comment: "exactly as
  the workbench (kernelInputs)"); `std/program.js` `kernelInputs` is the JS consumer that defines the mapping
  (f32 `r*2-1`, u8 `floor(r*256)`).
- Fixture integer generator: `runtime/test/fixtures.mjs:44` and `runtime/python/kiln_launch.py:65` (`gen`), the same
  formula in two languages.

### 6.4 CUDA compilation paths

- NVRTC through ctypes: `runtime/python/kiln_launch.py:225-307` (`_Cuda`) and `apps/workbench/test/cuda_check.py`
  (a second ctypes NVRTC/driver wrapper, used by the skipped `export-cuda` test).
- nvcc compile: `runner/kiln_runner.py:141` (`build`, with a cache) and `runner/docker/kiln-probe:56-61` (compiles
  `kiln-probe.cu`, no cache).

### 6.5 nvidia-smi querying: three implementations

- `runner/kiln_runner.py:184` `nvidia_smi(pci)` with its own `SMI_FIELDS`.
- `runner/kiln_driver.py:147-198` `gpus`, `gpu_counters`, `compute_apps`, `gpu_now` (its query list at :185 differs
  from `GPU_SAMPLER_FIELDS` at :64 in the same file).
- `runner/docker/kiln-probe:29-51` `smi` / `snapshot`.

### 6.6 WebGPU execution: two implementations

- `std/devices.js:125-197` (`runOnce`): buffer creation, u8 packing (:134-139), dispatch fold (:144), error scopes,
  readback; used by the workbench for measurement.
- `runtime/webgpu/launch.ts`: buffer creation, u8 packing (:36-45), dispatch, readback; used only by its test.
- Grid fold for 65535 appears in three places: `emit.js:64` (WGSL index), `devices.js:144`, `export.js:61`
  (`dispatch` field).
- `unsupportedReason`: `launch.ts:48` and `kiln_launch.py:179` (same checks, two languages; acceptable as a
  per-language launcher, listed for completeness).

### 6.7 Measurement protocol defaults

`{reps: 7, warmup: 3, launches: 20, seed: 1}` at `std/devices.js:203`, `apps/workbench/src/server-sync.js:87`,
`apps/workbench/src/server-client.js:157`. The CUDA runner has different defaults (`reps` 50, `warmup` 5,
`kiln_runner.py` `run_bundle`), normally overridden by the bundle.

### 6.8 `flatKnobs`

Byte-identical one-liner at `std/records.js:68` and `apps/workbench/src/server-client.js:129`.

### 6.9 Device specs and target lists

- `std/targets.js` `SPECS` (source of truth for the compiler).
- `std/devices.js:301` `cudaTarget` maps compute capability → `SPECS` key, falling back to `rtx5090`.
- `apps/workbench/src/server-sync.js:85` `HostDevice` defaults to `rtx5090`.
- `runner/docker/kiln-probe` emits a measured spec in the `SPECS` shape (copied in by hand, e.g. gb10).
- `lab-workbench/src/data/capabilities.ts` has separate synthetic host specs (area D).
- Hard-coded lists that lag `SPECS`: `scripts/kiln-export.mjs` `--target` help (no `gb10`),
  `apps/workbench` `agent.js:114` device list string, `reference.txt:162` target list (no `gb10`).

### 6.10 The `imports/` snapshot

A full second copy of the compiler, UI, presets, tests and runner (§3). Not imported, not tested.

## 7. Complexity hotspots and module-level state (observed)

- `core/kiln.js` `Run` (761-1094, ~330 lines): the god object of the compiler (scheduling, matching, forks,
  decisions, journaling, snapshots, events). Every consumer that shows a step, a diff or a decision reaches into it.
- Global registries and counters in `core/kiln.js`: `SCOPES` (:20), `METHODS` (:25), `DIALECTS` (:99), `GID` (:112),
  `RID` (:621). Inferred: two compiler instances in one realm (e.g. two pipelines with different dialect sets, or
  tests) share dialect registrations and method names; method name collisions are resolved at call time by dialect
  lookup (`METHODS` holds a list per name).
- Module-level caches in std: `INTERN` (loop.js, capped at 400 000) and `FREE`, `VIEW_FNS` (tensor.js:83-101),
  `SIMS` (program.js, `WeakMap`), `contentOf` memo (records.js).
- Runtime code generation with `new Function`: `core/script.js` (user scripts), `std/tensor.js` (views),
  `std/loop.js` (`compileSerial`/`compilePoint`), `std/emit.js:200` (simulator). Inferred: incompatible with a
  strict CSP without `unsafe-eval`.
- Source-text reflection: `Rule.from/to` parse lambda parameter names (kiln.js:665).
- `unifiedDiff` (kiln.js:1134) is O(n·m) LCS over printed graphs.
- `tile.js` `timeModel`/`estimate` (152-194+): the analytic cost model is the only scheduling prior; decisions are
  explained only by "model" plus the knob map.
- `runner/kiln_driver.py` (1044 lines, one file): HTTP handler, job queue, Docker orchestration, GPU locking with
  idle-window conditions, sampling sidecar, archiving and self-replacement in one process.

## 8. Reuse and packaging candidates (inferred unless marked)

| Candidate                                  | Contents                                                        | Coupling to cut first                                                                 |
| ------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Generic IR / rewrite framework             | `core/kiln.js`, `core/ix.js`, `core/util.js`                    | `core/script.js:4` → `std/index.js`; module globals `SCOPES/METHODS/DIALECTS/GID/RID` (make a context object); `Run` split (scheduler / fork-decider / journal) |
| kiln-program/1 launchers                   | `runtime/webgpu/launch.ts`, `runtime/python/kiln_launch.py`     | already standalone (observed: no repo imports); needs a schema file and its own package; the workbench could use `launch.ts` instead of `devices.js` `runOnce` |
| Formats package (records/store/export)     | `std/records.js`, `std/store.js`, `std/export.js`               | depends on `tile.canonRow`, `kernel.printKernelBody`, `program.seedOf`; overlaps `@kiln/evidence` (area C) |
| Simulator + cost model                     | `std/emit.js` `toSim`, `program.js` `simulateKernel/metricsOf`, `tile.js` `timeModel/estimate` | operates on Kernel IR; separable with `ix.js` and `fns.js`                     |
| Compile entry points                       | `apps/workbench/src/compile.js` (`compileScript`, `endToEnd`)   | move into `@kiln/kiln` so `scripts/kiln-export.mjs` and `runtime/test/fixtures.mjs` stop importing the app and stop using relative `../packages/kiln/src` paths |
| CUDA execution host                        | `runner/kiln_driver.py`                                         | standalone (stdlib + docker + nvidia-smi); its protocol is the server's contract      |
| CUDA kernel runner                         | `runner/kiln_runner.py`                                         | standalone; `kernel_name` shared with exec `entrySymbol`                              |
| Shared single sources                      | identity function, entry symbol, input generators, protocol defaults, GPU specs, nvidia-smi query, `flatKnobs` | §6 lists each site                                 |

## 9. Vestigial and stale (observed)

- `README.md:21,40` describe `kiln_runner.py serve`; the `serve` mode was removed (§3).
- `runner/docker/README.md`, `Dockerfile`, `build.sh` mention "the runner's --ncu profiling"; the flag is gone, ncu
  is a collector in `packages/exec/src/collectors/ncu.ts`.
- `scripts/kiln-export.mjs` `--target` help lists `rtx5090 rtx4090 h100 a100 orin`, not `gb10`.
- `kiln_driver.py` docstring omits `GET /v1/jobs/<id>/plan` and `GET /v1/blobs/<sha256>`.
- `std/store.js`: `Store` alias of `EvidenceStore`; `clear()` behaves as `forget()`.
- `std/records.js` `legacyRecord` keeps the kiln-evidence/1 import path alive for files from the original.
- `apps/workbench/test/cuda_check.py` and `export-cuda.mjs`: skipped by `run-node-tests.mjs` in the workbench test
  run (baseline log, ticket diary step 2).
- `imports/` built artefacts (`app/dist`, `runner/kiln-workbench.html`).
- `kiln-program-set/1` has no in-repo reader (grep over tracked sources found only the writer).

## Usage Examples

Reproduce the IR example (from any directory; paths are absolute):

```js
// ir.mjs
const R = "/Volumes/SSD/code/kiln/packages/kiln/src";
const { k } = await import(R + "/core/kiln.js");
const { N } = await import(R + "/std/tensor.js");
const { pipeline } = await import(R + "/std/emmy.js");
const { SPECS, target } = await import(R + "/std/targets.js");
const { programOf } = await import(R + "/std/program.js");
const g = k.trace("softmax", ({ x }) => ({ y: N.softmax(x, -1) }), { x: k.tensor([4, 64]) });
const run = pipeline({ target: target(SPECS.rtx4090) }).run(g);
for (const ir of run.irOrder) console.log(ir, "\n", run.at(ir).print());
console.log(run.decisions, programOf(run.graph).kernels.map((kn) => [kn.row, kn.identity]));
```

Export a preset to kiln-program/1 and check it with the Python launcher:

```bash
node scripts/kiln-export.mjs --preset <W-id> --target rtx4090 --out prog.json
python runtime/python/kiln_launch.py check <fixtures-dir> --backend wgpu
```

Run a bundle on a CUDA host (inside kiln-perf):

```bash
python kiln_runner.py device
python kiln_runner.py run bundle.json -o results.json
```

## Related

- `reference/01-investigation-diary.md`: ticket diary (prompt, split, baseline tests).
- `reference/07-diary-a-compiler-runtime-launchers-and-cuda-runner.md`: commands and evidence behind these notes.
- `reference/04-inventory-notes-c-server-execution-core-and-evidence.md`: consumers of kiln-bundle/1,
  kiln-results/1, kiln-driver/1 and kiln-measure/1.
- `reference/03-inventory-notes-b-the-kiln-workbench-page.md`: the workbench's use of `@kiln/kiln`.
