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
 * gap. Once the actor drops contact while working that way, the gap seals with a second door piece, so the next
 * contact is a held-up actor whose route just closed. `interval` sets the probe wait; everything else is shared.
 */
const closingRoute = (interval: number) => {
  const entities = new BlockEntities(registry);
  entities.add({ type: 'probe_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' });
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) || (z >= 0 && z <= 1 && y >= 1 && y <= 4 && !(x >= 6 && x <= 7)) || entities.isSolid(x, y, z);
  const blowTicks: number[] = [];
  const now = { frame: 0 };
  let sealedAt: number | undefined;
  let hadContact = false;
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
  });
  const id = system.add(type, [5, 1, 6], [0, 0, -1]);
  const seconds = SHAMBLER.attack!.cooldownSimSeconds * 6 + 1;
  for (now.frame = 0; now.frame < seconds * 60; now.frame++) {
    const actor = system.store.get(id)!;
    if (hadContact && !actor.obstacleContact && sealedAt === undefined) {
      sealedAt = now.frame;
      entities.add({ type: 'probe_door', pos: [6, 1, 0], size: [2, 4, 1], facing: 'n' });
    }
    hadContact ||= actor.obstacleContact;
    system.tick(1 / 60);
  }
  return { sealedAt, blowTicks, probes: system.wayAroundProbeCount() };
};

it('lands the first blow after a way past closes no later than without the probe cooldown', () => {
  const cooldown = SHAMBLER.attack!.cooldownSimSeconds;
  const withWait = closingRoute(cooldown * 3);
  const withoutWait = closingRoute(cooldown / 100);
  // Both runs walk the same steps until the seal, so the seal itself cannot shift between them.
  expect(withWait.sealedAt).toBe(withoutWait.sealedAt);
  const firstBlowAfterSeal = (run: ReturnType<typeof closingRoute>) =>
    run.blowTicks.find((tick) => run.sealedAt !== undefined && tick >= run.sealedAt);
  expect(firstBlowAfterSeal(withoutWait)).toBeDefined();
  expect(firstBlowAfterSeal(withWait)).toBeLessThanOrEqual(firstBlowAfterSeal(withoutWait)! + 2);
  // The wait still spaces the probes while the way stays open: no crowd pays per-tick probing for this clear.
  expect(withWait.probes).toBeLessThanOrEqual(withoutWait.probes);
});
