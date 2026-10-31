// A minimal arithmetic oracle for the suspected JS serial precision gap.
import {resolve} from 'node:path';
const root=process.argv[2];
const {compileScript,endToEnd}=await import(resolve(root,'apps/workbench/src/compile.js'));
const {params}=await import(resolve(root,'packages/kiln/src/core/kiln.js'));
const {std}=await import(resolve(root,'packages/kiln/src/std/index.js'));
const script='project("f32-rounding").program(({x})=>({out:N.cast(N.sub(N.add(x,1),100000000),"bf16")}),{x:k.tensor([1],"f32")}).data({x:new Tensor([1],Float32Array.of(100000000))});';
const c=compileScript(script,{params:params([]),target:std.target(std.targets.a100),pins:{}});
if(!c.ok)throw new Error(JSON.stringify(c.diags));
const r=endToEnd(c.run,c.graph,c.project);
console.log(JSON.stringify({e2e:r.e2e,want:r.outputs&&Array.from(r.outputs.want.out.data),got:r.outputs&&Array.from(r.outputs.got.out.data)}));
