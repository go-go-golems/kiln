// Measure kernel presets on a Kiln host through the served workbench, the way a person would: load the preset, pick
// the host's device, press Measure (one approved kiln-kernels/1 job), wait until the job ends and its records arrive,
// then screenshot Perf, Evidence and the job in Jobs. Jobs on one host run one at a time, so the presets go in order.
//
//   node 04-measure-presets.mjs --url http://127.0.0.1:5380/ --host bling --presets W-05,W-06 --shots DIR [--minutes 20]
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { withPage } from "/Volumes/SSD/code/kiln/scripts/shoot.mjs";

const args = process.argv.slice(2);
const opt = (name, d = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const url = opt("--url", "http://127.0.0.1:5380/");
const host = opt("--host", "bling");
const presets = opt("--presets", "W-05").split(",");
const shots = opt("--shots");
const minutes = Number(opt("--minutes", "20"));
if (shots) mkdirSync(shots, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const device = `host:${host}`;
const READY = `(() => { const wb = window.__kiln?.wb; return wb?.ready && wb.serverInfo.state === "connected" && wb.devices.some((d) => d.id === ${JSON.stringify(device)} && d.status === "ready"); })()`;
const show = (view) => `(async () => { const wb = window.__kiln.wb; wb.showView(${JSON.stringify(view)}); if (!wb.narrow) { let t = null; const walk = (n) => { if (n.t === "tile" && n.views.includes(${JSON.stringify(view)})) t = n; (n.kids || []).forEach(walk); }; walk(wb.layout); if (t && wb.maxTile !== t.id) { wb.maxTile = null; wb.toggleMax(t.id); } } await new Promise((r) => setTimeout(r, 600)); document.querySelectorAll(".scroll").forEach((s) => s.scrollTo(0, 0)); return true; })()`;
const shot = async (p, name) => { if (shots) { await p.shot(join(shots, `${name}.png`)); log(`shot ${name}.png`); } };
const results = [];

await withPage({ url, size: "1600x1000", timeout: (presets.length * minutes + 10) * 60000 }, async (p) => {
  await p.until(READY, 120000);
  log(`page ready; ${device} is ready`);
  for (const id of presets) {
    await p.eval(`(async () => { const wb = window.__kiln.wb; await wb.load(${JSON.stringify(id)}); await wb.setDevice(${JSON.stringify(device)}, { quiet: true }); return true; })()`);
    await p.until(`!!window.__kiln.wb.prog`, 60000).catch(() => {});
    const n = await p.eval(`window.__kiln.wb.prog?.kernels.length ?? 0`);
    if (!n) { log(`${id}: no GPU kernels, skipped`); continue; }
    const records0 = await p.eval(`window.__kiln.wb.store.records.size`);
    const job = await p.eval(`window.__kiln.wb.proposeJob(window.__kiln.wb.device, { quiet: true }).then((j) => j?.id ?? null)`);
    if (!job) { log(`${id}: the server did not take the job`); results.push({ id, status: "refused" }); continue; }
    log(`${id}: ${n} kernels, job ${job.slice(4, 12)}`);
    const t0 = Date.now();
    let st;
    for (let last = ""; ; await sleep(5000)) {
      st = await p.eval(`(() => { const j = window.__kiln.wb.jobs.find((x) => x.id === ${JSON.stringify(job)}); return j ? { status: j.status, progress: j.progress, error: j.error, records: j.records.length } : null; })()`);
      const line = st ? st.status : "unknown";
      if (line !== last) { log(`  ${id} ${line}`); last = line; }
      if (st && ["done", "failed", "cancelled"].includes(st.status)) break;
      if (Date.now() - t0 > minutes * 60000) { log(`  ${id}: still ${line} after ${minutes} minutes; moving on`); break; }
    }
    await p.until(`window.__kiln.wb.store.records.size > ${records0}`, 60000).catch(() => {});
    await sleep(2500);
    const records = (await p.eval(`window.__kiln.wb.store.records.size`)) - records0;
    results.push({ id, job, status: st?.status, error: st?.error ?? null, records, seconds: Math.round((Date.now() - t0) / 1000) });
    log(`  ${id}: ${st?.status}${st?.error ? ` (${st.error})` : ""}, ${records} new records in ${Math.round((Date.now() - t0) / 1000)} s`);
    for (const view of ["perf", "evidence"]) { await p.eval(show(view)); await shot(p, `${id}-${host}-${view}`); }
    await p.eval(`window.__kiln.wb.openJob(${JSON.stringify(job)}).then(() => true)`);
    await p.eval(show("jobs"));
    await shot(p, `${id}-${host}-job`);
  }
  await p.eval(show("devices"));
  await shot(p, `devices-${host}`);
});
console.log(JSON.stringify(results, null, 1));
