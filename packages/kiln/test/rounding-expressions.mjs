import assert from 'node:assert/strict';
import {FNS} from '../src/std/fns.js';
import {E,runSerial} from '../src/std/loop.js';
import {Tensor} from '../src/core/util.js';
import * as IX from '../src/core/ix.js';
import {toCuda,toWgsl} from '../src/std/emit.js';
for(const dtype of ['f16','bf16']){
 const fn='round_'+dtype;
 const midpoint=dtype==='f16'?1+2**-11:1+2**-8;
 assert.equal(FNS[fn].js(midpoint),1);
 const expr=E.op(fn,E.load(0,[IX.V('a0')]));
 const out=runSerial(expr,[1],[new Tensor([1],Float32Array.of(midpoint))]);
 assert.equal(out.data[0],1);
 const K={name:'round',block:32,params:[{role:'in',dtype:'f32'},{role:'out',dtype:'f32'}],smem:[],floats:['v'],ints:[],body:[{s:'let',n:'v',e:{k:'op',fn,a:[{k:'num',v:midpoint}]}},{s:'store',buf:'out',idx:IX.C(0),e:{k:'var',n:'v'}}]};
 assert.ok(toCuda(K).includes(dtype==='f16'?'cuda_fp16.h':'cuda_bf16.h'));
 assert.ok(toWgsl(K).includes(dtype==='f16'?'pack2x16float':'fn kiln_round_bf16'));
}
console.log('explicit rounding expressions passed');
