/** W-03 Lowering to a register VM
 *  group  Basics
 *  about  lower one dialect into another under a strict IR, then a whole-graph pass allocates registers and emits code
 *  try    Turn reuse off in Knobs and compare the register count | Add a fused multiply-add instruction
 */
const OPS = { add: (a, b) => a + b, sub: (a, b) => a - b, mul: (a, b) => a * b, neg: (a) => -a };

// the source language
const A = k.dialect("arith")
  .op("const", { attrs: { value: 0 }, traits: ["pure", "const"], infer: () => k.scalar(), eval: ({ value }) => value, print: "{value}" })
  .op("add", { args: ["a", "b"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, b }) => a + b, print: "{a} + {b}" })
  .op("sub", { args: ["a", "b"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, b }) => a - b, print: "{a} - {b}" })
  .op("mul", { args: ["a", "b"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, b }) => a * b, print: "{a} * {b}" })
  .op("neg", { args: ["a"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a }) => -a, print: "-{a}" })
  .lifts((v) => A.const({ value: v }))
  .methods({ add: (a, b) => A.add(a, b), sub: (a, b) => A.sub(a, b), mul: (a, b) => A.mul(a, b), neg: (a) => A.neg(a) });

// the target: three-address instructions, still a graph (so it still evaluates)
const Vm = k.dialect("vm")
  .op("imm", { attrs: { value: 0 }, traits: ["pure", "const"], infer: () => k.scalar(), eval: ({ value }) => value, print: "imm {value}" })
  .op("bin", { args: ["a", "b"], attrs: { opcode: "add" }, traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, b, opcode }) => OPS[opcode](a, b), print: "{opcode} {a}, {b}" })
  .op("un", { args: ["a"], attrs: { opcode: "neg" }, traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, opcode }) => OPS[opcode](a), print: "{opcode} {a}" });

// …and finally a linear program: one node holding the instruction list; its eval is a tiny interpreter
function exec(code, names, ins) {
  const env = Object.fromEntries(names.map((n, i) => ["%" + n, ins[i]])), R = [];
  const val = (s) => (s.startsWith("%") ? env[s] : R[+s.slice(1)]);
  for (const line of code) {
    let m;
    if ((m = line.match(/^r(\d+) = imm (\S+)$/))) R[+m[1]] = +m[2];
    else if ((m = line.match(/^r(\d+) = (\w+) (.+)$/))) R[+m[1]] = OPS[m[2]](...m[3].split(", ").map(val));
    else if ((m = line.match(/^ret (\S+)$/))) return val(m[1]);
  }
}
const Asm = k.dialect("asm").op("program", {
  args: { variadic: "ins" }, attrs: { code: [], regs: 0, names: [] }, infer: () => k.scalar(),
  eval: ({ ins, code, names }) => exec(code, names, ins),
  print: ({ regs, code }) => `program · ${code.length} instructions · ${regs} registers`,
  body: ({ code }) => code.join("\n"),
});

// lowering: every arith op becomes a vm op. The strict "vm" checkpoint fails the compile if any op is left behind.
const lowerBin = k.rule("lower_binary").match(P.oneOf("arith.add", "arith.sub", "arith.mul").as("n")).rewrite(({ n }) => n.lower(Vm.bin({ opcode: n.opName })));
const lowerNeg = k.rule("lower_neg").match(P.op("arith.neg").as("n")).rewrite(({ n }) => n.lower(Vm.un({ opcode: "neg" })));
const lowerConst = k.rule("lower_const").match(P.op("arith.const").as("n")).rewrite(({ n }) => n.lower(Vm.imm({ value: n.attrs.value })));

// a whole-graph pass: linear-scan register allocation over the topological order, then emission
const REUSE = param.bool("reuse", { default: true, help: "reuse a register once its value is dead" });
const emit = k.pass("regalloc+emit").short("e").whole(({ graph, edit, param }) => {
  const order = graph.topo().filter((id) => graph.nodes.get(id).name !== "kiln.input");
  const last = new Map();
  order.forEach((id, i) => graph.nodes.get(id).args.forEach((a) => last.set(a, i)));
  for (const o of graph.outputs) last.set(o.id, Infinity);
  const reg = new Map(), free = [], code = [];
  let nregs = 0;
  const src = (id) => { const n = graph.nodes.get(id); return n.name === "kiln.input" ? "%" + n.attrs.name : "r" + reg.get(id); };
  order.forEach((id, i) => {
    const n = graph.nodes.get(id);
    const ops = n.args.map(src);
    if (param(REUSE)) for (const a of new Set(n.args)) if (last.get(a) === i && reg.has(a)) free.push(reg.get(a));
    const r = free.length ? free.pop() : nregs++;
    reg.set(id, r);
    code.push(n.name === "vm.imm" ? `r${r} = imm ${n.attrs.value}` : `r${r} = ${n.attrs.opcode} ${ops.join(", ")}`);
  });
  code.push(`ret ${src(graph.outputs[0].id)}`);
  edit.replaceAll(edit.node(Asm.program, graph.inputs.map((x) => x.id), { code, regs: nregs, names: graph.inputs.map((x) => x.name) }));
});

const pipe = k.pipeline("to-vm")
  .params(REUSE)
  .ir("arith", { dialects: [A] })
  .pass(k.pass("lower").short("l").rules(lowerBin, lowerNeg, lowerConst))
  .ir("vm", { dialects: [Vm], strict: true })
  .pass(emit)
  .ir("asm", { dialects: [Asm], strict: true })
  .build();

project("poly")
  .pipeline(pipe)
  .program(({ x, y }) => ({ out: x.mul(x).mul(x).mul(3).sub(x.mul(x).mul(2)).add(x.mul(y)).sub(7).neg() }), { x: k.scalar(), y: k.scalar() })
  .data({ x: 1.5, y: -2 })
  .check("the program computes what the source does", ({ outputs, reference }) => Math.abs(outputs.out - reference.out) < 1e-9 || `got ${outputs.out}, want ${reference.out}`)
  .check("registers are reused", ({ run, graph }) => { const p = run.graph.find("asm.program"); return !run.params.get("reuse") || p.attrs.regs <= 4 || `${p.attrs.regs} registers`; });
