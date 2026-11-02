import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const ticket=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=resolve(ticket,'../../../../..');
const {toF16Bits,toBf16Bits}=await import(resolve(repo,'packages/kiln/src/core/dtypes.js'));
const source=JSON.parse(readFileSync(resolve(ticket,'sources/rounding-vectors.json'),'utf8'));
const view=new DataView(new ArrayBuffer(4));
let checked=0;
for(const v of source.vectors){
 view.setUint32(0,v.f32,false); const x=view.getFloat32(0,false);
 for(const [dtype,convert,mask] of [['f16',toF16Bits,0x3ff],['bf16',toBf16Bits,0x7f]]){
  const actual=convert(x), expected=v[dtype];
  // NaN payload/sign canonicalization is not numerically observable here.
  if(Number.isNaN(x)){if(!(actual&mask)) throw Error(`${dtype}: NaN lost payload`);}
  else if(actual!==expected) throw Error(`${dtype} source=${v.f32.toString(16)} expected=${expected.toString(16)} actual=${actual.toString(16)}`);
  checked++;
 }
}
const receipt={torch_version:source.torch_version,vectors:source.vectors.length,conversions_checked:checked,status:'passed',nan_policy:'payload/sign not compared; nonzero payload required'};
writeFileSync(resolve(ticket,'sources/rounding-check.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(receipt);
