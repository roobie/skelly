import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Body } from '../src/core/body.ts';
import { buildRegistry, type ZombieDef } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { type MeleeProfile, meleeContactTime, meleePoseAndContact, readyMeleePose } from '../src/core/meleePose.ts';
import { SPAWN_NEEDS, STAMINA, stepStamina } from '../src/core/needs.ts';
import { type MeleeActionState, PlayerCombat } from '../src/core/playerCombat.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { makeScale } from '../src/core/scale.ts';
import { zombiePoseInputFor } from '../src/core/zombiePose.ts';
import { posedShamblerRegionBoxes } from '../src/core/zombieRegions.ts';
import { FISTS_MELEE, type MeleeWeapon, type Zombie, ZombieSystem } from '../src/core/zombies.ts';
import {
  resolveMeleeWeapon,
  resolvePlayerMeleeWeapon,
  shouldBlockFromEnGarde,
  shouldEnterMeleeReady,
  startPlayerMelee,
} from '../src/game/melee.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { dayStateAtHour } from './dayPhaseFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { BODY_TUNING_FIXTURE } from './simulationFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const SHAMBLER = registry.zombies.get('shambler')!;
const SCALE = makeScale(0.5);
const BLOCK_SIZE = SCALE.blockSize;
const FLOOR: SolidAt = (_x, y) => y === 0;
const BASE_WEAPON: MeleeWeapon = { damage: 1, reach: 3, cooldown: 0.8, stamina: 4, impulse: 4, type: 'blunt' };
const blockedPlayer = {
  pos: [1000, 1, 1000] as Vec3,
  facing: [1, 0, 0] as Vec3,
  movement: 'still' as const,
  lit: false,
  lightSeenFrom: 40,
};
const playerCombats = new WeakMap<ZombieSystem, PlayerCombat>();
const combatFor = (system: ZombieSystem): PlayerCombat => playerCombats.get(system)!;
const makeSystem = (
  isSolid: SolidAt = FLOOR,
  results: string[] = [],
  sounds: string[] = [],
  options: { weaponHits?: number[]; seed?: number } = {},
) => {
  const { weaponHits = [], seed = 0 } = options;
  const system = new ZombieSystem({
    seed,
    player: () => blockedPlayer,
    isSolid,
    isOpaque: isSolid,
    blockSize: BLOCK_SIZE,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    dayPhase: () => dayStateAtHour(12),
    hurtPlayer: () => undefined,
    onMeleeResult: (result) => results.push(result.id === undefined ? 'miss' : 'hit'),
    onSound: (event) => sounds.push(event),
  });
  playerCombats.set(system, new PlayerCombat(system, (uid) => weaponHits.push(uid)));
  return system;
};

const makeTarget = (system: ZombieSystem, type: ZombieDef = SHAMBLER) => {
  const id = system.add(type, [0, 1, 4], [0, 0, 1]);
  const zombie = system.store.get(id)!;
  zombie.body.onGround = true;
  system.setFrozen(true);
  return { id, zombie };
};

const regionRay = (
  zombie: Zombie,
  id: number,
  region: 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg',
): { origin: Vec3; direction: Vec3 } => {
  const posed = posedShamblerRegionBoxes(zombiePoseInputFor(zombie, id, BLOCK_SIZE));
  const box = region === 'head' ? posed.head.find((candidate) => candidate.bone === 'head')! : posed[region][0]!;
  const { center } = box;
  const front = [-zombie.facing[0], 0, -zombie.facing[2]] as Vec3;
  const origin: Vec3 = [
    center[0] + (front[0] * 0.75) / BLOCK_SIZE,
    center[1] + 1,
    center[2] + (front[2] * 0.75) / BLOCK_SIZE,
  ];
  const delta: Vec3 = [center[0] - origin[0], center[1] - origin[1], center[2] - origin[2]];
  const length = Math.hypot(...delta);
  return { origin, direction: delta.map((value) => value / length) as Vec3 };
};
const headRay = (zombie: Zombie, id: number) => regionRay(zombie, id, 'head');

const start = (
  system: ZombieSystem,
  ray: { origin: Vec3; direction: Vec3 },
  profile: MeleeProfile = 'blunt',
  weapon: MeleeWeapon = BASE_WEAPON,
) =>
  combatFor(system).beginMeleeSwing({
    ...ray,
    weapon,
    profile,
    hand: 'right',
    twoHanded: false,
    hands: { right: 11, left: null },
  });

const advance = (
  system: ZombieSystem,
  time: number,
  hands: { right: number | null; left: number | null } = { right: 11, left: null },
) => {
  combatFor(system).tick(time, hands);
  system.tick(time, 0);
};

const actionPose = (overrides: Partial<MeleeActionState> = {}): MeleeActionState => ({
  profile: 'blunt',
  hand: 'right',
  twoHanded: false,
  cooldown: 0.8,
  contactAt: 0.25,
  aimYaw: 0.7,
  aimPitch: -0.3,
  elapsed: 0,
  hitResolved: false,
  origin: [1, 2, 3],
  direction: [0, 0, -1],
  hands: { right: 11, left: null },
  weapon: BASE_WEAPON,
  ...overrides,
});

describe('melee pose and contact contract', () => {
  it('reports one weapon-wear event at confirmed contact and none on a miss', () => {
    const hits: number[] = [];
    const system = makeSystem(FLOOR, [], [], { weaponHits: hits });
    const target = makeTarget(system);
    const ray = headRay(target.zombie, target.id);
    expect(start(system, ray, 'blunt', BASE_WEAPON)).toBe(true);
    advance(system, 0.25);
    advance(system, 0.8);
    expect(hits).toEqual([11]);

    const misses: number[] = [];
    const missSystem = makeSystem(FLOOR, [], [], { weaponHits: misses });
    expect(start(missSystem, { origin: [100, 2, 100], direction: [1, 0, 0] })).toBe(true);
    advance(missSystem, 0.25);
    expect(misses).toEqual([]);
  });

  it('caps contact wind-up and shares the click-locked contact ray with the displayed pose', () => {
    expect(meleeContactTime(0.8)).toBe(0.25);
    expect(meleeContactTime(1.1)).toBe(0.25);
    expect(meleeContactTime(0.5)).toBe(0.2);
    const action = actionPose({ profile: 'pierce', contactAt: meleeContactTime(0.8) });
    expect(meleePoseAndContact(action, 0.24, false).contactRay).toBeUndefined();
    const contact = meleePoseAndContact(action, action.contactAt, false);
    expect(contact.contactRay).toEqual({ origin: [1, 2, 3], direction: [0, 0, -1] });
    expect(contact.viewOrientation).toEqual({ yaw: 0.7, pitch: -0.3 });
    expect(contact.right.offset[2]).toBeLessThan(0);
    expect(meleePoseAndContact({ ...action, hitResolved: true }, action.contactAt, false).contactRay).toBeUndefined();
  });

  it('enters ready only for held right mouse with a melee item or empty hands, outside debug build and locks', () => {
    const input = {
      rightMouseHeld: true,
      meleeWeaponHeld: true,
      handsEmpty: false,
      debugBuild: false,
      inputLocked: false,
    };
    expect(shouldEnterMeleeReady(input)).toBe(true);
    expect(shouldEnterMeleeReady({ ...input, rightMouseHeld: false })).toBe(false);
    expect(shouldEnterMeleeReady({ ...input, meleeWeaponHeld: false })).toBe(false);
    expect(shouldEnterMeleeReady({ ...input, meleeWeaponHeld: false, handsEmpty: true })).toBe(true);
    expect(shouldEnterMeleeReady({ ...input, debugBuild: true })).toBe(false);
    expect(shouldEnterMeleeReady({ ...input, inputLocked: true })).toBe(false);
  });

  it('requires S as well as en-garde to attempt a block', () => {
    expect(shouldBlockFromEnGarde(true, false)).toBe(false);
    expect(shouldBlockFromEnGarde(false, true)).toBe(false);
    expect(shouldBlockFromEnGarde(true, true)).toBe(true);
  });

  it('shows a ready pose only when the right-mouse state is active and keeps it within its rest bounds', () => {
    expect(readyMeleePose(false).right.offset).toEqual([0, 0, 0]);
    expect(readyMeleePose(false).left.offset).toEqual([0, 0, 0]);
    const ready = readyMeleePose(true);
    for (const side of ['right', 'left'] as const) {
      expect(ready[side].offset).not.toEqual([0, 0, 0]);
      expect(Math.hypot(...ready[side].offset)).toBeLessThan(0.1);
      expect(Math.hypot(...ready[side].rotation)).toBeLessThan((45 * Math.PI) / 180);
    }
  });

  it('eases fist-only torso yaw to 30 degrees at contact and back to the unchanged rest pose', () => {
    for (const side of ['right', 'left'] as const) {
      const action = actionPose({ profile: 'fists', hand: side });
      const startPose = meleePoseAndContact(action, 0, false);
      const contactPose = meleePoseAndContact(action, action.contactAt, false);
      const restPose = meleePoseAndContact(action, action.cooldown, false);
      expect(startPose.torsoYaw).toBe(0);
      expect(contactPose.torsoYaw! * (side === 'right' ? 1 : -1)).toBeCloseTo(Math.PI / 6);
      expect(restPose.torsoYaw).toBe(0);
      expect(restPose.right.offset).toEqual([0, 0, 0]);
      expect(restPose.left.offset).toEqual([0, 0, 0]);
      for (const pose of [startPose, contactPose, restPose]) {
        expect(pose.viewOrientation).toEqual({ yaw: action.aimYaw, pitch: action.aimPitch });
      }
    }
  });
});

describe('player melee action', () => {
  it('does no damage before contact, then resolves exactly once at the bounded contact tick using click-time aim', () => {
    const results: string[] = [];
    const system = makeSystem(FLOOR, results);
    const { id, zombie } = makeTarget(system);
    const ray = headRay(zombie, id);
    expect(system.aimAt(ray.origin, ray.direction, BASE_WEAPON)?.inReach).toBe(true);
    const initialHealth = zombie.regions.head;
    const needs = { stamina: 100, staminaRegenDelayRemainingSimSeconds: 0 };
    expect(
      startPlayerMelee(combatFor(system), needs, {
        ...ray,
        weapon: BASE_WEAPON,
        profile: 'blunt',
        hand: 'right',
        twoHanded: false,
        hands: { right: 11, left: null },
      }),
    ).toBe('started');
    expect(needs.stamina).toBe(96);
    expect(zombie.regions.head).toBe(initialHealth);
    expect(combatFor(system).activeMeleeAction?.contactAt).toBe(Math.min(0.4 * BASE_WEAPON.cooldown, 0.25));

    // The player turns more than 30 degrees; the in-flight action keeps its captured ray.
    const turnedDirection: Vec3 = [1, 0, 0];
    expect(
      Math.acos(
        ray.direction[0] * turnedDirection[0] +
          ray.direction[1] * turnedDirection[1] +
          ray.direction[2] * turnedDirection[2],
      ),
    ).toBeGreaterThan(Math.PI / 6);
    for (let tick = 0; tick < 4; tick++) {
      advance(system, 0.05);
    }
    expect(zombie.regions.head).toBe(initialHealth);
    expect(results).toEqual([]);
    advance(system, 0.05);
    expect(zombie.regions.head).toBe(initialHealth - BASE_WEAPON.damage);
    expect(results).toEqual(['hit']);
    for (let tick = 0; tick < 16; tick++) {
      advance(system, 0.05);
    }
    expect(zombie.regions.head).toBe(initialHealth - BASE_WEAPON.damage);
    expect(results).toHaveLength(1);
    expect(combatFor(system).snapshotState().playerAttackWait).toBe(0);
  });

  it('routes immediate geometry queries through the shared resolver without owning continuation state', () => {
    const system = makeSystem();
    const { id, zombie } = makeTarget(system);
    const ray = headRay(zombie, id);
    const internal = system as unknown as {
      resolveMeleeNow: (origin: Vec3, direction: Vec3, weapon: MeleeWeapon) => number | undefined;
    };
    const resolve = internal.resolveMeleeNow.bind(system);
    let resolvedThroughSharedPath = false;
    internal.resolveMeleeNow = (origin, direction, weapon) => {
      resolvedThroughSharedPath = true;
      return resolve(origin, direction, weapon);
    };

    expect(system.swing(ray.origin, ray.direction, BASE_WEAPON)).toBe(id);
    expect(resolvedThroughSharedPath).toBe(true);
  });

  it('refuses a zero-stamina swing even when its weapon has no stamina cost', () => {
    const needs = { ...SPAWN_NEEDS };
    stepStamina(needs, needs.stamina / -STAMINA.sprint + 1, true);
    expect(needs.stamina).toBe(0);
    const system = makeSystem();
    const missRay = { origin: [0, 2, 2] as Vec3, direction: [1, 0, 0] as Vec3 };

    expect(
      startPlayerMelee(combatFor(system), needs, {
        ...missRay,
        weapon: { ...BASE_WEAPON, stamina: 0 },
        profile: 'blunt',
        twoHanded: false,
        hands: { right: 11, left: null },
      }),
    ).toBe('too-tired');
    expect(combatFor(system).activeMeleeAction).toBeUndefined();
    expect(needs.stamina).toBe(0);
  });

  it('starts the authored regeneration delay when a melee cost empties stamina', () => {
    const needs = { stamina: BASE_WEAPON.stamina!, staminaRegenDelayRemainingSimSeconds: 0 };
    const system = makeSystem();
    const missRay = { origin: [0, 2, 2] as Vec3, direction: [1, 0, 0] as Vec3 };

    expect(
      startPlayerMelee(
        combatFor(system),
        needs,
        {
          ...missRay,
          weapon: BASE_WEAPON,
          profile: 'blunt',
          twoHanded: false,
          hands: { right: 11, left: null },
        },
        BODY_TUNING_FIXTURE.staminaRegenDelaySimSeconds,
      ),
    ).toBe('started');
    expect(needs.stamina).toBe(0);
    expect(needs.staminaRegenDelayRemainingSimSeconds).toBe(BODY_TUNING_FIXTURE.staminaRegenDelaySimSeconds);
  });

  it('spends stamina and cooldown on a miss or wall impact, but refuses tired and overlapping starts', () => {
    const results: string[] = [];
    const sounds: string[] = [];
    const missSystem = makeSystem(FLOOR, results, sounds);
    makeTarget(missSystem);
    const missRay = { origin: [0, 2, 2] as Vec3, direction: [1, 0, 0] as Vec3 };
    const needs = { stamina: 3, staminaRegenDelayRemainingSimSeconds: 0 };
    expect(
      startPlayerMelee(combatFor(missSystem), needs, {
        ...missRay,
        weapon: BASE_WEAPON,
        profile: 'fists',
        twoHanded: false,
        hands: { right: 11, left: null },
      }),
    ).toBe('too-tired');
    expect(needs.stamina).toBe(3);
    expect(combatFor(missSystem).activeMeleeAction).toBeUndefined();
    needs.stamina = 100;
    expect(
      startPlayerMelee(combatFor(missSystem), needs, {
        ...missRay,
        weapon: BASE_WEAPON,
        profile: 'blunt',
        hand: 'right',
        twoHanded: false,
        hands: { right: 11, left: null },
      }),
    ).toBe('started');
    expect(needs.stamina).toBe(96);
    expect(start(missSystem, missRay)).toBe(false);
    expect(needs.stamina).toBe(96);
    for (let tick = 0; tick < 5; tick++) {
      advance(missSystem, 0.05);
    }
    expect(results).toEqual(['miss']);
    expect(sounds).toContain('melee_swing');
    expect(sounds).not.toContain('melee_hit');
    expect(combatFor(missSystem).snapshotState().playerAttackWait).toBeCloseTo(0.55);

    const unblocked = makeSystem();
    const { id, zombie: target } = makeTarget(unblocked);
    const ray = headRay(target, id);
    const aim = unblocked.aimAt(ray.origin, ray.direction, BASE_WEAPON)!;
    const midDistanceBlocks = (aim.distanceMetres / BLOCK_SIZE) * 0.5;
    const wallPoint = ray.origin.map((value, axis) => value + ray.direction[axis]! * midDistanceBlocks);
    const wallCell = wallPoint.map(Math.floor);
    const solid = (x: number, y: number, z: number) =>
      y === 0 || (x === wallCell[0] && y === wallCell[1] && z === wallCell[2]);
    const wallResults: string[] = [];
    const wallSystem = makeSystem(solid, wallResults);
    const wallTarget = makeTarget(wallSystem);
    const wallRay = headRay(wallTarget.zombie, wallTarget.id);
    expect(wallSystem.aimAt(wallRay.origin, wallRay.direction, BASE_WEAPON)).toBeUndefined();
    expect(start(wallSystem, wallRay)).toBe(true);
    for (let tick = 0; tick < 5; tick++) {
      advance(wallSystem, 0.05);
    }
    expect(wallResults).toEqual(['miss']);
    expect(wallTarget.zombie.regions.head).toBe(SHAMBLER.regions.head);
    expect(combatFor(wallSystem).snapshotState().playerAttackWait).toBeCloseTo(0.55);
  });

  it.each([
    { profile: 'fists' as const, expected: 'melee_hit_fist', weapon: FISTS_MELEE, hands: { right: null, left: null } },
    { profile: 'blunt' as const, expected: 'melee_hit', weapon: BASE_WEAPON, hands: { right: 11, left: null } },
  ])('preserves $profile hit sound through live ticks and restored actions', ({ profile, expected, weapon, hands }) => {
    const originalSounds: string[] = [];
    const original = makeSystem(FLOOR, [], originalSounds);
    const { id, zombie } = makeTarget(original);
    const ray = headRay(zombie, id);
    expect(combatFor(original).beginMeleeSwing({ ...ray, weapon, profile, twoHanded: false, hands })).toBe(true);
    for (let tick = 0; tick < 4; tick++) {
      advance(original, 0.05, hands);
    }

    const restoredSounds: string[] = [];
    const restored = makeSystem(FLOOR, [], restoredSounds);
    restored.restoreState(original.snapshotState(), (type) => (type === SHAMBLER.id ? SHAMBLER : undefined));
    combatFor(restored).restoreState(combatFor(original).snapshotState());
    restored.setFrozen(true);
    advance(original, 0.05, hands);
    advance(restored, 0.05, hands);
    for (const sounds of [originalSounds, restoredSounds]) {
      expect(sounds.filter((event) => event === 'melee_hit' || event === 'melee_hit_fist')).toEqual([expected]);
    }
  });

  it('saves the remaining phase, hits once after restore, alternates fists, and cancels when hands change', () => {
    const originalResults: string[] = [];
    const original = makeSystem(FLOOR, originalResults);
    const { id, zombie } = makeTarget(original);
    const ray = headRay(zombie, id);
    expect(start(original, ray)).toBe(true);
    for (let tick = 0; tick < 4; tick++) {
      advance(original, 0.05);
    }
    const initialHealth = zombie.regions.head;
    const state = original.snapshotState();
    const actionState = combatFor(original).snapshotState();
    const restoredResults: string[] = [];
    const restored = makeSystem(FLOOR, restoredResults);
    restored.restoreState(state, (type) => (type === SHAMBLER.id ? SHAMBLER : undefined));
    combatFor(restored).restoreState(actionState);
    restored.setFrozen(true);
    expect(combatFor(restored).activeMeleeAction?.elapsed).toBe(0.2);
    for (const system of [original, restored]) {
      advance(system, 0.05);
      expect(system.store.get(id)?.regions.head).toBe(initialHealth - BASE_WEAPON.damage);
      for (let tick = 0; tick < 16; tick++) {
        advance(system, 0.05);
      }
    }
    expect(originalResults).toHaveLength(1);
    expect(restoredResults).toHaveLength(1);

    const first: MeleeWeapon = FISTS_MELEE;
    const heldOffhand = makeSystem();
    expect(
      combatFor(heldOffhand).beginMeleeSwing({
        ...ray,
        weapon: first,
        profile: 'fists',
        hand: 'right',
        twoHanded: false,
        hands: { right: null, left: 12 },
      }),
    ).toBe(true);
    expect(combatFor(heldOffhand).activeMeleeAction?.hand).toBe('right');
    for (let tick = 0; tick < 16; tick++) {
      advance(heldOffhand, 0.05, { right: null, left: 12 });
    }
    expect(
      combatFor(heldOffhand).beginMeleeSwing({
        ...ray,
        weapon: first,
        profile: 'fists',
        twoHanded: false,
        hands: { right: null, left: null },
      }),
    ).toBe(true);
    expect(
      combatFor(heldOffhand).activeMeleeAction?.hand,
      'a right-only jab does not consume the next alternating fist',
    ).toBe('right');

    const fists = makeSystem();
    expect(
      combatFor(fists).beginMeleeSwing({
        ...ray,
        weapon: first,
        profile: 'fists',
        twoHanded: false,
        hands: { right: null, left: null },
      }),
    ).toBe(true);
    expect(combatFor(fists).activeMeleeAction?.hand).toBe('right');
    for (let tick = 0; tick < 16; tick++) {
      advance(fists, 0.05, { right: null, left: null });
    }
    expect(
      combatFor(fists).beginMeleeSwing({
        ...ray,
        weapon: first,
        profile: 'fists',
        twoHanded: false,
        hands: { right: null, left: null },
      }),
    ).toBe(true);
    expect(combatFor(fists).activeMeleeAction?.hand).toBe('left');

    const swapping = makeSystem();
    const { id: swapId, zombie: swapTarget } = makeTarget(swapping);
    expect(start(swapping, headRay(swapTarget, swapId))).toBe(true);
    const health = swapTarget.regions.head;
    advance(swapping, 0.1, { right: 12, left: null });
    expect(combatFor(swapping).activeMeleeAction).toBeUndefined();
    for (let tick = 0; tick < 10; tick++) {
      advance(swapping, 0.1, { right: 12, left: null });
    }
    expect(swapTarget.regions.head).toBe(health);
    expect(combatFor(swapping).snapshotState().playerAttackWait).toBe(0);
  });

  it('applies injured-arm cooldown slowdown to fist swings', () => {
    const uninjured = resolvePlayerMeleeWeapon(FISTS_MELEE, undefined, 1);
    const injuredBody = new Body(BODY_TUNING_FIXTURE);
    injuredBody.impact(1, 'rightArm');
    const injured = resolvePlayerMeleeWeapon(FISTS_MELEE, undefined, injuredBody.consequences.swingSlowdown);

    expect(injured.cooldown).toBeGreaterThan(uninjured.cooldown);
  });

  it('keeps the weapon-class contact defaults ordered', () => {
    const blunt = registry.meleeClasses.get('blunt')!;
    const cut = registry.meleeClasses.get('cut')!;
    const pierce = registry.meleeClasses.get('pierce')!;

    expect(blunt.damageVariance).toBeLessThan(cut.damageVariance);
    expect(cut.damageVariance).toBeLessThan(pierce.damageVariance);
    expect(blunt.headDamageMultiplier).toBeGreaterThan(cut.headDamageMultiplier);
    expect(blunt.headDamageMultiplier).toBeGreaterThan(pierce.headDamageMultiplier);
    expect(cut.limbDamageMultiplier).toBeGreaterThan(blunt.limbDamageMultiplier);
    expect(cut.limbDamageMultiplier).toBeGreaterThan(pierce.limbDamageMultiplier);
    const base = { damage: 1, reach: 3, cooldown: 1 };
    const bluntCooldown = resolveMeleeWeapon({ ...base, type: 'blunt' }, blunt).cooldown;
    const cutCooldown = resolveMeleeWeapon({ ...base, type: 'cut' }, cut).cooldown;
    const pierceCooldown = resolveMeleeWeapon({ ...base, type: 'pierce' }, pierce).cooldown;
    expect(pierceCooldown).toBeLessThan(cutCooldown);
    expect(cutCooldown).toBeLessThan(bluntCooldown);
    const overridden = resolveMeleeWeapon(
      {
        ...base,
        type: 'blunt',
        damageVariance: 0,
        headDamageMultiplier: 2.5,
        limbDamageMultiplier: 0.75,
        speedMultiplier: 2,
      },
      blunt,
    );
    expect(overridden).toMatchObject({
      damageVariance: 0,
      headDamageMultiplier: 2.5,
      limbDamageMultiplier: 0.75,
      speedMultiplier: 2,
      cooldown: 0.5,
    });
  });

  it('blunt contact takes fewer head hits on average', () => {
    const withoutDismemberment: ZombieDef = {
      ...SHAMBLER,
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    const hitsToKill = (type: 'blunt' | 'cut' | 'pierce', seed: number): number => {
      const system = makeSystem(FLOOR, [], [], { seed });
      const { id, zombie } = makeTarget(system, withoutDismemberment);
      const weapon = resolveMeleeWeapon({ damage: 20, reach: 3, cooldown: 1, type }, registry.meleeClasses.get(type)!);
      let hits = 0;
      while (system.store.get(id) && hits < 10) {
        const ray = headRay(zombie, id);
        system.swing(ray.origin, ray.direction, weapon);
        hits += 1;
      }
      return hits;
    };
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const average = (type: 'blunt' | 'cut' | 'pierce') =>
      seeds.reduce((total, seed) => total + hitsToKill(type, seed), 0) / seeds.length;

    expect(average('blunt')).toBeLessThan(average('cut'));
    expect(average('blunt')).toBeLessThan(average('pierce'));
  });

  it('cut contact severs a limb where equal blunt damage does not', () => {
    const withoutDismemberment: ZombieDef = {
      ...SHAMBLER,
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    const armHealth = SHAMBLER.regions.leftArm;
    const bluntScale = registry.meleeClasses.get('blunt')!.limbDamageMultiplier;
    const cutScale = registry.meleeClasses.get('cut')!.limbDamageMultiplier;
    const sameBaseDamage = armHealth / ((bluntScale + cutScale) / 2);
    const remainingArm = (type: 'blunt' | 'cut'): number => {
      const system = makeSystem();
      const { id, zombie } = makeTarget(system, withoutDismemberment);
      const weapon = resolveMeleeWeapon(
        { damage: sameBaseDamage, damageVariance: 0, reach: 3, cooldown: 1, type },
        registry.meleeClasses.get(type)!,
      );
      const ray = regionRay(zombie, id, 'leftArm');
      system.swing(ray.origin, ray.direction, weapon);
      return zombie.regions.leftArm;
    };

    expect(remainingArm('cut')).toBe(0);
    expect(remainingArm('blunt')).toBeGreaterThan(0);
  });

  it('keeps the dismemberment stream aligned when damage spread is zero', () => {
    const withoutDismemberment: ZombieDef = {
      ...SHAMBLER,
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    const hitWithVariance = (damageVariance: number) => {
      const system = makeSystem(FLOOR, [], [], { seed: 419 });
      const { id, zombie } = makeTarget(system, withoutDismemberment);
      const ray = regionRay(zombie, id, 'torso');
      const weapon = resolveMeleeWeapon(
        { damage: 1, reach: 3, cooldown: 1, type: 'blunt', damageVariance },
        registry.meleeClasses.get('blunt')!,
      );
      expect(system.swing(ray.origin, ray.direction, weapon)).toBe(id);
      return zombie.dismemberRng.state();
    };

    expect(hitWithVariance(0)).toEqual(hitWithVariance(registry.meleeClasses.get('blunt')!.damageVariance));
  });

  it('pierce contact has the widest seeded damage spread', () => {
    const withoutDismemberment: ZombieDef = {
      ...SHAMBLER,
      dismember: { chance: 0, headOnKillChance: 0 },
    };
    const contactDamage = (type: 'blunt' | 'cut' | 'pierce', seed: number, damageVariance?: number): number => {
      const system = makeSystem(FLOOR, [], [], { seed });
      const { id, zombie } = makeTarget(system, withoutDismemberment);
      const weapon = resolveMeleeWeapon(
        {
          damage: 10,
          reach: 3,
          cooldown: 1,
          type,
          ...(damageVariance === undefined ? {} : { damageVariance }),
        },
        registry.meleeClasses.get(type)!,
      );
      const ray = regionRay(zombie, id, 'torso');
      system.swing(ray.origin, ray.direction, weapon);
      return SHAMBLER.regions.torso - zombie.regions.torso;
    };
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const span = (type: 'blunt' | 'cut' | 'pierce') => {
      const samples = seeds.map((seed) => contactDamage(type, seed));
      return Math.max(...samples) - Math.min(...samples);
    };

    expect(span('blunt')).toBeLessThan(span('cut'));
    expect(span('cut')).toBeLessThan(span('pierce'));
    expect(contactDamage('pierce', 31, 0)).toBe(10);
    expect(contactDamage('pierce', 31)).toBe(contactDamage('pierce', 31));
  });
});
