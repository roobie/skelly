import { BoxGeometry, type Mesh, type MeshLambertMaterial } from 'three';
import { expect, it } from 'vitest';
import type { BlockEntity } from '../src/core/blockEntities.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { BLOCK_SIZE } from '../src/core/scale.ts';
import type { FurnitureDef } from '../src/core/schema.ts';
import type { SkyVolume } from '../src/core/skylight.ts';
import { containsSky } from '../src/core/skySnapshot.ts';
import { sampleSky } from '../src/core/skyTransport.ts';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { addSkyOpeningAnchors, SKY_ANCHOR_ATTRIBUTE } from '../src/render/skyAnchor.ts';

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

it('keeps an interior receiver dark until its face ray reaches an opening', () => {
  const receiver = (material: string, opens: boolean) => {
    const geometry = new BoxGeometry(1, 0.1, 1).translate(0, 1, 0);
    addSkyOpeningAnchors(geometry, {
      size: [3, 4, 3],
      cellSize: 1,
      materialAt: ([, y]) => (y === 2 ? material : undefined),
      isOpening: (at) => opens && at === 'window',
    });
    const normal = geometry.getAttribute('normal');
    const anchor = geometry.getAttribute(SKY_ANCHOR_ATTRIBUTE)!;
    const vertex = Array.from({ length: normal.count }, (_, index) => index).find((index) => normal.getY(index) > 0.9)!;
    return [anchor.getX(vertex), anchor.getY(vertex) + 0.25, anchor.getZ(vertex)] as Vec3;
  };
  const size: Vec3 = [4, 6, 4];
  const sky: SkyVolume = {
    min: [-2, 0, -2],
    max: [2, 6, 2],
    size,
    light: Uint8Array.from({ length: size[0] * size[1] * size[2] }, (_, index) =>
      index >= 3 * size[0] * size[2] ? 255 : 0,
    ),
  };
  const lit = (point: Vec3) => {
    expect(containsSky(sky, point), `sky sample ${point} stays inside the fixture volume`).toBe(true);
    return sampleSky(sky, point) > 0;
  };
  expect(lit(receiver('window', true))).toBe(true);
  expect(lit(receiver('window', false))).toBe(false);
  expect(lit(receiver('roof', true))).toBe(false);
});

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
