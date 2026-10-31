"""Exercise the production owner with an entirely local scripted provider."""
import json
from pathlib import Path
import subprocess
root=Path.cwd()
ticket=Path(__file__).resolve().parent.parent
out=ticket/'sources/pi-local-full-run-v1'
out.mkdir()
config=json.loads((ticket/'sources/pi-policy-batch-v1/config.json').read_text())
pkg=config['piPackage']
fixture=out/'fixture.ts'
fixture.write_text('''import { AssistantMessageEventStream } from '''+json.dumps(pkg+'/node_modules/@earendil-works/pi-ai/dist/utils/event-stream.js')+''';
export default function(pi) {
 pi.registerProvider('local-fixture', {
  baseUrl:'http://127.0.0.1:1', apiKey:'fixture-only', api:'local-scripted',
  models:[{id:'scripted',name:'Scripted',reasoning:false,input:['text'],
   cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32000,maxTokens:4096}],
  streamSimple(model, context, options) {
   const stream = new AssistantMessageEventStream();
   const message = { role:'assistant',api:'local-scripted',provider:'local-fixture',model:'scripted',
    content:[{type:'toolCall',id:'proposal-1',name:'submit_policy',arguments:{policy_json:JSON.stringify({
      format:'kiln-fusion-policy/1',id:'local-owner-test',kind:'threshold',max_work_growth:0.95})}}],
    stopReason:'toolUse',timestamp:Date.now(),
    usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,
      cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}} };
   stream.push({type:'done',reason:'toolUse',message});stream.end(message);return stream;
  }
 });
}
''')
config.update(extension=str(fixture),agentDir=str(out/'agent'),provider='local-fixture',model='scripted',
 output=str(out/'run'),proposalBudget=1,maxRequests=2,completionBudget=8192,
 timeoutMs=30000,protocol='kiln-local-scripted-owner-test/1')
(out/'config.json').write_text(json.dumps(config,indent=2)+'\n')
command=['/home/manuel/.nvm/versions/node/v26.13.0/bin/node',str(root/'integrations/passnet/run_pi_policy_agent.mjs'),str(out/'config.json')]
run=subprocess.run(command,capture_output=True,text=True,timeout=45)
(out/'stdout.txt').write_text(run.stdout);(out/'stderr.txt').write_text(run.stderr)
assert run.returncode==0,run.stderr
result=json.loads((out/'run/result.json').read_text())
assert result['status']=='terminated',result
assert result['rpcExit']=={'code':0,'signal':None},result
assert result['task']['attempts']==1 and result['task']['unique_artifacts']==1,result
assert result['gate']['requests']==1,result
(out/'verification.json').write_text(json.dumps({'status':'passed','result':result,'network_inference':False},indent=2)+'\n')
print(json.dumps(result))
