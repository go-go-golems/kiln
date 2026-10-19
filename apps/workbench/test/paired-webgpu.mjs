// Phase 6's done-condition (guide §35) on this machine's GPU, in headless Chrome: a paired WebGPU comparison of two
// RMSNorm schedules (W-05) reports a ratio with an interval, and W-05's hypothesis is judged from it.
// Exits 0 with a message when the page reports WebGPU unavailable. Not part of `pnpm test`: it needs a GPU.
//   node test/paired-webgpu.mjs [--shot DIR]     build first (pnpm test:paired does both)
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { withPage } from "../../../scripts/shoot.mjs";

const args = process.argv.slice(2);
const shotAt = args.indexOf("--shot");
const shots = shotAt >= 0 ? args[shotAt + 1] : null;
const page = new URL("../dist/kiln-workbench.html", import.meta.url);
if (!existsSync(page)) { console.error(`no ${page.pathname}: build first (pnpm build)`); process.exit(1); }

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
const t0 = performance.now();

const out = await withPage({ url: pathToFileURL(page.pathname).href, webgpu: true, timeout: 600000 }, async (p) => {
  await p.until("window.__kiln?.wb?.ready", 60000);
  const status = await p.eval(`(async () => { const wb = window.__kiln.wb; await wb.setDevice("webgpu", { quiet: true }); return wb.device.status; })()`);
  if (status !== "ready") return { status };
  const res = await p.eval(`(async () => {
    const { wb, std } = window.__kiln, d = wb.device;
    wb.load("W-05");
    const kern = wb.prog.kernels.find((k) => k.name === "k_rms_norm_reduce");
    const fork = wb.run.decisions.find((x) => x.rule === "schedule" && x.key === kern.identity);
    const thread = fork.options.filter((o) => (o.knobs.MAP ?? "thread") === "thread" && Number.isFinite(o.score)).sort((a, b) => a.score - b.score)[0];
    const rows = [std.tile.canonRow(thread.knobs), kern.row];
    const before = std.evidence.evaluateHypotheses(wb.project, { store: wb.store, prog: wb.prog, device: d.evidenceId, target: d.target })[0];
    const { pairId, sides } = await std.measurePaired({ pipeline: wb.pipe, graph: wb.graph, params: wb.params, device: d, store: wb.store, identity: kern.identity, rows });
    const { ev } = std.evidence.evidenceContext({ store: wb.store, prog: wb.prog, device: d.evidenceId, target: d.target });
    const r = ev.ratio("k_rms_norm_reduce", { a: "MAP=thread", b: "MAP=row" });
    const after = std.evidence.evaluateHypotheses(wb.project, { store: wb.store, prog: wb.prog, device: d.evidenceId, target: d.target })[0];
    wb.bump("store");
    return {
      device: d.evidenceId, pairId, rows,
      sides: sides.map((s) => ({ row: s.row, samples: s.record?.timing.samples, position: s.record?.protocol.position, pairId: s.record?.protocol.pairId, valid: s.record?.validity.ok, reasons: s.record?.validity.reasons, partial: s.record?.validity.partial })),
      ratio: { value: +r.ratio, lo: +r.lo, hi: +r.hi, n: r.n, paired: r.paired, method: r.ratio.method, prov: r.ratio.prov, a: r.a, b: r.b },
      before: before.verdict, after: after.verdict, reasons: after.reasons,
    };
  })()`);
  if (shots) {
    await p.eval(`window.__kiln.wb.showView("hypotheses")`);
    await new Promise((r) => setTimeout(r, 800));
    console.log(`shot ${await p.shot(`${shots}/p6-paired-webgpu-W-05-1600.png`)}`);
  }
  return { status, res, errors: p.errors };
});

if (out.status !== "ready") { console.log(`skip: WebGPU unavailable in headless Chrome (${out.status})`); process.exit(0); }
const { res } = out;
const fmt = (x) => (x >= 100 ? x.toFixed(0) : x.toFixed(1));
console.log(`device ${res.device} · pair ${res.pairId.slice(0, 8)}…`);
for (const s of res.sides) console.log(`  ${s.row.padEnd(34)} samples ${s.samples.map(fmt).join(" ")} µs · positions ${s.position.join("")}`);
console.log(`  ratio ${res.ratio.b} / ${res.ratio.a} = ${res.ratio.value.toFixed(4)} [${res.ratio.lo.toFixed(4)}, ${res.ratio.hi.toFixed(4)}] n=${res.ratio.n} · ${res.ratio.method} · ${res.ratio.prov}`);
check(res.sides.every((s) => s.pairId === res.pairId), "both records carry the pair id");
check(res.sides.every((s) => s.valid), `both records valid${res.sides.some((s) => !s.valid) ? `: ${res.sides.flatMap((s) => s.reasons).join("; ")}` : ""}`);
check(res.sides.every((s, i) => s.position.every((p, rep) => p !== res.sides[1 - i].position[rep])), "each repetition puts the two sides at different positions");
check(res.ratio.paired && Number.isFinite(res.ratio.lo) && res.ratio.lo <= res.ratio.value && res.ratio.value <= res.ratio.hi, "a paired ratio with an interval");
check(res.ratio.prov === "derived", "the ratio is derived from hardware samples");
check(res.before === "open" && ["supported", "refuted", "open"].includes(res.after), `W-05's hypothesis: ${res.before} before, ${res.after} after${res.reasons.length ? ` (${res.reasons.join("; ")})` : ""}`);
check(!out.errors?.length, `no page errors${out.errors?.length ? `: ${out.errors.join(" | ")}` : ""}`);
console.log(fails ? `${fails} FAILED` : `all paired webgpu checks pass in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exitCode = fails ? 1 : 0;
