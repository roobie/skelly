// Core evidence for the housing-slot look: no approved interaction surface exists, so the look stages state that
// this test drives through the engine instead of a screen.
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
  const pieces = slotProps(registry, layout.showroom!).map((prop) => {
    const spawn = site
      .furnitureIn(toChunk(prop.pos[0]), toChunk(prop.pos[2]))
      .find(({ spec }) => spec.type === prop.furniture && spec.pos.join() === prop.pos.join())!;
    return inventory.furnishSpawn(spawn)!;
  });
  const housings = pieces.filter((piece) => inventory.entities.housingView(piece).length > 0);
  const full = pieces.find((piece) => piece.pockets?.flat().length)!;
  const held = (slot: string) => {
    const kitRow = start.kit.find(({ destination }) => destination.kind === slot)!;
    const item = inventory.create(kitRow.item);
    if (!inventory.add(item, { kind: 'hand', side: 'right' })) {
      throw new Error(`Kit part "${kitRow.item}" did not reach the hand`);
    }
    return item;
  };
  return { inventory, housings, full, held, site };
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

  const odd = held('pocket');
  expect(
    inventory.housingTransfer({ kind: 'fit', entityUid: housing.uid, slot: open.slot, itemUid: odd.uid }),
  ).toBeDefined();
  expect(inventory.consume(odd, 1)).toBe(true);

  const spare = held('hand');
  expect(
    inventory.housingTransfer({ kind: 'fit', entityUid: housing.uid, slot: open.slot, itemUid: spare.uid }),
  ).toBeUndefined();
});

it('stages a failed and a working module on one bus, whose lamp the fitted spare keeps lit across a reload', () => {
  const { inventory, site } = stage();
  const devices = placedPowerDevices(registry, site.authoredPlacements);
  const kind = (device: PlacedPowerDevice) =>
    registry.powerDevices.get(registry.furniture.get(device.type)!.power!.device)!.kind;
  const modules = devices.filter((device) => registry.furniture.get(device.type)!.power!.requires);
  const lamp = devices.find((device) => registry.furniture.get(device.type)!.power!.light)!;
  // No supply but the modules, so the lamp shows what they produce.
  expect(devices.filter((device) => !['consumer', 'switch'].includes(kind(device)))).toEqual(modules);
  let now = 0;
  const bind = (owner: Inventory, saved?: ReturnType<SitePower['network']['snapshot']>) => {
    const power = new SitePower({
      registry,
      inventory: owner,
      devices,
      clock: BASE_CLOCK,
      cycle: BASE_DAY_CYCLE,
      ...(saved ? { saved } : {}),
    });
    owner.entities.aroundPartsChange = (entity, change) => power.aroundChange(simTimestamp(now), entity, change);
    return power;
  };
  const power = bind(inventory);
  const pieces = modules.map((device) => inventory.entities.atOrigin(device.pos)!);
  const failed = pieces.find((piece) => !inventory.entities.housingView(piece).every(({ part }) => part))!;
  const working = pieces.find((piece) => piece !== failed)!;
  expect(power.isPowered(lamp)).toBe(true);

  now = 1;
  power.network.setEnabled(simTimestamp(now), power.control(working)!.id, false);
  expect(power.isPowered(lamp)).toBe(false);
  expect(power.control(failed)!.enabled).toBe(true);

  now = 2;
  const kitRow = start.kit.find(({ item }) => item.startsWith('fixture_plant'))!;
  const core = inventory.create(kitRow.item);
  expect(inventory.add(core, { kind: 'hand', side: 'right' })).toBe(true);
  const [slot] = inventory.entities.housingView(failed);
  expect(
    inventory.housingTransfer({ kind: 'fit', entityUid: failed.uid, slot: slot!.slot, itemUid: core.uid }),
  ).toBeUndefined();
  expect(power.isPowered(lamp)).toBe(true);

  const reloaded = Inventory.restoreState(registry, JSON.parse(JSON.stringify(inventory.snapshotState())));
  const restored = bind(reloaded, JSON.parse(JSON.stringify(power.network.snapshot())));
  now = 3;
  restored.advance(simTimestamp(now));
  expect(restored.isPowered(lamp)).toBe(true);
  expect(reloaded.entities.housingView(reloaded.entities.byUid(failed.uid)!)).toEqual(
    inventory.entities.housingView(failed),
  );
});
