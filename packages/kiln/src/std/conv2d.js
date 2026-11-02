// Independent NCHW/OIHW cross-correlation reference. No PyTorch source copied.
import {Tensor} from '../core/util.js';
import {lowerMatmul} from './matmul.js';
function pair(value,name){
 const v=Number.isInteger(value)?[value,value]:value;
 if(!Array.isArray(v)||v.length!==2||!v.every(Number.isInteger))throw new TypeError(`${name} must be an integer pair`);
 return v;
}
export function conv2dSpec(input,weight,{stride=1,padding=0,dilation=1,groups=1}={}){
 if(input.length!==4||weight.length!==4||![...input,...weight].every(d=>Number.isInteger(d)&&d>0))throw new TypeError('conv2d requires positive rank-four NCHW/OIHW shapes');
 const [n,c,h,w]=input,[out,perGroup,kh,kw]=weight;
 const st=pair(stride,'stride'),pad=pair(padding,'padding'),dil=pair(dilation,'dilation');
 if(!st.every(v=>v>0)||!pad.every(v=>v>=0)||!dil.every(v=>v>0)||!Number.isInteger(groups)||groups<=0)throw new TypeError('invalid conv2d stride/padding/dilation/groups');
 if(c%groups||out%groups||perGroup!==c/groups)throw new TypeError('conv2d channel/group mismatch');
 const oh=Math.floor((h+2*pad[0]-dil[0]*(kh-1)-1)/st[0])+1;
 const ow=Math.floor((w+2*pad[1]-dil[1]*(kw-1)-1)/st[1])+1;
 if(oh<=0||ow<=0)throw new TypeError('conv2d output spatial dimensions must be positive');
 return {shape:[n,out,oh,ow],stride:st,padding:pad,dilation:dil,groups};
}
export function conv2dReference(input,weight,bias=null,options={}){
 const spec=conv2dSpec(input.shape,weight.shape,options);
 const [n,c,h,w]=input.shape,[oc,ic,kh,kw]=weight.shape,[,,oh,ow]=spec.shape;
 if(bias&&(bias.shape.length!==1||bias.shape[0]!==oc))throw new TypeError('conv2d bias must match output channels');
 const out=new Tensor(spec.shape),ocGroup=oc/spec.groups;
 for(let b=0;b<n;b++)for(let o=0;o<oc;o++)for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
  let sum=bias?bias.data[o]:0;
  const group=Math.floor(o/ocGroup);
  for(let i=0;i<ic;i++)for(let ky=0;ky<kh;ky++)for(let kx=0;kx<kw;kx++){
   const iy=y*spec.stride[0]-spec.padding[0]+ky*spec.dilation[0];
   const ix=x*spec.stride[1]-spec.padding[1]+kx*spec.dilation[1];
   if(iy<0||iy>=h||ix<0||ix>=w)continue;
   sum+=input.data[((b*c+group*ic+i)*h+iy)*w+ix]*weight.data[((o*ic+i)*kh+ky)*kw+kx];
  }
  out.data[((b*oc+o)*oh+y)*ow+x]=sum;
 }
 return out;
}

// Correctness-first decomposition. Static spatial mask avoids unsafe OOB reads;
// it is an explicit constant operand, not a hidden host-side kernel implementation.
export function lowerConv2d(T, x, w, b, options) {
 const spec=conv2dSpec(x.type.shape,w.type.shape,options);
 const [n,c,h,width]=x.type.shape,[oc,ic,kh,kw]=w.type.shape,[,,oh,ow]=spec.shape;
 const [ph,pw]=spec.padding,hp=h+2*ph,wp=width+2*pw;
 let padded=x;
 if(ph||pw){
  const mask=new Tensor([1,1,hp,wp]);
  for(let y=ph;y<ph+h;y++)for(let z=pw;z<pw+width;z++)mask.data[y*wp+z]=1;
  const safe=T.view(x,[n,c,hp,wp],a=>[a[0],a[1],a[2].sub(ph).max(0).min(h-1),a[3].sub(pw).max(0).min(width-1)]);
  padded=T.select(mask,safe,0);
 }
 const shape=[n,oc,oh,ow,ic,kh,kw],ocGroup=oc/spec.groups;
 const input=T.view(padded,shape,a=>[a[0],a[1].div(ocGroup).mul(ic).add(a[4]),a[2].mul(spec.stride[0]).add(a[5].mul(spec.dilation[0])),a[3].mul(spec.stride[1]).add(a[6].mul(spec.dilation[1]))]);
 const weight=T.view(w,shape,a=>[a[1],a[4],a[5],a[6]]);
 let result=T.mul(input,weight);
 for(const axis of [6,5,4])result=T.sum(result,axis);
 result=T.reshape(result,spec.shape);
 return T.add(result,T.reshape(b,[1,oc,1,1]));
}

// Optional decomposition for pointwise convolutions. Keep the channel reduction
// as the matrix K dimension; flatten spatial coordinates into its N dimension.
// Non-pointwise and padded cases retain the existing convolution decomposition.
export function lowerPointwiseConv2d(T, x, w, b, options) {
 const spec=conv2dSpec(x.type.shape,w.type.shape,options);
 if(w.type.shape[2]!==1 || w.type.shape[3]!==1 || spec.padding.some(p=>p!==0))
  return lowerConv2d(T,x,w,b,options);
 const [n,c]=x.type.shape,[oc,ic]=w.type.shape,[,,oh,ow]=spec.shape,g=spec.groups;
 const matrixInput=T.view(x,[n,g,ic,oh*ow],a=>[
  a[0],a[1].mul(ic).add(a[2]),a[3].div(ow).mul(spec.stride[0]),a[3].mod(ow).mul(spec.stride[1])]);
 const matrixWeight=T.reshape(w,[g,oc/g,ic]);
 const product=lowerMatmul(T,matrixWeight,matrixInput);
 const biased=T.add(product,T.reshape(b,[1,g,oc/g,1]));
 return T.reshape(biased,spec.shape);
}
