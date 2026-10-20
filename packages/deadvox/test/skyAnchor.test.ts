import type { Mesh, MeshLambertMaterial } from 'three';
import { expect, it } from 'vitest';
import type { BlockEntity } from '../src/core/blockEntities.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { BLOCK_SIZE } from '../src/core/scale.ts';
import type { FurnitureDef } from '../src/core/schema.ts';
import type { SkyVolume } from '../src/core/skylight.ts';
import { sampleSky } from '../src/core/skyTransport.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { SKY_ANCHOR_ATTRIBUTE } from '../src/render/skyAnchor.ts';

// A slim shaft and a crossarm standing in a wide envelope: the shaft's faces are set back from the envelope's
// edge by more than the half block the receiver steps out along its normal.
const pole = {
  id: 'fixture_pole',
  name: 'Fixture pole',
  size: [4, 8, 4],
  color: '#6b5a47',
  shape: [
    { position: [1.5, 0, 1.5], size: [1, 8, 1] },
    { position: [0, 6, 1.2], size: [4, 0.5, 1.6], color: '#5a4c3b' },
  ],
} as unknown as FurnitureDef;
const origin: Vec3 = [3, 1, 3];
const entity: BlockEntity = {
  uid: 1,
  type: pole.id,
  origin,
  pos: origin,
  size: pole.size as Vec3,
  facing: 'n',
  carried: false,
  searched: false,
  open: false,
};

/**
 * Open sky everywhere except the piece's whole envelope: darker than the transport leaves a shaped piece, which blocks
 * light only where it is drawn, so the receiver passes however its drawn blocks fall.
 */
const skyAroundPiece = (): SkyVolume => {
  const size: Vec3 = [12, 12, 12];
  const [sx, sy, sz] = size;
  const [ox, oy, oz] = origin;
  const [w, h, d] = entity.size;
  const light = new Uint8Array(sx * sy * sz).fill(255);
  for (let y = oy; y < oy + h; y++) {
    for (let z = oz; z < oz + d; z++) {
      for (let x = ox; x < ox + w; x++) {
        light[x + sx * (z + sz * y)] = 0;
      }
    }
  }
  return { min: [0, 0, 0], max: size, size, light };
};

it('lights every upward and sideways face of a shaped piece set back inside its envelope', () => {
  const mesh = new FurnitureMeshes(BLOCK_SIZE).pieceMesh(entity, pole) as Mesh;
  const material = mesh.material as MeshLambertMaterial;
  const { geometry } = mesh;
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  // The receiver patch (render/skylight.ts) samples from the anchor only when the material defines SKY_ANCHOR.
  const from =
    material.defines && 'SKY_ANCHOR' in material.defines ? geometry.getAttribute(SKY_ANCHOR_ATTRIBUTE) : position;
  expect(from, 'anchored material needs the anchor attribute').toBeDefined();
  const sky = skyAroundPiece();
  const base = mesh.position.toArray().map((value) => value / BLOCK_SIZE);
  let sampled = 0;
  for (let vertex = 0; vertex < position.count; vertex++) {
    if (normal.getY(vertex) < -0.5) {
      continue;
    }
    // A side face is sampled at its middle height, not at the envelope's top or bottom corners, where the
    // interpolation between a blocked and an open cell would hide a blocked sample.
    const middle = Math.abs(normal.getY(vertex)) < 0.5;
    const point: Vec3 = [
      base[0]! + from!.getX(vertex) + normal.getX(vertex) * 0.5,
      middle ? base[1]! + entity.size[1] / 2 : base[1]! + from!.getY(vertex) + normal.getY(vertex) * 0.5,
      base[2]! + from!.getZ(vertex) + normal.getZ(vertex) * 0.5,
    ];
    expect(sampleSky(sky, point)).toBeGreaterThanOrEqual(0.5);
    sampled += 1;
  }
  expect(sampled).toBeGreaterThan(0);
});
