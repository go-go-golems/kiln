"""Composed lowerings (fx_compose) and slice-3 integer graphs agree numerically with PyTorch on CPU:
both Kiln's frontend reference and its compiled Loop IR."""
import json
import subprocess
import unittest
from pathlib import Path
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph
from fx_import import import_graph

HERE = Path(__file__).resolve().parent
KILN_DTYPE = {torch.float32: 'f32', torch.int64: 'i64', torch.int32: 'i32', torch.bool: 'bool'}


def run_kiln(model, inputs):
    # JSON has no NaN: a NaN input element travels as null
    imported = import_graph(export_graph(symbolic_trace(model), inputs))
    names = list(imported['inputs'])
    request = {'script': imported['script'], 'inputs': {n: {'shape': list(x.shape), 'dtype': KILN_DTYPE[x.dtype], 'data': [None if v != v else v for v in x.flatten().tolist()]} for n, x in zip(names, inputs)}}
    out = subprocess.run(['node', str(HERE / 'kiln_eval.mjs')], input=json.dumps(request), capture_output=True, text=True, check=True)
    result = json.loads(out.stdout)
    if result.get('error'): raise AssertionError(result['error'])
    return imported, result


class ComposeNumericTests(unittest.TestCase):
    def check(self, model, inputs, atol=1e-5, rtol=1e-5):
        with torch.no_grad(): expected = model(*[x.clone() for x in inputs])
        expected = expected if isinstance(expected, tuple) else (expected,)
        imported, result = run_kiln(model, inputs)
        keys = [k for k in result['frontend'] if not k.startswith('__mut')]
        self.assertEqual(len(keys), len(expected))
        for key, want in zip(keys, expected):
            for level in ('frontend', 'loop'):
                got = torch.tensor(result[level][key], dtype=torch.float64).reshape(want.shape)
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
        self.check(Model(), [torch.randn(2, 3, 4, 8), torch.randn(2, 3, 6, 8), torch.randn(2, 3, 6, 8), torch.randn(2, 1, 4, 6), keep], atol=1e-5)

    def test_causal_attention(self):
        class Model(torch.nn.Module):
            def forward(self, q, k, v):
                return torch.nn.functional.scaled_dot_product_attention(q, k, v, is_causal=True)
        torch.manual_seed(4)
        for L, S in [(3, 5), (4, 4), (5, 3)]:
            imported = self.check(Model(), [torch.randn(2, 2, L, 8), torch.randn(2, 2, S, 8), torch.randn(2, 2, S, 8)], atol=1e-5)
            self.assertIn(f'N.causalMask({L}, {S})', imported['script'])

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


if __name__ == '__main__':
    unittest.main()
