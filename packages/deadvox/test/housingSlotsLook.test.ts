// Core evidence for the housing-slot look: no approved interaction surface exists, so the look stages state that
// this test drives through the engine instead of a screen.
import { slotProps } from '@skelly/engine/internal/core/showroom.ts';
import { Inventory } from '@skelly/engine/inventory';
import { selectBundledMods } from '@skelly/engine/packs';
import { AuthoredSite, BlockEntities, makeScale, toChunk } from '@skelly/engine/world';
import { expect, it } from 'vitest';
import { productModIntake } from '../src/product/mods.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';

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
  return { inventory, housings, full, held };
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
