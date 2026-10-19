#!/usr/bin/env node
// Checks WCAG 2.x contrast for the colour pairs the workbench actually draws, in light and dark, from the
// token values in tokens.css. Text pairs need 4.5:1; input borders need 3:1 (non-text, WCAG 1.4.11).
// Translucent tokens (--sel) are composited over the ground they sit on before measuring.
//   node scripts/contrast.mjs [tokens.css]      exits 1 when any pair fails
import { readFileSync } from "node:fs";

const file = process.argv[2] || new URL("../apps/workbench/src/ui/tokens.css", import.meta.url).pathname;
const css = readFileSync(file, "utf8");
const block = (re) => Object.fromEntries([...(css.match(re)?.[1] || "").matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const light = block(/^:root \{([\s\S]*?)\n\}/m);
const dark = { ...light, ...block(/:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/) };

function rgba(v) {
  let m = v.match(/^#([0-9a-f]{6})$/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(1);
  m = v.match(/^rgba?\(([^)]+)\)$/);
  if (m) { const p = m[1].split(",").map((x) => parseFloat(x)); return [p[0], p[1], p[2], p[3] ?? 1]; }
  if (v === "white" || v === "#fff") return [255, 255, 255, 1];
  throw new Error("cannot parse colour " + v);
}
const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

const grounds = ["bg", "fill", "code-bg"];
const text = ["ink", "ink-2", "accent", "tok-key", "tok-str", "tok-num", "tok-expr", "tok-com", "tok-punc"];
const pairs = [];
for (const g of grounds) for (const t of text) pairs.push({ fg: t, bg: g, min: 4.5 });
pairs.push({ fg: "ink", bg: "sel", min: 4.5 }, { fg: "accent", bg: "sel", min: 4.5 }, { fg: "ink-2", bg: "sel", min: 4.5 });
pairs.push({ fg: "bg", bg: "ink", min: 4.5, note: "inverted controls" }, { fg: "on-accent", bg: "accent", min: 4.5, note: "toast.bad" });
for (const g of ["bg", "code-bg"]) pairs.push({ fg: "hair-strong", bg: g, min: 3, note: "input border" });

let bad = 0;
for (const [name, T] of [["light", light], ["dark", dark]]) {
  console.log(`\n${name}`);
  const col = (k) => rgba(k.startsWith("#") ? k : T[k]);
  for (const p of pairs) {
    const ground = p.bg === "sel" ? over(col("sel"), col("bg")) : col(p.bg);
    const r = ratio(over(col(p.fg), ground), ground);
    const ok = r >= p.min;
    if (!ok) bad++;
    console.log(`${ok ? "ok  " : "FAIL"} ${(p.fg + " on " + p.bg).padEnd(24)} ${r.toFixed(2).padStart(5)}:1  (≥${p.min}${p.note ? ", " + p.note : ""})`);
  }
}
console.log(bad ? `\n${bad} pair(s) below the threshold` : "\nall pairs pass");
process.exitCode = bad ? 1 : 0;
