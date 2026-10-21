// W-18 measured on the spark executor at two degrees: each record must name its parameters (record context).
import { withPage } from "/Volumes/SSD/code/kiln/scripts/shoot.mjs";

const out = new URL(".", import.meta.url).pathname;
await withPage({ url: "http://localhost:5280/", size: "1600x1000", timeout: 600000 }, async (page) => {
  await page.until("window.__kiln?.wb?.ready && window.__kiln.wb.devices.some((d) => d.server)");
  await page.eval("window.__kiln.wb.load('W-18')");
  await page.eval("window.__kiln.wb.setDevice('server:spark')");
  const ids = [];
  for (const degree of [8, 32]) {
    await page.eval(`window.__kiln.wb.setParam(window.__kiln.wb.params.param("degree"), ${degree})`);
    const job = await page.eval("window.__kiln.wb.proposeJob(window.__kiln.wb.device, { quiet: true }).then((j) => j.id)");
    await page.until(`(() => { const wb = window.__kiln.wb, j = wb.jobs.find((x) => x.id === ${JSON.stringify(job)}); return j?.status === "done" && j.records.length && j.records.every((id) => wb.store.records.has(id)); })()`, 300000);
    ids.push(job);
  }
  const res = await page.eval(`(() => { const wb = window.__kiln.wb; return ${JSON.stringify(ids)}.map((id) => { const j = wb.jobs.find((x) => x.id === id), r = wb.store.records.get(j.records[0]);
    return { job: id.slice(4, 12), jobParams: j.kernels[0].context?.params, record: { identity: r.kernel.identity, row: r.kernel.row, context: r.context, medianUs: [...r.timing.samples].sort((a, b) => a - b)[3] } }; }); })()`);
  console.log(JSON.stringify(res, null, 1));
  await page.eval(`window.__kiln.wb.select({ record: window.__kiln.wb.jobs.find((x) => x.id === ${JSON.stringify(ids[1])}).records[0] }); window.__kiln.wb.showView("evidence")`);
  await new Promise((r) => setTimeout(r, 1000));
  await page.shot(out + "04-evidence-context.png");
  console.log("errors", JSON.stringify(page.errors));
});
