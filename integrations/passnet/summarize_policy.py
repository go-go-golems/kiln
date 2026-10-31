"""Summarize a committed training selection and its unchanged held-out evaluation."""
import argparse
import hashlib
from collections import defaultdict
import json
import math
from pathlib import Path
from select_policy import rank_training


def summarize(corpus,training,selection,heldout):
    membership=corpus['membership_sha256']
    if hashlib.sha256(json.dumps(corpus['variants'],sort_keys=True).encode()).hexdigest()!=membership:raise ValueError('Frozen corpus membership hash is invalid')
    if any(x['membership_sha256']!=membership for x in (training,selection,heldout)):
        raise ValueError('Experiment membership mismatch')
    if [r['graph'] for r in training['records']]!=[r['graph'] for r in corpus['variants'] if r['split']=='train']:raise ValueError('Training membership does not match frozen corpus')
    if rank_training(training)[0]['policy']!=selection['selected_policy']:
        raise ValueError('Selection does not match training-only evidence')
    if heldout['phase']!='heldout' or heldout['status']!='complete':raise ValueError('Held-out run is incomplete')
    chosen=selection['selected_policy'];expected_policies=list(dict.fromkeys(['baseline',chosen]))
    if heldout['policies']!=expected_policies:raise ValueError('Held-out candidate grid is not allowed')
    expected=[r['graph'] for r in corpus['variants'] if r['split']=='heldout']
    if [r['graph'] for r in heldout['records']]!=expected:raise ValueError('Incomplete held-out graph membership')
    source_records={r['graph']:r for r in corpus['variants']}
    rows=[];families=defaultdict(list);stream_families=defaultdict(list);failures=[]
    for row in heldout['records']:
        if row['sample']!=source_records[row['graph']]['sample'] or row['split']!='heldout':raise ValueError('Held-out family identity mismatch')
        baseline=row['measurements'][row['bindings']['baseline']]
        candidate=row['measurements'][row['bindings'][chosen]]
        item={'graph':row['graph'],'sample':row['sample'],'artifact_changed':row['bindings']['baseline']!=row['bindings'][chosen],
              'baseline_status':baseline['status'],'selected_status':candidate['status']}
        if baseline['status']=='measured' and candidate['status']=='measured':
            ratio=baseline['e2e_median_ms']/candidate['e2e_median_ms']
            stream_ratio=baseline['stream_elapsed_median_ms']/candidate['stream_elapsed_median_ms']
            repeats=[a['attempts'][-1]['e2e_ms']['median']/b['attempts'][-1]['e2e_ms']['median'] for a,b in zip(baseline['rounds'],candidate['rounds'])]
            item.update(baseline_e2e_ms=baseline['e2e_median_ms'],selected_e2e_ms=candidate['e2e_median_ms'],
                        e2e_speedup=ratio,stream_elapsed_speedup=stream_ratio,paired_repeat_e2e_speedups=repeats,
                        output_max_abs_errors=candidate['output_max_abs_errors'])
            families[row['sample']].append(math.log(ratio));stream_families[row['sample']].append(math.log(stream_ratio))
        else:failures.append(row['graph'])
        rows.append(item)
    balanced=lambda groups:math.exp(sum(sum(v)/len(v) for v in groups.values())/len(groups))
    return {'format':'kiln-policy-study-summary/1','membership_sha256':membership,'selected_policy':chosen,
            'training_family_balanced_speedup':rank_training(training)[0]['family_balanced_speedup'],
            'heldout_graphs':len(rows),'heldout_families':len({r['sample'] for r in rows}),
            'heldout_qualified':not failures,'heldout_failures':failures,
            'heldout_family_balanced_e2e_speedup':None if failures else balanced(families),
            'heldout_family_balanced_stream_elapsed_speedup':None if failures else balanced(stream_families),
            'changed_heldout_artifacts':sum(r['artifact_changed'] for r in rows),'records':rows,
            'limitations':['Small FP32 development corpus; consult the frozen measurement plan for its source population and eligibility restrictions.',
             'Profitability-policy selection preserves the existing fusion rewrite; it does not synthesize a new graph mutation.',
             'Identical executable fingerprints share measurements; unchanged graphs are not independent performance contrasts.',
             'Three warm repeats on one GB10; repeat ranges are descriptive and not strong statistical confidence.',
             'Direct compiler metrics are relative to unchanged Kiln, not eager or official PassBench scores.']}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['corpus','training','selection','heldout','output']:p.add_argument('--'+name,type=Path,required=True)
    args=p.parse_args()
    result=summarize(json.loads((args.corpus/'manifest.json').read_text()),json.loads(args.training.read_text()),json.loads(args.selection.read_text()),json.loads(args.heldout.read_text()))
    args.output.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='records'},indent=2))


if __name__=='__main__':main()
