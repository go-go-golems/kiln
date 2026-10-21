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

## Step 2: One HTTP API on every host instead of local and SSH transports

The user asked whether the design could say that every runner exposes the same API over one conduit, HTTP, instead
of `local` and `ssh` transports, and what would be lost. I answered that one API is a clear simplification and that a
pure-HTTP conduit would lose SSH's authentication, encryption and zero-install deployment. The user decided: plain TCP,
a local HTTP server on the server's own machine too, and no authentication, because drivers run only during active
development. The guide now has one driver API (§13.2) and no transports.

The decision moves job ownership from a connection to the driver. That removes more than the transports: the
`heartbeat` event, the stdin end-of-file lifetime, label-scanning reconciliation as a subcommand, and the P6 agent
transport all go, and two servers sharing a host are serialized by the driver's queue. One fact found while revising
constrains deployment: `dgx` is at a Tailscale address that the Mac reaches and `bling` does not.

### Prompt Context

**User prompts (verbatim, 2026-10-20):**

- "how can i give manuel admin rights to get access to ncu cuda gpu perf on bling?"
- "can we simplify to say "every runner exposes the same API, there is one conduit for it all, we don't need
  ssh/local/etc... one http?" or would we be missing something?"
- "plain TCP is fine, this is all local. same with the remote / local stuff, we can just run a local HTTP server too.
  let's leave authentication out of this, it's fine, this will only be started when doing active development anyway"

(An "open with md-view view" request in between opened the guide in the md-view desktop viewer.)

**Assistant interpretation:** Replace the `Transport` interface (local, ssh, agent) with one HTTP API served by the
driver on every host, the local host included; no authentication; drivers started by hand. Revise every section that
mentioned transports, SSH, stdin lifetime or the agent phase, and re-upload.

**Inferred user intent:** Fewer mechanisms in the core: one client, one server program, one way to reach any host.

### What I did

- Answered the `ncu` question from bling's state (read-only): `manuel` is in groups `sudo` and `docker`;
  `/etc/modprobe.d/` sets no profiling option; `RmProfilingAdminOnly: 1`. The NVIDIA driver reads counters only with
  `CAP_SYS_ADMIN`, so there is no group to add `manuel` to; the options are the module option plus a reboot, `sudo
  ncu`, or a root container with `--cap-add SYS_ADMIN`. Nothing was changed on bling.
- Checked reachability for the HTTP design: on the Mac `dgx` resolves to `100.103.58.32` (a Tailscale address); on
  `bling`, `getent hosts dgx` finds nothing and `bash -c '</dev/tcp/100.103.58.32/22'` fails. `bling` listens on
  `127.0.0.1:5280` (the Kiln server) and nothing on 5281.
- Revised the guide with a script of exact replacements (`scripts/02-revise-guide-http-driver.py`, run once on the guide):
  §13 rewritten as "Hosts and the driver API" (profiles with `url`, the API table, `DriverClient`, the host root
  with `blobs/`, a new §13.4 on starting and updating a driver); §22.6 rewritten around `POST /v1/jobs`, a queue and
  persisted events; §24.2 (the driver's queue), §27 (no authentication, by decision), §28.2 (the driver's one
  subcommand and its events), §31.1 and §31.3 (start commands, the Tailscale finding), §32 and §33; smaller edits in
  §1, §3, §11, §12, §15, §19, §23, §26, §29 and §30.
- Edited tasks `jygn`, `si2b` and `bieo` to match.

### Why

- **Job ownership.** With SSH, a job lived as long as its connection, which is why the design had a heartbeat, a
  stdin lifetime and an agent transport deferred to P6. A driver that owns its jobs makes all three unnecessary.
- **Long polling.** `GET /v1/jobs/:id/events?after=<seq>&wait=<s>` needs nothing beyond `http.server`, and a dropped
  request loses nothing; streaming would need connection state on both sides.
- **Blobs.** Content-addressed uploads replace tar-over-SSH and the separate `media/` directory, and send a Playback
  source tree or dataset image to a host once.
- **Self-update.** `PUT /v1/self` keeps what installation by content hash gave the runner: the server's copy is the
  one that runs, without a person redeploying after each edit.

### What worked

- The revision applied with every replacement asserted; the table check reported 0 column mismatches and balanced code
  fences; no occurrence of "transport" remains in the guide.

### What didn't work

- N/A

### What I learned

- `dgx` is reachable only over Tailscale. A server on `bling` cannot use a driver on `dgx` until `bling` joins the
  tailnet; a server on the Mac can use both (`http://bling.local:5281` with bling's driver on its LAN address).

### What was tricky to build

- Deciding what "reconcile" means once the driver owns jobs: the driver's own restart recovery ends interrupted jobs
  with a partial archive, and the server's part shrinks to comparing `GET /v1/jobs` with its rows.

### What warrants a second pair of eyes

- §27: without authentication, anyone who reaches a driver's port can run GPU containers as a `docker`-group user.
  The guide asks for one listen address per driver and `127.0.0.1` when the server is local; on `dgx`, the
  Tailscale address limits exposure to the tailnet.
- `PUT /v1/self` replaces running code on request; it is refused while a job runs.

### What should be done in the future

- Decide where the server runs for two-host work (the Mac, or `bling` on the tailnet) before P4.

### Code review instructions

- Read §13 in full, then §22.6, §24.2, §27 and §31.3. Validate with `docmgr doctor --ticket KILN-003`.

### Technical details

```bash
ssh -G dgx | grep -E '^(hostname|port) '          # hostname dgx, port 22
dscacheutil -q host -a name dgx                    # ip_address: 100.103.58.32
ssh manuel@bling.local "getent hosts dgx || echo 'dgx: no name on bling'; \
  timeout 3 bash -c '</dev/tcp/100.103.58.32/22' && echo reachable || echo not-reachable"   # no name; not-reachable
ssh manuel@bling.local 'id; grep -rn NVreg /etc/modprobe.d/; grep -i profil /proc/driver/nvidia/params'
# groups=…,27(sudo),…,988(docker)
# nvidia-graphics-drivers-kms.conf: NVreg_PreserveVideoMemoryAllocations=1, NVreg_TemporaryFilePath=/var
# RmProfilingAdminOnly: 1
```

## Step 3: The execution core on the server: hosts, the driver, one job API, import into runs

This step builds P0 and most of P1 on the server side: `@kiln/exec` (the model, the registries of workload kinds and
collectors, requirements, offers, identity, the planner and the run builder), `runner/kiln_driver.py` (the one HTTP
driver), and the server's `src/exec/` (hosts and their capability documents, the job API, archive import). The old
execution paths are deleted rather than adapted: `src/executors/`, `src/jobs.ts`, the runner's `serve` mode and
`kiln-docker-python`. Perf Lab's job tables and lab-local hosts go too; what Perf Lab measured survives as captures.

The tests run the production path end to end. A real `kiln_driver.py` starts on a free port with a fake `docker` and
`nvidia-smi`; the server plans a job, submits it, follows its events, fetches the archive and imports it. The step
ended with the whole workspace green: 80 server tests, 11 exec tests, 133 and 98 in the other packages. The page's
views (Devices, Jobs, the lab dock) still speak the old API and are the next step.

### Prompt Context

**User prompts (verbatim, 2026-10-20):**

- "Ok, implement it, streamline, no backwards compatibilitty, this was all prototyping and now we have something
  concrete to pull on. What happened to all those rich views from perf-lab btw? are they integreated? \n\nAnswer and
  stop, we'll implement after your answer"
- "perfect. Implement, btw commit at appropriate intervals and keep a detailed diary as you work (using the diary
  format from the skill)."
- Sent while the work was under way: "i'm gonna go swim. When it comes time to test and such, run the frontend on the
  mac, a runner on the mac and a runner on bling, and then collect a whole set of data so we can see all the pretty
  widgets and such. Add necessary presets and what not too. Take screenshots for the diary and the report we will
  write. btw commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the
  skill)."

**Assistant interpretation:** Implement the guide's core without compatibility layers. The scope agreed in the answer
to the first prompt: Perf Lab's Plan tab becomes the Jobs view's plan and dry run, the Runs tab and the Inspector are
ported, imports write `corresponds_to` links from runs to Kiln identities, and the Graph tab and the `lab.js` editor
are left out. Testing happens on real hosts (a server and a driver on the Mac, a driver on bling) with a full data
set, presets and screenshots.

**Inferred user intent:** One execution path that both Kiln and the lab use, proven on real hardware, with enough data
in it to judge the views.

**Commit (code):** see the commit that adds this step ("KILN-003 P0/P1: …").

### What I did

- **`packages/exec` (`@kiln/exec`)**, pure TypeScript with no I/O:
  - `model.ts`: hosts, facts, capability documents, captures, groups, plans (`kiln-plan/1`), steps, observations;
  - `registry.ts`: the `WorkloadKind` and `Collector` interfaces, `environmentBlock` (the image id, never a tag);
  - `requirements.ts`, `offers.ts`: a requirement checked against facts gives a verdict with a reason; offers are
    the same checks applied to every kind and collector, so the capability document and the planner cannot disagree;
  - `identity.ts`: `captureId` over kind, content id, collector set, protocol, device and environment;
  - `plan.ts`: `planJob` accepts every capture through its kind (which recomputes the content id), drops optional
    collectors the host does not offer, marks `execute`, `cached` or `blocked` with a reason, adds the timing
    companion of a counters capture, groups by kind, collectors and pair id, and lowers each group per repetition in
    the protocol's seeded order;
  - `runs.ts`: `stepRuns` turns one step's observations into one bundle per (capture, repetition) in the lab's
    entity model, with a `corresponds_to` link from each measured kernel to `kiln:identity:<identity>`;
  - `kinds/kiln-kernels.ts`: `kiln-kernels/1` (accept, lower to a `kiln-bundle/1` per repetition, import the
    runner's `kiln-results/1`, project `kiln-measure/1` records in `finish`);
  - `collectors/`: `cuda-events`, `ptxas`, `nvtx`, `stage-timers`, `ncu`, `nsys`, and `gpu-sampler` (a sidecar the
    driver runs; optional, so a timing capture on a host without `nvidia-smi` is still planned).
- **`runner/kiln_driver.py`**, standard library only: `/v1/info`, `/v1/probe`, `/v1/blobs/:sha`, `/v1/jobs` (submit,
  list, events with long polling, cancel, archive, delete), `/v1/plan`, `PUT /v1/self`; a FIFO queue, a GPU lock file
  shared between drivers, conditions snapshots before and after, the sampler, restart recovery.
- **`apps/server/src/exec/`**: `driver-client.ts`, `hosts.ts` (probe with a TTL cache and de-duplicated concurrent
  probes; self-update when the driver's hash differs and it is idle), `jobs.ts` (the lifecycle in its header comment),
  `import.ts`, `nsys-sqlite.ts` (node:sqlite, read-only), `routes.ts` (`/hosts`, `/jobs`, `/archives`), `assets.ts`.
- **Database migration 3** (`src/db.ts`): new `jobs`, `job_events`, `job_captures`; `captures`, `runs`, `run_bundles`
  replace `lab_artifacts`, `lab_runs`, `lab_run_bundles` (measured artifacts are copied, synthetic ones dropped);
  `lab_evidence_archives` becomes `archives` with a `job_id`; `devices` gains `host`.
- **Removed**: `src/executors/` and `test/executors.test.ts`, `src/jobs.ts`, `src/lab/probe.ts`, the lab's seed, job,
  host and evidence routes, `runner/docker/kiln-docker-python`, `test/support/fake-runner.mjs`; `kiln_runner.py` keeps
  only `device` and `run <bundle> --out`.
- **Tests**: `test/support/server.ts` rewritten around `startDriver()` (a real driver with the fakes of
  `test/support/bin/`), `hostProfile`, `kernelInput`, `jobBody`. `test/jobs.test.ts` rewritten (22 tests: capability
  documents, an unreachable host, driver self-update, dry run, content ids, symbol canonicalisation, proposer and
  budget rules, limits, caching, the lifecycle, context, output mismatch, queue order, cancel, reimport, a failing
  kernel, a runner exit, cancel while running, the agent budget, server restart, driver restart, two drivers on one
  lock). `client`, `events`, `decide`, `lab`, `lab-import`, `records` and `security` tests moved to the new API;
  `serve-dev.ts` now starts a local driver with the fake GPU.
- **`apps/workbench/src/server-client.js`**: `hosts.{list,capabilities,probe}`, `jobs.{plan,reimport}`,
  `archives.list`; `jobSpec` emits `{host, reason, protocol, captures: [{kind: 'kiln-kernels/1', mode, rerun, input}]}`.

### Why

- **The driver's queue is the only queue.** A server that kept its own queue would need to agree with the driver's
  after every restart; following the driver's events from a stored sequence number needs no agreement.
- **Records are dated by the driver's `result` event**, not by the import. An archive imported again then produces
  the same record ids, and `insert or ignore` makes reimport idempotent.
- **Measure re-measures.** `jobSpec` sets `rerun: true`: a Measure on the page is new evidence, while lab captures
  keep the planner's `cached` verdict.
- **Perf Lab's job history is not imported.** Its jobs ran on a runner that no longer exists; their measured
  captures and runs are imported, and the summary counts the rest under `notImported`.

### What worked

- `pnpm test` at the workspace root: every package passes (server 80, exec 11, and 133 and 98 in the others).
- `pnpm --filter @kiln/server exec tsc --noEmit -p .` is clean, tests included.
- The lifecycle test sees `proposed → approved → running → importing → done`, four containers started by image id
  with `--network none` and the bundle mounted read-only, three valid records on the fake device, twelve runs with
  `sample` entities on `conditions:gpu`, and the `corresponds_to` link to `kiln:identity:id-k_a`.

### What didn't work

- The first run of the new `jobs.test.ts` failed 3 of 22 tests:
  - Queue order: `expected [ '2026-10-21T01:50:19Z', …(2) ] to deeply equal …` — the three jobs' start times were
    19, 20, 19. Each approved job's follower submitted concurrently, so the driver queued them in whatever order the
    HTTP requests landed. Fixed with `Jobs.serial(host, f)`: submissions to one host go one at a time.
  - Reimport: `expected [ …(2) ] to deeply equal [ Array(1) ]` — a second record id appeared. `kernelRecords` used
    the import time as `at`, which is inside the record's hash. Fixed by passing `endedAt` (the `result` event's `at`).
  - Driver restart: `TypeError: Cannot read properties of undefined (reading 'timing')` — no record at all. After a
    SIGKILL, `recover()` wrote `execution.json` with `steps: []`, so the finished repetition was lost. Fixed in the
    driver: each finished step is appended to `steps.ndjson`, and `finish()` builds `execution.json` from it when the
    job never wrote one.
- The relative queue test then failed once more: positions came back 1, 2, 3 instead of 0, 1, 2 because the driver was
  still finishing the previous test's job. The test now compares positions relative to the first.
- The agent-budget stop ended the job `cancelled` with no error, because the server cancels it on the driver. The job
  row now takes the budget message as `error` before cancelling, and `Jobs.outcome()` reports a cancelled job with an
  error as `failed`. A consequence: `import.ts` can no longer use the job's status to recognise the step a cancel
  killed; it now reads the driver's own `execution.json` `status`.
- The Perf Lab importer counted runs of a refused artifact as `synthetic_runs`. It now tracks synthetic hashes
  separately and refuses the others with "its artifact was not imported", as before.

### What I learned

- `step.output` lines arrive in the server's job event list interleaved with step events; the lifecycle test filters
  them before comparing kinds.
- The driver's `job.queued` position counts a running job, so it is not an absolute index.
- Timestamps from the driver have one-second resolution; ordering assertions on them must allow ties.

### What was tricky to build

- **Who decides how a job ended.** Three parties have an opinion: the driver's `result` (done, failed, cancelled),
  the server (the agent budget), and the import (which steps count). The rule now lives in one function,
  `Jobs.outcome(job)`, used both when the job completes and when it is imported again, so the records of a reimport
  say the same thing as the first import.
- **The step a cancel kills.** It exits non-zero, but it did not fail; counting it would add a failed repetition to
  every cancelled job. The import skips the last executed step when the driver's execution status is `cancelled` and
  that step's exit is non-zero.

### What warrants a second pair of eyes

- `Jobs.serial` chains submissions per host in memory. A second server sharing a host is serialized only by the
  driver's queue, so approval order across two servers is not defined (it never was).
- `cancel()` waits up to 15 s for the follower to import the partial archive; a slow archive fetch returns the job
  still `importing`.
- The importer reads archives up to `plan.limits.archiveBytes + 64 MiB` into memory.

### What should be done in the future

- The page: Devices with capability documents, Jobs with the plan and the dry run, the lab dock on `/api/jobs` and
  `/api/archives`, the Runs tab and the Inspector.
- `perf-lab-sampler/1` for CPU work on the Mac; presets for `mac` and `bling`; the deployment and the data set.

### Code review instructions

- Start at `apps/server/src/exec/jobs.ts` (the header comment, `create`, `drive`, `collect`, `outcome`), then
  `packages/exec/src/plan.ts` (`planJob`) and `apps/server/src/exec/import.ts`.
- In the driver, read `execute`, `run_step`, `finish` and `recover` together.
- Validate: `pnpm --filter @kiln/exec test`, `pnpm --filter @kiln/server test`, then `pnpm test` at the root.

### Technical details

The job lifecycle as the lifecycle test observes it, with the event kinds the job keeps (step output omitted):

```text
proposed, approved, submitted, job.queued, driver.started, lock.acquired, conditions,
step.started, step.finished  ×4, conditions, result, done
statuses: proposed → approved → running → importing → done
```

A capture request and its verdict (dry run):

```json
{ "kind": "kiln-kernels/1", "mode": "counters", "input": { "name": "k_a", "contentId": "…" }, "rerun": true }
{ "verdict": "blocked", "reason": "kiln-perf has no ncu: build the image with it or add a tool mount" }
```

The archive a driver returns: `plan.json`, `events.ndjson`, `execution.json` (`kiln-execution/1`),
`conditions/{before,after}.json`, `logs/<step>.{out,log}`, `out/<step>/…` (for kiln-kernels: `results.json`, and
`gpu.csv` from the sampler). `steps.ndjson` stays in the driver's job directory; it exists only so that recovery can
write `execution.json`.

## Step 4: The workbench on hosts: host devices, Jobs with plans and dry runs, Devices with capability documents

This step moves the page onto the API of Step 3. A server device used to be one executor; now it is one host, and
its identity as evidence (the `cuda:<name>-<hash>` device id records carry) is not known until the host's first job
has run, because that id comes from the runner's device report, not from the probe's `nvidia-smi` facts. The page
therefore shows a host as its probed GPU until the first records arrive and then adopts the device those records
name. The browser-side CUDA path (download the runner, export a bundle, import results) is deleted; CUDA runs only as
a job on a host.

The Jobs view now shows what the planner decided: every capture's verdict (execute, cached, blocked, with the
reason), the job's `kiln-plan/1` steps (environment, argv with collector wraps, the capture repetitions each step
serves, sidecars), the result archive as a download, and Reimport. Perf Lab's Plan tab lives here as Dry run, which
plans the current program on the selected host and stores nothing. Devices shows one block per host with its
capability document. The served end-to-end test (`test/server-e2e.mjs`) passes against a real driver.

### Prompt Context

**User prompt (verbatim):** see Step 3. No new prompt; this step continues "Implement" with the agreed scope.

**Assistant interpretation:** Make the page speak hosts, jobs and capability documents, with no adapter for the
executor API, and keep the served end-to-end test as the gate.

**Inferred user intent:** The rich Perf Lab planning views available in Kiln's own Jobs view, on real hosts.

**Commit (code):** 79ab40d — "KILN-003 P1: the workbench on hosts and the one job API"

### What I did

- **`packages/kiln/src/std/devices.js`**: removed `CudaDevice`, `bundle` and `ingest`; `makeDevices()` returns the
  simulators and WebGPU. `cudaTarget` stays (host devices use it).
- **`apps/workbench/src/server-sync.js`**: `HostDevice` (id `host:<host>`) replaces `ServerDevice`. `adopt(hostView,
  device)` takes `GET /hosts` and the device the host's records name (`GET /devices`, latest `cuda` device of that
  host). Status words: `ready`, `not probed yet`, `not reachable: …`, `cannot run kernels: <blocked reason>`.
  `hostDevices()` makes one device per host that offers kiln-kernels/1, is not probed yet, or has GPUs.
- **`apps/workbench/src/ui/wb.js`**: `serverDevices()` reads hosts and devices, keeps `wb.hosts`; `host.updated`
  refreshes them; new `openPlan(id)`, `dryRunJob(device)`, `closeDryRun()`, `probeHost(id)`; `proposeJob` and
  `jobSettled` use `host`. The `RUNNER` export and the bundle/import code are gone.
- **`apps/workbench/src/ui/Jobs.jsx`** (rewritten): the list shows host, capture count, kinds and protocol;
  `importing` is a status; the side panel has Captures (verdict table), Plan (`PlanSteps`), Events, Records, the
  archive link and Reimport; a Dry run block appears above the selected job.
- **`apps/workbench/src/ui/Perf.jsx`**: the "A real CUDA GPU" block (runner download, bundle export, paste import) is
  replaced by `HostBlock`: driver URL, hostname, driver hash and whether it is current, queue, probe time, machine
  (arch, kernel, memory, free disk, docker), GPUs, the GPU-counter permission, an environment table (image ref and
  id, whether the probe container ran, every command/module/tool found with its version), and the offers (kinds and
  collectors, blocked ones struck through with the reason). A Probe button reprobes.
- **`apps/workbench/src/agent/agent.js`**: `jobs.list()` reports host and captures; new `jobs.hosts()`;
  `jobs.propose({ device })` accepts a host id. `reference.txt` describes `host:<id>` devices.
- **Server** (`apps/server/src/exec/hosts.ts`, `jobs.ts`, `db.ts`):
  - `HostView` gains `machine` (the probe's host facts) and `environmentFacts` (per environment: image ref and id,
    ok/error, python, GPU visibility, and `found`: every command, module and tool with its version or null);
  - the `jobs` table gains `plan_steps`, so list views (and `job.updated` events) carry the step count without reading
    plan files;
  - after an import that added records, the server emits `device.updated` for each device the job's records name.
- **`packages/exec/src/kinds/kiln-kernels.ts`**: inputs accept an optional `dtype` (`f32` | `u8`), copied into the
  runner bundle (`kiln_runner.py` already reads `i.get("dtype", "f32")`); the content id ignores it (the source names
  the pointer type). `server-client.js` `jobKernel` sets `dtype: "u8"` from `kern.inDtypes`.
- **`apps/server/test/support/serve-dev.ts`**: writes the fake runner's outputs for jobs announced `proposed` or
  `approved`.
- **Tests**: `server-sync.mjs` (host devices; a job kernel carries u8; no host devices without a server),
  `server-e2e.mjs` (host device ids, evidence id adopted after the first job, captures and steps in the job view),
  `exec.test.ts` (u8 reaches the bundle; `f16` is refused).

### Why

- A host is the unit the server plans for and the driver queues on; a page device per executor no longer exists.
- The evidence id cannot be guessed before a job: the runner's `cudaGetDeviceProperties` report (SM count, shared
  memory per block, driver integer, clocks) is what is fingerprinted, and `nvidia-smi` does not report all of it.
- `plan_steps` as a column: `toView` used to read the plan file only for detailed views, so every `job.updated` said
  `steps: 0`. Reading up to 200 plan files per list was the alternative.

### What worked

- `pnpm --filter @kiln/server test`: 80 passed. `pnpm --filter @kiln/exec test`: 12 passed. `pnpm --filter
  @kiln/workbench test`: 5 files passed (`server-sync.mjs` 28 checks). `pnpm --filter @kiln/kiln test`: 13 passed.
  Server `tsc --noEmit` clean.
- `node test/server-e2e.mjs` (Chrome, dev server with a real `kiln_driver.py` and the fake runner): all passed —
  job `on dev-fake: 1 captures, 7 steps; events proposed → approved → submitted → job.queued → driver.started →
  lock.acquired → conditions → step.started → step.output → step.finished → result → done; statuses seen approved →
  running → importing → done`; the record is valid, fresh, on `cuda:fake-gpu-development-2b7b53f8`; the compile then
  decides "by evidence (confirms the model)".

### What didn't work

- First `pnpm --filter @kiln/workbench test`: `FAIL a token without the Kiln server behind it: no server, the runner
  device stays` — the test expected the deleted runner device. Rewritten to expect no host devices.
- First e2e: `Error: timed out waiting for (… j?.status === "done" && … wb.run.decisions.some((d) => d.by ===
  "evidence") …)`. The diagnostic dump showed the job `done` with one record but decisions `["model"]`. Two causes,
  found in turn:
  1. The device had no evidence id: nothing told the page that the host now had a device. Fixed by `device.updated`
     after import. The dump then showed `"ev": "cuda:fake-gpu-development-2b7b53f8"` matching the record, still
     `"model"`.
  2. The record was `invalid`: `serve-dev.ts` wrote the fake outputs only on `job.updated` with status `proposed`, but
     a user's job is created `approved`, so the fake runner returned outputs that failed the check. Fixed by writing
     them for `proposed` or `approved`.
- Third e2e: three expectation failures — `the host device: CUDA Fake H100 · dev-fake · null`, `1 captures, 0 steps`,
  `on null`. The first and third were the old assumption that the evidence id exists before a job (the test now
  asserts it does not, and that the device adopts it after); the second was the `steps: 0` list view (fixed by
  `plan_steps`).
- A `Write` of `Jobs.jsx` was refused ("File has not been read yet") because the file had been read with `cat`; the
  parallel `Bash` edits to `wb.js` and `jobs.css` did land. Re-read and wrote again.

### What I learned

- Before a host's first job its page device decides schedules against a target built from `nvidia-smi` facts (`cc`
  9.0 → the H100 spec, 132 SMs); after it, against the runner's report. Both gave the same kernel here, but on a GPU
  whose SM count or shared memory differ from the spec table, the first Measure can be of a different schedule than
  the one compiled after it.
- The serve-dev hook is the one place test data is injected; a status filter there silently invalidates records
  rather than failing the job.

### What was tricky to build

- The order of `records.added` and `device.updated`: records arrive first, the page compiles (still without an
  evidence id, so "model"), then the device update sets the id and `serverDevices()` recompiles because
  `evidenceId !== was`. The e2e waits on the end state, not on the first compile after the records.

### What warrants a second pair of eyes

- `HostDevice.adopt` picks the host's *latest* `cuda` device. A host with two GPUs, or a driver/firmware change that
  makes a new fingerprint, gives the page whichever device measured last.
- `device.updated` from `importStored` also fires on Reimport; harmless (the page re-reads devices) but chatty.

### What should be done in the future

- The lab dock still sets no host reports (`setLocalReport(null, "host reports move to /api/hosts")`); Step 5 replaces
  the synthetic `HOSTS` with reports derived from `/api/hosts`.
- Screenshots of Jobs and Devices come with real hosts (Mac and bling), not the fake GPU.

### Code review instructions

- Start with `apps/workbench/src/server-sync.js` (`HostDevice`, `hostDevices`), then `wb.js` (`serverDevices`,
  `openPlan`, `dryRunJob`, `probeHost`), then `Jobs.jsx` and `HostBlock` in `Perf.jsx`.
- Validate: `pnpm --filter @kiln/workbench build && node apps/workbench/test/server-e2e.mjs`.

### Technical details

The diagnostic dump that found the invalid record (from the e2e's `catch`):

```json
"recDev": [["cuda:fake-gpu-development-2b7b53f8", "invalid", "f061c1b3…"]],
"target": ["CUDA Fake GPU (development)", 132, 49152],
"devs": ["host:dev-fake=cuda:fake-gpu-development-2b7b53f8"]
```

## Step 5: Perf Lab's local workload as a Kiln kind, and lab programs on real hosts

Perf Lab measured its local sampler with its own lab server: a Node process that ran `python -m perf_lab_local.run` on
the Mac, wrote runs into its SQLite store, and reported one host, `local`. This step makes that workload a Kiln
workload kind, `perf-lab-sampler/1`, that any host with a `perf-lab-cpu` environment can run, and makes the Lab view
plan and run on the server's hosts. The page derives one capability report per probed host from `GET /api/hosts`; a
lab program names `mac` or `bling` instead of `local`; the Lab view gains Plan and Runs; and Perf Lab's Inspector
becomes the dock view Inspect.

The step also found that the server read every capture a job imported as synthetic, and moved the lab capture hash
(Perf Lab's cyrb53 over a stable stringification) from the server into `@kiln/exec`, where the sampler kind needs it
to name its captures the way the lab does.

### Prompt Context

**User prompt (verbatim):** the implementation request is quoted in Step 3. During this step the user added:

> i'm gonna go swim. When it comes time to test and such, run the frontend on the mac, a runner on the mac and a runner on bling, and then collect a whole set of data so we can see all the pretty widgets and such. Add necessary presets and what not too. Take screenshots for the diary and the report we will write. btw commit at appropriate intervals and keep a detailed diary as you work (using the diary format from the skill).

**Assistant interpretation:** Finish the agreed scope (Perf Lab's Plan folded into Jobs, Runs and the Inspector
ported, `corresponds_to` links), make the lab's measured workload runnable on the Mac and on bling, then deploy a
server and two drivers and collect real data with screenshots.

**Inferred user intent:** One system in which Perf Lab's programs run on the same hosts and through the same job API
as Kiln's kernels, demonstrated with real measurements rather than fixtures.

**Commit (code):** 8276bf7 — "KILN-003 P1: perf-lab-sampler/1, CPU hosts, and lab programs on real hosts"

### What I did

- **`packages/exec/src/kinds/perf-lab-sampler.ts`** (new): input `{labId, ref, spec}`; `accept` checks that the ref
  names the spec's experiment, arm and `collection.mode`, and computes the content id from the spec without `host`,
  `repeat` and `collection.mode` (those are the device, the protocol and the collectors) plus the sha256 of the three
  staged workload files. `lower` stages `workload/perf_lab_local/*.py` and one `specs/<capture>.json` per capture,
  with `collection.mode` set from the collector set (`samplerMode`), and makes one step per capture and repetition:
  `python -m perf_lab_local.run --spec … --rep N --out /job/out`, `PYTHONPATH=/job/in/workload`, the Inductor cache in
  the `perf-lab-cache` mount, 900 s. `import` is Perf Lab's `importRepetition` turned into one observation per
  repetition (`samplerEntities`). `lab(c)` returns `{labId, hash, ref}`, which the importer writes into
  `captures.lab_id/lab_hash/experiment/arm/mode`.
- **Collectors and modes** (`packages/exec/src/collectors/index.ts`): in-process `wall-clock`, `rusage`,
  `torch-profiler` (disturbs latency), `torch-memory` (disturbs latency and memory); modes `cpu`, `trace`, `memory`;
  `timing` gains `wall-clock`, so one mode name means CUDA events for kernels and the wall clock for the sampler.
- **`packages/exec/src/registry.ts`**: `accept(input, at, ctx)` with `ctx.asset(name)`, so a kind's content id can hash
  the bytes it will stage.
- **`packages/exec/src/identity.ts`**: on a host without a GPU, `deviceKey` is `cpu:<arch>:<model>:<cores>`;
  `runner/kiln_driver.py` reports `host.cpu` (sysctl `machdep.cpu.brand_string` on darwin, `/proc/cpuinfo` or `lscpu`
  on Linux) and memory (`hw.memsize`).
- **`packages/exec/src/lab-hash.ts`** (new): `cyrb53`, `stableStringify`, `labCaptureHash`. The server's
  `apps/server/src/lab/captures.ts` is deleted; its vector tests moved to `exec.test.ts`.
- **Server**: `GET /api/hosts` returns `workloads.perf_lab_local`, the revision of the workload sources computed as
  `probe.py`'s `workloads_revision` (sha256 over every `*.py` by name, name bytes then file bytes, 12 hex digits;
  `1fc6b670a8a6` for the repository's copy). `catalog()` marks every available capture `measured`.
- **`packages/lab`**: `HostReport` and `hostReport(view, workloads)` replace the single local report; `capabilitiesFor`
  prefers a real report and falls back to the synthetic `playback@dgx`/`playback@rtx-dev`. `local-sampler.lab.js`
  takes `host` as a parameter (`mac` | `bling`); `dino-pr1005.lab.js`'s `dino-local` names `mac`.
- **Workbench**: `api.js` `setHosts(hosts, workloads)` and `labJobs(labId, captures)` (one approved job per host and
  repetition count, `pairId` = experiment, seed = the experiment's `paired_order_seed`); `state.js` re-derives reports
  on the `hosts` channel, re-reads the catalog on `catalog.changed`, applies a pending plan once its captures exist,
  seeds only captures on hosts without a report, and has `runPlan(captures, {dryRun})`; `LabView.jsx` gains Plan and
  Runs; `InspectView.jsx` is the new `inspect` dock view; `Jobs.jsx` exports `Verdicts` and `PlanSteps`.
- **Image**: `runner/docker/perf-lab-cpu/Dockerfile` (python 3.12-slim, g++, torch 2.14.1+cpu, numpy 2.5.4); built on
  the Mac as `perf-lab-cpu:latest` (af6e978b3c8c).
- **Tests**: 7 sampler tests in `exec.test.ts`; `client.test.ts` checks `workloads`; `lab-e2e.mjs` checks Plan, Runs
  and Inspect; `agent-e2e.mjs` uses `host:dev-fake`.

### Why

- A lab capture and a Kiln capture are different names for one thing: the lab names it by the hash of its spec, the
  server by the content id the kind computes. Writing the lab's name into the `captures` row at import is what lets a
  build find the runs of a job it submitted (`catalog()` is keyed by `lab_hash`).
- The host is part of every lab capture hash (`spec.host`). Keeping `local` would have tied programs to a host that
  no longer exists; naming Kiln hosts makes the same program plan on the Mac or on bling.
- Seeds exist so that a program shows generated runs for hosts that only exist as synthetic reports. A capture on a
  host with a real report must never be seeded, or the plan would call it cached and the boards would show fiction
  labelled as a cached capture.

### What worked

- `pnpm --filter @kiln/exec test` 20 passed; `@kiln/server` 79; `@kiln/lab` 98; workbench unit 5 files. `tsc` clean
  for exec, server and lab.
- `node test/lab-e2e.mjs`: all passed — dino-pr1005 `14 of 18 captures measured on the server, 14 loaded`, every
  verdict as `check:pl` computes it, `Plan lists 18 of 18 captures, 14 cached`, `Runs lists 20 runs`, `the first run
  opens in Inspect (pr1005-dgx/baseline/timing#0, 18 manifest rows, ✓ valid qualified coverage complete measured)`,
  `11 programs, 27 boards shown, no panel errors`, Perf Lab's store unchanged.
- `server-e2e.mjs` and `agent-e2e.mjs`: all passed.

### What didn't work

- `apps/server/test/client.test.ts`: `AssertionError: expected undefined to match object { id: 'fake', reachable:
  true }` — `hosts.list()` now returns `{hosts, workloads}`; the test indexed the old array.
- `packages/lab` build test: `dino-local: no capability report for host "local" (known: mac, playback@dgx,
  playback@rtx-dev)` — a second preset named `local`.
- `agent-e2e.mjs`: `timed out waiting for … d.id === "server:dev-fake" …` — the device id has been `host:<id>` since
  Step 4; the test was not run then.

### What I learned

- The jobs table's view has no `progress` field (Perf Lab's job card had one); the Lab view's running line now shows
  only status.
- Only `ncu` brings a timing companion; disturbing sampler modes (`trace`, `memory`) do not, so a lab capture never
  shares a lab hash with a companion capture.

### What was tricky to build

- The Perf Lab fixture (`test/fixtures/local-sampler-q2048.json`) holds runs stored under hashes of specs whose host
  is `local`. The tests that reproduce Perf Lab's numbers from it (`measured.test.ts`, `data.test.ts`) now read the
  preset through `test/fixtures/perf-lab-sampler.ts`, which restores `.host('local')` and fails loudly if the preset
  no longer declares the host parameter it replaces.
- Perf Lab's runs of `dino-local` (imported from its store) no longer match `dino-pr1005`'s captures, so
  `cpu-parts-preserve` is `open` in `lab-e2e.mjs`; no Kiln kind runs the dino workload yet.

### What warrants a second pair of eyes

- `labJobs` groups by host and repetition count. Captures of one experiment with different repetition counts (timing
  ×4, trace ×1) land in two jobs, so they do not share one seeded interleaving across modes; within a job, arms are
  interleaved as the experiment's `paired` order asks.
- `hostReport` sets `devices: ['cpu']` and `coreClasses: ['unknown']` for every host; a lab program that asks for a
  GPU device on a real host gets a refusal, not a plan.

### What should be done in the future

- A Kiln kind for the dino workload, so `dino-local` can run again.
- Kernel captures' runs (cuda-events, nsys) are in the catalog without a lab hash; no board reads them yet.

### Code review instructions

- Start with `packages/exec/src/kinds/perf-lab-sampler.ts` (`accept`, `lower`, `lab`), then
  `apps/workbench/src/ui/lab/api.js` (`labJobs`, `setHosts`) and `state.js` (`runPlan`, `catalogChanged`,
  `hostsChanged`), then `LabView.jsx` (Plan, Runs) and `InspectView.jsx`.
- Validate: `pnpm --filter @kiln/exec test && pnpm --filter @kiln/lab test && pnpm --filter @kiln/server test`, then
  `pnpm --filter @kiln/workbench build && node apps/workbench/test/lab-e2e.mjs`.

### Technical details

A lab job as the page submits it (one of the two for local-sampler's default plan):

```json
{ "host": "mac", "reason": "local-sampler on mac: sampler-local baseline, candidate × trace, memory, cpu",
  "protocol": { "reps": 1, "launches": 1, "warmup": 0, "seed": 20261012 },
  "captures": [{ "kind": "perf-lab-sampler/1", "mode": "trace", "pairId": "sampler-local",
                 "input": { "labId": "local-sampler", "ref": "sampler-local/baseline/trace", "spec": { "…": "…" } },
                 "rerun": false }, "…"],
  "approve": true }
```

## Step 6: Two hosts and a real data set — the deployment, the two identity bugs it found, and the measurements

This step deploys what Steps 2–5 built: one Kiln server on the Mac, a driver on the Mac and a driver on bling (the
DGX Spark, GB10), and collects a complete data set through the served workbench the way a person would — open a
program, run its plan, wait for the jobs, read the boards. It adds the preset `sampler-hosts`, which runs the same
sampler experiment on both machines at once, and four ticket scripts that drive the page and take the screenshots.

The data set had to be collected three times. The first attempt showed that the server and the page computed
different lab hashes for the same capture; the second showed that a CPU capture on bling was identified by bling's
GPU. Both are identity bugs that synthetic data could not have revealed, because both appear only when a capture
crosses the wire to a real host. The third attempt, after both fixes, is the data set the screenshots show.

### Prompt Context

**User prompt (verbatim):** see Step 5 ("i'm gonna go swim. When it comes time to test and such, run the frontend on
the mac, a runner on the mac and a runner on bling, and then collect a whole set of data …").

**Assistant interpretation:** Deploy the server and both drivers, run every program that can run on these two hosts
(the local sampler on each host, both hosts at once, ten kernel presets on bling), show the imported PR 1005 evidence,
add a preset that makes the two-host setup visible, and screenshot every board and view for the diary and the report.

**Inferred user intent:** See the whole system working on real machines, with the rich views populated by measured
data, before writing the report.

**Commits (code):**

- 877c273 — "KILN-003: a capture's lowered spec is the normal form its lab hash is taken over"
- c746899 — "KILN-003: a capture's device is the one its environment sees"
- 31b769f — "KILN-003: the sampler on two hosts, and one registry of lab presets"
- 5dffd13 — "KILN-003: the kiln-perf README describes a Kiln host, not an executor"
- 670c5ce — "KILN-003: a host without a GPU is the reason its GPU kinds are blocked"

### What I did

- **Hosts file** `/Volumes/SSD/kiln-data/kiln-003/hosts.json` (`kiln-hosts/1`, in Technical details): `mac` with one
  environment, `perf-lab-cpu` (`gpus: none`, 6 GiB); `bling` with `kiln-perf` (`gpus: all`) and `perf-lab-cpu`
  (`gpus: none`, 16 GiB), Nsight Systems 2025.3.2 and Nsight Compute 2025.3.1 as tool mounts, a 600 s GPU-lock wait.
- **Drivers**: on the Mac, `python3 kiln_driver.py serve --root /Volumes/SSD/kiln-exec-mac/root --listen
  127.0.0.1:5381`; on bling, the same command in tmux session `kiln-exec` under `sg docker -c '…'`, listening on
  127.0.0.1:5481 and reached through `ssh -N -L 5481:127.0.0.1:5481 manuel@bling.local`. The `perf-lab-cpu` image was
  built on the Mac and copied with `docker save | ssh … docker load`.
- **Server**: `env -u ANTHROPIC_API_KEY -u KILN_MODEL KILN_DATA_DIR=/Volumes/SSD/kiln-data/kiln-003 KILN_PORT=5380
  node src/index.ts`; Perf Lab's PR 1005 evidence imported with the server stopped (`node apps/server/src/lab/import.ts
  /Volumes/SSD/code/kiln/lab-workbench/.data`: 1 dataset, 1 archive, 128 media, 50 artifacts, 80 runs).
- **Ticket scripts**:
  - `03-run-lab-program.mjs` opens a program, sets parameters, dry-runs and runs the missing captures, waits for the
    jobs and the catalog, then shoots the Lab view, Plan, Runs, every board and Inspect. `--dry-only` stops after the
    dry run; `--view-only` shoots without running; `--views jobs,devices` adds dock views.
  - `04-measure-presets.mjs` loads kernel presets one at a time, picks a host's device, presses Measure and shoots
    Perf, Evidence and the job.
  - `05-collect.sh` runs the whole collection in order (the final attempt took 7 minutes, 03:38–03:45 UTC).
  - `06-shoot-view.mjs` shoots one dock view.
- **`packages/lab/presets/sampler-hosts.lab.js`** ("Two hosts · the sampler on the Mac and on bling"): two
  experiments, `sampler-mac` and `sampler-bling`, each pinned to its host, six paired processes (seed 20261020),
  timing and cpu captures. Derives: `speedup-<host>`, `ratios` (one row per host: ratio, interval, pairs, excluded) and
  `latency` (per host and arm). Hypothesis `compile-slower-on-both` predicts each host's lower bound above 1×. Boards:
  `hosts`, `requests`, `machines` (the two baseline manifests side by side, then getrusage).
- **Fixes found by the deployment** (each in What didn't work): the lab-hash normal form (877c273), the device of a
  CPU capture on a GPU host (c746899), preset names in the picker (31b769f), the stale image README (5dffd13), and the
  refusal text on a host with no GPU (670c5ce).

### Why

- A plan's captures are found again by their lab hash once their job finishes (`catalog()` is keyed on it). Any
  difference between the hash the page computes and the hash the server computes leaves every capture "execute" for
  ever, while the runs sit in the database under another name.
- A capture's device is part of its identity (`captureId`). Two machines' CPU captures must be two identities, and a
  CPU capture must not change identity when the host's GPU is replaced or its driver upgraded.
- The two-host preset exists because "the same program on two machines" is the case a single-host program cannot
  show: a cross-host manifest diff must exclude the comparison (host, device and threads differ), while each host's
  own paired ratio stays valid.

### What worked

Every job of the final attempt ended `done` (18 jobs: 10 kernel jobs and 8 sampler jobs). Every board rendered without a
panel error.

| Program · host        | Compiled ÷ eager | 95 % CI   | Processes | Hypothesis                           |
| --------------------- | ---------------- | --------- | --------- | ------------------------------------ |
| local-sampler · mac   | 1.43×            | 1.26–1.60 | 4         | compile-removes-intermediate refuted |
| local-sampler · bling | 1.08×            | 1.07–1.12 | 4         | compile-removes-intermediate refuted |
| sampler-hosts · mac   | 1.45×            | 1.38–1.48 | 6         | compile-slower-on-both supported     |
| sampler-hosts · bling | 1.1×             | 1.07–1.11 | 6         | (same hypothesis, both rows hold)    |

On both hosts the first profiled request allocates two 32 MiB blocks in the eager arm (`aten::empty` for the sample,
`aten::mul` for the reduce) and one in the compiled arm (`Torch-Compiled Region: 0/0`). The intermediate is
$8 \cdot 32 \cdot 2048 \cdot 16 \cdot 4\ \text{B} = 32\ \text{MiB}$, so the hypothesis that compiling removes it is
refuted on both CPUs, as it was in Perf Lab. getrusage over the measured window (sampler-hosts, `cpu` captures):

| Run                           | User time | System time | Voluntary ctx switches | Max RSS   |
| ----------------------------- | --------- | ----------- | ---------------------- | --------- |
| sampler-mac/baseline/cpu#0    | 1,750 ms  | 30.3 ms     | 1,853                  | 425.8 MiB |
| sampler-mac/candidate/cpu#0   | 2,806 ms  | 35.41 ms    | 990                    | 583.9 MiB |
| sampler-bling/baseline/cpu#0  | 1,674 ms  | 58.75 ms    | 3,869                  | 391.2 MiB |
| sampler-bling/candidate/cpu#0 | 3,256 ms  | 19.83 ms    | 2,183                  | 526.6 MiB |

Ten kernel presets on bling (`kiln-kernels/1` in `kiln-perf`, CUDA events, 7 repetitions × 20 timed launches after 3
warm-up launches; every record `validity.ok` and every output within 1.8e-4 of the reference):

| Preset | Kernel                       | Schedule                        | Median   | Range       |
| ------ | ---------------------------- | ------------------------------- | -------- | ----------- |
| W-05   | `k_rms_norm_reduce`          | MAP=row, TPB=1024, STAGE=all    | 148.5 µs | 144.2–158.7 |
| W-06   | `k_softmax_reduce`           | MAP=row, TPB=1024               | 53.4 µs  | 53.4–53.5   |
| W-08   | `k_linear_reduce`            | tiled 128×64×8, TM=8, TN=4      | 348.5 µs | 348.2–350.9 |
| W-10   | `k_matmul_reduce`            | tiled 128×32×16, TM=8           | 18.4 µs  | 17.4–18.5   |
| W-10   | `k_matmul_ew_softmax_reduce` | MAP=row, TPB=128                | 12.5 µs  | 12.4–12.5   |
| W-10   | `k_matmul_reduce_2`          | tiled 32×32×16, TM=4            | 24.6 µs  | 24.6–24.8   |
| W-12   | `k_slice_ew`                 | TPB=128, COARSEN=4              | 10.6 µs  | 10.5–11.2   |
| W-18   | `k_ew`                       | TPB=128                         | 118.1 µs | 114.9–132.1 |
| W-19   | `k_ew_gelu`                  | TPB=128                         | 203.7 µs | 202.8–207.7 |
| W-21   | `k_matmul_reduce`            | TPB=256                         | 2071 µs  | 2062–2089   |
| W-25   | `k_softmax_reduce`           | MAP=row, TPB=1024, STAGE=reused | 699.9 µs | 698.3–705.6 |
| W-26   | `k_matmul_reduce`            | tiled 128×128×8, TM=8, TN=2     | 396.1 µs | 393.7–397.7 |

Each kernel job took 13–18 s from Measure to records in the page, of which 6.9–7.9 s on the host (13 s for W-10's
three kernels). The two hosts run jobs in parallel: `sampler-hosts` submitted four jobs (two per host) at 23:41:12
local time and the last finished at 23:42:17, 65 s later.

Tests after the fixes: `@kiln/exec` 21 passed, `@kiln/lab` 100, `@kiln/server` 79, workbench unit 5 files;
`lab-e2e.mjs` all passed (`12 programs, 30 boards shown, no panel errors`, Perf Lab's store unchanged).

### What didn't work

- **Attempt 1, lab hashes.** After the local-sampler jobs finished, every capture stayed `execute`. The catalog held
  the runs under `1c2ee7b51bf704` while the build looked for `21477f7f5fa54`. The page hashes the in-memory spec, in
  which `warmup.until` is `undefined`; `stableStringify` writes that as `null`. The server hashes the spec it received
  as JSON, from which `JSON.stringify` had dropped the key. Fix (877c273): the build lowers a capture's spec to its
  JSON normal form first (`lowered: JSON.parse(stableStringify(i.spec))`), and a build test asserts for every preset
  capture that `hash(stableStringify(JSON.parse(JSON.stringify(c.lowered)))) === c.hash`. Evidence: the data dir
  `/Volumes/SSD/kiln-data/kiln-003-attempt1-json-hash` and `various/shots/attempt1-json-hash/`.
- **Attempt 2, the device of a CPU capture.** The manifest diff of `sampler-mac/baseline/timing#0` against
  `sampler-bling/baseline/timing#0` read `cpu:arm64:Apple M1 Pro:10` against
  `gpu:GPU-c6e7f17e-f161-a1d7-8c0b-56bbabb15c41`: `planJob` computed one device per job from the host's GPU, so a
  `perf-lab-sampler/1` capture in bling's `perf-lab-cpu` environment (`--gpus none`) was keyed on a GPU it could not
  see, and its environment block carried the GPU driver. Fix (c746899): `environmentGpu(name, host, facts)` returns no
  GPU for an environment with `gpus: none`; the device key and the environment's driver come from it per capture. Test:
  a bling-shaped host plans the sampler as `cpu:aarch64:Cortex-X925:20` with `driver: null`. Evidence:
  `various/shots/attempt2-gpu-device/` (two shots) and `/Volumes/SSD/kiln-data/kiln-003-attempt2-gpu-device`
  (data and the other 58 shots).
- **The new preset reached the picker as `sampler-hosts` under "Other".** `labs.gen.js` held
  `"id":"sampler-hosts","name":"sampler-hosts"`: the workbench build named programs from its own `LAB_META` table, a
  second copy of `PRESET_INFO`. Fix (31b769f): the build imports `PRESET_INFO` and throws on a `.lab.js` file the
  registry does not list.
- **bling's first probe saw no Docker.** The tmux server on bling was started before `manuel` joined the `docker` group,
  so processes it spawns lack the group; the driver started there could not use the Docker socket. Restarting the
  driver under `sg docker -c '…'` fixed it without restarting tmux. The probe's exact text was not preserved.

### What I learned

- **One session's interval does not cover the next session.** The Mac's compiled ÷ eager ratio was 1.57× (1.54–1.61,
  4 processes) in attempt 1, 1.68× (1.43–1.77, 6 processes) in attempt 2, and 1.43× (1.26–1.60) and 1.45× (1.38–1.48)
  in attempt 3, with the same code, image and inputs. The 1.45× interval excludes the 1.68× median an hour earlier. The
  bootstrap interval is over processes within one session, so it says nothing about what differs between sessions on
  a laptop (thermal state, other load). bling, an idle desktop-class machine, moved much less: 1.12× (1.09–1.13) in
  attempt 2 and 1.10× (1.07–1.11) in attempt 3.
- **The same image has two ids on two daemons.** `perf-lab-cpu:latest` is `sha256:af6e978b3c8c…` on the Mac (Docker
  Desktop 29.8.2) and `sha256:f790bf9ea358…` on bling (29.6.2) after `docker save | docker load`. The environment
  block carries the image id, so two hosts' captures of one image differ in the environment as well as the device. I
  did not verify why the ids differ.
- **A CPU job on a GPU host still takes the GPU lock.** The plan of a `perf-lab-cpu` job on bling waits up to 600 s for
  the GPU lock (`plan.gpu`, `plan.lock` are per job and come from the host). This is kept deliberately: a GPU job on the
  same machine would disturb the CPU job's timing.

### What was tricky to build

- The device of a capture belongs to the environment it runs in, not to the job or the host. A job can hold captures
  of two kinds in two environments; computing the device per capture after the offer chooses the environment is what
  makes that correct.
- Running the same program on two hosts needed nothing new in the lab language: each experiment names its host, the
  page groups captures into one job per host, and the drivers run them in parallel. The board has to keep the
  estimators apart, which is why `ratios` filters on the run prefix rather than pooling the requests.

### What warrants a second pair of eyes

- `environmentGpu` treats only `gpus: none` as "no GPU". An environment with `gpus: device=<uuid>` still keys on the
  host's configured GPU (`host.gpu`), not on the UUID it names.
- `apps/workbench/build.mjs` now imports `packages/lab/src/presets.ts` directly, which relies on Node's type
  stripping (the server already runs `.ts` this way).
- The picker moved Scenario C from "Scenarios" to "Assistant", because that is the group `PRESET_INFO` gives it.

### What should be done in the future

- A protocol that spreads repetitions over sessions, or a board that reports between-session spread next to the
  within-session interval, before a Mac ratio is quoted in the report.
- The kernel side has no Nsight Systems or Nsight Compute capture path in the workbench yet (P2's timeline and counter
  panels); `ncu` stays blocked on bling until the counters decision (task 8nqq).
- A Kiln kind for the dino workload, so `cpu-parts-preserve` can be decided on these hosts.

### Code review instructions

- `packages/exec/src/registry.ts` (`environmentGpu`, `environmentBlock`) and `packages/exec/src/plan.ts` (the device
  inside `build`), then `packages/lab/presets/sampler-hosts.lab.js` and `apps/workbench/build.mjs`.
- Validate: `pnpm --filter @kiln/exec test && pnpm --filter @kiln/lab test && pnpm --filter @kiln/server test`, then
  `cd apps/workbench && pnpm build && node test/lab-e2e.mjs`. To reproduce the data set, start a server and two drivers
  with the hosts file below and run `scripts/05-collect.sh`.

### Technical details

The hosts file of the deployment:

```json
{ "format": "kiln-hosts/1", "hosts": [
  { "id": "mac", "url": "http://127.0.0.1:5381",
    "environments": { "perf-lab-cpu": { "image": "perf-lab-cpu:latest", "docker": { "gpus": "none", "network": "none", "memory": "6g", "shmSize": "1g" } } },
    "lock": { "waitSeconds": 60 } },
  { "id": "bling", "url": "http://127.0.0.1:5481",
    "environments": {
      "kiln-perf": { "image": "kiln-perf:latest", "docker": { "gpus": "all", "network": "none", "shmSize": "1g" } },
      "perf-lab-cpu": { "image": "perf-lab-cpu:latest", "docker": { "gpus": "none", "network": "none", "memory": "16g", "shmSize": "1g" } } },
    "toolMounts": {
      "nsys": { "mount": "/opt/nvidia/nsight-systems/2025.3.2", "bin": "/opt/nvidia/nsight-systems/2025.3.2/bin/nsys" },
      "ncu": { "mount": "/opt/nvidia/nsight-compute/2025.3.1", "bin": "/opt/nvidia/nsight-compute/2025.3.1/ncu" } },
    "lock": { "waitSeconds": 600 } } ] }
```

Screenshots of the final data set (`various/shots/`, 1600×1000):

| Prefix                               | What it shows                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------- |
| `local-sampler-*`                    | Mac: dry run, running, Lab, Plan, Runs, four boards, Inspect (run and request)   |
| `local-sampler_host-bling-*`         | the same program with Host = bling (a pending plan applied after its jobs)       |
| `local-sampler_queries-4096-dry-run` | the dry run of a pending plan at 4096 queries, with the paired step order        |
| `sampler-hosts-*`                    | the two-host preset: Lab, Plan, Runs, boards `hosts`, `requests`, `machines`     |
| `W-NN-bling-{perf,evidence,job}`     | ten kernel presets measured on bling                                             |
| `dino-pr1005-*`                      | the imported PR 1005 evidence: seven boards, Inspect, the Jobs and Devices views |
| `devices-bling`                      | Devices with both hosts' capability documents                                    |
