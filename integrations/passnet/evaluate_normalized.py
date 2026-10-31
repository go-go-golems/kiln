"""Declared modified protocol: canonical FX arguments before original matching.

Invoke with the original pass_bench.torch.test_compiler CLI arguments. Only the
pattern-pass class is replaced in this process; source checkout is unchanged.
"""
import json
import runpy
import torch
from fx_normalize import normalize_arguments
from pass_bench.torch.backend import pass_mgr_backend as backend

OriginalPass = backend.PatternReplacementPass

class NormalizedPass(OriginalPass):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        pattern = torch.fx.symbolic_trace(self.pattern)
        receipt = normalize_arguments(pattern)
        print('[kiln-normalized-fx/1] pattern normalization '+json.dumps(receipt),flush=True)
        self.pattern = pattern

    def __call__(self, gm):
        receipt = normalize_arguments(gm)
        print('[kiln-normalized-fx/1] target normalization '+json.dumps(receipt),flush=True)
        return super().__call__(gm)

backend.PatternReplacementPass = NormalizedPass
print('[kiln-normalized-fx/1] MODIFIED MATCHING PROTOCOL; original source/dispatch/numerical checks retained',flush=True)
runpy.run_module('pass_bench.torch.test_compiler',run_name='__main__')
