// Run a lab program's plan on a Kiln server's real hosts through the served workbench, the way a person would: open
// the program, set its parameters (a plan-bound one becomes a pending plan), dry-run the missing captures, run them as
// jobs, wait until every job ends and its runs arrive, then screenshot the Lab view, every board and Inspect.
//
//   node 03-run-lab-program.mjs --url http://127.0.0.1:5380/ --program local-sampler \
//        --params '{"host":"bling","queries":4096}' --shots DIR [--dry-only | --view-only] [--views jobs,devices] [--minutes 60]
//
// --view-only screenshots what is already measured without running the missing captures (a program whose hosts are not
// on this server); --views adds dock views (Jobs, Devices) to the screenshots at the end.
//
// Screenshots are DIR/<tag>-*.png, where tag is the program and its parameters. Nothing here talks to a driver: the
// page submits jobs to the server, exactly as the Plan section's Run button does.
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { withPage } from "/Volumes/SSD/code/kiln/scripts/shoot.mjs";

const args = process.argv.slice(2);
const opt = (name, d = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const url = opt("--url", "http://127.0.0.1:5380/");
const program = opt("--program", "local-sampler");
const params = JSON.parse(opt("--params", "{}"));
const shots = opt("--shots");
const dryOnly = args.includes("--dry-only");
const viewOnly = args.includes("--view-only");
const views = (opt("--views", "") || "").split(",").filter(Boolean);
const minutes = Number(opt("--minutes", "60"));
const tag = [program, ...Object.entries(params).map(([k, v]) => `${k}-${v}`)].join("_");
if (shots) mkdirSync(shots, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const READY = `(() => { const wb = window.__kiln?.wb; return wb?.ready && wb.serverInfo.state === "connected" && wb.hosts.length > 0 && wb.hosts.every((h) => h.offers); })()`;
const show = (view) => `(async () => { const wb = window.__kiln.wb; wb.showView(${JSON.stringify(view)}); if (!wb.narrow) { let t = null; const walk = (n) => { if (n.t === "tile" && n.views.includes(${JSON.stringify(view)})) t = n; (n.kids || []).forEach(walk); }; walk(wb.layout); if (t && wb.maxTile !== t.id) { wb.maxTile = null; wb.toggleMax(t.id); } } await new Promise((r) => setTimeout(r, 600)); document.querySelectorAll(".scroll").forEach((s) => s.scrollTo(0, 0)); return true; })()`;
const PLAN = `(() => { const c = window.__kiln.labs.current; return { error: c.error, captures: c.ir?.plan.captures.map((x) => ({ ref: x.ref, host: x.host, status: x.status, reps: x.reps, hash: x.hash })) ?? [], pending: c.pending ? c.pending.captures.length : 0, lint: (c.ir?.lint ?? []).filter((l) => l.level === "error").map((l) => l.message) }; })()`;
const shot = async (p, name) => { if (shots) { await p.shot(join(shots, `${tag}-${name}.png`)); log(`shot ${tag}-${name}.png`); } };

await withPage({ url, size: "1600x1000", timeout: (minutes + 10) * 60000 }, async (p) => {
  await p.until(READY, 120000);
  log("page ready:", await p.eval(`window.__kiln.wb.hosts.map((h) => h.id + (h.offers ? "" : " (not probed)")).join(", ")`));
  await p.eval(`window.__kiln.labs.open(${JSON.stringify(program)}).then(() => true)`);
  for (const [k, v] of Object.entries(params)) await p.eval(`(() => { window.__kiln.labs.setParam(${JSON.stringify(k)}, ${JSON.stringify(v)}); return true; })()`);
  let plan = await p.eval(PLAN);
  if (plan.error) throw new Error(`${program}: ${plan.error}`);
  if (plan.lint.length) log("lint errors:", plan.lint.join(" | "));
  const missing = await p.eval(`window.__kiln.labs.missing().map((c) => c.ref + " on " + c.host + " ×" + c.reps)`);
  log(`${program}: ${plan.captures.length} captures; missing ${missing.length}${plan.pending ? " (pending plan)" : ""}:`, missing.join(", ") || "none");
  await p.eval(show("lab"));

  if (missing.length && !viewOnly) {
    const dry = await p.eval(`window.__kiln.labs.runPlan(undefined, { dryRun: true }).then((rs) => rs.map((r) => ({ host: r.host, steps: r.steps, groups: r.groups, verdicts: r.verdicts.map((v) => v.verdict + ":" + v.mode) })))`);
    for (const d of dry) log(`dry run on ${d.host}: ${d.groups} groups, ${d.steps} steps; ${d.verdicts.join(" ")}`);
    await p.eval(`(() => { document.querySelector('.lab-dry')?.scrollIntoView({ block: "start" }); return true; })()`);
    await shot(p, "dry-run");
    if (dryOnly) return;
    await p.eval(`(() => { window.__kiln.labs.current.dryRun = null; window.__kiln.wb.bump("lab"); return true; })()`);
    const jobs = await p.eval(`window.__kiln.labs.runPlan().then((js) => js.map((j) => j.id))`);
    log(`submitted ${jobs.length} jobs: ${jobs.join(", ")}`);
    if (!jobs.length) throw new Error("no job was taken");
    await sleep(3000);
    await p.eval(show("lab"));
    await shot(p, "running");
    const t0 = Date.now();
    for (let last = ""; ; await sleep(5000)) {
      const st = await p.eval(`window.__kiln.wb.jobs.filter((j) => ${JSON.stringify(jobs)}.includes(j.id)).map((j) => ({ id: j.id, status: j.status, progress: j.progress, error: j.error }))`);
      const line = st.map((j) => `${j.id.slice(4, 12)} ${j.status}`).join(" · ");
      if (line !== last) { log(line); last = line; }
      if (st.length === jobs.length && st.every((j) => ["done", "failed", "cancelled"].includes(j.status))) {
        for (const j of st.filter((x) => x.status !== "done")) log(`job ${j.id} ${j.status}: ${j.error}`);
        break;
      }
      if (Date.now() - t0 > minutes * 60000) throw new Error(`jobs still running after ${minutes} minutes`);
    }
    // the runs arrive by catalog.changed; the plan's captures are cached once they have
    await p.until(`window.__kiln.labs.missing().length === 0 || !window.__kiln.labs.current.pending && window.__kiln.labs.current.ir.plan.captures.every((c) => c.status !== "execute" || !(c.host in window.__kiln.labs.reports))`, 120000).catch(() => log("some captures are still missing after the jobs ended"));
    await sleep(2000);
  }

  plan = await p.eval(PLAN);
  log(`after: ${plan.captures.map((c) => `${c.ref} ${c.status}`).join(", ")}`);
  const verdicts = await p.eval(`[...document.querySelectorAll('section[aria-label="Hypotheses"] tbody tr')].map((r) => r.querySelector(".mono")?.textContent + " " + r.querySelector(".stamp")?.textContent)`);
  log(`verdicts: ${verdicts.join(" · ") || "none"}`);
  await p.eval(show("lab"));
  await shot(p, "lab");
  for (const section of ["Plan", "Runs"]) {
    await p.eval(`(() => { document.querySelector('section[aria-label="${section}"]')?.scrollIntoView({ block: "start" }); return true; })()`);
    await shot(p, `lab-${section.toLowerCase()}`);
  }
  const boards = await p.eval(`window.__kiln.labs.current.ir.boards.map((b) => b.id)`);
  for (const b of boards) {
    await p.eval(show(`board:${b}`));
    const errs = await p.eval(`[...document.querySelectorAll(".lab-board .lab-err")].map((e) => e.textContent)`);
    if (errs.length) log(`board ${b}: ${errs.length} panel errors: ${errs.join(" | ")}`);
    await shot(p, `board-${b}`);
  }
  const run = await p.eval(`(() => { const r = window.__kiln.labs.current.reg.source.runs("*/*/*").find((x) => x.synthetic === false); if (r) window.__kiln.labs.select(r.ref); return r?.ref ?? null; })()`);
  if (run) { await p.eval(show("inspect")); await shot(p, "inspect-run"); log(`inspected ${run}`); }
  // a request of a measured trace run: its ranges and operators are recorded relationships
  const req = await p.eval(`(() => { const src = window.__kiln.labs.current.reg.source; const t = src.runs("*/*/trace").find((x) => x.synthetic === false); const r = t && src.entities("request", t.ref.replace(/#\\d+$/, ""))[0]; if (r) window.__kiln.labs.select(r.ref); return r?.ref ?? null; })()`);
  if (req) { await p.eval(show("inspect")); await shot(p, "inspect-request"); log(`inspected ${req}`); }
  for (const v of views) { await p.eval(show(v)); await shot(p, `view-${v}`); }
});
log("done");
