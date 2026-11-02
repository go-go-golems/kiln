/** Trusted accounting boundary for Pi native assistant tool calls.
 * Charge submissions at message_end, before Pi validates tool arguments.
 * The owner supplies serialized RPC and installs observe as an awaited hook.
 */
export class PiPolicyTools {
  constructor(call) {
    this.call = call;
    this.results = new Map();
    this.closed = false;
    this.failure = null;
  }

  async observe(message) {
    if (this.failure) throw this.failure;
    try {
      await this.observeAssistant(message);
    } catch (error) {
      this.failure = error;
      this.closed = true;
      throw error;
    }
  }

  async observeAssistant(message) {
    if (message.role !== 'assistant') return;
    const complete = ['stop', 'toolUse'].includes(message.stopReason);
    for (const part of message.content ?? []) {
      if (part.type !== 'toolCall' || part.name !== 'submit_policy') continue;
      if (typeof part.id !== 'string' || !part.id || this.results.has(part.id)) {
        throw new Error('Missing or repeated submission tool call ID');
      }
      // Preserve rejected/truncated attempts without admitting their policies.
      const result = await this.call('submit_policy', complete ? part.arguments : null);
      this.results.set(part.id, result);
      if (result.remaining === 0 || ['closed', 'budget_exhausted'].includes(result.status)) {
        this.closed = true;
      }
    }
  }

  async execute(name, id, args) {
    if (this.failure) throw this.failure;
    let result;
    if (name === 'submit_policy') {
      if (!this.results.has(id)) throw new Error('Submission was not accounted before execution');
      result = this.results.get(id);
    } else if (name === 'inspect_training' || name === 'finish') {
      result = await this.call(name, args);
      if (name === 'finish') this.closed = true;
    } else {
      throw new Error('Unknown policy tool');
    }
    return { content: [{ type: 'text', text: JSON.stringify(result) }],
      details: result, ...(this.closed ? { terminate: true } : {}) };
  }
}
