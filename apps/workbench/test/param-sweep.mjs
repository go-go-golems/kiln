// Compile every preset at the extremes of each parameter (others at defaults) and on every simulated device.
//   node test/param-sweep.mjs [W-11 …]
import { wb } from "../src/ui/wb.js";
const only = process.argv.slice(2);
let bad = 0, n = 0;
for (const p of wb.presets) {
  if (only.length && !only.includes(p.id)) continue;
  await wb.load(p.id);
  const params = (wb.project?._params || []).filter((q) => ["int", "enum", "bool", "float"].includes(q.type));
  const trials = [];
  for (const q of params) {
    const vals = q.type === "enum" ? q.opts.values : q.type === "bool" ? [true, false] : [q.opts.min, q.opts.max];
    for (const v of vals) trials.push([q, v]);
  }
  for (const [q, v] of trials) {
    await wb.load(p.id);
    const t0 = performance.now();
    try { wb.setParam(q, v); } catch (e) { console.log(`FAIL ${p.id} ${q.name}=${v}: threw ${e.message}`); bad++; continue; }
    n++;
    const errs = wb.diags.filter((d) => d.level === "error");
    const ms = performance.now() - t0;
    if (errs.length || !wb.run?.ok) { bad++; console.log(`FAIL ${p.id} ${q.name}=${v}: ${errs.map((d) => d.message).join("; ").slice(0, 300)}`); }
    else if (ms > 8000) console.log(`slow ${p.id} ${q.name}=${v}: ${ms.toFixed(0)} ms`);
  }
  for (const d of wb.devices.filter((x) => x.kind === "sim")) {
    await wb.load(p.id);
    await wb.setDevice(d.id, { quiet: true });
    n++;
    const errs = wb.diags.filter((x) => x.level === "error");
    if (errs.length || !wb.run?.ok) { bad++; console.log(`FAIL ${p.id} on ${d.id}: ${errs.map((x) => x.message).join("; ").slice(0, 300)}`); }
  }
  console.log(`${p.id}: ${trials.length} parameter extremes + devices`);
}
console.log(bad ? `${bad} of ${n} FAILED` : `all ${n} compiles pass`);
process.exitCode = bad ? 1 : 0;
