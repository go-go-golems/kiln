#!/bin/bash
# usage: run1.sh TASKDIR GRAPHINDEX LOG  (inside container, cwd /work)
set -u
T=$1; I=$2; LOG=$3
python3 - "$T" "$I" "$LOG" <<'PY'
import sys,json,base64,subprocess
from pathlib import Path
T=Path(sys.argv[1]).resolve();I=int(sys.argv[2]);log=Path(sys.argv[3])
sys.path.insert(0,'/work/kiln/integrations/passnet')
from corpus import read_manifest
m=read_manifest(T/'corpus');rec=m['variants'][I]
empty=T/'empty-passes';empty.mkdir(exist_ok=True)
cfg={'input_pass_rule_dir':str(empty),'output_pass_rule_dir':str(T/'passes'),'output_pass_pattern_limit':100,'output_pass_replacement_func_limit':1,'pass_match_result_file_path':str(log.with_suffix('.matches.txt'))}
enc=base64.b64encode(json.dumps(cfg).encode()).decode()
BOOT='''import runpy,sys
sys.path[:0]=sys.argv[1:5]
sys.argv=sys.argv[5:]
runpy.run_path(sys.argv[0],run_name="__main__")
'''
up=Path('/work/upstream');integ=Path('/work/kiln/integrations/passnet')
cmd=[sys.executable,'-c',BOOT,'/work/kiln/runtime/python',str(integ),str(up),str(T/'passes'),str(integ/'evaluate_normalized.py'),'--model-path',str(up/rec['graph']),'--compiler','pass_mgr','--device','cuda','--warmup','2','--trials','3','--config',enc]
with log.open('w') as f: r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT,cwd=up)
print(rec['graph'],r.returncode)
PY
