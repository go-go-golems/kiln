// Independent static concatenation: reference semantics and safe indexed lowering.
import {Tensor, numel} from '../core/util.js';

export function concatSpec(shapes, axis = 0) {
  if (!Array.isArray(shapes) || !shapes.length) throw new TypeError('concat requires at least one tensor');
  const rank = shapes[0].length;
  if (!rank || !Number.isInteger(axis) || axis < -rank || axis >= rank) throw new TypeError('concat axis out of range');
  const dim = axis < 0 ? rank + axis : axis;
  if (shapes.some(s => s.length !== rank || s.some(d => !Number.isInteger(d) || d <= 0))) throw new TypeError('concat requires positive shapes with equal rank');
  if (shapes.some(s => s.some((d,i) => i !== dim && d !== shapes[0][i]))) throw new TypeError('concat non-axis dimensions must match');
  const shape = shapes[0].slice();
  shape[dim] = shapes.reduce((n,s) => n+s[dim],0);
  return {shape,axis:dim};
}

export function concatReference(xs, axis = 0) {
  const spec = concatSpec(xs.map(x => x.shape), axis);
  const output = new Tensor(spec.shape, null, xs[0].dtype);
  const inner = numel(spec.shape.slice(spec.axis+1));
  const outer = numel(spec.shape.slice(0,spec.axis));
  for (let row=0;row<outer;row++) {
    let offset = row*spec.shape[spec.axis]*inner;
    for (const x of xs) {
      const count = x.shape[spec.axis]*inner;
      output.data.set(x.data.subarray(row*count,(row+1)*count),offset);
      offset += count;
    }
  }
  return output;
}

export function lowerConcat(T, tensor, xs, axis, dtype, IX) {
  const {shape,axis:dim} = concatSpec(xs.map(x => x.type.shape),axis);
  let offset=0, result=null;
  for (const x of xs) {
    const start=offset, width=x.type.shape[dim];
    // Eager branch evaluation may load every input. Clamp even the unselected
    // reads to valid addresses; masking alone does not establish memory safety.
    const read=T.view(x,shape,c => c.map((v,i) => i===dim ? v.sub(start).max(0).min(width-1) : v));
    if (result===null) result=read;
    else {
      // the selected range as a bool index value: start <= c[dim] < start + width
      const condition=tensor.ixval({shape,map:IX.map(shape.length,c => [c[dim].ge(start).and(c[dim].lt(start+width))]),dtype:'bool'});
      result=tensor.ew([condition,read,result],{fn:'select',dtype});
    }
    offset+=width;
  }
  return result;
}
