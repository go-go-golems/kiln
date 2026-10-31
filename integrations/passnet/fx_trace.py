"""FX tracing that preserves Python in-place operator identities.

Ordinary FX Proxy can implement += through its non-mutating fallback. Capturing
operator.iadd explicitly lets the importer check ownership rather than silently
losing source mutation semantics. No PyTorch implementation copied.
"""
import operator
import torch


def inplace_method(function):
    def invoke(self,other):
        return self.tracer.create_proxy('call_function',function,(self,other),{})
    return invoke


class MutationProxy(torch.fx.Proxy):
    pass


for name in ['add','sub','mul','truediv','floordiv','mod','pow','matmul','and','or','xor','lshift','rshift']:
    setattr(MutationProxy,'__i'+name+'__',inplace_method(getattr(operator,'i'+name)))


class MutationTracer(torch.fx.Tracer):
    def proxy(self,node):return MutationProxy(node,self)


def trace_module(module):
    tracer=MutationTracer();graph=tracer.trace(module)
    return torch.fx.GraphModule(tracer.root,graph)
