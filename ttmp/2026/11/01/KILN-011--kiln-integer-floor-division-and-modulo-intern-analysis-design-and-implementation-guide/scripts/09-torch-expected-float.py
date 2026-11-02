"""KILN-011 Phase 3: PyTorch CPU float32 results of //, %, fmod and div(rounding_mode='trunc') as raw
float32 bit patterns (signed zeros and NaNs survive). Writes JSON to stdout."""
import json, random, torch
random.seed(12)
special = [0.0, -0.0, 1.0, -1.0, 0.1, -0.1, 2.0, -2.0, 0.5, 3.0, -3.0, 1e-30, -1e-30, 1e30, -1e30, 7.0, -7.0,
           float('inf'), float('-inf'), float('nan'), 16777217.0, 3.4e38, -3.4e38, 1e-45]
a, b = [], []
for x in special:
    for y in special: a.append(x); b.append(y)
for _ in range(100000):
    def draw():
        r = random.random()
        if r < 0.4: return random.uniform(-10, 10)
        if r < 0.7: return random.choice([-1, 1]) * 10 ** random.uniform(-8, 8)
        if r < 0.9: return float(random.randint(-1000, 1000)) / random.choice([1, 2, 4, 10, 3])
        return random.choice(special)
    a.append(draw()); b.append(draw())
A, B = torch.tensor(a, dtype=torch.float32), torch.tensor(b, dtype=torch.float32)
bits = lambda t: t.view(torch.int32).tolist()
out = {'a': bits(A), 'b': bits(B), 'floordiv': bits(A // B), 'remainder': bits(A % B), 'fmod': bits(torch.fmod(A, B)),
       'truncdiv': bits(torch.div(A, B, rounding_mode='trunc')), 'naive_floor': bits(torch.floor(A / B))}
print(json.dumps(out))
