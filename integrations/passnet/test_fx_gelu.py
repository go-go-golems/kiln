"""GELU source semantics, precision boundaries and FX/Dynamo matching."""
import copy
import unittest
import torch
from torch.fx import symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
from fx_export import export_graph
from fx_import import import_graph
from fx_normalize import normalize_arguments

class GeluModel(torch.nn.Module):
    def __init__(self,mode,approximate):super().__init__();self.mode=mode;self.approximate=approximate
    def forward(self,x):
        if self.mode=='implicit':return torch.nn.functional.gelu(x)
        if self.mode=='keywords':return torch.nn.functional.gelu(input=x,approximate=self.approximate)
        if self.mode=='aten':return torch.ops.aten.gelu.default(x,approximate=self.approximate)
        return torch.nn.functional.gelu(x,approximate=self.approximate)

class GeluTests(unittest.TestCase):
    def graph(self,mode='functional',approximate='none',dtype=torch.float32,shape=(2,7)):
        return export_graph(symbolic_trace(GeluModel(mode,approximate)),(torch.randn(shape).to(dtype),))

    def test_modes_dtypes_and_scalar_shapes(self):
        for shape in [(),(7,),(2,7)]:
            for dtype in [torch.float32,torch.float16,torch.bfloat16]:
                for approximate in ['none','tanh']:
                    modes=['functional','keywords','aten']+(['implicit'] if approximate=='none' else [])
                    scripts=[import_graph(self.graph(mode,approximate,dtype,shape))['script'] for mode in modes]
                    self.assertTrue(all(script==scripts[0] for script in scripts))
                    self.assertIn(f'N.gelu(N.cast(v0, "f32"), "{approximate}")',scripts[0])

    def test_malformed_calls_metadata_and_ownership(self):
        base=self.graph()
        def changed(fn):
            graph=copy.deepcopy(base);fn(graph['nodes'][1]);return graph
        for bad in ['fast',None,True,1]:
            with self.assertRaisesRegex(ValueError,'approximate'):
                import_graph(changed(lambda node:node['kwargs']['dict'].update(approximate=bad)))
        for update in [{'shape':[14]},{'dtype':'torch.float16'}]:
            with self.assertRaisesRegex(ValueError,'dtype-preserving'):
                import_graph(changed(lambda node:node['tensor_meta'].update(update)))
        with self.assertRaisesRegex(ValueError,'unsupported'):
            import_graph(changed(lambda node:node['kwargs']['dict'].update(inplace=True)))
        class Model(torch.nn.Module):
            def forward(self,x):return torch.nn.functional.relu(torch.nn.functional.gelu(x),inplace=True)
        self.assertIn('N.relu',import_graph(export_graph(symbolic_trace(Model()),(torch.randn(3),)))['script'])

    def test_default_normalization_preserves_approximation_predicate(self):
        inputs=(torch.randn(2,7),)
        for approximate in ['none','tanh']:
            def function(x):return torch.nn.functional.gelu(x,approximate=approximate)
            pattern=symbolic_trace(function);captured=[]
            def backend(graph,args):captured.append(graph);return graph.forward
            expected=torch.compile(function,backend=backend)(*inputs)
            self.assertEqual(len(captured),1)
            normalize_arguments(pattern);normalize_arguments(captured[0])
            self.assertEqual(len(SubgraphMatcher(pattern.graph).match(captured[0].graph)),1)
            torch.testing.assert_close(captured[0](*inputs)[0],expected,rtol=0,atol=0)
            self.assertEqual(normalize_arguments(captured[0]),[])
            other=symbolic_trace(GeluModel('functional','tanh' if approximate=='none' else 'none'))
            normalize_arguments(other)
            self.assertEqual(SubgraphMatcher(pattern.graph).match(other.graph),[])
        implicit=symbolic_trace(GeluModel('implicit','none'))
        explicit=symbolic_trace(GeluModel('functional','none'))
        normalize_arguments(implicit);normalize_arguments(explicit)
        self.assertEqual(len(SubgraphMatcher(implicit.graph).match(explicit.graph)),1)

if __name__=='__main__':unittest.main()
