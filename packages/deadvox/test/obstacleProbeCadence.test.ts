import { buildRegistry, requireDayCycle } from '@skelly/engine/content';
import { dayPhaseAt, type PlayerSense, simSeconds } from '@skelly/engine/sim';
import type { Body } from '@skelly/engine/world';
import { BlockEntities, makeScale, type SolidAt, type Vec3 } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { baseContentSources, stackActorFigureFiles } from './baseContentFiles.ts';
import { FIXTURE_BLOW_SOUND, fixtureSounds } from './economyFixtures.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

// #1957: a held-up actor's way-past probe walks a body ahead per heading, so a crowd held up at one piece must not
// run it every tick. These cases count probes, never wall-clock time, and fail when either gate is taken out.
const { registry, issues } = buildRegistry([
  ...baseContentSources(),
  {
    source: 'probe-fixture',
    data: {
      furnitureMaterials: [
        { id: 'probe_fixture', blowSound: FIXTURE_BLOW_SOUND, drops: { default: FIXTURE_BLOW_SOUND }, methods: [] },
      ],
      sounds: fixtureSounds(),
      furniture: [
        {
          id: 'probe_door',
          name: 'Probe door',
          size: [2, 4, 1],
          color: '#777777',
          material: 'probe_fixture',
          breach: { minimumStrength: 100, durability: 100 },
          door: { methods: {}, handlingSimSeconds: 0.5 },
        },
      ],
    },
  },
]);
const SHAMBLER = registry.actors.get('shambler')!;
const SCALE = makeScale(0.5);
const FLOOR: SolidAt = (_x, y) => y === 0;

/** A wall of terrain along z = 0 whose only gap, x = 4 to x = 5, a door piece fills. */
const doorway = () => {
  const entities = new BlockEntities(registry);
  entities.add({ type: 'probe_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' });
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) || (z === 0 && y >= 1 && y <= 4 && (x < 4 || x > 5)) || entities.isSolid(x, y, z);
  return { entities, solid };
};

/** A shambler chasing a sprinting player beyond a wall at z = 0; its blows on any piece ahead never land. */
const chaseHeldUp = (
  entities: BlockEntities,
  solid: SolidAt,
  seconds: number,
  overrides: { bashObstacle?: () => boolean; type?: typeof SHAMBLER } = {},
) => {
  const blows: Body[] = [];
  const target: Vec3 = [5, 1, -3];
  const sense = (): PlayerSense => ({
    pos: target,
    facing: [0, 0, 1],
    movement: 'sprinting',
    lit: false,
    lightSeenFrom: 40,
    eyeHeightMetres: 1.3,
    stance: 'standing',
  });
  const system = new ActorSystem({
    player: sense,
    isSolid: solid,
    isOpaque: solid,
    dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
    blockSize: SCALE.blockSize,
    physics: physicsFor(SCALE),
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: stackActorFigureFiles(registry),
    hurtPlayer: () => undefined,
    bashObstacle: (ahead) => {
      blows.push(ahead);
      return overrides.bashObstacle ? overrides.bashObstacle() : false;
    },
    bashableAhead: (ahead) => entities.pieceTouching(ahead) !== undefined,
  });
  const id = system.add(overrides.type ?? { ...SHAMBLER, strength: 5 }, [5, 1, 6], [0, 0, -1]);
  for (let frame = 0; frame < seconds * 60; frame++) {
    system.tick(1 / 60);
  }
  const actor = system.store.get(id)!;
  return { actor, probes: system.wayAroundProbeCount(), blows: blows.length };
};

it('builds the probe fixture without issues', () => {
  expect(issues).toEqual([]);
});

it('never probes for a way past bare terrain that holds a chaser up', () => {
  const solid: SolidAt = (x, y, z) => FLOOR(x, y, z) || (z === 0 && y >= 1 && y <= 4);
  const { actor, probes } = chaseHeldUp(new BlockEntities(registry), solid, 10);
  // Held at the wall while still pursuing, so the zero is the ask-first rule and not an idle actor.
  expect(actor.body.pos[2]).toBeLessThanOrEqual(1.6);
  expect(['chase', 'investigate']).toContain(actor.agent!.mode);
  expect(probes).toBe(0);
});

it('spaces a held-up chaser whose blow never lands one probe per content interval, not one per tick', () => {
  const seconds = 6;
  const { entities, solid } = doorway();
  const { actor, probes } = chaseHeldUp(entities, solid, seconds);
  expect(actor.body.pos[2]).toBeGreaterThan(0);
  const interval = SHAMBLER.agent!.wander.wayAroundProbeIntervalSimSeconds;
  expect(probes).toBeGreaterThan(0);
  expect(probes).toBeLessThanOrEqual(Math.floor(seconds / interval) + 2);
});

it('keeps landed blows on the attack cooldown when the probe interval outlasts it', () => {
  const cooldown = SHAMBLER.attack!.cooldownSimSeconds;
  const interval = cooldown * 3;
  const type = {
    ...SHAMBLER,
    agent: {
      ...SHAMBLER.agent!,
      wander: {
        ...SHAMBLER.agent!.wander,
        wayAroundProbeIntervalSimSeconds: simSeconds(interval),
      },
    },
  };
  const seconds = cooldown * 6 + 1;
  const { entities, solid } = doorway();
  const { actor, blows, probes } = chaseHeldUp(entities, solid, seconds, {
    bashObstacle: () => true,
    type,
  });
  expect(actor.body.pos[2]).toBeGreaterThan(0);
  // The probe wait gates only the probe: blows land on the attack cooldown regardless of the interval.
  expect(blows).toBeGreaterThanOrEqual(Math.floor(seconds / cooldown) - 1);
  expect(blows).toBeLessThanOrEqual(Math.floor(seconds / cooldown) + 2);
  expect(probes).toBeLessThanOrEqual(Math.floor(seconds / interval) + 2);
});

/**
 * A chaser presses a door set in a two-cell-deep seamless wall whose only opening, a two-cell gap at x = 6 to
 * x = 7, a probe finds as the way past: the deep wall blocks the slide's left side, so the slide works toward the
 * gap. Once contact has held for a streak of ticks, the gap seals with a second door piece while the contact stays
 * on, so the very next tick is a held-up actor whose route just closed. `interval` sets the probe wait; everything
 * else is shared.
 */
const closingRoute = (interval: number) => {
  const entities = new BlockEntities(registry);
  entities.add({ type: 'probe_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' });
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) || (z >= 0 && z <= 1 && y >= 1 && y <= 4 && !(x >= 6 && x <= 7)) || entities.isSolid(x, y, z);
  const blowTicks: number[] = [];
  const contactAfterSeal: boolean[] = [];
  const now = { frame: 0 };
  let sealedAt: number | undefined;
  let contactStreak = 0;
  const type = {
    ...SHAMBLER,
    agent: {
      ...SHAMBLER.agent!,
      wander: {
        ...SHAMBLER.agent!.wander,
        wayAroundProbeIntervalSimSeconds: simSeconds(interval),
        // No obstacle wander: the seal must be the only thing that can end the wait.
        obstacleWanderChance: 0,
      },
    },
  };
  const target: Vec3 = [6.5, 1, -3];
  const sense = (): PlayerSense => ({
    pos: target,
    facing: [0, 0, 1],
    movement: 'sprinting',
    lit: false,
    lightSeenFrom: 40,
    eyeHeightMetres: 1.3,
    stance: 'standing',
  });
  const system = new ActorSystem({
    player: sense,
    isSolid: solid,
    isOpaque: solid,
    dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
    blockSize: SCALE.blockSize,
    physics: physicsFor(SCALE),
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: stackActorFigureFiles(registry),
    hurtPlayer: () => undefined,
    bashObstacle: () => {
      blowTicks.push(now.frame);
      return true;
    },
    bashableAhead: (ahead) => entities.pieceTouching(ahead) !== undefined,
    standingChanges: {
      mark: () => entities.standing,
      changesSince: (mark) => entities.standingChangesSince(mark),
    },
  });
  const id = system.add(type, [5, 1, 6], [0, 0, -1]);
  const seconds = SHAMBLER.attack!.cooldownSimSeconds * 6 + 1;
  for (now.frame = 0; now.frame < seconds * 60; now.frame++) {
    const actor = system.store.get(id)!;
    contactStreak = actor.obstacleContact ? contactStreak + 1 : 0;
    if (contactStreak === 5 && sealedAt === undefined) {
      sealedAt = now.frame;
      // Two cells deep, like the wall, so no notch of gap stays passable behind it.
      entities.add({ type: 'probe_door', pos: [6, 1, 0], size: [2, 4, 2], facing: 'n' });
    }
    if (sealedAt !== undefined && blowTicks.length === 0) {
      contactAfterSeal.push(actor.obstacleContact);
    }
    system.tick(1 / 60);
  }
  return { sealedAt, blowTicks, contactAfterSeal, probes: system.wayAroundProbeCount() };
};

it('lands the first blow after a way past closes while contact stays on no later than without the probe cooldown', () => {
  const cooldown = SHAMBLER.attack!.cooldownSimSeconds;
  const withWait = closingRoute(cooldown * 3);
  const withoutWait = closingRoute(cooldown / 100);
  // Both runs walk the same steps until the seal, so the seal itself cannot shift between them.
  expect(withWait.sealedAt).toBe(withoutWait.sealedAt);
  // The closure arrives through continuous contact: no lost-contact clear, however the wait ends.
  expect(withWait.contactAfterSeal.length).toBeGreaterThan(0);
  expect(withWait.contactAfterSeal.every((contact) => contact)).toBe(true);
  const firstBlowAfterSeal = (run: ReturnType<typeof closingRoute>) =>
    run.blowTicks.find((tick) => run.sealedAt !== undefined && tick >= run.sealedAt);
  expect(firstBlowAfterSeal(withoutWait)).toBeDefined();
  expect(firstBlowAfterSeal(withWait)).toBeLessThanOrEqual(firstBlowAfterSeal(withoutWait)! + 2);
  // The wait still spaces the probes while the way stays open: one seal, one clear, no crowd pays per-tick probing.
  const interval = cooldown * 3;
  expect(withWait.probes).toBeLessThanOrEqual(Math.floor(withWait.sealedAt! / 60 / interval) + 3);
});

it('keeps a chaser brushing a passable piece on one probe per interval through contact chatter', () => {
  const cooldown = SHAMBLER.attack!.cooldownSimSeconds;
  const interval = cooldown * 3;
  const seconds = cooldown * 6 + 1;
  const entities = new BlockEntities(registry);
  // One wide, deep piece: wider than the way-around reach, so no probe finds an edge to round, and deep, so
  // the ticks it stays passable never let the chaser through to the target behind it.
  entities.add({ type: 'probe_door', pos: [0, 1, 0], size: [18, 4, 10], facing: 'n' });
  const chatter = { frame: 0, on: false, contactSeen: new Set<boolean>() };
  // The piece is solid only every other tick, so wall-ahead contact flickers while the piece stays bashable:
  // brushing past a piece must not turn the tick clock back on its probe wait.
  const solid: SolidAt = (x, y, z) => FLOOR(x, y, z) || (chatter.on && entities.isSolid(x, y, z));
  const target: Vec3 = [4.5, 1, -3];
  const sense = (): PlayerSense => ({
    pos: target,
    facing: [0, 0, 1],
    movement: 'sprinting',
    lit: false,
    lightSeenFrom: 40,
    eyeHeightMetres: 1.3,
    stance: 'standing',
  });
  const type = {
    ...SHAMBLER,
    agent: {
      ...SHAMBLER.agent!,
      wander: {
        ...SHAMBLER.agent!.wander,
        wayAroundProbeIntervalSimSeconds: simSeconds(interval),
        obstacleWanderChance: 0,
      },
    },
  };
  const system = new ActorSystem({
    player: sense,
    isSolid: solid,
    isOpaque: solid,
    dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
    blockSize: SCALE.blockSize,
    physics: physicsFor(SCALE),
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: stackActorFigureFiles(registry),
    hurtPlayer: () => undefined,
    bashObstacle: () => false,
    bashableAhead: (ahead) => entities.pieceTouching(ahead) !== undefined,
    standingChanges: {
      mark: () => entities.standing,
      changesSince: (mark) => entities.standingChangesSince(mark),
    },
  });
  const id = system.add(type, [4.5, 1, 12], [0, 0, -1]);
  for (chatter.frame = 0; chatter.frame < seconds * 60; chatter.frame++) {
    const actor = system.store.get(id)!;
    chatter.on = chatter.frame % 2 === 0;
    if (chatter.frame > 0) {
      chatter.contactSeen.add(actor.obstacleContact);
    }
    system.tick(1 / 60);
  }
  const { contactSeen } = chatter;
  const actor = system.store.get(id)!;
  // The chatter is real: contact both holds and drops at the piece, and the actor stays held up on it.
  expect(contactSeen.has(true)).toBe(true);
  expect(contactSeen.has(false)).toBe(true);
  expect(actor.body.pos[2]).toBeGreaterThan(-1);
  expect(['chase', 'investigate']).toContain(actor.agent!.mode);
  expect(system.wayAroundProbeCount()).toBeLessThanOrEqual(Math.floor(seconds / interval) + 2);
});
