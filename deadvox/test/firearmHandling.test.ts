import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import type { InventoryState } from '../src/core/inventory.ts';
import { Inventory } from '../src/core/inventory.ts';
import {
  debugFirearmShot,
  FIREARM_HANDLING_STAND_IN,
  firearmHandlingFor,
  spentCaseItemId,
} from '../src/game/firearmHandling.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const caseType = spentCaseItemId(FIREARM_HANDLING_STAND_IN.calibre);

const inventoryWithRifle = (): { inventory: Inventory; rifle: ReturnType<Inventory['create']> } => {
  const inventory = new Inventory(registry);
  const rifle = inventory.create('debug_rifle_assault');
  if (!inventory.add(rifle, { kind: 'hand', side: 'right' })) {
    throw new Error('could not put the test rifle in the right hand');
  }
  return { inventory, rifle };
};

const shot = (inventory: Inventory, rifle: ReturnType<Inventory['create']>, simTime = 1) =>
  debugFirearmShot({
    debugMode: true,
    inventory,
    item: rifle,
    feet: [0, 1, 0],
    eye: [0, 4, 0],
    yaw: 0,
    pitch: 0,
    aim: [0, 0, -1],
    seed: 71,
    simTime,
    blockSize: 0.5,
  });

describe('debug firearm handling', () => {
  it('slugs calibre punctuation injectively for spent-case item IDs', () => {
    expect(spentCaseItemId('5.56x45')).toBe('spent_case_5_d_56x45');
    expect(spentCaseItemId('5_56x45')).toBe('spent_case_5_u_56x45');
    expect(spentCaseItemId('5-56x45')).toBe('spent_case_5_h_56x45');
    expect(new Set(['5.56x45', '5_56x45', '5-56x45'].map(spentCaseItemId)).size).toBe(3);
  });

  it('consumes g34 calibre and case/round exports while retaining the missing ejection stand-in', () => {
    const rifleModel = registry.models.get('rifle_assault');
    expect(rifleModel).toMatchObject({
      calibre: '5.56x45',
      anchors: { magwell: [-0.048_875, -0.046, 0] },
    });
    expect(rifleModel?.anchors?.ejection).toBeUndefined();
    expect(registry.models.get('round_5_d_56x45')?.file).toBe('assets/models/round-5_d_56x45.glb');
    expect(registry.models.get('case_5_d_56x45')?.file).toBe('assets/models/case-5_d_56x45.glb');
    expect(registry.items.get(caseType)?.model).toBe('case_5_d_56x45');
  });

  it('does not fire outside debug mode', () => {
    const { inventory, rifle } = inventoryWithRifle();
    const { version } = inventory;
    expect(firearmHandlingFor(rifle, inventory.registry)).toMatchObject({
      calibre: '5.56x45',
      caseModelId: 'case_5_d_56x45',
      ejection: FIREARM_HANDLING_STAND_IN.ejection,
      cycle: FIREARM_HANDLING_STAND_IN.cycle,
      rpm: FIREARM_HANDLING_STAND_IN.rpm,
    });
    expect(firearmHandlingFor(inventory.create('debug_shotgun_pump'), inventory.registry)).toBe(
      FIREARM_HANDLING_STAND_IN,
    );
    const result = debugFirearmShot({
      debugMode: false,
      inventory,
      item: rifle,
      feet: [0, 1, 0],
      eye: [0, 4, 0],
      yaw: 0,
      pitch: 0,
      aim: [0, 0, -1],
      seed: 71,
      simTime: 1,
      blockSize: 0.5,
    });
    expect(result).toBeUndefined();
    expect(inventory.version).toBe(version);
    expect(inventory.piles.size).toBe(0);
    expect(rifle.count).toBe(1);
  });

  it('adds a case to the nearest matching pile and round-trips it through inventory save state', () => {
    const { inventory, rifle } = inventoryWithRifle();
    const nearestDifferent = inventory.create('nails', 2);
    const nearestCases = inventory.create(caseType, 5);
    const fartherCases = inventory.create(caseType, 11);
    expect(inventory.add(nearestDifferent, { kind: 'pile', pos: [0, 1, 0] })).toBe(true);
    expect(inventory.add(nearestCases, { kind: 'pile', pos: [2, 1, 0] })).toBe(true);
    expect(inventory.add(fartherCases, { kind: 'pile', pos: [45, 1, 0] })).toBe(true);

    expect(shot(inventory, rifle)).toMatchObject({
      speed: FIREARM_HANDLING_STAND_IN.ejection.speed,
      caseModelId: 'case_5_d_56x45',
    });
    expect(inventory.pileAt([0, 1, 0])?.items.find(({ item }) => item.type === 'nails')?.item.count).toBe(2);
    expect(inventory.pileAt([2, 1, 0])?.items.find(({ item }) => item.type === caseType)?.item.count).toBe(6);
    expect(inventory.pileAt([45, 1, 0])?.items.find(({ item }) => item.type === caseType)?.item.count).toBe(11);

    const saved = JSON.parse(JSON.stringify(inventory.snapshotState())) as InventoryState;
    const restored = Inventory.restoreState(registry, saved);
    expect(restored.snapshotState()).toEqual(saved);
  });

  it('creates a deterministic case pile at the stand-in landing point when none is within 20 m', () => {
    const first = inventoryWithRifle();
    const second = inventoryWithRifle();
    const firstEffect = shot(first.inventory, first.rifle, 2.5);
    const secondEffect = shot(second.inventory, second.rifle, 2.5);
    expect(firstEffect).toEqual(secondEffect);
    expect(first.inventory.snapshotState()).toEqual(second.inventory.snapshotState());
    expect(first.inventory.piles.size).toBe(1);
    const [pile] = first.inventory.piles.values();
    expect(pile?.items.map(({ item }) => [item.type, item.count])).toEqual([[caseType, 1]]);
    expect(pile?.pos[1]).toBe(1);
  });
});
