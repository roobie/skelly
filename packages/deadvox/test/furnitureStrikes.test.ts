import { requireDayCycle } from '@skelly/engine/content';
import { dayPhaseAt, type PlayerSense } from '@skelly/engine/sim';
import type { SoundEmission } from '@skelly/engine/sound';
import { BlockEntities, makeScale, type SolidAt, type Vec3, World } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { createSession, IDLE } from '../src/game/entries/session.ts';
import { baseContentSources, stackActorFigureFiles } from './baseContentFiles.ts';
import { buildFixtureRegistry, FIXTURE_BLOW_SOUND } from './economyFixtures.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { physicsFor } from './playerFixture.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { ActorSystem } from './zombieSystemFixture.ts';

const MINIMUM = 5;
const DURABILITY = 4 * MINIMUM;
const base = baseContentSources();
const { registry, issues } = buildFixtureRegistry([
  ...base,
  {
    source: 'strike-fixture',
    data: {
      furniture: [
        {
          id: 'strike_wardrobe',
          name: 'Fixture wardrobe',
          size: [2, 4, 1],
          color: '#777777',
          material: 'wood',
          breach: { minimumStrength: MINIMUM, durability: DURABILITY },
        },
      ],
    },
  },
]);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const SHAMBLER = registry.actors.get('shambler')!;
const SCALE = makeScale(0.5);
const FLOOR: SolidAt = (_x, y) => y === 0;
const WARDROBE_AT: Vec3 = [4, 1, 0];

/** One fists swing at the fixture wardrobe in front of the player, with the swing's impulse set to `strength`. */
const strikeWardrobe = (strength: number) => {
  const played: Readonly<SoundEmission>[] = [];
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world: new World(),
    isSolid: FLOOR,
    isOpaque: () => false,
    scale: SCALE,
    seed: 5,
    start: 43_200,
    spawn: [5, 1, 2],
    ready: () => false,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: (sound) => played.push(sound) },
    notice: () => undefined,
    onRead: () => undefined,
  });
  const wardrobe = session.inventory.entities.add({
    type: 'strike_wardrobe',
    pos: WARDROBE_AT,
    size: [2, 4, 1],
    facing: 'n',
  })!;
  const hands = { right: null, left: null };
  session.playerCombat.beginMeleeSwing({
    origin: session.chest(),
    direction: [0, 0, -1],
    weapon: { ...FISTS_MELEE, impulse: strength },
    profile: 'fists',
    twoHanded: false,
    hands,
  });
  session.playerCombat.tick(session.playerCombat.activeMeleeAction!.contactAt, hands);
  return { wardrobe, played };
};

/**
 * A shambler of `strength` chasing a player behind the wardrobe, which stands in a doorway of a wall along z = 0
 * (`walled`) or alone on open ground. Its bashes land on the wardrobe, which is destroyed when one ruins it.
 */
const chasePastWardrobe = (strength: number, walled: boolean) => {
  const entities = new BlockEntities(registry);
  const wardrobe = entities.add({ type: 'strike_wardrobe', pos: WARDROBE_AT, size: [2, 4, 1], facing: 'n' })!;
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) || (walled && z === 0 && y >= 1 && y <= 4 && (x < 4 || x > 5)) || entities.isSolid(x, y, z);
  const sense = (): PlayerSense => ({
    pos: [5, 1, -3],
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
    bashObstacle: (ahead, bash) => {
      const piece = entities.pieceTouching(ahead);
      if (!piece) {
        return false;
      }
      if (entities.bash(piece, bash) === 'ruined') {
        entities.destroy(piece);
      }
      return true;
    },
  });
  const id = system.add({ ...SHAMBLER, strength }, [5, 1, 6], [0, 0, -1]);
  let reachedBehind = false;
  for (let frame = 0; frame < 60 * 60; frame++) {
    system.tick(1 / 60);
    reachedBehind ||= system.store.get(id)!.body.pos[2] < 0;
  }
  return { entities, wardrobe, reachedBehind };
};

it('leaves a piece unchanged under a blow below its minimum strength, and damages it at the minimum', () => {
  expect(strikeWardrobe(MINIMUM * 0.99).wardrobe.damage).toBeUndefined();
  expect(strikeWardrobe(MINIMUM).wardrobe.damage).toBe(MINIMUM);
});

it('makes a blow on a piece heard in the sound its material names, even one that did no damage', () => {
  const sound = registry.furnitureMaterials.get('wood')!.blowSound;
  for (const strength of [MINIMUM * 0.99, MINIMUM]) {
    const { played } = strikeWardrobe(strength);
    expect(played.find((emission) => emission.event === sound)?.emittedAsNoise).toBe(true);
  }
  expect(sound).not.toBe(FIXTURE_BLOW_SOUND);
});

it('lets a shambler walk around a piece it can pass instead of bashing it', () => {
  const open = chasePastWardrobe(MINIMUM, false);
  expect(open.wardrobe.damage).toBeUndefined();
  expect(open.entities.byUid(open.wardrobe.uid)).toBe(open.wardrobe);
  expect(open.reachedBehind).toBe(true);
});
