import copy
import unittest
import torch
from fx_export import export_graph
from fx_import import import_graph

class PoolModel(torch.nn.Module):
    def __init__(self,aten=False):super().__init__();self.aten=aten
    def forward(self,x):
        if self.aten:return torch.ops.aten.avg_pool2d.default(x,[3,2],[],[1,1],True,False,-3)
        return torch.nn.functional.avg_pool2d(input=x,kernel_size=(3,2),padding=(1,1),ceil_mode=True,count_include_pad=False,divisor_override=-3)

class PoolTests(unittest.TestCase):
    def graph(self,aten=False,dtype=torch.float32):
        return export_graph(torch.fx.symbolic_trace(PoolModel(aten)),(torch.randn(1,2,5,7).to(dtype),))
    def test_equivalent_calls_and_dtypes(self):
        for dtype in [torch.float32,torch.float16,torch.bfloat16]:
            a=import_graph(self.graph(False,dtype))['script']
            b=import_graph(self.graph(True,dtype))['script']
            self.assertEqual(a,b);self.assertIn('N.avgPool2d',a)
    def test_metadata_and_parameters(self):
        graph=self.graph()
        for update in [{'shape':[1,2,1,1]},{'dtype':'torch.float16'}]:
            g=copy.deepcopy(graph);g['nodes'][1]['tensor_meta'].update(update)
            with self.assertRaisesRegex(ValueError,'shape/dtype'):import_graph(g)
        for value in [0,True,0.5]:
            g=copy.deepcopy(graph);g['nodes'][1]['kwargs']['dict']['divisor_override']=value
            with self.assertRaisesRegex(ValueError,'divisor'):import_graph(g)

if __name__=='__main__':unittest.main()
