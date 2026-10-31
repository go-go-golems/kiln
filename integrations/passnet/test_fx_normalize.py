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

    def test_softmax_dynamo_defaults_and_semantic_guards(self):
        def pattern(x):return torch.nn.functional.softmax(x,dim=-1)
        pat=symbolic_trace(pattern);captured=[]
        def backend(gm,inputs):
            captured.append(gm)
            return gm.forward
        inputs=(torch.randn(2,3),)
        expected=torch.compile(pattern,backend=backend)(*inputs)
        self.assertEqual(len(captured),1)
        model=captured[0]
        self.assertEqual(len(SubgraphMatcher(pat.graph).match(model.graph)),0)
        normalize_arguments(pat);normalize_arguments(model)
        self.assertEqual(len(SubgraphMatcher(pat.graph).match(model.graph)),1)
        torch.testing.assert_close(model(*inputs)[0],expected,rtol=0,atol=0)
        self.assertEqual(normalize_arguments(model),[])
        # Normalization preserves the dimension and dtype predicates.
        for options in [{'dim':0},{'dim':-1,'dtype':torch.float16}]:
            graph=Graph();x=graph.placeholder('x')
            out=graph.call_function(torch.nn.functional.softmax,(x,),options)
            graph.output(out);different=GraphModule({},graph)
            normalize_arguments(different)
            self.assertEqual(len(SubgraphMatcher(pat.graph).match(different.graph)),0)

    def test_invalid_call_fails_before_mutation(self):
        graph=Graph();x=graph.placeholder('x')
        relu=graph.call_function(torch.nn.functional.relu,(x,),{'bad':True});graph.output(relu)
        model=GraphModule({},graph)
        before=str(model.graph)
        with self.assertRaises(TypeError): normalize_arguments(model)
        self.assertEqual(str(model.graph),before)



class PatternTraceTests(unittest.TestCase):
    def test_explicit_iadd_retained(self):
        from fx_normalize import trace_pattern
        graph=trace_pattern(explicit_iadd_pattern)
        import operator
        self.assertIn(operator.iadd,[n.target for n in graph.graph.nodes])
        x,y,z=[torch.randn(2,3) for _ in range(3)]
        torch.testing.assert_close(graph(x,y,z),(y+z)+x)

# Direct global binding is what FX autowrap intercepts, without module-level
# torch.fx.wrap registration inside a generated pass.
from operator import iadd
def explicit_iadd_pattern(x,y,z):
    return iadd(y+z,x)

if __name__=='__main__': unittest.main()
