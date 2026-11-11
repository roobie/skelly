import type { FurnitureDef } from '@skelly/engine/content';
import type { SkyVolume } from '@skelly/engine/internal/core/skylight.ts';
import { containsSky, sampleSky } from '@skelly/engine/sky';
import { BLOCK_SIZE, type BlockEntity, type Vec3 } from '@skelly/engine/world';
import { BoxGeometry, Matrix3, Matrix4, type Mesh, type MeshLambertMaterial, Quaternion, Vector3 } from 'three';
import { expect, it } from 'vitest';
import { FurnitureMeshes } from '../src/render/furniture.ts';
import { addSkyCellAnchors, addSkyOpeningAnchors, SKY_ANCHOR_ATTRIBUTE } from '../src/render/skyAnchor.ts';

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
  return { min: [0, 0, 0], max: size, size, light, unfurnished: light };
};

it('keeps an interior receiver dark until its face ray reaches an opening', () => {
  const receiver = (material: string, opens: boolean) => {
    const geometry = new BoxGeometry(1, 0.1, 1).translate(0, 1, 0);
    addSkyOpeningAnchors(geometry, {
      size: [3, 4, 3],
      cellSize: 1,
      materialAt: ([, y]) => (y === 2 ? material : undefined),
      isOpening: (at) => opens && at === 'window',
      openings:
        opens && material === 'window'
          ? [0, 1, 2].flatMap((x) => [0, 1, 2].map((z): [number, number, number] => [x, 2, z]))
          : [],
    });
    const normal = geometry.getAttribute('normal');
    const anchor = geometry.getAttribute(SKY_ANCHOR_ATTRIBUTE)!;
    const vertex = Array.from({ length: normal.count }, (_, index) => index).find((index) => normal.getY(index) > 0.9)!;
    return [anchor.getX(vertex), anchor.getY(vertex) + 0.25, anchor.getZ(vertex)] as Vec3;
  };
  const size: Vec3 = [4, 6, 4];
  const light = Uint8Array.from({ length: size[0] * size[1] * size[2] }, (_, index) =>
    index >= 3 * size[0] * size[2] ? 255 : 0,
  );
  const sky: SkyVolume = { min: [-2, 0, -2], max: [2, 6, 2], size, light, unfurnished: light };
  const lit = (point: Vec3) => {
    expect(containsSky(sky, point), `sky sample ${point} stays inside the fixture volume`).toBe(true);
    return sampleSky(sky, point) > 0;
  };
  expect(lit(receiver('window', true))).toBe(true);
  expect(lit(receiver('window', false))).toBe(false);
  expect(lit(receiver('roof', true))).toBe(false);
});

it('lets a sealed cabin face borrow the nearest window, one anchor across the whole quad', () => {
  // A roofed 4-cell cabin with one window in its +x wall: the floor's ray meets the roof, not the window.
  const geometry = new BoxGeometry(2, 0.1, 2).translate(0, 1, 0);
  addSkyOpeningAnchors(geometry, {
    size: [4, 4, 4],
    cellSize: 1,
    materialAt: ([x, y, z]) => {
      if (y === 3) {
        return 'roof';
      }
      return x === 3 && y === 1 && z === 1 ? 'window' : undefined;
    },
    isOpening: (at) => at === 'window',
    openings: [[3, 1, 1]],
  });
  const normal = geometry.getAttribute('normal');
  const anchor = geometry.getAttribute(SKY_ANCHOR_ATTRIBUTE)!;
  const floor = Array.from({ length: normal.count }, (_, index) => index).filter((index) => normal.getY(index) > 0.9);
  const [first] = floor;
  for (const vertex of floor) {
    expect([anchor.getX(vertex), anchor.getY(vertex), anchor.getZ(vertex)]).toEqual([
      anchor.getX(first!),
      anchor.getY(first!),
      anchor.getZ(first!),
    ]);
  }
  expect(anchor.getX(first!)).toBeGreaterThan(2);
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

/** The vertices whose receiver, stepping half a block out along the normal from its anchor, lands in a blocked cell. */
const blockedSamples = (
  geometry: BoxGeometry,
  toWorld: Matrix4,
  blocked: (x: number, y: number, z: number) => boolean,
  blockSize: number,
): string[] => {
  addSkyCellAnchors(geometry, { toWorld, blocked, own: [], blockSize });
  const anchor = geometry.getAttribute(SKY_ANCHOR_ATTRIBUTE)!;
  const normal = geometry.getAttribute('normal');
  const normalToWorld = new Matrix3().getNormalMatrix(toWorld);
  const found: string[] = [];
  for (let vertex = 0; vertex < anchor.count; vertex++) {
    const step = new Vector3().fromBufferAttribute(normal, vertex).applyMatrix3(normalToWorld).normalize();
    const sample = new Vector3()
      .fromBufferAttribute(anchor, vertex)
      .applyMatrix4(toWorld)
      .divideScalar(blockSize)
      .addScaledVector(step, 0.5);
    const cell = sample.toArray().map(Math.floor) as Vec3;
    if (blocked(...cell)) {
      found.push(`vertex ${vertex} samples blocked cell ${cell}`);
    }
  }
  return found;
};

it('samples a placed body from open cells outside the cells it blocks, turned and mirrored as it stands', () => {
  // A body set back inside a 3 x 2 x 3 block of blocked cells by more than the receiver's half-block step.
  const blocked = (x: number, y: number, z: number) => x >= 0 && x < 3 && y >= 0 && y < 2 && z >= 0 && z < 3;
  const toWorld = new Matrix4().compose(
    new Vector3(0.75, 0.5, 0.75),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
    new Vector3(-1, 1, 1),
  );
  expect(blockedSamples(new BoxGeometry(0.75, 0.75, 0.5), toWorld, blocked, 0.5)).toEqual([]);
});

it('steps a surface in an open cell past blocked cells its normal meets within the receiver step', () => {
  // A plate whose top face lies in an open cell, a fifth of a block under a layer of blocked cells.
  const blocked = (x: number, y: number, z: number) => x >= 0 && x < 3 && y === 1 && z >= 0 && z < 3;
  const toWorld = new Matrix4().makeTranslation(0.75, 0.35, 0.75);
  expect(blockedSamples(new BoxGeometry(1, 0.1, 1), toWorld, blocked, 0.5)).toEqual([]);
});

it("never carries a surface's sky sample past its own body's geometry", () => {
  // A cabin of blocked cells three layers high under a thin roof panel, and a seat whose top lies in the top layer:
  // the open cell above the roof is within reach, but the seat sees the roof, not that sky.
  const blocked = (x: number, y: number, z: number) => x >= 0 && x < 4 && y >= 0 && y < 3 && z >= 0 && z < 4;
  const roof = { min: [0, 2.75, 0] as Vec3, max: [4, 2.875, 4] as Vec3 };
  const seat = new BoxGeometry(1, 0.2, 1);
  const toWorld = new Matrix4().makeTranslation(1, 1, 1);
  addSkyCellAnchors(seat, { toWorld, blocked, own: [roof], blockSize: 0.5 });
  const anchor = seat.getAttribute(SKY_ANCHOR_ATTRIBUTE)!;
  const normal = seat.getAttribute('normal');
  const samples: number[] = [];
  for (let vertex = 0; vertex < anchor.count; vertex++) {
    if (normal.getY(vertex) > 0.5) {
      samples.push(new Vector3().fromBufferAttribute(anchor, vertex).applyMatrix4(toWorld).y / 0.5 + 0.5);
    }
  }
  expect(samples.length).toBeGreaterThan(0);
  for (const height of samples) {
    expect(height).toBeLessThan(roof.min[1]);
  }
});
