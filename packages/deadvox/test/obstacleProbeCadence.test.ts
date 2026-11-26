import { buildRegistry, requireDayCycle } from '@skelly/engine/content';
import { dayPhaseAt, type PlayerSense, simSeconds } from '@skelly/engine/sim';
import type { BashOutcome, Body } from '@skelly/engine/world';
import { BlockEntities, makeScale, type SolidAt, type Vec3 } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { baseContentSources, stackActorFigureFiles } from './baseContentFiles.ts';
import { fixtureMaterials, fixtureSounds } from './economyFixtures.ts';
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
      furnitureMaterials: [{ ...fixtureMaterials()[0], id: 'probe_fixture' }],
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
  overrides: {
    bashObstacle?: (strength: number, kind: string) => BashOutcome | undefined;
    type?: typeof SHAMBLER;
  } = {},
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
    bashObstacle: (ahead, strength, kind) => {
      blows.push(ahead);
      return overrides.bashObstacle?.(strength, kind);
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

it('carries the actor’s authored blow kind to its obstacle owner', () => {
  const kinds: string[] = [];
  const { entities, solid } = doorway();
  chaseHeldUp(entities, solid, SHAMBLER.attack!.cooldownSimSeconds + 1, {
    type: { ...SHAMBLER, bashKind: 'cut' },
    bashObstacle: (_strength, kind) => {
      kinds.push(kind);
      return 'damaged';
    },
  });
  expect(kinds).toContain('cut');
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
    bashObstacle: () => 'damaged',
    type,
  });
  expect(actor.body.pos[2]).toBeGreaterThan(0);
  // The probe wait gates only the probe: blows land on the attack cooldown regardless of the interval.
  expect(blows).toBeGreaterThanOrEqual(Math.floor(seconds / cooldown) - 1);
  expect(blows).toBeLessThanOrEqual(Math.floor(seconds / cooldown) + 2);
  expect(probes).toBeLessThanOrEqual(Math.floor(seconds / interval) + 2);
});

/** What the seal flips and who it tells: the three owners a closure can arrive through. */
type ClosureOwner = 'piece' | 'terrain' | 'vehicle';

/** Closes the gap through its owner: a placed piece, a built terrain block, or vehicle obstruction. */
const sealGap = (
  owner: ClosureOwner,
  entities: BlockEntities,
  seal: { done: boolean; chunk: (cx: number, cy: number, cz: number) => void },
  vehicle: { version: number; boxes: { min: Vec3; max: Vec3 }[] },
): void => {
  if (owner === 'piece') {
    // Two cells deep, like the wall, so no notch of gap stays passable behind it.
    entities.add({ type: 'probe_door', pos: [6, 1, 0], size: [2, 4, 2], facing: 'n' });
    return;
  }
  seal.done = true;
  if (owner === 'terrain') {
    seal.chunk(0, 0, 0);
  } else {
    vehicle.version += 1;
    vehicle.boxes = [{ min: [6, 1, 0], max: [8, 5, 2] }];
  }
};

const ownerOptions = (
  owner: ClosureOwner,
  seal: { chunk: (cx: number, cy: number, cz: number) => void },
  vehicle: { version: number; boxes: { min: Vec3; max: Vec3 }[] },
) => {
  if (owner === 'terrain') {
    return {
      watchChunks: (changed: (cx: number, cy: number, cz: number) => void) => {
        seal.chunk = changed;
        return () => undefined;
      },
    };
  }
  if (owner === 'vehicle') {
    return { vehicleObstruction: { version: () => vehicle.version, boxes: () => vehicle.boxes } };
  }
  return {};
};

/**
 * A chaser presses a door set in a two-cell-deep seamless wall whose only opening, a two-cell gap at x = 6 to
 * x = 7, a probe finds as the way past: the deep wall blocks the slide's left side, so the slide works toward the
 * gap. Once contact has held for a streak of ticks, the gap seals while the contact stays on — with a second door
 * piece, a built terrain block, or vehicle obstruction — through the owner that reports that kind of change, so
 * the very next tick is a held-up actor whose route just closed. `interval` sets the probe wait; everything else
 * is shared.
 */
const closingRoute = (interval: number, owner: ClosureOwner) => {
  const entities = new BlockEntities(registry);
  entities.add({ type: 'probe_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' });
  const seal = { done: false, chunk: (_cx: number, _cy: number, _cz: number): void => undefined };
  const vehicle = { version: 0, boxes: [] as { min: Vec3; max: Vec3 }[] };
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) ||
    (z >= 0 && z <= 1 && y >= 1 && y <= 4 && (!(x >= 6 && x <= 7) || (owner !== 'piece' && seal.done))) ||
    entities.isSolid(x, y, z);
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
      return 'damaged';
    },
    bashableAhead: (ahead) => entities.pieceTouching(ahead) !== undefined,
    standingChanges: {
      mark: () => entities.standing,
      changesSince: (mark) => entities.standingChangesSince(mark),
    },
    ...ownerOptions(owner, seal, vehicle),
  });
  const id = system.add(type, [5, 1, 6], [0, 0, -1]);
  const seconds = SHAMBLER.attack!.cooldownSimSeconds * 6 + 1;
  for (now.frame = 0; now.frame < seconds * 60; now.frame++) {
    const actor = system.store.get(id)!;
    contactStreak = actor.obstacleContact ? contactStreak + 1 : 0;
    if (contactStreak === 5 && sealedAt === undefined) {
      sealedAt = now.frame;
      sealGap(owner, entities, seal, vehicle);
    }
    if (sealedAt !== undefined && blowTicks.length === 0) {
      contactAfterSeal.push(actor.obstacleContact);
    }
    system.tick(1 / 60);
  }
  return { sealedAt, blowTicks, contactAfterSeal, probes: system.wayAroundProbeCount() };
};

for (const owner of ['piece', 'terrain', 'vehicle'] as const satisfies ClosureOwner[]) {
  it(`lands the first blow after ${owner} obstruction closes the way while contact stays on no later than without the probe cooldown`, () => {
    const cooldown = SHAMBLER.attack!.cooldownSimSeconds;
    const withWait = closingRoute(cooldown * 3, owner);
    const withoutWait = closingRoute(cooldown / 100, owner);
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
}

it('keeps a chaser brushing a passable piece on one probe per interval through contact chatter', () => {
  const cooldown = SHAMBLER.attack!.cooldownSimSeconds;
  const interval = cooldown * 3;
  const seconds = cooldown * 6 + 1;
  const entities = new BlockEntities(registry);
  // One wide, deep piece: wider than the way-around reach, so no probe finds an edge to round, and deep, so
  // the ticks it stays passable never let the chaser through to the target behind it.
  entities.add({ type: 'probe_door', pos: [0, 1, 0], size: [18, 4, 10], facing: 'n' });
  const chatter = { frame: 0, on: false };
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
    bashObstacle: () => undefined,
    bashableAhead: (ahead) => entities.pieceTouching(ahead) !== undefined,
    standingChanges: {
      mark: () => entities.standing,
      changesSince: (mark) => entities.standingChangesSince(mark),
    },
  });
  const id = system.add(type, [4.5, 1, 12], [0, 0, -1]);
  const contactAfterArrival: boolean[] = [];
  let arrived = false;
  for (chatter.frame = 0; chatter.frame < seconds * 60; chatter.frame++) {
    const actor = system.store.get(id)!;
    chatter.on = chatter.frame % 2 === 0;
    if (arrived) {
      contactAfterArrival.push(actor.obstacleContact);
    }
    arrived ||= actor.obstacleContact;
    system.tick(1 / 60);
  }
  const actor = system.store.get(id)!;
  // The chatter is real: after the first contact it flips back and forth at the piece, and the actor stays held
  // up on it while the probe path actually runs.
  const flips = contactAfterArrival.slice(1).filter((contact, at) => contact !== contactAfterArrival[at]).length;
  expect(contactAfterArrival.length).toBeGreaterThan(0);
  expect(flips).toBeGreaterThanOrEqual(5);
  expect(actor.body.pos[2]).toBeGreaterThan(-1);
  expect(['chase', 'investigate']).toContain(actor.agent!.mode);
  expect(system.wayAroundProbeCount()).toBeGreaterThan(0);
  expect(system.wayAroundProbeCount()).toBeLessThanOrEqual(Math.floor(seconds / interval) + 2);
});

it('coalesces chunk changes per chunk while actors are frozen and ends a nearby wait after the freeze lifts', () => {
  const cooldown = SHAMBLER.attack!.cooldownSimSeconds;
  const interval = cooldown * 3;
  const entities = new BlockEntities(registry);
  entities.add({ type: 'probe_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' });
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) || (z >= 0 && z <= 1 && y >= 1 && y <= 4 && !(x >= 6 && x <= 7)) || entities.isSolid(x, y, z);
  let chunk: ((cx: number, cy: number, cz: number) => void) | undefined;
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
    bashObstacle: () => undefined,
    bashableAhead: (ahead) => entities.pieceTouching(ahead) !== undefined,
    standingChanges: {
      mark: () => entities.standing,
      changesSince: (mark) => entities.standingChangesSince(mark),
    },
    watchChunks: (changed) => {
      chunk = changed;
      return () => undefined;
    },
  });
  system.add(type, [5, 1, 6], [0, 0, -1]);
  // Run until the first probe has armed the wait at the piece, then freeze the actors mid-wait.
  for (let frame = 0; frame < 600 && system.wayAroundProbeCount() === 0; frame++) {
    system.tick(1 / 60);
  }
  expect(system.wayAroundProbeCount()).toBeGreaterThan(0);
  const probesAtFreeze = system.wayAroundProbeCount();
  system.setFrozen(true);
  // Many terrain edits across two chunks while frozen: pending work stays bounded per distinct chunk.
  for (let edit = 0; edit < 600; edit++) {
    chunk!(0, 0, 0);
    chunk!(1, 0, 0);
  }
  expect(system.pendingChunkChanges()).toBeLessThanOrEqual(2);
  // The freeze ends into an unfrozen tick: the queue drains and the nearby change ends the wait, so the held-up
  // actor probes again this tick instead of waiting out the interval.
  system.setFrozen(false);
  system.tick(1 / 60);
  expect(system.pendingChunkChanges()).toBe(0);
  expect(system.wayAroundProbeCount()).toBeGreaterThan(probesAtFreeze);
});
