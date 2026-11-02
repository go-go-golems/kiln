"""mma-large-k diagnosis: GPU output and Kiln's expected values, each against a float64 product of
RNE-TF32 operands; the worst elements with the magnitude of their terms."""
import sys, json, functools
import numpy as np
sys.path.insert(0, "runtime/python")
import kiln_launch as kl
inc = sys.argv[2]
path = f"{sys.argv[1]}/mma-large-k.program.json"
expect = json.load(open(path.replace(".program.", ".expect.")))
p = kl.load(path)
ins = {t["name"]: kl.gen(t["dtype"], int(np.prod(t["shape"])), expect["seeds"][t["name"]]).reshape(t["shape"]) for t in p["inputs"]}
with kl.CudaProgram(p, include_paths=(inc,)) as prog:
    out = prog.run(**ins)["out"].reshape(-1).astype(np.float64)
def tf32(x):
    b = x.astype(np.float32).view(np.uint32).astype(np.uint64)
    r = ((b + 0xFFF + ((b >> 13) & 1)) & 0xFFFFE000).astype(np.uint32)
    return r.view(np.float32).astype(np.float64)
A, B = tf32(ins["a"]), tf32(ins["b"])
ref = (A @ B).reshape(-1)
absterms = (np.abs(A) @ np.abs(B)).reshape(-1)
e = expect["expect"]["out"]; idx = np.asarray(e["indices"]); want = np.asarray(e["values"])
g, r, s = out[idx], ref[idx], absterms[idx]
eg, ek = np.abs(g - r), np.abs(want - r)
print(json.dumps({"n": len(idx), "gpu_vs_f64": {"max": eg.max(), "mean": eg.mean(), "max_over_sum_abs_terms": (eg / s).max()},
                  "kiln_vs_f64": {"max": ek.max(), "mean": ek.mean(), "max_over_sum_abs_terms": (ek / s).max()},
                  "fp32_unit_roundoff": 2.0**-24}, indent=1))
bad = np.nonzero(~(np.abs(g - want) <= 1e-4 + 1e-3 * np.abs(want)))[0]
for i in bad[:5]:
    print({"index": int(idx[i]), "gpu": g[i], "kiln": want[i], "f64": r[i], "sum_abs_terms": s[i]})
