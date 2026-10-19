#!/usr/bin/env node
// Runs every *.mjs in a test directory with Node, one at a time, and fails if any exits non-zero.
// Kiln's tests are plain scripts (they print and set process.exitCode), not a framework's suites.
//   node scripts/run-node-tests.mjs <dir> [--skip name.mjs]... [--verbose]
import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
if (!args.length || args.includes("--help")) {
  console.log("usage: run-node-tests.mjs <dir> [--skip name.mjs]... [--verbose]\n  runs each <dir>/*.mjs with node; output is shown for failures, or always with --verbose");
  process.exit(args.length ? 0 : 2);
}
const skip = new Set(), verbose = args.includes("--verbose");
let dir = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--skip") skip.add(args[++i]);
  else if (args[i] !== "--verbose") dir = args[i];
}
const root = resolve(dir);
const files = readdirSync(root).filter((f) => f.endsWith(".mjs") && !skip.has(f)).sort();
let failed = 0;
for (const f of files) {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [join(root, f)], { cwd: resolve(root, ".."), encoding: "utf8", maxBuffer: 64 << 20 });
  const ms = (performance.now() - t0).toFixed(0);
  const ok = r.status === 0 && !r.signal;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${f.padEnd(18)} ${ms.padStart(6)} ms${ok ? "" : `  (exit ${r.status ?? r.signal})`}`);
  if (!ok || verbose) process.stdout.write((r.stdout || "") + (r.stderr || ""));
}
if (skip.size) console.log(`skipped: ${[...skip].join(", ")}`);
console.log(failed ? `${failed} of ${files.length} FAILED` : `all ${files.length} passed`);
process.exitCode = failed ? 1 : 0;
