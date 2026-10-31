"""Singleton shape semantics, source binding and conservative alias ownership."""
import copy
import unittest
import torch
from torch.fx import symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
from fx_export import export_graph
from fx_import import import_graph
from fx_normalize import normalize_arguments


class SingletonModel(torch.nn.Module):
    def __init__(self,operation,mode,dim=None,has_dim=True):
        super().__init__();self.operation=operation;self.mode=mode;self.dim=dim;self.has_dim=has_dim
    def forward(self,x):
        if self.operation=='unsqueeze':
            if self.mode=='function':return torch.unsqueeze(x,self.dim)
            if self.mode=='keywords':return torch.unsqueeze(input=x,dim=self.dim)
            if self.mode=='aten':return torch.ops.aten.unsqueeze.default(x,self.dim)
            return x.unsqueeze(dim=self.dim) if self.mode=='method-keywords' else x.unsqueeze(self.dim)
        if not self.has_dim:
            if self.mode=='function':return torch.squeeze(x)
            if self.mode=='keywords':return torch.squeeze(input=x)
            if self.mode=='aten':return torch.ops.aten.squeeze.default(x)
            return x.squeeze()
        if self.mode=='function':return torch.squeeze(x,self.dim)
        if self.mode=='keywords':return torch.squeeze(input=x,dim=self.dim)
        if self.mode=='aten':
            if isinstance(self.dim,(list,tuple)):return torch.ops.aten.squeeze.dims(x,self.dim)
            return torch.ops.aten.squeeze.dim(x,self.dim)
        return x.squeeze(dim=self.dim) if self.mode=='method-keywords' else x.squeeze(self.dim)


class SingletonTests(unittest.TestCase):
    def graph(self,operation,mode,shape,dim=None,has_dim=True,dtype=torch.float32):
        model=SingletonModel(operation,mode,dim,has_dim)
        return export_graph(symbolic_trace(model),(torch.randn(shape).to(dtype),))

    def test_all_bindings_axes_dtypes_and_scalar_shapes(self):
        modes=['function','keywords','aten','method','method-keywords']
        for shape in [(),(1,),(2,),(1,2,1),(2,1,3,1)]:
            for dtype in [torch.float32,torch.float16,torch.bfloat16]:
                for axis in range(-len(shape)-1,len(shape)+1):
                    scripts=[import_graph(self.graph('unsqueeze',mode,shape,axis,dtype=dtype))['script'] for mode in modes]
                    self.assertTrue(all(s==scripts[0] for s in scripts))
                rank=max(1,len(shape))
                dims=[*range(-rank,rank),(),list(range(len(shape)))]
                for axes in dims:
                    scripts=[import_graph(self.graph('squeeze',mode,shape,axes,dtype=dtype))['script'] for mode in modes]
                    self.assertTrue(all(s==scripts[0] for s in scripts))
                scripts=[import_graph(self.graph('squeeze',mode,shape,has_dim=False,dtype=dtype))['script'] for mode in modes]
                self.assertTrue(all(s==scripts[0] for s in scripts))

    def test_reject_invalid_arguments_and_metadata(self):
        base=self.graph('unsqueeze','function',(1,2,1),0)
        for bad in [True,None,'named',-5,4,[0]]:
            graph=copy.deepcopy(base);graph['nodes'][1]['args']['tuple'][1]=bad
            with self.assertRaises(ValueError):import_graph(graph)
        for change in [{'shape':[2,1,1,1]},{'dtype':'torch.float16'}]:
            graph=copy.deepcopy(base);graph['nodes'][1]['tensor_meta'].update(change)
            with self.assertRaisesRegex(ValueError,'shape/dtype'):import_graph(graph)
        graph=copy.deepcopy(base);graph['nodes'][1]['kwargs']['dict']['dim']=0
        with self.assertRaisesRegex(ValueError,'duplicate'):import_graph(graph)
        for bad in [None,True,'named',4,-4,[0,-3],[0,True]]:
            graph=self.graph('squeeze','function',(1,2,1),0);graph['nodes'][1]['args']['tuple'][1]=({'list':bad} if isinstance(bad,list) else bad)
            with self.assertRaises(ValueError):import_graph(graph)
        graph=self.graph('squeeze','aten',(1,2,1),has_dim=False)
        graph['nodes'][1]['kwargs']['dict']['dim']=0
        with self.assertRaisesRegex(ValueError,'unsupported'):import_graph(graph)

    def test_views_do_not_grant_mutation_ownership(self):
        for operation in ['unsqueeze','squeeze']:
            class Model(torch.nn.Module):
                def forward(self,x):
                    fresh=x+1
                    view=fresh.unsqueeze(0) if operation=='unsqueeze' else fresh.squeeze(0)
                    return torch.nn.functional.relu(view,inplace=True)
            graph=export_graph(symbolic_trace(Model()),(torch.randn(1,3),))
            with self.assertRaisesRegex(ValueError,'fresh single-use'):import_graph(graph)

    def test_fx_and_dynamo_match_without_new_normalization(self):
        for operation in ['unsqueeze','squeeze']:
            for mode in ['function','keywords','method','method-keywords','aten']:
                # Independent capture cases must not exhaust Dynamo's per-code cache.
                torch._dynamo.reset()
                model=SingletonModel(operation,mode,0);pattern=symbolic_trace(model);captured=[]
                def backend(graph,inputs):captured.append(graph);return graph.forward
                inputs=(torch.randn(1,3),)
                result=torch.compile(model,backend=backend)(*inputs)
                self.assertEqual(len(captured),1)
                normalize_arguments(pattern);normalize_arguments(captured[0])
                self.assertEqual(len(SubgraphMatcher(pattern.graph).match(captured[0].graph)),1)
                torch.testing.assert_close(result,model(*inputs),rtol=0,atol=0)

if __name__=='__main__':unittest.main()
