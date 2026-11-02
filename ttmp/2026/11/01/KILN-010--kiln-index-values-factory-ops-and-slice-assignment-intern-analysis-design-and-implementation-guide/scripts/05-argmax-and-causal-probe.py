"""KILN-010 step 5: PyTorch reference behavior the argmax key and causal mask must reproduce (CPU).

Checks torch.max(x, dim) indices on ties and NaN rows against the design's key formula, and
is_causal=True SDPA against select(j <= i, s, -inf) for L < S, L == S, L > S.
"""
import math, torch
def key_argmax(x):
    n = x.shape[-1]; r = torch.arange(n)
    m = x.max(-1, keepdim=True).values
    key = torch.where(torch.isnan(x), r, torch.where(x == m, n + r, 2 * n))
    k = key.min(-1).values
    return torch.where(k < n, k, k - n)
x = torch.tensor([[1., 3., 3., 0.], [float('nan'), 2., float('nan'), 5.], [5., 2., float('nan'), 5.], [2., 2., 2., 2.]])
print('torch.max indices :', x.max(-1).indices.tolist())
print('torch.argmax      :', x.argmax(-1).tolist())
print('design key        :', key_argmax(x).tolist())
for L, S in [(3, 5), (4, 4), (5, 3)]:
    q, k, v = torch.randn(2, L, 8), torch.randn(2, S, 8), torch.randn(2, S, 8)
    ref = torch.nn.functional.scaled_dot_product_attention(q, k, v, is_causal=True)
    s = q @ k.transpose(-2, -1) / math.sqrt(8)
    i = torch.arange(L)[:, None]; j = torch.arange(S)[None, :]
    mine = torch.softmax(torch.where(j <= i, s, float('-inf')), -1) @ v
    print(f'causal L={L} S={S} max|diff| =', (ref - mine).abs().max().item())
