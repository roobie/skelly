import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { type AimStep, assertAimState } from '../src/core/aim.ts';
import { buildRegistry } from '../src/core/content.ts';
import { firearmsSkillEffects } from '../src/core/firearmsSkill.ts';
import type { Item } from '../src/core/items.ts';
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
import {
  type FirearmShotEffect,
  type FirearmShotInput,
  firearmHandlingFor,
  spentCaseItemId,
} from '../src/game/firearmHandling.ts';
import { adjustLookPitch, LOOK_PITCH_LIMIT } from '../src/game/input.ts';
import { PLAYER } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { chargedRifle, rifleAmmunition, rifleInHand, settle } from './rifleFixture.ts';

const base = 'src/content/base';
const baseFiles = readdirSync(base)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown }));
const { registry } = buildRegistry(baseFiles);
const version: SaveVersionComponents = {
  simulationHash: 'a'.repeat(64),
  schemaVersion: SAVE_SCHEMA_VERSION,
  generators: { worldgen: 'worldgen-v1', shamblerFigure: 'shambler-figure-v1', amalgamFigure: 'amalgam-figure-v1' },
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
      return [
        'needs',
        'body',
        'long-action',
        'player',
        'zombies',
        'zombie-background',
        'handling',
        'lights',
        'firearms',
      ].includes(id);
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
  options: {
    readonly firing?: boolean;
    readonly adjustPitch?: boolean;
    readonly readyHeld?: boolean | (() => boolean);
    readonly active?: boolean;
    readonly registry?: typeof registry;
  } = {},
) =>
  createSession({
    registry: options.registry ?? registry,
    world: new World(),
    isSolid: (_x, y) => y < 0,
    isOpaque: () => false,
    scale: makeScale(0.5),
    seed: 71,
    start: 0,
    spawn: [0, 0, 0],
    ready: () => true,
    controls: {
      active: () => options.active ?? options.firing ?? false,
      automaticFireHeld: () => options.firing ?? false,
      readyHeld: () => (typeof options.readyHeld === 'function' ? options.readyHeld() : (options.readyHeld ?? false)),
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

it('runtime firearm skill sliders tune the held gun and reset when its save is loaded', () => {
  const original = session([]);
  const rifle = original.inventory.create('rifle_assault');
  if (!original.inventory.add(rifle, { kind: 'hand', side: 'right' })) {
    throw new Error('could not put the test rifle in the right hand');
  }
  const contentTuning = structuredClone(registry.items.get('rifle_assault')!.firearm!.skillZeroHandling!);
  const changed = {
    ...original.firearmsSkillZeroHandling,
    automaticFollowup: {
      ...original.firearmsSkillZeroHandling.automaticFollowup,
      recoilKickScale: original.firearmsSkillZeroHandling.automaticFollowup.recoilKickScale + 1,
    },
  };
  expect(original.firearmsSkillZeroTarget).toBe(registry.items.get('rifle_assault')!.name);
  original.setFirearmsSkillZeroHandling(changed);
  expect(original.firearmsSkillZeroHandling).toEqual(changed);
  expect(registry.items.get('rifle_assault')!.firearm!.skillZeroHandling).toEqual(contentTuning);
  const saved = original.snapshot({ worldId: 'world', characterId: 'character' });
  expect(JSON.stringify(saved)).not.toContain('skillZeroHandling');
  expect(session([], saved).firearmsSkillZeroHandling).toEqual(contentTuning);
});

it('committed shots use the held firearm skill-zero recoil factors', () => {
  const sourceGun = registry.items.get('rifle_assault')!;
  const makeFixture = (id: string, weight: number, recoilKickScale: number) => {
    const firearm = structuredClone(sourceGun.firearm!);
    const skillZeroHandling = firearm.skillZeroHandling!;
    return {
      ...structuredClone(sourceGun),
      id,
      name: id,
      weight,
      firearm: {
        ...firearm,
        skillZeroHandling: {
          ...skillZeroHandling,
          singleShot: { ...skillZeroHandling.singleShot, recoilKickScale },
        },
      },
    };
  };
  const fixtureBuild = buildRegistry([
    ...baseFiles,
    {
      source: 'firearm-session-fixtures.json',
      data: {
        items: [makeFixture('fixture_light_firearm', 1000, 2), makeFixture('fixture_heavy_firearm', 8000, 8)],
      },
    },
  ]);
  expect(fixtureBuild.issues).toEqual([]);

  const recoilScales = ['fixture_light_firearm', 'fixture_heavy_firearm'].map((type) => {
    const runtime = session([], undefined, undefined, { registry: fixtureBuild.registry });
    const firearm = chargedRifle(runtime.inventory, runtime.queue, runtime.firearms, {
      type,
      magazines: runtime.magazines,
    }).rifle;
    const didFire = runtime.firearms.fire({
      item: firearm,
      seed: 71,
      simTime: 0,
      feet: [0, 0, 0],
      eye: [0, PLAYER.eye / 0.5, 0],
      yaw: 0,
      pitch: 0,
      aimFrame: runtime.aim.frame,
      blockSize: 0.5,
      ready: true,
      sprinting: false,
    });
    expect(didFire).toBe(true);
    const baseKick = firearmHandlingFor(firearm, fixtureBuild.registry).recoilKickRadians!;
    return runtime.aim.snapshotState().recoilPitch / baseKick;
  });

  expect(recoilScales[0]).not.toBe(recoilScales[1]);
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
    stridePhase: 0,
    stepIndex: 0,
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
  const followup = firearmsSkillEffects(
    0,
    registry.skills.get('firearms_combat')!.combat!.firearms!,
    'automaticFollowup',
  );
  for (let shot = 0; shot < 80; shot++) {
    headless.aim.recordShot(shot, 0.035, followup.recoilKickScale);
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

it('advances firearm readiness from simulation time while the stance input is held', () => {
  const original = session([], undefined, undefined, { readyHeld: true, active: true });
  const rifle = original.inventory.create('rifle_assault');
  expect(original.inventory.add(rifle, { kind: 'hand', side: 'right' })).toBe(true);
  original.frame(1 / 60);
  const { readying } = rifle.firearm!;
  const { duration } = readying!;
  expect(original.firearms.isReady(rifle.uid)).toBe(false);
  original.frame(duration);
  expect(original.firearms.isReady(rifle.uid)).toBe(true);
});

it('keeps a ready pump shotgun ready through racking and loading, then fires without raising again', async () => {
  const original = session([], undefined, undefined, { readyHeld: true, active: true });
  const shotgun = original.inventory.create('pump_shotgun');
  const shells = original.inventory.create('shell_12_gauge_00_buck', 3);
  expect(original.inventory.add(shotgun, { kind: 'hand', side: 'right' })).toBe(true);
  expect(original.inventory.add(shells, { kind: 'hand', side: 'left' })).toBe(true);

  expect(original.firearms.load(shells, original.sim.time)).toBeUndefined();
  original.queue.tick(original.queue.remaining);
  expect(shotgun.firearm?.tube).toContain(shells.type);
  original.frame(1 / 60);
  const readying = shotgun.firearm?.readying;
  expect(readying).toBeDefined();
  original.frame(readying!.duration);
  expect(original.firearms.isReady(shotgun.uid)).toBe(true);

  const finishHandling = () => {
    while (original.queue.busy) {
      original.frame(1 / 60);
    }
  };
  const shotInput = () => ({
    item: shotgun,
    seed: 71,
    simTime: original.sim.time,
    feet: original.feet(),
    eye: [0, PLAYER.eye / 0.5, 0] as [number, number, number],
    yaw: 0,
    pitch: 0,
    aimFrame: original.aim.frame,
    blockSize: 0.5,
    ready: original.firearms.isReady(shotgun.uid),
    sprinting: false,
  });
  const readyAfterEachAction: boolean[] = [];
  expect(original.firearms.cock(shotgun.uid, original.sim.time)).toBeUndefined();
  expect(original.firearms.fire(shotInput())).toBe(false);
  original.frame(1 / 60);
  const rackSnapshot = original.snapshot({ worldId: 'world', characterId: 'character' });
  const rackBytes = await encodeSave(rackSnapshot, {
    generation: 1,
    version,
    worldOptions: { blockSize: 0.5, site: 'hamlet', storeys: 1, density: null },
  });
  const rackDecoded = await decodeSave(rackBytes, { version, contentLookup });
  const resumed = session([], rackDecoded.snapshot, undefined, { readyHeld: true, active: true });
  expect(resumed.firearms.isReady(shotgun.uid)).toBe(true);
  finishHandling();
  readyAfterEachAction.push(original.firearms.isReady(shotgun.uid));

  expect(original.firearms.load(shells, original.sim.time)).toBeUndefined();
  expect(original.firearms.fire(shotInput())).toBe(false);
  finishHandling();
  readyAfterEachAction.push(original.firearms.isReady(shotgun.uid));
  expect(readyAfterEachAction).toEqual([true, true]);
  expect(original.firearms.fire(shotInput())).toBe(true);
});

it('releasing ready during a rack lowers the shotgun', () => {
  const stance = { held: true };
  const original = session([], undefined, undefined, { readyHeld: () => stance.held, active: true });
  const shotgun = original.inventory.create('pump_shotgun');
  const shells = original.inventory.create('shell_12_gauge_00_buck');
  expect(original.inventory.add(shotgun, { kind: 'hand', side: 'right' })).toBe(true);
  expect(original.inventory.add(shells, { kind: 'hand', side: 'left' })).toBe(true);
  expect(original.firearms.load(shells, original.sim.time)).toBeUndefined();
  original.queue.tick(original.queue.remaining);
  original.frame(1 / 60);
  const readying = shotgun.firearm?.readying;
  expect(readying).toBeDefined();
  original.frame(readying!.duration);
  expect(original.firearms.isReady(shotgun.uid)).toBe(true);

  expect(original.firearms.cock(shotgun.uid, original.sim.time)).toBeUndefined();
  original.frame(1 / 60);
  stance.held = false;
  while (original.queue.busy) {
    original.frame(1 / 60);
  }
  expect(original.firearms.isReady(shotgun.uid)).toBe(false);
});

it('loading a magazine round, changing the magazine and charging each train firearms handling', () => {
  const runtime = session([], undefined, undefined, { active: true });
  const { inventory, magazines, firearms } = runtime;
  const rifle = inventory.create('rifle_assault');
  const { magazine: magazineType, cartridge } = rifleAmmunition(registry, rifle.type);
  const magazine = inventory.create(magazineType);
  const bag = inventory.create('hiking_backpack');
  const pocket = { kind: 'pocket', owner: bag, pocket: 0 } as const;
  const hand = { kind: 'hand', side: 'right' } as const;
  expect(
    inventory.add(bag, { kind: 'worn' }) &&
      inventory.add(inventory.create(cartridge, 2), pocket) &&
      inventory.add(magazine, hand),
  ).toBe(true);
  const trains = (act: () => string | undefined): boolean => {
    const level = runtime.character.skills.firearms_combat!;
    const practice = runtime.character.practice.firearms_combat!;
    expect(act()).toBeUndefined();
    settle(runtime.queue, () => runtime.frame(1 / 60));
    const after = runtime.character.skills.firearms_combat!;
    return after > level || (after === level && runtime.character.practice.firearms_combat! > practice);
  };
  expect(trains(() => magazines.loadNext(magazine.uid, runtime.sim.time))).toBe(true);
  expect(inventory.move(magazine, pocket).ok && inventory.add(rifle, hand)).toBe(true);
  expect(trains(() => firearms.loadNext(rifle.uid, runtime.sim.time))).toBe(true);
  expect(trains(() => firearms.cock(rifle.uid, runtime.sim.time))).toBe(true);
});

it('keeps a ready rifle ready through a magazine change and a charge', () => {
  const original = session([], undefined, undefined, { readyHeld: true, active: true });
  // Inserting into the empty rifle is the same magazine-change job as a swap.
  const { rifle, magazine } = rifleInHand(original.inventory, original.queue, { magazines: original.magazines });
  original.frame(1 / 60);
  original.frame(rifle.firearm!.readying!.duration);
  expect(original.firearms.isReady(rifle.uid)).toBe(true);
  const readyAfter = (act: () => string | undefined): boolean => {
    expect(act()).toBeUndefined();
    settle(original.queue, () => original.frame(1 / 60));
    return original.firearms.isReady(rifle.uid);
  };
  expect(readyAfter(() => original.firearms.loadNext(rifle.uid, original.sim.time))).toBe(true);
  expect(rifle.slots?.magazine).toBe(magazine);
  expect(readyAfter(() => original.firearms.cock(rifle.uid, original.sim.time))).toBe(true);
});

it('a codec save keeps the fitted magazine and the chambered round, so the next shot is the same', async () => {
  const original = session([]);
  const rifle = sessionRifle(original, 4);
  expect(original.firearms.fire(rifleShot(rifle))).toBe(true);
  original.firearms.advanceTo(1);
  const bytes = await encodeSave(original.snapshot({ worldId: 'world', characterId: 'character' }), {
    generation: 1,
    version,
    worldOptions: { blockSize: 0.5, site: 'testHouse', storeys: 1, density: 0.75 },
  });
  const resumed = session([], (await decodeSave(bytes, { version, contentLookup })).snapshot);
  const restored = resumed.inventory.itemByUid(rifle.uid)!;
  expect(restored.firearm?.roundType).toBeDefined();
  expect(restored.firearm?.roundType).toBe(rifle.firearm?.roundType);
  expect(restored.slots).toEqual(rifle.slots);
  expect(resumed.firearms.fire(rifleShot(restored, 2))).toBe(true);
  expect(original.firearms.fire(rifleShot(rifle, 2))).toBe(true);
  resumed.firearms.advanceTo(3);
  original.firearms.advanceTo(3);
  expect(restored.firearm?.roundType).toBe(rifle.firearm?.roundType);
  expect(restored.slots).toEqual(rifle.slots);
});

it('a codec save resumes firearm ready progress', async () => {
  const original = session([], undefined, undefined, { readyHeld: true });
  const rifle = original.inventory.create('rifle_assault');
  expect(original.inventory.add(rifle, { kind: 'hand', side: 'right' })).toBe(true);
  original.firearms.advanceReadiness(0, rifle.uid, true);
  const { readying } = rifle.firearm!;
  const { duration } = readying!;
  original.firearms.advanceReadiness(duration / 2, rifle.uid, true);
  const progress = structuredClone(readying);
  const bytes = await encodeSave(original.snapshot({ worldId: 'world', characterId: 'character' }), {
    generation: 1,
    version,
    worldOptions: { blockSize: 0.5, site: 'hamlet', storeys: 1, density: null },
  });
  const decoded = await decodeSave(bytes, { version, contentLookup });
  const resumed = session([], decoded.snapshot, undefined, { readyHeld: true });
  expect(resumed.inventory.itemByUid(rifle.uid)?.firearm?.readying).toEqual(progress);
  expect(resumed.firearms.isReady(rifle.uid)).toBe(false);
});

const rifleShot = (rifle: Item, simTime = 0): FirearmShotInput => ({
  item: rifle,
  seed: 71,
  simTime,
  feet: [0, 0, 0],
  eye: [0, PLAYER.eye / 0.5, 0],
  yaw: 0,
  pitch: 0,
  aimFrame: { yaw: 0, pitch: 0 },
  blockSize: 0.5,
  ready: true,
  sprinting: false,
});
const sessionRifle = (runtime: ReturnType<typeof session>, rounds?: number): Item =>
  chargedRifle(runtime.inventory, runtime.queue, runtime.firearms, {
    magazines: runtime.magazines,
    ...(rounds === undefined ? {} : { rounds }),
  }).rifle;

it('holds an active automatic firearm cycle through unconsciousness', () => {
  const runtime = session([]);
  const rifle = sessionRifle(runtime);
  const { action, calibre } = firearmHandlingFor(rifle, registry);
  if (!action.fire) {
    throw new Error('AR knockout fixture needs exported automatic action data');
  }
  const cycleSeconds = action.fire.durationSimSeconds;
  const frameSeconds = 1 / 60;
  expect(runtime.firearms.fire(rifleShot(rifle))).toBe(true);
  const framesBeforeKnockout = Math.max(1, Math.floor(cycleSeconds / 2 / frameSeconds));
  for (let frame = 0; frame < framesBeforeKnockout; frame += 1) {
    runtime.frame(frameSeconds);
  }
  runtime.sim.body.impact(0, 'torso', { shockDamage: runtime.sim.body.shock });
  for (let frame = 0; frame < Math.ceil((cycleSeconds + frameSeconds) / frameSeconds); frame += 1) {
    runtime.frame(frameSeconds);
  }

  const spentCases = () => [...runtime.inventory.items()].filter(({ item }) => item.type === spentCaseItemId(calibre));
  const pausedCycle = runtime.inventory.itemByUid(rifle.uid)?.firearm?.cycle;
  expect(runtime.sim.body.unconscious).toBe(true);
  expect(pausedCycle).toBeDefined();
  expect(pausedCycle!.elapsed).toBeGreaterThan(0);
  expect(pausedCycle!.elapsed).toBeLessThan(cycleSeconds);

  runtime.sim.body.advance(runtime.sim.body.tuning.knockoutSimSeconds);
  expect(runtime.sim.body.unconscious).toBe(false);
  const remainingSeconds = cycleSeconds - pausedCycle!.elapsed;
  const remainingFrames = Math.ceil((remainingSeconds + frameSeconds) / frameSeconds);
  for (let frame = 0; frame < remainingFrames && runtime.inventory.itemByUid(rifle.uid)?.firearm?.cycle; frame += 1) {
    runtime.frame(frameSeconds);
  }

  expect(spentCases()).toHaveLength(1);
  expect(runtime.inventory.itemByUid(rifle.uid)?.firearm?.cycle).toBeUndefined();
});

it('a knockout codec save preserves an automatic cycle’s remaining frames', async () => {
  const frameSeconds = 1 / 60;
  const prepare = (effects: FirearmShotEffect[]) => {
    const runtime = session(effects);
    const rifle = sessionRifle(runtime);
    const { action } = firearmHandlingFor(rifle, registry);
    if (!action.fire) {
      throw new Error('AR knockout save fixture needs exported automatic action data');
    }
    expect(runtime.firearms.fire(rifleShot(rifle))).toBe(true);
    const framesBeforeKnockout = Math.max(1, Math.floor(action.fire.durationSimSeconds / 2 / frameSeconds));
    for (let frame = 0; frame < framesBeforeKnockout; frame += 1) {
      runtime.frame(frameSeconds);
    }
    runtime.sim.body.impact(0, 'torso', { shockDamage: runtime.sim.body.shock });
    const framesIntoKnockout = Math.min(
      30,
      Math.max(1, Math.floor((runtime.sim.body.tuning.knockoutSimSeconds * 60) / 2)),
    );
    for (let frame = 0; frame < framesIntoKnockout; frame += 1) {
      runtime.frame(frameSeconds);
    }
    expect(runtime.sim.body.unconscious).toBe(true);
    return { runtime, rifle, cycleSeconds: action.fire.durationSimSeconds };
  };
  const continuous = prepare([]);
  const saved = prepare([]);
  const savedBytes = await encodeSave(saved.runtime.snapshot({ worldId: 'world', characterId: 'character' }), {
    generation: 1,
    version,
    worldOptions: { blockSize: 0.5, site: 'testHouse', storeys: 1, density: 0.75 },
  });
  const decoded = await decodeSave(savedBytes, { version, contentLookup });
  const resumed = session([], decoded.snapshot);
  const continuousCycle = continuous.runtime.inventory.itemByUid(continuous.rifle.uid)?.firearm?.cycle;
  const resumedCycle = resumed.inventory.itemByUid(continuous.rifle.uid)?.firearm?.cycle;
  expect(continuousCycle).toBeDefined();
  expect(resumedCycle).toBeDefined();
  expect(continuousCycle!.elapsed).toBe(resumedCycle!.elapsed);

  const framesUntilCycleEnds = (runtime: ReturnType<typeof session>): number => {
    runtime.sim.body.advance(runtime.sim.body.tuning.knockoutSimSeconds);
    runtime.sim.paused = false;
    expect(runtime.sim.body.unconscious).toBe(false);
    let frames = 0;
    while (runtime.inventory.itemByUid(continuous.rifle.uid)?.firearm?.cycle && frames < 20) {
      runtime.frame(frameSeconds);
      frames += 1;
    }
    expect(runtime.inventory.itemByUid(continuous.rifle.uid)?.firearm?.cycle).toBeUndefined();
    return frames;
  };
  expect(continuousCycle!.duration).toBe(continuous.cycleSeconds);
  expect(framesUntilCycleEnds(resumed)).toBe(framesUntilCycleEnds(continuous.runtime));
});

it('a codec save before ejectAt restores one pending case and ejects it exactly once', async () => {
  const originalEffects: FirearmShotEffect[] = [];
  const original = session(originalEffects);
  const rifle = sessionRifle(original);
  const pickerBefore = original.audioState();
  const { action, calibre } = firearmHandlingFor(rifle, registry);
  if (!action.fire) {
    throw new Error('AR save fixture needs exported automatic action data');
  }
  const ejectTime = action.fire.rearwardSimSeconds * action.ejectAt;
  const cycleTime = action.fire.durationSimSeconds;
  expect(original.firearms.fire(rifleShot(rifle))).toBe(true);
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
  const ejected = cases(restored);
  expect(ejected).toEqual([{ uid: expect.any(Number), count: 1 }]);
  restored.firearms.advanceTo(cycleTime);
  restored.firearms.advanceTo(cycleTime * 2);
  expect(cases(restored)).toEqual(ejected);
  expect(restoredEffects).toHaveLength(1);
  original.firearms.advanceTo(cycleTime * 2);
  expect(cases(original)).toEqual(ejected);
  expect(restoredEffects).toEqual(originalEffects);
  expect(restored.audioState()).toEqual(pickerBefore);
  expect(saved.character.inventory.hands.right?.firearm?.chamber).toBe('case');
});
