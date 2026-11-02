#!/usr/bin/env node
// Trace every script listed in DIR/index.json with the Kiln frontend (no compilation), so each
// nn.expect binding checks Kiln's inferred type against the source graph's. Writes DIR/trace.json.
//   node 662-trace-type-check.mjs DIR
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runScript } from "../../../../../../packages/kiln/src/core/script.js";
import { params } from "../../../../../../packages/kiln/src/core/kiln.js";

const dir = process.argv[2];
const index = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
const records = {};
for (const [graph, file] of Object.entries(index)) {
  const res = runScript(readFileSync(join(dir, file), "utf8"));
  if (!res.ok) { records[graph] = { status: "script_error", error: res.diags.map((d) => d.message).join("; ") }; continue; }
  const ps = params([]);
  for (const p of res.project._params) ps.declare(p);
  try { res.project.graph((p) => ps.get(p)); records[graph] = { status: "ok" }; }
  catch (e) { records[graph] = { status: "type_error", error: String(e.message) }; }
}
writeFileSync(join(dir, "trace.json"), JSON.stringify(records, null, 1) + "\n");
const counts = {};
for (const r of Object.values(records)) counts[r.status] = (counts[r.status] || 0) + 1;
console.log(JSON.stringify(counts));
