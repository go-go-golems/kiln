import unittest
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph
from fx_import import import_graph

class ImportTests(unittest.TestCase):
    def test_transpose_bindings_share_static_semantics(self):
        class Model(torch.nn.Module):
            def __init__(self,mode):super().__init__();self.mode=mode
            def forward(self,x):
                if self.mode=='function':return torch.transpose(x,-1,0)
                if self.mode=='keywords':return torch.transpose(input=x,dim0=-1,dim1=0)
                if self.mode=='method':return x.transpose(dim0=-1,dim1=0)
                return torch.ops.aten.transpose.int(x,-1,0)
        for shape in [(2,3,4),(5,),()]:
            for dtype in [torch.float32,torch.float16,torch.bfloat16]:
                scripts=[]
                for mode in ['function','keywords','method','aten']:
                    result=import_graph(export_graph(symbolic_trace(Model(mode)),(torch.randn(shape).to(dtype),)))
                    scripts.append(result['script'])
                self.assertTrue(all(script==scripts[0] for script in scripts))
                self.assertIn('N.transpose' if shape else 'N.reshape',scripts[0])

    def test_transpose_argument_and_metadata_errors(self):
        import copy
        class Model(torch.nn.Module):
            def forward(self,x):return torch.transpose(x,0,1)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3),))
        def edited(change):
            value=copy.deepcopy(graph);node=next(n for n in value['nodes'] if n['target']=='torch.transpose');change(node);return value
        for axis in [True,2,-3]:
            with self.assertRaisesRegex(ValueError,'transpose dimensions'):
                import_graph(edited(lambda n:n['args']['tuple'].__setitem__(1,axis)))
        with self.assertRaisesRegex(ValueError,'duplicate transpose'):
            import_graph(edited(lambda n:n['kwargs']['dict'].update(dim0=0)))
        with self.assertRaisesRegex(ValueError,'output shape'):
            import_graph(edited(lambda n:n['tensor_meta'].update(shape=[2,3])))
        with self.assertRaisesRegex(ValueError,'dtype-preserving'):
            import_graph(edited(lambda n:n['tensor_meta'].update(dtype='torch.float16')))

    def test_transpose_does_not_grant_mutation_ownership(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.relu(torch.transpose(x,0,1),inplace=True)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3),))
        with self.assertRaisesRegex(ValueError,'fresh single-use'):import_graph(graph)

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

    def test_conv_relu_residual_resize(self):
        class Model(torch.nn.Module):
            def forward(self,b,w,residual,x):
                y=torch.conv2d(x,w,b,(2,2),(1,1),(1,1),1)
                y=torch.nn.functional.relu(y,inplace=True)
                return torch.nn.functional.interpolate(residual+y,size=(5,5),mode='bilinear',align_corners=False)
        values=(torch.randn(3),torch.randn(3,2,3,3),torch.randn(1,3,3,3),torch.randn(1,2,5,5))
        result=import_graph(export_graph(symbolic_trace(Model()),values))
        self.assertIn('N.conv2d',result['script']);self.assertIn('N.resizeBilinear',result['script'])

    def test_inplace_input_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x): return torch.nn.functional.relu(x,inplace=True)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3),))
        with self.assertRaisesRegex(ValueError,'fresh single-use'):
            import_graph(graph)

    def test_reduction_axes_and_dtype(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x.mean(dim=(-1,0),keepdim=False)
        for dtype in [torch.float32,torch.float16,torch.bfloat16]:
            result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4).to(dtype),)))
            self.assertIn('N.sum',result['script']);self.assertIn('N.reshape',result['script'])
            self.assertIn('0.125',result['script'])

    def test_layout_and_cast_chain(self):
        class Model(torch.nn.Module):
            def forward(self,x):
                return x.permute(0,2,1).contiguous().reshape(2,12).half().float()
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4),)))
        self.assertIn('N.transpose',result['script']);self.assertIn('N.reshape',result['script']);self.assertIn('N.cast',result['script'])

    def test_explicit_dtype_cast(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x.to(dtype=torch.float16)
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))
        self.assertIn('N.cast(v0, "f16")',result['script'])

    def test_dynamic_reshape_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x.reshape(6,4)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3,4),))
        # Import must not silently substitute recorded metadata for a runtime shape.
        node=next(n for n in graph['nodes'] if n.get('target')=='reshape')
        node['args']['tuple'][1]={'ref':graph['nodes'][0]['id']}
        with self.assertRaises(ValueError): import_graph(graph)

    def test_cast_without_dtype_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x.to(dtype=torch.float16)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3),))
        node=next(n for n in graph['nodes'] if n.get('target')=='to')
        node['kwargs']={'dict':{}}
        with self.assertRaisesRegex(ValueError,'explicit dtype'): import_graph(graph)

    def test_basic_static_indexing(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x[:,1:-1,-2,None]
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,5,4),)))
        self.assertIn('N.slice',result['script']);self.assertIn('[2, 3, 1]',result['script'])

    def test_ellipsis_indexing(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x[...,1,None]
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3,4),)))
        self.assertIn('[2, 3, 1]',result['script'])

    def test_strided_indexing_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x): return x[:,::2]
        with self.assertRaisesRegex(ValueError,'Strided'):
            import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,6),)))

    def test_concatenation_promotion(self):
        class Model(torch.nn.Module):
            def forward(self,x,y): return torch.cat((x,y),dim=-1)
        result=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3).half(),torch.randn(2,1).bfloat16())))
        self.assertIn('N.concat',result['script'])
        self.assertIn('N.cast(v0, "f32")',result['script'])
        self.assertIn('N.cast(v1, "f32")',result['script'])

    def test_dtype_and_layout_rejected(self):
        class Model(torch.nn.Module):
            def forward(self, x):
                return torch.relu(x)
        for x in [torch.ones(2,3,dtype=torch.int64), torch.randn(2,3).t()]:
            with self.assertRaises(ValueError):
                import_graph(export_graph(symbolic_trace(Model()), (x,)))



class ActivationImportTests(unittest.TestCase):
    def test_activation_operation_boundaries_widen_and_narrow(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.silu(x),x.sigmoid(),torch.sigmoid(x)
        for dtype,name in [(torch.float32,'f32'),(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
            imported=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3).to(dtype),)))
            self.assertIn('N.silu(N.cast(v0, "f32"))',imported['script'])
            self.assertEqual(imported['script'].count('N.sigmoid(N.cast(v0, "f32"))'),2)
            self.assertIn(', "'+name+'")',imported['script'])

    def test_inplace_silu_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.silu(x,inplace=True)
        with self.assertRaisesRegex(ValueError,'mutation/alias'):
            import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))

    def test_sigmoid_out_rejected(self):
        class Model(torch.nn.Module):
            def forward(self,x,y):return torch.sigmoid(x,out=y)
        with self.assertRaisesRegex(ValueError,'arguments'):
            import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),torch.empty(2,3))))


class OwnedActivationTests(unittest.TestCase):
    def test_single_use_fresh_activation_can_be_functionalized(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.silu(torch.relu(x),inplace=True)
        imported=import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))
        self.assertIn('N.silu',imported['script'])

    def test_alias_observer_prevents_functionalization(self):
        class Model(torch.nn.Module):
            def forward(self,x):
                owned=torch.relu(x)
                view=owned.view(2,3)
                changed=torch.nn.functional.silu(owned,inplace=True)
                return changed,view
        with self.assertRaisesRegex(ValueError,'fresh single-use'):
            import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))

    def test_potentially_aliasing_view_not_owned(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.silu(torch.relu(x).view(2,3),inplace=True)
        with self.assertRaisesRegex(ValueError,'fresh single-use'):
            import_graph(export_graph(symbolic_trace(Model()),(torch.randn(2,3),)))


if __name__ == '__main__':
    unittest.main()
