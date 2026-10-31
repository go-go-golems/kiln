"""Generate a fixed-budget fusion-policy grammar from training-only compiler traces.

This is deterministic template synthesis, not an external LLM invocation. The
current Codex session authored the grammar. No timing values enter proposal cuts.
"""
import argparse
import hashlib
import json
from pathlib import Path


def propose(manifest, receipt):
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
