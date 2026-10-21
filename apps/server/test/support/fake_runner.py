#!/usr/bin/env python3
"""Test-only stand-in for runner/kiln_runner.py: the same command line and the same kiln-bundle/1 → kiln-results/1
files, with deterministic numbers instead of a GPU. The server's tests stage it as the kiln-kernels/1 runner, so the
driver runs it through the fake docker exactly as it runs the real runner in kiln-perf.

  python3 fake_runner.py device
  python3 fake_runner.py run <bundle.json> --out <results.json>

Behaviour comes from the environment (the driver's, inherited through the fake docker):
  KILN_FAKE_DEVICE      JSON device report (default: a fake Hopper)
  KILN_FAKE_TIMES       JSON { "<name>|<row>" | "<row>" | "<name>": µs } per-launch time (default from the name)
  KILN_FAKE_OUTPUTS     path of a JSON file { "<name>|<row>": [value per sample index] }: those kernels' outputs
                        (a fake GPU that computes correctly); others output sin(i) at sample index i
  KILN_FAKE_FAIL        kernel name that reports an error in every repetition
  KILN_FAKE_COUNTER     path of a file counting invocations (1, 2, …), for the three below
  KILN_FAKE_EXIT_AT     invocation number that exits with status 3 and a message on stderr
  KILN_FAKE_DELAY_MS    sleep this long before answering …
  KILN_FAKE_DELAY_FROM  … from this invocation number on (default 1)
  KILN_FAKE_NCU_LOG     set by the fake ncu: append one CSV row per kernel launch there
"""
import json, math, os, struct, sys, time

env = os.environ
DEVICE = json.loads(env["KILN_FAKE_DEVICE"]) if env.get("KILN_FAKE_DEVICE") else {
    "name": "Fake H100", "cc": "9.0", "sms": 132, "driver": 12080, "driverVersion": "580.00-fake", "persistenceMode": "Enabled",
    "maxSmClockMHz": 1980, "maxMemClockMHz": 2619}


def log(s):
    print(s, file=sys.stderr, flush=True)


def fround(x):
    return struct.unpack("f", struct.pack("f", x))[0]


def invocation():
    path = env.get("KILN_FAKE_COUNTER")
    if not path:
        return 1
    n = (int(open(path).read()) if os.path.exists(path) else 0) + 1
    open(path, "w").write(str(n))
    return n


def lookup(m, k):
    if not m:
        return None
    for key in (f"{k['name']}|{k.get('row')}", k.get("row"), k["name"]):
        if key in m:
            return m[key]
    return None


def base_time(name):
    h = 7
    for c in name:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return 5 + (h % 4000) / 100


cmd = sys.argv[1:2]
if cmd == ["device"]:
    print(json.dumps(DEVICE))
elif cmd == ["run"]:
    bundle_path, out = sys.argv[2], sys.argv[sys.argv.index("--out") + 1]
    n = invocation()
    bundle = json.load(open(bundle_path))
    if bundle.get("format") != "kiln-bundle/1":
        log("not a kiln bundle")
        sys.exit(2)
    if env.get("KILN_FAKE_EXIT_AT") and n == int(env["KILN_FAKE_EXIT_AT"]):
        log(f"fake runner: invocation {n} fails")
        sys.exit(3)
    if env.get("KILN_FAKE_DELAY_MS") and n >= int(env.get("KILN_FAKE_DELAY_FROM") or 1):
        time.sleep(int(env["KILN_FAKE_DELAY_MS"]) / 1000)
    times = json.loads(env["KILN_FAKE_TIMES"]) if env.get("KILN_FAKE_TIMES") else None
    outputs = json.load(open(env["KILN_FAKE_OUTPUTS"])) if env.get("KILN_FAKE_OUTPUTS") and os.path.exists(env["KILN_FAKE_OUTPUTS"]) else {}
    kernels = []
    for k in bundle["kernels"]:
        if k["name"] == env.get("KILN_FAKE_FAIL"):
            log(f"  {k['name']} ERROR fake failure")
            kernels.append({"name": k["name"], "identity": k.get("identity"), "error": "fake failure\nnvcc said no"})
            continue
        t = lookup(times, k) or base_time(k["name"])
        us_all = [round(t * (1 + 0.01 * (((j * 7 + n) % 5) - 2)), 4) for j in range(bundle["reps"])]
        s = sorted(us_all)
        log(f"  {k['name']:<36} {t:.2f} us")
        if env.get("KILN_FAKE_NCU_LOG"):
            with open(env["KILN_FAKE_NCU_LOG"], "a") as f:
                for _ in range(bundle["reps"] + bundle["warmup"]):
                    f.write(json.dumps({"kernel": k["name"], "us": t}) + "\n")
        kernels.append({"name": k["name"], "identity": k.get("identity"), "us_median": s[len(s) >> 1], "us_min": s[0], "us_all": us_all,
                        "samples": outputs.get(f"{k['name']}|{k.get('row')}") or [fround(math.sin(i)) for i in k["samples"]], "regs": 32})
    with open(out, "w") as f:
        json.dump({"format": "kiln-results/1", "device": DEVICE, "kernels": kernels, "runner": "fake_runner/1", "created": "2026-10-20T00:00:00"}, f)
else:
    log("usage: fake_runner.py device | run <bundle> --out <file>")
    sys.exit(2)
