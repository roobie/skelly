import { expect, it } from 'vitest';
import { actionText, fillParts } from '../src/core/actionText.ts';
import { baseRegistry } from './baseRegistry.ts';

it('splits a hint around every placeholder, repeated ones included, keeping the text between them', () => {
  const template = actionText(baseRegistry()).hints.groundItem;
  const key = { cap: 'fixture key' };
  const parts = fillParts(template, { key, item: 'fixture item' });
  expect(parts.filter((part) => part === key)).toHaveLength(template.split('{key}').length - 1);
  expect(parts.map((part) => (part === key ? '{key}' : part)).join('')).toBe(
    template.replace('{item}', 'fixture item'),
  );
});
