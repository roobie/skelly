import { expect, it } from 'vitest';
import { fillParts } from '../src/engine/text.ts';

it('splits a template around every placeholder, repeated ones included, keeping the text between them', () => {
  const key = { cap: 'fixture key' };
  expect(fillParts('Press {key} to take {item}, then {key} again.', { key, item: 'fixture item' })).toEqual([
    'Press ',
    key,
    ' to take ',
    'fixture item',
    ', then ',
    key,
    ' again.',
  ]);
});
