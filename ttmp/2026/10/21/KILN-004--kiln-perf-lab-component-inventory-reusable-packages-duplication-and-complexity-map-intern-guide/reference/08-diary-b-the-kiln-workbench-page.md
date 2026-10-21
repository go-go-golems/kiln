---
Title: 'Diary B: the Kiln workbench page'
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
Summary: 'Investigation diary of inventory area B (apps/workbench and the repo scripts that serve it): how the inventory in reference/03 was gathered, which claims were re-verified, the duplication diffs, and the dead ends.'
LastUpdated: 2026-10-21T12:00:00-04:00
WhatFor: 'Tracing a claim in reference/03-inventory-notes-b-the-kiln-workbench-page.md back to the command or read that produced it, and resuming area B.'
WhenToUse: 'When a workbench claim in the notes or the intern guide is doubted, or before extending the area B inventory.'
---

# Diary B: the Kiln workbench page

This diary covers inventory area B of KILN-004: `apps/workbench/` (`@kiln/workbench`) and the repo-level
`scripts/` that build, shoot and check it. The deliverable it supports is
`reference/03-inventory-notes-b-the-kiln-workbench-page.md` (the notes); section numbers below (§n) refer to the
notes. The ticket's main diary is `reference/01-investigation-diary.md`.

## Step 1: Inventory of the workbench page, gathered and written up (written after the fact)

This step is written after the fact. It covers the whole first pass: reading every source file of
`apps/workbench/`, its build script, presets, docs and tests, the five repo scripts, and the Perf Lab
counterparts in `lab-workbench/src` needed for the duplication map, then writing the notes. The pass ran
read-only against `/Volumes/SSD/code/kiln` at commit `4d9adc2` (nothing built, installed or run there). The
session's context was compacted once in the middle of the reading; the reads before that point survive only as a
summary, so the commands listed for that part are the shape of what was run, not a verbatim log.

The outcome is a 741-line notes file, first in the agent's scratchpad and now moved into the ticket at
`reference/03-…`, with 15 sections: file map, build pipeline, architecture, endpoints and runners, views, presets,
agent, tests, scripts, duplication, hotspots, extraction candidates, dead code, cross-cutting observations and
open questions. Every claim is marked `[obs]` (seen at the cited line) or `[inf]` (inferred).

### Prompt Context

**User prompt (verbatim):** see `01-investigation-diary.md`, Step 1
([link](01-investigation-diary.md#step-1-locating-the-system-and-opening-the-ticket)).

**User instruction relayed mid-task (verbatim, passed on by the orchestrator):**

> Tell each agent btw commit at appropriate intervals and keep a detailed diary as you work (using the diary format
> from the skill).

**Orchestrator's assignment (summary, not a user quote):** build a detailed component inventory, not a code review,
of `apps/workbench/` plus `scripts/{shoot,shoot-views,specimen,contrast,css-usage}.mjs`: build.mjs and the
`.gen.js` outputs, `src/ui` (wb.js, views, CSS, `lab/`), `src/agent`, presets, docs, tests, tokens CSS, server
endpoints called, runners. Identify (a) UI architecture, (b) every view type and the data it consumes,
(c) duplication with `lab-workbench/src` with file:line evidence, (d) complexity hotspots, (e) extraction candidates
and coupling, (f) dead or vestigial code; distinguish observed from inferred. The repository was read-only; the
later instruction above narrows that to two writable, committable files (the notes and this diary), committed with
pathspec form only.

**Assistant interpretation:** produce an evidence-cited inventory of the page, then move it into the ticket and
keep this diary, committing only the two assigned paths.

**Inferred user intent:** know which parts of the workbench page are separable and which duplicate Perf Lab, so the
Kiln and Perf Lab integration can be tightened or split again.

**Commit (code):** none; this step's commit carries only the notes and this diary (hash recorded in Step 2).

### What I did

- Read the package shape: `apps/workbench/package.json` (deps, scripts, the `test` skip list), `.gitignore:5`
  (`dist/`), the repo README and `runner/kiln_runner.py` (to check the README's `serve` claim).
- Read `apps/workbench/build.mjs` end to end (71 lines): header parsing (l.16-20), presets (l.21-30), lab programs
  validated against `packages/lab/src/presets.ts` (l.31-39), docs (l.40), worker bundle (l.41-43), main bundle
  (l.47-51), CSS order (l.55), the two HTML outputs (l.67-69).
- Sized every file: `wc -l` over `src/**/*.{js,jsx,css}`, `docs/*.txt`, `test/*`, `dist/*.html`.
- Read every UI module under `src/ui/` (wb.js, dock.js, Dock.jsx, views.jsx, App.jsx, common.jsx, marks.jsx,
  Ide.jsx, Notes.jsx, Compiler.jsx, Kernels.jsx, Perf.jsx, Knobs.jsx, Evidence.jsx, Hypotheses.jsx, Jobs.jsx,
  Events.jsx, Agent.jsx, server-client.js, server-sync.js, doc.js, md.js, highlight.js, links.js, compile.js) and
  the `lab/` subfolder (state.js, api.js, board.jsx, panels.jsx, charts.jsx, media.jsx, inspect.jsx, LabView.jsx,
  InspectView.jsx, params.jsx, format.js, lab.css), plus `tokens.css` and the other stylesheets.
- Read the agent: `agent/agent.js`, `sandbox.js`, `frame.js`, `encode.js`, `gateway.js`, `inspect.js`,
  `worker-main.js`, and the server relay `apps/server/src/agent.ts` with `apps/server/src/config.ts`.
- Read the tests in `apps/workbench/test/` and `scripts/run-node-tests.mjs`, and the five repo scripts plus
  `kiln-export.mjs`.
- Read the Perf Lab counterparts: `lab-workbench/package.json`, `features/agent/runtime.ts`, `app/store.ts`,
  `styles/tokens.css`, the `components/organisms/views/*` files the Kiln `lab/` files name as their origin.
- After the compaction, the commands below (exact) confirmed the dead-export and duplicated-helper claims, sized
  the Perf Lab counterparts, and found the lab-language fork:

```bash
# preset headers and which presets declare hypotheses in code
cd /Volumes/SSD/code/kiln/apps/workbench/presets && for f in *.js; do head -5 $f | tr '\n' ' ' | sed 's/  */ /g' | cut -c1-200; echo; done; ls *.md | wc -l; grep -l "hypothesis" *.js
#   27 headers W-01..W-26, W-28 (no W-27); 27 .md; hypothesis in W-05, W-19, W-25

# who imports the common.jsx exports
cd /Volumes/SSD/code/kiln/apps/workbench/src && for s in useStateRef useInterval useFrame stateLabel isBad Pill Meter; do echo "== $s"; grep -rnw "$s" . | grep -v "^./ui/common.jsx" | grep -v "\.gen\.js" | head -4; done
#   useStateRef, useInterval, useFrame, stateLabel, isBad: no hit outside common.jsx
#   Pill: App.jsx:3,98,99   Meter: Perf.jsx:3,92,109

# duplicated helpers
grep -rnE "(function|const) (plural|when|Empty)\b|VERDICT[A-Z_]* *=" . | grep -v "\.gen\.js"
#   plural: Hypotheses.jsx:7, Jobs.jsx:6, Evidence.jsx:11, marks.jsx:12, lab/LabView.jsx:95
#   when:   Jobs.jsx:7, Evidence.jsx:10      Empty: common.jsx:92, lab/panels.jsx:24, lab/inspect.jsx:12
#   VERDICT: Hypotheses.jsx:50, Jobs.jsx:108, lab/panels.jsx:227, lab/LabView.jsx:12

# Perf Lab counterpart sizes
cd /Volumes/SSD/code/kiln/lab-workbench/src && find . -name "*.ts" -o -name "*.tsx" -o -name "*.css" | grep -E "View|ParamBar|params|format|board-context|ViewRenderer|LabTab|PlanTab|RunsTab|InspectTab|Inspector|AgentRail|TranscriptLibrary|runtime|tokens|store" | xargs wc -l | sort -k2

# the language fork under the two lab UIs
cd /Volumes/SSD/code/kiln && for f in algo build builders compare detections env ir library params query refs rows runtime stats util values; do a=lab-workbench/src/lang/$f.ts; b=packages/lab/src/lang/$f.ts; n=$(diff $a $b | grep -c '^[<>]'); echo "$f $(wc -l <$a) $(wc -l <$b) difflines=$n"; done
#   all 16 differ; e.g. build 1030/1036 (38), values 89/113 (156), stats 122/168 (126), refs 57/57 (2)
```

- Wrote the notes to the scratchpad, fixed five section cross-references with `sed`, prepended the docmgr
  frontmatter with Summary/WhatFor/WhenToUse filled, and wrote the result to `reference/03-…` (764 lines).

### Why

- Reading every UI file rather than sampling: the brief asks for "every view type and the data it consumes", and
  the view registry (`views.jsx:23-42`) only names components; the data each reads is in the component bodies.
- Reading the Perf Lab counterparts only where a Kiln file names one: area D owns Perf Lab as a whole, so this
  area reads it just far enough to put a file:line on each duplication claim.
- The lab-language diff is outside area B (it belongs to `packages/lab`, area D), but it decides whether the Kiln
  and Perf Lab board renderers can show the same board identically, so it is recorded in §10.1 with a pointer.

### What worked

- The Kiln `lab/` files state their origin in their first line (`charts.jsx:1`, `inspect.jsx:1`, `media.jsx:1`,
  `format.js:1`, `params.jsx:1`, `panels.jsx:1`, `InspectView.jsx:1`), which made the port map in §10.1 exact
  instead of guessed.
- `grep -rnw` over `src/` with the `.gen.js` files excluded gave a clean dead-export answer for `common.jsx`.

### What didn't work

- The first two verification commands after the compaction used `--include=*.js` unquoted. zsh expanded the glob
  and refused the command before grep ran:

  ```text
  (eval):1: no matches found: --include=*.js
  ```

  Recovery: drop `--include` and filter `.gen.js` out with `grep -v` instead.
- `echo =====` as a separator in a compound command failed the same way (zsh `=word` expansion):

  ```text
  (eval):1: ===== not found
  ```

  Recovery: use `echo "-----"`.
- Pre-compaction failures, if any, are not recoverable verbatim from the summary and are not reconstructed here.

### What I learned

- The workbench has two singleton stores, not one: `wb` (`wb.js:26-505`) and `labs` (`lab/state.js:16-210`),
  and `labs` publishes on `wb`'s `"lab"` channel rather than owning one.
- The Kiln lab UI does not render the same language as Perf Lab: it consumes `@kiln/lab` (`lab/api.js:5`), whose
  `src/lang` is a diverged fork of `lab-workbench/src/lang`.
- The agent cannot reach the Perf Lab half of the page: `makeAgentScope` (`agent.js:357-537`) has no `lab`
  namespace.
- `Jobs.jsx:229` "(Runs view)" is not a reference to a dead view id but stale wording: `Runs` is a section inside
  the Lab view (`LabView.jsx:29,193`).

### What was tricky to build

- Three of the four `VERDICT` maps describe the same hypothesis verdicts in three shapes (object, object with
  `why`, tuple); the fourth (`Jobs.jsx:108`) shares the name but maps planner verdicts. Grepping for the name alone
  overstates the duplication; the notes separate them.
- The word "lab" has three meanings in this app (`useLab` over `wb`, the `labs` store, the `lab:` link scheme),
  so every grep for "lab" needed reading, not counting.

### What warrants a second pair of eyes

- Line references taken before the compaction (for example `wb.js:154-188`, `wb.js:319-466`, `agent.js:114,120`,
  `gateway.js:19,33`, `tokens.css:24-39`, `contrast.mjs:12`, `Kernels.jsx:10-15`, `App.jsx:49-55,109`) come from
  the summary, not from a read in this half of the session. Step 2 re-verifies them.
- §10.1 says `charts.jsx` re-declares Perf Lab's `SHAPES`, `OUTCOME_SHAPE` and `TICK_CHAR_PX`; that came from
  the pre-compaction read and should be diffed.

### What should be done in the future

- Re-verify the pre-compaction line references (Step 2).
- Confirm the headline duplication findings with diffs rather than reads (Step 3).

### Code review instructions

- Start at §10 (duplication) and §13 (dead code) in `reference/03-…`; each row cites a file:line under
  `/Volumes/SSD/code/kiln/apps/workbench/src/` or `lab-workbench/src/`.
- Spot-check with `sed -n '<line>p' <file>` at the cited lines; re-run the grep blocks above to reproduce the
  dead-export and helper-duplication tables.

### Technical details

- Repository: `/Volumes/SSD/code/kiln`, branch `main`, read at `4d9adc2`; ticket commits `4dbf767` and `f8bc5d4`
  were already on top when this diary started.
- Notes source: scratchpad `notes-B-workbench-ui.md` (741 lines) → ticket `reference/03-…` (764 lines with
  frontmatter).
