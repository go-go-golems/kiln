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

## Step 2: Re-verifying the line references carried across the context compaction

Step 1 left a list of line references that came from the pre-compaction summary rather than from a read. This step
re-read every one of them with `sed -n` at the cited lines. Most held. Four did not, and the notes are corrected:
three files were placed under the wrong directory, the `.gitignore` reference named a file that does not exist, and
the "compile sequence written twice" finding was overstated in one direction and understated in another. Three new
findings came out of the re-reads (a stale comment in the agent frame, the misplaced home of `saveText`, and the
condition under which the server relay is used at all).

### Prompt Context

**User prompt (verbatim):** see Step 1 (which links the original request in `01-investigation-diary.md`).

**Assistant interpretation:** make the notes trustworthy before they are loaded into the inventory database; a wrong
path there becomes a dead link in the site.

**Inferred user intent:** every claim in the inventory traceable to a line that says what the claim says.

**Commit (code):** none (inventory only).

**Previous commit:** 48f2151 — "KILN-004 B: workbench page inventory notes; diary step 1".

### What I did

- Re-read each reference with a small shell function, `p(){ echo "--- $1:$2"; sed -n "$2p" "$1" | cut -c1-230; }`,
  over `apps/workbench/src/ui/wb.js` (1-2, 21-26, 51-53, 68-70, 75-77, 154-188, 226-233, 319-321, 464-466,
  505-506), `apps/workbench/src/ui/common.jsx` (7-12), `apps/workbench/src/agent/agent.js` (102-104, 112-122,
  357-358, 535-538), `apps/workbench/src/agent/gateway.js` (17-35), `apps/workbench/src/ui/tokens.css` (22-40),
  `scripts/contrast.mjs` (10-14), `apps/workbench/src/ui/Kernels.jsx` (9-16), `apps/workbench/src/ui/App.jsx`
  (11-18, 48-56, 109), `apps/workbench/build.mjs` (16-17, 31-33, 40-43, 55, 67-69), `apps/workbench/src/main.jsx`
  (15, 24, 31), `apps/workbench/src/ui/dock.js` (6-11, 17-22), `apps/workbench/src/ui/views.jsx` (23-24, 45-50),
  `apps/workbench/src/ui/Dock.jsx` (11-12, 298-300), `apps/workbench/src/ui/Jobs.jsx` (197),
  `apps/workbench/src/ui/lab/api.js` (19), `packages/kiln/src/std/devices.js` (297, 306-308),
  `apps/workbench/src/ui/lab/board.jsx` (62-66), `scripts/specimen.mjs` (10), `apps/workbench/test/ui.mjs` (4, 36),
  `apps/workbench/src/ui/Ide.jsx` (77-85), `apps/server/src/agent.ts` (252-253), `apps/server/src/config.ts`
  (35, 59-61), `packages/lab/src/lang/hypothesis.ts` (58), `lab-workbench/src/features/agent/runtime.ts`
  (443, 531-533, 538).
- Followed up the compile claim: `grep -n "^import" apps/workbench/src/ui/wb.js` and
  `grep -rn "compileScript" apps/workbench/src`, then read `apps/workbench/src/compile.js` whole (77 lines).
- Followed up the download claim: `grep -rn 'saveText\|claude?.use?.("downloads")' apps/workbench/src`.
- Followed up the gateway claim: `grep -n "modelTier\|effort" apps/workbench/src/agent/gateway.js`.
- Applied 14 exact-once replacements to the notes with a scratchpad helper (`replace_once.py`, all-or-nothing:
  it refuses an edit whose old text does not occur exactly once). Result: "applied 14 edits", notes now 773 lines.

### Why

- The notes are about to become database rows keyed by repo-relative path. A path that is wrong in the notes would be
  wrong in `modules.path` and would never join to anything.

### What worked

- Held as cited: the Octavo comment (`wb.js:1-2`), the `kiln-wb:` prefix (`wb.js:21`), the migration flags
  (`wb.js:51-70`), `on/bump/version` (`wb.js:75-77`), `evaluateHypotheses` (`wb.js:226-233`), the server section
  bounds (`wb.js:319-466`), `useLab` (`common.jsx:7-12`), `AGENT_SCOPE` (`agent.js:102`), the `webgpu cuda` device
  list (`agent.js:114`), the view list without hypotheses/jobs/lab/inspect (`agent.js:120`), `makeAgentScope`
  bounds (`agent.js:357-537`), the duplicated dark blocks (`tokens.css:24-31` and `32-39`, identical values),
  `contrast.mjs:12` reading only `[data-theme="dark"]`, the CSS list (`build.mjs:55`) and its shorter copy
  (`specimen.mjs:10`), the keyboard map (`App.jsx:14-16`, `Ide.jsx:79-84`), `EDGE`/`NARROW` (`Dock.jsx:11-12`),
  `PhoneDock` (`Dock.jsx:298`), the panel-kind map (`board.jsx:62-66`), the Playwright container paths
  (`ui.mjs:4,36`), the relay's 503 codes (`agent.ts:252-253`), `KILN_MODEL_URL` default (`config.ts:60`), and
  Perf Lab's unsandboxed `new AsyncFunction` (`runtime.ts:443`) with its six-call loop (`runtime.ts:538`).

### What didn't work

- `sed -n 1,77p ui/compile.js` from `apps/workbench/src` failed:

  ```text
  sed: ui/compile.js: No such file or directory
  ```

  `ls apps/workbench/src` shows `compile.js`, `server-client.js` and `server-sync.js` sit in `src/`, beside
  `main.jsx`, not in `src/ui/`. The notes had all three under `ui/`.
- `sed -n 5p apps/workbench/.gitignore` failed:

  ```text
  sed: apps/workbench/.gitignore: No such file or directory
  ```

  `grep -n dist .gitignore` at the repo root gives `5:dist/`; the reference was to the root file.

### What I learned

- The compile duplication is narrower and more deliberate than Step 1 said. `wb.js:13` imports `pipelineFor`,
  `endToEnd` and `hasKernels` from `src/compile.js`; only the core sequence is written twice (`wb.js:157-181` vs
  `compile.js:22-36`), because the page mutates its live `ParamSet` and applies first-time pins and device, while
  `compileScript` works on a clone. `compileScript` has exactly one caller, `agent/frame.js:53`.
- `agent/frame.js:10` ("by the same compileScript the page uses") is stale narration; `compile.js:1-3` is accurate
  only for the helpers.
- `saveText` is a shared helper living in a view module: exported at `Kernels.jsx:10`, imported by
  `Evidence.jsx:7`, `Agent.jsx:11` and `Notes.jsx:7`, while `App.jsx:49-55` and `App.jsx:109` re-implement it inline.
- The server relay is opt-in at runtime: `main.jsx:24` installs `gatewaySample` only when `/api/agent/usage`
  answers `ready`.
- `gateway.js` accepts `modelTier` (l.19) and reports it back as `modelTierApplied` (l.90-97) without sending it
  (l.33); `effort` is in the header comment (l.5) and nowhere else. The UI therefore tells the user a tier was
  applied when the relay never saw it [inf from the echo; not run].

### What was tricky to build

- Nothing was built. The trap was that a summary-derived line reference reads exactly like a verified one; the only
  defence is to re-read them, which is what this step did.

### What warrants a second pair of eyes

- Whether `modelTierApplied` being an echo matters: if the server picks the model from `KILN_MODEL` alone, the
  Fast/Balanced/Deep control is cosmetic on the relay path. Check `apps/server/src/agent.ts` for any tier handling
  (area C owns that file).

### What should be done in the future

- Load the notes into the inventory database (Step 3).
- Confirm the duplication rows with diffs, not reads.

### Code review instructions

- `grep -n "src/compile.js\|src/server-client.js\|repo-root" reference/03-inventory-notes-b-the-kiln-workbench-page.md`
  shows the corrected places; re-run the `p` function above on any reference to check it.

### Technical details

- Edits applied (old → new, abbreviated): `.gitignore:5` → repo-root `.gitignore:5`; three file-map rows moved from
  `ui/` to `src/`; `main.jsx:24` now states the `ready` condition; the §3.2 compile paragraph rewritten; two §10.2
  rows (download logic, compile sequence) refined; two path fixes in §12; §13 gains three rows (frame.js stale
  comment, `saveText` home, gateway `modelTier` echo detail).

## Step 3: The inventory database rows for area B

The user asked, through the orchestrator, for every finding to land in a SQLite inventory database built from one JSON
file per area plus the markdown diaries, so that a browsable site can be generated from it. This step wrote
`various/inventory/workbench-ui.json` (86 facts, 75 modules, 61 functionalities, 22 duplications and the rest; counts
below) and tagged each row with the diary step that found it. Turning the notes into one row per file forced a
second, finer pass over where things live, and that pass found three more misplacements in the notes: the Tune and
Devices views are in `apps/workbench/src/ui/Perf.jsx`, not in `Knobs.jsx` and `Jobs.jsx`; the reference text sits at
`apps/workbench/reference.txt`, not under a `docs/` directory; and the Reference view is a component of `Ide.jsx`.

### Prompt Context

**User prompt (verbatim):** see Step 1 (which links the original request in `01-investigation-diary.md`).

**User instruction relayed by the orchestrator (summary, not a verbatim quote):** record every finding in the
KILN-004 SQLite inventory database too, including the diary, with crosslinks, so that a browsable site can be built
from it. The orchestrator's assignment for area B: fill `various/inventory/workbench-ui.json` per
`playbook/01-inventory-database-contract-json-rows-diaries-and-crosslinks.md` (packages `@kiln/workbench` and
`scripts`; modules; every view, report and panel as a functionality; functionality_modules; reusable components;
duplications against the lab-workbench UI; hotspots; 50-150 facts with evidence; dependencies; service calls;
formats; diagrams), tag rows with `diary_step`, validate with `load_inventory.py --check`, and commit the three files
by pathspec.

**Assistant interpretation:** one row per thing the notes name, keyed exactly as the contract says, with repo-relative
paths that join to other areas' rows.

**Inferred user intent:** a site where a duplication or hotspot links to its modules, its evidence lines and the diary
step that found it.

**Commit (code):** none (inventory only).

**Previous commit:** 0f960aa — "KILN-004 B: re-verified workbench line references; diary step 2".

### What I did

- Read the contract (`playbook/01-inventory-database-contract-json-rows-diaries-and-crosslinks.md`), `scripts/schema.sql`,
  `scripts/schema-kiln.sql` and the key/section tables of `scripts/load_inventory.py` (`KEYS`, `MENTION_KEYS`,
  `SECTIONS`, `parse_diary`).
- Listed the tracked files instead of trusting the notes' file map:
  `git ls-files apps/workbench | grep -v "^apps/workbench/presets/"` and `git ls-files scripts`, plus
  `git check-ignore -v apps/workbench/src/presets.gen.js apps/workbench/dist/kiln-workbench.html`
  (→ `.gitignore:6:apps/workbench/src/*.gen.js` and `.gitignore:5:dist/`).
- Located every component definition: `grep -nE "^(export )?(async )?function [A-Z]\w*|^(export )?const [A-Z]\w* = "`
  over the view files and over `apps/workbench/src/ui/lab/*`, and read the imports and `VIEWS` map of
  `apps/workbench/src/ui/views.jsx` (lines 1-42).
- Read `apps/workbench/src/server-client.js:136-165` (`jobKernel`, `jobSpec`) for the `kiln-kernels/1` row,
  `scripts/kiln-export.mjs:1-20` for `kiln-program/1`, and `apps/server/src/app.ts:31-39` for how the page is served.
- Wrote a generator in the scratchpad (`tools/gen_workbench_inventory.py`) rather than hand-writing JSON: it computes
  every `loc` from the files, builds the rows, and drops rows tagged with a diary step higher than its third
  argument so the JSON never names a step that is not written yet. Run:
  `python3 -I gen_workbench_inventory.py /Volumes/SSD/code/kiln <ticket>/various/inventory/workbench-ui.json 3`.
- Applied 17 more exact-once edits to the notes (16 location fixes, then one adding the `ParamControl` and `Judged`
  duplicates), and appended §16 with the two mermaid diagrams that are also `diagrams` rows. Notes: 835 lines.

### Why

- Functionality names carry a `Workbench view:`, `Workbench board panel:` or `Workbench:` prefix: names are a global
  natural key, and area D will describe Perf Lab's own chart, table and gallery views.
- Endpoint rows were left to area C (it owns `@kiln/server`); the page's side is recorded as `service_calls`, one per
  endpoint family, with the calling file as evidence.
- The `lab-workbench/src/lang` vs `packages/lab/src/lang` fork is recorded as a fact, not a duplication row: area D
  owns both sides, and the contract's own example title is that duplication.
- Dependencies `react` and `katex` for `@kiln/workbench` are already in `orchestrator.json`; repeating them would only
  produce collisions, so this file adds `react-dom`, `@kiln/kiln`, `@kiln/lab`, `esbuild` and the system tools.

### What worked

- Generator output: `{'packages': 2, 'modules': 75, 'functionalities': 61, 'functionality_modules': 131,
  'service_calls': 14, 'reusable_components': 14, 'duplications': 22, 'complexity_hotspots': 8, 'facts': 86,
  'dependencies': 7, 'docs': 2, 'diagrams': 2, 'formats': 6}` on the first run; `formats` is 5 after the
  collision fix below.
- The `views.jsx` imports settle view ownership in eight lines: `PerfView, TuneView, DevicesView` from `./Perf.jsx`
  (l.8), `JobsView, ServerLine` from `./Jobs.jsx` (l.12), and the Devices entry renders
  `<><ServerLine /><DevicesView /></>` (l.37).

### What didn't work

- The first `--check` reported a cross-area collision:

  ```text
  PROBLEM: workbench-ui.json:formats[4]: formats row 'kiln-program/1' also defined by area 'compiler-runtime'; this one wins
  ```

  Area A owns that format (the runtime launchers read it), and "this one wins" meant this file would have
  overwritten A's row. Recovery: the generator no longer emits a `kiln-program/1` format row; the export script's
  use of it stays as a fact and a module row.
- The second `--check` crashed before reporting anything:

  ```text
  File ".../scripts/load_inventory.py", line 221, in build
    explicit_links.append((area, int(s), table, rowid, key))
  TypeError: int() argument must be a string, a bytes-like object or a real number, not 'list'
  ```

  A scan of every inventory JSON for a list-valued `diary_step` found it in another area's file
  (`various/inventory/perf-lab.json`, functionalities 15 and 16, `"diary_step": [1, 2]`), not in this one. That
  file is not this area's to edit. Recovery: validate in an isolated copy of the ticket in the scratchpad
  (`check/ttmp/2026/10/21/KILN-004/` with `scripts/`, `reference/*.md` and every inventory JSON, `perf-lab.json`
  replaced by `{}`), where `load_inventory.py --check` exits 0 with no problem for `workbench-ui.json`. Reported to
  the orchestrator in the final message.
- Otherwise the failures were in the notes: `| tune | TuneView (Knobs.jsx)`,
  `| devices | DevicesView + ServerLine (Jobs.jsx)` and `docs/reference.txt` were wrong, found only because each module
  row needed a real path and a computed `loc`.

### What I learned

- `apps/workbench/src/ui/Perf.jsx` holds three of the dock's views (Perf at l.30, Tune at l.340, Devices at l.481), which
  makes it a bigger hotspot than its "perf view" label suggests; the hotspot row now says so.
- `ParamControl` is defined twice under one name (`Knobs.jsx:9`, exported and used by `Ide.jsx:6`; `lab/params.jsx:67`,
  local), and so is `Judged` (`Hypotheses.jsx:139`, `lab/panels.jsx:265`).
- `apps/server/src/app.ts:31-39` is where the token meta the page reads is injected, which closes the loop on how
  `sessionToken()` (`packages/kiln/src/std/devices.js:297`) gets a value.

### What was tricky to build

- Natural keys across areas. A module row's `path` is global, so a row for a Perf Lab file here would collide with
  area D's. Duplication rows therefore cite Perf Lab files only inside `locations` (free JSON), never as module rows.
- The loader's mention links match module paths in diary text. Diary paths are therefore written repo-relative
  (`apps/workbench/src/ui/Perf.jsx`), while the notes keep the shorter `ui/Perf.jsx` style for readability.

### What warrants a second pair of eyes

- Functionality categories for views: views are `views` (or `agent` for the Agent view) and the domain sits in the
  description; a reviewer may prefer the domain category (`measurement`, `jobs`) for views too.
- `service_calls` to `claude.ai artifact host` use a `to_package` that is not in the shared package list; it is a real
  call target but has no `packages` row.

### What should be done in the future

- Confirm the headline duplication rows with diffs (Step 4).
- The orchestrator may want an `endpoints`-style table for page-side calls; `service_calls` with one row per endpoint
  family is the closest fit in the current schema.

### Code review instructions

- `python3 <ticket>/scripts/load_inventory.py --check` must report no problem for `workbench-ui.json`.
- Spot-check rows: `python3 -c "import json;d=json.load(open('<ticket>/various/inventory/workbench-ui.json'));print([f for f in d['facts'] if 'Perf.jsx' in f['evidence_path']])"`.

### Technical details

- Rows by step: everything found in Step 1 carries `diary_step: 1`; Step 2's corrections (relay opt-in, `modelTier`
  echo, compile sequence, `saveText`, `src/` placement, frame.js comment) carry `2`; this step's finds (view placement,
  `reference.txt`, `.gen.js` ignore rule, `ParamControl`/`Judged`, page serving, `kiln-program/1`, the export script,
  evidence export, docs, diagrams) carry `3`.
