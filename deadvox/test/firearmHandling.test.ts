import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { aimBasis, NEUTRAL_AIM } from '../src/core/aim.ts';
import { SKILL_LEVEL_MAX } from '../src/core/character.ts';
import type { Registry } from '../src/core/content.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { actionCycleSeconds, ejectSeconds } from '../src/core/firearmAction.ts';
import { firearmsSkillEffects } from '../src/core/firearmsSkill.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldFirearmTransform } from '../src/core/heldPose.ts';
import type { InventoryState } from '../src/core/inventory.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { simSeconds } from '../src/core/time.ts';
import {
  FirearmMechanics,
  type FirearmShotEffect,
  type FirearmShotInput,
  type FirearmTrajectory,
  firearmHandlingFor,
  spentCaseItemId,
} from '../src/game/firearmHandling.ts';
import { FirearmTrigger } from '../src/game/firearmTrigger.ts';
import { actionPartPaths, cloneHeldModel, sampleActionStroke } from '../src/render/firearmModel.ts';
import { prepareModel } from '../src/render/models.ts';
import { chargedRifle } from './rifleFixture.ts';

const BASE = 'src/content/base';
const base = readdirSync(BASE)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown }));
const { registry } = buildRegistry(base);
const { registry: skillZeroRegistry } = buildRegistry([
  ...base,
  {
    source: 'skill-zero-firearms.json',
    data: {
      items: [
        {
          id: 'fixture_light_gun',
          name: 'Fixture light gun',
          category: 'weapon',
          weight: 1,
          size: [1, 1],
          firearm: {
            recoilKickRadians: 0.01,
            dispersionRadians: 0,
            skillZeroHandling: {
              singleShot: { variance: 1.2, recoilKickScale: 2, recoilRecoveryScale: 0.8 },
              automaticFollowup: { variance: 2, recoilKickScale: 4, recoilRecoveryScale: 0.6 },
            },
          },
        },
        {
          id: 'fixture_heavy_gun',
          name: 'Fixture heavy gun',
          category: 'weapon',
          weight: 1,
          size: [1, 1],
          firearm: {
            recoilKickRadians: 0.02,
            dispersionRadians: 0,
            skillZeroHandling: {
              singleShot: { variance: 2.5, recoilKickScale: 12, recoilRecoveryScale: 0.2 },
              automaticFollowup: { variance: 4, recoilKickScale: 20, recoilRecoveryScale: 0.1 },
            },
          },
        },
        {
          id: 'fixture_shared_gun',
          name: 'Fixture shared gun',
          category: 'weapon',
          weight: 1,
          size: [1, 1],
          firearm: { recoilKickRadians: 0.01, dispersionRadians: 0 },
        },
      ],
    },
  },
]);
const caseType = spentCaseItemId('5.56x45');
const worldVector = (vector: readonly number[], yaw: number, pitch: number): [number, number, number] => {
  const { right, up, forward } = aimBasis(yaw, pitch, NEUTRAL_AIM);
  return [0, 1, 2].map((axis) => right[axis]! * vector[0]! + up[axis]! * vector[1]! - forward[axis]! * vector[2]!) as [
    number,
    number,
    number,
  ];
};

const pose = {
  feet: [0, 1, 0],
  eye: [0, 4, 0],
  yaw: 0,
  pitch: 0,
  aimFrame: { yaw: 0, pitch: 0 },
  blockSize: 0.5,
  ready: true,
  sprinting: false,
} as const;
const fixturePose = () => ({ ...pose, feet: [...pose.feet] as Vec3, eye: [...pose.eye] as Vec3 });
type MechanicsOptions = ConstructorParameters<typeof FirearmMechanics>[2];

/** A charged rifle in the right hand, with mechanics built from `options` over the default held pose. */
const armed = (
  options: Partial<MechanicsOptions> = {},
  { content = registry, type }: { content?: Registry; type?: string } = {},
) => {
  const inventory = new Inventory(content);
  const queue = new HandlingQueue(inventory);
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: 0.5,
    pose: fixturePose,
    onEjection: () => undefined,
    ...options,
  });
  const { rifle } = chargedRifle(inventory, queue, mechanics, type ? { type } : {});
  return { inventory, queue, mechanics, rifle };
};
const shotInput = (item: Item, simTime: number): FirearmShotInput => ({ ...fixturePose(), item, seed: 71, simTime });

const shot = (simTime = 1, prepare: (inventory: Inventory) => void = () => undefined) => {
  const effects: FirearmShotEffect[] = [];
  const { inventory, mechanics, rifle } = armed({ onEjection: (effect) => effects.push(effect) });
  prepare(inventory);
  if (!mechanics.fire(shotInput(rifle, simTime))) {
    throw new Error('Test shot was refused');
  }
  mechanics.advanceTo(simTime + 0.02);
  return { effect: effects[0], inventory, rifle };
};

describe('rifle firearm handling', () => {
  it('uses per-gun skill-zero factors, shared fallback and the common expert endpoint', () => {
    const inventory = new Inventory(skillZeroRegistry);
    const light = inventory.create('fixture_light_gun');
    const heavy = inventory.create('fixture_heavy_gun');
    const shared = inventory.create('fixture_shared_gun');
    for (const item of [light, heavy, shared]) {
      expect(inventory.add(item, { kind: 'pile', pos: [0, 0, 0] })).toBe(true);
    }
    const mechanics = new FirearmMechanics(inventory, new HandlingQueue(inventory), {
      blockSize: 0.5,
      pose: () => undefined,
      onEjection: () => undefined,
    });
    const globalTuning = skillZeroRegistry.skills.get('firearms_combat')!.combat!.firearms!;
    const tuningFor = (uid: number) => ({
      ...globalTuning,
      skillZeroHandling: mechanics.skillZeroHandlingFor(uid),
    });

    expect(mechanics.skillZeroHandlingFor(shared.uid)).toEqual(globalTuning.skillZeroHandling);
    expect(firearmsSkillEffects(0, tuningFor(shared.uid))).toEqual(firearmsSkillEffects(0, globalTuning));
    for (const shotKind of ['singleShot', 'automaticFollowup'] as const) {
      const lightEffects = firearmsSkillEffects(0, tuningFor(light.uid), shotKind);
      const heavyEffects = firearmsSkillEffects(0, tuningFor(heavy.uid), shotKind);
      expect(lightEffects.variance).toBeLessThan(heavyEffects.variance);
      expect(lightEffects.recoilKickScale).toBeLessThan(heavyEffects.recoilKickScale);
      expect(lightEffects.recoilRecoveryRate).toBeGreaterThan(heavyEffects.recoilRecoveryRate);
      expect(firearmsSkillEffects(SKILL_LEVEL_MAX, tuningFor(light.uid), shotKind)).toEqual(
        firearmsSkillEffects(SKILL_LEVEL_MAX, tuningFor(heavy.uid), shotKind),
      );
    }
  });

  it('fires from the same ready-pose muzzle used by the held model', () => {
    let trajectory: FirearmTrajectory | undefined;
    const { mechanics, rifle } = armed({
      onTrajectory: (trajectoryShot) => {
        trajectory = trajectoryShot;
      },
    });
    const { model } = firearmHandlingFor(rifle, registry);
    const tuning = registry.skills.get('firearms_combat')!.combat!.firearms!;
    const common = {
      model,
      side: 'right' as const,
      leadingSide: 'right' as const,
      twoHanded: Boolean(registry.items.get(rifle.type)!.twoHanded),
      aimingDownSights: false,
      aimFrame: NEUTRAL_AIM,
      loweredPitchRadians: tuning.loweredPitchRadians,
    };
    const lowered = heldFirearmTransform({ ...common, progress: 0 });
    const raised = heldFirearmTransform({ ...common, progress: 1 });
    const poseOrigin = (heldPose: typeof raised) =>
      heldPose.rootOffset.map((value, axis) => value + heldPose.muzzleOffset[axis]!);
    expect(poseOrigin(raised)).not.toEqual(poseOrigin(lowered));

    expect(mechanics.fire({ ...shotInput(rifle, 1), seed: 19, aimingDownSights: false })).toBe(true);
    if (!trajectory) {
      throw new Error('Ready shot did not publish a trajectory');
    }
    const cameraOffset = worldVector(poseOrigin(raised), pose.yaw, pose.pitch);
    const expectedMuzzle = pose.eye.map((value, axis) => value + cameraOffset[axis]! / pose.blockSize);
    expect(trajectory.muzzle[0]).toBeCloseTo(expectedMuzzle[0]!);
    expect(trajectory.muzzle[1]).toBeCloseTo(expectedMuzzle[1]!);
    expect(trajectory.muzzle[2]).toBeCloseTo(expectedMuzzle[2]!);
  });

  it('requires a completed ready stance, rejects sprinting and cancels released readying', () => {
    const { inventory, mechanics, rifle } = armed();
    const beforeRejectedShots = inventory.snapshotState();
    const input = shotInput(rifle, 1);
    expect(mechanics.fire({ ...input, ready: false })).toBe(false);
    expect(mechanics.fire({ ...input, ready: true, sprinting: true })).toBe(false);
    expect(inventory.snapshotState()).toEqual(beforeRejectedShots);

    mechanics.advanceReadiness(0, rifle.uid, true);
    const progress = rifle.firearm?.readying;
    expect(progress).toBeDefined();
    mechanics.advanceReadiness(progress!.duration / 2, rifle.uid, true);
    expect(mechanics.isReady(rifle.uid)).toBe(false);
    mechanics.advanceReadiness(0, undefined, false);
    expect(rifle.firearm?.readying).toBeUndefined();

    mechanics.advanceReadiness(progress!.duration, rifle.uid, true);
    expect(mechanics.isReady(rifle.uid)).toBe(true);
    expect(mechanics.fire({ ...input, ready: true, sprinting: false })).toBe(true);
  });

  it('emits fixture firearm dispersion independently of firearms skill', () => {
    const definition = registry.items.get('rifle_assault')!;
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
      let trajectory: FirearmTrajectory | undefined;
      const { mechanics, rifle } = armed(
        {
          onTrajectory: (published) => {
            trajectory = published;
          },
          firearmsSkillLevel: () => skill,
        },
        { content: fixtureRegistry, type: 'fixture_skill_rifle' },
      );
      expect(mechanics.fire({ ...shotInput(rifle, 1), yaw, pitch, aimFrame })).toBe(true);
      if (!trajectory) {
        throw new Error('Committed rifle shot did not publish a trajectory');
      }
      return trajectory;
    };
    const novice = publish(0);
    const experienced = publish(SKILL_LEVEL_MAX);
    const direction = novice.directions[0]!;
    const model = fixtureRegistry.models.get('rifle_assault')!;
    const tuning = fixtureRegistry.skills.get('firearms_combat')!.combat!.firearms!;
    const heldPose = heldFirearmTransform({
      model,
      side: 'right',
      leadingSide: 'right',
      twoHanded: true,
      progress: 1,
      aimingDownSights: false,
      aimFrame,
      loweredPitchRadians: tuning.loweredPitchRadians,
    });
    const { right, up, forward } = aimBasis(yaw, pitch, NEUTRAL_AIM);
    const baseDirection = [
      right[0] * heldPose.muzzleDirection[0] +
        up[0] * heldPose.muzzleDirection[1] -
        forward[0] * heldPose.muzzleDirection[2],
      right[1] * heldPose.muzzleDirection[0] +
        up[1] * heldPose.muzzleDirection[1] -
        forward[1] * heldPose.muzzleDirection[2],
      right[2] * heldPose.muzzleDirection[0] +
        up[2] * heldPose.muzzleDirection[1] -
        forward[2] * heldPose.muzzleDirection[2],
    ];
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
    const regular = new FirearmTrigger();
    const coarse = new FirearmTrigger();
    const weapon = { uid: 1, roundsPerSimSecond: rpm / 60 };
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
    const trigger = new FirearmTrigger();
    const weapon = { uid: 1, roundsPerSimSecond: 800 / 60 };
    expect(trigger.advance(1, weapon, true, false)).toEqual([1]);
    expect(trigger.advance(1.1, weapon, false, false)).toEqual([]);
    expect(trigger.advance(2, weapon, true, true)).toEqual([2]);
    // A release/repress between ticks is still a new trigger edge.
    expect(trigger.advance(2.02, weapon, true, true)).toEqual([2.02]);
    expect(trigger.advance(2.04, { uid: 2, roundsPerSimSecond: 600 / 60 }, false, true)).toEqual([2.04]);
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
    const inventory = new Inventory(registry);
    for (const item of [inventory.create('rifle_assault'), inventory.create('rifle_ak')]) {
      const model = registry.models.get(registry.items.get(item.type)!.model!)!;
      const data = firearmHandlingFor(item, registry);
      expect(data.model).toBe(model);
      expect(data.action).toBe(model.action);
      expect(data.roundsPerSimSecond).toBe(model.action!.roundsPerSimMinute);
      expect(data.calibre).toBe(model.calibre);
      expect(data.caseModelId?.startsWith('case_')).toBe(true);
      expect(registry.models.get(data.caseModelId!)?.calibre).toBe(model.calibre);
    }
  });

  it('uses the same weapon cadence window to classify automatic follow-up handling', () => {
    const shotKinds: string[] = [];
    const { mechanics, rifle } = armed({
      onCommittedShot: (_seed, _recoilKickRadians, shotKind) => shotKinds.push(shotKind),
    });
    const configuredKick = firearmHandlingFor(rifle, registry).recoilKickRadians;
    const firearmDef = registry.items.get(rifle.type)!.firearm!;
    expect(configuredKick).toBe(firearmDef.recoilKickRadians);
    const { roundsPerSimSecond } = firearmHandlingFor(rifle, registry);
    if (configuredKick === undefined || roundsPerSimSecond === undefined) {
      throw new Error('Firing fixture needs firearm kick and cadence data');
    }

    expect(mechanics.fire(shotInput(rifle, 1))).toBe(true);
    expect(shotKinds).toEqual(['singleShot']);
    expect(mechanics.handlingShotKind(rifle.uid, 1 + 1.5 / roundsPerSimSecond)).toBe('automaticFollowup');
    expect(mechanics.handlingShotKind(rifle.uid, 1 + 1.5 / roundsPerSimSecond + 1e-6)).toBe('singleShot');
  });

  it('passes the held firearm’s data-owned kick with each committed shot', () => {
    const kicks: number[] = [];
    const { mechanics, rifle } = armed({
      onCommittedShot: (_seed, recoilKickRadians) => kicks.push(recoilKickRadians),
    });
    const configuredKick = firearmHandlingFor(rifle, registry).recoilKickRadians;
    const firearmDef = registry.items.get(rifle.type)!.firearm!;
    expect(configuredKick).toBe(firearmDef.recoilKickRadians);
    if (configuredKick === undefined) {
      throw new Error('Firing fixture needs firearm kick data');
    }
    expect(mechanics.fire(shotInput(rifle, 1))).toBe(true);
    expect(kicks).toEqual([configuredKick]);
  });

  it('aligns ejection and held stroke when rpm caps a longer exported automatic cycle', () => {
    const model = registry.models.get('rifle_assault')!;
    const action = structuredClone(model.action!);
    const fire = action.fire!;
    const fixtureStretch = ((1 / action.roundsPerSimMinute!) * 2) / fire.durationSimSeconds;
    for (const key of ['durationSimSeconds', 'rearwardSimSeconds', 'dwellSimSeconds', 'forwardSimSeconds'] as const) {
      fire[key] = simSeconds(fire[key] * fixtureStretch);
    }
    const fixture = { ...registry, models: new Map(registry.models) };
    fixture.models.set(model.id, { ...model, action });
    const { inventory, mechanics, rifle } = armed({ pose: () => undefined }, { content: fixture });
    expect(mechanics.fire(shotInput(rifle, 1))).toBe(true);
    const duration = 1 / action.roundsPerSimMinute!;
    const ejectAt = (fire.rearwardSimSeconds * action.ejectAt * duration) / fire.durationSimSeconds;
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
      roundsPerSimSecond: undefined,
      action: { hand: { durationSimSeconds: 1.5 } },
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
    expect(mechanics.fire({ ...shotInput(gun, 0), seed: 1 })).toBe(false);
    expect(mechanics.cock(gun.uid, 0)).toBe('No exported action data for this gun');
    expect(queue.jobs).toEqual([]);
    expect(inventory.snapshotState()).toEqual(before);
  });

  it('ejects the live round when a charge passes ejection, then refuses the empty chamber until the next charge', () => {
    const { inventory, queue, mechanics, rifle } = armed();
    const loaded = rifle.slots!.magazine!.cartridges!.length;
    const chambered = rifle.firearm!.roundType!;
    expect(mechanics.cock(rifle.uid, 1)).toBeUndefined();
    const elapsed = firearmHandlingFor(rifle, registry).action.hand.rearwardSimSeconds;
    queue.tick(elapsed);
    mechanics.advanceTo(1 + elapsed);
    queue.cancel();
    mechanics.advanceTo(1 + elapsed);
    expect(rifle.firearm).toMatchObject({ chamber: 'empty', cycle: undefined });
    expect(rifle.slots!.magazine!.cartridges).toHaveLength(loaded);
    expect([...inventory.piles.values()].flatMap(({ items }) => items.map(({ item }) => item.type))).toContain(
      chambered,
    );
    const before = inventory.snapshotState();
    expect(mechanics.fireReason(rifle.uid)).toBeDefined();
    expect(mechanics.fire(shotInput(rifle, 1 + elapsed))).toBe(false);
    expect(inventory.snapshotState()).toEqual(before);
  });

  it('uses exported charge duration in the handling queue and prevents firing during the hand action', () => {
    const { queue, mechanics, rifle } = armed();
    const duration = firearmHandlingFor(rifle, registry).action.hand.durationSimSeconds;
    expect(mechanics.cockReason(rifle.uid)).toBeUndefined();
    expect(mechanics.cock(rifle.uid, 10)).toBeUndefined();
    expect(mechanics.cockReason(rifle.uid)).toBeDefined();
    expect(queue.jobs[0]?.duration).toBe(duration);
    expect(mechanics.fire(shotInput(rifle, 10))).toBe(false);
    queue.tick(0.3);
    mechanics.advanceTo(10.3);
    expect(mechanics.frames()).toEqual([{ uid: rifle.uid, mode: 'hand', elapsed: 0.3, duration }]);
    queue.tick(duration - 0.3);
    expect(queue.busy).toBe(false);
    expect(mechanics.frames()).toEqual([]);
    expect(rifle.firearm?.chamber).toBe('round');
  });

  it('drops each case in the pile of the block it lands on, never a case pile on a nearer block', () => {
    // BR, 2026-10-07 11:27 (DESIGN.md, "Spent cases per block"): cases are saved per block.
    const [landing] = [...shot(1).inventory.piles.values()].map((pile) => pile.pos);
    const feet: Vec3 = [
      Math.floor(pose.feet[0] / pose.blockSize),
      pose.feet[1],
      Math.floor(pose.feet[2] / pose.blockSize),
    ];
    expect(landing).toBeDefined();
    expect(landing).not.toEqual(feet);
    const cases = (ground: Inventory, pos: Vec3) =>
      ground.pileAt(pos)?.items.find(({ item }) => item.type === caseType)?.item.count;

    const beside = shot(1, (prepared) => {
      expect(prepared.add(prepared.create(caseType, 11), { kind: 'pile', pos: feet })).toBe(true);
    }).inventory;
    expect([cases(beside, feet), cases(beside, landing!)]).toEqual([11, 1]);

    const { effect, inventory, rifle } = shot(1, (prepared) => {
      expect(prepared.add(prepared.create(caseType, 5), { kind: 'pile', pos: landing! })).toBe(true);
    });
    const { caseModelId } = firearmHandlingFor(rifle, registry);
    expect(caseModelId).toBeDefined();
    expect(effect?.caseModelId).toBe(caseModelId);
    expect(cases(inventory, landing!)).toBe(6);

    const saved = JSON.parse(JSON.stringify(inventory.snapshotState())) as InventoryState;
    const restored = Inventory.restoreState(registry, saved);
    expect(restored.snapshotState()).toEqual(saved);
  });

  it('creates a deterministic case pile from the exported held pose', () => {
    const first = shot(2.5);
    const second = shot(2.5);
    expect(first.effect).toEqual(second.effect);
    expect(first.inventory.snapshotState()).toEqual(second.inventory.snapshotState());
    expect(first.inventory.piles.size).toBe(1);
    const [pile] = first.inventory.piles.values();
    expect(pile?.items.map(({ item }) => [item.type, item.count])).toEqual([[caseType, 1]]);
    expect(pile?.pos[1]).toBe(1);
  });
});
