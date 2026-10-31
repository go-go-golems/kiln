"""Lossless argument structure for FX graphs; unsupported values fail explicitly.

Independent implementation using public torch.fx APIs. No PassNet code copied.
Tensor values remain runtime inputs; this module never serializes device pointers.
"""
import math
import torch
from torch.fx import Node, GraphModule
from torch.fx.passes.shape_prop import ShapeProp


def encode(value):
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
    if isinstance(value, float) and math.isfinite(value):
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


def export_graph(module: GraphModule, example_inputs):
    """Propagate example metadata and export static FX, preserving exact targets.

    ShapeProp executes the module. Call only for trusted graphs in the designated
    evaluation environment. get_attr constants require separate explicit handling.
    """
    ShapeProp(module).propagate(*example_inputs)
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
