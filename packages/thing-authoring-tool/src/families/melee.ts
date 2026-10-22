import type { BoxSolid, ExtrudedPolygonSolid, RevolvedSolid } from '@skelly/engine/shapes/solid.ts';
import { parse, strictObject } from 'valibot';
import { positive, strip } from './shapes.ts';

// Melee tools lie along +x with the grip end toward -x and the striking end toward +x, the frame deadvox's melee
// model rows describe their grip and anchors in. The origin sits near the striking end, not at the centre.

/** A turned shaft along x: `profile` is (position along x, radius), closed back to the axis. */
const turnedAlongX = (id: string, profile: readonly (readonly [number, number])[], slot: string): RevolvedSolid => ({
  id,
  kind: 'revolved',
  axis: 'x',
  profile: [[profile[0]![0], 0], ...profile, [profile.at(-1)![0], 0], [profile[0]![0], 0]],
  slot,
});

const box = (
  id: string,
  { x: [x0, x1], y: [y0, y1], depth }: { x: readonly [number, number]; y: readonly [number, number]; depth: number },
  slot: string,
): BoxSolid => ({
  id,
  kind: 'box',
  box: { center: [(x0 + x1) / 2, (y0 + y1) / 2, 0], half: [(x1 - x0) / 2, (y1 - y0) / 2, depth / 2] },
  slot,
});

export const crowbar = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      back: positive,
      reach: positive,
      kickBack: positive,
      kickRise: positive,
      clawAt: positive,
      clawDrop: positive,
      thickness: positive,
      depth: positive,
    }),
    params,
  );
  if (!(d.back < d.kickBack && d.clawAt < d.reach)) {
    throw new Error('Invalid crowbar dimensions');
  }
  const section: readonly [number, number] = [d.thickness, d.depth];
  return [
    // The shaft bends over at its far end and sweeps back down to the claw's point.
    ...strip(
      'shaft',
      [
        [-d.back, 0],
        [d.reach - d.clawDrop * 0.45, 0],
        [d.reach, -d.clawDrop * 0.4],
        [d.reach - d.clawDrop * 0.2, -d.clawDrop * 0.75],
        [d.clawAt, -d.clawDrop],
      ],
      section,
    ),
    // The small kick at the grip end gives the pry its second lever.
    ...strip(
      'kick',
      [
        [-d.back, 0],
        [-d.kickBack, d.kickRise],
      ],
      section,
    ),
  ];
};

export const hammer = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      handleBack: positive,
      handleRadius: positive,
      headBottom: positive,
      headTop: positive,
      faceReach: positive,
      clawReach: positive,
      headDepth: positive,
    }),
    params,
  );
  if (!(d.headBottom < d.headTop)) {
    throw new Error('Hammer head needs height');
  }
  const eye = d.headDepth * 0.9;
  const neck = 0.3;
  const claw: ExtrudedPolygonSolid = {
    id: 'claw',
    kind: 'extruded-polygon',
    // Tapers toward its tip and bends back from the face, as a claw does.
    profile: [
      [d.headBottom, neck * d.clawReach],
      [d.headTop, neck * d.clawReach],
      [d.headBottom + (d.headTop - d.headBottom) * 0.72, d.clawReach],
      [d.headBottom + (d.headTop - d.headBottom) * 0.42, d.clawReach],
    ],
    z: [-eye / 2, eye / 2],
    slot: 'head',
  };
  return [
    turnedAlongX(
      'handle',
      [
        [-d.handleBack, d.handleRadius * 1.25],
        [-d.handleBack * 0.8, d.handleRadius],
        [d.headTop * 0.7, d.handleRadius * 0.9],
      ],
      'handle',
    ),
    box('face', { x: [d.headBottom, d.headTop], y: [-d.faceReach, -neck * d.clawReach], depth: d.headDepth }, 'head'),
    box('eye', { x: [d.headBottom, d.headTop], y: [-neck * d.clawReach, neck * d.clawReach], depth: eye }, 'head'),
    claw,
  ];
};

export const bat = (params: Readonly<Record<string, string>>) => {
  const d = parse(
    strictObject({
      back: positive,
      front: positive,
      handleRadius: positive,
      barrelRadius: positive,
      knobRadius: positive,
    }),
    params,
  );
  if (!(d.handleRadius < d.barrelRadius && d.handleRadius < d.knobRadius)) {
    throw new Error('Bat handle must be its thinnest part');
  }
  const length = d.back + d.front;
  const at = (fraction: number) => -d.back + length * fraction;
  return [
    turnedAlongX(
      'body',
      [
        [-d.back, d.knobRadius * 0.8],
        [at(0.025), d.knobRadius],
        [at(0.06), d.handleRadius],
        [at(0.4), d.handleRadius],
        [at(0.62), (d.handleRadius + d.barrelRadius) / 2],
        [at(0.8), d.barrelRadius],
        [at(0.97), d.barrelRadius],
        [d.front, d.barrelRadius * 0.85],
      ],
      'body',
    ),
  ];
};
