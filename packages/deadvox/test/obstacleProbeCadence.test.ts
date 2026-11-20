import { buildRegistry, requireDayCycle } from '@skelly/engine/content';
import { dayPhaseAt, type PlayerSense } from '@skelly/engine/sim';
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
const chaseHeldUp = (entities: BlockEntities, solid: SolidAt, seconds: number) => {
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
    bashObstacle: () => false,
    bashableAhead: (ahead) => entities.pieceTouching(ahead) !== undefined,
  });
  const id = system.add({ ...SHAMBLER, strength: 5 }, [5, 1, 6], [0, 0, -1]);
  for (let frame = 0; frame < seconds * 60; frame++) {
    system.tick(1 / 60);
  }
  const actor = system.store.get(id)!;
  return { actor, probes: system.wayAroundProbeCount() };
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
