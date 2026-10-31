#!/usr/bin/env python3
"""Bind the entire 93-variant result to committed sources and frozen membership."""
import argparse,hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';repo=next(d for d in p.parents if (d/'integrations/passnet').exists())
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--cohort',required=True);parser.add_argument('--source-receipt',required=True);args=parser.parse_args()
if Path(args.cohort).name!=args.cohort or Path(args.source_receipt).name!=args.source_receipt:raise ValueError('Basenames required')
load=lambda name:json.loads((s/name).read_text())
run=load(args.cohort+'/run.json');audit=load(args.cohort+'-audit.json');frozen=load('softmax-cohort-plan.json');source=load(args.source_receipt)
assert run['status']=='complete' and run['plan']==frozen
assert source['remote_matches'] and run['source_snapshot']==source['snapshot']
assert hashlib.sha256((s/'softmax-cohort-plan.json').read_bytes()).hexdigest()==run['plan_sha256']
assert frozen['contraction']=='separate' and frozen['nominal_tolerance']==-5
assert [r['index'] for r in run['records']]==[r['index'] for r in frozen['tasks']]
assert (audit['tasks_expected'],audit['graphs_expected'])==(10,93)
for name,digest in source['snapshot']['files'].items():
 actual=subprocess.check_output(['git','show',source['revision']+':'+name],cwd=repo)
 assert hashlib.sha256(actual).hexdigest()==digest,name
for task in run['records']:
 expected=(s/'upstream'/task['sample']/'graph_list.txt').read_text().splitlines()
 declared=next(r for r in frozen['tasks'] if r['index']==task['index'])
 assert hashlib.sha256((s/'upstream'/task['sample']/'graph_list.txt').read_bytes()).hexdigest()==declared['graph_list_sha256']
 directory=s/args.cohort/task['directory']
 # The shared audit accounts for both measured and unexecuted variants.
 row=next(r for r in audit['records'] if r['index']==task['index'])
 assert [r['graph'] for r in row['graphs']]==expected
 for phase in task['phases']:
  if phase['phase']=='score' and phase['returncode']==0:
   receipt=json.loads((directory/'score.receipt.json').read_text())
   assert receipt['sample_id']==task['index']+1 and receipt['returncode']==0
   assert receipt['log_sha256']==hashlib.sha256((directory/'benchmark.log').read_bytes()).hexdigest()
   assert receipt['score_sha256']==hashlib.sha256((directory/'score.json').read_bytes()).hexdigest()
result={'format':'kiln-softmax-cohort-facts/1','compiler_revision':source['revision'],'source_snapshot_sha256':source['snapshot']['sha256'],'source_files_verified':len(source['snapshot']['files']),'tasks_expected':audit['tasks_expected'],'graphs_expected':audit['graphs_expected'],'complete_tasks_accepted':audit['tasks_nominal_accepted'],'individual_graphs_accepted':audit['graphs_nominal_accepted'],'unexecuted_graphs':audit['unexecuted_graphs'],'scope':'Modified-protocol original replay, nominal t=-5; no controlled speedup or exact paper reproduction claim'}
(s/(args.cohort+'-verified-facts.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
