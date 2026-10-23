import { readFileSync } from 'node:fs';
import { resolve } from '@skelly/engine/assembly/resolve.ts';
import type { Resolved } from '@skelly/engine/assembly/schema.ts';
import { applyPoint, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { obbPolyhedron, worldSolid } from '@skelly/engine/shapes/geometry.ts';
import { expect, it } from 'vitest';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { COMPACT_SMG_PROPORTIONS } from '../src/gun/compactSmgProportions.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';

const variants = [
  { file: 'compact-smg.json', muzzle: 'threaded' },
  { file: 'compact-smg-plain.json', muzzle: 'plain' },
] as const;

const load = (file: string): Resolved => {
  const loaded = loadGunDesign(readFileSync(new URL(`../designs/${file}`, import.meta.url), 'utf8'));
  if (!loaded.ok) {
    throw new Error(JSON.stringify(loaded.error));
  }
  return resolve(loaded.design.assembly, gunDomain);
};

const owner = (resolved: Resolved, family: string): string => {
  const entry = [...resolved.defs].find(([, def]) => def.family === family);
  if (!entry) {
    throw new Error(`Fixture needs ${family}`);
  }
  return entry[0];
};

it.each(variants)('registers the receiver on its front face and the bore on the x axis: $muzzle', ({ file }) => {
  const resolved = load(file);
  const id = owner(resolved, 'receiver');
  const xs = resolved.defs
    .get(id)!
    .solids.flatMap((solid) => {
      const shape = worldSolid(resolved.placed.get(id)!, solid);
      return [...('vertices' in shape ? shape : obbPolyhedron(shape)).vertices];
    })
    .map(([x]) => x);
  expect(Math.max(...xs)).toBeCloseTo(COMPACT_SMG_PROPORTIONS.receiver.frontX, 6);
  expect(Math.min(...xs)).toBeCloseTo(COMPACT_SMG_PROPORTIONS.receiver.rearX, 6);

  const barrel = owner(resolved, 'barrel');
  const muzzle = GUN_ANCHORS.barrel!.anchors({}, resolved.defs.get(barrel)!).muzzle!;
  const tip = applyPoint(resolved.placed.get(barrel)!, muzzle.position);
  expect(tip[1]).toBeCloseTo(0, 6);
  expect(tip[2]).toBeCloseTo(0, 6);
});

const solidsOf = (resolved: Resolved, family: string) => {
  const id = owner(resolved, family);
  return resolved.defs.get(id)!.solids.map((solid) => {
    const shape = worldSolid(resolved.placed.get(id)!, solid);
    return 'vertices' in shape ? shape : obbPolyhedron(shape);
  });
};

const strictlyInside = (shape: ReturnType<typeof obbPolyhedron>, p: Vec3): boolean => {
  const centre = shape.vertices
    .reduce<Vec3>((sum, v) => [sum[0] + v[0], sum[1] + v[1], sum[2] + v[2]], [0, 0, 0])
    .map((c) => c / shape.vertices.length) as unknown as Vec3;
  return shape.faces.every((face) => {
    const [a, b, c] = [shape.vertices[face[0]!]!, shape.vertices[face[1]!]!, shape.vertices[face[2]!]!];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const out = n[0]! * (a[0] - centre[0]) + n[1]! * (a[1] - centre[1]) + n[2]! * (a[2] - centre[2]);
    n = out < 0 ? n.map((x) => -x) : n;
    return n[0]! * (p[0] - a[0]) + n[1]! * (p[1] - a[1]) + n[2]! * (p[2] - a[2]) < -1e-9;
  });
};

it.each(variants)('threads the eye line through the rear aperture and the front ring: $muzzle', ({ file }) => {
  const resolved = load(file);
  const sightY = (family: string): number => {
    const id = owner(resolved, family);
    const axis = resolved.defs.get(id)!.axes.find((a) => a.kind === 'sight')!;
    return applyPoint(resolved.placed.get(id)!, axis.origin)[1];
  };
  const y = sightY('drum-rear-sight');
  expect(sightY('front-sight')).toBeCloseTo(y, 6);

  for (const family of ['drum-rear-sight', 'front-sight']) {
    const solids = solidsOf(resolved, family);
    const xs = solids.flatMap((s) => s.vertices.map((v) => v[0]));
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const blocked = (yy: number): boolean => {
      for (let x = x0; x <= x1; x += 0.05) {
        if (solids.some((s) => strictlyInside(s, [x, yy, 0]))) {
          return true;
        }
      }
      return false;
    };
    expect(blocked(y), `${family} blocks the eye line`).toBe(false);
    const surrounds = (sign: number): boolean =>
      Array.from({ length: 80 }, (_, k) => 0.0125 + k * 0.05).some((t) => blocked(y + sign * t));
    expect(surrounds(1) && surrounds(-1), `${family} has no material around the eye line`).toBe(true);
  }
});

it('derives the threaded breech from the cited barrel span', () => {
  const { breechU, citedLengthU, tipU } = COMPACT_SMG_PROPORTIONS.barrel;
  expect(tipU.threaded - breechU).toBe(citedLengthU);
});

it.each(variants)('spans the breech and tip for the muzzle variant: $muzzle', ({ file, muzzle }) => {
  const resolved = load(file);
  const barrel = owner(resolved, 'barrel');
  const definition = resolved.defs.get(barrel)!;
  const transform = resolved.placed.get(barrel)!;
  const anchor = GUN_ANCHORS.barrel!.anchors({}, definition).muzzle!;
  const tip: Vec3 = applyPoint(transform, anchor.position);
  const breech = applyPoint(transform, definition.ports.find(({ id }) => id === 'rear')!.pos);
  const expectedTip = COMPACT_SMG_PROPORTIONS.barrel.tipU[muzzle];
  const expectedBreech = COMPACT_SMG_PROPORTIONS.barrel.breechU;
  expect(breech[0]).toBeCloseTo(expectedBreech, 6);
  expect(tip[0]).toBeCloseTo(expectedTip, 6);
  expect(tip[0] - breech[0]).toBeCloseTo(expectedTip - expectedBreech, 6);
});
