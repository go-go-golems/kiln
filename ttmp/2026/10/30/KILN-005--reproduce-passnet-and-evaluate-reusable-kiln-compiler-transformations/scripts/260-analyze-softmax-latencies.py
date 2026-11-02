#!/usr/bin/env python3
"""Describe original replay timings only for nominally accepted graph records."""
import argparse,contextlib,io,json,sys
from pathlib import Path
p=Path(__file__).resolve().parents[1];s=p/'sources';parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--cohort',required=True);args=parser.parse_args()
if Path(args.cohort).name!=args.cohort:raise ValueError('Cohort basename required')
sys.path.insert(0,str(s/'upstream'))
from pass_bench.analysis_util import parse_logs_to_data
root=s/args.cohort;audit=json.loads((s/(args.cohort+'-audit.json')).read_text());rows=[]
for task in audit['records']:
 log=root/f"task-{task['index']:03d}"/'benchmark.log'
 with contextlib.redirect_stdout(io.StringIO()):parsed=parse_logs_to_data(str(log))
 if len(parsed)!=len(task['graphs']):raise ValueError('Incomplete timing membership')
 for expected,observed in zip(task['graphs'],parsed):
  if observed['model_path'].removeprefix('/work/upstream/')!=expected['graph']:raise ValueError('Unexpected timing graph')
  row={'graph':expected['graph'],'task_index':task['index'],'nominal_accepted':expected['nominal_accepted']}
  if expected['nominal_accepted']:
   perf=observed['performance'];eager=json.loads(perf['eager']);compiled=json.loads(perf['compiled'])
   row.update(eager_e2e_ms=eager['e2e']['median'],compiled_e2e_ms=compiled['e2e']['median'],eager_gpu_ms=eager['gpu']['median'],compiled_gpu_ms=compiled['gpu']['median'],e2e_speedup=eager['e2e']['median']/compiled['e2e']['median'],gpu_speedup=eager['gpu']['median']/compiled['gpu']['median'],compiled_e2e_iqr_fraction=compiled['e2e']['iqr']/compiled['e2e']['median'])
  rows.append(row)
accepted=[r for r in rows if r['nominal_accepted']]
result={'format':'kiln-softmax-replay-timings/1','scope':'Descriptive original GB10 replay; no controlled optimization contrast or paper-comparable aggregate claim','variants':len(rows),'accepted_with_timings':len(accepted),'faster_than_eager_e2e':sum(r['e2e_speedup']>1 for r in accepted),'slower_than_eager_e2e':sum(r['e2e_speedup']<1 for r in accepted),'slowest_e2e_ratio_records':sorted(accepted,key=lambda r:r['e2e_speedup'])[:3],'fastest_e2e_ratio_records':sorted(accepted,key=lambda r:r['e2e_speedup'],reverse=True)[:3],'records':rows}
(s/(args.cohort+'-latencies.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='records'},indent=2))
