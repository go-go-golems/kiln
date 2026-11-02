import copy
import unittest
import torch
from fx_export import export_graph
from fx_import import import_graph


class MaxPoolModel(torch.nn.Module):
    def __init__(self, aten=False):
        super().__init__()
        self.aten = aten

    def forward(self, x):
        if self.aten:
            return torch.ops.aten.max_pool2d.default(x, [3, 2], [], [1, 1], [2, 1], True)
        return torch.nn.functional.max_pool2d(input=x, kernel_size=(3, 2), padding=(1, 1), dilation=(2, 1), ceil_mode=True)


class MaxPoolTests(unittest.TestCase):
    def graph(self, aten=False, dtype=torch.float32):
        return export_graph(torch.fx.symbolic_trace(MaxPoolModel(aten)), (torch.randn(1, 2, 5, 7).to(dtype),))

    def test_equivalent_calls_and_dtypes(self):
        for dtype in [torch.float32, torch.float16, torch.bfloat16]:
            a = import_graph(self.graph(False, dtype))['script']
            b = import_graph(self.graph(True, dtype))['script']
            self.assertEqual(a, b)
            self.assertIn('N.maxPool2d', a)

    def test_metadata_and_parameters(self):
        graph = self.graph()
        for update in [{'shape': [1, 2, 1, 1]}, {'dtype': 'torch.float16'}]:
            g = copy.deepcopy(graph)
            g['nodes'][1]['tensor_meta'].update(update)
            with self.assertRaisesRegex(ValueError, 'shape/dtype'):
                import_graph(g)
        for key, value in [('dilation', 0), ('padding', 2), ('ceil_mode', 1), ('return_indices', True)]:
            g = copy.deepcopy(graph)
            g['nodes'][1]['kwargs']['dict'][key] = value
            with self.assertRaisesRegex(ValueError, 'max_pool2d'):
                import_graph(g)


if __name__ == '__main__':
    unittest.main()
