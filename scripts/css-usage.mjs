#!/usr/bin/env node
// Finds CSS selectors that can never match: a selector is dead when it names a class or id that appears
// nowhere in the page's source. For classes the test is deliberately conservative: any occurrence of the
// name as a word (in a string, an identifier, a comment) keeps it, so dynamic class names built from
// literals survive. Ids must appear as id="x", getElementById("x") or "#x". Selectors inside :not(...)
// are ignored, because :not(.dead) always matches.
//
//   node scripts/css-usage.mjs [--write] <css files...> -- <source dirs or files...>
//     prints dead selectors per file; --write removes them (whole rules when every selector is dead)
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help")) {
  console.log("usage: css-usage.mjs [--write] <css files...> -- <source dirs or files...>");
  process.exit(argv.length ? 0 : 2);
}
const write = argv.includes("--write");
const sep = argv.indexOf("--");
const cssFiles = argv.slice(0, sep).filter((a) => a !== "--write");
const sources = argv.slice(sep + 1);

function walk(p, out = []) {
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) walk(join(p, f), out);
  else if (/\.(jsx?|mjs|ts|tsx|md|html)$/.test(p) && !/\.gen\.js$/.test(p)) out.push(p);
  return out;
}
const words = new Set(), ids = new Set();
for (const f of sources.flatMap((s) => walk(s))) {
  const text = readFileSync(f, "utf8");
  for (const w of text.match(/[A-Za-z_][\w-]*/g) || []) {
    words.add(w); words.add(w.toLowerCase()); // doc.js lowercases callout kinds ("Caveat" → .caveat)
    for (const part of w.split("-")) words.add(part); // "a-b" in source also vouches for "a" and "b"
  }
  for (const m of text.matchAll(/\bid=["'`{]+([\w-]+)|getElementById\(["'`]([\w-]+)|["'`]#([\w-]+)/g)) ids.add(m[1] || m[2] || m[3]);
}

// Splits a stylesheet into rules with their source spans; @media/@container/@supports recurse, other
// at-rules (keyframes, font-face) are kept as opaque blocks.
function parse(text) {
  const rules = [];
  const masked = text.replace(/\/\*[\s\S]*?\*\//g, (c) => " ".repeat(c.length)).replace(/"(?:[^"\\]|\\.)*"/g, (s) => '"' + "_".repeat(s.length - 2) + '"');
  function block(from, to) {
    let i = from;
    while (i < to) {
      while (i < to && /\s/.test(masked[i])) i++;
      if (i >= to) break;
      const open = masked.indexOf("{", i), semi = masked.indexOf(";", i);
      if (masked[i] === "@" && semi !== -1 && (open === -1 || semi < open)) { i = semi + 1; continue; }
      let depth = 0, j = open;
      for (; j < to; j++) { if (masked[j] === "{") depth++; else if (masked[j] === "}" && --depth === 0) break; }
      const prelude = masked.slice(i, open).trim();
      if (/^@(media|container|supports)/.test(prelude)) block(open + 1, j);
      else if (!prelude.startsWith("@")) rules.push({ start: i, end: j + 1, preStart: i, preEnd: open, prelude: text.slice(i, open).trim() });
      i = j + 1;
    }
  }
  block(0, masked.length);
  return rules;
}

function splitSelectors(s) {
  const out = []; let depth = 0, cur = "";
  for (const c of s) { if (c === "(") depth++; if (c === ")") depth--; if (c === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += c; }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function deadNames(sel) {
  const visible = sel.replace(/:not\((?:[^()]|\([^()]*\))*\)/g, "");
  const names = [...visible.matchAll(/([.#])(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1] + m[2]);
  return names.filter((n) => (n[0] === "#" ? !ids.has(n.slice(1)) : !words.has(n.slice(1))));
}

let total = 0;
for (const file of cssFiles) {
  const text = readFileSync(file, "utf8");
  const edits = [];
  for (const r of parse(text)) {
    const sels = splitSelectors(r.prelude);
    const keep = sels.filter((s) => !deadNames(s).length);
    const dead = sels.filter((s) => deadNames(s).length);
    if (!dead.length) continue;
    total += dead.length;
    for (const s of dead) console.log(`${file}: ${s}   (${deadNames(s).join(" ")})`);
    edits.push(keep.length ? { start: r.preStart, end: r.preEnd, text: keep.join(", ") + " " } : { start: r.start, end: r.end, text: "" });
  }
  if (write && edits.length) {
    let out = text;
    for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
    out = out.split("\n").map((l) => l.replace(/[ \t]+$/, "")).filter((l, i, a) => l !== "" || (a[i - 1] ?? "") !== "").join("\n");
    out = out.replace(/@(media|container)[^{]*\{\s*\}\s*\n?/g, "");
    writeFileSync(file, out);
  }
}
console.log(`${total} dead selector${total === 1 ? "" : "s"}${write ? " removed" : ""}`);
process.exitCode = 0;
