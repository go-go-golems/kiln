// Fresh process: the expression interner must not conceal different binder names.
import assert from 'node:assert/strict';
import {k} from '../../src/core/kiln.js';
import {N} from '../../src/std/tensor.js';
import {freshR} from '../../src/std/loop.js';
import {pipeline} from '../../src/std/emmy.js';
import {programOf,simulateKernel} from '../../src/std/program.js';
import {exportProgram} from '../../src/std/export.js';
import {contentOf} from '../../src/std/records.js';
import {SPECS,target} from '../../src/std/targets.js';

const [burn,which,change='base']=process.argv.slice(2);
for(let i=0;i<Number(burn);i++)freshR();
const definitions={
 thread:{fn:({x})=>({out:N.sum(x,-1)}),spec:{x:k.tensor([3,17])},params:{MAP:'thread'}},
 row:{fn:({x})=>({out:N.softmax(x)}),spec:{x:k.tensor([3,17])},params:{MAP:'row',STAGE:'none'}},
 staged:{fn:({x})=>({out:N.softmax(x)}),spec:{x:k.tensor([3,17])},params:{MAP:'row',STAGE:'reused'}},
 nested:{fn:({x,y})=>({out:N.sum(N.mul(N.sum(x,-1),y),0)}),spec:{x:k.tensor([3,17]),y:k.tensor([3,1])},params:{MAP:'thread'}},
 tiled:{fn:({x,y})=>({out:N.matmul(x,y)}),spec:{x:k.tensor([16,16]),y:k.tensor([16,16])},params:{MAP:'tiled'}},
};
const def=definitions[which];if(!def)throw new Error('Unknown canonical emission fixture');
const graph=k.trace('canonical',values=>{
 const outputs=def.fn(values);return change==='base'?outputs:{out:N.add(outputs.out,1)};
},def.spec);
const hardware=target(SPECS.a100),run=pipeline({target:hardware}).run(graph,{params:def.params});
assert.ok(run.ok,run.error?.message);
const program=programOf(run.graph);
assert.ok(program.kernels.some(kernel=>kernel.map.MAP===def.params.MAP),'requested mapping is exercised');
if(which==='staged')assert.ok(program.kernels.some(kernel=>kernel.map.STAGE==='reused'),'shared staging is exercised');
const checks=program.kernels.map(kernel=>simulateKernel(kernel,hardware).check);
assert.ok(checks.every(check=>check.ok),JSON.stringify(checks));
const contents=program.kernels.map(kernel=>({
 cuda:contentOf(kernel,{kind:'cuda'}),sim:contentOf(kernel,{kind:'sim',spec:SPECS.a100}),
 wgsl:kernel.wgsl?contentOf(kernel,{kind:'webgpu'}):null,
}));
process.stdout.write(JSON.stringify({artifact:exportProgram(run,program,{name:'canonical'}),kernelIR:program.kernels.map(k=>k.K),contents}));
