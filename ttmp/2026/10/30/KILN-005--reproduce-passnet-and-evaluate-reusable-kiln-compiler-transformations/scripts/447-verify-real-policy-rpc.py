"""Local-only real-validator process test; no provider or GPU access."""
import json
from pathlib import Path
import subprocess
import sys

root = Path.cwd()
ticket = Path(__file__).resolve().parent.parent
out = ticket/'sources/pi-real-rpc-verification-v1'
out.mkdir()
policy = {'format': 'kiln-fusion-policy/1', 'id': 'rpc-test', 'kind': 'threshold', 'max_work_growth': 0.95}
requests = [
 {'id': '1', 'tool': 'submit_policy', 'arguments': None},
 {'id': '2', 'tool': 'submit_policy', 'arguments': {'policy_json': json.dumps(policy)}},
 {'id': '3', 'tool': 'submit_policy', 'arguments': {'policy_json': json.dumps(policy)}},
 {'id': '4', 'tool': 'submit_policy', 'arguments': {'policy_json': json.dumps(policy)}},
 {'id': '5', 'tool': 'finish', 'arguments': {}},
]
command = [sys.executable, str(root/'integrations/passnet/native_policy_rpc.py'),
 '--manifest', str(ticket/'sources/native-policy-search-v2/corpus/manifest.json'),
 '--receipt', str(ticket/'sources/native-policy-search-v2/controls/default/compile-receipt.json'),
 '--output', str(out/'task'), '--proposal-budget', '3',
 '--node', '/home/manuel/.nvm/versions/node/v26.13.0/bin/node']
payload = ''.join(json.dumps(row)+'\n' for row in requests)
(out/'requests.jsonl').write_text(payload)
completed = subprocess.run(command, input=payload, text=True, capture_output=True, timeout=60)
(out/'stdout.jsonl').write_text(completed.stdout)
(out/'stderr.txt').write_text(completed.stderr)
assert completed.returncode == 0, completed.stderr
responses = [json.loads(line) for line in completed.stdout.splitlines()]
assert responses[0]['status'] == 'ready'
assert [row['id'] for row in responses[1:]] == ['1','2','3','4','5']
assert [row['result']['status'] for row in responses[1:]] == ['rejected','accepted','duplicate','budget_exhausted','finished']
finish = json.loads((out/'task/finished.json').read_text())
assert finish['attempts'] == 3 and finish['unique_artifacts'] == 1
assert len(list((out/'task').glob('*.request.json'))) == 3
assert len(list((out/'task').glob('*.artifact.json'))) == 1
(out/'verification.json').write_text(json.dumps({'status':'passed', 'command':command,
 'attempts':3, 'unique_artifacts':1, 'provider_requests':0, 'evaluation_status':'not_run'}, indent=2)+'\n')
print('Real RPC: invalid charged, valid accepted, duplicate charged, excess rejected; 3 attempts, 1 artifact.')
