import { expect, it } from 'vitest';
import { texToSvg } from './tex';

it('renders the formulas the boards use to SVG without errors', async () => {
  const cases = [
    'v=(1-a)(1-b)\\,v_{00}+a(1-b)\\,v_{10}',
    'o_{qhc}=\\sum_{l=1}^{L}\\sum_{p=1}^{P} w_{qhlp}\\,v_{qhlpc}',
    'r=(m+\\epsilon)^{-1/2}',
    'x_0=\\lfloor x\\rfloor',
    'P\\leq\\min(P_{\\mathrm{compute}}, I\\,B)',
    '8 \\cdot 32 \\cdot 12240 \\cdot 16 = 50{,}135{,}040',
    'A\\in\\mathbb{R}^{M\\times K}',
    'm=\\frac{1}{C}\\sum_{i=1}^{C}x_i^2',
    'L=\\lambda W',
  ];
  for (const c of cases) {
    const svg = await texToSvg(c, true);
    expect(svg).toContain('<svg');
    expect(svg).not.toContain('merror');
  }
});

it('reports a TeX error inside the SVG instead of throwing (so the error check above is meaningful)', async () => {
  const svg = await texToSvg('\\frac{1}{', true);
  expect(svg).toContain('<svg');
  expect(svg).toContain('merror');
});

import { syntheticEnv } from '@/data/env';
import { tokenizeRich } from '@/components/molecules/RichText/tokenize';
import type { ViewB } from '@/lang/builders';
import { walkthrough, isAlgo } from '@/lang/algo';
import { build } from '@/lang/build';
import { PRESETS } from '@/presets';

it('every formula in the presets and walkthroughs renders without a MathJax error', async () => {
  const tex = new Set<string>();
  const fromText = (t: unknown) => {
    if (typeof t !== 'string') return;
    for (const tok of tokenizeRich(t)) if (tok.type === 'math') tex.add(tok.tex);
  };
  for (const p of PRESETS) {
    const { registry } = build({ source: p.source, labId: p.id, params: {}, env: syntheticEnv(new Set()), seedMode: true });
    const walk = (v: ViewB) => {
      if (v.kind === 'math') tex.add(String(v.args[0]));
      if (v.kind === 'note' || v.kind === 'text') fromText(v.args[0]);
      if (v.kind === 'math') fromText((v.args[1] as { caption?: string } | undefined)?.caption);
      if (v.kind === 'stepper' && isAlgo(v.args[0])) {
        const w = walkthrough(v.args[0].kind, {}, 'unfused');
        tex.add(w.formula);
        for (const g of w.groups) for (const c of g.cells) (fromText(c.label), fromText(c.sub));
        for (const s of w.steps) fromText(s.detail);
      }
      v.children.forEach(walk);
      Object.values(v.slots).forEach(walk);
    };
    for (const b of registry.lab.boards) {
      fromText(b.titleText);
      fromText(b.subtitleText);
      b.views.forEach(walk);
    }
  }
  expect(tex.size).toBeGreaterThan(20);
  for (const t of tex) {
    const svg = await texToSvg(t, true);
    expect(svg, t).not.toContain('merror');
  }
});
