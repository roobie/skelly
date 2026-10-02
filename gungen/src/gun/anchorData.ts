// Gun anchor data (PROJECT.md, "Hold anchors"): where the hands and the muzzle are on each part.
//
// Keyed by registry key (see GunAnchorDeclarations). Every frame is family-local and a function of the
// part's built geometry, so it follows params without duplicating the builders' constants: `forward` is
// the direction the gun points (+X) and `up` is the hand's up. A grip's frame follows the grip's own
// (leaned) axes, so it tilts with the grip once placed.

import type { AnchorFrame } from '../core/design.ts';
import { add, extrusionPoint, type Vec3 } from '../core/math.ts';
import type { PartDef, RevolvedSolid, Solid } from '../core/schema.ts';
import type { GunAnchorDeclarations, GunPartAnchors } from './anchors.ts';
import { FIRING_GRIP } from './parts.ts';
import { REVOLVER_GRIP_RAKE_DEGREES } from './revolver.ts';

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const revolverGripAxes = (): Pick<AnchorFrame, 'forward' | 'up'> => {
  const rake = (REVOLVER_GRIP_RAKE_DEGREES * Math.PI) / 180;
  return {
    forward: [Math.cos(rake), -Math.sin(rake), 0],
    up: [Math.sin(rake), Math.cos(rake), 0],
  };
};

const findSolid = (part: PartDef, ...ids: string[]): Solid | undefined =>
  ids.map((id) => part.solids.find((s) => s.id === id)).find((s) => s !== undefined);

/** A revolved solid's interior point: on its axis, midway along it. */
const axisMidpoint = (s: RevolvedSolid): Vec3 => {
  const axial = s.profile.map((p) => p[0]);
  return add(s.origin ?? [0, 0, 0], extrusionPoint(s.axis, [0, 0], (Math.min(...axial) + Math.max(...axial)) / 2));
};

/** A point inside a convex solid: box centre, the axis midpoint of a revolved one, or the vertex mean of a convex profile at mid-extrusion. */
const interiorPoint = (s: Solid): Vec3 => {
  if (s.kind === 'box') {
    return s.box.center;
  }
  if (s.kind === 'revolved') {
    return axisMidpoint(s);
  }
  const n = s.profile.length;
  return extrusionPoint(
    s.axis,
    [s.profile.reduce((sum, p) => sum + p[0], 0) / n, s.profile.reduce((sum, p) => sum + p[1], 0) / n],
    (s.z[0] + s.z[1]) / 2,
  );
};

/** A tapered-stock hold sits low inside the grip, below the trigger centre. */
const gripHoldPoint = (s: Solid): Vec3 => {
  if (s.kind === 'box') {
    return s.box.center;
  }
  if (s.kind === 'revolved') {
    return axisMidpoint(s);
  }
  const n = s.profile.length;
  const centroid: readonly [number, number] = [
    s.profile.reduce((sum, vertex) => sum + vertex[0], 0) / n,
    s.profile.reduce((sum, vertex) => sum + vertex[1], 0) / n,
  ];
  if (s.axis === 'y') {
    return extrusionPoint(s.axis, centroid, s.z[0]);
  }
  const lowestProfileAxis = s.axis === 'x' ? 0 : 1;
  const lowest = s.profile.reduce((best, vertex) =>
    vertex[lowestProfileAxis]! < best[lowestProfileAxis]! ? vertex : best,
  );
  const blendedProfile: readonly [number, number] = [
    lowest[0] * 0.99 + centroid[0] * 0.01,
    lowest[1] * 0.99 + centroid[1] * 0.01,
  ];
  return extrusionPoint(s.axis, blendedProfile, (s.z[0] + s.z[1]) / 2);
};

const frameAt = (position: Vec3, forward: Vec3 = X, up: Vec3 = Y): AnchorFrame => ({ position, forward, up });

/** The firing hand on a grip's body; `axes` are the grip's own forward and up. */
const gripHold =
  (bodyIds: readonly string[], axes: (part: PartDef) => Pick<AnchorFrame, 'forward' | 'up'>) =>
  (_params: Readonly<Record<string, string>>, part: PartDef): GunPartAnchors => {
    const body = findSolid(part, ...bodyIds);
    return body ? { hold: { position: interiorPoint(body), ...axes(part) } } : {};
  };

/** Centre of a solid's underside, at `along` (0..1) of its length: where the support hand cups a fore-end. */
const undersideSupport = (part: PartDef, along: number): GunPartAnchors => {
  const under = findSolid(part, 'bottom', 'shell-3');
  if (under?.kind === 'box') {
    const { center, half } = under.box;
    return { support: frameAt([center[0] - half[0] + 2 * half[0] * along, center[1], 0]) };
  }
  if (under?.kind === 'extruded-polygon' && under.axis === 'x') {
    const bottomY = Math.min(...under.profile.map(([y]) => y));
    const bottomEdge = under.profile.filter(([y]) => Math.abs(y - bottomY) <= 1e-6);
    const bottomZ = bottomEdge.reduce((sum, [, z]) => sum + z, 0) / bottomEdge.length;
    const x = under.z[0] + (under.z[1] - under.z[0]) * along;
    return { support: frameAt(extrusionPoint('x', [bottomY, bottomZ], x)) };
  }
  return {};
};

export const GUN_ANCHORS: GunAnchorDeclarations = {
  // Separate grip: local frame is the grip's own, so its lean comes from the mounting port.
  grip: {
    holdRank: 'grip',
    anchors: gripHold(['body-upper', 'body'], () => ({ forward: X, up: Y })),
  },
  'revolver-grip': {
    holdRank: 'grip',
    anchors: gripHold(['grip-core'], revolverGripAxes),
  },
  'revolver-barrel': {
    anchors: (_params, part) => {
      const muzzle = part.ports.find((port) => port.id === 'muzzle');
      return muzzle ? { muzzle: frameAt(muzzle.pos, muzzle.normal, muzzle.up) } : {};
    },
  },
  // Integrated pistol grip: the grip was rotated into the frame's coordinates; its magazine port carries
  // that rotation (grip local -Y is the port normal, grip local X is the port up).
  frame: {
    holdRank: 'grip',
    anchors: (params, part) => {
      const hold = gripHold(['body-upper', 'body'], (framePart) => {
        const magazine = framePart.ports.find((port) => port.id === 'magazine');
        return magazine
          ? { forward: magazine.up, up: [-magazine.normal[0], -magazine.normal[1], -magazine.normal[2]] }
          : { forward: X, up: Y };
      })(params, part);
      const magazine = part.ports.find((port) => port.id === 'magazine');
      return { ...hold, ...(magazine ? { magwell: frameAt(magazine.pos) } : {}) };
    },
  },
  // Only a firing-grip stock has a hold: the tapered style uses its grip; others use the wrist.
  stock: {
    holdRank: 'firing-grip-stock',
    anchors: (_params, part) => {
      const taperedGrip = part.solids.find((solid) => solid.id === 'grip');
      const grip = taperedGrip ?? findSolid(part, 'wrist');
      const position = grip && (taperedGrip ? gripHoldPoint(grip) : interiorPoint(grip));
      return position && part.tags?.includes(FIRING_GRIP) ? { hold: frameAt(position) } : {};
    },
  },
  handguard: { anchors: (_params, part) => undersideSupport(part, 0.6) },
  forend: { anchors: (_params, part) => undersideSupport(part, 0.5) },
  lower: {
    anchors: (_params, part) => {
      const magazine = part.ports.find((port) => port.id === 'magazine');
      return magazine ? { magwell: frameAt(magazine.pos) } : {};
    },
  },
  barrel: {
    anchors: (_params, part) => {
      const muzzle = part.ports.find((p) => p.id === 'muzzle');
      return muzzle ? { muzzle: frameAt(muzzle.pos, muzzle.normal, muzzle.up) } : {};
    },
  },
};
