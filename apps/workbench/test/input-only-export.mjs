import assert from 'node:assert/strict';
import {params} from '../../../packages/kiln/src/core/kiln.js';
import {SPECS,target} from '../../../packages/kiln/src/std/targets.js';
import {exportProgram} from '../../../packages/kiln/src/std/export.js';
import {compileScript,endToEnd,hasKernels} from '../src/compile.js';
for(const dtype of ['f32','f16','bf16'])for(const shape of [[],[5]]){
 const expression=shape.length?'N.transpose(x,0,0)':'N.reshape(x,[])';
 const text=`project("input-alias").program(({x})=>({out:${expression}}),{x:k.tensor(${JSON.stringify(shape)},${JSON.stringify(dtype)})});`;
 const compiled=compileScript(text,{params:params([]),target:target(SPECS.a100)});
 assert.ok(compiled.ok,JSON.stringify(compiled.diags));assert.ok(compiled.prog);
 assert.equal(hasKernels(compiled.run),false);assert.equal(compiled.prog.kernels.length,0);
 assert.ok(endToEnd(compiled.run,compiled.graph,compiled.project).e2e.ok);
 const artifact=exportProgram(compiled.run,compiled.prog);
 assert.equal(artifact.kernels.length,0);assert.equal(artifact.outputs[0].buffer,artifact.inputs[0].buffer);
 assert.deepEqual(artifact.outputs[0].shape,shape);assert.equal(artifact.outputs[0].dtype,dtype);
}
const arithmetic=compileScript('project("sum").program(({x})=>({out:N.sum(x,-1)}),{x:k.tensor([2,3])});',{params:params([]),target:target(SPECS.a100)});
assert.ok(arithmetic.ok&&hasKernels(arithmetic.run)&&arithmetic.prog.kernels.length);
console.log('scalar/vector input-alias exports preserve shape/dtype with zero kernels; computed programs stay distinct');
