"""Record the measured winner and its changed schedule, without default promotion."""
import hashlib,json
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources';results=s/'pointwise-agent-gpu-results-v1';summary=json.loads((results/'summary.json').read_text())
winner=next(r for r in summary['ranking'] if r['complete'] and r['policy'].startswith('agent-'))
name=winner['policy'];policy=json.loads((s/'pointwise-agent-proposals-v1/policies'/f'{name}.json').read_text());changes=[]
for i,row in enumerate(winner['graphs']):
 if row['fixed_alias']:continue
 pair={}
 for role,path in [('fixed',s/'pointwise-agent-development-v1/pointwise'),('winner',s/'pointwise-agent-proposals-v1'/name)]:
  receipt=json.loads((path/'compile-receipt.json').read_text())['records'][i];artifact=json.loads((path/receipt['artifact']).read_text())
  pair[role]={'kernel_count':receipt['kernel_count'],'kernels':[{key:k.get(key) for key in ['shape','row','grid','block']} for k in artifact['kernels']],'decisions':receipt['decisions']}
 changes.append({'index':i,'measurement':row,'compiler':pair})
selection={'scope':'Development-selected reusable program; not default promotion or fresh confirmation','policy':policy,'tie_rule':'First complete agent in stable descending ranking; exact executable aliases share timings','summary_sha256':hashlib.sha256((results/'summary.json').read_bytes()).hexdigest(),'geomean_vs_baseline':winner['geomean_vs_baseline'],'geomean_vs_fixed':winner['geomean_vs_fixed'],'changed_graphs':changes}
(results/'selection.json').write_text(json.dumps(selection,indent=2)+'\n')
print(name,'changed graphs',[r['index'] for r in changes])
