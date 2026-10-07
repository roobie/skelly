import { PerspectiveCamera } from 'three';
import { expect, it } from 'vitest';
import type { ModelDef } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { BUNDLED_CONTENT } from '../src/game/bundledContent.ts';
import { firearmBoreRay, firearmBoreTarget } from '../src/game/firearmAim.ts';
import { playCrosshairFrame, projectCrosshairScreenPosition } from '../src/ui/playHud.ts';
import { farWallTarget, zombieAimFixture } from './zombieAimFixture.ts';

const boreModel = {
  id: 'fixture_bore',
  hold: 'upright',
  grip: { at: [0, 0, 0] },
  anchors: { muzzle: [0, 0, 0] },
  muzzleDirection: [0, 0, -1],
} as unknown as ModelDef;

it('chooses a bore-line zombie in front of a far wall', () => {
  const blockSize = 0.5;
  const eye: Vec3 = [0, 4, 0];
  const direction: Vec3 = [0, 0, -1];
  const { system, target: zombie } = zombieAimFixture(BUNDLED_CONTENT.registry, eye, direction, blockSize);
  const surface = farWallTarget(eye, direction, blockSize);

  expect(surface.distanceMetres).toBeGreaterThan(zombie.distanceMetres);

  const result = firearmBoreTarget({ eye, direction, surface, zombies: system, blockSize });
  const zombiePoint = eye.map((value, axis) => value + direction[axis]! * (zombie.distanceMetres / blockSize)) as Vec3;

  expect(result.point).toEqual(zombiePoint);
  expect(result.distanceMetres).toBe(zombie.distanceMetres);
  expect(result.zombie).toEqual(zombie);
});

it('projects the lowered firearm bore off-screen until it is raised', () => {
  const blockSize = 0.5;
  const eye: Vec3 = [0, 4, 0];
  const camera = new PerspectiveCamera();
  camera.aspect = 2;
  camera.updateProjectionMatrix();
  camera.position.set(...(eye.map((value) => value * blockSize) as Vec3));
  const viewport = { left: 0, top: 0, width: 800, height: 400 };
  const loweredPitchRadians = (camera.fov * Math.PI) / 180;
  const pointOnBore = (progress: number): Vec3 => {
    const bore = firearmBoreRay({
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
      loweredPitchRadians,
    });
    return bore.muzzle.map((value, axis) => value + bore.direction[axis]! * 100) as Vec3;
  };

  const raisedPosition = projectCrosshairScreenPosition(camera, viewport, pointOnBore(1), blockSize);
  const loweredPosition = projectCrosshairScreenPosition(camera, viewport, pointOnBore(0), blockSize);

  expect(raisedPosition).toBeDefined();
  expect(playCrosshairFrame(true, true, raisedPosition)).toEqual({ visible: true, screenPosition: raisedPosition });
  expect(loweredPosition).toBeUndefined();
  expect(playCrosshairFrame(true, true, loweredPosition)).toEqual({ visible: false });
});
