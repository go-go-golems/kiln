// Measurement records (kiln-measure/1, guide §21): what executed (content id, §22), where (device id, §23), how
// often (one sample per repetition, §25), and whether the record may decide anything (validity, activation, §27).
// Every producer — measure, tune, import — builds its record here, so the rules live in one place.
import { canonicalJSON, canonicalSource, contentId, recordId, sha256Hex } from "@kiln/evidence";
import { knobs as KN } from "../core/kiln.js";
import { printKernelBody } from "./kernel.js";
import { seedOf } from "./program.js";
import { canonRow } from "./tile.js";

/** Bumped whenever emit.js or kernel.js change the code they generate for the same kernel. */
export const CODEGEN_VERSION = "kiln-codegen/2"; // 2: WGSL tanh clamps its argument (NaN on Metal)
export const APP = "kiln-workbench/0.1";
/** The seed every measurement generates kernel inputs from (kernelInputs(kern, INPUT_SEED)). */
export const INPUT_SEED = 1;

const LANG = { sim: "sim", webgpu: "wgsl", cuda: "cuda" };
export const langOf = (deviceClass) => LANG[deviceClass] ?? null;

/** The text that executes in `lang`: CUDA or WGSL source, or the Kernel IR for the simulator. */
export function sourceOf(kern, lang) {
  if (lang === "cuda") return kern.cuda;
  if (lang === "wgsl") return kern.wgsl;
  if (lang === "sim") return printKernelBody(kern.K);
  throw new TypeError(`sourceOf: unknown language ${lang}`);
}

const SPEC_HASH = new WeakMap();
/** sha256 of a target spec: the simulator's "hardware". */
export function specHash(spec) {
  let h = SPEC_HASH.get(spec);
  if (!h) SPEC_HASH.set(spec, (h = sha256Hex(canonicalJSON(spec))));
  return h;
}

// per kernel object: lang|target → { contentId, sourceSha256 }
const IDS = new WeakMap();
/**
 * The content id of `kern` as it would execute on `device` (guide §22), with the sha256 of its canonical source (the
 * entry symbol replaced by `kernel`, so a kernel's name is not part of what executed). Memoised per kernel object; a
 * recompile makes new kernel objects.
 */
export function contentOf(kern, device) {
  const lang = langOf(device.kind);
  if (!lang) throw new TypeError(`contentOf: device ${device.id} has no language`);
  const target = lang === "sim" ? specHash(device.spec) : null;
  let memo = IDS.get(kern);
  if (!memo) IDS.set(kern, (memo = new Map()));
  const key = `${lang}|${target ?? ""}`;
  let hit = memo.get(key);
  if (!hit) {
    const sourceSha256 = sha256Hex(canonicalSource(sourceOf(kern, lang), symbolOf(kern)));
    const id = contentId({
      codegen: CODEGEN_VERSION, lang, sourceSha256, launch: launchOf(kern),
      inputs: kern.inShapes.map((shape, j) => ({ shape: [...shape], seed: seedOf(kern, INPUT_SEED, j) })),
      output: [...kern.shape], target,
    });
    memo.set(key, (hit = { contentId: id, sourceSha256, lang }));
  }
  return hit;
}

/** The kernel's entry symbol as the emitters print it (emit.js `cname`); content ids hash the source without it. */
export const symbolOf = (kern) => String(kern.K?.name || kern.name || "kernel").replace(/[^\w]/g, "_");

export const launchOf = (kern) => ({ grid: kern.K.grid, block: kern.K.block, smem: kern.K.smemBytes || 0 });

/** Knob values as a record stores them: strings and finite numbers (booleans become "true"/"false"). */
const flatKnobs = (m) => Object.fromEntries(Object.entries(m || {}).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => [k, typeof v === "number" && Number.isFinite(v) ? v : String(v)]));
const TIME_MODEL_KEYS = new Set(["us", "min", "gflops", "gbs"]);
const withoutTime = (m) => Object.fromEntries(Object.entries(m).filter(([k]) => !TIME_MODEL_KEYS.has(k)));
const finiteOnly = (m) => Object.fromEntries(Object.entries(m || {}).filter(([, v]) => typeof v === "number" && Number.isFinite(v)));

/**
 * What the compile asked this kernel to be, and whether the kernel that ran is that (guide §27). Requested is, in
 * order: a kernel pin, the knob pins that apply to this kernel's schedule fork, or the fork's decided row. A pin
 * the fork could not honour (it fell back to another option) makes the activation fail.
 */
export function activationOf(kern, { run = null, kernelPins = null } = {}) {
  const materialized = kern.row;
  const map = flatKnobs(kern.map);
  const pin = kernelPins?.[kern.identity];
  if (pin) {
    const want = KN.parse(pin);
    const off = Object.entries(want).filter(([k, v]) => String(map[k] ?? "") !== String(v));
    return { requested: pin, materialized, ok: !off.length, notes: off.length ? [`kernel pin ${pin} not honoured: ${off.map(([k]) => `${k}=${map[k] ?? "unset"}`).join(",")}`] : ["kernel pin"] };
  }
  const d = run?.decisions?.filter((x) => x.key === kern.identity && x.knobs).at(-1);
  if (!d) return { requested: null, materialized, ok: true, notes: ["no schedule fork decided this kernel"] };
  const names = new Set(d.options.flatMap((o) => Object.keys(o.knobs || {})));
  const pins = Object.entries(run.params?.pinned?.() || {}).filter(([k]) => names.has(k));
  if (pins.length) {
    const requested = pins.map(([k, v]) => `${k}=${v}`).join(",");
    const off = pins.filter(([k, v]) => String(map[k] ?? "") !== String(v));
    return { requested, materialized, ok: !off.length, notes: off.length ? [`pins ${requested} not honoured: ${off.map(([k]) => `${k}=${map[k] ?? "unset"}`).join(",")}`] : [`pins ${requested}`] };
  }
  const want = flatKnobs(d.knobs);
  const off = Object.entries(want).filter(([k, v]) => String(map[k] ?? "") !== String(v));
  const requested = canonRow(d.knobs);
  return { requested, materialized, ok: !off.length, notes: off.length ? [`decided ${requested} (by ${d.by}) but materialised ${materialized}`] : [`decided by ${d.by}`] };
}

const DEFAULT_KIND = { sim: () => "simulated", webgpu: (d) => (d.timestamps ? "gpu-timestamp" : "wall-clock"), cuda: () => "cuda-events" };
const PARTIAL = { "wall-clock": "wall clock: includes submit and readback overhead" };

/**
 * The context a record carries (kiln-measure/1 `context`): the preset, the project's name, its parameters at the values
 * this compile used, and the sha256 of the script. A parameter changes the kernel only through hashes (its identity and
 * content id); this is where a person reads it back. Values a record cannot hold (undefined, NaN) are left out.
 */
export function recordContext({ preset = null, project = null, params = null, script = null } = {}) {
  const ctx = {};
  if (preset) ctx.preset = String(preset);
  if (project?.name) ctx.project = String(project.name);
  const ok = (v) => typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v));
  const vals = Object.fromEntries((project?._params || []).map((p) => [p.name, params?.get(p)]).filter(([, v]) => ok(v)));
  if (Object.keys(vals).length) ctx.params = vals;
  if (typeof script === "string") ctx.script = sha256Hex(script);
  return ctx;
}

/**
 * One kiln-measure/1 record for `kern` measured on `device`. `result` is what the device returned:
 * `{ samples, kind, reps, raw?, launches?, warmup?, seed?, order?, position?, metrics?, check?, error?, repErrors?,
 * partial? }`, where `samples` holds one value per completed repetition. An error, a failed repetition, a failed
 * check, a failed activation or missing repetitions make the record invalid with the reason; `partial` adds
 * caveats (a coarse timer) that keep a valid record from deciding. Either way it is stored and shown. `context` (the
 * preset, project, parameter values and script hash the page compiled from) is copied in as it is.
 */
export function makeRecord({ device, kern, result = {}, by = "measure", activation = null, seed = INPUT_SEED, at = new Date().toISOString(), pairId = null, context = null }) {
  const cls = device.kind;
  const { contentId: cid, sourceSha256, lang } = contentOf(kern, device);
  const err = result.error ? String(result.error) : null;
  const samples = (result.samples ?? (Number.isFinite(result.us) ? [result.us] : [])).filter((x) => Number.isFinite(x) && x >= 0);
  const reps = Math.max(1, result.reps ?? samples.length ?? 1);
  const kind = result.kind ?? DEFAULT_KIND[cls](device);
  const act = activation ?? { requested: null, materialized: kern.row, ok: true, notes: [] };
  const c = result.check;
  const check = { ok: !err && c?.ok !== false && !!c, sampled: Number.isInteger(c?.n) ? c.n : 0 };
  if (Number.isFinite(c?.maxAbs)) check.maxAbsErr = c.maxAbs;
  if (c?.message || err) check.detail = err ? `not run: ${err}` : String(c.message);

  const reasons = [];
  if (err) reasons.push(`repetition error: ${err}`);
  else if (!c) reasons.push("output check: the device returned no check");
  else if (c.ok === false) reasons.push(`output check: ${c.message || "sampled outputs differ from the reference"}`);
  if (!act.ok) reasons.push(`activation: requested ${act.requested}, materialised ${act.materialized}`);
  if (!err && samples.length !== reps) reasons.push(`small n: ${samples.length} of ${reps} repetitions completed`);
  for (const e of result.repErrors || []) reasons.push(`repetition error: ${e}`);
  const partial = [...(PARTIAL[kind] ? [PARTIAL[kind]] : []), ...(result.partial || []).map(String)];

  const timing = { kind, unit: "us", samples };
  if (Number.isInteger(result.launches)) timing.launches = result.launches;
  if (Number.isInteger(result.warmup)) timing.warmup = result.warmup;
  if (Array.isArray(result.raw) && result.raw.length === samples.length) timing.raw = result.raw.map((r) => r.filter((x) => Number.isFinite(x) && x >= 0));

  const protocol = { reps, seed: Number.isFinite(result.seed) ? result.seed : seed };
  if (Array.isArray(result.order)) protocol.order = result.order;
  if (Array.isArray(result.position) && result.position.length === samples.length) protocol.position = result.position;
  if (pairId) protocol.pairId = pairId;

  const manifest = { codegen: CODEGEN_VERSION, app: APP };
  if (typeof navigator !== "undefined" && navigator.userAgent) manifest.userAgent = navigator.userAgent;
  if (device.runnerVersion) manifest.runner = String(device.runnerVersion);

  const rec = {
    format: "kiln-measure/1", at, by,
    device: { id: device.evidenceId, class: cls, name: device.name, fingerprint: { ...device.fingerprint } },
    kernel: { name: kern.name, identity: kern.identity, row: kern.row, knobs: flatKnobs(kern.map), contentId: cid, lang, sourceSha256, launch: launchOf(kern) },
    timing,
    check,
    activation: { requested: act.requested ?? null, materialized: act.materialized, ok: !!act.ok, notes: [...(act.notes || [])] },
    validity: { ok: !reasons.length, reasons, partial },
    protocol,
    manifest,
  };
  // a simulator's counts are derived from the simulated execution; its time and the rates computed from it come from
  // the timing model (heuristic, guide §24) and are already the record's samples, so they are not counts
  const counts = cls === "sim" ? withoutTime(finiteOnly(result.metrics)) : cls === "cuda" && result.ncu ? finiteOnly(result.ncu) : null;
  if (counts && Object.keys(counts).length) { rec.counts = counts; rec.countsProv = cls === "sim" ? "derived" : "observed"; }
  if (context) rec.context = context;
  rec.id = recordId(rec);
  return rec;
}

/**
 * A kiln-evidence/1 row (one best time per knob row, no repetitions, no content id) as a legacy record: visible,
 * never decisive (guide §23).
 */
export function legacyRecord(row, at = new Date(row.t || Date.now()).toISOString()) {
  const old = String(row.device);
  const cls = old.startsWith("sim:") ? "sim" : old.startsWith("cuda") ? "cuda" : "webgpu";
  const m = row.metrics || {};
  const int = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
  const reasons = row.ok === false ? ["output check failed when this legacy row was measured"] : [];
  const rec = {
    format: "kiln-measure/1", at, by: "import",
    device: { id: `legacy:${old.replace(/\s+/g, "-")}`, class: cls, name: old, fingerprint: { legacy: true } },
    kernel: { name: String(row.name || row.identity), identity: String(row.identity), row: String(row.row || KN.canonical(row.knobs)), knobs: flatKnobs(row.knobs), contentId: "", lang: LANG[cls], sourceSha256: "", launch: { grid: int(m.blocks), block: int(m.threads), smem: int(m.smem) } },
    timing: { kind: "legacy", unit: "us", samples: [row.us] },
    check: { ok: row.ok !== false, sampled: 0 },
    activation: { requested: null, materialized: String(row.row || KN.canonical(row.knobs)), ok: true, notes: ["legacy row: activation not recorded"] },
    validity: { ok: !reasons.length, reasons, partial: ["legacy row: one best value, no repetitions, no content id"] },
    protocol: { reps: 1, seed: INPUT_SEED },
    manifest: { codegen: "legacy", app: "kiln-evidence/1" },
  };
  rec.id = recordId(rec);
  return rec;
}
