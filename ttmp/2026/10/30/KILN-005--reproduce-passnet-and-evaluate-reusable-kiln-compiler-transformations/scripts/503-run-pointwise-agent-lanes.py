"""Six authorized Pi/LunaRoute lanes on new pointwise development features."""
from concurrent.futures import ThreadPoolExecutor
import json,subprocess
from pathlib import Path
root=Path.cwd();T=Path(__file__).resolve().parent.parent;s=T/'sources';development=s/'pointwise-agent-development-v1'
base=json.loads((s/'pi-policy-batch-v1/config.json').read_text())
out=s/'pi-pointwise-lanes-v1';out.mkdir()
known=json.loads((development/'pointwise.json').read_text())
extra='''
Additional compiler program grammar:
{"format":"kiln-transformation-program/1","id":"your-id","kind":"pointwise-fusion-sequence","expose":POLICY,"cleanup":POLICY}.
Both stages require explicit policies (not unchanged). The combined node budget is31 including one pointwise decomposition node.
The pointwise step lowers eligible zero-padded1x1 convolution into existing grouped/batched matmul; other convolution geometry retains its normal decomposition.
Selective exposure runs before scheduling-aware cleanup. Cleanup preserves recognized contraction producers whose minimum estimated schedule is tiled; other producers use your cleanup policy.
You may also use kind fusion-sequence to omit the pointwise rewrite while keeping the same two stages (node budget31).
The inspect_training tool reports default pipeline aggregate fusion features, not post-decomposition consumer features. Do not confuse these with timings or pretend you know unreported matrix dimensions.
You cannot change numerical settings, schedule enumeration, compiler source or evaluator behavior.
'''
prompt=('Inspect training features and submit three distinct reusable compiler programs using the new pointwise-fusion-sequence or fusion-sequence kinds. '
 'Propose evidence-based alternatives to this manually authored fixed program: '+json.dumps(known)+'. '
 'The research question is whether exposure/cleanup profitability can improve convolution implementations while avoiding unnecessary materialization in small computations. '
 'This population is new development data; no GPU timings have been observed for it. '
 'Vary interpretable feature predicates and thresholds, not names alone. Do not claim a speedup before measurement. Finish after three submissions.')
configs=[]
for level in ['low','medium','high']:
 for replicate in [1,2]:
  name=f'{level}-{replicate}';lane=out/name;lane.mkdir()
  config={**base,'manifest':str(development/'corpus/manifest.json'),'receipt':str(development/'default/compile-receipt.json'),'output':str(lane/'run'),'proposalBudget':3,'maxRequests':24,'maxCompletionTokens':16384,'completionBudget':393216,'timeoutMs':600000,'thinkingLevel':level,'systemPrompt':base['systemPrompt']+extra,'prompt':prompt,'protocol':'kiln-pi-pointwise-development/1','interpretation':'Six exploratory lanes; structural development feedback only; no confirmation outcomes disclosed.'}
  path=lane/'config.json';path.write_text(json.dumps(config,indent=2)+'\n');configs.append((name,path))
def run(item):
 name,path=item
 with (path.parent/'owner.log').open('w') as log:r=subprocess.run(['/home/manuel/.nvm/versions/node/v26.13.0/bin/node',str(root/'integrations/passnet/run_pi_policy_agent.mjs'),str(path)],stdout=log,stderr=subprocess.STDOUT)
 result={'lane':name,'returncode':r.returncode};receipt=path.parent/'run/result.json'
 if receipt.exists():result['result']=json.loads(receipt.read_text())
 print(json.dumps(result),flush=True);return result
with ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(run,configs))
(out/'summary.json').write_text(json.dumps(results,indent=2)+'\n')
