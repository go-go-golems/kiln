// Phase 7's done-condition in a browser (guide §31, §35): the agent's eval cannot call the server, any other host or
// the page's storage, a job it proposes waits for the user, a script it writes waits for the user's Run, a runaway
// eval does not freeze the page, and every model call is a token row. A fake model upstream (node:http, the Messages
// API's SSE wire format) answers the first call with an eval that tries every way out (each aimed at the fake's own
// /leak, so a request that got out is seen here), the second with text, and the third with an eval that never ends; the development server (serve-dev.ts) relays both through
// POST /api/agent/sample; headless Chrome runs the page it serves. No real model and no GPU.
// Not part of `pnpm test`: it needs Chrome and a built page.
//   node build.mjs && node test/agent-e2e.mjs [--shots DIR]    (DIR gets p7-*.png)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { withPage } from "../../../scripts/shoot.mjs";

const args = process.argv.slice(2);
const shotAt = args.indexOf("--shots");
const shots = shotAt >= 0 ? args[shotAt + 1] : null;
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const dist = here("../dist/");
if (!existsSync(join(dist, "kiln-workbench.html"))) { console.error(`no ${dist}kiln-workbench.html: build first (node build.mjs)`); process.exit(1); }

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = "sk-test-not-a-real-key-" + Math.random().toString(36).slice(2);

// ---- what the eval tries: every way out of the worker, then what it is allowed to do
const EVAL = (dev, net) => `const out = {}, away = (k) => "http://127.0.0.1:${net}/leak?" + k;
out.realm = [typeof document, typeof window, typeof parent, typeof localStorage].join(" ");
try { const r = await fetch("http://127.0.0.1:${dev}/api/jobs/job_x/approve", { method: "POST" }); out.approve = "sent " + r.status; } catch (e) { out.approve = e.name + ": " + e.message; }
try { await fetch(away("fetch")); out.fetch = "sent"; } catch (e) { out.fetch = e.name; }
try { new WebSocket(away("ws").replace("http", "ws")); out.webSocket = "constructed"; } catch (e) { out.webSocket = e.name; }
try { new EventSource(away("sse")); out.eventSource = "constructed"; } catch (e) { out.eventSource = e.name; }
try { importScripts(away("importScripts")); out.importScripts = "loaded"; } catch (e) { out.importScripts = e.name; }
try { new Worker(away("worker")); out.worker = "constructed"; } catch (e) { out.worker = e.name; }
try { location.href = away("navigate"); out.navigate = "navigated"; } catch (e) { out.navigate = e.name; }
await new Promise((r) => setTimeout(r, 300));
const job = await jobs.propose({ device: "host:dev-fake", reason: "agent: measure W-05 on the fake GPU" });
out.job = job.status;
const s = await editor.get();
const set = await editor.set(s.replace("RMSNorm, fused", "RMSNorm, fused (agent edit)"));
out.ran = set.ran; out.compiles = set.ok;
return out;`;
const leaks = [];

// ---- the fake model: call 1 asks for the eval, call 2 answers, call 3 asks for an eval that never returns
const port = 5290 + Math.floor(Math.random() * 400);
const seen = [];
const sse = (events) => events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`).join("");
const answer = (i) => {
  const start = ["message_start", { message: { id: `msg_${i}`, type: "message", role: "assistant", content: [], model: "fake-model", stop_reason: null, usage: { input_tokens: 1000 + i, output_tokens: 1, cache_read_input_tokens: 0 } } }];
  const text = (index, t) => [["content_block_start", { index, content_block: { type: "text", text: "" } }], ["content_block_delta", { index, delta: { type: "text_delta", text: t } }], ["content_block_stop", { index }]];
  if (i !== 2) {
    const json = JSON.stringify({ code: i === 1 ? EVAL(port, model.address().port) : "while (true) {}" });
    return sse([start, ...text(0, i === 1 ? "I will try to leave the sandbox, then propose a job and edit the script." : "I will loop."),
      ["content_block_start", { index: 1, content_block: { type: "tool_use", id: `toolu_e2e_${i}`, name: "eval", input: {} } }],
      ...[0, 1, 2].map((k) => ["content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: json.slice((k * json.length) / 3, ((k + 1) * json.length) / 3) } }]),
      ["content_block_stop", { index: 1 }], ["message_delta", { delta: { stop_reason: "tool_use", stop_sequence: null }, usage: { output_tokens: 300 } }], ["message_stop", {}]]);
  }
  return sse([start, ...text(0, "The frame could not reach the server, the page or its storage. The job waits for your approval in Jobs, and the edited script waits for Run in the Code view."),
    ["message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 40 } }], ["message_stop", {}]]);
};
const model = createServer((req, res) => {
  if (req.method === "GET") { leaks.push(req.url); res.writeHead(200, { "content-type": "text/plain" }); return res.end("leaked"); }
  let body = "";
  req.on("data", (d) => { body += d; });
  req.on("end", () => {
    seen.push({ key: req.headers["x-api-key"], body: JSON.parse(body) });
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.end(answer(seen.length));
  });
});
// a WebSocket handshake arrives as an upgrade, not a request
model.on("upgrade", (req, socket) => { leaks.push(req.url); socket.destroy(); });
await new Promise((r) => model.listen(0, "127.0.0.1", r));

// ---- the development server, its model the fake one
const data = mkdtempSync(join(tmpdir(), "kiln-agent-e2e-"));
const env = { ...process.env, KILN_DATA_DIR: data, KILN_PORT: String(port), KILN_DIST: dist, KILN_MODEL: "fake-model", KILN_MODEL_URL: `http://127.0.0.1:${model.address().port}/v1/messages`, ANTHROPIC_API_KEY: KEY };
const server = spawn(process.execPath, [here("../../server/test/support/serve-dev.ts")], { cwd: here("../../server/"), env, stdio: ["ignore", "pipe", "pipe"] });
let log = "";
server.stdout.on("data", (d) => { log += d; });
server.stderr.on("data", (d) => { log += d; });
for (const t0 = Date.now(); !/DEVELOPMENT server on/.test(log); await sleep(50)) {
  if (server.exitCode != null || Date.now() - t0 > 20000) { console.error(log); process.exit(1); }
}
const url = `http://127.0.0.1:${port}/`;
const api = async (path) => (await fetch(`${url}api${path}`)).json();
const show = (view) => `(() => { const wb = window.__kiln.wb; wb.showView(${JSON.stringify(view)}); if (!wb.narrow) { let t = null; const walk = (n) => { if (n.t === "tile" && n.views.includes(${JSON.stringify(view)})) t = n; (n.kids || []).forEach(walk); }; walk(wb.layout); if (t && wb.maxTile !== t.id) { wb.maxTile = null; wb.toggleMax(t.id); } } return true; })()`;

try {
  await withPage({ url, size: "1600x1000", timeout: 240000 }, async (p) => {
    await p.until(`(() => { const wb = window.__kiln?.wb; return wb?.ready && wb.platformReady && wb.sample && wb.devices.some((d) => d.id === "host:dev-fake" && d.status === "ready"); })()`, 60000);
    check(true, "the page reaches the model through the server's gateway (no host bridge)");
    await p.eval(`(async () => { const wb = window.__kiln.wb; await wb.load("W-05"); await wb.setDevice("host:dev-fake", { quiet: true }); return true; })()`);
    const before = await p.eval(`window.__kiln.wb.run.decisions.length`);
    await p.eval(`window.__kiln.agent.send("Try to leave the sandbox, then propose a measurement of W-05 on the fake GPU and rename the project.").then(() => true)`);
    await p.until(`!window.__kiln.agent.agent.busy`, 60000);
    const r = await p.eval(`(() => { const A = window.__kiln.agent, c = A.agent.conv, m = c.messages.at(-1), part = A.steps(m)[0]; return { conv: c.id, text: m.text, error: m.error ?? null, status: part?.status, result: part?.result ?? "", evals: A.steps(m).length, pending: window.__kiln.wb.pending, script: window.__kiln.wb.script.split("\\n")[0], runTitle: window.__kiln.wb.project.name, html: document.documentElement.outerHTML.includes(${JSON.stringify(KEY)}), decisions: window.__kiln.wb.run.decisions.length }; })()`);
    console.log(r.result.split("\n").map((l) => "     " + l).join("\n"));
    check(r.status === "ok" && r.evals === 1 && !r.error && /could not reach the server/.test(r.text), `one eval ran and the answer arrived (${r.status}, ${r.evals} eval)`);
    check(/realm: "?undefined undefined undefined undefined/.test(r.result), "eval code has no document, window, parent or localStorage (it runs in a worker)");
    check(/approve: "?TypeError: Failed to fetch/.test(r.result), "approving a job from the eval fails before a request is made");
    check(/fetch: TypeError/.test(r.result) && /navigate: TypeError/.test(r.result), "fetch to another host fails; assigning location.href fails (a worker has no document to navigate)");
    check(/job: proposed/.test(r.result), "jobs.propose returned a proposed job");
    check(/ran: false/.test(r.result) && /compiles: true/.test(r.result) && r.pending && /agent edit/.test(r.script), `editor.set is held: the editor shows it, the page has not run it (${r.script})`);
    check(r.decisions === before, "the page's compile is still the previous script's");
    check(!r.html, "the API key is nowhere in the page");

    // the job waits for the user
    await sleep(3000);
    const jobs = (await api("/jobs")).jobs;
    const agentJobs = jobs.filter((j) => j.proposedBy === "agent");
    check(agentJobs.length === 1 && agentJobs[0].status === "proposed", `the agent's job waits for approval (${agentJobs.map((j) => j.status)} after 3 s)`);
    check(!jobs.some((j) => j.id === "job_x"), "nothing was approved by the eval");
    check(!leaks.length, `no request from the eval reached the network: fetch, WebSocket, EventSource, importScripts, worker, navigation${leaks.length ? " (got " + leaks.join(" ") + ")" : ""}`);

    // a token row per model call, filed under the conversation
    const u = await api("/agent/usage");
    const t = u.totals.find((x) => x.model === "fake-model");
    check(seen.length === 2 && t?.calls === 2 && t.input_tokens === 1001 + 1002 && t.output_tokens === 340, `two model calls, two token rows (${t?.calls} calls, ${t?.input_tokens} in, ${t?.output_tokens} out, est ${t?.est_prompt_tokens})`);
    check(u.conversations[0]?.conversation === r.conv && u.conversations[0].calls === 2, "the rows are filed under the conversation");
    check(seen.every((s) => s.key === KEY), "the upstream got the key from the server");
    const second = JSON.stringify(seen[1]?.body.messages ?? []);
    check(/tool_result/.test(second) && /Failed to fetch/.test(second), "the second call carried the eval's result");

    // what the user sees: the answer with its step open, the held script, the waiting job; then dark, then a phone
    if (shots) {
      const expand = `(document.querySelectorAll("details.fold, details.tool").forEach((d) => { d.open = true; }), true)`;
      const view = async (v, name) => { await p.eval(show(v)); await sleep(300); if (v === "agent") await p.eval(expand); await sleep(400); await p.shot(join(shots, `p7-${name}.png`)); };
      await view("agent", "agent-light-1600");
      await view("code", "held-light-1600");
      await p.eval(`(window.__kiln.wb.select({ job: ${JSON.stringify(agentJobs[0]?.id)} }), true)`);
      await view("jobs", "jobs-light-1600");
      await p.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }, { name: "prefers-reduced-motion", value: "reduce" }] });
      await view("agent", "agent-dark-1600");
      await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await sleep(500);
      await view("agent", "agent-dark-390");
      await view("code", "held-dark-390");
    }
    // a runaway eval runs on its worker's thread: the page answers meanwhile, and Stop ends it with its frame
    await p.eval(`(window.__kiln.agent.send("Loop forever."), true)`);
    await p.until(`(() => { const A = window.__kiln.agent, m = A.agent.conv.messages.at(-1); return m.role === "assistant" && A.steps(m).some((x) => x.status === "run"); })()`, 30000);
    await sleep(1000);
    const alive = await Promise.race([p.eval(`document.querySelectorAll("iframe[sandbox]").length`), sleep(5000).then(() => "no answer in 5 s")]);
    check(alive === 1, `while an eval loops forever the page answers (${alive} sandbox frame)`);
    await p.eval(`(window.__kiln.agent.stop(), true)`);
    await p.until(`!window.__kiln.agent.agent.busy`, 10000);
    const stopped = await p.eval(`(() => { const A = window.__kiln.agent, x = A.steps(A.agent.conv.messages.at(-1))[0]; return { status: x?.status, result: x?.result ?? "", frames: document.querySelectorAll("iframe[sandbox]").length }; })()`);
    check(stopped.status === "err" && /stopped/.test(stopped.result) && stopped.frames === 0, `Stop ends it and removes its frame, which ends its worker (${stopped.status}, ${stopped.frames} frames)`);
    // the user runs the held script
    const ran = await p.eval(`(() => { const wb = window.__kiln.wb; const ok = wb.runScript(); return { ok, pending: wb.pending, title: wb.script.split("\\n")[0] }; })()`);
    check(ran.ok && !ran.pending, `Run in the Code view compiles the agent's script (${ran.title})`);
    const errs = p.errors.filter((e) => !/Content Security Policy|Failed to fetch|sandboxed/.test(e));
    check(!errs.length, `no page errors${errs.length ? ": " + errs.join(" | ") : ""}`);
  });
} finally {
  server.kill("SIGTERM");
  model.close();
  rmSync(data, { recursive: true, force: true });
}
console.log(fails ? `${fails} agent e2e checks FAIL` : "all agent e2e checks pass");
process.exit(fails ? 1 : 0);
