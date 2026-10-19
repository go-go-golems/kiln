import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App.jsx";
import { wb } from "./ui/wb.js";
import { k, P } from "./core/kiln.js";
import { std } from "./std/index.js";

window.__kiln = { wb, k, P, std };

async function connectClaude() {
  // capabilities light up later, or resolve null when this view cannot run them
  let use = window.claude?.use;
  for (let i = 0; !use && i < 30; i++) { await new Promise((r) => setTimeout(r, 100)); use = window.claude?.use; }
  if (!use) { wb.platformReady = true; wb.bump("platform"); return; }
  try { wb.sample = await use("sample"); } catch { wb.sample = null; }
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
