// What the agent's results look like, shared by the page and the sandbox frame (guide §31): compile summaries,
// YAML for eval results, and the wire encoding of values that cross the frame's bridge. Each side has its own copy
// of Kiln, so a Tensor crosses as data and is rebuilt; a Graph or Run cannot cross and is summarized.
import { k, knobs as KN, typeStr, Value, Run } from "@kiln/kiln/core/kiln.js";
import { clip, Tensor } from "@kiln/kiln/core/util.js";
import { canonRow } from "@kiln/kiln/std/tile.js";

export const errs = (diags) => diags.filter((d) => d.level === "error").map((d) => (d.line ? `line ${d.line}: ` : "") + d.message);
export const warns = (diags) => diags.filter((d) => d.level === "warn").map((d) => (d.line ? `line ${d.line}: ` : "") + d.message);
export function runSummary(run, prog) {
  if (!run) return null;
  return {
    ok: run.ok, ...(run.ok ? {} : { error: `${run.error.kind}: ${clip(run.error.message, 300)}` }),
    irs: run.irOrder.map((n) => `${n}(${run.at(n).size})`).join(" → "),
    rewrites: run.steps.filter((s) => s.kind === "rewrite").length, declined: run.steps.filter((s) => s.kind === "skip").length, forks: run.decisions.length, ms: Math.round(run.ms),
    ...(prog ? { kernels: prog.kernels.map((x) => `${x.name} [${x.row}]`) } : { outputs: run.graph.outputs.map((o) => `${o.name}: ${o.id} ${typeStr(run.graph.nodes.get(o.id)?.type)}`) }),
  };
}
/** One line for the end-to-end check, as the [context] block shows it. */
export const e2eLine = (e) => (!e ? null : e.error ? "error: " + clip(e.error, 200) : e.skipped ? "skipped (too large to evaluate)" : e.ok ? `pass (${e.level} IR vs frontend${e.custom.length ? ` + ${e.custom.length} custom` : ""})` : "FAIL: " + [...e.checks, ...e.custom].filter((c) => !c.ok).map((c) => `${c.name}: ${clip(c.message, 120)}`).join("; "));

export const rowOf = (knobs) => (knobs && "MAP" in knobs ? canonRow(knobs) : KN.canonical(knobs || {}) || "(original)");
export const r3 = (x) => (x == null || !isFinite(x) ? x : +x.toPrecision(3));

// ---------------------------------------------------------------- YAML for results
export function plain(v, depth = 6, seen = new WeakSet()) {
  if (v == null || typeof v === "number" || typeof v === "boolean" || typeof v === "string") return typeof v === "number" && !Number.isInteger(v) ? +v.toPrecision(6) : v;
  if (typeof v === "bigint") return String(v);
  if (typeof v === "function") return `[function ${v.name || ""}]`.replace(" ]", "]");
  if (typeof v !== "object") return String(v);
  if (seen.has(v)) return "[circular]";
  if (depth <= 0) return Array.isArray(v) ? `[${v.length} items]` : "{…}";
  seen.add(v);
  if (v instanceof k.Graph) return { graph: v.name, nodes: v.size, ops: v.summary(), outputs: v.outputs.map((o) => o.name + ": " + o.id) };
  if (v instanceof k.Tensor) return { tensor: v.shape.join("×") || "scalar", preview: Array.from(v.preview(8)).map((x) => +x.toPrecision(5)) };
  if (v instanceof Run) return runSummary(v, null);
  if (v instanceof Value) return { value: v.id, op: v.opName, type: typeStr(v.type) };
  if (v instanceof Map) return Object.fromEntries([...v.entries()].slice(0, 100).map(([a, x]) => [String(a), plain(x, depth - 1, seen)]));
  if (v instanceof Set) return [...v].slice(0, 100).map((x) => plain(x, depth - 1, seen));
  if (v instanceof Error) return { error: `${v.name}: ${v.message}` };
  if (ArrayBuffer.isView(v)) return v.length <= 16 ? Array.from(v, (x) => +Number(x).toPrecision(5)) : `[${v.constructor.name} ${v.length}: ${Array.from(v.slice(0, 6), (x) => +Number(x).toPrecision(4)).join(", ")}, …]`;
  if (Array.isArray(v)) { const a = v.slice(0, 200).map((x) => plain(x, depth - 1, seen)); if (v.length > 200) a.push(`… ${v.length - 200} more`); return a; }
  const o = {};
  for (const key of Object.keys(v).slice(0, 120)) o[key] = plain(v[key], depth - 1, seen);
  return o;
}
function scalar(v) {
  if (v == null) return "null";
  if (typeof v === "string") return /^[\w./@#:+-][\w ./@#:+,()%=×-]*$/.test(v) && !/^(true|false|null|yes|no|[\d.+-]+)$/i.test(v) && !/[:#]\s|\s$/.test(v) ? v : JSON.stringify(v);
  return String(v);
}
function toYAML(v, indent = 0) {
  const pad = " ".repeat(indent);
  if (v == null || typeof v !== "object") {
    if (typeof v === "string" && v.includes("\n")) return "|\n" + v.split("\n").map((l) => pad + "  " + l).join("\n");
    return scalar(v);
  }
  if (Array.isArray(v)) {
    if (!v.length) return "[]";
    if (v.every((x) => x === null || typeof x !== "object") && v.map(scalar).join(", ").length < 80 && !v.some((x) => typeof x === "string" && x.includes("\n"))) return `[${v.map(scalar).join(", ")}]`;
    return "\n" + v.map((x) => {
      if (x && typeof x === "object" && !Array.isArray(x) && Object.keys(x).length) { const body = toYAML(x, indent + 2).replace(/^\n/, ""); return pad + "- " + body.slice(indent + 2); }
      return pad + "- " + toYAML(x, indent + 2);
    }).join("\n");
  }
  const keys = Object.keys(v);
  if (!keys.length) return "{}";
  return "\n" + keys.map((key) => { const kk = /^[\w$.#@-]+$/.test(key) ? key : JSON.stringify(key); const val = toYAML(v[key], indent + 2); return `${pad}${kk}:${val.startsWith("\n") ? val : " " + val}`; }).join("\n");
}
export const yaml = (v) => toYAML(plain(v)).replace(/^\n/, "");

// ---------------------------------------------------------------- the bridge's wire format
// Structured clone carries numbers, strings, plain objects, arrays, Maps, Sets and typed arrays. A Tensor is tagged
// and rebuilt on the other side; any other object with a prototype (Graph, Run, Project …) becomes its summary.
const isPlainObject = (v) => { const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
export function toWire(v, depth = 12, seen = new WeakSet()) {
  if (v == null || typeof v !== "object") return typeof v === "function" ? plain(v) : typeof v === "bigint" ? String(v) : v;
  if (ArrayBuffer.isView(v)) return v;
  if (seen.has(v) || depth <= 0) return plain(v, 1);
  seen.add(v);
  if (v instanceof Tensor) return { $kiln: "Tensor", shape: v.shape, data: v.data };
  if (Array.isArray(v)) return v.map((x) => toWire(x, depth - 1, seen));
  if (v instanceof Map) return new Map([...v].map(([a, x]) => [a, toWire(x, depth - 1, seen)]));
  if (v instanceof Set) return new Set([...v].map((x) => toWire(x, depth - 1, seen)));
  if (isPlainObject(v)) return Object.fromEntries(Object.entries(v).map(([a, x]) => [a, toWire(x, depth - 1, seen)]));
  return plain(v);
}
export function fromWire(v) {
  if (v == null || typeof v !== "object" || ArrayBuffer.isView(v)) return v;
  if (v.$kiln === "Tensor") return new Tensor(v.shape, v.data);
  if (Array.isArray(v)) return v.map(fromWire);
  if (v instanceof Map) return new Map([...v].map(([a, x]) => [a, fromWire(x)]));
  if (v instanceof Set) return new Set([...v].map(fromWire));
  return Object.fromEntries(Object.entries(v).map(([a, x]) => [a, fromWire(x)]));
}
