#!/usr/bin/env python3
"""Audit exact original-reference membership and original numerical decisions."""
import argparse
from collections import Counter
import contextlib
import hashlib
import io
import json
from pathlib import Path
import sys
p=argparse.ArgumentParser(description=__doc__)
for name in ['logs','upstream','output']:p.add_argument('--'+name,type=Path,required=True)
a=p.parse_args();sys.path.insert(0,str(a.upstream.resolve()))
from pass_bench import analysis_util
receipt=json.loads((a.logs/'execution-receipt.json').read_text())
if len(receipt)!=200:raise ValueError('Expected 200 task receipts')
tasks=[];seen=set();failures=Counter();status=Counter();all_hashes={}
for index,task in enumerate(receipt):
 log=a.logs/f'{index:03d}-inductor.log';all_hashes[log.name]=hashlib.sha256(log.read_bytes()).hexdigest()
 expected=(a.upstream/task['sample']/'graph_list.txt').read_text().splitlines()
 with contextlib.redirect_stdout(io.StringIO()):parsed=analysis_util.parse_logs_to_data(str(log))
 observed=[r['model_path'].removeprefix('/work/upstream/') for r in parsed]
 if observed!=expected:raise ValueError(f'Graph membership/order mismatch: {index}')
 rows=[]
 for graph,row in zip(observed,parsed):
  if graph in seen:raise ValueError('Duplicate graph across tasks')
  seen.add(graph)
  if row['status']=='correct' and not row['correctness'].get('[equal]'):raise ValueError('Missing numerical evidence')
  correct,reason=analysis_util.check_sample_correctness(row,1)
  status[row['status']]+=1
  if not correct:failures[reason]+=1
  rows.append({'graph':graph,'execution_status':row['status'],'correct_at_t1':correct,'failure':reason,'speedup':row['performance']['speedup']})
 tasks.append({'index':index,'sample':task['sample'],'returncode':task['returncode'],'all_graphs_correct_at_t1':all(r['correct_at_t1'] for r in rows),'graphs':rows})
if len(seen)!=2060:raise ValueError('Expected 2060 graph variants')
result={'format':'kiln-reference-audit/1','tasks':200,'graphs':len(seen),'complete_tasks_correct_at_t1':sum(t['all_graphs_correct_at_t1'] for t in tasks),'graphs_correct_at_t1':len(seen)-sum(failures.values()),'failures_at_t1':dict(failures),'execution_statuses':dict(status),'log_sha256':all_hashes,'records':tasks,'limitations':['GB10 and NVIDIA PyTorch alpha differ from paper hardware/software','Historical reference timings overlapped development or were paused: exploratory, not final controlled performance evidence','Numerical correctness uses pinned upstream check_sample_correctness tolerance 1, not execution success']}
a.output.write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['records','log_sha256']}))
