import { DOOR_ACTION } from '@skelly/engine/internal/game/doorAction.ts';
import type { Item } from '@skelly/engine/inventory';
import { decodeSave } from '@skelly/engine/save';
import type { BlockEntity } from '@skelly/engine/world';
import { contentLookup } from '@skelly/presentation/ui';
import { expect, it } from 'vitest';
import { baseContentSources } from './baseContentFiles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry, FIXTURE_BLOW_SOUND, FIXTURE_MATERIAL } from './economyFixtures.ts';
import { capture, createRuntime, encodeFixture, formatVersion, type Runtime } from './snapshotTestSupport.ts';

const base = baseContentSources();
const methodId = 'fixture_method';
const qualityId = 'fixture_quality';
// A take-apart route lets a test reserve each fixture piece the way a player does: with a paused job on it.
const { takeApart } = baseRegistry().furniture.get('chair')!;
const door = (id: string) => ({
  id,
  name: 'Fixture door',
  size: [2, 4, 1],
  color: '#777777',
  takeApart,
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
      furnitureMaterials: [
        {
          id: FIXTURE_MATERIAL,
          blowSound: FIXTURE_BLOW_SOUND,
          drops: { default: FIXTURE_BLOW_SOUND },
          methods: [methodId],
        },
      ],
      furniture: [
        door('fixture_door'),
        {
          id: 'fixture_crate',
          name: 'Fixture crate',
          size: [1, 1, 1],
          color: '#ffffff',
          container: { pockets: [{ grid: [2, 2], handlingSimSeconds: 0.5 }] },
          takeApart,
        },
        { ...baseRegistry().furniture.get('ladder')!, id: 'fixture_ladder', takeApart },
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

/** The player at the origin with empty hands, within reach of a locked door, an open one, two crates and a ladder. */
const bareSite = () => {
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn: [0, 1, 0] });
  placeFloor(runtime);
  const { inventory } = runtime;
  for (const held of [inventory.hands.left, inventory.hands.right]) {
    if (held && !inventory.consume(held)) {
      throw new Error('Fixture hands did not empty');
    }
  }
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
  const ladderSize = registry.furniture.get('fixture_ladder')!.size;
  const ladder = inventory.furnish({ type: 'fixture_ladder', pos: [1, 1, -2], size: [...ladderSize], facing: 's' })!;
  return { runtime, locked, plain, crate, chest, ladder, tool: inventory.create('fixture_tool') };
};

const arm = (runtime: Runtime, tool: Item) => {
  if (!runtime.inventory.add(tool, { kind: 'hand', side: 'left' })) {
    throw new Error('Fixture tool did not reach the left hand');
  }
};

/** The bare site with the tool in the left hand. */
const site = () => {
  const placed = bareSite();
  arm(placed.runtime, placed.tool);
  return placed;
};

/** Starts and pauses taking each piece apart, the way a player reserves a piece; returns each job's work uid. */
const pauseTakingApart = (runtime: Runtime, pieces: readonly BlockEntity[]): number[] =>
  pieces.map((piece) => {
    const refusal = runtime.session.crafting.takeApartEntity(piece.uid);
    if (refusal) {
      throw new Error(`Fixture job did not start: ${refusal}`);
    }
    runtime.sim.actions.stop();
    return piece.work!.uid;
  });

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

it('refuses every use of a piece a paused job holds, and allows each again once the job is cancelled', () => {
  const { runtime, locked, plain, crate, chest, ladder, tool } = bareSite();
  const { session, inventory, entities } = runtime;
  const pieces = [locked, plain, crate, chest, ladder];
  const jobs = pauseTakingApart(runtime, pieces);
  arm(runtime, tool);
  const item = inventory.create('fixture_tool');
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
  const reserved = entities.useRefusal(crate);
  expect(reserved).toBeDefined();
  for (const [use, run] of uses) {
    expect(run(), use).toBe(reserved);
  }

  for (const uid of jobs) {
    expect(session.crafting.act(uid, 'apart')).toBeUndefined();
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

it('keeps a paused job on its piece through a save, still holding it, and frees it once cancelled', async () => {
  const { runtime, crate, plain } = bareSite();
  const [crateJob] = pauseTakingApart(runtime, [crate, plain]);

  const loaded = await decodeInto(runtime);
  const restored = loaded.entities.byUid(crate.uid)!;
  expect(restored.work).toEqual(crate.work);
  expect(loaded.entities.useRefusal(restored)).toBe(runtime.entities.useRefusal(crate));

  expect(loaded.session.crafting.act(crateJob!, 'apart')).toBeUndefined();
  expect(loaded.entities.useRefusal(restored)).toBeUndefined();
  expect(loaded.entities.useRefusal(loaded.entities.byUid(plain.uid)!)).toBeDefined();
});

it('refuses removing a piece that holds a world job, so the job never outlives its piece', () => {
  const { runtime, crate } = bareSite();
  pauseTakingApart(runtime, [crate]);
  expect(() => runtime.entities.remove(crate)).toThrow();
  expect(runtime.session.removeFurniture(crate)).toBe(runtime.entities.useRefusal(crate));
  expect(runtime.entities.byUid(crate.uid)).toBe(crate);
});
