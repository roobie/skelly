import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { type AimStep, assertAimState } from '../src/core/aim.ts';
import { buildRegistry } from '../src/core/content.ts';
import { pelletShot } from '../src/core/pellets.ts';
import {
  decodeSave,
  encodeSave,
  SAVE_SCHEMA_VERSION,
  type SaveContentKind,
  type SaveVersionComponents,
} from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { type FirearmShotEffect, firearmHandlingFor, spentCaseItemId } from '../src/game/firearmHandling.ts';
import { adjustLookPitch, LOOK_PITCH_LIMIT } from '../src/game/input.ts';
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
  schemaVersion: SAVE_SCHEMA_VERSION,
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
      return ['needs', 'body', 'long-action', 'player', 'zombies', 'handling', 'lights', 'firearms'].includes(id);
    case 'skill':
      return registry.skills.has(id);
    case 'recipe':
      return registry.recipes.has(id);
    default:
      throw new Error(`Unknown content kind ${kind}`);
  }
};
const session = (
  effects: FirearmShotEffect[],
  restore?: Readonly<SaveSnapshot>,
  look: { pitch: number } = { pitch: restore?.character.player.pitch ?? 0 },
  options: { readonly firing?: boolean; readonly adjustPitch?: boolean } = {},
) =>
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
      active: () => options.firing ?? false,
      automaticFireHeld: () => options.firing ?? false,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => look.pitch,
      ...(options.adjustPitch === false
        ? {}
        : {
            adjustPitch: (delta) => {
              const adjusted = adjustLookPitch(look.pitch, delta);
              look.pitch = adjusted.pitch;
              return adjusted.applied;
            },
          }),
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    onFirearmEjection: (effect) => effects.push(effect),
    ...(restore ? { restore } : {}),
  });

it('a codec save restores the immediate aim frame, recoil and next pellet rays', async () => {
  const original = session([]);
  const prior: AimStep = {
    dt: 1 / 60,
    velocity: [1.2, 0, -0.4],
    blockSize: 0.5,
    yaw: Math.PI - 0.02,
    pitch: 0.1,
    variance: 1,
    firing: false,
    recoilRecoveryRate: 1,
  };
  original.aim.advance(prior);
  original.aim.recordShot(129, 0.02);
  const snapshot = original.snapshot({ worldId: 'world', characterId: 'character' });
  const bytes = await encodeSave(snapshot, {
    generation: 1,
    version,
    worldOptions: { blockSize: 0.5, site: 'hamlet', storeys: 1, density: null },
  });
  const decoded = await decodeSave(bytes, { version, contentLookup });
  const resumed = session([], decoded.snapshot);
  expect(resumed.aim.frame).toEqual(original.aim.frame);
  const next: AimStep = { ...prior, yaw: -Math.PI + 0.03, pitch: 0.12 };
  const originalFrame = original.aim.advance(next);
  const resumedFrame = resumed.aim.advance(next);
  expect(resumedFrame).toEqual(originalFrame);
  const ammo = registry.items.get('shell_12_gauge_00_buck')!.ammo!;
  expect(
    pelletShot({ ammo, origin: [1, 2, 3], yaw: 0.2, pitch: -0.1, aimFrame: resumedFrame, seed: 83, key: 'resume' }),
  ).toEqual(
    pelletShot({ ammo, origin: [1, 2, 3], yaw: 0.2, pitch: -0.1, aimFrame: originalFrame, seed: 83, key: 'resume' }),
  );
});

it('keeps headless session recoil valid when held fire has no view-pitch control', () => {
  const headless = session([], undefined, { pitch: LOOK_PITCH_LIMIT }, { firing: true, adjustPitch: false });
  for (let shot = 0; shot < 80; shot++) {
    headless.aim.recordShot(shot, 0.035);
    headless.frame(1 / 60);
    assertAimState(headless.aim.snapshotState());
  }
});

it('a codec save preserves the session-shifted view pitch after over-limit recoil', async () => {
  const look = { pitch: 0 };
  const original = session([], undefined, look);
  original.aim.recordShot(1, 0.3);
  original.frame(0.1);
  expect(look.pitch).toBeGreaterThan(0);
  const saved = original.snapshot({ worldId: 'world', characterId: 'character' });
  const bytes = await encodeSave(saved, {
    generation: 1,
    version,
    worldOptions: { blockSize: 0.5, site: 'testHouse', storeys: 1, density: 0.75 },
  });
  const decoded = await decodeSave(bytes, { version, contentLookup });
  const resumed = session([], decoded.snapshot);
  expect(decoded.snapshot.character.player.pitch).toBeCloseTo(look.pitch, 8);
  expect(resumed.restoredLook?.pitch).toBeCloseTo(look.pitch, 8);
});

it('holds an active automatic firearm cycle through unconsciousness', () => {
  const runtime = session([]);
  const rifle = runtime.inventory.create('debug_rifle_assault');
  expect(runtime.inventory.add(rifle, { kind: 'hand', side: 'right' })).toBe(true);
  const { action, calibre } = firearmHandlingFor(rifle, registry);
  if (!action.fire) {
    throw new Error('AR knockout fixture needs exported automatic action data');
  }
  const ejectAt = action.fire.rearwardSeconds * action.ejectAt;
  expect(
    runtime.firearms.fire({
      debugMode: true,
      item: rifle,
      seed: 71,
      simTime: 0,
      feet: [0, 0, 0],
      eye: [0, PLAYER.eye / 0.5, 0],
      yaw: 0,
      pitch: 0,
      aimFrame: { yaw: 0, pitch: 0 },
      blockSize: 0.5,
    }),
  ).toBe(true);
  runtime.sim.body.impact(0, 'torso', { shockDamage: runtime.sim.body.shock });
  const frames = Math.ceil((ejectAt + 0.1) * 60);
  for (let frame = 0; frame < frames; frame += 1) {
    runtime.frame(1 / 60);
  }

  const spentCases = [...runtime.inventory.items()].filter(({ item }) => item.type === spentCaseItemId(calibre));
  expect(runtime.sim.body.unconscious).toBe(true);
  expect(spentCases).toHaveLength(0);
  expect(runtime.inventory.itemByUid(rifle.uid)?.firearm?.cycle).toBeDefined();
});

it('a codec save before ejectAt restores one pending case and ejects it exactly once', async () => {
  const originalEffects: FirearmShotEffect[] = [];
  const original = session(originalEffects);
  const rifle = original.inventory.create('debug_rifle_assault');
  expect(original.inventory.add(rifle, { kind: 'hand', side: 'right' })).toBe(true);
  const pickerBefore = original.audioState();
  const { action, calibre } = firearmHandlingFor(rifle, registry);
  if (!action.fire) {
    throw new Error('AR save fixture needs exported automatic action data');
  }
  const ejectTime = action.fire.rearwardSeconds * action.ejectAt;
  const cycleTime = action.fire.durationSeconds;
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
      aimFrame: { yaw: 0, pitch: 0 },
      blockSize: 0.5,
    }),
  ).toBe(true);
  original.frame(ejectTime / 2);
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
      .filter(({ item }) => item.type === spentCaseItemId(calibre))
      .map(({ item: { uid, count } }) => ({ uid, count }));
  expect(cases(restored)).toEqual([]);
  restored.firearms.advanceTo(ejectTime - 1e-6);
  expect(cases(restored)).toEqual([]);
  restored.firearms.advanceTo(ejectTime);
  expect(cases(restored)).toEqual([{ uid: rifle.uid + 1, count: 1 }]);
  restored.firearms.advanceTo(cycleTime);
  restored.firearms.advanceTo(cycleTime * 2);
  expect(cases(restored)).toEqual([{ uid: rifle.uid + 1, count: 1 }]);
  expect(restoredEffects).toHaveLength(1);
  original.firearms.advanceTo(cycleTime * 2);
  expect(restoredEffects).toEqual(originalEffects);
  expect(restored.audioState()).toEqual(pickerBefore);
  expect(saved.character.inventory.hands.right?.firearm?.chamber).toBe('case');
});
