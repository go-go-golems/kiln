"""Frozen fixed-compiler comparisons, sharing existing compiler/runtime primitives."""
import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
import shutil
import subprocess
from evaluate_tasks import snapshot

ROLES=('baseline','candidate')

def read(path):return json.loads(Path(path).read_text())
def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def write(path,value):
    path=Path(path);path.write_text(json.dumps(value,indent=2)+'\n')

def verify_freeze(corpus,repo=None):
    corpus=Path(corpus);frozen=read(corpus/'confirmation-freeze.json')
    for relative,digest in frozen['files_sha256'].items():
        if sha(corpus/relative)!=digest:raise ValueError('Declaration/source changed: '+relative)
    manifest=read(corpus/'manifest.json')
    identity=hashlib.sha256(json.dumps(manifest['variants'],sort_keys=True).encode()).hexdigest()
    if identity!=manifest['membership_sha256'] or identity!=frozen['membership_sha256']:raise ValueError('Confirmation membership changed')
    if any(r['split']!='heldout' for r in manifest['variants']):raise ValueError('Confirmation cannot contain training rows')
    if repo is not None and snapshot(Path(repo))!=frozen['execution_source_snapshot']:raise ValueError('Execution sources differ from frozen code')
    return manifest,read(corpus/'confirmation-plan.json'),frozen

def freeze(corpus,declaration,repo):
    corpus=Path(corpus).resolve();repo=Path(repo).resolve();declaration=Path(declaration).resolve()
    if (corpus/'confirmation-freeze.json').exists():raise ValueError('Preserve existing freeze')
    plan=read(declaration);manifest=read(corpus/'manifest.json')
    if plan['selection_spec_sha256']!=sha(corpus/'selection-spec.json'):raise ValueError('Selection declaration changed')
    if manifest['numerical_policy']!=plan['numerical_policy']:raise ValueError('Numerical contract mismatch')
    spec=read(corpus/'selection-spec.json');rows=manifest['variants']
    counts={category:sum(r['category']==category for r in rows) for category in ['matrix','reduction']}
    if spec['train_per_category']!=0 or any(n!=spec['heldout_per_category'] for n in counts.values()) or len(rows)!=sum(counts.values()):raise ValueError('Incomplete declared confirmation quotas')
    if len({r['model'] for r in rows})!=len(rows) or len({r['sample'] for r in rows})!=len(rows):raise ValueError('Confirmation families/tasks must be unique')
    shutil.copyfile(declaration.parent/'reshape-confirmation-node-dependencies-v1.json',corpus/'node-dependencies.json')
    shutil.copyfile(declaration,corpus/'confirmation-plan.json')
    spec=read(corpus/'selection-spec.json')
    for name in spec['excluded_manifests']:
        if sha(declaration.parent/name)!=plan['exclusion_sha256']:raise ValueError('Exclusion declaration changed')
        shutil.copyfile(declaration.parent/name,corpus/Path(name).name)
    for role in ROLES:
        variant=plan['compiler_variants'][role]
        for name in ['relative_path','production_snapshot']:
            target=corpus/variant[name];target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(declaration.parent/variant[name],target)
        config=corpus/'policies'/(role+'.json');config.parent.mkdir(exist_ok=True)
        write(config,{'format':'kiln-fusion-policy/1','id':role,'kind':'unchanged','provenance':'Unchanged fusion policy in the separately pinned compiler source version; not a policy-search candidate'})
    state=snapshot(repo);revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
    for relative,digest in state['files'].items():
        raw=subprocess.check_output(['git','show',revision+':'+relative],cwd=repo)
        if hashlib.sha256(raw).hexdigest()!=digest:raise ValueError('Commit execution sources before freezing: '+relative)
    files=[p for p in corpus.rglob('*') if p.is_file()]
    write(corpus/'confirmation-freeze.json',{'format':'kiln-fixed-compiler-confirmation-freeze/1','membership_sha256':manifest['membership_sha256'],'execution_code_revision':revision,'execution_source_snapshot':state,'files_sha256':{str(p.relative_to(corpus)):sha(p) for p in files}})
    return verify_freeze(corpus,repo)

def production_snapshot(repo,expected):
    actual={name:sha(Path(repo)/name) for name in expected}
    if actual!=expected:raise ValueError('Compiler production sources differ from pinned inventory')
    return actual

def compile_pair(corpus,output,baseline,candidate):
    corpus=Path(corpus).resolve();output=Path(output).resolve();candidate=Path(candidate).resolve();baseline=Path(baseline).resolve()
    manifest,plan,frozen=verify_freeze(corpus,candidate)
    if output.exists():raise ValueError('Preserve previous compilation')
    output.mkdir(parents=True);records={};source_snapshots={}
    dependencies=read(corpus/'node-dependencies.json')
    if subprocess.check_output(['node','--version'],text=True).strip()!=dependencies['node']:raise ValueError('Compiler Node version differs from dependency declaration')
    receipt={'format':'kiln-compiler-pair-compilation/1','status':'running','membership_sha256':manifest['membership_sha256'],'execution_code_revision':frozen['execution_code_revision'],'node':subprocess.check_output(['node','--version'],text=True).strip(),'variants':[]}
    for role,root in [('baseline',baseline),('candidate',candidate)]:
        variant=plan['compiler_variants'][role];expected=read(corpus/variant['production_snapshot'])
        production_snapshot(root,expected);source_snapshots[role]=expected
        for relative,digest in dependencies['acorn_files_sha256'].items():
            if sha(root/'node_modules/acorn'/relative)!=digest:raise ValueError('Parser dependency changed')
        for name in ['kiln','evidence']:
            if (root/'node_modules/@kiln'/name).resolve()!=(root/'packages'/name):raise ValueError('Workspace dependency resolves into another compiler tree')
        command=['node',str(root/'integrations/passnet/compile_policy.mjs'),'--directory',str(corpus),'--output',str(output/role),'--policy',str(corpus/'policies'/(role+'.json')),'--target',plan['target'],'--phase','all']
        with (output/(role+'.log')).open('w') as log:result=subprocess.run(command,cwd=root,stdout=log,stderr=subprocess.STDOUT)
        production_snapshot(root,expected);verify_freeze(corpus,candidate)
        receipt['variants'].append({'role':role,'checkout_revision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'production_snapshot':expected,'command':command,'returncode':result.returncode})
        write(output/'pair-compile-receipt.json',receipt)
        records[role]=read(output/role/'compile-receipt.json')
    if source_snapshots['baseline'].keys()!=source_snapshots['candidate'].keys():raise ValueError('Different production file sets')
    differences=[n for n in source_snapshots['baseline'] if source_snapshots['baseline'][n]!=source_snapshots['candidate'][n]]
    if differences!=plan['expected_production_source_differences']:raise ValueError('Unexpected production compiler changes')
    fingerprints={};qualified={};failures=[]
    for role in ROLES:
        compiled=records[role]
        if compiled['membership_sha256']!=manifest['membership_sha256'] or compiled['numerical_policy']!=plan['numerical_policy']:raise ValueError('Compiled numerical or membership mismatch')
        if [r['graph'] for r in compiled['records']]!=[r['graph'] for r in manifest['variants']]:raise ValueError('Incomplete compilation membership')
        qualified[role]=[]
        for row,variant in zip(compiled['records'],manifest['variants']):
            if row['status']!='compiled':
                failures.append({'graph':row['graph'],'role':role,'error':row['error']});qualified[role].append(None);continue
            path=output/role/row['artifact'];artifact=read(path)
            if artifact['source']['sha256']!=variant['source_sha256'] or artifact['source']['contraction']!=plan['numerical_policy']['contraction']:raise ValueError('Artifact source/policy mismatch')
            if artifact['compiler_policy']!=read(corpus/'policies'/(role+'.json')):raise ValueError('Unexpected fusion policy')
            body={k:v for k,v in artifact.items() if k not in ('name','source','compiler_policy')}
            semantic=hashlib.sha256(json.dumps(body,sort_keys=True).encode()).hexdigest()
            prior=fingerprints.setdefault(row['fingerprint'],semantic)
            if prior!=semantic:raise ValueError('Fingerprint aliases distinct executable structures')
            qualified[role].append({'artifact':row['artifact'],'artifact_sha256':sha(path),'fingerprint':row['fingerprint'],'semantic_sha256':semantic})
    receipt.update(status='complete',production_differences=differences,compile_failures=failures)
    write(output/'pair-compile-receipt.json',receipt)
    write(output/'pair-qualification.json',{'format':'kiln-compiler-pair-qualification/1','membership_sha256':manifest['membership_sha256'],'compile_failures':failures,'records':qualified})
    return receipt

def summarize(manifest,plan,result):
    if result['status']!='complete':raise ValueError('Incomplete confirmation')
    if [r['graph'] for r in result['records']]!=[r['graph'] for r in manifest['variants']]:raise ValueError('Incomplete or reordered confirmation graphs')
    rows=[];failures=[];families=defaultdict(list);gpu=defaultdict(list)
    for expected,row in zip(manifest['variants'],result['records']):
        if row['model']!=expected['model'] or row['sample']!=expected['sample']:raise ValueError('Family identity mismatch')
        known=all(role in row['bindings'] and not row['bindings'][role].startswith(('compile-failed-','reference-failed-')) for role in ROLES)
        item={'graph':row['graph'],'model':row['model'],'category':expected['category'],'exact_executable_changed':row['bindings'].get('baseline')!=row['bindings'].get('candidate') if known else None}
        measurements=[row['measurements'][row['bindings'][role]] for role in ROLES]
        item['statuses']={role:m['status'] for role,m in zip(ROLES,measurements)}
        if row.get('reference_error'):item['reference_error']=row['reference_error']
        if row.get('reference_error') or any(m['status']!='measured' or len(m['rounds'])!=plan['repeats'] for m in measurements):failures.append(item)
        else:
            a,b=measurements;ratio=a['e2e_median_ms']/b['e2e_median_ms'];stream=a['stream_elapsed_median_ms']/b['stream_elapsed_median_ms']
            item.update(baseline_ms=a['e2e_median_ms'],candidate_ms=b['e2e_median_ms'],e2e_speedup=ratio,stream_speedup=stream,paired_repeat_e2e_speedups=[x['attempts'][-1]['e2e_ms']['median']/y['attempts'][-1]['e2e_ms']['median'] for x,y in zip(a['rounds'],b['rounds'])])
            families[row['model']].append(math.log(ratio));gpu[row['model']].append(math.log(stream))
        rows.append(item)
    balanced=lambda groups:math.exp(sum(sum(v)/len(v) for v in groups.values())/len(groups))
    return {'format':'kiln-fixed-compiler-confirmation-summary/1','scope':plan['scope'],'membership_sha256':manifest['membership_sha256'],'graphs':len(rows),'families':len({r['model'] for r in rows}),'qualified':not failures,'failures':failures,'changed_executables':sum(r['exact_executable_changed'] is True for r in rows),'family_balanced_e2e_speedup':None if failures else balanced(families),'family_balanced_stream_speedup':None if failures else balanced(gpu),'records':rows,'limitations':['Fixed change selected on previous development cases; this is fresh exact-model confirmation, not architecture-disjoint evaluation.','Three randomized paired repeat blocks are descriptive; no calibrated confidence interval.','Exact executable aliases share measurements and are not independent performance contrasts.','Highest-precision FP32 source reference is an explicit research protocol, not native PassBench acceptance.']}

def main():
    parser=argparse.ArgumentParser(description=__doc__);sub=parser.add_subparsers(dest='command',required=True)
    prepare=sub.add_parser('freeze')
    for name in ['corpus','declaration','repo']:prepare.add_argument('--'+name,type=Path,required=True)
    build=sub.add_parser('compile')
    for name in ['corpus','output','baseline','candidate']:build.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args()
    if args.command=='freeze':freeze(args.corpus,args.declaration,args.repo)
    else:compile_pair(args.corpus,args.output,args.baseline,args.candidate)

if __name__=='__main__':main()
