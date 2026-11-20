import { buildRegistry, requireDayCycle } from '@skelly/engine/content';
import { type Actor, dayPhaseAt, type PlayerSense } from '@skelly/engine/sim';
import { BlockEntities, makeScale, type SolidAt, type Vec3 } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { baseContentSources, stackActorFigureFiles } from './baseContentFiles.ts';
import { FIXTURE_BLOW_SOUND, fixtureSounds } from './economyFixtures.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

// A member bashing a door at the sound still has something to attack there, so its horde keeps the commitment.
const { registry, issues } = buildRegistry([
  ...baseContentSources(),
  {
    source: 'horde-bash-fixture',
    data: {
      furnitureMaterials: [
        { id: 'bash_fixture', blowSound: FIXTURE_BLOW_SOUND, drops: { default: FIXTURE_BLOW_SOUND }, methods: [] },
      ],
      sounds: fixtureSounds(),
      furniture: [
        {
          id: 'bash_door',
          name: 'Bash door',
          size: [2, 4, 1],
          color: '#777777',
          material: 'bash_fixture',
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
const BACKGROUND_SIM_SECONDS = 0.5;

it('builds the bash fixture without issues', () => {
  expect(issues).toEqual([]);
});

it('keeps a horde committed to a hum while a member bashes the door that holds it from the source', () => {
  // A wall along z = 0 whose only gap, x = 4 to x = 5, a door fills; the hum sounds beyond it.
  const entities = new BlockEntities(registry);
  entities.add({ type: 'bash_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' });
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) || (z === 0 && y >= 1 && y <= 4 && (x < 4 || x > 5)) || entities.isSolid(x, y, z);
  const { hearing, hordeArrivalStallSimSeconds } = SHAMBLER.agent!;
  const home: Vec3 = [5, 1, 6];
  const hum = { key: 'fixture-plant', pos: [5, 1, -14] as Vec3, radiusMetres: 20 / hearing };
  // The arrival radius reaches from home to the hum, so the horde held at the door is always inside it.
  const hordeArrivalRadiusMetres = (home[2] - hum.pos[2]) * SCALE.blockSize;
  const type = { ...SHAMBLER, strength: 5, agent: { ...SHAMBLER.agent!, hordeArrivalRadiusMetres } };
  const sense = (): PlayerSense => ({
    pos: [1000, 1, 1000],
    facing: [0, 0, 1],
    movement: 'still',
    lit: false,
    lightSeenFrom: 40,
    eyeHeightMetres: 1.3,
    stance: 'standing',
    soundSources: [hum],
  });
  let blows = 0;
  const system = new ActorSystem({
    player: sense,
    isSolid: solid,
    isOpaque: solid,
    isSoundBlocking: FLOOR,
    dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
    blockSize: SCALE.blockSize,
    physics: physicsFor(SCALE),
    tuning: TEST_SENSE_TUNING,
    actorFigureFiles: stackActorFigureFiles(registry),
    // Every member stays on the active tier, where bashing happens, though the player is far out of sense.
    activeActorRadiusMetres: 10_000,
    hurtPlayer: () => undefined,
    bashObstacle: () => {
      blows += 1;
      return true;
    },
    bashableAhead: (ahead) => entities.pieceTouching(ahead) !== undefined,
  });
  system.addHorde('bash-fixture', type, home, 1);
  const horde = () => system.snapshotState().hordes.find(({ id }) => id === 'bash-fixture')!;
  const framesPerBackground = Math.round(BACKGROUND_SIM_SECONDS * 60);
  let nowSimSeconds = 0;
  const totalSimSeconds = 10 + 3 * hordeArrivalStallSimSeconds;
  for (let frame = 0; frame < totalSimSeconds * 60; frame++) {
    system.tick(1 / 60);
    if (frame % framesPerBackground === 0) {
      nowSimSeconds += BACKGROUND_SIM_SECONDS;
      system.tickBackground(BACKGROUND_SIM_SECONDS, nowSimSeconds);
    }
  }

  // Held at the door inside the arrival radius for several stall times, so only the bashing keeps the commitment.
  const [[, member]] = [...system.store.entries()] as [[number, Actor]];
  const metres = Math.hypot(member!.body.pos[0] - hum.pos[0], member!.body.pos[2] - hum.pos[2]) * SCALE.blockSize;
  expect(member!.body.pos[2]).toBeGreaterThan(0);
  expect(metres).toBeLessThanOrEqual(hordeArrivalRadiusMetres);
  expect(blows).toBeGreaterThan(totalSimSeconds / hordeArrivalStallSimSeconds);
  expect(horde()).toMatchObject({ mode: 'noise', habituated: [] });
});
