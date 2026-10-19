/** W-01 Hello, dialect
 *  group  Basics
 *  about  define a dialect, trace a program into a graph, simplify it with a pass of rewrite rules
 *  try    Add a rule that folds x - x into 0 | Why did const_right fire before fold?
 */
// A dialect is a set of ops. Each op says how to infer its type, how to evaluate it (so any graph made of
// it can be interpreted, and every rewrite checked), and how to print. Methods let traced code read
// like ordinary math: x.mul(3).add(y).
const Arith = k.dialect("arith")
  .op("const", { attrs: { value: 0 }, traits: ["pure", "const"], infer: () => k.scalar(), eval: ({ value }) => value, print: "{value}" })
  .op("add", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => a + b, print: "{a} + {b}" })
  .op("sub", { args: ["a", "b"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, b }) => a - b, print: "{a} - {b}" })
  .op("mul", { args: ["a", "b"], traits: ["pure", "commutative"], infer: ({ a }) => a.type, eval: ({ a, b }) => a * b, print: "{a} * {b}" })
  .lifts((v) => Arith.const({ value: v }))        // bare numbers in traced code become consts
  .methods({ add: (a, b) => Arith.add(a, b), sub: (a, b) => Arith.sub(a, b), mul: (a, b) => Arith.mul(a, b) });

// Rules match a pattern and return a replacement. Three ways to write the match:
const constRight = k.rule("const_right")              // 1. a pattern with a predicate
  .match(P.trait("commutative").as("n").where(({ n }) => n.arg(0).isConst() && !n.arg(1).isConst()))
  .rewrite(({ n }) => n.with({ args: [n.arg(1), n.arg(0)] }));
const fold = k.rule("fold")                            // 2. any pure op whose args are all constants
  .match(P.trait("pure").as("n").where(({ n }) => n.args.length > 0 && n.args.every((a) => a.isConst())))
  .rewrite(({ n }) => Arith.const({ value: n.fold() }));
const mulOne = k.rule("mul_one").from(({ x }) => x.mul(1)).to(({ x }) => x);     // 3. by example
const addZero = k.rule("add_zero").from(({ x }) => x.add(0)).to(({ x }) => x);
const mulZero = k.rule("mul_zero").from(({ x }) => x.mul(0)).to(() => Arith.const({ value: 0 }));
const twice = k.rule("x*2 → x+x").from(({ x }) => x.mul(2)).to(({ x }) => x.add(x));

// A pass runs its rules to a fixpoint; a pipeline alternates IR checkpoints and passes.
const simplify = k.pass("simplify").short("s").rules(constRight, fold, mulOne, addZero, mulZero, twice)
  .describe("canonicalize constants to the right, fold, and apply algebraic identities");
const pipe = k.pipeline("calc")
  .ir("arith", { dialects: [Arith] })
  .pass(simplify)
  .ir("simple", { dialects: [Arith], strict: true })
  .build();

project("calc")
  .pipeline(pipe)
  .program(({ x, y }) => ({ out: x.mul(Arith.add(3, -2)).add(0).add(y.mul(2)).add(Arith.mul(0, y)) }), { x: k.scalar(), y: k.scalar() })
  .data({ x: 3, y: 4 })
  .check("folds to x + (y + y): two inputs, two adds", ({ run }) => run.graph.size === 4 || `expected 4 nodes, got ${run.graph.size}`)
  .check("same value as the source", ({ outputs }) => outputs.out === 11 || `got ${outputs.out}`);
