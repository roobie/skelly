import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { decodeSave, encodeSave, type SaveContentKind, type SaveVersionComponents } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { type FirearmShotEffect, firearmHandlingFor } from '../src/game/firearmHandling.ts';
import { PLAYER } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';

const base = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown })),
);
const version: SaveVersionComponents = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: 10,
  generators: { worldgen: 'worldgen-v1', shamblerFigure: 'shambler-figure-v1' },
  contentPacks: [{ id: 'deadvox.base', version: '1', canonicalHash: '0'.repeat(64) }],
};
const contentLookup = (kind: SaveContentKind, id: string): boolean => {
  switch (kind) {
    case 'block':
      return registry.blockIds.has(id);
    case 'item':
      return registry.items.has(id);
    case 'furniture':
      return registry.furniture.has(id);
    case 'zombie':
      return registry.zombies.has(id);
    case 'sound':
      return registry.sounds.has(id);
    case 'scheduler':
      return ['needs', 'player', 'zombies', 'handling', 'lights', 'firearms'].includes(id);
    default:
      throw new Error(`Unknown content kind ${kind}`);
  }
};
const session = (effects: FirearmShotEffect[], restore?: Readonly<SaveSnapshot>) =>
  createSession({
    registry,
    world: new World(),
    isSolid: (_x, y) => y < 0,
    isOpaque: () => false,
    scale: makeScale(0.5),
    seed: 71,
    start: 0,
    spawn: [0, 0, 0],
    ready: () => true,
    controls: {
      active: () => false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onFirearmEjection: (effect) => effects.push(effect),
    ...(restore ? { restore } : {}),
  });

it('a codec save before ejectAt restores one pending case and ejects it exactly once', async () => {
  const originalEffects: FirearmShotEffect[] = [];
  const original = session(originalEffects);
  const rifle = original.inventory.create('debug_rifle_assault');
  expect(original.inventory.add(rifle, { kind: 'hand', side: 'right' })).toBe(true);
  const pickerBefore = original.audioState();
  expect(
    original.firearms.fire({
      debugMode: true,
      item: rifle,
      seed: 71,
      simTime: 0,
      feet: [0, 0, 0],
      eye: [0, PLAYER.eye / 0.5, 0],
      yaw: 0,
      pitch: 0,
      blockSize: 0.5,
    }),
  ).toBe(true);
  original.frame(0.005);
  original.firearms.advanceTo(original.sim.time);
  const saved = original.snapshot({ worldId: 'world', characterId: 'character' });
  const bytes = await encodeSave(saved, {
    generation: 1,
    version,
    worldOptions: { blockSize: 0.5, site: 'testHouse', storeys: 1, density: 0.75 },
  });
  const decoded = await decodeSave(bytes, { version, contentLookup });
  const restoredEffects: FirearmShotEffect[] = [];
  const restored = session(restoredEffects, decoded.snapshot);
  const cases = (runtime: ReturnType<typeof session>) =>
    [...runtime.inventory.items()]
      .filter((item) => item.type === 'spent_case_5_d_56x45')
      .map(({ uid, count }) => ({ uid, count }));
  const { action } = firearmHandlingFor(rifle, registry);
  if (!action.fire) {
    throw new Error('AR save fixture needs exported automatic action data');
  }
  const ejectTime = action.fire.rearwardSeconds * action.ejectAt;
  expect(cases(restored)).toEqual([]);
  restored.firearms.advanceTo(ejectTime - 1e-6);
  expect(cases(restored)).toEqual([]);
  restored.firearms.advanceTo(ejectTime);
  expect(cases(restored)).toEqual([{ uid: rifle.uid + 1, count: 1 }]);
  restored.firearms.advanceTo(0.5);
  restored.firearms.advanceTo(1);
  expect(cases(restored)).toEqual([{ uid: rifle.uid + 1, count: 1 }]);
  expect(restoredEffects).toHaveLength(1);
  original.firearms.advanceTo(1);
  expect(restoredEffects).toEqual(originalEffects);
  expect(restored.audioState()).toEqual(pickerBefore);
  expect(saved.character.inventory.hands.right?.firearm?.chamber).toBe('case');
});
