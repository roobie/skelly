import { actionText, fillText } from '@skelly/engine/input';
import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { countText, decimalText, hundredthsText, percentText, statText, volumeText } from '@skelly/engine/text';
import { fillHint } from '@skelly/presentation/internal/ui/keyCap.ts';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

/** A plain decimal with a short fraction: no exponent and no run of noise digits. */
const PLAIN_NUMBER = /^-?\d+(\.\d{1,5})?%?$/;

it('leaves no float-noise tail in any kind of number text', () => {
  // Values whose binary form carries a long decimal tail; each formatter must round it away.
  const noisy = [
    0.1 + 0.2,
    1.150_000_000_000_000_4,
    1 / 3,
    2 / 3,
    0.123_456_789,
    46.200_000_000_000_003,
    1e-7,
    1234.5678,
  ];
  const formatters = { countText, decimalText, hundredthsText, percentText, statText, volumeText };
  for (const [name, format] of Object.entries(formatters)) {
    for (const value of noisy) {
      expect(format(value), `${name}(${value})`).toMatch(PLAIN_NUMBER);
    }
  }
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
