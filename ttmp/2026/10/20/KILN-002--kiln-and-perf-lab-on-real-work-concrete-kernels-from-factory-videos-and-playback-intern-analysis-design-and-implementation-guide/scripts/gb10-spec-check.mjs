#!/usr/bin/env node
// Does the measured gb10 spec choose better schedules on a GB10 than the RTX 5090 fallback it replaces, and does its
// model predict what the runner measures? (KILN-002 PN, guide §24 step 2.)
//
// Reads two cuda-runner-smoke.mjs results from the same host, one compiled with --target gb10 and one with
// --target OTHER (fallback by default, or a key of SPECS such as rtx5090), recompiles every case under both specs to
// recover each kernel's analysis, and prints per kernel: the schedule each spec chose, what that spec's model predicted
// for it (tile.js estimate), and the runner's median.
//
//   node gb10-spec-check.mjs --kiln /path/to/kiln GB10.json OTHER.json [--other fallback|rtx5090|…] [--json out.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
const KILN = resolve(opt("kiln") ?? ".");
const jsonOut = opt("json");
const otherId = opt("other") ?? "fallback";
const [gbFile, fbFile] = argv;
const imp = (p) => import(pathToFileURL(join(KILN, p)).href);
const { compileScript } = await imp("apps/workbench/src/compile.js");
const { params: paramSet } = await imp("packages/kiln/src/core/kiln.js");
const { SPECS, target: mkTarget } = await imp("packages/kiln/src/std/targets.js");
const { analyze, estimate } = await imp("packages/kiln/src/std/tile.js");

const gb = JSON.parse(readFileSync(gbFile, "utf8")), fb = JSON.parse(readFileSync(fbFile, "utf8"));
const dev = gb.device;
// "fallback" is what cudaTarget gave a GB10 before the gb10 spec existed (see cuda-runner-smoke.mjs)
const otherSpec = otherId === "fallback" ? { ...SPECS.rtx5090, id: "fallback", sms: dev.sms, smemPerBlock: dev.smemPerBlock } : SPECS[otherId];
if (!otherSpec) throw new Error(`unknown spec ${otherId}`);
const specs = { gb10: mkTarget(SPECS.gb10), fallback: mkTarget(otherSpec) };
const PRESETS = join(KILN, "apps/workbench/presets");
const preset = (id) => readFileSync(join(PRESETS, readdirSync(PRESETS).find((n) => n.startsWith(id + "-") && n.endsWith(".js"))), "utf8");
const key = (r) => `${r.preset} ${JSON.stringify(r.pins)}`;
const measured = (rows, c, i) => rows.filter((r) => key(r) === c)[i];

const cases = [...new Set(gb.rows.map(key))];
const out = [];
for (const c of cases) {
  const r0 = gb.rows.find((r) => key(r) === c);
  const kernels = Object.fromEntries(Object.entries(specs).map(([id, t]) => {
    const comp = compileScript(preset(r0.preset), { params: paramSet([]), target: t, pins: r0.pins });
    if (!comp.ok) throw new Error(`${c} under ${id}: ${JSON.stringify(comp.diags)}`);
    return [id, comp.prog.kernels];
  }));
  kernels.gb10.forEach((kg, i) => {
    const kf = kernels.fallback[i];
    const an = analyze(kg.expr, kg.shape, kg.inShapes);
    const mg = measured(gb.rows, c, i), mf = measured(fb.rows, c, i);
    if (mg.row !== kg.row || mf.row !== kf.row) throw new Error(`${c} kernel ${i}: the results were compiled differently (${mg.row} / ${kg.row}, ${mf.row} / ${kf.row})`);
    out.push({
      preset: r0.preset, pins: r0.pins, kernel: kg.name,
      gb10: { row: kg.row, modelUs: estimate(an, kg.map, specs.gb10).us, measuredUs: mg.usMedian, fallbackModelUs: estimate(an, kg.map, specs.fallback).us },
      fallback: { row: kf.row, modelUs: estimate(an, kf.map, specs.fallback).us, measuredUs: mf.usMedian, gb10ModelUs: estimate(an, kf.map, specs.gb10).us },
    });
  });
}

const f = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
console.log(`| case | kernel | gb10 schedule | gb10 model | measured | ${otherId} schedule | ${otherId} model | measured |`);
console.log("| --- | --- | --- | ---: | ---: | --- | ---: | ---: |");
for (const r of out) {
  const same = r.gb10.row === r.fallback.row;
  console.log(`| ${r.preset} ${Object.values(r.pins).join(" ")} | ${r.kernel} | ${r.gb10.row} | ${f(r.gb10.modelUs)} | ${f(r.gb10.measuredUs)} | ${same ? "same" : r.fallback.row} | ${f(r.fallback.modelUs)} | ${f(r.fallback.measuredUs)} |`);
}
const ratio = (rs, s) => rs.map((r) => r[s].measuredUs / r[s].modelUs);
const geo = (xs) => Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
for (const s of ["gb10", "fallback"]) {
  const xs = ratio(out, s);
  console.log(`${s === "gb10" ? s : otherId}: measured / modelled, geometric mean ${geo(xs).toFixed(2)}, range ${Math.min(...xs).toFixed(2)}–${Math.max(...xs).toFixed(2)}`);
}
const differ = out.filter((r) => r.gb10.row !== r.fallback.row);
console.log(`${differ.length} of ${out.length} kernels get different schedules; measured total of those: gb10 ${f(differ.reduce((a, r) => a + r.gb10.measuredUs, 0))} us, ${otherId} ${f(differ.reduce((a, r) => a + r.fallback.measuredUs, 0))} us`);
for (const r of differ) {
  // would each model have ranked the two schedules the way the GPU did?
  const gpu = Math.sign(r.fallback.measuredUs - r.gb10.measuredUs);
  const byGb10 = Math.sign(r.gb10.fallbackModelUs >= 0 ? r.fallback.gb10ModelUs - r.gb10.modelUs : 0);
  const byFallback = Math.sign(r.fallback.modelUs - r.gb10.fallbackModelUs);
  console.log(`  ${r.preset} ${Object.values(r.pins).join(" ")} ${r.kernel}: faster on the GPU: ${gpu > 0 ? "gb10's" : otherId + "'s"}; gb10 model ranks ${byGb10 === gpu ? "the same" : "the other way"}, ${otherId} model ranks ${byFallback === gpu ? "the same" : "the other way"}`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ host: gb.host, device: dev, other: otherId, specs, rows: out }, null, 1) + "\n");
