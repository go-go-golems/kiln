// Browser checks for the built page: boot, every view, every preset, measure, tune, the agent loop with
// a fake `sample`, phone width and dark mode.   node test/ui.mjs [shots|presets|agent|notes|phone|all]
import { createRequire } from "node:module";
const { chromium } = await import("playwright").catch(() => createRequire((process.env.PLAYWRIGHT_DIR || "/opt/npm-tools/node_modules") + "/")("playwright"));
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const SHOTS = process.env.SHOTS || new URL("../shots/", import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const body = readFileSync(here("../dist/index.html"), "utf8");
const skeleton = (fake) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>${fake ? `<script>${fake}</script>` : ""}</head><body>${body}</body></html>`;

const FAKE = `
window.__fakeScript = [];
window.claude = { use: async (name) => {
  if (name === "downloads") return { save: async (o) => { window.__saved = o; } };
  if (name !== "sample") return null;
  const sample = async (input, opts = {}) => {
    window.__lastInput = input;
    const step = window.__fakeScript.shift() || { text: "Nothing scripted." };
    let text = "";
    for (const code of step.evals || []) {
      text += "Looking. ";
      opts.onText && opts.onText({ text, delta: "Looking. " });
      const r = await opts.tools[0].execute({ code }, { signal: opts.signal });
      (window.__toolResults ||= []).push(r);
    }
    text += step.text;
    opts.onText && opts.onText({ text, delta: step.text });
    return { text, truncated: false, modelTierApplied: opts.modelTier };
  };
  return sample;
} };`;

const mode = process.argv[2] || "all";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell", args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader", "--use-webgpu-adapter=swiftshader"] });
let failures = 0;
const check = (c, m) => { if (!c) { failures++; console.log("FAIL", m); } else console.log("ok  ", m); };
async function open({ w = 1440, h = 900, dark = false, fake = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: dark ? "dark" : "light", reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  writeFileSync(here("../dist/test.html"), skeleton(fake ? FAKE : ""));
  await page.goto(here("../dist/test.html").href);
  await page.waitForFunction(() => window.__kiln?.wb?.ready, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  return { page, ctx, errors };
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const tab = async (page, title) => { await page.click(`.dtab .lbl:text-is("${title}")`); await page.waitForTimeout(350); };

if (mode === "all" || mode === "shots") {
  const { page, ctx, errors } = await open();
  await shot(page, "00-start");
  await page.evaluate(() => window.__kiln.wb.load("W-05"));
  await page.waitForTimeout(400);
  await tab(page, "Code");
  await shot(page, "01-default");
  const st = await page.evaluate(() => { const w = window.__kiln.wb; return { ok: w.run?.ok, kernels: w.prog?.kernels.length, e2e: w.e2e, diags: w.diags }; });
  check(st.ok && st.kernels === 1, `W-05 compiles to one kernel (${JSON.stringify(st.diags)})`);
  for (const t of ["Graph", "Trace", "Kernels"]) { await tab(page, t); await shot(page, "02-" + t.toLowerCase()); }
  // select a node in the IR
  await tab(page, "IR");
  await page.click(".irchip:has-text('tensor')");
  await page.click(".irtext .nid >> nth=2");
  await page.waitForTimeout(300);
  await shot(page, "03-ir-node");
  // trace: open a step, then look at the graph after it
  await tab(page, "Trace");
  await page.click(".trow-h >> nth=3");
  await page.waitForTimeout(200);
  await shot(page, "04-trace-step");
  // measure on the simulated GPU
  await tab(page, "Perf");
  await page.click(".toolbar .btn.primary:has-text('Measure')");
  await page.waitForFunction(() => !window.__kiln.wb.measuring && window.__kiln.wb.measures[window.__kiln.wb.deviceId], null, { timeout: 60000 });
  await page.waitForTimeout(300);
  await shot(page, "05-perf");
  const m = await page.evaluate(() => { const w = window.__kiln.wb; const r = w.measures[w.deviceId]; return { total: r.total, ok: r.kernels.every((x) => x.check?.ok) }; });
  check(isFinite(m.total) && m.ok, `measured ${m.total.toFixed(1)} µs, checks pass`);
  for (const t of ["Knobs", "Devices", "Events"]) { await tab(page, t); await shot(page, "06-" + t.toLowerCase()); }
  // tune a little
  await tab(page, "Tune");
  await page.selectOption(".toolbar select", "8");
  await page.click(".toolbar .btn.primary");
  await page.waitForFunction(() => window.__kiln.wb.tuning && !window.__kiln.wb.tuning.running, null, { timeout: 120000 });
  await page.waitForTimeout(300);
  await shot(page, "07-tune");
  const t = await page.evaluate(() => { const w = window.__kiln.wb; return { n: w.tuning.history.length, best: w.tuning.best?.us, by: w.run.decisions.map((d) => d.by) }; });
  check(t.n >= 4 && t.by.includes("evidence"), `tuned ${t.n} programs, best ${t.best?.toFixed(1)} µs, compile now decides by ${t.by.join(",")}`);
  await tab(page, "Reference"); await shot(page, "08-reference");
  check(!errors.length, "no console errors (desktop): " + errors.slice(0, 5).join(" | "));
  await ctx.close();
  const d = await open({ dark: true });
  await tab(d.page, "Graph");
  await shot(d.page, "09-dark-graph");
  await tab(d.page, "Kernels");
  await shot(d.page, "10-dark-kernels");
  check(!d.errors.length, "no console errors (dark): " + d.errors.slice(0, 5).join(" | "));
  await d.ctx.close();
}

if (mode === "all" || mode === "presets") {
  const { page, ctx, errors } = await open();
  const ids = await page.evaluate(() => window.__kiln.wb.presets.map((p) => p.id));
  for (const id of ids) {
    const r = await page.evaluate(async (id) => {
      const w = window.__kiln.wb;
      await w.load(id);
      await new Promise((r) => setTimeout(r, 50));
      const out = { ok: !!w.run?.ok && !w.diags.some((d) => d.level === "error"), diags: w.diags.filter((d) => d.level === "error").map((d) => `${d.line || ""} ${d.message}`), kernels: w.prog?.kernels.length ?? 0, e2e: w.e2e ? (w.e2e.error ? "error " + w.e2e.error : w.e2e.skipped ? "skipped" : w.e2e.ok ? "pass" : "FAIL " + JSON.stringify([...w.e2e.checks, ...w.e2e.custom].filter((c) => !c.ok))) : "none" };
      if (w.prog) { const rec = await w.measure({ quiet: true }); out.us = rec?.total; out.checks = rec ? rec.kernels.filter((x) => x.error || x.check?.ok === false).map((x) => x.name + ": " + (x.error || x.check.message)) : ["no measure"]; }
      return out;
    }, id);
    check(r.ok && !r.e2e.startsWith("FAIL") && !r.e2e.startsWith("error") && !(r.checks || []).length, `${id}: ${r.kernels} kernels, e2e ${r.e2e}${r.us != null ? `, ${r.us.toFixed(1)} µs` : ""}${r.diags.length ? " · " + r.diags.join("; ") : ""}${r.checks?.length ? " · " + r.checks.join("; ") : ""}`);
    await shot(page, "p-" + id);
  }
  check(!errors.length, "no console errors (presets): " + errors.slice(0, 5).join(" | "));
  await ctx.close();
}

if (mode === "all" || mode === "agent") {
  const { page, ctx, errors } = await open();
  await page.evaluate(() => window.__kiln.wb.load("W-05"));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__fakeScript.push({
      evals: [
        "return wb.context()",
        "return { levels: ir.levels(), passes: trace.passes(), forks: await forks.list() }",
        "const f = await forks.get(0); return f.options.slice(0, 3)",
        "const m = await measure(); await chat.table(m.kernels, 'Kernels on the simulated GPU'); return m.total",
        "await chat.code(await kernels.source(null, 'cuda'), 'The CUDA'); return 'ok'",
        "return editor.edit('default: 1024', 'default: 512')",
        "return (await editor.check((await editor.get()).replace('rms_norm', 'nope'))).errors",
      ],
      text: "Done. See [the kernel](lab:kernel?name=k_rms_norm_reduce) and [the loop IR](lab:ir?name=loop).",
    });
  });
  await tab(page, "Agent");
  await page.fill(".composer textarea", "Look at this compile");
  await page.click(".composer .btn.primary");
  await page.waitForFunction(() => !document.querySelector(".msg.agent .thinking") && document.querySelectorAll("details.tool").length >= 7, null, { timeout: 60000 });
  await page.waitForTimeout(500);
  const res = await page.evaluate(() => window.__toolResults);
  res.forEach((r, i) => console.log(`   eval ${i}: ${r.slice(0, 160).replace(/\n/g, " ⏎ ")}`));
  check(res.slice(0, 6).every((r) => r.startsWith("ok")), "agent evals ran");
  check(/rows.*512|512/.test(await page.evaluate(() => window.__kiln.wb.script.match(/rows = [^\n]+/)[0])), "editor.edit changed the script");
  await page.evaluate(() => document.querySelectorAll("details.tool").forEach((d) => (d.open = true)));
  await shot(page, "11-agent");
  // undo the answer
  await page.click(".link.strong:has-text('undo this answer')");
  await page.waitForTimeout(400);
  check(await page.evaluate(() => /default: 1024/.test(window.__kiln.wb.script)), "undo restored the script");
  // lab link
  await page.click("a.lablink >> nth=0");
  await page.waitForTimeout(300);
  await shot(page, "12-after-link");
  check(!errors.length, "no console errors (agent): " + errors.slice(0, 5).join(" | "));
  await ctx.close();
}

if (mode === "all" || mode === "notes") {
  for (const dark of [false, true]) {
    const { page, ctx, errors } = await open({ dark });
    await page.evaluate(() => window.__kiln.wb.load("W-21"));
    await page.waitForTimeout(400);
    await tab(page, "Notes");
    const r = await page.evaluate(() => ({ math: document.querySelectorAll(".doc .katex math").length, tex: document.querySelectorAll(".doc code.tex").length, toc: document.querySelectorAll(".doc .toc a").length, tables: document.querySelectorAll(".doc table").length, callouts: document.querySelectorAll(".doc .callout").length, links: document.querySelectorAll(".doc a.lablink").length }));
    check(r.math > 10 && r.tex === 0 && r.toc >= 4 && r.tables >= 2 && r.callouts >= 1 && r.links >= 8, `W-21 notes render (${dark ? "dark" : "light"}): ${JSON.stringify(r)}`);
    await shot(page, `15-notes${dark ? "-dark" : ""}`);
    if (!dark) {
      // a lab: link sets a parameter
      await page.click('.doc a.lablink[href="lab:param?name=n&value=2048"]');
      await page.waitForTimeout(800);
      const n = await page.evaluate(() => window.__kiln.wb.params.get("n"));
      check(n === 2048, `a lab: link in the notes set n = ${n}`);
      // scroll to the maths and shoot again
      await page.evaluate(() => document.querySelector(".doc h3")?.scrollIntoView());
      await page.waitForTimeout(200);
      await shot(page, "16-notes-maths");
      // the edit mode
      await page.click('.notes .seg button:has-text("Edit")');
      await page.waitForTimeout(200);
      await page.fill(".notes-edit textarea", "# Hello\n\nInline $e^{i\\pi} + 1 = 0$ and [measure](lab:measure).\n");
      await page.click('.notes .seg button:has-text("Read")');
      await page.waitForTimeout(200);
      const ed = await page.evaluate(() => ({ math: document.querySelectorAll(".doc .katex").length, notes: window.__kiln.wb.notes.slice(0, 7) }));
      check(ed.math === 1 && ed.notes === "# Hello", `edited notes render: ${JSON.stringify(ed)}`);
      // W-14: the pass knob RECIP is in the Code view's parameters
      await page.evaluate(() => window.__kiln.wb.load("W-14"));
      await page.waitForTimeout(400);
      await tab(page, "Code");
      const knob = await page.evaluate(() => [...document.querySelectorAll(".params")].map((e) => e.textContent).join(" "));
      check(/RECIP/.test(knob), "W-14's RECIP knob appears in the Code view's parameters");
      await shot(page, "17-code-knobs");
    }
    check(!errors.length, `no console errors (notes ${dark ? "dark" : "light"}): ` + errors.slice(0, 5).join(" | "));
    await ctx.close();
  }
  const { page, ctx, errors } = await open({ w: 390, h: 844 });
  await page.evaluate(() => { window.__kiln.wb.load("W-23"); window.__kiln.wb.showView("notes"); });
  await page.waitForTimeout(600);
  await shot(page, "18-phone-notes");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!wide, "notes: no horizontal page scroll on a phone");
  check(!errors.length, "no console errors (phone notes): " + errors.slice(0, 5).join(" | "));
  await ctx.close();
}

if (mode === "all" || mode === "phone") {
  const { page, ctx, errors } = await open({ w: 390, h: 844 });
  await shot(page, "13-phone");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!wide, "no horizontal page scroll on a phone");
  await page.click(".ptabs button:has-text('Perf')").catch(() => {});
  await page.waitForTimeout(300);
  await shot(page, "14-phone-perf");
  check(!errors.length, "no console errors (phone): " + errors.slice(0, 5).join(" | "));
  await ctx.close();
}

if (mode === "webgpu-all") {
  // every preset's kernels through WGSL on the WebGPU adapter (SwiftShader in CI), at small sizes
  const { page, ctx, errors } = await open();
  const ids = await page.evaluate(() => window.__kiln.wb.presets.filter((p) => !/^W-0[1-4]|W-17/.test(p.id)).map((p) => p.id));
  for (const id of ids) {
    const r = await page.evaluate(async (id) => {
      const w = window.__kiln.wb;
      await w.load(id);
      if (w.deviceId !== "webgpu") await w.setDevice("webgpu");
      for (const p of w.project._params) if (p.type === "int" && p.opts.min != null) w.params.set(p, Math.max(p.opts.min, Math.min(p.def, 96)));
      w.compile();
      if (!w.prog) return { id, error: "no program: " + w.diags.map((d) => d.message).join("; ") };
      const d = w.device, out = [];
      for (const kn of w.prog.kernels) {
        try { const res = await d.runKernel(kn, { reps: 1, warmup: 0 }); out.push(`${kn.name} [${kn.row}] ${res.check.ok ? "ok" : "FAIL " + res.check.message}`); }
        catch (e) { out.push(`${kn.name} [${kn.row}] ERROR ${e.message}`); }
      }
      return { id, out };
    }, id);
    const bad = !r.out || r.out.some((x) => / (FAIL|ERROR) /.test(x));
    check(!bad, `${id} on WebGPU: ${r.error || r.out.join(" · ")}`);
  }
  check(!errors.length, "no console errors (webgpu): " + errors.slice(0, 5).join(" | "));
  await ctx.close();
}

if (mode === "webgpu") {
  const { page, ctx, errors } = await open();
  const r = await page.evaluate(async () => {
    const w = window.__kiln.wb;
    const d = w.devices.find((x) => x.kind === "webgpu");
    const ok = await d.probe();
    if (!ok) return { status: d.status };
    await w.setDevice("webgpu");
    const rec = await w.measure({ quiet: true });
    return { status: d.status, info: d.info, total: rec?.total, checks: rec?.kernels.map((x) => x.error || x.check?.message || "ok") };
  });
  console.log("webgpu:", JSON.stringify(r));
  await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : "all passed");
process.exitCode = failures ? 1 : 0;
