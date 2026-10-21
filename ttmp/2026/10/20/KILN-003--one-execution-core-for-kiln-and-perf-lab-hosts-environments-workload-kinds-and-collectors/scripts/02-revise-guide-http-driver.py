"""KILN-003 guide revision: one HTTP driver API on every host replaces local/ssh transports (decision 2026-10-20)."""
import re
import sys

path = sys.argv[1]
s = open(path).read()


def sub(old, new, count=1):
    global s
    if old not in s:
        sys.exit(f"missing: {old[:90]!r}")
    s = s.replace(old, new, count)


def section(start, end, new):
    """Replace from the line `start` up to (not including) the line `end`."""
    global s
    i = s.index(start)
    j = s.index(end, i)
    s = s[:i] + new + s[j:]


def row(first_cell_regex, new_row):
    """Replace the table row whose first cell matches."""
    global s
    pat = re.compile(r"^\|\s*" + first_cell_regex + r"\s*\|.*$", re.M)
    if not pat.search(s):
        sys.exit(f"missing row: {first_cell_regex}")
    s = pat.sub(lambda m: new_row, s, count=1)


# ---------------------------------------------------------------- frontmatter
sub("Note: Install-by-hash, SSH command quoting and process groups that the transports and driver keep",
    "Note: Executor contract, SSH command building and process groups that the driver HTTP API replaces")
sub("hosts and transports, environments, probed facts", "hosts and the driver HTTP API, environments, probed facts")

# ---------------------------------------------------------------- Part 0, Part I
sub("covers hosts and transports, environments,", "covers hosts and the driver API, environments,")
row(r"Host and transport", "| Host and driver | Which machine, and where does its driver listen? | `spark` at `127.0.0.1:5281`, `dgx` at its own address |")
sub("""The **driver** is one standard-library Python file that the server copies to each host by content hash, exactly as it
copies the CUDA runner today. It knows nothing""",
    """The **driver** is one standard-library Python file that a person runs on each host as a small HTTP server while
developing. Every driver serves the same API over plain TCP, and the server is one HTTP client of all of them,
including the driver on its own machine. It knows nothing""")
sub("""- **Transport.** How the server sends commands and files to a host and reads their output: `local` (the server runs
  on the host), `ssh` (OpenSSH with key authentication), and later `agent` (a small service on the host).
- **Driver.** `kiln_driver.py`, one Python file using only the standard library, installed on a host under its
  SHA-256. Subcommands: `probe`, `run`, `cancel`, `reconcile`, `gc`. **[new]**, generalising ML-PERF-003's
  `driver.py`.""",
    """- **Driver.** `kiln_driver.py`, one Python file using only the standard library, run on a host by a person with
  `kiln_driver.py serve`. It accepts plans, runs them one at a time and keeps their events and archives.
  **[new]**, generalising ML-PERF-003's `driver.py`.
- **Driver API.** The HTTP API every driver serves over plain TCP: probe, blobs, jobs, events, archives (§13.2). The
  server reaches every host through it, including the host it runs on; there is no SSH and no process spawning in
  the core.""")

# ---------------------------------------------------------------- §11
row(r"Host", "| Host | a machine that executes captures; reached through its driver's URL | Kiln executor profiles; Perf Lab hosts; the page's devices |")
sub('H -->|"transport: local or ssh"| D["kiln_driver.py on the host"]', 'H -->|"HTTP /v1"| D["kiln_driver.py serve on the host"]')
sub("""4. **Stage and run.** The host's queue starts the job when the host is free. `DriverHost` uploads the bundle (plan,
   inputs, source trees) through the transport and starts `kiln_driver.py run`. The driver takes the GPU lock,
   records conditions, starts the GPU sampler, runs every step as a container, and streams JSON-line events back.""",
    """4. **Submit and run.** `DriverHost` uploads the files the driver does not have yet as blobs and submits the plan.
   The driver queues it and, when the host is free, takes the GPU lock, records conditions, starts the GPU sampler
   and runs every step as a container. The server reads the job's events by long polling.""")
sub("5. **Collect.** The driver packs `result.tar.gz`; the server fetches it,",
    "5. **Collect.** The driver packs `result.tar.gz`; the server downloads it,")
row(r"Page", "| Page | `K/apps/workbench` | programs, parameters, captures, offers; the page host | the driver API |")
row(r"Host, transport", "| Driver client | `K/apps/server/src/exec/{host,driver-client}.ts` | the driver API: blobs, plans, events, archives | kinds, collectors |")

# ---------------------------------------------------------------- §12
sub("""- **Nothing listens on a GPU host.** Commands arrive through SSH or run locally; a job lives as long as its connection.
  ML-PERF-003 §5 weighed an agent service and kept it as a later transport behind the same interface.""",
    """- **Every host speaks one API.** Each host runs the same driver, which serves the same HTTP API, and the server is
  one client of it. A job belongs to the driver, not to a connection, so it survives the server restarting or its
  machine sleeping. ML-PERF-003 §5 chose SSH and deferred an agent service; this design takes the agent and drops
  SSH (§13.2).""")
row(r"`executors.json`, `Executor`, `CudaRunnerExecutor`.*?",
    "| `executors.json`, `Executor`, `CudaRunnerExecutor` (`K/apps/server/src/executors/`) | `hosts.json`, `DriverHost`, the driver API (§13) | the old profile format; profiles are rewritten by hand (one per host) |\n"
    "| Installing the runner over SSH by content hash; a job's processes tied to its SSH connection (`cuda-runner.ts:98-150`) | a driver started by hand on each host and kept current by the server with `PUT /v1/self` (§13.4) | a host is usable only while a person runs its driver |")

# ---------------------------------------------------------------- §13 whole
section("### 13. Hosts and transports [new]", "### 14. Environments [new]", '''### 13. Hosts and the driver API [new]

#### 13.1 Host profiles

Host profiles replace both `executors.json` and ML-PERF-003's `hosts.json`. They live in `<data dir>/hosts.json`
(overridable with `KILN_HOSTS`), outside git because they name machines, and outside SQLite because they are
configuration, not evidence:

```json
{
  "format": "kiln-hosts/1",
  "hosts": [
    {
      "id": "spark",
      "url": "http://127.0.0.1:5281",
      "environments": {
        "kiln-perf": { "image": "kiln-perf:latest", "docker": { "gpus": "all", "network": "none" } }
      },
      "toolMounts": { "nsys": "/opt/nvidia/nsight-systems" },
      "lock": { "waitSeconds": 1800 }
    },
    {
      "id": "dgx",
      "url": "http://100.103.58.32:5281",
      "environments": {
        "kiln-perf": { "image": "kiln-perf:latest", "docker": { "gpus": "all", "network": "none" } },
        "playback-detection": {
          "image": "pb-dgx-sim-detection:latest", "python": "/app/.venv/bin/python",
          "docker": { "gpus": "all", "network": "none", "memory": "16g", "shmSize": "1g" },
          "threads": { "omp": 2, "mkl": 2, "openblas": 1, "inductorCompile": 4 }
        }
      },
      "lock": { "waitSeconds": 1800 },
      "idleWindowSeconds": 10
    }
  ]
}
```

- `id` is the host's name everywhere: in the page, in job rows, in capture specifications. It matches
  `[a-z0-9][a-z0-9-]{0,62}`, the rule executor ids follow today (`cuda-runner.ts:59`).
- `url` is where the host's driver listens, and the only thing the server needs to reach the host. A profile holds no
  SSH destination and no path on the host: the driver's root directory is its own option, reported by
  `GET /v1/info` (§13.4).
- `environments` names the images the host may use. Names are configuration; what each image contains is probed
  (§15). A host can run only the environments its profile names, never an image it happens to have.
- `toolMounts` names host directories that steps may mount read-only to provide a tool the image lacks (§14.3).
- The server validates the file at startup against a schema; an invalid host is unavailable with the validation
  message, and the other hosts are unaffected (ML-PERF-003 §6.2).
- **No migration path.** `executors.json` is deleted in Phase 1 (§29); its one profile on `bling` becomes the `spark`
  entry above. The server refuses to start when `executors.json` exists, with a message naming `hosts.json`, so a
  stale file cannot silently stop working.

#### 13.2 The driver API

Every GPU host runs the same driver, and the server reaches all of them with one HTTP client over plain TCP. A server
on `bling` reaches its own driver at `127.0.0.1`, and a driver on another machine at that machine's address. There is
no SSH and no local process spawning in the core: the host the server runs on is reached exactly like any other.

| Method and path                                | Body                   | Answer                                                                              |
| ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `GET /v1/info`                                 | none                   | `api` (`kiln-driver/1`), `sha256` of the running file, `hostname`, `root`, `running`, `queued` |
| `POST /v1/probe`                               | `kiln-probe-request/1` | facts (§15)                                                                         |
| `HEAD /v1/blobs/:sha256`                       | none                   | `200` when the blob is stored, `404` otherwise                                      |
| `PUT /v1/blobs/:sha256`                        | the bytes              | `201`; `400` when the bytes do not hash to the name                                 |
| `POST /v1/jobs`                                | `kiln-plan/1`          | `202` with the queue position; `409` naming missing blobs; `400` naming a refused mount |
| `GET /v1/jobs`                                 | none                   | every job the driver holds, with its state                                          |
| `GET /v1/jobs/:id/events?after=<seq>&wait=<s>` | none                   | the events after `seq`, waiting up to `wait` seconds for the first one              |
| `POST /v1/jobs/:id/cancel`                     | none                   | `202`; the running container is killed and the job ends cancelled                   |
| `GET /v1/jobs/:id/archive`                     | none                   | `result.tar.gz` once the job has ended; `409` before                                |
| `DELETE /v1/jobs/:id`                          | none                   | deletes the job's directory, once the server has stored its archive                 |
| `PUT /v1/self`                                 | a new `kiln_driver.py` | `202`, then the driver re-executes itself; `409` while a job runs                   |

```ts
// K/apps/server/src/exec/driver-client.ts
export class DriverClient {
  constructor(readonly url: string) {}
  info(signal?: AbortSignal): Promise<DriverInfo>;
  probe(request: ProbeRequest, signal?: AbortSignal): Promise<Facts>;
  /** HEAD each blob, PUT the missing ones. */
  ensureBlobs(files: { sha256: string; open: () => Readable }[], signal?: AbortSignal): Promise<void>;
  submit(plan: Plan): Promise<{ position: number }>;
  /** Repeats the long poll from `after` until the job's `result` or `driver.failed` event. */
  events(job: string, after: number, signal?: AbortSignal): AsyncIterable<DriverEvent>;
  cancel(job: string): Promise<void>;
  archive(job: string): Promise<Uint8Array>;
  remove(job: string): Promise<void>;
}
```

Three properties follow from the driver owning a job instead of a connection:

- **A job survives the server.** Restarting the server, or the Mac it runs on going to sleep, does not touch a running
  job. The driver appends every event with a sequence number to `jobs/<id>/events.ndjson`; when the server returns it
  asks for the events after the last sequence number it stored and carries on.
- **The driver queues.** It runs one job at a time, in submission order, so two Kiln servers that use the same host
  are serialized without knowing about each other.
- **Long polling, not streaming.** With `wait`, one request returns as soon as an event exists, and the server repeats
  it. This needs nothing beyond the standard library's `http.server`, and a dropped request loses nothing: the next
  one names the same `after`. A request that fails tells the server the driver is unreachable; one that returns empty
  after `wait` tells it a step is still running.

The API has no authentication, by decision (2026-10-20): drivers run only while a person is developing, on machines
they control. §27 states what this permits.

#### 13.3 The host root

Everything a driver writes lives under its `--root`:

```text
<root>/
  blobs/<sha256>                      uploaded files, content-addressed, shared by jobs: bundles, source trees, media
  jobs/<jobId>/
    plan.json                         as submitted
    events.ndjson                     every event with its sequence number
    bundle/                           hard links to blobs, at the paths the plan names
    out/<step>/                       written by steps (mounted read-write into exactly one step)
    conditions/                       written by the driver
    logs/<step>.log
    result.tar.gz                     packed by the driver at the end
  cache/<role>/                       persistent per-kind caches (e.g. nvcc build cache for kiln-kernels)
```

Blobs make uploads incremental: a Playback source tree or a dataset image crosses the network once per host, however
many jobs use it. The driver refuses any mount whose source is outside `<root>`, except tool directories, which it
mounts only read-only and only at their own path (ML-PERF-003 §6.8's mount check, extended).

#### 13.4 Starting and updating a driver

```bash
python3 kiln_driver.py serve --root ~/kiln-exec --listen 127.0.0.1:5281
```

- **Started by hand.** A person starts the driver in a tmux window for as long as they work with the host; there is no
  service unit. A host whose driver is not running shows as unreachable with its URL, and its captures are blocked
  with that reason.
- **As a `docker` user.** The driver starts containers, so it runs as a member of the `docker` group: `manuel` on
  `bling`, `playback` on `dgx`.
- **One address.** `--listen 127.0.0.1:5281` when the server runs on the same machine; otherwise the one address the
  server's machine reaches, never all interfaces.
- **Kept current by the server.** `GET /v1/info` reports the SHA-256 of the running file. When it differs from the
  server's copy of `K/runner/kiln_driver.py`, the server sends its copy with `PUT /v1/self` while the driver is idle;
  the driver writes it beside itself and re-executes with the same arguments. A person copies the file to a host once,
  and the server keeps it current from then on, as installation by content hash did for the runner over SSH.
- **Restart recovery.** On start the driver reads `jobs/`. A job without a `result` event was interrupted: the driver
  kills that job's labelled containers, packs a partial archive and appends `driver.failed` with the reason
  "driver restarted". The server sees it on its next poll.

''')

# ---------------------------------------------------------------- §15, §19
sub("`DriverHost.probe()` runs `kiln_driver.py probe` with a **probe request** on stdin. The request",
    "`DriverHost.probe()` sends a **probe request** to `POST /v1/probe`. The request")
sub("""into `<root>/media/<sha256>.jpg` once per host.""",
    """by SHA-256; they reach a host once, as blobs (§13.3).""")
sub("`python3 /job/in/trees/<arm>/services/redaction/scripts/bench_segment.py /job/media/<sha256>.ts`",
    "`python3 /job/in/trees/<arm>/services/redaction/scripts/bench_segment.py /job/in/media/<sha256>.ts`")
sub("Nothing in the driver, the transports, the queue or the page changes.",
    "Nothing in the driver, the driver API, the queue or the page changes.")

# ---------------------------------------------------------------- §22
sub("  mounts: Mount[];                            // by role: bundle, media, cache, tool, tree",
    "  mounts: Mount[];                            // by role: bundle, cache, tool")
sub("export type Mount = { role: 'bundle' | 'media' | 'cache' | 'tool' | 'tree'; source: string; target: string; ro: boolean };",
    "export type Mount = { role: 'bundle' | 'cache' | 'tool'; source: string; target: string; ro: boolean };")
sub("A mount's `source` is relative to its role's directory on the host (`bundle/…`, `media/…`, `cache/<role>/…`), or a",
    "A mount's `source` is relative to its role's directory on the host (`bundle/…`, `cache/<role>/…`), or a")
sub('"driver": { "sha256": "9f2c…", "path": "drivers/kiln_driver-9f2c3a1b04d7e655.py" },',
    '"driver": { "sha256": "9f2c…" },')
section("#### 22.6 The driver", "#### 22.7 Limits", '''#### 22.6 The driver

```text
POST /v1/jobs (plan):                                         # K/runner/kiln_driver.py, standard library only
  check   every file in plan.files is a stored blob            → 409 naming the missing ones
  check   every mount resolves under <root>, or is a tool directory mounted read-only → 400 naming the mount
  write   jobs/<id>/plan.json; link bundle/ from the blobs; append the job to the queue → 202 { position }

worker, one job at a time in submission order:
  check   free disk under <root> ≥ limits.minFreeDiskBytes     → driver.failed
  emit    driver.started { driver sha256, pid, host }
  lock    flock with timeout lock.waitSeconds, emitting lock.waiting every 30 s, then lock.acquired
  record  conditions/before.json                               → conditions
  for step in plan.steps:
    stop if the job was cancelled
    verify the environment's image id                          → step.refused on mismatch
    start the step's sidecars
    docker run <options from §14.2> <wrap…> <argv…>, stdout → out/<step>/stdout, stderr → logs/<step>.log,
      each stderr line appended as step.output, killed at timeoutSeconds
    run post, if any, in the same environment
    stop sidecars; enforce maxOutputBytes
    emit step.finished { exit, seconds, outputBytes }
  record  conditions/after.json
  pack    result.tar.gz: plan.json, events.ndjson, conditions/, logs/, out/, execution.json
  emit    result { sha256, bytes, partial }
  release the lock
```

Every event is a JSON object with a sequence number `seq` and a time `at`, appended to `jobs/<id>/events.ndjson`
before anything else sees it, and served by the long poll of §13.2. Because the file is the source, a server that was
away for an hour reads the same events as one that watched the job live.

Cancellation and cleanup are API calls instead of subcommands:

| Operation            | API                         | Does                                                                         |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| cancel               | `POST /v1/jobs/:id/cancel`  | marks the job cancelled; `docker kill` every container labelled with the job |
| reconcile            | `GET /v1/jobs`              | the server compares the driver's jobs with its own; restart recovery (§13.4) has already ended interrupted ones |
| garbage collection   | `DELETE /v1/jobs/:id`       | the server deletes a job once its archive is stored                          |
| cache and blob limits | at driver start            | cache roles above their size and blobs no job links are deleted, oldest first |

The driver touches only containers labelled `kiln.job` and only files under its root. On a shared host this is what
makes cancel and cleanup safe at any time.

''')

# ---------------------------------------------------------------- §23
sub("The server fetches `result.tar.gz` with `transport.get`, checks the SHA-256 the driver reported,",
    "The server downloads `result.tar.gz` with `GET /v1/jobs/:id/archive`, checks the SHA-256 the driver reported,")
sub("""fixed and the job re-imported (`POST /api/jobs/:id/reimport`), and an archive produced without the server (a driver
run by hand, a host with no route to the server) is imported the same way through `POST /api/archives`.""",
    """fixed and the job re-imported (`POST /api/jobs/:id/reimport`), and an archive copied by hand from a host the server
cannot reach is imported the same way through `POST /api/archives`. Once the archive is stored, the server deletes the
job on the driver (`DELETE /v1/jobs/:id`).""")

# ---------------------------------------------------------------- §24
sub("  approved --> running: the host's queue starts it", "  approved --> running: the host's driver starts it")
sub("  running --> failed: driver failed, lock timeout, connection lost", "  running --> failed: driver failed, lock timeout, driver restarted")
section("#### 24.2 Queues", "#### 24.3 Approvals and budgets", '''#### 24.2 Queues

The server submits a job to its host's driver when the job is approved, and the driver's queue decides when it runs
(§13.2): one job at a time per host, jobs on different hosts concurrently. This replaces today's single global queue
(`kick()` at `jobs.ts:302` starts a job only when no job is active anywhere), which would let a long DINO job on `dgx`
block a 20-second Measure on `spark`. Because the queue is the driver's, two servers that use one host are also
serialized; the GPU lock (§22.4) remains for benchmarks people run by hand.

''')

# ---------------------------------------------------------------- §26
row(r"§5 SSH from the lab server, agent later", "| §5 SSH from the lab server, agent later | the agent instead of SSH: every host runs the driver's HTTP API (§13.2) |")
row(r"§6.1 `StepHost`", "| §6.1 `StepHost` | `DriverHost` over `DriverClient` (§13.2, §22.6) |")
row(r"§6.8 `driver.py`", "| §6.8 `driver.py` | `kiln_driver.py serve` (§22.6), adding a queue, persisted events, the per-GPU lock path and image verification per step |")
row(r"§6.12 cancel and reconcile by label", "| §6.12 cancel and reconcile by label | `kiln.job` label, `POST /v1/jobs/:id/cancel`, restart recovery (§13.4, §22.6) |")

# ---------------------------------------------------------------- §27
sub("""- **No shell strings from input.** Transports build commands from validated values only: host ids, job ids and step
  ids match fixed patterns, image references are resolved IDs, environment names match `[A-Z_][A-Z0-9_]*`, and every
  word is `shq`-quoted (`cuda-runner.ts:40`). The SSH destination rule of today stays: no leading `-`, no port syntax.""",
    """- **The driver API has no authentication, by decision.** Drivers run only while a person develops, on machines that
  person controls (decision of 2026-10-20). Whoever can reach a driver's port can run containers with the GPU as the
  driver's user, who is in the `docker` group. Two habits keep that small: a driver listens on one address, and on
  `127.0.0.1` when the server is on the same machine (§13.4), and it is stopped when the work stops.
- **Values have fixed patterns.** Host, job and step ids, blob names (64 hex) and environment variable names
  (`[A-Z_][A-Z0-9_]*`) are checked by the server and again by the driver, which builds `docker run` argument vectors
  without a shell.""")
sub("""- **The driver validates the plan.** It trusts the server, but it re-checks the plan's schema, file hashes and mounts,
  so a planner bug fails before a container starts.""",
    """- **The driver validates the plan.** It re-checks the plan's schema, blob hashes and mounts, so a planner bug, or a
  hand-written request, fails before a container starts.""")
sub("""- **No stored credentials.** SSH uses the server user's agent and `~/.ssh/config`; profiles hold destinations, not
  keys.""",
    """- **No credentials anywhere.** Profiles hold URLs; there are no keys or tokens to store or leak.""")

# ---------------------------------------------------------------- §28
row(r"`GET /hosts`", "| `GET /hosts` | new | hosts with id, URL, driver state (reachable, version, queue), last probe time |")
section("#### 28.2 Driver command line", "#### 28.3 Formats", '''#### 28.2 Driver

The driver has one subcommand, `kiln_driver.py serve --root <dir> --listen <address:port>`, and the API of §13.2.
Its events, each with `seq` and `at`:

| Event            | Fields                                               |
| ---------------- | ---------------------------------------------------- |
| `job.queued`     | `position`                                           |
| `driver.started` | `sha256`, `pid`, `hostname`                          |
| `lock.waiting`   | `gpu`, `holder` (job, user, since)                   |
| `lock.acquired`  | `gpu`, `waitedSeconds`                               |
| `conditions`     | `when` (`before` or `after`), the summary            |
| `step.started`   | `step`, `image`                                      |
| `step.output`    | `step`, `line` (a workload's stderr line)            |
| `step.refused`   | `step`, `reason` (image mismatch, mount)             |
| `step.finished`  | `step`, `exit`, `seconds`, `outputBytes`, `timedOut` |
| `result`         | `sha256`, `bytes`, `partial`                         |
| `driver.failed`  | `reason`                                             |

''')
row(r"`kiln-hosts/1`", "| `kiln-hosts/1` | a person | server | `K/apps/server/src/exec/hosts.ts` | new |\n"
    "| `kiln-driver/1` (the API) | driver | server | `K/runner/kiln_driver.py`, `K/apps/server/src/exec/driver-client.ts` | new |")

# ---------------------------------------------------------------- §29
sub('  P3 --> P6["P6 torch-function, agent transport"]', '  P3 --> P6["P6 torch-function"]')
row(r"Transports", "| Driver client | `K/apps/server/src/exec/driver-client.ts` |")
row(r"Driver `probe` and installation by content hash", "| Driver `serve` with `/v1/info`, `/v1/probe`, `/v1/self` | `K/runner/kiln_driver.py`, `K/apps/server/src/exec/host.ts` |")
sub("**Acceptance.** `spark` (local) and `dgx` (SSH) probe in under a minute each.",
    "**Acceptance.** `spark` and `dgx` probe through their drivers in under a minute each.")
sub("""reason of §16. `dgx`'s document lists `playback-detection` with its image ID. The probe on `dgx` runs one short
container per environment with `--network none` and touches nothing else.""",
    """reason of §16. `dgx`'s document lists `playback-detection` with its image ID. The probe on `dgx` runs one short
container per environment with `--network none` and touches nothing else. Editing `kiln_driver.py` on the server's
side and probing again replaces the running driver through `PUT /v1/self`.""")
row(r"Driver `run`, `cancel`, `reconcile`, `gc`; GPU lock; conditions; `gpu-sampler`",
    "| Driver jobs, blobs, events, cancel, archives, restart recovery; GPU lock; conditions; `gpu-sampler` | `K/runner/kiln_driver.py` |")
sub("""- Killing the SSH connection to a `dgx` job stops its containers within one heartbeat interval, and the server's
  restart reconciliation marks the job failed.""",
    """- Stopping the server in the middle of a `dgx` job leaves the job running; the restarted server reads its events
  from the last stored sequence number and imports its archive.
- Stopping the driver in the middle of a job and starting it again ends the job as failed with a partial archive and
  no `kiln.job` container left.""")
sub("""`torch-function/1` (§19.7) as the first kind built only from the checklist of §19.8, and an `AgentTransport` if jobs
need to outlive the server's connection. Neither is required by the earlier phases.""",
    """`torch-function/1` (§19.7) as the first kind built only from the checklist of §19.8. No earlier phase needs it.""")

# ---------------------------------------------------------------- §30
row(r"Driver(?=\s*\|\s*Python)", "| Driver | Python `unittest` against a driver on an ephemeral port, with fake `docker`, `nvidia-smi` and `flock` scripts on `PATH`: blob hash refusal, mount refusal, image mismatch, queue order, two drivers on one lock, cancel, events resumed with `after`, restart recovery with a partial archive, `PUT /v1/self` | Python |")

# ---------------------------------------------------------------- §31
section("#### 31.1 `spark` (`bling`)", "#### 31.2 Opening GPU counters", '''#### 31.1 `spark` (`bling`)

```bash
# on bling, as manuel
cd ~/code/kiln/runner/docker && ./build.sh --ncu            # kiln-perf with Nsight Compute
cat > ~/kiln-002/server-data/hosts.json <<'JSON'
{ "format": "kiln-hosts/1", "hosts": [ { "id": "spark", "url": "http://127.0.0.1:5281",
  "environments": { "kiln-perf": { "image": "kiln-perf:latest", "docker": { "gpus": "all", "network": "none" } } },
  "toolMounts": { "nsys": "/opt/nvidia/nsight-systems" }, "lock": { "waitSeconds": 1800 } } ] }
JSON
rm ~/kiln-002/server-data/executors.json                     # the server refuses to start while it exists
tmux -L kiln new -d -s kiln 'cd ~/code/kiln && pnpm serve'   # as in KILN-002 Step 13
tmux -L kiln new-window -t kiln 'python3 ~/code/kiln/runner/kiln_driver.py serve --root ~/kiln-exec --listen 127.0.0.1:5281'

# on the Mac
ssh -N -L 5280:127.0.0.1:5280 manuel@bling.local            # then open http://127.0.0.1:5280/
```

In the page: Devices → `spark` → Probe. The capability document appears with the offers of §17.

''')
section("#### 31.3 `dgx`", "#### 31.4 Running the W-28 example", '''#### 31.3 `dgx`

```bash
# once: copy the driver; afterwards the server keeps it current (§13.4)
scp ~/code/kiln/runner/kiln_driver.py playback@dgx:kiln_driver.py
# on dgx, as playback, in a tmux window
python3 ~/kiln_driver.py serve --root /home/playback/perf-lab --listen 100.103.58.32:5281
```

The profile entry is the `dgx` host of §13.1. As of 2026-10-20, `dgx` has `kiln-perf:latest`, `nsys` at
`/usr/local/bin/nsys`, `/opt/nvidia/nsight-systems` and `/opt/nvidia/nsight-compute`, `RmProfilingAdminOnly: 1` and a
world-writable `/run/lock`.

`dgx`'s address, `100.103.58.32`, is on the Tailscale network. The Mac reaches it; `bling` does not (a TCP connection
from `bling` to its port 22 fails, and the name `dgx` does not resolve there). A server that uses both hosts therefore
runs on the Mac, with `spark`'s URL `http://bling.local:5281` and `bling`'s driver listening on `bling`'s LAN address;
or `bling` joins the tailnet. Nothing else in the design depends on where the server runs.

''')

# ---------------------------------------------------------------- §32, §33
row(r"Where the driver lives when the server's machine sleeps",
    "| The driver API is unauthenticated | decided for development (§27); one listen address per driver, stopped when not in use |\n"
    "| A host is usable only while a person runs its driver | the page shows the URL and why it is unreachable; acceptable during development |\n"
    "| `dgx` is not reachable from `bling` | run the server on the Mac for jobs on both hosts, or put `bling` on the tailnet (§31.3) |")
row(r"`K/apps/server/src/executors/cuda-runner.ts`", "| `K/apps/server/src/executors/cuda-runner.ts` | the executor contract and process handling that the driver API replaces |")
row(r"`K/apps/server/src/exec/\{hosts,transport,host,queue,jobs,import,routes\}.ts`",
    "| `K/apps/server/src/exec/{hosts,driver-client,host,jobs,import,routes}.ts` | P0–P1 | the server side |")
row(r"`K/runner/test/test_driver.py`", "| `K/runner/test/test_driver.py` | P1 | driver API tests with fake tools |")

open(path, "w").write(s)
leftover = [w for w in ("transport", "Transport", "ssh -T", "stdin", "heartbeat", "media/") if w in s.split("## Part III")[1]]
print("leftover terms in Part III/IV:", leftover)
