"""Compile training-only unchanged/default controls for a frozen source corpus."""
import argparse
import json
from pathlib import Path
import subprocess


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['corpus','artifacts','kiln']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();corpus=args.corpus.resolve();output=args.artifacts.resolve();repo=args.kiln.resolve()
    if output.exists() or (corpus/'policies').exists():raise ValueError('Preserve existing controls or declarations')
    output.mkdir(parents=True);(corpus/'policies').mkdir()
    for name in ['baseline','default']:
        policy={'format':'kiln-fusion-policy/1','id':name,'kind':'unchanged' if name=='baseline' else 'threshold'}
        if name=='default':policy['max_work_growth']=1.02
        path=corpus/'policies'/(name+'.json');path.write_text(json.dumps(policy,indent=2)+'\n')
        subprocess.run(['node',str(repo/'integrations/passnet/compile_policy.mjs'),'--directory',str(corpus),'--output',str(output/name),
                        '--policy',str(path),'--target','a100','--phase','train'],check=True)
    records=[json.loads((output/name/'compile-receipt.json').read_text())['records'] for name in ['baseline','default']]
    if [r['fingerprint'] for r in records[0]]!=[r['fingerprint'] for r in records[1]]:raise ValueError('Explicit default differs from unchanged')
    print('QUALIFIED TRAINING CONTROLS',len(records[0]),'no confirmation compilation',flush=True)


if __name__=='__main__':main()
