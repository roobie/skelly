import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { aimDirection } from '../src/core/aim.ts';
import { buildRegistry } from '../src/core/content.ts';
import { SKILL_LEVEL_MAX } from '../src/core/character.ts';
import { actionCycleSeconds, ejectSeconds } from '../src/core/firearmAction.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import type { InventoryState } from '../src/core/inventory.ts';
import { Inventory } from '../src/core/inventory.ts';
import {
  type DebugFirearmShotInput,
  FirearmMechanics,
  type FirearmShotEffect,
  type FirearmTrajectory,
  firearmHandlingFor,
  spentCaseItemId,
} from '../src/game/firearmHandling.ts';
import { DebugFirearmTrigger } from '../src/game/firearmTrigger.ts';
import { actionPartPaths, cloneHeldModel, sampleActionStroke } from '../src/render/firearmModel.ts';
import { prepareModel } from '../src/render/models.ts';

const BASE = 'src/content/base';
const base = readdirSync(BASE)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown }));
const { registry } = buildRegistry(base);
const caseType = spentCaseItemId('5.56x45');

const inventoryWithRifle = (): { inventory: Inventory; rifle: ReturnType<Inventory['create']> } => {
  const inventory = new Inventory(registry);
  const rifle = inventory.create('debug_rifle_assault');
  if (!inventory.add(rifle, { kind: 'hand', side: 'right' })) {
    throw new Error('could not put the test rifle in the right hand');
  }
  return { inventory, rifle };
};

const pose = {
  feet: [0, 1, 0],
  eye: [0, 4, 0],
  yaw: 0,
  pitch: 0,
  aimFrame: { yaw: 0, pitch: 0 },
  blockSize: 0.5,
} as const;
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
  it('emits fixture firearm dispersion independently of firearms skill', () => {
    const definition = registry.items.get('debug_rifle_assault')!;
    const fixtureBuild = buildRegistry([
      ...base,
      {
        source: 'skill-dispersion-fixture.json',
        data: {
          items: [
            {
              ...definition,
              id: 'fixture_skill_rifle',
              name: 'Skill fixture rifle',
              firearm: { ...definition.firearm!, dispersionRadians: 0.01 },
            },
          ],
        },
      },
    ]);
    expect(fixtureBuild.issues).toEqual([]);
    const fixtureRegistry = fixtureBuild.registry;
    const aimFrame = { yaw: 0.04, pitch: -0.03 };
    const yaw = 0.3;
    const pitch = -0.2;
    const publish = (skill: number): FirearmTrajectory => {
      const inventory = new Inventory(fixtureRegistry);
      const rifle = inventory.create('fixture_skill_rifle');
      if (!inventory.add(rifle, { kind: 'hand', side: 'right' })) {
        throw new Error('Could not hold the skill fixture firearm');
      }
      let trajectory: FirearmTrajectory | undefined;
      const mechanics = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
        blockSize: 0.5,
        pose: () => ({ ...pose, feet: [...pose.feet], eye: [...pose.eye] }),
        onEjection: () => undefined,
        onTrajectory: (published) => {
          trajectory = published;
        },
        firearmsSkillLevel: () => skill,
      });
      expect(
        mechanics.fire({
          ...pose,
          feet: [...pose.feet],
          eye: [...pose.eye],
          yaw,
          pitch,
          aimFrame,
          debugMode: true,
          item: rifle,
          seed: 71,
          simTime: 1,
        }),
      ).toBe(true);
      if (!trajectory) {
        throw new Error('Committed rifle shot did not publish a trajectory');
      }
      return trajectory;
    };
    const novice = publish(0);
    const experienced = publish(SKILL_LEVEL_MAX);
    const direction = novice.directions[0]!;
    const baseDirection = aimDirection(yaw, pitch, aimFrame);
    const fixtureItem = new Inventory(fixtureRegistry).create('fixture_skill_rifle');
    const cone = firearmHandlingFor(fixtureItem, fixtureRegistry).dispersionRadians!;
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          baseDirection.reduce((sum, value, index) => sum + value * direction[index]!, 0),
        ),
      ),
    );
    expect(angle).toBeGreaterThan(0);
    expect(angle).toBeLessThanOrEqual(cone + 1e-10);
    expect(experienced.directions).toEqual(novice.directions);
  });
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

  it('reads rifle action and calibre from each item model and selects a matching exported case', () => {
    const { inventory, rifle } = inventoryWithRifle();
    for (const item of [rifle, inventory.create('debug_rifle_ak')]) {
      const model = registry.models.get(registry.items.get(item.type)!.model!)!;
      const data = firearmHandlingFor(item, registry);
      expect(data.model).toBe(model);
      expect(data.action).toBe(model.action);
      expect(data.rpm).toBe(model.action!.rpm);
      expect(data.calibre).toBe(model.calibre);
      expect(data.caseModelId?.startsWith('case_')).toBe(true);
      expect(registry.models.get(data.caseModelId!)?.calibre).toBe(model.calibre);
    }
  });

  it('passes the held firearm’s data-owned kick with each committed shot', () => {
    const { inventory, rifle } = inventoryWithRifle();
    const kicks: number[] = [];
    const mechanics = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
      blockSize: 0.5,
      pose: () => ({ feet: [...pose.feet], eye: [...pose.eye], yaw: pose.yaw, pitch: pose.pitch, blockSize: 0.5 }),
      onEjection: () => undefined,
      onCommittedShot: (_seed, recoilKickRadians) => kicks.push(recoilKickRadians),
    });
    const configuredKick = firearmHandlingFor(rifle, registry).recoilKickRadians;
    const firearmDef = registry.items.get(rifle.type)!.firearm!;
    expect(configuredKick).toBe(firearmDef.recoilKickRadians);
    if (configuredKick === undefined) {
      throw new Error('Firing fixture needs firearm kick data');
    }

    expect(
      mechanics.fire({
        ...pose,
        feet: [...pose.feet],
        eye: [...pose.eye],
        debugMode: true,
        item: rifle,
        seed: 71,
        simTime: 1,
      }),
    ).toBe(true);
    expect(kicks).toEqual([configuredKick]);
  });

  it('aligns ejection and held stroke when rpm caps a longer exported automatic cycle', () => {
    const model = registry.models.get('rifle_assault')!;
    const action = structuredClone(model.action!);
    const fire = action.fire!;
    const fixtureStretch = ((60 / action.rpm!) * 2) / fire.durationSeconds;
    for (const key of ['durationSeconds', 'rearwardSeconds', 'dwellSeconds', 'forwardSeconds'] as const) {
      fire[key] *= fixtureStretch;
    }
    const fixture = { ...registry, models: new Map(registry.models) };
    fixture.models.set(model.id, { ...model, action });
    const inventory = new Inventory(fixture);
    const rifle = inventory.create('debug_rifle_assault');
    expect(inventory.add(rifle, { kind: 'hand', side: 'right' })).toBe(true);
    const mechanics = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    expect(
      mechanics.fire({
        ...pose,
        feet: [...pose.feet],
        eye: [...pose.eye],
        debugMode: true,
        item: rifle,
        seed: 71,
        simTime: 1,
      }),
    ).toBe(true);
    const duration = 60 / action.rpm!;
    const ejectAt = (fire.rearwardSeconds * action.ejectAt * duration) / fire.durationSeconds;
    expect(actionCycleSeconds(action, 'fire')).toBe(duration);
    expect(ejectSeconds(action, 'fire')).toBeCloseTo(ejectAt);
    expect(sampleActionStroke(action, 'fire', ejectAt)).toBeCloseTo(action.ejectAt);
    mechanics.advanceTo(1 + ejectAt - 1e-6);
    expect(inventory.piles.size).toBe(0);
    mechanics.advanceTo(1 + ejectAt);
    expect(inventory.piles.size).toBe(1);
    mechanics.advanceTo(1 + duration);
    expect(mechanics.frames()).toEqual([]);
    expect(rifle.firearm?.chamber).toBe('round');
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
              firearm: { recoilKickRadians: 0.012, dispersionRadians: 0.01 },
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
      aimFrame: { yaw: 0, pitch: 0 },
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

  it('refuses an empty chamber after cock cancellation past ejection while a fresh virtual round still fires', () => {
    const { inventory, rifle } = inventoryWithRifle();
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const input: DebugFirearmShotInput = {
      ...pose,
      feet: [...pose.feet],
      eye: [...pose.eye],
      debugMode: true,
      item: rifle,
      seed: 71,
      simTime: 0,
    };
    // Control: the debug rifle starts with a virtual round, and the environment can fire it.
    expect(mechanics.fire(input)).toBe(true);
    mechanics.advanceTo(1);
    expect(mechanics.cock(rifle.uid, 1)).toBeUndefined();
    const elapsed = firearmHandlingFor(rifle, registry).action.hand.rearwardSeconds;
    queue.tick(elapsed);
    mechanics.advanceTo(1 + elapsed);
    queue.cancel();
    mechanics.advanceTo(1 + elapsed);
    expect(rifle.firearm).toEqual({ chamber: 'empty', pendingCase: undefined, cycle: undefined });
    const before = inventory.snapshotState();
    const reason = mechanics.fireReason(rifle.uid);
    const admitted = mechanics.fire({ ...input, simTime: 1 + elapsed });
    expect(reason).toBeDefined();
    expect(admitted).toBe(false);
    expect(inventory.snapshotState()).toEqual(before);
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
    expect(mechanics.cockReason(rifle.uid)).toBeUndefined();
    expect(mechanics.cock(rifle.uid, 10)).toBeUndefined();
    expect(mechanics.cockReason(rifle.uid)).toBeDefined();
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
    expect(mechanics.frames()).toEqual([{ uid: rifle.uid, mode: 'hand', elapsed: 0.3, duration }]);
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
