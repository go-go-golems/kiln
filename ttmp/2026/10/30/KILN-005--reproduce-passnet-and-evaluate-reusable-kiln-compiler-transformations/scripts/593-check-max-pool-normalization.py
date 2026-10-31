"""Capture a representative failing task's Dynamo target FX beside its source pattern."""
import json,sys
from pathlib import Path
import torch
T=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(Path.cwd()/'integrations/passnet'))
from corpus import load_module
from generate_pass import extract_pattern
from fx_normalize import trace_pattern,normalize_arguments
plan=json.loads((T/'sources/parallel-port-task-plan-v1.json').read_text())
sample=next(t['sample'] for t in plan['tasks'] if t['index']==107)
graph=(T/'sources/upstream'/sample/'graph_list.txt').read_text().splitlines()[0]
up=T/'sources/upstream';model=load_module(up/graph/'model.py').GraphModule()
metadata=[]
for filename in ('input_meta.py','weight_meta.py'):
 module=load_module(up/graph/filename)
 metadata.extend(c for c in vars(module).values() if isinstance(c,type) and hasattr(c,'shape') and hasattr(c,'name'))
metadata.sort(key=lambda c:int(c.name.split('_')[-1]))
inputs=[torch.empty(c.shape,dtype=getattr(torch,c.dtype.split('.')[-1])) for c in metadata]
source=(up/graph/'model.py').read_text();pattern_text,_,_,_,_=extract_pattern(source,len(inputs))
namespace={};exec(pattern_text,namespace);pattern=trace_pattern(namespace['pattern']);normalize_arguments(pattern)
captured=[]
def backend(gm,example_inputs):
 normalize_arguments(gm);captured.append(gm)
 raise RuntimeError('Captured target FX; execution intentionally stopped')
try:torch.compile(model,backend=backend)(*inputs)
except Exception as e:
 if 'Captured target FX' not in str(e):raise
assert len(captured)==1
result={'scope':'Local CPU TorchDynamo structural diagnostic; no numerical benchmark','torch_version':torch.__version__,'graph':graph,'pattern':str(pattern.graph),'target':str(captured[0].graph),'pattern_nodes':[{'op':n.op,'target':str(n.target),'args':str(n.args),'kwargs':str(n.kwargs)} for n in pattern.graph.nodes],'target_nodes':[{'op':n.op,'target':str(n.target),'args':str(n.args),'kwargs':str(n.kwargs)} for n in captured[0].graph.nodes]}
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
result['matches']=len(SubgraphMatcher(pattern.graph).match(captured[0].graph))
out=T/'sources/pattern-target-fx-diagnostic-v2.json';out.write_text(json.dumps(result,indent=2)+'\n');print('pattern',[(n['op'],n['target']) for n in result['pattern_nodes']]);print('target',[(n['op'],n['target']) for n in result['target_nodes']]);print('matches',result['matches'])
