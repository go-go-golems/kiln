import unittest
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph
from fx_import import import_graph


class LayerNormImportTests(unittest.TestCase):
    def test_multiple_normalized_dimensions_and_opmath(self):
        class Model(torch.nn.Module):
            def forward(self,x,w,b):return torch.nn.functional.layer_norm(x,(3,4),w,b,1e-5)
        for dtype,name in [(torch.float32,'f32'),(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
            inputs=[torch.randn(shape).to(dtype) for shape in [(2,3,4),(3,4),(3,4)]]
            result=import_graph(export_graph(symbolic_trace(Model()),inputs))
            self.assertIn('N.layer_norm',result['script']);self.assertIn('[2, 12]',result['script'])
            self.assertIn('N.reshape(N.cast(v1, "f32"), [12])',result['script'])
            self.assertIn('"'+name+'")',result['script'])

    def test_optional_affine_and_fresh_result(self):
        class Model(torch.nn.Module):
            def forward(self,x):
                value=torch.nn.functional.layer_norm(x,(4,))
                return torch.nn.functional.relu(value,inplace=True)
        result=import_graph(export_graph(symbolic_trace(Model()),[torch.randn(2,4)]))
        self.assertIn('N.const(1, [4])',result['script']);self.assertIn('N.const(0, [4])',result['script'])
        self.assertIn('N.relu',result['script'])

    def test_invalid_source_contracts_are_explicit(self):
        class Model(torch.nn.Module):
            def forward(self,x,w,b):return torch.nn.functional.layer_norm(x,(4,),w,b)
        original=export_graph(symbolic_trace(Model()),[torch.randn(2,4),torch.randn(4),torch.randn(4)])
        import copy
        graph=copy.deepcopy(original);node=next(n for n in graph['nodes'] if n.get('target')=='torch.nn.functional.layer_norm')
        node['kwargs']['dict']['eps']=-1
        with self.assertRaisesRegex(ValueError,'epsilon'):import_graph(graph)
        graph=copy.deepcopy(original);graph['nodes'][1]['tensor_meta']['dtype']='torch.float16'
        with self.assertRaisesRegex(ValueError,'matching shape/dtype'):import_graph(graph)
        graph=copy.deepcopy(original);node=next(n for n in graph['nodes'] if n.get('target')=='torch.nn.functional.layer_norm')
        node['args']['tuple'][1]={'tuple':[3]}
        with self.assertRaisesRegex(ValueError,'trailing input dimensions'):import_graph(graph)
