// Rules for the anti-materiel vocabulary. They follow gun/rules.ts: judge only placed parts, report readable issues.

import { distanceWorld, localSolidBounds, obbPolyhedron, worldSolid } from '../../core/geometry.ts';
import type { Issue } from '../../core/issue.ts';
import { applyDir, applyPoint, dot, sub } from '../../core/math.ts';
import type { Resolved } from '../../core/resolve.ts';
import type { PartDef, Rule } from '../../core/schema.ts';
import { BIPOD_GROUND_CLEARANCE_U, BIPOD_LEG_LENGTH } from './bipod.ts';
import { X } from './common.ts';

/** The barrel recoils inside the shroud, so the cavity must stay this clear of it (u). */
export const SHROUD_BARREL_CLEARANCE_U = 0.25;
/** Barrel that must show ahead of the shroud, for the muzzle device (u). */
export const SHROUD_MIN_FREE_BARREL_U = 4;

const EPSILON = 1e-6;

const placedParts = (r: Resolved, family: string): [string, PartDef][] =>
  [...r.defs].filter(([part, def]) => r.placed.has(part) && def.family === family);

type PlacedPart = readonly [string, PartDef];

const barrelClearanceIssue = (r: Resolved, [shroud, shroudDef]: PlacedPart, [barrel, barrelDef]: PlacedPart) => {
  const shroudTransform = r.placed.get(shroud)!;
  const barrelTransform = r.placed.get(barrel)!;
  const clearance = Math.min(
    ...barrelDef.solids.flatMap((barrelSolid) =>
      shroudDef.solids.map((shroudSolid) =>
        distanceWorld(worldSolid(barrelTransform, barrelSolid), worldSolid(shroudTransform, shroudSolid)),
      ),
    ),
  );
  return clearance < SHROUD_BARREL_CLEARANCE_U - EPSILON
    ? [
        {
          rule: 'shroud-fit',
          message: `${shroud} leaves ${clearance.toFixed(2)}u around ${barrel}; the barrel needs ${SHROUD_BARREL_CLEARANCE_U}u of room to recoil inside it.`,
          parts: [shroud, barrel],
        },
      ]
    : [];
};

const freeBarrelIssue = (r: Resolved, [shroud, shroudDef]: PlacedPart, [barrel, barrelDef]: PlacedPart) => {
  const muzzle = barrelDef.ports.find((port) => port.id === 'muzzle');
  if (!muzzle) {
    return [];
  }
  const shroudTransform = r.placed.get(shroud)!;
  const shroudEnd = Math.max(...shroudDef.solids.map((solid) => localSolidBounds(solid)[1][0]));
  const free = dot(
    sub(applyPoint(r.placed.get(barrel)!, muzzle.pos), applyPoint(shroudTransform, [shroudEnd, 0, 0])),
    applyDir(shroudTransform, X),
  );
  return free < SHROUD_MIN_FREE_BARREL_U - EPSILON
    ? [
        {
          rule: 'shroud-fit',
          message: `${shroud} stops ${free.toFixed(2)}u short of the ${barrel} muzzle; at least ${SHROUD_MIN_FREE_BARREL_U}u of barrel must show for the muzzle device.`,
          parts: [shroud, barrel],
        },
      ]
    : [];
};

/** The barrel shroud leaves recoil room around the barrel and stops short of the muzzle. */
export const shroudFit: Rule = {
  id: 'shroud-fit',
  title: 'The barrel recoils freely inside its shroud',
  check(r) {
    const barrels = placedParts(r, 'barrel');
    return placedParts(r, 'barrel-shroud').flatMap((shroud) =>
      barrels.flatMap((barrel) => [...barrelClearanceIssue(r, shroud, barrel), ...freeBarrelIssue(r, shroud, barrel)]),
    );
  },
};

const lowestY = (r: Resolved, part: string, def: PartDef): number =>
  Math.min(
    ...def.solids.flatMap((solid) => {
      const world = worldSolid(r.placed.get(part)!, solid);
      return ('vertices' in world ? world : obbPolyhedron(world)).vertices.map((vertex) => vertex[1]);
    }),
  );

/** A deployed bipod holds the magazine and everything else off the ground. */
export const bipodGroundClearance: Rule = {
  id: 'bipod-ground-clearance',
  title: 'Deployed bipod legs reach below the rest of the rifle',
  check(r) {
    const issues: Issue[] = [];
    const supports = new Set([...placedParts(r, 'bipod'), ...placedParts(r, 'monopod')].map(([part]) => part));
    const resting = [...r.defs].filter(([part]) => r.placed.has(part) && !supports.has(part));
    for (const [bipod] of placedParts(r, 'bipod')) {
      const legs = r.params.get(bipod)?.legs?.value;
      if (!(legs && Object.hasOwn(BIPOD_LEG_LENGTH, legs)) || resting.length === 0) {
        continue;
      }
      const foot =
        applyPoint(r.placed.get(bipod)!, [0, 0, 0])[1] - BIPOD_LEG_LENGTH[legs as keyof typeof BIPOD_LEG_LENGTH];
      const [lowPart, low] = resting
        .map(([part, def]) => [part, lowestY(r, part, def)] as const)
        .reduce((a, b) => (b[1] < a[1] ? b : a));
      if (foot > low - BIPOD_GROUND_CLEARANCE_U + EPSILON) {
        issues.push({
          rule: 'bipod-ground-clearance',
          message: `${bipod}'s deployed legs reach y=${foot.toFixed(2)}u, but ${lowPart} hangs down to y=${low.toFixed(2)}u; the legs must clear it by ${BIPOD_GROUND_CLEARANCE_U}u.`,
          parts: [bipod, lowPart],
        });
      }
    }
    return issues;
  },
};
