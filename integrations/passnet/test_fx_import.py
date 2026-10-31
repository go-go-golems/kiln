import unittest
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph
from fx_import import import_graph

class ImportTests(unittest.TestCase):
    def test_relu_add_roundtrip_structure(self):
        class Model(torch.nn.Module):
            def forward(self, x, y):
                return (torch.relu(x) + y, [x])
        graph = export_graph(symbolic_trace(Model()), (torch.randn(2,3), torch.randn(3)))
        lowered = import_graph(graph)
        self.assertIn('N.relu', lowered['script'])
        self.assertIn('N.add', lowered['script'])
        self.assertEqual(lowered['output_structure'], {'tuple':[{'output':'out0'}, {'list':[{'output':'out1'}]}]})

    def test_dtype_and_layout_rejected(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                return torch.relu(x)
        for x in [torch.randn(2,3,dtype=torch.float16), torch.randn(2,3).t()]:
            with self.assertRaises(ValueError):
                import_graph(export_graph(symbolic_trace(Model()), (x,)))

if __name__ == '__main__':
    unittest.main()
