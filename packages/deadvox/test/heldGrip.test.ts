import { describe, expect, it } from 'vitest';
import { compileJsonnetFile } from '../../../tools/jsonnet/index.mjs';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import { Character } from '../src/core/character.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { ejectSeconds } from '../src/core/firearmAction.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldFirearmTransform, heldHoldFrame, modelToView } from '../src/core/heldPose.ts';
import { type HandSide, Inventory } from '../src/core/inventory.ts';
import { PLAYER_VIEW_FOV_DEGREES } from '../src/core/opticWindow.ts';
import type { ModelDef } from '../src/core/schema.ts';
import { firearmBoreRay } from '../src/game/firearmAim.ts';
import { FirearmMechanics, type FirearmShotEffect, firearmHandlingFor } from '../src/game/firearmHandling.ts';
import { baseRegistry } from './baseRegistry.ts';
import { chargedRifle } from './rifleFixture.ts';

const source = baseRegistry();
const rifleType = 'rifle_assault';
const HOLD_FIXTURE = 'packages/deadvox/test/fixtures/jsonnet/long-gun-hold.jsonnet';
const dot = (left: Vec3, right: Vec3): number => left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
const projectionErrorPixels = (direction: readonly number[]): readonly [number, number, number] => {
  const viewportHeight = 720;
  const aspect = 1280 / viewportHeight;
  const tangent = Math.tan((PLAYER_VIEW_FOV_DEGREES * Math.PI) / 360);
  const depth = -direction[2]!;
  return [
    Math.abs((direction[0]! / depth / (tangent * aspect)) * (viewportHeight / 2)),
    Math.abs((direction[1]! / depth / tangent) * (viewportHeight / 2)),
    depth,
  ];
};
const projectedVerticalPixels = (point: readonly number[]): number => {
  const viewportHeight = 720;
  const depth = -point[2]!;
  const tangent = Math.tan((PLAYER_VIEW_FOV_DEGREES * Math.PI) / 360);
  return (point[1]! / depth / tangent) * (viewportHeight / 2);
};
const items = new Map(source.items);
items.set(rifleType, { ...items.get(rifleType)!, twoHanded: true });
const registry = { ...source, items };

const ejectFrom = (side: HandSide): FirearmShotEffect[] => {
  const character = new Character(registry, { handedness: side === 'right' ? 'left' : 'right' });
  const inventory = new Inventory(registry, undefined, undefined, character);
  const effects: FirearmShotEffect[] = [];
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
  const queue = new HandlingQueue(inventory);
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: pose.blockSize,
    isSolid: (_x, y, _z) => y === 0,
    pose: () => ({ ...pose, feet: [...pose.feet], eye: [...pose.eye] }),
    onEjection: (effect) => effects.push(effect),
  });
  const { rifle } = chargedRifle(inventory, queue, mechanics, { type: rifleType, side });
  if (
    !mechanics.fire({
      ...pose,
      feet: [...pose.feet],
      eye: [...pose.eye],
      item: rifle,
      seed: 71,
      simTime: 1,
    })
  ) {
    throw new Error('Fixture shot was refused');
  }
  const data = firearmHandlingFor(rifle, registry);
  mechanics.advanceTo(1 + ejectSeconds(data.action, 'fire'));
  return effects;
};

describe('actual-slot held placement', () => {
  it('projects each exported sight line to screen centre within one pixel in ADS', () => {
    const firearms = registry.skills.get('firearms_combat')!.combat!.firearms!;
    for (const modelId of ['rifle_assault', 'rifle_ak', 'shotgun_pump']) {
      const model = registry.models.get(modelId)!;
      expect(model.gun?.sight?.eyeReliefMetres).toBeGreaterThan(0);
      const pose = heldFirearmTransform({
        holds: registry.figures.get('player')!.holds,
        model,
        side: 'right',
        leadingSide: 'right',
        twoHanded: true,
        progress: 1,
        aimingDownSights: true,
        aimFrame: NEUTRAL_AIM,
        loweredPitchRadians: firearms.loweredPitchRadians,
      });
      expect(pose.sightEyeOffset).toBeDefined();
      for (let axis = 0; axis < 3; axis++) {
        expect(pose.rootOffset[axis]! + pose.sightEyeOffset![axis]!).toBeCloseTo(0);
      }
      for (let axis = 0; axis < 3; axis++) {
        expect(pose.sightUp![axis]).toBeCloseTo([0, 1, 0][axis]!, 10);
      }
      const [horizontalErrorPixels, verticalErrorPixels, depth] = projectionErrorPixels(pose.sightDirection!);
      expect(depth).toBeGreaterThan(0);
      expect(horizontalErrorPixels).toBeLessThanOrEqual(1);
      expect(verticalErrorPixels).toBeLessThanOrEqual(1);
      if (modelId === 'shotgun_pump') {
        const barrelCenter = pose.rootOffset.map((offset, axis) => offset + pose.muzzleOffset[axis]!);
        expect(barrelCenter[2]).toBeLessThan(0);
        expect(projectedVerticalPixels(barrelCenter)).toBeLessThan(0);
      }
    }
  });

  it('cups the support palm under the bore with the bore running across it from the heel to the thumb-index gap', () => {
    const model = JSON.parse(compileJsonnetFile(HOLD_FIXTURE)) as ModelDef;
    // A gungen export runs its bore along the model's +x through the origin.
    const bore = modelToView(model, [1, 0, 0]);
    const boreFromGrip = modelToView(model, model.grip!.at.map((value) => -value) as Vec3);
    for (const side of ['right', 'left'] as const) {
      const { at, palm, fingers, thumbSide } = heldHoldFrame(model, side, 'support');
      // The hand frame's +x is the right hand's thumb side and the left hand's little-finger side.
      const thumb = thumbSide.map((value) => (side === 'right' ? -value : value)) as Vec3;
      expect(at[1] - boreFromGrip[1], `${side} contact below the bore`).toBeLessThan(0);
      expect(palm[1], `${side} palm presses up`).toBeGreaterThan(Math.max(Math.abs(palm[0]), Math.abs(palm[2])));
      expect(Math.abs(dot(bore, palm)), `${side} bore lies in the palm plane`).toBeLessThan(0.1);
      expect(dot(bore, fingers), `${side} bore runs toward the fingertips`).toBeGreaterThan(0.3);
      expect(dot(bore, thumb), `${side} bore runs toward the thumb`).toBeGreaterThan(0.3);
    }
    const right = heldHoldFrame(model, 'right', 'support');
    const left = heldHoldFrame(model, 'left', 'support');
    for (const key of ['at', 'palm', 'fingers'] as const) {
      for (let axis = 0; axis < 3; axis++) {
        expect(left[key][axis], `left hold mirrors ${key} across the view's x`).toBeCloseTo(
          axis === 0 ? -right[key][axis]! : right[key][axis]!,
          10,
        );
      }
    }
  });

  it('seats the support contact on the exported support anchor, not a hand-copied height', () => {
    const fixture = JSON.parse(compileJsonnetFile(HOLD_FIXTURE)) as ModelDef;
    const models = [fixture, ...[...registry.models.values()].filter((model) => model.hands?.butt)];
    for (const model of models) {
      expect(model.hands!.support!.at.slice(0, 2), `${model.id} support contact comes from the export`).toEqual(
        model.anchors!.support!.slice(0, 2),
      );
    }
  });

  it('keeps a long gun’s butt in its shoulder seat while lowering and raising it, mirrored for the left slot', () => {
    const firearms = registry.skills.get('firearms_combat')!.combat!.firearms!;
    const longGuns = [...registry.models.values()].filter((model) => model.hands?.butt);
    expect(longGuns.length).toBeGreaterThan(0);
    for (const model of longGuns) {
      for (const side of ['right', 'left'] as const) {
        const { seat } = model.hands!;
        const expectedSeat = [side === 'right' ? seat[0] : -seat[0], seat[1], seat[2]];
        const poseAt = (progress: number) =>
          heldFirearmTransform({
            holds: registry.figures.get('player')!.holds,
            model,
            side,
            leadingSide: side,
            twoHanded: true,
            progress,
            aimingDownSights: false,
            aimFrame: NEUTRAL_AIM,
            loweredPitchRadians: firearms.loweredPitchRadians,
          });
        // The root rotation's columns turn view-frame vectors, so the butt goes through the grip frame first.
        const buttOf = (pose: ReturnType<typeof poseAt>): number[] => {
          const local = modelToView(
            model,
            model.hands!.butt!.map((value, axis) => value - model.grip!.at[axis]!) as Vec3,
          );
          return pose.rootOffset.map(
            (root, axis) =>
              root +
              local[0] * pose.rootRotation[0][axis]! +
              local[1] * pose.rootRotation[1][axis]! +
              local[2] * pose.rootRotation[2][axis]!,
          );
        };
        const lowered = poseAt(0);
        const ready = poseAt(1);
        for (let axis = 0; axis < 3; axis++) {
          expect(buttOf(lowered)[axis], `${model.id} ${side} lowered butt`).toBeCloseTo(expectedSeat[axis]!, 10);
          expect(buttOf(ready)[axis], `${model.id} ${side} ready butt`).toBeCloseTo(expectedSeat[axis]!, 10);
        }
        const muzzleHeight = (pose: ReturnType<typeof poseAt>) => pose.rootOffset[1] + pose.muzzleOffset[1];
        expect(muzzleHeight(lowered), `${model.id} ${side} lowered muzzle`).toBeLessThan(muzzleHeight(ready));
        // The lowered gun stays in the view: its muzzle projects inside the vertical field, below centre.
        const muzzle = lowered.rootOffset.map((root, axis) => root + lowered.muzzleOffset[axis]!);
        expect(projectedVerticalPixels(muzzle), `${model.id} ${side} lowered muzzle`).toBeLessThan(0);
        expect(projectedVerticalPixels(muzzle), `${model.id} ${side} lowered muzzle`).toBeGreaterThan(-360);
      }
    }
  });

  it('keeps the sight and bore together off the fixed view during ADS recoil', () => {
    const coaxialSource = [...registry.models.values()].find(
      (candidate) => candidate.gun?.sight && candidate.grip && candidate.anchors?.muzzle,
    );
    if (!coaxialSource?.gun?.sight) {
      throw new Error('No sighted firearm model fixture');
    }
    const model = {
      ...coaxialSource,
      gun: {
        ...coaxialSource.gun,
        muzzleDirection: coaxialSource.gun.sight.direction,
        sight: { ...coaxialSource.gun.sight, direction: coaxialSource.gun.sight.direction },
      },
    };
    const common = {
      holds: registry.figures.get('player')!.holds,
      model,
      side: 'right' as const,
      leadingSide: 'right' as const,
      twoHanded: true,
      progress: 1,
      aimingDownSights: true,
      loweredPitchRadians: 0,
    };
    const resting = heldFirearmTransform({ ...common, aimFrame: NEUTRAL_AIM });
    const recoilFrame = { yaw: 0.06, pitch: -0.03 };
    const recoiling = heldFirearmTransform({ ...common, aimFrame: recoilFrame });
    const bore = firearmBoreRay({
      ...common,
      eye: [0, 0, 0],
      yaw: 0,
      pitch: 0,
      blockSize: 0.5,
      aimFrame: recoilFrame,
    });
    for (let axis = 0; axis < 3; axis++) {
      expect(resting.sightDirection![axis]).toBeCloseTo([0, 0, -1][axis]!, 10);
      expect(resting.muzzleDirection[axis]).toBeCloseTo(resting.sightDirection![axis]!, 10);
      expect(recoiling.sightDirection![axis]).toBeCloseTo(recoiling.muzzleDirection[axis]!, 10);
      expect(recoiling.muzzleDirection[axis]).toBeCloseTo(bore.direction[axis]!, 10);
    }
    expect(Math.hypot(recoiling.sightDirection![0], recoiling.sightDirection![1])).toBeGreaterThan(0);
    expect(recoiling.sightEyeOffset).toBeDefined();
    expect(
      Math.hypot(...recoiling.rootOffset.map((value, axis) => value + recoiling.sightEyeOffset![axis]!)),
    ).toBeGreaterThan(0);
  });

  it('translates two-handed ejection origins by physical slot, not actor dominance, without mirroring authored direction', () => {
    const rightEffects = ejectFrom('right');
    const leftEffects = ejectFrom('left');
    expect(rightEffects).toHaveLength(1);
    expect(leftEffects).toHaveLength(1);
    const right = rightEffects[0]!;
    const left = leftEffects[0]!;
    expect(right.origin[0] - left.origin[0]).toBeGreaterThan(0);
    expect(left.origin.slice(1)).toEqual(right.origin.slice(1));
    expect(left.direction).toEqual(right.direction);
    expect(Math.hypot(...left.direction)).toBeCloseTo(1);
  });
});
