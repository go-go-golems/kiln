import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createPolicySession } from '../../../../../../integrations/passnet/pi_policy_session.mjs';
import { createRequestGate } from '../../../../../../integrations/passnet/pi_request_gate.mjs';
const output = resolve(process.argv[2]);
mkdirSync(output);
const pkg = '/home/manuel/.nvm/versions/node/v24.18.0/lib/node_modules/@earendil-works/pi-coding-agent';
const { AssistantMessageEventStream } = await import(`${pkg}/node_modules/@earendil-works/pi-ai/dist/utils/event-stream.js`);
const extension = `${output}/fixture.ts`;
writeFileSync(extension, `export default function(pi) { pi.registerProvider('local-fixture', {
 baseUrl:'http://127.0.0.1:1',apiKey:'fixture-only',api:'openai-completions',
 models:[{id:'scripted',name:'Scripted',reasoning:false,input:['text'],
 cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:10000,maxTokens:1000}] }); }`);
const events = [], calls = [];
const config = { piPackage:pkg, extension, agentDir:`${output}/agent`, cwd:process.cwd(),
 sessionDir:`${output}/sessions`, provider:'local-fixture',model:'scripted',
 maxRequests:1,maxCompletionTokens:100,completionBudget:100,systemPrompt:'Local protocol test.' };
const owner = await createPolicySession(config, async (name,args) => {
 calls.push({name,args}); return {status:'rejected',remaining:0};
}, (kind,value) => events.push({kind,value}));
let dispatched = 0;
owner.session.agent.streamFunction = createRequestGate(() => {
 dispatched++;
 const stream = new AssistantMessageEventStream();
 const message = {role:'assistant',content:[{type:'toolCall',id:'invalid-1',name:'submit_policy',arguments:{wrong:1}}],
 api:'openai-completions',provider:'local-fixture',model:'scripted',stopReason:'toolUse',timestamp:Date.now(),
 usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
 stream.push({type:'done',reason:'toolUse',message}); stream.end(message); return stream;
}, {...config, stopped:()=>owner.boundary.closed,record:value=>events.push({kind:'admission',value})}).invoke;
try {
 await owner.session.prompt('Exercise invalid native submission.');
 assert.equal(dispatched,1);
 assert.equal(calls.length,1);
 assert.deepEqual(calls[0],{name:'submit_policy',args:{wrong:1}});
 assert.equal(owner.boundary.closed,true);
 writeFileSync(`${output}/result.json`,JSON.stringify({status:'passed',dispatched,calls,events},null,2));
} finally { owner.session.dispose(); }
