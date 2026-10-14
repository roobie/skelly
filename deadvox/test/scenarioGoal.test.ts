import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { Chunk } from '../src/core/chunk.ts';
import { worldSolid } from '../src/core/collision.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { decodeSave, encodeSave } from '../src/core/saveFormat.ts';
import type { SaveSnapshot } from '../src/core/saveState.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { formatVersion } from './snapshotTestSupport.ts';

const own = buildRegistry([
  {
    source: 'goal-fixture',
    data: {
      furniture: [
        {
          id: 'fixture_goal',
          name: 'Fixture goal',
          size: [1, 4, 1],
          color: '#aaaaaa',
          scenarioGoal: true,
        },
      ],
    },
  },
]);
if (own.issues.length > 0) {
  throw new Error(JSON.stringify(own.issues));
}
const registry = {
  ...BUNDLED_CONTENT.registry,
  furniture: new Map([...BUNDLED_CONTENT.registry.furniture, ...own.registry.furniture]),
};
const profile = [...registry.scenarios.values()][0]!;
const objective: Vec3 = [8, 1, 6];
const worldOptions = { blockSize: 0.5, site: profile.id, storeys: 1, density: null };
const fixture = (restore?: Readonly<SaveSnapshot>, spawn: Vec3 = [8.5, 1, 8.5], designated: Vec3 = objective) => {
  const world = new World();
  const chunk = new Chunk(0, 0, 0);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      chunk.set(x, 0, z, registry.blockIds.get('concrete')!);
    }
  }
  world.addChunk(chunk);
  const entities = new BlockEntities(registry);
  const solid = worldSolid(world, registry, entities);
  const look = { yaw: 0, pitch: 0 };
  let intent = { ...IDLE };
  const session = createSession({
    registry,
    scenario: profile,
    objective: designated,
    world,
    entities,
    scale: makeScale(0.5),
    isSolid: solid,
    isOpaque: solid,
    ready: () => true,
    seed: 13,
    start: 43_200,
    spawn,
    controls: {
      active: () => true,
      intent: () => intent,
      yaw: () => look.yaw,
      pitch: () => look.pitch,
      walking: () => true,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(restore ? { restore } : {}),
  });
  if (!restore) {
    session.inventory.furnish({ type: 'fixture_goal', pos: objective, size: [1, 4, 1], facing: 'n' }, []);
  }
  const entity = entities.at(...objective)!;
  if (!entity) {
    throw new Error('Goal fixture missing');
  }
  const capture = () => session.snapshot({ worldId: 'fixture-world', characterId: 'fixture-character' });
  const move = () => {
    intent = { ...IDLE, right: 1, walk: true };
    for (let n = 0; n < 6; n++) {
      session.frame(1 / 60);
    }
    intent = { ...IDLE };
  };
  return { session, world, entity, capture, look, move };
};

it('revalidates the living attempt, designated instance, reach, face and live obstruction', () => {
  const f = fixture();
  const undesignated = fixture(undefined, undefined, [7, 1, 6]);
  expect(undesignated.session.activateGoal(undesignated.entity)).toBeDefined();
  expect(undesignated.session.won).toBe(false);
  expect(f.session.activateGoal({ ...f.entity })).toBeDefined();
  const distant = fixture(undefined, [8.5, 1, 14.5]);
  expect(distant.session.activateGoal(distant.entity)).toBeDefined();
  f.look.yaw = Math.PI;
  expect(f.session.activateGoal(f.entity)).toBeDefined();
  f.look.yaw = 0;
  f.world.setBlock(8, 4, 7, registry.blockIds.get('stone')!);
  expect(f.session.activateGoal(f.entity)).toBeDefined();
  expect(f.session.won).toBe(false);
  f.world.setBlock(8, 4, 7, 0);
  expect(f.session.activateGoal(f.entity)).toBeUndefined();
  expect(f.session.won).toBe(true);
});

it('gives death before goal admission precedence and rejects a dead won snapshot', async () => {
  const f = fixture();
  f.session.sim.hurt(1000, 'fixture injury');
  f.session.frame(1 / 60);
  expect(f.session.sim.dead).toBeDefined();
  expect(f.session.activateGoal(f.entity)).toBeDefined();
  expect(f.session.won).toBe(false);
  const bad = structuredClone(f.capture());
  bad.character.scenarioRun!.completedAtGameTimestamp = f.session.sim.calendar;
  await expect(encodeSave(bad, { generation: 1, version: formatVersion, worldOptions })).rejects.toThrow(
    'Dead attempt',
  );
});

it.each(['firstFurnitureReadAtGameTimestamp', 'firstLadderUseAtGameTimestamp'] as const)(
  'rejects a won save with %s after completion even when within the calendar',
  async (observation) => {
    const f = fixture();
    f.session.frame(1 / 60);
    expect(f.session.activateGoal(f.entity)).toBeUndefined();
    const snapshot = structuredClone(f.capture());
    const run = snapshot.character.scenarioRun!;
    run.completedAtGameTimestamp = run.startedAtGameTimestamp;
    run[observation] = run.completedAtGameTimestamp;
    const options = { generation: 1, version: formatVersion, worldOptions };
    const decoded = await decodeSave(await encodeSave(snapshot, options), {
      version: formatVersion,
      contentLookup: () => true,
    });
    expect(decoded.snapshot.character.scenarioRun).toEqual(run);
    run[observation] = f.session.sim.calendar;
    expect(run[observation]).toBeGreaterThan(run.completedAtGameTimestamp);
    await expect(encodeSave(snapshot, options)).rejects.toThrow('Invalid scenario run timestamp');
  },
);

it('round-trips running and won attempts without replaying success or counting restore movement and title time', async () => {
  const f = fixture();
  f.move();
  f.session.observeRunFrame(2, true);
  f.session.observeRunFrame(7, false);
  const running = f.capture();
  expect(running.character.scenarioRun!.distanceMetres).toBeGreaterThan(0);
  expect(running.character.scenarioRun!.activeRealSeconds).toBe(2);
  const load = async (snapshot: Readonly<SaveSnapshot>) =>
    fixture(
      (
        await decodeSave(await encodeSave(snapshot, { generation: 1, version: formatVersion, worldOptions }), {
          version: formatVersion,
          contentLookup: () => true,
        })
      ).snapshot,
    );
  const continued = await load(running);
  expect(continued.session.scenarioRun).toEqual(running.character.scenarioRun);
  expect(continued.session.won).toBe(false);
  expect(continued.session.activateGoal(continued.entity)).toBeUndefined();
  const won = continued.capture();
  expect(won.character.scenarioRun!.completedAtGameTimestamp).not.toBeNull();
  expect(continued.session.activateGoal(continued.entity)).toBeUndefined();
  expect(continued.capture()).toEqual(won);
  const restored = await load(won);
  expect(restored.session.won).toBe(true);
  restored.move();
  restored.session.observeRunFrame(9, true);
  expect(restored.session.activateGoal(restored.entity)).toBeUndefined();
  expect(restored.capture()).toEqual(won);
  const invalid = structuredClone(running);
  invalid.character.scenarioRun!.startedAtGameTimestamp = f.session.sim.calendar + 1;
  await expect(load(invalid)).rejects.toThrow('Invalid scenario run');
});
