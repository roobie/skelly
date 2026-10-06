import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import { Character } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { ejectSeconds } from '../src/core/firearmAction.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { heldFirearmTransform } from '../src/core/heldPose.ts';
import { type HandSide, Inventory } from '../src/core/inventory.ts';
import { PLAYER_VIEW_FOV_DEGREES } from '../src/core/opticWindow.ts';
import { FirearmMechanics, type FirearmShotEffect, firearmHandlingFor } from '../src/game/firearmHandling.ts';
import { chargedRifle } from './rifleFixture.ts';

const base = 'src/content/base';
const { registry: source } = buildRegistry(
  readdirSync(base)
    .filter((file) => file.endsWith('.json'))
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(base, file), 'utf8')) as unknown })),
);
const rifleType = 'rifle_assault';
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
  it('projects the optic centre to screen centre within one pixel in ADS', () => {
    const model = registry.models.get('rifle_assault')!;
    const tuning = registry.skills.get('firearms_combat')!.combat!.firearms!;
    const pose = heldFirearmTransform({
      model,
      side: 'right',
      leadingSide: 'right',
      twoHanded: true,
      progress: 1,
      aimingDownSights: true,
      aimFrame: NEUTRAL_AIM,
      loweredPitchRadians: tuning.loweredPitchRadians,
      adsApertureFill: tuning.adsApertureFill,
      verticalFovDegrees: PLAYER_VIEW_FOV_DEGREES,
    });
    expect(pose.sightEyeOffset).toBeDefined();
    for (let axis = 0; axis < 3; axis++) {
      expect(pose.rootOffset[axis]! + pose.sightEyeOffset![axis]!).toBeCloseTo(0);
    }
    expect(pose.sightDirection).toBeDefined();
    const [horizontalErrorPixels, verticalErrorPixels, depth] = projectionErrorPixels(pose.sightDirection!);
    expect(depth).toBeGreaterThan(0);
    expect(horizontalErrorPixels).toBeLessThanOrEqual(1);
    expect(verticalErrorPixels).toBeLessThanOrEqual(1);
  });

  it('projects each exported sight line to screen centre within one pixel in ADS', () => {
    const firearms = registry.skills.get('firearms_combat')!.combat!.firearms!;
    for (const modelId of ['rifle_assault', 'rifle_ak']) {
      const model = registry.models.get(modelId)!;
      expect(model.sight?.eyeReliefMetres).toBeGreaterThan(0);
      const pose = heldFirearmTransform({
        model,
        side: 'right',
        leadingSide: 'right',
        twoHanded: true,
        progress: 1,
        aimingDownSights: true,
        aimFrame: NEUTRAL_AIM,
        loweredPitchRadians: firearms.loweredPitchRadians,
        adsApertureFill: firearms.adsApertureFill,
        verticalFovDegrees: PLAYER_VIEW_FOV_DEGREES,
      });
      expect(pose.sightEyeOffset).toBeDefined();
      for (let axis = 0; axis < 3; axis++) {
        expect(pose.rootOffset[axis]! + pose.sightEyeOffset![axis]!).toBeCloseTo(0);
      }
      const [horizontalErrorPixels, verticalErrorPixels, depth] = projectionErrorPixels(pose.sightDirection!);
      expect(depth).toBeGreaterThan(0);
      expect(horizontalErrorPixels).toBeLessThanOrEqual(1);
      expect(verticalErrorPixels).toBeLessThanOrEqual(1);
    }
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
