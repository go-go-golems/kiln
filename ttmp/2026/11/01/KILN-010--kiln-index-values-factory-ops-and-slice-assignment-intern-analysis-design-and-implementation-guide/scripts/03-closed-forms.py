"""KILN-010 step 4: are the folded constants closed-form functions of their coordinates?

Evaluates each family's model.py eagerly on CPU, then compares the factory output to a closed form
written only with coordinate arithmetic (+, *, floor /, %, comparisons, select), the operations an
index-value node over Kiln's IX algebra can express. Usage: python3 03-closed-forms.py REPO_ROOT
"""
import importlib.util, sys, pathlib, torch
root = pathlib.Path(sys.argv[1])
U = root / 'ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations/sources/upstream/graphs/hf_subgraphs_v2/fusible_subgraphs/float32/9/samples'
def load(path):
    spec = importlib.util.spec_from_file_location('m', path); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m.GraphModule()

# BEiT-base 384: W = 24 window, out[p, q] over 577 x 577, flattened
beit = load(U / 'transformers-auto-model/microsoft_beit-base-patch16-384/_decomposed/microsoft_beit-base-patch16-384_start23_end52_2/model.py')
_, idx = beit(torch.zeros(1, 1, 768), torch.zeros(1, 1, 768))
W, N = 24, 577
p = torch.arange(N)[:, None]; q = torch.arange(N)[None, :]
i, j = p - 1, q - 1
inner = ((i // W - j // W) + (W - 1)) * (2 * W - 1) + ((i % W - j % W) + (W - 1))
closed = torch.where((p == 0) & (q == 0), 2211, torch.where(q == 0, 2210, torch.where(p == 0, 2209, inner)))
print('beit  equal:', torch.equal(idx, closed.reshape(-1)), idx.dtype, tuple(idx.shape))

# ConViT-tiny: out[0, a, b, c], a, b in [0, 196), 14 x 14 grid
convit = load(U / 'timm/convit_tiny/_decomposed/convit_tiny_start6_end25_1/model.py')
pos, _ = convit(torch.zeros(192), torch.ones(192), torch.zeros(1, 196, 192))
a = torch.arange(196)[:, None]; b = torch.arange(196)[None, :]
dx = b % 14 - a % 14; dy = b // 14 - a // 14
closed = torch.stack([dx, dy, dx * dx + dy * dy], -1)[None].float()
print('convit equal:', torch.equal(pos, closed), pos.dtype, tuple(pos.shape))
