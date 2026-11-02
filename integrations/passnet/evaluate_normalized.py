"""Declared modified protocol: canonical FX arguments before original matching.

Invoke with the original pass_bench.torch.test_compiler CLI arguments. Only the
pattern-pass class is replaced in this process; source checkout is unchanged.
"""
import inspect
import json
import runpy
import torch
from fx_normalize import normalize_arguments, trace_pattern
from pass_bench.torch.backend import pass_mgr_backend as backend

from dispatch_policy import install_record_stream_policy
print("[kiln-normalized-fx/1] metadata policy "+install_record_stream_policy(),flush=True)

print('[kiln-pattern-autowrap/3] preserve explicit in-place operators, bound slice assignments and factory calls in match patterns',flush=True)

OriginalPass = backend.PatternReplacementPass

class NormalizedPass(OriginalPass):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        pattern = trace_pattern(self.pattern)
        receipt = normalize_arguments(pattern)
        print('[kiln-normalized-fx/1] pattern normalization '+json.dumps(receipt),flush=True)
        self.pattern = pattern
        output = next(n for n in pattern.graph.nodes if n.op == 'output').args[0]
        if isinstance(output, tuple) and len(output) > 1:
            # Reuse the pinned upstream direct backend's explicit output
            # destructuring helper, retaining this backend's guarded callable.
            from pass_bench.torch.backend.pass_mgr_direct import FixedPatternReplacementPass
            rule = args[0] if args else kwargs['pass_rule']
            self.replacement = FixedPatternReplacementPass._make_multi_output_replacement(
                list(inspect.signature(rule.pattern).parameters), len(output),
                backend.replacement_core_decorator(), rule.replacement_args)
            print('[kiln-pattern-multi-output/1] upstream tuple destructuring '+str(len(output)),flush=True)

    def __call__(self, gm):
        receipt = normalize_arguments(gm)
        print('[kiln-normalized-fx/1] target normalization '+json.dumps(receipt),flush=True)
        return super().__call__(gm)

backend.PatternReplacementPass = NormalizedPass
print('[kiln-normalized-fx/1] MODIFIED MATCHING PROTOCOL; original source/dispatch/numerical checks retained',flush=True)
runpy.run_module('pass_bench.torch.test_compiler',run_name='__main__')
