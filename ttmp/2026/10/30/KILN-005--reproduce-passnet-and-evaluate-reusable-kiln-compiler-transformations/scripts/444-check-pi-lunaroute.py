#!/usr/bin/env python3
"""Record installed Pi/provider sources and a small authorized connectivity call.

Never inspect or archive credential/config contents. Pi resolves authentication.
The READY prompt is an operational latency check, not an optimization trial.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import time

ticket=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase',choices=['discover','smoke'])
args=parser.parse_args()
root=ticket/'sources/pi-lunaroute-runtime-v1'
pi=Path('/home/manuel/.nvm/versions/node/v24.18.0/lib/node_modules/@earendil-works/pi-coding-agent')
extension=Path('/home/manuel/.pi/agent/npm/node_modules/@lunaroute/pi-extension')
cli=['/home/manuel/.nvm/versions/node/v26.13.0/bin/node',str(pi/'dist/bundle/cli.js')]
flags=['--offline','--no-extensions','--extension',str(extension/'src/index.ts'),
       '--no-skills','--no-prompt-templates','--no-themes','--no-context-files']
if args.phase=='discover':
    root.mkdir()
    records={}
    for prefix,directory,names in [('pi',pi,['package.json','docs/sdk.md','docs/json.md','docs/extensions.md',
                                           'dist/core/sdk.d.ts','dist/core/resource-loader.d.ts']),
                                   ('lunaroute',extension,['package.json','README.md','LICENSE','src/index.ts'])]:
        for name in names:
            source=directory/name;dest=root/prefix/name;dest.parent.mkdir(parents=True,exist_ok=True)
            shutil.copyfile(source,dest);records[prefix+'/'+name]=hashlib.sha256(source.read_bytes()).hexdigest()
    command=cli+flags+['--list-models','lunaroute']
    result=subprocess.run(command,capture_output=True,text=True,timeout=60)
    (root/'models.stdout.txt').write_text(result.stdout);(root/'models.stderr.txt').write_text(result.stderr)
    record={'status':'available' if result.returncode==0 and 'glm-5.3-flash ' in result.stdout else 'failed',
            'pi_version':json.loads((pi/'package.json').read_text())['version'],
            'lunaroute_version':json.loads((extension/'package.json').read_text())['version'],
            'command':command,'returncode':result.returncode,'source_sha256':records,
            'selected_model':'lunaroute/glm-5.3-flash','scope':'Installed source/catalog inspection; no inference'}
    (root/'discovery.json').write_text(json.dumps(record,indent=2)+'\n')
else:
    out=root/'smoke';out.mkdir()
    command=cli+flags+['--no-tools','--model','lunaroute/glm-5.3-flash','--thinking','off',
                      '--mode','json','--session-dir',str(out/'sessions'),
                      '--system-prompt','This is a provider connectivity check. Reply exactly READY.',
                      '--print','Reply READY.']
    record={'status':'running','command':command,'scope':'Small connectivity/latency check; not compiler optimization evidence'}
    (out/'run.json').write_text(json.dumps(record,indent=2)+'\n')
    started=time.monotonic()
    try:
        with (out/'events.jsonl').open('x') as stdout,(out/'stderr.txt').open('x') as stderr:
            result=subprocess.run(command,stdout=stdout,stderr=stderr,timeout=120)
        events=[json.loads(line) for line in (out/'events.jsonl').read_text().splitlines() if line.strip()]
        messages=[event['message'] for event in events if event.get('type')=='message_end' and event.get('message',{}).get('role')=='assistant']
        record.update(returncode=result.returncode,assistant_messages=messages,
                      status='complete' if result.returncode==0 and messages and messages[-1].get('stopReason')=='stop' else 'failed')
    except Exception as error:record.update(status='failed',error_type=type(error).__name__,error=str(error))
    record['elapsed_seconds']=time.monotonic()-started
    (out/'run.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record,indent=2))
if record['status'] not in ['available','complete']:raise SystemExit(1)
