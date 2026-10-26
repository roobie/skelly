import { expect, it } from 'vitest';
import { actionText, fillText } from '../src/core/actionText.ts';
import { coreMessage } from '../src/core/coreText.ts';
import { countText, decimalText, hundredthsText, percentText, statText, volumeText } from '../src/core/numberText.ts';
import { fillHint } from '../src/ui/keyCap.ts';
import { baseRegistry } from './baseRegistry.ts';

it('rounds every kind through the one precision table', () => {
  expect(countText(1.5)).toBe('2');
  expect(decimalText(1.150_000_000_000_000_4)).toBe('1.2');
  expect(hundredthsText(0.005)).toBe('0.01');
  expect(statText(0.46)).toBe('0.5');
  expect(statText(2)).toBe('2');
  expect(percentText(46.2)).toBe('46%');
  expect(volumeText(0.024)).toBe('0.024');
  expect(volumeText(500)).toBe('500');
  expect(volumeText(0.123_45)).toBe('0.123');
});

it('rejects a raw number at every guarded text-slot boundary, at compile time', () => {
  const registry = baseRegistry();
  const hint = () =>
    // @ts-expect-error a number is not a hint slot: it must pass numberText first
    fillHint('{value} units', { value: 1.15 });
  const labelled = () =>
    // @ts-expect-error a number is not an action-text slot: it must pass numberText first
    fillText(actionText(registry).hints.groundItem, { key: 1.15, item: 'fixture' });
  const notice = () =>
    // @ts-expect-error a number is not a core-message slot: it must pass numberText first
    coreMessage(registry, 'partCount', { count: 1.15, total: '2' });
  expect(hint()).toBeDefined();
  expect(labelled()).toBeDefined();
  expect(notice()).toBeDefined();
});
