/** Hard admission boundary installed on session.agent.streamFunction.
 * Reserve completion allowance before dispatch, never refund failed requests.
 * This conservative budget does not depend on extension-hook exceptions.
 */
export function createRequestGate(stream, { provider, model, maxRequests,
  maxCompletionTokens, completionBudget, stopped, record }) {
  for (const value of [maxRequests, maxCompletionTokens, completionBudget]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid request budget');
  }
  let requests = 0;
  let reserved = 0;
  const invoke = (selected, context, options = {}) => {
    if (stopped()) throw new Error('Policy run is closed');
    if (selected.provider !== provider || selected.id !== model) throw new Error('Unexpected model');
    if (requests >= maxRequests || reserved >= completionBudget) throw new Error('Inference budget exhausted');
    const allowance = Math.min(maxCompletionTokens, completionBudget - reserved);
    requests += 1;
    reserved += allowance;
    record({ request: requests, provider, model, completionAllowance: allowance,
      reservedCompletionTokens: reserved });
    return stream(selected, context, { ...options, maxTokens: allowance, maxRetries: 0 });
  };
  return { invoke, snapshot: () => ({ requests, reservedCompletionTokens: reserved }) };
}
