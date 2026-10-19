// Markdown for project notes (tutorials): headings with anchors, paragraphs, nested lists, tables,
// call-outs, code fences, and TeX math ($…$ inline, $$…$$ display) rendered to MathML by KaTeX when the
// page provides window.katex (main.jsx bundles it), else shown as TeX. Links go to https: or to lab: actions in the workbench.
// A ```hypothesis <id> fence becomes a slot for that hypothesis's card.
import { highlight, highlightC } from "./highlight.js";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const slug = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");

export function tex(src, display = false) {
  const K = typeof window !== "undefined" ? window.katex : null;
  if (K) { try { return K.renderToString(src, { output: "mathml", displayMode: display, throwOnError: false, strict: false }); } catch {} }
  return display ? `<pre class="tex">${esc(src)}</pre>` : `<code class="tex">${esc(src)}</code>`;
}

export function inline(s) {
  const keep = [];
  const hold = (html) => { keep.push(html); return `\u0000${keep.length - 1}\u0000`; };
  s = s.replace(/`([^`]+)`/g, (_, c) => hold(`<code>${esc(c)}</code>`));
  s = s.replace(/\$\$([^$]+)\$\$/g, (_, m) => hold(tex(m, true)));
  s = s.replace(/(^|[^\\$\w])\$(?=\S)([^$\n]*?\S)\$(?![\w$])/g, (_, pre, m) => pre + hold(tex(m, false)));
  s = s.replace(/\\\$/g, "$");
  s = esc(s);
  s = s.replace(/\[([^\]]+)\]\(((?:https:\/\/|lab:|#)[^)\s]+)\)/g, (_, t, u) => `<a href="${u}"${u.startsWith("lab:") ? ' class="lablink"' : u.startsWith("#") ? ' class="anchor"' : ' target="_blank" rel="noopener"'}>${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/(^|[\s(“"'])\*([^*\s][^*]*?)\*(?=[\s).,;:!?”"']|$)/g, "$1<i>$2</i>").replace(/(^|[\s(])_([^_\s][^_]*?)_(?=[\s).,;:!?]|$)/g, "$1<i>$2</i>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}

const LIST = /^(\s*)([-*•]|\d+[.)])\s+(.*)$/;
const CALLOUT = /^\*\*(Try|Try it|Note|Why|Exercise|Check|Watch|Math|System|Caveat|Takeaway)[^*]*\*\*/i;

export function renderDoc(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const out = [], toc = [];
  let i = 0;
  const isBlockStart = (l) => /^\s*(```|#{1,4}\s|>|\$\$|---\s*$|\|)/.test(l) || LIST.test(l);
  function list(baseIndent) {
    const ordered = /\d/.test(lines[i].match(LIST)[2]);
    let html = ordered ? "<ol>" : "<ul>";
    while (i < lines.length) {
      const m = lines[i].match(LIST);
      if (!m || m[1].length < baseIndent) break;
      if (m[1].length > baseIndent) { html = html.replace(/<\/li>$/, "") + list(m[1].length) + "</li>"; continue; }
      let body = m[3];
      i++;
      // continuation lines (indented, not a new item)
      while (i < lines.length && lines[i].trim() && !LIST.test(lines[i]) && /^\s{2,}/.test(lines[i])) body += " " + lines[i++].trim();
      html += `<li>${inline(body)}</li>`;
    }
    return html + (ordered ? "</ol>" : "</ul>");
  }
  while (i < lines.length) {
    const l = lines[i];
    const fence = l.match(/^\s*```\s*([\w+-]*)\s*(\S*)/);
    if (fence) {
      const lang = fence[1].toLowerCase(), body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      const src = body.join("\n");
      // a hypothesis card: an empty slot the Notes view fills with the live card (Hypotheses.jsx)
      if (lang === "hypothesis") out.push(`<div class="hyp-slot" data-hyp="${esc(fence[2] || src.trim())}"></div>`);
      else if (lang === "math" || lang === "tex") out.push(`<div class="mathblock">${tex(src, true)}</div>`);
      else if (/^(cuda|c|cpp|wgsl|cu)$/.test(lang)) out.push(`<pre class="src hl">${highlightC(src)}</pre>`);
      else if (/^(text|txt|ir|plain)$/.test(lang)) out.push(`<pre class="src plain">${esc(src)}</pre>`);
      else out.push(`<pre class="src hl">${highlight(src)}</pre>`);
      continue;
    }
    if (/^\s*\$\$/.test(l)) {
      const body = [];
      let first = l.replace(/^\s*\$\$/, "");
      if (/\$\$\s*$/.test(first) && first.trim() !== "") { out.push(`<div class="mathblock">${tex(first.replace(/\$\$\s*$/, ""), true)}</div>`); i++; continue; }
      if (first.trim()) body.push(first);
      i++;
      while (i < lines.length && !/\$\$\s*$/.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) { const last = lines[i].replace(/\$\$\s*$/, ""); if (last.trim()) body.push(last); i++; }
      out.push(`<div class="mathblock">${tex(body.join("\n"), true)}</div>`);
      continue;
    }
    const h = l.match(/^\s*(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length, title = h[2].trim(), id = slug(title);
      if (level === 2) toc.push({ id, title: title.replace(/[`*$]/g, "") });
      out.push(`<h${level} id="${id}">${inline(title)}</h${level}>`);
      i++;
      continue;
    }
    if (/^\s*---\s*$/.test(l)) { out.push("<hr>"); i++; continue; }
    if (/^\s*>/.test(l)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
      const kind = (body[0].match(CALLOUT) || [])[1]?.toLowerCase().replace(/\s.*/, "") || "";
      out.push(`<div class="callout ${kind}">${renderDoc(body.join("\n")).html}</div>`);
      continue;
    }
    if (/^\s*\|/.test(l) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const cells = (row) => row.trim().replace(/^\|/, "").replace(/\|\s*$/, "").split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, "|"));
      const head = cells(l);
      const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
      const td = (c, j, tag) => `<${tag}${align[j] ? ` style="text-align:${align[j]}"` : ""}>${inline(c)}</${tag}>`;
      out.push(`<div class="tablewrap-x"><table class="rt doc-t"><thead><tr>${head.map((c, j) => td(c, j, "th")).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, j) => td(c, j, "td")).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (LIST.test(l)) { out.push(list(l.match(LIST)[1].length)); continue; }
    if (!l.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(" "))}</p>`);
  }
  return { html: out.join("\n"), toc };
}
