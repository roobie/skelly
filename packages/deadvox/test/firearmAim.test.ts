import { PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import type { ModelDef } from '../src/engine/content.ts';
import { graphicsTuningOf } from '../src/engine/look.ts';
import type { Vec3 } from '../src/engine/world.ts';
import { startupContent } from './baseRegistry.ts';
import { skilledFirearmsTuning } from './fixtures/combatTuning.ts';

const BUNDLED_CONTENT = startupContent();
const PLAYER_VIEW_FOV_DEGREES = graphicsTuningOf(BUNDLED_CONTENT.registry).playerViewFovDegrees;

import { firearmBoreRay, firearmBoreTarget } from '../src/game/firearmAim.ts';
import { playCrosshairFrame, projectCrosshairScreenPosition } from '../src/ui/playHud.ts';
import { FISTS_MELEE } from './fixtures/unarmed.ts';
import { FIXTURE_RANGE_BLOCKS, farWallTarget, zombieAimFixture } from './zombieAimFixture.ts';

const boreModel = {
  id: 'fixture_bore',
  hold: 'upright',
  grip: { at: [0, 0, 0] },
  anchors: { muzzle: [0, 0, 0] },
  gun: { muzzleDirection: [0, 0, -1] },
} as unknown as ModelDef;

it('chooses a bore-line zombie in front of a far wall', () => {
  const blockSize = 0.5;
  const eye: Vec3 = [0, 4, 0];
  const direction: Vec3 = [0, 0, -1];
  const { system, target: actor } = zombieAimFixture(BUNDLED_CONTENT.registry, eye, direction, blockSize);
  const surface = farWallTarget(eye, direction, blockSize);

  expect(surface.distanceMetres).toBeGreaterThan(actor.distanceMetres);

  const result = firearmBoreTarget({
    eye,
    direction,
    surface,
    actors: system,
    blockSize,
    rangeBlocks: FIXTURE_RANGE_BLOCKS,
    weapon: FISTS_MELEE,
  });
  const actorPoint = eye.map((value, axis) => value + direction[axis]! * (actor.distanceMetres / blockSize)) as Vec3;

  expect(result.point).toEqual(actorPoint);
  expect(result.distanceMetres).toBe(actor.distanceMetres);
  expect(result.actor).toEqual(actor);
});

it('projects the shipped lowered bore below the raised firearm bore', () => {
  const blockSize = 0.5;
  const eye: Vec3 = [0, 4, 0];
  const camera = new PerspectiveCamera(PLAYER_VIEW_FOV_DEGREES, 2, 0.05, 100);
  camera.position.set(...(eye.map((value) => value * blockSize) as Vec3));
  const viewport = { left: 0, top: 0, width: 800, height: 400 };
  const tuning = skilledFirearmsTuning(BUNDLED_CONTENT.registry);
  if (!tuning) {
    throw new Error('Missing firearms-combat pose tuning');
  }
  const boreAt = (progress: number) =>
    firearmBoreRay({
      holds: BUNDLED_CONTENT.registry.figures.get('player')!.holds,
      model: boreModel,
      eye,
      yaw: 0,
      pitch: 0,
      blockSize,
      side: 'right',
      leadingSide: 'right',
      twoHanded: false,
      aimFrame: { yaw: 0, pitch: 0 },
      progress,
      loweredPitchRadians: tuning.loweredPitchRadians,
    });
  const pointOnBore = (bore: ReturnType<typeof firearmBoreRay>): Vec3 =>
    bore.muzzle.map((value, axis) => value + bore.direction[axis]! * 100) as Vec3;
  const screenTop = (point: Vec3): number => {
    const projected = new Vector3(point[0] * blockSize, point[1] * blockSize, point[2] * blockSize).project(camera);
    return viewport.top + ((1 - projected.y) / 2) * viewport.height;
  };
  const raisedBore = boreAt(1);
  const loweredBore = boreAt(0);
  const raisedDirection = new Vector3(...raisedBore.direction);
  const loweredDirection = new Vector3(...loweredBore.direction);
  const raisedPoint = pointOnBore(raisedBore);
  const loweredPoint = pointOnBore(loweredBore);
  const raisedPosition = projectCrosshairScreenPosition(camera, viewport, raisedPoint, blockSize);
  const loweredPosition = projectCrosshairScreenPosition(camera, viewport, loweredPoint, blockSize);

  expect(loweredDirection.y).toBeLessThan(raisedDirection.y);
  expect(loweredDirection.angleTo(raisedDirection)).toBeCloseTo(tuning.loweredPitchRadians, 5);
  expect(screenTop(loweredPoint)).toBeGreaterThan(screenTop(raisedPoint));
  expect(raisedPosition).toBeDefined();
  expect(raisedPosition!.top).toBeCloseTo(screenTop(raisedPoint));
  expect(playCrosshairFrame(true, true, raisedPosition, false)).toEqual({
    visible: true,
    screenPosition: raisedPosition,
  });
  if (loweredPosition) {
    expect(loweredPosition.top).toBeCloseTo(screenTop(loweredPoint));
    expect(playCrosshairFrame(true, true, loweredPosition, false)).toEqual({
      visible: true,
      screenPosition: loweredPosition,
    });
  } else {
    expect(playCrosshairFrame(true, true, loweredPosition, false)).toEqual({ visible: false });
  }
});
