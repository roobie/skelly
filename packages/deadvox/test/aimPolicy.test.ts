import { claimed } from '@skelly/engine/inventory';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

it('keeps aim feel policy keys disjoint from shared input and view control keys', () => {
  const registry = baseRegistry();
  const controls = claimed(registry.player, 'player')!.aim;
  const policy = claimed(registry.combatPolicy, 'player')!;
  expect(policy).toHaveProperty('aim');
  if (!('aim' in policy && policy.aim) || typeof policy.aim !== 'object') {
    throw new Error('Missing aim policy');
  }
  expect(Object.keys(policy.aim).length).toBeGreaterThan(0);
  expect(Object.keys(controls).length).toBeGreaterThan(0);
  for (const field of Object.keys(policy.aim)) {
    expect(controls).not.toHaveProperty(field);
  }
});
