import type { Solid, Vec2 } from '../core/schema.ts';

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
    if (!previous || Math.hypot(point[0] - previous[0], point[1] - previous[1]) > 1e-9) output.push(point);
  }
  if (output.length > 1 && Math.hypot(output[0]![0] - output.at(-1)![0], output[0]![1] - output.at(-1)![1]) <= 1e-9) output.pop();
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
      output.push(axis === 0
        ? [edge, previous[1] + (current[1] - previous[1]) * t]
        : [previous[0] + (current[0] - previous[0]) * t, edge]);
    }
    if (ci) output.push(current);
  }
  return cleanProfile(output);
};

const positive = (profile: readonly Vec2[]): boolean => profile.length >= 3 && Math.abs(signedArea(profile)) > 1e-9;
const clipBand = (profile: readonly Vec2[], axis: 0 | 1, lo: number, hi: number): Vec2[] =>
  clip(clip(profile, axis, lo, false), axis, hi, true);

const prism = (id: string, profile: readonly Vec2[], x: readonly [number, number], mergeGroup: string): Solid => ({
  id,
  kind: 'extruded-polygon',
  profile,
  axis: 'x',
  z: x,
  display: { outline: false, bevel: false, mergeGroup },
});

const subtractSectionWindow = (id: string, profile: readonly Vec2[], x: readonly [number, number], window: SectionWindow, mergeGroup: string): Solid[] => {
  const [x0, x1] = window.x;
  const [s0, s1] = window.section;
  const pieces: Solid[] = [];
  const add = (suffix: string, section: readonly Vec2[], range: readonly [number, number]) => {
    if (positive(section) && range[0] < range[1]) pieces.push(prism(`${id}-${suffix}`, section, range, mergeGroup));
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

/**
 * Build a hollow receiver from one family outline. The cavity is removed as
 * four convex cross-section regions; side windows remove only the named side
 * band. Every returned collision solid is convex and uses the standard SAT.
 */
export const buildReceiverSection = (spec: ReceiverSectionSpec): Solid[] => {
  assertConvexSection(spec.outline, spec.id);
  if (!(spec.wall > 0) || spec.wall < 0.5) throw new Error(`${spec.id}: wall thickness must be at least 0.5u.`);
  const { y, z } = spec.cavity;
  const corners: readonly Vec2[] = [[y[0], z[0]], [y[0], z[1]], [y[1], z[1]], [y[1], z[0]]];
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
  const result: Solid[] = [];
  for (const [name, profile] of bands) {
    if (!positive(profile)) continue;
    const window = name === 'near-side' ? spec.port : name === 'bottom' ? spec.magazineWell : undefined;
    result.push(...(window ? subtractSectionWindow(`${spec.id}-${name}`, profile, spec.x, window, spec.id) : [prism(`${spec.id}-${name}`, profile, spec.x, spec.id)]));
  }
  return result;
};
