// Every preset's notes: they render, and every lab: link names a real parameter (with a legal value), knob,
// IR level, kernel, view, device or preset of that project.   node build.mjs --gen-only && node test/notes.mjs
import { wb } from "../src/ui/wb.js";
import { renderDoc } from "../src/ui/doc.js";
import { ALL_VIEWS as VIEWS } from "../src/ui/dock.js";
let bad = 0, total = 0;
for (const p of wb.presets) {
  await wb.load(p.id);
  if (!wb.notes.trim()) { console.log(`FAIL ${p.id}: no notes`); bad++; continue; }
  const { html, toc } = renderDoc(wb.notes);
  const links = [...html.matchAll(/href="(lab:[^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
  const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const errs = [];
  for (const a of anchors) if (!ids.has(a)) errs.push(`#${a}: no such heading`);
  const knobNames = new Set([...wb.params.params.keys(), ...(wb.run?.decisions || []).flatMap((d) => Object.keys(d.knobs || {}))]);
  for (const href of links) {
    total++;
    const m = href.match(/^lab:([\w-]+)\??(.*)$/), q = Object.fromEntries(new URLSearchParams(m[2]));
    const e = (msg) => errs.push(`${href}: ${msg}`);
    switch (m[1]) {
      case "param": { const P = wb.params.param(q.name); if (!P) { e("no such parameter"); break; } try { const v = P.parse(q.value); if (P.type === "int" && (v < P.opts.min || v > P.opts.max)) e(`out of range ${P.opts.min}..${P.opts.max}`); } catch (x) { e(x.message); } break; }
      case "pin": { for (const [k, v] of Object.entries(q)) if (k !== "measure" && !knobNames.has(k)) e(`no knob ${k}`); break; }
      case "unpin": { for (const n of (q.name || "").split(",").filter(Boolean)) if (!knobNames.has(n)) e(`no knob ${n}`); break; }
      case "ir": case "graph": if (q.name && !wb.run?.irOrder?.includes(q.name)) e(`no IR ${q.name} (${wb.run?.irOrder})`); break;
      case "kernel": if (!wb.prog?.kernels.some((k) => k.name === q.name)) e(`no kernel (${wb.prog?.kernels.map((k) => k.name)})`); break;
      case "view": case "tab": if (!VIEWS.includes(q.name)) e("no such view"); break;
      case "device": if (!wb.devices.some((d) => d.id === q.id)) e("no such device"); break;
      case "preset": if (!wb.presets.some((x) => x.id === q.id)) e("no such preset"); break;
      case "tune": if (q.strategy && !["spmcts", "sweep", "sweep-all"].includes(q.strategy)) e("no such strategy"); break;
      case "measure": case "compile": case "step": case "fork": case "node": case "line": break;
      default: e("unknown action");
    }
  }
  if (errs.length) { bad++; console.log(`FAIL ${p.id}: ${errs.join("; ")}`); }
  else console.log(`ok   ${p.id}: ${toc.length} sections, ${links.length} lab links`);
}
console.log(bad ? `${bad} FAILED` : `all notes pass (${total} lab links)`);
process.exitCode = bad ? 1 : 0;
