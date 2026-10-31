"""Sequential host orchestration of frozen complete tasks through shared tools.

Process completion is not acceptance. Numerical/matching accounting belongs to
summarize_task_run.py. GPU evaluation stays sequential; source changes stop the
run rather than silently mixing compiler versions.
"""
import argparse,hashlib,json,subprocess,time
from pathlib import Path


def snapshot(kiln):
    files=set()
    for pattern in ['packages/*/src/**/*.js','packages/*/src/**/*.mjs','runtime/python/**/*.py','integrations/passnet/*.py']:
        files.update(kiln.glob(pattern))
    files.update(kiln/name for name in ['apps/workbench/src/compile.js','scripts/kiln-export.mjs','pnpm-lock.yaml'])
    rows={str(p.relative_to(kiln)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
    return {'files':rows,'sha256':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()}


def save(path,value):
    temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(value,indent=2)+'\n');temporary.replace(path)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['root','plan','output']:parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--image',default='localhost:5000/playback-redaction:base-26.05')
    args=parser.parse_args();root=args.root.resolve();kiln=root/'kiln';plan=json.loads(args.plan.read_text())
    indices=[case['index'] for case in plan['tasks']]
    if not indices or len(set(indices))!=len(indices):raise ValueError('Nonempty distinct task indices required')
    for case in plan['tasks']:
        expected=(root/'upstream'/case['sample']/'graph_list.txt').read_bytes()
        if hashlib.sha256(expected).hexdigest()!=case['graph_list_sha256'] or len(expected.decode().splitlines())!=case['graphs']:
            raise ValueError('Frozen task membership changed')
    if args.output.exists():raise ValueError('Preserve earlier runs; choose a new output directory')
    output=args.output.resolve();relative=output.relative_to(root);output.mkdir(parents=True)
    initial=snapshot(kiln)
    result={'format':'kiln-task-run/1','status':'running','plan':plan,'plan_sha256':hashlib.sha256(args.plan.read_bytes()).hexdigest(),
            'source_snapshot':initial,'node_version':subprocess.check_output(['node','--version'],text=True).strip(),
            'image_id':subprocess.check_output(['docker','image','inspect','--format','{{.Id}}',args.image],text=True).strip(),
            'scope':'Exploratory ordered complete-task evaluation; original numerical curve and scorer retained; no process-exit acceptance claim','records':[]}
    path=output/'run.json';save(path,result)
    def docker(command,*,gpu=False,work='/work/kiln/integrations/passnet'):
        return ['docker','run','--rm',*(['--gpus','all'] if gpu else []),'-v',str(root)+':/work','-w',work,'--entrypoint','python',args.image,*command]
    for case in plan['tasks']:
        if snapshot(kiln)!=initial:raise RuntimeError('Compiler/runtime source changed during run; preserve this checkpoint')
        directory=output/f"task-{case['index']:03d}";directory.mkdir();corpus=directory/'corpus';corpus.mkdir()
        mounted=Path('/work')/relative/directory.name
        stage='from pathlib import Path;from corpus import export_task;from generate_pass import generate;'+\
              'export_task(Path("/work/upstream"),'+repr(case['sample'])+',Path('+repr(str(mounted/'corpus'))+'));'+\
              'generate(Path('+repr(str(mounted/'corpus'))+'),Path("/work/upstream"),Path('+repr(str(mounted/'passes'))+'),Path('+repr(str(mounted/'corpus'))+'))'
        phases=[('export',docker(['-c',stage])),
                ('compile',['python3','integrations/passnet/corpus.py','compile','--directory',str(corpus),'--kiln',str(kiln),'--target','a100']),
                ('evaluate',docker(['run_task.py','--directory',str(mounted/'corpus'),'--upstream','/work/upstream','--pass-directory',str(mounted/'passes'),'--log',str(mounted/'benchmark.log'),'--warmup','20','--trials','100'],gpu=True)),
                ('score',docker(['score_task.py','--log',str(mounted/'benchmark.log'),'--sample-id',str(case['index']+1),'--upstream','/work/upstream','--output',str(mounted/'score.json')]))]
        row={'index':case['index'],'sample':case['sample'],'graphs_expected':case['graphs'],'directory':directory.name,'status':'running','phases':[]};result['records'].append(row);save(path,result)
        for phase,command in phases:
            row['current_phase']=phase;save(path,result);started=time.monotonic()
            print('START',case['index'],phase,flush=True)
            with (directory/(phase+'.log')).open('w') as log:
                completed=subprocess.run(command,cwd=kiln,stdout=log,stderr=subprocess.STDOUT)
            row['phases'].append({'phase':phase,'command':command,'returncode':completed.returncode,'elapsed_seconds':time.monotonic()-started})
            save(path,result);print('DONE',case['index'],phase,completed.returncode,flush=True)
            if snapshot(kiln)!=initial:raise RuntimeError('Compiler/runtime source changed during phase')
            if completed.returncode:
                row.update(status='phase_failed',failed_phase=phase);break
        else:row['status']='process_complete'
        save(path,result)
    result['status']='complete';save(path,result)


if __name__=='__main__':main()
