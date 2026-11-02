import test from 'node:test';
import assert from 'node:assert/strict';
import { PiPolicyTools } from './pi_policy_tools.mjs';

test('multiple native submissions charge before execution, including invalid arguments', async () => {
  const calls = [];
  const tools = new PiPolicyTools(async (name, args) => {
    calls.push({ name, args });
    return { status: 'rejected', remaining: 2 - calls.length };
  });
  await tools.observe({ role: 'assistant', stopReason: 'toolUse', content: [
    { type: 'toolCall', name: 'submit_policy', id: 'a', arguments: null },
    { type: 'toolCall', name: 'submit_policy', id: 'b', arguments: { policy_json: '{}' } },
  ] });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].args, null);
  assert.equal((await tools.execute('submit_policy', 'b', {})).terminate, true);
  assert.equal(calls.length, 2);
  await assert.rejects(tools.execute('submit_policy', 'unknown', {}), /not accounted/);
});

test('truncated response consumes rejected attempt and repeated IDs fail closed', async () => {
  const calls = [];
  const tools = new PiPolicyTools(async (name, args) => {
    calls.push(args); return { status: 'rejected', remaining: 1 };
  });
  const message = { role: 'assistant', stopReason: 'length', content: [
    { type: 'toolCall', name: 'submit_policy', id: 'a', arguments: { policy_json: '{}' } },
  ] };
  await tools.observe(message);
  assert.deepEqual(calls, [null]);
  await assert.rejects(tools.observe(message), /repeated/);
  assert.equal(calls.length, 1);
  await assert.rejects(tools.execute('submit_policy', 'a', {}), /repeated/);
  assert.equal(tools.closed, true);
});
