import unittest
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph


class ExportTests(unittest.TestCase):
    def test_broadcast_metadata_and_nested_outputs(self):
        class Model(torch.nn.Module):
            def forward(self, x, y):
                z = torch.relu(x) + y
                return {"result": (z, x)}
        result = export_graph(symbolic_trace(Model()), (torch.randn(2, 3), torch.randn(3)))
        add = next(n for n in result['nodes'] if n['target'] == '_operator.add')
        self.assertEqual(add['tensor_meta']['shape'], [2, 3])
        self.assertEqual(add['tensor_meta']['strides'], [3, 1])
        output = result['nodes'][-1]['args']['tuple'][0]['dict']['result']['tuple']
        self.assertEqual(output, [{'ref': add['id']}, {'ref': 'x'}])

    def test_constant_attributes_rejected(self):
        class Model(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.register_buffer('weight', torch.ones(3))
            def forward(self, x):
                return x + self.weight
        with self.assertRaisesRegex(ValueError, 'get_attr'):
            export_graph(symbolic_trace(Model()), (torch.ones(3),))


if __name__ == '__main__':
    unittest.main()
