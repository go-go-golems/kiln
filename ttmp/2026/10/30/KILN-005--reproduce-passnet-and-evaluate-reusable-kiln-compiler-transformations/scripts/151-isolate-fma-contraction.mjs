// Isolate one existing compiler rule; this is a diagnostic, not benchmark acceptance.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const [root,file]=process.argv.slice(2);
const {compileScript,endToEnd}=await import(resolve(root,'apps/workbench/src/compile.js'));
const {params}=await import(resolve(root,'packages/kiln/src/core/kiln.js'));
const {std}=await import(resolve(root,'packages/kiln/src/std/index.js'));
const source=readFileSync(file,'utf8');
for(const disabled of [false,true]){
 const text=source+(disabled?'\npassnetProject.pipeline(std.emmy.pipeline().removeRule("frontend/optimization","contract_fma"));\n':'');
 const c=compileScript(text,{params:params([]),target:std.target(std.targets.a100),pins:{}});
 if(!c.ok)throw new Error(JSON.stringify(c.diags));
 console.log(JSON.stringify({fma_contraction:!disabled,e2e:endToEnd(c.run,c.graph,c.project).e2e}));
}
