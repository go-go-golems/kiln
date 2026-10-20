#!/usr/bin/env node
// The first run of Kiln's CUDA runner executor against a real GPU host (KILN-002 PN, guide §24 step 1).
//
// Drives apps/server/src/executors/cuda-runner.ts itself — the class the server instantiates from an executor profile —
// rather than calling the runner by hand, so the run exercises what the guide lists: copying runner/kiln_runner.py to
// the host under its content hash, nvcc discovery on the host, one protocol repetition per invocation, and the
// kiln-results/1 format. Each program is compiled here from a Workbench preset, bundled with bundle(), run through the
// executor, and checked with ingest(), which compares the runner's sampled outputs with the Loop IR reference
// (rtol 2e-3, atol 2e-4).
//
//   node cuda-runner-smoke.mjs --kiln /path/to/kiln --host user@host [--target gb10] [--python python3]
//        [--reps 20] [--out results.json] [--device-only]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };
const KILN = resolve(opt("kiln", "."));
const host = opt("host");
if (!host) { process.stderr.write("--host user@host is required\n"); process.exit(2); }
const imp = (p) => import(pathToFileURL(join(KILN, p)).href);

const { CudaRunnerExecutor } = await imp("apps/server/src/executors/cuda-runner.ts");
const { compileScript } = await imp("apps/workbench/src/compile.js");
const { params: paramSet } = await imp("packages/kiln/src/core/kiln.js");
const { SPECS, target: mkTarget } = await imp("packages/kiln/src/std/targets.js");
const { bundle, ingest } = await imp("packages/kiln/src/std/devices.js");

const exec = new CudaRunnerExecutor({
  id: "smoke", target: "ssh", host, runner: join(KILN, "runner/kiln_runner.py"),
  ...(opt("python") ? { python: opt("python") } : {}), env: { KILN_ARCH: "native" },
});
process.stderr.write(`runner on ${host}: ${exec.remoteRunnerPath()}\n`);
let t = performance.now();
const device = await exec.probe();
const probeMs = performance.now() - t;
process.stderr.write(`device (${probeMs.toFixed(0)} ms): ${JSON.stringify(device)}\n`);
if (argv.includes("--device-only")) {
  if (opt("out")) writeFileSync(opt("out"), JSON.stringify({ host, device, probeMs }, null, 1) + "\n");
  process.exit(0);
}

const spec = SPECS[opt("target", "rtx5090")];
if (!spec) { process.stderr.write(`unknown target; one of ${Object.keys(SPECS).join(" ")}\n`); process.exit(2); }
const target = mkTarget(spec);
const PRESETS = join(KILN, "apps/workbench/presets");
const preset = (id) => readFileSync(join(PRESETS, readdirSync(PRESETS).find((n) => n.startsWith(id + "-") && n.endsWith(".js"))), "utf8");
const cases = [
  ...[256, 512, 1024, 1536, 2048, 2304].flatMap((w) => [256, 768].map((d) => ({ preset: "W-26", pins: { windows: w, dims: d } }))),
  ...["separable", "direct"].flatMap((form) => [8, 100].map((n) => ({ preset: "W-28", pins: { geometry: "768x416", detections: n, form } }))),
];
const reps = Number(opt("reps", 20));
const rows = [];
for (const c of cases) {
  const comp = compileScript(preset(c.preset), { params: paramSet([]), target, pins: c.pins });
  if (!comp.ok || !comp.prog) throw new Error(`${c.preset} ${JSON.stringify(c.pins)}: ${JSON.stringify(comp.diags)}`);
  const kernels = comp.prog.kernels;
  t = performance.now();
  const res = await exec.runRepetition(bundle(kernels, { reps, warmup: 5 }), AbortSignal.timeout(600_000));
  const wallMs = performance.now() - t;
  const got = ingest(res, kernels);
  kernels.forEach((k, i) => {
    const g = got[i], r = res.kernels.find((x) => x.name === k.name && (!x.identity || x.identity === k.identity)) || {};
    const row = {
      preset: c.preset, pins: c.pins, kernel: k.name, identity: k.identity, row: k.row, grid: k.K.grid, block: k.K.block,
      usMedian: g.us ?? null, usMin: r.us_min ?? null, launches: g.launches ?? null, regs: r.regs ?? null,
      check: g.check ? { ok: g.check.ok, maxAbs: g.check.maxAbs, bad: g.check.bad, n: g.check.n } : null, error: g.error ?? r.error ?? null,
      gbs: g.metrics?.gbs ?? null, wallMs: Math.round(wallMs),
    };
    rows.push(row);
    process.stderr.write(`${c.preset} ${Object.values(c.pins).join(" ")} ${k.name}: ${row.usMedian?.toFixed?.(1)} us, check ${row.check?.ok ? "ok" : "FAILED"} (max |d| ${row.check?.maxAbs?.toExponential?.(2)}, ${row.check?.bad}/${row.check?.n} bad)${row.error ? " ERROR " + row.error : ""}\n`);
  });
}
const out = { host, target: spec.id, runner: device.version ?? null, device, probeMs: Math.round(probeMs), reps, rows,
  ok: rows.every((r) => r.check?.ok && !r.error) };
if (opt("out")) writeFileSync(opt("out"), JSON.stringify(out, null, 1) + "\n");
process.stderr.write(`${rows.length} kernels, ${rows.filter((r) => r.check?.ok).length} agree with the reference\n`);
process.exit(out.ok ? 0 : 1);
