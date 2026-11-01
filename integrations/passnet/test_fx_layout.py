import json,unittest,torch
from fx_export import export_graph
from fx_import import import_graph
from fx_layout import lower_partition,lower_stack,lower_unbind

class Layout(torch.nn.Module):
 def __init__(self,aten=False,mode='constant'):super().__init__();self.aten=aten;self.mode=mode
 def forward(self,x):
  if self.aten:return torch.ops.aten.roll.default(torch.ops.aten.pad.default(x,[-1,2],self.mode,None),[2],[-1])
  return torch.roll(torch.nn.functional.pad(x,(-1,2),self.mode),2,-1)
class Partition(torch.nn.Module):
 def __init__(self,chunk):super().__init__();self.chunk=chunk
 def forward(self,x):
  a,b,c=torch.chunk(x,3,dim=-1) if self.chunk else torch.split(x,[2,2,1],dim=-1)
  return a+b,c
class LayoutTests(unittest.TestCase):
 def test_functional_aten(self):
  for mode in ['constant','reflect','replicate','circular']:
   for dtype in [torch.float32,torch.float16,torch.bfloat16]:
    scripts=[import_graph(export_graph(torch.fx.symbolic_trace(Layout(aten,mode)),(torch.randn(2,5).to(dtype),)))['script'] for aten in [False,True]]
    self.assertEqual(*scripts);self.assertIn('N.pad',scripts[0]);self.assertIn('N.roll',scripts[0])
 def test_partition(self):
  for chunk in [True,False]:
   script=import_graph(export_graph(torch.fx.symbolic_trace(Partition(chunk)),(torch.randn(2,5),)))['script'];self.assertIn('N.slice',script)
 def test_metadata(self):
  g=export_graph(torch.fx.symbolic_trace(Layout()),(torch.randn(2,5),));g['nodes'][1]['tensor_meta']['shape']=[2,5]
  with self.assertRaisesRegex(ValueError,'shape/dtype'):import_graph(g)
 def test_partition_contract(self):
  source={'shape':[2,5],'dtype':'torch.float32'};meta=[dict(source,shape=[2,n]) for n in [2,2,1]]
  result=lower_partition('torch.chunk',['x','3'],{'dim':'-1'},meta,lambda _:source,json.loads)
  self.assertEqual(result,['N.slice(x, 1, 0, 2)','N.slice(x, 1, 2, 4)','N.slice(x, 1, 4, 5)'])

class PartitionAlias(torch.nn.Module):
 def forward(self,x):
  a,b=torch.chunk(x,2,dim=-1)
  return a.add_(1),b
class PartitionAliasTests(unittest.TestCase):
 def test_partition_alias_mutation_rejected(self):
  graph=export_graph(torch.fx.symbolic_trace(PartitionAlias()),(torch.randn(2,4),))
  with self.assertRaisesRegex(ValueError,'fresh unaliased'):import_graph(graph)

class StackUnbind(torch.nn.Module):
 def __init__(self,axis,method=False):super().__init__();self.axis=axis;self.method=method
 def forward(self,x,y):
  stacked=torch.stack((x,y),dim=self.axis)
  parts=stacked.unbind(self.axis) if self.method else torch.unbind(stacked,dim=self.axis)
  return parts[0]+parts[1]

class StackUnbindTests(unittest.TestCase):
 def test_fx_shapes_and_dtypes(self):
  for dtype in (torch.float32,torch.float16,torch.bfloat16):
   for axis in (0,1,-1):
    for method in (False,True):
     model=StackUnbind(axis,method)
     inputs=(torch.randn(2,3).to(dtype),torch.randn(2,3).to(dtype))
     script=import_graph(export_graph(torch.fx.symbolic_trace(model),inputs))['script']
     self.assertIn('N.concat',script)
     self.assertIn('N.slice',script)
     self.assertIn('N.reshape',script)
 def test_contract_rejects_mismatch(self):
  source={'shape':[2,3],'dtype':'torch.float32'}
  with self.assertRaisesRegex(ValueError,'shape/dtype'):
   lower_stack('torch.stack',[['x','y'],'0'],{}, {'shape':[2,3,2],'dtype':'torch.float32'},lambda _:source,json.loads)
  with self.assertRaisesRegex(ValueError,'output count'):
   lower_unbind('torch.unbind',['x','1'],{},[dict(source,shape=[2])],lambda _:source,json.loads)

if __name__=='__main__':unittest.main()
