"""Lossless argument structure for FX graphs; unsupported values fail explicitly.

Independent implementation using public torch.fx APIs. No PassNet code copied.
Tensor values remain runtime inputs; this module never serializes device pointers.
"""
import math
import re
import torch
from torch.fx import Node, GraphModule
from torch.fx.passes.shape_prop import ShapeProp


def encode(value):
    if value is Ellipsis:
        return {"ellipsis": True}
    if isinstance(value, Node):
        return {"ref": value.name}
    if isinstance(value, tuple):
        return {"tuple": [encode(v) for v in value]}
    if isinstance(value, list):
        return {"list": [encode(v) for v in value]}
    if isinstance(value, dict):
        if not all(isinstance(k, str) for k in value):
            raise TypeError("FX dictionary keys must be strings")
        return {"dict": {k: encode(v) for k, v in value.items()}}
    if isinstance(value, torch.dtype):
        return {"dtype": str(value)}
    if isinstance(value, torch.device):
        return {"device": str(value)}
    if isinstance(value, slice):
        return {"slice": [encode(value.start), encode(value.stop), encode(value.step)]}
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, float):
        # inf and nan stay floats: the importer spells them Infinity / NaN (JSON extensions and JS globals)
        return value
    raise TypeError(f"Unsupported FX value: {type(value).__name__}: {value!r}")


def tensor_spec(meta):
    if hasattr(meta, "shape") and hasattr(meta, "dtype"):
        return {"shape": list(meta.shape), "dtype": str(meta.dtype),
                "strides": list(meta.stride), "requires_grad": meta.requires_grad}
    if isinstance(meta, (tuple, list)):
        return [tensor_spec(v) for v in meta]
    if isinstance(meta, dict):
        return {k: tensor_spec(v) for k, v in meta.items()}
    return None


DEVICE_METHODS = ('cuda', 'cpu')


def host_device(value, device):
    """value with every device argument (a torch.device or a device string) replaced by device."""
    if isinstance(value, torch.device): return device
    if isinstance(value, str) and re.fullmatch(r'(cuda|cpu)(:\d+)?', value): return device
    if isinstance(value, (tuple, list)): return type(value)(host_device(v, device) for v in value)
    if isinstance(value, dict): return {k: host_device(v, device) for k, v in value.items()}
    return value


def propagation_copy(module, device):
    """A copy of module in which every tensor lives on `device`: device arguments name it and
    .cuda()/.cpu() become .to(device). Kiln imports a device move as shape and dtype only (one
    device holds every value), so metadata propagation must not depend on where tensors live.
    Without this, fake propagation mixes cpu inputs with cuda:0 factory results ("Unhandled
    FakeTensor Device Propagation") or initializes CUDA on a host without a driver."""
    graph, mapping = torch.fx.Graph(), {}
    for node in module.graph.nodes:
        copied = graph.node_copy(node, lambda n: mapping[n])
        if copied.op in ('call_function', 'call_method'):
            copied.args, copied.kwargs = host_device(copied.args, device), host_device(copied.kwargs, device)
            if copied.op == 'call_method' and copied.target in DEVICE_METHODS:
                copied.target, copied.args, copied.kwargs = 'to', (copied.args[0], device), {}
        if copied.name != node.name: raise ValueError(f'{node.name}: propagation copy renamed a node')
        mapping[node] = copied
    return GraphModule(module, graph), mapping


def propagate(module, example_inputs, fake_mode=None):
    """ShapeProp on a single-device copy of module; each node of module receives its copy's tensor_meta."""
    devices = {v.device for v in example_inputs if isinstance(v, torch.Tensor)}
    if len(devices) > 1: raise ValueError(f'example inputs on several devices: {sorted(map(str, devices))}')
    copy, mapping = propagation_copy(module, devices.pop() if devices else torch.device('cpu'))
    # real examples are cloned: a graph that updates an input in place must not change the caller's tensors
    if fake_mode is None: example_inputs = [v.clone() if isinstance(v, torch.Tensor) else v for v in example_inputs]
    ShapeProp(copy, fake_mode=fake_mode).propagate(*example_inputs)
    for node, copied in mapping.items():
        if 'tensor_meta' in copied.meta: node.meta['tensor_meta'] = copied.meta['tensor_meta']


def export_graph(module: GraphModule, example_inputs, *, fake_mode=None):
    """Propagate example metadata and export static FX, preserving exact targets.

    ShapeProp interprets a single-device copy of the trusted module (propagate). With fake_mode
    it computes metadata without tensor kernels; otherwise it executes real examples.
    Value-dependent operations can fail in fake mode. get_attr constants need explicit handling.
    """
    propagate(module, example_inputs, fake_mode)
    nodes = []
    for node in module.graph.nodes:
        if node.op in ("call_module", "get_attr"):
            raise ValueError(f"{node.name}: unsupported FX node kind {node.op}; decompose or export constants explicitly")
        target = node.target
        if node.op == "call_function":
            if isinstance(target, torch._ops.OpOverload):
                target = str(target)
            elif hasattr(target, "__module__") and hasattr(target, "__name__"):
                target = f"{target.__module__}.{target.__name__}"
            else:
                raise TypeError(f"{node.name}: unsupported call target {target!r}")
        nodes.append({"id": node.name, "kind": node.op, "target": str(target),
                      "args": encode(node.args), "kwargs": encode(node.kwargs),
                      "tensor_meta": tensor_spec(node.meta.get("tensor_meta"))})
    return {"format": "kiln-fx/1", "torch_version": torch.__version__, "nodes": nodes}
