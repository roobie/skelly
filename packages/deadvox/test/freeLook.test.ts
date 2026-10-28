import { expect, it } from 'vitest';
import { freeLookAllowsCommand, freeLookAllowsUse } from '../src/game/freeLook.ts';

it('refuses look-targeted actions during free look without refusing movement or firearm use', () => {
  for (const action of ['world.interact', 'player.throw', 'firearm.reload', 'quickbar.use.1']) {
    expect(freeLookAllowsCommand(true, action)).toBe(false);
    expect(freeLookAllowsCommand(false, action)).toBe(true);
  }
  for (const action of ['movement.forward', 'stance.ready', 'aim.ads-toggle', 'handling.stop']) {
    expect(freeLookAllowsCommand(true, action)).toBe(true);
  }
  for (const kind of ['melee', 'fists', 'open-can', 'use', 'magazine']) {
    expect(freeLookAllowsUse(true, kind)).toBe(false);
    expect(freeLookAllowsUse(false, kind)).toBe(true);
  }
  expect(freeLookAllowsUse(true, 'firearm')).toBe(true);
});
