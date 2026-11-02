import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestGate } from './pi_request_gate.mjs';

test('hard gate bounds requests and reservations before provider dispatch', () => {
  const calls = [], records = [];
  let closed = false;
  const gate = createRequestGate((model, context, options) => { calls.push(options); return 'stream'; }, {
    provider: 'lunaroute', model: 'glm-5.3-flash', maxRequests: 3,
    maxCompletionTokens: 10, completionBudget: 15,
    stopped: () => closed, record: row => records.push(row),
  });
  const model = { provider: 'lunaroute', id: 'glm-5.3-flash' };
  assert.throws(() => gate.invoke({ ...model, id: 'other' }, {}), /Unexpected model/);
  gate.invoke(model, {}, { maxRetries: 9, maxTokens: 999 });
  gate.invoke(model, {});
  assert.deepEqual(calls.map(x => [x.maxTokens, x.maxRetries]), [[10, 0], [5, 0]]);
  assert.throws(() => gate.invoke(model, {}), /budget exhausted/);
  assert.equal(calls.length, 2);
  assert.equal(records.length, 2);
  closed = true;
  assert.throws(() => gate.invoke(model, {}), /closed/);
});

test('failed dispatch does not restore reserved allowance', () => {
  const gate = createRequestGate(() => { throw new Error('provider failed'); }, {
    provider: 'p', model: 'm', maxRequests: 1, maxCompletionTokens: 10,
    completionBudget: 10, stopped: () => false, record: () => {},
  });
  const model = { provider: 'p', id: 'm' };
  assert.throws(() => gate.invoke(model, {}), /provider failed/);
  assert.throws(() => gate.invoke(model, {}), /budget exhausted/);
  assert.deepEqual(gate.snapshot(), { requests: 1, reservedCompletionTokens: 10 });
});
