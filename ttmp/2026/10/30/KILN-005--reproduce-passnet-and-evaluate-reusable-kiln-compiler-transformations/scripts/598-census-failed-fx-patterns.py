"""Capture first graph of each no-match family with local TorchDynamo for diagnosis."""
import json,sys
from pathlib import Path
import torch
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
T=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(Path.cwd()/'integrations/passnet'))
from corpus import load_module
from generate_pass import extract_pattern
from fx_normalize import trace_pattern,normalize_arguments
plan=json.loads((T/'sources/parallel-port-task-plan-v1.json').read_text());delta=json.loads((T/'sources/parallel-port-task-plan-v3-delta.json').read_text());lookup={t['index']:t for t in plan['tasks']+delta['tasks']}
rows=[]
for index in [107,142,106,165,163,149,144,159,83]:
 sample=lookup[index]['sample'];graph=(T/'sources/upstream'/sample/'graph_list.txt').read_text().splitlines()[0];up=T/'sources/upstream'
 row={'index':index,'graph':graph}
 try:
  model=load_module(up/graph/'model.py').GraphModule();metadata=[]
  for filename in ('input_meta.py','weight_meta.py'):
   module=load_module(up/graph/filename);metadata.extend(c for c in vars(module).values() if isinstance(c,type) and hasattr(c,'shape') and hasattr(c,'name'))
  metadata.sort(key=lambda c:int(c.name.split('_')[-1]));inputs=[torch.empty(c.shape,dtype=getattr(torch,c.dtype.split('.')[-1])) for c in metadata]
  source=(up/graph/'model.py').read_text();pattern_text,_,_,_,_=extract_pattern(source,len(inputs));namespace={};exec(pattern_text,namespace)
  pattern=trace_pattern(namespace['pattern']);before_pattern=str(pattern.graph);normalize_arguments(pattern)
  captured=[]
  def backend(gm,example_inputs):
   captured.append(gm);raise RuntimeError('Captured target FX; execution intentionally stopped')
  try:torch.compile(model,backend=backend)(*inputs)
  except Exception as e:
   if 'Captured target FX' not in str(e):raise
  assert len(captured)==1
  target=captured[0];before_target=str(target.graph);normalize_arguments(target)
  row.update(matches=len(SubgraphMatcher(pattern.graph).match(target.graph)),pattern_before=before_pattern,target_before=before_target,pattern=str(pattern.graph),target=str(target.graph))
 except Exception as e:row.update(error=type(e).__name__+': '+str(e)[:500])
 rows.append(row);print(index,'matches',row.get('matches'),'error',row.get('error'),flush=True)
 torch._dynamo.reset()
result={'format':'kiln-fx-match-census/1','scope':'First graph per nine no-match families; local CPU TorchDynamo structural diagnostic, not native benchmark','torch_version':torch.__version__,'records':rows}
(T/'sources/failed-fx-pattern-census-v1.json').write_text(json.dumps(result,indent=2)+'\n')
