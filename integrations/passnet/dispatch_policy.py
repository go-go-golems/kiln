"""Declared integration-only extension: allow storage stream-lifetime metadata.

All operations except aten.record_stream.default delegate to the original guard.
No general dispatch suppression is introduced for replacement computations.
"""
import torch


def install_record_stream_policy():
    from pass_bench.torch.posion_dispatch_tensor import PosionDispatchTensor, unwrap_tensor
    original = PosionDispatchTensor.__torch_dispatch__.__func__

    @classmethod
    def dispatch(cls, func, types, args=(), kwargs=None):
        if func == torch.ops.aten.record_stream.default:
            if len(args) != 2 or kwargs:
                raise RuntimeError('record_stream policy requires tensor and stream positional arguments')
            tensor, stream = args
            return torch.ops.aten.record_stream.default(unwrap_tensor(tensor), stream)
        return original(cls, func, types, args, kwargs)

    PosionDispatchTensor.__torch_dispatch__ = dispatch
    return 'kiln-dispatch-record-stream/1'
