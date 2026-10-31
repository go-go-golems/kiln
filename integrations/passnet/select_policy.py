"""Select one predeclared policy from complete training-only measurements."""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path


def rank_training(measurement):
    if measurement['phase']!='train' or measurement['status']!='complete':
        raise ValueError('Selection requires completed training measurements')
    if not measurement['records'] or any(r['split']!='train' for r in measurement['records']):
        raise ValueError('Held-out feedback cannot enter training selection')
    if [r['graph'] for r in measurement['records']]!=measurement['expected_graphs']:
        raise ValueError('Incomplete training membership')
    if measurement['policies']!=measurement['plan']['candidate_ids']:
        raise ValueError('Candidate set changed after declaration')
    ranking=[]
    for policy in measurement['policies']:
        families=defaultdict(list);failures=[]
        for row in measurement['records']:
            baseline=row['measurements'][row['bindings']['baseline']]
            candidate=row['measurements'][row['bindings'][policy]]
            if baseline['status']!='measured':raise ValueError('Unchanged compiler baseline is not qualified')
            if candidate['status']!='measured':failures.append(row['graph']);continue
            families[row['sample']].append(math.log(baseline['e2e_median_ms']/candidate['e2e_median_ms']))
        score=None if failures else math.exp(sum(sum(v)/len(v) for v in families.values())/len(families))
        ranking.append({'policy':policy,'eligible':not failures,'family_balanced_speedup':score,'failures':failures})
    # Stable sort preserves predeclared order on exact ties, preferring baseline.
    ranking.sort(key=lambda r:r['family_balanced_speedup'] if r['eligible'] else -math.inf,reverse=True)
    return ranking


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--training',type=Path,required=True);p.add_argument('--output',type=Path,required=True);args=p.parse_args()
    if args.output.exists():raise ValueError('Preserve the prior selected policy record')
    data=json.loads(args.training.read_text());ranking=rank_training(data)
    result={'format':'kiln-policy-selection/1','membership_sha256':data['membership_sha256'],
            'selected_policy':ranking[0]['policy'],'objective':'family-balanced geometric mean synchronized end-to-end speedup relative to unchanged Kiln; compile-cost coefficient 0',
            'training_source':str(args.training),'ranking':ranking,'heldout_feedback_used':False}
    args.output.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))


if __name__=='__main__':main()
