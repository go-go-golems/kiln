"""Audit frozen task membership, exact replacements and numerical tolerance curves."""
import argparse,contextlib,hashlib,io,json,sys
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--directory',type=Path,required=True);p.add_argument('--upstream',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
a=p.parse_args();sys.path.insert(0,str(a.upstream.resolve()))
from pass_bench import analysis_util
run=json.loads((a.directory/'run.json').read_text());plan=run['plan']
if run['status']!='complete':raise ValueError('Run is incomplete')
if [r['index'] for r in run['records']]!=[r['index'] for r in plan['tasks']]:raise ValueError('Incomplete task accounting')
rows=[];tolerances=[-5,-4,-3,1]
for task in run['records']:
    directory=a.directory/task['directory'];log=directory/'benchmark.log'
    expected=(a.upstream/task['sample']/'graph_list.txt').read_text().splitlines()
    if len(expected)!=task['graphs_expected']:raise ValueError('Expected task membership changed')
    parsed=[]
    if log.exists():
        with contextlib.redirect_stdout(io.StringIO()):parsed=analysis_util.parse_logs_to_data(str(log))
    observed=[r['model_path'].removeprefix('/work/upstream/') for r in parsed]
    if observed!=expected[:len(observed)] or len(set(observed))!=len(observed):raise ValueError('Unexpected or duplicate evaluated graphs')
    blocks=log.read_text().split('graph-net-test-compiler-log [Processing] ')[1:] if log.exists() else []
    graphs=[]
    for index,graph in enumerate(expected):
        if index>=len(parsed):graphs.append({'graph':graph,'status':'not_executed','reason':task.get('failed_phase','missing_evidence')});continue
        sample=parsed[index];matches=blocks[index].count('Applied 1 replacements')
        decisions={str(t):bool(sample['correctness'].get('[equal]')) and analysis_util.check_sample_correctness(sample,t)[0] for t in tolerances}
        execution_ok=sample['status']=='correct' and blocks[index].count('[Result] status: success')==1 and '[Result] status: failed' not in blocks[index]
        graphs.append({'graph':graph,'execution_status':sample['status'],'execution_ok':execution_ok,'matches':matches,'correct_at':decisions,'nominal_accepted':execution_ok and matches==1 and decisions['-5']})
    complete=len(parsed)==len(expected)
    score=json.loads((directory/'score.json').read_text()) if complete and (directory/'score.json').exists() else None
    rows.append({'index':task['index'],'sample':task['sample'],'complete_evidence':complete,'score':score,'graph_count':len(expected),'nominal_accepted':all(g.get('nominal_accepted',False) for g in graphs),'graphs':graphs,'log_sha256':hashlib.sha256(log.read_bytes()).hexdigest() if log.exists() else None})
result={'format':'kiln-task-run-audit/1','scope':run['scope'],'tasks_expected':len(rows),'graphs_expected':sum(r['graph_count'] for r in rows),'tasks_nominal_accepted':sum(r['nominal_accepted'] for r in rows),'graphs_nominal_accepted':sum(g.get('nominal_accepted',False) for r in rows for g in r['graphs']),'unexecuted_graphs':sum(g.get('status')=='not_executed' for r in rows for g in r['graphs']),'source_snapshot_sha256':run['source_snapshot']['sha256'],'records':rows}
a.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='records'}))
