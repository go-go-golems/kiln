"""Freeze proposed programs and an explicit FP32 reference protocol before evaluation."""
import argparse
import hashlib
import json
from pathlib import Path
from propose_policy import propose_region,propose_selective


def freeze_candidates(corpus, proposals, execution_wrapper, *, search_groups=None, evidence=()):
    """Shared declaration writer for fixed grammars and method comparisons."""
    for name in ['candidate-freeze.json','proposals.json','measurement-plan.json']:
        if (corpus/name).exists():raise ValueError('Preserve existing declaration')
    read=lambda path:json.loads(path.read_text())
    manifest=read(corpus/'manifest.json')
    controls=[read(corpus/'policies'/(name+'.json')) for name in ['baseline','default']]
    if proposals['policies'][:2]!=controls:raise ValueError('Preserve the unchanged/default controls')
    if proposals['training_membership_sha256']!=manifest['membership_sha256']:raise ValueError('Proposal membership differs')
    for name,data in [('proposals.json',proposals)]:
        with (corpus/name).open('x') as f:f.write(json.dumps(data,indent=2)+'\n')
    for policy in proposals['policies'][2:]:
        with (corpus/'policies'/(policy['id']+'.json')).open('x') as f:f.write(json.dumps(policy,indent=2)+'\n')
    confirmation=sum(r['split']=='heldout' for r in manifest['variants'])
    plan={'format':'kiln-policy-measurement-plan/1','membership_sha256':manifest['membership_sha256'],'numerical_policy':manifest['numerical_policy'],
          'reference_backend_numerics':{'float32_matmul_precision':'highest'},'protocol_scope':'Modified full-precision FP32 compiler-policy research; not native PassBench acceptance',
          'candidate_ids':[p['id'] for p in proposals['policies']],'seed':42,'warmup':20,'trials':100,'repeats':3,'max_iqr_fraction':0.2,'max_retries':2,
          'inputs':'Original source replay, nominal dtype tolerances, output structure and unchanged inputs',
          'order':'Seeded shuffle of distinct fingerprints; exact executable aliases share evidence',
          'metrics':['synchronized end-to-end ms','CUDA-event stream elapsed ms including dispatch gaps'],
          'selection':'Training-only family-balanced geometric mean end-to-end ratio to unchanged Kiln; exact ties preserve declaration order; compile-cost coefficient zero',
          'heldout':f'Only baseline and committed training selection; all {confirmation} confirmation graphs retained without replacement or filtering',
          'scope':manifest['scope'],'proposal_provenance':proposals.get('provenance') or proposals['policies'][2]['provenance'],
          'source_contract':'Separate elementary FP32 arithmetic and highest-precision native matrix reference, fixed across candidates'}
    if search_groups is not None:
        from policy_search import validate_groups
        plan.update(format='kiln-policy-search-measurement-plan/1',search_groups=search_groups,
                    search_protocol_sha256=proposals['protocol_sha256'],
                    heldout=f'Only unchanged Kiln and the committed winner of each search method; all {confirmation} confirmation graphs retained')
        validate_groups(plan)
    with (corpus/'measurement-plan.json').open('x') as f:f.write(json.dumps(plan,indent=2)+'\n')
    paths=[corpus/'manifest.json',corpus/'reference-domains.json',corpus/'proposals.json',corpus/'measurement-plan.json',*sorted((corpus/'policies').glob('*.json')),*evidence]
    freeze={'scope':'Before confirmation compilation or GPU timing; training structural evidence only','membership_sha256':manifest['membership_sha256'],
            'files_sha256':{str(path.relative_to(corpus)):hashlib.sha256(path.read_bytes()).hexdigest() for path in paths},
            'execution_wrapper_sha256':hashlib.sha256(execution_wrapper.read_bytes()).hexdigest()}
    with (corpus/'candidate-freeze.json').open('x') as f:f.write(json.dumps(freeze,indent=2)+'\n')
    return plan


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['corpus','controls','execution-wrapper']:parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--strategy',choices=['region','selective'],required=True)
    args=parser.parse_args();read=lambda path:json.loads(path.read_text())
    manifest=read(args.corpus/'manifest.json');receipt=read(args.controls/'default/compile-receipt.json')
    controls=[read(args.corpus/'policies'/(name+'.json')) for name in ['baseline','default']]
    proposals={'region':propose_region,'selective':propose_selective}[args.strategy](manifest,receipt,controls)
    plan=freeze_candidates(args.corpus,proposals,args.execution_wrapper)
    print('FROZEN',len(plan['candidate_ids']),'programs;',proposals['training_multiple_consumer_decisions'],'training fanout decisions;',manifest['membership_sha256'],flush=True)


if __name__=='__main__':main()
