// Run inside the remote Kiln workspace; compares original and typed input domains.
import {readFileSync} from 'node:fs';
import {compileScript,endToEnd} from './apps/workbench/src/compile.js';
import {params} from './packages/kiln/src/core/kiln.js';
import {SPECS,target} from './packages/kiln/src/std/targets.js';
import {roundToDtype} from './packages/kiln/src/core/dtypes.js';
const c=compileScript(readFileSync('../concat/bf16.kiln.js','utf8'),{params:params([]),target:target(SPECS.a100)});
const before=endToEnd(c.run,c.graph,c.project).e2e;
const inputs=c.project.inputsFor(c.graph);
for(const input of c.graph.inputs){
 const dtype=c.graph.nodes.get(input.id).type.dtype;
 if(['f16','bf16'].includes(dtype)) for(let i=0;i<inputs[input.name].data.length;i++)inputs[input.name].data[i]=roundToDtype(inputs[input.name].data[i],dtype);
}
c.project.data(inputs);
const after=endToEnd(c.run,c.graph,c.project).e2e;
console.log(JSON.stringify({before,after},null,2));
