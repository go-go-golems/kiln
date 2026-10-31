import { AssistantMessageEventStream } from "/home/manuel/.nvm/versions/node/v24.18.0/lib/node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/utils/event-stream.js";
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
