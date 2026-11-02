import assert from 'node:assert/strict';
import {Tensor} from '../src/core/util.js';
import {E,runSerial,schedule,compilePoint} from '../src/std/loop.js';
import * as IX from '../src/core/ix.js';

const input=new Tensor([1],Float32Array.of(100000000));
const load=E.load(0,[IX.C(0)]);
const cancellation=E.op('sub',E.op('add',load,E.num(1)),E.num(100000000));
assert.equal(runSerial(cancellation,[1],[input]).data[0],0,'FP32 addition rounds before subtraction');
assert.equal(compilePoint(schedule(cancellation,[1]),[[1]])([input.data],0),0,'sampled and full references agree');
assert.equal(E.op('sub',E.num(1.00000001),E.num(1)).v,0,'scalar literals round before constant folding');

// A separately reduced sum is rounded before use by its scalar parent.
// The following cancellation also checks every accumulator update.
const reduction=E.op('add',E.num(100000000),E.red('add','q',8,E.num(1)));
assert.equal(runSerial(reduction,[1],[]).data[0],100000008);
const terms=new Tensor([3],Float32Array.of(100000000,1,-100000000));
const sequential=E.red('add','r',3,E.load(0,[IX.V('r')]));
assert.equal(runSerial(sequential,[1],[terms]).data[0],0,'reduction accumulator has FP32 register precision');
assert.equal(compilePoint(schedule(sequential,[1]),[[3]])([terms.data],0),0);
console.log('loop scalar, literal and reduction reference precision is FP32');
