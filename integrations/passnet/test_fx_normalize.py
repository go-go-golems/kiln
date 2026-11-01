import copy
import unittest
import torch
from torch.fx import Graph, GraphModule, symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
from fx_normalize import normalize_arguments

class NormalizeTests(unittest.TestCase):
    def test_embedding_defaults_match_dynamo_spelling(self):
        # symbolic tracing records embedding(ids, w); TorchDynamo records all seven arguments
        import torch.nn.functional as F
        class Pattern(torch.nn.Module):
            def forward(self, ids, w): return F.embedding(ids, w, None, None, 2.0, False, False)
        traced = torch.fx.symbolic_trace(Pattern())
        normalize_arguments(traced)
        call = next(n for n in traced.graph.nodes if n.op == 'call_function')
        self.assertEqual(len(call.args) + len(call.kwargs), 7)

    def test_hardtanh_and_pad_dynamo_call_forms(self):
        def pattern(x):
            return torch.nn.functional.pad(torch.nn.functional.hardtanh(x,min_val=0.0,max_val=6.0,inplace=False),(1,1),mode='constant',value=None)
        pat=symbolic_trace(pattern)
        graph=Graph();x=graph.placeholder('x')
        hard=graph.call_function(torch.nn.functional.hardtanh,(x,0.0,6.0,False))
        pad=graph.call_function(torch._C._nn.pad,(hard,(1,1),'constant',None))
        graph.output(pad);model=GraphModule({},graph)
        sample=torch.randn(2,3);original=model(sample)
        self.assertEqual(len(SubgraphMatcher(pat.graph).match(model.graph)),0)
        normalize_arguments(pat);normalize_arguments(model)
        self.assertEqual(len(SubgraphMatcher(pat.graph).match(model.graph)),1)
        torch.testing.assert_close(model(sample),original,rtol=0,atol=0)
        self.assertEqual(normalize_arguments(model),[])
        changed=copy.deepcopy(model)
        for node in changed.graph.nodes:
            if node.target is torch._C._nn.pad:node.args=(*node.args[:2],'reflect',None)
        self.assertEqual(SubgraphMatcher(pat.graph).match(changed.graph),[])

    def test_max_pool2d_dynamo_positional_args(self):
        def pattern(x):
            return torch.nn.functional.max_pool2d(x,3,2,1,1,ceil_mode=False,return_indices=False)
        pat=symbolic_trace(pattern)
        graph=Graph();x=graph.placeholder('x')
        pool=graph.call_function(torch.nn.functional.max_pool2d,(x,3,2,1,1),{'ceil_mode':False,'return_indices':False})
        graph.output(pool);model=GraphModule({},graph)
        sample=torch.randn(1,2,8,8);original=model(sample)
        self.assertEqual(len(SubgraphMatcher(pat.graph).match(model.graph)),0)
        normalize_arguments(pat);normalize_arguments(model)
        self.assertEqual(len(SubgraphMatcher(pat.graph).match(model.graph)),1)
        torch.testing.assert_close(model(sample),original,rtol=0,atol=0)
        self.assertEqual(normalize_arguments(model),[])
        altered=copy.deepcopy(model)
        for node in altered.graph.nodes:
            if node.target is torch.nn.functional.max_pool2d:node.args=(*node.args[:2],1,*node.args[3:])
        self.assertEqual(SubgraphMatcher(pat.graph).match(altered.graph),[])

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

    def test_layer_norm_affine_arguments_and_epsilon_preserved(self):
        for dtype in [torch.float32,torch.float16,torch.bfloat16]:
            for eps in [1e-5,1e-6]:
                # Dataset models contain literal epsilon values. A changing
                # closure float can instead become a Dynamo tensor input.
                namespace={'torch':torch}
                exec('def function(bias,weight,x):\n value=x+1\n return value,torch.nn.functional.layer_norm(value,(7,),weight=weight,bias=bias,eps='+repr(eps)+')',namespace)
                function=namespace['function']
                pattern=symbolic_trace(function);captured=[];invocations=[]
                def backend(graph,args):
                    captured.append(graph)
                    def execute(*ordered):invocations.append(ordered);return graph.forward(*ordered)
                    return execute
                inputs=(torch.randn(7).to(dtype),torch.randn(7).to(dtype),torch.randn(2,7).to(dtype))
                expected=torch.compile(function,backend=backend)(*inputs)
                self.assertEqual(len(captured),1)
                normalize_arguments(pattern);normalize_arguments(captured[0])
                self.assertEqual(len(SubgraphMatcher(pattern.graph).match(captured[0].graph)),1,f'{dtype} {eps}\n{pattern.graph}\n{captured[0].graph}')
                torch.testing.assert_close(captured[0](*invocations[0]),expected,rtol=0,atol=0)
                self.assertEqual(normalize_arguments(captured[0]),[])
                different=copy.deepcopy(captured[0])
                for node in different.graph.nodes:
                    if node.target is torch.nn.functional.layer_norm:
                        node.args=(*node.args[:-1],1e-4)
                self.assertEqual(SubgraphMatcher(pattern.graph).match(different.graph),[])



class SpellingAliasTests(unittest.TestCase):
    def test_functional_and_method_sigmoid_match_after_normalization(self):
        from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
        from fx_normalize import normalize_arguments
        def pattern(x):return torch.nn.functional.sigmoid(x.reshape(2,-1))
        traced=torch.fx.symbolic_trace(pattern)          # records call_method sigmoid
        self.assertIn('sigmoid',[n.target for n in traced.graph.nodes if n.op=='call_method'])
        graph=torch.fx.Graph();x=graph.placeholder('x')    # TorchDynamo spelling
        y=graph.call_method('reshape',(x,2,-1));graph.output(graph.call_function(torch.nn.functional.sigmoid,(y,)))
        dynamo=torch.fx.GraphModule(torch.nn.Module(),graph)
        self.assertEqual(SubgraphMatcher(traced.graph,match_output=False,match_placeholder=False).match(dynamo.graph),[])
        self.assertTrue(normalize_arguments(traced));self.assertTrue(normalize_arguments(dynamo))
        self.assertEqual(len(SubgraphMatcher(traced.graph,match_output=False,match_placeholder=False).match(dynamo.graph)),1)
        torch.testing.assert_close(traced(torch.ones(4)),torch.sigmoid(torch.ones(2,2)))


class PatternTraceTests(unittest.TestCase):
    def test_explicit_iadd_retained(self):
        from fx_normalize import trace_pattern
        graph=trace_pattern(explicit_iadd_pattern)
        import operator
        self.assertIn(operator.iadd,[n.target for n in graph.graph.nodes])
        x,y,z=[torch.randn(2,3) for _ in range(3)]
        torch.testing.assert_close(graph(x,y,z),(y+z)+x)

    def test_other_inplace_operators_and_factories_retained(self):
        from fx_normalize import trace_pattern
        import operator
        graph=trace_pattern(inplace_factory_pattern)
        targets=[n.target for n in graph.graph.nodes]
        self.assertIn(operator.itruediv,targets);self.assertIn(operator.imul,targets)
        self.assertIn(torch.ones,targets);self.assertIn(torch.tensor,targets)
        self.assertNotIn('get_attr',[n.op for n in graph.graph.nodes])
        x=torch.rand(2,3)+1
        torch.testing.assert_close(graph(x.clone()),(x/torch.tensor(2.0))*torch.ones(2,3))

# Direct global binding is what FX autowrap intercepts, without module-level
# torch.fx.wrap registration inside a generated pass.
from operator import iadd
def explicit_iadd_pattern(x,y,z):
    return iadd(y+z,x)

from operator import itruediv, imul
def inplace_factory_pattern(x):
    x=itruediv(x,torch.tensor(2.0))
    return imul(x,torch.ones((2,3)))

if __name__=='__main__': unittest.main()
