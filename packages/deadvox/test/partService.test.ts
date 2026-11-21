// @vitest-environment happy-dom
// Part service end to end on the housing-slot look's serviced module: obtain, review, Start, pause, reload,
// continue, finish and cancel, through the same commands a screen records.
import { coreMessage } from '@skelly/engine/internal/core/coreText.ts';
import { housingBlueprint, housingContentIssues } from '@skelly/engine/internal/core/housing.ts';
import { type PlacedPowerDevice, placedPowerDevices } from '@skelly/engine/internal/core/sitePower.ts';
import { applyStartState } from '@skelly/engine/internal/core/startState.ts';
import { furnitureActionsFor } from '@skelly/engine/internal/game/furnitureActions.ts';
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
import { pieceWorkRow } from '@skelly/presentation/internal/ui/craftReadout.ts';
import { housingSites } from '@skelly/presentation/internal/ui/housingSites.ts';
import { contentLookup } from '@skelly/presentation/ui';
import { BoxGeometry, Group, Matrix4, Mesh, Vector3 } from 'three';
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

/** Crafts the spare core from the kit's inputs by the recorded craft Start, which leaves it in hand. */
const craftHeldSpare = (runtime: Runtime) => {
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
  return spare;
};

/** Crafts the spare core and sets it down, as a player would. */
const craftSpare = (runtime: Runtime) => {
  const spare = craftHeldSpare(runtime);
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

it('fits a spare held in hand, taking it from the hand at Start', () => {
  const { runtime, piece } = stage();
  const { inventory } = runtime;
  const spare = craftHeldSpare(runtime);
  const fit = runtime.session.crafting
    .partServiceOptions(piece.uid)
    .find(({ operation, itemUid }) => operation === 'fit' && itemUid === spare.uid);
  expect(fit?.where, 'the review offers the spare in hand').toEqual({ kind: 'hand' });
  expect(fit?.refusal, 'holding the very spare leaves the hands free for its fit').toBeUndefined();
  expect(
    command(runtime, {
      kind: 'craft.service-part',
      entityUid: piece.uid,
      slot: fit!.slot,
      operation: 'fit',
      itemUid: spare.uid,
    }),
  ).toBeUndefined();
  expect(escrowed(piece), 'Start escrows the held spare').toEqual([spare.uid]);
  expect([inventory.hands.left, inventory.hands.right], 'and takes it from the hand').toEqual([undefined, undefined]);
  runFor(runtime, piece.work!, 1);
  expect(slotPart(runtime, piece, fit!.slot)?.uid).toBe(spare.uid);
});

it('refuses a fit while a hand holds anything but its spare', () => {
  const { runtime, piece } = stage();
  const { inventory } = runtime;
  const { crafting } = runtime.session;
  const spare = craftSpare(runtime);
  const bat = runtime.session
    .reach()
    .entries.map(({ item }) => item)
    .find(({ type }) => type === 'baseball_bat')!;
  expect(
    command(runtime, { kind: 'inventory.move', itemUid: bat.uid, target: { kind: 'hand', side: 'left' }, count: 1 }),
  ).toBeUndefined();
  advance(runtime, 120);
  expect(inventory.hands.left).toBe(bat);
  const { slot } = crafting.partServiceOptions(piece.uid).find(({ itemUid }) => itemUid === spare.uid)!;
  const request = { slot, operation: 'fit', itemUid: spare.uid } as const;
  const refusal = crafting.previewPartService(piece.uid, request)?.refusal;
  expect(refusal, 'the review refuses the fit for full hands').toBe(coreMessage(inventory.registry, 'handsFull'));
  expect(crafting.servicePart(piece.uid, request), 'and so does Start').toBe(refusal);
  expect(piece.work).toBeUndefined();
  expect(inventory.hands.left).toBe(bat);
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

it('names a paused fit by its blueprint slot, so two slots taking the same part read apart', () => {
  const { runtime, piece } = stage();
  const { crafting } = runtime.session;
  const { spare } = twoSpares(runtime, piece);
  const slots = blueprint.slots.filter(({ accepts }) => accepts.includes(spare.type)).slice(0, 2);
  expect(slots, 'two slots take the spare').toHaveLength(2);
  const captions = slots.map(({ id, name }) => {
    const refusal = command(runtime, {
      kind: 'craft.service-part',
      entityUid: piece.uid,
      slot: id,
      operation: 'fit',
      itemUid: spare.uid,
    });
    expect(refusal).toBeUndefined();
    runFor(runtime, piece.work!, 1 / 3);
    runtime.sim.actions.stop();
    const continued = furnitureActionsFor(runtime.inventory, piece).find((action) => action.id === 'continue')!.label;
    const reviewed = pieceWorkRow(registry, piece, crafting)!.row.name;
    expect(continued.toLowerCase(), 'the Continue label names the slot').toContain(name.toLowerCase());
    expect(reviewed, 'the paused review names the slot').toContain(name);
    expect(command(runtime, { kind: 'inventory.work', itemUid: piece.work!.uid, operation: 'apart' })).toBeUndefined();
    return { continued, reviewed };
  });
  expect(captions[0]!.continued).not.toBe(captions[1]!.continued);
  expect(captions[0]!.reviewed).not.toBe(captions[1]!.reviewed);
});

it('keeps a picked spare that leaves reach refused instead of starting another', () => {
  const { runtime, piece } = stage();
  const { crafting } = runtime.session;
  const { slot: emptied, removed: kept, spare: left } = twoSpares(runtime, piece);
  const root = document.createElement('section');
  document.body.append(root);
  const dispatch = vi.fn((payload: ReplayActionPayload) => command(runtime, payload));
  const controller = mountCraftPanel(root, runtime.session, {
    dispatch,
    notice: vi.fn(),
    sites: housingSites(runtime.session),
    pickSpot: vi.fn(),
  });
  const work = { target: piece, operation: 'take_apart' as const };
  const selectedService = () => root.querySelector<HTMLElement>('[data-craft-service][aria-pressed="true"]');
  try {
    controller.update(true, work);
    root.querySelector<HTMLButtonElement>(`[data-craft-slot="${emptied}"]`)!.click();
    const pick = [...root.querySelectorAll<HTMLButtonElement>('[data-craft-service]')].find(({ dataset }) =>
      dataset.craftService!.endsWith(`:fit:${left.type}:${left.uid}`),
    )!;
    pick.click();
    const picked = pick.dataset.craftService;
    expect(selectedService()?.dataset.craftService).toBe(picked);

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
    expect(selectedService()?.dataset.craftService, 'the pick stays selected').toBe(picked);
    expect(root.querySelector('.craft-start')?.getAttribute('aria-disabled')).toBe('true');
    root.querySelector<HTMLButtonElement>('.craft-start')!.click();
    expect(dispatch, 'Start sends nothing').not.toHaveBeenCalled();
  } finally {
    controller.update(false);
    root.remove();
  }
});

type TargetView = NonNullable<Parameters<typeof mountCraftPanel>[2]['targetView']>;

/**
 * Opens the piece's work-on review with a drawn model view, as play mounts it, recording what Start sends. The piece's
 * own frame is the depiction's unless `view` says otherwise.
 */
const review = (runtime: Runtime, piece: BlockEntity, view: Partial<TargetView> = {}) => {
  const root = document.createElement('section');
  document.body.append(root);
  const dispatch = vi.fn((_payload: ReplayActionPayload): string | undefined => undefined);
  const targetView: TargetView = {
    pictures: { view: vi.fn() },
    depiction: () => ({ model: new Group(), dispose: () => undefined }),
    frame: () => new Matrix4(),
    ...view,
  };
  const controller = mountCraftPanel(root, runtime.session, {
    dispatch,
    notice: vi.fn(),
    sites: housingSites(runtime.session),
    targetView,
    pickSpot: vi.fn(),
  });
  const update = () => controller.update(true, { target: piece, operation: 'take_apart' });
  update();
  return {
    root,
    dispatch,
    update,
    close: () => {
      controller.update(false);
      root.remove();
    },
  };
};

it('marks a fitted slot with its condition and leaves an empty slot unmarked', () => {
  const { runtime, piece } = stage();
  const { root, close } = review(runtime, piece);
  try {
    const housing = runtime.inventory.entities.housingView(piece);
    const marked = (slot: string) => root.querySelector(`[data-craft-slot="${slot}"] .condition-mark`) !== null;
    expect(housing.some(({ part }) => !part) && housing.some(({ part }) => part)).toBe(true);
    for (const { slot, part } of housing) {
      expect(marked(slot), slot).toBe(part !== undefined);
    }
  } finally {
    close();
  }
});

it('reviews every slot by its named list, anchored or not, removing a fitted part and fitting a spare', () => {
  const { runtime, piece } = stage();
  const spare = craftSpare(runtime);
  const housing = runtime.inventory.entities.housingView(piece);
  const empty = housing.find(({ part }) => !part)!.slot;
  const anchored = blueprint.slots.filter(({ id }) => id !== empty);
  serviced.slotAnchors = anchored.map(({ id }) => ({ slot: id, position: [0, 0, 0], pickSize: [1, 1, 1] }));
  const { root, dispatch, close } = review(runtime, piece);
  try {
    expect(root.querySelector('.craft-target-canvas'), 'the model is drawn').not.toBeNull();
    expect(
      [...root.querySelectorAll<HTMLElement>('[data-craft-socket]')].map(({ dataset }) => dataset.craftSocket),
      'with a pick for each anchored slot alone',
    ).toEqual(anchored.map(({ id }) => id));
    expect(
      [...root.querySelectorAll<HTMLElement>('[data-craft-slot]')].map((row) => [
        row.dataset.craftSlot,
        row.querySelector('.craft-slot-name')!.textContent,
      ]),
    ).toEqual(blueprint.slots.map(({ id, name }) => [id, name]));
    const startSlot = (slot: string) => {
      root.querySelector<HTMLButtonElement>(`[data-craft-slot="${slot}"]`)!.click();
      root.querySelector<HTMLButtonElement>('.craft-start')!.click();
      return dispatch.mock.lastCall?.[0];
    };
    const filled = housing.find(({ part }) => part)!.slot;
    expect(startSlot(filled)).toEqual({
      kind: 'craft.service-part',
      entityUid: piece.uid,
      slot: filled,
      operation: 'remove',
    });
    expect(startSlot(empty)).toEqual({
      kind: 'craft.service-part',
      entityUid: piece.uid,
      slot: empty,
      operation: 'fit',
      itemUid: spare.uid,
    });
  } finally {
    close();
    serviced.slotAnchors = undefined;
  }
});

it('marks each anchored slot the model draws no socket art for', () => {
  const { runtime, piece } = stage();
  const [keyed, ...plain] = blueprint.slots;
  serviced.slotAnchors = blueprint.slots.map(({ id }) => ({
    slot: id,
    position: [0, 0, 0],
    pickSize: [1, 1, 1],
    ...(id === keyed!.id ? { socketShape: [{ position: [0, 0, 0], size: [0.1, 0.1, 0.1] }] } : {}),
  }));
  const view = vi.fn();
  const { close } = review(runtime, piece, { pictures: { view } });
  try {
    const drawn: Group = view.mock.lastCall![0];
    expect(drawn.getObjectByName(`site-mark:${keyed!.id}`), 'keyed art marks its own slot').toBeUndefined();
    expect(plain).not.toHaveLength(0);
    for (const { id } of plain) {
      expect(drawn.getObjectByName(`site-mark:${id}`), id).toBeDefined();
    }
  } finally {
    close();
    serviced.slotAnchors = undefined;
  }
});

it('opens the model view on the piece front, wherever its frame turns it', () => {
  const { runtime, piece } = stage();
  const frame = new Matrix4().makeRotationY(Math.PI / 2);
  const view = vi.fn();
  const { close } = review(runtime, piece, { pictures: { view }, frame: () => frame });
  try {
    const { yaw } = view.mock.lastCall![1];
    const towardCamera = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const front = new Vector3(0, 0, -1).transformDirection(frame);
    expect(towardCamera.dot(front)).toBeGreaterThan(0);
  } finally {
    close();
  }
});

it('moves the socket picks with the drawn surface when it resizes and reach stands still', () => {
  const { runtime, piece } = stage();
  serviced.slotAnchors = blueprint.slots.map(({ id }, index) => ({
    slot: id,
    position: [index / 4 - 0.35, 0.05, 0.05],
    pickSize: [0.1, 0.1, 0.1],
  }));
  const model = new Mesh(new BoxGeometry(1, 1, 1));
  const { root, update, close } = review(runtime, piece, { depiction: () => ({ model, dispose: () => undefined }) });
  try {
    const canvas = root.querySelector<HTMLCanvasElement>('.craft-target-canvas')!;
    const resize = (width: number) => {
      Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: width });
      Object.defineProperty(canvas, 'clientHeight', { configurable: true, value: width });
      update();
      return [...root.querySelectorAll<HTMLElement>('[data-craft-socket]')].map(({ style }) => [
        style.left,
        style.width,
      ]);
    };
    const wide = resize(300);
    const reach = runtime.session.reach();
    const narrow = resize(150);
    expect(runtime.session.reach(), 'reach stood still').toBe(reach);
    expect(narrow.length).toBe(blueprint.slots.length);
    for (const [index, socket] of narrow.entries()) {
      expect(socket, blueprint.slots[index]!.id).not.toEqual(wide[index]);
    }
    expect(canvas.width, 'the picture redraws at the new size').toBe(150 * (globalThis.devicePixelRatio || 1));
  } finally {
    close();
    serviced.slotAnchors = undefined;
  }
});

it('redraws the open review when its housing stops producing and reach stands still', () => {
  const { runtime, piece } = stage();
  const spare = craftSpare(runtime);
  const { slot } = runtime.session.crafting.partServiceOptions(piece.uid).find(({ operation }) => operation === 'fit')!;
  expect(
    command(runtime, { kind: 'craft.service-part', entityUid: piece.uid, slot, operation: 'fit', itemUid: spare.uid }),
  ).toBeUndefined();
  runFor(runtime, piece.work!, 1);
  expect(lit(runtime), 'the restored module produces').toBe(true);
  const drawn: (boolean | undefined)[] = [];
  const { update, close } = review(runtime, piece, {
    depiction: (entity) => {
      drawn.push(runtime.session.power!.instruments(entity)?.producing);
      return { model: new Group(), dispose: () => undefined };
    },
  });
  try {
    expect(drawn.at(-1)).toBe(true);
    const reach = runtime.session.reach();
    expect(runtime.session.powerControl(piece.uid, false)).toBeUndefined();
    update();
    expect(runtime.session.reach(), 'reach stood still').toBe(reach);
    expect(drawn.at(-1), 'the picture redraws with the stop').toBe(false);
  } finally {
    close();
  }
});

it('runs an instant service through the same review and Start, done at Start as its review shows', () => {
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
  expect(runtime.sim.actions.job, 'no job runs on past the zero time the review shows').toBeUndefined();
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
