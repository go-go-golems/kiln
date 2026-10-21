---
Title: 'Diary A: compiler, runtime launchers and CUDA runner'
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
Summary: 'Investigation diary of inventory area A (packages/kiln, imports/kiln-workbench-src, runtime/, runner/, scripts/kiln-export.mjs): how the notes in reference/02 were gathered, the probes behind the IR example and the u8 identity divergence, and how the area-A rows of the inventory database were produced.'
LastUpdated: 2026-10-21T11:20:00-04:00
WhatFor: 'Tracing a claim in reference/02-inventory-notes-a-compiler-runtime-launchers-and-cuda-runner.md or a compiler-runtime row of the inventory database back to the command or read that produced it, and resuming area A.'
WhenToUse: 'When a compiler, launcher or runner claim in the notes or the intern guide is doubted, or before extending the area A inventory.'
---

# Diary A: compiler, runtime launchers and CUDA runner

This diary covers inventory area A of KILN-004: `packages/kiln` (`@kiln/kiln`), `imports/kiln-workbench-src`,
`runtime/` (`runtime/webgpu`, `runtime/python`, `runtime/test`), `runner/` (`runner/kiln_runner.py`,
`runner/kiln_driver.py`, `runner/docker`) and `scripts/kiln-export.mjs` / `scripts/run-node-tests.mjs`. The notes it
supports are `reference/02-inventory-notes-a-compiler-runtime-launchers-and-cuda-runner.md`; section numbers below
(§n) refer to them. The area's database rows live in `various/inventory/compiler-runtime.json`. The ticket's main
diary is `reference/01-investigation-diary.md`.

## Step 1: Reading the compiler, launchers and runner, and writing the notes (written after the fact)

This step is written after the fact. It covers the whole first pass: sizing area A, reading every source file of
`packages/kiln/src`, diffing `imports/kiln-workbench-src` against its new homes, reading `runtime/` and `runner/`,
running two scratch probes against the compiler, and writing the notes. The pass ran read-only against
`/Volumes/SSD/code/kiln` at commit `4d9adc2` (no install, build or test there; the probes import the source by
absolute path from a scratch directory outside the repository). The session's context was compacted once during
the reading, so for the part before that point only a summary survives and the commands below give the shape of
what was run, not a verbatim log.

The pass was interrupted twice. The orchestrator's first relayed instruction (commit and keep a diary) arrived while
the notes were still a scratch file; they were written straight into `reference/02-…`. Then the session hit a usage
limit and was stopped; the orchestrator committed the 872-line notes file as it stood in `1d0c894`. A check after
resuming (`git diff --stat` on the notes file, empty) showed that commit already contains the last three corrections
made before the stop (the `kiln-probe` language, the `runtime/python/kiln_launch.py:361` entry-name detail and the
nvcc-path duplication).

### Prompt Context

**User prompt (verbatim):** see `01-investigation-diary.md`, Step 1
([link](01-investigation-diary.md#step-1-locating-the-system-and-opening-the-ticket)).

**User instructions relayed mid-task (verbatim, passed on by the orchestrator):**

> Tell each agent btw commit at appropriate intervals and keep a detailed diary as you work (using the diary format
> from the skill).

The second relayed instruction (summary, the user's own words were not passed on): record every finding in the
SQLite inventory database too, through one JSON file per area (`various/inventory/compiler-runtime.json`) that a
loader rebuilds the database from, with diary steps cross-linked to rows by `diary_step` tags.

**Orchestrator's assignment (summary, not a user quote):** build a detailed component inventory, not a code review,
of `packages/kiln` (core and std), `imports/kiln-workbench-src` compared with `packages/kiln` and `apps/workbench`,
`runtime/`, `runner/` (runner, driver, kiln-perf image) and `scripts/kiln-export.mjs` / `scripts/run-node-tests.mjs`.
For each component: purpose, public API, formats, dependencies and consumers, LOC, tests. Identify (a) the IR
pipeline stages and the data structure of each, with an example; (b) every duplicated concept with file:line
evidence; (c) complexity hotspots and globals; (d) reuse and packaging candidates and the coupling to cut;
(e) dead or vestigial code. Distinguish observed from inferred. The repository was read-only; later instructions
narrowed that to three writable, committable files (the notes, this diary, the area JSON), committed with pathspec
form only, subject prefix `KILN-004 A: `.

**Assistant interpretation:** an evidence-cited inventory of the compiler and its execution side, kept in the ticket,
with every finding also expressed as a database row.

**Inferred user intent:** know which compiler and runtime pieces are separable and where the same concept is
implemented more than once, so the Kiln and Perf Lab integration can be tightened or split again.

**Commit:** `1d0c894` (the orchestrator's commit that saved the notes as they stood when the agent was stopped)

### What I did

- Sized the area: `git ls-files packages/kiln runtime runner scripts | xargs wc -l`. Largest files:
  `packages/kiln/src/core/kiln.js` 1152 lines (70.7 KB), `runner/kiln_driver.py` 1044,
  `runtime/python/kiln_launch.py` 474, `packages/kiln/src/std/tile.js` 364, `packages/kiln/src/std/loop.js` 359.
- Read `packages/kiln/package.json` (exports `./core/*`, `./std/*`, no index; deps `acorn` 8.19.0 and
  `@kiln/evidence`, whose exports point at TypeScript source).
- Read `packages/kiln/src/core/kiln.js` end to end and mapped its sections (notes §1.2); listed exports and
  module-level state with `grep -n "^export\|^class\|^const [A-Z]\|^let " packages/kiln/src/core/kiln.js`, and the
  `Run` methods with an `awk` over lines 761-1094.
- Read `packages/kiln/src/core/ix.js`, `util.js`, `script.js` and every `packages/kiln/src/std/*.js` module.
- Listed the tests (`packages/kiln/test/*.mjs`, 13 files, 855 lines) and their imports.
- Ran the IR probe (`ir.mjs`, notes "Usage Examples") for softmax over `(4, 64)` on `rtx4090`, printing every IR
  checkpoint, the decisions, the step journal, the CUDA/WGSL of the kernel and `pipeline().describe()`:
  `node ir.mjs > ir.out` exit 0, 492 lines.
- Ran the u8 probe (`u8.mjs`): the same elementwise kernel traced with f32 and u8 input; printed the schedule fork
  key, the `programOf` identity and `activationOf` notes.
- Diffed the imported original against its new homes, file by file:
  `diff imports/kiln-workbench-src/app/src/core/kiln.js packages/kiln/src/core/kiln.js | wc -l` and the same for
  each core/std file, `app/test`, `presets`, `runner/kiln_runner.py`.
- Read `runtime/README.md`, `runtime/webgpu/launch.ts`, `runtime/python/kiln_launch.py`,
  `runtime/python/test_kiln_launch.py`, `runtime/test/fixtures.mjs`, `runtime/test/webgpu-roundtrip.mjs`.
- Read `runner/kiln_runner.py`, `runner/kiln_driver.py` (docstring, constants, every class and the HTTP handler),
  `runner/docker/Dockerfile`, `build.sh`, `kiln-probe`, `kiln-probe.cu` (head), `kiln-selftest`, `README.md`,
  `runner/docker/perf-lab-cpu/Dockerfile`.
- Read `scripts/kiln-export.mjs` and `scripts/run-node-tests.mjs`.
- Grepped consumers: imports of `@kiln/kiln/` and of `packages/kiln/src` across tracked files outside `imports/`
  and `ttmp/`.
- Grepped each duplicated concept to its sites (identity formula, `cname`/entry symbol, mulberry32, protocol
  defaults, `flatKnobs`, nvidia-smi queries, WebGPU buffer packing, device specs).
- Wrote the notes: size table, format table, §1 package, §2 IR pipeline with the worked example, §3 imports diff
  table, §4 runtime, §5 runner, §6 duplications, §7 hotspots, §8 reuse candidates, §9 vestigial.

### Why

- Probing the compiler by running it, rather than only reading it, was the cheapest way to get a real example for
  every IR stage and to test a suspicion from reading: `packages/kiln/src/std/loop.js:277` is the only identity
  function without the input dtype.
- Diffing `imports/` file by file, instead of `diff -r` over the trees, was needed because the original's single
  `app/` was split into `packages/kiln` and `apps/workbench`.

### What worked

- The IR probe printed all six IR checkpoints (torch, tensor, loop, tile, kernel, gpu), the one schedule decision
  (`schedule n14 model {...} of 21`) and an 18-step journal; these are quoted in notes §2.2.
- The u8 probe confirmed the identity divergence:

  ```text
  f32 fork key 302w2uv760 kernel identity 302w2uv760 activation ["decided by model"]
  u8 fork key 302w2uv760 kernel identity 2dbf6f6auuk activation ["no schedule fork decided this kernel"]
  ```

### What didn't work

- The scratch probes cannot be committed (only three files in the repository are writable); their source is
  reproduced in the notes ("Usage Examples") and in Technical details below.
- The usage-limit stop: the agent was halted mid-work and resumed from the orchestrator's commit `1d0c894`; nothing
  was lost (see the summary above).
- A first attempt to print the diary skill and its references in one `cat a; echo =====; cat b` command failed under
  zsh with `(eval):1: ==== not found` after the first file; rerun with a different separator.

### What I learned

- The compiler is one dependency-free JavaScript package with a generic core (`core/`) and a GPU stack on top
  (`std/`); the only core→std edge is `packages/kiln/src/core/script.js:4`.
- `runtime/webgpu/launch.ts` and `runtime/python/kiln_launch.py` import nothing from the repository; they depend only
  on the `kiln-program/1` file format.
- `runner/kiln_driver.py` does not run Kiln kernels itself; it runs job steps as Docker containers under a per-GPU
  lock. `runner/kiln_runner.py` is what runs inside the kiln-perf image.
- CUDA no longer runs from the workbench page directly: `CudaDevice`, `bundle` and `ingest` were removed from
  `packages/kiln/src/std/devices.js`; the page goes through the Kiln server.

### What was tricky to build

- Telling identity copies apart: four of the five identity lambdas look the same at a glance; the difference at
  `packages/kiln/src/std/loop.js:277` is `a.type.shape.join("x")` where the others use
  `inKey(a.type.shape, a.type.dtype)`. Only running a u8 kernel showed that the fork key is taken while the node is
  still a `loop.kernel`.

### What warrants a second pair of eyes

- The consequences of the identity divergence beyond `activationOf` (kernel pins and `decide.evidence` lookups keyed
  by fork key) are inferred from reading `packages/kiln/src/std/tune.js` and `packages/kiln/src/core/kiln.js`, not
  executed.
- The claim that nothing live imports `imports/` rests on a grep of tracked files.

### What should be done in the future

- Fill the area JSON (packages, modules, formats, duplications, facts) and re-verify the duplication sites with
  fresh commands (next steps).

### Code review instructions

- Start at notes §2.2 and §6.1; reproduce with the probe below from any directory outside the repository.
- `sed -n 270,280p packages/kiln/src/std/loop.js` against `sed -n 340,350p packages/kiln/src/std/tile.js`.

### Technical details

The u8 probe (`u8.mjs`, run with `node u8.mjs` from a scratch directory):

```js
const R = "/Volumes/SSD/code/kiln/packages/kiln/src";
const { k } = await import(R + "/core/kiln.js");
const { N } = await import(R + "/std/tensor.js");
const { pipeline } = await import(R + "/std/emmy.js");
const { SPECS, target } = await import(R + "/std/targets.js");
const { programOf } = await import(R + "/std/program.js");
const { activationOf } = await import(R + "/std/records.js");
for (const dt of ["f32", "u8"]) {
  const g = k.trace("grey", ({ rgb }) => ({ y: N.floor(N.mul(N.add(rgb, 1), 0.5)) }), { rgb: k.tensor([8, 64], dt) });
  const run = pipeline({ target: target(SPECS.rtx4090) }).run(g);
  const kern = programOf(run.graph).kernels[0];
  console.log(dt, "fork key", run.decisions.map((d) => d.key).join(","), "kernel identity", kern.identity,
    "activation", JSON.stringify(activationOf(kern, { run }).notes));
}
```

## Step 2: Re-verifying every duplication site, correcting the notes, and the duplication, hotspot and fact rows

Before turning the duplication list into database rows, each site was re-checked with a fresh command at the current
`main`, because several line numbers in the notes came from the pre-compaction reading and only survived as a summary.
Most held. Five things were wrong or imprecise and were corrected in the notes: the `imports/` paths are one level
deeper than the notes said (`imports/kiln-workbench-src/kiln-workbench/...`); `apps/workbench/src/agent/agent.js:114`
does list `gb10` (the notes had it as lagging; only `apps/workbench/reference.txt:162` and the help comment at
`scripts/kiln-export.mjs:9` lag, and the option itself resolves any `SPECS` key); `apps/server` imports `@kiln/kiln`
from two test files, not one; and several line numbers moved (fixture formula at `runtime/test/fixtures.mjs:47`, not
:44; `nvidia_smi` fields at `runner/kiln_runner.py:180-198`; mulberry32 at `packages/kiln/src/core/util.js:38-41`).

The outcome is 12 duplication rows, 7 complexity hotspots and 111 facts in `various/inventory/compiler-runtime.json`,
each tagged with the step that found it (most `[1, 2]`: found in the first pass, confirmed here). The notes file grew
to 883 lines.

### Prompt Context

**User prompt (verbatim):** see `01-investigation-diary.md`, Step 1. The relayed instructions are quoted in Step 1 of
this diary.

**Assistant interpretation:** every duplication row must carry file:line evidence that holds at the current commit,
so re-verify before writing rows.

**Commit:** `a36a59c` — "KILN-004 A: diary step 1; packages, modules and formats of the compiler and runtime area"
(the previous commit; this step's own commit is recorded in Step 3)

### What I did

- Re-ran the u8 identity probe from the scratch directory: `node u8.mjs`, exit 0, same output as Step 1
  (fork key `302w2uv760` for both dtypes; u8 kernel identity `2dbf6f6auuk`).
- Identity sites: `grep -n "identity" packages/kiln/src/std/{loop,tile,kernel,program}.js` → loop.js:277 (shape only),
  tile.js:346, kernel.js:294, program.js:19, program.js:38 (all `inKey(shape, dtype)`).
- Entry symbol: `grep -n "cname\|entry\|symbolOf"` over `packages/kiln/src/std/{emit,export,records}.js` →
  emit.js:5 and :22, export.js:9, :17, :19-22, :63, records.js:62-63; `grep -n "entrySymbol\|__global__"
  packages/exec/src/kinds/kiln-kernels.ts` → :50-52 ("the runner finds it the same way, kiln_runner.py kernel_name").
- Generators: `grep -n "mulberry\|0x6D2B79F5\|0x6d2b79f5"` → `packages/kiln/src/core/util.js:38-41`,
  `runner/kiln_runner.py:56-69`; `grep -n "2654435761\|40503"` → `runtime/test/fixtures.mjs:7,47`,
  `runtime/python/kiln_launch.py:67`.
- `flatKnobs`: compared `sed -n 68p packages/kiln/src/std/records.js` with `sed -n 129p
  apps/workbench/src/server-client.js` as shell strings → `IDENTICAL`.
- Protocol defaults: `grep -n "reps: *7\|warmup: *3"` → `packages/kiln/src/std/devices.js:203`,
  `apps/workbench/src/server-sync.js:87`, `apps/workbench/src/server-client.js:157`; runner defaults
  `runner/kiln_runner.py:242` (`reps` 50, `warmup` 5).
- Grid fold: `grep -n 65535` → `packages/kiln/src/std/emit.js:49`, `packages/kiln/src/std/devices.js:144`,
  `packages/kiln/src/std/export.js:60-61`; both launchers read `k.dispatch` (`runtime/webgpu/launch.ts:91`,
  `runtime/python/kiln_launch.py:149`).
- u8 packing: `sed -n 130,140p packages/kiln/src/std/devices.js` and `sed -n 34,46p runtime/webgpu/launch.ts`.
- nvidia-smi: `grep -n "query-gpu\|SMI_FIELDS\|GPU_SAMPLER_FIELDS\|--query"` over `runner/kiln_runner.py`,
  `runner/kiln_driver.py`, `runner/docker/kiln-probe` → three programs; the compute-apps query string is identical at
  `runner/kiln_driver.py:174` and `runner/docker/kiln-probe:47`.
- NVRTC: `grep -n "nvrtcCreateProgram\|ctypes.CDLL\|def " apps/workbench/test/cuda_check.py` (63 lines, `to_ptx`).
- Consumers: `git ls-files | grep -v "^imports/\|^ttmp/" | xargs grep -ln "packages/kiln/src"` →
  `runtime/test/fixtures.mjs`, `scripts/kiln-export.mjs` (code) and four `runner/docker` files (comments/paths);
  importers of `workbench/src/compile` outside the app → the same two; `@kiln/kiln/` importers → `apps/workbench` 23
  files, `apps/server` 2 (`test/decide.test.ts:7-13`, `test/support/modules.d.ts:2`); references to
  `imports/kiln-workbench-src` → `README.md` only.
- imports: `git ls-files imports | sed 's|/[^/]*$||' | sort | uniq -c` (116 files), and per-file diff line counts
  `diff imports/kiln-workbench-src/kiln-workbench/app/src/$f packages/kiln/src/$f | grep -c '^[<>]'`:
  kiln.js 52, ix.js 0, util.js 4, script.js 0, tile.js 10, devices.js 383, store.js 188, tune.js 91, program.js 37,
  emit.js 11. Sizes: 11948 lines without built HTML and lock file, `app/src` 8187.
- Stale text: `sed -n 19,23p README.md`, `grep -n serve README.md` (:40), `grep -n ncu runner/docker/*`
  (`build.sh:14`, `Dockerfile:9`), `grep -n "SPECS\|target" scripts/kiln-export.mjs` (:9 help, :76-77 resolution).
- Applied the corrections to the notes with exact-match replacements (a script that refuses any pattern that does not
  occur exactly once); all applied.
- Wrote the duplication, hotspot and fact rows; ran `python3 <ticket>/scripts/load_inventory.py --check`.

### Why

- A duplication row is only useful if a later reader can jump to every site; a stale line number costs more than an
  absent one.

### What worked

- All 12 duplications were reconfirmed; `flatKnobs` is byte-identical.
- The loader accepted every row shape on the first run.

### What didn't work

- The first `--check` after adding the rows failed by design, because the rows were tagged with step 2 before this
  step existed in the diary (exit 1, 32 lines of the form):

  ```text
  PROBLEM: compiler-runtime.json: duplications row 'kernel identity hash: loop, tile, kernel and gpu dialects plus programOf' names diary step 2, which compiler-runtime's diary lacks
  ```

  Writing this step resolves it.

### What I learned

- The kiln-perf image's sources (`runner/docker/kiln-probe`, `kiln-probe.cu`, `build.sh`, `README.md`) name
  `packages/kiln/src` paths in comments and in the clean-tree check, so moving the compiler means updating the image.
- `scripts/kiln-export.mjs` validates `--target` against `SPECS` at run time; only its help comment is stale.

### What was tricky to build

- Telling a stale claim from a stale line number: `apps/workbench/src/agent/agent.js:114` looked like a lagging list in
  the summary but is in sync; the fix was to grep the target name rather than trust the earlier note.

### What warrants a second pair of eyes

- Severity labels (`high` only for the identity divergence) are judgement calls on an inventory, not measured impact.
- `packages/exec/src/kinds/kiln-kernels.ts` and `apps/workbench/src/*` belong to areas C and B; their sites are cited
  here only as the other ends of area-A duplications.

### What should be done in the future

- Functionalities, reusable components, dependencies, service calls and a pipeline diagram (Step 3).
- The orchestrator may want to reconcile the target-spec duplication with area D's
  `lab-workbench/src/data/capabilities.ts` row.

### Code review instructions

- `python3 <ticket>/scripts/load_inventory.py --check`, then `jq '.duplications[].title'
  <ticket>/various/inventory/compiler-runtime.json`.
- Spot-check two sites per duplication with `sed -n <lines>p <path>`.

### Technical details

Corrections applied to the notes (old → new):

```text
util.js:39                          -> util.js:38-41
apps/server: only test/decide.test  -> test/decide.test.ts:7-13 and test/support/modules.d.ts:2
imports/kiln-workbench-src/app/...  -> imports/kiln-workbench-src/kiln-workbench/app/...
fixtures.mjs:44                     -> fixtures.mjs:7 (comment), :47 (code)
kiln_launch.py:65                   -> kiln_launch.py:65-67
kiln_runner.py:184 nvidia_smi       -> kiln_runner.py:180-198 SMI_FIELDS + nvidia_smi
kiln-probe compute-apps             -> same string as kiln_driver.py:174 (new)
README.md:21,40 serve               -> README.md:40 (command), :21 ("local or remote")
docker README/Dockerfile/build.sh   -> build.sh:14, Dockerfile:9
agent.js:114 lags SPECS             -> agent.js:114 in sync (literal); reference.txt:162 and kiln-export.mjs:9 lag
launch.ts:36-45                     -> launch.ts:35-45 packed(); kiln_launch.py:83 _packed (new)
```
