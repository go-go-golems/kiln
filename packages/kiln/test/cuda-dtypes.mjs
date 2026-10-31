import assert from 'node:assert/strict';
import {toCuda} from '../src/std/emit.js';
const kernel=(dtype)=>({name:'copy',block:32,params:[{role:'in',dtype},{role:'out',dtype}],smem:[],floats:['v'],ints:[],body:[{s:'load',n:'v',buf:0,idx:{t:'c',v:0}},{s:'store',buf:'out',idx:{t:'c',v:0},e:{k:'var',n:'v'}}]});
for(const [dtype,type,ld,st] of [['f16','__half','__half2float','__float2half_rn'],['bf16','__nv_bfloat16','__bfloat162float','__float2bfloat16_rn']]){
 const source=toCuda(kernel(dtype));
 assert.ok(source.includes(`const ${type}*`));assert.ok(source.includes(`${type}* __restrict__ dst`));
 assert.ok(source.includes(`${ld}(src0[0])`));assert.ok(source.includes(`${st}(v)`));
}
assert.throws(()=>toCuda(kernel('typo')),/unsupported/);
assert.ok(toCuda(kernel('f32')).includes('float* __restrict__ dst'));
console.log('CUDA typed storage emission passed');
