// lab: links, used by agent answers and by project notes. A tutorial can drive the workbench:
//   lab:param?name=degree&value=64     set a parameter (a slider)          lab:pin?TPB=128&STAGE=all   pin knobs
//   lab:unpin?name=TPB  (or lab:unpin) unpin one knob (or all)             lab:measure  (lab:measure?all=sim)
//   lab:tune?strategy=sweep&budget=16  tune                                lab:compile
//   lab:device?id=sim:h100             switch device                       lab:preset?id=W-21
//   lab:view?name=perf                 bring a view forward                lab:ir?name=loop · lab:node?id=n12&ir=loop
//   lab:step?i=4 · lab:kernel?name=k_x · lab:fork?i=0 · lab:line?n=12
//   lab:hypothesis?id=row-beats-thread open the Hypotheses view at that hypothesis's card
import { wb } from "./wb.js";

export async function followLabLink(href) {
  const m = String(href).match(/^lab:([\w-]+)\??(.*)$/);
  if (!m) return;
  const q = Object.fromEntries(new URLSearchParams(m[2]));
  switch (m[1]) {
    case "node": wb.select({ node: q.id, ...(q.ir ? { ir: q.ir, step: null } : {}) }); wb.showView(q.view || "ir"); break;
    case "ir": wb.select({ ir: q.name, step: null }); wb.showView(q.view || "ir"); break;
    case "graph": wb.select({ ir: q.name || wb.sel.ir, step: null }); wb.showView("graph"); break;
    case "step": wb.select({ step: +q.i }); wb.showView("trace"); break;
    case "kernel": wb.select({ kernel: q.name }); wb.showView(q.view || "kernels"); break;
    case "fork": wb.select({ decision: +q.i }); wb.showView("knobs"); break;
    case "hypothesis": wb.select({ hypothesis: q.id }); wb.showView("hypotheses"); break;
    case "view": case "tab": wb.showView(q.name || "ir"); break;
    case "preset": wb.load(q.id); break;
    case "line": wb.showView("code"); wb.gotoLine = +q.n; wb.bump("gotoLine"); break;
    case "device": await wb.setDevice(q.id); if (q.measure != null) await wb.measure(); break;
    case "compile": wb.compile(); break;
    case "param": {
      const p = wb.params.param(q.name);
      if (!p) return wb.toast(`No parameter ${q.name}`, "bad");
      wb.setParam(p, q.value);
      wb.toast(`${q.name} = ${q.value}`);
      if (q.measure != null) await wb.measure({ quiet: true });
      break;
    }
    case "pin": {
      const { measure, ...pins } = q;
      if (Object.keys(pins).length) { wb.pin(pins); wb.toast("Pinned " + Object.entries(pins).map(([a, b]) => `${a}=${b}`).join(", ")); }
      if (measure != null) await wb.measure({ quiet: true });
      break;
    }
    case "unpin": {
      if (q.name) for (const n of q.name.split(",")) wb.params.unpin(n);
      else { for (const n of Object.keys(wb.params.pinned())) if (!wb.project?._params.some((p) => p.name === n)) wb.params.unpin(n); wb.kernelPins = {}; }
      wb.compile();
      wb.toast(q.name ? `Unpinned ${q.name}` : "Unpinned every knob");
      if (q.measure != null) await wb.measure({ quiet: true });
      break;
    }
    case "measure":
      if (q.all === "sim") { for (const d of wb.devices.filter((x) => x.kind === "sim")) await wb.measure({ device: d, quiet: true }); wb.toast("Measured on every simulated GPU"); wb.showView("perf"); }
      else { await wb.measure(); if (q.view !== "none") wb.showView(q.view || "perf"); }
      break;
    case "tune": wb.showView("tune"); await wb.tune({ strategy: q.strategy || "spmcts", budget: +(q.budget || 24) }); break;
  }
}
