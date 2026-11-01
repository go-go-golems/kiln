#!/usr/bin/env node
// Compiles a project script and writes it as kiln-program/1, the format the launchers in runtime/ load: kernels in
// launch order, a buffer table, dispatch geometry, and each kernel's identity (KILN-002 guide §29.2).
//
//   node scripts/kiln-export.mjs (--preset W-12 | --script path.js) [options]
//     --param NAME=VALUE  set a parameter; repeatable (the script's defaults fill the rest). VALUE may be a
//                         comma-separated list: every combination is compiled and the output is a kiln-program-set/1,
//                         { format, programs: [kiln-program/1, ...] }, in the order the combinations are listed
//     --target ID         webgpu (default: WebGPU's guaranteed limits) or a CUDA spec: rtx5090 rtx4090 h100 a100 orin
//     --name NAME         program name (default: the project's)
//     --out PATH          write here (default: stdout)
//     --no-check          skip the end-to-end check of the compiled program against the frontend graph
//     --contraction MODE  allow (default) or separate add/subtract/multiply rounding in CUDA
//     --matmul-precision P  highest (default) or tf32: round FP32 matmul/linear/conv operands to TF32,
//                         matching a reference backend with PyTorch allow_tf32 enabled
//     --optimization-program PATH  apply a validated Kiln transformation program to the standard pipeline
//     --mutation OUT=IN    the source graph mutates input IN to output OUT's value: the program writes it in place
//
// Exits non-zero when the script does not compile, the check fails, or a kernel argument cannot be exported.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { params as paramSet } from "../packages/kiln/src/core/kiln.js";
import { SPECS, WEBGPU_DEFAULT, target as mkTarget } from "../packages/kiln/src/std/targets.js";
import { exportProgram } from "../packages/kiln/src/std/export.js";
import { predictedCost } from "../packages/kiln/src/std/tile.js";
import { compileScript, endToEnd } from "../apps/workbench/src/compile.js";
import { prepareOptimizationProgram, applyOptimizationProgram } from "../integrations/passnet/transformation_program.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PRESETS = join(ROOT, "apps/workbench/presets");

function usage(code) {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1).filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n");
  (code ? process.stderr : process.stdout).write(text + "\n");
  process.exit(code);
}

function parseArgs(argv) {
  const o = { params: {}, target: "webgpu", check: true, mutations: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], next = () => { if (i + 1 >= argv.length) usage(2); return argv[++i]; };
    if (a === "--help" || a === "-h") usage(0);
    else if (a === "--preset") o.preset = next();
    else if (a === "--script") o.script = next();
    else if (a === "--param") { const [k, ...v] = next().split("="); if (!v.length) usage(2); o.params[k] = v.join("="); }
    else if (a === "--target") o.target = next();
    else if (a === "--name") o.name = next();
    else if (a === "--out") o.out = next();
    else if (a === "--no-check") o.check = false;
    else if (a === "--contraction") { o.contraction = next(); if (!["allow", "separate"].includes(o.contraction)) usage(2); }
    else if (a === "--matmul-precision") { o.matmulPrecision = next(); if (!["highest", "tf32"].includes(o.matmulPrecision)) usage(2); }
    else if (a === "--optimization-program") o.optimizationProgram = next();
    else if (a === "--mutation") { const [out, input, ...rest] = next().split("="); if (!out || !input || rest.length) usage(2); o.mutations[out] = input; }
    else { process.stderr.write(`unknown argument ${a}\n`); usage(2); }
  }
  if (!!o.preset === !!o.script) usage(2);
  return o;
}

function scriptPath(o) {
  if (o.script) return resolve(o.script);
  const f = readdirSync(PRESETS).find((n) => n.startsWith(o.preset + "-") && n.endsWith(".js"));
  if (!f) throw new Error(`no preset ${o.preset} in ${relative(process.cwd(), PRESETS)}`);
  return join(PRESETS, f);
}

function compileWith(pins, prepared) {
  return compileScript(text, { params: paramSet([]), target, pins, contraction: o.contraction, matmulPrecision: o.matmulPrecision,
    transformPipeline: prepared ? (pipe, { project, target }) => {
      if (project._pipe) throw new TypeError("optimization programs require the standard pipeline");
      return applyOptimizationProgram(pipe, target, prepared);
    } : null });
}

function compileOne(pins) {
  let c = compileWith(pins, preparedProgram?.gate ? null : preparedProgram), decision = null;
  if (preparedProgram?.gate) {
    // cost-gated: keep the transformed program only if the model predicts it is cheaper
    const transformed = compileWith(pins, preparedProgram.inner);
    if (c.ok && transformed.ok) {
      const baseline_us = predictedCost(c.run.at("tile"), target), transformed_us = predictedCost(transformed.run.at("tile"), target);
      const chosen = transformed_us < baseline_us ? "transformed" : "baseline";
      decision = { gate: preparedProgram.gate, chosen, predicted_us: { baseline: baseline_us, transformed: transformed_us } };
      if (chosen === "transformed") c = transformed;
    } else if (c.ok !== transformed.ok) {
      // only one side compiled: the gate has nothing to compare, and records why
      if (transformed.ok) c = transformed;
      decision = { gate: preparedProgram.gate, chosen: c === transformed ? "transformed" : "baseline", reason: `${c === transformed ? "untransformed" : "transformed"} compilation failed` };
    }
  }
  const at = Object.entries(pins).map(([k, v]) => `${k}=${v}`).join(" ");
  for (const d of c.diags || []) process.stderr.write(`${at}: ${d.level}${d.line ? ` line ${d.line}` : ""}: ${d.message}\n`);
  if (!c.ok || !c.prog) { process.stderr.write(`${at}: compile failed\n`); process.exit(1); }
  // recorded in the artifact: a bypassed or skipped check must be visible wherever the artifact travels
  let internalCheck = "bypassed (--no-check)";
  if (o.check) {
    const { e2e } = endToEnd(c.run, c.graph, c.project);
    const status = e2e.error ? `error: ${e2e.error}` : e2e.skipped ? `skipped: ${e2e.skipped}` : e2e.ok ? `ok at ${e2e.level}` : "FAILED";
    process.stderr.write(`${at}: end-to-end check ${status}\n`);
    if (e2e.error || (!e2e.skipped && !e2e.ok)) process.exit(1);
    internalCheck = status;
  }
  const values = Object.fromEntries([...c.project._params].map((p) => [p.name, c.params.get(p)]));
  const program = exportProgram(c.run, c.prog, { name: o.name || c.project.name, params: values, target, source: { ...source, internal_check: internalCheck }, mutations: o.mutations });
  if (optimizationProgram) program.compiler_policy = optimizationProgram;
  if (decision) program.compiler_policy_decision = decision;
  process.stderr.write(`${at}: ${program.kernels.map((k) => `${k.name} ${k.row}`).join("; ")}\n`);
  return program;
}

const o = parseArgs(process.argv.slice(2));
const spec = o.target === "webgpu" ? WEBGPU_DEFAULT : SPECS[o.target];
if (!spec) { process.stderr.write(`unknown target ${o.target}; one of webgpu ${Object.keys(SPECS).join(" ")}\n`); process.exit(2); }
const target = mkTarget(spec);
const file = scriptPath(o), text = readFileSync(file, "utf8");
const optimizationText = o.optimizationProgram ? readFileSync(resolve(o.optimizationProgram), "utf8") : null;
const optimizationProgram = optimizationText ? JSON.parse(optimizationText) : null;
const preparedProgram = optimizationProgram ? prepareOptimizationProgram(optimizationProgram) : null;
const source = { path: relative(ROOT, file), sha256: createHash("sha256").update(text).digest("hex"),
  ...(o.contraction ? { contraction: o.contraction } : {}),
  ...(o.matmulPrecision ? { matmul_precision: o.matmulPrecision } : {}),
  ...(optimizationText ? { optimization_program_sha256: createHash("sha256").update(optimizationText).digest("hex") } : {}) };
// every combination of the listed values, first parameter slowest
const combos = Object.entries(o.params).reduce((acc, [k, v]) => acc.flatMap((c) => v.split(",").map((x) => ({ ...c, [k]: x }))), [{}]);
const programs = combos.map(compileOne);
const result = combos.length === 1 ? programs[0] : { format: "kiln-program-set/1", programs };
const json = JSON.stringify(result, null, 1) + "\n";
if (o.out) writeFileSync(o.out, json); else process.stdout.write(json);
process.stderr.write(`${programs.length} program${programs.length === 1 ? "" : "s"} → ${o.out || "stdout"}\n`);
