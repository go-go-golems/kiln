#!/usr/bin/env python3
"""Confirm the original tracer mismatch on exact evaluator runtime and task shapes."""
import hashlib,json,shlex,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];local=p/'sources/original-agent-smoke-terminal-v1';root='/home/manuel/passnet-kiln/KILN-005';boot=root+'/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling'];candidate=local/'best-snapshot/pass_dir/FuseConv2dRelu.py'
assert json.loads((local/'model-server-release-v1.json').read_text())['status']=='stopped'
subprocess.run(ssh+['mkdir -p '+boot+'/diagnostic-pattern-v1'],check=True)
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(candidate),'manuel@bling:'+boot+'/diagnostic-pattern-v1/'],check=True)
code=r'''
import ast,copy,hashlib,importlib.util,json,sys
from pathlib import Path
import torch
from torch.fx import symbolic_trace
from torch.fx.passes.utils.matcher_utils import SubgraphMatcher
from pass_bench.torch.custom_replacement import force_args_symbolic_trace
sys.path.insert(0,'/work/kiln/integrations/passnet')
from fx_normalize import normalize_arguments
candidate=Path('/work/sources/agent-runtime-bootstrap-v1/diagnostic-pattern-v1/FuseConv2dRelu.py');node=next(n for n in ast.parse(candidate.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='pattern');namespace={'torch':torch};exec(compile(ast.Module(body=[copy.deepcopy(node)],type_ignores=[]),str(candidate),'exec'),namespace)
model_path=Path('/workspace/passnet/graphs/fusible_subgraphs/samples/timm/crossvit_15_dagger_240.in1k/_decomposed/crossvit_15_dagger_240.in1k_0/_decomposed/crossvit_15_dagger_240.in1k_0_start14_end16_4/model.py');spec=importlib.util.spec_from_file_location('original_task_model',model_path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);rows=[]
for device in ['cpu','cuda']:
 for sizes in ['small','original']:
  shapes=[[1,3,5,5],[4],[4,3,3,3]] if sizes=='small' else [[1,96,56,56],[192],[192,96,3,3]]
  torch._dynamo.reset();inputs=[torch.randn(shape,device=device) for shape in shapes];graphs=[]
  def backend(graph,examples):graphs.append(graph);return graph.forward
  with torch.no_grad():result=torch.compile(module.GraphModule(),backend=backend,fullgraph=True)(*inputs);expected=module.GraphModule()(*inputs)
  torch.testing.assert_close(result,expected);assert len(graphs)==1
  graph=graphs[0];ordinary=symbolic_trace(namespace['pattern']);forced=force_args_symbolic_trace(namespace['pattern']);row={'device':device,'shapes':sizes,'input_shapes':shapes,'ordinary_matches':len(SubgraphMatcher(ordinary.graph).match(graph.graph)),'original_forced_matches':len(SubgraphMatcher(forced.graph).match(graph.graph)),'dynamo_graph':str(graph.graph),'original_forced_graph':str(forced.graph)}
  normalize_arguments(forced);normalize_arguments(graph);row['both_normalized_matches']=len(SubgraphMatcher(forced.graph).match(graph.graph));rows.append(row)
 if device=='cuda':torch.cuda.synchronize()
import pass_bench.torch.custom_replacement as original
print(json.dumps({'format':'kiln-original-matcher-dgx-confirmation/1','torch':torch.__version__,'gpu':torch.cuda.get_device_name(),'candidate_sha256':hashlib.sha256(candidate.read_bytes()).hexdigest(),'original_tracer_sha256':hashlib.sha256(Path(original.__file__).read_bytes()).hexdigest(),'normalizer_sha256':hashlib.sha256(Path('/work/kiln/integrations/passnet/fx_normalize.py').read_bytes()).hexdigest(),'records':rows,'scope':'Structural diagnostic using original source/tracer; no generated kernel execution or evaluator modification'},indent=2))
'''
command=['docker','run','--rm','--gpus','all','-v',root+':/work:ro','--entrypoint','python','sha256:0f8b8235cfda1daed9b1cddfa9162ad320403b90d2d715ed2a8b16cc2861e913','-c',code]
r=subprocess.run(ssh+[shlex.join(command)],capture_output=True,text=True)
for suffix,value in [('stdout',r.stdout),('stderr',r.stderr)]:
 with (local/('dgx-matcher-structure-v1.'+suffix+'.log')).open('x') as file:file.write(value)
if r.returncode:raise RuntimeError('DGX matcher diagnostic returned '+str(r.returncode)+': '+r.stderr[-1500:])
facts=json.loads(r.stdout);assert facts['candidate_sha256']==hashlib.sha256(candidate.read_bytes()).hexdigest()
with (local/'dgx-matcher-structure-v1.json').open('x') as file:file.write(json.dumps(facts,indent=2)+'\n')
print(json.dumps({'torch':facts['torch'],'records':[{key:row[key] for key in ['device','shapes','ordinary_matches','original_forced_matches','both_normalized_matches']} for row in facts['records']]},indent=2))
