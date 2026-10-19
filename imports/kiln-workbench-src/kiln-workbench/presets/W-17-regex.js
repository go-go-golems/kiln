/** W-17 Regex → NFA → DFA → JavaScript
 *  group  Other compilers
 *  about  not every compiler is about tensors: a regular-expression compiler with five IRs, whole-graph passes and a code generator
 *  try    Change the pattern to (a|b)*abb and watch the DFA shrink when minimize is on | Add character classes like [a-c]
 */
// IRs:  regex (the parsed pattern: char, any, cat, alt, star, plus, opt)
//   ─desugar→ core (plus and opt rewritten away)  ─thompson→ nfa  ─subset, minimize→ dfa  ─codegen→ js
// Every level evaluates, so the end-to-end check runs the source matcher and the generated code on the
// same strings. The pattern is a text parameter: edit it in the Code view's parameters.
const RX = { kind: "regex" };
const pattern = param.text("pattern", { default: "(ab|a)*b+.c?", help: "literals, ., |, *, +, ?, ( )" });
const MIN = param.bool("minimize", { default: true, help: "merge equivalent DFA states (Moore's algorithm)" });

// ---- the source dialect: each node evaluates to a matcher (s, i) → set of end positions
const ends = (f) => f;
const Re = k.dialect("re")
  .op("char", { attrs: { c: "a" }, infer: () => RX, print: "'{c}'", eval: ({ c }) => (s, i) => (s[i] === c ? [i + 1] : []) })
  .op("any", { infer: () => RX, print: ".", eval: () => (s, i) => (i < s.length ? [i + 1] : []) })
  .op("eps", { infer: () => RX, print: "ε", eval: () => (s, i) => [i] })
  .op("cat", { args: ["a", "b"], infer: () => RX, print: "{a}·{b}", eval: ({ a, b }) => (s, i) => [...new Set(a(s, i).flatMap((j) => b(s, j)))] })
  .op("alt", { args: ["a", "b"], infer: () => RX, print: "{a} | {b}", eval: ({ a, b }) => (s, i) => [...new Set([...a(s, i), ...b(s, i)])] })
  .op("star", { args: ["a"], infer: () => RX, print: "{a}*", eval: ({ a }) => (s, i) => { const seen = new Set([i]), q = [i]; while (q.length) for (const j of a(s, q.pop())) if (!seen.has(j)) { seen.add(j); q.push(j); } return [...seen]; } })
  .op("plus", { args: ["a"], infer: () => RX, print: "{a}+", eval: ({ a }) => (s, i) => { const seen = new Set(), q = a(s, i).slice(); q.forEach((j) => seen.add(j)); while (q.length) for (const j of a(s, q.pop())) if (!seen.has(j)) { seen.add(j); q.push(j); } return [...seen]; } })
  .op("opt", { args: ["a"], infer: () => RX, print: "{a}?", eval: ({ a }) => (s, i) => [...new Set([i, ...a(s, i)])] })
  .op("match", { args: ["rx", "s"], infer: () => k.scalar("bool"), print: "match({rx}, {s})", eval: ({ rx, s }) => (rx(s, 0).includes(s.length) ? 1 : 0) });

// a recursive-descent parser that builds the graph (runs while tracing)
function parse(src) {
  let i = 0;
  const peek = () => src[i], eat = (c) => { if (src[i] !== c) throw new Error(`expected '${c}' at ${i} in /${src}/`); i++; };
  const alt = () => { let a = cat(); while (peek() === "|") { i++; a = Re.alt(a, cat()); } return a; };
  const cat = () => { let a = null; while (i < src.length && peek() !== "|" && peek() !== ")") { const b = post(); a = a ? Re.cat(a, b) : b; } return a || Re.eps(); };
  const post = () => { let a = atom(); for (;;) { if (peek() === "*") { i++; a = Re.star(a); } else if (peek() === "+") { i++; a = Re.plus(a); } else if (peek() === "?") { i++; a = Re.opt(a); } else return a; } };
  const atom = () => { const c = src[i++]; if (c === "(") { const a = alt(); eat(")"); return a; } if (c === ".") return Re.any(); if (c === "\\") return Re.char({ c: src[i++] }); if ("*+?|)".includes(c)) throw new Error(`unexpected '${c}' at ${i - 1} in /${src}/`); return Re.char({ c }); };
  const r = alt();
  if (i < src.length) throw new Error(`unexpected '${src[i]}' at ${i} in /${src}/`);
  return r;
}

// ---- desugar: plus and opt in terms of the core
const desugar = k.pass("desugar").short("d").rules(
  k.rule("plus").match(P.op("re.plus").as("n")).rewrite(({ n }) => Re.cat(n.arg(0), Re.star(n.arg(0)))),
  k.rule("opt").match(P.op("re.opt").as("n")).rewrite(({ n }) => Re.alt(n.arg(0), Re.eps())),
);

// ---- automata dialects
const OTHER = "\u0000";
const nfaRun = ({ s, nfa }) => {
  const close = (set) => { const q = [...set]; while (q.length) for (const t of nfa.eps[q.pop()] || []) if (!set.has(t)) { set.add(t); q.push(t); } return set; };
  let cur = close(new Set([nfa.start]));
  for (const ch0 of s) { const ch = nfa.alphabet.includes(ch0) ? ch0 : OTHER; const nxt = new Set(); for (const st of cur) for (const [c, t] of nfa.edges[st] || []) if (c === ch || c === "any") nxt.add(t); cur = close(nxt); }
  return cur.has(nfa.accept) ? 1 : 0;
};
const dfaRun = ({ s, dfa }) => { let st = 0; for (const ch0 of s) { const ch = dfa.alphabet.includes(ch0) ? ch0 : OTHER; st = dfa.table[st]?.[ch]; if (st == null) return 0; } return dfa.accept.includes(st) ? 1 : 0; };
const Auto = k.dialect("auto")
  .op("nfa", { args: ["s"], attrs: { nfa: null }, infer: () => k.scalar("bool"), eval: nfaRun,
    print: ({ nfa }) => `nfa(s) · ${nfa.n} states, ${nfa.edges.flat().length} edges, ${nfa.eps.flat().length} ε-edges`,
    body: ({ nfa }) => nfa.edges.map((es, q) => `${q === nfa.start ? "→" : " "}${q === nfa.accept ? "((" + q + "))" : " " + q + " "}  ${[...es.map(([c, t]) => `${c === OTHER ? "other" : c}→${t}`), ...(nfa.eps[q] || []).map((t) => `ε→${t}`)].join("  ")}`).join("\n") })
  .op("dfa", { args: ["s"], attrs: { dfa: null }, infer: () => k.scalar("bool"), eval: dfaRun,
    print: ({ dfa }) => `dfa(s) · ${dfa.table.length} states over {${dfa.alphabet.map((c) => (c === OTHER ? "other" : c)).join(", ")}}`,
    body: ({ dfa }) => dfa.table.map((row, q) => `${q === 0 ? "→" : " "}${dfa.accept.includes(q) ? "((" + q + "))" : " " + q + " "}  ${Object.entries(row).map(([c, t]) => `${c === OTHER ? "other" : c}→${t}`).join("  ")}`).join("\n") });
const Js = k.dialect("js")
  .op("fn", { args: ["s"], attrs: { source: "" }, infer: () => k.scalar("bool"), print: "js(s) · generated matcher", body: ({ source }) => source,
    eval: ({ s, source }) => new Function("s", source)(s) });

// ---- Thompson's construction: a whole-graph pass from the AST under match() to an NFA
const thompson = k.pass("thompson").short("t").whole(({ graph, edit }) => {
  const m = graph.find("re.match");
  const edges = [], eps = [];
  let n = 0;
  const st = () => { edges.push([]); eps.push([]); return n++; };
  const alphabet = new Set();
  const build = (v) => {                                    // returns [start, accept]
    switch (v.opName) {
      case "char": { const a = st(), b = st(); edges[a].push([v.attrs.c, b]); alphabet.add(v.attrs.c); return [a, b]; }
      case "any": { const a = st(), b = st(); edges[a].push(["any", b]); return [a, b]; }
      case "eps": { const a = st(), b = st(); eps[a].push(b); return [a, b]; }
      case "cat": { const [a1, b1] = build(v.arg(0)), [a2, b2] = build(v.arg(1)); eps[b1].push(a2); return [a1, b2]; }
      case "alt": { const a = st(), [a1, b1] = build(v.arg(0)), [a2, b2] = build(v.arg(1)), b = st(); eps[a].push(a1, a2); eps[b1].push(b); eps[b2].push(b); return [a, b]; }
      case "star": { const a = st(), [a1, b1] = build(v.arg(0)), b = st(); eps[a].push(a1, b); eps[b1].push(a1, b); return [a, b]; }
      default: throw new Error(`thompson: unexpected ${v.name}`);
    }
  };
  const [start, accept] = build(m.arg("rx"));
  edit.replaceAll(edit.node(Auto.nfa, [m.arg("s")], { nfa: { n, edges, eps, start, accept, alphabet: [...alphabet, OTHER] } }));
});

// ---- subset construction, then (optionally) minimization
const subset = k.pass("subset").short("s").whole(({ graph, edit }) => {
  const v = graph.find("auto.nfa"), nfa = v.attrs.nfa;
  const close = (set) => { const q = [...set]; while (q.length) for (const t of nfa.eps[q.pop()]) if (!set.has(t)) { set.add(t); q.push(t); } return [...set].sort((a, b) => a - b); };
  const key = (xs) => xs.join(","), start = close(new Set([nfa.start]));
  const ids = new Map([[key(start), 0]]), sets = [start], table = [];
  for (let i = 0; i < sets.length; i++) {
    table[i] = {};
    for (const c of nfa.alphabet) {
      const nxt = new Set();
      for (const q of sets[i]) for (const [ec, t] of nfa.edges[q]) if (ec === c || ec === "any") nxt.add(t);
      if (!nxt.size) continue;
      const cl = close(nxt), kk = key(cl);
      if (!ids.has(kk)) { ids.set(kk, sets.length); sets.push(cl); }
      table[i][c] = ids.get(kk);
    }
  }
  const accept = sets.map((s, i) => (s.includes(nfa.accept) ? i : -1)).filter((i) => i >= 0);
  edit.replaceAll(edit.node(Auto.dfa, [v.arg(0)], { dfa: { table, accept, alphabet: nfa.alphabet } }));
});
const minimize = k.pass("minimize").short("m").knobs(MIN).whole(({ graph, edit, param }) => {
  if (!param(MIN)) return;
  const v = graph.find("auto.dfa"), { table, accept, alphabet } = v.attrs.dfa;
  const D = table.length + 1;                                 // state D-1 is the dead state
  const next = (q, c) => (q === D - 1 ? D - 1 : table[q][c] ?? D - 1);
  let cls = Array.from({ length: D }, (_, q) => (accept.includes(q) ? 1 : 0));
  for (;;) {                                                  // Moore: refine by (class, classes of successors)
    const sig = cls.map((c, q) => c + "|" + alphabet.map((a) => cls[next(q, a)]).join(","));
    const ids = new Map(), nc = sig.map((s) => (ids.has(s) ? ids.get(s) : (ids.set(s, ids.size), ids.size - 1)));
    if (ids.size === new Set(cls).size) break;
    cls = nc;
  }
  // renumber so the start is 0, drop the dead class
  const order = [cls[0]], dead = cls[D - 1];
  for (let q = 0; q < D; q++) if (!order.includes(cls[q]) && cls[q] !== dead) order.push(cls[q]);
  const id = new Map(order.map((c, i) => [c, i]));
  const t2 = order.map(() => ({}));
  for (let q = 0; q < D - 1; q++) for (const a of alphabet) { const r = next(q, a); if (cls[r] !== dead && id.has(cls[q])) t2[id.get(cls[q])][a] = id.get(cls[r]); }
  const acc2 = [...new Set(accept.map((q) => id.get(cls[q])))];
  edit.replaceAll(edit.node(Auto.dfa, [v.arg(0)], { dfa: { table: t2, accept: acc2, alphabet } }));
});

// ---- code generation: a switch-based matcher
const codegen = k.pass("codegen").short("c").whole(({ graph, edit }) => {
  const v = graph.find("auto.dfa"), { table, accept, alphabet } = v.attrs.dfa;
  const lit = (c) => JSON.stringify(c);
  const lines = ["let q = 0;", "for (let i = 0; i < s.length; i++) {", `  const c = ${JSON.stringify(alphabet.filter((c) => c !== OTHER).join(""))}.includes(s[i]) ? s[i] : ${lit(OTHER)};`, "  switch (q) {"];
  table.forEach((row, q) => {
    const arms = Object.entries(row).map(([c, t]) => `c === ${lit(c)} ? ${t}`);
    lines.push(`    case ${q}: q = ${arms.length ? arms.join(" : ") + " : -1" : "-1"}; break;`);
  });
  lines.push("  }", "  if (q < 0) return 0;", "}", `return ${accept.length ? accept.map((a) => `q === ${a}`).join(" || ") : "false"} ? 1 : 0;`);
  edit.replaceAll(edit.node(Js.fn, [v.arg(0)], { source: lines.join("\n") }));
});

const pipe = k.pipeline("regex")
  .params(pattern)
  .ir("regex", { dialects: [Re] })
  .pass(desugar)
  .ir("core", { dialects: [Re], strict: true })
  .pass(thompson)
  .ir("nfa", { dialects: [Auto], strict: true })
  .pass(subset).pass(minimize)
  .ir("dfa", { dialects: [Auto], strict: true })
  .pass(codegen)
  .ir("js", { dialects: [Js], strict: true })
  .build();

const TESTS = ["", "b", "ab", "abb", "bc", "abc", "aabb", "ababbbc", "abx", "ac", "babbab", "xb", "abab", "aaaaaaaaaab", "bbbbbbbbz"];
project("regex")
  .pipeline(pipe)
  .program(({ s }, { param }) => ({ m: Re.match(parse(param(pattern)), s) }), { s: { kind: "string" } })
  .data({ s: "ababbbc" })
  .check("generated code agrees with the regex on every test string", ({ run, graph }) => {
    const bad = TESTS.filter((s) => run.graph.eval({ s }).m !== graph.eval({ s }).m);
    return !bad.length || `disagrees on ${bad.map((s) => JSON.stringify(s)).join(", ")}`;
  })
  .check("agrees with JavaScript's RegExp", ({ graph, run }) => {
    const re = new RegExp("^(?:" + run.params.get(pattern) + ")$", "s");
    const bad = TESTS.filter((s) => (re.test(s) ? 1 : 0) !== graph.eval({ s }).m);
    return !bad.length || `disagrees on ${bad.map((s) => JSON.stringify(s)).join(", ")}`;
  });
