"""Run each manifest graph in an isolated original-evaluator integration process.

Receipts record process execution only; per-graph correctness and matching are
judged from evaluator logs by the separate coverage accounting step.
"""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import sys
from corpus import read_manifest

# Explicit import paths avoid dependency on a caller's PYTHONPATH and do not
# inspect or serialize its environment. Every graph gets a fresh Python process.
BOOTSTRAP = '''import runpy,sys
sys.path[:0]=sys.argv[1:5]
sys.argv=sys.argv[5:]
runpy.run_path(sys.argv[0],run_name="__main__")
'''


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--directory',type=Path,required=True)
    p.add_argument('--upstream',type=Path,required=True)
    p.add_argument('--pass-directory',type=Path,required=True)
    p.add_argument('--log',type=Path,required=True)
    p.add_argument('--warmup',type=int,default=20)
    p.add_argument('--trials',type=int,default=100)
    args=p.parse_args()
    directory=args.directory.resolve();upstream=args.upstream.resolve()
    passes=args.pass_directory.resolve();log_path=args.log.resolve()
    manifest=read_manifest(directory)
    log_path.parent.mkdir(parents=True,exist_ok=True)
    empty=log_path.parent/'empty-passes';empty.mkdir(exist_ok=True)
    config={'input_pass_rule_dir':str(empty),'output_pass_rule_dir':str(passes),
            'output_pass_pattern_limit':100,'output_pass_replacement_func_limit':1,
            'pass_match_result_file_path':str(log_path.with_suffix('.matches.txt'))}
    encoded=base64.b64encode(json.dumps(config).encode()).decode()
    integration=Path(__file__).resolve().parent
    runtime=integration.parents[1]/'runtime/python'
    results=[]
    with log_path.open('w') as log:
        log.write('[kiln-task-runner/1] process receipts are not correctness claims\n');log.flush()
        for record in manifest['variants']:
            command=[sys.executable,'-c',BOOTSTRAP,str(runtime),str(integration),str(upstream),str(passes),
                     str(integration/'evaluate_normalized.py'),'--model-path',str(upstream/record['graph']),
                     '--compiler','pass_mgr','--device','cuda','--warmup',str(args.warmup),
                     '--trials',str(args.trials),'--config',encoded]
            result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,cwd=upstream)
            log.flush()
            results.append({'graph':record['graph'],'command':command,'returncode':result.returncode})
            log_path.with_suffix('.receipt.json').write_text(json.dumps(results,indent=2)+'\n')
            print(record['graph'],f'returncode={result.returncode}',flush=True)
            if result.returncode: raise SystemExit(result.returncode)


if __name__=='__main__':
    main()
