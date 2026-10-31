"""Compare policy proposal methods through one trusted task and one evaluator.

This module owns search declarations, ledgers and method membership. Compilation,
correctness, timing and the ranking objective remain in the shared study modules.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import random
import re
import shutil
import subprocess
import sys
import time

from native_policy_task import NativePolicyTask, training_view, FEATURES, _write_new, _strict_json
from run_native_policy_agent import SYSTEM_PROMPT
from select_policy import rank_training


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),allow_nan=False).encode()).hexdigest()


def validate_protocol(protocol):
    if protocol.get('format')!='kiln-policy-search-protocol/1':raise ValueError('Invalid search protocol')
    budget=protocol.get('proposal_budget')
    if type(budget) is not int or not 1<=budget<=32:raise ValueError('Proposal allowance must be in [1,32]')
    searches=protocol.get('searches')
    if not isinstance(searches,list) or not searches:raise ValueError('Nonempty search methods required')
    ids=[]
    for search in searches:
        name=search.get('id')
        if not isinstance(name,str) or not re.fullmatch('[a-z0-9-]+',name):raise ValueError('Invalid search identity')
        ids.append(name)
        if search['method']=='threshold-grid':
            values=search.get('values')
            if not isinstance(values,list) or len(values)!=budget or any(type(v) not in (int,float) or not math.isfinite(v) or not 0<=v<=2 for v in values):
                raise ValueError('Threshold grid must use the shared proposal allowance')
        elif search['method']=='seeded-random':
            if type(search.get('seed')) is not int or not 0<=search['seed']<2**32:raise ValueError('Explicit random seed required')
        elif search['method']=='external-llm':
            if not isinstance(search.get('model'),str) or not search['model']:raise ValueError('Explicit model required')
            if any(type(search.get(k)) is not int or search[k]<1 for k in ['max_steps','completion_budget','per_turn_tokens']):
                raise ValueError('Explicit model budgets required')
        else:raise ValueError('Unknown search method')
    if len(ids)!=len(set(ids)):raise ValueError('Search identities must be unique')
    return budget


def baseline_programs(search, budget, view):
    """Predeclared finite random grammar; duplicates are emitted without retries."""
    values=[0.75,0.9,0.95,1.0,1.02,1.05,1.1,1.25,1.5,2.0]
    features=[d for example in view['examples'] for d in example['decisions']]
    if not features:raise ValueError('Training features required')
    rng=random.Random(search.get('seed',0))
    policies=[]
    for index in range(budget):
        policy={'format':'kiln-fusion-policy/1','id':f'{search["id"]}-{index+1}'}
        if search['method']=='threshold-grid':
            policy.update(kind='threshold',max_work_growth=search['values'][index])
        elif search['method']=='seeded-random':
            kind=rng.choice(['threshold','decision-tree','selective','region'])
            policy['kind']=kind
            if kind=='threshold':policy['max_work_growth']=rng.choice(values)
            elif kind=='region':policy.update(max_work_growth=rng.choice(values),
                launch_work=rng.choice([0,4096,32768,262144]),materialization_work=rng.choice([0,1,4,12,64]))
            else:
                feature=rng.choice(FEATURES)
                policy['tree']={'if':{'feature':feature,'op':rng.choice(['le','ge']),
                                      'value':rng.choice(features)[feature]},
                                'then':{'threshold':rng.choice(values)},'else':{'threshold':rng.choice(values)}}
                if kind=='selective':policy['consumer_tree']={
                    'if':{'feature':'consumerCount','op':'eq','value':1},
                    'then':{'accept':True},'else':{'threshold':rng.choice(values)}}
        else:raise ValueError('Baseline generator cannot impersonate an external model')
        policies.append(policy)
    return policies


def run_baseline(protocol, search_id, manifest, receipt, output, node='node'):
    budget=validate_protocol(protocol)
    search=next(s for s in protocol['searches'] if s['id']==search_id)
    output=Path(output);output.mkdir(parents=True,exist_ok=False)
    started=time.monotonic()
    task=NativePolicyTask(output/'task',manifest,receipt,proposal_budget=budget,node=node)
    policies=baseline_programs(search,budget,task.inspect_training())
    results=[task.submit_policy(json.dumps(policy,allow_nan=False)) for policy in policies]
    generation={'format':'kiln-policy-baseline-generation/1','protocol_sha256':digest(protocol),
                'search':search,'python':sys.version,'policies':policies,'results':results,'task':task.finish(),
                'elapsed_seconds':time.monotonic()-started}
    _write_new(output/'generation.json',generation)
    return generation


def collect_searches(protocol, runs, manifest, receipt, node='node'):
    """Verify every charged slot and accepted artifact before freezing candidates."""
    budget=validate_protocol(protocol)
    if set(runs)!={s['id'] for s in protocol['searches']}:raise ValueError('Missing or extra search run')
    view=training_view(manifest,receipt)
    validator=Path(__file__).with_name('optimization_artifact.mjs')
    programs={};artifacts={};groups={};ledgers={}
    read=lambda p:json.loads(p.read_text())
    for search in protocol['searches']:
        name=search['id'];root=Path(runs[name]);task=root/'task'
        declaration=read(task/'task.json');finished=read(task/'finished.json')
        if declaration['proposal_budget']!=budget or declaration['corpus_membership_sha256']!=manifest['membership_sha256'] or declaration['training_view']!=view:
            raise ValueError('Search task differs from approved training/budget declaration')
        if declaration['validator_sha256']!=hashlib.sha256(validator.read_bytes()).hexdigest():raise ValueError('Policy validator changed')
        count=finished.get('attempts')
        if finished.get('status')!='finished' or type(count) is not int or not 0<=count<=budget:raise ValueError('Invalid terminal proposal ledger')
        expected=[f'attempt-{i:04d}' for i in range(1,count+1)]
        for suffix in ['.request.json','.result.json']:
            if sorted(p.name.removesuffix(suffix) for p in task.glob('*'+suffix))!=expected:raise ValueError('Incomplete or extra proposal records')
        seen={};rows=[];members=['baseline'];accepted_files=[]
        for index,prefix in enumerate(expected,1):
            request=read(task/(prefix+'.request.json'));result=read(task/(prefix+'.result.json'))
            if request['attempt']!=index or result['attempt']!=index or result['remaining']!=budget-index:raise ValueError('Proposal accounting mismatch')
            status=result['status'];row={'attempt':index,'status':status}
            if 'policy_json' in request:
                raw=request['policy_json'].encode('utf-8',errors='surrogatepass')
                if len(raw)!=request['request_bytes'] or hashlib.sha256(raw).hexdigest()!=request['request_sha256']:raise ValueError('Raw proposal identity mismatch')
            if status in ('accepted','duplicate'):
                submitted=_strict_json(request['policy_json'])
                validated=subprocess.run([str(node),str(validator)],input=json.dumps({'policy':submitted,'numerical_policy':manifest['numerical_policy']},allow_nan=False),text=True,capture_output=True,check=True)
                value=json.loads(validated.stdout)
                if value['artifact_sha256']!=result['artifact_sha256']:raise ValueError('Artifact does not represent the submitted program')
            if status=='accepted':
                path=task/(prefix+'.artifact.json');artifact=read(path)
                sha=result['artifact_sha256']
                if value['artifact']!=artifact or value['artifact_sha256']!=sha or sha in seen:raise ValueError('Accepted artifact identity mismatch')
                accepted_files.append(path.name);seen[sha]=index
                policy_id='p-'+sha
                programs[policy_id]={**artifact['program'],'id':policy_id};artifacts[sha]=artifact
                row['policy']=policy_id;members.append(policy_id)
            elif status=='duplicate':
                sha=result['artifact_sha256']
                if seen.get(sha)!=result['duplicate_of']:raise ValueError('Duplicate does not name a prior accepted proposal')
                row['policy']='p-'+sha
            elif status=='rejected':row['error']=result['error']
            else:raise ValueError('Search infrastructure failure or unknown outcome: '+status)
            rows.append(row)
        if sorted(p.name for p in task.glob('*.artifact.json'))!=accepted_files or finished['unique_artifacts']!=len(seen):raise ValueError('Artifact ledger mismatch')
        if search['method']=='external-llm':
            config=read(root/'agent/config.json');outcome=read(root/'agent/result.json')
            if config.get('format')!='kiln-native-agent-batch/2' or outcome.get('format')!='kiln-native-agent-batch-result/2':raise ValueError('Native proposal-accounting v2 required')
            for key in ['model','max_steps','completion_budget','per_turn_tokens']:
                if config[key]!=search[key]:raise ValueError('Model configuration differs from declared search')
            if config['proposal_budget']!=budget or config['system_prompt_sha256']!=hashlib.sha256(SYSTEM_PROMPT.encode()).hexdigest():raise ValueError('Model prompt/budget differs')
            if outcome['task']!=finished or outcome['submission_accounting']['charged_submissions']!=count:raise ValueError('Model proposal ledger differs')
            if outcome['exit_reason'] not in ['finished','proposal_budget_exhausted','step_budget_exhausted','completion_budget_exhausted']:raise ValueError('Model infrastructure failed')
        else:
            generation=read(root/'generation.json')
            if generation['protocol_sha256']!=digest(protocol) or generation['search']!=search or generation['task']!=finished:raise ValueError('Baseline generation declaration differs')
            if count!=budget or generation['policies']!=baseline_programs(search,budget,view):raise ValueError('Baseline generation differs from fixed algorithm')
            if generation['results']!=[read(task/(prefix+'.result.json')) for prefix in expected]:raise ValueError('Baseline proposal results differ')
            if [_strict_json(read(task/(prefix+'.request.json'))['policy_json']) for prefix in expected]!=generation['policies']:
                raise ValueError('Baseline submitted programs differ from fixed algorithm')
        groups[name]=members
        ledgers[name]={'proposal_allowance':budget,'used_slots':count,'unused_slots':budget-count,
                       'unique_artifacts':len(seen),'attempts':rows}
        if search['method']=='external-llm':
            ledgers[name].update(inference_usage=outcome['usage'],generation_elapsed_seconds=outcome['elapsed_seconds'])
        else:ledgers[name]['generation_elapsed_seconds']=generation['elapsed_seconds']
    return {'programs':list(programs.values()),'optimization_artifacts':artifacts,
            'search_groups':groups,'search_ledgers':ledgers,'protocol':protocol,'protocol_sha256':digest(protocol)}


def freeze_searches(protocol, runs, corpus, receipt, execution_wrapper, node='node'):
    from freeze_study import freeze_candidates
    read=lambda p:json.loads(p.read_text())
    manifest=read(corpus/'manifest.json')
    collected=collect_searches(protocol,runs,manifest,receipt,node)
    evidence_dir=corpus/'search-evidence';evidence_dir.mkdir()
    evidence=[]
    for name,root in runs.items():
        for path in sorted(Path(root).rglob('*.json')):
            if path.is_symlink():raise ValueError('Search evidence must be regular owned files')
            destination=evidence_dir/name/path.relative_to(root)
            destination.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(path,destination);evidence.append(destination)
    controls=[read(corpus/'policies'/(name+'.json')) for name in ['baseline','default']]
    proposals={'format':'kiln-policy-search-proposals/1','training_membership_sha256':manifest['membership_sha256'],
               'policies':controls+collected.pop('programs'),**collected,
               'provenance':{'method':'Equal declared proposal allowances; fixed threshold and seeded-random baselines plus external-model batch; all charged outcomes retained'}}
    return freeze_candidates(corpus,proposals,execution_wrapper,
                             search_groups=proposals['search_groups'],evidence=evidence)


def validate_groups(plan):
    groups=plan.get('search_groups');candidates=plan['candidate_ids']
    if not isinstance(groups,dict) or not groups:raise ValueError('Declared search groups required')
    seen=set()
    for name,members in groups.items():
        if not isinstance(members,list) or not members or members[0]!='baseline' or len(members)!=len(set(members)) or not set(members)<=set(candidates):
            raise ValueError('Invalid candidate membership for search '+name)
        seen.update(members)
    if seen|{'default'}!=set(candidates):raise ValueError('Unassigned or missing candidate in search declaration')
    return groups


def select_searches(measurement):
    groups=validate_groups(measurement['plan'])
    ranking={row['policy']:row for row in rank_training(measurement)}
    selections={}
    for name,members in groups.items():
        rows=sorted((ranking[p] for p in members),key=lambda r:(-(r['family_balanced_speedup'] if r['eligible'] else -math.inf),members.index(r['policy'])))
        selections[name]={'selected_policy':rows[0]['policy'],'ranking':rows}
    return {'format':'kiln-policy-search-selection/1','membership_sha256':measurement['membership_sha256'],
            'plan_sha256':digest(measurement['plan']),'search_groups':groups,'selections':selections,
            'training_measurement_sha256':digest(measurement),'heldout_feedback_used':False}


def confirmation_policies(plan, selection):
    groups=validate_groups(plan)
    if (selection.get('format')!='kiln-policy-search-selection/1' or selection['membership_sha256']!=plan['membership_sha256']
            or selection['plan_sha256']!=digest(plan) or selection['search_groups']!=groups or set(selection['selections'])!=set(groups)
            or selection.get('heldout_feedback_used') is not False):
        raise ValueError('Search selection differs from frozen declaration')
    policies=['baseline']
    for name,members in groups.items():
        selected=selection['selections'][name]['selected_policy']
        if selected not in members:raise ValueError('Selected policy belongs to a different search')
        if selected not in policies:policies.append(selected)
    return policies


def summarize_searches(corpus, training, selection, heldout):
    from summarize_policy import validate_evidence, confirmation_metrics
    validate_evidence(corpus,training,selection,heldout)
    if selection!=select_searches(training):raise ValueError('Selections differ from training-only evidence')
    if heldout['policies']!=confirmation_policies(training['plan'],selection):
        raise ValueError('Held-out candidate grid is not the union of search winners')
    return {'format':'kiln-policy-search-summary/1','membership_sha256':corpus['membership_sha256'],
            'selection_sha256':digest(selection),'training_measurement_sha256':digest(training),
            'heldout_measurement_sha256':digest(heldout),
            'methods':{name:{'training_family_balanced_speedup':row['ranking'][0]['family_balanced_speedup'],
                             **confirmation_metrics(corpus,heldout,row['selected_policy'])}
                       for name,row in selection['selections'].items()}}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    commands=parser.add_subparsers(dest='command',required=True)
    baseline=commands.add_parser('baseline')
    for name in ['protocol','manifest','receipt','output']:baseline.add_argument('--'+name,type=Path,required=True)
    baseline.add_argument('--search',required=True);baseline.add_argument('--node',default='node')
    select=commands.add_parser('select')
    select.add_argument('--training',type=Path,required=True);select.add_argument('--output',type=Path,required=True)
    freeze=commands.add_parser('freeze')
    for name in ['protocol','corpus','receipt','execution-wrapper']:freeze.add_argument('--'+name,type=Path,required=True)
    freeze.add_argument('--run',action='append',required=True,help='Search ID=run directory')
    freeze.add_argument('--node',default='node')
    summary=commands.add_parser('summarize')
    for name in ['corpus','training','selection','heldout','output']:summary.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();read=lambda p:json.loads(p.read_text())
    if args.command=='baseline':
        result=run_baseline(read(args.protocol),args.search,read(args.manifest),read(args.receipt),args.output,args.node)
        print(json.dumps(result['task']))
    elif args.command=='select':
        result=select_searches(read(args.training));_write_new(args.output,result)
        print(json.dumps({name:row['selected_policy'] for name,row in result['selections'].items()}))
    elif args.command=='summarize':
        result=summarize_searches(read(args.corpus/'manifest.json'),read(args.training),read(args.selection),read(args.heldout))
        _write_new(args.output,result)
        print(json.dumps({name:row['heldout_family_balanced_e2e_speedup'] for name,row in result['methods'].items()}))
    else:
        runs={}
        for value in args.run:
            name,path=value.split('=',1)
            if name in runs:raise ValueError('Duplicate search run')
            runs[name]=Path(path)
        plan=freeze_searches(read(args.protocol),runs,args.corpus,read(args.receipt),args.execution_wrapper,args.node)
        print(json.dumps({'candidate_ids':plan['candidate_ids'],'search_groups':plan['search_groups']}))


if __name__=='__main__':main()
