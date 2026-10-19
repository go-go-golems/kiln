/** W-08 Linear layer, tiled
 *  group  ML compiler
 *  about  y = x·Wᵀ becomes a shared-memory tiled matmul with register blocking: BM, BN, BK, TM, TN are the fork
 *  try    Which tile shape did the cost model pick, and is it the fastest measured? | Tune with a budget of 48
 */
// A contraction: y[m, n] = Σ_k x[m, k] · W[n, k]. The tile pass recognizes the contraction in the Loop IR
// and offers MAP=tiled schedules: each block computes a BM×BN tile, walking K in BK slices staged in
// shared memory; each thread holds a TM×TN register tile. The fork has dozens of legal options; the cost
// model ranks them and Tune measures them. Coalescing-aware loads keep sectors per request near 4.
const M = param.int("M", { min: 64, max: 8192, default: 1024, scale: "log", help: "tokens" });
const K = param.int("K", { min: 64, max: 8192, default: 1024, scale: "log", help: "in features" });
const Nf = param.int("N", { min: 64, max: 8192, default: 1024, scale: "log", help: "out features" });

project("linear")
  .params(M, K, Nf)
  .program(({ x }, { param }) => ({ y: N.linear(x, std.weight("W", [param(Nf), param(K)])) }),
           ({ param }) => ({ x: k.tensor([param(M), param(K)]) }));
