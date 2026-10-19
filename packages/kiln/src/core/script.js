// Run a preset script: plain JavaScript evaluated with the workbench scope (k, P, std, N, project …).
// Syntax errors get a line from acorn; runtime errors get a line from the stack.
import { parse } from "acorn";
import { makeScriptScope } from "../std/index.js";

export function headerOf(text) {
  const head = text.match(/\/\*\*\s*([A-Z]-\d+)?\s*([^\n]*)\n([\s\S]*?)\*\//);
  const field = (k) => ((head?.[3] || "").match(new RegExp("\\*\\s+" + k + "\\s+(.+)")) || [])[1]?.trim() || "";
  return {
    id: head?.[1] || null, title: (head?.[2] || "Untitled").trim(), group: field("group") || "Mine", about: field("about"),
    tries: field("try").split("|").map((s) => s.trim()).filter(Boolean),
  };
}

// the script's line for an error thrown by script code (also later, from the program lambda while tracing)
export function lineOf(e) {
  const m = String(e?.stack || e?.cause?.stack || "").match(/preset\.js:(\d+)/);
  return m ? Math.max(1, +m[1] - 3) : null;
}

export function runScript(text, extra = {}) {
  const diags = [];
  try { parse(text, { ecmaVersion: "latest", sourceType: "script", allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true }); }
  catch (e) { diags.push({ level: "error", line: e.loc?.line, message: e.message.replace(/\s*\(\d+:\d+\)$/, "") }); return { ok: false, diags, project: null }; }
  const sink = { projects: [] };
  const scope = { ...makeScriptScope(sink), ...extra };
  const names = Object.keys(scope);
  try {
    const fn = new Function(...names, `"use strict";\n${text}\n//# sourceURL=preset.js`);
    fn(...names.map((n) => scope[n]));
  } catch (e) {
    diags.push({ level: "error", line: lineOf(e), message: `${e.name && e.name !== "Error" ? e.name + ": " : ""}${e.message}` });
    return { ok: false, diags, project: null };
  }
  const project = sink.projects[sink.projects.length - 1] || null;
  if (!project) diags.push({ level: "error", message: "the script defines no project: end it with project(\"name\").program(…)" });
  if (sink.projects.length > 1) diags.push({ level: "warn", message: `${sink.projects.length} projects defined; the last one is used` });
  return { ok: !!project, diags, project };
}
