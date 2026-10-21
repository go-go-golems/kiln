#!/usr/bin/env python3
"""kiln_driver.py: the Kiln driver. One per GPU host; the Kiln server is its client (KILN-003 guide §13, §22).

    python3 kiln_driver.py serve --root ~/kiln-exec --listen 127.0.0.1:5281

The driver runs plans (kiln-plan/1): lists of structured steps, each one process in a container, in submission order,
one job at a time. It interprets nothing about what a step does: the server decides images, commands, collectors and
order, and the driver turns each step into `docker run`, takes the GPU lock, records conditions, runs sidecars, and
packs everything a job wrote into result.tar.gz. A job belongs to the driver, not to a connection: its events are
appended to jobs/<id>/events.ndjson with sequence numbers, and a client reads them by long polling.

HTTP API (kiln-driver/1), plain HTTP without authentication: run it only while you work with the host, and bind it to
the one address the server reaches.

    GET    /v1/info                              api, sha256 of this file, hostname, root, running, queued
    POST   /v1/probe                             kiln-probe-request/1 -> kiln-facts/1
    HEAD   /v1/blobs/<sha256>                    200 stored, 404 not
    PUT    /v1/blobs/<sha256>                    201; 400 when the bytes do not hash to the name
    POST   /v1/jobs                              kiln-plan/1 -> 202 {position}; 409 missing blobs; 400 refused mount
    GET    /v1/jobs                              every job with its state
    GET    /v1/jobs/<id>/events?after=N&wait=S   the events after N, waiting up to S seconds for the first
    POST   /v1/jobs/<id>/cancel                  202; the running container is killed
    GET    /v1/jobs/<id>/archive                 result.tar.gz once the job ended; 409 before
    DELETE /v1/jobs/<id>                         deletes the job's directory once it ended
    PUT    /v1/self                              a new kiln_driver.py; 202, then the driver re-executes; 409 while busy

Root layout: blobs/<sha256>, jobs/<id>/{plan.json, events.ndjson, bundle/, out/<step>/, conditions/, logs/,
execution.json, result.tar.gz}, cache/<role>/.

Every job ends with exactly one `result` event: {status: done | failed | cancelled, error, sha256, bytes, partial}.
Standard library only; Python 3.8+.
"""
import argparse
import fcntl
import hashlib
import json
import os
import re
import shutil
import signal
import socket
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

API = "kiln-driver/1"
SELF = Path(os.path.abspath(__file__))
SHA = re.compile(r"^[0-9a-f]{64}$")
JOB_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,99}$")
STEP_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
ENV_NAME = re.compile(r"^[A-Z_][A-Z0-9_]*$")
ENVIRONMENT = re.compile(r"^[a-z0-9][a-z0-9._-]{0,62}$")
MAX_PLAN_BYTES = 16 * 2**20
MAX_STEPS = 4096
MAX_OUTPUT_EVENTS = 400            # step.output events per step; the log keeps every line
DEFAULT_TOOL_PREFIXES = ("/opt/nvidia/", "/usr/local/cuda")
GPU_SAMPLER_FIELDS = "timestamp,utilization.gpu,clocks.sm,clocks.mem,memory.used,power.draw,temperature.gpu"
PROBE_TIMEOUT = 180


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + "Z"


def file_sha256(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                return h.hexdigest()
            h.update(b)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, file=sys.stderr, flush=True)


def run(argv, timeout=60, **kw):
    """(exit status, stdout, stderr) of a short command; status 127 when it cannot start."""
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, **kw)
        return r.returncode, r.stdout, r.stderr
    except FileNotFoundError:
        return 127, "", f"{argv[0]}: not found"
    except subprocess.TimeoutExpired:
        return 124, "", f"{argv[0]}: timed out after {timeout} s"


class Refused(Exception):
    """A request the driver will not serve; `status` is the HTTP status, `body` the JSON answer."""

    def __init__(self, status, error, message, **extra):
        super().__init__(message)
        self.status = status
        self.body = {"error": error, "message": message, **extra}


# ------------------------------------------------------------------ host facts


def gpus(smi):
    fields = "index,name,uuid,driver_version,compute_cap,memory.total,clocks.max.sm,persistence_mode"
    code, out, err = run([smi, f"--query-gpu={fields}", "--format=csv,noheader,nounits"], timeout=30)
    if code != 0:
        return [], (err or out).strip()[:300] or f"nvidia-smi exited with {code}"
    rows = []
    for line in out.strip().splitlines():
        v = [x.strip() for x in line.split(",")]
        if len(v) != 8:
            continue
        num = lambda s: int(float(s)) if re.match(r"^\d+(\.\d+)?$", s) else None
        rows.append({"index": num(v[0]), "name": v[1], "uuid": v[2], "driver": v[3], "cc": v[4], "memMiB": num(v[5]),
                     "maxSmClockMHz": num(v[6]), "persistence": v[7]})
    return rows, None


def gpu_counters():
    """Who may read GPU performance counters: RmProfilingAdminOnly in the driver's parameters."""
    try:
        text = Path("/proc/driver/nvidia/params").read_text()
    except OSError:
        return "unknown"
    m = re.search(r"RmProfilingAdminOnly:\s*(\d+)", text)
    return "unknown" if not m else ("admin-only" if m.group(1) == "1" else "all-users")


def compute_apps(smi):
    code, out, _ = run([smi, "--query-compute-apps=pid,process_name,used_memory", "--format=csv,noheader,nounits"], timeout=30)
    apps = []
    if code == 0:
        for line in out.strip().splitlines():
            v = [x.strip() for x in line.split(",")]
            if len(v) == 3 and v[0].isdigit():
                apps.append({"pid": int(v[0]), "name": v[1], "usedMiB": int(v[2]) if v[2].isdigit() else None})
    return apps


def gpu_now(smi, gpu):
    q = "utilization.gpu,clocks.sm,clocks.mem,memory.used,power.draw,temperature.gpu"
    argv = [smi, f"--query-gpu={q}", "--format=csv,noheader,nounits"] + (["-i", gpu["uuid"]] if gpu else [])
    code, out, _ = run(argv, timeout=30)
    if code != 0 or not out.strip():
        return None
    v = [x.strip() for x in out.strip().splitlines()[0].split(",")]
    keys = ["utilizationPct", "smClockMHz", "memClockMHz", "memoryUsedMiB", "powerW", "temperatureC"]
    out = {}
    for k, x in zip(keys, v):
        try:
            out[k] = float(x)
        except ValueError:
            out[k] = None
    return out


class Docker:
    def __init__(self, exe):
        self.exe = exe

    def version(self):
        code, out, err = run([self.exe, "version", "--format", "{{.Server.Version}}"], timeout=30)
        return out.strip() if code == 0 else None

    def image(self, ref):
        """(id, created) of a local image, or (None, reason)."""
        code, out, err = run([self.exe, "image", "inspect", "--format", "{{.Id}} {{.Created}}", ref], timeout=60)
        if code != 0:
            lines = (err or out).strip().splitlines()
            return None, lines[-1][:300] if lines else f"docker image inspect exited with {code}"
        parts = out.strip().split(" ", 1)
        return parts[0], parts[1] if len(parts) > 1 else None

    def names(self):
        code, out, _ = run([self.exe, "ps", "--format", "{{.Names}}"], timeout=30)
        return sorted(out.split()) if code == 0 else []

    def kill_job(self, job_id):
        code, out, _ = run([self.exe, "ps", "-q", "--filter", f"label=kiln.job={job_id}"], timeout=30)
        for cid in out.split() if code == 0 else []:
            run([self.exe, "kill", cid], timeout=30)


# The probe's in-container script: one JSON object on stdout. It runs with the environment's interpreter.
PROBE_SCRIPT = r"""
import json, re, subprocess, sys
req = json.loads(sys.argv[1])
VER = re.compile(r"\d+\.\d+(?:\.\d+)*")
def try_run(argv):
    try:
        r = subprocess.run(argv, capture_output=True, text=True, timeout=60)
    except Exception as e:
        return {"ok": False, "error": str(e)[:300]}
    text = (r.stdout or "") + (r.stderr or "")
    if r.returncode != 0:
        return {"ok": False, "error": (text.strip().splitlines() or ["exit %d" % r.returncode])[-1][:300]}
    m = VER.search(text)
    first = next((l for l in text.splitlines() if l.strip()), "")
    return {"ok": True, "version": m.group(0) if m else None, "text": first[:200]}
out = {"python": sys.version.split()[0], "commands": {}, "modules": {}, "tools": {}}
for name, argv in req.get("commands", {}).items():
    out["commands"][name] = try_run(argv)
for name in req.get("modules", []):
    try:
        import importlib, importlib.metadata as md
        importlib.import_module(name)
        try:
            v = md.version(name)
        except Exception:
            v = getattr(sys.modules[name], "__version__", None)
        out["modules"][name] = {"ok": True, "version": v}
    except Exception as e:
        out["modules"][name] = {"ok": False, "error": str(e)[:300]}
for name, candidates in req.get("tools", {}).items():
    res = {"ok": False, "error": "no candidate"}
    for c in candidates:
        r = try_run(c["argv"])
        if r["ok"]:
            res = dict(r, bin=c["argv"][0], **{"from": c.get("from", "image")})
            break
        res = r
    out["tools"][name] = res
smi = try_run(["nvidia-smi", "-L"])
out["gpuVisible"] = smi["ok"]
if not smi["ok"]:
    out["gpuError"] = smi["error"]
print(json.dumps(out))
"""


# ------------------------------------------------------------------ the driver


class Job:
    def __init__(self, job_id, path):
        self.id = job_id
        self.path = path
        self.events = []          # in memory; events.ndjson is the source
        self.state = "queued"     # queued | running | ended
        self.cancelled = False
        self.result = None
        self.plan = None


class Driver:
    def __init__(self, root, docker, smi, lock_dir, hostname, tool_prefixes):
        self.root = Path(root).expanduser().resolve()
        self.docker = Docker(docker)
        self.smi = smi
        self.lock_dir = Path(lock_dir)
        self.hostname = hostname
        self.tool_prefixes = tuple(tool_prefixes)
        self.sha256 = file_sha256(SELF)
        self.jobs = {}
        self.queue = []
        self.running = None
        self.cond = threading.Condition()
        self.restart = None
        for d in ("blobs", "jobs", "cache", "tmp"):
            (self.root / d).mkdir(parents=True, exist_ok=True)

    # -------------------------------------------------------------- events

    def emit(self, job, type_, **data):
        with self.cond:
            ev = {"seq": len(job.events) + 1, "at": now(), "type": type_, **data}
            with open(job.path / "events.ndjson", "a") as f:
                f.write(json.dumps(ev, separators=(",", ":")) + "\n")
            job.events.append(ev)
            if type_ == "result":
                job.state = "ended"
                job.result = ev
            self.cond.notify_all()
        return ev

    def events_after(self, job, after, wait):
        deadline = time.time() + max(0.0, min(float(wait), 60.0))
        with self.cond:
            while len(job.events) <= after and job.state != "ended" and time.time() < deadline:
                self.cond.wait(timeout=max(0.0, deadline - time.time()))
            return job.events[after:after + 1000]

    # -------------------------------------------------------------- recovery

    def recover(self):
        """Read jobs/: re-queue jobs that never started; end interrupted ones with a partial archive."""
        found = []
        for d in sorted((self.root / "jobs").iterdir()) if (self.root / "jobs").exists() else []:
            if not d.is_dir() or not JOB_ID.match(d.name) or not (d / "plan.json").exists():
                continue
            job = Job(d.name, d)
            try:
                job.plan = json.loads((d / "plan.json").read_text())
            except ValueError:
                continue
            if (d / "events.ndjson").exists():
                for line in (d / "events.ndjson").read_text().splitlines():
                    try:
                        job.events.append(json.loads(line))
                    except ValueError:
                        pass
            result = next((e for e in job.events if e.get("type") == "result"), None)
            self.jobs[job.id] = job
            if result:
                job.state, job.result = "ended", result
            elif any(e.get("type") == "driver.started" for e in job.events):
                found.append(job)
            else:
                queued_at = next((e["at"] for e in job.events if e.get("type") == "job.queued"), "")
                self.queue.append((queued_at, job))
        self.queue = [j for _, j in sorted(self.queue, key=lambda x: x[0])]
        for job in found:
            log(f"{job.id}: interrupted by a driver restart")
            self.docker.kill_job(job.id)
            self.emit(job, "driver.failed", reason="driver restarted")
            self.finish(job, "failed", "driver restarted while the job was running", partial=True)

    # -------------------------------------------------------------- probe

    def probe(self, req):
        if not isinstance(req, dict) or req.get("format") != "kiln-probe-request/1":
            raise Refused(400, "bad_request", "expected a kiln-probe-request/1 document")
        gpu_rows, gpu_error = gpus(self.smi)
        try:
            mem = int(re.search(r"MemTotal:\s+(\d+)", Path("/proc/meminfo").read_text()).group(1)) * 1024
        except (OSError, AttributeError):
            mem = None
        facts = {
            "format": "kiln-facts/1",
            "probedAt": now(),
            "driver": {"api": API, "sha256": self.sha256},
            "host": {"hostname": self.hostname, "kernel": os.uname().release, "arch": os.uname().machine, "memBytes": mem,
                     "freeDiskBytes": shutil.disk_usage(self.root).free, "docker": self.docker.version(), "uid": os.getuid()},
            "gpus": gpu_rows,
            "gpuCounters": gpu_counters(),
            "environments": {},
            "conditions": {"computeApps": compute_apps(self.smi), "containers": self.docker.names()},
        }
        if gpu_error:
            facts["gpuError"] = gpu_error
        envs = req.get("environments") or {}
        threads = [threading.Thread(target=self.probe_environment, args=(name, spec, facts["environments"])) for name, spec in envs.items()]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        return facts

    def probe_environment(self, name, spec, out):
        image_ref = spec.get("image", "")
        image_id, created = self.docker.image(image_ref)
        if not image_id:
            out[name] = {"imageRef": image_ref, "image": None, "ok": False, "error": f"image {image_ref} is not on this host"}
            return
        try:
            mounts = [self.tool_mount(m) for m in spec.get("mounts", [])]
        except Refused as e:
            out[name] = {"imageRef": image_ref, "image": image_id, "ok": False, "error": str(e)}
            return
        request = {k: spec.get(k) for k in ("commands", "modules", "tools") if spec.get(k)}
        argv = [self.docker.exe, "run", "--rm", "--init", "--network", "none", "--hostname", self.hostname,
                "--label", "kiln.probe=1", "--user", f"{os.getuid()}:{os.getgid()}", "-e", "HOME=/tmp"]
        argv += self.gpu_args((spec.get("docker") or {}).get("gpus", "all"))
        for m in mounts:
            argv += ["-v", f"{m}:{m}:ro"]
        argv += ["--entrypoint", spec.get("python") or "python3", image_id, "-c", PROBE_SCRIPT, json.dumps(request)]
        t0 = time.time()
        code, stdout, stderr = run(argv, timeout=PROBE_TIMEOUT)
        res = {"imageRef": image_ref, "image": image_id, "created": created, "seconds": round(time.time() - t0, 1)}
        try:
            res.update(json.loads(stdout.strip().splitlines()[-1]))
            res["ok"] = True
        except (ValueError, IndexError):
            lines = (stderr or stdout).strip().splitlines()
            res.update(ok=False, error=lines[-1][:300] if lines else f"the probe container exited with {code}")
        out[name] = res

    def gpu_args(self, gpus_opt):
        return [] if gpus_opt in (None, "", "none") else ["--gpus", str(gpus_opt)]

    def tool_mount(self, path):
        p = os.path.normpath(str(path))
        if not p.startswith("/") or not any(p == x.rstrip("/") or p.startswith(x if x.endswith("/") else x) for x in self.tool_prefixes):
            raise Refused(400, "refused_mount", f"tool directory {path} is not under an allowed prefix ({', '.join(self.tool_prefixes)})")
        if not os.path.isdir(p):
            raise Refused(400, "refused_mount", f"tool directory {path} does not exist on this host")
        return p

    # -------------------------------------------------------------- blobs

    def blob(self, sha):
        return self.root / "blobs" / sha

    def put_blob(self, sha, stream, length):
        fd, tmp = tempfile.mkstemp(dir=self.root / "tmp")
        h = hashlib.sha256()
        left = length
        with os.fdopen(fd, "wb") as f:
            while left > 0:
                b = stream.read(min(left, 1 << 20))
                if not b:
                    break
                h.update(b)
                f.write(b)
                left -= len(b)
        if left or h.hexdigest() != sha:
            os.unlink(tmp)
            raise Refused(400, "bad_blob", f"the bytes hash to {h.hexdigest()}, not {sha}" if not left else "the body ended early")
        os.chmod(tmp, 0o644)
        os.replace(tmp, self.blob(sha))

    # -------------------------------------------------------------- jobs

    def submit(self, plan):
        if not isinstance(plan, dict) or plan.get("format") != "kiln-plan/1":
            raise Refused(400, "bad_request", "expected a kiln-plan/1 document")
        if self.restart:
            raise Refused(503, "restarting", "the driver is restarting after an update")
        job_id = plan.get("job")
        if not isinstance(job_id, str) or not JOB_ID.match(job_id):
            raise Refused(400, "bad_request", "plan.job must match [a-z0-9][a-z0-9-]{0,99}")
        with self.cond:
            if job_id in self.jobs:
                job = self.jobs[job_id]
                return {"position": self.queue.index(job) + 1 if job in self.queue else 0, "known": True}
        files = plan.get("files") or []
        missing = [f.get("sha256") for f in files if not (isinstance(f, dict) and isinstance(f.get("sha256"), str) and SHA.match(f["sha256"]) and self.blob(f["sha256"]).exists())]
        if missing:
            raise Refused(409, "missing_blobs", f"{len(missing)} blobs are not stored", missing=missing)
        for f in files:
            check_rel(f.get("path"), "files[].path")
        steps = plan.get("steps")
        if not isinstance(steps, list) or not steps or len(steps) > MAX_STEPS:
            raise Refused(400, "bad_request", f"plan.steps must hold 1..{MAX_STEPS} steps")
        envs = plan.get("environments") or {}
        ids = set()
        for s in steps:
            self.check_step(s, envs, ids)
        path = self.root / "jobs" / job_id
        if path.exists():
            shutil.rmtree(path)
        (path / "bundle").mkdir(parents=True)
        for d in ("out", "conditions", "logs"):
            (path / d).mkdir()
        (path / "plan.json").write_text(json.dumps(plan))
        for f in files:
            target = path / "bundle" / f["path"]
            target.parent.mkdir(parents=True, exist_ok=True)
            try:
                os.link(self.blob(f["sha256"]), target)
            except OSError:
                shutil.copyfile(self.blob(f["sha256"]), target)
        job = Job(job_id, path)
        job.plan = plan
        with self.cond:
            self.jobs[job_id] = job
            self.queue.append(job)
            position = len(self.queue) + (1 if self.running else 0)
            self.emit(job, "job.queued", position=position, steps=len(steps))
            self.cond.notify_all()
        return {"position": position}

    def check_step(self, s, envs, ids):
        if not isinstance(s, dict):
            raise Refused(400, "bad_request", "every step must be an object")
        sid = s.get("id")
        if not isinstance(sid, str) or not STEP_ID.match(sid) or sid in ids:
            raise Refused(400, "bad_request", f"step id {sid!r} must match [a-z0-9][a-z0-9-]{{0,63}} and be unique")
        ids.add(sid)
        if s.get("environment") not in envs:
            raise Refused(400, "bad_request", f"step {sid}: environment {s.get('environment')!r} is not in plan.environments")
        for key in ("argv", "wrap", "post"):
            v = s.get(key) or []
            if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                raise Refused(400, "bad_request", f"step {sid}: {key} must be a list of strings")
        if not s.get("argv"):
            raise Refused(400, "bad_request", f"step {sid}: argv is empty")
        for k, v in (s.get("env") or {}).items():
            if not ENV_NAME.match(k) or not isinstance(v, str):
                raise Refused(400, "bad_request", f"step {sid}: environment variable {k!r} must match [A-Z_][A-Z0-9_]* with a string value")
        for m in s.get("mounts") or []:
            self.resolve_mount(None, m, sid)
        for sc in s.get("sidecars") or []:
            if sc != "gpu-sampler":
                raise Refused(400, "bad_request", f"step {sid}: unknown sidecar {sc!r}")

    def resolve_mount(self, job, m, sid):
        """(host path, target, read-only) of a mount by role; refuses anything outside the root or the tool prefixes."""
        if not isinstance(m, dict) or not isinstance(m.get("target"), str) or not m["target"].startswith("/") or m["target"].startswith("/job/in") or m["target"].startswith("/job/out"):
            raise Refused(400, "refused_mount", f"step {sid}: a mount needs an absolute target outside /job/in and /job/out")
        role, source, ro = m.get("role"), m.get("source"), bool(m.get("ro"))
        if role == "bundle":
            rel = check_rel(source, f"step {sid} mount source")
            return ((job.path / "bundle" / rel) if job else None, m["target"], True)
        if role == "cache":
            if not isinstance(source, str) or not ENVIRONMENT.match(source):
                raise Refused(400, "refused_mount", f"step {sid}: a cache mount's source is a role name")
            path = self.root / "cache" / source
            path.mkdir(parents=True, exist_ok=True)
            return (path, m["target"], ro)
        if role == "tool":
            if not ro or m["target"] != source:
                raise Refused(400, "refused_mount", f"step {sid}: a tool directory is mounted read-only at its own path")
            return (Path(self.tool_mount(source)), m["target"], True)
        raise Refused(400, "refused_mount", f"step {sid}: unknown mount role {role!r}")

    def cancel(self, job):
        with self.cond:
            job.cancelled = True
            queued = job in self.queue
            if queued:
                self.queue.remove(job)
        if queued:
            self.emit(job, "job.cancelled", phase="queued")
            self.finish(job, "cancelled", "cancelled before it started", partial=True)
        elif job.state == "running":
            self.emit(job, "job.cancelled", phase="running")
            self.docker.kill_job(job.id)

    def worker(self):
        while True:
            with self.cond:
                while not self.queue:
                    self.cond.wait()
                job = self.queue.pop(0)
                self.running = job
                job.state = "running"
            try:
                self.execute(job)
            except Exception as e:  # the job ends whatever happens; the driver keeps serving
                traceback.print_exc()
                if job.state != "ended":
                    self.emit(job, "driver.failed", reason=f"internal error: {e}")
                    self.finish(job, "failed", f"driver internal error: {e}", partial=True)
            finally:
                with self.cond:
                    self.running = None
                    self.cond.notify_all()

    def execute(self, job):
        plan = job.plan
        limits = plan.get("limits") or {}
        free = shutil.disk_usage(self.root).free
        if free < int(limits.get("minFreeDiskBytes", 5 * 2**30)):
            self.emit(job, "driver.failed", reason=f"only {free} bytes free under {self.root}")
            return self.finish(job, "failed", f"only {free >> 20} MiB free under the driver root", partial=True)
        self.emit(job, "driver.started", driver=self.sha256, pid=os.getpid(), hostname=self.hostname)
        gpu = plan.get("gpu")
        lock = self.acquire(job, gpu, (plan.get("lock") or {}).get("waitSeconds", 1800))
        if lock is False:
            return
        steps_done, error, status = [], None, "done"
        try:
            self.conditions(job, "before", gpu)
            idle = int(plan.get("idleWindowSeconds") or 0)
            if idle > 0 and gpu:
                self.idle_window(job, gpu, idle)
            for step in plan["steps"]:
                if job.cancelled:
                    status = "cancelled"
                    break
                r = self.run_step(job, step, plan, gpu)
                steps_done.append(r)
                # a driver killed mid-job recovers the finished steps from here (finish)
                with open(job.path / "steps.ndjson", "a") as f:
                    f.write(json.dumps(r) + "\n")
                if job.cancelled:
                    status = "cancelled"
                    break
            self.conditions(job, "after", gpu)
        finally:
            self.release(lock, gpu)
        execution = {"format": "kiln-execution/1", "driver": self.sha256, "hostname": self.hostname, "steps": steps_done,
                     "planned": len(plan["steps"]), "status": status}
        (job.path / "execution.json").write_text(json.dumps(execution, indent=1))
        partial = status != "done" or len(steps_done) < len(plan["steps"])
        self.finish(job, status, error if status != "cancelled" else "cancelled", partial=partial)

    def finish(self, job, status, error, partial):
        if not (job.path / "execution.json").exists():
            done = job.path / "steps.ndjson"
            steps = [json.loads(l) for l in done.read_text().splitlines() if l.strip()] if done.exists() else []
            (job.path / "execution.json").write_text(json.dumps({"format": "kiln-execution/1", "driver": self.sha256, "hostname": self.hostname, "steps": steps,
                                                                 "planned": len((job.plan or {}).get("steps") or []), "status": status, "error": error}))
        archive = job.path / "result.tar.gz"
        limit = int((job.plan.get("limits") or {}).get("archiveBytes", 2**30)) if job.plan else 2**30
        try:
            self.pack(job, archive)
            size = archive.stat().st_size
            if size > limit:
                archive.unlink()
                return self.emit(job, "result", status="failed", error=f"the archive is {size} bytes, over the limit of {limit}", sha256=None, bytes=0, partial=True)
            self.emit(job, "result", status=status, error=error, sha256=file_sha256(archive), bytes=size, partial=partial)
        except Exception as e:
            self.emit(job, "result", status="failed", error=f"packing the archive failed: {e}", sha256=None, bytes=0, partial=True)

    def pack(self, job, archive):
        tmp = archive.with_suffix(".tmp")
        with tarfile.open(tmp, "w:gz") as tar:
            for name in ("plan.json", "events.ndjson", "execution.json"):
                if (job.path / name).exists():
                    tar.add(job.path / name, arcname=name)
            for d in ("conditions", "logs", "out"):
                base = job.path / d
                for p in sorted(base.rglob("*")) if base.exists() else []:
                    if p.is_symlink() or not (p.is_file() or p.is_dir()):
                        continue
                    tar.add(p, arcname=str(p.relative_to(job.path)), recursive=False)
        os.replace(tmp, archive)

    # -------------------------------------------------------------- the GPU lock

    def acquire(self, job, gpu, wait_seconds):
        if not gpu or not gpu.get("uuid"):
            return None
        path = self.lock_dir / f"kiln-gpu-{gpu['uuid']}.lock"
        holder = self.lock_dir / f"kiln-gpu-{gpu['uuid']}.holder"
        try:
            fd = os.open(path, os.O_RDWR | os.O_CREAT, 0o666)
            try:
                os.fchmod(fd, 0o666)
            except OSError:
                pass  # created by another user: theirs to set
        except PermissionError:
            fd = os.open(path, os.O_RDONLY)
        t0, last = time.time(), 0.0
        while True:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except BlockingIOError:
                pass
            if job.cancelled:
                os.close(fd)
                self.finish(job, "cancelled", "cancelled while waiting for the GPU lock", partial=True)
                return False
            waited = time.time() - t0
            if waited >= wait_seconds:
                os.close(fd)
                who = read_holder(holder)
                self.emit(job, "driver.failed", reason=f"the GPU lock was not free within {wait_seconds} s", holder=who)
                self.finish(job, "failed", f"the GPU lock was held for {wait_seconds} s by {who or 'an unknown process'}", partial=True)
                return False
            if waited - last >= 30 or last == 0.0:
                last = waited or 0.001
                self.emit(job, "lock.waiting", lock=str(path), holder=read_holder(holder), waited=round(waited))
            time.sleep(0.5)
        try:
            with open(holder, "w") as f:
                f.write(json.dumps({"job": job.id, "user": os.getuid(), "pid": os.getpid(), "since": now(), "driver": str(self.root)}))
            os.chmod(holder, 0o666)
        except OSError:
            pass
        self.emit(job, "lock.acquired", lock=str(path), waited=round(time.time() - t0, 1))
        return fd

    def release(self, fd, gpu):
        if fd is None or fd is False:
            return
        try:
            (self.lock_dir / f"kiln-gpu-{gpu['uuid']}.holder").write_text("")
        except OSError:
            pass
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)

    # -------------------------------------------------------------- conditions

    def conditions(self, job, when, gpu):
        snap = {"at": now(), "computeApps": compute_apps(self.smi), "containers": self.docker.names(), "gpu": gpu_now(self.smi, gpu)}
        (job.path / "conditions" / f"{when}.json").write_text(json.dumps(snap, indent=1))
        mine = f"kiln-{job.id}"
        others = [c for c in snap["containers"] if not c.startswith(mine)]
        self.emit(job, "conditions", when=when, computeApps=len(snap["computeApps"]), containers=len(others),
                  utilizationPct=(snap["gpu"] or {}).get("utilizationPct"))

    def idle_window(self, job, gpu, seconds):
        samples = []
        for _ in range(seconds):
            g = gpu_now(self.smi, gpu)
            samples.append({"at": now(), **(g or {})})
            time.sleep(1)
        (job.path / "conditions" / "idle-window.json").write_text(json.dumps({"seconds": seconds, "samples": samples}, indent=1))

    # -------------------------------------------------------------- steps

    def run_step(self, job, step, plan, gpu):
        sid = step["id"]
        env = plan["environments"][step["environment"]]
        out_dir = job.path / "out" / sid
        out_dir.mkdir(parents=True, exist_ok=True)
        info = {"id": sid, "startedAt": now()}
        image_id, _ = self.docker.image(env.get("ref") or env["image"])
        if image_id != env["image"]:
            info.update(refused=f"image {env.get('ref')} is {image_id or 'missing'}, the plan expects {env['image']}", exit=None, seconds=0)
            self.emit(job, "step.refused", step=sid, planned=env["image"], found=image_id)
            return info
        self.emit(job, "step.started", step=sid, serves=step.get("serves", []))
        t0 = time.time()
        sampler = self.start_sampler(out_dir, gpu) if "gpu-sampler" in (step.get("sidecars") or []) and gpu else None
        try:
            code, timed_out = self.container(job, step, env, out_dir, sid, (step.get("wrap") or []) + step["argv"], int(step.get("timeoutSeconds") or 900))
            info.update(exit=code, timedOut=timed_out)
            if step.get("post") and code == 0 and not job.cancelled:
                pcode, ptimed = self.container(job, step, env, out_dir, f"{sid}-post", step["post"], int(step.get("timeoutSeconds") or 900))
                info.update(postExit=pcode, postTimedOut=ptimed)
        finally:
            if sampler:
                sampler.terminate()
                try:
                    sampler.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    sampler.kill()
        info["seconds"] = round(time.time() - t0, 3)
        info["finishedAt"] = now()
        size, dropped = enforce_output(out_dir, int(step.get("maxOutputBytes") or 64 * 2**20))
        info["outputBytes"] = size
        if dropped:
            info["dropped"] = dropped
        self.emit(job, "step.finished", step=sid, exit=info.get("exit"), seconds=info["seconds"], timedOut=info.get("timedOut", False),
                  outputBytes=size, **({"postExit": info["postExit"]} if "postExit" in info else {}), **({"dropped": dropped} if dropped else {}))
        return info

    def start_sampler(self, out_dir, gpu):
        try:
            f = open(out_dir / "gpu.csv", "w")
            return subprocess.Popen([self.smi, f"--query-gpu={GPU_SAMPLER_FIELDS}", "--format=csv,noheader,nounits", "-lms", "100", "-i", gpu["uuid"]],
                                    stdout=f, stderr=subprocess.DEVNULL)
        except OSError:
            return None

    def container(self, job, step, env, out_dir, name, argv, timeout):
        """Run one container; (exit status, timed out). stdout and stderr go to logs/<name>.{out,log}."""
        docker = env.get("docker") or {}
        cname = f"kiln-{job.id}-{name}"[:120]
        args = [self.docker.exe, "run", "--rm", "--name", cname, "--label", f"kiln.job={job.id}", "--label", f"kiln.step={step['id']}",
                "--network", docker.get("network") or "none", "--hostname", self.hostname, "--init"]
        args += self.gpu_args(docker.get("gpus", "all"))
        if step.get("user", "host-user") != "root":
            args += ["--user", f"{os.getuid()}:{os.getgid()}"]
        if docker.get("memory"):
            args += ["--memory", str(docker["memory"])]
        if docker.get("shmSize"):
            args += ["--shm-size", str(docker["shmSize"])]
        environ = {"HOME": "/tmp", **(env.get("env") or {}), **(step.get("env") or {})}
        for k, v in environ.items():
            args += ["-e", f"{k}={v}"]
        args += ["-v", f"{job.path / 'bundle'}:/job/in:ro", "-v", f"{out_dir}:/job/out"]
        for m in step.get("mounts") or []:
            src, target, ro = self.resolve_mount(job, m, step["id"])
            args += ["-v", f"{src}:{target}{':ro' if ro else ''}"]
        args += ["--entrypoint", argv[0], env["image"]] + argv[1:]
        logs = job.path / "logs"
        with open(logs / f"{name}.out", "w") as fout, open(logs / f"{name}.log", "w") as ferr:
            proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, errors="replace")
            counter = {"n": 0}
            readers = [threading.Thread(target=self.pump, args=(job, name, proc.stdout, fout, "stdout", counter)),
                       threading.Thread(target=self.pump, args=(job, name, proc.stderr, ferr, "stderr", counter))]
            for t in readers:
                t.start()
            timed_out = False
            try:
                proc.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                run([self.docker.exe, "kill", cname], timeout=30)
                try:
                    proc.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait()
            for t in readers:
                t.join()
        return proc.returncode, timed_out

    def pump(self, job, name, stream, sink, which, counter):
        for line in stream:
            sink.write(line)
            sink.flush()
            line = line.rstrip("\n")
            if not line.strip():
                continue
            counter["n"] += 1
            if counter["n"] <= MAX_OUTPUT_EVENTS:
                self.emit(job, "step.output", step=name, stream=which, line=line[:2000])
            elif counter["n"] == MAX_OUTPUT_EVENTS + 1:
                self.emit(job, "step.output", step=name, stream=which, line=f"(further output only in logs/{name}.log and .out)")

    # -------------------------------------------------------------- self-update

    def replace_self(self, data):
        with self.cond:
            if self.running:
                raise Refused(409, "busy", f"job {self.running.id} is running; update when the driver is idle")
            try:
                compile(data, str(SELF), "exec")
            except SyntaxError as e:
                raise Refused(400, "bad_driver", f"the new driver does not compile: {e}")
            tmp = SELF.with_name(SELF.name + ".new")
            tmp.write_bytes(data)
            os.chmod(tmp, 0o755)
            os.replace(tmp, SELF)
            self.restart = True
            self.queue.clear()  # queued jobs are re-read from jobs/ by the new process


def check_rel(path, what):
    if not isinstance(path, str) or not path or path.startswith("/") or "\0" in path or ".." in path.split("/"):
        raise Refused(400, "refused_mount", f"{what} must be a relative path inside the bundle (got {path!r})")
    return path


def read_holder(path):
    try:
        text = path.read_text().strip()
        return json.loads(text) if text else None
    except (OSError, ValueError):
        return None


def enforce_output(out_dir, limit):
    """Total bytes under out_dir; drops the largest files until it fits the limit and names them."""
    files = [(p.stat().st_size, p) for p in out_dir.rglob("*") if p.is_file() and not p.is_symlink()]
    total = sum(s for s, _ in files)
    dropped = []
    for size, p in sorted(files, key=lambda x: -x[0]):
        if total <= limit:
            break
        p.unlink()
        total -= size
        dropped.append(str(p.relative_to(out_dir)))
    return total, dropped


# ------------------------------------------------------------------ HTTP


def handler_for(driver):
    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        server_version = "kiln-driver/1"

        def log_message(self, fmt, *args):
            if os.environ.get("KILN_DRIVER_VERBOSE"):
                log(self.address_string(), fmt % args)

        def send(self, code, body=None, raw=None, ctype="application/json"):
            data = raw if raw is not None else (json.dumps(body).encode() if body is not None else b"")
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(data)

        def body(self, limit):
            n = int(self.headers.get("Content-Length") or 0)
            if n > limit:
                raise Refused(413, "too_large", f"the body is {n} bytes, over the limit of {limit}")
            return self.rfile.read(n)

        def drain(self):
            left = int(self.headers.get("Content-Length") or 0)
            while left > 0:
                b = self.rfile.read(min(left, 1 << 20))
                if not b:
                    break
                left -= len(b)

        def json_body(self, limit=MAX_PLAN_BYTES):
            try:
                return json.loads(self.body(limit) or b"null")
            except ValueError:
                raise Refused(400, "bad_request", "the body is not JSON")

        def job(self, job_id):
            job = driver.jobs.get(job_id)
            if not job:
                raise Refused(404, "not_found", f"no job {job_id}")
            return job

        def dispatch(self):
            url = urlparse(self.path)
            parts = [p for p in url.path.split("/") if p]
            q = parse_qs(url.query)
            m = self.command
            if parts[:1] != ["v1"]:
                raise Refused(404, "not_found", "the API is under /v1")
            p = parts[1:]
            if m == "GET" and p == ["info"]:
                with driver.cond:
                    return self.send(200, {"api": API, "sha256": driver.sha256, "hostname": driver.hostname, "root": str(driver.root),
                                           "running": driver.running.id if driver.running else None, "queued": [j.id for j in driver.queue],
                                           "pid": os.getpid(), "python": sys.version.split()[0]})
            if m == "POST" and p == ["probe"]:
                return self.send(200, driver.probe(self.json_body()))
            if p[:1] == ["blobs"] and len(p) == 2:
                sha = p[1]
                if not SHA.match(sha):
                    raise Refused(400, "bad_request", "a blob is named by its lowercase SHA-256")
                if m == "HEAD" or m == "GET":
                    if not driver.blob(sha).exists():
                        return self.send(404)
                    return self.send(200) if m == "HEAD" else self.send(200, raw=driver.blob(sha).read_bytes(), ctype="application/octet-stream")
                if m == "PUT":
                    if driver.blob(sha).exists():
                        self.drain()
                        return self.send(200, {"stored": True})
                    driver.put_blob(sha, self.rfile, int(self.headers.get("Content-Length") or 0))
                    return self.send(201, {"stored": True})
            if p == ["jobs"]:
                if m == "POST":
                    return self.send(202, driver.submit(self.json_body()))
                if m == "GET":
                    with driver.cond:
                        jobs = [{"id": j.id, "state": j.state, "position": (driver.queue.index(j) + 1 if j in driver.queue else 0),
                                 "events": len(j.events), "result": j.result} for j in driver.jobs.values()]
                    return self.send(200, {"jobs": jobs})
            if p[:1] == ["jobs"] and len(p) >= 2:
                job = self.job(p[1])
                rest = p[2:]
                if m == "GET" and rest == ["events"]:
                    after = int((q.get("after") or ["0"])[0])
                    wait = float((q.get("wait") or ["0"])[0])
                    evs = driver.events_after(job, after, wait)
                    return self.send(200, {"events": evs, "state": job.state})
                if m == "POST" and rest == ["cancel"]:
                    driver.cancel(job)
                    return self.send(202, {"state": job.state})
                if m == "GET" and rest == ["archive"]:
                    archive = job.path / "result.tar.gz"
                    if job.state != "ended" or not archive.exists():
                        raise Refused(409, "not_ended" if job.state != "ended" else "no_archive", f"job {job.id} is {job.state}")
                    return self.send(200, raw=archive.read_bytes(), ctype="application/gzip")
                if m == "GET" and rest == ["plan"]:
                    return self.send(200, job.plan)
                if m == "DELETE" and rest == []:
                    if job.state != "ended":
                        raise Refused(409, "not_ended", f"job {job.id} is {job.state}")
                    with driver.cond:
                        driver.jobs.pop(job.id, None)
                    shutil.rmtree(job.path, ignore_errors=True)
                    return self.send(200, {"deleted": job.id})
            if m == "PUT" and p == ["self"]:
                driver.replace_self(self.body(4 * 2**20))
                self.send(202, {"restarting": True})
                self.wfile.flush()
                threading.Thread(target=reexec, args=(self.server,), daemon=True).start()
                return
            raise Refused(404, "not_found", f"no route {m} {url.path}")

        def handle_any(self):
            try:
                self.dispatch()
            except Refused as e:
                self.send(e.status, e.body)
            except Exception as e:
                traceback.print_exc()
                self.send(500, {"error": "internal", "message": str(e)[:500]})

        do_GET = do_POST = do_PUT = do_DELETE = do_HEAD = handle_any

    return Handler


def reexec(server):
    time.sleep(0.3)
    log("re-executing the updated driver")
    server.socket.close()
    os.execv(sys.executable, [sys.executable, str(SELF)] + sys.argv[1:])


def serve(a):
    host, _, port = a.listen.rpartition(":")
    driver = Driver(a.root, a.docker, a.nvidia_smi, a.lock_dir, a.hostname or socket.gethostname(), a.allow_tool or DEFAULT_TOOL_PREFIXES)
    driver.recover()
    threading.Thread(target=driver.worker, daemon=True).start()
    srv = ThreadingHTTPServer((host or "127.0.0.1", int(port)), handler_for(driver))
    srv.daemon_threads = True
    log(f"kiln driver {driver.sha256[:12]} on http://{host or '127.0.0.1'}:{port}, root {driver.root}")
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    srv.serve_forever()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("serve", help="serve the driver API")
    p.add_argument("--root", required=True, help="the driver's directory: blobs, jobs, caches")
    p.add_argument("--listen", default="127.0.0.1:5281", help="address:port (default 127.0.0.1:5281)")
    p.add_argument("--docker", default=os.environ.get("KILN_DOCKER", "docker"), help="the docker executable")
    p.add_argument("--nvidia-smi", default=os.environ.get("KILN_NVIDIA_SMI", "nvidia-smi"), help="the nvidia-smi executable")
    p.add_argument("--lock-dir", default=os.environ.get("KILN_LOCK_DIR", "/run/lock"), help="where the GPU lock lives (default /run/lock)")
    p.add_argument("--hostname", default=None, help="the host name containers get (default: this machine's)")
    p.add_argument("--allow-tool", action="append", help="a directory prefix tool mounts may come from (repeatable; default /opt/nvidia/, /usr/local/cuda)")
    a = ap.parse_args()
    if a.cmd == "serve":
        serve(a)


if __name__ == "__main__":
    main()
