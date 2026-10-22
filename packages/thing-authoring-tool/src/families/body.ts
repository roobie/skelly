import type { BoxSolid, ExtrudedPolygonSolid, Vec2 } from '@skelly/engine/shapes/solid.ts';
import { parse, strictObject } from 'valibot';
import { positive, scalar } from './shapes.ts';

const CLOTH_THICKNESS = 0.004;

interface Footprint {
  halfX: number;
  halfZ: number;
  chamfer?: number;
  cx?: number;
  cz?: number;
}

const outline = ({ halfX, halfZ, chamfer = 0.012, cx = 0, cz = 0 }: Footprint): Vec2[] => {
  const c = Math.min(chamfer, halfX, halfZ) * 0.5;
  return (
    [
      [-halfZ + c, -halfX],
      [halfZ - c, -halfX],
      [halfZ, -halfX + c],
      [halfZ, halfX - c],
      [halfZ - c, halfX],
      [-halfZ + c, halfX],
      [-halfZ, halfX - c],
      [-halfZ, -halfX + c],
    ] satisfies Vec2[]
  ).map(([z, x]) => [z! + cz, x! + cx]);
};
const slab = (
  id: string,
  slot: string,
  [bottom, top]: readonly [number, number],
  footprint: Footprint,
): ExtrudedPolygonSolid => ({
  id,
  kind: 'extruded-polygon',
  axis: 'y',
  profile: outline(footprint),
  z: [bottom, top],
  slot,
});
type Range = readonly [number, number];
const block = (id: string, slot: string, ...[[x0, x1], [y0, y1], [z0, z1]]: [Range, Range, Range]): BoxSolid => ({
  id,
  kind: 'box',
  box: {
    center: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
    half: [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
  },
  slot,
});
// The severed face: a gore plate set into the part's end with a bone stub standing out of it.
const cutFace = (id: string, { halfX, halfZ, cx = 0, cz = 0 }: Footprint, y: number, outward: 1 | -1) => {
  const depth = 0.012;
  const inner = [y - outward * depth, y].sort((a, b) => a - b) as [number, number];
  const stub = [y - outward * depth, y + outward * 0.018].sort((a, b) => a - b) as [number, number];
  return [
    slab(`${id}-gore`, 'gore', inner, { halfX: halfX - 0.005, halfZ: halfZ - 0.005, chamfer: 0.02, cx, cz }),
    block(`${id}-bone`, 'bone', [cx - halfX * 0.3, cx + halfX * 0.3], stub, [cz - halfZ * 0.3, cz + halfZ * 0.3]),
  ];
};

// A limb lies along y with its cut end at the top: upper and lower segments, then a hand or foot.
// Cloth covers `sleeve` metres down from the cut; bare skin shows below it.
export const limb = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      length: positive,
      upper: positive,
      upperWidth: positive,
      upperDepth: positive,
      lowerWidth: positive,
      lowerDepth: positive,
      sleeve: scalar,
      endLength: positive,
      endWidth: positive,
      endDepth: positive,
      endReach: scalar,
    }),
    params,
  );
  const hem = d.length - d.sleeve;
  const lowerTop = d.length - d.upper;
  const segments = [
    { id: 'upper', range: [lowerTop, d.length], halfX: d.upperWidth / 2, halfZ: d.upperDepth / 2 },
    { id: 'lower', range: [d.endLength, lowerTop], halfX: d.lowerWidth / 2, halfZ: d.lowerDepth / 2 },
  ] as const;
  const solids: (ExtrudedPolygonSolid | BoxSolid)[] = [];
  for (const { id, range, halfX, halfZ } of segments) {
    const [bottom, top] = range;
    const split = Math.min(Math.max(hem, bottom), top);
    if (split > bottom) {
      solids.push(slab(`${id}-skin`, 'skin', [bottom, split], { halfX, halfZ }));
    }
    if (split < top) {
      solids.push(
        slab(`${id}-cloth`, 'cloth', [split, top], {
          halfX: halfX + CLOTH_THICKNESS,
          halfZ: halfZ + CLOTH_THICKNESS,
          chamfer: 0.016,
        }),
      );
    }
  }
  solids.push(
    slab('end', 'end', [0, d.endLength], {
      halfX: d.endWidth / 2,
      halfZ: d.endDepth / 2,
      chamfer: 0.01,
      cz: d.endReach / 2,
    }),
    ...cutFace(
      'cut',
      { halfX: d.upperWidth / 2 + CLOTH_THICKNESS, halfZ: d.upperDepth / 2 + CLOTH_THICKNESS },
      d.length,
      1,
    ),
  );
  return solids;
};

// A torso stands on its pelvis, shirt over the chest, trousers below, with the neck and the four limb
// sockets torn open.
export const torso = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      height: positive,
      chestWidth: positive,
      chestDepth: positive,
      pelvisWidth: positive,
      pelvisDepth: positive,
      pelvisHeight: positive,
      neckWidth: positive,
      neckHeight: positive,
      tear: scalar,
    }),
    params,
  );
  const shoulders = d.height - d.neckHeight;
  const halfChestX = d.chestWidth / 2 + CLOTH_THICKNESS;
  const halfChestZ = d.chestDepth / 2 + CLOTH_THICKNESS;
  const socket = 0.1;
  const shoulderY: [number, number] = [shoulders - socket - 0.02, shoulders - 0.02];
  const hipHalf = d.pelvisWidth / 2 + CLOTH_THICKNESS;
  const neck = { halfX: d.neckWidth / 2, halfZ: d.neckWidth / 2 };
  return [
    slab('pelvis', 'pants', [0, d.pelvisHeight], {
      halfX: hipHalf,
      halfZ: d.pelvisDepth / 2 + CLOTH_THICKNESS,
      chamfer: 0.03,
    }),
    slab('chest', 'shirt', [d.pelvisHeight, shoulders], { halfX: halfChestX, halfZ: halfChestZ, chamfer: 0.04 }),
    slab('neck', 'skin', [shoulders, d.height], { ...neck, chamfer: 0.02 }),
    block(
      'belly',
      'skin',
      [-d.chestWidth * 0.3, d.chestWidth * 0.3],
      [d.pelvisHeight, d.pelvisHeight + d.tear],
      [halfChestZ - CLOTH_THICKNESS * 1.5, halfChestZ + 0.002],
    ),
    ...cutFace('neck', neck, d.height, 1),
    block('left-shoulder-gore', 'gore', [halfChestX - 0.004, halfChestX + 0.006], shoulderY, [-0.07, 0.07]),
    block('right-shoulder-gore', 'gore', [-halfChestX - 0.006, -halfChestX + 0.004], shoulderY, [-0.07, 0.07]),
    block('left-hip-gore', 'gore', [0.015, hipHalf - 0.015], [-0.006, 0.004], [-0.07, 0.07]),
    block('right-hip-gore', 'gore', [-hipHalf + 0.015, -0.015], [-0.006, 0.004], [-0.07, 0.07]),
  ];
};

// A head sits on its neck cut, face toward +z, with the hair a cap over the crown and back.
export const head = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      width: positive,
      height: positive,
      depth: positive,
      jawHeight: positive,
      hairCover: positive,
    }),
    params,
  );
  const halfX = d.width / 2;
  const halfZ = d.depth / 2;
  const jawHalfX = halfX * 0.82;
  const jawHalfZ = halfZ * 0.86;
  const eyeY = d.height * 0.66;
  return [
    slab('skull', 'skin', [d.jawHeight, d.height], { halfX, halfZ, chamfer: 0.04 }),
    slab('jaw', 'skin', [0, d.jawHeight], { halfX: jawHalfX, halfZ: jawHalfZ, chamfer: 0.03, cz: -halfZ * 0.06 }),
    slab('crown', 'hair', [d.height - d.hairCover, d.height + CLOTH_THICKNESS], {
      halfX: halfX + 0.003,
      halfZ: halfZ + 0.003,
      chamfer: 0.04,
    }),
    block(
      'back-hair',
      'hair',
      [-halfX - 0.003, halfX + 0.003],
      [d.jawHeight + 0.02, d.height],
      [-halfZ - 0.003, -halfZ + d.hairCover],
    ),
    block('left-eye', 'eye', [halfX * 0.2, halfX * 0.62], [eyeY - 0.01, eyeY + 0.01], [halfZ - 0.002, halfZ + 0.003]),
    block(
      'right-eye',
      'eye',
      [-halfX * 0.62, -halfX * 0.2],
      [eyeY - 0.01, eyeY + 0.01],
      [halfZ - 0.002, halfZ + 0.003],
    ),
    block('nose', 'skin', [-0.008, 0.008], [eyeY - 0.045, eyeY - 0.005], [halfZ, halfZ + 0.014]),
    block(
      'mouth',
      'mouth',
      [-jawHalfX * 0.5, jawHalfX * 0.5],
      [d.jawHeight * 0.45, d.jawHeight * 0.75],
      [jawHalfZ - halfZ * 0.06 - 0.002, jawHalfZ - halfZ * 0.06 + 0.003],
    ),
    ...cutFace('neck', { halfX: jawHalfX * 0.55, halfZ: jawHalfZ * 0.55 }, 0, -1),
  ];
};
