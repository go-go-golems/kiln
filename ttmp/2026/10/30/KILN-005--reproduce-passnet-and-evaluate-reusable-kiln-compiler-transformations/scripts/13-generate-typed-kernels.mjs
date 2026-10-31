// Standalone emitter integration fixtures, not full compiler exports.
import {toCuda} from '../../../../../..//packages/kiln/src/std/emit.js';
import {writeFileSync} from 'node:fs';
const base=new URL('../sources/',import.meta.url);
for(const dtype of ['f16','bf16']){
 const idx={t:'v',v:'tid'};
 const K={name:'typed_copy',block:32,params:[{role:'in',dtype},{role:'out',dtype}],smem:[],floats:['v'],ints:[],body:[{s:'load',n:'v',buf:0,idx},{s:'store',buf:'out',idx,e:{k:'var',n:'v'}}]};
 writeFileSync(new URL(`typed-copy-${dtype}.cu`,base),toCuda(K));
}
