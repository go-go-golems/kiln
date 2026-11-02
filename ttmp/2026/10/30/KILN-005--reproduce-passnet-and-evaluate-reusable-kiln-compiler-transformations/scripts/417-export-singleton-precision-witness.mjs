// Retain one complete softmax row, not the entire multi-megabyte input set.
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const ticket=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(ticket,'../../../../..');
const {compileScript}=await import(resolve(root,'apps/workbench/src/compile.js'));
const {params}=await import(resolve(root,'packages/kiln/src/core/kiln.js'));
const {target,SPECS}=await import(resolve(root,'packages/kiln/src/std/targets.js'));
const source=resolve(ticket,'sources/singleton-view-source-cohort-v1/task-010/corpus/001.kiln.js');
const c=compileScript(readFileSync(source,'utf8'),{params:params([]),target:target(SPECS.a100),contraction:'separate'});
if(!c.ok)throw new Error(JSON.stringify(c.diags));
const inputs=c.project.inputsFor(c.graph),values=new Map();
const expected=c.graph.eval(inputs,{values}).out0;
const actual=c.run.at('loop').eval(inputs).out0;
const conv=[...c.graph.nodes.values()].find(n=>n.name==='nn.conv2d');
const [x,w]=conv.args.map(id=>values.get(id));
const batch=35,spatial=48;
const result={format:'kiln-singleton-precision-witness/1',source,original_batch:batch,
 input:{shape:[1,608,8,6],data:Array.from(x.data.slice(batch*608*spatial,(batch+1)*608*spatial))},
 weight:{shape:w.shape,data:Array.from(w.data)},bias:{shape:[1],data:Array.from(inputs.v2.data)},
 frontend_output:Array.from(expected.data.slice(batch*48,(batch+1)*48)),
 loop_output:Array.from(actual.data.slice(batch*48,(batch+1)*48)),
 scope:'One batch of the deterministic protected-export input; diagnostic only, not a benchmark sample.'};
const path=resolve(ticket,'sources/singleton-precision-witness-v1.json');
writeFileSync(path,JSON.stringify(result)+'\n');
console.log(JSON.stringify({path,values:result.input.data.length,batch}));
