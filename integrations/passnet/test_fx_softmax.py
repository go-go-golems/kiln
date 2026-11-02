"""Source binding and numerical-contract checks for stable softmax lowering."""
import copy
import unittest
import warnings
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph
from fx_import import import_graph

class SoftmaxModel(torch.nn.Module):
    def __init__(self,mode,axis=-1,dtype=None):
        super().__init__();self.mode=mode;self.axis=axis;self.dtype=dtype
    def forward(self,x):
        if self.mode=='functional':return torch.nn.functional.softmax(x,self.axis,dtype=self.dtype)
        if self.mode=='keywords':return torch.nn.functional.softmax(input=x,dim=self.axis,dtype=self.dtype)
        if self.mode=='implicit':return torch.nn.functional.softmax(x,dtype=self.dtype)
        if self.mode=='method':return x.softmax(self.axis,dtype=self.dtype)
        if self.mode=='aten':return torch.ops.aten.softmax.int(x,self.axis,self.dtype)
        if self.mode=='internal':return torch.ops.aten._softmax.default(x,self.axis,False)
        return torch.softmax(x,self.axis,dtype=self.dtype)

class SoftmaxTests(unittest.TestCase):
    def graph(self,mode='functional',shape=(2,3,4),axis=-1,dtype=torch.float32,output_dtype=None):
        with warnings.catch_warnings():
            warnings.simplefilter('ignore')
            return export_graph(symbolic_trace(SoftmaxModel(mode,axis,output_dtype)),(torch.randn(shape).to(dtype),))

    def test_bindings_axes_and_storage_types(self):
        for shape in [(),(5,),(2,3,4)]:
            for dtype in [torch.float32,torch.float16,torch.bfloat16]:
                for axis in sorted(set([0,-1,len(shape)-1])):
                    scripts=[import_graph(self.graph(mode,shape,axis,dtype))['script'] for mode in ['functional','keywords','method','aten','internal','torch']]
                    self.assertTrue(all(s==scripts[0] for s in scripts))
                    self.assertIn('N.softmax(N.',scripts[0])
                    if not shape:self.assertIn('N.reshape',scripts[0])

    def test_implicit_dimension_and_explicit_dtype(self):
        for shape,axis in [((),0),((3,),0),((2,3),1),((2,3,4),0),((2,3,4,5),1)]:
            self.assertEqual(import_graph(self.graph('implicit',shape))['script'],import_graph(self.graph('functional',shape,axis))['script'])
        script=import_graph(self.graph(dtype=torch.float32,output_dtype=torch.float16))['script']
        self.assertIn('N.softmax(N.cast(N.cast(v0, "f16"), "f32"), 2)',script)
        script=import_graph(self.graph(dtype=torch.float16,output_dtype=torch.float32))['script']
        self.assertIn('N.cast(v0, "f32")',script)

    def test_reject_inconsistent_arguments_and_metadata(self):
        graph=self.graph()
        def changed(fn):
            result=copy.deepcopy(graph);fn(result['nodes'][1]);return result
        for axis in [True,3,-4]:
            with self.assertRaisesRegex(ValueError,'dimension'):
                import_graph(changed(lambda n:n['kwargs']['dict'].update(dim=axis)))
        with self.assertRaisesRegex(ValueError,'duplicate'):
            import_graph(changed(lambda n:n['args']['tuple'].append(1)))
        with self.assertRaisesRegex(ValueError,'shape/dtype'):
            import_graph(changed(lambda n:n['tensor_meta'].update(dtype='torch.float16')))
        with self.assertRaisesRegex(ValueError,'unsupported arguments'):
            import_graph(changed(lambda n:n['kwargs']['dict'].update(out={'ref':'x'})))
        internal=self.graph('internal',dtype=torch.float16)
        internal['nodes'][1]['args']['tuple'][2]=True
        internal['nodes'][1]['tensor_meta']['dtype']='torch.float32'
        self.assertIn('"f32"',import_graph(internal)['script'])
        internal['nodes'][0]['tensor_meta']['dtype']='torch.bfloat16'
        with self.assertRaisesRegex(ValueError,'float16 input'):import_graph(internal)

if __name__=='__main__':unittest.main()
