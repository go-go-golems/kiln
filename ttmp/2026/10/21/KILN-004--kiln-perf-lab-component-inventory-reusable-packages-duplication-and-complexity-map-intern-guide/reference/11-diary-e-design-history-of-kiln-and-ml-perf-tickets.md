---
Title: 'Diary E: design history of KILN and ML-PERF tickets'
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
Summary: 'Agent E''s working diary: how the design history of Kiln and Perf Lab was reconstructed from the KILN-001..003 and ML-PERF-001..003 ticket workspaces, the git logs and spot checks of the current code; what was read, which claims were checked, and where the history notes and history.json rows came from.'
LastUpdated: 2026-10-21T11:00:00-04:00
WhatFor: Auditing the history notes (reference/06) and the history area rows (various/inventory/history.json) back to the commands and readings that produced them.
WhenToUse: Before trusting or extending a history fact, decision or timeline row, or when resuming agent E's work.
---

# Diary E: design history of KILN and ML-PERF tickets

This is agent E's diary for KILN-004. Agent E owns the `history` area. It records what the six tickets behind Kiln × Perf Lab set out to do, what they decided and built, what was superseded, and what is still open.

The findings live in two files:

- `reference/06-inventory-notes-e-design-history-of-kiln-and-ml-perf-tickets.md` holds the prose.
- `various/inventory/history.json` holds the rows.

Both repositories outside this ticket were read only.

Path abbreviations follow section 0 of the notes:

- `K/` is `/Volumes/SSD/code/kiln/`.
- `PB/` is the Playback worktree `/Users/manuel.odendahl/code/tulip/playback/.worktrees/docs-ml-perf-001-perf-explorer/`.
- `KT1/`…`KT4/` are the KILN ticket directories.
- `MP1/`…`MP3/` are the ML-PERF ticket directories.

## Step 1: Reading the six tickets and drafting the history (written after the fact)

I wrote this step after the fact, at about 10:50 on 2026-10-21, from the session's compacted record. It covers all work before the interruption:

- reading the indexes, task lists, changelogs and design docs of KILN-001..003 and ML-PERF-001..003;
- matching them to the git logs of four repositories;
- spot-checking claims against the current Kiln code;
- launching three parallel readers for the long diaries;
- drafting the history in a scratch file.

The session hit a usage limit and the orchestrator stopped me mid-work. It committed my scratch notes, unreviewed, into this ticket's notes file (`1d0c894`, 10:42). The ML-PERF reader's report went into the same commit, under `various/stopped-agent-scratch/mlperf-report.md`. At that point the notes still ended in seven placeholders (`[[DIARY-MP1]]` … `[[SECTIONS-3-PLUS]]`), and `various/inventory/history.json` was still `{}`.

### Prompt Context

**User prompt (verbatim):** quoted in `reference/01-investigation-diary.md`, Step 1 ("Locating the system and opening the ticket"). Not repeated here.

**User instruction, relayed verbatim by the orchestrator mid-task:** "Tell each agent btw commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill)."

**Orchestrator's assignment (my summary, not a user quote):** reconstruct the design history and stated intent behind Kiln × Perf Lab from the docmgr ticket workspaces.

Sources to read:

- **Kiln repository:** KILN-001 (`ttmp/2026/10/19/`), KILN-002 and KILN-003 (`ttmp/2026/10/20/`), `imports/Untitled.md`, `README.md` and the git log.
- **Playback worktree:** ML-PERF-001/002/003 (`ttmp/2026/10/12/`; ML-PERF-003 is untracked).
- **`/Volumes/SSD/code/playback-kiln-002`:** its commits.

For each ticket, extract:

- goal and architecture;
- named concepts and decision records;
- done and open tasks, quoted;
- work planned but not built, and superseded items;
- hosts, measured results and pain points.

Then synthesise, with paths and line numbers throughout:

- a timeline;
- a glossary with source paths;
- a component status table (built / partial / planned);
- where Kiln and Perf Lab were merged, linked or copied, with every admitted duplication or fork;
- the open tasks.

Later orchestrator messages added these constraints:

- I may write exactly three files in this ticket: the notes, this diary and `various/inventory/history.json`.
- Commits are pathspec commits with subjects `KILN-004 E: …`, and never use `git add`.
- The Playback worktree stays read-only.
- The JSON rows follow `playbook/01-inventory-database-contract-json-rows-diaries-and-crosslinks.md`.

**Assistant interpretation:** an inventory of history and intent, not a review. For each ticket: what it claimed, decided and left open, checked against git and, where cheap, against the code.

**Inferred user intent:** KILN-004 aims to separate Kiln and Perf Lab again into reusable pieces. The history shows three kinds of seam:

- seams designed on purpose;
- copies made in a hurry;
- decisions reversed within a day.

**Commit (code):** none by me in this step. The orchestrator's `1d0c894` committed my scratch notes.

### What I did

**Read.**

- Every `index.md`, `tasks.md` and `changelog.md` of the six tickets.
- From the design docs (`KT1/design-doc/01-…`, `KT2/design-doc/01-…`, `KT3/design-doc/01-…`, `MP1/design/01..04`, `MP2/design/01-…`, `MP3/design/01-…`): summaries, vocabularies, architecture, decision records, phase plans, status sections and risk lists.
- `K/README.md` and the comparison memo `K/imports/Untitled.md`.

**Matched tickets to commits.**

- `git -C /Volumes/SSD/code/kiln log` showed 66 commits at the time, from `92daa13` (2026-10-19 13:44) to `4d9adc2` (2026-10-20 23:49).
- In the Playback worktree, `git log main..HEAD` gave:
  - ML-PERF-001: `e0b4e9ece` (10-12 14:57) through `d6274c408` (19:12);
  - ML-PERF-002: `58af2c81c` (19:45) through `cdb84891c` (20:46).
- In `/Volumes/SSD/code/playback-kiln-002`:
  - `git log main..HEAD` gave `cdfb0d8c9` (10-20 13:31) and `ac835daa9` (14:25);
  - `git status` showed `docker-compose.yml` modified, +5 lines, uncommitted.
- `/Volumes/SSD/code/factory-videos-kiln` has one commit, `3bc92785`, on `FACTORY-KILN-001--gpu-kernels`.

**Checked identity claims.**

- `diff -rq` of `K/lab-workbench` against `PB/ttmp/2026/10/12/ML-PERF-001-…/experiments/lab-workbench` printed nothing: the trees are identical. `git log -- lab-workbench` in Kiln shows only `92daa13` ever touched it.
- The vendored `services/redaction/src/kiln/kiln_launch.py`, below its three-line header, has the same sha256 as `K/runtime/python/kiln_launch.py` at `7bcfc06` (`94a0f717…`).
- ML-PERF-003's docmgr close receipt, `MP3/.docmgr-operations/close-d581c…json`, records the close at 2026-10-21T00:16:51Z (2026-10-20 20:16 EDT), with status `superseded`.

**Checked task claims against code.**

- `K/packages/exec/src/kinds/index.ts` registers only `kiln-kernels/1` and `perf-lab-sampler/1`.
- The `ncu.ts` and `nsys.ts` collectors exist, although P2 is still open.
- `K/runner/test/test_driver.py`, planned in KILN-003 §33.2, does not exist.
- `K/runner/kiln_runner.py` has no `serve` subcommand.

**Delegated and drafted.**

- Launched three background readers for the long diaries:
  - KILN-001's ten diaries: `af74eda3cf7a3dc74`;
  - the KILN-002 and KILN-003 diaries: `af4eee0f9f999e0e1`;
  - the ML-PERF diaries: `a264a6b4bbcca3467`.

  Only the ML-PERF reader reported before the interruption.
- Drafted sections 0–2.9 of the notes (447 lines) in the session scratchpad, with placeholders for the diary findings and for sections 3 onward.

### Why

- The ticket workspaces state intent, the git logs date it, and the code shows what survived. A history built from only one of the three repeats the drift this ticket is meant to find.
- The long diaries total roughly 9,000 lines: KILN-001's ten, KILN-002's 2,401 lines, KILN-003's 1,009, and six ML-PERF diaries. I split them across readers so their content would come back as citations, not file dumps.

### What worked

- Every claimed copy relation checked out byte for byte: Perf Lab into Kiln, and the launcher into Playback.
- Commit times give an unambiguous order for the decisions that were later reversed: D10 → ML-PERF-003 §5 → KILN-003 v1 → KILN-003 v2 (notes section 3).

### What didn't work

- The session hit its usage limit before the KILN-001..003 readers reported and before I wrote any synthesis section. The orchestrator stopped the agent.
- The draft survived only because it was already in a file. The orchestrator committed it as-is in `1d0c894`, with the message "Usage limit reached: agents A, C, D and E were stopped. Their partial notes (A, D, E) are committed unreviewed".
- No exact command diagnostics from this part of the session survive in the compacted record, so none are quoted here.

### What I learned

- The whole history is short and dense:
  - Perf Lab was built in about six hours on 2026-10-12.
  - It was unified with Kiln in about 4.5 hours on 2026-10-19.
  - It was put on real work on 2026-10-20 and given a new execution core the same evening.
- Task checkboxes are not reliable status in these tickets:
  - KILN-001's vault-report task is unchecked, although three reports were pushed.
  - KILN-003's P1 is checked, although its `kiln-probe/1` kind does not exist.

### What was tricky to build

- Frontmatter `LastUpdated` values cannot be trusted as dates; several are later than the files' modification times. I used only git commit times for the timeline.

### What warrants a second pair of eyes

- The claim that `kiln-probe/1` is missing rests on a grep over `packages/exec`, `apps/server/src` and the driver. The string appears only in `runner/docker/kiln-probe.cu`, as the probe binary's output format.

### What should be done in the future

- Fold the three readers' reports into the notes, write the synthesis sections, and turn the result into `history.json` rows (Steps 2 and 3).

### Code review instructions

- Start at sections 0–2 of `reference/06-…md`; every row of the timeline table names its commits.
- To re-run the identity check, the following command should print nothing:

  ```bash
  diff -rq /Volumes/SSD/code/kiln/lab-workbench \
    /Users/manuel.odendahl/code/tulip/playback/.worktrees/docs-ml-perf-001-perf-explorer/ttmp/2026/10/12/ML-PERF-001--dino-and-embedding-kernel-profiling-and-visualization/experiments/lab-workbench
  ```

### Technical details

- Reader agent ids: `af74eda3cf7a3dc74` (KILN-001), `af4eee0f9f999e0e1` (KILN-002/003), `a264a6b4bbcca3467` (ML-PERF).
- Orchestrator commit that rescued the draft: `1d0c894` (2026-10-21 10:42:18 -0400).
