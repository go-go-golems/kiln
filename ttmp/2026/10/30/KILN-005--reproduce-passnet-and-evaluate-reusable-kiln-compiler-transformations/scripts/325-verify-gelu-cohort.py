#!/usr/bin/env python3
"""Verify complete GELU membership and preserve compilation/matching failures."""
import argparse,hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';repo=next(d for d in p.parents if (d/'integrations/passnet').exists())
parser=argparse.ArgumentParser();parser.add_argument('--cohort',default='gelu-source-cohort-v1');parser.add_argument('--plan',default='gelu-source-cohort-plan.json');parser.add_argument('--source-checkpoint',default='gelu-source-snapshot-v1.json');parser.add_argument('--output');options=parser.parse_args()
for name in [options.cohort,options.plan,options.source_checkpoint]:assert Path(name).name==name
read=lambda path:json.loads(path.read_text());sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
run=read(s/options.cohort/'run.json');audit=read(s/(options.cohort+'-audit.json'));plan=read(s/options.plan);source=read(s/options.source_checkpoint)
assert run['status']=='complete' and run['plan']==plan and source['remote_matches']
assert run['source_snapshot']==source['source_snapshot'] and run['plan_sha256']==source['task_plan_sha256']==sha(s/options.plan)
assert [r['index'] for r in run['records']]==[r['index'] for r in plan['tasks']]==[r['index'] for r in audit['records']]
for name,digest in source['source_snapshot']['files'].items():
 raw=subprocess.check_output(['git','show',source['source_revision']+':'+name],cwd=repo);assert hashlib.sha256(raw).hexdigest()==digest
artifacts=0;attempts=0;errors=[]
for declared,task,accepted in zip(plan['tasks'],run['records'],audit['records']):
 expected=(s/'upstream'/declared['sample']/'graph_list.txt').read_text().splitlines();assert sha(s/'upstream'/declared['sample']/'graph_list.txt')==declared['graph_list_sha256']
 assert [r['graph'] for r in accepted['graphs']]==expected and len(expected)==declared['graphs']
 directory=s/options.cohort/task['directory'];manifest=read(directory/'corpus/manifest.json');compiles=read(directory/'corpus/compile-receipt.json')
 assert [r['graph'] for r in manifest['variants']]==expected
 assert [r['graph'] for r in compiles]==expected[:len(compiles)]
 assert len(compiles)==len(expected) or (task['failed_phase']=='compile' and compiles[-1]['returncode']!=0)
 for index,(variant,compiled) in enumerate(zip(manifest['variants'],compiles)):
  attempts+=1
  assert sha(directory/'corpus'/variant['script'])==variant['source_sha256']
  if compiled['returncode']:
   assert index==len(compiles)-1
   errors.append({'task':task['index'],'graph':variant['graph'],'phase':'compile','diagnostic':(directory/'corpus'/Path(variant['script']).with_suffix('.compile.log')).read_text().strip()});continue
  artifact=read(directory/'corpus'/compiled['artifact']);artifacts+=1
  assert artifact['source']['sha256']==variant['source_sha256'] and artifact['source']['contraction']=='separate' and artifact['codegen']=='kiln-codegen/3'
  assert {x['name']:x['shape'] for x in artifact['inputs']}==variant['inputs']
  assert {x['name']:x['dtype'] for x in artifact['inputs']}==variant['input_dtypes']
 for phase in task['phases']:
  if phase['phase']=='score' and phase['returncode']==0:
   receipt=read(directory/'score.receipt.json');assert receipt['returncode']==0 and receipt['sample_id']==task['index']+1
   assert receipt['log_sha256']==sha(directory/'benchmark.log') and receipt['score_sha256']==sha(directory/'score.json')
 native_failures=[r for r in accepted['graphs'] if r.get('status')!='not_executed' and not r['nominal_accepted']]
 if native_failures:errors.append({'task':task['index'],'phase':'original_evaluator','nonqualifying_graphs':len(native_failures),'execution_statuses':sorted({r['execution_status'] for r in native_failures}),'replacement_counts':sorted({r['matches'] for r in native_failures})})
native=read(s/'gelu-cuda-validation-v1.json');manifest=read(s/'gelu-fixtures-v1/manifest.json');compiled=read(s/'gelu-fixtures-v1/compile-receipt.json')
assert native['status']=='complete' and native['all_passed'] and len(native['records'])==36
assert [r['graph'] for r in compiled]==[r['graph'] for r in manifest['variants']]
for index,row in enumerate(compiled):
 assert row['returncode']==0
 matching=[r for r in native['records'] if r['graph']==row['graph']]
 assert [r['seed'] for r in matching]==[1,7,42]
 for checked in matching:assert checked['status']=='passed' and checked['artifact_sha256']==sha(s/'gelu-fixtures-v1'/row['artifact'])
facts={'format':'kiln-gelu-cohort-facts/1','source_revision':source['source_revision'],'source_snapshot_sha256':source['source_snapshot']['sha256'],'source_files_verified':len(source['source_snapshot']['files']),'tasks_expected':len(plan['tasks']),'graphs_expected':sum(row['graphs'] for row in plan['tasks']),'compile_attempts_verified':attempts,'artifacts_verified':artifacts,'tasks_nominal_accepted':audit['tasks_nominal_accepted'],'graphs_nominal_accepted':audit['graphs_nominal_accepted'],'unexecuted_graphs':audit['unexecuted_graphs'],'native_fixture_records_passed':36,'native_fixture_outputs_compared':108,'retained_failures':errors,'scope':'Complete original replay accounting, modified integration protocol, nominal t=-5; not a full-success or controlled-speedup claim'}
assert facts['tasks_expected']==audit['tasks_expected'] and facts['graphs_expected']==audit['graphs_expected']
assert facts['tasks_nominal_accepted']==sum(row['nominal_accepted'] for row in audit['records'])
assert facts['graphs_nominal_accepted']==sum(graph.get('nominal_accepted',False) for row in audit['records'] for graph in row['graphs'])
assert facts['unexecuted_graphs']==sum(graph.get('status')=='not_executed' for row in audit['records'] for graph in row['graphs'])
output=s/(options.output or options.cohort+'-verified-facts.json')
with output.open('x') as file:file.write(json.dumps(facts,indent=2)+'\n')
print(json.dumps(facts,indent=2))
