import { expect, it } from 'vitest';
import { playerAimTuning } from '../src/core/aim.ts';
import { claimed } from '../src/core/capabilities.ts';
import { baseRegistry } from './baseRegistry.ts';

it('keeps aim feel policy separate from shared input and view controls', () => {
  const registry = baseRegistry();
  const controls = claimed(registry.player, 'player')!.aim;
  const policy = claimed(registry.combatPolicy, 'player')!;
  expect(policy).toHaveProperty('aim');
  if (!('aim' in policy && policy.aim) || typeof policy.aim !== 'object') {
    throw new Error('Missing aim policy');
  }
  expect(Object.keys(policy.aim).length).toBeGreaterThan(0);
  for (const field of Object.keys(policy.aim)) {
    expect(controls).not.toHaveProperty(field);
  }
  const tuning = playerAimTuning(registry);
  expect(tuning).toMatchObject(policy.aim);
  expect(tuning).toMatchObject(controls);
  expect(controls).toHaveProperty('lookSensitivityRadiansPerPixel');
  expect(controls).toHaveProperty('freeLook');
});
