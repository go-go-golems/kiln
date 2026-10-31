import assert from 'node:assert/strict';
import {k} from '../src/core/kiln.js';
import {Tensor} from '../src/core/util.js';
import {N} from '../src/std/tensor.js';
import {pipeline} from '../src/std/emmy.js';
import {programOf} from '../src/std/program.js';
import {SPECS,target} from '../src/std/targets.js';
import {toWgsl} from '../src/std/emit.js';

const g=k.trace('contraction',({x,y,z})=>({out:N.cast(N.add(N.mul(x,y),z),'bf16')}),{
 x:k.tensor([1]),y:k.tensor([1]),z:k.tensor([1])
});
const inputs={x:new Tensor([1],Float32Array.of(1+2**-23)),y:new Tensor([1],Float32Array.of(1-2**-23)),z:new Tensor([1],Float32Array.of(-1))};
const hardware=target(SPECS.a100);
const normal=pipeline({target:hardware}).run(g);
const allow=pipeline({target:hardware,contraction:'allow'}).run(g);
const separate=pipeline({target:hardware,contraction:'separate'}).run(g);
for(const run of [normal,allow,separate])assert.ok(run.ok,run.error?.message);
const unchanged=programOf(normal.graph).kernels,ordinary=programOf(allow.graph).kernels,protectedKernels=programOf(separate.graph).kernels;
assert.deepEqual(ordinary.map(k=>k.identity),unchanged.map(k=>k.identity),'explicit allow equals existing default');
assert.equal(g.eval(inputs).out.data[0],0);
assert.equal(allow.at('loop').eval(inputs).out.data[0],-(2**-46),'FMA retains the exact small difference');
assert.equal(separate.at('loop').eval(inputs).out.data[0],0,'separate multiplication rounds before addition');
assert.ok(protectedKernels.some(k=>k.cuda.includes('__fmul_rn')&&k.cuda.includes('__fadd_rn')));
assert.ok(protectedKernels.every(k=>!k.cuda.includes('fmaf(')));
// Use FP32 storage as well: WGSL refusal is about arithmetic guarantees,
// independent of the existing BF16 storage refusal.
const plain=k.trace('protected-f32',({x,y,z})=>({out:N.add(N.mul(x,y),z)}),{x:k.tensor([1]),y:k.tensor([1]),z:k.tensor([1])});
const plainRun=pipeline({target:hardware,contraction:'separate'}).run(plain);
const protectedKernel=programOf(plainRun.graph).kernels[0];
assert.equal(protectedKernel.wgsl,null);
assert.match(protectedKernel.wgslUnavailable,/WGSL scalar guarantee not implemented/);
assert.throws(()=>toWgsl(protectedKernel.K),/scalar guarantee/);
assert.throws(()=>pipeline({contraction:'sometimes'}),/contraction/);
const literal=k.trace('literal-boundary',()=>({out:N.add(1+2**-25,-1)}),{});
const literalRun=pipeline({target:hardware,contraction:'separate'}).run(literal);
assert.equal(literal.eval({}).out.data[0],0);
assert.equal(literalRun.at('loop').eval({}).out.data[0],0,'constant folding honors operand precision');
console.log('contraction policy preserves explicit FP32 boundaries and default identities');
// Low-precision multiply-add keeps the multiply's own rounding under the default policy.
const half=k.trace('half-multiply-add',({x,y,z})=>({out:N.add(N.mul(x,y),z)}),{x:k.tensor([1],'f16'),y:k.tensor([1],'f16'),z:k.tensor([1],'f16')});
for(const dtype of ['f16','bf16']){
 const lowered=k.trace('low-multiply-add-'+dtype,({x,y,z})=>({out:N.add(N.mul(x,y),z)}),{x:k.tensor([1],dtype),y:k.tensor([1],dtype),z:k.tensor([1],dtype)});
 const lowRun=pipeline({target:hardware}).run(lowered);
 assert.ok(lowRun.ok,lowRun.error?.message);
 const kernels=programOf(lowRun.graph).kernels;
 assert.ok(kernels.every(k=>!k.cuda.includes('fmaf(')),`${dtype} multiply-add must not contract`);
}
const halfInputs={x:new Tensor([1],Float32Array.of(1+2**-6),'f16'),y:new Tensor([1],Float32Array.of(1+2**-6),'f16'),z:new Tensor([1],Float32Array.of(-1),'f16')};
const halfRun=pipeline({target:hardware}).run(half);
assert.equal(halfRun.at('loop').eval(halfInputs).out.data[0],half.eval(halfInputs).out.data[0],'loop reference matches frontend rounding');
console.log('low-precision multiply-add keeps intermediate rounding');
