"""KILN-010: factory calls survive tracing, slice assignment and in-place writes through basic views are
functional assignments, and every lowering agrees with eager PyTorch on CPU (frontend reference and
compiled Loop IR)."""
import json
import operator
import subprocess
import unittest
from pathlib import Path
import torch
from corpus import eliminate_dead_code
from fx_trace import trace_module
from fx_export import export_graph
from fx_import import import_graph

HERE = Path(__file__).resolve().parent
KILN_DTYPE = {torch.float32: 'f32', torch.int64: 'i64', torch.int32: 'i32', torch.bool: 'bool'}


def imported(model, inputs):
    traced = trace_module(model); eliminate_dead_code(traced.graph)
    return import_graph(export_graph(traced, inputs))


def run(model, inputs):
    result = imported(model, inputs)
    request = {'script': result['script'], 'inputs': {n: {'shape': list(x.shape), 'dtype': KILN_DTYPE[x.dtype], 'data': x.flatten().tolist()} for n, x in zip(result['inputs'], inputs)}}
    out = json.loads(subprocess.run(['node', str(HERE / 'kiln_eval.mjs')], input=json.dumps(request), capture_output=True, text=True, check=True).stdout)
    if out.get('error'): raise AssertionError(out['error'])
    return result, out


class FactoryTests(unittest.TestCase):
    def check(self, model, inputs, exact=True):
        with torch.no_grad(): want = model(*[x.clone() for x in inputs])
        want = want if isinstance(want, tuple) else (want,)
        result, out = run(model, inputs)
        keys = [k for k in out['frontend'] if not k.startswith('__mut')]
        self.assertEqual(len(keys), len(want))
        for key, w in zip(keys, want):
            for level in ('frontend', 'loop'):
                got = torch.tensor(out[level][key], dtype=torch.float64).reshape(w.shape)
                ok = torch.equal(got, w.to(torch.float64)) if exact else torch.allclose(got, w.to(torch.float64), atol=1e-5)
                self.assertTrue(ok, f'{level} {key}: {got} vs {w}')
        return result

    def test_tracer_keeps_factories_and_setitem(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                t = torch.zeros(3, 4, dtype=torch.int64)
                t[1] = torch.arange(4)
                return x + t
        graph = trace_module(Model()).graph
        targets = [n.target for n in graph.nodes if n.op == 'call_function']
        self.assertIn(torch.zeros, targets); self.assertIn(torch.arange, targets); self.assertIn(operator.setitem, targets)
        self.assertFalse(any(n.op == 'get_attr' for n in graph.nodes))
        self.check(Model(), [torch.randn(3, 4)], exact=False)

    def test_factory_patch_is_restored_after_a_failing_trace(self):
        original = torch.arange
        class Broken(torch.nn.Module):
            def forward(self, x): raise RuntimeError('boom')
        with self.assertRaises(RuntimeError): trace_module(Broken())
        self.assertIs(torch.arange, original)

    def test_arange_full_like_meshgrid_repeat(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                a = torch.arange(2, 11, 3)
                i, j = torch.functional.meshgrid(torch.arange(3), torch.arange(4), indexing='ij')
                p, q = torch.meshgrid(torch.arange(3), torch.arange(4), indexing='xy')
                r = (i - j).repeat(2, 1) + (p * q).repeat_interleave(2, dim=1).sum(-1, keepdim=True)[:1]
                return a, torch.stack((i, j)).flatten(1), r, (p * q).repeat_interleave(2, dim=1), torch.full_like(x, 7), x.new_zeros((2, 3)), torch.ones(2, dtype=torch.int32), torch.full((2,), 1.5)
        self.check(Model(), [torch.randn(2, 3)])

    def test_setitem_and_inplace_through_views(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                t = torch.arange(24).view(2, 3, 4).permute(1, 2, 0).contiguous()   # a copy: fresh storage
                v = t[:, :, 0]
                v += 100
                t[:, :, 0] = v
                w = t[1:, ::2, 1]
                w *= -1
                z = torch.zeros(5, 5, dtype=torch.int64)
                z[1:, 1:] = t.sum(-1)[:, :4].repeat(2, 1)[:4]
                z[0, :] = 7
                z[:, 0] = 8
                z[0, 0] = 9
                y = x * 1
                y[..., 1::2] = 0.5
                return t, z.view(-1), y, v
        result = self.check(Model(), [torch.randn(3, 4)])
        self.assertIn('N.assign(', result['script'])

    def test_write_through_untracked_alias_is_refused(self):
        class Permuted(torch.nn.Module):
            def forward(self, x):
                t = torch.zeros(3, 4)
                p = t.permute(1, 0)
                p[0] = 1
                return t
        with self.assertRaisesRegex(ValueError, 'fresh unaliased'):
            imported(Permuted(), [torch.randn(2)])
        class AliasedView(torch.nn.Module):
            def forward(self, x):
                t = torch.zeros(3, 4)
                v = t[0]
                u = v.view(2, 2)
                v += 1
                return t, u
        with self.assertRaisesRegex(ValueError, 'fresh unaliased'):
            imported(AliasedView(), [torch.randn(2)])

    def test_contiguous_of_contiguous_is_an_alias(self):
        class Live(torch.nn.Module):
            def forward(self, x):
                s = x + 1
                t = s.contiguous()
                t += 1
                return t, s
        # contiguous of a row-major tensor aliases it; s is read after the write, so the write is refused
        with self.assertRaisesRegex(ValueError, 'fresh unaliased'):
            imported(Live(), [torch.randn(2, 3)])
        class Dead(torch.nn.Module):
            def forward(self, x):
                t = (x + 1).contiguous()
                t += 1
                return t
        # nothing reads (x + 1) after the write: updating its alias in place is a rebinding
        self.check(Dead(), [torch.randn(2, 3)])

    def test_integer_relative_buckets(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                rel = torch.arange(7, dtype=torch.int64)[None, :] - torch.arange(7, dtype=torch.int64)[:, None]
                n = -rel
                ret = (n < 0).to(torch.int64) * 16
                a = torch.abs(n)
                large = 8 + (torch.log(a.float() / 8) / 2.772588722239781 * 8).to(torch.int64)
                large = torch.min(large, torch.full_like(large, 15))
                ret += torch.where(a < 8, a, large)
                return ret, rel ** 2
        self.check(Model(), [torch.randn(1)])


if __name__ == '__main__':
    unittest.main()
