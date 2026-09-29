import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generate } from '../src/core/generate.ts';
import { applyPoint, type Transform, type Vec3 } from '../src/core/math.ts';
import type { Assembly, Solid } from '../src/core/schema.ts';
import { validate } from '../src/core/validate.ts';
import { GUN_ANCHORS } from '../src/gun/anchorData.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { FAMILIES, FIRING_GRIP } from '../src/gun/parts.ts';
import { boltRifle } from '../src/gun/templates.ts';
import { loadFixture, variant } from './helpers.ts';

const design = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'designs', 'archetype-awm.json'), 'utf8')) as {
  assembly: Parameters<typeof validate>[0];
};

const vertices = (solid: Solid): Vec3[] => {
  if (solid.kind === 'box') {
    const { center, half } = solid.box;
    return [-1, 1].flatMap((x) =>
      [-1, 1].flatMap((y) =>
        [-1, 1].map((z) => [center[0] + x * half[0], center[1] + y * half[1], center[2] + z * half[2]] as const),
      ),
    );
  }
  return solid.profile.flatMap(([x, y]) => solid.z.map((z) => [x, y, z] as const));
};

const bounds = (solid: Solid): readonly (readonly [number, number])[] =>
  [0, 1, 2].map((axis) => {
    const coordinates = vertices(solid).map((point) => point[axis]!);
    return [Math.min(...coordinates), Math.max(...coordinates)];
  });

const boundsX = (solid: Solid): readonly [number, number] => bounds(solid)[0]!;

const worldBounds = (solids: readonly Solid[], transform: Transform, axis: 0 | 1 | 2): readonly [number, number] => {
  const values = solids.flatMap((solid) => vertices(solid).map((point) => applyPoint(transform, point)[axis]));
  return [Math.min(...values), Math.max(...values)];
};

const worldBoundsX = (solids: readonly Solid[], transform: Transform): readonly [number, number] =>
  worldBounds(solids, transform, 0);

const solidsTouch = (a: Solid, b: Solid): boolean =>
  bounds(a).every(([a0, a1], axis) => {
    const [b0, b1] = bounds(b)[axis]!;
    return a0 <= b1 + 1e-8 && b0 <= a1 + 1e-8;
  });

const oneConnectedSolidSet = (solids: readonly Solid[]): boolean => {
  const connected = new Set([0]);
  let frontier = [0];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const current of frontier) {
      for (const [candidate, solid] of solids.entries()) {
        if (!connected.has(candidate) && solidsTouch(solids[current]!, solid)) {
          connected.add(candidate);
          next.push(candidate);
        }
      }
    }
    frontier = next;
  }
  return connected.size === solids.length;
};

const gripGuardGap = (assembly: Assembly, gripFamily: 'grip' | 'stock'): number => {
  const report = validate(assembly, gunDomain);
  const lowerId = Object.keys(assembly.parts).find((id) => assembly.parts[id]!.family === 'lower')!;
  const gripId = Object.keys(assembly.parts).find((id) => assembly.parts[id]!.family === gripFamily)!;
  const lowerDef = report.resolved.defs.get(lowerId)!;
  const gripDef = report.resolved.defs.get(gripId)!;
  const guard = lowerDef.solids.find((solid) => solid.id === 'trigger-guard-rear')!;
  const grip = gripFamily === 'stock' ? gripDef.solids.filter((solid) => solid.id === 'grip') : gripDef.solids;
  const [guardRear] = worldBoundsX([guard], report.resolved.placed.get(lowerId)!);
  const [, gripFront] = worldBoundsX(grip, report.resolved.placed.get(gripId)!);
  return guardRear - gripFront;
};

const inside = (solid: Solid, x: number, y: number, z: number): boolean => {
  if (solid.kind === 'box') {
    return [x, y, z].every((value, axis) => Math.abs(value - solid.box.center[axis]!) <= solid.box.half[axis]!);
  }
  if (z < solid.z[0] || z > solid.z[1]) {
    return false;
  }
  let result = false;
  for (let i = 0; i < solid.profile.length; i += 1) {
    const j = (i + solid.profile.length - 1) % solid.profile.length;
    const [xi, yi] = solid.profile[i]!;
    const [xj, yj] = solid.profile[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      result = !result;
    }
  }
  return result;
};

describe('thumbhole stock and AWM design', () => {
  it('builds a real opening while retaining a connected stock and an interior firing-hand anchor', () => {
    const stock = FAMILIES.stock!.build({ length: 'L', style: 'thumbhole' });
    expect(stock.tags).toContain(FIRING_GRIP);
    const aperture = [-1.25, -5.99, 0] as const;
    expect(stock.solids.some((solid) => inside(solid, ...aperture))).toBe(false);
    expect(oneConnectedSolidSet(stock.solids)).toBe(true);
    const rearPost = stock.solids.find((solid) => solid.id === 'thumbhole-rear-post')!;
    expect(rearPost.kind).toBe('extruded-polygon');
    if (rearPost.kind !== 'extruded-polygon') {
      throw new Error('Expected a thumbhole rear post profile.');
    }
    const gripX = boundsX(stock.solids.find((solid) => solid.id === 'grip')!);
    const rearX = Math.max(...rearPost.profile.map(([x]) => x));
    expect(gripX[0] - rearX).toBe(4);
    const butt = stock.solids.find((solid) => solid.id === 'butt')!;
    expect(Math.min(...vertices(butt).map(([x]) => x))).toBe(-22);
    const grip = stock.solids.find((solid) => solid.id === 'grip')!;
    const hold = GUN_ANCHORS.stock!.anchors({ length: 'L', style: 'thumbhole' }, stock).hold!;
    expect(inside(grip, ...hold.position)).toBe(true);
    expect(stock.ports.find((port) => port.id === 'front')?.pos).toEqual([0, 0, 0]);
  });

  it('keeps the measured AR grip-to-guard clearance when the thumbhole moves forward', () => {
    const arGap = gripGuardGap(loadFixture('archetype-ar'), 'grip');
    expect(arGap).toBeCloseTo(0, 6);
    const boltOverride = variant('archetype-bolt-rifle', (draft) => {
      draft.parts.stock!.params!.style = 'thumbhole';
      draft.parts.lower!.params!.layout = 'thumbhole';
    });
    for (const assembly of [design.assembly, boltOverride]) {
      expect(validate(assembly, gunDomain).issues).toEqual([]);
      const gap = gripGuardGap(assembly, 'stock');
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(0.25);
    }
  });

  it('allows a thumbhole on the existing bolt-rifle template without a separate grip', () => {
    const stockChoice = boltRifle.slots.find((slot) => slot.id === 'stock')?.params?.style;
    const lowerChoice = boltRifle.slots.find((slot) => slot.id === 'lower')?.params?.layout;
    expect(stockChoice).toContain('thumbhole');
    expect(lowerChoice).toEqual({
      when: { part: 'stock', param: 'style', equals: 'thumbhole' },
      onMatch: 'thumbhole',
      onMismatch: 'conventional',
    });
    const existing = variant('archetype-bolt-rifle', (draft) => {
      draft.parts.stock!.params!.style = 'thumbhole';
      draft.parts.lower!.params!.layout = 'thumbhole';
    });
    expect(validate(existing, gunDomain).issues).toEqual([]);
    const mismatched = variant('archetype-bolt-rifle', (draft) => {
      draft.parts.stock!.params!.style = 'thumbhole';
    });
    expect(validate(mismatched, gunDomain).issues.map(({ rule }) => rule)).toContain('thumbhole-grip-match');
  });

  it('keeps every size at least the former L height while varying buttstock length', () => {
    const lengths = { S: 10, M: 16, L: 22 } as const;
    for (const [size, length] of Object.entries(lengths) as [keyof typeof lengths, number][]) {
      const stock = FAMILIES.stock!.build({ length: size, style: 'thumbhole' });
      const all = stock.solids.flatMap(vertices);
      const ys = all.map(([, y]) => y);
      expect(Math.max(...ys) - Math.min(...ys), size).toBe(7.74);
      const butt = stock.solids.find((solid) => solid.id === 'butt')!;
      expect(Math.min(...vertices(butt).map(([x]) => x)), size).toBe(-length);
      expect(stock.ports.find((port) => port.id === 'front')?.pos, size).toEqual([0, 0, 0]);
    }
  });

  it('mates the full thumbhole lower rear face to stock material in world space', () => {
    for (const assembly of [
      design.assembly,
      variant('archetype-bolt-rifle', (draft) => {
        draft.parts.stock!.params!.style = 'thumbhole';
        draft.parts.lower!.params!.layout = 'thumbhole';
      }),
    ]) {
      const report = validate(assembly, gunDomain);
      const stockId = Object.keys(assembly.parts).find((id) => assembly.parts[id]!.family === 'stock')!;
      const lowerId = Object.keys(assembly.parts).find((id) => assembly.parts[id]!.family === 'lower')!;
      const stockDef = report.resolved.defs.get(stockId)!;
      const lowerDef = report.resolved.defs.get(lowerId)!;
      const upperBar = stockDef.solids.find((solid) => solid.id === 'thumbhole-top')!;
      const lowerRear = lowerDef.solids.find((solid) => solid.id === 'frame-rear')!;
      const stockTransform = report.resolved.placed.get(stockId)!;
      const lowerTransform = report.resolved.placed.get(lowerId)!;
      const lowerX = worldBounds([lowerRear], lowerTransform, 0);
      const stockX = worldBounds([upperBar], stockTransform, 0);
      const lowerY = worldBounds([lowerRear], lowerTransform, 1);
      const stockY = worldBounds([upperBar], stockTransform, 1);
      const lowerZ = worldBounds([lowerRear], lowerTransform, 2);
      const stockZ = worldBounds([upperBar], stockTransform, 2);
      expect(lowerX[0]).toBe(-16);
      expect(stockX[1]).toBe(-16);
      expect(lowerX[0]).toBe(stockX[1]);
      expect(lowerY).toEqual([-4, -2.5]);
      expect(stockY[0]).toBeLessThanOrEqual(lowerY[0]);
      expect(stockY[1]).toBeGreaterThanOrEqual(lowerY[1]);
      expect(stockZ[0]).toBeCloseTo(lowerZ[0], 6);
      expect(stockZ[1]).toBeCloseTo(lowerZ[1], 6);
      expect(stockDef.solids.some((solid) => inside(solid, 2, -3.75, 0))).toBe(false);
    }
  });

  it('generates a thumbhole lower only with a thumbhole bolt-rifle stock', () => {
    for (let seed = 1; seed <= 32; seed += 1) {
      const assembly = generate(boltRifle, gunDomain, seed);
      const thumbhole = assembly.parts.stock?.params?.style === 'thumbhole';
      expect(assembly.parts.lower?.params?.layout === 'thumbhole').toBe(thumbhole);
    }
  });

  it('validates the AWM design with its thumbhole stock as the only grip', () => {
    const loaded = loadGunDesign(
      JSON.stringify({
        format: 1,
        template: 'bolt-rifle-thumbhole',
        assembly: design.assembly,
        locks: { params: {}, optionalParts: [] },
        status: 'published',
      }),
    );
    expect(loaded.ok).toBe(true);
    const report = validate(design.assembly, gunDomain);
    expect(report.issues).toEqual([]);
    expect(design.assembly.parts.grip).toBeUndefined();
    expect(design.assembly.parts.lower?.params?.layout).toBe('thumbhole');
    expect(design.assembly.parts.barrel?.params?.profile).toBe('heavy');
  });
});
