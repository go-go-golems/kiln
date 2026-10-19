import { expect, it } from 'vitest';
import { tokenizeRich } from './tokenize';

it('splits display math, inline math, bold and code', () => {
  expect(tokenizeRich('a $x^2$ b $$\\sum_i x_i$$ **c** `d`')).toEqual([
    { type: 'text', text: 'a ' },
    { type: 'math', tex: 'x^2', display: false },
    { type: 'text', text: ' b ' },
    { type: 'math', tex: '\\sum_i x_i', display: true },
    { type: 'text', text: ' ' },
    { type: 'bold', text: 'c' },
    { type: 'text', text: ' ' },
    { type: 'code', text: 'd' },
  ]);
});

it('keeps prices, escaped and unclosed dollars as text', () => {
  expect(tokenizeRich('costs \\$5 and $ 6')).toEqual([{ type: 'text', text: 'costs $5 and $ 6' }]);
  expect(tokenizeRich('open $x')).toEqual([{ type: 'text', text: 'open $x' }]);
});
