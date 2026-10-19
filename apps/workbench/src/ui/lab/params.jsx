// A board's parameters (guide §33), ported from Perf Lab's ParamBar and lib/params.ts: every declared parameter
// that reaches the board, plan-bound ones first. A view- or data-bound change applies at once; a plan-bound one
// rebuilds the program, and applies only if every capture it needs is already imported — otherwise it is a pending
// plan, shown here with the captures it would need (this workbench does not run lab captures yet).
import React from "react";
import { labs } from "./state.js";
import { Btn, Seg, cls } from "../common.jsx";
import { isLive, isQuery, makeDollar, materialize, normalizeOptions, paramValue, runsMatching } from "./api.js";

/** Options for a control: literal and plan options come from the IR; data and view options are computed now. */
export function resolveOptions(reg, state, p) {
  if (p.options) return p.options;
  const raw = reg.params.get(p.key)?.slot.spec.c.options;
  try {
    if (isLive(raw)) return normalizeOptions(raw.fn(makeDollar(reg, state)));
    if (isQuery(raw)) {
      const v = materialize(reg, raw, state);
      return normalizeOptions(Array.isArray(v) ? [...new Set(v.map((x) => (typeof x === "object" && x && "name" in x ? String(x.name) : x)))] : []);
    }
  } catch { return []; }
  return null;
}

export const runChoices = (reg, p) => runsMatching(reg, p.constraints.runPattern ?? "*/*/*").map((ref) => {
  const run = reg.source.entity(ref);
  const valid = Boolean(run?.validity?.ok), complete = Boolean(run?.coverage?.complete);
  return { ref, valid, label: `${ref}${valid ? "" : " · invalid"}${complete ? "" : " · gaps"}` };
});

export function isVisible(reg, state, key) {
  const when = reg.params.get(key)?.slot.spec.m.when;
  if (when === undefined) return true;
  try {
    if (isLive(when)) return Boolean(when.fn(makeDollar(reg, state)));
    if (typeof when === "function") return Boolean(when({ param: (n) => paramValue(reg, n, state) }));
    return Boolean(when);
  } catch { return true; }
}

const fmt = (v) => (Array.isArray(v) ? v.join("..") : JSON.stringify(v));
const BINDING = { plan: "PLAN", data: "DATA", view: "VIEW" };

/** The parameter bar above a board's panels. */
export function ParamBar({ lab, board }) {
  const { reg, state, ir } = lab;
  const shown = board.paramKeys.map((k) => ir.params.find((p) => p.key === k)).filter((p) => p && isVisible(reg, state, p.key))
    .sort((a, b) => (a.binding === "plan" ? 0 : 1) - (b.binding === "plan" ? 0 : 1) || a.order - b.order);
  if (!shown.length) return null;
  const value = (p) => (p.key in lab.values ? lab.values[p.key] : p.defaultValue);
  return (
    <section className="lab-params" aria-label="Parameters">
      <div className="lab-params-row">
        {shown.map((p) => <ParamControl key={p.key} p={p} value={value(p)} options={resolveOptions(reg, state, p)} runs={p.control === "pickRun" ? runChoices(reg, p) : null} onChange={(v) => labs.setParam(p.key, v)} />)}
        <span className="note">VIEW re-renders · DATA recomputes · PLAN needs runs</span>
      </div>
      {lab.pending ? (
        <div className="lab-pending" role="status">
          <span className="stamp">pending plan</span>
          <span>{lab.pending.changes.map((c) => `${c.urlKey} ${fmt(c.from)} → ${fmt(c.to)}`).join(" · ")} needs {lab.pending.captures.length} capture{lab.pending.captures.length === 1 ? "" : "s"} that {lab.pending.captures.length === 1 ? "is" : "are"} not imported ({lab.pending.captures.map((c) => c.id ?? c.ref ?? c.key).filter(Boolean).slice(0, 4).join(", ")}{lab.pending.captures.length > 4 ? ", …" : ""}). The panels still show the applied values.</span>
          <Btn sm onClick={() => labs.revertPlan()}>Revert</Btn>
        </div>
      ) : null}
    </section>
  );
}

function ParamControl({ p, value, options, runs, onChange }) {
  const c = p.constraints ?? {};
  let control;
  if (p.control === "toggle" && options && options.length <= 6) {
    control = <Seg sm label={p.label} items={options.map((o) => [o.value, o.label, o.disabled ? "unavailable" : undefined])} value={value} onChange={onChange} />;
  } else if (p.control === "pickRun") {
    const list = runs ?? [];
    control = (
      <select value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
        {!list.some((r) => r.ref === value) ? <option value={String(value ?? "")} disabled>{String(value ?? "none")} (not imported)</option> : null}
        {list.map((r) => <option key={r.ref} value={r.ref}>{r.valid ? "" : "✕ "}{r.label}</option>)}
      </select>
    );
  } else if (p.control === "slider" || p.control === "number" || p.control === "seed") {
    control = <span className="lab-slider"><input type={p.control === "slider" ? "range" : "number"} min={c.min ?? (p.control === "seed" ? 0 : undefined)} max={c.max} step={c.step ?? (p.control === "slider" ? "any" : 1)} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} /><output className="mono">{String(value)}{p.unit ? ` ${p.unit}` : ""}</output></span>;
  } else if (p.control === "checkbox") {
    control = <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />;
  } else if (p.control === "text") {
    control = <input type="text" className="filter" value={String(value ?? "")} placeholder={c.placeholder} maxLength={c.maxLength} onChange={(e) => onChange(e.target.value)} />;
  } else {
    const opts = options ?? [];
    const unavailable = !opts.some((o) => o.value === value);
    control = (
      <select value={String(value)} onChange={(e) => onChange(opts.find((o) => String(o.value) === e.target.value)?.value ?? e.target.value)}>
        {unavailable ? <option value={String(value)} disabled>{String(value)} (unavailable)</option> : null}
        {opts.map((o) => <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>{o.label}</option>)}
      </select>
    );
  }
  const differs = JSON.stringify(value) !== JSON.stringify(p.defaultValue);
  return (
    <label className={cls("lab-param", differs && "changed")} title={p.help ?? undefined}>
      <span>{p.label}{p.unit && p.control !== "slider" ? ` (${p.unit})` : ""} <span className="stamp" title={`${p.binding}-bound: ${p.binding === "plan" ? "changes what is measured" : p.binding === "data" ? "recomputes derived rows" : "re-renders"}`}>{BINDING[p.binding] ?? p.binding}</span></span>
      {control}
    </label>
  );
}
