export default function(pi) { pi.registerProvider('local-fixture', {
 baseUrl:'http://127.0.0.1:1',apiKey:'fixture-only',api:'openai-completions',
 models:[{id:'scripted',name:'Scripted',reasoning:false,input:['text'],
 cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:10000,maxTokens:1000}] }); }