"""Summarize the already selected policy on all confirmation graphs; no new selection."""
from collections import Counter
import hashlib,json,math,statistics,subprocess
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources';bundle=json.loads((s/'pointwise-agent-confirmation-gpu-staging-v1.json').read_text());base=bundle['remote']
out=s/'pointwise-agent-confirmation-gpu-results-v1';out.mkdir()
for name in ['results.json','run.log','run.py']:
 subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local','manuel@bling:'+base+'/'+name,str(out/name)],check=True)
assert hashlib.sha256((out/'run.py').read_bytes()).hexdigest()==bundle['runner_sha256']
result=json.loads((out/'results.json').read_text());manifest=json.loads((s/'pointwise-agent-confirmation-v1/corpus/manifest.json').read_text())
assert result['status']=='complete' and result['membership_sha256']==manifest['membership_sha256']
assert [r['graph'] for r in result['records']]==[r['graph'] for r in manifest['variants']]
ranking=[]
for role in result['roles']:
 ratios=[];fixed_ratios=[];graphs=[]
 for row in result['records']:
  m=row['measurements'][row['bindings'][role]];baseline=row['measurements'][row['bindings']['baseline']];fixed=row['measurements'][row['bindings']['pointwise']]
  entry={'model':row['model'],'status':m['status'],'baseline_alias':row['bindings'][role]==row['bindings']['baseline'],'fixed_alias':row['bindings'][role]==row['bindings']['pointwise']}
  if all(x['status']=='measured' and len(x['rounds'])==3 and all(r['stable'] for r in x['rounds']) for x in [m,baseline,fixed]):
   ratio=baseline['e2e_median_ms']/m['e2e_median_ms'];fixed_ratio=fixed['e2e_median_ms']/m['e2e_median_ms'];ratios.append(ratio);fixed_ratios.append(fixed_ratio)
   entry.update(e2e_ms=m['e2e_median_ms'],speedup=ratio,vs_fixed=fixed_ratio)
  else:entry['error']=m.get('error')
  graphs.append(entry)
 complete=len(ratios)==len(result['records'])
 ranking.append({'policy':role,'complete':complete,'geomean_vs_baseline':math.exp(statistics.mean(map(math.log,ratios))) if complete else None,'geomean_vs_fixed':math.exp(statistics.mean(map(math.log,fixed_ratios))) if complete else None,'graphs':graphs})
ranking.sort(key=lambda r:r['geomean_vs_baseline'] or -1,reverse=True)
summary={'scope':result['scope'],'distinct_outcomes':dict(Counter(m['status'] for row in result['records'] for m in row['measurements'].values())),'ranking':ranking}
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(summary['distinct_outcomes'])
print([(r['policy'],r['geomean_vs_baseline'],r['geomean_vs_fixed']) for r in ranking])
