import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const worker=fileURLToPath(new URL('./helpers/canonical-emission-worker.mjs',import.meta.url));
const compile=(burn,which,change='base')=>{
 const result=spawnSync(process.execPath,[worker,String(burn),which,change],{encoding:'utf8',maxBuffer:32<<20});
 assert.ifError(result.error);
 assert.equal(result.status,0,result.stderr);return JSON.parse(result.stdout);
};
for(const which of ['thread','row','staged','nested','tiled']){
 const first=compile(0,which),shifted=compile(97,which);
 assert.deepEqual(shifted.artifact,first.artifact,`${which}: exported artifacts must not depend on freshR history`);
 assert.deepEqual(shifted.kernelIR,first.kernelIR,`${which}: canonicalization belongs in Kernel IR`);
 assert.deepEqual(shifted.contents,first.contents,`${which}: CUDA/WGSL/simulator evidence content agrees`);
 const changed=compile(97,which,'add-one');
 assert.notDeepEqual(changed.artifact,first.artifact,`${which}: changed computation stays distinct`);
 assert.notDeepEqual(changed.contents,first.contents,`${which}: changed computation cannot alias evidence`);
}
console.log('fresh-process canonical artifacts/Kernel IR/evidence, all mappings and semantic separation passed');
