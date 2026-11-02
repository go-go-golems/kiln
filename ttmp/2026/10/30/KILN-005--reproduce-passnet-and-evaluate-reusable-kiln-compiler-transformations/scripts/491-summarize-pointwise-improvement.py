"""Compare complete native replay evidence; do not confuse this with fresh confirmation."""
import contextlib,io,json,math,sys
from pathlib import Path
T=Path(__file__).resolve().parent.parent;s=T/'sources'
sys.path.insert(0,str(s/'upstream'))
from pass_bench.analysis_util import parse_logs_to_data
before=s/'avg-pooling-task-results-v1/task-101';after=s/'pointwise-pooling-task-results-v2/task-101'
audit=json.loads((s/'pointwise-pooling-task-audit-v2.json').read_text())
assert audit['tasks_nominal_accepted']==1 and audit['graphs_nominal_accepted']==6
with contextlib.redirect_stdout(io.StringIO()):
 old=parse_logs_to_data(str(before/'benchmark.log'));new=parse_logs_to_data(str(after/'benchmark.log'))
assert len(old)==len(new)==6
rows=[]
for a,b in zip(old,new):
 assert a['model_path']==b['model_path']
 ap=json.loads(a['performance']['compiled']);bp=json.loads(b['performance']['compiled']);eager=json.loads(b['performance']['eager'])
 rows.append({'graph':a['model_path'].removeprefix('/work/upstream/'),'baseline_e2e_ms':ap['e2e']['median'],'candidate_e2e_ms':bp['e2e']['median'],
  'speedup_vs_previous_kiln':ap['e2e']['median']/bp['e2e']['median'],'candidate_vs_eager':eager['e2e']['median']/bp['e2e']['median']})
result={'scope':'Exploratory sequential runs on the same development family; no fresh generalization or paired-interleaved timing claim.',
 'graphs':6,'all_native_nominal_accepted':True,'geomean_speedup_vs_previous_kiln':math.exp(sum(math.log(r['speedup_vs_previous_kiln']) for r in rows)/6),
 'baseline_score':json.loads((before/'score.json').read_text())['score'],'candidate_score':json.loads((after/'score.json').read_text())['score'],'records':rows}
(s/'pointwise-pooling-improvement-v1.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
