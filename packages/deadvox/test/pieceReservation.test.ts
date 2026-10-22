import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { DOOR_ACTION } from '../src/game/doorAction.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry, FIXTURE_MATERIAL } from './economyFixtures.ts';
import { capture, createRuntime, encodeFixture, formatVersion, type Runtime } from './snapshotTestSupport.ts';

const base = readdirSync('src/content/base')
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({
    source: file,
    data: JSON.parse(readFileSync(join('src/content/base', file), 'utf8')) as unknown,
  }));
const methodId = 'fixture_method';
const qualityId = 'fixture_quality';
const door = (id: string) => ({
  id,
  name: 'Fixture door',
  size: [2, 4, 1],
  color: '#777777',
  door: {
    handlingSimSeconds: 0.5,
    methods: {
      [methodId]: {
        quality: qualityId,
        level: 1,
        skill: 'mechanics',
        timeSimSeconds: 10,
        fastestTimeSimSeconds: 5,
        strikeIntervalSimSeconds: 1,
        strikeSound: 'fixture_strike',
      },
    },
  },
});
const { registry, issues } = buildFixtureRegistry([
  ...base,
  {
    source: 'reservation-fixture',
    data: {
      furnitureMaterials: [{ id: FIXTURE_MATERIAL, methods: [methodId] }],
      furniture: [
        door('fixture_door'),
        {
          id: 'fixture_crate',
          name: 'Fixture crate',
          size: [1, 1, 1],
          color: '#ffffff',
          container: { pockets: [{ grid: [2, 2], handlingSimSeconds: 0.5 }] },
        },
      ],
      sounds: [{ ...[...baseRegistry().sounds.values()].find((sound) => sound.noise.enabled)!, id: 'fixture_strike' }],
      items: [
        {
          id: 'fixture_tool',
          name: 'Fixture tool',
          category: 'tool',
          size: [1, 1],
          weight: 1,
          tool: { qualities: { [qualityId]: 2 } },
        },
      ],
    },
  },
]);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

const placeFloor = (runtime: Runtime) => {
  const floor = registry.blockIds.get(registry.blocks.find((block) => block.solid)!.id)!;
  for (let x = -4; x <= 4; x++) {
    for (let z = -4; z <= 4; z++) {
      runtime.world.setBlock(x, 0, z, floor);
    }
  }
};

/** The player at the origin, within reach of a locked door, an open one, a searched crate and a ladder. */
const site = () => {
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn: [0, 1, 0] });
  placeFloor(runtime);
  const { inventory } = runtime;
  const locked = inventory.furnish({
    type: 'fixture_door',
    pos: [0, 1, 1],
    size: [2, 4, 1],
    facing: 'n',
    lock: { id: 'fixture_lock', locked: true },
  })!;
  const plain = inventory.furnish({ type: 'fixture_door', pos: [-3, 1, 1], size: [2, 4, 1], facing: 'n' })!;
  const crate = inventory.furnish({ type: 'fixture_crate', pos: [-2, 1, -1], size: [1, 1, 1], facing: 'n' })!;
  runtime.entities.markSearched(crate);
  const chest = inventory.furnish({ type: 'fixture_crate', pos: [-2, 1, -2], size: [1, 1, 1], facing: 'n' })!;
  const ladderSize = registry.furniture.get('ladder')!.size;
  const ladder = inventory.furnish({ type: 'ladder', pos: [1, 1, -2], size: [...ladderSize], facing: 's' })!;
  const tool = inventory.create('fixture_tool');
  if (!(inventory.consume(inventory.hands.left!) && inventory.add(tool, { kind: 'hand', side: 'left' }))) {
    throw new Error('Fixture tool did not reach the left hand');
  }
  return { runtime, locked, plain, crate, chest, ladder, tool };
};

const decodeInto = async (runtime: Runtime) => {
  const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
    version: formatVersion,
    contentLookup: (kind, id) => contentLookup(registry, kind, id),
  });
  const loaded = createRuntime(decoded.snapshot, false, undefined, { registry });
  placeFloor(loaded);
  return loaded;
};

it('removes a door with a pending forcing job, so the save encodes and decodes without it', async () => {
  const { runtime, locked } = site();
  const { session } = runtime;
  expect(session.forceDoor(locked)).toBeUndefined();
  runtime.sim.scheduler.advance(2);
  runtime.sim.emit({ kind: 'interrupt', reason: 'Fixture interruption' });
  runtime.sim.frame(0.1);
  expect(runtime.sim.actions.job).toMatchObject({ jobType: 'forceDoor', entityUid: locked.uid, stopped: true });
  session.queue.enqueueAction(DOOR_ACTION, 'Open the door', 1, { entityUid: locked.uid });

  expect(session.removeFurniture(locked)).toBeUndefined();
  expect(runtime.sim.actions.job).toBeUndefined();
  expect(session.queue.jobs).toEqual([]);

  const loaded = await decodeInto(runtime);
  expect(loaded.entities.byUid(locked.uid)).toBeUndefined();
  expect(loaded.sim.actions.job).toBeUndefined();
});

it('lets go of a grabbed ladder it removes, so the save encodes and decodes', async () => {
  const { runtime, ladder } = site();
  const { session } = runtime;
  expect(session.grabLadder(ladder)).toBeUndefined();
  expect(session.ladderHold.snapshotState()).toEqual({ on: false, grabbedUid: ladder.uid });

  expect(session.removeFurniture(ladder)).toBeUndefined();
  expect(session.ladderHold.snapshotState()).toBeNull();

  const loaded = await decodeInto(runtime);
  expect(loaded.entities.byUid(ladder.uid)).toBeUndefined();
  expect(loaded.session.ladderHold.snapshotState()).toBeNull();
});

it('refuses every use of a reserved piece, and allows each again once released', () => {
  const { runtime, locked, plain, crate, chest, ladder, tool } = site();
  const { session, inventory, entities } = runtime;
  const item = inventory.create('fixture_tool');
  if (inventory.hands.right) {
    expect(inventory.consume(inventory.hands.right)).toBe(true);
  }
  expect(inventory.add(item, { kind: 'hand', side: 'right' })).toBe(true);
  const doorOutcome = () => {
    session.queue.enqueueAction(DOOR_ACTION, 'Open the door', 0, { entityUid: plain.uid });
    return session.queue.tick(0).failed[0]?.reason;
  };
  const pocket = () => {
    const plan = inventory.plan(item, { kind: 'furniture', entity: crate, pocket: 0 });
    return plan.ok ? undefined : plan.reason;
  };
  // Lifting needs both hands, so it runs last; a search queues handling, so it runs after the door's.
  const uses: [string, () => string | undefined][] = [
    ['door', doorOutcome],
    ['pocket', pocket],
    ['forcing', () => session.forceDoor(locked, tool.uid)],
    ['ladder', () => session.grabLadder(ladder)],
    ['search', () => session.search(chest)],
    ['lift', () => session.liftFurniture(crate.uid)],
  ];
  const pieces = [locked, plain, crate, chest, ladder];
  for (const piece of pieces) {
    entities.reserve(piece);
  }
  const reserved = entities.useRefusal(crate);
  expect(reserved).toBeDefined();
  for (const [use, run] of uses) {
    expect(run(), use).toBe(reserved);
  }

  for (const piece of pieces) {
    entities.release(piece);
  }
  for (const [use, run] of uses) {
    if (use === 'lift') {
      expect(inventory.consume(item) && inventory.consume(tool)).toBe(true);
    }
    expect(run(), use).toBeUndefined();
    if (use === 'forcing') {
      runtime.sim.actions.cancel();
    }
    if (use === 'ladder') {
      session.ladderHold.piece(true);
    }
  }
  expect(entities.carrying()).toBe(crate);
});

it('keeps the reserved set through a save, and forgets a piece once it is removed', async () => {
  const { runtime, crate, plain } = site();
  runtime.entities.reserve(crate);
  runtime.entities.reserve(plain);

  const loaded = await decodeInto(runtime);
  expect(loaded.entities.snapshotState().reserved).toEqual(runtime.entities.snapshotState().reserved);
  const restored = loaded.entities.byUid(crate.uid)!;
  expect(loaded.entities.useRefusal(restored)).toBeDefined();

  loaded.entities.remove(restored);
  expect(loaded.entities.snapshotState().reserved).toEqual([plain.uid]);
});

it('refuses a saved reservation of a piece that is not there', () => {
  const { runtime, crate } = site();
  const state = runtime.entities.snapshotState();
  const missing = state.nextUid;
  expect(() => BlockEntities.restoreState(registry, { ...state, reserved: [crate.uid, missing] })).toThrow();
  expect(() => BlockEntities.restoreState(registry, { ...state, reserved: [crate.uid] })).not.toThrow();
});
