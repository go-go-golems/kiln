"""Use untouched PassBench numerical comparison; no matching or score claim."""
import argparse,contextlib,hashlib,io,json,re,sys
from pathlib import Path
root=Path('/work');sys.path[:0]=[str(root/'kiln/integrations/passnet'),str(root/'kiln/runtime/python'),str(root/'upstream')]
import torch
from corpus import canonical_order_inputs,load_module
from runtime import TorchProgram
from pass_bench.torch.test_compiler import get_input_dict,compare_correctness
from pass_bench.analysis_util import get_correctness
from pass_bench.config.datatype_tolerance_config import get_precision
from measure_policy import save
p=root/'study';record=json.loads((p/'corpus/manifest.json').read_text())['variants'][1];source=root/'upstream'/record['graph']
result={'scope':'Original PassBench numerical comparison on unchanged artifacts; no FX matching, benchmark score or complete-task acceptance','graph':record['graph'],'nominal_unrounded_precision':get_precision(-5,'float32'),'source_sha256':{name:hashlib.sha256((root/'upstream'/name).read_bytes()).hexdigest() for name in ['pass_bench/torch/test_compiler.py','pass_bench/test_compiler_util.py','pass_bench/analysis_util.py','pass_bench/config/datatype_tolerance_config.py']},'records':[]}
logs=[]
for mode in ['native_defaults','full_fp32_research']:
 if mode=='full_fp32_research':torch.set_float32_matmul_precision('highest');torch.backends.cudnn.allow_tf32=False
 torch.manual_seed(42);named=get_input_dict(argparse.Namespace(model_path=str(source),device='cuda'));original=[named[f'in_{i}'] for i in range(len(named))];inputs=canonical_order_inputs(record,original)
 with torch.no_grad():expected=load_module(source/'model.py').GraphModule()(*original)
 for role in ['baseline','pointwise']:
  program=TorchProgram(p/role/Path(record['script']).with_suffix('.json').name,include_paths=['/usr/local/cuda/include'])
  try:
   with torch.no_grad():actual=program(*inputs)
   log=io.StringIO()
   with contextlib.redirect_stderr(log):compare_correctness(expected,(actual['out0'],),argparse.Namespace(log_prompt='numerical-diagnostic',device='cuda'))
   text=log.getvalue();logs.append(mode+' '+role+'\n'+text)
   comparisons={}
   for key,values in re.findall(r'\[Correctness\](\[[^\]]+\]): ([^\n]+)',text):
    if key=='[equal]' or key.startswith('[all_close_'):comparisons[key]=[int(v) for v in values.split()]
   assert '[equal]' in comparisons and len(comparisons)>1
   result['records'].append({'mode':mode,'role':role,'backend':{'matmul_precision':torch.get_float32_matmul_precision(),'matmul_allow_tf32':torch.backends.cuda.matmul.allow_tf32,'cudnn_allow_tf32':torch.backends.cudnn.allow_tf32},'correct_at':{str(t):bool(get_correctness('float32',t,comparisons,0)) for t in [-7,-6,-5,-4,-3]},'comparisons':comparisons})
  finally:program.close()
(root/'passbench-numerical.log').write_text('\n'.join(logs));save(root/'passbench-numerical.json',result)
print([(r['mode'],r['role'],r['correct_at']) for r in result['records']])
