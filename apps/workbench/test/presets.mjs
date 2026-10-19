// Every preset, headless: compile, end-to-end check, measure on the simulated GPU (sampled checks).
//   node build.mjs --gen-only && node test/presets.mjs [W-05 …]
import { wb } from "../src/ui/wb.js";
const only = process.argv.slice(2);
let bad = 0;
for (const p of wb.presets) {
  if (only.length && !only.includes(p.id)) continue;
  const t0 = performance.now();
  await wb.load(p.id);
  const errs = wb.diags.filter((d) => d.level === "error");
  const e = wb.e2e;
  const e2e = !e ? "none" : e.error ? "ERROR " + e.error : e.skipped ? (e.ok === false ? "FAIL " + e.custom.filter((c) => !c.ok).map((c) => `${c.name}: ${c.message}`).join("; ") : "skipped") : e.ok ? `pass@${e.level}` : "FAIL " + [...e.checks, ...e.custom].filter((c) => !c.ok).map((c) => `${c.name}: ${c.message}`).join("; ");
  let meas = "";
  if (wb.prog) {
    const rec = await wb.measure({ quiet: true });
    const kb = rec.kernels.filter((x) => x.error || x.check?.ok === false);
    meas = ` · ${rec.kernels.length} kernels ${rec.total.toFixed(1)} µs` + (kb.length ? " · KERNEL FAIL " + kb.map((x) => `${x.name}: ${x.error || x.check.message}`).join("; ") : "");
    if (kb.length) bad++;
  }
  const ok = wb.run?.ok && !errs.length && !/^(FAIL|ERROR)/.test(e2e);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${p.id} ${p.title}: ${errs.map((d) => `${d.line ? "line " + d.line + ": " : ""}${d.message}`).join("; ") || "compiled"} · ${wb.run?.decisions.length ?? 0} forks · e2e ${e2e}${meas} · ${(performance.now() - t0).toFixed(0)} ms`);
  for (const w of wb.diags.filter((d) => d.level === "warn")) console.log("      warn:", w.message);
}
console.log(bad ? `${bad} FAILED` : "all presets pass");
process.exitCode = bad ? 1 : 0;
