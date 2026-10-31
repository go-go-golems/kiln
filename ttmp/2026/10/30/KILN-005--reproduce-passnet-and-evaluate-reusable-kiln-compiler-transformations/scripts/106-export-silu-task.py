#!/usr/bin/env python3
"""Export complete evaluation task 143 and its reusable SiLU/mul/dropout pass."""
import json
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[1];repo=next(p for p in root.parents if (p/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import export_task
upstream=root/'sources/upstream'
sample=(upstream/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines()[143]
export_task(upstream,sample,root/'sources/sixth-task')
passes=root/'sources/sixth-task-pass';passes.mkdir(exist_ok=True)
(passes/'_kiln_sixth_runtime.py').write_text('''from dispatch import CorpusDispatch
DISPATCH=CorpusDispatch('/work/sixth-task',include_paths=['/usr/local/cuda/include'])
def kiln_silu_mul(x,y):
 return DISPATCH(x,y)[0]
''')
(passes/'KilnSiluMulDropout.py').write_text('''import torch
from _kiln_sixth_runtime import kiln_silu_mul
def pattern(x,y):
 return torch.nn.functional.dropout(torch.nn.functional.silu(x,inplace=False)*y,0.0,False,False)
def replacement_args(x,y):
 return (x,y)
def replacement_func():
 return kiln_silu_mul
''')
(passes/'sorted_output_pass_rule_names.json').write_text(json.dumps(['KilnSiluMulDropout'])+'\n')
print('Complete task:',sample)
