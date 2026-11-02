// Diagnostic counterfactuals only: no evaluator definitions or tolerances change.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const ticket=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(ticket,'../../../../..');
const {compileScript}=await import(resolve(root,'apps/workbench/src/compile.js'));
const {params}=await import(resolve(root,'packages/kiln/src/core/kiln.js'));
const {target,SPECS}=await import(resolve(root,'packages/kiln/src/std/targets.js'));
const source=resolve(ticket,'sources/singleton-view-source-cohort-v1/task-010/corpus/001.kiln.js');
const compiled=compileScript(readFileSync(source,'utf8'),{params:params([]),target:target(SPECS.a100),contraction:'separate'});
assert.ok(compiled.ok,JSON.stringify(compiled.diags));
const inputs=compiled.project.inputsFor(compiled.graph);
const loop=compiled.run.at('loop').eval(inputs).out0;
function compare(a,b){
 let different=0,failed=0,maxAbs=0;
 for(let i=0;i<a.data.length;i++){
  const error=Math.abs(a.data[i]-b.data[i]);
  assert.ok(Number.isFinite(error));
  if(error)different++;
  if(error>1e-4+1e-3*Math.abs(b.data[i]))failed++;
  maxAbs=Math.max(maxAbs,error);
 }
 return {different,failed,max_abs:maxAbs};
}
const records=[];
for(const mode of ['unchanged','frontend-conv-fp32','tensor-softmax-sum-fp32','tensor-all-sums-fp32']){
 const graph=mode.startsWith('tensor-')?compiled.run.at('tensor'):compiled.graph;
 const values=new Map(),changes=[];
 const actual=graph.eval(inputs,{values,onNode(node,value){
  const before=value.data.slice();
  if(mode.includes('conv')&&node.name==='nn.conv2d'){
   const [x,w,b]=node.args.map(id=>values.get(id));
   // Deliberately restricted to this retained failing 1x1, one-channel graph.
   assert.deepEqual(w.shape,[1,608,1,1]);
   assert.deepEqual(x.shape,[128,608,8,6]);
   for(let batch=0;batch<128;batch++)for(let spatial=0;spatial<48;spatial++){
    let sum=0;
    for(let channel=0;channel<608;channel++){
     const product=Math.fround(x.data[(batch*608+channel)*48+spatial]*w.data[channel]);
     sum=Math.fround(sum+product);
    }
    value.data[batch*48+spatial]=Math.fround(sum+b.data[0]);
   }
  }
  // Tensor decomposition has no nn.conv2d node: substitute its add reductions.
  if(mode.includes('sum')&&node.name==='tensor.reduce'&&node.attrs.fn==='add'&&(mode==='tensor-all-sums-fp32'||values.get(node.args[0]).shape.at(-1)===48)){
   const x=values.get(node.args[0]),axis=node.attrs.axis;
   const inner=x.shape.slice(axis+1).reduce((a,b)=>a*b,1),extent=x.shape[axis];
   for(let index=0;index<value.data.length;index++){
    const outer=Math.floor(index/inner),within=index%inner;
    let acc=0;
    for(let j=0;j<extent;j++)acc=Math.fround(acc+x.data[(outer*extent+j)*inner+within]);
    value.data[index]=acc;
   }
  }
  const delta=compare(value,{data:before});
  if(delta.different)changes.push({node:node.id,operation:node.name,shape:value.shape,...delta});
 }}).out0;
 records.push({mode,graph:graph===compiled.graph?'frontend':'tensor',against_loop:compare(actual,loop),changes});
}
// A bounded witness separates high-precision and FP32 accumulation before cast.
const vals=new Map();compiled.graph.eval(inputs,{values:vals});
const conv=[...compiled.graph.nodes.values()].find(n=>n.name==='nn.conv2d');
const x=vals.get(conv.args[0]),w=vals.get(conv.args[1]);
const witnesses=[];
for(const index of [1685,1696]){
 const batch=Math.floor(index/48),spatial=index%48;
 let fp64=0,fp32=0;
 for(let c=0;c<608;c++){
  const product=x.data[(batch*608+c)*48+spatial]*w.data[c];
  fp64+=product;fp32=Math.fround(fp32+Math.fround(product));
 }
 witnesses.push({index,fp64,fp64_stored_f32:Math.fround(fp64),fp32});
}
const result={format:'kiln-accumulation-counterfactual/1',source,configuration:{target:'a100',contraction:'separate',rtol:1e-3,atol:1e-4},records,witnesses,
 limitation:'Diagnostic substitutions only. Not a compiler repair or GPU/PassBench acceptance.'};
writeFileSync(resolve(ticket,'sources/singleton-accumulation-counterfactual-v1.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
