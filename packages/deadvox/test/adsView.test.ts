import { expect, it } from 'vitest';
import { guardAdsCamera } from '../src/core/adsView.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { raycast } from '../src/core/raycast.ts';
import { cross, normalize, sub } from '../src/core/spatial.ts';

it('pulls the ADS camera back along its body-eye segment before crossing solid geometry', () => {
  const bodyEye: Vec3 = [0.75, 0.5, 0.5];
  const cameraEye: Vec3 = [1.25, 0.75, 0.5];
  const common = { bodyEye, cameraEye, blockSize: 0.5, marginMetres: 0.01 };
  expect(guardAdsCamera({ ...common, isSolid: () => false })).toEqual(cameraEye);
  const isSolid = (x: number) => x === 1;
  const guarded = guardAdsCamera({ ...common, isSolid });
  const direction = normalize(sub(cameraEye, bodyEye));
  const travelled = Math.hypot(...sub(guarded, bodyEye));
  const hit = raycast(bodyEye, direction, Math.hypot(...sub(cameraEye, bodyEye)), isSolid)!;
  expect(hit).toBeDefined();
  expect(travelled).toBeGreaterThan(0);
  expect(travelled).toBeLessThan(hit.distance);
  expect(raycast(bodyEye, direction, travelled, isSolid)).toBeUndefined();
  expect(Math.hypot(...cross(sub(guarded, bodyEye), direction))).toBeLessThan(1e-12);
});
