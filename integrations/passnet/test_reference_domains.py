import unittest
import torch
from fx_trace import trace_module
from reference_domains import constraints_for_graph, attach_reference_data


class ReferenceDomainTests(unittest.TestCase):
    def test_variance_follows_canonical_binding_through_views(self):
        class Model(torch.nn.Module):
            def forward(self, mean, variance, x):
                return torch.nn.functional.batch_norm(x, mean, variance.reshape(-1).float(), training=False)
        traced=trace_module(Model())
        constraints=constraints_for_graph(traced,['v1','v2','v0'])
        self.assertEqual(constraints,[{'input':'v2','kind':'positive','offset':0.1}])

    def test_arithmetic_is_not_assumed_to_preserve_variance_sign(self):
        class Model(torch.nn.Module):
            def forward(self, x, mean, variance):
                return torch.nn.functional.batch_norm(x, mean, -variance, training=False)
        with self.assertRaisesRegex(ValueError,'Cannot establish'):
            constraints_for_graph(trace_module(Model()))

    def test_reference_setup_uses_project_data_without_changing_program(self):
        script='project("test").program(({v0})=>({out:v0}),{v0:k.tensor([3])});\n'
        self.assertEqual(attach_reference_data(script,{'v0':[3]},[]),script)
        configured=attach_reference_data(script,{'v0':[3]},[{'input':'v0','kind':'positive','offset':0.1}])
        self.assertIn(script,configured)
        self.assertIn('passnetProject.data(passnetReferenceInputs)',configured)
        with self.assertRaisesRegex(ValueError,'Unsupported'):
            attach_reference_data(script,{'v0':[3]},[{'input':'v1','kind':'positive','offset':0.1}])
