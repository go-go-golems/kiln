#!/usr/bin/env python3
"""Compare complete development replays with exact executable structure labels."""
import collections,hashlib,json,math
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';load=lambda name:json.loads((s/name).read_text())
old=load('softmax-cohort-v2/run.json');new=load('softmax-cohort-v3/run.json')
assert old['status']==new['status']=='complete' and old['plan']==new['plan']
assert old['plan_sha256']==new['plan_sha256']
assert old['image_id']==new['image_id'] and old['node_version']==new['node_version']
timings={name:{r['graph']:r for r in load(name+'-latencies.json')['records']} for name in ['softmax-cohort-v2','softmax-cohort-v3']}
assert timings['softmax-cohort-v2'].keys()==timings['softmax-cohort-v3'].keys()
artifacts={};sources={}
for name,run in [('softmax-cohort-v2',old),('softmax-cohort-v3',new)]:
 artifacts[name]={};sources[name]={}
 for task in run['records']:
  directory=s/name/task['directory']/'corpus';manifest=load(str(directory.relative_to(s)/'manifest.json'));receipt=load(str(directory.relative_to(s)/'compile-receipt.json'))
  for row,compiled in zip(manifest['variants'],receipt):
   assert row['graph']==compiled['graph'] and compiled['returncode']==0
   artifact=json.loads((directory/compiled['artifact']).read_text())
   # Same metadata exclusions as compile_policy.mjs; preserve every executable field.
   executable={k:v for k,v in artifact.items() if k not in ('name','source')}
   artifacts[name][row['graph']]=executable;sources[name][row['graph']]=row['source_sha256']
assert sources['softmax-cohort-v2']==sources['softmax-cohort-v3'],'Generated source programs changed'
rows=[];families=collections.defaultdict(list);gpu_families=collections.defaultdict(list);failures=[]
for graph,before in timings['softmax-cohort-v2'].items():
 after=timings['softmax-cohort-v3'][graph];a=artifacts['softmax-cohort-v2'][graph];b=artifacts['softmax-cohort-v3'][graph]
 row={'graph':graph,'task_index':before['task_index'],'baseline_accepted':before['nominal_accepted'],'candidate_accepted':after['nominal_accepted'],'exact_executable_changed':a!=b,'baseline_schedules':[k['row'] for k in a['kernels']],'candidate_schedules':[k['row'] for k in b['kernels']]}
 if before['nominal_accepted'] and after['nominal_accepted']:
  e2e=before['compiled_e2e_ms']/after['compiled_e2e_ms'];gpu=before['compiled_gpu_ms']/after['compiled_gpu_ms'];families[row['task_index']].append(math.log(e2e));gpu_families[row['task_index']].append(math.log(gpu))
  row.update(baseline_ms=before['compiled_e2e_ms'],candidate_ms=after['compiled_e2e_ms'],e2e_speedup=e2e,gpu_speedup=gpu)
 else:failures.append(graph)
 rows.append(row)
balanced=lambda groups:math.exp(sum(sum(v)/len(v) for v in groups.values())/len(groups))
result={'format':'kiln-reshape-development-comparison/1','scope':'Observed development corpus, sequential original replays; not held-out or paired statistical performance evidence','baseline_source_snapshot':old['source_snapshot']['sha256'],'candidate_source_snapshot':new['source_snapshot']['sha256'],'unchanged_generated_source_programs':len(sources['softmax-cohort-v2']),'graphs':len(rows),'families':len(old['plan']['tasks']),'candidate_failures':failures,'exact_executables_changed':sum(r['exact_executable_changed'] for r in rows),'family_balanced_e2e_speedup':None if failures else balanced(families),'family_balanced_gpu_speedup':None if failures else balanced(gpu_families),'records':rows,'limitations':['Same development examples motivated the manual rewrite; no unseen-program generalization claim.','Identical executable structures have separate timing runs; their differences are noise/overhead observations, not optimization contrasts.','No timing or correctness threshold is relaxed; failures disable aggregate speedup reporting.']}
(s/'singleton-reshape-development-comparison.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k not in ('records',)},indent=2))
