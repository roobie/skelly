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
  readonly portSlots?: readonly SectionWindow[];
  readonly farPort?: SectionWindow;
  readonly magazineWell?: SectionWindow;
}

const signedArea = (profile: readonly Vec2[]): number =>
  profile.reduce((area, point, index) => {
    const next = profile[(index + 1) % profile.length]!;
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;

const orientation = (a: Vec2, b: Vec2, c: Vec2): number =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

const onSegment = (a: Vec2, b: Vec2, point: Vec2): boolean =>
  Math.min(a[0], b[0]) - 1e-9 <= point[0] &&
  point[0] <= Math.max(a[0], b[0]) + 1e-9 &&
  Math.min(a[1], b[1]) - 1e-9 <= point[1] &&
  point[1] <= Math.max(a[1], b[1]) + 1e-9;

const segmentsIntersect = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  if (
    ((abC > 1e-9 && abD < -1e-9) || (abC < -1e-9 && abD > 1e-9)) &&
    ((cdA > 1e-9 && cdB < -1e-9) || (cdA < -1e-9 && cdB > 1e-9))
  ) {
    return true;
  }
  return (
    (Math.abs(abC) <= 1e-9 && onSegment(a, b, c)) ||
    (Math.abs(abD) <= 1e-9 && onSegment(a, b, d)) ||
    (Math.abs(cdA) <= 1e-9 && onSegment(c, d, a)) ||
    (Math.abs(cdB) <= 1e-9 && onSegment(c, d, b))
  );
};

/** Reject degenerate, clockwise, concave, or self-intersecting receiver sections at their source. */
export const assertConvexSection = (profile: readonly Vec2[], id = 'receiver'): void => {
  if (
    profile.length < 3 ||
    profile.some((point) => point.some((coordinate) => !Number.isFinite(coordinate))) ||
    signedArea(profile) <= 1e-9
  ) {
    throw new Error(`${id}: receiver outline must be a non-degenerate counter-clockwise convex polygon.`);
  }
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i]!;
    const b = profile[(i + 1) % profile.length]!;
    const c = profile[(i + 2) % profile.length]!;
    if (orientation(a, b, c) <= 1e-9) {
      throw new Error(`${id}: receiver outline must be a non-degenerate counter-clockwise convex polygon.`);
    }
    for (let j = i + 1; j < profile.length; j++) {
      if (j === i || j === (i + 1) % profile.length || i === (j + 1) % profile.length) {
        continue;
      }
      if (segmentsIntersect(a, b, profile[j]!, profile[(j + 1) % profile.length]!)) {
        throw new Error(`${id}: receiver outline must not self-intersect.`);
      }
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
const windowIntersectsProfile = (profile: readonly Vec2[], window: SectionWindow): boolean => {
  const values = profile.map((point) => point[window.sectionAxis]);
  return Math.max(...values) > window.section[0] + 1e-9 && Math.min(...values) < window.section[1] - 1e-9;
};
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
  readonly mergeGroup: string;
  readonly clip?: readonly ClipPlane[];
}

const profileBounds = (profile: readonly Vec2[]): readonly [readonly [number, number], readonly [number, number]] =>
  [0, 1].map((axis) => [
    Math.min(...profile.map((point) => point[axis as 0 | 1])),
    Math.max(...profile.map((point) => point[axis as 0 | 1])),
  ]) as unknown as readonly [readonly [number, number], readonly [number, number]];

const mergedWindowIntervals = (
  active: readonly SectionWindow[],
  axis: 0 | 1,
  bounds: readonly [number, number],
  id: string,
): [number, number][] => {
  if (active.some((window) => window.sectionAxis !== axis)) {
    throw new Error(`${id}: overlapping receiver windows must use one section axis.`);
  }
  const intervals = active
    .map(({ section }) => [Math.max(bounds[0], section[0]), Math.min(bounds[1], section[1])] as const)
    .filter(([start, end]) => start < end)
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of intervals) {
    const previous = merged.at(-1);
    if (previous && start <= previous[1] + 1e-9) {
      previous[1] = Math.max(previous[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
};

const sectionRemainderProfiles = (
  profile: readonly Vec2[],
  active: readonly SectionWindow[],
  bounds: readonly [number, number],
  id: string,
): Vec2[][] => {
  const axis = active[0]!.sectionAxis;
  const merged = mergedWindowIntervals(active, axis, bounds, id);
  const sections: Vec2[][] = [];
  const [minimum, maximum] = bounds;
  let cursor = minimum;
  for (const [start, end] of merged) {
    if (cursor < start) {
      sections.push(clipBand(profile, axis, cursor, start));
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < maximum) {
    sections.push(clip(profile, axis, cursor, false));
  }
  return sections;
};

const subtractSectionWindows = (spec: WindowCutSpec, windows: readonly SectionWindow[]): Solid[] => {
  const cuts = [
    ...new Set([
      spec.x[0],
      spec.x[1],
      ...windows.flatMap(({ x }) => x).filter((edge) => edge > spec.x[0] && edge < spec.x[1]),
    ]),
  ].sort((a, b) => a - b);
  const bounds = profileBounds(spec.profile);
  return cuts.slice(0, -1).flatMap((start, span) => {
    const range: readonly [number, number] = [start, cuts[span + 1]!];
    const middle = (range[0] + range[1]) / 2;
    const active = windows.filter(({ x }) => x[0] < middle && x[1] > middle);
    const profiles =
      active.length > 0
        ? sectionRemainderProfiles(spec.profile, active, bounds[active[0]!.sectionAxis]!, spec.id)
        : [spec.profile];
    return profiles.flatMap((profile, region) =>
      positive(profile)
        ? [
            prism(`${spec.id}-span-${span}-region-${region}`, profile, range, {
              mergeGroup: spec.mergeGroup,
              ...(spec.clip ? { clipPlanes: spec.clip } : {}),
            }),
          ]
        : [],
    );
  });
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
  if (name === 'near-side' || name.endsWith('-near')) {
    return spec.port;
  }
  if (name === 'far-side' || name.endsWith('-far')) {
    return spec.farPort;
  }
  if (name === 'bottom') {
    return spec.magazineWell;
  }
  return undefined;
};

const sectionBands = (spec: ReceiverSectionSpec): [string, Vec2[]][] => {
  const { y, z } = spec.cavity;
  const midY = clipBand(spec.outline, 0, y[0], y[1]);
  const bottom = clip(spec.outline, 0, y[0], true);
  const top = clip(spec.outline, 0, y[1], false);
  return [
    ['bottom-far', clip(bottom, 1, z[0], true)],
    ['bottom', clipBand(bottom, 1, z[0], z[1])],
    ['bottom-near', clip(bottom, 1, z[1], false)],
    ['top-far', clip(top, 1, z[0], true)],
    ['top', clipBand(top, 1, z[0], z[1])],
    ['top-near', clip(top, 1, z[1], false)],
    ['far-side', clip(midY, 1, z[0], true)],
    ['near-side', clip(midY, 1, z[1], false)],
  ];
};

const sectionAdapters = (spec: ReceiverSectionSpec): Solid[] => {
  const { y, z } = spec.cavity;
  const cavity: readonly Vec2[] = [
    [y[0], z[0]],
    [y[1], z[0]],
    [y[1], z[1]],
    [y[0], z[1]],
  ];
  const adapter = (end: 'front' | 'rear', range: readonly [number, number]) =>
    prism(`${spec.id}-${end}-adapter`, cavity, range, {
      mergeGroup: spec.id,
      ...(spec.clip ? { clipPlanes: spec.clip } : {}),
    });
  return [adapter('rear', [spec.x[0], spec.x[0] + spec.wall]), adapter('front', [spec.x[1] - spec.wall, spec.x[1]])];
};

const sectionBandSolids = (spec: ReceiverSectionSpec, name: string, profile: readonly Vec2[]): Solid[] => {
  if (!positive(profile)) {
    return [];
  }
  const window = windowForBand(name, spec);
  const windows = [
    ...(window ? [window] : []),
    ...(name === 'near-side' || name.endsWith('-near') ? (spec.portSlots ?? []) : []),
  ].filter((candidate) => windowIntersectsProfile(profile, candidate));
  if (windows.length > 0) {
    return subtractSectionWindows(
      {
        id: `${spec.id}-${name}`,
        profile,
        x: spec.x,
        mergeGroup: spec.id,
        ...(spec.clip ? { clip: spec.clip } : {}),
      },
      windows,
    );
  }
  return [
    prism(`${spec.id}-${name}`, profile, spec.x, {
      mergeGroup: spec.id,
      ...(spec.clip ? { clipPlanes: spec.clip } : {}),
    }),
  ];
};

/**
 * Build a hollow receiver from one family outline. The cavity is removed as
 * four convex cross-section regions; side windows remove every near/far side
 * band they intersect. Every returned collision solid is convex and uses the standard SAT.
 */
export const buildReceiverSection = (spec: ReceiverSectionSpec): Solid[] => {
  assertConvexSection(spec.outline, spec.id);
  if (!(spec.wall > 0) || spec.wall < 0.5) {
    throw new Error(`${spec.id}: wall thickness must be at least 0.5u.`);
  }
  assertCavityWall(spec);
  const result = [
    ...sectionAdapters(spec),
    ...sectionBands(spec).flatMap(([name, profile]) => sectionBandSolids(spec, name, profile)),
  ];
  return splitAt(result, [spec.x[1] - spec.wall]).filter(
    (solid) => solid.kind !== 'extruded-polygon' || clippedExtrudedPolygonPolyhedron(solid) !== undefined,
  );
};
