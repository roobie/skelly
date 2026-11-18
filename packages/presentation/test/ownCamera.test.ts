import type { Vec3 } from '@skelly/engine/world';
import { PerspectiveCamera, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { clearOwnCamera } from '../src/render/ownCamera.ts';

const blockSize = 0.5;
// A one-block wall across x, with the body's box pressed to its near face.
const isSolid = (x: number) => x === 2;
const body = { pos: [1.4, 0, 0.5] as Vec3, height: 3.6 };
// Aiming down sights carries the camera forward and across, through the wall's near face.
const posed: Vec3 = [2.1, 3.15, 0.7];

const nearCornersInWall = (position: Readonly<Vec3>, lookAt: Readonly<Vec3>, aspect: number): number => {
  const camera = new PerspectiveCamera(75, aspect, 0.01, 100);
  camera.position.set(...(position.map((value) => value * blockSize) as Vec3));
  camera.lookAt(...(lookAt.map((value) => value * blockSize) as Vec3));
  camera.updateMatrixWorld();
  return [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ].filter(([x, y]) => {
    const corner = new Vector3(x, y, -1).unproject(camera).divideScalar(blockSize);
    return isSolid(Math.floor(corner.x));
  }).length;
};

// Each look at the wall on a different window shape.
it.each([
  { meeting: 'head-on', lookAt: [4, 3.2, 0.5] as Vec3, aspect: 16 / 9 },
  { meeting: 'obliquely', lookAt: [4, 3.2, 3] as Vec3, aspect: 21 / 9 },
  { meeting: 'at a grazing angle', lookAt: [2.1, 3.4, 4] as Vec3, aspect: 4 / 3 },
])('keeps every near-plane corner of the ADS camera out of a wall it meets $meeting', ({ lookAt, aspect }) => {
  const look = (position: Readonly<Vec3>) => nearCornersInWall(position, [...lookAt], aspect);
  expect(look(posed)).toBeGreaterThan(0);
  const camera = new PerspectiveCamera(75, aspect, 0.01, 100);
  const placed = clearOwnCamera({ body, posed, camera, padMetres: 0, blockSize, isSolid });
  expect(look(placed)).toBe(0);
});
