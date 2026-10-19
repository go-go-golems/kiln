import { REFERENCE } from '../../src/components/organisms/IdePane/reference';

/** The board in view, summarized by the browser for the model (never the whole IR). */
export type BoardContext = Record<string, unknown>;

const RULES = `You are the assistant built into Perf Lab, a workbench for performance experiments written as lab.js programs.
You work on the board the person is looking at. You answer by writing JavaScript that runs in the workbench against a handle API, then you read its result.

How to reply:
- Write a short sentence about what you will check, then exactly one fenced \`\`\`js block, and stop. The block is the body of an async function; \`return\` its result and use log(...) for intermediate lines.
- Never write a result or an observation yourself: the workbench runs the block and sends you its result as the next message. Anything you write after the block is discarded.
- After the code runs you receive its result as an observation. Then either answer in plain prose (no code block) or write one more \`\`\`js block if you need more evidence. You get at most four code executions per question.
- Earlier turns may be stale: runs are imported and parameters change between questions. Before relying on an earlier result, check the current state with code; the board JSON below is current.
- When you answer, state what is observed, what is derived, and what is missing or unknown. Never present a missing value as zero. Name runs by their reference (experiment/arm/mode#rep).
- Keep answers short and specific: numbers with units, run references, and the evidence class.
- Format: plain sentences and short lines. **bold** and \`code\` render; $…$ renders as math. Do not use tables, headings or lists of more than five lines.

Rules the workbench enforces (your code is rolled back if it breaks one):
- Observed values are read-only. Assigning to an imported entity throws ProvenanceError.
- lab.start(experimentId, { reason, modes }) only proposes a job. A person must approve it; you cannot. Only the hosts the lab declares are allowed, within a budget of 30 minutes of host time.
- Parameters: self.params.<name> = value changes a board parameter; plan-bound parameters create a pending plan instead of running anything.
- Do not use fetch, timers, DOM APIs or imports; only the names below exist.`;

function reference(): string {
  return REFERENCE.map((g) => `${g.title}\n${g.lines.map((l) => `  ${l}`).join('\n')}`).join('\n\n');
}

export function systemPrompt(context: BoardContext, opts: { final?: boolean } = {}): string {
  return `${RULES}${opts.final ? '\n\nYou have used all code executions for this question: answer now in prose, without a code block.' : ''}

Handle API and lab.js vocabulary:
${reference()}

The board in view (JSON, current state):
${JSON.stringify(context, null, 1).slice(0, 12_000)}`;
}

/** The observation fed back to the model after its code ran in the browser. */
export function observationText(r: { status: string; value?: string; error?: string; logs?: string[]; ms?: number }, opts: { last?: boolean } = {}): string {
  const parts = [`Result of your code: ${r.status === 'ok' ? 'OK' : 'ROLLED BACK'}${r.ms !== undefined ? ` in ${r.ms} ms` : ''}.`];
  if (r.logs?.length) parts.push(`log:\n${r.logs.join('\n')}`);
  parts.push(r.status === 'ok' ? `return value:\n${r.value ?? 'undefined'}` : `error:\n${r.error ?? 'unknown error'}`);
  const body = parts.join('\n\n');
  const text = body.length > 6000 ? `${body.slice(0, 6000)}\n… (truncated: the result was ${body.length} characters)` : body;
  return opts.last ? `${text}\n\nThat was your last code execution for this question. Answer now in prose, without a code block; say what remains unknown.` : text;
}

/**
 * Splits a reply into the prose before its first code block and that block. Whatever follows the block was
 * written without the block's result (models invent observations there), so it is dropped.
 */
export function splitReply(reply: string): { text: string; code: string | null } {
  // models sometimes open the fence mid-line (`… see. ```js const x = …`), so the newline is optional
  const m = /```(?:javascript|js|typescript|ts)?[ \t]*\n?([\s\S]*?)```/.exec(reply);
  // invented observations are not the workbench's; they never reach the transcript
  const prose = (s: string) => s.replace(/<observation>[\s\S]*?<\/observation>/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (!m) return { text: prose(reply), code: null };
  return { text: prose(reply.slice(0, m.index)), code: m[1].trimEnd() };
}
