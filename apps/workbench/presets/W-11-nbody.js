/** W-11 N-body forces
 *  group  Write programs
 *  about  an all-pairs physics kernel written with broadcasting: the compiler finds a reduction over particles
 *  try    Is this compute-bound or memory-bound, and why? | Add a softening slider and a mass per particle
 */
// For every particle i: a_i = Σ_j (p_j − p_i) / (|p_j − p_i|² + ε)^{3/2}. Written as tensor code: the pair
// differences are a broadcast (n,1,3) − (1,n,3), the distance is a reduction over xyz, and the force sum
// is a reduction over j. The compiler never materializes the n×n×3 tensor: it fuses into reductions.
const n = param.int("particles", { min: 64, max: 8192, default: 512, scale: "log" });
const soft = param.float("softening", { min: 0.001, max: 0.5, step: 0.001, default: 0.01 });

project("nbody")
  .params(n, soft)
  .program(({ p }, { param }) => {
    const N_ = param(n);
    const d = N.sub(N.reshape(p, [1, N_, 3]), N.reshape(p, [N_, 1, 3]));          // d[i, j] = p_j − p_i
    const r2 = N.add(N.sum(N.square(d), -1), param(soft));                       // (n, n, 1)
    const inv = N.pow(r2, -1.5);
    return { a: N.sum(N.mul(d, inv), 1, false) };                                // Σ_j → (n, 3)
  }, ({ param }) => ({ p: k.tensor([param(n), 3]) }))
  .check("forces sum to ~zero (Newton's third law)", ({ outputs }) => {
    const a = outputs.a.data; const s = [0, 0, 0];
    for (let i = 0; i < a.length; i++) s[i % 3] += a[i];
    const scale = a.reduce((m, x) => Math.max(m, Math.abs(x)), 0) * Math.sqrt(a.length);
    return s.every((x) => Math.abs(x) < 1e-3 * scale) || `net force ${s.map((x) => x.toExponential(2)).join(", ")}`;
  });
