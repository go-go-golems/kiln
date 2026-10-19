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
