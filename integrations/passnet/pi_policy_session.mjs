import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { PiPolicyTools } from './pi_policy_tools.mjs';
import { createRequestGate } from './pi_request_gate.mjs';

/** Construct an isolated Pi session. The caller owns RPC, trace storage and timeout. */
export async function createPolicySession(config, call, record) {
  const sdk = await import(pathToFileURL(`${config.piPackage}/dist/index.js`).href);
  const require = createRequire(`${config.piPackage}/package.json`);
  const { Type } = await import(pathToFileURL(require.resolve('typebox')).href);
  const boundary = new PiPolicyTools(call);
  const names = ['inspect_training', 'submit_policy', 'finish'];
  const settingsManager = sdk.SettingsManager.inMemory({
    compaction: { enabled: false }, retry: { enabled: false, maxRetries: 0 },
  });
  const resourceLoader = new sdk.DefaultResourceLoader({
    cwd: config.cwd, agentDir: config.agentDir, settingsManager,
    noExtensions: true, additionalExtensionPaths: [config.extension],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPrompt: config.systemPrompt, appendSystemPromptOverride: () => [],
    extensionFactories: [pi => {
      pi.on('message_end', async event => {
        record('message_end', event);
        await boundary.observe(event.message);
      });
      pi.on('before_provider_request', event => {
        record('provider_request', event.payload);
      });
    }],
  });
  await resourceLoader.reload();
  const { session } = await sdk.createAgentSession({
    cwd: config.cwd, agentDir: config.agentDir, resourceLoader, settingsManager,
    thinkingLevel: config.thinkingLevel ?? 'off', tools: names,
    customTools: names.map(name => ({ name, label: name,
      description: ({ inspect_training: 'Inspect training-only compiler decision features.',
        submit_policy: 'Submit a policy JSON string for validation. Each submission consumes one slot.',
        finish: 'Finish the policy search.' })[name],
      parameters: name === 'submit_policy' ? Type.Object({ policy_json: Type.String() }) : Type.Object({}),
      execute: (id, args) => boundary.execute(name, id, args),
    })),
    sessionManager: sdk.SessionManager.create(config.cwd, config.sessionDir),
  });
  try {
    const model = session.modelRuntime.getModel(config.provider, config.model);
    if (!model) throw new Error('Requested model is unavailable');
    await session.setModel(model);
    const active = session.getActiveToolNames().sort();
    if (JSON.stringify(active) !== JSON.stringify([...names].sort())) throw new Error('Unexpected active tools');
    const gate = createRequestGate(session.agent.streamFunction, {
      ...config, stopped: () => boundary.closed || Boolean(boundary.failure),
      record: value => record('request_admission', value),
    });
    session.agent.streamFunction = gate.invoke;
    session.subscribe(event => record('session_event', event));
    record('session_ready', { provider: model.provider, model: model.id, api: model.api, requestedThinkingLevel: config.thinkingLevel ?? 'off', effectiveThinkingLevel: session.thinkingLevel, tools: active });
    return { session, boundary, gate };
  } catch (error) {
    session.dispose();
    throw error;
  }
}
