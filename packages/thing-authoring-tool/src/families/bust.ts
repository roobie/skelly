import type { BoxSolid, ExtrudedPolygonSolid } from '@skelly/engine/shapes/solid.ts';
import { parse, picklist, strictObject } from 'valibot';
import { block, slab } from './body.ts';
import { positive } from './shapes.ts';

/** The bust's segments: the head is its own part so a stance can lift it about the neck while the torso leans. */
const BUST_SEGMENTS = ['pelvis', 'torso', 'neck', 'head'] as const;

// The player's head and torso: origin at the pelvis base on the centre line, y up, face toward +z. Four stacked
// slabs taper hips to shoulders, a deltoid cap is centred on each shoulder joint, and the head stands on the neck.
// The head segment is drawn about the neck's top, the joint it turns about. The model's anchors name solids here, so
// a joint follows the solid that seats its limb.
export const bust = (params: Readonly<Record<string, string>>): (ExtrudedPolygonSolid | BoxSolid)[] => {
  const d = parse(
    strictObject({
      segment: picklist(BUST_SEGMENTS),
      /** How far the neck reaches up into the head; its top is the head's joint. */
      neckOverlap: positive,
      pelvisWidth: positive,
      pelvisDepth: positive,
      pelvisHeight: positive,
      waistWidth: positive,
      waistDepth: positive,
      waistHeight: positive,
      ribWidth: positive,
      ribDepth: positive,
      ribHeight: positive,
      chestWidth: positive,
      chestDepth: positive,
      chestHeight: positive,
      shoulderWidth: positive,
      shoulderHeight: positive,
      shoulderDepth: positive,
      neckWidth: positive,
      neckHeight: positive,
      headWidth: positive,
      headHeight: positive,
      headDepth: positive,
      jawHeight: positive,
      hairCover: positive,
    }),
    params,
  );
  const waist = d.pelvisHeight;
  const ribs = waist + d.waistHeight;
  const chest = ribs + d.ribHeight;
  const shoulders = chest + d.chestHeight;
  const crown = shoulders + d.neckHeight;
  const top = crown + d.headHeight;
  const halfX = d.headWidth / 2;
  const halfZ = d.headDepth / 2;
  const jawHalfX = halfX * 0.8;
  const jawHalfZ = halfZ * 0.84;
  const origin = d.segment === 'head' ? crown + d.neckOverlap : 0;
  const ys = (bottom: number, topY: number): [number, number] => [bottom - origin, topY - origin];
  const eyeY = crown + d.headHeight * 0.58;
  const deltoidX = d.chestWidth / 2 + d.shoulderWidth / 2 - 0.012;
  const deltoidY = shoulders - d.shoulderHeight / 2 - 0.01;
  const deltoid = (id: string, side: 1 | -1) =>
    block(
      id,
      'skin',
      [side * deltoidX - d.shoulderWidth / 2, side * deltoidX + d.shoulderWidth / 2],
      ys(deltoidY - d.shoulderHeight / 2, deltoidY + d.shoulderHeight / 2),
      [-d.shoulderDepth / 2, d.shoulderDepth / 2],
    );
  const eye = (id: string, side: 1 | -1) =>
    block(
      id,
      'eye',
      [Math.min(side * halfX * 0.3, side * halfX * 0.62), Math.max(side * halfX * 0.3, side * halfX * 0.62)],
      ys(eyeY - 0.011, eyeY + 0.011),
      [halfZ - 0.002, halfZ + 0.003],
    );
  const ear = (id: string, side: 1 | -1) =>
    block(
      id,
      'skin',
      [side > 0 ? halfX - 0.002 : -halfX - 0.012, side > 0 ? halfX + 0.012 : -halfX + 0.002],
      ys(eyeY - 0.04, eyeY + 0.02),
      [-0.025, 0.02],
    );
  if (d.segment === 'pelvis') {
    return [
      slab('pelvis', 'underwear', ys(0, waist), {
        halfX: d.pelvisWidth / 2,
        halfZ: d.pelvisDepth / 2,
        chamfer: 0.05,
      }),
    ];
  }
  if (d.segment === 'torso') {
    return [
      slab('waist', 'skin', ys(waist, ribs), { halfX: d.waistWidth / 2, halfZ: d.waistDepth / 2, chamfer: 0.05 }),
      slab('ribs', 'skin', ys(ribs, chest), { halfX: d.ribWidth / 2, halfZ: d.ribDepth / 2, chamfer: 0.05 }),
      slab('chest', 'skin', ys(chest, shoulders), { halfX: d.chestWidth / 2, halfZ: d.chestDepth / 2, chamfer: 0.06 }),
      deltoid('shoulder-left', 1),
      deltoid('shoulder-right', -1),
    ];
  }
  if (d.segment === 'neck') {
    return [
      slab('neck', 'skin', ys(shoulders, crown + d.neckOverlap), {
        halfX: d.neckWidth / 2,
        halfZ: d.neckWidth / 2,
        chamfer: 0.03,
      }),
    ];
  }
  return [
    slab('skull', 'skin', ys(crown + d.jawHeight, top), { halfX, halfZ, chamfer: 0.05 }),
    slab('jaw', 'skin', ys(crown, crown + d.jawHeight), {
      halfX: jawHalfX,
      halfZ: jawHalfZ,
      chamfer: 0.04,
      cz: -halfZ * 0.04,
    }),
    ear('left-ear', 1),
    ear('right-ear', -1),
    slab('crown', 'hair', ys(top - d.hairCover, top + 0.006), {
      halfX: halfX + 0.004,
      halfZ: halfZ + 0.004,
      chamfer: 0.05,
    }),
    block('back-hair', 'hair', [-halfX - 0.004, halfX + 0.004], ys(crown + d.jawHeight + 0.02, top), [
      -halfZ - 0.004,
      -halfZ + d.hairCover * 0.9,
    ]),
    block('side-hair-left', 'hair', [halfX - 0.004, halfX + 0.005], ys(eyeY + 0.02, top), [
      -halfZ + d.hairCover * 0.9,
      0,
    ]),
    block('side-hair-right', 'hair', [-halfX - 0.005, -halfX + 0.004], ys(eyeY + 0.02, top), [
      -halfZ + d.hairCover * 0.9,
      0,
    ]),
    block('fringe', 'hair', [-halfX - 0.004, halfX + 0.004], ys(top - d.hairCover * 0.85, top), [
      halfZ - 0.03,
      halfZ + 0.004,
    ]),
    eye('left-eye', 1),
    eye('right-eye', -1),
    block('nose', 'skin', [-0.011, 0.011], ys(eyeY - 0.05, eyeY - 0.004), [halfZ - 0.002, halfZ + 0.016]),
    block(
      'mouth',
      'mouth',
      [-jawHalfX * 0.42, jawHalfX * 0.42],
      ys(crown + d.jawHeight * 0.5, crown + d.jawHeight * 0.72),
      [jawHalfZ - halfZ * 0.04 - 0.002, jawHalfZ - halfZ * 0.04 + 0.003],
    ),
  ];
};
