#!/usr/bin/env python3
"""Correct the probe's Python search paths without modifying upstream code."""
import argparse,hashlib,json,subprocess
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,required=True);root=parser.parse_args().root.resolve();receipt=root/'agent-locked-import-v2.json'
assert not receipt.exists()
assert json.loads((root/'agent-locked-environment-v1.json').read_text())['error']=='Original import returned 1'
paths=[str(root/'passnet-pristine'),str(root/'passnet-pristine/pass_agent')]
code='import sys;sys.path[:0]='+repr(paths)+';from runtime.passnet_docker import PassNetDocker;from agent.pass_agent import PassAgent;from r2egym.agenthub.agent.agent import AgentArgs;print("Original PassAgent, PassNetDocker and AgentArgs import succeeded")'
command=[str(root/'agent-locked-venv/bin/python'),'-c',code]
r=subprocess.run(command,capture_output=True,text=True)
state={'format':'kiln-original-agent-import/1','returncode':r.returncode,'status':'complete' if r.returncode==0 else 'failed','command':command,'stdout':r.stdout,'stderr':r.stderr,'driver_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'source_changes':False,'recovery':'Supply both source root and pass_agent root for mixed original absolute imports'}
receipt.write_text(json.dumps(state,indent=2)+'\n');print(json.dumps(state,indent=2));raise SystemExit(r.returncode)
