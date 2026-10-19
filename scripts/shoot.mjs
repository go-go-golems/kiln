#!/usr/bin/env node
// Drives headless Chrome over the DevTools protocol: open a page, wait until it is ready, run steps in
// it, and take screenshots. Every run uses a throwaway profile, so the user's Chrome and its
// localStorage are never touched. Used for the diary's screenshots and for in-page measurement runs.
//
//   node scripts/shoot.mjs <url|file> <out.png> [options]
//     --size WxH        viewport (default 1600x1000); a width under 600 emulates a phone
//     --dark            prefers-color-scheme: dark
//     --until EXPR      ready condition, polled (default: window.__kiln?.wb?.ready)
//     --do JS           run after ready, awaited; repeatable, in order
//     --settle MS       wait after the last step before the shot (default 800)
//     --webgpu          enable WebGPU (hardware adapter) instead of disabling the GPU
//     --print EXPR      evaluate after the steps and print the JSON result to stdout
//     --timeout MS      overall limit (default 120000)
//
// As a module: `withPage(opts, async (page) => { await page.eval("…"); await page.shot(path); })`.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function devtoolsPort(profile, child, ms) {
  const f = join(profile, "DevToolsActivePort");
  for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(50)) {
    if (child.exitCode != null) throw new Error(`chrome exited with ${child.exitCode}`);
    if (existsSync(f)) { const [port] = readFileSync(f, "utf8").split("\n"); if (port) return Number(port); }
  }
  throw new Error("chrome did not open a DevTools port");
}

class Page {
  constructor(ws) {
    this.ws = ws; this.seq = 0; this.pending = new Map(); this.errors = [];
    ws.addEventListener("message", (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id != null) { const p = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? p?.reject(new Error(msg.error.message)) : p?.resolve(msg.result); }
      else if (msg.method === "Runtime.exceptionThrown") this.errors.push(msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text);
      else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") this.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
    });
    // Chrome gone (killed by the timeout, crashed): every call still waiting fails instead of never settling
    ws.addEventListener("close", () => {
      this.closed = true;
      for (const p of this.pending.values()) p.reject(new Error("the browser closed the DevTools connection"));
      this.pending.clear();
    });
  }
  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("the browser closed the DevTools connection"));
    const id = ++this.seq;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); });
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: `(async () => (${expr}))()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  }
  async until(expr, ms = 60000) {
    for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) { try { if (await this.eval(expr)) return; } catch {} }
    throw new Error(`timed out waiting for ${expr}`);
  }
  async shot(path) {
    const { data } = await this.send("Page.captureScreenshot", { format: "png" });
    mkdirSync(dirname(resolve(path)), { recursive: true });
    writeFileSync(path, Buffer.from(data, "base64"));
    return path;
  }
}

export async function withPage({ url, size = "1600x1000", dark = false, webgpu = false, timeout = 120000 }, fn) {
  const [w, h] = size.split("x").map(Number);
  const profile = mkdtempSync(join(tmpdir(), "kiln-shoot-"));
  const args = ["--headless=new", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, `--window-size=${w},${h}`, "--allow-file-access-from-files",
    ...(webgpu ? ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] : ["--disable-gpu"]), "about:blank"];
  const child = spawn(CHROME, args, { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = ""; child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-4000); });
  const timer = setTimeout(() => { child.kill("SIGKILL"); }, timeout);
  try {
    const port = await devtoolsPort(profile, child, 20000);
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
    await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("devtools websocket failed")); });
    const page = new Page(ws);
    await page.send("Runtime.enable"); await page.send("Page.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: dark ? "dark" : "light" }, { name: "prefers-reduced-motion", value: "reduce" }] });
    await page.send("Page.navigate", { url });
    const out = await fn(page);
    ws.close();
    return out;
  } catch (e) {
    if (stderr && process.env.SHOOT_DEBUG) console.error(stderr);
    throw e;
  } finally {
    clearTimeout(timer);
    child.kill("SIGTERM");
    await new Promise((r) => (child.exitCode != null ? r() : child.once("exit", r)));
    rmSync(profile, { recursive: true, force: true });
  }
}

async function cli(argv) {
  const pos = [], dos = [];
  const o = { size: "1600x1000", dark: false, webgpu: false, until: "window.__kiln?.wb?.ready", settle: 800, print: null, timeout: 120000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help") { console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).map((l) => l.slice(3)).join("\n")); return; }
    else if (a === "--dark") o.dark = true;
    else if (a === "--webgpu") o.webgpu = true;
    else if (a === "--do") dos.push(argv[++i]);
    else if (a === "--size" || a === "--until" || a === "--print") o[a.slice(2)] = argv[++i];
    else if (a === "--settle" || a === "--timeout") o[a.slice(2)] = Number(argv[++i]);
    else pos.push(a);
  }
  const [target, out] = pos;
  if (!target || !out) { console.error("usage: shoot.mjs <url|file> <out.png> [--size WxH] [--dark] [--until EXPR] [--do JS]... [--settle MS] [--webgpu] [--print EXPR]"); process.exit(2); }
  const url = /^[a-z]+:/.test(target) ? target : pathToFileURL(resolve(target)).href;
  await withPage({ url, size: o.size, dark: o.dark, webgpu: o.webgpu, timeout: o.timeout }, async (page) => {
    await page.until(o.until, o.timeout);
    for (const js of dos) await page.eval(js);
    await sleep(o.settle);
    if (o.print) console.log(JSON.stringify(await page.eval(o.print), null, 2));
    await page.shot(out);
    if (page.errors.length) console.error(`page errors:\n  ${page.errors.join("\n  ")}`);
    console.error(`wrote ${out}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await cli(process.argv.slice(2));
