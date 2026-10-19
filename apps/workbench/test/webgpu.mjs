// The WebGPU measurement protocol (guide §28) on this machine's GPU, in headless Chrome: measure small presets on
// the webgpu device, check the records the store keeps, and check that the next compile decides on them.
// Exits 0 with a message when the page reports WebGPU unavailable. Not part of `pnpm test`: it needs a GPU.
//   node test/webgpu.mjs [preset…] [--shot DIR]     build first (pnpm test:webgpu does both); default W-05 W-10
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { repetitionOrder, timerQuantum } from "@kiln/kiln/std/devices.js";
import { withPage } from "../../../scripts/shoot.mjs";

const args = process.argv.slice(2);
const shotAt = args.indexOf("--shot");
const shots = shotAt >= 0 ? args.splice(shotAt, 2)[1] : null;
const presets = args.length ? args : ["W-05", "W-10"];
const page = new URL("../dist/kiln-workbench.html", import.meta.url);
if (!existsSync(page)) { console.error(`no ${page.pathname}: build first (pnpm build)`); process.exit(1); }

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
const us = (x) => (x == null ? "—" : x >= 100 ? x.toFixed(0) : x.toFixed(1));
const t0 = performance.now();

const out = await withPage({ url: pathToFileURL(page.pathname).href, webgpu: true, timeout: 600000 }, async (p) => {
  await p.until("window.__kiln?.wb?.ready", 60000);
  const probe = await p.eval(`(async () => {
    const wb = window.__kiln.wb;
    await wb.setDevice("webgpu", { quiet: true });
    const d = wb.device;
    return { status: d.status, info: d.info, fingerprint: d.fingerprint, evidenceId: d.evidenceId, protocol: d.protocol, userAgent: navigator.userAgent };
  })()`);
  if (probe.status !== "ready") return { probe };
  const runs = [];
  for (const id of presets) {
    runs.push(await p.eval(`(async () => {
      const wb = window.__kiln.wb, d = wb.device, store = wb.store, id = ${JSON.stringify(id)};
      wb.load(id);
      if (!wb.prog) return { id, error: "the preset compiles to no GPU kernels" };
      const kernels = [...new Map(wb.prog.kernels.map((k) => [k.identity + "|" + k.row, k])).values()];
      const rec = await wb.measure({ quiet: true });
      if (!rec) return { id, error: "measure returned nothing (" + d.status + ")" };
      const want = new Set(rec.kernels.map((k) => k.record));
      const records = store.list({ device: d.evidenceId }).filter((r) => want.has(r.id)).map((r) => ({
        id: r.id, name: r.kernel.name, identity: r.kernel.identity, row: r.kernel.row, timing: r.timing, protocol: r.protocol,
        check: r.check, validity: r.validity, status: store.status(r), decisive: store.isDecisive(r),
        index: kernels.findIndex((k) => k.identity === r.kernel.identity && k.row === r.kernel.row),
        stats: store.statsFor(d.evidenceId, r.kernel.identity, r.kernel.knobs),
      }));
      for (const r of records) if (r.stats) delete r.stats.records;
      // wb.measure recompiled: these are the decisions taken with the new records in the store
      const decisions = wb.run.decisions.filter((x) => x.rule === "schedule").map((x) => ({ key: x.key, by: x.by, note: x.note ?? null, row: store.rowOf(x.knobs) }));
      return { id, n: kernels.length, ms: rec.ms, records, decisions };
    })()`));
    if (shots) { await p.eval(`window.__kiln.wb.showView("perf")`); await new Promise((r) => setTimeout(r, 600)); console.log(`shot ${await p.shot(`${shots}/webgpu-${id}.png`)}`); }
  }
  return { probe, runs, errors: p.errors };
});

const { probe } = out;
if (probe.status !== "ready") { console.log(`skip: WebGPU unavailable in headless Chrome (${probe.status})`); process.exit(0); }
console.log(`adapter ${probe.info.vendor} ${probe.info.architecture}${probe.info.description ? ` (${probe.info.description})` : ""} · timestamps ${probe.info.timestamps ? "granted" : "not granted"} · ${probe.userAgent.match(/(Headless)?Chrome\/[\d.]+/)?.[0]}`);
console.log(`device ${probe.evidenceId} · protocol ${probe.protocol.reps} reps × ${probe.protocol.launches} launches, ${probe.protocol.warmup} warm-up, seed ${probe.protocol.seed}`);
check(/^webgpu:[a-z0-9-]+-[0-9a-f]{8}$/.test(probe.evidenceId), `a fingerprinted device id: ${probe.evidenceId}`);
const kind = probe.info.timestamps ? "gpu-timestamp" : "wall-clock";

for (const run of out.runs) {
  if (run.error) { check(false, `${run.id}: ${run.error}`); continue; }
  const q = timerQuantum(run.records.flatMap((r) => (r.timing.raw || []).flat()));
  console.log(`\n${run.id}: ${run.n} kernel${run.n === 1 ? "" : "s"}, measured in ${(run.ms / 1000).toFixed(2)} s · timer step ${q === null ? "below 1 ns or irregular" : `${+q.toFixed(4)} µs`}`);
  check(run.records.length === run.n, `${run.id}: one record per kernel (${run.records.length} of ${run.n})`);
  for (const r of run.records) {
    const P = r.protocol, T = r.timing, s = r.stats;
    console.log(`  ${r.name.padEnd(28)} ${r.row.padEnd(34)} ${T.kind} n=${T.samples.length} median ${us(s?.median)} µs [${us(s?.lo)}, ${us(s?.hi)}] · samples ${T.samples.map(us).join(" ")} · positions ${P.position?.join("") ?? "—"} · ${r.status}${r.validity.ok ? "" : ` (${r.validity.reasons.join("; ")})`}${r.validity.partial.length ? ` (${r.validity.partial.join("; ")})` : ""}`);
    check(T.kind === kind, `${r.name}: timing kind ${T.kind}`);
    if (!r.validity.ok) { check(r.validity.reasons.length > 0, `${r.name}: invalid, and says why`); continue; }
    check(T.samples.length === P.reps && P.reps === probe.protocol.reps && P.seed === probe.protocol.seed, `${r.name}: ${T.samples.length} samples for ${P.reps} repetitions, seed ${P.seed}`);
    check(T.raw?.length === T.samples.length && T.raw.every((x) => x.length === probe.protocol.launches) && T.launches === probe.protocol.launches && T.warmup === probe.protocol.warmup, `${r.name}: ${T.raw?.length} × ${T.launches} raw launch times`);
    const order = P.position?.map((_, rep) => repetitionOrder(run.n, P.seed, rep).indexOf(r.index));
    check(JSON.stringify(P.position) === JSON.stringify(order), `${r.name}: positions follow the seeded orders`);
    check(r.check.ok && r.check.sampled > 0, `${r.name}: output check on ${r.check.sampled} sampled outputs${r.check.maxAbsErr != null ? `, max |err| ${r.check.maxAbsErr.toExponential(1)}` : ""}`);
    if (r.decisive) check(s && s.n === T.samples.length && s.lo <= s.median && s.median <= s.hi, `${r.name}: the store's interval [${us(s?.lo)}, ${us(s?.hi)}] holds its median, n=${s?.n}${s?.note ? ` (${s.note})` : ""}`);
    else check(!s && r.status === "partial", `${r.name}: a partial record has no interval for the policy (${r.validity.partial.join("; ")})`);
  }
  for (let rep = 0; rep < probe.protocol.reps && run.n > 1; rep++) {
    const at = run.records.map((r) => r.protocol.position?.[rep]).sort();
    if (run.records.every((r) => r.validity.ok)) check(JSON.stringify(at) === JSON.stringify([...Array(run.n).keys()]), `repetition ${rep}: the kernels took each position once`);
  }
  for (const r of run.records) {
    const d = run.decisions.find((x) => x.key === r.identity);
    if (!d) { check(false, `${r.name}: no schedule decision in the next compile`); continue; }
    console.log(`  next compile ${r.name}: by ${d.by} → ${d.row}${d.note ? ` (${d.note})` : ""}`);
    if (r.decisive) check(d.by === "evidence" && !!d.note, `${r.name}: decisive records decide the next compile (by ${d.by}: ${d.note})`);
    else check(d.by === "model", `${r.name}: records that may not decide (${r.status}) leave it to the model`);
  }
}
if (out.errors.length) check(false, `page errors:\n  ${out.errors.join("\n  ")}`);
console.log(`\n${fails ? `${fails} FAILED` : "all webgpu checks pass"} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exitCode = fails ? 1 : 0;
