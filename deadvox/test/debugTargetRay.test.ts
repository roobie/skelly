import { expect, it } from 'vitest';
import type { Vec3 } from '../src/core/coords.ts';
import { debugTargetRay } from '../src/game/debugTargetRay.ts';

it('keeps debug targets on the view ray while a wielded firearm is lowered', () => {
  const eye: Vec3 = [1, 2, 3];
  const lookDirection: Vec3 = [0, 0, -1];
  const loweredBore = { origin: [1, 1, 3] as Vec3, direction: [0, -0.5, -0.86] as Vec3 };

  expect(
    debugTargetRay({
      bore: loweredBore,
      eye,
      lookDirection,
      rightMouseHeld: true,
      pointerLocked: true,
      menuPointer: false,
      firearmReady: false,
    }),
  ).toEqual({ origin: eye, direction: lookDirection });
  expect(
    debugTargetRay({
      bore: loweredBore,
      eye,
      lookDirection,
      rightMouseHeld: true,
      pointerLocked: true,
      menuPointer: false,
      firearmReady: true,
    }),
  ).toEqual(loweredBore);
});
