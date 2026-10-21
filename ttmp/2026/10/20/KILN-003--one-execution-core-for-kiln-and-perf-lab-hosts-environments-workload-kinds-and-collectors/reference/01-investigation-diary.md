---
Title: Investigation diary
Ticket: KILN-003
Status: active
Topics:
    - kiln
    - perf-lab
    - gpu
    - backend
    - evidence
DocType: reference
Intent: long-term
Owners: []
RelatedFiles:
    - Path: repo://ttmp/2026/10/20/KILN-003--one-execution-core-for-kiln-and-perf-lab-hosts-environments-workload-kinds-and-collectors/scripts/01-verify-measure-context.mjs
      Note: Headless W-18 Measure check from KILN-002 Step 15, the P1 acceptance run
ExternalSources: []
Summary: 'Investigation diary of KILN-003: how the execution-core design was reached, what was verified on the hosts, and what each phase recorded.'
LastUpdated: 2026-10-20T19:55:54.821569-04:00
WhatFor: Resuming KILN-003 work; checking why a design decision was taken.
WhenToUse: Before starting a phase of the execution core, or when a decision in the guide needs its reason.
---

# Investigation diary

This diary records KILN-003 in investigation format: one numbered step per milestone, each opening with what was
intended and what came out, then the prompt context, the work, and what a reviewer should check. The guide is
`design-doc/01-intern-guide-one-execution-core-for-kiln-and-perf-lab.md`; section numbers below (§n) refer to it.

## Step 1: From questions about Perf Lab to one execution core (the guide)

A sequence of questions about what Perf Lab does, how it knows which code a candidate runs, and how Kiln and Perf Lab
could share one experiment model ended with the question of what a GPU host such as `bling` should run, and how it
could say what it is able to run. The answer was a design with five separable concerns (host and transport,
environment, workload kind, collector, plan and driver), and the user asked for it as a new ticket with an intern
guide, ML-PERF-003 closed as superseded, and the guide on the reMarkable. While the guide was being written the user
added that the goal is to simplify and unify around a core model, even at the cost of functionality.

The outcome is a 33-section guide that replaces Kiln's executors, Perf Lab's runner and ML-PERF-003's designed SSH
executor with one model: captures run by jobs on hosts, planned from workload kinds and collectors that live in one
browser-safe package, executed by one standard-library driver, imported from content-addressed result archives into
one catalog. §12.2 lists eleven removals, each with what replaces it and what is lost. No code was changed in this
step; the only host commands were read-only inspections.

### Prompt Context

**User prompts (verbatim, 2026-10-20, in order):**

- "so what does perf lab do?"
- "how does it know what the job is? what code does it run when you run a candidate"
- "so, if we wanted kiln and perf lab to be tightly integrated, so that a hypothesis and such is about kiln programs,
  how would that work?"
- "like what I want to be able to do is define / write a compiler pass in kiln for example, then set up an
  experiment, and run it, and then get all the detailed perf data (lanes, gpu occupation, whatever else perf lab
  already has) in kiln. is that how it works?"
- "so give me a few concrete real life scenarios, whereI want to optimize some GPU processing of a model. Tell me
  what I do, what runs, what gets measure, how it gets displayed, for each experiment."
- "so what would be running on the spark for example, or basically any target where we want to run things. Can it
  advertise like "hey i can run kiln code, and also playback stuff, and this stuff?" how would you handle that to
  have a clean core architecture that we can then extend to all kinds of cases, make it more composable"
- "Yeah, create a new docmgr ticket, close ML-PERF-003 as superseded, and Create a detailed analysis / design /
  implementation guide that is for a new intern, explaining all the parts of the system needed to understand what it
  is, with prose paragraphs and bullet points and pseudocode and diagrams and api references and file references. It
  should be very clear and technical. Store in the ticket and upload to remarkable."
- Added while the guide was being written: "the goal here is really to solidify, simplify, streamline, unify, make
  things composable and extensible around a core model. potentially this means losing / changing some functionality
  as well, but this is a prototype."

The first six were answered in the conversation; the prompts are quoted from the session transcript.

**Assistant interpretation:** Write a design and implementation guide in the Kiln repository's new ticket KILN-003
that an intern can build from: what exists (with file and line references), the core model, the design of each part
with pseudocode and formats, the API, and phases with acceptance runs. Close ML-PERF-003 as superseded, pointing to
KILN-003. Upload the guide. After the added message: make the design remove and merge paths rather than add a fourth
mechanism, and say what is lost.

**Inferred user intent:** One coherent foundation on which a compiler pass, a Playback service change or a new
profiler can be measured on any GPU host with the same evidence model, so that later work extends registries instead
of adding paths.

### What I did

- Created the ticket with `docmgr ticket create` in `/Volumes/SSD/code/kiln` (title "One execution core for Kiln and
  Perf Lab: hosts, environments, workload kinds and collectors"; topics kiln, perf-lab, gpu, backend, evidence) and
  the design-doc and diary documents.
- Read, and cited by line, the code the design replaces or keeps: `apps/server/src/jobs.ts` (`parseJob` :150, `kick`
  :302, `execute` :325, `ncu: false` :358), `apps/server/src/executors/{types,index,cuda-runner}.ts` (`shq` :40,
  constructor :58, `exec` :128), `runner/kiln_runner.py` (`NCU_METRICS` :44, `build` :165, `run_kernel` :236,
  `profile` :265, `run_bundle` :292), `runner/docker/*`, `runtime/python/kiln_launch.py` (`gen` :65, `CudaProgram`
  :309, `launch` :372), `packages/evidence/src/{identity,record}.ts`, `apps/server/src/{db,security}.ts`,
  `apps/server/src/lab/routes.ts`, `apps/workbench/src/server-sync.js`, `ui/Jobs.jsx`, `ui/Perf.jsx`
  (`DevicesView` :423), `ui/lab/api.js`; Perf Lab's `server/runner.ts` and `server/importer.ts`; ML-PERF-003's
  guide §6.7 (recipes) and §6.13 (`run.py` changes).
- Read the redaction benchmark tooling in the C3 worktree (`/Volumes/SSD/code/playback-kiln-002`):
  `scripts/bench_segment.py` and `scripts/parse_segment_timing.py`, and the `metric:segment_timing` log line in
  `src/video_pipeline.py:1158`.
- Inspected both hosts read-only (commands under Technical details).
- Wrote the guide in six parts in the session scratchpad and assembled them with the docmgr frontmatter; formatted
  tables with Playback's `scripts/format-md-tables.py`.
- After the added message, rewrote Part III's opening: a core-model chapter (§11: nine nouns, operations as capture
  sets, the page as a host, the browser-safe `@kiln/exec` package), principles plus a removal table (§12), and
  removed the planned `hosts:migrate` path in favour of deleting `executors.json` in Phase 1.
- Copied the headless W-18 Measure check from KILN-002 Step 15 into `scripts/01-verify-measure-context.mjs`; Phase 1
  uses it as an acceptance run.

### Why

- **One model instead of a fourth mechanism.** ML-PERF-003's SSH executor would have been a third way to reach a GPU
  next to Kiln's executor and Perf Lab's runner. Its decisions are sound, so the guide keeps all of them (§26) and
  moves them into a model that also carries Kiln kernels and programs.
- **Facts probed, offers derived.** The user's "can it advertise" question has a trap: a host that declares its
  abilities goes stale when an image changes. Deriving offers from probed facts with the planner's own requirement
  checks makes the advertisement and the plan agree by construction (§12.1, §18).
- **Collectors separate from kinds.** Today the runner has its own `ncu` call and Perf Lab's DINO workload its own
  `torch.profiler` call; neither applies to the other's code. A wrapper collector works on every kind (§20.1).
- **Removals.** The user allowed losing functionality. CUDA without the Kiln server (runner `serve`, bundles) and CPU
  lab runs on the Mac are the two real losses; both are paths that only one person used and that would otherwise keep
  a second execution path alive.

### What worked

- Every line reference in Part II was checked against Kiln commit `0857384` after the drafts were written.
- The redaction service already has both pieces the `playback-redaction/1` kind needs: a production-pipeline
  benchmark that keeps its output in a temporary directory, and a stage-time log line with a documented parser.
- Both hosts already have Nsight Systems and Nsight Compute installed on the host, so the `nsys` collector can start
  with a tool mount on both (§31).

### What didn't work

- Five line references in the drafts were off by up to 24 lines: `cuda-runner.ts:63`, `:64`, `:152`, `:44` and
  `jobs.ts:303`. Corrected to `:58`, `:59`, `:128`, `:40` and `:302` after `grep -n`.
- `python3 scripts/format-md-tables.py` split three table cells that contained an escaped pipe
  (`'isolated' \| 'in-program'`, `'base' \| 'boost'`, `'executed' \| 'imported'`) into two columns each, leaving
  rows 1421, 1422 and 1676 of the assembled guide with one column too many. Rewording the cells with "or" fixed it; a
  column-count check over every table then reported 0 mismatches.
- The first draft put the GPU lock in `/tmp`. `bling`'s `/usr/lib/tmpfiles.d/tmp.conf` has `D /tmp 1777 root root 30d`,
  so systemd-tmpfiles ages `/tmp`; the lock moved to `/run/lock`, which is mode 1777 on both hosts and is not aged.

### What I learned

- The redaction service's per-stage split exists only in `metric:segment_timing` log lines; the HTTP response and
  the `.redact.json` sidecar carry neither (`parse_segment_timing.py` docstring). A kind that wants stage times must
  read the step's log, which is why `stage-timers` is a log-reading collector.
- The runner profiles a kernel by running its harness as `exe 1 0` under `ncu` (`kiln_runner.py:265`). Wrapping the
  whole runner with `ncu` would replay every timed launch, so the `ncu` collector carries a `singleLaunch` hint that
  `kiln-kernels/1` honours by setting one launch and no warm-up (§20.4).
- `dgx` already has `kiln-perf:latest` (image ID `9171fc4650fb`), Playback detection and redaction images, `nsys` and
  Nsight Compute, and `RmProfilingAdminOnly: 1`, like `bling`.

### What was tricky to build

- **Records need timing samples, and `ncu` runs cannot provide them.** A `kiln-measure/1` record requires
  `timing.samples`, but an `ncu` run's times are replayed and base-clocked. The rule "counters never travel alone"
  (§20.3) makes the planner add the timing capture of the same variant, and the projection merges `timing` from
  undisturbed runs with `counts` from the `ncu` run of the same content ID, device and job (§23.3).
- **Ordering at two levels.** Kiln's runner orders kernels inside one process; Perf Lab ordered processes. One
  function, `ctx.order` over `repetitionOrder`, serves both: kinds use it inside a step, the planner uses it across
  groups (§19.1, §22.2).
- **Mode versus collector set.** Perf Lab's capture modes and Kiln's absent profiler options collapse into one notion
  once a mode is defined as a name for a collector set and identity holds the set (§20.3, §21.1).

### What warrants a second pair of eyes

- The removal table (§12.2), in particular deleting the runner's `serve` mode and the page's bundle path, and
  dropping Perf Lab's imported job history with `lab_jobs`.
- The table renames of §23.5 (`lab_runs` → `runs` and others) and their effect on `lab:import` and on the lab dock.
- Tune rounds approved by the person who started the Tune (§24.3): a change of approval policy for GPU hosts.
- The assumption that a mounted `nsys` runs inside Playback's images; only `--version` is probed (§32).
- The lock file mode: the first creator must `fchmod` it to `0666`, or a second user on the host cannot take it
  read-write (read-only `flock` still works).

### What should be done in the future

- Phase P0 (§29): `@kiln/exec`, host profiles, transports, driver `probe`, capability documents in Devices.
- The counters decision on `bling` (`NVreg_RestrictProfilingToAdminUsers=0` and a reboot, §31.2) still needs the
  user's go-ahead; it has not been made.
- KILN-002 task `udht` (sweeps) becomes a job body in P1 rather than its own mechanism (§24.4).

### Code review instructions

- Read §11, §12.2, §19.1, §20.1, §22.6 and §24 first; they carry the model. Then check Part II's line references
  against Kiln `0857384`.
- Validate: `docmgr doctor --ticket KILN-003`.

### Technical details

Read-only host inspection on 2026-10-20:

```bash
ssh manuel@bling.local 'stat -c "%A %U %n" /run/lock /tmp; grep -h "^[^#].*\(/tmp\|/run/lock\)" \
  /usr/lib/tmpfiles.d/tmp.conf /usr/lib/tmpfiles.d/legacy.conf'
# drwxrwxrwt root /run/lock
# drwxrwxrwt root /tmp
# D /tmp 1777 root root 30d
# L /var/lock - - - - ../run/lock

ssh playback@dgx 'stat -c "%A %U %n" /run/lock; command -v nsys ncu; ls -d /opt/nvidia/nsight-*; \
  grep RmProfilingAdminOnly /proc/driver/nvidia/params; docker image ls … | grep -i "detection\|kiln\|redaction"'
# drwxrwxrwt root /run/lock
# /usr/local/bin/nsys
# /opt/nvidia/nsight-compute  /opt/nvidia/nsight-systems
# RmProfilingAdminOnly: 1
# kiln-perf:latest 9171fc4650fb, playback-detection:pb-obs-001-59c13eed4 6d9ae9aece22,
# playback-redaction:pb-obs-001-59c13eed4 79d97af27838, pb-dgx-sim-redaction:latest 031c4be93678, …
```

`ncu` is not on `PATH` on `dgx` (only under `/opt/nvidia/nsight-compute`); on `bling` it is at
`/usr/local/cuda-13.0/bin/ncu` (KILN-002 Step 13).
