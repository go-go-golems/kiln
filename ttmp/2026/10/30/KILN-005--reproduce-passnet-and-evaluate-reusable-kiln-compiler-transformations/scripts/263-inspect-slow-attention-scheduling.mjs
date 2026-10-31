// Inspect the actual compiler analysis for the slowest accepted attention variant.
// Run from the PassNet worktree root; no GPU execution or compiler mutation.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const output=process.argv[2];
if(!output || !/^[a-z0-9-]+\.json$/.test(output))throw new Error('Pass a new evidence JSON basename');
const root=process.cwd(),mod=relative=>import(pathToFileURL(resolve(root,relative)).href);
const [{compileScript},{params},{SPECS,target},{analyze,legalMaps},{free}]=await Promise.all([
 mod('apps/workbench/src/compile.js'),mod('packages/kiln/src/core/kiln.js'),
 mod('packages/kiln/src/std/targets.js'),mod('packages/kiln/src/std/tile.js'),mod('packages/kiln/src/std/loop.js')]);
const ticket='ttmp/2026/10/30/KILN-005--reproduce-passnet-and-evaluate-reusable-kiln-compiler-transformations';
const source=resolve(root,ticket,'sources'),read=name=>JSON.parse(readFileSync(resolve(source,name),'utf8'));
const timing=read('softmax-cohort-v2-latencies.json').slowest_e2e_ratio_records[0];
const directory=resolve(source,'softmax-cohort-v2',`task-${String(timing.task_index).padStart(3,'0')}`,'corpus');
const record=JSON.parse(readFileSync(resolve(directory,'manifest.json'),'utf8')).variants.find(row=>row.graph===timing.graph);
const compiled=compileScript(readFileSync(resolve(directory,record.script),'utf8'),{params:params([]),target:target(SPECS.a100),contraction:'separate'});
if(!compiled.ok)throw new Error(JSON.stringify(compiled.diags));
const kernels=compiled.run.at('loop').findAll('loop.kernel').map(node=>{
 const an=analyze(node.attrs.expr,node.attrs.shape,node.args.map(arg=>arg.type.shape));
 return {name:node.attrs.name,shape:node.attrs.shape,dimensions:an.dims.map(d=>({variable:d.v,extent:d.n})),rowDepth:an.rd,rows:an.rows,inner:an.inner,legalMappings:legalMaps(an),contraction:an.contraction?{M:an.contraction.M,N:an.contraction.N,K:an.contraction.K}:null,
  reductions:an.sched.reds.map(r=>({variable:r.r,extent:r.n,placementDepth:an.sched.placed.get(r).depth,nested:!!an.sched.placed.get(r).red})),
  loads:an.sched.loads.map(l=>({input:l.i,shape:node.args[l.i].type.shape,free:[...free(l)],placementDepth:an.sched.placed.get(l).depth,nested:!!an.sched.placed.get(l).red}))};
});
const receipt={format:'kiln-attention-scheduling-inspection/1',scope:'Actual static scheduling analysis; no causal latency or optimization claim',graph:timing.graph,eager_ms:timing.eager_e2e_ms,compiled_ms:timing.compiled_e2e_ms,selectedMappings:compiled.prog.kernels.map(kernel=>kernel.map),kernels};
writeFileSync(resolve(source,output),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
process.stdout.write(JSON.stringify(receipt,null,2)+'\n');
