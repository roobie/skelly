import { clipPolygon, clippedExtrudedPolygonPolyhedron, validateExtrudedPolygon } from '../core/geometry.ts';
import type { Vec3 } from '../core/math.ts';
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

/** Delegate section outline policy to core while retaining receiver-specific diagnostics. */
export const assertConvexSection = (profile: readonly Vec2[], id = 'receiver'): void => {
  const error = validateExtrudedPolygon(profile, [0, 1], 'x');
  if (error) {
    const message = error.includes('self-intersect')
      ? 'receiver outline must not self-intersect.'
      : 'receiver outline must be a non-degenerate counter-clockwise convex polygon.';
    throw new Error(`${id}: ${message}`);
  }
};

const clipProfile = (profile: readonly Vec2[], axis: 0 | 1, edge: number, keepLess: boolean): Vec2[] => {
  const normal: Vec3 = axis === 0 ? [keepLess ? 1 : -1, 0, 0] : [0, keepLess ? 1 : -1, 0];
  const plane: ClipPlane = { normal, offset: keepLess ? edge : -edge };
  return clipPolygon(
    profile.map(([x, y]) => [x, y, 0]),
    plane,
    true,
    1e-9,
  ).map(([x, y]) => [x, y]);
};

const positive = (profile: readonly Vec2[]): boolean => validateExtrudedPolygon(profile, [0, 1], 'x') === undefined;
const windowIntersectsProfile = (profile: readonly Vec2[], window: SectionWindow): boolean => {
  const values = profile.map((point) => point[window.sectionAxis]);
  return Math.max(...values) > window.section[0] + 1e-9 && Math.min(...values) < window.section[1] - 1e-9;
};
const clipBand = (profile: readonly Vec2[], axis: 0 | 1, lo: number, hi: number): Vec2[] =>
  clipProfile(clipProfile(profile, axis, lo, false), axis, hi, true);

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
    sections.push(clipProfile(profile, axis, cursor, false));
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
  const bottom = clipProfile(spec.outline, 0, y[0], true);
  const top = clipProfile(spec.outline, 0, y[1], false);
  return [
    ['bottom-far', clipProfile(bottom, 1, z[0], true)],
    ['bottom', clipBand(bottom, 1, z[0], z[1])],
    ['bottom-near', clipProfile(bottom, 1, z[1], false)],
    ['top-far', clipProfile(top, 1, z[0], true)],
    ['top', clipBand(top, 1, z[0], z[1])],
    ['top-near', clipProfile(top, 1, z[1], false)],
    ['far-side', clipProfile(midY, 1, z[0], true)],
    ['near-side', clipProfile(midY, 1, z[1], false)],
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
