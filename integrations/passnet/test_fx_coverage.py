"""Coverage wave: device-agnostic metadata propagation, in-place rebinding and the fx_coverage lowerings agree
with eager PyTorch on CPU at the frontend reference and the compiled Loop IR."""
import json
import subprocess
import unittest
from pathlib import Path
import torch
import torch.nn.functional as F
from corpus import eliminate_dead_code, expose_inplace_results
from fx_trace import trace_module
from fx_export import export_graph, propagation_copy
from fx_import import import_graph

HERE = Path(__file__).resolve().parent
KILN = {torch.float32: 'f32', torch.float16: 'f16', torch.bfloat16: 'bf16', torch.int64: 'i64', torch.int32: 'i32', torch.bool: 'bool'}
CUDA = torch.device('cuda', 0)


def imported(model, inputs):
    traced = trace_module(model); eliminate_dead_code(traced.graph); expose_inplace_results(traced.graph)
    return traced, import_graph(export_graph(traced, inputs))


def encode(v):
    if v.dtype.is_floating_point: return [x if x == x and abs(x) != float('inf') else str(x).replace('inf', 'Infinity').replace('nan', 'NaN') for x in v.float().flatten().tolist()]
    return v.flatten().tolist()


class CoverageTests(unittest.TestCase):
    def setUp(self): torch.manual_seed(0)

    def check(self, model, inputs, atol=0.0):
        """Eager PyTorch (on the single-device CPU copy of the traced graph) against both Kiln levels;
        mutated inputs are compared too."""
        traced, result = imported(model, inputs)
        eager, _ = propagation_copy(traced, torch.device('cpu'))
        clones = [x.clone() for x in inputs]
        with torch.no_grad(): want = eager(*clones)
        want = list(want) if isinstance(want, (tuple, list)) else [want]
        request = {'script': result['script'], 'inputs': {n: {'shape': list(x.shape), 'dtype': KILN[x.dtype], 'data': encode(x)} for n, x in zip(result['inputs'], inputs)}}
        out = json.loads(subprocess.run(['node', str(HERE / 'kiln_eval.mjs')], input=json.dumps(request), capture_output=True, text=True, check=True).stdout)
        if out.get('error'): raise AssertionError(out['error'])
        pairs = []
        def walk(s, v):
            if 'output' in s: pairs.append((s['output'], v))
            elif 'input_alias' in s: pairs.append((f'__mut{s["input_alias"]}', v))
            else:
                for a, b in zip(next(iter(s.values())), v): walk(a, b)
        walk(result['output_structure'], want if set(result['output_structure']) & {'tuple', 'list'} else want[0])
        pairs += [(m['output'], clones[m['input_index']]) for m in result['input_mutations']]
        for key, w in pairs:
            for level in ('frontend', 'loop'):
                got = torch.tensor([float(x) for x in out[level][key]], dtype=torch.float64).reshape(w.shape)
                ref = w.to(torch.float64)
                same = (got == ref) | (got.isnan() & ref.isnan()) | ((got - ref).abs() <= atol)
                self.assertTrue(bool(same.all()), f'{level} {key}: max diff {float((got - ref).abs().nan_to_num().max())}\n{got}\n{ref}')
        return result

    # ------------------------------------------------------------------ device-agnostic propagation
    def test_cuda_moves_and_factories_propagate_on_a_cpu_host(self):
        class Model(torch.nn.Module):
            def forward(self, x, ids):
                ones = torch.ones((1, 3), dtype=torch.int64, device=torch.device('cuda', 0))
                pos = torch.cumsum(ones, dim=1) - ones
                pos += 1
                y = x.to(CUDA) + torch.tensor(0.5, device=CUDA)
                mask = ids.to(device=CUDA, dtype=torch.bool)
                return y.cuda(), pos, mask, torch.arange(3, device=CUDA)
        self.check(Model(), [torch.randn(2, 3), torch.tensor([0, 1, 1])])

    def test_propagation_copy_keeps_the_exported_graph(self):
        class Model(torch.nn.Module):
            def forward(self, x): return x.to(torch.device('cuda', 0)) * 2
        traced = trace_module(Model())
        exported = export_graph(traced, [torch.randn(2)])
        to = next(n for n in exported['nodes'] if n['target'] == 'to')
        self.assertEqual(to['args']['tuple'][1], {'device': 'cuda:0'})
        self.assertEqual(to['tensor_meta']['shape'], [2])

    def test_to_with_copy_and_dtype(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                y = x.to(device=CUDA, copy=True)
                y += 1
                return y, x.to(CUDA, torch.float16)
        self.check(Model(), [torch.randn(2, 3)])

    # ------------------------------------------------------------------ in-place rebinding
    def test_cast_result_is_fresh(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                m = (x > 0).to(torch.float32)
                m *= -3.0
                return m
        self.check(Model(), [torch.randn(2, 3)])

    def test_chained_input_mutations_and_earlier_reads(self):
        class Model(torch.nn.Module):
            def forward(self, x, y, z):
                s = x.sum(dim=-1, keepdim=True)
                x /= s
                t = x
                t += y
                return F.relu(t, inplace=True), z * 2
        # a row sum may round differently (summation order): 1e-6
        result = self.check(Model(), [torch.rand(2, 3) + 0.5, torch.randn(2, 3), torch.randn(2)], atol=1e-6)
        self.assertEqual(result['input_mutations'], [{'input_index': 0, 'output': '__mut0'}])

    def test_inplace_on_a_view_of_a_dead_fresh_value(self):
        class Model(torch.nn.Module):
            def forward(self, w):
                ids = torch.arange(0, 3, dtype=torch.int64).unsqueeze(0)
                ids += 2
                return w.index_select(0, ids.view(-1))
        self.check(Model(), [torch.randn(6, 4)])

    # ------------------------------------------------------------------ factories and scalars
    def test_tensor_literal_and_tensor_exponent(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                scale = torch.tensor(256, dtype=torch.float32) ** torch.tensor(0.5)
                x /= scale
                return 1.0 - x, torch.tensor(3), torch.tensor(True)
        self.check(Model(), [torch.randn(2, 3)])

    def test_linspace(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                return x * torch.linspace(0, 4, steps=5), torch.linspace(-1.5, 2.25, 7), torch.linspace(0.1, 0.7, steps=10)
        self.check(Model(), [torch.randn(2, 5)])

    def test_pow_roots_and_infinity(self):
        class Model(torch.nn.Module):
            def forward(self, d, x):
                r = d.pow_(-0.5)
                r.masked_fill_(r == float('inf'), 0)
                return r, x.pow(0.5), x.pow(-1)
        # rsqrt/sqrt/reciprocal: Kiln's CPU reference rounds the double result once (PyTorch CPU may differ by 1 ulp)
        self.check(Model(), [torch.tensor([0.0, 1.0, 4.0, 2.0]), torch.rand(4) + 0.1], atol=1e-6)

    # ------------------------------------------------------------------ fx_coverage
    def test_tensor_methods_attributes_and_copies(self):
        class Model(torch.nn.Module):
            def forward(self, x, y):
                return x.exp(), x.abs().sqrt(), x.tanh(), torch.matmul(x, y).T, y.mT, x.clone(), x.tile([2]), y.tile([1, 2, 1])
        self.check(Model(), [torch.randn(3, 4), torch.randn(2, 4, 5)], atol=1e-6)

    def test_fill_through_views_and_on_fresh_values(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                m = torch.zeros((1, 6, 6))
                m[:, -2:, :].fill_(1)
                m[:, :, -3:].fill_(2)
                t = x + 1
                t.fill_(0.25)
                return m.reshape(1, 36) - 1, t
        self.check(Model(), [torch.randn(2, 3)])

    def test_triangles_masks_and_reductions(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                full = torch.full((5, 5), -3.4028234663852886e+38, dtype=torch.float32)
                up = torch.triu(full, diagonal=1)
                b = x == 0
                return up, torch.tril(x, -1), torch.triu(x), torch.all(b, dim=-1, keepdim=True), ~torch.any(b, dim=0), torch.all(b)
        x = torch.randint(0, 2, (4, 5)).float()
        self.check(Model(), [x])

    def test_tensor_split(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                a, b = x.tensor_split(2, -1)
                c, d, e = torch.tensor_split(x, 3, dim=1)
                f, g = x.tensor_split([1], 0)
                return a * b, c, d + 1, e, f, g
        self.check(Model(), [torch.randn(3, 8)])

    def test_conv3d_patches(self):
        class Model(torch.nn.Module):
            def forward(self, x, w, b): return torch.conv3d(x, w, b, (2, 2, 3), (0, 0, 0), (1, 1, 1), 1).flatten(2).transpose(1, 2)
        self.check(Model(), [torch.randn(2, 3, 4, 4, 6), torch.randn(5, 3, 2, 2, 3), torch.randn(5)], atol=1e-5)
        with self.assertRaisesRegex(ValueError, 'non-overlapping conv3d'):
            imported(Model(), [torch.randn(1, 3, 3, 4, 6), torch.randn(5, 3, 2, 2, 3), torch.randn(5)])

    def test_conv3d_low_precision_narrows_before_the_bias(self):
        class Model(torch.nn.Module):
            def forward(self, x, w, b): return torch.conv3d(x, w, b, (2, 2, 2), (0, 0, 0), (1, 1, 1), 1)
        script = imported(Model(), [torch.randn(1, 2, 2, 4, 4).half(), torch.randn(3, 2, 2, 2, 2).half(), torch.randn(3).half()])[1]['script']
        self.assertIn('N.add(N.cast(', script)

    def test_avg_pool1d(self):
        class Model(torch.nn.Module):
            def forward(self, x): return torch.avg_pool1d(x, (2,), (2,), (0,), False, True), F.avg_pool1d(x, 3, 1, 1)
        self.check(Model(), [torch.randn(2, 3, 9)], atol=1e-6)

    def test_same_size_interpolation_is_the_input(self):
        class Model(torch.nn.Module):
            def forward(self, x): return F.interpolate(x, size=(5, 4), mode='bicubic', align_corners=False), F.interpolate(x, size=(5, 4), mode='bilinear', align_corners=False)
        self.check(Model(), [torch.randn(1, 2, 5, 4)])
        class Resize(torch.nn.Module):
            def forward(self, x): return F.interpolate(x, size=(6, 4), mode='bicubic', align_corners=False)
        with self.assertRaisesRegex(ValueError, 'only explicit-size'):
            imported(Resize(), [torch.randn(1, 2, 5, 4)])

    def test_multi_head_attention_forward(self):
        E, h = 8, 2
        class Model(torch.nn.Module):
            def forward(self, x, w_out, b_out, b_in, w_in):
                out = F.multi_head_attention_forward(x, x, x, E, h, w_in, b_in, None, None, False, 0.0, w_out, b_out, training=False,
                                                     key_padding_mask=None, need_weights=True, attn_mask=None, average_attn_weights=True, is_causal=False)
                return out[0]
        self.check(Model(), [torch.randn(5, 2, E), torch.randn(E, E), torch.randn(E), torch.randn(3 * E), torch.randn(3 * E, E)], atol=3e-5)


if __name__ == '__main__':
    unittest.main()
