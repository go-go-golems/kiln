#!/usr/bin/env python3
"""Independently audit complete source controls, raw repetitions and summary math."""
import collections,hashlib,json,math,statistics,subprocess,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';repo=next(d for d in p.parents if (d/'integrations/passnet').exists());sys.path.insert(0,str(repo/'integrations/passnet'))
from compiler_confirmation import verify_freeze
from prepare_study import model_of
read=lambda path:json.loads(path.read_text());sha=lambda path:hashlib.sha256(path.read_bytes()).hexdigest()
corpus=s/'reshape-confirmation-v2';artifacts=s/'reshape-confirmation-artifacts-v2';manifest,plan,freeze=verify_freeze(corpus)
result=read(s/'reshape-confirmation-measurements-v2.json');summary=read(s/'reshape-confirmation-measurements-v2-summary.json');qualification=read(artifacts/'pair-qualification.json');build=read(artifacts/'pair-compile-receipt.json');remote=read(s/'reshape-confirmation-remote-verification-v2.json')
assert result['status']==build['status']=='complete' and result['membership_sha256']==summary['membership_sha256']==manifest['membership_sha256']
assert result['plan']==plan and result['freeze_sha256']==sha(corpus/'confirmation-freeze.json') and result['qualification_sha256']==sha(artifacts/'pair-qualification.json')
assert remote['matches'] and remote['snapshot']==freeze['execution_source_snapshot']
assert result['reference_backend_numerics']=={'float32_matmul_precision':'highest','allow_tf32':False}
assert [r['graph'] for r in result['records']]==[r['graph'] for r in manifest['variants']]
assert len(result['records'])==20 and len({r['model'] for r in result['records']})==20
assert collections.Counter(r['category'] for r in manifest['variants'])=={'matrix':10,'reduction':10}
for relative,digest in freeze['execution_source_snapshot']['files'].items():
 raw=subprocess.check_output(['git','show',freeze['execution_code_revision']+':'+relative],cwd=repo)
 assert hashlib.sha256(raw).hexdigest()==digest,relative
excluded=set();spec=read(corpus/'selection-spec.json');up=s/'upstream'
for sample in (up/spec['evaluation_list']).read_text().splitlines():
 for graph in (up/sample/'graph_list.txt').read_text().splitlines():excluded.add(model_of(graph))
for filename in spec['excluded_manifests']:
 for r in read(corpus/filename)['variants']:excluded.add(model_of(r['graph']))
assert not excluded.intersection(r['model'] for r in manifest['variants'])
for name,digest in result['passbench_source_sha256'].items():assert sha(up/name)==digest
paths=[];expected_fingerprints=[];all_bodies={};production={}
for variant in build['variants']:
 role=variant['role'];production[role]=variant['production_snapshot'];receipt=read(artifacts/role/'compile-receipt.json')
 assert variant['returncode']==0 and [r['graph'] for r in receipt['records']]==[r['graph'] for r in manifest['variants']]
 assert production[role]==read(corpus/plan['compiler_variants'][role]['production_snapshot'])
 for index,(compiled,source) in enumerate(zip(receipt['records'],manifest['variants'])):
  assert compiled['status']=='compiled';q=qualification['records'][role][index];path=artifacts/role/q['artifact'];artifact=read(path)
  assert sha(path)==q['artifact_sha256'] and q['fingerprint']==compiled['fingerprint']
  assert artifact['source']['sha256']==source['source_sha256']==sha(corpus/source['script'])
  assert artifact['source']['contraction']=='separate' and artifact['codegen']=='kiln-codegen/3'
  assert {x['dtype'] for x in artifact['inputs']+artifact['outputs']}=={'f32'}
  for name,digest in source['source_files_sha256'].items():assert sha(up/source['graph']/name)==digest
  paths.append(str(path));expected_fingerprints.append(q['fingerprint'])
  all_bodies.setdefault(q['semantic_sha256'],[]).append({'role':role,'graph':source['graph']})
assert production['baseline'].keys()==production['candidate'].keys()
assert [n for n in production['baseline'] if production['baseline'][n]!=production['candidate'][n]]==['packages/kiln/src/std/tensor.js']
code="import{readFileSync}from'node:fs';import{createHash}from'node:crypto';const paths=JSON.parse(readFileSync(0,'utf8'));console.log(JSON.stringify(paths.map(p=>{const a=JSON.parse(readFileSync(p,'utf8'));delete a.name;delete a.source;delete a.compiler_policy;return createHash('sha256').update(JSON.stringify(a)).digest('hex')})))"
actual=json.loads(subprocess.check_output(['node','--input-type=module','-e',code],input=json.dumps(paths),text=True))
assert actual==expected_fingerprints,'Exact executable fingerprint mismatch'
rounds=0;samples=0;retry_attempts=0;groups=0;ratios=[];streams=[];failures=[];changed=0
close=lambda a,b:math.isclose(a,b,rel_tol=1e-12,abs_tol=1e-12)
for expected,row,reported in zip(manifest['variants'],result['records'],summary['records']):
 assert (row['graph'],row['sample'],row['model'])==(expected['graph'],expected['sample'],expected['model'])
 assert set(row['bindings'])=={'baseline','candidate'} and set(row['measurements'])==set(row['bindings'].values())
 assert not row.get('reference_error')
 for role in ['baseline','candidate']:assert row['bindings'][role]==qualification['records'][role][manifest['variants'].index(expected)]['fingerprint']
 for measured in row['measurements'].values():
  groups+=1;assert measured['status']=='measured' and len(measured['rounds'])==plan['repeats']
  assert all(math.isfinite(v) and v>=0 for v in measured['output_max_abs_errors'])
  for repeat,block in enumerate(measured['rounds']):
   rounds+=1;assert block['repeat']==repeat and block['stable'];assert 1<=len(block['attempts'])<=plan['max_retries']+1
   retry_attempts+=len(block['attempts'])-1
   for index,attempt in enumerate(block['attempts']):
    stable=True
    for field,raw_field in [('e2e_ms','raw_e2e_ms'),('stream_elapsed_ms','raw_stream_elapsed_ms')]:
     values=attempt[raw_field];assert len(values)==plan['trials'] and all(math.isfinite(v) and v>=0 for v in values);samples+=len(values)
     q=statistics.quantiles(values,n=4,method='inclusive');median=statistics.median(values);iqr=q[2]-q[0]
     assert close(attempt[field]['median'],median) and close(attempt[field]['iqr'],iqr) and median>0
     stable=stable and iqr<=plan['max_iqr_fraction']*median
    assert stable==(index==len(block['attempts'])-1),'Retry continued after stable measurement or ended unstable'
  for field,key in [('e2e_ms','e2e_median_ms'),('stream_elapsed_ms','stream_elapsed_median_ms')]:
   median=statistics.median(block['attempts'][-1][field]['median'] for block in measured['rounds']);assert close(measured[key],median)
 a=row['measurements'][row['bindings']['baseline']];b=row['measurements'][row['bindings']['candidate']]
 ratio=a['e2e_median_ms']/b['e2e_median_ms'];stream=a['stream_elapsed_median_ms']/b['stream_elapsed_median_ms'];ratios.append(math.log(ratio));streams.append(math.log(stream))
 assert reported['graph']==row['graph'] and close(reported['e2e_speedup'],ratio) and close(reported['stream_speedup'],stream)
 changed+=row['bindings']['baseline']!=row['bindings']['candidate']
 if row['bindings']['baseline']==row['bindings']['candidate']:assert ratio==stream==1
assert summary['qualified'] and not summary['failures'] and not build['compile_failures']
assert changed==summary['changed_executables']==19 and groups==39 and rounds==117
assert close(summary['family_balanced_e2e_speedup'],math.exp(sum(ratios)/len(ratios)))
assert close(summary['family_balanced_stream_speedup'],math.exp(sum(streams)/len(streams)))
cross_graph=[rows for rows in all_bodies.values() if len({r['graph'] for r in rows})>1]
facts={'format':'kiln-fixed-compiler-confirmation-audit/1','qualified':True,'graphs':20,'exact_models':20,'excluded_models':len(excluded),'source_files_verified':len(freeze['execution_source_snapshot']['files']),'compiler_artifacts_verified':len(paths),'production_files_per_compiler':len(production['baseline']),'changed_executables':changed,'distinct_measurement_groups':groups,'repeat_blocks_verified':rounds,'raw_timing_samples_verified':samples,'additional_retry_attempts':retry_attempts,'family_balanced_e2e_speedup':summary['family_balanced_e2e_speedup'],'family_balanced_stream_speedup':summary['family_balanced_stream_speedup'],'cross_graph_exact_artifact_aliases':cross_graph,'evidence_sha256':{n:sha(s/n) for n in ['reshape-confirmation-measurements-v2.json','reshape-confirmation-measurements-v2-summary.json','reshape-confirmation-artifacts-v2/pair-qualification.json','reshape-confirmation-v2/confirmation-freeze.json']},'scope':'Fresh exact-model, resource-bounded, highest-FP32 compiler confirmation; not architecture-disjoint, not native PassBench scoring, no calibrated confidence claim'}
write=s/'reshape-confirmation-independent-audit-v2.json';write.write_text(json.dumps(facts,indent=2)+'\n');print(json.dumps(facts,indent=2))
