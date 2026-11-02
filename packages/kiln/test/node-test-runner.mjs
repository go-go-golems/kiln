// Fault injection: a child-spawn error must never look like a passing test.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const runner=fileURLToPath(new URL('../../../scripts/run-node-tests.mjs',import.meta.url));
const directory=mkdtempSync('/tmp/kiln-test-runner-');
const invoke=args=>{
 const result=spawnSync(process.execPath,args,{encoding:'utf8',maxBuffer:1<<20});
 assert.ifError(result.error);return result;
};
try{
 writeFileSync(directory+'/good.mjs','process.stdout.write("actually executed");\n');
 writeFileSync(directory+'/bad.mjs','process.exitCode=1;\n');
 const real=invoke([runner,directory]);
 assert.equal(real.status,1);assert.match(real.stdout,/1 of 2 FAILED/);
 const passing=invoke([runner,directory,'--skip','bad.mjs','--verbose']);
 assert.equal(passing.status,0);assert.match(passing.stdout,/actually executed/);
 const fault=`import cp from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {pathToFileURL} from 'node:url';
cp.spawnSync=()=>({status:0,signal:null,stdout:'',stderr:'',error:new Error('spawn refused (fixture)')});
syncBuiltinESMExports();
process.argv=['node',${JSON.stringify(runner)},${JSON.stringify(directory)}];
await import(pathToFileURL(${JSON.stringify(runner)}));`;
 const refused=invoke(['--input-type=module','--eval',fault]);
 assert.equal(refused.status,1);assert.match(refused.stdout,/2 of 2 FAILED/);assert.match(refused.stderr,/spawn refused/);
}finally{rmSync(directory,{recursive:true,force:true});}
console.log('test runner distinguishes executed success, assertion failure and child-spawn failure');
