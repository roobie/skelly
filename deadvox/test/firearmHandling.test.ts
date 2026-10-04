import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import type { InventoryState } from '../src/core/inventory.ts';
import { Inventory } from '../src/core/inventory.ts';
import {
  FirearmMechanics,
  type FirearmShotEffect,
  firearmHandlingFor,
  spentCaseItemId,
} from '../src/game/firearmHandling.ts';
import { DebugFirearmTrigger } from '../src/game/firearmTrigger.ts';
import { actionPartPaths, cloneHeldModel } from '../src/render/firearmModel.ts';
import { prepareModel } from '../src/render/models.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const caseType = spentCaseItemId('5.56x45');

const inventoryWithRifle = (): { inventory: Inventory; rifle: ReturnType<Inventory['create']> } => {
  const inventory = new Inventory(registry);
  const rifle = inventory.create('debug_rifle_assault');
  if (!inventory.add(rifle, { kind: 'hand', side: 'right' })) {
    throw new Error('could not put the test rifle in the right hand');
  }
  return { inventory, rifle };
};

const pose = { feet: [0, 1, 0], eye: [0, 4, 0], yaw: 0, pitch: 0, blockSize: 0.5 } as const;
const shot = (inventory: Inventory, rifle: ReturnType<Inventory['create']>, simTime = 1) => {
  const effects: FirearmShotEffect[] = [];
  const mechanics = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
    blockSize: 0.5,
    pose: () => ({ ...pose, feet: [...pose.feet], eye: [...pose.eye] }),
    onEjection: (effect) => effects.push(effect),
  });
  if (
    !mechanics.fire({
      ...pose,
      feet: [...pose.feet],
      eye: [...pose.eye],
      debugMode: true,
      item: rifle,
      seed: 71,
      simTime,
    })
  ) {
    throw new Error('Test shot was refused');
  }
  mechanics.advanceTo(simTime + 0.02);
  return effects[0];
};

describe('debug firearm handling', () => {
  it.each([
    [800, 27],
    [600, 20],
  ])('fires exact %i rpm deadlines independent of polling partitions', (rpm, count) => {
    const regular = new DebugFirearmTrigger();
    const coarse = new DebugFirearmTrigger();
    const weapon = { uid: 1, rpm };
    const shots: number[] = [];
    for (let tick = 0; tick < 120; tick++) {
      shots.push(...regular.advance(tick / 60, weapon, tick === 0, true));
    }
    const batched = [
      ...coarse.advance(0, weapon, true, true),
      ...coarse.advance(0.43, weapon, false, true),
      ...coarse.advance(1.99, weapon, false, true),
    ];
    expect(shots).toEqual(batched);
    expect(shots).toHaveLength(count);
    expect(shots).toEqual(Array.from({ length: count }, (_, index) => index * (60 / rpm)));
    expect(regular.advance(2, weapon, false, false)).toEqual([]);
    expect(regular.advance(3, weapon, false, false)).toEqual([]);
  });

  it('unlatches release and quick clicks, and resets cadence on a weapon change', () => {
    const trigger = new DebugFirearmTrigger();
    const weapon = { uid: 1, rpm: 800 };
    expect(trigger.advance(1, weapon, true, false)).toEqual([1]);
    expect(trigger.advance(1.1, weapon, false, false)).toEqual([]);
    expect(trigger.advance(2, weapon, true, true)).toEqual([2]);
    // A release/repress between ticks is still a new trigger edge.
    expect(trigger.advance(2.02, weapon, true, true)).toEqual([2.02]);
    expect(trigger.advance(2.04, { uid: 2, rpm: 600 }, false, true)).toEqual([2.04]);
    expect(trigger.advance(2.14, undefined, false, true)).toEqual([]);
    expect(trigger.advance(4, weapon, true, true)).toEqual([4]);
  });

  it('slugs calibre punctuation injectively for spent-case item IDs', () => {
    expect(spentCaseItemId('5.56x45')).toBe('spent_case_5_d_56x45');
    expect(spentCaseItemId('5_56x45')).toBe('spent_case_5_u_56x45');
    expect(spentCaseItemId('5-56x45')).toBe('spent_case_5_h_56x45');
    expect(new Set(['5.56x45', '5_56x45', '5-56x45'].map(spentCaseItemId)).size).toBe(3);
  });

  it('reads the exported AR and AK cadence and ejection facts without a stand-in', () => {
    const rifleModel = registry.models.get('rifle_assault');
    expect(rifleModel).toMatchObject({
      calibre: '5.56x45',
      anchors: { magwell: [-0.048_875, -0.046, 0] },
    });
    expect(rifleModel?.anchors?.ejection).toEqual([-0.048_875, 0.002_875, 0.023]);
    const { inventory, rifle } = inventoryWithRifle();
    expect(firearmHandlingFor(rifle, registry).rpm).toBe(800);
    expect(firearmHandlingFor(inventory.create('debug_rifle_ak'), registry)).toMatchObject({
      calibre: '7.62x39',
      rpm: 600,
      caseModelId: 'case_7_d_62x39',
    });
    expect(registry.models.get('round_5_d_56x45')?.file).toBe('assets/models/round-5_d_56x45.glb');
    expect(registry.models.get('case_5_d_56x45')?.file).toBe('assets/models/case-5_d_56x45.glb');
    expect(registry.items.get(caseType)?.model).toBe('case_5_d_56x45');
  });

  it('resolves the exported pump calibre and hull without inventing automatic timing', () => {
    const inventory = new Inventory(registry);
    const pump = inventory.create('debug_shotgun_pump');
    expect(inventory.add(pump, { kind: 'hand', side: 'right' })).toBe(true);
    expect(firearmHandlingFor(pump, registry)).toMatchObject({
      calibre: '12-gauge-00-buck',
      caseModelId: 'case_12_h_gauge_h_00_h_buck',
      rpm: undefined,
      action: { hand: { durationSeconds: 1.5 } },
    });
    const mechanics = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    expect(mechanics.fireReason(pump.uid)).toBe('No exported automatic action data for this gun');
  });

  it('admits and loads an unannotated held gun while its mechanics refuse without synthetic data', async () => {
    const fixture = buildRegistry([
      {
        source: 'no-calibre-fixture.json',
        data: {
          models: [{ id: 'pistol_full', file: 'assets/models/pistol_full.glb' }],
          items: [
            {
              id: 'unannotated_gun',
              name: 'Unannotated gun',
              category: 'weapon',
              weight: 1000,
              size: [1, 1],
              model: 'pistol_full',
              firearm: {},
            },
          ],
        },
      },
    ]);
    expect(fixture.issues).toEqual([]);
    const model = fixture.registry.models.get('pistol_full')!;
    expect(model.calibre).toBeUndefined();
    const bytes = readFileSync(join(BASE, model.file));
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      '',
    );
    const held = cloneHeldModel(
      prepareModel(model, gltf.scene).held,
      actionPartPaths(gltf.scene, model.action, gltf.parser),
    );
    expect(held.root.children.length).toBeGreaterThan(0);
    expect(held.parts).toEqual([]);
    const inventory = new Inventory(fixture.registry);
    const gun = inventory.create('unannotated_gun');
    expect(inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
    expect(inventory.name(inventory.hands.right!)).toBe('Unannotated gun');
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const before = inventory.snapshotState();
    expect(mechanics.fireReason(gun.uid)).toBe('No exported action data for this gun');
    expect(
      mechanics.fire({
        ...pose,
        feet: [...pose.feet],
        eye: [...pose.eye],
        debugMode: true,
        item: gun,
        seed: 1,
        simTime: 0,
      }),
    ).toBe(false);
    expect(mechanics.cock(gun.uid, 0)).toBe('No exported action data for this gun');
    expect(queue.jobs).toEqual([]);
    expect(inventory.snapshotState()).toEqual(before);
  });

  it('does not fire outside debug mode', () => {
    const { inventory, rifle } = inventoryWithRifle();
    const { version } = inventory;
    const mechanics = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const result = mechanics.fire({
      debugMode: false,
      item: rifle,
      feet: [0, 1, 0],
      eye: [0, 4, 0],
      yaw: 0,
      pitch: 0,
      seed: 71,
      simTime: 1,
      blockSize: 0.5,
    });
    expect(result).toBe(false);
    expect(rifle.firearm).toBeUndefined();
    expect(inventory.version).toBe(version);
    expect(inventory.piles.size).toBe(0);
    expect(rifle.count).toBe(1);
  });

  it('uses exported cock duration in the handling queue and prevents firing during the hand action', () => {
    const { inventory, rifle } = inventoryWithRifle();
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const duration = firearmHandlingFor(rifle, registry).action.hand.durationSeconds;
    expect(mechanics.cock(rifle.uid, 10)).toBeUndefined();
    expect(queue.jobs[0]?.duration).toBe(duration);
    expect(
      mechanics.fire({
        ...pose,
        feet: [...pose.feet],
        eye: [...pose.eye],
        debugMode: true,
        item: rifle,
        seed: 71,
        simTime: 10,
      }),
    ).toBe(false);
    queue.tick(0.3);
    mechanics.advanceTo(10.3);
    expect(mechanics.frames()).toEqual([{ uid: rifle.uid, mode: 'hand', elapsed: 0.3 }]);
    queue.tick(duration - 0.3);
    expect(queue.busy).toBe(false);
    expect(mechanics.frames()).toEqual([]);
    expect(rifle.firearm?.chamber).toBe('round');
  });

  it('cancels only manual motion in a snapshot, retaining an unejected fired chamber', () => {
    const { inventory, rifle } = inventoryWithRifle();
    rifle.firearm = {
      chamber: 'case',
      pendingCase: { origin: [0, 2, 0], direction: [1, 0, 0], feet: [0, 1, 0], seed: 71 },
    };
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    expect(mechanics.cock(rifle.uid, 10)).toBeUndefined();
    queue.tick(0.2);
    mechanics.advanceTo(10.2);
    const saved = inventory.snapshotState();
    expect(saved.hands.right?.firearm).toEqual({ chamber: 'case', pendingCase: rifle.firearm.pendingCase });
    expect(rifle.firearm.cycle?.mode).toBe('hand');
    const restored = Inventory.restoreState(registry, saved);
    expect(restored.hands.right?.firearm?.pendingCase).toEqual(rifle.firearm.pendingCase);
    queue.cancel();
    mechanics.advanceTo(10.3);
    expect(rifle.firearm.cycle).toBeUndefined();
    expect(rifle.firearm.chamber).toBe('case');
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
      speed: 3.5,
      caseModelId: 'case_5_d_56x45',
    });
    expect(inventory.pileAt([0, 1, 0])?.items.find(({ item }) => item.type === 'nails')?.item.count).toBe(2);
    expect(inventory.pileAt([2, 1, 0])?.items.find(({ item }) => item.type === caseType)?.item.count).toBe(6);
    expect(inventory.pileAt([45, 1, 0])?.items.find(({ item }) => item.type === caseType)?.item.count).toBe(11);

    const saved = JSON.parse(JSON.stringify(inventory.snapshotState())) as InventoryState;
    const restored = Inventory.restoreState(registry, saved);
    expect(restored.snapshotState()).toEqual(saved);
  });

  it('creates a deterministic case pile from the exported held pose when none is within 20 m', () => {
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
