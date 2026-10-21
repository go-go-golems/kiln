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

## Step 2: Folding in the diary readers and writing the synthesis sections

After resuming, I filled the six `[[DIARY-…]]` placeholders in the notes with what the three readers had extracted. Before any reader claim became a finding, I re-checked the ones the synthesis depends on against the code. Then I replaced `[[SECTIONS-3-PLUS]]` with sections 3–11:

- §3, reversal chains;
- §4, glossary;
- §5, component status;
- §6, the copy/merge/link map;
- §7, consolidated open tasks;
- §8, hosts;
- §9, deciding results;
- §10, recurring pain;
- §11, documentation drift.

The notes now have no placeholders.

The main finding is that the history contains reversals made within hours. Four chains matter most for KILN-004:

- **Remote execution:** SSH, then an HTTP agent, then SSH again as a tunnel.
- **Capture hash:** cyrb53 was due to be retired twice, and now has four copies.
- **Synthetic hosts:** removed in the design, kept as the fallback in code.
- **CPU lab runs on the Mac:** declared lost, then brought back the same evening.

### Prompt Context

**User prompt (verbatim):** see Step 1.

**Orchestrator message on resume (my summary, not a user quote):** the scratch notes had been moved into this ticket file and committed in `1d0c894`; the ML-PERF report is preserved under `various/stopped-agent-scratch/`. I am to keep editing the ticket file, fill its Summary, write this diary, fill `various/inventory/history.json` per the playbook contract, validate with `load_inventory.py --check`, and commit only my three files.

**Assistant interpretation:** finish the notes first, so the JSON rows can cite sections and lines that exist.

**Commit (code):** previous commit `a8394d6` ("KILN-004 E: history notes frontmatter; diary step 1, written after the fact").

### What I did

**Inputs.**

- Extracted the ML-PERF reader's final report from its transcript into the scratchpad (794 lines; the same text the orchestrator preserved at `various/stopped-agent-scratch/mlperf-report.md`).
- Received the KILN-001 report (`af74eda3cf7a3dc74`) and the KILN-002/003 report (`af4eee0f9f999e0e1`).

**Notes edits.**

- Added a citation-key table to section 0 (`K1D01`…`K1D10`, `K2D`, `K3D`, `MP1-D3`, …).
- Replaced the KILN-004 timeline row ("uncommitted") with `4dbf767` … `1d0c894`.
- Wrote the six "From the diaries" blocks. Each has a step → commit table, decisions with rationale, defects, measurements, admitted copies and pain points, each with `KEY:line` citations.

**Re-checked against the code:**

- `ls packages/exec/src/kinds/` returns `index.ts kiln-kernels.ts perf-lab-sampler.ts`. `ls packages/exec/src/collectors/` returns `gpu-sampler.ts index.ts ncu.ts nsys.ts`.
- `grep -rl cyrb53` (excluding `node_modules`, `dist`, `.data`, `imports`, `ttmp`, `*.gen.js`) finds a cyrb53 body in four files:
  - `packages/kiln/src/core/util.js:3`, Kiln's own `hash`, base-36;
  - `packages/lab/src/lang/util.ts:10`, `hash`;
  - `packages/exec/src/lab-hash.ts:7`, `cyrb53`, exported at `packages/exec/src/index.ts:9`;
  - `lab-workbench/src/lang/util.ts:1`.

  `apps/server/src/lab/` no longer contains `captures.ts`.
- `grep -rn "kiln-probe/1"` finds only `runner/docker/kiln-probe.cu:174`, the probe binary's output format string. No kind of that name exists.
- `grep -rn corresponds_to` finds the edge emitted in `packages/exec/src/runs.ts:57` and `packages/exec/src/collectors/nsys.ts:42`, and asserted in `apps/server/test/jobs.test.ts:199`.
- In `runner/kiln_driver.py`:
  - l.1032: `--listen` defaults to `127.0.0.1:5281`;
  - l.1035: `--lock-dir` defaults to `/run/lock`;
  - l.1020: a plain `ThreadingHTTPServer`, with no authentication.
- `packages/lab/src/data/capabilities.ts:11-24` still holds the synthetic GB10 and RTX PRO 6000 reports, and `packages/lab/src/data/generate.ts` is 731 lines.
- `K/README.md`:
  - l.40 still documents `kiln_runner.py serve`;
  - the layout block (l.17-30) omits `apps/server`, `packages/{evidence,lab,exec}`, `runtime/` and `kiln_driver.py`;
  - l.27-28 says the copied `lab-workbench` keeps `node_modules`, `.venv`, `.data` and `dist` on disk, gitignored;
  - `git log -1 -- README.md` returns `3c71c0d`.

**Sections 3–11** were written from the notes plus these checks.

### Why

- The synthesis sections are what KILN-004 consumes: component status (§5) and the copy map (§6) feed the duplication rows, and the reversal chains (§3) explain why several components exist twice.
- Reader claims that are cheap to check against the code were re-checked. A diary records intent at the time it was written, and several later commits contradicted it.

### What worked

- **Status lines.** Every component in §5 has a status backed by a commit or a code check, not by a task box.
- **The cyrb53 chain.** Re-checking resolved it: KILN-001's copy in `apps/server/src/lab/captures.ts` is gone. Three of the four copies remain because KILN-003 chose to move the hash rather than retire it (`8276bf7`). The fourth, Kiln's own `hash`, was never part of the chain.

### What didn't work

- `grep -rln 'cyrb53' --include=*.ts --include=*.js … .` failed under zsh with `(eval):1: no matches found: --include=*.ts`, because the unquoted glob in the flag is expanded by the shell. I re-ran it without `--include`, using `--exclude-dir` filters.
- `… ; echo ==; …` and `… ; echo =====; …` failed with `(eval):1: = not found` and `(eval):1: ===== not found`: zsh's `=word` expansion treats a leading `=` as a command lookup. The commands before the `echo` had already printed; I reran the remaining parts separately.
- The first `Write` of this diary was refused with `File has not been read yet. Read it first before writing to it.` I read the file, then wrote it.
- **Length.** The notes grew to about 1,295 lines, above the 500–1,000 the original brief asked for. I kept the per-ticket diary blocks rather than cut citations, because the JSON rows cite them.

### What I learned

- Two corrections to the scratch draft:
  - `lab-workbench`'s heavy directories are on disk but gitignored, so the copy is verbatim on disk but not in git.
  - The README's layout has been stale since KILN-001 Phase 5a, not only since KILN-003.
- `corresponds_to` exists in data, so the entity-graph task is half-done in a ticket that never names it.

### What was tricky to build

- Dating the reversals: decisions are spread across guides, diaries and commit bodies, and the guides' frontmatter dates are wrong. I ordered every chain by commit time and quoted the line that states each position.

### What warrants a second pair of eyes

- §3.1's conclusion: D10's rationale ("removes a network-exposed code-execution endpoint") is contradicted by the unauthenticated driver. That is a judgement on two documents read side by side. The mitigation is binding to loopback or Tailscale, and this step did not test it.
- §5 rates the `ncu`/`nsys` collectors "partial" because the code exists and the hosts block counters. I have not seen them run.

### What should be done in the future

- Turn §3–§9 into `history.json` rows (Step 3).
- Someone who owns the KILN tickets should fix the task boxes (`KT3/tasks.md:6`, `KT1/tasks.md:22`) and the stale README and index lines. I did not edit them; they are outside my three files.

### Code review instructions

- Read notes §3 and §5 first, then spot-check two citations per diary block, e.g. `K1D01:1252-1254` and `K3D:907-913`.
- Re-run the checks: `ls packages/exec/src/kinds/`; `grep -rn "kiln-probe/1" --exclude-dir=node_modules --exclude-dir=ttmp .`; `grep -n listen runner/kiln_driver.py`.

### Technical details

- Notes placeholders filled: `[[DIARY-MP1]]`, `[[DIARY-MP2]]`, `[[DIARY-MP3]]`, `[[DIARY-K1]]`, `[[DIARY-K2]]`, `[[DIARY-K3]]`, `[[SECTIONS-3-PLUS]]`. `grep -n '\[\[' …06-…md` now returns nothing.
- The copy map (§6) lists 19 relations. Four of them have an enforcement seam:
  - `check:pl`;
  - the golden matching test;
  - the vendored-launcher hash test;
  - `diff -rq`, run by hand.
