import copy
import unittest
import torch
from torch.fx import symbolic_trace
from fx_export import export_graph
from fx_import import import_graph

class ReshapeModel(torch.nn.Module):
    def __init__(self,mode,shape):super().__init__();self.mode=mode;self.shape=shape
    def forward(self,x):
        if self.mode=='function':return torch.reshape(x,self.shape)
        if self.mode=='keywords':return torch.reshape(input=x,shape=self.shape)
        if self.mode=='aten':return torch.ops.aten.reshape.default(x,self.shape)
        if self.mode=='view':return x.view(self.shape)
        return x.reshape(self.shape)

class ReshapeTests(unittest.TestCase):
    def graph(self,mode='function',shape=(2,1,3),output=(1,-1,3,1),dtype=torch.float32):
        return export_graph(symbolic_trace(ReshapeModel(mode,output)),(torch.randn(shape).to(dtype),))
    def test_bindings_inference_scalar_and_dtype(self):
        for shape,output in [((2,1,3),(1,-1,3,1)),((),(1,1)),((1,1),()),((2,3),(6,))]:
            for dtype in [torch.float32,torch.float16,torch.bfloat16]:
                scripts=[import_graph(self.graph(mode,shape,output,dtype))['script'] for mode in ['function','keywords','aten','view','method']]
                self.assertTrue(all(s==scripts[0] for s in scripts))
    def test_reject_bad_shapes_and_metadata(self):
        graph=self.graph()
        def changed(fn):
            result=copy.deepcopy(graph);fn(result['nodes'][1]);return result
        for shape in [(-1,-1),(5,),(0,6),(True,6),(-2,3),(-1,4)]:
            with self.assertRaises(ValueError):
                import_graph(changed(lambda n:n['args']['tuple'].__setitem__(1,{'tuple':list(shape)})))
        with self.assertRaisesRegex(ValueError,'shape/dtype'):
            import_graph(changed(lambda n:n['tensor_meta'].update(shape=[6])))
        with self.assertRaisesRegex(ValueError,'duplicate'):
            import_graph(changed(lambda n:n['kwargs']['dict'].update(shape={'tuple':[6]})))
    def test_does_not_grant_mutation_ownership(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.relu(torch.reshape(x,(6,)),inplace=True)
        graph=export_graph(symbolic_trace(Model()),(torch.randn(2,3),))
        with self.assertRaisesRegex(ValueError,'fresh single-use'):import_graph(graph)

if __name__=='__main__':unittest.main()
