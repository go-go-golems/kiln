// Cell text for lab boards (guide §33), ported from Perf Lab's lib/format.ts: one rule for every cell, and a missing
// value is "—" with its reason, never zero. A Value carries its own unit; a plain number takes its field's unit.
import { isValue, fmtBytes, fmtNumber } from "./api.js";

const BYTE_UNITS = new Set(["B", "bytes"]);

export function formatScalar(v, unit) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (unit && BYTE_UNITS.has(unit)) return fmtBytes(v);
    const n = fmtNumber(v, Math.abs(v) < 10 ? 3 : 4);
    return unit ? `${n} ${unit}` : n;
  }
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (Array.isArray(v)) return `[${v.slice(0, 8).map((x) => formatScalar(x)).join(", ")}${v.length > 8 ? ", …" : ""}]`;
  if (typeof v === "object") return typeof v.ref === "string" ? String(v.id ?? v.ref) : JSON.stringify(v);
  return String(v);
}

/** → { text, prov, missing, reason, title }; `prov` is null for a plain cell, which shows no mark. */
export function formatValue(x, fieldUnit) {
  if (isValue(x)) {
    const unit = x.unit ?? fieldUnit, missing = x.value === null;
    const title = [missing ? `missing: ${x.reason ?? "no reason recorded"}` : x.prov, x.metric, x.method, x.scope && `scope: ${x.scope}`, x.denominator && `denominator: ${x.denominator}`, x.source && `source: ${x.source}`].filter(Boolean).join("\n");
    return { text: missing ? "—" : formatScalar(x.value, unit), prov: missing ? "unknown" : x.prov, missing, reason: x.reason, title };
  }
  const missing = x === null || x === undefined;
  return { text: formatScalar(x, fieldUnit), prov: null, missing, title: missing ? "missing" : "" };
}

/** "cpuTime.p50" → "cpu Time · p50", as Perf Lab labels columns. */
export const fieldLabel = (f) => String(f).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\./g, " · ");

// the ticket's pinned revisions, so a `rev:path#symbol` reference links to the file at that revision
const FULL_SHA = {
  d59d9ad0: "d59d9ad0154331795d083afcddae5cbadf2535a0",
  a6f14d94: "a6f14d94720cf052045b6d79467ecd37653eecaf",
  "3496baed": "3496baeda030c7f24fd88ce013ecf0d38e4a17cf",
  "488d9f41": "488d9f41e25af75461b7ba8e3b0da0c29765c355",
};

/** `rev:path#symbol` → its parts, and a pinned GitHub URL when the revision is one the ticket pinned. */
export function sourceLink(ref) {
  const [revPath, symbol] = String(ref).split("#");
  const i = revPath.indexOf(":"), rev = i >= 0 ? revPath.slice(0, i) : "", path = i >= 0 ? revPath.slice(i + 1) : revPath;
  const sha = FULL_SHA[rev];
  return { rev, path, symbol, url: sha ? `https://github.com/tulip/playback/blob/${sha}/${path}` : rev === "pytorch" ? `https://github.com/pytorch/pytorch/blob/main/${path}` : null };
}
