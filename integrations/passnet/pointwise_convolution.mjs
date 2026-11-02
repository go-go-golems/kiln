// Opt-in compiler experiment; reuse standard legality, matmul and bias semantics.
import {decompose} from '../../packages/kiln/src/std/tensor.js';
import {lowerPointwiseConv2d} from '../../packages/kiln/src/std/conv2d.js';
export function applyPointwiseConvolution(pipeline) {
  return pipeline.replaceRule('frontend/decomposition','decompose:nn.conv2d',
    decompose('nn.conv2d',({T,x,w,b,stride,padding,dilation,groups}) =>
      lowerPointwiseConv2d(T,x,w,b,{stride,padding,dilation,groups})));
}
