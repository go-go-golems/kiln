// The page's side of the Kiln server without a server: record sync against a fake client (load, debounced posts,
// rejections remembered, records.added fetches, forget), server devices from GET /devices, and the job list.
//   node test/server-sync.mjs
import { k } from "@kiln/kiln/core/kiln.js";
import { N } from "@kiln/kiln/std/tensor.js";
import { pipeline } from "@kiln/kiln/std/emmy.js";
import { SPECS } from "@kiln/kiln/std/targets.js";
import { SimDevice } from "@kiln/kiln/std/devices.js";
import { EvidenceStore } from "@kiln/kiln/std/store.js";
import { programOf } from "@kiln/kiln/std/program.js";
import { measureProgram } from "@kiln/kiln/std/tune.js";
import { recordSync, ServerDevice, serverDevices, upsertJob, addJobEvent } from "../src/server-sync.js";

let bad = 0, total = 0;
const check = (name, ok, detail = "") => { total++; if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` · ${detail}` : ""}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = (rs) => rs.map((r) => r.id).sort().join();

// records: one program measured on two simulated GPUs
const g = k.trace("lin", ({ x }) => N.linear(x, N.weight("w", [64, 64])), { x: k.tensor([64, 64]) });
async function measured(spec) {
  const dev = new SimDevice(spec), store = new EvidenceStore();
  const run = pipeline({ target: dev.target, store }).run(g, { ctx: { deviceId: dev.evidenceId, store } });
  await measureProgram(programOf(run.graph), dev, { store, run });
  return [...store.records.values()];
}
const onServer = await measured(SPECS.rtx5090), local = await measured(SPECS.h100), later = await measured(SPECS.a100), extra = await measured(SPECS.orin);

// the fake server: records by id with the job that made them; `refuse` rejects ids; `down` fails every call
function fakeClient(initial = []) {
  const rows = new Map(initial.map((r) => [r.id, { r, job: null }]));
  const c = { calls: [], refuse: new Set(), down: false };
  const call = (name, arg) => { c.calls.push([name, arg]); if (c.down) throw new Error("server gone"); };
  c.rows = rows;
  c.records = {
    list: async (f = {}) => { call("list", f); return [...rows.values()].filter((x) => (!f.job || x.job === f.job) && (!f.device || x.r.device.id === f.device)).map((x) => x.r); },
    add: async (records) => {
      call("add", records.map((r) => r.id));
      const out = { added: 0, duplicates: 0, rejected: [] };
      for (const r of records) {
        if (c.refuse.has(r.id)) out.rejected.push({ id: r.id, reason: "id does not match the content" });
        else if (rows.has(r.id)) out.duplicates++;
        else { rows.set(r.id, { r, job: null }); out.added++; }
      }
      return out;
    },
    forget: async (device) => { call("forget", device); let n = 0; for (const [id, x] of rows) if (x.r.device.id === device) { rows.delete(id); n++; } return n; },
  };
  return c;
}
const count = (c, name) => c.calls.filter(([n]) => n === name).length;

{
  // load: the server's records come in and are not posted back
  const client = fakeClient(onServer), store = new EvidenceStore();
  const sync = recordSync({ client, store, delay: 20 });
  const r = await sync.load();
  check("load imports the server's records", r.added === onServer.length && store.size === onServer.length, JSON.stringify(r));
  await sleep(60);
  check("records loaded from the server are never posted back", count(client, "add") === 0 && sync.pending().length === 0);

  // the page measures twice within the debounce: one post with exactly the new records
  for (const x of local) store.add(x);
  await sleep(5);
  for (const x of extra) store.add(x);
  check("nothing is posted before the debounce", count(client, "add") === 0);
  await sleep(60);
  const posts = client.calls.filter(([n]) => n === "add");
  check("new records are posted once, debounced", posts.length === 1 && posts[0][1].slice().sort().join() === ids([...local, ...extra]), JSON.stringify(posts.map((p) => p[1].length)));
  check("the server now holds them", [...local, ...extra].every((x) => client.rows.has(x.id)) && sync.pending().length === 0);

  // records.added for a job: fetched by job, imported, not posted back
  for (const x of later) client.rows.set(x.id, { r: x, job: "job-1" });
  const a = await sync.added({ job: "job-1", device: later[0].device.id, ids: later.map((x) => x.id) });
  check("records.added fetches the job's records", a.added === later.length && later.every((x) => store.records.has(x.id)) && client.calls.some(([n, f]) => n === "list" && f.job === "job-1"));
  await sleep(60);
  check("records from records.added are not posted back", count(client, "add") === 1);
  const lists = count(client, "list");
  await sync.added({ job: null, ids: local.map((x) => x.id) });
  check("records.added for records the page has fetches nothing", count(client, "list") === lists);

  // forget: every distinct device, once
  const n = await sync.forget([local[0].device.id, local[0].device.id, later[0].device.id]);
  check("forget deletes on the server, once per device", n === local.length + later.length && client.calls.filter(([n]) => n === "forget").length === 2);
  sync.stop();
}

{
  // rejections: reported once with the reason, never posted again
  const client = fakeClient(), store = new EvidenceStore();
  const heard = [];
  const sync = recordSync({ client, store, delay: 10, onRejected: (rs) => heard.push(rs) });
  client.refuse.add(local[0].id);
  for (const x of local) store.add(x);
  await sync.flush();
  check("a rejection is reported with its reason", heard.length === 1 && heard[0][0].id === local[0].id && /content/.test(heard[0][0].reason));
  check("the rejected record is remembered", sync.refused.get(local[0].id) === "id does not match the content" && !sync.synced.has(local[0].id));
  for (const x of later) store.add(x);
  await sync.flush();
  const last = client.calls.filter(([n]) => n === "add").at(-1)[1];
  check("a rejected record is not posted again", !last.includes(local[0].id) && last.length === later.length && heard.length === 1);

  // the server goes away: reported, the records stay pending, the next flush posts them
  const errs = [];
  const client2 = fakeClient(), store2 = new EvidenceStore();
  const sync2 = recordSync({ client: client2, store: store2, delay: 10, onError: (e) => errs.push(e.message) });
  client2.down = true;
  for (const x of local) store2.add(x);
  await sync2.flush();
  check("a failed post is reported and stays pending", errs.length === 1 && sync2.pending().length === local.length);
  client2.down = false;
  await sync2.flush();
  check("the next flush posts what was pending", sync2.pending().length === 0 && local.every((x) => client2.rows.has(x.id)));

  // posts go in chunks
  const client3 = fakeClient(), store3 = new EvidenceStore();
  const sync3 = recordSync({ client: client3, store: store3, delay: 10, chunk: 1 });
  for (const x of later) store3.add(x);
  await sync3.flush();
  check("posts are chunked", count(client3, "add") === later.length && later.every((x) => client3.rows.has(x.id)));
  for (const s of [sync, sync2, sync3]) s.stop();
}

{
  // server devices from GET /devices
  const probes = [];
  const client = { devices: { probe: async (ex) => { probes.push(ex); return { id: "cuda:fake-1", class: "cuda", name: "CUDA Fake GPU (development)", fingerprint: { name: "Fake GPU (development)", cc: "9.0", sms: 132, host: "box" }, executor: ex, available: true, records: 3 }; } } };
  const views = [
    { id: null, class: "cuda", name: "dev-fake", fingerprint: null, executor: "dev-fake", available: false, error: "not probed yet", records: 0 },
    { id: "sim:rtx5090-1", class: "sim", name: "RTX 5090", fingerprint: {}, executor: null, available: false, records: 4 },
  ];
  const [d] = serverDevices(views, [], client);
  check("one server device per executor", serverDevices(views, [], client).length === 1 && d.id === "server:dev-fake" && d.kind === "cuda" && d.server);
  check("an executor not reached yet is not ready and has no evidence id", d.status.startsWith("not connected: not probed yet") && d.evidenceId === null && /dev-fake · server/.test(d.label));
  const ok = await d.probe();
  check("a probe adopts the server's identity", ok && probes[0] === "dev-fake" && d.evidenceId === "cuda:fake-1" && d.status === "ready" && d.label === "CUDA Fake GPU (development) · dev-fake · server");
  check("the target comes from the report (cc 9.0 → H100, 132 SMs)", d.target.sm === 90 && d.target.sms === 132 && d.target.name === "CUDA Fake GPU (development)");
  const [same] = serverDevices([{ ...views[0], id: "cuda:fake-1", name: "CUDA Fake GPU (development)", fingerprint: { cc: "9.0", sms: 132 }, available: true }], [d], client);
  check("a device keeps its object across re-reads", same === d && d.status === "ready");
  const failing = new ServerDevice("gone", { devices: { probe: async () => { throw new Error("no executor gone"); } } });
  check("a failed probe says why", !(await failing.probe()) && failing.status === "not connected: no executor gone");
  check("the job protocol defaults to jobSpec's", JSON.stringify(new ServerDevice("x", null).protocol) === JSON.stringify({ reps: 7, warmup: 3, launches: 20, seed: 1 }));
}

{
  // the job list: newest first, job.updated keeps events, job.event appends once
  let jobs = [];
  jobs = upsertJob(jobs, { id: "a", createdAt: "2026-10-19T10:00:00.000Z", status: "done" });
  jobs = upsertJob(jobs, { id: "b", createdAt: "2026-10-19T11:00:00.000Z", status: "proposed", events: [{ at: "t1", kind: "proposed", detail: "1 kernel" }] });
  check("jobs are newest first", jobs.map((j) => j.id).join() === "b,a");
  jobs = upsertJob(jobs, { id: "b", createdAt: "2026-10-19T11:00:00.000Z", status: "running" });
  check("job.updated keeps the events it does not carry", jobs[0].status === "running" && jobs[0].events.length === 1);
  jobs = addJobEvent(jobs, { job: "b", at: "t2", kind: "running", detail: "on dev-fake" });
  jobs = addJobEvent(jobs, { job: "b", at: "t2", kind: "running", detail: "on dev-fake" });
  jobs = addJobEvent(jobs, { job: "a", at: "t3", kind: "done", detail: "2 records" });
  check("job.event appends once, and only to a job whose events are held", jobs[0].events.length === 2 && !jobs[1].events);
}

{
  // a page with a token whose origin is not the Kiln server (the runner's serve mode): no server, the runner stays
  const { wb } = await import("../src/ui/wb.js");
  wb.server = { health: async () => { throw new Error("HTTP 404"); } };
  await wb.startServer();
  check("a token without the Kiln server behind it: no server, the runner device stays", wb.server === null && wb.serverInfo.state === "none" && wb.devices.some((d) => d.id === "cuda" && !d.server));
}

console.log(bad ? `${bad} of ${total} FAILED` : `all ${total} passed`);
process.exitCode = bad ? 1 : 0;
