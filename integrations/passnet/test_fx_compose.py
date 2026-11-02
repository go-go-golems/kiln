"""Composed lowerings (fx_compose) and slice-3 integer graphs agree numerically with PyTorch on CPU:
both Kiln's frontend reference and its compiled Loop IR."""
import json
import math
import subprocess
import unittest
from pathlib import Path
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph
from fx_import import import_graph

HERE = Path(__file__).resolve().parent
KILN_DTYPE = {torch.float32: 'f32', torch.int64: 'i64', torch.int32: 'i32', torch.bool: 'bool'}


def run_kiln(model, inputs, attention='composed'):
    # JSON has no NaN or infinities: a non-finite input element travels as the string "NaN", "Infinity" or "-Infinity"
    imported = import_graph(export_graph(symbolic_trace(model), inputs))
    names = list(imported['inputs'])
    request = {'attention': attention, 'script': imported['script'], 'inputs': {n: {'shape': list(x.shape), 'dtype': KILN_DTYPE[x.dtype], 'data': [v if not isinstance(v, float) or math.isfinite(v) else {'inf': 'Infinity', '-inf': '-Infinity'}.get(str(v), 'NaN') for v in x.flatten().tolist()]} for n, x in zip(names, inputs)}}
    out = subprocess.run(['node', str(HERE / 'kiln_eval.mjs')], input=json.dumps(request), capture_output=True, text=True, check=True)
    result = json.loads(out.stdout)
    if result.get('error'): raise AssertionError(result['error'])
    return imported, result


class ComposeNumericTests(unittest.TestCase):
    def check(self, model, inputs, atol=1e-5, rtol=1e-5, attention='composed', attention_kernels=None):
        with torch.no_grad(): expected = model(*[x.clone() for x in inputs])
        expected = expected if isinstance(expected, tuple) else (expected,)
        imported, result = run_kiln(model, inputs, attention)
        if attention_kernels is not None: self.assertEqual(result['attention_kernels'], attention_kernels)
        keys = [k for k in result['frontend'] if not k.startswith('__mut')]
        self.assertEqual(len(keys), len(expected))
        for key, want in zip(keys, expected):
            for level in ('frontend', 'loop'):
                got = torch.tensor([float(v) for v in result[level][key]], dtype=torch.float64).reshape(want.shape)
                self.assertTrue(torch.allclose(got, want.to(torch.float64), atol=atol, rtol=rtol, equal_nan=True), f'{level} {key}: max diff {(got - want.to(torch.float64)).abs().max()}')
        return imported

    def test_norm_normalize_prelu(self):
        class Model(torch.nn.Module):
            def forward(self, x, w):
                return torch.functional.norm(x, dim=-1, keepdim=True), x.norm(dim=1), torch.nn.functional.normalize(x, p=2, dim=1), torch.prelu(x, w)
        torch.manual_seed(0)
        self.check(Model(), [torch.randn(2, 3, 5), torch.rand(3)])

    def test_einsum(self):
        class Model(torch.nn.Module):
            def forward(self, a, b, c):
                return torch.functional.einsum('bchj,bhwj->bchw', a, b), torch.functional.einsum('bchw,bchj->bhwj', a, c)
        torch.manual_seed(1)
        self.check(Model(), [torch.randn(2, 3, 4, 5), torch.randn(2, 4, 6, 5), torch.randn(2, 3, 4, 7)], atol=1e-4)

    def test_attention_with_masks(self):
        class Model(torch.nn.Module):
            def forward(self, q, k, v, additive, keep):
                f = torch.nn.functional.scaled_dot_product_attention
                return f(q, k, v, attn_mask=additive, dropout_p=0.0, is_causal=False), f(q, k, v, attn_mask=keep, dropout_p=0.0, is_causal=False)
        torch.manual_seed(2)
        keep = torch.rand(2, 1, 4, 6) > 0.3
        keep[..., 0] = True
        inputs = [torch.randn(2, 3, 4, 8), torch.randn(2, 3, 6, 8), torch.randn(2, 3, 6, 8), torch.randn(2, 1, 4, 6), keep]
        self.check(Model(), inputs, atol=1e-5, attention_kernels=0)
        # KILN-007: the importer's composition fuses into one recognized kernel per call, same numerics
        self.check(Model(), inputs, atol=1e-5, attention='fused', attention_kernels=2)
        # a fully masked row: PyTorch returns 0 (not NaN) on every CPU backend; the safe softmax matches it
        keep[0, 0, 2, :] = False
        additive = inputs[3].clone(); additive[1, 0, 3, :] = float('-inf')
        masked = [*inputs[:3], additive, keep]
        with torch.no_grad(): self.assertEqual(Model()(*masked)[1][0, :, 2].abs().max().item(), 0.0)
        for attention in ('composed', 'fused'): self.check(Model(), masked, atol=1e-5, attention=attention)

    def test_causal_attention(self):
        class Model(torch.nn.Module):
            def forward(self, q, k, v):
                return torch.nn.functional.scaled_dot_product_attention(q, k, v, is_causal=True)
        torch.manual_seed(4)
        for L, S in [(3, 5), (4, 4), (5, 3)]:
            inputs = [torch.randn(2, 2, L, 8), torch.randn(2, 2, S, 8), torch.randn(2, 2, S, 8)]
            imported = self.check(Model(), inputs, atol=1e-5)
            self.assertIn(f'N.causalMask({L}, {S})', imported['script'])
            # KILN-007 x KILN-010: the causal mask is an index value inside the recognized attention kernel
            self.check(Model(), inputs, atol=1e-5, attention='fused', attention_kernels=1)

    def test_argmax_indices_match_torch(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                return x.max(-1)[1], torch.min(x, 0, keepdim=True)[1], torch.argmax(x, 1), x.argmin(), torch.argmax(x, keepdim=True)
        x = torch.tensor([[1., 3., 3., 0.], [float('nan'), 2., float('nan'), 5.], [5., 2., float('nan'), 5.], [2., 2., 2., 2.]])
        self.check(Model(), [x], atol=0, rtol=0)
        self.check(Model(), [torch.randn(3, 4)], atol=0, rtol=0)

    def test_eval_dropout_is_identity(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                y = torch.nn.functional.dropout(x * 2, 0.2, False, True)
                return torch.nn.functional.dropout2d(y, 0.1, False, False) + 1
        self.check(Model(), [torch.randn(2, 3, 4, 4)])
        class Training(torch.nn.Module):
            def forward(self, x): return torch.nn.functional.dropout(x, 0.2, True)
        with self.assertRaisesRegex(ValueError, 'training=False'):
            import_graph(export_graph(symbolic_trace(Training()), [torch.randn(2, 3)]))

    def test_strided_slices_conv1d_nearest(self):
        class Model(torch.nn.Module):
            def forward(self, x, s, w, b, img):
                return (s[..., 1::2], s[..., ::2], torch.conv1d(x, w, b, (2,), (3,), (1,), 2),
                        torch.nn.functional.interpolate(img, size=(7, 10), mode='nearest'))
        torch.manual_seed(3)
        self.check(Model(), [torch.randn(2, 4, 11), torch.randn(2, 3, 9), torch.randn(6, 2, 5), torch.randn(6), torch.randn(1, 2, 5, 4)], atol=1e-5)

    def test_im2col(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                f = torch.nn.functional.unfold
                return f(x, kernel_size=(2, 2), stride=(2, 2)), f(x, kernel_size=(3, 2), stride=(1, 2), padding=1)
        self.check(Model(), [torch.randn(2, 3, 6, 8)])

    def test_integer_positions_match_torch(self):
        class Positions(torch.nn.Module):
            def forward(self, ids):
                mask = ids.ne(1).int()
                return (torch.cumsum(mask, dim=1).type_as(mask) * mask).long() + 1
        ids = torch.tensor([[5, 1, 1, 7, 2, 1], [1, 3, 3, 1, 1, 9]])
        self.check(Positions(), [ids], atol=0, rtol=0)
        # a long row (KILN-008): the scan's block-per-row mapping, exact against PyTorch
        self.check(Positions(), [torch.randint(0, 4, (2, 2048), generator=torch.Generator().manual_seed(8))], atol=0, rtol=0)

    def test_cumulative_ops_match_torch(self):
        class Cumulative(torch.nn.Module):
            def forward(self, x, ids):
                return (torch.cumprod(x, dim=1), torch.cummax(x, dim=0)[0], x.cummin(1)[0],
                        torch.cumprod(ids, 1), torch.cummax(ids, 1)[0], ids.cummin(0)[0])
        g = torch.Generator().manual_seed(8)
        x = torch.rand(40, 300, generator=g) * 0.2 + 0.9
        ids = torch.randint(-3, 4, (3, 50), generator=g)
        self.check(Cumulative(), [x, ids], atol=1e-5, rtol=1e-4)

    def test_cummax_indices_refuse(self):
        class Indices(torch.nn.Module):
            def forward(self, x):
                return torch.cummax(x, 1)[1]
        with self.assertRaisesRegex(ValueError, 'cummax/cummin indices'):
            run_kiln(Indices(), [torch.rand(2, 5)])

    def test_float_cumsum_long_axis_matches_torch(self):
        class Cumsum(torch.nn.Module):
            def forward(self, x):
                return torch.cumsum(x, dim=0) * 0.5 + torch.cumsum(x, dim=1)
        x = torch.rand(300, 40, generator=torch.Generator().manual_seed(8)) * 2 - 1
        self.check(Cumsum(), [x], atol=1e-4, rtol=1e-4)

    def test_integer_division_matches_torch(self):
        """KILN-011: //, %, trunc div, fmod, floor div and true division agree exactly on every sign."""
        class Division(torch.nn.Module):
            def forward(self, a, b):
                return (a // b, a % b, torch.div(a, b, rounding_mode='trunc'), torch.fmod(a, b),
                        torch.div(a, b, rounding_mode='floor'), a.remainder(b), a // 80, a % 16, -7 // b, a / b)
        # INT_MIN by -1 is excluded: PyTorch CPU's trunc division executes x86 idiv, which traps (SIGFPE)
        a = [7, -7, 7, -7, 0, 6, -6, 179, -1, 23999, -2**31, 2**31 - 1]
        b = [2, 2, -2, -2, 3, -3, 3, 80, 80, -7, 1, -1]
        for dtype in (torch.int64, torch.int32):
            self.check(Division(), [torch.tensor(a, dtype=dtype), torch.tensor(b, dtype=dtype)], atol=0, rtol=0)

    def test_float_division_matches_torch(self):
        """KILN-011 Phase 3: float32 and mixed int/float floor division, remainder, fmod, trunc division."""
        class Division(torch.nn.Module):
            def forward(self, x, y, i):
                return (x // y, x % y, torch.fmod(x, y), torch.div(x, y, rounding_mode='trunc'), x // 2, i // 2.5, i % 0.75,
                        torch.floor(i), torch.div(i, y, rounding_mode='floor'))
        torch.manual_seed(5)
        x = torch.randn(64) * 10
        y = torch.randn(64) * 3
        y[:4] = torch.tensor([0.1, -0.1, 1.0, -2.0]); x[:4] = torch.tensor([1.0, 1.0, -2.0, 6.0])
        i = torch.randint(-1000, 1000, (64,))
        self.check(Division(), [x, y, i], atol=0, rtol=0)


if __name__ == '__main__':
    unittest.main()
