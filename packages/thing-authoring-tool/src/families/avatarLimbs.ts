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
 * One segment of a bare arm, the hand edge-on to the thigh with its
 * thumb forward. The whole arm's measures come in, so every segment is drawn from the same figures.
 */
export const avatarArm = (params: Readonly<Record<string, string>>): (ExtrudedPolygonSolid | BoxSolid)[] => {
  const d = parse(
    strictObject({
      segment: picklist(ARM_SEGMENTS),
      upperLength: positive,
      upperWidth: positive,
      upperDepth: positive,
      foreLength: positive,
      foreWidth: positive,
      wristWidth: positive,
      palmLength: positive,
      palmWidth: positive,
      palmThickness: positive,
      fingerLength: positive,
      thumbLength: positive,
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
        slab('upper-arm', 'skin', ys(elbow, 0), {
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

/**
 * The leg's segments, each its own part so a stance can bend the leg at the knee and ankle (`packages/deadvox/DESIGN.md`,
 * "Crouching and lying prone"). Like the arm's, each segment is drawn about the joint it turns about.
 */
const LEG_SEGMENTS = ['thigh', 'shin', 'foot'] as const;

/**
 * One segment of a bare leg whose foot lies `length` below the hip joint.
 * The whole leg's measures come in, so every segment is drawn from the same figures.
 */
export const avatarLeg = (params: Readonly<Record<string, string>>): (ExtrudedPolygonSolid | BoxSolid)[] => {
  const d = parse(
    strictObject({
      segment: picklist(LEG_SEGMENTS),
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
      /** How far the upper sits in from the sole: at each side, over its length, and back from the toe. */
      upperSideInset: positive,
      upperLengthInset: positive,
      upperBackShift: positive,
    }),
    params,
  );
  const knee = -d.thighLength;
  const sole = -d.length;
  const ankle = sole + d.shoeHeight;
  const halfShoe = d.shoeWidth / 2;
  const origin = { thigh: 0, shin: knee, foot: ankle }[d.segment];
  const ys = (bottom: number, top: number): [number, number] => [bottom - origin, top - origin];
  switch (d.segment) {
    case 'thigh':
      return [
        slab('thigh', 'skin', ys(knee, 0), {
          halfX: d.thighWidth / 2,
          halfZ: d.thighDepth / 2,
          chamfer: d.thighChamfer,
        }),
      ];
    case 'shin':
      return [
        slab('shin', 'skin', ys(ankle - d.ankleOverlap, knee + d.kneeOverlap), {
          halfX: d.shinWidth / 2,
          halfZ: d.shinDepth / 2,
          chamfer: d.shinChamfer,
        }),
      ];
    case 'foot':
      return [
        slab('foot', 'skin', ys(sole, ankle), {
          halfX: halfShoe - d.upperSideInset,
          halfZ: (d.heelReach + d.toeReach) / 2 - d.upperLengthInset,
          chamfer: d.shoeChamfer,
          cz: (d.toeReach - d.heelReach) / 2 - d.upperBackShift,
        }),
      ];
    default:
      return d.segment satisfies never;
  }
};
