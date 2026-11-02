// Read-only process capability diagnostic; an error is never a passing test.
import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['--eval','process.stdout.write("child-executed")'],{encoding:'utf8'});
process.stdout.write(JSON.stringify({node:process.version,status:result.status,signal:result.signal,
 error:result.error?{code:result.error.code,message:result.error.message}:null,stdout:result.stdout,stderr:result.stderr},null,2)+'\n');
