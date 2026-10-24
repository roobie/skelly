import type { BoxSolid, ExtrudedPolygonSolid } from '@skelly/engine/shapes/solid.ts';
import { parse, picklist, strictObject } from 'valibot';
import { block, slab } from './body.ts';
import { positive } from './shapes.ts';

// The player's limbs hang from their joint: origin on the joint at the limb's top, y up, the limb down -y, front
// toward +z. Each limb is mirror-symmetric in x, so one model serves either side, and code poses it about its joint.

/**
 * The arm's segments, each its own part so the view can bend the arm at its joints (`packages/deadvox/DESIGN.md`,
 * "Models"). A segment's origin is the joint it turns about, so its part mates to the segment above at that joint.
 */
const ARM_SEGMENTS = ['upper', 'fore', 'palm', 'fingers', 'thumb'] as const;

/**
 * One segment of a hanging arm: short sleeve, bare upper arm and forearm, the hand edge-on to the thigh with its
 * thumb forward. The whole arm's measures come in, so every segment is drawn from the same figures.
 */
export const avatarArm = (params: Readonly<Record<string, string>>): (ExtrudedPolygonSolid | BoxSolid)[] => {
  const d = parse(
    strictObject({
      segment: picklist(ARM_SEGMENTS),
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
      /** How far the sleeve stands off the upper arm on each side. */
      sleeveThickness: positive,
      /** How far each arm segment reaches into the one above it, so no gap opens between them. */
      seamOverlap: positive,
      /** How far the palm reaches into the wrist and the fingers into the palm. */
      handOverlap: positive,
      armChamfer: positive,
      wristChamfer: positive,
      /** How much deeper than wide the forearm and the wrist are, on each side. */
      foreDepthExtra: positive,
      wristDepthExtra: positive,
      /** The share of the forearm, from the wrist up, drawn at wrist width. */
      wristShare: positive,
      /** Finger and thumb thickness as a share of the palm's. */
      fingerThicknessShare: positive,
      thumbThicknessShare: positive,
      /** How far forward the fingers reach, as a share of the palm's half width. */
      fingerFrontShare: positive,
      /** Where the thumb's root sits down the palm, as a share of the palm length. */
      thumbRootShare: positive,
      /** How far the thumb sinks into the palm's front edge, and how far past it the thumb stands out. */
      thumbInset: positive,
      thumbProjection: positive,
    }),
    params,
  );
  const elbow = -d.upperLength;
  const wrist = elbow - d.foreLength;
  const knuckles = wrist - d.palmLength;
  const tips = knuckles - d.fingerLength;
  const halfPalm = d.palmWidth / 2;
  const halfThick = d.palmThickness / 2;
  const wristTop = wrist + d.foreLength * d.wristShare;
  const thumbRoot = wrist - d.palmLength * d.thumbRootShare;
  const thumbEdge = halfPalm - d.thumbInset;
  // Each segment's joint in the arm frame; the segment is drawn about it as its own origin.
  const origins: Record<(typeof ARM_SEGMENTS)[number], readonly [number, number]> = {
    upper: [0, 0],
    fore: [elbow, 0],
    palm: [wrist, 0],
    fingers: [knuckles, 0],
    thumb: [thumbRoot, thumbEdge],
  };
  const [originY, originZ] = origins[d.segment];
  const ys = (bottom: number, top: number): [number, number] => [bottom - originY, top - originY];
  switch (d.segment) {
    case 'upper':
      return [
        slab('sleeve', 'shirt', ys(-d.sleeveLength, 0), {
          halfX: d.upperWidth / 2 + d.sleeveThickness,
          halfZ: d.upperDepth / 2 + d.sleeveThickness,
          chamfer: d.armChamfer,
        }),
        slab('upper-arm', 'skin', ys(elbow, -d.sleeveLength + d.seamOverlap), {
          halfX: d.upperWidth / 2,
          halfZ: d.upperDepth / 2,
          chamfer: d.armChamfer,
        }),
      ];
    case 'fore':
      return [
        slab('forearm', 'skin', ys(wristTop, elbow + d.seamOverlap), {
          halfX: d.foreWidth / 2,
          halfZ: d.foreWidth / 2 + d.foreDepthExtra,
          chamfer: d.armChamfer,
        }),
        slab('wrist', 'skin', ys(wrist, wristTop + d.seamOverlap), {
          halfX: d.wristWidth / 2,
          halfZ: d.wristWidth / 2 + d.wristDepthExtra,
          chamfer: d.wristChamfer,
        }),
      ];
    case 'palm':
      return [
        block('palm', 'skin', [-halfThick, halfThick], ys(knuckles, wrist + d.handOverlap), [-halfPalm, halfPalm]),
      ];
    case 'fingers':
      return [
        block(
          'fingers',
          'skin',
          [-halfThick * d.fingerThicknessShare, halfThick * d.fingerThicknessShare],
          ys(tips, knuckles + d.handOverlap),
          [-halfPalm, halfPalm * d.fingerFrontShare],
        ),
      ];
    case 'thumb':
      return [
        block(
          'thumb',
          'skin',
          [-halfThick * d.thumbThicknessShare, halfThick * d.thumbThicknessShare],
          ys(thumbRoot - d.thumbLength, thumbRoot),
          [thumbEdge - originZ, halfPalm + d.thumbProjection - originZ],
        ),
      ];
    default:
      return d.segment satisfies never;
  }
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
      thighChamfer: positive,
      shinChamfer: positive,
      shoeChamfer: positive,
      /** How far the shin reaches up into the thigh, and the shin and cuff down into the shoe. */
      kneeOverlap: positive,
      ankleOverlap: positive,
      /** The trouser cuff's height above the ankle, and how far it stands off the shin on each side. */
      cuffHeight: positive,
      cuffThickness: positive,
      soleThickness: positive,
      /** The shoe upper's bottom above the sole's underside; below the sole's top, so the two meet. */
      upperBase: positive,
      /** How far the upper sits in from the sole: at each side, over its length, and back from the toe. */
      upperSideInset: positive,
      upperLengthInset: positive,
      upperBackShift: positive,
      /** The toe cap's inset from the shoe's sides and its tip, its height as a share of the shoe height, and where it starts as a share of the toe reach. */
      toeCapSideInset: positive,
      toeCapTipInset: positive,
      toeCapHeightShare: positive,
      toeCapStartShare: positive,
    }),
    params,
  );
  const knee = -d.thighLength;
  const sole = -d.length;
  const ankle = sole + d.shoeHeight;
  const halfShoe = d.shoeWidth / 2;
  const upperBottom = sole + d.upperBase;
  return [
    slab('thigh', 'pants', [knee, 0], { halfX: d.thighWidth / 2, halfZ: d.thighDepth / 2, chamfer: d.thighChamfer }),
    slab('shin', 'pants', [ankle - d.ankleOverlap, knee + d.kneeOverlap], {
      halfX: d.shinWidth / 2,
      halfZ: d.shinDepth / 2,
      chamfer: d.shinChamfer,
    }),
    slab('cuff', 'pants', [ankle - d.ankleOverlap, ankle + d.cuffHeight], {
      halfX: d.shinWidth / 2 + d.cuffThickness,
      halfZ: d.shinDepth / 2 + d.cuffThickness,
      chamfer: d.shinChamfer,
    }),
    block('sole', 'sole', [-halfShoe, halfShoe], [sole, sole + d.soleThickness], [-d.heelReach, d.toeReach]),
    slab('shoe', 'shoe', [upperBottom, ankle], {
      halfX: halfShoe - d.upperSideInset,
      halfZ: (d.heelReach + d.toeReach) / 2 - d.upperLengthInset,
      chamfer: d.shoeChamfer,
      cz: (d.toeReach - d.heelReach) / 2 - d.upperBackShift,
    }),
    block(
      'toe-cap',
      'shoe',
      [-halfShoe + d.toeCapSideInset, halfShoe - d.toeCapSideInset],
      [upperBottom, sole + d.shoeHeight * d.toeCapHeightShare],
      [d.toeReach * d.toeCapStartShare, d.toeReach - d.toeCapTipInset],
    ),
  ];
};
