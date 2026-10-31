"""Keep all attempts and report executable diversity before GPU selection."""
from collections import Counter
import gzip,json
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources';lanes=s/'pi-pointwise-lanes-v1';out=s/'pointwise-agent-proposals-v1';development=s/'pointwise-agent-development-v1'
summary=json.loads((lanes/'summary.json').read_text());records=[]
for lane in summary:
 directory=lanes/lane['lane']/'run';events=directory/'events.jsonl'
 with gzip.open(directory/'events.jsonl.gz','wb') as f:f.write(events.read_bytes())
 ready=[json.loads(line)['value'] for line in events.read_text().splitlines() if json.loads(line)['kind']=='session_ready']
 records.append({'lane':lane['lane'],'elapsed_ms':lane['result']['elapsedMs'],'session':ready,'attempts':[json.loads(p.read_text()) for p in sorted((directory/'task').glob('*.result.json'))]})
policies=json.loads((out/'declaration.json').read_text())['policies'];builds=[]
control={name:json.loads((development/name/'compile-receipt.json').read_text())['records'] for name in ['baseline','pointwise']}
unique=[set() for _ in control['baseline']]
for policy in policies:
 rows=json.loads((out/policy['id']/'compile-receipt.json').read_text())['records']
 assert len(rows)==len(unique)
 for i,r in enumerate(rows):
  if r['status']=='compiled':unique[i].add(r['fingerprint'])
 builds.append({'policy':policy['id'],'status_counts':dict(Counter(r['status'] for r in rows)),'baseline_aliases':sum(r.get('fingerprint')==b['fingerprint'] for r,b in zip(rows,control['baseline'])),'fixed_pointwise_aliases':sum(r.get('fingerprint')==b['fingerprint'] for r,b in zip(rows,control['pointwise']))})
result={'scope':'Actual LLM proposals and compilation only; no candidate GPU timings','lanes':records,'builds':builds,'unique_executables_per_graph':[len(v) for v in unique]}
(out/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
print('attempts',dict(Counter(a['status'] for r in records for a in r['attempts'])))
print('programs',len(builds),'unique executables',sum(map(len,unique)))
print('builds',dict(sum((Counter(b['status_counts']) for b in builds),Counter())))
