"""Two exploratory replicates at each thinking level; fixed development feedback."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
root=Path.cwd();ticket=Path(__file__).resolve().parent.parent
out=ticket/'sources/pi-transformation-lanes-v1';out.mkdir()
base=json.loads((ticket/'sources/pi-policy-batch-v1/config.json').read_text())
sequence=json.loads((ticket/'sources/agent-fusion-sequence-validation-v1.json').read_text())['artifact']['program']
feedback=json.loads((ticket/'sources/staged-fusion-results-v1/selection.json').read_text())
extra='''
You may now propose a two-stage compiler transformation instead of one policy.
Use {"format":"kiln-transformation-program/1","id":"your-id","kind":"fusion-sequence",
"expose": POLICY, "cleanup": POLICY}, where each POLICY follows the policy grammar above.
Neither stage may be unchanged. The combined tree-node limit is 31.
Expose replaces the original loop fusion rule. Cleanup runs immediately afterward,
in reverse order, with its own policy, but never fuses away a recognized contraction
producer whose minimum estimated schedule uses tiled mapping. That protection is fixed.
Other cleanup producers remain eligible under normal legality checks. This is a
composition of existing operations, not source code synthesis. It cannot change
numerical policy, schedule enumeration, or evaluator settings.
'''
prompt=('Inspect training features. Submit three distinct fusion-sequence programs. '
        'Vary the expose and cleanup decisions to improve on the fixed staged program, '
        'using structural hypotheses. Finish after three proposals. '
        'This is development search; do not claim measured results for your proposals.\n'
        'Known staged program: '+json.dumps(sequence)+'\n'
        'Measured development ranking: '+json.dumps(feedback)+'\n'
        'Mechanism: selective exposure allowed four matrix cases to use tiled schedules; '
        'unconditional exposure regressed two row-scheduled cases. Cleanup recovered '
        'their baseline executables. Eight of twelve staged development outputs alias '
        'baseline; four improved. No confirmation data is provided.')
configs=[]
for level in ['low','medium','high']:
 for replicate in [1,2]:
  name=f'{level}-{replicate}';lane=out/name;lane.mkdir()
  config={**base,'output':str(lane/'run'),'proposalBudget':3,'maxRequests':24,
   'maxCompletionTokens':16384,'completionBudget':393216,'timeoutMs':600000,
   'thinkingLevel':level,'systemPrompt':base['systemPrompt']+extra,'prompt':prompt,
   'protocol':'kiln-pi-transformation-exploration/1',
   'interpretation':'Two exploratory replicates per requested thinking level. Verify effective levels. No statistical comparison or fresh generalization claim.'}
  path=lane/'config.json';path.write_text(json.dumps(config,indent=2)+'\n');configs.append((name,path))
def run(item):
 name,path=item
 with (path.parent/'owner.log').open('w') as log:
  p=subprocess.run(['/home/manuel/.nvm/versions/node/v26.13.0/bin/node',str(root/'integrations/passnet/run_pi_policy_agent.mjs'),str(path)],stdout=log,stderr=subprocess.STDOUT)
 result={'lane':name,'returncode':p.returncode}
 receipt=path.parent/'run/result.json'
 if receipt.exists():result['result']=json.loads(receipt.read_text())
 print(json.dumps(result),flush=True)
 return result
with ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(run,configs))
(out/'summary.json').write_text(json.dumps(results,indent=2)+'\n')
