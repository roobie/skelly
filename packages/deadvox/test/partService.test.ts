// Part service end to end on the housing-slot look's serviced module: review, Start, pause, continue, finish and
// reload, through the same commands a screen records.
import { housingBlueprint, housingContentIssues } from '@skelly/engine/internal/core/housing.ts';
import { type PlacedPowerDevice, placedPowerDevices } from '@skelly/engine/internal/core/sitePower.ts';
import { applyStartState } from '@skelly/engine/internal/core/startState.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayActionPayload,
} from '@skelly/engine/internal/game/replayCommands.ts';
import { selectBundledMods } from '@skelly/engine/packs';
import { decodeSave } from '@skelly/engine/save';
import { AuthoredSite, BlockEntities, type BlockEntity, makeScale, type Vec3 } from '@skelly/engine/world';
import { contentLookup } from '@skelly/presentation/ui';
import { describe, expect, it } from 'vitest';
import { productModIntake } from '../src/product/mods.ts';
import { baseRegistryWith } from './baseRegistry.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { fixtureSources } from './economyFixtures.ts';
import { advance, capture, createRuntime, encodeFixture, formatVersion, type Runtime } from './snapshotTestSupport.ts';

const mod = 'skelly.deadvox.scenario.test-house.housing-slots-look';
const selected = withReusedBuilds(() => selectBundledMods(productModIntake, [mod]));
const { registry } = selected.content;
const layout = registry.layouts.get('testHouseHousingSlots')!;
const start = [...registry.starts.values()].find(({ site }) => site === layout.id)!;
const serviced = [...registry.furniture.values()].find((def) => housingBlueprint(registry, def.id)?.failure)!;
const blueprint = housingBlueprint(registry, serviced.id)!;
const devices = placedPowerDevices(
  registry,
  new AuthoredSite(start.seed!, registry, makeScale(0.5), layout).authoredPlacements,
);
const module = devices.find(({ type }) => type === serviced.id)!;
// The serviced module alone supplies the lamp, so the lamp shows whether it produces.
const lamp = devices.find(({ type }) => registry.furniture.get(type)!.power!.light)!;
const powered: PlacedPowerDevice[] = [module, lamp];
const [mx, my, mz] = module.pos;
const spawn: Vec3 = [mx + serviced.size[0] + 1, my, mz + 1];

const placeFloor = (runtime: Runtime) => {
  const floor = registry.blockIds.get(registry.blocks.find((block) => block.solid)!.id)!;
  for (let x = mx - 4; x <= mx + 8; x++) {
    for (let z = mz - 4; z <= mz + 6; z++) {
      runtime.world.setBlock(x, my - 1, z, floor);
    }
  }
};

const command = (runtime: Runtime, payload: ReplayActionPayload) => {
  if (!isReplayActionPayload(payload)) {
    throw new Error('A payload the recorder cannot carry');
  }
  const unexpected = (): never => {
    throw new Error('Unexpected command in the part service fixture');
  };
  return applyReplayActionPayload(payload, {
    inventory: runtime.inventory,
    queue: runtime.handling,
    quickbar: runtime.quickbar,
    work: (uid, operation, choices) => runtime.session.crafting.act(uid, operation, choices),
    craftServicePart: (entityUid, request) => runtime.session.crafting.servicePart(entityUid, request),
    vehicleWork: unexpected,
    craftTakeApartCell: unexpected,
    search: unexpected,
    loadBattery: unexpected,
    unloadBattery: unexpected,
    toHands: unexpected,
    pickup: unexpected,
    interact: unexpected,
    lift: unexpected,
    useFurniture: unexpected,
    slide: unexpected,
    place: unexpected,
    turn: unexpected,
    tip: unexpected,
    clearDownedBody: unexpected,
    craftStart: unexpected,
    craftRepairEntity: unexpected,
    craftRepairCell: unexpected,
    craftTakeApartEntity: unexpected,
    craftContinue: unexpected,
    craftStop: unexpected,
    wait: unexpected,
    setWakeGameHour: unexpected,
    cancelItemThrow: unexpected,
    throwItem: unexpected,
    cancelCast: unexpected,
    commitCast: unexpected,
  });
};

/** The look's start on the module's deck, its hands emptied to the floor by ordinary moves so work can begin. */
const stage = () => {
  const runtime = createRuntime(undefined, false, undefined, { registry, spawn, powerDevices: powered });
  placeFloor(runtime);
  const { inventory } = runtime;
  for (const held of [inventory.hands.left, inventory.hands.right]) {
    if (held && !inventory.consume(held)) {
      throw new Error('Fixture hands did not empty');
    }
  }
  applyStartState(inventory, start, {
    fresh: true,
    calendar: runtime.sim.calendar,
    character: runtime.session.character,
    body: runtime.sim.body,
    damageCell: () => {
      throw new Error('Unexpected start cell damage');
    },
  });
  for (const held of [inventory.hands.left, inventory.hands.right]) {
    if (held) {
      const target = { kind: 'pile' as const, pos: inventory.dropFeet()! };
      const refusal = command(runtime, { kind: 'inventory.move', itemUid: held.uid, target, count: held.count });
      if (refusal) {
        throw new Error(`Fixture hand did not empty: ${refusal}`);
      }
    }
  }
  advance(runtime, 120);
  if (inventory.hands.left || inventory.hands.right) {
    throw new Error('Fixture hands did not empty');
  }
  const piece = inventory.furnishSpawn({ spec: module.entitySpec!, loot: [] })!;
  advance(runtime, 1);
  return { runtime, piece };
};

const slotPart = (runtime: Runtime, piece: BlockEntity, slot: string) =>
  runtime.inventory.entities.housingView(piece).find((view) => view.slot === slot)?.part;
const lit = (runtime: Runtime) => {
  advance(runtime, 1);
  return runtime.session.power!.isPowered(lamp);
};
const runFor = (runtime: Runtime, piece: BlockEntity, share: number) => {
  const { duration, elapsed } = piece.work!.work!;
  runtime.sim.scheduler.advance(((duration - elapsed) * share) / runtime.sim.clock.ratio + (share === 1 ? 1 : 0));
};

it('restores a failed module by a timed fit that pauses, continues from the ring, and survives a reload', async () => {
  expect(selected.issues).toEqual([]);
  const { runtime, piece } = stage();
  const { crafting } = runtime.session;
  expect(lit(runtime), 'the seeded failure keeps the module dark').toBe(false);

  const review = crafting.partServiceOptions(piece.uid);
  const fit = review.find(({ operation }) => operation === 'fit')!;
  expect(review.filter(({ operation }) => operation === 'fit').map(({ slot }) => slot)).toEqual([fit.slot]);
  expect(fit.refusal).toBeUndefined();
  expect(fit.itemUid).toBeDefined();
  expect(fit.timeGameMinutes).toBeGreaterThan(0);
  expect(fit.qualities.length + fit.skills.length).toBeGreaterThan(0);
  expect(fit.qualities.every(({ required, best }) => best >= required)).toBe(true);
  expect(fit.skills.every(({ required, available }) => available >= required)).toBe(true);
  const spare = runtime.inventory.itemByUid(fit.itemUid!)!;
  expect(crafting.previewPartService(piece.uid, { slot: fit.slot, operation: 'fit', itemUid: spare.uid })).toEqual(fit);

  expect(
    command(runtime, {
      kind: 'craft.service-part',
      entityUid: piece.uid,
      slot: fit.slot,
      operation: 'fit',
      itemUid: spare.uid,
    }),
  ).toBeUndefined();
  const work = piece.work!;
  runFor(runtime, piece, 1 / 3);
  runtime.sim.actions.stop();
  const { elapsed } = work.work!;
  expect(elapsed).toBeGreaterThan(0);
  expect(slotPart(runtime, piece, fit.slot), 'a paused fit has not fitted yet').toBeUndefined();
  expect(crafting.partServiceOptions(piece.uid).every(({ refusal }) => refusal !== undefined)).toBe(true);

  expect(command(runtime, { kind: 'inventory.work', itemUid: work.uid, operation: 'continue' })).toBeUndefined();
  expect(work.work!.elapsed).toBe(elapsed);
  runFor(runtime, piece, 1);
  expect(piece.work).toBeUndefined();
  expect(slotPart(runtime, piece, fit.slot)).toEqual({ uid: spare.uid, type: spare.type, condition: spare.condition });
  expect(lit(runtime)).toBe(true);

  const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
    version: formatVersion,
    contentLookup: (...query) => contentLookup(registry, ...query),
  });
  const loaded = createRuntime(decoded.snapshot, false, undefined, { registry, powerDevices: powered });
  placeFloor(loaded);
  const restored = loaded.entities.byUid(piece.uid)!;
  expect(loaded.inventory.entities.housingView(restored)).toEqual(runtime.inventory.entities.housingView(piece));
  expect(lit(loaded)).toBe(true);
});

it('holds a module off while a service job sits on it, though every part it needs is still fitted', () => {
  const { runtime, piece } = stage();
  const { crafting } = runtime.session;
  const { slot: failed, itemUid } = crafting
    .partServiceOptions(piece.uid)
    .find(({ operation }) => operation === 'fit')!;
  expect(crafting.servicePart(piece.uid, { slot: failed, operation: 'fit', itemUid: itemUid! })).toBeUndefined();
  runFor(runtime, piece, 1);
  expect(lit(runtime)).toBe(true);

  const remove = crafting
    .partServiceOptions(piece.uid)
    .find(({ operation, slot, timeGameMinutes }) => operation === 'remove' && slot !== failed && timeGameMinutes > 0)!;
  const fitted = slotPart(runtime, piece, remove.slot);
  expect(
    command(runtime, { kind: 'craft.service-part', entityUid: piece.uid, slot: remove.slot, operation: 'remove' }),
  ).toBeUndefined();
  const work = piece.work!;
  runFor(runtime, piece, 1 / 3);
  runtime.sim.actions.stop();
  expect(slotPart(runtime, piece, remove.slot)).toEqual(fitted);
  expect(lit(runtime), 'a paused job is a service window').toBe(false);

  expect(command(runtime, { kind: 'inventory.work', itemUid: work.uid, operation: 'apart' })).toBeUndefined();
  expect(piece.work).toBeUndefined();
  expect(lit(runtime)).toBe(true);
});

it('runs an instant service through the same review and Start, landing the removed part at the feet', () => {
  const { runtime, piece } = stage();
  const { crafting } = runtime.session;
  const instant = crafting
    .partServiceOptions(piece.uid)
    .find(({ operation, timeGameMinutes }) => operation === 'remove' && timeGameMinutes === 0)!;
  expect(instant.refusal).toBeUndefined();
  const part = slotPart(runtime, piece, instant.slot)!;
  expect(
    command(runtime, { kind: 'craft.service-part', entityUid: piece.uid, slot: instant.slot, operation: 'remove' }),
  ).toBeUndefined();
  runtime.sim.scheduler.advance(1);
  expect(runtime.sim.actions.job).toBeUndefined();
  expect(piece.work).toBeUndefined();
  expect(slotPart(runtime, piece, instant.slot)).toBeUndefined();
  const piled = [...runtime.inventory.piles.values()].flatMap(({ items }) => items.map(({ item }) => item));
  expect(piled).toContainEqual(expect.objectContaining({ type: part.type, condition: part.condition }));
});

describe('seeded failure', () => {
  it('falls on exactly one of its slots, the same whichever piece is read first', () => {
    const origins: Vec3[] = [module.pos, [mx + 4, my, mz], [mx, my, mz + 4]];
    const views = (order: readonly Vec3[]) => {
      const entities = new BlockEntities(registry, start.seed!);
      const pieces = order.map(
        (pos) => entities.add({ type: serviced.id, pos: [...pos], size: [...serviced.size], facing: 'n' })!,
      );
      return new Map(pieces.map((piece) => [piece.pos.join(), entities.housingView(piece)]));
    };
    const forward = views(origins);
    expect(views([...origins].reverse())).toEqual(forward);
    const { among } = blueprint.failure!;
    for (const view of forward.values()) {
      expect(view.filter(({ slot, part }) => among.includes(slot) && !part)).toHaveLength(1);
    }
  });

  const Part = 'fixture_failure_part';
  const failureRegistry = (failed: [number, number]) =>
    baseRegistryWith(
      fixtureSources([
        {
          source: 'failure-fixture',
          data: {
            items: [{ id: Part, name: 'Fixture part', category: 'material', size: [1, 1], weight: 1 }],
            powerDevices: [{ id: 'fixture_failure_source', kind: 'inexhaustible', priority: 0, outputWatts: 1 }],
            partBlueprints: [
              {
                id: 'fixture_failure_module',
                slots: ['left', 'right'].map((id) => ({
                  id,
                  accepts: [Part],
                  initial: { item: Part, condition: [0.8, 1] },
                  failed: { item: Part, condition: failed },
                  service: { timeGameMinutes: 0 },
                })),
                failure: { among: ['left', 'right'] },
              },
            ],
            furniture: [
              {
                id: 'fixture_failure_module',
                name: 'Fixture module',
                size: [1, 1, 1],
                color: '#888888',
                takeApart: { parts: 'fixture_failure_module' },
                power: {
                  device: 'fixture_failure_source',
                  fuelLitres: 0,
                  enabled: true,
                  requires: ['left', 'right'].map((slot) => ({ slot, parts: [Part], minimum: 0.5, critical: true })),
                },
              },
            ],
          },
        },
      ]),
    );

  it('refuses a failed part whose range can pass its critical minimum', () => {
    const flagged = (failed: [number, number]) =>
      housingContentIssues(failureRegistry(failed)).filter(({ id }) => id === 'fixture_failure_module');
    expect(flagged([0, 0.2])).toEqual([]);
    expect(flagged([0.2, 0.6]).length).toBeGreaterThan(0);
  });
});
