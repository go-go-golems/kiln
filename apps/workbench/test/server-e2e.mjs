// The served workbench end to end, without a GPU and without SSH (guide §30, Phase 5b): the development server
// (apps/server/test/support/serve-dev.ts: one fake CUDA executor, "Fake GPU (development)", whose outputs are the
// job's reference values), headless Chrome on the page it serves, W-05 measured on the server device as a job, the
// job's records in the store and the Evidence view, and the next compile deciding by evidence. An agent-proposed job
// is approved and another cancelled through the Jobs view's buttons. A second, fresh page then loads the records from
// the server and decides by evidence without measuring.
// Not part of `pnpm test`: it needs Chrome and a built page.
//   node build.mjs && node test/server-e2e.mjs [--shots DIR]    (DIR gets p5b-*.png in light, dark and phone)
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "../../../scripts/shoot.mjs";

const args = process.argv.slice(2);
const shotAt = args.indexOf("--shots");
const shots = shotAt >= 0 ? args[shotAt + 1] : null;
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dist = here("../dist/");
if (!existsSync(join(dist, "kiln-workbench.html"))) { console.error(`no ${dist}kiln-workbench.html: build first (node build.mjs)`); process.exit(1); }

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the development server on a free-ish port, its data in a temporary directory
const port = 5290 + Math.floor(Math.random() * 400);
const data = mkdtempSync(join(tmpdir(), "kiln-e2e-"));
const server = spawn(process.execPath, [here("../../server/test/support/serve-dev.ts")], { cwd: here("../../server/"), env: { ...process.env, KILN_DATA_DIR: data, KILN_PORT: String(port), KILN_DIST: dist }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", (d) => { log += d; });
server.stderr.on("data", (d) => { log += d; });
for (const t0 = Date.now(); !/DEVELOPMENT server on/.test(log); await sleep(50)) {
  if (server.exitCode != null || Date.now() - t0 > 20000) { console.error(log); process.exit(1); }
}
const url = `http://127.0.0.1:${port}/`;
console.log(log.trim());

const READY = `(() => { const wb = window.__kiln?.wb; return wb?.ready && wb.serverInfo.state === "connected" && wb.devices.some((d) => d.id === "server:dev-fake" && d.status === "ready"); })()`;
// select and maximise a view's tile (on a phone, the strip shows one view anyway)
const show = (view, extra = "") => `(async () => { const wb = window.__kiln.wb; ${extra}; wb.showView(${JSON.stringify(view)}); if (!wb.narrow) { let t = null; const walk = (n) => { if (n.t === "tile" && n.views.includes(${JSON.stringify(view)})) t = n; (n.kids || []).forEach(walk); }; walk(wb.layout); if (t && wb.maxTile !== t.id) { wb.maxTile = null; wb.toggleMax(t.id); } } return true; })()`;
const clickButton = (label, scope) => `(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope)} + " button")].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (!b) return false; b.click(); return true; })()`;

try {
  // ---- the measurement: proposed → approved → running → done, records → decision
  const out = await withPage({ url, size: "1600x1000", timeout: 300000 }, async (p) => {
    await p.until(READY, 60000);
    const before = await p.eval(`(async () => {
      const wb = window.__kiln.wb;
      await wb.load("W-05");
      await wb.setDevice("server:dev-fake");
      const d = wb.device;
      return { device: { id: d.id, label: d.label, evidenceId: d.evidenceId, status: d.status, target: d.target.name + " sm_" + d.target.sm + " " + d.target.sms + " SMs" }, runnerOffered: wb.devices.some((x) => x.kind === "cuda" && !x.server), decisions: wb.run.decisions.map((x) => ({ rule: x.rule, by: x.by, note: x.note ?? null })), kernels: wb.prog.kernels.map((k) => k.name + " " + k.row), records: wb.store.list({ device: d.evidenceId }).length };
    })()`);
    const statuses = [];
    await p.eval(`(window.__seen = [], window.__kiln.wb.on("jobs", () => { const j = window.__kiln.wb.jobs[0]; if (j && window.__seen.at(-1) !== j.status) window.__seen.push(j.status); }), window.__kiln.wb.measure().then(() => true))`);
    await p.until(`(() => { const wb = window.__kiln.wb, j = wb.jobs[0]; return j?.status === "done" && j.records.length && j.records.every((id) => wb.store.records.has(id)) && wb.run.decisions.some((d) => d.by === "evidence"); })()`, 120000);
    const after = await p.eval(`(() => {
      const wb = window.__kiln.wb, j = wb.jobs[0], recs = j.records.map((id) => wb.store.records.get(id)), m = wb.measures[wb.deviceId];
      return { seen: window.__seen, job: { id: j.id, status: j.status, proposedBy: j.proposedBy, executor: j.executor, executorSeconds: j.executorSeconds, events: (j.events || []).map((e) => e.kind) },
        records: recs.map((r) => ({ id: r.id, device: r.device.id, by: r.by, valid: r.validity.ok, reasons: r.validity.reasons, check: r.check.ok, activation: r.activation.ok, n: r.timing.samples.length, status: wb.store.status(r) })),
        decisions: wb.run.decisions.map((x) => ({ rule: x.rule, by: x.by, note: x.note ?? null })), measured: m ? { total: m.total, job: m.job, kernels: m.kernels.length } : null, view: wb.phoneView };
    })()`);
    // an agent's job waits for Approve; another is cancelled from the Jobs view
    await p.eval(`window.__kiln.wb.proposeJob(window.__kiln.wb.device, { proposer: "agent", reason: "agent: re-measure W-05 to narrow the interval", quiet: true }).then((j) => !!j)`);
    await p.eval(show("jobs"));
    await p.until(`window.__kiln.wb.jobs[0]?.status === "proposed"`, 10000);
    const proposed = await p.eval(`(() => { const j = window.__kiln.wb.jobs[0]; return { id: j.id, status: j.status, proposedBy: j.proposedBy }; })()`);
    await p.eval(`window.__kiln.wb.openJob(window.__kiln.wb.jobs[1].id)`); // the done job in the side panel
    await sleep(500);
    if (shots) await p.shot(join(shots, "p5b-jobs-proposed-light-1600.png"));
    const approved = await p.eval(clickButton("Approve", ".jobt"));
    await p.until(`window.__kiln.wb.jobs.find((j) => j.id === ${JSON.stringify(proposed.id)})?.status === "done"`, 120000);
    await p.eval(`window.__kiln.wb.proposeJob(window.__kiln.wb.device, { proposer: "agent", reason: "agent: one more look, then withdrawn", quiet: true }).then((j) => !!j)`);
    await p.until(`window.__kiln.wb.jobs[0]?.status === "proposed" && !!document.querySelector(".jobt button")`, 10000).catch(async (e) => {
      console.error(await p.eval(`(() => { const wb = window.__kiln.wb; return JSON.stringify({ jobs: wb.jobs.map((j) => j.proposedBy + ":" + j.status), buttons: [...document.querySelectorAll(".jobt button")].map((b) => b.textContent), visible: wb.isVisible("jobs"), log: wb.events.slice(-6).map((x) => x.text) }); })()`));
      throw e;
    });
    const cancelled = await p.eval(clickButton("Cancel", ".jobt"));
    await p.until(`window.__kiln.wb.jobs[0]?.status === "cancelled"`, 10000);
    const final = await p.eval(`window.__kiln.wb.jobs.map((j) => j.proposedBy + ":" + j.status)`);
    if (shots) {
      await p.eval(`window.__kiln.wb.openJob(${JSON.stringify(after.job.id)})`);
      await p.eval(show("jobs"));
      await sleep(600);
      await p.shot(join(shots, "p5b-jobs-light-1600.png"));
      await p.eval(show("devices"));
      await sleep(400);
      await p.shot(join(shots, "p5b-devices-light-1600.png"));
      await p.eval(show("evidence", `wb.select({ record: ${JSON.stringify(after.records[0].id)}, kernel: "k_rms_norm_reduce" })`));
      await sleep(400);
      await p.shot(join(shots, "p5b-evidence-light-1600.png"));
      await p.eval(show("knobs"));
      await sleep(400);
      await p.shot(join(shots, "p5b-knobs-light-1600.png"));
      await p.eval(show("perf"));
      await sleep(400);
      await p.shot(join(shots, "p5b-perf-light-1600.png"));
    }
    return { before, after, proposed, approved, cancelled, final, errors: p.errors };
  });

  console.log(JSON.stringify(out, null, 1));
  const b = out.before, a = out.after;
  check(b.device.status === "ready" && b.device.evidenceId?.startsWith("cuda:fake-gpu-development") && /dev-fake · server/.test(b.device.label), `the server device: ${b.device.label} · ${b.device.evidenceId} · target ${b.device.target}`);
  check(!b.runnerOffered, "the runner-served CUDA device is not offered on the Kiln server's page");
  check(b.decisions.every((d) => d.by !== "evidence") && b.records === 0, `before: ${b.decisions.map((d) => `${d.rule} by ${d.by}`).join(", ")}, ${b.records} records on the device`);
  check(a.job.status === "done" && a.job.proposedBy === "user" && ["proposed", "approved", "running", "done"].every((k) => a.job.events.includes(k)), `job ${a.job.id}: events ${a.job.events.filter((k) => k !== "runner").join(" → ")}; statuses seen ${a.seen.join(" → ")}; ${a.job.executorSeconds} executor s`);
  check(a.records.length > 0 && a.records.every((r) => r.valid && r.check && r.activation && r.by === "job" && r.n === 7 && r.status === "fresh" && r.device === b.device.evidenceId), `${a.records.length} records: valid, checked, activated, 7 samples each, fresh, on ${b.device.evidenceId}`);
  check(a.decisions.some((d) => d.by === "evidence"), `after: ${a.decisions.map((d) => `${d.rule} by ${d.by}${d.note ? ` (${d.note})` : ""}`).join(", ")}`);
  check(a.measured?.job === a.job.id && Number.isFinite(a.measured.total), `Perf's measurement comes from the job: ${a.measured?.total?.toFixed(2)} µs`);
  check(out.proposed.status === "proposed" && out.proposed.proposedBy === "agent" && out.approved, "an agent's job waits as proposed and the Approve button runs it");
  check(out.cancelled && out.final[0] === "agent:cancelled", `the Cancel button withdraws a proposed job; jobs now ${out.final.join(", ")}`);
  check(!out.errors.length, `no page errors${out.errors.length ? ": " + out.errors.join("; ") : ""}`);

  // ---- a fresh page (a new browser profile): the server's records load, and the compile decides by evidence
  for (const [mode, opts] of [["light-1600", { size: "1600x1000" }], ["dark-1600", { size: "1600x1000", dark: true }], ["light-390", { size: "390x844" }], ["dark-390", { size: "390x844", dark: true }]]) {
    if (!shots && mode !== "light-1600") continue;
    const r = await withPage({ url, ...opts, timeout: 120000 }, async (p) => {
      await p.until(READY, 60000);
      const res = await p.eval(`(async () => {
        const wb = window.__kiln.wb;
        await wb.load("W-05");
        await wb.setDevice("server:dev-fake", { quiet: true });
        return { decisions: wb.run.decisions.map((x) => x.by + (x.note ? " (" + x.note + ")" : "")), records: wb.store.list({ device: wb.evidenceId }).length, jobs: wb.jobs.length };
      })()`);
      if (shots && mode !== "light-1600") {
        const first = await p.eval(`(() => { const wb = window.__kiln.wb, j = wb.jobs.find((x) => x.proposedBy === "user" && x.status === "done"); return { job: j.id, record: j.records[0] }; })()`);
        await p.eval(`window.__kiln.wb.openJob(${JSON.stringify(first.job)})`);
        await p.eval(show("jobs"));
        await sleep(700);
        await p.shot(join(shots, `p5b-jobs-${mode}.png`));
        await p.eval(show("devices"));
        await sleep(400);
        await p.shot(join(shots, `p5b-devices-${mode}.png`));
        await p.eval(show("evidence", `wb.select({ record: ${JSON.stringify(first.record)}, kernel: "k_rms_norm_reduce" })`));
        await sleep(400);
        await p.shot(join(shots, `p5b-evidence-${mode}.png`));
      }
      return { ...res, errors: p.errors };
    });
    if (mode === "light-1600") {
      check(r.records >= 1 && r.jobs === 3 && r.decisions.some((d) => d.startsWith("evidence")), `a fresh page loads ${r.records} records and ${r.jobs} jobs from the server and decides: ${r.decisions.join(", ")}`);
    }
    check(!r.errors.length, `${mode}: no page errors${r.errors.length ? ": " + r.errors.join("; ") : ""}`);
  }

  // ---- the page's own records reach the server, and Evidence's Forget reaches it too
  const sync = await withPage({ url, timeout: 120000 }, async (p) => {
    await p.until(READY, 60000);
    return p.eval(`(async () => {
      const wb = window.__kiln.wb, count = async (device) => (await (await fetch("/api/records?device=" + encodeURIComponent(device))).json()).records.length;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      await wb.load("W-05");
      const sim = wb.devices.find((d) => d.kind === "sim");
      const rec = await wb.measure({ device: sim, quiet: true });
      let posted = 0;
      for (let i = 0; i < 50 && !(posted = await count(sim.evidenceId)); i++) await sleep(100);
      await wb.setDevice("server:dev-fake", { quiet: true });
      const dev = wb.evidenceId, had = await count(dev);
      wb.showView("evidence");
      await sleep(300);
      const b = [...document.querySelectorAll(".toolbar button")].find((x) => x.textContent.trim() === "Forget this device");
      b?.click();
      let left = had;
      for (let i = 0; i < 50 && (left = await count(dev)); i++) await sleep(100);
      return { simRecords: rec.kernels.length, posted, had, left, local: wb.store.list({ device: dev }).length, clicked: !!b };
    })()`).then((r) => ({ ...r, errors: p.errors }));
  });
  check(sync.posted >= sync.simRecords && sync.simRecords > 0, `a record the page makes (simulated measure) is posted: ${sync.posted} on the server`);
  check(sync.clicked && sync.had > 0 && sync.left === 0 && sync.local === 0, `Evidence's Forget this device forgets on the server too: ${sync.had} → ${sync.left} there, ${sync.local} here`);
  check(!sync.errors.length, `sync: no page errors${sync.errors.length ? ": " + sync.errors.join("; ") : ""}`);
} catch (e) {
  console.error(e);
  console.error(log);
  fails++;
} finally {
  server.kill("SIGTERM");
  await new Promise((r) => (server.exitCode != null ? r() : server.once("exit", r)));
  rmSync(data, { recursive: true, force: true });
}
console.log(fails ? `${fails} FAILED` : "all passed");
process.exitCode = fails ? 1 : 0;
