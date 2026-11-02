"""FX tracing that preserves Python in-place operator identities, slice assignment and factory calls.

Ordinary FX Proxy can implement += through its non-mutating fallback. Capturing
operator.iadd explicitly lets the importer check ownership rather than silently
losing source mutation semantics. FX's Proxy has no __setitem__; x[index] = value is
recorded as an operator.setitem node.

Symbolic tracing passes proxies only for a forward's tensor arguments, so a factory call
with Python arguments (torch.arange(24)) would run eagerly and its input-independent result
would become a get_attr constant. While tracing, the factories below emit call_function nodes
targeting the original functions (what TorchDynamo captures). Code that bound a factory before
tracing (from torch import arange) bypasses this and still folds; get_attr stays refused.
No PyTorch implementation copied.
"""
import contextlib
import operator
import torch


def inplace_method(function):
    def invoke(self,other):
        return self.tracer.create_proxy('call_function',function,(self,other),{})
    return invoke


class MutationProxy(torch.fx.Proxy):
    def __setitem__(self,index,value):
        self.tracer.create_proxy('call_function',operator.setitem,(self,index,value),{})


for name in ['add','sub','mul','truediv','floordiv','mod','pow','matmul','and','or','xor','lshift','rshift']:
    setattr(MutationProxy,'__i'+name+'__',inplace_method(getattr(operator,'i'+name)))


FACTORIES=[(torch,'arange'),(torch,'zeros'),(torch,'ones'),(torch,'full'),(torch,'tensor'),(torch,'linspace'),(torch,'meshgrid'),(torch.functional,'meshgrid')]


@contextlib.contextmanager
def proxied_factories(tracer):
    """Replace the factory functions by node-emitting wrappers for the duration of one trace."""
    saved=[(module,name,getattr(module,name)) for module,name in FACTORIES]
    def wrap(original):
        def call(*args,**kwargs):return tracer.create_proxy('call_function',original,args,kwargs)
        return call
    try:
        for module,name,function in saved:setattr(module,name,wrap(function))
        yield
    finally:
        for module,name,function in saved:setattr(module,name,function)


class MutationTracer(torch.fx.Tracer):
    def proxy(self,node):return MutationProxy(node,self)

    def trace(self,root,concrete_args=None):
        with proxied_factories(self):return super().trace(root,concrete_args)


def trace_module(module):
    tracer=MutationTracer();graph=tracer.trace(module)
    return torch.fx.GraphModule(tracer.root,graph)
