"""KILN-011: PyTorch CPU expected values for the reference-pseudocode check. Writes JSON to stdout.
Excludes divisor 0 (raises) and trunc INT_MIN/-1 (SIGFPE on CPU); those are asserted from the reference side."""
import json, random, torch
random.seed(11)
out = []
for dtype, tdt, lo, hi in [('i64', torch.int64, -2**63, 2**63 - 1), ('i32', torch.int32, -2**31, 2**31 - 1)]:
    a = [7, -7, 7, -7, 0, 6, -6, lo, lo, hi, hi, lo + 1, -1, 1]
    b = [2, 2, -2, -2, 3, -3, 3, -1, 1, -1, 2, -2, hi, lo]
    for _ in range(4000):
        x = random.choice([random.randint(lo, hi), random.randint(-1000, 1000)])
        y = random.choice([random.randint(lo, hi), random.randint(-50, 50), random.choice([-1, 1, -2, 2])])
        if y != 0: a.append(x); b.append(y)
    A, B = torch.tensor(a, dtype=tdt), torch.tensor(b, dtype=tdt)
    ok = [i for i in range(len(a)) if not (a[i] == lo and b[i] == -1)]
    At, Bt = A[ok], B[ok]
    for op, r in [('floordiv', A // B), ('remainder', A % B), ('fmod', torch.fmod(A, B))]:
        out.append(dict(op=op, dtype=dtype, a=[str(v) for v in a], b=[str(v) for v in b], want=[str(v) for v in r.tolist()]))
    out.append(dict(op='truncdiv', dtype=dtype, a=[str(a[i]) for i in ok], b=[str(b[i]) for i in ok], want=[str(v) for v in torch.div(At, Bt, rounding_mode='trunc').tolist()]))
print(json.dumps(out))
