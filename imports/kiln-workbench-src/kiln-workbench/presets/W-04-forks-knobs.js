/** W-04 Forks, knobs and sliders
 *  group  Basics
 *  about  a rule that offers several rewrites (a fork), a cost model that picks one per node, and sliders that move the choice
 *  try    Tighten the tolerance: which exp() keeps the library call? | Pin TERMS=4 and read the check
 */
// exp(t) can stay a library call (accurate, ~20 cycles here) or become a Taylor polynomial in Horner form
// (2 ops per term, error ≈ e^R · R^(n+1)/(n+1)! on |t| ≤ R). Which is better depends on the node: exp(x/4)
// sees a quarter of the range exp(x) does. The rule returns a FORK over the knob TERMS; the pipeline's
// decide policy ranks the options at each node; Knobs shows every option and its score.
const X = k.dialect("ex")
  .op("const", { attrs: { value: 0 }, traits: ["pure", "const"], infer: () => k.scalar(), eval: ({ value }) => value, print: "{value}" })
  .op("add", { args: ["a", "b"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, b }) => a + b, print: "{a} + {b}" })
  .op("mul", { args: ["a", "b"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a, b }) => a * b, print: "{a} * {b}" })
  .op("exp", { args: ["a"], traits: ["pure"], infer: ({ a }) => a.type, eval: ({ a }) => Math.exp(a), print: "exp({a})" })
  .lifts((v) => X.const({ value: v }))
  .methods({ add: (a, b) => X.add(a, b), mul: (a, b) => X.mul(a, b), exp: (a) => X.exp(a) });

const TERMS = param.enum("TERMS", [0, 3, 4, 6, 8, 10, 12], { off: 0, help: "Taylor terms; 0 keeps the exp() call" });
const RANGE = param.float("range", { min: 0.25, max: 4, step: 0.25, default: 2, help: "inputs satisfy |x| ≤ range" });
const TOL = param.enum("tolerance", [1e-2, 1e-4, 1e-6, 1e-8], { default: 1e-6, help: "largest relative error allowed" });

const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
const taylor = k.rule("taylor_exp")
  .match(P.op("ex.exp").as("e"))
  .rewrite(({ e }) => k.fork.over(TERMS, [3, 4, 6, 8, 10, 12], (n) => {
    let p = X.const({ value: 1 / fact(n) });
    for (let i = n - 1; i >= 0; i--) p = X.add(X.mul(p, e.arg(0)), 1 / fact(i));
    return p;
  }).keepOriginal());

// the cost model: cycles, or Infinity if the error bound misses the tolerance
const scaleOf = (v) => (v.is(X.mul) && v.arg(1).isConst() ? Math.abs(v.arg(1).value) * scaleOf(v.arg(0)) : 1);
const cycles = k.decide.cost(({ knobs, node, run }) => {
  const n = knobs.TERMS;
  if (!n) return 20;
  const R = run.params.get(RANGE) * scaleOf(node.arg(0));
  const err = (R ** (n + 1) / fact(n + 1)) * Math.exp(R);
  return err <= run.params.get(TOL) ? 2 * n : Infinity;
}, { name: "cycles" });

const pipe = k.pipeline("approx")
  .params(RANGE, TOL)
  .ir("ex", { dialects: [X] })
  .pass(k.pass("approximate").short("a").rules(taylor).knobs(TERMS))
  .ir("approx", { dialects: [X] })
  .decide(k.decide.chain(k.decide.pinned(), cycles, k.decide.first()))
  .build();

project("approx")
  .pipeline(pipe)
  .program(({ x }) => ({ out: x.exp().add(x.mul(0.25).exp().mul(3)) }), { x: k.scalar() })
  .data({ x: 1.25 })
  .check("error within the tolerance on |x| ≤ range", ({ run, graph }) => {
    const R = run.params.get(RANGE), tol = run.params.get(TOL);
    let worst = 0;
    for (let i = 0; i <= 64; i++) { const x = -R + (2 * R * i) / 64; const want = graph.eval({ x }).out, got = run.graph.eval({ x }).out; worst = Math.max(worst, Math.abs(got - want) / Math.abs(want)); }
    return worst <= tol * 1.01 || `worst relative error ${worst.toExponential(2)} > ${tol}`;
  });
