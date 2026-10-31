"""Compile a frozen policy study from committed sources and qualify every artifact."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from evaluate_tasks import snapshot
from qualify_policies import qualify


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    for name in ['corpus','artifacts','kiln']:parser.add_argument('--'+name,type=Path,required=True)
    args=parser.parse_args();repo=args.kiln.resolve();corpus=args.corpus.resolve();output=args.artifacts.resolve()
    if output.exists():raise ValueError('Preserve previous or partial artifacts')
    initial=snapshot(repo);revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
    for relative,digest in initial['files'].items():
        if hashlib.sha256(subprocess.check_output(['git','show',revision+':'+relative],cwd=repo)).hexdigest()!=digest:
            raise ValueError('Commit compiler sources before measurement: '+relative)
    freeze=json.loads((corpus/'candidate-freeze.json').read_text());plan=json.loads((corpus/'measurement-plan.json').read_text())
    def verify():
        if snapshot(repo)!=initial:raise ValueError('Compiler source changed during compilation')
        for name,digest in freeze['files_sha256'].items():
            if hashlib.sha256((corpus/name).read_bytes()).hexdigest()!=digest:raise ValueError('Study declaration changed: '+name)
    verify();output.mkdir(parents=True)
    receipt={'format':'kiln-policy-study-compilation/1','status':'running','code_revision':revision,'source_snapshot':initial,
             'node':subprocess.check_output(['node','--version'],text=True).strip(),'membership_sha256':freeze['membership_sha256'],'records':[]}
    def save():(output/'study-compile-receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
    try:
        for name in plan['candidate_ids']:
            verify();command=['node',str(repo/'integrations/passnet/compile_policy.mjs'),'--directory',str(corpus),'--output',str(output/name),
                              '--policy',str(corpus/'policies'/(name+'.json')),'--target','a100','--phase','all']
            result=subprocess.run(command);receipt['records'].append({'policy':name,'command':command,'returncode':result.returncode});save();verify()
        gate=qualify(corpus,output)
        (output/'sensitivity.json').write_text(json.dumps(gate,indent=2)+'\n')
        receipt['status']='qualified';save()
        print('QUALIFIED',len(plan['candidate_ids']),'policies',len(gate['artifact_sha256']['baseline']),'graphs',flush=True)
    except Exception as error:
        receipt.update(status='failed',error=str(error));save();raise


if __name__=='__main__':main()
