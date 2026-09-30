import { clippedExtrudedPolygonPolyhedron } from '../core/geometry.ts';
import type { ClipPlane, Solid, Vec2 } from '../core/schema.ts';

export interface SectionWindow {
  readonly x: readonly [number, number];
  readonly sectionAxis: 0 | 1;
  readonly section: readonly [number, number];
}

export interface ReceiverSectionSpec {
  readonly id: string;
  /** Convex profile in (Y,Z), wound counter-clockwise. */
  readonly outline: readonly Vec2[];
  readonly x: readonly [number, number];
  readonly wall: number;
  readonly clip?: readonly ClipPlane[];
  readonly cavity: { readonly y: readonly [number, number]; readonly z: readonly [number, number] };
  readonly port?: SectionWindow;
  readonly magazineWell?: SectionWindow;
}

const signedArea = (profile: readonly Vec2[]): number =>
  profile.reduce((area, point, index) => {
    const next = profile[(index + 1) % profile.length]!;
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;

/** Reject degenerate, clockwise, or concave receiver sections at their source. */
export const assertConvexSection = (profile: readonly Vec2[], id = 'receiver'): void => {
  if (profile.length < 3 || signedArea(profile) <= 1e-9) {
    throw new Error(`${id}: receiver outline must be a non-degenerate counter-clockwise convex polygon.`);
  }
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % profile.length]!;
    const c = profile[(i + 2) % profile.length]!;
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross <= 1e-9) {
      throw new Error(`${id}: receiver outline must be a non-degenerate counter-clockwise convex polygon.`);
    }
  }
};

const cleanProfile = (profile: readonly Vec2[]): Vec2[] => {
  const output: Vec2[] = [];
  for (const point of profile) {
    const previous = output.at(-1);
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-9) {
      output.push(point);
    }
  }
  if (output.length > 1 && Math.hypot(output[0]![0] - output.at(-1)![0], output[0]![1] - output.at(-1)![1]) <= 1e-9) {
    output.pop();
  }
  return output;
};

const clip = (profile: readonly Vec2[], axis: 0 | 1, edge: number, keepLess: boolean): Vec2[] => {
  const output: Vec2[] = [];
  const inside = (p: Vec2) => (keepLess ? p[axis] <= edge : p[axis] >= edge);
  for (let i = 0; i < profile.length; i++) {
    const current = profile[i]!;
    const previous = profile[(i + profile.length - 1) % profile.length]!;
    const ci = inside(current);
    const pi = inside(previous);
    if (ci !== pi) {
      const t = (edge - previous[axis]) / (current[axis] - previous[axis]);
      output.push(
        axis === 0
          ? [edge, previous[1] + (current[1] - previous[1]) * t]
          : [previous[0] + (current[0] - previous[0]) * t, edge],
      );
    }
    if (ci) {
      output.push(current);
    }
  }
  return cleanProfile(output);
};

const positive = (profile: readonly Vec2[]): boolean => profile.length >= 3 && Math.abs(signedArea(profile)) > 1e-9;
const clipBand = (profile: readonly Vec2[], axis: 0 | 1, lo: number, hi: number): Vec2[] =>
  clip(clip(profile, axis, lo, false), axis, hi, true);

interface PrismOptions {
  readonly mergeGroup: string;
  readonly clipPlanes?: readonly ClipPlane[];
}

const prism = (id: string, profile: readonly Vec2[], x: readonly [number, number], options: PrismOptions): Solid => ({
  id,
  kind: 'extruded-polygon',
  profile,
  axis: 'x',
  z: x,
  ...(options.clipPlanes?.length ? { clip: options.clipPlanes } : {}),
  display: { outline: false, bevel: false, mergeGroup: options.mergeGroup },
});

const splitAt = (solids: readonly Solid[], planes: readonly number[]): Solid[] =>
  solids.flatMap((solid) => {
    if (solid.kind !== 'extruded-polygon' || solid.axis !== 'x') {
      return [solid];
    }
    const interior = [...new Set(planes.filter((plane) => plane > solid.z[0] && plane < solid.z[1]))].sort(
      (a, b) => a - b,
    );
    const cuts = [solid.z[0], ...interior, solid.z[1]];
    return cuts.slice(0, -1).map((start, index) => ({
      ...solid,
      id: index === 0 ? solid.id : `${solid.id}-span-${index}`,
      z: [start, cuts[index + 1]!] as const,
    }));
  });

interface WindowCutSpec {
  readonly id: string;
  readonly profile: readonly Vec2[];
  readonly x: readonly [number, number];
  readonly window: SectionWindow;
  readonly mergeGroup: string;
  readonly clip?: readonly ClipPlane[];
}

const subtractSectionWindow = ({ id, profile, x, window, mergeGroup, clip: clipPlanes }: WindowCutSpec): Solid[] => {
  const [x0, x1] = window.x;
  const [s0, s1] = window.section;
  const pieces: Solid[] = [];
  const add = (suffix: string, section: readonly Vec2[], range: readonly [number, number]) => {
    if (positive(section) && range[0] < range[1]) {
      pieces.push(prism(`${id}-${suffix}`, section, range, { mergeGroup, ...(clipPlanes ? { clipPlanes } : {}) }));
    }
  };
  add('before-window', profile, [x[0], Math.min(x[1], x0)]);
  add('after-window', profile, [Math.max(x[0], x1), x[1]]);
  const mid: readonly [number, number] = [Math.max(x[0], x0), Math.min(x[1], x1)];
  if (mid[0] < mid[1]) {
    add('window-low', clip(profile, window.sectionAxis, s0, true), mid);
    add('window-high', clip(profile, window.sectionAxis, s1, false), mid);
  }
  return pieces;
};

const assertCavityWall = (spec: ReceiverSectionSpec): void => {
  const { y, z } = spec.cavity;
  const corners: readonly Vec2[] = [
    [y[0], z[0]],
    [y[0], z[1]],
    [y[1], z[1]],
    [y[1], z[0]],
  ];
  for (const point of corners) {
    for (let i = 0; i < spec.outline.length; i++) {
      const a = spec.outline[i]!;
      const b = spec.outline[(i + 1) % spec.outline.length]!;
      const edgeLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const inwardDistance = ((b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0])) / edgeLength;
      if (inwardDistance < spec.wall - 1e-9) {
        throw new Error(`${spec.id}: cavity must leave at least ${spec.wall}u wall thickness around the outline.`);
      }
    }
  }
};

const windowForBand = (name: string, spec: ReceiverSectionSpec): SectionWindow | undefined => {
  if (name === 'near-side') {
    return spec.port;
  }
  if (name === 'bottom') {
    return spec.magazineWell;
  }
  return undefined;
};

/**
 * Build a hollow receiver from one family outline. The cavity is removed as
 * four convex cross-section regions; side windows remove only the named side
 * band. Every returned collision solid is convex and uses the standard SAT.
 */
export const buildReceiverSection = (spec: ReceiverSectionSpec): Solid[] => {
  assertConvexSection(spec.outline, spec.id);
  if (!(spec.wall > 0) || spec.wall < 0.5) {
    throw new Error(`${spec.id}: wall thickness must be at least 0.5u.`);
  }
  assertCavityWall(spec);
  const { y, z } = spec.cavity;
  const midY = clipBand(spec.outline, 0, y[0], y[1]);
  const far = clip(midY, 1, z[0], true);
  const near = clip(midY, 1, z[1], false);
  const bottom = clip(spec.outline, 0, y[0], true);
  const top = clip(spec.outline, 0, y[1], false);
  const bands: [string, Vec2[]][] = [
    ['bottom-far', clip(bottom, 1, z[0], true)],
    ['bottom', clipBand(bottom, 1, z[0], z[1])],
    ['bottom-near', clip(bottom, 1, z[1], false)],
    ['top-far', clip(top, 1, z[0], true)],
    ['top', clipBand(top, 1, z[0], z[1])],
    ['top-near', clip(top, 1, z[1], false)],
    ['far-side', far],
    ['near-side', near],
  ];
  const cavityProfile: readonly Vec2[] = [
    [y[0], z[0]],
    [y[1], z[0]],
    [y[1], z[1]],
    [y[0], z[1]],
  ];
  const adapterSolid = (end: 'front' | 'rear', x: readonly [number, number]) =>
    prism(`${spec.id}-${end}-adapter`, cavityProfile, x, {
      mergeGroup: spec.id,
      ...(spec.clip ? { clipPlanes: spec.clip } : {}),
    });
  const result: Solid[] = [
    adapterSolid('rear', [spec.x[0], spec.x[0] + spec.wall]),
    adapterSolid('front', [spec.x[1] - spec.wall, spec.x[1]]),
  ];
  for (const [name, profile] of bands) {
    if (!positive(profile)) {
      continue;
    }
    const window = windowForBand(name, spec);
    if (window) {
      result.push(
        ...subtractSectionWindow({
          id: `${spec.id}-${name}`,
          profile,
          x: spec.x,
          window,
          mergeGroup: spec.id,
          ...(spec.clip ? { clip: spec.clip } : {}),
        }),
      );
    } else {
      result.push(
        prism(`${spec.id}-${name}`, profile, spec.x, {
          mergeGroup: spec.id,
          ...(spec.clip ? { clipPlanes: spec.clip } : {}),
        }),
      );
    }
  }
  return splitAt(result, [spec.x[0] + spec.wall, spec.x[1] - spec.wall]).filter(
    (solid) => solid.kind !== 'extruded-polygon' || clippedExtrudedPolygonPolyhedron(solid) !== undefined,
  );
};
