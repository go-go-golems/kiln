import { k, P } from "../src/core/kiln.js";
const assert = (c, m) => { if (!c) { console.error("FAIL", m); process.exitCode = 1; } else console.log("ok  ", m); };

const Arith = k.dialect("arith")
  .op("const", { attrs: { value: 0 }, traits: ["pure", "const"], infer: () => k.scalar(), eval: ({ value }) => value, print: "{value}" })
  .op("add", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => a + b, print: "{a} + {b}" })
  .op("mul", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => a * b, print: "{a} * {b}" })
  .op("neg", { args: ["x"], traits: ["pure"], infer: ({ x }) => x.type, eval: ({ x }) => -x, print: "-{x}" })
  .lifts((v) => Arith.const({ value: v }))
  .methods({ add: (a, b) => Arith.add(a, b), mul: (a, b) => Arith.mul(a, b), neg: (a) => Arith.neg(a) });

const g = k.trace("f", ({ x, y }) => x.mul(Arith.add(Arith.const({ value: 3 }), Arith.const({ value: -2 }))).add(0).add(y.mul(2)), { x: k.scalar(), y: k.scalar() });
console.log(g.print());
assert(g.eval({ x: 3, y: 4 }).out === 11, "eval");

const fold = k.rule("fold").match(P.trait("pure").as("n").where(({ n }) => n.args.length && n.args.every((a) => a.isConst()))).rewrite(({ n }) => Arith.const({ value: n.fold() }));
const mulOne = k.rule("mul_one").match(P.op("arith.mul").as("m").where(({ m }) => m.arg("b").isConst(1))).rewrite(({ m }) => m.arg("a"));
const addZero = k.rule("add_zero").from(({ x }) => x.add(0)).to(({ x }) => x);
const dbl = k.rule("x*2→x+x").from(({ x }) => x.mul(2)).to(({ x }) => x.add(x));
const constRight = k.rule("const_right").match(P.trait("commutative").as("n").where(({ n }) => n.arg(0).isConst() && !n.arg(1).isConst())).rewrite(({ n }) => n.with({ args: [n.arg(1), n.arg(0)] }));
const simplify = k.pass("simplify").short("s").rules(constRight, fold, mulOne, addZero, dbl);
const pipe = k.pipeline("calc").ir("arith", { dialects: [Arith], strict: true }).pass(simplify).ir("done", { dialects: [Arith] }).build();
const run = pipe.run(g);
assert(run.ok, "run ok " + (run.error?.message || ""));
console.log(run.graph.print());
console.log(run.steps.filter((s) => s.kind === "rewrite").map((s) => `${s.rule}@${s.node}`).join(" "));
assert(run.graph.eval({ x: 3, y: 4 }).out === 11, "simplified eval");
console.log(run.diff(0).text.map((d) => d.op + " " + d.text).join("\n"));

// lowering with templates + strict IR
const Vm = k.dialect("vm").op("binop", { args: ["a", "b"], attrs: { opcode: "add" }, print: "{opcode} {a}, {b}", eval: ({ a, b, opcode }) => (opcode === "add" ? a + b : a * b) })
  .op("imm", { attrs: { value: 0 }, print: "imm {value}", eval: ({ value }) => value });
const lowerBin = k.rule("lower_binop").match(P.oneOf("arith.add", "arith.mul").as("n")).rewrite(({ n }) => n.lower(Vm.binop({ opcode: n.opName })));
const lowerC = k.rule("lower_const").match(P.op("arith.const").as("n")).rewrite(({ n }) => n.lower(Vm.imm({ value: n.attrs.value })));
const p2 = k.pipeline("toy").ir("arith", { dialects: [Arith] }).pass(simplify).pass(k.pass("lower").short("l").rules(lowerBin, lowerC)).ir("vm", { dialects: [Vm], strict: true }).build();
const r2 = p2.run(g);
assert(r2.ok, "lowered " + (r2.error?.message || ""));
console.log(r2.at("vm").print());
assert(r2.graph.eval({ x: 3, y: 4 }).out === 11, "vm eval");
const r3 = p2.run(k.trace("bad", ({ x }) => Arith.neg(x), { x: k.scalar() }));
assert(!r3.ok && r3.error.kind === "LoweringError", "strict stranding: " + r3.error?.message);

// params + fork
const UNROLL = k.param.enum("UNROLL", [1, 2, 4, 8], { off: 1 });
const Ex = k.dialect("ex").op("exp", { args: ["x"], traits: ["pure"], eval: ({ x }) => Math.exp(x), print: "exp({x})" });
const expand = k.rule("expand").match(P.op("ex.exp").as("e")).rewrite(({ e }) => k.fork.over(UNROLL, (u) => {
  let term = Arith.const({ value: 1 }), sum = term;
  for (let i = 1; i < u * 2; i++) { term = Arith.mul(term, Arith.mul(e.arg("x"), Arith.const({ value: 1 / i }))); sum = Arith.add(sum, term); }
  return sum;
}).keepOriginal());
const p3 = k.pipeline("series").pass(k.pass("expand").rules(expand).knobs(UNROLL)).decide(k.decide.chain(k.decide.pinned(), k.decide.cost(({ knobs }) => Math.abs((knobs.UNROLL) - 4)), k.decide.first())).build();
const gx = k.trace("e", ({ x }) => Ex.exp(x), { x: k.scalar() });
const r4 = p3.run(gx);
assert(r4.ok, "fork run " + (r4.error?.message || ""));
console.log(r4.decisions.map((d) => `${d.rule}: ${d.by} ${k.knobs.canonical(d.knobs)} of ${d.size}`));
assert(r4.decisions[0].knobs.UNROLL === 4, "cost picks 4");
const r5 = p3.run(gx, { params: { UNROLL: 8 } });
assert(r5.decisions[0].knobs.UNROLL === 8 && r5.decisions[0].by === "pinned", "pin narrows " + r5.decisions[0].by);
console.log("exp(0.5)≈", r5.graph.eval({ x: 0.5 }).out, Math.exp(0.5));
const r6 = p3.run(gx, { params: { UNROLL: 1 } });
console.log("keep original:", r6.graph.print({ header: false }), r6.decisions[0]);
