// Independent static average-pooling semantics; see KILN-005 pooling sources.
import { Tensor } from '../core/util.js';
function pair(value, name) {
  const result = Number.isInteger(value) ? [value, value] : Array.isArray(value) && value.length === 1 ? [value[0], value[0]] : value;
  if (!Array.isArray(result) || result.length !== 2 || !result.every(Number.isSafeInteger)) throw new TypeError(`${name} requires an integer or pair`);
  return result;
}
export function avgPool2dSpec(shape, { kernel_size, stride = null, padding = 0, ceil_mode = false, count_include_pad = true, divisor_override = null } = {}) {
  if (![3, 4].includes(shape.length) || !shape.every(x => Number.isSafeInteger(x) && x > 0)) throw new TypeError('avgPool2d requires positive CHW or NCHW dimensions');
  const kernel = pair(kernel_size, 'kernel_size'), step = pair(stride ?? kernel, 'stride'), pad = pair(padding, 'padding');
  if (!kernel.every(x => x > 0) || !step.every(x => x > 0) || !pad.every((x,i) => x >= 0 && x <= Math.floor(kernel[i]/2))) throw new TypeError('Invalid pooling kernel, stride or padding');
  if (typeof ceil_mode !== 'boolean' || typeof count_include_pad !== 'boolean') throw new TypeError('Pooling flags must be boolean');
  if (divisor_override !== null && (!Number.isSafeInteger(divisor_override) || divisor_override === 0)) throw new TypeError('Pooling divisor must be a nonzero integer');
  const spatial = shape.slice(-2);
  const output = spatial.map((size, i) => {
    let out = Math.floor((size + 2*pad[i] - kernel[i] + (ceil_mode ? step[i]-1 : 0))/step[i]) + 1;
    if (ceil_mode && (out-1)*step[i] >= size+pad[i]) out--;
    if (out <= 0) throw new TypeError('Pooling output must be positive');
    return out;
  });
  return { shape: [...shape.slice(0,-2), ...output], kernel, stride: step, padding: pad, count_include_pad, divisor_override };
}
function window(size, output, kernel, stride, pad) {
  const start = output*stride-pad, end = Math.min(start+kernel, size+pad);
  return {start: Math.max(start,0), end: Math.min(end,size), padded: end-start};
}
export function avgPool2dReference(input, options) {
  const spec = avgPool2dSpec(input.shape, options), [h,w] = input.shape.slice(-2), [oh,ow] = spec.shape.slice(-2);
  const output = new Tensor(spec.shape), planes = input.data.length/(h*w);
  for (let p=0;p<planes;p++) for (let y=0;y<oh;y++) for (let x=0;x<ow;x++) {
    const a=window(h,y,spec.kernel[0],spec.stride[0],spec.padding[0]);
    const b=window(w,x,spec.kernel[1],spec.stride[1],spec.padding[1]);
    let sum=0;
    for(let iy=a.start;iy<a.end;iy++) for(let ix=b.start;ix<b.end;ix++) sum=Math.fround(sum+input.data[(p*h+iy)*w+ix]);
    const divisor=spec.divisor_override ?? (spec.count_include_pad ? a.padded*b.padded : (a.end-a.start)*(b.end-b.start));
    output.data[(p*oh+y)*ow+x]=sum/divisor;
  }
  return output;
}
export function lowerAvgPool2d(T, input, options) {
  const spec=avgPool2dSpec(input.type.shape,options);
  const batched=input.type.shape.length===4, [n,c,h,w]=batched?input.type.shape:[1,...input.type.shape];
  const [oh,ow]=spec.shape.slice(-2),[kh,kw]=spec.kernel,[sh,sw]=spec.stride,[ph,pw]=spec.padding;
  const x=batched?input:T.reshape(input,[n,c,h,w]);
  // Clamp every load before masking; ceil-mode trailing cells are zero but are
  // excluded from the divisor unless they belong to explicit source padding.
  const hp=Math.max(h+2*ph,(oh-1)*sh+kh),wp=Math.max(w+2*pw,(ow-1)*sw+kw);
  let padded=x;
  if(hp!==h||wp!==w||ph||pw){
    const mask=new Tensor([1,1,hp,wp]);
    for(let y=0;y<h;y++)for(let z=0;z<w;z++)mask.data[(y+ph)*wp+z+pw]=1;
    const safe=T.view(x,[n,c,hp,wp],a=>[a[0],a[1],a[2].sub(ph).max(0).min(h-1),a[3].sub(pw).max(0).min(w-1)]);
    padded=T.select(mask,safe,0);
  }
  const windows=T.view(padded,[n,c,oh,ow,kh,kw],a=>[a[0],a[1],a[2].mul(sh).add(a[4]),a[3].mul(sw).add(a[5])]);
  const sums=T.reshape(T.sum(T.sum(windows,5),4),[n,c,oh,ow]);
  const divisors=new Tensor([1,1,oh,ow]);
  for(let y=0;y<oh;y++)for(let z=0;z<ow;z++){
    const a=window(h,y,kh,sh,ph),b=window(w,z,kw,sw,pw);
    divisors.data[y*ow+z]=spec.divisor_override ?? (spec.count_include_pad?a.padded*b.padded:(a.end-a.start)*(b.end-b.start));
  }
  return T.reshape(T.div(sums,divisors),spec.shape);
}

// Adaptive bins may overlap and have different widths. Their integer bounds are
// defined independently for each output position; no interpolation is involved.
export function adaptiveAvgPool2dSpec(shape, output_size) {
  if (![3,4].includes(shape.length) || !shape.every(x=>Number.isSafeInteger(x)&&x>0)) throw new TypeError('adaptiveAvgPool2d requires positive CHW or NCHW dimensions');
  const requested=Number.isSafeInteger(output_size)?[output_size,output_size]:output_size;
  if(!Array.isArray(requested)||requested.length!==2)throw new TypeError('adaptiveAvgPool2d requires an integer or pair');
  const spatial=shape.slice(-2),output=requested.map((v,i)=>v===null?spatial[i]:v);
  if(!output.every(v=>Number.isSafeInteger(v)&&v>0))throw new TypeError('adaptiveAvgPool2d requires positive output dimensions');
  const bins=spatial.map((size,axis)=>Array.from({length:output[axis]},(_,i)=>({start:Math.floor(i*size/output[axis]),end:Math.ceil((i+1)*size/output[axis])})));
  return {shape:[...shape.slice(0,-2),...output],bins};
}
export function adaptiveAvgPool2dReference(input, output_size) {
  const spec=adaptiveAvgPool2dSpec(input.shape,output_size),[h,w]=input.shape.slice(-2),[oh,ow]=spec.shape.slice(-2);
  const result=new Tensor(spec.shape),planes=input.data.length/(h*w);
  for(let p=0;p<planes;p++)for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
    const a=spec.bins[0][y],b=spec.bins[1][x];let sum=0;
    for(let iy=a.start;iy<a.end;iy++)for(let ix=b.start;ix<b.end;ix++)sum=Math.fround(sum+input.data[(p*h+iy)*w+ix]);
    result.data[(p*oh+y)*ow+x]=Math.fround(sum/(a.end-a.start))/(b.end-b.start);
  }
  return result;
}
export function lowerAdaptiveAvgPool2d(T,input,output_size) {
  const spec=adaptiveAvgPool2dSpec(input.type.shape,output_size);
  const [n,c,h,w]=input.type.shape.length===4?input.type.shape:[1,...input.type.shape], [oh,ow]=spec.shape.slice(-2);
  const kh=spec.bins[0].reduce((m,b)=>Math.max(m,b.end-b.start),0),kw=spec.bins[1].reduce((m,b)=>Math.max(m,b.end-b.start),0);
  const x=T.reshape(input,[n,c,h,w]);
  let windows=T.view(x,[n,c,oh,ow,kh,kw],a=>[a[0],a[1],a[2].mul(h).div(oh).add(a[4]).min(h-1),a[3].mul(w).div(ow).add(a[5]).min(w-1)]);
  const heights=new Tensor([1,1,oh,ow]),widths=new Tensor([1,1,oh,ow]);
  const varying=spec.bins[0].some(b=>b.end-b.start!==kh)||spec.bins[1].some(b=>b.end-b.start!==kw);
  const mask=varying?new Tensor([1,1,oh,ow,kh,kw]):null;
  for(let y=0;y<oh;y++)for(let z=0;z<ow;z++){
    const height=spec.bins[0][y].end-spec.bins[0][y].start,width=spec.bins[1][z].end-spec.bins[1][z].start;
    heights.data[y*ow+z]=height;widths.data[y*ow+z]=width;
    if(mask)for(let iy=0;iy<height;iy++)for(let ix=0;ix<width;ix++)mask.data[((y*ow+z)*kh+iy)*kw+ix]=1;
  }
  if(mask)windows=T.select(mask,windows,0);
  const flat=T.reshape(windows,[n,c,oh,ow,kh*kw]);
  const sums=T.reshape(T.sum(flat,4),[n,c,oh,ow]);
  return T.reshape(T.div(T.div(sums,heights),widths),spec.shape);
}

// PyTorch v2.9.1 Pool.h / DilatedMaxPool2d.cu define the shape and NaN rules.
export function maxPool2dSpec(shape, {kernel_size, stride=null, padding=0, dilation=1, ceil_mode=false, return_indices=false}={}) {
  if (![3,4].includes(shape.length)||!shape.every(x=>Number.isSafeInteger(x)&&x>0)) throw new TypeError('maxPool2d requires positive CHW or NCHW dimensions');
  const kernel=pair(kernel_size,'kernel_size'),step=pair(stride===null||(Array.isArray(stride)&&stride.length===0)?kernel:stride,'stride'),pad=pair(padding,'padding'),dilate=pair(dilation,'dilation');
  if(!kernel.every(x=>x>0)||!step.every(x=>x>0)||!dilate.every(x=>x>0)||!pad.every((x,i)=>x>=0&&x<=Math.floor(kernel[i]/2)))throw new TypeError('Invalid max pooling kernel, stride, padding or dilation');
  if(typeof ceil_mode!=='boolean'||return_indices!==false)throw new TypeError('maxPool2d requires boolean ceil_mode and return_indices=false');
  const output=shape.slice(-2).map((size,i)=>{
    let out=Math.floor((size+2*pad[i]-dilate[i]*(kernel[i]-1)-1+(ceil_mode?step[i]-1:0))/step[i])+1;
    if(ceil_mode&&(out-1)*step[i]>=size+pad[i])out--;
    if(out<=0)throw new TypeError('Max pooling output must be positive');
    return out;
  });
  return {shape:[...shape.slice(0,-2),...output],kernel,stride:step,padding:pad,dilation:dilate};
}
export function maxPool2dReference(input,options) {
  const spec=maxPool2dSpec(input.shape,options),[h,w]=input.shape.slice(-2),[oh,ow]=spec.shape.slice(-2),output=new Tensor(spec.shape);
  for(let p=0;p<input.data.length/(h*w);p++)for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){
    let maximum=-Infinity;
    for(let ky=0;ky<spec.kernel[0];ky++)for(let kx=0;kx<spec.kernel[1];kx++){
      const iy=y*spec.stride[0]-spec.padding[0]+ky*spec.dilation[0],ix=x*spec.stride[1]-spec.padding[1]+kx*spec.dilation[1];
      if(iy>=0&&iy<h&&ix>=0&&ix<w){const value=input.data[(p*h+iy)*w+ix];if(value>maximum||Number.isNaN(value))maximum=value;}
    }
    output.data[(p*oh+y)*ow+x]=maximum;
  }
  return output;
}
export function lowerMaxPool2d(T,input,options) {
  const spec=maxPool2dSpec(input.type.shape,options),[n,c,h,w]=input.type.shape.length===4?input.type.shape:[1,...input.type.shape];
  const [oh,ow]=spec.shape.slice(-2),[kh,kw]=spec.kernel,[sh,sw]=spec.stride,[ph,pw]=spec.padding,[dh,dw]=spec.dilation;
  const x=T.reshape(input,[n,c,h,w]),hp=Math.max(h+2*ph,(oh-1)*sh+(kh-1)*dh+1),wp=Math.max(w+2*pw,(ow-1)*sw+(kw-1)*dw+1);
  let padded=x;
  if(hp!==h||wp!==w||ph||pw){
    const mask=new Tensor([1,1,hp,wp]);
    for(let y=0;y<h;y++)for(let z=0;z<w;z++)mask.data[(y+ph)*wp+z+pw]=1;
    const safe=T.view(x,[n,c,hp,wp],a=>[a[0],a[1],a[2].sub(ph).max(0).min(h-1),a[3].sub(pw).max(0).min(w-1)]);
    padded=T.select(mask,safe,-Infinity);
  }
  const windows=T.view(padded,[n,c,oh,ow,kh,kw],a=>[a[0],a[1],a[2].mul(sh).add(a[4].mul(dh)),a[3].mul(sw).add(a[5].mul(dw))]);
  const flat=T.reshape(windows,[n,c,oh,ow,kh*kw]);
  // fmaxf suppresses NaNs. Keep a separate flag reduction; every ordered value,
  // including both infinities, satisfies x > 0 or x < 1. Padding never flags.
  const nan=T.select(T.gt(flat,0),0,T.select(T.lt(flat,1),0,1));
  return T.reshape(T.select(T.max(nan,4),NaN,T.max(flat,4)),spec.shape);
}
