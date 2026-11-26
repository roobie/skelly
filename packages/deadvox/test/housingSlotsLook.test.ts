// Core evidence for the housing-slot look: no approved interaction surface exists, so the look stages state that
// this test drives through the engine instead of a screen.
import { type FurnitureMover, ruinFurniture } from '@skelly/engine/internal/core/furnitureMove.ts';
import { slotProps } from '@skelly/engine/internal/core/showroom.ts';
import { type PlacedPowerDevice, placedPowerDevices } from '@skelly/engine/internal/core/sitePower.ts';
import { simTimestamp } from '@skelly/engine/internal/core/time.ts';
import { Inventory } from '@skelly/engine/inventory';
import { selectBundledMods } from '@skelly/engine/packs';
import { AuthoredSite, BlockEntities, makeScale, SitePower, toChunk } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { productModIntake } from '../src/product/mods.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { BASE_CLOCK, BASE_DAY_CYCLE } from './dayPhaseFixture.ts';

const mod = 'skelly.deadvox.scenario.test-house.housing-slots-look';
const selected = withReusedBuilds(() => selectBundledMods(productModIntake, [mod]));
const { registry } = selected.content;
const layout = registry.layouts.get('testHouseHousingSlots')!;
const start = [...registry.starts.values()].find(({ site }) => site === layout.id)!;
const seed = start.seed!;

const stage = () => {
  const site = new AuthoredSite(seed, registry, makeScale(0.5), layout);
  const inventory = new Inventory(registry, undefined, new BlockEntities(registry, seed));
  const props = slotProps(registry, layout.showroom!);
  const columns = new Map(
    props.map(({ pos }) => {
      const column = [toChunk(pos[0]), toChunk(pos[2])] as const;
      return [column.join(','), column];
    }),
  );
  for (const [cx, cz] of columns.values()) {
    for (const spawn of site.furnitureIn(cx, cz)) {
      inventory.furnishSpawn(spawn);
    }
  }
  const pieces = props.map(({ pos }) => inventory.entities.atOrigin(pos)!);
  const housings = pieces.filter((piece) => inventory.entities.housingView(piece).length > 0);
  const full = pieces.find((piece) => piece.pockets?.flat().length)!;
  const held = (id: string) => {
    const kitRow = start.kit.find((row) => row.id === id)!;
    const item = inventory.create(kitRow.item);
    if (!inventory.add(item, { kind: 'hand', side: 'right' })) {
      throw new Error(`Kit part "${kitRow.item}" did not reach the hand`);
    }
    return item;
  };
  return { inventory, housings, full, held, site, columns };
};

it('stages fixed housings, a full destination, and a spare that fits where the odd part does not', () => {
  expect(selected.issues).toEqual([]);
  const { inventory, housings, full, held } = stage();
  expect(housings.length).toBeGreaterThan(1);
  expect(housings.every((piece) => piece.fixed)).toBe(true);
  const [housing] = housings as [(typeof housings)[number]];
  const views = inventory.entities.housingView(housing);
  const open = views.find(({ part }) => !part)!;
  const filled = views.find(({ part }) => part)!;

  const before = JSON.stringify(inventory.snapshotState());
  expect(
    inventory.housingTransfer({
      kind: 'remove',
      entityUid: housing.uid,
      slot: filled.slot,
      output: { kind: 'furniture', entity: full, pocket: 0 },
    }),
  ).toBeDefined();
  expect(JSON.stringify(inventory.snapshotState())).toBe(before);

  const odd = held('odd');
  expect(
    inventory.housingTransfer({ kind: 'fit', entityUid: housing.uid, slot: open.slot, itemUid: odd.uid }),
  ).toBeDefined();
  expect(inventory.consume(odd, 1)).toBe(true);

  const spare = held('spare');
  expect(
    inventory.housingTransfer({ kind: 'fit', entityUid: housing.uid, slot: open.slot, itemUid: spare.uid }),
  ).toBeUndefined();
});

/** The stage's bus, with the modules and the lamp they light; `now` is the time a parts change settles at. */
const plant = ({ inventory, site, columns }: ReturnType<typeof stage>) => {
  const devices = placedPowerDevices(registry, site.authoredPlacements);
  const modules = devices.filter((device) => registry.furniture.get(device.type)!.power!.requires);
  const lamp = devices.find((device) => registry.furniture.get(device.type)!.power!.light)!;
  const clock = { now: 0 };
  const bind = (owner: Inventory, saved?: ReturnType<SitePower['network']['snapshot']>) => {
    const power = new SitePower({
      registry,
      inventory: owner,
      // Only the columns whose complete furniture supply the stage furnished have arrived.
      arrived: (origin) => columns.has([toChunk(origin[0]), toChunk(origin[2])].join(',')),
      devices,
      clock: BASE_CLOCK,
      cycle: BASE_DAY_CYCLE,
      ...(saved ? { saved } : {}),
    });
    owner.entities.aroundPartsChange = (entity, change) => power.aroundChange(simTimestamp(clock.now), entity, change);
    return power;
  };
  const pieces = modules.map((device) => inventory.entities.atOrigin(device.pos)!);
  return { devices, modules, lamp, clock, bind, pieces };
};

it('stages a failed and a working module on one bus, whose lamp the fitted spare keeps lit across a reload', () => {
  const staged = stage();
  const { inventory } = staged;
  const { devices, modules, lamp, clock, bind, pieces } = plant(staged);
  const kind = (device: PlacedPowerDevice) =>
    registry.powerDevices.get(registry.furniture.get(device.type)!.power!.device)!.kind;
  // No supply but the modules, so the lamp shows what they produce.
  expect(devices.filter((device) => !['consumer', 'switch'].includes(kind(device)))).toEqual(modules);
  const power = bind(inventory);
  const failed = pieces.find((piece) => !inventory.entities.housingView(piece).every(({ part }) => part))!;
  const working = pieces.find((piece) => piece !== failed && power.control(piece)!.enabled)!;
  expect(power.isPowered(lamp)).toBe(true);

  clock.now = 1;
  power.network.setEnabled(simTimestamp(clock.now), power.control(working)!.id, false);
  expect(power.isPowered(lamp)).toBe(false);
  expect(power.control(failed)!.enabled).toBe(true);

  clock.now = 2;
  // The look crafts its core from the kit; the transfer under check starts once one is in hand.
  const core = inventory.create('fixture_plant_core');
  expect(inventory.add(core, { kind: 'hand', side: 'right' })).toBe(true);
  const [slot] = inventory.entities.housingView(failed);
  expect(
    inventory.housingTransfer({ kind: 'fit', entityUid: failed.uid, slot: slot!.slot, itemUid: core.uid }),
  ).toBeUndefined();
  expect(power.isPowered(lamp)).toBe(true);

  const reloaded = Inventory.restoreState(registry, JSON.parse(JSON.stringify(inventory.snapshotState())));
  const restored = bind(reloaded, JSON.parse(JSON.stringify(power.network.snapshot())));
  clock.now = 3;
  restored.advance(simTimestamp(clock.now));
  expect(restored.isPowered(lamp)).toBe(true);
  expect(reloaded.entities.housingView(reloaded.entities.byUid(failed.uid)!)).toEqual(
    inventory.entities.housingView(failed),
  );
});

it('stages worn modules one blow from ruin: the open one falls to piles with its parts, the blocked one stands failed', () => {
  const staged = stage();
  const { inventory } = staged;
  const { lamp, clock, bind, pieces } = plant(staged);
  const power = bind(inventory);
  const ruinable = pieces.filter((piece) => !power.control(piece)!.enabled);
  expect(ruinable.length, 'the worn modules start switched off').toBe(2);
  for (const piece of pieces) {
    clock.now += 1;
    power.network.setEnabled(simTimestamp(clock.now), power.control(piece)!.id, ruinable.includes(piece));
  }
  expect(power.isPowered(lamp), 'the worn modules alone light the lamp').toBe(true);
  // The deck is the only floor: the kerbs beside the pile-filling frame, not missing ground, are what block a ruin.
  const deck = Math.round(layout.player.position[1] / 0.5);
  const mover: FurnitureMover = {
    inventory,
    terrainSolid: (_x, y) => y < deck,
    blockSize: 0.5,
    player: { pos: [0, deck, 40], vel: [0, 0, 0], halfWidth: 0.4, height: 3.6, onGround: true },
    others: [],
    stamina: 100,
  };
  const outcomes = ruinable.map((piece) => {
    const parts = inventory.entities.housingView(piece).filter(({ part }) => part);
    clock.now += 1;
    const { minimumStrength } = inventory.entities.defOf(piece).breach;
    expect(inventory.entities.bash(piece, { strength: minimumStrength, kind: 'blunt' })).toBe('ruined');
    return { piece, parts, destroyed: ruinFurniture(mover, piece) };
  });
  const open = outcomes.find(({ destroyed }) => destroyed)!;
  const blocked = outcomes.find(({ destroyed }) => !destroyed)!;
  expect(open && blocked, 'one module ruins and one is blocked').toBeTruthy();
  expect(open.parts.length).toBeGreaterThan(0);
  const piled = [...inventory.piles.values()].flatMap(({ items }) => items.map(({ item }) => item));
  for (const { part } of open.parts) {
    expect(piled).toContainEqual(expect.objectContaining({ type: part!.type, condition: part!.condition }));
  }
  expect(inventory.entities.byUid(blocked.piece.uid)).toBe(blocked.piece);
  expect(inventory.entities.housingView(blocked.piece).filter(({ part }) => part)).toEqual(blocked.parts);
  expect(power.isPowered(lamp)).toBe(false);
  expect(power.control(blocked.piece)!.enabled).toBe(true);
});
