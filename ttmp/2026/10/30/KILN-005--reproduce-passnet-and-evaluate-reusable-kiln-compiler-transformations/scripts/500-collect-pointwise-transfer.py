"""Collect terminal replay and summarize all predeclared graphs without filtering."""
import hashlib,json,math,statistics,subprocess
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources';bundle=json.loads((s/'pointwise-transfer-gpu-staging-v1.json').read_text());base=bundle['remote']
out=s/'pointwise-transfer-gpu-results-v1';out.mkdir()
for name in ['results.json','run.log','run.py']:
 subprocess.run(['scp','-q','-o','HostKeyAlias=bling.local','manuel@bling:'+base+'/'+name,str(out/name)],check=True)
assert hashlib.sha256((out/'run.py').read_bytes()).hexdigest()==bundle['runner_sha256']
result=json.loads((out/'results.json').read_text());manifest=json.loads((s/'pointwise-transfer-v1/corpus/manifest.json').read_text())
assert result['status']=='complete' and result['membership_sha256']==manifest['membership_sha256']
assert [r['graph'] for r in result['records']]==[r['graph'] for r in manifest['variants']]
rows=[]
for record in result['records']:
 row={'model':record['model'],'graph':record['graph'],'status':{k:v['status'] for k,v in record['measurements'].items()}}
 if set(row['status'])=={'baseline','pointwise'} and all(v=='measured' for v in row['status'].values()):
  for m in record['measurements'].values():assert len(m['rounds'])==3 and all(r['stable'] for r in m['rounds'])
  row.update(baseline_ms=record['measurements']['baseline']['e2e_median_ms'],candidate_ms=record['measurements']['pointwise']['e2e_median_ms'])
  row['speedup']=row['baseline_ms']/row['candidate_ms']
 rows.append(row)
ratios=[r['speedup'] for r in rows if 'speedup' in r]
summary={'scope':result['scope'],'expected':len(rows),'measured_pairs':len(ratios),'complete_population_geomean':math.exp(statistics.mean(map(math.log,ratios))) if len(ratios)==len(rows) else None,'records':rows}
(out/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps(summary,indent=2))
