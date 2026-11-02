"""Six independent exploratory proposal lanes with measured development feedback."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess

root=Path.cwd();ticket=Path(__file__).resolve().parent.parent
out=ticket/'sources/pi-six-lanes-v1';out.mkdir()
base=json.loads((ticket/'sources/pi-policy-batch-v1/config.json').read_text())
ranking=json.loads((ticket/'sources/pi-policy-train-results-v1/selection.json').read_text())['ranking']
prior=[json.loads(p.read_text()) for p in sorted((ticket/'sources/pi-policy-compile-v1').glob('attempt-*.json'))]
feedback={'ranking':ranking,'policies':prior,'interpretation':'Development aggregate end-to-end speedup. Higher is better. Prior permissive thresholds 1.1 and 1.25 aliased baseline. Only one default training fusion decision was rejected (work ratio about 1.06). Avoid merely suppressing useful fusion.'}
hypotheses=[
 ('region-launch','Explore region selection with launch savings. Prefer concrete region policies over redundant trees. Test varied launch_work estimates.'),
 ('region-memory','Explore region materialization costs, retaining producer costs when consumers remain. Use region policies with varied materialization_work.'),
 ('selective-consumer','Explore selective per-consumer fusion rather than all-or-none aggregate threshold changes. Preserve default aggregate behavior when possible.'),
 ('fanout','Explore graph fanout-sensitive decision trees or selective rules. Avoid reducing fusion for all single-consumer producers.'),
 ('small-producer','Explore permissive fusion for small producers where launch savings may dominate duplicated arithmetic. Respect the hard growth guard.'),
 ('counterhypothesis','Challenge the prior hypotheses. Seek genuinely different valid policies in the available grammar. Explain in your reasoning when this grammar appears saturated rather than claiming invented speedups.'),
]
configs=[]
for name,hypothesis in hypotheses:
 lane=out/name;lane.mkdir()
 config={**base,'output':str(lane/'run'),'proposalBudget':6,'maxRequests':30,
 'maxCompletionTokens':8192,'completionBudget':245760,'timeoutMs':600000,
 'protocol':'kiln-six-lane-exploration/1',
 'prompt':'Inspect training features. Propose six distinct policies for this hypothesis: '+hypothesis+'\nMeasured development feedback:\n'+json.dumps(feedback),
 'interpretation':'Exploratory lanes with prior timing feedback; no equal-cost comparison or fresh test-set claim.'}
 path=lane/'config.json';path.write_text(json.dumps(config,indent=2)+'\n');configs.append((name,path))
def run(item):
 name,path=item
 with (path.parent/'owner.log').open('w') as log:
  completed=subprocess.run(['/home/manuel/.nvm/versions/node/v26.13.0/bin/node',str(root/'integrations/passnet/run_pi_policy_agent.mjs'),str(path)],stdout=log,stderr=subprocess.STDOUT)
 result={'lane':name,'returncode':completed.returncode}
 receipt=path.parent/'run/result.json'
 if receipt.exists():result['result']=json.loads(receipt.read_text())
 print(json.dumps(result),flush=True)
 return result
with ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(run,configs))
(out/'summary.json').write_text(json.dumps(results,indent=2)+'\n')
