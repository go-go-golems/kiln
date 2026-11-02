"""Verify a complete frozen study, including a selection committed before confirmation."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from qualify_policies import qualify
from summarize_policy import summarize


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['corpus','artifacts','measurements','source-verification','output']:parser.add_argument('--'+name,type=Path,required=True)
    parser.add_argument('--selection-commit',required=True)
    parser.add_argument('--renaming-audit',type=Path,help='Optional training-only diagnostic; never changes selection or aliases')
    args=parser.parse_args();repo=Path(__file__).resolve().parents[2]
    read=lambda path:json.loads(path.read_text())
    manifest=read(args.corpus/'manifest.json');freeze=read(args.corpus/'candidate-freeze.json')
    for name,digest in freeze['files_sha256'].items():
        if hashlib.sha256((args.corpus/name).read_bytes()).hexdigest()!=digest:raise ValueError('Frozen declaration changed: '+name)
    if qualify(args.corpus,args.artifacts)!=read(args.artifacts/'sensitivity.json'):raise ValueError('Artifact qualification changed')
    selected_path=(args.measurements/'selection.json').resolve()
    if selected_path.read_bytes()!=subprocess.check_output(['git','show',args.selection_commit+':'+str(selected_path.relative_to(repo))],cwd=repo):raise ValueError('Selection differs from pre-confirmation commitment')
    train=read(args.measurements/'train.json');heldout=read(args.measurements/'heldout.json');selection=read(selected_path);plan=read(args.corpus/'measurement-plan.json')
    for measurement in [train,heldout]:
        if measurement['backend_numerics']['float32_matmul_precision']!='highest' or measurement['backend_numerics']['matmul_allow_tf32']:raise ValueError('Reference protocol changed')
        if measurement['plan']!=plan:raise ValueError('Measurement plan changed')
    summary=summarize(manifest,train,selection,heldout)
    receipt=read(args.artifacts/selection['selected_policy']/'compile-receipt.json')
    partial=lambda split:sum(d.get('retainedProducer',False) and d['accepted'] and 0<d['selectedConsumerCount']<d['consumerCount'] for row in receipt['records'] if row['split']==split for d in row['decisions'])
    summary.update(reference_protocol='Explicit highest-precision FP32 compiler-policy research; not native PassBench acceptance',
                   selection_commit=args.selection_commit,selected_policy_kind=read(args.corpus/'policies'/(selection['selected_policy']+'.json'))['kind'],
                   selected_training_partial_fusions=partial('train'),selected_heldout_partial_fusions=partial('heldout'),
                   source_verification_matches=read(args.source_verification)['matches'])
    if not summary['source_verification_matches']:raise ValueError('Remote source mismatch')
    summary['limitations']=[text for text in summary['limitations'] if not text.startswith('Profitability-policy selection preserves')]
    summary['limitations'].append('Read candidate definitions and accepted decisions for actual rewrite behavior; model-optimal local subset selection is not global compiler or latency optimality, nor external-model synthesis.')
    if args.renaming_audit:
        audit=read(args.renaming_audit)
        if [r['graph'] for r in audit['records']]!=[r['graph'] for r in manifest['variants'] if r['split']=='train']:raise ValueError('Renaming diagnostic is not the complete training population')
        count=audit['exact_changes_equal_after_normalization'][selection['selected_policy']]
        summary['selected_training_generated_name_contrasts']=count
        summary['limitations'].append(f'Training-only diagnostic: {count} selected artifact changes equal baseline after entry/reduction identifier renaming; frozen timing aliases and selection were not changed, so nuisance contrasts limit interpretation.')
    args.output.write_text(json.dumps(summary,indent=2)+'\n')
    print(json.dumps({k:v for k,v in summary.items() if k!='records'},indent=2))


if __name__=='__main__':main()
