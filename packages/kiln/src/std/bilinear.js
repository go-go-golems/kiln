// Independent NCHW bilinear resize, align_corners=false, explicit output size.
import {Tensor} from '../core/util.js';
export function bilinearSpec(shape,size){
 if(shape.length!==4||!shape.every(d=>Number.isInteger(d)&&d>0)||!Array.isArray(size)||size.length!==2||!size.every(d=>Number.isInteger(d)&&d>0))throw new TypeError('bilinear resize requires positive NCHW shape and output size pair');
 return [shape[0],shape[1],...size];
}
function coordinate(index,input,output){return Math.max((index+0.5)*input/output-0.5,0);}
export function bilinearReference(x,size){
 const shape=bilinearSpec(x.shape,size),[n,c,h,w]=x.shape,[oh,ow]=size,out=new Tensor(shape);
 for(let b=0;b<n;b++)for(let ch=0;ch<c;ch++)for(let y=0;y<oh;y++)for(let z=0;z<ow;z++){
  const sy=coordinate(y,h,oh),sx=coordinate(z,w,ow),y0=Math.floor(sy),x0=Math.floor(sx),y1=Math.min(y0+1,h-1),x1=Math.min(x0+1,w-1),wy=sy-y0,wx=sx-x0;
  const at=(a,d)=>x.data[((b*c+ch)*h+a)*w+d];
  out.data[((b*c+ch)*oh+y)*ow+z]=(1-wy)*((1-wx)*at(y0,x0)+wx*at(y0,x1))+wy*((1-wx)*at(y1,x0)+wx*at(y1,x1));
 }
 return out;
}
export function lowerBilinear(T,x,size){
 const shape=bilinearSpec(x.type.shape,size),[,,h,w]=x.type.shape,[oh,ow]=size;
 const wy=new Tensor([1,1,oh,ow]),wx=new Tensor([1,1,oh,ow]);
 for(let y=0;y<oh;y++)for(let z=0;z<ow;z++){
  const sy=coordinate(y,h,oh),sx=coordinate(z,w,ow);
  wy.data[y*ow+z]=sy-Math.floor(sy);wx.data[y*ow+z]=sx-Math.floor(sx);
 }
 const read=(dy,dx)=>T.view(x,shape,a=>{
  const y0=a[2].mul(2).add(1).mul(h).sub(oh).max(0).div(2*oh);
  const x0=a[3].mul(2).add(1).mul(w).sub(ow).max(0).div(2*ow);
  return [a[0],a[1],y0.add(dy).min(h-1),x0.add(dx).min(w-1)];
 });
 const top=T.add(T.mul(T.sub(1,wx),read(0,0)),T.mul(wx,read(0,1)));
 const bottom=T.add(T.mul(T.sub(1,wx),read(1,0)),T.mul(wx,read(1,1)));
 return T.add(T.mul(T.sub(1,wy),top),T.mul(wy,bottom));
}
