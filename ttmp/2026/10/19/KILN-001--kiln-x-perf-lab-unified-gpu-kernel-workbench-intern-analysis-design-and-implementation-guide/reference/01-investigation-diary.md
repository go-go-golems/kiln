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
RelatedFiles: []
ExternalSources: []
Summary: "Chronological diary for KILN-001: repository creation, analysis of Kiln and Perf Lab, the intern guide, and the implementation of the unified workbench."
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
