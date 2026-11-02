#!/usr/bin/env python3
"""Freeze LLM-authored candidate programs before fresh training feedback."""
import hashlib,json,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];repo=next(r for r in p.parents if (r/'integrations/passnet').exists())
sys.path.insert(0,str(repo/'integrations/passnet'))
from corpus import translate_graph
from reference_domains import reference_domains
corpus=p/'sources/policy-corpus-v3';m=json.loads((corpus/'manifest.json').read_text())
if (corpus/'measurement-plan.json').exists():raise ValueError('Plan already frozen')
volumes=[]
for record in m['variants']:
 result=translate_graph(p/'sources/upstream',record['graph'],'fake')
 assert hashlib.sha256(result['script'].encode()).hexdigest()==record['source_sha256']
 sizes=[]
 for spec in result['tensor_nodes'].values():
  count=1
  for dim in spec['shape']:count*=dim
  sizes.append(count)
 assert max(sizes)<=8000000 and sum(sizes)<=64000000 and len(sizes)<=128,'Frozen graph exceeds declared preflight work/memory envelope'
 volumes.append({'graph':record['graph'],'max_tensor_elements':max(sizes),'all_tensor_elements':sum(sizes),'tensor_nodes':len(sizes)})
(corpus/'tensor-volume-audit.json').write_text(json.dumps(volumes,indent=2)+'\n')
(corpus/'reference-domains.json').write_text(json.dumps(reference_domains(corpus,p/'sources/upstream'),indent=2)+'\n')
def branch(feature,op,value,yes,no):return {'if':{'feature':feature,'op':op,'value':value},'then':yes,'else':no}
def threshold(value):return {'threshold':value}
def single(yes):return branch('consumerCount','eq',1,yes,threshold(1.02))
proposals=[('baseline','unchanged',None),('default','threshold',1.02),('scalar108','threshold',1.08),
 ('tree-tiny-single','decision-tree',branch('producerElements','le',512,single(threshold(1.08)),threshold(1.02))),
 ('tree-small-single','decision-tree',branch('producerElements','le',2048,single(threshold(1.25)),threshold(1.02))),
 ('tree-single-consumer','decision-tree',single(threshold(1.08))),
 ('tree-small-work','decision-tree',branch('originalWork','le',10000000,threshold(1.25),threshold(1.02))),
 ('scalar125','threshold',1.25)]
policies=corpus/'policies';policies.mkdir(exist_ok=True)
for name,kind,program in proposals:
 policy={'format':'kiln-fusion-policy/1','id':name,'kind':kind,
  'provenance':{'author':'Codex session; exact serving snapshot not recorded','method':'LLM-authored fixed hypotheses informed by prior development pilot; no fresh timing feedback; not upstream PassAgent inference',
   'budget':'31 nodes, depth 6, hard work-growth cap 2; immutable compiler features only'}}
 if kind=='threshold':policy['max_work_growth']=program
 elif kind=='decision-tree':policy['tree']=program
 (policies/(name+'.json')).write_text(json.dumps(policy,indent=2)+'\n')
plan={'format':'kiln-policy-measurement-plan/1','membership_sha256':m['membership_sha256'],'candidate_ids':[name for name,_,_ in proposals],
 'seed':42,'warmup':20,'trials':100,'repeats':3,'max_iqr_fraction':0.2,'max_retries':2,
 'inputs':'Original source replay; exact tensor metadata and output comparisons; domain-valid synthetic references',
 'order':'Seeded shuffle of distinct fingerprints; identical artifacts share measurements',
 'metrics':['synchronized end-to-end ms','CUDA event stream elapsed ms including dispatch gaps'],
 'selection':'Training-only family-balanced geometric mean e2e speedup; exact ties preserve declared order, baseline then conservative scalar108 before richer trees; compile-cost coefficient 0',
 'heldout':'Only unchanged compiler plus fixed training selection; no timing-based corpus alteration',
 'scope':'Fresh exact source models/program source hashes from official training sources; custom policy confirmation study, not paper benchmark score',
 'proposal_provenance':'Codex-authored programs; no independent external model inference or upstream PassAgent reproduction claimed'}
(corpus/'measurement-plan.json').write_text(json.dumps(plan,indent=2)+'\n')
print('Frozen feature-policy study:',len(m['variants']),'graphs;',len(proposals),'candidates; metadata envelope passed')
