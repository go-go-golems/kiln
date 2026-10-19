import { describe, expect, it } from 'vitest';
import { syntheticEnv } from '@/data/env';
import { build } from '@/lang/build';
import { PRESETS } from '@/presets';
import { parseReplies, repliesFor } from './runtime';

const irOf = (id: string) => {
  const source = PRESETS.find((p) => p.id === id)!.source;
  const seed = build({ source, labId: id, params: {}, env: syntheticEnv(new Set()), seedMode: true });
  return build({ source, labId: id, params: {}, env: syntheticEnv(new Set(seed.ir.plan.captures.map((c) => c.hash))) }).ir;
};

describe('assistant replies', () => {
  it('keys preset replies by board, not by a declared agent', () => {
    const parsed = parseReplies(PRESETS.find((p) => p.id === 'scenario-a')!.replies);
    expect([...parsed.keys()]).toEqual(['sampler']);
    expect(parsed.get('sampler')!.map((r) => r.prompt)).toContain('Try to zero a DRAM counter');
  });
  it('offers board replies only on their board and built-ins only where they apply', () => {
    const ir = irOf('scenario-a');
    const sampler = repliesFor('scenario-a', 'sampler', ir, false).map((r) => r.prompt);
    const memory = repliesFor('scenario-a', 'memory', ir, false).map((r) => r.prompt);
    expect(sampler).toContain('Show the slowest request');
    expect(memory).not.toContain('Show the slowest request');
    expect(memory).toContain('Which runs on this board are invalid, and why?');
    expect(memory).not.toContain('What would run if I executed the plan?');
    expect(repliesFor('scenario-a', 'memory', ir, true).map((r) => r.prompt)).toContain('What would run if I executed the plan?');
    const learn = irOf('learn');
    expect(repliesFor('learn', 'bilinear', learn, false).map((r) => r.prompt)).toEqual(["Explain this board's parameters"]);
  });
  it('the language no longer has agent declarations: .agent() is an unknown method', () => {
    const { ir } = build({ source: "return lab('x').agent('a', a => a)", labId: 'x', params: {}, env: syntheticEnv(new Set()) });
    expect(ir.lint.some((l) => l.code === 'unknown-method' && l.message.includes('.agent()'))).toBe(true);
  });
});
