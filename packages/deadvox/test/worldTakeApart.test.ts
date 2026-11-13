import { claimed } from '@skelly/engine/internal/core/capabilities.ts';
import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { dropSpots, type Item } from '@skelly/engine/inventory';
import { decodeSave } from '@skelly/engine/save';
import type { BlockEntity, Vec3 } from '@skelly/engine/world';
import { contentLookup } from '@skelly/presentation/ui';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { capture, createRuntime, encodeFixture, formatVersion, type Runtime } from './snapshotTestSupport.ts';

const registry = baseRegistry();
const ROUTED = [...registry.furniture.values()].find((def) => def.takeApart?.yield && !def.container)!.id;
const POCKETED = [...registry.furniture.values()].find((def) => def.takeApart?.yield && def.container)!.id;
const UNROUTED = [...registry.furniture.values()].find((def) => !(def.takeApart || def.door))!.id;
const messages = () => claimed(registry.ui, 'interface')!.furnitureMoveMessages;

const placeFloor = (runtime: Runtime) => {
  const floor = registry.blockIds.get(registry.blocks.find((block) => block.solid)!.id)!;
  for (let x = -16; x <= 16; x++) {
    for (let z = -4; z <= 4; z++) {
      runtime.world.setBlock(x, 0, z, floor);
    }
  }
};

const place = (runtime: Runtime, type: string, pos: Vec3): BlockEntity =>
  runtime.inventory.furnish({ type, pos, size: [...registry.furniture.get(type)!.size], facing: 'n' })!;

/** The player at the origin with empty hands, beside a piece that can be taken apart. */
const site = (type: string = ROUTED) => {
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn: [0, 1, 0] });
  placeFloor(runtime);
  const { inventory } = runtime;
  for (const held of [inventory.hands.left, inventory.hands.right]) {
    if (held && !inventory.consume(held)) {
      throw new Error('Fixture hands did not empty');
    }
  }
  return { runtime, piece: place(runtime, type, [2, 1, 0]) };
};

const uids = (runtime: Runtime) => new Set([...runtime.inventory.items()].map(({ item }) => item.uid));
const totals = (outputs: readonly { item: string; count: number }[]) => {
  const sums = new Map<string, number>();
  for (const { item, count } of outputs) {
    sums.set(item, (sums.get(item) ?? 0) + count);
  }
  return new Map([...sums].filter(([, count]) => count > 0));
};
/** Items made since `before`, totalled by type, and how many of them lie anywhere but a pile at a drop spot. */
const landedYield = (runtime: Runtime, before: ReadonlySet<number>) => {
  const spots = dropSpots(runtime.inventory.dropFeet()!).map((spot) => spot.join());
  const made: Item[] = [...runtime.inventory.items()].map(({ item }) => item).filter((item) => !before.has(item.uid));
  const elsewhere = made.filter((item) => {
    const at = runtime.inventory.locate(item);
    return !(at?.kind === 'pile' && spots.includes(at.pile.pos.join()));
  });
  return { totals: totals(made.map((item) => ({ item: item.type, count: item.count }))), elsewhere: elsewhere.length };
};
const arrange = (done: boolean, what: string) => {
  if (!done) {
    throw new Error(`Fixture: ${what}`);
  }
};
const jobYield = (work: Item) => {
  if (work.work?.kind !== 'pieceDisassembly') {
    throw new Error('Not a take-apart job');
  }
  return totals(work.work.outputs);
};
const finish = (runtime: Runtime, piece: BlockEntity) => {
  const work = piece.work!.work!;
  runtime.sim.scheduler.advance((work.duration - work.elapsed) / runtime.sim.clock.ratio + 1);
};

it('takes a piece apart where it stands, removing it and landing its yield once in a pile at the actor', () => {
  const { runtime, piece } = site();
  const { plan, refusal } = runtime.session.crafting.previewTakeApartEntity(piece.uid);
  expect(refusal).toBeUndefined();
  const before = uids(runtime);
  expect(runtime.session.crafting.takeApartEntity(piece.uid)).toBeUndefined();
  expect(runtime.inventory.hands.right ?? runtime.inventory.hands.left).toBeUndefined();
  finish(runtime, piece);
  expect(runtime.entities.byUid(piece.uid)).toBeUndefined();
  expect(runtime.sim.actions.job).toBeUndefined();
  expect(runtime.inventory.hands.right ?? runtime.inventory.hands.left).toBeUndefined();
  const landed = landedYield(runtime, before);
  expect(landed.elsewhere).toBe(0);
  expect(landed.totals.size).toBeGreaterThan(0);
  expect(landed.totals).toEqual(totals(plan!.outputs));
});

// Bulk stock: the content-authored stacks of building material, taken apart for the material itself
// (`packages/deadvox/SLICE-5.md`, "Bulk stock").
const BULK_STOCK = ['board_stack', 'fastener_crate', 'sheet_metal_stack'] as const;

it.each(BULK_STOCK)('takes the bulk-stock %s apart into its authored materials in one ground pile', (kind) => {
  const { runtime, piece } = site(kind);
  const { plan, refusal } = runtime.session.crafting.previewTakeApartEntity(piece.uid);
  expect(refusal).toBeUndefined();
  const before = uids(runtime);
  expect(runtime.session.crafting.takeApartEntity(piece.uid)).toBeUndefined();
  finish(runtime, piece);
  expect(runtime.entities.byUid(piece.uid)).toBeUndefined();
  const landed = landedYield(runtime, before);
  expect(landed.elsewhere).toBe(0);
  expect(landed.totals.size).toBeGreaterThan(0);
  expect(landed.totals).toEqual(totals(plan!.outputs));
});

const refusals = {
  'hands full': (runtime: Runtime) => {
    arrange(runtime.inventory.add(runtime.inventory.create('rag'), { kind: 'hand', side: 'right' }), 'hold a rag');
    return coreMessage(registry, 'handsFull');
  },
  'out of reach': (runtime: Runtime, piece: BlockEntity) => {
    runtime.session.body.pos[0] += 24;
    arrange(!runtime.inventory.canReachEntity(piece), 'walk out of reach');
    return messages().outOfReach;
  },
  reserved: (runtime: Runtime, piece: BlockEntity) => {
    arrange(runtime.session.crafting.takeApartEntity(piece.uid) === undefined, 'start the first job');
    runtime.sim.actions.stop();
    return messages().reserved;
  },
  gone: (runtime: Runtime, piece: BlockEntity) => {
    arrange(runtime.session.removeFurniture(piece) === undefined, 'remove the piece');
    return coreMessage(registry, 'gone');
  },
  'not empty': (runtime: Runtime) => {
    const crate = place(runtime, POCKETED, [-1 - registry.furniture.get(POCKETED)!.size[0], 1, 0]);
    runtime.entities.markSearched(crate);
    const rag = runtime.inventory.create('rag');
    arrange(runtime.inventory.add(rag, { kind: 'furniture', entity: crate, pocket: 0 }), 'stow a rag in the crate');
    return { piece: crate, refusal: messages().holdsItems };
  },
  'supporting another piece': (runtime: Runtime, piece: BlockEntity) => {
    place(runtime, ROUTED, [piece.pos[0], piece.pos[1] + piece.size[1], piece.pos[2]]);
    return messages().holdsUp;
  },
  occupied: (runtime: Runtime, piece: BlockEntity) => {
    const { pos } = runtime.session.body;
    pos[0] = piece.pos[0] + piece.size[0] / 2;
    pos[1] = piece.pos[1] + piece.size[1];
    pos[2] = piece.pos[2] + piece.size[2] / 2;
    return messages().standingOn;
  },
  'without a route': (runtime: Runtime) => ({
    piece: place(runtime, UNROUTED, [-3, 1, 2]),
    refusal: coreMessage(registry, 'cantTakeApart'),
  }),
} satisfies Record<
  string,
  (runtime: Runtime, piece: BlockEntity) => string | { piece: BlockEntity; refusal: string } | undefined
>;

it.each(Object.keys(refusals) as (keyof typeof refusals)[])(
  'refuses taking apart a piece %s, in the first person, without changing anything',
  (change) => {
    const { runtime, piece: routed } = site();
    const outcome = refusals[change](runtime, routed);
    const { piece, refusal } = typeof outcome === 'string' ? { piece: routed, refusal: outcome } : outcome;
    expect(refusal).toBeDefined();
    const job = runtime.sim.actions.job && { ...runtime.sim.actions.job };
    const before = { inventory: runtime.inventory.snapshotState(), entities: runtime.entities.snapshotState() };
    expect(runtime.session.crafting.previewTakeApartEntity(piece.uid).refusal).toBe(refusal);
    expect(runtime.session.crafting.takeApartEntity(piece.uid)).toBe(refusal);
    expect({ inventory: runtime.inventory.snapshotState(), entities: runtime.entities.snapshotState() }).toEqual(
      before,
    );
    expect(runtime.sim.actions.job && { ...runtime.sim.actions.job }).toEqual(job);
  },
);

it('pauses on the piece, holding it, and resumes from the piece to completion', () => {
  const { runtime, piece } = site();
  expect(runtime.session.crafting.takeApartEntity(piece.uid)).toBeUndefined();
  const work = piece.work!;
  runtime.sim.scheduler.advance(work.work!.duration / runtime.sim.clock.ratio / 3);
  runtime.sim.actions.stop();
  const { elapsed } = work.work!;
  expect(elapsed).toBeGreaterThan(0);
  expect(piece.work).toBe(work);
  expect(runtime.session.liftFurniture(piece.uid)).toBe(messages().reserved);

  const before = uids(runtime);
  const expected = jobYield(work);
  expect(runtime.session.crafting.act(work.uid, 'continue')).toBeUndefined();
  expect(work.work!.elapsed).toBe(elapsed);
  finish(runtime, piece);
  expect(runtime.entities.byUid(piece.uid)).toBeUndefined();
  expect(landedYield(runtime, before)).toEqual({ totals: expected, elsewhere: 0 });
});

it.each(['running', 'paused'] as const)('cancelling a %s job gives no yield and frees the piece', (state) => {
  const { runtime, piece } = site();
  expect(runtime.session.crafting.takeApartEntity(piece.uid)).toBeUndefined();
  const work = piece.work!;
  const { duration } = work.work!;
  runtime.sim.scheduler.advance(duration / runtime.sim.clock.ratio / 3);
  if (state === 'paused') {
    runtime.sim.actions.stop();
  }
  const before = uids(runtime);
  expect(runtime.session.crafting.act(work.uid, 'apart')).toBeUndefined();
  runtime.sim.scheduler.advance(duration / runtime.sim.clock.ratio + 1);
  expect(runtime.entities.byUid(piece.uid)).toBe(piece);
  expect(piece.work).toBeUndefined();
  expect(runtime.entities.useRefusal(piece)).toBeUndefined();
  expect([...uids(runtime)].filter((uid) => !before.has(uid))).toEqual([]);
});

it('keeps a paused job on its piece through a save, and the loaded job completes with one yield', async () => {
  const { runtime, piece } = site();
  expect(runtime.session.crafting.takeApartEntity(piece.uid)).toBeUndefined();
  const work = piece.work!;
  runtime.sim.scheduler.advance(work.work!.duration / runtime.sim.clock.ratio / 3);
  runtime.sim.actions.stop();

  const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
    version: formatVersion,
    contentLookup: (kind, id) => contentLookup(registry, kind, id),
  });
  const loaded = createRuntime(decoded.snapshot, false, undefined, { registry });
  placeFloor(loaded);
  const restored = loaded.entities.byUid(piece.uid)!;
  expect(restored.work?.work).toEqual(work.work);
  expect(loaded.entities.useRefusal(restored)).toBe(messages().reserved);

  const before = uids(loaded);
  expect(loaded.session.crafting.act(work.uid, 'continue')).toBeUndefined();
  finish(loaded, restored);
  expect(loaded.entities.byUid(piece.uid)).toBeUndefined();
  expect(landedYield(loaded, before)).toEqual({ totals: jobYield(work), elsewhere: 0 });
});
