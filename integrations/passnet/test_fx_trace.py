import unittest
import operator
import torch
from fx_trace import trace_module
from fx_export import export_graph
from fx_import import import_graph


class MutationTraceTests(unittest.TestCase):
    def test_owned_iadd_keeps_identity_and_can_be_functionalized(self):
        class Model(torch.nn.Module):
            def forward(self,x,y):
                value=x+y
                value+=y
                return value
        model=trace_module(Model());self.assertTrue(any(n.target is operator.iadd for n in model.graph.nodes))
        self.assertIn('N.add',import_graph(export_graph(model,[torch.randn(2,3),torch.randn(2,3)]))['script'])

    def test_input_mutation_and_alias_observer_rejected(self):
        class Input(torch.nn.Module):
            def forward(self,x,y):
                x+=y
                return x
        class Alias(torch.nn.Module):
            def forward(self,x,y):
                value=x+y;observer=value.view(2,3)
                value+=y
                return value,observer
        for cls in [Input,Alias]:
            with self.assertRaisesRegex(ValueError,'fresh single-use'):
                import_graph(export_graph(trace_module(cls()),[torch.randn(2,3),torch.randn(2,3)]))

    def test_unimplemented_inplace_operator_not_silently_lowered(self):
        class Model(torch.nn.Module):
            def forward(self,x,y):
                value=x+y
                value**=y
                return value
        model=trace_module(Model());self.assertTrue(any(n.target is operator.ipow for n in model.graph.nodes))
        with self.assertRaisesRegex(ValueError,'unsupported target _operator.ipow'):
            import_graph(export_graph(model,[torch.rand(2,3),torch.rand(2,3)]))
