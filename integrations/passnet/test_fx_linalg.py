import unittest
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph
from fx_import import import_graph
from fx_linalg import lower_linalg


class MatrixImportTests(unittest.TestCase):
    def test_vectors_and_broadcast_in_both_directions(self):
        class Model(torch.nn.Module):
            def forward(self,a,b):return a@b
        for a,b in [((3,),(3,)),((3,),(2,3,4)),((2,4,3),(3,)),((2,1,4,3),(1,5,3,6)),((4,3),(2,3,6))]:
            imported=import_graph(export_graph(symbolic_trace(Model()),[torch.randn(a),torch.randn(b)]))
            self.assertIn('N.matmul',imported['script'])

    def test_linear_storage_boundaries_and_vector_weight(self):
        class Model(torch.nn.Module):
            def forward(self,x,w,b):return torch.nn.functional.linear(x,w,b)
        for dtype,name in [(torch.float32,'f32'),(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
            for weight,bias in [((4,3),(4,))]:
                imported=import_graph(export_graph(symbolic_trace(Model()),[torch.randn(2,3).to(dtype),torch.randn(weight).to(dtype),torch.randn(bias).to(dtype)]))
                self.assertIn('N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), N.cast(v2, "f32"))',imported['script'])
                self.assertIn(', "'+name+'")',imported['script'])

    def test_vector_linear_without_bias(self):
        class Model(torch.nn.Module):
            def forward(self,x,w):return torch.nn.functional.linear(x,w)
        for shape in [(3,),(2,3),(2,4,3)]:
            imported=import_graph(export_graph(symbolic_trace(Model()),[torch.randn(shape),torch.randn(3)]))
            self.assertIn('N.linear',imported['script'])

    def test_mm_bmm_methods(self):
        class Model(torch.nn.Module):
            def forward(self,a,b):return a.bmm(b)
        self.assertIn('N.matmul',import_graph(export_graph(symbolic_trace(Model()),[torch.randn(2,3,4),torch.randn(2,4,5)]))['script'])

    def test_output_mutation_and_inconsistent_metadata_rejected(self):
        specs={'a':{'shape':[2,3],'dtype':'torch.float32'},'b':{'shape':[3,4],'dtype':'torch.float32'}}
        meta={'shape':[2,4],'dtype':'torch.float32'}
        with self.assertRaisesRegex(ValueError,'output mutation'):lower_linalg('matmul',('a','b'),{'out':'a'},meta,specs.__getitem__)
        with self.assertRaisesRegex(ValueError,'metadata'):lower_linalg('matmul',('a','b'),{},dict(meta,shape=[4,2]),specs.__getitem__)
        specs['b']['dtype']='torch.float16'
        with self.assertRaisesRegex(ValueError,'matching'):lower_linalg('matmul',('a','b'),{},meta,specs.__getitem__)
