import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { aimBasis, aimDirection, NEUTRAL_AIM } from '../src/core/aim.ts';
import { SKILL_LEVEL_MAX } from '../src/core/character.ts';
import type { Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { crosshairAimPoint } from '../src/core/crosshairTarget.ts';
import { actionCycleSeconds, ejectSeconds } from '../src/core/firearmAction.ts';
import { firearmsSkillEffects } from '../src/core/firearmsSkill.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldFirearmTransform } from '../src/core/heldPose.ts';
import type { InventoryState } from '../src/core/inventory.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { slotsReason } from '../src/core/magazine.ts';
import type { PelletShot } from '../src/core/pellets.ts';
import { pileScatterPlacements } from '../src/core/scatterPile.ts';
import type { SoundId } from '../src/core/soundEvents.ts';
import { simSeconds } from '../src/core/time.ts';
import { firearmBoreRay } from '../src/game/firearmAim.ts';
import {
  FirearmMechanics,
  type FirearmShotEffect,
  type FirearmShotInput,
  type FirearmTrajectory,
  firearmHandlingFor,
  spentCaseItemId,
} from '../src/game/firearmHandling.ts';
import { FirearmTrigger } from '../src/game/firearmTrigger.ts';
import { CaseEffects } from '../src/render/caseEffects.ts';
import { actionPartPaths, cloneHeldModel, sampleActionStroke } from '../src/render/firearmModel.ts';
import { prepareModel } from '../src/render/models.ts';
import { PileMeshes } from '../src/render/piles.ts';
import { baseRegistry } from './baseRegistry.ts';
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { withDefaultAttachment } from './firearmAttachmentFixture.ts';
import { chargedRifle, settle } from './rifleFixture.ts';

const BASE = 'src/content/base';
const base = readdirSync(BASE)
  .filter((file) => file.endsWith('.json'))
  .sort()
  .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown }));
const registry = baseRegistry();
const { registry: skillZeroRegistry } = buildRegistry([
  ...base,
  {
    source: 'skill-zero-firearms.json',
    data: {
      items: [
        {
          id: 'fixture_light_gun',
          name: 'Light test firearm',
          category: 'weapon',
          weight: 1,
          size: [1, 1],
          firearm: {
            recoilKickRadians: 0.01,
            dispersionRadians: 0,
            shotSound: 'gunshot',
            handling: {},
            skillZeroHandling: {
              singleShot: { variance: 1.2, recoilKickScale: 2, recoilRecoveryScale: 0.8 },
              automaticFollowup: { variance: 2, recoilKickScale: 4, recoilRecoveryScale: 0.6 },
            },
          },
        },
        {
          id: 'fixture_heavy_gun',
          name: 'Heavy test firearm',
          category: 'weapon',
          weight: 1,
          size: [1, 1],
          firearm: {
            recoilKickRadians: 0.02,
            dispersionRadians: 0,
            shotSound: 'gunshot',
            handling: {},
            skillZeroHandling: {
              singleShot: { variance: 2.5, recoilKickScale: 12, recoilRecoveryScale: 0.2 },
              automaticFollowup: { variance: 4, recoilKickScale: 20, recoilRecoveryScale: 0.1 },
            },
          },
        },
        {
          id: 'fixture_shared_gun',
          name: 'Shared test firearm',
          category: 'weapon',
          weight: 1,
          size: [1, 1],
          firearm: { recoilKickRadians: 0.01, dispersionRadians: 0, shotSound: 'gunshot', handling: {} },
        },
      ],
    },
  },
]);
/** A sound only this file defines, so a weapon selecting it proves content sound ids need no code list. */
const FIXTURE_DRY_FIRE = 'fixture_dry_click';
const fixtureDryFireSound = () => {
  const sounds = base.flatMap(({ data }) => (data as { sounds?: { id: string }[] }).sounds ?? []);
  return { ...sounds[0]!, id: FIXTURE_DRY_FIRE };
};
/** Base content with every firearm's dry fire set to the fixture sound, or removed, so no assertion leans on a content pick. */
const firearmsWithDryFire = (dryFire: boolean): Registry => {
  const { registry: content, issues } = buildRegistry([
    ...base.map(({ source, data }) => {
      const file = data as { items?: { firearm?: { dryFireSound?: SoundId } }[] };
      if (!file.items) {
        return { source, data };
      }
      const items = file.items.map((item) => {
        if (!item.firearm) {
          return item;
        }
        const { dryFireSound: _authored, ...firearm } = item.firearm;
        return { ...item, firearm: dryFire ? { ...firearm, dryFireSound: FIXTURE_DRY_FIRE } : firearm };
      });
      return { source, data: { ...file, items } };
    }),
    { source: 'fixture-dry-fire.json', data: { sounds: [fixtureDryFireSound()] } },
  ]);
  if (issues.length > 0) {
    throw new Error(`Invalid dry-fire fixture: ${JSON.stringify(issues)}`);
  }
  return content;
};
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
  { content = registry, type, rounds }: { content?: Registry; type?: string; rounds?: number } = {},
) => {
  const inventory = new Inventory(content);
  const queue = new HandlingQueue(inventory);
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: 0.5,
    isSolid: (_x, y, _z) => y < pose.feet[1],
    pose: fixturePose,
    onEjection: () => undefined,
    ...options,
  });
  const { rifle } = chargedRifle(inventory, queue, mechanics, {
    ...(type ? { type } : {}),
    ...(rounds === undefined ? {} : { rounds }),
  });
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
  return { effect: effects[0], inventory, mechanics, rifle };
};

describe('rifle firearm handling', () => {
  it('ends the native case effect at the pile renderer instance position', () => {
    const blockSize = 0.5;
    const worldSeed = 17;
    const effects = new CaseEffects(blockSize);
    let inventory: Inventory | undefined;
    let effect: FirearmShotEffect | undefined;
    const {
      inventory: sessionInventory,
      mechanics,
      rifle,
    } = armed({
      onEjection: (shotEffect) => {
        effect = shotEffect;
        effects.spawn({
          ...shotEffect,
          landingPosition: [
            (shotEffect.landingPosition[0] + 0.5) * blockSize,
            shotEffect.landingPosition[1] * blockSize + 0.006,
            (shotEffect.landingPosition[2] + 0.5) * blockSize,
          ],
        });
      },
      onCaseLanded: (seed, item) => {
        const location = inventory?.locate(item);
        if (location?.kind !== 'pile') {
          return;
        }
        const placement = pileScatterPlacements({
          registry,
          pile: location.pile,
          worldSeed,
          blockSize,
        }).find(({ item: placed }) => placed.uid === item.uid);
        if (placement) {
          effects.retarget(seed, placement.position);
        }
      },
    });
    inventory = sessionInventory;
    expect(mechanics.fire(shotInput(rifle, 1))).toBe(true);
    mechanics.advanceTo(2);
    const landing = rifle.firearm?.landings?.[0];
    expect(landing).toBeDefined();
    mechanics.advanceTo(landing!.at);
    mechanics.advanceTo(landing!.at);
    expect(effect).toBeDefined();

    const piledCase = [...inventory.items()].find(({ item }) => item.type === caseType);
    expect(piledCase).toBeDefined();
    const location = inventory.locate(piledCase!.item);
    expect(location?.kind).toBe('pile');
    if (location?.kind !== 'pile') {
      throw new Error('Ejected case did not land in a pile');
    }
    const pile = new PileMeshes(blockSize, undefined, worldSeed);
    pile.sync(inventory);
    const instances = pile.group.children.find((child): child is InstancedMesh => child instanceof InstancedMesh);
    expect(instances).toBeDefined();
    const matrix = new Matrix4();
    const renderedPosition = new Vector3();
    instances!.getMatrixAt(0, matrix);
    matrix.decompose(renderedPosition, new Quaternion(), new Vector3());
    effects.update(landing!.at);
    expect(effects.mesh.children[0]!.position.distanceTo(renderedPosition)).toBeLessThan(1e-5);
    pile.dispose();
    effects.dispose();
  });

  it('wears a fitted suppressor on each committed shot', () => {
    const fitted = withDefaultAttachment(registry, 'rifle_assault', 'improvised_suppressor');
    const { mechanics, rifle } = armed({}, { content: fitted.registry });
    const suppressor = rifle.slots?.[fitted.fitted.mountedAt];
    if (!suppressor) {
      throw new Error('Factory-created suppressor default is missing');
    }
    expect(slotsReason(fitted.registry, rifle.type, rifle.slots)).toBeUndefined();

    expect(mechanics.fire(shotInput(rifle, 1))).toBe(true);
    expect(suppressor.condition).toBeLessThan(1);
  });

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

  it('keeps the ready firearm bore aligned with the view before aim sway', () => {
    const model = registry.models.get('rifle_ak')!;
    const tuning = registry.skills.get('firearms_combat')!.combat!.firearms!;
    const yaw = 0.3;
    const pitch = -0.2;
    const bore = firearmBoreRay({
      model,
      eye: [...pose.eye],
      yaw,
      pitch,
      blockSize: pose.blockSize,
      side: 'right',
      leadingSide: 'right',
      twoHanded: true,
      aimFrame: NEUTRAL_AIM,
      loweredPitchRadians: tuning.loweredPitchRadians,
    });
    const view = aimDirection(yaw, pitch, NEUTRAL_AIM);
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          bore.direction.reduce((sum, value, axis) => sum + value * view[axis]!, 0),
        ),
      ),
    );
    expect(angle).toBeLessThan(0.1);
  });

  it('fires along the bore and places the crosshair point on that same line', () => {
    const definition = registry.items.get('rifle_ak')!;
    const fixtureBuild = buildRegistry([
      ...base,
      {
        source: 'bore-line-fixture.json',
        data: {
          items: [
            {
              ...definition,
              id: 'fixture_bore_rifle',
              name: 'Bore-line fixture rifle',
              firearm: { ...definition.firearm!, dispersionRadians: 0 },
            },
          ],
        },
      },
    ]);
    expect(fixtureBuild.issues).toEqual([]);
    const view = { yaw: 0.3, pitch: -0.2 };
    let trajectory: FirearmTrajectory | undefined;
    const { mechanics, rifle } = armed(
      {
        pose: () => ({ ...fixturePose(), ...view }),
        onTrajectory: (published) => {
          trajectory = published;
        },
      },
      { content: fixtureBuild.registry, type: 'fixture_bore_rifle' },
    );
    const input = { ...shotInput(rifle, 1), ...view, aimFrame: { yaw: 0.04, pitch: -0.03 } };
    const tuning = fixtureBuild.registry.skills.get('firearms_combat')!.combat!.firearms!;
    const bore = firearmBoreRay({
      model: firearmHandlingFor(rifle, fixtureBuild.registry).model,
      eye: input.eye,
      yaw: input.yaw,
      pitch: input.pitch,
      blockSize: pose.blockSize,
      side: 'right',
      leadingSide: 'right',
      twoHanded: true,
      aimFrame: input.aimFrame,
      loweredPitchRadians: tuning.loweredPitchRadians,
      isSolid: () => false,
    });
    expect(mechanics.fire(input)).toBe(true);
    if (!trajectory) {
      throw new Error('Zero-spread shot did not publish a trajectory');
    }
    const firedTrajectory = trajectory;
    const nearSurface = {
      distanceBlocks: 2,
      distanceMetres: 2 * pose.blockSize,
      point: bore.origin.map((value, axis) => value + bore.direction[axis]! * 2) as [number, number, number],
    };
    const point = crosshairAimPoint(bore.origin, bore.direction, nearSurface);
    const direction = firedTrajectory.directions[0]!;
    expect(direction.every((value, axis) => Math.abs(value - bore.direction[axis]!) < 1e-9)).toBe(true);
    const alongRay = point.reduce(
      (sum, value, axis) => sum + (value - firedTrajectory.origin[axis]!) * direction[axis]!,
      0,
    );
    const miss = Math.hypot(
      ...firedTrajectory.origin.map((value, axis) => value + alongRay * direction[axis]! - point[axis]!),
    );
    expect(miss).toBeLessThan(1e-6);
  });

  it('traces from the eye when solid geometry blocks the eye-to-muzzle path', () => {
    let trajectory: FirearmTrajectory | undefined;
    let hit: PelletShot | undefined;
    const { mechanics, rifle } = armed(
      {
        isSolid: (_x, _y, z) => z === -1,
        onTrajectory: (published) => {
          trajectory = published;
        },
        onShot: (published) => {
          hit = published;
        },
        firearmsSkillLevel: () => SKILL_LEVEL_MAX,
      },
      { type: 'rifle_ak' },
    );
    expect(mechanics.fire(shotInput(rifle, 1))).toBe(true);
    expect(trajectory?.origin).toEqual(pose.eye);
    expect(hit?.origin).toEqual(trajectory?.origin); // The hit starts where the marks do, not past the wall.
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
    const fixtureItem = new Inventory(fixtureRegistry).create('fixture_skill_rifle');
    const tuning = fixtureRegistry.skills.get('firearms_combat')!.combat!.firearms!;
    const bore = firearmBoreRay({
      model: firearmHandlingFor(fixtureItem, fixtureRegistry).model,
      eye: [...pose.eye],
      yaw,
      pitch,
      blockSize: pose.blockSize,
      side: 'right',
      leadingSide: 'right',
      twoHanded: true,
      aimFrame,
      loweredPitchRadians: tuning.loweredPitchRadians,
    });
    const cone = firearmHandlingFor(fixtureItem, fixtureRegistry).dispersionRadians!;
    const angle = Math.acos(
      Math.max(
        -1,
        Math.min(
          1,
          bore.direction.reduce((sum, value, index) => sum + value * direction[index]!, 0),
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

  it('keeps earlier case landings pending when automatic fire starts another cycle', () => {
    const { mechanics, rifle } = armed();
    const { action } = firearmHandlingFor(rifle, registry);
    const cycleDuration = actionCycleSeconds(action, 'fire');
    const ejectOffset = ejectSeconds(action, 'fire');

    expect(mechanics.fire(shotInput(rifle, 1))).toBe(true);
    mechanics.advanceTo(1 + ejectOffset);
    expect(rifle.firearm?.landings).toHaveLength(1);

    const secondShotAt = 1 + cycleDuration;
    expect(mechanics.fire(shotInput(rifle, secondShotAt))).toBe(true);
    mechanics.advanceTo(secondShotAt + ejectOffset);
    expect(rifle.firearm?.landings).toHaveLength(2);
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
    expect(inventory.piles.size).toBe(0);
    const landingAt = rifle.firearm?.landings?.[0]?.at;
    expect(landingAt).toBeDefined();
    mechanics.advanceTo(landingAt! - 1e-6);
    expect(inventory.piles.size).toBe(0);
    mechanics.advanceTo(landingAt!);
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
      base.find(({ source: file }) => file === 'sounds.json')!,
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
              firearm: {
                recoilKickRadians: 0.012,
                dispersionRadians: 0.01,
                shotSound: 'gunshot',
                handling: {},
              },
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
    const landingAt = rifle.firearm?.landings?.[0]?.at;
    expect(landingAt).toBeDefined();
    expect([...inventory.piles.values()].flatMap(({ items }) => items.map(({ item }) => item.type))).not.toContain(
      chambered,
    );
    mechanics.advanceTo(landingAt!);
    expect([...inventory.piles.values()].flatMap(({ items }) => items.map(({ item }) => item.type))).toContain(
      chambered,
    );
    const before = inventory.snapshotState();
    expect(mechanics.fireReason(rifle.uid)).toBeDefined();
    expect(mechanics.fire(shotInput(rifle, 1 + elapsed))).toBe(false);
    // The empty pull drops only the hammer.
    const hammerDropped = structuredClone(before);
    hammerDropped.hands.right!.firearm!.hammerDown = true;
    expect(inventory.snapshotState()).toEqual(hammerDropped);
  });

  /** The content's bolt rifle in hand with one round worked through its internal magazine into the chamber. */
  const armedBolt = (options: Partial<MechanicsOptions>, content: Registry) => {
    const definition = [...content.items.values()].find((item) => item.firearm?.bolt)!;
    const { calibre } = content.models.get(definition.model!)!;
    const ammo = [...content.items.values()].find((item) => item.ammo?.calibre === calibre)!;
    const inventory = new Inventory(content);
    const queue = new HandlingQueue(inventory);
    const mechanics = new FirearmMechanics(inventory, queue, {
      blockSize: 0.5,
      isSolid: (_x, y, _z) => y < pose.feet[1],
      pose: fixturePose,
      onEjection: () => undefined,
      ...options,
    });
    const rifle = inventory.create(definition.id);
    const bag = inventory.create('hiking_backpack');
    const round = inventory.create(ammo.id, 1);
    if (
      !(
        inventory.add(rifle, { kind: 'hand', side: 'right' }) &&
        inventory.add(bag, { kind: 'worn' }) &&
        inventory.add(round, { kind: 'pocket', owner: bag, pocket: 0 })
      )
    ) {
      throw new Error('Bolt rifle fixture does not fit');
    }
    for (const step of [() => mechanics.load(round, 0), () => mechanics.cock(rifle.uid, 0)]) {
      const refusal = step();
      if (refusal) {
        throw new Error(refusal);
      }
      settle(queue);
    }
    return { queue, mechanics, rifle };
  };

  /** Every firearm's trigger pull re-cocks its own hammer, as content may choose per gun. */
  const triggerCocking = (content: Registry): Registry => ({
    ...content,
    items: new Map(
      [...content.items].map(([id, item]) => [
        id,
        item.firearm ? { ...item, firearm: { ...item.firearm, triggerCocks: true } } : item,
      ]),
    ),
  });

  /** A gun fired dry, with an empty pull that returns the sounds it made and a charge that works the action. */
  const firedDry = (arm: typeof armedBolt, content: Registry) => {
    const sounds: SoundId[] = [];
    const { queue, mechanics, rifle } = arm({ onSound: (event) => sounds.push(event) }, content);
    let time = 1;
    if (!mechanics.fire(shotInput(rifle, time))) {
      throw new Error('the loaded gun did not fire');
    }
    time += 2;
    mechanics.advanceTo(time);
    if (rifle.firearm?.chamber === 'round') {
      throw new Error('the gun did not run dry');
    }
    const pull = (): SoundId[] => {
      sounds.length = 0;
      time += 1;
      if (mechanics.fire(shotInput(rifle, time))) {
        throw new Error('an empty gun fired');
      }
      return [...sounds];
    };
    const charge = () => {
      const refusal = mechanics.cock(rifle.uid, time);
      if (refusal) {
        throw new Error(refusal);
      }
      settle(queue);
      time += 5;
      mechanics.advanceTo(time);
    };
    return { pull, charge };
  };
  const magazineFed = (options: Partial<MechanicsOptions>, content: Registry) => armed(options, { content, rounds: 1 });

  describe('dry fire', () => {
    // Each build parses all base content, so the two variants are built once outside the cases' time limit.
    let withDryFire: Registry;
    let withoutDryFire: Registry;
    beforeAll(() => {
      withDryFire = firearmsWithDryFire(true);
      withoutDryFire = firearmsWithDryFire(false);
    });

    it('a run-dry magazine gun clicks its own dry fire once, then stays silent until it is charged', () => {
      const { pull, charge } = firedDry(magazineFed, withDryFire);
      expect(pull()).toEqual([FIXTURE_DRY_FIRE]);
      expect(pull()).toEqual([]);
      charge();
      expect(pull()).toEqual([FIXTURE_DRY_FIRE]);
      expect(firedDry(magazineFed, withoutDryFire).pull()).toEqual([]);
    });

    it('a gun whose content re-cocks on the trigger pull clicks on every empty pull', () => {
      const { pull } = firedDry(magazineFed, triggerCocking(withDryFire));
      expect(pull()).toEqual([FIXTURE_DRY_FIRE]);
      expect(pull()).toEqual([FIXTURE_DRY_FIRE]);
    });

    it('a bolt-action shot leaves the hammer down, so the empty pull clicks only once the bolt is worked', () => {
      const { pull, charge } = firedDry(armedBolt, withDryFire);
      expect(pull()).toEqual([]);
      charge();
      expect(pull()).toEqual([FIXTURE_DRY_FIRE]);
    });
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
    // Per-block counts keep saved case state independent of total shot count (`DESIGN.md`, "Spent cases per block").
    const probe = shot(1);
    const landingAt = probe.rifle.firearm?.landings?.[0]?.at;
    const landing = probe.rifle.firearm?.landings?.[0]?.position;
    const feet: Vec3 = [
      Math.floor(pose.feet[0] / pose.blockSize),
      pose.feet[1],
      Math.floor(pose.feet[2] / pose.blockSize),
    ];
    expect(landingAt).toBeDefined();
    expect(landing).toBeDefined();
    expect(landing).not.toEqual(feet);
    const cases = (ground: Inventory, pos: Vec3) =>
      ground.pileAt(pos)?.items.find(({ item }) => item.type === caseType)?.item.count;

    const besideShot = shot(1, (prepared) => {
      expect(prepared.add(prepared.create(caseType, 11), { kind: 'pile', pos: feet })).toBe(true);
    });
    besideShot.mechanics.advanceTo(landingAt!);
    const beside = besideShot.inventory;
    expect([cases(beside, feet), cases(beside, landing!)]).toEqual([11, 1]);

    const { effect, inventory, mechanics, rifle } = shot(1, (prepared) => {
      expect(prepared.add(prepared.create(caseType, 5), { kind: 'pile', pos: landing! })).toBe(true);
    });
    mechanics.advanceTo(landingAt!);
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
    expect(first.effect).toMatchObject({
      landingPosition: first.rifle.firearm?.landings?.[0]?.position,
      landingAt: first.rifle.firearm?.landings?.[0]?.at,
    });
    const landingAt = first.rifle.firearm?.landings?.[0]?.at;
    expect(landingAt).toBeDefined();
    first.mechanics.advanceTo(landingAt!);
    second.mechanics.advanceTo(landingAt!);
    expect(first.inventory.piles.size).toBe(1);
    const [pile] = first.inventory.piles.values();
    expect(pile?.items.map(({ item }) => [item.type, item.count])).toEqual([[caseType, 1]]);
    expect(pile?.pos[1]).toBe(1);
  });
});
