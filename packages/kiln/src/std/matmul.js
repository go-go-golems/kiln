// Independent static matrix semantics, including vectors and batch broadcasting.
import {Tensor,numel,strides} from '../core/util.js';
import * as IX from '../core/ix.js';
const positive=s=>Array.isArray(s)&&s.length>0&&s.every(d=>Number.isSafeInteger(d)&&d>0);
export function matmulSpec(a,b){
 if(!positive(a)||!positive(b))throw new TypeError('matmul requires positive nonscalar shapes');
 const av=a.length===1,bv=b.length===1,aa=av?[1,a[0]]:a,bb=bv?[b[0],1]:b;
 const M=aa.at(-2),K=aa.at(-1),N=bb.at(-1);
 if(K!==bb.at(-2))throw new TypeError('matmul contraction dimensions differ');
 const ab=aa.slice(0,-2),batchB=bb.slice(0,-2),rank=Math.max(ab.length,batchB.length),batch=[];
 for(let i=0;i<rank;i++){
  const x=ab[i-rank+ab.length]??1,y=batchB[i-rank+batchB.length]??1;
  if(x!==y&&x!==1&&y!==1)throw new TypeError('matmul batch dimensions cannot broadcast');
  batch.push(Math.max(x,y));
 }
 return {shape:[...batch,...av?[]:[M],...bv?[]:[N]],batch,M,K,N,av,bv,ab,bb:batchB};
}
export function linearSpec(x,w){
 if(!positive(x)||!positive(w)||w.length>2)throw new TypeError('linear requires positive input and vector/matrix weight');
 if(x.at(-1)!==w.at(-1))throw new TypeError('linear contraction dimensions differ');
 return {shape:[...x.slice(0,-1),...w.length===1?[]:[w[0]]],K:x.at(-1),N:w.length===1?1:w[0],vectorWeight:w.length===1};
}
function batchOffset(coords,batch,matrixSize){
 const ss=strides(batch);let offset=0,shift=coords.length-batch.length;
 for(let i=0;i<batch.length;i++)if(batch[i]!==1)offset+=coords[shift+i]*ss[i];
 return offset*matrixSize;
}
export function matmulReference(a,b){
 const s=matmulSpec(a.shape,b.shape),out=new Tensor(s.shape),bs=strides(s.batch);
 for(let z=0;z<numel(s.batch);z++){
  const coords=s.batch.map((d,i)=>Math.floor(z/bs[i])%d);
  const ao=batchOffset(coords,s.ab,s.M*s.K),bo=batchOffset(coords,s.bb,s.K*s.N);
  for(let m=0;m<s.M;m++)for(let n=0;n<s.N;n++){
   let sum=0;for(let q=0;q<s.K;q++)sum+=a.data[ao+m*s.K+q]*b.data[bo+q*s.N+n];
   out.data[(z*s.M+m)*s.N+n]=sum;
  }
 }
 return out;
}
export function linearReference(x,w){
 const s=linearSpec(x.shape,w.shape),out=new Tensor(s.shape);
 for(let r=0;r<x.data.length/s.K;r++)for(let n=0;n<s.N;n++){
  let sum=0;for(let q=0;q<s.K;q++)sum+=x.data[r*s.K+q]*w.data[n*s.K+q];
  out.data[r*s.N+n]=sum;
 }
 return out;
}
const batchMap=(coords,shape,rank)=>shape.map((d,i)=>d===1?IX.C(0):coords[rank-shape.length+i]);
export function lowerMatmul(T,a,b){
 const s=matmulSpec(a.type.shape,b.type.shape),rank=s.batch.length,work=[...s.batch,s.M,s.K,s.N];
 const left=T.view(a,work,c=>s.av?[c[rank+1]]:[...batchMap(c,s.ab,rank),c[rank],c[rank+1]]);
 const right=T.view(b,work,c=>s.bv?[c[rank+1]]:[...batchMap(c,s.bb,rank),c[rank+1],c[rank+2]]);
 const reduced=T.sum(T.mul(left,right),-2);
 return T.view(reduced,s.shape,c=>[...c.slice(0,rank),s.av?IX.C(0):c[rank],IX.C(0),s.bv?IX.C(0):c[rank+(s.av?0:1)]]);
}
export function lowerLinear(T,x,w){
 const s=linearSpec(x.type.shape,w.type.shape),prefix=x.type.shape.slice(0,-1),rank=prefix.length,work=[...prefix,s.K,s.N];
 const left=T.view(x,work,c=>[...c.slice(0,rank),c[rank]]);
 const right=T.view(w,work,c=>s.vectorWeight?[c[rank]]:[c[rank+1],c[rank]]);
 const reduced=T.sum(T.mul(left,right),-2);
 return T.view(reduced,s.shape,c=>[...c.slice(0,rank),IX.C(0),s.vectorWeight?IX.C(0):c[rank]]);
}
