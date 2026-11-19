// @vitest-environment happy-dom
// Part service end to end on the housing-slot look's serviced module: obtain, review, Start, pause, reload,
// continue, finish and cancel, through the same commands a screen records.
import { housingBlueprint, housingContentIssues } from '@skelly/engine/internal/core/housing.ts';
import { type PlacedPowerDevice, placedPowerDevices } from '@skelly/engine/internal/core/sitePower.ts';
import { applyStartState } from '@skelly/engine/internal/core/startState.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayActionPayload,
} from '@skelly/engine/internal/game/replayCommands.ts';
import type { Item } from '@skelly/engine/inventory';
import { selectBundledMods } from '@skelly/engine/packs';
import { decodeSave } from '@skelly/engine/save';
import { AuthoredSite, BlockEntities, type BlockEntity, makeScale, type Vec3 } from '@skelly/engine/world';
import { mountCraftPanel } from '@skelly/presentation/internal/ui/craftController.ts';
import { contentLookup } from '@skelly/presentation/ui';
import { describe, expect, it, vi } from 'vitest';
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
const serviced = registry.furniture.get('fixture_plant_service_module')!;
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
    craftStart: (recipeId, preference, sources) => runtime.session.crafting.start(recipeId, preference, sources),
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
    operateVehiclePart: unexpected,
  });
};

/** Sets the hands down at the feet by ordinary moves, so work can begin. */
const emptyHands = (runtime: Runtime) => {
  const { inventory } = runtime;
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
};

/** The look's start on the module's deck, with empty hands. */
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
  emptyHands(runtime);
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
/** Runs a share of a job's remaining time; the whole of it finishes the job. */
const runFor = (runtime: Runtime, work: Item, share: number) => {
  const { duration, elapsed } = work.work!;
  runtime.sim.scheduler.advance(((duration - elapsed) * share) / runtime.sim.clock.ratio + (share === 1 ? 1 : 0));
};
const escrowed = (piece: BlockEntity) => piece.work?.work?.components.map(({ uid }) => uid);

/** Crafts the spare core from the kit's inputs by the recorded craft Start and sets it down, as a player would. */
const craftSpare = (runtime: Runtime) => {
  const { inventory } = runtime;
  const refusal = command(runtime, { kind: 'craft.start', recipeId: 'fixture_plant_core' });
  if (refusal) {
    throw new Error(`Fixture spare did not start: ${refusal}`);
  }
  runFor(runtime, (inventory.hands.left ?? inventory.hands.right)!, 1);
  const spare = inventory.hands.left ?? inventory.hands.right;
  if (spare?.type !== 'fixture_plant_core') {
    throw new Error('Fixture spare did not reach the hand');
  }
  emptyHands(runtime);
  return spare;
};

/** A real save and restore of the runtime, on the same floor. */
const reload = async (runtime: Runtime) => {
  const decoded = await decodeSave(await encodeFixture(capture(runtime)), {
    version: formatVersion,
    contentLookup: (...query) => contentLookup(registry, ...query),
  });
  const loaded = createRuntime(decoded.snapshot, false, undefined, { registry, powerDevices: powered });
  placeFloor(loaded);
  return loaded;
};

it('restores a failed module with a crafted spare by a timed fit that pauses, survives reloads, and continues from the ring', async () => {
  expect(selected.issues).toEqual([]);
  const { runtime, piece } = stage();
  const { crafting } = runtime.session;
  expect(lit(runtime), 'the seeded failure keeps the module dark').toBe(false);
  const spare = craftSpare(runtime);

  const review = crafting.partServiceOptions(piece.uid);
  const fit = review.find(({ operation }) => operation === 'fit')!;
  expect(review.filter(({ operation }) => operation === 'fit').map(({ slot }) => slot)).toEqual([fit.slot]);
  expect(fit.refusal).toBeUndefined();
  expect(fit.itemUid, 'the review offers the crafted spare').toBe(spare.uid);
  expect(fit.timeGameMinutes).toBeGreaterThan(0);
  expect(fit.qualities.length + fit.skills.length).toBeGreaterThan(0);
  expect(fit.qualities.every(({ required, best }) => best >= required)).toBe(true);
  expect(fit.skills.every(({ required, available }) => available >= required)).toBe(true);
  expect(crafting.previewPartService(piece.uid, { slot: fit.slot, operation: 'fit', itemUid: spare.uid })).toEqual(fit);
  const fitted = { uid: spare.uid, type: spare.type, condition: spare.condition };

  expect(
    command(runtime, {
      kind: 'craft.service-part',
      entityUid: piece.uid,
      slot: fit.slot,
      operation: 'fit',
      itemUid: fit.itemUid!,
    }),
  ).toBeUndefined();
  expect(escrowed(piece), 'Start escrows the spare on the job').toEqual([spare.uid]);
  runFor(runtime, piece.work!, 1 / 3);
  runtime.sim.actions.stop();
  const { elapsed } = piece.work!.work!;
  expect(elapsed).toBeGreaterThan(0);
  expect(slotPart(runtime, piece, fit.slot), 'a paused fit has not fitted yet').toBeUndefined();
  expect(crafting.partServiceOptions(piece.uid).every(({ refusal }) => refusal !== undefined)).toBe(true);

  const paused = await reload(runtime);
  const resumed = paused.entities.byUid(piece.uid)!;
  expect(resumed.work?.work?.elapsed, 'a reload keeps the paused progress').toBe(elapsed);
  expect(escrowed(resumed), 'and the escrowed spare').toEqual([spare.uid]);
  expect(slotPart(paused, resumed, fit.slot)).toBeUndefined();
  expect(lit(paused), 'a paused job is a service window').toBe(false);

  const work = resumed.work!;
  expect(command(paused, { kind: 'inventory.work', itemUid: work.uid, operation: 'continue' })).toBeUndefined();
  expect(work.work!.elapsed).toBe(elapsed);
  runFor(paused, work, 1);
  expect(resumed.work).toBeUndefined();
  expect(slotPart(paused, resumed, fit.slot)).toEqual(fitted);
  expect(lit(paused)).toBe(true);

  const loaded = await reload(paused);
  const restored = loaded.entities.byUid(piece.uid)!;
  expect(loaded.inventory.entities.housingView(restored)).toEqual(paused.inventory.entities.housingView(resumed));
  expect(lit(loaded)).toBe(true);
});

it('hands back a cancelled fit spare, and holds a module off while a service job sits on it', () => {
  const { runtime, piece } = stage();
  const { crafting } = runtime.session;
  const spare = craftSpare(runtime);
  const { slot: failed } = crafting.partServiceOptions(piece.uid).find(({ operation }) => operation === 'fit')!;
  const fit: ReplayActionPayload = {
    kind: 'craft.service-part',
    entityUid: piece.uid,
    slot: failed,
    operation: 'fit',
    itemUid: spare.uid,
  };
  expect(command(runtime, fit)).toBeUndefined();
  runFor(runtime, piece.work!, 1 / 3);
  runtime.sim.actions.stop();
  expect(command(runtime, { kind: 'inventory.work', itemUid: piece.work!.uid, operation: 'apart' })).toBeUndefined();
  expect(piece.work).toBeUndefined();
  expect(slotPart(runtime, piece, failed), 'a cancelled fit fits nothing').toBeUndefined();
  expect(runtime.inventory.locate(spare)?.kind, 'the very spare lands at the feet').toBe('pile');
  const offered = crafting.partServiceOptions(piece.uid).find(({ slot }) => slot === failed);
  expect(offered?.itemUid, 'and is in reach for the next fit').toBe(spare.uid);

  expect(command(runtime, fit)).toBeUndefined();
  runFor(runtime, piece.work!, 1);
  expect(lit(runtime)).toBe(true);

  const remove = crafting
    .partServiceOptions(piece.uid)
    .find(({ operation, slot, timeGameMinutes }) => operation === 'remove' && slot !== failed && timeGameMinutes > 0)!;
  const fitted = slotPart(runtime, piece, remove.slot);
  expect(
    command(runtime, { kind: 'craft.service-part', entityUid: piece.uid, slot: remove.slot, operation: 'remove' }),
  ).toBeUndefined();
  const work = piece.work!;
  runFor(runtime, work, 1 / 3);
  runtime.sim.actions.stop();
  expect(slotPart(runtime, piece, remove.slot)).toEqual(fitted);
  expect(lit(runtime), 'a paused job is a service window').toBe(false);

  expect(command(runtime, { kind: 'inventory.work', itemUid: work.uid, operation: 'apart' })).toBeUndefined();
  expect(piece.work).toBeUndefined();
  expect(lit(runtime)).toBe(true);
});

/** Empties a working core slot by a timed remove and crafts a spare, so two spares at the feet fit that slot. */
const twoSpares = (runtime: Runtime, piece: BlockEntity) => {
  const { crafting } = runtime.session;
  const { slot: failed } = crafting.partServiceOptions(piece.uid).find(({ operation }) => operation === 'fit')!;
  const { slot } = crafting
    .partServiceOptions(piece.uid)
    .find((option) => option.operation === 'remove' && option.slot !== failed && option.timeGameMinutes > 0)!;
  const part = slotPart(runtime, piece, slot)!;
  const refusal = command(runtime, { kind: 'craft.service-part', entityUid: piece.uid, slot, operation: 'remove' });
  if (refusal) {
    throw new Error(`Fixture remove did not start: ${refusal}`);
  }
  runFor(runtime, piece.work!, 1);
  if (slotPart(runtime, piece, slot)) {
    throw new Error('Fixture remove did not empty the slot');
  }
  const piled = [...runtime.inventory.piles.values()].flatMap(({ items }) => items.map(({ item }) => item));
  const removed = piled.find(({ type }) => type === part.type)!;
  return { slot, removed, spare: craftSpare(runtime) };
};

it('fits the spare the player picks when two fit the slot', () => {
  const { runtime, piece } = stage();
  const { inventory } = runtime;
  const { crafting } = runtime.session;
  const { slot: emptied, removed, spare } = twoSpares(runtime, piece);

  const fits = crafting
    .partServiceOptions(piece.uid)
    .filter(({ operation, slot }) => operation === 'fit' && slot === emptied);
  const byUid = (a: number, b: number) => a - b;
  expect(fits.map(({ itemUid }) => itemUid!).sort(byUid), 'one row per spare in reach').toEqual(
    [removed.uid, spare.uid].sort(byUid),
  );
  expect(
    fits.map(({ where }) => where),
    'each row says where its spare lies',
  ).toEqual(fits.map(() => ({ kind: 'ground' })));
  // The pick is the spare a best-first auto-pick would pass over.
  const picked = [...fits].sort((a, b) => b.part.condition! - a.part.condition! || byUid(a.itemUid!, b.itemUid!))[1]!;
  const other = inventory.itemByUid(picked.itemUid === spare.uid ? removed.uid : spare.uid)!;
  const otherAt = inventory.locate(other)?.kind;

  expect(
    command(runtime, {
      kind: 'craft.service-part',
      entityUid: piece.uid,
      slot: emptied,
      operation: 'fit',
      itemUid: picked.itemUid!,
    }),
  ).toBeUndefined();
  expect(escrowed(piece), 'Start escrows the picked spare').toEqual([picked.itemUid]);
  runFor(runtime, piece.work!, 1);
  expect(slotPart(runtime, piece, emptied)?.uid, 'the slot holds the picked spare').toBe(picked.itemUid);
  expect(inventory.locate(other)?.kind, 'the other spare stays where it was').toBe(otherAt);
});

it('keeps a picked spare that leaves reach refused instead of starting another', () => {
  const { runtime, piece } = stage();
  const { crafting } = runtime.session;
  const { removed: kept, spare: left } = twoSpares(runtime, piece);
  const root = document.createElement('section');
  document.body.append(root);
  const dispatch = vi.fn((payload: ReplayActionPayload) => command(runtime, payload));
  const controller = mountCraftPanel(root, runtime.session, { dispatch, notice: vi.fn() });
  const work = { target: piece, operation: 'take_apart' as const };
  const selectedOption = () => root.querySelector<HTMLElement>('[data-craft-option][aria-pressed="true"]');
  try {
    controller.update(true, work);
    const [first, ...others] = root.querySelectorAll<HTMLButtonElement>('[data-craft-option]');
    const pick = others.find(({ dataset }) => dataset.craftOption!.endsWith(`:fit:${left.type}:${left.uid}`))!;
    expect(pick, 'the pick is not the first option').not.toBe(first);
    pick.click();
    const picked = pick.dataset.craftOption;
    expect(selectedOption()?.dataset.craftOption).toBe(picked);

    // The player carries the other spare round the module and sets it down there, out of reach of the picked one.
    const carried = command(runtime, {
      kind: 'inventory.move',
      itemUid: kept.uid,
      target: { kind: 'hand', side: 'left' },
      count: 1,
    });
    expect(carried).toBeUndefined();
    advance(runtime, 120);
    runtime.player.body.pos = [mx - 2, my, mz + 1];
    emptyHands(runtime);
    const fits = crafting.partServiceOptions(piece.uid).filter(({ operation }) => operation === 'fit');
    expect(
      fits.some(({ itemUid }) => itemUid === left.uid),
      'the picked spare left reach',
    ).toBe(false);
    expect(
      fits.some(({ itemUid, refusal }) => itemUid === kept.uid && refusal === undefined),
      'the other spare still fits',
    ).toBe(true);

    controller.update(true, work);
    expect(selectedOption()?.dataset.craftOption, 'the pick stays selected').toBe(picked);
    expect(root.querySelector('.craft-start')?.getAttribute('aria-disabled')).toBe('true');
    root.querySelector<HTMLButtonElement>('.craft-start')!.click();
    expect(dispatch, 'Start sends nothing').not.toHaveBeenCalled();
  } finally {
    controller.update(false);
    root.remove();
  }
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
                  name: 'Fixture socket',
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
