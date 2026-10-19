import React from "react";
import { createRoot } from "react-dom/client";
import katex from "katex";
import { App } from "./ui/App.jsx";
import { wb } from "./ui/wb.js";
import { k, P } from "@kiln/kiln/core/kiln.js";
import { std } from "@kiln/kiln/std/index.js";
import * as Agent from "./agent/agent.js";
import { gatewaySample } from "./agent/gateway.js";
import { sessionToken } from "./server-client.js";

// doc.js renders TeX through window.katex when it is present; in Node it is absent and TeX stays source
window.katex = katex;
window.__kiln = { wb, k, P, std, agent: Agent };

async function connectClaude() {
  // a host bridge's capabilities light up later, or resolve null when this view cannot run them
  let use = window.claude?.use;
  for (let i = 0; !use && i < 30; i++) { await new Promise((r) => setTimeout(r, 100)); use = window.claude?.use; }
  if (use) { try { wb.sample = await use("sample"); } catch { wb.sample = null; } }
  // without one, a page served by the Kiln server calls the model through its gateway, when it has one (guide §31)
  else if (wb.server) {
    try { if ((await (await fetch("/api/agent/usage")).json()).ready) wb.sample = gatewaySample({ token: sessionToken(), conversation: () => Agent.agent.conv?.id ?? null }); } catch {}
  }
  wb.platformReady = true;
  wb.bump("platform", "agent");
}

async function main() {
  const root = createRoot(document.getElementById("root"));
  root.render(<App />);
  connectClaude();
  try { await wb.start(); }
  catch (e) { console.error(e); wb.error = e.message || String(e); wb.ready = false; wb.bump("ready"); }
}
main();
