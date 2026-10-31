#!/usr/bin/env python3
"""Freeze a four-slot search pilot with old training and fresh confirmation models.

Selection is metadata-only. Confirmation is neither compiled nor timed here.
The source-selection audit and partial output remain visible on any failure.
"""
import argparse
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ticket=Path(__file__).resolve().parent.parent
repo=next(p for p in ticket.parents if (p/'integrations/passnet').is_dir())
sys.path.insert(0,str(repo/'integrations/passnet'))
from prepare_study import prepare

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--node',required=True)
parser.add_argument('--output',type=Path,required=True)
args=parser.parse_args()
root=args.output.resolve()
root.mkdir()
def write(path,data):
    with path.open('x') as stream:json.dump(data,stream,indent=2);stream.write('\n')
state={'status':'preparing','scope':'Pilot preparation; metadata-only fresh confirmation selection; no performance result'}
def save():
    temporary=root/'prepare.tmp';temporary.write_text(json.dumps(state,indent=2)+'\n');temporary.replace(root/'prepare.json')
save()
try:
    protocol={'format':'kiln-policy-search-protocol/1','proposal_budget':4,
              'searches':[{'id':'threshold','method':'threshold-grid','values':[0.95,1.0,1.1,1.25]},
                          {'id':'random','method':'seeded-random','seed':20261031},
                          {'id':'llm','method':'external-llm','model':'Qwen3-30B-A3B',
                           'max_steps':12,'completion_budget':24576,'per_turn_tokens':4096}],
              'scope':'Equal proposal allowance; separate inference/compile/GPU costs; single proposal batch without timing feedback',
              'selection':'Independent training winner per method; unchanged Kiln is the fallback; no replacement of rejected or duplicate proposals'}
    write(root/'protocol.json',protocol)
    tracked=subprocess.check_output(['git','ls-files',str((ticket/'sources').relative_to(repo))],cwd=repo,text=True).splitlines()
    exclusions={};inputs={}
    for name in tracked:
        if not name.endswith('/manifest.json'):continue
        path=repo/name;data=json.loads(path.read_text())
        if not isinstance(data,dict):continue
        for row in data.get('variants',[]):
            if '/samples/' in row.get('graph','') and 'source_sha256' in row:
                exclusions[row['graph']]={'graph':row['graph'],'source_sha256':row['source_sha256']}
                inputs[name]=hashlib.sha256(path.read_bytes()).hexdigest()
    assert exclusions
    write(root/'excluded-models-manifest.json',{'variants':list(exclusions.values())})
    write(root/'exclusion-inputs.json',inputs)
    old=ticket/'sources/policy-corpus-v8-r2'
    spec=json.loads((old/'selection-spec.json').read_text())
    spec.update(salt='KILN-005-native-search-pilot-v1',excluded_manifests=['excluded-models-manifest.json'],
                train_per_category=0,heldout_per_category=4)
    write(root/'selection-spec.json',spec)
    state.update(status='selecting_confirmation',excluded_graphs=len(exclusions));save()
    prepare(ticket/'sources/upstream',root/'fresh-confirmation',root/'selection-spec.json')
    original=json.loads((old/'manifest.json').read_text())
    fresh=json.loads((root/'fresh-confirmation/manifest.json').read_text())
    corpus=root/'corpus';corpus.mkdir();(corpus/'policies').mkdir()
    rows=[];domains=[]
    for directory,manifest,split in [(old,original,'train'),(root/'fresh-confirmation',fresh,'heldout')]:
        source_domains=json.loads((directory/'reference-domains.json').read_text())
        for record in manifest['variants']:
            if record['split']!=split:continue
            row=copy.deepcopy(record);row['script']=f'{len(rows):03d}.kiln.js'
            text=(directory/record['script']).read_bytes()
            assert hashlib.sha256(text).hexdigest()==row['source_sha256']
            (corpus/row['script']).write_bytes(text);rows.append(row)
            domains.append(next(d for d in source_domains['records'] if d['graph']==row['graph']))
    assert sum(r['split']=='train' for r in rows)==12 and sum(r['split']=='heldout' for r in rows)==8
    assert len({r['model'] for r in rows})==len(rows)
    identity=hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest()
    manifest={'format':'kiln-passnet-corpus/1','sample':'native-policy-search-v1',
              'membership_sha256':identity,'numerical_policy':{'contraction':'separate'},'variants':rows,
              'scope':'Twelve previously studied FP32 training graphs; eight fresh exact-model confirmation graphs excluding tracked prior corpus models and official evaluation models; architecture relatives may remain',
              'training_manifest_sha256':hashlib.sha256((old/'manifest.json').read_bytes()).hexdigest(),
              'confirmation_manifest_sha256':hashlib.sha256((root/'fresh-confirmation/manifest.json').read_bytes()).hexdigest()}
    write(corpus/'manifest.json',manifest)
    write(corpus/'reference-domains.json',{'format':'kiln-reference-domains/1','membership_sha256':identity,
          'scope':'Synthetic compiler reference domains; GPU validation uses original source inputs','records':domains})
    state.update(status='compiling_training_controls',membership_sha256=identity);save()
    for name,policy in [('baseline',{'format':'kiln-fusion-policy/1','id':'baseline','kind':'unchanged'}),
                        ('default',{'format':'kiln-fusion-policy/1','id':'default','kind':'threshold','max_work_growth':1.02})]:
        write(corpus/'policies'/(name+'.json'),policy)
        command=[args.node,str(repo/'integrations/passnet/compile_policy.mjs'),'--directory',str(corpus),
                 '--output',str(root/'controls'/name),'--policy',str(corpus/'policies'/(name+'.json')),
                 '--target','a100','--phase','train']
        result=subprocess.run(command,capture_output=True,text=True)
        (root/(name+'.stdout.txt')).write_text(result.stdout);(root/(name+'.stderr.txt')).write_text(result.stderr)
        assert result.returncode==0,f'Training control failed: {name}; no replacement permitted'
    state.update(status='complete',training_graphs=12,confirmation_graphs=8,
                 confirmation_compiled=False,confirmation_timed=False)
except Exception as error:
    state.update(status='failed',error=str(error));raise
finally:save();print(json.dumps(state,indent=2),flush=True)
