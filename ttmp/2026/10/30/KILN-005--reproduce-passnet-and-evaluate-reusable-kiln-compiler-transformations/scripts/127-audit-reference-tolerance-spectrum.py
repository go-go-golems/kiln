#!/usr/bin/env python3
"""Distinguish nominal strict numerical acceptance from relaxed t=1 labels."""
import contextlib,hashlib,io,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1];upstream=root/'sources/upstream';sys.path.insert(0,str(upstream))
from pass_bench import analysis_util
logs=Path('/tmp/kiln-reference-full');receipt=json.loads((logs/'execution-receipt.json').read_text())
tolerances=[-5,-4,-3,1];tasks=[];seen=set()
for index,task in enumerate(receipt):
 with contextlib.redirect_stdout(io.StringIO()):parsed=analysis_util.parse_logs_to_data(str(logs/f'{index:03d}-inductor.log'))
 expected=(upstream/task['sample']/'graph_list.txt').read_text().splitlines()
 observed=[r['model_path'].removeprefix('/work/upstream/') for r in parsed]
 assert observed==expected
 rows=[]
 for graph,sample in zip(observed,parsed):
  assert graph not in seen;seen.add(graph)
  decisions={str(t):analysis_util.check_sample_correctness(sample,t) for t in tolerances}
  assert sample['status']!='correct' or sample['correctness'].get('[equal]')
  rows.append({'graph':graph,'decisions':decisions})
 tasks.append({'sample':task['sample'],'graphs':rows})
assert len(tasks)==200 and len(seen)==2060
summary={str(t):{'graphs_correct':sum(r['decisions'][str(t)][0] for task in tasks for r in task['graphs']),
                 'complete_tasks_correct':sum(all(r['decisions'][str(t)][0] for r in task['graphs']) for task in tasks)} for t in tolerances}
result={'format':'kiln-reference-numerical-spectrum/1','tolerances':tolerances,'tasks':200,'graphs':2060,'summary':summary,'source_archive_sha256':hashlib.sha256((root/'sources/reference-full-logs.tar.gz').read_bytes()).hexdigest(),'records':tasks,'limitations':['Same historical exploratory timing limitations apply','Strict production regime in paper is [-5,-3]; t=1 is relaxed and cannot be described as nominal accuracy']}
(root/'sources/reference-numerical-threshold-audit.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(summary))
