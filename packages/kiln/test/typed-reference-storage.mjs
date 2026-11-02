import assert from 'node:assert/strict';
import {Tensor,compare} from '../src/core/util.js';
import {k} from '../src/core/kiln.js';
import {Project} from '../src/std/index.js';
import {tensor,viewRef} from '../src/std/tensor.js';
import * as IX from '../src/core/ix.js';

const exact=new Tensor([2,2],BigInt64Array.of(9007199254740993n,-7n,4n,3n));
assert.equal(exact.dtype,'i64');
assert.deepEqual(exact.preview(2),['9007199254740993','-7']);
assert.equal(compare(exact,new Tensor([2,2],exact.data.slice())).ok,true);
assert.equal(compare(exact,new Tensor([2,2],BigInt64Array.of(9007199254740992n,-7n,4n,3n))).bad,1);
const transposed=viewRef(exact,[2,2],IX.map(2,c=>[c[1],c[0]]));
assert.equal(transposed.dtype,'i64');
assert.deepEqual(transposed.data,BigInt64Array.of(9007199254740993n,4n,-7n,3n));
const constGraph=new Project('typed-constant').program(()=>({out:tensor.const({data:exact,shape:exact.shape})}),{}).graph();
assert.equal(constGraph.nodes.get(constGraph.outputs[0].id).type.dtype,'i64');

const project=new Project('typed-reference').program(({ids})=>({out:ids}),{ids:k.tensor([2,2],'i64')});
project.data({ids:exact});
const generated=project.inputsFor(project.graph()).ids;
assert.notEqual(generated.data,exact.data);
assert.deepEqual(generated.data,exact.data);
generated.data[0]=0n;
assert.equal(exact.data[0],9007199254740993n);
assert.throws(()=>project.data({ids:new Tensor([2,2],Float32Array.of(1,2,3,4))}).inputsFor(project.graph()),/exact i64/);

const mask=Tensor.fill([3],1,'bool');
assert.deepEqual(mask.data,Uint8Array.of(1,1,1));
assert.equal(new Tensor([1],Int32Array.of(-3)).dtype,'i32');
console.log('exact typed reference storage and views passed');
