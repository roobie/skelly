import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { BlockEntities, type BlockEntity } from '../src/core/blockEntities.ts';
import { requireDayCycle } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import type { SolidAt } from '../src/core/raycast.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import type { SoundEmission } from '../src/core/soundPicker.ts';
import { World } from '../src/core/world.ts';
import { type PlayerSense, ZombieSystem } from '../src/core/zombies.ts';
import { PLAYER, physicsFor } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { buildFixtureRegistry } from './economyFixtures.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { TEST_SENSE_TUNING } from './senseFixture.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const MINIMUM = 5;
const TOUGHNESS = 20;
const fixtureDoor = (id: string, barredFrom?: 'front' | 'back') => ({
  id,
  name: 'Fixture door',
  size: [2, 4, 1],
  color: '#777777',
  door: {
    material: 'breach_fixture',
    methods: {},
    handlingSimSeconds: 0.5,
    breach: { minimumStrength: MINIMUM, toughness: TOUGHNESS },
    ...(barredFrom ? { barredFrom } : {}),
  },
});
const base = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown }));
const { registry, issues } = buildFixtureRegistry([
  ...base,
  {
    source: 'breach-fixture',
    data: {
      doorMaterials: [{ id: 'breach_fixture', methods: [] }],
      furniture: [fixtureDoor('breach_door'), fixtureDoor('breach_boarded', 'front')],
    },
  },
]);
const SHAMBLER = registry.zombies.get('shambler')!;
const SCALE = makeScale(0.5);
const FLOOR: SolidAt = (_x, y) => y === 0;

/** A closed fixture leaf in the doorway of a wall along z = 0, from x = 4 to x = 6. */
const doorway = (type = 'breach_door') => {
  const entities = new BlockEntities(registry);
  const door = entities.add({
    type,
    pos: [4, 1, 0],
    size: [2, 4, 1],
    facing: 'n',
    lock: { id: 'shed', locked: true },
  })!;
  const solid: SolidAt = (x, y, z) =>
    FLOOR(x, y, z) || (z === 0 && y >= 1 && y <= 4 && (x < 4 || x > 5)) || entities.isSolid(x, y, z);
  return { entities, door, solid };
};
const blowsToBreak = (entities: BlockEntities, door: BlockEntity, strength: number): number => {
  for (let blows = 1; blows <= 1000; blows++) {
    if (entities.bash(door, strength) === 'broken') {
      return blows;
    }
  }
  throw new Error('The leaf never broke');
};

/** A shambler of `strength` chasing a player behind the closed leaf, with its bashes resolved on the leaf. */
const chaseThroughDoor = (strength: number, seconds: number) => {
  const { entities, door, solid } = doorway();
  const target: Vec3 = [5, 1, -3];
  const sense = (): PlayerSense => ({
    pos: target,
    facing: [0, 0, 1],
    movement: 'sprinting',
    lit: false,
    lightSeenFrom: 40,
    crouching: false,
  });
  const system = new ZombieSystem({
    player: sense,
    isSolid: solid,
    isOpaque: solid,
    dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
    blockSize: SCALE.blockSize,
    physics: physicsFor(SCALE),
    jumpSpeed: PLAYER.jump,
    tuning: TEST_SENSE_TUNING,
    hurtPlayer: () => undefined,
    bashObstacle: (ahead, bash) => {
      const leaf = entities.closedLeafTouching(ahead);
      return leaf !== undefined && entities.bash(leaf, bash) !== undefined;
    },
  });
  const id = system.add({ ...SHAMBLER, strength }, [5, 1, 6], [0, 0, -1]);
  let reachedBehind = false;
  for (let frame = 0; frame < seconds * 60; frame++) {
    system.tick(1 / 60);
    reachedBehind ||= system.store.get(id)!.body.pos[2] < 0;
  }
  return { entities, door, reachedBehind };
};

/** One fists swing at the closed fixture leaf in front of the player, with the swing's impulse set to `strength`. */
const strikeDoor = (strength: number) => {
  const played: Readonly<SoundEmission>[] = [];
  const session = createSession({
    registry,
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
  const { entities } = session.inventory;
  const door = entities.add({ type: 'breach_door', pos: [4, 1, 0], size: [2, 4, 1], facing: 'n' })!;
  const hands = { right: null, left: null };
  const chest = session.chest();
  session.playerCombat.beginMeleeSwing({
    origin: chest,
    direction: [0, 0, -1],
    weapon: { ...FISTS_MELEE, impulse: strength },
    profile: 'fists',
    twoHanded: false,
    hands,
  });
  session.playerCombat.tick(session.playerCombat.activeMeleeAction!.contactAt, hands);
  return { door, played };
};

it('builds the breach fixture without issues and rejects a leaf without a positive breach', () => {
  expect(issues).toEqual([]);
  const leaf = fixtureDoor('breach_rejected');
  const rejected = (door: Record<string, unknown>) =>
    buildFixtureRegistry([
      {
        source: 'breach-rejected',
        data: { doorMaterials: [{ id: 'breach_fixture', methods: [] }], furniture: [{ ...leaf, door }] },
      },
    ]).issues.map(({ path }) => path);
  const { breach: _breach, ...withoutBreach } = leaf.door;
  expect(rejected(withoutBreach)).toEqual(['furniture[0].door.breach']);
  expect(rejected({ ...leaf.door, breach: { minimumStrength: 0, toughness: TOUGHNESS } })).toEqual([
    'furniture[0].door.breach.minimumStrength',
  ]);
});

it('never damages a leaf with blows below its minimum strength, however many land', () => {
  const { entities, door, solid } = doorway();
  for (let blow = 0; blow < 1000; blow++) {
    expect(entities.bash(door, MINIMUM * 0.99)).toBe('resisted');
  }
  expect(door.damage).toBeUndefined();
  expect(door.open).toBe(false);
  expect(solid(4, 1, 0)).toBe(true);
});

it('adds up blows at or above the minimum until the leaf breaks open with its lock gone', () => {
  const { entities, door } = doorway();
  expect(entities.bash(door, MINIMUM)).toBe('damaged');
  expect(door.damage).toBe(MINIMUM);
  expect(blowsToBreak(entities, door, MINIMUM)).toBe(Math.ceil(TOUGHNESS / MINIMUM) - 1);
  expect(door.broken).toBe(true);
  expect(door.open).toBe(true);
  expect(door.lock).toBeUndefined();
  expect(entities.doorRefusal(door, 'close', [])).toBe("It's broken");
  expect(entities.bash(door, MINIMUM)).toBeUndefined();
});

const throughSaveFile = async (entities: BlockEntities): Promise<BlockEntities> => {
  const captured = capture(createRuntime());
  const snapshot = {
    ...captured,
    character: {
      ...captured.character,
      inventory: { ...captured.character.inventory, entities: entities.snapshotState() },
    },
  };
  const decoded = await decodeSave(await encodeFixture(snapshot), {
    contentLookup: () => true,
    version: formatVersion,
  });
  return BlockEntities.restoreState(registry, decoded.snapshot.character.inventory.entities);
};

it('keeps partial and broken damage through a save file and load of the block entities', async () => {
  const { entities, door } = doorway();
  entities.bash(door, MINIMUM);
  const restored = await throughSaveFile(entities);
  const reloaded = restored.byUid(door.uid)!;
  expect(reloaded.damage).toBe(MINIMUM);
  expect(blowsToBreak(restored, reloaded, MINIMUM)).toBe(blowsToBreak(entities, door, MINIMUM));
  const broken = await throughSaveFile(restored);
  expect(broken.byUid(door.uid)).toMatchObject({ broken: true, open: true });
  expect(broken.isSolid(4, 1, 0)).toBe(false);
});

it('holds a bashing shambler below the minimum behind the intact leaf and lets a strong one through the broken leaf', () => {
  const weak = chaseThroughDoor(MINIMUM * 0.99, 60);
  expect(weak.door.damage).toBeUndefined();
  expect(weak.door.open).toBe(false);
  expect(weak.reachedBehind).toBe(false);
  const strong = chaseThroughDoor(MINIMUM, 60);
  expect(strong.door.broken).toBe(true);
  expect(strong.reachedBehind).toBe(true);
});

it("meets a player's strike with the same minimum-strength gate as a zombie's bash, and makes it heard", () => {
  const below = strikeDoor(MINIMUM * 0.99);
  expect(below.door.damage).toBeUndefined();
  const at = strikeDoor(MINIMUM);
  expect(at.door.damage).toBe(MINIMUM);
  expect(at.played.find((sound) => sound.event === 'door_bash')?.emittedAsNoise).toBe(true);
});

it('keeps a damaged boarded leaf openable only from its unboarded side', () => {
  const { entities, door } = doorway('breach_boarded');
  entities.breakLock(door);
  const front: Vec3 = [5, 1, -2];
  const back: Vec3 = [5, 1, 3];
  const refusals = () => [entities.doorRefusal(door, 'open', [], front), entities.doorRefusal(door, 'open', [], back)];
  const before = refusals();
  entities.bash(door, MINIMUM);
  expect(door.damage).toBe(MINIMUM);
  expect(refusals()).toEqual(before);
  expect(before[0]).toBeDefined();
  expect(before[1]).toBeUndefined();
});
