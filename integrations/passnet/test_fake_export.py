import unittest
import torch
from torch.fx import symbolic_trace
from torch._subclasses.fake_tensor import FakeTensorMode
from fx_export import export_graph
from fx_import import import_graph


class FakeExportTests(unittest.TestCase):
    def test_fake_and_real_metadata_lower_identically(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                return x.permute(0,2,1).contiguous().half().mean((-1,0))
        real = export_graph(symbolic_trace(Model()), (torch.randn(2,3,4),))
        mode = FakeTensorMode()
        with mode:
            value = torch.empty(2,3,4)
        fake = export_graph(symbolic_trace(Model()), (value,), fake_mode=mode)
        self.assertEqual(real, fake)
        self.assertEqual(import_graph(real), import_graph(fake))
