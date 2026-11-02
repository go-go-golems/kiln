"""A 0-d CUDA tensor operand is converted to the dimensioned operand's float16/bfloat16 dtype (CUDA
TensorIterator semantics, measured in integration Step 14); CPU 0-d tensors and Python numbers are not."""
import unittest
import torch
from fx_trace import trace_module
from fx_export import export_graph
from fx_import import import_graph


def script(module, *values):
    return import_graph(export_graph(trace_module(module), list(values)))['script']


class ZeroDimDeviceTests(unittest.TestCase):
    def test_dnlnet_in_place_divisions_narrow_cuda_constants(self):
        class M(torch.nn.Module):  # coverage family 40 (DNLNet), devices as in the source
            def forward(self, in_0):
                tmp_2 = torch.tensor(256, dtype=torch.float32, device=torch.device('cuda', 0)) ** torch.tensor(0.5, device=torch.device('cuda', 0))
                in_0 /= tmp_2
                tmp_3 = in_0
                tmp_3 /= torch.tensor(0.05, device=torch.device('cuda', 0))
                return (tmp_3.softmax(dim=-1),)
        text = script(M(), torch.randn(2, 3, 8).bfloat16())
        self.assertEqual(text.count('N.cast(v3, "bf16")'), 1, text)
        self.assertIn('N.div(v4, N.cast(v5, "bf16"))', text)

    def test_cpu_scalars_and_wide_results_are_not_narrowed(self):
        class M(torch.nn.Module):
            def forward(self, x, y):
                a = x * torch.tensor(0.05)            # CPU 0-d tensor: opmath float32 value
                b = x - 0.3                           # Python number
                c = y / torch.tensor(0.05, device='cuda')  # float32 result: no conversion
                return a, b, c
        text = script(M(), torch.randn(4).half(), torch.randn(4))
        self.assertNotIn('N.cast(v', text.split('return')[0].replace('N.cast(N.', ''))

    def test_moved_inputs_and_comparisons(self):
        class M(torch.nn.Module):
            def forward(self, x, s):
                t = torch.tensor(0.1).cuda()            # moved to CUDA
                u = torch.tensor(0.2).to('cuda')
                return x + t, x < u, u * x, x * s         # s: a 0-d input, a CUDA tensor in the evaluator
        text = script(M(), torch.randn(5).bfloat16(), torch.tensor(3.0))
        body = text.split('return')[0]
        for expected in ('N.add(v0, N.cast(v3, "bf16"))', 'N.lt(v0, N.cast(v5, "bf16"))', 'N.mul(N.cast(v5, "bf16"), v0)', 'N.mul(v0, N.cast(v1, "bf16"))'):
            self.assertIn(expected, body)


if __name__ == '__main__':
    unittest.main()
