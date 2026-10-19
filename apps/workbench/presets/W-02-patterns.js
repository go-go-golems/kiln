/** W-02 Patterns, declines and guards
 *  group  Basics
 *  about  strength reduction, chained patterns, CSE in one rule, and rules that say no (and why)
 *  try    Turn on Declined in the Trace view: why was y * 6 left alone? | Make distribute fire anyway
 */
const I = k.dialect("int")
  .op("const", { attrs: { value: 0 }, traits: ["pure", "const"], infer: () => k.scalar("i32"), eval: ({ value }) => value, print: "{value}" })
  .op("add", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => (a + b) | 0, print: "{a} + {b}" })
  .op("mul", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => Math.imul(a, b), print: "{a} * {b}" })
  .op("shl", { args: ["a", "b"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, b }) => a << b, print: "{a} << {b}" })
  .lifts((v) => I.const({ value: v }))
  .methods({ add: (a, b) => I.add(a, b), mul: (a, b) => I.mul(a, b), shl: (a, b) => I.shl(a, b) });

const isPow2 = (c) => Number.isInteger(c) && c > 0 && (c & (c - 1)) === 0;

// x * 2^k → x << k. A rule declines with skip(reason): the Trace shows the reason (turn on Declined).
const strength = k.rule("strength_reduce")
  .match(P.op("int.mul").as("m").where(({ m }) => m.arg(1).isConst()))
  .rewrite(({ m, skip }) => {
    const c = m.arg(1).value;
    if (!isPow2(c)) skip(`${c} is not a power of two`);
    return I.shl(m.arg(0), Math.log2(c));
  });

// (x << a) << b → x << (a + b). P.chain matches a producer → consumer pair; the inner node must have one use.
const shlShl = k.rule("shl_shl")
  .match(P.chain(P.op("int.shl").as("inner").where(({ inner }) => inner.arg(1).isConst()),
                 P.op("int.shl").as("outer").where(({ outer }) => outer.arg(1).isConst())))
  .rewrite(({ inner, outer }) => I.shl(inner.arg(0), inner.arg(1).value + outer.arg(1).value));

// common subexpressions: a pure node whose structural key matches an earlier node's is that node
const cse = k.rule("cse")
  .match(P.trait("pure").as("n").where(({ n }) => !n.isConst()))
  .rewrite(({ n, graph }) => graph.findBefore(n.id, (v) => v.id !== n.id && v.key() === n.key()) ?? undefined);

// a * (b + c) → a*b + a*c, but only if the graph does not grow: a guard sees before and after and can veto
const distribute = k.rule("distribute")
  .from(({ a, b, c }) => a.mul(b.add(c))).to(({ a, b, c }) => a.mul(b).add(a.mul(c)))
  .guard(({ before, after }) => after.size <= before.size || `would grow the graph from ${before.size} to ${after.size} nodes`);

const pipe = k.pipeline("int-opt")
  .ir("int", { dialects: [I] })
  .pass(k.pass("strength").short("s").rules(strength, shlShl))
  .pass(k.pass("cleanup").short("c").rules(cse, distribute))
  .ir("optimized", { dialects: [I], strict: true })
  .build();

project("int-opt")
  .pipeline(pipe)
  .program(({ x, y, z }) => ({ out: x.mul(8).mul(4).add(y.mul(6)).add(x.mul(8).mul(4)).add(z.mul(y.add(3))) }), { x: k.scalar("i32"), y: k.scalar("i32"), z: k.scalar("i32") })
  .data({ x: 5, y: -7, z: 3 })
  .check("x * 8 * 4 became one shift, computed once", ({ run }) => run.graph.findAll("int.shl").length === 1 || run.graph.print())
  .check("same value", ({ outputs, reference }) => outputs.out === reference.out || `got ${outputs.out}, want ${reference.out}`);
