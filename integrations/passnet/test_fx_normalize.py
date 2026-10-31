import unittest
import torch
from torch.fx import Graph, GraphModule, symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
from fx_normalize import normalize_arguments

class NormalizeTests(unittest.TestCase):
    def test_call_forms_match_and_preserve_output(self):
        def pattern(mean,var,bias,weight,x):
            return torch.nn.functional.dropout(torch.nn.functional.batch_norm(torch.nn.functional.relu(x,inplace=False),mean,var,weight,bias,False,0.1,1e-5),p=0.0,training=False)
        pat=symbolic_trace(pattern)
        graph=Graph()
        mean,var,bias,weight,x=[graph.placeholder(n) for n in ['mean','var','bias','weight','x']]
        relu=graph.call_function(torch.nn.functional.relu,(x,),{'inplace':False})
        bn=graph.call_function(torch.nn.functional.batch_norm,(relu,mean,var,weight,bias,False,0.1,1e-5))
        drop=graph.call_function(torch.nn.functional.dropout,(bn,),{'p':0.0,'training':False})
        graph.output(drop)
        model=GraphModule({},graph)
        inputs=(torch.randn(3),torch.rand(3)+0.1,torch.randn(3),torch.randn(3),torch.randn(2,3))
        expected=model(*inputs)
        self.assertEqual(len(SubgraphMatcher(pat.graph).match(model.graph)),0)
        normalize_arguments(pat);normalize_arguments(model)
        self.assertEqual(len(SubgraphMatcher(pat.graph).match(model.graph)),1)
        torch.testing.assert_close(model(*inputs),expected,rtol=0,atol=0)
        self.assertEqual(normalize_arguments(model),[])

    def test_interpolation_call_forms(self):
        def pattern(x):
            return torch.nn.functional.interpolate(x,size=(5,5),mode='bilinear',align_corners=False)
        pat=symbolic_trace(pattern)
        graph=Graph();x=graph.placeholder('x')
        y=graph.call_function(torch.nn.functional.interpolate,(x,),{'size':(5,5),'mode':'bilinear','align_corners':False})
        graph.output(y);model=GraphModule({},graph)
        inputs=(torch.randn(1,2,3,4),);expected=model(*inputs)
        normalize_arguments(pat);normalize_arguments(model)
        # Assertion becomes active with explicit protocol whitelist extension.
        self.assertEqual(len(SubgraphMatcher(pat.graph).match(model.graph)),1)
        torch.testing.assert_close(model(*inputs),expected,rtol=0,atol=0)

    def test_invalid_call_fails_before_mutation(self):
        graph=Graph();x=graph.placeholder('x')
        relu=graph.call_function(torch.nn.functional.relu,(x,),{'bad':True});graph.output(relu)
        model=GraphModule({},graph)
        before=str(model.graph)
        with self.assertRaises(TypeError): normalize_arguments(model)
        self.assertEqual(str(model.graph),before)

if __name__=='__main__': unittest.main()
