# Diary: Kiln Workbench compiler/runtime analysis (source 03)

Companion to `03-kiln-compiler-runtime-notes.md` in this directory. The coordinator asked for this diary partway
through the work, so steps 1 to 8 were written up afterwards from the session's command log and saved outputs. Steps 9
and 10 were recorded as they happened. All commands ran on 2026-10-19 under zsh on macOS, Node v26.8.1.

Subject: `/Volumes/SSD/code/kiln/imports/kiln-workbench-src/kiln-workbench/`, below called `$KW`. It was treated as
untrusted, read-only data. Nothing was installed, built or executed inside it. Tests ran only on an rsync copy at
`/Volumes/SSD/code/kiln-scratch/kiln-workbench` (on the SSD, not the boot disk), which was deleted at the end.

## Step 1: Orientation: inventory, memo, README, reference and guidelines

I started by measuring the snapshot and reading the three top-level text files, because `reference.txt` doubles as the
agent's API and as the user-facing language reference. Reading it first gave me the vocabulary (dialect, rule, pass,
fork, decide, evidence) used everywhere else.

I also skimmed the Kiln vs Perf Lab comparison memo sitting next to the import, to see which claims the parent task
cares about. Examples are the "10.5 G > 7.0 G" blowup figure and the evidence chain.

### What I did

- `find . -type f -not -path '*/node_modules/*'` plus `wc -l` over `README.md`, `reference.txt` and `agent-guidelines.txt` in `$KW`.
- `cat /Volumes/SSD/code/kiln/imports/Untitled.md | head -300` (the comparison memo).
- `nl -ba README.md && nl -ba reference.txt && nl -ba agent-guidelines.txt` in `$KW`.

### What worked

Line-numbered reads gave stable `file:line` anchors for the notes. `reference.txt` is well organised into 10
sections, and section 8 describes the six-IR pipeline in a single diagram.

### What didn't work

Nothing failed in this step.

### What I learned

- The workbench is self-describing. The same reference text is fed to the in-page agent.
- `README.md:63-73` lists exactly what the author verified: 169 lab links, 227 compiles, WGSL on SwiftShader, 79
  kernels through NVRTC + ptxas, and no physical-GPU timings. That gave me a checklist to reproduce.

### What warrants a second pair of eyes

The reference names two passes `kernel/materialize` and `gpu/emit`. I later found that the code calls them
`lowering/kernel` and `lowering/emit`. Anyone writing the intern guide from the reference alone will copy the wrong
names.

## Step 2: The framework core (`kiln.js`, `ix.js`, `script.js`, `util.js`)

`kiln.js` is 1132 lines and holds the entire compiler framework, so I read all of it in four line-numbered chunks.
Most of the analysis depends on its `Run` engine:

- the fixpoint driver with local resume;
- the decline memo keyed by node object;
- fork application with validate and guards;
- the decide policies, especially `evidence` with its "defer until the favourite is measured" rule.

### What I did

- `nl -ba kiln.js | sed -n 1,300p`, then `300,620p`, `620,900p` and `900,1132p` (in `$KW/app/src/core`).
- `nl -ba ix.js && nl -ba script.js && nl -ba util.js`.
- Later, re-read `kiln.js:538-600` (forks and decide) and `kiln.js:786-1075` (the engine) to write faithful
  pseudocode.

### What worked

The code is dense but regular. Every major claim in sections 1.x of the notes has a line anchor.

### What didn't work

Nothing failed in this step.

### What I learned

- Nodes are immutable. Declines are remembered in a `WeakSet` of `Node` objects per rule and reset per pass, so any
  change to a node automatically re-enables rules on it.
- `pinned()` only fires when every knob of a fork is pinned (`kiln.js:565`). Partial pins narrow the options, but the
  decision is still credited to the model.
- By-example rules (`.from().to()`) parse parameter names out of the lambda's source text (`kiln.js:646-651`).
- Scripts run through plain `new Function` (`script.js:21-39`). There is no sandbox.

### What warrants a second pair of eyes

`applyFork`'s `blocked` filter (`kiln.js:985-986`) uses `filter(...) || options`, which never falls back because an
empty array is truthy. I classified `blocked` as effectively dead because no caller passes `opts.blocked`. Please
confirm nothing outside `app/src` relies on it.

## Step 3: The std stack, codegen, simulator, devices, store and tune

I read every file in `app/src/std`. This is the GPU compiler proper:

- the `nn` and `tensor` dialects with reference semantics;
- the Loop IR with hash-consed expressions and LICM;
- fusion with the blowup guard;
- the tile schedule fork and its analytic cost model;
- kernel materialisation;
- the CUDA, WGSL and simulator emitters;
- the device, store and tune machinery.

### What I did

- `nl -ba index.js && nl -ba fns.js && nl -ba emmy.js`, then `nl -ba tensor.js`, `loop.js` (two chunks), `tile.js`
  (two chunks), `kernel.js` (two chunks), `emit.js`, `program.js`, `targets.js`, `store.js`, `devices.js` and
  `tune.js` (in `$KW/app/src/std`).
- Later re-reads during writing: `sed -n 131,200p src/std/tile.js` (launch geometry and `timeModel`),
  `nl -ba program.js | sed -n 28,42p` and `92,137p`, `nl -ba tile.js | sed -n 270,281p`, `nl -ba tune.js`, and
  `cut -c1-330 app/src/std/targets.js`.

### What worked

The time model is one function (`tile.js:152-194`), so I could transcribe it exactly into the notes as formulas.

### What didn't work

Nothing failed in this step.

### What I learned

- The simulator counts sectors, bank wavefronts, divergence and out-of-bounds accesses exactly. Its *time*, however,
  comes from the same `timeModel` that the analytic cost model uses, with the same 12%/60% DRAM heuristic
  (`program.js:122-128` vs `tile.js:277-280`). That explains why model and simulator agree so well (W-25: rho 0.99).
- Kernel identity hashes only the Loop IR expression and shapes (`program.js:37`). Codegen changes do not invalidate
  evidence.
- The fusion guard allows 2% extra work (`loop.js:342`).
- `tune()` gives rollouts a context without a store (`tune.js:45`), so evidence is inert during search. A comment says
  this is deliberate for the sweep.
- Every spec uses 48 KiB shared memory per block because the generated CUDA uses static `__shared__` arrays
  (`targets.js:1-4`).

### What warrants a second pair of eyes

The "simulator times are the model's formula" finding (W-1) is the most consequential conclusion in the notes. It is
directly visible in the code, but someone familiar with the original design intent should confirm it is understood as
a limitation and not a bug.

## Step 4: Agent, runtime glue (`wb.js`) and `main.jsx`

I read the agent in full and the non-visual parts of `wb.js`, to see how compile, measure and tune are wired and
where the model is called. Two greps failed because zsh expands `--include=*.js` as a glob; plain `grep -rn` over
directories fixed it.

### What I did

- `nl -ba agent.js | sed -n 1,200p`, `200,420p` and `420,594p` (in `$KW/app/src/agent`).
- `grep -rn "\.sample\b\|sample =" ui/ main.jsx agent/` to find where `wb.sample` is assigned.
- `nl -ba main.jsx`, plus `sed -n 35,60p ui/Agent.jsx`, for the tier and effort labels.
- `grep -n` over function heads in `wb.js`, then `nl -ba wb.js | sed -n 1,45p` and `100,322p`.
- During writing: `nl -ba agent.js | sed -n 100,145p`, `505,535p` and `237,266p`, plus
  `grep -n "__kiln\|window.claude..." main.jsx ui/*.js ui/*.jsx agent/*.js`.

### What worked

The agent's whole tool surface is one `AGENT_SCOPE` table (`agent.js:103-124`), which became the namespace table in
the notes.

### What didn't work

Command:

```text
cd /Volumes/SSD/code/kiln/imports/kiln-workbench-src/kiln-workbench/app/src && grep -n "sample" ui/wb.js | head -30; grep -rn "window.claude\|claude\.\|sampling\|modelTier" --include=*.js --include=*.jsx . | grep -v "docs.gen\|presets.gen" | head -30
```

Error:

```text
(eval):1: no matches found: --include=*.js
```

The same error came from:

```text
cd /Volumes/SSD/code/kiln/imports/kiln-workbench-src/kiln-workbench && grep -rn "blowup" --include=*.js --include=*.jsx --include=*.md app/src presets README.md | grep -v "docs.gen\|presets.gen" | head -20
```

Fix: drop `--include` and grep explicit directories:
`grep -rn "blowup" app/src/std app/src/ui app/src/core presets README.md`.

### What I learned

- The model is reached only through the host bridge (`window.claude.use("sample")`, `main.jsx:12-15`), with
  `cache: false` and a single `eval` tool.
- Read-only mode wraps the mutating API, but eval code still runs in page scope, and `window.__kiln` exposes the full
  workbench (`main.jsx:8`).
- `measure` remains callable in read-only mode; it just does not record.

### What warrants a second pair of eyes

Whether read-only mode is meant as a safety boundary or only as a UX convention. The notes treat it as a convention
(inferred).

## Step 5: Runner, build, tests and presets (reading)

I read the Python runner, the build script and every test file, then the headers and bodies of all 25 presets and
their notes' headings. The goal was to know what each test claims to prove before running anything.

### What I did

- `nl -ba kiln_runner.py | sed -n 1,200p` and `200,361p` (in `$KW/runner`).
- `nl -ba build.mjs && nl -ba package.json`, plus `head -c 1500 src/docs.gen.js` (in `$KW/app`).
- `nl -ba core.mjs stack1.mjs stack2.mjs stack3.mjs`, then `progs.mjs tune.mjs presets.mjs notes.mjs ...`, and a skim
  of `ui.mjs` (in `$KW/app/test`).
- A loop over `$KW/presets/W-*.js` printing headers and line counts. Full reads of W-01, W-05 and its `.md`, the
  bodies of W-02 to W-04 and W-06 to W-25, and the notes headings for every preset.
- `grep -rhn '^import .* from "[^.]' core std ...` and `node --version` (v26.8.1), to learn the runtime dependencies.
  Only `acorn` is needed headlessly.

### What worked

The tests are plain Node scripts with no framework, so each can run on its own once `acorn` resolves.

### What didn't work

Nothing failed in this step.

### What I learned

- `npm test` is a stub, and there is no CI configuration.
- The CUDA runner uses `nvcc`, a median of 50 back-to-back launches, warm L2 and no clock control.
- The same-origin check compares `Origin` with `http://{Host}`.

### What warrants a second pair of eyes

I inferred that the runner's origin check is bypassable via DNS rebinding (W-15). It is not tested. Someone with a
security focus should confirm it before the runner is recommended to interns.

## Step 6: Scratch copy and test runs

I copied the snapshot to the SSD scratch location and ran the headless tests there. `npm ci --offline` failed on an
uncached KaTeX tarball. KaTeX is only a UI dependency, so I installed `acorn@8` alone, offline, into a *separate*
scratch directory and copied it into the scratch app's `node_modules`.

### What I did

- Made the copy:

  ```text
  mkdir -p /Volumes/SSD/code/kiln-scratch && rsync -a --exclude dist /Volumes/SSD/code/kiln/imports/kiln-workbench-src/kiln-workbench/ /Volumes/SSD/code/kiln-scratch/kiln-workbench/
  ```

- Ran the tests in `/Volumes/SSD/code/kiln-scratch/kiln-workbench/app`, writing outputs to the session scratchpad:
  - `timeout 120 node test/core.mjs > $SP/core.out 2>&1`
  - `for t in stack1 stack2 stack3; do /usr/bin/time -p timeout 300 node test/$t.mjs > $SP/$t.out 2>&1; done`
  - `for t in progs tune; do /usr/bin/time -p timeout 300 node test/$t.mjs > $SP/$t.out 2>&1; done`
- Tried the full install: `timeout 120 npm ci --offline --ignore-scripts --no-audit --no-fund` (failed, below).
- Confirmed acorn was in the npm cache: `grep -rl "registry.npmjs.org/acorn/-/acorn-8" ~/.npm/_cacache/index-v5`.
- Installed acorn alone:

  ```text
  mkdir -p /Volumes/SSD/code/kiln-scratch/acorn-only && cd /Volumes/SSD/code/kiln-scratch/acorn-only && echo '{"name":"x","version":"1.0.0","type":"module"}' > package.json && timeout 120 npm install acorn@8 --offline --ignore-scripts --no-audit --no-fund
  ```

  Output: `added 1 package in 289ms`, version `8.18.0`. It was copied into the scratch app's `node_modules`.
- Ran the remaining tests:
  - `/usr/bin/time -p timeout 900 node test/presets.mjs`
  - `/usr/bin/time -p timeout 900 node test/notes.mjs`
  - `/usr/bin/time -p timeout 1500 node test/param-sweep.mjs`
- Checked the shipped generated modules against their sources with a scratch script (`checkgen.mjs`): presets 25/25
  match, 0 differences.

### What worked

| Test | Result | Time |
| --- | --- | --- |
| core | exit 0 | 0.1 s |
| stack1 | exit 0 | 0.10 s |
| stack2 | exit 0 | 0.70 s |
| stack3 | exit 0 | 0.26 s |
| progs | exit 0 | 0.34 s |
| tune | exit 0; greedy, sweep and SP-MCTS all 10.6 µs | 1.42 s |
| presets | "all presets pass" (25/25; 10 report `e2e skipped`) | 7.39 s |
| notes | "all notes pass (169 lab links)" | 3.08 s |
| param-sweep | "all 227 compiles pass" | 55.2 s |

### What didn't work

Command (in `/Volumes/SSD/code/kiln-scratch/kiln-workbench/app`):

```text
timeout 120 npm ci --offline --ignore-scripts --no-audit --no-fund 2>&1 | tail -5; ls node_modules 2>/dev/null | head
```

Error:

```text
npm error code ENOTCACHED
npm error request to https://registry.npmjs.org/katex/-/katex-0.16.9.tgz failed: cache mode is 'only-if-cached' but no cached response is available.
npm error A complete log of this run can be found in: /Users/manuel.odendahl/.npm/_logs/2026-10-19T17_40_05_580Z-debug-0.log
```

Not attempted, because they need tools this machine lacks:

- `ui.mjs` (Playwright and Chromium);
- the WebGPU-all run;
- `export-cuda.mjs` with `cuda_check.py` (NVRTC and ptxas);
- the CUDA runner (no NVIDIA GPU).

### What I learned

- Every headless claim in the README that can be checked offline reproduces: 169 lab links and 227 compiles.
- Node prints `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided` in
  the preset, notes and sweep tests. It is harmless here.

### What warrants a second pair of eyes

The test environment used acorn 8.18.0, while the lockfile pins 8.19.0. It is unlikely to matter for a syntax check,
but it is a deviation. The UI and CUDA paths remain unverified by me.

## Step 7: Capturing artifacts (IR, CUDA, WGSL, decisions, W-09 declines, W-05 evidence round trip)

To give the intern guide real examples instead of paraphrase, I wrote small driver scripts in the session scratchpad.
They import the *scratch copy's* modules and print:

- the pipeline description;
- each IR level for RMSNorm `[64, 256]`;
- the kernel IR, CUDA and WGSL;
- a decision record;
- pass statistics;
- W-09's declined fusion steps;
- a W-05 measure-then-recompile round trip.

### What I did

- `$SP/artifacts.mjs`: RMSNorm through `std.emmy.pipeline` on rtx5090 with pins `MAP=row, TPB=64, STAGE=none`.
  Re-run during writing as `node $SP/artifacts.mjs /Volumes/SSD/code/kiln-scratch/kiln-workbench`, which exited 0,
  to quote the CUDA and WGSL byte-exactly.
- `$SP/loopir.mjs`: prints the Loop IR and Tile IR with bodies, the decision's `by`, `size` and `knobs`, and the
  rewrite sequence.
- `$SP/w09.mjs`: W-09 at defaults (declines, kernels) and the W-05 evidence round trip on `sim:rtx5090`.

### What worked

Captured facts used in the notes:

- `irOrder` sizes `[3, 15, 3, 3, 3, 3]`;
- rewrites per pass d1 o2 l9 f8 s1 t1 k1 c1 (24 in total);
- the decision has `size: 1, by: "model"` despite three pins;
- W-09 declines such as `#30 loop/fusion/merge_loop_ops @n49: blowup: fused work 10,472,128,512 > unfused 7,001,866,240`;
- W-05 measured 24.27 µs (dram-bound, occupancy 0.667, 7 waves), after which the decision flips to `by: "evidence"`.

### What didn't work

Nothing failed in this step.

### What I learned

- The emitted CUDA's argument order follows the node's args (weight first, then `x`), not the frontend signature.
- The tree reduction is six `if (tid < s)` steps, each followed by `__syncthreads()`, with no warp shuffles.

### What warrants a second pair of eyes

Nothing specific. The artifacts are reproducible with the scripts above from any copy of the snapshot.

## Step 8: Preset notes: W-25, W-24 and W-17 specifics

I read the specific notes sections that quantify the model's accuracy and its limits: W-25's "What you should see"
and "Why they disagree", and W-24's "Why the H100 looks bad". I also read the head of W-17 (the regex compiler) to
describe the non-ML pipeline accurately. The first attempt failed on a zsh quirk with `echo =====`.

### What I did

- Ran `sed -n '/## What you should see/,/## /p' W-25-model-vs-measurement.md`, the W-24 `## Why the H100` range and
  `sed -n 6,40p W-17-regex.js` (in `$KW/presets`).
- Retried with `sed -n '/### Why they disagree/,/## Autotuning/p' W-25-model-vs-measurement.md` and different
  separators.

### What worked

W-25's notes give the quantitative self-assessment that the notes quote:

- rho about 0.99 over all 27 softmax options;
- regret 1.19x (99.5 µs vs 83.3 µs);
- rho about 0.92 for the 12 row schedules alone.

They also state that model and simulator share `timeModel`.

### What didn't work

Command:

```text
cd /Volumes/SSD/code/kiln/imports/kiln-workbench-src/kiln-workbench/presets && sed -n '/## What you should see/,/## /p' W-25-model-vs-measurement.md | head -30; echo ======; sed -n '/## Why the H100/,/## The system/p' W-24-five-gpus.md | head -20; echo =====; sed -n 6,40p W-17-regex.js
```

Error (exit code 1, after the first sections printed):

```text
(eval):1: ===== not found
```

Cause: zsh `=word` expansion treats a leading `=` as "path of command `word`". Fix: use a separator that does not
start with `=`.

### What I learned

- The author is explicit about the simulator's limits in the tutorial text. The code matches the notes.
- FlashAttention and Welford-style variance are acknowledged as inexpressible (W-10 and W-22 notes).

### What warrants a second pair of eyes

Nothing beyond step 3's W-1 point.

## Step 9: Writing the notes, verification pass, length trimming

I wrote `03-kiln-compiler-runtime-notes.md` with the 10 requested sections plus an orientation section and a short
"verify before building" list. Before writing I re-read the engine (`kiln.js:538-600`, `786-1075`), `emmy.js`,
`merge_loop_ops`, the full `reference.txt` and the agent scope, so the pseudocode and API tables are faithful.

After the first draft I spot-checked claims I had not re-verified. Three needed correcting:

- W-21 uses a `decide.cost` ladder, not an `exactly`-style policy.
- W-19 is a transformer epilogue with a `fuse` bool.
- `blocked` is reachable through `run(graph, { blocked })` (`kiln.js:752`), although nothing passes it.

The first draft was 1803 lines against an 800-1500 target, so I folded short bullet lists into prose, elided four
identical reduction steps from the CUDA listing, replaced the duplicate kernel IR dump with a mapping paragraph, and
rewrote section 10 compactly. The result is about 1600 lines.

### What I did

- Read the presets: `cat -n presets/W-05-rmsnorm.js` and `cat -n presets/W-01-hello-dialect.js` from `$KW` (retry at
  the right path, below).
- Spot-checks:
  - `cut -c1-330 app/src/std/targets.js`;
  - `grep -rn "blocked" app/src/core app/src/std app/src/ui app/src/agent`;
  - the W-21 and W-19 preset bodies;
  - `grep -n "subprocess\|Popen\|nvidia-smi\|clock\|L2\|flush\|WARM" runner/kiln_runner.py`;
  - `grep -n "keep original\|keepOriginal\|UNROLL" test/core.mjs` and `nl -ba src/core/kiln.js | sed -n 513,536p`.
- Trimming: Edit-tool replacements, plus a `python3 -I` script that swapped section 10 for a compact version drafted
  in `/Volumes/SSD/code/kiln-scratch/edit/sec10.md`.
- Checks: `wc -l`, `head -1` (the H1 is present), and `grep -c '^```'` (50, balanced fences).

### What worked

The verification pass caught three factual slips before handoff. The runner check also confirmed one process per
kernel request via `subprocess.run` (`kiln_runner.py:178`, `:204`) and no `nvidia-smi` calls.

### What didn't work

Command:

```text
cd /Volumes/SSD/code/kiln/imports/kiln-workbench-src/kiln-workbench/app && wc -l presets/W-05-rmsnorm.js presets/W-01-hello-dialect.js && cat -n presets/W-05-rmsnorm.js && echo ---- && cat -n presets/W-01-hello-dialect.js
```

Error:

```text
wc: presets/W-05-rmsnorm.js: open: No such file or directory
wc: presets/W-01-hello-dialect.js: open: No such file or directory
       0 total
```

Cause: presets live at `$KW/presets`, not `$KW/app/presets`. An earlier `ls presets | head -60` from `$KW/app` had
also printed `ls: presets: No such file or directory`. Fix: run from `$KW`.

Command (inspecting line structure of the written notes):

```text
sed -n 1,40p "$F" | cat -A | cut -c1-120 | head -40
```

Error:

```text
cat: illegal option -- A
usage: cat [-belnstuv] [file ...]
```

Cause: BSD `cat` has no `-A`. I inspected with plain `sed -n 1,60p` instead. The file was fine; it was simply longer
than estimated.

### What I learned

- `keepOriginal` collides with pins when `off` is a legal value: `core.mjs` pins `UNROLL=1` (= `off`) and gets the
  1-term expansion, not the original. The test prints this without asserting it. It is recorded as W-8.
- `WEBGPU_DEFAULT` has its own L2, per-SM and per-block limits. I corrected the notes to list them.

### What warrants a second pair of eyes

- The notes are about 1600 lines, slightly above the 1500 guidance. The overrun is mostly verbatim listings (CUDA,
  WGSL, the W-05 and W-01 presets, IR dumps) that the guide may want to quote.
- The `phase: "run"` param semantics in the UI (`wb.js:190`) were not traced in depth. The notes flag this as not
  re-verified.

## Step 10: Cleanup

I deleted every scratch item I had created on the SSD. Before deleting, I listed the directory to make sure it held
only my own items, because other agents might use the same scratch root. The session scratchpad on the boot disk
keeps only small driver scripts and test outputs (each under 4 KB) as evidence for steps 6 and 7.

### What I did

- `ls -la /Volumes/SSD/code/kiln-scratch/`, which showed `acorn-only`, `artifacts.out`, `edit` and `kiln-workbench`
  (all mine), plus `du -sh` (about 3 MB in total).
- Deleted them:

  ```text
  rm -rf /Volumes/SSD/code/kiln-scratch/kiln-workbench /Volumes/SSD/code/kiln-scratch/acorn-only /Volumes/SSD/code/kiln-scratch/edit /Volumes/SSD/code/kiln-scratch/artifacts.out && rmdir /Volumes/SSD/code/kiln-scratch
  ```

### What worked

The removal succeeded. A follow-up `ls /Volumes/SSD/code/kiln-scratch` reported `No such file or directory`; that
expected failure is why the combined command exited 1.

### What didn't work

Nothing failed, apart from the intended `ls` of the deleted directory.

### What I learned

Nothing new.

### What warrants a second pair of eyes

Nothing was written to the imports directory or committed. The only files created in the ticket workspace are
`sources/03-kiln-compiler-runtime-notes.md` and this diary.
