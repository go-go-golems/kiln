// Lab programs end to end (guide §33, Phase 8's done-condition): Perf Lab's data directory imported into a fresh
// KILN_DATA_DIR (the importer reads a temporary copy of its SQLite store), the development server on that directory,
// and headless Chrome on the page it serves. dino-pr1005 opens with its measured runs from the server and the verdicts
// check:pl computes; its Lab view lists the plan and the runs, and a run chosen there opens in Inspect; every board of
// every lab program renders without a panel error; the dataset images load from /api/lab/media. Perf Lab's store
// must be byte- and timestamp-identical afterwards. (local-sampler names Kiln hosts now, so Perf Lab's runs of it on
// host 'local' no longer match its captures; its runs come from perf-lab-sampler/1 jobs.)
// Not part of `pnpm test`: it needs Chrome, a built page and Perf Lab's data (guide §36).
//   node build.mjs && node test/lab-e2e.mjs [--from PERF_LAB_DATA_DIR] [--shots DIR]   (DIR gets p8-*.png)
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "../../../scripts/shoot.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const from = resolve(opt("--from") ?? here("../../../lab-workbench/.data"));
const shots = opt("--shots");
const dist = here("../dist/");
if (!existsSync(join(dist, "kiln-workbench.html"))) { console.error(`no ${dist}kiln-workbench.html: build first (node build.mjs)`); process.exit(1); }
if (!existsSync(join(from, "perf-lab.sqlite"))) { console.error(`no Perf Lab store at ${from}/perf-lab.sqlite (--from DIR)`); process.exit(1); }

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// what check:pl reports for the measured program (packages/lab, `pnpm --filter @kiln/lab check:pl`); dino-local runs on
// host mac now, which has no runs here, so cpu-parts-preserve has nothing to judge
const EXPECTED = {
  "dino-pr1005": { "outputs-exact": "supported", "latency-halved": "refuted", "memory-within-20": "refuted", "prompt-reuse": "supported", "cpu-parts-preserve": "open", "fusion-active": "supported" },
};

const store = () => readdirSync(from).filter((f) => f.startsWith("perf-lab.sqlite")).sort()
  .map((f) => { const p = join(from, f); return `${f} ${createHash("sha256").update(readFileSync(p)).digest("hex")} ${statSync(p).mtimeMs}`; }).join("\n");
const before = store();

// ---- the import, into a directory of its own
const data = mkdtempSync(join(tmpdir(), "kiln-lab-e2e-"));
const env = { ...process.env, KILN_DATA_DIR: data };
const imp = spawnSync(process.execPath, [here("../../server/src/lab/import.ts"), from], { cwd: here("../../server/"), env, encoding: "utf8" });
console.log(imp.stdout.trim());
check(imp.status === 0, `lab:import exit ${imp.status}${imp.stderr ? `: ${imp.stderr.trim()}` : ""}`);

// ---- the development server on it
const port = 5290 + Math.floor(Math.random() * 400);
const server = spawn(process.execPath, [here("../../server/test/support/serve-dev.ts")], { cwd: here("../../server/"), env: { ...env, KILN_PORT: String(port), KILN_DIST: dist }, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", (d) => { log += d; });
server.stderr.on("data", (d) => { log += d; });
for (const t0 = Date.now(); !/DEVELOPMENT server on/.test(log); await sleep(50)) {
  if (server.exitCode != null || Date.now() - t0 > 20000) { console.error(log); process.exit(1); }
}
const url = `http://127.0.0.1:${port}/`;

const READY = `(() => { const wb = window.__kiln?.wb; return wb?.ready && wb.serverInfo.state === "connected"; })()`;
// select and maximise a view's tile (on a phone, the strip shows one view anyway), then scroll it to the top
const show = (view) => `(async () => { const wb = window.__kiln.wb; wb.showView(${JSON.stringify(view)}); if (!wb.narrow) { let t = null; const walk = (n) => { if (n.t === "tile" && n.views.includes(${JSON.stringify(view)})) t = n; (n.kids || []).forEach(walk); }; walk(wb.layout); if (t && wb.maxTile !== t.id) { wb.maxTile = null; wb.toggleMax(t.id); } } await new Promise((r) => setTimeout(r, 400)); document.querySelectorAll(".scroll").forEach((s) => s.scrollTo(0, 0)); return true; })()`;
const open = (id) => `window.__kiln.labs.open(${JSON.stringify(id)}).then(() => { const c = window.__kiln.labs.current; return { id: c.id, error: c.error, boards: c.ir?.boards.map((b) => b.id) ?? [], serverState: window.__kiln.labs.serverState, captures: c.ir?.plan.captures.length ?? 0, measured: c.ir?.plan.captures.filter((x) => window.__kiln.labs.catalog[x.hash]?.origin === "measured").length ?? 0, loaded: c.ir?.plan.captures.filter((x) => window.__kiln.labs.client?.bundlesLoaded(x.hash)).length ?? 0 }; })`;
// every board on screen: its tile's title, panel count, panel errors, and the title block's data line
const BOARDS = `[...document.querySelectorAll("section.tile")].filter((t) => t.querySelector(".lab-board")).map((t) => ({ tile: t.getAttribute("aria-label"), panels: t.querySelectorAll(".lpanel").length, errors: [...t.querySelectorAll(".lab-err")].map((e) => (e.closest(".lpanel")?.querySelector(".lp-kind")?.textContent ?? "board") + ": " + e.textContent), data: [...t.querySelectorAll(".titleblock div")].find((d) => d.querySelector("label")?.textContent === "data")?.querySelector("b")?.textContent, bignums: [...t.querySelectorAll(".bignum")].map((b) => b.textContent) }))`;
const PLAN = `[...document.querySelectorAll('section[aria-label="Plan"] tbody tr.clickable')].map((r) => r.querySelector(".stamp")?.textContent)`;
const RUNS = `[...document.querySelectorAll('section[aria-label="Runs"] .lab-runs button')].length`;
const INSPECT = `(() => { const t = [...document.querySelectorAll("section.tile")].find((x) => x.querySelector(".insp")); return t ? { ref: t.querySelector(".insp .sub")?.textContent, kv: t.querySelectorAll(".insp .kv dt").length, stamps: [...t.querySelectorAll(".insp .lab-stamps .stamp")].map((s) => s.textContent) } : null; })()`;
const VERDICTS = `[...document.querySelectorAll('section[aria-label="Hypotheses"] tbody tr')].map((r) => ({ id: r.querySelector(".mono")?.textContent, verdict: r.querySelector(".stamp")?.textContent }))`;
const IMAGES = `(() => { const imgs = [...document.querySelectorAll(".lab-board img")]; return { n: imgs.length, done: imgs.every((i) => i.complete), ok: imgs.filter((i) => i.complete && i.naturalWidth > 0).length, srcs: [...new Set(imgs.map((i) => i.getAttribute("src").replace(/[0-9a-f]{64}$/, "<sha>")))] }; })()`;
// board views in the dock that are not boards of the open program
const STALE = `(() => { const ids = new Set(window.__kiln.labs.current.ir.boards.map((b) => "board:" + b.id)), out = []; const walk = (n) => { if (n.t === "tile") out.push(...n.views.filter((v) => v.startsWith("board:") && !ids.has(v))); (n.kids || []).forEach(walk); }; walk(window.__kiln.wb.layout); return out; })()`;
// scroll the open board so the first panel of `kind` is at the top
const scrollTo = (kind) => `(() => { const el = document.querySelector('.lab-board section.lpanel[aria-label^="${kind}"]'); el?.scrollIntoView({ block: "start" }); return !!el; })()`;
const verdictWord = (s) => (s ?? "").replace(/[✓✕]/g, "").trim().split(" ")[0];
const shot = async (p, name) => { if (shots) await p.shot(join(shots, `${name}.png`)); };

try {
  await withPage({ url, size: "1600x1000", timeout: 600000 }, async (p) => {
    await p.until(READY, 60000);

    // ---- the two measured programs: data from the server, verdicts as check:pl computes them
    for (const id of Object.keys(EXPECTED)) {
      const o = await p.eval(open(id));
      check(!o.error && o.boards.length > 0, `${id}: built, ${o.boards.length} boards${o.error ? ` — ${o.error}` : ""}`);
      check(o.serverState === "online" && o.measured > 0 && o.loaded === o.measured, `${id}: ${o.measured} of ${o.captures} captures measured on the server, ${o.loaded} loaded (server ${o.serverState})`);
      await p.eval(show("lab"));
      const v = await p.eval(VERDICTS);
      const got = Object.fromEntries(v.map((r) => [r.id, verdictWord(r.verdict)]));
      for (const [h, want] of Object.entries(EXPECTED[id])) check(got[h] === want, `${id}: ${h} ${got[h] ?? "absent"} (check:pl: ${want})`);
      await shot(p, `p8-lab-${id}-light-1600`);
      const plan = await p.eval(PLAN), nRuns = await p.eval(RUNS);
      check(plan.length === o.captures && plan.filter((x) => x === "cached").length >= o.measured, `${id}: Plan lists ${plan.length} of ${o.captures} captures, ${plan.filter((x) => x === "cached").length} cached`);
      check(nRuns > 0, `${id}: Runs lists ${nRuns} runs`);
      await p.eval(`(() => { document.querySelector('section[aria-label="Runs"] .lab-runs button')?.click(); return true; })()`);
      await sleep(400);
      const ins = await p.eval(INSPECT);
      check(ins && /#\d+$/.test(ins.ref ?? "") && ins.kv > 5 && ins.stamps.length > 0, `${id}: the first run opens in Inspect (${ins ? `${ins.ref}, ${ins.kv} manifest rows, ${ins.stamps.join(" ")}` : "no Inspect view"})`);
      await shot(p, `p8-inspect-${id}-light-1600`);
      await p.eval(show("lab"));
      // only the active view of a tile renders, so each board is read while it is on screen
      const boards = [];
      for (const b of o.boards) {
        await p.eval(show(`board:${b}`));
        if (id === "dino-pr1005") await p.until(`(() => [...document.querySelectorAll(".lab-board img")].every((i) => i.complete))()`, 30000).catch(() => {});
        await shot(p, `p8-board-${id}-${b}-light-1600`);
        boards.push(...(await p.eval(BOARDS)));
      }
      // a partial collection would pass every per-board assertion below, so the count is asserted first
      const read = new Set(boards.map((b) => b.tile)).size;
      check(read === o.boards.length, `${id}: read ${read} of ${o.boards.length} boards`);
      for (const b of boards) check(!b.errors.length && b.panels > 0 && /measured/.test(b.data ?? ""), `${b.tile}: ${b.panels} panels, data "${b.data}"${b.errors.length ? ` — ${b.errors.join("; ")}` : ""}`);
      if (id === "dino-pr1005") {
        const im = await p.eval(IMAGES);
        check(im.n > 0 && im.ok === im.n, `dino-pr1005: ${im.ok} of ${im.n} dataset images loaded from ${im.srcs.join(", ")}`);
      }
      await p.eval(`(() => { const wb = window.__kiln.wb; wb.maxTile = null; return true; })()`);
    }

    // ---- every board of every program renders without a panel error
    const programs = await p.eval(`window.__kiln.labs.programs.map((x) => x.id)`);
    const errors = [];
    let boardsSeen = 0;
    for (const id of programs) {
      const o = await p.eval(open(id));
      if (o.error) { errors.push(`${id}: ${o.error}`); continue; }
      const stale = await p.eval(STALE);
      if (stale.length) errors.push(`${id}: board views of another program still open: ${stale.join(", ")}`);
      for (const b of o.boards) {
        await p.eval(show(`board:${b}`));
        const seen = await p.eval(BOARDS);
        boardsSeen++;
        for (const s of seen) errors.push(...s.errors.map((e) => `${id} / ${s.tile}: ${e}`));
        if (["compare", "request-to-kernel", "scenario-a", "scenario-b", "learn"].includes(id)) await shot(p, `p8-board-${id}-${b}-light-1600`);
        if (id === "compare") for (const kind of ["mirror", "chart", "table"]) if (await p.eval(scrollTo(kind))) await shot(p, `p8-board-${id}-${b}-${kind}-light-1600`);
      }
    }
    const uniq = [...new Set(errors)];
    check(!uniq.length, `${programs.length} programs, ${boardsSeen} boards shown${uniq.length ? `; panel errors:\n       ${uniq.join("\n       ")}` : ", no panel errors"}`);
  });

  // ---- the boards the user compares with Perf Lab, dark and on a phone
  if (shots) {
    for (const [size, dark, tag] of [["1600x1000", true, "dark-1600"], ["390x844", false, "light-390"], ["390x844", true, "dark-390"]]) {
      await withPage({ url, size, dark, timeout: 300000 }, async (p) => {
        await p.until(READY, 60000);
        for (const [id, board] of [["compare", null], ["dino-pr1005", "detections"]]) {
          const o = await p.eval(open(id));
          const b = board && o.boards.includes(board) ? board : o.boards[0];
          await p.eval(show(`board:${b}`));
          await p.until(`(() => [...document.querySelectorAll(".lab-board img")].every((i) => i.complete))()`, 30000).catch(() => {});
          await shot(p, `p8-board-${id}-${b}-${tag}`);
          if (id === "compare" && await p.eval(scrollTo("mirror"))) await shot(p, `p8-board-${id}-${b}-mirror-${tag}`);
        }
      });
    }
  }
} catch (e) {
  check(false, `page: ${e.message}`);
} finally {
  server.kill();
  rmSync(data, { recursive: true, force: true });
}
check(store() === before, `Perf Lab's store unchanged (${from})`);
console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
