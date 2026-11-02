#!/usr/bin/env python3
"""Preserve a launcher staging failure and stage the already-pinned dataset."""
import hashlib,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parents[1];local=p/'sources/agent-runtime-bootstrap-v1';base='/home/manuel/passnet-kiln/KILN-005/sources/agent-runtime-bootstrap-v1';ssh=['ssh','-o','HostKeyAlias=bling.local','manuel@bling']
r=subprocess.run(ssh+['cat '+base+'/original-agent-smoke-driver-v1.log'],check=True,capture_output=True)
assert b'FileNotFoundError' in r.stdout and b'passagent-shipping-smoke.jsonl' in r.stdout
(local/'original-agent-launch-staging-failure-v1.log').write_bytes(r.stdout)
(local/'original-agent-launch-staging-failure-v1.json').write_text(json.dumps({'status':'failed_before_original_runner','cause':'Orchestration omitted staging the pinned smoke JSONL; no agent/model request or evaluator ran','log_sha256':hashlib.sha256(r.stdout).hexdigest(),'recovery':'Stage exact local dataset and launch separate v2 run; preserve v1 log and empty output directory'},indent=2)+'\n')
subprocess.run(['scp','-o','HostKeyAlias=bling.local',str(local/'passagent-shipping-smoke.jsonl'),'manuel@bling:'+base+'/'],check=True)
subprocess.run(['python3',str(p/'scripts/377-launch-original-agent-smoke.py'),'--run-id','v2'],check=True)
