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

    def test_low_precision_elementwise(self):
        class Model(torch.nn.Module):
            def forward(self, x, y): return (x+y)*0.5
        for dtype, name in [(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
            graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3).to(dtype),torch.randn(2,3).to(dtype)))
            result=import_graph(graph)
            self.assertEqual(set(result['input_dtypes'].values()),{name})
            self.assertIn('"'+name+'"',result['script'])

    def test_normalization_accumulation_casts(self):
        class Model(torch.nn.Module):
            def forward(self,mean,var,bias,weight,x):
                return torch.nn.functional.batch_norm(x,mean,var,weight,bias,False,0.1,1e-5)
        for dtype,name in [(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
            values=(torch.zeros(3,dtype=dtype),torch.ones(3,dtype=dtype),torch.zeros(3,dtype=dtype),torch.ones(3,dtype=dtype),torch.randn(2,3).to(dtype))
            result=import_graph(export_graph(symbolic_trace(Model()),values))
            self.assertIn('N.cast(v4, "f32")',result['script'])
            self.assertIn(', "'+name+'")',result['script'])

    def test_divide_transpose_task_pattern(self):
        class Model(torch.nn.Module):
            def forward(self,x): return (x/1.6817928305074292).transpose(-1,-2)
        for dtype in [torch.float32,torch.float16,torch.bfloat16]:
            result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4).to(dtype),)))
            self.assertIn('N.div',result['script'])
            self.assertIn('N.transpose',result['script'])

    def test_dtype_and_layout_rejected(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                return torch.relu(x)
        for x in [torch.ones(2,3,dtype=torch.int64), torch.randn(2,3).t()]:
            with self.assertRaises(ValueError):
                import_graph(export_graph(symbolic_trace(Model()), (x,)))

if __name__ == '__main__':
    unittest.main()
