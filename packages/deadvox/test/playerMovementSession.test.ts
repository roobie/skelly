import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { actionText } from '../src/core/actionText.ts';
import { breathSteadying, NEUTRAL_AIM } from '../src/core/aim.ts';
import { practiceForNextLevel, SKILL_LEVEL_MAX } from '../src/core/character.ts';
import type { Vec3 } from '../src/core/coords.ts';
import type { EntityId } from '../src/core/entities.ts';
import { firearmStanceEffects, firearmsSkillEffects, steadinessTuning } from '../src/core/firearmsSkill.ts';
// biome-ignore lint/performance/noNamespaceImport: The spy observes the session's collision pose solves.
import * as leanCollision from '../src/core/leanCollision.ts';
import { playerEyePosition } from '../src/core/playerLookPose.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { bodyDistance, reachTuning } from '../src/core/reach.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { BLOCK_SIZE, makeScale } from '../src/core/scale.ts';
import type { SiteLayoutDef, ZombieDef } from '../src/core/schema.ts';
import { firearmShotPracticeSkill, firearmSteadinessSkill, skillActivityPractice } from '../src/core/skillTraining.ts';
import { compileTemplate, footprint, type Placement, placedBlockAt } from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import type { Zombie } from '../src/core/zombies.ts';
import { DOOR_ACTION } from '../src/game/doorAction.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry, baseRegistryWith } from './baseRegistry.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { type MoveIntent, PLAYER, physicsFor, type StanceToggle } from './playerFixture.ts';
import { chargedRifle } from './rifleFixture.ts';
import { encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const BASE = 'src/content/base';
const registry = baseRegistry();
const [FIREARM_TYPE] = [...registry.items].find(([, def]) => def.firearm)!;
const [DOOR_TYPE] = [...registry.furniture].find(([, def]) => def.door && !def.door.hatch)!;

const FLAT: SolidAt = (_x, y) => y === 0;

const makeRuntime = ({
  isSolid = FLAT,
  spawn = [0, 1, 0] as Vec3,
  yaw = 0,
  seed = 73,
  restore = undefined as Readonly<SaveSnapshot> | undefined,
  content = registry,
  world = new World(),
} = {}) => {
  const scale = makeScale(0.5);
  let intent: MoveIntent = { ...IDLE };
  let stanceToggle: StanceToggle | undefined;
  let readyHeld = false;
  let ads = false;
  const footfalls: string[] = [];
  const refusals: string[] = [];
  const session = createSession({
    registry: content,
    ...(restore ? { restore } : {}),
    world,
    isSolid,
    isOpaque: isSolid,
    scale,
    seed,
    start: 43_200,
    spawn,
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => intent,
      readyHeld: () => readyHeld,
      aimingDownSights: () => ads,
      consumeStanceToggle: () => {
        const pressed = stanceToggle;
        stanceToggle = undefined;
        return pressed;
      },
      yaw: () => yaw,
      pitch: () => 0,
      walking: () => intent.walk,
      descending: () => false,
    },
    audio: {
      play: ({ event }) => {
        if (event.startsWith('footstep_')) {
          footfalls.push(event);
        }
      },
    },
    notice: () => undefined,
    refusal: (text) => {
      refusals.push(text);
    },
    onRead: () => undefined,
  });
  const advance = (frames: number) => {
    for (let i = 0; i < frames; i++) {
      session.frame(1 / 60);
    }
  };
  return {
    session,
    get footfallCount() {
      return footfalls.length;
    },
    refusals,
    advance,
    setIntent: (next: MoveIntent) => {
      intent = next;
    },
    toggleCrouch: () => {
      stanceToggle = 'crouch';
    },
    toggleProne: () => {
      stanceToggle = 'prone';
    },
    setYaw: (value: number) => {
      yaw = value;
    },
    setAds: (value: boolean) => {
      ads = value;
    },
    setReadyHeld: (value: boolean) => {
      readyHeld = value;
    },
  };
};

describe('long-gun skill ownership', () => {
  const combatId = 'firearms_combat';
  const snipingId = 'fixture_precision';
  const gunId = 'fixture_training_long_gun';
  const combat = registry.skills.get(combatId)!;
  const content = baseRegistryWith([
    {
      source: 'fixture-sniping',
      data: {
        skills: [
          {
            ...combat,
            combat: {
              ...combat.combat,
              firearms: {
                ...combat.combat!.firearms!,
                longGunSteadinessSkill: snipingId,
                // Test-authored timing so the two ADS regimes are fixture properties, not production
                // tuning: the novice raise (minimum + range) exceeds the maximum, so the clamp bites,
                // while a trained handler's raise (minimum + range * 5 / 15 at half-life 5) stays under it.
                raiseMinimumSimSeconds: 0.3,
                raiseRangeSimSeconds: 0.3,
                raiseHalfLifeLevels: 5,
                adsAcquisitionMaximumSimSeconds: 0.45,
              },
            },
          },
          { ...registry.skills.get(combat.combat!.firearms!.longGunSteadinessSkill)!, id: snipingId },
        ],
        items: [true, false].map((twoHanded) => ({
          ...registry.items.get('rifle_assault')!,
          id: twoHanded ? gunId : 'fixture_training_handgun',
          twoHanded,
          firearm: {
            ...registry.items.get('rifle_assault')!.firearm!,
            dispersionRadians: 0,
          },
        })),
      },
    },
  ]);
  /** The fixture's own firearms timing; assertions read it, so production retuning cannot break them. */
  const tuning = content.skills.get(combatId)!.combat!.firearms!;
  const equip = (runtime: ReturnType<typeof makeRuntime>, type = gunId) => {
    const { session } = runtime;
    return chargedRifle(session.inventory, session.queue, session.firearms, { type, magazines: session.magazines })
      .rifle;
  };
  const train = (runtime: ReturnType<typeof makeRuntime>, id: string) => {
    const actor = runtime.session.character;
    while (actor.skills[id]! < SKILL_LEVEL_MAX) {
      actor.awardPractice(id, practiceForNextLevel(content, actor.skills[id]!), SKILL_LEVEL_MAX);
    }
  };
  /** Advances simulation frames until the held firearm's ADS acquisition completes; returns the frames spent. */
  const acquireAds = (runtime: ReturnType<typeof makeRuntime>): number => {
    const uid = runtime.session.inventory.hands.right?.uid;
    if (uid === undefined) {
      throw new Error('No held firearm to acquire ADS');
    }
    let frames = 0;
    while (!runtime.session.firearms.isAdsAcquired(uid)) {
      runtime.advance(1);
      frames += 1;
      if (frames > 3600) {
        throw new Error('ADS acquisition did not complete');
      }
    }
    return frames;
  };

  it('selects a renamed content skill by long-gun classification, not optics or item identity', () => {
    const gun = content.items.get(gunId)!;
    expect(firearmSteadinessSkill(content, gun)).toBe(snipingId);
    expect(firearmSteadinessSkill(content, { ...gun, twoHanded: false })).toBe(combatId);
    const { firearm: _firearm, ...tool } = gun;
    expect(firearmSteadinessSkill(content, { ...tool, twoHanded: true })).toBe(combatId);
    expect(firearmShotPracticeSkill(content, gun, false)).toBe(combatId);
    expect(firearmShotPracticeSkill(content, gun, true)).toBe(snipingId);
    expect(firearmShotPracticeSkill(content, { ...gun, twoHanded: false }, true)).toBe(combatId);
  });

  it.each([gunId, 'fixture_training_handgun'])(
    'selects independent steadiness and recoil owners for %s without resampling drift',
    (type) => {
      const measure = (combatExpert: boolean, snipingExpert: boolean) => {
        const runtime = makeRuntime({ content });
        equip(runtime, type);
        if (combatExpert) {
          train(runtime, combatId);
        }
        if (snipingExpert) {
          train(runtime, snipingId);
        }
        runtime.setReadyHeld(true);
        runtime.advance(90);
        runtime.setAds(true);
        acquireAds(runtime);
        runtime.setIntent({ ...IDLE, sprint: true });
        runtime.setYaw(0.2);
        const advance = vi.spyOn(runtime.session.aim, 'advance');
        runtime.advance(1);
        const [step] = advance.mock.calls.at(-1)!;
        advance.mockRestore();
        expect(runtime.session.aim.snapshotState().breath.held).toBe(true);
        return { runtime, step };
      };
      const novice = measure(false, false);
      const handler = measure(true, false);
      const sniper = measure(false, true);
      const steadyExpert = type === gunId ? sniper : handler;
      const otherExpert = type === gunId ? handler : sniper;
      expect(otherExpert.step.variance).toBe(novice.step.variance);
      expect(otherExpert.step.breath!.steadying).toBe(novice.step.breath!.steadying);
      expect(steadyExpert.step.variance).toBeLessThan(novice.step.variance);
      expect(steadyExpert.step.breath!.steadying).toBeGreaterThan(novice.step.breath!.steadying);
      expect(handler.step.recoilRecoveryRate).toBeGreaterThan(novice.step.recoilRecoveryRate!);
      expect(sniper.step.recoilRecoveryRate).toBe(novice.step.recoilRecoveryRate);
      expect(sniper.runtime.session.aim.snapshotState().wobbleNoise).toEqual(
        novice.runtime.session.aim.snapshotState().wobbleNoise,
      );
      const steady = steadinessTuning(tuning, content.skills.get(snipingId)!);
      expect(breathSteadying(SKILL_LEVEL_MAX, 0, steady.breathHold)).toBeGreaterThan(
        breathSteadying(0, 0, steady.breathHold),
      );
      expect(firearmsSkillEffects(SKILL_LEVEL_MAX, tuning).recoilRecoveryRate).toBeGreaterThan(
        firearmsSkillEffects(0, tuning).recoilRecoveryRate,
      );
      expect(firearmsSkillEffects(SKILL_LEVEL_MAX, tuning).recoilKickScale).toBeLessThan(
        firearmsSkillEffects(0, tuning).recoilKickScale,
      );
      expect(firearmsSkillEffects(SKILL_LEVEL_MAX, tuning).reloadDuration).toBeLessThan(
        firearmsSkillEffects(0, tuning).reloadDuration,
      );
      expect(firearmStanceEffects(SKILL_LEVEL_MAX, tuning).raiseDurationSimSeconds).toBeLessThan(
        firearmStanceEffects(0, tuning).raiseDurationSimSeconds,
      );
    },
  );

  it('awards acquisition once, includes idle ADS time and resumes without reacquiring after save', async () => {
    const runtime = makeRuntime({ content });
    equip(runtime);
    runtime.setReadyHeld(true);
    runtime.advance(90);
    const before = runtime.session.character.practice[snipingId]!;
    const combatPractice = runtime.session.character.practice[combatId];
    expect(combatPractice).toBeGreaterThan(0);
    runtime.setAds(true);
    acquireAds(runtime);
    const acquired = runtime.session.character.practice[snipingId]!;
    expect(acquired - before).toBeGreaterThanOrEqual(skillActivityPractice(content, snipingId, 'acquisition').practice);
    const snapshot = runtime.session.snapshot({ worldId: 'fixture-world', characterId: 'fixture-character' });
    const decoded = await decodeSave(await encodeFixture(snapshot), {
      version: formatVersion,
      contentLookup: (kind, id, item) => contentLookup(content, kind, id, item),
    });
    const resumed = makeRuntime({ content, restore: decoded.snapshot });
    resumed.session.sim.paused = false;
    resumed.setReadyHeld(true);
    resumed.setAds(true);
    runtime.advance(30);
    resumed.advance(30);
    expect(resumed.session.sim.time).toBe(runtime.session.sim.time);
    expect(resumed.session.inventory.hands.right?.type).toBe(gunId);
    expect(resumed.session.firearms.isReady(resumed.session.inventory.hands.right!.uid)).toBe(true);
    expect(resumed.session.sim.body.actionRefusal).toBeUndefined();
    expect(runtime.session.character.practice[snipingId]).toBeGreaterThan(acquired);
    expect(runtime.session.character.practice[combatId]).toBe(combatPractice);
    expect(resumed.session.character.snapshotState()).toEqual(runtime.session.character.snapshotState());
    const beforeLowering = runtime.session.character.practice[snipingId];
    runtime.setAds(false);
    runtime.advance(30);
    expect(runtime.session.character.practice[snipingId]).toBe(beforeLowering);
  });

  it('routes a committed aimed shot and hit only to Sniping and rejects an unready shot without practice', () => {
    const runtime = makeRuntime({ content });
    const rifle = equip(runtime);
    const { session } = runtime;
    const shot = {
      item: rifle,
      feet: [0, 1, 0] as Vec3,
      eye: [0, 4, 0] as Vec3,
      yaw: 0,
      pitch: 0,
      blockSize: 0.5,
      simTime: session.sim.time,
      seed: 7,
      ready: false,
      sprinting: false,
      aimingDownSights: true,
      aimFrame: NEUTRAL_AIM,
    };
    const before = session.character.snapshotState();
    expect(session.firearms.fire(shot)).toBe(false);
    expect(session.character.snapshotState()).toEqual(before);
    const zombieType = [...content.zombies.values()][0]!;
    session.zombies.add(zombieType, [0, 1, -3], [0, 0, 1]);
    const hits = vi.spyOn(session.zombies, 'firePellets');
    expect(session.firearms.fire({ ...shot, ready: true })).toBe(true);
    expect(hits).toHaveReturnedWith(expect.objectContaining({ hits: expect.any(Number) }));
    expect(hits.mock.results[0]!.value.hits).toBeGreaterThan(0);
    const expected = ['shot', 'hit'].reduce(
      (sum, activity) => sum + skillActivityPractice(content, snipingId, activity).practice,
      0,
    );
    expect(session.character.practice[snipingId]! - before.practice[snipingId]!).toBeCloseTo(expected);
    expect(session.character.practice[combatId]).toBe(before.practice[combatId]);
    hits.mockRestore();
  });

  it('times long-gun ADS acquisition from Combat alone and clamps it to the ADS-only floor', () => {
    // The fixture authors both regimes: a novice raise above the maximum is clamped to it, and a
    // trained handler's raise under it reads the raise curve unchanged.
    const novice = firearmStanceEffects(0, tuning);
    const expert = firearmStanceEffects(SKILL_LEVEL_MAX, tuning);
    expect(novice.raiseDurationSimSeconds).toBeGreaterThan(tuning.adsAcquisitionMaximumSimSeconds);
    expect(expert.raiseDurationSimSeconds).toBeLessThan(tuning.adsAcquisitionMaximumSimSeconds);
    expect(novice.adsAcquisitionDurationSimSeconds).toBe(tuning.adsAcquisitionMaximumSimSeconds);
    expect(expert.adsAcquisitionDurationSimSeconds).toBe(expert.raiseDurationSimSeconds);
    const measure = (combatTrained: boolean, snipingTrained: boolean) => {
      const runtime = makeRuntime({ content });
      equip(runtime);
      if (combatTrained) {
        train(runtime, combatId);
      }
      if (snipingTrained) {
        train(runtime, snipingId);
      }
      runtime.setReadyHeld(true);
      runtime.advance(90);
      runtime.setAds(true);
      const { uid } = runtime.session.inventory.hands.right!;
      expect(runtime.session.firearms.isAdsAcquired(uid)).toBe(false);
      const frames = acquireAds(runtime);
      // The per-gun stance effect is the authoritative duration the mechanics sampled.
      return {
        seconds: frames / 60,
        expected: runtime.session.firearms.stanceEffectsFor(uid).adsAcquisitionDurationSimSeconds,
      };
    };
    const withinTick = (measured: { seconds: number; expected: number }) => {
      expect(measured.seconds).toBeGreaterThanOrEqual(measured.expected);
      expect(measured.seconds).toBeLessThanOrEqual(measured.expected + 2 / 60);
    };
    const base = measure(false, false);
    const handler = measure(true, false);
    const sniper = measure(false, true);
    withinTick(base);
    withinTick(handler);
    withinTick(sniper);
    expect(handler.expected).toBeLessThan(base.expected);
    expect(handler.seconds).toBeLessThan(base.seconds);
    expect(sniper.expected).toBe(base.expected);
    expect(sniper.seconds).toBe(base.seconds);
  });

  it('cancels incomplete ADS acquisition on release and lost readiness, and re-entry restarts it', () => {
    const partway = Math.max(
      1,
      Math.floor((firearmStanceEffects(0, tuning).adsAcquisitionDurationSimSeconds * 60) / 2),
    );
    const runtime = makeRuntime({ content });
    const rifle = equip(runtime);
    runtime.setReadyHeld(true);
    runtime.advance(90);
    runtime.setAds(true);
    runtime.advance(partway);
    expect(runtime.session.firearms.isAdsAcquired(rifle.uid)).toBe(false);
    const partial = rifle.firearm?.adsAcquiring;
    expect(partial?.elapsedSimSeconds ?? 0).toBeGreaterThan(0);
    runtime.setAds(false);
    runtime.advance(1);
    expect(rifle.firearm?.adsAcquiring).toBeUndefined();
    runtime.setAds(true);
    runtime.advance(1);
    expect(rifle.firearm?.adsAcquiring?.elapsedSimSeconds).toBeCloseTo(1 / 60, 6);
    runtime.advance(partway);
    expect(runtime.session.firearms.isAdsAcquired(rifle.uid)).toBe(false);
    runtime.setReadyHeld(false);
    runtime.advance(1);
    expect(runtime.session.firearms.isReady(rifle.uid)).toBe(false);
    expect(rifle.firearm?.adsAcquiring).toBeUndefined();
    runtime.setAds(false);
    runtime.setReadyHeld(true);
    runtime.advance(90);
    runtime.setAds(true);
    // Re-entry after both cancellations needs the whole acquisition again, not the cancelled remainder.
    const frames = acquireAds(runtime);
    const expected = runtime.session.firearms.stanceEffectsFor(rifle.uid).adsAcquisitionDurationSimSeconds;
    expect(frames / 60).toBeGreaterThanOrEqual(expected);
    expect(frames / 60).toBeLessThanOrEqual(expected + 2 / 60);
  });

  it('resumes saved ADS acquisition progress as an uninterrupted run continues it', async () => {
    const partway = Math.max(
      1,
      Math.floor((firearmStanceEffects(0, tuning).adsAcquisitionDurationSimSeconds * 60) / 2),
    );
    const runtime = makeRuntime({ content });
    equip(runtime);
    runtime.setReadyHeld(true);
    runtime.advance(90);
    runtime.setAds(true);
    runtime.advance(partway);
    const { uid } = runtime.session.inventory.hands.right!;
    expect(runtime.session.firearms.isAdsAcquired(uid)).toBe(false);
    const snapshot = runtime.session.snapshot({ worldId: 'fixture-world', characterId: 'fixture-character' });
    const decoded = await decodeSave(await encodeFixture(snapshot), {
      version: formatVersion,
      contentLookup: (kind, id, item) => contentLookup(content, kind, id, item),
    });
    const resumed = makeRuntime({ content, restore: decoded.snapshot });
    resumed.session.sim.paused = false;
    resumed.setReadyHeld(true);
    resumed.setAds(true);
    expect(resumed.session.inventory.hands.right?.firearm?.adsAcquiring?.elapsedSimSeconds).toBeGreaterThan(0);
    const remainingResumed = acquireAds(resumed);
    const remainingUninterrupted = acquireAds(runtime);
    expect(remainingResumed).toBe(remainingUninterrupted);
    expect(resumed.session.sim.time).toBe(runtime.session.sim.time);
    expect(resumed.session.character.snapshotState()).toEqual(runtime.session.character.snapshotState());
  });
});

describe('held lateral lean', () => {
  const eye = (runtime: ReturnType<typeof makeRuntime>): Vec3 =>
    playerEyePosition({
      feet: runtime.session.body.pos,
      blockSize: BLOCK_SIZE,
      yaw: 0,
      pitch: 0,
      stance: runtime.session.stance,
      figure: registry.figures.get('player')!,
      models: registry.models,
      lean: runtime.session.lean,
    });

  it.each(['standing', 'crouching'] as const)(
    'held Q/E shifts the eye in opposite directions in %s and release returns',
    (stance) => {
      const runtime = makeRuntime();
      runtime.advance(2);
      if (stance === 'crouching') {
        runtime.toggleCrouch();
        runtime.advance(2);
      }
      expect(runtime.session.stance).toBe(stance);
      const base = eye(runtime);
      const feet = [...runtime.session.body.pos];
      runtime.setIntent({ ...IDLE, lean: -1 });
      runtime.advance(60);
      expect(eye(runtime)[0]).toBeLessThan(base[0]);
      runtime.setIntent({ ...IDLE, lean: 1 });
      runtime.advance(60);
      expect(eye(runtime)[0]).toBeGreaterThan(base[0]);
      expect(runtime.session.body.pos).toEqual(feet);
      runtime.setIntent(IDLE);
      runtime.advance(60);
      expect(eye(runtime)).toEqual(base);
    },
  );

  it('sprint clears lean immediately and refuses held lean while sprinting', () => {
    const runtime = makeRuntime();
    runtime.advance(2);
    runtime.setIntent({ ...IDLE, lean: 1 });
    runtime.advance(60);
    expect(runtime.session.leanAmount).toBeGreaterThan(0);
    runtime.setIntent({ ...IDLE, lean: 1, forward: 1, sprint: true });
    runtime.advance(1);
    expect(runtime.session.sprinting).toBe(true);
    expect(runtime.session.leanAmount).toBe(0);
    runtime.advance(10);
    expect(runtime.session.sprinting).toBe(true);
    expect(runtime.session.leanAmount).toBe(0);
  });

  it('prone refuses held lean', () => {
    const runtime = makeRuntime();
    runtime.advance(2);
    runtime.setIntent({ ...IDLE, lean: 1 });
    runtime.toggleProne();
    runtime.advance(60);
    expect(runtime.session.stance).toBe('prone');
    expect(runtime.session.leanAmount).toBe(0);
  });

  it('does not solve an unchanged settled armed lean pose again', () => {
    const runtime = makeRuntime();
    const { inventory } = runtime.session;
    expect(inventory.add(inventory.create(FIREARM_TYPE), { kind: 'hand', side: 'right' })).toBe(true);
    const solve = vi.spyOn(leanCollision, 'playerLeanBoxes');
    try {
      runtime.advance(2);
      runtime.setIntent({ ...IDLE, lean: 1 });
      runtime.advance(Math.ceil(registry.player.get('player')!.lean.enterSimSeconds * 60) + 2);
      expect(runtime.session.leanAmount).toBeGreaterThan(0);
      solve.mockClear();
      runtime.advance(10);
      expect(solve.mock.calls.length).toBe(0);
    } finally {
      solve.mockRestore();
    }
  });

  it('keeps forward and strafe velocity while leaning diagonally', () => {
    const runtime = makeRuntime();
    runtime.setIntent({ ...IDLE, forward: 1, right: 1, lean: 1 });
    runtime.advance(30);
    expect(runtime.session.leanAmount).toBeGreaterThan(0);
    expect(runtime.session.body.vel[0]).toBeGreaterThan(0);
    expect(runtime.session.body.vel[2]).toBeLessThan(0);
    expect(runtime.session.body.vel[0]).toBeCloseTo(-runtime.session.body.vel[2]!);
  });

  it('slows moving lean by its content speed factor', () => {
    const normal = makeRuntime();
    const leaned = makeRuntime();
    for (const runtime of [normal, leaned]) {
      runtime.advance(2);
    }
    leaned.setIntent({ ...IDLE, lean: -1 });
    leaned.advance(60);
    normal.advance(60);
    normal.setIntent({ ...IDLE, forward: 1 });
    leaned.setIntent({ ...IDLE, forward: 1, lean: -1 });
    for (const runtime of [normal, leaned]) {
      runtime.advance(10);
    }
    expect(Math.abs(leaned.session.body.vel[2])).toBeLessThan(Math.abs(normal.session.body.vel[2]));
    expect(Math.abs(leaned.session.body.vel[2] / normal.session.body.vel[2])).toBeCloseTo(
      registry.player.get('player')!.lean.movementSpeedScale,
    );
  });
});

type Runtime = ReturnType<typeof makeRuntime>;
type Session = Runtime['session'];

const horizontalDistance = (from: readonly number[], to: readonly number[]): number =>
  Math.hypot(to[0]! - from[0]!, to[2]! - from[2]!);

const shambler = registry.zombies.get('shambler')!;
const { loot: _loot, ...lootless } = shambler;
// One blow downs it at the torso; its head stays on, so it lies there instead of dying. No limb comes off,
// and its pockets are empty, so anything on the ground came from clearing it.
const FRAGILE: ZombieDef = {
  ...lootless,
  regions: { ...shambler.regions, torso: FISTS_MELEE.damage },
  dismember: { chance: 0, headOnKillChance: 0 },
};

/** Adds a shambler facing -z and downs it with a blow to the chest, as the player would. */
const downShambler = (session: Session, position: Vec3): { id: EntityId; zombie: Zombie } => {
  const id = session.zombies.add(FRAGILE, position, [0, 0, -1]);
  const zombie = session.zombies.store.get(id)!;
  const { blockSize } = makeScale(0.5);
  const chest = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, blockSize)).torso.find(
    (box) => box.bone === 'chest',
  )!.center;
  const origin: Vec3 = [chest[0], chest[1], chest[2] + 0.45 / blockSize];
  if (session.zombies.swing(origin, [0, 0, -1], FISTS_MELEE) !== id || !zombie.incapacitated) {
    throw new Error('The blow did not down the shambler');
  }
  return { id, zombie };
};

describe('attacker modifiers', () => {
  it('applies attacker damage modifiers once at delivery so a stronger hit opens a deeper wound', () => {
    const tuning = registry.body.get('player')!;
    const tier = tuning.bleeding.tiers[0]!;
    const content = {
      ...registry,
      body: new Map([
        [
          'player',
          {
            ...tuning,
            bleeding: {
              ...tuning.bleeding,
              tiers: [0, 10].map((minDamage, index) => ({
                ...tier,
                id: `fixture-tier-${index}`,
                minDamage,
                regionFactor: {},
                chancePerDamage: { blunt: 1, cut: 1, pierce: 1, acid: 0 },
              })),
            },
          },
        ],
      ]),
    };
    const move: ZombieDef['attack']['moves'][number] = {
      id: 'fixture-hit',
      motion: 'swing',
      weight: 1,
      damage: 4,
      damageKind: 'cut',
      hitRegions: [{ region: 'leftArm', weight: 1 }],
    };
    const type: ZombieDef = {
      ...shambler,
      attack: { ...shambler.attack, moves: [move] },
    };
    const strike = (boost: boolean) => {
      const runtime = makeRuntime({ content });
      const { session } = runtime;
      const id = session.zombies.add(type, [1.2, 1, 0], [-1, 0, 0]);
      const zombie = session.zombies.store.get(id)!;
      expect(zombie.modifiers).toEqual([]);
      if (boost) {
        zombie.modifiers.push({ effect: 'attack.damage', multiply: 2, add: 4 });
      }
      const hit = vi.spyOn(session.sim, 'hit');
      const maxFrames = Math.ceil((type.attack.windupSimSeconds + 2) * 60);
      for (let frames = 0; frames < maxFrames && hit.mock.calls.length === 0; frames++) {
        runtime.advance(1);
      }
      expect(hit).toHaveBeenCalledTimes(1);
      expect(hit.mock.calls[0]![2]).toBe('leftArm');
      expect(hit.mock.calls[0]![3]).toEqual({ kind: move.damageKind });
      return { damage: hit.mock.calls[0]![0], bleeding: session.sim.body.bleedingTier('leftArm') };
    };
    const plain = strike(false);
    const boosted = strike(true);
    expect(plain.damage).toBe(move.damage);
    expect(boosted.damage).toBe(move.damage * 2 + 4);
    expect(plain.bleeding).toBe(content.body.get('player')!.bleeding.tiers[0]);
    expect(boosted.bleeding).toBe(content.body.get('player')!.bleeding.tiers[1]);
  });
});

describe('landing injuries', () => {
  const scale = makeScale(0.5);
  const tuning = registry.body.get('player')!.landing;
  const drop = (speed: number, seed = 73) => {
    const gravity = physicsFor(scale).gravity * scale.blockSize;
    const height = speed ** 2 / (2 * gravity);
    const runtime = makeRuntime({ spawn: [0, 1 + height / scale.blockSize, 0], seed });
    const before = runtime.session.sim.body.snapshotState();
    const frames = Math.ceil((speed / gravity + 1) * 60);
    for (let frame = 0; frame < frames && !runtime.session.body.onGround; frame++) {
      runtime.advance(1);
    }
    if (!runtime.session.body.onGround) {
      throw new Error('Fall fixture did not land');
    }
    return { runtime, before, after: runtime.session.sim.body.snapshotState() };
  };

  it('survives low fixture drops even at the maximum landing damage spread', () => {
    const gravity = physicsFor(scale).gravity * scale.blockSize;
    const speed = Math.sqrt(2 * gravity * 4);
    const { health } = makeRuntime().session.sim.body;
    const damage = Math.max(0, speed ** 2 - tuning.safeSpeedMetresPerSimSecond ** 2) * tuning.damagePerSquaredSpeed;
    expect(damage * tuning.damageSpread.max).toBeLessThan(health);
    expect(drop(speed).runtime.session.sim.dead).toBeUndefined();
  });

  it('rolls different survivable landing health losses for different seeds', () => {
    const gravity = physicsFor(scale).gravity * scale.blockSize;
    const speed = Math.sqrt(2 * gravity * 4);
    const losses = [73, 74].map((seed) => {
      const { runtime, before, after } = drop(speed, seed);
      expect(runtime.session.sim.dead).toBeUndefined();
      const loss = before.health - after.health;
      expect(loss).toBeGreaterThan(0);
      return loss;
    });
    expect(losses[0]).not.toBe(losses[1]);
  });

  it('allows high fixture drops to kill or spare full health across the content damage spread', () => {
    const gravity = physicsFor(scale).gravity * scale.blockSize;
    const speed = Math.sqrt(2 * gravity * 12);
    const { health } = makeRuntime().session.sim.body;
    const damage = Math.max(0, speed ** 2 - tuning.safeSpeedMetresPerSimSecond ** 2) * tuning.damagePerSquaredSpeed;
    expect(damage * tuning.damageSpread.min).toBeLessThan(health);
    expect(damage * tuning.damageSpread.max).toBeGreaterThan(health);
  });

  it('leaves the body unchanged after a safe landing', () => {
    const { before, after } = drop(tuning.safeSpeedMetresPerSimSecond / 2);
    expect(after).toEqual(before);
  });

  it('injures the content landing regions once at contact', () => {
    const { runtime, before, after } = drop(tuning.safeSpeedMetresPerSimSecond * 1.2);
    expect(after.health).toBeLessThan(before.health);
    for (const { region } of tuning.regions) {
      expect(after.regionDamage[region]).toBeGreaterThan(0);
    }
    expect(after.pain.acute).toBeGreaterThan(before.pain.acute);
    runtime.advance(1);
    expect(runtime.session.sim.body.regionDamage).toEqual(after.regionDamage);
  });

  it('preserves landing injuries when a saved session is resumed', () => {
    const { runtime, after } = drop(tuning.safeSpeedMetresPerSimSecond * 1.5);
    expect(after.health).toBeLessThan(100);
    const restore = runtime.session.snapshot({ worldId: 'fall-world', characterId: 'fall-character' });
    const resumed = makeRuntime({ restore: structuredClone(restore) });
    expect(resumed.session.sim.body.snapshotState()).toEqual(after);
  });

  it('kills through the existing death path on a sufficiently fast landing', () => {
    const { health } = makeRuntime().session.sim.body;
    const lethalSpeed = Math.sqrt(
      tuning.safeSpeedMetresPerSimSecond ** 2 + health / (tuning.damagePerSquaredSpeed * tuning.damageSpread.min),
    );
    const { runtime } = drop(lethalSpeed * 1.2);
    expect(runtime.session.sim.dead?.cause).toBe(tuning.cause);
  });
});

describe('session movement consequences', () => {
  it('uses a player content override for body, directional pace, lowered stance and aim', () => {
    const tuning = {
      ...PLAYER,
      halfWidth: 0.2,
      height: 2,
      eye: 1.7,
      walk: 2.4,
      movement: { sidewaysSpeedScale: 0.3, backwardSpeedScale: 0.2 },
      crouch: { speedMetresPerSimSecond: 0.8, eyeDropMetres: 0.8, bodyHeightMetres: 1.1 },
      aim: { ...PLAYER.aim, maxOffsetRadians: 0.03 },
    };
    const content = baseRegistryWith([{ source: 'fixture-player', data: { player: [tuning] } }]);
    const runtime = makeRuntime({ content });
    const { session } = runtime;
    const { blockSize } = makeScale(0.5);
    runtime.advance(1);
    expect(session.body.halfWidth * blockSize).toBeCloseTo(tuning.halfWidth);
    expect(session.body.height * blockSize).toBeCloseTo(tuning.height);
    expect(session.playerEyeHeightMetres).toBeCloseTo(tuning.eye);
    runtime.setIntent({ ...IDLE, right: 1, walk: true });
    runtime.advance(1);
    expect(session.body.vel[0] * blockSize).toBeCloseTo(tuning.walk * tuning.movement.sidewaysSpeedScale);
    runtime.toggleCrouch();
    runtime.advance(1);
    expect(session.body.height * blockSize).toBeCloseTo(tuning.crouch.bodyHeightMetres);
    expect(session.playerEyeHeightMetres).toBeCloseTo(tuning.eye - tuning.crouch.eyeDropMetres);
    expect(session.body.vel[0] * blockSize).toBeCloseTo(
      tuning.crouch.speedMetresPerSimSecond * tuning.movement.sidewaysSpeedScale,
    );
    session.aim.recordShot(0, 0.2);
    expect(Math.abs(session.aim.snapshotState().recoilYaw)).toBeCloseTo(tuning.aim.maxOffsetRadians);
    expect(session.aim.pendingViewPitchShift).toBeGreaterThan(0);
  });

  it('slows the same walking intent after leg damage', () => {
    const healthy = makeRuntime();
    const injured = makeRuntime();
    healthy.advance(120);
    injured.advance(120);
    injured.session.sim.hit(60, 'a test injury', 'leftLeg');

    const intent: MoveIntent = { ...IDLE, forward: 1, walk: true };
    healthy.setIntent(intent);
    injured.setIntent(intent);
    const healthyStart = [...healthy.session.body.pos];
    const injuredStart = [...injured.session.body.pos];
    healthy.advance(60);
    injured.advance(60);

    const healthyDistance = horizontalDistance(healthyStart, healthy.session.body.pos);
    const injuredDistance = horizontalDistance(injuredStart, injured.session.body.pos);
    expect(healthyDistance).toBeGreaterThan(0);
    expect(injuredDistance).toBeLessThan(healthyDistance);
  });

  it('feeds the session step clock to the readied-walk aim once per stride', () => {
    const world = new World();
    const stone = registry.blockIds.get('stone')!;
    for (let x = -5; x <= 5; x++) {
      for (let z = -80; z <= 80; z++) {
        world.setBlock(x, 0, z, stone);
      }
    }
    const runtime = makeRuntime({ world });
    const firearm = runtime.session.inventory.create(FIREARM_TYPE);
    expect(runtime.session.inventory.add(firearm, { kind: 'hand', side: 'right' })).toBe(true);
    runtime.setReadyHeld(true);
    runtime.setIntent({ ...IDLE, forward: 1, walk: true });
    runtime.advance(120);
    expect(runtime.session.firearms.isReady(firearm.uid)).toBe(true);

    let observedFootfalls = runtime.footfallCount;
    const signs: number[] = [];
    for (let tick = 0; tick < 480 && signs.length < 4; tick++) {
      runtime.advance(1);
      while (observedFootfalls < runtime.footfallCount) {
        signs.push(Math.sign(runtime.session.aim.frame.yaw));
        observedFootfalls += 1;
      }
    }

    expect(signs.length).toBeGreaterThanOrEqual(4);
    for (let index = 1; index < signs.length; index++) {
      expect(signs[index]).toBe(-signs[index - 1]!);
    }
  });

  it('walks past a downed shambler in a corridor one person wide', () => {
    // Walls at x = -1 and x = 2 leave a corridor two blocks wide, along z.
    const corridor = (x: number, y: number): boolean => y === 0 || ((x === -1 || x === 2) && y >= 1 && y <= 4);
    const runtime = makeRuntime({ isSolid: corridor, spawn: [1, 1, 5] });
    const { session } = runtime;
    const { zombie } = downShambler(session, [1, 1, 1]);
    expect(2).toBeLessThan(2 * (session.body.halfWidth + zombie.body.halfWidth));

    runtime.setIntent({ ...IDLE, forward: 1, walk: true });
    runtime.advance(360);
    expect(session.body.pos[2]).toBeLessThan(zombie.body.pos[2] - zombie.body.halfWidth - session.body.halfWidth);
  });

  it('closes a door over a downed shambler lying in the doorway', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const door = session.entities.add({ type: DOOR_TYPE, pos: [0, 1, -3], size: [2, 4, 1], facing: 'n' })!;
    session.entities.setOpen(door, true);
    const { zombie } = downShambler(session, [1, 1, -2.5]);
    expect(session.entities.bodyIntersects(door, zombie.body)).toBe(true);

    const { handlingSimSeconds } = registry.furniture.get(DOOR_TYPE)!.door!;
    session.queue.enqueueAction(DOOR_ACTION, 'Door', handlingSimSeconds, { entityUid: door.uid, closing: true });
    runtime.advance(Math.ceil((handlingSimSeconds + 0.5) * 60));
    expect(door.open).toBe(false);
  });

  it('does not sprint or drain stamina while crouched with sprint held', () => {
    const runtime = makeRuntime();
    runtime.advance(120);
    runtime.toggleCrouch();
    runtime.setIntent({ ...IDLE, forward: 1, sprint: true });
    const { session } = runtime;
    const { needs } = session.sim;
    const { stamina } = needs;
    runtime.advance(60);

    expect(session.stance).toBe('crouching');
    expect(session.sprinting).toBe(false);
    expect(needs.stamina).toBe(stamina);
  });
});

describe('crouching under a low ceiling', () => {
  const { blockSize } = makeScale(0.5);
  const crouchedBlocks = registry.player.get('player')!.crouch.bodyHeightMetres / blockSize;
  // The lowest whole-block opening above the crouched body.
  const gapBlocks = Math.floor(crouchedBlocks) + 1;
  // A slab over z = -4..-2 leaves that opening above the floor; the player starts south of it, facing it.
  const SlabNear = -1;
  const SlabFar = -4;
  const crawlSpace = (_x: number, y: number, z: number): boolean =>
    y === 0 || (y === 1 + gapBlocks && z >= SlabFar && z < SlabNear);
  const start = (crouched: boolean): Runtime => {
    const runtime = makeRuntime({ isSolid: crawlSpace, spawn: [0, 1, 2] });
    if (crouched) {
      runtime.toggleCrouch();
    }
    runtime.advance(1);
    runtime.setIntent({ ...IDLE, forward: 1, walk: true });
    return runtime;
  };
  /** Walks on until the body is wholly past `z` or `frames` run out. */
  const walkPast = (runtime: Runtime, z: number, frames: number): void => {
    const { body } = runtime.session;
    for (let frame = 0; frame < frames && body.pos[2]! + body.halfWidth > z; frame++) {
      runtime.advance(1);
    }
  };

  it('lets a crouched player through an opening lower than the standing body, and not a standing one', () => {
    expect(gapBlocks).toBeLessThan(PLAYER.height / blockSize);
    const crouched = start(true);
    const standing = start(false);
    walkPast(crouched, SlabFar, 600);
    standing.advance(600);

    expect(crouched.session.body.pos[2]! + crouched.session.body.halfWidth).toBeLessThan(SlabFar);
    // Stopped against the slab's near edge.
    expect(standing.session.body.pos[2]! - standing.session.body.halfWidth).toBeCloseTo(SlabNear, 1);
  });

  it('walks through the authored FOB hole only when stance height fits', () => {
    const { layouts } = JSON.parse(readFileSync(join(BASE, 'layouts-playtest.json'), 'utf8')) as {
      layouts: SiteLayoutDef[];
    };
    const camp = layouts.find(({ buildings }) => buildings.some(({ template }) => template === 'camp_gate'))!;
    const building = camp.buildings.find(({ template }) => template === 'camp_wall_run_crouch_hole')!;
    const wall: Placement = {
      template: compileTemplate(registry, registry.templates.get(building.template)!),
      origin: building.position.map((metres) => metres / BLOCK_SIZE) as Vec3,
      turn: (building.rotation / 90) as Placement['turn'],
    };
    const [wallWidth, wallDepth] = footprint(wall);
    const groundBlock = Math.round(camp.ground / BLOCK_SIZE);
    const wallCellSolid = (x: number, y: number, z: number): boolean => {
      const block = placedBlockAt(wall, [x, y, z]);
      return block !== undefined && registry.blocks[block]?.solid === true;
    };
    const openingZ = Array.from({ length: wallDepth }, (_value, offset) => wall.origin[2] + offset).filter((z) =>
      Array.from({ length: wallWidth }, (_value, offset) => wall.origin[0] + offset).every(
        (x) => !wallCellSolid(x, groundBlock + 1, z),
      ),
    );
    expect(openingZ.length).toBeGreaterThan(0);
    let openingHeightBlocks = 0;
    for (let y = groundBlock + 1; y < wall.origin[1] + wall.template.size[1]; y += 1) {
      if (
        !openingZ.every((z) =>
          Array.from({ length: wallWidth }, (_value, offset) => wall.origin[0] + offset).every(
            (x) => !wallCellSolid(x, y, z),
          ),
        )
      ) {
        break;
      }
      openingHeightBlocks += 1;
    }
    const laneCenterZ = (openingZ[0]! + openingZ.at(-1)! + 1) / 2;
    const walkThrough = (isCrouched: boolean, oneBlockTaller = false) => {
      const isSolid: SolidAt = (x, y, z) => {
        if (
          oneBlockTaller &&
          y === groundBlock + 1 + openingHeightBlocks &&
          openingZ.includes(z) &&
          x >= wall.origin[0] &&
          x < wall.origin[0] + wallWidth
        ) {
          return false;
        }
        if (
          x >= wall.origin[0] &&
          x < wall.origin[0] + wallWidth &&
          z >= wall.origin[2] &&
          z < wall.origin[2] + wallDepth
        ) {
          return wallCellSolid(x, y, z);
        }
        return y <= groundBlock;
      };
      const runtime = makeRuntime({
        isSolid,
        spawn: [wall.origin[0] + wallWidth + 3, groundBlock + 1, laneCenterZ],
        yaw: Math.PI / 2,
      });
      if (isCrouched) {
        runtime.toggleCrouch();
        runtime.advance(1);
      }
      runtime.setIntent({ ...IDLE, forward: 1, walk: true });
      runtime.advance(600);
      const { body } = runtime.session;
      return {
        passed: body.pos[0]! + body.halfWidth < wall.origin[0],
        position: body.pos,
        halfWidth: body.halfWidth,
      };
    };

    const crouched = walkThrough(true);
    const standing = walkThrough(false);
    expect(crouched.passed, `crouched body stopped at ${crouched.position}`).toBe(true);
    expect(crouched.position[1]).toBeCloseTo(groundBlock + 1, 2);
    expect(standing.passed).toBe(false);
    expect(standing.position[0]! - standing.halfWidth).toBeGreaterThanOrEqual(wall.origin[0] + wallWidth - 0.05);

    const crouchedHeight = registry.player.get('player')!.crouch.bodyHeightMetres;
    expect(openingHeightBlocks * BLOCK_SIZE).toBeGreaterThanOrEqual(crouchedHeight);
    expect(
      openingZ.every((z) =>
        Array.from({ length: wallWidth }, (_value, offset) => wall.origin[0] + offset).every((x) =>
          wallCellSolid(x, groundBlock, z),
        ),
      ),
    ).toBe(true);
    expect(openingHeightBlocks * BLOCK_SIZE).toBeLessThan(PLAYER.height);
    expect(openingZ.length * BLOCK_SIZE).toBeGreaterThanOrEqual(PLAYER.halfWidth * 2);
    expect(walkThrough(false, true).passed).toBe(true);
  });

  it('refuses to stand up under the opening, and stands once clear of it', () => {
    const runtime = start(true);
    const { session } = runtime;
    walkPast(runtime, SlabNear, 600);
    runtime.setIntent({ ...IDLE });
    runtime.advance(30);
    runtime.toggleCrouch();
    runtime.advance(1);
    expect(session.stance).toBe('crouching');
    expect(runtime.refusals).toEqual([actionText(registry).play.noRoomToStand]);

    runtime.setIntent({ ...IDLE, forward: 1, walk: true });
    walkPast(runtime, SlabFar, 600);
    runtime.toggleCrouch();
    runtime.advance(1);
    expect(session.stance).toBe('standing');
    expect(runtime.refusals).toHaveLength(1);
  });
});

describe('lying prone', () => {
  const { blockSize } = makeScale(0.5);
  const senses = registry.player.get('player')!;
  const heightOf = {
    standing: PLAYER.height / blockSize,
    crouching: senses.crouch.bodyHeightMetres / blockSize,
    prone: senses.prone.bodyHeightMetres / blockSize,
  };

  it('steps between stances by key, the body height following each stance', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    runtime.advance(1);
    const steps: [() => void, string][] = [
      [runtime.toggleProne, 'prone'],
      [runtime.toggleCrouch, 'crouching'],
      [runtime.toggleProne, 'prone'],
      [runtime.toggleProne, 'crouching'],
      [runtime.toggleCrouch, 'standing'],
      [runtime.toggleCrouch, 'crouching'],
      [runtime.toggleCrouch, 'standing'],
    ];
    for (const [press, stance] of steps) {
      press();
      runtime.advance(1);
      expect(session.stance).toBe(stance);
      expect(session.body.height).toBe(heightOf[session.stance]);
    }
    expect(runtime.refusals).toEqual([]);
  });

  it('refuses a jump while prone, and the same jump lifts the body once it rises to a crouch', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    runtime.toggleProne();
    runtime.advance(60);
    expect(session.body.onGround).toBe(true);
    runtime.setIntent({ ...IDLE, jump: true });
    for (let frame = 0; frame < 30; frame++) {
      runtime.advance(1);
      expect(session.body.onGround).toBe(true);
    }
    runtime.toggleCrouch();
    runtime.advance(10);
    expect(session.stance).toBe('crouching');
    expect(session.body.onGround).toBe(false);
  });

  // A slab over z = -4..-2 leaves the lowest whole-block opening above the prone body; a crouched body can't fit.
  const gapBlocks = Math.floor(heightOf.prone) + 1;
  const SlabNear = -1;
  const SlabFar = -4;
  const crawlSpace = (_x: number, y: number, z: number): boolean =>
    y === 0 || (y === 1 + gapBlocks && z >= SlabFar && z < SlabNear);
  const crawlPast = (runtime: Runtime, z: number): void => {
    const { body } = runtime.session;
    for (let frame = 0; frame < 1200 && body.pos[2]! + body.halfWidth > z; frame++) {
      runtime.advance(1);
    }
  };

  it('crawls under an opening too low to crouch in, refuses to rise beneath it, and rises once clear', () => {
    expect(gapBlocks).toBeLessThan(heightOf.crouching);
    const runtime = makeRuntime({ isSolid: crawlSpace, spawn: [0, 1, 2] });
    const { session } = runtime;
    runtime.toggleProne();
    runtime.advance(1);
    runtime.setIntent({ ...IDLE, forward: 1 });
    crawlPast(runtime, SlabNear);
    runtime.setIntent({ ...IDLE });
    runtime.advance(30);

    runtime.toggleCrouch();
    runtime.advance(1);
    expect(session.stance).toBe('prone');
    runtime.toggleProne();
    runtime.advance(1);
    expect(session.stance).toBe('prone');
    expect(runtime.refusals).toEqual([
      actionText(registry).play.noRoomToCrouch,
      actionText(registry).play.noRoomToCrouch,
    ]);

    runtime.setIntent({ ...IDLE, forward: 1 });
    crawlPast(runtime, SlabFar);
    expect(session.body.pos[2]! + session.body.halfWidth).toBeLessThan(SlabFar);
    runtime.toggleCrouch();
    runtime.advance(1);
    expect(session.stance).toBe('crouching');
    expect(runtime.refusals).toHaveLength(2);
  });
});

describe('clearing a downed shambler', () => {
  const downed = shambler.downed!;
  /** Frames at 60 Hz that cover an action of `simSeconds` with a few handling ticks to spare. */
  const framesFor = (simSeconds: number): number => Math.ceil((simSeconds + 0.5) * 60);
  const groundItems = (session: Session) => [...session.inventory.piles.values()].flatMap((pile) => pile.items);

  it('finishes it off with no tool, ending it as a kill does and leaving nothing behind', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const { id } = downShambler(session, [0, 1, -2]);
    expect(session.clearDownedBody(id, 'finish-off')).toBeUndefined();
    runtime.advance(framesFor(downed.finishOff.simSeconds));
    expect(session.zombies.store.get(id)).toBeUndefined();
    expect(groundItems(session)).toEqual([]);
  });

  it('refuses to dismember it without a tool of the quality', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const { id } = downShambler(session, [0, 1, -2]);
    expect(session.clearDownedBody(id, 'dismember')).toEqual(expect.any(String));
    expect(session.queue.busy).toBe(false);
  });

  it('dismembers it with a tool of the quality, leaving its arms and head behind', () => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const { id, zombie } = downShambler(session, [0, 1, -2]);
    const { quality, level, simSeconds } = downed.dismember;
    const tool = [...registry.items.values()].find((item) => (item.tool?.qualities[quality] ?? 0) >= level)!;
    expect(session.inventory.add(session.inventory.create(tool.id), { kind: 'hand', side: 'right' })).toBe(true);
    expect(session.clearDownedBody(id, 'dismember')).toBeUndefined();
    runtime.advance(framesFor(simSeconds));
    expect(session.zombies.store.get(id)).toBeUndefined();
    expect(zombie.severed).toEqual(expect.arrayContaining(['upperArm.L', 'upperArm.R', 'head']));
    expect(groundItems(session)).toHaveLength(3);
  });

  it.each([
    [
      'cancelled',
      (runtime: Runtime) => runtime.session.queue.cancel(),
      (session: Session) => expect(session.queue.busy).toBe(false),
    ],
    [
      'walked out of reach',
      (runtime: Runtime) => runtime.setIntent({ ...IDLE, forward: -1 }),
      // Still running as it is about to end, with the body beyond reach.
      (session: Session, zombie: Zombie) => {
        expect(session.queue.busy).toBe(true);
        const player = {
          inventory: session.inventory,
          position: session.body.pos,
          blockSize: makeScale(0.5).blockSize,
          clock: session.sim.clock,
        };
        expect(bodyDistance(player, zombie.body)).toBeGreaterThan(reachTuning(session.inventory.registry).reachMetres);
      },
    ],
  ])('leaves the body lying there when finishing it off is %s', (_, interrupt, premise) => {
    const runtime = makeRuntime();
    const { session } = runtime;
    const { id, zombie } = downShambler(session, [0, 1, -2]);
    expect(session.clearDownedBody(id, 'finish-off')).toBeUndefined();
    interrupt(runtime);
    const beforeEnd = Math.floor(downed.finishOff.simSeconds * 60) - 1;
    runtime.advance(beforeEnd);
    premise(session, zombie);
    runtime.advance(framesFor(downed.finishOff.simSeconds) - beforeEnd);
    expect(session.zombies.store.get(id)).toBe(zombie);
    expect(zombie.incapacitated).toBe(true);
  });
});
