"""CPU PyTorch oracle against Kiln reference/decomposition and CUDA emission."""
import json
from pathlib import Path
import subprocess
import unittest
import torch
from fx_scalar_ops import lower_scalar

ROOT = Path(__file__).resolve().parents[2]
NODE = '/home/manuel/.nvm/versions/node/v26.13.0/bin/node'


class ScalarTests(unittest.TestCase):
    def lower(self, target, args, kwargs=None, dtype='torch.float32', kind='call_function'):
        meta = {'shape': [9], 'dtype': dtype}
        return lower_scalar(target, kind, args, kwargs or {}, meta, lambda _: meta, json.loads)

    def test_binding_and_rejections(self):
        self.assertTrue(self.lower('clamp_', ['x', '-1', '1'], kind='call_method')[2])
        self.assertFalse(self.lower('torch.nn.functional.hardtanh', ['x'])[2])
        self.assertTrue(self.lower('torch.nn.functional.hardtanh', ['x', '-1', '1', 'true'])[2])
        for target,args,kw in [
            ('torch.clamp',['x'],{}), ('torch.pow',['x','y'],{}),
            ('torch.pow',['x','true'],{}), ('torch.pow',['x','0.5'],{}), ('torch.cos',['x'],{'out':'x'}),
            ('torch.nn.functional.hardtanh',['x','2','1'],{}),
            ('torch.nn.functional.hardtanh',['x'],{'inplace':'1'}),
            ('torch.clamp',['x','0'],{'min':'1'}),
        ]:
            with self.assertRaises(ValueError): self.lower(target,args,kw)

    def test_cpu_oracle_and_compile(self):
        values = [-float('inf'), -2, -.3334, -0., 0., .3334, 2, float('inf'), float('nan')]
        cases=[]
        for dtype,name in [(torch.float32,'f32'),(torch.float16,'f16'),(torch.bfloat16,'bf16')]:
            x=torch.tensor(values,dtype=dtype)
            operations=[('torch.nn.functional.hardtanh',[],lambda x:torch.nn.functional.hardtanh(x)),
                        ('torch.clamp',['-0.3333','0.3333'],lambda x:torch.clamp(x,-.3333,.3333)),
                        ('torch.clamp',['1','-1'],lambda x:torch.clamp(x,1,-1)),
                        ('torch.clamp',['null','0'],lambda x:torch.clamp(x,max=0)),
                        ('torch.cos',[],torch.cos),('torch.sin',[],torch.sin)]
            operations += [('torch.pow',[str(e)],lambda x,e=e:x.pow(e)) for e in [0,1,2,3,-1,-2]]
            for target,args,fn in operations:
                expr,_,_=self.lower(target,['x',*args],dtype=str(dtype))
                def encode(xs):return [str(v) if not torch.isfinite(torch.tensor(v)) else '-0' if v==0 and torch.signbit(torch.tensor(v)) else v for v in xs]
                cases.append({'expr':expr,'dtype':name,'input':encode(x.float().tolist()),'expected':encode(fn(x).float().tolist())})
        code=r'''
import assert from 'node:assert/strict';
import {k} from './packages/kiln/src/core/kiln.js';
import {Tensor} from './packages/kiln/src/core/util.js';
import {N,decomposition} from './packages/kiln/src/std/tensor.js';
import {pipeline} from './packages/kiln/src/std/emmy.js';
import {target,SPECS} from './packages/kiln/src/std/targets.js';
const cases=JSON.parse(process.argv[1]);
const decode=x=>x==='nan'?NaN:x==='inf'?Infinity:x==='-inf'?-Infinity:Number(x);
const decomp=k.pipeline('scalar').pass(decomposition).build();
for(const c of cases){
 const graph=k.trace('scalar',({x})=>new Function('N','x','return '+c.expr)(N,x),{x:k.tensor([9],c.dtype)});
 const r=decomp.run(graph);assert.ok(r.ok,r.error?.message);
 for(const g of [graph,r.graph]){
  const got=g.eval({x:new Tensor([9],Float32Array.from(c.input.map(decode)))}).out.data;
  c.expected.map(decode).forEach((want,i)=>{
   const actual=got[i];
   if(!Number.isFinite(want)||want===0)assert.ok(Object.is(actual,want),`${c.expr}: ${i}: ${actual} != ${want}`);
   else assert.ok(Math.abs(actual-want)<=Math.abs(want)*(c.dtype==='bf16'?.008:c.dtype==='f16'?.001:2e-6)+1e-7,`${c.expr}: ${i}: ${actual} != ${want}`);
  });
 }
 const compiled=pipeline({target:target(SPECS.rtx5090)}).run(graph);
 assert.ok(compiled.ok,compiled.error?.message);
}
console.log(`${cases.length} scalar cases: PyTorch CPU/reference/decomposition/CUDA emission pass`);
'''
        result=subprocess.run([NODE,'--input-type=module','-e',code,json.dumps(cases)],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(result.returncode,0,result.stderr)
        print(result.stdout.strip())

if __name__=='__main__':unittest.main()
