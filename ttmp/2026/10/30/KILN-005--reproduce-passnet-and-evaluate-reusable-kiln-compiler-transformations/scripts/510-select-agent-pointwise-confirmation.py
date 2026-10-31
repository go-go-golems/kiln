"""Freeze up to eight fresh FP32 pointwise graphs before compiler outcomes."""
import hashlib,json,math,re,subprocess,sys
from pathlib import Path
root=Path.cwd();T=Path(__file__).resolve().parent.parent;s=T/'sources';up=s/'upstream'
sys.path.insert(0,str(root/'integrations/passnet'))
from corpus import translate_graph
from prepare_study import model_of
out=s/'pointwise-agent-confirmation-v1';out.mkdir();corpus=out/'corpus';corpus.mkdir()
excluded=set()
for sample in (up/'sample_lists/eval/hf_fusible_eval_samples_v2.txt').read_text().splitlines():
 for graph in (up/sample/'graph_list.txt').read_text().splitlines():excluded.add(model_of(graph))
for name in subprocess.check_output(['git','ls-files',str(T.relative_to(root)/'sources')],text=True).splitlines():
 if name.endswith('/manifest.json'):
  data=json.loads(Path(name).read_text())
  if isinstance(data,dict):
   for row in data.get('variants',[]):
    if '/samples/' in row.get('graph',''):excluded.add(model_of(row['graph']))
selected=json.loads((s/'pointwise-agent-gpu-results-v1/selection.json').read_text())
program=json.loads((s/'pointwise-agent-program-validation-v1.json').read_text())['artifact']
(out/'declaration.json').write_text(json.dumps({'fixed_revision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'fixed_artifact':program,'selected_agent_policy':selected['policy'],'development_selection_sha256':hashlib.sha256((s/'pointwise-agent-gpu-results-v1/selection.json').read_bytes()).hexdigest(),'requested_models':8,'excluded_models':sorted(excluded),'selection':'Salted task order; first eligible FP32 graph per fresh exact model; one zero-padded 1x1 convolution; at most 2 million elements per tensor and 64 million multiply products; no compilation or timing during selection. Architecture relatives may remain.'},indent=2)+'\n')
audit=[];rows=[];models=set()
samples=(up/'sample_lists/train/hf_fusible_train_samples_v2.txt').read_text().splitlines()
samples.sort(key=lambda x:hashlib.sha256(('pointwise-agent-confirmation-v1\n'+x).encode()).hexdigest())
for sample in samples:
 for graph in (up/sample/'graph_list.txt').read_text().splitlines():
  if '/float32/' not in graph:continue
  model=model_of(graph)
  if model in excluded or model in models:continue
  path=up/graph
  if not any('conv2d' in p.read_text() for p in path.glob('*.py')):continue
  record={'sample':sample,'graph':graph,'model':model}
  try:
   result=translate_graph(up,graph,'fake');text=result['script']
   calls=re.findall(r'const (v\d+) = N\.conv2d\((v\d+), (v\d+), .*',text)
   if len(calls)!=1:record['status']='requires_single_convolution'
   else:
    output,x,w=calls[0];variables=result['tensor_variables'];weight=variables[w]['shape'];shape=variables[output]['shape']
    volume=max(math.prod(n['shape']) for n in result['tensor_nodes'].values())
    work=math.prod(shape)*weight[1]
    line=next(line for line in text.splitlines() if 'N.conv2d(' in line)
    if weight[-2:]!=[1,1] or '"padding": [0, 0]' not in line:record['status']='geometry_excluded'
    elif set(result['input_dtypes'].values())!={'f32'} or volume>2000000 or work>64000000:record['status']='dtype_or_volume_excluded'
    else:
     script=f'{len(rows):03d}.kiln.js';(corpus/script).write_text(text)
     rows.append({**record,'script':script,'split':'heldout','source_sha256':hashlib.sha256(text.encode()).hexdigest(),**{k:result[k] for k in ['inputs','input_dtypes','output_structure','reference_constraints']},'reference_domain_diagnostic':result.get('reference_domain_diagnostic'),'multiply_products':work})
     models.add(model);record.update(status='selected',multiply_products=work)
     print('selected',len(rows),model,work,flush=True)
  except Exception as e:record.update(status='unsupported',error=str(e))
  audit.append(record)
  if len(rows)>=8:break
 if len(rows)>=8:break
(out/'scan-audit.json').write_text(json.dumps(audit,indent=2)+'\n')
(corpus/'manifest.json').write_text(json.dumps({'format':'kiln-passnet-corpus/1','numerical_policy':{'contraction':'separate'},'membership_sha256':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest(),'variants':rows},indent=2)+'\n')
print('selected total',len(rows),flush=True)
(out/'available-population.json').write_text(json.dumps({'requested':8,'available':len(rows),'scope':'All eligible exact models from the fixed metadata scan; record before compilation and GPU measurement; no outcome-based replacement'},indent=2)+'\n')
