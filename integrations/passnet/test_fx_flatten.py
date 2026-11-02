import copy,unittest
import torch
from fx_export import export_graph
from fx_import import import_graph

class FlattenModel(torch.nn.Module):
    def __init__(self,mode,start,end):super().__init__();self.mode=mode;self.start=start;self.end=end
    def forward(self,x):
        if self.mode=='function':return torch.flatten(x,self.start,self.end)
        if self.mode=='keywords':return torch.flatten(input=x,start_dim=self.start,end_dim=self.end)
        if self.mode=='aten':return torch.ops.aten.flatten.using_ints(x,self.start,self.end)
        return x.flatten(self.start,self.end)

class FlattenTests(unittest.TestCase):
    def graph(self,mode='function',shape=(2,3,4),start=1,end=-1,dtype=torch.float32):
        return export_graph(torch.fx.symbolic_trace(FlattenModel(mode,start,end)),(torch.randn(shape).to(dtype),))
    def test_forms_shapes_dtypes(self):
        for shape,start,end in [((2,3,4),1,-1),((2,3,4),-3,-2),((2,3),1,1),((),0,-1),((1,),-1,0)]:
            for dtype in [torch.float32,torch.float16,torch.bfloat16]:
                scripts=[import_graph(self.graph(mode,shape,start,end,dtype))['script'] for mode in ['function','keywords','aten','method']]
                self.assertTrue(all(s==scripts[0] for s in scripts))
    def test_invalid_axes_metadata_duplicates(self):
        graph=self.graph()
        for start,end in [(3,-1),(-4,-1),(2,1),(True,2),(1.5,2)]:
            g=copy.deepcopy(graph);g['nodes'][1]['args']['tuple'][1:]=[start,end]
            with self.assertRaisesRegex(ValueError,'flatten:'):import_graph(g)
        g=copy.deepcopy(graph);g['nodes'][1]['tensor_meta']['shape']=[6,4]
        with self.assertRaisesRegex(ValueError,'shape/dtype'):import_graph(g)
        g=copy.deepcopy(graph);g['nodes'][1]['kwargs']['dict']['start_dim']=1
        with self.assertRaisesRegex(ValueError,'duplicate'):import_graph(g)
    def test_alias_not_fresh(self):
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.relu(torch.flatten(x),inplace=True)
        graph=export_graph(torch.fx.symbolic_trace(Model()),(torch.randn(2,3),))
        with self.assertRaisesRegex(ValueError,'fresh unaliased'):import_graph(graph)

if __name__=='__main__':unittest.main()
