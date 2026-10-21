// Screenshot one dock view of the served workbench once every host has been probed, maximised and scrolled to the top.
//
//   node 06-shoot-view.mjs --url http://127.0.0.1:5380/ --view devices --out DIR/devices.png [--device host:bling]
import { withPage } from "/Volumes/SSD/code/kiln/scripts/shoot.mjs";

const args = process.argv.slice(2);
const opt = (name, d = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const url = opt("--url", "http://127.0.0.1:5380/");
const view = opt("--view", "devices");
const out = opt("--out");
const device = opt("--device");
if (!out) throw new Error("--out is required");

await withPage({ url, size: "1600x1000", timeout: 180000 }, async (p) => {
  await p.until(`(() => { const wb = window.__kiln?.wb; return wb?.ready && wb.serverInfo.state === "connected" && wb.hosts.length > 0 && wb.hosts.every((h) => h.offers); })()`, 120000);
  if (device) await p.eval(`window.__kiln.wb.setDevice(${JSON.stringify(device)}, { quiet: true }).then(() => true)`);
  await p.eval(`(async () => { const wb = window.__kiln.wb; wb.showView(${JSON.stringify(view)}); if (!wb.narrow) { let t = null; const walk = (n) => { if (n.t === "tile" && n.views.includes(${JSON.stringify(view)})) t = n; (n.kids || []).forEach(walk); }; walk(wb.layout); if (t && wb.maxTile !== t.id) { wb.maxTile = null; wb.toggleMax(t.id); } } await new Promise((r) => setTimeout(r, 800)); document.querySelectorAll(".scroll").forEach((s) => s.scrollTo(0, 0)); return true; })()`);
  await p.shot(out);
});
console.log(`shot ${out}`);
