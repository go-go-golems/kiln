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
