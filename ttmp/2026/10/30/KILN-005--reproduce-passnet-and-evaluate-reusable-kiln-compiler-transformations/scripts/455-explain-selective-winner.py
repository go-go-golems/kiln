import json
from pathlib import Path
r=Path(__file__).resolve().parent.parent/'sources'
d=json.loads((r/'pi-six-lane-results-v1/measurement.json').read_text())
rows=[]
for i,row in enumerate(d['records']):
 b=row['measurements'][row['bindings']['baseline']];w=row['measurements'][row['bindings']['glm-28']]
 if row['bindings']['baseline']==row['bindings']['glm-28']:continue
 result={'index':i,'graph':row['graph'],'e2e_speedup':b['e2e_median_ms']/w['e2e_median_ms'],
 'baseline_ms':b['e2e_median_ms'],'candidate_ms':w['e2e_median_ms']}
 for name in ['baseline','glm-28']:
  a=json.loads((r/'pi-six-lane-artifacts-v1'/name/f'{i:03}.kiln.json').read_text())
  result[name]=[{'shape':k['shape'],'schedule':k['row'],'reads':k['reads']} for k in a['kernels']]
 rows.append(result)
(r/'pi-selective-winner-analysis-v1.json').write_text(json.dumps({'scope':'Development observations; schedule causality needs targeted ablation','records':rows},indent=2)+'\n')
