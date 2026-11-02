import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPolicySession } from '../../../../../../integrations/passnet/pi_policy_session.mjs';
const output = resolve(process.argv[2]);
mkdirSync(output, { recursive: false });
const records = [];
try {
  const { session } = await createPolicySession({
    piPackage: '/home/manuel/.nvm/versions/node/v24.18.0/lib/node_modules/@earendil-works/pi-coding-agent',
    extension: '/home/manuel/.pi/agent/npm/node_modules/@lunaroute/pi-extension/src/index.ts',
    agentDir: '/home/manuel/.pi/agent', cwd: process.cwd(), sessionDir: `${output}/sessions`,
    provider: 'lunaroute', model: 'glm-5.3-flash', maxRequests: 2,
    maxCompletionTokens: 1024, completionBudget: 2048,
    systemPrompt: 'Generate reusable Kiln policies using only the provided tools.',
  }, async () => { throw new Error('No tool calls permitted during setup check'); },
  (kind, value) => records.push({ kind, value }));
  session.dispose();
  writeFileSync(`${output}/result.json`, JSON.stringify({ status: 'setup_only_passed', records }, null, 2));
} catch (error) {
  writeFileSync(`${output}/result.json`, JSON.stringify({ status: 'failed', error: String(error), records }, null, 2));
  throw error;
}
