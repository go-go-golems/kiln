"""Exact upstream input replay; separate from unit-scale random stress checks."""
import argparse,importlib.util,json
from pathlib import Path
import sys
import torch
from runtime import TorchProgram
from pass_bench.torch.test_compiler import get_input_dict
root=Path(sys.argv[1]);record=json.loads((root/'third-task/manifest.json').read_text())['variants'][0]
path=root/'upstream'/record['graph']
torch.manual_seed(42)
named=get_input_dict(argparse.Namespace(model_path=str(path),device='cuda'))
spec=importlib.util.spec_from_file_location('original',path/'model.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
p=TorchProgram(root/'third-task/bias-fixed.json',include_paths=['/usr/local/cuda/include'])
actual=p(*[named[f'in_{i}'] for i in range(len(named))])['out0'];expected=module.GraphModule()(**named)[0]
torch.testing.assert_close(actual,expected,rtol=1e-3,atol=1e-5)
torch.cuda.synchronize();p.close()
report={'source':'unchanged PassBench get_input_dict/replay_tensor','seed':42,'status':'passed','max_abs_error':(actual-expected).abs().max().item(),'graph':record['graph'],'stress_random_failure_remains':True}
(root/'third-task/replay-check.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
