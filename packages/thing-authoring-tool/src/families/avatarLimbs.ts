import type { BoxSolid, ExtrudedPolygonSolid } from '@skelly/engine/shapes/solid.ts';
import { parse, strictObject } from 'valibot';
import { block, slab } from './body.ts';
import { positive } from './shapes.ts';

// The player's limbs hang from their joint: origin on the joint at the limb's top, y up, the limb down -y, front
// toward +z. Each limb is mirror-symmetric in x, so one model serves either side, and code poses it about its joint.

/** A hanging arm: short sleeve, bare upper arm and forearm, the hand edge-on to the thigh with its thumb forward. */
export const avatarArm = (params: Readonly<Record<string, string>>): (ExtrudedPolygonSolid | BoxSolid)[] => {
  const d = parse(
    strictObject({
      upperLength: positive,
      upperWidth: positive,
      upperDepth: positive,
      sleeveLength: positive,
      foreLength: positive,
      foreWidth: positive,
      wristWidth: positive,
      palmLength: positive,
      palmWidth: positive,
      palmThickness: positive,
      fingerLength: positive,
      thumbLength: positive,
    }),
    params,
  );
  const elbow = -d.upperLength;
  const wrist = elbow - d.foreLength;
  const knuckles = wrist - d.palmLength;
  const tips = knuckles - d.fingerLength;
  const halfPalm = d.palmWidth / 2;
  const halfThick = d.palmThickness / 2;
  return [
    slab('sleeve', 'shirt', [-d.sleeveLength, 0], {
      halfX: d.upperWidth / 2 + 0.008,
      halfZ: d.upperDepth / 2 + 0.008,
      chamfer: 0.03,
    }),
    slab('upper-arm', 'skin', [elbow, -d.sleeveLength + 0.01], {
      halfX: d.upperWidth / 2,
      halfZ: d.upperDepth / 2,
      chamfer: 0.03,
    }),
    slab('forearm', 'skin', [wrist + d.foreLength * 0.45, elbow + 0.01], {
      halfX: d.foreWidth / 2,
      halfZ: d.foreWidth / 2 + 0.004,
      chamfer: 0.03,
    }),
    slab('wrist', 'skin', [wrist, wrist + d.foreLength * 0.45 + 0.01], {
      halfX: d.wristWidth / 2,
      halfZ: d.wristWidth / 2 + 0.006,
      chamfer: 0.02,
    }),
    block('palm', 'skin', [-halfThick, halfThick], [knuckles, wrist + 0.005], [-halfPalm, halfPalm]),
    block(
      'fingers',
      'skin',
      [-halfThick * 0.8, halfThick * 0.8],
      [tips, knuckles + 0.005],
      [-halfPalm, halfPalm * 0.9],
    ),
    block(
      'thumb',
      'skin',
      [-halfThick * 0.7, halfThick * 0.7],
      [wrist - d.palmLength * 0.3 - d.thumbLength, wrist - d.palmLength * 0.3],
      [halfPalm - 0.004, halfPalm + 0.014],
    ),
  ];
};

/** A standing leg: trouser thigh and shin over a shoe whose sole lies `length` below the hip joint. */
export const avatarLeg = (params: Readonly<Record<string, string>>): (ExtrudedPolygonSolid | BoxSolid)[] => {
  const d = parse(
    strictObject({
      length: positive,
      thighLength: positive,
      thighWidth: positive,
      thighDepth: positive,
      shinWidth: positive,
      shinDepth: positive,
      shoeHeight: positive,
      shoeWidth: positive,
      toeReach: positive,
      heelReach: positive,
    }),
    params,
  );
  const knee = -d.thighLength;
  const sole = -d.length;
  const ankle = sole + d.shoeHeight;
  const halfShoe = d.shoeWidth / 2;
  return [
    slab('thigh', 'pants', [knee, 0], { halfX: d.thighWidth / 2, halfZ: d.thighDepth / 2, chamfer: 0.04 }),
    slab('shin', 'pants', [ankle - 0.01, knee + 0.02], {
      halfX: d.shinWidth / 2,
      halfZ: d.shinDepth / 2,
      chamfer: 0.03,
    }),
    slab('cuff', 'pants', [ankle - 0.01, ankle + 0.04], {
      halfX: d.shinWidth / 2 + 0.006,
      halfZ: d.shinDepth / 2 + 0.006,
      chamfer: 0.03,
    }),
    block('sole', 'sole', [-halfShoe, halfShoe], [sole, sole + 0.025], [-d.heelReach, d.toeReach]),
    slab('shoe', 'shoe', [sole + 0.02, ankle], {
      halfX: halfShoe - 0.004,
      halfZ: (d.heelReach + d.toeReach) / 2 - 0.008,
      chamfer: 0.04,
      cz: (d.toeReach - d.heelReach) / 2 - 0.004,
    }),
    block(
      'toe-cap',
      'shoe',
      [-halfShoe + 0.006, halfShoe - 0.006],
      [sole + 0.02, sole + d.shoeHeight * 0.6],
      [d.toeReach * 0.55, d.toeReach - 0.002],
    ),
  ];
};
