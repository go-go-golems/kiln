---
Title: Investigation diary
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
Summary: 'Investigation diary of KILN-004: how the system on port 5380 was located, how the inventory was split and gathered, and the evidence behind the guide.'
LastUpdated: 2026-10-21T10:30:00-04:00
WhatFor: Resuming KILN-004; checking where an inventory claim in the guide came from.
WhenToUse: Before acting on the separation plan in the guide, or when a claim in it needs its evidence.
---

# Investigation diary

This diary records KILN-004 in investigation format: one numbered step per milestone, each opening with what was
intended and what came out, then the prompt context, the work and what a reviewer should check. The guide is
`design-doc/01-intern-guide-the-kiln-perf-lab-system-its-components-and-how-to-separate-them-again.md`; section
numbers below (§n) refer to it.

## Step 1: Locating the system and opening the ticket

The user asked for an inventory of "the thing running on 5380", without remembering whether the work lived in an
`ml-perf` branch of Playback or in a `kiln` worktree. The process listening on `127.0.0.1:5380` answered that: it is
`node src/index.ts`, PID 22866, started 2026-10-20 23:46, with its working directory at
`/Volumes/SSD/code/kiln/apps/server`. So the system is the standalone **kiln** repository (branch `main`, commit
`4d9adc2`, 66 commits), not a Playback worktree. Perf Lab entered that repository as a verbatim copy of Playback's
ML-PERF-001 `experiments/lab-workbench` at Playback commit `cdb84891c`, which is the commit this Playback worktree
(`docs/ml-perf-001-perf-explorer`) is on.

The kiln repository has its own docmgr root (`.ttmp.yaml` → `ttmp/`) with KILN-001, KILN-002 and KILN-003, so the
new ticket was created there as KILN-004, beside its predecessors, rather than in Playback.

### Prompt Context

**User prompt (verbatim, 2026-10-21):**

> Create a new docmgr ticket to analyze the work done on kiln and perf lab in the ml-perf or kiln branch / worktree?
> Don't remember where we worked on, but it's the thing running on 5380.
>
> I want to analyze to see what components have been built that are reasonably independent and can be repackaged /
> reused as we put the pieces back together, as the whole perf lab + kiln integration is a bit complex and might make
> sense to clarify and maybe separpate again (now that they are linked).
>
> First, analyze ❯ Create a new ticket using docmgr in order Analyze this codebase and make a detailed map of its
> components, its libraries / components that could be packaged and reused, of its functionalities. It should be an
> indepth analyze, not so much a review as an inventory and figuring out where complexity lies, what is duplicated
> across multiple services, basically how we can tighten up the setup now that we have so much functionality, across
> backend, jobs, compiler stuff, perf measurement stuff, backends, frontend, report views, UI, agents, etc...
>
> Create a detailed analysis / design / implementation guide that is for a new intern, explaining all the parts of
> the system needed to understand what it is, with prose paragraphs and bullet points and pseudocode and diagrams and
> api references and file references. It should be very clear and technical. Store in the ticket and upload to
> remarkable.
>
> Use svg and mermaid diagrams as needed, codesnippets, etc...

**Interpretation:** analysis only. No code in the kiln repository is to be changed; the deliverable is the guide,
this diary and the reMarkable upload.

### What was done

```bash
lsof -nP -iTCP:5380 -sTCP:LISTEN          # node, PID 22866, 127.0.0.1:5380
ps -o pid,ppid,lstart,command -p 22866    # node src/index.ts, started Tue Oct 20 23:46:14 2026
lsof -p 22866 | grep cwd                  # /Volumes/SSD/code/kiln/apps/server
git -C /Users/manuel.odendahl/code/tulip/playback worktree list
#   … /Volumes/SSD/code/playback-kiln-002  [perf/kiln-002-redaction-mask-post]  (the Playback side of KILN-002)
git -C /Volumes/SSD/code/kiln log --oneline | wc -l   # 66
docmgr ticket create-ticket --ticket KILN-004 --title "…" --topics kiln,perf-lab,compiler,backend,frontend,evidence,workbench-ui
docmgr doc add --ticket KILN-004 --doc-type design-doc --title "Intern guide: …"
docmgr doc add --ticket KILN-004 --doc-type reference --title "Investigation diary"
```

A first sizing pass (`git ls-files`, `wc -l`, the `package.json` of every workspace package) gave the shape the
inventory was split along: about 56 000 lines of tracked code outside `ttmp/` and `imports/`, in four library
packages (`@kiln/kiln`, `@kiln/lab`, `@kiln/exec`, `@kiln/evidence`) and two apps (`@kiln/server`,
`@kiln/workbench`), a separate pnpm root (`lab-workbench/`), Python runtime and runner code, and the imported
original Kiln source. Two facts from this pass shaped everything after it:

- `lab-workbench/` imports nothing from `@kiln/*`; it is a standalone copy. `packages/lab/src/lang/*` has files of
  nearly the same length as `lab-workbench/src/lang/*` (`build.ts` 1036 vs 1030 lines, `builders.ts` 463 vs 451,
  `rows.ts` 368 vs 350), which marks it as a fork, not a move.
- The two front ends sit on different stacks: `@kiln/workbench` on React 18.3, esbuild and KaTeX; `lab-workbench`
  on React 19.3, Vite, Redux Toolkit, React Router and MathJax, with TypeScript 5.9 against the workspace's 7.0.

### Review

- Confirm the listener is still the kiln server before relying on live GETs against it (`lsof -iTCP:5380`).
- Commits the inventory describes: kiln `4d9adc2`, Playback worktree `cdb84891c`.

## Step 2: Splitting the inventory into five areas, and one diary per area

The codebase was split along its package boundaries into five inventory areas, each given to a separate agent so that
each could read its area deeply instead of skimming everything: **A** the compiler, runtime launchers and CUDA
runner (`packages/kiln`, `imports/kiln-workbench-src`, `runtime/`, `runner/`); **B** the Kiln workbench page
(`apps/workbench`, `scripts/`); **C** the server, execution core and evidence (`apps/server`, `packages/exec`,
`packages/evidence`); **D** Perf Lab and its extracted language (`lab-workbench/`, `packages/lab`); **E** the design
history in KILN-001..003 and ML-PERF-001..003. While they ran, the test suites of both pnpm roots were run as a
baseline. Then the user asked for each agent to commit as it goes and keep its own detailed diary. Each agent got two
pre-created, tracked documents in this ticket (`reference/02`–`06` notes, `reference/07`–`11` diaries), and commits
them alone with pathspec commits, so that five concurrent writers never touch the same file or race on the index.

### Prompt Context

**User prompt (verbatim, 2026-10-21):** "Tell each agent btw commit at appropriate intervals and keep a detailed diary
as you work (using the diary format from the skill)."

**Assistant interpretation:** each inventory agent keeps an investigation-format diary of its own work and commits its
notes and diary at milestones; the per-area notes become ticket documents instead of scratch files.

**Commit:** `4dbf767` — "KILN-004: ticket for the Kiln × Perf Lab component inventory; diary step 1"

### What I did

- Baseline tests, both pnpm roots, at kiln `4d9adc2`:

  ```text
  pnpm test (workspace root)            exit 0, 55 s wall
    packages/evidence   vitest  9 files  133 tests passed
    packages/exec       vitest  1 file    21 tests passed
    packages/kiln       run-node-tests.mjs  13 suites passed
    packages/lab        vitest  8 files  100 tests passed
    apps/server         vitest  9 files   79 tests passed (32 s; the slow package)
    apps/workbench      run-node-tests.mjs   5 suites passed; 8 browser/GPU suites skipped by the script
                        (ui, export-cuda, param-sweep, webgpu, paired-webgpu, server-e2e, agent-e2e, lab-e2e)
  cd lab-workbench && pnpm test         exit 0, 11 files 104 tests passed (vitest 4)
  ```

- Created ten reference documents with `docmgr doc add` (sequentially, so their numeric prefixes could not collide)
  and committed the skeleton before any agent wrote to it, so every agent's file is tracked and
  `git commit -- <two paths>` needs no `git add`.

### Why

- One diary per agent rather than a shared one: five agents appending to one file would interleave and conflict.
  This diary keeps the orchestration steps; the area diaries keep the evidence of each inventory.
- Pathspec commits (`git commit -- <paths>`) commit only the named files from a temporary index, so one agent's
  commit cannot pick up another's half-written file.

### What didn't work

- Nothing failed. A first cross-package import grep was mangled by zsh treating `--include=*.ts` as a glob
  (`(eval):1: no matches found: --include=*.ts`); the `git ls-files | xargs grep` form was used instead.

### Code review instructions

- `git log --format='%h %s' 4dbf767..` lists the agents' commits; each touches two files under `reference/`.
