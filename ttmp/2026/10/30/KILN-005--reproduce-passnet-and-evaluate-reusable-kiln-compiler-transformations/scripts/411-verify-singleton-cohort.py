#!/usr/bin/env python3
"""Verify committed sources, complete task accounting, artifacts and original scorer receipts."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';repo=next(d for d in p.parents if (d/'integrations/passnet').is_dir());read=lambda path:json.loads(path.read_text());sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
run=read(s/'singleton-view-source-cohort-v1/run.json');audit=read(s/'singleton-view-source-cohort-v1-audit.json');plan=read(s/'singleton-view-source-cohort-plan.json');source=read(s/'singleton-view-source-snapshot-v1.json');final=read(s/'singleton-view-final-source-verification-v1.json')
assert run['status']=='complete' and run['plan']==plan and source['remote_matches']
assert run['source_snapshot']==source['source_snapshot']==final['source_snapshot']
assert run['plan_sha256']==source['plan_sha256']==sha(s/'singleton-view-source-cohort-plan.json')
assert [t['index'] for t in run['records']]==[t['index'] for t in plan['tasks']]==[t['index'] for t in audit['records']]
for name,digest in source['source_snapshot']['files'].items():assert hashlib.sha256(subprocess.check_output(['git','show',source['source_revision']+':'+name],cwd=repo)).hexdigest()==digest
attempts=artifacts=0;failures=[]
for declared,task,accepted in zip(plan['tasks'],run['records'],audit['records']):
 expected=(s/'upstream'/declared['sample']/'graph_list.txt').read_text().splitlines();assert sha(s/'upstream'/declared['sample']/'graph_list.txt')==declared['graph_list_sha256'];assert [r['graph'] for r in accepted['graphs']]==expected and len(expected)==declared['graphs']
 directory=s/'singleton-view-source-cohort-v1'/task['directory'];manifest=read(directory/'corpus/manifest.json');compiles=read(directory/'corpus/compile-receipt.json');assert [r['graph'] for r in manifest['variants']]==expected;assert [r['graph'] for r in compiles]==expected[:len(compiles)]
 assert len(compiles)==len(expected) or (task['failed_phase']=='compile' and compiles[-1]['returncode']!=0)
 for index,(variant,compiled) in enumerate(zip(manifest['variants'],compiles)):
  attempts+=1;assert sha(directory/'corpus'/variant['script'])==variant['source_sha256']
  if compiled['returncode']:
   assert index==len(compiles)-1;failures.append({'task':task['index'],'graph':variant['graph'],'phase':'compile','diagnostic':(directory/'corpus'/Path(variant['script']).with_suffix('.compile.log')).read_text().strip()});continue
  artifact=read(directory/'corpus'/compiled['artifact']);artifacts+=1
  assert artifact['source']['sha256']==variant['source_sha256'] and artifact['source']['contraction']=='separate' and artifact['codegen']=='kiln-codegen/3'
  assert {r['name']:r['shape'] for r in artifact['inputs']}==variant['inputs'];assert {r['name']:r['dtype'] for r in artifact['inputs']}==variant['input_dtypes']
 for phase in task['phases']:
  if phase['phase']=='score' and phase['returncode']==0:
   receipt=read(directory/'score.receipt.json');assert receipt['returncode']==0 and receipt['sample_id']==task['index']+1;assert receipt['log_sha256']==sha(directory/'benchmark.log') and receipt['score_sha256']==sha(directory/'score.json')
 rejected=[r for r in accepted['graphs'] if r.get('status')!='not_executed' and not r['nominal_accepted']]
 if rejected:failures.append({'task':task['index'],'phase':'original_evaluator','graphs':len(rejected),'execution_statuses':sorted({r['execution_status'] for r in rejected}),'replacement_counts':sorted({r['matches'] for r in rejected})})
native=s/'singleton-view-native-fixtures-v1/singleton-view-fixtures-v1';checks=read(native/'gpu-random-receipt.json');fixture_manifest=read(s/'singleton-view-fixtures-v1/manifest.json');fixture_compile=read(native/'compile-receipt.json')
assert len(checks)==len(fixture_manifest['variants'])==len(fixture_compile)==12
for variant,compiled,checked in zip(fixture_manifest['variants'],fixture_compile,checks):
 assert variant['graph']==compiled['graph']==checked['graph'] and compiled['returncode']==0 and checked['status']=='passed'
 assert len(checked['output_max_abs_errors'])==6 and all(error==0 for error in checked['output_max_abs_errors'])
 artifact=read(native/compiled['artifact']);fixture_source=s/'singleton-view-fixtures-v1'/variant['script'];fixture_sha=sha(fixture_source)
 assert artifact['source']['sha256']==fixture_sha
 assert hashlib.sha256(subprocess.check_output(['git','show',source['source_revision']+':'+str(fixture_source.relative_to(repo))],cwd=repo)).hexdigest()==fixture_sha
facts={'format':'kiln-singleton-cohort-facts/1','source_revision':source['source_revision'],'source_snapshot_sha256':source['source_snapshot']['sha256'],'source_files_verified':len(source['source_snapshot']['files']),'tasks_expected':len(plan['tasks']),'graphs_expected':sum(t['graphs'] for t in plan['tasks']),'compile_attempts_verified':attempts,'artifacts_verified':artifacts,'tasks_nominal_accepted':audit['tasks_nominal_accepted'],'graphs_nominal_accepted':audit['graphs_nominal_accepted'],'unexecuted_graphs':audit['unexecuted_graphs'],'native_fixture_programs':12,'native_fixture_outputs_exact':72,'retained_failures':failures,'scope':'Complete original replay accounting with modified integration, nominal t=-5; cumulative support, not full-corpus release or controlled optimization evidence'}
assert facts['tasks_expected']==audit['tasks_expected'] and facts['graphs_expected']==audit['graphs_expected']
assert facts['graphs_expected']==facts['graphs_nominal_accepted']+facts['unexecuted_graphs']+sum(not g['nominal_accepted'] for t in audit['records'] for g in t['graphs'] if g.get('status')!='not_executed')
with (s/'singleton-view-source-cohort-v1-verified-facts.json').open('x') as file:file.write(json.dumps(facts,indent=2)+'\n')
print(json.dumps(facts,indent=2))
