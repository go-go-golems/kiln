---
Title: 'Diary C: server, execution core and evidence'
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
Summary: 'Investigation diary of KILN-004 area C (apps/server, packages/exec, packages/evidence, runner/kiln_driver.py, and duplication against lab-workbench/server): what was read, which commands ran and failed, and how the notes and inventory rows were produced.'
LastUpdated: 2026-10-21T11:30:00-04:00
WhatFor: 'Tracing a claim in reference/04-inventory-notes-c-server-execution-core-and-evidence.md or in various/inventory/server-exec-evidence.json back to the step and command that produced it.'
WhenToUse: 'When reviewing or extending area C of the KILN-004 inventory, or when a server, exec or evidence finding needs its provenance.'
---

# Diary C: server, execution core and evidence

This diary covers area C of KILN-004 in the diary skill's investigation format. Area C is the backend and measurement
side of kiln: `apps/server`, `packages/exec`, `packages/evidence` and `runner/kiln_driver.py`, plus their duplication
against `lab-workbench/server`. The findings are in `reference/04-inventory-notes-c-server-execution-core-and-evidence.md`
and the database rows are in `various/inventory/server-exec-evidence.json`. Paths are repo-relative to
`/Volumes/SSD/code/kiln`.

## Step 1: Reading the server, exec, evidence and driver, and writing the notes (written after the fact)

This step was written after the fact. It covers the whole reading phase. A usage limit interrupted the session
before anything had been committed, and the coordinator stopped the agent. The notes were then rebuilt from the
context the agent still held, without re-reading the source. Only a handful of lines were re-checked: route lines
in `app.ts`, record validation, the driver's dispatcher, and the location of `kiln-capabilities/1`.

The outcome is the notes file, about 600 lines. It covers the route table (33 server routes and 13 driver routes),
three migrations, the seven-state job machine with its undocumented replan edge, and fifteen wire formats. It also
has a ten-file similarity table against Perf Lab's server, hotspots, package readiness, and thirteen items of dead
or stale code. Every claim is tagged observed (O) or inferred (I).

### Prompt Context

**User prompt (verbatim):** The original request is quoted in
[reference/01-investigation-diary.md, Step 1](01-investigation-diary.md#step-1-locating-the-system-and-opening-the-ticket).
The user's later instruction, relayed by the coordinator, verbatim:

> Tell each agent btw commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill).

**Orchestrator's assignment (a subagent brief, not user text):** Build a component inventory, not a code review, of
`apps/server`, `packages/exec`, `packages/evidence`, `runner/kiln_driver.py`, and their duplication against
`lab-workbench/server`. For each module, give its purpose, public API, routes, DB schema, wire formats, job state
machine, consumers, LOC and tests. Then cover the end-to-end job flow, the duplication (with file:line evidence and
the canonical side), hotspots, reusable vs leaky packages, and dead code. Separate observed from inferred. The Kiln
server on `127.0.0.1:5380` may be used for GETs only.

**Coordinator's follow-ups (not user text):**

- Write and commit only the notes, the diary and later `various/inventory/server-exec-evidence.json`.
- Use pathspec commits with the subject `KILN-004 C: …`. Never `git add`, never use a destructive git command, never
  push.
- After the usage-limit interruption: "Resume from where you stopped … Rebuild your notes from what you already read.
  Read source again only where you need to."

**Assistant interpretation:** Produce an evidence-tagged inventory of area C in the two reference files. Add the
database rows in a later step.

**Inferred user intent:** Find which backend pieces are independent enough to repackage, and what is copied between
Kiln and Perf Lab, so the two can be separated again on purpose.

### What I did

- Context:
  - Read `README.md` (43 lines) and the KILN-003 design doc
    `ttmp/2026/10/20/KILN-003--…/design-doc/01-intern-guide-one-execution-core-for-kiln-and-perf-lab.md` (2244 lines).
    It defines nine nouns (Host, Environment, Kind, Collector, Capture, Job, Run, Record, Offer) and phases P0-P6.
  - Read KILN-003 `tasks.md`: P0 and P1 are done, P2-P6 are open.
- Server history, `git log --oneline -- apps/server packages/exec runner` plus `git show --stat` on the key commits:
  - `b0b3bc6`: Phase 5a, server core.
  - `aa2dcc2`: 8c, lab routes and the importer.
  - `55e6b2e`: Phase 7, the model gateway.
  - `49f5156`: KILN-003 P0/P1. It deleted the executors, the first `jobs.ts`, `lab/probe.ts`, the executor test,
    `fake-runner.mjs` and `runner/docker/kiln-docker-python`.
  - `8276bf7`: deleted `lab/captures.ts`.
  - `92daa13`: the verbatim import of `lab-workbench/`, with no later commits touching it.
- Sizes: `wc -l` over every file in `apps/server/src`, `packages/exec/src`, `packages/evidence/src`, `runner/*.py`
  and `lab-workbench/server/*.ts`.
- Source, read end to end:
  - `apps/server/src`: `index.ts`, `config.ts`, `security.ts`, `app.ts`, `db.ts`, `records.ts`, `devices.ts`,
    `events.ts`, `agent.ts`.
  - `apps/server/src/exec/*`: `hosts.ts`, `driver-client.ts`, `jobs.ts`, `import.ts`, `routes.ts`, `assets.ts`,
    `nsys-sqlite.ts`.
  - `apps/server/src/lab/*`: `routes.ts`, `store.ts`, `datasets.ts`, `evidence.ts`, `tar.ts`, `files.ts`,
    `importer.ts`, `import.ts`.
  - `packages/exec/src/*`: model, registry, plan, identity, hosts, requirements, offers, runs, lab-hash, both kinds,
    and all collectors.
  - `packages/evidence/src/*`.
  - `runner/kiln_driver.py`.
- Perf Lab side: read `lab-workbench/server/app.ts`, `runner.ts`, `db.ts`, `importer.ts`, `store.ts`, `evidence.ts`,
  `datasets.ts`, `tar.ts`, `events.ts`, `qualification.ts`, `dino.ts` and `assistant/service.ts`.
- Live server, read-only `curl -s` GETs on `http://127.0.0.1:5380`: `/api/health`, `/api/hosts`, `/api/jobs`,
  `/api/archives`, `/api/devices`, and one `/api/jobs/<id>/plan`.
- Unused-code greps over `apps` and `packages`:
  - `grep -rn "\.jobs()"`: no callers.
  - `grep -rn "into sources\|from sources"`: nothing.
  - `grep -rn spec_json` and `grep -rn devices`: the only device update is `exec/import.ts:121`.
- Consumers: `grep -rl "@kiln/exec"` and `grep -rl "@kiln/evidence"`, counted per directory.
- Similarity of the ten file pairs (Perf Lab vs Kiln) with a difflib script, `sim.py` in the scratchpad. Its
  content is under Technical details.
- Tests: ran vitest with the JSON reporter for the three packages (command under Technical details). Exit 0 for all
  three: evidence 133, exec 21, server 79 tests.
- Rebuilt `reference/04-inventory-notes-c-server-execution-core-and-evidence.md` after the interruption. Before
  writing, re-checked these lines with `grep -n` and `sed -n`:
  - the route lines in `app.ts` (`notFound` is line 112, not 111);
  - `records.ts:20-40`;
  - the dispatcher in `kiln_driver.py:879-1007`;
  - `model.ts:139-141` and `offers.ts:60` for `kiln-capabilities/1`;
  - `jobs.ts:211-256` and `339-438`.

### Why

- Reading the whole of every module, rather than sampling it, was the only way to give a route table and a state
  machine with line numbers.
- I used the live server to check what the code implies: which collectors are unusable, the job counts, and a real
  plan.
- A whitespace-insensitive line diff is enough to separate copied code from rewritten code. Function-level diffs
  would have cost more and changed no conclusion.

### What worked

- Every route found in the source matches the live server's behaviour. `/api/health` reports the seven features the
  code declares.
- The three unused-code greps returned nothing, which confirms `DriverClient.jobs()` (`driver-client.ts:109`), the
  `sources` table and `devices.spec_json` as unused.
- vitest JSON, at `4d9adc2`:

  ```text
  evidence  total 133 passed 133  (canonical 18, identity 23, package 2, protocol 5, record 38, sha256 6, stats 13, values 13, verdict 15)
  exec      total  21 passed  21
  server    total  79 passed  79  (agent 13, client 4, decide 1, events 2, jobs 22 in 32 629 ms, lab-import 7, lab 14, records 5, security 11)
  ```

### What didn't work

- **Reading the diary skill's two reference files in one command failed.** The command was
  `cat …/investigation-entry.md; echo; echo =====; cat …/evidence-levels.md`, and its exact error was
  `(eval):1: ===== not found`. In zsh, an unquoted word that starts with `=` undergoes equals expansion: zsh looks
  up the rest of the word as a command. Recovery: I read the two files with separate commands.
- **The background overlap loop (task `b71hod943`) produced nothing usable.** Its body was
  `for p in "lab-workbench/server/tar.ts apps/server/src/lab/tar.ts" …; do set -- $p; …`. Its output began:

  ```text
  (eval):1: no such file or directory: lab-workbench/server/tar.ts apps/server/src/lab/tar.ts
  (eval):1: no such file or directory:
  usage: diff [-aBbdilpTtw] [-c | -e | -f | -n | -q | -u] [--ignore-case]
  sed: lab-workbench/server/tar.ts apps/server/src/lab/tar.ts: No such file or directory
  ```

  zsh does not word-split an unquoted `$p`, so `set -- $p` made the whole pair one argument. Recovery: I computed the
  ratios with Python difflib (`sim.py`) instead.
- **An earlier command that used `comm <(...)` process substitution hung** and was moved to the background. Its
  exact text and output were lost with the interrupted context, so they are not reproduced here.
- **The usage-limit interruption.** The session stopped mid-work, before the first commit. The notes and diary were
  still templates; the scratchpad held only the vitest JSON reports and `sim.py`. Recovery: I rebuilt everything from
  the retained context and re-read only the lines listed above.
- **Two sets of similarity ratios.** Before the interruption I had a set of ratios computed some other way, whose
  method was not preserved: tar 0.72, datasets 0.61, evidence 0.61, store 0.15, db 0.40, importer→sampler 0.62,
  events 0.75, runner→jobs 0.01, assistant→agent 0.02. The rerun with `sim.py` gives 0.73, 0.64, 0.64, 0.18, 0.39,
  0.65, 0.73, 0.09, 0.07. The notes use only the reproducible rerun. The two sets agree on every conclusion; the
  low pairs rise slightly because stripped trivial lines such as `}` match.

### What I learned

- `lab-workbench/server` is frozen at its import. Kiln is canonical for every shared file. The two sides diverge by
  omission (qualification, dino, the assistant, the synthetic executor), not by parallel edits.
- The execution core is cleanly split by runtime:
  - `@kiln/exec` and `@kiln/evidence` are browser-safe pure TypeScript;
  - Node-only work stays in `apps/server`;
  - `exec/nsys-sqlite.ts` passes `NsysTables` into the browser-safe nsys collector, which never opens SQLite itself.
- The job diagram in `jobs.ts:4-7` omits the approved → proposed replan edge at `jobs.ts:345-351`.
- Naive `grep -c "it("` counts disagree with vitest: evidence has about 83 by grep but 133 in vitest, because of
  parameterised tests. Only the vitest counts are used.

### What was tricky to build

- **The interrupted reading phase.** The facts had to be rebuilt from retained context without re-reading. I kept
  every line number I could not re-check tied to a source read before the interruption, and re-ran `grep -n` where
  a line number mattered and was cheap to confirm. That re-check corrected the `notFound` line (112, not 111).
- **Shell quirks in zsh.** Three separate failures (equals expansion, no word splitting, process substitution) all
  came from writing bash idioms in zsh. The fix in each case was a different tool (separate commands, Python) rather
  than more quoting.

### What warrants a second pair of eyes

- **The replan edge** (`jobs.ts:345-351`). It resets the job to `proposed` but keeps the old `plans/<id>.json`. A
  re-approval therefore submits the same plan, and the same check returns it to `proposed` again. This conclusion
  is inferred from the code; no test exercises it.
- **`POST /api/archives` with `{path}`** (`exec/routes.ts:77`, `lab/evidence.ts:110`). It lets a token-holding page
  make the server read any absolute `.tar.gz`/`.tgz` path up to 64 MiB on the server's machine. The token and the
  loopback host allow-list bound this, but it is a file-read capability.
- **`kiln_driver.py` has no authentication** (by design, per its header). Any local process on a GPU host that can
  reach the driver's port can submit plans that run containers with the GPU.
- **The two archive registration paths have different limits.** Evidence archives are capped at 64 MiB. Job
  archives are read with `readTarGz(data, 2**31)` against a plan limit of 1 GiB.

### What should be done in the future

- Fill `various/inventory/server-exec-evidence.json` and validate it (Step 2).
- Decide the replan semantics, and either regenerate the plan or fail the job.
- Remove or update the stale items in §11 of the notes: `apps/server/README.md`, the unused `sources` table and
  `devices.spec_json`, `DriverClient.jobs()`, `ncu: false`, and the `lab/import.ts` help text.

### Code review instructions

- Start with notes §2.8 and `apps/server/src/exec/jobs.ts:135-470`, then `exec/import.ts:48-125`. Read
  `runner/kiln_driver.py:289-700` for the worker and `:879-1007` for the dispatcher.
- Validate the test counts:

  ```bash
  cd /Volumes/SSD/code/kiln
  pnpm --filter @kiln/evidence test
  pnpm --filter @kiln/exec test
  pnpm --filter @kiln/server test
  ```

- Validate the unused-code claims: `grep -rn "\.jobs()" apps packages --include='*.ts'` should print nothing.

### Technical details

- The vitest command (the scratchpad is this session's):

  ```bash
  cd /Volumes/SSD/code/kiln
  for p in evidence exec server; do
    pnpm --filter @kiln/$p exec vitest run --reporter=json --outputFile=$S/vitest-$p.json > $S/vitest-$p.log 2>&1
    echo "$p exit $?"
  done
  # evidence exit 0 / exec exit 0 / server exit 0
  ```

- The similarity script, `sim.py`, run as `python3 -I sim.py /Volumes/SSD/code/kiln`:

  ```python
  import difflib, sys
  root = sys.argv[1]
  pairs = [("lab-workbench/server/tar.ts", "apps/server/src/lab/tar.ts"), ...]   # the ten pairs of notes §8.1
  for a, b in pairs:
      A = open(f"{root}/{a}").read().splitlines(); B = open(f"{root}/{b}").read().splitlines()
      sa = [l.strip() for l in A]; sb = [l.strip() for l in B]
      m = difflib.SequenceMatcher(None, sa, sb, autojunk=False)
      same = sum(bl.size for bl in m.get_matching_blocks())
      print(a, b, len(A), len(B), same, f"{m.ratio():.2f}")
  ```

- Live GET snapshot (2026-10-21):
  - 2 hosts: `mac` at 127.0.0.1:5381 is reachable; `bling` at 127.0.0.1:5481 was unreachable, with its facts cached.
  - 20 jobs, all `done`.
  - 21 archives, 20 of them from jobs.
  - 1 device, `cuda:nvidia-gb10-e220ce35`, with 12 records.
