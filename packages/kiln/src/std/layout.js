// Independent static layout semantics. All indexed reads are in bounds.
import {Tensor,numel} from '../core/util.js';
export function padSpec(shape,pad,mode='constant',value=0){
 if(!shape.every(n=>Number.isSafeInteger(n)&&n>0)||!Array.isArray(pad)||pad.length%2||pad.length>2*shape.length||!pad.every(Number.isSafeInteger))throw new TypeError('pad requires static integer pairs and positive dimensions');
 if(!['constant','reflect','replicate','circular'].includes(mode))throw new TypeError('unsupported padding mode');
 if(typeof value!=='number'||!Number.isFinite(value))throw new TypeError('pad value must be finite');
 const count=pad.length/2;
 if(mode!=='constant'&&(![1,2,3].includes(count)||![count+1,count+2].includes(shape.length)||value!==0))throw new TypeError('nonconstant pad requires supported spatial rank and zero value');
 const axes=Array.from({length:count},(_,i)=>({axis:shape.length-1-i,left:pad[2*i],right:pad[2*i+1]}));
 const output=shape.slice();
 for(const {axis,left,right} of axes){
  const n=shape[axis];output[axis]=n+left+right;
  if(output[axis]<=0)throw new TypeError('pad output must be positive');
  if(mode==='reflect'&&(left>=n||right>=n))throw new TypeError('reflection padding must be smaller than input');
  if(mode==='constant'&&n+Math.min(0,left)+Math.min(0,right)<0)throw new TypeError('constant pad crop exceeds input');
  if(mode==='circular'&&(left>n+Math.min(0,right)||right>n+Math.min(0,left)||n+Math.min(0,left)+Math.min(0,right)<=0))throw new TypeError('circular padding exceeds supported wrap or crop');
 }
 return {shape:output,axes,mode,value};
}
function coordinate(q,n,left,right,mode){
 if(mode==='replicate'||mode==='constant')return Math.max(0,Math.min(n-1,q-left));
 if(mode==='reflect'){const a=Math.abs(q-left);return Math.min(a,2*n-2-a);}
 const start=Math.max(0,-left),size=n+Math.min(0,left)+Math.min(0,right);
 return start+((q-Math.max(0,left))%size+size)%size;
}
function reference(input,shape,map){
 const out=new Tensor(shape);
 for(let i=0;i<out.data.length;i++){
  let rest=i;const coords=shape.map(()=>0);
  for(let j=shape.length-1;j>=0;j--){coords[j]=rest%shape[j];rest=Math.floor(rest/shape[j]);}
  const result=map(coords);if(typeof result==='number'){out.data[i]=result;continue;}
  let offset=0;for(let j=0;j<result.length;j++)offset=offset*input.shape[j]+result[j];out.data[i]=input.data[offset];
 }return out;
}
export function padReference(input,pad,mode='constant',value=0){
 const spec=padSpec(input.shape,pad,mode,value);
 return reference(input,spec.shape,c=>{
  const out=c.slice();for(const {axis,left,right} of spec.axes){
   if(mode==='constant'&&(c[axis]-left<0||c[axis]-left>=input.shape[axis]))return value;
   out[axis]=coordinate(c[axis],input.shape[axis],left,right,mode);
  }return out;
 });
}
export function lowerPad(T,input,pad,mode='constant',value=0,tensor=null){
 const spec=padSpec(input.type.shape,pad,mode,value);let x=input;
 for(const {axis,left,right} of spec.axes){
  const n=x.type.shape[axis],shape=x.type.shape.slice();shape[axis]+=left+right;
  x=T.view(x,shape,c=>c.map((v,i)=>{
   if(i!==axis)return v;const q=v.sub(left);
   if(mode==='reflect'){const a=q.max(q.mul(-1));return a.min(a.mul(-1).add(2*n-2));}
   if(mode==='circular'){const size=n+Math.min(0,left)+Math.min(0,right);return v.sub(Math.max(0,left)).add(size).mod(size).add(Math.max(0,-left));}
   return q.max(0).min(n-1);
  }));
  if(mode==='constant'&&(left>0||right>0)){
   const mask=new Tensor(shape.map((d,i)=>i===axis?d:1));
   for(let i=0;i<shape[axis];i++)mask.data[i]=i-left>=0&&i-left<n?1:0;
   if(!tensor&&input.type.dtype!=='f32')throw new TypeError('typed padding requires tensor dialect');
   x=tensor?tensor.ew([mask,x,value].map(v=>T.bc(v,shape)),{fn:'select',dtype:input.type.dtype}):T.select(mask,x,value);
  }
 }return x;
}
export function rollSpec(shape,shifts,dims=null){
 if(!shape.every(n=>Number.isSafeInteger(n)&&n>0))throw new TypeError('roll requires positive dimensions');
 shifts=Number.isSafeInteger(shifts)?[shifts]:shifts;
 dims=Number.isSafeInteger(dims)?[dims]:dims;
 const flatten=dims===null||(Array.isArray(dims)&&dims.length===0),rank=flatten?1:shape.length;
 if(flatten)dims=[0];
 if(!Array.isArray(shifts)||!shifts.length||!shifts.every(Number.isSafeInteger)||!Array.isArray(dims)||dims.length!==shifts.length||!dims.every(d=>Number.isSafeInteger(d)&&d>=-rank&&d<rank))throw new TypeError('roll requires matching static shifts and dimensions');
 const sizes=flatten?[numel(shape)]:shape,offsets=Array(rank).fill(0);
 dims.forEach((d,i)=>{const a=(d+rank)%rank;offsets[a]=((offsets[a]+shifts[i])%sizes[a]+sizes[a])%sizes[a];});
 return {shape:shape.slice(),sizes,offsets,flatten};
}
export function rollReference(input,shifts,dims=null){
 const spec=rollSpec(input.shape,shifts,dims),x=spec.flatten?new Tensor(spec.sizes,input.data):input;
 const result=reference(x,spec.sizes,c=>c.map((v,i)=>(v-spec.offsets[i]+spec.sizes[i])%spec.sizes[i]));
 return new Tensor(input.shape,result.data);
}
export function lowerRoll(T,input,shifts,dims=null){
 const spec=rollSpec(input.type.shape,shifts,dims),x=spec.flatten?T.reshape(input,spec.sizes):input;
 return T.reshape(T.view(x,spec.sizes,c=>c.map((v,i)=>v.add(spec.sizes[i]-spec.offsets[i]).mod(spec.sizes[i]))),spec.shape);
}
