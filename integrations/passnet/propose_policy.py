"""Generate a fixed-budget fusion-policy grammar from training-only compiler traces.

This is deterministic template synthesis, not an external LLM invocation. The
current Codex session authored the grammar. No timing values enter proposal cuts.
"""
import argparse
import hashlib
import json
from pathlib import Path


def _training_evidence(manifest, receipt):
    if receipt['membership_sha256'] != manifest['membership_sha256']:
        raise ValueError('Trace membership mismatch')
    expected = [r['graph'] for r in manifest['variants'] if r['split'] == 'train']
    if not expected or len(expected) != len(set(expected)):
        raise ValueError('Nonempty unique training membership required')
    rows = [r for r in receipt['records'] if r['graph'] in set(expected)]
    if [r['graph'] for r in rows] != expected:
        raise ValueError('Incomplete training traces')
    if any(r['split'] != 'train' or r['status'] != 'compiled' for r in rows):
        raise ValueError('Only successful training traces may inform proposals')
    features = [d for r in rows for d in r['decisions']]
    if not features:
        raise ValueError('Training traces have no fusion opportunities')
    for d in features:
        for key in ['originalWork', 'fusedWork', 'producerElements', 'consumerCount']:
            value = d[key]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value < float('inf'):
                raise ValueError('Invalid compiler feature')
    return expected,rows,features


def propose(manifest, receipt):
    expected,rows,features=_training_evidence(manifest,receipt)
    def quantile(key, numerator, denominator):
        values = sorted(d[key] for d in features)
        return values[(len(values)-1)*numerator//denominator]
    cuts = {'large_producer': quantile('producerElements', 1, 2),
            'small_producer': quantile('producerElements', 1, 4),
            'high_work': quantile('originalWork', 1, 2)}
    def leaf(ratio): return {'threshold': ratio}
    def branch(feature, op, value, ratio):
        return {'if': {'feature': feature, 'op': op, 'value': value},
                'then': leaf(ratio), 'else': leaf(1.02)}
    definitions = [('baseline', 'unchanged', None), ('default', 'threshold', 1.02),
                   ('scalar100', 'threshold', 1.0), ('scalar095', 'threshold', .95),
                   ('scalar090', 'threshold', .9), ('scalar075', 'threshold', .75),
                   ('disabled', 'threshold', 0),
                   ('tree-large-strict100', 'decision-tree', branch('producerElements', 'ge', cuts['large_producer'], 1.0)),
                   ('tree-large-strict090', 'decision-tree', branch('producerElements', 'ge', cuts['large_producer'], .9)),
                   ('tree-small-strict100', 'decision-tree', branch('producerElements', 'le', cuts['small_producer'], 1.0)),
                   ('tree-high-work-strict095', 'decision-tree', branch('originalWork', 'ge', cuts['high_work'], .95)),
                   ('tree-single-strict090', 'decision-tree', branch('consumerCount', 'eq', 1, .9))]
    evidence = [{'graph': r['graph'], 'decisions': r['decisions']} for r in rows]
    trace_hash = hashlib.sha256(json.dumps(evidence, sort_keys=True).encode()).hexdigest()
    policies = []
    for name, kind, program in definitions:
        policy = {'format': 'kiln-fusion-policy/1', 'id': name, 'kind': kind,
                  'provenance': {'method': 'Deterministic fixed grammar authored by Codex; cuts from training compiler features only; no timing input or external LLM inference',
                                 'training_trace_sha256': trace_hash}}
        if kind == 'threshold': policy['max_work_growth'] = program
        if kind == 'decision-tree': policy['tree'] = program
        policies.append(policy)
    return {'format': 'kiln-policy-proposals/1', 'training_membership_sha256': manifest['membership_sha256'],
            'training_graphs': expected, 'training_trace_sha256': trace_hash,
            'candidate_budget': 12, 'cuts': cuts, 'policies': policies}


def propose_rich(manifest, receipt, controls):
    """Balanced restrictions/relaxations after training-only structural analysis."""
    expected,rows,features=_training_evidence(manifest,receipt)
    if manifest.get('numerical_policy')!={'contraction':'separate'} or receipt.get('numerical_policy')!=manifest['numerical_policy']:
        raise ValueError('Rich study requires a fixed separate-rounding contract')
    if [p.get('id') for p in controls]!=['baseline','default'] or controls[0].get('kind')!='unchanged' or controls[1].get('kind')!='threshold' or controls[1].get('max_work_growth')!=1.02:
        raise ValueError('Preserve unchanged/default controls')
    cuts={name:sorted(d[feature] for d in features)[(len(features)-1)//2]
          for name,feature in [('producer_median','producerElements'),('work_median','originalWork')]}
    evidence=[{'graph':r['graph'],'decisions':r['decisions']} for r in rows]
    trace_hash=hashlib.sha256(json.dumps(evidence,sort_keys=True).encode()).hexdigest()
    policies=json.loads(json.dumps(controls))
    provenance={'method':'Fixed balanced grammar authored by Codex after training-only structural/trace analysis; no timing feedback or external LLM call',
                'training_trace_sha256':trace_hash}
    for name,ratio in [('disabled',0),('scalar100',1.0),('scalar105',1.05),('scalar110',1.1),('scalar125',1.25),('scalar150',1.5),('scalar200',2.0)]:
        policies.append({'format':'kiln-fusion-policy/1','id':name,'kind':'threshold','max_work_growth':ratio,'provenance':dict(provenance)})
    for name,feature,op,value,yes,no in [
        ('tree-fanout-relaxed','consumerCount','ge',2,1.25,1.02),
        ('tree-small-relaxed','producerElements','le',cuts['producer_median'],1.25,1.02),
        ('tree-high-work-strict','originalWork','ge',cuts['work_median'],1.0,1.25)]:
        policies.append({'format':'kiln-fusion-policy/1','id':name,'kind':'decision-tree',
                         'tree':{'if':{'feature':feature,'op':op,'value':value},'then':{'threshold':yes},'else':{'threshold':no}},'provenance':dict(provenance)})
    return {'format':'kiln-policy-proposals/1','training_membership_sha256':manifest['membership_sha256'],
            'training_graphs':expected,'training_trace_sha256':trace_hash,'candidate_budget':12,'cuts':cuts,
            'numerical_policy':manifest['numerical_policy'],'policies':policies}


def propose_selective(manifest, receipt, controls):
    """Predeclared edge/aggregate grammar; confirmation traces never enter it."""
    expected,rows,features=_training_evidence(manifest,receipt)
    if manifest.get('numerical_policy')!={'contraction':'separate'} or receipt.get('numerical_policy')!=manifest['numerical_policy']:
        raise ValueError('Selective proposals require a fixed separate numerical contract')
    if receipt.get('phase')!='train':raise ValueError('Selective proposals require training-only compilation')
    if [p['id'] for p in controls]!=['baseline','default']:raise ValueError('Expected immutable unchanged/default controls')
    evidence=[{'graph':r['graph'],'decisions':r['decisions']} for r in rows]
    trace_hash=hashlib.sha256(json.dumps(evidence,sort_keys=True).encode()).hexdigest()
    policies=json.loads(json.dumps(controls))
    provenance={'method':'Codex-authored fixed selective-consumer grammar; training-only structural traces; no timing input or external model invocation',
                'training_trace_sha256':trace_hash}
    for name,ratio in [('scalar100',1.0),('scalar125',1.25)]:
        policies.append({'format':'kiln-fusion-policy/1','id':name,'kind':'threshold','max_work_growth':ratio,'provenance':dict(provenance)})
    for aggregate in [1.02,1.25]:
        for edge in [1.0,1.05,1.25,1.5]:
            policies.append({'format':'kiln-fusion-policy/1','id':f'select-edge{round(edge*100)}-total{round(aggregate*100)}','kind':'selective',
                             'tree':{'threshold':aggregate},
                             'consumer_tree':{'if':{'feature':'consumerCount','op':'eq','value':1},
                                              'then':{'accept':True},'else':{'threshold':edge}},'provenance':dict(provenance)})
    return {'format':'kiln-policy-proposals/1','training_membership_sha256':manifest['membership_sha256'],'training_graphs':expected,
            'training_trace_sha256':trace_hash,'candidate_budget':12,'numerical_policy':manifest['numerical_policy'],
            'training_multiple_consumer_decisions':sum(f['consumerCount']>1 for f in features),'policies':policies}


def propose_region(manifest, receipt, controls):
    """Whole-region model variants fixed from training-only structural evidence."""
    expected,rows,features=_training_evidence(manifest,receipt)
    if manifest.get('numerical_policy')!={'contraction':'separate'} or receipt.get('numerical_policy')!=manifest['numerical_policy']:
        raise ValueError('Region proposals require a fixed separate numerical contract')
    if receipt.get('phase')!='train':raise ValueError('Region proposals require training-only compilation')
    if [p['id'] for p in controls]!=['baseline','default']:raise ValueError('Expected immutable unchanged/default controls')
    evidence=[{'graph':r['graph'],'decisions':r['decisions']} for r in rows]
    trace_hash=hashlib.sha256(json.dumps(evidence,sort_keys=True).encode()).hexdigest()
    policies=json.loads(json.dumps(controls))
    provenance={'method':'Codex-authored whole-region work/launch/materialization grammar; training structural traces only; no timing input or external model invocation',
                'training_trace_sha256':trace_hash}
    for name,ratio in [('scalar100',1.0),('scalar125',1.25)]:
        policies.append({'format':'kiln-fusion-policy/1','id':name,'kind':'threshold','max_work_growth':ratio,'provenance':dict(provenance)})
    for name,launch,materialization in [('region-work',0,0),('region-launch4096',4096,0),('region-launch32768',32768,0),
                                      ('region-launch262144',262144,0),('region-material1',0,1),('region-material12',0,12),
                                      ('region-mixed32768',32768,12),('region-mixed262144',262144,12)]:
        policies.append({'format':'kiln-fusion-policy/1','id':name,'kind':'region','max_work_growth':1.02,
                         'launch_work':launch,'materialization_work':materialization,'provenance':dict(provenance)})
    return {'format':'kiln-policy-proposals/1','training_membership_sha256':manifest['membership_sha256'],'training_graphs':expected,
            'training_trace_sha256':trace_hash,'candidate_budget':12,'numerical_policy':manifest['numerical_policy'],
            'training_multiple_consumer_decisions':sum(f['consumerCount']>1 for f in features),'policies':policies}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['corpus', 'receipt', 'output']:
        parser.add_argument('--'+key, type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists(): raise ValueError('Preserve prior proposals')
    result = propose(json.loads((args.corpus/'manifest.json').read_text()), json.loads(args.receipt.read_text()))
    args.output.write_text(json.dumps(result, indent=2)+'\n')
    print(json.dumps({key: value for key, value in result.items() if key not in ['policies', 'training_graphs']}))


if __name__ == '__main__': main()
