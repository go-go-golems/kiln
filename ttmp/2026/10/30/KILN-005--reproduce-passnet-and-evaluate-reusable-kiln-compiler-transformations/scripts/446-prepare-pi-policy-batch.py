"""Prepare a distinct Pi development protocol; prior confirmation data is consumed."""
import ast
import json
from pathlib import Path
root = Path.cwd()
ticket = Path(__file__).resolve().parent.parent
module = ast.parse((root/'integrations/passnet/run_native_policy_agent.py').read_text())
prompt = next(ast.literal_eval(n.value) for n in module.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'SYSTEM_PROMPT' for t in n.targets))
a = prompt.index('Use exactly one XML')
b = prompt.index('There is no shell', a)
prompt = prompt[:a] + 'Use the native tools supplied by the host. Multiple tool calls are allowed.\n' + prompt[b:]
a = prompt.index('A reply with multiple actions')
prompt = prompt[:a] + 'Every identifiable submission consumes a slot, including invalid or truncated calls. Finish when done.\n'
out = ticket/'sources/pi-policy-batch-v1'
out.mkdir()
config = dict(piPackage='/home/manuel/.nvm/versions/node/v24.18.0/lib/node_modules/@earendil-works/pi-coding-agent',
 extension='/home/manuel/.pi/agent/npm/node_modules/@lunaroute/pi-extension/src/index.ts',
 agentDir='/home/manuel/.pi/agent', cwd=str(root), provider='lunaroute', model='glm-5.3-flash',
 python='python', manifest=str(ticket/'sources/native-policy-search-v2/corpus/manifest.json'),
 receipt=str(ticket/'sources/native-policy-search-v2/controls/default/compile-receipt.json'),
 output=str(out/'run'), proposalBudget=4, maxRequests=12, maxCompletionTokens=4096,
 completionBudget=24576, timeoutMs=300000, systemPrompt=prompt,
 prompt='Inspect the training features and propose four distinct reusable policies. Use native tools.',
 protocol='kiln-pi-development-policy-batch/1', interpretation='Development data; no fresh generalization claim. Completion budget reserves caps, not observed usage.')
(out/'config.json').write_text(json.dumps(config, indent=2)+'\n')
print(out/'config.json')
